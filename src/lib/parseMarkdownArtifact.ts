import type {
  ExtractedDoc,
  ExtractedLab,
  ExtractedMedication,
  ExtractedSection,
  StandardLexiconEntry,
} from "@/lib/types";
import { resolveCanonicalLabName } from "@/lib/standardized";

/** Strip inline markdown bold/italic/code markers the LLM sometimes leaks into table cells. */
function stripMdMarkers(s: string): string {
  return s.replace(/\*\*|__|\*|_|`/g, "").trim();
}

/** Structured fields recovered from UMA-style markdown artifacts (pipe tables + headings). */
export type ParsedFromMarkdown = {
  labs: ExtractedLab[];
  medications: ExtractedMedication[];
  allergies: string[];
  conditions: string[];
  sections: ExtractedSection[];
  /** Raw test names from lab tables (for lexicon patches). */
  rawLabNames: string[];
  doctors: string[];
  facilityName?: string;
};

function normCell(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function splitPipeRow(line: string): string[] {
  const t = line.trim();
  if (!t.startsWith("|")) return [];
  const inner = t.replace(/^\|/, "").replace(/\|$/, "");
  return inner.split("|").map((c) => normCell(c));
}

function isSepRow(cells: string[]): boolean {
  return (
    cells.length > 0 &&
    cells.every((c) => {
      const x = c.replace(/\s/g, "");
      return /^:?-{2,}:?$/.test(x);
    })
  );
}

/** Collect consecutive GFM-style pipe tables (≥2 rows). */
export function extractMarkdownTables(md: string): string[][][] {
  const lines = md.split(/\r?\n/);
  const tables: string[][][] = [];
  let cur: string[][] | null = null;
  for (const line of lines) {
    const row = splitPipeRow(line);
    if (row.length >= 2) {
      if (!cur) cur = [];
      cur.push(row);
    } else {
      if (cur && cur.length >= 2) tables.push(cur);
      cur = null;
    }
  }
  if (cur && cur.length >= 2) tables.push(cur);
  return tables;
}

function normHeader(s: string): string {
  return normCell(s).toLowerCase();
}

function extractMetadataFromTables(md: string): {
  docDate?: string;
  doctors: string[];
  facilityName?: string;
} {
  const doctors: string[] = [];
  let docDate: string | undefined;
  let facilityName: string | undefined;

  for (const table of extractMarkdownTables(md)) {
    const hdr = table[0].map(normHeader);
    const fieldIdx = hdr.findIndex((h) => h === "field" || h.startsWith("field "));
    const valIdx = hdr.findIndex((h) => h === "value" || h.startsWith("value"));
    if (fieldIdx < 0 || valIdx < 0) continue;

    let i = 1;
    if (table[1] && isSepRow(table[1])) i = 2;
    for (; i < table.length; i++) {
      const row = table[i];
      if (isSepRow(row)) continue;
      const label = (row[fieldIdx] ?? "").trim();
      const val = (row[valIdx] ?? "").trim();
      if (!label || !val || val === "—") continue;

      if (/date of document/i.test(label)) {
        const iso = val.match(/\d{4}-\d{2}-\d{2}/);
        if (iso) docDate = iso[0];
      } else if (/^doctors?$/i.test(label) || /clinician/i.test(label)) {
        val
          .split(/[,;]/g)
          .map((s) => s.trim())
          .filter((s) => s.length > 1)
          .forEach((d) => doctors.push(d));
      } else if (/hospital|clinic|facility|lab\s*\/\s*hospital/i.test(label)) {
        facilityName = val;
      }
    }
  }

  return { docDate, doctors, facilityName };
}

function colIndex(headers: string[], pred: (h: string) => boolean): number {
  return headers.findIndex(pred);
}

function parseLabTable(
  table: string[][],
  fallbackDate: string | undefined,
  extensions: StandardLexiconEntry[]
): { labs: ExtractedLab[]; rawNames: string[] } {
  if (table.length < 2) return { labs: [], rawNames: [] };
  const row0 = 0;
  let dataStart = 1;
  if (table[1] && isSepRow(table[1])) dataStart = 2;

  const header = table[row0].map(normHeader);
  let keyIdx = colIndex(
    header,
    (h) =>
      (h.includes("standard") && h.includes("key")) ||
      /^test(\s*name)?$/.test(h) ||
      (h.includes("test") && !h.includes("value")) ||
      (h === "key" && !h.includes("value")) ||
      h === "analyte" ||
      h === "parameter" ||
      (h === "name" && !h.includes("medication") && !h.includes("patient"))
  );
  let valIdx = colIndex(
    header,
    (h) => h === "value" || h === "result" || (h.includes("value") && !h.includes("reference"))
  );
  const unitIdx = colIndex(header, (h) => h === "unit" || h === "units");
  const refIdx = colIndex(header, (h) => h.includes("reference") || h === "ref" || h === "range");
  const dateIdx = colIndex(header, (h) => h.includes("date"));

  if (keyIdx < 0 || valIdx < 0) {
    if (table[row0].length >= 4) {
      keyIdx = 0;
      valIdx = 1;
    } else {
      return { labs: [], rawNames: [] };
    }
  }

  const labs: ExtractedLab[] = [];
  const rawNames: string[] = [];

  for (let i = dataStart; i < table.length; i++) {
    const row = table[i];
    if (isSepRow(row)) continue;
    const rawName = stripMdMarkers((row[keyIdx] ?? "").trim());
    const value = stripMdMarkers((row[valIdx] ?? "").trim());
    if (!rawName || rawName.toLowerCase() === "field" || /^total$/i.test(rawName)) continue;
    if (!value || value === "—") continue;

    rawNames.push(rawName);
    const name = resolveCanonicalLabName(rawName, extensions);
    const unit = unitIdx >= 0 ? stripMdMarkers((row[unitIdx] ?? "").trim()) : "";
    const refRange = refIdx >= 0 ? stripMdMarkers((row[refIdx] ?? "").trim()) : "";
    const rowDate = dateIdx >= 0 ? (row[dateIdx] ?? "").trim() : "";
    const date =
      rowDate && rowDate !== "—"
        ? rowDate.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? rowDate
        : fallbackDate;

    labs.push({
      name,
      value,
      unit: unit && unit !== "—" ? unit : undefined,
      refRange: refRange && refRange !== "—" ? refRange : undefined,
      date,
    });
  }

  return { labs, rawNames };
}

function parseMedicationTable(table: string[][]): ExtractedMedication[] {
  if (table.length < 2) return [];
  let dataStart = 1;
  if (table[1] && isSepRow(table[1])) dataStart = 2;
  const header = table[0].map(normHeader);

  const nameIdx = colIndex(
    header,
    (h) =>
      /medication|medicine|drug|name/.test(h) &&
      !/frequency|dose|strength|route|instruction/.test(h)
  );
  const doseIdx = colIndex(header, (h) => /dose|strength|amount|dosage/.test(h));
  const freqIdx = colIndex(header, (h) => /frequency|sig|schedule|how\s*often/.test(h));
  const routeIdx = colIndex(header, (h) => /route/.test(h));
  const startIdx = colIndex(header, (h) => /start/.test(h));
  const endIdx = colIndex(header, (h) => /end/.test(h));
  const notesIdx = colIndex(header, (h) => /note|instruction/.test(h));

  if (nameIdx < 0) return [];

  const out: ExtractedMedication[] = [];
  for (let i = dataStart; i < table.length; i++) {
    const row = table[i];
    if (isSepRow(row)) continue;
    const name = stripMdMarkers((row[nameIdx] ?? "").trim());
    if (!name || name.toLowerCase() === "medication") continue;
    out.push({
      name,
      dose: doseIdx >= 0 ? stripMdMarkers((row[doseIdx] ?? "").trim()) || undefined : undefined,
      frequency: freqIdx >= 0 ? stripMdMarkers((row[freqIdx] ?? "").trim()) || undefined : undefined,
      route: routeIdx >= 0 ? stripMdMarkers((row[routeIdx] ?? "").trim()) || undefined : undefined,
      startDate: startIdx >= 0 ? stripMdMarkers((row[startIdx] ?? "").trim()) || undefined : undefined,
      endDate: endIdx >= 0 ? stripMdMarkers((row[endIdx] ?? "").trim()) || undefined : undefined,
      notes: notesIdx >= 0 ? stripMdMarkers((row[notesIdx] ?? "").trim()) || undefined : undefined,
    });
  }
  return out;
}

function isLikelyLabTable(header: string[]): boolean {
  const h = header.join(" ");
  return (
    ((h.includes("standard") && h.includes("key")) || h.includes("test")) &&
    (h.includes("value") || h.includes("result"))
  );
}

function isLikelyMedTable(header: string[]): boolean {
  const h = header.join(" ");
  return (
    (h.includes("medication") || h.includes("drug") || (h.includes("medicine") && h.includes("name"))) &&
    (h.includes("dose") || h.includes("strength") || h.includes("frequency"))
  );
}

function extractBulletSection(md: string, titleRegex: string): string[] {
  const m = md.match(
    new RegExp(
      `^#{2,3}\\s*(?:${titleRegex})\\s*\\r?\\n([\\s\\S]*?)(?=\\r?\\n#{1,3}\\s|\\r?\\n---\\s*$|$)`,
      "im"
    )
  );
  if (!m) return [];
  const block = m[1];
  const items: string[] = [];
  for (const line of block.split(/\r?\n/)) {
    const t = line.trim();
    const bullet = stripMdMarkers(t.replace(/^[-*]\s+/, "").trim());
    if (bullet.length > 1 && bullet !== "—" && !t.startsWith("|")) items.push(bullet);
  }
  return items;
}

function extractDetailSubsections(md: string): ExtractedSection[] {
  const idx = md.search(/\n##\s+Details\b/i);
  if (idx < 0) return [];
  const rest = md.slice(idx);
  const next = rest.slice(1).search(/\n##\s+\S/);
  const block = next >= 0 ? rest.slice(0, next + 1) : rest;
  const sections: ExtractedSection[] = [];
  const chunks = block.split(/\n###\s+/);
  for (let c = 1; c < chunks.length; c++) {
    const lines = chunks[c].split(/\r?\n/);
    const title = (lines[0] ?? "").trim();
    if (!title) continue;
    const items = lines
      .slice(1)
      .map((l) => l.trim())
      .filter((l) => /^[-*]\s+/.test(l))
      .map((l) => l.replace(/^[-*]\s+/, "").trim())
      .filter((l) => l.length > 0);
    if (items.length) sections.push({ title, items });
  }
  return sections;
}

function labKey(l: ExtractedLab): string {
  return `${l.name.toLowerCase()}|${l.date ?? ""}|${l.value}|${l.unit ?? ""}`;
}

function mergeLabsByKey(a: ExtractedLab[] | undefined, b: ExtractedLab[]): ExtractedLab[] {
  const map = new Map<string, ExtractedLab>();
  (a ?? []).forEach((l) => map.set(labKey(l), l));
  b.forEach((l) => map.set(labKey(l), l));
  return Array.from(map.values());
}

function mergeMedsByName(a: ExtractedMedication[] | undefined, b: ExtractedMedication[]): ExtractedMedication[] {
  const map = new Map<string, ExtractedMedication>();
  (a ?? []).forEach((m) => map.set(m.name.toLowerCase(), m));
  b.forEach((m) => map.set(m.name.toLowerCase(), m));
  return Array.from(map.values());
}

/**
 * Parse UMA markdown artifacts into structured rows. Uses pipe tables and optional ## sections.
 */
export function parseStructuredFromMarkdown(
  md: string,
  fallbackDate: string | undefined,
  extensions: StandardLexiconEntry[]
): ParsedFromMarkdown {
  const meta = extractMetadataFromTables(md);
  const docDate = meta.docDate ?? fallbackDate;

  const labs: ExtractedLab[] = [];
  const rawLabNames: string[] = [];
  const medications: ExtractedMedication[] = [];

  for (const table of extractMarkdownTables(md)) {
    if (table.length < 2) continue;
    const header = table[0].map(normHeader);
    if (header.includes("field") && header.includes("value")) continue;
    if (isLikelyMedTable(header)) {
      medications.push(...parseMedicationTable(table));
      continue;
    }
    if (isLikelyLabTable(header) || table[0].length >= 5) {
      const { labs: L, rawNames } = parseLabTable(table, docDate, extensions);
      if (L.length) {
        labs.push(...L);
        rawLabNames.push(...rawNames);
      }
    }
  }

  const allergies = [
    ...extractBulletSection(md, "Allerg(?:y|ies)"),
    ...extractBulletSection(md, "Known\\s+allergies"),
  ];
  const conditions = [
    ...extractBulletSection(md, "Conditions?"),
    ...extractBulletSection(md, "Diagnos(?:is|es)"),
  ];

  const sections = extractDetailSubsections(md);

  return {
    labs,
    medications,
    allergies: [...new Set(allergies.map((s) => s.trim()).filter(Boolean))],
    conditions: [...new Set(conditions.map((s) => s.trim()).filter(Boolean))],
    sections,
    rawLabNames: [...new Set(rawLabNames)],
    doctors: meta.doctors,
    facilityName: meta.facilityName,
  };
}

/**
 * Apply an existing parse result to a document (no re-parse — use from server after `parseStructuredFromMarkdown`).
 */
export function applyParsedMarkdownToDoc(doc: ExtractedDoc, p: ParsedFromMarkdown): ExtractedDoc {
  const labs = mergeLabsByKey(doc.labs, p.labs);
  const medications = mergeMedsByName(doc.medications, p.medications);

  const allergySet = new Set([...(doc.allergies ?? []), ...p.allergies].map((s) => s.trim()).filter(Boolean));
  const conditionSet = new Set(
    [...(doc.conditions ?? []), ...p.conditions].map((s) => s.trim()).filter(Boolean)
  );

  const sections =
    p.sections.length > 0 ? p.sections : doc.sections && doc.sections.length > 0 ? doc.sections : undefined;

  const doctors =
    doc.doctors?.length ? doc.doctors : p.doctors.length ? p.doctors : undefined;
  const facilityName = doc.facilityName ?? p.facilityName;

  return {
    ...doc,
    labs: labs.length ? labs : doc.labs,
    medications: medications.length ? medications : doc.medications,
    allergies: allergySet.size ? Array.from(allergySet) : doc.allergies,
    conditions: conditionSet.size ? Array.from(conditionSet) : doc.conditions,
    sections,
    doctors,
    facilityName,
  };
}

/**
 * Parse markdown and merge into the document (client merge path; parses once).
 */
export function enrichDocFromMarkdown(
  doc: ExtractedDoc,
  extensions: StandardLexiconEntry[] = []
): ExtractedDoc {
  const md = doc.markdownArtifact?.trim();
  if (!md) return doc;
  const p = parseStructuredFromMarkdown(md, doc.dateISO, extensions);
  return applyParsedMarkdownToDoc(doc, p);
}
