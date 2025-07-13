/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  DependencyVulnerabilityScanner,
  ScannerConfig,
  ScanResult,
  SecurityRecommendation,
} from '@trust-cli/trust-cli-core';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface SecurityCommandArgs {
  action: 'scan' | 'monitor' | 'report' | 'remediate' | 'configure' | 'status';
  subaction?: string;
  path?: string;
  package?: string;
  version?: string;
  format?: 'json' | 'html' | 'pdf' | 'sarif';
  output?: string;
  severity?: 'critical' | 'high' | 'moderate' | 'low';
  autofix?: boolean;
  continuous?: boolean;
  intervalHours?: number;
  includeDevDeps?: boolean;
  excludePatterns?: string[];
  sources?: string[];
  apiKey?: string;
  service?: string;
  force?: boolean;
  verbose?: boolean;
}

export class SecurityCommandHandler {
  private scanner: DependencyVulnerabilityScanner;
  private configPath: string;

  constructor() {
    this.configPath = path.join(
      process.cwd(),
      '.trustcli',
      'security-config.json',
    );
    this.scanner = new DependencyVulnerabilityScanner();
  }

  async initialize(): Promise<void> {
    try {
      const config = await this.loadConfig();
      this.scanner = new DependencyVulnerabilityScanner(config);
    } catch {
      // Use default config if none exists
    }
  }

  async handleCommand(args: SecurityCommandArgs): Promise<void> {
    await this.initialize();

    switch (args.action) {
      case 'scan':
        await this.handleScanCommand(args);
        break;
      case 'monitor':
        await this.handleMonitorCommand(args);
        break;
      case 'report':
        await this.handleReportCommand(args);
        break;
      case 'remediate':
        await this.handleRemediateCommand(args);
        break;
      case 'configure':
        await this.handleConfigureCommand(args);
        break;
      case 'status':
        await this.handleStatusCommand(args);
        break;
      default:
        throw new Error(`Unknown security action: ${args.action}`);
    }
  }

  private async handleScanCommand(args: SecurityCommandArgs): Promise<void> {
    const projectPath = args.path || process.cwd();

    console.log('🛡️  Trust CLI - Security Vulnerability Scanner');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`📂 Scanning: ${projectPath}`);

    try {
      const scanResult = await this.scanner.scanProject(projectPath);

      await this.displayScanResults(scanResult, args.verbose);

      // Save results if output specified
      if (args.output) {
        const format = args.format || 'json';
        const report = await this.scanner.generateReport(scanResult, format);
        await fs.writeFile(args.output, report);
        console.log(`\n📄 Report saved to: ${args.output}`);
      }

      // Show recommendations
      if (scanResult.recommendations.length > 0) {
        console.log('\n💡 Security Recommendations:');
        console.log(
          '═══════════════════════════════════════════════════════════',
        );

        scanResult.recommendations
          .sort((a, b) => b.riskReduction - a.riskReduction)
          .slice(0, 5)
          .forEach((rec, index) => {
            const icon = this.getRecommendationIcon(rec.type);
            const autoText = rec.automatable ? '🤖 Automatable' : '👤 Manual';

            console.log(`\n${index + 1}. ${icon} ${rec.packageName}`);
            console.log(`   Current: ${rec.currentVersion}`);
            if (rec.recommendedVersion) {
              console.log(`   Recommended: ${rec.recommendedVersion}`);
            }
            if (rec.alternativePackage) {
              console.log(`   Alternative: ${rec.alternativePackage}`);
            }
            console.log(
              `   Risk Reduction: ${(rec.riskReduction * 100).toFixed(1)}%`,
            );
            console.log(
              `   ${autoText} | Severity: ${rec.severity.toUpperCase()}`,
            );
            console.log(`   ${rec.justification}`);
          });

        if (args.autofix) {
          console.log('\n🔧 Applying automatic fixes...');
          const automatableRecs = scanResult.recommendations.filter(
            (r) => r.automatable,
          );
          if (automatableRecs.length > 0) {
            await this.scanner.applyRemediation(scanResult, automatableRecs);
            console.log(`✅ Applied ${automatableRecs.length} automatic fixes`);
          } else {
            console.log('⚠️  No automatic fixes available');
          }
        }
      }
    } catch (error) {
      console.error(
        `❌ Scan failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  private async handleMonitorCommand(args: SecurityCommandArgs): Promise<void> {
    const projectPath = args.path || process.cwd();

    if (args.subaction === 'start') {
      const intervalHours = args.intervalHours || 24;
      console.log(
        `🕐 Setting up continuous monitoring (every ${intervalHours}h)`,
      );

      await this.scanner.setupContinuousMonitoring(projectPath, intervalHours);
      console.log('✅ Continuous monitoring enabled');
    } else if (args.subaction === 'stop') {
      const configFile = path.join(
        projectPath,
        '.trustcli',
        'security-monitoring.json',
      );
      try {
        const config = JSON.parse(await fs.readFile(configFile, 'utf-8'));
        config.enabled = false;
        await fs.writeFile(configFile, JSON.stringify(config, null, 2));
        console.log('⏹️  Continuous monitoring disabled');
      } catch {
        console.log('⚠️  No monitoring configuration found');
      }
    } else if (args.subaction === 'status') {
      const configFile = path.join(
        projectPath,
        '.trustcli',
        'security-monitoring.json',
      );
      try {
        const config = JSON.parse(await fs.readFile(configFile, 'utf-8'));
        console.log('\n🕐 Continuous Monitoring Status:');
        console.log(
          '═══════════════════════════════════════════════════════════',
        );
        console.log(`Status: ${config.enabled ? '✅ Enabled' : '❌ Disabled'}`);
        console.log(`Interval: Every ${config.intervalHours} hours`);
        console.log(`Last Scan: ${new Date(config.lastScan).toLocaleString()}`);
        console.log(`Alert Threshold: ${config.alertThreshold}`);
      } catch {
        console.log('⚠️  No monitoring configuration found');
      }
    } else {
      console.log('📊 Security monitoring commands:');
      console.log('   trust security monitor start [--interval-hours 24]');
      console.log('   trust security monitor stop');
      console.log('   trust security monitor status');
    }
  }

  private async handleReportCommand(args: SecurityCommandArgs): Promise<void> {
    const projectPath = args.path || process.cwd();

    if (args.subaction === 'generate') {
      console.log('📊 Generating security report...');

      const scanResult = await this.scanner.scanProject(projectPath);
      const format = args.format || 'html';
      const report = await this.scanner.generateReport(scanResult, format);

      const outputFile = args.output || `security-report.${format}`;
      await fs.writeFile(outputFile, report);

      console.log(`✅ Report generated: ${outputFile}`);
      console.log(`📄 Format: ${format.toUpperCase()}`);
      console.log(`🔍 Vulnerabilities: ${scanResult.vulnerabilities.length}`);
      console.log(`📦 Dependencies: ${scanResult.totalDependencies}`);
      console.log(`🎯 Risk Score: ${scanResult.riskScore.toFixed(1)}/100`);
    } else if (args.subaction === 'history') {
      console.log('📈 Security scan history:');
      console.log('🚧 Feature coming soon - historical trend analysis');
    } else {
      console.log('📊 Security report commands:');
      console.log(
        '   trust security report generate [--format html|json|pdf|sarif] [--output file]',
      );
      console.log('   trust security report history');
    }
  }

  private async handleRemediateCommand(
    args: SecurityCommandArgs,
  ): Promise<void> {
    const projectPath = args.path || process.cwd();

    if (args.subaction === 'auto') {
      console.log('🔧 Running automatic remediation...');

      const scanResult = await this.scanner.scanProject(projectPath);
      const recommendations = scanResult.recommendations.filter((r) => {
        if (args.severity) {
          return this.compareSeverity(r.severity, args.severity) >= 0;
        }
        return r.automatable;
      });

      if (recommendations.length === 0) {
        console.log('⚠️  No automatic remediation available');
        return;
      }

      console.log(`🎯 Found ${recommendations.length} automatic fixes`);

      if (!args.force) {
        console.log('\n📋 Planned Changes:');
        recommendations.forEach((rec, index) => {
          console.log(
            `${index + 1}. ${rec.packageName}: ${rec.currentVersion} → ${rec.recommendedVersion || rec.alternativePackage}`,
          );
        });
        console.log('\n⚠️  Use --force to apply these changes');
        return;
      }

      await this.scanner.applyRemediation(scanResult, recommendations);
      console.log(`✅ Applied ${recommendations.length} fixes`);
    } else if (args.subaction === 'plan') {
      console.log('📋 Creating remediation plan...');

      const scanResult = await this.scanner.scanProject(projectPath);
      const plan = this.createRemediationPlan(
        scanResult.recommendations,
        args.severity,
      );

      console.log('\n🎯 Remediation Plan:');
      console.log(
        '═══════════════════════════════════════════════════════════',
      );

      plan.automatic.forEach((rec, index) => {
        console.log(`\n🤖 Auto-fix ${index + 1}: ${rec.packageName}`);
        console.log(`   ${rec.justification}`);
        console.log(
          `   Risk Reduction: ${(rec.riskReduction * 100).toFixed(1)}%`,
        );
      });

      plan.manual.forEach((rec, index) => {
        console.log(`\n👤 Manual ${index + 1}: ${rec.packageName}`);
        console.log(`   ${rec.justification}`);
        console.log(
          `   Risk Reduction: ${(rec.riskReduction * 100).toFixed(1)}%`,
        );
      });

      console.log(`\n📊 Summary:`);
      console.log(`   Automatic fixes: ${plan.automatic.length}`);
      console.log(`   Manual review required: ${plan.manual.length}`);
      console.log(
        `   Total risk reduction: ${plan.totalRiskReduction.toFixed(1)}%`,
      );
    } else {
      console.log('🔧 Security remediation commands:');
      console.log(
        '   trust security remediate auto [--severity critical|high|moderate|low] [--force]',
      );
      console.log(
        '   trust security remediate plan [--severity critical|high|moderate|low]',
      );
    }
  }

  private async handleConfigureCommand(
    args: SecurityCommandArgs,
  ): Promise<void> {
    if (args.subaction === 'show') {
      const config = await this.loadConfig();
      console.log('\n⚙️  Security Scanner Configuration:');
      console.log(
        '═══════════════════════════════════════════════════════════',
      );
      const enabledSources = [];
      if (config.sources?.osv) enabledSources.push('osv');
      if (config.sources?.npm) enabledSources.push('npm');
      if (config.sources?.github) enabledSources.push('github');
      if (config.sources?.snyk) enabledSources.push('snyk');
      if (config.sources?.custom) enabledSources.push(...config.sources.custom);
      console.log(`Sources: ${enabledSources.join(', ')}`);
      console.log(`Scan Depth: ${config.scanDepth}`);
      console.log(
        `Include Dev Dependencies: ${config.includeDevDependencies ? '✅' : '❌'}`,
      );
      console.log(`Severity Threshold: ${config.seventy_threshold}`);
      console.log(`Cache Enabled: ${config.enableCache ? '✅' : '❌'}`);
      console.log(
        `Auto-remediation: ${config.autoRemediation?.enabled ? '✅' : '❌'}`,
      );
    } else if (args.subaction === 'set') {
      if (!args.service || args.apiKey === undefined) {
        throw new Error(
          'API key configuration requires --service and --api-key',
        );
      }

      await this.setApiKey(args.service, args.apiKey);
      console.log(`✅ API key configured for ${args.service}`);
    } else if (args.subaction === 'sources') {
      if (args.sources) {
        await this.configureSources(args.sources);
        console.log(
          `✅ Vulnerability sources updated: ${args.sources.join(', ')}`,
        );
      } else {
        console.log('Available vulnerability sources:');
        console.log('   osv     - Open Source Vulnerabilities database');
        console.log('   npm     - npm audit database');
        console.log('   github  - GitHub Advisory Database');
        console.log(
          '   snyk    - Snyk vulnerability database (requires API key)',
        );
      }
    } else {
      console.log('⚙️  Security configuration commands:');
      console.log('   trust security configure show');
      console.log(
        '   trust security configure set --service snyk --api-key <key>',
      );
      console.log('   trust security configure sources [osv,npm,github,snyk]');
    }
  }

  private async handleStatusCommand(_args: SecurityCommandArgs): Promise<void> {
    console.log('\n🛡️  Trust CLI - Security Status');
    console.log('═══════════════════════════════════════════════════════════');

    // Check for recent scans
    const cacheDir = path.join(process.cwd(), '.trustcli', 'security-cache');
    try {
      const files = await fs.readdir(cacheDir);
      const scanFiles = files.filter((f) => f.startsWith('scan_'));

      if (scanFiles.length > 0) {
        const latest = scanFiles.sort().pop();
        const scanData = JSON.parse(
          await fs.readFile(path.join(cacheDir, latest!), 'utf-8'),
        );

        console.log('📊 Last Security Scan:');
        console.log(
          `   Date: ${new Date(scanData.timestamp).toLocaleString()}`,
        );
        console.log(`   Dependencies: ${scanData.totalDependencies}`);
        console.log(`   Vulnerabilities: ${scanData.vulnerabilities.length}`);
        console.log(`   Risk Score: ${scanData.riskScore.toFixed(1)}/100`);

        const summary = scanData.summary;
        if (summary.critical > 0) {
          console.log(`   ⚠️  ${summary.critical} critical vulnerabilities`);
        }
        if (summary.high > 0) {
          console.log(`   ⚠️  ${summary.high} high severity vulnerabilities`);
        }
      } else {
        console.log('📊 No recent scans found');
      }
    } catch {
      console.log('📊 No scan data available');
    }

    // Check monitoring status
    const monitoringFile = path.join(
      process.cwd(),
      '.trustcli',
      'security-monitoring.json',
    );
    try {
      const monitoring = JSON.parse(await fs.readFile(monitoringFile, 'utf-8'));
      console.log('\n🕐 Continuous Monitoring:');
      console.log(
        `   Status: ${monitoring.enabled ? '✅ Active' : '❌ Inactive'}`,
      );
      if (monitoring.enabled) {
        console.log(`   Interval: ${monitoring.intervalHours} hours`);
      }
    } catch {
      console.log('\n🕐 Continuous Monitoring: ❌ Not configured');
    }

    // Check configuration
    try {
      const config = await this.loadConfig();
      console.log('\n⚙️  Configuration:');
      const enabledSourcesStatus = [];
      if (config.sources?.osv) enabledSourcesStatus.push('osv');
      if (config.sources?.npm) enabledSourcesStatus.push('npm');
      if (config.sources?.github) enabledSourcesStatus.push('github');
      if (config.sources?.snyk) enabledSourcesStatus.push('snyk');
      if (config.sources?.custom)
        enabledSourcesStatus.push(...config.sources.custom);
      console.log(`   Sources: ${enabledSourcesStatus.join(', ')}`);
      console.log(
        `   Auto-remediation: ${config.autoRemediation?.enabled ? '✅' : '❌'}`,
      );
    } catch {
      console.log('\n⚙️  Configuration: Using defaults');
    }
  }

  // Private helper methods

  private async displayScanResults(
    scanResult: ScanResult,
    verbose = false,
  ): Promise<void> {
    console.log(`\n📊 Scan Results:`);
    console.log(`   Dependencies Scanned: ${scanResult.totalDependencies}`);
    console.log(
      `   Scan Duration: ${(scanResult.scanDuration / 1000).toFixed(2)}s`,
    );
    console.log(`   Risk Score: ${scanResult.riskScore.toFixed(1)}/100`);

    const summary = scanResult.summary;
    if (summary.total === 0) {
      console.log('\n✅ No vulnerabilities found!');
      return;
    }

    console.log(`\n⚠️  Found ${summary.total} vulnerabilities:`);
    if (summary.critical > 0) {
      console.log(`   🔴 Critical: ${summary.critical}`);
    }
    if (summary.high > 0) {
      console.log(`   🟠 High: ${summary.high}`);
    }
    if (summary.moderate > 0) {
      console.log(`   🟡 Moderate: ${summary.moderate}`);
    }
    if (summary.low > 0) {
      console.log(`   🟢 Low: ${summary.low}`);
    }
    if (summary.info > 0) {
      console.log(`   ℹ️  Info: ${summary.info}`);
    }

    if (verbose && scanResult.vulnerabilities.length > 0) {
      console.log('\n🔍 Vulnerability Details:');
      console.log(
        '═══════════════════════════════════════════════════════════',
      );

      const topVulns = scanResult.vulnerabilities
        .sort((a, b) => b.cvss - a.cvss)
        .slice(0, 10);

      topVulns.forEach((vuln, index) => {
        const icon = this.getSeverityIcon(vuln.severity);
        console.log(`\n${index + 1}. ${icon} ${vuln.title} (${vuln.id})`);
        console.log(
          `   Package: ${vuln.affectedPackage.name}@${vuln.affectedPackage.version}`,
        );
        console.log(
          `   CVSS: ${vuln.cvss} | Severity: ${vuln.severity.toUpperCase()}`,
        );
        if (vuln.cve && vuln.cve.length > 0) {
          console.log(`   CVE: ${vuln.cve.join(', ')}`);
        }
        if (vuln.patchedVersions && vuln.patchedVersions.length > 0) {
          console.log(`   Fix: Update to ${vuln.patchedVersions[0]}`);
        }
      });
    }
  }

  private getSeverityIcon(severity: string): string {
    switch (severity) {
      case 'critical':
        return '🔴';
      case 'high':
        return '🟠';
      case 'moderate':
        return '🟡';
      case 'low':
        return '🟢';
      case 'info':
        return 'ℹ️';
      default:
        return '⚠️';
    }
  }

  private getRecommendationIcon(type: string): string {
    switch (type) {
      case 'update':
        return '🔄';
      case 'remove':
        return '🗑️';
      case 'replace':
        return '🔄';
      case 'audit':
        return '🔍';
      case 'ignore':
        return '⏭️';
      default:
        return '💡';
    }
  }

  private compareSeverity(severity1: string, severity2: string): number {
    const levels = { critical: 4, high: 3, moderate: 2, low: 1, info: 0 };
    return (
      levels[severity1 as keyof typeof levels] -
      levels[severity2 as keyof typeof levels]
    );
  }

  private createRemediationPlan(
    recommendations: SecurityRecommendation[],
    minSeverity?: string,
  ) {
    const filtered = minSeverity
      ? recommendations.filter(
          (r) => this.compareSeverity(r.severity, minSeverity) >= 0,
        )
      : recommendations;

    const automatic = filtered.filter((r) => r.automatable);
    const manual = filtered.filter((r) => !r.automatable);
    const totalRiskReduction = filtered.reduce(
      (sum, r) => sum + r.riskReduction,
      0,
    );

    return {
      automatic: automatic.sort((a, b) => b.riskReduction - a.riskReduction),
      manual: manual.sort((a, b) => b.riskReduction - a.riskReduction),
      totalRiskReduction: totalRiskReduction * 100,
    };
  }

  private async loadConfig(): Promise<Partial<ScannerConfig>> {
    try {
      const content = await fs.readFile(this.configPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return {};
    }
  }

  private async saveConfig(config: Partial<ScannerConfig>): Promise<void> {
    await fs.mkdir(path.dirname(this.configPath), { recursive: true });
    await fs.writeFile(this.configPath, JSON.stringify(config, null, 2));
  }

  private async setApiKey(service: string, apiKey: string): Promise<void> {
    const config = await this.loadConfig();
    if (!config.apiKeys) {
      config.apiKeys = {};
    }

    // Type-safe assignment to specific service properties
    if (service === 'snyk') {
      config.apiKeys.snyk = apiKey;
    } else if (service === 'github') {
      config.apiKeys.github = apiKey;
    } else {
      // For custom services
      if (!config.apiKeys.custom) {
        config.apiKeys.custom = {};
      }
      config.apiKeys.custom[service] = apiKey;
    }

    await this.saveConfig(config);
  }

  private async configureSources(sources: string[]): Promise<void> {
    const config = await this.loadConfig();
    if (!config.sources) {
      config.sources = {
        osv: false,
        npm: false,
        github: false,
        snyk: false,
        custom: [],
      };
    }

    // Reset all sources
    if (config.sources) {
      config.sources.osv = false;
      config.sources.npm = false;
      config.sources.github = false;
      config.sources.snyk = false;
      // Keep custom array as is
    }

    // Enable specified sources
    sources.forEach((source) => {
      if (config.sources) {
        if (source === 'osv') config.sources.osv = true;
        else if (source === 'npm') config.sources.npm = true;
        else if (source === 'github') config.sources.github = true;
        else if (source === 'snyk') config.sources.snyk = true;
        else if (!config.sources.custom.includes(source)) {
          config.sources.custom.push(source);
        }
      }
    });

    await this.saveConfig(config);
  }
}

export async function handleSecurityCommand(
  args: SecurityCommandArgs,
): Promise<void> {
  const handler = new SecurityCommandHandler();
  await handler.handleCommand(args);
}
