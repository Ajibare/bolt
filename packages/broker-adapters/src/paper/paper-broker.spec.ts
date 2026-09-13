import { describe, expect, it } from "vitest";
import { PaperBroker } from "./paper-broker.js";

const oracle = (symbol: string, price: string) => ({ symbol, price, timestamp: 1 });

describe("PaperBroker", () => {
  it("starts with the configured cash and no positions", async () => {
    const broker = new PaperBroker({ startingCash: "10000" });
    const state = await broker.getAccountState();
    expect(state.balances[0]).toMatchObject({ asset: "USDT", free: "10000" });
    expect(await broker.getPositions()).toEqual([]);
  });

  it("fills a market buy at the oracle price and reduces cash", async () => {
    const broker = new PaperBroker({ startingCash: "10000" });
    const order = await broker.placeOrder({
      side: "buy",
      type: "market",
      symbol: "BTCUSDT",
      quantity: "1",
      clientOrderId: "buy-1",
    });
    await broker.applyMarket(oracle("BTCUSDT", "100"), order.id);
    const state = await broker.getAccountState();
    expect(state.balances[0].free).toBe("9900");
    const positions = await broker.getPositions("BTCUSDT");
    expect(positions).toHaveLength(1);
    expect(positions[0]).toMatchObject({ quantity: "1", avgEntryPrice: "100" });
  });

  it("is idempotent per clientOrderId", async () => {
    const broker = new PaperBroker({ startingCash: "10000" });
    const a = await broker.placeOrder({
      side: "buy",
      type: "market",
      symbol: "BTCUSDT",
      quantity: "1",
      clientOrderId: "dup",
    });
    const b = await broker.placeOrder({
      side: "buy",
      type: "market",
      symbol: "BTCUSDT",
      quantity: "1",
      clientOrderId: "dup",
    });
    expect(a.id).toBe(b.id);
    const state = await broker.getAccountState();
    expect(state.balances[0].free).toBe("10000");
  });

  it("applies fee and slippage on a market buy", async () => {
    const broker = new PaperBroker({ startingCash: "10000", feeRate: "0.001", slippage: "0.01" });
    const order = await broker.placeOrder({
      side: "buy",
      type: "market",
      symbol: "BTCUSDT",
      quantity: "2",
      clientOrderId: "buy-fee",
    });
    const filled = await broker.applyMarket(oracle("BTCUSDT", "100"), order.id);
    expect(filled.avgFillPrice).toBe("101"); // 100 * (1 + 0.01)
    const state = await broker.getAccountState();
    // 2 * 101 = 202 + fee 0.202
    expect(state.balances[0].free).toBe("9797.798");
  });

  it("rejects a buy beyond buying power", async () => {
    const broker = new PaperBroker({ startingCash: "100" });
    const order = await broker.placeOrder({
      side: "buy",
      type: "market",
      symbol: "BTCUSDT",
      quantity: "2",
      clientOrderId: "toobig",
    });
    const filled = await broker.applyMarket(oracle("BTCUSDT", "100"), order.id);
    expect(filled.status).toBe("REJECTED");
    expect(filled.reason).toMatch(/buying power/i);
    expect((await broker.getAccountState()).balances[0].free).toBe("100");
  });

  it("rests a buy limit when the market is above it, then fills when traded through", async () => {
    const broker = new PaperBroker({ startingCash: "10000" });
    const order = await broker.placeOrder({
      side: "buy",
      type: "limit",
      symbol: "BTCUSDT",
      quantity: "1",
      price: "90",
      clientOrderId: "lim",
    });
    // market above limit -> rests
    await broker.applyMarket(oracle("BTCUSDT", "95"), order.id);
    expect((await broker.getOrder(order.id))?.status).toBe("ACCEPTED");
    // market drops to limit -> fills at the limit price
    await broker.applyMarket(oracle("BTCUSDT", "90"), order.id);
    const filled = await broker.getOrder(order.id);
    expect(filled?.status).toBe("FILLED");
    expect(filled?.avgFillPrice).toBe("90");
    expect((await broker.getAccountState()).balances[0].free).toBe("9910");
  });

  it("rejects selling more than the current position", async () => {
    const broker = new PaperBroker({ startingCash: "10000" });
    const buy = await broker.placeOrder({
      side: "buy",
      type: "market",
      symbol: "BTCUSDT",
      quantity: "1",
      clientOrderId: "b",
    });
    await broker.applyMarket(oracle("BTCUSDT", "100"), buy.id);
    const sell = await broker.placeOrder({
      side: "sell",
      type: "market",
      symbol: "BTCUSDT",
      quantity: "2",
      clientOrderId: "s",
    });
    const result = await broker.applyMarket(oracle("BTCUSDT", "110"), sell.id);
    expect(result.status).toBe("REJECTED");
    expect(result.reason).toMatch(/position to sell/i);
  });

  it("closes a position and credits cash on a sell at a profit", async () => {
    const broker = new PaperBroker({ startingCash: "10000", feeRate: "0.001" });
    const buy = await broker.placeOrder({
      side: "buy",
      type: "market",
      symbol: "BTCUSDT",
      quantity: "1",
      clientOrderId: "b",
    });
    await broker.applyMarket(oracle("BTCUSDT", "100"), buy.id);
    const sell = await broker.placeOrder({
      side: "sell",
      type: "market",
      symbol: "BTCUSDT",
      quantity: "1",
      clientOrderId: "s",
    });
    await broker.applyMarket(oracle("BTCUSDT", "110"), sell.id);
    expect(await broker.getPositions()).toEqual([]);
    const state = await broker.getAccountState();
    // 10000 - (100 + 0.1) + (110 - 0.11) = 10009.79
    expect(state.balances[0].free).toBe("10009.79");
  });

  it("maintains average entry when adding to a position", async () => {
    const broker = new PaperBroker({ startingCash: "10000" });
    const a = await broker.placeOrder({
      side: "buy",
      type: "market",
      symbol: "BTCUSDT",
      quantity: "1",
      clientOrderId: "a",
    });
    await broker.applyMarket(oracle("BTCUSDT", "100"), a.id);
    const b = await broker.placeOrder({
      side: "buy",
      type: "market",
      symbol: "BTCUSDT",
      quantity: "1",
      clientOrderId: "b",
    });
    await broker.applyMarket(oracle("BTCUSDT", "120"), b.id);
    const pos = await broker.getPositions("BTCUSDT");
    expect(pos[0]).toMatchObject({ quantity: "2", avgEntryPrice: "110" });
  });

  it("only fills orders for the matching oracle symbol", async () => {
    const broker = new PaperBroker({ startingCash: "10000" });
    const order = await broker.placeOrder({
      side: "buy",
      type: "market",
      symbol: "BTCUSDT",
      quantity: "1",
      clientOrderId: "wrong-oracle",
    });
    // Oracle for a different symbol -> fails cleanly, cash unchanged.
    const result = await broker.applyMarket(oracle("ETHUSDT", "100"), order.id);
    expect(result.status).toBe("FAILED");
    expect((await broker.getAccountState()).balances[0].free).toBe("10000");
  });

  it("tracks cancelled limit orders without side effects", async () => {
    const broker = new PaperBroker({ startingCash: "10000" });
    const order = await broker.placeOrder({
      side: "buy",
      type: "limit",
      symbol: "BTCUSDT",
      quantity: "1",
      price: "90",
      clientOrderId: "cancel-me",
    });
    await broker.applyMarket(oracle("BTCUSDT", "95"), order.id);
    await broker.cancelOrder(order.id);
    expect((await broker.getOrder(order.id))?.status).toBe("CANCELLED");
    expect((await broker.getAccountState()).balances[0].free).toBe("10000");
  });

  describe("rehydration from persisted state", () => {
    it("restores free cash exactly from initialFreeCash", async () => {
      const broker = new PaperBroker({
        startingCash: "50000",
        initialFreeCash: "1000",
      });
      const state = await broker.getAccountState();
      expect(state.balances[0].free).toBe("1000");
    });

    it("re-hydrates a held position with position fees", async () => {
      const broker = new PaperBroker({
        startingCash: "0",
        initialFreeCash: "100",
        initialPositions: [
          {
            symbol: "BTCUSDT",
            quantity: "2",
            avgEntryPrice: "100",
            fees: "0.1",
          },
        ],
      });
      const positions = await broker.getPositions("BTCUSDT");
      expect(positions).toHaveLength(1);
      expect(positions[0].quantity).toBe("2");
      expect(positions[0].avgEntryPrice).toBe("100");
      expect(positions[0].fees).toBe("0.1");
    });
  });
});
