"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { DateTimePicker } from "@/components/ui/DateTimePicker";
import { defaultHealthLogs, newHealthLogId, normalizeHealthLogs } from "@/lib/healthLogs";
import type { BloodPressureLogEntry, PatientStore, SideEffectLogEntry } from "@/lib/types";
import { Activity, Droplets, Stethoscope } from "lucide-react";

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const SYS_ERR = "Enter the top number from your reading (for example, 120).";
const DIA_ERR = "Enter the bottom number (for example, 80).";

const BloodPressureInputSchema = z
  .object({
    systolic: z.coerce
      .number({ error: SYS_ERR })
      .int({ error: SYS_ERR })
      .min(40, SYS_ERR)
      .max(260, SYS_ERR),
    diastolic: z.coerce
      .number({ error: DIA_ERR })
      .int({ error: DIA_ERR })
      .min(20, DIA_ERR)
      .max(160, DIA_ERR),
    pulseBpm: z.coerce
      .number()
      .int()
      .min(30)
      .max(220)
      .optional()
      .or(z.literal("").transform(() => undefined)),
    notes: z.string().max(2000).optional(),
    loggedAtISO: z.string().min(1),
  })
  .refine((d) => d.systolic > d.diastolic, {
    message: "Top number is usually larger than the bottom number — please double-check.",
    path: ["systolic"],
  });

const SideEffectInputSchema = z.object({
  description: z
    .string()
    .min(1, "Tell UMA in a few words what you noticed.")
    .max(4000),
  relatedMedicationName: z.string().optional(),
  intensity: z.enum(["unspecified", "mild", "moderate", "strong"]),
  loggedAtISO: z.string().min(1),
});

type BpErrors = Partial<Record<"systolic" | "diastolic" | "pulseBpm" | "loggedAtISO", string>>;
type SeErrors = Partial<Record<"description", string>>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sortByLoggedAt<T extends { loggedAtISO: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => b.loggedAtISO.localeCompare(a.loggedAtISO));
}

function formatLocal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function toIsoFromLocal(dtLocal: string): string {
  const d = new Date(dtLocal);
  if (Number.isNaN(d.getTime())) return new Date().toISOString();
  return d.toISOString();
}

function Spinner() {
  return (
    <span
      className="inline-block h-3 w-3 rounded-full border-2 border-current border-t-transparent animate-spin"
      aria-hidden
    />
  );
}

const fieldLabel = "block text-xs text-[var(--muted)]";
const fieldInput = "mt-1 h-9 text-sm rounded-2xl";
const errorMsg = "mt-1 text-xs text-[var(--accent-2)]";

// ─── Component ────────────────────────────────────────────────────────────────

export function DashboardHealthLogSection({
  store,
  onStoreChange,
  variant = "both",
}: {
  store: PatientStore;
  onStoreChange: (next: PatientStore) => void;
  variant?: "bloodPressure" | "sideEffects" | "both";
}) {
  // BP form state
  const [bpSys, setBpSys] = useState("");
  const [bpDia, setBpDia] = useState("");
  const [bpPulse, setBpPulse] = useState("");
  const [bpNotes, setBpNotes] = useState("");
  const [bpWhen, setBpWhen] = useState(() => new Date().toISOString().slice(0, 16));
  const [bpErrors, setBpErrors] = useState<BpErrors>({});
  const [bpSubmitting, setBpSubmitting] = useState(false);
  // ID generated at form-open time for idempotency
  const [bpPendingId, setBpPendingId] = useState<string | null>(null);

  // SE form state
  const [seText, setSeText] = useState("");
  const [seRelated, setSeRelated] = useState("");
  const [seIntensity, setSeIntensity] = useState<SideEffectLogEntry["intensity"]>("unspecified");
  const [seWhen, setSeWhen] = useState(() => new Date().toISOString().slice(0, 16));
  const [seErrors, setSeErrors] = useState<SeErrors>({});
  const [seSubmitting, setSeSubmitting] = useState(false);
  const [sePendingId, setSePendingId] = useState<string | null>(null);

  const [bpFormOpen, setBpFormOpen] = useState(false);
  const [seFormOpen, setSeFormOpen] = useState(false);

  const LOG_INLINE = 3;
  const [bpExpanded, setBpExpanded] = useState(false);
  const [seExpanded, setSeExpanded] = useState(false);

  // Wrapper divs holding "Add new" buttons — used for post-commit focus
  const addBpWrapRef = useRef<HTMLDivElement>(null);
  const addSeWrapRef = useRef<HTMLDivElement>(null);

  // Generate entry IDs when forms open
  useEffect(() => {
    if (bpFormOpen && !bpPendingId) setBpPendingId(newHealthLogId());
    if (!bpFormOpen) setBpPendingId(null);
  }, [bpFormOpen, bpPendingId]);

  useEffect(() => {
    if (seFormOpen && !sePendingId) setSePendingId(newHealthLogId());
    if (!seFormOpen) setSePendingId(null);
  }, [seFormOpen, sePendingId]);

  const commit = useCallback(
    (next: PatientStore) => {
      onStoreChange({ ...next, healthLogs: next.healthLogs ?? defaultHealthLogs() });
    },
    [onStoreChange]
  );

  const bpRows = useMemo(
    () => sortByLoggedAt(store.healthLogs?.bloodPressure ?? []),
    [store.healthLogs?.bloodPressure]
  );
  const seRows = useMemo(
    () => sortByLoggedAt(store.healthLogs?.sideEffects ?? []),
    [store.healthLogs?.sideEffects]
  );
  const medOptions = useMemo(
    () => store.meds.map((m) => m.name).filter(Boolean),
    [store.meds]
  );

  async function addBloodPressure(e: React.FormEvent) {
    e.preventDefault();
    if (bpSubmitting) return;

    const result = BloodPressureInputSchema.safeParse({
      systolic: bpSys,
      diastolic: bpDia,
      pulseBpm: bpPulse.trim() || undefined,
      notes: bpNotes.trim() || undefined,
      loggedAtISO: toIsoFromLocal(bpWhen),
    });

    if (!result.success) {
      const flat = result.error.flatten().fieldErrors;
      setBpErrors({
        systolic: flat.systolic?.[0],
        diastolic: flat.diastolic?.[0],
        pulseBpm: flat.pulseBpm?.[0],
      });
      return;
    }
    setBpErrors({});

    const entryId = bpPendingId ?? newHealthLogId();

    // Idempotency: skip if this ID was already committed (double-submit guard)
    const existing = store.healthLogs?.bloodPressure ?? [];
    if (existing.some((r) => r.id === entryId)) {
      setBpFormOpen(false);
      return;
    }

    setBpSubmitting(true);
    await new Promise<void>((res) => setTimeout(res, 0));

    try {
      const entry: BloodPressureLogEntry = {
        id: entryId,
        loggedAtISO: result.data.loggedAtISO,
        systolic: result.data.systolic,
        diastolic: result.data.diastolic,
        pulseBpm: result.data.pulseBpm,
        notes: result.data.notes,
      };
      const hl = normalizeHealthLogs(store.healthLogs ?? {});
      commit({
        ...store,
        healthLogs: { ...hl, bloodPressure: [entry, ...hl.bloodPressure] },
      });
      setBpSys("");
      setBpDia("");
      setBpPulse("");
      setBpNotes("");
      setBpFormOpen(false);
      requestAnimationFrame(() =>
        addBpWrapRef.current?.querySelector("button")?.focus()
      );
    } finally {
      setBpSubmitting(false);
    }
  }

  async function addSideEffect(e: React.FormEvent) {
    e.preventDefault();
    if (seSubmitting) return;

    const result = SideEffectInputSchema.safeParse({
      description: seText.trim(),
      relatedMedicationName: seRelated.trim() || undefined,
      intensity: seIntensity,
      loggedAtISO: toIsoFromLocal(seWhen),
    });

    if (!result.success) {
      const flat = result.error.flatten().fieldErrors;
      setSeErrors({ description: flat.description?.[0] });
      return;
    }
    setSeErrors({});

    const entryId = sePendingId ?? newHealthLogId();

    const existing = store.healthLogs?.sideEffects ?? [];
    if (existing.some((r) => r.id === entryId)) {
      setSeFormOpen(false);
      return;
    }

    setSeSubmitting(true);
    await new Promise<void>((res) => setTimeout(res, 0));

    try {
      const entry: SideEffectLogEntry = {
        id: entryId,
        loggedAtISO: result.data.loggedAtISO,
        description: result.data.description,
        relatedMedicationName: result.data.relatedMedicationName,
        intensity: result.data.intensity,
      };
      const hl = normalizeHealthLogs(store.healthLogs ?? {});
      commit({
        ...store,
        healthLogs: { ...hl, sideEffects: [entry, ...hl.sideEffects] },
      });
      setSeText("");
      setSeRelated("");
      setSeFormOpen(false);
      requestAnimationFrame(() =>
        addSeWrapRef.current?.querySelector("button")?.focus()
      );
    } finally {
      setSeSubmitting(false);
    }
  }

  function deleteBp(id: string) {
    const hl = normalizeHealthLogs(store.healthLogs ?? {});
    commit({ ...store, healthLogs: { ...hl, bloodPressure: hl.bloodPressure.filter((x) => x.id !== id) } });
  }

  function deleteSe(id: string) {
    const hl = normalizeHealthLogs(store.healthLogs ?? {});
    commit({ ...store, healthLogs: { ...hl, sideEffects: hl.sideEffects.filter((x) => x.id !== id) } });
  }

  if (variant === "bloodPressure") {
    return (
      <div id="health-logs-bp" className="scroll-mt-24">
        <CardHeader>
          <div className="flex items-center justify-between gap-1.5">
            <div className="flex items-center gap-2 min-w-0">
              <Droplets className="h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden />
              <h3 className="text-sm font-semibold truncate">Blood pressure readings</h3>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-1.5 shrink-0">
              <Badge>{bpRows.length}</Badge>
              {!bpFormOpen ? (
                <div ref={addBpWrapRef}>
                  <Button type="button" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setBpFormOpen(true)}>
                    Add new
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {bpFormOpen ? (
            <form onSubmit={addBloodPressure} className="mb-4 space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] p-4">
              <div className={fieldLabel}>
                When
                <DateTimePicker value={bpWhen} onChange={setBpWhen} />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <label className={fieldLabel}>
                  Systolic (top)
                  <Input className={fieldInput} inputMode="numeric" placeholder="e.g. 120" value={bpSys} onChange={(e) => setBpSys(e.target.value)} aria-describedby={bpErrors.systolic ? "bp-sys-err2" : undefined} />
                  {bpErrors.systolic && <p id="bp-sys-err2" className={errorMsg}>{bpErrors.systolic}</p>}
                </label>
                <label className={fieldLabel}>
                  Diastolic (bottom)
                  <Input className={fieldInput} inputMode="numeric" placeholder="e.g. 80" value={bpDia} onChange={(e) => setBpDia(e.target.value)} aria-describedby={bpErrors.diastolic ? "bp-dia-err2" : undefined} />
                  {bpErrors.diastolic && <p id="bp-dia-err2" className={errorMsg}>{bpErrors.diastolic}</p>}
                </label>
                <label className={fieldLabel}>
                  Pulse (optional)
                  <Input className={fieldInput} inputMode="numeric" placeholder="e.g. 72" value={bpPulse} onChange={(e) => setBpPulse(e.target.value)} />
                </label>
              </div>
              <div className="flex gap-2 pt-1">
                <Button type="submit" className="flex-1" disabled={bpSubmitting}>{bpSubmitting ? <Spinner /> : "Save reading"}</Button>
                <Button type="button" variant="ghost" onClick={() => { setBpFormOpen(false); setBpErrors({}); }}>Cancel</Button>
              </div>
            </form>
          ) : null}
          {bpRows.length > 0 ? (
            <>
              <div className="space-y-3">
                {(bpExpanded ? bpRows : bpRows.slice(0, LOG_INLINE)).map((r) => (
                  <div key={r.id} className="rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">{r.systolic}/{r.diastolic}{r.pulseBpm != null ? ` · pulse ${r.pulseBpm}` : ""}</p>
                        <p className="text-xs text-[var(--muted)] mt-1">{formatLocal(r.loggedAtISO)}</p>
                        {r.notes ? <p className="text-xs text-[var(--muted)] mt-2 line-clamp-3">{r.notes}</p> : null}
                      </div>
                      <button type="button" className="h-8 w-8 shrink-0 rounded-lg border border-[var(--border)] bg-[var(--panel)] text-[var(--fg)] grid place-items-center" onClick={() => deleteBp(r.id)} aria-label="Remove reading">
                        <span className="text-lg leading-none" aria-hidden>×</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              {bpRows.length > LOG_INLINE ? (
                <Button type="button" variant="ghost" className="mt-3 w-full" onClick={() => setBpExpanded((v) => !v)}>
                  {bpExpanded ? "Show fewer readings" : `View all ${bpRows.length} readings`}
                </Button>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-[var(--muted)]">No readings yet. Tap &ldquo;Add new&rdquo; to log your first.</p>
          )}
        </CardContent>
      </div>
    );
  }

  if (variant === "sideEffects") {
    return (
      <div id="health-logs-se" className="scroll-mt-24">
        <CardHeader>
          <div className="flex items-center justify-between gap-1.5">
            <div className="flex items-center gap-2 min-w-0">
              <Stethoscope className="h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden />
              <h3 className="text-sm font-semibold truncate">Side effects & symptoms</h3>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-1.5 shrink-0">
              <Badge>{seRows.length}</Badge>
              {!seFormOpen ? (
                <div ref={addSeWrapRef}>
                  <Button type="button" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setSeFormOpen(true)}>
                    Add new
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {seFormOpen ? (
            <form onSubmit={addSideEffect} className="mb-4 space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] p-4">
              <div className={fieldLabel}>
                When
                <DateTimePicker value={seWhen} onChange={setSeWhen} />
              </div>
              <label className={fieldLabel}>
                What you noticed
                <Input className={fieldInput} value={seText} onChange={(e) => setSeText(e.target.value)} aria-describedby={seErrors.description ? "se-desc-err2" : undefined} placeholder="e.g. felt dizzy after taking Metformin" />
                {seErrors.description && <p id="se-desc-err2" className={errorMsg}>{seErrors.description}</p>}
              </label>
              <label className={fieldLabel}>
                Related medicine (optional)
                <Input className={fieldInput} value={seRelated} onChange={(e) => setSeRelated(e.target.value)} placeholder="Medicine name" list="se-med-list2" />
                <datalist id="se-med-list2">{medOptions.map((m) => <option key={m} value={m} />)}</datalist>
              </label>
              <div className="flex gap-2 pt-1">
                <Button type="submit" className="flex-1" disabled={seSubmitting}>{seSubmitting ? <Spinner /> : "Save note"}</Button>
                <Button type="button" variant="ghost" onClick={() => { setSeFormOpen(false); setSeErrors({}); }}>Cancel</Button>
              </div>
            </form>
          ) : null}
          {seRows.length > 0 ? (
            <>
              <div className="space-y-3">
                {(seExpanded ? seRows : seRows.slice(0, LOG_INLINE)).map((r) => (
                  <div key={r.id} className="rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold leading-snug">{r.description}</p>
                        {r.relatedMedicationName ? <p className="text-xs text-[var(--muted)] mt-0.5">Related: {r.relatedMedicationName}</p> : null}
                        <div className="mt-1 flex items-center gap-2">
                          <p className="text-xs text-[var(--muted)]">{formatLocal(r.loggedAtISO)}</p>
                          {r.intensity && r.intensity !== "unspecified" ? (
                            <span className={["rounded-full px-2 py-0.5 text-[10px] font-medium", r.intensity === "mild" ? "bg-emerald-500/12 text-emerald-600" : r.intensity === "moderate" ? "bg-amber-500/12 text-amber-600" : "bg-rose-500/12 text-rose-600"].join(" ")}>{r.intensity}</span>
                          ) : null}
                        </div>
                      </div>
                      <button type="button" className="h-8 w-8 shrink-0 rounded-lg border border-[var(--border)] bg-[var(--panel)] text-[var(--fg)] grid place-items-center" onClick={() => deleteSe(r.id)} aria-label="Remove note">
                        <span className="text-lg leading-none" aria-hidden>×</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              {seRows.length > LOG_INLINE ? (
                <Button type="button" variant="ghost" className="mt-3 w-full" onClick={() => setSeExpanded((v) => !v)}>
                  {seExpanded ? "Show fewer notes" : `View all ${seRows.length} notes`}
                </Button>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-[var(--muted)]">No notes yet. Tap &ldquo;Add new&rdquo; to log a symptom.</p>
          )}
        </CardContent>
      </div>
    );
  }

  return (
    <section id="health-logs" className="scroll-mt-24 h-full overflow-y-auto">
      <div className="grid gap-4">
        {/* Blood pressure */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-1.5">
              <div className="flex items-center gap-2 min-w-0">
                <Droplets className="h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden />
                <h3 className="text-sm font-semibold truncate">Blood pressure readings</h3>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-1.5 shrink-0">
                <Badge>{bpRows.length}</Badge>
                {!bpFormOpen ? (
                  <div ref={addBpWrapRef}>
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      onClick={() => setBpFormOpen(true)}
                    >
                      Add new
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {bpFormOpen ? (
              <form
                onSubmit={addBloodPressure}
                className="mb-4 space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] p-4"
              >
                <div className={fieldLabel}>
                  When
                  <DateTimePicker value={bpWhen} onChange={setBpWhen} />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <label className={fieldLabel}>
                    Systolic (top)
                    <Input
                      className={fieldInput}
                      inputMode="numeric"
                      placeholder="e.g. 120"
                      value={bpSys}
                      onChange={(e) => setBpSys(e.target.value)}
                      aria-describedby={bpErrors.systolic ? "bp-sys-err" : undefined}
                    />
                    {bpErrors.systolic ? (
                      <p id="bp-sys-err" role="alert" className={errorMsg}>
                        {bpErrors.systolic}
                      </p>
                    ) : null}
                  </label>
                  <label className={fieldLabel}>
                    Diastolic (bottom)
                    <Input
                      className={fieldInput}
                      inputMode="numeric"
                      placeholder="e.g. 80"
                      value={bpDia}
                      onChange={(e) => setBpDia(e.target.value)}
                      aria-describedby={bpErrors.diastolic ? "bp-dia-err" : undefined}
                    />
                    {bpErrors.diastolic ? (
                      <p id="bp-dia-err" role="alert" className={errorMsg}>
                        {bpErrors.diastolic}
                      </p>
                    ) : null}
                  </label>
                  <label className={fieldLabel}>
                    Pulse (optional)
                    <Input
                      className={fieldInput}
                      inputMode="numeric"
                      placeholder="bpm"
                      value={bpPulse}
                      onChange={(e) => setBpPulse(e.target.value)}
                    />
                  </label>
                </div>
                <label className={fieldLabel}>
                  Notes (optional)
                  <Input
                    className={fieldInput}
                    value={bpNotes}
                    onChange={(e) => setBpNotes(e.target.value)}
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" className="h-9 gap-2" disabled={bpSubmitting}>
                    {bpSubmitting ? (
                      <>
                        <Spinner />
                        Saving…
                      </>
                    ) : (
                      <>
                        <Activity className="h-4 w-4" />
                        Save reading
                      </>
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-9 px-3"
                    onClick={() => {
                      setBpFormOpen(false);
                      setBpErrors({});
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            ) : null}
            {bpRows.length > 0 ? (
              <>
                <div className="space-y-3">
                  {(bpExpanded ? bpRows : bpRows.slice(0, LOG_INLINE)).map((r) => (
                    <div
                      key={r.id}
                      className="rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold">
                            {r.systolic}/{r.diastolic}
                            {r.pulseBpm != null ? ` · pulse ${r.pulseBpm}` : ""}
                          </p>
                          <p className="text-xs text-[var(--muted)] mt-1">
                            {formatLocal(r.loggedAtISO)}
                          </p>
                          {r.notes ? (
                            <p className="text-xs text-[var(--muted)] mt-2 line-clamp-3">
                              {r.notes}
                            </p>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          className="h-8 w-8 shrink-0 rounded-lg border border-[var(--border)] bg-[var(--panel)] text-[var(--fg)] grid place-items-center"
                          onClick={() => deleteBp(r.id)}
                          aria-label="Remove reading"
                        >
                          <span className="text-lg leading-none" aria-hidden>
                            ×
                          </span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                {bpRows.length > LOG_INLINE ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="mt-3 w-full"
                    onClick={() => setBpExpanded((v) => !v)}
                  >
                    {bpExpanded
                      ? "Show fewer readings"
                      : `View all ${bpRows.length} readings`}
                  </Button>
                ) : null}
              </>
            ) : null}
          </CardContent>
        </Card>

        {/* Side effects */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-1.5">
              <div className="flex items-center gap-2 min-w-0">
                <Stethoscope className="h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden />
                <h3 className="text-sm font-semibold truncate">Side effects & symptoms</h3>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-1.5 shrink-0">
                <Badge>{seRows.length}</Badge>
                {!seFormOpen ? (
                  <div ref={addSeWrapRef}>
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      onClick={() => setSeFormOpen(true)}
                    >
                      Add new
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {seFormOpen ? (
              <form
                onSubmit={addSideEffect}
                className="mb-4 space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] p-4"
              >
                <div className={fieldLabel}>
                  When
                  <DateTimePicker value={seWhen} onChange={setSeWhen} />
                </div>
                <label className={fieldLabel}>
                  What you noticed
                  <Input
                    className={fieldInput}
                    value={seText}
                    onChange={(e) => setSeText(e.target.value)}
                    aria-describedby={seErrors.description ? "se-desc-err" : undefined}
                  />
                  {seErrors.description ? (
                    <p id="se-desc-err" role="alert" className={errorMsg}>
                      {seErrors.description}
                    </p>
                  ) : null}
                </label>
                <label className={fieldLabel}>
                  Related medicine (optional)
                  <Input
                    className={fieldInput}
                    list="uma-dash-hl-med-se"
                    placeholder="Optional"
                    value={seRelated}
                    onChange={(e) => setSeRelated(e.target.value)}
                  />
                  <datalist id="uma-dash-hl-med-se">
                    {medOptions.map((n) => (
                      <option key={n} value={n} />
                    ))}
                  </datalist>
                </label>
                <label className={fieldLabel}>
                  How strong it felt
                  <select
                    className={`${fieldInput} uma-select w-full border border-[var(--border)] bg-[var(--panel)] px-3 py-2`}
                    value={seIntensity ?? "unspecified"}
                    onChange={(e) =>
                      setSeIntensity(e.target.value as SideEffectLogEntry["intensity"])
                    }
                  >
                    <option value="unspecified">Rather not say</option>
                    <option value="mild">Mild</option>
                    <option value="moderate">Moderate</option>
                    <option value="strong">Strong</option>
                  </select>
                </label>
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" className="h-9" disabled={seSubmitting}>
                    {seSubmitting ? (
                      <>
                        <Spinner />
                        &nbsp;Saving…
                      </>
                    ) : (
                      "Save note"
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-9 px-3"
                    onClick={() => {
                      setSeFormOpen(false);
                      setSeErrors({});
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            ) : null}
            {seRows.length > 0 ? (
              <>
                <div className="space-y-3">
                  {(seExpanded ? seRows : seRows.slice(0, LOG_INLINE)).map((r) => (
                    <div
                      key={r.id}
                      className="rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold line-clamp-3">{r.description}</p>
                          <p className="text-xs text-[var(--muted)] mt-1">
                            {formatLocal(r.loggedAtISO)}
                            {r.relatedMedicationName ? ` · ${r.relatedMedicationName}` : ""}
                            {r.intensity && r.intensity !== "unspecified"
                              ? ` · ${r.intensity}`
                              : ""}
                          </p>
                        </div>
                        <button
                          type="button"
                          className="h-8 w-8 shrink-0 rounded-lg border border-[var(--border)] bg-[var(--panel)] text-[var(--fg)] grid place-items-center"
                          onClick={() => deleteSe(r.id)}
                          aria-label="Remove note"
                        >
                          <span className="text-lg leading-none" aria-hidden>
                            ×
                          </span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                {seRows.length > LOG_INLINE ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="mt-3 w-full"
                    onClick={() => setSeExpanded((v) => !v)}
                  >
                    {seExpanded ? "Show fewer notes" : `View all ${seRows.length} notes`}
                  </Button>
                ) : null}
              </>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
