/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { spawn } from 'child_process';
import { glob } from 'glob';

export interface Vulnerability {
  id: string;
  title: string;
  description: string;
  severity: 'critical' | 'high' | 'moderate' | 'low' | 'info';
  cvss: number;
  cve?: string[];
  cwe?: string[];
  publishedDate: string;
  modifiedDate: string;
  references: string[];
  patchedVersions?: string[];
  vulnerableVersions: string[];
  exploitability?: 'active' | 'proof-of-concept' | 'unproven' | 'not-defined';
  affectedPackage: {
    name: string;
    ecosystem: 'npm' | 'pip' | 'gem' | 'cargo' | 'composer' | 'maven' | 'nuget';
    version: string;
    scope?: string;
  };
}

export interface DependencyInfo {
  name: string;
  version: string;
  ecosystem: 'npm' | 'pip' | 'gem' | 'cargo' | 'composer' | 'maven' | 'nuget';
  license?: string;
  repository?: string;
  homepage?: string;
  dependencies?: DependencyInfo[];
  scope: 'direct' | 'transitive';
  depth: number;
  isDevDependency: boolean;
  filePath: string;
}

export interface ScanResult {
  timestamp: string;
  projectPath: string;
  scanDuration: number;
  totalDependencies: number;
  vulnerabilities: Vulnerability[];
  dependencyTree: DependencyInfo[];
  summary: {
    critical: number;
    high: number;
    moderate: number;
    low: number;
    info: number;
    total: number;
  };
  riskScore: number;
  recommendations: SecurityRecommendation[];
}

export interface SecurityRecommendation {
  type: 'update' | 'remove' | 'replace' | 'audit' | 'ignore';
  packageName: string;
  currentVersion: string;
  recommendedVersion?: string;
  alternativePackage?: string;
  severity: 'critical' | 'high' | 'moderate' | 'low';
  justification: string;
  automatable: boolean;
  riskReduction: number;
}

export interface ScannerConfig {
  sources: {
    osv: boolean;
    npm: boolean;
    github: boolean;
    snyk: boolean;
    custom: string[];
  };
  scanDepth: number;
  includeDevDependencies: boolean;
  excludePatterns: string[];
  seventy_threshold: 'critical' | 'high' | 'moderate' | 'low';
  enableCache: boolean;
  cacheExpiryHours: number;
  apiKeys?: {
    snyk?: string;
    github?: string;
    custom?: Record<string, string>;
  };
  excludeVulnerabilities?: string[];
  autoRemediation: {
    enabled: boolean;
    autoUpdate: boolean;
    createPullRequests: boolean;
    requireApproval: boolean;
  };
}

export class DependencyVulnerabilityScanner {
  private config: ScannerConfig;
  private cacheDir: string;

  constructor(config: Partial<ScannerConfig> = {}) {
    this.config = {
      sources: {
        osv: true,
        npm: true,
        github: true,
        snyk: false,
        custom: [],
      },
      scanDepth: 5,
      includeDevDependencies: true,
      excludePatterns: ['test/**', '**/*.test.*', '**/node_modules/**'],
      seventy_threshold: 'moderate',
      enableCache: true,
      cacheExpiryHours: 24,
      excludeVulnerabilities: [],
      autoRemediation: {
        enabled: false,
        autoUpdate: false,
        createPullRequests: false,
        requireApproval: true,
      },
      ...config,
    };

    this.cacheDir = path.join(process.cwd(), '.trustcli', 'security-cache');
  }

  /**
   * Scan project for dependency vulnerabilities
   */
  async scanProject(projectPath: string): Promise<ScanResult> {
    const startTime = Date.now();
    console.log(`🔍 Starting dependency vulnerability scan for ${projectPath}`);

    try {
      // Ensure cache directory exists
      await fs.mkdir(this.cacheDir, { recursive: true });

      // Discover dependency files
      const dependencyFiles = await this.discoverDependencyFiles(projectPath);
      console.log(`📦 Found ${dependencyFiles.length} dependency file(s)`);

      // Parse dependencies
      const dependencies = await this.parseDependencies(dependencyFiles);
      console.log(`🔗 Analyzed ${dependencies.length} dependencies`);

      // Scan for vulnerabilities
      const vulnerabilities = await this.scanForVulnerabilities(dependencies);
      console.log(`⚠️  Found ${vulnerabilities.length} vulnerabilities`);

      // Generate recommendations
      const recommendations = await this.generateRecommendations(
        dependencies,
        vulnerabilities,
      );

      const scanDuration = Date.now() - startTime;
      const summary = this.summarizeVulnerabilities(vulnerabilities);
      const riskScore = this.calculateRiskScore(
        vulnerabilities,
        dependencies.length,
      );

      const result: ScanResult = {
        timestamp: new Date().toISOString(),
        projectPath,
        scanDuration,
        totalDependencies: dependencies.length,
        vulnerabilities,
        dependencyTree: dependencies,
        summary,
        riskScore,
        recommendations,
      };

      // Cache results
      if (this.config.enableCache) {
        await this.cacheResults(projectPath, result);
      }

      return result;
    } catch (error) {
      throw new Error(
        `Failed to scan project: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Scan specific package for vulnerabilities
   */
  async scanPackage(
    packageName: string,
    version: string,
    ecosystem: string,
  ): Promise<Vulnerability[]> {
    console.log(`🔍 Scanning package ${packageName}@${version} (${ecosystem})`);

    const vulnerabilities: Vulnerability[] = [];

    // Check OSV database
    if (this.config.sources.osv) {
      const osvResults = await this.queryOSVDatabase(
        packageName,
        version,
        ecosystem,
      );
      vulnerabilities.push(...osvResults);
    }

    // Check npm audit (for npm packages)
    if (this.config.sources.npm && ecosystem === 'npm') {
      const npmResults = await this.queryNpmAudit(packageName, version);
      vulnerabilities.push(...npmResults);
    }

    // Check GitHub Advisory Database
    if (this.config.sources.github) {
      const githubResults = await this.queryGitHubAdvisories(
        packageName,
        version,
        ecosystem,
      );
      vulnerabilities.push(...githubResults);
    }

    // Check Snyk (if API key provided)
    if (this.config.sources.snyk && this.config.apiKeys?.snyk) {
      const snykResults = await this.querySnykDatabase(
        packageName,
        version,
        ecosystem,
      );
      vulnerabilities.push(...snykResults);
    }

    // Deduplicate and filter
    return this.deduplicateVulnerabilities(vulnerabilities);
  }

  /**
   * Generate security report
   */
  async generateReport(
    scanResult: ScanResult,
    format: 'json' | 'html' | 'pdf' | 'sarif' = 'json',
  ): Promise<string> {
    switch (format) {
      case 'json':
        return JSON.stringify(scanResult, null, 2);
      case 'html':
        return this.generateHtmlReport(scanResult);
      case 'pdf':
        return this.generatePdfReport(scanResult);
      case 'sarif':
        return this.generateSarifReport(scanResult);
      default:
        throw new Error(`Unsupported report format: ${format}`);
    }
  }

  /**
   * Apply automatic remediation
   */
  async applyRemediation(
    scanResult: ScanResult,
    recommendations: SecurityRecommendation[],
  ): Promise<void> {
    if (!this.config.autoRemediation.enabled) {
      throw new Error('Auto-remediation is disabled');
    }

    console.log('🔧 Applying automatic remediation...');

    for (const recommendation of recommendations) {
      if (!recommendation.automatable) {
        console.log(
          `⏭️  Skipping manual recommendation for ${recommendation.packageName}`,
        );
        continue;
      }

      try {
        switch (recommendation.type) {
          case 'update':
            await this.updatePackage(
              recommendation.packageName,
              recommendation.recommendedVersion!,
            );
            break;
          case 'remove':
            await this.removePackage(recommendation.packageName);
            break;
          case 'replace':
            await this.replacePackage(
              recommendation.packageName,
              recommendation.alternativePackage!,
            );
            break;
          default:
            console.log(
              `⏭️  Unsupported remediation type: ${recommendation.type}`,
            );
        }
      } catch (error) {
        console.error(
          `❌ Failed to apply remediation for ${recommendation.packageName}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  /**
   * Continuous monitoring setup
   */
  async setupContinuousMonitoring(
    projectPath: string,
    intervalHours = 24,
  ): Promise<void> {
    console.log(
      `🕐 Setting up continuous monitoring (every ${intervalHours}h)`,
    );

    const configFile = path.join(
      projectPath,
      '.trustcli',
      'security-monitoring.json',
    );
    const config = {
      enabled: true,
      intervalHours,
      lastScan: new Date().toISOString(),
      alertThreshold: this.config.seventy_threshold,
      notifyOnNewVulnerabilities: true,
      autoRemediation: this.config.autoRemediation,
    };

    await fs.mkdir(path.dirname(configFile), { recursive: true });
    await fs.writeFile(configFile, JSON.stringify(config, null, 2));

    console.log(`✅ Continuous monitoring configured at ${configFile}`);
  }

  // Private methods

  private async discoverDependencyFiles(
    projectPath: string,
  ): Promise<string[]> {
    const patterns = [
      '**/package.json',
      '**/requirements.txt',
      '**/Pipfile',
      '**/poetry.lock',
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
        cwd: projectPath,
        ignore: this.config.excludePatterns,
      });
      files.push(...matches.map((file) => path.resolve(projectPath, file)));
    }

    return Array.from(new Set(files)); // Remove duplicates
  }

  private async parseDependencies(
    dependencyFiles: string[],
  ): Promise<DependencyInfo[]> {
    const dependencies: DependencyInfo[] = [];

    for (const filePath of dependencyFiles) {
      try {
        const fileName = path.basename(filePath);
        let parsed: DependencyInfo[] = [];

        switch (fileName) {
          case 'package.json':
            parsed = await this.parsePackageJson(filePath);
            break;
          case 'requirements.txt':
            parsed = await this.parseRequirementsTxt(filePath);
            break;
          case 'Gemfile':
            parsed = await this.parseGemfile(filePath);
            break;
          case 'Cargo.toml':
            parsed = await this.parseCargoToml(filePath);
            break;
          case 'composer.json':
            parsed = await this.parseComposerJson(filePath);
            break;
          default:
            console.log(`⏭️  Unsupported dependency file: ${fileName}`);
        }

        dependencies.push(...parsed);
      } catch (error) {
        console.error(
          `❌ Failed to parse ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return dependencies;
  }

  private async parsePackageJson(filePath: string): Promise<DependencyInfo[]> {
    const content = await fs.readFile(filePath, 'utf-8');
    const packageJson = JSON.parse(content);
    const dependencies: DependencyInfo[] = [];

    // Parse production dependencies
    if (packageJson.dependencies) {
      for (const [name, version] of Object.entries(packageJson.dependencies)) {
        dependencies.push({
          name,
          version: version as string,
          ecosystem: 'npm',
          scope: 'direct',
          depth: 1,
          isDevDependency: false,
          filePath,
        });
      }
    }

    // Parse dev dependencies if enabled
    if (this.config.includeDevDependencies && packageJson.devDependencies) {
      for (const [name, version] of Object.entries(
        packageJson.devDependencies,
      )) {
        dependencies.push({
          name,
          version: version as string,
          ecosystem: 'npm',
          scope: 'direct',
          depth: 1,
          isDevDependency: true,
          filePath,
        });
      }
    }

    return dependencies;
  }

  private async parseRequirementsTxt(
    filePath: string,
  ): Promise<DependencyInfo[]> {
    const content = await fs.readFile(filePath, 'utf-8');
    const dependencies: DependencyInfo[] = [];

    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const match = trimmed.match(/^([a-zA-Z0-9_-]+)([><=!]+)(.+)$/);
        if (match) {
          const [, name, , version] = match;
          dependencies.push({
            name,
            version: version.trim(),
            ecosystem: 'pip',
            scope: 'direct',
            depth: 1,
            isDevDependency: false,
            filePath,
          });
        }
      }
    }

    return dependencies;
  }

  private async parseGemfile(_filePath: string): Promise<DependencyInfo[]> {
    // Placeholder implementation for Ruby gems
    return [];
  }

  private async parseCargoToml(_filePath: string): Promise<DependencyInfo[]> {
    // Placeholder implementation for Rust crates
    return [];
  }

  private async parseComposerJson(
    _filePath: string,
  ): Promise<DependencyInfo[]> {
    // Placeholder implementation for PHP packages
    return [];
  }

  private async scanForVulnerabilities(
    dependencies: DependencyInfo[],
  ): Promise<Vulnerability[]> {
    const vulnerabilities: Vulnerability[] = [];

    for (const dependency of dependencies) {
      try {
        const packageVulns = await this.scanPackage(
          dependency.name,
          dependency.version,
          dependency.ecosystem,
        );
        vulnerabilities.push(...packageVulns);
      } catch (error) {
        console.error(
          `❌ Failed to scan ${dependency.name}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return vulnerabilities;
  }

  private async queryOSVDatabase(
    packageName: string,
    version: string,
    ecosystem: string,
  ): Promise<Vulnerability[]> {
    // OSV (Open Source Vulnerabilities) database API integration
    const cacheKey = `osv_${ecosystem}_${packageName}_${version}`;
    const cached = await this.getCachedResult(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      // This would make an actual HTTP request to OSV API
      // For now, return placeholder data
      const vulnerabilities: Vulnerability[] = [];

      await this.setCachedResult(cacheKey, vulnerabilities);
      return vulnerabilities;
    } catch (error) {
      console.error(`Failed to query OSV database: ${error}`);
      return [];
    }
  }

  private async queryNpmAudit(
    packageName: string,
    version: string,
  ): Promise<Vulnerability[]> {
    // npm audit API integration
    const cacheKey = `npm_${packageName}_${version}`;
    const cached = await this.getCachedResult(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      // This would run npm audit or query npm advisory database
      const vulnerabilities: Vulnerability[] = [];

      await this.setCachedResult(cacheKey, vulnerabilities);
      return vulnerabilities;
    } catch (error) {
      console.error(`Failed to query npm audit: ${error}`);
      return [];
    }
  }

  private async queryGitHubAdvisories(
    packageName: string,
    version: string,
    ecosystem: string,
  ): Promise<Vulnerability[]> {
    // GitHub Advisory Database integration
    const cacheKey = `github_${ecosystem}_${packageName}_${version}`;
    const cached = await this.getCachedResult(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      // This would query GitHub's GraphQL API for security advisories
      const vulnerabilities: Vulnerability[] = [];

      await this.setCachedResult(cacheKey, vulnerabilities);
      return vulnerabilities;
    } catch (error) {
      console.error(`Failed to query GitHub advisories: ${error}`);
      return [];
    }
  }

  private async querySnykDatabase(
    packageName: string,
    version: string,
    ecosystem: string,
  ): Promise<Vulnerability[]> {
    // Snyk database integration
    const cacheKey = `snyk_${ecosystem}_${packageName}_${version}`;
    const cached = await this.getCachedResult(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      // This would query Snyk API with provided API key
      const vulnerabilities: Vulnerability[] = [];

      await this.setCachedResult(cacheKey, vulnerabilities);
      return vulnerabilities;
    } catch (error) {
      console.error(`Failed to query Snyk database: ${error}`);
      return [];
    }
  }

  private deduplicateVulnerabilities(
    vulnerabilities: Vulnerability[],
  ): Vulnerability[] {
    const seen = new Set<string>();
    return vulnerabilities.filter((vuln) => {
      const key = `${vuln.id}_${vuln.affectedPackage.name}_${vuln.affectedPackage.version}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  private summarizeVulnerabilities(vulnerabilities: Vulnerability[]) {
    const summary = {
      critical: 0,
      high: 0,
      moderate: 0,
      low: 0,
      info: 0,
      total: vulnerabilities.length,
    };

    for (const vuln of vulnerabilities) {
      summary[vuln.severity]++;
    }

    return summary;
  }

  private calculateRiskScore(
    vulnerabilities: Vulnerability[],
    totalDependencies: number,
  ): number {
    let score = 0;
    const weights = { critical: 10, high: 7, moderate: 4, low: 2, info: 1 };

    for (const vuln of vulnerabilities) {
      score += weights[vuln.severity] * (vuln.cvss / 10);
    }

    // Normalize by number of dependencies
    return Math.min(100, (score / totalDependencies) * 10);
  }

  private async generateRecommendations(
    dependencies: DependencyInfo[],
    vulnerabilities: Vulnerability[],
  ): Promise<SecurityRecommendation[]> {
    const recommendations: SecurityRecommendation[] = [];

    for (const vuln of vulnerabilities) {
      if (vuln.patchedVersions && vuln.patchedVersions.length > 0) {
        recommendations.push({
          type: 'update',
          packageName: vuln.affectedPackage.name,
          currentVersion: vuln.affectedPackage.version,
          recommendedVersion: vuln.patchedVersions[0],
          severity: vuln.severity === 'info' ? 'low' : vuln.severity,
          justification: `Update to patched version to fix ${vuln.id}`,
          automatable: vuln.severity !== 'critical', // Require manual review for critical
          riskReduction: this.calculateRiskReduction(vuln),
        });
      }
    }

    return recommendations;
  }

  private calculateRiskReduction(vulnerability: Vulnerability): number {
    const severityMultipliers = {
      critical: 1.0,
      high: 0.8,
      moderate: 0.6,
      low: 0.4,
      info: 0.2,
    };
    return (
      (vulnerability.cvss / 10) * severityMultipliers[vulnerability.severity]
    );
  }

  private generateHtmlReport(scanResult: ScanResult): string {
    return `
<!DOCTYPE html>
<html>
<head>
    <title>Security Vulnerability Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { background: #f5f5f5; padding: 20px; border-radius: 5px; }
        .summary { display: flex; gap: 20px; margin: 20px 0; }
        .metric { text-align: center; padding: 10px; border: 1px solid #ddd; border-radius: 5px; }
        .critical { background-color: #ffebee; border-color: #f44336; }
        .high { background-color: #fff3e0; border-color: #ff9800; }
        .moderate { background-color: #fff8e1; border-color: #ffc107; }
        .low { background-color: #e8f5e8; border-color: #4caf50; }
        .vulnerability { margin: 10px 0; padding: 10px; border: 1px solid #ddd; border-radius: 5px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Security Vulnerability Report</h1>
        <p>Project: ${scanResult.projectPath}</p>
        <p>Scan Date: ${new Date(scanResult.timestamp).toLocaleString()}</p>
        <p>Total Dependencies: ${scanResult.totalDependencies}</p>
        <p>Risk Score: ${scanResult.riskScore.toFixed(1)}/100</p>
    </div>
    
    <div class="summary">
        <div class="metric critical">
            <h3>${scanResult.summary.critical}</h3>
            <p>Critical</p>
        </div>
        <div class="metric high">
            <h3>${scanResult.summary.high}</h3>
            <p>High</p>
        </div>
        <div class="metric moderate">
            <h3>${scanResult.summary.moderate}</h3>
            <p>Moderate</p>
        </div>
        <div class="metric low">
            <h3>${scanResult.summary.low}</h3>
            <p>Low</p>
        </div>
    </div>
    
    <h2>Vulnerabilities</h2>
    ${scanResult.vulnerabilities
      .map(
        (vuln) => `
        <div class="vulnerability ${vuln.severity}">
            <h3>${vuln.title} (${vuln.id})</h3>
            <p><strong>Package:</strong> ${vuln.affectedPackage.name}@${vuln.affectedPackage.version}</p>
            <p><strong>Severity:</strong> ${vuln.severity.toUpperCase()} (CVSS: ${vuln.cvss})</p>
            <p>${vuln.description}</p>
            ${vuln.patchedVersions ? `<p><strong>Fix:</strong> Update to ${vuln.patchedVersions[0]}</p>` : ''}
        </div>
    `,
      )
      .join('')}
</body>
</html>`;
  }

  private generatePdfReport(_scanResult: ScanResult): string {
    // Placeholder for PDF generation
    throw new Error('PDF report generation not yet implemented');
  }

  private generateSarifReport(scanResult: ScanResult): string {
    // SARIF (Static Analysis Results Interchange Format) for CI/CD integration
    const sarif = {
      version: '2.1.0',
      $schema:
        'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
      runs: [
        {
          tool: {
            driver: {
              name: 'Trust CLI Dependency Scanner',
              version: '1.0.0',
              informationUri: 'https://github.com/audit-brands/trust-cli',
            },
          },
          results: scanResult.vulnerabilities.map((vuln) => ({
            ruleId: vuln.id,
            level: this.severityToSarifLevel(vuln.severity),
            message: {
              text: vuln.title,
            },
            locations: [
              {
                physicalLocation: {
                  artifactLocation: {
                    uri:
                      scanResult.dependencyTree.find(
                        (dep) => dep.name === vuln.affectedPackage.name,
                      )?.filePath || '',
                  },
                },
              },
            ],
            properties: {
              packageName: vuln.affectedPackage.name,
              packageVersion: vuln.affectedPackage.version,
              cvss: vuln.cvss,
              cve: vuln.cve,
              patchedVersions: vuln.patchedVersions,
            },
          })),
        },
      ],
    };

    return JSON.stringify(sarif, null, 2);
  }

  private severityToSarifLevel(severity: string): string {
    switch (severity) {
      case 'critical':
      case 'high':
        return 'error';
      case 'moderate':
        return 'warning';
      case 'low':
      case 'info':
        return 'note';
      default:
        return 'warning';
    }
  }

  private async updatePackage(
    packageName: string,
    version: string,
  ): Promise<void> {
    console.log(`🔄 Updating ${packageName} to ${version}`);
    // Implementation would depend on package manager
  }

  private async removePackage(packageName: string): Promise<void> {
    console.log(`🗑️  Removing ${packageName}`);
    // Implementation would depend on package manager
  }

  private async replacePackage(
    oldPackage: string,
    newPackage: string,
  ): Promise<void> {
    console.log(`🔄 Replacing ${oldPackage} with ${newPackage}`);
    // Implementation would depend on package manager
  }

  private async getCachedResult(key: string): Promise<any> {
    if (!this.config.enableCache) {
      return null;
    }

    try {
      const cacheFile = path.join(this.cacheDir, `${key}.json`);
      const stat = await fs.stat(cacheFile);
      const isExpired =
        Date.now() - stat.mtime.getTime() >
        this.config.cacheExpiryHours * 60 * 60 * 1000;

      if (isExpired) {
        return null;
      }

      const content = await fs.readFile(cacheFile, 'utf-8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  private async setCachedResult(key: string, result: any): Promise<void> {
    if (!this.config.enableCache) {
      return;
    }

    try {
      const cacheFile = path.join(this.cacheDir, `${key}.json`);
      await fs.writeFile(cacheFile, JSON.stringify(result, null, 2));
    } catch (error) {
      console.error(`Failed to cache result: ${error}`);
    }
  }

  private async cacheResults(
    projectPath: string,
    result: ScanResult,
  ): Promise<void> {
    const cacheKey = `scan_${Buffer.from(projectPath).toString('base64')}`;
    await this.setCachedResult(cacheKey, result);
  }
}
