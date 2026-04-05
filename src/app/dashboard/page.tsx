"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { getStore, saveStore, removeDoc } from "@/lib/store";
import { ExtractedLab, ExtractedMedication } from "@/lib/types";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Activity, Calendar, ClipboardList, FileText, FileUp, Pill, Plus, Sparkles, User, X, Zap } from "lucide-react";

function toChartPoints(labs: ExtractedLab[], metricName: string) {
  const filtered = labs
    .filter((l) => l.name.toLowerCase().includes(metricName.toLowerCase()))
    .map((l) => ({
      date: l.date ?? "",
      value: parseFloat(String(l.value).replace(/[^\d.]/g, "")) || null,
    }))
    .filter((p) => p.value !== null && p.date)
    .sort((a, b) => a.date.localeCompare(b.date));

  return filtered;
}

export default function DashboardPage() {
  const [store, setStore] = useState(() => getStore());
  const [mounted, setMounted] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [newMed, setNewMed] = useState<ExtractedMedication>({
    name: "",
    dose: "",
    frequency: "",
    route: "",
    startDate: "",
    endDate: "",
    notes: "",
  });

  useEffect(() => {
    // Refresh from localStorage in case another page updated it
    const onFocus = () => setStore(getStore());
    window.addEventListener("focus", onFocus);
    const onStorage = (e: StorageEvent) => {
      if (e.key === "mv_patient_store_v1") setStore(getStore());
    };
    const onCustom = () => setStore(getStore());
    window.addEventListener("storage", onStorage);
    window.addEventListener("mv-store-update", onCustom as EventListener);
    setMounted(true);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("mv-store-update", onCustom as EventListener);
    };
  }, []);

  useEffect(() => {
    const onAfterPrint = () => setPrinting(false);
    window.addEventListener("afterprint", onAfterPrint);
    return () => window.removeEventListener("afterprint", onAfterPrint);
  }, []);

  function updateStore(next: typeof store) {
    setStore(next);
    saveStore(next);
  }

  function updateMed(index: number, patch: Partial<ExtractedMedication>) {
    const next = {
      ...store,
      meds: store.meds.map((m, i) => (i === index ? { ...m, ...patch } : m)),
    };
    updateStore(next);
  }

  function removeMed(index: number) {
    const next = { ...store, meds: store.meds.filter((_, i) => i !== index) };
    updateStore(next);
  }

  function addMed() {
    if (!newMed.name?.trim()) return;
    const trimmed = {
      ...newMed,
      name: newMed.name.trim(),
      dose: newMed.dose?.trim() || undefined,
      frequency: newMed.frequency?.trim() || undefined,
      route: newMed.route?.trim() || undefined,
      startDate: newMed.startDate || undefined,
      endDate: newMed.endDate || undefined,
      notes: newMed.notes?.trim() || undefined,
    };
    const next = { ...store, meds: [trimmed, ...store.meds] };
    updateStore(next);
    setNewMed({ name: "", dose: "", frequency: "", route: "", startDate: "", endDate: "", notes: "" });
  }

  function exportPdf() {
    setPrinting(true);
    setTimeout(() => window.print(), 50);
  }

  function deleteDoc(docId: string) {
    if (!confirm("Delete this document? This action cannot be undone.")) return;
    const next = removeDoc(docId);
    setStore(next);
  }

  const hba1c = useMemo(() => toChartPoints(store.labs, "hba1c"), [store.labs]);
  const ldl = useMemo(() => toChartPoints(store.labs, "ldl"), [store.labs]);
  const trendMap: Record<string, ReturnType<typeof toChartPoints>> = {
    HbA1c: hba1c,
    LDL: ldl,
    HDL: toChartPoints(store.labs, "hdl"),
    Triglycerides: toChartPoints(store.labs, "triglycer"),
    Glucose: toChartPoints(store.labs, "glucose"),
    RBC: toChartPoints(store.labs, "rbc"),
    WBC: toChartPoints(store.labs, "wbc"),
    Hemoglobin: toChartPoints(store.labs, "hemoglobin"),
    Platelets: toChartPoints(store.labs, "platelet"),
    Creatinine: toChartPoints(store.labs, "creatinine"),
  };
  const selectedTrends = store.profile.trends ?? ["HbA1c", "LDL"];
  const recentLabs = useMemo(
    () =>
      store.labs
        .slice()
        .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
        .slice(0, 6),
    [store.labs]
  );

  if (!mounted) {
    return (
      <div className="min-h-screen pb-28">
        <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--panel)]/80 backdrop-blur no-print">
          <div className="mx-auto max-w-6xl px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-2xl bg-[var(--accent)] text-[var(--accent-contrast)] flex items-center justify-center font-semibold">
                MV
              </div>
              <div>
                <h1 className="text-lg font-semibold leading-tight">MedVault Dashboard</h1>
                <p className="text-xs mv-muted">Loading your workspace…</p>
              </div>
            </div>
          </div>
        </header>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-28">
      <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--panel)]/80 backdrop-blur no-print">
        <div className="mx-auto max-w-6xl px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-2xl bg-[var(--accent)] text-[var(--accent-contrast)] flex items-center justify-center font-semibold">
              MV
            </div>
            <div>
              <h1 className="text-lg font-semibold leading-tight">MedVault Dashboard</h1>
              <p className="text-xs mv-muted">Your medical story, organized for clarity.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/body">
              <Button variant="ghost" className="gap-2">
                <Zap className="h-4 w-4" /> Body View
              </Button>
            </Link>
            <Link href="/upload">
              <Button variant="ghost" className="gap-2">
                <FileUp className="h-4 w-4" /> Upload
              </Button>
            </Link>
            <Link href="/profile">
              <Button variant="ghost" className="gap-2">
                <User className="h-4 w-4" /> Profile
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 space-y-6 no-print">
        <section className="mv-card rounded-3xl p-6 mv-surface">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Sparkles className="h-4 w-4 text-[var(--accent)]" />
                Patient snapshot
              </div>
              <h2 className="text-3xl font-semibold mv-title">{store.profile.name}</h2>
              <p className="mv-muted max-w-xl">
                Review medications, lab trends, and provider notes in one place. Add manual updates anytime to keep
                everything accurate for your next visit.
              </p>
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge className="gap-1">
                  <Calendar className="h-3 w-3" />
                  DOB {store.profile.dob ?? "—"}
                </Badge>
                <Badge>Conditions: {store.profile.conditions.length}</Badge>
                <Badge>Allergies: {store.profile.allergies.length}</Badge>
                <Badge>Last updated {new Date(store.updatedAtISO).toLocaleDateString()}</Badge>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {store.profile.primaryCareProvider ? (
                <div className="mv-card-muted rounded-2xl p-4">
                  <p className="text-xs mv-muted">Primary care provider</p>
                  <p className="mt-2 text-lg font-semibold">{store.profile.primaryCareProvider}</p>
                  {store.profile.nextVisitDate ? (
                    <p className="text-xs mv-muted">Next visit: {store.profile.nextVisitDate}</p>
                  ) : null}
                </div>
              ) : null}
              <div className="mv-card-muted rounded-2xl p-4">
                <p className="text-xs mv-muted">Visit prep</p>
                <p className="mt-2 text-lg font-semibold">{store.meds.length} active meds</p>
                <p className="text-xs mv-muted">{store.docs.length} documents in timeline</p>
              </div>
            </div>
          </div>
        </section>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-[var(--accent-2)]" />
                  <span className="text-sm font-medium">Documents</span>
                </div>
                <Badge>{store.docs.length}</Badge>
              </div>
          </CardHeader>
          <CardContent>
              {store.docs.length === 0 ? (
                <p className="text-sm mv-muted">
                  Upload lab reports, prescriptions, imaging summaries, and bills. Key facts are extracted into a clean
                  timeline.
                </p>
              ) : (
                <div className="space-y-2">
                  {store.docs.slice(0, 5).map((d) => (
                    <Link
                      key={d.id}
                      href={`/docs/${d.id}`}
                      className="block w-full rounded-2xl border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-left text-xs transition hover:bg-[var(--panel-2)]"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{d.title}</span>
                        {d.dateISO ? <span className="mv-muted">{d.dateISO}</span> : null}
                      </div>
                      <div className="mv-muted mt-1">{d.type}</div>
                    </Link>
                  ))}
                </div>
              )}
          </CardContent>
        </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Pill className="h-4 w-4 text-[var(--accent)]" />
                  <span className="text-sm font-medium">Medications</span>
                </div>
                <Badge>{store.meds.length}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm mv-muted">
                Keep start/stop dates and adherence notes up to date so your doctor sees the full picture.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-[var(--accent-2)]" />
                  <span className="text-sm font-medium">Tracked Labs</span>
                </div>
                <Badge>{store.labs.length}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm mv-muted">
                Trends are charted automatically and recent values are highlighted for fast review.
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {selectedTrends.map((name, idx) => {
            const data = trendMap[name] ?? [];
            const accent = idx % 2 === 0 ? "var(--accent)" : "var(--accent-2)";
            return (
              <Card key={name} className="overflow-hidden">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-medium">{name} trend</h2>
                    <Badge>Lifetime</Badge>
                  </div>
                </CardHeader>
                <CardContent className="h-72">
                  {data.length === 0 ? (
                    <div className="h-full rounded-2xl border border-dashed border-[var(--border)] flex items-center justify-center text-sm mv-muted">
                      No {name} values found yet. Upload a lab report to populate this chart.
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={data}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis dataKey="date" stroke="var(--muted)" />
                        <YAxis stroke="var(--muted)" />
                        <Tooltip />
                        <Area dataKey="value" type="monotone" stroke={accent} fill={accent} fillOpacity={0.2} />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-medium">Medication manager</h2>
                <Badge>Manual edits enabled</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {store.meds.map((m, i) => (
                  <div key={`${m.name}-${i}`} className="rounded-2xl border border-[var(--border)] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">{m.name}</p>
                        <p className="text-xs mv-muted">
                          {m.dose ? `${m.dose} · ` : ""}{m.frequency ?? "frequency not set"}
                        </p>
                      </div>
                      <Button variant="ghost" className="px-2" onClick={() => removeMed(i)} aria-label="Remove medication">
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="mt-3 grid gap-3 md:grid-cols-3">
                      <label className="text-xs mv-muted">
                        Start date
                        <input
                          type="date"
                          className="mt-1 w-full rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-sm"
                          value={m.startDate ?? ""}
                          onChange={(e) => updateMed(i, { startDate: e.target.value || undefined })}
                        />
                      </label>
                      <label className="text-xs mv-muted">
                        Stop date
                        <input
                          type="date"
                          className="mt-1 w-full rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-sm"
                          value={m.endDate ?? ""}
                          onChange={(e) => updateMed(i, { endDate: e.target.value || undefined })}
                        />
                      </label>
                      <label className="text-xs mv-muted">
                        Adherence notes
                        <input
                          className="mt-1 w-full rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-sm"
                          value={m.notes ?? ""}
                          onChange={(e) => updateMed(i, { notes: e.target.value || undefined })}
                          placeholder="Missed ~2 doses last week"
                        />
                      </label>
                    </div>
                  </div>
                ))}

                <div className="rounded-2xl border border-dashed border-[var(--border)] p-4">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Plus className="h-4 w-4" />
                    Add medication manually
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                    <input
                      className="w-full rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-sm"
                      placeholder="Name"
                      value={newMed.name ?? ""}
                      onChange={(e) => setNewMed((m) => ({ ...m, name: e.target.value }))}
                    />
                    <input
                      className="w-full rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-sm"
                      placeholder="Dose"
                      value={newMed.dose ?? ""}
                      onChange={(e) => setNewMed((m) => ({ ...m, dose: e.target.value }))}
                    />
                    <input
                      className="w-full rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-sm"
                      placeholder="Frequency"
                      value={newMed.frequency ?? ""}
                      onChange={(e) => setNewMed((m) => ({ ...m, frequency: e.target.value }))}
                    />
                    <input
                      type="date"
                      className="w-full rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-sm"
                      value={newMed.startDate ?? ""}
                      onChange={(e) => setNewMed((m) => ({ ...m, startDate: e.target.value }))}
                    />
                    <input
                      type="date"
                      className="w-full rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-sm"
                      value={newMed.endDate ?? ""}
                      onChange={(e) => setNewMed((m) => ({ ...m, endDate: e.target.value }))}
                    />
                    <input
                      className="w-full rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-sm"
                      placeholder="Adherence notes"
                      value={newMed.notes ?? ""}
                      onChange={(e) => setNewMed((m) => ({ ...m, notes: e.target.value }))}
                    />
                  </div>
                  <div className="mt-3">
                    <Button onClick={addMed} className="gap-2">
                      <Plus className="h-4 w-4" /> Add medication
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-medium">Doctor visit summary</h2>
                <Badge>PDF export</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm mv-muted">
                Generate a concise snapshot with current meds, allergies, and recent labs. Export it as a PDF for your
                clinician.
              </p>
              <div className="mt-4 space-y-3">
                <Button onClick={exportPdf} className="w-full gap-2" disabled={printing}>
                  <ClipboardList className="h-4 w-4" />
                  {printing ? "Preparing PDF..." : "Export doctor visit summary"}
                </Button>
                <div className="text-xs mv-muted">
                  Tip: After the print dialog opens, choose “Save as PDF”.
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium">Recent extracted entries</h2>
              <Link href="/upload">
                <Button variant="ghost" className="gap-2">
                  <FileUp className="h-4 w-4" /> Add more
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {store.docs.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[var(--border)] p-6 text-sm mv-muted">
                Nothing yet. Upload your first document to populate your timeline and dashboard.
              </div>
            ) : (
              <div className="space-y-3">
                {store.docs.slice(0, 6).map((d) => (
                  <div key={d.id} className="rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <Badge>{d.type}</Badge>
                          {d.dateISO && <span className="text-xs mv-muted">{d.dateISO}</span>}
                        </div>
                        <p className="mt-2 font-medium">{d.title}</p>
                        <p className="mt-1 text-sm mv-muted">{d.summary}</p>
                      </div>
                      <div className="text-right text-xs mv-muted">
                        {d.provider ? <span>Provider: {d.provider}</span> : <span>&nbsp;</span>}
                        <div className="mt-2 flex justify-end">
                          <Button variant="ghost" className="px-2" onClick={() => deleteDoc(d.id)} aria-label="Delete document">
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>

                    {(d.medications?.length || d.labs?.length) ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {(d.medications ?? []).slice(0, 3).map((m, i) => (
                          <Badge key={i}>
                            Med: {m.name}{m.dose ? ` (${m.dose})` : ""}
                          </Badge>
                        ))}
                        {(d.labs ?? []).slice(0, 3).map((l, i) => (
                          <Badge key={i}>
                            Lab: {l.name} {l.value}{l.unit ? ` ${l.unit}` : ""}
                          </Badge>
                        ))}
                      </div>
                    ) : null}

                    {d.sections?.length ? (
                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        {d.sections.slice(0, 4).map((s, i) => (
                          <div key={`${s.title}-${i}`} className="rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-3">
                            <p className="text-xs font-semibold">{s.title}</p>
                            <ul className="mt-2 text-xs mv-muted list-disc pl-4">
                              {(s.items ?? []).slice(0, 4).map((item, idx) => (
                                <li key={`${s.title}-${idx}`}>{item}</li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="text-xs mv-muted">
          This tool is for organizing and recalling your records. It does not provide medical advice or diagnosis.
        </div>
      </main>

      <section className="print-only px-8 py-10">
        <h1 className="text-2xl font-semibold">Doctor Visit Summary</h1>
        <p className="mt-1">Prepared for: {store.profile.name}</p>
        <p className="text-sm mv-muted">Generated on {new Date().toLocaleDateString()}</p>

        <div className="mt-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Key details</h2>
            <p className="text-sm">
              DOB: {store.profile.dob ?? "—"} · Sex: {store.profile.sex ?? "—"} · Email: {store.profile.email ?? "—"}
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold">Allergies</h2>
            <p className="text-sm">{store.profile.allergies.join(", ") || "None reported"}</p>
          </div>

          <div>
            <h2 className="text-lg font-semibold">Conditions</h2>
            <p className="text-sm">{store.profile.conditions.join(", ") || "None reported"}</p>
          </div>

          <div>
            <h2 className="text-lg font-semibold">Current medications</h2>
            <ul className="text-sm list-disc pl-5">
              {store.meds.map((m, i) => (
                <li key={`${m.name}-${i}`}>
                  {m.name}
                  {m.dose ? `, ${m.dose}` : ""}
                  {m.frequency ? `, ${m.frequency}` : ""}
                  {m.startDate ? ` (Start: ${m.startDate})` : ""}
                  {m.endDate ? ` (Stop: ${m.endDate})` : ""}
                  {m.notes ? ` — Notes: ${m.notes}` : ""}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="text-lg font-semibold">Recent lab values</h2>
            <ul className="text-sm list-disc pl-5">
              {recentLabs.map((l, i) => (
                <li key={`${l.name}-${i}`}>
                  {l.name}: {l.value}
                  {l.unit ? ` ${l.unit}` : ""} {l.date ? `(${l.date})` : ""}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
