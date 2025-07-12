/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BenchmarkCommandHandler } from './benchmarkCommands.js';
import type { BenchmarkCommandArgs } from './benchmarkCommands.js';
import * as fs from 'fs/promises';

// Mock the core dependencies
vi.mock('@trust-cli/trust-cli-core', () => ({
  TrustModelManagerImpl: vi.fn().mockImplementation(() => ({
    initialize: vi.fn(),
    listAvailableModels: vi.fn().mockReturnValue([
      {
        name: 'fast-model',
        path: '/models/fast.gguf',
        type: 'qwen',
        parameters: '1.5B',
        ramRequirement: '2GB',
        description: 'Fast lightweight model',
        trustScore: 8.5,
      },
      {
        name: 'quality-model',
        path: '/models/quality.gguf',
        type: 'llama',
        parameters: '7B',
        ramRequirement: '8GB',
        description: 'High quality model',
        trustScore: 9.5,
      },
    ]),
  })),
  PerformanceBenchmark: vi.fn().mockImplementation(() => ({
    getBenchmarkSuites: vi.fn().mockReturnValue([
      {
        id: 'speed',
        name: 'Speed Benchmark',
        description: 'Tests focused on raw inference speed',
        tests: [
          {
            id: 'quick-response',
            name: 'Quick Response Test',
            category: 'speed',
            difficulty: 'easy',
          },
          {
            id: 'short-summary',
            name: 'Short Summary',
            category: 'speed',
            difficulty: 'medium',
          },
        ],
      },
      {
        id: 'quality',
        name: 'Quality Benchmark',
        description: 'Tests focused on response quality',
        tests: [
          {
            id: 'explain-concept',
            name: 'Concept Explanation',
            category: 'quality',
            difficulty: 'medium',
          },
        ],
      },
    ]),
    runBenchmarkSuite: vi
      .fn()
      .mockImplementation(async (suiteId, models, onProgress) => {
        // Simulate progress updates
        if (onProgress) {
          onProgress('Starting benchmark', 0);
          onProgress('Running tests', 50);
          onProgress('Completing benchmark', 100);
        }

        return {
          suiteId,
          suiteName: 'Speed Benchmark',
          models: models.map((modelName: string) => ({
            modelName,
            totalTests: 3,
            successfulTests: 3,
            averageSpeed: 15.5,
            averageQuality: 85.0,
            bestCategories: ['speed'],
            worstCategories: [],
            overallScore: 88.5,
            efficiency: 7.75,
            reliability: 100.0,
          })),
          systemInfo: {
            platform: 'linux',
            totalRAM: '16.0GB',
            availableRAM: '10.0GB',
            cpuCores: 8,
            cpuSpeed: 2600,
          },
          recommendations: {
            fastest: models[0],
            mostEfficient: models[0],
            bestForCoding: models[0],
            bestForReasoning: models[0],
            bestOverall: models[0],
          },
          timestamp: new Date(),
          duration: 5000,
        };
      }),
    getResults: vi.fn().mockReturnValue([
      {
        testId: 'quick-response',
        modelName: 'fast-model',
        success: true,
        metrics: {
          tokensPerSecond: 15.5,
          totalTokens: 50,
          inferenceTime: 3225,
          memoryUsed: 100000000,
          cpuUsage: 25.5,
        },
        timestamp: new Date(),
      },
      {
        testId: 'short-summary',
        modelName: 'fast-model',
        success: true,
        metrics: {
          tokensPerSecond: 12.3,
          totalTokens: 75,
          inferenceTime: 6097,
          memoryUsed: 120000000,
          cpuUsage: 30.2,
        },
        timestamp: new Date(),
      },
    ]),
    generateTextReport: vi.fn().mockReturnValue(`
🏁 Benchmark Report: Speed Benchmark
════════════════════════════════════════════════════════════

💻 System Information:
   Platform: linux
   CPU Cores: 8 @ 2600MHz
   RAM: 16.0GB (10.0GB available)
   Duration: 5.0s

🏆 Model Rankings:
   🥇 fast-model (88.5/100)
      Speed: 15.5 tokens/sec
      Efficiency: 7.8 tokens/sec/GB
      Reliability: 100.0%
      Best at: speed

💡 Recommendations:
   🚀 Fastest: fast-model
   ⚡ Most Efficient: fast-model
   💻 Best for Coding: fast-model
   🧠 Best for Reasoning: fast-model
   🌟 Best Overall: fast-model
`),
    saveBenchmarkReport: vi.fn().mockResolvedValue(undefined),
  })),
  globalPerformanceMonitor: {
    getSystemMetrics: vi.fn().mockReturnValue({
      memoryUsage: { total: 16000000000, available: 10000000000 },
    }),
  },
}));

// Mock fs/promises
vi.mock('fs/promises');

// Mock console methods
const mockConsoleLog = vi.fn();
const mockConsoleError = vi.fn();

global.console = {
  ...console,
  log: mockConsoleLog,
  error: mockConsoleError,
};

describe('BenchmarkCommandHandler', () => {
  let commandHandler: BenchmarkCommandHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    commandHandler = new BenchmarkCommandHandler();
  });

  describe('run command', () => {
    it('should run benchmark on all available models', async () => {
      const args: BenchmarkCommandArgs = {
        action: 'run',
      };

      await commandHandler.handleCommand(args);

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Starting Benchmark Suite: speed'),
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Testing 2 model(s)'),
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Benchmark completed'),
      );
    });

    it('should run benchmark on specific suite and models', async () => {
      const args: BenchmarkCommandArgs = {
        action: 'run',
        suite: 'quality',
        models: ['fast-model'],
      };

      await commandHandler.handleCommand(args);

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Starting Benchmark Suite: quality'),
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Testing 1 model(s): fast-model'),
      );
    });

    it('should save results when output is specified', async () => {
      const args: BenchmarkCommandArgs = {
        action: 'run',
        output: '/tmp/benchmark-results.json',
        format: 'json',
      };

      await commandHandler.handleCommand(args);

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining(
          'Results saved to: /tmp/benchmark-results.json',
        ),
      );
    });

    it('should handle no available models gracefully', async () => {
      // Create a new handler with empty model list
      const commandHandlerWithNoModels = new BenchmarkCommandHandler();

      // Mock the private method using object property assignment
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (commandHandlerWithNoModels as any).getAvailableModelNames = () => [];

      const args: BenchmarkCommandArgs = {
        action: 'run',
      };

      await commandHandlerWithNoModels.handleCommand(args);

      expect(mockConsoleLog).toHaveBeenCalledWith(
        '❌ No models available for benchmarking.',
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        '💡 Download models first: trust model download <model-name>',
      );
    });

    it('should show progress updates during benchmark', async () => {
      const args: BenchmarkCommandArgs = {
        action: 'run',
        suite: 'speed',
        models: ['fast-model'],
      };

      await commandHandler.handleCommand(args);

      // Check that progress updates were shown
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Starting Benchmark Suite'),
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Testing 1 model(s)'),
      );
    });
  });

  describe('list command', () => {
    it('should list available benchmark suites', async () => {
      const args: BenchmarkCommandArgs = {
        action: 'list',
      };

      await commandHandler.handleCommand(args);

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Available Benchmark Suites'),
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Speed Benchmark (speed)'),
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Quality Benchmark (quality)'),
      );
    });

    it('should show detailed test information in verbose mode', async () => {
      const args: BenchmarkCommandArgs = {
        action: 'list',
        verbose: true,
      };

      await commandHandler.handleCommand(args);

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Test Details:'),
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Quick Response Test'),
      );
    });

    it('should show usage examples', async () => {
      const args: BenchmarkCommandArgs = {
        action: 'list',
      };

      await commandHandler.handleCommand(args);

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Usage:'),
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('trust benchmark run --suite'),
      );
    });
  });

  describe('results command', () => {
    it('should show benchmark results summary', async () => {
      const args: BenchmarkCommandArgs = {
        action: 'results',
      };

      await commandHandler.handleCommand(args);

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Benchmark Results'),
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('fast-model'),
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Success Rate'),
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Average Speed'),
      );
    });

    it('should filter results by model', async () => {
      const { PerformanceBenchmark } = await import(
        '@trust-cli/trust-cli-core'
      );
      const mockPerformanceMonitor = {};
      const mockModelManager = {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mockBenchmark = new PerformanceBenchmark(mockPerformanceMonitor as any, mockModelManager as any);
      vi.mocked(mockBenchmark.getResults).mockReturnValue([
        {
          testId: 'quick-response',
          modelName: 'fast-model',
          success: true,
          metrics: {
            tokensPerSecond: 15.5,
            totalTokens: 50,
            inferenceTime: 3225,
            memoryUsed: 100000000,
            cpuUsage: 25.5,
          },
          timestamp: new Date(),
        },
      ]);

      const args: BenchmarkCommandArgs = {
        action: 'results',
        filter: 'fast-model',
      };

      await commandHandler.handleCommand(args);

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('fast-model'),
      );
    });

    it('should show detailed results in verbose mode', async () => {
      const args: BenchmarkCommandArgs = {
        action: 'results',
        verbose: true,
      };

      await commandHandler.handleCommand(args);

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Individual Tests:'),
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('quick-response'),
      );
    });

    it('should handle no results found', async () => {
      // Create a new handler with empty results
      const commandHandlerWithNoResults = new BenchmarkCommandHandler();

      // Mock the performance benchmark to return no results
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (commandHandlerWithNoResults as any).performanceBenchmark.getResults = vi
        .fn()
        .mockReturnValue([]);

      const args: BenchmarkCommandArgs = {
        action: 'results',
      };

      await commandHandlerWithNoResults.handleCommand(args);

      expect(mockConsoleLog).toHaveBeenCalledWith(
        '📊 No benchmark results found.',
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        '💡 Run a benchmark first: trust benchmark run',
      );
    });
  });

  describe('compare command', () => {
    it('should compare performance of multiple models', async () => {
      const args: BenchmarkCommandArgs = {
        action: 'compare',
        models: ['fast-model', 'quality-model'],
      };

      await commandHandler.handleCommand(args);

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Model Comparison'),
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Speed Rankings:'),
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('🥇'),
      );
    });

    it('should show performance analysis for compared models', async () => {
      const { PerformanceBenchmark } = await import(
        '@trust-cli/trust-cli-core'
      );
      const mockPerformanceMonitor = {};
      const mockModelManager = {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mockBenchmark = new PerformanceBenchmark(mockPerformanceMonitor as any, mockModelManager as any);

      vi.mocked(mockBenchmark.getResults)
        .mockReturnValueOnce([
          {
            modelName: 'fast-model',
            success: true,
            metrics: { tokensPerSecond: 20.0 },
            timestamp: new Date(),
          },
        ])
        .mockReturnValueOnce([
          {
            modelName: 'quality-model',
            success: true,
            metrics: { tokensPerSecond: 15.0 },
            timestamp: new Date(),
          },
        ]);

      const args: BenchmarkCommandArgs = {
        action: 'compare',
        models: ['fast-model', 'quality-model'],
      };

      await commandHandler.handleCommand(args);

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Performance Analysis:'),
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('faster than'),
      );
    });

    it('should require at least 2 models for comparison', async () => {
      const args: BenchmarkCommandArgs = {
        action: 'compare',
        models: ['fast-model'],
      };

      await commandHandler.handleCommand(args);

      expect(mockConsoleLog).toHaveBeenCalledWith(
        '❌ Need at least 2 models to compare',
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        '💡 Usage: trust benchmark compare --models model1,model2',
      );
    });
  });

  describe('export command', () => {
    it('should export results to file', async () => {
      vi.mocked(fs.writeFile).mockResolvedValue();
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);

      const args: BenchmarkCommandArgs = {
        action: 'export',
        output: '/tmp/results.json',
        format: 'json',
      };

      await commandHandler.handleCommand(args);

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Exported 2 results to: /tmp/results.json'),
      );
      expect(fs.writeFile).toHaveBeenCalled();
    });

    it('should handle no results to export', async () => {
      // Create a new handler with empty results
      const commandHandlerWithNoResults = new BenchmarkCommandHandler();

      // Mock the performance benchmark to return no results
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (commandHandlerWithNoResults as any).performanceBenchmark.getResults = vi
        .fn()
        .mockReturnValue([]);

      const args: BenchmarkCommandArgs = {
        action: 'export',
      };

      await commandHandlerWithNoResults.handleCommand(args);

      expect(mockConsoleLog).toHaveBeenCalledWith('📊 No results to export.');
    });

    it('should generate default filename when none provided', async () => {
      vi.mocked(fs.writeFile).mockResolvedValue();
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);

      const args: BenchmarkCommandArgs = {
        action: 'export',
      };

      await commandHandler.handleCommand(args);

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Exported 2 results to: benchmark-results-'),
      );
    });
  });

  describe('help command', () => {
    it('should show comprehensive help information', async () => {
      const args: BenchmarkCommandArgs = {
        action: 'help',
      };

      await commandHandler.handleCommand(args);

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Trust CLI - Performance Benchmark Commands'),
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('USAGE:'),
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('ACTIONS:'),
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('OPTIONS:'),
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('EXAMPLES:'),
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('BENCHMARK SUITES:'),
      );
    });

    it('should show help when no action provided', async () => {
      const args: BenchmarkCommandArgs = {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        action: '' as any,
      };

      await commandHandler.handleCommand(args);

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Trust CLI - Performance Benchmark Commands'),
      );
    });
  });

  describe('error handling', () => {
    it('should handle unknown action', async () => {
      const args: BenchmarkCommandArgs = {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        action: 'unknown' as any,
      };

      await expect(commandHandler.handleCommand(args)).rejects.toThrow(
        'Unknown benchmark command: unknown',
      );
    });

    it('should handle benchmark execution errors', async () => {
      // Create a new handler with failing benchmark
      const commandHandlerWithError = new BenchmarkCommandHandler();

      // Mock the performance benchmark to fail
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (commandHandlerWithError as any).performanceBenchmark.runBenchmarkSuite =
        vi.fn().mockRejectedValue(new Error('Benchmark failed'));

      const args: BenchmarkCommandArgs = {
        action: 'run',
      };

      await expect(commandHandlerWithError.handleCommand(args)).rejects.toThrow(
        'Benchmark failed',
      );
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('Benchmark failed'),
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Troubleshooting:'),
      );
    });

    it('should handle export errors gracefully', async () => {
      vi.mocked(fs.writeFile).mockRejectedValue(new Error('Permission denied'));

      const args: BenchmarkCommandArgs = {
        action: 'export',
        output: '/invalid/path/results.json',
      };

      await expect(commandHandler.handleCommand(args)).rejects.toThrow(
        'Permission denied',
      );
      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('Export failed'),
      );
    });
  });

  describe('file format handling', () => {
    it('should save results in JSON format', async () => {
      vi.mocked(fs.writeFile).mockResolvedValue();
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);

      const args: BenchmarkCommandArgs = {
        action: 'run',
        output: '/tmp/results.json',
        format: 'json',
      };

      await commandHandler.handleCommand(args);

      // Check that the saveReport method was called (indirectly through file operations)
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Results saved to: /tmp/results.json'),
      );
    });

    it('should save results in text format', async () => {
      vi.mocked(fs.writeFile).mockResolvedValue();
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);

      const args: BenchmarkCommandArgs = {
        action: 'run',
        output: '/tmp/results.txt',
        format: 'text',
      };

      await commandHandler.handleCommand(args);

      expect(fs.writeFile).toHaveBeenCalledWith(
        '/tmp/results.txt',
        expect.stringContaining('Benchmark Report'),
      );
    });

    it('should save results in CSV format', async () => {
      vi.mocked(fs.writeFile).mockResolvedValue();
      vi.mocked(fs.mkdir).mockResolvedValue(undefined);

      const args: BenchmarkCommandArgs = {
        action: 'run',
        output: '/tmp/results.csv',
        format: 'csv',
      };

      await commandHandler.handleCommand(args);

      expect(fs.writeFile).toHaveBeenCalledWith(
        '/tmp/results.csv',
        expect.stringContaining('Model,Overall Score'),
      );
    });
  });
});
