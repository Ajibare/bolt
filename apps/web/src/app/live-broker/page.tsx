"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/components/auth-provider";
import {
  cancelLiveOrder,
  getAccountView,
  type LiveAccountView,
  type LiveOrderView,
} from "@/lib/brokers";
import { cn } from "@/lib/utils";

function environmentBadge(environment: LiveAccountView["environment"]): string {
  switch (environment) {
    case "mainnet":
      return "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300";
    case "testnet":
      return "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300";
    case "demo":
      return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300";
    default:
      return "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400";
  }
}

function gem(label: string, value: string | number | null) {
  return (
    <div className="rounded-lg bg-zinc-50 p-3 text-sm dark:bg-zinc-900">
      <dt className="text-xs text-zinc-500 dark:text-zinc-400">{label}</dt>
      <dd className="mt-0.5 font-mono text-zinc-900 dark:text-zinc-100">{value ?? "—"}</dd>
    </div>
  );
}

function tableCell(value: string | number | null | undefined): string {
  return value === undefined || value === null ? "—" : String(value);
}

export default function LiveBrokerPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, user, router]);

  const accountQuery = useQuery({
    queryKey: ["broker-account"],
    queryFn: () => getAccountView(),
    staleTime: 5_000,
    refetchInterval: 5_000,
  });

  const cancelMutation = useMutation({
    mutationFn: cancelLiveOrder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["broker-account"] });
    },
  });

  function handleCancel(order: LiveOrderView): void {
    if (!order.localId) {
      return;
    }
    const confirmed = window.confirm(
      `Cancel ${order.side} ${order.quantity} ${order.symbol} at the broker?`,
    );
    if (confirmed) {
      cancelMutation.mutate(order.localId);
    }
  }

  if (loading) {
    return (
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-16">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Loading session…</p>
      </main>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-16">
      <header className="mb-8">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Live broker
          </h1>
          {accountQuery.data ? (
            <span
              className={cn(
                "rounded-full px-2 py-0.5 font-mono text-xs font-medium",
                environmentBadge(accountQuery.data.environment),
              )}
            >
              {accountQuery.data.environment ?? "not configured"}
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Read-only broker account view. Fills and local state always converge through
          reconciliation, never through guesses.
        </p>
      </header>

      {accountQuery.isPending ? (
        <p className="text-sm text-zinc-500">Loading broker account…</p>
      ) : accountQuery.isError ? (
        <p className="text-sm text-red-600 dark:text-red-400">
          {(accountQuery.error as Error).message}
        </p>
      ) : accountQuery.data ? (
        <>
          {accountQuery.data.configured === false ? (
            <section className="rounded-xl border border-zinc-200 p-6 dark:border-zinc-800">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Live broker not configured
              </h2>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                Set <span className="font-mono">BYBIT_API_KEY</span> and{" "}
                <span className="font-mono">BYBIT_API_SECRET</span> (plus{" "}
                <span className="font-mono">BYBIT_ENVIRONMENT</span>) in the API environment to
                enable live executors. Nothing is exposed here — the broker is only reachable from
                the backend.
              </p>
            </section>
          ) : null}

          {accountQuery.data.warnings.length > 0 ? (
            <ul className="mb-6 space-y-1">
              {accountQuery.data.warnings.map((warning) => (
                <li
                  key={warning}
                  className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-900/20 dark:text-amber-300"
                >
                  {warning}
                </li>
              ))}
            </ul>
          ) : null}

          {accountQuery.data.configured ? (
            <>
              <section>
                <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  Overview
                </h2>
                <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {gem("Equity", accountQuery.data.equity)}
                  {gem("Free balance", accountQuery.data.freeBalance)}
                  {gem("Open positions", accountQuery.data.positions?.length ?? null)}
                  {gem("Open orders", accountQuery.data.openOrders?.length ?? null)}
                </dl>
              </section>

              <section className="mt-8">
                <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  Circuit breakers
                </h2>
                {accountQuery.data.circuitBreakers.length === 0 ? (
                  <p className="text-sm text-zinc-500">None open.</p>
                ) : (
                  <ul className="space-y-1">
                    {accountQuery.data.circuitBreakers.map((breaker) => (
                      <li
                        key={breaker.severity}
                        className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-900/20 dark:text-red-300"
                      >
                        <span className="font-mono">{breaker.severity}</span> — {breaker.reason}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="mt-8">
                <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  Balances
                </h2>
                {(accountQuery.data.balances ?? []).length === 0 ? (
                  <p className="text-sm text-zinc-500">No balances reported.</p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
                    <table className="w-full text-sm">
                      <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
                        <tr>
                          <th className="px-4 py-2 font-medium">Asset</th>
                          <th className="px-4 py-2 font-medium">Free</th>
                          <th className="px-4 py-2 font-medium">Used</th>
                          <th className="px-4 py-2 font-medium">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                        {(accountQuery.data.balances ?? []).map((balance) => (
                          <tr key={balance.asset}>
                            <td className="px-4 py-2 font-mono">{balance.asset}</td>
                            <td className="px-4 py-2 font-mono">{balance.free}</td>
                            <td className="px-4 py-2 font-mono">{balance.used}</td>
                            <td className="px-4 py-2 font-mono">{balance.total}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section className="mt-8">
                <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  Positions
                </h2>
                {(accountQuery.data.positions ?? []).length === 0 ? (
                  <p className="text-sm text-zinc-500">No open positions.</p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
                    <table className="w-full text-sm">
                      <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
                        <tr>
                          <th className="px-4 py-2 font-medium">Symbol</th>
                          <th className="px-4 py-2 font-medium">Quantity</th>
                          <th className="px-4 py-2 font-medium">Avg entry</th>
                          <th className="px-4 py-2 font-medium">Fees</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                        {(accountQuery.data.positions ?? []).map((position) => (
                          <tr key={position.symbol}>
                            <td className="px-4 py-2 font-mono">{position.symbol}</td>
                            <td
                              className={cn(
                                "px-4 py-2 font-mono",
                                Number(position.quantity) < 0
                                  ? "text-red-600 dark:text-red-400"
                                  : "text-emerald-600 dark:text-emerald-400",
                              )}
                            >
                              {position.quantity}
                            </td>
                            <td className="px-4 py-2 font-mono">
                              {tableCell(position.avgEntryPrice)}
                            </td>
                            <td className="px-4 py-2 font-mono">{tableCell(position.fees)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section className="mt-8">
                <h2 className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  Open orders
                </h2>
                {(accountQuery.data.openOrders ?? []).length === 0 ? (
                  <p className="text-sm text-zinc-500">No open orders.</p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
                    <table className="w-full text-sm">
                      <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
                        <tr>
                          <th className="px-4 py-2 font-medium">Symbol</th>
                          <th className="px-4 py-2 font-medium">Side</th>
                          <th className="px-4 py-2 font-medium">Type</th>
                          <th className="px-4 py-2 font-medium">Quantity</th>
                          <th className="px-4 py-2 font-medium">Price</th>
                          <th className="px-4 py-2 font-medium">Status</th>
                          <th className="px-4 py-2 font-medium">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                        {(accountQuery.data.openOrders ?? []).map((order) => (
                          <tr key={order.id}>
                            <td className="px-4 py-2 font-mono">{order.symbol}</td>
                            <td
                              className={cn(
                                "px-4 py-2 font-mono uppercase",
                                order.side === "buy"
                                  ? "text-emerald-600 dark:text-emerald-400"
                                  : "text-red-600 dark:text-red-400",
                              )}
                            >
                              {order.side}
                            </td>
                            <td className="px-4 py-2 font-mono uppercase">{order.type}</td>
                            <td className="px-4 py-2 font-mono">{order.quantity}</td>
                            <td className="px-4 py-2 font-mono">{tableCell(order.price)}</td>
                            <td className="px-4 py-2 font-mono">{order.status}</td>
                            <td className="px-4 py-2">
                              {order.localId ? (
                                <button
                                  type="button"
                                  onClick={() => handleCancel(order)}
                                  disabled={cancelMutation.isPending}
                                  className="rounded-lg border border-red-300 px-2.5 py-1 text-xs font-medium text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20"
                                >
                                  Cancel
                                </button>
                              ) : (
                                <span className="text-xs text-zinc-500">external</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {cancelMutation.isError ? (
                  <p className="mt-3 text-sm text-red-600 dark:text-red-400">
                    Failed to cancel: {(cancelMutation.error as Error).message}
                  </p>
                ) : null}
              </section>
            </>
          ) : null}
        </>
      ) : null}

      <Link
        href="/bots"
        className="mt-10 inline-block rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        ← Back to bots
      </Link>
    </main>
  );
}
