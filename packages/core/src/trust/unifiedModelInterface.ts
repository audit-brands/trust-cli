/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { UniversalToolCall, UniversalToolResult } from './universalToolInterface.js';

/**
 * Universal model interface that abstracts differences between backends
 */
export interface UnifiedModelInterface {
  // Model metadata
  readonly name: string;
  readonly backend: 'ollama' | 'huggingface' | 'cloud';
  readonly type: string;
  readonly parameters?: string;
  readonly contextSize?: number;
  readonly capabilities: ModelCapabilities;

  // Generation methods
  generateText(prompt: string, options?: GenerationOptions): Promise<string>;
  generateTextStream(prompt: string, options?: GenerationOptions): AsyncIterable<string>;
  generateWithTools(
    prompt: string, 
    tools: UniversalToolCall[], 
    options?: GenerationOptions
  ): Promise<GenerationResult>;

  // Context management
  createContext(options?: ContextOptions): Promise<ModelContext>;
  
  // Health and status
  getHealth(): Promise<ModelHealth>;
  getCapabilities(): ModelCapabilities;
  
  // Lifecycle
  initialize(): Promise<void>;
  dispose(): Promise<void>;
}

export interface ModelCapabilities {
  supportsToolCalling: boolean;
  supportsStreaming: boolean;
  supportsSystemPrompts: boolean;
  supportsImageInput: boolean;
  supportsAudio: boolean;
  maxContextSize: number;
  preferredToolFormat: 'xml' | 'json';
  rateLimits?: {
    tokensPerMinute?: number;
    requestsPerMinute?: number;
  };
}

export interface GenerationOptions {
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  topK?: number;
  stopSequences?: string[];
  systemPrompt?: string;
  contextId?: string;
  toolChoice?: 'auto' | 'none' | string;
  format?: 'json' | 'text';
  timeout?: number; // milliseconds
}

export interface GenerationResult {
  text: string;
  toolCalls?: UniversalToolCall[];
  finishReason: 'stop' | 'length' | 'tool_call' | 'error';
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  metadata?: Record<string, any>;
}

export interface ContextOptions {
  contextSize?: number;
  systemPrompt?: string;
  conversationId?: string;
}

export interface ModelContext {
  readonly id: string;
  readonly modelName: string;
  readonly contextSize: number;
  
  addMessage(role: 'user' | 'assistant' | 'system', content: string): void;
  getMessages(): Array<{ role: string; content: string }>;
  clear(): void;
  getTokenCount(): number;
  clone(): ModelContext;
}

export interface ModelHealth {
  status: 'healthy' | 'degraded' | 'unavailable';
  latency?: number; // milliseconds
  availableMemory?: number; // bytes
  errorRate?: number; // 0-1
  lastChecked: Date;
  issues?: string[];
}

/**
 * Abstract base class for unified model implementations
 */
export abstract class BaseUnifiedModel implements UnifiedModelInterface {
  protected _capabilities: ModelCapabilities;
  protected _initialized = false;
  protected _disposed = false;

  constructor(
    public readonly name: string,
    public readonly backend: 'ollama' | 'huggingface' | 'cloud',
    public readonly type: string,
    capabilities: ModelCapabilities
  ) {
    this._capabilities = capabilities;
  }

  get capabilities(): ModelCapabilities {
    return { ...this._capabilities };
  }

  get parameters(): string | undefined {
    return undefined;
  }

  get contextSize(): number | undefined {
    return this._capabilities.maxContextSize;
  }

  getCapabilities(): ModelCapabilities {
    return this.capabilities;
  }

  async initialize(): Promise<void> {
    if (this._disposed) {
      throw new Error('Model has been disposed');
    }
    
    if (this._initialized) {
      return;
    }

    await this.doInitialize();
    this._initialized = true;
  }

  async dispose(): Promise<void> {
    if (this._disposed) {
      return;
    }

    await this.doDispose();
    this._disposed = true;
    this._initialized = false;
  }

  protected ensureInitialized(): void {
    if (!this._initialized) {
      throw new Error('Model not initialized. Call initialize() first.');
    }
    
    if (this._disposed) {
      throw new Error('Model has been disposed');
    }
  }

  // Abstract methods that must be implemented by concrete classes
  abstract generateText(prompt: string, options?: GenerationOptions): Promise<string>;
  abstract generateTextStream(prompt: string, options?: GenerationOptions): AsyncIterable<string>;
  abstract generateWithTools(
    prompt: string, 
    tools: UniversalToolCall[], 
    options?: GenerationOptions
  ): Promise<GenerationResult>;
  abstract createContext(options?: ContextOptions): Promise<ModelContext>;
  abstract getHealth(): Promise<ModelHealth>;

  protected abstract doInitialize(): Promise<void>;
  protected abstract doDispose(): Promise<void>;
}

/**
 * Model registry for managing unified model instances
 */
export class UnifiedModelRegistry {
  private models = new Map<string, UnifiedModelInterface>();
  private defaultModel?: string;

  /**
   * Register a model instance
   */
  register(model: UnifiedModelInterface): void {
    this.models.set(model.name, model);
    
    // Set as default if no default exists
    if (!this.defaultModel) {
      this.defaultModel = model.name;
    }
  }

  /**
   * Unregister a model
   */
  async unregister(modelName: string): Promise<void> {
    const model = this.models.get(modelName);
    if (model) {
      await model.dispose();
      this.models.delete(modelName);
      
      if (this.defaultModel === modelName) {
        this.defaultModel = this.models.keys().next().value;
      }
    }
  }

  /**
   * Get a specific model
   */
  getModel(modelName: string): UnifiedModelInterface | undefined {
    return this.models.get(modelName);
  }

  /**
   * Get the default model
   */
  getDefaultModel(): UnifiedModelInterface | undefined {
    return this.defaultModel ? this.models.get(this.defaultModel) : undefined;
  }

  /**
   * Set the default model
   */
  setDefaultModel(modelName: string): void {
    if (!this.models.has(modelName)) {
      throw new Error(`Model '${modelName}' not registered`);
    }
    this.defaultModel = modelName;
  }

  /**
   * List all registered models
   */
  listModels(): Array<{ name: string; backend: string; type: string; capabilities: ModelCapabilities }> {
    return Array.from(this.models.values()).map(model => ({
      name: model.name,
      backend: model.backend,
      type: model.type,
      capabilities: model.getCapabilities()
    }));
  }

  /**
   * Find models by capability
   */
  findModelsByCapability(capability: keyof ModelCapabilities): UnifiedModelInterface[] {
    return Array.from(this.models.values()).filter(model => 
      model.getCapabilities()[capability]
    );
  }

  /**
   * Get models by backend
   */
  getModelsByBackend(backend: 'ollama' | 'huggingface' | 'cloud'): UnifiedModelInterface[] {
    return Array.from(this.models.values()).filter(model => 
      model.backend === backend
    );
  }

  /**
   * Health check all models
   */
  async healthCheck(): Promise<Map<string, ModelHealth>> {
    const results = new Map<string, ModelHealth>();
    
    const healthPromises = Array.from(this.models.entries()).map(async ([name, model]) => {
      try {
        const health = await model.getHealth();
        results.set(name, health);
      } catch (error) {
        results.set(name, {
          status: 'unavailable',
          lastChecked: new Date(),
          issues: [error instanceof Error ? error.message : String(error)]
        });
      }
    });

    await Promise.allSettled(healthPromises);
    return results;
  }

  /**
   * Dispose all models
   */
  async dispose(): Promise<void> {
    const disposePromises = Array.from(this.models.values()).map(model => 
      model.dispose().catch(err => console.warn(`Failed to dispose model ${model.name}:`, err))
    );
    
    await Promise.allSettled(disposePromises);
    this.models.clear();
    this.defaultModel = undefined;
  }
}

/**
 * Model factory for creating unified model instances
 */
export abstract class UnifiedModelFactory {
  abstract canCreate(backend: string, modelName: string): boolean;
  abstract create(modelName: string, config?: any): Promise<UnifiedModelInterface>;
  abstract listAvailableModels(): Promise<Array<{ name: string; type: string }>>;
}

/**
 * Model adapter pattern for wrapping existing backend implementations
 */
export interface ModelAdapter<TBackendModel = any> {
  readonly backendModel: TBackendModel;
  adapt(): UnifiedModelInterface;
}

/**
 * Utility functions for model interface
 */
export class ModelInterfaceUtils {
  /**
   * Test model compatibility with a specific use case
   */
  static testCompatibility(
    model: UnifiedModelInterface,
    requirements: Partial<ModelCapabilities>
  ): { compatible: boolean; missing: string[] } {
    const capabilities = model.getCapabilities();
    const missing: string[] = [];

    for (const [key, required] of Object.entries(requirements)) {
      if (required && !capabilities[key as keyof ModelCapabilities]) {
        missing.push(key);
      }
    }

    return {
      compatible: missing.length === 0,
      missing
    };
  }

  /**
   * Get optimal generation options for a model
   */
  static getOptimalOptions(
    model: UnifiedModelInterface,
    task: 'chat' | 'completion' | 'tools' | 'structured'
  ): GenerationOptions {
    const capabilities = model.getCapabilities();
    const options: GenerationOptions = {};

    // Set context-appropriate defaults
    switch (task) {
      case 'chat':
        options.temperature = 0.7;
        options.maxTokens = Math.min(capabilities.maxContextSize * 0.25, 2048);
        break;
      case 'completion':
        options.temperature = 0.3;
        options.maxTokens = Math.min(capabilities.maxContextSize * 0.5, 4096);
        break;
      case 'tools':
        options.temperature = 0.1;
        options.toolChoice = 'auto';
        options.format = capabilities.preferredToolFormat === 'json' ? 'json' : 'text';
        break;
      case 'structured':
        options.temperature = 0.1;
        options.format = 'json';
        break;
    }

    // Adjust for model capabilities
    if (!capabilities.supportsToolCalling && task === 'tools') {
      console.warn(`Model ${model.name} does not support tool calling`);
    }

    return options;
  }

  /**
   * Estimate generation cost (tokens/time)
   */
  static estimateGeneration(
    model: UnifiedModelInterface,
    promptLength: number,
    options?: GenerationOptions
  ): {
    estimatedPromptTokens: number;
    estimatedCompletionTokens: number;
    estimatedTotalTokens: number;
    estimatedTimeMs: number;
  } {
    // Rough token estimation (4 chars per token average)
    const estimatedPromptTokens = Math.ceil(promptLength / 4);
    const maxTokens = options?.maxTokens || 1024;
    const estimatedCompletionTokens = Math.min(maxTokens, estimatedPromptTokens * 0.5);
    const estimatedTotalTokens = estimatedPromptTokens + estimatedCompletionTokens;

    // Time estimation based on backend type
    let tokensPerSecond: number;
    switch (model.backend) {
      case 'ollama':
        tokensPerSecond = 20; // Local model speed
        break;
      case 'huggingface':
        tokensPerSecond = 15; // Local HF model speed
        break;
      case 'cloud':
        tokensPerSecond = 50; // Cloud API speed
        break;
      default:
        tokensPerSecond = 25;
    }

    const estimatedTimeMs = (estimatedCompletionTokens / tokensPerSecond) * 1000;

    return {
      estimatedPromptTokens,
      estimatedCompletionTokens,
      estimatedTotalTokens,
      estimatedTimeMs
    };
  }
}

// Global registry instance
export const globalModelRegistry = new UnifiedModelRegistry();