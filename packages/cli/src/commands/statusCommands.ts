/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { TrustConfiguration } from '@trust-cli/trust-cli-core';

export interface StatusCommandArgs {
  action: 'show' | 'backend' | 'model' | 'all';
  verbose?: boolean;
}

export class StatusCommandHandler {
  private trustConfig: TrustConfiguration;

  constructor() {
    this.trustConfig = new TrustConfiguration();
  }

  async handleCommand(args: StatusCommandArgs): Promise<void> {
    await this.trustConfig.initialize();

    switch (args.action) {
      case 'show':
      case 'all':
        await this.showStatus(args.verbose);
        break;
      case 'backend':
        await this.showBackendStatus(args.verbose);
        break;
      case 'model':
        await this.showModelStatus(args.verbose);
        break;
      default:
        throw new Error(`Unknown status action: ${args.action}`);
    }
  }

  private async showStatus(verbose = false): Promise<void> {
    console.log('\n🛡️  Trust CLI - Status Overview');
    console.log('═'.repeat(50));

    await this.showBackendStatus(verbose);
    await this.showModelStatus(verbose);
    
    if (verbose) {
      await this.showConfigurationStatus();
    }
  }

  private async showBackendStatus(verbose = false): Promise<void> {
    console.log('\n🚀 AI Backend Status:');
    
    const fallbackOrder = this.trustConfig.getFallbackOrder();
    const isFallbackEnabled = this.trustConfig.isFallbackEnabled();
    
    console.log(`   Fallback Order: ${fallbackOrder.join(' → ')}`);
    console.log(`   Fallback Enabled: ${isFallbackEnabled ? '✅' : '❌'}`);
    
    console.log('\n📊 Backend Availability:');
    
    // Check Ollama status
    const ollamaConfig = this.trustConfig.getOllamaConfig();
    const ollamaEnabled = this.trustConfig.isBackendEnabled('ollama');
    console.log(`   🦙 Ollama: ${ollamaEnabled ? '✅ Enabled' : '❌ Disabled'}`);
    if (verbose && ollamaEnabled) {
      console.log(`      Model: ${ollamaConfig.defaultModel}`);
      console.log(`      URL: ${ollamaConfig.baseUrl}`);
    }
    
    // Check HuggingFace status
    try {
      const huggingfaceConfig = this.trustConfig.getHuggingFaceConfig();
      const huggingfaceEnabled = this.trustConfig.isBackendEnabled('huggingface');
      console.log(`   🤗 HuggingFace: ${huggingfaceEnabled ? '✅ Enabled' : '❌ Disabled'}`);
      if (verbose && huggingfaceEnabled) {
        console.log(`      GBNF Functions: ${huggingfaceConfig?.gbnfFunctions ? '✅' : '❌'}`);
      }
    } catch (error) {
      console.log(`   🤗 HuggingFace: ⚠️  Configuration error`);
    }
    
    // Check Cloud status
    try {
      const cloudConfig = this.trustConfig.getCloudConfig();
      const cloudEnabled = this.trustConfig.isBackendEnabled('cloud');
      console.log(`   ☁️  Cloud: ${cloudEnabled ? '✅ Enabled' : '❌ Disabled'}`);
      if (verbose && cloudEnabled) {
        console.log(`      Provider: ${cloudConfig?.provider || 'not set'}`);
      }
    } catch (error) {
      console.log(`   ☁️  Cloud: ⚠️  Configuration error`);
    }
    
    console.log('\n🎯 Attribution:');
    console.log('   • Ollama: Local AI inference via Ollama');
    console.log('   • HuggingFace: Local GGUF models from HuggingFace');
    console.log('   • Cloud: Public cloud AI services');
  }

  private async showModelStatus(verbose = false): Promise<void> {
    console.log('\n📦 Model Status:');
    
    const defaultModel = this.trustConfig.getDefaultModel();
    const modelsDirectory = this.trustConfig.getModelsDirectory();
    const config = this.trustConfig.get();
    
    console.log(`   Default Model: ${defaultModel}`);
    console.log(`   Models Directory: ${modelsDirectory}`);
    console.log(`   Auto Verify: ${config.models.autoVerify ? '✅' : '❌'}`);
    
    if (verbose) {
      console.log(`   Model Verification: ${config.privacy.modelVerification ? '✅' : '❌'}`);
    }
  }

  private async showConfigurationStatus(): Promise<void> {
    console.log('\n🔧 Configuration:');
    
    const config = this.trustConfig.get();
    console.log(`   Privacy Mode: ${config.privacy.privacyMode}`);
    console.log(`   Audit Logging: ${config.privacy.auditLogging ? '✅' : '❌'}`);
    console.log(`   Show Model Info: ${config.transparency.showModelInfo ? '✅' : '❌'}`);
    console.log(`   Show Performance Metrics: ${config.transparency.showPerformanceMetrics ? '✅' : '❌'}`);
  }
}

export async function handleStatusCommand(args: StatusCommandArgs): Promise<void> {
  const handler = new StatusCommandHandler();
  await handler.handleCommand(args);
}