"use client";

import type { ServiceHealth } from "@trading-bolt/shared";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/+$/, "");

interface CheckState {
  state: "loading" | "ok" | "error";
  health?: ServiceHealth;
  error?: string;
}

async function fetchHealth(path: string): Promise<ServiceHealth> {
  const response = await fetch(`${API_URL}${path}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return (await response.json()) as ServiceHealth;
}

function useHealthCheck(path: string): CheckState {
  const [check, setCheck] = useState<CheckState>({ state: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function run(): Promise<void> {
      try {
        const health = await fetchHealth(path);
        if (!cancelled) {
          setCheck({ state: "ok", health });
        }
      } catch (error) {
        if (!cancelled) {
          setCheck({ state: "error", error: (error as Error).message });
        }
      }
    }

    void run();
    const interval = window.setInterval(() => void run(), 15000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [path]);

  return check;
}

function StatusPill({ status }: { status: "loading" | "ok" | "error" }) {
  return (
    <span
      className={cn(
        "inline-flex h-2.5 w-2.5 rounded-full",
        status === "ok" && "bg-emerald-500",
        status === "error" && "bg-red-500",
        status === "loading" && "bg-amber-400",
      )}
      aria-hidden
    />
  );
}

function StatusCard({ title, check }: { title: string; check: CheckState }) {
  return (
    <section className="rounded-xl border border-zinc-200 p-6 dark:border-zinc-800">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{title}</h2>
        <StatusPill status={check.state} />
      </div>
      {check.state === "ok" && check.health ? (
        <dl className="mt-4 space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
          <div className="flex justify-between">
            <dt>Status</dt>
            <dd className="font-mono">{check.health.status}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Environment</dt>
            <dd className="font-mono">{check.health.environment}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Uptime</dt>
            <dd className="font-mono">{check.health.uptimeSeconds}s</dd>
          </div>
          {Object.entries(check.health.components ?? {}).map(([name, component]) => (
            <div key={name} className="flex justify-between">
              <dt>{name}</dt>
              <dd className="font-mono">{component.status}</dd>
            </div>
          ))}
        </dl>
      ) : check.state === "error" ? (
        <p className="mt-4 text-sm text-red-600 dark:text-red-400">{check.error}</p>
      ) : (
        <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-500">Checking…</p>
      )}
    </section>
  );
}

export default function HomePage() {
  const liveness = useHealthCheck("/api/health");
  const readiness = useHealthCheck("/api/ready");

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-16">
      <header className="mb-10">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Trading Bolt
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          API endpoint: <code className="font-mono">{API_URL}</code>
        </p>
      </header>
      <div className="grid gap-6">
        <StatusCard title="Liveness" check={liveness} />
        <StatusCard title="Readiness" check={readiness} />
      </div>
    </main>
  );
}
