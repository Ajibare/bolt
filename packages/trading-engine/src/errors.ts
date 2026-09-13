import type { z } from "zod";

export class StrategyError extends Error {
  constructor(
    message: string,
    readonly strategyId?: string,
  ) {
    super(message);
    this.name = "StrategyError";
  }
}

export class StrategyNotFoundError extends StrategyError {
  constructor(id: string) {
    super(`Unknown strategy "${id}"`, id);
    this.name = "StrategyNotFoundError";
  }
}

export class InvalidStrategyConfigError extends StrategyError {
  readonly issues: readonly z.ZodIssue[];
  constructor(id: string, error: z.ZodError) {
    const messages = error.issues.map((i) => i.message).join("; ");
    super(`Invalid config for strategy "${id}": ${messages}`, id);
    this.name = "InvalidStrategyConfigError";
    this.issues = error.issues;
  }
}
