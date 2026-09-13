import type { ValueTransformer } from 'typeorm';

/**
 * Persists and reads decimal financial fields as strings so no precision is
 * lost in transit. Database columns are `numeric`; applications always handle
 * `Money` strings.
 */
export const decimalTransformer: ValueTransformer = {
  to: (value: unknown): unknown => value,
  from: (value: unknown): string => String(value),
};
