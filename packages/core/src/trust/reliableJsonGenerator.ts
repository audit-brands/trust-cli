/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { UniversalToolCall, UniversalToolResult } from './universalToolInterface.js';
import { UnifiedModelInterface, GenerationOptions } from './unifiedModelInterface.js';

export interface JsonGenerationOptions extends GenerationOptions {
  maxRetries?: number;
  fallbackStrategy?: 'repair' | 'extract' | 'regenerate';
  strictValidation?: boolean;
  schema?: any; // JSON schema for validation
  modelSpecific?: boolean; // Use model-specific optimizations
}

export interface JsonGenerationResult {
  success: boolean;
  json?: any;
  text: string;
  attempts: number;
  strategy: string;
  errors?: string[];
  confidence: number; // 0-1 confidence score
}

/**
 * Reliable JSON generator that ensures consistent output across all models
 */
export class ReliableJsonGenerator {
  private repairAttempts = new Map<string, number>();
  private modelPerformance = new Map<string, ModelJsonPerformance>();

  /**
   * Generate reliable JSON from any model with multiple fallback strategies
   */
  async generateReliableJson(
    model: UnifiedModelInterface,
    prompt: string,
    options: JsonGenerationOptions = {}
  ): Promise<JsonGenerationResult> {
    const maxRetries = options.maxRetries ?? 3;
    const fallbackStrategy = options.fallbackStrategy ?? 'repair';
    const modelName = model.name;
    
    let attempts = 0;
    let lastError: string | undefined;
    const errors: string[] = [];

    // Track performance for this model
    this.updateModelPerformance(modelName, 'attempted');

    while (attempts < maxRetries) {
      attempts++;
      
      try {
        // Step 1: Generate with model-specific optimizations
        const optimizedPrompt = this.optimizePromptForModel(model, prompt, options);
        const generationOptions = this.getOptimizedOptions(model, options);
        
        const response = await model.generateText(optimizedPrompt, generationOptions);
        
        // Step 2: Try to extract and validate JSON
        const extractionResult = await this.extractAndValidateJson(
          response, 
          options.schema, 
          options.strictValidation
        );
        
        if (extractionResult.success) {
          this.updateModelPerformance(modelName, 'success');
          return {
            success: true,
            json: extractionResult.json,
            text: response,
            attempts,
            strategy: 'direct',
            confidence: this.calculateConfidence(response, extractionResult.json, attempts)
          };
        }
        
        errors.push(`Attempt ${attempts}: ${extractionResult.error}`);
        lastError = extractionResult.error;

        // Step 3: Apply fallback strategy
        if (attempts < maxRetries) {
          const fallbackResult = await this.applyFallbackStrategy(
            fallbackStrategy,
            response,
            prompt,
            options,
            attempts
          );
          
          if (fallbackResult.success) {
            this.updateModelPerformance(modelName, 'success');
            return {
              success: true,
              json: fallbackResult.json,
              text: response,
              attempts,
              strategy: fallbackStrategy,
              confidence: this.calculateConfidence(response, fallbackResult.json, attempts)
            };
          }
          
          errors.push(`Fallback ${attempts}: ${fallbackResult.error}`);
        }

      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        errors.push(`Generation error ${attempts}: ${errorMsg}`);
        lastError = errorMsg;
      }
    }

    // All attempts failed
    this.updateModelPerformance(modelName, 'failed');
    
    return {
      success: false,
      text: '',
      attempts,
      strategy: 'failed',
      errors,
      confidence: 0
    };
  }

  /**
   * Generate JSON with function calling support
   */
  async generateJsonWithTools(
    model: UnifiedModelInterface,
    prompt: string,
    tools: UniversalToolCall[],
    options: JsonGenerationOptions = {}
  ): Promise<JsonGenerationResult> {
    if (!model.capabilities.supportsToolCalling) {
      // Fallback to regular JSON generation with tool context
      const toolPrompt = this.embedToolsInPrompt(prompt, tools);
      return this.generateReliableJson(model, toolPrompt, options);
    }

    try {
      const result = await model.generateWithTools(prompt, tools, options);
      
      if (result.toolCalls && result.toolCalls.length > 0) {
        // Convert tool calls to JSON format
        const json = {
          function_calls: result.toolCalls.map(call => ({
            name: call.name,
            arguments: call.arguments
          }))
        };
        
        return {
          success: true,
          json,
          text: result.text,
          attempts: 1,
          strategy: 'tool_calling',
          confidence: 0.95 // High confidence for native tool calling
        };
      }
      
      // No tool calls, try to extract JSON from text
      return this.generateReliableJson(model, prompt, options);
      
    } catch (error) {
      // Fallback to embedding tools in prompt
      const toolPrompt = this.embedToolsInPrompt(prompt, tools);
      return this.generateReliableJson(model, toolPrompt, options);
    }
  }

  /**
   * Optimize prompt for specific model type
   */
  private optimizePromptForModel(
    model: UnifiedModelInterface,
    prompt: string,
    options: JsonGenerationOptions
  ): string {
    let optimizedPrompt = prompt;
    
    // Add JSON format instruction
    if (!prompt.includes('JSON') && !prompt.includes('json')) {
      optimizedPrompt += '\n\nRespond with valid JSON only.';
    }

    // Model-specific optimizations
    switch (model.backend) {
      case 'ollama':
        // Ollama models prefer explicit formatting instructions
        optimizedPrompt += '\n\nFormat your response as a JSON object with proper syntax.';
        if (options.schema) {
          optimizedPrompt += `\n\nFollow this JSON schema:\n${JSON.stringify(options.schema, null, 2)}`;
        }
        break;
        
      case 'huggingface':
        // HuggingFace models work well with structured examples
        optimizedPrompt += '\n\nExample JSON format: {"key": "value", "array": [1, 2, 3]}';
        break;
        
      case 'cloud':
        // Cloud models can handle more complex instructions
        if (options.schema) {
          optimizedPrompt += `\n\nGenerate a JSON response that validates against this schema:\n${JSON.stringify(options.schema, null, 2)}`;
        } else {
          optimizedPrompt += '\n\nReturn a well-formed JSON object.';
        }
        break;
    }

    return optimizedPrompt;
  }

  /**
   * Get optimized generation options for the model
   */
  private getOptimizedOptions(
    model: UnifiedModelInterface,
    options: JsonGenerationOptions
  ): GenerationOptions {
    const baseOptions: GenerationOptions = {
      temperature: 0.1, // Low temperature for consistency
      maxTokens: options.maxTokens || 2048,
      format: 'json'
    };

    // Model-specific optimizations
    if (model.capabilities.preferredToolFormat === 'json') {
      baseOptions.format = 'json';
    }

    // Add stop sequences to prevent over-generation
    baseOptions.stopSequences = ['\n\n', '```', 'Human:', 'Assistant:'];

    return { ...baseOptions, ...options };
  }

  /**
   * Extract and validate JSON from response text
   */
  private async extractAndValidateJson(
    text: string,
    schema?: any,
    strictValidation = false
  ): Promise<{ success: boolean; json?: any; error?: string }> {
    try {
      // Strategy 1: Direct JSON parsing
      const cleaned = this.cleanJsonText(text);
      let json = JSON.parse(cleaned);
      
      // Validate against schema if provided
      if (schema && strictValidation) {
        const valid = this.validateJsonSchema(json, schema);
        if (!valid) {
          return { success: false, error: 'Schema validation failed' };
        }
      }
      
      return { success: true, json };
      
    } catch (directError) {
      // Strategy 2: Extract JSON from markdown code blocks
      try {
        const extracted = this.extractJsonFromMarkdown(text);
        if (extracted) {
          let json = JSON.parse(extracted);
          
          if (schema && strictValidation) {
            const valid = this.validateJsonSchema(json, schema);
            if (!valid) {
              return { success: false, error: 'Schema validation failed (extracted)' };
            }
          }
          
          return { success: true, json };
        }
      } catch (extractError) {
        // Continue to next strategy
      }
      
      // Strategy 3: Find JSON-like patterns
      try {
        const pattern = this.findJsonPattern(text);
        if (pattern) {
          let json = JSON.parse(pattern);
          return { success: true, json };
        }
      } catch (patternError) {
        // Continue to repair strategy
      }
      
      return { 
        success: false, 
        error: `JSON parsing failed: ${directError instanceof Error ? directError.message : 'Unknown error'}` 
      };
    }
  }

  /**
   * Apply fallback strategy when direct JSON extraction fails
   */
  private async applyFallbackStrategy(
    strategy: 'repair' | 'extract' | 'regenerate',
    response: string,
    originalPrompt: string,
    options: JsonGenerationOptions,
    attempt: number
  ): Promise<{ success: boolean; json?: any; error?: string }> {
    switch (strategy) {
      case 'repair':
        return this.repairJson(response);
        
      case 'extract':
        return this.extractJsonAggressive(response);
        
      case 'regenerate':
        // This would require the model reference, skip for now
        return { success: false, error: 'Regenerate strategy not implemented in fallback' };
        
      default:
        return { success: false, error: 'Unknown fallback strategy' };
    }
  }

  /**
   * Clean JSON text by removing common formatting issues
   */
  private cleanJsonText(text: string): string {
    return text
      .trim()
      .replace(/^```json\s*/, '') // Remove markdown code block start
      .replace(/^```\s*/, '') // Remove generic code block start
      .replace(/```\s*$/, '') // Remove code block end
      .replace(/^\s*json\s*/, '') // Remove 'json' prefix
      .replace(/\n/g, ' ') // Replace newlines with spaces
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }

  /**
   * Extract JSON from markdown code blocks
   */
  private extractJsonFromMarkdown(text: string): string | null {
    const jsonBlockRegex = /```(?:json)?\s*(\{[\s\S]*?\})\s*```/i;
    const match = text.match(jsonBlockRegex);
    return match ? match[1].trim() : null;
  }

  /**
   * Find JSON-like patterns in text
   */
  private findJsonPattern(text: string): string | null {
    // Look for object patterns
    const objectRegex = /\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g;
    const matches = text.match(objectRegex);
    
    if (matches) {
      // Return the largest match (most likely to be complete)
      return matches.reduce((longest, current) => 
        current.length > longest.length ? current : longest
      );
    }
    
    return null;
  }

  /**
   * Attempt to repair malformed JSON
   */
  private repairJson(text: string): { success: boolean; json?: any; error?: string } {
    try {
      let repaired = text.trim();
      
      // Common repairs
      repaired = repaired
        .replace(/,\s*}/g, '}') // Remove trailing commas
        .replace(/,\s*]/g, ']') // Remove trailing commas in arrays
        .replace(/'/g, '"') // Replace single quotes with double quotes
        .replace(/(\w+):/g, '"$1":') // Quote unquoted keys
        .replace(/:\s*([^",\[\]{}]+)(?=\s*[,}])/g, ': "$1"'); // Quote unquoted string values
      
      // Try parsing the repaired JSON
      const json = JSON.parse(repaired);
      return { success: true, json };
      
    } catch (error) {
      return { 
        success: false, 
        error: `Repair failed: ${error instanceof Error ? error.message : 'Unknown error'}` 
      };
    }
  }

  /**
   * Aggressive JSON extraction using multiple strategies
   */
  private extractJsonAggressive(text: string): { success: boolean; json?: any; error?: string } {
    const strategies = [
      () => this.extractJsonFromMarkdown(text),
      () => this.findJsonPattern(text),
      () => this.extractKeyValuePairs(text),
      () => this.extractFromTextPattern(text)
    ];
    
    for (const strategy of strategies) {
      try {
        const extracted = strategy();
        if (extracted) {
          const json = JSON.parse(extracted);
          return { success: true, json };
        }
      } catch {
        continue;
      }
    }
    
    return { success: false, error: 'All extraction strategies failed' };
  }

  /**
   * Extract key-value pairs and construct JSON
   */
  private extractKeyValuePairs(text: string): string | null {
    const kvRegex = /(\w+):\s*([^,\n]+)/g;
    const pairs: string[] = [];
    let match;
    
    while ((match = kvRegex.exec(text)) !== null) {
      const key = match[1];
      const value = match[2].trim();
      
      // Determine if value should be quoted
      const shouldQuote = isNaN(Number(value)) && 
                         value !== 'true' && 
                         value !== 'false' && 
                         value !== 'null';
      
      pairs.push(`"${key}": ${shouldQuote ? `"${value}"` : value}`);
    }
    
    return pairs.length > 0 ? `{${pairs.join(', ')}}` : null;
  }

  /**
   * Extract from common text patterns
   */
  private extractFromTextPattern(text: string): string | null {
    // Look for "result: {...}" patterns
    const resultPattern = /result:\s*(\{[\s\S]*?\})/i;
    const match = text.match(resultPattern);
    return match ? match[1] : null;
  }

  /**
   * Validate JSON against schema (simplified)
   */
  private validateJsonSchema(json: any, schema: any): boolean {
    // Basic schema validation - in a real implementation, use ajv or similar
    if (schema.type === 'object' && typeof json !== 'object') return false;
    if (schema.required) {
      for (const field of schema.required) {
        if (!(field in json)) return false;
      }
    }
    return true;
  }

  /**
   * Embed tools in prompt for models without native tool calling
   */
  private embedToolsInPrompt(prompt: string, tools: UniversalToolCall[]): string {
    const toolDescriptions = tools.map(tool => 
      `- ${tool.name}: ${tool.description || 'No description'}`
    ).join('\n');
    
    return `${prompt}

Available functions:
${toolDescriptions}

To call a function, respond with JSON in this format:
{
  "function_call": {
    "name": "function_name",
    "arguments": {"arg1": "value1", "arg2": "value2"}
  }
}`;
  }

  /**
   * Calculate confidence score for generated JSON
   */
  private calculateConfidence(text: string, json: any, attempts: number): number {
    let confidence = 1.0;
    
    // Reduce confidence based on attempts
    confidence *= Math.max(0.3, 1.0 - (attempts - 1) * 0.2);
    
    // Reduce confidence for repaired/extracted JSON
    if (text.includes('```')) confidence *= 0.9; // Markdown formatting
    if (text.length > JSON.stringify(json).length * 3) confidence *= 0.8; // Verbose response
    
    // Increase confidence for clean JSON
    try {
      const cleanText = this.cleanJsonText(text);
      if (cleanText === JSON.stringify(json)) confidence *= 1.1;
    } catch {
      // Ignore errors
    }
    
    return Math.min(1.0, Math.max(0.0, confidence));
  }

  /**
   * Track model performance for future optimizations
   */
  private updateModelPerformance(modelName: string, outcome: 'attempted' | 'success' | 'failed'): void {
    if (!this.modelPerformance.has(modelName)) {
      this.modelPerformance.set(modelName, {
        attempts: 0,
        successes: 0,
        failures: 0,
        successRate: 0
      });
    }
    
    const perf = this.modelPerformance.get(modelName)!;
    
    switch (outcome) {
      case 'attempted':
        perf.attempts++;
        break;
      case 'success':
        perf.successes++;
        break;
      case 'failed':
        perf.failures++;
        break;
    }
    
    perf.successRate = perf.successes / Math.max(1, perf.successes + perf.failures);
  }

  /**
   * Get performance statistics for all models
   */
  getModelPerformanceStats(): Map<string, ModelJsonPerformance> {
    return new Map(this.modelPerformance);
  }

  /**
   * Reset performance tracking
   */
  resetPerformanceTracking(): void {
    this.modelPerformance.clear();
    this.repairAttempts.clear();
  }
}

export interface ModelJsonPerformance {
  attempts: number;
  successes: number;
  failures: number;
  successRate: number;
}

// Global instance for easy access
export const globalJsonGenerator = new ReliableJsonGenerator();