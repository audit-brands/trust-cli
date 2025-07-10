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

    // Create Express server
    const express = await import('express');
    const cors = await import('cors');
    const app = express.default();

    // Middleware
    app.use(express.json({ limit: '10mb' }));
    
    if (serverConfig.cors) {
      app.use(cors.default({
        origin: true,
        credentials: true,
      }));
    }

    // API Key middleware
    if (serverConfig.apiKey) {
      app.use('/v1/*', (req: any, res: any, next: any) => {
        const authHeader = req.headers.authorization;
        const providedKey = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
        
        if (!providedKey || providedKey !== serverConfig.apiKey) {
          return res.status(401).json({
            error: {
              message: 'Invalid API key',
              type: 'authentication_error',
              code: 'invalid_api_key'
            }
          });
        }
        next();
      });
    }

    // Routes
    app.post('/v1/chat/completions', async (req: any, res: any) => {
      try {
        const response = await this.handleChatCompletion(req.body);
        res.json(response);
      } catch (error) {
        res.status(400).json({
          error: {
            message: error instanceof Error ? error.message : 'Unknown error',
            type: 'invalid_request_error',
            code: 'bad_request'
          }
        });
      }
    });

    app.get('/v1/models', async (req: any, res: any) => {
      try {
        const response = await this.handleModelsRequest();
        res.json(response);
      } catch (error) {
        res.status(500).json({
          error: {
            message: error instanceof Error ? error.message : 'Unknown error',
            type: 'api_error',
            code: 'internal_error'
          }
        });
      }
    });

    app.get('/health', async (req: any, res: any) => {
      try {
        const health = await this.getHealth();
        res.json(health);
      } catch (error) {
        res.status(500).json({
          error: {
            message: error instanceof Error ? error.message : 'Unknown error',
            type: 'api_error',
            code: 'internal_error'
          }
        });
      }
    });

    app.get('/status', async (req: any, res: any) => {
      try {
        const status = await this.getStatus();
        res.json(status);
      } catch (error) {
        res.status(500).json({
          error: {
            message: error instanceof Error ? error.message : 'Unknown error',
            type: 'api_error',
            code: 'internal_error'
          }
        });
      }
    });

    // OpenAI compatibility - model info endpoint
    app.get('/v1/models/:model', async (req: any, res: any) => {
      try {
        const models = await this.ollamaClient.listModels();
        const model = models.find(m => m === req.params.model);
        
        if (!model) {
          return res.status(404).json({
            error: {
              message: 'Model not found',
              type: 'invalid_request_error',
              code: 'model_not_found'
            }
          });
        }

        res.json({
          id: model,
          object: 'model',
          created: Date.now(),
          owned_by: 'ollama',
          permission: [],
          root: model,
          parent: null
        });
      } catch (error) {
        res.status(500).json({
          error: {
            message: error instanceof Error ? error.message : 'Unknown error',
            type: 'api_error',
            code: 'internal_error'
          }
        });
      }
    });

    // Catch-all for unsupported endpoints
    app.all('*', (req: any, res: any) => {
      res.status(404).json({
        error: {
          message: `The endpoint ${req.method} ${req.path} is not supported.`,
          type: 'invalid_request_error',
          code: 'unsupported_endpoint'
        }
      });
    });

    // Start the server
    this.server = app.listen(port, host, () => {
      console.log(`✅ API server running at http://${host}:${port}`);
      console.log(`📋 Endpoints available:`);
      console.log(`   POST /v1/chat/completions     # OpenAI chat completions`);
      console.log(`   GET  /v1/models               # List available models`);
      console.log(`   GET  /v1/models/{id}          # Get model details`);
      console.log(`   GET  /health                  # Health check`);
      console.log(`   GET  /status                  # Server status`);
    });

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
      
      // Get available tools from registry if tools are requested
      let tools: ToolDefinition[] | undefined;
      if (request.tools && request.tools.length > 0) {
        // Use provided tools (OpenAI format)
        tools = request.tools;
      } else {
        // Auto-include Trust CLI tools
        try {
          const availableTools = this.toolRegistry.getAllTools();
          tools = availableTools.map((tool: any) => ({
            type: 'function' as const,
            function: {
              name: tool.name,
              description: tool.description,
              parameters: tool.parameters || {
                type: 'object',
                properties: {},
                required: []
              }
            }
          }));
        } catch (error) {
          console.warn('Failed to load Trust CLI tools:', error);
          tools = undefined;
        }
      }
      
      // Execute chat completion with tools
      const response = await this.ollamaClient.chatCompletion(
        ollamaMessages,
        tools,
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
      const tools = this.toolRegistry.getAllTools();
      return tools.map((tool: any) => tool.name);
    } catch (error) {
      console.error('Error getting available tools:', error);
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