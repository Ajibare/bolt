"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { notFound } from "next/navigation";
import { use } from "react";
import { EquityChart } from "@/components/equity-chart";
import { getBacktest } from "@/lib/backtests";

function formatNumber(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return String(value);
  return numeric.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `${(Number(value) * 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;
}

function telemetryPoint(timestamp: string | number): string {
  return new Date(timestamp).toLocaleString();
}

export default function BacktestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const { data, error, isPending } = useQuery({
    queryKey: ["backtests", id],
    queryFn: () => getBacktest(id),
    staleTime: 0,
  });

  if (isPending) {
    return (
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-16">
        <p className="text-sm text-zinc-500">Loading backtest…</p>
      </main>
    );
  }

  if (error || !data) {
    notFound();
  }

  const metrics: Array<[string, string]> = [
    ["Starting balance", formatNumber(data.startingBalance)],
    ["Ending balance", formatNumber(data.endingBalance)],
    ["Net profit", formatNumber(data.netProfit)],
    ["Total return", formatPercent(data.totalReturn)],
    ["Total fees", formatNumber(data.totalFeesPaid)],
    ["Closed trades", String(data.closedTrades)],
    ["Win rate", formatPercent(data.winRate)],
    ["Max drawdown", formatPercent(data.maxDrawdown)],
    ["Profit factor", formatNumber(data.profitFactor)],
    ["Sharpe", formatNumber(data.sharpe)],
  ];

  const equityPoints = data.equityPoints ?? [];
  const trades = data.trades ?? [];

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-16">
      <header className="mb-8">
        <Link
          href="/backtests"
          className="text-sm text-zinc-500 transition-colors hover:text-zinc-900 dark:hover:text-zinc-100"
        >
          ← Backtests
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          {data.strategyId}
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          {data.symbol} · {data.interval} · {data.candleLimit} candles ·{" "}
          {telemetryPoint(data.createdAt)}
        </p>
      </header>

      <section className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
        <EquityChart points={equityPoints} />
      </section>

      <section className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {metrics.map(([label, value]) => (
          <div
            key={label}
            className="rounded-lg border border-zinc-200 p-3 text-center dark:border-zinc-800"
          >
            <dt className="text-xs text-zinc-500">{label}</dt>
            <dd className="mt-1 font-mono text-sm text-zinc-900 dark:text-zinc-50">{value}</dd>
          </div>
        ))}
      </section>

      <section className="mt-8 grid gap-6 sm:grid-cols-2">
        <div className="rounded-xl border border-zinc-200 p-6 dark:border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Strategy configuration
          </h2>
          <dl className="mt-4 space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
            {Object.entries(data.config).map(([key, value]) => (
              <div key={key} className="flex justify-between">
                <dt>{key}</dt>
                <dd className="font-mono">{String(value)}</dd>
              </div>
            ))}
            <div className="flex justify-between pt-2">
              <dt>Position size</dt>
              <dd className="font-mono">{data.positionSize}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Allow shorts</dt>
              <dd className="font-mono">{data.allowShort ? "yes" : "no"}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Fee rate</dt>
              <dd className="font-mono">{data.feeRate}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Slippage</dt>
              <dd className="font-mono">{data.slippageRate}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Risk-free rate</dt>
              <dd className="font-mono">{data.riskFreeRate}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-xl border border-zinc-200 p-6 dark:border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Trades</h2>
          {trades.length === 0 ? (
            <p className="mt-4 text-sm text-zinc-500">No trades executed.</p>
          ) : (
            <table className="mt-4 w-full text-left text-sm text-zinc-600 dark:text-zinc-400">
              <thead>
                <tr>
                  <th className="font-medium text-zinc-400">Side</th>
                  <th className="font-medium text-zinc-400">Time</th>
                  <th className="font-medium text-zinc-400">Price</th>
                  <th className="text-right font-medium text-zinc-400">P&L</th>
                </tr>
              </thead>
              <tbody>
                {trades.map((trade) => (
                  <tr key={trade.seq} className="border-t border-zinc-200 dark:border-zinc-800">
                    <td>{trade.side}</td>
                    <td className="font-mono">{telemetryPoint(trade.timestamp)}</td>
                    <td className="font-mono">{formatNumber(trade.price)}</td>
                    <td className="text-right font-mono">
                      {trade.realizedPnl === null ? "—" : formatNumber(trade.realizedPnl)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </main>
  );
}
