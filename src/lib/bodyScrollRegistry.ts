/**
 * Body view: scroll-linked anatomy assets under /public/body/.
 * Filenames use design-tool exports, e.g. `Callout=Brain.svg`,
 * `Reproductive Organ=Male.svg`. Paths are URI-encoded for `=`, spaces, `&`.
 */

export type OrganGroupId = "male" | "female" | "none";

export type BodyScrollSectionId =
  | "intro"
  | "brain"
  | "eyes"
  | "nervous-system"
  | "thyroid"
  | "thymus"
  | "heart"
  | "lungs"
  | "circulatory-system"
  | "respiratory-system"
  | "immune-system"
  | "liver-gallbladder"
  | "pancreas"
  | "stomach"
  | "small-intestine"
  | "large-intestine"
  | "appendix"
  | "spleen"
  | "digestive-system"
  | "kidneys-bladder"
  | "excretory-system"
  | "female-reproductive-system"
  | "female-endocrine-system"
  | "male-endocrine-system"
  | "male-reproductive-system";

export type BodyScrollSection = {
  id: BodyScrollSectionId;
  title: string;
  subtitle: string;
  description: string;
  /** Intro uses organ-group only; others resolve via ORGAN_CALLOUT_FILE. */
  organAssetId: OrganGroupId | BodyScrollSectionId;
  mode: "organ-group" | "organ";
  labKeys: string[];
  color: string;
  cardSide: "left" | "right" | "none";
  /** Omit on sections that apply to everyone */
  onlyFor?: OrganGroupId[];
};

function publicAssetUrl(dir: "organs" | "organ-groups", filename: string): string {
  return `/body/${dir}/${encodeURIComponent(filename)}`;
}

const GROUP_FILE: Record<OrganGroupId, string> = {
  male: "Reproductive Organ=Male.svg",
  female: "Reproductive Organ=Female.svg",
  none: "Reproductive Organ=None.svg",
};

/** Maps scroll section organ id → exact filename in `public/body/organs/`. */
const ORGAN_CALLOUT_FILE: Record<Exclude<BodyScrollSectionId, "intro">, string> = {
  brain: "Callout=Brain.svg",
  eyes: "Callout=Eyes.svg",
  "nervous-system": "Callout=Nervous System.svg",
  thyroid: "Callout=Thyroid.svg",
  thymus: "Callout=Thymus.svg",
  heart: "Callout=Heart.svg",
  lungs: "Callout=Lungs.svg",
  "circulatory-system": "Callout=Circulatory System.svg",
  "respiratory-system": "Callout=Respiratory System.svg",
  "immune-system": "Callout=Imune System.svg",
  "liver-gallbladder": "Callout=Liver & Gallbladder.svg",
  pancreas: "Callout=Pancreas.svg",
  stomach: "Callout=Stomach.svg",
  "small-intestine": "Callout=Small Intestine.svg",
  "large-intestine": "Callout=Large Intestine.svg",
  appendix: "Callout=Apendix.svg",
  spleen: "Callout=Spleen.svg",
  "digestive-system": "Callout=Digestive System.svg",
  "kidneys-bladder": "Callout=Kidneys & Bladder.svg",
  "excretory-system": "Callout=Excretory System.svg",
  "female-reproductive-system": "Callout=Female Reproductive System.svg",
  "female-endocrine-system": "Callout=Female Endocrine System.svg",
  "male-endocrine-system": "Callout=Male Endocrine System.svg",
  "male-reproductive-system": "Callout=Male Reproductive System.svg",
};

export function organGroupAssetUrl(group: OrganGroupId): string {
  return publicAssetUrl("organ-groups", GROUP_FILE[group]);
}

export function organGroupFromProfileSex(sex: string | undefined): OrganGroupId {
  const s = (sex ?? "").trim().toLowerCase();
  if (s.startsWith("f")) return "female";
  if (s.startsWith("m")) return "male";
  return "none";
}

/** Full scroll order: intro (organ group) → brain → downward; reproductive slides filtered by `onlyFor`. */
export const BODY_SCROLL_SECTIONS: BodyScrollSection[] = [
  {
    id: "intro",
    title: "Your body at a glance",
    subtitle: "Health overview",
    description:
      "A simple map built from the records you saved. Scroll down from head to toe—each stop shows a body area and any related test results.",
    organAssetId: "none",
    mode: "organ-group",
    labKeys: [],
    color: "#00e5ff",
    cardSide: "none",
  },
  {
    id: "brain",
    title: "Brain",
    subtitle: "Nervous system",
    description:
      "Your brain coordinates thought, memory, and autonomic control. Imaging and cognitive notes live here when you add them; lab markers are less common than for other organs.",
    organAssetId: "brain",
    mode: "organ",
    labKeys: [],
    color: "#74c0fc",
    cardSide: "right",
  },
  {
    id: "eyes",
    title: "Eyes",
    subtitle: "Sensory",
    description:
      "Vision depends on clear media and healthy retinal tissue. Routine checks and symptom notes belong in your records conversation with your clinician.",
    organAssetId: "eyes",
    mode: "organ",
    labKeys: [],
    color: "#4dabf7",
    cardSide: "left",
  },
  {
    id: "nervous-system",
    title: "Nervous system",
    subtitle: "Whole-body signalling",
    description:
      "Brain, spinal cord, and peripheral nerves carry signals everywhere. Stress, sleep, and neurological follow-ups are best interpreted with your care team.",
    organAssetId: "nervous-system",
    mode: "organ",
    labKeys: [],
    color: "#339af0",
    cardSide: "right",
  },
  {
    id: "thyroid",
    title: "Thyroid",
    subtitle: "Endocrine",
    description:
      "This gland sets the pace for metabolism and energy. TSH, T3, and T4 are common labs your uploads may already include.",
    organAssetId: "thyroid",
    mode: "organ",
    labKeys: ["TSH", "T3", "T4"],
    color: "#da77f2",
    cardSide: "right",
  },
  {
    id: "thymus",
    title: "Thymus",
    subtitle: "Immune maturation",
    description:
      "Most active early in life; it trains immune cells. Adults rarely see dedicated thymus labs — context usually comes from specialist notes.",
    organAssetId: "thymus",
    mode: "organ",
    labKeys: [],
    color: "#e599f7",
    cardSide: "left",
  },
  {
    id: "heart",
    title: "Heart",
    subtitle: "Circulation",
    description:
      "Your heart moves blood through the lungs and body. LDL, HDL, triglycerides, and cholesterol panels reflect cardiovascular risk alongside blood pressure trends.",
    organAssetId: "heart",
    mode: "organ",
    labKeys: ["LDL", "HDL", "Total Cholesterol", "Triglycerides"],
    color: "#ff6b6b",
    cardSide: "left",
  },
  {
    id: "lungs",
    title: "Lungs",
    subtitle: "Respiratory",
    description:
      "Gas exchange and oxygen delivery. Spirometry and imaging summaries often matter more than single blood numbers — upload visit notes when you have them.",
    organAssetId: "lungs",
    mode: "organ",
    labKeys: [],
    color: "#66d9e8",
    cardSide: "right",
  },
  {
    id: "circulatory-system",
    title: "Circulatory system",
    subtitle: "Heart and vessels",
    description:
      "Arteries and veins carry nutrients and waste. Lipid panels and inflammatory markers sometimes appear together in metabolic check-ups.",
    organAssetId: "circulatory-system",
    mode: "organ",
    labKeys: ["LDL", "HDL", "Triglycerides"],
    color: "#ff8787",
    cardSide: "left",
  },
  {
    id: "respiratory-system",
    title: "Respiratory system",
    subtitle: "Airways and lungs",
    description:
      "From nose to alveoli, this system keeps oxygen flowing. Combine lifestyle notes with clinician guidance for symptoms that persist.",
    organAssetId: "respiratory-system",
    mode: "organ",
    labKeys: [],
    color: "#3bc9db",
    cardSide: "right",
  },
  {
    id: "immune-system",
    title: "Immune system",
    subtitle: "Defence and repair",
    description:
      "White cells, antibodies, and lymph tissue respond to infection. WBC subsets and CRP sometimes appear on your lab PDFs.",
    organAssetId: "immune-system",
    mode: "organ",
    labKeys: ["WBC", "Platelets", "CRP"],
    color: "#f06595",
    cardSide: "left",
  },
  {
    id: "liver-gallbladder",
    title: "Liver and gallbladder",
    subtitle: "Digestion and detox",
    description:
      "The liver processes nutrients and medications; the gallbladder stores bile. AST, ALT, ALP, and GGT reflect stress on liver cells.",
    organAssetId: "liver-gallbladder",
    mode: "organ",
    labKeys: ["AST", "ALT", "ALP", "GGT"],
    color: "#69db7c",
    cardSide: "right",
  },
  {
    id: "pancreas",
    title: "Pancreas",
    subtitle: "Metabolism",
    description:
      "Produces insulin and digestive enzymes. HbA1c and glucose track how tightly blood sugar is controlled over time.",
    organAssetId: "pancreas",
    mode: "organ",
    labKeys: ["HbA1c", "Glucose"],
    color: "#ffa94d",
    cardSide: "right",
  },
  {
    id: "stomach",
    title: "Stomach",
    subtitle: "Upper digestion",
    description:
      "Breaks down food before the small intestine. Specific stomach labs are uncommon in routine panels — endoscopy reports carry more detail when you upload them.",
    organAssetId: "stomach",
    mode: "organ",
    labKeys: [],
    color: "#ffd43b",
    cardSide: "left",
  },
  {
    id: "small-intestine",
    title: "Small intestine",
    subtitle: "Absorption",
    description:
      "Most nutrient absorption happens here. Vitamin B12 and iron studies sometimes hint at absorption issues alongside symptoms.",
    organAssetId: "small-intestine",
    mode: "organ",
    labKeys: ["B12", "Iron", "Ferritin"],
    color: "#a9e34b",
    cardSide: "right",
  },
  {
    id: "large-intestine",
    title: "Large intestine",
    subtitle: "Colon",
    description:
      "Water reabsorption and stool formation. Screening and symptom diaries matter alongside occasional inflammatory markers.",
    organAssetId: "large-intestine",
    mode: "organ",
    labKeys: [],
    color: "#8ce99a",
    cardSide: "left",
  },
  {
    id: "appendix",
    title: "Appendix",
    subtitle: "Immune adjunct",
    description:
      "A small pouch off the colon; when inflamed it needs urgent care. Routine blood work rarely targets the appendix alone.",
    organAssetId: "appendix",
    mode: "organ",
    labKeys: ["WBC"],
    color: "#63e6be",
    cardSide: "right",
  },
  {
    id: "spleen",
    title: "Spleen",
    subtitle: "Blood filtration",
    description:
      "Stores platelets and filters blood cells. Platelet counts and imaging notes sometimes relate to spleen size or function.",
    organAssetId: "spleen",
    mode: "organ",
    labKeys: ["Platelets", "WBC"],
    color: "#20c997",
    cardSide: "left",
  },
  {
    id: "digestive-system",
    title: "Digestive system",
    subtitle: "GI tract overview",
    description:
      "Mouth to anus — one continuous pathway. Combine uploaded reports for a fuller picture than any single lab.",
    organAssetId: "digestive-system",
    mode: "organ",
    labKeys: [],
    color: "#94d82d",
    cardSide: "right",
  },
  {
    id: "kidneys-bladder",
    title: "Kidneys and bladder",
    subtitle: "Filtration and storage",
    description:
      "Kidneys clear waste into urine; the bladder stores it. Creatinine, BUN, and eGFR describe filtration in many lab reports.",
    organAssetId: "kidneys-bladder",
    mode: "organ",
    labKeys: ["Creatinine", "Urea", "BUN"],
    color: "#74c0fc",
    cardSide: "left",
  },
  {
    id: "excretory-system",
    title: "Excretory system",
    subtitle: "Waste removal",
    description:
      "Kidneys, ureters, bladder, and urethra. Electrolytes and acid–base balance often travel with renal panels.",
    organAssetId: "excretory-system",
    mode: "organ",
    labKeys: ["Creatinine", "BUN", "Sodium", "Potassium"],
    color: "#4dabf7",
    cardSide: "right",
  },
  {
    id: "female-reproductive-system",
    title: "Female reproductive system",
    subtitle: "Reproductive health",
    description:
      "Uterus, ovaries, and associated structures. Hormone panels and cycle notes pair with specialist visits — always discuss changes with your clinician.",
    organAssetId: "female-reproductive-system",
    mode: "organ",
    labKeys: [],
    color: "#f783ac",
    cardSide: "left",
    onlyFor: ["female"],
  },
  {
    id: "female-endocrine-system",
    title: "Female endocrine system",
    subtitle: "Hormonal balance",
    description:
      "Overlaps thyroid, ovaries, and pituitary signals. Upload endocrine labs and visit summaries for richer context in UMA.",
    organAssetId: "female-endocrine-system",
    mode: "organ",
    labKeys: ["TSH", "Estradiol", "Progesterone", "FSH", "LH"],
    color: "#faa2c1",
    cardSide: "right",
    onlyFor: ["female"],
  },
  {
    id: "male-endocrine-system",
    title: "Male endocrine system",
    subtitle: "Hormonal balance",
    description:
      "Testosterone, pituitary signals, and thyroid overlap on many panels. Use UMA to gather uploads; your clinician interprets trends and symptoms together.",
    organAssetId: "male-endocrine-system",
    mode: "organ",
    labKeys: ["Testosterone", "TSH", "T4"],
    color: "#93b4ff",
    cardSide: "right",
    onlyFor: ["male"],
  },
  {
    id: "male-reproductive-system",
    title: "Male reproductive system",
    subtitle: "Reproductive health",
    description:
      "Prostate and related structures — screening guidelines depend on age and risk. PSA appears on some routine panels; interpretation belongs with your doctor.",
    organAssetId: "male-reproductive-system",
    mode: "organ",
    labKeys: ["PSA", "Testosterone"],
    color: "#91a7ff",
    cardSide: "left",
    onlyFor: ["male"],
  },
];

export function resolveBodyScrollSections(group: OrganGroupId): BodyScrollSection[] {
  return BODY_SCROLL_SECTIONS.filter((s) => {
    if (s.id === "intro") {
      return true;
    }
    if (!s.onlyFor?.length) return true;
    return s.onlyFor.includes(group);
  }).map((s) => {
    if (s.id !== "intro") return s;
    return { ...s, organAssetId: group };
  });
}

export function assetUrlForSection(section: BodyScrollSection): string {
  if (section.mode === "organ-group") {
    return publicAssetUrl("organ-groups", GROUP_FILE[section.organAssetId as OrganGroupId]);
  }
  const organId = section.organAssetId as Exclude<BodyScrollSectionId, "intro">;
  return publicAssetUrl("organs", ORGAN_CALLOUT_FILE[organId]);
}
