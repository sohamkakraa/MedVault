"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
// Phone feature disabled for now
// import { buildPhoneDialOptions } from "@/lib/phoneDialOptions";
import { Badge } from "@/components/ui/Badge";
import { clearLocalPatientStore, getHydrationSafeStore, getStore, saveStore } from "@/lib/store";
import { AppTopNav } from "@/components/nav/AppTopNav";
import { Droplets, Plus, LogOut, Ruler } from "lucide-react";

export default function ProfilePage() {
  const [store, setStore] = useState(() => getHydrationSafeStore());
  const [allergyInput, setAllergyInput] = useState("");
  const [conditionInput, setConditionInput] = useState("");
  const [trendOpen, setTrendOpen] = useState(false);
  const [flowDateInput, setFlowDateInput] = useState("");
  const doctorNameSuggestions = useMemo(() => {
    const seen = new Set<string>();
    const add = (s?: string) => {
      const t = s?.trim();
      if (t) seen.add(t);
    };
    for (const d of store.docs) {
      (d.doctors ?? []).forEach((x) => add(x));
      const p = d.provider?.trim();
      if (p && /^dr\.?\s/i.test(p)) add(p);
    }
    return Array.from(seen).sort((a, b) => a.localeCompare(b));
  }, [store.docs]);
  const sexOptions = ["Male", "Female", "Prefer not to say"];
  const trendOptions = [
    "HbA1c",
    "LDL",
    "HDL",
    "Triglycerides",
    "Glucose",
    "RBC",
    "WBC",
    "Hemoglobin",
    "Platelets",
    "Creatinine",
  ];

  useEffect(() => {
    queueMicrotask(() => setStore(getStore()));
    const onFocus = () => setStore(getStore());
    const onStoreUpdate = () => setStore(getStore());
    window.addEventListener("focus", onFocus);
    window.addEventListener("mv-store-update", onStoreUpdate as EventListener);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("mv-store-update", onStoreUpdate as EventListener);
    };
  }, []);

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, "");
    if (!hash) return;
    requestAnimationFrame(() => {
      document.getElementById(hash)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    clearLocalPatientStore();
    window.location.href = "/login";
  }

  function updateProfile(patch: Partial<typeof store.profile>) {
    const next = { ...store, profile: { ...store.profile, ...patch } };
    setStore(next);
    saveStore(next);
  }

  function updateBodyMetrics(patch: Partial<NonNullable<typeof store.profile.bodyMetrics>>) {
    updateProfile({
      bodyMetrics: { ...(store.profile.bodyMetrics ?? {}), ...patch },
    });
  }

  function updateMenstrualCycle(patch: Partial<NonNullable<typeof store.profile.menstrualCycle>>) {
    const cur = store.profile.menstrualCycle ?? { flowLogDates: [] };
    updateProfile({
      menstrualCycle: {
        ...cur,
        ...patch,
        flowLogDates: patch.flowLogDates ?? cur.flowLogDates ?? [],
      },
    });
  }

  function addFlowDay() {
    const d = flowDateInput.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
    const cur = store.profile.menstrualCycle?.flowLogDates ?? [];
    if (cur.includes(d)) return setFlowDateInput("");
    updateMenstrualCycle({ flowLogDates: [...cur, d].sort() });
    setFlowDateInput("");
  }

  function removeFlowDay(d: string) {
    const cur = store.profile.menstrualCycle?.flowLogDates ?? [];
    updateMenstrualCycle({ flowLogDates: cur.filter((x) => x !== d) });
  }

  function saveIdentity(first?: string, last?: string) {
    const firstTrimmed = (first ?? "").trim();
    const lastTrimmed = (last ?? "").trim();
    const full = [firstTrimmed, lastTrimmed].filter(Boolean).join(" ").trim();
    // Always persist strings (never undefined) so JSON/localStorage keeps keys and getStore() does not drop fields.
    updateProfile({
      firstName: firstTrimmed,
      lastName: lastTrimmed,
      name: full,
    });
  }

  function addAllergy() {
    const value = allergyInput.trim();
    if (!value) return;
    if (store.profile.allergies.includes(value)) return setAllergyInput("");
    updateProfile({ allergies: [...store.profile.allergies, value] });
    setAllergyInput("");
  }

  function addCondition() {
    const value = conditionInput.trim();
    if (!value) return;
    if (store.profile.conditions.includes(value)) return setConditionInput("");
    updateProfile({ conditions: [...store.profile.conditions, value] });
    setConditionInput("");
  }

  function removeAllergy(value: string) {
    updateProfile({ allergies: store.profile.allergies.filter((a) => a !== value) });
  }

  function removeCondition(value: string) {
    updateProfile({ conditions: store.profile.conditions.filter((c) => c !== value) });
  }

  function toggleTrend(name: string) {
    const current = new Set(store.profile.trends ?? []);
    if (current.has(name)) current.delete(name);
    else current.add(name);
    updateProfile({ trends: Array.from(current) });
  }

  return (
    <div className="min-h-screen pb-24">
      <AppTopNav
        rightSlot={
          <Button variant="ghost" className="gap-2" onClick={logout}>
            <LogOut className="h-4 w-4" /> Logout
          </Button>
        }
      />

      <main className="mx-auto max-w-5xl px-4 py-8 space-y-6">
        <div className="grid gap-4">
          <Card id="profile-patient-details" className="scroll-mt-24">
            <CardHeader>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-medium">Your details</h2>
                <Badge>{[store.profile.firstName, store.profile.lastName].filter(Boolean).join(" ") || store.profile.name}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-x-4 gap-y-5 md:grid-cols-2 md:items-start">
                <label className="flex min-w-0 flex-col gap-1.5 text-xs mv-muted">
                  <span className="leading-tight">First name(s)</span>
                  <Input
                    value={store.profile.firstName ?? ""}
                    onChange={(e) => saveIdentity(e.target.value, store.profile.lastName)}
                  />
                </label>
                <label className="flex min-w-0 flex-col gap-1.5 text-xs mv-muted">
                  <span className="leading-tight">Last name</span>
                  <Input
                    value={store.profile.lastName ?? ""}
                    onChange={(e) => saveIdentity(store.profile.firstName, e.target.value)}
                  />
                </label>
                <label className="flex min-w-0 flex-col gap-1.5 text-xs mv-muted">
                  <span className="leading-tight">Date of birth</span>
                  <Input
                    type="date"
                    value={store.profile.dob ?? ""}
                    onChange={(e) => updateProfile({ dob: e.target.value })}
                  />
                </label>
                <label className="flex min-w-0 flex-col gap-1.5 text-xs mv-muted">
                  <span className="leading-tight">Sex</span>
                  <Select
                    className="w-full rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] py-2 text-sm text-[var(--fg)]"
                    value={store.profile.sex ?? ""}
                    onChange={(e) => updateProfile({ sex: e.target.value || undefined })}
                  >
                    <option value="" disabled>
                      Select sex
                    </option>
                    {sexOptions.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </Select>
                </label>
                <label className="flex min-w-0 flex-col gap-1.5 text-xs mv-muted md:col-span-2">
                  <span className="leading-tight">Email</span>
                  <Input
                    type="email"
                    value={store.profile.email ?? ""}
                    onChange={(e) => updateProfile({ email: e.target.value })}
                  />
                </label>
                {/* Phone number — disabled for now, feature coming soon */}
                {/* <div className="text-xs mv-muted">
                  Mobile number
                  ...
                </div> */}
                <label className="flex min-w-0 flex-col gap-1.5 text-xs mv-muted md:col-span-2">
                  <span className="leading-tight">Regular doctor</span>
                  <Input
                    list={
                      doctorNameSuggestions.length > 0 ? "uma-regular-doctor-suggestions" : undefined
                    }
                    value={store.profile.primaryCareProvider ?? ""}
                    onChange={(e) =>
                      updateProfile({ primaryCareProvider: e.target.value.trim() || undefined })
                    }
                    placeholder={
                      doctorNameSuggestions.length > 0
                        ? "Type a name or pick from your files"
                        : "Your doctor's name (optional)"
                    }
                  />
                  {doctorNameSuggestions.length > 0 ? (
                    <datalist id="uma-regular-doctor-suggestions">
                      {doctorNameSuggestions.map((name) => (
                        <option key={name} value={name} />
                      ))}
                    </datalist>
                  ) : null}
                  <p className="text-[11px] leading-relaxed mv-muted">
                    No preset list—names you see here come from doctors found on your uploaded files.
                  </p>
                </label>
                <label className="flex min-w-0 flex-col gap-1.5 text-xs mv-muted md:col-span-2">
                  <span className="leading-tight">Next doctor visit</span>
                  <Input
                    type="date"
                    value={store.profile.nextVisitDate ?? ""}
                    onChange={(e) => updateProfile({ nextVisitDate: e.target.value || undefined })}
                  />
                </label>
                <div className="flex min-w-0 flex-col gap-2 text-xs mv-muted md:col-span-2">
                  <span className="leading-tight">Charts to show first</span>
                  <div className="relative">
                    <button
                      type="button"
                      className="w-full rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2.5 text-left text-sm text-[var(--fg)]"
                      onClick={() => setTrendOpen((v) => !v)}
                    >
                      {(store.profile.trends ?? []).length
                        ? `${(store.profile.trends ?? []).length} picked`
                        : "Pick charts"}
                    </button>
                    {trendOpen ? (
                      <div className="absolute z-20 mt-2 w-full rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-3 shadow-lg">
                        <div className="grid gap-2 sm:grid-cols-2">
                          {trendOptions.map((t) => (
                            <label key={t} className="flex items-center gap-2 text-sm text-[var(--fg)]">
                              <input
                                type="checkbox"
                                checked={(store.profile.trends ?? []).includes(t)}
                                onChange={() => toggleTrend(t)}
                              />
                              <span>{t}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
                <label className="flex min-w-0 flex-col gap-1.5 text-xs mv-muted md:col-span-2">
                  <span className="leading-tight">Private notes</span>
                  <Input
                    value={store.profile.notes ?? ""}
                    onChange={(e) => updateProfile({ notes: e.target.value })}
                    placeholder="Things to remember for visits, questions for your doctor, etc."
                  />
                </label>
              </div>
            </CardContent>
          </Card>

        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Ruler className="h-4 w-4 text-[var(--accent)]" />
                <h2 className="text-sm font-medium">Height and weight</h2>
              </div>
              <p className="text-xs mv-muted mt-1">
                Optional. Use centimetres and kilograms, or leave blank.
              </p>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-xs mv-muted">
                  Height (cm)
                  <Input
                    inputMode="decimal"
                    placeholder="e.g. 165"
                    value={store.profile.bodyMetrics?.heightCm ?? ""}
                    onChange={(e) => updateBodyMetrics({ heightCm: e.target.value || undefined })}
                  />
                </label>
                <label className="text-xs mv-muted">
                  Weight (kg)
                  <Input
                    inputMode="decimal"
                    placeholder="e.g. 62"
                    value={store.profile.bodyMetrics?.weightKg ?? ""}
                    onChange={(e) => updateBodyMetrics({ weightKg: e.target.value || undefined })}
                  />
                </label>
                <label className="text-xs mv-muted">
                  Waist (cm)
                  <Input
                    inputMode="decimal"
                    placeholder="Optional"
                    value={store.profile.bodyMetrics?.waistCm ?? ""}
                    onChange={(e) => updateBodyMetrics({ waistCm: e.target.value || undefined })}
                  />
                </label>
                <div className="text-xs mv-muted sm:col-span-2">
                  Blood pressure (mmHg)
                  <div className="mt-1 grid grid-cols-2 gap-2 max-w-xs">
                    <Input
                      inputMode="numeric"
                      placeholder="Systolic"
                      value={store.profile.bodyMetrics?.bloodPressureSys ?? ""}
                      onChange={(e) => updateBodyMetrics({ bloodPressureSys: e.target.value || undefined })}
                    />
                    <Input
                      inputMode="numeric"
                      placeholder="Diastolic"
                      value={store.profile.bodyMetrics?.bloodPressureDia ?? ""}
                      onChange={(e) => updateBodyMetrics({ bloodPressureDia: e.target.value || undefined })}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card id="profile-cycle-tracking" className="scroll-mt-24">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Droplets className="h-4 w-4 text-[var(--accent-2)]" />
                <h2 className="text-sm font-medium">Period tracking (early test)</h2>
              </div>
              <p className="text-xs mv-muted mt-1">
                Shown while we test it. Numbers are rough guesses, not medical advice. Your doctor can help with symptoms
                and timing.
              </p>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
              <label className="flex min-w-0 flex-col gap-1.5 text-xs mv-muted">
                <span className="leading-tight">Typical cycle length (days)</span>
                <Input
                  type="number"
                  min={21}
                  max={45}
                  className="max-w-[120px]"
                  value={store.profile.menstrualCycle?.typicalCycleLengthDays ?? 28}
                  onChange={(e) => {
                    const n = parseInt(e.target.value, 10);
                    if (!Number.isFinite(n)) return;
                    updateMenstrualCycle({ typicalCycleLengthDays: Math.min(45, Math.max(21, n)) });
                  }}
                />
              </label>
              <label className="flex min-w-0 flex-col gap-1.5 text-xs mv-muted">
                <span className="leading-tight">First day of last period</span>
                <Input
                  type="date"
                  className="max-w-[220px]"
                  value={store.profile.menstrualCycle?.lastPeriodStartISO ?? ""}
                  onChange={(e) =>
                    updateMenstrualCycle({ lastPeriodStartISO: e.target.value || undefined })
                  }
                />
              </label>
              <div className="flex min-w-0 flex-col gap-2 border-t border-[var(--border)] pt-5">
                <p className="text-xs font-medium text-[var(--fg)] leading-tight">Period flow days</p>
                <p className="text-[11px] leading-relaxed mv-muted">
                  Add a date when you had your period so your home screen can show it.
                </p>
                <div className="flex flex-wrap items-end gap-3">
                  <Input
                    type="date"
                    className="max-w-[220px]"
                    value={flowDateInput}
                    onChange={(e) => setFlowDateInput(e.target.value)}
                    aria-label="Date to log as a flow day"
                  />
                  <Button type="button" className="h-10 shrink-0 gap-2" onClick={addFlowDay}>
                    <Plus className="h-4 w-4" /> Log day
                  </Button>
                </div>
                <div className="flex min-h-[2.5rem] flex-wrap gap-2">
                  {(store.profile.menstrualCycle?.flowLogDates ?? [])
                    .slice()
                    .sort()
                    .reverse()
                    .map((d) => (
                      <button
                        key={d}
                        type="button"
                        className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--panel-2)] px-3 py-1.5 text-xs"
                        onClick={() => removeFlowDay(d)}
                      >
                        {d} <span className="text-[10px] mv-muted">remove</span>
                      </button>
                    ))}
                  {!store.profile.menstrualCycle?.flowLogDates?.length && (
                    <span className="self-center text-sm mv-muted py-1">No flow days added yet.</span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card id="profile-allergies" className="scroll-mt-24">
            <CardHeader>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-medium">Allergies</h2>
                <Badge>{store.profile.allergies.length}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {store.profile.allergies.map((a) => (
                  <button
                    key={a}
                    className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--panel-2)] px-3 py-1 text-xs"
                    onClick={() => removeAllergy(a)}
                  >
                    {a} <span className="text-[10px] mv-muted">remove</span>
                  </button>
                ))}
                {!store.profile.allergies.length && <p className="text-sm mv-muted">No allergies listed yet.</p>}
              </div>
              <div className="mt-4 flex gap-2">
                <Input
                  placeholder="Add allergy"
                  value={allergyInput}
                  onChange={(e) => setAllergyInput(e.target.value)}
                />
                <Button onClick={addAllergy} className="gap-2">
                  <Plus className="h-4 w-4" /> Add
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card id="profile-conditions" className="scroll-mt-24">
            <CardHeader>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-medium">Health issues</h2>
                <Badge>{store.profile.conditions.length}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {store.profile.conditions.map((c) => (
                  <button
                    key={c}
                    className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--panel-2)] px-3 py-1 text-xs"
                    onClick={() => removeCondition(c)}
                  >
                    {c} <span className="text-[10px] mv-muted">remove</span>
                  </button>
                ))}
                {!store.profile.conditions.length && <p className="text-sm mv-muted">No health issues listed yet.</p>}
              </div>
              <div className="mt-4 flex gap-2">
                <Input
                  placeholder="Add condition"
                  value={conditionInput}
                  onChange={(e) => setConditionInput(e.target.value)}
                />
                <Button onClick={addCondition} className="gap-2">
                  <Plus className="h-4 w-4" /> Add
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
