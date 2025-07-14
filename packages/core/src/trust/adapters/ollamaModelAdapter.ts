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
  ModelHealth,
  UnifiedModelInterface
} from '../unifiedModelInterface.js';
import { UniversalToolCall } from '../universalToolInterface.js';
import { StreamingIntegrationHelpers } from '../streamingBufferManager.js';
import { executeWithRecovery } from '../errorRecoveryDecorators.js';
import { OllamaToolProvider, createOllamaToolProvider } from '../ollamaToolProvider.js';
import { UniversalToolDefinition } from '../universalToolInterface.js';

/**
 * Ollama-specific model context implementation
 */
class OllamaModelContext implements ModelContext {
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
    
    // Simple token management (keep within context size)
    while (this.getTokenCount() > this.contextSize * 0.9) {
      // Remove oldest non-system messages
      const firstNonSystem = this.messages.findIndex(m => m.role !== 'system');
      if (firstNonSystem > 0) {
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
    // Rough estimation: 4 chars per token
    return Math.ceil(
      this.messages.reduce((total, msg) => total + msg.content.length, 0) / 4
    );
  }

  clone(): ModelContext {
    const cloned = new OllamaModelContext(
      this.id + '_clone',
      this.modelName,
      this.contextSize
    );
    cloned.messages = [...this.messages];
    return cloned;
  }
}

/**
 * Ollama model adapter implementing the unified interface
 */
export class OllamaModelAdapter extends BaseUnifiedModel {
  private endpoint: string;
  private client?: any; // Ollama client would be injected
  private toolProvider: OllamaToolProvider;

  constructor(
    name: string,
    type: string,
    endpoint: string = 'http://localhost:11434',
    capabilities?: Partial<ModelCapabilities>
  ) {
    const defaultCapabilities: ModelCapabilities = {
      supportsToolCalling: true, // Most Ollama models support function calling via XML
      supportsStreaming: true,
      supportsSystemPrompts: true,
      supportsImageInput: false, // Depends on specific model
      supportsAudio: false,
      maxContextSize: 4096, // Default, can be overridden
      preferredToolFormat: 'xml',
      ...capabilities
    };

    super(name, 'ollama', type, defaultCapabilities);
    this.endpoint = endpoint;
    
    // Initialize tool provider with XML format (Ollama's strength)
    this.toolProvider = createOllamaToolProvider({
      format: 'xml',
      enableChaining: true,
      errorRecovery: {
        retryInvalidCalls: true,
        fallbackToNatural: true,
        maxRetries: 2
      }
    });
  }

  protected async doInitialize(): Promise<void> {
    // Initialize Ollama client connection
    try {
      const response = await fetch(`${this.endpoint}/api/tags`);
      if (!response.ok) {
        throw new Error(`Ollama service not available at ${this.endpoint}`);
      }
      
      const data = await response.json();
      const model = data.models?.find((m: any) => m.name === this.name);
      if (!model) {
        throw new Error(`Model ${this.name} not found in Ollama`);
      }

      // Update capabilities based on model info
      if (model.details?.families?.includes('vision')) {
        this._capabilities.supportsImageInput = true;
      }
      
      if (model.details?.parameter_size) {
        // Estimate context size based on parameter size
        const paramSize = model.details.parameter_size;
        if (paramSize.includes('70b') || paramSize.includes('34b')) {
          this._capabilities.maxContextSize = 8192;
        } else if (paramSize.includes('13b') || paramSize.includes('7b')) {
          this._capabilities.maxContextSize = 4096;
        } else {
          this._capabilities.maxContextSize = 2048;
        }
      }

    } catch (error) {
      throw new Error(`Failed to initialize Ollama model: ${error}`);
    }
  }

  protected async doDispose(): Promise<void> {
    // Clean up any resources
    this.client = undefined;
  }

  async generateText(prompt: string, options?: GenerationOptions): Promise<string> {
    return executeWithRecovery(
      async () => this._generateTextInternal(prompt, options),
      {
        operationName: 'ollama.generateText',
        category: 'model',
        enableCircuitBreaker: true,
        customStrategy: {
          maxRetries: 3,
          baseDelay: 1000,
          fallbackOptions: ['cached_response', 'alternative_model']
        }
      }
    );
  }

  private async _generateTextInternal(prompt: string, options?: GenerationOptions): Promise<string> {
    this.ensureInitialized();

    const requestBody = {
      model: this.name,
      prompt,
      stream: false,
      options: {
        temperature: options?.temperature ?? 0.7,
        top_p: options?.topP,
        top_k: options?.topK,
        num_predict: options?.maxTokens,
        stop: options?.stopSequences
      }
    };

    try {
      const response = await fetch(`${this.endpoint}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: options?.timeout ? AbortSignal.timeout(options.timeout) : undefined
      });

      if (!response.ok) {
        // Classify errors for better recovery
        if (response.status === 429) {
          throw new Error(`Rate limit exceeded: ${response.statusText}`);
        } else if (response.status >= 500) {
          throw new Error(`Server error: ${response.statusText}`);
        } else if (response.status === 404) {
          throw new Error(`Model not found: ${this.name}`);
        } else {
          throw new Error(`Ollama API error: ${response.statusText}`);
        }
      }

      const data = await response.json();
      return data.response || '';

    } catch (error) {
      // Re-throw with better error categorization
      if (error instanceof Error) {
        if (error.message.includes('fetch')) {
          throw new Error(`Network error: ${error.message}`);
        } else if (error.message.includes('timeout')) {
          throw new Error(`Request timeout: ${error.message}`);
        }
      }
      throw error;
    }
  }

  async* generateTextStream(prompt: string, options?: GenerationOptions): AsyncIterable<string> {
    this.ensureInitialized();

    const requestBody = {
      model: this.name,
      prompt,
      stream: true,
      options: {
        temperature: options?.temperature ?? 0.7,
        top_p: options?.topP,
        top_k: options?.topK,
        num_predict: options?.maxTokens,
        stop: options?.stopSequences
      }
    };

    try {
      const response = await fetch(`${this.endpoint}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: options?.timeout ? AbortSignal.timeout(options.timeout) : undefined
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.statusText}`);
      }

      // Use optimized streaming buffer manager for better performance
      yield* StreamingIntegrationHelpers.enhanceOllamaStream(response, {
        maxBufferSize: 32 * 1024, // 32KB for faster response
        maxChunkSize: 8 * 1024,   // 8KB chunks
        enableBackpressure: true,
        enableMetrics: true
      });

    } catch (error) {
      throw new Error(`Streaming generation failed: ${error}`);
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
        operationName: 'ollama.generateWithTools',
        category: 'tool_execution',
        enableCircuitBreaker: true,
        customStrategy: {
          maxRetries: 2,
          baseDelay: 1000,
          fallbackOptions: ['natural_language', 'simplified_tools']
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

    if (!this._capabilities.supportsToolCalling) {
      throw new Error('This model does not support tool calling');
    }

    // Convert UniversalToolCall[] to UniversalToolDefinition[] if needed
    const toolDefinitions: UniversalToolDefinition[] = tools.map(tool => {
      if ('parameters' in tool) {
        // Already a UniversalToolDefinition
        return tool as UniversalToolDefinition;
      } else {
        // Convert UniversalToolCall to UniversalToolDefinition
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

    // Generate tool prompt using the universal provider
    const toolPrompt = this.toolProvider.getToolPrompt(toolDefinitions);
    const enhancedPrompt = `${prompt}\n\n${toolPrompt}`;

    try {
      const response = await this._generateTextInternal(enhancedPrompt, options);
      
      // Parse tool calls using the universal provider
      const toolCalls = this.toolProvider.parseToolCalls(response);

      // Clean response text (remove tool call XML/JSON)
      let cleanText = response;
      if (toolCalls.length > 0) {
        // Remove function_calls blocks
        cleanText = cleanText.replace(/<function_calls>.*?<\/function_calls>/gs, '');
        // Remove tool_call blocks
        cleanText = cleanText.replace(/<tool_call>.*?<\/tool_call>/gs, '');
        // Remove JSON blocks
        cleanText = cleanText.replace(/```json.*?```/gs, '');
        cleanText = cleanText.trim();
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

    const contextId = options?.conversationId || `ollama_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const contextSize = options?.contextSize || this._capabilities.maxContextSize;

    return new OllamaModelContext(
      contextId,
      this.name,
      contextSize,
      options?.systemPrompt
    );
  }

  async getHealth(): Promise<ModelHealth> {
    try {
      const startTime = Date.now();
      
      // Test basic connectivity
      const response = await fetch(`${this.endpoint}/api/tags`, {
        signal: AbortSignal.timeout(5000)
      });

      if (!response.ok) {
        return {
          status: 'unavailable',
          lastChecked: new Date(),
          issues: [`Ollama service returned ${response.status}`]
        };
      }

      const latency = Date.now() - startTime;
      const data = await response.json();
      
      // Check if our specific model is available
      const modelExists = data.models?.some((m: any) => m.name === this.name);
      
      if (!modelExists) {
        return {
          status: 'unavailable',
          lastChecked: new Date(),
          issues: [`Model ${this.name} not found in Ollama`]
        };
      }

      // Determine health status based on latency
      const status = latency < 1000 ? 'healthy' : latency < 3000 ? 'degraded' : 'unavailable';

      return {
        status,
        latency,
        lastChecked: new Date(),
        issues: status === 'degraded' ? [`High latency: ${latency}ms`] : undefined
      };

    } catch (error) {
      return {
        status: 'unavailable',
        lastChecked: new Date(),
        issues: [error instanceof Error ? error.message : String(error)]
      };
    }
  }

  /**
   * Get the tool provider instance
   */
  getToolProvider(): OllamaToolProvider {
    return this.toolProvider;
  }

  /**
   * Update tool provider configuration
   */
  updateToolConfig(config: any): void {
    this.toolProvider.updateConfig(config);
  }

  /**
   * Test tool calling with a simple tool
   */
  async testToolCalling(): Promise<boolean> {
    const testTool: UniversalToolDefinition = {
      name: 'test_tool',
      description: 'A simple test tool that returns the current time',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    };

    try {
      const result = await this.generateWithTools(
        'Please use the test_tool to get the current time',
        [testTool],
        { maxTokens: 100, timeout: 10000 }
      );

      return !!(result.toolCalls && result.toolCalls.length > 0);
    } catch (error) {
      console.warn('Tool calling test failed:', error);
      return false;
    }
  }

  /**
   * Get supported tool formats
   */
  getSupportedToolFormats(): string[] {
    return this.toolProvider.getSupportedFormats();
  }
}