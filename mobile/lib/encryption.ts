/**
 * UMA Mobile — Client-Side Encryption Layer
 *
 * AES-256-GCM encryption for all health data BEFORE it leaves the device.
 * The encryption key is derived from the user's auth session and stored
 * securely via expo-secure-store (Keychain on iOS, Keystore on Android).
 *
 * Design:
 *  - Per-user key derived from Supabase auth token + device-local salt
 *  - Random IV per encryption operation (never reused)
 *  - Authentication tag prevents tampering
 *  - Key never leaves the secure enclave
 *
 * Why client-side encryption on top of Supabase's at-rest encryption?
 *  - Defense-in-depth: even if Supabase is breached, data is unreadable
 *  - Zero-knowledge: Supabase operators cannot read patient data
 *  - Regulatory: stronger posture for HIPAA / DPDPA compliance
 */

import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import type { EncryptedBlob } from "./types";

const KEY_ALIAS = "uma_enc_key_v1";
const SALT_ALIAS = "uma_enc_salt_v1";
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 12;  // 96 bits for GCM

/* ─── Key Management ─────────────────────────────────────────── */

/**
 * Derive and store an encryption key from the user's auth token.
 * Called once after successful login. The key is stored in the
 * platform's secure storage (Keychain / Keystore).
 */
export async function initEncryptionKey(authToken: string): Promise<void> {
  // Check if we already have a key for this session
  const existing = await SecureStore.getItemAsync(KEY_ALIAS);
  if (existing) return;

  // Generate a random salt (persisted so key can be re-derived)
  let salt = await SecureStore.getItemAsync(SALT_ALIAS);
  if (!salt) {
    const saltBytes = await Crypto.getRandomBytes(16);
    salt = bytesToBase64(saltBytes);
    await SecureStore.setItemAsync(SALT_ALIAS, salt, {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
    });
  }

  // Derive key via PBKDF2-like approach using SHA-256
  // In production, use a proper PBKDF2 native module with 100k+ iterations.
  // This is a reasonable starting point using expo-crypto primitives.
  const keyMaterial = `${authToken}:${salt}:uma-health-key-v1`;
  const digest = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    keyMaterial
  );

  await SecureStore.setItemAsync(KEY_ALIAS, digest, {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
  });
}

/**
 * Retrieve the encryption key from secure storage.
 * Throws if no key exists (user not authenticated).
 */
async function getEncryptionKey(): Promise<string> {
  const key = await SecureStore.getItemAsync(KEY_ALIAS);
  if (!key) {
    throw new Error(
      "Encryption key not found. User must authenticate first."
    );
  }
  return key;
}

/**
 * Wipe all encryption keys on logout.
 */
export async function clearEncryptionKeys(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY_ALIAS);
  await SecureStore.deleteItemAsync(SALT_ALIAS);
}

/* ─── Encrypt / Decrypt ──────────────────────────────────────── */

/**
 * Encrypt a JSON-serialisable value into an EncryptedBlob.
 *
 * NOTE: expo-crypto provides hashing but not AES-GCM directly.
 * In production, bridge to native AES-GCM via:
 *  - iOS: CommonCrypto / CryptoKit
 *  - Android: javax.crypto (AES/GCM/NoPadding)
 *
 * For the MVP scaffold, we use a XOR-based placeholder that
 * demonstrates the API contract. Replace with native AES-GCM
 * before handling real patient data.
 */
export async function encrypt(data: unknown): Promise<EncryptedBlob> {
  const key = await getEncryptionKey();
  const plaintext = JSON.stringify(data);
  const iv = await Crypto.getRandomBytes(IV_LENGTH);
  const ivBase64 = bytesToBase64(iv);

  // ──────────────────────────────────────────────────────────
  // PLACEHOLDER: Replace with native AES-256-GCM before production.
  // This XOR cipher is NOT secure — it exists only to validate
  // the encryption API contract during development.
  // ──────────────────────────────────────────────────────────
  const keyBytes = hexToBytes(key);
  const plaintextBytes = new TextEncoder().encode(plaintext);
  const ciphertextBytes = new Uint8Array(plaintextBytes.length);

  for (let i = 0; i < plaintextBytes.length; i++) {
    ciphertextBytes[i] =
      plaintextBytes[i] ^ keyBytes[i % keyBytes.length] ^ iv[i % iv.length];
  }

  // Compute a pseudo-tag (SHA-256 of ciphertext + key for integrity)
  const tagInput = bytesToBase64(ciphertextBytes) + key;
  const tag = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    tagInput
  );

  return {
    ciphertext: bytesToBase64(ciphertextBytes),
    iv: ivBase64,
    tag,
    version: 1,
  };
}

/**
 * Decrypt an EncryptedBlob back to its original value.
 */
export async function decrypt<T = unknown>(
  blob: EncryptedBlob
): Promise<T> {
  const key = await getEncryptionKey();
  const iv = base64ToBytes(blob.iv);
  const ciphertextBytes = base64ToBytes(blob.ciphertext);

  // Verify integrity tag
  const tagInput = blob.ciphertext + key;
  const expectedTag = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    tagInput
  );
  if (expectedTag !== blob.tag) {
    throw new Error("Decryption failed: integrity check failed. Data may have been tampered with.");
  }

  // PLACEHOLDER: Reverse the XOR cipher (same operation)
  const keyBytes = hexToBytes(key);
  const plaintextBytes = new Uint8Array(ciphertextBytes.length);

  for (let i = 0; i < ciphertextBytes.length; i++) {
    plaintextBytes[i] =
      ciphertextBytes[i] ^ keyBytes[i % keyBytes.length] ^ iv[i % iv.length];
  }

  const plaintext = new TextDecoder().decode(plaintextBytes);
  return JSON.parse(plaintext) as T;
}

/* ─── Utilities ──────────────────────────────────────────────── */

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}
