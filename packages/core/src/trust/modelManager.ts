/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { TrustModelConfig, TrustModelManager } from './types.js';
import { createHash } from 'crypto';
import { createReadStream } from 'fs';
import { ModelDownloader } from './modelDownloader.js';
import { ModelIntegrityChecker } from './modelIntegrity.js';

export class TrustModelManagerImpl implements TrustModelManager {
  private modelsDir: string;
  private configFile: string;
  private availableModels: TrustModelConfig[] = [];
  private currentModel: TrustModelConfig | null = null;
  private integrityChecker: ModelIntegrityChecker;

  constructor(modelsDir?: string) {
    this.modelsDir =
      modelsDir || path.join(os.homedir(), '.trustcli', 'models');
    this.configFile = path.join(path.dirname(this.modelsDir), 'models.json');
    this.integrityChecker = new ModelIntegrityChecker(
      path.dirname(this.modelsDir),
    );
    this.initializeDefaultModels();
  }

  private initializeDefaultModels(): void {
    // Default model configurations based on the implementation plan
    this.availableModels = [
      {
        name: 'phi-3.5-mini-instruct',
        path: 'Phi-3.5-mini-instruct-Q4_K_M.gguf',
        type: 'phi',
        quantization: 'Q4_K_M',
        contextSize: 4096,
        ramRequirement: '3GB',
        description: 'Fast coding assistance model - 3.8B parameters',
        parameters: '3.8B',
        trustScore: 9.5,
        downloadUrl:
          'https://huggingface.co/bartowski/Phi-3.5-mini-instruct-GGUF/blob/main/Phi-3.5-mini-instruct-Q4_K_M.gguf',
        verificationHash: 'sha256:pending', // Will be computed after first download
        expectedSize: 2393232672, // ~2.23GB (actual downloaded size)
      },
      {
        name: 'phi-3.5-mini-uncensored',
        path: 'Phi-3.5-mini-instruct_Uncensored-Q4_K_M.gguf',
        type: 'phi',
        quantization: 'Q4_K_M',
        contextSize: 4096,
        ramRequirement: '3GB',
        description:
          'Uncensored coding model for risk analysis & auditing - 3.8B parameters',
        parameters: '3.8B',
        trustScore: 9.3,
        downloadUrl:
          'https://huggingface.co/bartowski/Phi-3.5-mini-instruct_Uncensored-GGUF/blob/main/Phi-3.5-mini-instruct_Uncensored-Q4_K_M.gguf',
        verificationHash: 'sha256:pending',
        expectedSize: 2390000000, // ~2.4GB
      },
      {
        name: 'llama-3.2-3b-instruct',
        path: 'Llama-3.2-3B-Instruct-Q4_K_M.gguf',
        type: 'llama',
        quantization: 'Q4_K_M',
        contextSize: 4096,
        ramRequirement: '4GB',
        description: 'Balanced performance model - 3B parameters',
        parameters: '3B',
        trustScore: 9.2,
        downloadUrl:
          'https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/blob/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf',
        verificationHash: 'sha256:pending',
        expectedSize: 2019377696, // ~1.88GB (actual downloaded size)
      },
      {
        name: 'qwen2.5-1.5b-instruct',
        path: 'qwen2.5-1.5b-instruct-q8_0.gguf',
        type: 'qwen',
        quantization: 'Q8_0',
        contextSize: 4096,
        ramRequirement: '2GB',
        description: 'Lightweight model for quick questions - 1.5B parameters',
        parameters: '1.5B',
        trustScore: 8.8,
        downloadUrl:
          'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-gguf/blob/main/qwen2.5-1.5b-instruct-q8_0.gguf',
        verificationHash: 'sha256:pending',
        expectedSize: 1894532128, // ~1.76GB (actual downloaded size)
      },
      {
        name: 'deepseek-r1-distill-7b',
        path: 'DeepSeek-R1-Distill-Qwen-7B-Q4_K_M.gguf',
        type: 'deepseek',
        quantization: 'Q4_K_M',
        contextSize: 4096,
        ramRequirement: '6GB',
        description:
          'Advanced reasoning model for complex analysis - 7.6B parameters',
        parameters: '7.6B',
        trustScore: 9.6,
        downloadUrl:
          'https://huggingface.co/bartowski/DeepSeek-R1-Distill-Qwen-7B-GGUF/blob/main/DeepSeek-R1-Distill-Qwen-7B-Q4_K_M.gguf',
        verificationHash: 'sha256:pending',
        expectedSize: 4450000000, // ~4.5GB
      },
      {
        name: 'llama-3.1-8b-instruct',
        path: 'Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf',
        type: 'llama',
        quantization: 'Q4_K_M',
        contextSize: 4096,
        ramRequirement: '8GB',
        description: 'High-quality responses - 8B parameters',
        parameters: '8B',
        trustScore: 9.7,
        downloadUrl:
          'https://huggingface.co/bartowski/Meta-Llama-3.1-8B-Instruct-GGUF/blob/main/Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf',
        verificationHash: 'sha256:pending',
        expectedSize: 4920000000, // ~4.9GB
      },
      {
        name: 'mistral-7b-instruct',
        path: 'Mistral-7B-Instruct-v0.3-Q4_K_M.gguf',
        type: 'mistral',
        quantization: 'Q4_K_M',
        contextSize: 8192,
        ramRequirement: '6GB',
        description: 'Efficient multilingual model - 7B parameters',
        parameters: '7B',
        trustScore: 9.1,
        downloadUrl:
          'https://huggingface.co/bartowski/Mistral-7B-Instruct-v0.3-GGUF/blob/main/Mistral-7B-Instruct-v0.3-Q4_K_M.gguf',
        verificationHash: 'sha256:pending',
        expectedSize: 4370000000, // ~4.37GB
      },
      {
        name: 'mistral-nemo-12b-instruct',
        path: 'Mistral-Nemo-Instruct-2407-Q4_K_M.gguf',
        type: 'mistral',
        quantization: 'Q4_K_M',
        contextSize: 128000,
        ramRequirement: '10GB',
        description: 'Large context multilingual model - 12B parameters',
        parameters: '12B',
        trustScore: 9.4,
        downloadUrl:
          'https://huggingface.co/bartowski/Mistral-Nemo-Instruct-2407-GGUF/blob/main/Mistral-Nemo-Instruct-2407-Q4_K_M.gguf',
        verificationHash: 'sha256:pending',
        expectedSize: 6900000000, // ~6.9GB
      },
      {
        name: 'gemma-2-2b-instruct',
        path: 'gemma-2-2b-it-Q4_K_M.gguf',
        type: 'gemma',
        quantization: 'Q4_K_M',
        contextSize: 8192,
        ramRequirement: '3GB',
        description: 'Compact Google model - 2.6B parameters',
        parameters: '2.6B',
        trustScore: 8.9,
        downloadUrl:
          'https://huggingface.co/bartowski/gemma-2-2b-it-GGUF/blob/main/gemma-2-2b-it-Q4_K_M.gguf',
        verificationHash: 'sha256:pending',
        expectedSize: 1640000000, // ~1.64GB
      },
      {
        name: 'gemma-2-9b-instruct',
        path: 'gemma-2-9b-it-Q4_K_M.gguf',
        type: 'gemma',
        quantization: 'Q4_K_M',
        contextSize: 8192,
        ramRequirement: '8GB',
        description: 'Advanced Google model - 9B parameters',
        parameters: '9B',
        trustScore: 9.3,
        downloadUrl:
          'https://huggingface.co/bartowski/gemma-2-9b-it-GGUF/blob/main/gemma-2-9b-it-Q4_K_M.gguf',
        verificationHash: 'sha256:pending',
        expectedSize: 5400000000, // ~5.4GB
      },
    ];
  }

  async initialize(): Promise<void> {
    try {
      // Ensure models directory exists
      await fs.mkdir(this.modelsDir, { recursive: true });

      // Initialize integrity checker
      await this.integrityChecker.initialize();

      // Load existing config if it exists
      try {
        const configData = await fs.readFile(this.configFile, 'utf-8');
        const savedConfig = JSON.parse(configData);
        if (savedConfig.models) {
          this.availableModels = savedConfig.models;
        }
        if (savedConfig.currentModel) {
          this.currentModel = savedConfig.currentModel;
        }
      } catch (_error) {
        // Config file doesn't exist, use defaults
        await this.saveConfig();
      }

      // Update model paths to be absolute
      this.availableModels = this.availableModels.map((model) => ({
        ...model,
        path: path.isAbsolute(model.path)
          ? model.path
          : path.join(this.modelsDir, model.path),
      }));
    } catch (error) {
      console.error('Failed to initialize model manager:', error);
      throw error;
    }
  }

  listAvailableModels(): TrustModelConfig[] {
    return [...this.availableModels];
  }

  async downloadModel(modelId: string): Promise<void> {
    const model = this.availableModels.find((m) => m.name === modelId);
    if (!model) {
      throw new Error(`Model ${modelId} not found in available models`);
    }

    if (!model.downloadUrl) {
      throw new Error(`Download URL not available for model ${modelId}`);
    }

    // Load HF token for authentication
    const hfToken = await this.getHuggingFaceToken();

    const downloader = new ModelDownloader(this.modelsDir, hfToken);

    try {
      console.log(`🚀 Starting download of ${modelId}...`);

      const finalPath = await downloader.downloadModel(model, (progress) => {
        const { percentage, speed, eta, downloaded, total } = progress;

        // Clear previous line and show progress
        process.stdout.write('\r\x1b[K');
        process.stdout.write(
          `📥 ${percentage.toFixed(1)}% | ` +
            `${ModelDownloader.formatSpeed(speed)} | ` +
            `ETA: ${ModelDownloader.formatETA(eta)} | ` +
            `${this.formatBytes(downloaded)}/${this.formatBytes(total)}`,
        );
      });

      // Clear progress line
      process.stdout.write('\r\x1b[K');
      console.log(`✅ Model ${modelId} downloaded successfully`);
      console.log(`📁 Location: ${finalPath}`);

      // Verify the downloaded model
      console.log(`🔍 Verifying model integrity...`);
      const verificationResult = await this.integrityChecker.verifyModel(
        finalPath,
        modelId,
        model.verificationHash,
        (status, progress) => {
          process.stdout.write('\r\x1b[K');
          process.stdout.write(
            `🔍 ${status}${progress ? ` (${Math.round(progress)}%)` : ''}`,
          );
        },
      );

      process.stdout.write('\r\x1b[K');

      if (!verificationResult.valid) {
        // Delete the corrupted download
        await fs.unlink(finalPath);
        throw new Error(
          `Model verification failed: ${verificationResult.reason}`,
        );
      }

      console.log(`✅ Model integrity verified`);

      // Add to trusted registry
      await this.integrityChecker.addTrustedModel(
        modelId,
        finalPath,
        model.downloadUrl!,
      );

      // Update model path to point to the downloaded file
      const modelIndex = this.availableModels.findIndex(
        (m) => m.name === modelId,
      );
      if (modelIndex !== -1) {
        this.availableModels[modelIndex].path = finalPath;
        // Update hash if it was computed
        if (verificationResult.details?.actualHash) {
          this.availableModels[modelIndex].verificationHash =
            verificationResult.details.actualHash;
        }
        await this.saveConfig();
      }
    } catch (error) {
      console.error(`\n❌ Failed to download model ${modelId}:`, error);
      throw error;
    }
  }

  async verifyModel(modelPath: string): Promise<boolean> {
    try {
      const stats = await fs.stat(modelPath);
      if (!stats.isFile()) {
        return false;
      }

      // Basic verification - check if file exists and has some content
      return stats.size > 0;
    } catch (_error) {
      // Silently return false for missing files - this is expected for undownloaded models
      return false;
    }
  }

  async computeModelHash(modelPath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = createHash('sha256');
      const stream = createReadStream(modelPath);

      stream.on('data', (data) => hash.update(data));
      stream.on('end', () => resolve(`sha256:${hash.digest('hex')}`));
      stream.on('error', reject);
    });
  }

  /**
   * Check if a model is a HuggingFace model based on its definition
   */
  isHuggingFaceModel(modelName: string): boolean {
    const model = this.availableModels.find((m) => m.name === modelName);
    return model?.downloadUrl?.includes('huggingface.co') ?? false;
  }

  async verifyModelIntegrity(
    modelName: string,
    showProgress: boolean = true,
  ): Promise<{ valid: boolean; message: string }> {
    const model = this.availableModels.find((m) => m.name === modelName);
    if (!model) {
      return { valid: false, message: `Model ${modelName} not found` };
    }

    try {
      // Use the new integrity checker for comprehensive verification
      const result = await this.integrityChecker.verifyModel(
        model.path,
        modelName,
        model.verificationHash,
        showProgress
          ? (status, progress) => {
              process.stdout.write('\r\x1b[K');
              process.stdout.write(
                `🔍 ${status}${progress ? ` (${Math.round(progress)}%)` : ''}`,
              );
            }
          : undefined,
      );

      if (showProgress) {
        process.stdout.write('\r\x1b[K');
      }

      // Update model hash if it was computed for the first time
      if (
        result.valid &&
        result.details?.actualHash &&
        (!model.verificationHash || model.verificationHash === 'sha256:pending')
      ) {
        const modelIndex = this.availableModels.findIndex(
          (m) => m.name === modelName,
        );
        if (modelIndex !== -1) {
          this.availableModels[modelIndex].verificationHash =
            result.details.actualHash;
          await this.saveConfig();
        }
      }

      return {
        valid: result.valid,
        message:
          result.reason +
          (result.details?.timeTaken
            ? ` (took ${(result.details.timeTaken / 1000).toFixed(1)}s)`
            : ''),
      };
    } catch (error) {
      return {
        valid: false,
        message: `Error verifying model: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Verify all downloaded models
   */
  async verifyAllModels(): Promise<
    Map<string, { valid: boolean; message: string }>
  > {
    console.log('🔍 Verifying all models...\n');

    const results = new Map<string, { valid: boolean; message: string }>();

    for (const model of this.availableModels) {
      const exists = await this.verifyModel(model.path);
      if (exists) {
        console.log(`Checking ${model.name}...`);
        const result = await this.verifyModelIntegrity(model.name, false);
        results.set(model.name, result);
        console.log(`  ${result.valid ? '✅' : '❌'} ${result.message}\n`);
      } else {
        results.set(model.name, {
          valid: false,
          message: 'Model not downloaded',
        });
      }
    }

    return results;
  }

  /**
   * Generate an integrity report for a model
   */
  async generateModelReport(modelName: string): Promise<string | null> {
    const model = this.availableModels.find((m) => m.name === modelName);
    if (!model) {
      return null;
    }

    try {
      const _report = await this.integrityChecker.generateIntegrityReport(
        model.path,
        modelName,
      );
      const manifestPath = await this.integrityChecker.createModelManifest(
        model.path,
        modelName,
        {
          type: model.type,
          quantization: model.quantization,
          parameters: model.parameters,
          contextSize: model.contextSize,
          trustScore: model.trustScore,
        },
      );

      console.log(`📄 Integrity report saved to: ${manifestPath}`);
      return manifestPath;
    } catch (error) {
      console.error(`Failed to generate report for ${modelName}:`, error);
      return null;
    }
  }

  async switchModel(modelName: string): Promise<void> {
    const model = this.availableModels.find((m) => m.name === modelName);
    if (!model) {
      throw new Error(`Model ${modelName} not found`);
    }

    // Verify model exists
    const isValid = await this.verifyModel(model.path);
    if (!isValid) {
      throw new Error(
        `Model ${modelName} at ${model.path} is not valid or doesn't exist`,
      );
    }

    this.currentModel = model;
    await this.saveConfig();
    console.log(`Switched to model: ${modelName}`);
  }

  getCurrentModel(): TrustModelConfig | null {
    return this.currentModel;
  }

  async getTrustRating(modelId: string): Promise<number> {
    const model = this.availableModels.find((m) => m.name === modelId);
    return model?.trustScore || 0;
  }

  getRecommendedModel(
    task: string,
    ramLimit?: number,
  ): TrustModelConfig | null {
    const ramLimitGB = ramLimit || this.getSystemRAM();

    // Filter models by RAM requirement
    const suitableModels = this.availableModels.filter((model) => {
      const modelRAM = parseInt(model.ramRequirement.replace('GB', ''), 10);
      return modelRAM <= ramLimitGB;
    });

    if (suitableModels.length === 0) {
      return null;
    }

    // Task-specific recommendations with format-aware logic
    switch (task.toLowerCase()) {
      case 'coding':
      case 'code':
      case 'programming':
        // Prefer Phi models for coding, then DeepSeek for complex reasoning
        return (
          suitableModels.find((m) => m.type === 'phi') ||
          suitableModels.find((m) => m.type === 'deepseek') ||
          suitableModels.find((m) => m.name.includes('llama-3.1')) ||
          suitableModels[0]
        );

      case 'quick':
      case 'simple':
      case 'lightweight':
        // Prefer smallest models: Qwen -> Gemma -> Phi
        return (
          suitableModels.find((m) => m.type === 'qwen') ||
          suitableModels.find(
            (m) => m.type === 'gemma' && m.parameters === '2.6B',
          ) ||
          suitableModels.reduce((smallest, current) =>
            parseInt(current.ramRequirement, 10) <
            parseInt(smallest.ramRequirement, 10)
              ? current
              : smallest,
          )
        );

      case 'multilingual':
      case 'translation':
      case 'international':
        // Prefer Mistral models for multilingual tasks
        return (
          suitableModels.find((m) => m.type === 'mistral') ||
          suitableModels.find((m) => m.type === 'gemma') ||
          suitableModels[0]
        );

      case 'reasoning':
      case 'analysis':
      case 'research':
        // Prefer DeepSeek for advanced reasoning, then larger models
        return (
          suitableModels.find((m) => m.type === 'deepseek') ||
          suitableModels.find((m) => m.name.includes('llama-3.1-8b')) ||
          suitableModels.find((m) => m.name.includes('gemma-2-9b')) ||
          suitableModels.reduce((best, current) =>
            (current.trustScore || 0) > (best.trustScore || 0) ? current : best,
          )
        );

      case 'context':
      case 'longform':
      case 'document':
        // Prefer models with larger context windows
        return (
          suitableModels.find((m) => m.name.includes('mistral-nemo')) || // 128k context
          suitableModels.find((m) => m.contextSize >= 8192) ||
          suitableModels[0]
        );

      case 'quality':
      case 'complex':
      case 'detailed':
        // Prefer highest quality models within RAM limit
        return suitableModels.reduce((best, current) =>
          (current.trustScore || 0) > (best.trustScore || 0) ? current : best,
        );

      case 'general':
      case 'default':
      default:
        // Default to balanced model: Llama -> Phi -> others
        return (
          suitableModels.find((m) => m.name.includes('llama-3.2')) ||
          suitableModels.find((m) => m.type === 'phi') ||
          suitableModels.find((m) => m.type === 'gemma') ||
          suitableModels[0]
        );
    }
  }

  async deleteModel(modelName: string): Promise<void> {
    const model = this.availableModels.find((m) => m.name === modelName);
    if (!model) {
      throw new Error(`Model ${modelName} not found`);
    }

    try {
      await fs.unlink(model.path);
      console.log(`Deleted model ${modelName} from ${model.path}`);
    } catch (error) {
      console.error(`Failed to delete model ${modelName}:`, error);
      throw error;
    }
  }

  private async saveConfig(): Promise<void> {
    const config = {
      models: this.availableModels,
      currentModel: this.currentModel,
      lastUpdated: new Date().toISOString(),
    };

    try {
      await fs.writeFile(this.configFile, JSON.stringify(config, null, 2));
    } catch (error) {
      console.error('Failed to save model config:', error);
    }
  }

  private getSystemRAM(): number {
    const totalMemory = os.totalmem();
    return Math.floor(totalMemory / (1024 * 1024 * 1024)); // Convert to GB
  }

  private formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }

  private async getHuggingFaceToken(): Promise<string | undefined> {
    try {
      const authConfigPath = path.join(os.homedir(), '.trustcli', 'auth.json');
      const content = await fs.readFile(authConfigPath, 'utf-8');
      const config = JSON.parse(content);
      return config.huggingfaceToken;
    } catch {
      return undefined;
    }
  }
}
