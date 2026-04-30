"use client";

/**
 * Tidy — beta data-hygiene action.
 *
 * One-click sweep that asks the agent to review the user's saved lists
 * (doctors, hospitals, document-derived names) and propose corrections:
 * mis-classified entries get moved between lists, junk entries flagged for
 * deletion, and doctor names mentioned in uploaded reports are surfaced for
 * adding to the dropdown.
 *
 * Beta: nothing is applied automatically. The user reviews each suggestion in
 * the modal and clicks "Apply" to commit. Commit goes through saveStore so
 * mv-store-update fans out to the dashboard, profile editor, and chat.
 */
import { useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { getStore, saveStore } from "@/lib/store";
import type { PatientStore } from "@/lib/types";

type Suggestions = {
  moveToHospitals: string[];
  moveToDoctors: string[];
  removeFromDoctors: string[];
  removeFromHospitals: string[];
  addDoctors: string[];
  notes: string;
};

const EMPTY: Suggestions = {
  moveToHospitals: [],
  moveToDoctors: [],
  removeFromDoctors: [],
  removeFromHospitals: [],
  addDoctors: [],
  notes: "",
};

export function TidyButton() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestions>(EMPTY);
  const [accepted, setAccepted] = useState<Record<string, boolean>>({});

  async function runTidy() {
    setLoading(true);
    setError(null);
    setSuggestions(EMPTY);
    setAccepted({});
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
          },
          docs: (store.docs ?? []).slice(0, 200).map((d) => ({
            id: d.id,
            provider: d.provider ?? null,
            doctors: d.doctors ?? [],
            facilityName: d.facilityName ?? null,
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
      const j = await res.json();
      const s = (j?.suggestions ?? EMPTY) as Suggestions;
      setSuggestions(s);
      // Default-accept all suggestions; user toggles off any they reject.
      const acc: Record<string, boolean> = {};
      [
        ...s.moveToHospitals.map((x) => `mh:${x}`),
        ...s.moveToDoctors.map((x) => `md:${x}`),
        ...s.removeFromDoctors.map((x) => `rd:${x}`),
        ...s.removeFromHospitals.map((x) => `rh:${x}`),
        ...s.addDoctors.map((x) => `ad:${x}`),
      ].forEach((k) => (acc[k] = true));
      setAccepted(acc);
      setOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Tidy failed.");
      setOpen(true);
    } finally {
      setLoading(false);
    }
  }

  function applyAccepted() {
    const store = getStore();
    const profile: PatientStore["profile"] = { ...store.profile };
    const doctors = new Set(profile.doctorQuickPick ?? []);
    const hospitals = new Set(profile.facilityQuickPick ?? []);
    // CRITICAL: the dropdown is computed by mergeDoctorQuickPick / mergeFacilityQuickPick,
    // which UNION the manual quick-pick lists with names extracted from every uploaded
    // document (doc.doctors[], doc.provider, doc.facilityName). Just removing a name
    // from `doctorQuickPick` is not enough — the same name will be re-injected from
    // the docs path on the next render. Adding to the *QuickPickHidden suppression
    // list is what the merge helpers actually respect, so we do both.
    const doctorsHidden = new Set(profile.doctorQuickPickHidden ?? []);
    const hospitalsHidden = new Set(profile.facilityQuickPickHidden ?? []);

    for (const name of suggestions.moveToHospitals) {
      if (!accepted[`mh:${name}`]) continue;
      doctors.delete(name);
      hospitals.add(name);
      // Suppress this name from the doctors dropdown even if a document
      // mentions it as a "doctor"; un-hide it from the facility list in case
      // it was previously suppressed there.
      doctorsHidden.add(name);
      hospitalsHidden.delete(name);
    }
    for (const name of suggestions.moveToDoctors) {
      if (!accepted[`md:${name}`]) continue;
      hospitals.delete(name);
      doctors.add(name);
      hospitalsHidden.add(name);
      doctorsHidden.delete(name);
    }
    for (const name of suggestions.removeFromDoctors) {
      if (!accepted[`rd:${name}`]) continue;
      doctors.delete(name);
      doctorsHidden.add(name);
    }
    for (const name of suggestions.removeFromHospitals) {
      if (!accepted[`rh:${name}`]) continue;
      hospitals.delete(name);
      hospitalsHidden.add(name);
    }
    for (const name of suggestions.addDoctors) {
      if (!accepted[`ad:${name}`]) continue;
      doctors.add(name);
      // Adding explicitly means the user wants this name visible — make sure
      // a stale hidden flag from an earlier session doesn't override it.
      doctorsHidden.delete(name);
    }

    profile.doctorQuickPick = Array.from(doctors).filter(Boolean);
    profile.facilityQuickPick = Array.from(hospitals).filter(Boolean);
    profile.doctorQuickPickHidden = Array.from(doctorsHidden).filter(Boolean);
    profile.facilityQuickPickHidden = Array.from(hospitalsHidden).filter(Boolean);
    saveStore({ ...store, profile });
    setOpen(false);
  }

  const hasAny =
    suggestions.moveToHospitals.length +
      suggestions.moveToDoctors.length +
      suggestions.removeFromDoctors.length +
      suggestions.removeFromHospitals.length +
      suggestions.addDoctors.length >
    0;

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

      {open ? (
        // Sheet pattern: the OUTER scrolls vertically and the INNER panel is
        // content-height. Previously the inner panel had max-h-[90vh] +
        // overflow-y-auto with `items-end` on mobile, which on phones taller
        // than the panel anchored it to the bottom and pushed the header off
        // the top of the viewport. Using `min-h-full` + outer scroll keeps
        // the close button reachable on every screen size.
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40">
          <div className="flex min-h-full items-center justify-center p-3 sm:p-6">
            <div className="w-full max-w-2xl rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-[var(--fg)]">Tidy your lists</h2>
                <p className="mt-1 text-sm mv-muted">
                  UMA reviewed your saved doctors and hospitals. Toggle off anything you disagree with, then apply.
                  This is a beta feature — nothing changes until you click Apply.
                </p>
              </div>
              <Button type="button" variant="ghost" className="h-8 px-2" onClick={() => setOpen(false)}>
                Close
              </Button>
            </div>

            {error ? (
              <p className="mt-4 rounded-xl border border-red-500/40 bg-red-500/8 p-3 text-sm text-red-400">
                {error}
              </p>
            ) : null}

            {!error && suggestions.notes ? (
              <p className="mt-4 text-xs mv-muted">{suggestions.notes}</p>
            ) : null}

            {!error && !hasAny ? (
              <p className="mt-6 text-sm mv-muted">Nothing to clean up — your lists look good.</p>
            ) : null}

            {!error && hasAny ? (
              <div className="mt-4 space-y-4">
                <SuggestionGroup
                  title="Move from doctors → hospitals"
                  items={suggestions.moveToHospitals}
                  prefix="mh"
                  accepted={accepted}
                  setAccepted={setAccepted}
                />
                <SuggestionGroup
                  title="Move from hospitals → doctors"
                  items={suggestions.moveToDoctors}
                  prefix="md"
                  accepted={accepted}
                  setAccepted={setAccepted}
                />
                <SuggestionGroup
                  title="Add doctors mentioned in your reports"
                  items={suggestions.addDoctors}
                  prefix="ad"
                  accepted={accepted}
                  setAccepted={setAccepted}
                />
                <SuggestionGroup
                  title="Remove from doctors"
                  items={suggestions.removeFromDoctors}
                  prefix="rd"
                  accepted={accepted}
                  setAccepted={setAccepted}
                />
                <SuggestionGroup
                  title="Remove from hospitals"
                  items={suggestions.removeFromHospitals}
                  prefix="rh"
                  accepted={accepted}
                  setAccepted={setAccepted}
                />
              </div>
            ) : null}

            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              {hasAny ? (
                <Button type="button" onClick={applyAccepted}>
                  Apply selected
                </Button>
              ) : null}
            </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function SuggestionGroup({
  title,
  items,
  prefix,
  accepted,
  setAccepted,
}: {
  title: string;
  items: string[];
  prefix: string;
  accepted: Record<string, boolean>;
  setAccepted: (next: Record<string, boolean>) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider mv-muted">{title}</h3>
      <ul className="space-y-1">
        {items.map((item) => {
          const k = `${prefix}:${item}`;
          const checked = accepted[k] !== false;
          return (
            <li key={k} className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={checked}
                onChange={(e) => setAccepted({ ...accepted, [k]: e.target.checked })}
              />
              <span className="text-sm text-[var(--fg)]">{item}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
