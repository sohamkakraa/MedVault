"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { DatePicker } from "@/components/ui/DatePicker";
import { TimePicker } from "@/components/ui/TimePicker";
import { DateTimePicker } from "@/components/ui/DateTimePicker";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/Select";
import { AppTopNav } from "@/components/nav/AppTopNav";
import { DashboardHealthLogSection } from "@/components/health/DashboardHealthLogSection";
import { BmiCard } from "@/components/health/BmiCard";
import { DashboardGrid } from "@/components/dashboard/DashboardGrid";
import { DashboardEditToolbar } from "@/components/dashboard/DashboardEditToolbar";
import {
  defaultDashboardLayout,
  normalizeDashboardLayout,
} from "@/lib/dashboardLayout";
import { HealthTrendsSection } from "@/components/labs/HealthTrendsSection";
import { LabReadingTile } from "@/components/labs/LabReadingTile";
import { RecordNoticeToast } from "@/components/ui/RecordNoticeToast";
import { Footer } from "@/components/ui/Footer";
import { getHydrationSafeStore, getStore, saveStore, getHydrationSafeViewingStore, getViewingStore, saveViewingStore, getActiveFamilyMember, setActiveFamilyMember, removeDoc, smartMergeExtractedDoc, rebuildLabsAndMedsFromDocuments, pushNotification } from "@/lib/store";
import { useGlobalUpload } from "@/lib/uploadContext";
import {
  DocType,
  DashboardLayout,
  DashboardWidgetId,
  ExtractionCost,
  ExtractedDoc,
  ExtractedLab,
  ExtractedMedication,
  MedicationFormKind,
  MedicationIntakeLogEntry,
  MedicationProductCategory,
  MedicationReminderEntry,
  StandardLexiconEntry,
} from "@/lib/types";
import { newHealthLogId, normalizeHealthLogs } from "@/lib/healthLogs";
import { describeMedicationReminder, nextReminderFireAt } from "@/lib/medicationReminders";
import {
  applyManualMedicationDefaults,
  inferMedicationProductCategory,
  medicationProductCategoryLabel,
} from "@/lib/medicationClassification";
import {
  MEDICATION_FORM_OPTIONS,
  isMedicationFormKind,
  medicationFormLabel,
} from "@/lib/medicationFormPresets";
import {
  MED_DOSE_USER_UNIT_OPTIONS,
  type MedDoseUserUnit,
  buildDoseFromUserInput,
  formatQtyClean,
  medDosePrimaryLine,
  medDoseSecondaryLine,
  standardUnitToEditorUnit,
} from "@/lib/medicationDoseUnits";
import {
  MED_FREQUENCY_PRESETS,
  type MedFrequencyPresetId,
  frequencyFromPreset,
  matchStoredFrequencyToPreset,
} from "@/lib/medicationFrequencyPresets";
import { displaySummaryForDoc, stripInlineMarkdownForDisplay } from "@/lib/markdownDoc";
import { labMatchesTrendMetric, resolveCanonicalLabName } from "@/lib/standardized";
import { normalizeLabUnitString } from "@/lib/labUnits";
import { summarizeMenstrualCycle } from "@/lib/menstrualCycle";
import { LAB_META, getLabMeta } from "@/lib/labMeta";
import {
  doctorNamesFromDocs,
  facilityNamesFromDocs,
  mergeDoctorQuickPick,
  mergeFacilityQuickPick,
  normPickKey,
} from "@/lib/providerQuickPick";
import { getCanonicalRefRange, interpretLab } from "@/lib/labInterpret";
import {
  Activity,
  AlertTriangle,
  Bell,
  ClipboardList,
  Info,
  FileText,
  FileUp,
  Loader2,
  Pill,
  Plus,
  Trash2,
  User,
  X,
  Droplets,
  Stethoscope,
  ShieldAlert,
  CircleDot,
  ArrowUpRight,
  CheckCircle2,
  Layers,
} from "lucide-react";
import { Combobox } from "@/components/ui/Combobox";

function pf(s?: string | null): string {
  return stripInlineMarkdownForDisplay(s ?? "");
}

function toChartPoints(labs: ExtractedLab[], metricName: string, extensions?: StandardLexiconEntry[]) {
  const filtered = labs
    .filter((l) => labMatchesTrendMetric(l.name, metricName, extensions))
    .map((l) => ({
      date: l.date ?? "",
      value: parseFloat(String(l.value).replace(/[^\d.]/g, "")) || null,
    }))
    .filter((p) => p.value !== null && p.date)
    .sort((a, b) => a.date.localeCompare(b.date));

  return filtered;
}

function toSixMonthSeries(points: Array<{ date: string; value: number | null }>) {
  if (!points.length) return [];
  const withDate = points
    .map((p) => ({ ...p, d: new Date(p.date) }))
    .filter((p) => !Number.isNaN(p.d.getTime()) && typeof p.value === "number")
    .sort((a, b) => a.d.getTime() - b.d.getTime());
  if (!withDate.length) return points;

  const series: Array<{ date: string; value: number | null }> = [];
  const start = new Date(withDate[0].d);
  start.setDate(1);
  const end = new Date(withDate[withDate.length - 1].d);
  end.setDate(1);

  for (let cursor = new Date(start); cursor <= end; cursor.setMonth(cursor.getMonth() + 6)) {
    const nearest = withDate.reduce((best, curr) => {
      if (!best) return curr;
      const distBest = Math.abs(best.d.getTime() - cursor.getTime());
      const distCurr = Math.abs(curr.d.getTime() - cursor.getTime());
      return distCurr < distBest ? curr : best;
    }, withDate[0]);
    series.push({
      date: `${cursor.toLocaleDateString("en-US", { month: "short" })} ${cursor.getFullYear()}`,
      value: nearest.value,
    });
  }
  return series;
}

function parseDailyDose(frequency?: string) {
  if (!frequency) return 1;
  const f = frequency.toLowerCase();
  if (f.includes("tid") || f.includes("three")) return 3;
  if (f.includes("qid") || f.includes("four")) return 4;
  if (f.includes("bid") || f.includes("twice")) return 2;
  if (f.includes("weekly")) return 1 / 7;
  if (f.includes("monthly")) return 1 / 30;
  const qh = f.match(/q(\d+)h/);
  if (qh) {
    const hours = Number(qh[1]);
    if (hours > 0) return 24 / hours;
  }
  return 1;
}

function estimateRemainingStock(med: ExtractedMedication) {
  const start = med.startDate ? new Date(med.startDate) : new Date();
  const now = new Date();
  const elapsedDays = Math.max(0, Math.floor((now.getTime() - start.getTime()) / 86400000));
  const dailyDose = parseDailyDose(med.frequency);
  const consumed = Math.floor(elapsedDays * dailyDose);
  const baseline = med.stockCount ?? 30;
  const missed = med.missedDoses ?? 0;
  return Math.max(0, baseline - consumed + missed);
}

function formatUsualTimeHint(hhmm: string | undefined): string | null {
  if (!hhmm?.trim()) return null;
  const m = hhmm.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isInteger(h) || !Number.isInteger(min) || h < 0 || h > 23 || min < 0 || min > 59) return null;
  const d = new Date();
  d.setHours(h, min, 0, 0);
  return d.toLocaleTimeString(undefined, { timeStyle: "short" });
}

function normalizeUsualTimeHHmm(raw: string): string | undefined {
  const t = raw.trim();
  if (!t) return undefined;
  const m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return undefined;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isInteger(h) || !Number.isInteger(min) || h < 0 || h > 23 || min < 0 || min > 59) return undefined;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function toIsoFromLocalPanel(dtLocal: string): string {
  const d = new Date(dtLocal);
  if (Number.isNaN(d.getTime())) return new Date().toISOString();
  return d.toISOString();
}

/** When structured dose fields are missing, prefill the editor from plain `dose` text (e.g. "1250 mg"). */
function prefillDosePanelFromMedDoseText(doseText: string | undefined): { amount: string; unit: MedDoseUserUnit } | null {
  const t = (doseText ?? "").trim();
  if (!t) return null;
  const m = t.match(/^([\d.,]+)\s*([a-zA-Zµ/]+)/);
  if (!m) return null;
  const amount = m[1].replace(",", ".");
  if (!Number.isFinite(Number(amount))) return null;
  const u = m[2].replace(/µ/g, "u").toLowerCase();
  const map: Record<string, MedDoseUserUnit> = {
    mg: "mg",
    g: "g",
    mcg: "mcg",
    ug: "ug",
    ml: "mL",
    l: "L",
    iu: "IU",
    tablet: "tablet",
    tablets: "tablet",
    capsule: "capsule",
    capsules: "capsule",
    puff: "puff",
    puffs: "puff",
    patch: "patch",
    patches: "patch",
    drop: "drop",
    drops: "drop",
  };
  const unit = map[u];
  if (!unit) return null;
  return { amount, unit };
}

function nextDoseWindow(frequency?: string, usualTimeLocalHHmm?: string) {
  const usualLabel = formatUsualTimeHint(usualTimeLocalHHmm);
  let base: string;
  if (!frequency) base = "Once a day (for example around 9:00 AM)";
  else {
    const f = frequency.toLowerCase();
    if (f.includes("bid") || f.includes("twice")) base = "Morning and evening (for example 8 AM and 8 PM)";
    else if (f.includes("tid") || f.includes("three")) base = "Morning, afternoon, and evening";
    else if (f.includes("night")) base = "At night (around 9–10 PM)";
    else if (f.includes("weekly")) base = "Once a week (same day each week)";
    else base = "Use the times your doctor told you";
  }
  return usualLabel ? `${base} · Your usual time here: ${usualLabel}` : base;
}

type OverlayKind = "reports" | "meds" | "labs" | "add-med" | "add-report" | "upload-report" | null;

export default function DashboardPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [store, setStore] = useState(() => getHydrationSafeViewingStore());
  const [activeMember, setActiveMemberState] = useState(() => typeof window !== "undefined" ? getActiveFamilyMember() : null);
  const [printing, setPrinting] = useState(false);
  const [overlay, setOverlay] = useState<OverlayKind>(null);
  const [activeMedInfo, setActiveMedInfo] = useState<string | null>(null);
  const medNameInputRef = useRef<HTMLInputElement | null>(null);
  const printFallbackTimerRef = useRef<number | null>(null);
  const globalUpload = useGlobalUpload();

  // File queue is stored in the global context so it survives navigation.
  // Local state is only kept for backward compat with file-picker UI.
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const uploadFile = globalUpload.currentFile ?? uploadFiles[0] ?? null;
  const uploadFileIndex = globalUpload.queueIndex;
  // uploadLoading now mirrors the global context phase so navigation doesn't cancel the fetch
  const uploadLoading = globalUpload.phase === "extracting";
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadPreview, setUploadPreview] = useState<ExtractedDoc | null>(null);
  const [uploadLexiconPatches, setUploadLexiconPatches] = useState<StandardLexiconEntry[]>([]);
  const [uploadExtractionCost, setUploadExtractionCost] = useState<ExtractionCost | null>(null);
  const [uploadNameMismatch, setUploadNameMismatch] = useState<{
    namesOnDocument: string[];
    profileDisplayName: string;
  } | null>(null);
  const [recordNotice, setRecordNotice] = useState<string | null>(null);
  const dismissRecordNotice = useCallback(() => setRecordNotice(null), []);
  /** Shown when a background extraction fails and the user returns to the dashboard. */
  const [uploadFailNotice, setUploadFailNotice] = useState<string | null>(null);
  const dismissUploadFailNotice = useCallback(() => setUploadFailNotice(null), []);
  const [newMed, setNewMed] = useState<ExtractedMedication>({
    name: "",
    dose: "",
    frequency: "",
  });
  const [newMedFrequencyPreset, setNewMedFrequencyPreset] = useState<MedFrequencyPresetId>("once_daily");
  const [newMedFrequencyOther, setNewMedFrequencyOther] = useState("");
  const [addMedFreqError, setAddMedFreqError] = useState<string | null>(null);
  const [newMedDoseAmount, setNewMedDoseAmount] = useState("");
  const [newMedDoseUnit, setNewMedDoseUnit] = useState<MedDoseUserUnit>("mg");
  const [addMedDoseError, setAddMedDoseError] = useState<string | null>(null);
  const [panelDoseAmount, setPanelDoseAmount] = useState("");
  const [panelDoseUnit, setPanelDoseUnit] = useState<MedDoseUserUnit>("mg");
  const [panelFreqPreset, setPanelFreqPreset] = useState<MedFrequencyPresetId>("once_daily");
  const [panelFreqOther, setPanelFreqOther] = useState("");
  const [panelStockCount, setPanelStockCount] = useState("");
  const [panelUsualTime, setPanelUsualTime] = useState("");
  const [newMedUsualTime, setNewMedUsualTime] = useState("");
  const [newMedForm, setNewMedForm] = useState<MedicationFormKind>("unspecified");
  const [newMedFormOther, setNewMedFormOther] = useState("");
  const [addMedFormError, setAddMedFormError] = useState<string | null>(null);
  const [panelMedForm, setPanelMedForm] = useState<MedicationFormKind>("unspecified");
  const [panelMedFormOther, setPanelMedFormOther] = useState("");
  const [panelIntakeWhen, setPanelIntakeWhen] = useState("");
  const [panelIntakeAction, setPanelIntakeAction] = useState<MedicationIntakeLogEntry["action"]>("taken");
  const [panelIntakeNotes, setPanelIntakeNotes] = useState("");
  const [panelIntakeAmount, setPanelIntakeAmount] = useState("");
  const [panelIntakeUnit, setPanelIntakeUnit] = useState<MedDoseUserUnit>("mg");
  const [panelIntakeDoseError, setPanelIntakeDoseError] = useState<string | null>(null);
  const [panelRemTime, setPanelRemTime] = useState("09:00");
  const [panelRemRepeatDaily, setPanelRemRepeatDaily] = useState(true);
  const [panelRemOnceWhen, setPanelRemOnceWhen] = useState("");
  const [panelRemNotes, setPanelRemNotes] = useState("");
  const [panelRemHint, setPanelRemHint] = useState<string | null>(null);
  // Family tree is now in the FamilySwitcher dropdown
  const [labFilter, setLabFilter] = useState<"flagged" | "all">("flagged");
  const [showApptReminderPanel, setShowApptReminderPanel] = useState(false);
  // Reminder presets in minutes before appointment
  const APPT_REMINDER_PRESETS = [
    { minutesBefore: 60 * 24, label: "1 day before" },
    { minutesBefore: 60 * 2, label: "2 hours before" },
    { minutesBefore: 60, label: "1 hour before" },
    { minutesBefore: 30, label: "30 minutes before" },
    { minutesBefore: 15, label: "15 minutes before" },
  ];
  const [pinnedTrendMetrics, setPinnedTrendMetrics] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem("uma_pinned_trends_v1");
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  });

  const [printPortalEl, setPrintPortalEl] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    setPrintPortalEl(document.body);
  }, []);

  useEffect(() => {
    if (activeMedInfo === null) {
      setPanelDoseAmount("");
      setPanelDoseUnit("mg");
      setPanelFreqPreset("once_daily");
      setPanelFreqOther("");
      setPanelStockCount("");
      setPanelUsualTime("");
      setPanelMedForm("unspecified");
      setPanelMedFormOther("");
      setPanelIntakeWhen("");
      setPanelIntakeAction("taken");
      setPanelIntakeNotes("");
      setPanelIntakeAmount("");
      setPanelIntakeUnit("mg");
      setPanelIntakeDoseError(null);
      setPanelRemTime("09:00");
      setPanelRemRepeatDaily(true);
      setPanelRemOnceWhen("");
      setPanelRemNotes("");
      setPanelRemHint(null);
      return;
    }
    const i = Number(activeMedInfo);
    if (!Number.isFinite(i) || i < 0 || i >= store.meds.length) return;
    const med = store.meds[i];
    if (med.doseAmountStandard != null && med.doseStandardUnit) {
      setPanelDoseAmount(formatQtyClean(med.doseAmountStandard));
      setPanelDoseUnit(standardUnitToEditorUnit(med.doseStandardUnit));
    } else {
      const pref = prefillDosePanelFromMedDoseText(med.dose);
      if (pref) {
        setPanelDoseAmount(pref.amount);
        setPanelDoseUnit(pref.unit);
      } else {
        setPanelDoseAmount("");
        setPanelDoseUnit("mg");
      }
    }
    const { preset, other } = matchStoredFrequencyToPreset(med.frequency);
    setPanelFreqPreset(preset);
    setPanelFreqOther(other);
    setPanelStockCount(med.stockCount != null && med.stockCount >= 0 ? String(med.stockCount) : "");
    const ut = med.usualTimeLocalHHmm?.trim();
    setPanelUsualTime(ut ? normalizeUsualTimeHHmm(ut) ?? ut.slice(0, 5) : "");
    const rawForm = med.medicationForm;
    const coercedForm =
      rawForm && typeof rawForm === "string" && isMedicationFormKind(rawForm)
        ? (rawForm as MedicationFormKind)
        : "unspecified";
    setPanelMedForm(coercedForm);
    setPanelMedFormOther(coercedForm === "other" ? (med.medicationFormOther ?? "") : "");
    setPanelIntakeWhen(new Date().toISOString().slice(0, 16));
    setPanelIntakeAction("taken");
    setPanelIntakeNotes("");
    setPanelIntakeAmount("");
    setPanelIntakeUnit("mg");
    setPanelIntakeDoseError(null);
    const utRem = med.usualTimeLocalHHmm?.trim();
    const normRem = utRem ? normalizeUsualTimeHHmm(utRem) ?? utRem.slice(0, 5) : "";
    setPanelRemTime(normRem || "09:00");
    setPanelRemRepeatDaily(true);
    setPanelRemOnceWhen(new Date(Date.now() + 3_600_000).toISOString().slice(0, 16));
    setPanelRemNotes("");
    setPanelRemHint(null);
  }, [activeMedInfo, store.meds]);

  useEffect(() => {
    function loadActiveStore() {
      const s = getViewingStore();
      if (s.docs.length > 0) {
        rebuildLabsAndMedsFromDocuments(s);
        saveViewingStore(s);
      }
      setStore(s);
      setActiveMemberState(getActiveFamilyMember());
    }
    loadActiveStore();
    const onFocus = () => loadActiveStore();
    const onStorage = (e: StorageEvent) => {
      if (e.key?.startsWith("mv_patient_store")) loadActiveStore();
    };
    const onCustom = () => loadActiveStore();
    window.addEventListener("focus", onFocus);
    window.addEventListener("storage", onStorage);
    window.addEventListener("mv-store-update", onCustom as EventListener);
    window.addEventListener("mv-active-member-changed", onCustom as EventListener);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("mv-store-update", onCustom as EventListener);
      window.removeEventListener("mv-active-member-changed", onCustom as EventListener);
    };
  }, []);

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, "");
    if (!hash) return;
    requestAnimationFrame(() => {
      document.getElementById(hash)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  // Open the upload overlay when arriving via the sidebar's "Upload documents" shortcut
  // (e.g. /dashboard?upload=1). We strip the query param afterwards so the modal doesn't
  // keep re-opening on back-navigation or store refresh.
  useEffect(() => {
    if (searchParams?.get("upload") !== "1") return;
    setOverlay(globalUpload.phase === "ready" && globalUpload.result ? "upload-report" : "add-report");
    const params = new URLSearchParams(searchParams.toString());
    params.delete("upload");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [searchParams, router, pathname, globalUpload.phase, globalUpload.result]);

  // When a background extraction finishes (user may have navigated away and returned),
  // promote the result into the local preview state so the review card appears.
  useEffect(() => {
    if (globalUpload.phase === "ready" && globalUpload.result) {
      setUploadPreview(globalUpload.result.doc);
      setUploadLexiconPatches(globalUpload.result.lexiconPatches);
      setUploadExtractionCost(globalUpload.result.extractionCost ?? null);
      setUploadNameMismatch(globalUpload.result.nameMismatch ?? null);
      setUploadError(null);
      setUploadFailNotice(null);
      setOverlay("upload-report");
      setRecordNotice("Your PDF is ready. Check the summary below, then tap Add to records.");
    }
    if (globalUpload.phase === "error" && globalUpload.error) {
      // Show error both inside the upload modal (if open) and as a persistent toast on the dashboard
      setUploadError(globalUpload.error);
      setUploadFailNotice(`File upload failed: ${globalUpload.error}`);
    }
  }, [globalUpload.phase, globalUpload.result, globalUpload.error]);

  useEffect(() => {
    const clearPrintFallback = () => {
      if (printFallbackTimerRef.current) {
        window.clearTimeout(printFallbackTimerRef.current);
        printFallbackTimerRef.current = null;
      }
    };
    const onAfterPrint = () => {
      clearPrintFallback();
      setPrinting(false);
    };
    window.addEventListener("afterprint", onAfterPrint);
    return () => {
      window.removeEventListener("afterprint", onAfterPrint);
      clearPrintFallback();
    };
  }, []);


  function updateStore(next: typeof store) {
    setStore(next);
    saveViewingStore(next);
  }

  function updateMed(index: number, patch: Partial<ExtractedMedication>) {
    const next = {
      ...store,
      meds: store.meds.map((m, i) => (i === index ? { ...m, ...patch } : m)),
    };
    updateStore(next);
  }

  function removeMed(index: number) {
    const next = { ...store, meds: store.meds.filter((_, i) => i !== index) };
    updateStore(next);
  }

  function logMissedDose(index: number) {
    const target = store.meds[index];
    const missed = (target.missedDoses ?? 0) + 1;
    updateMed(index, { missedDoses: missed, lastMissedISO: new Date().toISOString().slice(0, 10) });
  }

  const panelMedReminderRows = useMemo(() => {
    if (activeMedInfo === null) return [];
    const i = Number(activeMedInfo);
    if (!Number.isFinite(i) || i < 0 || i >= store.meds.length) return [];
    const name = store.meds[i]?.name?.trim().toLowerCase() ?? "";
    if (!name) return [];
    const hl = normalizeHealthLogs(store.healthLogs ?? {});
    return hl.medicationReminders.filter((r) => r.medicationName.trim().toLowerCase() === name);
  }, [activeMedInfo, store.meds, store.healthLogs]);

  function panelSaveIntakeLog(i: number) {
    const med = store.meds[i];
    if (!med?.name?.trim()) return;
    const dosePatch =
      panelIntakeAmount.trim().length > 0 ? buildDoseFromUserInput(panelIntakeAmount, panelIntakeUnit) : undefined;
    if (panelIntakeAmount.trim().length > 0 && !dosePatch) {
      setPanelIntakeDoseError("Enter a valid amount or clear the dose fields.");
      return;
    }
    setPanelIntakeDoseError(null);
    const entry: MedicationIntakeLogEntry = {
      id: newHealthLogId(),
      loggedAtISO: toIsoFromLocalPanel(panelIntakeWhen),
      medicationName: med.name.trim().slice(0, 200),
      action: panelIntakeAction,
      notes: panelIntakeNotes.trim() || undefined,
      doseAmountStandard: dosePatch?.doseAmountStandard,
      doseStandardUnit: dosePatch?.doseStandardUnit,
      doseUserEnteredLabel: dosePatch?.doseUserEnteredLabel,
    };
    const hl = normalizeHealthLogs(store.healthLogs ?? {});
    updateStore({
      ...store,
      healthLogs: { ...hl, medicationIntake: [entry, ...hl.medicationIntake] },
    });
    setPanelIntakeNotes("");
    setPanelIntakeAmount("");
    setPanelIntakeUnit("mg");
    setPanelIntakeAction("taken");
    setPanelIntakeWhen(new Date().toISOString().slice(0, 16));
    setRecordNotice("Saved to your health journal.");
  }

  function panelAddReminder(i: number) {
    const med = store.meds[i];
    if (!med?.name?.trim()) return;
    const hl = normalizeHealthLogs(store.healthLogs ?? {});
    let timeLocalHHmm = panelRemTime.trim();
    if (panelRemRepeatDaily) {
      const probe = /^(\d{1,2}):(\d{2})$/.exec(timeLocalHHmm);
      if (!probe) {
        setPanelRemHint("Use a time like 09:00.");
        return;
      }
      const h = Number(probe[1]);
      const mi = Number(probe[2]);
      if (!Number.isInteger(h) || !Number.isInteger(mi) || h < 0 || h > 23 || mi < 0 || mi > 59) {
        setPanelRemHint("Use a time like 09:00.");
        return;
      }
      timeLocalHHmm = `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`;
    } else {
      timeLocalHHmm = "00:00";
    }
    let remindOnceAtISO: string | undefined;
    if (!panelRemRepeatDaily) {
      const onceIso = toIsoFromLocalPanel(panelRemOnceWhen);
      const t = new Date(onceIso);
      if (Number.isNaN(t.getTime()) || t.getTime() <= Date.now()) {
        setPanelRemHint("Pick a future date and time for a one-time reminder.");
        return;
      }
      remindOnceAtISO = onceIso;
    }
    setPanelRemHint(null);
    const entry: MedicationReminderEntry = {
      id: newHealthLogId(),
      medicationName: med.name.trim().slice(0, 200),
      timeLocalHHmm,
      repeatDaily: panelRemRepeatDaily,
      remindOnceAtISO,
      enabled: true,
      createdAtISO: new Date().toISOString(),
      notes: panelRemNotes.trim() || undefined,
    };
    updateStore({
      ...store,
      healthLogs: { ...hl, medicationReminders: [entry, ...hl.medicationReminders] },
    });
    setPanelRemNotes("");
    setRecordNotice("Reminder saved.");
  }

  function panelDeleteReminder(id: string) {
    const hl = normalizeHealthLogs(store.healthLogs ?? {});
    updateStore({
      ...store,
      healthLogs: { ...hl, medicationReminders: hl.medicationReminders.filter((x) => x.id !== id) },
    });
  }

  function panelSetReminderEnabled(id: string, enabled: boolean) {
    const hl = normalizeHealthLogs(store.healthLogs ?? {});
    updateStore({
      ...store,
      healthLogs: {
        ...hl,
        medicationReminders: hl.medicationReminders.map((x) => (x.id === id ? { ...x, enabled } : x)),
      },
    });
  }

  async function panelRequestNotifications() {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setPanelRemHint("This browser does not support notifications.");
      return;
    }
    const p = await Notification.requestPermission();
    if (p === "granted") setPanelRemHint("Notifications on while UMA is open in this browser.");
    else if (p === "denied") setPanelRemHint("Notifications blocked in browser settings.");
    else setPanelRemHint("Notifications were not enabled.");
  }

  function refillMed(index: number) {
    updateMed(index, { stockCount: 30, missedDoses: 0 });
  }

  function addMed(): boolean {
    if (!newMed.name?.trim()) return false;
    if (newMedForm === "other" && !newMedFormOther.trim()) {
      setAddMedFormError('Choose a form from the list, or pick "Other" and describe it in a few words.');
      return false;
    }
    setAddMedFormError(null);
    if (newMedFrequencyPreset === "other" && !newMedFrequencyOther.trim()) {
      setAddMedFreqError('Pick a schedule from the list, or choose "Other" and type how often you take it.');
      return false;
    }
    setAddMedFreqError(null);
    const dosePatch =
      newMedDoseAmount.trim().length > 0 ? buildDoseFromUserInput(newMedDoseAmount, newMedDoseUnit) : undefined;
    if (newMedDoseAmount.trim().length > 0 && !dosePatch) {
      setAddMedDoseError("Enter a valid dose number, or leave the amount blank.");
      return false;
    }
    setAddMedDoseError(null);
    const freq = frequencyFromPreset(newMedFrequencyPreset, newMedFrequencyOther);
    const trimmed = applyManualMedicationDefaults({
      ...newMed,
      name: newMed.name.trim(),
      frequency: freq,
      stockCount: 30,
      missedDoses: 0,
      startDate: new Date().toISOString().slice(0, 10),
      usualTimeLocalHHmm: normalizeUsualTimeHHmm(newMedUsualTime),
      medicationForm: newMedForm !== "unspecified" ? newMedForm : undefined,
      medicationFormOther: newMedForm === "other" ? newMedFormOther.trim().slice(0, 80) : undefined,
      dose: dosePatch?.dose,
      doseAmountStandard: dosePatch?.doseAmountStandard,
      doseStandardUnit: dosePatch?.doseStandardUnit,
      doseDimension: dosePatch?.doseDimension,
      doseUserEnteredLabel: dosePatch?.doseUserEnteredLabel,
    });
    const next = { ...store, meds: [trimmed, ...store.meds] };
    updateStore(next);
    setNewMed({ name: "", dose: "", frequency: "" });
    setNewMedFrequencyPreset("once_daily");
    setNewMedFrequencyOther("");
    setNewMedDoseAmount("");
    setNewMedDoseUnit("mg");
    setNewMedUsualTime("");
    setNewMedForm("unspecified");
    setNewMedFormOther("");
    return true;
  }

  function savePanelMedicationForm(i: number) {
    if (panelMedForm === "other" && !panelMedFormOther.trim()) {
      setRecordNotice('Add a short description for “Other”, or pick another form from the list.');
      return;
    }
    updateMed(i, {
      medicationForm: panelMedForm === "unspecified" ? undefined : panelMedForm,
      medicationFormOther: panelMedForm === "other" ? panelMedFormOther.trim().slice(0, 80) : undefined,
    });
    setRecordNotice("Form saved.");
  }

  function savePanelDoseClear(i: number) {
    updateMed(i, {
      dose: undefined,
      doseAmountStandard: undefined,
      doseStandardUnit: undefined,
      doseDimension: undefined,
      doseUserEnteredLabel: undefined,
    });
    setPanelDoseAmount("");
    setPanelDoseUnit("mg");
  }

  function savePanelDose(i: number) {
    if (panelDoseAmount.trim().length === 0) {
      savePanelDoseClear(i);
      return;
    }
    const patch = buildDoseFromUserInput(panelDoseAmount, panelDoseUnit);
    if (!patch) {
      setRecordNotice("That dose did not parse—try a number and unit, or tap Clear dose.");
      return;
    }
    updateMed(i, patch);
    setRecordNotice("Dose saved.");
  }

  function savePanelStock(i: number) {
    const raw = panelStockCount.trim();
    if (!raw) return;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0 || n > 99_999) {
      setRecordNotice("Stock count should be a whole number from 0 to 99999.");
      return;
    }
    updateMed(i, { stockCount: Math.round(n) });
    setRecordNotice("Stock count saved.");
  }

  function savePanelUsualTime(i: number) {
    const normalized = normalizeUsualTimeHHmm(panelUsualTime);
    updateMed(i, { usualTimeLocalHHmm: normalized });
    setRecordNotice(normalized ? "Usual time saved." : "Usual time cleared.");
  }

  function savePanelSchedule(i: number) {
    if (panelFreqPreset === "other" && !panelFreqOther.trim()) return;
    const f = frequencyFromPreset(panelFreqPreset, panelFreqOther);
    updateMed(i, { frequency: f });
  }

  function readFileAsBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const r = reader.result as string;
        const comma = r.indexOf(",");
        resolve(comma >= 0 ? r.slice(comma + 1) : r);
      };
      reader.onerror = () => reject(reader.error ?? new Error("Read failed"));
      reader.readAsDataURL(file);
    });
  }

  function discardUploadPreview() {
    setUploadFiles([]);
    setUploadPreview(null);
    setUploadLexiconPatches([]);
    setUploadExtractionCost(null);
    setUploadNameMismatch(null);
    setUploadError(null);
    globalUpload.clear();
  }

  function extractUploadDoc() {
    const file = uploadFiles[0] ?? uploadFile;
    if (!file) return;
    setUploadError(null);
    setUploadPreview(null);
    setUploadLexiconPatches([]);
    setUploadExtractionCost(null);
    setUploadNameMismatch(null);
    // Hand off to the layout-level context so the fetch survives navigation.
    // Pass the full queue so context can track progress across navigations.
    globalUpload.startExtract({
      file,
      typeHint: "",
      patientName: store.profile.name?.trim() ?? "",
      existingContentHashes: store.docs.map((d) => d.contentHash).filter(Boolean) as string[],
      standardLexicon: store.standardLexicon ?? [],
      allFiles: uploadFiles.length > 0 ? uploadFiles : [file],
      allFilesIndex: 0,
    });
  }

  async function commitUploadDoc() {
    if (!uploadPreview) return;
    let doc: ExtractedDoc = uploadPreview;
    // Use the file reference from the global context — it survives navigation
    const fileForBase64 = globalUpload.currentFile ?? uploadFile;
    if (fileForBase64) {
      try {
        const originalPdfBase64 = await readFileAsBase64(fileForBase64);
        doc = { ...uploadPreview, originalPdfBase64 };
      } catch {
        doc = uploadPreview;
      }
    }
    const result = smartMergeExtractedDoc(doc, {
      standardLexiconPatches: uploadLexiconPatches,
    });
    setStore(result.store);

    // Check if there are more files to upload (use global queue which survives navigation)
    const queue = globalUpload.queuedFiles.length > 0 ? globalUpload.queuedFiles : uploadFiles;
    const nextIndex = uploadFileIndex + 1;
    if (nextIndex < queue.length) {
      setUploadPreview(null);
      setUploadError(null);
      setUploadLexiconPatches([]);
      setUploadExtractionCost(null);
      setUploadNameMismatch(null);
      // Auto-start extraction of next file
      globalUpload.startExtract({
        file: queue[nextIndex],
        typeHint: "",
        patientName: result.store.profile.name?.trim() ?? "",
        existingContentHashes: result.store.docs.map((d) => d.contentHash).filter(Boolean) as string[],
        standardLexicon: result.store.standardLexicon ?? [],
        allFiles: queue,
        allFilesIndex: nextIndex,
      });
    } else {
      // All files processed
      setUploadFiles([]);
      setUploadPreview(null);
      setUploadLexiconPatches([]);
      setUploadNameMismatch(null);
      setUploadError(null);
      setOverlay(null);
      globalUpload.clear();
    }
    setRecordNotice(result.message);
  }

  function printVisitSummary() {
    setPrinting(true);
    if (printFallbackTimerRef.current != null) window.clearTimeout(printFallbackTimerRef.current);
    printFallbackTimerRef.current = window.setTimeout(() => {
      setPrinting(false);
      printFallbackTimerRef.current = null;
    }, 4000);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        window.setTimeout(() => {
          window.print();
        }, 0);
      });
    });
  }

  function deleteDoc(docId: string) {
    if (!confirm("Delete this file? You cannot undo this.")) return;
    const next = removeDoc(docId);
    setStore(next);
  }

  function focusAddMedication() {
    setAddMedDoseError(null);
    setAddMedFreqError(null);
    setAddMedFormError(null);
    setNewMedFrequencyPreset("once_daily");
    setNewMedFrequencyOther("");
    setNewMedDoseAmount("");
    setNewMedDoseUnit("mg");
    setNewMedUsualTime("");
    setNewMedForm("unspecified");
    setNewMedFormOther("");
    setOverlay("add-med");
    setTimeout(() => medNameInputRef.current?.focus(), 60);
  }

  function handlePinToggle(name: string) {
    setPinnedTrendMetrics(prev => {
      const next = prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name];
      if (typeof window !== "undefined") {
        localStorage.setItem("uma_pinned_trends_v1", JSON.stringify(next));
      }
      return next;
    });
  }

  const lex = store.standardLexicon;
  const trendMap: Record<string, Array<{ date: string; value: number | null }>> = useMemo(
    () => {
      const map: Record<string, Array<{ date: string; value: number | null }>> = {};
      Object.keys(LAB_META).forEach((canonicalName) => {
        map[canonicalName] = toChartPoints(store.labs, canonicalName, lex);
      });
      return map;
    },
    [store.labs, lex]
  );
  const trendCards = useMemo(
    () =>
      Object.entries(trendMap)
        .map(([name, raw]) => ({
          name,
          raw,
        }))
        .filter((x) => x.raw.length > 0),
    [trendMap]
  );

  const recentLabs = useMemo(() => {
    return store.labs
      .slice()
      .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
      .slice(0, 30);
  }, [store.labs]);

  const flaggedLabs = useMemo(() => {
    return recentLabs.filter(l => {
      const it = interpretLab(l, lex);
      return it.flag === "low" || it.flag === "high";
    });
  }, [recentLabs, lex]);

  const visitPrintLabs = useMemo(
    () =>
      recentLabs.map((l) => {
        const normalizedUnit = l.unit ? normalizeLabUnitString(l.unit) : "";
        return {
          name: resolveCanonicalLabName(l.name, lex),
          value: pf(String(l.value ?? "")),
          unit: normalizedUnit || pf(l.unit?.trim() ?? ""),
          date: pf(l.date ?? ""),
        };
      }),
    [recentLabs, lex]
  );

  const recentDocs = useMemo(() => {
    return store.docs
      .slice()
      .sort((a, b) => (b.dateISO ?? "").localeCompare(a.dateISO ?? ""))
      .slice(0, 20);
  }, [store.docs]);
  const recentMeds = useMemo(() => store.meds.slice(0, 20), [store.meds]);

  /** Active reminders keyed by lowercase medication name for O(1) card lookups. */
  const remindersByMedKey = useMemo(() => {
    const hl = normalizeHealthLogs(store.healthLogs ?? {});
    const map: Record<string, typeof hl.medicationReminders> = {};
    hl.medicationReminders
      .filter((r) => r.enabled)
      .forEach((r) => {
        const key = r.medicationName.trim().toLowerCase();
        (map[key] ??= []).push(r);
      });
    return map;
  }, [store.healthLogs]);

  const cycleSummary = useMemo(
    () => summarizeMenstrualCycle(store.profile.menstrualCycle),
    [store.profile.menstrualCycle]
  );

  const cycleBadgeTitle = useMemo(() => {
    const mc = store.profile.menstrualCycle;
    const s = cycleSummary;
    const flowDates = mc?.flowLogDates ?? [];
    const recentFlow =
      flowDates.length > 0
        ? ` Recent flow days: ${flowDates.slice().sort().reverse().slice(0, 6).join(", ")}${flowDates.length > 6 ? "…" : ""}.`
        : "";
    const phase = s.phaseLabel ? ` Phase: ${s.phaseLabel}.` : "";
    const fertile = s.inFertileWindow
      ? " Currently in your fertile window."
      : s.daysUntilFertileWindow !== undefined
      ? ` Fertile window opens in ${s.daysUntilFertileWindow} day${s.daysUntilFertileWindow === 1 ? "" : "s"}.`
      : "";
    const ov = s.ovulationDateISO
      ? s.daysUntilOvulation === 0
        ? " Estimated ovulation today."
        : s.daysUntilOvulation !== undefined && s.daysUntilOvulation > 0
        ? ` Estimated ovulation in ${s.daysUntilOvulation} day${s.daysUntilOvulation === 1 ? "" : "s"}.`
        : ""
      : "";
    return `${s.headline}. ${s.detail}.${phase}${fertile}${ov}${recentFlow} Estimates only, not medical advice. Tap Profile to edit.`;
  }, [store.profile.menstrualCycle, cycleSummary]);

  const conditionBadgeTitle = useMemo(() => {
    const c = store.profile.conditions;
    if (!c.length) return "No health conditions saved yet. Tap Profile to add or change them.";
    const shown = c.slice(0, 10).join(", ");
    return `${c.length} health condition(s): ${shown}${c.length > 10 ? "…" : ""}. Tap Profile to edit.`;
  }, [store.profile.conditions]);

  const allergyBadgeTitle = useMemo(() => {
    const a = store.profile.allergies;
    if (!a.length) return "No allergies saved yet. Tap Profile to add or change them.";
    const shown = a.slice(0, 10).join(", ");
    return `${a.length} saved allerg${a.length === 1 ? "y" : "ies"}: ${shown}${a.length > 10 ? "…" : ""}. Tap Profile to edit.`;
  }, [store.profile.allergies]);

  const docBadgeTitle = useMemo(() => {
    const n = store.docs.length;
    return `${n} saved file${n === 1 ? "" : "s"}. Opens your newest files on the home screen.`;
  }, [store.docs.length]);

  const doctorNameSuggestions = useMemo(
    () => mergeDoctorQuickPick(store.profile, doctorNamesFromDocs(store.docs)),
    [
      store.docs,
      store.profile.primaryCareProvider,
      store.profile.doctorQuickPick,
      store.profile.doctorQuickPickHidden,
    ],
  );

  const facilityNameSuggestions = useMemo(
    () => mergeFacilityQuickPick(store.profile, facilityNamesFromDocs(store.docs)),
    [
      store.docs,
      store.profile.nextVisitHospital,
      store.profile.facilityQuickPick,
      store.profile.facilityQuickPickHidden,
    ],
  );

  function removeDoctorSuggestion(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    setStore((prev) => {
      const qp = prev.profile.doctorQuickPick ?? [];
      const inCustom = qp.some((x) => normPickKey(x) === normPickKey(trimmed));
      const profile = { ...prev.profile };
      if (inCustom) {
        profile.doctorQuickPick = qp.filter((x) => normPickKey(x) !== normPickKey(trimmed));
      } else {
        const hidden = new Set([...(profile.doctorQuickPickHidden ?? [])]);
        hidden.add(normPickKey(trimmed));
        profile.doctorQuickPickHidden = [...hidden];
      }
      const next = { ...prev, profile };
      saveViewingStore(next);
      return next;
    });
  }

  function appendDoctorQuickPick(name: string) {
    const t = name.trim();
    if (!t) return;
    setStore((prev) => {
      const qp = [...(prev.profile.doctorQuickPick ?? [])];
      if (qp.some((x) => normPickKey(x) === normPickKey(t))) return prev;
      qp.push(t);
      const next = { ...prev, profile: { ...prev.profile, doctorQuickPick: qp } };
      saveViewingStore(next);
      return next;
    });
  }

  function renameDoctorSuggestion(from: string, to: string) {
    const f = from.trim();
    const t = to.trim();
    if (!f || !t || normPickKey(f) === normPickKey(t)) return;
    setStore((prev) => {
      const profile = { ...prev.profile };
      const qp = [...(profile.doctorQuickPick ?? [])];
      const idx = qp.findIndex((x) => normPickKey(x) === normPickKey(f));
      if (idx >= 0) {
        qp[idx] = t;
        profile.doctorQuickPick = qp;
      } else {
        const hidden = new Set([...(profile.doctorQuickPickHidden ?? [])]);
        hidden.add(normPickKey(f));
        profile.doctorQuickPickHidden = [...hidden];
        if (!qp.some((x) => normPickKey(x) === normPickKey(t))) qp.push(t);
        profile.doctorQuickPick = qp;
      }
      if (normPickKey(prev.profile.primaryCareProvider ?? "") === normPickKey(f)) {
        profile.primaryCareProvider = t;
      }
      const next = { ...prev, profile };
      saveViewingStore(next);
      return next;
    });
  }

  function removeFacilitySuggestion(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    setStore((prev) => {
      const qp = prev.profile.facilityQuickPick ?? [];
      const inCustom = qp.some((x) => normPickKey(x) === normPickKey(trimmed));
      const profile = { ...prev.profile };
      if (inCustom) {
        profile.facilityQuickPick = qp.filter((x) => normPickKey(x) !== normPickKey(trimmed));
      } else {
        const hidden = new Set([...(profile.facilityQuickPickHidden ?? [])]);
        hidden.add(normPickKey(trimmed));
        profile.facilityQuickPickHidden = [...hidden];
      }
      const next = { ...prev, profile };
      saveViewingStore(next);
      return next;
    });
  }

  function appendFacilityQuickPick(name: string) {
    const t = name.trim();
    if (!t) return;
    setStore((prev) => {
      const qp = [...(prev.profile.facilityQuickPick ?? [])];
      if (qp.some((x) => normPickKey(x) === normPickKey(t))) return prev;
      qp.push(t);
      const next = { ...prev, profile: { ...prev.profile, facilityQuickPick: qp } };
      saveViewingStore(next);
      return next;
    });
  }

  function renameFacilitySuggestion(from: string, to: string) {
    const f = from.trim();
    const t = to.trim();
    if (!f || !t || normPickKey(f) === normPickKey(t)) return;
    setStore((prev) => {
      const profile = { ...prev.profile };
      const qp = [...(profile.facilityQuickPick ?? [])];
      const idx = qp.findIndex((x) => normPickKey(x) === normPickKey(f));
      if (idx >= 0) {
        qp[idx] = t;
        profile.facilityQuickPick = qp;
      } else {
        const hidden = new Set([...(profile.facilityQuickPickHidden ?? [])]);
        hidden.add(normPickKey(f));
        profile.facilityQuickPickHidden = [...hidden];
        if (!qp.some((x) => normPickKey(x) === normPickKey(t))) qp.push(t);
        profile.facilityQuickPick = qp;
      }
      if (normPickKey(prev.profile.nextVisitHospital ?? "") === normPickKey(f)) {
        profile.nextVisitHospital = t;
      }
      const next = { ...prev, profile };
      saveViewingStore(next);
      return next;
    });
  }

  const healthSnapshot = useMemo(() => {
    if (!store.labs.length) return null;

    // Get latest value per canonical metric name
    const latestByName: Record<string, { value: number; date: string; unit?: string }> = {};
    [...store.labs]
      .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""))
      .forEach(l => {
        const val = parseFloat(String(l.value).replace(/[^\d.]/g, ""));
        if (!isNaN(val) && l.date) {
          latestByName[resolveCanonicalLabName(l.name, lex)] = { value: val, date: l.date, unit: l.unit };
        }
      });

    const concerns: Array<{ name: string; value: number; unit?: string; status: "critical" | "warning"; direction: "high" | "low"; friendlyName: string; why?: string }> = [];
    const improving: Array<{ name: string; friendlyName: string; direction: "improving" | "worsening" }> = [];

    Object.entries(latestByName).forEach(([name, { value }]) => {
      const ref = getCanonicalRefRange(name);
      if (!ref) return;
      const norm = (value - ref.low) / (ref.high - ref.low);
      const meta = getLabMeta(name);
      if (norm < -0.1 || norm > 1.1) {
        const direction = norm < 0 ? "low" : "high";
        const severity = norm < -0.5 || norm > 1.5 ? "critical" : "warning";
        concerns.push({
          name, value, unit: ref.unit, status: severity, direction,
          friendlyName: meta?.friendlyName ?? name,
          why: meta?.whyItMatters
        });
      }
    });

    // Detect trends
    const byName: Record<string, Array<{ value: number; date: string }>> = {};
    store.labs.forEach(l => {
      const val = parseFloat(String(l.value).replace(/[^\d.]/g, ""));
      if (!isNaN(val) && l.date) {
        const cn = resolveCanonicalLabName(l.name, lex);
        (byName[cn] ??= []).push({ value: val, date: l.date });
      }
    });
    Object.entries(byName).forEach(([name, pts]) => {
      if (pts.length < 2) return;
      const sorted = pts.sort((a,b) => a.date.localeCompare(b.date));
      const oldest = sorted[0].value, latest = sorted[sorted.length-1].value;
      if (oldest === 0) return;
      const ref = getCanonicalRefRange(name);
      if (!ref) return;
      const changePct = (latest - oldest) / oldest;
      const meta = getLabMeta(name);
      const latestNorm = (latest - ref.low) / (ref.high - ref.low);
      const oldestNorm = (oldest - ref.low) / (ref.high - ref.low);
      // Improving = was out of range, now closer to normal
      const wasAbnormal = oldestNorm < -0.1 || oldestNorm > 1.1;
      const isNowBetter = Math.abs(latestNorm - 0.5) < Math.abs(oldestNorm - 0.5);
      if (wasAbnormal && isNowBetter && Math.abs(changePct) > 0.1) {
        improving.push({ name, friendlyName: meta?.friendlyName ?? name, direction: "improving" });
      }
    });

    concerns.sort((a,b) => (b.status === "critical" ? 1 : 0) - (a.status === "critical" ? 1 : 0));

    return { concerns: concerns.slice(0, 6), improving: improving.slice(0, 3), total: Object.keys(latestByName).length };
  }, [store.labs, lex]);

  /** Plain-English health narrative synthesising all available data. */
  const healthNarrative = useMemo(() => {
    const name = store.profile.name?.split(" ")[0] || null;
    const dob = store.profile.dob;
    const age = dob ? (() => {
      const diff = Date.now() - new Date(dob).getTime();
      return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
    })() : null;
    const conditions = store.profile.conditions ?? [];
    const activeMeds = store.meds.filter(m => !m.endDate || m.endDate >= new Date().toISOString().slice(0, 10));
    const hasDocs = store.docs.length > 0;
    const hasLabs = store.labs.length > 0;

    // Nothing useful yet
    if (!hasDocs && conditions.length === 0 && activeMeds.length === 0) return null;

    const parts: string[] = [];

    // Age only (name is already shown in the title)
    if (age && age > 0 && age < 120) {
      parts.push(`${age} year${age === 1 ? "" : "s"} old.`);
    }

    // Conditions
    if (conditions.length > 0) {
      const shown = conditions.slice(0, 3).join(", ");
      const extra = conditions.length > 3 ? ` and ${conditions.length - 3} more` : "";
      parts.push(`Managing ${shown}${extra}.`);
    }

    // Active medications
    if (activeMeds.length > 0) {
      const medNames = activeMeds.slice(0, 3).map(m => m.name).join(", ");
      const extra = activeMeds.length > 3 ? ` (+${activeMeds.length - 3} more)` : "";
      parts.push(`On ${activeMeds.length} active medication${activeMeds.length === 1 ? "" : "s"}: ${medNames}${extra}.`);
    }

    // Lab highlights (only if we have labs)
    if (hasLabs && healthSnapshot) {
      const critical = healthSnapshot.concerns.filter(c => c.status === "critical");
      const warnings = healthSnapshot.concerns.filter(c => c.status === "warning");
      const improving = healthSnapshot.improving;

      if (critical.length > 0) {
        const names = critical.map(c => c.friendlyName).join(", ");
        parts.push(`${names} ${critical.length === 1 ? "is" : "are"} significantly outside normal range — worth discussing with your doctor.`);
      } else if (warnings.length > 0) {
        const names = warnings.slice(0, 2).map(c => c.friendlyName).join(" and ");
        parts.push(`${names} ${warnings.length === 1 ? "is" : "are"} slightly off — worth keeping an eye on.`);
      } else {
        parts.push("All tracked lab values are within normal range.");
      }

      if (improving.length > 0) {
        const names = improving.map(i => i.friendlyName).join(", ");
        parts.push(`${names} ${improving.length === 1 ? "is" : "are"} trending in the right direction.`);
      }
    }

    if (parts.length === 0) return null;
    return parts.join(" ");
  }, [store.profile, store.meds, store.docs.length, store.labs.length, healthSnapshot]);


  // Keep inline lists short so we don't need a secondary vertical scroll on
  // mobile — the "Show more" buttons open the full list in an overlay when
  // users want to see everything.
  const inlineDocs = recentDocs.slice(0, 3);
  const inlineMeds = recentMeds.slice(0, 3);
  const inlineLabs = recentLabs.slice(0, 6);

  // Editable dashboard layout. The layout lives in preferences but is
  // normalised on read so rows reference known widget ids, each widget
  // appears at most once, row caps are enforced, and new widgets shipped
  // after the user's layout was saved surface in the hidden palette.
  const [editMode, setEditMode] = useState(false);
  const dashboardLayout = useMemo(
    () => normalizeDashboardLayout(store.preferences.dashboardLayout ?? defaultDashboardLayout()),
    [store.preferences.dashboardLayout],
  );
  const handleDashboardLayoutChange = useCallback(
    (next: DashboardLayout) => {
      const updated: typeof store = {
        ...store,
        preferences: { ...store.preferences, dashboardLayout: next },
        updatedAtISO: new Date().toISOString(),
      };
      saveViewingStore(updated);
      setStore(updated);
    },
    [store],
  );

  return (
    <div className="flex min-h-full flex-col">
      <style>{`
        @keyframes umaExtractBar {
          0% { transform: translateX(-100%); opacity: 0.85; }
          50% { transform: translateX(80%); opacity: 1; }
          100% { transform: translateX(280%); opacity: 0.85; }
        }
        .snapshot-badge {
          transition: transform 0.22s ease, box-shadow 0.22s ease, border-color 0.22s ease;
        }
        .snapshot-badge:hover {
          transform: translateY(-2px);
          box-shadow: var(--shadow);
          border-color: color-mix(in srgb, var(--accent) 32%, var(--border));
        }
      `}</style>
      <AppTopNav />

      <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-4 py-8 pb-12 no-print">
        {activeMember && (
          <div className="flex items-center gap-3 rounded-2xl border border-[var(--accent)]/30 bg-[var(--accent)]/8 px-4 py-3">
            <span className="text-xl" aria-hidden>👤</span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-[var(--fg)]">
                Viewing {activeMember.displayName}&apos;s profile
              </p>
              <p className="text-xs text-[var(--muted)]">
                {activeMember.relation.charAt(0).toUpperCase() + activeMember.relation.slice(1)} · All data shown and saved belongs to this family member only
              </p>
            </div>
            <button
              type="button"
              onClick={() => { setActiveFamilyMember(undefined); setActiveMemberState(null); }}
              className="ml-auto text-xs text-[var(--accent)] hover:underline shrink-0"
            >
              Switch back
            </button>
          </div>
        )}
        {/* Dashboard grid: widgets are defined inline below as entries in
            `widgetNodes`, then rendered in whatever order the user has
            configured via `<DashboardGrid />`. Adding a widget means:
             1) add a new `widgetNodes.xxx = (...);` block here,
             2) extend `DashboardWidgetId` and `DASHBOARD_WIDGET_META`,
             3) add the id to the default layout or hidden palette. */}
        {(() => {
          const widgetNodes: Partial<Record<DashboardWidgetId, React.ReactNode>> = {};
          widgetNodes.snapshot = (
        <section className="mv-card rounded-3xl p-6 mv-surface">
          <div className="grid min-w-0 gap-5 lg:grid-cols-[1.6fr_1fr]">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-[0.16em] mv-muted">At a glance</p>
              <h2 className="mt-2 text-3xl font-semibold mv-title">{store.profile.name || "You"}</h2>
              <p className="mt-2 text-sm mv-muted max-w-xl leading-relaxed">
                {healthNarrative ?? "Upload a health report to get your personalised health summary."}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  title={conditionBadgeTitle}
                  aria-label={conditionBadgeTitle}
                  onClick={() => { window.location.href = "/profile#profile-conditions"; }}
                  className="inline-flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-xs font-medium text-[var(--fg)] hover:border-[var(--accent)]/50 hover:bg-[var(--accent)]/8 transition-all snapshot-badge"
                >
                  <Stethoscope className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" />
                  <span>{store.profile.conditions.length > 0 ? store.profile.conditions.slice(0,2).join(", ") + (store.profile.conditions.length > 2 ? ` +${store.profile.conditions.length-2} more` : "") : "No conditions"}</span>
                </button>
                <button
                  type="button"
                  title={allergyBadgeTitle}
                  aria-label={allergyBadgeTitle}
                  onClick={() => { window.location.href = "/profile#profile-allergies"; }}
                  className="inline-flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-xs font-medium text-[var(--fg)] hover:border-[var(--accent)]/50 hover:bg-[var(--accent)]/8 transition-all snapshot-badge"
                >
                  <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                  <span>{store.profile.allergies.length > 0 ? store.profile.allergies.slice(0,2).join(", ") + (store.profile.allergies.length > 2 ? ` +${store.profile.allergies.length-2}` : "") : "No allergies"}</span>
                </button>
                {store.profile.sex === "Female" &&
                (store.profile.menstrualCycle?.lastPeriodStartISO ||
                (store.profile.menstrualCycle?.flowLogDates?.length ?? 0) > 0) ? (
                  <button
                    type="button"
                    title={cycleBadgeTitle}
                    aria-label={cycleBadgeTitle}
                    onClick={() => { window.location.href = "/profile#profile-cycle-tracking"; }}
                    className="inline-flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-xs font-medium text-[var(--fg)] hover:border-[var(--accent)]/50 hover:bg-[var(--accent)]/8 transition-all snapshot-badge max-w-[16rem] truncate"
                  >
                    <Droplets className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{cycleSummary.headline} · {cycleSummary.detail}</span>
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => { window.location.href = "/profile"; }}
                  className="inline-flex items-center gap-2 rounded-2xl border border-[var(--accent)]/40 bg-[var(--accent)]/8 px-3 py-2 text-xs font-medium text-[var(--accent)] hover:bg-[var(--accent)]/15 transition-all snapshot-badge"
                >
                  <User className="h-3.5 w-3.5" />
                  <span>Edit profile</span>
                </button>
              </div>
              {healthSnapshot && (healthSnapshot.concerns.length > 0 || healthSnapshot.improving.length > 0) && (
                <div className="mt-5 space-y-3 pt-1">
                  {healthSnapshot.concerns.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-2">
                        {healthSnapshot.concerns.map((c, i) => (
                          <div key={i} className={[
                            "inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-medium",
                            c.status === "critical"
                              ? "bg-rose-500/12 text-rose-600 border border-rose-500/25"
                              : "bg-amber-500/12 text-amber-600 border border-amber-500/25"
                          ].join(" ")}>
                            {c.status === "critical" ? <CircleDot className="h-3 w-3 text-rose-500 shrink-0" /> : <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />}
                            <span>{c.friendlyName}</span>
                            <span className="opacity-70">{c.direction === "high" ? "↑ high" : "↓ low"}</span>
                          </div>
                        ))}
                      </div>
                      {/* Concern badges are self-explanatory — no extra warning needed */}
                    </div>
                  )}
                  {healthSnapshot.improving.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-semibold text-[var(--fg)]">Improving</p>
                      <div className="flex flex-wrap gap-2">
                        {healthSnapshot.improving.map((item, i) => (
                          <div key={i} className="inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-medium bg-emerald-500/12 text-emerald-600 border border-emerald-500/25">
                            <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
                            <span>{item.friendlyName}</span>
                            <span className="opacity-70"><ArrowUpRight className="inline h-3 w-3" /> trending better</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <span className="text-[10px] text-[var(--muted)] italic">Based on your latest results · Not medical advice</span>
                </div>
              )}
            </div>
            <Card className="min-w-0 rounded-2xl">
              <CardContent className="min-w-0 space-y-3">
                <p className="text-xs uppercase tracking-[0.14em] mv-muted">Next appointment</p>
                <div className="grid grid-cols-2 gap-x-2 gap-y-3">
                  <div className="min-w-0">
                    <p className="mb-1 text-xs font-medium mv-muted">Doctor</p>
                    <Combobox
                      className="w-full min-w-0"
                      value={store.profile.primaryCareProvider || ""}
                      onChange={(v) => {
                        const updated = { ...store };
                        updated.profile.primaryCareProvider = v.trim() || undefined;
                        saveViewingStore(updated);
                        setStore({ ...updated });
                      }}
                      suggestions={doctorNameSuggestions}
                      placeholder="Doctor"
                      onRemoveSuggestion={removeDoctorSuggestion}
                      onRenameSuggestion={renameDoctorSuggestion}
                      onAppendCustom={appendDoctorQuickPick}
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="mb-1 text-xs font-medium mv-muted">Hospital / Clinic</p>
                    <Combobox
                      className="w-full min-w-0"
                      value={store.profile.nextVisitHospital || ""}
                      onChange={(v) => {
                        const updated = { ...store };
                        updated.profile.nextVisitHospital = v.trim() || undefined;
                        saveViewingStore(updated);
                        setStore({ ...updated });
                      }}
                      suggestions={facilityNameSuggestions}
                      placeholder="Clinic"
                      onRemoveSuggestion={removeFacilitySuggestion}
                      onRenameSuggestion={renameFacilitySuggestion}
                      onAppendCustom={appendFacilityQuickPick}
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="mb-1 text-xs font-medium mv-muted">Date</p>
                    <DatePicker
                      value={store.profile.nextVisitDate || ""}
                      onChange={(v) => {
                        const updated = { ...store };
                        updated.profile.nextVisitDate = v;
                        saveViewingStore(updated);
                        setStore({ ...updated });
                      }}
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="mb-1 text-xs font-medium mv-muted">Time</p>
                    <TimePicker
                      value={store.profile.nextVisitTime || ""}
                      onChange={(v) => {
                        const updated = { ...store };
                        updated.profile.nextVisitTime = v || undefined;
                        saveViewingStore(updated);
                        setStore({ ...updated });
                      }}
                    />
                  </div>
                </div>
                {/* Reminder toggle */}
                {store.profile.nextVisitDate && (
                  <div>
                    <button
                      type="button"
                      onClick={() => setShowApptReminderPanel(v => !v)}
                      className="flex items-center gap-2 text-xs text-[var(--accent)] hover:underline"
                    >
                      <Bell className="h-3.5 w-3.5" />
                      {(store.profile.appointmentReminders?.length ?? 0) > 0
                        ? `${store.profile.appointmentReminders!.length} reminder${store.profile.appointmentReminders!.length === 1 ? "" : "s"} set`
                        : "Set reminders"}
                    </button>
                    {showApptReminderPanel && (
                      <div className="mt-2 space-y-2 rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-3">
                        <p className="text-xs font-medium text-[var(--fg)]">Remind me:</p>
                        <div className="space-y-1">
                          {APPT_REMINDER_PRESETS.map(preset => {
                            const active = (store.profile.appointmentReminders ?? []).some(r => r.minutesBefore === preset.minutesBefore);
                            return (
                              <button
                                key={preset.minutesBefore}
                                type="button"
                                onClick={() => {
                                  const current = store.profile.appointmentReminders ?? [];
                                  const updated = { ...store };
                                  if (active) {
                                    updated.profile.appointmentReminders = current.filter(r => r.minutesBefore !== preset.minutesBefore);
                                  } else {
                                    updated.profile.appointmentReminders = [...current, { minutesBefore: preset.minutesBefore, label: preset.label }]
                                      .sort((a, b) => b.minutesBefore - a.minutesBefore);
                                  }
                                  saveViewingStore(updated);
                                  setStore({ ...updated });
                                }}
                                className={[
                                  "w-full flex items-center justify-between rounded-lg px-3 py-1.5 text-xs transition-colors",
                                  active
                                    ? "bg-[var(--accent)]/12 text-[var(--accent)] border border-[var(--accent)]/30"
                                    : "text-[var(--fg)] hover:bg-[var(--panel)] border border-transparent"
                                ].join(" ")}
                              >
                                <span>{preset.label}</span>
                                {active && <span className="text-[var(--accent)]">✓</span>}
                              </button>
                            );
                          })}
                        </div>
                        <p className="text-[10px] text-[var(--muted)] pt-1">
                          Browser notifications appear while UMA is open. Allow notifications when prompted.
                        </p>
                      </div>
                    )}
                  </div>
                )}
                <Button
                  type="button"
                  onClick={printVisitSummary}
                  className="w-full gap-2"
                  disabled={printing}
                  title="In the print dialog, choose Save as PDF for a file. If the preview looks empty, wait for the page to finish loading and try again."
                >
                  <ClipboardList className="h-4 w-4" />
                  {printing ? "Opening print…" : "Export visit summary"}
                </Button>
              </CardContent>
            </Card>
          </div>
        </section>
          );

          widgetNodes.bmi = <BmiCard store={store} />;

          widgetNodes.documents = (
          <Card id="dashboard-latest-reports" className="scroll-mt-24">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="h-4 w-4 shrink-0 text-[var(--accent-2)]" />
                  <h3 className="text-sm font-semibold">Upload documents</h3>
                </div>
                <div className="flex items-center gap-2">
                  <Badge>{store.docs.length}</Badge>
                  <Button variant="ghost" className="h-8 px-3" onClick={() => setOverlay("add-report")}>
                    Add new
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {inlineDocs.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[var(--border)] p-4 text-sm mv-muted">
                  No files yet. Upload something to start your list.
                </div>
              ) : (
                <div className="space-y-3">
                  {inlineDocs.map((d) => (
                    <div key={d.id} className="rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <Badge>{d.type}</Badge>
                            <span className="text-xs mv-muted">{d.dateISO || "Date not available"}</span>
                          </div>
                          <a href={`/docs/${d.id}`} className="mt-2 block text-sm font-semibold hover:underline">
                            {d.title}
                          </a>
                          <p className="mt-1 text-xs mv-muted line-clamp-3">{displaySummaryForDoc(d)}</p>
                        </div>
                        <button
                          type="button"
                          className="h-8 w-8 shrink-0 rounded-lg border border-[var(--border)] bg-[var(--panel)] text-[var(--fg)] grid place-items-center"
                          onClick={() => deleteDoc(d.id)}
                          aria-label="Delete file"
                        >
                          <Trash2 className="h-4 w-4 shrink-0" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {recentDocs.length > inlineDocs.length && (
                <div className="mt-3">
                  <Button variant="ghost" className="w-full" onClick={() => setOverlay("reports")}>
                    Show more files
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
          );

          widgetNodes.medications = (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Pill className="h-4 w-4 text-[var(--accent)]" />
                  <h3 className="text-sm font-semibold">Your medicines</h3>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Badge>{store.meds.length}</Badge>
                  <Button variant="ghost" className="h-8 px-3" onClick={focusAddMedication}>
                    Add new
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {inlineMeds.length === 0 ? (
                  <p className="text-sm mv-muted">No medicines added yet.</p>
                ) : (
                  inlineMeds.map((m, i) => {
                    const key = `${m.name}-${i}`;
                    const remaining = estimateRemainingStock(m);
                    const isOpen = activeMedInfo === String(i);
                    const doseLine = medDosePrimaryLine(m);
                    const usualHint = formatUsualTimeHint(m.usualTimeLocalHHmm);
                    const formLbl =
                      m.medicationForm && typeof m.medicationForm === "string" && isMedicationFormKind(m.medicationForm)
                        ? medicationFormLabel(m.medicationForm, m.medicationFormOther)
                        : "";
                    return (
                    <div key={key} className="group rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold">{m.name}</p>
                          <p className="text-xs mv-muted">
                            {[doseLine, formLbl, m.frequency, usualHint ? `~${usualHint}` : ""]
                              .filter(Boolean)
                              .join(" · ") || "Details not added"}
                          </p>
                          {(() => {
                            const rems = remindersByMedKey[m.name.trim().toLowerCase()] ?? [];
                            const isAuto = m.trackingMode === "auto";
                            const showCategory =
                              m.medicationProductCategory && m.medicationProductCategory !== "unspecified";
                            if (!showCategory && !isAuto && rems.length === 0) return null;
                            return (
                              <div className="mt-1.5 flex flex-wrap items-center gap-1">
                                {showCategory ? (
                                  <Badge className="text-[10px] py-0.5">
                                    {medicationProductCategoryLabel(m.medicationProductCategory)}
                                  </Badge>
                                ) : null}
                                {isAuto ? (
                                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/8 px-2 py-0.5 text-[10px] text-emerald-400">
                                    ⚡ Auto-tracking
                                  </span>
                                ) : null}
                                {rems.slice(0, 2).map((r) => (
                                  <span
                                    key={r.id}
                                    className="inline-flex items-center gap-1 rounded-full border border-[var(--accent)]/30 bg-[var(--accent)]/8 px-2 py-0.5 text-[10px] text-[var(--accent)]"
                                  >
                                    <Bell className="h-2.5 w-2.5 shrink-0" />
                                    {describeMedicationReminder(r)}
                                  </span>
                                ))}
                              </div>
                            );
                          })()}
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            className="h-8 w-8 shrink-0 rounded-lg border border-[var(--border)] bg-[var(--panel)] text-[var(--fg)] grid place-items-center transition hover:bg-[var(--panel-2)]"
                            onClick={() => setActiveMedInfo(isOpen ? null : String(i))}
                            aria-label={
                              isOpen ? "Close medicine editor" : "Edit form, dose, stock, schedule, and usual time"
                            }
                            title={isOpen ? "Close" : "Edit medicine details"}
                          >
                            <Info className="h-4 w-4 shrink-0" />
                          </button>
                          <button
                            type="button"
                            className="h-8 w-8 shrink-0 rounded-lg border border-[var(--border)] bg-[var(--panel)] text-[var(--fg)] grid place-items-center"
                            onClick={() => removeMed(i)}
                            aria-label="Remove medicine"
                          >
                            <Trash2 className="h-4 w-4 shrink-0" />
                          </button>
                        </div>
                      </div>
                      {isOpen && (
                        <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-3 text-xs space-y-0">
                          {/* ── Section 1: Tracking toggle + Stock ── */}
                          <div className="flex flex-wrap items-center justify-between gap-2 pb-3">
                            <button
                              type="button"
                              onClick={() => {
                                const next = (m.trackingMode ?? "auto") === "auto" ? "manual" : "auto";
                                updateMed(i, { trackingMode: next });
                                setRecordNotice(
                                  next === "auto"
                                    ? `Auto mode — ${m.name} marked taken daily unless you log a miss.`
                                    : `Manual mode — log each dose yourself.`
                                );
                              }}
                              className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--panel-2)] px-3 py-1.5 text-xs transition-colors hover:border-[var(--accent)]/40"
                            >
                              <span
                                className={[
                                  "inline-block h-3 w-6 rounded-full transition-colors relative",
                                  (m.trackingMode ?? "auto") === "auto"
                                    ? "bg-[var(--accent)]"
                                    : "bg-[var(--border)]",
                                ].join(" ")}
                              >
                                <span
                                  className={[
                                    "absolute top-0.5 h-2 w-2 rounded-full bg-white transition-[left]",
                                    (m.trackingMode ?? "auto") === "auto" ? "left-3.5" : "left-0.5",
                                  ].join(" ")}
                                />
                              </span>
                              {(m.trackingMode ?? "auto") === "auto" ? "Auto-tracking" : "Manual"}
                            </button>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[11px] text-[var(--muted)] whitespace-nowrap">Stock left</span>
                              <Input
                                className="w-16 text-xs"
                                style={{ height: 32 }}
                                inputMode="numeric"
                                placeholder="0"
                                value={panelStockCount}
                                onChange={(e) => {
                                  setPanelStockCount(e.target.value);
                                  const n = Number(e.target.value.trim());
                                  if (Number.isFinite(n) && n >= 0 && n <= 99_999) {
                                    updateMed(i, { stockCount: Math.round(n) });
                                  }
                                }}
                              />
                            </div>
                          </div>

                          {/* ── Section 2: Dose details ── */}
                          <div className="grid grid-cols-3 gap-2 border-t border-[var(--border)] pt-3 pb-3">
                            <div>
                              <label className="block text-[11px] text-[var(--muted)] mb-1">Dose</label>
                              <div className="flex h-8 w-full items-center rounded-xl border border-[var(--border)] bg-[var(--panel-2)] focus-within:ring-2 focus-within:ring-[var(--ring)]">
                                <input
                                  className="h-full min-w-0 flex-[3] rounded-l-xl bg-transparent px-2 text-xs text-[var(--fg)] placeholder:text-[var(--muted)] outline-none"
                                  inputMode="decimal"
                                  placeholder="Amount"
                                  value={panelDoseAmount}
                                  onChange={(e) => {
                                    setPanelDoseAmount(e.target.value);
                                    if (!e.target.value.trim()) { savePanelDoseClear(i); return; }
                                    const patch = buildDoseFromUserInput(e.target.value, panelDoseUnit);
                                    if (patch) updateMed(i, patch);
                                  }}
                                />
                                <Select
                                  value={panelDoseUnit}
                                  onValueChange={(v) => {
                                    const unit = v as MedDoseUserUnit;
                                    setPanelDoseUnit(unit);
                                    if (panelDoseAmount.trim()) {
                                      const patch = buildDoseFromUserInput(panelDoseAmount, unit);
                                      if (patch) updateMed(i, patch);
                                    }
                                  }}
                                >
                                  <SelectTrigger
                                    className="uma-select shrink-0 rounded-none rounded-r-[11px] bg-[var(--panel)] px-1.5 text-[10px] text-[var(--muted)]"
                                    style={{ height: "100%", width: "auto", border: "none", borderLeft: "1px solid var(--border)", gap: 2, boxShadow: "none" }}
                                  >
                                    {MED_DOSE_USER_UNIT_OPTIONS.find((o) => o.value === panelDoseUnit)?.short ?? panelDoseUnit}
                                  </SelectTrigger>
                                  <SelectContent>
                                    {MED_DOSE_USER_UNIT_OPTIONS.map((o) => (
                                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                            <div>
                              <label className="block text-[11px] text-[var(--muted)] mb-1">Form</label>
                              <Select
                                value={panelMedForm}
                                onValueChange={(v) => {
                                  const val = v as MedicationFormKind;
                                  setPanelMedForm(val);
                                  if (val !== "other") {
                                    setPanelMedFormOther("");
                                    updateMed(i, {
                                      medicationForm: val === "unspecified" ? undefined : val,
                                      medicationFormOther: undefined,
                                    });
                                  }
                                }}
                              >
                                <SelectTrigger className="uma-select w-full rounded-xl border border-[var(--border)] bg-[var(--panel-2)] px-2 text-xs text-[var(--fg)]" style={{ height: 32 }}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {MEDICATION_FORM_OPTIONS.map((o) => (
                                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <label className="block text-[11px] text-[var(--muted)] mb-1">How often</label>
                              <Select
                                value={panelFreqPreset}
                                onValueChange={(v) => {
                                  const preset = v as MedFrequencyPresetId;
                                  setPanelFreqPreset(preset);
                                  if (preset !== "other") {
                                    const f = frequencyFromPreset(preset, panelFreqOther);
                                    updateMed(i, { frequency: f });
                                  }
                                }}
                              >
                                <SelectTrigger className="uma-select w-full rounded-xl border border-[var(--border)] bg-[var(--panel-2)] px-2 text-xs text-[var(--fg)]" style={{ height: 32 }}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {MED_FREQUENCY_PRESETS.map((p) => (
                                    <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          {panelMedForm === "other" && (
                            <div className="pb-3">
                              <Input className="h-8 text-xs" placeholder="Describe the form" value={panelMedFormOther} onChange={(e) => setPanelMedFormOther(e.target.value)} onBlur={() => savePanelMedicationForm(i)} />
                            </div>
                          )}
                          {panelFreqPreset === "other" && (
                            <div className="pb-3">
                              <Input className="h-8 text-xs" placeholder="Describe how often" value={panelFreqOther} onChange={(e) => setPanelFreqOther(e.target.value)} onBlur={() => savePanelSchedule(i)} />
                            </div>
                          )}

                          {/* ── Section 3: Usual time + Type ── */}
                          <div className="grid grid-cols-2 gap-2 border-t border-[var(--border)] pt-3 pb-3">
                            <div>
                              <label className="block text-[11px] text-[var(--muted)] mb-1">Usual time</label>
                              <TimePicker
                                placeholder="9:30 AM"
                                value={panelUsualTime}
                                onChange={(v) => {
                                  setPanelUsualTime(v);
                                  const normalized = normalizeUsualTimeHHmm(v);
                                  updateMed(i, { usualTimeLocalHHmm: normalized });
                                }}
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] text-[var(--muted)] mb-1">Type</label>
                              <Select
                                value={m.medicationProductCategory ?? "unspecified"}
                                onValueChange={(v) => updateMed(i, { medicationProductCategory: v as MedicationProductCategory, medicationProductCategorySource: "user" })}
                              >
                                <SelectTrigger className="uma-select w-full rounded-xl border border-[var(--border)] bg-[var(--panel-2)] px-2 text-xs text-[var(--fg)]" style={{ height: 32 }}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="unspecified">Not sure</SelectItem>
                                  <SelectItem value="over_the_counter">Over-the-counter</SelectItem>
                                  <SelectItem value="supplement">Supplement</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>

                          {/* ── Quick actions ── */}
                          <div className="flex flex-wrap gap-2 pt-2 border-t border-[var(--border)]">
                            <Button variant="ghost" className="h-8 px-3 text-xs" onClick={() => logMissedDose(i)}>
                              Missed a dose
                            </Button>
                            {(m.missedDoses ?? 0) > 0 && (
                              <span className="self-center text-xs text-[var(--muted)]">
                                {m.missedDoses} missed{m.lastMissedISO ? ` · last ${new Date(m.lastMissedISO).toLocaleDateString()}` : ""}
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )})
                )}
                {recentMeds.length > inlineMeds.length && (
                  <Button variant="ghost" className="w-full" onClick={() => setOverlay("meds")}>
                    Show more medicines
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
          );

          widgetNodes.healthLogs = (
            <DashboardHealthLogSection store={store} onStoreChange={updateStore} />
          );

          widgetNodes.healthTrends = trendCards.length > 0 ? (
            <HealthTrendsSection
              metrics={trendCards.map((t) => ({ name: t.name, data: t.raw }))}
              pinnedNames={pinnedTrendMetrics}
              onPinToggle={handlePinToggle}
            />
          ) : null;

          widgetNodes.labs = (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-[var(--accent)]" />
                  <h2 className="text-sm font-semibold">Recent test results</h2>
              </div>
              <div className="flex items-center gap-2">
                <Badge>{recentLabs.length} on screen</Badge>
                <div className="flex rounded-xl border border-[var(--border)] overflow-hidden text-xs">
                  <button type="button" onClick={() => setLabFilter("flagged")}
                    className={["px-2.5 py-1 font-medium transition-colors", labFilter === "flagged" ? "bg-[var(--accent)] text-[var(--accent-contrast)]" : "bg-transparent text-[var(--muted)] hover:text-[var(--fg)]"].join(" ")}>
                    Flagged
                  </button>
                  <button type="button" onClick={() => setLabFilter("all")}
                    className={["px-2.5 py-1 font-medium transition-colors", labFilter === "all" ? "bg-[var(--accent)] text-[var(--accent-contrast)]" : "bg-transparent text-[var(--muted)] hover:text-[var(--fg)]"].join(" ")}>
                    All
                  </button>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {(() => {
              const displayLabs = labFilter === "flagged" ? flaggedLabs.slice(0, 9) : inlineLabs;
              return (
                <>
                  {labFilter === "flagged" && flaggedLabs.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-emerald-500/30 bg-emerald-500/5 p-4 text-sm text-emerald-600">
                      ✓ All your latest results look normal.
                    </div>
                  ) : displayLabs.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-[var(--border)] p-6 text-sm mv-muted">
                      No test results yet. Upload a file to see them here.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                      {displayLabs.map((lab, idx) => (
                        <LabReadingTile key={`${lab.name}-${lab.date}-${idx}`} lab={lab} extensions={lex} />
                      ))}
                    </div>
                  )}
                  {labFilter === "all" && recentLabs.length > inlineLabs.length && (
                    <div className="mt-3">
                      <Button variant="ghost" className="w-full" onClick={() => setOverlay("labs")}>
                        Show more test results
                      </Button>
                    </div>
                  )}
                </>
              );
            })()}
          </CardContent>
        </Card>
          );

          return (
            <>
              {editMode && (
                <DashboardEditToolbar
                  layout={dashboardLayout}
                  onLayoutChange={handleDashboardLayoutChange}
                  onDone={() => setEditMode(false)}
                />
              )}
              {!editMode && (
                <div className="flex items-center justify-end -mt-2">
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-8 gap-1.5 px-3 text-xs"
                    onClick={() => setEditMode(true)}
                    title="Rearrange, add, or remove dashboard cards"
                  >
                    <Layers className="h-3.5 w-3.5" />
                    Edit dashboard
                  </Button>
                </div>
              )}
              <DashboardGrid
                layout={dashboardLayout}
                onLayoutChange={handleDashboardLayoutChange}
                editMode={editMode}
                renderWidget={(id) => widgetNodes[id] ?? null}
              />
            </>
          );
        })()}

      </main>

      <Footer />

      {printPortalEl
        ? createPortal(
            <section className="print-only px-8 py-10" aria-label="Doctor visit summary">
              <h1 className="text-2xl font-semibold">Summary for your doctor</h1>
              <p className="mt-1">Prepared for: {pf(store.profile.name)}</p>
              <p className="text-sm mv-muted">Generated on {new Date().toLocaleDateString()}</p>

              <div className="mt-6 space-y-4">
                <div>
                  <h2 className="text-lg font-semibold">About you</h2>
                  <p className="text-sm">
                    Birth date: {pf(store.profile.dob) || "—"} · Sex: {pf(store.profile.sex) || "—"} · Email:{" "}
                    {pf(store.profile.email) || "—"}
                  </p>
                  {store.profile.sex === "Female" &&
                  (store.profile.menstrualCycle?.lastPeriodStartISO ||
                    (store.profile.menstrualCycle?.flowLogDates?.length ?? 0) > 0) && (
                    <p className="text-sm mt-2">
                      Cycle: {pf(cycleSummary.headline)} · {pf(cycleSummary.detail)}
                      {cycleSummary.phaseLabel ? ` · ${cycleSummary.phaseLabel}` : ""}
                    </p>
                  )}
                </div>

                <div>
                  <h2 className="text-lg font-semibold">Allergies</h2>
                  <p className="text-sm">
                    {store.profile.allergies.length
                      ? store.profile.allergies.map((a) => pf(a)).filter(Boolean).join(", ")
                      : "None reported"}
                  </p>
                </div>

                <div>
                  <h2 className="text-lg font-semibold">Health issues</h2>
                  <p className="text-sm">
                    {store.profile.conditions.length
                      ? store.profile.conditions.map((c) => pf(c)).filter(Boolean).join(", ")
                      : "None reported"}
                  </p>
                </div>

                <div>
                  <h2 className="text-lg font-semibold">Medicines</h2>
                  {store.meds.length ? (
                    <ul className="text-sm list-disc pl-5">
                      {store.meds.map((m, i) => {
                        const dp = medDosePrimaryLine(m);
                        const ds = medDoseSecondaryLine(m);
                        return (
                          <li key={`${m.name}-${i}`}>
                            {pf(m.name)}
                            {dp ? `, ${pf(dp)}` : ""}
                            {ds ? (
                              <span className="text-xs text-[#444]">
                                {" "}
                                (you entered {pf(ds)})
                              </span>
                            ) : null}
                            {m.frequency ? `, ${pf(m.frequency)}` : ""}
                            {m.medicationForm && typeof m.medicationForm === "string" && isMedicationFormKind(m.medicationForm)
                              ? `, ${pf(medicationFormLabel(m.medicationForm, m.medicationFormOther))}`
                              : ""}
                            {formatUsualTimeHint(m.usualTimeLocalHHmm) ? `, usual time ${formatUsualTimeHint(m.usualTimeLocalHHmm)}` : ""}
                            {m.startDate ? ` (Start: ${pf(m.startDate)})` : ""}
                            {m.endDate ? ` (Stop: ${pf(m.endDate)})` : ""}
                            {m.notes ? ` — Notes: ${pf(m.notes)}` : ""}
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="text-sm">None listed</p>
                  )}
                </div>

                <div>
                  <h2 className="text-lg font-semibold">Recent test results</h2>
                  {visitPrintLabs.length ? (
                    <ul className="text-sm list-disc pl-5">
                      {visitPrintLabs.map((l, i) => (
                        <li key={`${l.name}-${i}`}>
                          {l.name}: {l.value}
                          {l.unit ? ` ${l.unit}` : ""}
                          {l.date ? ` (${l.date})` : ""}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm">None listed</p>
                  )}
                </div>
              </div>
              <p className="mt-8 text-xs mv-muted">Not medical advice. Bring questions to your doctor.</p>
            </section>,
            printPortalEl
          )
        : null}

      {overlay && (
        <div className="fixed inset-0 z-50 no-print flex items-end justify-center p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:items-center sm:p-5">
          <div
            className="absolute inset-0 bg-black/45"
            onClick={() => setOverlay(null)}
            aria-hidden="true"
          />
          <div className="relative z-10 flex w-full max-w-4xl max-h-[calc(100dvh-1.5rem)] flex-col overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--panel)] shadow-2xl sm:max-h-[min(90dvh,52rem)]">
            <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-5 py-4">
              <h3 className="font-semibold">
                {overlay === "reports"
                  ? "All files"
                  : overlay === "meds"
                  ? "All medicines"
                  : overlay === "labs"
                  ? "All test results"
                  : overlay === "add-med"
                  ? "Add a medicine"
                  : overlay === "add-report"
                  ? "Add a new file"
                  : "Upload a file"}
              </h3>
              <button
                type="button"
                onClick={() => setOverlay(null)}
                className="h-8 w-8 rounded-lg border border-[var(--border)] bg-[var(--panel-2)] text-[var(--fg)] grid place-items-center"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4">
              {overlay === "add-med" && (
                <div className="mx-auto max-w-md space-y-3">
                  <p className="text-sm mv-muted">
                    Add a medicine by hand. Pick a dose unit (we convert mass to mg, liquids to mL, and keep IU and
                    counts like tablets as you entered). UMA also guesses OTC vs supplement from the name—this is not
                    a formal drug database.
                  </p>
                  <Input
                    ref={medNameInputRef}
                    placeholder="Medicine name (required)"
                    value={newMed.name ?? ""}
                    onChange={(e) => setNewMed((m) => ({ ...m, name: e.target.value }))}
                  />
                  <div>
                    <p className="text-[11px] text-[var(--muted)] mb-1">Dose (optional)</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <Input
                        inputMode="decimal"
                        placeholder="Amount"
                        value={newMedDoseAmount}
                        onChange={(e) => setNewMedDoseAmount(e.target.value)}
                      />
                      <Select value={newMedDoseUnit} onValueChange={(v) => setNewMedDoseUnit(v as MedDoseUserUnit)}>
                        <SelectTrigger className="uma-select w-full rounded-2xl border border-[var(--border)] bg-[var(--panel)] py-2.5 px-3 text-sm text-[var(--fg)]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {MED_DOSE_USER_UNIT_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              {o.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {addMedDoseError ? <p className="text-xs text-[var(--accent-2)]">{addMedDoseError}</p> : null}
                  </div>
                  <div>
                    <p className="text-[11px] text-[var(--muted)] mb-1">How often</p>
                    <Select
                      value={newMedFrequencyPreset}
                      onValueChange={(v) => {
                        setNewMedFrequencyPreset(v as MedFrequencyPresetId);
                        setAddMedFreqError(null);
                      }}
                    >
                      <SelectTrigger className="uma-select w-full rounded-2xl border border-[var(--border)] bg-[var(--panel)] py-2.5 px-3 text-sm text-[var(--fg)]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MED_FREQUENCY_PRESETS.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {newMedFrequencyPreset === "other" ? (
                      <Input
                        className="mt-2"
                        placeholder="Describe how often (for example every morning with food)"
                        value={newMedFrequencyOther}
                        onChange={(e) => {
                          setNewMedFrequencyOther(e.target.value);
                          setAddMedFreqError(null);
                        }}
                      />
                    ) : null}
                    {addMedFreqError ? <p className="text-xs text-[var(--accent-2)] mt-1">{addMedFreqError}</p> : null}
                  </div>
                  <div>
                    <p className="text-[11px] text-[var(--muted)] mb-1">Form (optional)</p>
                    <Select
                      value={newMedForm}
                      onValueChange={(v) => {
                        const val = v as MedicationFormKind;
                        setNewMedForm(val);
                        if (val !== "other") setNewMedFormOther("");
                        setAddMedFormError(null);
                      }}
                    >
                      <SelectTrigger className="uma-select w-full rounded-2xl border border-[var(--border)] bg-[var(--panel)] py-2.5 px-3 text-sm text-[var(--fg)]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MEDICATION_FORM_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {newMedForm === "other" ? (
                      <Input
                        className="mt-2"
                        placeholder="Describe the form (for example lozenge)"
                        value={newMedFormOther}
                        onChange={(e) => {
                          setNewMedFormOther(e.target.value);
                          setAddMedFormError(null);
                        }}
                      />
                    ) : null}
                    {addMedFormError ? <p className="text-xs text-[var(--accent-2)] mt-1">{addMedFormError}</p> : null}
                  </div>
                  <div className="block text-[11px] text-[var(--muted)]">
                    Usual time (optional)
                    <div className="mt-1 max-w-[12rem]">
                      <TimePicker
                        value={newMedUsualTime}
                        onChange={(v) => setNewMedUsualTime(v)}
                      />
                    </div>
                  </div>
                  <Button
                    onClick={() => {
                      if (!newMed.name?.trim()) return;
                      if (!addMed()) return;
                      setOverlay(null);
                    }}
                    className="w-full gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    Save medicine
                  </Button>
                </div>
              )}

              {(overlay === "add-report" || overlay === "upload-report") && (
                <div className="mx-auto max-w-2xl space-y-4">
                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] p-4 space-y-3">
                    <p className="text-sm font-medium">
                      {overlay === "add-report" ? "Add a new file" : "Upload and read your file"}
                    </p>
                    <input
                      type="file"
                      accept="application/pdf"
                      multiple
                      onChange={(e) => {
                        const files = Array.from(e.target.files ?? []);
                        setUploadFiles(files);
                      }}
                      className="block w-full text-sm text-[var(--fg)] file:mr-4 file:rounded-xl file:border-0 file:bg-[var(--accent)] file:px-4 file:py-2 file:text-sm file:font-medium file:text-[var(--accent-contrast)] hover:file:brightness-110"
                    />
                    {overlay === "upload-report" && !store.profile.name?.trim() ? (
                      <div className="flex gap-2 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-3 text-xs text-[var(--muted)]">
                        <Info className="h-4 w-4 shrink-0 text-[var(--accent)] mt-0.5" aria-hidden />
                        <p>
                          Add your full name on the{" "}
                          <Link href="/profile" className="text-[var(--accent)] underline underline-offset-2 font-medium">
                            Profile
                          </Link>{" "}
                          page so UMA can check that a file is yours. If the name is blank, we skip that check.
                        </p>
                      </div>
                    ) : null}
                    {uploadError && (
                      <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-700">
                        {uploadError}
                      </div>
                    )}
                    {uploadLoading && (
                      <div className="flex items-center gap-2 rounded-xl border border-[var(--accent)]/30 bg-[var(--accent)]/8 px-3 py-2 text-xs text-[var(--fg)]">
                        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[var(--accent)]" />
                        <span>Reading your file — you can browse around while this runs.</span>
                      </div>
                    )}
                    {globalUpload.queuedFiles.length > 1 && (
                      <div className="inline-flex rounded-full bg-[var(--accent)]/15 px-3 py-1 text-xs font-medium text-[var(--accent)]">
                        File {uploadFileIndex + 1} of {globalUpload.queuedFiles.length}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Button onClick={extractUploadDoc} disabled={!uploadFile || uploadLoading} className="gap-2">
                        {uploadLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
                        {uploadLoading ? "Reading…" : "Read file"}
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          if (uploadLoading) {
                            // Close modal; extraction continues in background — badge will notify
                            setOverlay(null);
                          } else {
                            discardUploadPreview();
                            setOverlay(null);
                          }
                        }}
                      >
                        {uploadLoading ? "Continue in background" : "Cancel"}
                      </Button>
                    </div>
                  </div>

                  {uploadPreview && (
                    <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] p-4 space-y-3">
                      {uploadNameMismatch ? (
                        <div className="rounded-xl border border-amber-500/45 bg-amber-500/10 p-3 text-sm text-[var(--fg)] space-y-2">
                          <div className="flex items-start gap-2">
                            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" aria-hidden />
                            <div className="space-y-1 min-w-0">
                              <p className="font-medium">The name on this file does not match your profile</p>
                              <p className="text-xs mv-muted leading-relaxed">
                                UMA compares the name on your{" "}
                                <Link href="/profile" className="text-[var(--accent)] underline underline-offset-2">
                                  Profile
                                </Link>{" "}
                                to the name on the file. Here is what we saw:
                              </p>
                              <ul className="text-xs list-disc pl-4 space-y-0.5">
                                <li>
                                  <span className="mv-muted">Name in your profile:</span>{" "}
                                  <span className="font-medium text-[var(--fg)]">
                                    {uploadNameMismatch.profileDisplayName.trim()
                                      ? `"${uploadNameMismatch.profileDisplayName.trim()}"`
                                      : "(not set)"}
                                  </span>
                                </li>
                                <li>
                                  <span className="mv-muted">Name on this file:</span>{" "}
                                  <span className="font-medium text-[var(--fg)]">
                                    {uploadNameMismatch.namesOnDocument.length > 0
                                      ? uploadNameMismatch.namesOnDocument.map((n) => `"${n.trim()}"`).join(", ")
                                      : "(none found—the scan may be hard to read)"}
                                  </span>
                                </li>
                              </ul>
                              <p className="text-xs mv-muted leading-relaxed pt-1">
                                If it is still yours (nickname, married name, typo, or you are helping someone close),
                                you can add it. If it is the wrong person&apos;s file, tap{" "}
                                <span className="font-medium text-[var(--fg)]">Choose a different PDF</span> below.
                              </p>
                            </div>
                          </div>
                        </div>
                      ) : null}
                      <div>
                        <p className="text-sm font-semibold">{uploadPreview.title}</p>
                        <p className="text-xs mv-muted mt-1 line-clamp-3">{displaySummaryForDoc(uploadPreview)}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge>{uploadPreview.type}</Badge>
                        {uploadPreview.dateISO ? <Badge>Date: {uploadPreview.dateISO}</Badge> : null}
                        {uploadPreview.provider ? <Badge>Provider: {uploadPreview.provider}</Badge> : null}
                        {uploadPreview.artifactSlug ? (
                          <Badge className="font-mono text-[10px]">{uploadPreview.artifactSlug}.md</Badge>
                        ) : null}
                      </div>
                      {uploadPreview.markdownArtifact ? (
                        <p className="text-xs mv-muted">
                          We also saved a full written summary. You can open it on the file detail page after you
                          confirm.
                        </p>
                      ) : null}
                      {uploadExtractionCost ? (
                        <div className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-xs">
                          <p className="font-medium text-[var(--fg)] mb-1">Extraction cost</p>
                          {/* Extractor source badge */}
                          <div className="mb-2">
                            {uploadExtractionCost.extractorSource === "llamaparse" ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                                ⚡ LlamaParse + Claude Haiku
                                {uploadExtractionCost.llamaParseCredits
                                  ? ` · ${uploadExtractionCost.llamaParseCredits} credits`
                                  : ""}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-[var(--accent)]/15 px-2 py-0.5 text-[10px] font-medium text-[var(--accent)]">
                                🧠 Claude full PDF
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 mv-muted">
                            <span>Input: {uploadExtractionCost.inputTokens.toLocaleString()} tokens</span>
                            <span>Output: {uploadExtractionCost.outputTokens.toLocaleString()} tokens</span>
                            <span className="font-semibold text-[var(--fg)]">
                              Total: {uploadExtractionCost.totalUSD < 0.01
                                ? "<$0.01"
                                : `$${uploadExtractionCost.totalUSD.toFixed(4)}`}
                            </span>
                          </div>
                          <p className="mt-1 text-[10px] opacity-60">Model: {uploadExtractionCost.model}</p>
                        </div>
                      ) : null}
                      <div className="flex flex-wrap gap-2">
                        <Button onClick={() => void commitUploadDoc()}>
                          {uploadNameMismatch ? "Add anyway" : "Save to home screen"}
                        </Button>
                        {uploadNameMismatch ? (
                          <Button
                            variant="ghost"
                            onClick={discardUploadPreview}
                          >
                            Choose a different PDF
                          </Button>
                        ) : null}
                        <Button
                          variant="ghost"
                          onClick={discardUploadPreview}
                        >
                          Discard
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {overlay === "reports" &&
                recentDocs.map((d) => (
                  <div key={d.id} className="mb-2 rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] p-3">
                    <div className="flex items-center justify-between gap-2">
                      <Link href={`/docs/${d.id}`} className="font-semibold hover:underline">
                        {d.title}
                      </Link>
                      <span className="text-xs mv-muted">{d.dateISO || "-"}</span>
                    </div>
                    <p className="text-xs mv-muted mt-1 line-clamp-3">{displaySummaryForDoc(d)}</p>
                  </div>
                ))}
              {overlay === "meds" &&
                recentMeds.map((m, i) => {
                  const ovUsual = formatUsualTimeHint(m.usualTimeLocalHHmm);
                  const ovForm =
                    m.medicationForm && typeof m.medicationForm === "string" && isMedicationFormKind(m.medicationForm)
                      ? medicationFormLabel(m.medicationForm, m.medicationFormOther)
                      : "";
                  return (
                  <div key={`${m.name}-overlay-${i}`} className="mb-2 rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] p-3 space-y-2">
                    <div>
                      <p className="font-semibold">{m.name}</p>
                      <p className="text-xs mv-muted mt-1">
                        {[medDosePrimaryLine(m), ovForm, m.frequency, ovUsual ? `~${ovUsual}` : ""]
                          .filter(Boolean)
                          .join(" · ") || "Details not added"}
                      </p>
                      {m.medicationProductCategory && m.medicationProductCategory !== "unspecified" ? (
                        <div className="mt-2 flex flex-wrap gap-1">
                          <Badge className="text-[10px] py-0.5">
                            {medicationProductCategoryLabel(m.medicationProductCategory)}
                          </Badge>
                        </div>
                      ) : null}
                    </div>
                    <div className="block text-[11px] text-[var(--muted)]">
                      Type
                      <Select
                        value={m.medicationProductCategory ?? "unspecified"}
                        onValueChange={(v) =>
                          updateMed(i, {
                            medicationProductCategory: v as MedicationProductCategory,
                            medicationProductCategorySource: "user",
                          })
                        }
                      >
                        <SelectTrigger className="uma-select mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--panel)] py-2 text-xs text-[var(--fg)]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unspecified">Not sure / mixed</SelectItem>
                          <SelectItem value="over_the_counter">Over-the-counter</SelectItem>
                          <SelectItem value="supplement">Vitamin or supplement</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  );
                })}
              {overlay === "labs" && (
                <div className="grid gap-2 sm:grid-cols-2">
                  {recentLabs.map((l, i) => (
                    <LabReadingTile key={`${l.name}-overlay-${i}`} lab={l} extensions={lex} />
                  ))}
                </div>
              )}
            </div>

            {/* No blocking overlay — user can close the modal and browse while extraction runs in background */}
          </div>
        </div>
      )}

      <RecordNoticeToast message={recordNotice} onDismiss={dismissRecordNotice} />
      <RecordNoticeToast
        message={uploadFailNotice}
        onDismiss={() => { dismissUploadFailNotice(); globalUpload.clear(); }}
        kind="error"
      />
    </div>
  );
}
