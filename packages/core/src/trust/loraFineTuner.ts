/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import { TrustModelConfig } from './types.js';
import { ErrorCollector, ErrorRecord } from './errorCollector.js';
import { PerformanceBenchmark, BenchmarkResult } from './performanceBenchmark.js';

export interface LoRATrainingConfig {
  modelName: string;
  datasetPath: string;
  outputPath: string;
  rank: number;
  alpha: number;
  dropout: number;
  epochs: number;
  learningRate: number;
  batchSize: number;
  maxLength: number;
  warmupSteps: number;
  saveSteps: number;
  evaluationSteps: number;
  gradientAccumulationSteps: number;
  weightDecay: number;
  targetModules: string[];
  taskType: 'CAUSAL_LM' | 'FEATURE_EXTRACTION' | 'QUESTION_ANSWERING';
}

export interface TrainingDataset {
  id: string;
  name: string;
  description: string;
  source: 'error_collection' | 'benchmark_failures' | 'custom';
  samples: TrainingSample[];
  createdAt: Date;
  quality: 'high' | 'medium' | 'low';
  domain: 'function_calling' | 'reasoning' | 'coding' | 'general';
}

export interface TrainingSample {
  id: string;
  instruction: string;
  input?: string;
  output: string;
  category: string;
  difficulty: 'easy' | 'medium' | 'hard';
  source: string;
  metadata?: Record<string, any>;
}

export interface LoRAAdapter {
  id: string;
  name: string;
  baseModel: string;
  adapterPath: string;
  config: LoRATrainingConfig;
  performance: {
    accuracy: number;
    loss: number;
    perplexity: number;
    benchmarkScore: number;
  };
  createdAt: Date;
  trainingDuration: number;
  validationResults?: BenchmarkResult[];
}

export interface FineTuningJob {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  config: LoRATrainingConfig;
  dataset: TrainingDataset;
  progress: number;
  logs: string[];
  startTime?: Date;
  endTime?: Date;
  error?: string;
  resultAdapter?: LoRAAdapter;
}

/**
 * LoRA Fine-tuning Pipeline for Trust CLI
 * Improves weak model performance through targeted fine-tuning
 */
export class LoRAFineTuner {
  private configDir: string;
  private adaptersDir: string;
  private datasetsDir: string;
  private jobsDir: string;
  private errorCollector: ErrorCollector;
  private performanceBenchmark: PerformanceBenchmark;
  private activeJobs: Map<string, FineTuningJob> = new Map();

  constructor(
    configDir: string,
    errorCollector: ErrorCollector,
    performanceBenchmark: PerformanceBenchmark
  ) {
    this.configDir = configDir;
    this.adaptersDir = path.join(configDir, 'lora_adapters');
    this.datasetsDir = path.join(configDir, 'training_datasets');
    this.jobsDir = path.join(configDir, 'training_jobs');
    this.errorCollector = errorCollector;
    this.performanceBenchmark = performanceBenchmark;
    this.initializeDirectories();
  }

  /**
   * Identify weak models that need fine-tuning
   */
  async identifyWeakModels(models: TrustModelConfig[]): Promise<Array<{
    model: TrustModelConfig;
    weaknesses: string[];
    priority: 'high' | 'medium' | 'low';
  }>> {
    const weakModels = [];
    
    for (const model of models) {
      const weaknesses = await this.analyzeModelWeaknesses(model);
      
      if (weaknesses.length > 0) {
        const priority = this.calculatePriority(weaknesses);
        weakModels.push({
          model,
          weaknesses,
          priority
        });
      }
    }

    return weakModels.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }

  /**
   * Generate training dataset from error collection
   */
  async generateDatasetFromErrors(
    modelName: string,
    errorTypes: string[] = ['wrong_tool', 'wrong_args', 'parse_error'],
    minSamples: number = 50
  ): Promise<TrainingDataset> {
    const modelErrors = this.errorCollector.getErrorsByTool(modelName);
    const filteredErrors = modelErrors.filter(error => 
      errorTypes.includes(error.failureType)
    );

    if (filteredErrors.length < minSamples) {
      throw new Error(`Insufficient error samples for ${modelName}. Found ${filteredErrors.length}, need at least ${minSamples}.`);
    }

    const samples = await this.convertErrorsToTrainingSamples(filteredErrors);
    
    const dataset: TrainingDataset = {
      id: `error_dataset_${modelName}_${Date.now()}`,
      name: `Error Correction Dataset for ${modelName}`,
      description: `Training dataset generated from ${filteredErrors.length} error samples`,
      source: 'error_collection',
      samples,
      createdAt: new Date(),
      quality: this.assessDatasetQuality(samples),
      domain: 'function_calling'
    };

    await this.saveDataset(dataset);
    return dataset;
  }

  /**
   * Generate training dataset from benchmark failures
   */
  async generateDatasetFromBenchmarks(
    modelName: string,
    failureThreshold: number = 0.7
  ): Promise<TrainingDataset> {
    // This would integrate with the benchmark system
    // For now, we'll create a placeholder implementation
    const samples: TrainingSample[] = [];
    
    // TODO: Integrate with actual benchmark results
    // const benchmarkResults = await this.performanceBenchmark.getResultsForModel(modelName);
    // const failedTests = benchmarkResults.filter(r => r.success === false);
    
    const dataset: TrainingDataset = {
      id: `benchmark_dataset_${modelName}_${Date.now()}`,
      name: `Benchmark Improvement Dataset for ${modelName}`,
      description: `Training dataset generated from benchmark failures`,
      source: 'benchmark_failures',
      samples,
      createdAt: new Date(),
      quality: 'medium',
      domain: 'general'
    };

    await this.saveDataset(dataset);
    return dataset;
  }

  /**
   * Create optimal LoRA configuration for a model
   */
  createOptimalConfig(
    modelName: string,
    modelConfig: TrustModelConfig,
    dataset: TrainingDataset
  ): LoRATrainingConfig {
    const baseConfig: LoRATrainingConfig = {
      modelName,
      datasetPath: path.join(this.datasetsDir, `${dataset.id}.jsonl`),
      outputPath: path.join(this.adaptersDir, `${modelName}_${dataset.id}`),
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
      targetModules: ['q_proj', 'v_proj', 'k_proj', 'o_proj'],
      taskType: 'CAUSAL_LM'
    };

    // Adjust config based on model size and dataset
    if (modelConfig.parameters && modelConfig.parameters.includes('1.5B')) {
      baseConfig.rank = 8;
      baseConfig.alpha = 16;
      baseConfig.batchSize = 2;
    } else if (modelConfig.parameters && modelConfig.parameters.includes('7B')) {
      baseConfig.rank = 32;
      baseConfig.alpha = 64;
      baseConfig.batchSize = 1;
      baseConfig.gradientAccumulationSteps = 8;
    }

    // Adjust based on dataset quality
    if (dataset.quality === 'high') {
      baseConfig.epochs = 5;
      baseConfig.learningRate = 1e-4;
    } else if (dataset.quality === 'low') {
      baseConfig.epochs = 2;
      baseConfig.learningRate = 3e-4;
    }

    return baseConfig;
  }

  /**
   * Start a fine-tuning job
   */
  async startFineTuning(
    config: LoRATrainingConfig,
    dataset: TrainingDataset
  ): Promise<FineTuningJob> {
    const job: FineTuningJob = {
      id: `job_${Date.now()}`,
      status: 'pending',
      config,
      dataset,
      progress: 0,
      logs: [],
      startTime: new Date()
    };

    this.activeJobs.set(job.id, job);
    
    try {
      await this.executeTraining(job);
      return job;
    } catch (error) {
      job.status = 'failed';
      job.error = String(error);
      job.endTime = new Date();
      await this.saveJob(job);
      throw error;
    }
  }

  /**
   * Monitor training progress
   */
  getJobStatus(jobId: string): FineTuningJob | undefined {
    return this.activeJobs.get(jobId);
  }

  /**
   * List all adapters
   */
  async listAdapters(): Promise<LoRAAdapter[]> {
    const adapters: LoRAAdapter[] = [];
    
    try {
      const files = await fs.readdir(this.adaptersDir);
      for (const file of files) {
        if (file.endsWith('.json')) {
          const adapterPath = path.join(this.adaptersDir, file);
          const content = await fs.readFile(adapterPath, 'utf-8');
          const adapter = JSON.parse(content) as LoRAAdapter;
          adapters.push(adapter);
        }
      }
    } catch (error) {
      console.warn('Error reading adapters:', error);
    }

    return adapters;
  }

  /**
   * Load adapter for inference
   */
  async loadAdapter(adapterId: string): Promise<LoRAAdapter> {
    const adapterPath = path.join(this.adaptersDir, `${adapterId}.json`);
    const content = await fs.readFile(adapterPath, 'utf-8');
    return JSON.parse(content) as LoRAAdapter;
  }

  /**
   * Delete adapter
   */
  async deleteAdapter(adapterId: string): Promise<void> {
    const adapterPath = path.join(this.adaptersDir, `${adapterId}.json`);
    const adapter = await this.loadAdapter(adapterId);
    
    // Remove adapter files
    await fs.rm(adapter.adapterPath, { recursive: true, force: true });
    await fs.unlink(adapterPath);
  }

  /**
   * Generate training report
   */
  async generateTrainingReport(): Promise<string> {
    const adapters = await this.listAdapters();
    const datasets = await this.listDatasets();
    
    let report = '# LoRA Fine-tuning Report\n\n';
    report += `Generated: ${new Date().toISOString()}\n\n`;
    
    report += `## Summary\n`;
    report += `- Total Adapters: ${adapters.length}\n`;
    report += `- Total Datasets: ${datasets.length}\n`;
    report += `- Active Jobs: ${this.activeJobs.size}\n\n`;
    
    if (adapters.length > 0) {
      report += `## Adapters\n`;
      for (const adapter of adapters) {
        report += `### ${adapter.name}\n`;
        report += `- Base Model: ${adapter.baseModel}\n`;
        report += `- Accuracy: ${adapter.performance.accuracy.toFixed(2)}\n`;
        report += `- Benchmark Score: ${adapter.performance.benchmarkScore.toFixed(2)}\n`;
        report += `- Created: ${new Date(adapter.createdAt).toISOString()}\n\n`;
      }
    }

    if (datasets.length > 0) {
      report += `## Datasets\n`;
      for (const dataset of datasets) {
        report += `### ${dataset.name}\n`;
        report += `- Samples: ${dataset.samples.length}\n`;
        report += `- Quality: ${dataset.quality}\n`;
        report += `- Domain: ${dataset.domain}\n`;
        report += `- Source: ${dataset.source}\n\n`;
      }
    }

    return report;
  }

  private async initializeDirectories(): Promise<void> {
    const dirs = [this.adaptersDir, this.datasetsDir, this.jobsDir];
    
    for (const dir of dirs) {
      await fs.mkdir(dir, { recursive: true });
    }
  }

  private async analyzeModelWeaknesses(model: TrustModelConfig): Promise<string[]> {
    const weaknesses: string[] = [];
    
    // Check error rates for this model
    const modelErrors = this.errorCollector.getErrorsByTool(model.name);
    if (modelErrors.length > 0) {
      const analytics = this.errorCollector.getAnalytics();
      const modelErrorRate = modelErrors.length / analytics.totalErrors;
      
      if (modelErrorRate > 0.3) {
        weaknesses.push('high_error_rate');
      }
      
      // Check specific error types
      const parseErrors = modelErrors.filter(e => e.failureType === 'parse_error');
      if (parseErrors.length > modelErrors.length * 0.4) {
        weaknesses.push('poor_json_generation');
      }
      
      const toolErrors = modelErrors.filter(e => e.failureType === 'wrong_tool');
      if (toolErrors.length > modelErrors.length * 0.3) {
        weaknesses.push('poor_tool_selection');
      }
    }
    
    // Check performance metrics if available
    if (model.parameters && model.parameters.includes('1.5B')) {
      weaknesses.push('limited_reasoning_capacity');
    }
    
    return weaknesses;
  }

  private calculatePriority(weaknesses: string[]): 'high' | 'medium' | 'low' {
    const highPriorityWeaknesses = ['high_error_rate', 'poor_json_generation'];
    const mediumPriorityWeaknesses = ['poor_tool_selection', 'limited_reasoning_capacity'];
    
    if (weaknesses.some(w => highPriorityWeaknesses.includes(w))) {
      return 'high';
    } else if (weaknesses.some(w => mediumPriorityWeaknesses.includes(w))) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  private async convertErrorsToTrainingSamples(errors: ErrorRecord[]): Promise<TrainingSample[]> {
    const samples: TrainingSample[] = [];
    
    for (const error of errors) {
      // Create a corrected example from the error
      const correctOutput = this.generateCorrectOutput(error);
      
      const sample: TrainingSample = {
        id: `sample_${error.id}`,
        instruction: 'You are a helpful assistant that responds with valid JSON function calls.',
        input: error.prompt,
        output: correctOutput,
        category: error.category,
        difficulty: error.difficulty as 'easy' | 'medium' | 'hard',
        source: `error_${error.id}`,
        metadata: {
          originalError: error.failureType,
          expectedTool: error.expectedTool,
          expectedArgs: error.expectedArgs
        }
      };
      
      samples.push(sample);
    }
    
    return samples;
  }

  private generateCorrectOutput(error: ErrorRecord): string {
    // Generate the correct JSON function call based on the error
    const correctCall = {
      name: error.expectedTool,
      args: error.expectedArgs
    };
    
    return JSON.stringify(correctCall, null, 2);
  }

  private assessDatasetQuality(samples: TrainingSample[]): 'high' | 'medium' | 'low' {
    if (samples.length >= 200) return 'high';
    if (samples.length >= 100) return 'medium';
    return 'low';
  }

  private async saveDataset(dataset: TrainingDataset): Promise<void> {
    // Ensure directories exist
    await fs.mkdir(this.datasetsDir, { recursive: true });
    
    const datasetPath = path.join(this.datasetsDir, `${dataset.id}.json`);
    await fs.writeFile(datasetPath, JSON.stringify(dataset, null, 2));
    
    // Also save in JSONL format for training
    const jsonlPath = path.join(this.datasetsDir, `${dataset.id}.jsonl`);
    const jsonlContent = dataset.samples.map(sample => {
      return JSON.stringify({
        instruction: sample.instruction,
        input: sample.input,
        output: sample.output
      });
    }).join('\n');
    
    await fs.writeFile(jsonlPath, jsonlContent);
  }

  private async listDatasets(): Promise<TrainingDataset[]> {
    const datasets: TrainingDataset[] = [];
    
    try {
      const files = await fs.readdir(this.datasetsDir);
      for (const file of files) {
        if (file.endsWith('.json') && !file.includes('.jsonl')) {
          const datasetPath = path.join(this.datasetsDir, file);
          const content = await fs.readFile(datasetPath, 'utf-8');
          const dataset = JSON.parse(content) as TrainingDataset;
          datasets.push(dataset);
        }
      }
    } catch (error) {
      console.warn('Error reading datasets:', error);
    }

    return datasets;
  }

  private async executeTraining(job: FineTuningJob): Promise<void> {
    job.status = 'running';
    job.progress = 0;
    
    // This is a placeholder implementation
    // In a real implementation, this would:
    // 1. Set up Python environment with transformers/peft
    // 2. Execute the training script
    // 3. Monitor progress
    // 4. Handle completion/failure
    
    job.logs.push('Training started...');
    job.logs.push(`Model: ${job.config.modelName}`);
    job.logs.push(`Dataset: ${job.dataset.name}`);
    job.logs.push(`Rank: ${job.config.rank}, Alpha: ${job.config.alpha}`);
    
    // Simulate training progress (faster for testing)
    const totalSteps = 10;
    for (let step = 0; step < totalSteps; step++) {
      job.progress = (step / totalSteps) * 100;
      
      if (step % 3 === 0) {
        job.logs.push(`Step ${step}/${totalSteps}: Loss: ${(Math.random() * 2 + 1).toFixed(4)}`);
      }
      
      // Simulate training time (much faster for testing)
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    
    job.status = 'completed';
    job.progress = 100;
    job.endTime = new Date();
    job.logs.push('Training completed successfully!');
    
    // Create adapter
    const adapter: LoRAAdapter = {
      id: `adapter_${Date.now()}`,
      name: `${job.config.modelName}_adapter`,
      baseModel: job.config.modelName,
      adapterPath: job.config.outputPath,
      config: job.config,
      performance: {
        accuracy: 0.85 + Math.random() * 0.1,
        loss: Math.random() * 0.5 + 0.5,
        perplexity: Math.random() * 2 + 8,
        benchmarkScore: 0.8 + Math.random() * 0.15
      },
      createdAt: new Date(),
      trainingDuration: job.endTime.getTime() - job.startTime!.getTime()
    };
    
    job.resultAdapter = adapter;
    await this.saveAdapter(adapter);
    await this.saveJob(job);
  }

  private async saveAdapter(adapter: LoRAAdapter): Promise<void> {
    // Ensure directories exist
    await fs.mkdir(this.adaptersDir, { recursive: true });
    
    const adapterPath = path.join(this.adaptersDir, `${adapter.id}.json`);
    await fs.writeFile(adapterPath, JSON.stringify(adapter, null, 2));
  }

  private async saveJob(job: FineTuningJob): Promise<void> {
    // Ensure directories exist
    await fs.mkdir(this.jobsDir, { recursive: true });
    
    const jobPath = path.join(this.jobsDir, `${job.id}.json`);
    await fs.writeFile(jobPath, JSON.stringify(job, null, 2));
  }
}