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
        throw new Error(`Ollama API error: ${response.statusText}`);
      }

      const data = await response.json();
      return data.response || '';

    } catch (error) {
      throw new Error(`Generation failed: ${error}`);
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

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.trim()) {
              try {
                const data = JSON.parse(line);
                if (data.response) {
                  yield data.response;
                }
                if (data.done) {
                  return;
                }
              } catch {
                // Skip invalid JSON lines
              }
            }
          }
        }
      } finally {
        reader.releaseLock();
      }

    } catch (error) {
      throw new Error(`Streaming generation failed: ${error}`);
    }
  }

  async generateWithTools(
    prompt: string,
    tools: UniversalToolCall[],
    options?: GenerationOptions
  ): Promise<GenerationResult> {
    this.ensureInitialized();

    if (!this._capabilities.supportsToolCalling) {
      throw new Error('This model does not support tool calling');
    }

    // Format tools as XML for Ollama (following the XML format from universalToolInterface)
    const toolsXml = tools.map(tool => 
      `<tool name="${tool.name}">${tool.description}</tool>`
    ).join('\n');

    const enhancedPrompt = `${prompt}

Available tools:
${toolsXml}

Use tools by responding with XML in this format:
<tool_call>
<name>tool_name</name>
<arguments>
<arg_name>value</arg_name>
</arguments>
</tool_call>`;

    try {
      const response = await this.generateText(enhancedPrompt, options);
      
      // Parse tool calls from response (simplified XML parsing)
      const toolCallRegex = /<tool_call>\s*<name>(.*?)<\/name>\s*<arguments>(.*?)<\/arguments>\s*<\/tool_call>/gs;
      const toolCalls: UniversalToolCall[] = [];
      let match;

      while ((match = toolCallRegex.exec(response)) !== null) {
        const name = match[1].trim();
        const argsXml = match[2];
        
        // Simple argument parsing
        const args: Record<string, any> = {};
        const argRegex = /<(\w+)>(.*?)<\/\1>/gs;
        let argMatch;
        while ((argMatch = argRegex.exec(argsXml)) !== null) {
          args[argMatch[1]] = argMatch[2].trim();
        }

        toolCalls.push({
          id: `tool_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          name,
          arguments: args,
          description: tools.find(t => t.name === name)?.description || ''
        });
      }

      // Clean response text (remove tool calls)
      const cleanText = response.replace(toolCallRegex, '').trim();

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
}