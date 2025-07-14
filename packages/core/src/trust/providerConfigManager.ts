/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { ProviderAutoDetection, ProviderCapability, AutoDetectionResult } from './providerAutoDetection.js';

export interface ProviderConfig {
  id: string;
  name: string;
  type: 'local' | 'cloud' | 'hybrid';
  enabled: boolean;
  priority: number; // 1-10, higher = preferred
  configuration: Record<string, any>;
  lastDetected?: string;
  healthStatus?: 'healthy' | 'degraded' | 'unavailable';
}

export interface BackendConfiguration {
  providers: ProviderConfig[];
  defaultProvider?: string;
  fallbackOrder: string[];
  autoDetection: {
    enabled: boolean;
    interval: number; // minutes
    lastRun?: string;
  };
  preferences: {
    preferLocal: boolean;
    allowCloud: boolean;
    maxLatency: number; // ms
  };
}

export class ProviderConfigManager {
  private configPath: string;
  private detector: ProviderAutoDetection;
  private config: BackendConfiguration;

  constructor() {
    this.configPath = path.join(os.homedir(), '.trust-cli', 'providers.json');
    this.detector = new ProviderAutoDetection();
    this.config = this.getDefaultConfig();
  }

  /**
   * Initialize provider configuration with auto-detection
   */
  async initialize(): Promise<void> {
    try {
      // Load existing config if available
      await this.loadConfig();
    } catch {
      // No existing config, start fresh
      this.config = this.getDefaultConfig();
    }

    // Run auto-detection if enabled or if no providers configured
    if (this.config.autoDetection.enabled || this.config.providers.length === 0) {
      await this.runAutoDetection();
    }
  }

  /**
   * Run comprehensive provider auto-detection
   */
  async runAutoDetection(): Promise<AutoDetectionResult> {
    console.log('🔍 Running provider auto-detection...');
    
    const result = await this.detector.detectAllProviders();
    await this.updateConfigFromDetection(result);
    
    this.config.autoDetection.lastRun = new Date().toISOString();
    await this.saveConfig();
    
    console.log(`✅ Detected ${result.providers.filter(p => p.available).length} available providers`);
    
    return result;
  }

  /**
   * Update configuration based on detection results
   */
  private async updateConfigFromDetection(result: AutoDetectionResult): Promise<void> {
    const existingProviders = new Map(this.config.providers.map(p => [p.id, p]));
    const updatedProviders: ProviderConfig[] = [];

    for (const capability of result.providers) {
      const id = capability.name.toLowerCase().replace(/\s+/g, '-');
      const existing = existingProviders.get(id);
      
      // Preserve user preferences while updating detection results
      const config: ProviderConfig = {
        id,
        name: capability.name,
        type: capability.type,
        enabled: existing?.enabled ?? capability.available,
        priority: existing?.priority ?? this.calculatePriority(capability),
        configuration: {
          ...existing?.configuration,
          ...capability.configuration,
          healthScore: capability.healthScore,
          version: capability.version,
          endpoint: capability.endpoint,
          modelCount: capability.modelCount,
          requirements: capability.requirements
        },
        lastDetected: new Date().toISOString(),
        healthStatus: this.getHealthStatus(capability)
      };

      updatedProviders.push(config);
    }

    this.config.providers = updatedProviders;
    this.updateFallbackOrder();
    this.selectDefaultProvider();
  }

  /**
   * Calculate provider priority based on capabilities
   */
  private calculatePriority(capability: ProviderCapability): number {
    let priority = 5; // Base priority
    
    // Prefer local providers for privacy
    if (capability.type === 'local') priority += 2;
    else if (capability.type === 'hybrid') priority += 1;
    
    // Bonus for high health score
    if ((capability.healthScore || 0) >= 90) priority += 2;
    else if ((capability.healthScore || 0) >= 70) priority += 1;
    
    // Bonus for having models available
    if ((capability.modelCount || 0) > 0) priority += 1;
    
    // Specific provider preferences
    switch (capability.name) {
      case 'Ollama':
        priority += 2; // Prefer Ollama for local execution
        break;
      case 'HuggingFace':
        priority += 1; // Good balance of local and cloud
        break;
    }
    
    return Math.min(priority, 10);
  }

  /**
   * Determine health status from capability
   */
  private getHealthStatus(capability: ProviderCapability): 'healthy' | 'degraded' | 'unavailable' {
    if (!capability.available) return 'unavailable';
    
    const score = capability.healthScore || 0;
    if (score >= 80) return 'healthy';
    if (score >= 50) return 'degraded';
    return 'unavailable';
  }

  /**
   * Update fallback order based on priorities and health
   */
  private updateFallbackOrder(): void {
    const availableProviders = this.config.providers
      .filter(p => p.enabled && p.healthStatus !== 'unavailable')
      .sort((a, b) => {
        // Sort by priority first, then by health
        if (a.priority !== b.priority) {
          return b.priority - a.priority;
        }
        
        const healthOrder = { healthy: 3, degraded: 2, unavailable: 1 };
        return (healthOrder[b.healthStatus || 'unavailable'] || 0) - 
               (healthOrder[a.healthStatus || 'unavailable'] || 0);
      });

    this.config.fallbackOrder = availableProviders.map(p => p.id);
  }

  /**
   * Select the best default provider
   */
  private selectDefaultProvider(): void {
    const preferences = this.config.preferences;
    let candidates = this.config.providers.filter(p => 
      p.enabled && p.healthStatus === 'healthy'
    );

    // Apply preferences
    if (preferences.preferLocal) {
      const localCandidates = candidates.filter(p => p.type === 'local');
      if (localCandidates.length > 0) {
        candidates = localCandidates;
      }
    }

    if (!preferences.allowCloud) {
      candidates = candidates.filter(p => p.type !== 'cloud');
    }

    // Select highest priority candidate
    candidates.sort((a, b) => b.priority - a.priority);
    
    if (candidates.length > 0) {
      this.config.defaultProvider = candidates[0].id;
    } else {
      // Fallback to any available provider
      const anyAvailable = this.config.providers.find(p => 
        p.enabled && p.healthStatus !== 'unavailable'
      );
      this.config.defaultProvider = anyAvailable?.id;
    }
  }

  /**
   * Get configuration for a specific provider
   */
  getProviderConfig(providerId: string): ProviderConfig | undefined {
    return this.config.providers.find(p => p.id === providerId);
  }

  /**
   * Get all enabled providers in priority order
   */
  getEnabledProviders(): ProviderConfig[] {
    return this.config.providers
      .filter(p => p.enabled)
      .sort((a, b) => b.priority - a.priority);
  }

  /**
   * Get the current default provider
   */
  getDefaultProvider(): ProviderConfig | undefined {
    if (!this.config.defaultProvider) return undefined;
    return this.getProviderConfig(this.config.defaultProvider);
  }

  /**
   * Set the default provider
   */
  async setDefaultProvider(providerId: string): Promise<void> {
    const provider = this.getProviderConfig(providerId);
    if (!provider) {
      throw new Error(`Provider '${providerId}' not found`);
    }
    
    if (!provider.enabled) {
      throw new Error(`Provider '${providerId}' is not enabled`);
    }

    this.config.defaultProvider = providerId;
    await this.saveConfig();
  }

  /**
   * Enable or disable a provider
   */
  async setProviderEnabled(providerId: string, enabled: boolean): Promise<void> {
    const provider = this.getProviderConfig(providerId);
    if (!provider) {
      throw new Error(`Provider '${providerId}' not found`);
    }

    provider.enabled = enabled;
    
    // Update fallback order and default provider
    this.updateFallbackOrder();
    if (!enabled && this.config.defaultProvider === providerId) {
      this.selectDefaultProvider();
    }
    
    await this.saveConfig();
  }

  /**
   * Update provider priority
   */
  async setProviderPriority(providerId: string, priority: number): Promise<void> {
    const provider = this.getProviderConfig(providerId);
    if (!provider) {
      throw new Error(`Provider '${providerId}' not found`);
    }

    provider.priority = Math.max(1, Math.min(10, priority));
    this.updateFallbackOrder();
    this.selectDefaultProvider();
    
    await this.saveConfig();
  }

  /**
   * Get formatted status report
   */
  getStatusReport(): string {
    const report: string[] = [];
    report.push('🛡️  Trust CLI - Provider Status');
    report.push('═'.repeat(50));
    
    const defaultProvider = this.getDefaultProvider();
    if (defaultProvider) {
      report.push(`\n🎯 Default Provider: ${defaultProvider.name}`);
      report.push(`   Type: ${defaultProvider.type}`);
      report.push(`   Status: ${this.getStatusIcon(defaultProvider.healthStatus)} ${defaultProvider.healthStatus}`);
    } else {
      report.push('\n❌ No default provider configured');
    }

    report.push('\n📊 All Providers:');
    for (const provider of this.config.providers) {
      const statusIcon = this.getStatusIcon(provider.healthStatus);
      const enabledIcon = provider.enabled ? '✅' : '⚪';
      
      report.push(`\n${enabledIcon} ${statusIcon} ${provider.name}`);
      report.push(`   Priority: ${provider.priority}/10 | Type: ${provider.type}`);
      
      if (provider.configuration.modelCount !== undefined) {
        report.push(`   Models: ${provider.configuration.modelCount}`);
      }
      
      if (provider.configuration.version) {
        report.push(`   Version: ${provider.configuration.version}`);
      }
      
      if (provider.configuration.requirements?.length > 0) {
        report.push(`   Requirements: ${provider.configuration.requirements.join(', ')}`);
      }
    }

    const lastRun = this.config.autoDetection.lastRun;
    if (lastRun) {
      const lastRunDate = new Date(lastRun).toLocaleString();
      report.push(`\n🔍 Last Detection: ${lastRunDate}`);
    }

    report.push('\n💡 Management Commands:');
    report.push('   trust provider list              # Show all providers');
    report.push('   trust provider detect           # Re-run auto-detection');
    report.push('   trust provider set <name>       # Change default provider');
    
    return report.join('\n');
  }

  /**
   * Get status icon for health status
   */
  private getStatusIcon(status?: string): string {
    switch (status) {
      case 'healthy': return '🟢';
      case 'degraded': return '🟡';
      case 'unavailable': return '🔴';
      default: return '❓';
    }
  }

  /**
   * Load configuration from file
   */
  private async loadConfig(): Promise<void> {
    const configData = await fs.readFile(this.configPath, 'utf-8');
    this.config = { ...this.getDefaultConfig(), ...JSON.parse(configData) };
  }

  /**
   * Save configuration to file
   */
  private async saveConfig(): Promise<void> {
    await fs.mkdir(path.dirname(this.configPath), { recursive: true });
    await fs.writeFile(this.configPath, JSON.stringify(this.config, null, 2));
  }

  /**
   * Get default configuration
   */
  private getDefaultConfig(): BackendConfiguration {
    return {
      providers: [],
      fallbackOrder: [],
      autoDetection: {
        enabled: true,
        interval: 60 // minutes
      },
      preferences: {
        preferLocal: true,
        allowCloud: true,
        maxLatency: 5000 // ms
      }
    };
  }

  /**
   * Reset configuration to defaults and re-run detection
   */
  async resetConfiguration(): Promise<void> {
    this.config = this.getDefaultConfig();
    await this.runAutoDetection();
  }

  /**
   * Test all enabled providers
   */
  async testAllProviders(): Promise<Map<string, any>> {
    const results = new Map<string, any>();
    
    for (const provider of this.getEnabledProviders()) {
      try {
        // Convert provider config back to capability for testing
        const capability: ProviderCapability = {
          name: provider.name,
          type: provider.type,
          available: provider.enabled,
          endpoint: provider.configuration.endpoint,
          healthScore: provider.configuration.healthScore
        };
        
        const testResult = await this.detector.testProvider(capability);
        results.set(provider.id, testResult);
      } catch (error) {
        results.set(provider.id, { 
          success: false, 
          error: error instanceof Error ? error.message : String(error) 
        });
      }
    }
    
    return results;
  }
}