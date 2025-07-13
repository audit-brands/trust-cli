/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { FunctionCall } from '@google/genai';
import { UniversalToolCall, UniversalToolResult, UniversalToolDefinition } from './universalToolInterface.js';
import { ToolRegistry } from '../tools/tool-registry.js';

/**
 * Security and validation configuration for tool execution
 */
export interface ToolSecurityConfig {
  allowFileOperations: boolean;
  allowNetworkAccess: boolean;
  allowShellExecution: boolean;
  maxExecutionTime: number; // milliseconds
  allowedPaths?: string[];
  blockedPaths?: string[];
  maxFileSize?: number; // bytes
}

/**
 * Tool execution context with security controls
 */
export interface ToolExecutionContext {
  userId?: string;
  sessionId: string;
  workingDirectory: string;
  securityConfig: ToolSecurityConfig;
  metadata?: Record<string, any>;
}

/**
 * Tool execution result with detailed information
 */
export interface ToolExecutionResult {
  success: boolean;
  result: any;
  error?: string;
  executionTime: number;
  resourceUsage?: {
    memoryUsed: number;
    cpuTime: number;
  };
  warnings?: string[];
}

/**
 * Backend-agnostic tool execution engine with security and validation
 */
export class ToolExecutionEngine {
  private toolRegistry: ToolRegistry;
  private defaultSecurityConfig: ToolSecurityConfig;
  private executionHistory: Map<string, ToolExecutionResult[]> = new Map();

  constructor(
    toolRegistry: ToolRegistry,
    defaultSecurityConfig?: Partial<ToolSecurityConfig>
  ) {
    this.toolRegistry = toolRegistry;
    this.defaultSecurityConfig = {
      allowFileOperations: true,
      allowNetworkAccess: false,
      allowShellExecution: false,
      maxExecutionTime: 30000, // 30 seconds
      maxFileSize: 10 * 1024 * 1024, // 10MB
      ...defaultSecurityConfig
    };
  }

  /**
   * Execute a universal tool call with security validation
   */
  async executeToolCall(
    call: UniversalToolCall,
    context: ToolExecutionContext
  ): Promise<UniversalToolResult> {
    const startTime = Date.now();
    
    try {
      // Validate tool call
      const validationResult = await this.validateToolCall(call, context);
      if (!validationResult.valid) {
        return {
          id: call.id,
          name: call.name,
          result: null,
          error: `Validation failed: ${validationResult.error}`,
          isError: true
        };
      }

      // Execute with timeout
      const result = await this.executeWithTimeout(call, context);
      
      const executionTime = Date.now() - startTime;
      
      // Log execution for audit
      this.logExecution(call, context, result, executionTime);

      return {
        id: call.id,
        name: call.name,
        result: result.result,
        error: result.error,
        isError: !result.success
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      this.logExecution(call, context, { success: false, result: null, error: errorMessage, executionTime }, executionTime);

      return {
        id: call.id,
        name: call.name,
        result: null,
        error: errorMessage,
        isError: true
      };
    }
  }

  /**
   * Execute multiple tool calls in sequence or parallel
   */
  async executeToolCalls(
    calls: UniversalToolCall[],
    context: ToolExecutionContext,
    parallel: boolean = false
  ): Promise<UniversalToolResult[]> {
    if (parallel) {
      // Execute all calls in parallel
      const promises = calls.map(call => this.executeToolCall(call, context));
      return Promise.all(promises);
    } else {
      // Execute calls sequentially
      const results: UniversalToolResult[] = [];
      for (const call of calls) {
        const result = await this.executeToolCall(call, context);
        results.push(result);
        
        // Stop on critical errors if configured
        if (result.isError && this.isCriticalError(result.error)) {
          break;
        }
      }
      return results;
    }
  }

  /**
   * Validate tool call parameters and security constraints
   */
  private async validateToolCall(
    call: UniversalToolCall,
    context: ToolExecutionContext
  ): Promise<{ valid: boolean; error?: string }> {
    // Check if tool exists
    const tool = this.toolRegistry.getTool(call.name);
    if (!tool) {
      return { valid: false, error: `Tool '${call.name}' not found` };
    }

    // Validate tool-specific security constraints
    if (call.name === 'execute_shell' && !context.securityConfig.allowShellExecution) {
      return { valid: false, error: 'Shell execution is not allowed' };
    }

    if (call.name.includes('file') && !context.securityConfig.allowFileOperations) {
      return { valid: false, error: 'File operations are not allowed' };
    }

    if (call.name.includes('http') || call.name.includes('fetch')) {
      if (!context.securityConfig.allowNetworkAccess) {
        return { valid: false, error: 'Network access is not allowed' };
      }
    }

    // Validate file paths if present
    if (call.arguments.path || call.arguments.filename) {
      const path = call.arguments.path || call.arguments.filename;
      const pathValidation = this.validatePath(path, context.securityConfig);
      if (!pathValidation.valid) {
        return pathValidation;
      }
    }

    // Validate argument types and required fields
    try {
      const toolDefinition = this.getToolDefinition(call.name);
      if (toolDefinition) {
        const argValidation = this.validateArguments(call.arguments, toolDefinition);
        if (!argValidation.valid) {
          return argValidation;
        }
      }
    } catch (error) {
      return { valid: false, error: `Argument validation failed: ${error}` };
    }

    return { valid: true };
  }

  /**
   * Execute tool call with timeout protection
   */
  private async executeWithTimeout(
    call: UniversalToolCall,
    context: ToolExecutionContext
  ): Promise<ToolExecutionResult> {
    const timeout = context.securityConfig.maxExecutionTime;
    
    return new Promise(async (resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Tool execution timed out after ${timeout}ms`));
      }, timeout);

      try {
        const startTime = Date.now();
        
        // Get and execute the tool
        const tool = this.toolRegistry.getTool(call.name || 'unknown');
        if (!tool) {
          throw new Error(`Tool '${call.name}' not found`);
        }
        
        // Create abort controller for timeout
        const abortController = new AbortController();
        const timeoutHandle = setTimeout(() => {
          abortController.abort();
        }, timeout);
        
        const result = await tool.execute(call.arguments || {}, abortController.signal);
        clearTimeout(timeoutHandle);
        
        const executionTime = Date.now() - startTime;
        
        clearTimeout(timeoutId);
        resolve({
          success: true,
          result: result,
          executionTime,
          warnings: []
        });
      } catch (error) {
        clearTimeout(timeoutId);
        const executionTime = Date.now() - Date.now();
        resolve({
          success: false,
          result: null,
          error: error instanceof Error ? error.message : String(error),
          executionTime,
          warnings: []
        });
      }
    });
  }

  /**
   * Validate file paths against security policy
   */
  private validatePath(
    path: string,
    securityConfig: ToolSecurityConfig
  ): { valid: boolean; error?: string } {
    // Check if path is absolute (required for security)
    if (!path.startsWith('/') && !path.match(/^[A-Za-z]:\\/)) {
      return { valid: false, error: 'Path must be absolute' };
    }

    // Check blocked paths
    if (securityConfig.blockedPaths) {
      for (const blockedPath of securityConfig.blockedPaths) {
        if (path.startsWith(blockedPath)) {
          return { valid: false, error: `Access to path '${blockedPath}' is blocked` };
        }
      }
    }

    // Check allowed paths (if specified)
    if (securityConfig.allowedPaths && securityConfig.allowedPaths.length > 0) {
      const isAllowed = securityConfig.allowedPaths.some(allowedPath => 
        path.startsWith(allowedPath)
      );
      if (!isAllowed) {
        return { valid: false, error: 'Path is not in allowed directories' };
      }
    }

    // Check for directory traversal attempts
    if (path.includes('..') || path.includes('./') || path.includes('.\\')) {
      return { valid: false, error: 'Path contains directory traversal sequences' };
    }

    return { valid: true };
  }

  /**
   * Validate arguments against tool definition schema
   */
  private validateArguments(
    args: Record<string, any>,
    toolDefinition: UniversalToolDefinition
  ): { valid: boolean; error?: string } {
    const { parameters } = toolDefinition;
    
    // Check required parameters
    if (parameters.required) {
      for (const requiredParam of parameters.required) {
        if (!(requiredParam in args)) {
          return { valid: false, error: `Missing required parameter: ${requiredParam}` };
        }
      }
    }

    // Validate parameter types
    for (const [paramName, paramValue] of Object.entries(args)) {
      const paramSchema = parameters.properties[paramName];
      if (paramSchema) {
        const typeValidation = this.validateParameterType(paramValue, paramSchema);
        if (!typeValidation.valid) {
          return { valid: false, error: `Parameter '${paramName}': ${typeValidation.error}` };
        }
      }
    }

    return { valid: true };
  }

  /**
   * Validate parameter type against schema
   */
  private validateParameterType(
    value: any,
    schema: any
  ): { valid: boolean; error?: string } {
    const { type, minimum, maximum, pattern, enum: enumValues } = schema;

    // Type checking
    if (type === 'string' && typeof value !== 'string') {
      return { valid: false, error: `Expected string, got ${typeof value}` };
    }
    
    if (type === 'number' && typeof value !== 'number') {
      return { valid: false, error: `Expected number, got ${typeof value}` };
    }
    
    if (type === 'boolean' && typeof value !== 'boolean') {
      return { valid: false, error: `Expected boolean, got ${typeof value}` };
    }

    // Range checking for numbers
    if (type === 'number') {
      if (minimum !== undefined && value < minimum) {
        return { valid: false, error: `Value ${value} is below minimum ${minimum}` };
      }
      if (maximum !== undefined && value > maximum) {
        return { valid: false, error: `Value ${value} is above maximum ${maximum}` };
      }
    }

    // Pattern checking for strings
    if (type === 'string' && pattern) {
      const regex = new RegExp(pattern);
      if (!regex.test(value)) {
        return { valid: false, error: `Value does not match pattern ${pattern}` };
      }
    }

    // Enum checking
    if (enumValues && !enumValues.includes(value)) {
      return { valid: false, error: `Value must be one of: ${enumValues.join(', ')}` };
    }

    return { valid: true };
  }

  /**
   * Get tool definition for validation
   */
  private getToolDefinition(toolName: string): UniversalToolDefinition | null {
    // This would need to be implemented based on how tool definitions are stored
    // For now, return null to skip schema validation
    return null;
  }

  /**
   * Check if an error is critical and should stop execution
   */
  private isCriticalError(error?: string): boolean {
    if (!error) return false;
    
    const criticalErrors = [
      'security violation',
      'permission denied',
      'access denied',
      'authentication failed'
    ];
    
    return criticalErrors.some(criticalError => 
      error.toLowerCase().includes(criticalError)
    );
  }

  /**
   * Log tool execution for audit and monitoring
   */
  private logExecution(
    call: UniversalToolCall,
    context: ToolExecutionContext,
    result: ToolExecutionResult,
    executionTime: number
  ): void {
    const sessionHistory = this.executionHistory.get(context.sessionId) || [];
    sessionHistory.push({
      ...result,
      executionTime
    });
    this.executionHistory.set(context.sessionId, sessionHistory);

    // Log for debugging (in production, this would go to proper logging system)
    console.log(`🔧 Tool executed: ${call.name} (${executionTime}ms) - ${result.success ? 'SUCCESS' : 'FAILED'}`);
    if (!result.success) {
      console.warn(`   Error: ${result.error}`);
    }
  }

  /**
   * Get execution history for a session
   */
  getExecutionHistory(sessionId: string): ToolExecutionResult[] {
    return this.executionHistory.get(sessionId) || [];
  }

  /**
   * Clear execution history for a session
   */
  clearExecutionHistory(sessionId: string): void {
    this.executionHistory.delete(sessionId);
  }

  /**
   * Get execution statistics
   */
  getExecutionStats(sessionId: string): {
    totalExecutions: number;
    successfulExecutions: number;
    failedExecutions: number;
    averageExecutionTime: number;
  } {
    const history = this.getExecutionHistory(sessionId);
    const totalExecutions = history.length;
    const successfulExecutions = history.filter(h => h.success).length;
    const failedExecutions = totalExecutions - successfulExecutions;
    const averageExecutionTime = totalExecutions > 0 
      ? history.reduce((sum, h) => sum + h.executionTime, 0) / totalExecutions 
      : 0;

    return {
      totalExecutions,
      successfulExecutions,
      failedExecutions,
      averageExecutionTime
    };
  }
}