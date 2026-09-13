"use client";

import { useQuery } from "@tanstack/react-query";
import type { Candle, CandleInterval, SupportedSymbol, Ticker } from "@trading-bolt/shared";
import { CANDLE_INTERVALS, SUPPORTED_SYMBOLS } from "@trading-bolt/shared";
import { useState } from "react";
import { CandleChart } from "@/components/candle-chart";
import { apiRequest } from "@/lib/api";
import { cn } from "@/lib/utils";

const CANDLE_LIMIT = 200;

export default function MarketsPage() {
  const [symbol, setSymbol] = useState<SupportedSymbol>(SUPPORTED_SYMBOLS[0]);
  const [interval, setInterval] = useState<CandleInterval>("1h");

  const symbolsQuery = useQuery({
    queryKey: ["markets", "symbols"],
    queryFn: () => apiRequest<SupportedSymbol[]>("/api/markets/symbols"),
    staleTime: 60_000,
  });

  const candlesQuery = useQuery({
    queryKey: ["markets", symbol, interval, "candles"],
    queryFn: () =>
      apiRequest<Candle[]>(
        `/api/markets/${symbol}/candles?interval=${interval}&limit=${CANDLE_LIMIT}`,
      ),
    staleTime: 30_000,
  });

  const tickerQuery = useQuery({
    queryKey: ["markets", symbol, "ticker"],
    queryFn: async () => {
      try {
        return await apiRequest<Ticker>(`/api/markets/${symbol}/ticker`);
      } catch {
        return null;
      }
    },
    staleTime: 30_000,
  });

  const symbols = symbolsQuery.data ?? SUPPORTED_SYMBOLS;

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-16">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Markets
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Spot candles from Bybit public market data.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex flex-wrap gap-2">
          {symbols.map((candidate) => (
            <button
              key={candidate}
              type="button"
              onClick={() => setSymbol(candidate)}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
                candidate === symbol
                  ? "border-zinc-900 bg-zinc-900 text-zinc-50 dark:border-zinc-50 dark:bg-zinc-50 dark:text-zinc-900"
                  : "border-zinc-300 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800",
              )}
            >
              {candidate}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
          Interval
          <select
            value={interval}
            onChange={(event) => setInterval(event.target.value as CandleInterval)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          >
            {CANDLE_INTERVALS.map((candidate) => (
              <option key={candidate} value={candidate}>
                {candidate}
              </option>
            ))}
          </select>
        </label>
      </div>

      {tickerQuery.data ? (
        <dl className="mt-4 grid grid-cols-2 gap-2 text-sm text-zinc-600 sm:grid-cols-4 dark:text-zinc-400">
          <div>
            <dt>Last</dt>
            <dd className="font-mono">{tickerQuery.data.lastPrice}</dd>
          </div>
          <div>
            <dt>24h High</dt>
            <dd className="font-mono">{tickerQuery.data.high}</dd>
          </div>
          <div>
            <dt>24h Low</dt>
            <dd className="font-mono">{tickerQuery.data.low}</dd>
          </div>
          <div>
            <dt>24h Volume</dt>
            <dd className="font-mono">{tickerQuery.data.volume}</dd>
          </div>
        </dl>
      ) : null}

      <section className="mt-6 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
        {candlesQuery.isError ? (
          <p className="text-sm text-red-600 dark:text-red-400">
            Failed to load candles: {(candlesQuery.error as Error).message}
          </p>
        ) : candlesQuery.isPending ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-500">Loading candles…</p>
        ) : (
          <CandleChart candles={candlesQuery.data} />
        )}
      </section>
    </main>
  );
}
