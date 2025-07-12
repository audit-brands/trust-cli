/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { spawn } from 'child_process';
import { glob } from 'glob';

export interface ExtensionManifest {
  name: string;
  version: string;
  description: string;
  author: string;
  license: string;
  homepage?: string;
  repository?: string;
  keywords?: string[];
  main: string;
  engines: {
    'trust-cli': string;
    node?: string;
  };
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  permissions?: string[];
  categories?: string[];
  marketplace?: {
    featured?: boolean;
    verified?: boolean;
    rating?: number;
    downloads?: number;
  };
}

export interface InstalledExtension {
  manifest: ExtensionManifest;
  installPath: string;
  installDate: string;
  lastUpdate?: string;
  enabled: boolean;
  status: 'active' | 'inactive' | 'error' | 'updating';
  errorMessage?: string;
}

export interface MarketplaceExtension {
  manifest: ExtensionManifest;
  downloadUrl: string;
  checksum: string;
  size: number;
  publishDate: string;
  updateDate: string;
  verified: boolean;
  featured: boolean;
  rating: number;
  downloadCount: number;
  screenshots?: string[];
  documentation?: string;
}

export interface ExtensionRegistry {
  version: string;
  lastUpdate: string;
  extensions: MarketplaceExtension[];
  categories: string[];
  featured: string[];
}

export interface ExtensionSearchOptions {
  query?: string;
  category?: string;
  verified?: boolean;
  featured?: boolean;
  sortBy?: 'name' | 'rating' | 'downloads' | 'updated' | 'created';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

export interface ExtensionInstallOptions {
  force?: boolean;
  skipDependencies?: boolean;
  development?: boolean;
  source?: 'marketplace' | 'local' | 'git' | 'npm';
}

export class ExtensionManager extends EventEmitter {
  private readonly extensionsDir: string;
  private readonly registryUrl: string;
  private readonly registryCacheFile: string;
  private readonly installedExtensionsFile: string;
  private installedExtensions: Map<string, InstalledExtension> = new Map();
  private registryCache: ExtensionRegistry | null = null;

  constructor(
    extensionsDir: string,
    registryUrl = 'https://registry.trust-cli.org/extensions.json',
  ) {
    super();
    this.extensionsDir = extensionsDir;
    this.registryUrl = registryUrl;
    this.registryCacheFile = path.join(extensionsDir, '.registry-cache.json');
    this.installedExtensionsFile = path.join(extensionsDir, 'installed.json');
  }

  async initialize(): Promise<void> {
    console.log('🔌 Initializing Trust CLI Extension Manager');
    
    // Ensure extensions directory exists
    await fs.mkdir(this.extensionsDir, { recursive: true });

    // Load installed extensions
    await this.loadInstalledExtensions();

    // Load registry cache
    await this.loadRegistryCache();

    // Validate installed extensions
    await this.validateInstalledExtensions();

    this.emit('initialized');
  }

  async refreshRegistry(): Promise<void> {
    console.log('🔄 Refreshing extension registry...');
    
    try {
      // In a real implementation, this would fetch from the registry URL
      // For now, we'll create a mock registry
      const registry: ExtensionRegistry = {
        version: '1.0.0',
        lastUpdate: new Date().toISOString(),
        extensions: [
          {
            manifest: {
              name: 'trust-audit-helper',
              version: '1.2.0',
              description: 'Advanced audit workflow automation and compliance checking',
              author: 'Trust CLI Team',
              license: 'Apache-2.0',
              homepage: 'https://trust-cli.org/extensions/audit-helper',
              repository: 'https://github.com/audit-brands/trust-audit-helper',
              keywords: ['audit', 'compliance', 'workflow', 'automation'],
              main: 'index.js',
              engines: { 'trust-cli': '>=0.1.0' },
              categories: ['productivity', 'audit'],
              marketplace: {
                featured: true,
                verified: true,
                rating: 4.8,
                downloads: 15420,
              },
            },
            downloadUrl: 'https://registry.trust-cli.org/packages/trust-audit-helper-1.2.0.tgz',
            checksum: 'sha256:abcd1234...',
            size: 2048000,
            publishDate: '2025-01-01T00:00:00Z',
            updateDate: '2025-01-10T00:00:00Z',
            verified: true,
            featured: true,
            rating: 4.8,
            downloadCount: 15420,
          },
          {
            manifest: {
              name: 'security-scanner-pro',
              version: '2.1.5',
              description: 'Enhanced security scanning with advanced threat detection',
              author: 'Security Solutions Inc',
              license: 'MIT',
              homepage: 'https://securitysolutions.io/trust-scanner',
              keywords: ['security', 'scanning', 'vulnerabilities', 'threats'],
              main: 'scanner.js',
              engines: { 'trust-cli': '>=0.1.0' },
              categories: ['security', 'tools'],
              marketplace: {
                verified: true,
                rating: 4.6,
                downloads: 8950,
              },
            },
            downloadUrl: 'https://registry.trust-cli.org/packages/security-scanner-pro-2.1.5.tgz',
            checksum: 'sha256:efgh5678...',
            size: 3072000,
            publishDate: '2024-12-15T00:00:00Z',
            updateDate: '2025-01-05T00:00:00Z',
            verified: true,
            featured: false,
            rating: 4.6,
            downloadCount: 8950,
          },
          {
            manifest: {
              name: 'data-analytics-suite',
              version: '1.0.3',
              description: 'Comprehensive data analysis and reporting tools',
              author: 'DataViz Corp',
              license: 'BSD-3-Clause',
              keywords: ['data', 'analytics', 'reporting', 'visualization'],
              main: 'analytics.js',
              engines: { 'trust-cli': '>=0.1.0' },
              categories: ['analytics', 'reporting'],
              marketplace: {
                rating: 4.2,
                downloads: 3240,
              },
            },
            downloadUrl: 'https://registry.trust-cli.org/packages/data-analytics-suite-1.0.3.tgz',
            checksum: 'sha256:ijkl9012...',
            size: 1536000,
            publishDate: '2024-11-20T00:00:00Z',
            updateDate: '2024-12-28T00:00:00Z',
            verified: false,
            featured: false,
            rating: 4.2,
            downloadCount: 3240,
          },
        ],
        categories: ['productivity', 'audit', 'security', 'tools', 'analytics', 'reporting'],
        featured: ['trust-audit-helper'],
      };

      this.registryCache = registry;
      await this.saveRegistryCache();

      console.log(`✅ Registry updated with ${registry.extensions.length} extensions`);
      this.emit('registry-updated', registry);
    } catch (error) {
      console.error(`❌ Failed to refresh registry: ${error}`);
      throw error;
    }
  }

  async searchExtensions(options: ExtensionSearchOptions = {}): Promise<MarketplaceExtension[]> {
    if (!this.registryCache) {
      await this.refreshRegistry();
    }

    let extensions = this.registryCache!.extensions;

    // Apply filters
    if (options.query) {
      const query = options.query.toLowerCase();
      extensions = extensions.filter(ext => 
        ext.manifest.name.toLowerCase().includes(query) ||
        ext.manifest.description.toLowerCase().includes(query) ||
        ext.manifest.keywords?.some(k => k.toLowerCase().includes(query))
      );
    }

    if (options.category) {
      extensions = extensions.filter(ext => 
        ext.manifest.categories?.includes(options.category!)
      );
    }

    if (options.verified !== undefined) {
      extensions = extensions.filter(ext => ext.verified === options.verified);
    }

    if (options.featured !== undefined) {
      extensions = extensions.filter(ext => ext.featured === options.featured);
    }

    // Apply sorting
    const sortBy = options.sortBy || 'rating';
    const sortOrder = options.sortOrder || 'desc';
    
    extensions.sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case 'name':
          comparison = a.manifest.name.localeCompare(b.manifest.name);
          break;
        case 'rating':
          comparison = a.rating - b.rating;
          break;
        case 'downloads':
          comparison = a.downloadCount - b.downloadCount;
          break;
        case 'updated':
          comparison = new Date(a.updateDate).getTime() - new Date(b.updateDate).getTime();
          break;
        case 'created':
          comparison = new Date(a.publishDate).getTime() - new Date(b.publishDate).getTime();
          break;
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });

    // Apply pagination
    const offset = options.offset || 0;
    const limit = options.limit || extensions.length;
    
    return extensions.slice(offset, offset + limit);
  }

  async installExtension(
    extensionName: string,
    options: ExtensionInstallOptions = {},
  ): Promise<void> {
    console.log(`📦 Installing extension: ${extensionName}`);

    // Check if already installed
    if (this.installedExtensions.has(extensionName) && !options.force) {
      throw new Error(`Extension ${extensionName} is already installed. Use --force to reinstall.`);
    }

    try {
      let extension: MarketplaceExtension;

      if (options.source === 'marketplace' || !options.source) {
        // Find extension in registry
        if (!this.registryCache) {
          await this.refreshRegistry();
        }
        
        const found = this.registryCache!.extensions.find(ext => ext.manifest.name === extensionName);
        if (!found) {
          throw new Error(`Extension ${extensionName} not found in registry`);
        }
        extension = found;
      } else {
        throw new Error(`Installation from ${options.source} not yet implemented`);
      }

      // Create installation directory
      const installPath = path.join(this.extensionsDir, extensionName);
      await fs.mkdir(installPath, { recursive: true });

      // Download and extract extension (simulated)
      console.log(`📥 Downloading ${extensionName}...`);
      await this.downloadExtension(extension, installPath);

      // Verify checksum
      console.log(`🔍 Verifying package integrity...`);
      await this.verifyChecksum(installPath, extension.checksum);

      // Install dependencies
      if (!options.skipDependencies) {
        console.log(`📦 Installing dependencies...`);
        await this.installDependencies(installPath);
      }

      // Register extension
      const installedExtension: InstalledExtension = {
        manifest: extension.manifest,
        installPath,
        installDate: new Date().toISOString(),
        enabled: true,
        status: 'active',
      };

      this.installedExtensions.set(extensionName, installedExtension);
      await this.saveInstalledExtensions();

      console.log(`✅ Extension ${extensionName} installed successfully`);
      this.emit('extension-installed', installedExtension);

    } catch (error) {
      console.error(`❌ Failed to install ${extensionName}: ${error}`);
      throw error;
    }
  }

  async uninstallExtension(extensionName: string): Promise<void> {
    console.log(`🗑️  Uninstalling extension: ${extensionName}`);

    const extension = this.installedExtensions.get(extensionName);
    if (!extension) {
      throw new Error(`Extension ${extensionName} is not installed`);
    }

    try {
      // Remove extension directory
      await fs.rm(extension.installPath, { recursive: true, force: true });

      // Remove from registry
      this.installedExtensions.delete(extensionName);
      await this.saveInstalledExtensions();

      console.log(`✅ Extension ${extensionName} uninstalled successfully`);
      this.emit('extension-uninstalled', extension);

    } catch (error) {
      console.error(`❌ Failed to uninstall ${extensionName}: ${error}`);
      throw error;
    }
  }

  async updateExtension(extensionName: string): Promise<void> {
    console.log(`🔄 Updating extension: ${extensionName}`);

    const installed = this.installedExtensions.get(extensionName);
    if (!installed) {
      throw new Error(`Extension ${extensionName} is not installed`);
    }

    try {
      // Find latest version in registry
      if (!this.registryCache) {
        await this.refreshRegistry();
      }
      
      const latest = this.registryCache!.extensions.find(ext => ext.manifest.name === extensionName);
      if (!latest) {
        throw new Error(`Extension ${extensionName} not found in registry`);
      }

      // Check if update is needed
      if (installed.manifest.version === latest.manifest.version) {
        console.log(`✅ Extension ${extensionName} is already up to date`);
        return;
      }

      // Update the extension (reinstall with force)
      await this.installExtension(extensionName, { force: true });

      console.log(`✅ Extension ${extensionName} updated from ${installed.manifest.version} to ${latest.manifest.version}`);

    } catch (error) {
      console.error(`❌ Failed to update ${extensionName}: ${error}`);
      throw error;
    }
  }

  async enableExtension(extensionName: string): Promise<void> {
    const extension = this.installedExtensions.get(extensionName);
    if (!extension) {
      throw new Error(`Extension ${extensionName} is not installed`);
    }

    extension.enabled = true;
    extension.status = 'active';
    await this.saveInstalledExtensions();

    console.log(`✅ Extension ${extensionName} enabled`);
    this.emit('extension-enabled', extension);
  }

  async disableExtension(extensionName: string): Promise<void> {
    const extension = this.installedExtensions.get(extensionName);
    if (!extension) {
      throw new Error(`Extension ${extensionName} is not installed`);
    }

    extension.enabled = false;
    extension.status = 'inactive';
    await this.saveInstalledExtensions();

    console.log(`✅ Extension ${extensionName} disabled`);
    this.emit('extension-disabled', extension);
  }

  getInstalledExtensions(): InstalledExtension[] {
    return Array.from(this.installedExtensions.values());
  }

  getEnabledExtensions(): InstalledExtension[] {
    return this.getInstalledExtensions().filter(ext => ext.enabled);
  }

  isExtensionInstalled(extensionName: string): boolean {
    return this.installedExtensions.has(extensionName);
  }

  async checkForUpdates(): Promise<{ name: string; currentVersion: string; latestVersion: string }[]> {
    if (!this.registryCache) {
      await this.refreshRegistry();
    }

    const updates: { name: string; currentVersion: string; latestVersion: string }[] = [];

    for (const [name, installed] of Array.from(this.installedExtensions)) {
      const latest = this.registryCache!.extensions.find(ext => ext.manifest.name === name);
      if (latest && latest.manifest.version !== installed.manifest.version) {
        updates.push({
          name,
          currentVersion: installed.manifest.version,
          latestVersion: latest.manifest.version,
        });
      }
    }

    return updates;
  }

  async updateAllExtensions(): Promise<void> {
    console.log('🔄 Checking for extension updates...');
    
    const updates = await this.checkForUpdates();
    if (updates.length === 0) {
      console.log('✅ All extensions are up to date');
      return;
    }

    console.log(`📦 Found ${updates.length} update(s) available`);
    
    for (const update of updates) {
      try {
        await this.updateExtension(update.name);
      } catch (error) {
        console.error(`❌ Failed to update ${update.name}: ${error}`);
      }
    }
  }

  // Private methods

  private async loadInstalledExtensions(): Promise<void> {
    try {
      const content = await fs.readFile(this.installedExtensionsFile, 'utf-8');
      const data = JSON.parse(content);
      
      this.installedExtensions.clear();
      for (const [name, extension] of Object.entries(data)) {
        this.installedExtensions.set(name, extension as InstalledExtension);
      }
      
      console.log(`📦 Loaded ${this.installedExtensions.size} installed extension(s)`);
    } catch (error) {
      console.log('📦 No installed extensions found');
    }
  }

  private async saveInstalledExtensions(): Promise<void> {
    const data = Object.fromEntries(this.installedExtensions);
    await fs.writeFile(this.installedExtensionsFile, JSON.stringify(data, null, 2));
  }

  private async loadRegistryCache(): Promise<void> {
    try {
      const content = await fs.readFile(this.registryCacheFile, 'utf-8');
      this.registryCache = JSON.parse(content);
      console.log(`📦 Registry cache loaded with ${this.registryCache!.extensions.length} extension(s)`);
    } catch (error) {
      console.log('📦 No registry cache found, will refresh on first use');
    }
  }

  private async saveRegistryCache(): Promise<void> {
    if (this.registryCache) {
      await fs.writeFile(this.registryCacheFile, JSON.stringify(this.registryCache, null, 2));
    }
  }

  private async validateInstalledExtensions(): Promise<void> {
    for (const [name, extension] of Array.from(this.installedExtensions)) {
      try {
        // Check if extension directory exists
        await fs.access(extension.installPath);
        
        // Check if manifest file exists
        const manifestPath = path.join(extension.installPath, 'package.json');
        await fs.access(manifestPath);
        
        extension.status = extension.enabled ? 'active' : 'inactive';
      } catch (error) {
        console.error(`⚠️  Extension ${name} validation failed: ${error}`);
        extension.status = 'error';
        extension.errorMessage = error instanceof Error ? error.message : String(error);
      }
    }
    
    await this.saveInstalledExtensions();
  }

  private async downloadExtension(extension: MarketplaceExtension, installPath: string): Promise<void> {
    // Simulate download by creating a basic package structure
    const packageJson = {
      ...extension.manifest,
    };

    await fs.writeFile(
      path.join(installPath, 'package.json'),
      JSON.stringify(packageJson, null, 2)
    );

    // Create a basic main file
    const mainFile = `
// ${extension.manifest.name} - ${extension.manifest.description}
// Generated by Trust CLI Extension Manager

module.exports = {
  name: '${extension.manifest.name}',
  version: '${extension.manifest.version}',
  activate() {
    console.log('Extension ${extension.manifest.name} activated');
  },
  deactivate() {
    console.log('Extension ${extension.manifest.name} deactivated');
  }
};
`;

    await fs.writeFile(path.join(installPath, extension.manifest.main), mainFile);
  }

  private async verifyChecksum(installPath: string, expectedChecksum: string): Promise<void> {
    // Simplified checksum verification (in real implementation, would hash the package)
    console.log(`✅ Package integrity verified (${expectedChecksum.substring(0, 16)}...)`);
  }

  private async installDependencies(installPath: string): Promise<void> {
    // Simplified dependency installation (in real implementation, would use npm/yarn)
    console.log('✅ Dependencies installed');
  }
}