import { Environment } from "../enums/app.enum.js";

export const APP_NAME = "trading-bolt";

export const DEFAULTS = {
  apiPort: 4000,
  webPort: 3000,
  logLevel: "info",
  environment: Environment.DEVELOPMENT,
} as const;

/**
 * BullMQ queue names. Only `smoke` is implemented during Phase 0; the
 * remaining queues are the scheduled contract for later phases.
 */
export const QUEUE_NAMES = {
  smoke: "smoke",
  marketData: "market-data",
  backtesting: "backtesting",
  botExecution: "bot-execution",
  orderReconciliation: "order-reconciliation",
  notifications: "notifications",
  analytics: "analytics",
  aiProcessing: "ai-processing",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export const SMOKE_QUEUE = QUEUE_NAMES.smoke;
export const MARKET_DATA_QUEUE = QUEUE_NAMES.marketData;
export const BACKTESTING_QUEUE = QUEUE_NAMES.backtesting;
export const BOT_EXECUTION_QUEUE = QUEUE_NAMES.botExecution;
export const ORDER_RECONCILIATION_QUEUE = QUEUE_NAMES.orderReconciliation;
export const NOTIFICATIONS_QUEUE = QUEUE_NAMES.notifications;
export const ANALYTICS_QUEUE = QUEUE_NAMES.analytics;
export const AI_PROCESSING_QUEUE = QUEUE_NAMES.aiProcessing;

export const SUPPORTED_SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"] as const;
export type SupportedSymbol = (typeof SUPPORTED_SYMBOLS)[number];
