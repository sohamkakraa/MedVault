"use client";

import { useActionState } from "react";
import { create, type CreateCommentState } from "./actions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

const initial: CreateCommentState = {};

export function CommentForm() {
  const [state, formAction, pending] = useActionState(create, initial);

  return (
    <form action={formAction} className="space-y-3">
      <label className="text-xs mv-muted block">
        Comment
        <Input name="comment" className="mt-1" placeholder="Write something…" disabled={pending} />
      </label>
      {state?.error ? (
        <p className="text-sm text-red-700 dark:text-red-300" role="alert">
          {state.error}
        </p>
      ) : null}
      {state?.ok ? (
        <p className="text-sm text-[var(--accent)]" role="status">
          Saved.
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Submit"}
      </Button>
    </form>
  );
}
