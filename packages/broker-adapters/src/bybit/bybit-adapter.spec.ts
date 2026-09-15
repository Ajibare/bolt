import { describe, expect, it } from "vitest";
import { BrokerError, InvalidOrderRequestError } from "../errors.js";
import { BybitAdapter } from "./bybit-adapter.js";
import type { FetchLike, FetchLikeResponse } from "./types.js";

interface RecordedCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

function createMockAdapter() {
  const calls: RecordedCall[] = [];
  const responses: FetchLikeResponse[] = [];
  const respond = (): Promise<FetchLikeResponse> => {
    const next = responses.shift();
    if (!next) {
      return Promise.reject(new Error("unexpected fetch call"));
    }
    return Promise.resolve(next);
  };
  const fetchImpl: FetchLike = async (url: string, init) => {
    calls.push({
      url,
      method: init?.method ?? "GET",
      headers: init?.headers ?? {},
      body: init?.body,
    });
    return respond();
  };
  const app = new BybitAdapter({
    apiKey: "test-api-key",
    apiSecret: "test-api-secret",
    environment: "demo",
    fetchImpl,
  });
  const respondWith = (body: unknown, status = 200): void => {
    responses.push({
      ok: status >= 200 && status < 300,
      status,
      statusText: String(status),
      json: async (): Promise<unknown> => body,
    });
  };
  return { app, calls, respondWith };
}

describe("BybitAdapter", () => {
  it("fails closed when credentials are missing", () => {
    expect(() => new BybitAdapter({ apiKey: "", apiSecret: "secret" })).toThrow(BrokerError);
    expect(() => new BybitAdapter({ apiKey: "key", apiSecret: "  " })).toThrow(BrokerError);
  });

  it("rejects an unknown environment", () => {
    expect(
      () =>
        new BybitAdapter({
          apiKey: "key",
          apiSecret: "secret",
          environment: "production" as never,
        }),
    ).toThrow(BrokerError);
  });

  describe("placeOrder", () => {
    it("submits a signed market order and returns SUBMITTED", async () => {
      const { app, calls, respondWith } = createMockAdapter();
      respondWith({
        retCode: 0,
        retMsg: "OK",
        result: { orderId: "bybit-1", orderLinkId: "client-buy-1" },
        time: 1,
      });

      const order = await app.placeOrder({
        side: "buy",
        type: "market",
        symbol: "BTCUSDT",
        quantity: "0.5",
        stopLoss: "60000",
        takeProfit: "70000",
        clientOrderId: "client-buy-1",
      });

      expect(calls).toHaveLength(1);
      const call = calls[0];
      expect(call.method).toBe("POST");
      expect(call.url).toBe("https://api-demo.bybit.com/v5/order/create");
      expect(call.headers["X-BAPI-API-KEY"]).toBe("test-api-key");
      expect(call.headers["X-BAPI-SIGN"]).toMatch(/^[0-9a-f]{64}$/);
      expect(JSON.parse(call.body ?? "{}")).toEqual({
        category: "linear",
        symbol: "BTCUSDT",
        side: "Buy",
        orderType: "Market",
        qty: "0.5",
        timeInForce: "Ioc",
        orderLinkId: "client-buy-1",
        stopLoss: "60000",
        takeProfit: "70000",
        positionIdx: "0",
      });
      expect(order).toMatchObject({
        id: "bybit-1",
        clientOrderId: "client-buy-1",
        status: "SUBMITTED",
        filledQuantity: "0",
        avgFillPrice: null,
      });
    });

    it("normalizes quantity to the lot size", async () => {
      const { app, calls, respondWith } = createMockAdapter();
      respondWith({
        retCode: 0,
        retMsg: "OK",
        result: { orderId: "bybit-2", orderLinkId: "c" },
        time: 1,
      });

      await app.placeOrder({
        side: "buy",
        type: "market",
        symbol: "SOLUSDT",
        quantity: "1.2345",
        clientOrderId: "c",
      });

      expect(JSON.parse(calls[0].body ?? "{}").qty).toBe("1.2");
    });

    it("rounds the price for limit orders and uses GTC", async () => {
      const { app, calls, respondWith } = createMockAdapter();
      respondWith({
        retCode: 0,
        retMsg: "OK",
        result: { orderId: "bybit-3", orderLinkId: "c" },
        time: 1,
      });

      await app.placeOrder({
        side: "sell",
        type: "limit",
        symbol: "BTCUSDT",
        quantity: "0.5",
        price: "64000.06",
        clientOrderId: "c",
      });

      const body = JSON.parse(calls[0].body ?? "{}");
      expect(body.price).toBe("64000.1");
      expect(body.timeInForce).toBe("Gtc");
      expect(body.side).toBe("Sell");
    });

    it("rejects a quantity that floors to zero", async () => {
      const { app } = createMockAdapter();
      await expect(
        app.placeOrder({
          side: "buy",
          type: "market",
          symbol: "BTCUSDT",
          quantity: "0.0001",
          clientOrderId: "c",
        }),
      ).rejects.toThrow(InvalidOrderRequestError);
    });

    it("rejects unsupported symbols and missing clientOrderId", async () => {
      const { app } = createMockAdapter();
      await expect(
        app.placeOrder({
          side: "buy",
          type: "market",
          symbol: "DOGEUSDT",
          quantity: "1",
          clientOrderId: "c",
        }),
      ).rejects.toThrow(InvalidOrderRequestError);
      await expect(
        app.placeOrder({
          side: "buy",
          type: "market",
          symbol: "SOLUSDT",
          quantity: "1",
          clientOrderId: "",
        }),
      ).rejects.toThrow(InvalidOrderRequestError);
    });

    it("surfaces provider errors as BrokerError", async () => {
      const { app, respondWith } = createMockAdapter();
      respondWith({ retCode: 10001, retMsg: "Invalid request", result: {}, time: 1 });
      await expect(
        app.placeOrder({
          side: "buy",
          type: "market",
          symbol: "SOLUSDT",
          quantity: "1",
          clientOrderId: "c",
        }),
      ).rejects.toThrow(BrokerError);
    });
  });

  describe("cancelOrder", () => {
    it("looks up the symbol, then cancels via a POST body", async () => {
      const { app, calls, respondWith } = createMockAdapter();
      respondWith({
        retCode: 0,
        retMsg: "OK",
        result: {
          list: [
            {
              orderId: "bybit-1",
              orderStatus: "New",
              side: "Buy",
              symbol: "SOLUSDT",
              orderType: "Market",
              qty: "1",
              price: "0",
              cumExecQty: "0",
              avgPrice: "0",
              stopLoss: "",
              takeProfit: "",
              reduceOnly: false,
              rejectReason: "",
              timeInForce: "Ioc",
              orderLinkId: "client-buy-1",
              createdTime: "1700000000000",
              updatedTime: "1700000000000",
            },
          ],
        },
        time: 1,
      });
      respondWith({ retCode: 0, retMsg: "OK", result: { orderId: "bybit-1" }, time: 1 });

      await app.cancelOrder("bybit-1");

      expect(calls).toHaveLength(2);
      expect(calls[0].method).toBe("GET");
      expect(calls[0].url).toContain("/v5/order/realtime?category=linear&orderId=bybit-1");
      expect(calls[1].method).toBe("POST");
      expect(calls[1].url).toBe("https://api-demo.bybit.com/v5/order/cancel");
      expect(JSON.parse(calls[1].body ?? "{}")).toEqual({
        category: "linear",
        symbol: "SOLUSDT",
        orderId: "bybit-1",
      });
    });
  });

  describe("getOrder", () => {
    it("maps a filled order", async () => {
      const { app, respondWith } = createMockAdapter();
      respondWith({
        retCode: 0,
        retMsg: "OK",
        result: {
          list: [
            {
              orderId: "bybit-9",
              orderLinkId: "c",
              symbol: "BTCUSDT",
              side: "Buy",
              orderType: "Market",
              orderStatus: "Filled",
              qty: "0.5",
              price: "0",
              cumExecQty: "0.5",
              avgPrice: "64000",
              stopLoss: "",
              takeProfit: "",
              reduceOnly: false,
              rejectReason: "",
              timeInForce: "Ioc",
              createdTime: "1700000000000",
              updatedTime: "1700000000100",
            },
          ],
        },
        time: 1,
      });

      const order = await app.getOrder("bybit-9");
      expect(order).toMatchObject({
        id: "bybit-9",
        status: "FILLED",
        filledQuantity: "0.5",
        avgFillPrice: "64000",
      });
    });

    it("returns null when the order does not exist", async () => {
      const { app, respondWith } = createMockAdapter();
      respondWith({ retCode: 0, retMsg: "OK", result: { list: [] }, time: 1 });
      expect(await app.getOrder("bybit-nope")).toBeNull();
    });
  });

  describe("getOpenOrders", () => {
    it("only returns non-terminal orders", async () => {
      const { app, respondWith } = createMockAdapter();
      respondWith({
        retCode: 0,
        retMsg: "OK",
        result: {
          list: [
            {
              orderId: "open-1",
              orderStatus: "New",
              side: "Buy",
              symbol: "SOLUSDT",
              orderType: "Market",
              qty: "1",
              price: "0",
              cumExecQty: "0",
              avgPrice: "",
              stopLoss: "",
              takeProfit: "",
              reduceOnly: false,
              rejectReason: "",
              timeInForce: "Ioc",
              orderLinkId: "o1",
              createdTime: "1700000000000",
              updatedTime: "1700000000000",
            },
            {
              orderId: "filled-1",
              orderStatus: "Filled",
              side: "Buy",
              symbol: "SOLUSDT",
              orderType: "Market",
              qty: "1",
              price: "0",
              cumExecQty: "1",
              avgPrice: "100",
              stopLoss: "",
              takeProfit: "",
              reduceOnly: false,
              rejectReason: "",
              timeInForce: "Ioc",
              orderLinkId: "f1",
              createdTime: "1700000000000",
              updatedTime: "1700000000000",
            },
          ],
        },
        time: 1,
      });

      const open = await app.getOpenOrders();
      expect(open).toHaveLength(1);
      expect(open[0].id).toBe("open-1");
    });
  });

  describe("getPositions", () => {
    it("maps long and short positions and drops zero-size entries", async () => {
      const { app, respondWith } = createMockAdapter();
      respondWith({
        retCode: 0,
        retMsg: "OK",
        result: {
          list: [
            {
              symbol: "BTCUSDT",
              side: "Buy",
              size: "1.5",
              avgPrice: "63000",
              positionStatus: "Normal",
              unrealisedPnl: "100",
              realisedPnl: "0",
              stopLoss: "60000",
              takeProfit: "",
              positionIdx: 0,
            },
            {
              symbol: "SOLUSDT",
              side: "Sell",
              size: "2",
              avgPrice: "100",
              positionStatus: "Normal",
              unrealisedPnl: "-5",
              realisedPnl: "0",
              stopLoss: "",
              takeProfit: "",
              positionIdx: 0,
            },
            {
              symbol: "ETHUSDT",
              side: "Buy",
              size: "0",
              avgPrice: "0",
              positionStatus: "Normal",
              unrealisedPnl: "0",
              realisedPnl: "0",
              stopLoss: "",
              takeProfit: "",
              positionIdx: 0,
            },
          ],
        },
        time: 1,
      });

      const positions = await app.getPositions();
      expect(positions.map((p) => p.symbol)).toEqual(["BTCUSDT", "SOLUSDT"]);
      expect(positions[0].quantity).toBe("1.5");
      expect(positions[1].quantity).toBe("-2");
    });
  });

  describe("getAccountState", () => {
    it("maps the unified wallet balance", async () => {
      const { app, respondWith } = createMockAdapter();
      respondWith({
        retCode: 0,
        retMsg: "OK",
        result: {
          list: [
            {
              coin: [
                {
                  coin: "USDT",
                  walletBalance: "1000",
                  availableToWithdraw: "800",
                  equity: "1010",
                  locked: "0",
                },
              ],
            },
          ],
        },
        time: 1,
      });

      const state = await app.getAccountState();
      expect(state.balances[0]).toEqual({ asset: "USDT", free: "800", used: "200", total: "1000" });
    });
  });
});
