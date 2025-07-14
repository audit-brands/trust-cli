/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ProviderConfigManager, ProviderConfig } from '@trust-cli/trust-cli-core';

export interface ProviderCommandArgs {
  action: 'list' | 'detect' | 'set' | 'enable' | 'disable' | 'test' | 'reset' | 'status' | 'help';
  providerId?: string;
  priority?: number;
  verbose?: boolean;
}

export class ProviderCommandHandler {
  private configManager: ProviderConfigManager;

  constructor() {
    this.configManager = new ProviderConfigManager();
  }

  async handleCommand(args: ProviderCommandArgs): Promise<void> {
    await this.configManager.initialize();

    switch (args.action) {
      case 'list':
        await this.listProviders(args.verbose);
        break;
      case 'detect':
        await this.runDetection();
        break;
      case 'set':
        if (!args.providerId) {
          throw new Error('Provider ID required for set command');
        }
        await this.setDefaultProvider(args.providerId);
        break;
      case 'enable':
        if (!args.providerId) {
          throw new Error('Provider ID required for enable command');
        }
        await this.setProviderEnabled(args.providerId, true);
        break;
      case 'disable':
        if (!args.providerId) {
          throw new Error('Provider ID required for disable command');
        }
        await this.setProviderEnabled(args.providerId, false);
        break;
      case 'test':
        await this.testProviders(args.providerId);
        break;
      case 'reset':
        await this.resetConfiguration();
        break;
      case 'status':
        await this.showStatus();
        break;
      case 'help':
        this.showHelp();
        break;
      default:
        this.showHelp();
    }
  }

  private async listProviders(verbose: boolean = false): Promise<void> {
    const enabledProviders = this.configManager.getEnabledProviders();
    let allProviders: ProviderConfig[];
    
    if (enabledProviders.length === 0) {
      // If no providers configured, run auto-detection and convert to ProviderConfig format
      const detectionResult = await this.configManager.runAutoDetection();
      // Now get the configured providers after detection
      allProviders = this.configManager.getEnabledProviders();
      
      // If still empty, it means no providers were detected
      if (allProviders.length === 0) {
        console.log('\n🛡️  Trust CLI - Available Providers');
        console.log('═'.repeat(60));
        console.log('❌ No providers detected.');
        console.log('\n🚀 Quick Setup:');
        console.log('   curl -fsSL https://ollama.ai/install.sh | sh  # Install Ollama');
        console.log('   export GEMINI_API_KEY=your_key_here         # Configure Gemini');
        console.log('   trust provider detect                       # Re-run detection');
        return;
      }
    } else {
      allProviders = enabledProviders;
    }

    console.log('\n🛡️  Trust CLI - Available Providers');
    console.log('═'.repeat(60));

    const defaultProvider = this.configManager.getDefaultProvider();

    // Display providers table
    console.log('\n📋 Provider Status:');
    console.log('');
    console.log('│ Status │ Default │ Provider     │ Type    │ Priority │ Health │');
    console.log('├────────┼─────────┼──────────────┼─────────┼──────────┼────────┤');

    for (const provider of allProviders) {
      const isDefault = defaultProvider?.id === provider.id;
      const statusIcon = provider.enabled ? '✅' : '⚪';
      const defaultIcon = isDefault ? '🎯' : '  ';
      const healthIcon = this.getHealthIcon(provider.healthStatus);
      
      console.log(
        `│ ${statusIcon}      │ ${defaultIcon}      │ ${provider.name.padEnd(12)} │ ${provider.type.padEnd(7)} │ ${provider.priority.toString().padEnd(8)} │ ${healthIcon}      │`
      );

      if (verbose) {
        if (provider.configuration?.version) {
          console.log(`│        │         │   Version: ${provider.configuration.version.padEnd(21)} │         │          │        │`);
        }
        if (provider.configuration?.modelCount !== undefined) {
          console.log(`│        │         │   Models: ${provider.configuration.modelCount.toString().padEnd(22)} │         │          │        │`);
        }
        if (provider.configuration?.endpoint) {
          console.log(`│        │         │   Endpoint: ${provider.configuration.endpoint.substring(0, 20).padEnd(20)} │         │          │        │`);
        }
        if (provider.configuration?.requirements?.length > 0) {
          const reqs = provider.configuration.requirements.join(', ').substring(0, 20);
          console.log(`│        │         │   Needs: ${reqs.padEnd(23)} │         │          │        │`);
        }
        console.log('├────────┼─────────┼──────────────┼─────────┼──────────┼────────┤');
      }
    }

    console.log('└────────┴─────────┴──────────────┴─────────┴──────────┴────────┘');

    // Summary
    const enabledCount = allProviders.filter(p => p.enabled).length;
    const healthyCount = allProviders.filter(p => p.healthStatus === 'healthy').length;

    console.log(`\n📊 Summary: ${enabledCount}/${allProviders.length} providers enabled`);
    console.log(`   • Healthy: ${healthyCount}`);
    console.log(`   • Default: ${defaultProvider?.name || 'None'}`);

    // Type breakdown
    const typeGroups = allProviders.reduce((acc, p) => {
      acc[p.type] = (acc[p.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    console.log('   • Types:');
    Object.entries(typeGroups).forEach(([type, count]) => {
      const icon = type === 'local' ? '🏠' : type === 'cloud' ? '☁️' : '🔄';
      console.log(`     ${icon} ${type}: ${count}`);
    });

    // Quick actions
    console.log('\n🚀 Quick Actions:');
    if (!defaultProvider) {
      const firstHealthy = allProviders.find(p => p.enabled && p.healthStatus === 'healthy');
      if (firstHealthy) {
        console.log(`   trust provider set ${firstHealthy.id}     # Set default provider`);
      }
    }

    const unhealthy = allProviders.filter(p => p.healthStatus !== 'healthy');
    if (unhealthy.length > 0) {
      console.log('   trust provider test              # Test provider connectivity');
      console.log('   trust provider detect           # Re-run auto-detection');
    }

    if (!verbose) {
      console.log('\n💡 Use --verbose for detailed information');
    }
  }

  private async runDetection(): Promise<void> {
    console.log('\n🔍 Running comprehensive provider auto-detection...');
    console.log('═'.repeat(60));

    const result = await this.configManager.runAutoDetection();

    // Show detection results
    console.log(`\n✅ Detection completed`);
    console.log(`   • Found: ${result.providers.length} total providers`);
    console.log(`   • Available: ${result.providers.filter(p => p.available).length} providers`);
    console.log(`   • Recommended: ${result.recommended.join(', ') || 'None'}`);

    // Show warnings
    if (result.warnings.length > 0) {
      console.log('\n⚠️  Warnings:');
      result.warnings.forEach(warning => {
        console.log(`   • ${warning}`);
      });
    }

    // Show quick start suggestions
    if (result.quickStart.length > 0) {
      console.log('\n🚀 Quick Start Suggestions:');
      result.quickStart.forEach(suggestion => {
        console.log(`   • ${suggestion}`);
      });
    }

    // Show new/updated providers
    const available = result.providers.filter(p => p.available);
    if (available.length > 0) {
      console.log('\n📋 Available Providers:');
      available.forEach(provider => {
        const healthIcon = this.getHealthIcon(
          provider.healthScore && provider.healthScore >= 80 ? 'healthy' :
          provider.healthScore && provider.healthScore >= 50 ? 'degraded' : 'unavailable'
        );
        console.log(`   ${healthIcon} ${provider.name} (${provider.type})`);
        if (provider.modelCount) {
          console.log(`     Models: ${provider.modelCount}`);
        }
      });
    }

    console.log('\n💡 Use "trust provider list" to see detailed status');
  }

  private async setDefaultProvider(providerId: string): Promise<void> {
    try {
      await this.configManager.setDefaultProvider(providerId);
      const provider = this.configManager.getProviderConfig(providerId);
      
      console.log(`\n✅ Default provider set to: ${provider?.name}`);
      console.log(`   Type: ${provider?.type}`);
      console.log(`   Status: ${this.getHealthIcon(provider?.healthStatus)} ${provider?.healthStatus}`);
      
      console.log('\n🚀 Quick Test:');
      console.log(`   trust provider test ${providerId}    # Test connectivity`);
      console.log('   trust model list                    # See available models');
      
    } catch (error) {
      console.error(`❌ Failed to set default provider: ${error}`);
      console.log('\n💡 Available providers:');
      const providers = this.configManager.getEnabledProviders();
      providers.forEach(p => {
        console.log(`   • ${p.id} (${p.name})`);
      });
    }
  }

  private async setProviderEnabled(providerId: string, enabled: boolean): Promise<void> {
    try {
      await this.configManager.setProviderEnabled(providerId, enabled);
      const provider = this.configManager.getProviderConfig(providerId);
      
      const action = enabled ? 'enabled' : 'disabled';
      console.log(`\n✅ Provider ${provider?.name} ${action}`);
      
      if (!enabled) {
        const defaultProvider = this.configManager.getDefaultProvider();
        if (defaultProvider) {
          console.log(`   New default: ${defaultProvider.name}`);
        } else {
          console.log('   ⚠️  No default provider available');
        }
      }
      
    } catch (error) {
      console.error(`❌ Failed to ${enabled ? 'enable' : 'disable'} provider: ${error}`);
    }
  }

  private async testProviders(providerId?: string): Promise<void> {
    console.log('\n🧪 Testing provider connectivity...');
    console.log('═'.repeat(50));

    const results = await this.configManager.testAllProviders();
    
    let testedCount = 0;
    let successCount = 0;

    for (const [id, result] of results.entries()) {
      if (providerId && id !== providerId) continue;
      
      const provider = this.configManager.getProviderConfig(id);
      if (!provider) continue;

      testedCount++;
      
      const statusIcon = result.success ? '✅' : '❌';
      console.log(`\n${statusIcon} ${provider.name}`);
      
      if (result.success) {
        successCount++;
        console.log(`   Status: Connected`);
        if (result.latency) {
          console.log(`   Latency: ${result.latency}ms`);
        }
      } else {
        console.log(`   Status: Failed`);
        console.log(`   Error: ${result.error}`);
        
        // Provide troubleshooting suggestions
        if (provider.type === 'local') {
          console.log(`   💡 Try: Ensure ${provider.name} service is running`);
        } else if (provider.type === 'cloud') {
          console.log(`   💡 Try: Check API key configuration`);
        }
      }
    }

    console.log('\n─'.repeat(50));
    console.log(`📊 Test Results: ${successCount}/${testedCount} providers passed`);
    
    if (successCount === 0) {
      console.log('\n🔧 Troubleshooting:');
      console.log('   • Run: trust provider detect     # Re-detect providers');
      console.log('   • Check: Service status and API keys');
      console.log('   • Install: Missing dependencies');
    }
  }

  private async resetConfiguration(): Promise<void> {
    console.log('\n🔄 Resetting provider configuration...');
    
    try {
      await this.configManager.resetConfiguration();
      console.log('✅ Configuration reset successfully');
      console.log('🔍 Auto-detection completed');
      
      const defaultProvider = this.configManager.getDefaultProvider();
      if (defaultProvider) {
        console.log(`\n🎯 New default provider: ${defaultProvider.name}`);
      } else {
        console.log('\n⚠️  No providers detected. Install Ollama or configure API keys.');
      }
      
    } catch (error) {
      console.error(`❌ Failed to reset configuration: ${error}`);
    }
  }

  private async showStatus(): Promise<void> {
    const report = this.configManager.getStatusReport();
    console.log('\n' + report);
  }

  private getHealthIcon(status?: string): string {
    switch (status) {
      case 'healthy': return '🟢';
      case 'degraded': return '🟡';
      case 'unavailable': return '🔴';
      default: return '❓';
    }
  }

  private showHelp(): void {
    console.log(`
🛡️  Trust CLI - Provider Management Commands
════════════════════════════════════════════════════════════

📋 Provider Operations:
   trust provider list [--verbose]         List all detected providers
   trust provider detect                   Re-run provider auto-detection
   trust provider set <provider-id>        Set default provider
   trust provider enable <provider-id>     Enable a provider
   trust provider disable <provider-id>    Disable a provider

🧪 Testing & Diagnostics:
   trust provider test [provider-id]       Test provider connectivity
   trust provider status                   Show detailed provider status
   trust provider reset                    Reset configuration and re-detect

📊 Provider Types:
   • 🏠 Local    - Ollama, Local models, Docker containers
   • ☁️ Cloud    - Gemini, OpenAI, Anthropic, Vertex AI  
   • 🔄 Hybrid   - HuggingFace (local + cloud models)

🚀 Quick Start Examples:
   trust provider detect                   # Auto-detect all providers
   trust provider list --verbose          # Detailed provider information
   trust provider set ollama              # Use Ollama as default
   trust provider test                     # Test all provider connectivity

🔧 Auto-Detection Features:
   • 🔍 Scans for installed software (Ollama, Docker, Python)
   • 🔑 Detects configured API keys
   • 📊 Evaluates provider health and performance
   • ⚡ Recommends optimal configuration
   • 🛡️  Prioritizes privacy-first local providers

💡 Provider IDs:
   ollama, huggingface, gemini, openai, anthropic, vertex-ai, 
   local-models, docker

🎯 Configuration:
   Providers are auto-configured with sensible defaults.
   Configuration is saved to ~/.trust-cli/providers.json
   
   Preferences:
   • Local providers are preferred for privacy
   • Cloud providers require API key configuration
   • Fallback order is automatically managed
`);
  }
}

export async function handleProviderCommand(args: ProviderCommandArgs): Promise<void> {
  const handler = new ProviderCommandHandler();
  await handler.handleCommand(args);
}