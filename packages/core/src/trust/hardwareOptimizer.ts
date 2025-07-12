/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { PerformanceMonitor } from './performanceMonitor.js';
import { TrustModelConfig } from './types.js';
import * as os from 'os';

export interface HardwareCapabilities {
  totalRAMGB: number;
  availableRAMGB: number;
  cpuCores: number;
  cpuSpeed: number; // MHz
  platform: string;
  architecture: string;
  recommendedConcurrency: number;
}

export interface ModelRecommendation {
  model: TrustModelConfig;
  suitabilityScore: number; // 0-100
  reason: string;
  performanceEstimate: {
    tokensPerSecond: number;
    ramUsageGB: number;
    cpuUtilization: number;
  };
  warnings: string[];
}

export interface OptimizationRecommendation {
  category: 'model' | 'performance' | 'resource' | 'configuration';
  priority: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  implementation: string;
  expectedImprovement: string;
}

export class HardwareOptimizer {
  private performanceMonitor: PerformanceMonitor;
  private systemCapabilities: HardwareCapabilities;

  constructor(performanceMonitor: PerformanceMonitor) {
    this.performanceMonitor = performanceMonitor;
    this.systemCapabilities = this.detectHardwareCapabilities();
  }

  private detectHardwareCapabilities(): HardwareCapabilities {
    const metrics = this.performanceMonitor.getSystemMetrics();
    const cpus = os.cpus();

    const totalRAMGB = metrics.memoryUsage.total / (1024 * 1024 * 1024);
    const availableRAMGB = metrics.memoryUsage.available / (1024 * 1024 * 1024);

    // Determine recommended concurrency based on CPU cores and memory
    let recommendedConcurrency = Math.min(
      cpus.length,
      Math.floor(availableRAMGB / 2),
    );
    recommendedConcurrency = Math.max(1, Math.min(recommendedConcurrency, 4)); // Cap at 4

    return {
      totalRAMGB,
      availableRAMGB,
      cpuCores: cpus.length,
      cpuSpeed: cpus[0]?.speed || 0,
      platform: os.platform(),
      architecture: os.arch(),
      recommendedConcurrency,
    };
  }

  /**
   * Analyze available models and recommend the best ones for current hardware
   */
  analyzeModelSuitability(models: TrustModelConfig[]): ModelRecommendation[] {
    const recommendations: ModelRecommendation[] = [];

    for (const model of models) {
      const ramRequiredGB = this.parseRAMRequirement(model.ramRequirement);
      const suitabilityScore = this.calculateSuitabilityScore(
        model,
        ramRequiredGB,
      );
      const performanceEstimate = this.estimatePerformance(
        model,
        ramRequiredGB,
      );
      const warnings = this.generateWarnings(model, ramRequiredGB);

      recommendations.push({
        model,
        suitabilityScore,
        reason: this.generateRecommendationReason(
          model,
          ramRequiredGB,
          suitabilityScore,
        ),
        performanceEstimate,
        warnings,
      });
    }

    // Sort by suitability score (highest first)
    return recommendations.sort(
      (a, b) => b.suitabilityScore - a.suitabilityScore,
    );
  }

  /**
   * Generate specific optimization recommendations based on current hardware
   */
  generateOptimizationRecommendations(): OptimizationRecommendation[] {
    const recommendations: OptimizationRecommendation[] = [];
    const { totalRAMGB, availableRAMGB, cpuCores, platform } =
      this.systemCapabilities;

    // Memory optimizations
    if (availableRAMGB < 4) {
      recommendations.push({
        category: 'resource',
        priority: 'high',
        title: 'Low Available Memory Detected',
        description: `Only ${availableRAMGB.toFixed(1)}GB RAM available. Consider closing unused applications.`,
        implementation:
          'Close browser tabs, IDE instances, and other memory-intensive applications',
        expectedImprovement: 'Faster model loading and reduced swap usage',
      });
    }

    if (totalRAMGB >= 16 && availableRAMGB < totalRAMGB * 0.3) {
      recommendations.push({
        category: 'resource',
        priority: 'medium',
        title: 'Memory Fragmentation Detected',
        description: 'High memory usage detected despite sufficient total RAM',
        implementation:
          'Restart applications or system to free fragmented memory',
        expectedImprovement: 'Better memory allocation for large models',
      });
    }

    // CPU optimizations
    if (cpuCores <= 4) {
      recommendations.push({
        category: 'performance',
        priority: 'medium',
        title: 'Limited CPU Cores',
        description: `${cpuCores} CPU cores detected. Consider optimizing threading settings.`,
        implementation:
          'Set threading to match core count, avoid concurrent inference',
        expectedImprovement: '10-20% performance improvement',
      });
    }

    // Model selection recommendations
    if (availableRAMGB >= 8) {
      recommendations.push({
        category: 'model',
        priority: 'low',
        title: 'Consider Higher Quality Models',
        description:
          'Your system can handle Q8_0 or FP16 quantization for better quality',
        implementation: 'Download Q8_0 variants of your preferred models',
        expectedImprovement:
          'Better response quality with minimal speed impact',
      });
    }

    // Platform-specific optimizations
    if (platform === 'darwin') {
      recommendations.push({
        category: 'configuration',
        priority: 'medium',
        title: 'macOS Metal Acceleration',
        description: 'Enable Metal GPU acceleration for faster inference',
        implementation: 'Configure model to use Metal backend if available',
        expectedImprovement: '2-5x performance improvement on Apple Silicon',
      });
    }

    if (platform === 'linux' && availableRAMGB >= 16) {
      recommendations.push({
        category: 'configuration',
        priority: 'low',
        title: 'Linux Huge Pages',
        description: 'Enable huge pages for better memory performance',
        implementation:
          'Configure kernel huge pages: echo 1024 > /proc/sys/vm/nr_hugepages',
        expectedImprovement: '5-10% performance improvement for large models',
      });
    }

    return recommendations.sort((a, b) => {
      const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }

  /**
   * Get formatted hardware optimization report
   */
  generateOptimizationReport(): string {
    const capabilities = this.systemCapabilities;
    const recommendations = this.generateOptimizationRecommendations();

    let report = '\n🔧 Hardware Optimization Report\n';
    report += '═'.repeat(60) + '\n\n';

    // System capabilities
    report += '💻 System Capabilities:\n';
    report += `   Total RAM: ${capabilities.totalRAMGB.toFixed(1)}GB\n`;
    report += `   Available RAM: ${capabilities.availableRAMGB.toFixed(1)}GB\n`;
    report += `   CPU Cores: ${capabilities.cpuCores}\n`;
    report += `   CPU Speed: ${capabilities.cpuSpeed}MHz\n`;
    report += `   Platform: ${capabilities.platform} (${capabilities.architecture})\n`;
    report += `   Recommended Concurrency: ${capabilities.recommendedConcurrency}\n\n`;

    // Hardware classification
    const classification = this.classifyHardware();
    report += `🏷️  Hardware Classification: ${classification.category}\n`;
    report += `   Performance Tier: ${classification.tier}\n`;
    report += `   Optimal Model Size: ${classification.optimalModelSize}\n\n`;

    // Optimization recommendations
    if (recommendations.length > 0) {
      report += '⚡ Optimization Recommendations:\n\n';

      recommendations.forEach((rec, index) => {
        const priorityEmoji =
          rec.priority === 'high'
            ? '🔴'
            : rec.priority === 'medium'
              ? '🟡'
              : '🟢';
        report += `${index + 1}. ${priorityEmoji} ${rec.title}\n`;
        report += `   Category: ${rec.category}\n`;
        report += `   Description: ${rec.description}\n`;
        report += `   Implementation: ${rec.implementation}\n`;
        report += `   Expected Improvement: ${rec.expectedImprovement}\n\n`;
      });
    } else {
      report +=
        '✅ No optimization recommendations - your system is well configured!\n\n';
    }

    return report;
  }

  private parseRAMRequirement(ramReq: string): number {
    const match = ramReq.match(/(\d+(?:\.\d+)?)/);
    return match ? parseFloat(match[1]) : 4; // Default to 4GB if parsing fails
  }

  private calculateSuitabilityScore(
    model: TrustModelConfig,
    ramRequiredGB: number,
  ): number {
    let score = 100;

    // RAM availability check
    const ramRatio = ramRequiredGB / this.systemCapabilities.availableRAMGB;
    if (ramRatio > 1) {
      score -= 50; // Major penalty for insufficient RAM
    } else if (ramRatio > 0.8) {
      score -= 20; // Moderate penalty for tight RAM
    } else if (ramRatio > 0.6) {
      score -= 10; // Small penalty for high RAM usage
    }

    // CPU cores consideration
    const paramCount = this.parseParameterCount(model.parameters || '3B');
    if (paramCount > 7 && this.systemCapabilities.cpuCores < 4) {
      score -= 15; // Penalty for large models on few cores
    }

    // Quantization optimization
    if (
      this.systemCapabilities.availableRAMGB >= 8 &&
      model.quantization === 'Q4_K_M'
    ) {
      score -= 5; // Minor penalty for not using better quantization when possible
    }

    return Math.max(0, score);
  }

  private estimatePerformance(
    model: TrustModelConfig,
    ramRequiredGB: number,
  ): {
    tokensPerSecond: number;
    ramUsageGB: number;
    cpuUtilization: number;
  } {
    const paramCount = this.parseParameterCount(model.parameters || '3B');
    const baseSpeed = this.systemCapabilities.cpuCores * 0.5; // Base tokens/sec per core

    // Scale by model size (larger models are slower)
    let tokensPerSecond = baseSpeed * (8 / Math.max(paramCount, 1));

    // Adjust for quantization
    if (model.quantization === 'Q4_K_M') tokensPerSecond *= 1.2;
    if (model.quantization === 'Q8_0') tokensPerSecond *= 0.9;
    if (model.quantization === 'FP16') tokensPerSecond *= 0.7;

    // Adjust for memory pressure
    const memoryPressure =
      ramRequiredGB / this.systemCapabilities.availableRAMGB;
    if (memoryPressure > 0.8) tokensPerSecond *= 0.7;

    const cpuUtilization = Math.min(
      100,
      (paramCount / this.systemCapabilities.cpuCores) * 20,
    );

    return {
      tokensPerSecond: Math.round(tokensPerSecond * 10) / 10,
      ramUsageGB: ramRequiredGB,
      cpuUtilization: Math.round(cpuUtilization),
    };
  }

  private generateWarnings(
    model: TrustModelConfig,
    ramRequiredGB: number,
  ): string[] {
    const warnings: string[] = [];

    if (ramRequiredGB > this.systemCapabilities.availableRAMGB) {
      warnings.push(
        'Insufficient RAM - model may fail to load or cause system slowdown',
      );
    }

    if (ramRequiredGB > this.systemCapabilities.availableRAMGB * 0.8) {
      warnings.push('High memory usage - may impact system responsiveness');
    }

    const paramCount = this.parseParameterCount(model.parameters || '3B');
    if (paramCount > 7 && this.systemCapabilities.cpuCores < 4) {
      warnings.push(
        'Large model on limited CPU cores - expect slower performance',
      );
    }

    return warnings;
  }

  private generateRecommendationReason(
    model: TrustModelConfig,
    ramRequiredGB: number,
    score: number,
  ): string {
    if (score >= 90) {
      return 'Excellent match - optimal performance expected';
    } else if (score >= 75) {
      return 'Good match - solid performance with available resources';
    } else if (score >= 60) {
      return 'Adequate match - acceptable performance with some limitations';
    } else if (score >= 40) {
      return 'Challenging - may work but with reduced performance';
    } else {
      return 'Not recommended - insufficient resources for optimal operation';
    }
  }

  private parseParameterCount(params: string): number {
    const match = params.match(/(\d+(?:\.\d+)?)/);
    return match ? parseFloat(match[1]) : 3; // Default to 3B if parsing fails
  }

  private classifyHardware(): {
    category: string;
    tier: string;
    optimalModelSize: string;
  } {
    const { totalRAMGB, cpuCores } = this.systemCapabilities;

    if (totalRAMGB >= 32 && cpuCores >= 8) {
      return {
        category: 'High-end Workstation',
        tier: 'Premium',
        optimalModelSize: '7B+ parameters with Q8_0/FP16',
      };
    } else if (totalRAMGB >= 16 && cpuCores >= 4) {
      return {
        category: 'Performance Desktop',
        tier: 'High',
        optimalModelSize: '3-7B parameters with Q4_K_M/Q8_0',
      };
    } else if (totalRAMGB >= 8 && cpuCores >= 2) {
      return {
        category: 'Standard Desktop',
        tier: 'Medium',
        optimalModelSize: '1.5-3B parameters with Q4_K_M',
      };
    } else {
      return {
        category: 'Budget/Mobile',
        tier: 'Basic',
        optimalModelSize: '1.5B parameters with Q4_K_M',
      };
    }
  }

  getSystemCapabilities(): HardwareCapabilities {
    return { ...this.systemCapabilities };
  }
}
