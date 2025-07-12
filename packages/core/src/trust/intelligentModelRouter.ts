/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  UnifiedModelManager,
  UnifiedModel,
  TaskType,
  HardwareConstraints,
} from './unifiedModelManager.js';
import { TrustConfiguration } from '../config/trustConfig.js';
import { OllamaClient } from './ollamaClient.js';
import { TrustModelManagerImpl } from './modelManager.js';

/**
 * Routing decision with full transparency
 */
export interface ModelRoutingDecision {
  selectedModel: UnifiedModel;
  reasoning: string;
  alternatives: UnifiedModel[];
  step1_consolidation: {
    totalModels: number;
    backendCounts: Record<string, number>;
    duration: number;
  };
  step2_filtering: {
    taskFiltered: number;
    hardwareFiltered: number;
    availabilityFiltered: number;
    remaining: number;
    duration: number;
  };
  step3_selection: {
    scoringMethod: string;
    topCandidates: Array<{
      model: UnifiedModel;
      score: number;
      breakdown: Record<string, number>;
    }>;
    duration: number;
  };
  step4_routing: {
    targetBackend: string;
    routingMethod: string;
    duration: number;
  };
  totalDuration: number;
}

/**
 * Routing configuration options
 */
export interface RoutingConfig {
  task?: TaskType;
  hardwareConstraints?: HardwareConstraints;
  preferredBackends?: Array<'ollama' | 'huggingface' | 'cloud'>;
  minimumTrustScore?: number;
  allowFallback?: boolean;
  maxCandidates?: number;
}

/**
 * Hardware detection results
 */
export interface SystemResources {
  availableRAM: number; // GB
  totalRAM: number; // GB
  cpuCores: number;
  gpuMemory?: number; // GB
  diskSpace: number; // GB
  platform: string;
}

/**
 * Intelligent Model Router implementing the 4-step UX Philosophy routing process
 */
export class IntelligentModelRouter {
  private unifiedManager: UnifiedModelManager;
  private trustConfig: TrustConfiguration;
  private ollamaClient: OllamaClient;
  private modelManager: TrustModelManagerImpl;

  constructor(trustConfig?: TrustConfiguration) {
    this.trustConfig = trustConfig || new TrustConfiguration();
    this.unifiedManager = new UnifiedModelManager(this.trustConfig);
    this.ollamaClient = new OllamaClient();
    this.modelManager = new TrustModelManagerImpl();
  }

  /**
   * Initialize the intelligent router
   */
  async initialize(): Promise<void> {
    await this.trustConfig.initialize();
    await this.unifiedManager.initialize();
    await this.modelManager.initialize();
  }

  /**
   * Perform the complete 4-step intelligent routing process
   */
  async routeToOptimalModel(
    config: RoutingConfig = {},
  ): Promise<ModelRoutingDecision> {
    const startTime = Date.now();

    // Step 1: Consolidate - Build master list from all backends
    const step1Start = Date.now();
    const allModels = await this.unifiedManager.discoverAllModels();
    const backendCounts = this.calculateBackendCounts(allModels);
    const step1Duration = Date.now() - step1Start;

    // Step 2: Filter - Apply task and hardware constraints
    const step2Start = Date.now();
    const filterResults = await this.applyFiltering(allModels, config);
    const step2Duration = Date.now() - step2Start;

    // Step 3: Select - Choose best model based on scoring
    const step3Start = Date.now();
    const selectionResults = await this.performSelection(
      filterResults.filtered,
      config,
    );
    const step3Duration = Date.now() - step3Start;

    // Step 4: Route - Determine routing to target backend
    const step4Start = Date.now();
    const routingResults = await this.performRouting(
      selectionResults.selected,
    );
    const step4Duration = Date.now() - step4Start;

    const totalDuration = Date.now() - startTime;

    return {
      selectedModel: selectionResults.selected,
      reasoning: this.generateReasoning(
        selectionResults.selected,
        config,
        filterResults,
      ),
      alternatives: selectionResults.topCandidates
        .slice(1, 4)
        .map((c) => c.model),
      step1_consolidation: {
        totalModels: allModels.length,
        backendCounts,
        duration: step1Duration,
      },
      step2_filtering: {
        taskFiltered: filterResults.taskFiltered,
        hardwareFiltered: filterResults.hardwareFiltered,
        availabilityFiltered: filterResults.availabilityFiltered,
        remaining: filterResults.filtered.length,
        duration: step2Duration,
      },
      step3_selection: {
        scoringMethod: selectionResults.scoringMethod,
        topCandidates: selectionResults.topCandidates,
        duration: step3Duration,
      },
      step4_routing: {
        targetBackend: routingResults.targetBackend,
        routingMethod: routingResults.method,
        duration: step4Duration,
      },
      totalDuration,
    };
  }

  /**
   * Detect current system hardware constraints
   */
  async detectSystemResources(): Promise<SystemResources> {
    const os = await import('os');

    return {
      availableRAM: Math.floor(os.freemem() / 1024 / 1024 / 1024), // GB
      totalRAM: Math.floor(os.totalmem() / 1024 / 1024 / 1024), // GB
      cpuCores: os.cpus().length,
      diskSpace: await this.estimateDiskSpace(),
      platform: os.platform(),
    };
  }

  /**
   * Get routing recommendation based on current system and task
   */
  async getRoutingRecommendation(task?: TaskType): Promise<{
    recommended: RoutingConfig;
    reasoning: string;
    systemInfo: SystemResources;
  }> {
    const systemInfo = await this.detectSystemResources();

    const recommended: RoutingConfig = {
      task,
      hardwareConstraints: {
        availableRAM: Math.floor(systemInfo.availableRAM * 0.7), // Leave 30% buffer
        preferredSize: this.getPreferredSizeForRAM(systemInfo.availableRAM),
      },
      preferredBackends: this.getPreferredBackendsForSystem(systemInfo),
      minimumTrustScore: 7.0,
      allowFallback: true,
      maxCandidates: 5,
    };

    const reasoning = this.generateSystemReasoning(systemInfo, recommended);

    return {
      recommended,
      reasoning,
      systemInfo,
    };
  }

  /**
   * Step 2: Apply filtering based on task and hardware constraints
   */
  private async applyFiltering(
    models: UnifiedModel[],
    config: RoutingConfig,
  ): Promise<{
    filtered: UnifiedModel[];
    taskFiltered: number;
    hardwareFiltered: number;
    availabilityFiltered: number;
  }> {
    let working = [...models];
    let taskFiltered = 0;
    let hardwareFiltered = 0;
    let availabilityFiltered = 0;

    // Filter by availability first
    const availableModels = working.filter((m) => m.available);
    availabilityFiltered = working.length - availableModels.length;
    working = availableModels;

    // Apply task filtering if specified
    if (config.task && config.task !== 'general') {
      const taskSuitable = working.filter((model) => {
        const suitability = model.taskSuitability?.[config.task!] || 0;
        return suitability >= 6; // Minimum task suitability threshold
      });
      taskFiltered = working.length - taskSuitable.length;
      working = taskSuitable;
    }

    // Apply hardware constraints if specified
    if (config.hardwareConstraints) {
      const hardwareSuitable = this.unifiedManager.filterModels(
        working,
        undefined,
        config.hardwareConstraints,
      );
      hardwareFiltered = working.length - hardwareSuitable.length;
      working = hardwareSuitable;
    }

    // Apply trust score filtering
    if (config.minimumTrustScore) {
      working = working.filter(
        (m) => (m.trustScore || 0) >= config.minimumTrustScore!,
      );
    }

    // Apply backend preferences
    if (config.preferredBackends && config.preferredBackends.length > 0) {
      const preferred = working.filter((m) =>
        config.preferredBackends!.includes(m.backend),
      );
      if (preferred.length > 0) {
        working = preferred;
      }
    }

    return {
      filtered: working,
      taskFiltered,
      hardwareFiltered,
      availabilityFiltered,
    };
  }

  /**
   * Step 3: Perform model selection with advanced scoring
   */
  private async performSelection(
    candidates: UnifiedModel[],
    config: RoutingConfig,
  ): Promise<{
    selected: UnifiedModel;
    topCandidates: Array<{
      model: UnifiedModel;
      score: number;
      breakdown: Record<string, number>;
    }>;
    scoringMethod: string;
  }> {
    if (candidates.length === 0) {
      throw new Error('No suitable models found after filtering');
    }

    if (candidates.length === 1) {
      return {
        selected: candidates[0],
        topCandidates: [
          {
            model: candidates[0],
            score: this.calculateModelScore(candidates[0], config).total,
            breakdown: this.calculateModelScore(candidates[0], config)
              .breakdown,
          },
        ],
        scoringMethod: 'single_candidate',
      };
    }

    // Score all candidates
    const scored = candidates.map((model) => {
      const scoring = this.calculateModelScore(model, config);
      return {
        model,
        score: scoring.total,
        breakdown: scoring.breakdown,
      };
    });

    // Sort by score (descending)
    scored.sort((a, b) => b.score - a.score);

    // Limit to max candidates if specified
    const maxCandidates = config.maxCandidates || 10;
    const topCandidates = scored.slice(0, maxCandidates);

    return {
      selected: topCandidates[0].model,
      topCandidates,
      scoringMethod: 'weighted_multi_factor',
    };
  }

  /**
   * Step 4: Perform routing to target backend
   */
  private async performRouting(selectedModel: UnifiedModel): Promise<{
    targetBackend: string;
    method: string;
  }> {
    // The routing is straightforward since the model already specifies its backend
    // In a more advanced implementation, this could handle:
    // - Backend health checking
    // - Load balancing across multiple instances
    // - Automatic failover

    return {
      targetBackend: selectedModel.backend,
      method: 'direct_backend_routing',
    };
  }

  /**
   * Calculate comprehensive model score
   */
  private calculateModelScore(
    model: UnifiedModel,
    config: RoutingConfig,
  ): {
    total: number;
    breakdown: Record<string, number>;
  } {
    const breakdown: Record<string, number> = {};

    // Base trust score (40% weight)
    const trustScore = (model.trustScore || 5) / 10;
    breakdown.trust = trustScore * 0.4;

    // Task suitability score (30% weight)
    let taskScore = 0.7; // Default general suitability
    if (config.task && model.taskSuitability?.[config.task]) {
      taskScore = model.taskSuitability[config.task] / 10;
    }
    breakdown.task_suitability = taskScore * 0.3;

    // Performance score based on parameters (15% weight)
    const performanceScore = this.calculatePerformanceScore(model);
    breakdown.performance = performanceScore * 0.15;

    // Availability and backend preference (10% weight)
    let availabilityScore = model.available ? 1.0 : 0.0;
    if (config.preferredBackends?.includes(model.backend)) {
      availabilityScore *= 1.2; // Boost for preferred backends
    }
    breakdown.availability = Math.min(availabilityScore, 1.0) * 0.1;

    // Resource efficiency (5% weight)
    const efficiencyScore = this.calculateEfficiencyScore(
      model,
      config.hardwareConstraints,
    );
    breakdown.efficiency = efficiencyScore * 0.05;

    const total = Object.values(breakdown).reduce(
      (sum, score) => sum + score,
      0,
    );

    return { total, breakdown };
  }

  /**
   * Calculate performance score based on model parameters
   */
  private calculatePerformanceScore(model: UnifiedModel): number {
    if (!model.parameters) return 0.5;

    const params = this.parseParameters(model.parameters);

    // Score based on parameter count (more parameters generally = better quality)
    if (params >= 70) return 1.0; // 70B+ models
    if (params >= 30) return 0.9; // 30-70B models
    if (params >= 13) return 0.8; // 13-30B models
    if (params >= 7) return 0.7; // 7-13B models
    if (params >= 3) return 0.6; // 3-7B models
    if (params >= 1) return 0.5; // 1-3B models
    return 0.3; // <1B models
  }

  /**
   * Calculate efficiency score based on resource usage
   */
  private calculateEfficiencyScore(
    model: UnifiedModel,
    constraints?: HardwareConstraints,
  ): number {
    if (!constraints?.availableRAM || !model.ramRequirement) return 0.5;

    const modelRAM = this.parseRAMRequirement(model.ramRequirement);
    const availableRAM = constraints.availableRAM;

    // Score based on how efficiently the model uses available RAM
    const ratio = modelRAM / availableRAM;

    if (ratio <= 0.3) return 1.0; // Very efficient
    if (ratio <= 0.5) return 0.8; // Efficient
    if (ratio <= 0.7) return 0.6; // Moderate
    if (ratio <= 0.9) return 0.4; // Less efficient
    return 0.2; // Inefficient
  }

  /**
   * Generate human-readable reasoning for the selection
   */
  private generateReasoning(
    selectedModel: UnifiedModel,
    config: RoutingConfig,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    filterResults: any,
  ): string {
    const reasons = [];

    if (config.task) {
      const taskScore = selectedModel.taskSuitability?.[config.task] || 0;
      reasons.push(
        `Optimized for ${config.task} tasks (score: ${taskScore}/10)`,
      );
    }

    reasons.push(`High trust score (${selectedModel.trustScore}/10)`);

    if (config.hardwareConstraints?.availableRAM) {
      reasons.push(
        `Fits within ${config.hardwareConstraints.availableRAM}GB RAM constraint`,
      );
    }

    if (filterResults.filtered.length > 1) {
      reasons.push(
        `Selected from ${filterResults.filtered.length} suitable candidates`,
      );
    }

    reasons.push(`Available on ${selectedModel.backend} backend`);

    return reasons.join(', ');
  }

  /**
   * Generate system-specific recommendations
   */
  private generateSystemReasoning(
    systemInfo: SystemResources,
    config: RoutingConfig,
  ): string {
    const reasons = [];

    reasons.push(`System has ${systemInfo.availableRAM}GB available RAM`);

    if (config.hardwareConstraints?.preferredSize) {
      reasons.push(
        `Recommending ${config.hardwareConstraints.preferredSize} models for optimal performance`,
      );
    }

    if (config.preferredBackends) {
      reasons.push(
        `Prioritizing ${config.preferredBackends.join(', ')} backends`,
      );
    }

    return reasons.join('. ');
  }

  // Helper methods

  private calculateBackendCounts(
    models: UnifiedModel[],
  ): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const model of models) {
      counts[model.backend] = (counts[model.backend] || 0) + 1;
    }
    return counts;
  }

  private parseParameters(params: string): number {
    const match = params.match(/(\d+(?:\.\d+)?)/);
    if (!match) return 0;
    const num = parseFloat(match[1]);
    if (params.includes('B')) return num;
    if (params.includes('M')) return num / 1000;
    return num;
  }

  private parseRAMRequirement(ram: string): number {
    const match = ram.match(/(\d+(?:\.\d+)?)/);
    if (!match) return 8; // Default assumption
    return parseFloat(match[1]);
  }

  private async estimateDiskSpace(): Promise<number> {
    // Simplified disk space estimation
    // In a real implementation, this would check actual disk space
    return 100; // GB
  }

  private getPreferredSizeForRAM(
    availableRAM: number,
  ): 'small' | 'medium' | 'large' {
    if (availableRAM >= 16) return 'large';
    if (availableRAM >= 8) return 'medium';
    return 'small';
  }

  private getPreferredBackendsForSystem(
    systemInfo: SystemResources,
  ): Array<'ollama' | 'huggingface' | 'cloud'> {
    const backends: Array<'ollama' | 'huggingface' | 'cloud'> = [];

    // Prefer Ollama for systems with sufficient RAM
    if (systemInfo.availableRAM >= 4) {
      backends.push('ollama');
    }

    // Always include HuggingFace as it's local
    backends.push('huggingface');

    // Include cloud for low-resource systems
    if (systemInfo.availableRAM < 8) {
      backends.push('cloud');
    }

    return backends;
  }
}
