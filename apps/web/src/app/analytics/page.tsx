"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { EquityChart } from "@/components/equity-chart";
import {
  botTradeAnalytics,
  downloadPerformanceCsv,
  formatMoney,
  formatNumber,
  formatRatio,
  liveTradeAnalytics,
  performanceReport,
  strategyTradeAnalytics,
  type PeriodReturn,
  type RoundTripTrade,
  type TradeMetrics,
} from "@/lib/analytics";
import { listBots, listPaperAccounts } from "@/lib/bots";

const selectClass =
  "rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";
const buttonClass =
  "rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800";

function MetricCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "good" | "bad";
}) {
  const toneClass =
    tone === "good"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "bad"
        ? "text-red-600 dark:text-red-400"
        : "text-zinc-900 dark:text-zinc-50";
  return (
    <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className={`mt-1 font-mono text-lg font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}

function returnTone(value: string): "good" | "bad" | "default" {
  const number = Number(value);
  if (Number.isNaN(number) || number === 0) return "default";
  return number > 0 ? "good" : "bad";
}

function periodTone(value: string | null): "good" | "bad" | "default" {
  return value === null ? "default" : returnTone(value);
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

function TradeMetricCards({
  metrics,
  className = "",
}: {
  metrics: TradeMetrics;
  className?: string;
}) {
  return (
    <div className={`grid grid-cols-2 gap-4 md:grid-cols-3 ${className}`}>
      <MetricCard label="Trades" value={String(metrics.tradeCount)} />
      <MetricCard label="Win rate" value={formatRatio(metrics.winRate)} />
      <MetricCard
        label="Net P&L"
        value={formatMoney(metrics.netPnl)}
        tone={returnTone(metrics.netPnl)}
      />
      <MetricCard
        label="Profit factor"
        value={metrics.profitFactor === null ? "—" : formatNumber(metrics.profitFactor)}
      />
      <MetricCard label="Average win" value={formatMoney(metrics.averageWin)} tone="good" />
      <MetricCard label="Average loss" value={formatMoney(metrics.averageLoss)} tone="bad" />
    </div>
  );
}

function TradesTable({ trades, emptyMessage }: { trades: RoundTripTrade[]; emptyMessage: string }) {
  return (
    <div className="mt-6 overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
      {trades.length === 0 ? (
        <p className="p-6 text-sm text-zinc-600 dark:text-zinc-400">{emptyMessage}</p>
      ) : (
        <table className="w-full text-left text-sm text-zinc-600 dark:text-zinc-400">
          <thead>
            <tr>
              <th className="px-4 py-3 font-medium text-zinc-400">Side</th>
              <th className="px-4 py-3 font-medium text-zinc-400">Symbol</th>
              <th className="px-4 py-3 font-medium text-zinc-400">Size</th>
              <th className="px-4 py-3 font-medium text-zinc-400">Entry</th>
              <th className="px-4 py-3 font-medium text-zinc-400">Exit</th>
              <th className="px-4 py-3 font-medium text-zinc-400">Closed</th>
              <th className="px-4 py-3 text-right font-medium text-zinc-400">Net P&L</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((trade, index) => (
              <tr
                key={`${trade.symbol}-${trade.exitTime}-${index}`}
                className="border-t border-zinc-200 dark:border-zinc-800"
              >
                <td
                  className={[
                    "px-4 py-3 font-medium",
                    trade.direction === "long"
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-red-600 dark:text-red-400",
                  ].join(" ")}
                >
                  {trade.direction === "long" ? "Long" : "Short"}
                </td>
                <td className="px-4 py-3 font-mono">{trade.symbol}</td>
                <td className="px-4 py-3 font-mono">{formatNumber(trade.quantity)}</td>
                <td className="px-4 py-3 font-mono">{formatMoney(trade.entryPrice)}</td>
                <td className="px-4 py-3 font-mono">{formatMoney(trade.exitPrice)}</td>
                <td className="px-4 py-3 font-mono">{formatTime(trade.exitTime)}</td>
                <td
                  className={[
                    "px-4 py-3 text-right font-mono",
                    returnTone(trade.netPnl) === "good"
                      ? "text-emerald-600 dark:text-emerald-400"
                      : returnTone(trade.netPnl) === "bad"
                        ? "text-red-600 dark:text-red-400"
                        : "text-zinc-900 dark:text-zinc-50",
                  ].join(" ")}
                >
                  {formatMoney(trade.netPnl)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function PeriodTable({ title, rows }: { title: string; rows: PeriodReturn[] }) {
  if (rows.length === 0) {
    return null;
  }
  return (
    <section className="mt-6">
      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{title}</h3>
      <div className="mt-3 overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-left text-sm text-zinc-600 dark:text-zinc-400">
          <thead>
            <tr>
              <th className="px-4 py-3 font-medium text-zinc-400">Period</th>
              <th className="px-4 py-3 font-medium text-zinc-400">Start equity</th>
              <th className="px-4 py-3 font-medium text-zinc-400">End equity</th>
              <th className="px-4 py-3 font-medium text-zinc-400">Return</th>
              <th className="px-4 py-3 font-medium text-zinc-400">P&L</th>
              <th className="px-4 py-3 text-right font-medium text-zinc-400">Points</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((period) => (
              <tr key={period.label} className="border-t border-zinc-200 dark:border-zinc-800">
                <td className="px-4 py-3 font-mono">{period.label}</td>
                <td className="px-4 py-3 font-mono">{formatMoney(period.startingEquity)}</td>
                <td className="px-4 py-3 font-mono">{formatMoney(period.endingEquity)}</td>
                <td
                  className={[
                    "px-4 py-3 font-mono",
                    periodTone(period.returnPercent) === "good"
                      ? "text-emerald-600 dark:text-emerald-400"
                      : periodTone(period.returnPercent) === "bad"
                        ? "text-red-600 dark:text-red-400"
                        : "text-zinc-900 dark:text-zinc-50",
                  ].join(" ")}
                >
                  {period.returnPercent === null ? "—" : formatRatio(period.returnPercent)}
                </td>
                <td
                  className={[
                    "px-4 py-3 font-mono",
                    periodTone(period.pnl) === "good"
                      ? "text-emerald-600 dark:text-emerald-400"
                      : periodTone(period.pnl) === "bad"
                        ? "text-red-600 dark:text-red-400"
                        : "text-zinc-900 dark:text-zinc-50",
                  ].join(" ")}
                >
                  {formatMoney(period.pnl)}
                </td>
                <td className="px-4 py-3 text-right font-mono">{period.snapshots}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function AnalyticsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [accountId, setAccountId] = useState<string | null>(null);
  const [botId, setBotId] = useState<string | null>(null);
  const [strategyId, setStrategyId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const accountsQuery = useQuery({
    queryKey: ["analytics-paper-accounts"],
    queryFn: listPaperAccounts,
    enabled: !!user,
  });

  const botsQuery = useQuery({
    queryKey: ["analytics-bots"],
    queryFn: listBots,
    enabled: !!user,
  });

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, user, router]);

  const accounts = accountsQuery.data ?? [];
  const selectedAccountId = accountId ?? accounts[0]?.id ?? null;

  const allBots = botsQuery.data ?? [];
  const accountBots =
    selectedAccountId === null
      ? []
      : allBots.filter((bot) => bot.paperAccountId === selectedAccountId);
  const selectedBotId = accountBots.some((bot) => bot.id === botId)
    ? botId
    : (accountBots[0]?.id ?? null);

  const strategyIds = [...new Set(allBots.map((bot) => bot.strategyId))];
  const selectedStrategyId =
    strategyId !== null && strategyIds.includes(strategyId) ? strategyId : (strategyIds[0] ?? null);
  const strategyBotCounts = new Map<string, number>();
  for (const bot of allBots) {
    strategyBotCounts.set(bot.strategyId, (strategyBotCounts.get(bot.strategyId) ?? 0) + 1);
  }

  const reportQuery = useQuery({
    queryKey: ["performance-report", selectedAccountId],
    queryFn: () => performanceReport(selectedAccountId as string),
    enabled: !!user && selectedAccountId !== null,
  });

  const botTradeQuery = useQuery({
    queryKey: ["bot-trade-analytics", selectedBotId],
    queryFn: () => botTradeAnalytics(selectedBotId as string),
    enabled: !!user && selectedBotId !== null,
  });

  const strategyTradeQuery = useQuery({
    queryKey: ["strategy-trade-analytics", selectedStrategyId],
    queryFn: () => strategyTradeAnalytics(selectedStrategyId as string),
    enabled: !!user && selectedStrategyId !== null,
  });

  const liveTradeQuery = useQuery({
    queryKey: ["live-trade-analytics", selectedAccountId],
    queryFn: () => liveTradeAnalytics(selectedAccountId as string),
    enabled: !!user && selectedAccountId !== null,
  });

  if (loading || accountsQuery.isPending || botsQuery.isPending) {
    return (
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-16">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Loading…</p>
      </main>
    );
  }

  if (!user) {
    return null;
  }

  async function handleExportCsv() {
    if (!selectedAccountId) return;
    setExporting(true);
    setExportError(null);
    try {
      await downloadPerformanceCsv(selectedAccountId);
    } catch {
      setExportError("CSV export failed.");
    } finally {
      setExporting(false);
    }
  }

  const report = reportQuery.data;

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-16">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Performance report
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Portfolio equity, FIFO trade metrics and per-period returns from the paper and live
            broker ledgers.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          {exportError && <p className="text-sm text-red-600 dark:text-red-400">{exportError}</p>}
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={buttonClass}
              onClick={() => void handleExportCsv()}
              disabled={exporting}
            >
              {exporting ? "Exporting…" : "Download CSV"}
            </button>
            <button type="button" className={buttonClass} onClick={() => window.print()}>
              Print report
            </button>
          </div>
        </div>
      </header>

      {accounts.length === 0 ? (
        <section className="rounded-xl border border-zinc-200 p-6 dark:border-zinc-800">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            No paper accounts yet. Create one in the Bots page to start tracking performance.
          </p>
        </section>
      ) : (
        <>
          <div className="mb-6 flex items-center gap-3">
            <label
              htmlFor="account"
              className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Account
            </label>
            <select
              id="account"
              className={selectClass}
              value={selectedAccountId ?? ""}
              onChange={(event) => setAccountId(event.target.value)}
            >
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </div>

          {reportQuery.isPending && (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">Loading…</p>
          )}

          {reportQuery.isError && (
            <p className="text-sm text-red-600 dark:text-red-400">
              Failed to load analytics for the selected account.
            </p>
          )}

          {report && (
            <>
              <section aria-label="Portfolio">
                <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
                  <MetricCard label="Equity" value={formatMoney(report.portfolio.currentEquity)} />
                  <MetricCard
                    label="Peak equity"
                    value={formatMoney(report.portfolio.peakEquity)}
                  />
                  <MetricCard
                    label="Total return"
                    value={formatRatio(report.portfolio.totalReturn)}
                    tone={returnTone(report.portfolio.totalReturn)}
                  />
                  <MetricCard
                    label="Max drawdown"
                    value={formatRatio(report.portfolio.maxDrawdown)}
                    tone="bad"
                  />
                  <MetricCard
                    label="Realized P&L"
                    value={formatMoney(report.portfolio.realizedPnl)}
                    tone={returnTone(report.portfolio.realizedPnl)}
                  />
                </div>

                <section className="mt-6 rounded-xl border border-zinc-200 p-6 dark:border-zinc-800">
                  <h2 className="mb-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    Equity curve
                  </h2>
                  <EquityChart points={report.portfolio.equityCurve} />
                </section>
              </section>

              <section className="mt-10" aria-label="Trade analytics">
                <h2 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                  Trade analytics
                </h2>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  Closed round trips rebuilt FIFO from the filled paper order ledger.
                </p>

                <TradeMetricCards metrics={report.trades.metrics} className="mt-6" />
                <TradesTable
                  trades={report.trades.trades}
                  emptyMessage="No closed round trips yet. Run a paper bot to start building trade history."
                />
              </section>

              <section className="mt-10" aria-label="Live trade analytics">
                <h2 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                  Live trade analytics
                </h2>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  Closed round trips dispatched through the live broker, rebuilt FIFO from the
                  reconciled broker fills.
                </p>

                {liveTradeQuery.isPending ? (
                  <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">Loading…</p>
                ) : liveTradeQuery.isError ? (
                  <p className="mt-4 text-sm text-red-600 dark:text-red-400">
                    Live analytics unavailable — is the live broker configured?
                  </p>
                ) : liveTradeQuery.data ? (
                  <>
                    <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
                      Provider <span className="font-mono">{liveTradeQuery.data.provider}</span> ·{" "}
                      <span className="font-mono">{liveTradeQuery.data.environment}</span>
                    </p>
                    <TradeMetricCards metrics={liveTradeQuery.data.metrics} className="mt-4" />
                    <TradesTable
                      trades={liveTradeQuery.data.trades}
                      emptyMessage="No live round trips yet. Run a live bot to start building broker trade history."
                    />
                  </>
                ) : null}
              </section>

              <section className="mt-10" aria-label="Period returns">
                <h2 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                  Period returns
                </h2>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  Equity change per UTC period; periods without snapshots are skipped.
                </p>
                <PeriodTable title="Daily" rows={report.periodReturns.daily} />
                <PeriodTable title="Weekly" rows={report.periodReturns.weekly} />
                <PeriodTable title="Monthly" rows={report.periodReturns.monthly} />
              </section>

              <section className="mt-10" aria-label="Bot trade analytics">
                <h2 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                  Bot trade analytics
                </h2>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  Closed round trips attributed to one paper bot, rebuilt FIFO from the order
                  ledger.
                </p>

                <div className="mt-6 flex items-center gap-3">
                  <label
                    htmlFor="bot"
                    className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
                  >
                    Bot
                  </label>
                  <select
                    id="bot"
                    className={selectClass}
                    value={selectedBotId ?? ""}
                    onChange={(event) => setBotId(event.target.value)}
                  >
                    {accountBots.map((bot) => (
                      <option key={bot.id} value={bot.id}>
                        {bot.name}
                      </option>
                    ))}
                  </select>
                </div>

                {accountBots.length === 0 ? (
                  <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
                    No bots on this account yet. Create one in the Bots page to start attributing
                    trades.
                  </p>
                ) : botTradeQuery.isPending ? (
                  <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">Loading…</p>
                ) : botTradeQuery.isError ? (
                  <p className="mt-4 text-sm text-red-600 dark:text-red-400">
                    Failed to load bot analytics.
                  </p>
                ) : botTradeQuery.data ? (
                  <>
                    <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
                      Strategy <span className="font-mono">{botTradeQuery.data.strategyId}</span> on{" "}
                      <span className="font-mono">{botTradeQuery.data.symbol}</span>
                    </p>
                    <TradeMetricCards metrics={botTradeQuery.data.metrics} className="mt-4" />
                    <TradesTable
                      trades={botTradeQuery.data.trades}
                      emptyMessage="No closed round trips for this bot yet. Run the bot to start building trade history."
                    />
                  </>
                ) : null}
              </section>

              <section className="mt-10" aria-label="Strategy trade analytics">
                <h2 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                  Strategy trade analytics
                </h2>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  Closed round trips rolled up across every bot running this strategy, rebuilt FIFO
                  from the order ledger.
                </p>

                <div className="mt-6 flex items-center gap-3">
                  <label
                    htmlFor="strategy"
                    className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
                  >
                    Strategy
                  </label>
                  <select
                    id="strategy"
                    className={selectClass}
                    value={selectedStrategyId ?? ""}
                    onChange={(event) => setStrategyId(event.target.value)}
                  >
                    {strategyIds.map((id) => (
                      <option key={id} value={id}>
                        {id} ({strategyBotCounts.get(id) ?? 0} bots)
                      </option>
                    ))}
                  </select>
                </div>

                {strategyIds.length === 0 ? (
                  <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
                    No bots yet. Create one in the Bots page to start running strategies.
                  </p>
                ) : strategyTradeQuery.isPending ? (
                  <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">Loading…</p>
                ) : strategyTradeQuery.isError ? (
                  <p className="mt-4 text-sm text-red-600 dark:text-red-400">
                    Failed to load strategy analytics.
                  </p>
                ) : strategyTradeQuery.data ? (
                  <>
                    <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
                      Across{" "}
                      <span className="font-mono">{strategyTradeQuery.data.botIds.length}</span>{" "}
                      bots on{" "}
                      <span className="font-mono">
                        {strategyTradeQuery.data.symbols.join(", ") || "—"}
                      </span>
                    </p>
                    <TradeMetricCards metrics={strategyTradeQuery.data.metrics} className="mt-4" />
                    <TradesTable
                      trades={strategyTradeQuery.data.trades}
                      emptyMessage="No closed round trips for this strategy yet. Run the bots to start building trade history."
                    />
                  </>
                ) : null}
              </section>
            </>
          )}
        </>
      )}
    </main>
  );
}
