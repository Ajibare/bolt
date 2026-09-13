import { describe, expect, it, vi } from 'vitest';
import { FetchJsonClient, MarketDataError } from './http-client.js';

interface FakeResponse {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}

function okJson(body: unknown): FakeResponse {
  return { ok: true, status: 200, json: async () => body };
}

function errorResponse(status: number): FakeResponse {
  return { ok: false, status, json: async () => ({}) };
}

describe('FetchJsonClient', () => {
  it('builds the URL and query string, then parses JSON', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okJson({ hello: 'world' }));
    const client = new FetchJsonClient(fetchImpl as never);

    const result = await client.getJson<{ hello: string }>({
      baseUrl: 'https://api.bybit.com/',
      path: '/v5/market/tickers',
      query: { symbol: 'BTCUSDT', interval: '15' },
    });

    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(String(fetchImpl.mock.calls[0][0])).toBe(
      'https://api.bybit.com/v5/market/tickers?symbol=BTCUSDT&interval=15',
    );
    expect(result).toEqual({ hello: 'world' });
  });

  it('maps HTTP 429 to a rate-limited error', async () => {
    const client = new FetchJsonClient(
      vi.fn().mockResolvedValue(errorResponse(429)) as never,
    );

    await expect(
      client.getJson({ baseUrl: 'https://x', path: '/v1' }),
    ).rejects.toMatchObject({ code: 'rate_limited' });
  });

  it('maps other HTTP errors to an http error', async () => {
    const client = new FetchJsonClient(
      vi.fn().mockResolvedValue(errorResponse(500)) as never,
    );

    await expect(
      client.getJson({ baseUrl: 'https://x', path: '/v1' }),
    ).rejects.toMatchObject({ code: 'http' });
  });

  it('maps network failures to an http error', async () => {
    const client = new FetchJsonClient(
      vi.fn().mockRejectedValue(new Error('ENOTFOUND')) as never,
    );

    await expect(
      client.getJson({ baseUrl: 'https://x', path: '/v1' }),
    ).rejects.toMatchObject({ code: 'http' });
  });

  it('maps non-JSON bodies to an invalid_response error', async () => {
    const client = new FetchJsonClient(
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => null,
      }) as never,
    );

    await expect(
      client.getJson({ baseUrl: 'https://x', path: '/v1' }),
    ).rejects.toMatchObject({ code: 'invalid_response' });
  });

  it('is itself a MarketDataError for classification', async () => {
    const client = new FetchJsonClient(
      vi.fn().mockResolvedValue(errorResponse(429)) as never,
    );

    await expect(
      client.getJson({ baseUrl: 'https://x', path: '/v1' }),
    ).rejects.toBeInstanceOf(MarketDataError);
  });
});
