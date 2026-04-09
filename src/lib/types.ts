export type DocType = "Lab report" | "Prescription" | "Bill" | "Imaging" | "Other";

/** Synthetic labs from legacy rows not tied to a document (e.g. old demo data). */
export const UMA_TRACKER_LAB_SOURCE = "__uma_tracker__" as const;

/** User- or agent-proposed metric synonyms merged into the runtime lexicon (see `docs/standardized.md`). */
export type StandardLexiconEntry = {
  canonical: string;
  synonyms: string[];
  panel?: string;
};

export type ExtractedMedication = {
  name: string;
  dose?: string;
  frequency?: string;
  route?: string;
  startDate?: string;
  endDate?: string;
  notes?: string; // adherence notes or med-specific notes
  stockCount?: number;
  missedDoses?: number;
  lastMissedISO?: string;
  /** Set when this row was derived from a document during rebuild. */
  sourceDocId?: string;
};

export type ExtractedLab = {
  name: string;
  value: string;
  unit?: string;
  refRange?: string;
  date?: string;
  /** Document id, or `UMA_TRACKER_LAB_SOURCE` for demo tracker rows. */
  sourceDocId?: string;
};

export type ExtractedSection = {
  title: string;
  items: string[];
};

export type ExtractedDoc = {
  id: string;
  type: DocType;
  title: string;
  dateISO?: string;
  provider?: string;
  summary: string;
  medications?: ExtractedMedication[];
  labs?: ExtractedLab[];
  tags?: string[];
  allergies?: string[];
  conditions?: string[];
  sections?: ExtractedSection[];
  /** Original PDF filename from upload. */
  originalFileName?: string;
  /** When the file was processed in UMA (ISO timestamp). */
  uploadedAtISO?: string;
  /** SHA-256 of normalized extracted text — duplicate detection. */
  contentHash?: string;
  /** Generated markdown artifact (same idea as a per-document `.md` file). */
  markdownArtifact?: string;
  /** Stable display slug, e.g. `bloodReport_23_03_2026`. */
  artifactSlug?: string;
  doctors?: string[];
  facilityName?: string;
  /** Base64-encoded original PDF (saved when confirming an upload from this device). */
  originalPdfBase64?: string;
};

/** Optional vitals for charts and visit summaries (strings for flexible local formats). */
export type BodyMetrics = {
  heightCm?: string;
  weightKg?: string;
  waistCm?: string;
  bloodPressureSys?: string;
  bloodPressureDia?: string;
};

/**
 * Beta cycle logging — stored locally. Not a medical device.
 * Shown on profile for all users during beta; refine by sex later if needed.
 */
export type MenstrualCyclePrefs = {
  /** Typical cycle length in days (21–45 clamped in UI logic). */
  typicalCycleLengthDays?: number;
  /** First day of last period (YYYY-MM-DD). */
  lastPeriodStartISO?: string;
  /** Calendar days when flow was logged (YYYY-MM-DD). */
  flowLogDates?: string[];
};

export type PatientStore = {
  docs: ExtractedDoc[];
  meds: ExtractedMedication[]; // “current list” – built from confirmed docs + manual updates later
  labs: ExtractedLab[];
  profile: {
    name: string;
    firstName?: string;
    lastName?: string;
    dob?: string;
    sex?: string;
    email?: string;
    phone?: string;
    countryCode?: string;
    primaryCareProvider?: string;
    nextVisitDate?: string;
    trends?: string[];
    allergies: string[];
    conditions: string[];
    notes?: string;
    bodyMetrics?: BodyMetrics;
    menstrualCycle?: MenstrualCyclePrefs;
  };
  preferences: {
    /** `system` follows the device light/dark preference. */
    theme: "dark" | "light" | "system";
    /** First-run wizard after OTP sign-in (local device only). */
    onboarding?: {
      completedAtISO?: string;
      lastStepReached?: 1 | 2;
    };
  };
  /** Merged with `DEFAULT_LEXICON` for resolving lab keys and charts. */
  standardLexicon?: StandardLexiconEntry[];
  updatedAtISO: string;
};
