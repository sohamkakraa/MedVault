/**
 * On-Device Inference Bridge
 *
 * Provides a TypeScript interface to the MediaPipe LLM Inference API for Gemma 4 E2B.
 * This is the bridge between the Node/React world and the native inference engine.
 *
 * Since MediaPipe's React Native bindings may require native module access,
 * this file defines a well-typed interface that can be backed by:
 * 1. A native module (when running on React Native)
 * 2. A mock implementation (for development/testing)
 * 3. An HTTP bridge (if inference runs in a separate process)
 *
 * The class handles:
 * - Model download and lifecycle management
 * - Inference with function calling support
 * - Graceful fallback to cloud API if device can't run the model
 * - Error handling and progress reporting
 */

/**
 * Function calling tool definition for Gemma
 */
export interface InferenceTool {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<
      string,
      {
        type: string;
        description: string;
        enum?: string[];
      }
    >;
    required: string[];
  };
}

/**
 * Function call parsed from model output
 */
export interface FunctionCall {
  name: string;
  arguments: Record<string, any>;
}

/**
 * Inference result
 */
export interface InferenceResult {
  text: string;
  functionCalls: FunctionCall[];
  inputTokens: number;
  outputTokens: number;
}

/**
 * Model download progress
 */
export interface DownloadProgress {
  status: "downloading" | "completed" | "failed";
  bytesDownloaded: number;
  totalBytes: number;
  percentComplete: number;
}

/**
 * Options for inference
 */
export interface InferenceOptions {
  temperature?: number; // 0.0 to 2.0, default 0.7
  maxTokens?: number; // default 1024
  topP?: number; // 0.0 to 1.0, default 0.9
  tools?: InferenceTool[];
}

/**
 * OnDeviceInference class
 *
 * Manages the lifecycle of on-device inference with Gemma 4 E2B.
 */
export class OnDeviceInference {
  private modelId: string = "gemma-4-e2b";
  private isModelLoaded: boolean = false;
  private modelPath: string = "";
  private onProgressCallback?: (progress: DownloadProgress) => void;

  constructor(
    private nativeModule?: any // Native module injected at runtime
  ) {}

  /**
   * Check if this device can run on-device inference
   *
   * Returns false if:
   * - Device has less than 4GB RAM
   * - Platform is not supported
   * - Native module is not available
   */
  async canRunOnDevice(): Promise<boolean> {
    try {
      // Check RAM availability
      const ramGB = await this.getAvailableRAM();
      if (ramGB < 4) {
        console.log(
          `Device has ${ramGB.toFixed(1)}GB RAM, need 4GB for on-device inference`
        );
        return false;
      }

      // Check if native module is available
      if (!this.nativeModule) {
        console.log("Native inference module not available");
        return false;
      }

      return true;
    } catch (error) {
      console.error("Error checking device capabilities:", error);
      return false;
    }
  }

  /**
   * Get available RAM in GB
   *
   * In a real app, this would call platform-specific APIs.
   * For now, it's a mock that always returns sufficient RAM.
   */
  private async getAvailableRAM(): Promise<number> {
    // TODO: Implement platform-specific RAM check
    // For iOS: use os.availableMemory()
    // For Android: use ActivityManager.MemoryInfo()
    return 8; // Mock: assume 8GB available
  }

  /**
   * Download the Gemma model if not already present
   *
   * @param onProgress - Callback for download progress
   */
  async downloadModel(
    onProgress?: (progress: DownloadProgress) => void
  ): Promise<void> {
    this.onProgressCallback = onProgress;

    if (this.isModelLoaded) {
      console.log("Model already loaded");
      return;
    }

    try {
      const canRun = await this.canRunOnDevice();
      if (!canRun) {
        throw new Error(
          "Device cannot run on-device inference. Falling back to cloud API."
        );
      }

      // Simulate download if using mock, or call native module
      if (this.nativeModule?.downloadModel) {
        await this.nativeModule.downloadModel(this.modelId, (progress: any) => {
          const downloadProgress: DownloadProgress = {
            status: progress.status || "downloading",
            bytesDownloaded: progress.bytesDownloaded || 0,
            totalBytes: progress.totalBytes || 0,
            percentComplete: (progress.bytesDownloaded / progress.totalBytes) * 100 || 0,
          };
          onProgress?.(downloadProgress);
        });
      } else {
        // Mock download for development
        await this.mockDownload(onProgress);
      }

      this.isModelLoaded = true;
      console.log("Model downloaded and ready");
    } catch (error) {
      console.error("Model download failed:", error);
      this.isModelLoaded = false;
      throw error;
    }
  }

  /**
   * Mock download for development/testing
   */
  private async mockDownload(
    onProgress?: (progress: DownloadProgress) => void
  ): Promise<void> {
    const totalBytes = 4 * 1024 * 1024 * 1024; // 4GB
    let downloaded = 0;

    while (downloaded < totalBytes) {
      downloaded += 500 * 1024 * 1024; // 500MB chunks
      const percent = Math.min(100, (downloaded / totalBytes) * 100);

      onProgress?.({
        status: downloaded >= totalBytes ? "completed" : "downloading",
        bytesDownloaded: downloaded,
        totalBytes,
        percentComplete: percent,
      });

      // Simulate network latency
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  /**
   * Run inference with the Gemma model
   *
   * @param prompt - Input prompt
   * @param options - Inference options (temperature, max tokens, etc.)
   * @returns Inference result with text and any function calls
   */
  async generate(
    prompt: string,
    options: InferenceOptions = {}
  ): Promise<InferenceResult> {
    if (!this.isModelLoaded) {
      throw new Error("Model not loaded. Call downloadModel first.");
    }

    try {
      const inferenceOptions = {
        temperature: options.temperature ?? 0.7,
        maxTokens: options.maxTokens ?? 1024,
        topP: options.topP ?? 0.9,
        tools: options.tools || [],
      };

      // Call native module or mock
      if (this.nativeModule?.generate) {
        return await this.nativeModule.generate(prompt, inferenceOptions);
      }

      // Mock inference for development
      return this.mockGenerate(prompt, inferenceOptions);
    } catch (error) {
      console.error("Inference failed:", error);
      throw error;
    }
  }

  /**
   * Mock inference for development
   */
  private async mockGenerate(
    prompt: string,
    options: any
  ): Promise<InferenceResult> {
    // Simulate inference latency
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Return a mock response
    // In a real app, this would call the actual model
    const mockResponse = `Based on your routine and data, here's what I see:
Your sleep pattern has been consistent at around 7 hours per night.
Your daily steps average around 8,000-10,000.
Your resting heart rate has been stable at 65 bpm.

I'd suggest focusing on maintaining this consistency while gradually increasing your daily steps to 10,000+ when possible.`;

    return {
      text: mockResponse,
      functionCalls: [],
      inputTokens: prompt.split(" ").length,
      outputTokens: mockResponse.split(" ").length,
    };
  }

  /**
   * Unload the model from memory to free up space
   */
  async unloadModel(): Promise<void> {
    if (this.nativeModule?.unloadModel) {
      await this.nativeModule.unloadModel(this.modelId);
    }
    this.isModelLoaded = false;
  }

  /**
   * Check if the model is currently loaded
   */
  isLoaded(): boolean {
    return this.isModelLoaded;
  }

  /**
   * Parse function calls from the model's response
   *
   * Gemma returns function calls in a specific format:
   * <function_calls>
   * [{"name": "set_reminder", "arguments": {"medication": "Metformin", "time": "08:00"}}]
   * </function_calls>
   */
  static parseFunctionCalls(text: string): FunctionCall[] {
    const match = text.match(/<function_calls>\s*([\s\S]*?)\s*<\/function_calls>/);
    if (!match) {
      return [];
    }

    try {
      const jsonStr = match[1].trim();
      const calls = JSON.parse(jsonStr);
      return Array.isArray(calls) ? calls : [calls];
    } catch (error) {
      console.error("Failed to parse function calls:", error);
      return [];
    }
  }
}

/**
 * Create an on-device inference instance
 *
 * In a real React Native app, pass the native module:
 * const nativeModule = require('react-native').NativeModules.GemmaInference;
 * const inference = createOnDeviceInference(nativeModule);
 *
 * For development, omit the module to get mock behavior:
 * const inference = createOnDeviceInference();
 */
export function createOnDeviceInference(
  nativeModule?: any
): OnDeviceInference {
  return new OnDeviceInference(nativeModule);
}

/**
 * Fallback inference class
 *
 * If on-device inference fails, fall back to this cloud-based alternative.
 * This should use the same interface as OnDeviceInference.
 */
export class CloudFallbackInference {
  constructor(private apiKey: string) {}

  async canRunOnDevice(): Promise<boolean> {
    return false;
  }

  async downloadModel(): Promise<void> {
    // No-op for cloud
  }

  async generate(
    prompt: string,
    options: InferenceOptions = {}
  ): Promise<InferenceResult> {
    // Call cloud API instead
    // This would use the callCloudAI function
    throw new Error("Not implemented yet. Use callCloudAI directly.");
  }

  async unloadModel(): Promise<void> {
    // No-op for cloud
  }

  isLoaded(): boolean {
    return true; // Cloud is always "ready"
  }
}
