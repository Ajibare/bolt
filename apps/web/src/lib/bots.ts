import { authStorage } from "./auth-storage";
import { apiRequest } from "./api";

export interface Bot {
  id: string;
  userId: string;
  name: string;
  strategyId: string;
  config: Record<string, unknown>;
  symbol: string;
  interval: string;
  riskConfig: Record<string, unknown>;
  paperAccountId: string;
  executionMode: string;
  status: string;
  quantity: string;
  stopLossPercent: string;
  takeProfitPercent: string | null;
  lastSignalDirection: "buy" | "sell" | "hold" | null;
  lastSignalReason: string | null;
  lastSignalAt: string | null;
  lastOrderId: string | null;
  lastOrderStatus: string | null;
  lastOrderSymbol: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BotRun {
  id: string;
  botId: string;
  status: string;
  startedAt: string;
  stoppedAt: string | null;
  cyclesRun: number;
  ordersPlaced: number;
  ordersRejected: number;
  lastCycleAt: string | null;
  error: string | null;
}

export interface BotRunCycle {
  id: string;
  runId: string;
  seq: number;
  signalDirection: "buy" | "sell" | "hold" | null;
  signalReason: string | null;
  signalAt: string | null;
  orderId: string | null;
  orderStatus: string | null;
  orderSide: string | null;
  orderSymbol: string | null;
  rejectionReason: string | null;
  error: string | null;
  createdAt: string;
}

export interface BotMonitorView {
  bot: Bot;
  activeRun: BotRun | null;
  portfolio: {
    equity: string;
    cash: string;
    positionValue: string;
    realizedPnl: string;
  };
  position: {
    symbol: string;
    quantity: string;
    avgEntryPrice: string;
    markPrice: string;
    unrealizedPnl: string;
  } | null;
}

export interface PaperAccount {
  id: string;
  userId: string;
  name: string;
  status: string;
  startingCash: string;
  freeCash: string;
  realizedPnl: string;
  totalFeesPaid: string;
}

export interface StrategySummary {
  id: string;
  name: string;
  description: string;
}

export interface CreateBotInput {
  name: string;
  strategyId: string;
  config: Record<string, unknown>;
  symbol: string;
  interval: string;
  riskConfig?: Record<string, unknown>;
  paperAccountId: string;
  executionMode: string;
  quantity: string;
  stopLossPercent: string;
  takeProfitPercent?: string;
}

function authHeader(): { token: string } {
  const token = authStorage.getAccessToken();
  if (!token) {
    throw new Error("Not authenticated");
  }
  return { token };
}

export function listBots(): Promise<Bot[]> {
  return apiRequest<Bot[]>("/api/bots", authHeader());
}

export function getBot(botId: string): Promise<Bot> {
  return apiRequest<Bot>(`/api/bots/${botId}`, authHeader());
}

export function createBot(input: CreateBotInput): Promise<Bot> {
  return apiRequest<Bot>("/api/bots", {
    ...authHeader(),
    method: "POST",
    body: input,
  });
}

export function startBot(botId: string): Promise<Bot> {
  return apiRequest<Bot>(`/api/bots/${botId}/start`, {
    ...authHeader(),
    method: "POST",
  });
}

export function pauseBot(botId: string): Promise<Bot> {
  return apiRequest<Bot>(`/api/bots/${botId}/pause`, {
    ...authHeader(),
    method: "POST",
  });
}

export function resumeBot(botId: string): Promise<Bot> {
  return apiRequest<Bot>(`/api/bots/${botId}/resume`, {
    ...authHeader(),
    method: "POST",
  });
}

export function stopBot(botId: string): Promise<Bot> {
  return apiRequest<Bot>(`/api/bots/${botId}/stop`, {
    ...authHeader(),
    method: "POST",
  });
}

export function recoverBot(botId: string): Promise<Bot> {
  return apiRequest<Bot>(`/api/bots/${botId}/recover`, {
    ...authHeader(),
    method: "POST",
  });
}

export function emergencyStopBot(botId: string): Promise<Bot> {
  return apiRequest<Bot>(`/api/bots/${botId}/emergency-stop`, {
    ...authHeader(),
    method: "POST",
  });
}

export function monitorBot(botId: string): Promise<BotMonitorView> {
  return apiRequest<BotMonitorView>(`/api/bots/${botId}/monitor`, authHeader());
}

export function listRuns(botId: string): Promise<BotRun[]> {
  return apiRequest<BotRun[]>(`/api/bots/${botId}/runs`, authHeader());
}

export function listRunCycles(botId: string, runId: string): Promise<BotRunCycle[]> {
  return apiRequest<BotRunCycle[]>(`/api/bots/${botId}/runs/${runId}/cycles`, authHeader());
}

export function listPaperAccounts(): Promise<PaperAccount[]> {
  return apiRequest<PaperAccount[]>("/api/paper/accounts", authHeader());
}

export function listStrategies(): Promise<StrategySummary[]> {
  return apiRequest<StrategySummary[]>("/api/strategies", authHeader());
}
