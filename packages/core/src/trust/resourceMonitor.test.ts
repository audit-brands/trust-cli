/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ResourceMonitor,
  SystemResources,
  ResourceOptimization,
} from './resourceMonitor.js';
import { TrustConfiguration } from '../config/trustConfig.js';

// Mock os module
vi.mock('os', () => ({
  cpus: vi.fn(() => [
    { model: 'Intel Core i7-9700K' },
    { model: 'Intel Core i7-9700K' },
    { model: 'Intel Core i7-9700K' },
    { model: 'Intel Core i7-9700K' },
    { model: 'Intel Core i7-9700K' },
    { model: 'Intel Core i7-9700K' },
    { model: 'Intel Core i7-9700K' },
    { model: 'Intel Core i7-9700K' },
  ]),
  arch: vi.fn(() => 'x64'),
  loadavg: vi.fn(() => [2.5, 2.2, 2.0]),
  totalmem: vi.fn(() => 16 * 1024 * 1024 * 1024), // 16GB
  freemem: vi.fn(() => 8 * 1024 * 1024 * 1024), // 8GB free
}));

// Mock fs/promises
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  statvfs: vi.fn(),
}));

// Mock child_process
vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

// Mock TrustConfiguration
vi.mock('../config/trustConfig.js', () => ({
  TrustConfiguration: vi.fn().mockImplementation(() => ({
    initialize: vi.fn(),
  })),
}));

describe('ResourceMonitor', () => {
  let monitor: ResourceMonitor;
  let mockConfig: TrustConfiguration;

  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig = new TrustConfiguration();
    monitor = new ResourceMonitor(mockConfig);
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      await monitor.initialize();
      expect(mockConfig.initialize).toHaveBeenCalled();
    });

    it('should create monitor without config', () => {
      const defaultMonitor = new ResourceMonitor();
      expect(defaultMonitor).toBeDefined();
    });
  });

  describe('getSystemResources', () => {
    beforeEach(async () => {
      await monitor.initialize();
    });

    it('should detect system resources correctly', async () => {
      const resources = await monitor.getSystemResources();

      expect(resources).toMatchObject({
        cpu: {
          cores: 8,
          architecture: 'x64',
          model: 'Intel Core i7-9700K',
          currentLoad: expect.any(Number),
        },
        memory: {
          totalRAM: 16,
          availableRAM: 8,
          usedRAM: 8,
          swapTotal: expect.any(Number),
          swapUsed: expect.any(Number),
        },
        disk: {
          totalSpace: expect.any(Number),
          availableSpace: expect.any(Number),
          usedSpace: expect.any(Number),
          ioLoad: expect.any(Number),
        },
        network: {
          downloadSpeed: expect.any(Number),
          uploadSpeed: expect.any(Number),
          latency: expect.any(Number),
        },
      });
    });

    it('should cache resources for performance', async () => {
      const resources1 = await monitor.getSystemResources();
      const resources2 = await monitor.getSystemResources();

      // Should return the same object reference (cached)
      expect(resources1).toBe(resources2);
    });

    it('should force refresh when requested', async () => {
      const resources1 = await monitor.getSystemResources();
      const resources2 = await monitor.getSystemResources(true);

      // Should detect new resources
      expect(resources1).not.toBe(resources2);
      expect(resources2.cpu.cores).toBe(8);
    });

    it('should handle GPU detection gracefully', async () => {
      const { execSync } = await import('child_process');
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('nvidia-smi not found');
      });

      const resources = await monitor.getSystemResources(true);
      expect(resources.gpu).toBeUndefined();
    });

    it('should detect NVIDIA GPU when available', async () => {
      const { execSync } = await import('child_process');
      vi.mocked(execSync).mockReturnValue(
        'NVIDIA GeForce RTX 3080, 10240, 2048, 45, 65\n',
      );

      const resources = await monitor.getSystemResources(true);

      expect(resources.gpu).toHaveLength(1);
      expect(resources.gpu![0]).toMatchObject({
        name: 'NVIDIA GeForce RTX 3080',
        memoryTotal: 10.0,
        memoryUsed: 2.0,
        utilization: 45,
        temperature: 65,
      });
    });
  });

  describe('analyzeAndOptimize', () => {
    beforeEach(async () => {
      await monitor.initialize();
    });

    it('should generate optimization suggestions', async () => {
      const optimizations = await monitor.analyzeAndOptimize();

      expect(optimizations).toBeInstanceOf(Array);
      expect(optimizations.length).toBeGreaterThan(0);

      const firstOpt = optimizations[0];
      expect(firstOpt).toMatchObject({
        type: expect.stringMatching(/^(warning|suggestion|critical)$/),
        category: expect.stringMatching(
          /^(memory|cpu|disk|gpu|network|general)$/,
        ),
        title: expect.any(String),
        description: expect.any(String),
        impact: expect.stringMatching(/^(low|medium|high)$/),
        actionable: expect.any(Boolean),
        actions: expect.any(Array),
        priority: expect.any(Number),
      });
    });

    it('should prioritize optimizations correctly', async () => {
      const optimizations = await monitor.analyzeAndOptimize();

      // Should be sorted by priority (highest first)
      for (let i = 0; i < optimizations.length - 1; i++) {
        expect(optimizations[i].priority).toBeGreaterThanOrEqual(
          optimizations[i + 1].priority,
        );
      }
    });

    it('should detect high memory usage', async () => {
      // Mock high memory usage
      const os = await import('os');
      vi.mocked(os.totalmem).mockReturnValue(16 * 1024 * 1024 * 1024); // 16GB
      vi.mocked(os.freemem).mockReturnValue(1 * 1024 * 1024 * 1024); // 1GB free (93.75% used)

      const optimizations = await monitor.analyzeAndOptimize();

      const memoryOptimizations = optimizations.filter(
        (opt) => opt.category === 'memory',
      );
      expect(memoryOptimizations.length).toBeGreaterThan(0);

      const criticalMemory = memoryOptimizations.find(
        (opt) => opt.type === 'critical',
      );
      expect(criticalMemory).toBeDefined();
      expect(criticalMemory!.title).toContain('Critical Memory Usage');
    });

    it('should detect excellent resources', async () => {
      // Mock excellent resources
      const os = await import('os');
      vi.mocked(os.totalmem).mockReturnValue(32 * 1024 * 1024 * 1024); // 32GB
      vi.mocked(os.freemem).mockReturnValue(20 * 1024 * 1024 * 1024); // 20GB free
      vi.mocked(os.loadavg).mockReturnValue([1.0, 1.0, 1.0]); // Low load

      const optimizations = await monitor.analyzeAndOptimize();

      const excellentMemory = optimizations.find(
        (opt) =>
          opt.title.includes('Excellent Memory') ||
          opt.title.includes('Optimally'),
      );
      expect(excellentMemory).toBeDefined();
    });

    it('should detect high CPU load', async () => {
      // Mock high CPU load
      const os = await import('os');
      vi.mocked(os.loadavg).mockReturnValue([7.5, 7.2, 7.0]); // High load for 8 cores

      const optimizations = await monitor.analyzeAndOptimize();

      const cpuOptimizations = optimizations.filter(
        (opt) => opt.category === 'cpu',
      );
      expect(cpuOptimizations.length).toBeGreaterThan(0);

      const highCPU = cpuOptimizations.find(
        (opt) =>
          opt.title.includes('Critical CPU') || opt.title.includes('High CPU'),
      );
      expect(highCPU).toBeDefined();
    });

    it('should suggest GPU optimizations when available', async () => {
      const { execSync } = await import('child_process');
      vi.mocked(execSync).mockReturnValue(
        'NVIDIA GeForce RTX 4090, 24576, 1024, 30, 70\n',
      );

      const optimizations = await monitor.analyzeAndOptimize();

      const gpuOptimizations = optimizations.filter(
        (opt) => opt.category === 'gpu',
      );
      expect(gpuOptimizations.length).toBeGreaterThan(0);

      const highEndGPU = gpuOptimizations.find((opt) =>
        opt.title.includes('High-End GPU'),
      );
      expect(highEndGPU).toBeDefined();
    });
  });

  describe('generateResourceReport', () => {
    beforeEach(async () => {
      await monitor.initialize();
    });

    it('should generate comprehensive resource report', async () => {
      const report = await monitor.generateResourceReport();

      expect(report).toContain('System Resource Report');
      expect(report).toContain('CPU Information');
      expect(report).toContain('Memory Information');
      expect(report).toContain('Disk Information');
      expect(report).toContain('Network Information');
      expect(report).toContain('Report generated at');
    });

    it('should include optimization suggestions in report', async () => {
      const report = await monitor.generateResourceReport();

      // Should include at least one optimization suggestion
      expect(report).toMatch(/(Critical Issues|Warnings|Suggestions)/);
    });

    it('should show GPU information when available', async () => {
      const { execSync } = await import('child_process');
      vi.mocked(execSync).mockReturnValue(
        'NVIDIA GeForce RTX 3080, 10240, 2048, 45, 65\n',
      );

      const report = await monitor.generateResourceReport();

      expect(report).toContain('GPU Information');
      expect(report).toContain('NVIDIA GeForce RTX 3080');
    });
  });

  describe('getModelRecommendationsForSystem', () => {
    beforeEach(async () => {
      await monitor.initialize();
    });

    it('should provide model recommendations based on system resources', async () => {
      const recommendations = await monitor.getModelRecommendationsForSystem();

      expect(recommendations).toMatchObject({
        recommended: expect.any(Array),
        discouraged: expect.any(Array),
        reasoning: expect.any(String),
      });

      expect(recommendations.recommended.length).toBeGreaterThan(0);
      expect(recommendations.reasoning).toContain(
        'Based on your system resources',
      );
    });

    it('should recommend large models for high-memory systems', async () => {
      const os = await import('os');
      vi.mocked(os.totalmem).mockReturnValue(32 * 1024 * 1024 * 1024); // 32GB
      vi.mocked(os.freemem).mockReturnValue(20 * 1024 * 1024 * 1024); // 20GB free

      const recommendations = await monitor.getModelRecommendationsForSystem();

      expect(recommendations.recommended).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/Large models/),
          expect.stringMatching(/Unquantized/),
        ]),
      );
    });

    it('should recommend small models for low-memory systems', async () => {
      const os = await import('os');
      vi.mocked(os.totalmem).mockReturnValue(4 * 1024 * 1024 * 1024); // 4GB
      vi.mocked(os.freemem).mockReturnValue(2 * 1024 * 1024 * 1024); // 2GB free

      const recommendations = await monitor.getModelRecommendationsForSystem();

      // With 2GB available RAM, it should recommend tiny models
      expect(recommendations.recommended).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/Tiny models/),
          expect.stringMatching(/Maximum quantization/),
        ]),
      );
      expect(recommendations.discouraged).toEqual(
        expect.arrayContaining([expect.stringMatching(/larger than 3B/)]),
      );
    });

    it('should recommend GPU acceleration for high-end GPUs', async () => {
      const { execSync } = await import('child_process');
      vi.mocked(execSync).mockReturnValue(
        'NVIDIA GeForce RTX 4090, 24576, 1024, 30, 70\n',
      );

      const recommendations = await monitor.getModelRecommendationsForSystem();

      expect(recommendations.recommended).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/GPU-accelerated/),
          expect.stringMatching(/CUDA/),
        ]),
      );
    });

    it('should recommend CPU optimization for systems without GPU', async () => {
      const { execSync } = await import('child_process');
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('nvidia-smi not found');
      });

      const recommendations = await monitor.getModelRecommendationsForSystem();

      expect(recommendations.recommended).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/CPU-optimized/),
          expect.stringMatching(/GGUF/),
        ]),
      );
    });
  });

  describe('edge cases and error handling', () => {
    beforeEach(async () => {
      await monitor.initialize();
    });

    it('should handle swap information unavailable gracefully', async () => {
      const fs = await import('fs/promises');
      vi.mocked(fs.readFile).mockRejectedValue(new Error('File not found'));

      const resources = await monitor.getSystemResources(true);

      expect(resources.memory.swapTotal).toBe(0);
      expect(resources.memory.swapUsed).toBe(0);
    });

    it('should handle disk information unavailable gracefully', async () => {
      // Since statvfs is optional and may not exist, this test verifies
      // that the fallback disk space estimation works
      const resources = await monitor.getSystemResources(true);

      expect(resources.disk.totalSpace).toBeGreaterThan(0);
      expect(resources.disk.availableSpace).toBeGreaterThan(0);
    });

    it('should handle invalid GPU data gracefully', async () => {
      const { execSync } = await import('child_process');
      vi.mocked(execSync).mockReturnValue('Invalid GPU data\n');

      const resources = await monitor.getSystemResources(true);

      expect(resources.gpu).toBeUndefined();
    });

    it('should handle missing CPU information gracefully', async () => {
      const os = await import('os');
      vi.mocked(os.cpus).mockReturnValue([]);

      const resources = await monitor.getSystemResources(true);

      expect(resources.cpu.cores).toBe(0);
      expect(resources.cpu.model).toBe('Unknown');
    });
  });
});
