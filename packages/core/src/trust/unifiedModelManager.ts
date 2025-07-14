/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  UnifiedModelInterface,
  UnifiedModelRegistry,
  UnifiedModelFactory,
  ModelInterfaceUtils,
  globalModelRegistry,
  ModelCapabilities,
  GenerationOptions,
  GenerationResult
} from './unifiedModelInterface.js';
import { OllamaModelAdapter } from './adapters/ollamaModelAdapter.js';
import { HuggingFaceModelAdapter } from './adapters/huggingfaceModelAdapter.js';
import { CloudModelAdapter, CloudProviderConfig } from './adapters/cloudModelAdapter.js';
import { ProviderConfigManager } from './providerConfigManager.js';
import { SmartContextManager, ContextManagerFactory, ContextManagementConfig } from './smartContextManager.js';

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
    coding?: number;
    reasoning?: number;
    general?: number;
    creative?: number;
  };
  available: boolean;
  metadata?: {
    quantization?: string;
    downloadUrl?: string;
    expectedSize?: number;
  };
}

// Export legacy types for backward compatibility
export type TaskType = 'coding' | 'reasoning' | 'general' | 'creative';
export type HardwareConstraints = {
  maxLatency?: number;
  preferLocal?: boolean;
  maxRAM?: string;
  availableRAM?: number;
  preferredSize?: string;
  maxDownloadSize?: number;
};

/**
 * Enhanced unified model manager with provider integration
 */
export class EnhancedUnifiedModelManager {
  private registry: UnifiedModelRegistry;
  private providerManager: ProviderConfigManager;
  private factories: Map<string, UnifiedModelFactory> = new Map();
  private currentModel?: UnifiedModelInterface;
  private contextManagerConfig?: ContextManagementConfig;

  constructor(contextConfig?: ContextManagementConfig) {
    this.registry = globalModelRegistry;
    this.providerManager = new ProviderConfigManager();
    this.contextManagerConfig = contextConfig;
    this.initializeFactories();
  }

  /**
   * Initialize the manager and auto-detect available models
   */
  async initialize(): Promise<void> {
    await this.providerManager.initialize();
    await this.discoverAndRegisterModels();
  }

  /**
   * Discover models from all enabled providers and register them
   */
  async discoverAndRegisterModels(): Promise<void> {
    const enabledProviders = this.providerManager.getEnabledProviders();
    
    for (const provider of enabledProviders) {
      try {
        await this.discoverModelsFromProvider(provider.id);
      } catch (error) {
        console.warn(`Failed to discover models from ${provider.name}:`, error);
      }
    }
  }

  /**
   * Get a unified interface for a specific model
   */
  async getModel(modelName: string): Promise<UnifiedModelInterface | undefined> {
    const model = this.registry.getModel(modelName);
    if (model) {
      await model.initialize();
      return model;
    }

    // Try to create the model if not found
    return await this.createModelIfAvailable(modelName);
  }

  /**
   * Get the current active model
   */
  getCurrentModel(): UnifiedModelInterface | undefined {
    return this.currentModel;
  }

  /**
   * Switch to a different model
   */
  async switchModel(modelName: string): Promise<void> {
    const model = await this.getModel(modelName);
    if (!model) {
      throw new Error(`Model '${modelName}' not available`);
    }

    // Dispose current model if exists
    if (this.currentModel) {
      await this.currentModel.dispose();
    }

    this.currentModel = model;
    await this.currentModel.initialize();
  }

  /**
   * Generate text using the current model
   */
  async generateText(prompt: string, options?: GenerationOptions): Promise<string> {
    if (!this.currentModel) {
      throw new Error('No model selected. Use switchModel() first.');
    }

    return await this.currentModel.generateText(prompt, options);
  }

  /**
   * Generate text with streaming using the current model
   */
  async* generateTextStream(prompt: string, options?: GenerationOptions): AsyncIterable<string> {
    if (!this.currentModel) {
      throw new Error('No model selected. Use switchModel() first.');
    }

    yield* this.currentModel.generateTextStream(prompt, options);
  }

  /**
   * Generate with tool support using the current model
   */
  async generateWithTools(
    prompt: string,
    tools: any[],
    options?: GenerationOptions
  ): Promise<GenerationResult> {
    if (!this.currentModel) {
      throw new Error('No model selected. Use switchModel() first.');
    }

    return await this.currentModel.generateWithTools(prompt, tools, options);
  }

  /**
   * Create a managed context for the current model
   */
  async createManagedContext(options?: any): Promise<any> {
    if (!this.currentModel) {
      throw new Error('No model selected. Use switchModel() first.');
    }

    const context = await this.currentModel.createContext(options);
    const contextManager = ContextManagerFactory.getManager(
      this.currentModel.name,
      this.currentModel.capabilities,
      this.contextManagerConfig
    );

    // Return wrapped context with auto-compression
    return {
      context,
      manager: contextManager,
      
      async addMessage(role: 'user' | 'assistant' | 'system', content: string): Promise<void> {
        context.addMessage(role, content);
        await contextManager.manageContext(context);
      },

      getMessages() {
        return context.getMessages();
      },

      clear() {
        context.clear();
      },

      getTokenCount() {
        return context.getTokenCount();
      },

      clone() {
        return context.clone();
      },

      getMetrics() {
        return contextManager.getMetrics();
      },

      async compressContext() {
        return await contextManager.compressContext(context);
      },

      needsCompression() {
        return contextManager.needsCompression(context);
      },

      getOptimalBatchSize() {
        return contextManager.getOptimalBatchSize();
      },

      estimateTokens(text: string) {
        return contextManager.estimateTokens(text);
      }
    };
  }

  /**
   * Get context management metrics for all models
   */
  getContextMetrics(): Record<string, any> {
    return ContextManagerFactory.getAllMetrics();
  }

  /**
   * Configure context management settings
   */
  configureContextManagement(config: ContextManagementConfig): void {
    this.contextManagerConfig = config;
    // Clear cache to apply new config to future managers
    ContextManagerFactory.clearCache();
  }

  /**
   * List all available models from all providers
   */
  async listAllModels(): Promise<UnifiedModel[]> {
    const models: UnifiedModel[] = [];

    // Get models from registry (already loaded)
    const registeredModels = this.registry.listModels();
    for (const model of registeredModels) {
      models.push({
        name: model.name,
        backend: model.backend as 'ollama' | 'huggingface' | 'cloud',
        type: model.type,
        available: true,
        contextSize: model.capabilities.maxContextSize,
        description: `${model.backend} model with ${model.type} architecture`,
        taskSuitability: this.estimateTaskSuitability(model.capabilities)
      });
    }

    // Get available models from providers
    const enabledProviders = this.providerManager.getEnabledProviders();
    for (const provider of enabledProviders) {
      try {
        const providerModels = await this.getProviderModels(provider.id);
        models.push(...providerModels);
      } catch (error) {
        console.warn(`Failed to list models from ${provider.name}:`, error);
      }
    }

    // Remove duplicates
    const uniqueModels = models.filter((model, index, array) => 
      array.findIndex(m => m.name === model.name) === index
    );

    return uniqueModels;
  }

  /**
   * Download a model (for HuggingFace backend)
   */
  async downloadModel(modelName: string): Promise<void> {
    const model = await this.findModelInProviders(modelName);
    if (!model) {
      throw new Error(`Model '${modelName}' not found in any provider`);
    }

    switch (model.backend) {
      case 'huggingface':
        await this.downloadHuggingFaceModel(modelName);
        break;
      case 'ollama':
        throw new Error('Use "ollama pull" to download Ollama models');
      case 'cloud':
        throw new Error('Cloud models do not need downloading');
      default:
        throw new Error(`Download not supported for backend: ${model.backend}`);
    }
  }

  /**
   * Delete a model
   */
  async deleteModel(modelName: string): Promise<void> {
    const model = this.registry.getModel(modelName);
    if (model) {
      await this.registry.unregister(modelName);
    }

    // Handle backend-specific deletion
    const foundModel = await this.findModelInProviders(modelName);
    if (foundModel?.backend === 'huggingface') {
      await this.deleteHuggingFaceModel(modelName);
    }
  }

  /**
   * Get model recommendations based on task and constraints
   */
  async getRecommendations(
    task: 'coding' | 'reasoning' | 'general' | 'creative',
    constraints?: {
      maxLatency?: number;
      preferLocal?: boolean;
      maxRAM?: string;
    }
  ): Promise<UnifiedModel[]> {
    const allModels = await this.listAllModels();
    
    let candidates = allModels.filter(model => {
      // Filter by availability
      if (!model.available) return false;
      
      // Filter by task suitability
      const suitability = model.taskSuitability?.[task] || 0;
      if (suitability < 6) return false; // Minimum threshold
      
      // Filter by constraints
      if (constraints?.preferLocal && model.backend === 'cloud') return false;
      if (constraints?.maxRAM && model.ramRequirement) {
        const modelRAM = this.parseRAMRequirement(model.ramRequirement);
        const maxRAM = this.parseRAMRequirement(constraints.maxRAM);
        if (modelRAM > maxRAM) return false;
      }
      
      return true;
    });

    // Sort by task suitability and other factors
    candidates.sort((a, b) => {
      const aScore = this.calculateModelScore(a, task, constraints);
      const bScore = this.calculateModelScore(b, task, constraints);
      return bScore - aScore;
    });

    return candidates.slice(0, 5); // Return top 5 recommendations
  }

  /**
   * Health check all registered models
   */
  async healthCheckAll(): Promise<Map<string, any>> {
    return await this.registry.healthCheck();
  }

  /**
   * Dispose all resources
   */
  async dispose(): Promise<void> {
    if (this.currentModel) {
      await this.currentModel.dispose();
      this.currentModel = undefined;
    }
    await this.registry.dispose();
  }

  /**
   * Initialize model factories for each backend
   */
  private initializeFactories(): void {
    this.factories.set('ollama', new OllamaModelFactory());
    this.factories.set('huggingface', new HuggingFaceModelFactory());
    this.factories.set('cloud', new CloudModelFactory());
  }

  /**
   * Discover models from a specific provider
   */
  private async discoverModelsFromProvider(providerId: string): Promise<void> {
    const factory = this.factories.get(providerId);
    if (!factory) return;

    try {
      const availableModels = await factory.listAvailableModels();
      
      for (const modelInfo of availableModels) {
        try {
          const model = await factory.create(modelInfo.name);
          this.registry.register(model);
        } catch (error) {
          console.warn(`Failed to create model ${modelInfo.name}:`, error);
        }
      }
    } catch (error) {
      console.warn(`Failed to discover models from ${providerId}:`, error);
    }
  }

  /**
   * Create model if available in any provider
   */
  private async createModelIfAvailable(modelName: string): Promise<UnifiedModelInterface | undefined> {
    for (const [backendType, factory] of this.factories.entries()) {
      if (await factory.canCreate(backendType, modelName)) {
        try {
          const model = await factory.create(modelName);
          this.registry.register(model);
          return model;
        } catch (error) {
          console.warn(`Failed to create ${modelName} with ${backendType}:`, error);
        }
      }
    }
    return undefined;
  }

  private async getProviderModels(providerId: string): Promise<UnifiedModel[]> {
    // This would integrate with specific provider APIs to get model lists
    // For now, return empty array
    return [];
  }

  private async findModelInProviders(modelName: string): Promise<UnifiedModel | undefined> {
    const allModels = await this.listAllModels();
    return allModels.find(model => model.name === modelName);
  }

  private async downloadHuggingFaceModel(modelName: string): Promise<void> {
    // Implement HuggingFace model download logic
    console.log(`Downloading HuggingFace model: ${modelName}`);
    // This would use huggingface-hub or similar
  }

  private async deleteHuggingFaceModel(modelName: string): Promise<void> {
    // Implement HuggingFace model deletion logic
    console.log(`Deleting HuggingFace model: ${modelName}`);
  }

  private estimateTaskSuitability(capabilities: ModelCapabilities): UnifiedModel['taskSuitability'] {
    return {
      coding: capabilities.supportsToolCalling ? 8 : 6,
      reasoning: capabilities.maxContextSize > 8000 ? 8 : 6,
      general: 7,
      creative: 7
    };
  }

  private parseRAMRequirement(ram: string): number {
    const match = ram.match(/(\d+)\s*(GB|MB)/i);
    if (!match) return 0;
    
    const value = parseInt(match[1]);
    const unit = match[2].toUpperCase();
    
    return unit === 'GB' ? value : value / 1024;
  }

  private calculateModelScore(
    model: UnifiedModel,
    task: 'coding' | 'reasoning' | 'general' | 'creative',
    constraints?: any
  ): number {
    let score = model.taskSuitability?.[task] || 5;
    
    // Boost local models if preferred
    if (constraints?.preferLocal && model.backend !== 'cloud') {
      score += 2;
    }
    
    // Consider trust score
    if (model.trustScore) {
      score += model.trustScore / 10;
    }
    
    return score;
  }
}

/**
 * Factory implementations for each backend
 */
class OllamaModelFactory extends UnifiedModelFactory {
  canCreate(backend: string, modelName: string): boolean {
    return backend === 'ollama';
  }

  async create(modelName: string, config?: any): Promise<UnifiedModelInterface> {
    return new OllamaModelAdapter(modelName, 'llama', config?.endpoint);
  }

  async listAvailableModels(): Promise<Array<{ name: string; type: string }>> {
    try {
      const response = await fetch('http://localhost:11434/api/tags');
      if (!response.ok) return [];
      
      const data = await response.json();
      return data.models?.map((model: any) => ({
        name: model.name,
        type: 'llama'
      })) || [];
    } catch {
      return [];
    }
  }
}

class HuggingFaceModelFactory extends UnifiedModelFactory {
  canCreate(backend: string, modelName: string): boolean {
    return backend === 'huggingface';
  }

  async create(modelName: string, config?: any): Promise<UnifiedModelInterface> {
    const modelPath = config?.path || `/models/${modelName}`;
    return new HuggingFaceModelAdapter(modelName, 'transformer', modelPath);
  }

  async listAvailableModels(): Promise<Array<{ name: string; type: string }>> {
    // This would scan local HuggingFace cache or predefined model list
    return [
      { name: 'qwen2.5-1.5b-instruct', type: 'qwen' },
      { name: 'phi-3.5-mini-instruct', type: 'phi' }
    ];
  }
}

class CloudModelFactory extends UnifiedModelFactory {
  canCreate(backend: string, modelName: string): boolean {
    return backend === 'cloud';
  }

  async create(modelName: string, config?: CloudProviderConfig): Promise<UnifiedModelInterface> {
    if (!config) {
      throw new Error('Cloud provider configuration required');
    }
    return new CloudModelAdapter(modelName, 'transformer', config);
  }

  async listAvailableModels(): Promise<Array<{ name: string; type: string }>> {
    return [
      { name: 'gemini-1.5-pro', type: 'gemini' },
      { name: 'gpt-4', type: 'gpt' },
      { name: 'claude-3-5-sonnet', type: 'claude' }
    ];
  }
}

// Legacy alias for backward compatibility
export const UnifiedModelManager = EnhancedUnifiedModelManager;