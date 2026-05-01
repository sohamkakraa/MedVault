"use client";

/**
 * Tidy — beta data-hygiene action.
 *
 * One-click sweep that asks the AI to review the user's saved lists and
 * propose a StorePatch. The user reviews each op and clicks "Apply" to
 * commit. Beta — nothing is auto-applied.
 *
 * This component lives inside <AppTopNav>, which uses `backdrop-blur` —
 * `backdrop-filter` creates a new containing block, so any descendant with
 * `position: fixed` is positioned relative to the navbar instead of the
 * viewport. That bug pinned earlier modal versions inside the navbar.
 *
 * Fix: render the modal through `createPortal(node, document.body)`. The
 * portal escapes the navbar's containing block entirely, so `fixed inset-0`
 * means "the whole viewport" again.
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Sparkles, Loader2, X, Check, Plus, Minus, ArrowRight, Bot, Cpu } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { getStore, saveStore } from "@/lib/store";
import { applyStorePatch, type StorePatchOp } from "@/lib/intent/storePatch";

type TidySource = "llm" | "heuristic" | "heuristic_fallback";

type TidyResponse = {
  ok: true;
  source: TidySource;
  ops: StorePatchOp[];
  summary: string;
  note?: string;
};

export function TidyButton() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<TidyResponse | null>(null);
  const [accepted, setAccepted] = useState<boolean[]>([]);
  // We portal into document.body, so we need to delay rendering until the
  // client mount happens — `document` doesn't exist during SSR.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  async function runTidy() {
    setLoading(true);
    setError(null);
    setResponse(null);
    setAccepted([]);
    try {
      const store = getStore();
      const payload = {
        store: {
          profile: {
            primaryCareProvider: store.profile?.primaryCareProvider ?? null,
            nextVisitHospital: store.profile?.nextVisitHospital ?? null,
            doctorQuickPick: store.profile?.doctorQuickPick ?? [],
            facilityQuickPick: store.profile?.facilityQuickPick ?? [],
            doctorQuickPickHidden: store.profile?.doctorQuickPickHidden ?? [],
            facilityQuickPickHidden: store.profile?.facilityQuickPickHidden ?? [],
            conditions: store.profile?.conditions ?? [],
            allergies: store.profile?.allergies ?? [],
          },
          docs: (store.docs ?? []).slice(0, 200).map((d) => ({
            id: d.id,
            provider: d.provider ?? null,
            doctors: d.doctors ?? [],
            facilityName: d.facilityName ?? null,
          })),
          meds: (store.meds ?? []).slice(0, 100).map((m) => ({
            name: m.name,
            dose: m.dose ?? "",
            frequency: m.frequency ?? "",
          })),
        },
      };
      const res = await fetch("/api/tidy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || `Tidy failed (${res.status})`);
      }
      const j = (await res.json()) as TidyResponse;
      setResponse(j);
      // Default-accept everything; user toggles off any op they reject.
      setAccepted(j.ops.map(() => true));
      setOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Tidy failed.");
      setOpen(true);
    } finally {
      setLoading(false);
    }
  }

  function applyAccepted() {
    if (!response) return;
    const acceptedOps = response.ops.filter((_, i) => accepted[i]);
    if (acceptedOps.length === 0) {
      setOpen(false);
      return;
    }
    const store = getStore();
    const result = applyStorePatch(store, {
      ops: acceptedOps,
      summary: response.summary,
    });
    saveStore(result.store);
    setOpen(false);
  }

  const ops = response?.ops ?? [];
  const hasAny = ops.length > 0;
  const allChecked = accepted.every(Boolean);
  const noneChecked = accepted.every((v) => !v);

  // ── Modal body — portaled so it escapes the navbar's backdrop-blur
  // containing block. Without the portal, fixed-positioned descendants of a
  // backdrop-filter ancestor are positioned relative to the ancestor, not
  // the viewport. The portal bypass is the cleanest fix.
  const modal =
    open && mounted
      ? createPortal(
          <div className="fixed inset-0 z-[100] overflow-y-auto bg-black/40">
            <div className="flex min-h-full items-center justify-center p-3 sm:p-6">
              <div className="w-full max-w-2xl rounded-2xl border border-[var(--border)] bg-[var(--panel)] shadow-2xl">
                <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] p-5">
                  <div className="flex items-start gap-3">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--accent)]/12 text-[var(--accent)]">
                      <Sparkles className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-base font-semibold text-[var(--fg)]">Tidy your records</h2>
                        {response ? <SourceBadge source={response.source} /> : null}
                      </div>
                      <p className="mt-1 text-sm mv-muted">
                        {response?.summary ?? "Reviewing your saved data…"}
                      </p>
                      {response?.note ? (
                        <p className="mt-1 text-[11px] mv-muted italic">{response.note}</p>
                      ) : null}
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-8 w-8 shrink-0 p-0"
                    onClick={() => setOpen(false)}
                    aria-label="Close"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                <div className="p-5">
                  {error ? (
                    <p className="rounded-xl border border-red-500/40 bg-red-500/8 p-3 text-sm text-red-400">
                      {error}
                    </p>
                  ) : null}

                  {!error && !hasAny ? (
                    <p className="text-sm mv-muted">Nothing to clean up — your lists look good.</p>
                  ) : null}

                  {!error && hasAny ? (
                    <>
                      <div className="mb-3 flex items-center justify-between">
                        <p className="text-xs mv-muted">
                          {ops.length} suggestion{ops.length === 1 ? "" : "s"} — toggle off anything
                          you disagree with.
                        </p>
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          onClick={() =>
                            setAccepted(ops.map(() => (allChecked ? false : true)))
                          }
                        >
                          {allChecked ? "Uncheck all" : "Check all"}
                        </Button>
                      </div>
                      <ul className="space-y-1.5">
                        {ops.map((op, i) => {
                          const checked = !!accepted[i];
                          return (
                            <li
                              key={i}
                              className={
                                "flex items-start gap-3 rounded-xl border px-3 py-2.5 transition-colors " +
                                (checked
                                  ? "border-[var(--accent)]/40 bg-[var(--accent)]/8"
                                  : "border-[var(--border)] bg-[var(--panel-2)] opacity-70")
                              }
                            >
                              <input
                                type="checkbox"
                                className="mt-0.5 h-4 w-4 shrink-0"
                                checked={checked}
                                onChange={(e) =>
                                  setAccepted((prev) => {
                                    const next = [...prev];
                                    next[i] = e.target.checked;
                                    return next;
                                  })
                                }
                                aria-label={describeOp(op)}
                              />
                              <OpIcon op={op} />
                              <span className="flex-1 text-sm text-[var(--fg)]">
                                {describeOp(op)}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </>
                  ) : null}
                </div>

                <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] p-4">
                  <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  {hasAny ? (
                    <Button type="button" onClick={applyAccepted} disabled={noneChecked}>
                      {noneChecked ? "Nothing selected" : `Apply ${accepted.filter(Boolean).length}`}
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        className="gap-1.5 max-sm:hidden"
        onClick={runTidy}
        disabled={loading}
        title="Beta: ask UMA to clean up your saved lists"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        <span className="hidden md:inline">Tidy</span>
        <span className="hidden md:inline rounded-full border border-[var(--accent-2)]/30 bg-[var(--accent-2)]/10 px-1.5 py-0.5 text-[10px] font-medium text-[var(--accent-2)]">
          Beta
        </span>
      </Button>
      {modal}
    </>
  );
}

// ── Pieces ────────────────────────────────────────────────────────────────

function SourceBadge({ source }: { source: TidySource }) {
  if (source === "llm") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-2 py-0.5 text-[10px] font-medium text-[var(--accent)]">
        <Bot className="h-2.5 w-2.5" />
        AI-reviewed
      </span>
    );
  }
  // heuristic or heuristic_fallback — the user should know this isn't the AI pass
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border border-[var(--muted)]/30 bg-[var(--muted)]/10 px-2 py-0.5 text-[10px] font-medium mv-muted"
      title={source === "heuristic_fallback" ? "AI was unreachable — fell back to pattern matching" : "Pattern-based"}
    >
      <Cpu className="h-2.5 w-2.5" />
      {source === "heuristic_fallback" ? "Fallback" : "Heuristic"}
    </span>
  );
}

function OpIcon({ op }: { op: StorePatchOp }) {
  const isAdd = op.kind.startsWith("add_") || op.kind.startsWith("set_") || op.kind.startsWith("log_");
  const isRemove = op.kind.startsWith("remove_") || op.kind.startsWith("clear_") || op.kind.startsWith("cancel_");
  if (isAdd) {
    return (
      <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md bg-emerald-500/10 text-emerald-400">
        <Plus className="h-3 w-3" />
      </span>
    );
  }
  if (isRemove) {
    return (
      <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md bg-red-500/10 text-red-400">
        <Minus className="h-3 w-3" />
      </span>
    );
  }
  return (
    <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md bg-[var(--accent)]/10 text-[var(--accent)]">
      <ArrowRight className="h-3 w-3" />
    </span>
  );
}

/**
 * Render a StorePatchOp as one human-readable line. Handles every kind in
 * the discriminated union so adding a new kind to storePatch.ts will fail
 * the type-check here instead of silently rendering "[object Object]".
 */
function describeOp(op: StorePatchOp): string {
  switch (op.kind) {
    case "add_condition":
      return `Add ${op.value} to medical history`;
    case "remove_condition":
      return `Remove ${op.value} from medical history`;
    case "add_allergy":
      return `Add ${op.value} to allergies`;
    case "remove_allergy":
      return `Remove ${op.value} from allergies`;
    case "add_medication":
      return `Add ${op.name}${op.dose ? ` (${op.dose})` : ""} to medicines`;
    case "remove_medication":
      return `Remove ${op.name} from medicines`;
    case "add_doctor":
      return `Add ${op.name} to doctors`;
    case "remove_doctor":
      return `Remove ${op.name} from doctors`;
    case "add_hospital":
      return `Add ${op.name} to hospitals/clinics`;
    case "remove_hospital":
      return `Remove ${op.name} from hospitals/clinics`;
    case "set_next_appointment": {
      const parts = [
        op.doctor ? `with ${op.doctor}` : null,
        op.clinic ? `at ${op.clinic}` : null,
        op.dateISO ? `on ${op.dateISO}${op.timeHHmm ? ` ${op.timeHHmm}` : ""}` : null,
      ].filter(Boolean) as string[];
      return `Set next appointment ${parts.join(" ")}`;
    }
    case "clear_next_appointment":
      return "Clear your next appointment";
    case "log_side_effect":
      return `Log "${op.description}" in symptoms`;
    case "clear_side_effects_matching":
      return `Clear symptom entries matching "${op.query}"`;
    case "set_reminder":
      return `Reminder: ${op.medicationName} at ${op.timeLocalHHmm}${op.repeatDaily ? " daily" : ""}`;
    case "cancel_reminder":
      return `Cancel reminder for ${op.medicationName}`;
    case "set_interval_reminder":
      return `Interval reminder: "${op.label}" every ${op.intervalMinutes}min, ${op.windowStartHHmm}–${op.windowEndHHmm}`;
    case "cancel_interval_reminder":
      return `Cancel interval reminder: "${op.label}"`;
    case "set_profile_field":
      return `Set ${op.field} to ${op.value}`;
    default: {
      // Exhaustiveness check — TypeScript flags any newly added op kind.
      const _exhaustive: never = op;
      void _exhaustive;
      return "Unknown change";
    }
  }
}
