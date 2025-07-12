/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  PerformanceMonitor,
  InferenceMetrics,
  SystemMetrics,
} from './performanceMonitor.js';
import {
  HardwareOptimizer,
  ModelRecommendation,
  OptimizationRecommendation,
} from './hardwareOptimizer.js';
import { TrustModelConfig, GenerationOptions } from './types.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

/**
 * Detailed model performance profile
 */
export interface ModelProfile {
  modelName: string;
  modelConfig: TrustModelConfig;

  // Performance characteristics
  performance: {
    averageTokensPerSecond: number;
    peakTokensPerSecond: number;
    averageLatency: number; // Time to first token
    throughputEfficiency: number; // Tokens/sec per GB RAM
    memoryEfficiency: number; // RAM usage stability
    contextUtilization: number; // How well it uses available context
  };

  // Resource usage patterns
  resources: {
    baseMemoryMB: number; // Memory without context
    memoryPerToken: number; // Additional memory per context token
    cpuUtilization: number; // Average CPU usage during inference
    gpuUtilization?: number; // GPU usage if available
    powerEfficiency: number; // Performance per watt estimate
  };

  // Quality metrics
  quality: {
    consistencyScore: number; // How consistent outputs are
    errorRate: number; // Rate of failed generations
    contextAdherence: number; // How well it follows instructions
    creativityIndex: number; // Variance in outputs (when appropriate)
  };

  // Usage patterns
  usage: {
    optimalContextSize: number;
    optimalTemperature: number;
    optimalBatchSize: number;
    bestUseCases: string[];
    worstUseCases: string[];
  };

  // Historical data
  history: {
    totalInferences: number;
    firstSeen: Date;
    lastUsed: Date;
    performanceTrend: 'improving' | 'stable' | 'declining';
    averageSessionLength: number;
  };

  // Derived recommendations
  recommendations: ModelProfileRecommendation[];
}

/**
 * Specific recommendation for a model
 */
export interface ModelProfileRecommendation {
  type: 'performance' | 'resource' | 'quality' | 'usage';
  priority: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  action: string;
  expectedImprovement: string;
  implementation: {
    setting?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    value?: any;
    code?: string;
  };
}

/**
 * Workload analysis for intelligent recommendations
 */
export interface WorkloadPattern {
  id: string;
  name: string;
  characteristics: {
    averagePromptLength: number;
    averageResponseLength: number;
    contextUsage: number;
    interactionFrequency: number;
    taskComplexity: 'simple' | 'moderate' | 'complex';
    creativity: 'factual' | 'balanced' | 'creative';
  };
  optimalModels: string[];
  optimalSettings: GenerationOptions;
}

/**
 * Performance regression detector
 */
export interface PerformanceRegression {
  modelName: string;
  metric: string;
  previousValue: number;
  currentValue: number;
  degradation: number; // Percentage
  detected: Date;
  significance: 'minor' | 'moderate' | 'major';
  possibleCauses: string[];
}

/**
 * Advanced model profiler with ML-based recommendations
 */
export class ModelProfiler {
  private performanceMonitor: PerformanceMonitor;
  private hardwareOptimizer: HardwareOptimizer;
  private profiles: Map<string, ModelProfile> = new Map();
  private workloadPatterns: Map<string, WorkloadPattern> = new Map();
  private performanceHistory: Map<string, InferenceMetrics[]> = new Map();
  private profilesDir: string;

  constructor(
    performanceMonitor: PerformanceMonitor,
    hardwareOptimizer?: HardwareOptimizer,
  ) {
    this.performanceMonitor = performanceMonitor;
    this.hardwareOptimizer =
      hardwareOptimizer || new HardwareOptimizer(performanceMonitor);
    this.profilesDir = path.join(os.homedir(), '.trustcli', 'profiles');
    this.initializeProfiler();
  }

  private async initializeProfiler(): Promise<void> {
    try {
      await fs.mkdir(this.profilesDir, { recursive: true });
      await this.loadExistingProfiles();
      await this.initializeWorkloadPatterns();
    } catch (error) {
      console.warn('Failed to initialize model profiler:', error);
    }
  }

  /**
   * Start profiling a model during inference
   */
  async startModelProfiling(
    modelName: string,
    modelConfig: TrustModelConfig,
  ): Promise<void> {
    if (!this.profiles.has(modelName)) {
      const profile = await this.createInitialProfile(modelName, modelConfig);
      this.profiles.set(modelName, profile);
    }
  }

  /**
   * Record inference metrics for profiling
   */
  async recordInference(
    modelName: string,
    metrics: InferenceMetrics,
    systemMetrics: SystemMetrics,
    options?: GenerationOptions,
  ): Promise<void> {
    // Update performance history
    if (!this.performanceHistory.has(modelName)) {
      this.performanceHistory.set(modelName, []);
    }

    const history = this.performanceHistory.get(modelName)!;
    history.push(metrics);

    // Keep only last 1000 inferences
    if (history.length > 1000) {
      history.splice(0, history.length - 1000);
    }

    // Update model profile
    const profile = this.profiles.get(modelName);
    if (profile) {
      await this.updateModelProfile(profile, metrics, systemMetrics, options);
    }
  }

  /**
   * Get comprehensive model profile
   */
  getModelProfile(modelName: string): ModelProfile | undefined {
    return this.profiles.get(modelName);
  }

  /**
   * Get performance recommendations for a specific workload
   */
  getWorkloadRecommendations(
    workloadPattern: WorkloadPattern,
  ): ModelRecommendation[] {
    const recommendations: ModelRecommendation[] = [];

    for (const [_modelName, profile] of this.profiles) {
      const suitabilityScore = this.calculateWorkloadSuitability(
        profile,
        workloadPattern,
      );

      if (suitabilityScore > 60) {
        // Only recommend suitable models
        recommendations.push({
          model: profile.modelConfig,
          suitabilityScore,
          reason: this.generateWorkloadReason(
            profile,
            workloadPattern,
            suitabilityScore,
          ),
          performanceEstimate: {
            tokensPerSecond: profile.performance.averageTokensPerSecond,
            ramUsageGB: profile.resources.baseMemoryMB / 1024,
            cpuUtilization: profile.resources.cpuUtilization,
          },
          warnings: this.generateWorkloadWarnings(profile, workloadPattern),
        });
      }
    }

    return recommendations.sort(
      (a, b) => b.suitabilityScore - a.suitabilityScore,
    );
  }

  /**
   * Detect performance regressions
   */
  async detectPerformanceRegressions(): Promise<PerformanceRegression[]> {
    const regressions: PerformanceRegression[] = [];

    for (const [modelName, profile] of this.profiles) {
      const history = this.performanceHistory.get(modelName);
      if (!history || history.length < 20) continue; // Need sufficient data

      const recentMetrics = history.slice(-10);
      const historicalMetrics = history.slice(-50, -10);

      const recentAvgSpeed = this.calculateAverageSpeed(recentMetrics);
      const historicalAvgSpeed = this.calculateAverageSpeed(historicalMetrics);

      const degradation =
        ((historicalAvgSpeed - recentAvgSpeed) / historicalAvgSpeed) * 100;

      if (degradation > 10) {
        // 10% degradation threshold
        regressions.push({
          modelName,
          metric: 'tokensPerSecond',
          previousValue: historicalAvgSpeed,
          currentValue: recentAvgSpeed,
          degradation,
          detected: new Date(),
          significance:
            degradation > 30
              ? 'major'
              : degradation > 20
                ? 'moderate'
                : 'minor',
          possibleCauses: this.identifyRegressionCauses(profile, degradation),
        });
      }
    }

    return regressions;
  }

  /**
   * Generate intelligent optimization recommendations
   */
  async generateOptimizationRecommendations(
    modelName: string,
  ): Promise<OptimizationRecommendation[]> {
    const profile = this.profiles.get(modelName);
    if (!profile) return [];

    const recommendations: OptimizationRecommendation[] = [];

    // Memory optimization
    if (profile.resources.baseMemoryMB > 8000) {
      // > 8GB
      recommendations.push({
        category: 'resource',
        priority: 'high',
        title: 'High Memory Usage Detected',
        description: `Model uses ${Math.round(profile.resources.baseMemoryMB / 1024)}GB RAM`,
        implementation: 'Consider using a quantized version (Q4_K_M or Q8_0)',
        expectedImprovement:
          '50-70% memory reduction with minimal quality loss',
      });
    }

    // Performance optimization
    if (profile.performance.averageTokensPerSecond < 10) {
      recommendations.push({
        category: 'performance',
        priority: 'medium',
        title: 'Low Inference Speed',
        description: `Model generates only ${profile.performance.averageTokensPerSecond.toFixed(1)} tokens/sec`,
        implementation:
          'Optimize context size or switch to faster model variant',
        expectedImprovement: '2-3x speed improvement possible',
      });
    }

    // Context optimization
    if (
      profile.usage.optimalContextSize <
      profile.modelConfig.contextSize * 0.5
    ) {
      recommendations.push({
        category: 'configuration',
        priority: 'low',
        title: 'Underutilized Context Window',
        description: `Using only ${Math.round((profile.usage.optimalContextSize / profile.modelConfig.contextSize) * 100)}% of available context`,
        implementation:
          'Increase context usage or switch to smaller context model',
        expectedImprovement: 'Reduced memory usage and faster inference',
      });
    }

    // Quality optimization
    if (profile.quality.errorRate > 0.05) {
      // > 5% error rate
      recommendations.push({
        category: 'model',
        priority: 'high',
        title: 'High Error Rate Detected',
        description: `Model fails ${(profile.quality.errorRate * 100).toFixed(1)}% of the time`,
        implementation:
          'Adjust temperature settings or switch to more stable model',
        expectedImprovement: 'Improved reliability and user experience',
      });
    }

    return recommendations.sort((a, b) => {
      const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }

  /**
   * Save profiles to disk
   */
  async saveProfiles(): Promise<void> {
    try {
      for (const [modelName, profile] of this.profiles) {
        const profilePath = path.join(this.profilesDir, `${modelName}.json`);
        await fs.writeFile(profilePath, JSON.stringify(profile, null, 2));
      }
    } catch (error) {
      console.warn('Failed to save model profiles:', error);
    }
  }

  /**
   * Export performance report
   */
  async exportPerformanceReport(
    format: 'json' | 'csv' | 'text' = 'json',
  ): Promise<string> {
    const report = {
      generatedAt: new Date(),
      systemInfo: this.performanceMonitor.getSystemMetrics(),
      models: Array.from(this.profiles.values()),
      regressions: await this.detectPerformanceRegressions(),
      workloadPatterns: Array.from(this.workloadPatterns.values()),
    };

    switch (format) {
      case 'json':
        return JSON.stringify(report, null, 2);
      case 'csv':
        return this.convertToCSV(report);
      case 'text':
        return this.formatAsText(report);
      default:
        return JSON.stringify(report, null, 2);
    }
  }

  // Private helper methods

  private async createInitialProfile(
    modelName: string,
    modelConfig: TrustModelConfig,
  ): Promise<ModelProfile> {
    return {
      modelName,
      modelConfig,
      performance: {
        averageTokensPerSecond: 0,
        peakTokensPerSecond: 0,
        averageLatency: 0,
        throughputEfficiency: 0,
        memoryEfficiency: 0,
        contextUtilization: 0,
      },
      resources: {
        baseMemoryMB: 0,
        memoryPerToken: 0,
        cpuUtilization: 0,
        powerEfficiency: 0,
      },
      quality: {
        consistencyScore: 0,
        errorRate: 0,
        contextAdherence: 0,
        creativityIndex: 0,
      },
      usage: {
        optimalContextSize: 0,
        optimalTemperature: 0.7,
        optimalBatchSize: 1,
        bestUseCases: [],
        worstUseCases: [],
      },
      history: {
        totalInferences: 0,
        firstSeen: new Date(),
        lastUsed: new Date(),
        performanceTrend: 'stable',
        averageSessionLength: 0,
      },
      recommendations: [],
    };
  }

  private async updateModelProfile(
    profile: ModelProfile,
    metrics: InferenceMetrics,
    systemMetrics: SystemMetrics,
    _options?: GenerationOptions,
  ): Promise<void> {
    profile.history.totalInferences++;
    profile.history.lastUsed = new Date();

    // Update performance metrics (rolling average)
    const alpha = 0.1; // Smoothing factor
    profile.performance.averageTokensPerSecond =
      profile.performance.averageTokensPerSecond * (1 - alpha) +
      metrics.tokensPerSecond * alpha;

    profile.performance.peakTokensPerSecond = Math.max(
      profile.performance.peakTokensPerSecond,
      metrics.tokensPerSecond,
    );

    // Update resource usage
    profile.resources.cpuUtilization =
      profile.resources.cpuUtilization * (1 - alpha) +
      systemMetrics.cpuUsage * alpha;

    const currentMemoryMB = systemMetrics.nodeMemory.heapUsed / (1024 * 1024);
    profile.resources.baseMemoryMB =
      profile.resources.baseMemoryMB * (1 - alpha) + currentMemoryMB * alpha;

    // Update efficiency metrics
    profile.performance.throughputEfficiency =
      profile.performance.averageTokensPerSecond /
      (profile.resources.baseMemoryMB / 1024);

    // Generate updated recommendations
    profile.recommendations =
      await this.generateProfileRecommendations(profile);
  }

  private async generateProfileRecommendations(
    profile: ModelProfile,
  ): Promise<ModelProfileRecommendation[]> {
    const recommendations: ModelProfileRecommendation[] = [];

    // Performance recommendations
    if (profile.performance.averageTokensPerSecond < 5) {
      recommendations.push({
        type: 'performance',
        priority: 'high',
        title: 'Low Inference Speed',
        description: 'Model is generating tokens slowly',
        action: 'Consider reducing context size or using GPU acceleration',
        expectedImprovement: '2-5x speed increase',
        implementation: {
          setting: 'maxTokens',
          value: Math.min(2048, profile.modelConfig.contextSize * 0.5),
        },
      });
    }

    // Resource recommendations
    if (profile.resources.baseMemoryMB > 16000) {
      // > 16GB
      recommendations.push({
        type: 'resource',
        priority: 'medium',
        title: 'High Memory Usage',
        description: 'Model consumes significant system memory',
        action: 'Switch to quantized model variant',
        expectedImprovement: '50-70% memory reduction',
        implementation: {
          setting: 'quantization',
          value: 'Q4_K_M',
        },
      });
    }

    return recommendations;
  }

  private calculateWorkloadSuitability(
    profile: ModelProfile,
    workload: WorkloadPattern,
  ): number {
    let score = 50; // Base score

    // Speed factor
    const speedRequirement = workload.characteristics.interactionFrequency;
    if (
      speedRequirement > 0.8 &&
      profile.performance.averageTokensPerSecond > 20
    ) {
      score += 20;
    } else if (speedRequirement < 0.3) {
      score += 10; // Less demanding
    }

    // Quality factor
    if (
      workload.characteristics.taskComplexity === 'complex' &&
      profile.quality.contextAdherence > 0.8
    ) {
      score += 15;
    }

    // Resource efficiency
    if (profile.performance.throughputEfficiency > 10) {
      score += 10;
    }

    // Error rate penalty
    score -= profile.quality.errorRate * 100;

    return Math.max(0, Math.min(100, score));
  }

  private generateWorkloadReason(
    profile: ModelProfile,
    workload: WorkloadPattern,
    score: number,
  ): string {
    const reasons = [];

    if (score > 80) {
      reasons.push('Excellent performance match');
    } else if (score > 60) {
      reasons.push('Good suitability');
    }

    if (profile.performance.averageTokensPerSecond > 15) {
      reasons.push('fast inference speed');
    }

    if (profile.quality.errorRate < 0.02) {
      reasons.push('high reliability');
    }

    if (profile.performance.throughputEfficiency > 8) {
      reasons.push('efficient resource usage');
    }

    return reasons.join(', ');
  }

  private generateWorkloadWarnings(
    profile: ModelProfile,
    workload: WorkloadPattern,
  ): string[] {
    const warnings = [];

    if (profile.quality.errorRate > 0.05) {
      warnings.push('Model has elevated error rate');
    }

    if (profile.resources.baseMemoryMB > 12000) {
      warnings.push('High memory requirements');
    }

    if (
      workload.characteristics.taskComplexity === 'complex' &&
      profile.quality.contextAdherence < 0.7
    ) {
      warnings.push('May struggle with complex instructions');
    }

    return warnings;
  }

  private calculateAverageSpeed(metrics: InferenceMetrics[]): number {
    if (metrics.length === 0) return 0;
    return (
      metrics.reduce((sum, m) => sum + m.tokensPerSecond, 0) / metrics.length
    );
  }

  private identifyRegressionCauses(
    profile: ModelProfile,
    degradation: number,
  ): string[] {
    const causes = [];

    if (degradation > 30) {
      causes.push('Possible system resource contention');
      causes.push('Model file corruption');
    }

    if (profile.resources.cpuUtilization > 80) {
      causes.push('High CPU usage affecting performance');
    }

    if (profile.resources.baseMemoryMB > 12000) {
      causes.push('Memory pressure causing swapping');
    }

    causes.push('Background processes interfering');
    causes.push('Thermal throttling');

    return causes;
  }

  private async loadExistingProfiles(): Promise<void> {
    try {
      const files = await fs.readdir(this.profilesDir);

      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const profilePath = path.join(this.profilesDir, file);
            const content = await fs.readFile(profilePath, 'utf-8');
            const profile = JSON.parse(content);
            const modelName = file.replace('.json', '');
            this.profiles.set(modelName, profile);
          } catch (error) {
            console.warn(`Failed to load profile ${file}:`, error);
          }
        }
      }
    } catch (_error) {
      // Directory doesn't exist yet, will be created
    }
  }

  private async initializeWorkloadPatterns(): Promise<void> {
    // Define common workload patterns
    const patterns: WorkloadPattern[] = [
      {
        id: 'chat',
        name: 'Interactive Chat',
        characteristics: {
          averagePromptLength: 100,
          averageResponseLength: 200,
          contextUsage: 0.3,
          interactionFrequency: 0.8,
          taskComplexity: 'moderate',
          creativity: 'balanced',
        },
        optimalModels: [],
        optimalSettings: { temperature: 0.7, maxTokens: 512 },
      },
      {
        id: 'coding',
        name: 'Code Generation',
        characteristics: {
          averagePromptLength: 300,
          averageResponseLength: 400,
          contextUsage: 0.7,
          interactionFrequency: 0.5,
          taskComplexity: 'complex',
          creativity: 'factual',
        },
        optimalModels: [],
        optimalSettings: { temperature: 0.2, maxTokens: 1024 },
      },
      {
        id: 'analysis',
        name: 'Document Analysis',
        characteristics: {
          averagePromptLength: 2000,
          averageResponseLength: 800,
          contextUsage: 0.9,
          interactionFrequency: 0.2,
          taskComplexity: 'complex',
          creativity: 'factual',
        },
        optimalModels: [],
        optimalSettings: { temperature: 0.3, maxTokens: 1024 },
      },
    ];

    for (const pattern of patterns) {
      this.workloadPatterns.set(pattern.id, pattern);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private convertToCSV(report: any): string {
    // Simple CSV conversion for model profiles
    const headers = [
      'Model',
      'Avg Speed (t/s)',
      'Memory (MB)',
      'CPU %',
      'Error Rate',
      'Efficiency',
    ];
    const rows = [headers.join(',')];

    for (const profile of report.models) {
      const row = [
        profile.modelName,
        profile.performance.averageTokensPerSecond.toFixed(2),
        profile.resources.baseMemoryMB.toFixed(0),
        profile.resources.cpuUtilization.toFixed(1),
        (profile.quality.errorRate * 100).toFixed(2),
        profile.performance.throughputEfficiency.toFixed(2),
      ];
      rows.push(row.join(','));
    }

    return rows.join('\n');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private formatAsText(report: any): string {
    let text = `Model Performance Report\n`;
    text += `Generated: ${report.generatedAt}\n\n`;

    text += `System Info:\n`;
    text += `- Platform: ${report.systemInfo.platform}\n`;
    text += `- Memory: ${(report.systemInfo.memoryUsage.total / 1024 / 1024 / 1024).toFixed(1)}GB\n`;
    text += `- CPU Cores: ${report.systemInfo.loadAverage.length}\n\n`;

    text += `Model Profiles:\n`;
    for (const profile of report.models) {
      text += `\n${profile.modelName}:\n`;
      text += `  Speed: ${profile.performance.averageTokensPerSecond.toFixed(2)} tokens/sec\n`;
      text += `  Memory: ${(profile.resources.baseMemoryMB / 1024).toFixed(1)}GB\n`;
      text += `  Efficiency: ${profile.performance.throughputEfficiency.toFixed(2)}\n`;
      text += `  Error Rate: ${(profile.quality.errorRate * 100).toFixed(2)}%\n`;
    }

    return text;
  }
}
