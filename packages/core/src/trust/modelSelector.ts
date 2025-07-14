/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { TrustModelConfig } from './types.js';

/**
 * Model recommendation based on task type and requirements
 */
export interface ModelRecommendation {
  model: TrustModelConfig;
  score: number;
  reasoning: string;
  suitability: 'excellent' | 'good' | 'fair' | 'poor';
  tradeoffs?: string[];
}

/**
 * Task context for model recommendations
 */
export interface TaskContext {
  type: 'coding' | 'chat' | 'analysis' | 'writing' | 'tools' | 'general';
  complexity: 'simple' | 'moderate' | 'complex';
  requiresTools: boolean;
  maxLatency?: number; // milliseconds
  preferLocal?: boolean;
  languageHints?: string[];
  memoryConstraints?: {
    maxRam: string;
    preferredRam: string;
  };
}

/**
 * Enhanced model selector with intelligent recommendations
 */
export class ModelSelector {
  private availableModels: TrustModelConfig[] = [];
  private performanceHistory: Map<string, ModelPerformance> = new Map();

  constructor(models: TrustModelConfig[]) {
    this.availableModels = models;
  }

  /**
   * Get intelligent model recommendations based on task context
   */
  getRecommendations(context: TaskContext): ModelRecommendation[] {
    const recommendations: ModelRecommendation[] = [];

    for (const model of this.availableModels) {
      const score = this.calculateModelScore(model, context);
      const recommendation: ModelRecommendation = {
        model,
        score,
        reasoning: this.generateReasoning(model, context, score),
        suitability: this.getSuitabilityLevel(score),
        tradeoffs: this.getTradeoffs(model, context)
      };
      recommendations.push(recommendation);
    }

    // Sort by score (descending)
    return recommendations.sort((a, b) => b.score - a.score);
  }

  /**
   * Get the best model for a specific task
   */
  getBestModel(context: TaskContext): ModelRecommendation | null {
    const recommendations = this.getRecommendations(context);
    return recommendations.length > 0 ? recommendations[0] : null;
  }

  /**
   * Calculate model score based on task context (0-100)
   */
  private calculateModelScore(model: TrustModelConfig, context: TaskContext): number {
    let score = 50; // Base score

    // Task type scoring
    switch (context.type) {
      case 'coding':
        if (model.name.includes('deepseek') || model.name.includes('qwen')) {
          score += 20;
        } else if (model.name.includes('llama') || model.name.includes('phi')) {
          score += 15;
        }
        break;
      
      case 'tools':
        // Models that work well with tool calling
        if (model.name.includes('llama') || model.name.includes('qwen')) {
          score += 25;
        } else if (model.name.includes('phi')) {
          score += 20;
        }
        break;
      
      case 'chat':
        // General conversation models
        if (model.name.includes('llama')) {
          score += 15;
        } else if (model.name.includes('phi')) {
          score += 20;
        }
        break;
      
      case 'analysis':
        // Analytical tasks
        if (model.name.includes('deepseek') || model.name.includes('qwen')) {
          score += 20;
        }
        break;
    }

    // Complexity scoring
    const parameterCount = this.getParameterCount(model);
    switch (context.complexity) {
      case 'simple':
        if (parameterCount <= 3) score += 15;
        else if (parameterCount <= 7) score += 10;
        else score -= 5;
        break;
      
      case 'moderate':
        if (parameterCount >= 3 && parameterCount <= 8) score += 15;
        break;
      
      case 'complex':
        if (parameterCount >= 7) score += 20;
        else if (parameterCount >= 3) score += 10;
        else score -= 10;
        break;
    }

    // Tool calling requirements
    if (context.requiresTools) {
      // Boost models known to work well with tools
      if (model.name.includes('llama') || model.name.includes('qwen')) {
        score += 15;
      } else if (model.name.includes('phi')) {
        score += 10;
      }
    }

    // Memory constraints
    if (context.memoryConstraints) {
      const ramNeeded = this.parseRamRequirement(model.ramRequirement);
      const maxRam = this.parseRamRequirement(context.memoryConstraints.maxRam);
      
      if (ramNeeded > maxRam) {
        score -= 30; // Heavy penalty for exceeding memory
      } else {
        const preferredRam = this.parseRamRequirement(context.memoryConstraints.preferredRam);
        if (ramNeeded <= preferredRam) {
          score += 10; // Bonus for fitting in preferred memory
        }
      }
    }

    // Latency preferences
    if (context.maxLatency) {
      const modelLatency = this.estimateLatency(model);
      if (modelLatency <= context.maxLatency) {
        score += 10;
      } else {
        score -= 15;
      }
    }

    // Performance history
    const performance = this.performanceHistory.get(model.name);
    if (performance) {
      if (performance.successRate > 0.9) score += 10;
      else if (performance.successRate < 0.7) score -= 10;
      
      if (performance.averageLatency < 5000) score += 5;
      else if (performance.averageLatency > 15000) score -= 5;
    }

    // Ensure score is within bounds
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Generate human-readable reasoning for the recommendation
   */
  private generateReasoning(model: TrustModelConfig, context: TaskContext, score: number): string {
    const reasons: string[] = [];
    const paramCount = this.getParameterCount(model);

    // Model size reasoning
    if (paramCount <= 2) {
      reasons.push("Very fast and lightweight");
    } else if (paramCount <= 4) {
      reasons.push("Good balance of speed and capability");
    } else if (paramCount <= 8) {
      reasons.push("High capability for complex tasks");
    } else {
      reasons.push("Maximum capability but slower inference");
    }

    // Task-specific reasoning
    switch (context.type) {
      case 'coding':
        if (model.name.includes('deepseek')) {
          reasons.push("Specialized for code generation and analysis");
        } else if (model.name.includes('qwen')) {
          reasons.push("Strong programming language support");
        }
        break;
      
      case 'tools':
        if (model.name.includes('llama')) {
          reasons.push("Excellent tool calling reliability");
        } else if (model.name.includes('phi')) {
          reasons.push("Good tool calling with fast responses");
        }
        break;
      
      case 'chat':
        if (model.name.includes('phi')) {
          reasons.push("Optimized for conversational interactions");
        }
        break;
    }

    // Memory considerations
    const ramNeeded = this.parseRamRequirement(model.ramRequirement);
    if (ramNeeded <= 4) {
      reasons.push("Low memory usage");
    } else if (ramNeeded <= 8) {
      reasons.push("Moderate memory requirements");
    } else {
      reasons.push("High memory requirements");
    }

    return reasons.join(", ");
  }

  /**
   * Get suitability level based on score
   */
  private getSuitabilityLevel(score: number): 'excellent' | 'good' | 'fair' | 'poor' {
    if (score >= 80) return 'excellent';
    if (score >= 65) return 'good';
    if (score >= 50) return 'fair';
    return 'poor';
  }

  /**
   * Get tradeoffs for a model recommendation
   */
  private getTradeoffs(model: TrustModelConfig, context: TaskContext): string[] {
    const tradeoffs: string[] = [];
    const paramCount = this.getParameterCount(model);

    if (paramCount <= 2) {
      tradeoffs.push("May have limited capability for complex tasks");
    } else if (paramCount >= 8) {
      tradeoffs.push("Slower inference speed");
      tradeoffs.push("Higher memory usage");
    }

    const ramNeeded = this.parseRamRequirement(model.ramRequirement);
    if (ramNeeded >= 8) {
      tradeoffs.push("Requires substantial RAM");
    }

    if (context.requiresTools && !model.name.includes('llama') && !model.name.includes('qwen')) {
      tradeoffs.push("May have less reliable tool calling");
    }

    return tradeoffs;
  }

  /**
   * Extract parameter count from model name
   */
  private getParameterCount(model: TrustModelConfig): number {
    const name = model.name.toLowerCase();
    
    // Extract number followed by 'b' (billion)
    const match = name.match(/(\d+(?:\.\d+)?)b/);
    if (match) {
      return parseFloat(match[1]);
    }
    
    // Extract from specific patterns
    if (name.includes('1.5b')) return 1.5;
    if (name.includes('3b')) return 3;
    if (name.includes('7b')) return 7;
    if (name.includes('8b')) return 8;
    if (name.includes('12b')) return 12;
    
    // Default based on model type
    if (name.includes('mini')) return 3.8;
    if (name.includes('small')) return 1.5;
    
    return 3; // Default
  }

  /**
   * Parse RAM requirement string to GB number
   */
  private parseRamRequirement(ramReq: string): number {
    const match = ramReq.match(/(\d+(?:\.\d+)?)\s*GB/i);
    return match ? parseFloat(match[1]) : 8; // Default to 8GB
  }

  /**
   * Estimate model latency based on size and type
   */
  private estimateLatency(model: TrustModelConfig): number {
    const paramCount = this.getParameterCount(model);
    
    // Base latency in milliseconds
    let latency = 2000; // 2 seconds base
    
    // Add latency based on parameter count
    latency += paramCount * 1000; // 1 second per billion parameters
    
    // Model-specific adjustments
    if (model.name.includes('phi')) {
      latency *= 0.8; // Phi models are generally faster
    } else if (model.name.includes('qwen')) {
      latency *= 0.9; // Qwen models are reasonably fast
    }
    
    return latency;
  }

  /**
   * Update performance history for a model
   */
  updatePerformance(modelName: string, success: boolean, latency: number): void {
    const existing = this.performanceHistory.get(modelName) || {
      successRate: 0.5,
      averageLatency: 5000,
      totalExecutions: 0,
      successfulExecutions: 0,
      totalLatency: 0
    };

    existing.totalExecutions++;
    existing.totalLatency += latency;
    
    if (success) {
      existing.successfulExecutions++;
    }

    existing.successRate = existing.successfulExecutions / existing.totalExecutions;
    existing.averageLatency = existing.totalLatency / existing.totalExecutions;

    this.performanceHistory.set(modelName, existing);
  }

  /**
   * Get performance statistics for a model
   */
  getModelPerformance(modelName: string): ModelPerformance | null {
    return this.performanceHistory.get(modelName) || null;
  }

  /**
   * Get models filtered by criteria
   */
  filterModels(criteria: {
    maxRam?: string;
    minParameters?: number;
    maxParameters?: number;
    type?: string;
    backend?: string;
  }): TrustModelConfig[] {
    return this.availableModels.filter(model => {
      if (criteria.maxRam) {
        const modelRam = this.parseRamRequirement(model.ramRequirement);
        const maxRam = this.parseRamRequirement(criteria.maxRam);
        if (modelRam > maxRam) return false;
      }

      if (criteria.minParameters) {
        const params = this.getParameterCount(model);
        if (params < criteria.minParameters) return false;
      }

      if (criteria.maxParameters) {
        const params = this.getParameterCount(model);
        if (params > criteria.maxParameters) return false;
      }

      if (criteria.type && !model.name.includes(criteria.type)) {
        return false;
      }

      if (criteria.backend && model.type !== criteria.backend) {
        return false;
      }

      return true;
    });
  }
}

/**
 * Model performance tracking
 */
interface ModelPerformance {
  successRate: number;
  averageLatency: number;
  totalExecutions: number;
  successfulExecutions: number;
  totalLatency: number;
}