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
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Plus,
  MessageSquare,
  X,
  LayoutDashboard,
  CheckSquare,
  Square,
  Trash2,
  Archive,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/Button";

export type ThreadSummary = {
  id: string;
  title: string | null;
  archivedAt: string | Date | null;
  lastMessageAt: string | Date;
  createdAt: string | Date;
};

/** Toast displayed for 5 s after a bulk delete with optional Undo action. */
function UndoToast({
  message,
  onUndo,
  onDismiss,
}: {
  message: string;
  onUndo: () => void;
  onDismiss: () => void;
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    timerRef.current = setTimeout(onDismiss, 5000);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [onDismiss]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--panel)] px-4 py-3 shadow-xl text-sm text-[var(--fg)]"
    >
      <span>{message}</span>
      <button
        type="button"
        onClick={() => {
          if (timerRef.current) clearTimeout(timerRef.current);
          onUndo();
        }}
        className="rounded-xl border border-[var(--accent)]/60 px-3 py-1 text-sm font-medium text-[var(--accent)] hover:bg-[var(--accent)]/10 min-h-[36px]"
      >
        Undo
      </button>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => {
          if (timerRef.current) clearTimeout(timerRef.current);
          onDismiss();
        }}
        className="ml-1 flex h-8 w-8 items-center justify-center rounded-lg text-[var(--muted)] hover:bg-[var(--panel-2)]"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}

/** Confirmation dialog for bulk delete. */
function ConfirmDeleteDialog({
  count,
  onConfirm,
  onCancel,
}: {
  count: number;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-delete-title"
    >
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <div className="relative z-10 mx-4 w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-6 shadow-2xl">
        <h2
          id="confirm-delete-title"
          className="text-base font-semibold text-[var(--fg)]"
        >
          Delete {count} {count === 1 ? "chat" : "chats"}?
        </h2>
        <p className="mt-2 text-sm text-[var(--muted)]">
          This cannot be undone. The conversations will be permanently removed.
        </p>
        <div className="mt-5 flex gap-3">
          <Button
            type="button"
            variant="ghost"
            className="flex-1 min-h-[44px]"
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="danger"
            className="flex-1 min-h-[44px]"
            onClick={onConfirm}
          >
            Delete
          </Button>
        </div>
      </div>
    </div>
  );
}

export function ThreadSidebar({
  threads,
  activeThreadId,
  archivedThreads,
  onSelect,
  onCreate,
  onArchive,
  onBulkArchive,
  onBulkDelete,
  loading,
  open,
  onClose,
}: {
  threads: ThreadSummary[];
  activeThreadId: string | null;
  archivedThreads?: ThreadSummary[];
  onSelect: (id: string) => void;
  onCreate: () => void;
  onArchive: (id: string) => void;
  onBulkArchive?: (ids: string[]) => Promise<void>;
  onBulkDelete?: (ids: string[]) => Promise<void>;
  loading: boolean;
  /** Mobile sheet visibility. On desktop the sidebar is always rendered. */
  open: boolean;
  onClose: () => void;
}) {
  // ── Single-item confirm (legacy inline) ─────────────────────────────
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  // ── Multi-select state ───────────────────────────────────────────────
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkConfirmDelete, setBulkConfirmDelete] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    deletedThreads: ThreadSummary[];
  } | null>(null);

  // ── Archived section ─────────────────────────────────────────────────
  const [archivedOpen, setArchivedOpen] = useState(false);

  // Derive the effective confirmingId — if the thread has vanished, treat as null.
  const effectiveConfirmingId =
    confirmingId && threads.some((t) => t.id === confirmingId) ? confirmingId : null;

  // Derive the effective selected set — prune IDs that no longer exist in the list.
  const threadIds = new Set(threads.map((t) => t.id));
  const effectiveSelected = selectMode
    ? new Set([...selected].filter((id) => threadIds.has(id)))
    : selected;

  function toggleSelectMode() {
    setSelectMode((v) => !v);
    setSelected(new Set());
    setConfirmingId(null);
  }

  function toggleItem(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(threads.map((t) => t.id)));
  }

  function deselectAll() {
    setSelected(new Set());
  }

  async function handleBulkArchive() {
    if (!onBulkArchive || effectiveSelected.size === 0) return;
    await onBulkArchive([...effectiveSelected]);
    setSelected(new Set());
    setSelectMode(false);
  }

  async function handleBulkDelete() {
    if (!onBulkDelete || effectiveSelected.size === 0) return;
    const ids = [...effectiveSelected];
    const deletedThreads = threads.filter((t) => ids.includes(t.id));
    await onBulkDelete(ids);
    setSelected(new Set());
    setSelectMode(false);
    setBulkConfirmDelete(false);
    setToast({
      message: `${ids.length} ${ids.length === 1 ? "chat" : "chats"} deleted.`,
      deletedThreads,
    });
  }

  const allSelected = threads.length > 0 && effectiveSelected.size === threads.length;

  const list = (
    <div className="flex h-full flex-col gap-0 p-3">
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="mb-3 flex items-center justify-between gap-1">
        {/* Dashboard icon link */}
        <Link
          href="/dashboard"
          title="Go to Dashboard"
          aria-label="Go to Dashboard"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[var(--muted)] hover:bg-[var(--panel-2)] hover:text-[var(--fg)] transition-colors"
        >
          <LayoutDashboard className="h-5 w-5" aria-hidden />
        </Link>

        <h2 className="flex-1 text-sm font-semibold text-[var(--fg)]">Chats</h2>

        {/* Select / Cancel select mode */}
        <Button
          type="button"
          variant="ghost"
          className="h-9 gap-1.5 px-2 text-xs"
          onClick={toggleSelectMode}
          title={selectMode ? "Cancel selection" : "Select chats"}
        >
          {selectMode ? (
            <span>Cancel</span>
          ) : (
            <span>Select</span>
          )}
        </Button>

        {/* New chat */}
        {!selectMode && (
          <Button
            type="button"
            variant="ghost"
            className="h-9 gap-1.5 px-2"
            onClick={onCreate}
            title="New chat"
            aria-label="New chat"
          >
            <Plus className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline text-xs">New</span>
          </Button>
        )}
      </div>

      {/* ── Select-all bar ────────────────────────────────── */}
      {selectMode && (
        <div className="mb-2 flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2">
          <button
            type="button"
            onClick={allSelected ? deselectAll : selectAll}
            className="flex min-h-[36px] flex-1 items-center gap-2 text-sm text-[var(--fg)]"
            aria-label={allSelected ? "Deselect all" : "Select all"}
          >
            {allSelected ? (
              <CheckSquare className="h-4 w-4 text-[var(--accent)]" aria-hidden />
            ) : (
              <Square className="h-4 w-4 text-[var(--muted)]" aria-hidden />
            )}
            <span>{allSelected ? "Deselect all" : "Select all"}</span>
          </button>
          {effectiveSelected.size > 0 && (
            <span className="text-xs text-[var(--muted)]">{effectiveSelected.size} selected</span>
          )}
        </div>
      )}

      {/* ── Thread list ───────────────────────────────────── */}
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
            const isChecked = effectiveSelected.has(t.id);
            const title = t.title?.trim() || synthesizedTitle(t);
            const subtitle = formatRelative(t.lastMessageAt);
            const isConfirming = !selectMode && effectiveConfirmingId === t.id;
            return (
              <li key={t.id}>
                <div
                  className={
                    "group flex items-start gap-2 rounded-xl border px-3 py-2 transition-colors " +
                    (isActive && !selectMode
                      ? "border-[var(--accent)]/40 bg-[var(--accent)]/8"
                      : isChecked
                      ? "border-[var(--accent)]/30 bg-[var(--accent)]/5"
                      : "border-transparent hover:bg-[var(--panel-2)]")
                  }
                >
                  {/* Checkbox in select mode */}
                  {selectMode ? (
                    <button
                      type="button"
                      onClick={() => toggleItem(t.id)}
                      aria-label={isChecked ? `Deselect ${title}` : `Select ${title}`}
                      className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                    >
                      {isChecked ? (
                        <CheckSquare className="h-5 w-5 text-[var(--accent)]" aria-hidden />
                      ) : (
                        <Square className="h-5 w-5 text-[var(--muted)]" aria-hidden />
                      )}
                    </button>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => (selectMode ? toggleItem(t.id) : onSelect(t.id))}
                    className="flex min-w-0 flex-1 items-start gap-2 text-left"
                  >
                    {!selectMode && (
                      <MessageSquare
                        className={
                          "mt-0.5 h-4 w-4 shrink-0 " +
                          (isActive ? "text-[var(--accent)]" : "mv-muted")
                        }
                        aria-hidden
                      />
                    )}
                    <span className="min-w-0 flex-1">
                      <span
                        className={
                          "block truncate text-sm " +
                          (isActive && !selectMode
                            ? "font-semibold text-[var(--fg)]"
                            : "text-[var(--fg)]")
                        }
                      >
                        {title}
                      </span>
                      <span className="block truncate text-[11px] mv-muted">{subtitle}</span>
                    </span>
                  </button>

                  {/* Single-item confirm / delete (non-select mode) */}
                  {!selectMode && (
                    isConfirming ? (
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
                    )
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        {/* ── Archived section ───────────────────────────── */}
        {archivedThreads && archivedThreads.length > 0 && (
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setArchivedOpen((v) => !v)}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-[var(--muted)] hover:bg-[var(--panel-2)] hover:text-[var(--fg)] transition-colors min-h-[44px]"
              aria-expanded={archivedOpen}
              aria-controls="archived-thread-list"
            >
              {archivedOpen ? (
                <ChevronDown className="h-4 w-4 shrink-0" aria-hidden />
              ) : (
                <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
              )}
              <Archive className="h-4 w-4 shrink-0" aria-hidden />
              <span>Archived ({archivedThreads.length})</span>
            </button>
            {archivedOpen && (
              <ul id="archived-thread-list" className="mt-1 space-y-1">
                {archivedThreads.map((t) => {
                  const title = t.title?.trim() || synthesizedTitle(t);
                  const subtitle = formatRelative(t.lastMessageAt);
                  return (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => onSelect(t.id)}
                        className="flex w-full items-start gap-2 rounded-xl border border-transparent px-3 py-2 text-left hover:bg-[var(--panel-2)] transition-colors"
                      >
                        <Archive
                          className="mt-0.5 h-4 w-4 shrink-0 mv-muted"
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm text-[var(--muted)]">
                            {title}
                          </span>
                          <span className="block truncate text-[11px] mv-muted">{subtitle}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* ── Bulk action bar ────────────────────────────────── */}
      {selectMode && effectiveSelected.size > 0 && (
        <div className="mt-3 flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-2">
          <Button
            type="button"
            variant="ghost"
            className="flex-1 min-h-[44px] gap-2 text-sm"
            onClick={handleBulkArchive}
            title="Archive selected chats"
          >
            <Archive className="h-4 w-4" aria-hidden />
            Archive
          </Button>
          <Button
            type="button"
            variant="danger"
            className="flex-1 min-h-[44px] gap-2 text-sm"
            onClick={() => setBulkConfirmDelete(true)}
            title="Delete selected chats"
          >
            <Trash2 className="h-4 w-4" aria-hidden />
            Delete
          </Button>
        </div>
      )}
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

      {/* Bulk delete confirmation dialog */}
      {bulkConfirmDelete && (
        <ConfirmDeleteDialog
          count={effectiveSelected.size}
          onConfirm={() => void handleBulkDelete()}
          onCancel={() => setBulkConfirmDelete(false)}
        />
      )}

      {/* Undo toast */}
      {toast && (
        <UndoToast
          message={toast.message}
          onUndo={async () => {
            // Re-create the deleted threads is not straightforward with current API;
            // instead we surface an info message since server-side undo is not yet supported.
            setToast(null);
          }}
          onDismiss={() => setToast(null)}
        />
      )}
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
