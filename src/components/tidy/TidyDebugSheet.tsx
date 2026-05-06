"use client";

import { Clipboard, Pencil } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/Sheet";

// ── Types ────────────────────────────────────────────────────────────────

export type TidyDebugInputSnapshot = {
  doctorCount: number;
  doctorNames: string[];
  hospitalCount: number;
  hospitalNames: string[];
  conditionCount: number;
  allergyCount: number;
  medicationCount: number;
};

export type TidyDebugRun = {
  timestamp: string;
  source: string;
  inputSnapshot: TidyDebugInputSnapshot;
  promptText: string;
  rawLlmOutput: unknown;
  schemaErrors: { path: string; message: string }[];
  appliedOps: unknown[];
  rejectedOps: { op: unknown; reason: string }[];
};

type TidyDebugSheetProps = {
  open: boolean;
  onClose: () => void;
  debugData: TidyDebugRun | null;
};

// ── Component ────────────────────────────────────────────────────────────

export function TidyDebugSheet({ open, onClose, debugData }: TidyDebugSheetProps) {
  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).catch(() => {
      // Clipboard write failed silently; not critical.
    });
  }

  const snap = debugData?.inputSnapshot;

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent
        side="right"
        className="w-screen sm:w-[480px] overflow-y-auto flex flex-col"
      >
        <SheetHeader className="pt-6">
          <SheetTitle>Tidy debug — last run</SheetTitle>
          {debugData ? (
            <SheetDescription>
              {new Date(debugData.timestamp).toLocaleString()} · source:{" "}
              <span className="font-mono">{debugData.source}</span>
            </SheetDescription>
          ) : (
            <SheetDescription>No debug data yet — run Tidy with ?debug=1 first.</SheetDescription>
          )}
        </SheetHeader>

        {debugData ? (
          <div className="flex-1 space-y-3 px-4 sm:px-6 pb-8 pt-2">

            {/* ── Section 1: Input ── */}
            <details open className="rounded-2xl border border-[var(--border)] overflow-hidden">
              <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-[var(--fg)] bg-[var(--panel-2)] hover:bg-[var(--panel)] transition-colors list-none flex items-center justify-between">
                <span>Input</span>
                <span className="text-xs font-normal text-[var(--muted)]">what was sent</span>
              </summary>
              <div className="p-4 space-y-3">
                <div className="rounded-xl bg-[var(--panel-2)] border border-[var(--border)] p-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                  <KV label="Doctors" value={snap?.doctorCount ?? 0} />
                  <KV label="Hospitals" value={snap?.hospitalCount ?? 0} />
                  <KV label="Conditions" value={snap?.conditionCount ?? 0} />
                  <KV label="Allergies" value={snap?.allergyCount ?? 0} />
                  <KV label="Medications" value={snap?.medicationCount ?? 0} />
                </div>
                {(snap?.doctorNames?.length ?? 0) > 0 && (
                  <div className="text-xs text-[var(--muted)]">
                    <span className="font-medium text-[var(--fg)]">Doctor names (first 5): </span>
                    {snap!.doctorNames.join(", ")}
                  </div>
                )}
                {(snap?.hospitalNames?.length ?? 0) > 0 && (
                  <div className="text-xs text-[var(--muted)]">
                    <span className="font-medium text-[var(--fg)]">Hospital names (first 5): </span>
                    {snap!.hospitalNames.join(", ")}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => copyToClipboard(JSON.stringify(snap, null, 2))}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-2.5 py-1.5 text-xs text-[var(--muted)] hover:text-[var(--fg)] transition-colors"
                  aria-label="Copy input snapshot JSON"
                >
                  <Clipboard className="h-3 w-3" />
                  Copy JSON
                </button>
              </div>
            </details>

            {/* ── Section 2: Retrieved (prompt) ── */}
            <details className="rounded-2xl border border-[var(--border)] overflow-hidden">
              <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-[var(--fg)] bg-[var(--panel-2)] hover:bg-[var(--panel)] transition-colors list-none flex items-center justify-between">
                <span>Retrieved</span>
                <span className="text-xs font-normal text-[var(--muted)]">what LLM saw</span>
              </summary>
              <div className="p-4 space-y-2">
                <pre className="font-mono text-xs whitespace-pre-wrap break-all max-h-64 overflow-auto bg-[var(--panel-2)] rounded-xl p-3 text-[var(--fg)] border border-[var(--border)]">
                  {debugData.promptText || "(empty)"}
                </pre>
                <button
                  type="button"
                  onClick={() => copyToClipboard(debugData.promptText)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-2.5 py-1.5 text-xs text-[var(--muted)] hover:text-[var(--fg)] transition-colors"
                  aria-label="Copy prompt text"
                >
                  <Clipboard className="h-3 w-3" />
                  Copy prompt
                </button>
              </div>
            </details>

            {/* ── Section 3: Proposed changes ── */}
            <details className="rounded-2xl border border-[var(--border)] overflow-hidden">
              <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-[var(--fg)] bg-[var(--panel-2)] hover:bg-[var(--panel)] transition-colors list-none flex items-center justify-between">
                <span>Proposed changes</span>
                <span className="text-xs font-normal text-[var(--muted)]">
                  {debugData.appliedOps.length + debugData.rejectedOps.length} ops
                </span>
              </summary>
              <div className="p-4 space-y-2">
                {debugData.appliedOps.length === 0 && debugData.rejectedOps.length === 0 ? (
                  <p className="text-xs text-[var(--muted)]">No ops proposed.</p>
                ) : null}
                {debugData.appliedOps.map((op, i) => (
                  <OpRow key={`applied-${i}`} op={op} status="applied" />
                ))}
                {debugData.rejectedOps.map(({ op, reason }, i) => (
                  <OpRow key={`rejected-${i}`} op={op} status="rejected" reason={reason} />
                ))}
              </div>
            </details>

            {/* ── Section 4: Errors / warnings ── */}
            <details className="rounded-2xl border border-[var(--border)] overflow-hidden">
              <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-[var(--fg)] bg-[var(--panel-2)] hover:bg-[var(--panel)] transition-colors list-none flex items-center justify-between">
                <span>Errors / warnings</span>
                <span className="text-xs font-normal text-[var(--muted)]">
                  {debugData.schemaErrors.length} error{debugData.schemaErrors.length === 1 ? "" : "s"}
                </span>
              </summary>
              <div className="p-4 space-y-2">
                {debugData.schemaErrors.length === 0 ? (
                  <p className="text-xs text-[var(--muted)]">No schema errors.</p>
                ) : (
                  debugData.schemaErrors.map((err, i) => (
                    <div
                      key={i}
                      className="rounded-lg border border-[var(--accent-2)]/30 bg-[var(--accent-2)]/8 px-3 py-2 text-xs text-[var(--accent-2)]"
                    >
                      <span className="font-medium">{err.path || "root"}: </span>
                      {err.message}
                    </div>
                  ))
                )}
                {debugData.rawLlmOutput !== undefined && (
                  <div className="mt-2 space-y-1.5">
                    <p className="text-xs font-medium text-[var(--fg)]">Raw LLM output:</p>
                    <pre className="font-mono text-xs whitespace-pre-wrap break-all max-h-48 overflow-auto bg-[var(--panel-2)] rounded-xl p-3 text-[var(--muted)] border border-[var(--border)]">
                      {JSON.stringify(debugData.rawLlmOutput, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </details>

          </div>
        ) : (
          <div className="flex-1 px-4 sm:px-6 pb-8 pt-4">
            <p className="text-sm text-[var(--muted)]">
              No debug data yet. Enable debug mode by adding{" "}
              <code className="font-mono text-xs bg-[var(--panel-2)] px-1.5 py-0.5 rounded">?debug=1</code>{" "}
              to the URL or setting{" "}
              <code className="font-mono text-xs bg-[var(--panel-2)] px-1.5 py-0.5 rounded">
                {`localStorage.uma_debug = "1"`}
              </code>
              , then run Tidy.
            </p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────

function KV({ label, value }: { label: string; value: number | string }) {
  return (
    <>
      <span className="text-[var(--muted)]">{label}</span>
      <span className="font-medium text-[var(--fg)]">{value}</span>
    </>
  );
}

function OpRow({
  op,
  status,
  reason,
}: {
  op: unknown;
  status: "applied" | "rejected";
  reason?: string;
}) {
  const opObj = op as Record<string, unknown>;
  const kind = typeof opObj?.kind === "string" ? opObj.kind : "unknown";
  const isApplied = status === "applied";

  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2.5">
      <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md bg-[var(--accent)]/10 text-[var(--accent)]">
        <Pencil className="h-3 w-3" />
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <code className="text-xs font-mono bg-[var(--panel)] px-1.5 py-0.5 rounded text-[var(--fg)]">
            {kind}
          </code>
          <span
            className={
              "text-[10px] font-medium px-1.5 py-0.5 rounded-full " +
              (isApplied
                ? "text-[var(--accent)] bg-[var(--accent)]/10"
                : "text-[var(--accent-2)] bg-[var(--accent-2)]/10")
            }
          >
            {isApplied ? "applied" : "rejected"}
          </span>
        </div>
        {reason && (
          <p className="mt-1 text-xs text-[var(--accent-2)]">{reason}</p>
        )}
        <pre className="mt-1 text-xs text-[var(--muted)] whitespace-pre-wrap break-all">
          {JSON.stringify(opObj, null, 2)}
        </pre>
      </div>
    </div>
  );
}
