"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, FileText, Heart, Loader2, Paperclip, SendHorizontal, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { AppTopNav } from "@/components/nav/AppTopNav";
import { RecordNoticeToast } from "@/components/ui/RecordNoticeToast";
import { UmaCharacter } from "@/components/chat/UmaCharacter";
import { getStore, mergeExtractedDoc } from "@/lib/store";
import type { ExtractedDoc, StandardLexiconEntry } from "@/lib/types";

type MergeProposal = {
  doc: ExtractedDoc;
  lexiconPatches: StandardLexiconEntry[];
  nameMismatch?: { namesOnDocument: string[]; profileDisplayName: string };
};

type Msg = {
  role: "user" | "assistant";
  content: string;
  mergeProposal?: MergeProposal;
};

const MAX_CHAT_PDF_BYTES = 12 * 1024 * 1024;

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const r = reader.result as string;
      const comma = r.indexOf(",");
      resolve(comma >= 0 ? r.slice(comma + 1) : r);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Read failed"));
    reader.readAsDataURL(file);
  });
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      content:
        "Hi, I am Uma, your care companion. I can explain your reports, medications, and labs in simple language. Attach a PDF below if you like — a records step reads it in parallel, and you can add it to your dashboard with one tap. What would you like to check first?",
    },
  ]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [petMood, setPetMood] = useState<"idle" | "happy" | "thinking">("idle");
  const [petName] = useState("Uma");
  const [celebrate, setCelebrate] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [lastPdfForMerge, setLastPdfForMerge] = useState<File | null>(null);
  const [recordNotice, setRecordNotice] = useState<string | null>(null);
  const dismissRecordNotice = useCallback(() => setRecordNotice(null), []);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const suggestions = [
    "What changed between my latest report and the one before?",
    "How do my newest labs compare to last time?",
    "What does my newest report mean for me, in plain language?",
    "Walk me through my meds and what to watch for.",
    "What should I mention at my next visit from my records?",
  ];

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  async function applyMerge(proposal: MergeProposal, sourceFile: File | null) {
    let doc = proposal.doc;
    if (sourceFile && sourceFile.size <= MAX_CHAT_PDF_BYTES) {
      try {
        const originalPdfBase64 = await readFileAsBase64(sourceFile);
        doc = { ...proposal.doc, originalPdfBase64 };
      } catch {
        /* keep doc without embedded pdf */
      }
    }
    mergeExtractedDoc(doc, { standardLexiconPatches: proposal.lexiconPatches });
    setLastPdfForMerge(null);
    setRecordNotice("Saved — this report is now in your dashboard, documents list, and charts.");
    setMessages((m) => [
      ...m.map((msg) => (msg.role === "assistant" ? { ...msg, mergeProposal: undefined } : msg)),
      {
        role: "assistant",
        content: "Done — I added that document to your records. Your dashboard and charts will update.",
      },
    ]);
    setPetMood("happy");
    setCelebrate(true);
    setTimeout(() => setCelebrate(false), 900);
  }

  async function send() {
    const q = text.trim();
    if ((!q && !pendingFile) || loading) return;

    if (!pendingFile) setLastPdfForMerge(null);

    const store = getStore();
    const historyPayload = messages.map(({ role, content }) => ({ role, content }));

    setMessages((m) => [...m, { role: "user", content: q || (pendingFile ? `📎 ${pendingFile.name}` : "") }]);
    setText("");
    setLoading(true);
    setPetMood("thinking");

    let attachments: { fileName: string; mimeType: string; dataBase64: string }[] = [];
    const fileSnapshot = pendingFile;
    if (fileSnapshot) {
      if (fileSnapshot.size > MAX_CHAT_PDF_BYTES) {
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            content: "That PDF is too large for chat (12 MB max). Please upload from the dashboard instead.",
          },
        ]);
        setLoading(false);
        setPetMood("idle");
        return;
      }
      try {
        const dataBase64 = await readFileAsBase64(fileSnapshot);
        attachments = [{ fileName: fileSnapshot.name, mimeType: "application/pdf", dataBase64 }];
      } catch {
        setMessages((m) => [...m, { role: "assistant", content: "I couldn't read that file. Try another PDF." }]);
        setLoading(false);
        setPetMood("idle");
        return;
      }
    }

    try {
      const r = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          question: q || (fileSnapshot ? "Please process this PDF for my records." : ""),
          store,
          messages: historyPayload,
          attachments,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? "Chat failed");
      setMessages((m) => {
        const cleared = j.mergeProposal
          ? m.map((msg) => (msg.role === "assistant" ? { ...msg, mergeProposal: undefined } : msg))
          : m;
        return [
          ...cleared,
          {
            role: "assistant",
            content: j.answer as string,
            mergeProposal: j.mergeProposal as MergeProposal | undefined,
          },
        ];
      });
      if (j.mergeProposal && fileSnapshot) setLastPdfForMerge(fileSnapshot);
      else setLastPdfForMerge(null);
      setPendingFile(null);
      if (j.mergeProposal) {
        if ((j.mergeProposal as MergeProposal).nameMismatch) {
          setRecordNotice(
            "The PDF name does not match your profile — check the yellow note in the card, then add only if you are sure."
          );
        } else {
          setRecordNotice('PDF read — review the card below and tap "Add to records" to save it to your dashboard.');
        }
      }
      setPetMood("happy");
      setCelebrate(true);
      setTimeout(() => setCelebrate(false), 900);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "unknown error";
      setMessages((m) => [...m, { role: "assistant", content: `I ran into an error: ${message}` }]);
      setPetMood("idle");
    } finally {
      setLoading(false);
      setTimeout(() => setPetMood("idle"), 1200);
    }
  }

  function sendSuggestion(prompt: string) {
    setText(prompt);
    setTimeout(() => textareaRef.current?.focus(), 0);
  }

  const companionLabel = useMemo(() => {
    if (petMood === "thinking") return `${petName} is thinking...`;
    if (petMood === "happy") return `${petName} is cheering you on`;
    return `${petName}, your care buddy`;
  }, [petMood, petName]);

  return (
    <div className="min-h-screen no-print">
      <style>{`
        @keyframes umaBreath {
          0%, 100% { transform: translateY(0) scale(1); }
          50% { transform: translateY(-1px) scale(1.03); }
        }
        @keyframes umaPop {
          0% { transform: scale(0.7); opacity: 0; }
          30% { transform: scale(1.1); opacity: 1; }
          100% { transform: scale(1.35); opacity: 0; }
        }
        @keyframes typingBounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.35; }
          40% { transform: translateY(-4px); opacity: 1; }
        }
        @keyframes umaChatExtractBar {
          0% { transform: translateX(-100%); opacity: 0.85; }
          50% { transform: translateX(80%); opacity: 1; }
          100% { transform: translateX(280%); opacity: 0.85; }
        }
      `}</style>
      <AppTopNav rightSlot={<Badge>Private</Badge>} />

      <main className="w-full px-0 sm:px-4 py-0 sm:py-6 min-h-[calc(100vh-56px)] flex flex-col">
        <section className="flex-1 min-h-0 rounded-none sm:rounded-3xl border-y border-[var(--border)] sm:border bg-[var(--panel)] sm:shadow-[var(--shadow)] flex flex-col overflow-hidden">
          <div className="border-b border-[var(--border)] px-4 py-3 flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="relative shrink-0 rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] grid place-items-center overflow-hidden" style={{ width: 54, height: 48, padding: '3px 2px' }}>
                <UmaCharacter mood={petMood} compact />
                {celebrate && (
                  <>
                    <span
                      className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-[var(--accent)]"
                      style={{ animation: "umaPop 900ms ease-out" }}
                    />
                    <span
                      className="absolute -top-1 left-1 h-2.5 w-2.5 rounded-full bg-[var(--accent-2)]"
                      style={{ animation: "umaPop 900ms ease-out 120ms" }}
                    />
                  </>
                )}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{companionLabel}</p>
                <p className="text-xs mv-muted truncate">Conversation plus optional PDF for your records</p>
              </div>
            </div>
            <Badge className="shrink-0 inline-flex items-center gap-1">
              <Heart className="h-3 w-3" /> Companion
            </Badge>
          </div>

          <div
            ref={scrollRef}
            className="flex-1 min-h-0 overflow-y-auto bg-[var(--panel-2)]/35 flex flex-col justify-end"
          >
            <div className="mx-auto max-w-4xl w-full px-3 sm:px-4 py-5 sm:py-6 space-y-4">
              {messages.map((m, i) => (
                <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start flex-col gap-2"}>
                  <div
                    className={[
                      "max-w-[96%] sm:max-w-[90%] rounded-2xl px-4 py-3 text-sm leading-6 border whitespace-pre-wrap",
                      m.role === "user"
                        ? "bg-[var(--accent)] text-[var(--accent-contrast)] border-[var(--accent)]"
                        : "bg-[var(--panel)] border-[var(--border)] text-[var(--fg)]",
                    ].join(" ")}
                  >
                    {m.content}
                  </div>
                  {m.role === "assistant" && m.mergeProposal ? (
                    <div className="max-w-[96%] sm:max-w-[90%] rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-3 space-y-2">
                      <p className="text-xs font-medium text-[var(--fg)]">Save to dashboard</p>
                      {m.mergeProposal.nameMismatch ? (
                        <div className="rounded-lg border border-amber-500/45 bg-amber-500/10 p-2.5 text-xs text-[var(--fg)] space-y-1.5">
                          <p className="font-medium flex items-center gap-1.5">
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden />
                            Patient name does not match
                          </p>
                          <p className="mv-muted leading-relaxed">
                            <span className="text-[var(--fg)] font-medium">Your profile:</span>{" "}
                            {m.mergeProposal.nameMismatch.profileDisplayName.trim()
                              ? `"${m.mergeProposal.nameMismatch.profileDisplayName.trim()}"`
                              : "(not set)"}{" "}
                            ·{" "}
                            <span className="text-[var(--fg)] font-medium">PDF shows:</span>{" "}
                            {m.mergeProposal.nameMismatch.namesOnDocument.length > 0
                              ? m.mergeProposal.nameMismatch.namesOnDocument.map((n) => `"${n.trim()}"`).join(", ")
                              : "(none detected)"}
                          </p>
                          <p className="mv-muted leading-relaxed">
                            Add only if this is still your report or you mean to store it on purpose. You can update your
                            name on the{" "}
                            <Link href="/profile" className="text-[var(--accent)] underline underline-offset-2">
                              Profile
                            </Link>{" "}
                            page and re-upload if needed.
                          </p>
                        </div>
                      ) : (
                        <p className="text-xs mv-muted">
                          Adds this report to your documents, lab list, and charts (same as dashboard upload).
                        </p>
                      )}
                      <Button
                        className="w-full gap-2"
                        onClick={() => void applyMerge(m.mergeProposal!, lastPdfForMerge)}
                      >
                        <FileText className="h-4 w-4" />
                        {m.mergeProposal.nameMismatch ? "Add to records anyway" : "Add to records"}
                      </Button>
                    </div>
                  ) : null}
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div
                    className={[
                      "rounded-2xl border border-[var(--border)] bg-[var(--panel)] px-4 py-3 text-sm",
                      pendingFile ? "max-w-[96%] sm:max-w-[90%] space-y-3" : "mv-muted flex items-center gap-2",
                    ].join(" ")}
                    role={pendingFile ? "status" : undefined}
                    aria-live={pendingFile ? "polite" : undefined}
                  >
                    {pendingFile ? (
                      <>
                        <div className="flex items-center gap-2 text-[var(--fg)]">
                          <Loader2 className="h-4 w-4 animate-spin shrink-0 text-[var(--accent)]" aria-hidden />
                          <span className="font-medium">Reading your PDF…</span>
                        </div>
                        <p className="text-xs mv-muted leading-relaxed">
                          UMA is extracting labs, medications, and a summary. Long or scanned files can take up to a
                          minute — please keep this tab open until it finishes.
                        </p>
                        <div className="h-1.5 w-full rounded-full bg-[var(--border)] overflow-hidden">
                          <div
                            className="h-full w-2/5 rounded-full bg-[var(--accent)]"
                            style={{ animation: "umaChatExtractBar 1.8s ease-in-out infinite" }}
                          />
                        </div>
                      </>
                    ) : (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin shrink-0" aria-hidden />
                        <span className="flex items-center gap-1.5">
                          <span
                            className="h-1.5 w-1.5 rounded-full bg-[var(--muted)]"
                            style={{ animation: "typingBounce 1s infinite" }}
                          />
                          <span
                            className="h-1.5 w-1.5 rounded-full bg-[var(--muted)]"
                            style={{ animation: "typingBounce 1s infinite 140ms" }}
                          />
                          <span
                            className="h-1.5 w-1.5 rounded-full bg-[var(--muted)]"
                            style={{ animation: "typingBounce 1s infinite 280ms" }}
                          />
                        </span>
                      </>
                    )}
                  </div>
                </div>
              )}
              {messages.length <= 1 && !loading && (
                <div className="flex w-full flex-wrap gap-2">
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className="group inline-flex w-max max-w-full items-center gap-2 rounded-2xl border border-dashed border-[var(--border)] bg-[var(--panel)]/40 px-3 py-2.5 text-left text-xs leading-tight text-[var(--fg)] transition-[transform,box-shadow,border-color,background-color] duration-200 ease-out hover:-translate-y-0.5 hover:border-[color-mix(in_srgb,var(--accent)_28%,var(--border))] hover:bg-[var(--panel-2)] hover:shadow-[var(--shadow)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] sm:whitespace-nowrap sm:py-2"
                      onClick={() => sendSuggestion(s)}
                    >
                      <Sparkles
                        className="h-4 w-4 shrink-0 text-[var(--accent)] transition-transform duration-200 group-hover:scale-110"
                        aria-hidden
                      />
                      <span className="mv-muted min-w-0 group-hover:text-[var(--fg)] transition-colors duration-200">{s}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-[var(--border)] bg-[var(--panel)] p-3 sm:p-4 shrink-0">
            <div className="mx-auto max-w-4xl">
              {pendingFile ? (
                <div className="mb-2 flex items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-xs">
                  <span className="truncate flex items-center gap-2">
                    <FileText className="h-4 w-4 shrink-0" />
                    {pendingFile.name}
                  </span>
                  <button
                    type="button"
                    className="text-[var(--muted)] hover:text-[var(--fg)]"
                    onClick={() => setPendingFile(null)}
                  >
                    Remove
                  </button>
                </div>
              ) : null}
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => setPendingFile(e.target.files?.[0] ?? null)}
              />
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] p-2">
                <textarea
                  ref={textareaRef}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Ask about your reports, medications, trends, or attach a PDF…"
                  className="w-full resize-none bg-transparent px-2 py-1 text-sm outline-none placeholder:text-[var(--muted)]"
                  rows={2}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                />
                <div className="flex items-center justify-between gap-2 pt-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-9 px-2 gap-2 border border-[var(--border)] shrink-0"
                      onClick={() => fileInputRef.current?.click()}
                      aria-label="Attach PDF"
                    >
                      <Paperclip className="h-4 w-4" />
                      <span className="text-xs hidden sm:inline">PDF</span>
                    </Button>
                    <p className="text-[11px] mv-muted truncate hidden sm:block">Enter to send · Shift+Enter newline</p>
                  </div>
                  <Button onClick={() => void send()} disabled={loading} className="h-9 gap-2 px-3 shrink-0">
                    <SendHorizontal className="h-4 w-4" />
                    {loading ? "Thinking..." : "Send"}
                  </Button>
                </div>
              </div>
              <p className="mt-2 text-[11px] mv-muted">
                Not medical advice. PDFs are read for your records in parallel with your message. Large files: use dashboard
                upload.
              </p>
            </div>
          </div>
        </section>
      </main>

      <RecordNoticeToast message={recordNotice} onDismiss={dismissRecordNotice} />
    </div>
  );
}
