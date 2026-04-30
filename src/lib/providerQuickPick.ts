import type { ExtractedDoc, PatientStore } from "@/lib/types";

export function normPickKey(s: string): string {
  return s.trim().toLowerCase();
}

export function doctorNamesFromDocs(docs: ExtractedDoc[]): string[] {
  const names = new Set<string>();
  for (const doc of docs) {
    doc.doctors?.forEach((d) => {
      const t = d.trim();
      if (t) names.add(t);
    });
    const p = doc.provider?.trim();
    if (p) names.add(p);
  }
  return [...names];
}

export function facilityNamesFromDocs(docs: ExtractedDoc[]): string[] {
  const seen = new Map<string, string>(); // lowercase key → preferred casing
  for (const doc of docs) {
    const f = doc.facilityName?.trim();
    if (f && !seen.has(f.toLowerCase())) seen.set(f.toLowerCase(), f);
  }
  return [...seen.values()];
}

type DoctorPickProfile = Pick<
  PatientStore["profile"],
  "primaryCareProvider" | "doctorQuickPick" | "doctorQuickPickHidden"
>;

export function mergeDoctorQuickPick(profile: DoctorPickProfile, fromDocuments: string[]): string[] {
  const hidden = new Set((profile.doctorQuickPickHidden ?? []).map(normPickKey));
  const seen = new Map<string, string>();
  for (const raw of fromDocuments) {
    const t = raw.trim();
    if (!t || hidden.has(normPickKey(t))) continue;
    if (!seen.has(normPickKey(t))) seen.set(normPickKey(t), t);
  }
  for (const raw of profile.doctorQuickPick ?? []) {
    const t = raw.trim();
    if (t && !seen.has(normPickKey(t))) seen.set(normPickKey(t), t);
  }
  if (profile.primaryCareProvider?.trim()) {
    const t = profile.primaryCareProvider.trim();
    if (!seen.has(normPickKey(t))) seen.set(normPickKey(t), t);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

type FacilityPickProfile = Pick<
  PatientStore["profile"],
  "nextVisitHospital" | "facilityQuickPick" | "facilityQuickPickHidden"
>;

export function mergeFacilityQuickPick(profile: FacilityPickProfile, fromDocuments: string[]): string[] {
  const hidden = new Set((profile.facilityQuickPickHidden ?? []).map(normPickKey));
  const seen = new Map<string, string>();
  for (const raw of fromDocuments) {
    const t = raw.trim();
    if (!t || hidden.has(normPickKey(t))) continue;
    if (!seen.has(normPickKey(t))) seen.set(normPickKey(t), t);
  }
  for (const raw of profile.facilityQuickPick ?? []) {
    const t = raw.trim();
    if (t && !seen.has(normPickKey(t))) seen.set(normPickKey(t), t);
  }
  if (profile.nextVisitHospital?.trim()) {
    const t = profile.nextVisitHospital.trim();
    if (!seen.has(normPickKey(t))) seen.set(normPickKey(t), t);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}
