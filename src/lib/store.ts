"use client";
import {
  PatientStore,
  ExtractedDoc,
  ExtractedLab,
  ExtractedMedication,
  MenstrualCyclePrefs,
  StandardLexiconEntry,
  UMA_TRACKER_LAB_SOURCE,
} from "@/lib/types";
import { normalizeLabUnitString } from "@/lib/labUnits";
import { enrichDocFromMarkdown } from "@/lib/parseMarkdownArtifact";
import { mergeLexiconPatches, resolveCanonicalLabName } from "@/lib/standardized";
import { applyManualMedicationDefaults, mergeMedicationFromDocument } from "@/lib/medicationClassification";
import { defaultHealthLogs, normalizeHealthLogs } from "@/lib/healthLogs";
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
    Boolean((local.profile?.firstName ?? "").trim()) ||
    Boolean((local.profile?.lastName ?? "").trim()) ||
    (local.meds?.length ?? 0) > 0 ||
    (local.labs?.length ?? 0) > 0;

  if (j.store) {
    const server = j.store;
    const serverT = new Date(server.updatedAtISO).getTime();
    const localT = new Date(local.updatedAtISO).getTime();
    const serverEmpty =
      !(server.docs?.length ?? 0) &&
      !(server.profile?.name ?? "").trim() &&
      !(server.profile?.firstName ?? "").trim() &&
      !(server.profile?.lastName ?? "").trim() &&
      !(server.meds?.length ?? 0) &&
      !(server.labs?.length ?? 0);

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
        healthLogs: normalizeHealthLogs(server.healthLogs),
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
    healthLogs: defaultHealthLogs(),
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

function defaultMenstrualCycle(): MenstrualCyclePrefs {
  return { typicalCycleLengthDays: 28, flowLogDates: [] };
}

function normalizeMenstrualFromSaved(saved: MenstrualCyclePrefs | undefined): MenstrualCyclePrefs {
  const base = defaultMenstrualCycle();
  return {
    typicalCycleLengthDays:
      typeof saved?.typicalCycleLengthDays === "number" ? saved.typicalCycleLengthDays : base.typicalCycleLengthDays,
    lastPeriodStartISO: typeof saved?.lastPeriodStartISO === "string" ? saved.lastPeriodStartISO : undefined,
    flowLogDates: Array.isArray(saved?.flowLogDates) ? saved.flowLogDates : [...(base.flowLogDates ?? [])],
  };
}

/** Parse JSON from localStorage without merging in demo seed data (each user/account stays isolated). */
function parseStoredPatientStore(parsed: unknown): PatientStore {
  const blank = createBlankPatientStore();
  if (!parsed || typeof parsed !== "object") return blank;

  const o = parsed as PatientStore & { wearables?: unknown };
  const { wearables: _legacyWearables, ...parsedSansWearables } = o;
  void _legacyWearables;
  const rawPref = parsedSansWearables.preferences ?? {};
  const { connectedTrackers: _legacyCt, ...preferencesSansTrackers } = rawPref as typeof rawPref & {
    connectedTrackers?: unknown;
  };
  void _legacyCt;

  const savedProfile = parsedSansWearables.profile ?? {};
  const theme = preferencesSansTrackers.theme;
  const safeTheme =
    theme === "dark" || theme === "light" || theme === "system" ? theme : blank.preferences.theme;

  return {
    docs: Array.isArray(parsedSansWearables.docs) ? parsedSansWearables.docs : [],
    meds: Array.isArray(parsedSansWearables.meds) ? parsedSansWearables.meds : [],
    labs: Array.isArray(parsedSansWearables.labs) ? parsedSansWearables.labs : [],
    profile: {
      ...blank.profile,
      ...savedProfile,
      name: typeof savedProfile.name === "string" ? savedProfile.name : "",
      firstName: typeof savedProfile.firstName === "string" ? savedProfile.firstName : "",
      lastName: typeof savedProfile.lastName === "string" ? savedProfile.lastName : "",
      allergies: Array.isArray(savedProfile.allergies) ? savedProfile.allergies : [],
      conditions: Array.isArray(savedProfile.conditions) ? savedProfile.conditions : [],
      trends: Array.isArray(savedProfile.trends) ? savedProfile.trends : [],
      bodyMetrics: {
        ...(blank.profile.bodyMetrics ?? {}),
        ...(savedProfile.bodyMetrics ?? {}),
      },
      menstrualCycle: normalizeMenstrualFromSaved(savedProfile.menstrualCycle),
    },
    preferences: {
      ...blank.preferences,
      ...preferencesSansTrackers,
      theme: safeTheme,
      onboarding: {
        ...blank.preferences.onboarding,
        ...preferencesSansTrackers.onboarding,
      },
    },
    standardLexicon: Array.isArray(parsedSansWearables.standardLexicon)
      ? parsedSansWearables.standardLexicon
      : [],
    healthLogs: normalizeHealthLogs((parsedSansWearables as Partial<PatientStore>).healthLogs),
    updatedAtISO:
      typeof parsedSansWearables.updatedAtISO === "string"
        ? parsedSansWearables.updatedAtISO
        : blank.updatedAtISO,
  };
}

function normalizeLabNumericValue(raw: string | number | undefined): string {
  if (raw === undefined || raw === null) return "";
  const s = String(raw).trim();
  // Strip trailing angle brackets / inequality signs that the LLM sometimes prepends ("< 5.0" → "5.0")
  const stripped = s.replace(/^[<>≤≥=\s]+/, "").trim();
  const f = parseFloat(stripped);
  // Only use the parsed float when unambiguously numeric (avoids changing "Negative" → "NaN")
  if (!Number.isNaN(f) && isFinite(f)) return String(f);
  return s.toLowerCase();
}

function labDedupeKey(l: ExtractedLab): string {
  return `${l.name.toLowerCase()}|${l.date ?? ""}|${normalizeLabNumericValue(l.value)}|${l.unit ?? ""}`;
}

/**
 * Rebuilds `store.labs` and `store.meds` from remaining documents (plus tracker labs and manually added meds).
 * Call after removing a document or when fixing drift.
 */
export function rebuildLabsAndMedsFromDocuments(store: PatientStore) {
  const lex = store.standardLexicon ?? [];

  /** Strip inline markdown bold/italic/code markers the LLM sometimes leaks into field values. */
  function stripMd(s: string | undefined): string {
    if (!s) return "";
    return s.replace(/\*\*|__|\*|_|`/g, "").trim();
  }

  function normalizeLabRow(l: ExtractedLab): ExtractedLab {
    const name = resolveCanonicalLabName(stripMd(l.name), lex);
    const rawValue = typeof l.value === "string" ? stripMd(l.value) : l.value;
    const nu = l.unit ? normalizeLabUnitString(stripMd(l.unit)) : "";
    return { ...l, name, value: rawValue, unit: nu || stripMd(l.unit) || undefined };
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
      if (!medMap.has(k)) medMap.set(k, mergeMedicationFromDocument(m, doc));
    }
  }

  for (const m of store.meds) {
    if (!m.sourceDocId) {
      const k = m.name.toLowerCase();
      if (!medMap.has(k)) medMap.set(k, applyManualMedicationDefaults(m));
    }
  }

  store.meds = Array.from(medMap.values()).slice(0, 200);
}

/** Blank store for SSR / first paint; client `useEffect` should call `getStore()` to read `localStorage`. */
export function getHydrationSafeStore(): PatientStore {
  return createBlankPatientStore();
}

export function getStore(): PatientStore {
  if (typeof window === "undefined") {
    return createBlankPatientStore();
  }
  const raw = localStorage.getItem(KEY);
  if (!raw) return createBlankPatientStore();
  try {
    return parseStoredPatientStore(JSON.parse(raw));
  } catch {
    return createBlankPatientStore();
  }
}

export function saveStore(store: PatientStore) {
  const blank = createBlankPatientStore();
  if (!store.profile) store.profile = blank.profile;
  if (!store.preferences) store.preferences = blank.preferences;
  if (!store.healthLogs) store.healthLogs = defaultHealthLogs();
  store.updatedAtISO = new Date().toISOString();
  localStorage.setItem(KEY, JSON.stringify(store));
  try {
    window.dispatchEvent(new CustomEvent("mv-store-update", { detail: store }));
  } catch {}
  scheduleRemotePush();
}

/**
 * Returns the year-month prefix of a dateISO string ("2026-03") for fuzzy
 * same-month comparison (handles slight date discrepancies across related reports).
 */
function yearMonth(iso: string): string {
  return iso.slice(0, 7); // "YYYY-MM"
}

/**
 * Check whether the new document's labs significantly overlap with an existing document
 * from the same calendar month. Returns the best match if overlap ≥ 35%, else null.
 *
 * A full-panel report that is a superset of an earlier CBC will score ~100% on
 * the CBC's lab names, so even a 35% threshold catches most same-visit duplicates.
 */
export function detectDocumentLabOverlap(
  newDoc: ExtractedDoc,
  existingDocs: ExtractedDoc[],
  lex: StandardLexiconEntry[] = []
): { overlappingDocTitle: string; overlapPct: number } | null {
  const newLabs = enrichDocFromMarkdown(newDoc, lex).labs ?? [];
  if (newLabs.length < 3) return null;

  const newNames = new Set(
    newLabs.map((l) => resolveCanonicalLabName(l.name, lex).toLowerCase())
  );

  let bestMatch: { overlappingDocTitle: string; overlapPct: number } | null = null;

  for (const existing of existingDocs) {
    if (!newDoc.dateISO || !existing.dateISO) continue;

    // Same calendar month (allows for ±1 day date extraction differences)
    if (yearMonth(newDoc.dateISO) !== yearMonth(existing.dateISO)) continue;

    const existingLabs = enrichDocFromMarkdown(existing, lex).labs ?? [];
    if (existingLabs.length < 3) continue;

    const existingNames = new Set(
      existingLabs.map((l) => resolveCanonicalLabName(l.name, lex).toLowerCase())
    );

    // Use the smaller set as the denominator so "CBC ⊂ Full panel" scores high
    let sharedCount = 0;
    for (const name of newNames) {
      if (existingNames.has(name)) sharedCount++;
    }

    const overlapPct = sharedCount / Math.min(newNames.size, existingNames.size);
    if (overlapPct >= 0.35 && (!bestMatch || overlapPct > bestMatch.overlapPct)) {
      bestMatch = { overlappingDocTitle: existing.title ?? "existing report", overlapPct };
    }
  }
  return bestMatch;
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

  const firstDocDoctor = enriched.doctors?.map((d) => d.trim()).find(Boolean);
  if (firstDocDoctor && !(store.profile.primaryCareProvider ?? "").trim()) {
    store.profile.primaryCareProvider = firstDocDoctor;
  }

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
