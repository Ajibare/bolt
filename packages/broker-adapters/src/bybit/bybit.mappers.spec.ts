import { describe, expect, it } from "vitest";
import { InvalidOrderRequestError } from "../errors.js";
import type { BybitOrderItem, BybitPositionItem } from "./types.js";
import {
  buildQueryString,
  floorToStep,
  mapOrderItem,
  mapOrderSide,
  mapOrderStatus,
  mapPosition,
  mapWallet,
  normalizeQuantity,
  roundToStep,
} from "./mappers.js";

const baseOrderItem = (overrides: Partial<BybitOrderItem> = {}): BybitOrderItem => ({
  orderId: "order-1",
  orderLinkId: "client-1",
  symbol: "BTCUSDT",
  side: "Buy",
  orderType: "Market",
  orderStatus: "Filled",
  qty: "0.5",
  price: "0",
  cumExecQty: "0.5",
  avgPrice: "64000",
  stopLoss: "62000",
  takeProfit: "",
  reduceOnly: false,
  rejectReason: "",
  timeInForce: "Ioc",
  createdTime: "1700000000000",
  updatedTime: "1700000001000",
  ...overrides,
});

describe("mapOrderStatus", () => {
  it.each([
    ["Created", "CREATED"],
    ["New", "ACCEPTED"],
    ["PartiallyFilled", "PARTIALLY_FILLED"],
    ["Filled", "FILLED"],
    ["Canceled", "CANCELLED"],
    ["PartiallyFilledCanceled", "CANCELLED"],
    ["Deactivated", "CANCELLED"],
    ["PendingCancel", "CANCELLED"],
    ["Rejected", "REJECTED"],
    ["Untriggered", "FAILED"],
    ["Triggered", "FAILED"],
  ] as const)("maps %s -> %s", (raw, expected) => {
    expect(mapOrderStatus(raw)).toBe(expected);
  });

  it("fails loudly on an unknown status", () => {
    expect(() => mapOrderStatus("SomethingNew")).toThrow(/Unknown Bybit order status/);
  });
});

describe("mapOrderSide", () => {
  it("maps buy/sell", () => {
    expect(mapOrderSide("buy")).toBe("Buy");
    expect(mapOrderSide("sell")).toBe("Sell");
  });
});

describe("mapOrderItem", () => {
  it("maps a filled market order", () => {
    const order = mapOrderItem(baseOrderItem());
    expect(order).toMatchObject({
      id: "order-1",
      clientOrderId: "client-1",
      side: "buy",
      type: "market",
      symbol: "BTCUSDT",
      quantity: "0.5",
      filledQuantity: "0.5",
      avgFillPrice: "64000",
      stopLoss: "62000",
      takeProfit: undefined,
      status: "FILLED",
      createdAt: 1700000000000,
    });
  });

  it("keeps avgFillPrice null until there is a fill and price", () => {
    const order = mapOrderItem(baseOrderItem({ cumExecQty: "0", avgPrice: "" }));
    expect(order.avgFillPrice).toBeNull();
    expect(order.filledQuantity).toBe("0");
  });

  it("carries the rejection reason", () => {
    const order = mapOrderItem(
      baseOrderItem({ orderStatus: "Rejected", rejectReason: "Insufficient margin" }),
    );
    expect(order.status).toBe("REJECTED");
    expect(order.reason).toContain("Insufficient margin");
  });
});

describe("mapPosition", () => {
  const item: BybitPositionItem = {
    symbol: "BTCUSDT",
    side: "Buy",
    size: "1.5",
    avgPrice: "63000",
    positionStatus: "Normal",
    unrealisedPnl: "150",
    realisedPnl: "0",
    stopLoss: "60000",
    takeProfit: "",
    positionIdx: 0,
  };
  it("signs long positions positive", () => {
    expect(mapPosition(item).quantity).toBe("1.5");
    expect(mapPosition(item).stopLoss).toBe("60000");
  });
  it("signs short positions negative", () => {
    expect(mapPosition({ ...item, side: "Sell" }).quantity).toBe("-1.5");
  });
});

describe("mapWallet", () => {
  it("derives used from wallet balance minus withdrawable", () => {
    const state = mapWallet([
      {
        coin: "USDT",
        walletBalance: "1000",
        availableToWithdraw: "800",
        equity: "1010",
        locked: "0",
      },
    ]);
    expect(state.balances[0]).toEqual({
      asset: "USDT",
      free: "800",
      used: "200",
      total: "1000",
    });
  });
});

describe("quantity/price normalization", () => {
  it("floors to the lot step", () => {
    expect(floorToStep("0.1234", "0.001")).toBe("0.123");
    expect(floorToStep("1.2345", "0.1")).toBe("1.2");
  });
  it("rounds prices to the tick step", () => {
    expect(roundToStep("123.456", "0.5")).toBe("123.5");
  });
  it("rejects a quantity that normalizes to zero", () => {
    expect(() => normalizeQuantity("0.0001", "0.001", "BTCUSDT")).toThrow(InvalidOrderRequestError);
  });
  it("accepts an exact lot-size quantity", () => {
    expect(normalizeQuantity("0.5", "0.001", "BTCUSDT")).toBe("0.5");
  });
});

describe("buildQueryString", () => {
  it("sorts keys and encodes values", () => {
    expect(buildQueryString({ category: "linear", symbol: "BTCUSDT", orderId: "x y" })).toBe(
      "category=linear&orderId=x%20y&symbol=BTCUSDT",
    );
  });
});
