import type { LoggerService } from '@nestjs/common';
import { LogLevel } from '@trading-bolt/shared';

const LEVEL_RANK: Record<LogLevel, number> = {
  [LogLevel.DEBUG]: 10,
  [LogLevel.INFO]: 20,
  [LogLevel.WARN]: 30,
  [LogLevel.ERROR]: 40,
  [LogLevel.FATAL]: 50,
};

/**
 * Structured JSON logger emitted to stdout/stderr. Logs never include
 * secrets, passwords or authentication tokens.
 */
export class JsonLogger implements LoggerService {
  private readonly minRank: number;

  constructor(
    private readonly context: string = 'App',
    minLevel: LogLevel = LogLevel.INFO,
  ) {
    this.minRank = LEVEL_RANK[minLevel] ?? LEVEL_RANK[LogLevel.INFO];
  }

  log(message: unknown, ...optionalParams: unknown[]): void {
    this.emit(LogLevel.INFO, message, optionalParams);
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    this.emit(LogLevel.ERROR, message, optionalParams);
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.emit(LogLevel.WARN, message, optionalParams);
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    this.emit(LogLevel.DEBUG, message, optionalParams);
  }

  verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.emit(LogLevel.DEBUG, message, optionalParams);
  }

  fatal(message: unknown, ...optionalParams: unknown[]): void {
    this.emit(LogLevel.FATAL, message, optionalParams);
  }

  private emit(
    level: LogLevel,
    message: unknown,
    optionalParams: unknown[],
  ): void {
    if (LEVEL_RANK[level] < this.minRank) {
      return;
    }

    const { context, stack } = this.parseOptionalParams(optionalParams);
    const entry: Record<string, unknown> = {
      time: new Date().toISOString(),
      level,
      context: context ?? this.context,
    };

    if (message instanceof Error) {
      entry.error = {
        name: message.name,
        message: message.message,
        stack: message.stack,
      };
    } else {
      entry.message = message;
    }

    if (stack !== undefined) {
      entry.stack = stack;
    }

    const line = JSON.stringify(entry);
    if (level === LogLevel.ERROR || level === LogLevel.FATAL) {
      console.error(line);
    } else if (level === LogLevel.WARN) {
      console.warn(line);
    } else {
      console.log(line);
    }
  }

  private parseOptionalParams(optionalParams: unknown[]): {
    context?: string;
    stack?: string;
  } {
    if (optionalParams.length === 0) {
      return {};
    }
    const last = optionalParams[optionalParams.length - 1];
    if (typeof last === 'string') {
      if (optionalParams.length >= 2) {
        return {
          stack: String(optionalParams[optionalParams.length - 2] ?? ''),
          context: last,
        };
      }
      return { context: last };
    }
    return {};
  }
}
