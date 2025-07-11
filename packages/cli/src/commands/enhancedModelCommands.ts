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
  TrustConfiguration,
  SmartRoutingService 
} from '@trust-cli/trust-cli-core';

export interface EnhancedModelCommandArgs {
  action: 'list-all' | 'discover' | 'filter' | 'recommend' | 'backends' | 'smart-default' | 'smart-recommend' | 'routing-info' | 'transparency' | 'auto-select';
  task?: TaskType;
  ramLimit?: number;
  maxSize?: number;
  backend?: 'ollama' | 'huggingface' | 'cloud';
  urgency?: 'low' | 'medium' | 'high';
  preferredBackends?: string[];
  showAlternatives?: boolean;
  transparency?: boolean;
  verbose?: boolean;
}

export class EnhancedModelCommandHandler {
  private unifiedManager: UnifiedModelManager;
  private trustConfig: TrustConfiguration;
  private smartRouting: SmartRoutingService;

  constructor() {
    this.trustConfig = new TrustConfiguration();
    this.unifiedManager = new UnifiedModelManager(this.trustConfig);
    this.smartRouting = new SmartRoutingService(this.trustConfig);
  }

  async initialize(): Promise<void> {
    await this.trustConfig.initialize();
    await this.unifiedManager.initialize();
    await this.smartRouting.initialize();
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
      case 'smart-default':
        await this.displaySmartDefault(args);
        break;
      case 'smart-recommend':
        await this.displaySmartRecommendation(args);
        break;
      case 'routing-info':
        await this.displayRoutingInfo(args);
        break;
      case 'transparency':
        await this.displayFullTransparency(args);
        break;
      case 'auto-select':
        await this.performAutoSelection(args);
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

  // Phase 3: Smart Routing Methods

  /**
   * Display smart default model selection with transparency
   */
  private async displaySmartDefault(args: EnhancedModelCommandArgs): Promise<void> {
    console.log('\n🧠 Smart Model Default Selection');
    console.log('═'.repeat(60));

    const context = {
      task: args.task,
      preferredBackends: this.parseBackends(args.preferredBackends),
      urgency: args.urgency,
    };

    try {
      const selection = await this.smartRouting.getSmartDefault(context);
      
      // Display primary selection
      console.log('🎯 **Selected Model:**');
      this.displayModelInfoSmart(selection.selectedModel, true);
      
      // Display reasoning
      console.log('\n🤔 **Selection Reasoning:**');
      console.log(`   ${selection.reasoning}`);
      
      // Display confidence and selection method
      const confidenceIcon = this.getConfidenceIcon(selection.confidence);
      console.log(`\n${confidenceIcon} **Confidence Level:** ${(selection.confidence * 100).toFixed(0)}%`);
      console.log(`📋 **Selection Method:** ${this.getSelectionMethodDescription(selection.reason)}`);
      
      // Display alternatives if requested
      if (args.showAlternatives && selection.alternatives.length > 0) {
        console.log('\n🔄 **Alternative Options:**');
        selection.alternatives.slice(0, 3).forEach((alt, i) => {
          console.log(`   ${i + 2}. ${alt.name}`);
          this.displayModelInfoSmart(alt, false, '      ');
        });
      }
      
      // Display transparency info if requested
      if (args.transparency) {
        await this.displayAdditionalTransparency(selection);
      }
      
      console.log('\n💡 **Next Steps:**');
      console.log(`   trust model switch ${selection.selectedModel.name}`);
      if (selection.selectedModel.backend === 'huggingface' && !selection.selectedModel.available) {
        console.log(`   trust model download ${selection.selectedModel.name}`);
      }
      
    } catch (error) {
      console.error(`❌ Failed to get smart default: ${error instanceof Error ? error.message : String(error)}`);
      console.log('\n💡 **Troubleshooting:**');
      console.log('   • Check that models are available: trust model list');
      console.log('   • Verify backends are running: trust status');
      console.log('   • Try manual selection: trust model recommend [task]');
    }
  }

  /**
   * Display comprehensive smart recommendation
   */
  private async displaySmartRecommendation(args: EnhancedModelCommandArgs): Promise<void> {
    console.log('\n🎯 Smart Model Recommendation');
    console.log('═'.repeat(60));

    try {
      const recommendation = await this.smartRouting.getRoutingRecommendation(args.task);
      
      // System analysis
      console.log('🖥️  **System Analysis:**');
      console.log(`   Available RAM: ${recommendation.systemAnalysis.availableRAM}GB`);
      console.log(`   Recommended RAM Usage: ${recommendation.systemAnalysis.recommendedRAM}GB`);
      if (recommendation.systemAnalysis.recommendedTask) {
        console.log(`   Task Optimization: ${recommendation.systemAnalysis.recommendedTask}`);
      }
      
      // Primary recommendation
      console.log('\n🏆 **Primary Recommendation:**');
      this.displayModelInfoSmart(recommendation.primary, true);
      
      // Comprehensive reasoning
      console.log('\n🧠 **Comprehensive Analysis:**');
      console.log(`   ${recommendation.reasoning}`);
      
      // Confidence and fallback strategy
      const confidenceIcon = this.getConfidenceIcon(recommendation.confidence);
      console.log(`\n${confidenceIcon} **Confidence:** ${(recommendation.confidence * 100).toFixed(0)}%`);
      console.log(`🔄 **Fallback Strategy:** ${recommendation.fallbackStrategy}`);
      
      // Alternative recommendations
      if (recommendation.alternatives.length > 0) {
        console.log('\n📊 **Alternative Recommendations:**');
        recommendation.alternatives.forEach((alt, i) => {
          console.log(`\n   ${i + 2}. **${alt.name}** (${alt.backend})`);
          this.displayModelInfoSmart(alt, false, '      ');
        });
      }
      
      // Performance expectations
      console.log('\n⚡ **Performance Expectations:**');
      this.displayPerformanceExpectations(recommendation.primary, recommendation.systemAnalysis);
      
    } catch (error) {
      console.error(`❌ Failed to generate smart recommendation: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Display routing information and decision process
   */
  private async displayRoutingInfo(args: EnhancedModelCommandArgs): Promise<void> {
    console.log('\n📊 Intelligent Routing Information');
    console.log('═'.repeat(60));

    // Check if intelligent routing should be used
    const shouldUseIntelligent = await this.smartRouting.shouldUseIntelligentRouting({
      complexity: args.task ? 'moderate' : 'simple',
    });
    
    console.log(`🤖 **Intelligent Routing Status:** ${shouldUseIntelligent ? 'Enabled' : 'Disabled'}`);
    console.log(`📈 **Current Confidence:** ${(this.smartRouting.getRoutingConfidence() * 100).toFixed(0)}%`);
    
    if (shouldUseIntelligent) {
      console.log('\n✅ **Why Intelligent Routing is Recommended:**');
      console.log('   • Optimizes model selection based on task requirements');
      console.log('   • Considers current system resources and constraints');
      console.log('   • Provides transparent decision-making process');
      console.log('   • Offers fallback alternatives for reliability');
    } else {
      console.log('\n⚠️  **Why Simple Selection is Used:**');
      console.log('   • System load is high and task complexity is low');
      console.log('   • Prioritizing speed over optimization');
      console.log('   • Reducing computational overhead');
    }
    
    // Display routing capabilities
    console.log('\n🛠️  **Routing Capabilities:**');
    console.log('   • Task-aware model selection (coding, reasoning, general, creative)');
    console.log('   • Hardware constraint filtering (RAM, CPU, disk space)');
    console.log('   • Multi-backend support (Ollama, HuggingFace, Cloud)');
    console.log('   • Trust score evaluation and filtering');
    console.log('   • Performance prediction and optimization');
    
    console.log('\n🎯 **Available Commands:**');
    console.log('   trust model-enhanced smart-default --task coding --urgency high');
    console.log('   trust model-enhanced smart-recommend --task reasoning --show-alternatives');
    console.log('   trust model-enhanced transparency --verbose');
    console.log('   trust model-enhanced auto-select --task creative');
  }

  /**
   * Display full transparency information
   */
  private async displayFullTransparency(args: EnhancedModelCommandArgs): Promise<void> {
    console.log('\n🔍 Full Routing Transparency');
    console.log('═'.repeat(60));

    try {
      // Get a fresh routing decision for transparency
      const selection = await this.smartRouting.getSmartDefault({
        task: args.task,
        preferredBackends: this.parseBackends(args.preferredBackends),
      });
      
      console.log('📋 **Selection Summary:**');
      console.log(`   Selected: ${selection.selectedModel.name} (${selection.selectedModel.backend})`);
      console.log(`   Method: ${selection.reason}`);
      console.log(`   Confidence: ${(selection.confidence * 100).toFixed(0)}%`);
      
      console.log('\n🧠 **Decision Process:**');
      console.log(`   Reasoning: ${selection.reasoning}`);
      
      if (selection.alternatives.length > 0) {
        console.log('\n🔄 **Alternative Analysis:**');
        selection.alternatives.forEach((alt, i) => {
          console.log(`   ${i + 1}. ${alt.name} - Trust: ${alt.trustScore}/10, Backend: ${alt.backend}`);
        });
      }
      
      // Display routing principles
      console.log('\n📖 **Routing Principles:**');
      console.log('   1. Consolidate: Discover all available models across backends');
      console.log('   2. Filter: Apply task and hardware constraints');
      console.log('   3. Select: Score models using weighted factors');
      console.log('   4. Route: Choose optimal backend for selected model');
      
      console.log('\n📊 **Scoring Factors:**');
      console.log('   • Trust Score (40%): Model reliability and security');
      console.log('   • Task Suitability (30%): Optimization for specific tasks');
      console.log('   • Performance (15%): Model size and capability');
      console.log('   • Availability (10%): Current accessibility');
      console.log('   • Efficiency (5%): Resource usage optimization');
      
    } catch (error) {
      console.error(`❌ Failed to display transparency: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Perform automatic model selection and switching
   */
  private async performAutoSelection(args: EnhancedModelCommandArgs): Promise<void> {
    console.log('\n⚡ Automatic Model Selection');
    console.log('═'.repeat(60));

    try {
      const selection = await this.smartRouting.getSmartDefault({
        task: args.task,
        preferredBackends: this.parseBackends(args.preferredBackends),
        urgency: args.urgency,
      });
      
      console.log(`🎯 **Auto-Selected:** ${selection.selectedModel.name}`);
      console.log(`📋 **Reasoning:** ${selection.reasoning}`);
      
      // Check if model is available
      if (selection.selectedModel.available) {
        console.log('\n✅ **Model Ready:** Model is available for use');
        console.log(`   Command: trust model switch ${selection.selectedModel.name}`);
        
      } else {
        console.log(`\n📥 **Model Download Required:** ${selection.selectedModel.name} not available locally`);
        console.log(`   Estimated download: ${this.estimateDownloadSize(selection.selectedModel)}`);
        console.log(`   Command: trust model download ${selection.selectedModel.name}`);
        
        if (selection.alternatives.length > 0) {
          const availableAlt = selection.alternatives.find(alt => alt.available);
          if (availableAlt) {
            console.log(`\n🔄 **Available Alternative:** ${availableAlt.name}`);
            console.log('   Would you like to use the available alternative instead?');
          }
        }
      }
      
    } catch (error) {
      console.error(`❌ Auto-selection failed: ${error instanceof Error ? error.message : String(error)}`);
      console.log('\n💡 **Manual Selection Recommended:**');
      console.log('   trust model list');
      console.log('   trust model recommend [task]');
    }
  }

  // Helper methods for smart routing

  private parseBackends(backends?: string[]): Array<'ollama' | 'huggingface' | 'cloud'> | undefined {
    if (!backends) return undefined;
    return backends.filter(b => ['ollama', 'huggingface', 'cloud'].includes(b)) as Array<'ollama' | 'huggingface' | 'cloud'>;
  }

  private displayModelInfoSmart(model: UnifiedModel, isPrimary: boolean, indent = '   '): void {
    const statusIcon = model.available ? '✅' : '📥';
    const primaryIndicator = isPrimary ? '🏆 ' : '';
    
    console.log(`${indent}${primaryIndicator}${statusIcon} **${model.name}** (${model.backend})`);
    console.log(`${indent}   📊 Parameters: ${model.parameters} | RAM: ${model.ramRequirement}`);
    console.log(`${indent}   ⭐ Trust Score: ${model.trustScore}/10`);
    
    if (model.taskSuitability) {
      const topTask = Object.entries(model.taskSuitability)
        .sort(([,a], [,b]) => b - a)[0];
      console.log(`${indent}   🎯 Best for: ${topTask[0]} (${topTask[1]}/10)`);
    }
  }

  private getConfidenceIcon(confidence: number): string {
    if (confidence >= 0.8) return '🟢';
    if (confidence >= 0.6) return '🟡';
    if (confidence >= 0.4) return '🟠';
    return '🔴';
  }

  private getSelectionMethodDescription(reason: string): string {
    switch (reason) {
      case 'intelligent_routing':
        return 'AI-powered 4-step routing analysis';
      case 'cached':
        return 'Recently cached intelligent decision';
      case 'fallback':
        return 'Safe fallback after routing error';
      case 'system_default':
        return 'System default (manual setup needed)';
      default:
        return 'Unknown selection method';
    }
  }

  private async displayAdditionalTransparency(selection: any): Promise<void> {
    console.log('\n🔍 **Additional Transparency:**');
    console.log(`   Selection Timestamp: ${new Date().toISOString()}`);
    console.log(`   Algorithm Version: 1.0.0`);
    console.log(`   Factors Considered: Trust, Task Suitability, Performance, Availability, Efficiency`);
  }

  private displayPerformanceExpectations(model: UnifiedModel, systemAnalysis: any): void {
    const ramUsage = this.parseRAMRequirement(model.ramRequirement || '0');
    const ramPercentage = ((ramUsage / systemAnalysis.availableRAM) * 100).toFixed(0);
    
    console.log(`   RAM Usage: ${ramUsage}GB (${ramPercentage}% of available)`);
    
    if (ramUsage < systemAnalysis.availableRAM * 0.5) {
      console.log('   ⚡ Expected Performance: Excellent (low resource usage)');
    } else if (ramUsage < systemAnalysis.availableRAM * 0.8) {
      console.log('   ✅ Expected Performance: Good (moderate resource usage)');
    } else {
      console.log('   ⚠️  Expected Performance: May be constrained (high resource usage)');
    }
  }

  private parseRAMRequirement(ram: string): number {
    const match = ram.match(/(\d+(?:\.\d+)?)/);
    return match ? parseFloat(match[1]) : 2;
  }

  private estimateDownloadSize(model: UnifiedModel): string {
    const params = this.parseParameters(model.parameters || '0');
    const estimatedGB = Math.ceil(params * 0.75); // Rough estimate for GGUF
    return `~${estimatedGB}GB`;
  }
}

export async function handleEnhancedModelCommand(args: EnhancedModelCommandArgs): Promise<void> {
  const handler = new EnhancedModelCommandHandler();
  await handler.handleCommand(args);
}