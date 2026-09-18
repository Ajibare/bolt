import { apiRequest } from "./api";
import { authStorage } from "./auth-storage";

function authHeader(): { token: string } {
  const token = authStorage.getAccessToken();
  if (!token) {
    throw new Error("Not authenticated");
  }
  return { token };
}

export interface EquityCurvePoint {
  timestamp: number;
  equity: string;
}

export interface PortfolioAnalytics {
  accountId: string;
  startingCash: string;
  currentEquity: string;
  peakEquity: string;
  totalReturn: string;
  maxDrawdown: string;
  realizedPnl: string;
  lastPositionValue: string;
  equityCurve: EquityCurvePoint[];
}

export function portfolioAnalytics(accountId: string): Promise<PortfolioAnalytics> {
  return apiRequest<PortfolioAnalytics>(`/api/analytics/portfolio/${accountId}`, authHeader());
}

/** Formats a money string as a currency value. */
export function formatMoney(value: string): string {
  const number = Number(value);
  if (Number.isNaN(number)) {
    return value;
  }
  return number.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Formats a decimal fraction (0.05 = 5%) with a sign. */
export function formatRatio(value: string): string {
  const number = Number(value);
  if (Number.isNaN(number)) {
    return value;
  }
  const percent = number * 100;
  const sign = percent > 0 ? "+" : "";
  return `${sign}${percent.toFixed(2)}%`;
}
