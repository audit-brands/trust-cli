/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { ErrorCollector, type ErrorRecord } from './errorCollector.js';
import { EvaluationResult } from './functionCallEvaluator.js';

describe('ErrorCollector', () => {
  let errorCollector: ErrorCollector;
  let tempDir: string;
  let tempLogPath: string;

  beforeEach(() => {
    // Create temporary directory for testing
    tempDir = path.join(process.cwd(), 'test_temp');
    tempLogPath = path.join(tempDir, 'test_error_log.json');
    
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    errorCollector = new ErrorCollector(tempLogPath);
  });

  afterEach(() => {
    // Clean up temporary files
    if (fs.existsSync(tempLogPath)) {
      fs.unlinkSync(tempLogPath);
    }
    if (fs.existsSync(tempDir)) {
      fs.rmdirSync(tempDir, { recursive: true });
    }
  });

  describe('Error Recording', () => {
    it('should record a failed function call', () => {
      const mockResult: EvaluationResult = {
        promptId: 'test_01',
        success: false,
        validJson: false,
        correctTool: false,
        correctArgs: false,
        responseTime: 1000,
        rawResponse: 'invalid response',
        parsedCalls: [],
        errors: ['JSON parsing failed']
      };

      errorCollector.recordFailure(
        'List files in directory',
        'list_directory',
        { path: '.' },
        mockResult,
        'file_operations',
        'easy',
        'phi-3.5-mini',
        0.7
      );

      const analytics = errorCollector.getAnalytics();
      expect(analytics.totalErrors).toBe(1);
      expect(analytics.errorsByType.parse_error).toBe(1);
      expect(analytics.errorsByCategory.file_operations).toBe(1);
      expect(analytics.errorsByDifficulty.easy).toBe(1);
    });

    it('should categorize different failure types correctly', () => {
      const testCases = [
        {
          result: { validJson: false, correctTool: true, correctArgs: true, errors: [] },
          expectedType: 'parse_error'
        },
        {
          result: { validJson: true, correctTool: false, correctArgs: true, errors: [] },
          expectedType: 'wrong_tool'
        },
        {
          result: { validJson: true, correctTool: true, correctArgs: false, errors: [] },
          expectedType: 'wrong_args'
        },
        {
          result: { validJson: true, correctTool: true, correctArgs: true, errors: ['validation error'] },
          expectedType: 'validation_error'
        }
      ];

      testCases.forEach((testCase, index) => {
        const mockResult: EvaluationResult = {
          promptId: `test_${index}`,
          success: false,
          responseTime: 1000,
          rawResponse: 'test response',
          parsedCalls: [],
          ...testCase.result
        };

        errorCollector.recordFailure(
          `Test prompt ${index}`,
          'test_tool',
          {},
          mockResult,
          'test',
          'easy'
        );
      });

      const analytics = errorCollector.getAnalytics();
      expect(analytics.totalErrors).toBe(4);
      expect(analytics.errorsByType.parse_error).toBe(1);
      expect(analytics.errorsByType.wrong_tool).toBe(1);
      expect(analytics.errorsByType.wrong_args).toBe(1);
      expect(analytics.errorsByType.validation_error).toBe(1);
    });

    it('should track retry attempts', () => {
      const mockResult: EvaluationResult = {
        promptId: 'test_01',
        success: false,
        validJson: false,
        correctTool: false,
        correctArgs: false,
        responseTime: 1000,
        rawResponse: 'invalid response',
        parsedCalls: [],
        errors: ['JSON parsing failed']
      };

      errorCollector.recordFailure(
        'Test prompt',
        'test_tool',
        {},
        mockResult,
        'test',
        'easy'
      );

      const errors = errorCollector.getErrorsByType('parse_error');
      expect(errors).toHaveLength(1);
      
      const errorId = errors[0].id;
      errorCollector.recordRetry(errorId);
      
      const updatedErrors = errorCollector.getErrorsByType('parse_error');
      expect(updatedErrors[0].retryCount).toBe(1);
    });
  });

  describe('Error Analysis', () => {
    beforeEach(() => {
      // Add some test data
      const mockResults = [
        {
          promptId: 'test_01',
          success: false,
          validJson: false,
          correctTool: false,
          correctArgs: false,
          responseTime: 1000,
          rawResponse: 'invalid json',
          parsedCalls: [],
          errors: ['JSON parsing failed']
        },
        {
          promptId: 'test_02',
          success: false,
          validJson: true,
          correctTool: false,
          correctArgs: false,
          responseTime: 1200,
          rawResponse: '{"tool": "wrong_tool"}',
          parsedCalls: [],
          errors: ['Wrong tool called']
        },
        {
          promptId: 'test_03',
          success: false,
          validJson: false,
          correctTool: false,
          correctArgs: false,
          responseTime: 800,
          rawResponse: 'another invalid response',
          parsedCalls: [],
          errors: ['JSON parsing failed']
        }
      ];

      mockResults.forEach((result, index) => {
        errorCollector.recordFailure(
          `Test prompt ${index}`,
          'test_tool',
          {},
          result as EvaluationResult,
          index < 2 ? 'file_operations' : 'shell_commands',
          index === 0 ? 'easy' : 'medium'
        );
      });
    });

    it('should provide correct analytics', () => {
      const analytics = errorCollector.getAnalytics();
      
      expect(analytics.totalErrors).toBe(3);
      expect(analytics.errorsByType.parse_error).toBe(2);
      expect(analytics.errorsByType.wrong_tool).toBe(1);
      expect(analytics.errorsByCategory.file_operations).toBe(2);
      expect(analytics.errorsByCategory.shell_commands).toBe(1);
      expect(analytics.errorsByDifficulty.easy).toBe(1);
      expect(analytics.errorsByDifficulty.medium).toBe(2);
    });

    it('should identify common failure patterns', () => {
      const analytics = errorCollector.getAnalytics();
      
      expect(analytics.commonFailures).toHaveLength(2);
      const parseErrorPattern = analytics.commonFailures.find(p => 
        p.pattern.includes('JSON parsing failed')
      );
      expect(parseErrorPattern).toBeDefined();
      expect(parseErrorPattern?.count).toBe(2);
    });

    it('should filter errors by criteria', () => {
      const parseErrors = errorCollector.getErrorsByType('parse_error');
      const toolErrors = errorCollector.getErrorsByType('wrong_tool');
      const fileErrors = errorCollector.getErrorsByCategory('file_operations');
      const toolSpecificErrors = errorCollector.getErrorsByTool('test_tool');

      expect(parseErrors).toHaveLength(2);
      expect(toolErrors).toHaveLength(1);
      expect(fileErrors).toHaveLength(2);
      expect(toolSpecificErrors).toHaveLength(3);
    });

    it('should filter recent errors', () => {
      const recentErrors = errorCollector.getRecentErrors(7);
      expect(recentErrors).toHaveLength(3);
      
      const oldErrors = errorCollector.getRecentErrors(0);
      expect(oldErrors).toHaveLength(0);
    });
  });

  describe('Data Persistence', () => {
    it('should persist errors to file', () => {
      const mockResult: EvaluationResult = {
        promptId: 'test_01',
        success: false,
        validJson: false,
        correctTool: false,
        correctArgs: false,
        responseTime: 1000,
        rawResponse: 'invalid response',
        parsedCalls: [],
        errors: ['JSON parsing failed']
      };

      errorCollector.recordFailure(
        'Test prompt',
        'test_tool',
        {},
        mockResult,
        'test',
        'easy'
      );

      expect(fs.existsSync(tempLogPath)).toBe(true);
      
      const fileContent = fs.readFileSync(tempLogPath, 'utf8');
      const data = JSON.parse(fileContent);
      
      expect(Array.isArray(data)).toBe(true);
      expect(data).toHaveLength(1);
      expect(data[0].prompt).toBe('Test prompt');
    });

    it('should load existing errors on initialization', () => {
      // Create a log file with existing data
      const existingData = [{
        id: 'existing_error',
        timestamp: Date.now(),
        prompt: 'Existing prompt',
        expectedTool: 'existing_tool',
        expectedArgs: {},
        actualResponse: 'response',
        parsedCalls: [],
        category: 'test',
        difficulty: 'easy',
        errors: ['existing error'],
        failureType: 'parse_error'
      }];

      fs.writeFileSync(tempLogPath, JSON.stringify(existingData, null, 2));

      // Create new error collector that should load existing data
      const newErrorCollector = new ErrorCollector(tempLogPath);
      const analytics = newErrorCollector.getAnalytics();

      expect(analytics.totalErrors).toBe(1);
      expect(analytics.errorsByType.parse_error).toBe(1);
    });

    it('should export errors to file', () => {
      const mockResult: EvaluationResult = {
        promptId: 'test_01',
        success: false,
        validJson: false,
        correctTool: false,
        correctArgs: false,
        responseTime: 1000,
        rawResponse: 'invalid response',
        parsedCalls: [],
        errors: ['JSON parsing failed']
      };

      errorCollector.recordFailure(
        'Test prompt',
        'test_tool',
        {},
        mockResult,
        'test',
        'easy'
      );

      const exportPath = path.join(tempDir, 'exported_errors.json');
      errorCollector.exportErrors(exportPath);

      expect(fs.existsSync(exportPath)).toBe(true);
      
      const exportedData = JSON.parse(fs.readFileSync(exportPath, 'utf8'));
      expect(exportedData).toHaveProperty('exportTime');
      expect(exportedData).toHaveProperty('totalErrors', 1);
      expect(exportedData).toHaveProperty('errors');
      expect(exportedData).toHaveProperty('analytics');
    });

    it('should clear errors', () => {
      const mockResult: EvaluationResult = {
        promptId: 'test_01',
        success: false,
        validJson: false,
        correctTool: false,
        correctArgs: false,
        responseTime: 1000,
        rawResponse: 'invalid response',
        parsedCalls: [],
        errors: ['JSON parsing failed']
      };

      errorCollector.recordFailure(
        'Test prompt',
        'test_tool',
        {},
        mockResult,
        'test',
        'easy'
      );

      expect(errorCollector.getAnalytics().totalErrors).toBe(1);
      expect(fs.existsSync(tempLogPath)).toBe(true);

      errorCollector.clearErrors();

      expect(errorCollector.getAnalytics().totalErrors).toBe(0);
      expect(fs.existsSync(tempLogPath)).toBe(false);
    });
  });
});