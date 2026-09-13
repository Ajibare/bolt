import { afterEach, describe, expect, it, vi } from 'vitest';
import { LogLevel } from '@trading-bolt/shared';
import { JsonLogger } from './json.logger.js';

describe('JsonLogger', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('emits a JSON line to stdout for log()', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const logger = new JsonLogger('TestContext', LogLevel.INFO);

    logger.log('hello');

    expect(logSpy).toHaveBeenCalledTimes(1);
    const entry = JSON.parse(String(logSpy.mock.calls[0][0])) as Record<
      string,
      unknown
    >;
    expect(entry.level).toBe('info');
    expect(entry.message).toBe('hello');
    expect(entry.context).toBe('TestContext');
    expect(entry.time).toBeDefined();
  });

  it('attaches the provided context', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const logger = new JsonLogger('TestContext', LogLevel.INFO);

    logger.log('hello', 'OtherContext');

    const entry = JSON.parse(String(logSpy.mock.calls[0][0])) as Record<
      string,
      unknown
    >;
    expect(entry.context).toBe('OtherContext');
  });

  it('includes error details without leaking stack in message field', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const logger = new JsonLogger('TestContext', LogLevel.INFO);

    logger.error(new Error('boom'));

    const entry = JSON.parse(String(errorSpy.mock.calls[0][0])) as Record<
      string,
      unknown
    >;
    expect(entry.level).toBe('error');
    expect((entry.error as Record<string, unknown>).message).toBe('boom');
    expect((entry.error as Record<string, unknown>).name).toBe('Error');
  });

  it('suppresses messages below the configured minimum level', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const logger = new JsonLogger('TestContext', LogLevel.WARN);

    logger.log('hidden');
    logger.warn('visible');

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const entry = JSON.parse(String(warnSpy.mock.calls[0][0])) as Record<
      string,
      unknown
    >;
    expect(entry.level).toBe('warn');
    expect(entry.message).toBe('visible');
  });
});
