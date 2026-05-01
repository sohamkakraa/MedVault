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

/**
 * How adherence is tracked for a medication.
 * - `manual`: user explicitly logs every dose (taken / missed / skipped).
 * - `auto`:   app assumes "taken" each due dose; user only logs when they MISS or skip.
 *             A daily job auto-creates "taken" entries for all due doses not yet overridden.
 */
export type MedicationTrackingMode = "manual" | "auto";

export type ExtractedMedication = {
  name: string;
  /**
   * Adherence tracking mode for this medication.
   * Defaults to "manual" if not set so existing data is unchanged.
   */
  trackingMode?: MedicationTrackingMode;
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

/**
 * Interval-based reminder — fires every `intervalMinutes` within a daily
 * time window. Used for water reminders, exercise nudges, etc.
 */
export type IntervalReminderEntry = {
  id: string;
  label: string;
  intervalMinutes: number;
  windowStartHHmm: string;
  windowEndHHmm: string;
  /** ml per event — used to compute daily intake totals */
  bottleMl?: number;
  enabled: boolean;
  createdAtISO: string;
  /** Only honour on the calendar day of creation — skip until this time */
  startingFromHHmm?: string;
  /** ISO string of the last time the cron fired this reminder */
  lastFiredAtISO?: string;
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

/**
 * General-purpose reminder — covers one-time, daily, weekly, and interval
 * recurrences. Replaces the narrower IntervalReminderEntry for new reminders;
 * legacy IntervalReminderEntry records are preserved for backward compat.
 */
export type GeneralReminderRecurrence = "once" | "daily" | "weekly" | "interval";

export type GeneralReminderEntry = {
  id: string;
  label: string;
  recurrence: GeneralReminderRecurrence;
  enabled: boolean;
  createdAtISO: string;
  lastFiredAtISO?: string;
  // "once" — fire at a specific moment
  triggerAtISO?: string;
  // "daily" — every day at a specific time
  dailyTimeHHmm?: string;
  // "weekly" — specific days of the week (0=Sun … 6=Sat)
  weekdays?: number[];
  weeklyTimeHHmm?: string;
  // "interval" — periodic within a daily window
  intervalMinutes?: number;
  windowStartHHmm?: string;
  windowEndHHmm?: string;
  /** On the creation day: don't fire before this time */
  startingFromHHmm?: string;
  // Optional extras
  /** ml per event — for hydration tracking */
  amountMl?: number;
  notes?: string;
};

export type HealthLogsBundle = {
  bloodPressure: BloodPressureLogEntry[];
  medicationIntake: MedicationIntakeLogEntry[];
  sideEffects: SideEffectLogEntry[];
  medicationReminders: MedicationReminderEntry[];
  intervalReminders?: IntervalReminderEntry[];
  generalReminders?: GeneralReminderEntry[];
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

/**
 * Which extractor handled the primary PDF parsing step.
 * - "llamaparse" : LlamaParse did OCR/layout; Claude structured it from text (cheaper).
 * - "claude_pdf" : Claude handled the raw PDF directly via document block (full cost).
 */
export type ExtractorSource = "llamaparse" | "claude_pdf";

/** Token and cost breakdown for a single PDF extraction via Anthropic. */
export type ExtractionCost = {
  inputTokens: number;
  outputTokens: number;
  /** Total cost in USD for this extraction. */
  totalUSD: number;
  /** Model used for this extraction, e.g. "claude-sonnet-4-5-20250929". */
  model: string;
  /** Which extractor did the primary PDF parsing. */
  extractorSource?: ExtractorSource;
  /** LlamaParse credits consumed (3 per page in cost-effective mode). 0 if Claude did full PDF. */
  llamaParseCredits?: number;
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
  /** Token usage and cost for this extraction (only present when extracted via Anthropic). */
  extractionCost?: ExtractionCost;
  /** Which primary extractor was used (llamaparse or claude_pdf). */
  extractorSource?: ExtractorSource;
};

/** A single entry in the cumulative usage log (stored in localStorage). */
export type UsageLogEntry = {
  id: string;
  timestampISO: string;
  kind: "pdf_extraction" | "chat_message";
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalUSD: number;
  /** For pdf_extraction: the document title. For chat_message: first 60 chars of user message. */
  label: string;
};

/**
 * Dashboard widget identifiers. Adding a new widget means:
 *  1) add its id here,
 *  2) teach `renderWidget()` in the dashboard page how to render it,
 *  3) add a label + description entry to `DASHBOARD_WIDGET_META` in
 *     `src/lib/dashboardLayout.ts`.
 */
export type DashboardWidgetId =
  | "snapshot"
  | "documents"
  | "medications"
  | "bloodPressure"
  | "sideEffects"
  | "healthTrends"
  | "labs"
  | "bmi";

export type BentoSize = "hero" | "large" | "medium" | "small" | "micro";

/** One row of the dashboard grid: 1–3 widgets rendered side-by-side. */
export type DashboardRow = {
  id: string;
  widgets: DashboardWidgetId[];
};

export type DashboardLayout = {
  rows: DashboardRow[];
  /** Widgets the user has removed — available to re-add from the palette. */
  hidden: DashboardWidgetId[];
  /** Per-widget bento size. Falls back to DEFAULT_BENTO_SIZES when absent. */
  sizes?: Partial<Record<DashboardWidgetId, BentoSize>>;
};

/** Optional vitals for charts and visit summaries (strings for flexible local formats). */
export type BodyMetrics = {
  heightCm?: string;
  weightKg?: string;
  waistCm?: string;
  bloodPressureSys?: string;
  bloodPressureDia?: string;
  /** Display unit for height input; values are stored as SI in `heightCm`. Default cm. */
  heightUnit?: "cm" | "in";
  /** Display unit for weight; stored as SI in `weightKg`. Default kg. */
  weightUnit?: "kg" | "lb";
  /** Display unit for waist; stored as SI in `waistCm`. Default cm. */
  waistUnit?: "cm" | "in";
};

export type FamilyRelation =
  | "self"
  | "mother"
  | "father"
  | "spouse"
  | "husband"
  | "wife"
  | "brother"
  | "sister"
  | "grandfather"
  | "grandmother"
  | "son"
  | "daughter"
  | "child"
  | "other";

export const FAMILY_RELATION_LABELS: Record<FamilyRelation, string> = {
  self: "Myself",
  mother: "Mother",
  father: "Father",
  spouse: "Spouse",
  husband: "Husband",
  wife: "Wife",
  brother: "Brother",
  sister: "Sister",
  grandfather: "Grandfather",
  grandmother: "Grandmother",
  son: "Son",
  daughter: "Daughter",
  child: "Child",
  other: "Other",
};

export type FamilyMemberMeta = {
  id: string;
  relation: FamilyRelation;
  /** Short display name chosen by the account holder (nickname / "Mum", "Dad" etc.) */
  displayName: string;
  /** ISO timestamp member was added */
  addedAtISO: string;
  /** Stable UUID assigned at creation. Hidden from UI. Used as target for cross-account requests. */
  internalId?: string;
  /** Full legal name — optional, shown in tree and used for connection requests */
  fullName?: string;
  /** Email address linked to their own UMA account (if any) */
  linkedEmail?: string;
  /** Phone number for this family member (for future WhatsApp / SMS linking) */
  linkedPhone?: string;
};

/**
 * Cycle tracking — stored locally. Not a medical device.
 * Only shown when profile.sex === "Female".
 */
export type MenstrualCyclePrefs = {
  /** Typical cycle length in days (21–45 clamped in UI logic). Default 28. */
  typicalCycleLengthDays?: number;
  /** Typical period (bleed) length in days (1–10). Default 5. */
  periodLengthDays?: number;
  /** First day of last period (YYYY-MM-DD). */
  lastPeriodStartISO?: string;
  /** Calendar days when flow was logged (YYYY-MM-DD). */
  flowLogDates?: string[];
};

/**
 * An in-app notification shown in the notification center bell.
 * Notifications are local-only and stored in PatientStore.
 */
export type UmaNotificationKind =
  | "med_reminder"       // a scheduled medication is due or overdue
  | "med_missed_auto"    // auto-mode: a dose was auto-logged but later overridden to missed
  | "lab_uploaded"       // a new lab report was added
  | "doc_uploaded"       // a new document was added
  | "cycle_period_soon"  // period predicted within 2 days (female users)
  | "cycle_fertile"      // fertile window starts today (female users)
  | "next_visit"         // upcoming scheduled visit within 3 days
  | "family_risk_flag"   // a heritable condition was detected in the family graph
  | "generic";           // catch-all

export type UmaNotification = {
  id: string;
  kind: UmaNotificationKind;
  title: string;
  body: string;
  createdAtISO: string;
  readAtISO?: string;
  /** Optional deep-link within the app, e.g. "/dashboard" or "/chat". */
  actionHref?: string;
  /** Label for the action button if actionHref is set. */
  actionLabel?: string;
};

/** Visibility setting for a linked family member connection */
export type FamilyLinkVisibility = "full" | "conditions_only" | "none";

/** A pending or accepted cross-account family connection request */
export type FamilyConnectionRequest = {
  id: string;
  /** ISO timestamp */
  createdAtISO: string;
  /** The account that sent the request */
  fromAccountEmail: string;
  fromAccountName: string;
  /** The account being invited */
  toAccountEmail: string;
  /** How the sender relates to the recipient (from the sender's perspective) */
  senderRelation: FamilyRelation;
  /** How the recipient relates to the sender (mirror/inverse) */
  recipientRelation: FamilyRelation;
  status: "pending" | "accepted" | "rejected";
  respondedAtISO?: string;
  /** What the recipient is allowed to see about the sender (set by sender) */
  senderVisibility: FamilyLinkVisibility;
  /** What the sender is allowed to see about the recipient (set by recipient on accept) */
  recipientVisibility?: FamilyLinkVisibility;
  /** internalId of the specific sub-profile this request targets (may be absent for legacy requests) */
  toInternalId?: string;
  /** internalId of the specific sub-profile this request comes from */
  fromInternalId?: string;
};

/** A confirmed cross-account family link (stored on both sides after accept) */
export type FamilyLink = {
  id: string; // same as FamilyConnectionRequest.id
  linkedAccountEmail: string;
  linkedAccountName: string;
  relation: FamilyRelation;
  /** What this account allows the linked person to see */
  myVisibility: FamilyLinkVisibility;
  linkedAtISO: string;
  /** Shared conditions (populated when visibility allows, refreshed on each view) */
  sharedConditions?: string[];
  sharedAllergies?: string[];
  /** internalId of the linked sub-profile (for sub-profile disambiguation) */
  linkedInternalId?: string;
  linkedDisplayName?: string;
};

export type PatientStore = {
  docs: ExtractedDoc[];
  meds: ExtractedMedication[]; // "current list" – built from confirmed docs + manual updates later
  labs: ExtractedLab[];
  /** Time-stamped vitals and notes you choose to record. */
  healthLogs: HealthLogsBundle;
  /** In-app notifications (most recent first, capped at 100). */
  notifications?: UmaNotification[];
  profile: {
    name: string;
    firstName?: string;
    lastName?: string;
    dob?: string;
    sex?: string;
    email?: string;
    phone?: string;
    /** Hidden stable UUID for this account's primary profile. Never displayed in UI. */
    internalId?: string;
    whatsappPhone?: string;
    whatsappVerified?: boolean;
    whatsappVerificationCode?: string;
    whatsappVerificationSentAt?: string;
    /** Opt-in for proactive WhatsApp push notifications from UMA. */
    whatsappNotifications?: boolean;
    countryCode?: string;
    primaryCareProvider?: string;
    nextVisitDate?: string;
    /** HH:MM local time for the next doctor appointment */
    nextVisitTime?: string;
    /** Hospital or clinic for the next appointment */
    nextVisitHospital?: string;
    /** Extra doctor names for the quick-pick list (typed or “add to list”). */
    doctorQuickPick?: string[];
    /** Doctor names from files to hide from the quick-pick list (normalized keys). */
    doctorQuickPickHidden?: string[];
    /** Extra hospital / clinic names for the quick-pick list. */
    facilityQuickPick?: string[];
    /** Facility names from files to hide from the quick-pick list (normalized keys). */
    facilityQuickPickHidden?: string[];
    /** Reminders set for the next doctor appointment */
    appointmentReminders?: Array<{ minutesBefore: number; label: string }>;
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
    /**
     * Custom dashboard grid layout. Each row holds 1–3 widgets that auto-resize
     * to fill the row; empty rows are pruned on save. `hidden` lists widgets the
     * user has removed but can re-add from the palette in edit mode. When
     * undefined, the default layout (see `DEFAULT_DASHBOARD_LAYOUT`) is used.
     */
    dashboardLayout?: DashboardLayout;
  };
  /** Merged with `DEFAULT_LEXICON` for resolving lab keys and charts. */
  standardLexicon?: StandardLexiconEntry[];
  updatedAtISO: string;
  /** Family members added to this account. Each has their own isolated store. */
  familyMembers?: FamilyMemberMeta[];
  /** ID of the family member currently being viewed ("self" = primary account holder). */
  activeFamilyMemberId?: string;
  /** Cross-account family links (connections between different user accounts). */
  familyLinks?: FamilyLink[];
  /** Pending and accepted cross-account family connection requests. */
  pendingFamilyRequests?: FamilyConnectionRequest[];
};
