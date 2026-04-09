"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export type CreateCommentState = { error?: string; ok?: boolean };

const commentSchema = z.object({
  comment: z.string().trim().min(1, "Enter a comment.").max(5000, "Comment is too long."),
});

/**
 * Server Action: insert a row into `comments` (Postgres via Prisma).
 * Name matches common Neon/Vercel tutorial examples.
 */
export async function create(
  _prev: CreateCommentState | undefined,
  formData: FormData,
): Promise<CreateCommentState> {
  const raw = formData.get("comment");
  if (typeof raw !== "string") {
    return { error: "Invalid input." };
  }

  const parsed = commentSchema.safeParse({ comment: raw });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid comment." };
  }

  try {
    await prisma.comment.create({
      data: { comment: parsed.data.comment },
    });
  } catch {
    return {
      error: "Could not save. Check DATABASE_URL, run prisma migrate deploy, and try again.",
    };
  }

  revalidatePath("/comments");
  return { ok: true };
}
