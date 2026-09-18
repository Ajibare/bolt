import { describe, expect, it } from "vitest";
import { deriveQuoteAsset, sumCommissionFees } from "./mappers.js";

describe("deriveQuoteAsset", () => {
  it("derives the quote from the symbol suffix", () => {
    expect(deriveQuoteAsset("BTCUSDT")).toBe("USDT");
    expect(deriveQuoteAsset("ETHUSDC")).toBe("USDC");
    expect(deriveQuoteAsset("SOLFDUSD")).toBe("FDUSD");
    expect(deriveQuoteAsset("1000PEPEUSDT")).toBe("USDT");
  });

  it("prefers the longest matching quote suffix", () => {
    // BNBUSDT must not resolve to BNB.
    expect(deriveQuoteAsset("BNBUSDT")).toBe("USDT");
    expect(deriveQuoteAsset("ETHBTC")).toBe("BTC");
    expect(deriveQuoteAsset("EURBUSD")).toBe("BUSD");
  });

  it("returns null for an unknown quote asset", () => {
    expect(deriveQuoteAsset("OZGURMx")).toBeNull();
  });
});

describe("sumCommissionFees", () => {
  it("sums only quote-asset commissions", () => {
    const trades = [
      { commission: "1.5", commissionAsset: "USDT" },
      { commission: "0.5", commissionAsset: "USDT" },
    ];
    expect(sumCommissionFees(trades, "USDT")).toBe("2");
  });

  it("returns 0 when the quote asset is unknown", () => {
    const trades = [{ commission: "1.5", commissionAsset: "USDT" }];
    expect(sumCommissionFees(trades, null)).toBe("0");
  });

  it("never converts non-quote commissions (BNB/base) into quote terms", () => {
    const trades = [
      { commission: "2", commissionAsset: "USDT" },
      { commission: "0.01", commissionAsset: "BNB" },
    ];
    expect(sumCommissionFees(trades, "USDT")).toBe("2");
  });

  it("returns 0 when every commission is a non-quote asset", () => {
    const trades = [
      { commission: "1", commissionAsset: "BTC" },
      { commission: "0.01", commissionAsset: "BNB" },
    ];
    expect(sumCommissionFees(trades, "USDT")).toBe("0");
  });
});
