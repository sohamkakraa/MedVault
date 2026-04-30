import { z } from "zod";

/** Raw phone input: digits and leading +, 10–20 chars. Strip non-digit/+ before E.164 normalisation. */
export const PhoneRawSchema = z
  .string()
  .min(10)
  .max(20)
  .transform((v) => v.replace(/[^0-9+]/g, ""));

/** ISO calendar date, e.g. 2024-03-15. */
export const IsoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be a date in YYYY-MM-DD format");

/** Document / record ID: URL-safe alphanumeric, up to 64 chars. */
export const DocIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, "Invalid record ID");
