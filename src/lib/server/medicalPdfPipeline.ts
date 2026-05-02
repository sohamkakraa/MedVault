import { nanoid } from "nanoid";
import { z } from "zod";
import type { DocType, ExtractionCost, ExtractedDoc, ExtractedMedication, ExtractorSource, StandardLexiconEntry } from "@/lib/types";
import { hashPdfBuffer, verifyPatientNameOnDocument } from "@/lib/extractGuards";
import { buildArtifactSlug, proposeLexiconPatches } from "@/lib/standardized";
import { applyParsedMarkdownToDoc, parseStructuredFromMarkdown } from "@/lib/parseMarkdownArtifact";

import { APIError } from "@anthropic-ai/sdk";

/**
 * Model for Messages API calls that include a PDF `document` block (base64).
 * Separate from `ANTHROPIC_MODEL` (chat) so uploads can use a stronger model while chat stays lighter.
 */
const ANTHROPIC_PDF_MODEL =
  (process.env.ANTHROPIC_PDF_MODEL ?? "claude-sonnet-4-5-20250929").trim() || "claude-sonnet-4-5-20250929";

/** Small JSON in a fenced block — avoids Anthropic structured-output limits on union/nullable schema fields. */
const PdfMetaSchema = z.object({
  is_medical_document: z.boolean(),
  type: z.enum(["Lab report", "Prescription", "Bill", "Imaging", "Other"]),
  patient_names_on_document: z.array(z.string()),
  ordering_physicians: z.array(z.string()),
  facility_name: z.string().nullable(),
  dateISO: z.string().nullable(),
  provider: z.string().nullable(),
  summary: z.string(),
  title: z.string(),
});

function sanitizePdfFilename(name: string): string {
  const n = name.trim() || "document.pdf";
  const base = n.toLowerCase().endsWith(".pdf") ? n : `${n}.pdf`;
  return base.replace(/[^\w.\-]+/g, "_").slice(0, 120) || "document.pdf";
}

function normalizeMarkdownH1(markdown: string, artifactSlug: string): string {
  const t = markdown.trimStart();
  if (/^#\s+/m.test(t)) return t.replace(/^#\s+.*$/m, `# ${artifactSlug}`);
  return `# ${artifactSlug}\n\n${t}`;
}

type LlmExtract = {
  type: DocType;
  title: string;
  dateISO?: string | null;
  provider?: string | null;
  summary: string;
  markdown_artifact: string;
  is_medical_document: boolean;
  patient_names_on_document: string[];
  ordering_physicians: string[];
  facility_name: string | null;
  medications: ExtractedMedication[];
  allergies: string[];
  conditions: string[];
  sections: { title: string; items: string[] }[];
  /** Token usage from the Anthropic API call. */
  usage?: { input_tokens: number; output_tokens: number };
  /** Model string used for this extraction. */
  model?: string;
};

function assistantTextContent(message: { content: Array<{ type: string; text?: string }> }): string {
  return message.content
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string)
    .join("");
}

/**
 * Expected shape: opening ```uma-meta\n{...json}\n``` then the markdown body.
 * If the fence is missing, we treat the whole reply as markdown and use permissive defaults (charts/lab merge stay empty).
 */
function parsePdfAgentResponse(raw: string): LlmExtract {
  const t = raw.trim();
  const fence = /^```uma-meta\s*\n([\s\S]*?)\n```\s*/;
  const m = t.match(fence);
  let markdownBody: string;
  let meta: z.infer<typeof PdfMetaSchema>;

  if (m) {
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(m[1].trim());
    } catch {
      throw new Error("Could not parse JSON inside the ```uma-meta block.");
    }
    const zRes = PdfMetaSchema.safeParse(parsedJson);
    if (!zRes.success) {
      throw new Error("Metadata JSON does not match the required shape (type, title, summary, flags, arrays).");
    }
    meta = zRes.data;
    markdownBody = t.slice(m[0].length).trim();
  } else {
    const h1 = /^#\s+(.+)$/m.exec(t);
    markdownBody = t;
    meta = {
      is_medical_document: true,
      type: "Other",
      patient_names_on_document: [],
      ordering_physicians: [],
      facility_name: null,
      dateISO: null,
      provider: null,
      summary: "See the markdown below.",
      title: h1 ? h1[1].trim() : "",
    };
  }

  if (!markdownBody || markdownBody.length < 24) {
    throw new Error("Model returned no markdown body after the uma-meta block.");
  }

  return {
    type: meta.type,
    title: meta.title,
    dateISO: meta.dateISO,
    provider: meta.provider,
    summary: meta.summary,
    markdown_artifact: markdownBody,
    is_medical_document: meta.is_medical_document,
    patient_names_on_document: meta.patient_names_on_document,
    ordering_physicians: meta.ordering_physicians,
    facility_name: meta.facility_name,
    medications: [],
    allergies: [],
    conditions: [],
    sections: [],
  };
}

async function extractWithAnthropicFromPdf(
  pdfBuffer: Buffer,
  fileName: string,
  typeHint: string,
  uploadISO: string
) {
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const safeName = sanitizePdfFilename(fileName);
  const b64 = pdfBuffer.toString("base64");

  const metaKeys = [
    "is_medical_document (boolean)",
    "type (string: Lab report | Prescription | Bill | Imaging | Other)",
    "title (string, short)",
    "dateISO (string YYYY-MM-DD or null)",
    "provider (string or null)",
    "facility_name (string or null)",
    "summary (string: ONE sentence, max ~200 characters — see SUMMARY rules below)",
    "patient_names_on_document (string[])",
    "ordering_physicians (string[])",
  ].join(", ");

  const prompt = [
    "You are UMA's medical document agent. The user attached one PDF. Read the entire document (all pages), including charts, tables, and images.",
    "Your reply MUST start with exactly one fenced code block tagged uma-meta containing a single JSON object (no markdown inside the fence except the raw JSON).",
    "Then output the full markdown record (no code fence around the whole markdown).",
    "",
    "The JSON object must include ONLY these keys: " + metaKeys + ".",
    "Use null only where noted. Use [] for empty arrays. Dates ISO YYYY-MM-DD when printed; else null.",
    "is_medical_document: true only for real clinical or medical-administrative PDFs; false otherwise.",
    "type: use 'Prescription' for any handwritten or printed prescription slip, medication order, or Rx note; use 'Lab report' for blood/urine/pathology results; 'Bill' for invoices/receipts; 'Imaging' for radiology/ultrasound; 'Other' only if none of the above fit.",
    "patient_names_on_document: list every name you can read that is labeled as the patient (look for 'Patient:', 'Name:', 'Pt:', form fields, header lines, or any full name on the document). For handwritten documents, include even partially-legible names. Use [] only if truly no patient name appears anywhere.",
    "",
    "SUMMARY (field: summary) — single sentence, max ~200 characters, plain language:",
    "- First clause: what this file is (e.g. lab report from X / prescription / bill).",
    "- Second clause (after a comma or em dash): the one main impression or headline finding (abnormal labs, medication change, imaging conclusion, etc.). Not a formal diagnosis; no filler (\"please discuss with your doctor\") unless the PDF itself says so.",
    "- For Bill documents: the summary second clause MUST state the total amount billed (not the patient-responsibility/co-pay). Format: \"total billed [currency] [amount]\". If both are present, add \", patient responsibility [currency] [amount]\".",
    "No extra sentences, no lists, no hedging paragraphs.",
    "",
    "CONTEXT FROM APP",
    `- Uploaded file name: ${fileName}`,
    `- Upload timestamp (ISO, use verbatim in the markdown metadata table): ${uploadISO}`,
    `- Type hint (may be wrong): ${typeHint || "none"}`,
    "",
    "MARKDOWN BODY (after the uma-meta fence)",
    "1. First line: # <short title, max ~80 characters>",
    "2. Blank line, then | Field | Value | table: File name; File type; Doctors; Hospital / clinic; Date of document; Date of upload (exact upload timestamp above).",
    "3. ## Overview — one short line only: copy the same meaning as the summary field (no extra sentences, no dump of raw text).",
    "4. ## Details — type-specific: lab panels with pipe tables (canonical names: HbA1c, LDL, HDL, TSH, Glucose, Creatinine, etc.); prescriptions as tables; imaging/other as clear sections.",
    "   Lab reports: include ONLY lab values that are primary measurements from THIS document's own results. Do NOT re-extract labs that are merely referenced or quoted from prior reports (e.g. in referral letters or clinical notes).",
    "   Bill documents: produce a | Field | Value | table under ## Details with rows: Total Billed; Patient Responsibility; Insurance Paid; Currency; Service Date; Billing Provider. Use — for any field not stated.",
    "   Allergy panels / immunology reports: add a ## Allergies section after ## Details with one bullet per confirmed allergen (- Allergen name). The bullet list is required — do NOT put allergens only in pipe tables.",
    "   Imaging / radiology reports: add a ## Diagnoses section after ## Details with one bullet per finding or diagnosis (e.g. '- Grade III medial meniscus tear', '- Colles\\' fracture right wrist'). Include normal findings as '- No acute findings'.",
    "   Discharge summaries / clinical notes: add a ## Conditions section with one bullet per active diagnosis/condition, and a ## Diagnoses section if procedures were performed (e.g. '- Appendectomy 2025-09-15').",
    "5. --- then italic: _Not medical advice._",
    "Escape pipes in cells. Use — for missing cells.",
    "",
    "Rules: only facts from the PDF; supportive tone; do not invent values.",
    "",
    "Example opening (structure only):",
    "```uma-meta",
    '{"is_medical_document":true,"type":"Lab report","title":"...","dateISO":null,"provider":null,"facility_name":null,"summary":"...","patient_names_on_document":["Jane Doe"],"ordering_physicians":[]}',
    "```",
  ].join("\n");

  const message = await client.messages.create({
    model: ANTHROPIC_PDF_MODEL,
    max_tokens: 16384,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            title: safeName,
            citations: { enabled: true },
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: b64,
            },
          },
          { type: "text", text: prompt },
        ],
      },
    ],
  });

  const output = assistantTextContent(message).trim();
  if (!output) throw new Error("Empty LLM response");
  const parsed = parsePdfAgentResponse(output);
  return {
    ...parsed,
    usage: message.usage as { input_tokens: number; output_tokens: number } | undefined,
    model: ANTHROPIC_PDF_MODEL,
  };
}

/* ─── LlamaParse integration ─────────────────────────────────────────────── */

const LLAMA_PARSE_UPLOAD_URL = "https://api.cloud.llamaindex.ai/api/v2/parse/upload";
const LLAMA_PARSE_POLL_BASE  = "https://api.cloud.llamaindex.ai/api/v2/parse/job";
/** Credits consumed per page in cost-effective mode (the cheapest non-fast tier). */
const LLAMA_CREDITS_PER_PAGE = 3;

type LlamaParseResult = {
  markdown: string;
  /** Estimated page count (from metadata). May be 0 if metadata is absent. */
  pageCount: number;
};

/**
 * Upload a PDF to LlamaParse and return the parsed markdown text.
 * Uses the "cost-effective" tier (3 credits/page).
 *
 * Throws:
 *  - `{ code: "llama_credits_exhausted" }` when the API returns HTTP 402.
 *  - `Error` for any other failure.
 */
async function extractWithLlamaParse(pdfBuffer: Buffer, fileName: string): Promise<LlamaParseResult> {
  const apiKey = process.env.LLAMA_CLOUD_API_KEY;
  if (!apiKey) throw Object.assign(new Error("No LLAMA_CLOUD_API_KEY"), { code: "llama_no_key" });

  // 1. Upload the PDF
  const form = new FormData();
  const blob = new Blob([new Uint8Array(pdfBuffer)], { type: "application/pdf" });
  form.append("file", blob, fileName || "document.pdf");
  form.append("configuration", JSON.stringify({ tier: "cost-effective" }));

  const uploadRes = await fetch(LLAMA_PARSE_UPLOAD_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (uploadRes.status === 402) {
    throw Object.assign(new Error("LlamaParse credits exhausted"), { code: "llama_credits_exhausted" });
  }
  if (!uploadRes.ok) {
    const body = await uploadRes.text().catch(() => "");
    throw new Error(`LlamaParse upload failed (${uploadRes.status}): ${body.slice(0, 200)}`);
  }

  const uploadJson = (await uploadRes.json()) as { id?: string; job_id?: string };
  const jobId = uploadJson.id ?? uploadJson.job_id;
  if (!jobId) throw new Error("LlamaParse did not return a job id");

  // 2. Poll for completion (max 60 s, every 2 s)
  const maxAttempts = 30;
  const pollIntervalMs = 2_000;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise((res) => setTimeout(res, pollIntervalMs));

    const statusRes = await fetch(`${LLAMA_PARSE_POLL_BASE}/${jobId}`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    });

    if (!statusRes.ok) continue; // transient error — keep polling

    const statusJson = (await statusRes.json()) as {
      status?: string;
      error?: string;
      metadata?: { pages?: number };
      result?: { markdown?: string; pages?: Array<{ md?: string; text?: string }> };
    };

    const jobStatus = (statusJson.status ?? "").toUpperCase();

    if (jobStatus === "ERROR") {
      throw new Error(`LlamaParse job failed: ${statusJson.error ?? "unknown error"}`);
    }

    if (jobStatus === "SUCCESS" || jobStatus === "COMPLETED") {
      // Assemble markdown from result
      let markdown = "";
      if (typeof statusJson.result?.markdown === "string") {
        markdown = statusJson.result.markdown;
      } else if (Array.isArray(statusJson.result?.pages)) {
        markdown = statusJson.result.pages
          .map((p) => p.md ?? p.text ?? "")
          .join("\n\n---\n\n");
      }

      if (!markdown.trim()) throw new Error("LlamaParse returned empty content");

      const pageCount = statusJson.metadata?.pages ?? 0;
      return { markdown, pageCount };
    }
    // PENDING / IN_PROGRESS — continue polling
  }

  throw new Error("LlamaParse job timed out after 60 seconds");
}

/**
 * When LlamaParse has already extracted raw markdown text from the PDF,
 * we send that text (not the binary PDF) to Claude for structured extraction.
 * This is dramatically cheaper: text tokens vs PDF vision processing.
 */
async function extractStructureFromText(
  rawText: string,
  fileName: string,
  typeHint: string,
  uploadISO: string
) {
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Use Haiku when text is pre-extracted — no need for the heavier PDF model
  const structureModel =
    (process.env.ANTHROPIC_STRUCTURE_MODEL ?? process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5-20251001").trim() ||
    "claude-haiku-4-5-20251001";

  const metaKeys = [
    "is_medical_document (boolean)",
    "type (string: Lab report | Prescription | Bill | Imaging | Other)",
    "title (string, short)",
    "dateISO (string YYYY-MM-DD or null)",
    "provider (string or null)",
    "facility_name (string or null)",
    "summary (string: ONE sentence, max ~200 characters)",
    "patient_names_on_document (string[])",
    "ordering_physicians (string[])",
  ].join(", ");

  const prompt = [
    "You are UMA's medical document structuring agent. The text below is already extracted from a medical PDF.",
    "Your reply MUST start with exactly one fenced code block tagged uma-meta containing a single JSON object.",
    "Then output the full markdown record.",
    "",
    "The JSON object must include ONLY these keys: " + metaKeys + ".",
    "Use null only where noted. Use [] for empty arrays. Dates ISO YYYY-MM-DD when printed; else null.",
    "is_medical_document: true only for real clinical or medical-administrative content; false otherwise.",
    "type: use 'Prescription' for any handwritten or printed prescription/Rx/medication order; 'Lab report' for blood/urine/pathology results; 'Bill' for invoices/receipts; 'Imaging' for radiology; 'Other' only if none fit.",
    "patient_names_on_document: list every name labeled as the patient (look for 'Patient:', 'Name:', 'Pt:', form fields, header lines). Include partially-legible handwritten names. Use [] only if truly no patient name appears.",
    "",
    "SUMMARY — single sentence, max ~200 chars, plain language. First clause: what this file is. Second clause: the one main finding. For Bill documents: state the total amount billed, not the patient co-pay.",
    "",
    "CONTEXT",
    `- File name: ${fileName}`,
    `- Upload timestamp (use verbatim in metadata table): ${uploadISO}`,
    `- Type hint (may be wrong): ${typeHint || "none"}`,
    "",
    "MARKDOWN BODY (after the uma-meta fence)",
    "1. First line: # <short title, max ~80 characters>",
    "2. | Field | Value | table: File name; File type; Doctors; Hospital / clinic; Date of document; Date of upload.",
    "3. ## Overview — one short line.",
    "4. ## Details — lab panels as pipe tables (canonical names: HbA1c, LDL, HDL, TSH, Glucose, Creatinine, etc.); prescriptions as tables; imaging/other as clear sections.",
    "   Lab reports: include ONLY primary measurements from THIS document. Do NOT re-extract labs merely referenced from prior reports.",
    "   Bill documents: | Field | Value | table with rows: Total Billed; Patient Responsibility; Insurance Paid; Currency; Service Date; Billing Provider. Use — for missing fields.",
    "   Allergy panels: add ## Allergies after ## Details with one bullet per confirmed allergen (- Allergen name). Required — do not put allergens in pipe tables only.",
    "   Imaging / radiology: add ## Diagnoses after ## Details with one bullet per finding (e.g. '- Grade III meniscus tear', '- No acute findings').",
    "   Discharge summaries / clinical notes: add ## Conditions with active diagnoses and ## Diagnoses for procedures performed (include date if known, e.g. '- Appendectomy 2025-09-15').",
    "5. --- then italic: _Not medical advice._",
    "",
    "EXTRACTED TEXT FROM PDF:",
    "```",
    rawText.slice(0, 80_000), // guard against absurdly large docs
    "```",
  ].join("\n");

  const message = await client.messages.create({
    model: structureModel,
    max_tokens: 8192,
    messages: [{ role: "user", content: prompt }],
  });

  const output = assistantTextContent(message).trim();
  if (!output) throw new Error("Empty structuring response from Claude");

  const parsed = parsePdfAgentResponse(output);
  return {
    ...parsed,
    usage: message.usage as { input_tokens: number; output_tokens: number } | undefined,
    model: structureModel,
  };
}

function docTypeFromHint(typeHint: string): DocType | undefined {
  const h = typeHint.toLowerCase();
  if (h.includes("lab")) return "Lab report";
  if (h.includes("pres")) return "Prescription";
  if (h.includes("bill")) return "Bill";
  if (h.includes("imag")) return "Imaging";
  return undefined;
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

export type ExtractMedicalPdfInput = {
  buffer: Buffer;
  fileName: string;
  patientName: string;
  typeHint: string;
  clientLexicon: StandardLexiconEntry[];
  existingContentHashes: string[];
  /** When true, skip patient-name verification (user confirmed mismatch on client). */
  skipPatientNameCheck?: boolean;
};

export type ExtractMedicalPdfSuccess = {
  ok: true;
  doc: ExtractedDoc;
  lexiconPatches: StandardLexiconEntry[];
  validation: { patientNameCheck: string };
  extractionCost?: ExtractionCost;
};

export type ExtractMedicalPdfFailure = {
  ok: false;
  code: string;
  message: string;
  status: number;
  /** Present when code is patient_name_mismatch — lets the client show details and merge after explicit consent. */
  profileDisplayName?: string;
  namesOnDocument?: string[];
  doc?: ExtractedDoc;
  lexiconPatches?: StandardLexiconEntry[];
};

/** Approximate Anthropic pricing per million tokens (input / output) in USD. */
const MODEL_PRICING: Record<string, { inputPerMTok: number; outputPerMTok: number }> = {
  "claude-opus-4-6":           { inputPerMTok: 15,  outputPerMTok: 75  },
  "claude-opus-4-5":           { inputPerMTok: 15,  outputPerMTok: 75  },
  "claude-sonnet-4-6":         { inputPerMTok: 3,   outputPerMTok: 15  },
  "claude-sonnet-4-5-20250929":{ inputPerMTok: 3,   outputPerMTok: 15  },
  "claude-haiku-4-5-20251001": { inputPerMTok: 1,   outputPerMTok: 5   },
  "claude-haiku-4-5":          { inputPerMTok: 1,   outputPerMTok: 5   },
};

const DEFAULT_PRICING = { inputPerMTok: 3, outputPerMTok: 15 };

function computeExtractionCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  extractorSource: ExtractorSource,
  llamaParseCredits: number
): ExtractionCost {
  const key = Object.keys(MODEL_PRICING).find((k) => model.startsWith(k)) ?? "";
  const pricing = MODEL_PRICING[key] ?? DEFAULT_PRICING;
  const totalUSD =
    (inputTokens / 1_000_000) * pricing.inputPerMTok +
    (outputTokens / 1_000_000) * pricing.outputPerMTok;
  return { inputTokens, outputTokens, totalUSD, model, extractorSource, llamaParseCredits };
}

/**
 * Shared PDF → ExtractedDoc pipeline (Claude + PDF document block + citations + markdown).
 * Labs/meds/allergies/conditions are filled from `markdownArtifact` via `parseStructuredFromMarkdown` after generation.
 * Used by /api/extract and the chat records agent.
 */
export async function extractMedicalPdfFromBuffer(
  inp: ExtractMedicalPdfInput
): Promise<ExtractMedicalPdfSuccess | ExtractMedicalPdfFailure> {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return {
        ok: false,
        code: "no_anthropic_key",
        message:
          "UMA reads PDFs with Anthropic Claude. Set ANTHROPIC_API_KEY in your environment to upload documents.",
        status: 503,
      };
    }

    const buf = inp.buffer;
    if (!buf || buf.length === 0) {
      return { ok: false, code: "empty_file", message: "Uploaded PDF was empty.", status: 400 };
    }

    const maxPdf = 50 * 1024 * 1024;
    if (buf.length > maxPdf) {
      return {
        ok: false,
        code: "too_large",
        message: "This PDF is larger than 50 MB. Try a smaller export or split the file.",
        status: 400,
      };
    }

    const contentHash = hashPdfBuffer(buf);
    if (inp.existingContentHashes.includes(contentHash)) {
      return {
        ok: false,
        code: "duplicate_document",
        message:
          "This PDF file matches one already in your records (same file bytes). It was not added again to avoid duplicates.",
        status: 409,
      };
    }

    const uploadISO = new Date().toISOString();
    const typeHint = inp.typeHint;
    const patientName = inp.patientName.trim();
    const clientLexicon = inp.clientLexicon;

    /**
     * Extraction strategy:
     *  1. LlamaParse (if LLAMA_CLOUD_API_KEY is set) — handles OCR/layout for free (3 credits/page).
     *     On success, Claude receives pre-extracted text (much cheaper text tokens, uses Haiku).
     *  2. If LlamaParse key is absent OR credits exhausted (HTTP 402) → Claude full PDF path (existing behaviour).
     */
    type LlmResult = Awaited<ReturnType<typeof extractWithAnthropicFromPdf>>;
    let llm: LlmResult | undefined;
    let extractorSource: ExtractorSource = "claude_pdf";
    let llamaParseCredits = 0;

    const llamaKey = process.env.LLAMA_CLOUD_API_KEY;

    if (llamaKey) {
      try {
        const llama = await extractWithLlamaParse(buf, inp.fileName);
        // LlamaParse succeeded — now use Claude (text mode) to structure it
        const structured = await extractStructureFromText(llama.markdown, inp.fileName, typeHint, uploadISO);
        llm = structured;
        extractorSource = "llamaparse";
        llamaParseCredits = (llama.pageCount || 1) * LLAMA_CREDITS_PER_PAGE;
      } catch (e: unknown) {
        const code = (e as { code?: string }).code;
        if (code === "llama_credits_exhausted") {
          // Credits exhausted — fall through to Claude full PDF path
          console.warn("[UMA] LlamaParse credits exhausted — falling back to Claude PDF extraction");
        } else if (code !== "llama_no_key") {
          // Unexpected LlamaParse error — log and fall through
          const msg = e instanceof Error ? e.message : String(e);
          console.warn("[UMA] LlamaParse failed, falling back to Claude:", msg);
        }
      }
    }

    if (!llm) {
      // Claude full PDF path (original behaviour)
      try {
        llm = await extractWithAnthropicFromPdf(buf, inp.fileName, typeHint, uploadISO);
        extractorSource = "claude_pdf";
        llamaParseCredits = 0;
      } catch (e: unknown) {
        let detail = "";
        if (e instanceof APIError && typeof e.message === "string" && e.message.length > 0 && e.message.length < 400) {
          detail = ` ${e.message}`;
        }
        const llamaNote = llamaKey
          ? " LlamaParse was attempted first but failed or had no credits."
          : " Set LLAMA_CLOUD_API_KEY to use LlamaParse as a free-tier primary extractor.";
        return {
          ok: false,
          code: "extract_failed",
          message: `UMA could not read this PDF with the AI service. Check your API key and try again.${detail}${llamaNote}`,
          status: 502,
        };
      }
    }

    const llmType = llm.type ?? docTypeFromHint(typeHint) ?? "Other";
    const autoTitle = buildTitle({
      fileName: inp.fileName,
      type: llmType,
      dateISO: llm.dateISO || undefined,
      provider: llm.provider || undefined,
    });
    const facility = llm.facility_name?.trim() || undefined;
    const provider = llm.provider?.trim() || facility || undefined;

    let summary = (llm.summary ?? "").replace(/\s+/g, " ").trim();
    if (summary.length > 220) summary = `${summary.slice(0, 217)}…`;

    const docCore = {
      type: llmType,
      title: (llm.title && llm.title.trim().length > 3 ? llm.title : autoTitle) || autoTitle,
      dateISO: llm.dateISO || undefined,
      provider,
      summary,
      medications: llm.medications?.length ? llm.medications : undefined,
      allergies: llm.allergies?.length ? llm.allergies : undefined,
      conditions: llm.conditions?.length ? llm.conditions : undefined,
      sections: llm.sections?.length ? llm.sections : undefined,
      doctors: llm.ordering_physicians?.length ? llm.ordering_physicians : undefined,
      facilityName: facility,
      patientNamesOnDoc: llm.patient_names_on_document ?? [],
    };

    if (!llm.is_medical_document) {
      return {
        ok: false,
        code: "not_medical_document",
        message:
          "This file does not look like a medical document UMA can store. Try a lab report, prescription, imaging summary, or clinic bill.",
        status: 422,
      };
    }

    const id = nanoid();
    const artifactSlug = buildArtifactSlug(docCore.type, docCore.dateISO);

    const rawMd = llm.markdown_artifact.trim();
    if (!rawMd || rawMd.length < 24) {
      return {
        ok: false,
        code: "empty_markdown",
        message:
          "The AI did not return a usable markdown record for this PDF. Try again, or set ANTHROPIC_PDF_MODEL to another Claude model that supports PDFs.",
        status: 502,
      };
    }
    const markdownArtifact = normalizeMarkdownH1(rawMd, artifactSlug);
    const parsedMd = parseStructuredFromMarkdown(markdownArtifact, docCore.dateISO, clientLexicon);
    const lexiconPatches = proposeLexiconPatches(parsedMd.rawLabNames, clientLexicon);

    // Compute cost from usage data if available
    const extractionCost =
      llm.usage && llm.model
        ? computeExtractionCost(
            llm.model,
            llm.usage.input_tokens,
            llm.usage.output_tokens,
            extractorSource,
            llamaParseCredits
          )
        : undefined;

    const baseDoc: ExtractedDoc = {
      id,
      type: docCore.type,
      title: docCore.title,
      dateISO: docCore.dateISO,
      provider: docCore.provider,
      summary: docCore.summary,
      medications: docCore.medications,
      allergies: docCore.allergies,
      conditions: docCore.conditions,
      sections: docCore.sections,
      tags: [typeHint || docCore.type].filter(Boolean),
      originalFileName: inp.fileName,
      uploadedAtISO: uploadISO,
      contentHash,
      artifactSlug,
      doctors: docCore.doctors,
      facilityName: docCore.facilityName,
      markdownArtifact,
      extractionCost,
      extractorSource,
    };
    const doc = applyParsedMarkdownToDoc(baseDoc, parsedMd);

    const nameCheck = verifyPatientNameOnDocument(patientName, docCore.patientNamesOnDoc);
    if (!nameCheck.ok && !inp.skipPatientNameCheck) {
      const profileLabel = patientName.trim() ? `"${patientName.trim()}"` : "not set on your profile";
      const listed =
        docCore.patientNamesOnDoc.length > 0
          ? docCore.patientNamesOnDoc.map((n) => `"${n.trim()}"`).join(", ")
          : "(no patient name detected on the document)";
      return {
        ok: false,
        code: "patient_name_mismatch",
        message: `Your profile name is ${profileLabel}, but this PDF lists the patient as ${listed}. If this is still your record (nickname, maiden name, or a scan for someone you care for), you can add it anyway after confirming below.`,
        status: 422,
        profileDisplayName: patientName.trim(),
        namesOnDocument: docCore.patientNamesOnDoc,
        doc,
        lexiconPatches,
      };
    }

    return {
      ok: true,
      doc,
      lexiconPatches,
      validation: {
        patientNameCheck:
          inp.skipPatientNameCheck && !nameCheck.ok
            ? "user_confirmed_mismatch"
            : nameCheck.skipped
              ? "skipped_no_name_on_document"
              : "verified_or_aligned",
      },
      extractionCost,
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Extraction failed unexpectedly.";
    return { ok: false, code: "internal_error", message: msg, status: 500 };
  }
}
