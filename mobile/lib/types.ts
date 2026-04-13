/**
 * UMA Mobile — Shared Type Definitions
 *
 * Re-exports core types from the web app and extends them with
 * mobile-specific types for wearables, agents, and on-device AI.
 *
 * NOTE: Core types (PatientStore, ExtractedDoc, ExtractedLab, etc.)
 * are imported from @shared/types when the monorepo is linked.
 * For now they are re-declared here to avoid build coupling until
 * we publish a shared package.
 */

/* ─── Re-declared core types (mirrors ../src/lib/types.ts) ────── */

export type DocType =
  | "Lab report"
  | "Prescription"
  | "Bill"
  | "Imaging"
  | "Other";

export type MedicationLineSource = "prescription_document" | "other_document" | "manual_entry";
export type MedicationProductCategory = "over_the_counter" | "supplement" | "unspecified";
export type MedicationProductCategorySource = "auto" | "user";

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

export interface ExtractedMedication {
  name: string;
  dose?: string;
  doseAmountStandard?: number;
  doseStandardUnit?: string;
  doseDimension?: MedDoseDimension;
  doseUserEnteredLabel?: string;
  frequency?: string;
  usualTimeLocalHHmm?: string;
  route?: string;
  startDate?: string;
  endDate?: string;
  stockCount?: number;
  missedDoses?: number;
  lastMissedISO?: string;
  notes?: string;
  sourceDocId?: string;
  medicationLineSource?: MedicationLineSource;
  medicationProductCategory?: MedicationProductCategory;
  medicationProductCategorySource?: MedicationProductCategorySource;
  medicationForm?: MedicationFormKind;
  medicationFormOther?: string;
}

export interface HealthLogsBundle {
  bloodPressure: Array<{
    id: string;
    loggedAtISO: string;
    systolic: number;
    diastolic: number;
    pulseBpm?: number;
    notes?: string;
  }>;
  medicationIntake: Array<{
    id: string;
    loggedAtISO: string;
    medicationName: string;
    action: "taken" | "skipped" | "missed" | "extra";
    notes?: string;
    doseAmountStandard?: number;
    doseStandardUnit?: string;
    doseUserEnteredLabel?: string;
  }>;
  sideEffects: Array<{
    id: string;
    loggedAtISO: string;
    description: string;
    relatedMedicationName?: string;
    intensity?: "mild" | "moderate" | "strong" | "unspecified";
  }>;
  medicationReminders: Array<{
    id: string;
    medicationName: string;
    timeLocalHHmm: string;
    repeatDaily: boolean;
    remindOnceAtISO?: string;
    enabled: boolean;
    createdAtISO: string;
    notes?: string;
  }>;
}

export interface ExtractedLab {
  name: string;
  value: string;
  unit?: string;
  refRange?: string;
  date: string;
  sourceDocId?: string;
}

export interface DocSection {
  title: string;
  items: string[];
}

export interface ExtractedDoc {
  id: string;
  type: DocType;
  title: string;
  dateISO: string;
  provider?: string;
  summary: string;
  markdownArtifact?: string;
  medications: ExtractedMedication[];
  labs: ExtractedLab[];
  tags: string[];
  allergies: string[];
  conditions: string[];
  doctors?: string[];
  facilityName?: string;
  sections: DocSection[];
  originalFileName?: string;
  uploadedAtISO?: string;
  contentHash?: string;
  originalPdfBase64?: string;
  artifactSlug?: string;
}

export interface BodyMetrics {
  heightCm?: string;
  weightKg?: string;
  waistCm?: string;
  bloodPressureSys?: string;
  bloodPressureDia?: string;
}

export interface PatientProfile {
  name?: string;
  firstName?: string;
  lastName?: string;
  dob?: string;
  sex?: string;
  email?: string;
  phone?: string;
  countryCode?: string;
  primaryCareProvider?: string;
  nextVisitDate?: string;
  allergies: string[];
  conditions: string[];
  trends: string[];
  bodyMetrics?: BodyMetrics;
  notes?: string;
}

export interface PatientStore {
  docs: ExtractedDoc[];
  meds: ExtractedMedication[];
  labs: ExtractedLab[];
  /** Optional for older mobile snapshots; web always sends this. */
  healthLogs?: HealthLogsBundle;
  profile: PatientProfile;
  preferences: {
    theme: "dark" | "light" | "system";
    onboarding?: {
      completedAtISO?: string;
      lastStepReached?: 1 | 2;
    };
  };
  updatedAtISO: string;
}

/* ─── Mobile-only types ──────────────────────────────────────── */

/** Wearable health metric data point */
export interface WearableDataPoint {
  timestamp: string; // ISO 8601
  value: number;
  unit: string;
  source: "apple_health" | "health_connect" | "manual";
}

export interface StepData extends WearableDataPoint {
  unit: "steps";
}

export interface HeartRateData extends WearableDataPoint {
  unit: "bpm";
}

export interface SleepData {
  startISO: string;
  endISO: string;
  durationMinutes: number;
  stages?: {
    deep: number;
    light: number;
    rem: number;
    awake: number;
  };
  source: "apple_health" | "health_connect" | "manual";
}

export interface SpO2Data extends WearableDataPoint {
  unit: "%";
}

export interface ActiveEnergyData extends WearableDataPoint {
  unit: "kcal";
}

export interface DailyWearableSummary {
  date: string; // YYYY-MM-DD
  steps: number;
  avgHeartRate?: number;
  restingHeartRate?: number;
  sleepDurationMinutes?: number;
  sleepQuality?: "poor" | "fair" | "good" | "excellent";
  activeEnergyKcal?: number;
  avgSpO2?: number;
}

/** Date range for querying wearable data */
export interface DateRange {
  startISO: string;
  endISO: string;
}

/* ─── Agent types ────────────────────────────────────────────── */

export type AgentId =
  | "health-companion"
  | "report-explainer"
  | "routine-analyzer"
  | "medication-tracker"
  | "wearable-insights";

export type AgentRuntime = "cloud" | "on-device";

export interface AgentMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  agentId?: AgentId;
  timestamp: string;
  metadata?: {
    /** Agent asked a clarifying question — waiting for user reply */
    needsClarification?: boolean;
    /** Sources cited in the response */
    citations?: string[];
    /** Confidence level (agents should be transparent about uncertainty) */
    confidence?: "high" | "medium" | "low";
    /** Suggestion to consult a professional */
    consultDoctor?: boolean;
  };
}

export interface AgentContext {
  store: PatientStore;
  recentWearables: DailyWearableSummary[];
  conversationHistory: AgentMessage[];
  userTimezone: string;
}

export interface AgentResponse {
  message: string;
  agentId: AgentId;
  needsClarification?: boolean;
  citations?: string[];
  confidence?: "high" | "medium" | "low";
  consultDoctor?: boolean;
  /** Proposed actions (e.g., save document, set reminder) */
  actions?: AgentAction[];
}

export type AgentAction =
  | { type: "save_document"; doc: ExtractedDoc }
  | { type: "set_reminder"; medication: string; time: string }
  | { type: "log_checkin"; mood: string; notes?: string }
  | { type: "navigate"; screen: string }
  | { type: "ask_clarification"; question: string };

/* ─── Encryption types ───────────────────────────────────────── */

export interface EncryptedBlob {
  ciphertext: string; // base64-encoded
  iv: string;         // base64-encoded initialisation vector
  tag: string;        // base64-encoded auth tag
  version: 1;         // schema version for future migration
}

/* ─── Notification types ─────────────────────────────────────── */

export type NotificationType =
  | "medication_reminder"
  | "injection_due"
  | "wellness_checkin"
  | "appointment_reminder"
  | "lab_anomaly"
  | "wearable_alert";

export interface ScheduledNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  scheduledISO: string;
  recurring?: {
    interval: "daily" | "weekly" | "monthly";
    times: string[]; // HH:mm format
  };
}
