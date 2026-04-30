/**
 * SSE stream route tests.
 * Verifies that:
 * 1. Unauthenticated requests get a 401.
 * 2. Authenticated requests receive `data: connected\n\n` immediately.
 * 3. A NOTIFY for the right userId fires `data: <userId>\n\n`.
 * 4. A NOTIFY for a different userId is NOT forwarded.
 */

import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/server/authSession", () => ({
  getSessionClaims: vi.fn(),
}));

const mockPgClient = {
  connect: vi.fn().mockResolvedValue(undefined),
  query: vi.fn().mockResolvedValue(undefined),
  on: vi.fn(),
  end: vi.fn().mockResolvedValue(undefined),
};

vi.mock("pg", () => ({
  Client: vi.fn(() => mockPgClient),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Read up to `maxChunks` from a stream, stopping early after `timeoutMs`. */
async function readChunksWithTimeout(
  stream: ReadableStream<Uint8Array>,
  maxChunks: number,
  timeoutMs: number,
): Promise<string[]> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  const deadline = Date.now() + timeoutMs;
  try {
    while (chunks.length < maxChunks && Date.now() < deadline) {
      const remaining = deadline - Date.now();
      const { value, done } = await Promise.race([
        reader.read(),
        new Promise<{ value: undefined; done: true }>((r) =>
          setTimeout(() => r({ value: undefined, done: true }), remaining),
        ),
      ]);
      if (done || value === undefined) break;
      chunks.push(decoder.decode(value));
    }
  } finally {
    reader.releaseLock();
  }
  return chunks;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("SSE /api/patient-store/stream", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPgClient.connect.mockResolvedValue(undefined);
    mockPgClient.query.mockResolvedValue(undefined);
    mockPgClient.on.mockImplementation(() => {});
    mockPgClient.end.mockResolvedValue(undefined);
  });

  it("returns 401 when unauthenticated", async () => {
    const { getSessionClaims } = await import("@/lib/server/authSession");
    (getSessionClaims as Mock).mockResolvedValue(null);

    const { GET } = await import("@/app/api/patient-store/stream/route");
    const ac = new AbortController();
    const req = new Request("http://localhost/api/patient-store/stream") as unknown as Parameters<typeof GET>[0];
    Object.defineProperty(req, "signal", { value: ac.signal });

    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("sends connected event for authenticated user", async () => {
    const { getSessionClaims } = await import("@/lib/server/authSession");
    (getSessionClaims as Mock).mockResolvedValue({ sub: "user-123" });

    const { GET } = await import("@/app/api/patient-store/stream/route");
    const ac = new AbortController();
    const req = new Request("http://localhost/api/patient-store/stream") as unknown as Parameters<typeof GET>[0];
    Object.defineProperty(req, "signal", { value: ac.signal });

    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/event-stream");

    // Allow async pg connect + query to settle
    await new Promise((r) => setTimeout(r, 10));

    const chunks = await readChunksWithTimeout(res.body!, 1, 500);
    expect(chunks.some((c) => c.includes("data: connected"))).toBe(true);

    ac.abort();
  }, 10_000);

  it("forwards NOTIFY only for the correct userId", async () => {
    const userId = "user-xyz";
    const { getSessionClaims } = await import("@/lib/server/authSession");
    (getSessionClaims as Mock).mockResolvedValue({ sub: userId });

    // Capture the notification listener
    let notificationHandler: ((msg: { payload: string }) => void) | null = null;
    mockPgClient.on.mockImplementation((event: string, handler: (msg: { payload: string }) => void) => {
      if (event === "notification") notificationHandler = handler;
    });

    const { GET } = await import("@/app/api/patient-store/stream/route");
    const ac = new AbortController();
    const req = new Request("http://localhost/api/patient-store/stream") as unknown as Parameters<typeof GET>[0];
    Object.defineProperty(req, "signal", { value: ac.signal });

    const res = await GET(req);
    await new Promise((r) => setTimeout(r, 10));

    // Fire NOTIFY for wrong userId — should NOT produce a data event
    notificationHandler?.({ payload: "other-user" });
    // Fire NOTIFY for correct userId — should produce a data event
    notificationHandler?.({ payload: userId });

    const chunks = await readChunksWithTimeout(res.body!, 3, 500);
    const dataChunks = chunks.filter((c) => c.startsWith("data:") && !c.includes("connected"));
    expect(dataChunks).toHaveLength(1);
    expect(dataChunks[0]).toContain(userId);

    ac.abort();
  }, 10_000);
});
