/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PerformanceBenchmark } from './performanceBenchmark.js';
import { PerformanceMonitor } from './performanceMonitor.js';
import { TrustModelManagerImpl } from './modelManager.js';
import { TrustModelConfig } from './types.js';

describe('PerformanceBenchmark', () => {
  let benchmark: PerformanceBenchmark;
  let mockPerformanceMonitor: PerformanceMonitor;
  let mockModelManager: TrustModelManagerImpl;

  const sampleModels: TrustModelConfig[] = [
    {
      name: 'fast-model',
      path: '/models/fast.gguf',
      type: 'qwen',
      quantization: 'Q4_K_M',
      contextSize: 2048,
      ramRequirement: '2GB',
      description: 'Fast lightweight model',
      parameters: '1.5B',
      trustScore: 8.5,
      downloadUrl: 'https://example.com/fast.gguf',
      verificationHash: 'sha256:fast',
      expectedSize: 1000000000
    },
    {
      name: 'quality-model',
      path: '/models/quality.gguf',
      type: 'llama',
      quantization: 'Q8_0',
      contextSize: 4096,
      ramRequirement: '8GB',
      description: 'High quality model',
      parameters: '7B',
      trustScore: 9.5,
      downloadUrl: 'https://example.com/quality.gguf',
      verificationHash: 'sha256:quality',
      expectedSize: 4000000000
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock PerformanceMonitor
    mockPerformanceMonitor = {
      getSystemMetrics: vi.fn().mockReturnValue({
        cpuUsage: 25,
        memoryUsage: {
          total: 16 * 1024 * 1024 * 1024, // 16GB
          used: 6 * 1024 * 1024 * 1024,   // 6GB
          free: 10 * 1024 * 1024 * 1024,  // 10GB
          available: 10 * 1024 * 1024 * 1024
        },
        nodeMemory: {
          heapUsed: 100 * 1024 * 1024,
          heapTotal: 200 * 1024 * 1024,
          external: 50 * 1024 * 1024,
          rss: 300 * 1024 * 1024
        },
        loadAverage: [1.0, 1.2, 1.5],
        platform: 'linux',
        uptime: 123456
      }),
      recordInference: vi.fn(),
      getInferenceStats: vi.fn(),
      formatSystemReport: vi.fn(),
      formatCompactStatus: vi.fn(),
      monitorResourceUsage: vi.fn(),
      getOptimalModelSettings: vi.fn()
    } as unknown as PerformanceMonitor;

    // Mock TrustModelManagerImpl
    mockModelManager = {
      listAvailableModels: vi.fn().mockReturnValue(sampleModels),
      switchModel: vi.fn().mockResolvedValue(undefined),
      getCurrentModel: vi.fn().mockReturnValue(sampleModels[0]),
      initialize: vi.fn().mockResolvedValue(undefined),
      downloadModel: vi.fn().mockResolvedValue(undefined),
      verifyModel: vi.fn().mockResolvedValue(true),
      deleteModel: vi.fn().mockResolvedValue(undefined),
      getTrustRating: vi.fn().mockResolvedValue(9.0),
      getRecommendedModel: vi.fn().mockReturnValue(sampleModels[0])
    } as unknown as TrustModelManagerImpl;

    benchmark = new PerformanceBenchmark(mockPerformanceMonitor, mockModelManager);
  });

  describe('initialization', () => {
    it('should initialize with standard benchmark suites', () => {
      const suites = benchmark.getBenchmarkSuites();
      
      expect(suites).toHaveLength(4);
      expect(suites.map(s => s.id)).toEqual(['speed', 'quality', 'coding', 'reasoning']);
    });

    it('should create speed benchmark suite with appropriate tests', () => {
      const suites = benchmark.getBenchmarkSuites();
      const speedSuite = suites.find(s => s.id === 'speed');
      
      expect(speedSuite).toBeDefined();
      expect(speedSuite!.name).toBe('Speed Benchmark');
      expect(speedSuite!.tests).toHaveLength(3);
      expect(speedSuite!.tests[0].id).toBe('quick-response');
      expect(speedSuite!.tests[0].category).toBe('speed');
      expect(speedSuite!.tests[0].difficulty).toBe('easy');
    });

    it('should create quality benchmark suite with appropriate tests', () => {
      const suites = benchmark.getBenchmarkSuites();
      const qualitySuite = suites.find(s => s.id === 'quality');
      
      expect(qualitySuite).toBeDefined();
      expect(qualitySuite!.name).toBe('Quality Benchmark');
      expect(qualitySuite!.tests).toHaveLength(3);
      expect(qualitySuite!.tests[0].category).toBe('quality');
    });

    it('should create coding benchmark suite with appropriate tests', () => {
      const suites = benchmark.getBenchmarkSuites();
      const codingSuite = suites.find(s => s.id === 'coding');
      
      expect(codingSuite).toBeDefined();
      expect(codingSuite!.name).toBe('Coding Benchmark');
      expect(codingSuite!.tests).toHaveLength(3);
      expect(codingSuite!.tests[0].category).toBe('coding');
    });

    it('should create reasoning benchmark suite with appropriate tests', () => {
      const suites = benchmark.getBenchmarkSuites();
      const reasoningSuite = suites.find(s => s.id === 'reasoning');
      
      expect(reasoningSuite).toBeDefined();
      expect(reasoningSuite!.name).toBe('Reasoning Benchmark');
      expect(reasoningSuite!.tests).toHaveLength(3);
      expect(reasoningSuite!.tests[0].category).toBe('reasoning');
    });
  });

  describe('benchmark execution', () => {
    it('should run a complete benchmark suite', async () => {
      const progressUpdates: Array<{ status: string; progress: number }> = [];
      
      const report = await benchmark.runBenchmarkSuite(
        'speed',
        ['fast-model', 'quality-model'],
        (status, progress) => progressUpdates.push({ status, progress })
      );

      expect(report).toBeDefined();
      expect(report.suiteId).toBe('speed');
      expect(report.suiteName).toBe('Speed Benchmark');
      expect(report.models).toHaveLength(2);
      expect(progressUpdates.length).toBeGreaterThan(0);
      expect(progressUpdates[progressUpdates.length - 1].progress).toBe(100);
    }, 10000);

    it('should generate accurate model summaries', async () => {
      const report = await benchmark.runBenchmarkSuite('speed', ['fast-model']);

      expect(report.models).toHaveLength(1);
      const summary = report.models[0];
      
      expect(summary.modelName).toBe('fast-model');
      expect(summary.totalTests).toBe(3); // Speed suite has 3 tests
      expect(summary.successfulTests).toBeGreaterThan(0);
      expect(summary.averageSpeed).toBeGreaterThan(0);
      expect(summary.overallScore).toBeGreaterThan(0);
      expect(summary.efficiency).toBeGreaterThan(0);
    }, 10000);

    it('should include system information in report', async () => {
      const report = await benchmark.runBenchmarkSuite('speed', ['fast-model']);

      expect(report.systemInfo).toBeDefined();
      expect(report.systemInfo.platform).toBe('linux');
      expect(report.systemInfo.totalRAM).toBe('16.0GB');
      expect(report.systemInfo.availableRAM).toBe('10.0GB');
      expect(report.systemInfo.cpuCores).toBeGreaterThan(0);
      expect(report.systemInfo.cpuSpeed).toBeGreaterThan(0);
    }, 10000);

    it('should generate meaningful recommendations', async () => {
      const report = await benchmark.runBenchmarkSuite('speed', ['fast-model', 'quality-model']);

      expect(report.recommendations).toBeDefined();
      expect(report.recommendations.fastest).toBeTruthy();
      expect(report.recommendations.mostEfficient).toBeTruthy();
      expect(report.recommendations.bestOverall).toBeTruthy();
      expect(['fast-model', 'quality-model']).toContain(report.recommendations.fastest);
    }, 10000);

    it('should handle benchmark errors gracefully', async () => {
      // Mock a model switch failure
      mockModelManager.switchModel = vi.fn().mockRejectedValue(new Error('Model not found'));

      const report = await benchmark.runBenchmarkSuite('speed', ['nonexistent-model']);

      expect(report.models).toHaveLength(1);
      const summary = report.models[0];
      expect(summary.successfulTests).toBe(0);
      expect(summary.reliability).toBe(0);
    });

    it('should track test results correctly', async () => {
      await benchmark.runBenchmarkSuite('speed', ['fast-model']);

      const results = benchmark.getResults();
      expect(results.length).toBeGreaterThan(0);
      
      const modelResults = benchmark.getResults('fast-model');
      expect(modelResults.length).toBe(3); // Speed suite has 3 tests
      
      const testResults = benchmark.getResults(undefined, 'quick-response');
      expect(testResults.length).toBeGreaterThan(0);
    });

    it('should measure performance metrics accurately', async () => {
      await benchmark.runBenchmarkSuite('speed', ['fast-model']);

      const results = benchmark.getResults('fast-model');
      expect(results).toHaveLength(3);

      for (const result of results) {
        expect(result.success).toBe(true);
        expect(result.metrics.tokensPerSecond).toBeGreaterThan(0);
        expect(result.metrics.totalTokens).toBeGreaterThan(0);
        expect(result.metrics.inferenceTime).toBeGreaterThan(0);
        expect(result.timestamp).toBeInstanceOf(Date);
      }
    });
  });

  describe('result analysis', () => {
    beforeEach(async () => {
      // Run a benchmark to populate results
      await benchmark.runBenchmarkSuite('speed', ['fast-model', 'quality-model']);
    }, 15000);

    it('should calculate model efficiency correctly', async () => {
      const report = await benchmark.runBenchmarkSuite('speed', ['fast-model', 'quality-model']);

      const fastModel = report.models.find(m => m.modelName === 'fast-model');
      const qualityModel = report.models.find(m => m.modelName === 'quality-model');

      expect(fastModel).toBeDefined();
      expect(qualityModel).toBeDefined();

      // Fast model should be more efficient (higher tokens/sec per GB)
      expect(fastModel!.efficiency).toBeGreaterThan(qualityModel!.efficiency);
    }, 10000);

    it('should identify best categories for each model', async () => {
      const report = await benchmark.runBenchmarkSuite('speed', ['fast-model']);

      const summary = report.models[0];
      expect(summary.bestCategories).toBeDefined();
      expect(Array.isArray(summary.bestCategories)).toBe(true);
      expect(summary.worstCategories).toBeDefined();
      expect(Array.isArray(summary.worstCategories)).toBe(true);
    }, 10000);

    it('should calculate overall scores appropriately', async () => {
      const report = await benchmark.runBenchmarkSuite('speed', ['fast-model', 'quality-model']);

      for (const summary of report.models) {
        expect(summary.overallScore).toBeGreaterThanOrEqual(0);
        expect(summary.overallScore).toBeLessThanOrEqual(100);
        expect(summary.reliability).toBeGreaterThanOrEqual(0);
        expect(summary.reliability).toBeLessThanOrEqual(100);
      }
    }, 10000);
  });

  describe('report generation', () => {
    it('should generate formatted text report', async () => {
      const report = await benchmark.runBenchmarkSuite('speed', ['fast-model', 'quality-model']);
      const textReport = benchmark.generateTextReport(report);

      expect(textReport).toContain('Benchmark Report: Speed Benchmark');
      expect(textReport).toContain('System Information:');
      expect(textReport).toContain('Model Rankings:');
      expect(textReport).toContain('Recommendations:');
      expect(textReport).toContain('fast-model');
      expect(textReport).toContain('quality-model');
    }, 10000);

    it('should include performance metrics in text report', async () => {
      const report = await benchmark.runBenchmarkSuite('speed', ['fast-model']);
      const textReport = benchmark.generateTextReport(report);

      expect(textReport).toContain('tokens/sec');
      expect(textReport).toContain('Efficiency:');
      expect(textReport).toContain('Reliability:');
      expect(textReport).toContain('%');
    });

    it('should include system information in text report', async () => {
      const report = await benchmark.runBenchmarkSuite('speed', ['fast-model']);
      const textReport = benchmark.generateTextReport(report);

      expect(textReport).toContain('Platform: linux');
      expect(textReport).toContain('CPU Cores:');
      expect(textReport).toContain('RAM: 16.0GB');
      expect(textReport).toContain('Duration:');
    });

    it('should show model rankings in text report', async () => {
      const report = await benchmark.runBenchmarkSuite('speed', ['fast-model', 'quality-model']);
      const textReport = benchmark.generateTextReport(report);

      expect(textReport).toContain('🥇'); // Gold medal for first place
      expect(textReport).toContain('🥈'); // Silver medal for second place
    }, 10000);

    it('should display recommendations in text report', async () => {
      const report = await benchmark.runBenchmarkSuite('speed', ['fast-model', 'quality-model']);
      const textReport = benchmark.generateTextReport(report);

      expect(textReport).toContain('🚀 Fastest:');
      expect(textReport).toContain('⚡ Most Efficient:');
      expect(textReport).toContain('🌟 Best Overall:');
    }, 10000);
  });

  describe('result management', () => {
    it('should filter results by model name', async () => {
      await benchmark.runBenchmarkSuite('speed', ['fast-model', 'quality-model']);

      const fastModelResults = benchmark.getResults('fast-model');
      const qualityModelResults = benchmark.getResults('quality-model');

      expect(fastModelResults.every(r => r.modelName === 'fast-model')).toBe(true);
      expect(qualityModelResults.every(r => r.modelName === 'quality-model')).toBe(true);
      expect(fastModelResults.length).toBeGreaterThan(0);
      expect(qualityModelResults.length).toBeGreaterThan(0);
    }, 10000);

    it('should filter results by test ID', async () => {
      await benchmark.runBenchmarkSuite('speed', ['fast-model']);

      const quickResponseResults = benchmark.getResults(undefined, 'quick-response');
      
      expect(quickResponseResults.every(r => r.testId === 'quick-response')).toBe(true);
      expect(quickResponseResults.length).toBeGreaterThan(0);
    });

    it('should clear all results', async () => {
      await benchmark.runBenchmarkSuite('speed', ['fast-model']);
      
      expect(benchmark.getResults().length).toBeGreaterThan(0);
      
      benchmark.clearResults();
      
      expect(benchmark.getResults().length).toBe(0);
    }, 10000);
  });

  describe('error handling', () => {
    it('should throw error for unknown benchmark suite', async () => {
      await expect(
        benchmark.runBenchmarkSuite('unknown-suite', ['fast-model'])
      ).rejects.toThrow("Benchmark suite 'unknown-suite' not found");
    });

    it('should handle model switching failures', async () => {
      mockModelManager.switchModel = vi.fn().mockRejectedValue(new Error('Model switch failed'));

      const report = await benchmark.runBenchmarkSuite('speed', ['fast-model']);
      
      expect(report.models[0].successfulTests).toBe(0);
      expect(report.models[0].reliability).toBe(0);
    });

    it('should record error details in failed tests', async () => {
      mockModelManager.switchModel = vi.fn().mockRejectedValue(new Error('Model not available'));

      await benchmark.runBenchmarkSuite('speed', ['fast-model']);
      
      const results = benchmark.getResults('fast-model');
      expect(results.every(r => !r.success)).toBe(true);
      expect(results.every(r => r.error)).toBe(true);
      expect(results[0].error).toContain('Model not available');
    });
  });
});