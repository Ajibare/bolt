/**
 * Bot domain types (Phase 7 — Bot Engine).
 *
 * A bot binds a strategy + configuration + risk policy + a paper account and
 * drives the mandatory pipeline: market data -> strategy -> signal -> risk ->
 * order manager -> execution (AGENTS.md §9/§10). The bot itself never touches
 * a broker.
 */

export const BOT_STATUSES = [
  'DRAFT',
  'STOPPED',
  'STARTING',
  'RUNNING',
  'PAUSED',
  'STOPPING',
  'ERROR',
] as const;

export type BotStatus = (typeof BOT_STATUSES)[number];

export function isBotStatus(value: string): value is BotStatus {
  return (BOT_STATUSES as readonly string[]).includes(value);
}

/**
 * Execution modes are explicit and mutually exclusive (AGENTS.md §11): a
 * paper bot must never accidentally use live credentials.
 */
export const BOT_EXECUTION_MODES = [
  'BACKTEST',
  'PAPER',
  'DEMO',
  'TESTNET',
  'LIVE',
] as const;

export type BotExecutionMode = (typeof BOT_EXECUTION_MODES)[number];

export function isBotExecutionMode(value: string): value is BotExecutionMode {
  return (BOT_EXECUTION_MODES as readonly string[]).includes(value);
}

export type BotTickAction = 'start' | 'cycle';

/**
 * Job payload for the `bot-execution` BullMQ queue, produced by the API and
 * consumed by the worker processor. `botId`/`runId` scope every action;
 * financial operations must remain idempotent per run (AGENTS.md §16).
 */
export interface BotTickJob {
  botId: string;
  runId: string;
  action: BotTickAction;
  /** Epoch milliseconds when the tick was scheduled. */
  scheduledAt: number;
}