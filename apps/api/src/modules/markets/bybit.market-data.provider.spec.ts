import { describe, expect, it, vi } from 'vitest';
import { MarketDataError, type HttpJsonClient } from './http-client.js';
import { BybitMarketDataProvider } from './bybit.market-data.provider.js';

const BASE_URL = 'https://api.bybit.com';

function createProvider(client: HttpJsonClient) {
  return new BybitMarketDataProvider(client, BASE_URL);
}

function okResponse<T>(result: T, time = 1731939201000) {
  return { retCode: 0, retMsg: 'OK', result, time };
}

describe('BybitMarketDataProvider', () => {
  it('exposes the curated supported symbols without a network call', () => {
    const provider = createProvider({ getJson: vi.fn() } as never);
    expect(provider.getSymbols()).toEqual(['BTCUSDT', 'ETHUSDT', 'SOLUSDT']);
  });

  it('requests candles with the mapped Bybit interval and parses the result', async () => {
    const getJson = vi.fn().mockResolvedValue(
      okResponse({
        symbol: 'BTCUSDT',
        category: 'spot',
        list: [
          ['1731939000000', '30100.5', '30200', '30099', '30199', '12.5', '0'],
        ],
      }),
    );
    const provider = createProvider({ getJson } as never);

    const candles = await provider.getCandles('BTCUSDT', {
      interval: '15m',
      limit: 120,
    });

    expect(getJson).toHaveBeenCalledWith({
      baseUrl: BASE_URL,
      path: '/v5/market/kline',
      query: { symbol: 'BTCUSDT', interval: '15', limit: '120' },
    });
    expect(candles).toHaveLength(1);
    expect(candles[0].interval).toBe('15m');
    expect(candles[0].close).toBe('30199');
  });

  it("maps the 1h interval to Bybit's 60", async () => {
    const getJson = vi.fn().mockResolvedValue(okResponse({ list: [] }));
    const provider = createProvider({ getJson } as never);

    await provider.getCandles('BTCUSDT', { interval: '1h', limit: 10 });

    expect(getJson).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.objectContaining({ interval: '60' }),
      }),
    );
  });

  it('throws a provider error when Bybit returns a non-zero retCode', async () => {
    const getJson = vi.fn().mockResolvedValue({
      retCode: 10002,
      retMsg: 'Requested symbol not found',
      result: {},
    });
    const provider = createProvider({ getJson } as never);

    await expect(provider.getRecentTrades('BTCUSDT', 1)).rejects.toThrow(
      MarketDataError,
    );
    await expect(provider.getRecentTrades('BTCUSDT', 1)).rejects.toMatchObject({
      code: 'provider',
    });
  });

  it('propagates a client rate-limit error', async () => {
    const getJson = vi
      .fn()
      .mockRejectedValue(
        new MarketDataError('rate_limited', 'Rate limit exceeded (HTTP 429)'),
      );
    const provider = createProvider({ getJson } as never);

    await expect(provider.getTicker('BTCUSDT')).rejects.toMatchObject({
      code: 'rate_limited',
    });
  });

  it('returns null for a ticker with an empty list', async () => {
    const getJson = vi.fn().mockResolvedValue(okResponse({ list: [] }));
    const provider = createProvider({ getJson } as never);

    expect(await provider.getTicker('BTCUSDT')).toBeNull();
  });

  it('maps a ticker using the API response timestamp', async () => {
    const getJson = vi.fn().mockResolvedValue(
      okResponse({
        list: [
          {
            symbol: 'BTCUSDT',
            lastPrice: '30100.5',
            highPrice24h: '30200',
            lowPrice24h: '30000',
            volume24h: '1234.56',
          },
        ],
      }),
    );
    const provider = createProvider({ getJson } as never);

    const ticker = await provider.getTicker('BTCUSDT');
    expect(ticker?.timestamp).toBe(1731939201000);
    expect(ticker?.lastPrice).toBe('30100.5');
  });

  it('maps recent trades and normalizes the side', async () => {
    const getJson = vi.fn().mockResolvedValue(
      okResponse({
        list: [
          {
            symbol: 'BTCUSDT',
            execId: 'e1',
            price: '30100.5',
            size: '0.2',
            side: 'Sell',
            time: '1731939000000',
          },
        ],
      }),
    );
    const provider = createProvider({ getJson } as never);

    const trades = await provider.getRecentTrades('BTCUSDT', 1);
    expect(trades[0]).toMatchObject({ side: 'sell', price: '30100.5' });
  });

  it('maps an order book', async () => {
    const getJson = vi.fn().mockResolvedValue(
      okResponse({
        s: 'BTCUSDT',
        b: [['30100.5', '1']],
        a: [['30101', '2']],
        ts: 1731939201000,
      }),
    );
    const provider = createProvider({ getJson } as never);

    const book = await provider.getOrderBook('BTCUSDT', 10);
    expect(book.bids[0]).toEqual({ price: '30100.5', quantity: '1' });
    expect(book.asks[0]).toEqual({ price: '30101', quantity: '2' });
  });

  it('strips a trailing slash from the base URL', async () => {
    const getJson = vi.fn().mockResolvedValue(okResponse({ list: [] }));
    const provider = new BybitMarketDataProvider(
      { getJson } as never,
      'https://api.bybit.com/',
    );

    await provider.getTicker('BTCUSDT');
    expect(getJson).toHaveBeenCalledWith(
      expect.objectContaining({ baseUrl: 'https://api.bybit.com' }),
    );
  });
});
