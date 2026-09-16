"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CANDLE_INTERVALS,
  SUPPORTED_SYMBOLS,
  type CandleInterval,
  type SupportedSymbol,
} from "@trading-bolt/shared";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/components/auth-provider";
import {
  createBot,
  emergencyStopBot,
  listBots,
  listPaperAccounts,
  listRunCycles,
  listStrategies,
  monitorBot,
  pauseBot,
  recoverBot,
  resumeBot,
  startBot,
  stopBot,
  type Bot,
  type BotRunCycle,
  type StrategySummary,
} from "@/lib/bots";
import { cn } from "@/lib/utils";
import { listBrokers } from "@/lib/brokers";

const SMA_CROSSOVER_ID = "sma-crossover";
const RSI_MEAN_REVERSION_ID = "rsi-mean-reversion";

const LIVE_MODE_TO_ENVIRONMENT: Record<string, "demo" | "testnet" | "mainnet"> = {
  DEMO: "demo",
  TESTNET: "testnet",
  LIVE: "mainnet",
};

const EXECUTION_MODES = ["PAPER", "DEMO", "TESTNET", "LIVE"] as const;

const inputClass =
  "rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

type LifecycleAction = "start" | "pause" | "resume" | "stop" | "recover";

function percentToDecimal(percent: number): string {
  return (percent / 100).toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case "RUNNING":
      return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300";
    case "PAUSED":
      return "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300";
    case "ERROR":
      return "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300";
    case "STARTING":
    case "STOPPING":
      return "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300";
    default:
      return "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400";
  }
}

function modeBadgeClass(mode: string): string {
  switch (mode) {
    case "LIVE":
      return "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300";
    case "TESTNET":
      return "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300";
    case "DEMO":
      return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300";
    default:
      return "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400";
  }
}

function ConfigEditor({
  strategyId,
  config,
  onChange,
}: {
  strategyId: string;
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}) {
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

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      {Object.entries(fields).map(([key, field]) => (
        <label key={key} className="flex flex-col gap-1.5 text-sm text-zinc-700 dark:text-zinc-300">
          {field.label}
          <input
            type="number"
            value={(config[key] as number | undefined) ?? field.default}
            onChange={(event) => onChange({ ...config, [key]: Number(event.target.value) })}
            className={inputClass}
          />
        </label>
      ))}
    </div>
  );
}

export default function BotsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [name, setName] = useState("Bot 1");
  const [strategyId, setStrategyId] = useState<string>(SMA_CROSSOVER_ID);
  const [symbol, setSymbol] = useState<SupportedSymbol>(SUPPORTED_SYMBOLS[0]);
  const [interval, setInterval] = useState<CandleInterval>("1h");
  const [config, setConfig] = useState<Record<string, unknown>>({
    kind: SMA_CROSSOVER_ID,
    fastPeriod: 5,
    slowPeriod: 20,
  });
  const [paperAccountId, setPaperAccountId] = useState("");
  const [executionMode, setExecutionMode] = useState<string>("PAPER");
  const [quantity, setQuantity] = useState("1");
  const [stopLossPercent, setStopLossPercent] = useState("2");
  const [takeProfitPercent, setTakeProfitPercent] = useState("");
  const [maxRiskPerTrade, setMaxRiskPerTrade] = useState(1);
  const [maxPositionSize, setMaxPositionSize] = useState(10);
  const [maxDailyLoss, setMaxDailyLoss] = useState(5);
  const [monitoringBotId, setMonitoringBotId] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, user, router]);

  const strategiesQuery = useQuery({
    queryKey: ["strategies"],
    queryFn: () => listStrategies(),
    staleTime: 60_000,
  });

  const accountsQuery = useQuery({
    queryKey: ["paper-accounts"],
    queryFn: () => listPaperAccounts(),
    staleTime: 30_000,
  });

  const brokersQuery = useQuery({
    queryKey: ["brokers"],
    queryFn: () => listBrokers(),
    staleTime: 30_000,
  });

  const botsQuery = useQuery({
    queryKey: ["bots"],
    queryFn: () => listBots(),
    staleTime: 0,
    refetchInterval: 10_000,
  });

  const monitorQuery = useQuery({
    queryKey: ["bots", monitoringBotId, "monitor"],
    queryFn: () => monitorBot(monitoringBotId as string),
    enabled: monitoringBotId !== null,
    staleTime: 5_000,
    refetchInterval: 5_000,
  });

  const activeRunId = monitorQuery.data?.activeRun?.id ?? null;
  const cyclesQuery = useQuery({
    queryKey: ["bots", monitoringBotId, "monitor", "cycles", activeRunId],
    queryFn: () => listRunCycles(monitoringBotId as string, activeRunId as string),
    enabled: monitoringBotId !== null && activeRunId !== null,
    staleTime: 5_000,
    refetchInterval: 5_000,
  });

  const lifecycles = {
    start: startBot,
    pause: pauseBot,
    resume: resumeBot,
    stop: stopBot,
    recover: recoverBot,
  };

  const lifecycleMutation = useMutation({
    mutationFn: async ({ action, botId }: { action: LifecycleAction; botId: string }) =>
      lifecycles[action](botId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bots"] });
    },
  });

  const emergencyStopMutation = useMutation({
    mutationFn: emergencyStopBot,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bots"] });
    },
  });

  const createMutation = useMutation({
    mutationFn: createBot,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bots"] });
      setName("Bot 1");
      setExecutionMode("PAPER");
    },
  });

  const bybit = brokersQuery.data?.find((executor) => executor.provider === "bybit");
  const brokerAvailable = bybit?.available ?? false;
  const brokerEnvironment = bybit?.environment ?? "paper";

  function isModeAvailable(mode: string): boolean {
    if (mode === "PAPER") {
      return true;
    }
    return brokerAvailable && brokerEnvironment === LIVE_MODE_TO_ENVIRONMENT[mode];
  }

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

  function handleCreate(event: FormEvent): void {
    event.preventDefault();
    const riskConfig: Record<string, unknown> = {
      maxRiskPerTrade: percentToDecimal(maxRiskPerTrade),
      maxPositionSize: percentToDecimal(maxPositionSize),
      maxDailyLoss: percentToDecimal(maxDailyLoss),
    };
    createMutation.mutate({
      name,
      strategyId,
      symbol,
      interval,
      config,
      riskConfig,
      paperAccountId,
      executionMode,
      quantity,
      stopLossPercent: (Number(stopLossPercent) / 100).toString(),
      takeProfitPercent: takeProfitPercent
        ? (Number(takeProfitPercent) / 100).toString()
        : undefined,
    });
  }

  function runLifecycle(action: LifecycleAction, bot: Bot): void {
    lifecycleMutation.mutate({ action, botId: bot.id });
  }

  function handleEmergencyStop(bot: Bot): void {
    const confirmed = window.confirm(
      `Emergency stop ${bot.name}? Open live orders on ${bot.symbol} will be cancelled and the broker-held position flattened.`,
    );
    if (confirmed) {
      emergencyStopMutation.mutate(bot.id);
    }
  }

  const strategies = strategiesQuery.data ?? [];
  const accounts = accountsQuery.data ?? [];
  const bots = botsQuery.data ?? [];

  if (loading) {
    return (
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-16">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Loading session…</p>
      </main>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-16">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Bots
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Bind a strategy to an account, pick an execution mode, and choose inherited risk limits.
          PAPER runs simulated; DEMO/TESTNET/LIVE route risk-checked orders to Bybit.
        </p>
        <Link
          href="/live-broker"
          className="mt-3 inline-block rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Live broker monitor
        </Link>
      </header>

      <form
        onSubmit={handleCreate}
        className="rounded-xl border border-zinc-200 p-6 dark:border-zinc-800"
      >
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Create bot</h2>

        <label className="mt-4 flex flex-col gap-1.5 text-sm text-zinc-700 dark:text-zinc-300">
          Name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={inputClass}
          />
        </label>

        <div className="mt-4 flex flex-wrap gap-2">
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

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
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
            Paper account
            <select
              value={paperAccountId}
              onChange={(event) => setPaperAccountId(event.target.value)}
              className={inputClass}
            >
              <option value="">Select account…</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name} ({account.status})
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <label className="flex flex-col gap-1.5 text-sm text-zinc-700 dark:text-zinc-300">
            Quantity
            <input
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              className={inputClass}
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm text-zinc-700 dark:text-zinc-300">
            Stop loss (%)
            <input
              type="number"
              min={0}
              max={100}
              value={stopLossPercent}
              onChange={(event) => setStopLossPercent(event.target.value)}
              className={inputClass}
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm text-zinc-700 dark:text-zinc-300">
            Take profit (%) — optional
            <input
              type="number"
              min={0}
              max={100}
              value={takeProfitPercent}
              onChange={(event) => setTakeProfitPercent(event.target.value)}
              className={inputClass}
            />
          </label>
        </div>

        <div className="mt-6">
          <ConfigEditor strategyId={strategyId} config={config} onChange={setConfig} />
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <label className="flex flex-col gap-1.5 text-sm text-zinc-700 dark:text-zinc-300">
            Max risk per trade (%)
            <input
              type="number"
              min={0}
              max={100}
              value={maxRiskPerTrade}
              onChange={(event) => setMaxRiskPerTrade(Number(event.target.value))}
              className={inputClass}
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm text-zinc-700 dark:text-zinc-300">
            Max position size (% of equity)
            <input
              type="number"
              min={0}
              max={100}
              value={maxPositionSize}
              onChange={(event) => setMaxPositionSize(Number(event.target.value))}
              className={inputClass}
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm text-zinc-700 dark:text-zinc-300">
            Max daily loss (%)
            <input
              type="number"
              min={0}
              max={100}
              value={maxDailyLoss}
              onChange={(event) => setMaxDailyLoss(Number(event.target.value))}
              className={inputClass}
            />
          </label>
        </div>

        <div className="mt-6">
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">Execution mode</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {EXECUTION_MODES.map((mode) => {
              const available = isModeAvailable(mode);
              const isLive = mode !== "PAPER";
              return (
                <button
                  key={mode}
                  type="button"
                  disabled={!available}
                  onClick={() => setExecutionMode(mode)}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                    mode === executionMode
                      ? "border-zinc-900 bg-zinc-900 text-zinc-50 dark:border-zinc-50 dark:bg-zinc-50 dark:text-zinc-900"
                      : "border-zinc-300 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800",
                  )}
                >
                  {mode}
                  {isLive && !available ? " (unavailable)" : ""}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            PAPER runs against the simulated broker. DEMO, TESTNET and LIVE route risk-checked
            orders to Bybit (mode↔environment match with BYBIT_API_KEY/BYBIT_API_SECRET; the server
            enforces this — the selection below is advisory).
          </p>
          {executionMode !== "PAPER" ? (
            brokerAvailable ? (
              <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">
                Broker configured for <span className="font-mono">{brokerEnvironment}</span> —{" "}
                {executionMode} orders run on the live endpoint.
              </p>
            ) : (
              <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                Live broker not configured — set BYBIT_API_KEY/BYBIT_API_SECRET to enable live
                modes.
              </p>
            )
          ) : null}
        </div>

        {createMutation.isError ? (
          <p className="mt-4 text-sm text-red-600 dark:text-red-400">
            Failed to create bot: {(createMutation.error as Error).message}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={
            createMutation.isPending || paperAccountId === "" || !isModeAvailable(executionMode)
          }
          className="mt-6 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-50 transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {createMutation.isPending ? "Creating…" : "Create bot"}
        </button>
      </form>

      <section className="mt-10">
        <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-50">Your bots</h2>
        {emergencyStopMutation.isError ? (
          <p className="mb-4 text-sm text-red-600 dark:text-red-400">
            Emergency stop failed: {(emergencyStopMutation.error as Error).message}
          </p>
        ) : null}
        {botsQuery.isPending ? (
          <p className="text-sm text-zinc-500">Loading bots…</p>
        ) : bots.length > 0 ? (
          <ul className="space-y-3">
            {bots.map((bot) => (
              <li
                key={bot.id}
                className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-zinc-900 dark:text-zinc-100">
                        {bot.name}
                      </span>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-xs font-medium",
                          modeBadgeClass(bot.executionMode),
                        )}
                      >
                        {bot.executionMode}
                      </span>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-xs font-medium",
                          statusBadgeClass(bot.status),
                        )}
                      >
                        {bot.status}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-zinc-500">
                      {bot.strategyId} · {bot.symbol} · {bot.interval}
                    </p>
                    {bot.lastError ? (
                      <p className="mt-1 text-sm text-red-600 dark:text-red-400">{bot.lastError}</p>
                    ) : bot.lastSignalDirection ? (
                      <p className="mt-1 text-sm text-zinc-500">
                        Last signal:{" "}
                        <span className="font-mono uppercase">{bot.lastSignalDirection}</span>
                        {bot.lastSignalReason ? ` — ${bot.lastSignalReason}` : ""}
                      </p>
                    ) : null}
                    {bot.lastOrderSymbol ? (
                      <p className="mt-0.5 text-sm text-zinc-500">
                        Last order: {bot.lastOrderStatus} {bot.lastOrderSymbol}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setMonitoringBotId(monitoringBotId === bot.id ? null : bot.id)}
                      className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      {monitoringBotId === bot.id ? "Hide monitor" : "Monitor"}
                    </button>

                    {bot.executionMode !== "PAPER" &&
                    ["RUNNING", "PAUSED", "STARTING", "STOPPING"].includes(bot.status) ? (
                      <button
                        type="button"
                        onClick={() => handleEmergencyStop(bot)}
                        disabled={emergencyStopMutation.isPending}
                        className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Emergency stop
                      </button>
                    ) : null}

                    {bot.status === "RUNNING" ? (
                      <>
                        <button
                          type="button"
                          onClick={() => runLifecycle("pause", bot)}
                          disabled={lifecycleMutation.isPending}
                          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                        >
                          Pause
                        </button>
                        <button
                          type="button"
                          onClick={() => runLifecycle("stop", bot)}
                          disabled={lifecycleMutation.isPending}
                          className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-zinc-50 transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
                        >
                          Stop
                        </button>
                      </>
                    ) : null}

                    {bot.status === "PAUSED" ? (
                      <>
                        <button
                          type="button"
                          onClick={() => runLifecycle("resume", bot)}
                          disabled={lifecycleMutation.isPending}
                          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                        >
                          Resume
                        </button>
                        <button
                          type="button"
                          onClick={() => runLifecycle("stop", bot)}
                          disabled={lifecycleMutation.isPending}
                          className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-zinc-50 transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
                        >
                          Stop
                        </button>
                      </>
                    ) : null}

                    {bot.status === "ERROR" ? (
                      <button
                        type="button"
                        onClick={() => runLifecycle("recover", bot)}
                        disabled={lifecycleMutation.isPending}
                        className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                      >
                        Recover
                      </button>
                    ) : null}

                    {bot.status === "DRAFT" || bot.status === "STOPPED" ? (
                      <button
                        type="button"
                        onClick={() => runLifecycle("start", bot)}
                        disabled={lifecycleMutation.isPending}
                        className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-zinc-50 transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
                      >
                        Start
                      </button>
                    ) : null}
                  </div>
                </div>

                {monitoringBotId === bot.id ? (
                  <div className="mt-4 border-t border-zinc-100 pt-4 dark:border-zinc-800">
                    {monitorQuery.isPending ? (
                      <p className="text-sm text-zinc-500">Loading monitor…</p>
                    ) : monitorQuery.isError ? (
                      <p className="text-sm text-red-600 dark:text-red-400">
                        {(monitorQuery.error as Error).message}
                      </p>
                    ) : monitorQuery.data ? (
                      <>
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                          {(() => {
                            const { portfolio, position, activeRun } = monitorQuery.data;
                            const gems: Array<Array<string | number | null>> = [
                              ["Equity", portfolio.equity],
                              ["Cash", portfolio.cash],
                              ["Position value", portfolio.positionValue],
                              ["Realized P&L", portfolio.realizedPnl],
                            ];
                            if (position) {
                              gems.push(["Position", `${position.symbol} ${position.quantity}`]);
                              gems.push(["Avg entry", position.avgEntryPrice]);
                              gems.push(["Mark", position.markPrice]);
                              gems.push(["Unrealized P&L", position.unrealizedPnl]);
                            }
                            if (activeRun) {
                              gems.push(["Cycles", activeRun.cyclesRun]);
                              gems.push(["Orders placed", activeRun.ordersPlaced]);
                              gems.push(["Orders rejected", activeRun.ordersRejected]);
                            }
                            return gems.map(([label, value]) => (
                              <div
                                key={String(label)}
                                className="rounded-lg bg-zinc-50 p-3 text-sm dark:bg-zinc-900"
                              >
                                <dt className="text-xs text-zinc-500 dark:text-zinc-400">
                                  {label}
                                </dt>
                                <dd className="mt-0.5 font-mono text-zinc-900 dark:text-zinc-100">
                                  {value ?? "—"}
                                </dd>
                              </div>
                            ));
                          })()}
                        </div>

                        {cyclesQuery.isPending ? (
                          <p className="mt-4 text-sm text-zinc-500">Loading cycles…</p>
                        ) : cyclesQuery.isError ? (
                          <p className="mt-4 text-sm text-red-600 dark:text-red-400">
                            {(cyclesQuery.error as Error).message}
                          </p>
                        ) : (cyclesQuery.data ?? []).length > 0 ? (
                          <div className="mt-4">
                            <h3 className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                              Cycle history
                            </h3>
                            <ul className="mt-2 space-y-1">
                              {(cyclesQuery.data ?? []).map((cycle: BotRunCycle) => (
                                <li
                                  key={cycle.id}
                                  className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-zinc-50 px-3 py-1.5 text-sm dark:bg-zinc-900"
                                >
                                  <span className="font-mono text-zinc-500">#{cycle.seq}</span>
                                  <span
                                    className={cn(
                                      "font-mono uppercase",
                                      cycle.signalDirection === "buy"
                                        ? "text-emerald-600 dark:text-emerald-400"
                                        : cycle.signalDirection === "sell"
                                          ? "text-red-600 dark:text-red-400"
                                          : "text-zinc-500",
                                    )}
                                  >
                                    {cycle.signalDirection ?? "—"}
                                  </span>
                                  {cycle.orderStatus ? (
                                    <span className="font-mono text-zinc-700 dark:text-zinc-300">
                                      {cycle.orderStatus} {cycle.orderSymbol}
                                    </span>
                                  ) : cycle.rejectionReason ? (
                                    <span className="text-amber-600 dark:text-amber-400">
                                      {cycle.rejectionReason}
                                    </span>
                                  ) : cycle.error ? (
                                    <span className="text-red-600 dark:text-red-400">
                                      {cycle.error}
                                    </span>
                                  ) : (
                                    <span className="text-zinc-500">—</span>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-zinc-500">No bots yet. Create one above.</p>
        )}
      </section>
    </main>
  );
}
