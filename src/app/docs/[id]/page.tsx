"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { getStore } from "@/lib/store";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ArrowLeft } from "lucide-react";

export default function DocDetailPage() {
  const params = useParams<{ id: string }>();
  const [store, setStore] = useState(() => getStore());

  useEffect(() => {
    const onFocus = () => setStore(getStore());
    const onCustom = () => setStore(getStore());
    window.addEventListener("focus", onFocus);
    window.addEventListener("mv-store-update", onCustom as EventListener);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("mv-store-update", onCustom as EventListener);
    };
  }, []);

  const doc = useMemo(() => store.docs.find((d) => d.id === params.id), [store.docs, params.id]);

  if (!doc) {
    return (
      <div className="min-h-screen pb-24">
        <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--panel)]/80 backdrop-blur">
          <div className="mx-auto max-w-5xl px-4 py-4 flex items-center gap-3">
            <Link href="/dashboard">
              <Button variant="ghost" className="gap-2">
                <ArrowLeft className="h-4 w-4" /> Back
              </Button>
            </Link>
            <div>
              <h1 className="text-lg font-semibold">Document</h1>
              <p className="text-xs mv-muted">Document not found.</p>
            </div>
          </div>
        </header>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24">
      <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--panel)]/80 backdrop-blur">
        <div className="mx-auto max-w-5xl px-4 py-4 flex items-center gap-3">
          <Link href="/dashboard">
            <Button variant="ghost" className="gap-2">
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
          </Link>
          <div>
            <h1 className="text-lg font-semibold">Document details</h1>
            <p className="text-xs mv-muted">{doc.title}</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 space-y-6">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge>{doc.type}</Badge>
              {doc.dateISO ? <Badge>Date: {doc.dateISO}</Badge> : null}
              {doc.provider ? <Badge>Provider: {doc.provider}</Badge> : null}
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm mv-muted">{doc.summary}</p>
          </CardContent>
        </Card>

        {doc.sections?.length ? (
          <Card>
            <CardHeader>
              <h2 className="text-sm font-medium">Highlights</h2>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              {doc.sections.map((s, i) => (
                <div key={`${s.title}-${i}`} className="rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] p-3">
                  <p className="text-xs font-semibold">{s.title}</p>
                  <ul className="mt-2 text-xs mv-muted list-disc pl-4">
                    {(s.items ?? []).map((item, idx) => (
                      <li key={`${s.title}-${idx}`}>{item}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}

        {doc.medications?.length ? (
          <Card>
            <CardHeader>
              <h2 className="text-sm font-medium">Medications</h2>
            </CardHeader>
            <CardContent className="grid gap-2 md:grid-cols-2">
              {doc.medications.map((m, i) => (
                <div key={i} className="rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] p-3 text-sm">
                  <div className="font-medium">{m.name}</div>
                  <div className="text-xs mv-muted">
                    {m.dose ? `${m.dose} · ` : ""}{m.frequency ?? ""}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}

        {doc.labs?.length ? (
          <Card>
            <CardHeader>
              <h2 className="text-sm font-medium">Lab values</h2>
            </CardHeader>
            <CardContent className="grid gap-2 md:grid-cols-2">
              {doc.labs.map((l, i) => (
                <div key={i} className="rounded-2xl border border-[var(--border)] bg-[var(--panel-2)] p-3 text-sm">
                  <div className="font-medium">{l.name}</div>
                  <div className="text-xs mv-muted">
                    {l.value}{l.unit ? ` ${l.unit}` : ""}{l.date ? ` · ${l.date}` : ""}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}
      </main>
    </div>
  );
}
