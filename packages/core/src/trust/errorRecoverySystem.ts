/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Error severity levels for recovery decision making
 */
export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

/**
 * Error categories for targeted recovery strategies
 */
export type ErrorCategory = 
  | 'network'           // Connection, timeout, API errors
  | 'model'            // Model loading, inference errors
  | 'memory'           // OOM, buffer overflow errors
  | 'validation'       // Input validation, schema errors
  | 'authentication'   // API key, auth errors
  | 'rate_limit'       // Rate limiting errors
  | 'parsing'          // JSON, response parsing errors
  | 'tool_execution'   // Tool calling, execution errors
  | 'context'          // Context management errors
  | 'unknown';         // Unclassified errors

/**
 * Recovery action types
 */
export type RecoveryAction = 
  | 'retry'            // Retry operation with backoff
  | 'fallback'         // Switch to fallback option
  | 'degrade'          // Reduce functionality gracefully
  | 'cache'            // Use cached response
  | 'skip'             // Skip operation and continue
  | 'abort'            // Abort operation
  | 'escalate';        // Escalate to user intervention

/**
 * Error context information
 */
export interface ErrorContext {
  /** Original error object */
  error: Error;
  /** Error category */
  category: ErrorCategory;
  /** Error severity */
  severity: ErrorSeverity;
  /** Operation that failed */
  operation: string;
  /** Timestamp of error */
  timestamp: Date;
  /** Attempt number for retries */
  attemptNumber: number;
  /** Additional metadata */
  metadata?: Record<string, any>;
  /** Recovery actions attempted */
  recoveryAttempts: RecoveryAction[];
}

/**
 * Recovery strategy configuration
 */
export interface RecoveryStrategy {
  /** Maximum retry attempts */
  maxRetries: number;
  /** Base delay for exponential backoff (ms) */
  baseDelay: number;
  /** Maximum delay cap (ms) */
  maxDelay: number;
  /** Backoff multiplier */
  backoffMultiplier: number;
  /** Jitter factor (0-1) */
  jitterFactor: number;
  /** Fallback options */
  fallbackOptions: string[];
  /** Enable graceful degradation */
  enableDegradation: boolean;
  /** Cache fallback responses */
  enableCacheFallback: boolean;
}

/**
 * Recovery result
 */
export interface RecoveryResult<T = any> {
  /** Was recovery successful */
  success: boolean;
  /** Result data if successful */
  data?: T;
  /** Recovery action taken */
  action: RecoveryAction;
  /** Final error if recovery failed */
  error?: Error;
  /** Recovery metadata */
  metadata: {
    totalAttempts: number;
    totalTime: number;
    strategyUsed: string;
    degradationLevel?: number;
    cacheHit?: boolean;
  };
}

/**
 * Error recovery metrics
 */
export interface RecoveryMetrics {
  /** Total errors encountered */
  totalErrors: number;
  /** Successful recoveries */
  successfulRecoveries: number;
  /** Recovery success rate (0-1) */
  successRate: number;
  /** Average recovery time (ms) */
  averageRecoveryTime: number;
  /** Errors by category */
  errorsByCategory: Record<ErrorCategory, number>;
  /** Errors by severity */
  errorsBySeverity: Record<ErrorSeverity, number>;
  /** Recovery actions used */
  recoveryActionsUsed: Record<RecoveryAction, number>;
  /** Current degradation level (0-1) */
  currentDegradationLevel: number;
}

/**
 * Circuit breaker state
 */
type CircuitState = 'closed' | 'open' | 'half-open';

/**
 * Circuit breaker for preventing cascade failures
 */
class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failureCount = 0;
  private lastFailureTime = 0;
  private successCount = 0;

  constructor(
    private failureThreshold: number = 5,
    private recoveryTimeout: number = 60000, // 1 minute
    private successThreshold: number = 3
  ) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime < this.recoveryTimeout) {
        throw new Error('Circuit breaker is open');
      }
      this.state = 'half-open';
      this.successCount = 0;
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;
    
    if (this.state === 'half-open') {
      this.successCount++;
      if (this.successCount >= this.successThreshold) {
        this.state = 'closed';
      }
    }
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    if (this.failureCount >= this.failureThreshold) {
      this.state = 'open';
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  reset(): void {
    this.state = 'closed';
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = 0;
  }
}

/**
 * Comprehensive error recovery system
 */
export class ErrorRecoverySystem {
  private strategies = new Map<ErrorCategory, RecoveryStrategy>();
  private metrics: RecoveryMetrics;
  private circuitBreakers = new Map<string, CircuitBreaker>();
  private errorHistory: ErrorContext[] = [];
  private recoveryCache = new Map<string, any>();
  private degradationLevel = 0;

  constructor() {
    this.metrics = {
      totalErrors: 0,
      successfulRecoveries: 0,
      successRate: 0,
      averageRecoveryTime: 0,
      errorsByCategory: {} as Record<ErrorCategory, number>,
      errorsBySeverity: {} as Record<ErrorSeverity, number>,
      recoveryActionsUsed: {} as Record<RecoveryAction, number>,
      currentDegradationLevel: 0
    };

    this.initializeDefaultStrategies();
  }

  /**
   * Execute an operation with error recovery
   */
  async executeWithRecovery<T>(
    operation: () => Promise<T>,
    options: {
      operationName: string;
      category?: ErrorCategory;
      enableCircuitBreaker?: boolean;
      cacheKey?: string;
      customStrategy?: Partial<RecoveryStrategy>;
    }
  ): Promise<RecoveryResult<T>> {
    const startTime = Date.now();
    const operationName = options.operationName;
    const category = options.category || 'unknown';
    const enableCircuitBreaker = options.enableCircuitBreaker ?? true;

    // Check cache first
    if (options.cacheKey && this.recoveryCache.has(options.cacheKey)) {
      return {
        success: true,
        data: this.recoveryCache.get(options.cacheKey),
        action: 'cache',
        metadata: {
          totalAttempts: 0,
          totalTime: 0,
          strategyUsed: 'cache',
          cacheHit: true
        }
      };
    }

    // Get or create circuit breaker
    let circuitBreaker: CircuitBreaker | undefined;
    if (enableCircuitBreaker) {
      if (!this.circuitBreakers.has(operationName)) {
        this.circuitBreakers.set(operationName, new CircuitBreaker());
      }
      circuitBreaker = this.circuitBreakers.get(operationName);
    }

    const strategy = this.getStrategy(category, options.customStrategy);
    let lastError: Error;
    let attemptNumber = 0;
    const recoveryAttempts: RecoveryAction[] = [];

    while (attemptNumber < strategy.maxRetries) {
      attemptNumber++;

      try {
        const executeOperation = async () => {
          // Apply degradation if needed
          if (this.degradationLevel > 0) {
            await this.applyDegradation(operationName, this.degradationLevel);
          }
          return await operation();
        };

        const result = circuitBreaker 
          ? await circuitBreaker.execute(executeOperation)
          : await executeOperation();

        // Success - cache result if requested
        if (options.cacheKey) {
          this.recoveryCache.set(options.cacheKey, result);
        }

        // Update metrics
        if (attemptNumber > 1) {
          this.metrics.successfulRecoveries++;
        }

        return {
          success: true,
          data: result,
          action: attemptNumber > 1 ? 'retry' : 'retry',
          metadata: {
            totalAttempts: attemptNumber,
            totalTime: Date.now() - startTime,
            strategyUsed: category,
            degradationLevel: this.degradationLevel
          }
        };

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        const errorContext: ErrorContext = {
          error: lastError,
          category,
          severity: this.classifyErrorSeverity(lastError, category),
          operation: operationName,
          timestamp: new Date(),
          attemptNumber,
          recoveryAttempts: [...recoveryAttempts]
        };

        this.recordError(errorContext);

        // Determine recovery action
        const recoveryAction = this.determineRecoveryAction(errorContext, strategy);
        recoveryAttempts.push(recoveryAction);

        switch (recoveryAction) {
          case 'retry':
            await this.delay(this.calculateDelay(attemptNumber, strategy));
            continue;

          case 'fallback':
            const fallbackResult = await this.attemptFallback(errorContext, strategy);
            if (fallbackResult.success) {
              return fallbackResult;
            }
            break;

          case 'degrade':
            this.increaseDegradation();
            await this.delay(this.calculateDelay(attemptNumber, strategy));
            continue;

          case 'cache':
            const cacheResult = this.attemptCacheRecovery(options.cacheKey);
            if (cacheResult.success) {
              return cacheResult;
            }
            break;

          case 'abort':
            break;

          case 'skip':
            return {
              success: false,
              action: 'skip',
              error: lastError,
              metadata: {
                totalAttempts: attemptNumber,
                totalTime: Date.now() - startTime,
                strategyUsed: category
              }
            };

          case 'escalate':
            // Could trigger user notification, logging, etc.
            console.error(`Operation '${operationName}' requires user intervention:`, lastError);
            break;
        }

        // If we've exhausted retries or hit abort/escalate
        if (attemptNumber >= strategy.maxRetries || 
            ['abort', 'escalate'].includes(recoveryAction)) {
          break;
        }
      }
    }

    // All recovery attempts failed
    return {
      success: false,
      action: recoveryAttempts[recoveryAttempts.length - 1] || 'abort',
      error: lastError!,
      metadata: {
        totalAttempts: attemptNumber,
        totalTime: Date.now() - startTime,
        strategyUsed: category
      }
    };
  }

  /**
   * Initialize default recovery strategies
   */
  private initializeDefaultStrategies(): void {
    // Network errors - aggressive retry with backoff
    this.strategies.set('network', {
      maxRetries: 5,
      baseDelay: 1000,
      maxDelay: 30000,
      backoffMultiplier: 2,
      jitterFactor: 0.1,
      fallbackOptions: ['cache', 'offline'],
      enableDegradation: true,
      enableCacheFallback: true
    });

    // Model errors - moderate retry with fallback
    this.strategies.set('model', {
      maxRetries: 3,
      baseDelay: 2000,
      maxDelay: 10000,
      backoffMultiplier: 1.5,
      jitterFactor: 0.2,
      fallbackOptions: ['alternative_model', 'cached_response'],
      enableDegradation: true,
      enableCacheFallback: true
    });

    // Memory errors - immediate degradation
    this.strategies.set('memory', {
      maxRetries: 2,
      baseDelay: 500,
      maxDelay: 2000,
      backoffMultiplier: 1.2,
      jitterFactor: 0.1,
      fallbackOptions: ['reduce_context', 'simple_response'],
      enableDegradation: true,
      enableCacheFallback: false
    });

    // Rate limit errors - exponential backoff
    this.strategies.set('rate_limit', {
      maxRetries: 8,
      baseDelay: 5000,
      maxDelay: 300000, // 5 minutes
      backoffMultiplier: 2.5,
      jitterFactor: 0.3,
      fallbackOptions: ['alternative_provider'],
      enableDegradation: false,
      enableCacheFallback: true
    });

    // Authentication errors - escalate quickly
    this.strategies.set('authentication', {
      maxRetries: 1,
      baseDelay: 1000,
      maxDelay: 1000,
      backoffMultiplier: 1,
      jitterFactor: 0,
      fallbackOptions: ['local_model'],
      enableDegradation: false,
      enableCacheFallback: false
    });

    // Validation errors - no retry, immediate fallback
    this.strategies.set('validation', {
      maxRetries: 1,
      baseDelay: 0,
      maxDelay: 0,
      backoffMultiplier: 1,
      jitterFactor: 0,
      fallbackOptions: ['default_values', 'simplified_input'],
      enableDegradation: false,
      enableCacheFallback: false
    });

    // Parsing errors - retry with fallback parsing
    this.strategies.set('parsing', {
      maxRetries: 3,
      baseDelay: 500,
      maxDelay: 2000,
      backoffMultiplier: 1.3,
      jitterFactor: 0.1,
      fallbackOptions: ['alternative_parser', 'manual_parsing'],
      enableDegradation: true,
      enableCacheFallback: false
    });

    // Tool execution errors - moderate retry
    this.strategies.set('tool_execution', {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 5000,
      backoffMultiplier: 1.5,
      jitterFactor: 0.2,
      fallbackOptions: ['alternative_tool', 'manual_execution'],
      enableDegradation: true,
      enableCacheFallback: false
    });

    // Context errors - immediate fallback
    this.strategies.set('context', {
      maxRetries: 2,
      baseDelay: 500,
      maxDelay: 1000,
      backoffMultiplier: 1.2,
      jitterFactor: 0.1,
      fallbackOptions: ['compress_context', 'reset_context'],
      enableDegradation: true,
      enableCacheFallback: false
    });

    // Unknown errors - conservative approach
    this.strategies.set('unknown', {
      maxRetries: 2,
      baseDelay: 2000,
      maxDelay: 5000,
      backoffMultiplier: 2,
      jitterFactor: 0.2,
      fallbackOptions: ['safe_mode'],
      enableDegradation: true,
      enableCacheFallback: true
    });
  }

  /**
   * Get recovery strategy for error category
   */
  private getStrategy(category: ErrorCategory, customStrategy?: Partial<RecoveryStrategy>): RecoveryStrategy {
    const baseStrategy = this.strategies.get(category) || this.strategies.get('unknown')!;
    return customStrategy ? { ...baseStrategy, ...customStrategy } : baseStrategy;
  }

  /**
   * Classify error severity
   */
  private classifyErrorSeverity(error: Error, category: ErrorCategory): ErrorSeverity {
    const message = error.message.toLowerCase();

    // Critical errors
    if (message.includes('out of memory') || 
        message.includes('fatal') || 
        category === 'memory') {
      return 'critical';
    }

    // High severity
    if (message.includes('authentication') || 
        message.includes('unauthorized') ||
        message.includes('forbidden') ||
        category === 'authentication') {
      return 'high';
    }

    // Medium severity
    if (message.includes('timeout') || 
        message.includes('connection') ||
        message.includes('rate limit') ||
        ['network', 'rate_limit'].includes(category)) {
      return 'medium';
    }

    // Default to low
    return 'low';
  }

  /**
   * Determine appropriate recovery action
   */
  private determineRecoveryAction(
    errorContext: ErrorContext, 
    strategy: RecoveryStrategy
  ): RecoveryAction {
    const { category, severity, attemptNumber } = errorContext;

    // Escalate critical errors immediately
    if (severity === 'critical' && attemptNumber >= 2) {
      return 'escalate';
    }

    // Authentication errors escalate quickly
    if (category === 'authentication') {
      return attemptNumber === 1 ? 'fallback' : 'escalate';
    }

    // Memory errors degrade immediately
    if (category === 'memory') {
      return attemptNumber === 1 ? 'degrade' : 'abort';
    }

    // Rate limit errors always retry with backoff
    if (category === 'rate_limit') {
      return 'retry';
    }

    // Validation errors try fallback first
    if (category === 'validation') {
      return 'fallback';
    }

    // For other categories, progressive strategy
    if (attemptNumber === 1) {
      return 'retry';
    } else if (attemptNumber === 2 && strategy.fallbackOptions.length > 0) {
      return 'fallback';
    } else if (attemptNumber === 3 && strategy.enableDegradation) {
      return 'degrade';
    } else if (strategy.enableCacheFallback) {
      return 'cache';
    }

    return 'abort';
  }

  /**
   * Attempt fallback recovery
   */
  private async attemptFallback(
    errorContext: ErrorContext,
    strategy: RecoveryStrategy
  ): Promise<RecoveryResult> {
    // This is a simplified fallback - in real implementation,
    // this would try alternative models, cached responses, etc.
    
    for (const fallbackOption of strategy.fallbackOptions) {
      try {
        // Simulate fallback attempt
        const fallbackData = await this.executeFallbackOption(fallbackOption, errorContext);
        
        return {
          success: true,
          data: fallbackData,
          action: 'fallback',
          metadata: {
            totalAttempts: errorContext.attemptNumber,
            totalTime: 0,
            strategyUsed: fallbackOption
          }
        };
      } catch (fallbackError) {
        // Continue to next fallback option
        continue;
      }
    }

    return {
      success: false,
      action: 'fallback',
      error: errorContext.error,
      metadata: {
        totalAttempts: errorContext.attemptNumber,
        totalTime: 0,
        strategyUsed: 'fallback_failed'
      }
    };
  }

  /**
   * Execute a fallback option
   */
  private async executeFallbackOption(option: string, errorContext: ErrorContext): Promise<any> {
    switch (option) {
      case 'cache':
        return this.getCachedResponse(errorContext.operation);
      case 'alternative_model':
        return this.getAlternativeModelResponse(errorContext);
      case 'simplified_response':
        return this.getSimplifiedResponse(errorContext);
      case 'default_values':
        return this.getDefaultValues(errorContext);
      default:
        throw new Error(`Unknown fallback option: ${option}`);
    }
  }

  /**
   * Attempt cache recovery
   */
  private attemptCacheRecovery(cacheKey?: string): RecoveryResult {
    if (!cacheKey || !this.recoveryCache.has(cacheKey)) {
      return {
        success: false,
        action: 'cache',
        error: new Error('No cache available'),
        metadata: {
          totalAttempts: 0,
          totalTime: 0,
          strategyUsed: 'cache_miss'
        }
      };
    }

    return {
      success: true,
      data: this.recoveryCache.get(cacheKey),
      action: 'cache',
      metadata: {
        totalAttempts: 0,
        totalTime: 0,
        strategyUsed: 'cache_hit',
        cacheHit: true
      }
    };
  }

  /**
   * Calculate delay with exponential backoff and jitter
   */
  private calculateDelay(attemptNumber: number, strategy: RecoveryStrategy): number {
    const exponentialDelay = strategy.baseDelay * Math.pow(strategy.backoffMultiplier, attemptNumber - 1);
    const cappedDelay = Math.min(exponentialDelay, strategy.maxDelay);
    const jitter = cappedDelay * strategy.jitterFactor * Math.random();
    return cappedDelay + jitter;
  }

  /**
   * Apply degradation to operation
   */
  private async applyDegradation(operationName: string, level: number): Promise<void> {
    // Simulate degradation effects
    if (level > 0.5) {
      // High degradation - add significant delay
      await this.delay(1000 * level);
    } else {
      // Low degradation - minor delay
      await this.delay(200 * level);
    }
  }

  /**
   * Increase system degradation level
   */
  private increaseDegradation(): void {
    this.degradationLevel = Math.min(1.0, this.degradationLevel + 0.1);
    this.metrics.currentDegradationLevel = this.degradationLevel;
  }

  /**
   * Record error for metrics and analysis
   */
  private recordError(errorContext: ErrorContext): void {
    this.metrics.totalErrors++;
    this.metrics.errorsByCategory[errorContext.category] = 
      (this.metrics.errorsByCategory[errorContext.category] || 0) + 1;
    this.metrics.errorsBySeverity[errorContext.severity] = 
      (this.metrics.errorsBySeverity[errorContext.severity] || 0) + 1;

    this.errorHistory.push(errorContext);
    
    // Keep only last 1000 errors
    if (this.errorHistory.length > 1000) {
      this.errorHistory.shift();
    }

    this.updateMetrics();
  }

  /**
   * Update calculated metrics
   */
  private updateMetrics(): void {
    if (this.metrics.totalErrors > 0) {
      this.metrics.successRate = this.metrics.successfulRecoveries / this.metrics.totalErrors;
    }
  }

  /**
   * Simple delay utility
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get cached response (placeholder)
   */
  private getCachedResponse(operation: string): any {
    return `Cached response for ${operation}`;
  }

  /**
   * Get alternative model response (placeholder)
   */
  private getAlternativeModelResponse(errorContext: ErrorContext): any {
    return `Alternative response for ${errorContext.operation}`;
  }

  /**
   * Get simplified response (placeholder)
   */
  private getSimplifiedResponse(errorContext: ErrorContext): any {
    return `Simplified response for ${errorContext.operation}`;
  }

  /**
   * Get default values (placeholder)
   */
  private getDefaultValues(errorContext: ErrorContext): any {
    return { message: 'Default response due to error recovery' };
  }

  /**
   * Get current metrics
   */
  getMetrics(): RecoveryMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset system degradation
   */
  resetDegradation(): void {
    this.degradationLevel = 0;
    this.metrics.currentDegradationLevel = 0;
  }

  /**
   * Reset all circuit breakers
   */
  resetCircuitBreakers(): void {
    for (const breaker of this.circuitBreakers.values()) {
      breaker.reset();
    }
  }

  /**
   * Clear error history and metrics
   */
  clearHistory(): void {
    this.errorHistory = [];
    this.metrics = {
      totalErrors: 0,
      successfulRecoveries: 0,
      successRate: 0,
      averageRecoveryTime: 0,
      errorsByCategory: {} as Record<ErrorCategory, number>,
      errorsBySeverity: {} as Record<ErrorSeverity, number>,
      recoveryActionsUsed: {} as Record<RecoveryAction, number>,
      currentDegradationLevel: this.degradationLevel
    };
  }

  /**
   * Get error history for analysis
   */
  getErrorHistory(): ErrorContext[] {
    return [...this.errorHistory];
  }
}

/**
 * Global error recovery system instance
 */
export const globalErrorRecovery = new ErrorRecoverySystem();