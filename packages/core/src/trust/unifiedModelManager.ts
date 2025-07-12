/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { TrustModelManagerImpl } from './modelManager.js';
import { OllamaClient } from './ollamaClient.js';
import { TrustConfiguration } from '../config/trustConfig.js';

/**
 * Unified model representation across all backends
 */
export interface UnifiedModel {
  name: string;
  backend: 'ollama' | 'huggingface' | 'cloud';
  type?: string;
  parameters?: string;
  contextSize?: number;
  ramRequirement?: string;
  description?: string;
  trustScore?: number;
  taskSuitability?: {
    coding?: number; // 0-10 score for coding tasks
    reasoning?: number; // 0-10 score for reasoning tasks
    general?: number; // 0-10 score for general tasks
    creative?: number; // 0-10 score for creative tasks
  };
  available: boolean;
  metadata?: {
    quantization?: string;
    downloadUrl?: string;
    expectedSize?: number;
    verificationHash?: string;
  };
}

/**
 * Hardware constraints for model filtering
 */
export interface HardwareConstraints {
  availableRAM?: number; // GB
  preferredSize?: 'small' | 'medium' | 'large';
  maxDownloadSize?: number; // bytes
}

/**
 * Task types for model selection
 */
export type TaskType = 'coding' | 'reasoning' | 'general' | 'creative';

/**
 * Unified model manager that consolidates models from all backends
 */
export class UnifiedModelManager {
  private trustConfig: TrustConfiguration;
  private trustModelManager: TrustModelManagerImpl;
  private ollamaClient: OllamaClient;
  private cachedModels: UnifiedModel[] = [];
  private lastCacheUpdate: number = 0;
  private cacheTimeout: number = 30000; // 30 seconds

  constructor(trustConfig?: TrustConfiguration) {
    this.trustConfig = trustConfig || new TrustConfiguration();
    this.trustModelManager = new TrustModelManagerImpl();
    this.ollamaClient = new OllamaClient();
  }

  /**
   * Initialize the unified model manager
   */
  async initialize(): Promise<void> {
    await this.trustConfig.initialize();
    await this.trustModelManager.initialize();
  }

  /**
   * List all models from both HuggingFace and Ollama backends
   * Implementation of architecture requirement 3.1
   */
  async listAllModels(forceRefresh = false): Promise<UnifiedModel[]> {
    const now = Date.now();

    // Return cached models if still valid
    if (
      !forceRefresh &&
      this.cachedModels.length > 0 &&
      now - this.lastCacheUpdate < this.cacheTimeout
    ) {
      return this.cachedModels;
    }

    const allModels: UnifiedModel[] = [];

    // Get HuggingFace models
    try {
      const hfModels = await this.discoverHuggingFaceModels();
      allModels.push(...hfModels);
    } catch (error) {
      console.warn('Could not load HuggingFace models:', error);
    }

    // Get Ollama models
    try {
      const ollamaModels = await this.discoverOllamaModels();
      allModels.push(...ollamaModels);
    } catch (error) {
      console.warn('Could not load Ollama models:', error);
    }

    // Cache the results
    this.cachedModels = allModels;
    this.lastCacheUpdate = now;

    return allModels;
  }

  /**
   * Discover and consolidate models from all configured backends
   * @deprecated Use listAllModels() instead
   */
  async discoverAllModels(forceRefresh = false): Promise<UnifiedModel[]> {
    return this.listAllModels(forceRefresh);
  }

  /**
   * Discover models from HuggingFace backend
   */
  private async discoverHuggingFaceModels(): Promise<UnifiedModel[]> {
    try {
      const models = this.trustModelManager.listAvailableModels();

      return models.map((model) => ({
        name: model.name,
        backend: 'huggingface' as const,
        type: model.type,
        parameters: model.parameters,
        contextSize: model.contextSize,
        ramRequirement: model.ramRequirement,
        description: model.description,
        trustScore: model.trustScore,
        taskSuitability: this.inferTaskSuitability(
          model.name,
          model.type,
          model.description,
        ),
        available: true, // Assume available if in the manager
        metadata: {
          quantization: model.quantization,
          downloadUrl: model.downloadUrl,
          expectedSize: model.expectedSize,
          verificationHash: model.verificationHash,
        },
      }));
    } catch (error) {
      console.error('Error discovering HuggingFace models:', error);
      return [];
    }
  }

  /**
   * Discover models from Ollama backend
   */
  private async discoverOllamaModels(): Promise<UnifiedModel[]> {
    try {
      const modelNames = await this.ollamaClient.listModels();

      return modelNames.map((name) => ({
        name,
        backend: 'ollama' as const,
        type: this.inferOllamaModelType(name),
        parameters: this.inferOllamaParameters(name),
        contextSize: this.inferOllamaContextSize(name),
        ramRequirement: this.inferOllamaRAMRequirement(name),
        description: `Ollama model: ${name}`,
        trustScore: 8.0, // Default trust score for Ollama models
        taskSuitability: this.inferTaskSuitability(
          name,
          this.inferOllamaModelType(name),
        ),
        available: true,
        metadata: {},
      }));
    } catch (error) {
      console.error('Error discovering Ollama models:', error);
      return [];
    }
  }

  /**
   * Discover models from Cloud backend (placeholder)
   */
  private async discoverCloudModels(): Promise<UnifiedModel[]> {
    // Placeholder for cloud model discovery
    // This would integrate with Google Cloud, OpenAI, Anthropic, etc.
    return [];
  }

  /**
   * Filter models based on task type and hardware constraints
   */
  filterModels(
    models: UnifiedModel[],
    taskType?: TaskType,
    hardwareConstraints?: HardwareConstraints,
  ): UnifiedModel[] {
    let filtered = [...models];

    // Filter by availability
    filtered = filtered.filter((model) => model.available);

    // Filter by task suitability
    if (taskType && taskType !== 'general') {
      filtered = filtered.filter((model) => {
        const suitability = model.taskSuitability?.[taskType] || 0;
        return suitability >= 6; // Minimum suitability threshold
      });
    }

    // Filter by hardware constraints
    if (hardwareConstraints) {
      if (hardwareConstraints.availableRAM) {
        filtered = filtered.filter((model) => {
          const ramReq = this.parseRAMRequirement(model.ramRequirement);
          return ramReq <= hardwareConstraints.availableRAM!;
        });
      }

      if (
        hardwareConstraints.maxDownloadSize &&
        hardwareConstraints.maxDownloadSize > 0
      ) {
        filtered = filtered.filter((model) => {
          const size = model.metadata?.expectedSize || 0;
          return size <= hardwareConstraints.maxDownloadSize!;
        });
      }
    }

    return filtered;
  }

  /**
   * Select the best model from a filtered list based on Trust Score and task suitability
   */
  selectBestModel(
    models: UnifiedModel[],
    taskType?: TaskType,
  ): UnifiedModel | null {
    if (models.length === 0) return null;

    // Sort by combined score: trust score + task suitability
    const scored = models.map((model) => {
      const trustScore = model.trustScore || 0;
      const taskScore =
        taskType && model.taskSuitability?.[taskType]
          ? model.taskSuitability[taskType] || 0
          : model.taskSuitability?.general || 0;

      return {
        model,
        combinedScore: trustScore * 0.6 + taskScore * 0.4, // Weight trust score higher
      };
    });

    scored.sort((a, b) => b.combinedScore - a.combinedScore);
    return scored[0].model;
  }

  /**
   * Get models grouped by backend
   */
  async getModelsByBackend(): Promise<Record<string, UnifiedModel[]>> {
    const allModels = await this.discoverAllModels();
    const grouped: Record<string, UnifiedModel[]> = {};

    for (const model of allModels) {
      if (!grouped[model.backend]) {
        grouped[model.backend] = [];
      }
      grouped[model.backend].push(model);
    }

    return grouped;
  }

  /**
   * Download a model, auto-determining the appropriate backend
   * Implementation of architecture requirement 3.3
   */
  async downloadModel(modelName: string): Promise<void> {
    const allModels = await this.listAllModels();
    const targetModel = allModels.find(m => m.name === modelName);

    if (!targetModel) {
      // If not found in current models, try to determine backend from model name patterns
      if (this.isOllamaModelName(modelName)) {
        console.log(`📥 Pulling model ${modelName} via Ollama...`);
        const success = await this.ollamaClient.pullModel(modelName, (progress) => {
          process.stdout.write(`\r${progress}`);
        });
        
        if (success) {
          console.log(`\n✅ Model ${modelName} downloaded successfully via Ollama`);
          this.clearCache(); // Refresh cache
        } else {
          throw new Error(`Failed to download ${modelName} via Ollama`);
        }
        return;
      } else {
        // Try HuggingFace
        const hfModels = this.trustModelManager.listAvailableModels();
        const hfModel = hfModels.find(m => m.name === modelName);
        if (hfModel) {
          await this.trustModelManager.downloadModel(modelName);
          this.clearCache(); // Refresh cache
          return;
        }
      }
      
      throw new Error(`Model ${modelName} not found in any backend. Available models: ${allModels.map(m => m.name).join(', ')}`);
    }

    // Model found in current list - use its backend
    if (targetModel.backend === 'ollama') {
      console.log(`📥 Pulling model ${modelName} via Ollama...`);
      const success = await this.ollamaClient.pullModel(modelName, (progress) => {
        process.stdout.write(`\r${progress}`);
      });
      
      if (success) {
        console.log(`\n✅ Model ${modelName} downloaded successfully via Ollama`);
        this.clearCache(); // Refresh cache
      } else {
        throw new Error(`Failed to download ${modelName} via Ollama`);
      }
    } else if (targetModel.backend === 'huggingface') {
      await this.trustModelManager.downloadModel(modelName);
      this.clearCache(); // Refresh cache
    } else {
      throw new Error(`Backend ${targetModel.backend} not supported for downloads`);
    }
  }

  /**
   * Delete a model from the appropriate backend
   * Implementation of architecture requirement 3.2
   */
  async deleteModel(modelName: string): Promise<void> {
    const allModels = await this.listAllModels();
    const targetModel = allModels.find(m => m.name === modelName);

    if (!targetModel) {
      throw new Error(`Model ${modelName} not found in any backend`);
    }

    if (targetModel.backend === 'huggingface') {
      await this.trustModelManager.deleteModel(modelName);
      console.log(`✅ Model ${modelName} deleted from HuggingFace backend`);
    } else if (targetModel.backend === 'ollama') {
      // Use child process to execute ollama rm command
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);
      
      try {
        await execAsync(`ollama rm ${modelName}`);
        console.log(`✅ Model ${modelName} deleted from Ollama backend`);
      } catch (error) {
        throw new Error(`Failed to delete Ollama model ${modelName}: ${error instanceof Error ? error.message : String(error)}`);
      }
    } else {
      throw new Error(`Backend ${targetModel.backend} not supported for deletion`);
    }

    this.clearCache(); // Refresh cache after deletion
  }

  /**
   * Switch to a model (updates current model for HuggingFace, sets model for Ollama)
   */
  async switchModel(modelName: string): Promise<void> {
    const allModels = await this.listAllModels();
    const targetModel = allModels.find(m => m.name === modelName);

    if (!targetModel) {
      throw new Error(`Model ${modelName} not found in any backend`);
    }

    if (targetModel.backend === 'huggingface') {
      await this.trustModelManager.switchModel(modelName);
    } else if (targetModel.backend === 'ollama') {
      this.ollamaClient.setModel(modelName);
      console.log(`✅ Switched to Ollama model: ${modelName}`);
    } else {
      throw new Error(`Backend ${targetModel.backend} not supported for switching`);
    }
  }

  /**
   * Clear the model cache
   */
  clearCache(): void {
    this.cachedModels = [];
    this.lastCacheUpdate = 0;
  }

  // Helper methods for inferring model characteristics

  private inferTaskSuitability(
    name: string,
    type?: string,
    description?: string,
  ): UnifiedModel['taskSuitability'] {
    const text = `${name} ${type || ''} ${description || ''}`.toLowerCase();

    // Default suitability scores
    const suitability = {
      coding: 5,
      reasoning: 5,
      general: 7,
      creative: 5,
    };

    // Adjust based on model name/type patterns
    if (
      text.includes('code') ||
      text.includes('coding') ||
      text.includes('phi')
    ) {
      suitability.coding = 9;
    }

    if (
      text.includes('reason') ||
      text.includes('logic') ||
      text.includes('deepseek') ||
      text.includes('qwen')
    ) {
      suitability.reasoning = 9;
    }

    if (
      text.includes('instruct') ||
      text.includes('chat') ||
      text.includes('assistant')
    ) {
      suitability.general = 9;
    }

    if (
      text.includes('creative') ||
      text.includes('art') ||
      text.includes('story')
    ) {
      suitability.creative = 9;
    }

    return suitability;
  }

  private inferOllamaModelType(name: string): string {
    if (name.includes('llama')) return 'llama';
    if (name.includes('qwen')) return 'qwen';
    if (name.includes('phi')) return 'phi';
    if (name.includes('gemma')) return 'gemma';
    if (name.includes('deepseek')) return 'deepseek';
    return 'unknown';
  }

  private inferOllamaParameters(name: string): string {
    // Extract parameter size from model name
    const match = name.match(/(\d+(?:\.\d+)?)[bm]/i);
    if (match) {
      const num = parseFloat(match[1]);
      const unit = match[0].slice(-1).toLowerCase();
      return unit === 'b' ? `${num}B` : `${num * 1000}M`;
    }
    return 'Unknown';
  }

  private inferOllamaContextSize(name: string): number {
    // Default context sizes based on model patterns
    if (name.includes('32k')) return 32768;
    if (name.includes('16k')) return 16384;
    if (name.includes('8k')) return 8192;
    if (name.includes('4k')) return 4096;

    // Default based on model type
    if (name.includes('qwen')) return 8192;
    if (name.includes('llama')) return 4096;
    if (name.includes('phi')) return 4096;

    return 4096; // Conservative default
  }

  private inferOllamaRAMRequirement(name: string): string {
    const params = this.inferOllamaParameters(name);
    const match = params.match(/(\d+(?:\.\d+)?)/);

    if (match) {
      const num = parseFloat(match[1]);
      if (params.includes('B')) {
        if (num >= 70) return '48GB';
        if (num >= 30) return '24GB';
        if (num >= 13) return '16GB';
        if (num >= 7) return '8GB';
        if (num >= 3) return '4GB';
        return '2GB';
      }
    }

    return '4GB'; // Conservative default
  }

  private parseRAMRequirement(ramReq?: string): number {
    if (!ramReq) return 8; // Default assumption: 8GB

    const match = ramReq.match(/(\d+(?:\.\d+)?)/);
    if (match) {
      return parseFloat(match[1]);
    }

    return 8;
  }

  /**
   * Check if a model name follows Ollama naming conventions
   */
  private isOllamaModelName(modelName: string): boolean {
    // Ollama models typically follow patterns like:
    // - llama2, llama2:7b, llama2:13b-instruct
    // - codellama:7b-instruct
    // - mistral:7b-instruct-v0.1
    // - qwen:1.8b
    const ollamaPatterns = [
      /^llama/i,
      /^codellama/i,
      /^mistral/i,
      /^qwen/i,
      /^phi/i,
      /^gemma/i,
      /^deepseek/i,
      /:.*b/i, // Contains colon followed by size in billions
    ];

    return ollamaPatterns.some(pattern => pattern.test(modelName));
  }
}
