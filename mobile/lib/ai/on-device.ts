/**
 * On-Device AI Utility
 *
 * High-level interface to MediaPipe LLM Inference for Gemma 4 E2B.
 * Manages model lifecycle, handles function calling, and provides graceful
 * fallback to cloud API if the device can't run the model.
 *
 * This wrapper ensures all on-device agents use consistent error handling
 * and resource management.
 */

import {
  OnDeviceInference,
  InferenceOptions,
  InferenceResult,
} from "../agents/routine-analyzer/inference";

/**
 * On-device AI configuration
 */
export interface OnDeviceAIConfig {
  modelId?: string; // Default: "gemma-4-e2b"
  minRAMGB?: number; // Minimum RAM required (default: 4)
  maxTokens?: number; // Default: 512
  temperature?: number; // Default: 0.7
  topP?: number; // Default: 0.9
}

/**
 * Global inference instance
 *
 * Shared across all on-device agents to manage model lifecycle efficiently.
 */
let globalInference: OnDeviceInference | null = null;
let isInitializing = false;
let initError: Error | null = null;

/**
 * Initialize global on-device inference instance
 *
 * Should be called once at app startup or when needed.
 * Subsequent calls are no-ops.
 *
 * @param nativeModule - Native module for MediaPipe inference
 * @param onProgress - Optional callback for download progress
 */
export async function initializeOnDeviceAI(
  nativeModule?: any,
  onProgress?: (progress: any) => void
): Promise<void> {
  if (globalInference) {
    return; // Already initialized
  }

  if (isInitializing) {
    // Wait for initialization to complete
    let attempts = 0;
    while (isInitializing && attempts < 100) {
      await sleep(100);
      attempts++;
    }
    if (initError) {
      throw initError;
    }
    return;
  }

  isInitializing = true;

  try {
    globalInference = new OnDeviceInference(nativeModule);

    // Check device capabilities
    const canRun = await globalInference.canRunOnDevice();
    if (!canRun) {
      initError = new Error(
        "Device does not have sufficient resources for on-device AI"
      );
      throw initError;
    }

    // Download model
    await globalInference.downloadModel(onProgress);
  } catch (error) {
    isInitializing = false;
    initError = error instanceof Error ? error : new Error(String(error));
    globalInference = null;
    throw initError;
  }

  isInitializing = false;
}

/**
 * Check if on-device AI is available and ready
 */
export function isOnDeviceAIAvailable(): boolean {
  return globalInference !== null && globalInference.isLoaded();
}

/**
 * Generate text using on-device Gemma
 *
 * Simple wrapper around the inference instance.
 * If the model fails or is not available, returns null.
 *
 * @param prompt - Input prompt
 * @param options - Inference options
 * @returns Generated text or null if unavailable
 */
export async function generateOnDevice(
  prompt: string,
  options: InferenceOptions = {}
): Promise<string | null> {
  if (!globalInference || !globalInference.isLoaded()) {
    return null;
  }

  try {
    const result = await globalInference.generate(prompt, options);
    return result.text;
  } catch (error) {
    console.error("On-device inference failed:", error);
    return null;
  }
}

/**
 * Check device memory
 *
 * Returns available RAM in GB.
 * Used to determine if on-device inference is viable.
 *
 * In a real app, this would call:
 * - iOS: OS.availableMemory()
 * - Android: ActivityManager.MemoryInfo()
 *
 * For now, returns a mock value.
 */
export async function getDeviceMemoryGB(): Promise<number> {
  // TODO: Implement platform-specific memory check
  return 8; // Mock: assume 8GB available
}

/**
 * Get inference statistics
 *
 * Useful for debugging and understanding resource usage.
 */
export function getInferenceStats(): {
  isAvailable: boolean;
  isInitializing: boolean;
  error: Error | null;
} {
  return {
    isAvailable: isOnDeviceAIAvailable(),
    isInitializing,
    error: initError,
  };
}

/**
 * Unload the model to free memory
 *
 * Call this when the app goes to the background or to free up space.
 */
export async function unloadOnDeviceModel(): Promise<void> {
  if (globalInference) {
    await globalInference.unloadModel();
  }
}

/**
 * Reset the on-device AI system
 *
 * Useful for testing or if something goes wrong.
 */
export async function resetOnDeviceAI(): Promise<void> {
  await unloadOnDeviceModel();
  globalInference = null;
  isInitializing = false;
  initError = null;
}

/**
 * Get model name and version
 */
export function getModelInfo(): {
  id: string;
  name: string;
  provider: string;
} {
  return {
    id: "gemma-4-e2b",
    name: "Gemma 4 E2B",
    provider: "Google MediaPipe",
  };
}

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fallback to cloud when on-device is not available
 *
 * Agents should use this pattern:
 * ```typescript
 * const onDevice = await generateOnDevice(prompt);
 * if (onDevice === null) {
 *   return await callCloudAI(request);
 * }
 * return onDevice;
 * ```
 */
export async function getInferenceProvider(): Promise<"on-device" | "cloud"> {
  const canRunOnDevice = await (async () => {
    if (!globalInference) {
      try {
        await initializeOnDeviceAI();
        return globalInference?.isLoaded() ?? false;
      } catch {
        return false;
      }
    }
    return globalInference.isLoaded();
  })();

  return canRunOnDevice ? "on-device" : "cloud";
}

/**
 * Estimate model download size
 *
 * Gemma 4 E2B is approximately 4-6 GB depending on quantization.
 */
export function getModelDownloadEstimate(): {
  sizeMB: number;
  estimatedTimeMinutes: number; // At 10 Mbps average
} {
  return {
    sizeMB: 4096, // 4 GB
    estimatedTimeMinutes: 54, // ~10 Mbps average download speed
  };
}

/**
 * Check if sufficient storage is available
 *
 * @param requiredMB - Space required in MB (default: 5000 for safety margin)
 * @returns true if sufficient space is available
 */
export async function hasStorageSpace(requiredMB: number = 5000): Promise<boolean> {
  // TODO: Implement platform-specific storage check
  // For iOS: FileManager.attributesOfFileSystemForPath()
  // For Android: StatFs.availableBytes / 1024 / 1024
  return true; // Mock: assume space available
}

/**
 * Prime the model for faster responses
 *
 * Run a warm-up inference to load the model into memory.
 * Call after initialization to reduce first-response latency.
 *
 * @returns Time taken for warm-up in milliseconds
 */
export async function warmupModel(): Promise<number> {
  if (!globalInference || !globalInference.isLoaded()) {
    return 0;
  }

  const start = Date.now();

  try {
    const warmupPrompt = "Hello. Respond with a single word.";
    await globalInference.generate(warmupPrompt, {
      maxTokens: 10,
      temperature: 0.5,
    });
  } catch {
    // Warm-up failure is not critical
  }

  return Date.now() - start;
}

export type { InferenceOptions, InferenceResult };
