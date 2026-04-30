/**
 * GET /api/patient-store/stream
 *
 * Server-Sent Events stream backed by Postgres LISTEN/NOTIFY.
 * Fires a `data: <userId>\n\n` event whenever `upsertPatientStore` writes
 * a change for the authenticated user, so the browser can refetch the store.
 *
 * Falls back to a 30-second keep-alive ping if the database NOTIFY never fires,
 * so client-side exponential-backoff reconnect logic stays exercised.
 */

import type { NextRequest } from "next/server";
import { Client } from "pg";
import { getSessionClaims } from "@/lib/server/authSession";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KEEPALIVE_MS = 30_000;

export async function GET(req: NextRequest) {
  const claims = await getSessionClaims();
  if (!claims) {
    return new Response("Unauthorized", { status: 401 });
  }
  const userId = claims.sub;

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const client = new Client({
        connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
      });

      let closed = false;

      function enqueue(data: string) {
        if (!closed) {
          try {
            controller.enqueue(encoder.encode(data));
          } catch {
            // controller already closed
          }
        }
      }

      function close() {
        if (closed) return;
        closed = true;
        client.end().catch(() => {});
        try {
          controller.close();
        } catch {
          // already closed
        }
      }

      const keepalive = setInterval(() => {
        enqueue(": keep-alive\n\n");
      }, KEEPALIVE_MS);

      client
        .connect()
        .then(() => client.query("LISTEN patient_store_changed"))
        .then(() => {
          enqueue(`data: connected\n\n`);

          client.on("notification", (msg) => {
            if (msg.payload === userId) {
              enqueue(`data: ${userId}\n\n`);
            }
          });

          client.on("error", () => {
            clearInterval(keepalive);
            close();
          });
        })
        .catch(() => {
          clearInterval(keepalive);
          close();
        });

      req.signal.addEventListener("abort", () => {
        clearInterval(keepalive);
        close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
