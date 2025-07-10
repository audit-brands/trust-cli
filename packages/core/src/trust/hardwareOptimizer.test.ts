/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HardwareOptimizer } from './hardwareOptimizer.js';
import { PerformanceMonitor } from './performanceMonitor.js';
import { TrustModelConfig } from './types.js';
import * as os from 'os';

// Mock os module
vi.mock('os');
const mockOs = vi.mocked(os);

describe('HardwareOptimizer', () => {
  let mockPerformanceMonitor: PerformanceMonitor;
  let hardwareOptimizer: HardwareOptimizer;
  
  const sampleModels: TrustModelConfig[] = [
    {
      name: 'lightweight-model',
      path: 'lightweight.gguf',
      type: 'qwen',
      quantization: 'Q4_K_M',
      contextSize: 2048,
      ramRequirement: '2GB',
      description: 'Lightweight test model',
      parameters: '1.5B',
      trustScore: 9.0,
      downloadUrl: 'https://example.com/lightweight.gguf',
      verificationHash: 'sha256:test',
      expectedSize: 1000000000
    },
    {
      name: 'medium-model',
      path: 'medium.gguf',
      type: 'qwen',
      quantization: 'Q4_K_M',
      contextSize: 4096,
      ramRequirement: '4GB',
      description: 'Medium test model',
      parameters: '3B',
      trustScore: 9.2,
      downloadUrl: 'https://example.com/medium.gguf',
      verificationHash: 'sha256:test',
      expectedSize: 2000000000
    },
    {
      name: 'large-model',
      path: 'large.gguf',
      type: 'qwen',
      quantization: 'Q8_0',
      contextSize: 8192,
      ramRequirement: '8GB',
      description: 'Large test model',
      parameters: '7B',
      trustScore: 9.5,
      downloadUrl: 'https://example.com/large.gguf',
      verificationHash: 'sha256:test',
      expectedSize: 4000000000
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup default system configuration (mid-range desktop)
    mockOs.platform.mockReturnValue('linux');
    mockOs.arch.mockReturnValue('x64');
    mockOs.cpus.mockReturnValue(new Array(8).fill({
      model: 'Intel(R) Core(TM) i7-9750H CPU @ 2.60GHz',
      speed: 2600,
      times: {
        user: 1000000,
        nice: 0,
        sys: 500000,
        idle: 8000000,
        irq: 0
      }
    }));

    mockPerformanceMonitor = {
      getSystemMetrics: vi.fn().mockReturnValue({
        cpuUsage: 25.5,
        memoryUsage: {
          total: 16 * 1024 * 1024 * 1024, // 16GB
          used: 6 * 1024 * 1024 * 1024,   // 6GB used
          free: 10 * 1024 * 1024 * 1024,  // 10GB free
          available: 10 * 1024 * 1024 * 1024 // 10GB available
        },
        nodeMemory: {
          heapUsed: 100 * 1024 * 1024,
          heapTotal: 200 * 1024 * 1024,
          external: 50 * 1024 * 1024,
          rss: 300 * 1024 * 1024
        },
        loadAverage: [1.2, 1.5, 1.8],
        platform: 'linux',
        uptime: 123456
      })
    } as unknown as PerformanceMonitor;

    hardwareOptimizer = new HardwareOptimizer(mockPerformanceMonitor);
  });

  describe('hardware capability detection', () => {
    it('should detect system capabilities correctly', () => {
      const capabilities = hardwareOptimizer.getSystemCapabilities();
      
      expect(capabilities.totalRAMGB).toBeCloseTo(16, 1);
      expect(capabilities.availableRAMGB).toBeCloseTo(10, 1);
      expect(capabilities.cpuCores).toBe(8);
      expect(capabilities.cpuSpeed).toBe(2600);
      expect(capabilities.platform).toBe('linux');
      expect(capabilities.architecture).toBe('x64');
      expect(capabilities.recommendedConcurrency).toBeGreaterThan(0);
    });

    it('should classify hardware correctly for different configurations', () => {
      // Test high-end system
      mockPerformanceMonitor.getSystemMetrics = vi.fn().mockReturnValue({
        memoryUsage: { 
          total: 32 * 1024 * 1024 * 1024, 
          available: 24 * 1024 * 1024 * 1024,
          used: 8 * 1024 * 1024 * 1024,
          free: 24 * 1024 * 1024 * 1024
        },
        cpuUsage: 15,
        nodeMemory: { heapUsed: 100 * 1024 * 1024, heapTotal: 200 * 1024 * 1024, external: 50 * 1024 * 1024, rss: 300 * 1024 * 1024 },
        loadAverage: [0.8, 1.0, 1.2],
        platform: 'linux',
        uptime: 123456
      });
      
      const highEndOptimizer = new HardwareOptimizer(mockPerformanceMonitor);
      const report = highEndOptimizer.generateOptimizationReport();
      
      expect(report).toContain('High-end Workstation');
      expect(report).toContain('Premium');
    });
  });

  describe('model suitability analysis', () => {
    it('should rank models by suitability score', () => {
      const recommendations = hardwareOptimizer.analyzeModelSuitability(sampleModels);
      
      expect(recommendations).toHaveLength(3);
      expect(recommendations[0].suitabilityScore).toBeGreaterThanOrEqual(recommendations[1].suitabilityScore);
      expect(recommendations[1].suitabilityScore).toBeGreaterThanOrEqual(recommendations[2].suitabilityScore);
    });

    it('should give high scores to models that fit well in available memory', () => {
      const recommendations = hardwareOptimizer.analyzeModelSuitability(sampleModels);
      
      // With 10GB available, 2GB and 4GB models should score well, 8GB should be lower
      const lightweightRec = recommendations.find(r => r.model.name === 'lightweight-model');
      const mediumRec = recommendations.find(r => r.model.name === 'medium-model');
      const largeRec = recommendations.find(r => r.model.name === 'large-model');
      
      expect(lightweightRec?.suitabilityScore).toBeGreaterThan(80);
      expect(mediumRec?.suitabilityScore).toBeGreaterThan(80);
      expect(largeRec?.suitabilityScore).toBeGreaterThan(60); // Still decent with 10GB available
    });

    it('should generate warnings for models requiring too much memory', () => {
      // Simulate low memory system
      mockPerformanceMonitor.getSystemMetrics = vi.fn().mockReturnValue({
        memoryUsage: { 
          total: 8 * 1024 * 1024 * 1024, 
          available: 3 * 1024 * 1024 * 1024, // Only 3GB available
          used: 5 * 1024 * 1024 * 1024,
          free: 3 * 1024 * 1024 * 1024
        },
        cpuUsage: 40,
        nodeMemory: { heapUsed: 100 * 1024 * 1024, heapTotal: 200 * 1024 * 1024, external: 50 * 1024 * 1024, rss: 300 * 1024 * 1024 },
        loadAverage: [2.0, 2.2, 2.5],
        platform: 'linux',
        uptime: 123456
      });
      
      const lowMemOptimizer = new HardwareOptimizer(mockPerformanceMonitor);
      const recommendations = lowMemOptimizer.analyzeModelSuitability(sampleModels);
      
      const largeModelRec = recommendations.find(r => r.model.name === 'large-model');
      expect(largeModelRec?.warnings).toContain('Insufficient RAM - model may fail to load or cause system slowdown');
    });

    it('should provide performance estimates', () => {
      const recommendations = hardwareOptimizer.analyzeModelSuitability(sampleModels);
      
      recommendations.forEach(rec => {
        expect(rec.performanceEstimate.tokensPerSecond).toBeGreaterThan(0);
        expect(rec.performanceEstimate.ramUsageGB).toBeGreaterThan(0);
        expect(rec.performanceEstimate.cpuUtilization).toBeGreaterThanOrEqual(0);
        expect(rec.performanceEstimate.cpuUtilization).toBeLessThanOrEqual(100);
      });
    });
  });

  describe('optimization recommendations', () => {
    it('should generate appropriate recommendations for low memory systems', () => {
      // Simulate low memory
      mockPerformanceMonitor.getSystemMetrics = vi.fn().mockReturnValue({
        memoryUsage: { 
          total: 8 * 1024 * 1024 * 1024, 
          available: 2 * 1024 * 1024 * 1024, // Only 2GB available
          used: 6 * 1024 * 1024 * 1024,
          free: 2 * 1024 * 1024 * 1024
        },
        cpuUsage: 60,
        nodeMemory: { heapUsed: 100 * 1024 * 1024, heapTotal: 200 * 1024 * 1024, external: 50 * 1024 * 1024, rss: 300 * 1024 * 1024 },
        loadAverage: [3.0, 3.2, 3.5],
        platform: 'linux',
        uptime: 123456
      });
      
      const lowMemOptimizer = new HardwareOptimizer(mockPerformanceMonitor);
      const recommendations = lowMemOptimizer.generateOptimizationRecommendations();
      
      const memoryRec = recommendations.find(r => r.title.includes('Low Available Memory'));
      expect(memoryRec).toBeDefined();
      expect(memoryRec?.priority).toBe('high');
    });

    it('should recommend better quantization for high memory systems', () => {
      // Simulate high memory system
      mockPerformanceMonitor.getSystemMetrics = vi.fn().mockReturnValue({
        memoryUsage: { 
          total: 32 * 1024 * 1024 * 1024, 
          available: 24 * 1024 * 1024 * 1024, // 24GB available
          used: 8 * 1024 * 1024 * 1024,
          free: 24 * 1024 * 1024 * 1024
        },
        cpuUsage: 20,
        nodeMemory: { heapUsed: 100 * 1024 * 1024, heapTotal: 200 * 1024 * 1024, external: 50 * 1024 * 1024, rss: 300 * 1024 * 1024 },
        loadAverage: [1.0, 1.2, 1.5],
        platform: 'linux',
        uptime: 123456
      });
      
      const highMemOptimizer = new HardwareOptimizer(mockPerformanceMonitor);
      const recommendations = highMemOptimizer.generateOptimizationRecommendations();
      
      const qualityRec = recommendations.find(r => r.title.includes('Higher Quality Models'));
      expect(qualityRec).toBeDefined();
    });

    it('should provide platform-specific recommendations', () => {
      // Test macOS recommendations
      mockOs.platform.mockReturnValue('darwin');
      const macOptimizer = new HardwareOptimizer(mockPerformanceMonitor);
      const macRecommendations = macOptimizer.generateOptimizationRecommendations();
      
      const metalRec = macRecommendations.find(r => r.title.includes('Metal'));
      expect(metalRec).toBeDefined();
    });
  });

  describe('optimization report generation', () => {
    it('should generate a comprehensive optimization report', () => {
      const report = hardwareOptimizer.generateOptimizationReport();
      
      expect(report).toContain('Hardware Optimization Report');
      expect(report).toContain('System Capabilities');
      expect(report).toContain('Hardware Classification');
      expect(report).toContain('16.0GB'); // Total RAM
      expect(report).toContain('8'); // CPU cores
      expect(report).toContain('linux'); // Platform
    });

    it('should include performance tier classification', () => {
      const report = hardwareOptimizer.generateOptimizationReport();
      
      expect(report).toContain('Performance Tier:');
      expect(report).toContain('Optimal Model Size:');
    });
  });
});