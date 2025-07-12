/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Command } from 'commander';
import { LoRAFineTuner } from './loraFineTuner.js';
import { ErrorCollector } from './errorCollector.js';
import { PerformanceBenchmark } from './performanceBenchmark.js';
import { TrustModelManagerImpl } from './modelManager.js';
import { PerformanceMonitor } from './performanceMonitor.js';
import path from 'path';
import os from 'os';

/**
 * CLI interface for LoRA fine-tuning pipeline
 */
export class LoRAFineTuningCLI {
  private fineTuner: LoRAFineTuner;
  private modelManager: TrustModelManagerImpl;
  private errorCollector: ErrorCollector;
  private performanceBenchmark: PerformanceBenchmark;

  constructor() {
    const configDir = path.join(os.homedir(), '.trustcli');
    const performanceMonitor = new PerformanceMonitor();

    this.modelManager = new TrustModelManagerImpl();
    this.errorCollector = new ErrorCollector();
    this.performanceBenchmark = new PerformanceBenchmark(
      performanceMonitor,
      this.modelManager,
    );
    this.fineTuner = new LoRAFineTuner(
      configDir,
      this.errorCollector,
      this.performanceBenchmark,
    );
  }

  /**
   * Create CLI commands
   */
  createCommands(): Command {
    const program = new Command('lora');
    program.description('LoRA fine-tuning pipeline for Trust CLI models');

    // Analyze command
    program
      .command('analyze')
      .description('Analyze models to identify fine-tuning opportunities')
      .option('--model <name>', 'Analyze specific model')
      .option('--min-errors <count>', 'Minimum error count threshold', '10')
      .action(async (options) => {
        await this.analyzeModels(options);
      });

    // Dataset command
    const datasetCmd = program
      .command('dataset')
      .description('Manage training datasets');

    datasetCmd
      .command('create')
      .description('Create training dataset from error collection')
      .requiredOption('--model <name>', 'Model name to create dataset for')
      .option('--min-samples <count>', 'Minimum number of samples', '50')
      .option(
        '--error-types <types>',
        'Comma-separated error types',
        'wrong_tool,wrong_args,parse_error',
      )
      .action(async (options) => {
        await this.createDataset(options);
      });

    datasetCmd
      .command('list')
      .description('List available training datasets')
      .action(async () => {
        await this.listDatasets();
      });

    // Train command
    program
      .command('train')
      .description('Start LoRA fine-tuning')
      .requiredOption('--model <name>', 'Base model name')
      .requiredOption('--dataset <id>', 'Training dataset ID')
      .option('--rank <number>', 'LoRA rank', '16')
      .option('--alpha <number>', 'LoRA alpha', '32')
      .option('--epochs <number>', 'Training epochs', '3')
      .option('--learning-rate <rate>', 'Learning rate', '2e-4')
      .option('--batch-size <size>', 'Batch size', '4')
      .action(async (options) => {
        await this.startTraining(options);
      });

    // Jobs command
    const jobsCmd = program.command('jobs').description('Manage training jobs');

    jobsCmd
      .command('list')
      .description('List training jobs')
      .action(async () => {
        await this.listJobs();
      });

    jobsCmd
      .command('status')
      .description('Check job status')
      .requiredOption('--job-id <id>', 'Job ID')
      .action(async (options) => {
        await this.checkJobStatus(options);
      });

    // Adapters command
    const adaptersCmd = program
      .command('adapters')
      .description('Manage LoRA adapters');

    adaptersCmd
      .command('list')
      .description('List available adapters')
      .action(async () => {
        await this.listAdapters();
      });

    adaptersCmd
      .command('load')
      .description('Load adapter for inference')
      .requiredOption('--adapter-id <id>', 'Adapter ID')
      .action(async (options) => {
        await this.loadAdapter(options);
      });

    adaptersCmd
      .command('delete')
      .description('Delete adapter')
      .requiredOption('--adapter-id <id>', 'Adapter ID')
      .option('--force', 'Force deletion without confirmation')
      .action(async (options) => {
        await this.deleteAdapter(options);
      });

    // Report command
    program
      .command('report')
      .description('Generate training report')
      .option('--format <format>', 'Output format (text|json)', 'text')
      .option('--output <file>', 'Output file path')
      .action(async (options) => {
        await this.generateReport(options);
      });

    return program;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async analyzeModels(options: any): Promise<void> {
    console.log('🔍 Analyzing models for fine-tuning opportunities...\n');

    try {
      const models = this.modelManager.listAvailableModels();
      const modelsToAnalyze = options.model
        ? models.filter((m) => m.name === options.model)
        : models;

      if (modelsToAnalyze.length === 0) {
        console.log('❌ No models found to analyze.');
        return;
      }

      const weakModels =
        await this.fineTuner.identifyWeakModels(modelsToAnalyze);

      if (weakModels.length === 0) {
        console.log(
          '✅ No weak models detected. All models are performing well!',
        );
        return;
      }

      console.log(
        `Found ${weakModels.length} model(s) that could benefit from fine-tuning:\n`,
      );

      for (const { model, weaknesses, priority } of weakModels) {
        console.log(`📊 ${model.name} (${model.parameters})`);
        console.log(`   Priority: ${priority.toUpperCase()}`);
        console.log(`   Weaknesses:`);
        for (const weakness of weaknesses) {
          console.log(`     - ${weakness.replace(/_/g, ' ')}`);
        }
        console.log(`   RAM: ${model.ramRequirement}`);
        console.log(`   Trust Score: ${model.trustScore}`);
        console.log();
      }

      console.log('💡 Next steps:');
      console.log(
        '1. Create training dataset: trust lora dataset create --model <model-name>',
      );
      console.log(
        '2. Start training: trust lora train --model <model-name> --dataset <dataset-id>',
      );
    } catch (error) {
      console.error('❌ Analysis failed:', error);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async createDataset(options: any): Promise<void> {
    console.log(`📚 Creating training dataset for ${options.model}...\n`);

    try {
      const errorTypes = options.errorTypes
        .split(',')
        .map((t: string) => t.trim());
      const minSamples = parseInt(options.minSamples, 10);

      const dataset = await this.fineTuner.generateDatasetFromErrors(
        options.model,
        errorTypes,
        minSamples,
      );

      console.log('✅ Dataset created successfully!');
      console.log(`   ID: ${dataset.id}`);
      console.log(`   Name: ${dataset.name}`);
      console.log(`   Samples: ${dataset.samples.length}`);
      console.log(`   Quality: ${dataset.quality}`);
      console.log(`   Domain: ${dataset.domain}`);
      console.log(`   Source: ${dataset.source}`);
      console.log();
      console.log('💡 Start training with:');
      console.log(
        `trust lora train --model ${options.model} --dataset ${dataset.id}`,
      );
    } catch (error) {
      console.error('❌ Dataset creation failed:', error);
    }
  }

  private async listDatasets(): Promise<void> {
    console.log('📚 Available training datasets:\n');

    try {
      // This would need to be implemented in the LoRAFineTuner
      console.log(
        'Feature not yet implemented - datasets will be listed from storage',
      );
    } catch (error) {
      console.error('❌ Failed to list datasets:', error);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async startTraining(options: any): Promise<void> {
    console.log(`🚀 Starting LoRA fine-tuning for ${options.model}...\n`);

    try {
      const models = this.modelManager.listAvailableModels();
      const model = models.find((m) => m.name === options.model);

      if (!model) {
        console.error(`❌ Model ${options.model} not found`);
        return;
      }

      // For now, create a mock dataset since we don't have dataset loading
      const mockDataset = {
        id: options.dataset,
        name: `Dataset for ${options.model}`,
        description: 'Training dataset',
        source: 'error_collection' as const,
        samples: [],
        createdAt: new Date(),
        quality: 'medium' as const,
        domain: 'function_calling' as const,
      };

      const config = this.fineTuner.createOptimalConfig(
        options.model,
        model,
        mockDataset,
      );

      // Override with CLI options
      if (options.rank) config.rank = parseInt(options.rank, 10);
      if (options.alpha) config.alpha = parseInt(options.alpha, 10);
      if (options.epochs) config.epochs = parseInt(options.epochs, 10);
      if (options.learningRate)
        config.learningRate = parseFloat(options.learningRate);
      if (options.batchSize) config.batchSize = parseInt(options.batchSize, 10);

      console.log('📋 Training configuration:');
      console.log(`   Model: ${config.modelName}`);
      console.log(`   Rank: ${config.rank}`);
      console.log(`   Alpha: ${config.alpha}`);
      console.log(`   Epochs: ${config.epochs}`);
      console.log(`   Learning Rate: ${config.learningRate}`);
      console.log(`   Batch Size: ${config.batchSize}`);
      console.log();

      const job = await this.fineTuner.startFineTuning(config, mockDataset);

      console.log('✅ Training completed!');
      console.log(`   Job ID: ${job.id}`);
      console.log(`   Status: ${job.status}`);
      console.log(`   Progress: ${job.progress}%`);

      if (job.resultAdapter) {
        console.log(`   Adapter ID: ${job.resultAdapter.id}`);
        console.log(
          `   Accuracy: ${job.resultAdapter.performance.accuracy.toFixed(3)}`,
        );
        console.log(
          `   Benchmark Score: ${job.resultAdapter.performance.benchmarkScore.toFixed(3)}`,
        );
      }
    } catch (error) {
      console.error('❌ Training failed:', error);
    }
  }

  private async listJobs(): Promise<void> {
    console.log('📋 Training jobs:\n');
    console.log(
      'Feature not yet implemented - jobs will be listed from storage',
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async checkJobStatus(options: any): Promise<void> {
    console.log(`📊 Checking status for job ${options.jobId}...\n`);

    try {
      const status = this.fineTuner.getJobStatus(options.jobId);

      if (!status) {
        console.log('❌ Job not found');
        return;
      }

      console.log(`📋 Job Status: ${status.status.toUpperCase()}`);
      console.log(`   Progress: ${status.progress}%`);
      console.log(`   Started: ${status.startTime?.toISOString()}`);

      if (status.endTime) {
        console.log(`   Completed: ${status.endTime.toISOString()}`);
      }

      if (status.logs.length > 0) {
        console.log('   Recent logs:');
        status.logs.slice(-5).forEach((log) => console.log(`     ${log}`));
      }
    } catch (error) {
      console.error('❌ Failed to check job status:', error);
    }
  }

  private async listAdapters(): Promise<void> {
    console.log('🔧 Available LoRA adapters:\n');

    try {
      const adapters = await this.fineTuner.listAdapters();

      if (adapters.length === 0) {
        console.log('No adapters found. Train a model first!');
        return;
      }

      for (const adapter of adapters) {
        console.log(`📊 ${adapter.name} (${adapter.id})`);
        console.log(`   Base Model: ${adapter.baseModel}`);
        console.log(`   Accuracy: ${adapter.performance.accuracy.toFixed(3)}`);
        console.log(
          `   Benchmark Score: ${adapter.performance.benchmarkScore.toFixed(3)}`,
        );
        console.log(`   Created: ${adapter.createdAt.toISOString()}`);
        console.log(
          `   Training Duration: ${(adapter.trainingDuration / 1000).toFixed(1)}s`,
        );
        console.log();
      }
    } catch (error) {
      console.error('❌ Failed to list adapters:', error);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async loadAdapter(options: any): Promise<void> {
    console.log(`🔧 Loading adapter ${options.adapterId}...\n`);

    try {
      const adapter = await this.fineTuner.loadAdapter(options.adapterId);

      console.log('✅ Adapter loaded successfully!');
      console.log(`   Name: ${adapter.name}`);
      console.log(`   Base Model: ${adapter.baseModel}`);
      console.log(`   Performance:`);
      console.log(`     Accuracy: ${adapter.performance.accuracy.toFixed(3)}`);
      console.log(`     Loss: ${adapter.performance.loss.toFixed(3)}`);
      console.log(
        `     Perplexity: ${adapter.performance.perplexity.toFixed(2)}`,
      );
      console.log(
        `     Benchmark Score: ${adapter.performance.benchmarkScore.toFixed(3)}`,
      );
    } catch (error) {
      console.error('❌ Failed to load adapter:', error);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async deleteAdapter(options: any): Promise<void> {
    if (!options.force) {
      console.log(
        `⚠️  Are you sure you want to delete adapter ${options.adapterId}? (This action cannot be undone)`,
      );
      console.log('Use --force to confirm deletion');
      return;
    }

    console.log(`🗑️  Deleting adapter ${options.adapterId}...\n`);

    try {
      await this.fineTuner.deleteAdapter(options.adapterId);
      console.log('✅ Adapter deleted successfully!');
    } catch (error) {
      console.error('❌ Failed to delete adapter:', error);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async generateReport(options: any): Promise<void> {
    console.log('📊 Generating training report...\n');

    try {
      const report = await this.fineTuner.generateTrainingReport();

      if (options.output) {
        await import('fs/promises').then((fs) =>
          fs.writeFile(options.output, report),
        );
        console.log(`✅ Report saved to ${options.output}`);
      } else {
        console.log(report);
      }
    } catch (error) {
      console.error('❌ Failed to generate report:', error);
    }
  }
}

// Export CLI creation function
export function createLoRACommands(): Command {
  const cli = new LoRAFineTuningCLI();
  return cli.createCommands();
}
