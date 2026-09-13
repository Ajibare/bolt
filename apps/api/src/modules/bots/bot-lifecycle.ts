import type { BotStatus } from '@trading-bolt/shared';
import {
  ConflictException,
} from '@nestjs/common';

/**
 * Bot lifecycle (roadmap §Bot Lifecycle). State transitions are explicit and
 * validated; the allowed matrix below is the single source of truth for what
 * may happen next (AGENTS.md §15 pattern applied to bot state).
 *
 * Failure handling is conservative: RUNNING/STARTING may only leave RUNNING
 * territory via PAUSED (graceful) or ERROR (serious failure) — never a silent
 * continuation. A bot in ERROR requires an explicit recovery reset to STOPPED.
 */

const ALLOWED: Record<BotStatus, readonly BotStatus[]> = {
  DRAFT: ['STOPPED', 'STARTING'],
  STOPPED: ['STARTING'],
  STARTING: ['RUNNING', 'STOPPING', 'ERROR'],
  RUNNING: ['PAUSED', 'STOPPING', 'ERROR'],
  PAUSED: ['RUNNING', 'STOPPING', 'ERROR'],
  STOPPING: ['STOPPED', 'ERROR'],
  ERROR: ['STOPPED'],
};

export function canTransition(from: BotStatus, to: BotStatus): boolean {
  return ALLOWED[from].includes(to);
}

/**
 * Applies a validated transition or throws a 409 Conflict so callers surface
 * the rejected command (e.g. start an already-started bot) as an API error.
 */
export function transition(from: BotStatus, to: BotStatus): BotStatus {
  if (!canTransition(from, to)) {
    throw new ConflictException(
      `Invalid bot state transition ${from} -> ${to}`,
    );
  }
  return to;
}

/** Statuses from which a bot may be started with start(). */
export function canStart(status: BotStatus): boolean {
  return status === 'DRAFT' || status === 'STOPPED';
}

/** Statuses from which a bot may be stopped with stop(). */
export function canStop(status: BotStatus): boolean {
  return (
    status === 'STARTING' ||
    status === 'RUNNING' ||
    status === 'PAUSED'
  );
}

/**
 * Resting states. ERROR requires explicit recovery (reset to STOPPED); a bot
 * never resumes automatically from a failure (AGENTS.md §19).
 */
export function isTerminal(status: BotStatus): boolean {
  return status === 'ERROR' || status === 'STOPPED';
}