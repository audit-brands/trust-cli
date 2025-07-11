/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { 
  IntelligentModelRouter, 
  ModelRoutingDecision, 
  RoutingConfig,
  TaskType,
  TrustConfiguration 
} from '@trust-cli/trust-cli-core';

export interface RoutingCommandArgs {
  action: 'route' | 'recommend' | 'system' | 'test' | 'analyze';
  task?: TaskType;
  ramLimit?: number;
  backends?: string[];
  trustThreshold?: number;
  verbose?: boolean;
  interactive?: boolean;
}

export class RoutingCommandHandler {
  private router: IntelligentModelRouter;
  private trustConfig: TrustConfiguration;

  constructor() {
    this.trustConfig = new TrustConfiguration();
    this.router = new IntelligentModelRouter(this.trustConfig);
  }

  async initialize(): Promise<void> {
    await this.trustConfig.initialize();
    await this.router.initialize();
  }

  async handleCommand(args: RoutingCommandArgs): Promise<void> {
    await this.initialize();

    switch (args.action) {
      case 'route':
        await this.performRouting(args);
        break;
      case 'recommend':
        await this.showRecommendations(args);
        break;
      case 'system':
        await this.showSystemInfo();
        break;
      case 'test':
        await this.testRouting(args);
        break;
      case 'analyze':
        await this.analyzeRoutingDecision(args);
        break;
      default:
        throw new Error(`Unknown routing command: ${args.action}`);
    }
  }

  /**
   * Perform intelligent routing and show the complete decision process
   */
  private async performRouting(args: RoutingCommandArgs): Promise<void> {
    console.log('\\n🧠 Intelligent Model Routing');
    console.log('═'.repeat(60));

    const config: RoutingConfig = this.buildRoutingConfig(args);

    console.log('📋 Routing Configuration:');
    if (config.task) {
      console.log(`   Task: ${config.task}`);
    }
    if (config.hardwareConstraints?.availableRAM) {
      console.log(`   RAM Limit: ${config.hardwareConstraints.availableRAM}GB`);
    }
    if (config.preferredBackends) {
      console.log(`   Preferred Backends: ${config.preferredBackends.join(', ')}`);
    }
    if (config.minimumTrustScore) {
      console.log(`   Minimum Trust Score: ${config.minimumTrustScore}`);
    }

    console.log('\\n🔄 Starting 4-Step Routing Process...');

    try {
      const decision = await this.router.routeToOptimalModel(config);
      
      await this.displayRoutingDecision(decision, args.verbose);
      
    } catch (error) {
      console.error(`❌ Routing failed: ${error instanceof Error ? error.message : String(error)}`);
      console.log('\\n💡 Troubleshooting:');
      console.log('   • Check that models are installed and available');
      console.log('   • Try relaxing hardware constraints');
      console.log('   • Verify backends are enabled and running');
    }
  }

  /**
   * Show system-specific routing recommendations
   */
  private async showRecommendations(args: RoutingCommandArgs): Promise<void> {
    console.log('\\n💡 Smart Routing Recommendations');
    console.log('═'.repeat(60));

    try {
      const recommendation = await this.router.getRoutingRecommendation(args.task);
      
      console.log('🖥️  System Information:');
      console.log(`   Available RAM: ${recommendation.systemInfo.availableRAM}GB`);
      console.log(`   Total RAM: ${recommendation.systemInfo.totalRAM}GB`);
      console.log(`   CPU Cores: ${recommendation.systemInfo.cpuCores}`);
      console.log(`   Platform: ${recommendation.systemInfo.platform}`);

      console.log('\\n🎯 Recommended Configuration:');
      if (recommendation.recommended.task) {
        console.log(`   Task Optimization: ${recommendation.recommended.task}`);
      }
      if (recommendation.recommended.hardwareConstraints?.availableRAM) {
        console.log(`   Suggested RAM Limit: ${recommendation.recommended.hardwareConstraints.availableRAM}GB`);
      }
      if (recommendation.recommended.hardwareConstraints?.preferredSize) {
        console.log(`   Model Size Preference: ${recommendation.recommended.hardwareConstraints.preferredSize}`);
      }
      if (recommendation.recommended.preferredBackends) {
        console.log(`   Preferred Backends: ${recommendation.recommended.preferredBackends.join(', ')}`);
      }
      console.log(`   Minimum Trust Score: ${recommendation.recommended.minimumTrustScore}`);
      console.log(`   Fallback Enabled: ${recommendation.recommended.allowFallback ? 'Yes' : 'No'}`);

      console.log('\\n🤔 Reasoning:');
      console.log(`   ${recommendation.reasoning}`);

      console.log('\\n🚀 Try the recommendation:');
      const cmd = this.buildCommandFromRecommendation(recommendation.recommended);
      console.log(`   trust route ${cmd}`);

    } catch (error) {
      console.error(`❌ Failed to generate recommendations: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Show detailed system information
   */
  private async showSystemInfo(): Promise<void> {
    console.log('\\n🖥️  System Resource Analysis');
    console.log('═'.repeat(60));

    try {
      const systemInfo = await this.router.detectSystemResources();
      
      console.log('💾 Memory:');
      console.log(`   Available: ${systemInfo.availableRAM}GB`);
      console.log(`   Total: ${systemInfo.totalRAM}GB`);
      console.log(`   Usage: ${((1 - systemInfo.availableRAM / systemInfo.totalRAM) * 100).toFixed(1)}%`);

      console.log('\\n🔧 Processing:');
      console.log(`   CPU Cores: ${systemInfo.cpuCores}`);
      if (systemInfo.gpuMemory) {
        console.log(`   GPU Memory: ${systemInfo.gpuMemory}GB`);
      }

      console.log('\\n💽 Storage:');
      console.log(`   Available Disk: ${systemInfo.diskSpace}GB`);

      console.log('\\n🏗️  Platform:');
      console.log(`   OS: ${systemInfo.platform}`);

      // Provide capacity recommendations
      console.log('\\n📊 Model Capacity Recommendations:');
      if (systemInfo.availableRAM >= 16) {
        console.log('   ✅ Excellent - Can run large models (7B-13B+)');
      } else if (systemInfo.availableRAM >= 8) {
        console.log('   ✅ Good - Can run medium models (3B-7B)');
      } else if (systemInfo.availableRAM >= 4) {
        console.log('   ⚠️  Limited - Best with small models (1B-3B)');
      } else {
        console.log('   ❌ Constrained - Consider cloud backends');
      }

    } catch (error) {
      console.error(`❌ Failed to analyze system: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Test routing with different scenarios
   */
  private async testRouting(args: RoutingCommandArgs): Promise<void> {
    console.log('\\n🧪 Routing Test Suite');
    console.log('═'.repeat(60));

    const testScenarios: Array<{ name: string; config: RoutingConfig }> = [
      {
        name: 'Coding Task (High Performance)',
        config: { task: 'coding', hardwareConstraints: { availableRAM: 8 } }
      },
      {
        name: 'Reasoning Task (Quality Focus)',
        config: { task: 'reasoning', hardwareConstraints: { availableRAM: 6 } }
      },
      {
        name: 'Resource Constrained',
        config: { hardwareConstraints: { availableRAM: 3 } }
      },
      {
        name: 'High Trust Required',
        config: { minimumTrustScore: 9.0 }
      },
      {
        name: 'Ollama Preferred',
        config: { preferredBackends: ['ollama'] }
      }
    ];

    for (const scenario of testScenarios) {
      console.log(`\\n🔬 Testing: ${scenario.name}`);
      console.log('─'.repeat(40));

      try {
        const decision = await this.router.routeToOptimalModel(scenario.config);
        
        console.log(`✅ Selected: ${decision.selectedModel.name} (${decision.selectedModel.backend})`);
        console.log(`   Trust Score: ${decision.selectedModel.trustScore}/10`);
        console.log(`   RAM Required: ${decision.selectedModel.ramRequirement}`);
        console.log(`   Duration: ${decision.totalDuration}ms`);
        console.log(`   Models Evaluated: ${decision.step1_consolidation.totalModels}`);
        console.log(`   Final Candidates: ${decision.step2_filtering.remaining}`);

        if (args.verbose) {
          console.log(`   Reasoning: ${decision.reasoning}`);
        }

      } catch (error) {
        console.log(`❌ Failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    console.log('\\n📈 Test Summary Complete');
  }

  /**
   * Analyze a specific routing decision in detail
   */
  private async analyzeRoutingDecision(args: RoutingCommandArgs): Promise<void> {
    console.log('\\n🔍 Detailed Routing Analysis');
    console.log('═'.repeat(60));

    const config: RoutingConfig = this.buildRoutingConfig(args);

    try {
      const decision = await this.router.routeToOptimalModel(config);
      
      console.log('📊 Performance Breakdown:');
      console.log(`   Step 1 (Consolidation): ${decision.step1_consolidation.duration}ms`);
      console.log(`   Step 2 (Filtering): ${decision.step2_filtering.duration}ms`);
      console.log(`   Step 3 (Selection): ${decision.step3_selection.duration}ms`);
      console.log(`   Step 4 (Routing): ${decision.step4_routing.duration}ms`);
      console.log(`   Total: ${decision.totalDuration}ms`);

      console.log('\\n🎯 Selection Analysis:');
      console.log(`   Scoring Method: ${decision.step3_selection.scoringMethod}`);
      console.log(`   Top Candidates: ${decision.step3_selection.topCandidates.length}`);

      console.log('\\n🏆 Top 3 Candidates:');
      decision.step3_selection.topCandidates.slice(0, 3).forEach((candidate, i) => {
        console.log(`   ${i + 1}. ${candidate.model.name} (${candidate.model.backend})`);
        console.log(`      Overall Score: ${candidate.score.toFixed(3)}`);
        console.log(`      Trust: ${candidate.breakdown.trust.toFixed(3)} | Task: ${candidate.breakdown.task_suitability.toFixed(3)} | Performance: ${candidate.breakdown.performance.toFixed(3)}`);
      });

      console.log('\\n🔄 Filtering Impact:');
      console.log(`   Total Models Found: ${decision.step1_consolidation.totalModels}`);
      console.log(`   Availability Filtered: ${decision.step2_filtering.availabilityFiltered}`);
      console.log(`   Task Filtered: ${decision.step2_filtering.taskFiltered}`);
      console.log(`   Hardware Filtered: ${decision.step2_filtering.hardwareFiltered}`);
      console.log(`   Final Candidates: ${decision.step2_filtering.remaining}`);

      console.log('\\n🎯 Final Decision:');
      console.log(`   Selected: ${decision.selectedModel.name}`);
      console.log(`   Backend: ${decision.selectedModel.backend}`);
      console.log(`   Reasoning: ${decision.reasoning}`);

      if (decision.alternatives.length > 0) {
        console.log('\\n🔄 Alternatives:');
        decision.alternatives.forEach((alt, i) => {
          console.log(`   ${i + 1}. ${alt.name} (${alt.backend})`);
        });
      }

    } catch (error) {
      console.error(`❌ Analysis failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Display a routing decision with appropriate detail level
   */
  private async displayRoutingDecision(decision: ModelRoutingDecision, verbose = false): Promise<void> {
    console.log('\\n✅ Routing Complete!');
    console.log('═'.repeat(50));

    console.log(`🎯 **Selected Model: ${decision.selectedModel.name}**`);
    console.log(`   Backend: ${decision.selectedModel.backend}`);
    console.log(`   Trust Score: ${decision.selectedModel.trustScore}/10`);
    console.log(`   RAM Required: ${decision.selectedModel.ramRequirement || 'Unknown'}`);
    console.log(`   Parameters: ${decision.selectedModel.parameters || 'Unknown'}`);

    console.log('\\n🤔 Reasoning:');
    console.log(`   ${decision.reasoning}`);

    if (decision.alternatives.length > 0) {
      console.log('\\n🔄 Top Alternatives:');
      decision.alternatives.forEach((alt, i) => {
        console.log(`   ${i + 1}. ${alt.name} (${alt.backend}) - Trust: ${alt.trustScore}/10`);
      });
    }

    console.log(`\\n⏱️  Processing Time: ${decision.totalDuration}ms`);

    if (verbose) {
      console.log('\\n📊 Detailed Metrics:');
      console.log(`   Models Discovered: ${decision.step1_consolidation.totalModels}`);
      console.log(`   Models After Filtering: ${decision.step2_filtering.remaining}`);
      console.log(`   Candidates Evaluated: ${decision.step3_selection.topCandidates.length}`);
      console.log(`   Routing Method: ${decision.step4_routing.routingMethod}`);

      console.log('\\n🏆 Score Breakdown (Top Model):');
      const topCandidate = decision.step3_selection.topCandidates[0];
      if (topCandidate) {
        Object.entries(topCandidate.breakdown).forEach(([factor, score]) => {
          console.log(`   ${factor}: ${score.toFixed(3)}`);
        });
        console.log(`   Total: ${topCandidate.score.toFixed(3)}`);
      }
    }

    console.log('\\n💡 Next Steps:');
    console.log(`   trust model switch ${decision.selectedModel.name}`);
    console.log(`   trust ${decision.selectedModel.backend === 'ollama' ? 'ollama' : 'huggingface'}`);
  }

  /**
   * Build routing configuration from command arguments
   */
  private buildRoutingConfig(args: RoutingCommandArgs): RoutingConfig {
    const config: RoutingConfig = {};

    if (args.task) {
      config.task = args.task;
    }

    if (args.ramLimit) {
      config.hardwareConstraints = {
        availableRAM: args.ramLimit,
      };
    }

    if (args.backends && args.backends.length > 0) {
      config.preferredBackends = args.backends as Array<'ollama' | 'huggingface' | 'cloud'>;
    }

    if (args.trustThreshold) {
      config.minimumTrustScore = args.trustThreshold;
    }

    // Set reasonable defaults
    config.allowFallback = true;
    config.maxCandidates = 5;

    return config;
  }

  /**
   * Build a command string from a routing recommendation
   */
  private buildCommandFromRecommendation(config: RoutingConfig): string {
    const parts = [];

    if (config.task) {
      parts.push(`--task ${config.task}`);
    }

    if (config.hardwareConstraints?.availableRAM) {
      parts.push(`--ram-limit ${config.hardwareConstraints.availableRAM}`);
    }

    if (config.preferredBackends && config.preferredBackends.length > 0) {
      parts.push(`--backends ${config.preferredBackends.join(',')}`);
    }

    if (config.minimumTrustScore) {
      parts.push(`--trust-threshold ${config.minimumTrustScore}`);
    }

    return parts.join(' ');
  }
}

export async function handleRoutingCommand(args: RoutingCommandArgs): Promise<void> {
  const handler = new RoutingCommandHandler();
  await handler.handleCommand(args);
}