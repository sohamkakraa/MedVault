"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, BarChart2, FileText, Heart, Loader2, Paperclip, RotateCcw, SendHorizontal, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { TimePicker } from "@/components/ui/TimePicker";
import { AppTopNav } from "@/components/nav/AppTopNav";
import { RecordNoticeToast } from "@/components/ui/RecordNoticeToast";
import { ChatMarkdown } from "@/components/chat/ChatMarkdown";
import { UmaCharacter } from "@/components/chat/UmaCharacter";
import { newHealthLogId, normalizeHealthLogs } from "@/lib/healthLogs";
import { isMedicationFormKind } from "@/lib/medicationFormPresets";
import { getStore, saveStore, getViewingStore, saveViewingStore, getActiveFamilyMember, setActiveFamilyMember, smartMergeExtractedDoc, appendUsageLogEntry, getUsageSummary } from "@/lib/store";
import type { FamilyMemberMeta } from "@/lib/types";
import type {
  ChatQuickReply,
  ExtractedDoc,
  ExtractedMedication,
  MedicationFormKind,
  MedicationIntakeLogEntry,
  MedicationReminderEntry,
  StandardLexiconEntry,
} from "@/lib/types";
import type { MedicationAddChatPatch, MedicationUpdateChatPatch } from "@/lib/chatMedicationIntakeInfer";

type MergeProposal = {
  doc: ExtractedDoc;
  lexiconPatches: StandardLexiconEntry[];
  nameMismatch?: { namesOnDocument: string[]; profileDisplayName: string };
};

type Msg = {
  role: "user" | "assistant";
  content: string;
  mergeProposal?: MergeProposal;
  quickReplies?: ChatQuickReply[];
};

const MAX_CHAT_PDF_BYTES = 12 * 1024 * 1024;
const CHAT_HISTORY_KEY = "mv_chat_history_v1";
const MAX_STORED_MSGS = 120;

const INITIAL_GREETING: Msg = {
  role: "assistant",
  content: [
    "Hi, I'm **Uma**. I already work from what you've saved in UMA—medicines, labs, and documents—and I'll **lead with useful output** (summaries, comparisons, plain-language explanations) instead of leaving you to guess what to ask.",
    "",
    "**Easy ways to start:**",
    "- Tap a suggestion below, or attach a PDF here—I read it in parallel and you can **Add to records** when it looks right.",
    "- Say **catch me up** for a short rundown of your records plus two sensible next moves.",
    "",
  ].join("\n"),
};

function mapFormKind(raw?: string): MedicationFormKind {
  if (!raw) return "unspecified";
  const f = raw.toLowerCase().replace(/s$/, ""); // singularise
  if (isMedicationFormKind(f)) return f as MedicationFormKind;
  return "unspecified";
}

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
  const [messages, setMessages] = useState<Msg[]>(() => {
    if (typeof window === "undefined") return [INITIAL_GREETING];
    try {
      const stored = localStorage.getItem(CHAT_HISTORY_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Msg[];
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch { /* ignore */ }
    return [INITIAL_GREETING];
  });
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [petMood, setPetMood] = useState<"idle" | "happy" | "thinking">("idle");
  const [petName] = useState("Uma");
  const [celebrate, setCelebrate] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [lastPdfForMerge, setLastPdfForMerge] = useState<File | null>(null);
  const [recordNotice, setRecordNotice] = useState<string | null>(null);
  const dismissRecordNotice = useCallback(() => setRecordNotice(null), []);
  const [statusText, setStatusText] = useState<string | undefined>(undefined);
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showUsage, setShowUsage] = useState(false);
  const flashStatus = useCallback((text: string, durationMs = 3000) => {
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    setStatusText(text);
    statusTimerRef.current = setTimeout(() => setStatusText(undefined), durationMs);
  }, []);
  const [activeMember, setActiveMemberState] = useState<FamilyMemberMeta | null>(() =>
    typeof window !== "undefined" ? getActiveFamilyMember() : null
  );
  /** Tracks inline time-picker state per message index */
  const [pickerState, setPickerState] = useState<{ medName: string; msgIdx: number; time: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const suggestions = [
    "Catch me up on my records and suggest what to do next.",
    "Compare my newest lab file to the one before—call out anything worth watching.",
    "Summarize my medicines and flag anything I should double-check with a pharmacist or doctor.",
    "Turn my latest report into a short list I can bring to my next visit.",
    "What should I update on my Profile so UMA is more accurate?",
  ];

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

  useEffect(() => {
    textareaRef.current?.focus();
    // Listen for family member switches
    const onMemberChange = () => setActiveMemberState(getActiveFamilyMember());
    window.addEventListener("mv-active-member-changed", onMemberChange);
    window.addEventListener("focus", onMemberChange);
    return () => {
      window.removeEventListener("mv-active-member-changed", onMemberChange);
      window.removeEventListener("focus", onMemberChange);
    };
  }, []);

  // Persist chat history to localStorage whenever messages change (strip live-action state)
  useEffect(() => {
    if (messages.length === 0) return;
    const id = setTimeout(() => {
      try {
        const toSave = messages
          .slice(-MAX_STORED_MSGS)
          .map(({ quickReplies: _qr, mergeProposal: _mp, ...rest }) => rest);
        localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(toSave));
      } catch { /* ignore quota errors */ }
    }, 600);
    return () => clearTimeout(id);
  }, [messages]);

  function newChat() {
    try { localStorage.removeItem(CHAT_HISTORY_KEY); } catch { /* ignore */ }
    setMessages([INITIAL_GREETING]);
    setPickerState(null);
    setText("");
    setPendingFile(null);
    setLastPdfForMerge(null);
    setRecordNotice(null);
  }

  // ── quick-reply handlers ─────────────────────────────────────────────────

  function dismissQuickReplies(msgIdx: number) {
    setMessages((m) => m.map((msg, i) => (i === msgIdx ? { ...msg, quickReplies: undefined } : msg)));
    setPickerState(null);
  }

  function fmtHHmm(hhmm: string): string {
    const [hStr, mStr] = hhmm.split(":");
    const h = parseInt(hStr, 10);
    const m = mStr ?? "00";
    const period = h < 12 ? "AM" : "PM";
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${h12}:${m} ${period}`;
  }

  function createReminder(medName: string, timeHHmm: string, repeatDaily: boolean, msgIdx: number) {
    const storeNow = getStore();
    const hl = normalizeHealthLogs(storeNow.healthLogs ?? {});
    const entry: MedicationReminderEntry = {
      id: newHealthLogId(),
      medicationName: medName,
      timeLocalHHmm: timeHHmm,
      repeatDaily,
      enabled: true,
      createdAtISO: new Date().toISOString(),
    };
    saveStore({ ...storeNow, healthLogs: { ...hl, medicationReminders: [...hl.medicationReminders, entry] } });
    flashStatus(`Reminder set — ${medName} at ${fmtHHmm(timeHHmm)} ✓`);
    dismissQuickReplies(msgIdx);
    const timeLabel = fmtHHmm(timeHHmm);
    setMessages((m) => [
      ...m,
      {
        role: "assistant",
        content: `Done! I've set a daily reminder for **${medName}** at **${timeLabel}**. You'll get a notification while UMA is open in this tab. You can turn it off anytime from the Dashboard.`,
      },
    ]);
    setPetMood("happy");
    setCelebrate(true);
    setTimeout(() => setCelebrate(false), 900);
    // Request notification permission opportunistically
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  }

  function handleQuickReply(qr: ChatQuickReply, msgIdx: number) {
    if (qr.sendText) {
      dismissQuickReplies(msgIdx);
      setText(qr.sendText);
      setTimeout(() => textareaRef.current?.focus(), 0);
      return;
    }
    if (!qr.action) return;
    switch (qr.action.type) {
      case "set_reminder":
        createReminder(qr.action.medName, qr.action.timeHHmm, qr.action.repeatDaily, msgIdx);
        break;
      case "pick_time":
        setPickerState({ medName: qr.action.medName, msgIdx, time: "08:00" });
        break;
      case "dismiss":
        dismissQuickReplies(msgIdx);
        break;
    }
  }

  // ── end quick-reply handlers ────────────────────────────────────────────

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
    const result = smartMergeExtractedDoc(doc, { standardLexiconPatches: proposal.lexiconPatches });
    setLastPdfForMerge(null);
    setRecordNotice(result.message);
    setMessages((m) => [
      ...m.map((msg) => (msg.role === "assistant" ? { ...msg, mergeProposal: undefined } : msg)),
      {
        role: "assistant",
        content: "Done—I added that file to your records. Your home screen and charts will update.",
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
    setStreamingText("");
    setPetMood("thinking");
    flashStatus("Thinking…", 60_000);

    let attachments: { fileName: string; mimeType: string; dataBase64: string }[] = [];
    const fileSnapshot = pendingFile;
    if (fileSnapshot) {
      if (fileSnapshot.size > MAX_CHAT_PDF_BYTES) {
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            content: "That PDF is too big for chat (12 MB max). Please upload it from your home screen instead.",
          },
        ]);
        setLoading(false);
        setPetMood("idle");
        setStreamingText("");
        return;
      }
      try {
        const dataBase64 = await readFileAsBase64(fileSnapshot);
        attachments = [{ fileName: fileSnapshot.name, mimeType: "application/pdf", dataBase64 }];
      } catch {
        setMessages((m) => [...m, { role: "assistant", content: "I couldn't read that file. Try another PDF." }]);
        setLoading(false);
        setPetMood("idle");
        setStreamingText("");
        return;
      }
    }

    try {
      const r = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          question: q || (fileSnapshot ? "Please read this PDF for my records." : ""),
          store: getViewingStore(),
          activeFamilyMember: getActiveFamilyMember(),
          messages: historyPayload,
          attachments,
        }),
      });

      if (!r.ok) {
        const j = await r.json();
        throw new Error(j?.error ?? "Chat failed");
      }

      const reader = r.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let fullStreamingText = "";
      let donePayload: any = null;
      let chatUsage: { inputTokens: number; outputTokens: number; model: string; totalUSD: number } | null = null;

      // Read SSE stream
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const jsonStr = line.slice(6);
            if (!jsonStr.trim()) continue;

            const event = JSON.parse(jsonStr);

            if (event.type === "delta") {
              fullStreamingText += event.text;
              setStreamingText(fullStreamingText);
            } else if (event.type === "usage") {
              chatUsage = {
                inputTokens: event.inputTokens,
                outputTokens: event.outputTokens,
                model: event.model,
                totalUSD: event.totalUSD,
              };
            } else if (event.type === "done") {
              donePayload = event;
            } else if (event.type === "error") {
              throw new Error(event.message || "SSE error");
            }
          }
        }
      }

      if (!donePayload) throw new Error("No done event received");

      const j = donePayload;

      // Log chat usage to localStorage
      if (chatUsage) {
        appendUsageLogEntry({
          kind: "chat_message",
          model: chatUsage.model,
          inputTokens: chatUsage.inputTokens,
          outputTokens: chatUsage.outputTokens,
          totalUSD: chatUsage.totalUSD,
          label: (q || "Chat message").slice(0, 60),
        });
      }

      let assistantContent = j.answer as string;
      const patch = j.healthLogMedicationIntake as
        | Pick<MedicationIntakeLogEntry, "medicationName" | "action" | "notes">
        | null
        | undefined;
      const actions: MedicationIntakeLogEntry["action"][] = ["taken", "missed", "skipped", "extra"];
      let savedHealthLog = false;
      if (
        patch &&
        typeof patch.medicationName === "string" &&
        patch.medicationName.trim() &&
        typeof patch.action === "string" &&
        actions.includes(patch.action as MedicationIntakeLogEntry["action"])
      ) {
        const storeAfter = getStore();
        const hl = normalizeHealthLogs(storeAfter.healthLogs ?? {});
        const entry: MedicationIntakeLogEntry = {
          id: newHealthLogId(),
          loggedAtISO: new Date().toISOString(),
          medicationName: patch.medicationName.trim().slice(0, 200),
          action: patch.action as MedicationIntakeLogEntry["action"],
          notes: typeof patch.notes === "string" && patch.notes.trim() ? patch.notes.trim().slice(0, 2000) : undefined,
        };
        saveStore({
          ...storeAfter,
          healthLogs: { ...hl, medicationIntake: [entry, ...hl.medicationIntake] },
        });
        savedHealthLog = true;
        flashStatus(`Health log saved — ${entry.action} ${entry.medicationName}`);
        const label =
          entry.action === "taken"
            ? "Logged dose taken"
            : entry.action === "missed"
              ? "Logged missed dose"
              : entry.action === "skipped"
                ? "Logged skipped dose"
                : "Logged extra dose";
        assistantContent += `\n\n---\n**Health log:** ${label} for **${entry.medicationName}**.`;
      }

      // Auto-add medication if the agent detected an add intent
      const addPatch = j.medicationAddProposal as MedicationAddChatPatch | null | undefined;
      if (addPatch?.name) {
        const storeForAdd = getStore();
        const alreadyExists = storeForAdd.meds.some(
          (m) => m.name.trim().toLowerCase() === addPatch.name.trim().toLowerCase()
        );
        if (!alreadyExists) {
          const newMed: ExtractedMedication = {
            name: addPatch.name,
            dose: addPatch.dose,
            frequency: addPatch.frequency,
            medicationForm: mapFormKind(addPatch.form),
            medicationLineSource: "manual_entry",
            medicationProductCategory: addPatch.productCategory ?? "unspecified",
            medicationProductCategorySource: "auto",
            startDate: new Date().toISOString().split("T")[0],
          };
          saveStore({ ...storeForAdd, meds: [newMed, ...storeForAdd.meds] });
          flashStatus(`Added ${addPatch.name} to your medicines ✓`);
          setRecordNotice(`Added ${addPatch.name} to your medicines. It's now on your Dashboard.`);
        }
      }

      // Auto-update medication if the agent detected an update intent
      const updatePatch = j.medicationUpdateProposal as MedicationUpdateChatPatch | null | undefined;
      if (updatePatch?.name) {
        const storeForUpdate = getStore();
        const idx = storeForUpdate.meds.findIndex(
          (m) => m.name.trim().toLowerCase() === updatePatch.name.trim().toLowerCase()
        );
        if (idx >= 0) {
          const updated: ExtractedMedication = { ...storeForUpdate.meds[idx] };
          if (updatePatch.dose) updated.dose = updatePatch.dose;
          if (updatePatch.frequency) updated.frequency = updatePatch.frequency;
          if (updatePatch.form) updated.medicationForm = mapFormKind(updatePatch.form);
          const newMeds = [...storeForUpdate.meds];
          newMeds[idx] = updated;
          saveStore({ ...storeForUpdate, meds: newMeds });
          const parts = [updatePatch.dose, updatePatch.frequency].filter(Boolean).join(", ");
          flashStatus(`Updated ${updatePatch.name}${parts ? ` — ${parts}` : ""} ✓`);
          setRecordNotice(`Updated ${updatePatch.name}${parts ? ` — ${parts}` : ""}. Dashboard reflects the change.`);
        }
      }

      setMessages((m) => {
        const cleared = j.mergeProposal
          ? m.map((msg) => (msg.role === "assistant" ? { ...msg, mergeProposal: undefined } : msg))
          : m;
        return [
          ...cleared,
          {
            role: "assistant",
            content: assistantContent,
            mergeProposal: j.mergeProposal as MergeProposal | undefined,
            quickReplies: (j.quickReplies as ChatQuickReply[] | undefined) ?? undefined,
          },
        ];
      });
      if (j.mergeProposal && fileSnapshot) setLastPdfForMerge(fileSnapshot);
      else setLastPdfForMerge(null);
      setPendingFile(null);
      if (j.mergeProposal) {
        let notice = (j.mergeProposal as MergeProposal).nameMismatch
          ? "The name on the PDF does not match your profile. Read the yellow note in the card, then add only if you are sure."
          : 'We read your PDF. Check the card below and tap "Add to records" to save it to your home screen.';
        if (savedHealthLog && patch?.medicationName) {
          notice += ` Also saved a **Health log** entry for ${patch.medicationName}.`;
        }
        setRecordNotice(notice);
      } else if (savedHealthLog) {
        const p = patch as Pick<MedicationIntakeLogEntry, "medicationName" | "action">;
        const short =
          p.action === "taken"
            ? "Dose logged"
            : p.action === "missed"
              ? "Missed dose logged"
              : p.action === "skipped"
                ? "Skipped dose logged"
                : "Extra dose logged";
        setRecordNotice(`${short}: ${p.medicationName}. Open Health log anytime to change it.`);
      }
      setPetMood("happy");
      setCelebrate(true);
      setTimeout(() => setCelebrate(false), 900);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "unknown error";
      setMessages((m) => [...m, { role: "assistant", content: `Something went wrong: ${message}` }]);
      flashStatus("Something went wrong", 4000);
      setPetMood("idle");
    } finally {
      setLoading(false);
      setStreamingText("");
      setTimeout(() => setPetMood("idle"), 1200);
    }
  }

  function sendSuggestion(prompt: string) {
    setText(prompt);
    setTimeout(() => textareaRef.current?.focus(), 0);
  }

  const companionLabel = useMemo(() => {
    if (petMood === "thinking") return `${petName} is thinking...`;
    if (petMood === "happy") return `${petName} is rooting for you`;
    return `${petName}, your health buddy`;
  }, [petMood, petName]);

  return (
    <div className="h-dvh flex flex-col no-print">
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

      <main className="flex-1 min-h-0 flex flex-col px-0 sm:px-4 pb-0 sm:pb-4 pt-0 sm:pt-3 overflow-hidden">
        {activeMember && (
          <div className="mx-0 sm:mx-0 mb-0 sm:mb-2 flex items-center gap-2 rounded-none sm:rounded-2xl border-b sm:border border-[var(--accent)]/30 bg-[var(--accent)]/8 px-4 py-2 shrink-0">
            <span className="text-base" aria-hidden>👤</span>
            <p className="text-xs text-[var(--fg)] flex-1 min-w-0 truncate">
              <span className="font-medium">{activeMember.displayName}</span>
              <span className="text-[var(--muted)]"> · {activeMember.relation}'s profile active</span>
            </p>
            <button
              type="button"
              onClick={() => { setActiveFamilyMember(undefined); setActiveMemberState(null); }}
              className="text-[10px] text-[var(--accent)] hover:underline shrink-0"
            >
              Switch back
            </button>
          </div>
        )}
        <section className="flex-1 min-h-0 rounded-none sm:rounded-3xl border-y border-[var(--border)] sm:border bg-[var(--panel)] sm:shadow-[var(--shadow)] flex flex-col overflow-hidden">
          <div className="border-b border-[var(--border)] px-4 py-3 flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{companionLabel}</p>
                <p className="text-xs mv-muted truncate">Chat here, or add a PDF to save to your records</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {messages.length > 1 && (
                <button
                  type="button"
                  title="New chat — clears history on this device"
                  className="h-7 w-7 rounded-xl flex items-center justify-center border border-[var(--border)] text-[var(--muted)] hover:text-[var(--fg)] hover:border-[var(--fg)]/30 transition-colors"
                  onClick={newChat}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                type="button"
                title="Usage & cost"
                className="h-7 w-7 rounded-xl flex items-center justify-center border border-[var(--border)] text-[var(--muted)] hover:text-[var(--fg)] hover:border-[var(--fg)]/30 transition-colors"
                onClick={() => setShowUsage((v) => !v)}
              >
                <BarChart2 className="h-3.5 w-3.5" />
              </button>
              <Badge className="inline-flex items-center gap-1">
                <Heart className="h-3 w-3" /> Health chat
              </Badge>
            </div>
          </div>

          {showUsage && (() => {
            const summary = getUsageSummary();
            const fmtUSD = (n: number) => n < 0.01 ? "<$0.01" : `$${n.toFixed(4)}`;
            return (
              <div className="border-b border-[var(--border)] bg-[var(--panel)] px-4 py-3">
                <div className="max-w-4xl mx-auto">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-[var(--fg)]">API Usage (prototype view)</p>
                    <button type="button" onClick={() => setShowUsage(false)} className="text-[var(--muted)] hover:text-[var(--fg)]">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs mv-muted mb-2">
                    <span>PDF extractions: <strong className="text-[var(--fg)]">{summary.extractionCount}</strong></span>
                    <span>Chat messages: <strong className="text-[var(--fg)]">{summary.chatCount}</strong></span>
                    <span>Input tokens: <strong className="text-[var(--fg)]">{summary.totalInputTokens.toLocaleString()}</strong></span>
                    <span>Output tokens: <strong className="text-[var(--fg)]">{summary.totalOutputTokens.toLocaleString()}</strong></span>
                    <span>Total cost: <strong className="text-[var(--accent)]">{fmtUSD(summary.totalUSD)}</strong></span>
                  </div>
                  {summary.entries.length > 0 && (
                    <div className="max-h-40 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--panel-2)] divide-y divide-[var(--border)]">
                      {summary.entries.slice(0, 30).map((e) => (
                        <div key={e.id} className="flex items-center gap-2 px-3 py-1.5 text-[10px]">
                          <span className={`shrink-0 px-1.5 py-0.5 rounded-md font-medium ${e.kind === "pdf_extraction" ? "bg-blue-500/15 text-blue-400" : "bg-purple-500/15 text-purple-400"}`}>
                            {e.kind === "pdf_extraction" ? "PDF" : "Chat"}
                          </span>
                          <span className="flex-1 truncate mv-muted">{e.label}</span>
                          <span className="shrink-0 mv-muted">{e.inputTokens.toLocaleString()}↑ {e.outputTokens.toLocaleString()}↓</span>
                          <span className="shrink-0 text-[var(--fg)] font-medium">{fmtUSD(e.totalUSD)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {summary.entries.length === 0 && (
                    <p className="text-xs mv-muted">No usage recorded yet. Start chatting or upload a PDF.</p>
                  )}
                </div>
              </div>
            );
          })()}

          <div
            ref={scrollRef}
            className="flex-1 min-h-0 overflow-y-auto bg-[var(--panel-2)]/35 flex flex-col justify-end"
          >
            <div className="mx-auto max-w-4xl w-full px-3 sm:px-4 py-5 sm:py-6 flex flex-col gap-4 min-h-0">
              <div className="space-y-4">
                {messages.map((m, i) => (
                <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start flex-col gap-2"}>
                  <div
                    className={[
                      "max-w-[96%] sm:max-w-[90%] rounded-2xl px-4 py-3 text-sm leading-6 border",
                      m.role === "user"
                        ? "bg-[var(--accent)] text-[var(--accent-contrast)] border-[var(--accent)]"
                        : "bg-[var(--panel)] border-[var(--border)] text-[var(--fg)]",
                    ].join(" ")}
                  >
                    <ChatMarkdown content={m.content} variant={m.role === "user" ? "user" : "assistant"} />
                  </div>
                  {m.role === "assistant" && m.mergeProposal ? (
                    <div className="max-w-[96%] sm:max-w-[90%] rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-3 space-y-2">
                      <p className="text-xs font-medium text-[var(--fg)]">Save to home screen</p>
                      {m.mergeProposal.nameMismatch ? (
                        <div className="rounded-lg border border-amber-500/45 bg-amber-500/10 p-2.5 text-xs text-[var(--fg)] space-y-1.5">
                          <p className="font-medium flex items-center gap-1.5">
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden />
                            Name does not match
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
                          Saves this file to your list, test results, and charts—the same as uploading from your home
                          screen.
                        </p>
                      )}
                      <Button
                        className="w-full gap-2"
                        onClick={() => void applyMerge(m.mergeProposal!, lastPdfForMerge)}
                      >
                        <FileText className="h-4 w-4" />
                        {m.mergeProposal.nameMismatch ? "Save anyway" : "Add to records"}
                      </Button>
                    </div>
                  ) : null}

                  {/* ── reminder quick-reply chips ── */}
                  {m.role === "assistant" && m.quickReplies?.length ? (
                    <div className="max-w-[96%] sm:max-w-[90%]">
                      {pickerState?.msgIdx === i ? (
                        /* inline time-picker */
                        <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-3 space-y-3">
                          <p className="text-xs font-semibold text-[var(--fg)]">
                            Set daily reminder for <span className="text-[var(--accent)]">{pickerState.medName}</span>
                          </p>
                          <div className="flex items-center gap-2">
                            <TimePicker
                              value={pickerState.time}
                              onChange={(v) =>
                                setPickerState((s) => s ? { ...s, time: v } : null)
                              }
                              className="flex-1"
                            />
                            <Button
                              className="h-9 px-4 shrink-0 gap-1.5 text-xs"
                              onClick={() =>
                                createReminder(pickerState.medName, pickerState.time, true, i)
                              }
                            >
                              Set reminder
                            </Button>
                          </div>
                          <button
                            type="button"
                            className="text-xs text-[var(--muted)] hover:text-[var(--fg)] transition-colors"
                            onClick={() => setPickerState(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        /* chip row */
                        <div className="flex flex-wrap gap-2 pt-1">
                          <p className="w-full text-[11px] text-[var(--muted)] pb-0.5">
                            Set up a reminder?
                          </p>
                          {m.quickReplies.map((qr, qi) => (
                            <button
                              key={qi}
                              type="button"
                              onClick={() => handleQuickReply(qr, i)}
                              className={[
                                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all",
                                qr.action?.type === "dismiss"
                                  ? "border-[var(--border)] bg-transparent text-[var(--muted)] hover:text-[var(--fg)] hover:border-[var(--fg)]/30"
                                  : "border-[var(--accent)]/40 bg-[var(--accent)]/8 text-[var(--accent)] hover:bg-[var(--accent)]/16 hover:border-[var(--accent)]/70",
                              ].join(" ")}
                            >
                              {qr.emoji && <span aria-hidden>{qr.emoji}</span>}
                              {qr.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
                ))}
                {loading && (
                <div className="flex justify-start flex-col gap-2">
                  {pendingFile ? (
                    <div
                      className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] px-4 py-3 text-sm max-w-[96%] sm:max-w-[90%] space-y-3"
                      role="status"
                      aria-live="polite"
                    >
                      <div className="flex items-center gap-2 text-[var(--fg)]">
                        <Loader2 className="h-4 w-4 animate-spin shrink-0 text-[var(--accent)]" aria-hidden />
                        <span className="font-medium">Reading your PDF…</span>
                      </div>
                      <p className="text-xs mv-muted leading-relaxed">
                        UMA is pulling out test results, medicines, and a short summary. Long or scanned files can take
                        up to a minute—please keep this tab open.
                      </p>
                      <div className="h-1.5 w-full rounded-full bg-[var(--border)] overflow-hidden">
                        <div
                          className="h-full w-2/5 rounded-full bg-[var(--accent)]"
                          style={{ animation: "umaChatExtractBar 1.8s ease-in-out infinite" }}
                        />
                      </div>
                    </div>
                  ) : null}
                  {streamingText ? (
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] px-4 py-3 text-sm max-w-[96%] sm:max-w-[90%]">
                      <ChatMarkdown content={streamingText} variant="assistant" />
                    </div>
                  ) : !pendingFile ? (
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] px-4 py-3 text-sm mv-muted flex items-center gap-2">
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
                    </div>
                  ) : null}
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

              <div className="sticky bottom-0 z-[2] mt-auto flex justify-center pt-2 pb-1 [mask-image:linear-gradient(to_top,black_65%,transparent)]">
                <div
                  className="relative rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 shadow-[var(--shadow)]"
                  style={{
                    transform: petMood === "thinking" ? "translateY(0%)" : "translateY(33%)",
                    transition: "transform 0.4s cubic-bezier(0.34,1.56,0.64,1)",
                  }}
                >
                  <UmaCharacter mood={petMood} compact fontPx={8} statusText={statusText} />
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
              </div>
            </div>
          </div>

          <div className="border-t border-[var(--border)] bg-[var(--panel)] p-3 sm:p-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] shrink-0">
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
                  placeholder="Ask about your files, medicines, or test results—or attach a PDF…"
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
                    <p className="text-[11px] mv-muted truncate hidden sm:block">Enter to send · Shift+Enter for a new line</p>
                  </div>
                  <Button onClick={() => void send()} disabled={loading} className="h-9 gap-2 px-3 shrink-0">
                    <SendHorizontal className="h-4 w-4" />
                    {loading ? "Thinking..." : "Send"}
                  </Button>
                </div>
              </div>
              <p className="mt-2 text-[11px] mv-muted">
                If you attach a PDF, we read it at the same time as your message. Very large files
                work better from the home screen upload button.
              </p>
            </div>
          </div>
        </section>
      </main>

      <RecordNoticeToast message={recordNotice} onDismiss={dismissRecordNotice} />
    </div>
  );
}
