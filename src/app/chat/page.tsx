"use client";

/**
 * Threaded chat page.
 *
 * The default view is the user's active thread — which is the same thread
 * incoming WhatsApp messages land in, so a user who has chatted with UMA on
 * WhatsApp opens this page and sees their WhatsApp history immediately.
 *
 * The sidebar lists every non-archived thread; clicking another thread loads
 * its messages and re-points the active-thread pointer so future WhatsApp
 * messages land there too. Starting a new chat creates a fresh thread and
 * makes it active — old conversations stay accessible from the sidebar.
 *
 * Cross-channel sync polling runs every 6 s while the tab is visible, so
 * messages typed on WhatsApp surface in the open thread without a refresh.
 *
 * PDF attachment + merge-proposal flow lives on the dashboard's upload
 * widget, not here — keeping the chat page focused on conversation makes
 * the threaded UX honest and avoids re-implementing an extraction pipeline
 * that already works in two other surfaces.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, MessageCircle, Menu, SendHorizontal, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { AppTopNav } from "@/components/nav/AppTopNav";
import { ChatMarkdown } from "@/components/chat/ChatMarkdown";
import { ThreadSidebar, type ThreadSummary } from "@/components/chat/ThreadSidebar";

type Msg = {
  id: string;
  role: "user" | "assistant";
  content: string;
  source: "web" | "whatsapp" | "system";
  createdAt: string | Date;
};

const POLL_INTERVAL_MS = 6000;

export default function ChatPage() {
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [threadsLoading, setThreadsLoading] = useState(true);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // ── Initial load: threads + active thread ───────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setThreadsLoading(true);
      try {
        const r = await fetch("/api/threads", { credentials: "same-origin" });
        if (!r.ok) {
          // 401 happens if the user isn't signed in — leave the page in an
          // empty state with a calm message rather than a hard crash.
          throw new Error((await r.json()).error ?? `HTTP ${r.status}`);
        }
        const j = await r.json();
        if (cancelled) return;
        const list: ThreadSummary[] = j.threads ?? [];
        setThreads(list);
        // Pick the first thread (server-sorted by lastMessageAt desc) — this
        // matches the active thread for the WA-default-view requirement.
        if (list.length > 0) setActiveThreadId(list[0].id);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Couldn't load chats.");
      } finally {
        if (!cancelled) setThreadsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Load messages whenever activeThreadId changes ───────────────────
  const loadMessages = useCallback(async (threadId: string) => {
    setMessagesLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/threads/${threadId}/messages`, { credentials: "same-origin" });
      if (!r.ok) throw new Error((await r.json()).error ?? `HTTP ${r.status}`);
      const j = await r.json();
      setMessages(j.messages ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load messages.");
    } finally {
      setMessagesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!activeThreadId) return;
    void loadMessages(activeThreadId);
  }, [activeThreadId, loadMessages]);

  // ── Polling for cross-channel updates ───────────────────────────────
  // Every 6s while the tab is visible, pull the latest messages so that a
  // reply typed on WhatsApp surfaces in the open thread. Polling is paused
  // while the tab is hidden to avoid quota burn.
  useEffect(() => {
    if (!activeThreadId) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    async function tick() {
      if (cancelled || document.visibilityState === "hidden" || !activeThreadId) {
        timer = setTimeout(tick, POLL_INTERVAL_MS);
        return;
      }
      try {
        const r = await fetch(`/api/threads/${activeThreadId}/messages`, { credentials: "same-origin" });
        if (r.ok) {
          const j = await r.json();
          const next: Msg[] = j.messages ?? [];
          setMessages((prev) => {
            const sameLen = prev.length === next.length;
            const sameLast = prev[prev.length - 1]?.id === next[next.length - 1]?.id;
            return sameLen && sameLast ? prev : next;
          });
        }
      } catch {
        /* network blip — try again next tick */
      }
      timer = setTimeout(tick, POLL_INTERVAL_MS);
    }
    timer = setTimeout(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [activeThreadId]);

  // ── Auto-scroll on new messages ─────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  // ── Actions ─────────────────────────────────────────────────────────
  const refreshThreads = useCallback(async () => {
    try {
      const r = await fetch("/api/threads", { credentials: "same-origin" });
      if (!r.ok) return;
      const j = await r.json();
      setThreads(j.threads ?? []);
    } catch {
      /* swallow */
    }
  }, []);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!activeThreadId || !content.trim() || sending) return;
      setSending(true);
      setError(null);
      const optimistic: Msg = {
        id: `tmp-${Date.now()}`,
        role: "user",
        content: content.trim(),
        source: "web",
        createdAt: new Date(),
      };
      setMessages((m) => [...m, optimistic]);
      setDraft("");
      try {
        const r = await fetch(`/api/threads/${activeThreadId}/messages`, {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ content: content.trim() }),
        });
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          throw new Error(j?.error ?? `HTTP ${r.status}`);
        }
        const j = await r.json();
        setMessages((m) => {
          const filtered = m.filter((x) => x.id !== optimistic.id);
          return [...filtered, j.userMessage, j.assistantMessage].filter(Boolean);
        });
        void refreshThreads();
      } catch (e) {
        setMessages((m) => m.filter((x) => x.id !== optimistic.id));
        setError(e instanceof Error ? e.message : "Couldn't send your message.");
      } finally {
        setSending(false);
      }
    },
    [activeThreadId, sending, refreshThreads],
  );

  const switchThread = useCallback(async (id: string) => {
    setActiveThreadId(id);
    setSidebarOpen(false);
    // Tell the server this is the new active thread — that's what reroutes
    // future inbound WhatsApp messages here.
    try {
      await fetch(`/api/threads/${id}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ active: true }),
      });
    } catch {
      /* non-blocking — server already enforces ownership on next read */
    }
  }, []);

  const createThread = useCallback(async () => {
    try {
      const r = await fetch("/api/threads", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? `HTTP ${r.status}`);
      const j = await r.json();
      const t: ThreadSummary = j.thread;
      setThreads((prev) => [t, ...prev]);
      setActiveThreadId(t.id);
      setSidebarOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start a new chat.");
    }
  }, []);

  const archiveThread = useCallback(
    async (id: string) => {
      try {
        const r = await fetch(`/api/threads/${id}`, {
          method: "DELETE",
          credentials: "same-origin",
        });
        if (!r.ok) throw new Error((await r.json()).error ?? `HTTP ${r.status}`);
        setThreads((prev) => prev.filter((t) => t.id !== id));
        if (activeThreadId === id) {
          const remaining = threads.filter((t) => t.id !== id);
          setActiveThreadId(remaining[0]?.id ?? null);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't delete this chat.");
      }
    },
    [activeThreadId, threads],
  );

  const activeThread = useMemo(
    () => threads.find((t) => t.id === activeThreadId) ?? null,
    [threads, activeThreadId],
  );

  return (
    <div className="flex h-screen flex-col">
      <AppTopNav fixed />
      <div className="flex flex-1 overflow-hidden pt-[57px]">
        <ThreadSidebar
          threads={threads}
          activeThreadId={activeThreadId}
          onSelect={(id) => void switchThread(id)}
          onCreate={() => void createThread()}
          onArchive={(id) => void archiveThread(id)}
          loading={threadsLoading}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />

        <main className="flex flex-1 flex-col">
          <header className="flex shrink-0 items-center gap-2 border-b border-[var(--border)] px-3 py-2">
            <Button
              type="button"
              variant="ghost"
              className="h-9 w-9 p-0 md:hidden"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open chats"
            >
              <Menu className="h-5 w-5" />
            </Button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-sm font-semibold text-[var(--fg)]">
                {activeThread?.title?.trim() || "UMA chat"}
              </h1>
              {activeThread ? (
                <p className="text-[11px] mv-muted">
                  Synced with WhatsApp · what you write here also reaches your WhatsApp thread.
                </p>
              ) : (
                <p className="text-[11px] mv-muted">Pick a chat or start a new one.</p>
              )}
            </div>
            {activeThread ? (
              <span
                className="hidden items-center gap-1 rounded-full border border-[#25D366]/30 bg-[#25D366]/10 px-2 py-0.5 text-[10px] font-medium md:inline-flex"
                style={{ color: "#25D366" }}
                title="This conversation is mirrored on WhatsApp"
              >
                <Smartphone className="h-3 w-3" />
                WhatsApp synced
              </span>
            ) : null}
          </header>

          <div className="flex-1 overflow-y-auto px-3 py-4 sm:px-6">
            {!activeThreadId && !threadsLoading ? (
              <EmptyState onStart={() => void createThread()} />
            ) : null}
            {messagesLoading && messages.length === 0 ? (
              <div className="flex items-center justify-center py-10 mv-muted">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading messages…
              </div>
            ) : null}
            <div className="mx-auto flex max-w-2xl flex-col gap-3">
              {messages.map((m) => (
                <MessageBubble key={m.id} msg={m} />
              ))}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {activeThreadId ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void sendMessage(draft);
              }}
              className="shrink-0 border-t border-[var(--border)] bg-[var(--panel)]/40 p-3 sm:p-4"
            >
              {error ? (
                <p className="mb-2 rounded-xl border border-red-500/30 bg-red-500/8 px-3 py-2 text-xs text-red-400">
                  {error}
                </p>
              ) : null}
              <div className="mx-auto flex max-w-2xl items-center gap-2">
                <Input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Type your message…"
                  disabled={sending}
                  className="flex-1"
                  aria-label="Message UMA"
                />
                <Button type="submit" disabled={sending || !draft.trim()} className="gap-1.5">
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
                  Send
                </Button>
              </div>
              <p className="mx-auto mt-2 max-w-2xl text-[11px] mv-muted">
                Need to attach a PDF? Use the Upload widget on your dashboard — the new report appears
                here as soon as it&apos;s parsed. Not medical advice.
              </p>
            </form>
          ) : null}
        </main>
      </div>
    </div>
  );
}

function MessageBubble({ msg }: { msg: Msg }) {
  const isUser = msg.role === "user";
  const fromWa = msg.source === "whatsapp";
  const fromSystem = msg.source === "system";
  return (
    <div className={"flex " + (isUser ? "justify-end" : "justify-start")}>
      <div
        className={
          "max-w-[88%] rounded-2xl px-4 py-2.5 text-sm " +
          (isUser
            ? "bg-[var(--accent)] text-white"
            : "border border-[var(--border)] bg-[var(--panel-2)] text-[var(--fg)]")
        }
      >
        {fromWa && !isUser ? (
          <span
            className="mb-1 inline-flex items-center gap-1 rounded-full bg-[#25D366]/10 px-1.5 py-0.5 text-[10px] font-medium"
            style={{ color: "#25D366" }}
          >
            <Smartphone className="h-2.5 w-2.5" /> from WhatsApp
          </span>
        ) : null}
        {fromSystem && !isUser ? (
          <span className="mb-1 inline-flex items-center gap-1 rounded-full bg-[var(--accent-2)]/10 px-1.5 py-0.5 text-[10px] font-medium text-[var(--accent-2)]">
            <MessageCircle className="h-2.5 w-2.5" /> from UMA
          </span>
        ) : null}
        {isUser ? (
          <p className="whitespace-pre-wrap">{msg.content}</p>
        ) : (
          <ChatMarkdown content={msg.content} variant="assistant" />
        )}
      </div>
    </div>
  );
}

function EmptyState({ onStart }: { onStart: () => void }) {
  return (
    <div className="mx-auto mt-10 max-w-md text-center">
      <h2 className="text-lg font-semibold text-[var(--fg)]">Start a chat with UMA</h2>
      <p className="mt-2 text-sm mv-muted">
        Ask about your reports, log a dose, or set a reminder. Anything you say here also reaches your
        WhatsApp thread, and what you write on WhatsApp shows up here.
      </p>
      <Button type="button" className="mt-4" onClick={onStart}>
        New chat
      </Button>
    </div>
  );
}
