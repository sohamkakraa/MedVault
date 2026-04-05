"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { getHydrationSafeStore, getStore, saveStore } from "@/lib/store";
import { AppTopNav } from "@/components/nav/AppTopNav";
import { addTrackerLabData, TRACKERS } from "@/lib/trackers";
import { Plus, LogOut, Plug, Unplug } from "lucide-react";

export default function ProfilePage() {
  const [store, setStore] = useState(() => getHydrationSafeStore());
  const [allergyInput, setAllergyInput] = useState("");
  const [conditionInput, setConditionInput] = useState("");
  const [trendOpen, setTrendOpen] = useState(false);
  const providers = ["Dr. A. Kumar", "Dr. Avery Torres", "Dr. Melina Shah", "Dr. Daniel Kim", "Dr. Priya Iyer"];
  const countryCodes = ["+1", "+44", "+61", "+65", "+91", "+971"];
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
    setStore(getStore());
    const onFocus = () => setStore(getStore());
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  function updateProfile(patch: Partial<typeof store.profile>) {
    const next = { ...store, profile: { ...store.profile, ...patch } };
    setStore(next);
    saveStore(next);
  }

  function saveIdentity(first?: string, last?: string) {
    const firstTrimmed = (first ?? "").trim();
    const lastTrimmed = (last ?? "").trim();
    const full = [firstTrimmed, lastTrimmed].filter(Boolean).join(" ").trim();
    updateProfile({
      firstName: firstTrimmed || undefined,
      lastName: lastTrimmed || undefined,
      name: full || store.profile.name,
    });
  }

  function connectTracker(name: string) {
    const connected = new Set(store.preferences.connectedTrackers ?? []);
    connected.add(name);
    const next = {
      ...store,
      labs: addTrackerLabData(store.labs),
      preferences: {
        ...store.preferences,
        connectedTrackers: Array.from(connected),
      },
    };
    setStore(next);
    saveStore(next);
  }

  function disconnectTracker(name: string) {
    const connected = new Set(store.preferences.connectedTrackers ?? []);
    connected.delete(name);
    const next = {
      ...store,
      preferences: {
        ...store.preferences,
        connectedTrackers: Array.from(connected),
      },
    };
    setStore(next);
    saveStore(next);
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
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-medium">Patient details</h2>
                <Badge>{[store.profile.firstName, store.profile.lastName].filter(Boolean).join(" ") || store.profile.name}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="text-xs mv-muted">
                  First name(s)
                  <Input
                    value={store.profile.firstName ?? ""}
                    onChange={(e) => saveIdentity(e.target.value, store.profile.lastName)}
                  />
                </label>
                <label className="text-xs mv-muted">
                  Last name
                  <Input
                    value={store.profile.lastName ?? ""}
                    onChange={(e) => saveIdentity(store.profile.firstName, e.target.value)}
                  />
                </label>
                <label className="text-xs mv-muted">
                  Date of birth
                  <Input
                    type="date"
                    value={store.profile.dob ?? ""}
                    onChange={(e) => updateProfile({ dob: e.target.value })}
                  />
                </label>
                <label className="text-xs mv-muted">
                  Sex
                  <select
                    className="mt-1 w-full rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-sm text-[var(--fg)]"
                    value={store.profile.sex ?? ""}
                    onChange={(e) => updateProfile({ sex: e.target.value || undefined })}
                  >
                    <option value="">Select</option>
                    {sexOptions.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs mv-muted">
                  Email
                  <Input
                    type="email"
                    value={store.profile.email ?? ""}
                    onChange={(e) => updateProfile({ email: e.target.value })}
                  />
                </label>
                <div className="text-xs mv-muted">
                  Phone
                  <div className="mt-1 grid grid-cols-[110px_1fr] gap-2">
                    <select
                      className="rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-sm text-[var(--fg)]"
                      value={store.profile.countryCode ?? "+1"}
                      onChange={(e) => updateProfile({ countryCode: e.target.value })}
                    >
                      {countryCodes.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                    <Input
                      value={store.profile.phone ?? ""}
                      onChange={(e) => updateProfile({ phone: e.target.value })}
                      placeholder="Phone number"
                    />
                  </div>
                </div>
                <label className="text-xs mv-muted md:col-span-2">
                  Primary care provider
                  <select
                    className="mt-1 w-full rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-sm text-[var(--fg)]"
                    value={store.profile.primaryCareProvider ?? ""}
                    onChange={(e) =>
                      updateProfile({ primaryCareProvider: e.target.value ? e.target.value : undefined })
                    }
                  >
                    <option value="">None</option>
                    {providers.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs mv-muted">
                  Next visit date
                  <Input
                    type="date"
                    value={store.profile.nextVisitDate ?? ""}
                    onChange={(e) => updateProfile({ nextVisitDate: e.target.value || undefined })}
                  />
                </label>
                <div className="text-xs mv-muted md:col-span-2">
                  Trends to show
                  <div className="relative mt-2">
                    <button
                      type="button"
                      className="w-full rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-left text-sm"
                      onClick={() => setTrendOpen((v) => !v)}
                    >
                      {(store.profile.trends ?? []).length
                        ? `${(store.profile.trends ?? []).length} selected`
                        : "Select trends"}
                    </button>
                    {trendOpen ? (
                      <div className="absolute z-20 mt-2 w-full rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-3 shadow-lg">
                        <div className="grid gap-2 sm:grid-cols-2">
                          {trendOptions.map((t) => (
                            <label key={t} className="flex items-center gap-2 text-sm">
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
                <label className="text-xs mv-muted md:col-span-2">
                  Care notes
                  <Input
                    value={store.profile.notes ?? ""}
                    onChange={(e) => updateProfile({ notes: e.target.value })}
                    placeholder="Appointment preferences, reminders, etc."
                  />
                </label>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="text-sm font-medium">Preferences</h2>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="mv-card-muted rounded-2xl p-4">
                  <p className="text-xs mv-muted">Theme</p>
                  <p className="mt-1 text-sm">Switch between light and dark mode.</p>
                  <div className="mt-3">
                    <ThemeToggle />
                  </div>
                </div>
                <div className="text-xs mv-muted">
                  Your theme preference is saved locally on this device.
                </div>
                <div className="mv-card-muted rounded-2xl p-4">
                  <p className="text-xs mv-muted">Health trackers</p>
                  <p className="mt-1 text-sm">Connect trackers to sync required metrics to dashboard.</p>
                  <div className="mt-3 space-y-2">
                    {TRACKERS.map((t) => {
                      const connected = (store.preferences.connectedTrackers ?? []).includes(t);
                      return (
                        <div key={t} className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-2 flex items-center justify-between gap-2">
                          <span className="text-sm">{t}</span>
                          {connected ? (
                            <Button variant="ghost" className="h-8 gap-2" onClick={() => disconnectTracker(t)}>
                              <Unplug className="h-4 w-4" /> Disconnect
                            </Button>
                          ) : (
                            <Button className="h-8 gap-2" onClick={() => connectTracker(t)}>
                              <Plug className="h-4 w-4" /> Connect
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
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
                {!store.profile.allergies.length && <p className="text-sm mv-muted">No allergies on record.</p>}
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

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-medium">Conditions</h2>
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
                {!store.profile.conditions.length && <p className="text-sm mv-muted">No conditions on record.</p>}
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
