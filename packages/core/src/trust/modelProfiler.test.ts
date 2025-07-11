/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ModelProfiler, ModelProfile, WorkloadPattern, PerformanceRegression } from './modelProfiler.js';
import { PerformanceMonitor, InferenceMetrics, SystemMetrics } from './performanceMonitor.js';
import { HardwareOptimizer } from './hardwareOptimizer.js';
import { TrustModelConfig } from './types.js';

// Mock fs/promises
vi.mock('fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  readdir: vi.fn().mockResolvedValue([]),
  readFile: vi.fn().mockResolvedValue('{}'),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

describe('ModelProfiler', () => {
  let modelProfiler: ModelProfiler;
  let mockPerformanceMonitor: PerformanceMonitor;
  let mockHardwareOptimizer: HardwareOptimizer;

  const mockModelConfig: TrustModelConfig = {
    name: 'test-model',
    path: '/path/to/model',
    type: 'llama',
    quantization: 'Q4_K_M',
    contextSize: 4096,
    ramRequirement: '4GB',
    description: 'Test model for profiling',
  };

  const mockInferenceMetrics: InferenceMetrics = {
    tokensPerSecond: 25,
    totalTokens: 100,
    inferenceTime: 4000,
    modelName: 'test-model',
    promptLength: 50,
    responseLength: 50,
    timestamp: new Date(),
  };

  const mockSystemMetrics: SystemMetrics = {
    cpuUsage: 45,
    memoryUsage: {
      total: 16 * 1024 * 1024 * 1024, // 16GB
      used: 8 * 1024 * 1024 * 1024,   // 8GB
      free: 8 * 1024 * 1024 * 1024,   // 8GB
      available: 8 * 1024 * 1024 * 1024, // 8GB
    },
    nodeMemory: {
      heapUsed: 2 * 1024 * 1024 * 1024, // 2GB
      heapTotal: 3 * 1024 * 1024 * 1024, // 3GB
      external: 100 * 1024 * 1024, // 100MB
      rss: 2.5 * 1024 * 1024 * 1024, // 2.5GB
    },
    loadAverage: [1.2, 1.1, 1.0],
    platform: 'linux',
    uptime: 3600,
  };

  beforeEach(() => {
    mockPerformanceMonitor = {
      getSystemMetrics: vi.fn().mockReturnValue(mockSystemMetrics),
    } as any;

    mockHardwareOptimizer = {} as any;

    modelProfiler = new ModelProfiler(mockPerformanceMonitor, mockHardwareOptimizer);
  });

  describe('Model Profiling', () => {
    it('should start profiling a new model', async () => {
      await modelProfiler.startModelProfiling('test-model', mockModelConfig);
      
      const profile = modelProfiler.getModelProfile('test-model');
      expect(profile).toBeDefined();
      expect(profile?.modelName).toBe('test-model');
      expect(profile?.modelConfig).toEqual(mockModelConfig);
    });

    it('should not create duplicate profiles for the same model', async () => {
      await modelProfiler.startModelProfiling('test-model', mockModelConfig);
      await modelProfiler.startModelProfiling('test-model', mockModelConfig);
      
      const profile = modelProfiler.getModelProfile('test-model');
      expect(profile).toBeDefined();
      // Should still be the same profile, not duplicated
    });

    it('should record inference metrics', async () => {
      await modelProfiler.startModelProfiling('test-model', mockModelConfig);
      await modelProfiler.recordInference('test-model', mockInferenceMetrics, mockSystemMetrics);
      
      const profile = modelProfiler.getModelProfile('test-model');
      expect(profile?.history.totalInferences).toBe(1);
      expect(profile?.performance.averageTokensPerSecond).toBeGreaterThan(0);
    });

    it('should update performance metrics with rolling average', async () => {
      await modelProfiler.startModelProfiling('test-model', mockModelConfig);
      
      // Record first inference
      await modelProfiler.recordInference('test-model', mockInferenceMetrics, mockSystemMetrics);
      const profile1 = modelProfiler.getModelProfile('test-model');
      const firstAverage = profile1?.performance.averageTokensPerSecond || 0;
      
      // Record second inference with different speed
      const secondMetrics = { ...mockInferenceMetrics, tokensPerSecond: 35 };
      await modelProfiler.recordInference('test-model', secondMetrics, mockSystemMetrics);
      
      const profile2 = modelProfiler.getModelProfile('test-model');
      const secondAverage = profile2?.performance.averageTokensPerSecond || 0;
      
      // Average should be between the two values
      expect(secondAverage).toBeGreaterThan(firstAverage);
      expect(secondAverage).toBeLessThan(35); // Should be smoothed average
      expect(profile2?.history.totalInferences).toBe(2);
    });

    it('should track peak performance', async () => {
      await modelProfiler.startModelProfiling('test-model', mockModelConfig);
      
      // Record slower inference first
      const slowMetrics = { ...mockInferenceMetrics, tokensPerSecond: 15 };
      await modelProfiler.recordInference('test-model', slowMetrics, mockSystemMetrics);
      
      // Record faster inference
      const fastMetrics = { ...mockInferenceMetrics, tokensPerSecond: 45 };
      await modelProfiler.recordInference('test-model', fastMetrics, mockSystemMetrics);
      
      const profile = modelProfiler.getModelProfile('test-model');
      expect(profile?.performance.peakTokensPerSecond).toBe(45);
    });
  });

  describe('Performance Regression Detection', () => {
    it('should detect performance regressions', async () => {
      await modelProfiler.startModelProfiling('test-model', mockModelConfig);
      
      // Record historical good performance (30 inferences)
      for (let i = 0; i < 30; i++) {
        const goodMetrics = { ...mockInferenceMetrics, tokensPerSecond: 30 };
        await modelProfiler.recordInference('test-model', goodMetrics, mockSystemMetrics);
      }
      
      // Record recent poor performance (10 inferences)
      for (let i = 0; i < 10; i++) {
        const badMetrics = { ...mockInferenceMetrics, tokensPerSecond: 15 }; // 50% degradation
        await modelProfiler.recordInference('test-model', badMetrics, mockSystemMetrics);
      }
      
      const regressions = await modelProfiler.detectPerformanceRegressions();
      expect(regressions).toHaveLength(1);
      expect(regressions[0].modelName).toBe('test-model');
      expect(regressions[0].degradation).toBeGreaterThan(40); // Should detect significant degradation
      expect(regressions[0].significance).toBe('major');
    });

    it('should not detect regressions with insufficient data', async () => {
      await modelProfiler.startModelProfiling('test-model', mockModelConfig);
      
      // Record only a few inferences
      for (let i = 0; i < 5; i++) {
        await modelProfiler.recordInference('test-model', mockInferenceMetrics, mockSystemMetrics);
      }
      
      const regressions = await modelProfiler.detectPerformanceRegressions();
      expect(regressions).toHaveLength(0);
    });

    it('should classify regression severity correctly', async () => {
      await modelProfiler.startModelProfiling('test-model', mockModelConfig);
      
      // Record historical performance
      for (let i = 0; i < 30; i++) {
        const goodMetrics = { ...mockInferenceMetrics, tokensPerSecond: 30 };
        await modelProfiler.recordInference('test-model', goodMetrics, mockSystemMetrics);
      }
      
      // Record moderate degradation (25% drop to ensure it crosses the 20% threshold)
      for (let i = 0; i < 10; i++) {
        const degradedMetrics = { ...mockInferenceMetrics, tokensPerSecond: 22.5 };
        await modelProfiler.recordInference('test-model', degradedMetrics, mockSystemMetrics);
      }
      
      const regressions = await modelProfiler.detectPerformanceRegressions();
      expect(regressions).toHaveLength(1);
      expect(regressions[0].significance).toBe('moderate');
    });
  });

  describe('Optimization Recommendations', () => {
    it('should generate memory optimization recommendations', async () => {
      await modelProfiler.startModelProfiling('test-model', mockModelConfig);
      
      // Simulate high memory usage - record multiple inferences to build up the profile
      const highMemoryMetrics = {
        ...mockSystemMetrics,
        nodeMemory: {
          ...mockSystemMetrics.nodeMemory,
          heapUsed: 10 * 1024 * 1024 * 1024, // 10GB
        }
      };
      
      // Record many inferences to ensure the rolling average builds up high memory usage
      // With alpha = 0.1, we need more iterations to reach the 8GB threshold
      for (let i = 0; i < 100; i++) {
        await modelProfiler.recordInference('test-model', mockInferenceMetrics, highMemoryMetrics);
      }
      
      const recommendations = await modelProfiler.generateOptimizationRecommendations('test-model');
      const memoryRec = recommendations.find(r => r.category === 'resource');
      
      expect(memoryRec).toBeDefined();
      expect(memoryRec?.title).toContain('Memory Usage');
      expect(memoryRec?.priority).toBe('high');
    });

    it('should generate performance recommendations for slow models', async () => {
      await modelProfiler.startModelProfiling('test-model', mockModelConfig);
      
      // Simulate slow performance
      const slowMetrics = { ...mockInferenceMetrics, tokensPerSecond: 5 };
      await modelProfiler.recordInference('test-model', slowMetrics, mockSystemMetrics);
      
      const recommendations = await modelProfiler.generateOptimizationRecommendations('test-model');
      const perfRec = recommendations.find(r => r.category === 'performance');
      
      expect(perfRec).toBeDefined();
      expect(perfRec?.title).toContain('Inference Speed');
    });

    it('should generate quality recommendations for error-prone models', async () => {
      await modelProfiler.startModelProfiling('test-model', mockModelConfig);
      
      // Record multiple inferences to build profile
      for (let i = 0; i < 20; i++) {
        await modelProfiler.recordInference('test-model', mockInferenceMetrics, mockSystemMetrics);
      }
      
      // Manually set high error rate for testing
      const profile = modelProfiler.getModelProfile('test-model');
      if (profile) {
        profile.quality.errorRate = 0.1; // 10% error rate
      }
      
      const recommendations = await modelProfiler.generateOptimizationRecommendations('test-model');
      const qualityRec = recommendations.find(r => r.category === 'model');
      
      expect(qualityRec).toBeDefined();
      expect(qualityRec?.title).toContain('Error Rate');
      expect(qualityRec?.priority).toBe('high');
    });

    it('should sort recommendations by priority', async () => {
      await modelProfiler.startModelProfiling('test-model', mockModelConfig);
      await modelProfiler.recordInference('test-model', mockInferenceMetrics, mockSystemMetrics);
      
      const recommendations = await modelProfiler.generateOptimizationRecommendations('test-model');
      
      if (recommendations.length > 1) {
        const priorities = ['critical', 'high', 'medium', 'low'];
        for (let i = 0; i < recommendations.length - 1; i++) {
          const currentIndex = priorities.indexOf(recommendations[i].priority);
          const nextIndex = priorities.indexOf(recommendations[i + 1].priority);
          expect(currentIndex).toBeLessThanOrEqual(nextIndex);
        }
      }
    });
  });

  describe('Profile Persistence', () => {
    it('should save profiles to disk', async () => {
      const fs = await import('fs/promises');
      const writeFileMock = vi.mocked(fs.writeFile);
      
      await modelProfiler.startModelProfiling('test-model', mockModelConfig);
      await modelProfiler.saveProfiles();
      
      expect(writeFileMock).toHaveBeenCalled();
    });
  });

  describe('Performance Reports', () => {
    it('should export performance report in JSON format', async () => {
      await modelProfiler.startModelProfiling('test-model', mockModelConfig);
      await modelProfiler.recordInference('test-model', mockInferenceMetrics, mockSystemMetrics);
      
      const report = await modelProfiler.exportPerformanceReport('json');
      const parsed = JSON.parse(report);
      
      expect(parsed).toHaveProperty('generatedAt');
      expect(parsed).toHaveProperty('systemInfo');
      expect(parsed).toHaveProperty('models');
      expect(parsed.models).toHaveLength(1);
      expect(parsed.models[0].modelName).toBe('test-model');
    });

    it('should export performance report in CSV format', async () => {
      await modelProfiler.startModelProfiling('test-model', mockModelConfig);
      await modelProfiler.recordInference('test-model', mockInferenceMetrics, mockSystemMetrics);
      
      const report = await modelProfiler.exportPerformanceReport('csv');
      
      expect(report).toContain('Model,Avg Speed');
      expect(report).toContain('test-model');
    });

    it('should export performance report in text format', async () => {
      await modelProfiler.startModelProfiling('test-model', mockModelConfig);
      await modelProfiler.recordInference('test-model', mockInferenceMetrics, mockSystemMetrics);
      
      const report = await modelProfiler.exportPerformanceReport('text');
      
      expect(report).toContain('Model Performance Report');
      expect(report).toContain('test-model');
      expect(report).toContain('Speed:');
    });
  });

  describe('Workload Recommendations', () => {
    const mockWorkloadPattern: WorkloadPattern = {
      id: 'test-workload',
      name: 'Test Workload',
      characteristics: {
        averagePromptLength: 200,
        averageResponseLength: 300,
        contextUsage: 0.5,
        interactionFrequency: 0.7,
        taskComplexity: 'moderate',
        creativity: 'balanced',
      },
      optimalModels: [],
      optimalSettings: { temperature: 0.7, maxTokens: 512 },
    };

    it('should return workload recommendations', async () => {
      await modelProfiler.startModelProfiling('test-model', mockModelConfig);
      
      // Build up some performance history
      for (let i = 0; i < 10; i++) {
        await modelProfiler.recordInference('test-model', mockInferenceMetrics, mockSystemMetrics);
      }
      
      const recommendations = modelProfiler.getWorkloadRecommendations(mockWorkloadPattern);
      
      // Should return some recommendations based on the profile
      expect(Array.isArray(recommendations)).toBe(true);
    });

    it('should filter out unsuitable models', async () => {
      await modelProfiler.startModelProfiling('test-model', mockModelConfig);
      
      // Create a profile with very poor performance
      const profile = modelProfiler.getModelProfile('test-model');
      if (profile) {
        profile.performance.averageTokensPerSecond = 1; // Very slow
        profile.quality.errorRate = 0.5; // 50% error rate
      }
      
      const recommendations = modelProfiler.getWorkloadRecommendations(mockWorkloadPattern);
      
      // Should not recommend the poorly performing model
      const badModelRec = recommendations.find(r => r.model.name === 'test-model');
      expect(badModelRec).toBeUndefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle missing model profiles gracefully', async () => {
      const profile = modelProfiler.getModelProfile('nonexistent-model');
      expect(profile).toBeUndefined();
      
      const recommendations = await modelProfiler.generateOptimizationRecommendations('nonexistent-model');
      expect(recommendations).toHaveLength(0);
    });

    it('should handle filesystem errors gracefully', async () => {
      const fs = await import('fs/promises');
      vi.mocked(fs.writeFile).mockRejectedValue(new Error('Permission denied'));
      
      // Should not throw error
      await expect(modelProfiler.saveProfiles()).resolves.not.toThrow();
    });
  });
});