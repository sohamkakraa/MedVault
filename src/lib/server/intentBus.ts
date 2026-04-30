import { EventEmitter } from "events";

export type IntentPayload =
  | { type: "medication_intake"; userId: string; medName: string; takenAt: string }
  | { type: "blood_pressure"; userId: string; systolic: number; diastolic: number; recordedAt: string };

class IntentBus extends EventEmitter {}

/** In-process pub/sub for health intents detected via WhatsApp. */
export const intentBus = new IntentBus();
