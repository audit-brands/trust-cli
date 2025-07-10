/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { OllamaClient, OllamaConfig, ToolDefinition, OllamaMessage } from './ollamaClient.js';
import { ToolRegistry } from '../tools/tool-registry.js';
import { Config } from '../config/config.js';

export interface ApiServerConfig {
  port?: number;
  host?: string;
  cors?: boolean;
  apiKey?: string;
  rateLimit?: {
    requests: number;
    window: number; // in milliseconds
  };
}

export interface ApiRequest {
  model?: string;
  messages: OllamaMessage[];
  tools?: ToolDefinition[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stop?: string[];
}

export interface ApiResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
      tool_calls?: Array<{
        id: string;
        type: 'function';
        function: {
          name: string;
          arguments: string;
        };
      }>;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * OpenAI-compatible API server for Ollama
 * Provides REST endpoints matching OpenAI's chat completions API
 */
export class OllamaApiServer {
  private ollamaClient: OllamaClient;
  private toolRegistry: ToolRegistry;
  private config: Config;
  private server?: any; // HTTP server instance
  private isRunning = false;
  private requestCount = 0;
  private rateLimitMap = new Map<string, { count: number; window: number }>();

  constructor(
    config: Config,
    toolRegistry: ToolRegistry,
    ollamaConfig: OllamaConfig = {},
    serverConfig: ApiServerConfig = {}
  ) {
    this.config = config;
    this.toolRegistry = toolRegistry;
    this.ollamaClient = new OllamaClient(ollamaConfig);
  }

  /**
   * Start the API server
   */
  async start(serverConfig: ApiServerConfig = {}): Promise<void> {
    if (this.isRunning) {
      throw new Error('Server is already running');
    }

    const port = serverConfig.port || 8080;
    const host = serverConfig.host || 'localhost';

    // Check if Ollama is available
    const isConnected = await this.ollamaClient.checkConnection();
    if (!isConnected) {
      throw new Error('Ollama is not running. Please start Ollama with: ollama serve');
    }

    console.log(`🚀 Starting OpenAI-compatible API server on ${host}:${port}`);
    console.log(`📡 Proxying to Ollama at http://localhost:11434`);
    console.log(`🛠️  Tool calling enabled with ${await this.getToolCount()} tools`);

    // In a real implementation, you would use Express.js or similar
    // For now, we'll create a placeholder that shows the structure
    console.log(`✅ API server would be running at http://${host}:${port}`);
    console.log(`📋 Endpoints available:`);
    console.log(`   POST /v1/chat/completions     # OpenAI chat completions`);
    console.log(`   GET  /v1/models               # List available models`);
    console.log(`   GET  /health                  # Health check`);
    console.log(`   GET  /status                  # Server status`);

    this.isRunning = true;
  }

  /**
   * Stop the API server
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    console.log('🛑 Stopping API server...');
    
    // Close server if running
    if (this.server) {
      await new Promise<void>((resolve) => {
        this.server.close(() => {
          console.log('✅ API server stopped');
          resolve();
        });
      });
    }

    this.isRunning = false;
  }

  /**
   * Handle chat completions request
   */
  async handleChatCompletion(request: ApiRequest): Promise<ApiResponse> {
    // Validate request
    if (!request.messages || request.messages.length === 0) {
      throw new Error('Messages array is required and cannot be empty');
    }

    // Apply rate limiting
    if (!this.checkRateLimit('chat')) {
      throw new Error('Rate limit exceeded');
    }

    try {
      // Convert OpenAI format to Ollama format
      const ollamaMessages = this.convertToOllamaMessages(request.messages);
      
      // Execute chat completion with tools
      const response = await this.ollamaClient.chatCompletion(
        ollamaMessages,
        request.tools,
        {
          temperature: request.temperature || 0.7,
          maxTokens: request.max_tokens || 1000,
        }
      );

      // Convert back to OpenAI format
      return this.convertToApiResponse(response, request.model || 'ollama');
    } catch (error) {
      console.error('Error in chat completion:', error);
      throw new Error(`Chat completion failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Handle models list request
   */
  async handleModelsRequest(): Promise<{ object: string; data: Array<{ id: string; object: string; created: number; owned_by: string }> }> {
    try {
      const models = await this.ollamaClient.listModels();
      
      return {
        object: 'list',
        data: models.map((model) => ({
          id: model,
          object: 'model',
          created: Date.now(),
          owned_by: 'ollama',
        })),
      };
    } catch (error) {
      console.error('Error listing models:', error);
      throw new Error(`Failed to list models: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get server health status
   */
  async getHealth(): Promise<{ status: string; ollama: boolean; models: number; tools: number; uptime: number }> {
    const ollamaConnected = await this.ollamaClient.checkConnection();
    const models = ollamaConnected ? await this.ollamaClient.listModels() : [];
    const toolCount = await this.getToolCount();

    return {
      status: 'ok',
      ollama: ollamaConnected,
      models: models.length,
      tools: toolCount,
      uptime: process.uptime(),
    };
  }

  /**
   * Get detailed server status
   */
  async getStatus(): Promise<{
    server: { running: boolean; requests: number };
    ollama: { connected: boolean; models: string[] };
    tools: { count: number; available: string[] };
    performance: any;
  }> {
    const ollamaConnected = await this.ollamaClient.checkConnection();
    const models = ollamaConnected ? await this.ollamaClient.listModels() : [];
    const tools = await this.getAvailableTools();
    const performance = await this.ollamaClient.getStatus();

    return {
      server: {
        running: this.isRunning,
        requests: this.requestCount,
      },
      ollama: {
        connected: ollamaConnected,
        models,
      },
      tools: {
        count: tools.length,
        available: tools,
      },
      performance: performance.performance,
    };
  }

  /**
   * Convert OpenAI messages to Ollama format
   */
  private convertToOllamaMessages(messages: any[]): OllamaMessage[] {
    return messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
      tool_calls: msg.tool_calls,
      tool_call_id: msg.tool_call_id,
      name: msg.name,
    }));
  }

  /**
   * Convert Ollama response to OpenAI format
   */
  private convertToApiResponse(response: any, model: string): ApiResponse {
    const id = `chatcmpl-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    return {
      id,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: response.content,
            tool_calls: response.toolCalls?.map((tc: any) => ({
              id: tc.id || `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              type: 'function' as const,
              function: {
                name: tc.name,
                arguments: JSON.stringify(tc.args || {}),
              },
            })),
          },
          finish_reason: response.finishReason || 'stop',
        },
      ],
      usage: response.usage || {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0,
      },
    };
  }

  /**
   * Check rate limiting
   */
  private checkRateLimit(endpoint: string, limit = 60, window = 60000): boolean {
    const now = Date.now();
    const key = endpoint;
    const current = this.rateLimitMap.get(key) || { count: 0, window: now };

    // Reset if window expired
    if (now - current.window > window) {
      current.count = 0;
      current.window = now;
    }

    // Check limit
    if (current.count >= limit) {
      return false;
    }

    // Increment counter
    current.count++;
    this.rateLimitMap.set(key, current);
    this.requestCount++;

    return true;
  }

  /**
   * Get available tool count
   */
  private async getToolCount(): Promise<number> {
    try {
      const tools = await this.getAvailableTools();
      return tools.length;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Get available tools list
   */
  private async getAvailableTools(): Promise<string[]> {
    try {
      // This would integrate with the actual tool registry
      return ['file_system', 'shell', 'web_search', 'memory']; // Example tools
    } catch (error) {
      return [];
    }
  }

  /**
   * Check if server is running
   */
  isServerRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Get request count
   */
  getRequestCount(): number {
    return this.requestCount;
  }
}