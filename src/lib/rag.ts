/**
 * BM25-based document retrieval for the UMA chat context window.
 *
 * Why BM25 and not embeddings:
 *   - Zero new infrastructure (no vector DB, no embedding API calls)
 *   - Deterministic and fast (< 1 ms for 100 docs)
 *   - Medical queries are keyword-rich ("HbA1c", "chest X-ray", "Telmisartan") —
 *     exact-match recall matters more than semantic fuzziness here
 *   - Can be replaced by pgvector embeddings later without changing the interface
 */

import type { ExtractedDoc } from "@/lib/types";

const STOP_WORDS = new Set([
  "a","an","the","and","or","but","in","on","at","to","for","of","with",
  "by","from","is","was","are","were","be","been","being","have","has",
  "had","do","does","did","will","would","could","should","may","might",
  "shall","can","my","your","his","her","its","our","their","this","that",
  "these","those","i","we","you","he","she","it","they","what","which",
  "who","when","where","how","all","any","both","each","few","more","most",
  "other","some","such","no","not","only","own","same","so","than","too",
  "very","just","about","above","after","also","as","before","between",
  "during","if","into","like","me","over","through","under","up","use",
  "was","while","report","document","summary","please","tell","show",
  "give","get","find","see","look","did","does","have","had",
]);

/** Tokenize text into normalized terms suitable for BM25 scoring. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    // ≥ 2 to preserve medical abbreviations: BP, HR, IV, pH, etc.
    .filter((t) => t.length >= 2 && !STOP_WORDS.has(t));
}

/** Build the full searchable text for a document (all fields, weighted by priority). */
function docCorpus(doc: ExtractedDoc): string {
  // Title and type appear twice to boost exact type/title matches
  return [
    doc.title ?? "",
    doc.title ?? "",
    doc.type ?? "",
    doc.type ?? "",
    doc.summary ?? "",
    doc.provider ?? "",
    doc.facilityName ?? "",
    (doc.conditions ?? []).join(" "),
    (doc.allergies ?? []).join(" "),
    (doc.tags ?? []).join(" "),
    (doc.labs ?? []).map((l) => l.name).join(" "),
    (doc.medications ?? []).map((m) => m.name).join(" "),
    // Limit artifact to first 8 000 chars to keep scoring fast
    (doc.markdownArtifact ?? "").slice(0, 8_000),
  ].join(" ");
}

type ScoredDoc = { doc: ExtractedDoc; score: number };

/**
 * Score every document against the query using BM25 (k1=1.5, b=0.75).
 * Returns all docs with their scores; caller decides how many to take.
 */
export function rankDocsByQuery(
  query: string,
  docs: ExtractedDoc[],
): ScoredDoc[] {
  if (!docs.length) return [];

  const queryTerms = [...new Set(tokenize(query))]; // deduplicate query terms
  if (!queryTerms.length) return docs.map((doc) => ({ doc, score: 0 }));

  // Pre-compute per-document term frequencies and lengths
  const entries = docs.map((doc) => {
    const tokens = tokenize(docCorpus(doc));
    const tf = new Map<string, number>();
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    return { doc, tf, len: tokens.length };
  });

  const N = docs.length;
  const avgLen = entries.reduce((s, e) => s + e.len, 0) / N || 1;

  // IDF: Robertson-Sparck Jones variant (always ≥ 0)
  const idf = new Map<string, number>();
  for (const term of queryTerms) {
    const df = entries.filter((e) => e.tf.has(term)).length;
    idf.set(term, Math.log((N - df + 0.5) / (df + 0.5) + 1));
  }

  const k1 = 1.5;
  const b = 0.75;

  return entries.map(({ doc, tf, len }) => {
    let score = 0;
    for (const term of queryTerms) {
      const freq = tf.get(term) ?? 0;
      if (freq === 0) continue;
      const idfVal = idf.get(term) ?? 0;
      score += idfVal * (freq * (k1 + 1)) / (freq + k1 * (1 - b + b * (len / avgLen)));
    }
    return { doc, score };
  });
}

/**
 * Return all docs sorted by BM25 relevance to the combined query.
 * Ties broken by recency (most recent document first).
 *
 * @param query     The current user message (or combined recent messages)
 * @param docs      All documents in the patient store
 */
export function retrieveRelevantDocs(
  query: string,
  docs: ExtractedDoc[],
): ExtractedDoc[] {
  return rankDocsByQuery(query, docs)
    .sort((a, b) => {
      if (Math.abs(b.score - a.score) > 1e-9) return b.score - a.score;
      // Recency tiebreak: more recent doc first
      return (b.doc.dateISO ?? "").localeCompare(a.doc.dateISO ?? "");
    })
    .map((r) => r.doc);
}

/**
 * Build the retrieval query from the current message plus recent history.
 * Using the last few user turns helps when the user refers back to an earlier topic
 * (e.g. "what did it say?" after "tell me about my knee MRI").
 */
export function buildRetrievalQuery(
  userContent: string,
  history: Array<{ role: string; content: string }>,
): string {
  const recentUserMessages = history
    .filter((m) => m.role === "user")
    .slice(-3)
    .map((m) => m.content);
  return [...recentUserMessages, userContent].join(" ");
}
