/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs';
import path from 'path';
import { FunctionCall } from '@google/genai';
import { EvaluationResult } from './functionCallEvaluator.js';

export interface ErrorRecord {
  id: string;
  timestamp: number;
  prompt: string;
  expectedTool: string;
  expectedArgs: Record<string, any>;
  actualResponse: string;
  parsedCalls: FunctionCall[];
  category: string;
  difficulty: string;
  errors: string[];
  failureType: 'parse_error' | 'wrong_tool' | 'wrong_args' | 'validation_error' | 'generation_error';
  retryCount?: number;
  model?: string;
  temperature?: number;
}

export interface ErrorAnalytics {
  totalErrors: number;
  errorsByType: Record<string, number>;
  errorsByCategory: Record<string, number>;
  errorsByDifficulty: Record<string, number>;
  commonFailures: Array<{
    pattern: string;
    count: number;
    examples: string[];
  }>;
  toolAccuracy: Record<string, {
    attempts: number;
    successes: number;
    accuracy: number;
  }>;
}

/**
 * Collects and analyzes failed function calls for improvement insights
 */
export class ErrorCollector {
  private errorLogPath: string;
  private errors: ErrorRecord[] = [];
  private maxErrorsInMemory: number = 1000;

  constructor(errorLogPath?: string) {
    this.errorLogPath = errorLogPath || path.join(process.cwd(), '.trust', 'error_log.json');
    this.ensureErrorLogDirectory();
    this.loadExistingErrors();
  }

  /**
   * Record a failed function call
   */
  recordFailure(
    prompt: string,
    expectedTool: string,
    expectedArgs: Record<string, any>,
    result: EvaluationResult,
    category: string,
    difficulty: string,
    model?: string,
    temperature?: number
  ): void {
    const errorRecord: ErrorRecord = {
      id: this.generateId(),
      timestamp: Date.now(),
      prompt,
      expectedTool,
      expectedArgs,
      actualResponse: result.rawResponse,
      parsedCalls: result.parsedCalls,
      category,
      difficulty,
      errors: result.errors || [],
      failureType: this.categorizeFailure(result),
      model,
      temperature,
    };

    this.errors.push(errorRecord);
    this.maintainMemoryLimit();
    this.persistError(errorRecord);
  }

  /**
   * Record a retry attempt
   */
  recordRetry(originalErrorId: string): void {
    const error = this.errors.find(e => e.id === originalErrorId);
    if (error) {
      error.retryCount = (error.retryCount || 0) + 1;
      this.persistError(error);
    }
  }

  /**
   * Get analytics about collected errors
   */
  getAnalytics(): ErrorAnalytics {
    const analytics: ErrorAnalytics = {
      totalErrors: this.errors.length,
      errorsByType: {},
      errorsByCategory: {},
      errorsByDifficulty: {},
      commonFailures: [],
      toolAccuracy: {},
    };

    // Count errors by type
    for (const error of this.errors) {
      analytics.errorsByType[error.failureType] = (analytics.errorsByType[error.failureType] || 0) + 1;
      analytics.errorsByCategory[error.category] = (analytics.errorsByCategory[error.category] || 0) + 1;
      analytics.errorsByDifficulty[error.difficulty] = (analytics.errorsByDifficulty[error.difficulty] || 0) + 1;

      // Track tool accuracy
      if (!analytics.toolAccuracy[error.expectedTool]) {
        analytics.toolAccuracy[error.expectedTool] = {
          attempts: 0,
          successes: 0,
          accuracy: 0,
        };
      }
      analytics.toolAccuracy[error.expectedTool].attempts++;
    }

    // Calculate tool accuracy (would need success data from evaluator)
    for (const tool of Object.keys(analytics.toolAccuracy)) {
      const stats = analytics.toolAccuracy[tool];
      stats.accuracy = stats.attempts > 0 ? (stats.successes / stats.attempts) * 100 : 0;
    }

    // Find common failure patterns
    analytics.commonFailures = this.identifyCommonFailures();

    return analytics;
  }

  /**
   * Get errors by specific criteria
   */
  getErrorsByType(failureType: string): ErrorRecord[] {
    return this.errors.filter(e => e.failureType === failureType);
  }

  getErrorsByCategory(category: string): ErrorRecord[] {
    return this.errors.filter(e => e.category === category);
  }

  getErrorsByTool(tool: string): ErrorRecord[] {
    return this.errors.filter(e => e.expectedTool === tool);
  }

  /**
   * Get recent errors (last N days)
   */
  getRecentErrors(days: number = 7): ErrorRecord[] {
    const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
    return this.errors.filter(e => e.timestamp > cutoff);
  }

  /**
   * Export errors to JSON file
   */
  exportErrors(filepath: string): void {
    const data = {
      exportTime: new Date().toISOString(),
      totalErrors: this.errors.length,
      errors: this.errors,
      analytics: this.getAnalytics(),
    };

    fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
  }

  /**
   * Clear all collected errors
   */
  clearErrors(): void {
    this.errors = [];
    if (fs.existsSync(this.errorLogPath)) {
      fs.unlinkSync(this.errorLogPath);
    }
  }

  /**
   * Print error summary to console
   */
  printSummary(): void {
    const analytics = this.getAnalytics();
    
    console.log('\n=== ERROR COLLECTION SUMMARY ===\n');
    console.log(`Total Errors Recorded: ${analytics.totalErrors}`);
    
    console.log('\nErrors by Type:');
    for (const [type, count] of Object.entries(analytics.errorsByType)) {
      console.log(`  ${type}: ${count}`);
    }
    
    console.log('\nErrors by Category:');
    for (const [category, count] of Object.entries(analytics.errorsByCategory)) {
      console.log(`  ${category}: ${count}`);
    }
    
    console.log('\nErrors by Difficulty:');
    for (const [difficulty, count] of Object.entries(analytics.errorsByDifficulty)) {
      console.log(`  ${difficulty}: ${count}`);
    }
    
    console.log('\nTool Accuracy:');
    for (const [tool, stats] of Object.entries(analytics.toolAccuracy)) {
      console.log(`  ${tool}: ${stats.attempts} attempts, ${stats.accuracy.toFixed(1)}% accuracy`);
    }
    
    if (analytics.commonFailures.length > 0) {
      console.log('\nCommon Failure Patterns:');
      for (const pattern of analytics.commonFailures.slice(0, 5)) {
        console.log(`  "${pattern.pattern}": ${pattern.count} occurrences`);
      }
    }
    
    console.log('\n=== END SUMMARY ===\n');
  }

  private ensureErrorLogDirectory(): void {
    const dir = path.dirname(this.errorLogPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  private loadExistingErrors(): void {
    if (fs.existsSync(this.errorLogPath)) {
      try {
        const data = fs.readFileSync(this.errorLogPath, 'utf8');
        const parsed = JSON.parse(data);
        this.errors = Array.isArray(parsed) ? parsed : (parsed.errors || []);
      } catch (error) {
        console.warn('Failed to load existing error log:', error);
        this.errors = [];
      }
    }
  }

  private persistError(error: ErrorRecord): void {
    try {
      // Append to file (simple approach - in production might use a database)
      const allErrors = this.loadAllErrors();
      const existingIndex = allErrors.findIndex(e => e.id === error.id);
      
      if (existingIndex >= 0) {
        allErrors[existingIndex] = error;
      } else {
        allErrors.push(error);
      }
      
      fs.writeFileSync(this.errorLogPath, JSON.stringify(allErrors, null, 2));
    } catch (error) {
      console.warn('Failed to persist error:', error);
    }
  }

  private loadAllErrors(): ErrorRecord[] {
    if (fs.existsSync(this.errorLogPath)) {
      try {
        const data = fs.readFileSync(this.errorLogPath, 'utf8');
        const parsed = JSON.parse(data);
        return Array.isArray(parsed) ? parsed : (parsed.errors || []);
      } catch (error) {
        return [];
      }
    }
    return [];
  }

  private maintainMemoryLimit(): void {
    if (this.errors.length > this.maxErrorsInMemory) {
      // Keep only the most recent errors in memory
      this.errors = this.errors.slice(-this.maxErrorsInMemory);
    }
  }

  private categorizeFailure(result: EvaluationResult): ErrorRecord['failureType'] {
    if (!result.validJson) {
      return 'parse_error';
    }
    if (!result.correctTool) {
      return 'wrong_tool';
    }
    if (!result.correctArgs) {
      return 'wrong_args';
    }
    if (result.errors && result.errors.length > 0) {
      return 'validation_error';
    }
    return 'generation_error';
  }

  private identifyCommonFailures(): Array<{
    pattern: string;
    count: number;
    examples: string[];
  }> {
    const patterns = new Map<string, { count: number; examples: string[] }>();
    
    for (const error of this.errors) {
      for (const errorMsg of error.errors) {
        // Simple pattern matching - could be more sophisticated
        const pattern = errorMsg.replace(/\d+/g, '#').replace(/['"]/g, '');
        
        if (!patterns.has(pattern)) {
          patterns.set(pattern, { count: 0, examples: [] });
        }
        
        const data = patterns.get(pattern)!;
        data.count++;
        if (data.examples.length < 3) {
          data.examples.push(errorMsg);
        }
      }
    }
    
    return Array.from(patterns.entries())
      .map(([pattern, data]) => ({ pattern, ...data }))
      .sort((a, b) => b.count - a.count);
  }

  private generateId(): string {
    return `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}