/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  EnhancedErrorHandler,
  EnhancedError,
  ErrorSolution,
} from './enhancedErrorHandler.js';
import { TrustConfiguration } from '../config/trustConfig.js';

// Mock TrustConfiguration
vi.mock('../config/trustConfig.js', () => ({
  TrustConfiguration: vi.fn().mockImplementation(() => ({
    initialize: vi.fn(),
  })),
}));

describe('EnhancedErrorHandler', () => {
  let handler: EnhancedErrorHandler;
  let mockConfig: TrustConfiguration;

  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig = new TrustConfiguration();
    handler = new EnhancedErrorHandler(mockConfig);
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      await handler.initialize();
      expect(mockConfig.initialize).toHaveBeenCalled();
    });

    it('should create handler without config', () => {
      const defaultHandler = new EnhancedErrorHandler();
      expect(defaultHandler).toBeDefined();
    });
  });

  describe('error processing', () => {
    beforeEach(async () => {
      await handler.initialize();
    });

    it('should process model not found errors', async () => {
      const error = 'Model "qwen2.5:7b" not found';
      const enhancedError = await handler.processError(error);

      expect(enhancedError).toMatchObject({
        type: 'model_not_found',
        severity: 'medium',
        title: 'Model Not Found',
        description: expect.stringContaining('qwen2.5:7b'),
        cause: expect.stringContaining('model may not be downloaded'),
        solutions: expect.any(Array),
        relatedCommands: expect.arrayContaining(['trust model list']),
        estimatedFixTime: '2-10 minutes',
      });

      expect(enhancedError.solutions.length).toBeGreaterThan(0);
      expect(enhancedError.solutions[0]).toMatchObject({
        type: expect.stringMatching(/^(immediate|short_term|long_term)$/),
        title: expect.any(String),
        description: expect.any(String),
        commands: expect.any(Array),
        automated: expect.any(Boolean),
        difficulty: expect.stringMatching(/^(easy|moderate|advanced)$/),
        estimatedTime: expect.any(String),
      });
    });

    it('should process backend unavailable errors', async () => {
      const error = 'Connection refused to Ollama backend';
      const enhancedError = await handler.processError(error);

      expect(enhancedError).toMatchObject({
        type: 'backend_unavailable',
        severity: 'high',
        title: 'Backend Service Unavailable',
        description: expect.stringContaining('backend service'),
        relatedCommands: expect.arrayContaining(['trust status']),
      });
    });

    it('should process resource insufficient errors', async () => {
      const error = 'Out of memory: insufficient RAM to load model';
      const enhancedError = await handler.processError(error);

      expect(enhancedError).toMatchObject({
        type: 'insufficient_resources',
        severity: 'high',
        title: 'Insufficient System Resources',
        relatedCommands: expect.arrayContaining([
          'trust model-enhanced resource-check',
        ]),
      });
    });

    it('should process configuration errors', async () => {
      const error = 'Configuration invalid: missing API key';
      const enhancedError = await handler.processError(error);

      expect(enhancedError).toMatchObject({
        type: 'configuration_invalid',
        severity: 'medium',
        title: 'Configuration Issue',
        relatedCommands: expect.arrayContaining(['trust config show']),
      });
    });

    it('should process network errors', async () => {
      const error = 'Network timeout: could not reach HuggingFace API';
      const enhancedError = await handler.processError(error);

      expect(enhancedError).toMatchObject({
        type: 'network_error',
        severity: 'medium',
        title: 'Network Connection Issue',
        relatedCommands: expect.arrayContaining(['trust status --network']),
      });
    });

    it('should process permission errors', async () => {
      const error = 'Permission denied: cannot write to ~/.trust/config.json';
      const enhancedError = await handler.processError(error);

      expect(enhancedError).toMatchObject({
        type: 'permission_denied',
        severity: 'medium',
        title: 'Permission Denied',
        relatedCommands: expect.arrayContaining(['ls -la ~/.trust']),
      });
    });

    it('should process routing failed errors', async () => {
      const error = 'Intelligent routing failed: no suitable model found';
      const enhancedError = await handler.processError(error);

      expect(enhancedError).toMatchObject({
        type: 'routing_failed',
        severity: 'medium',
        title: 'Model Routing Failed',
        relatedCommands: expect.arrayContaining([
          'trust model-enhanced smart-recommend',
        ]),
      });
    });

    it('should handle Error objects', async () => {
      const error = new Error('Model "phi3.5" not found');
      const enhancedError = await handler.processError(error);

      expect(enhancedError.type).toBe('model_not_found');
      expect(enhancedError.context?.originalError).toBe(
        'Model "phi3.5" not found',
      );
      expect(enhancedError.context?.stackTrace).toBeDefined();
    });

    it('should handle generic errors gracefully', async () => {
      const error = 'Some unknown error that does not match any pattern';
      const enhancedError = await handler.processError(error);

      expect(enhancedError).toMatchObject({
        type: 'generic',
        severity: 'medium',
        title: 'Unexpected Error',
        description: expect.stringContaining(
          'could not be automatically classified',
        ),
        cause: error,
        solutions: expect.any(Array),
      });

      expect(enhancedError.solutions.length).toBeGreaterThan(0);
    });

    it('should include context in processed errors', async () => {
      const error = 'Model not found';
      const context = { userId: 'test-user', sessionId: '123' };
      const enhancedError = await handler.processError(error, context);

      expect(enhancedError.context).toMatchObject({
        ...context,
        originalError: error,
      });
    });
  });

  describe('multiple error processing', () => {
    beforeEach(async () => {
      await handler.initialize();
    });

    it('should process multiple errors and prioritize by severity', async () => {
      const errors = [
        'Model not found', // medium severity
        'Out of memory', // high severity
        'Network timeout', // medium severity
        'Connection refused', // high severity
      ];

      const enhancedErrors = await handler.processErrors(errors);

      expect(enhancedErrors).toHaveLength(4);

      // Should be sorted by severity (high first)
      expect(enhancedErrors[0].severity).toBe('high');
      expect(enhancedErrors[1].severity).toBe('high');
      expect(enhancedErrors[2].severity).toBe('medium');
      expect(enhancedErrors[3].severity).toBe('medium');
    });

    it('should handle mixed Error objects and strings', async () => {
      const errors = [
        new Error('Model not found'),
        'Connection refused',
        'Unknown error',
      ];

      const enhancedErrors = await handler.processErrors(errors);

      expect(enhancedErrors).toHaveLength(3);
      enhancedErrors.forEach((error) => {
        expect(error).toMatchObject({
          type: expect.any(String),
          severity: expect.any(String),
          title: expect.any(String),
          description: expect.any(String),
          cause: expect.any(String),
          solutions: expect.any(Array),
        });
      });
    });
  });

  describe('contextual help', () => {
    it('should provide contextual help for all error types', () => {
      const errorTypes: Array<EnhancedError['type']> = [
        'model_not_found',
        'backend_unavailable',
        'insufficient_resources',
        'configuration_invalid',
        'network_error',
        'permission_denied',
        'routing_failed',
        'generic',
      ];

      errorTypes.forEach((type) => {
        const help = handler.getContextualHelp(type);
        expect(help).toBeTruthy();
        expect(help.length).toBeGreaterThan(10);
      });
    });

    it('should return generic help for unknown error types', () => {
      const help = handler.getContextualHelp('unknown_type' as any);
      expect(help).toContain('general error');
    });
  });

  describe('error report generation', () => {
    beforeEach(async () => {
      await handler.initialize();
    });

    it('should generate comprehensive error report', async () => {
      const error = 'Model "test-model" not found';
      const enhancedError = await handler.processError(error);
      const report = handler.generateErrorReport(enhancedError);

      expect(report).toContain('❌');
      expect(report).toContain('Model Not Found');
      expect(report).toContain('Severity:');
      expect(report).toContain('Problem Description:');
      expect(report).toContain('Root Cause:');
      expect(report).toContain('Solutions:');
      expect(report).toContain('Related Commands:');
      expect(report).toContain('Estimated fix time:');
    });

    it('should include solution details in report', async () => {
      const error = 'Connection refused';
      const enhancedError = await handler.processError(error);
      const report = handler.generateErrorReport(enhancedError);

      expect(report).toContain('Commands:');
      expect(report).toContain('Time:');
      enhancedError.solutions.forEach((solution) => {
        expect(report).toContain(solution.title);
      });
    });

    it('should include context information when available', async () => {
      const error = 'Test error';
      const context = { testParam: 'value', sessionId: '123' };
      const enhancedError = await handler.processError(error, context);
      const report = handler.generateErrorReport(enhancedError);

      expect(report).toContain('Context Information:');
      expect(report).toContain('testParam');
      expect(report).toContain('sessionId');
      // Should not include internal fields
      expect(report).not.toContain('originalError');
      expect(report).not.toContain('stackTrace');
    });

    it('should include documentation link when available', async () => {
      const error = 'Model not found';
      const enhancedError = await handler.processError(error);
      const report = handler.generateErrorReport(enhancedError);

      if (enhancedError.documentation) {
        expect(report).toContain('Documentation:');
        expect(report).toContain(enhancedError.documentation);
      }
    });
  });

  describe('solution generation', () => {
    beforeEach(async () => {
      await handler.initialize();
    });

    it('should generate appropriate solutions for model not found', async () => {
      const error = 'Model "qwen2.5:7b" not found';
      const enhancedError = await handler.processError(error);

      const solutions = enhancedError.solutions;
      expect(solutions.length).toBeGreaterThan(0);

      // Should have immediate solution
      const immediateSolution = solutions.find((s) => s.type === 'immediate');
      expect(immediateSolution).toBeDefined();
      expect(immediateSolution!.commands.length).toBeGreaterThan(0);

      // Should include model download command
      const downloadSolution = solutions.find((s) =>
        s.commands.some((cmd) => cmd.includes('qwen2.5:7b')),
      );
      expect(downloadSolution).toBeDefined();
    });

    it('should generate backend-specific solutions', async () => {
      const error = 'Connection refused to backend';
      const enhancedError = await handler.processError(error);

      const solutions = enhancedError.solutions;
      const startServiceSolution = solutions.find((s) =>
        s.commands.some((cmd) => cmd.includes('ollama serve')),
      );
      expect(startServiceSolution).toBeDefined();
    });

    it('should generate resource-aware solutions', async () => {
      const error = 'Out of memory loading model';
      const enhancedError = await handler.processError(error);

      const solutions = enhancedError.solutions;
      const resourceSolution = solutions.find((s) =>
        s.commands.some((cmd) => cmd.includes('resource-check')),
      );
      expect(resourceSolution).toBeDefined();
    });

    it('should include automated solutions where appropriate', async () => {
      const error = 'Intelligent routing failed';
      const enhancedError = await handler.processError(error);

      const automatedSolution = enhancedError.solutions.find(
        (s) => s.automated,
      );
      expect(automatedSolution).toBeDefined();
      expect(automatedSolution!.commands).toEqual(
        expect.arrayContaining([expect.stringMatching(/smart-recommend/)]),
      );
    });
  });

  describe('error patterns and matching', () => {
    beforeEach(async () => {
      await handler.initialize();
    });

    it('should match various model not found patterns', async () => {
      const patterns = [
        'Model "test-model" not found',
        "Model 'test-model' not found",
        'Model test-model does not exist',
        'No such model: test-model',
        'model test-model not found',
      ];

      for (const pattern of patterns) {
        const enhancedError = await handler.processError(pattern);
        expect(enhancedError.type).toBe('model_not_found');
      }
    });

    it('should match various backend error patterns', async () => {
      const patterns = [
        'Connection refused',
        'Backend not available',
        'Ollama server not running',
        'Server not responding',
        'ECONNREFUSED',
      ];

      for (const pattern of patterns) {
        const enhancedError = await handler.processError(pattern);
        expect(enhancedError.type).toBe('backend_unavailable');
      }
    });

    it('should match various resource error patterns', async () => {
      const patterns = [
        'Out of memory',
        'Insufficient memory available',
        'Not enough disk space',
        'Disk is full',
        'RAM limit exceeded',
      ];

      for (const pattern of patterns) {
        const enhancedError = await handler.processError(pattern);
        expect(enhancedError.type).toBe('insufficient_resources');
      }
    });

    it('should be case insensitive', async () => {
      const patterns = [
        'MODEL NOT FOUND',
        'connection REFUSED',
        'Out Of Memory',
      ];

      const enhancedErrors = await handler.processErrors(patterns);

      // Errors are sorted by severity, so high severity comes first
      // backend_unavailable and insufficient_resources are both "high" severity
      // model_not_found is "medium" severity
      expect(
        enhancedErrors.find((e) => e.type === 'model_not_found'),
      ).toBeDefined();
      expect(
        enhancedErrors.find((e) => e.type === 'backend_unavailable'),
      ).toBeDefined();
      expect(
        enhancedErrors.find((e) => e.type === 'insufficient_resources'),
      ).toBeDefined();
    });
  });

  describe('edge cases and error handling', () => {
    beforeEach(async () => {
      await handler.initialize();
    });

    it('should handle empty error messages', async () => {
      const enhancedError = await handler.processError('');
      expect(enhancedError.type).toBe('generic');
    });

    it('should handle null/undefined errors gracefully', async () => {
      const enhancedError = await handler.processError(null as any);
      expect(enhancedError.type).toBe('generic');
    });

    it('should handle errors with special characters', async () => {
      const error = 'Model "test@#$%^&*()model" not found';
      const enhancedError = await handler.processError(error);
      expect(enhancedError.type).toBe('model_not_found');
    });

    it('should handle very long error messages', async () => {
      const longError = 'Model not found: ' + 'x'.repeat(1000);
      const enhancedError = await handler.processError(longError);
      expect(enhancedError.type).toBe('model_not_found');
      expect(enhancedError.context?.originalError).toBe(longError);
    });

    it('should handle empty arrays of errors', async () => {
      const enhancedErrors = await handler.processErrors([]);
      expect(enhancedErrors).toHaveLength(0);
    });
  });
});
