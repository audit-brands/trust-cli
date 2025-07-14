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
 * Ollama-specific tool formats and patterns
 */
export interface OllamaToolFormat {
  /** XML-based tool calling (default) */
  xml: 'xml';
  /** JSON-based tool calling for compatible models */
  json: 'json';
  /** Natural language tool calling */
  natural: 'natural';
}

/**
 * Ollama tool provider configuration
 */
export interface OllamaToolConfig {
  /** Tool calling format to use */
  format: keyof OllamaToolFormat;
  /** Maximum number of tool calls per response */
  maxToolCalls?: number;
  /** Enable function chaining */
  enableChaining?: boolean;
  /** Custom prompt templates */
  promptTemplates?: {
    system?: string;
    tool?: string;
    result?: string;
  };
  /** Error recovery options */
  errorRecovery?: {
    retryInvalidCalls?: boolean;
    fallbackToNatural?: boolean;
    maxRetries?: number;
  };
}

/**
 * Enhanced Ollama tool provider with multiple format support
 */
export class OllamaToolProvider implements ToolProvider {
  readonly providerId = 'ollama';
  private readonly config: Required<OllamaToolConfig>;

  constructor(config: Partial<OllamaToolConfig> = {}) {
    this.config = {
      format: config.format || 'xml',
      maxToolCalls: config.maxToolCalls || 5,
      enableChaining: config.enableChaining ?? true,
      promptTemplates: {
        system: config.promptTemplates?.system || this.getDefaultSystemPrompt(),
        tool: config.promptTemplates?.tool || this.getDefaultToolPrompt(),
        result: config.promptTemplates?.result || this.getDefaultResultPrompt(),
        ...config.promptTemplates
      },
      errorRecovery: {
        retryInvalidCalls: config.errorRecovery?.retryInvalidCalls ?? true,
        fallbackToNatural: config.errorRecovery?.fallbackToNatural ?? true,
        maxRetries: config.errorRecovery?.maxRetries ?? 2,
        ...config.errorRecovery
      }
    };
  }

  /**
   * Parse tool calls from Ollama model response
   */
  parseToolCalls(responseText: string): UniversalToolCall[] {
    try {
      return this._parseToolCallsInternal(responseText);
    } catch (error) {
      console.warn('Error parsing tool calls:', error);
      if (this.config.errorRecovery.fallbackToNatural) {
        return this.parseNaturalLanguageToolCalls(responseText);
      }
      return [];
    }
  }

  /**
   * Parse tool calls with error recovery (async version)
   */
  async parseToolCallsWithRecovery(responseText: string): Promise<UniversalToolCall[]> {
    return executeWithRecovery(
      async () => this._parseToolCallsInternal(responseText),
      {
        operationName: 'ollama.parseToolCalls',
        category: 'parsing',
        customStrategy: {
          maxRetries: this.config.errorRecovery.maxRetries,
          baseDelay: 500,
          fallbackOptions: ['natural_language_parsing']
        }
      }
    );
  }

  private _parseToolCallsInternal(responseText: string): UniversalToolCall[] {
    const calls: UniversalToolCall[] = [];

    switch (this.config.format) {
      case 'xml':
        calls.push(...this.parseXmlToolCalls(responseText));
        break;
      case 'json':
        calls.push(...this.parseJsonToolCalls(responseText));
        break;
      case 'natural':
        calls.push(...this.parseNaturalLanguageToolCalls(responseText));
        break;
    }

    // Limit the number of tool calls
    return calls.slice(0, this.config.maxToolCalls);
  }

  /**
   * Parse XML-format tool calls (Ollama's preferred format)
   */
  private parseXmlToolCalls(responseText: string): UniversalToolCall[] {
    const calls: UniversalToolCall[] = [];

    // Multiple XML patterns for robustness
    const patterns = [
      // Standard function_calls format
      /<function_calls>(.*?)<\/function_calls>/gs,
      // Individual tool_call format
      /<tool_call>(.*?)<\/tool_call>/gs,
      // Direct invoke format
      /<invoke\s+name="([^"]+)"[^>]*>(.*?)<\/invoke>/gs
    ];

    for (const pattern of patterns) {
      const matches = responseText.matchAll(pattern);
      
      for (const match of matches) {
        if (pattern === patterns[2]) {
          // Direct invoke format
          const toolName = match[1];
          const parametersXml = match[2];
          const args = this.parseXmlParameters(parametersXml);
          
          calls.push({
            id: this.generateId(),
            name: toolName,
            arguments: args,
            format: 'xml'
          });
        } else {
          // Function_calls or tool_call format
          const contentXml = match[1];
          const invokeMatches = contentXml.matchAll(/<invoke\s+name="([^"]+)"[^>]*>(.*?)<\/invoke>/gs);
          
          for (const invokeMatch of invokeMatches) {
            const toolName = invokeMatch[1];
            const parametersXml = invokeMatch[2];
            const args = this.parseXmlParameters(parametersXml);
            
            calls.push({
              id: this.generateId(),
              name: toolName,
              arguments: args,
              format: 'xml'
            });
          }

          // Also check for tool_call > name > arguments format
          const nameMatches = contentXml.matchAll(/<name>([^<]+)<\/name>/g);
          const argMatches = contentXml.matchAll(/<arguments>(.*?)<\/arguments>/gs);
          
          if (nameMatches && argMatches) {
            const names = Array.from(nameMatches).map(m => m[1].trim());
            const argSections = Array.from(argMatches).map(m => m[1]);
            
            for (let i = 0; i < Math.min(names.length, argSections.length); i++) {
              const args = this.parseXmlParameters(argSections[i]);
              calls.push({
                id: this.generateId(),
                name: names[i],
                arguments: args,
                format: 'xml'
              });
            }
          }
        }
      }
    }

    return calls;
  }

  /**
   * Parse XML parameters from tool call content
   */
  private parseXmlParameters(parametersXml: string): Record<string, any> {
    const args: Record<string, any> = {};
    
    // Handle parameter tags
    const paramMatches = parametersXml.matchAll(/<parameter\s+name="([^"]+)"[^>]*>(.*?)<\/parameter>/gs);
    for (const paramMatch of paramMatches) {
      const paramName = paramMatch[1];
      const paramValue = paramMatch[2].trim();
      args[paramName] = this.parseParameterValue(paramValue);
    }

    // Handle direct argument tags (e.g., <path>...</path>)
    const directArgMatches = parametersXml.matchAll(/<(\w+)>(.*?)<\/\1>/gs);
    for (const argMatch of directArgMatches) {
      const argName = argMatch[1];
      const argValue = argMatch[2].trim();
      // Skip if already parsed as parameter
      if (!args[argName]) {
        args[argName] = this.parseParameterValue(argValue);
      }
    }

    return args;
  }

  /**
   * Parse JSON-format tool calls
   */
  private parseJsonToolCalls(responseText: string): UniversalToolCall[] {
    const calls: UniversalToolCall[] = [];

    // Try full JSON parsing first
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
      if (parsed.tool_calls && Array.isArray(parsed.tool_calls)) {
        for (const call of parsed.tool_calls) {
          calls.push({
            id: call.id || this.generateId(),
            name: call.function?.name || call.name,
            arguments: call.function?.arguments || call.arguments || {},
            format: 'json'
          });
        }
      }
      return calls;
    } catch {
      // Fall back to pattern matching
    }

    // Pattern matching for JSON blocks
    const jsonBlockMatches = responseText.matchAll(/```json\s*(.*?)\s*```/gs);
    for (const match of jsonBlockMatches) {
      try {
        const parsed = JSON.parse(match[1]);
        if (parsed.function_call) {
          calls.push({
            id: this.generateId(),
            name: parsed.function_call.name,
            arguments: parsed.function_call.arguments || {},
            format: 'json'
          });
        }
      } catch {
        // Skip invalid JSON
      }
    }

    return calls;
  }

  /**
   * Parse natural language tool calls
   */
  private parseNaturalLanguageToolCalls(responseText: string): UniversalToolCall[] {
    const calls: UniversalToolCall[] = [];

    // Common natural language patterns
    const patterns = [
      /I (?:will|need to|should) (\w+)\s*\(([^)]*)\)/gi,
      /Let me (\w+)\s*\(([^)]*)\)/gi,
      /(?:Using|Calling|Running) (\w+) with (.+)/gi,
      /(\w+)\(([^)]*)\)/gi
    ];

    for (const pattern of patterns) {
      const matches = responseText.matchAll(pattern);
      for (const match of matches) {
        const toolName = match[1];
        const argsText = match[2] || '';
        const args = this.parseNaturalLanguageArguments(argsText);
        
        calls.push({
          id: this.generateId(),
          name: toolName,
          arguments: args,
          format: 'natural' as any
        });
      }
    }

    return calls;
  }

  /**
   * Parse natural language arguments
   */
  private parseNaturalLanguageArguments(argsText: string): Record<string, any> {
    const args: Record<string, any> = {};
    
    if (!argsText.trim()) {
      return args;
    }

    // Try to parse as JSON first
    try {
      return JSON.parse(`{${argsText}}`);
    } catch {
      // Fall back to simple parsing
    }

    // Simple key=value parsing
    const assignments = argsText.split(',');
    for (const assignment of assignments) {
      const [key, value] = assignment.split('=').map(s => s.trim());
      if (key && value) {
        args[key] = value.replace(/['"]/g, '');
      }
    }

    // If no key=value pairs found, treat as positional arguments
    if (Object.keys(args).length === 0) {
      const values = argsText.split(',').map(s => s.trim().replace(/['"]/g, ''));
      values.forEach((value, index) => {
        args[`arg${index}`] = value;
      });
    }

    return args;
  }

  /**
   * Parse parameter value with type inference
   */
  private parseParameterValue(value: string): any {
    // Try JSON parsing first
    try {
      return JSON.parse(value);
    } catch {
      // Fall back to type inference
    }

    // Boolean values
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;

    // Numeric values
    if (/^\d+$/.test(value)) return parseInt(value, 10);
    if (/^\d*\.\d+$/.test(value)) return parseFloat(value);

    // Array-like values
    if (value.startsWith('[') && value.endsWith(']')) {
      try {
        return JSON.parse(value);
      } catch {
        return value.slice(1, -1).split(',').map(s => s.trim());
      }
    }

    // Object-like values
    if (value.startsWith('{') && value.endsWith('}')) {
      try {
        return JSON.parse(value);
      } catch {
        // Return as string if not valid JSON
      }
    }

    return value;
  }

  /**
   * Format tool definition for Ollama
   */
  formatToolDefinition(tool: UniversalToolDefinition): any {
    switch (this.config.format) {
      case 'xml':
        return {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
          xml_schema: this.generateXmlSchema(tool)
        };
      case 'json':
        return {
          type: 'function',
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters
          }
        };
      case 'natural':
        return {
          name: tool.name,
          description: tool.description,
          usage: this.generateNaturalUsage(tool)
        };
      default:
        return tool;
    }
  }

  /**
   * Generate XML schema for tool
   */
  private generateXmlSchema(tool: UniversalToolDefinition): string {
    const params = Object.entries(tool.parameters.properties || {});
    const required = tool.parameters.required || [];
    
    let schema = `<invoke name="${tool.name}">`;
    for (const [paramName, paramDef] of params) {
      const isRequired = required.includes(paramName);
      const type = (paramDef as any).type || 'string';
      schema += `\n  <parameter name="${paramName}" type="${type}"${isRequired ? ' required="true"' : ''}>${(paramDef as any).description || ''}</parameter>`;
    }
    schema += '\n</invoke>';
    
    return schema;
  }

  /**
   * Generate natural language usage example
   */
  private generateNaturalUsage(tool: UniversalToolDefinition): string {
    const params = Object.keys(tool.parameters.properties || {});
    const paramList = params.join(', ');
    return `${tool.name}(${paramList}) - ${tool.description}`;
  }

  /**
   * Format tool result for Ollama context
   */
  formatToolResult(result: UniversalToolResult): string {
    if (result.isError) {
      switch (this.config.format) {
        case 'xml':
          return `<tool_result name="${result.name}" id="${result.id}">
<error>${result.error}</error>
</tool_result>`;
        case 'json':
          return JSON.stringify({
            tool_call_id: result.id,
            name: result.name,
            error: result.error,
            success: false
          });
        case 'natural':
          return `Error executing ${result.name}: ${result.error}`;
      }
    }

    switch (this.config.format) {
      case 'xml':
        return `<tool_result name="${result.name}" id="${result.id}">
${typeof result.result === 'string' ? result.result : JSON.stringify(result.result, null, 2)}
</tool_result>`;
      case 'json':
        return JSON.stringify({
          tool_call_id: result.id,
          name: result.name,
          result: result.result,
          success: true
        });
      case 'natural':
        return `Result from ${result.name}: ${typeof result.result === 'string' ? result.result : JSON.stringify(result.result)}`;
      default:
        return String(result.result);
    }
  }

  /**
   * Get tool usage prompt for Ollama
   */
  getToolPrompt(tools: UniversalToolDefinition[]): string {
    switch (this.config.format) {
      case 'xml':
        return this.getXmlToolPrompt(tools);
      case 'json':
        return this.getJsonToolPrompt(tools);
      case 'natural':
        return this.getNaturalToolPrompt(tools);
      default:
        return this.getXmlToolPrompt(tools);
    }
  }

  /**
   * Get XML format tool prompt
   */
  private getXmlToolPrompt(tools: UniversalToolDefinition[]): string {
    let prompt = this.config.promptTemplates.system + '\n\n';
    
    prompt += `You have access to the following tools. Use XML format for tool calls:

<function_calls>
<invoke name="TOOL_NAME">
<parameter name="param1">value1</parameter>
<parameter name="param2">value2</parameter>
</invoke>
</function_calls>

Available tools:
`;

    for (const tool of tools) {
      const params = Object.entries(tool.parameters.properties || {});
      const required = tool.parameters.required || [];
      
      prompt += `\n• ${tool.name}: ${tool.description}`;
      if (params.length > 0) {
        prompt += '\n  Parameters:';
        for (const [paramName, paramDef] of params) {
          const isRequired = required.includes(paramName);
          const type = (paramDef as any).type || 'string';
          prompt += `\n    - ${paramName} (${type}${isRequired ? ', required' : ''}): ${(paramDef as any).description || ''}`;
        }
      }
      prompt += '\n';
    }

    prompt += '\nExample usage:\n<function_calls>\n<invoke name="list_directory">\n<parameter name="path">.</parameter>\n</invoke>\n</function_calls>\n';

    return prompt;
  }

  /**
   * Get JSON format tool prompt
   */
  private getJsonToolPrompt(tools: UniversalToolDefinition[]): string {
    let prompt = `You have access to function calling. Respond with JSON when using tools.

Format: \`\`\`json
{"function_call": {"name": "TOOL_NAME", "arguments": {...}}}
\`\`\`

Available functions:
`;

    for (const tool of tools) {
      const params = Object.keys(tool.parameters.properties || {});
      prompt += `• ${tool.name}(${params.join(', ')}): ${tool.description}\n`;
    }

    prompt += '\nExample:\n```json\n{"function_call": {"name": "list_directory", "arguments": {"path": "."}}}\n```\n';

    return prompt;
  }

  /**
   * Get natural language tool prompt
   */
  private getNaturalToolPrompt(tools: UniversalToolDefinition[]): string {
    let prompt = `You have access to the following tools. Describe what you want to do in natural language:

Available tools:
`;

    for (const tool of tools) {
      const params = Object.keys(tool.parameters.properties || {});
      prompt += `• ${tool.name}(${params.join(', ')}): ${tool.description}\n`;
    }

    prompt += '\nExample: "I need to list_directory with path=."\n';

    return prompt;
  }

  /**
   * Get default system prompt
   */
  private getDefaultSystemPrompt(): string {
    return 'You are a helpful assistant with access to tools. Use them when needed to accomplish tasks.';
  }

  /**
   * Get default tool prompt
   */
  private getDefaultToolPrompt(): string {
    return 'When you need to use a tool, format your response according to the specified format.';
  }

  /**
   * Get default result prompt
   */
  private getDefaultResultPrompt(): string {
    return 'Here is the result from the tool:';
  }

  /**
   * Generate unique tool call ID
   */
  private generateId(): string {
    return `ollama_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<OllamaToolConfig>): void {
    Object.assign(this.config, newConfig);
  }

  /**
   * Get current configuration
   */
  getConfig(): OllamaToolConfig {
    return { ...this.config };
  }

  /**
   * Validate tool call format
   */
  validateToolCall(call: UniversalToolCall): boolean {
    return !!(call.name && call.arguments && call.id);
  }

  /**
   * Get supported formats
   */
  getSupportedFormats(): (keyof OllamaToolFormat)[] {
    return ['xml', 'json', 'natural'];
  }
}

/**
 * Factory function for creating Ollama tool providers
 */
export function createOllamaToolProvider(config?: Partial<OllamaToolConfig>): OllamaToolProvider {
  return new OllamaToolProvider(config);
}

/**
 * Default Ollama tool provider instance
 */
export const defaultOllamaToolProvider = new OllamaToolProvider();