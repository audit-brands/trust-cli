/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ModelSelector, TaskContext, ModelRecommendation } from './modelSelector.js';
import { TrustModelConfig } from './types.js';

/**
 * Interactive model selection interface
 */
export class InteractiveModelSelector {
  private modelSelector: ModelSelector;
  private availableModels: TrustModelConfig[];

  constructor(models: TrustModelConfig[]) {
    this.availableModels = models;
    this.modelSelector = new ModelSelector(models);
  }

  /**
   * Generate a formatted model selection prompt for CLI display
   */
  generateSelectionPrompt(context?: TaskContext): string {
    let prompt = '\n🤖 Available AI Models:\n';
    prompt += '═'.repeat(50) + '\n\n';

    if (context) {
      const recommendations = this.modelSelector.getRecommendations(context);
      prompt += this.formatRecommendations(recommendations, context);
    } else {
      prompt += this.formatAllModels();
    }

    prompt += '\n📝 Model Selection Commands:\n';
    prompt += '  trust model switch <model-name>    - Switch to specific model\n';
    prompt += '  trust model recommend <task-type>  - Get recommendations\n';
    prompt += '  trust model list --verbose         - Detailed model info\n';
    prompt += '\n💡 Task types: coding, chat, analysis, writing, tools, general\n';

    return prompt;
  }

  /**
   * Format model recommendations with scoring and explanations
   */
  private formatRecommendations(recommendations: ModelRecommendation[], context: TaskContext): string {
    let output = `🎯 Recommendations for ${context.type} tasks (${context.complexity} complexity):\n\n`;

    const topRecommendations = recommendations.slice(0, 5); // Show top 5
    
    for (let i = 0; i < topRecommendations.length; i++) {
      const rec = topRecommendations[i];
      const model = rec.model;
      
      // Suitability emoji
      const suitabilityEmoji = this.getSuitabilityEmoji(rec.suitability);
      
      // Rank emoji
      const rankEmoji = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'][i];
      
      output += `${rankEmoji} ${suitabilityEmoji} ${model.name}\n`;
      output += `   📊 Score: ${Math.round(rec.score)}/100  `;
      output += `💾 RAM: ${model.ramRequirement}  `;
      output += `⚙️  Params: ${this.getParameterDisplay(model)}\n`;
      output += `   💭 ${rec.reasoning}\n`;
      
      if (rec.tradeoffs && rec.tradeoffs.length > 0) {
        output += `   ⚠️  Tradeoffs: ${rec.tradeoffs.join(', ')}\n`;
      }
      output += '\n';
    }

    const best = topRecommendations[0];
    if (best) {
      output += `🚀 Quick switch: trust model switch ${best.model.name}\n\n`;
    }

    return output;
  }

  /**
   * Format all available models in a simple list
   */
  private formatAllModels(): string {
    let output = '';
    
    // Group models by backend
    const backends = new Map<string, TrustModelConfig[]>();
    for (const model of this.availableModels) {
      const backend = model.type || 'unknown';
      if (!backends.has(backend)) {
        backends.set(backend, []);
      }
      backends.get(backend)!.push(model);
    }

    for (const [backend, models] of backends) {
      output += `📦 ${backend.toUpperCase()} Models:\n`;
      
      models.forEach(model => {
        const status = this.getModelStatus(model);
        output += `  ${status} ${model.name}`;
        output += ` (${this.getParameterDisplay(model)}, ${model.ramRequirement})\n`;
        if (model.description && model.description !== 'Unknown model') {
          output += `      ${model.description}\n`;
        }
      });
      output += '\n';
    }

    return output;
  }

  /**
   * Get emoji for suitability level
   */
  private getSuitabilityEmoji(suitability: string): string {
    switch (suitability) {
      case 'excellent': return '🌟';
      case 'good': return '✅';
      case 'fair': return '⚡';
      case 'poor': return '⚠️';
      default: return '❓';
    }
  }

  /**
   * Get model status emoji
   */
  private getModelStatus(model: TrustModelConfig): string {
    // This would be determined by actual model availability
    return '✅'; // Assume all models are ready for now
  }

  /**
   * Get formatted parameter count display
   */
  private getParameterDisplay(model: TrustModelConfig): string {
    const name = model.name.toLowerCase();
    
    if (name.includes('1.5b')) return '1.5B';
    if (name.includes('3b')) return '3B';
    if (name.includes('3.8b')) return '3.8B';
    if (name.includes('7b')) return '7B';
    if (name.includes('8b')) return '8B';
    if (name.includes('12b')) return '12B';
    
    if (name.includes('mini')) return '3.8B';
    if (name.includes('small')) return '1.5B';
    
    return 'Unknown';
  }

  /**
   * Generate task-specific recommendations
   */
  getTaskRecommendations(taskType: string, complexity: string = 'moderate'): string {
    const context: TaskContext = {
      type: taskType as any,
      complexity: complexity as any,
      requiresTools: taskType === 'tools' || taskType === 'coding',
      preferLocal: true
    };

    const recommendations = this.modelSelector.getRecommendations(context);
    return this.formatRecommendations(recommendations, context);
  }

  /**
   * Get quick model comparison
   */
  generateModelComparison(modelNames: string[]): string {
    const models = this.availableModels.filter(m => 
      modelNames.some(name => m.name.includes(name))
    );

    if (models.length === 0) {
      return '❌ No models found matching the given names.\n';
    }

    let output = '\n📊 Model Comparison:\n';
    output += '═'.repeat(60) + '\n\n';

    // Create comparison table
    const headers = ['Model', 'Parameters', 'RAM', 'Best For', 'Speed'];
    const rows: string[][] = [];

    models.forEach(model => {
      const bestFor = this.getBestUseCase(model);
      const speed = this.getSpeedRating(model);
      
      rows.push([
        model.name,
        this.getParameterDisplay(model),
        model.ramRequirement,
        bestFor,
        speed
      ]);
    });

    // Format as table
    const colWidths = headers.map((header, i) => 
      Math.max(header.length, ...rows.map(row => row[i].length))
    );

    // Header row
    output += '│ ' + headers.map((header, i) => 
      header.padEnd(colWidths[i])
    ).join(' │ ') + ' │\n';
    
    output += '├' + colWidths.map(width => '─'.repeat(width + 2)).join('┼') + '┤\n';

    // Data rows
    rows.forEach(row => {
      output += '│ ' + row.map((cell, i) => 
        cell.padEnd(colWidths[i])
      ).join(' │ ') + ' │\n';
    });

    output += '└' + colWidths.map(width => '─'.repeat(width + 2)).join('┴') + '┘\n';

    return output;
  }

  /**
   * Determine best use case for a model
   */
  private getBestUseCase(model: TrustModelConfig): string {
    const name = model.name.toLowerCase();
    
    if (name.includes('deepseek')) return 'Coding';
    if (name.includes('qwen')) return 'Analysis';
    if (name.includes('phi')) return 'Chat';
    if (name.includes('llama')) return 'Tools';
    if (name.includes('gemma')) return 'General';
    
    return 'General';
  }

  /**
   * Get speed rating for a model
   */
  private getSpeedRating(model: TrustModelConfig): string {
    const name = model.name.toLowerCase();
    
    if (name.includes('1.5b') || name.includes('mini')) return 'Fast ⚡⚡⚡';
    if (name.includes('3b')) return 'Good ⚡⚡';
    if (name.includes('7b') || name.includes('8b')) return 'Moderate ⚡';
    if (name.includes('12b')) return 'Slow 🐌';
    
    return 'Unknown';
  }

  /**
   * Generate help text for model selection
   */
  generateHelpText(): string {
    return `
🤖 Trust CLI Model Selection Help
═══════════════════════════════════

📋 Available Commands:
  trust model list                    - Show all available models
  trust model list --verbose         - Detailed model information
  trust model switch <name>           - Switch to a specific model
  trust model recommend <task>        - Get task-specific recommendations
  trust model compare <name1> <name2> - Compare specific models
  trust model current                 - Show currently active model

🎯 Task Types for Recommendations:
  coding     - Code generation, debugging, refactoring
  chat       - General conversation and Q&A
  analysis   - Data analysis, research, reasoning
  writing    - Content creation, documentation
  tools      - Function calling, API interactions
  general    - Mixed-use scenarios

⚙️  Model Selection Factors:
  📊 Performance - Task-specific capabilities
  💾 Memory     - RAM requirements for your system
  ⚡ Speed      - Inference latency and responsiveness
  🔧 Tools      - Function calling reliability
  📏 Context    - Maximum conversation length

💡 Pro Tips:
  • Use 'trust model recommend coding' for development tasks
  • Smaller models (1.5B-3B) are faster but less capable
  • Larger models (7B+) are more capable but slower
  • Models with 'instruct' in the name follow instructions better
  • Use 'trust model switch' to test different models quickly

🔄 Quick Switches:
  trust model switch qwen2.5-1.5b-instruct  # Fast, good for simple tasks
  trust model switch llama-3.2-3b-instruct  # Balanced, excellent tool use
  trust model switch deepseek-r1-distill-7b # Best for coding tasks
`;
  }
}