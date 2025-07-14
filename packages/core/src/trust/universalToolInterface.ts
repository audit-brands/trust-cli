/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { FunctionCall } from '@google/genai';

/**
 * Universal tool call representation that works across all providers
 */
export interface UniversalToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
  description?: string;
  format?: 'json' | 'xml';
}

/**
 * Universal tool result representation
 */
export interface UniversalToolResult {
  id: string;
  name: string;
  result: any;
  error?: string;
  isError: boolean;
}

/**
 * Tool definition that works across all providers
 */
export interface UniversalToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

/**
 * Provider-specific tool call parser and formatter
 */
export interface ToolProvider {
  /**
   * Parse tool calls from model response text
   */
  parseToolCalls(responseText: string): UniversalToolCall[];

  /**
   * Format tool definition for this provider
   */
  formatToolDefinition(tool: UniversalToolDefinition): any;

  /**
   * Format tool result for model context
   */
  formatToolResult(result: UniversalToolResult): string;

  /**
   * Get provider-specific prompt for tool usage
   */
  getToolPrompt(tools: UniversalToolDefinition[]): string;

  /**
   * Provider identifier
   */
  readonly providerId: string;
}

/**
 * XML-based tool call parser (like Forge CLI)
 */
export class XmlToolProvider implements ToolProvider {
  readonly providerId = 'xml';

  parseToolCalls(responseText: string): UniversalToolCall[] {
    const calls: UniversalToolCall[] = [];

    // More forgiving regex-based parsing like Claude/Forge
    const functionCallsMatch = responseText.match(/<function_calls>(.*?)<\/function_calls>/s);
    if (!functionCallsMatch) {
      // Try to find partial or incomplete calls
      const partialMatch = responseText.match(/<invoke\s+name="([^"]+)"[^>]*>/);
      if (partialMatch) {
        const toolName = partialMatch[1];
        return [{
          id: this.generateId(),
          name: toolName,
          arguments: this.extractPartialParameters(responseText),
          format: 'xml'
        }];
      }
      return [];
    }

    const invokeMatches = functionCallsMatch[1].matchAll(/<invoke\s+name="([^"]+)"[^>]*>(.*?)<\/invoke>/gs);
    
    for (const match of invokeMatches) {
      const toolName = match[1];
      const parametersXml = match[2];
      
      const parameters: Record<string, any> = {};
      const paramMatches = parametersXml.matchAll(/<parameter\s+name="([^"]+)"[^>]*>(.*?)<\/parameter>/gs);
      
      for (const paramMatch of paramMatches) {
        const paramName = paramMatch[1];
        const paramValue = paramMatch[2].trim();
        
        // Try to parse as JSON, fallback to string
        try {
          parameters[paramName] = JSON.parse(paramValue);
        } catch {
          parameters[paramName] = paramValue;
        }
      }

      calls.push({
        id: this.generateId(),
        name: toolName,
        arguments: parameters,
        format: 'xml'
      });
    }

    return calls;
  }

  formatToolDefinition(tool: UniversalToolDefinition): any {
    return {
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters
    };
  }

  formatToolResult(result: UniversalToolResult): string {
    if (result.isError) {
      return `<tool_result name="${result.name}" id="${result.id}">
<error>${result.error}</error>
</tool_result>`;
    }
    
    return `<tool_result name="${result.name}" id="${result.id}">
${typeof result.result === 'string' ? result.result : JSON.stringify(result.result, null, 2)}
</tool_result>`;
  }

  getToolPrompt(tools: UniversalToolDefinition[]): string {
    let prompt = `You have access to the following tools. When you need to use a tool, respond with XML in this format:

<function_calls>
<invoke name="TOOL_NAME">
<parameter name="param1">value1</parameter>
<parameter name="param2">value2</parameter>
</invoke>
</function_calls>

Available tools:
`;

    for (const tool of tools) {
      const params = Object.keys(tool.parameters.properties || {}).join(', ');
      prompt += `• ${tool.name}(${params}): ${tool.description}\n`;
    }

    prompt += `\nExample:
<function_calls>
<invoke name="list_directory">
<parameter name="path">.</parameter>
</invoke>
</function_calls>

`;

    return prompt;
  }

  private extractPartialParameters(text: string): Record<string, any> {
    const params: Record<string, any> = {};
    
    // Try to extract common parameters for directory listing
    if (text.includes('list_directory') || text.includes('directory')) {
      params.path = '.';
    }
    
    // Extract any partial parameter values
    const paramMatch = text.match(/<parameter\s+name="([^"]+)"[^>]*>([^<]*)/);
    if (paramMatch) {
      params[paramMatch[1]] = paramMatch[2].trim();
    }
    
    return params;
  }

  private generateId(): string {
    return `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * JSON-based tool call parser (like OpenAI)
 */
export class JsonToolProvider implements ToolProvider {
  readonly providerId = 'json';

  parseToolCalls(responseText: string): UniversalToolCall[] {
    const calls: UniversalToolCall[] = [];

    // Try to parse complete JSON first
    try {
      const parsed = JSON.parse(responseText);
      if (parsed.function_call) {
        calls.push({
          id: this.generateId(),
          name: parsed.function_call.name,
          arguments: parsed.function_call.arguments || {},
          format: 'json'
        });
      }
      return calls;
    } catch {
      // Fall back to pattern matching
    }

    // Pattern matching for partial JSON
    const patterns = [
      /\{"function_call":\s*\{\s*"name":\s*"([^"]+)"/gi,
      /```json\s*\{\s*"function_call":\s*\{\s*"name":\s*"([^"]+)"/gi
    ];

    for (const pattern of patterns) {
      const match = pattern.exec(responseText);
      if (match) {
        const toolName = match[1];
        const args = this.extractPartialArguments(responseText, toolName);
        calls.push({
          id: this.generateId(),
          name: toolName,
          arguments: args,
          format: 'json'
        });
        break;
      }
    }

    return calls;
  }

  formatToolDefinition(tool: UniversalToolDefinition): any {
    return {
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters
      }
    };
  }

  formatToolResult(result: UniversalToolResult): string {
    return JSON.stringify({
      tool_call_id: result.id,
      name: result.name,
      result: result.result,
      error: result.error
    });
  }

  getToolPrompt(tools: UniversalToolDefinition[]): string {
    let prompt = `You have access to function calling. When you need to use tools, respond ONLY with valid JSON.

Format: \`\`\`json
{"function_call": {"name": "TOOL_NAME", "arguments": {...}}}
\`\`\`

Available functions:
`;

    for (const tool of tools) {
      const params = Object.keys(tool.parameters.properties || {}).join(', ');
      prompt += `• ${tool.name}(${params}): ${tool.description}\n`;
    }

    prompt += `\nExample:
\`\`\`json
{"function_call": {"name": "list_directory", "arguments": {"path": "."}}}
\`\`\`

`;

    return prompt;
  }

  private extractPartialArguments(text: string, toolName: string): Record<string, any> {
    const args: Record<string, any> = {};
    
    // Common defaults based on tool name
    if (toolName === 'list_directory') {
      args.path = '.';
    }
    
    // Try to extract any visible arguments
    const argMatch = text.match(/"arguments":\s*\{([^}]*)/);
    if (argMatch) {
      try {
        const partialArgs = `{${argMatch[1]}}`;
        const parsed = JSON.parse(partialArgs);
        Object.assign(args, parsed);
      } catch {
        // Ignore parsing errors
      }
    }
    
    return args;
  }

  private generateId(): string {
    return `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * Universal tool interface that abstracts provider differences
 */
export class UniversalToolInterface {
  private providers: Map<string, ToolProvider> = new Map();
  
  constructor() {
    this.registerProvider(new XmlToolProvider());
    this.registerProvider(new JsonToolProvider());
  }

  registerProvider(provider: ToolProvider): void {
    this.providers.set(provider.providerId, provider);
  }

  /**
   * Parse tool calls using the most appropriate provider
   */
  parseToolCalls(responseText: string, preferredFormat: 'xml' | 'json' = 'xml'): UniversalToolCall[] {
    // Try preferred format first
    const preferredProvider = this.providers.get(preferredFormat);
    if (preferredProvider) {
      const calls = preferredProvider.parseToolCalls(responseText);
      if (calls.length > 0) {
        return calls;
      }
    }

    // Try all other providers
    for (const [id, provider] of this.providers) {
      if (id !== preferredFormat) {
        const calls = provider.parseToolCalls(responseText);
        if (calls.length > 0) {
          return calls;
        }
      }
    }

    return [];
  }

  /**
   * Get provider for specific format
   */
  getProvider(format: 'xml' | 'json'): ToolProvider | undefined {
    return this.providers.get(format);
  }

  /**
   * Convert FunctionCall to UniversalToolCall
   */
  fromFunctionCall(call: FunctionCall): UniversalToolCall {
    return {
      id: call.id || this.generateId(),
      name: call.name || 'unknown_function',
      arguments: call.args || {},
      format: 'json'
    };
  }

  /**
   * Convert UniversalToolCall to FunctionCall
   */
  toFunctionCall(call: UniversalToolCall): FunctionCall {
    return {
      id: call.id || this.generateId(),
      name: call.name,
      args: call.arguments
    };
  }

  private generateId(): string {
    return `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}