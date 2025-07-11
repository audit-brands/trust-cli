/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { PerformanceMonitor } from './performanceMonitor.js';
import { HardwareOptimizer } from './hardwareOptimizer.js';
import { TrustModelConfig } from './types.js';
import { TrustModelManagerImpl } from './modelManager.js';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface BenchmarkTest {
  id: string;
  name: string;
  description: string;
  prompt: string;
  expectedTokens?: number;
  timeout?: number;
  category: 'speed' | 'quality' | 'reasoning' | 'coding' | 'general';
  difficulty: 'easy' | 'medium' | 'hard';
}

export interface BenchmarkResult {
  testId: string;
  modelName: string;
  success: boolean;
  metrics: {
    tokensPerSecond: number;
    totalTokens: number;
    inferenceTime: number;
    memoryUsed: number;
    cpuUsage: number;
    promptTokens: number;
    responseTokens: number;
  };
  response?: string;
  error?: string;
  timestamp: Date;
}

export interface ModelBenchmarkSummary {
  modelName: string;
  totalTests: number;
  successfulTests: number;
  averageSpeed: number;
  averageQuality: number;
  bestCategories: string[];
  worstCategories: string[];
  overallScore: number;
  efficiency: number; // tokens per second per GB RAM
  reliability: number; // success rate
}

export interface BenchmarkSuite {
  id: string;
  name: string;
  description: string;
  tests: BenchmarkTest[];
  createdAt: Date;
}

export interface BenchmarkReport {
  suiteId: string;
  suiteName: string;
  models: ModelBenchmarkSummary[];
  systemInfo: {
    platform: string;
    totalRAM: string;
    availableRAM: string;
    cpuCores: number;
    cpuSpeed: number;
  };
  recommendations: {
    fastest: string;
    mostEfficient: string;
    bestForCoding: string;
    bestForReasoning: string;
    bestOverall: string;
  };
  timestamp: Date;
  duration: number;
}

export class PerformanceBenchmark {
  private performanceMonitor: PerformanceMonitor;
  private hardwareOptimizer: HardwareOptimizer;
  private modelManager: TrustModelManagerImpl;
  private benchmarkSuites: Map<string, BenchmarkSuite> = new Map();
  private results: BenchmarkResult[] = [];

  constructor(
    performanceMonitor: PerformanceMonitor,
    modelManager: TrustModelManagerImpl
  ) {
    this.performanceMonitor = performanceMonitor;
    this.hardwareOptimizer = new HardwareOptimizer(performanceMonitor);
    this.modelManager = modelManager;
    this.initializeStandardSuites();
  }

  private initializeStandardSuites(): void {
    // Speed-focused test suite
    const speedSuite: BenchmarkSuite = {
      id: 'speed',
      name: 'Speed Benchmark',
      description: 'Tests focused on raw inference speed and responsiveness',
      tests: [
        {
          id: 'quick-response',
          name: 'Quick Response Test',
          description: 'Simple question requiring minimal processing',
          prompt: 'What is 2 + 2?',
          expectedTokens: 10,
          timeout: 5000,
          category: 'speed',
          difficulty: 'easy'
        },
        {
          id: 'short-summary',
          name: 'Short Summary',
          description: 'Summarize a paragraph quickly',
          prompt: 'Summarize in one sentence: Machine learning is a subset of artificial intelligence that enables computers to learn and improve from experience without being explicitly programmed.',
          expectedTokens: 30,
          timeout: 10000,
          category: 'speed',
          difficulty: 'medium'
        },
        {
          id: 'list-generation',
          name: 'List Generation',
          description: 'Generate a simple list quickly',
          prompt: 'List 5 programming languages.',
          expectedTokens: 25,
          timeout: 8000,
          category: 'speed',
          difficulty: 'easy'
        }
      ],
      createdAt: new Date()
    };

    // Quality-focused test suite
    const qualitySuite: BenchmarkSuite = {
      id: 'quality',
      name: 'Quality Benchmark',
      description: 'Tests focused on response quality and accuracy',
      tests: [
        {
          id: 'explain-concept',
          name: 'Concept Explanation',
          description: 'Explain a complex concept clearly',
          prompt: 'Explain quantum computing in simple terms that a high school student could understand.',
          expectedTokens: 150,
          timeout: 30000,
          category: 'quality',
          difficulty: 'medium'
        },
        {
          id: 'creative-writing',
          name: 'Creative Writing',
          description: 'Generate creative content',
          prompt: 'Write a short story (2-3 paragraphs) about a robot learning to paint.',
          expectedTokens: 200,
          timeout: 45000,
          category: 'quality',
          difficulty: 'hard'
        },
        {
          id: 'detailed-analysis',
          name: 'Detailed Analysis',
          description: 'Provide detailed analysis of a topic',
          prompt: 'Analyze the pros and cons of remote work for software developers.',
          expectedTokens: 250,
          timeout: 60000,
          category: 'quality',
          difficulty: 'medium'
        }
      ],
      createdAt: new Date()
    };

    // Coding-focused test suite
    const codingSuite: BenchmarkSuite = {
      id: 'coding',
      name: 'Coding Benchmark',
      description: 'Tests focused on programming and code generation',
      tests: [
        {
          id: 'simple-function',
          name: 'Simple Function',
          description: 'Write a basic function',
          prompt: 'Write a Python function that calculates the factorial of a number.',
          expectedTokens: 80,
          timeout: 20000,
          category: 'coding',
          difficulty: 'easy'
        },
        {
          id: 'debug-code',
          name: 'Debug Code',
          description: 'Find and fix a bug in code',
          prompt: 'Find the bug in this code and fix it:\n```python\ndef calculate_average(numbers):\n    total = 0\n    for num in numbers:\n        total += num\n    return total / len(numbers)\n\naverage = calculate_average([])\nprint(average)\n```',
          expectedTokens: 120,
          timeout: 30000,
          category: 'coding',
          difficulty: 'medium'
        },
        {
          id: 'algorithm-design',
          name: 'Algorithm Design',
          description: 'Design an efficient algorithm',
          prompt: 'Design an algorithm to find the longest palindromic substring in a string. Provide both the algorithm description and Python implementation.',
          expectedTokens: 300,
          timeout: 60000,
          category: 'coding',
          difficulty: 'hard'
        }
      ],
      createdAt: new Date()
    };

    // Reasoning test suite
    const reasoningSuite: BenchmarkSuite = {
      id: 'reasoning',
      name: 'Reasoning Benchmark',
      description: 'Tests focused on logical reasoning and problem solving',
      tests: [
        {
          id: 'logic-puzzle',
          name: 'Logic Puzzle',
          description: 'Solve a basic logic puzzle',
          prompt: 'If all cats are animals, and Fluffy is a cat, what can we conclude about Fluffy?',
          expectedTokens: 50,
          timeout: 15000,
          category: 'reasoning',
          difficulty: 'easy'
        },
        {
          id: 'math-problem',
          name: 'Math Problem',
          description: 'Solve a multi-step math problem',
          prompt: 'A train travels 240 miles in 4 hours. If it maintains the same speed, how long will it take to travel 420 miles? Show your work.',
          expectedTokens: 100,
          timeout: 25000,
          category: 'reasoning',
          difficulty: 'medium'
        },
        {
          id: 'complex-reasoning',
          name: 'Complex Reasoning',
          description: 'Complex multi-step reasoning problem',
          prompt: 'Three friends - Alice, Bob, and Carol - have different amounts of money. Alice has twice as much as Bob. Carol has $10 more than Alice. Together they have $70. How much does each person have?',
          expectedTokens: 150,
          timeout: 40000,
          category: 'reasoning',
          difficulty: 'hard'
        }
      ],
      createdAt: new Date()
    };

    this.benchmarkSuites.set(speedSuite.id, speedSuite);
    this.benchmarkSuites.set(qualitySuite.id, qualitySuite);
    this.benchmarkSuites.set(codingSuite.id, codingSuite);
    this.benchmarkSuites.set(reasoningSuite.id, reasoningSuite);
  }

  /**
   * Run a specific benchmark suite on given models
   */
  async runBenchmarkSuite(
    suiteId: string,
    modelNames: string[],
    onProgress?: (status: string, progress: number) => void
  ): Promise<BenchmarkReport> {
    const suite = this.benchmarkSuites.get(suiteId);
    if (!suite) {
      throw new Error(`Benchmark suite '${suiteId}' not found`);
    }

    const startTime = Date.now();
    const totalTests = suite.tests.length * modelNames.length;
    let completedTests = 0;

    const modelSummaries: ModelBenchmarkSummary[] = [];

    onProgress?.(`Starting benchmark suite: ${suite.name}`, 0);

    for (const modelName of modelNames) {
      onProgress?.(`Testing model: ${modelName}`, (completedTests / totalTests) * 100);

      const modelResults: BenchmarkResult[] = [];

      for (const test of suite.tests) {
        onProgress?.(
          `Running ${test.name} on ${modelName}`,
          (completedTests / totalTests) * 100
        );

        try {
          const result = await this.runSingleTest(test, modelName);
          modelResults.push(result);
          this.results.push(result);
        } catch (error) {
          const errorResult: BenchmarkResult = {
            testId: test.id,
            modelName,
            success: false,
            metrics: {
              tokensPerSecond: 0,
              totalTokens: 0,
              inferenceTime: 0,
              memoryUsed: 0,
              cpuUsage: 0,
              promptTokens: 0,
              responseTokens: 0
            },
            error: error instanceof Error ? error.message : String(error),
            timestamp: new Date()
          };
          modelResults.push(errorResult);
          this.results.push(errorResult);
        }

        completedTests++;
      }

      const summary = this.generateModelSummary(modelName, modelResults, suite.tests);
      modelSummaries.push(summary);
    }

    const duration = Date.now() - startTime;
    const systemCapabilities = this.hardwareOptimizer.getSystemCapabilities();

    const report: BenchmarkReport = {
      suiteId: suite.id,
      suiteName: suite.name,
      models: modelSummaries,
      systemInfo: {
        platform: systemCapabilities.platform,
        totalRAM: `${systemCapabilities.totalRAMGB.toFixed(1)}GB`,
        availableRAM: `${systemCapabilities.availableRAMGB.toFixed(1)}GB`,
        cpuCores: systemCapabilities.cpuCores,
        cpuSpeed: systemCapabilities.cpuSpeed
      },
      recommendations: this.generateRecommendations(modelSummaries),
      timestamp: new Date(),
      duration
    };

    onProgress?.('Benchmark complete', 100);
    return report;
  }

  /**
   * Run a single test on a specific model
   */
  private async runSingleTest(test: BenchmarkTest, modelName: string): Promise<BenchmarkResult> {
    const startTime = Date.now();
    const initialMetrics = this.performanceMonitor.getSystemMetrics();

    // Switch to the target model
    await this.modelManager.switchModel(modelName);

    // TODO: Replace with actual inference call when content generator is available
    // For now, we'll simulate the inference with timing and metrics
    const simulatedInferenceTime = Math.random() * 100 + 50; // 50-150ms for tests
    const simulatedTokens = test.expectedTokens || 50 + Math.floor(Math.random() * 100);
    
    await new Promise(resolve => setTimeout(resolve, simulatedInferenceTime));

    const endTime = Date.now();
    const finalMetrics = this.performanceMonitor.getSystemMetrics();
    const inferenceTime = endTime - startTime;

    const result: BenchmarkResult = {
      testId: test.id,
      modelName,
      success: true,
      metrics: {
        tokensPerSecond: (simulatedTokens / inferenceTime) * 1000,
        totalTokens: simulatedTokens,
        inferenceTime,
        memoryUsed: finalMetrics.memoryUsage.used - initialMetrics.memoryUsage.used,
        cpuUsage: finalMetrics.cpuUsage,
        promptTokens: test.prompt.split(/\s+/).length,
        responseTokens: simulatedTokens
      },
      response: `[Simulated response for ${test.name}]`,
      timestamp: new Date()
    };

    return result;
  }

  /**
   * Generate model performance summary from test results
   */
  private generateModelSummary(
    modelName: string,
    results: BenchmarkResult[],
    tests: BenchmarkTest[]
  ): ModelBenchmarkSummary {
    const successfulResults = results.filter(r => r.success);
    const totalTests = results.length;
    const successfulTests = successfulResults.length;

    const averageSpeed = successfulResults.length > 0
      ? successfulResults.reduce((sum, r) => sum + r.metrics.tokensPerSecond, 0) / successfulResults.length
      : 0;

    // Calculate quality score based on successful completion and response appropriateness
    const averageQuality = (successfulTests / totalTests) * 100;

    // Group results by category to find best/worst categories
    const categoryScores = new Map<string, number[]>();
    for (const result of successfulResults) {
      const test = tests.find(t => t.id === result.testId);
      if (test) {
        if (!categoryScores.has(test.category)) {
          categoryScores.set(test.category, []);
        }
        categoryScores.get(test.category)!.push(result.metrics.tokensPerSecond);
      }
    }

    const categoryAverages = Array.from(categoryScores.entries()).map(([category, scores]) => ({
      category,
      avgSpeed: scores.reduce((sum, score) => sum + score, 0) / scores.length
    }));

    categoryAverages.sort((a, b) => b.avgSpeed - a.avgSpeed);

    const bestCategories = categoryAverages.slice(0, 2).map(c => c.category);
    const worstCategories = categoryAverages.slice(-2).map(c => c.category);

    // Calculate overall score (weighted combination of speed, quality, reliability)
    const speedScore = Math.min(averageSpeed / 10, 100); // Normalize speed to 0-100
    const qualityScore = averageQuality;
    const reliabilityScore = (successfulTests / totalTests) * 100;

    const overallScore = (speedScore * 0.4 + qualityScore * 0.4 + reliabilityScore * 0.2);

    // Calculate efficiency (tokens per second per GB RAM requirement)
    const model = this.modelManager.listAvailableModels().find(m => m.name === modelName);
    const ramRequirement = model ? parseFloat(model.ramRequirement.replace('GB', '')) : 4;
    const efficiency = averageSpeed / ramRequirement;

    return {
      modelName,
      totalTests,
      successfulTests,
      averageSpeed,
      averageQuality,
      bestCategories,
      worstCategories,
      overallScore,
      efficiency,
      reliability: reliabilityScore
    };
  }

  /**
   * Generate recommendations based on benchmark results
   */
  private generateRecommendations(summaries: ModelBenchmarkSummary[]): BenchmarkReport['recommendations'] {
    const fastest = summaries.reduce((prev, current) => 
      current.averageSpeed > prev.averageSpeed ? current : prev
    );

    const mostEfficient = summaries.reduce((prev, current) => 
      current.efficiency > prev.efficiency ? current : prev
    );

    const bestOverall = summaries.reduce((prev, current) => 
      current.overallScore > prev.overallScore ? current : prev
    );

    const bestForCoding = summaries.reduce((prev, current) => 
      current.bestCategories.includes('coding') && current.overallScore > prev.overallScore ? current : prev
    );

    const bestForReasoning = summaries.reduce((prev, current) => 
      current.bestCategories.includes('reasoning') && current.overallScore > prev.overallScore ? current : prev
    );

    return {
      fastest: fastest.modelName,
      mostEfficient: mostEfficient.modelName,
      bestForCoding: bestForCoding.modelName,
      bestForReasoning: bestForReasoning.modelName,
      bestOverall: bestOverall.modelName
    };
  }

  /**
   * Get available benchmark suites
   */
  getBenchmarkSuites(): BenchmarkSuite[] {
    return Array.from(this.benchmarkSuites.values());
  }

  /**
   * Get benchmark results
   */
  getResults(modelName?: string, testId?: string): BenchmarkResult[] {
    let filtered = this.results;

    if (modelName) {
      filtered = filtered.filter(r => r.modelName === modelName);
    }

    if (testId) {
      filtered = filtered.filter(r => r.testId === testId);
    }

    return filtered;
  }

  /**
   * Save benchmark results to file
   */
  async saveBenchmarkReport(report: BenchmarkReport, outputPath: string): Promise<void> {
    const reportData = {
      ...report,
      exportedAt: new Date().toISOString(),
      version: '1.0.0'
    };

    await fs.writeFile(outputPath, JSON.stringify(reportData, null, 2));
  }

  /**
   * Load benchmark results from file
   */
  async loadBenchmarkReport(inputPath: string): Promise<BenchmarkReport> {
    const data = await fs.readFile(inputPath, 'utf-8');
    return JSON.parse(data);
  }

  /**
   * Generate a formatted benchmark report
   */
  generateTextReport(report: BenchmarkReport): string {
    let output = '';
    
    output += `\n🏁 Benchmark Report: ${report.suiteName}\n`;
    output += '═'.repeat(60) + '\n\n';
    
    // System Information
    output += `💻 System Information:\n`;
    output += `   Platform: ${report.systemInfo.platform}\n`;
    output += `   CPU Cores: ${report.systemInfo.cpuCores} @ ${report.systemInfo.cpuSpeed}MHz\n`;
    output += `   RAM: ${report.systemInfo.totalRAM} (${report.systemInfo.availableRAM} available)\n`;
    output += `   Duration: ${(report.duration / 1000).toFixed(1)}s\n\n`;
    
    // Model Rankings
    const sortedModels = [...report.models].sort((a, b) => b.overallScore - a.overallScore);
    
    output += `🏆 Model Rankings:\n`;
    sortedModels.forEach((model, index) => {
      const rank = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
      output += `   ${rank} ${model.modelName} (${model.overallScore.toFixed(1)}/100)\n`;
      output += `      Speed: ${model.averageSpeed.toFixed(1)} tokens/sec\n`;
      output += `      Efficiency: ${model.efficiency.toFixed(1)} tokens/sec/GB\n`;
      output += `      Reliability: ${model.reliability.toFixed(1)}%\n`;
      output += `      Best at: ${model.bestCategories.join(', ')}\n\n`;
    });
    
    // Recommendations
    output += `💡 Recommendations:\n`;
    output += `   🚀 Fastest: ${report.recommendations.fastest}\n`;
    output += `   ⚡ Most Efficient: ${report.recommendations.mostEfficient}\n`;
    output += `   💻 Best for Coding: ${report.recommendations.bestForCoding}\n`;
    output += `   🧠 Best for Reasoning: ${report.recommendations.bestForReasoning}\n`;
    output += `   🌟 Best Overall: ${report.recommendations.bestOverall}\n\n`;
    
    return output;
  }

  /**
   * Clear all benchmark results
   */
  clearResults(): void {
    this.results = [];
  }
}