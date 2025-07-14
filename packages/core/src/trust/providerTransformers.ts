/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  UniversalToolCall,
  UniversalToolDefinition,
  UniversalToolResult
} from './universalToolInterface.js';
import {
  GenerationOptions,
  GenerationResult,
  ModelCapabilities
} from './unifiedModelInterface.js';

/**
 * Provider-specific data formats
 */
export interface ProviderFormats {
  ollama: {
    tools: any;
    response: any;
    capabilities: any;
  };
  openai: {
    tools: any;
    response: any;
    capabilities: any;
  };
  anthropic: {
    tools: any;
    response: any;
    capabilities: any;
  };
  gemini: {
    tools: any;
    response: any;
    capabilities: any;
  };
  huggingface: {
    tools: any;
    response: any;
    capabilities: any;
  };
}

/**
 * Transformation context for provider conversions
 */
export interface TransformationContext {
  sourceProvider: keyof ProviderFormats;
  targetProvider: keyof ProviderFormats;
  preserveMetadata?: boolean;
  strictValidation?: boolean;
  fallbackOnError?: boolean;
}

/**
 * Provider-specific transformers for different AI backends
 */
export class ProviderTransformers {
  /**
   * Transform universal tool definition to provider-specific format
   */
  static transformToolDefinition(
    tool: UniversalToolDefinition,
    provider: keyof ProviderFormats
  ): any {
    switch (provider) {
      case 'ollama':
        return this.toOllamaToolFormat(tool);
      case 'openai':
        return this.toOpenAIToolFormat(tool);
      case 'anthropic':
        return this.toAnthropicToolFormat(tool);
      case 'gemini':
        return this.toGeminiToolFormat(tool);
      case 'huggingface':
        return this.toHuggingFaceToolFormat(tool);
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  /**
   * Transform provider-specific tool response to universal format
   */
  static transformToolResponse(
    response: any,
    provider: keyof ProviderFormats
  ): UniversalToolCall[] {
    switch (provider) {
      case 'ollama':
        return this.fromOllamaResponse(response);
      case 'openai':
        return this.fromOpenAIResponse(response);
      case 'anthropic':
        return this.fromAnthropicResponse(response);
      case 'gemini':
        return this.fromGeminiResponse(response);
      case 'huggingface':
        return this.fromHuggingFaceResponse(response);
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  /**
   * Transform generation options between providers
   */
  static transformGenerationOptions(
    options: GenerationOptions,
    context: TransformationContext
  ): any {
    const baseTransformed = {
      ...options
    };

    switch (context.targetProvider) {
      case 'ollama':
        return this.toOllamaOptions(baseTransformed);
      case 'openai':
        return this.toOpenAIOptions(baseTransformed);
      case 'anthropic':
        return this.toAnthropicOptions(baseTransformed);
      case 'gemini':
        return this.toGeminiOptions(baseTransformed);
      case 'huggingface':
        return this.toHuggingFaceOptions(baseTransformed);
      default:
        return baseTransformed;
    }
  }

  /**
   * Transform capabilities between providers
   */
  static transformCapabilities(
    capabilities: any,
    context: TransformationContext
  ): ModelCapabilities {
    const baseCapabilities: ModelCapabilities = {
      supportsToolCalling: false,
      supportsStreaming: false,
      supportsSystemPrompts: false,
      supportsImageInput: false,
      supportsAudio: false,
      maxContextSize: 4096,
      preferredToolFormat: 'json'
    };

    switch (context.sourceProvider) {
      case 'ollama':
        return this.fromOllamaCapabilities(capabilities, baseCapabilities);
      case 'openai':
        return this.fromOpenAICapabilities(capabilities, baseCapabilities);
      case 'anthropic':
        return this.fromAnthropicCapabilities(capabilities, baseCapabilities);
      case 'gemini':
        return this.fromGeminiCapabilities(capabilities, baseCapabilities);
      case 'huggingface':
        return this.fromHuggingFaceCapabilities(capabilities, baseCapabilities);
      default:
        return baseCapabilities;
    }
  }

  // Ollama format transformers
  private static toOllamaToolFormat(tool: UniversalToolDefinition): any {
    return {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      format: 'xml',
      schema: this.generateOllamaXMLSchema(tool)
    };
  }

  private static fromOllamaResponse(response: any): UniversalToolCall[] {
    const calls: UniversalToolCall[] = [];
    
    if (typeof response === 'string') {
      // Parse XML tool calls
      const toolCallRegex = /<tool_call>\s*<name>(.*?)<\/name>\s*<arguments>(.*?)<\/arguments>\s*<\/tool_call>/gs;
      let match;
      
      while ((match = toolCallRegex.exec(response)) !== null) {
        const name = match[1].trim();
        const argsXml = match[2];
        const args: Record<string, any> = {};
        
        // Parse XML arguments
        const argRegex = /<(\w+)>(.*?)<\/\1>/gs;
        let argMatch;
        while ((argMatch = argRegex.exec(argsXml)) !== null) {
          args[argMatch[1]] = argMatch[2].trim();
        }
        
        calls.push({
          id: `ollama_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          name,
          arguments: args,
          format: 'xml'
        });
      }
    }
    
    return calls;
  }

  private static toOllamaOptions(options: GenerationOptions): any {
    return {
      temperature: options.temperature ?? 0.7,
      top_p: options.topP,
      top_k: options.topK,
      num_predict: options.maxTokens,
      stop: options.stopSequences,
      stream: false
    };
  }

  private static fromOllamaCapabilities(ollama: any, base: ModelCapabilities): ModelCapabilities {
    return {
      ...base,
      supportsToolCalling: true,
      supportsStreaming: true,
      supportsSystemPrompts: true,
      maxContextSize: ollama?.context_size || 4096,
      preferredToolFormat: 'xml'
    };
  }

  // OpenAI format transformers
  private static toOpenAIToolFormat(tool: UniversalToolDefinition): any {
    return {
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters
      }
    };
  }

  private static fromOpenAIResponse(response: any): UniversalToolCall[] {
    const calls: UniversalToolCall[] = [];
    
    // Handle tool_calls format
    if (response.tool_calls && Array.isArray(response.tool_calls)) {
      for (const toolCall of response.tool_calls) {
        calls.push({
          id: toolCall.id || this.generateId('openai'),
          name: toolCall.function?.name || toolCall.name,
          arguments: typeof toolCall.function?.arguments === 'string' 
            ? JSON.parse(toolCall.function.arguments)
            : toolCall.function?.arguments || {},
          format: 'json'
        });
      }
    }
    
    // Handle function_call format
    if (response.function_call) {
      calls.push({
        id: this.generateId('openai'),
        name: response.function_call.name,
        arguments: typeof response.function_call.arguments === 'string'
          ? JSON.parse(response.function_call.arguments)
          : response.function_call.arguments,
        format: 'json'
      });
    }
    
    return calls;
  }

  private static toOpenAIOptions(options: GenerationOptions): any {
    return {
      temperature: options.temperature,
      max_tokens: options.maxTokens,
      top_p: options.topP,
      stop: options.stopSequences,
      stream: false
    };
  }

  private static fromOpenAICapabilities(openai: any, base: ModelCapabilities): ModelCapabilities {
    return {
      ...base,
      supportsToolCalling: true,
      supportsStreaming: true,
      supportsSystemPrompts: true,
      supportsImageInput: openai?.supports_vision || false,
      maxContextSize: openai?.context_length || 8192,
      preferredToolFormat: 'json'
    };
  }

  // Anthropic format transformers
  private static toAnthropicToolFormat(tool: UniversalToolDefinition): any {
    return {
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters
    };
  }

  private static fromAnthropicResponse(response: any): UniversalToolCall[] {
    const calls: UniversalToolCall[] = [];
    
    if (typeof response === 'string') {
      // Parse tool_use blocks
      const toolUseRegex = /<tool_use>(.*?)<\/tool_use>/gs;
      const matches = response.matchAll(toolUseRegex);
      
      for (const match of matches) {
        const toolXml = match[1];
        
        const nameMatch = toolXml.match(/<name>(.*?)<\/name>/);
        const paramsMatch = toolXml.match(/<parameters>(.*?)<\/parameters>/s);
        
        if (nameMatch) {
          let args: Record<string, any> = {};
          
          if (paramsMatch) {
            try {
              args = JSON.parse(paramsMatch[1].trim());
            } catch {
              args = this.parseSimpleXMLParams(paramsMatch[1]);
            }
          }
          
          calls.push({
            id: this.generateId('anthropic'),
            name: nameMatch[1].trim(),
            arguments: args,
            format: 'xml'
          });
        }
      }
    }
    
    return calls;
  }

  private static toAnthropicOptions(options: GenerationOptions): any {
    return {
      temperature: options.temperature,
      max_tokens: options.maxTokens,
      top_p: options.topP,
      stop_sequences: options.stopSequences
    };
  }

  private static fromAnthropicCapabilities(anthropic: any, base: ModelCapabilities): ModelCapabilities {
    return {
      ...base,
      supportsToolCalling: true,
      supportsStreaming: true,
      supportsSystemPrompts: true,
      supportsImageInput: true,
      maxContextSize: anthropic?.max_context || 200000,
      preferredToolFormat: 'xml'
    };
  }

  // Gemini format transformers
  private static toGeminiToolFormat(tool: UniversalToolDefinition): any {
    return {
      functionDeclarations: [{
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters
      }]
    };
  }

  private static fromGeminiResponse(response: any): UniversalToolCall[] {
    const calls: UniversalToolCall[] = [];
    
    if (response.candidates && Array.isArray(response.candidates)) {
      for (const candidate of response.candidates) {
        if (candidate.content?.parts) {
          for (const part of candidate.content.parts) {
            if (part.functionCall) {
              calls.push({
                id: this.generateId('gemini'),
                name: part.functionCall.name,
                arguments: part.functionCall.args || {},
                format: 'json'
              });
            }
          }
        }
      }
    }
    
    if (response.functionCall) {
      calls.push({
        id: this.generateId('gemini'),
        name: response.functionCall.name,
        arguments: response.functionCall.args || {},
        format: 'json'
      });
    }
    
    return calls;
  }

  private static toGeminiOptions(options: GenerationOptions): any {
    return {
      temperature: options.temperature,
      maxOutputTokens: options.maxTokens,
      topP: options.topP,
      topK: options.topK,
      stopSequences: options.stopSequences
    };
  }

  private static fromGeminiCapabilities(gemini: any, base: ModelCapabilities): ModelCapabilities {
    return {
      ...base,
      supportsToolCalling: true,
      supportsStreaming: true,
      supportsSystemPrompts: true,
      supportsImageInput: true,
      maxContextSize: gemini?.input_token_limit || 1000000,
      preferredToolFormat: 'json'
    };
  }

  // HuggingFace format transformers
  private static toHuggingFaceToolFormat(tool: UniversalToolDefinition): any {
    return {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      format: 'json',
      schema: this.generateJSONSchema(tool)
    };
  }

  private static fromHuggingFaceResponse(response: any): UniversalToolCall[] {
    const calls: UniversalToolCall[] = [];
    
    if (typeof response === 'string') {
      try {
        const parsed = JSON.parse(response);
        if (parsed.function_call) {
          calls.push({
            id: this.generateId('huggingface'),
            name: parsed.function_call.name,
            arguments: parsed.function_call.arguments || {},
            format: 'json'
          });
        }
      } catch {
        // Try pattern matching for partial JSON
        const functionCallRegex = /"function_call":\s*{\s*"name":\s*"([^"]+)"/g;
        const match = functionCallRegex.exec(response);
        if (match) {
          calls.push({
            id: this.generateId('huggingface'),
            name: match[1],
            arguments: this.extractJSONArguments(response),
            format: 'json'
          });
        }
      }
    }
    
    return calls;
  }

  private static toHuggingFaceOptions(options: GenerationOptions): any {
    return {
      temperature: options.temperature,
      max_new_tokens: options.maxTokens,
      top_p: options.topP,
      top_k: options.topK,
      stop: options.stopSequences,
      do_sample: true
    };
  }

  private static fromHuggingFaceCapabilities(hf: any, base: ModelCapabilities): ModelCapabilities {
    return {
      ...base,
      supportsToolCalling: hf?.supports_functions || false,
      supportsStreaming: true,
      supportsSystemPrompts: true,
      supportsImageInput: hf?.supports_vision || false,
      maxContextSize: hf?.model_max_length || 4096,
      preferredToolFormat: 'json'
    };
  }

  // Utility methods
  private static generateOllamaXMLSchema(tool: UniversalToolDefinition): string {
    const params = Object.entries(tool.parameters.properties || {});
    const required = tool.parameters.required || [];
    
    let schema = `<tool_call>\n  <name>${tool.name}</name>\n  <arguments>`;
    for (const [paramName, paramDef] of params) {
      const isRequired = required.includes(paramName);
      const type = (paramDef as any).type || 'string';
      schema += `\n    <${paramName} type="${type}"${isRequired ? ' required="true"' : ''}>${(paramDef as any).description || ''}</${paramName}>`;
    }
    schema += '\n  </arguments>\n</tool_call>';
    
    return schema;
  }

  private static generateJSONSchema(tool: UniversalToolDefinition): any {
    return {
      type: 'object',
      properties: {
        function_call: {
          type: 'object',
          properties: {
            name: { type: 'string', const: tool.name },
            arguments: tool.parameters
          },
          required: ['name', 'arguments']
        }
      }
    };
  }

  private static parseSimpleXMLParams(xml: string): Record<string, any> {
    const params: Record<string, any> = {};
    const paramRegex = /<(\w+)>(.*?)<\/\1>/g;
    let match;
    
    while ((match = paramRegex.exec(xml)) !== null) {
      const paramName = match[1];
      const paramValue = match[2].trim();
      
      try {
        params[paramName] = JSON.parse(paramValue);
      } catch {
        params[paramName] = paramValue;
      }
    }
    
    return params;
  }

  private static extractJSONArguments(text: string): Record<string, any> {
    const args: Record<string, any> = {};
    
    const argsMatch = text.match(/"arguments":\s*({[^}]*})/);
    if (argsMatch) {
      try {
        return JSON.parse(argsMatch[1]);
      } catch {
        // Fall back to simple extraction
      }
    }
    
    return args;
  }

  private static generateId(provider: string): string {
    return `${provider}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Cross-provider data migration utility
   */
  static migrateProviderData(
    data: any,
    context: TransformationContext
  ): any {
    if (context.sourceProvider === context.targetProvider) {
      return data;
    }

    try {
      // Convert to universal format first
      const universal = this.toUniversalFormat(data, context.sourceProvider);
      
      // Then convert to target format
      return this.fromUniversalFormat(universal, context.targetProvider);
    } catch (error) {
      if (context.fallbackOnError) {
        console.warn(`Migration failed from ${context.sourceProvider} to ${context.targetProvider}:`, error);
        return data; // Return original data
      }
      throw error;
    }
  }

  /**
   * Convert provider-specific data to universal format
   */
  private static toUniversalFormat(data: any, provider: keyof ProviderFormats): any {
    switch (provider) {
      case 'ollama':
        return this.normalizeOllamaData(data);
      case 'openai':
        return this.normalizeOpenAIData(data);
      case 'anthropic':
        return this.normalizeAnthropicData(data);
      case 'gemini':
        return this.normalizeGeminiData(data);
      case 'huggingface':
        return this.normalizeHuggingFaceData(data);
      default:
        return data;
    }
  }

  /**
   * Convert universal format to provider-specific format
   */
  private static fromUniversalFormat(data: any, provider: keyof ProviderFormats): any {
    switch (provider) {
      case 'ollama':
        return this.denormalizeToOllama(data);
      case 'openai':
        return this.denormalizeToOpenAI(data);
      case 'anthropic':
        return this.denormalizeToAnthropic(data);
      case 'gemini':
        return this.denormalizeToGemini(data);
      case 'huggingface':
        return this.denormalizeToHuggingFace(data);
      default:
        return data;
    }
  }

  // Data normalization methods
  private static normalizeOllamaData(data: any): any {
    return {
      type: 'ollama',
      content: data.response || data,
      metadata: {
        model: data.model,
        created_at: data.created_at,
        done: data.done
      }
    };
  }

  private static normalizeOpenAIData(data: any): any {
    return {
      type: 'openai',
      content: data.choices?.[0]?.message?.content || data.content || data,
      metadata: {
        model: data.model,
        created: data.created,
        usage: data.usage
      }
    };
  }

  private static normalizeAnthropicData(data: any): any {
    return {
      type: 'anthropic',
      content: data.content?.[0]?.text || data.content || data,
      metadata: {
        model: data.model,
        usage: data.usage,
        stop_reason: data.stop_reason
      }
    };
  }

  private static normalizeGeminiData(data: any): any {
    return {
      type: 'gemini',
      content: data.candidates?.[0]?.content?.parts?.[0]?.text || data.content || data,
      metadata: {
        model: data.model,
        usage: data.usageMetadata
      }
    };
  }

  private static normalizeHuggingFaceData(data: any): any {
    return {
      type: 'huggingface',
      content: data.generated_text || data.content || data,
      metadata: {
        model: data.model,
        parameters: data.parameters
      }
    };
  }

  // Data denormalization methods
  private static denormalizeToOllama(data: any): any {
    return {
      response: data.content,
      model: data.metadata?.model || 'unknown',
      created_at: data.metadata?.created_at || new Date().toISOString(),
      done: true
    };
  }

  private static denormalizeToOpenAI(data: any): any {
    return {
      choices: [{
        message: {
          role: 'assistant',
          content: data.content
        },
        finish_reason: 'stop'
      }],
      model: data.metadata?.model || 'unknown',
      created: data.metadata?.created || Math.floor(Date.now() / 1000),
      usage: data.metadata?.usage || {
        prompt_tokens: 0,
        completion_tokens: 0,
        total_tokens: 0
      }
    };
  }

  private static denormalizeToAnthropic(data: any): any {
    return {
      content: [{
        type: 'text',
        text: data.content
      }],
      model: data.metadata?.model || 'unknown',
      role: 'assistant',
      stop_reason: data.metadata?.stop_reason || 'end_turn',
      usage: data.metadata?.usage || {
        input_tokens: 0,
        output_tokens: 0
      }
    };
  }

  private static denormalizeToGemini(data: any): any {
    return {
      candidates: [{
        content: {
          parts: [{
            text: data.content
          }],
          role: 'model'
        },
        finishReason: 'STOP'
      }],
      usageMetadata: data.metadata?.usage || {
        promptTokenCount: 0,
        candidatesTokenCount: 0,
        totalTokenCount: 0
      }
    };
  }

  private static denormalizeToHuggingFace(data: any): any {
    return {
      generated_text: data.content,
      model: data.metadata?.model || 'unknown',
      parameters: data.metadata?.parameters || {}
    };
  }

  /**
   * Validate transformed data
   */
  static validateTransformation(
    originalData: any,
    transformedData: any,
    context: TransformationContext
  ): boolean {
    if (!context.strictValidation) {
      return true;
    }

    try {
      // Basic structure validation
      if (typeof transformedData !== typeof originalData && 
          typeof transformedData !== 'object') {
        return false;
      }

      // Provider-specific validation
      return this.validateProviderFormat(transformedData, context.targetProvider);
    } catch (error) {
      console.warn('Validation failed:', error);
      return false;
    }
  }

  /**
   * Validate provider-specific format
   */
  private static validateProviderFormat(data: any, provider: keyof ProviderFormats): boolean {
    switch (provider) {
      case 'ollama':
        return this.validateOllamaFormat(data);
      case 'openai':
        return this.validateOpenAIFormat(data);
      case 'anthropic':
        return this.validateAnthropicFormat(data);
      case 'gemini':
        return this.validateGeminiFormat(data);
      case 'huggingface':
        return this.validateHuggingFaceFormat(data);
      default:
        return true;
    }
  }

  private static validateOllamaFormat(data: any): boolean {
    return !!(data && (data.response !== undefined || data.model));
  }

  private static validateOpenAIFormat(data: any): boolean {
    return !!(data && (data.choices || data.content || data.function_call));
  }

  private static validateAnthropicFormat(data: any): boolean {
    return !!(data && (data.content || data.role));
  }

  private static validateGeminiFormat(data: any): boolean {
    return !!(data && (data.candidates || data.functionCall));
  }

  private static validateHuggingFaceFormat(data: any): boolean {
    return !!(data && (data.generated_text !== undefined || data.content !== undefined));
  }
}

/**
 * Provider-specific transformation utilities
 */
export class ProviderTransformationUtils {
  /**
   * Get optimal transformation path between providers
   */
  static getTransformationPath(
    source: keyof ProviderFormats,
    target: keyof ProviderFormats
  ): (keyof ProviderFormats)[] {
    if (source === target) {
      return [source];
    }

    // Direct transformations are preferred
    return [source, target];
  }

  /**
   * Get transformation complexity score
   */
  static getTransformationComplexity(
    source: keyof ProviderFormats,
    target: keyof ProviderFormats
  ): number {
    if (source === target) return 0;

    // Complexity matrix based on format compatibility
    const complexityMatrix: Record<string, Record<string, number>> = {
      'ollama': { 'openai': 3, 'anthropic': 2, 'gemini': 3, 'huggingface': 2 },
      'openai': { 'ollama': 3, 'anthropic': 4, 'gemini': 2, 'huggingface': 3 },
      'anthropic': { 'ollama': 2, 'openai': 4, 'gemini': 3, 'huggingface': 3 },
      'gemini': { 'ollama': 3, 'openai': 2, 'anthropic': 3, 'huggingface': 3 },
      'huggingface': { 'ollama': 2, 'openai': 3, 'anthropic': 3, 'gemini': 3 }
    };

    return complexityMatrix[source]?.[target] || 5;
  }

  /**
   * Check if direct transformation is supported
   */
  static isDirectTransformationSupported(
    source: keyof ProviderFormats,
    target: keyof ProviderFormats
  ): boolean {
    return this.getTransformationComplexity(source, target) <= 3;
  }
}

/**
 * Batch transformation utility for processing multiple items
 */
export class BatchTransformer {
  /**
   * Transform multiple tool definitions
   */
  static transformToolDefinitions(
    tools: UniversalToolDefinition[],
    provider: keyof ProviderFormats
  ): any[] {
    return tools.map(tool => ProviderTransformers.transformToolDefinition(tool, provider));
  }

  /**
   * Transform multiple tool calls
   */
  static transformToolCalls(
    calls: UniversalToolCall[],
    provider: keyof ProviderFormats
  ): any[] {
    return calls.map(call => ProviderTransformers.transformToolResponse(call, provider));
  }

  /**
   * Batch migrate data between providers
   */
  static batchMigrate(
    dataItems: any[],
    context: TransformationContext
  ): any[] {
    return dataItems.map(item => {
      try {
        return ProviderTransformers.migrateProviderData(item, context);
      } catch (error) {
        if (context.fallbackOnError) {
          console.warn('Batch migration item failed:', error);
          return item;
        }
        throw error;
      }
    });
  }
}