/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ToolProvider,
  UniversalToolCall,
  UniversalToolDefinition,
  UniversalToolResult
} from './universalToolInterface.js';
import { executeWithRecovery } from './errorRecoveryDecorators.js';

/**
 * Cloud provider types for tool calling
 */
export type CloudProvider = 'openai' | 'anthropic' | 'gemini' | 'vertex-ai';

/**
 * Tool calling format for different cloud providers
 */
export interface CloudToolFormat {
  /** OpenAI function calling format */
  openai_functions: 'openai_functions';
  /** OpenAI tools format (newer) */
  openai_tools: 'openai_tools';
  /** Anthropic Claude tools format */
  anthropic_tools: 'anthropic_tools';
  /** Google Gemini function calling */
  gemini_functions: 'gemini_functions';
  /** Vertex AI function calling */
  vertex_functions: 'vertex_functions';
}

/**
 * Cloud tool provider configuration
 */
export interface CloudToolConfig {
  /** Cloud provider type */
  provider: CloudProvider;
  /** Tool calling format */
  format: keyof CloudToolFormat;
  /** Maximum parallel tool calls */
  maxParallelCalls?: number;
  /** Enable streaming tool results */
  enableStreaming?: boolean;
  /** Tool choice strategy */
  toolChoice?: 'auto' | 'none' | 'required' | string;
  /** Error handling options */
  errorHandling?: {
    retryFailedCalls?: boolean;
    fallbackToText?: boolean;
    maxRetries?: number;
  };
}

/**
 * Provider-specific tool call parsers
 */
export class CloudToolProvider implements ToolProvider {
  readonly providerId: string;
  private readonly config: Required<CloudToolConfig>;

  constructor(config: CloudToolConfig) {
    this.config = {
      provider: config.provider,
      format: config.format,
      maxParallelCalls: config.maxParallelCalls ?? 5,
      enableStreaming: config.enableStreaming ?? false,
      toolChoice: config.toolChoice ?? 'auto',
      errorHandling: {
        retryFailedCalls: config.errorHandling?.retryFailedCalls ?? true,
        fallbackToText: config.errorHandling?.fallbackToText ?? true,
        maxRetries: config.errorHandling?.maxRetries ?? 2,
        ...config.errorHandling
      }
    };
    
    this.providerId = `cloud_${config.provider}`;
  }

  /**
   * Parse tool calls from cloud provider response
   */
  parseToolCalls(responseText: string): UniversalToolCall[] {
    try {
      switch (this.config.provider) {
        case 'openai':
          return this.parseOpenAIToolCalls(responseText);
        case 'anthropic':
          return this.parseAnthropicToolCalls(responseText);
        case 'gemini':
          return this.parseGeminiToolCalls(responseText);
        case 'vertex-ai':
          return this.parseVertexAIToolCalls(responseText);
        default:
          return [];
      }
    } catch (error) {
      console.warn(`Error parsing ${this.config.provider} tool calls:`, error);
      if (this.config.errorHandling.fallbackToText) {
        return this.parseTextBasedToolCalls(responseText);
      }
      return [];
    }
  }

  /**
   * Parse OpenAI-style tool calls
   */
  private parseOpenAIToolCalls(responseText: string): UniversalToolCall[] {
    const calls: UniversalToolCall[] = [];

    try {
      // Try parsing as complete JSON response
      const parsed = JSON.parse(responseText);
      
      // OpenAI function calling format
      if (parsed.function_call) {
        calls.push({
          id: this.generateId(),
          name: parsed.function_call.name,
          arguments: typeof parsed.function_call.arguments === 'string' 
            ? JSON.parse(parsed.function_call.arguments)
            : parsed.function_call.arguments,
          format: 'json'
        });
      }

      // OpenAI tools format
      if (parsed.tool_calls && Array.isArray(parsed.tool_calls)) {
        for (const toolCall of parsed.tool_calls) {
          calls.push({
            id: toolCall.id || this.generateId(),
            name: toolCall.function?.name || toolCall.name,
            arguments: typeof toolCall.function?.arguments === 'string'
              ? JSON.parse(toolCall.function.arguments)
              : toolCall.function?.arguments || toolCall.arguments || {},
            format: 'json'
          });
        }
      }

      return calls;
    } catch {
      // Fall back to pattern matching
      return this.parseJSONPatterns(responseText);
    }
  }

  /**
   * Parse Anthropic Claude tool calls
   */
  private parseAnthropicToolCalls(responseText: string): UniversalToolCall[] {
    const calls: UniversalToolCall[] = [];

    // Anthropic uses XML-like tool syntax
    const toolUsePattern = /<tool_use>(.*?)<\/tool_use>/gs;
    const matches = responseText.matchAll(toolUsePattern);

    for (const match of matches) {
      const toolXml = match[1];
      
      // Parse tool name
      const nameMatch = toolXml.match(/<name>(.*?)<\/name>/);
      if (!nameMatch) continue;
      
      const name = nameMatch[1].trim();
      
      // Parse parameters
      const paramsMatch = toolXml.match(/<parameters>(.*?)<\/parameters>/s);
      let args: Record<string, any> = {};
      
      if (paramsMatch) {
        try {
          args = JSON.parse(paramsMatch[1].trim());
        } catch {
          // Fall back to simple parameter parsing
          args = this.parseSimpleParameters(paramsMatch[1]);
        }
      }

      calls.push({
        id: this.generateId(),
        name,
        arguments: args,
        format: 'xml'
      });
    }

    return calls;
  }

  /**
   * Parse Google Gemini tool calls
   */
  private parseGeminiToolCalls(responseText: string): UniversalToolCall[] {
    const calls: UniversalToolCall[] = [];

    try {
      const parsed = JSON.parse(responseText);
      
      // Gemini function calling format
      if (parsed.functionCall) {
        calls.push({
          id: this.generateId(),
          name: parsed.functionCall.name,
          arguments: parsed.functionCall.args || {},
          format: 'json'
        });
      }

      // Gemini candidates format
      if (parsed.candidates && Array.isArray(parsed.candidates)) {
        for (const candidate of parsed.candidates) {
          if (candidate.content?.parts) {
            for (const part of candidate.content.parts) {
              if (part.functionCall) {
                calls.push({
                  id: this.generateId(),
                  name: part.functionCall.name,
                  arguments: part.functionCall.args || {},
                  format: 'json'
                });
              }
            }
          }
        }
      }

      return calls;
    } catch {
      return this.parseJSONPatterns(responseText);
    }
  }

  /**
   * Parse Vertex AI tool calls
   */
  private parseVertexAIToolCalls(responseText: string): UniversalToolCall[] {
    // Vertex AI uses similar format to Gemini
    return this.parseGeminiToolCalls(responseText);
  }

  /**
   * Parse JSON patterns from response text
   */
  private parseJSONPatterns(responseText: string): UniversalToolCall[] {
    const calls: UniversalToolCall[] = [];

    // Common JSON patterns
    const patterns = [
      // Function call pattern
      /"function_call"\s*:\s*{\s*"name"\s*:\s*"([^"]+)"/g,
      // Tool call pattern
      /"tool_calls"\s*:\s*\[\s*{\s*.*?"function"\s*:\s*{\s*"name"\s*:\s*"([^"]+)"/g,
      // Direct function pattern
      /"functionCall"\s*:\s*{\s*"name"\s*:\s*"([^"]+)"/g
    ];

    for (const pattern of patterns) {
      const matches = responseText.matchAll(pattern);
      for (const match of matches) {
        const toolName = match[1];
        const args = this.extractArgumentsFromContext(responseText, toolName);
        
        calls.push({
          id: this.generateId(),
          name: toolName,
          arguments: args,
          format: 'json'
        });
      }
    }

    return calls;
  }

  /**
   * Parse text-based tool calls as fallback
   */
  private parseTextBasedToolCalls(responseText: string): UniversalToolCall[] {
    const calls: UniversalToolCall[] = [];

    // Simple patterns for text-based parsing
    const patterns = [
      /(?:calling|using|executing)\s+(\w+)\s*\(([^)]*)\)/gi,
      /(\w+)\(([^)]*)\)/g
    ];

    for (const pattern of patterns) {
      const matches = responseText.matchAll(pattern);
      for (const match of matches) {
        const toolName = match[1];
        const argsText = match[2] || '';
        
        calls.push({
          id: this.generateId(),
          name: toolName,
          arguments: this.parseTextArguments(argsText),
          format: 'text' as any
        });
      }
    }

    return calls;
  }

  /**
   * Parse simple XML parameters
   */
  private parseSimpleParameters(paramsXml: string): Record<string, any> {
    const args: Record<string, any> = {};
    const paramPattern = /<(\w+)>(.*?)<\/\1>/g;
    const matches = paramsXml.matchAll(paramPattern);
    
    for (const match of matches) {
      const paramName = match[1];
      const paramValue = match[2].trim();
      
      try {
        args[paramName] = JSON.parse(paramValue);
      } catch {
        args[paramName] = paramValue;
      }
    }

    return args;
  }

  /**
   * Extract arguments from context around tool name
   */
  private extractArgumentsFromContext(text: string, toolName: string): Record<string, any> {
    const args: Record<string, any> = {};

    // Look for arguments pattern near the tool name
    const nameIndex = text.indexOf(toolName);
    if (nameIndex === -1) return args;

    // Look for JSON block after tool name
    const argsPattern = /"arguments"\s*:\s*({[^}]*})/;
    const paramsPattern = /"args"\s*:\s*({[^}]*})/;
    
    const context = text.substring(nameIndex, nameIndex + 500);
    
    for (const pattern of [argsPattern, paramsPattern]) {
      const match = context.match(pattern);
      if (match) {
        try {
          return JSON.parse(match[1]);
        } catch {
          continue;
        }
      }
    }

    return args;
  }

  /**
   * Parse text-based arguments
   */
  private parseTextArguments(argsText: string): Record<string, any> {
    const args: Record<string, any> = {};
    
    if (!argsText.trim()) return args;

    // Try JSON first
    try {
      return JSON.parse(`{${argsText}}`);
    } catch {
      // Fall back to simple parsing
    }

    // Key=value pairs
    const assignments = argsText.split(',');
    for (const assignment of assignments) {
      const [key, value] = assignment.split('=').map(s => s.trim());
      if (key && value) {
        args[key] = value.replace(/['"]/g, '');
      }
    }

    return args;
  }

  /**
   * Format tool definition for cloud provider
   */
  formatToolDefinition(tool: UniversalToolDefinition): any {
    switch (this.config.provider) {
      case 'openai':
        return this.formatOpenAITool(tool);
      case 'anthropic':
        return this.formatAnthropicTool(tool);
      case 'gemini':
        return this.formatGeminiTool(tool);
      case 'vertex-ai':
        return this.formatVertexAITool(tool);
      default:
        return tool;
    }
  }

  /**
   * Format tool for OpenAI
   */
  private formatOpenAITool(tool: UniversalToolDefinition): any {
    if (this.config.format === 'openai_functions') {
      return {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters
      };
    } else {
      return {
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters
        }
      };
    }
  }

  /**
   * Format tool for Anthropic
   */
  private formatAnthropicTool(tool: UniversalToolDefinition): any {
    return {
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters
    };
  }

  /**
   * Format tool for Gemini
   */
  private formatGeminiTool(tool: UniversalToolDefinition): any {
    return {
      functionDeclarations: [{
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters
      }]
    };
  }

  /**
   * Format tool for Vertex AI
   */
  private formatVertexAITool(tool: UniversalToolDefinition): any {
    return this.formatGeminiTool(tool);
  }

  /**
   * Format tool result for cloud provider
   */
  formatToolResult(result: UniversalToolResult): string {
    if (result.isError) {
      switch (this.config.provider) {
        case 'openai':
          return JSON.stringify({
            tool_call_id: result.id,
            role: 'tool',
            content: `Error: ${result.error}`
          });
        case 'anthropic':
          return `<tool_result name="${result.name}">
<error>${result.error}</error>
</tool_result>`;
        case 'gemini':
        case 'vertex-ai':
          return JSON.stringify({
            functionResponse: {
              name: result.name,
              response: { error: result.error }
            }
          });
        default:
          return `Error: ${result.error}`;
      }
    }

    switch (this.config.provider) {
      case 'openai':
        return JSON.stringify({
          tool_call_id: result.id,
          role: 'tool',
          content: typeof result.result === 'string' ? result.result : JSON.stringify(result.result)
        });
      case 'anthropic':
        return `<tool_result name="${result.name}">
${typeof result.result === 'string' ? result.result : JSON.stringify(result.result, null, 2)}
</tool_result>`;
      case 'gemini':
      case 'vertex-ai':
        return JSON.stringify({
          functionResponse: {
            name: result.name,
            response: result.result
          }
        });
      default:
        return typeof result.result === 'string' ? result.result : JSON.stringify(result.result);
    }
  }

  /**
   * Get tool usage prompt
   */
  getToolPrompt(tools: UniversalToolDefinition[]): string {
    switch (this.config.provider) {
      case 'openai':
        return this.getOpenAIToolPrompt(tools);
      case 'anthropic':
        return this.getAnthropicToolPrompt(tools);
      case 'gemini':
        return this.getGeminiToolPrompt(tools);
      case 'vertex-ai':
        return this.getVertexAIToolPrompt(tools);
      default:
        return this.getGenericToolPrompt(tools);
    }
  }

  /**
   * Get OpenAI tool prompt
   */
  private getOpenAIToolPrompt(tools: UniversalToolDefinition[]): string {
    let prompt = `You have access to the following functions. Call them using the proper JSON format.

Available functions:
`;

    for (const tool of tools) {
      const params = Object.keys(tool.parameters.properties || {}).join(', ');
      prompt += `• ${tool.name}(${params}): ${tool.description}\n`;
    }

    if (this.config.format === 'openai_functions') {
      prompt += '\nUse function_call format when calling functions.\n';
    } else {
      prompt += '\nUse tools format when calling functions.\n';
    }

    return prompt;
  }

  /**
   * Get Anthropic tool prompt
   */
  private getAnthropicToolPrompt(tools: UniversalToolDefinition[]): string {
    let prompt = `You have access to tools. Use them when needed with this format:

<tool_use>
<name>TOOL_NAME</name>
<parameters>
{"param": "value"}
</parameters>
</tool_use>

Available tools:
`;

    for (const tool of tools) {
      const params = Object.keys(tool.parameters.properties || {});
      prompt += `• ${tool.name}: ${tool.description}`;
      if (params.length > 0) {
        prompt += ` (Parameters: ${params.join(', ')})`;
      }
      prompt += '\n';
    }

    return prompt;
  }

  /**
   * Get Gemini tool prompt
   */
  private getGeminiToolPrompt(tools: UniversalToolDefinition[]): string {
    let prompt = `You have access to function calling. Use the provided functions when needed.

Available functions:
`;

    for (const tool of tools) {
      const params = Object.keys(tool.parameters.properties || {}).join(', ');
      prompt += `• ${tool.name}(${params}): ${tool.description}\n`;
    }

    prompt += '\nCall functions using the Gemini function calling format.\n';

    return prompt;
  }

  /**
   * Get Vertex AI tool prompt
   */
  private getVertexAIToolPrompt(tools: UniversalToolDefinition[]): string {
    return this.getGeminiToolPrompt(tools);
  }

  /**
   * Get generic tool prompt
   */
  private getGenericToolPrompt(tools: UniversalToolDefinition[]): string {
    let prompt = `Available tools:
`;

    for (const tool of tools) {
      const params = Object.keys(tool.parameters.properties || {}).join(', ');
      prompt += `• ${tool.name}(${params}): ${tool.description}\n`;
    }

    return prompt;
  }

  /**
   * Generate unique tool call ID
   */
  private generateId(): string {
    return `${this.config.provider}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<CloudToolConfig>): void {
    Object.assign(this.config, newConfig);
  }

  /**
   * Get current configuration
   */
  getConfig(): CloudToolConfig {
    return { ...this.config };
  }

  /**
   * Get supported providers
   */
  static getSupportedProviders(): CloudProvider[] {
    return ['openai', 'anthropic', 'gemini', 'vertex-ai'];
  }

  /**
   * Get supported formats for provider
   */
  static getSupportedFormats(provider: CloudProvider): (keyof CloudToolFormat)[] {
    switch (provider) {
      case 'openai':
        return ['openai_functions', 'openai_tools'];
      case 'anthropic':
        return ['anthropic_tools'];
      case 'gemini':
        return ['gemini_functions'];
      case 'vertex-ai':
        return ['vertex_functions'];
      default:
        return [];
    }
  }
}

/**
 * Factory functions for creating cloud tool providers
 */
export function createOpenAIToolProvider(config?: Partial<Omit<CloudToolConfig, 'provider'>>): CloudToolProvider {
  return new CloudToolProvider({
    provider: 'openai',
    format: 'openai_tools',
    ...config
  });
}

export function createAnthropicToolProvider(config?: Partial<Omit<CloudToolConfig, 'provider'>>): CloudToolProvider {
  return new CloudToolProvider({
    provider: 'anthropic',
    format: 'anthropic_tools',
    ...config
  });
}

export function createGeminiToolProvider(config?: Partial<Omit<CloudToolConfig, 'provider'>>): CloudToolProvider {
  return new CloudToolProvider({
    provider: 'gemini',
    format: 'gemini_functions',
    ...config
  });
}

export function createVertexAIToolProvider(config?: Partial<Omit<CloudToolConfig, 'provider'>>): CloudToolProvider {
  return new CloudToolProvider({
    provider: 'vertex-ai',
    format: 'vertex_functions',
    ...config
  });
}

/**
 * Tool provider factory
 */
export function createCloudToolProvider(provider: CloudProvider, config?: Partial<CloudToolConfig>): CloudToolProvider {
  switch (provider) {
    case 'openai':
      return createOpenAIToolProvider(config);
    case 'anthropic':
      return createAnthropicToolProvider(config);
    case 'gemini':
      return createGeminiToolProvider(config);
    case 'vertex-ai':
      return createVertexAIToolProvider(config);
    default:
      throw new Error(`Unsupported cloud provider: ${provider}`);
  }
}