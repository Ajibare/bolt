import { toDecimal } from '@trading-bolt/shared';

interface AccountWindow {
  /** UTC date key ('YYYY-MM-DD') the window was opened for. */
  dayKey: string;
  /** Broker-reported total equity at the start of the current window. */
  openEquity: string;
  /** Highest broker-reported equity observed (for drawdown). */
  peakEquity: string;
}

/**
 * In-memory, per-process tracker of live account equity windows. Feeds the
 * circuit breaker's daily-loss and drawdown facts from what the broker actually
 * reports (`getAccountState` total balance) — the values are honest
 * observations, never guesses.
 *
 * Limitations (documented for MVP): windows reset on process restart and
 * deposits/withdrawals at the broker distort day-open equity. This is an
 * approximation of the venue's own P&L accounting, not a substitute for it.
 */
export class LiveAccountRiskTracker {
  private readonly accounts = new Map<string, AccountWindow>();

  observe(
    accountId: string,
    equity: string,
    nowMs = Date.now(),
  ): { realizedPnlToday: string; currentDrawdown: string } {
    const equityValue = toDecimal(equity);
    const dayKey = utcDateKey(nowMs);
    let window = this.accounts.get(accountId);

    if (!window || window.dayKey !== dayKey) {
      this.accounts.set(accountId, {
        dayKey,
        openEquity: equityValue.toString(),
        peakEquity: equityValue.toString(),
      });
      return { realizedPnlToday: '0', currentDrawdown: '0' };
    }

    if (equityValue.gt(window.peakEquity)) {
      window.peakEquity = equityValue.toString();
    }

    const open = toDecimal(window.openEquity);
    const peak = toDecimal(window.peakEquity);
    const realizedPnlToday = equityValue.minus(open);
    const currentDrawdown = peak.isZero()
      ? '0'
      : peak.minus(equityValue).div(peak).toString();

    return {
      realizedPnlToday: realizedPnlToday.toString(),
      currentDrawdown: currentDrawdown.toString(),
    };
  }
}

function utcDateKey(epochMs: number): string {
  return new Date(epochMs).toISOString().slice(0, 10);
}
