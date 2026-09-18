import { authStorage } from "./auth-storage";
import { apiRequest } from "./api";

export interface LiveOrderView {
  id: string;
  clientOrderId: string;
  side: "buy" | "sell";
  type: "market" | "limit";
  symbol: string;
  quantity: string;
  price?: string;
  stopLoss?: string;
  takeProfit?: string;
  reduceOnly?: boolean;
  status: string;
  reason?: string;
  avgFillPrice: string | null;
  filledQuantity: string;
  fees: string;
  createdAt: number;
  updatedAt: number;
  /** Local paper_orders id when the order was placed by Trading Bolt. */
  localId: string | null;
}

export interface LiveAccountView {
  configured: boolean;
  environment: "demo" | "testnet" | "mainnet" | null;
  balances: Array<{ asset: string; free: string; used: string; total: string }> | null;
  equity: string | null;
  freeBalance: string | null;
  positions: Array<{
    symbol: string;
    quantity: string;
    avgEntryPrice: string;
    stopLoss?: string;
    takeProfit?: string;
    fees: string;
  }> | null;
  openOrders: LiveOrderView[] | null;
  circuitBreakers: Array<{ severity: string; reason: string; trippedAtMs: number }>;
  warnings: string[];
}

export interface BrokerOrderRow {
  id: string;
  status: string;
  orderStatus: string;
  orderSide: "buy" | "sell";
  orderSymbol: string;
}

export interface BrokerExecutorInfo {
  provider: "paper" | "binance" | "bybit";
  mode: "PAPER" | "LIVE";
  environment: "paper" | "demo" | "testnet" | "mainnet";
  available: boolean;
}

function authHeader(): { token: string } {
  const token = authStorage.getAccessToken();
  if (!token) {
    throw new Error("Not authenticated");
  }
  return { token };
}

export function getAccountView(): Promise<LiveAccountView> {
  return apiRequest<LiveAccountView>("/api/brokers/account", authHeader());
}

export function listBrokers(): Promise<BrokerExecutorInfo[]> {
  return apiRequest<BrokerExecutorInfo[]>("/api/brokers", authHeader());
}

export function cancelLiveOrder(orderId: string): Promise<unknown> {
  return apiRequest<unknown>(`/api/brokers/orders/${orderId}/cancel`, {
    ...authHeader(),
    method: "POST",
  });
}
