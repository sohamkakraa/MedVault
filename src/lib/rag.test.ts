import { describe, expect, it } from "vitest";
import { tokenize, rankDocsByQuery, retrieveRelevantDocs, buildRetrievalQuery } from "./rag";
import type { ExtractedDoc } from "./types";

function makeDoc(overrides: Partial<ExtractedDoc>): ExtractedDoc {
  return {
    id: Math.random().toString(36).slice(2),
    type: "Other",
    title: "",
    dateISO: "2026-01-01",
    provider: null,
    summary: "",
    medications: [],
    labs: [],
    tags: [],
    allergies: [],
    conditions: [],
    sections: [],
    uploadedAtISO: "2026-01-01T00:00:00.000Z",
    ...overrides,
  } as ExtractedDoc;
}

// ── tokenize ─────────────────────────────────────────────────────────────────

describe("tokenize", () => {
  it("lowercases and splits on whitespace", () => {
    expect(tokenize("HbA1c LDL HDL")).toEqual(["hba1c", "ldl", "hdl"]);
  });

  it("removes stop words", () => {
    expect(tokenize("what is the result")).toEqual(["result"]);
  });

  it("keeps 2-char medical abbreviations (BP, HR, etc.) while removing 1-char tokens", () => {
    // "a" → 1 char filtered; "an" → stop word filtered; "BP", "HR" → 2 chars kept
    expect(tokenize("a an BP HR")).toEqual(["bp", "hr"]);
  });

  it("strips punctuation", () => {
    expect(tokenize("chest X-ray, 2026")).toEqual(["chest", "ray", "2026"]);
  });

  it("returns empty array for blank input", () => {
    expect(tokenize("")).toEqual([]);
  });
});

// ── rankDocsByQuery ───────────────────────────────────────────────────────────
// Note: rankDocsByQuery returns docs in INPUT ORDER with scores attached.
// Use retrieveRelevantDocs when you need sorted results.

describe("rankDocsByQuery", () => {
  const chestXray = makeDoc({
    title: "Chest X-Ray Report",
    type: "Imaging",
    summary: "Chest X-ray from Apex Clinic — no acute findings.",
    markdownArtifact: "## Diagnoses\n- No acute findings\n- Lungs are clear",
  });

  const lipidPanel = makeDoc({
    title: "Lipid Profile",
    type: "Lab report",
    summary: "Lipid panel: LDL 162, HDL 38, cholesterol 237.",
    markdownArtifact: "| LDL | 162 | mg/dL |\n| HDL | 38 | mg/dL |",
  });

  const kneeReport = makeDoc({
    title: "Knee MRI",
    type: "Imaging",
    summary: "Knee MRI — Grade III medial meniscus tear.",
    markdownArtifact: "## Diagnoses\n- Grade III medial meniscus tear",
  });

  it("chest X-ray scores higher than lipid panel for 'chest xray findings'", () => {
    const scored = rankDocsByQuery("chest xray findings", [chestXray, lipidPanel, kneeReport]);
    const byTitle = Object.fromEntries(scored.map((s) => [s.doc.title, s.score]));
    expect(byTitle["Chest X-Ray Report"]).toBeGreaterThan(byTitle["Lipid Profile"]);
    expect(byTitle["Chest X-Ray Report"]).toBeGreaterThan(byTitle["Knee MRI"]);
  });

  it("lipid panel scores higher than others for 'LDL cholesterol'", () => {
    const scored = rankDocsByQuery("LDL cholesterol", [chestXray, lipidPanel, kneeReport]);
    const byTitle = Object.fromEntries(scored.map((s) => [s.doc.title, s.score]));
    expect(byTitle["Lipid Profile"]).toBeGreaterThan(byTitle["Chest X-Ray Report"]);
    expect(byTitle["Lipid Profile"]).toBeGreaterThan(byTitle["Knee MRI"]);
  });

  it("knee MRI scores higher than others for 'meniscus tear knee'", () => {
    const scored = rankDocsByQuery("meniscus tear knee", [chestXray, lipidPanel, kneeReport]);
    const byTitle = Object.fromEntries(scored.map((s) => [s.doc.title, s.score]));
    expect(byTitle["Knee MRI"]).toBeGreaterThan(byTitle["Chest X-Ray Report"]);
    expect(byTitle["Knee MRI"]).toBeGreaterThan(byTitle["Lipid Profile"]);
  });

  it("returns all docs even when query terms are absent", () => {
    const scored = rankDocsByQuery("something completely unrelated xyz", [chestXray, lipidPanel]);
    expect(scored).toHaveLength(2);
  });

  it("returns empty array for empty docs", () => {
    expect(rankDocsByQuery("chest", [])).toEqual([]);
  });
});

// ── retrieveRelevantDocs ──────────────────────────────────────────────────────

describe("retrieveRelevantDocs", () => {
  it("returns docs in relevance order", () => {
    const vax = makeDoc({ title: "Vaccination Record", summary: "Influenza, Tdap, COVID-19 vaccines.", dateISO: "2026-03-01" });
    const ecg = makeDoc({ title: "ECG Report", summary: "Normal sinus rhythm.", dateISO: "2026-02-22" });
    const result = retrieveRelevantDocs("influenza vaccine tdap", [ecg, vax]);
    expect(result[0].title).toBe("Vaccination Record");
  });

  it("breaks score ties by recency (more recent first)", () => {
    const older = makeDoc({ title: "Lab A", summary: "Routine blood panel.", dateISO: "2025-01-01" });
    const newer = makeDoc({ title: "Lab B", summary: "Routine blood panel.", dateISO: "2026-01-01" });
    // Both have identical text → same BM25 score; newer should win
    const result = retrieveRelevantDocs("routine blood panel", [older, newer]);
    expect(result[0].title).toBe("Lab B");
  });
});

// ── buildRetrievalQuery ───────────────────────────────────────────────────────

describe("buildRetrievalQuery", () => {
  it("appends up to 3 recent user messages before current query", () => {
    const history = [
      { role: "user", content: "knee MRI" },
      { role: "assistant", content: "Here is your knee MRI result." },
      { role: "user", content: "what did the radiologist say" },
    ];
    const q = buildRetrievalQuery("grade III", history);
    expect(q).toContain("knee MRI");
    expect(q).toContain("what did the radiologist say");
    expect(q).toContain("grade III");
    // assistant messages excluded
    expect(q).not.toContain("Here is your knee MRI result.");
  });

  it("works with empty history", () => {
    expect(buildRetrievalQuery("HbA1c", [])).toBe("HbA1c");
  });

  it("limits history to last 3 user messages", () => {
    const history = Array.from({ length: 10 }, (_, i) => ({
      role: "user",
      content: `message ${i}`,
    }));
    const q = buildRetrievalQuery("current", history);
    // Should include messages 7, 8, 9 (last 3) plus current
    expect(q).toContain("message 7");
    expect(q).toContain("message 8");
    expect(q).toContain("message 9");
    expect(q).not.toContain("message 6");
  });
});
