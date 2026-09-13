import { CANDLE_INTERVALS } from '@trading-bolt/shared';
import { describe, expect, it } from 'vitest';
import { intervalToMs } from './bot-timing.js';

describe('intervalToMs', () => {
  it('maps every supported interval to milliseconds', () => {
    expect(intervalToMs('1m')).toBe(60_000);
    expect(intervalToMs('5m')).toBe(300_000);
    expect(intervalToMs('15m')).toBe(900_000);
    expect(intervalToMs('1h')).toBe(3_600_000);
    expect(intervalToMs('4h')).toBe(14_400_000);
    expect(intervalToMs('1d')).toBe(86_400_000);
  });

  it('throws on unknown intervals instead of failing silently', () => {
    expect(() => intervalToMs('7m')).toThrow(/Unknown candle interval/);
  });

  it('covers exactly the shared CANDLE_INTERVALS set', () => {
    for (const interval of CANDLE_INTERVALS) {
      expect(intervalToMs(interval)).toBeGreaterThan(0);
    }
  });
});