"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { EquityChart } from "@/components/equity-chart";
import { formatMoney, formatRatio, portfolioAnalytics } from "@/lib/analytics";
import { listPaperAccounts } from "@/lib/bots";

const selectClass =
  "rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

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

export default function AnalyticsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [accountId, setAccountId] = useState<string | null>(null);

  const accountsQuery = useQuery({
    queryKey: ["analytics-paper-accounts"],
    queryFn: listPaperAccounts,
    enabled: !!user,
  });

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, user, router]);

  const accounts = accountsQuery.data ?? [];
  const selectedAccountId = accountId ?? accounts[0]?.id ?? null;

  const analyticsQuery = useQuery({
    queryKey: ["portfolio-analytics", selectedAccountId],
    queryFn: () => portfolioAnalytics(selectedAccountId as string),
    enabled: !!user && selectedAccountId !== null,
  });

  if (loading || accountsQuery.isPending) {
    return (
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-16">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Loading…</p>
      </main>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-16">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Portfolio analytics
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Equity curve and performance metrics from the paper ledger.
        </p>
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

          {analyticsQuery.isPending && (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">Loading…</p>
          )}

          {analyticsQuery.isError && (
            <p className="text-sm text-red-600 dark:text-red-400">
              Failed to load analytics for the selected account.
            </p>
          )}

          {analyticsQuery.data && (
            <>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
                <MetricCard label="Equity" value={formatMoney(analyticsQuery.data.currentEquity)} />
                <MetricCard
                  label="Peak equity"
                  value={formatMoney(analyticsQuery.data.peakEquity)}
                />
                <MetricCard
                  label="Total return"
                  value={formatRatio(analyticsQuery.data.totalReturn)}
                  tone={returnTone(analyticsQuery.data.totalReturn)}
                />
                <MetricCard
                  label="Max drawdown"
                  value={formatRatio(analyticsQuery.data.maxDrawdown)}
                  tone="bad"
                />
                <MetricCard
                  label="Realized P&L"
                  value={formatMoney(analyticsQuery.data.realizedPnl)}
                  tone={returnTone(analyticsQuery.data.realizedPnl)}
                />
              </div>

              <section className="mt-6 rounded-xl border border-zinc-200 p-6 dark:border-zinc-800">
                <h2 className="mb-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  Equity curve
                </h2>
                <EquityChart points={analyticsQuery.data.equityCurve} />
              </section>
            </>
          )}
        </>
      )}
    </main>
  );
}
