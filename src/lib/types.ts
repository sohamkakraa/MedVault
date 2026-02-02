export type DocType = "Lab report" | "Prescription" | "Bill" | "Imaging" | "Other";

export type ExtractedMedication = {
  name: string;
  dose?: string;
  frequency?: string;
  route?: string;
  startDate?: string;
  endDate?: string;
  notes?: string; // adherence notes or med-specific notes
};

export type ExtractedLab = {
  name: string;
  value: string;
  unit?: string;
  refRange?: string;
  date?: string;
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
};

export type PatientStore = {
  docs: ExtractedDoc[];
  meds: ExtractedMedication[]; // “current list” – built from confirmed docs + manual updates later
  labs: ExtractedLab[];
  profile: {
    name: string;
    dob?: string;
    sex?: string;
    email?: string;
    phone?: string;
    primaryCareProvider?: string;
    nextVisitDate?: string;
    trends?: string[];
    allergies: string[];
    conditions: string[];
    notes?: string;
  };
  preferences: {
    theme: "dark" | "light";
  };
  updatedAtISO: string;
};
