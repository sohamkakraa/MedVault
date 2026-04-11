"use client";
import {
  PatientStore,
  ExtractedDoc,
  ExtractedLab,
  ExtractedMedication,
  StandardLexiconEntry,
  UMA_TRACKER_LAB_SOURCE,
} from "@/lib/types";
import { normalizeLabUnitString } from "@/lib/labUnits";
import { enrichDocFromMarkdown } from "@/lib/parseMarkdownArtifact";
import { mergeLexiconPatches, resolveCanonicalLabName } from "@/lib/standardized";
import { patientStoreForApiPayload } from "@/lib/patientStoreApi";
import { applyEffectiveThemeToDocument, resolveThemePreference } from "@/lib/themePreference";

const KEY = "mv_patient_store_v1";
const ACCOUNT_INIT = "mv_account_initialized_v1";

let skipNextRemotePush = false;
let pushDebounce: ReturnType<typeof setTimeout> | null = null;
const PUSH_DEBOUNCE_MS = 900;

export function clearLocalPatientStore() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEY);
  localStorage.removeItem(ACCOUNT_INIT);
}

export async function pushPatientStoreToServer(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const store = getStore();
  const body = patientStoreForApiPayload(store);
  body.updatedAtISO = new Date().toISOString();
  try {
    const r = await fetch("/api/patient-store", {
      method: "PUT",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ store: body }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

function scheduleRemotePush() {
  if (typeof window === "undefined" || skipNextRemotePush) return;
  if (pushDebounce) clearTimeout(pushDebounce);
  pushDebounce = setTimeout(() => {
    pushDebounce = null;
    void pushPatientStoreToServer();
  }, PUSH_DEBOUNCE_MS);
}

/**
 * Pull server copy after login or on app load; push local data if the server row is empty.
 * Server wins when its updatedAtISO is newer or local has no meaningful data.
 */
export async function syncPatientStoreWithServer(): Promise<void> {
  if (typeof window === "undefined") return;
  let r: Response;
  try {
    r = await fetch("/api/patient-store", { credentials: "same-origin" });
  } catch {
    return;
  }
  if (r.status === 401) return;
  if (!r.ok) return;

  const j = (await r.json()) as { ok?: boolean; store?: PatientStore | null };
  if (!j.ok) return;

  const local = getStore();
  const localHasData =
    (local.docs?.length ?? 0) > 0 ||
    Boolean((local.profile?.name ?? "").trim()) ||
    (local.meds?.length ?? 0) > 0 ||
    (local.labs?.length ?? 0) > 0;

  if (j.store) {
    const server = j.store;
    const serverT = new Date(server.updatedAtISO).getTime();
    const localT = new Date(local.updatedAtISO).getTime();
    const serverEmpty =
      !(server.docs?.length ?? 0) && !(server.profile?.name ?? "").trim() && !(server.meds?.length ?? 0);

    if (serverEmpty && localHasData) {
      await pushPatientStoreToServer();
      return;
    }
    if (serverT >= localT || !localHasData) {
      const theme =
        localHasData
          ? (local.preferences?.theme ?? server.preferences?.theme ?? "system")
          : (server.preferences?.theme ?? local.preferences?.theme ?? "system");
      const merged: PatientStore = {
        ...server,
        preferences: {
          ...(local.preferences ?? {}),
          ...(server.preferences ?? {}),
          onboarding: {
            ...local.preferences?.onboarding,
            ...server.preferences?.onboarding,
          },
          theme,
        },
      };
      skipNextRemotePush = true;
      try {
        localStorage.setItem(KEY, JSON.stringify(merged));
        applyEffectiveThemeToDocument(resolveThemePreference(merged.preferences.theme));
        window.dispatchEvent(new CustomEvent("mv-store-update", { detail: merged }));
      } finally {
        skipNextRemotePush = false;
      }
    } else {
      await pushPatientStoreToServer();
    }
  } else if (localHasData) {
    await pushPatientStoreToServer();
  }
}

function profilePatchFromSession(session: { email?: string | null; phoneE164?: string | null }) {
  const patch: Partial<PatientStore["profile"]> = {};
  if (session.email) patch.email = session.email;
  if (session.phoneE164) {
    const m = session.phoneE164.match(/^(\+\d{1,4})(\d+)$/);
    if (m) {
      patch.countryCode = m[1];
      patch.phone = m[2];
    }
  }
  return patch;
}

export function createBlankPatientStore(
  partialProfile?: Partial<PatientStore["profile"]>,
): PatientStore {
  return {
    docs: [],
    meds: [],
    labs: [],
    profile: {
      name: "",
      firstName: "",
      lastName: "",
      allergies: [],
      conditions: [],
      trends: [],
      countryCode: partialProfile?.countryCode ?? "",
      ...partialProfile,
    },
    preferences: {
      theme: "system",
      onboarding: { lastStepReached: 1 as const },
    },
    standardLexicon: [],
    updatedAtISO: new Date().toISOString(),
  };
}

/** After OTP verification: seed a blank local record for brand-new devices, or merge session into an existing store. */
export function afterOtpSignIn(session: { email?: string | null; phoneE164?: string | null }) {
  if (typeof window === "undefined") return;
  const hasStore = localStorage.getItem(KEY) !== null;
  const inited = localStorage.getItem(ACCOUNT_INIT);
  const sessionPatch = profilePatchFromSession(session);

  if (!inited) {
    if (hasStore) {
      localStorage.setItem(ACCOUNT_INIT, "1");
      const s = getStore();
      const merged = { ...s, profile: { ...s.profile, ...sessionPatch } };
      if ((merged.docs?.length ?? 0) > 0 && !merged.preferences.onboarding?.completedAtISO) {
        merged.preferences = {
          ...merged.preferences,
          onboarding: {
            ...merged.preferences.onboarding,
            completedAtISO: merged.updatedAtISO ?? new Date().toISOString(),
          },
        };
      }
      saveStore(merged);
    } else {
      const blank = createBlankPatientStore(sessionPatch);
      saveStore(blank);
      localStorage.setItem(ACCOUNT_INIT, "1");
    }
    return;
  }

  const s = getStore();
  saveStore({ ...s, profile: { ...s.profile, ...sessionPatch } });
}

const seedStore: PatientStore = {
  docs: [
    {
      id: "doc-1",
      type: "Lab report",
      title: "Comprehensive Metabolic Panel",
      dateISO: "2025-11-12",
      provider: "Lakeside Diagnostics",
      summary: "Normal electrolytes, mildly elevated fasting glucose, LDL flagged high.",
      labs: [
        { name: "HbA1c", value: "6.1", unit: "%", date: "2025-11-12" },
        { name: "LDL Cholesterol", value: "138", unit: "mg/dL", date: "2025-11-12" },
        { name: "HDL Cholesterol", value: "52", unit: "mg/dL", date: "2025-11-12" },
        { name: "Glucose (fasting)", value: "108", unit: "mg/dL", date: "2025-11-12" },
      ],
      tags: ["annual", "metabolic"],
    },
    {
      id: "doc-2",
      type: "Prescription",
      title: "Primary Care Follow-up",
      dateISO: "2025-12-03",
      provider: "Dr. A. Kumar",
      summary: "Continued statin therapy, started metformin for prediabetes.",
      medications: [
        { name: "Atorvastatin", dose: "20 mg", frequency: "nightly", startDate: "2023-02-01" },
        { name: "Metformin", dose: "500 mg", frequency: "BID", startDate: "2025-12-03" },
      ],
      tags: ["primary care"],
    },
    {
      id: "doc-3",
      type: "Imaging",
      title: "Chest X-ray Summary",
      dateISO: "2025-10-02",
      provider: "Northview Imaging",
      summary: "No acute cardiopulmonary disease. Mild thoracic scoliosis noted.",
      tags: ["imaging"],
    },
  ],
  meds: [
    {
      name: "Atorvastatin",
      dose: "20 mg",
      frequency: "nightly",
      startDate: "2023-02-01",
      notes: "Occasional missed doses on weekends.",
    },
    {
      name: "Metformin",
      dose: "500 mg",
      frequency: "BID",
      startDate: "2025-12-03",
      notes: "Take with meals to reduce GI upset.",
    },
    {
      name: "Vitamin D3",
      dose: "1000 IU",
      frequency: "daily",
      startDate: "2024-06-15",
    },
  ],
  labs: [
    { name: "HbA1c", value: "6.1", unit: "%", date: "2025-11-12" },
    { name: "LDL Cholesterol", value: "138", unit: "mg/dL", date: "2025-11-12" },
    { name: "HDL Cholesterol", value: "52", unit: "mg/dL", date: "2025-11-12" },
    { name: "Glucose (fasting)", value: "108", unit: "mg/dL", date: "2025-11-12" },
    { name: "HbA1c", value: "5.9", unit: "%", date: "2025-07-08" },
    { name: "LDL Cholesterol", value: "128", unit: "mg/dL", date: "2025-07-08" },
  ],
  profile: {
    name: "Soham Kakra",
    firstName: "Soham",
    lastName: "Kakra",
    dob: "1989-04-19",
    email: "jordan.lee@uma.local",
    countryCode: "",
    phone: "",
    primaryCareProvider: "Dr. A. Kumar",
    nextVisitDate: "2026-02-18",
    trends: ["HbA1c", "LDL", "RBC"],
    allergies: ["Penicillin", "Peanuts"],
    conditions: ["Prediabetes", "Hyperlipidemia"],
    notes: "Exercises 3x/week. Prefers evening appointments.",
    bodyMetrics: {
      heightCm: "165",
      weightKg: "62",
    },
    menstrualCycle: {
      typicalCycleLengthDays: 28,
      lastPeriodStartISO: "2026-04-01",
      flowLogDates: ["2026-04-01", "2026-04-02"],
    },
  },
  preferences: {
    theme: "system",
  },
  standardLexicon: [],
  updatedAtISO: new Date().toISOString(),
};

function cloneSeed(): PatientStore {
  return JSON.parse(JSON.stringify(seedStore)) as PatientStore;
}

function labDedupeKey(l: ExtractedLab): string {
  return `${l.name.toLowerCase()}|${l.date ?? ""}|${l.value}|${l.unit ?? ""}`;
}

/**
 * Rebuilds `store.labs` and `store.meds` from remaining documents (plus tracker labs and manually added meds).
 * Call after removing a document or when fixing drift.
 */
export function rebuildLabsAndMedsFromDocuments(store: PatientStore) {
  const lex = store.standardLexicon ?? [];

  function normalizeLabRow(l: ExtractedLab): ExtractedLab {
    const name = resolveCanonicalLabName(l.name, lex);
        const nu = l.unit ? normalizeLabUnitString(l.unit) : "";
    return { ...l, name, unit: nu || l.unit?.trim() || undefined };
  }

  const seen = new Set<string>();
  const labsOut: ExtractedLab[] = [];

  for (const doc of store.docs) {
    const enriched = enrichDocFromMarkdown(doc, lex);
    for (const raw of enriched.labs ?? []) {
      const n = normalizeLabRow(raw);
      const k = labDedupeKey(n);
      if (seen.has(k)) continue;
      seen.add(k);
      labsOut.push({ ...n, sourceDocId: doc.id });
    }
  }

  const trackerLabs = store.labs.filter((l) => l.sourceDocId === UMA_TRACKER_LAB_SOURCE);
  for (const raw of trackerLabs) {
    const n = normalizeLabRow(raw);
    const k = labDedupeKey(n);
    if (seen.has(k)) continue;
    seen.add(k);
    labsOut.push({ ...n, sourceDocId: UMA_TRACKER_LAB_SOURCE });
  }

  store.labs = labsOut.slice(0, 2000);

  const medMap = new Map<string, ExtractedMedication>();
  for (const doc of store.docs) {
    const enriched = enrichDocFromMarkdown(doc, lex);
    for (const m of enriched.medications ?? []) {
      const k = m.name.toLowerCase();
      if (!medMap.has(k)) medMap.set(k, { ...m, sourceDocId: doc.id });
    }
  }

  for (const m of store.meds) {
    if (!m.sourceDocId) {
      const k = m.name.toLowerCase();
      if (!medMap.has(k)) medMap.set(k, m);
    }
  }

  store.meds = Array.from(medMap.values()).slice(0, 200);
}

/** Same snapshot as server `getStore()` — no `localStorage`. Use for initial React state, then `getStore()` in `useEffect` to hydrate. */
export function getHydrationSafeStore(): PatientStore {
  return cloneSeed();
}

export function getStore(): PatientStore {
  if (typeof window === "undefined") {
    return cloneSeed();
  }
  const raw = localStorage.getItem(KEY);
  if (!raw) return cloneSeed();
  try {
    const parsed = JSON.parse(raw) as PatientStore & { wearables?: unknown; preferences?: { connectedTrackers?: unknown } };
    const { wearables: _legacyWearables, ...parsedSansWearables } = parsed;
    void _legacyWearables;
    const savedProfile = parsedSansWearables.profile ?? {};
    const rawPref = parsedSansWearables.preferences ?? {};
    const { connectedTrackers: _legacyCt, ...preferencesSansTrackers } = rawPref as typeof rawPref & {
      connectedTrackers?: unknown;
    };
    void _legacyCt;
    const seedP = seedStore.profile;
    const mergedMenstrual = {
      typicalCycleLengthDays:
        typeof savedProfile.menstrualCycle?.typicalCycleLengthDays === "number"
          ? savedProfile.menstrualCycle.typicalCycleLengthDays
          : seedP.menstrualCycle?.typicalCycleLengthDays ?? 28,
      lastPeriodStartISO:
        typeof savedProfile.menstrualCycle?.lastPeriodStartISO === "string"
          ? savedProfile.menstrualCycle.lastPeriodStartISO
          : seedP.menstrualCycle?.lastPeriodStartISO,
      flowLogDates: Array.isArray(savedProfile.menstrualCycle?.flowLogDates)
        ? savedProfile.menstrualCycle.flowLogDates
        : seedP.menstrualCycle?.flowLogDates ?? [],
    };

    return {
      ...cloneSeed(),
      ...parsedSansWearables,
      profile: {
        ...seedP,
        ...savedProfile,
        name: typeof savedProfile.name === "string" ? savedProfile.name : seedP.name,
        firstName: typeof savedProfile.firstName === "string" ? savedProfile.firstName : seedP.firstName,
        lastName: typeof savedProfile.lastName === "string" ? savedProfile.lastName : seedP.lastName,
        allergies: Array.isArray(savedProfile.allergies) ? savedProfile.allergies : seedP.allergies,
        conditions: Array.isArray(savedProfile.conditions) ? savedProfile.conditions : seedP.conditions,
        bodyMetrics: {
          ...(seedP.bodyMetrics ?? {}),
          ...(savedProfile.bodyMetrics ?? {}),
        },
        menstrualCycle: mergedMenstrual,
      },
      preferences: {
        ...seedStore.preferences,
        ...preferencesSansTrackers,
        onboarding: {
          ...seedStore.preferences.onboarding,
          ...preferencesSansTrackers.onboarding,
        },
      },
      standardLexicon: Array.isArray(parsedSansWearables.standardLexicon)
        ? parsedSansWearables.standardLexicon
        : cloneSeed().standardLexicon,
    };
  } catch {
    return cloneSeed();
  }
}

export function saveStore(store: PatientStore) {
  if (!store.profile) store.profile = seedStore.profile;
  if (!store.preferences) store.preferences = seedStore.preferences;
  store.updatedAtISO = new Date().toISOString();
  localStorage.setItem(KEY, JSON.stringify(store));
  try {
    window.dispatchEvent(new CustomEvent("mv-store-update", { detail: store }));
  } catch {}
  scheduleRemotePush();
}

export function mergeExtractedDoc(
  doc: ExtractedDoc,
  opts?: { standardLexiconPatches?: StandardLexiconEntry[] }
) {
  const store = getStore();

  if (opts?.standardLexiconPatches?.length) {
    store.standardLexicon = mergeLexiconPatches(store.standardLexicon, opts.standardLexiconPatches);
  }

  const lex = store.standardLexicon ?? [];
  const enriched = enrichDocFromMarkdown(doc, lex);

  // Add doc
  store.docs = [enriched, ...store.docs].slice(0, 500);

  rebuildLabsAndMedsFromDocuments(store);

  // Merge allergies / conditions from doc-level extraction
  if (enriched.allergies?.length) {
    const next = new Set([...(store.profile.allergies ?? []), ...enriched.allergies]);
    store.profile.allergies = Array.from(next).slice(0, 200);
  }
  if (enriched.conditions?.length) {
    const next = new Set([...(store.profile.conditions ?? []), ...enriched.conditions]);
    store.profile.conditions = Array.from(next).slice(0, 200);
  }

  saveStore(store);
  return store;
}

export function removeDoc(docId: string) {
  const store = getStore();
  const deleted = store.docs.find((d) => d.id === docId);
  store.docs = store.docs.filter((d) => d.id !== docId);

  const lex = store.standardLexicon ?? [];
  if (deleted) {
    const delEnriched = enrichDocFromMarkdown(deleted, lex);

    const remainingAllergy = new Set<string>();
    const remainingCondition = new Set<string>();
    for (const d of store.docs) {
      enrichDocFromMarkdown(d, lex).allergies?.forEach((a) => remainingAllergy.add(a.trim().toLowerCase()));
      enrichDocFromMarkdown(d, lex).conditions?.forEach((c) => remainingCondition.add(c.trim().toLowerCase()));
    }

    if (delEnriched.allergies?.length) {
      store.profile.allergies = store.profile.allergies.filter((a) => {
        const al = a.trim().toLowerCase();
        const inDeleted = delEnriched.allergies!.some((x) => x.trim().toLowerCase() === al);
        if (!inDeleted) return true;
        return remainingAllergy.has(al);
      });
    }
    if (delEnriched.conditions?.length) {
      store.profile.conditions = store.profile.conditions.filter((c) => {
        const cl = c.trim().toLowerCase();
        const inDeleted = delEnriched.conditions!.some((x) => x.trim().toLowerCase() === cl);
        if (!inDeleted) return true;
        return remainingCondition.has(cl);
      });
    }
  }

  rebuildLabsAndMedsFromDocuments(store);
  saveStore(store);
  return store;
}
