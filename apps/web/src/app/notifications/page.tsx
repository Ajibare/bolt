"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/components/auth-provider";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type AppNotification,
} from "@/lib/notifications";

function formatTime(timestamp: string): string {
  return new Date(timestamp).toLocaleString();
}

function severityDot(severity: AppNotification["severity"]): string {
  if (severity === "error") {
    return "bg-red-500";
  }
  if (severity === "warn") {
    return "bg-amber-500";
  }
  return "bg-emerald-500";
}

function NotificationRow({
  notification,
  onMarkRead,
}: {
  notification: AppNotification;
  onMarkRead: (id: string) => void;
}) {
  const unread = notification.readAt === null;
  return (
    <li
      className={[
        "border-t border-zinc-200 dark:border-zinc-800",
        unread ? "bg-zinc-50 dark:bg-zinc-900/50" : "",
      ].join(" ")}
    >
      <div className="flex items-start gap-3 px-4 py-4">
        <span
          className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${severityDot(notification.severity)}`}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className="truncate font-medium text-zinc-900 dark:text-zinc-50">
              {notification.title}
            </p>
            <span className="shrink-0 text-xs text-zinc-400">
              {formatTime(notification.createdAt)}
            </span>
          </div>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{notification.body}</p>
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="font-mono text-xs uppercase text-zinc-400">{notification.type}</span>
            <div className="flex items-center gap-3">
              {unread && (
                <button
                  type="button"
                  className="text-xs font-medium text-zinc-500 underline-offset-2 hover:underline dark:text-zinc-300"
                  onClick={() => onMarkRead(notification.id)}
                >
                  Mark read
                </button>
              )}
              {notification.link && (
                <Link
                  href={notification.link}
                  className="text-xs font-medium text-zinc-700 underline-offset-2 hover:underline dark:text-zinc-200"
                >
                  View
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </li>
  );
}

export default function NotificationsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, user, router]);

  const notificationsQuery = useQuery({
    queryKey: ["notifications"],
    queryFn: () => listNotifications(),
    enabled: !!user,
  });

  const markReadMutation = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  if (loading || notificationsQuery.isPending) {
    return (
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Loading…</p>
      </main>
    );
  }

  if (!user) {
    return null;
  }

  const notifications = notificationsQuery.data?.notifications ?? [];
  const unreadCount = notificationsQuery.data?.unreadCount ?? 0;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-16">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Notifications
          </h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Platform events for your account — bot lifecycle today; risk, orders and broker events
            next.
          </p>
        </div>
        {unreadCount > 0 && (
          <button
            type="button"
            disabled={markAllReadMutation.isPending}
            onClick={() => markAllReadMutation.mutate()}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            {markAllReadMutation.isPending ? "Marking…" : "Mark all read"}
          </button>
        )}
      </header>

      {notificationsQuery.isError ? (
        <p className="text-sm text-red-600 dark:text-red-400">Failed to load notifications.</p>
      ) : notifications.length === 0 ? (
        <section className="rounded-xl border border-zinc-200 p-6 dark:border-zinc-800">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            No notifications yet. Start or stop a bot to receive your first lifecycle events.
          </p>
        </section>
      ) : (
        <>
          <p className="mb-2 text-sm text-zinc-600 dark:text-zinc-400">
            {unreadCount} unread · showing the {notifications.length} most recent
          </p>
          <ul className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
            {notifications.map((notification) => (
              <NotificationRow
                key={notification.id}
                notification={notification}
                onMarkRead={(id) => markReadMutation.mutate(id)}
              />
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
