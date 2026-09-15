/**
 * Order reconciliation types (Phase 8 — reconcile local orders against the
 * broker, AGENTS.md §17). The event stream for the `order-reconciliation`
 * BullMQ queue: a periodic sweep or an on-demand synchronisation of pending
 * live-provider orders.
 */

export interface ReconciliationJob {
  /**
   * When set, only pending live orders of that account are reconciled;
   * otherwise the whole backlog of pending live-provider orders is swept.
   */
  accountId?: string;
}

/** What one reconciliation sweep did (used for logs + tests). */
export interface ReconciliationOutcome {
  /** Orders examined in this sweep. */
  checked: number;
  /** Orders whose local row was updated to match broker state. */
  updated: number;
  /** Orders that could not be reconciled safely. */
  mismatches: Array<{ orderId: string; detail: string }>;
}

/** A detected difference between the local ledger and the broker (AGENTS.md §17). */
export interface PositionDivergence {
  /** Bolt account whose local view differs from the broker. */
  accountId: string;
  symbol: string;
  /** Net signed position implied by the local live order ledger. */
  expected: string;
  /** Net signed position reported by the broker. */
  broker: string;
}

/** What one position-reconciliation pass did (AGENTS.md §17, never mutates). */
export interface PositionReconciliationOutcome {
  /** Live accounts whose local ledger was compared against the broker. */
  checkedAccounts: number;
  /** Symbols compared across all checked accounts. */
  comparedSymbols: number;
  /** Local-vs-broker position differences (detected + logged only). */
  divergences: PositionDivergence[];
}

/**
 * Return value of a full reconciliation job run (order + position passes).
 * Kept a separate type so `OrderReconciliationService` itself keeps returning
 * the stable `ReconciliationOutcome` contract.
 */
export interface ReconciliationRunOutcome extends ReconciliationOutcome {
  positions?: PositionReconciliationOutcome;
}
