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
    coding?: number;      // 0-10 score for coding tasks
    reasoning?: number;   // 0-10 score for reasoning tasks
    general?: number;     // 0-10 score for general tasks
    creative?: number;    // 0-10 score for creative tasks
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
   * Discover and consolidate models from all configured backends
   */
  async discoverAllModels(forceRefresh = false): Promise<UnifiedModel[]> {
    const now = Date.now();
    
    // Return cached models if still valid
    if (!forceRefresh && this.cachedModels.length > 0 && (now - this.lastCacheUpdate) < this.cacheTimeout) {
      return this.cachedModels;
    }

    const allModels: UnifiedModel[] = [];

    // Discover HuggingFace models
    if (this.trustConfig.isBackendEnabled('huggingface')) {
      const hfModels = await this.discoverHuggingFaceModels();
      allModels.push(...hfModels);
    }

    // Discover Ollama models
    if (this.trustConfig.isBackendEnabled('ollama')) {
      const ollamaModels = await this.discoverOllamaModels();
      allModels.push(...ollamaModels);
    }

    // Discover Cloud models (placeholder for future implementation)
    if (this.trustConfig.isBackendEnabled('cloud')) {
      const cloudModels = await this.discoverCloudModels();
      allModels.push(...cloudModels);
    }

    // Cache the results
    this.cachedModels = allModels;
    this.lastCacheUpdate = now;

    return allModels;
  }

  /**
   * Discover models from HuggingFace backend
   */
  private async discoverHuggingFaceModels(): Promise<UnifiedModel[]> {
    try {
      const models = this.trustModelManager.listAvailableModels();
      
      return models.map(model => ({
        name: model.name,
        backend: 'huggingface' as const,
        type: model.type,
        parameters: model.parameters,
        contextSize: model.contextSize,
        ramRequirement: model.ramRequirement,
        description: model.description,
        trustScore: model.trustScore,
        taskSuitability: this.inferTaskSuitability(model.name, model.type, model.description),
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
      
      return modelNames.map(name => ({
        name,
        backend: 'ollama' as const,
        type: this.inferOllamaModelType(name),
        parameters: this.inferOllamaParameters(name),
        contextSize: this.inferOllamaContextSize(name),
        ramRequirement: this.inferOllamaRAMRequirement(name),
        description: `Ollama model: ${name}`,
        trustScore: 8.0, // Default trust score for Ollama models
        taskSuitability: this.inferTaskSuitability(name, this.inferOllamaModelType(name)),
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
    hardwareConstraints?: HardwareConstraints
  ): UnifiedModel[] {
    let filtered = [...models];

    // Filter by availability
    filtered = filtered.filter(model => model.available);

    // Filter by task suitability
    if (taskType && taskType !== 'general') {
      filtered = filtered.filter(model => {
        const suitability = model.taskSuitability?.[taskType] || 0;
        return suitability >= 6; // Minimum suitability threshold
      });
    }

    // Filter by hardware constraints
    if (hardwareConstraints) {
      if (hardwareConstraints.availableRAM) {
        filtered = filtered.filter(model => {
          const ramReq = this.parseRAMRequirement(model.ramRequirement);
          return ramReq <= hardwareConstraints.availableRAM!;
        });
      }

      if (hardwareConstraints.maxDownloadSize && hardwareConstraints.maxDownloadSize > 0) {
        filtered = filtered.filter(model => {
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
  selectBestModel(models: UnifiedModel[], taskType?: TaskType): UnifiedModel | null {
    if (models.length === 0) return null;

    // Sort by combined score: trust score + task suitability
    const scored = models.map(model => {
      const trustScore = model.trustScore || 0;
      const taskScore = taskType && model.taskSuitability?.[taskType] 
        ? model.taskSuitability[taskType] || 0 
        : model.taskSuitability?.general || 0;
      
      return {
        model,
        combinedScore: (trustScore * 0.6) + (taskScore * 0.4), // Weight trust score higher
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
    description?: string
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
    if (text.includes('code') || text.includes('coding') || text.includes('phi')) {
      suitability.coding = 9;
    }
    
    if (text.includes('reason') || text.includes('logic') || text.includes('deepseek') || text.includes('qwen')) {
      suitability.reasoning = 9;
    }
    
    if (text.includes('instruct') || text.includes('chat') || text.includes('assistant')) {
      suitability.general = 9;
    }
    
    if (text.includes('creative') || text.includes('art') || text.includes('story')) {
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
}