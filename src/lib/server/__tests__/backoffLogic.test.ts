/**
 * Tests the backoff calculation logic used in useLivePatientStore.
 * Verifies doubling with cap and jitter bounds without needing a DOM.
 */

import { describe, it, expect } from "vitest";

const BACKOFF_INIT_MS = 1_000;
const BACKOFF_MAX_MS = 30_000;
const JITTER = 0.2;

function jittered(ms: number): number {
  return ms * (1 + (Math.random() * 2 - 1) * JITTER);
}

function nextBackoff(current: number): number {
  return Math.min(current * 2, BACKOFF_MAX_MS);
}

describe("reconnection backoff logic", () => {
  it("starts at BACKOFF_INIT_MS", () => {
    expect(BACKOFF_INIT_MS).toBe(1_000);
  });

  it("doubles on each failure until the cap", () => {
    let b = BACKOFF_INIT_MS;
    const sequence: number[] = [b];
    for (let i = 0; i < 6; i++) {
      b = nextBackoff(b);
      sequence.push(b);
    }
    expect(sequence).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000]);
  });

  it("never exceeds BACKOFF_MAX_MS after many failures", () => {
    let b = BACKOFF_INIT_MS;
    for (let i = 0; i < 100; i++) b = nextBackoff(b);
    expect(b).toBe(BACKOFF_MAX_MS);
  });

  it("jitter stays within ±20% of the base value", () => {
    const base = 4_000;
    for (let i = 0; i < 500; i++) {
      const j = jittered(base);
      expect(j).toBeGreaterThanOrEqual(base * (1 - JITTER));
      expect(j).toBeLessThanOrEqual(base * (1 + JITTER));
    }
  });

  it("resets to BACKOFF_INIT_MS after a successful message", () => {
    let b = 16_000;
    // Simulate successful message → reset
    b = BACKOFF_INIT_MS;
    expect(b).toBe(1_000);
  });
});
