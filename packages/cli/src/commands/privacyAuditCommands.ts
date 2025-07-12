/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  PrivacyAuditEngine,
  PrivacyAuditConfig,
  ComplianceFramework,
  SecurityRecommendationEngine,
  SecurityAssessmentConfig,
  PrivacyManager,
  PerformanceMonitor,
} from '@trust-cli/trust-cli-core';
import chalk from 'chalk';

export interface PrivacyAuditCommandArgs {
  action: 'audit' | 'security' | 'compliance' | 'report' | 'history';
  framework?: string;
  depth?: 'basic' | 'standard' | 'comprehensive';
  format?: 'text' | 'json' | 'csv';
  output?: string;
  verbose?: boolean;
}

class PrivacyAuditCommandHandler {
  private privacyManager: PrivacyManager;
  private auditEngine: PrivacyAuditEngine;
  private securityEngine: SecurityRecommendationEngine;
  private performanceMonitor: PerformanceMonitor;

  constructor() {
    this.performanceMonitor = new PerformanceMonitor();
    this.privacyManager = new PrivacyManager();
    this.auditEngine = new PrivacyAuditEngine(this.privacyManager);
    this.securityEngine = new SecurityRecommendationEngine(
      this.privacyManager,
      this.performanceMonitor,
    );
  }

  async handleCommand(args: PrivacyAuditCommandArgs): Promise<void> {
    switch (args.action) {
      case 'audit':
        await this.runPrivacyAudit(args);
        break;
      case 'security':
        await this.runSecurityAssessment(args);
        break;
      case 'compliance':
        await this.runComplianceCheck(args);
        break;
      case 'report':
        await this.generateAuditReport(args);
        break;
      case 'history':
        await this.showAuditHistory(args);
        break;
      default:
        throw new Error(`Unknown privacy audit command: ${args.action}`);
    }
  }

  private async runPrivacyAudit(args: PrivacyAuditCommandArgs): Promise<void> {
    console.log(chalk.blue('\n🔒 Starting Privacy Audit...'));
    console.log('─'.repeat(50));

    const frameworks = this.parseFrameworks(args.framework);
    const depth = args.depth || 'standard';

    const config: PrivacyAuditConfig = {
      frameworks,
      depth,
      includeSystemAnalysis: depth !== 'basic',
      includeDataFlow: depth === 'comprehensive',
      includeRiskAssessment: depth === 'comprehensive',
    };

    try {
      const report = await this.auditEngine.conductAudit(config);

      if (args.format === 'json') {
        if (args.output) {
          const fs = await import('fs/promises');
          await fs.writeFile(args.output, JSON.stringify(report, null, 2));
          console.log(chalk.green(`\n✅ Audit report saved to ${args.output}`));
        } else {
          console.log(JSON.stringify(report, null, 2));
        }
        return;
      }

      // Display summary
      this.displayAuditSummary(report);

      // Display critical and high findings
      const criticalAndHigh = report.findings.filter(
        (f) => f.level === 'critical' || f.level === 'high',
      );
      if (criticalAndHigh.length > 0) {
        console.log(chalk.red('\n🚨 Critical & High Priority Findings:'));
        console.log('─'.repeat(50));

        criticalAndHigh.forEach((finding, i) => {
          const emoji = finding.level === 'critical' ? '🔴' : '🟠';
          console.log(chalk.bold(`\n${i + 1}. ${emoji} ${finding.title}`));
          console.log(`   ${finding.description}`);
          console.log(chalk.yellow(`   Impact: ${finding.impact}`));
          console.log(
            chalk.green(`   Recommendation: ${finding.recommendation}`),
          );

          if (args.verbose && finding.remediation) {
            console.log(chalk.cyan('   Remediation Steps:'));
            finding.remediation.steps.forEach((step, j) => {
              console.log(`     ${j + 1}. ${step}`);
            });
          }
        });
      }

      // Display compliance status
      console.log(chalk.blue('\n📋 Compliance Status:'));
      console.log('─'.repeat(30));
      for (const [framework, status] of Object.entries(
        report.complianceStatus,
      )) {
        const emoji = status.compliant ? '✅' : '❌';
        const color = status.compliant ? chalk.green : chalk.red;
        console.log(
          `${emoji} ${color(framework.toUpperCase())}: ${status.score}/100`,
        );

        if (!status.compliant && args.verbose) {
          console.log(chalk.gray('   Gaps:'));
          status.gaps.forEach((gap) => {
            console.log(chalk.gray(`   • ${gap}`));
          });
        }
      }

      // Display immediate recommendations
      if (report.recommendations.immediate.length > 0) {
        console.log(chalk.yellow('\n⚡ Immediate Actions Required:'));
        console.log('─'.repeat(40));
        report.recommendations.immediate.forEach((rec, i) => {
          console.log(`${i + 1}. ${rec}`);
        });
      }

      console.log(
        chalk.blue(
          `\n📊 Overall Compliance Score: ${report.summary.complianceScore}/100`,
        ),
      );
      console.log(
        chalk.gray(
          `📅 Next Audit Recommended: ${report.nextAuditRecommended.toDateString()}`,
        ),
      );

      if (args.output) {
        const fs = await import('fs/promises');
        const textReport = this.auditEngine.formatReportAsText(report);
        await fs.writeFile(args.output, textReport);
        console.log(
          chalk.green(`\n💾 Detailed report saved to ${args.output}`),
        );
      }
    } catch (error) {
      console.error(chalk.red(`\n❌ Privacy audit failed: ${error}`));
      process.exit(1);
    }
  }

  private async runSecurityAssessment(
    args: PrivacyAuditCommandArgs,
  ): Promise<void> {
    console.log(chalk.blue('\n🔐 Starting Security Assessment...'));
    console.log('─'.repeat(50));

    const depth = args.depth || 'standard';
    const config: SecurityAssessmentConfig = {
      categories: [
        'authentication',
        'encryption',
        'system',
        'application',
        'monitoring',
      ],
      depth,
      includeSystemScan: depth !== 'basic',
      includeVulnerabilityAssessment: depth === 'comprehensive',
      includeComplianceCheck: depth !== 'basic',
    };

    try {
      const report =
        await this.securityEngine.conductSecurityAssessment(config);

      if (args.format === 'json') {
        if (args.output) {
          const fs = await import('fs/promises');
          await fs.writeFile(args.output, JSON.stringify(report, null, 2));
          console.log(
            chalk.green(`\n✅ Security report saved to ${args.output}`),
          );
        } else {
          console.log(JSON.stringify(report, null, 2));
        }
        return;
      }

      // Display summary
      console.log(chalk.blue('\n📊 Security Assessment Summary:'));
      console.log('─'.repeat(40));
      console.log(`Security Score: ${report.summary.overallSecurityScore}/100`);
      console.log(
        `Risk Level: ${this.colorizeRiskLevel(report.summary.riskLevel)}`,
      );
      console.log(
        `Total Recommendations: ${report.summary.totalRecommendations}`,
      );
      console.log(`Critical: ${report.summary.criticalRecommendations}`);
      console.log(`High: ${report.summary.highRecommendations}`);

      // Display critical and high recommendations
      const criticalAndHigh = report.recommendations.filter(
        (r) => r.level === 'critical' || r.level === 'high',
      );
      if (criticalAndHigh.length > 0) {
        console.log(
          chalk.red('\n🚨 Critical & High Priority Recommendations:'),
        );
        console.log('─'.repeat(55));

        criticalAndHigh.forEach((rec, i) => {
          const emoji = rec.level === 'critical' ? '🔴' : '🟠';
          console.log(chalk.bold(`\n${i + 1}. ${emoji} ${rec.title}`));
          console.log(`   ${rec.description}`);
          console.log(chalk.yellow(`   Impact: ${rec.impact}`));
          console.log(chalk.green(`   Recommendation: ${rec.recommendation}`));

          if (rec.remediation.automated) {
            console.log(
              chalk.cyan(`   Quick Fix: ${rec.remediation.automationScript}`),
            );
          }

          if (args.verbose) {
            console.log(chalk.gray(`   Risk Score: ${rec.riskScore}/100`));
            console.log(
              chalk.gray(
                `   Effort: ${rec.implementation.effort} (${rec.implementation.timeEstimate})`,
              ),
            );
          }
        });
      }

      // Display vulnerabilities if any
      if (report.vulnerabilities.length > 0) {
        console.log(chalk.red('\n🛡️  Security Vulnerabilities:'));
        console.log('─'.repeat(35));
        report.vulnerabilities.slice(0, 5).forEach((vuln, i) => {
          const emoji = this.getVulnerabilityEmoji(vuln.severity);
          console.log(`${i + 1}. ${emoji} ${vuln.title}`);
          if (vuln.cve) console.log(chalk.gray(`   CVE: ${vuln.cve}`));
          console.log(chalk.gray(`   ${vuln.description}`));
        });
      }

      // Display immediate actions
      if (report.actionPlan.immediate.length > 0) {
        console.log(chalk.yellow('\n⚡ Immediate Actions Required:'));
        console.log('─'.repeat(40));
        report.actionPlan.immediate.forEach((action, i) => {
          console.log(`${i + 1}. ${action.title}`);
          if (action.remediation.automated) {
            console.log(
              chalk.cyan(`   Command: ${action.remediation.automationScript}`),
            );
          }
        });
      }

      if (args.output) {
        const fs = await import('fs/promises');
        const textReport = this.securityEngine.formatReportAsText(report);
        await fs.writeFile(args.output, textReport);
        console.log(
          chalk.green(`\n💾 Detailed security report saved to ${args.output}`),
        );
      }
    } catch (error) {
      console.error(chalk.red(`\n❌ Security assessment failed: ${error}`));
      process.exit(1);
    }
  }

  private async runComplianceCheck(
    args: PrivacyAuditCommandArgs,
  ): Promise<void> {
    console.log(chalk.blue('\n📋 Running Compliance Check...'));
    console.log('─'.repeat(40));

    const frameworks = this.parseFrameworks(args.framework);
    if (frameworks.length === 0) {
      console.log(
        chalk.yellow(
          'No specific framework specified. Checking all supported frameworks.',
        ),
      );
      frameworks.push('gdpr', 'ccpa', 'sox', 'hipaa');
    }

    const config: PrivacyAuditConfig = {
      frameworks,
      depth: 'basic',
      includeSystemAnalysis: false,
      includeDataFlow: false,
      includeRiskAssessment: false,
    };

    try {
      const report = await this.auditEngine.conductAudit(config);

      console.log(chalk.blue('\n📊 Compliance Results:'));
      console.log('═'.repeat(50));

      for (const [framework, status] of Object.entries(
        report.complianceStatus,
      )) {
        const emoji = status.compliant ? '✅' : '❌';
        const color = status.compliant ? chalk.green : chalk.red;

        console.log(
          `\n${emoji} ${color.bold(framework.toUpperCase())} Compliance`,
        );
        console.log(`   Score: ${status.score}/100`);
        console.log(
          `   Status: ${status.compliant ? 'COMPLIANT' : 'NON-COMPLIANT'}`,
        );

        if (status.gaps.length > 0) {
          console.log(chalk.yellow('   Gaps Found:'));
          status.gaps.forEach((gap) => {
            console.log(chalk.yellow(`   • ${gap}`));
          });
        }
      }

      // Show framework-specific findings
      const frameworkFindings = report.findings.filter((f) =>
        frameworks.some((fw) => f.framework.includes(fw)),
      );

      if (frameworkFindings.length > 0) {
        console.log(chalk.red('\n🔍 Compliance Issues Found:'));
        console.log('─'.repeat(35));

        frameworkFindings.forEach((finding, i) => {
          const emoji =
            finding.level === 'critical'
              ? '🔴'
              : finding.level === 'high'
                ? '🟠'
                : '🟡';
          console.log(`\n${i + 1}. ${emoji} ${finding.title}`);
          console.log(
            `   Frameworks: ${finding.framework.join(', ').toUpperCase()}`,
          );
          console.log(`   ${finding.description}`);
          console.log(chalk.green(`   Action: ${finding.recommendation}`));
        });
      }

      const overallCompliant = Object.values(report.complianceStatus).every(
        (s) => s.compliant,
      );
      const avgScore =
        Object.values(report.complianceStatus).reduce(
          (sum, s) => sum + s.score,
          0,
        ) / Object.keys(report.complianceStatus).length;

      console.log(chalk.blue(`\n📈 Overall Compliance:`));
      console.log(
        `   Status: ${overallCompliant ? chalk.green('COMPLIANT') : chalk.red('NON-COMPLIANT')}`,
      );
      console.log(`   Average Score: ${Math.round(avgScore)}/100`);
    } catch (error) {
      console.error(chalk.red(`\n❌ Compliance check failed: ${error}`));
      process.exit(1);
    }
  }

  private async generateAuditReport(
    args: PrivacyAuditCommandArgs,
  ): Promise<void> {
    console.log(chalk.blue('\n📄 Generating Comprehensive Audit Report...'));
    console.log('─'.repeat(50));

    // Run both privacy audit and security assessment
    const frameworks = this.parseFrameworks(args.framework);
    const depth = args.depth || 'comprehensive';

    const auditConfig: PrivacyAuditConfig = {
      frameworks:
        frameworks.length > 0 ? frameworks : ['gdpr', 'ccpa', 'sox', 'hipaa'],
      depth,
      includeSystemAnalysis: true,
      includeDataFlow: true,
      includeRiskAssessment: true,
    };

    const securityConfig: SecurityAssessmentConfig = {
      categories: [
        'authentication',
        'encryption',
        'system',
        'application',
        'monitoring',
        'compliance',
      ],
      depth,
      includeSystemScan: true,
      includeVulnerabilityAssessment: true,
      includeComplianceCheck: true,
    };

    try {
      console.log('Running privacy audit...');
      const auditReport = await this.auditEngine.conductAudit(auditConfig);

      console.log('Running security assessment...');
      const securityReport =
        await this.securityEngine.conductSecurityAssessment(securityConfig);

      // Generate combined report
      const combinedReport = {
        timestamp: new Date(),
        privacy: auditReport,
        security: securityReport,
        summary: {
          privacyScore: auditReport.summary.complianceScore,
          securityScore: securityReport.summary.overallSecurityScore,
          overallScore: Math.round(
            (auditReport.summary.complianceScore +
              securityReport.summary.overallSecurityScore) /
              2,
          ),
          totalFindings:
            auditReport.findings.length + securityReport.recommendations.length,
          criticalIssues:
            auditReport.summary.criticalFindings +
            securityReport.summary.criticalRecommendations,
        },
      };

      if (args.format === 'json') {
        const output = args.output || `audit-report-${Date.now()}.json`;
        const fs = await import('fs/promises');
        await fs.writeFile(output, JSON.stringify(combinedReport, null, 2));
        console.log(
          chalk.green(`\n✅ Combined audit report saved to ${output}`),
        );
        return;
      }

      // Display combined summary
      console.log(chalk.blue('\n📊 Combined Audit Report Summary:'));
      console.log('═'.repeat(50));
      console.log(`Privacy Score: ${combinedReport.summary.privacyScore}/100`);
      console.log(
        `Security Score: ${combinedReport.summary.securityScore}/100`,
      );
      console.log(
        chalk.bold(`Overall Score: ${combinedReport.summary.overallScore}/100`),
      );
      console.log(`Total Issues: ${combinedReport.summary.totalFindings}`);
      console.log(`Critical Issues: ${combinedReport.summary.criticalIssues}`);

      // Display top recommendations from both reports
      const allCritical = [
        ...auditReport.findings.filter((f) => f.level === 'critical'),
        ...securityReport.recommendations.filter((r) => r.level === 'critical'),
      ];

      if (allCritical.length > 0) {
        console.log(chalk.red('\n🚨 All Critical Issues:'));
        console.log('─'.repeat(30));
        allCritical.forEach((issue, i) => {
          const title = 'title' in issue ? issue.title : issue.title;
          const desc =
            'description' in issue ? issue.description : issue.description;
          console.log(`${i + 1}. 🔴 ${title}`);
          console.log(`   ${desc}`);
        });
      }

      if (args.output) {
        const fs = await import('fs/promises');
        let textReport = this.auditEngine.formatReportAsText(auditReport);
        textReport +=
          '\n\n' + this.securityEngine.formatReportAsText(securityReport);
        await fs.writeFile(args.output, textReport);
        console.log(
          chalk.green(`\n💾 Combined report saved to ${args.output}`),
        );
      }
    } catch (error) {
      console.error(chalk.red(`\n❌ Report generation failed: ${error}`));
      process.exit(1);
    }
  }

  private async showAuditHistory(
    _args: PrivacyAuditCommandArgs,
  ): Promise<void> {
    console.log(chalk.blue('\n📚 Audit History:'));
    console.log('─'.repeat(30));

    try {
      const history = await this.auditEngine.getAuditHistory(10);

      if (history.length === 0) {
        console.log(
          chalk.yellow('No audit history found. Run your first audit with:'),
        );
        console.log(chalk.cyan('  trust privacy-audit audit'));
        return;
      }

      history.forEach((report, i) => {
        const emoji =
          report.summary.criticalFindings > 0
            ? '🔴'
            : report.summary.highFindings > 0
              ? '🟠'
              : '✅';

        console.log(
          `\n${i + 1}. ${emoji} ${report.timestamp.toLocaleDateString()}`,
        );
        console.log(`   ID: ${report.id}`);
        console.log(`   Score: ${report.summary.complianceScore}/100`);
        console.log(
          `   Findings: ${report.summary.totalFindings} (${report.summary.criticalFindings} critical)`,
        );
        console.log(
          `   Frameworks: ${report.scope.frameworks.join(', ').toUpperCase()}`,
        );
      });

      console.log(
        chalk.blue(
          '\n💡 Use "trust privacy-audit report" to generate a new comprehensive report',
        ),
      );
    } catch (error) {
      console.error(chalk.red(`\n❌ Failed to load audit history: ${error}`));
    }
  }

  private parseFrameworks(frameworkArg?: string): ComplianceFramework[] {
    if (!frameworkArg) return [];

    const frameworks = frameworkArg
      .split(',')
      .map((f) => f.trim().toLowerCase());
    const validFrameworks: ComplianceFramework[] = [
      'gdpr',
      'ccpa',
      'sox',
      'hipaa',
      'pci-dss',
      'iso27001',
    ];

    return frameworks.filter((f) =>
      validFrameworks.includes(f as ComplianceFramework),
    ) as ComplianceFramework[];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private displayAuditSummary(report: any): void {
    console.log(chalk.blue('\n📊 Privacy Audit Summary:'));
    console.log('─'.repeat(35));
    console.log(`Audit ID: ${report.id}`);
    console.log(`Compliance Score: ${report.summary.complianceScore}/100`);
    console.log(`Total Findings: ${report.summary.totalFindings}`);
    console.log(`Critical: ${report.summary.criticalFindings}`);
    console.log(`High: ${report.summary.highFindings}`);
    console.log(`Medium: ${report.summary.mediumFindings}`);
    console.log(`Duration: ${(report.duration / 1000).toFixed(2)}s`);
  }

  private colorizeRiskLevel(level: string): string {
    switch (level) {
      case 'critical':
        return chalk.red.bold('CRITICAL');
      case 'high':
        return chalk.red('HIGH');
      case 'medium':
        return chalk.yellow('MEDIUM');
      case 'low':
        return chalk.green('LOW');
      default:
        return level.toUpperCase();
    }
  }

  private getVulnerabilityEmoji(severity: string): string {
    switch (severity) {
      case 'critical':
        return '🔴';
      case 'high':
        return '🟠';
      case 'medium':
        return '🟡';
      case 'low':
        return '🟢';
      default:
        return '⚪';
    }
  }
}

export async function handlePrivacyAuditCommand(
  args: PrivacyAuditCommandArgs,
): Promise<void> {
  const handler = new PrivacyAuditCommandHandler();
  await handler.handleCommand(args);
}
