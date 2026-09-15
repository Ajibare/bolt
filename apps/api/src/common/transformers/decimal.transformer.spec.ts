import { describe, expect, it } from 'vitest';
import { decimalTransformer } from './decimal.transformer.js';

describe('decimalTransformer', () => {
  it('reads numeric values as strings without precision loss', () => {
    expect(decimalTransformer.from('123.45000000000000000000')).toBe(
      '123.45000000000000000000',
    );
  });

  it('preserves null for nullable columns instead of stringifying it', () => {
    expect(decimalTransformer.from(null)).toBeNull();
    expect(decimalTransformer.from(undefined)).toBeNull();
  });

  it('passes values through unchanged when writing', () => {
    expect(decimalTransformer.to('12.5')).toBe('12.5');
    expect(decimalTransformer.to(null)).toBeNull();
  });
});
