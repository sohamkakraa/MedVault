/**
 * UMA Mobile — Zustand Store
 *
 * Replaces the web app's localStorage-based store with a reactive
 * Zustand store backed by encrypted MMKV. Provides the same
 * merge/dedup logic as the web app's store.ts.
 *
 * Key differences from web:
 *  - Reactive (components re-render on state change)
 *  - Encrypted at rest via MMKV encryption
 *  - Includes wearable data and agent conversation state
 *  - Sync engine pushes encrypted snapshots to Supabase
 */

import { create } from "zustand";
import { MMKV } from "react-native-mmkv";
import type {
  PatientStore,
  ExtractedDoc,
  ExtractedMedication,
  ExtractedLab,
  DailyWearableSummary,
  AgentMessage,
} from "./types";

/* ─── Encrypted local persistence ────────────────────────────── */

const storage = new MMKV({
  id: "uma-patient-store",
  encryptionKey: "uma-store-v1",
});

const STORE_KEY = "mv_patient_store_v1";

function loadPersistedStore(): PatientStore {
  const raw = storage.getString(STORE_KEY);
  if (raw) {
    try {
      return JSON.parse(raw) as PatientStore;
    } catch {
      /* corrupted — fall through to default */
    }
  }
  return createDefaultStore();
}

function createDefaultStore(): PatientStore {
  return {
    docs: [],
    meds: [],
    labs: [],
    profile: {
      allergies: [],
      conditions: [],
      trends: ["HbA1c", "LDL", "HDL", "Glucose"],
    },
    preferences: { theme: "system" },
    updatedAtISO: new Date().toISOString(),
  };
}

/* ─── Dedup helpers (mirrors web store.ts logic) ─────────────── */

function dedupMeds(existing: ExtractedMedication[], incoming: ExtractedMedication[]): ExtractedMedication[] {
  const map = new Map<string, ExtractedMedication>();
  for (const m of existing) map.set(m.name.toLowerCase(), m);
  for (const m of incoming) map.set(m.name.toLowerCase(), m); // latest wins
  return Array.from(map.values());
}

function dedupLabs(existing: ExtractedLab[], incoming: ExtractedLab[]): ExtractedLab[] {
  const seen = new Set<string>();
  const result: ExtractedLab[] = [];
  const all = [...existing, ...incoming];
  for (const l of all) {
    const key = `${l.name}|${l.date}|${l.value}|${l.unit ?? ""}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(l);
    }
  }
  return result;
}

function unionStrings(a: string[], b: string[]): string[] {
  return Array.from(new Set([...a, ...b]));
}

/* ─── Store definition ───────────────────────────────────────── */

interface UmaStore extends PatientStore {
  /** Wearable summaries (last 30 days, local cache) */
  wearableSummaries: DailyWearableSummary[];

  /** Chat conversation history */
  chatMessages: AgentMessage[];

  /** Whether the store has been hydrated from disk */
  hydrated: boolean;

  /* ── Actions ───────────────────────────────────────────── */

  /** Hydrate store from encrypted MMKV */
  hydrate: () => void;

  /** Merge an extracted document (same logic as web) */
  mergeDoc: (doc: ExtractedDoc) => void;

  /** Remove a document by ID */
  removeDoc: (id: string) => void;

  /** Update profile fields */
  updateProfile: (patch: Partial<PatientStore["profile"]>) => void;

  /** Set theme preference */
  setTheme: (theme: "dark" | "light" | "system") => void;

  /** Append wearable daily summaries */
  appendWearableSummaries: (summaries: DailyWearableSummary[]) => void;

  /** Add a chat message */
  addChatMessage: (msg: AgentMessage) => void;

  /** Clear chat history */
  clearChat: () => void;

  /** Full store replacement (from server sync) */
  replaceStore: (store: PatientStore) => void;

  /** Get a serialisable snapshot for sync */
  getSnapshot: () => PatientStore;
}

export const useStore = create<UmaStore>((set, get) => ({
  /* ── Default state ─────────────────────────────────────── */
  ...createDefaultStore(),
  wearableSummaries: [],
  chatMessages: [],
  hydrated: false,

  /* ── Hydrate from disk ─────────────────────────────────── */
  hydrate: () => {
    const persisted = loadPersistedStore();
    set({ ...persisted, hydrated: true });
  },

  /* ── Merge document ────────────────────────────────────── */
  mergeDoc: (doc) => {
    set((state) => {
      const existingIdx = state.docs.findIndex((d) => d.id === doc.id);
      const docs = existingIdx >= 0
        ? state.docs.map((d, i) => (i === existingIdx ? doc : d))
        : [doc, ...state.docs];

      const meds = dedupMeds(state.meds, doc.medications);
      const labs = dedupLabs(state.labs, doc.labs);
      const allergies = unionStrings(state.profile.allergies, doc.allergies);
      const conditions = unionStrings(state.profile.conditions, doc.conditions);

      const next = {
        docs,
        meds,
        labs,
        profile: { ...state.profile, allergies, conditions },
        updatedAtISO: new Date().toISOString(),
      };

      persist(get(), next);
      return next;
    });
  },

  /* ── Remove document ───────────────────────────────────── */
  removeDoc: (id) => {
    set((state) => {
      const next = {
        docs: state.docs.filter((d) => d.id !== id),
        updatedAtISO: new Date().toISOString(),
      };
      persist(get(), next);
      return next;
    });
  },

  /* ── Update profile ────────────────────────────────────── */
  updateProfile: (patch) => {
    set((state) => {
      const next = {
        profile: { ...state.profile, ...patch },
        updatedAtISO: new Date().toISOString(),
      };
      persist(get(), next);
      return next;
    });
  },

  /* ── Theme ─────────────────────────────────────────────── */
  setTheme: (theme) => {
    set((state) => {
      const next = {
        preferences: { ...state.preferences, theme },
        updatedAtISO: new Date().toISOString(),
      };
      persist(get(), next);
      return next;
    });
  },

  /* ── Wearable summaries ────────────────────────────────── */
  appendWearableSummaries: (summaries) => {
    set((state) => {
      const seen = new Set(state.wearableSummaries.map((s) => s.date));
      const newOnes = summaries.filter((s) => !seen.has(s.date));
      const merged = [...state.wearableSummaries, ...newOnes]
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 90); // Keep 90 days max
      return { wearableSummaries: merged };
    });
  },

  /* ── Chat ──────────────────────────────────────────────── */
  addChatMessage: (msg) => {
    set((state) => ({ chatMessages: [...state.chatMessages, msg] }));
  },

  clearChat: () => set({ chatMessages: [] }),

  /* ── Sync helpers ──────────────────────────────────────── */
  replaceStore: (store) => {
    set({ ...store });
    persist(get(), store);
  },

  getSnapshot: (): PatientStore => {
    const s = get();
    return {
      docs: s.docs,
      meds: s.meds,
      labs: s.labs,
      profile: s.profile,
      preferences: s.preferences,
      updatedAtISO: s.updatedAtISO,
    };
  },
}));

/* ─── Persistence helper ─────────────────────────────────────── */

function persist(full: UmaStore, _patch: Partial<PatientStore>) {
  const snapshot: PatientStore = {
    docs: full.docs,
    meds: full.meds,
    labs: full.labs,
    profile: full.profile,
    preferences: full.preferences,
    updatedAtISO: full.updatedAtISO,
    ..._patch,
  };
  storage.set(STORE_KEY, JSON.stringify(snapshot));
}
