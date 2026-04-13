"use client";

import { useRouter } from "next/navigation";
import { Loader2, CheckCircle, AlertCircle, X } from "lucide-react";
import { useGlobalUpload } from "@/lib/uploadContext";

/**
 * Floating badge pinned to the bottom-right corner that shows the active
 * PDF extraction progress on every page. Tapping it navigates back to the
 * dashboard when the result is ready.
 */
export function GlobalUploadBadge() {
  const { phase, fileName, error, clear } = useGlobalUpload();
  const router = useRouter();

  if (phase === "idle") return null;

  const short = fileName.length > 28 ? `${fileName.slice(0, 25)}…` : fileName;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        bottom: "1.25rem",
        right: "1rem",
        zIndex: 9999,
        maxWidth: "calc(100vw - 2rem)",
        animation: "umaBubbleFade 0.25s ease-out",
      }}
    >
      <div
        className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--panel)] px-4 py-3 shadow-[var(--shadow)]"
        style={{ minWidth: 220, maxWidth: 340 }}
      >
        {/* Icon */}
        {phase === "extracting" && (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[var(--accent)]" />
        )}
        {phase === "ready" && (
          <CheckCircle className="h-4 w-4 shrink-0 text-emerald-500" />
        )}
        {phase === "error" && (
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-500" />
        )}

        {/* Text */}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-[var(--fg)] truncate">
            {phase === "extracting" && "Reading PDF…"}
            {phase === "ready" && "PDF ready to add"}
            {phase === "error" && "Upload failed"}
          </p>
          <p className="text-[10px] text-[var(--muted)] truncate mt-0.5">{error ?? short}</p>
        </div>

        {/* Action */}
        {phase === "ready" && (
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="shrink-0 rounded-lg bg-[var(--accent)] px-2.5 py-1 text-[11px] font-semibold text-[var(--accent-contrast)] hover:opacity-90 transition-opacity"
          >
            Review
          </button>
        )}
        {(phase === "error" || phase === "ready") && (
          <button
            type="button"
            aria-label="Dismiss"
            onClick={clear}
            className="shrink-0 text-[var(--muted)] hover:text-[var(--fg)] transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        {phase === "extracting" && (
          <button
            type="button"
            aria-label="Cancel upload"
            onClick={clear}
            className="shrink-0 text-[var(--muted)] hover:text-[var(--fg)] transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
