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

/**
 * HuggingFace-specific model context implementation
 */
class HuggingFaceModelContext implements ModelContext {
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
    
    // Manage context size
    while (this.getTokenCount() > this.contextSize * 0.9) {
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
    return Math.ceil(
      this.messages.reduce((total, msg) => total + msg.content.length, 0) / 4
    );
  }

  clone(): ModelContext {
    const cloned = new HuggingFaceModelContext(
      this.id + '_clone',
      this.modelName,
      this.contextSize
    );
    cloned.messages = [...this.messages];
    return cloned;
  }
}

/**
 * HuggingFace model adapter implementing the unified interface
 */
export class HuggingFaceModelAdapter extends BaseUnifiedModel {
  private modelPath: string;
  private client?: any; // Would be node-llama-cpp or similar

  constructor(
    name: string,
    type: string,
    modelPath: string,
    capabilities?: Partial<ModelCapabilities>
  ) {
    const defaultCapabilities: ModelCapabilities = {
      supportsToolCalling: true, // Modern HF models support function calling
      supportsStreaming: true,
      supportsSystemPrompts: true,
      supportsImageInput: false, // Depends on specific model
      supportsAudio: false,
      maxContextSize: 4096,
      preferredToolFormat: 'json', // HF models typically prefer JSON
      ...capabilities
    };

    super(name, 'huggingface', type, defaultCapabilities);
    this.modelPath = modelPath;
  }

  protected async doInitialize(): Promise<void> {
    try {
      // Import and initialize node-llama-cpp or similar
      // This would be the actual HF model loading logic
      const fs = await import('fs/promises');
      
      // Check if model file exists
      try {
        await fs.access(this.modelPath);
      } catch {
        throw new Error(`Model file not found: ${this.modelPath}`);
      }

      // Here we would initialize the actual HF model
      // For now, we'll simulate successful initialization
      console.log(`Initializing HuggingFace model: ${this.name} at ${this.modelPath}`);

      // Update capabilities based on model analysis
      const stats = await fs.stat(this.modelPath);
      const sizeMB = stats.size / (1024 * 1024);

      // Estimate context size based on model size
      if (sizeMB > 10000) { // 10GB+
        this._capabilities.maxContextSize = 8192;
      } else if (sizeMB > 5000) { // 5GB+
        this._capabilities.maxContextSize = 4096;
      } else {
        this._capabilities.maxContextSize = 2048;
      }

      // Check for vision capabilities based on model name
      if (this.name.includes('vision') || this.name.includes('clip')) {
        this._capabilities.supportsImageInput = true;
      }

    } catch (error) {
      throw new Error(`Failed to initialize HuggingFace model: ${error}`);
    }
  }

  protected async doDispose(): Promise<void> {
    // Clean up model resources
    if (this.client) {
      // Dispose of model instance
      this.client = undefined;
    }
  }

  async generateText(prompt: string, options?: GenerationOptions): Promise<string> {
    this.ensureInitialized();

    try {
      // Simulate HuggingFace model generation
      // In a real implementation, this would use node-llama-cpp or similar
      
      const processedPrompt = this.preprocessPrompt(prompt, options);
      
      // Simulate generation with timeout
      const timeoutPromise = options?.timeout 
        ? new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('Generation timeout')), options.timeout)
          )
        : Promise.race([]);

      const generationPromise = this.simulateGeneration(processedPrompt, options);
      
      if (options?.timeout) {
        return await Promise.race([generationPromise, timeoutPromise]);
      }
      
      return await generationPromise;

    } catch (error) {
      throw new Error(`HuggingFace generation failed: ${error}`);
    }
  }

  async* generateTextStream(prompt: string, options?: GenerationOptions): AsyncIterable<string> {
    this.ensureInitialized();

    const processedPrompt = this.preprocessPrompt(prompt, options);
    
    try {
      // Generate full response then stream it efficiently
      const fullResponse = await this.simulateGeneration(processedPrompt, options);
      
      // Use optimized fake streaming with better performance
      yield* StreamingIntegrationHelpers.createFakeStream(fullResponse, {
        chunkSize: 8,        // 8 words per chunk for better flow
        delayMs: 30,         // Reduced from 50ms to 30ms
        config: { 
          maxBufferSize: 16 * 1024, // 16KB buffer
          maxChunkSize: 2 * 1024,   // 2KB max chunk size for word-based chunking
          enableMetrics: true,
          enableBackpressure: false  // Not needed for fake streaming
        }
      });

    } catch (error) {
      throw new Error(`HuggingFace streaming failed: ${error}`);
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

    try {
      // Format tools as JSON schema for HuggingFace models
      const toolsSchema = tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.arguments || {}
      }));

      const enhancedPrompt = `${prompt}

Available functions:
${JSON.stringify(toolsSchema, null, 2)}

Respond with function calls in JSON format:
{
  "function_call": {
    "name": "function_name",
    "arguments": {"arg": "value"}
  }
}`;

      const response = await this.generateText(enhancedPrompt, {
        ...options,
        format: 'json'
      });

      // Parse JSON response for tool calls
      const toolCalls: UniversalToolCall[] = [];
      
      try {
        const parsed = JSON.parse(response);
        if (parsed.function_call) {
          toolCalls.push({
            id: `hf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name: parsed.function_call.name,
            arguments: parsed.function_call.arguments || {},
            description: tools.find(t => t.name === parsed.function_call.name)?.description || ''
          });
        }
      } catch {
        // If JSON parsing fails, try to extract tool calls from text
        const functionCallRegex = /"function_call":\s*{\s*"name":\s*"([^"]+)",\s*"arguments":\s*({[^}]*})/g;
        let match: RegExpExecArray | null;
        while ((match = functionCallRegex.exec(response)) !== null) {
          try {
            if (match) {
              const args = JSON.parse(match[2]);
              toolCalls.push({
                id: `hf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                name: match[1],
                arguments: args,
                description: tools.find(t => t.name === match![1])?.description || ''
              });
            }
          } catch {
            // Skip invalid argument JSON
          }
        }
      }

      return {
        text: toolCalls.length > 0 ? '' : response, // Return empty text if tool calls found
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

    const contextId = options?.conversationId || `hf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const contextSize = options?.contextSize || this._capabilities.maxContextSize;

    return new HuggingFaceModelContext(
      contextId,
      this.name,
      contextSize,
      options?.systemPrompt
    );
  }

  async getHealth(): Promise<ModelHealth> {
    try {
      const startTime = Date.now();
      
      // Check if model file exists and is accessible
      const fs = await import('fs/promises');
      await fs.access(this.modelPath);
      
      const latency = Date.now() - startTime;
      
      // Quick test generation to verify model is working
      try {
        await this.generateText('Test', { maxTokens: 1, timeout: 5000 });
        
        return {
          status: latency < 500 ? 'healthy' : latency < 2000 ? 'degraded' : 'unavailable',
          latency,
          lastChecked: new Date()
        };
        
      } catch (error) {
        return {
          status: 'degraded',
          latency,
          lastChecked: new Date(),
          issues: [`Generation test failed: ${error}`]
        };
      }

    } catch (error) {
      return {
        status: 'unavailable',
        lastChecked: new Date(),
        issues: [error instanceof Error ? error.message : String(error)]
      };
    }
  }

  private preprocessPrompt(prompt: string, options?: GenerationOptions): string {
    let processedPrompt = prompt;

    // Add system prompt if provided
    if (options?.systemPrompt) {
      processedPrompt = `System: ${options.systemPrompt}\n\nUser: ${prompt}`;
    }

    // Apply format-specific preprocessing
    if (options?.format === 'json') {
      processedPrompt += '\n\nRespond with valid JSON only.';
    }

    return processedPrompt;
  }

  private async simulateGeneration(prompt: string, options?: GenerationOptions): Promise<string> {
    // Simulate generation latency based on token count
    const estimatedTokens = options?.maxTokens || Math.min(prompt.length / 2, 1024);
    const latencyMs = estimatedTokens * 20; // 20ms per token simulation
    
    await new Promise(resolve => setTimeout(resolve, Math.min(latencyMs, 3000)));

    // Generate simulated response
    const responses = [
      'I understand your request. Let me help you with that.',
      'Based on the information provided, here is my response.',
      'I can assist you with this task. Here\'s what I suggest.',
      'Thank you for your question. Here\'s my analysis.'
    ];

    if (options?.format === 'json') {
      return JSON.stringify({
        response: responses[Math.floor(Math.random() * responses.length)],
        reasoning: 'This is a simulated JSON response from HuggingFace model.',
        confidence: 0.95
      });
    }

    return responses[Math.floor(Math.random() * responses.length)] + ' ' + 
           `(This is a simulated response from ${this.name} HuggingFace model)`;
  }
}