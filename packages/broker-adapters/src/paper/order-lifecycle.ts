import type { BrokerOrderStatus } from "../broker.interface.js";
import { InvalidStateTransitionError } from "../errors.js";

/**
 * Order lifecycle (AGENTS.md §15). State transitions are explicit; the
 * allowed matrix below is the single source of truth for what may happen
 * next. Nothing else may move an order between states.
 */

const ALLOWED: Record<BrokerOrderStatus, readonly BrokerOrderStatus[]> = {
  CREATED: ["SUBMITTED", "CANCELLED", "REJECTED", "FAILED"],
  SUBMITTED: ["ACCEPTED", "PARTIALLY_FILLED", "REJECTED", "FAILED"],
  ACCEPTED: ["PARTIALLY_FILLED", "FILLED", "CANCELLED", "FAILED"],
  PARTIALLY_FILLED: ["PARTIALLY_FILLED", "FILLED", "CANCELLED", "FAILED"],
  FILLED: [],
  CANCELLED: [],
  REJECTED: [],
  FAILED: [],
};

export function canTransition(from: BrokerOrderStatus, to: BrokerOrderStatus): boolean {
  return ALLOWED[from].includes(to);
}

export function transition(from: BrokerOrderStatus, to: BrokerOrderStatus): BrokerOrderStatus {
  if (!canTransition(from, to)) {
    throw new InvalidStateTransitionError(from, to);
  }
  return to;
}

export function isTerminal(status: BrokerOrderStatus): boolean {
  return (
    status === "FILLED" || status === "CANCELLED" || status === "REJECTED" || status === "FAILED"
  );
}
