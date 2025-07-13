/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ExtensionManager,
  ExtensionSearchOptions,
  ExtensionInstallOptions,
  MarketplaceExtension,
  InstalledExtension,
} from '@trust-cli/trust-cli-core';
// import * as fs from 'fs/promises';
import * as path from 'path';

export interface ExtensionCommandArgs {
  action:
    | 'search'
    | 'install'
    | 'uninstall'
    | 'update'
    | 'list'
    | 'enable'
    | 'disable'
    | 'info'
    | 'marketplace';
  subaction?: string;
  name?: string;
  query?: string;
  category?: string;
  format?: 'table' | 'json' | 'list';
  verified?: boolean;
  featured?: boolean;
  sortBy?: 'name' | 'rating' | 'downloads' | 'updated' | 'created';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
  force?: boolean;
  skipDependencies?: boolean;
  development?: boolean;
  source?: 'marketplace' | 'local' | 'git' | 'npm';
  all?: boolean;
  verbose?: boolean;
}

export class ExtensionCommandHandler {
  private manager: ExtensionManager;
  private extensionsDir: string;

  constructor() {
    this.extensionsDir = path.join(process.cwd(), '.trustcli', 'extensions');
    this.manager = new ExtensionManager(this.extensionsDir);
    this.setupEventHandlers();
  }

  async initialize(): Promise<void> {
    await this.manager.initialize();
  }

  async handleCommand(args: ExtensionCommandArgs): Promise<void> {
    await this.initialize();

    switch (args.action) {
      case 'search':
        await this.handleSearchCommand(args);
        break;
      case 'install':
        await this.handleInstallCommand(args);
        break;
      case 'uninstall':
        await this.handleUninstallCommand(args);
        break;
      case 'update':
        await this.handleUpdateCommand(args);
        break;
      case 'list':
        await this.handleListCommand(args);
        break;
      case 'enable':
        await this.handleEnableCommand(args);
        break;
      case 'disable':
        await this.handleDisableCommand(args);
        break;
      case 'info':
        await this.handleInfoCommand(args);
        break;
      case 'marketplace':
        await this.handleMarketplaceCommand(args);
        break;
      default:
        throw new Error(`Unknown extension action: ${args.action}`);
    }
  }

  private async handleSearchCommand(args: ExtensionCommandArgs): Promise<void> {
    console.log('🔍 Trust CLI Extension Marketplace');
    console.log('═══════════════════════════════════════════════════════════');

    const searchOptions: ExtensionSearchOptions = {
      query: args.query,
      category: args.category,
      verified: args.verified,
      featured: args.featured,
      sortBy: args.sortBy || 'rating',
      sortOrder: args.sortOrder || 'desc',
      limit: args.limit || 20,
      offset: args.offset || 0,
    };

    try {
      const extensions = await this.manager.searchExtensions(searchOptions);

      if (extensions.length === 0) {
        console.log('📦 No extensions found matching your criteria');
        return;
      }

      console.log(`\n📦 Found ${extensions.length} extension(s):`);

      if (args.format === 'json') {
        console.log(JSON.stringify(extensions, null, 2));
        return;
      }

      extensions.forEach((ext) => {
        const badges = [];
        if (ext.verified) badges.push('✅ Verified');
        if (ext.featured) badges.push('⭐ Featured');

        console.log(`\n📦 ${ext.manifest.name} v${ext.manifest.version}`);
        console.log(`   ${ext.manifest.description}`);
        console.log(`   Author: ${ext.manifest.author}`);
        console.log(
          `   Rating: ${'★'.repeat(Math.floor(ext.rating))}${'☆'.repeat(5 - Math.floor(ext.rating))} (${ext.rating}/5)`,
        );
        console.log(`   Downloads: ${ext.downloadCount.toLocaleString()}`);

        if (badges.length > 0) {
          console.log(`   Badges: ${badges.join(', ')}`);
        }

        if (ext.manifest.categories) {
          console.log(`   Categories: ${ext.manifest.categories.join(', ')}`);
        }

        if (args.verbose) {
          console.log(`   License: ${ext.manifest.license}`);
          console.log(`   Size: ${this.formatBytes(ext.size)}`);
          console.log(
            `   Published: ${new Date(ext.publishDate).toLocaleDateString()}`,
          );
          console.log(
            `   Updated: ${new Date(ext.updateDate).toLocaleDateString()}`,
          );

          if (ext.manifest.homepage) {
            console.log(`   Homepage: ${ext.manifest.homepage}`);
          }
        }
      });

      console.log(
        '\n💡 Use `trust extensions install <name>` to install an extension',
      );
      console.log(
        '💡 Use `trust extensions info <name>` for detailed information',
      );
    } catch (error) {
      console.error(
        `❌ Search failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  private async handleInstallCommand(
    args: ExtensionCommandArgs,
  ): Promise<void> {
    if (!args.name) {
      throw new Error('Extension name is required for installation');
    }

    console.log('📦 Trust CLI Extension Installation');
    console.log('═══════════════════════════════════════════════════════════');

    const installOptions: ExtensionInstallOptions = {
      force: args.force,
      skipDependencies: args.skipDependencies,
      development: args.development,
      source: args.source,
    };

    try {
      await this.manager.installExtension(args.name, installOptions);

      console.log('\n✅ Installation completed successfully!');
      console.log(
        `📁 Installed to: ${path.join(this.extensionsDir, args.name)}`,
      );
      console.log(
        '\n💡 Use `trust extensions list` to see all installed extensions',
      );
      console.log(
        '💡 Use `trust extensions enable <name>` if the extension is disabled',
      );
    } catch (error) {
      console.error(
        `❌ Installation failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  private async handleUninstallCommand(
    args: ExtensionCommandArgs,
  ): Promise<void> {
    if (!args.name) {
      throw new Error('Extension name is required for uninstallation');
    }

    console.log('🗑️  Trust CLI Extension Uninstallation');
    console.log('═══════════════════════════════════════════════════════════');

    try {
      await this.manager.uninstallExtension(args.name);

      console.log('\n✅ Uninstallation completed successfully!');
      console.log('💡 Use `trust extensions list` to see remaining extensions');
    } catch (error) {
      console.error(
        `❌ Uninstallation failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  private async handleUpdateCommand(args: ExtensionCommandArgs): Promise<void> {
    console.log('🔄 Trust CLI Extension Updates');
    console.log('═══════════════════════════════════════════════════════════');

    try {
      if (args.all) {
        await this.manager.updateAllExtensions();
      } else if (args.name) {
        await this.manager.updateExtension(args.name);
      } else {
        // Check for available updates
        const updates = await this.manager.checkForUpdates();

        if (updates.length === 0) {
          console.log('✅ All extensions are up to date');
          return;
        }

        console.log(`\n📦 Found ${updates.length} update(s) available:`);
        updates.forEach((update) => {
          console.log(
            `   ${update.name}: ${update.currentVersion} → ${update.latestVersion}`,
          );
        });

        console.log(
          '\n💡 Use `trust extensions update --all` to update all extensions',
        );
        console.log(
          '💡 Use `trust extensions update <name>` to update a specific extension',
        );
      }
    } catch (error) {
      console.error(
        `❌ Update failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  private async handleListCommand(args: ExtensionCommandArgs): Promise<void> {
    console.log('📦 Trust CLI Installed Extensions');
    console.log('═══════════════════════════════════════════════════════════');

    const extensions = this.manager.getInstalledExtensions();

    if (extensions.length === 0) {
      console.log('📦 No extensions installed');
      console.log(
        '\n💡 Use `trust extensions search` to browse available extensions',
      );
      console.log(
        '💡 Use `trust extensions marketplace` to see featured extensions',
      );
      return;
    }

    if (args.format === 'json') {
      console.log(JSON.stringify(extensions, null, 2));
      return;
    }

    console.log(`\n📊 Total: ${extensions.length} extension(s) installed`);

    // Group by status
    const active = extensions.filter((ext) => ext.status === 'active');
    const inactive = extensions.filter((ext) => ext.status === 'inactive');
    const error = extensions.filter((ext) => ext.status === 'error');

    if (active.length > 0) {
      console.log(`\n✅ Active Extensions (${active.length}):`);
      active.forEach((ext) => this.displayExtensionInfo(ext, args.verbose));
    }

    if (inactive.length > 0) {
      console.log(`\n⏸️  Inactive Extensions (${inactive.length}):`);
      inactive.forEach((ext) => this.displayExtensionInfo(ext, args.verbose));
    }

    if (error.length > 0) {
      console.log(`\n❌ Extensions with Errors (${error.length}):`);
      error.forEach((ext) => {
        this.displayExtensionInfo(ext, args.verbose);
        if (ext.errorMessage) {
          console.log(`      Error: ${ext.errorMessage}`);
        }
      });
    }

    console.log(
      '\n💡 Use `trust extensions info <name>` for detailed information',
    );
    console.log(
      '💡 Use `trust extensions enable/disable <name>` to control extensions',
    );
  }

  private async handleEnableCommand(args: ExtensionCommandArgs): Promise<void> {
    if (!args.name) {
      throw new Error('Extension name is required');
    }

    console.log(`✅ Enabling extension: ${args.name}`);

    try {
      await this.manager.enableExtension(args.name);
      console.log('✅ Extension enabled successfully');
    } catch (error) {
      console.error(
        `❌ Failed to enable extension: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  private async handleDisableCommand(
    args: ExtensionCommandArgs,
  ): Promise<void> {
    if (!args.name) {
      throw new Error('Extension name is required');
    }

    console.log(`⏸️  Disabling extension: ${args.name}`);

    try {
      await this.manager.disableExtension(args.name);
      console.log('✅ Extension disabled successfully');
    } catch (error) {
      console.error(
        `❌ Failed to disable extension: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  private async handleInfoCommand(args: ExtensionCommandArgs): Promise<void> {
    if (!args.name) {
      throw new Error('Extension name is required');
    }

    console.log(`ℹ️  Extension Information: ${args.name}`);
    console.log('═══════════════════════════════════════════════════════════');

    try {
      // Check if installed
      const installed = this.manager
        .getInstalledExtensions()
        .find((ext) => ext.manifest.name === args.name);

      if (installed) {
        console.log('\n📦 Installed Extension:');
        this.displayDetailedExtensionInfo(installed);
      } else {
        // Search in marketplace
        const marketplace = await this.manager.searchExtensions({
          query: args.name,
          limit: 1,
        });
        const found = marketplace.find(
          (ext) => ext.manifest.name === args.name,
        );

        if (found) {
          console.log('\n🏪 Marketplace Extension:');
          this.displayMarketplaceExtensionInfo(found);
        } else {
          console.log(
            `❌ Extension '${args.name}' not found in installed extensions or marketplace`,
          );
          return;
        }
      }
    } catch (error) {
      console.error(
        `❌ Failed to get extension info: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  private async handleMarketplaceCommand(
    args: ExtensionCommandArgs,
  ): Promise<void> {
    console.log('🏪 Trust CLI Extension Marketplace');
    console.log('═══════════════════════════════════════════════════════════');

    try {
      if (args.subaction === 'featured') {
        const featured = await this.manager.searchExtensions({
          featured: true,
        });
        console.log(`\n⭐ Featured Extensions (${featured.length}):`);
        featured.forEach((ext) => this.displayMarketplaceExtensionInfo(ext));
      } else if (args.subaction === 'verified') {
        const verified = await this.manager.searchExtensions({
          verified: true,
        });
        console.log(`\n✅ Verified Extensions (${verified.length}):`);
        verified.forEach((ext) => this.displayMarketplaceExtensionInfo(ext));
      } else if (args.subaction === 'categories') {
        await this.displayCategories();
      } else {
        // Show marketplace overview
        await this.displayMarketplaceOverview();
      }
    } catch (error) {
      console.error(
        `❌ Failed to load marketplace: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  private displayExtensionInfo(
    extension: InstalledExtension,
    verbose = false,
  ): void {
    const statusIcon = this.getStatusIcon(extension.status);
    const enabledIcon = extension.enabled ? '🟢' : '🔴';

    console.log(
      `\n   ${statusIcon} ${extension.manifest.name} v${extension.manifest.version} ${enabledIcon}`,
    );
    console.log(`      ${extension.manifest.description}`);
    console.log(
      `      Author: ${extension.manifest.author} | License: ${extension.manifest.license}`,
    );

    if (verbose) {
      console.log(
        `      Installed: ${new Date(extension.installDate).toLocaleDateString()}`,
      );
      console.log(`      Path: ${extension.installPath}`);

      if (extension.lastUpdate) {
        console.log(
          `      Last Update: ${new Date(extension.lastUpdate).toLocaleDateString()}`,
        );
      }

      if (extension.manifest.categories) {
        console.log(
          `      Categories: ${extension.manifest.categories.join(', ')}`,
        );
      }
    }
  }

  private displayDetailedExtensionInfo(extension: InstalledExtension): void {
    const statusIcon = this.getStatusIcon(extension.status);
    const enabledIcon = extension.enabled ? '🟢 Enabled' : '🔴 Disabled';

    console.log(`Name: ${extension.manifest.name}`);
    console.log(`Version: ${extension.manifest.version}`);
    console.log(`Description: ${extension.manifest.description}`);
    console.log(`Author: ${extension.manifest.author}`);
    console.log(`License: ${extension.manifest.license}`);
    console.log(`Status: ${statusIcon} ${extension.status}`);
    console.log(`State: ${enabledIcon}`);
    console.log(
      `Installed: ${new Date(extension.installDate).toLocaleDateString()}`,
    );
    console.log(`Path: ${extension.installPath}`);

    if (extension.lastUpdate) {
      console.log(
        `Last Update: ${new Date(extension.lastUpdate).toLocaleDateString()}`,
      );
    }

    if (extension.manifest.homepage) {
      console.log(`Homepage: ${extension.manifest.homepage}`);
    }

    if (extension.manifest.repository) {
      console.log(`Repository: ${extension.manifest.repository}`);
    }

    if (extension.manifest.categories) {
      console.log(`Categories: ${extension.manifest.categories.join(', ')}`);
    }

    if (extension.manifest.keywords) {
      console.log(`Keywords: ${extension.manifest.keywords.join(', ')}`);
    }

    if (extension.manifest.engines) {
      console.log(
        `Engines: Trust CLI ${extension.manifest.engines['trust-cli']}`,
      );
    }

    if (extension.errorMessage) {
      console.log(`Error: ${extension.errorMessage}`);
    }
  }

  private displayMarketplaceExtensionInfo(
    extension: MarketplaceExtension,
  ): void {
    const badges = [];
    if (extension.verified) badges.push('✅ Verified');
    if (extension.featured) badges.push('⭐ Featured');

    console.log(
      `\n📦 ${extension.manifest.name} v${extension.manifest.version}`,
    );
    console.log(`   ${extension.manifest.description}`);
    console.log(`   Author: ${extension.manifest.author}`);
    console.log(
      `   Rating: ${'★'.repeat(Math.floor(extension.rating))}${'☆'.repeat(5 - Math.floor(extension.rating))} (${extension.rating}/5)`,
    );
    console.log(`   Downloads: ${extension.downloadCount.toLocaleString()}`);
    console.log(`   Size: ${this.formatBytes(extension.size)}`);

    if (badges.length > 0) {
      console.log(`   Badges: ${badges.join(', ')}`);
    }

    if (extension.manifest.categories) {
      console.log(`   Categories: ${extension.manifest.categories.join(', ')}`);
    }

    const isInstalled = this.manager.isExtensionInstalled(
      extension.manifest.name,
    );
    if (isInstalled) {
      console.log('   ✅ Installed');
    } else {
      console.log(
        `   📥 Install: trust extensions install ${extension.manifest.name}`,
      );
    }
  }

  private async displayMarketplaceOverview(): Promise<void> {
    const all = await this.manager.searchExtensions({ limit: 100 });
    const featured = await this.manager.searchExtensions({ featured: true });
    const verified = await this.manager.searchExtensions({ verified: true });

    console.log('\n📊 Marketplace Statistics:');
    console.log(`   Total Extensions: ${all.length}`);
    console.log(`   Featured: ${featured.length}`);
    console.log(`   Verified: ${verified.length}`);

    console.log('\n⭐ Featured Extensions:');
    featured.slice(0, 3).forEach((ext) => {
      console.log(`   • ${ext.manifest.name} - ${ext.manifest.description}`);
    });

    console.log('\n🔥 Popular Extensions:');
    const popular = all
      .sort((a, b) => b.downloadCount - a.downloadCount)
      .slice(0, 3);
    popular.forEach((ext) => {
      console.log(
        `   • ${ext.manifest.name} - ${ext.downloadCount.toLocaleString()} downloads`,
      );
    });

    console.log('\n💡 Marketplace Commands:');
    console.log(
      '   trust extensions marketplace featured     # Show featured extensions',
    );
    console.log(
      '   trust extensions marketplace verified    # Show verified extensions',
    );
    console.log(
      '   trust extensions marketplace categories  # Show available categories',
    );
    console.log(
      '   trust extensions search <query>          # Search extensions',
    );
  }

  private async displayCategories(): Promise<void> {
    // In a real implementation, this would come from the registry
    const categories = [
      'productivity',
      'audit',
      'security',
      'tools',
      'analytics',
      'reporting',
      'automation',
      'development',
    ];

    console.log('\n📂 Extension Categories:');
    for (const category of categories) {
      const extensions = await this.manager.searchExtensions({
        category,
        limit: 100,
      });
      console.log(`   ${category}: ${extensions.length} extension(s)`);
    }

    console.log(
      '\n💡 Use `trust extensions search --category <name>` to browse by category',
    );
  }

  private setupEventHandlers(): void {
    this.manager.on('extension-installed', (extension: InstalledExtension) => {
      console.log(
        `🎉 Extension ${extension.manifest.name} installed successfully`,
      );
    });

    this.manager.on(
      'extension-uninstalled',
      (extension: InstalledExtension) => {
        console.log(`👋 Extension ${extension.manifest.name} uninstalled`);
      },
    );

    this.manager.on('extension-enabled', (extension: InstalledExtension) => {
      console.log(`✅ Extension ${extension.manifest.name} enabled`);
    });

    this.manager.on('extension-disabled', (extension: InstalledExtension) => {
      console.log(`⏸️  Extension ${extension.manifest.name} disabled`);
    });
  }

  private getStatusIcon(status: string): string {
    switch (status) {
      case 'active':
        return '✅';
      case 'inactive':
        return '⏸️';
      case 'error':
        return '❌';
      case 'updating':
        return '🔄';
      default:
        return '❓';
    }
  }

  private formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }
}

export async function handleExtensionCommand(
  args: ExtensionCommandArgs,
): Promise<void> {
  const handler = new ExtensionCommandHandler();
  await handler.handleCommand(args);
}
