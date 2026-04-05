"use client";
import { PatientStore, ExtractedDoc, ExtractedMedication } from "@/lib/types";

const KEY = "mv_patient_store_v1";

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
    name: "Jordan Lee",
    firstName: "Jordan",
    lastName: "Lee",
    dob: "1989-04-19",
    sex: "Female",
    email: "jordan.lee@medvault.local",
    countryCode: "+1",
    phone: "(555) 013-7788",
    primaryCareProvider: "Dr. A. Kumar",
    nextVisitDate: "2026-02-18",
    trends: ["HbA1c", "LDL", "RBC"],
    allergies: ["Penicillin", "Peanuts"],
    conditions: ["Prediabetes", "Hyperlipidemia"],
    notes: "Exercises 3x/week. Prefers evening appointments.",
  },
  preferences: {
    theme: "dark",
    connectedTrackers: [],
  },
  updatedAtISO: new Date().toISOString(),
};

function cloneSeed(): PatientStore {
  return JSON.parse(JSON.stringify(seedStore)) as PatientStore;
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
    const parsed = JSON.parse(raw) as PatientStore;
    return {
      ...cloneSeed(),
      ...parsed,
      profile: { ...seedStore.profile, ...parsed.profile },
      preferences: { ...seedStore.preferences, ...parsed.preferences },
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
}

export function mergeExtractedDoc(doc: ExtractedDoc) {
  const store = getStore();

  // Add doc
  store.docs = [doc, ...store.docs].slice(0, 500);

  // Merge meds (simple “latest wins” dedupe by name)
  const newMeds = doc.medications ?? [];
  const medMap = new Map<string, ExtractedMedication>();
  [...newMeds, ...store.meds].forEach((m) => medMap.set(m.name.toLowerCase(), m));
  store.meds = Array.from(medMap.values()).slice(0, 200);

  // Merge labs (append; dedupe by name+date+value)
  const newLabs = doc.labs ?? [];
  const seen = new Set<string>();
  const combined = [...newLabs, ...store.labs].filter((l) => {
    const key = `${l.name.toLowerCase()}|${l.date ?? ""}|${l.value}|${l.unit ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  store.labs = combined.slice(0, 2000);

  // Merge allergies / conditions from doc-level extraction
  if (doc.allergies?.length) {
    const next = new Set([...(store.profile.allergies ?? []), ...doc.allergies]);
    store.profile.allergies = Array.from(next).slice(0, 200);
  }
  if (doc.conditions?.length) {
    const next = new Set([...(store.profile.conditions ?? []), ...doc.conditions]);
    store.profile.conditions = Array.from(next).slice(0, 200);
  }

  saveStore(store);
  return store;
}

export function removeDoc(docId: string) {
  const store = getStore();
  store.docs = store.docs.filter((d) => d.id !== docId);
  saveStore(store);
  return store;
}
