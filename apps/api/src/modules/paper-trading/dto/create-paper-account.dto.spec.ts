import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { CreatePaperAccountDto } from './create-paper-account.dto.js';

async function errors(input: Record<string, unknown>): Promise<string[]> {
  const dto = plainToInstance(CreatePaperAccountDto, input);
  const validation = await validate(dto);
  return validation.flatMap((entry) => Object.values(entry.constraints ?? {}));
}

describe('CreatePaperAccountDto', () => {
  it('accepts a valid payload', async () => {
    expect(await errors({ name: 'Primary' })).toEqual([]);
  });

  it('defaults starting cash to 10000', () => {
    const dto = plainToInstance(CreatePaperAccountDto, { name: 'Primary' });
    expect(dto.startingCash).toBe('10000');
  });

  it('rejects a missing name', async () => {
    expect(await errors({})).not.toEqual([]);
  });

  it('rejects a non-decimal startingCash', async () => {
    const result = await errors({ name: 'Primary', startingCash: 'abc' });
    expect(result.some((message) => message.includes('startingCash'))).toBe(
      true,
    );
  });
});
