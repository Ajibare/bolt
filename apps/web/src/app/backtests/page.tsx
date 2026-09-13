"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CANDLE_INTERVALS,
  SUPPORTED_SYMBOLS,
  type CandleInterval,
  type SupportedSymbol,
} from "@trading-bolt/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import {
  createBacktest,
  listBacktests,
  listStrategies,
  type StrategySummary,
} from "@/lib/backtests";
import { cn } from "@/lib/utils";

const SMA_CROSSOVER_ID = "sma-crossover";
const RSI_MEAN_REVERSION_ID = "rsi-mean-reversion";

interface ConfigEditorProps {
  strategyId: string;
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}

function ConfigEditor({ strategyId, config, onChange }: ConfigEditorProps) {
  const fields =
    strategyId === SMA_CROSSOVER_ID
      ? {
          fastPeriod: { label: "Fast period", default: 5 },
          slowPeriod: { label: "Slow period", default: 20 },
        }
      : strategyId === RSI_MEAN_REVERSION_ID
        ? {
            period: { label: "RSI period", default: 14 },
            oversold: { label: "Oversold", default: 30 },
            overbought: { label: "Overbought", default: 70 },
          }
        : null;

  if (!fields) {
    return <p className="text-sm text-zinc-500">No configurable parameters.</p>;
  }

  function update(key: string, value: string): void {
    onChange({ ...config, [key]: Number(value) });
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      {Object.entries(fields).map(([key, field]) => (
        <label key={key} className="flex flex-col gap-1.5 text-sm text-zinc-700 dark:text-zinc-300">
          {field.label}
          <input
            type="number"
            value={(config[key] as number | undefined) ?? field.default}
            onChange={(event) => update(key, event.target.value)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </label>
      ))}
    </div>
  );
}

const inputClass =
  "rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

export default function BacktestsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [strategyId, setStrategyId] = useState<string>(SMA_CROSSOVER_ID);
  const [symbol, setSymbol] = useState<SupportedSymbol>(SUPPORTED_SYMBOLS[0]);
  const [interval, setInterval] = useState<CandleInterval>("1h");
  const [config, setConfig] = useState<Record<string, unknown>>({
    kind: SMA_CROSSOVER_ID,
    fastPeriod: 5,
    slowPeriod: 20,
  });
  const [startingBalance, setStartingBalance] = useState("10000");
  const [positionSize, setPositionSize] = useState("1");
  const [allowShort, setAllowShort] = useState(false);
  const [feeRate, setFeeRate] = useState("0");
  const [slippageRate, setSlippageRate] = useState("0");
  const [riskFreeRate, setRiskFreeRate] = useState("0");
  const [limit, setLimit] = useState(100);

  const strategiesQuery = useQuery({
    queryKey: ["strategies"],
    queryFn: () => listStrategies(),
    staleTime: 60_000,
  });

  const backtestsQuery = useQuery({
    queryKey: ["backtests"],
    queryFn: () => listBacktests(),
    staleTime: 0,
  });

  const runMutation = useMutation({
    mutationFn: createBacktest,
    onSuccess: (backtest) => {
      queryClient.invalidateQueries({ queryKey: ["backtests"] });
      router.push(`/backtests/${backtest.id}`);
    },
  });

  function selectStrategy(strategy: StrategySummary): void {
    setStrategyId(strategy.id);
    const next =
      strategy.id === SMA_CROSSOVER_ID
        ? { kind: strategy.id, fastPeriod: 5, slowPeriod: 20 }
        : strategy.id === RSI_MEAN_REVERSION_ID
          ? { kind: strategy.id, period: 14, oversold: 30, overbought: 70 }
          : { kind: strategy.id };
    setConfig(next);
  }

  function handleSubmit(event: FormEvent): void {
    event.preventDefault();
    runMutation.mutate({
      strategyId,
      symbol,
      interval,
      config,
      startingBalance,
      positionSize,
      allowShort,
      feeRate,
      slippageRate,
      riskFreeRate,
      limit,
    });
  }

  const strategies = strategiesQuery.data ?? [];

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-16">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Backtests
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Run a strategy against historical candles and store the report.
        </p>
      </header>

      <form
        onSubmit={handleSubmit}
        className="rounded-xl border border-zinc-200 p-6 dark:border-zinc-800"
      >
        <div className="flex flex-wrap gap-2">
          {strategies.map((strategy) => (
            <button
              key={strategy.id}
              type="button"
              onClick={() => selectStrategy(strategy)}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
                strategy.id === strategyId
                  ? "border-zinc-900 bg-zinc-900 text-zinc-50 dark:border-zinc-50 dark:bg-zinc-50 dark:text-zinc-900"
                  : "border-zinc-300 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800",
              )}
            >
              {strategy.name}
            </button>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1.5 text-sm text-zinc-700 dark:text-zinc-300">
            Symbol
            <select
              value={symbol}
              onChange={(event) => setSymbol(event.target.value as SupportedSymbol)}
              className={inputClass}
            >
              {SUPPORTED_SYMBOLS.map((candidate) => (
                <option key={candidate} value={candidate}>
                  {candidate}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5 text-sm text-zinc-700 dark:text-zinc-300">
            Interval
            <select
              value={interval}
              onChange={(event) => setInterval(event.target.value as CandleInterval)}
              className={inputClass}
            >
              {CANDLE_INTERVALS.map((candidate) => (
                <option key={candidate} value={candidate}>
                  {candidate}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5 text-sm text-zinc-700 dark:text-zinc-300">
            Candles
            <input
              type="number"
              min={1}
              max={200}
              value={limit}
              onChange={(event) => setLimit(Number(event.target.value))}
              className={inputClass}
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm text-zinc-700 dark:text-zinc-300">
            Starting balance
            <input
              value={startingBalance}
              onChange={(event) => setStartingBalance(event.target.value)}
              className={inputClass}
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm text-zinc-700 dark:text-zinc-300">
            Position size
            <input
              value={positionSize}
              onChange={(event) => setPositionSize(event.target.value)}
              className={inputClass}
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm text-zinc-700 dark:text-zinc-300">
            Fee rate
            <input
              value={feeRate}
              onChange={(event) => setFeeRate(event.target.value)}
              className={inputClass}
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm text-zinc-700 dark:text-zinc-300">
            Slippage
            <input
              value={slippageRate}
              onChange={(event) => setSlippageRate(event.target.value)}
              className={inputClass}
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm text-zinc-700 dark:text-zinc-300">
            Risk-free rate
            <input
              value={riskFreeRate}
              onChange={(event) => setRiskFreeRate(event.target.value)}
              className={inputClass}
            />
          </label>

          <label className="flex items-center gap-2 pb-1.5 text-sm text-zinc-700 dark:text-zinc-300">
            <input
              type="checkbox"
              checked={allowShort}
              onChange={(event) => setAllowShort(event.target.checked)}
              className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-700"
            />
            Allow shorts
          </label>
        </div>

        <div className="mt-6">
          <ConfigEditor strategyId={strategyId} config={config} onChange={setConfig} />
        </div>

        {runMutation.isError ? (
          <p className="mt-4 text-sm text-red-600 dark:text-red-400">
            Failed to run backtest: {(runMutation.error as Error).message}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={runMutation.isPending}
          className="mt-6 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-50 transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {runMutation.isPending ? "Running…" : "Run backtest"}
        </button>
      </form>

      <section className="mt-10">
        <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-50">Saved runs</h2>
        {backtestsQuery.isPending ? (
          <p className="text-sm text-zinc-500">Loading runs…</p>
        ) : backtestsQuery.data && backtestsQuery.data.length > 0 ? (
          <ul className="space-y-2">
            {backtestsQuery.data.map((backtest) => (
              <li key={backtest.id}>
                <Link
                  href={`/backtests/${backtest.id}`}
                  className="flex items-center justify-between rounded-lg border border-zinc-200 px-4 py-3 text-sm transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
                >
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">
                    {backtest.strategyId}{" "}
                    <span className="text-zinc-500">
                      · {backtest.symbol} · {backtest.interval}
                    </span>
                  </span>
                  <span className="font-mono text-zinc-600 dark:text-zinc-400">
                    {backtest.netProfit}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-zinc-500">No saved runs yet.</p>
        )}
      </section>
    </main>
  );
}
