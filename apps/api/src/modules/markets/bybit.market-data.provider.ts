import { Inject, Injectable, Optional } from '@nestjs/common';
import type { SupportedSymbol } from '@trading-bolt/shared';
import { SUPPORTED_SYMBOLS } from '@trading-bolt/shared';
import type {
  Candle,
  OrderBook,
  Ticker,
  TradeTick,
} from '@trading-bolt/shared';
import { MarketDataError, type HttpJsonClient } from './http-client.js';
import type {
  BybitApiResponse,
  BybitKlineResult,
  BybitOrderBookResult,
  BybitTickerResult,
  BybitTradeResult,
} from './bybit.types.js';
import {
  INTERVAL_BYBIT,
  mapKlineRows,
  mapOrderBook,
  mapTicker,
  mapTrade,
} from './bybit.mappers.js';
import type {
  GetCandlesOptions,
  MarketDataProvider,
} from './market-data.provider.js';
import {
  MARKET_DATA_BASE_URL,
  MARKET_DATA_CLIENT,
} from './markets.constants.js';

export const BYBIT_BASE_URL = 'https://api.bybit.com';

interface ApiResult<Result> {
  result: Result;
  apiTimestamp: number;
}

@Injectable()
export class BybitMarketDataProvider implements MarketDataProvider {
  readonly name = 'bybit';

  private readonly baseUrl: string;

  constructor(
    @Inject(MARKET_DATA_CLIENT) private readonly client: HttpJsonClient,
    @Optional()
    @Inject(MARKET_DATA_BASE_URL)
    baseUrl?: string,
  ) {
    this.baseUrl = (baseUrl ?? BYBIT_BASE_URL).replace(/\/+$/, '');
  }

  getSymbols(): SupportedSymbol[] {
    return [...SUPPORTED_SYMBOLS];
  }

  async getCandles(
    symbol: SupportedSymbol,
    options: GetCandlesOptions,
  ): Promise<Candle[]> {
    const { result } = await this.request<BybitKlineResult>('kline', {
      symbol,
      interval: INTERVAL_BYBIT[options.interval],
      limit: String(options.limit),
    });
    return mapKlineRows(result.list, symbol, options.interval);
  }

  async getTicker(symbol: SupportedSymbol): Promise<Ticker | null> {
    const { result, apiTimestamp } = await this.request<BybitTickerResult>(
      'tickers',
      {
        symbol,
      },
    );
    return mapTicker(result.list[0], symbol, apiTimestamp);
  }

  async getRecentTrades(
    symbol: SupportedSymbol,
    limit: number,
  ): Promise<TradeTick[]> {
    const { result } = await this.request<BybitTradeResult>('recent-trade', {
      symbol,
      limit: String(limit),
    });
    return result.list.map((item) => mapTrade(item, symbol));
  }

  async getOrderBook(
    symbol: SupportedSymbol,
    limit: number,
  ): Promise<OrderBook> {
    const { result } = await this.request<BybitOrderBookResult>('orderbook', {
      symbol,
      limit: String(limit),
    });
    return mapOrderBook(result, symbol);
  }

  private async request<Result>(
    endpoint: string,
    query: Record<string, string>,
  ): Promise<ApiResult<Result>> {
    let body: BybitApiResponse<Result>;
    try {
      body = await this.client.getJson<BybitApiResponse<Result>>({
        baseUrl: this.baseUrl,
        path: `/v5/market/${endpoint}`,
        query,
      });
    } catch (error) {
      if (error instanceof MarketDataError) {
        throw error;
      }
      throw new MarketDataError(
        'http',
        `Market data request failed: ${error instanceof Error ? error.message : String(error)}`,
        error,
      );
    }

    if (body.retCode !== 0) {
      throw new MarketDataError(
        'provider',
        `Bybit error ${body.retCode}: ${body.retMsg}`,
      );
    }
    return { result: body.result, apiTimestamp: body.time };
  }
}
