"use client";

import Link from "next/link";
import { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { mergeExtractedDoc } from "@/lib/store";
import type { ExtractedDoc, DocType } from "@/lib/types";
import { FileUp, ArrowLeft, Loader2 } from "lucide-react";

const TYPES: DocType[] = ["Lab report", "Prescription", "Bill", "Imaging", "Other"];

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [typeHint, setTypeHint] = useState<DocType>("Lab report");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ExtractedDoc | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function onExtract() {
    if (!file) return;
    setLoading(true);
    setErr(null);
    setResult(null);

    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("typeHint", typeHint);

      const r = await fetch("/api/extract", { method: "POST", body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? "Extraction failed");

      setResult(j.doc as ExtractedDoc);
    } catch (e: any) {
      setErr(e.message ?? "Extraction failed");
    } finally {
      setLoading(false);
    }
  }

  function onCommit() {
    if (!result) return;
    mergeExtractedDoc(result);
    window.location.href = "/dashboard";
  }

  return (
    <div className="min-h-screen pb-28">
      <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--panel)]/80 backdrop-blur">
        <div className="mx-auto max-w-4xl px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm mv-muted hover:text-[var(--fg)]">
              <ArrowLeft className="h-4 w-4" /> Back
            </Link>
            <div>
              <h1 className="text-lg font-semibold leading-tight">Upload & Extract</h1>
              <p className="text-xs mv-muted">Upload a PDF; confirm what the agent extracted.</p>
            </div>
          </div>
          <Badge>Prototype</Badge>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-6 space-y-4">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <FileUp className="h-4 w-4 text-[var(--accent)]" />
              <h2 className="text-sm font-medium">Document</h2>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="text-xs mv-muted">Type hint</label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {TYPES.map((t) => (
                    <button
                      key={t}
                      onClick={() => setTypeHint(t)}
                      className={[
                        "rounded-full border px-3 py-1 text-xs transition",
                        t === typeHint
                          ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)]"
                          : "border-[var(--border)] bg-[var(--panel-2)] text-[var(--fg)] hover:bg-[var(--panel)]",
                      ].join(" ")}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs mv-muted">PDF file</label>
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="mt-2 block w-full text-sm text-[var(--fg)] file:mr-4 file:rounded-xl file:border-0 file:bg-[var(--accent)] file:px-4 file:py-2 file:text-sm file:font-medium file:text-[var(--accent-contrast)] hover:file:brightness-110"
                />
                <p className="mt-2 text-xs mv-muted">
                  Best results: text-based PDFs (not scanned photos).
                </p>
              </div>
            </div>

            {err && (
              <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-700">
                {err}
              </div>
            )}

            <div className="flex items-center gap-2">
              <Button onClick={onExtract} disabled={!file || loading} className="gap-2">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
                {loading ? "Extracting..." : "Extract details"}
              </Button>
              <Link href="/dashboard">
                <Button variant="ghost">Cancel</Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        {result && (
          <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium">Extraction preview (confirm & save)</h2>
              <Badge>{result.type}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] p-4">
                <p className="text-sm font-medium">{result.title}</p>
                <p className="mt-1 text-sm mv-muted">{result.summary}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {result.dateISO && <Badge>Date: {result.dateISO}</Badge>}
                  {result.provider && <Badge>Provider: {result.provider}</Badge>}
                  {(result.tags ?? []).slice(0, 6).map((t, i) => (
                    <Badge key={i}>{t}</Badge>
                  ))}
                </div>
              </div>

              {result.medications?.length ? (
                <div>
                  <p className="text-sm font-medium">Medications found</p>
                  <div className="mt-2 space-y-2">
                    {result.medications.map((m, i) => (
                      <div key={i} className="rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] p-3 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{m.name}</span>
                          <Badge>Prescription</Badge>
                        </div>
                        <div className="mt-1 mv-muted text-xs">
                          {m.dose ? `Dose: ${m.dose} • ` : ""}
                          {m.frequency ? `Frequency: ${m.frequency} • ` : ""}
                          {m.route ? `Route: ${m.route}` : ""}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {result.labs?.length ? (
                <div>
                  <p className="text-sm font-medium">Lab results found</p>
                  <div className="mt-2 space-y-2">
                    {result.labs.map((l, i) => (
                      <div key={i} className="rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] p-3 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{l.name}</span>
                          <Badge>Lab</Badge>
                        </div>
                        <div className="mt-1 mv-muted text-xs">
                          Value: {l.value}{l.unit ? ` ${l.unit}` : ""}{l.refRange ? ` • Ref: ${l.refRange}` : ""}
                          {l.date ? ` • Date: ${l.date}` : ""}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {result.allergies?.length ? (
                <div>
                  <p className="text-sm font-medium">Allergies detected</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {result.allergies.map((a, i) => (
                      <Badge key={i}>{a}</Badge>
                    ))}
                  </div>
                </div>
              ) : null}

              {result.conditions?.length ? (
                <div>
                  <p className="text-sm font-medium">Conditions detected</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {result.conditions.map((c, i) => (
                      <Badge key={i}>{c}</Badge>
                    ))}
                  </div>
                </div>
              ) : null}

              {result.sections?.length ? (
                <div>
                  <p className="text-sm font-medium">Additional findings</p>
                  <div className="mt-2 grid gap-3 md:grid-cols-2">
                    {result.sections.map((s, i) => (
                      <div key={i} className="rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] p-3 text-sm">
                        <p className="font-medium">{s.title}</p>
                        <ul className="mt-2 text-xs mv-muted list-disc pl-4">
                          {(s.items ?? []).slice(0, 4).map((item, idx) => (
                            <li key={idx}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="flex items-center gap-2">
                <Button onClick={onCommit}>Confirm & add to dashboard</Button>
                <Button variant="ghost" onClick={() => setResult(null)}>
                  Discard
                </Button>
              </div>

              <p className="text-xs mv-muted">
                Prototype note: in a real product, each extracted item would have a confidence score and user edits before saving.
              </p>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
