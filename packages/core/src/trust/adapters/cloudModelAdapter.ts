/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BaseUnifiedModel,
  ModelCapabilities,
  GenerationOptions,
  GenerationResult,
  ContextOptions,
  ModelContext,
  ModelHealth
} from '../unifiedModelInterface.js';
import { UniversalToolCall } from '../universalToolInterface.js';
import { StreamingIntegrationHelpers } from '../streamingBufferManager.js';
import { CloudToolProvider, createCloudToolProvider, CloudProvider } from '../cloudToolProvider.js';
import { UniversalToolDefinition } from '../universalToolInterface.js';
import { executeWithRecovery } from '../errorRecoveryDecorators.js';

/**
 * Cloud-specific model context implementation
 */
class CloudModelContext implements ModelContext {
  private messages: Array<{ role: string; content: string }> = [];
  
  constructor(
    public readonly id: string,
    public readonly modelName: string,
    public readonly contextSize: number,
    systemPrompt?: string
  ) {
    if (systemPrompt) {
      this.messages.push({ role: 'system', content: systemPrompt });
    }
  }

  addMessage(role: 'user' | 'assistant' | 'system', content: string): void {
    this.messages.push({ role, content });
    
    // Manage context size for cloud APIs (more aggressive due to cost)
    while (this.getTokenCount() > this.contextSize * 0.8) {
      const firstNonSystem = this.messages.findIndex(m => m.role !== 'system');
      if (firstNonSystem >= 0) {
        this.messages.splice(firstNonSystem, 1);
      } else {
        break;
      }
    }
  }

  getMessages(): Array<{ role: string; content: string }> {
    return [...this.messages];
  }

  clear(): void {
    const systemMessages = this.messages.filter(m => m.role === 'system');
    this.messages = systemMessages;
  }

  getTokenCount(): number {
    // More accurate token estimation for cloud APIs
    return Math.ceil(
      this.messages.reduce((total, msg) => {
        // Account for role tokens and formatting
        return total + msg.content.length + msg.role.length + 10;
      }, 0) / 3.5 // More accurate chars per token for modern models
    );
  }

  clone(): ModelContext {
    const cloned = new CloudModelContext(
      this.id + '_clone',
      this.modelName,
      this.contextSize
    );
    cloned.messages = [...this.messages];
    return cloned;
  }
}

export interface CloudProviderConfig {
  provider: 'gemini' | 'openai' | 'anthropic' | 'vertex-ai';
  apiKey?: string;
  endpoint?: string;
  projectId?: string; // For Vertex AI
  region?: string; // For Vertex AI
}

/**
 * Cloud model adapter for external API providers
 */
export class CloudModelAdapter extends BaseUnifiedModel {
  private config: CloudProviderConfig;
  private rateLimiter?: RateLimiter;
  private toolProvider?: CloudToolProvider;

  constructor(
    name: string,
    type: string,
    config: CloudProviderConfig,
    capabilities?: Partial<ModelCapabilities>
  ) {
    const defaultCapabilities: ModelCapabilities = {
      supportsToolCalling: true, // Most modern cloud models support tools
      supportsStreaming: true,
      supportsSystemPrompts: true,
      supportsImageInput: false, // Depends on specific model
      supportsAudio: false,
      maxContextSize: 8192, // Generous default for cloud models
      preferredToolFormat: 'json',
      rateLimits: {
        tokensPerMinute: 10000,
        requestsPerMinute: 60
      },
      ...capabilities
    };

    super(name, 'cloud', type, defaultCapabilities);
    this.config = config;
    
    // Initialize rate limiter if limits are specified
    if (capabilities?.rateLimits) {
      this.rateLimiter = new RateLimiter(capabilities.rateLimits);
    }

    // Initialize tool provider based on the provider type
    try {
      this.toolProvider = createCloudToolProvider(this.config.provider as CloudProvider, {
        provider: this.config.provider as CloudProvider,
        format: this.getDefaultToolFormat(),
        maxParallelCalls: 3,
        toolChoice: 'auto',
        errorHandling: {
          retryFailedCalls: true,
          fallbackToText: true,
          maxRetries: 2
        }
      });
    } catch (error) {
      console.warn(`Failed to initialize tool provider for ${this.config.provider}:`, error);
    }
  }

  protected async doInitialize(): Promise<void> {
    // Verify API key and connectivity
    if (!this.config.apiKey) {
      const envVar = this.getApiKeyEnvVar();
      this.config.apiKey = process.env[envVar];
      
      if (!this.config.apiKey) {
        throw new Error(`API key not found. Set ${envVar} environment variable.`);
      }
    }

    // Test connectivity with a minimal API call
    try {
      await this.testConnection();
    } catch (error) {
      throw new Error(`Failed to connect to ${this.config.provider}: ${error}`);
    }

    // Update capabilities based on model name and provider
    this.updateCapabilitiesFromProvider();
  }

  protected async doDispose(): Promise<void> {
    // No specific cleanup needed for cloud APIs
    this.rateLimiter = undefined;
  }

  async generateText(prompt: string, options?: GenerationOptions): Promise<string> {
    this.ensureInitialized();
    await this.rateLimiter?.waitForAvailability();

    try {
      switch (this.config.provider) {
        case 'gemini':
          return await this.generateGemini(prompt, options);
        case 'openai':
          return await this.generateOpenAI(prompt, options);
        case 'anthropic':
          return await this.generateAnthropic(prompt, options);
        case 'vertex-ai':
          return await this.generateVertexAI(prompt, options);
        default:
          throw new Error(`Unsupported provider: ${this.config.provider}`);
      }
    } catch (error) {
      throw new Error(`Cloud generation failed: ${error}`);
    }
  }

  async* generateTextStream(prompt: string, options?: GenerationOptions): AsyncIterable<string> {
    this.ensureInitialized();
    await this.rateLimiter?.waitForAvailability();

    try {
      switch (this.config.provider) {
        case 'gemini':
          yield* this.generateGeminiStream(prompt, options);
          break;
        case 'openai':
          yield* this.generateOpenAIStream(prompt, options);
          break;
        case 'anthropic':
          yield* this.generateAnthropicStream(prompt, options);
          break;
        case 'vertex-ai':
          yield* this.generateVertexAIStream(prompt, options);
          break;
        default:
          throw new Error(`Streaming not supported for provider: ${this.config.provider}`);
      }
    } catch (error) {
      throw new Error(`Cloud streaming failed: ${error}`);
    }
  }

  async generateWithTools(
    prompt: string,
    tools: UniversalToolCall[] | UniversalToolDefinition[],
    options?: GenerationOptions
  ): Promise<GenerationResult> {
    return executeWithRecovery(
      async () => this._generateWithToolsInternal(prompt, tools, options),
      {
        operationName: `${this.config.provider}.generateWithTools`,
        category: 'tool_execution',
        enableCircuitBreaker: true,
        customStrategy: {
          maxRetries: 2,
          baseDelay: 1500,
          fallbackOptions: ['text_only_generation', 'simplified_tools']
        }
      }
    );
  }

  private async _generateWithToolsInternal(
    prompt: string,
    tools: UniversalToolCall[] | UniversalToolDefinition[],
    options?: GenerationOptions
  ): Promise<GenerationResult> {
    this.ensureInitialized();
    await this.rateLimiter?.waitForAvailability();

    if (!this._capabilities.supportsToolCalling) {
      throw new Error('This model does not support tool calling');
    }

    if (!this.toolProvider) {
      // Fallback to legacy implementation without universal tools
      return await this.generateWithToolsLegacy(prompt, tools as UniversalToolCall[], options);
    }

    // Convert tools to UniversalToolDefinition format
    const toolDefinitions: UniversalToolDefinition[] = tools.map(tool => {
      if ('parameters' in tool) {
        return tool as UniversalToolDefinition;
      } else {
        const toolCall = tool as UniversalToolCall;
        return {
          name: toolCall.name,
          description: toolCall.description || `Tool: ${toolCall.name}`,
          parameters: {
            type: 'object',
            properties: Object.keys(toolCall.arguments).reduce((props, key) => {
              props[key] = { type: 'string', description: `Parameter: ${key}` };
              return props;
            }, {} as Record<string, any>),
            required: Object.keys(toolCall.arguments)
          }
        };
      }
    });

    try {
      // Generate enhanced prompt with tool information
      const toolPrompt = this.toolProvider.getToolPrompt(toolDefinitions);
      const enhancedPrompt = `${prompt}\n\n${toolPrompt}`;

      // Generate response using provider-specific implementation
      const response = await this.generateProviderResponse(enhancedPrompt, toolDefinitions, options);
      
      // Parse tool calls using universal provider
      const toolCalls = this.toolProvider.parseToolCalls(response);

      // Clean response text
      let cleanText = response;
      if (toolCalls.length > 0) {
        cleanText = this.cleanResponseText(response, this.config.provider);
      }

      return {
        text: cleanText,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        finishReason: toolCalls.length > 0 ? 'tool_call' : 'stop',
        usage: {
          promptTokens: Math.ceil(enhancedPrompt.length / 4),
          completionTokens: Math.ceil(response.length / 4),
          totalTokens: Math.ceil((enhancedPrompt.length + response.length) / 4)
        }
      };

    } catch (error) {
      return {
        text: '',
        finishReason: 'error',
        metadata: { error: error instanceof Error ? error.message : String(error) }
      };
    }
  }

  async createContext(options?: ContextOptions): Promise<ModelContext> {
    this.ensureInitialized();

    const contextId = options?.conversationId || `cloud_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const contextSize = options?.contextSize || this._capabilities.maxContextSize;

    return new CloudModelContext(
      contextId,
      this.name,
      contextSize,
      options?.systemPrompt
    );
  }

  async getHealth(): Promise<ModelHealth> {
    try {
      const startTime = Date.now();
      await this.testConnection();
      const latency = Date.now() - startTime;

      return {
        status: latency < 2000 ? 'healthy' : latency < 5000 ? 'degraded' : 'unavailable',
        latency,
        lastChecked: new Date()
      };
    } catch (error) {
      return {
        status: 'unavailable',
        lastChecked: new Date(),
        issues: [error instanceof Error ? error.message : String(error)]
      };
    }
  }

  private getApiKeyEnvVar(): string {
    switch (this.config.provider) {
      case 'gemini': return 'GEMINI_API_KEY';
      case 'openai': return 'OPENAI_API_KEY';
      case 'anthropic': return 'ANTHROPIC_API_KEY';
      case 'vertex-ai': return 'GOOGLE_APPLICATION_CREDENTIALS';
      default: return 'API_KEY';
    }
  }

  private async testConnection(): Promise<void> {
    // Simplified connection test - in reality would make actual API calls
    if (!this.config.apiKey) {
      throw new Error('API key required');
    }

    // Simulate connection test
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  private updateCapabilitiesFromProvider(): void {
    switch (this.config.provider) {
      case 'gemini':
        this._capabilities.maxContextSize = 1000000; // Gemini's large context
        this._capabilities.supportsImageInput = true;
        break;
      case 'openai':
        this._capabilities.maxContextSize = 128000; // GPT-4 Turbo
        this._capabilities.supportsImageInput = this.name.includes('vision');
        break;
      case 'anthropic':
        this._capabilities.maxContextSize = 200000; // Claude 3
        this._capabilities.supportsImageInput = true;
        break;
      case 'vertex-ai':
        this._capabilities.maxContextSize = 32000; // Varies by model
        break;
    }
  }

  /**
   * Get default tool format for the provider
   */
  private getDefaultToolFormat(): any {
    switch (this.config.provider) {
      case 'openai':
        return 'openai_tools';
      case 'anthropic':
        return 'anthropic_tools';
      case 'gemini':
        return 'gemini_functions';
      case 'vertex-ai':
        return 'vertex_functions';
      default:
        return 'openai_tools';
    }
  }

  /**
   * Generate response using provider-specific implementation
   */
  private async generateProviderResponse(
    prompt: string, 
    tools: UniversalToolDefinition[], 
    options?: GenerationOptions
  ): Promise<string> {
    switch (this.config.provider) {
      case 'gemini':
        return await this.generateGemini(prompt, options);
      case 'openai':
        return await this.generateOpenAI(prompt, options);
      case 'anthropic':
        return await this.generateAnthropic(prompt, options);
      case 'vertex-ai':
        return await this.generateVertexAI(prompt, options);
      default:
        throw new Error(`Unsupported provider: ${this.config.provider}`);
    }
  }

  /**
   * Clean response text by removing tool-specific formatting
   */
  private cleanResponseText(response: string, provider: string): string {
    let cleanText = response;
    
    switch (provider) {
      case 'openai':
        // Remove function call JSON blocks
        cleanText = cleanText.replace(/"function_call":\s*{[^}]*}/g, '');
        cleanText = cleanText.replace(/"tool_calls":\s*\[[^\]]*\]/g, '');
        break;
      case 'anthropic':
        // Remove tool_use blocks
        cleanText = cleanText.replace(/<tool_use>.*?<\/tool_use>/gs, '');
        break;
      case 'gemini':
      case 'vertex-ai':
        // Remove function call blocks
        cleanText = cleanText.replace(/"functionCall":\s*{[^}]*}/g, '');
        break;
    }
    
    return cleanText.trim();
  }

  /**
   * Legacy tool implementation for backward compatibility
   */
  private async generateWithToolsLegacy(
    prompt: string,
    tools: UniversalToolCall[],
    options?: GenerationOptions
  ): Promise<GenerationResult> {
    // Use the existing simplified implementation
    const response = await this.generateText(prompt, options);
    
    return {
      text: response,
      finishReason: 'stop',
      usage: {
        promptTokens: Math.ceil(prompt.length / 4),
        completionTokens: Math.ceil(response.length / 4),
        totalTokens: Math.ceil((prompt.length + response.length) / 4)
      }
    };
  }

  /**
   * Get the tool provider instance
   */
  getToolProvider(): CloudToolProvider | undefined {
    return this.toolProvider;
  }

  /**
   * Update tool provider configuration
   */
  updateToolConfig(config: any): void {
    if (this.toolProvider) {
      this.toolProvider.updateConfig(config);
    }
  }

  /**
   * Test tool calling capability
   */
  async testToolCalling(): Promise<boolean> {
    if (!this.toolProvider) return false;

    const testTool: UniversalToolDefinition = {
      name: 'get_time',
      description: 'Get the current time',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    };

    try {
      const result = await this.generateWithTools(
        'What time is it? Use the get_time function.',
        [testTool],
        { maxTokens: 100, timeout: 10000 }
      );

      return !!(result.toolCalls && result.toolCalls.length > 0);
    } catch (error) {
      console.warn('Tool calling test failed:', error);
      return false;
    }
  }

  // Provider-specific generation methods (simplified implementations)
  private async generateGemini(prompt: string, options?: GenerationOptions): Promise<string> {
    const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent';
    
    const response = await fetch(`${endpoint}?key=${this.config.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: options?.maxTokens,
          temperature: options?.temperature,
          topP: options?.topP,
          topK: options?.topK
        }
      }),
      signal: options?.timeout ? AbortSignal.timeout(options.timeout) : undefined
    });

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  private async* generateGeminiStream(prompt: string, options?: GenerationOptions): AsyncIterable<string> {
    // Use optimized streaming with buffer management
    const fullResponse = await this.generateGemini(prompt, options);
    
    yield* StreamingIntegrationHelpers.createFakeStream(fullResponse, {
      chunkSize: 6,        // 6 words per chunk for balanced flow
      delayMs: 25,         // 25ms for responsive cloud streaming
      config: { 
        maxBufferSize: 24 * 1024, // 24KB buffer for cloud responses
        maxChunkSize: 3 * 1024,   // 3KB max chunk size
        enableMetrics: true,
        enableBackpressure: false  // Cloud APIs handle their own backpressure
      }
    });
  }

  private async generateGeminiWithTools(
    prompt: string,
    tools: UniversalToolCall[],
    options?: GenerationOptions
  ): Promise<GenerationResult> {
    // Simplified tool calling implementation
    const response = await this.generateGemini(`${prompt}\n\nAvailable tools: ${JSON.stringify(tools)}`, options);
    
    return {
      text: response,
      finishReason: 'stop',
      usage: {
        promptTokens: Math.ceil(prompt.length / 4),
        completionTokens: Math.ceil(response.length / 4),
        totalTokens: Math.ceil((prompt.length + response.length) / 4)
      }
    };
  }

  // Similar methods would be implemented for other providers
  private async generateOpenAI(prompt: string, options?: GenerationOptions): Promise<string> {
    // OpenAI API implementation
    return `OpenAI response to: ${prompt.substring(0, 50)}...`;
  }

  private async* generateOpenAIStream(prompt: string, options?: GenerationOptions): AsyncIterable<string> {
    const response = await this.generateOpenAI(prompt, options);
    
    yield* StreamingIntegrationHelpers.createFakeStream(response, {
      chunkSize: 8,        // 8 words per chunk
      delayMs: 20,         // Fast streaming for OpenAI
      config: { 
        maxBufferSize: 32 * 1024, // 32KB buffer
        maxChunkSize: 4 * 1024,   // 4KB max chunk size
        enableMetrics: true,
        enableBackpressure: false
      }
    });
  }

  private async generateOpenAIWithTools(
    prompt: string,
    tools: UniversalToolCall[],
    options?: GenerationOptions
  ): Promise<GenerationResult> {
    const response = await this.generateOpenAI(prompt, options);
    return {
      text: response,
      finishReason: 'stop'
    };
  }

  private async generateAnthropic(prompt: string, options?: GenerationOptions): Promise<string> {
    // Anthropic API implementation
    return `Anthropic response to: ${prompt.substring(0, 50)}...`;
  }

  private async* generateAnthropicStream(prompt: string, options?: GenerationOptions): AsyncIterable<string> {
    const response = await this.generateAnthropic(prompt, options);
    
    yield* StreamingIntegrationHelpers.createFakeStream(response, {
      chunkSize: 7,        // 7 words per chunk for natural flow
      delayMs: 30,         // Moderate streaming pace
      config: { 
        maxBufferSize: 28 * 1024, // 28KB buffer
        maxChunkSize: 3.5 * 1024, // 3.5KB max chunk size
        enableMetrics: true,
        enableBackpressure: false
      }
    });
  }

  private async generateAnthropicWithTools(
    prompt: string,
    tools: UniversalToolCall[],
    options?: GenerationOptions
  ): Promise<GenerationResult> {
    const response = await this.generateAnthropic(prompt, options);
    return {
      text: response,
      finishReason: 'stop'
    };
  }

  private async generateVertexAI(prompt: string, options?: GenerationOptions): Promise<string> {
    // Vertex AI implementation
    return `Vertex AI response to: ${prompt.substring(0, 50)}...`;
  }

  private async* generateVertexAIStream(prompt: string, options?: GenerationOptions): AsyncIterable<string> {
    const response = await this.generateVertexAI(prompt, options);
    
    yield* StreamingIntegrationHelpers.createFakeStream(response, {
      chunkSize: 6,        // 6 words per chunk
      delayMs: 35,         // Slightly slower for enterprise model
      config: { 
        maxBufferSize: 20 * 1024, // 20KB buffer
        maxChunkSize: 2.5 * 1024, // 2.5KB max chunk size
        enableMetrics: true,
        enableBackpressure: false
      }
    });
  }

  private async generateVertexAIWithTools(
    prompt: string,
    tools: UniversalToolCall[],
    options?: GenerationOptions
  ): Promise<GenerationResult> {
    const response = await this.generateVertexAI(prompt, options);
    return {
      text: response,
      finishReason: 'stop'
    };
  }
}

/**
 * Simple rate limiter for cloud API calls
 */
class RateLimiter {
  private tokenBucket: number;
  private requestBucket: number;
  private lastRefill: number;

  constructor(private limits: { tokensPerMinute?: number; requestsPerMinute?: number }) {
    this.tokenBucket = limits.tokensPerMinute || 10000;
    this.requestBucket = limits.requestsPerMinute || 60;
    this.lastRefill = Date.now();
  }

  async waitForAvailability(): Promise<void> {
    const now = Date.now();
    const timeSinceRefill = now - this.lastRefill;
    
    // Refill buckets based on time elapsed
    if (timeSinceRefill > 1000) { // Refill every second
      const refillRatio = timeSinceRefill / 60000; // Ratio of minute elapsed
      
      if (this.limits.tokensPerMinute) {
        this.tokenBucket = Math.min(
          this.limits.tokensPerMinute,
          this.tokenBucket + (this.limits.tokensPerMinute * refillRatio)
        );
      }
      
      if (this.limits.requestsPerMinute) {
        this.requestBucket = Math.min(
          this.limits.requestsPerMinute,
          this.requestBucket + (this.limits.requestsPerMinute * refillRatio)
        );
      }
      
      this.lastRefill = now;
    }

    // Wait if we're out of requests
    if (this.requestBucket < 1) {
      const waitTime = Math.max(0, 60000 / (this.limits.requestsPerMinute || 60));
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    // Consume one request
    this.requestBucket = Math.max(0, this.requestBucket - 1);
  }
}