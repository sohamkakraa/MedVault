"use client";

import { useCallback, useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { DateTimePicker } from "@/components/ui/DateTimePicker";
import { defaultHealthLogs, newHealthLogId, normalizeHealthLogs } from "@/lib/healthLogs";
import type { BloodPressureLogEntry, PatientStore, SideEffectLogEntry } from "@/lib/types";
import { Activity, Droplets, Stethoscope } from "lucide-react";

function sortByLoggedAt<T extends { loggedAtISO: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => b.loggedAtISO.localeCompare(a.loggedAtISO));
}

function formatLocal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

const fieldLabel = "block text-xs text-[var(--muted)]";
const fieldInput = "mt-1 h-9 text-sm rounded-2xl";

export function DashboardHealthLogSection({
  store,
  onStoreChange,
}: {
  store: PatientStore;
  onStoreChange: (next: PatientStore) => void;
}) {
  const [bpSys, setBpSys] = useState("");
  const [bpDia, setBpDia] = useState("");
  const [bpPulse, setBpPulse] = useState("");
  const [bpNotes, setBpNotes] = useState("");
  const [bpWhen, setBpWhen] = useState(() => new Date().toISOString().slice(0, 16));

  const [seText, setSeText] = useState("");
  const [seRelated, setSeRelated] = useState("");
  const [seIntensity, setSeIntensity] = useState<SideEffectLogEntry["intensity"]>("unspecified");
  const [seWhen, setSeWhen] = useState(() => new Date().toISOString().slice(0, 16));
  const [bpFormOpen, setBpFormOpen] = useState(false);
  const [seFormOpen, setSeFormOpen] = useState(false);
  // Show the 3 most recent by default and reveal the rest on demand — keeps
  // the dashboard free of secondary vertical scrolls on mobile.
  const LOG_INLINE = 3;
  const [bpExpanded, setBpExpanded] = useState(false);
  const [seExpanded, setSeExpanded] = useState(false);

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
  const seRows = useMemo(() => sortByLoggedAt(store.healthLogs?.sideEffects ?? []), [store.healthLogs?.sideEffects]);

  const medOptions = useMemo(() => store.meds.map((m) => m.name).filter(Boolean), [store.meds]);

  function toIsoFromLocal(dtLocal: string): string {
    const d = new Date(dtLocal);
    if (Number.isNaN(d.getTime())) return new Date().toISOString();
    return d.toISOString();
  }

  function addBloodPressure(e: React.FormEvent) {
    e.preventDefault();
    const systolic = Number(bpSys);
    const diastolic = Number(bpDia);
    if (!Number.isFinite(systolic) || !Number.isFinite(diastolic) || systolic < 40 || diastolic < 20) return;
    const pulseBpm = bpPulse.trim() ? Number(bpPulse) : undefined;
    if (bpPulse.trim() && !Number.isFinite(pulseBpm)) return;

    const entry: BloodPressureLogEntry = {
      id: newHealthLogId(),
      loggedAtISO: toIsoFromLocal(bpWhen),
      systolic,
      diastolic,
      pulseBpm: Number.isFinite(pulseBpm!) ? pulseBpm : undefined,
      notes: bpNotes.trim() || undefined,
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
  }

  function addSideEffect(e: React.FormEvent) {
    e.preventDefault();
    const description = seText.trim();
    if (!description) return;
    const entry: SideEffectLogEntry = {
      id: newHealthLogId(),
      loggedAtISO: toIsoFromLocal(seWhen),
      description: description.slice(0, 4000),
      relatedMedicationName: seRelated.trim() || undefined,
      intensity: seIntensity,
    };
    const hl = normalizeHealthLogs(store.healthLogs ?? {});
    commit({
      ...store,
      healthLogs: { ...hl, sideEffects: [entry, ...hl.sideEffects] },
    });
    setSeText("");
    setSeRelated("");
    setSeFormOpen(false);
  }

  function deleteBp(id: string) {
    const hl = normalizeHealthLogs(store.healthLogs ?? {});
    commit({ ...store, healthLogs: { ...hl, bloodPressure: hl.bloodPressure.filter((x) => x.id !== id) } });
  }

  function deleteSe(id: string) {
    const hl = normalizeHealthLogs(store.healthLogs ?? {});
    commit({ ...store, healthLogs: { ...hl, sideEffects: hl.sideEffects.filter((x) => x.id !== id) } });
  }

  return (
    <section id="health-logs" className="scroll-mt-24">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Droplets className="h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden />
                <h3 className="text-sm font-semibold truncate">Blood pressure readings</h3>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
                <Badge>{bpRows.length}</Badge>
                {!bpFormOpen ? (
                  <Button type="button" variant="ghost" className="h-8 px-3" onClick={() => setBpFormOpen(true)}>
                    Add new
                  </Button>
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
                    <Input
                      className={fieldInput}
                      inputMode="numeric"
                      placeholder="e.g. 120"
                      value={bpSys}
                      onChange={(e) => setBpSys(e.target.value)}
                    />
                  </label>
                  <label className={fieldLabel}>
                    Diastolic (bottom)
                    <Input
                      className={fieldInput}
                      inputMode="numeric"
                      placeholder="e.g. 80"
                      value={bpDia}
                      onChange={(e) => setBpDia(e.target.value)}
                    />
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
                  <Input className={fieldInput} value={bpNotes} onChange={(e) => setBpNotes(e.target.value)} />
                </label>
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" className="h-9 gap-2">
                    <Activity className="h-4 w-4" />
                    Save reading
                  </Button>
                  <Button type="button" variant="ghost" className="h-9 px-3" onClick={() => setBpFormOpen(false)}>
                    Cancel
                  </Button>
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
                          <p className="text-sm font-semibold">
                            {r.systolic}/{r.diastolic}
                            {r.pulseBpm != null ? ` · pulse ${r.pulseBpm}` : ""}
                          </p>
                          <p className="text-xs text-[var(--muted)] mt-1">{formatLocal(r.loggedAtISO)}</p>
                          {r.notes ? <p className="text-xs text-[var(--muted)] mt-2 line-clamp-3">{r.notes}</p> : null}
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

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Stethoscope className="h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden />
                <h3 className="text-sm font-semibold truncate">Side effects & symptoms</h3>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
                <Badge>{seRows.length}</Badge>
                {!seFormOpen ? (
                  <Button type="button" variant="ghost" className="h-8 px-3" onClick={() => setSeFormOpen(true)}>
                    Add new
                  </Button>
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
                  <Input className={fieldInput} value={seText} onChange={(e) => setSeText(e.target.value)} />
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
                    onChange={(e) => setSeIntensity(e.target.value as SideEffectLogEntry["intensity"])}
                  >
                    <option value="unspecified">Rather not say</option>
                    <option value="mild">Mild</option>
                    <option value="moderate">Moderate</option>
                    <option value="strong">Strong</option>
                  </select>
                </label>
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" className="h-9">
                    Save note
                  </Button>
                  <Button type="button" variant="ghost" className="h-9 px-3" onClick={() => setSeFormOpen(false)}>
                    Cancel
                  </Button>
                </div>
              </form>
            ) : null}
            {seRows.length > 0 ? (
              <>
                <div className="space-y-3">
                  {(seExpanded ? seRows : seRows.slice(0, LOG_INLINE)).map((r) => (
                    <div key={r.id} className="rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold line-clamp-3">{r.description}</p>
                          <p className="text-xs text-[var(--muted)] mt-1">
                            {formatLocal(r.loggedAtISO)}
                            {r.relatedMedicationName ? ` · ${r.relatedMedicationName}` : ""}
                            {r.intensity && r.intensity !== "unspecified" ? ` · ${r.intensity}` : ""}
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
                    {seExpanded
                      ? "Show fewer notes"
                      : `View all ${seRows.length} notes`}
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
