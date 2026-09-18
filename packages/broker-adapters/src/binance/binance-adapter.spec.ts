import { describe, expect, it } from "vitest";
import { BrokerError, InvalidOrderRequestError } from "../errors.js";
import { BinanceAdapter } from "./binance-adapter.js";
import type { FetchLike, FetchLikeResponse } from "./types.js";

interface RecordedCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

const BASE_URL = "https://testnet.binance.vision";
const NOW = 1700000000000;

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
  const app = new BinanceAdapter({
    apiKey: "test-api-key",
    apiSecret: "test-api-secret",
    environment: "testnet",
    fetchImpl,
    now: () => NOW,
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

function orderResponse(overrides: Record<string, unknown> = {}) {
  return {
    symbol: "BTCUSDT",
    orderId: 1001,
    orderListId: -1,
    clientOrderId: "bolt-1",
    transactTime: NOW,
    price: "0.00000000",
    origQty: "0.5",
    executedQty: "0.5",
    cummulativeQuoteQty: "32000.00000000",
    status: "FILLED",
    timeInForce: "GTC",
    type: "MARKET",
    side: "BUY",
    ...overrides,
  };
}

describe("BinanceAdapter", () => {
  it("fails closed when credentials are missing", () => {
    expect(() => new BinanceAdapter({ apiKey: "", apiSecret: "secret" })).toThrow(BrokerError);
    expect(() => new BinanceAdapter({ apiKey: "key", apiSecret: "  " })).toThrow(BrokerError);
  });

  it("rejects an unknown environment", () => {
    expect(
      () =>
        new BinanceAdapter({
          apiKey: "key",
          apiSecret: "secret",
          environment: "production" as never,
        }),
    ).toThrow(BrokerError);
  });

  describe("placeOrder", () => {
    it("submits an HMAC-signed order and maps the immediate fill", async () => {
      const { app, calls, respondWith } = createMockAdapter();
      respondWith(orderResponse());

      const order = await app.placeOrder({
        side: "buy",
        type: "market",
        symbol: "BTCUSDT",
        quantity: "0.5",
        clientOrderId: "bolt-1",
      });

      expect(calls).toHaveLength(1);
      const call = calls[0];
      expect(call.method).toBe("POST");
      expect(call.url.startsWith(`${BASE_URL}/api/v3/order?`)).toBe(true);
      expect(call.headers["X-MBX-APIKEY"]).toBe("test-api-key");
      expect(call.url).toContain("timestamp=1700000000000");
      expect(call.url).toContain("recvWindow=5000");
      expect(call.url).toContain("signature=");
      const signature = call.url.split("signature=")[1];
      expect(signature).toMatch(/^[0-9a-f]{64}$/);
      // Params must be sorted and URL-encoded before signing.
      expect(call.url).toContain("newClientOrderId=bolt-1");
      expect(call.url).toContain("quantity=0.5");
      expect(call.url).toContain("side=BUY");
      expect(call.url).toContain("symbol=BTCUSDT");
      expect(call.url).toContain("type=MARKET");

      expect(order).toMatchObject({
        id: "1001",
        clientOrderId: "bolt-1",
        side: "buy",
        status: "FILLED",
        filledQuantity: "0.5",
        avgFillPrice: "64000",
        fees: "0",
      });
    });

    it("signs the sorted query deterministically (HMAC-SHA256)", () => {
      // Re-derive the expected signature over the sorted params so accidental
      // reordering (which would break the server) is caught.
      const { app, calls, respondWith } = createMockAdapter();
      respondWith(orderResponse({ status: "NEW", executedQty: "0" }));

      void app.placeOrder({
        side: "buy",
        type: "market",
        symbol: "BTCUSDT",
        quantity: "0.5",
        clientOrderId: "bolt-1",
      });

      const query = calls[0].url.split("?")[1].split("&signature=")[0];
      const sorted = query.split("&").every((pair, i, arr) => {
        return i === 0 || arr[i - 1] <= pair;
      });
      expect(sorted).toBe(true);
    });

    it("normalizes quantity to the lot size", async () => {
      const { app, calls, respondWith } = createMockAdapter();
      respondWith(orderResponse({ symbol: "SOLUSDT", orderId: 2001 }));

      await app.placeOrder({
        side: "buy",
        type: "market",
        symbol: "SOLUSDT",
        quantity: "1.2345",
        clientOrderId: "c",
      });

      expect(calls[0].url).toContain("quantity=1.23");
    });

    it("rounds the price for limit orders and uses GTC", async () => {
      const { app, calls, respondWith } = createMockAdapter();
      respondWith(
        orderResponse({
          type: "LIMIT",
          price: "64000.10",
          executedQty: "0",
          cummulativeQuoteQty: "0",
          status: "NEW",
        }),
      );

      await app.placeOrder({
        side: "sell",
        type: "limit",
        symbol: "BTCUSDT",
        quantity: "0.5",
        price: "64000.066",
        clientOrderId: "c",
      });

      const url = calls[0].url;
      expect(url).toContain("price=64000.07");
      expect(url).toContain("timeInForce=GTC");
      expect(url).toContain("side=SELL");
    });

    it("rejects a quantity that floors to zero", async () => {
      const { app } = createMockAdapter();
      await expect(
        app.placeOrder({
          side: "buy",
          type: "market",
          symbol: "BTCUSDT",
          quantity: "0.000001",
          clientOrderId: "c",
        }),
      ).rejects.toThrow(InvalidOrderRequestError);
    });

    it("rejects unsupported symbols, missing clientOrderId, and over-long ids", async () => {
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
      await expect(
        app.placeOrder({
          side: "buy",
          type: "market",
          symbol: "SOLUSDT",
          quantity: "1",
          clientOrderId: "x".repeat(37),
        }),
      ).rejects.toThrow(InvalidOrderRequestError);
    });

    it("rejects stopLoss/takeProfit fail-closed instead of trading unprotected", async () => {
      const { app } = createMockAdapter();
      await expect(
        app.placeOrder({
          side: "buy",
          type: "market",
          symbol: "SOLUSDT",
          quantity: "1",
          stopLoss: "50",
          takeProfit: "150",
          clientOrderId: "c",
        }),
      ).rejects.toThrow(/OCO|unprotected/);
    });

    it("rejects a reduce-only buy (no short side on spot)", async () => {
      const { app } = createMockAdapter();
      await expect(
        app.placeOrder({
          side: "buy",
          type: "market",
          symbol: "SOLUSDT",
          quantity: "1",
          reduceOnly: true,
          clientOrderId: "c",
        }),
      ).rejects.toThrow(/Reduce-only buys/);
    });

    it("accepts a reduce-only sell (spot sells always reduce)", async () => {
      const { app, respondWith } = createMockAdapter();
      respondWith(orderResponse({ side: "SELL", executedQty: "0", status: "NEW" }));
      await expect(
        app.placeOrder({
          side: "sell",
          type: "market",
          symbol: "BTCUSDT",
          quantity: "0.5",
          reduceOnly: true,
          clientOrderId: "c",
        }),
      ).resolves.toMatchObject({ side: "sell" });
    });

    it("surfaces provider errors as BinanceApiError with the code", async () => {
      const { app, respondWith } = createMockAdapter();
      respondWith({ code: -1100, msg: "Illegal characters" }, 400);
      await expect(
        app.placeOrder({
          side: "buy",
          type: "market",
          symbol: "SOLUSDT",
          quantity: "1",
          clientOrderId: "c",
        }),
      ).rejects.toMatchObject({ name: "BinanceApiError", code: -1100 });
    });
  });

  describe("cancelOrder", () => {
    it("requires a symbol (spot APIs are keyed by symbol)", async () => {
      const { app } = createMockAdapter();
      await expect(app.cancelOrder("1001")).rejects.toThrow(/requires a symbol/);
    });

    it("cancels via DELETE with symbol and orderId", async () => {
      const { app, calls, respondWith } = createMockAdapter();
      respondWith(orderResponse({ status: "CANCELED" }));
      await app.cancelOrder("1001", { symbol: "BTCUSDT" });

      expect(calls).toHaveLength(1);
      expect(calls[0].method).toBe("DELETE");
      expect(calls[0].url).toContain("/api/v3/order?");
      expect(calls[0].url).toContain("orderId=1001");
      expect(calls[0].url).toContain("symbol=BTCUSDT");
    });
  });

  describe("getOrder", () => {
    it("requires a symbol", async () => {
      const { app } = createMockAdapter();
      await expect(app.getOrder("1001")).rejects.toThrow(/requires a symbol/);
    });

    it("maps a query response including a part-filled order", async () => {
      const { app, respondWith } = createMockAdapter();
      respondWith({
        symbol: "BTCUSDT",
        orderId: 1001,
        orderListId: -1,
        clientOrderId: "bolt-1",
        price: "64000.00",
        origQty: "0.5",
        executedQty: "0.2",
        cummulativeQuoteQty: "12800.00",
        status: "PARTIALLY_FILLED",
        timeInForce: "GTC",
        type: "LIMIT",
        side: "BUY",
        stopPrice: "0",
        icebergQty: "0",
        time: NOW,
        updateTime: NOW + 1000,
        isWorking: true,
        origQuoteOrderQty: "0",
      });

      const order = await app.getOrder("1001", { symbol: "BTCUSDT" });

      expect(order).toMatchObject({
        id: "1001",
        status: "PARTIALLY_FILLED",
        filledQuantity: "0.2",
        avgFillPrice: "64000",
        price: "64000.00",
        createdAt: NOW,
        updatedAt: NOW + 1000,
      });
    });

    it("returns null for a missing order (Binance -2013)", async () => {
      const { app, respondWith } = createMockAdapter();
      respondWith({ code: -2013, msg: "Order does not exist." }, 400);
      expect(await app.getOrder("9999", { symbol: "BTCUSDT" })).toBeNull();
    });
  });

  describe("getOpenOrders", () => {
    it("sweeps supported symbols when no symbol is given", async () => {
      const { app, calls, respondWith } = createMockAdapter();
      respondWith([]);
      respondWith([]);
      respondWith([]);

      const open = await app.getOpenOrders();

      expect(open).toEqual([]);
      const symbols = calls.map((call) => call.url.match(/symbol=([A-Z]+)/)?.[1]);
      expect(symbols).toEqual(["BTCUSDT", "ETHUSDT", "SOLUSDT"]);
    });

    it("scopes to one symbol and maps open orders", async () => {
      const { app, respondWith } = createMockAdapter();
      respondWith([
        {
          symbol: "SOLUSDT",
          orderId: 55,
          orderListId: -1,
          clientOrderId: "o1",
          price: "10.00",
          origQty: "3",
          executedQty: "0",
          cummulativeQuoteQty: "0",
          status: "NEW",
          timeInForce: "GTC",
          type: "LIMIT",
          side: "BUY",
          stopPrice: "0",
          icebergQty: "0",
          time: NOW,
          updateTime: NOW,
          isWorking: true,
          origQuoteOrderQty: "0",
        },
      ]);

      const open = await app.getOpenOrders("SOLUSDT");

      expect(open).toHaveLength(1);
      expect(open[0]).toMatchObject({ id: "55", status: "ACCEPTED" });
    });
  });

  describe("getPositions / getAccountState", () => {
    it("derives supported-symbol positions from spot balances", async () => {
      const { app, respondWith } = createMockAdapter();
      respondWith({
        balances: [
          { asset: "BTC", free: "0.5", locked: "0.1" },
          { asset: "SOL", free: "10", locked: "0" },
          { asset: "USDT", free: "9000", locked: "500" },
        ],
      });

      const positions = await app.getPositions();

      expect(positions).toEqual([
        { symbol: "BTCUSDT", quantity: "0.6", avgEntryPrice: "0", fees: "0" },
        { symbol: "SOLUSDT", quantity: "10", avgEntryPrice: "0", fees: "0" },
      ]);
    });

    it("filters positions by symbol and maps the account state", async () => {
      const { app, respondWith } = createMockAdapter();
      respondWith({
        balances: [
          { asset: "BTC", free: "0", locked: "0" },
          { asset: "USDT", free: "1000", locked: "200" },
        ],
      });

      expect(await app.getPositions("BTCUSDT")).toEqual([]);
      respondWith({
        balances: [
          { asset: "BTC", free: "0", locked: "0" },
          { asset: "USDT", free: "1000", locked: "200" },
        ],
      });
      const state = await app.getAccountState();
      expect(state.balances).toEqual([{ asset: "USDT", free: "1000", used: "200", total: "1200" }]);
    });

    it("surfaces account errors as BrokerError without leaking secrets", async () => {
      const { app, respondWith } = createMockAdapter();
      respondWith({ code: -1021, msg: "Timestamp outside recvWindow" }, 400);
      await expect(app.getAccountState()).rejects.toMatchObject({
        name: "BinanceApiError",
        code: -1021,
      });
    });
  });
});
