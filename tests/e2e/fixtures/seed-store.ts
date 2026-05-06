import type { Page } from "@playwright/test";

export const ARJUN_FIXTURE = {
  docs: [],
  meds: [
    { id: "m1", name: "Metformin", dose: "500mg", frequency: "Twice daily" },
    { id: "m2", name: "Atorvastatin", dose: "10mg", frequency: "Once daily" },
  ],
  labs: [
    { id: "l1", name: "HbA1c", value: "6.2", unit: "%", date: "2026-03-15", refRange: "< 5.7" },
    { id: "l2", name: "LDL", value: "145", unit: "mg/dL", date: "2026-03-15", refRange: "< 100", status: "above" },
  ],
  profile: {
    name: "Arjun Mehta",
    dob: "1955-04-12",
    sex: "Male",
    primaryCareProvider: "Dr. Asha Iyer",
    conditions: ["Type 2 Diabetes", "Hypertension"],
    allergies: ["Penicillin"],
    trends: ["HbA1c", "LDL"],
    bodyMetrics: { heightCm: 175, weightKg: 76 },
  },
  healthLogs: {
    bloodPressure: [],
    sideEffects: [],
    medicationIntake: [],
    medicationReminders: [],
  },
  preferences: { theme: "system" },
  updatedAtISO: new Date().toISOString(),
};

export async function seedPatientStore(page: Page, fixture = ARJUN_FIXTURE): Promise<void> {
  await page.evaluate((data) => {
    localStorage.setItem("mv_patient_store_v1", JSON.stringify(data));
  }, fixture);
  await page.reload();
  await page.waitForTimeout(1500);
}
