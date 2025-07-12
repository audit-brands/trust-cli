/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import {
  LoRAFineTuner,
  type LoRATrainingConfig,
  type TrainingDataset,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  type FineTuningJob,
} from './loraFineTuner.js';
import { ErrorCollector } from './errorCollector.js';
import { PerformanceBenchmark } from './performanceBenchmark.js';
import { TrustModelConfig } from './types.js';

describe('LoRAFineTuner', () => {
  let fineTuner: LoRAFineTuner;
  let errorCollector: ErrorCollector;
  let performanceBenchmark: PerformanceBenchmark;
  let tempDir: string;

  beforeEach(async () => {
    // Create temporary directory for testing
    tempDir = path.join(process.cwd(), 'test_lora_temp');
    await fs.mkdir(tempDir, { recursive: true });

    // Mock dependencies
    errorCollector = {
      getErrorsByTool: vi.fn(),
      getAnalytics: vi.fn(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    performanceBenchmark = {
      getResultsForModel: vi.fn(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    fineTuner = new LoRAFineTuner(
      tempDir,
      errorCollector,
      performanceBenchmark,
    );
  });

  afterEach(async () => {
    // Clean up temporary files
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('Model Weakness Analysis', () => {
    it('should identify models with high error rates', async () => {
      const models: TrustModelConfig[] = [
        {
          name: 'weak-model',
          path: 'test.gguf',
          type: 'phi',
          parameters: '1.5B',
          contextSize: 2048,
          ramRequirement: '2GB',
          description: 'Test model',
          trustScore: 8.0,
          downloadUrl: 'https://example.com/model.gguf',
          verificationHash: 'test-hash',
          expectedSize: 1000000,
        quantization: 'Q4_K_M',
          quantization: 'Q4_K_M',
        },
      ];

      // Mock high error rate
      vi.mocked(errorCollector.getErrorsByTool).mockReturnValue([
        { id: '1', failureType: 'parse_error' },
        { id: '2', failureType: 'wrong_tool' },
        { id: '3', failureType: 'parse_error' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ] as any);

      vi.mocked(errorCollector.getAnalytics).mockReturnValue({
        totalErrors: 5,
        errorsByType: {},
        errorsByCategory: {},
        errorsByDifficulty: {},
        commonFailures: [],
        toolAccuracy: {},
      });

      const weakModels = await fineTuner.identifyWeakModels(models);

      expect(weakModels).toHaveLength(1);
      expect(weakModels[0].model.name).toBe('weak-model');
      expect(weakModels[0].weaknesses).toContain('high_error_rate');
      expect(weakModels[0].weaknesses).toContain('poor_json_generation');
      expect(weakModels[0].weaknesses).toContain('limited_reasoning_capacity');
      expect(weakModels[0].priority).toBe('high');
    });

    it('should identify models with poor tool selection', async () => {
      const models: TrustModelConfig[] = [
        {
          name: 'tool-confused-model',
          path: 'test.gguf',
          type: 'phi',
          parameters: '3B',
          contextSize: 4096,
          ramRequirement: '4GB',
          description: 'Test model',
          trustScore: 8.5,
          downloadUrl: 'https://example.com/model.gguf',
          verificationHash: 'test-hash',
          expectedSize: 2000000,
          quantization: 'Q4_K_M',
        },
      ];

      // Mock tool selection errors
      vi.mocked(errorCollector.getErrorsByTool).mockReturnValue([
        { id: '1', failureType: 'wrong_tool' },
        { id: '2', failureType: 'wrong_tool' },
        { id: '3', failureType: 'wrong_args' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ] as any);

      vi.mocked(errorCollector.getAnalytics).mockReturnValue({
        totalErrors: 10,
        errorsByType: {},
        errorsByCategory: {},
        errorsByDifficulty: {},
        commonFailures: [],
        toolAccuracy: {},
      });

      const weakModels = await fineTuner.identifyWeakModels(models);

      expect(weakModels).toHaveLength(1);
      expect(weakModels[0].weaknesses).toContain('poor_tool_selection');
      expect(weakModels[0].priority).toBe('medium');
    });

    it('should not identify strong models as weak', async () => {
      const models: TrustModelConfig[] = [
        {
          name: 'strong-model',
          path: 'test.gguf',
          type: 'phi',
          parameters: '7B',
          contextSize: 8192,
          ramRequirement: '8GB',
          description: 'Test model',
          trustScore: 9.5,
          downloadUrl: 'https://example.com/model.gguf',
          verificationHash: 'test-hash',
          expectedSize: 4000000,
          quantization: 'Q4_K_M',
        },
      ];

      // Mock no errors
      vi.mocked(errorCollector.getErrorsByTool).mockReturnValue([]);
      vi.mocked(errorCollector.getAnalytics).mockReturnValue({
        totalErrors: 100,
        errorsByType: {},
        errorsByCategory: {},
        errorsByDifficulty: {},
        commonFailures: [],
        toolAccuracy: {},
      });

      const weakModels = await fineTuner.identifyWeakModels(models);

      expect(weakModels).toHaveLength(0);
    });
  });

  describe('Dataset Generation', () => {
    it('should generate dataset from error collection', async () => {
      const mockErrors = [
        {
          id: 'error1',
          prompt: 'List files in directory',
          expectedTool: 'list_directory',
          expectedArgs: { path: '.' },
          failureType: 'parse_error',
          category: 'file_operations',
          difficulty: 'easy',
        },
        {
          id: 'error2',
          prompt: 'Read file content',
          expectedTool: 'read_file',
          expectedArgs: { path: 'test.txt' },
          failureType: 'wrong_tool',
          category: 'file_operations',
          difficulty: 'medium',
        },
      ];

      // Add more mock errors to meet minimum requirement
      for (let i = 3; i <= 60; i++) {
        mockErrors.push({
          id: `error${i}`,
          prompt: `Test prompt ${i}`,
          expectedTool: 'test_tool',
          expectedArgs: {},
          failureType: 'parse_error',
          category: 'test',
          difficulty: 'easy',
        });
      }

      vi.mocked(errorCollector.getErrorsByTool).mockReturnValue(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mockErrors as any,
      );

      const dataset = await fineTuner.generateDatasetFromErrors('test-model');

      expect(dataset.samples).toHaveLength(60);
      expect(dataset.source).toBe('error_collection');
      expect(dataset.domain).toBe('function_calling');
      expect(dataset.quality).toBe('low'); // < 100 samples

      // Check that files were created
      const datasetPath = path.join(
        tempDir,
        'training_datasets',
        `${dataset.id}.json`,
      );
      const jsonlPath = path.join(
        tempDir,
        'training_datasets',
        `${dataset.id}.jsonl`,
      );

      expect(
        await fs
          .access(datasetPath)
          .then(() => true)
          .catch(() => false),
      ).toBe(true);
      expect(
        await fs
          .access(jsonlPath)
          .then(() => true)
          .catch(() => false),
      ).toBe(true);
    });

    it('should throw error when insufficient samples', async () => {
      vi.mocked(errorCollector.getErrorsByTool).mockReturnValue([
        { id: 'error1', failureType: 'parse_error' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ] as any);

      await expect(
        fineTuner.generateDatasetFromErrors('test-model'),
      ).rejects.toThrow('Insufficient error samples');
    });

    it('should assess dataset quality correctly', async () => {
      const mockErrors = Array.from({ length: 250 }, (_, i) => ({
        id: `error${i}`,
        prompt: `Test prompt ${i}`,
        expectedTool: 'test_tool',
        expectedArgs: {},
        failureType: 'parse_error',
        category: 'test',
        difficulty: 'easy',
      }));

      vi.mocked(errorCollector.getErrorsByTool).mockReturnValue(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mockErrors as any,
      );

      const dataset = await fineTuner.generateDatasetFromErrors('test-model');

      expect(dataset.quality).toBe('high'); // >= 200 samples
    });
  });

  describe('LoRA Configuration', () => {
    it('should create optimal config for small models', () => {
      const modelConfig: TrustModelConfig = {
        name: 'small-model',
        path: 'test.gguf',
        type: 'phi',
        parameters: '1.5B',
        contextSize: 2048,
        ramRequirement: '2GB',
        description: 'Small test model',
        trustScore: 8.0,
        downloadUrl: 'https://example.com/model.gguf',
        verificationHash: 'test-hash',
        expectedSize: 1000000,
        quantization: 'Q4_K_M',
      };

      const dataset: TrainingDataset = {
        id: 'test-dataset',
        name: 'Test Dataset',
        description: 'Test',
        source: 'error_collection',
        samples: [],
        createdAt: new Date(),
        quality: 'medium',
        domain: 'function_calling',
      };

      const config = fineTuner.createOptimalConfig(
        'small-model',
        modelConfig,
        dataset,
      );

      expect(config.rank).toBe(8);
      expect(config.alpha).toBe(16);
      expect(config.batchSize).toBe(2);
      expect(config.learningRate).toBe(2e-4);
      expect(config.epochs).toBe(3);
    });

    it('should create optimal config for large models', () => {
      const modelConfig: TrustModelConfig = {
        name: 'large-model',
        path: 'test.gguf',
        type: 'phi',
        parameters: '7B',
        contextSize: 8192,
        ramRequirement: '8GB',
        description: 'Large test model',
        trustScore: 9.0,
        downloadUrl: 'https://example.com/model.gguf',
        verificationHash: 'test-hash',
        expectedSize: 4000000,
      };

      const dataset: TrainingDataset = {
        id: 'test-dataset',
        name: 'Test Dataset',
        description: 'Test',
        source: 'error_collection',
        samples: [],
        createdAt: new Date(),
        quality: 'high',
        domain: 'function_calling',
      };

      const config = fineTuner.createOptimalConfig(
        'large-model',
        modelConfig,
        dataset,
      );

      expect(config.rank).toBe(32);
      expect(config.alpha).toBe(64);
      expect(config.batchSize).toBe(1);
      expect(config.gradientAccumulationSteps).toBe(8);
      expect(config.learningRate).toBe(1e-4); // Adjusted for high quality dataset
      expect(config.epochs).toBe(5); // Adjusted for high quality dataset
    });

    it('should adjust config based on dataset quality', () => {
      const modelConfig: TrustModelConfig = {
        name: 'test-model',
        path: 'test.gguf',
        type: 'phi',
        parameters: '3B',
        contextSize: 4096,
        ramRequirement: '4GB',
        description: 'Test model',
        trustScore: 8.5,
        downloadUrl: 'https://example.com/model.gguf',
        verificationHash: 'test-hash',
        expectedSize: 2000000,
      };

      const lowQualityDataset: TrainingDataset = {
        id: 'low-quality-dataset',
        name: 'Low Quality Dataset',
        description: 'Test',
        source: 'error_collection',
        samples: [],
        createdAt: new Date(),
        quality: 'low',
        domain: 'function_calling',
      };

      const config = fineTuner.createOptimalConfig(
        'test-model',
        modelConfig,
        lowQualityDataset,
      );

      expect(config.epochs).toBe(2);
      expect(config.learningRate).toBe(3e-4);
    });
  });

  describe('Training Management', () => {
    it('should start fine-tuning job', async () => {
      const config: LoRATrainingConfig = {
        modelName: 'test-model',
        datasetPath: 'test-dataset.jsonl',
        outputPath: 'test-output',
        rank: 16,
        alpha: 32,
        dropout: 0.1,
        epochs: 3,
        learningRate: 2e-4,
        batchSize: 4,
        maxLength: 512,
        warmupSteps: 100,
        saveSteps: 500,
        evaluationSteps: 100,
        gradientAccumulationSteps: 4,
        weightDecay: 0.01,
        targetModules: ['q_proj', 'v_proj'],
        taskType: 'CAUSAL_LM',
      };

      const dataset: TrainingDataset = {
        id: 'test-dataset',
        name: 'Test Dataset',
        description: 'Test',
        source: 'error_collection',
        samples: [],
        createdAt: new Date(),
        quality: 'medium',
        domain: 'function_calling',
      };

      const job = await fineTuner.startFineTuning(config, dataset);

      expect(job.id).toBeDefined();
      expect(job.status).toBe('completed');
      expect(job.progress).toBe(100);
      expect(job.resultAdapter).toBeDefined();
      expect(job.logs).toContain('Training started...');
      expect(job.logs).toContain('Training completed successfully!');
    });

    it('should track job status', async () => {
      const config: LoRATrainingConfig = {
        modelName: 'test-model',
        datasetPath: 'test-dataset.jsonl',
        outputPath: 'test-output',
        rank: 16,
        alpha: 32,
        dropout: 0.1,
        epochs: 3,
        learningRate: 2e-4,
        batchSize: 4,
        maxLength: 512,
        warmupSteps: 100,
        saveSteps: 500,
        evaluationSteps: 100,
        gradientAccumulationSteps: 4,
        weightDecay: 0.01,
        targetModules: ['q_proj', 'v_proj'],
        taskType: 'CAUSAL_LM',
      };

      const dataset: TrainingDataset = {
        id: 'test-dataset',
        name: 'Test Dataset',
        description: 'Test',
        source: 'error_collection',
        samples: [],
        createdAt: new Date(),
        quality: 'medium',
        domain: 'function_calling',
      };

      const job = await fineTuner.startFineTuning(config, dataset);
      const status = fineTuner.getJobStatus(job.id);

      expect(status).toBeDefined();
      expect(status?.id).toBe(job.id);
      expect(status?.status).toBe('completed');
    });
  });

  describe('Adapter Management', () => {
    it('should list adapters', async () => {
      // Create mock adapter
      const mockAdapter = {
        id: 'test-adapter',
        name: 'Test Adapter',
        baseModel: 'test-model',
        adapterPath: 'test-path',
        config: {} as LoRATrainingConfig,
        performance: {
          accuracy: 0.9,
          loss: 0.3,
          perplexity: 10,
          benchmarkScore: 0.85,
        },
        createdAt: new Date(),
        trainingDuration: 60000,
      };

      const adapterPath = path.join(
        tempDir,
        'lora_adapters',
        'test-adapter.json',
      );
      await fs.mkdir(path.dirname(adapterPath), { recursive: true });
      await fs.writeFile(adapterPath, JSON.stringify(mockAdapter, null, 2));

      const adapters = await fineTuner.listAdapters();

      expect(adapters).toHaveLength(1);
      expect(adapters[0].id).toBe('test-adapter');
      expect(adapters[0].name).toBe('Test Adapter');
    });

    it('should load specific adapter', async () => {
      const mockAdapter = {
        id: 'test-adapter',
        name: 'Test Adapter',
        baseModel: 'test-model',
        adapterPath: 'test-path',
        config: {} as LoRATrainingConfig,
        performance: {
          accuracy: 0.9,
          loss: 0.3,
          perplexity: 10,
          benchmarkScore: 0.85,
        },
        createdAt: new Date(),
        trainingDuration: 60000,
      };

      const adapterPath = path.join(
        tempDir,
        'lora_adapters',
        'test-adapter.json',
      );
      await fs.mkdir(path.dirname(adapterPath), { recursive: true });
      await fs.writeFile(adapterPath, JSON.stringify(mockAdapter, null, 2));

      const adapter = await fineTuner.loadAdapter('test-adapter');

      expect(adapter.id).toBe('test-adapter');
      expect(adapter.name).toBe('Test Adapter');
    });

    it('should delete adapter', async () => {
      const mockAdapter = {
        id: 'test-adapter',
        name: 'Test Adapter',
        baseModel: 'test-model',
        adapterPath: path.join(tempDir, 'adapter-files'),
        config: {} as LoRATrainingConfig,
        performance: {
          accuracy: 0.9,
          loss: 0.3,
          perplexity: 10,
          benchmarkScore: 0.85,
        },
        createdAt: new Date(),
        trainingDuration: 60000,
      };

      const adapterPath = path.join(
        tempDir,
        'lora_adapters',
        'test-adapter.json',
      );
      await fs.mkdir(path.dirname(adapterPath), { recursive: true });
      await fs.mkdir(mockAdapter.adapterPath, { recursive: true });
      await fs.writeFile(adapterPath, JSON.stringify(mockAdapter, null, 2));

      await fineTuner.deleteAdapter('test-adapter');

      const exists = await fs
        .access(adapterPath)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(false);
    });
  });

  describe('Reporting', () => {
    it('should generate training report', async () => {
      // Create mock adapter and dataset
      const mockAdapter = {
        id: 'test-adapter',
        name: 'Test Adapter',
        baseModel: 'test-model',
        adapterPath: 'test-path',
        config: {} as LoRATrainingConfig,
        performance: {
          accuracy: 0.9,
          loss: 0.3,
          perplexity: 10,
          benchmarkScore: 0.85,
        },
        createdAt: new Date(),
        trainingDuration: 60000,
      };

      const mockDataset: TrainingDataset = {
        id: 'test-dataset',
        name: 'Test Dataset',
        description: 'Test',
        source: 'error_collection',
        samples: [],
        createdAt: new Date(),
        quality: 'medium',
        domain: 'function_calling',
      };

      const adapterPath = path.join(
        tempDir,
        'lora_adapters',
        'test-adapter.json',
      );
      const datasetPath = path.join(
        tempDir,
        'training_datasets',
        'test-dataset.json',
      );

      await fs.mkdir(path.dirname(adapterPath), { recursive: true });
      await fs.mkdir(path.dirname(datasetPath), { recursive: true });
      await fs.writeFile(adapterPath, JSON.stringify(mockAdapter, null, 2));
      await fs.writeFile(datasetPath, JSON.stringify(mockDataset, null, 2));

      const report = await fineTuner.generateTrainingReport();

      expect(report).toContain('# LoRA Fine-tuning Report');
      expect(report).toContain('Total Adapters: 1');
      expect(report).toContain('Total Datasets: 1');
      expect(report).toContain('Test Adapter');
      expect(report).toContain('Test Dataset');
    });
  });
});
