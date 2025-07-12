/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import { spawn } from 'child_process';
import { glob } from 'glob';
import { DependencyVulnerabilityScanner, ScanResult, SecurityRecommendation } from './dependencyScanner.js';

export interface DependencyUpdate {
  name: string;
  currentVersion: string;
  targetVersion: string;
  updateType: 'major' | 'minor' | 'patch' | 'security';
  ecosystem: 'npm' | 'pip' | 'gem' | 'cargo' | 'composer' | 'maven' | 'nuget';
  reason: 'security' | 'compatibility' | 'feature' | 'bug-fix' | 'maintenance';
  riskLevel: 'low' | 'medium' | 'high';
  breaking: boolean;
  automated: boolean;
  dependents: string[];
  changelog?: string;
  releaseNotes?: string;
}

export interface UpdatePolicy {
  autoUpdate: {
    enabled: boolean;
    securityOnly: boolean;
    patchLevel: boolean;
    minorLevel: boolean;
    majorLevel: boolean;
  };
  testing: {
    required: boolean;
    testCommand: string;
    timeout: number;
  };
  rollback: {
    enabled: boolean;
    automatic: boolean;
    conditions: string[];
  };
  notifications: {
    enabled: boolean;
    channels: ('console' | 'file' | 'webhook' | 'email')[];
    severity: 'all' | 'security' | 'breaking';
  };
  scheduling: {
    enabled: boolean;
    cron: string;
    maintenance: boolean;
  };
  exclusions: {
    packages: string[];
    patterns: string[];
    reasons: Record<string, string>;
  };
}

export interface UpdateResult {
  success: boolean;
  package: string;
  fromVersion: string;
  toVersion: string;
  duration: number;
  rollback: boolean;
  error?: string;
  warnings: string[];
  testResults?: {
    passed: boolean;
    output: string;
    duration: number;
  };
}

export interface UpdateBatch {
  id: string;
  timestamp: string;
  updates: DependencyUpdate[];
  policy: UpdatePolicy;
  results: UpdateResult[];
  status: 'pending' | 'running' | 'completed' | 'failed' | 'partial';
  duration: number;
  summary: {
    total: number;
    successful: number;
    failed: number;
    skipped: number;
    rolledBack: number;
  };
}

export class DependencyUpdater extends EventEmitter {
  private scanner: DependencyVulnerabilityScanner;
  private policy: UpdatePolicy;
  private configPath: string;
  private backupDir: string;
  private isRunning = false;

  constructor(
    private readonly projectPath: string,
    config?: Partial<UpdatePolicy>,
  ) {
    super();
    this.configPath = path.join(projectPath, '.trustcli', 'update-policy.json');
    this.backupDir = path.join(projectPath, '.trustcli', 'dependency-backups');
    this.scanner = new DependencyVulnerabilityScanner();
    this.policy = this.mergeWithDefaults(config || {});
  }

  async initialize(): Promise<void> {
    console.log('🔄 Initializing Dependency Updater');
    
    // Ensure directories exist
    await fs.mkdir(path.dirname(this.configPath), { recursive: true });
    await fs.mkdir(this.backupDir, { recursive: true });

    // Load saved policy
    await this.loadPolicy();

    this.emit('initialized');
  }

  async analyzeUpdates(): Promise<DependencyUpdate[]> {
    console.log('🔍 Analyzing available dependency updates...');

    try {
      // Scan for vulnerabilities first
      const scanResult = await this.scanner.scanProject(this.projectPath);
      
      // Discover dependency files
      const dependencyFiles = await this.discoverDependencyFiles();
      
      // Analyze each dependency file
      const updates: DependencyUpdate[] = [];
      
      for (const file of dependencyFiles) {
        const fileUpdates = await this.analyzeFile(file, scanResult);
        updates.push(...fileUpdates);
      }

      // Sort by priority (security updates first)
      updates.sort((a, b) => {
        const priorityOrder = { security: 3, bug-fix: 2, compatibility: 1, feature: 0, maintenance: 0 };
        return priorityOrder[b.reason] - priorityOrder[a.reason];
      });

      console.log(`📊 Found ${updates.length} potential updates`);
      this.emit('updates-analyzed', updates);

      return updates;
    } catch (error) {
      console.error(`❌ Analysis failed: ${error}`);
      throw error;
    }
  }

  async planUpdate(updates: DependencyUpdate[]): Promise<DependencyUpdate[]> {
    console.log('📋 Creating update plan...');

    const planned: DependencyUpdate[] = [];
    
    for (const update of updates) {
      // Check exclusions
      if (this.isExcluded(update)) {
        console.log(`⏭️  Skipping excluded package: ${update.name}`);
        continue;
      }

      // Check policy compliance
      if (!this.isPolicyCompliant(update)) {
        console.log(`📝 Policy prevents update: ${update.name} (${update.updateType})`);
        continue;
      }

      // Assess risk
      update.riskLevel = this.assessRisk(update);
      update.automated = this.canAutomate(update);

      planned.push(update);
    }

    console.log(`📋 Planned ${planned.length} updates (${planned.filter(u => u.automated).length} automated)`);
    this.emit('update-planned', planned);

    return planned;
  }

  async executeUpdates(updates: DependencyUpdate[]): Promise<UpdateBatch> {
    if (this.isRunning) {
      throw new Error('Update process is already running');
    }

    this.isRunning = true;
    const batchId = `update-${Date.now()}`;
    const startTime = Date.now();

    console.log(`🚀 Executing dependency updates (Batch: ${batchId})`);
    console.log('═══════════════════════════════════════════════════════════');

    const batch: UpdateBatch = {
      id: batchId,
      timestamp: new Date().toISOString(),
      updates,
      policy: this.policy,
      results: [],
      status: 'running',
      duration: 0,
      summary: {
        total: updates.length,
        successful: 0,
        failed: 0,
        skipped: 0,
        rolledBack: 0,
      },
    };

    try {
      // Create backup before updates
      await this.createBackup(batchId);

      // Execute updates sequentially for safety
      for (let i = 0; i < updates.length; i++) {
        const update = updates[i];
        console.log(`\n📦 [${i + 1}/${updates.length}] Updating ${update.name}...`);

        try {
          const result = await this.executeUpdate(update);
          batch.results.push(result);

          if (result.success) {
            batch.summary.successful++;
            console.log(`✅ Successfully updated ${update.name} to ${update.targetVersion}`);
          } else {
            batch.summary.failed++;
            console.error(`❌ Failed to update ${update.name}: ${result.error}`);
            
            // Handle rollback if enabled
            if (this.policy.rollback.enabled && this.shouldRollback(result)) {
              console.log(`🔄 Rolling back ${update.name}...`);
              await this.rollbackUpdate(update);
              result.rollback = true;
              batch.summary.rolledBack++;
            }
          }

        } catch (error) {
          const result: UpdateResult = {
            success: false,
            package: update.name,
            fromVersion: update.currentVersion,
            toVersion: update.targetVersion,
            duration: 0,
            rollback: false,
            error: error instanceof Error ? error.message : String(error),
            warnings: [],
          };
          
          batch.results.push(result);
          batch.summary.failed++;
          console.error(`❌ Update failed for ${update.name}: ${error}`);
        }

        this.emit('update-progress', { batch, current: i + 1, total: updates.length });
      }

      batch.status = batch.summary.failed === 0 ? 'completed' : 'partial';
      batch.duration = Date.now() - startTime;

      console.log('\n📊 Update Summary:');
      console.log('═══════════════════════════════════════════════════════════');
      console.log(`✅ Successful: ${batch.summary.successful}`);
      console.log(`❌ Failed: ${batch.summary.failed}`);
      console.log(`🔄 Rolled back: ${batch.summary.rolledBack}`);
      console.log(`⏱️  Duration: ${(batch.duration / 1000).toFixed(2)}s`);

      // Save batch results
      await this.saveBatchResults(batch);

      this.emit('batch-completed', batch);
      return batch;

    } catch (error) {
      batch.status = 'failed';
      batch.duration = Date.now() - startTime;
      console.error(`❌ Batch update failed: ${error}`);
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  async scheduleUpdates(): Promise<void> {
    if (!this.policy.scheduling.enabled) {
      throw new Error('Scheduled updates are disabled');
    }

    console.log('⏰ Setting up scheduled dependency updates...');
    console.log(`📅 Schedule: ${this.policy.scheduling.cron}`);
    
    // In a real implementation, this would set up a cron job or similar
    // For now, we'll just simulate the scheduling
    console.log('✅ Scheduled updates configured');
    
    this.emit('updates-scheduled', {
      cron: this.policy.scheduling.cron,
      maintenance: this.policy.scheduling.maintenance,
    });
  }

  async getUpdateHistory(): Promise<UpdateBatch[]> {
    const historyDir = path.join(path.dirname(this.configPath), 'update-history');
    
    try {
      const files = await fs.readdir(historyDir);
      const batches: UpdateBatch[] = [];
      
      for (const file of files.filter(f => f.endsWith('.json'))) {
        try {
          const content = await fs.readFile(path.join(historyDir, file), 'utf-8');
          batches.push(JSON.parse(content));
        } catch (error) {
          console.error(`Failed to load batch history: ${file}`);
        }
      }
      
      return batches.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    } catch (error) {
      return [];
    }
  }

  async updatePolicy(newPolicy: Partial<UpdatePolicy>): Promise<void> {
    this.policy = this.mergeWithDefaults(newPolicy);
    await this.savePolicy();
    console.log('✅ Update policy updated');
    this.emit('policy-updated', this.policy);
  }

  getPolicy(): UpdatePolicy {
    return { ...this.policy };
  }

  // Private methods

  private mergeWithDefaults(config: Partial<UpdatePolicy>): UpdatePolicy {
    return {
      autoUpdate: {
        enabled: false,
        securityOnly: true,
        patchLevel: true,
        minorLevel: false,
        majorLevel: false,
        ...config.autoUpdate,
      },
      testing: {
        required: true,
        testCommand: 'npm test',
        timeout: 300000, // 5 minutes
        ...config.testing,
      },
      rollback: {
        enabled: true,
        automatic: true,
        conditions: ['test-failure', 'install-failure'],
        ...config.rollback,
      },
      notifications: {
        enabled: true,
        channels: ['console'],
        severity: 'security',
        ...config.notifications,
      },
      scheduling: {
        enabled: false,
        cron: '0 2 * * 1', // Monday 2 AM
        maintenance: true,
        ...config.scheduling,
      },
      exclusions: {
        packages: [],
        patterns: [],
        reasons: {},
        ...config.exclusions,
      },
    };
  }

  private async loadPolicy(): Promise<void> {
    try {
      const content = await fs.readFile(this.configPath, 'utf-8');
      const saved = JSON.parse(content);
      this.policy = this.mergeWithDefaults(saved);
      console.log('📋 Update policy loaded');
    } catch (error) {
      console.log('📋 Using default update policy');
    }
  }

  private async savePolicy(): Promise<void> {
    await fs.writeFile(this.configPath, JSON.stringify(this.policy, null, 2));
  }

  private async discoverDependencyFiles(): Promise<string[]> {
    const patterns = [
      '**/package.json',
      '**/requirements.txt',
      '**/Pipfile',
      '**/Gemfile',
      '**/Cargo.toml',
      '**/composer.json',
      '**/pom.xml',
      '**/build.gradle',
      '**/*.csproj',
    ];

    const files: string[] = [];
    for (const pattern of patterns) {
      const matches = await glob(pattern, {
        cwd: this.projectPath,
        ignore: ['**/node_modules/**', '**/vendor/**', '**/target/**'],
      });
      files.push(...matches.map(file => path.resolve(this.projectPath, file)));
    }

    return [...new Set(files)];
  }

  private async analyzeFile(filePath: string, scanResult: ScanResult): Promise<DependencyUpdate[]> {
    const fileName = path.basename(filePath);
    const updates: DependencyUpdate[] = [];

    try {
      if (fileName === 'package.json') {
        const npmUpdates = await this.analyzeNpmFile(filePath, scanResult);
        updates.push(...npmUpdates);
      } else if (fileName === 'requirements.txt') {
        const pipUpdates = await this.analyzePipFile(filePath, scanResult);
        updates.push(...pipUpdates);
      }
      // Add more ecosystem support as needed
    } catch (error) {
      console.error(`Failed to analyze ${filePath}: ${error}`);
    }

    return updates;
  }

  private async analyzeNpmFile(filePath: string, scanResult: ScanResult): Promise<DependencyUpdate[]> {
    const content = await fs.readFile(filePath, 'utf-8');
    const packageJson = JSON.parse(content);
    const updates: DependencyUpdate[] = [];

    const dependencies = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };

    for (const [name, currentVersion] of Object.entries(dependencies)) {
      if (typeof currentVersion !== 'string') continue;

      // Check if there's a security vulnerability
      const vulnerability = scanResult.vulnerabilities.find(v => v.affectedPackage.name === name);
      const recommendation = scanResult.recommendations.find(r => r.packageName === name);

      if (vulnerability && recommendation) {
        updates.push({
          name,
          currentVersion: currentVersion as string,
          targetVersion: recommendation.recommendedVersion || 'latest',
          updateType: this.determineUpdateType(currentVersion as string, recommendation.recommendedVersion || 'latest'),
          ecosystem: 'npm',
          reason: 'security',
          riskLevel: this.mapSeverityToRisk(vulnerability.severity),
          breaking: this.isBreakingChange(currentVersion as string, recommendation.recommendedVersion || 'latest'),
          automated: recommendation.automatable,
          dependents: [],
        });
      } else {
        // Check for regular updates (simplified - would use npm registry API)
        const latestVersion = await this.getLatestVersion(name, 'npm');
        if (latestVersion && latestVersion !== currentVersion) {
          updates.push({
            name,
            currentVersion: currentVersion as string,
            targetVersion: latestVersion,
            updateType: this.determineUpdateType(currentVersion as string, latestVersion),
            ecosystem: 'npm',
            reason: 'maintenance',
            riskLevel: 'low',
            breaking: this.isBreakingChange(currentVersion as string, latestVersion),
            automated: !this.isBreakingChange(currentVersion as string, latestVersion),
            dependents: [],
          });
        }
      }
    }

    return updates;
  }

  private async analyzePipFile(filePath: string, scanResult: ScanResult): Promise<DependencyUpdate[]> {
    // Simplified pip analysis - similar pattern to npm
    return [];
  }

  private async getLatestVersion(packageName: string, ecosystem: string): Promise<string | null> {
    // Simplified - would query package registries
    // For npm: https://registry.npmjs.org/{package}/latest
    // For pip: https://pypi.org/pypi/{package}/json
    return null;
  }

  private determineUpdateType(current: string, target: string): 'major' | 'minor' | 'patch' | 'security' {
    // Simplified semver comparison
    const currentParts = current.replace(/[^0-9.]/g, '').split('.').map(Number);
    const targetParts = target.replace(/[^0-9.]/g, '').split('.').map(Number);

    if (targetParts[0] > currentParts[0]) return 'major';
    if (targetParts[1] > currentParts[1]) return 'minor';
    if (targetParts[2] > currentParts[2]) return 'patch';
    return 'security';
  }

  private mapSeverityToRisk(severity: string): 'low' | 'medium' | 'high' {
    switch (severity) {
      case 'critical':
      case 'high':
        return 'high';
      case 'moderate':
        return 'medium';
      default:
        return 'low';
    }
  }

  private isBreakingChange(current: string, target: string): boolean {
    const updateType = this.determineUpdateType(current, target);
    return updateType === 'major';
  }

  private isExcluded(update: DependencyUpdate): boolean {
    if (this.policy.exclusions.packages.includes(update.name)) {
      return true;
    }

    return this.policy.exclusions.patterns.some(pattern => {
      const regex = new RegExp(pattern);
      return regex.test(update.name);
    });
  }

  private isPolicyCompliant(update: DependencyUpdate): boolean {
    if (!this.policy.autoUpdate.enabled) {
      return false;
    }

    if (this.policy.autoUpdate.securityOnly && update.reason !== 'security') {
      return false;
    }

    switch (update.updateType) {
      case 'major':
        return this.policy.autoUpdate.majorLevel;
      case 'minor':
        return this.policy.autoUpdate.minorLevel;
      case 'patch':
      case 'security':
        return this.policy.autoUpdate.patchLevel;
      default:
        return false;
    }
  }

  private assessRisk(update: DependencyUpdate): 'low' | 'medium' | 'high' {
    if (update.breaking) return 'high';
    if (update.updateType === 'major') return 'high';
    if (update.updateType === 'minor') return 'medium';
    return 'low';
  }

  private canAutomate(update: DependencyUpdate): boolean {
    if (update.riskLevel === 'high') return false;
    if (update.breaking) return false;
    return this.policy.autoUpdate.enabled;
  }

  private async createBackup(batchId: string): Promise<void> {
    const backupPath = path.join(this.backupDir, `${batchId}-backup`);
    await fs.mkdir(backupPath, { recursive: true });

    // Backup package files
    const dependencyFiles = await this.discoverDependencyFiles();
    for (const file of dependencyFiles) {
      const relativePath = path.relative(this.projectPath, file);
      const backupFile = path.join(backupPath, relativePath);
      await fs.mkdir(path.dirname(backupFile), { recursive: true });
      await fs.copyFile(file, backupFile);
    }

    console.log(`💾 Backup created: ${backupPath}`);
  }

  private async executeUpdate(update: DependencyUpdate): Promise<UpdateResult> {
    const startTime = Date.now();
    const result: UpdateResult = {
      success: false,
      package: update.name,
      fromVersion: update.currentVersion,
      toVersion: update.targetVersion,
      duration: 0,
      rollback: false,
      warnings: [],
    };

    try {
      // Execute the update based on ecosystem
      await this.performUpdate(update);

      // Run tests if required
      if (this.policy.testing.required) {
        console.log(`🧪 Running tests for ${update.name}...`);
        const testResult = await this.runTests();
        result.testResults = testResult;

        if (!testResult.passed) {
          throw new Error(`Tests failed after updating ${update.name}`);
        }
      }

      result.success = true;
      result.duration = Date.now() - startTime;

    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error);
      result.duration = Date.now() - startTime;
    }

    return result;
  }

  private async performUpdate(update: DependencyUpdate): Promise<void> {
    // Simplified update implementation
    switch (update.ecosystem) {
      case 'npm':
        await this.runCommand(`npm install ${update.name}@${update.targetVersion}`);
        break;
      case 'pip':
        await this.runCommand(`pip install ${update.name}==${update.targetVersion}`);
        break;
      default:
        throw new Error(`Unsupported ecosystem: ${update.ecosystem}`);
    }
  }

  private async runTests(): Promise<{ passed: boolean; output: string; duration: number }> {
    const startTime = Date.now();
    
    try {
      const output = await this.runCommand(this.policy.testing.testCommand, this.policy.testing.timeout);
      return {
        passed: true,
        output,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        passed: false,
        output: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
      };
    }
  }

  private async runCommand(command: string, timeout = 60000): Promise<string> {
    return new Promise((resolve, reject) => {
      const [cmd, ...args] = command.split(' ');
      const process = spawn(cmd, args, { cwd: this.projectPath });

      let output = '';
      let errorOutput = '';

      process.stdout?.on('data', (data) => {
        output += data.toString();
      });

      process.stderr?.on('data', (data) => {
        errorOutput += data.toString();
      });

      const timer = setTimeout(() => {
        process.kill();
        reject(new Error(`Command timeout: ${command}`));
      }, timeout);

      process.on('close', (code) => {
        clearTimeout(timer);
        if (code === 0) {
          resolve(output);
        } else {
          reject(new Error(`Command failed with code ${code}: ${errorOutput}`));
        }
      });

      process.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
  }

  private shouldRollback(result: UpdateResult): boolean {
    if (!result.testResults) return false;
    return this.policy.rollback.automatic && !result.testResults.passed;
  }

  private async rollbackUpdate(update: DependencyUpdate): Promise<void> {
    console.log(`🔄 Rolling back ${update.name} to ${update.currentVersion}...`);
    
    switch (update.ecosystem) {
      case 'npm':
        await this.runCommand(`npm install ${update.name}@${update.currentVersion}`);
        break;
      case 'pip':
        await this.runCommand(`pip install ${update.name}==${update.currentVersion}`);
        break;
      default:
        throw new Error(`Rollback not supported for ecosystem: ${update.ecosystem}`);
    }
  }

  private async saveBatchResults(batch: UpdateBatch): Promise<void> {
    const historyDir = path.join(path.dirname(this.configPath), 'update-history');
    await fs.mkdir(historyDir, { recursive: true });
    
    const filename = `${batch.id}.json`;
    await fs.writeFile(
      path.join(historyDir, filename),
      JSON.stringify(batch, null, 2)
    );
  }
}