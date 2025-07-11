/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { IntelligentModelRouter, ModelRoutingDecision, RoutingConfig } from './intelligentModelRouter.js';
import { UnifiedModelManager, UnifiedModel, TaskType } from './unifiedModelManager.js';
import { TrustConfiguration } from '../config/trustConfig.js';

/**
 * Smart routing recommendation with transparency
 */
export interface SmartRoutingRecommendation {
  primary: UnifiedModel;
  alternatives: UnifiedModel[];
  reasoning: string;
  systemAnalysis: {
    availableRAM: number;
    recommendedRAM: number;
    recommendedTask?: TaskType;
  };
  confidence: number;
  fallbackStrategy: string;
}

/**
 * Default model selection result
 */
export interface DefaultModelSelection {
  selectedModel: UnifiedModel;
  reason: 'cached' | 'intelligent_routing' | 'fallback' | 'system_default';
  alternatives: UnifiedModel[];
  reasoning: string;
  confidence: number;
}

/**
 * Smart Routing Service implementing Phase 3 of CLI UX Philosophy
 * Provides intelligent defaults with full transparency
 */
export class SmartRoutingService {
  private router: IntelligentModelRouter;
  private unifiedManager: UnifiedModelManager;
  private trustConfig: TrustConfiguration;
  private lastRoutingDecision?: ModelRoutingDecision;

  constructor(trustConfig?: TrustConfiguration) {
    this.trustConfig = trustConfig || new TrustConfiguration();
    this.router = new IntelligentModelRouter(this.trustConfig);
    this.unifiedManager = new UnifiedModelManager(this.trustConfig);
  }

  /**
   * Initialize the smart routing service
   */
  async initialize(): Promise<void> {
    await this.trustConfig.initialize();
    await this.router.initialize();
    await this.unifiedManager.initialize();
  }

  /**
   * Get smart default model selection with transparency
   */
  async getSmartDefault(context?: {
    task?: TaskType;
    preferredBackends?: Array<'ollama' | 'huggingface' | 'cloud'>;
    urgency?: 'low' | 'medium' | 'high';
  }): Promise<DefaultModelSelection> {
    // Step 1: Check for cached intelligent decision
    if (this.lastRoutingDecision && this.isDecisionStillValid(this.lastRoutingDecision)) {
      return {
        selectedModel: this.lastRoutingDecision.selectedModel,
        reason: 'cached',
        alternatives: this.lastRoutingDecision.alternatives,
        reasoning: `Using cached intelligent routing decision: ${this.lastRoutingDecision.reasoning}`,
        confidence: 0.9,
      };
    }

    // Step 2: Perform intelligent routing
    try {
      const routingConfig: RoutingConfig = {
        task: context?.task,
        preferredBackends: context?.preferredBackends,
        allowFallback: true,
        maxCandidates: 5,
      };

      // Add urgency-based constraints
      if (context?.urgency === 'high') {
        const systemResources = await this.router.detectSystemResources();
        routingConfig.hardwareConstraints = {
          availableRAM: Math.min(systemResources.availableRAM * 0.5, 4), // Prefer smaller models for speed
        };
      }

      const decision = await this.router.routeToOptimalModel(routingConfig);
      this.lastRoutingDecision = decision;

      return {
        selectedModel: decision.selectedModel,
        reason: 'intelligent_routing',
        alternatives: decision.alternatives,
        reasoning: decision.reasoning,
        confidence: this.calculateConfidence(decision),
      };
    } catch (error) {
      // Step 3: Fallback to system default
      return await this.getFallbackDefault(error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Get comprehensive routing recommendation with full transparency
   */
  async getRoutingRecommendation(task?: TaskType): Promise<SmartRoutingRecommendation> {
    const systemInfo = await this.router.detectSystemResources();
    const routingRecommendation = await this.router.getRoutingRecommendation(task);

    // Perform routing to get actual results
    const decision = await this.router.routeToOptimalModel(routingRecommendation.recommended);

    return {
      primary: decision.selectedModel,
      alternatives: decision.alternatives,
      reasoning: this.buildComprehensiveReasoning(decision, routingRecommendation.reasoning),
      systemAnalysis: {
        availableRAM: systemInfo.availableRAM,
        recommendedRAM: routingRecommendation.recommended.hardwareConstraints?.availableRAM || systemInfo.availableRAM,
        recommendedTask: task,
      },
      confidence: this.calculateConfidence(decision),
      fallbackStrategy: this.buildFallbackStrategy(decision),
    };
  }

  /**
   * Display routing transparency information
   */
  async displayRoutingTransparency(decision: ModelRoutingDecision): Promise<void> {
    console.log('\n🔍 Routing Decision Transparency');
    console.log('═'.repeat(60));

    // Step-by-step breakdown
    console.log('📊 4-Step Routing Process:');
    console.log(`   1️⃣  Consolidation: Found ${decision.step1_consolidation.totalModels} models across backends`);
    console.log(`   2️⃣  Filtering: ${decision.step2_filtering.remaining} models passed criteria`);
    console.log(`   3️⃣  Selection: Evaluated ${decision.step3_selection.topCandidates.length} candidates`);
    console.log(`   4️⃣  Routing: Selected ${decision.selectedModel.backend} backend`);

    // Performance metrics
    console.log(`\n⏱️  Performance: Total ${decision.totalDuration}ms`);
    console.log(`   • Consolidation: ${decision.step1_consolidation.duration}ms`);
    console.log(`   • Filtering: ${decision.step2_filtering.duration}ms`);
    console.log(`   • Selection: ${decision.step3_selection.duration}ms`);
    console.log(`   • Routing: ${decision.step4_routing.duration}ms`);

    // Decision factors
    if (decision.step3_selection.topCandidates.length > 0) {
      const topCandidate = decision.step3_selection.topCandidates[0];
      console.log(`\n🎯 Selection Factors (Top Model):`);
      Object.entries(topCandidate.breakdown).forEach(([factor, score]) => {
        const percentage = (score * 100).toFixed(1);
        const bar = '█'.repeat(Math.floor(score * 20));
        console.log(`   ${factor.padEnd(18)}: ${percentage.padStart(5)}% ${bar}`);
      });
    }

    // Alternatives
    if (decision.alternatives.length > 0) {
      console.log(`\n🔄 Alternative Options:`);
      decision.alternatives.slice(0, 3).forEach((alt, i) => {
        console.log(`   ${i + 2}. ${alt.name} (${alt.backend}) - Trust: ${alt.trustScore}/10`);
      });
    }
  }

  /**
   * Get routing confidence score
   */
  getRoutingConfidence(decision?: ModelRoutingDecision): number {
    const targetDecision = decision || this.lastRoutingDecision;
    if (!targetDecision) return 0.5;
    return this.calculateConfidence(targetDecision);
  }

  /**
   * Check if we should use intelligent routing vs simple default
   */
  async shouldUseIntelligentRouting(context?: {
    userExplicitChoice?: boolean;
    systemLoad?: 'low' | 'medium' | 'high';
    complexity?: 'simple' | 'moderate' | 'complex';
  }): Promise<boolean> {
    // Always use intelligent routing if user explicitly requested it
    if (context?.userExplicitChoice) return true;

    // Skip intelligent routing for simple tasks under high load
    if (context?.systemLoad === 'high' && context?.complexity === 'simple') {
      return false;
    }

    // Use intelligent routing for moderate/complex tasks
    if (context?.complexity === 'moderate' || context?.complexity === 'complex') {
      return true;
    }

    // Default to intelligent routing
    return true;
  }

  // Private helper methods

  private isDecisionStillValid(decision: ModelRoutingDecision): boolean {
    // Consider decision valid for 5 minutes
    // We need to track when the decision was made, not just the duration
    const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
    // For now, assume all recent decisions are still valid
    // In a real implementation, we'd store the decision timestamp
    return true; // Simplified for current implementation
  }

  private calculateConfidence(decision: ModelRoutingDecision): number {
    // Base confidence on multiple factors
    let confidence = 0.6; // Start with higher base confidence

    // Higher confidence if multiple candidates were evaluated
    if (decision.step3_selection.topCandidates.length >= 3) {
      confidence += 0.2;
    }

    // Higher confidence if top candidate has high scores
    if (decision.step3_selection.topCandidates.length > 0) {
      const topScore = decision.step3_selection.topCandidates[0].score;
      confidence += Math.min(topScore, 0.2); // Max boost of 0.2
    }

    // Lower confidence if many models were filtered out
    const filterRatio = decision.step2_filtering.remaining / decision.step1_consolidation.totalModels;
    if (filterRatio < 0.3) {
      confidence -= 0.1;
    }

    return Math.max(0.1, Math.min(1.0, confidence));
  }

  private async getFallbackDefault(errorMessage: string): Promise<DefaultModelSelection> {
    try {
      // Try to get a simple model list and pick the first available
      const models = await this.unifiedManager.discoverAllModels();
      const availableModels = models.filter(m => m.available);

      if (availableModels.length > 0) {
        // Prefer smaller models for fallback
        const sortedBySize = availableModels.sort((a, b) => {
          const aSize = this.parseModelSize(a.parameters || '');
          const bSize = this.parseModelSize(b.parameters || '');
          return aSize - bSize;
        });

        return {
          selectedModel: sortedBySize[0],
          reason: 'fallback',
          alternatives: sortedBySize.slice(1, 4),
          reasoning: `Fallback selection due to routing error: ${errorMessage}. Selected smallest available model.`,
          confidence: 0.3,
        };
      }
    } catch (fallbackError) {
      // Last resort - create a minimal default
    }

    // Create a minimal system default
    const systemDefault: UnifiedModel = {
      name: 'system-default',
      backend: 'huggingface',
      type: 'fallback',
      parameters: '1B',
      ramRequirement: '2GB',
      trustScore: 5.0,
      available: false,
      taskSuitability: { coding: 5, reasoning: 5, general: 5, creative: 5 },
    };

    return {
      selectedModel: systemDefault,
      reason: 'system_default',
      alternatives: [],
      reasoning: `System default fallback: ${errorMessage}. Please download models or check configuration.`,
      confidence: 0.1,
    };
  }

  private parseModelSize(params: string): number {
    const match = params.match(/(\\d+(?:\\.\\d+)?)/);
    return match ? parseFloat(match[1]) : 999;
  }

  private buildComprehensiveReasoning(decision: ModelRoutingDecision, systemReasoning: string): string {
    const parts = [
      `System Analysis: ${systemReasoning}`,
      `Intelligent Routing: ${decision.reasoning}`,
      `Confidence: ${(this.calculateConfidence(decision) * 100).toFixed(0)}%`,
      `Performance: ${decision.totalDuration}ms routing time`,
    ];

    if (decision.alternatives.length > 0) {
      parts.push(`${decision.alternatives.length} alternative(s) available`);
    }

    return parts.join(' | ');
  }

  private buildFallbackStrategy(decision: ModelRoutingDecision): string {
    const strategies = [];

    if (decision.alternatives.length > 0) {
      strategies.push(`Switch to ${decision.alternatives[0].name} (${decision.alternatives[0].backend})`);
    }

    if (decision.selectedModel.backend === 'ollama') {
      strategies.push('Fall back to HuggingFace models if Ollama fails');
    } else if (decision.selectedModel.backend === 'huggingface') {
      strategies.push('Fall back to Ollama models if available');
    }

    strategies.push('Use cloud models if local resources insufficient');

    return strategies.join(' → ');
  }
}