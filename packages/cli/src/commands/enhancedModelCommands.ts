/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { UnifiedModelManager, UnifiedModel, TaskType, HardwareConstraints, TrustConfiguration } from '@trust-cli/trust-cli-core';

export interface EnhancedModelCommandArgs {
  action: 'list-all' | 'discover' | 'filter' | 'recommend' | 'backends';
  task?: TaskType;
  ramLimit?: number;
  maxSize?: number;
  backend?: 'ollama' | 'huggingface' | 'cloud';
  verbose?: boolean;
}

export class EnhancedModelCommandHandler {
  private unifiedManager: UnifiedModelManager;
  private trustConfig: TrustConfiguration;

  constructor() {
    this.trustConfig = new TrustConfiguration();
    this.unifiedManager = new UnifiedModelManager(this.trustConfig);
  }

  async initialize(): Promise<void> {
    await this.trustConfig.initialize();
    await this.unifiedManager.initialize();
  }

  async handleCommand(args: EnhancedModelCommandArgs): Promise<void> {
    await this.initialize();

    switch (args.action) {
      case 'list-all':
        await this.listAllModels(args.verbose);
        break;
      case 'discover':
        await this.discoverModels(args.verbose);
        break;
      case 'filter':
        await this.filterModels(args);
        break;
      case 'recommend':
        await this.recommendModel(args);
        break;
      case 'backends':
        await this.showBackendModels();
        break;
      default:
        throw new Error(`Unknown enhanced model command: ${args.action}`);
    }
  }

  /**
   * List all models from all backends in a unified view
   */
  private async listAllModels(verbose = false): Promise<void> {
    console.log('\\n🔍 Trust CLI - Unified Model Discovery');
    console.log('═'.repeat(70));

    const models = await this.unifiedManager.discoverAllModels();

    if (models.length === 0) {
      console.log('📁 No models found across any backend.');
      console.log('\\n🚀 Quick Start:');
      console.log('   # Install Ollama models:');
      console.log('   ollama pull qwen2.5:1.5b');
      console.log('   ollama pull phi3.5:3.8b-mini-instruct');
      console.log('');
      console.log('   # Or download HuggingFace models:');
      console.log('   trust model download phi-3.5-mini-instruct');
      console.log('   trust model download qwen2.5-1.5b-instruct');
      return;
    }

    // Group by backend for display
    const grouped = await this.unifiedManager.getModelsByBackend();

    for (const [backend, backendModels] of Object.entries(grouped)) {
      if (backendModels.length === 0) continue;

      console.log(`\\n${this.getBackendIcon(backend)} ${backend.toUpperCase()} Models (${backendModels.length}):`);
      console.log('─'.repeat(50));

      for (const model of backendModels) {
        const trustBadge = this.getTrustScoreBadge(model.trustScore);
        const ramBadge = this.getRAMBadge(model.ramRequirement);
        
        console.log(`  📦 ${model.name}`);
        
        if (verbose) {
          console.log(`     Type: ${model.type || 'Unknown'}`);
          console.log(`     Parameters: ${model.parameters || 'Unknown'}`);
          console.log(`     Context: ${model.contextSize || 'Unknown'} tokens`);
          console.log(`     RAM: ${ramBadge}`);
          console.log(`     Trust Score: ${trustBadge}`);
          console.log(`     Description: ${model.description || 'No description'}`);
          
          if (model.taskSuitability) {
            console.log(`     Task Suitability:`);
            console.log(`       Coding: ${this.getScoreBadge(model.taskSuitability.coding)}`);
            console.log(`       Reasoning: ${this.getScoreBadge(model.taskSuitability.reasoning)}`);
            console.log(`       General: ${this.getScoreBadge(model.taskSuitability.general)}`);
            console.log(`       Creative: ${this.getScoreBadge(model.taskSuitability.creative)}`);
          }
          console.log('');
        } else {
          console.log(`     ${model.parameters || 'Unknown'} • ${ramBadge} • ${trustBadge} • ${model.description || 'No description'}`);
        }
      }
    }

    console.log(`\\n📊 Total: ${models.length} models across ${Object.keys(grouped).length} backends`);
    console.log('💡 Use --verbose for detailed information');
    console.log('💡 Use "trust model-enhanced filter --task coding" to filter by task type');
  }

  /**
   * Discover and show model discovery process
   */
  private async discoverModels(verbose = false): Promise<void> {
    console.log('\\n🔍 Model Discovery Process');
    console.log('═'.repeat(50));

    console.log('📡 Scanning backends...');
    
    const backends = ['ollama', 'huggingface', 'cloud'] as const;
    const enabledBackends = backends.filter(backend => 
      this.trustConfig.isBackendEnabled(backend)
    );

    console.log(`✅ Enabled backends: ${enabledBackends.join(', ')}`);

    console.log('\\n🔄 Discovering models...');
    const models = await this.unifiedManager.discoverAllModels(true); // Force refresh

    const grouped = await this.unifiedManager.getModelsByBackend();

    for (const backend of enabledBackends) {
      const count = grouped[backend]?.length || 0;
      const status = count > 0 ? '✅' : '❌';
      console.log(`  ${status} ${backend}: ${count} models found`);
    }

    console.log(`\\n📊 Discovery Summary:`);
    console.log(`   Total Models: ${models.length}`);
    console.log(`   Active Backends: ${Object.keys(grouped).length}`);
    console.log(`   Cache Status: Fresh`);

    if (verbose) {
      console.log('\\n📋 Detailed Results:');
      await this.listAllModels(true);
    }
  }

  /**
   * Filter models based on task type and hardware constraints
   */
  private async filterModels(args: EnhancedModelCommandArgs): Promise<void> {
    console.log('\\n🎯 Model Filtering');
    console.log('═'.repeat(50));

    const allModels = await this.unifiedManager.discoverAllModels();
    
    const constraints: HardwareConstraints = {};
    if (args.ramLimit) {
      constraints.availableRAM = args.ramLimit;
    }
    if (args.maxSize) {
      constraints.maxDownloadSize = args.maxSize;
    }

    console.log('📋 Filter Criteria:');
    if (args.task) {
      console.log(`   Task Type: ${args.task}`);
    }
    if (args.ramLimit) {
      console.log(`   RAM Limit: ${args.ramLimit}GB`);
    }
    if (args.maxSize) {
      console.log(`   Max Download: ${(args.maxSize / 1e9).toFixed(1)}GB`);
    }
    if (args.backend) {
      console.log(`   Backend: ${args.backend}`);
    }

    let filteredModels = this.unifiedManager.filterModels(
      allModels,
      args.task,
      constraints
    );

    if (args.backend) {
      filteredModels = filteredModels.filter(m => m.backend === args.backend);
    }

    console.log(`\\n📊 Results: ${filteredModels.length} of ${allModels.length} models match criteria\\n`);

    if (filteredModels.length === 0) {
      console.log('❌ No models match your criteria.');
      console.log('\\n💡 Suggestions:');
      console.log('   • Increase RAM limit');
      console.log('   • Remove task-specific filtering');
      console.log('   • Check if models are installed');
      return;
    }

    // Display filtered models
    for (const model of filteredModels) {
      const taskScore = args.task && model.taskSuitability?.[args.task] 
        ? ` (${args.task}: ${model.taskSuitability[args.task]}/10)`
        : '';
      
      console.log(`📦 ${model.name} (${model.backend})`);
      console.log(`   ${model.parameters || 'Unknown'} • ${model.ramRequirement || 'Unknown'} • Trust: ${model.trustScore}/10${taskScore}`);
      
      if (args.verbose && model.description) {
        console.log(`   ${model.description}`);
      }
      console.log('');
    }
  }

  /**
   * Recommend the best model for a specific task
   */
  private async recommendModel(args: EnhancedModelCommandArgs): Promise<void> {
    console.log('\\n🎯 Model Recommendation');
    console.log('═'.repeat(50));

    const allModels = await this.unifiedManager.discoverAllModels();
    
    const constraints: HardwareConstraints = {};
    if (args.ramLimit) {
      constraints.availableRAM = args.ramLimit;
    }

    const filteredModels = this.unifiedManager.filterModels(
      allModels,
      args.task,
      constraints
    );

    if (filteredModels.length === 0) {
      console.log(`❌ No suitable models found for task: ${args.task || 'general'}`);
      console.log('\\n💡 Try:');
      console.log('   • Installing more models');
      console.log('   • Increasing RAM limit');
      console.log('   • Using a different task type');
      return;
    }

    const recommended = this.unifiedManager.selectBestModel(filteredModels, args.task);

    if (!recommended) {
      console.log('❌ Could not determine best model');
      return;
    }

    console.log(`✅ Recommended Model: **${recommended.name}**`);
    console.log(`   Backend: ${recommended.backend}`);
    console.log(`   Parameters: ${recommended.parameters || 'Unknown'}`);
    console.log(`   RAM Required: ${recommended.ramRequirement || 'Unknown'}`);
    console.log(`   Trust Score: ${this.getTrustScoreBadge(recommended.trustScore)}`);
    
    if (args.task && recommended.taskSuitability?.[args.task]) {
      console.log(`   ${args.task.charAt(0).toUpperCase() + args.task.slice(1)} Score: ${recommended.taskSuitability[args.task]}/10`);
    }
    
    console.log(`   Description: ${recommended.description || 'No description'}`);

    // Show alternatives
    const alternatives = filteredModels
      .filter(m => m.name !== recommended.name)
      .slice(0, 3);

    if (alternatives.length > 0) {
      console.log(`\\n🔄 Alternatives:`);
      alternatives.forEach((alt, i) => {
        console.log(`   ${i + 1}. ${alt.name} (${alt.backend}) - Trust: ${alt.trustScore}/10`);
      });
    }

    console.log(`\\n💡 To switch to this model: trust model switch ${recommended.name}`);
  }

  /**
   * Show models grouped by backend
   */
  private async showBackendModels(): Promise<void> {
    console.log('\\n🏗️  Backend Model Summary');
    console.log('═'.repeat(50));

    const grouped = await this.unifiedManager.getModelsByBackend();

    for (const [backend, models] of Object.entries(grouped)) {
      const enabled = this.trustConfig.isBackendEnabled(backend as any);
      const status = enabled ? '✅' : '❌';
      const icon = this.getBackendIcon(backend);
      
      console.log(`\\n${icon} ${backend.toUpperCase()} ${status}`);
      console.log(`   Models: ${models.length}`);
      
      if (models.length > 0) {
        const totalParams = models
          .map(m => this.parseParameters(m.parameters))
          .reduce((sum, params) => sum + params, 0);
        
        console.log(`   Total Parameters: ~${this.formatParameters(totalParams)}`);
        
        const avgTrust = models
          .filter(m => m.trustScore)
          .reduce((sum, m) => sum + (m.trustScore || 0), 0) / models.length;
        
        if (avgTrust > 0) {
          console.log(`   Average Trust Score: ${avgTrust.toFixed(1)}/10`);
        }
      }
      
      if (!enabled) {
        console.log(`   Status: Disabled`);
      }
    }

    console.log(`\\n📊 Total: ${Object.values(grouped).flat().length} models across ${Object.keys(grouped).length} backends`);
  }

  // Helper methods for display formatting

  private getBackendIcon(backend: string): string {
    switch (backend) {
      case 'ollama': return '🦙';
      case 'huggingface': return '🤗';
      case 'cloud': return '☁️';
      default: return '📦';
    }
  }

  private getTrustScoreBadge(score?: number): string {
    if (!score) return 'Unknown';
    if (score >= 9) return `${score}/10 🟢`;
    if (score >= 7) return `${score}/10 🟡`;
    return `${score}/10 🔴`;
  }

  private getRAMBadge(ram?: string): string {
    if (!ram) return 'Unknown';
    return ram;
  }

  private getScoreBadge(score?: number): string {
    if (!score) return 'N/A';
    if (score >= 8) return `${score}/10 🟢`;
    if (score >= 6) return `${score}/10 🟡`;
    return `${score}/10 🔴`;
  }

  private parseParameters(params?: string): number {
    if (!params) return 0;
    const match = params.match(/(\\d+(?:\\.\\d+)?)/);
    if (!match) return 0;
    const num = parseFloat(match[1]);
    if (params.includes('B')) return num;
    if (params.includes('M')) return num / 1000;
    return num;
  }

  private formatParameters(total: number): string {
    if (total >= 1) return `${total.toFixed(1)}B`;
    return `${(total * 1000).toFixed(0)}M`;
  }
}

export async function handleEnhancedModelCommand(args: EnhancedModelCommandArgs): Promise<void> {
  const handler = new EnhancedModelCommandHandler();
  await handler.handleCommand(args);
}