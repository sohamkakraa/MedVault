"use client";

/**
 * Thread sidebar for the chat page.
 *
 * The sidebar lists every non-archived thread for the signed-in user. The
 * active thread is bold + accented; clicking another thread fires
 * `onSelect(threadId)` and the parent re-loads its messages from the server.
 *
 * Switching threads here also calls `PATCH /api/threads/[id]?active=true`,
 * which means the user's next inbound WhatsApp message will land in the
 * thread they're currently looking at on the web. That single field is the
 * cross-channel sync mechanism.
 *
 * On mobile (<768px) the sidebar collapses behind a button; the user opens
 * it as a sheet and selects a thread. The default-open desktop layout sits
 * on the left at 280px width.
 */
import { useEffect, useState } from "react";
import { Plus, MessageSquare, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";

export type ThreadSummary = {
  id: string;
  title: string | null;
  archivedAt: string | Date | null;
  lastMessageAt: string | Date;
  createdAt: string | Date;
};

export function ThreadSidebar({
  threads,
  activeThreadId,
  onSelect,
  onCreate,
  onArchive,
  loading,
  open,
  onClose,
}: {
  threads: ThreadSummary[];
  activeThreadId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onArchive: (id: string) => void;
  loading: boolean;
  /** Mobile sheet visibility. On desktop the sidebar is always rendered. */
  open: boolean;
  onClose: () => void;
}) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  // Close confirmations when threads list changes (e.g. thread vanished).
  useEffect(() => {
    if (confirmingId && !threads.some((t) => t.id === confirmingId)) {
      setConfirmingId(null);
    }
  }, [threads, confirmingId]);

  const list = (
    <div className="flex h-full flex-col gap-3 p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-[var(--fg)]">Chats</h2>
        <Button type="button" variant="ghost" className="h-8 gap-1.5 px-2" onClick={onCreate}>
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">New</span>
        </Button>
      </div>
      <div className="-mx-1 flex-1 overflow-y-auto pr-1">
        {loading && threads.length === 0 ? (
          <p className="px-3 py-2 text-xs mv-muted">Loading…</p>
        ) : null}
        {!loading && threads.length === 0 ? (
          <p className="px-3 py-2 text-xs mv-muted">No chats yet. Start a new one.</p>
        ) : null}
        <ul className="space-y-1">
          {threads.map((t) => {
            const isActive = t.id === activeThreadId;
            const title = t.title?.trim() || synthesizedTitle(t);
            const subtitle = formatRelative(t.lastMessageAt);
            const isConfirming = confirmingId === t.id;
            return (
              <li key={t.id}>
                <div
                  className={
                    "group flex items-start gap-2 rounded-xl border px-3 py-2 transition-colors " +
                    (isActive
                      ? "border-[var(--accent)]/40 bg-[var(--accent)]/8"
                      : "border-transparent hover:bg-[var(--panel-2)]")
                  }
                >
                  <button
                    type="button"
                    onClick={() => onSelect(t.id)}
                    className="flex min-w-0 flex-1 items-start gap-2 text-left"
                  >
                    <MessageSquare
                      className={
                        "mt-0.5 h-4 w-4 shrink-0 " +
                        (isActive ? "text-[var(--accent)]" : "mv-muted")
                      }
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className={
                          "block truncate text-sm " +
                          (isActive ? "font-semibold text-[var(--fg)]" : "text-[var(--fg)]")
                        }
                      >
                        {title}
                      </span>
                      <span className="block truncate text-[11px] mv-muted">{subtitle}</span>
                    </span>
                  </button>
                  {isConfirming ? (
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        onClick={() => setConfirmingId(null)}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        className="h-7 px-2 text-xs"
                        onClick={() => {
                          onArchive(t.id);
                          setConfirmingId(null);
                        }}
                      >
                        Delete
                      </Button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      aria-label="Delete this chat"
                      onClick={(e) => {
                        e.stopPropagation();
                        setConfirmingId(t.id);
                      }}
                      className="invisible h-7 w-7 shrink-0 rounded-md text-[var(--muted)] hover:bg-[var(--panel)] hover:text-red-400 group-hover:visible"
                    >
                      <Trash2 className="mx-auto h-4 w-4" aria-hidden />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop: sticks left at 280px */}
      <aside className="hidden h-full w-[280px] shrink-0 border-r border-[var(--border)] bg-[var(--panel)]/40 md:block">
        {list}
      </aside>

      {/* Mobile: slides in as a sheet */}
      {open ? (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/40" onClick={onClose} />
          <div className="absolute left-0 top-0 h-full w-[300px] bg-[var(--panel)] shadow-2xl">
            <div className="flex items-center justify-between border-b border-[var(--border)] p-2">
              <span className="px-2 text-sm font-semibold">Your chats</span>
              <Button type="button" variant="ghost" className="h-8 w-8 p-0" onClick={onClose}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            {list}
          </div>
        </div>
      ) : null}
    </>
  );
}

function synthesizedTitle(t: ThreadSummary): string {
  const d = new Date(t.createdAt);
  if (Number.isNaN(d.getTime())) return "Chat";
  return `Chat from ${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}

function formatRelative(when: string | Date): string {
  const d = when instanceof Date ? when : new Date(when);
  if (Number.isNaN(d.getTime())) return "";
  const diff = Date.now() - d.getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.round(h / 24);
  if (days < 14) return `${days}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
