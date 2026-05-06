"use client";
import { useEffect, useState } from "react";
import {
  PatientStore,
  ExtractedDoc,
  ExtractedLab,
  ExtractedMedication,
  MenstrualCyclePrefs,
  StandardLexiconEntry,
  UMA_TRACKER_LAB_SOURCE,
  FamilyMemberMeta,
  FamilyRelation,
  UsageLogEntry,
  UmaNotification,
  UmaNotificationKind,
  FamilyLink,
  FamilyConnectionRequest,
  FamilyLinkVisibility,
} from "@/lib/types";
export type { FamilyMemberMeta, FamilyRelation, UsageLogEntry, UmaNotification, UmaNotificationKind, FamilyLink, FamilyConnectionRequest, FamilyLinkVisibility };
import { normalizeLabUnitString } from "@/lib/labUnits";
import { enrichDocFromMarkdown } from "@/lib/parseMarkdownArtifact";
import { mergeLexiconPatches, resolveCanonicalLabName } from "@/lib/standardized";
import { applyManualMedicationDefaults, mergeMedicationFromDocument } from "@/lib/medicationClassification";
import { defaultHealthLogs, normalizeHealthLogs } from "@/lib/healthLogs";
import { patientStoreForApiPayload } from "@/lib/patientStoreApi";
import { log } from "@/lib/log";
import { applyEffectiveThemeToDocument, resolveThemePreference } from "@/lib/themePreference";
import { generateInternalId, registerPrimaryAccount, registerSubProfile, deregisterEntry } from "@/lib/accountRegistry";
import { interpretLab } from "@/lib/labInterpret";

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

/** When the server row predates newer profile fields, keep local values if the payload omits them. */
function mergeProfileFromServer(
  local: PatientStore["profile"],
  server: PatientStore["profile"] | undefined | null,
): PatientStore["profile"] {
  const mergedBase: PatientStore["profile"] = { ...local, ...(server ?? {}) };
  const serverObj = (server ?? {}) as Record<string, unknown>;
  const localObj = local as Record<string, unknown>;
  const out = mergedBase as Record<string, unknown>;

  for (const key of ["primaryCareProvider", "nextVisitHospital"] as const) {
    if (!(key in serverObj)) {
      out[key] = localObj[key];
    } else {
      const v = serverObj[key];
      const s = typeof v === "string" ? v.trim() : "";
      out[key] = s ? s : undefined;
    }
  }
  for (const key of [
    "doctorQuickPick",
    "facilityQuickPick",
    "doctorQuickPickHidden",
    "facilityQuickPickHidden",
  ] as const) {
    if (!(key in serverObj)) {
      out[key] = localObj[key];
    }
  }
  return mergedBase;
}

/**
 * Pull server copy after login or on app load; push local data if the server row is empty.
 * Server wins when its updatedAtISO is newer or local has no meaningful data.
 */
/** True while a server sync is in flight; components can gate loading skeletons on this. */
let _isSyncing = false;
export function isStoreSyncing(): boolean {
  return _isSyncing;
}

export async function syncPatientStoreWithServer(): Promise<void> {
  if (typeof window === "undefined") return;
  _isSyncing = true;
  try {
    window.dispatchEvent(new CustomEvent("mv-store-syncing"));
  } catch {}
  let r: Response;
  try {
    r = await fetch("/api/patient-store", { credentials: "same-origin" });
  } catch {
    _isSyncing = false;
    try { window.dispatchEvent(new CustomEvent("mv-store-synced")); } catch {}
    return;
  }
  if (r.status === 401 || !r.ok) {
    _isSyncing = false;
    try { window.dispatchEvent(new CustomEvent("mv-store-synced")); } catch {}
    return;
  }

  const j = (await r.json()) as { ok?: boolean; store?: PatientStore | null };
  if (!j.ok) {
    _isSyncing = false;
    try { window.dispatchEvent(new CustomEvent("mv-store-synced")); } catch {}
    return;
  }

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
        profile: mergeProfileFromServer(local.profile, server.profile),
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
  _isSyncing = false;
  try { window.dispatchEvent(new CustomEvent("mv-store-synced")); } catch {}
}

function profilePatchFromSession(session: { email?: string | null; phoneE164?: string | null }) {
  const patch: Partial<PatientStore["profile"]> = {};
  if (session.email) patch.email = session.email;
  if (session.phoneE164) {
    // Try matching longest known dial code first (1-4 digits), to avoid greedy mismatch
    // e.g. "+31685..." should produce "+31" not "+3168"
    const e164 = session.phoneE164;
    const DIAL_CODES = [
      "+1", "+7", "+20", "+27", "+31", "+33", "+34", "+39", "+41", "+44",
      "+45", "+46", "+47", "+48", "+49", "+52", "+55", "+60", "+61", "+62",
      "+63", "+64", "+65", "+81", "+82", "+86", "+90", "+91", "+92", "+94",
      "+98", "+212", "+213", "+233", "+234", "+251", "+254", "+255", "+256",
      "+880", "+966", "+971",
    ];
    // Sort by length descending to match longest first
    const sorted = [...DIAL_CODES].sort((a, b) => b.length - a.length);
    const matched = sorted.find(code => e164.startsWith(code));
    if (matched) {
      patch.countryCode = matched;
      patch.phone = e164.slice(matched.length);
    } else {
      const m = e164.match(/^(\+\d{1,3})(\d+)$/);
      if (m) { patch.countryCode = m[1]; patch.phone = m[2]; }
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
      internalId: partialProfile?.internalId ?? generateInternalId(),
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
      if (merged.profile.internalId && merged.profile.email) {
        registerPrimaryAccount(merged.profile.internalId, merged.profile.email, merged.profile.name || "");
      }
    } else {
      const blank = createBlankPatientStore(sessionPatch);
      saveStore(blank);
      localStorage.setItem(ACCOUNT_INIT, "1");
      if (blank.profile.internalId && blank.profile.email) {
        registerPrimaryAccount(blank.profile.internalId, blank.profile.email, blank.profile.name || "");
      }
    }
    return;
  }

  const s = getStore();
  const merged = { ...s, profile: { ...s.profile, ...sessionPatch } };
  saveStore(merged);
  if (merged.profile.internalId && merged.profile.email) {
    registerPrimaryAccount(merged.profile.internalId, merged.profile.email, merged.profile.name || "");
  }
}

function defaultMenstrualCycle(): MenstrualCyclePrefs {
  return { typicalCycleLengthDays: 28, flowLogDates: [] };
}

function normalizeMenstrualFromSaved(saved: MenstrualCyclePrefs | undefined): MenstrualCyclePrefs {
  const base = defaultMenstrualCycle();
  return {
    typicalCycleLengthDays:
      typeof saved?.typicalCycleLengthDays === "number" ? saved.typicalCycleLengthDays : base.typicalCycleLengthDays,
    periodLengthDays:
      typeof saved?.periodLengthDays === "number" ? saved.periodLengthDays : undefined,
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

  const profile = {
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
  };

  if (!profile.internalId) {
    profile.internalId = generateInternalId();
  }

  return {
    docs: Array.isArray(parsedSansWearables.docs) ? parsedSansWearables.docs : [],
    meds: Array.isArray(parsedSansWearables.meds) ? parsedSansWearables.meds : [],
    labs: Array.isArray(parsedSansWearables.labs) ? parsedSansWearables.labs : [],
    profile,
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
    familyMembers: Array.isArray(parsedSansWearables.familyMembers)
      ? (parsedSansWearables.familyMembers as FamilyMemberMeta[])
      : undefined,
    activeFamilyMemberId:
      typeof parsedSansWearables.activeFamilyMemberId === "string"
        ? parsedSansWearables.activeFamilyMemberId
        : undefined,
    notifications: Array.isArray((parsedSansWearables as Partial<PatientStore>).notifications)
      ? ((parsedSansWearables as Partial<PatientStore>).notifications as UmaNotification[])
      : [],
    familyLinks: Array.isArray((parsedSansWearables as Partial<PatientStore>).familyLinks)
      ? ((parsedSansWearables as Partial<PatientStore>).familyLinks as import("@/lib/types").FamilyLink[])
      : undefined,
    pendingFamilyRequests: Array.isArray((parsedSansWearables as Partial<PatientStore>).pendingFamilyRequests)
      ? ((parsedSansWearables as Partial<PatientStore>).pendingFamilyRequests as import("@/lib/types").FamilyConnectionRequest[])
      : undefined,
    insurancePlans: Array.isArray((parsedSansWearables as Partial<PatientStore>).insurancePlans)
      ? ((parsedSansWearables as Partial<PatientStore>).insurancePlans as import("@/lib/types").InsurancePlan[])
      : undefined,
    insuranceClaims: Array.isArray((parsedSansWearables as Partial<PatientStore>).insuranceClaims)
      ? ((parsedSansWearables as Partial<PatientStore>).insuranceClaims as import("@/lib/types").InsuranceClaim[])
      : undefined,
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
/**
 * Cheap content fingerprint used to skip rebuild work when docs haven't
 * meaningfully changed since the last call. We hash doc IDs, lab counts,
 * medication counts, and the lexicon length — that's enough to catch the
 * focus/storage/custom-event re-entry case that was causing the dashboard
 * to re-rebuild on every event without any actual data change.
 */
let _lastRebuildFingerprint = "";

function rebuildFingerprint(store: PatientStore): string {
  const docKey = (store.docs ?? [])
    .map((d) => `${d.id}:${(d.labs ?? []).length}:${(d.medications ?? []).length}`)
    .join("|");
  const lexLen = (store.standardLexicon ?? []).length;
  const trackerLabCount = (store.labs ?? []).filter((l) => l.sourceDocId === UMA_TRACKER_LAB_SOURCE).length;
  return `${docKey}#${lexLen}#${trackerLabCount}`;
}

export function rebuildLabsAndMedsFromDocuments(store: PatientStore) {
  // Short-circuit: if nothing observable has changed since the last rebuild,
  // skip the O(docs × labs) work entirely. This is the single biggest win
  // for first-paint and tab-focus latency on accounts with many reports.
  const fp = rebuildFingerprint(store);
  if (fp === _lastRebuildFingerprint && (store.labs?.length ?? 0) > 0) {
    return;
  }
  _lastRebuildFingerprint = fp;
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
  // Secondary dedup: same name+value+unit across different dates.
  // Keeps the EARLIER date (the original measurement), discarding later
  // re-statements from referral letters or clinical notes.
  const valueMap = new Map<string, { outIdx: number; date: string; isLabDoc: boolean }>();

  for (const doc of store.docs) {
    const enriched = enrichDocFromMarkdown(doc, lex);
    const isLabDoc = (enriched.type ?? "").toLowerCase().includes("lab");
    for (const raw of enriched.labs ?? []) {
      const n = normalizeLabRow(raw);
      const k = labDedupeKey(n); // exact name|date|value|unit dedup
      if (seen.has(k)) continue;

      // Value-level dedup: name|value|unit ignoring date
      const numericVal = String(n.value ?? "").replace(/[^0-9.]/g, "");
      const vk = `${n.name.toLowerCase()}|${numericVal}|${n.unit ?? ""}`;
      const existing = valueMap.get(vk);
      if (existing) {
        // Same measurement exists from another doc — keep the earlier-dated entry
        // (the original measurement), unless the current entry is from a primary
        // lab report and the existing entry is not.
        const currentIsEarlier = (n.date ?? "") < (existing.date ?? "");
        if (currentIsEarlier && (isLabDoc || !existing.isLabDoc)) {
          // Replace existing entry with the earlier-dated one
          labsOut[existing.outIdx] = { ...n, sourceDocId: doc.id };
          seen.add(k);
          valueMap.set(vk, { outIdx: existing.outIdx, date: n.date ?? "", isLabDoc });
        } else {
          // Existing entry is earlier or equally authoritative — skip current
          seen.add(k);
        }
        continue;
      }

      seen.add(k);
      valueMap.set(vk, { outIdx: labsOut.length, date: n.date ?? "", isLabDoc });
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
    const parsed = parseStoredPatientStore(JSON.parse(raw));
    if (!parsed.profile.internalId) {
      parsed.profile.internalId = generateInternalId();
      try {
        localStorage.setItem(KEY, JSON.stringify(parsed));
      } catch {
        // ignore storage errors
      }
    }
    return parsed;
  } catch {
    return createBlankPatientStore();
  }
}

/**
 * Save the store to localStorage.
 *
 * Performance: when `silent` is true, we skip dispatching `mv-store-update`
 * and skip the remote push. Use silent for derived-state writes that the UI
 * has already reflected (e.g. the on-mount idempotent rebuild) — otherwise
 * every save fans out to ~10 listeners and re-triggers the same load handler
 * that originated the write, creating a render storm.
 */
export function saveStore(store: PatientStore, opts: { silent?: boolean } = {}) {
  const blank = createBlankPatientStore();
  if (!store.profile) store.profile = blank.profile;
  if (!store.preferences) store.preferences = blank.preferences;
  if (!store.healthLogs) store.healthLogs = defaultHealthLogs();
  store.updatedAtISO = new Date().toISOString();
  const serialized = JSON.stringify(store);
  // Skip the write entirely if the serialized payload is byte-identical to
  // what's already in localStorage (modulo updatedAtISO, which always changes).
  // This is a cheap-but-effective short-circuit for the rebuild loop.
  try {
    const existing = localStorage.getItem(KEY);
    if (existing && stripUpdatedAt(existing) === stripUpdatedAt(serialized)) {
      // No effective change — don't dispatch, don't push.
      return;
    }
  } catch {
    // fall through to write
  }
  localStorage.setItem(KEY, serialized);
  if (!opts.silent) {
    try {
      window.dispatchEvent(new CustomEvent("mv-store-update", { detail: store }));
    } catch {}
    scheduleRemotePush();
  }
}

/** Strip the `updatedAtISO` field from a stringified store for equality checks. */
function stripUpdatedAt(s: string): string {
  return s.replace(/"updatedAtISO":"[^"]*"/g, "");
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
/**
 * Outcome of comparing a newly uploaded document against existing docs.
 *
 * - `exact_duplicate`: The new doc has the same labs with the same values — discard.
 * - `new_is_superset`: The new doc contains everything the existing has plus more — upgrade/replace.
 * - `existing_is_superset`: The existing doc already has everything the new one has — discard.
 * - `partial_overlap`: Some shared labs but neither is a strict superset — add as new, note overlap.
 */
export type DocOverlapKind = "exact_duplicate" | "new_is_superset" | "existing_is_superset" | "partial_overlap";

export type DocOverlapResult = {
  kind: DocOverlapKind;
  existingDoc: ExtractedDoc;
  overlapPct: number;
  /** How many labs the new doc has that the existing one doesn't. */
  newExtraCount: number;
  /** How many labs the existing doc has that the new one doesn't. */
  existingExtraCount: number;
};

/**
 * Rich overlap detection — returns the match kind and the actual existing doc reference
 * so callers can decide whether to merge, replace, or discard.
 */
export function detectDocumentOverlapFull(
  newDoc: ExtractedDoc,
  existingDocs: ExtractedDoc[],
  lex: StandardLexiconEntry[] = []
): DocOverlapResult | null {
  const newEnriched = enrichDocFromMarkdown(newDoc, lex);
  const newLabs = newEnriched.labs ?? [];

  log.debug(
    "[UMA smartMerge] new doc:", newDoc.title,
    "| dateISO:", newDoc.dateISO ?? "(none)",
    "| labs after enrich:", newLabs.length,
    "| existing docs:", existingDocs.length
  );

  if (newLabs.length < 2) {
    log.debug("[UMA smartMerge] skipping overlap: new doc has <2 labs");
    return null;
  }

  const newNames = new Set(
    newLabs.map((l) => resolveCanonicalLabName(l.name, lex).toLowerCase())
  );

  /** Build a value fingerprint for exact-duplicate detection: "hemoglobin|14.6|g/dl" */
  const newLabFingerprints = new Set(
    newLabs.map((l) => {
      const name = resolveCanonicalLabName(l.name, lex).toLowerCase();
      const val = normalizeLabNumericValue(l.value);
      const unit = (l.unit ?? "").toLowerCase().trim();
      return `${name}|${val}|${unit}`;
    })
  );

  let bestMatch: DocOverlapResult | null = null;

  // Use same-month as a preference but NOT a gate: compare against all existing
  // docs and use a higher overlap threshold when dates don't match.
  const THRESHOLD_SAME_MONTH = 0.35;
  const THRESHOLD_NO_DATE = 0.50;

  for (const existing of existingDocs) {
    const sameMonth =
      newDoc.dateISO && existing.dateISO &&
      yearMonth(newDoc.dateISO) === yearMonth(existing.dateISO);

    // Use a stricter threshold when dates don't align (or are missing)
    const threshold = sameMonth ? THRESHOLD_SAME_MONTH : THRESHOLD_NO_DATE;

    const existingEnriched = enrichDocFromMarkdown(existing, lex);
    const existingLabs = existingEnriched.labs ?? [];

    log.debug(
      "[UMA smartMerge]   vs existing:", existing.title,
      "| dateISO:", existing.dateISO ?? "(none)",
      "| sameMonth:", !!sameMonth,
      "| existingLabs:", existingLabs.length
    );

    if (existingLabs.length < 2) continue;

    const existingNames = new Set(
      existingLabs.map((l) => resolveCanonicalLabName(l.name, lex).toLowerCase())
    );

    const existingLabFingerprints = new Set(
      existingLabs.map((l) => {
        const name = resolveCanonicalLabName(l.name, lex).toLowerCase();
        const val = normalizeLabNumericValue(l.value);
        const unit = (l.unit ?? "").toLowerCase().trim();
        return `${name}|${val}|${unit}`;
      })
    );

    // Count shared lab *names* (ignoring values for subset detection)
    let sharedNameCount = 0;
    for (const name of newNames) {
      if (existingNames.has(name)) sharedNameCount++;
    }

    const smallerSetSize = Math.min(newNames.size, existingNames.size);
    if (smallerSetSize === 0) continue;
    const overlapPct = sharedNameCount / smallerSetSize;

    log.debug(
      "[UMA smartMerge]   shared:", sharedNameCount,
      "| newNames:", newNames.size,
      "| existingNames:", existingNames.size,
      "| overlapPct:", Math.round(overlapPct * 100) + "%",
      "| threshold:", Math.round(threshold * 100) + "%"
    );

    if (overlapPct < threshold) continue;

    const newExtraCount = [...newNames].filter((n) => !existingNames.has(n)).length;
    const existingExtraCount = [...existingNames].filter((n) => !newNames.has(n)).length;

    // Determine kind
    let kind: DocOverlapKind;

    // Check if all shared labs have identical values (exact duplicate check)
    let sharedValueCount = 0;
    for (const fp of newLabFingerprints) {
      if (existingLabFingerprints.has(fp)) sharedValueCount++;
    }
    const allSharedValuesMatch = sharedValueCount >= sharedNameCount;

    log.debug(
      "[UMA smartMerge]   sharedValues:", sharedValueCount,
      "| allMatch:", allSharedValuesMatch,
      "| newExtra:", newExtraCount,
      "| existingExtra:", existingExtraCount
    );

    if (allSharedValuesMatch && newExtraCount === 0 && existingExtraCount === 0) {
      // Same labs, same values — exact duplicate
      kind = "exact_duplicate";
    } else if (allSharedValuesMatch && newExtraCount > 0 && existingExtraCount === 0) {
      // New doc has everything existing has + more labs — new is a superset (upgrade)
      kind = "new_is_superset";
    } else if (allSharedValuesMatch && newExtraCount === 0 && existingExtraCount > 0) {
      // Existing doc already has everything + more — existing is superset (discard new)
      kind = "existing_is_superset";
    } else {
      // Partial overlap — some shared, some unique to each side
      kind = "partial_overlap";
    }

    log.debug("[UMA smartMerge]   → kind:", kind);

    if (!bestMatch || overlapPct > bestMatch.overlapPct) {
      bestMatch = { kind, existingDoc: existing, overlapPct, newExtraCount, existingExtraCount };
    }
  }

  log.debug("[UMA smartMerge] final result:", bestMatch ? bestMatch.kind : "no overlap");
  return bestMatch;
}

/**
 * Smart merge: detects duplicates and partial overlaps before adding a document.
 *
 * Returns an action description so the UI can show the right feedback message.
 *
 * Scenarios:
 * 1. **exact_duplicate** → discard, return notice
 * 2. **new_is_superset** → replace existing doc with the new complete version
 * 3. **existing_is_superset** → discard new, return notice
 * 4. **partial_overlap** → add as new doc (labs auto-deduped by rebuildLabsAndMedsFromDocuments)
 * 5. **no_overlap** → add as new doc
 */
export type SmartMergeResult = {
  action: "added" | "upgraded" | "discarded_exact" | "discarded_subset" | "added_with_overlap";
  store: PatientStore;
  message: string;
};

export function smartMergeExtractedDoc(
  doc: ExtractedDoc,
  opts?: { standardLexiconPatches?: StandardLexiconEntry[] }
): SmartMergeResult {
  const store = getStore();

  if (opts?.standardLexiconPatches?.length) {
    store.standardLexicon = mergeLexiconPatches(store.standardLexicon, opts.standardLexiconPatches);
  }

  const lex = store.standardLexicon ?? [];
  const enriched = enrichDocFromMarkdown(doc, lex);
  const overlap = detectDocumentOverlapFull(enriched, store.docs, lex);

  log.debug(
    "[UMA smartMerge] overlap result for", enriched.title, "→",
    overlap ? `${overlap.kind} (${Math.round(overlap.overlapPct * 100)}% match with "${overlap.existingDoc.title}")` : "no overlap"
  );

  // ── No overlap: straightforward add ────────────────────────────
  if (!overlap) {
    store.docs = [enriched, ...store.docs].slice(0, 500);
    rebuildLabsAndMedsFromDocuments(store);
    mergeDocProfileFields(store, enriched);
    saveStore(store);
    // Only notify if the report contains abnormal (flagged) labs — skip the
    // purely informational "document saved" event which was noisy.
    pushAbnormalLabNotificationIfNeeded(enriched, store.standardLexicon ?? []);
    return {
      action: "added",
      store,
      message: "Saved. Your home screen, file list, and charts now include this report.",
    };
  }

  const existingTitle = overlap.existingDoc.title ?? "an existing report";

  switch (overlap.kind) {
    // ── Exact duplicate: discard ───────────────────────────────────
    case "exact_duplicate":
      return {
        action: "discarded_exact",
        store,
        message: `This report is identical to "${existingTitle}" already in your records. No changes made.`,
      };

    // ── New doc is a superset (incomplete → complete upgrade) ──────
    case "new_is_superset": {
      // Replace the old doc with the new one, preserving the old doc's id for
      // any external references, but taking all content from the new version.
      const upgradedDoc: ExtractedDoc = {
        ...enriched,
        id: overlap.existingDoc.id, // keep original id for continuity
        uploadedAtISO: overlap.existingDoc.uploadedAtISO ?? enriched.uploadedAtISO,
        // keep original PDF if the new one doesn't have it
        originalPdfBase64: enriched.originalPdfBase64 ?? overlap.existingDoc.originalPdfBase64,
      };
      store.docs = store.docs.map((d) =>
        d.id === overlap.existingDoc.id ? upgradedDoc : d
      );
      rebuildLabsAndMedsFromDocuments(store);
      mergeDocProfileFields(store, upgradedDoc);
      saveStore(store);
      // Only notify if the upgraded report has abnormal labs — skip the
      // informational "report updated" event.
      pushAbnormalLabNotificationIfNeeded(upgradedDoc, store.standardLexicon ?? []);
      return {
        action: "upgraded",
        store,
        message: `Updated "${existingTitle}" with ${overlap.newExtraCount} additional lab result${overlap.newExtraCount === 1 ? "" : "s"} from the complete report. Title and summary refreshed.`,
      };
    }

    // ── Existing doc is already the superset: discard new ─────────
    case "existing_is_superset":
      return {
        action: "discarded_subset",
        store,
        message: `"${existingTitle}" already contains all ${enriched.labs?.length ?? 0} lab results from this upload (plus ${overlap.existingExtraCount} more). No changes made.`,
      };

    // ── Partial overlap: add as new but note the overlap ──────────
    case "partial_overlap":
    default: {
      store.docs = [enriched, ...store.docs].slice(0, 500);
      rebuildLabsAndMedsFromDocuments(store);
      mergeDocProfileFields(store, enriched);
      saveStore(store);
      const pct = Math.round(overlap.overlapPct * 100);
      return {
        action: "added_with_overlap",
        store,
        message: `Saved. This report shares ${pct}% of its labs with "${existingTitle}" — duplicate lab values are deduped automatically.`,
      };
    }
  }
}

/**
 * If the document contains any abnormal (out-of-range) lab results, push a single
 * actionable `lab_flag` notification. If all labs are in range (or there are none),
 * no notification is created — document uploads are otherwise silent.
 */
function pushAbnormalLabNotificationIfNeeded(doc: ExtractedDoc, lex: import("@/lib/types").StandardLexiconEntry[]): void {
  const labs = doc.labs ?? [];
  if (labs.length === 0) return;

  const abnormal = labs.filter((l) => {
    try {
      const interp = interpretLab(l, lex);
      return interp.flag === "high" || interp.flag === "low";
    } catch {
      return false;
    }
  });

  if (abnormal.length === 0) return;

  const labNames = abnormal.slice(0, 3).map((l) => l.name).join(", ");
  const more = abnormal.length > 3 ? ` and ${abnormal.length - 3} more` : "";
  pushNotification({
    kind: "lab_flag",
    title: `${abnormal.length} result${abnormal.length === 1 ? "" : "s"} outside normal range`,
    body: `${labNames}${more} — review these with your doctor.`,
    actionHref: `/docs/${doc.id}`,
    actionLabel: "View report",
  });
}

/** Merge allergies, conditions, and primary care provider from a doc into the store profile. */
function mergeDocProfileFields(store: PatientStore, enriched: ExtractedDoc) {
  const firstDocDoctor = enriched.doctors?.map((d) => d.trim()).find(Boolean);
  if (firstDocDoctor && !(store.profile.primaryCareProvider ?? "").trim()) {
    store.profile.primaryCareProvider = firstDocDoctor;
  }
  if (enriched.allergies?.length) {
    const next = new Set([...(store.profile.allergies ?? []), ...enriched.allergies]);
    store.profile.allergies = Array.from(next).slice(0, 200);
  }
  if (enriched.conditions?.length) {
    const next = new Set([...(store.profile.conditions ?? []), ...enriched.conditions]);
    store.profile.conditions = Array.from(next).slice(0, 200);
  }
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

// ─── Family member store helpers ──────────────────────────────────────────────

function familyKey(id: string): string {
  return `mv_patient_store_family_${id}_v1`;
}

/** Get or create the PatientStore for a specific family member. */
export function getFamilyMemberStore(id: string): PatientStore {
  if (typeof window === "undefined") return createBlankPatientStore();
  const raw = localStorage.getItem(familyKey(id));
  if (!raw) return createBlankPatientStore();
  try {
    return parseStoredPatientStore(JSON.parse(raw));
  } catch {
    return createBlankPatientStore();
  }
}

/** Save the PatientStore for a specific family member. */
export function saveFamilyMemberStore(id: string, store: PatientStore): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(familyKey(id), JSON.stringify({ ...store, updatedAtISO: new Date().toISOString() }));
}

/** Add a family member to the primary account. Creates a blank store for them. */
export function addFamilyMember(meta: Omit<FamilyMemberMeta, "id" | "addedAtISO">): FamilyMemberMeta {
  const id = `fm_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const internalId = generateInternalId();
  const newMeta: FamilyMemberMeta = { ...meta, id, internalId, addedAtISO: new Date().toISOString() };
  const root = getStore();
  const members = root.familyMembers ?? [];

  // Auto-infer connections based on new member's relation
  const updatedMembers = [...members, newMeta];
  autoConnectFamilyMembers(updatedMembers);

  saveStore({ ...root, familyMembers: updatedMembers });
  saveFamilyMemberStore(id, createBlankPatientStore());
  registerSubProfile(internalId, root.profile.email ?? "", meta.displayName, meta.relation);
  return newMeta;
}

/** Auto-infer and set up family connections based on relations (mother↔father, siblings→parents). */
function autoConnectFamilyMembers(_members: FamilyMemberMeta[]): void {
  // TODO: implement family-connection logic (link parents as couple, link siblings to parents)
}

/** Update a family member's meta fields (displayName, relation, fullName, linkedEmail, linkedPhone).
 *  Does NOT touch their isolated PatientStore. */
export function updateFamilyMemberMeta(
  id: string,
  patch: Partial<Pick<FamilyMemberMeta, "displayName" | "relation" | "fullName" | "linkedEmail" | "linkedPhone">>
): void {
  if (typeof window === "undefined") return;
  const root = getStore();
  const members = (root.familyMembers ?? []).map((m) =>
    m.id === id ? { ...m, ...patch } : m
  );
  saveStore({ ...root, familyMembers: members });
}

/** Remove a family member and their data. Switches back to self if they were active. */
export function removeFamilyMember(id: string): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(familyKey(id));
  const root = getStore();
  const memberToRemove = (root.familyMembers ?? []).find((m) => m.id === id);
  if (memberToRemove?.internalId) {
    deregisterEntry(memberToRemove.internalId);
  }
  const members = (root.familyMembers ?? []).filter((m) => m.id !== id);
  const active = root.activeFamilyMemberId === id ? undefined : root.activeFamilyMemberId;
  saveStore({ ...root, familyMembers: members, activeFamilyMemberId: active });
  window.dispatchEvent(new CustomEvent("mv-active-member-changed"));
}

/** Switch the currently viewed profile. Pass undefined or "self" to view the primary. */
export function setActiveFamilyMember(id: string | undefined): void {
  const root = getStore();
  saveStore({ ...root, activeFamilyMemberId: id ?? undefined });
  window.dispatchEvent(new CustomEvent("mv-active-member-changed"));
  window.dispatchEvent(new CustomEvent("mv-store-update", { detail: getViewingStore() }));
}

/**
 * Returns the PatientStore of whoever is currently being viewed.
 * If `activeFamilyMemberId` is set to a valid member ID, returns their store.
 * Otherwise returns the primary user's store.
 */
export function getViewingStore(): PatientStore {
  const root = getStore();
  const activeId = root.activeFamilyMemberId;
  if (!activeId) return root;
  const member = (root.familyMembers ?? []).find((m) => m.id === activeId);
  if (!member) return root; // safety: member no longer exists
  return getFamilyMemberStore(activeId);
}

/** Same blank snapshot on server and the client's first render — avoids SSR/hydration drift. Real data loads in `useEffect` via `getViewingStore()`. */
export function getHydrationSafeViewingStore(): PatientStore {
  return createBlankPatientStore();
}

/**
 * Save the PatientStore for whoever is currently being viewed.
 * Routes to either the primary store or the active family member's store.
 *
 * `silent` suppresses the `mv-store-update` event — used for derived-state
 * writes from rebuilds, where the originating UI already reflects the value.
 */
export function saveViewingStore(store: PatientStore, opts: { silent?: boolean } = {}): void {
  const root = getStore();
  const activeId = root.activeFamilyMemberId;
  if (!activeId) {
    saveStore(store, opts);
    return;
  }
  const member = (root.familyMembers ?? []).find((m) => m.id === activeId);
  if (!member) {
    saveStore(store, opts);
    return;
  }
  saveFamilyMemberStore(activeId, store);
  if (!opts.silent) {
    window.dispatchEvent(new CustomEvent("mv-store-update", { detail: store }));
  }
}

/** Get the currently active family member's meta (or null if viewing self). */
export function getActiveFamilyMember(): FamilyMemberMeta | null {
  const root = getStore();
  const activeId = root.activeFamilyMemberId;
  if (!activeId) return null;
  return (root.familyMembers ?? []).find((m) => m.id === activeId) ?? null;
}

/* ─── Usage Log ──────────────────────────────────────────── */
const USAGE_LOG_KEY = "mv_usage_log_v1";
const MAX_USAGE_LOG_ENTRIES = 500;

export function getUsageLog(): UsageLogEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(USAGE_LOG_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as UsageLogEntry[]) : [];
  } catch {
    return [];
  }
}

export function appendUsageLogEntry(
  entry: Omit<UsageLogEntry, "id" | "timestampISO">
): void {
  if (typeof window === "undefined") return;
  const log = getUsageLog();
  const newEntry: UsageLogEntry = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestampISO: new Date().toISOString(),
    ...entry,
  };
  const trimmed = [newEntry, ...log].slice(0, MAX_USAGE_LOG_ENTRIES);
  try {
    localStorage.setItem(USAGE_LOG_KEY, JSON.stringify(trimmed));
  } catch {
    // ignore storage errors
  }
}

export function getUsageSummary(): {
  totalUSD: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  extractionCount: number;
  chatCount: number;
  entries: UsageLogEntry[];
} {
  const entries = getUsageLog();
  let totalUSD = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let extractionCount = 0;
  let chatCount = 0;
  for (const e of entries) {
    totalUSD += e.totalUSD;
    totalInputTokens += e.inputTokens;
    totalOutputTokens += e.outputTokens;
    if (e.kind === "pdf_extraction") extractionCount++;
    if (e.kind === "chat_message") chatCount++;
  }
  return { totalUSD, totalInputTokens, totalOutputTokens, extractionCount, chatCount, entries };
}

/* ─── In-app Notifications ───────────────────────────────── */
const MAX_NOTIFICATIONS = 100;

/** Add a notification to the primary account store (notifications are always on the root account). */
export function pushNotification(
  notif: Omit<UmaNotification, "id" | "createdAtISO">
): UmaNotification {
  if (typeof window === "undefined") return { id: "", createdAtISO: "", ...notif };
  const store = getStore();
  const newNotif: UmaNotification = {
    id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    createdAtISO: new Date().toISOString(),
    ...notif,
  };
  const existing = store.notifications ?? [];
  // Dedupe: skip if same kind + title added in the last 60 seconds
  const recentDupe = existing.find(
    (n) =>
      n.kind === newNotif.kind &&
      n.title === newNotif.title &&
      Date.now() - new Date(n.createdAtISO).getTime() < 60_000
  );
  if (recentDupe) return recentDupe;
  const updated = [newNotif, ...existing].slice(0, MAX_NOTIFICATIONS);
  saveStore({ ...store, notifications: updated });
  window.dispatchEvent(new CustomEvent("uma-notification-added"));
  return newNotif;
}

/** Mark a notification as read. */
export function markNotificationRead(id: string): void {
  if (typeof window === "undefined") return;
  const store = getStore();
  const notifications = (store.notifications ?? []).map((n) =>
    n.id === id ? { ...n, readAtISO: new Date().toISOString() } : n
  );
  saveStore({ ...store, notifications });
}

/** Mark all notifications as read. */
export function markAllNotificationsRead(): void {
  if (typeof window === "undefined") return;
  const store = getStore();
  const readAt = new Date().toISOString();
  const notifications = (store.notifications ?? []).map((n) =>
    n.readAtISO ? n : { ...n, readAtISO: readAt }
  );
  saveStore({ ...store, notifications });
}

/** Dismiss (delete) a single notification. */
export function dismissNotification(id: string): void {
  if (typeof window === "undefined") return;
  const store = getStore();
  saveStore({ ...store, notifications: (store.notifications ?? []).filter((n) => n.id !== id) });
}

/** Delete a set of notifications by id. */
export function deleteNotifications(ids: Set<string>): void {
  if (typeof window === "undefined") return;
  const store = getStore();
  saveStore({ ...store, notifications: (store.notifications ?? []).filter((n) => !ids.has(n.id)) });
}

/** Mark a set of notifications as read by id. */
export function markNotificationsRead(ids: Set<string>): void {
  if (typeof window === "undefined") return;
  const store = getStore();
  const readAt = new Date().toISOString();
  const notifications = (store.notifications ?? []).map((n) =>
    ids.has(n.id) ? { ...n, readAtISO: readAt } : n
  );
  saveStore({ ...store, notifications });
}

/** Mark a set of notifications as unread by id. */
export function markNotificationsUnread(ids: Set<string>): void {
  if (typeof window === "undefined") return;
  const store = getStore();
  const notifications = (store.notifications ?? []).map((n) =>
    ids.has(n.id) ? { ...n, readAtISO: undefined } : n
  );
  saveStore({ ...store, notifications });
}

/* ─── Auto-mode adherence helper ─────────────────────────── */

/**
 * For each medication in `auto` tracking mode, auto-log a "taken" entry for today
 * if no log entry (taken/missed/skipped/extra) has been recorded for that med today.
 * Should be called once per day (on app open; the runner deduplicates via date).
 */
export function autoLogTodayDoses(): void {
  if (typeof window === "undefined") return;
  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  const store = getStore();
  const hl = normalizeHealthLogs(store.healthLogs);

  const autoMeds = (store.meds ?? []).filter((m) => m.trackingMode === "auto");
  if (!autoMeds.length) return;

  const existingTodayNames = new Set(
    hl.medicationIntake
      .filter((e) => e.loggedAtISO.startsWith(today))
      .map((e) => e.medicationName.trim().toLowerCase())
  );

  const newEntries: import("@/lib/types").MedicationIntakeLogEntry[] = [];
  for (const med of autoMeds) {
    const key = med.name.trim().toLowerCase();
    if (existingTodayNames.has(key)) continue; // already logged today
    newEntries.push({
      id: `auto_${today}_${key.replace(/\s+/g, "_").slice(0, 30)}_${Math.random().toString(36).slice(2, 6)}`,
      loggedAtISO: `${today}T08:00:00.000Z`,
      medicationName: med.name.trim(),
      action: "taken",
      notes: "Auto-logged (auto tracking mode)",
    });
  }

  if (!newEntries.length) return;
  saveStore({
    ...store,
    healthLogs: {
      ...hl,
      medicationIntake: [...newEntries, ...hl.medicationIntake],
    },
  });
}

// ─── Live store hook ──────────────────────────────────────────────────────────

const SSE_URL = "/api/patient-store/stream";
const BACKOFF_INIT_MS = 1_000;
const BACKOFF_MAX_MS = 30_000;
const JITTER = 0.2;
const POLL_FALLBACK_MS = 30_000;

function jittered(ms: number): number {
  return ms * (1 + (Math.random() * 2 - 1) * JITTER);
}

/**
 * Subscribes to the SSE stream at `/api/patient-store/stream` and returns
 * the current `PatientStore` from `localStorage`, refreshed whenever the
 * server fires a NOTIFY for this user.
 *
 * Reconnects with exponential backoff (1s start, 30s cap, ±20% jitter).
 * Falls back to a 30-second polling interval when the EventSource fails
 * repeatedly (e.g. server-side rendering or network loss).
 */
export function useLivePatientStore(): PatientStore {
  const [store, setStore] = useState<PatientStore>(() => getStore());

  useEffect(() => {
    let es: EventSource | null = null;
    let backoff = BACKOFF_INIT_MS;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let destroyed = false;

    function refresh() {
      setStore(getStore());
    }

    function startPollFallback() {
      if (pollTimer) return;
      pollTimer = setInterval(refresh, POLL_FALLBACK_MS);
    }

    function connect() {
      if (destroyed) return;
      es = new EventSource(SSE_URL);

      es.onmessage = (evt) => {
        if (evt.data === "connected" || !evt.data) return;
        backoff = BACKOFF_INIT_MS; // successful message → reset backoff
        refresh();
      };

      es.onerror = () => {
        es?.close();
        es = null;
        if (destroyed) return;
        const delay = jittered(backoff);
        backoff = Math.min(backoff * 2, BACKOFF_MAX_MS);
        if (backoff >= BACKOFF_MAX_MS) startPollFallback();
        reconnectTimer = setTimeout(connect, delay);
      };
    }

    connect();

    return () => {
      destroyed = true;
      es?.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (pollTimer) clearInterval(pollTimer);
    };
  }, []);

  return store;
}
