"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";

export default function DashboardPage() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, user, router]);

  async function handleLogout(): Promise<void> {
    setLoggingOut(true);
    try {
      await logout();
      router.replace("/login");
    } catch {
      // Session is cleared locally regardless.
      router.replace("/login");
    }
  }

  if (loading) {
    return (
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-16">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Loading session…</p>
      </main>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-16">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Dashboard
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Welcome back.</p>
      </header>

      <section className="rounded-xl border border-zinc-200 p-6 dark:border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Account</h2>
        <dl className="mt-4 space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
          <div className="flex justify-between">
            <dt>Email</dt>
            <dd className="font-mono">{user.email}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Role</dt>
            <dd className="font-mono">{user.role}</dd>
          </div>
        </dl>
      </section>

      <div className="mt-8 flex gap-4">
        <Link
          href="/bots"
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-50 transition-colors hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Bots
        </Link>

        <Link
          href="/live-broker"
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Live broker
        </Link>

        <Link
          href="/analytics"
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Analytics
        </Link>

        <Link
          href="/"
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Health
        </Link>

        <button
          type="button"
          onClick={handleLogout}
          disabled={loggingOut}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-50 transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {loggingOut ? "Signing out…" : "Sign out"}
        </button>
      </div>
    </main>
  );
}
