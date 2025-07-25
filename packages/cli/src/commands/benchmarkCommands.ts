/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  PerformanceBenchmark,
  TrustModelManagerImpl,
  EnhancedUnifiedModelManager,
  globalPerformanceMonitor,
} from '@trust-cli/trust-cli-core';
import type {
  BenchmarkReport,
  BenchmarkResult,
} from '@trust-cli/trust-cli-core';
import * as fs from 'fs/promises';
import * as path from 'path';
import chalk from 'chalk';

export interface BenchmarkCommandArgs {
  action: 'run' | 'list' | 'results' | 'compare' | 'export' | 'help';
  suite?: string;
  models?: string[];
  output?: string;
  format?: 'text' | 'json' | 'csv';
  filter?: string;
  verbose?: boolean;
}

export class BenchmarkCommandHandler {
  private performanceBenchmark: PerformanceBenchmark;
  private modelManager: TrustModelManagerImpl;
  private unifiedModelManager: EnhancedUnifiedModelManager;

  constructor() {
    this.modelManager = new TrustModelManagerImpl();
    this.unifiedModelManager = new EnhancedUnifiedModelManager();
    this.performanceBenchmark = new PerformanceBenchmark(
      globalPerformanceMonitor,
      this.modelManager,
      this.unifiedModelManager,
    );
  }

  async initialize(): Promise<void> {
    await this.modelManager.initialize();
  }

  async handleCommand(args: BenchmarkCommandArgs): Promise<void> {
    try {
      switch (args.action) {
        case 'run':
          await this.runBenchmark(args);
          break;
        case 'list':
          await this.listSuites(args.verbose);
          break;
        case 'results':
          await this.showResults(args);
          break;
        case 'compare':
          await this.compareModels(args);
          break;
        case 'export':
          await this.exportResults(args);
          break;
        case 'help':
        default:
          this.showHelp();
          break;
      }
    } catch (error) {
      console.error(
        chalk.red(
          `❌ Benchmark command failed: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
      throw error;
    }
  }

  private async runBenchmark(args: BenchmarkCommandArgs): Promise<void> {
    const suite = args.suite || 'speed';
    const models = args.models || this.getAvailableModelNames();

    if (models.length === 0) {
      console.log('❌ No models available for benchmarking.');
      console.log(
        '💡 Download models first: trust model download <model-name>',
      );
      return;
    }

    console.log(`\n🚀 Starting Benchmark Suite: ${suite}`);
    console.log(`📊 Testing ${models.length} model(s): ${models.join(', ')}`);
    console.log('─'.repeat(60));

    const startTime = Date.now();

    try {
      const report = await this.performanceBenchmark.runBenchmarkSuite(
        suite,
        models,
        (status: string, progress: number) => {
          if (args.verbose) {
            console.log(`📊 ${status} (${progress.toFixed(1)}%)`);
          }
        },
      );

      const duration = Date.now() - startTime;
      console.log(`\n✅ Benchmark completed in ${(duration / 1000).toFixed(1)}s`);
      
      // Display results
      console.log(this.performanceBenchmark.generateTextReport(report));

      // Save results if output specified
      if (args.output) {
        await this.saveReport(report, args.output, args.format || 'json');
        console.log(`💾 Results saved to: ${args.output}`);
      }

    } catch (error) {
      console.error(
        `❌ Benchmark failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      console.log('\n🔧 Troubleshooting:');
      console.log('   • Check that models are downloaded and verified');
      console.log('   • Ensure sufficient system resources');
      console.log('   • Try running a single model first');
      throw error;
    }
  }

  private async listSuites(verbose = false): Promise<void> {
    const suites = this.performanceBenchmark.getBenchmarkSuites();

    console.log('\n📋 Available Benchmark Suites');
    console.log('═'.repeat(50));

    for (const suite of suites) {
      console.log(`\n🎯 ${suite.name} (${suite.id})`);
      console.log(`   ${suite.description}`);
      console.log(`   Tests: ${suite.tests.length}`);

      if (verbose) {
        console.log('   Test Details:');
        for (const test of suite.tests) {
          console.log(
            `     • ${test.name} (${test.category}, ${test.difficulty})`,
          );
          console.log(`       ${test.description}`);
        }
      }
    }

    console.log('\n💡 Usage:');
    console.log(
      `   trust benchmark run --suite <suite-id> --models <model1,model2>`,
    );
    console.log(
      `   trust benchmark run --suite speed --models phi-3.5-mini-instruct`,
    );
  }

  private async showResults(args: BenchmarkCommandArgs): Promise<void> {
    const results = this.performanceBenchmark.getResults(
      args.filter,
      undefined,
    );

    if (results.length === 0) {
      console.log('📊 No benchmark results found.');
      console.log('💡 Run a benchmark first: trust benchmark run');
      return;
    }

    console.log('\n📊 Benchmark Results');
    console.log('═'.repeat(50));

    // Group results by model
    const modelResultsMap = new Map<string, typeof results>();
    for (const result of results) {
      if (!modelResultsMap.has(result.modelName)) {
        modelResultsMap.set(result.modelName, []);
      }
      modelResultsMap.get(result.modelName)!.push(result);
    }

    for (const [modelName, modelResults] of modelResultsMap) {
      console.log(`\n🤖 ${modelName}`);

      const successful = modelResults.filter((r) => r.success);
      const successRate = (successful.length / modelResults.length) * 100;
      const avgSpeed =
        successful.length > 0
          ? successful.reduce((sum, r) => sum + r.metrics.tokensPerSecond, 0) /
            successful.length
          : 0;

      console.log(
        `   Success Rate: ${successRate.toFixed(1)}% (${successful.length}/${modelResults.length})`,
      );
      console.log(`   Average Speed: ${avgSpeed.toFixed(1)} tokens/sec`);
      console.log(
        `   Last Run: ${modelResults[modelResults.length - 1].timestamp.toLocaleString()}`,
      );

      if (args.verbose) {
        console.log('   Individual Tests:');
        for (const result of modelResults) {
          const status = result.success ? '✅' : '❌';
          console.log(
            `     ${status} ${result.testId}: ${result.metrics.tokensPerSecond.toFixed(1)} tokens/sec`,
          );
        }
      }
    }

    console.log('\n💡 Use --verbose for detailed results');
  }

  private async compareModels(args: BenchmarkCommandArgs): Promise<void> {
    const models = args.models || [];

    if (models.length < 2) {
      console.log('❌ Need at least 2 models to compare');
      console.log('💡 Usage: trust benchmark compare --models model1,model2');
      return;
    }

    console.log('\n🔍 Model Comparison');
    console.log('═'.repeat(50));

    const comparison: Array<{
      model: string;
      avgSpeed: number;
      successRate: number;
      totalTests: number;
    }> = [];

    for (const model of models) {
      const results = this.performanceBenchmark.getResults(model);
      const successful = results.filter((r) => r.success);
      const avgSpeed =
        successful.length > 0
          ? successful.reduce((sum, r) => sum + r.metrics.tokensPerSecond, 0) /
            successful.length
          : 0;

      comparison.push({
        model,
        avgSpeed,
        successRate:
          results.length > 0 ? (successful.length / results.length) * 100 : 0,
        totalTests: results.length,
      });
    }

    // Sort by average speed
    comparison.sort((a, b) => b.avgSpeed - a.avgSpeed);

    console.log('\n🏁 Speed Rankings:');
    comparison.forEach((item, index) => {
      const rank =
        index === 0
          ? '🥇'
          : index === 1
            ? '🥈'
            : index === 2
              ? '🥉'
              : `${index + 1}.`;
      console.log(`   ${rank} ${item.model}`);
      console.log(`      Speed: ${item.avgSpeed.toFixed(1)} tokens/sec`);
      console.log(`      Success Rate: ${item.successRate.toFixed(1)}%`);
      console.log(`      Tests: ${item.totalTests}`);
    });

    // Show relative performance
    if (comparison.length >= 2) {
      const fastest = comparison[0];
      const slowest = comparison[comparison.length - 1];
      const speedDiff =
        ((fastest.avgSpeed - slowest.avgSpeed) / slowest.avgSpeed) * 100;

      console.log(`\n📈 Performance Analysis:`);
      console.log(
        `   ${fastest.model} is ${speedDiff.toFixed(1)}% faster than ${slowest.model}`,
      );
    }
  }

  private async exportResults(args: BenchmarkCommandArgs): Promise<void> {
    const results = this.performanceBenchmark.getResults();

    if (results.length === 0) {
      console.log('📊 No results to export.');
      return;
    }

    const outputPath = args.output || `benchmark-results-${Date.now()}.json`;
    const format = args.format || 'json';

    try {
      await this.exportToFile(results, outputPath, format);
      console.log(`✅ Exported ${results.length} results to: ${outputPath}`);
    } catch (error) {
      console.error(
        `❌ Export failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  private async saveReport(
    report: BenchmarkReport,
    outputPath: string,
    format: string,
  ): Promise<void> {
    const dir = path.dirname(outputPath);
    await fs.mkdir(dir, { recursive: true });

    switch (format) {
      case 'json':
        await this.performanceBenchmark.saveBenchmarkReport(report, outputPath);
        break;
      case 'text': {
        const textReport = this.performanceBenchmark.generateTextReport(report);
        await fs.writeFile(outputPath, textReport);
        break;
      }
      case 'csv': {
        const csvContent = this.generateCSVReport(report);
        await fs.writeFile(outputPath, csvContent);
        break;
      }
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }

  private async exportToFile(
    results: BenchmarkResult[],
    outputPath: string,
    format: string,
  ): Promise<void> {
    const dir = path.dirname(outputPath);
    await fs.mkdir(dir, { recursive: true });

    switch (format) {
      case 'json':
        await fs.writeFile(outputPath, JSON.stringify(results, null, 2));
        break;
      case 'csv': {
        const csvContent = this.generateCSVFromResults(results);
        await fs.writeFile(outputPath, csvContent);
        break;
      }
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  private generateCSVReport(report: BenchmarkReport): string {
    const headers = [
      'Model',
      'Overall Score',
      'Average Speed (tokens/sec)',
      'Efficiency (tokens/sec/GB)',
      'Reliability (%)',
      'Total Tests',
      'Successful Tests',
      'Best Categories',
    ];

    const rows: string[][] = report.models.map((model) => [
      model.modelName,
      model.overallScore.toFixed(2),
      model.averageSpeed.toFixed(2),
      model.efficiency.toFixed(2),
      model.reliability.toFixed(2),
      model.totalTests.toString(),
      model.successfulTests.toString(),
      model.bestCategories.join(';'),
    ]);

    return [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
  }

  private generateCSVFromResults(results: BenchmarkResult[]): string {
    const headers = [
      'Timestamp',
      'Model',
      'Test ID',
      'Success',
      'Tokens/sec',
      'Total Tokens',
      'Inference Time (ms)',
      'Memory Used (bytes)',
      'CPU Usage (%)',
    ];

    const rows = results.map((result) => [
      result.timestamp.toISOString(),
      result.modelName,
      result.testId,
      result.success.toString(),
      result.metrics.tokensPerSecond.toFixed(2),
      result.metrics.totalTokens.toString(),
      result.metrics.inferenceTime.toString(),
      result.metrics.memoryUsed.toString(),
      result.metrics.cpuUsage.toFixed(1),
    ]);

    return [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
  }

  private getAvailableModelNames(): string[] {
    const models = this.modelManager.listAvailableModels();
    return models.map((m) => m.name);
  }

  private showHelp(): void {
    console.log(`
🏁 Trust CLI - Performance Benchmark Commands

USAGE:
    trust benchmark <action> [options]

ACTIONS:
    run [options]              Run performance benchmarks
    list [--verbose]           List available benchmark suites
    results [--filter <model>] Show benchmark results
    compare --models <list>    Compare model performance
    export [--output <file>]   Export results to file
    help                       Show this help message

OPTIONS:
    --suite <id>               Benchmark suite to run (speed, quality, coding, reasoning)
    --models <list>            Comma-separated list of models to test
    --output <file>            Output file path for results
    --format <type>            Output format (json, text, csv)
    --filter <model>           Filter results by model name
    --verbose                  Show detailed output

EXAMPLES:
    trust benchmark run                                    # Run speed benchmark on all models
    trust benchmark run --suite quality --models phi-3.5-mini-instruct
    trust benchmark list --verbose                        # List all test suites with details
    trust benchmark results --filter phi-3.5-mini-instruct
    trust benchmark compare --models model1,model2        # Compare two models
    trust benchmark export --output results.csv --format csv

BENCHMARK SUITES:
    speed      - Tests focused on raw inference speed
    quality    - Tests focused on response quality and accuracy  
    coding     - Tests focused on programming and code generation
    reasoning  - Tests focused on logical reasoning and problem solving

📊 Performance benchmarks help you choose the best model for your specific needs,
    comparing speed, quality, efficiency, and reliability across standardized tests.
`);
  }
}
