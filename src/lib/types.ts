export type DocType = "Lab report" | "Prescription" | "Bill" | "Imaging" | "Other";

/**
 * A clickable chip the chat UI renders beneath an assistant message.
 * Either `action` (client-side, no round-trip) or `sendText` (pre-fills + sends a message) must be set.
 */
export type ChatQuickReply = {
  label: string;
  emoji?: string;
  /** Execute immediately in the browser without a new LLM round-trip. */
  action?:
    | { type: "set_reminder"; medName: string; timeHHmm: string; repeatDaily: boolean }
    | { type: "pick_time"; medName: string }
    | { type: "dismiss" };
  /** Pre-fill the input and send this text as a new user message instead. */
  sendText?: string;
};

/** Synthetic labs from legacy rows not tied to a document (e.g. tracker-only entries). */
export const UMA_TRACKER_LAB_SOURCE = "__uma_tracker__" as const;

/** User- or agent-proposed metric synonyms merged into the runtime lexicon (see `docs/standardized.md`). */
export type StandardLexiconEntry = {
  canonical: string;
  synonyms: string[];
  panel?: string;
};

/** How this medicine row entered UMA (separate from OTC vs supplement guess). */
export type MedicationLineSource = "prescription_document" | "other_document" | "manual_entry";

/** Best-effort product grouping; not a regulatory label. */
export type MedicationProductCategory = "over_the_counter" | "supplement" | "unspecified";

export type MedicationProductCategorySource = "auto" | "user";

/** How the medicine is physically taken or applied (user-chosen; not a regulatory dose form). */
export type MedicationFormKind =
  | "unspecified"
  | "pill"
  | "tablet"
  | "capsule"
  | "liquid"
  | "injection"
  | "ointment"
  | "cream"
  | "gel"
  | "patch"
  | "inhaler"
  | "spray"
  | "drops"
  | "powder"
  | "suppository"
  | "device"
  | "other";

export type MedDoseDimension = "mass" | "volume" | "iu" | "count";

export type ExtractedMedication = {
  name: string;
  /** Canonical dose text (standard unit), e.g. "500 mg" or "2 tablets". */
  dose?: string;
  /** Numeric amount in `doseStandardUnit` (mg, mL, IU, or count for tablets etc.). */
  doseAmountStandard?: number;
  doseStandardUnit?: string;
  doseDimension?: MedDoseDimension;
  /** What the user typed with their chosen unit, e.g. "0.5 g", for a smaller subtitle when converted. */
  doseUserEnteredLabel?: string;
  frequency?: string;
  /** Optional wall-clock time (HH:mm) the user usually takes this dose — dashboard + reminders. */
  usualTimeLocalHHmm?: string;
  route?: string;
  startDate?: string;
  endDate?: string;
  notes?: string; // adherence notes or med-specific notes
  stockCount?: number;
  missedDoses?: number;
  lastMissedISO?: string;
  /** Set when this row was derived from a document during rebuild. */
  sourceDocId?: string;
  /** Prescription PDF vs other file vs typed in by the user. */
  medicationLineSource?: MedicationLineSource;
  /** OTC / supplement guess or your manual choice. */
  medicationProductCategory?: MedicationProductCategory;
  medicationProductCategorySource?: MedicationProductCategorySource;
  /** Pill, injection, cream, etc. */
  medicationForm?: MedicationFormKind;
  /** When `medicationForm` is `other`, short free text from the user. */
  medicationFormOther?: string;
};

/** Apple Health–style dated logs (local only). Not a medical device. */
export type BloodPressureLogEntry = {
  id: string;
  loggedAtISO: string;
  systolic: number;
  diastolic: number;
  pulseBpm?: number;
  notes?: string;
};

export type MedicationIntakeLogEntry = {
  id: string;
  loggedAtISO: string;
  medicationName: string;
  action: "taken" | "skipped" | "missed" | "extra";
  notes?: string;
  /** Optional amount for this log, stored in the same standard unit as your medicine list. */
  doseAmountStandard?: number;
  doseStandardUnit?: string;
  doseUserEnteredLabel?: string;
};

export type SideEffectLogEntry = {
  id: string;
  loggedAtISO: string;
  description: string;
  relatedMedicationName?: string;
  intensity?: "mild" | "moderate" | "strong" | "unspecified";
};

/** Local-only nudge for a medicine; not a medical device or guaranteed alarm. */
export type MedicationReminderEntry = {
  id: string;
  medicationName: string;
  /** Wall-clock time when `repeatDaily` is true, normalized to "HH:mm" (24h). */
  timeLocalHHmm: string;
  /** Fire at `timeLocalHHmm` every calendar day in the device timezone. */
  repeatDaily: boolean;
  /** When `repeatDaily` is false: single fire at this instant (ISO). */
  remindOnceAtISO?: string;
  enabled: boolean;
  createdAtISO: string;
  notes?: string;
};

export type HealthLogsBundle = {
  bloodPressure: BloodPressureLogEntry[];
  medicationIntake: MedicationIntakeLogEntry[];
  sideEffects: SideEffectLogEntry[];
  medicationReminders: MedicationReminderEntry[];
};

export type ExtractedLab = {
  name: string;
  value: string;
  unit?: string;
  refRange?: string;
  date?: string;
  /** Document id, or `UMA_TRACKER_LAB_SOURCE` for tracker-only rows. */
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
  /** Time-stamped vitals and notes you choose to record. */
  healthLogs: HealthLogsBundle;
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
