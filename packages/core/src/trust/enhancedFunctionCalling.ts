/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { UniversalToolCall, UniversalToolResult, UniversalToolDefinition } from './universalToolInterface.js';
import { UnifiedModelInterface, GenerationResult } from './unifiedModelInterface.js';
import { ReliableJsonGenerator, JsonGenerationOptions } from './reliableJsonGenerator.js';
import { ToolExecutionEngine, ToolExecutionContext } from './toolExecutionEngine.js';
import { ToolRegistry } from '../tools/tool-registry.js';
import { Config } from '../config/config.js';
import { DEFAULT_GEMINI_FLASH_MODEL } from '../config/models.js';

export interface FunctionCallingConfig {
  maxIterations?: number;
  allowParallelCalls?: boolean;
  requireConfirmation?: boolean;
  timeoutMs?: number;
  retryFailedCalls?: boolean;
  fallbackToText?: boolean;
}

export interface FunctionCallingResult {
  success: boolean;
  finalResponse: string;
  toolCalls: UniversalToolCall[];
  toolResults: UniversalToolResult[];
  iterations: number;
  totalTokens?: number;
  errors?: string[];
  confidence: number;
}

/**
 * Enhanced function calling system with reliable JSON generation
 */
export class EnhancedFunctionCalling {
  private jsonGenerator: ReliableJsonGenerator;
  private toolEngine: ToolExecutionEngine;
  private activeContext?: ToolExecutionContext;

  constructor(config?: Config) {
    this.jsonGenerator = new ReliableJsonGenerator();
    
    // If no config provided, create a basic ToolRegistry without full Config setup
    let toolRegistry: ToolRegistry;
    if (config) {
      toolRegistry = new ToolRegistry(config);
    } else {
      // Create minimal config for basic functionality
      const minimalConfig = new Config({
        sessionId: `enhanced_fc_${Date.now()}`,
        targetDir: process.cwd(),
        debugMode: false,
        cwd: process.cwd(),
        model: DEFAULT_GEMINI_FLASH_MODEL
      });
      toolRegistry = new ToolRegistry(minimalConfig);
    }
    
    this.toolEngine = new ToolExecutionEngine(toolRegistry);
  }

  /**
   * Execute function calling conversation with reliable JSON handling
   */
  async executeWithFunctions(
    model: UnifiedModelInterface,
    prompt: string,
    tools: UniversalToolDefinition[],
    config: FunctionCallingConfig = {}
  ): Promise<FunctionCallingResult> {
    const maxIterations = config.maxIterations ?? 5;
    const allowParallel = config.allowParallelCalls ?? true;
    const timeoutMs = config.timeoutMs ?? 30000;
    
    let iteration = 0;
    let currentPrompt = prompt;
    let allToolCalls: UniversalToolCall[] = [];
    let allToolResults: UniversalToolResult[] = [];
    let totalTokens = 0;
    const errors: string[] = [];
    let confidence = 1.0;

    // Set up execution context
    this.activeContext = {
      sessionId: `fc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId: 'system',
      workingDirectory: process.cwd(),
      securityConfig: {
        allowFileOperations: true,
        allowNetworkAccess: false,
        allowShellExecution: false,
        maxExecutionTime: timeoutMs,
        maxFileSize: 10 * 1024 * 1024 // 10MB
      }
    };

    try {
      while (iteration < maxIterations) {
        iteration++;
        
        // Generate response with function calling capability
        const generationResult = await this.generateWithReliableJsonHandling(
          model,
          currentPrompt,
          tools,
          config
        );

        totalTokens += generationResult.usage?.totalTokens || 0;
        confidence = Math.min(confidence, generationResult.confidence || 0.8);

        // Check if any functions were called
        if (!generationResult.toolCalls || generationResult.toolCalls.length === 0) {
          // No function calls, return final response
          return {
            success: true,
            finalResponse: generationResult.text,
            toolCalls: allToolCalls,
            toolResults: allToolResults,
            iterations: iteration,
            totalTokens,
            confidence
          };
        }

        // Execute function calls
        const executionResults = await this.executeToolCalls(
          generationResult.toolCalls,
          allowParallel,
          config
        );

        allToolCalls.push(...generationResult.toolCalls);
        allToolResults.push(...executionResults.results);
        
        if (executionResults.errors.length > 0) {
          errors.push(...executionResults.errors);
          confidence *= 0.9; // Reduce confidence for errors
        }

        // Build context for next iteration
        currentPrompt = this.buildContextPrompt(
          prompt,
          allToolCalls,
          allToolResults,
          generationResult.text
        );

        // Check if we should continue
        if (this.shouldStopIteration(generationResult.text, executionResults.results)) {
          break;
        }
      }

      // Maximum iterations reached
      const finalResponse = await this.generateFinalResponse(
        model,
        currentPrompt,
        allToolCalls,
        allToolResults
      );

      return {
        success: true,
        finalResponse: finalResponse.text,
        toolCalls: allToolCalls,
        toolResults: allToolResults,
        iterations: iteration,
        totalTokens: totalTokens + (finalResponse.usage?.totalTokens || 0),
        errors: errors.length > 0 ? errors : undefined,
        confidence: confidence * 0.8 // Reduce confidence for max iterations
      };

    } catch (error) {
      return {
        success: false,
        finalResponse: `Function calling failed: ${error instanceof Error ? error.message : String(error)}`,
        toolCalls: allToolCalls,
        toolResults: allToolResults,
        iterations: iteration,
        totalTokens,
        errors: [...errors, error instanceof Error ? error.message : String(error)],
        confidence: 0
      };
    }
  }

  /**
   * Generate response with reliable JSON handling for function calls
   */
  private async generateWithReliableJsonHandling(
    model: UnifiedModelInterface,
    prompt: string,
    tools: UniversalToolDefinition[],
    config: FunctionCallingConfig
  ): Promise<GenerationResult & { confidence?: number }> {
    // Convert tool definitions to tool calls format for the generator
    const toolCalls: UniversalToolCall[] = tools.map(tool => ({
      id: `def_${tool.name}`,
      name: tool.name,
      description: tool.description,
      arguments: tool.parameters.properties || {}
    }));

    // Try native function calling first
    if (model.capabilities.supportsToolCalling) {
      try {
        const result = await model.generateWithTools(prompt, toolCalls);
        
        if (result.toolCalls && result.toolCalls.length > 0) {
          return { ...result, confidence: 0.95 };
        }
        
        // No tool calls detected, fallback to JSON generation
      } catch (error) {
        // Native tool calling failed, fallback to JSON generation
      }
    }

    // Fallback to reliable JSON generation
    const jsonOptions: JsonGenerationOptions = {
      maxRetries: 3,
      fallbackStrategy: 'repair',
      strictValidation: false,
      modelSpecific: true,
      schema: {
        type: 'object',
        properties: {
          function_call: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              arguments: { type: 'object' }
            },
            required: ['name', 'arguments']
          },
          response: { type: 'string' }
        }
      }
    };

    const jsonResult = await this.jsonGenerator.generateJsonWithTools(
      model,
      prompt,
      toolCalls,
      jsonOptions
    );

    if (jsonResult.success && jsonResult.json) {
      return {
        text: jsonResult.json.response || jsonResult.text,
        toolCalls: this.parseToolCallsFromJson(jsonResult.json),
        finishReason: 'tool_call',
        usage: {
          promptTokens: Math.ceil(prompt.length / 4),
          completionTokens: Math.ceil(jsonResult.text.length / 4),
          totalTokens: Math.ceil((prompt.length + jsonResult.text.length) / 4)
        },
        confidence: jsonResult.confidence
      };
    }

    // If JSON generation also failed, return text response
    return {
      text: jsonResult.text || 'Function calling failed to generate valid response',
      finishReason: 'stop',
      usage: {
        promptTokens: Math.ceil(prompt.length / 4),
        completionTokens: Math.ceil((jsonResult.text || '').length / 4),
        totalTokens: Math.ceil((prompt.length + (jsonResult.text || '').length) / 4)
      },
      confidence: 0.3
    };
  }

  /**
   * Parse tool calls from JSON response
   */
  private parseToolCallsFromJson(json: any): UniversalToolCall[] {
    const toolCalls: UniversalToolCall[] = [];

    // Handle single function call
    if (json.function_call) {
      toolCalls.push({
        id: `json_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: json.function_call.name,
        arguments: json.function_call.arguments || {},
        description: `Function call: ${json.function_call.name}`
      });
    }

    // Handle multiple function calls
    if (json.function_calls && Array.isArray(json.function_calls)) {
      json.function_calls.forEach((call: any, index: number) => {
        toolCalls.push({
          id: `json_${Date.now()}_${index}`,
          name: call.name,
          arguments: call.arguments || {},
          description: `Function call: ${call.name}`
        });
      });
    }

    return toolCalls;
  }

  /**
   * Execute tool calls with proper error handling
   */
  private async executeToolCalls(
    toolCalls: UniversalToolCall[],
    allowParallel: boolean,
    config: FunctionCallingConfig
  ): Promise<{ results: UniversalToolResult[]; errors: string[] }> {
    const results: UniversalToolResult[] = [];
    const errors: string[] = [];

    if (!this.activeContext) {
      throw new Error('No active execution context');
    }

    if (allowParallel) {
      // Execute all calls in parallel
      const promises = toolCalls.map(async (call) => {
        try {
          return await this.toolEngine.executeToolCall(call, this.activeContext!);
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          errors.push(`Tool ${call.name} failed: ${errorMsg}`);
          return {
            id: call.id,
            name: call.name,
            result: null,
            error: errorMsg,
            isError: true
          };
        }
      });

      const parallelResults = await Promise.allSettled(promises);
      
      parallelResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          const call = toolCalls[index];
          errors.push(`Tool ${call.name} execution failed: ${result.reason}`);
          results.push({
            id: call.id,
            name: call.name,
            result: null,
            error: result.reason instanceof Error ? result.reason.message : String(result.reason),
            isError: true
          });
        }
      });
      
    } else {
      // Execute calls sequentially
      for (const call of toolCalls) {
        try {
          const result = await this.toolEngine.executeToolCall(call, this.activeContext);
          results.push(result);
          
          // If retry is disabled and this call failed, stop execution
          if (!config.retryFailedCalls && result.isError) {
            break;
          }
          
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          errors.push(`Tool ${call.name} failed: ${errorMsg}`);
          
          results.push({
            id: call.id,
            name: call.name,
            result: null,
            error: errorMsg,
            isError: true
          });
          
          if (!config.retryFailedCalls) {
            break;
          }
        }
      }
    }

    return { results, errors };
  }

  /**
   * Build context prompt for next iteration
   */
  private buildContextPrompt(
    originalPrompt: string,
    toolCalls: UniversalToolCall[],
    toolResults: UniversalToolResult[],
    lastResponse: string
  ): string {
    let contextPrompt = originalPrompt;

    if (toolCalls.length > 0) {
      contextPrompt += '\n\nPrevious function calls:';
      
      toolCalls.forEach((call, index) => {
        const result = toolResults[index];
        contextPrompt += `\n- ${call.name}(${JSON.stringify(call.arguments)})`;
        
        if (result) {
          if (result.isError) {
            contextPrompt += ` → Error: ${result.error}`;
          } else {
            contextPrompt += ` → Result: ${JSON.stringify(result.result)}`;
          }
        }
      });
    }

    if (lastResponse) {
      contextPrompt += `\n\nPrevious response: ${lastResponse}`;
    }

    contextPrompt += '\n\nBased on the function call results above, provide your final response or make additional function calls if needed.';

    return contextPrompt;
  }

  /**
   * Determine if iteration should stop
   */
  private shouldStopIteration(
    lastResponse: string,
    lastResults: UniversalToolResult[]
  ): boolean {
    // Stop if response contains conclusion indicators
    const conclusionIndicators = [
      'final answer',
      'conclusion',
      'complete',
      'finished',
      'done',
      'no more',
      'that\'s all'
    ];

    const lowerResponse = lastResponse.toLowerCase();
    if (conclusionIndicators.some(indicator => lowerResponse.includes(indicator))) {
      return true;
    }

    // Stop if all recent tool calls failed
    if (lastResults.length > 0 && lastResults.every(result => result.isError)) {
      return true;
    }

    return false;
  }

  /**
   * Generate final response summarizing the conversation
   */
  private async generateFinalResponse(
    model: UnifiedModelInterface,
    contextPrompt: string,
    allToolCalls: UniversalToolCall[],
    allToolResults: UniversalToolResult[]
  ): Promise<GenerationResult> {
    const finalPrompt = `${contextPrompt}

Please provide a final comprehensive response based on all the function calls and their results. Do not make any additional function calls.`;

    try {
      return await model.generateText(finalPrompt, {
        temperature: 0.3,
        maxTokens: 1000
      }).then(text => ({
        text,
        finishReason: 'stop',
        usage: {
          promptTokens: Math.ceil(finalPrompt.length / 4),
          completionTokens: Math.ceil(text.length / 4),
          totalTokens: Math.ceil((finalPrompt.length + text.length) / 4)
        }
      }));
    } catch (error) {
      return {
        text: `Unable to generate final response: ${error instanceof Error ? error.message : String(error)}`,
        finishReason: 'error'
      };
    }
  }

  /**
   * Get performance statistics
   */
  getPerformanceStats() {
    return this.jsonGenerator.getModelPerformanceStats();
  }

  /**
   * Reset performance tracking
   */
  resetPerformanceTracking() {
    this.jsonGenerator.resetPerformanceTracking();
  }
}

// Global instance for easy access (will use default config)
export const globalFunctionCalling = new EnhancedFunctionCalling();