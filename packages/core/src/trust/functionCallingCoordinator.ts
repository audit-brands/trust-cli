/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { EnhancedFunctionCalling, FunctionCallingConfig } from './enhancedFunctionCalling.js';
import { UnifiedModelInterface } from './unifiedModelInterface.js';
import { UniversalToolDefinition } from './universalToolInterface.js';
import { ToolRegistry } from '../tools/tool-registry.js';
import { Config } from '../config/config.js';
import { DEFAULT_GEMINI_FLASH_MODEL } from '../config/models.js';
import { BaseTool, ToolResult, ToolCallConfirmationDetails } from '../tools/tools.js';

/**
 * Wrapper tool for universal tool definitions
 */
class UniversalToolWrapper extends BaseTool<any, ToolResult> {
  constructor(definition: UniversalToolDefinition) {
    super(
      definition.name,
      definition.name,
      definition.description,
      definition.parameters,
      false,
      false
    );
  }

  async execute(params: any, signal: AbortSignal, updateOutput?: (output: string) => void): Promise<ToolResult> {
    // This is a placeholder - the actual execution will be handled by ToolExecutionEngine
    return {
      llmContent: `Tool ${this.name} executed with params: ${JSON.stringify(params)}`,
      returnDisplay: `Tool ${this.name} completed`
    };
  }

  validateToolParams(params: any): string | null {
    // Basic validation - could be enhanced with JSON schema validation
    return null;
  }

  getDescription(params: any): string {
    return `Execute ${this.name} with the provided parameters`;
  }

  async shouldConfirmExecute(params: any, abortSignal: AbortSignal): Promise<ToolCallConfirmationDetails | false> {
    return false; // No confirmation needed for these tools
  }
}

export interface FunctionCallingMetrics {
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  averageIterations: number;
  averageConfidence: number;
  modelPerformance: Map<string, ModelFunctionCallingStats>;
}

export interface ModelFunctionCallingStats {
  modelName: string;
  totalAttempts: number;
  successfulAttempts: number;
  averageTokensUsed: number;
  averageResponseTime: number;
  preferredStrategy: 'native' | 'json' | 'text';
  commonErrors: string[];
}

/**
 * Coordinates function calling across the Trust CLI system
 */
export class FunctionCallingCoordinator {
  private enhancedCalling: EnhancedFunctionCalling;
  private toolRegistry: ToolRegistry;
  private metrics: FunctionCallingMetrics;
  private sessionHistory: Map<string, SessionHistory> = new Map();

  constructor(config?: Config) {
    this.enhancedCalling = new EnhancedFunctionCalling(config);
    
    // Create ToolRegistry with config
    if (config) {
      this.toolRegistry = new ToolRegistry(config);
    } else {
      // Create minimal config for basic functionality
      const minimalConfig = new Config({
        sessionId: `fc_coordinator_${Date.now()}`,
        targetDir: process.cwd(),
        debugMode: false,
        cwd: process.cwd(),
        model: DEFAULT_GEMINI_FLASH_MODEL
      });
      this.toolRegistry = new ToolRegistry(minimalConfig);
    }
    
    this.metrics = this.initializeMetrics();
  }

  /**
   * Execute function calling with comprehensive coordination
   */
  async executeCoordinatedFunctionCalling(
    model: UnifiedModelInterface,
    prompt: string,
    requestedTools?: string[],
    config?: FunctionCallingConfig,
    sessionId?: string
  ) {
    const startTime = Date.now();
    const session = sessionId || this.generateSessionId();
    
    try {
      // Get available tools
      const availableTools = await this.getAvailableTools(requestedTools);
      
      if (availableTools.length === 0) {
        return {
          success: false,
          finalResponse: 'No tools available for function calling',
          error: 'No tools configured'
        };
      }

      // Record session start
      this.recordSessionStart(session, model.name, prompt, availableTools.map(t => t.name));

      // Execute function calling
      const result = await this.enhancedCalling.executeWithFunctions(
        model,
        prompt,
        availableTools,
        {
          maxIterations: 5,
          allowParallelCalls: true,
          retryFailedCalls: true,
          timeoutMs: 60000,
          ...config
        }
      );

      // Record metrics
      this.recordCallMetrics(model.name, result, Date.now() - startTime);
      
      // Update session history
      this.recordSessionEnd(session, result);

      return {
        ...result,
        sessionId: session,
        toolsUsed: availableTools.map(t => t.name),
        executionTimeMs: Date.now() - startTime
      };

    } catch (error) {
      this.recordCallError(model.name, error);
      
      return {
        success: false,
        finalResponse: `Function calling coordination failed: ${error instanceof Error ? error.message : String(error)}`,
        error: error instanceof Error ? error.message : String(error),
        sessionId: session,
        executionTimeMs: Date.now() - startTime
      };
    }
  }

  /**
   * Get available tools based on request and registry
   */
  private async getAvailableTools(requestedTools?: string[]): Promise<UniversalToolDefinition[]> {
    const registeredTools = this.toolRegistry.getAllTools();
    
    if (!requestedTools || requestedTools.length === 0) {
      // Return all available tools with their definitions
      return registeredTools.map(tool => ({
        name: tool.name,
        description: tool.description || `Tool: ${tool.name}`,
        parameters: {
          type: 'object',
          properties: tool.schema.parameters?.properties || {},
          required: tool.schema.parameters?.required || []
        }
      }));
    }

    // Filter to requested tools only
    return registeredTools
      .filter(tool => requestedTools.includes(tool.name))
      .map(tool => ({
        name: tool.name,
        description: tool.description || `Tool: ${tool.name}`,
        parameters: {
          type: 'object',
          properties: tool.schema.parameters?.properties || {},
          required: tool.schema.parameters?.required || []
        }
      }));
  }

  /**
   * Register a new tool for function calling
   */
  registerTool(tool: UniversalToolDefinition): void {
    // Convert to internal format and register
    const wrapperTool = new UniversalToolWrapper(tool);
    this.toolRegistry.registerTool(wrapperTool);
  }

  /**
   * Unregister a tool
   */
  unregisterTool(toolName: string): void {
    // ToolRegistry doesn't have unregister method, but we could track and filter
    // For now, this is a placeholder
    console.warn(`Tool unregistration not fully implemented for: ${toolName}`);
  }

  /**
   * Get function calling metrics
   */
  getMetrics(): FunctionCallingMetrics {
    return { ...this.metrics };
  }

  /**
   * Get session history
   */
  getSessionHistory(sessionId: string): SessionHistory | undefined {
    return this.sessionHistory.get(sessionId);
  }

  /**
   * Get all session histories
   */
  getAllSessionHistories(): SessionHistory[] {
    return Array.from(this.sessionHistory.values());
  }

  /**
   * Clear old session histories (keep last 100)
   */
  cleanupSessions(): void {
    const sessions = Array.from(this.sessionHistory.entries());
    if (sessions.length > 100) {
      // Sort by timestamp and keep the most recent 100
      sessions.sort((a, b) => b[1].startTime - a[1].startTime);
      
      // Clear old sessions
      for (let i = 100; i < sessions.length; i++) {
        this.sessionHistory.delete(sessions[i][0]);
      }
    }
  }

  /**
   * Generate performance report
   */
  generatePerformanceReport(): string {
    const report = [];
    
    report.push('🔧 Function Calling Performance Report');
    report.push('═'.repeat(50));
    
    report.push(`\n📊 Overall Statistics:`);
    report.push(`   Total Calls: ${this.metrics.totalCalls}`);
    report.push(`   Success Rate: ${(this.metrics.successfulCalls / Math.max(1, this.metrics.totalCalls) * 100).toFixed(1)}%`);
    report.push(`   Average Iterations: ${this.metrics.averageIterations.toFixed(1)}`);
    report.push(`   Average Confidence: ${(this.metrics.averageConfidence * 100).toFixed(1)}%`);
    
    report.push(`\n🤖 Model Performance:`);
    for (const [modelName, stats] of this.metrics.modelPerformance.entries()) {
      const successRate = (stats.successfulAttempts / Math.max(1, stats.totalAttempts) * 100).toFixed(1);
      report.push(`   ${modelName}:`);
      report.push(`     Success Rate: ${successRate}%`);
      report.push(`     Avg Tokens: ${stats.averageTokensUsed.toFixed(0)}`);
      report.push(`     Avg Response Time: ${stats.averageResponseTime.toFixed(0)}ms`);
      report.push(`     Preferred Strategy: ${stats.preferredStrategy}`);
      
      if (stats.commonErrors.length > 0) {
        report.push(`     Common Errors: ${stats.commonErrors.slice(0, 3).join(', ')}`);
      }
    }
    
    report.push(`\n🛠️  Tool Usage:`);
    const toolUsage = this.calculateToolUsage();
    for (const [toolName, count] of toolUsage.entries()) {
      report.push(`   ${toolName}: ${count} calls`);
    }
    
    return report.join('\n');
  }

  /**
   * Reset all metrics and history
   */
  resetMetrics(): void {
    this.metrics = this.initializeMetrics();
    this.sessionHistory.clear();
    this.enhancedCalling.resetPerformanceTracking();
  }

  /**
   * Private helper methods
   */
  private initializeMetrics(): FunctionCallingMetrics {
    return {
      totalCalls: 0,
      successfulCalls: 0,
      failedCalls: 0,
      averageIterations: 0,
      averageConfidence: 0,
      modelPerformance: new Map()
    };
  }

  private generateSessionId(): string {
    return `fc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private recordSessionStart(
    sessionId: string,
    modelName: string,
    prompt: string,
    toolNames: string[]
  ): void {
    this.sessionHistory.set(sessionId, {
      sessionId,
      modelName,
      prompt,
      toolNames,
      startTime: Date.now(),
      endTime: 0,
      success: false,
      iterations: 0,
      confidence: 0,
      errors: []
    });
  }

  private recordSessionEnd(sessionId: string, result: any): void {
    const session = this.sessionHistory.get(sessionId);
    if (session) {
      session.endTime = Date.now();
      session.success = result.success;
      session.iterations = result.iterations;
      session.confidence = result.confidence;
      session.finalResponse = result.finalResponse;
      session.errors = result.errors || [];
    }
  }

  private recordCallMetrics(modelName: string, result: any, executionTime: number): void {
    this.metrics.totalCalls++;
    
    if (result.success) {
      this.metrics.successfulCalls++;
    } else {
      this.metrics.failedCalls++;
    }

    // Update running averages
    this.metrics.averageIterations = 
      (this.metrics.averageIterations * (this.metrics.totalCalls - 1) + result.iterations) / this.metrics.totalCalls;
    
    this.metrics.averageConfidence = 
      (this.metrics.averageConfidence * (this.metrics.totalCalls - 1) + (result.confidence || 0)) / this.metrics.totalCalls;

    // Update model-specific metrics
    if (!this.metrics.modelPerformance.has(modelName)) {
      this.metrics.modelPerformance.set(modelName, {
        modelName,
        totalAttempts: 0,
        successfulAttempts: 0,
        averageTokensUsed: 0,
        averageResponseTime: 0,
        preferredStrategy: 'native',
        commonErrors: []
      });
    }

    const modelStats = this.metrics.modelPerformance.get(modelName)!;
    modelStats.totalAttempts++;
    
    if (result.success) {
      modelStats.successfulAttempts++;
    }

    // Update running averages for model
    const tokens = result.totalTokens || 0;
    modelStats.averageTokensUsed = 
      (modelStats.averageTokensUsed * (modelStats.totalAttempts - 1) + tokens) / modelStats.totalAttempts;
    
    modelStats.averageResponseTime = 
      (modelStats.averageResponseTime * (modelStats.totalAttempts - 1) + executionTime) / modelStats.totalAttempts;

    // Track errors
    if (result.errors && result.errors.length > 0) {
      modelStats.commonErrors.push(...result.errors.slice(0, 2)); // Limit error tracking
      
      // Keep only most recent errors
      if (modelStats.commonErrors.length > 10) {
        modelStats.commonErrors = modelStats.commonErrors.slice(-10);
      }
    }
  }

  private recordCallError(modelName: string, error: any): void {
    this.metrics.totalCalls++;
    this.metrics.failedCalls++;

    const errorMsg = error instanceof Error ? error.message : String(error);
    
    if (!this.metrics.modelPerformance.has(modelName)) {
      this.metrics.modelPerformance.set(modelName, {
        modelName,
        totalAttempts: 0,
        successfulAttempts: 0,
        averageTokensUsed: 0,
        averageResponseTime: 0,
        preferredStrategy: 'native',
        commonErrors: []
      });
    }

    const modelStats = this.metrics.modelPerformance.get(modelName)!;
    modelStats.totalAttempts++;
    modelStats.commonErrors.push(errorMsg);
  }

  private calculateToolUsage(): Map<string, number> {
    const usage = new Map<string, number>();
    
    for (const session of this.sessionHistory.values()) {
      for (const toolName of session.toolNames) {
        usage.set(toolName, (usage.get(toolName) || 0) + 1);
      }
    }
    
    return usage;
  }
}

interface SessionHistory {
  sessionId: string;
  modelName: string;
  prompt: string;
  toolNames: string[];
  startTime: number;
  endTime: number;
  success: boolean;
  iterations: number;
  confidence: number;
  finalResponse?: string;
  errors: string[];
}

// Global instance for easy access (will use default config)
export const globalFunctionCallingCoordinator = new FunctionCallingCoordinator();