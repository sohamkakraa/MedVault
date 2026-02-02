import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import type { DocType, ExtractedDoc, ExtractedLab, ExtractedMedication } from "@/lib/types";
import { createRequire } from "module";

export const runtime = "nodejs";

const require = createRequire(import.meta.url);

const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5-nano";

const EXTRACT_SCHEMA = {
  name: "medical_report_extract",
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      type: { type: "string", enum: ["Lab report", "Prescription", "Bill", "Imaging", "Other"] },
      title: { type: "string" },
      dateISO: { type: ["string", "null"] },
      provider: { type: ["string", "null"] },
      summary: { type: "string" },
      document_id: { type: "string" },
      family_history: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            relation: { type: "string" },
            condition: { type: "string" },
            note: { type: ["string", "null"] },
          },
          required: ["relation", "condition"],
        },
      },
      reminders: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            title: { type: "string" },
            date: { type: ["string", "null"] },
            instruction: { type: "string" },
            source: { type: ["string", "null"] },
          },
          required: ["title", "instruction"],
        },
      },
      map_intents: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            query: { type: "string" },
            reason: { type: "string" },
          },
          required: ["query", "reason"],
        },
      },
      panels_detected: { type: "array", items: { type: "string" } },
      tracker_updates: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            tracker_id_or_key: { type: "string" },
            panel_name: { type: "string" },
            date: { type: ["string", "null"] },
            value_numeric: { type: ["number", "null"] },
            value_raw: { type: ["string", "null"] },
            unit: { type: ["string", "null"] },
            reference_range: { type: ["string", "null"] },
            flag: { type: ["string", "null"] },
            source_document_id: { type: "string" },
            dedupe_key: { type: ["string", "null"] },
          },
          required: ["tracker_id_or_key", "panel_name", "source_document_id"],
        },
      },
      lab_rows: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            test_name_raw: { type: "string" },
            test_name_canonical: { type: ["string", "null"] },
            value_raw: { type: ["string", "null"] },
            value_numeric: { type: ["number", "null"] },
            unit: { type: ["string", "null"] },
            reference_range: { type: ["string", "null"] },
            flag: { type: ["string", "null"] },
            specimen_date: { type: ["string", "null"] },
            report_date: { type: ["string", "null"] },
          },
          required: ["test_name_raw"],
        },
      },
      medications: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            name: { type: "string" },
            dose: { type: ["string", "null"] },
            frequency: { type: ["string", "null"] },
            route: { type: ["string", "null"] },
            startDate: { type: ["string", "null"] },
            endDate: { type: ["string", "null"] },
            notes: { type: ["string", "null"] },
          },
          required: ["name"],
        },
      },
      labs: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            name: { type: "string" },
            value: { type: "string" },
            unit: { type: ["string", "null"] },
            refRange: { type: ["string", "null"] },
            date: { type: ["string", "null"] },
          },
          required: ["name", "value"],
        },
      },
      allergies: { type: "array", items: { type: "string" } },
      conditions: { type: "array", items: { type: "string" } },
      sections: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            title: { type: "string" },
            items: { type: "array", items: { type: "string" } },
          },
          required: ["title", "items"],
        },
      },
    },
    required: [
      "type",
      "title",
      "summary",
      "document_id",
      "medications",
      "labs",
      "allergies",
      "conditions",
      "sections",
      "family_history",
      "reminders",
      "map_intents",
      "panels_detected",
      "tracker_updates",
      "lab_rows"
    ],
  },
  strict: true,
};

async function extractWithOpenAI(text: string, typeHint: string) {
  const OpenAI = (await import("openai")).default;
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const prompt = [
    "You are a medical document extraction engine.",
    "Return ONLY valid JSON that strictly conforms to the provided JSON Schema.",
    "Do not include markdown, explanations, or any extra keys.",
    "Extract only what is explicitly present in the text. No inference, no diagnosis, no medical advice.",
    "Use ISO dates (YYYY-MM-DD) when possible; otherwise null.",
    "Use empty arrays for missing collections. If a required field is missing, output null or empty array as appropriate.",
    "",
    "IDENTIFICATION",
    "- Identify the document type: Lab report / Prescription / Bill / Imaging / Other.",
    "",
    "SUMMARIZATION",
    "- Write a brief summary of the document content for UI display.",
    "",
    "NORMALIZATION (use these canonical biomarker names if detected):",
    "- Glycosylated Hemoglobin / Hemoglobin A1c / HbA1c => HbA1c",
    "- Low Density Lipoprotein / LDL Cholesterol / LDL => LDL",
    "- High Density Lipoprotein / HDL Cholesterol / HDL => HDL",
    "- Triglyceride(s) / TG => Triglycerides",
    "- Total Cholesterol / Cholesterol (when clearly total) => Total Cholesterol",
    "- Aspartate Aminotransferase / AST / SGOT => AST",
    "- Alanine Aminotransferase / ALT / SGPT => ALT",
    "- Alkaline Phosphatase / ALP => ALP",
    "- Gamma Glutamyl Transferase / GGT => GGT",
    "- Thyroid Stimulating Hormone / TSH => TSH",
    "- Triiodothyronine / T3 / TT3 => T3",
    "- Thyroxine / T4 / TT4 => T4",
    "- Creatinine => Creatinine",
    "- Urea / BUN => Urea or BUN (match text naming)",
    "- Uric Acid => Uric Acid",
    "- Hemoglobin => Hemoglobin",
    "- White Blood Cell / WBC => WBC",
    "- Red Blood Cell / RBC => RBC",
    "- Platelet(s) => Platelets",
    "- Hematocrit / HCT => Hematocrit",
    "- Mean Corpuscular Volume / MCV => MCV",
    "- Mean Corpuscular Hemoglobin / MCH => MCH",
    "- Mean Corpuscular Hemoglobin Concentration / MCHC => MCHC",
    "- Red Cell Distribution Width / RDW => RDW",
    "- Sodium / Na => Sodium",
    "- Potassium / K => Potassium",
    "- Chloride / Cl => Chloride",
    "- Calcium / Ca => Calcium",
    "- Iron => Iron",
    "- Total Iron Binding Capacity / TIBC => TIBC",
    "- Transferrin => Transferrin",
    "- Iron Saturation / % Saturation / Transferrin Saturation => Iron Saturation",
    "",
    "PANEL ROUTING (assign each canonical biomarker to exactly one panel):",
    "- CBC: Hemoglobin, RBC, WBC, Platelets, Hematocrit, MCV, MCH, MCHC, RDW, differentials",
    "- Glucose & HbA1c: HbA1c, Fasting/Random Glucose, Mean Blood Glucose",
    "- Lipid Profile: Total Cholesterol, LDL, HDL, Triglycerides, VLDL, Non-HDL, lipid ratios",
    "- Kidney Function & Electrolytes: Creatinine, Urea/BUN, Uric Acid, Sodium, Potassium, Chloride",
    "- Liver Function: Bilirubin (T/D/I), AST, ALT, ALP, GGT, Total Protein, Albumin, Globulin, A/G ratio",
    "- Thyroid Profile: TSH, T3, T4",
    "- Iron Studies: Iron, TIBC, Transferrin, Iron Saturation",
    "- Minerals: Calcium (and others only if present)",
    "- Otherwise: Other Labs",
    "",
    "LAB TABLES (for each row):",
    "- Extract test_name_raw, test_name_canonical, value_raw, value_numeric, unit, reference_range, flag, specimen_date, report_date",
    "- Do not compute derived values; only capture if explicitly present",
    "",
    "PRESCRIPTIONS:",
    "- Extract medication_name, strength/dose, route, frequency, duration, start_date/end_date, instructions/sig",
    "",
    "IMAGING:",
    "- Extract modality, body part, findings, impression, recommendation text (if explicit)",
    "",
    "BILLS:",
    "- Extract provider/facility, invoice/bill number, line items, totals, billing dates (explicit only)",
    "",
    "TRACKERS:",
    "- panels_detected: panels present in this document",
    "- tracker_updates: use canonical biomarker as tracker_id_or_key; include panel_name, date, value_numeric/value_raw, unit, reference_range, flag, source_document_id, dedupe_key if applicable",
    "- dedupe_key format: test_name_canonical|date_or_null|value_raw_or_null|unit_or_null",
    "",
    "REMINDERS:",
    "- Include only if explicit dates/instructions are present in text",
    "",
    "FAMILY HISTORY:",
    "- Only if explicitly stated (e.g., father has diabetes)",
    "",
    "MAP SEARCH INTENTS:",
    "- Only if explicitly indicated by context; do not guess location or providers",
    "",
    `Type hint: ${typeHint || "none"}`,
    "",
    "JSON Schema (strict):",
    JSON.stringify(EXTRACT_SCHEMA.schema),
    "",
    "Document text:",
    text.slice(0, 24000),
  ].join("\n");

  const response = await client.responses.create({
    model: OPENAI_MODEL,
    input: prompt,
    text: {
      format: {
        type: "json_schema",
        json_schema: EXTRACT_SCHEMA,
      },
    },
    max_output_tokens: 1200,
  });

  const output = (response as any).output_text ?? "";
  if (!output) throw new Error("Empty LLM response");
  return JSON.parse(output) as {
    type: DocType;
    title: string;
    dateISO?: string | null;
    provider?: string | null;
    summary: string;
    medications: ExtractedMedication[];
    labs: ExtractedLab[];
    allergies: string[];
    conditions: string[];
    sections: { title: string; items: string[] }[];
  };
}


function guessType(text: string, typeHint?: string): DocType {
  const hint = (typeHint ?? "").toLowerCase();
  const t = text.toLowerCase();

  if (hint.includes("lab")) return "Lab report";
  if (hint.includes("pres")) return "Prescription";
  if (hint.includes("bill")) return "Bill";
  if (hint.includes("imag")) return "Imaging";

  if (/(hba1c|hemoglobin a1c|ldl|hdl|triglycer|cbc|wbc|rbc|platelet)/i.test(t)) return "Lab report";
  if (/(rx|prescription|sig:|take\s+\d+|tablet|capsule|mg|ml)/i.test(t)) return "Prescription";
  if (/(invoice|bill|amount due|total|paid|tax|receipt)/i.test(t)) return "Bill";
  if (/(radiology|ct|mri|ultrasound|x-ray|impression|findings)/i.test(t)) return "Imaging";

  return "Other";
}

function findDateISO(text: string): string | undefined {
  // very lightweight date detection (prototype)
  const m =
    text.match(/\b(20\d{2})[-\/](0?[1-9]|1[0-2])[-\/](0?[1-9]|[12]\d|3[01])\b/) ||
    text.match(/\b(0?[1-9]|[12]\d|3[01])[-\/](0?[1-9]|1[0-2])[-\/](20\d{2})\b/);

  if (!m) return undefined;

  // Normalize to YYYY-MM-DD if possible
  if (m[1].startsWith("20")) {
    const yyyy = m[1];
    const mm = String(m[2]).padStart(2, "0");
    const dd = String(m[3]).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  } else {
    const dd = String(m[1]).padStart(2, "0");
    const mm = String(m[2]).padStart(2, "0");
    const yyyy = m[3];
    return `${yyyy}-${mm}-${dd}`;
  }
}

function extractLabs(text: string, dateISO?: string): ExtractedLab[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  // Prototype patterns: name ... value unit ... ref range
  // e.g. "LDL Cholesterol 120 mg/dL 0-99"
  const labLike = /(hba1c|hemoglobin a1c|ldl|hdl|triglycerides|cholesterol|glucose|wbc|rbc|hemoglobin|platelet)/i;

  const labs: ExtractedLab[] = [];
  for (const ln of lines) {
    if (!labLike.test(ln)) continue;

    const nameMatch = ln.match(labLike);
    const name = nameMatch ? nameMatch[0] : "Lab";

    // Find first numeric token as value
    const valMatch = ln.match(/(-?\d+(\.\d+)?)/);
    const value = valMatch ? valMatch[1] : "";

    // Unit guess
    const unitMatch = ln.match(/\b(mg\/dL|mmol\/L|%|g\/dL|x10\^?9\/L|K\/uL|U\/L)\b/i);
    const unit = unitMatch ? unitMatch[1] : undefined;

    // Reference range guess
    const refMatch = ln.match(/(\d+(\.\d+)?\s*[-–]\s*\d+(\.\d+)?)/);
    const refRange = refMatch ? refMatch[1] : undefined;

    if (value) {
      labs.push({
        name: normalizeLabName(name),
        value,
        unit,
        refRange,
        date: dateISO,
      });
    }
  }

  // De-duplicate
  const seen = new Set<string>();
  return labs.filter((l) => {
    const k = `${l.name.toLowerCase()}|${l.date ?? ""}|${l.value}|${l.unit ?? ""}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function normalizeLabName(name: string) {
  const n = name.toLowerCase();
  if (n.includes("hba1c") || n.includes("hemoglobin a1c")) return "HbA1c";
  if (n === "ldl") return "LDL";
  if (n === "hdl") return "HDL";
  if (n.includes("triglycer")) return "Triglycerides";
  if (n.includes("total cholesterol")) return "Total Cholesterol";
  if (n.includes("cholesterol")) return "Cholesterol";
  if (n.includes("glucose")) return "Glucose";
  if (n.includes("aspartate") || n.includes("ast") || n.includes("sgot")) return "AST";
  if (n.includes("alanine") || n.includes("alt") || n.includes("sgpt")) return "ALT";
  if (n.includes("alkaline") || n === "alp") return "ALP";
  if (n.includes("gamma") || n.includes("ggt")) return "GGT";
  if (n.includes("tsh")) return "TSH";
  if (n.includes("triiodothyronine") || n === "t3") return "T3";
  if (n.includes("thyroxine") || n === "t4") return "T4";
  if (n.includes("creatinine")) return "Creatinine";
  if (n.includes("urea") || n.includes("bun")) return n.includes("bun") ? "BUN" : "Urea";
  if (n.includes("uric")) return "Uric Acid";
  if (n === "wbc") return "WBC";
  if (n === "rbc") return "RBC";
  if (n.includes("hemoglobin")) return "Hemoglobin";
  if (n.includes("platelet")) return "Platelets";
  if (n.includes("hematocrit") || n === "hct") return "Hematocrit";
  if (n.includes("mcv")) return "MCV";
  if (n.includes("mchc")) return "MCHC";
  if (n.includes("mch")) return "MCH";
  if (n.includes("rdw")) return "RDW";
  if (n.includes("sodium") || n === "na") return "Sodium";
  if (n.includes("potassium") || n === "k") return "Potassium";
  if (n.includes("chloride") || n === "cl") return "Chloride";
  if (n.includes("calcium") || n === "ca") return "Calcium";
  if (n.includes("iron saturation") || n.includes("transferrin saturation")) return "Iron Saturation";
  if (n.includes("tibc")) return "TIBC";
  if (n.includes("transferrin")) return "Transferrin";
  if (n.includes("iron")) return "Iron";
  return name;
}

function extractMeds(text: string, dateISO?: string): ExtractedMedication[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  // Prototype medication detection:
  // - Look for lines with typical medication cues: "mg", "tablet", "capsule", "take", "once daily", etc.
  const medCues = /(mg|mcg|ml|tablet|tab|capsule|cap|take|sig:|once daily|twice daily|daily|bid|tid|od)\b/i;

  const meds: ExtractedMedication[] = [];
  for (const ln of lines) {
    if (!medCues.test(ln)) continue;

    // Attempt: medication name is first 1-3 words before dose appears
    const doseMatch = ln.match(/\b(\d+(\.\d+)?\s*(mg|mcg|g|ml))\b/i);
    const dose = doseMatch ? doseMatch[1] : undefined;

    const beforeDose = doseMatch ? ln.slice(0, doseMatch.index).trim() : ln;
    const tokens = beforeDose.split(/\s+/).slice(0, 4);
    const name = tokens.join(" ").replace(/[^a-zA-Z0-9 -]/g, "").trim();

    const freqMatch =
      ln.match(/\b(once daily|twice daily|three times daily|daily|bid|tid|od|q\d+h)\b/i) || undefined;

    // Avoid garbage very short names
    if (name.length >= 3 && !/^(take|sig|tab|cap)$/i.test(name)) {
      meds.push({
        name: titleCase(name),
        dose,
        frequency: freqMatch ? freqMatch[1] : undefined,
        startDate: dateISO,
        notes: ln.length > 120 ? ln.slice(0, 120) + "…" : ln,
      });
    }
  }

  // De-duplicate by name
  const map = new Map<string, ExtractedMedication>();
  for (const m of meds) map.set(m.name.toLowerCase(), m);
  return Array.from(map.values()).slice(0, 30);
}

function titleCase(s: string) {
  return s
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ");
}

function summarize(text: string, type: DocType): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return "No text could be extracted from the PDF.";

  // Keep it safe: summarization for organizing, not advice.
  const head = t.slice(0, 320);
  if (type === "Lab report") return `Lab report detected. Key lab lines were extracted when possible. Preview: “${head}…”`;
  if (type === "Prescription") return `Prescription-like document detected. Medication candidates were extracted. Preview: “${head}…”`;
  if (type === "Bill") return `Billing document detected. Consider reviewing totals and dates. Preview: “${head}…”`;
  if (type === "Imaging") return `Imaging-related document detected. Findings/impression may be present. Preview: “${head}…”`;
  return `Document stored as “Other”. Preview: “${head}…”`;
}

function buildTitle({
  fileName,
  type,
  dateISO,
  provider,
}: {
  fileName: string;
  type: DocType;
  dateISO?: string;
  provider?: string;
}) {
  const cleanedName = fileName.replace(/\.pdf$/i, "").trim();
  const parts = [type, provider, dateISO].filter(Boolean).join(" · ");
  if (parts) return parts;
  return cleanedName || `${type} document`;
}

function buildLabsFromRows(rows: any[], fallbackDate?: string): ExtractedLab[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((r) => {
      const raw = String(r?.test_name_raw ?? "").trim();
      if (!raw) return null;
      const name = normalizeLabName(String(r?.test_name_canonical ?? raw));
      const valueRaw = r?.value_raw ?? r?.value_numeric;
      const value = valueRaw != null ? String(valueRaw).trim() : "";
      const date = r?.specimen_date ?? r?.report_date ?? fallbackDate;
      return {
        name,
        value,
        unit: r?.unit ?? undefined,
        refRange: r?.reference_range ?? undefined,
        date: date ?? undefined,
      } as ExtractedLab;
    })
    .filter(Boolean) as ExtractedLab[];
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    const typeHint = String(form.get("typeHint") ?? "");

    if (!file) {
      return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
    }
    if (file.type !== "application/pdf") {
      return NextResponse.json({ error: "Please upload a PDF file." }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    if (!buf || buf.length === 0) {
      return NextResponse.json({ error: "Uploaded PDF was empty." }, { status: 400 });
    }
    const pdfModule = require("pdf-parse/lib/pdf-parse.js");
    const pdfParse: any = pdfModule?.default ?? pdfModule?.pdfParse ?? pdfModule;
    if (typeof pdfParse !== "function") {
      throw new Error("pdf-parse import failed");
    }
    const parsed = await pdfParse(buf);
    const text = (parsed?.text ?? "").trim();

    let docFromLLM: ExtractedDoc | null = null;
    const preferOpenAI = !!process.env.OPENAI_API_KEY;
    if (preferOpenAI) {
      try {
        const llm = await extractWithOpenAI(text, typeHint);
        const llmType = llm.type ?? guessType(text, typeHint);
        const autoTitle = buildTitle({
          fileName: file.name,
          type: llmType,
          dateISO: llm.dateISO || undefined,
          provider: llm.provider || undefined,
        });
        const derivedLabs = buildLabsFromRows(llm.lab_rows ?? [], llm.dateISO || undefined);
        const mergedLabs = (llm.labs?.length ? llm.labs : derivedLabs).map((l) => ({
          ...l,
          name: normalizeLabName(l.name),
        }));

        docFromLLM = {
          id: nanoid(),
          type: llmType,
          title: (llm.title && llm.title.trim().length > 3 ? llm.title : autoTitle) || autoTitle,
          dateISO: llm.dateISO || undefined,
          provider: llm.provider || undefined,
          summary: llm.summary ?? "",
          medications: llm.medications?.length ? llm.medications : undefined,
          labs: mergedLabs.length ? mergedLabs : undefined,
          allergies: llm.allergies?.length ? llm.allergies : undefined,
          conditions: llm.conditions?.length ? llm.conditions : undefined,
          sections: llm.sections?.length ? llm.sections : undefined,
          tags: [typeHint || llmType].filter(Boolean),
        };
      } catch {
        docFromLLM = null;
      }
    }

    if (docFromLLM) {
      return NextResponse.json({ ok: true, doc: docFromLLM });
    }

    const dateISO = findDateISO(text);
    const type = guessType(text, typeHint);

    const meds = type === "Prescription" ? extractMeds(text, dateISO) : [];
    const labs = type === "Lab report" ? extractLabs(text, dateISO) : [];

    const doc: ExtractedDoc = {
      id: nanoid(),
      type,
      title: buildTitle({ fileName: file.name, type, dateISO }),
      dateISO,
      provider: undefined,
      summary: summarize(text, type),
      medications: meds.length ? meds : undefined,
      labs: labs.length ? labs : undefined,
      tags: [typeHint || type].filter(Boolean),
    };

    return NextResponse.json({ ok: true, doc });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Extraction failed unexpectedly." },
      { status: 500 }
    );
  }
}
