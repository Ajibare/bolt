const UNIT_SECONDS: Record<string, number> = {
  s: 1,
  m: 60,
  h: 3600,
  d: 86400,
};

/**
 * Parses duration strings such as "30s", "15m", "2h", "7d" into seconds.
 * Throws for anything that is not a positive integer followed by a unit.
 */
export function parseDurationToSeconds(value: string): number {
  const match = /^(\d+)([smhd])$/.exec(value.trim());
  if (!match) {
    throw new Error(`Invalid duration string: "${value}"`);
  }
  return Number(match[1]) * UNIT_SECONDS[match[2]];
}
