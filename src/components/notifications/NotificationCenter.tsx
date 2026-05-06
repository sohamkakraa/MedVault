"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, CheckCheck, X } from "lucide-react";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/Popover";
import {
  getStore,
  markNotificationRead,
  markAllNotificationsRead,
  dismissNotification,
} from "@/lib/store";
import type { UmaNotification } from "@/lib/types";

/* ── helpers ─────────────────────────────────────────────── */
function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function kindIcon(kind: UmaNotification["kind"]) {
  switch (kind) {
    case "med_reminder":    return "💊";
    case "med_missed_auto": return "⚠️";
    case "lab_flag":        return "🧪";
    case "cycle_period_soon":
    case "cycle_fertile":   return "🌸";
    case "next_visit":      return "🏥";
    case "family_risk_flag": return "🧬";
    default:                return "🔔";
  }
}

/* ── component ───────────────────────────────────────────── */
export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<UmaNotification[]>([]);
  const listRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [hasMore, setHasMore] = useState(false);

  function refresh() {
    setNotifications((getStore().notifications ?? []).slice(0, 50));
  }

  useEffect(() => {
    const on = () => refresh();
    const timer = setTimeout(() => refresh(), 0);
    window.addEventListener("mv-store-update", on);
    window.addEventListener("uma-notification-added", on);
    window.addEventListener("focus", on);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("mv-store-update", on);
      window.removeEventListener("uma-notification-added", on);
      window.removeEventListener("focus", on);
    };
  }, []);

  // Auto-mark-read on open after 600 ms
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      markAllNotificationsRead();
      refresh();
    }, 600);
    return () => clearTimeout(timer);
  }, [open]);

  // Scroll indicator
  useEffect(() => {
    const sentinel = sentinelRef.current;
    const list = listRef.current;
    if (!sentinel || !list) return;
    const obs = new IntersectionObserver(
      ([entry]) => setHasMore(!entry.isIntersecting),
      { root: list, threshold: 0.1 }
    );
    obs.observe(sentinel);
    return () => obs.disconnect();
  }, [notifications]);

  const unread = notifications.filter((n) => !n.readAtISO).length;

  function handleDismiss(id: string) {
    dismissNotification(id);
    refresh();
  }

  function handleRead(id: string) {
    markNotificationRead(id);
    refresh();
  }

  function handleMarkAll() {
    markAllNotificationsRead();
    refresh();
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {/* Bell button */}
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Notifications${unread > 0 ? ` — ${unread} unread` : ""}`}
          className="relative h-8 w-8 rounded-xl flex items-center justify-center border border-[var(--border)] bg-[var(--panel-2)] text-[var(--muted)] hover:text-[var(--fg)] hover:border-[var(--fg)]/30 transition-colors"
        >
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-[var(--accent)] text-[var(--accent-contrast)] text-[9px] font-bold flex items-center justify-center leading-none">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>

      {/* Panel */}
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[360px] max-w-[calc(100vw-1rem)] p-0 flex flex-col overflow-hidden"
        style={{ maxHeight: "min(540px, 80dvh)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] shrink-0">
          <span className="text-sm font-semibold">Notifications</span>
          <div className="flex items-center gap-1">
            {unread > 0 && (
              <button
                type="button"
                onClick={handleMarkAll}
                title="Mark all as read"
                className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium text-[var(--muted)] hover:text-[var(--fg)] hover:bg-[var(--panel-2)] transition-colors"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Mark all read
              </button>
            )}
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close notifications"
              className="h-8 w-8 rounded-lg flex items-center justify-center text-[var(--muted)] hover:text-[var(--fg)] hover:bg-[var(--panel-2)] transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* List */}
        <div className="overflow-y-auto flex-1 relative" ref={listRef}>
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-14 text-center px-6">
              <span className="text-4xl" aria-hidden>🔔</span>
              <p className="text-sm font-medium text-[var(--fg)]">You&apos;re all caught up</p>
              <p className="text-xs text-[var(--muted)]">No new notifications right now.</p>
            </div>
          ) : (
            <>
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className={[
                    "flex gap-3 px-4 py-4 border-b border-[var(--border)] transition-colors",
                    !n.readAtISO ? "bg-[var(--accent)]/5" : "",
                  ].join(" ")}
                >
                  {/* Unread dot */}
                  {!n.readAtISO && (
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[var(--accent)]" aria-label="Unread" />
                  )}
                  {n.readAtISO && <span className="mt-1.5 h-2 w-2 shrink-0" />}

                  {/* Icon */}
                  <span className="text-xl shrink-0 mt-0.5" aria-hidden>{kindIcon(n.kind)}</span>

                  {/* Text content */}
                  <div className="flex-1 min-w-0" onClick={() => !n.readAtISO && handleRead(n.id)}>
                    <p className="text-sm font-semibold text-[var(--fg)] leading-snug">{n.title}</p>
                    <p className="text-sm text-[var(--muted)] mt-0.5 leading-snug">{n.body}</p>
                    <p className="text-xs text-[var(--muted)] mt-1 opacity-70">{timeAgo(n.createdAtISO)}</p>
                    {n.actionHref && n.actionLabel && (
                      <Link
                        href={n.actionHref}
                        onClick={() => { handleRead(n.id); setOpen(false); }}
                        className="inline-flex items-center gap-1 mt-2 text-sm font-medium text-[var(--accent)] hover:underline"
                      >
                        {n.actionLabel} →
                      </Link>
                    )}
                  </div>

                  {/* Single dismiss button — always visible, large tap target */}
                  <button
                    type="button"
                    onClick={() => handleDismiss(n.id)}
                    aria-label={`Dismiss notification: ${n.title}`}
                    title="Dismiss"
                    className="shrink-0 self-start mt-0.5 h-9 w-9 rounded-xl flex items-center justify-center text-[var(--muted)] hover:text-[var(--fg)] hover:bg-[var(--panel-2)] transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <div ref={sentinelRef} style={{ height: 1 }} />
            </>
          )}

          {/* Scroll-more indicator */}
          {hasMore && (
            <div
              className="absolute bottom-0 left-0 right-0 h-8 pointer-events-none"
              style={{ background: "linear-gradient(to bottom, transparent, var(--panel))" }}
            >
              <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex gap-1">
                <span className="h-1 w-1 rounded-full bg-[var(--muted)] opacity-60 animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="h-1 w-1 rounded-full bg-[var(--muted)] opacity-60 animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="h-1 w-1 rounded-full bg-[var(--muted)] opacity-60 animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
