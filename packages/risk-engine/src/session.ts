import type { TradingSession } from "./types.js";

/**
 * UTC clock used for trading-session checks. `minutesOfDay` is injectable so
 * session rules stay deterministic and testable (AGENTS.md §10).
 */
export interface SessionClock {
  /** Minutes since UTC midnight (0..1439). */
  minutesOfDay: number;
}

/**
 * Returns true when `clock` falls inside an in-UTC session window.
 *
 * A window wraps across midnight when startMinutes > endMinutes
 * (e.g. 22:00 -> 06:00 UTC).
 */
export function isWithinSession(session: TradingSession, clock: SessionClock): boolean {
  const { startMinutes, endMinutes } = session;
  const current = clock.minutesOfDay;

  if (startMinutes === endMinutes) {
    throw new Error("Trading session must define distinct start and end minutes");
  }

  if (startMinutes < endMinutes) {
    return current >= startMinutes && current < endMinutes;
  }
  return current >= startMinutes || current < endMinutes;
}

/** Builds a SessionClock from an epoch-millisecond timestamp (UTC). */
export function utcClock(epochMs: number): SessionClock {
  const date = new Date(epochMs);
  return {
    minutesOfDay: date.getUTCHours() * 60 + date.getUTCMinutes(),
  };
}
