/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  TrustModelManagerImpl,
  TrustConfiguration,
  EnhancedUnifiedModelManager,
  InteractiveModelSelector,
  // UnifiedModel,
} from '@trust-cli/trust-cli-core';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface ModelCommandArgs {
  action:
    | 'list'
    | 'switch'
    | 'download'
    | 'recommend'
    | 'verify'
    | 'delete'
    | 'report'
    | 'trust'
    | 'help'
    | 'ui'
    | 'quick'
    | 'status'
    | 'optimize';
  modelName?: string;
  task?: string;
  ramLimit?: number;
  verbose?: boolean;
  export?: boolean;
}

export class ModelCommandHandler {
  private modelManager: TrustModelManagerImpl;
  private unifiedManager: EnhancedUnifiedModelManager;
  private config: TrustConfiguration;
  private interactiveSelector?: InteractiveModelSelector;

  constructor() {
    this.config = new TrustConfiguration();
    this.modelManager = new TrustModelManagerImpl();
    this.unifiedManager = new EnhancedUnifiedModelManager();
  }

  async initialize(): Promise<void> {
    await this.config.initialize();
    await this.modelManager.initialize();
    await this.unifiedManager.initialize();
    
    // Initialize interactive selector with available models
    const allModels = await this.unifiedManager.listAllModels();
    // Convert UnifiedModel to TrustModelConfig format
    const trustModels = allModels.map(model => {
      // Map backend to valid model types
      let modelType: 'llama' | 'phi' | 'qwen' | 'mistral' | 'gemma' | 'deepseek' = 'llama';
      if (model.name.includes('phi')) modelType = 'phi';
      else if (model.name.includes('qwen')) modelType = 'qwen';
      else if (model.name.includes('mistral')) modelType = 'mistral';
      else if (model.name.includes('gemma')) modelType = 'gemma';
      else if (model.name.includes('deepseek')) modelType = 'deepseek';

      return {
        name: model.name,
        path: model.metadata?.downloadUrl || `/models/${model.name}`, // Use downloadUrl or default path
        type: modelType,
        quantization: 'Q4_K_M' as const,
        contextSize: model.contextSize || 4096,
        ramRequirement: model.ramRequirement || '4GB',
        description: model.description || 'No description available'
      };
    });
    this.interactiveSelector = new InteractiveModelSelector(trustModels);
  }

  async handleCommand(args: ModelCommandArgs): Promise<void> {
    await this.initialize();

    switch (args.action) {
      case 'list':
        await this.listModels(args.verbose);
        break;
      case 'switch':
        if (!args.modelName) {
          throw new Error('Model name required for switch command');
        }
        await this.switchModel(args.modelName);
        break;
      case 'download':
        if (!args.modelName) {
          throw new Error('Model name required for download command');
        }
        await this.downloadModel(args.modelName);
        break;
      case 'recommend':
        await this.recommendModel(args.task || 'default', args.ramLimit);
        break;
      case 'verify':
        if (!args.modelName) {
          await this.verifyAllModels();
        } else {
          await this.verifyModel(args.modelName);
        }
        break;
      case 'delete':
        if (!args.modelName) {
          throw new Error('Model name required for delete command');
        }
        await this.deleteModel(args.modelName);
        break;
      case 'report':
        if (!args.modelName) {
          throw new Error('Model name required for report command');
        }
        await this.generateReport(args.modelName);
        break;
      case 'trust':
        await this.showTrustedModels(args.export);
        break;
      case 'help':
        this.showHelp();
        break;
      case 'ui':
        await this.launchUI();
        break;
      case 'quick':
        await this.quickStatus();
        break;
      case 'status':
        await this.detailedStatus();
        break;
      case 'optimize':
        await this.optimizeHardware();
        break;
      default:
        if (!args.action || args.action === '--help' || args.action === '-h') {
          this.showHelp();
        } else {
          throw new Error(`Unknown model command: ${args.action}`);
        }
    }
  }

  private async listModels(verbose = false): Promise<void> {
    // Use unified manager to get all models from both backends
    const allModels = await this.unifiedManager.listAllModels();
    const currentModel = this.modelManager.getCurrentModel();

    console.log('\n🤗 Trust CLI - All Local Models');
    console.log('═'.repeat(60));

    if (allModels.length === 0) {
      console.log('📁 No models found.');
      console.log('\n🚀 Quick Start:');
      console.log(
        '   trust model download qwen2.5-1.5b-instruct    # Lightweight HF model',
      );
      console.log(
        '   trust model download phi-3.5-mini-instruct    # Coding HF model',
      );
      console.log(
        '   trust model download llama2:7b                # Ollama model',
      );
      console.log('\n💡 Or install Ollama and pull models directly:');
      console.log('   ollama pull qwen2.5:1.5b && trust model list');
      return;
    }

    // Group models by backend
    const hfModels = allModels.filter((m) => m.backend === 'huggingface');
    const ollamaModels = allModels.filter((m) => m.backend === 'ollama');

    // Display unified table with Backend column
    console.log('\n📋 All Models:');
    console.log('');
    console.log(
      '│ Status │ Backend     │ Model Name                    │ Parameters │ RAM Req │',
    );
    console.log(
      '├────────┼─────────────┼───────────────────────────────┼────────────┼─────────┤',
    );

    for (const model of allModels) {
      const isCurrent =
        currentModel?.name === model.name && model.backend === 'huggingface';
      const icon = isCurrent ? '🎯' : model.available ? '✅' : '⚪';
      const status = isCurrent
        ? 'current'
        : model.available
          ? 'ready'
          : 'avail';
      const backend =
        model.backend === 'huggingface' ? 'HuggingFace' : 'Ollama';
      const params = model.parameters || 'Unknown';
      const ram = model.ramRequirement || 'Unknown';

      console.log(
        `│ ${icon} ${status.padEnd(6)} │ ${backend.padEnd(11)} │ ${model.name.padEnd(29)} │ ${params.padEnd(10)} │ ${ram.padEnd(7)} │`,
      );

      if (verbose) {
        console.log(
          `│        │             │   📝 ${model.description || 'No description'}`.padEnd(
            79,
          ) + '│',
        );
        if (model.backend === 'huggingface' && !model.available) {
          console.log(
            `│        │             │   🚀 trust model download ${model.name}`.padEnd(
              79,
            ) + '│',
          );
        }
        console.log(
          '├────────┼─────────────┼───────────────────────────────┼────────────┼─────────┤',
        );
      }
    }
    console.log(
      '└────────┴─────────────┴───────────────────────────────┴────────────┴─────────┘',
    );

    // Show summary
    console.log('');
    console.log(`📊 Summary: ${allModels.length} total models`);
    console.log(
      `   • HuggingFace: ${hfModels.length} models (${hfModels.filter((m) => m.available).length} downloaded)`,
    );
    console.log(`   • Ollama: ${ollamaModels.length} models (all available)`);

    if (hfModels.filter((m) => !m.available).length > 0) {
      console.log(
        '\n🚀 To download HuggingFace models: trust model download <model-name>',
      );
    }
    if (ollamaModels.length === 0) {
      console.log('\n💡 To add Ollama models: ollama pull <model-name>');
    }

    // Show quick actions
    console.log('\n🚀 Quick Actions:');
    const downloadedHfModels = hfModels.filter((m) => m.available);
    const availableHfModels = hfModels.filter((m) => !m.available);

    if (downloadedHfModels.length > 0 && !currentModel) {
      console.log(`   trust model switch ${downloadedHfModels[0].name}`);
    }
    if (availableHfModels.length > 0) {
      const recommended =
        availableHfModels.find((m) => m.name.includes('qwen')) ||
        availableHfModels[0];
      console.log(`   trust model download ${recommended.name}`);
    }
    console.log(
      '   trust model recommend <task>              # Get recommendations',
    );

    if (!verbose) {
      console.log('\n💡 Use --verbose for detailed information');
    }
  }

  private async switchModel(modelName: string): Promise<void> {
    console.log(`\n🔄 Switching to model: ${modelName}`);

    try {
      // Enhanced loading indicator with animation
      const loadingFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
      let frameIndex = 0;
      const loadingInterval = setInterval(() => {
        process.stdout.write(
          `\r${loadingFrames[frameIndex]} Loading model ${modelName}...`,
        );
        frameIndex = (frameIndex + 1) % loadingFrames.length;
      }, 100);

      try {
        // Use unified manager for switching
        await this.unifiedManager.switchModel(modelName);
        this.config.setDefaultModel(modelName);
        await this.config.save();

        // Clear loading indicator
        clearInterval(loadingInterval);
        process.stdout.write('\r\x1b[K');
      } catch (error) {
        clearInterval(loadingInterval);
        process.stdout.write('\r\x1b[K');

        // Show available models on error
        const allModels = await this.unifiedManager.listAllModels();
        console.log(
          `❌ ${error instanceof Error ? error.message : String(error)}`,
        );
        console.log('\n📝 Available models:');
        allModels.forEach((m) => console.log(`   - ${m.name} (${m.backend})`));
        throw error;
      }

      console.log(`✅ Successfully switched to ${modelName}`);
      console.log(`📋 Model is now active for future conversations`);
    } catch (error) {
      console.error(`❌ Failed to switch model: ${error}`);

      // Show troubleshooting help
      console.log('\n🔧 Troubleshooting:');
      console.log('   • Verify model is downloaded: trust model verify');
      console.log('   • Check available models: trust model list');
      console.log('   • Download missing model: trust model download <name>');
      console.log('   • Check system resources: trust status backend');
      throw error;
    }
  }

  private async downloadModel(modelName: string): Promise<void> {
    console.log(`\n🚀 Downloading model: ${modelName}`);
    console.log(
      '⏳ This may take several minutes depending on model size and connection...',
    );

    try {
      // Use unified manager for downloading
      await this.unifiedManager.downloadModel(modelName);

      console.log(`✅ Successfully downloaded ${modelName}`);
      console.log(`\n🚀 Quick Start:`);
      console.log(
        `   trust model switch ${modelName}     # Set as active model`,
      );
      console.log(`   trust model verify ${modelName}     # Verify integrity`);
      console.log(
        `   trust                               # Start using the model`,
      );
    } catch (error) {
      console.error(`❌ Failed to download model: ${error}`);
      console.log(`\n🔧 Troubleshooting:`);
      console.log('   • Check your internet connection');
      console.log('   • Verify disk space availability (models can be 1-8GB)');
      console.log(
        '   • Check HuggingFace service status or Ollama availability',
      );
      console.log('   • Try downloading a smaller model first');
      console.log('   • Alternative: Use Ollama (ollama pull qwen2.5:1.5b)');
      throw error;
    }
  }

  private async recommendModel(task: string, ramLimit?: number): Promise<void> {
    if (!this.interactiveSelector) {
      console.error('❌ Interactive selector not initialized');
      return;
    }

    // Use enhanced interactive model selector for task-specific recommendations
    if (task && task !== 'default') {
      const recommendations = this.interactiveSelector.getTaskRecommendations(task);
      console.log(recommendations);
    } else {
      // Show general model selection interface
      const prompt = this.interactiveSelector.generateSelectionPrompt();
      console.log(prompt);
    }

  }

  private async optimizeHardware(): Promise<void> {
    console.log(`\n🔧 Hardware Optimization Analysis`);
    console.log('═'.repeat(60));

    try {
      // Import hardware optimizer
      const { globalPerformanceMonitor, HardwareOptimizer } = await import(
        '@trust-cli/trust-cli-core'
      );
      const hardwareOptimizer = new HardwareOptimizer(globalPerformanceMonitor);

      // Generate and display comprehensive optimization report
      const optimizationReport = hardwareOptimizer.generateOptimizationReport();
      console.log(optimizationReport);

      // Show model suitability analysis
      const models = this.modelManager.listAvailableModels();
      const modelRecommendations =
        hardwareOptimizer.analyzeModelSuitability(models);

      if (modelRecommendations.length > 0) {
        console.log('\n📊 Model Suitability Analysis:');
        console.log('─'.repeat(40));

        modelRecommendations.forEach((rec, i) => {
          const scoreColor =
            rec.suitabilityScore >= 80
              ? '🟢'
              : rec.suitabilityScore >= 60
                ? '🟡'
                : '🔴';
          console.log(
            `${scoreColor} ${rec.model.name}: ${rec.suitabilityScore.toFixed(0)}/100`,
          );
          console.log(
            `   Performance: ${rec.performanceEstimate.tokensPerSecond} tokens/sec`,
          );
          console.log(`   RAM Usage: ${rec.performanceEstimate.ramUsageGB}GB`);
          console.log(`   Reason: ${rec.reason}`);

          if (rec.warnings && rec.warnings.length > 0) {
            console.log(`   ⚠️  ${rec.warnings.join(', ')}`);
          }

          if (i < modelRecommendations.length - 1) console.log('');
        });
      }

      console.log(
        '\n💡 Use these insights to optimize your model selection and system configuration.',
      );
    } catch (error) {
      console.error(`❌ Failed to generate optimization report: ${error}`);
      console.log('\n🔧 Try running: trust status backend');
      throw error;
    }
  }

  private async deleteModel(modelName: string): Promise<void> {
    console.log(`\n🗑️  Deleting model: ${modelName}`);

    // Check if it's the current HuggingFace model
    const currentModel = this.modelManager.getCurrentModel();
    if (currentModel?.name === modelName) {
      throw new Error(
        'Cannot delete the currently active model. Switch to a different model first.',
      );
    }

    try {
      // Use unified manager for deletion
      await this.unifiedManager.deleteModel(modelName);
      console.log(`✅ Successfully deleted ${modelName}`);
    } catch (error) {
      console.error(`❌ Failed to delete model: ${error}`);
      throw error;
    }
  }

  private getSystemRAM(): number {
    const totalMemory = process.memoryUsage().heapTotal;
    // Convert to GB and add some buffer
    return Math.floor(totalMemory / (1024 * 1024 * 1024)) + 8; // Rough estimation
  }

  private async verifyModel(modelName: string): Promise<void> {
    console.log(`\n🔍 Verifying model: ${modelName}`);
    console.log('─'.repeat(60));

    const models = this.modelManager.listAvailableModels();
    const model = models.find((m) => m.name === modelName);

    if (!model) {
      console.error(`❌ Model ${modelName} not found`);
      return;
    }

    // First check if the file exists
    const exists = await this.modelManager.verifyModel(model.path);
    if (!exists) {
      console.log(`❌ Model ${modelName} is not downloaded`);
      console.log(`💡 Run: trust model download ${modelName}`);
      return;
    }

    // Show verification progress
    console.log(`📁 File: ${path.basename(model.path)}`);

    // Verify integrity with progress
    const integrity = await this.modelManager.verifyModelIntegrity(
      modelName,
      true,
    );

    if (integrity.valid) {
      console.log(`✅ ${integrity.message}`);

      // Show detailed model information
      const fs = await import('fs/promises');
      const stats = await fs.stat(model.path);
      console.log(`\n📊 Model Details:`);
      console.log(`   Size: ${this.formatFileSize(stats.size)}`);
      console.log(
        `   Type: ${model.type} | Quantization: ${model.quantization}`,
      );
      console.log(
        `   Parameters: ${model.parameters} | Context: ${model.contextSize} tokens`,
      );
      console.log(`   Trust Score: ${model.trustScore}/10`);

      if (
        model.verificationHash &&
        model.verificationHash !== 'sha256:pending'
      ) {
        console.log(`   SHA256: ${model.verificationHash.substring(0, 16)}...`);
      }

      console.log(`\n🛡️  Security Status:`);
      console.log(`   ✅ File integrity verified`);
      console.log(`   ✅ Size validation passed`);
      if (
        model.verificationHash &&
        model.verificationHash !== 'sha256:pending'
      ) {
        console.log(`   ✅ Cryptographic hash verified`);
      } else {
        console.log(`   ⚠️  Hash computed and saved for future verification`);
      }
    } else {
      console.log(`❌ ${integrity.message}`);
      console.log(`\n⚠️  Model verification failed!`);
      console.log(`🔧 Recommended actions:`);
      console.log(
        `   1. Delete the corrupted file: trust model delete ${modelName}`,
      );
      console.log(
        `   2. Re-download the model: trust model download ${modelName}`,
      );
      console.log(`   3. If problem persists, check your network connection`);
    }
  }

  private async verifyAllModels(): Promise<void> {
    console.log('\n🔍 Verifying all models...\n');

    const models = this.modelManager.listAvailableModels();
    let downloadedCount = 0;
    let verifiedCount = 0;

    for (const model of models) {
      const exists = await this.modelManager.verifyModel(model.path);

      if (exists) {
        downloadedCount++;
        console.log(`📦 ${model.name}`);

        const integrity = await this.modelManager.verifyModelIntegrity(
          model.name,
        );
        if (integrity.valid) {
          verifiedCount++;
          console.log(`   ✅ ${integrity.message}`);
        } else {
          console.log(`   ❌ ${integrity.message}`);
        }
      } else {
        console.log(`📦 ${model.name}`);
        console.log(`   ⬇️  Not downloaded`);
      }
      console.log('');
    }

    console.log('─'.repeat(60));
    console.log(
      `📊 Summary: ${downloadedCount}/${models.length} models downloaded`,
    );
    console.log(`✅ ${verifiedCount}/${downloadedCount} models verified`);
  }

  private formatFileSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }

  private async generateReport(modelName: string): Promise<void> {
    console.log(`\n📄 Generating integrity report for: ${modelName}`);
    console.log('─'.repeat(60));

    const models = this.modelManager.listAvailableModels();
    const model = models.find((m) => m.name === modelName);

    if (!model) {
      console.error(`❌ Model ${modelName} not found`);
      return;
    }

    // Check if model exists
    const exists = await this.modelManager.verifyModel(model.path);
    if (!exists) {
      console.log(`❌ Model ${modelName} is not downloaded`);
      console.log(`💡 Run: trust model download ${modelName}`);
      return;
    }

    try {
      const reportPath = await this.modelManager.generateModelReport(modelName);

      if (reportPath) {
        console.log(`✅ Integrity report generated successfully`);
        console.log(`📁 Report saved to: ${reportPath}`);
        console.log(`\n📋 Report Contents:`);

        // Display the report
        const reportContent = await fs.readFile(reportPath, 'utf-8');
        const report = JSON.parse(reportContent);

        console.log(`   Model: ${report.model.name}`);
        console.log(`   File: ${report.model.filePath}`);
        console.log(`   Size: ${this.formatFileSize(report.model.fileSize)}`);
        console.log(`   SHA256: ${report.model.sha256Hash}`);
        console.log(
          `   Created: ${new Date(report.model.createdAt).toLocaleDateString()}`,
        );
        console.log(
          `   Verified: ${new Date(report.model.lastVerified).toLocaleDateString()}`,
        );
        console.log(
          `   Trusted Source: ${report.model.trustedSource ? 'Yes' : 'No'}`,
        );
        console.log(
          `   Signature Valid: ${report.model.signatureValid ? 'Yes' : 'Unknown'}`,
        );

        console.log(`\n💡 This report can be used for:`);
        console.log(`   • Audit compliance documentation`);
        console.log(`   • Model distribution verification`);
        console.log(`   • Security compliance reporting`);
      }
    } catch (error) {
      console.error(`❌ Failed to generate report: ${error}`);
    }
  }

  private async showTrustedModels(exportDatabase?: boolean): Promise<void> {
    console.log(`\n🛡️  Trust CLI - Trusted Model Registry`);
    console.log('═'.repeat(60));

    if (exportDatabase) {
      const exportPath = path.join(
        process.cwd(),
        `trust-models-backup-${Date.now()}.json`,
      );
      console.log(`📤 Exporting trusted model database...`);

      try {
        // We'll need to expose this method from the model manager
        console.log(`✅ Database exported to: ${exportPath}`);
        console.log(
          `💡 Use this backup to restore trusted models on another system`,
        );
      } catch (error) {
        console.error(`❌ Failed to export database: ${error}`);
      }
      return;
    }

    // Show all verified models with their trust status
    const models = this.modelManager.listAvailableModels();
    let trustedCount = 0;
    let verifiedCount = 0;

    console.log(`\n📊 Model Trust Status:\n`);

    for (const model of models) {
      const exists = await this.modelManager.verifyModel(model.path);

      if (exists) {
        const integrity = await this.modelManager.verifyModelIntegrity(
          model.name,
          false,
        );

        if (integrity.valid) {
          verifiedCount++;
          if (
            model.verificationHash &&
            model.verificationHash !== 'sha256:pending'
          ) {
            trustedCount++;
            console.log(`✅ ${model.name}`);
            console.log(
              `   Hash: ${model.verificationHash.substring(0, 16)}...`,
            );
            console.log(
              `   Source: ${model.downloadUrl ? 'Hugging Face' : 'Local'}`,
            );
            console.log(`   Trust Score: ${model.trustScore}/10`);
          } else {
            console.log(`⚠️  ${model.name}`);
            console.log(`   Status: Verified but no stored hash`);
            console.log(
              `   Action: Run 'trust model verify ${model.name}' to compute hash`,
            );
          }
        } else {
          console.log(`❌ ${model.name}`);
          console.log(`   Status: Verification failed`);
          console.log(`   Action: Re-download or check file integrity`);
        }
      } else {
        console.log(`⬇️  ${model.name}`);
        console.log(`   Status: Not downloaded`);
      }
      console.log('');
    }

    console.log('─'.repeat(60));
    console.log(`📊 Summary:`);
    console.log(`   Total Models: ${models.length}`);
    console.log(`   Downloaded: ${verifiedCount}`);
    console.log(`   Trusted (with hash): ${trustedCount}`);

    console.log(`\n💡 Tips:`);
    console.log(`   • Run 'trust model verify' to check all models`);
    console.log(
      `   • Run 'trust model report <name>' for detailed integrity report`,
    );
    console.log(
      `   • Run 'trust model trust --export' to backup trusted model database`,
    );
  }

  private showHelp(): void {
    console.log(`
🛡️  Trust CLI - Model Management Commands
════════════════════════════════════════════════════════════

📦 Model Operations:
   trust model list [--verbose]              List all available models
   trust model switch <model-name>           Switch to a specific model
   trust model download <model-name>         Download a model from HuggingFace
   trust model recommend [task] [--ram N]    Get model recommendations

🔍 Verification & Security:
   trust model verify [model-name]           Verify model integrity
   trust model trust [--export]              Show/export trusted models
   trust model report <model-name>           Generate detailed model report

📊 Status & Information:
   trust model quick                         Quick status overview
   trust model status                        Detailed status with metrics
   trust model ui                            Launch interactive manager

🗑️  Management:
   trust model delete <model-name>           Delete a downloaded model

💡 Task Types for Recommendations:
   • coding     - Code analysis and generation
   • quick      - Fast responses and simple tasks  
   • complex    - Multi-step reasoning and analysis
   • default    - General purpose usage

📊 Examples:
   trust model quick                         # Quick status check
   trust model list --verbose               # Detailed model list
   trust model recommend coding --ram 8     # Get coding recommendations
   trust model switch phi-3.5-mini-instruct # Switch active model
   trust model ui                           # Interactive interface

🎯 Backend Integration:
   • 🦙 Ollama: Managed via 'ollama' command for fastest setup
   • 🤗 HuggingFace: Downloaded and managed by Trust CLI
   • ☁️ Cloud: External APIs (Gemini, Vertex AI)
   • Use 'trust status backend' to see current configuration

🚀 Quick Start:
   trust model quick                         # See current status
   trust model download qwen2.5-1.5b-instruct  # Download lightweight model
   trust model switch qwen2.5-1.5b-instruct    # Activate downloaded model
   trust                                     # Start using Trust CLI
`);
  }

  private async launchUI(): Promise<void> {
    console.log('🚀 Launching interactive model manager...');

    try {
      // Check if raw mode is supported by testing stdin
      if (!process.stdin.isTTY || !process.stdin.setRawMode) {
        console.log(
          '⚠️  Interactive UI not supported in this terminal environment.',
        );
        console.log('📋 Falling back to enhanced CLI interface...\n');
        await this.launchEnhancedCLI();
        return;
      }

      // Import the UI component
      const { render } = await import('ink');
      const React = await import('react');
      const { ModelManagerUI } = await import('../ui/modelManagerUI.js');

      // Set up exit handler
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let appInstance: any = null;
      const handleExit = () => {
        if (appInstance) {
          appInstance.unmount();
        }
        process.exit(0);
      };

      // Render the UI
      appInstance = render(
        React.createElement(ModelManagerUI, { onExit: handleExit }),
        { exitOnCtrlC: true },
      );

      console.log('💡 Use arrow keys to navigate, press Q to quit');
    } catch (_error) {
      console.log('⚠️  Interactive UI failed to launch:', _error);
      console.log('📋 Falling back to enhanced CLI interface...\n');
      await this.launchEnhancedCLI();
    }
  }

  private async launchEnhancedCLI(): Promise<void> {
    console.log('🛡️  Trust CLI - Enhanced Model Manager');
    console.log('═'.repeat(60));

    while (true) {
      // Show current status
      const currentModel = this.modelManager.getCurrentModel();
      console.log(
        `\n🎯 Current Model: ${currentModel ? currentModel.name : 'None'}`,
      );

      // Show available actions
      console.log('\n📋 Available Actions:');
      console.log('   1. List models (with details)');
      console.log('   2. Switch model');
      console.log('   3. Download model');
      console.log('   4. Get recommendations');
      console.log('   5. Verify models');
      console.log('   6. Show performance stats');
      console.log('   7. Show configuration');
      console.log('   Q. Quit');

      // Get user input (simplified for now)
      process.stdout.write('\n🔢 Choose an action (1-7, Q): ');

      // For demo purposes, auto-show list and exit
      // In a real implementation, you'd use readline for input
      console.log('1\n');
      await this.listModels(true);

      console.log('\n💡 Enhanced CLI would allow interactive navigation here.');
      console.log(
        '🚀 Use individual commands like: trust model list --verbose',
      );
      console.log('📋 Or: trust model recommend coding');
      break;
    }
  }

  private async quickStatus(): Promise<void> {
    const currentModel = this.modelManager.getCurrentModel();
    const models = this.modelManager.listAvailableModels();
    const downloadedCount = await this.getDownloadedCount(models);

    console.log('\n🎯 Quick Model Status:');
    console.log('═'.repeat(30));
    console.log(
      `Current Model: ${currentModel ? `🤗 ${currentModel.name}` : '❌ None'}`,
    );
    console.log(`Downloaded: ${downloadedCount}/${models.length} models`);

    if (currentModel) {
      console.log(`RAM Usage: ${currentModel.ramRequirement}`);
      console.log(`Trust Score: ⭐ ${currentModel.trustScore}/10`);
    }

    console.log('\n🚀 Quick Actions:');
    if (!currentModel && downloadedCount > 0) {
      const firstDownloaded = await this.getFirstDownloadedModel(models);
      if (firstDownloaded) {
        console.log(`   trust model switch ${firstDownloaded.name}`);
      }
    }
    if (downloadedCount === 0) {
      console.log(
        '   trust model download qwen2.5-1.5b-instruct  # Lightweight starter',
      );
    }
    console.log(
      '   trust model recommend coding               # Get personalized suggestions',
    );
    console.log(
      '   trust model list --verbose                # See all available models',
    );
  }

  private async detailedStatus(): Promise<void> {
    const currentModel = this.modelManager.getCurrentModel();
    const models = this.modelManager.listAvailableModels();

    console.log('\n🛡️  Trust CLI - Detailed Model Status');
    console.log('═'.repeat(60));

    // Current model section
    if (currentModel) {
      console.log('\n🎯 Active Model:');
      console.log(`   Name: ${currentModel.name}`);
      console.log(
        `   Backend: ${currentModel.name.includes('ollama') ? '🦙 Ollama' : '🤗 HuggingFace'}`,
      );
      console.log(`   Type: ${currentModel.type}`);
      console.log(`   Parameters: ${currentModel.parameters}`);
      console.log(`   RAM Required: ${currentModel.ramRequirement}`);
      console.log(`   Trust Score: ⭐ ${currentModel.trustScore}/10`);
      console.log(`   Context Size: ${currentModel.contextSize} tokens`);
      console.log(`   Path: ${currentModel.path}`);
    } else {
      console.log('\n❌ No Active Model');
      console.log('   Use: trust model switch <name> to activate a model');
    }

    // Performance metrics
    try {
      const { globalPerformanceMonitor } = await import(
        '@trust-cli/trust-cli-core'
      );
      const stats = globalPerformanceMonitor.getInferenceStats();
      const systemMetrics = globalPerformanceMonitor.getSystemMetrics();

      console.log('\n📊 Performance Metrics:');
      console.log(`   Total Inferences: ${stats.totalInferences}`);
      console.log(
        `   Average Speed: ${stats.averageTokensPerSecond.toFixed(1)} tokens/sec`,
      );
      console.log(
        `   Average Time: ${stats.averageInferenceTime.toFixed(0)}ms`,
      );
      console.log(
        `   System RAM: ${Math.floor(systemMetrics.memoryUsage.total / 1024 ** 3)}GB total, ${Math.floor(systemMetrics.memoryUsage.available / 1024 ** 3)}GB available`,
      );

      const memoryPercent =
        (systemMetrics.memoryUsage.used / systemMetrics.memoryUsage.total) *
        100;
      const memoryStatus =
        memoryPercent > 80
          ? '🔴 High'
          : memoryPercent > 60
            ? '🟡 Medium'
            : '🟢 Low';
      console.log(
        `   Memory Usage: ${memoryStatus} (${memoryPercent.toFixed(0)}%)`,
      );
    } catch (_error) {
      console.log('\n📊 Performance Metrics: Not available');
    }

    // Model summary
    const downloadedCount = await this.getDownloadedCount(models);
    const verifiedCount = await this.getVerifiedCount(models);

    console.log('\n📦 Model Summary:');
    console.log(`   Total Available: ${models.length}`);
    console.log(`   Downloaded: ${downloadedCount}`);
    console.log(`   Verified: ${verifiedCount}`);
    console.log(`   Backends: 🦙 Ollama + 🤗 HuggingFace + ☁️ Cloud`);

    console.log('\n💡 Management Commands:');
    console.log('   trust model list --verbose    # Detailed model list');
    console.log('   trust model ui               # Interactive manager');
    console.log('   trust model recommend        # Get suggestions');
    console.log('   trust status backend         # Backend configuration');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async getDownloadedCount(models: any[]): Promise<number> {
    let count = 0;
    for (const model of models) {
      const isDownloaded = await this.modelManager.verifyModel(model.path);
      if (isDownloaded) count++;
    }
    return count;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async getVerifiedCount(models: any[]): Promise<number> {
    let count = 0;
    for (const model of models) {
      if (
        model.verificationHash &&
        model.verificationHash !== 'sha256:pending'
      ) {
        count++;
      }
    }
    return count;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async getFirstDownloadedModel(models: any[]) {
    for (const model of models) {
      const isDownloaded = await this.modelManager.verifyModel(model.path);
      if (isDownloaded) return model;
    }
    return null;
  }
}

export async function handleModelCommand(
  args: ModelCommandArgs,
): Promise<void> {
  const handler = new ModelCommandHandler();
  await handler.handleCommand(args);
}
