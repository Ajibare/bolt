import { describe, expect, it } from 'vitest';
import { parseDurationToSeconds } from './duration.js';

describe('parseDurationToSeconds', () => {
  it('parses supported units', () => {
    expect(parseDurationToSeconds('30s')).toBe(30);
    expect(parseDurationToSeconds('15m')).toBe(900);
    expect(parseDurationToSeconds('2h')).toBe(7200);
    expect(parseDurationToSeconds('7d')).toBe(604800);
  });

  it('rejects malformed durations', () => {
    expect(() => parseDurationToSeconds('10')).toThrow();
    expect(() => parseDurationToSeconds('m')).toThrow();
    expect(() => parseDurationToSeconds('1y')).toThrow();
    expect(() => parseDurationToSeconds('')).toThrow();
  });
});
