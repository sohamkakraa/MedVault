import { Suspense } from "react";
import { notFound } from "next/navigation";
import { DocIdSchema } from "@/lib/schemas";
import DocDetailClient from "./DocDetailClient";

export default async function DocDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const parsed = DocIdSchema.safeParse(id);
  if (!parsed.success) notFound();

  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center p-8 text-sm mv-muted">
          Loading…
        </div>
      }
    >
      <DocDetailClient />
    </Suspense>
  );
}
