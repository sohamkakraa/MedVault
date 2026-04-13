import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader } from "@/components/ui/Card";
import { CommentForm } from "./CommentForm";

export const dynamic = "force-dynamic";

export default async function CommentsPage() {
  let comments: { id: string; comment: string; createdAt: Date }[] = [];
  let loadError: string | null = null;

  try {
    comments = await prisma.comment.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  } catch {
    loadError = "Could not load comments. Check DATABASE_URL and that migrations have been applied.";
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-10">
      <div className="mb-6">
        <Link href="/" className="text-sm mv-muted hover:text-[var(--fg)]">
          ← Home
        </Link>
      </div>

      <Card>
        <CardHeader>
          <h1 className="text-xl font-semibold mv-title">Comments</h1>
          <p className="text-sm mv-muted">
            Inserts into the Postgres <code className="text-[var(--fg)]">comments</code> table via a
            Server Action named <code className="text-[var(--fg)]">create</code>. UMA normally uses
            Prisma for all schema changes—no separate Neon SQL step required after{" "}
            <code className="text-[var(--fg)]">migrate deploy</code>.
          </p>
        </CardHeader>
        <CardContent className="space-y-8">
          <CommentForm />

          <div>
            <h2 className="text-sm font-medium text-[var(--fg)] mb-2">Recent</h2>
            {loadError ? (
              <p className="text-sm text-red-700 dark:text-red-300">{loadError}</p>
            ) : comments.length === 0 ? (
              <p className="text-sm mv-muted">No comments yet.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {comments.map((c) => (
                  <li
                    key={c.id}
                    className="rounded-xl border border-[var(--border)] bg-[var(--panel-2)] p-3"
                  >
                    <p className="text-[var(--fg)] whitespace-pre-wrap">{c.comment}</p>
                    <p className="mt-1 text-[11px] mv-muted">
                      {c.createdAt.toISOString().replace("T", " ").slice(0, 19)} UTC
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>

      <p className="mt-6 text-[11px] leading-relaxed mv-muted">
        Not medical advice. This page is for verifying database connectivity only.
      </p>
    </div>
  );
}
