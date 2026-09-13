import { describe, expect, it } from 'vitest';
import { MarketDataError } from './http-client.js';
import {
  mapKlineRow,
  mapKlineRows,
  mapOrderBook,
  mapTicker,
  mapTrade,
} from './bybit.mappers.js';

describe('bybit kline mappers', () => {
  it('maps a valid row to a candle preserving string precision', () => {
    const candle = mapKlineRow(
      ['1731939000000', '30100.5', '30200.25', '30099.75', '30199.9', '12.5'],
      'BTCUSDT',
      '15m',
    );
    expect(candle).toEqual({
      symbol: 'BTCUSDT',
      interval: '15m',
      timestamp: 1731939000000,
      open: '30100.5',
      high: '30200.25',
      low: '30099.75',
      close: '30199.9',
      volume: '12.5',
    });
  });

  it('sorts rows by timestamp ascending regardless of input order', () => {
    const rows = [
      ['1731939000000', '1', '2', '0.5', '1.5', '1'],
      ['1731937500000', '2', '3', '1.5', '2.5', '2'],
    ];
    const candles = mapKlineRows(rows, 'BTCUSDT', '15m');
    expect(candles.map((c) => c.timestamp)).toEqual([
      1731937500000, 1731939000000,
    ]);
  });

  it('de-duplicates candles sharing a timestamp (last wins)', () => {
    const rows = [
      ['1731937500000', '2', '3', '1.5', '2.5', '2'],
      ['1731937500000', '2.1', '3.1', '1.6', '2.6', '2.2'],
      ['1731939000000', '1', '2', '0.5', '1.5', '1'],
    ];
    const candles = mapKlineRows(rows, 'BTCUSDT', '15m');
    expect(candles.map((c) => c.timestamp)).toEqual([
      1731937500000, 1731939000000,
    ]);
    expect(candles[0].close).toBe('2.6');
  });

  it('returns an empty array for an empty result', () => {
    expect(mapKlineRows([], 'BTCUSDT', '1h')).toEqual([]);
  });

  it('rejects a truncated row', () => {
    expect(() =>
      mapKlineRow(['1731939000000', '30100.5'], 'BTCUSDT', '1h'),
    ).toThrow(MarketDataError);
  });

  it('rejects a non-numeric timestamp', () => {
    expect(() =>
      mapKlineRow(
        ['not-a-number', '1', '2', '0.5', '1.5', '1'],
        'BTCUSDT',
        '1h',
      ),
    ).toThrow(MarketDataError);
  });
});

describe('bybit ticker mapper', () => {
  it('maps a ticker item with the API timestamp', () => {
    const ticker = mapTicker(
      {
        symbol: 'BTCUSDT',
        lastPrice: '30100.5',
        highPrice24h: '30200',
        lowPrice24h: '30000',
        volume24h: '1234.56',
      },
      'BTCUSDT',
      1731939201000,
    );
    expect(ticker).toEqual({
      symbol: 'BTCUSDT',
      timestamp: 1731939201000,
      lastPrice: '30100.5',
      high: '30200',
      low: '30000',
      volume: '1234.56',
    });
  });

  it('returns null when no ticker is present', () => {
    expect(mapTicker(undefined, 'BTCUSDT', 1)).toBeNull();
  });
});

describe('bybit trade mapper', () => {
  it('maps a trade and normalizes the side', () => {
    const trade = mapTrade(
      {
        symbol: 'BTCUSDT',
        execId: 'exec-1',
        price: '30100.5',
        size: '0.2',
        side: 'Buy',
        time: '1731939000000',
      },
      'BTCUSDT',
    );
    expect(trade).toEqual({
      symbol: 'BTCUSDT',
      timestamp: 1731939000000,
      tradeId: 'exec-1',
      price: '30100.5',
      quantity: '0.2',
      side: 'buy',
    });
  });

  it('rejects an unknown trade side', () => {
    expect(() =>
      mapTrade(
        {
          symbol: 'BTCUSDT',
          execId: 'exec-1',
          price: '1',
          size: '1',
          side: 'Unknown',
          time: '1731939000000',
        },
        'BTCUSDT',
      ),
    ).toThrow(MarketDataError);
  });
});

describe('bybit orderbook mapper', () => {
  it('maps bids and asks', () => {
    const book = mapOrderBook(
      {
        s: 'BTCUSDT',
        b: [
          ['30100.5', '1'],
          ['30100', '2.5'],
        ],
        a: [
          ['30101', '0.5'],
          ['30102', '1'],
        ],
        ts: 1731939201000,
      },
      'BTCUSDT',
    );
    expect(book).toEqual({
      symbol: 'BTCUSDT',
      timestamp: 1731939201000,
      bids: [
        { price: '30100.5', quantity: '1' },
        { price: '30100', quantity: '2.5' },
      ],
      asks: [
        { price: '30101', quantity: '0.5' },
        { price: '30102', quantity: '1' },
      ],
    });
  });

  it('rejects a malformed level', () => {
    expect(() =>
      mapOrderBook({ s: 'BTCUSDT', b: [['30100']], a: [], ts: 1 }, 'BTCUSDT'),
    ).toThrow(MarketDataError);
  });
});
