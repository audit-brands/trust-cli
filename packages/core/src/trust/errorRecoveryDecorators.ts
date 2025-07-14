/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { 
  ErrorRecoverySystem, 
  ErrorCategory, 
  RecoveryResult,
  globalErrorRecovery 
} from './errorRecoverySystem.js';

/**
 * Options for the withRecovery decorator
 */
export interface RecoveryDecoratorOptions {
  /** Error category for recovery strategy selection */
  category?: ErrorCategory;
  /** Operation name for tracking */
  operationName?: string;
  /** Enable circuit breaker */
  enableCircuitBreaker?: boolean;
  /** Cache key for response caching */
  cacheKey?: string;
  /** Custom recovery strategy overrides */
  customStrategy?: {
    maxRetries?: number;
    baseDelay?: number;
    maxDelay?: number;
    backoffMultiplier?: number;
    jitterFactor?: number;
    fallbackOptions?: string[];
    enableDegradation?: boolean;
    enableCacheFallback?: boolean;
  };
  /** Whether to return recovery metadata */
  includeMetadata?: boolean;
}

/**
 * Method decorator that adds error recovery to async methods
 */
export function withRecovery(options: RecoveryDecoratorOptions = {}) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    
    if (typeof originalMethod !== 'function') {
      throw new Error('@withRecovery can only be applied to methods');
    }

    descriptor.value = async function (...args: any[]) {
      const operationName = options.operationName || `${target.constructor.name}.${propertyKey}`;
      const category = options.category || 'unknown';
      
      // Generate cache key if needed
      let cacheKey = options.cacheKey;
      if (!cacheKey && args.length > 0) {
        // Simple cache key generation based on method name and first argument
        cacheKey = `${operationName}_${JSON.stringify(args[0]).substring(0, 100)}`;
      }

      const result = await globalErrorRecovery.executeWithRecovery(
        () => originalMethod.apply(this, args),
        {
          operationName,
          category,
          enableCircuitBreaker: options.enableCircuitBreaker,
          cacheKey,
          customStrategy: options.customStrategy
        }
      );

      if (options.includeMetadata) {
        return result;
      }

      if (!result.success) {
        throw result.error || new Error(`Operation ${operationName} failed after recovery attempts`);
      }

      return result.data;
    };

    return descriptor;
  };
}

/**
 * Class decorator that adds error recovery to all async methods
 */
export function withClassRecovery(options: RecoveryDecoratorOptions = {}) {
  return function <T extends { new(...args: any[]): {} }>(constructor: T) {
    const prototype = constructor.prototype;
    const propertyNames = Object.getOwnPropertyNames(prototype);

    for (const propertyName of propertyNames) {
      if (propertyName === 'constructor') continue;

      const descriptor = Object.getOwnPropertyDescriptor(prototype, propertyName);
      if (descriptor && typeof descriptor.value === 'function') {
        const originalMethod = descriptor.value;
        
        // Only wrap async methods
        if (originalMethod.constructor.name === 'AsyncFunction' || 
            originalMethod.toString().includes('async ')) {
          
          const methodOptions = {
            ...options,
            operationName: options.operationName || `${constructor.name}.${propertyName}`
          };

          descriptor.value = async function (...args: any[]) {
            const operationName = methodOptions.operationName!;
            const category = methodOptions.category || 'unknown';

            const result = await globalErrorRecovery.executeWithRecovery(
              () => originalMethod.apply(this, args),
              {
                operationName,
                category,
                enableCircuitBreaker: methodOptions.enableCircuitBreaker,
                customStrategy: methodOptions.customStrategy
              }
            );

            if (methodOptions.includeMetadata) {
              return result;
            }

            if (!result.success) {
              throw result.error || new Error(`Operation ${operationName} failed after recovery attempts`);
            }

            return result.data;
          };

          Object.defineProperty(prototype, propertyName, descriptor);
        }
      }
    }

    return constructor;
  };
}

/**
 * Utility function to wrap any async function with recovery
 */
export async function executeWithRecovery<T>(
  operation: () => Promise<T>,
  options: RecoveryDecoratorOptions & { operationName: string }
): Promise<T> {
  const result = await globalErrorRecovery.executeWithRecovery(
    operation,
    {
      operationName: options.operationName,
      category: options.category || 'unknown',
      enableCircuitBreaker: options.enableCircuitBreaker,
      cacheKey: options.cacheKey,
      customStrategy: options.customStrategy
    }
  );

  if (!result.success) {
    throw result.error || new Error(`Operation ${options.operationName} failed after recovery attempts`);
  }

  return result.data!;
}

/**
 * Utility function that returns recovery result with metadata
 */
export async function executeWithRecoveryResult<T>(
  operation: () => Promise<T>,
  options: RecoveryDecoratorOptions & { operationName: string }
): Promise<RecoveryResult<T>> {
  return await globalErrorRecovery.executeWithRecovery(
    operation,
    {
      operationName: options.operationName,
      category: options.category || 'unknown',
      enableCircuitBreaker: options.enableCircuitBreaker,
      cacheKey: options.cacheKey,
      customStrategy: options.customStrategy
    }
  );
}

/**
 * Error recovery mixin for classes
 */
export class ErrorRecoveryMixin {
  protected errorRecovery = globalErrorRecovery;

  /**
   * Execute operation with recovery
   */
  protected async executeWithRecovery<T>(
    operation: () => Promise<T>,
    options: RecoveryDecoratorOptions & { operationName: string }
  ): Promise<T> {
    return executeWithRecovery(operation, options);
  }

  /**
   * Execute operation and return recovery result
   */
  protected async executeWithRecoveryResult<T>(
    operation: () => Promise<T>,
    options: RecoveryDecoratorOptions & { operationName: string }
  ): Promise<RecoveryResult<T>> {
    return executeWithRecoveryResult(operation, options);
  }

  /**
   * Get recovery metrics
   */
  protected getRecoveryMetrics() {
    return this.errorRecovery.getMetrics();
  }

  /**
   * Reset degradation level
   */
  protected resetDegradation() {
    this.errorRecovery.resetDegradation();
  }
}

/**
 * Higher-order function that wraps async functions with recovery
 */
export function withRecoveryWrapper<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  options: RecoveryDecoratorOptions & { operationName: string }
): T {
  return (async (...args: any[]) => {
    return await executeWithRecovery(() => fn(...args), options);
  }) as any as T;
}

/**
 * Retry specific errors with custom logic
 */
export function retryOnError(
  errorTypes: (new (...args: any[]) => Error)[],
  maxRetries: number = 3,
  delay: number = 1000
) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      let lastError: Error;
      
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          return await originalMethod.apply(this, args);
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          
          // Check if this error type should be retried
          const shouldRetry = errorTypes.some(ErrorType => lastError instanceof ErrorType);
          
          if (!shouldRetry || attempt === maxRetries) {
            throw lastError;
          }

          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, delay * attempt));
        }
      }
      
      throw lastError!;
    };

    return descriptor;
  };
}

/**
 * Timeout decorator with recovery
 */
export function withTimeout(
  timeoutMs: number,
  options: RecoveryDecoratorOptions = {}
) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const operationName = options.operationName || `${target.constructor.name}.${propertyKey}`;
      
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`Operation ${operationName} timed out after ${timeoutMs}ms`)), timeoutMs);
      });

      const operationPromise = globalErrorRecovery.executeWithRecovery(
        () => originalMethod.apply(this, args),
        {
          operationName,
          category: options.category || 'network',
          enableCircuitBreaker: options.enableCircuitBreaker,
          customStrategy: options.customStrategy
        }
      );

      const result = await Promise.race([operationPromise, timeoutPromise]) as RecoveryResult;

      if (options.includeMetadata) {
        return result;
      }

      if (!result.success) {
        throw result.error || new Error(`Operation ${operationName} failed after recovery attempts`);
      }

      return result.data;
    };

    return descriptor;
  };
}

/**
 * Fallback decorator - provides fallback value on error
 */
export function withFallback<T>(fallbackValue: T | (() => T | Promise<T>)) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      try {
        return await originalMethod.apply(this, args);
      } catch (error) {
        if (typeof fallbackValue === 'function') {
          return await (fallbackValue as Function)();
        }
        return fallbackValue;
      }
    };

    return descriptor;
  };
}

/**
 * Circuit breaker decorator
 */
export function withCircuitBreaker(
  failureThreshold: number = 5,
  recoveryTimeout: number = 60000,
  successThreshold: number = 3
) {
  const circuitBreakers = new Map<string, any>();

  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    const breakerKey = `${target.constructor.name}.${propertyKey}`;

    descriptor.value = async function (...args: any[]) {
      // Circuit breaker logic is handled by the error recovery system
      const operationName = breakerKey;
      
      const result = await globalErrorRecovery.executeWithRecovery(
        () => originalMethod.apply(this, args),
        {
          operationName,
          category: 'unknown',
          enableCircuitBreaker: true
        }
      );

      if (!result.success) {
        throw result.error || new Error(`Operation ${operationName} failed after recovery attempts`);
      }

      return result.data;
    };

    return descriptor;
  };
}