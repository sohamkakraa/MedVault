"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { AppTopNav } from "@/components/nav/AppTopNav";
import { DashboardHealthLogSection } from "@/components/health/DashboardHealthLogSection";
import { HealthTrendsSection } from "@/components/labs/HealthTrendsSection";
import { LabReadingTile } from "@/components/labs/LabReadingTile";
import { RecordNoticeToast } from "@/components/ui/RecordNoticeToast";
import { getHydrationSafeStore, getStore, saveStore, removeDoc, mergeExtractedDoc, detectDocumentLabOverlap } from "@/lib/store";
import { useGlobalUpload } from "@/lib/uploadContext";
import {
  DocType,
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
import {
  Activity,
  AlertTriangle,
  Bell,
  Calendar,
  ClipboardList,
  Info,
  FileText,
  FileUp,
  HeartPulse,
  Loader2,
  Pill,
  Plus,
  RotateCw,
  Trash2,
  User,
  X,
  Droplets,
} from "lucide-react";

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
      date: cursor.toLocaleDateString(undefined, { month: "short", year: "2-digit" }),
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
const UPLOAD_TYPES: DocType[] = ["Lab report", "Prescription", "Bill", "Imaging", "Other"];

export default function DashboardPage() {
  const [store, setStore] = useState(() => getHydrationSafeStore());
  const [printing, setPrinting] = useState(false);
  const [overlay, setOverlay] = useState<OverlayKind>(null);
  const [activeMedInfo, setActiveMedInfo] = useState<string | null>(null);
  const medNameInputRef = useRef<HTMLInputElement | null>(null);
  const printFallbackTimerRef = useRef<number | null>(null);
  const globalUpload = useGlobalUpload();

  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadType, setUploadType] = useState<DocType>("Lab report");
  // uploadLoading now mirrors the global context phase so navigation doesn't cancel the fetch
  const uploadLoading = globalUpload.phase === "extracting";
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadPreview, setUploadPreview] = useState<ExtractedDoc | null>(null);
  const [uploadLexiconPatches, setUploadLexiconPatches] = useState<StandardLexiconEntry[]>([]);
  const [uploadNameMismatch, setUploadNameMismatch] = useState<{
    namesOnDocument: string[];
    profileDisplayName: string;
  } | null>(null);
  const [recordNotice, setRecordNotice] = useState<string | null>(null);
  const dismissRecordNotice = useCallback(() => setRecordNotice(null), []);
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
    setStore(getStore());
    const onFocus = () => setStore(getStore());
    window.addEventListener("focus", onFocus);
    const onStorage = (e: StorageEvent) => {
      if (e.key === "mv_patient_store_v1") setStore(getStore());
    };
    const onCustom = () => setStore(getStore());
    window.addEventListener("storage", onStorage);
    window.addEventListener("mv-store-update", onCustom as EventListener);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("mv-store-update", onCustom as EventListener);
    };
  }, []);

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, "");
    if (!hash) return;
    requestAnimationFrame(() => {
      document.getElementById(hash)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, []);

  // When a background extraction finishes (user may have navigated away and returned),
  // promote the result into the local preview state so the review card appears.
  useEffect(() => {
    if (globalUpload.phase === "ready" && globalUpload.result && !uploadPreview) {
      setUploadPreview(globalUpload.result.doc);
      setUploadLexiconPatches(globalUpload.result.lexiconPatches);
      setUploadNameMismatch(globalUpload.result.nameMismatch ?? null);
      setUploadError(null);
      setRecordNotice("Your PDF is ready. Check the summary below, then tap Add to records.");
    }
    if (globalUpload.phase === "error" && globalUpload.error) {
      setUploadError(globalUpload.error);
    }
  }, [globalUpload.phase, globalUpload.result, globalUpload.error, uploadPreview]);

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
    saveStore(next);
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
    setUploadFile(null);
    setUploadPreview(null);
    setUploadLexiconPatches([]);
    setUploadNameMismatch(null);
    setUploadError(null);
    globalUpload.clear();
  }

  function extractUploadDoc() {
    if (!uploadFile) return;
    setUploadError(null);
    setUploadPreview(null);
    setUploadLexiconPatches([]);
    setUploadNameMismatch(null);
    // Hand off to the layout-level context so the fetch survives navigation
    globalUpload.startExtract({
      file: uploadFile,
      typeHint: uploadType,
      patientName: store.profile.name?.trim() ?? "",
      existingContentHashes: store.docs.map((d) => d.contentHash).filter(Boolean) as string[],
      standardLexicon: store.standardLexicon ?? [],
    });
  }

  async function commitUploadDoc() {
    if (!uploadPreview) return;
    let doc: ExtractedDoc = uploadPreview;
    if (uploadFile) {
      try {
        const originalPdfBase64 = await readFileAsBase64(uploadFile);
        doc = { ...uploadPreview, originalPdfBase64 };
      } catch {
        doc = uploadPreview;
      }
    }
    const currentStore = getStore();
    const overlapInfo = detectDocumentLabOverlap(doc, currentStore.docs, currentStore.standardLexicon ?? []);
    const next = mergeExtractedDoc(doc, {
      standardLexiconPatches: uploadLexiconPatches,
    });
    setStore(next);
    setUploadFile(null);
    setUploadPreview(null);
    setUploadLexiconPatches([]);
    setUploadNameMismatch(null);
    setUploadError(null);
    setOverlay(null);
    const baseNotice = "Saved. Your home screen, file list, and charts now include this report.";
    const overlapNotice = overlapInfo
      ? ` Note: this report shares ${Math.round(overlapInfo.overlapPct * 100)}% of its labs with "${overlapInfo.overlappingDocTitle}" — duplicate lab values are deduped automatically.`
      : "";
    setRecordNotice(baseNotice + overlapNotice);
    globalUpload.clear();
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

  const lex = store.standardLexicon;
  const hba1c = useMemo(() => toChartPoints(store.labs, "HbA1c", lex), [store.labs, lex]);
  const ldl = useMemo(() => toChartPoints(store.labs, "LDL", lex), [store.labs, lex]);
  const trendMap: Record<string, Array<{ date: string; value: number | null }>> = useMemo(
    () => ({
      HbA1c: hba1c,
      LDL: ldl,
      HDL: toChartPoints(store.labs, "HDL", lex),
      Triglycerides: toChartPoints(store.labs, "Triglycerides", lex),
      Glucose: toChartPoints(store.labs, "Glucose", lex),
      RBC: toChartPoints(store.labs, "RBC", lex),
      WBC: toChartPoints(store.labs, "WBC", lex),
      Hemoglobin: toChartPoints(store.labs, "Hemoglobin", lex),
      Platelets: toChartPoints(store.labs, "Platelets", lex),
      Creatinine: toChartPoints(store.labs, "Creatinine", lex),
    }),
    [hba1c, ldl, store.labs, lex]
  );
  const selectedTrends = (store.profile.trends ?? ["HbA1c", "LDL"]).slice(0, 6);
  const trendCards = selectedTrends
    .map((name) => ({
      name,
      raw: trendMap[name] ?? [],
    }))
    .filter((x) => x.raw.length > 0)
    .map((x) => ({ ...x, data: toSixMonthSeries(x.raw) }));

  const recentLabs = useMemo(() => {
    return store.labs
      .slice()
      .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))
      .slice(0, 30);
  }, [store.labs]);

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
        ? ` Recent period-flow days: ${flowDates
            .slice()
            .sort()
            .reverse()
            .slice(0, 6)
            .join(", ")}${flowDates.length > 6 ? "…" : ""}.`
        : "";
    const phase = s.phaseLabel ? ` Rough phase guess (not medical): ${s.phaseLabel}.` : "";
    const len = mc?.typicalCycleLengthDays
      ? ` Typical cycle length you entered: ${mc.typicalCycleLengthDays} days.`
      : "";
    const last = mc?.lastPeriodStartISO?.trim()
      ? ` Last period start you entered: ${mc.lastPeriodStartISO}.`
      : "";
    return `${s.headline}. ${s.detail}.${phase}${len}${last}${recentFlow} These are rough guesses, not medical advice. Tap Profile to edit.`;
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

  const dobBadgeTitle = useMemo(() => {
    const d = store.profile.dob?.trim();
    return d
      ? `Birth date on file: ${d}. Tap Profile to edit.`
      : "Birth date not set. Tap Profile to add it.";
  }, [store.profile.dob]);

  const inlineDocs = recentDocs.slice(0, 4);
  const inlineMeds = recentMeds.slice(0, 4);
  const inlineLabs = recentLabs.slice(0, 9);

  return (
    <div className="min-h-screen pb-24">
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
      <AppTopNav
        rightSlot={
          <Button className="h-9 gap-2" onClick={() => setOverlay("upload-report")}>
            <FileUp className="h-4 w-4" /> Upload a file
          </Button>
        }
      />

      <main className="mx-auto max-w-6xl px-4 py-8 space-y-6 no-print">
        <section className="mv-card rounded-3xl p-6 mv-surface">
          <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
            <div>
              <p className="text-xs uppercase tracking-[0.16em] mv-muted">At a glance</p>
              <h2 className="mt-2 text-3xl font-semibold mv-title">{store.profile.name || "You"}</h2>
              <p className="mt-2 text-sm mv-muted max-w-xl">
                Your newest files, medicines, and main test trends in one place—handy before you see your doctor.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Badge
                  as="button"
                  type="button"
                  className="snapshot-badge"
                  title={dobBadgeTitle}
                  aria-label={dobBadgeTitle}
                  onClick={() => {
                    window.location.href = "/profile#profile-patient-details";
                  }}
                >
                  <Calendar className="mr-1 h-3 w-3" />
                  Birth date: {store.profile.dob || "Not set"}
                </Badge>
                <Badge
                  as="button"
                  type="button"
                  className="snapshot-badge"
                  title={conditionBadgeTitle}
                  aria-label={conditionBadgeTitle}
                  onClick={() => {
                    window.location.href = "/profile#profile-conditions";
                  }}
                >
                  {store.profile.conditions.length} health issues
                </Badge>
                <Badge
                  as="button"
                  type="button"
                  className="snapshot-badge"
                  title={allergyBadgeTitle}
                  aria-label={allergyBadgeTitle}
                  onClick={() => {
                    window.location.href = "/profile#profile-allergies";
                  }}
                >
                  {store.profile.allergies.length} allergy notes
                </Badge>
                <Badge
                  as="button"
                  type="button"
                  className="snapshot-badge"
                  title={docBadgeTitle}
                  aria-label={docBadgeTitle}
                  onClick={() => {
                    window.location.href = "/dashboard#dashboard-latest-reports";
                  }}
                >
                  {store.docs.length} saved files
                </Badge>
                {store.profile.menstrualCycle?.lastPeriodStartISO ||
                (store.profile.menstrualCycle?.flowLogDates?.length ?? 0) > 0 ? (
                  <span className="inline-block max-w-[min(100%,20rem)]">
                    <Badge
                      as="button"
                      type="button"
                      className="snapshot-badge max-w-full min-w-0 truncate"
                      title={cycleBadgeTitle}
                      aria-label={cycleBadgeTitle}
                      onClick={() => {
                        window.location.href = "/profile#profile-cycle-tracking";
                      }}
                    >
                      <Droplets className="mr-1 h-3 w-3 shrink-0" />
                      <span className="min-w-0 truncate">
                        {cycleSummary.headline} · {cycleSummary.detail}
                      </span>
                    </Badge>
                  </span>
                ) : null}
              </div>
            </div>
            <Card className="rounded-2xl">
              <CardContent className="space-y-3">
                <p className="text-xs uppercase tracking-[0.14em] mv-muted">Coming up</p>
                <div className="flex items-start gap-2">
                  <HeartPulse className="h-4 w-4 mt-1 text-[var(--accent)]" />
                  <div>
                    <p className="text-sm font-medium">Regular doctor</p>
                    <p className="text-sm mv-muted">{store.profile.primaryCareProvider || "Not added yet"}</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Calendar className="h-4 w-4 mt-1 text-[var(--accent-2)]" />
                  <div>
                    <p className="text-sm font-medium">Next visit</p>
                    <p className="text-sm mv-muted">{store.profile.nextVisitDate || "No visit date yet"}</p>
                  </div>
                </div>
                <Button variant="ghost" className="w-full gap-2" onClick={() => (window.location.href = "/profile")}>
                  <User className="h-4 w-4" /> Edit profile
                </Button>
              </CardContent>
            </Card>
          </div>
        </section>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="py-4">
              <p className="text-xs uppercase tracking-[0.1em] mv-muted">Medicines</p>
              <p className="mt-2 text-2xl font-semibold">{store.meds.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <p className="text-xs uppercase tracking-[0.1em] mv-muted">Test results</p>
              <p className="mt-2 text-2xl font-semibold">{store.labs.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <p className="text-xs uppercase tracking-[0.1em] mv-muted">Last updated</p>
              <p className="mt-2 text-sm font-medium">{new Date(store.updatedAtISO).toLocaleDateString()}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4">
              <Button
                type="button"
                onClick={printVisitSummary}
                className="w-full gap-2"
                disabled={printing}
                title="In the print dialog, choose Save as PDF for a file. If the preview looks empty, wait for the page to finish loading and try again."
              >
                <ClipboardList className="h-4 w-4" />
                {printing ? "Opening print…" : "Print or save as PDF"}
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card id="dashboard-latest-reports" className="scroll-mt-24">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-[var(--accent-2)]" />
                  <h3 className="text-sm font-semibold">Newest files</h3>
                </div>
                <Button variant="ghost" className="h-8 px-3" onClick={() => setOverlay("add-report")}>
                  Add new
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {inlineDocs.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[var(--border)] p-4 text-sm mv-muted">
                  No files yet. Upload something to start your list.
                </div>
              ) : (
                <div className="max-h-[340px] overflow-y-auto pr-1 space-y-3">
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

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Pill className="h-4 w-4 text-[var(--accent)]" />
                  <h3 className="text-sm font-semibold">Your medicines</h3>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Badge>{store.meds.length}</Badge>
                  <Link
                    href="#health-logs"
                    className="text-xs font-medium text-[var(--accent)] underline-offset-2 hover:underline"
                  >
                    Health journal
                  </Link>
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
                    const doseSub = medDoseSecondaryLine(m);
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
                          {doseSub ? (
                            <p className="text-[10px] mv-muted mt-0.5">You entered: {doseSub}</p>
                          ) : null}
                          {m.medicationProductCategory && m.medicationProductCategory !== "unspecified" ? (
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              <Badge className="text-[10px] py-0.5">
                                {medicationProductCategoryLabel(m.medicationProductCategory)}
                              </Badge>
                            </div>
                          ) : null}
                          {/* Active reminder indicator */}
                          {(() => {
                            const rems = remindersByMedKey[m.name.trim().toLowerCase()] ?? [];
                            if (!rems.length) return null;
                            return (
                              <div className="mt-1.5 flex flex-wrap gap-1">
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
                        <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-3 text-xs space-y-3">
                          <p>
                            <span className="font-semibold">When to take it:</span>{" "}
                            {nextDoseWindow(m.frequency, m.usualTimeLocalHHmm)}
                          </p>
                          <p>
                            <span className="font-semibold">About how many doses left:</span> {remaining}
                          </p>
                          <p className="mv-muted">
                            This count is a rough guess from your schedule and stock. Set your pack size below so it
                            stays accurate.
                          </p>
                          <div className="space-y-1.5">
                            <p className="font-semibold text-[11px]">Pills or doses left (pack size)</p>
                            <div className="flex flex-wrap items-center gap-2">
                              <Input
                                className="h-9 w-24 text-xs"
                                inputMode="numeric"
                                placeholder="Count"
                                value={panelStockCount}
                                onChange={(e) => setPanelStockCount(e.target.value)}
                              />
                              <Button type="button" variant="ghost" className="h-8 px-3 text-xs" onClick={() => savePanelStock(i)}>
                                Save count
                              </Button>
                              <Button variant="ghost" className="h-8 px-3 gap-1 text-xs" onClick={() => refillMed(i)}>
                                <RotateCw className="h-3.5 w-3.5" /> Quick refill (30)
                              </Button>
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button variant="ghost" className="h-8 px-3" onClick={() => logMissedDose(i)}>
                              I missed a dose
                            </Button>
                          </div>
                          {(m.missedDoses ?? 0) > 0 && (
                            <p className="mv-muted">
                              Missed doses noted: {m.missedDoses} {m.lastMissedISO ? `(last: ${m.lastMissedISO})` : ""}
                            </p>
                          )}
                          <div className="pt-2 border-t border-[var(--border)] space-y-2">
                            <p className="font-semibold text-[11px]">Journal · dose log</p>
                            <p className="text-[10px] mv-muted leading-snug">
                              Adds one dated line to your health journal for this medicine.
                            </p>
                            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                              <label className="block text-[10px] text-[var(--muted)]">
                                When
                                <Input
                                  className="mt-0.5 h-8 text-[11px]"
                                  type="datetime-local"
                                  value={panelIntakeWhen}
                                  onChange={(e) => setPanelIntakeWhen(e.target.value)}
                                />
                              </label>
                              <label className="block text-[10px] text-[var(--muted)]">
                                What happened
                                <select
                                  className="uma-select mt-0.5 h-8 w-full rounded-xl border border-[var(--border)] bg-[var(--panel)] px-2 text-[11px] text-[var(--fg)]"
                                  value={panelIntakeAction}
                                  onChange={(e) =>
                                    setPanelIntakeAction(e.target.value as MedicationIntakeLogEntry["action"])
                                  }
                                >
                                  <option value="taken">Took it</option>
                                  <option value="missed">Missed</option>
                                  <option value="skipped">Skipped on purpose</option>
                                  <option value="extra">Extra dose</option>
                                </select>
                              </label>
                            </div>
                            <div className="grid grid-cols-2 gap-1.5">
                              <Input
                                className="h-8 text-[11px]"
                                inputMode="decimal"
                                placeholder="Amount (optional)"
                                value={panelIntakeAmount}
                                onChange={(e) => setPanelIntakeAmount(e.target.value)}
                              />
                              <select
                                className="uma-select h-8 rounded-xl border border-[var(--border)] bg-[var(--panel)] px-2 text-[11px] text-[var(--fg)]"
                                value={panelIntakeUnit}
                                onChange={(e) => setPanelIntakeUnit(e.target.value as MedDoseUserUnit)}
                              >
                                {MED_DOSE_USER_UNIT_OPTIONS.map((o) => (
                                  <option key={o.value} value={o.value}>
                                    {o.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <Input
                              className="h-8 text-[11px]"
                              placeholder="Notes (optional)"
                              value={panelIntakeNotes}
                              onChange={(e) => setPanelIntakeNotes(e.target.value)}
                            />
                            {panelIntakeDoseError ? (
                              <p className="text-[10px] text-[var(--accent-2)]">{panelIntakeDoseError}</p>
                            ) : null}
                            <Button
                              type="button"
                              variant="ghost"
                              className="h-8 w-full px-3 text-xs gap-1"
                              onClick={() => panelSaveIntakeLog(i)}
                            >
                              <Activity className="h-3.5 w-3.5" />
                              Save to journal
                            </Button>
                          </div>
                          <div className="pt-2 border-t border-[var(--border)] space-y-2">
                            <p className="font-semibold text-[11px]">Form</p>
                            <p className="text-[10px] mv-muted leading-snug">
                              Pill, capsule, injection, cream, and so on — for your own records, not a clinical code.
                            </p>
                            <select
                              className="uma-select w-full rounded-xl border border-[var(--border)] bg-[var(--panel)] py-2 text-xs text-[var(--fg)]"
                              value={panelMedForm}
                              onChange={(e) => {
                                const v = e.target.value as MedicationFormKind;
                                setPanelMedForm(v);
                                if (v !== "other") setPanelMedFormOther("");
                              }}
                            >
                              {MEDICATION_FORM_OPTIONS.map((o) => (
                                <option key={o.value} value={o.value}>
                                  {o.label}
                                </option>
                              ))}
                            </select>
                            {panelMedForm === "other" ? (
                              <Input
                                className="h-9 text-xs mt-1"
                                placeholder="Describe the form"
                                value={panelMedFormOther}
                                onChange={(e) => setPanelMedFormOther(e.target.value)}
                              />
                            ) : null}
                            <Button
                              type="button"
                              variant="ghost"
                              className="h-8 px-3 text-xs w-full"
                              onClick={() => savePanelMedicationForm(i)}
                            >
                              Save form
                            </Button>
                          </div>
                          <div className="pt-2 border-t border-[var(--border)] space-y-2">
                            <p className="font-semibold text-[11px]">Dose</p>
                            <p className="text-[10px] mv-muted leading-snug">
                              Stored as mg for solids, mL for liquids, IU where that applies, or as a count (tablets,
                              puffs, etc.). Your original amount stays as a note when we convert.
                            </p>
                            <div className="grid grid-cols-2 gap-2">
                              <Input
                                className="h-9 text-xs"
                                inputMode="decimal"
                                placeholder="Amount"
                                value={panelDoseAmount}
                                onChange={(e) => setPanelDoseAmount(e.target.value)}
                              />
                              <select
                                className="uma-select h-9 rounded-xl border border-[var(--border)] bg-[var(--panel)] px-2 text-xs text-[var(--fg)]"
                                value={panelDoseUnit}
                                onChange={(e) => setPanelDoseUnit(e.target.value as MedDoseUserUnit)}
                              >
                                {MED_DOSE_USER_UNIT_OPTIONS.map((o) => (
                                  <option key={o.value} value={o.value}>
                                    {o.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Button type="button" variant="ghost" className="h-8 px-3 text-xs" onClick={() => savePanelDose(i)}>
                                Save dose
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                className="h-8 px-3 text-xs"
                                onClick={() => savePanelDoseClear(i)}
                              >
                                Clear dose
                              </Button>
                            </div>
                          </div>
                          <div className="pt-2 border-t border-[var(--border)] space-y-2">
                            <p className="font-semibold text-[11px]">How often</p>
                            <select
                              className="uma-select w-full rounded-xl border border-[var(--border)] bg-[var(--panel)] py-2 text-xs text-[var(--fg)]"
                              value={panelFreqPreset}
                              onChange={(e) => setPanelFreqPreset(e.target.value as MedFrequencyPresetId)}
                            >
                              {MED_FREQUENCY_PRESETS.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.label}
                                </option>
                              ))}
                            </select>
                            {panelFreqPreset === "other" ? (
                              <Input
                                className="h-9 text-xs mt-1"
                                placeholder="Describe how often"
                                value={panelFreqOther}
                                onChange={(e) => setPanelFreqOther(e.target.value)}
                              />
                            ) : null}
                            <Button
                              type="button"
                              variant="ghost"
                              className="h-8 px-3 text-xs w-full"
                              onClick={() => {
                                savePanelSchedule(i);
                                setRecordNotice("Schedule saved.");
                              }}
                            >
                              Save schedule
                            </Button>
                          </div>
                          <div className="pt-2 border-t border-[var(--border)] space-y-2">
                            <p className="font-semibold text-[11px]">Usual time (optional)</p>
                            <p className="text-[10px] mv-muted leading-snug">
                              Shown on your summary. For a daily nudge in this browser, add a reminder in the section
                              below.
                            </p>
                            <Input
                              className="h-9 text-xs w-full max-w-[12rem]"
                              type="time"
                              value={panelUsualTime}
                              onChange={(e) => setPanelUsualTime(e.target.value)}
                            />
                            <div className="flex flex-wrap gap-2">
                              <Button type="button" variant="ghost" className="h-8 px-3 text-xs" onClick={() => savePanelUsualTime(i)}>
                                Save usual time
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                className="h-8 px-3 text-xs"
                                onClick={() => {
                                  setPanelUsualTime("");
                                  updateMed(i, { usualTimeLocalHHmm: undefined });
                                  setRecordNotice("Usual time cleared.");
                                }}
                              >
                                Clear time
                              </Button>
                            </div>
                          </div>
                          <div className="pt-2 border-t border-[var(--border)] space-y-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="font-semibold text-[11px]">Reminders · {m.name}</p>
                              <Button
                                type="button"
                                variant="ghost"
                                className="h-7 gap-1 px-2 text-[10px]"
                                onClick={() => void panelRequestNotifications()}
                              >
                                <Bell className="h-3 w-3" aria-hidden />
                                Allow notifications
                              </Button>
                            </div>
                            <p className="text-[10px] mv-muted leading-snug">
                              Fires only while UMA is open in a tab you allow to notify — not a substitute for clinical
                              follow-up.
                            </p>
                            {panelRemHint ? <p className="text-[10px] text-[var(--fg)]">{panelRemHint}</p> : null}
                            <label className="flex items-center gap-2 text-[10px] text-[var(--muted)] cursor-pointer select-none">
                              <input
                                type="checkbox"
                                className="h-3.5 w-3.5 rounded border-[var(--border)] accent-[var(--accent)]"
                                checked={panelRemRepeatDaily}
                                onChange={(e) => setPanelRemRepeatDaily(e.target.checked)}
                              />
                              Repeat every day
                            </label>
                            {panelRemRepeatDaily ? (
                              <label className="block text-[10px] text-[var(--muted)]">
                                Time
                                <Input
                                  className="mt-0.5 h-8 text-[11px] w-full max-w-[9rem]"
                                  type="time"
                                  value={panelRemTime}
                                  onChange={(e) => setPanelRemTime(e.target.value)}
                                />
                              </label>
                            ) : (
                              <label className="block text-[10px] text-[var(--muted)]">
                                One-time when
                                <Input
                                  className="mt-0.5 h-8 text-[11px]"
                                  type="datetime-local"
                                  value={panelRemOnceWhen}
                                  onChange={(e) => setPanelRemOnceWhen(e.target.value)}
                                />
                              </label>
                            )}
                            <label className="block text-[10px] text-[var(--muted)]">
                              Notes (optional)
                              <Input
                                className="mt-0.5 h-8 text-[11px]"
                                value={panelRemNotes}
                                onChange={(e) => setPanelRemNotes(e.target.value)}
                              />
                            </label>
                            <Button
                              type="button"
                              variant="ghost"
                              className="h-8 w-full gap-1 text-xs"
                              onClick={() => panelAddReminder(i)}
                            >
                              <Bell className="h-3.5 w-3.5" />
                              Save reminder
                            </Button>
                            <div className="space-y-1 max-h-40 overflow-y-auto pr-0.5">
                              {panelMedReminderRows.length === 0 ? (
                                <p className="text-[10px] mv-muted py-1">No reminders for this medicine yet.</p>
                              ) : (
                                panelMedReminderRows.map((r) => {
                                  const next = nextReminderFireAt(r);
                                  const nextLabel = next
                                    ? `Next: ${next.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}`
                                    : r.enabled
                                      ? r.repeatDaily
                                        ? "—"
                                        : "Passed"
                                      : "Off";
                                  return (
                                    <div
                                      key={r.id}
                                      className="flex flex-wrap items-start justify-between gap-1 rounded-lg border border-[var(--border)] bg-[var(--panel-2)] p-2 text-[10px]"
                                    >
                                      <div className="min-w-0">
                                        <p className="font-medium leading-tight">{describeMedicationReminder(r)}</p>
                                        <p className="text-[var(--muted)] mt-0.5">{nextLabel}</p>
                                        {r.notes ? <p className="mt-0.5 line-clamp-2">{r.notes}</p> : null}
                                      </div>
                                      <div className="flex shrink-0 items-center gap-1">
                                        <label className="flex items-center gap-0.5 text-[10px] text-[var(--muted)] cursor-pointer whitespace-nowrap">
                                          <input
                                            type="checkbox"
                                            className="h-3 w-3 rounded border-[var(--border)] accent-[var(--accent)]"
                                            checked={r.enabled}
                                            onChange={(e) => panelSetReminderEnabled(r.id, e.target.checked)}
                                          />
                                          On
                                        </label>
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          className="h-7 px-1.5 text-[10px]"
                                          onClick={() => panelDeleteReminder(r.id)}
                                        >
                                          Remove
                                        </Button>
                                      </div>
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          </div>
                          <div className="pt-2 border-t border-[var(--border)] space-y-2">
                            <label className="block text-[11px] text-[var(--muted)]">
                              Type (store-bought vs supplement)
                              <select
                                className="uma-select mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--panel)] py-2 text-xs text-[var(--fg)]"
                                value={m.medicationProductCategory ?? "unspecified"}
                                onChange={(e) =>
                                  updateMed(i, {
                                    medicationProductCategory: e.target.value as MedicationProductCategory,
                                    medicationProductCategorySource: "user",
                                  })
                                }
                              >
                                <option value="unspecified">Not sure / mixed</option>
                                <option value="over_the_counter">Over-the-counter</option>
                                <option value="supplement">Vitamin or supplement</option>
                              </select>
                            </label>
                            <Button
                              variant="ghost"
                              className="h-8 px-2 text-xs w-full"
                              type="button"
                              onClick={() =>
                                updateMed(i, {
                                  medicationProductCategory: inferMedicationProductCategory(m.name),
                                  medicationProductCategorySource: "auto",
                                })
                              }
                            >
                              Guess again from the name
                            </Button>
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
        </div>

        <DashboardHealthLogSection store={store} onStoreChange={updateStore} />

        <HealthTrendsSection
          metrics={trendCards.map((t) => ({ name: t.name, data: t.raw }))}
        />
        {trendCards.length === 0 && (
          <Card>
            <CardContent className="text-sm mv-muted">
              Charts show up after you save at least one test result.
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-[var(--accent)]" />
                <h2 className="text-sm font-semibold">Recent test results</h2>
              </div>
              <Badge>{recentLabs.length} on screen</Badge>
            </div>
          </CardHeader>
          <CardContent>
            {inlineLabs.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[var(--border)] p-6 text-sm mv-muted">
                No test results yet. Upload a file to see them here.
              </div>
            ) : (
              <div className="max-h-[300px] overflow-y-auto pr-1 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                {inlineLabs.map((lab, idx) => (
                  <LabReadingTile key={`${lab.name}-${lab.date}-${idx}`} lab={lab} extensions={lex} />
                ))}
              </div>
            )}
            {recentLabs.length > inlineLabs.length && (
              <div className="mt-3">
                <Button variant="ghost" className="w-full" onClick={() => setOverlay("labs")}>
                  Show more test results
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <p className="text-xs mv-muted">
          This screen helps you keep your health files tidy. It is not medical advice. Always talk to your doctor about
          care decisions.
        </p>
      </main>

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
                  {(store.profile.menstrualCycle?.lastPeriodStartISO ||
                    (store.profile.menstrualCycle?.flowLogDates?.length ?? 0) > 0) && (
                    <p className="text-sm mt-2">
                      Cycle (early test): {pf(cycleSummary.headline)} · {pf(cycleSummary.detail)}
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
            className={`absolute inset-0 bg-black/45 ${uploadLoading ? "cursor-wait" : ""}`}
            onClick={() => {
              if (!uploadLoading) setOverlay(null);
            }}
            aria-hidden={uploadLoading}
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
                disabled={uploadLoading}
                onClick={() => {
                  if (!uploadLoading) setOverlay(null);
                }}
                className="h-8 w-8 rounded-lg border border-[var(--border)] bg-[var(--panel-2)] text-[var(--fg)] grid place-items-center disabled:opacity-40 disabled:pointer-events-none"
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
                      <select
                        className="uma-select w-full rounded-2xl border border-[var(--border)] bg-[var(--panel)] py-2.5 px-3 text-sm text-[var(--fg)]"
                        value={newMedDoseUnit}
                        onChange={(e) => setNewMedDoseUnit(e.target.value as MedDoseUserUnit)}
                      >
                        {MED_DOSE_USER_UNIT_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    {addMedDoseError ? <p className="text-xs text-[var(--accent-2)]">{addMedDoseError}</p> : null}
                  </div>
                  <div>
                    <p className="text-[11px] text-[var(--muted)] mb-1">How often</p>
                    <select
                      className="uma-select w-full rounded-2xl border border-[var(--border)] bg-[var(--panel)] py-2.5 px-3 text-sm text-[var(--fg)]"
                      value={newMedFrequencyPreset}
                      onChange={(e) => {
                        setNewMedFrequencyPreset(e.target.value as MedFrequencyPresetId);
                        setAddMedFreqError(null);
                      }}
                    >
                      {MED_FREQUENCY_PRESETS.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </select>
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
                    <select
                      className="uma-select w-full rounded-2xl border border-[var(--border)] bg-[var(--panel)] py-2.5 px-3 text-sm text-[var(--fg)]"
                      value={newMedForm}
                      onChange={(e) => {
                        const v = e.target.value as MedicationFormKind;
                        setNewMedForm(v);
                        if (v !== "other") setNewMedFormOther("");
                        setAddMedFormError(null);
                      }}
                    >
                      {MEDICATION_FORM_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
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
                  <label className="block text-[11px] text-[var(--muted)]">
                    Usual time (optional)
                    <Input
                      className="mt-1 h-10 text-sm max-w-[12rem]"
                      type="time"
                      value={newMedUsualTime}
                      onChange={(e) => setNewMedUsualTime(e.target.value)}
                    />
                  </label>
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
                    <div className="flex flex-wrap gap-2">
                      {UPLOAD_TYPES.map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setUploadType(t)}
                          className={[
                            "rounded-full border px-3 py-1 text-xs transition",
                            t === uploadType
                              ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)]"
                              : "border-[var(--border)] bg-[var(--panel)] text-[var(--fg)]",
                          ].join(" ")}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                    <input
                      type="file"
                      accept="application/pdf"
                      onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
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
                    <div className="flex gap-2">
                      <Button onClick={extractUploadDoc} disabled={!uploadFile || uploadLoading} className="gap-2">
                        {uploadLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
                        {uploadLoading ? "Reading file..." : "Read file"}
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={uploadLoading}
                        onClick={() => {
                          discardUploadPreview();
                          setOverlay(null);
                        }}
                      >
                        Cancel
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
                      {medDoseSecondaryLine(m) ? (
                        <p className="text-[10px] mv-muted mt-0.5">You entered: {medDoseSecondaryLine(m)}</p>
                      ) : null}
                      {m.medicationProductCategory && m.medicationProductCategory !== "unspecified" ? (
                        <div className="mt-2 flex flex-wrap gap-1">
                          <Badge className="text-[10px] py-0.5">
                            {medicationProductCategoryLabel(m.medicationProductCategory)}
                          </Badge>
                        </div>
                      ) : null}
                    </div>
                    <label className="block text-[11px] text-[var(--muted)]">
                      Type
                      <select
                        className="uma-select mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--panel)] py-2 text-xs text-[var(--fg)]"
                        value={m.medicationProductCategory ?? "unspecified"}
                        onChange={(e) =>
                          updateMed(i, {
                            medicationProductCategory: e.target.value as MedicationProductCategory,
                            medicationProductCategorySource: "user",
                          })
                        }
                      >
                        <option value="unspecified">Not sure / mixed</option>
                        <option value="over_the_counter">Over-the-counter</option>
                        <option value="supplement">Vitamin or supplement</option>
                      </select>
                    </label>
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

            {uploadLoading && (overlay === "upload-report" || overlay === "add-report") ? (
              <div
                className="absolute inset-0 z-[60] overflow-y-auto overscroll-contain rounded-3xl bg-[var(--bg)]/88 backdrop-blur-[3px]"
                role="progressbar"
                aria-valuetext="Reading file"
                aria-busy="true"
              >
                <div className="flex min-h-full flex-col items-center justify-center gap-4 px-4 py-8 sm:gap-5 sm:px-6">
                  <Loader2 className="h-10 w-10 shrink-0 animate-spin text-[var(--accent)] sm:h-12 sm:w-12" aria-hidden />
                  <div className="max-w-sm text-center space-y-2">
                    <p className="text-sm font-semibold text-[var(--fg)]">Reading your PDF…</p>
                    <p className="text-xs mv-muted leading-relaxed">
                      UMA is pulling out test results, medicines, and a short summary. Long or scanned files can take up
                      to a minute—please keep this tab open.
                    </p>
                  </div>
                  <div className="h-1.5 w-full max-w-xs shrink-0 rounded-full bg-[var(--border)] overflow-hidden">
                    <div
                      className="h-full w-2/5 rounded-full bg-[var(--accent)]"
                      style={{ animation: "umaExtractBar 1.8s ease-in-out infinite" }}
                    />
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      <RecordNoticeToast message={recordNotice} onDismiss={dismissRecordNotice} />
    </div>
  );
}
