/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  globalPerformanceMonitor,
  ModelProfiler,
  HardwareOptimizer,
} from '@trust-cli/trust-cli-core';
import chalk from 'chalk';

export interface PerformanceCommandArgs {
  action:
    | 'status'
    | 'report'
    | 'watch'
    | 'optimize'
    | 'profile'
    | 'recommend'
    | 'regression';
  verbose?: boolean;
  watch?: boolean;
  interval?: number;
  model?: string;
  workload?: string;
  format?: 'json' | 'csv' | 'text';
  output?: string;
}

class PerformanceCommandHandler {
  private modelProfiler: ModelProfiler;
  private hardwareOptimizer: HardwareOptimizer;

  constructor() {
    this.hardwareOptimizer = new HardwareOptimizer(globalPerformanceMonitor);
    this.modelProfiler = new ModelProfiler(
      globalPerformanceMonitor,
      this.hardwareOptimizer,
    );
  }

  async handleCommand(args: PerformanceCommandArgs): Promise<void> {
    switch (args.action) {
      case 'status':
        await this.showStatus(args.verbose);
        break;
      case 'report':
        await this.showReport(args.format, args.output);
        break;
      case 'watch':
        await this.watchPerformance(args.interval || 1000);
        break;
      case 'optimize':
        await this.showOptimizationSuggestions();
        break;
      case 'profile':
        await this.showModelProfile(args.model);
        break;
      case 'recommend':
        await this.showWorkloadRecommendations(args.workload);
        break;
      case 'regression':
        await this.showPerformanceRegressions();
        break;
      default:
        throw new Error(`Unknown performance command: ${args.action}`);
    }
  }

  private async showStatus(verbose = false): Promise<void> {
    if (verbose) {
      console.log(globalPerformanceMonitor.formatSystemReport());
    } else {
      console.log('\n⚡ System Status');
      console.log('─'.repeat(30));
      console.log(globalPerformanceMonitor.formatCompactStatus());

      const metrics = globalPerformanceMonitor.getSystemMetrics();
      const stats = globalPerformanceMonitor.getInferenceStats();

      console.log('\n🖥️  Quick Overview:');
      console.log(
        `   Memory Available: ${this.formatBytes(metrics.memoryUsage.available)}`,
      );
      console.log(
        `   CPU Cores: ${(await import('os')).default.cpus().length}`,
      );
      console.log(`   Total Inferences: ${stats.totalInferences}`);

      if (stats.averageTokensPerSecond > 0) {
        console.log(
          `   Average Speed: ${stats.averageTokensPerSecond.toFixed(1)} tokens/sec`,
        );
      }

      console.log('\n💡 Use "trust perf report" for detailed information');
      console.log('💡 Use "trust perf watch" to monitor in real-time');
    }
  }

  private async showReport(_format?: string, _output?: string): Promise<void> {
    console.log(globalPerformanceMonitor.formatSystemReport());

    const stats = globalPerformanceMonitor.getInferenceStats();
    if (stats.recentMetrics.length > 0) {
      console.log('📊 Recent Inference History:');
      console.log('─'.repeat(50));

      stats.recentMetrics.slice(-5).forEach((metric, index) => {
        console.log(`   ${index + 1}. ${metric.modelName}`);
        console.log(
          `      Speed: ${metric.tokensPerSecond.toFixed(1)} tokens/sec`,
        );
        console.log(`      Time: ${metric.inferenceTime}ms`);
        console.log(`      Tokens: ${metric.totalTokens}`);
        console.log('');
      });
    }
  }

  private async watchPerformance(interval: number): Promise<void> {
    console.log('🔍 Watching system performance (Press Ctrl+C to stop)...\n');
    console.log('Time      | CPU  | Memory | Heap Used | Load Avg');
    console.log('─'.repeat(55));

    const stopMonitoring = globalPerformanceMonitor.monitorResourceUsage(
      (usage) => {
        const metrics = globalPerformanceMonitor.getSystemMetrics();
        const timestamp = new Date().toLocaleTimeString();
        const memoryPercent =
          (metrics.memoryUsage.used / metrics.memoryUsage.total) * 100;
        const loadAvg = metrics.loadAverage[0].toFixed(2);

        process.stdout.write('\r');
        process.stdout.write(
          `${timestamp} | ${usage.cpuPercent.toFixed(0).padStart(3)}% | ` +
            `${memoryPercent.toFixed(0).padStart(5)}% | ` +
            `${this.formatBytes(metrics.nodeMemory.heapUsed).padStart(8)} | ` +
            `${loadAvg.padStart(7)}`,
        );
      },
      interval,
    );

    // Handle Ctrl+C gracefully
    process.on('SIGINT', () => {
      stopMonitoring();
      console.log('\n\n🛑 Performance monitoring stopped.');
      process.exit(0);
    });

    // Keep the process alive
    await new Promise(() => {}); // Infinite promise
  }

  private async showOptimizationSuggestions(): Promise<void> {
    console.log('\n🎯 System Optimization Suggestions');
    console.log('═'.repeat(50));

    const optimal = globalPerformanceMonitor.getOptimalModelSettings();
    const metrics = globalPerformanceMonitor.getSystemMetrics();
    const memoryPercent =
      (metrics.memoryUsage.used / metrics.memoryUsage.total) * 100;

    console.log('\n🚀 Recommended Model Settings:');
    console.log(`   Max RAM Allocation: ${optimal.recommendedRAM}GB`);
    console.log(`   Context Size: ${optimal.maxContextSize} tokens`);
    console.log(`   Quantization: ${optimal.preferredQuantization}`);
    console.log(`   Expected Speed: ${optimal.estimatedSpeed}`);

    console.log('\n⚠️  System Analysis:');

    if (memoryPercent > 80) {
      console.log('   🔴 High memory usage detected');
      console.log('      → Consider using smaller models or Q4 quantization');
      console.log('      → Close unnecessary applications');
    } else if (memoryPercent > 60) {
      console.log('   🟡 Moderate memory usage');
      console.log('      → Current settings should work well');
    } else {
      console.log('   🟢 Low memory usage');
      console.log('      → You can safely use larger models');
    }

    if (metrics.cpuUsage > 80) {
      console.log('   🔴 High CPU usage detected');
      console.log('      → Reduce context size for faster inference');
      console.log('      → Consider lower thread count');
    } else {
      console.log('   🟢 CPU usage is optimal');
    }

    const os = await import('os');
    const cpuCores = os.default.cpus().length;
    if (cpuCores <= 4) {
      console.log('   ⚠️  Limited CPU cores detected');
      console.log('      → Use Q4_K_M quantization for better performance');
      console.log('      → Keep context size under 4096 tokens');
    }

    console.log('\n💡 Recommendations:');

    if (optimal.estimatedSpeed === 'slow') {
      console.log('   → Use qwen2.5-1.5b-instruct for fastest performance');
      console.log('   → Keep prompts short and focused');
    } else if (optimal.estimatedSpeed === 'medium') {
      console.log('   → llama-3.2-3b-instruct offers good balance');
      console.log('   → phi-3.5-mini-instruct excels at coding tasks');
    } else {
      console.log('   → llama-3.1-8b-instruct for highest quality');
      console.log('   → System can handle longer contexts efficiently');
    }

    console.log('\n🔧 Performance Tips:');
    console.log(
      '   • Use "trust model recommend <task>" for task-specific models',
    );
    console.log('   • Monitor performance with "trust perf watch"');
    console.log('   • Verify model integrity with "trust model verify"');
  }

  private async showModelProfile(modelName?: string): Promise<void> {
    if (!modelName) {
      console.log(chalk.red('❌ Model name is required. Use --model <name>'));
      return;
    }

    const profile = this.modelProfiler.getModelProfile(modelName);
    if (!profile) {
      console.log(chalk.yellow(`⚠️ No profile found for model: ${modelName}`));
      console.log('Start using the model to generate profiling data.');
      return;
    }

    console.log(chalk.blue(`\n📊 Performance Profile: ${modelName}`));
    console.log('═'.repeat(60));

    console.log(chalk.green('\n🚀 Performance Metrics:'));
    console.log(
      `   Average Speed: ${profile.performance.averageTokensPerSecond.toFixed(2)} tokens/sec`,
    );
    console.log(
      `   Peak Speed: ${profile.performance.peakTokensPerSecond.toFixed(2)} tokens/sec`,
    );
    console.log(
      `   Average Latency: ${profile.performance.averageLatency.toFixed(0)}ms`,
    );
    console.log(
      `   Throughput Efficiency: ${profile.performance.throughputEfficiency.toFixed(2)} tokens/sec/GB`,
    );

    console.log(chalk.blue('\n💾 Resource Usage:'));
    console.log(
      `   Base Memory: ${(profile.resources.baseMemoryMB / 1024).toFixed(1)}GB`,
    );
    console.log(
      `   CPU Utilization: ${profile.resources.cpuUtilization.toFixed(1)}%`,
    );
    if (profile.resources.gpuUtilization) {
      console.log(
        `   GPU Utilization: ${profile.resources.gpuUtilization.toFixed(1)}%`,
      );
    }

    console.log(chalk.magenta('\n✨ Quality Metrics:'));
    console.log(
      `   Consistency Score: ${(profile.quality.consistencyScore * 100).toFixed(1)}%`,
    );
    console.log(
      `   Error Rate: ${(profile.quality.errorRate * 100).toFixed(2)}%`,
    );
    console.log(
      `   Context Adherence: ${(profile.quality.contextAdherence * 100).toFixed(1)}%`,
    );

    console.log(chalk.cyan('\n⚙️ Optimal Settings:'));
    console.log(`   Context Size: ${profile.usage.optimalContextSize} tokens`);
    console.log(`   Temperature: ${profile.usage.optimalTemperature}`);
    console.log(`   Batch Size: ${profile.usage.optimalBatchSize}`);

    console.log(chalk.gray('\n📈 Usage History:'));
    console.log(`   Total Inferences: ${profile.history.totalInferences}`);
    console.log(`   Performance Trend: ${profile.history.performanceTrend}`);
    console.log(`   Last Used: ${profile.history.lastUsed.toLocaleString()}`);

    if (profile.recommendations.length > 0) {
      console.log(chalk.yellow('\n💡 Recommendations:'));
      profile.recommendations.slice(0, 3).forEach((rec, i) => {
        console.log(`   ${i + 1}. ${rec.title}`);
        console.log(`      ${rec.description}`);
        console.log(`      Action: ${rec.action}`);
        if (rec.expectedImprovement) {
          console.log(`      Expected: ${rec.expectedImprovement}`);
        }
        console.log();
      });
    }

    // Generate optimization recommendations
    const optimizations =
      await this.modelProfiler.generateOptimizationRecommendations(modelName);
    if (optimizations.length > 0) {
      console.log(chalk.green('\n🎯 Optimization Opportunities:'));
      optimizations.slice(0, 3).forEach((opt, i) => {
        const priorityColor =
          opt.priority === 'high'
            ? chalk.red
            : opt.priority === 'medium'
              ? chalk.yellow
              : chalk.blue;
        console.log(
          `   ${i + 1}. ${priorityColor(opt.title)} [${opt.priority}]`,
        );
        console.log(`      ${opt.description}`);
        console.log(`      ${opt.implementation}`);
        console.log(`      Expected: ${opt.expectedImprovement}`);
        console.log();
      });
    }
  }

  private async showWorkloadRecommendations(
    workloadType?: string,
  ): Promise<void> {
    const workloadPatterns = ['chat', 'coding', 'analysis'];

    if (!workloadType) {
      console.log(chalk.blue('\n🎯 Available Workload Types:'));
      console.log('   • chat - Interactive conversations');
      console.log('   • coding - Code generation and debugging');
      console.log('   • analysis - Document analysis and reasoning');
      console.log('\nUse --workload <type> to get specific recommendations');
      return;
    }

    if (!workloadPatterns.includes(workloadType)) {
      console.log(chalk.red(`❌ Unknown workload type: ${workloadType}`));
      console.log(`Available types: ${workloadPatterns.join(', ')}`);
      return;
    }

    console.log(
      chalk.blue(
        `\n🎯 Model Recommendations for ${workloadType.toUpperCase()} workload`,
      ),
    );
    console.log('═'.repeat(60));

    // This would get recommendations from the profiler
    // For now, show example recommendations based on workload type
    const recommendations =
      this.getWorkloadExampleRecommendations(workloadType);

    recommendations.forEach((rec, i) => {
      console.log(
        chalk.green(`\n${i + 1}. ${rec.model} (Score: ${rec.score}/100)`),
      );
      console.log(`   Reason: ${rec.reason}`);
      console.log(`   Speed: ${rec.performance.speed} tokens/sec`);
      console.log(`   Memory: ${rec.performance.memory}GB`);
      console.log(`   CPU Usage: ${rec.performance.cpu}%`);
      if (rec.warnings.length > 0) {
        console.log(chalk.yellow(`   Warnings: ${rec.warnings.join(', ')}`));
      }
    });

    console.log(chalk.cyan('\n⚙️ Optimal Settings for this workload:'));
    const settings = this.getOptimalSettingsForWorkload(workloadType);
    Object.entries(settings).forEach(([key, value]) => {
      console.log(`   ${key}: ${value}`);
    });
  }

  private async showPerformanceRegressions(): Promise<void> {
    console.log(chalk.blue('\n🔍 Performance Regression Analysis'));
    console.log('═'.repeat(50));

    const regressions = await this.modelProfiler.detectPerformanceRegressions();

    if (regressions.length === 0) {
      console.log(chalk.green('✅ No performance regressions detected!'));
      console.log('All models are performing within expected parameters.');
      return;
    }

    regressions.forEach((regression, i) => {
      const severityColor =
        regression.significance === 'major'
          ? chalk.red
          : regression.significance === 'moderate'
            ? chalk.yellow
            : chalk.blue;

      console.log(
        severityColor(
          `\n${i + 1}. ${regression.modelName} - ${regression.metric.toUpperCase()}`,
        ),
      );
      console.log(`   Severity: ${regression.significance}`);
      console.log(`   Previous: ${regression.previousValue.toFixed(2)}`);
      console.log(`   Current: ${regression.currentValue.toFixed(2)}`);
      console.log(`   Degradation: ${regression.degradation.toFixed(1)}%`);
      console.log(`   Detected: ${regression.detected.toLocaleString()}`);

      if (regression.possibleCauses.length > 0) {
        console.log('   Possible causes:');
        regression.possibleCauses.forEach((cause) => {
          console.log(`   • ${cause}`);
        });
      }
    });

    console.log(chalk.yellow('\n💡 Recommended Actions:'));
    console.log('   • Check system resource usage');
    console.log('   • Verify model file integrity');
    console.log('   • Restart the application');
    console.log('   • Monitor for thermal throttling');
  }

  private getWorkloadExampleRecommendations(workloadType: string) {
    const recommendations = {
      chat: [
        {
          model: 'qwen2.5-1.5b-instruct',
          score: 95,
          reason: 'Optimized for fast, interactive responses',
          performance: { speed: 45, memory: 2.1, cpu: 35 },
          warnings: [],
        },
        {
          model: 'phi-3.5-mini-instruct',
          score: 88,
          reason: 'Good balance of speed and quality',
          performance: { speed: 32, memory: 3.2, cpu: 42 },
          warnings: [],
        },
      ],
      coding: [
        {
          model: 'phi-3.5-mini-instruct',
          score: 92,
          reason: 'Excellent code generation capabilities',
          performance: { speed: 28, memory: 3.2, cpu: 45 },
          warnings: [],
        },
        {
          model: 'llama-3.2-3b-instruct',
          score: 85,
          reason: 'Strong reasoning for complex code tasks',
          performance: { speed: 22, memory: 4.8, cpu: 55 },
          warnings: ['Higher memory usage'],
        },
      ],
      analysis: [
        {
          model: 'llama-3.1-8b-instruct',
          score: 90,
          reason: 'Superior analytical and reasoning capabilities',
          performance: { speed: 15, memory: 8.5, cpu: 65 },
          warnings: ['High resource requirements'],
        },
        {
          model: 'llama-3.2-3b-instruct',
          score: 82,
          reason: 'Good analysis with moderate resource usage',
          performance: { speed: 22, memory: 4.8, cpu: 55 },
          warnings: [],
        },
      ],
    };

    return recommendations[workloadType as keyof typeof recommendations] || [];
  }

  private getOptimalSettingsForWorkload(workloadType: string) {
    const settings = {
      chat: {
        temperature: '0.7',
        maxTokens: '512',
        topP: '0.9',
        contextWindow: '2048 tokens',
      },
      coding: {
        temperature: '0.2',
        maxTokens: '1024',
        topP: '0.85',
        contextWindow: '4096 tokens',
      },
      analysis: {
        temperature: '0.3',
        maxTokens: '1024',
        topP: '0.9',
        contextWindow: '8192 tokens',
      },
    };

    return settings[workloadType as keyof typeof settings] || {};
  }

  private formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(1)}${units[unitIndex]}`;
  }
}

export async function handlePerformanceCommand(
  args: PerformanceCommandArgs,
): Promise<void> {
  const handler = new PerformanceCommandHandler();
  await handler.handleCommand(args);
}
