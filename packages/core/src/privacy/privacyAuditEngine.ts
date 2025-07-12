/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { PrivacyManager, PrivacyConfigFile as PrivacyConfig } from '../trust/privacyManager.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

/**
 * Privacy audit finding levels
 */
export type AuditFindingLevel = 'critical' | 'high' | 'medium' | 'low' | 'info';

/**
 * Compliance frameworks supported
 */
export type ComplianceFramework =
  | 'gdpr'
  | 'ccpa'
  | 'sox'
  | 'hipaa'
  | 'pci-dss'
  | 'iso27001';

/**
 * Individual privacy audit finding
 */
export interface PrivacyAuditFinding {
  id: string;
  level: AuditFindingLevel;
  framework: ComplianceFramework[];
  title: string;
  description: string;
  impact: string;
  recommendation: string;
  remediation: {
    steps: string[];
    effort: 'low' | 'medium' | 'high';
    priority: number;
  };
  evidence?: {
    type: 'config' | 'log' | 'file' | 'setting';
    source: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    details: any;
  };
  timestamp: Date;
}

/**
 * Privacy audit report structure
 */
export interface PrivacyAuditReport {
  id: string;
  timestamp: Date;
  duration: number; // milliseconds
  scope: {
    frameworks: ComplianceFramework[];
    includeSystemAnalysis: boolean;
    includeDataFlow: boolean;
    includeRiskAssessment: boolean;
  };
  summary: {
    totalFindings: number;
    criticalFindings: number;
    highFindings: number;
    mediumFindings: number;
    lowFindings: number;
    complianceScore: number; // 0-100
  };
  findings: PrivacyAuditFinding[];
  recommendations: {
    immediate: string[];
    shortTerm: string[];
    longTerm: string[];
  };
  complianceStatus: Record<
    ComplianceFramework,
    {
      compliant: boolean;
      score: number;
      gaps: string[];
    }
  >;
  dataFlowAnalysis?: DataFlowAnalysis;
  riskAssessment?: RiskAssessment;
  nextAuditRecommended: Date;
}

/**
 * Data flow analysis for privacy audit
 */
export interface DataFlowAnalysis {
  dataProcessingActivities: Array<{
    activity: string;
    dataTypes: string[];
    purposes: string[];
    legalBasis: string[];
    retentionPeriod: string;
    thirdParties: string[];
    crossBorderTransfers: boolean;
  }>;
  dataMinimizationScore: number;
  consentManagementScore: number;
  dataSubjectRights: {
    accessImplemented: boolean;
    rectificationImplemented: boolean;
    erasureImplemented: boolean;
    portabilityImplemented: boolean;
    objectionImplemented: boolean;
  };
}

/**
 * Risk assessment for privacy audit
 */
export interface RiskAssessment {
  overallRiskLevel: 'low' | 'medium' | 'high' | 'critical';
  riskFactors: Array<{
    factor: string;
    level: 'low' | 'medium' | 'high';
    impact: string;
    mitigation: string;
  }>;
  privacyImpactScore: number; // 0-100
  breachLikelihood: number; // 0-100
  recommendations: string[];
}

/**
 * Privacy audit configuration
 */
export interface PrivacyAuditConfig {
  frameworks: ComplianceFramework[];
  depth: 'basic' | 'standard' | 'comprehensive';
  includeSystemAnalysis: boolean;
  includeDataFlow: boolean;
  includeRiskAssessment: boolean;
  customChecks?: Array<{
    name: string;
    description: string;
    check: (config: PrivacyConfig) => Promise<PrivacyAuditFinding[]>;
  }>;
}

/**
 * Comprehensive privacy audit engine
 */
export class PrivacyAuditEngine {
  private privacyManager: PrivacyManager;
  private auditDir: string;

  constructor(privacyManager: PrivacyManager) {
    this.privacyManager = privacyManager;
    this.auditDir = path.join(os.homedir(), '.trustcli', 'privacy', 'audits');
  }

  /**
   * Conduct comprehensive privacy audit
   */
  async conductAudit(config: PrivacyAuditConfig): Promise<PrivacyAuditReport> {
    const startTime = Date.now();
    const auditId = `audit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const findings: PrivacyAuditFinding[] = [];

    // Core privacy configuration audit
    findings.push(...(await this.auditPrivacyConfiguration()));

    // Framework-specific audits
    for (const framework of config.frameworks) {
      findings.push(...(await this.auditFrameworkCompliance(framework)));
    }

    // System analysis
    if (config.includeSystemAnalysis) {
      findings.push(...(await this.auditSystemConfiguration()));
    }

    // Data flow analysis
    let dataFlowAnalysis: DataFlowAnalysis | undefined;
    if (config.includeDataFlow) {
      dataFlowAnalysis = await this.analyzeDataFlow();
      findings.push(...(await this.auditDataFlow(dataFlowAnalysis)));
    }

    // Risk assessment
    let riskAssessment: RiskAssessment | undefined;
    if (config.includeRiskAssessment) {
      riskAssessment = await this.assessPrivacyRisks(findings);
    }

    // Custom checks
    if (config.customChecks) {
      const privacyConfig = JSON.parse(await this.privacyManager.exportPrivacyConfig());
      for (const customCheck of config.customChecks) {
        try {
          const customFindings = await customCheck.check(privacyConfig);
          findings.push(...customFindings);
        } catch (error) {
          findings.push({
            id: `custom-check-error-${Date.now()}`,
            level: 'medium',
            framework: [],
            title: 'Custom Check Error',
            description: `Failed to execute custom check "${customCheck.name}": ${error}`,
            impact: 'Audit coverage may be incomplete',
            recommendation: 'Review and fix the custom check implementation',
            remediation: {
              steps: [
                'Review custom check code',
                'Fix implementation errors',
                'Re-run audit',
              ],
              effort: 'medium',
              priority: 3,
            },
            timestamp: new Date(),
          });
        }
      }
    }

    // Generate compliance status
    const complianceStatus = this.calculateComplianceStatus(
      config.frameworks,
      findings,
    );

    // Calculate summary
    const summary = this.calculateAuditSummary(findings, complianceStatus);

    // Generate recommendations
    const recommendations = this.generateRecommendations(findings);

    const report: PrivacyAuditReport = {
      id: auditId,
      timestamp: new Date(),
      duration: Date.now() - startTime,
      scope: {
        frameworks: config.frameworks,
        includeSystemAnalysis: config.includeSystemAnalysis,
        includeDataFlow: config.includeDataFlow,
        includeRiskAssessment: config.includeRiskAssessment,
      },
      summary,
      findings: findings.sort((a, b) => {
        const levelOrder = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };
        return levelOrder[b.level] - levelOrder[a.level];
      }),
      recommendations,
      complianceStatus,
      dataFlowAnalysis,
      riskAssessment,
      nextAuditRecommended: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
    };

    // Save audit report
    await this.saveAuditReport(report);

    return report;
  }

  /**
   * Audit core privacy configuration
   */
  private async auditPrivacyConfiguration(): Promise<PrivacyAuditFinding[]> {
    const findings: PrivacyAuditFinding[] = [];
    const config = JSON.parse(await this.privacyManager.exportPrivacyConfig());

    // Check privacy mode
    if (config.mode === 'open') {
      findings.push({
        id: 'privacy-mode-open',
        level: 'high',
        framework: ['gdpr', 'ccpa', 'hipaa'],
        title: 'Privacy Mode Set to Open',
        description:
          'Privacy mode is set to "open" which provides minimal privacy protections',
        impact: 'Increased privacy risk, potential regulatory non-compliance',
        recommendation:
          'Set privacy mode to "moderate" or "strict" for better protection',
        remediation: {
          steps: [
            'Run: trust privacy mode strict',
            'Review privacy settings',
            'Test application functionality',
          ],
          effort: 'low',
          priority: 1,
        },
        evidence: {
          type: 'config',
          source: 'privacy-config.json',
          details: { currentMode: config.mode },
        },
        timestamp: new Date(),
      });
    }

    // Check encryption settings
    if (!config.encryptStorage) {
      findings.push({
        id: 'storage-encryption-disabled',
        level: 'critical',
        framework: ['gdpr', 'hipaa', 'sox', 'pci-dss'],
        title: 'Storage Encryption Disabled',
        description:
          'Data storage encryption is disabled, leaving sensitive data unprotected',
        impact: 'High risk of data breach, regulatory non-compliance',
        recommendation: 'Enable storage encryption immediately',
        remediation: {
          steps: [
            'Enable encryptStorage in privacy configuration',
            'Re-encrypt existing data',
            'Verify encryption is working',
          ],
          effort: 'medium',
          priority: 1,
        },
        evidence: {
          type: 'config',
          source: 'privacy-config.json',
          details: { encryptStorage: config.encryptStorage },
        },
        timestamp: new Date(),
      });
    }

    // Check audit logging
    if (!config.auditLogging) {
      findings.push({
        id: 'audit-logging-disabled',
        level: 'high',
        framework: ['sox', 'hipaa', 'pci-dss', 'iso27001'],
        title: 'Audit Logging Disabled',
        description:
          'Audit logging is disabled, preventing compliance and security monitoring',
        impact: 'No audit trail, compliance violations, security blind spots',
        recommendation: 'Enable comprehensive audit logging',
        remediation: {
          steps: [
            'Enable auditLogging in privacy configuration',
            'Configure log retention policies',
            'Set up log monitoring',
          ],
          effort: 'low',
          priority: 2,
        },
        evidence: {
          type: 'config',
          source: 'privacy-config.json',
          details: { auditLogging: config.auditLogging },
        },
        timestamp: new Date(),
      });
    }

    // Check data retention
    if (config.dataRetention > 365) {
      findings.push({
        id: 'excessive-data-retention',
        level: 'medium',
        framework: ['gdpr', 'ccpa'],
        title: 'Excessive Data Retention Period',
        description: `Data retention period is set to ${config.dataRetention} days, which may exceed necessity`,
        impact: 'Increased privacy risk, potential GDPR Article 5 violation',
        recommendation:
          'Review and reduce data retention period to minimum necessary',
        remediation: {
          steps: [
            'Assess business requirements for data retention',
            'Reduce retention period to minimum necessary',
            'Update privacy configuration',
          ],
          effort: 'medium',
          priority: 3,
        },
        evidence: {
          type: 'config',
          source: 'privacy-config.json',
          details: { dataRetention: config.dataRetention },
        },
        timestamp: new Date(),
      });
    }

    return findings;
  }

  /**
   * Audit framework-specific compliance
   */
  private async auditFrameworkCompliance(
    framework: ComplianceFramework,
  ): Promise<PrivacyAuditFinding[]> {
    const findings: PrivacyAuditFinding[] = [];
    const config = JSON.parse(await this.privacyManager.exportPrivacyConfig());

    switch (framework) {
      case 'gdpr':
        findings.push(...(await this.auditGDPRCompliance(config)));
        break;
      case 'ccpa':
        findings.push(...(await this.auditCCPACompliance(config)));
        break;
      case 'sox':
        findings.push(...(await this.auditSOXCompliance(config)));
        break;
      case 'hipaa':
        findings.push(...(await this.auditHIPAACompliance(config)));
        break;
      case 'pci-dss':
        findings.push(...(await this.auditPCIDSSCompliance(config)));
        break;
      case 'iso27001':
        findings.push(...(await this.auditISO27001Compliance(config)));
        break;
      default:
        // Unknown framework - no specific compliance checks
        break;
    }

    return findings;
  }

  /**
   * Audit GDPR compliance
   */
  private async auditGDPRCompliance(
    config: PrivacyConfig,
  ): Promise<PrivacyAuditFinding[]> {
    const findings: PrivacyAuditFinding[] = [];

    // Data minimization check
    if (config.mode !== 'strict') {
      findings.push({
        id: 'gdpr-data-minimization',
        level: 'medium',
        framework: ['gdpr'],
        title: 'GDPR Data Minimization Principle',
        description:
          'Privacy mode should be "strict" to ensure GDPR data minimization compliance',
        impact:
          'Potential Article 5(1)(c) violation - data minimization principle',
        recommendation:
          'Set privacy mode to strict to minimize data processing',
        remediation: {
          steps: [
            'Set mode to strict',
            'Review data collection practices',
            'Document necessity',
          ],
          effort: 'low',
          priority: 2,
        },
        timestamp: new Date(),
      });
    }

    // Right to erasure implementation
    if (config.dataRetention === 0) {
      findings.push({
        id: 'gdpr-right-to-erasure',
        level: 'high',
        framework: ['gdpr'],
        title: 'Right to Erasure Not Implemented',
        description:
          'No data retention policy configured for GDPR Article 17 compliance',
        impact:
          'Cannot fulfill data subject erasure requests, GDPR non-compliance',
        recommendation: 'Implement data retention and deletion policies',
        remediation: {
          steps: [
            'Set appropriate data retention period',
            'Implement automated deletion',
            'Document deletion procedures',
          ],
          effort: 'medium',
          priority: 1,
        },
        timestamp: new Date(),
      });
    }

    return findings;
  }

  /**
   * Audit CCPA compliance
   */
  private async auditCCPACompliance(
    config: PrivacyConfig,
  ): Promise<PrivacyAuditFinding[]> {
    const findings: PrivacyAuditFinding[] = [];

    // Consumer rights implementation
    if (!config.shareData === false) {
      findings.push({
        id: 'ccpa-opt-out',
        level: 'medium',
        framework: ['ccpa'],
        title: 'CCPA Opt-Out Rights',
        description:
          'Data sharing settings should default to disabled for CCPA compliance',
        impact: 'Potential CCPA Section 1798.120 violation - right to opt-out',
        recommendation: 'Ensure data sharing is disabled by default',
        remediation: {
          steps: [
            'Disable data sharing by default',
            'Implement opt-out mechanisms',
            'Update privacy notices',
          ],
          effort: 'low',
          priority: 2,
        },
        timestamp: new Date(),
      });
    }

    return findings;
  }

  /**
   * Audit SOX compliance
   */
  private async auditSOXCompliance(
    config: PrivacyConfig,
  ): Promise<PrivacyAuditFinding[]> {
    const findings: PrivacyAuditFinding[] = [];

    // Internal controls
    if (!config.auditLogging) {
      findings.push({
        id: 'sox-internal-controls',
        level: 'critical',
        framework: ['sox'],
        title: 'SOX Internal Controls - Audit Logging',
        description:
          'Audit logging is required for SOX compliance and internal controls',
        impact: 'SOX Section 404 non-compliance, audit trail deficiency',
        recommendation: 'Enable comprehensive audit logging immediately',
        remediation: {
          steps: [
            'Enable audit logging',
            'Configure log retention',
            'Implement log monitoring',
          ],
          effort: 'low',
          priority: 1,
        },
        timestamp: new Date(),
      });
    }

    return findings;
  }

  /**
   * Audit HIPAA compliance
   */
  private async auditHIPAACompliance(
    config: PrivacyConfig,
  ): Promise<PrivacyAuditFinding[]> {
    const findings: PrivacyAuditFinding[] = [];

    // Encryption requirements
    if (!config.encryptStorage) {
      findings.push({
        id: 'hipaa-encryption',
        level: 'critical',
        framework: ['hipaa'],
        title: 'HIPAA Encryption Requirements',
        description: 'HIPAA requires encryption of PHI at rest and in transit',
        impact: 'HIPAA Security Rule 164.312(a)(2)(iv) violation',
        recommendation: 'Enable storage encryption for HIPAA compliance',
        remediation: {
          steps: [
            'Enable storage encryption',
            'Verify encryption strength',
            'Document encryption procedures',
          ],
          effort: 'medium',
          priority: 1,
        },
        timestamp: new Date(),
      });
    }

    return findings;
  }

  /**
   * Audit PCI DSS compliance
   */
  private async auditPCIDSSCompliance(
    config: PrivacyConfig,
  ): Promise<PrivacyAuditFinding[]> {
    const findings: PrivacyAuditFinding[] = [];

    // Data protection requirements
    if (!config.encryptStorage || !config.auditLogging) {
      findings.push({
        id: 'pci-dss-data-protection',
        level: 'critical',
        framework: ['pci-dss'],
        title: 'PCI DSS Data Protection Requirements',
        description: 'PCI DSS requires encryption and comprehensive logging',
        impact: 'PCI DSS Requirements 3 and 10 non-compliance',
        recommendation:
          'Enable encryption and audit logging for PCI DSS compliance',
        remediation: {
          steps: [
            'Enable storage encryption',
            'Enable audit logging',
            'Implement access controls',
          ],
          effort: 'medium',
          priority: 1,
        },
        timestamp: new Date(),
      });
    }

    return findings;
  }

  /**
   * Audit ISO 27001 compliance
   */
  private async auditISO27001Compliance(
    config: PrivacyConfig,
  ): Promise<PrivacyAuditFinding[]> {
    const findings: PrivacyAuditFinding[] = [];

    // Information security management
    if (config.mode === 'open' || !config.auditLogging) {
      findings.push({
        id: 'iso27001-isms',
        level: 'high',
        framework: ['iso27001'],
        title: 'ISO 27001 Information Security Management',
        description:
          'Current configuration does not meet ISO 27001 security controls',
        impact: 'ISO 27001 Annex A controls non-compliance',
        recommendation:
          'Implement strict privacy mode and comprehensive logging',
        remediation: {
          steps: [
            'Set strict privacy mode',
            'Enable audit logging',
            'Implement security controls',
          ],
          effort: 'medium',
          priority: 2,
        },
        timestamp: new Date(),
      });
    }

    return findings;
  }

  /**
   * Audit system configuration
   */
  private async auditSystemConfiguration(): Promise<PrivacyAuditFinding[]> {
    const findings: PrivacyAuditFinding[] = [];

    try {
      // Check file permissions on privacy directory
      const privacyDir = path.join(os.homedir(), '.trustcli', 'privacy');
      const stats = await fs.stat(privacyDir);
      const mode = stats.mode & parseInt('777', 8);

      if (mode !== parseInt('700', 8)) {
        findings.push({
          id: 'file-permissions-privacy-dir',
          level: 'high',
          framework: ['hipaa', 'pci-dss', 'iso27001'],
          title: 'Insecure File Permissions on Privacy Directory',
          description: `Privacy directory has permissions ${mode.toString(8)}, should be 700`,
          impact: 'Unauthorized access to sensitive privacy data',
          recommendation:
            'Set privacy directory permissions to 700 (owner only)',
          remediation: {
            steps: [
              `chmod 700 ${privacyDir}`,
              'Verify permissions are correct',
            ],
            effort: 'low',
            priority: 2,
          },
          evidence: {
            type: 'file',
            source: privacyDir,
            details: { currentMode: mode.toString(8), expectedMode: '700' },
          },
          timestamp: new Date(),
        });
      }
    } catch (_error) {
      findings.push({
        id: 'privacy-dir-missing',
        level: 'medium',
        framework: [],
        title: 'Privacy Directory Not Found',
        description: 'Privacy configuration directory does not exist',
        impact: 'Privacy features may not be properly initialized',
        recommendation: 'Initialize privacy configuration',
        remediation: {
          steps: ['Run privacy initialization', 'Verify directory creation'],
          effort: 'low',
          priority: 3,
        },
        timestamp: new Date(),
      });
    }

    return findings;
  }

  /**
   * Analyze data flow for privacy audit
   */
  private async analyzeDataFlow(): Promise<DataFlowAnalysis> {
    // This is a simplified analysis - in a real implementation,
    // this would analyze actual data flows through the system
    return {
      dataProcessingActivities: [
        {
          activity: 'AI Model Inference',
          dataTypes: ['user prompts', 'model responses', 'usage metrics'],
          purposes: ['AI assistance', 'performance optimization'],
          legalBasis: ['legitimate interest', 'consent'],
          retentionPeriod: '30 days',
          thirdParties: [],
          crossBorderTransfers: false,
        },
        {
          activity: 'Error Reporting',
          dataTypes: ['error logs', 'system metrics'],
          purposes: ['system improvement', 'debugging'],
          legalBasis: ['legitimate interest'],
          retentionPeriod: '90 days',
          thirdParties: [],
          crossBorderTransfers: false,
        },
      ],
      dataMinimizationScore: 85,
      consentManagementScore: 70,
      dataSubjectRights: {
        accessImplemented: false,
        rectificationImplemented: false,
        erasureImplemented: true,
        portabilityImplemented: false,
        objectionImplemented: false,
      },
    };
  }

  /**
   * Audit data flow for privacy compliance
   */
  private async auditDataFlow(
    dataFlow: DataFlowAnalysis,
  ): Promise<PrivacyAuditFinding[]> {
    const findings: PrivacyAuditFinding[] = [];

    // Check data subject rights implementation
    const rights = dataFlow.dataSubjectRights;
    if (!rights.accessImplemented) {
      findings.push({
        id: 'data-subject-access-right',
        level: 'high',
        framework: ['gdpr', 'ccpa'],
        title: 'Data Subject Access Right Not Implemented',
        description: 'Right to access personal data is not implemented',
        impact: 'GDPR Article 15 and CCPA Section 1798.110 non-compliance',
        recommendation: 'Implement data subject access request handling',
        remediation: {
          steps: [
            'Design access request workflow',
            'Implement data export functionality',
            'Create user interface for requests',
          ],
          effort: 'high',
          priority: 2,
        },
        timestamp: new Date(),
      });
    }

    if (!rights.portabilityImplemented) {
      findings.push({
        id: 'data-portability-right',
        level: 'medium',
        framework: ['gdpr'],
        title: 'Data Portability Right Not Implemented',
        description: 'Right to data portability is not implemented',
        impact: 'GDPR Article 20 non-compliance',
        recommendation: 'Implement data export in machine-readable format',
        remediation: {
          steps: [
            'Design data export format',
            'Implement export functionality',
            'Test data portability',
          ],
          effort: 'medium',
          priority: 3,
        },
        timestamp: new Date(),
      });
    }

    return findings;
  }

  /**
   * Assess privacy risks
   */
  private async assessPrivacyRisks(
    findings: PrivacyAuditFinding[],
  ): Promise<RiskAssessment> {
    const criticalFindings = findings.filter(
      (f) => f.level === 'critical',
    ).length;
    const highFindings = findings.filter((f) => f.level === 'high').length;

    let overallRiskLevel: 'low' | 'medium' | 'high' | 'critical';
    if (criticalFindings > 0) overallRiskLevel = 'critical';
    else if (highFindings > 2) overallRiskLevel = 'high';
    else if (highFindings > 0) overallRiskLevel = 'medium';
    else overallRiskLevel = 'low';

    const privacyImpactScore = Math.max(
      0,
      100 - (criticalFindings * 25 + highFindings * 15),
    );
    const breachLikelihood =
      criticalFindings > 0 ? 75 : highFindings > 0 ? 45 : 15;

    return {
      overallRiskLevel,
      riskFactors: [
        {
          factor: 'Encryption Status',
          level: findings.some((f) => f.id === 'storage-encryption-disabled')
            ? 'high'
            : 'low',
          impact: 'Data confidentiality and integrity',
          mitigation: 'Enable storage encryption',
        },
        {
          factor: 'Audit Logging',
          level: findings.some((f) => f.id === 'audit-logging-disabled')
            ? 'medium'
            : 'low',
          impact: 'Compliance and incident response',
          mitigation: 'Enable comprehensive audit logging',
        },
      ],
      privacyImpactScore,
      breachLikelihood,
      recommendations: [
        'Address all critical findings immediately',
        'Implement comprehensive privacy controls',
        'Regular privacy impact assessments',
        'Staff privacy training program',
      ],
    };
  }

  /**
   * Calculate compliance status for each framework
   */
  private calculateComplianceStatus(
    frameworks: ComplianceFramework[],
    findings: PrivacyAuditFinding[],
  ): Record<
    ComplianceFramework,
    { compliant: boolean; score: number; gaps: string[] }
  > {
    const status: Record<
      ComplianceFramework,
      { compliant: boolean; score: number; gaps: string[] }
    > = {} as Record<
      ComplianceFramework,
      { compliant: boolean; score: number; gaps: string[] }
    >;

    for (const framework of frameworks) {
      const frameworkFindings = findings.filter((f) =>
        f.framework.includes(framework),
      );
      const criticalCount = frameworkFindings.filter(
        (f) => f.level === 'critical',
      ).length;
      const highCount = frameworkFindings.filter(
        (f) => f.level === 'high',
      ).length;
      const mediumCount = frameworkFindings.filter(
        (f) => f.level === 'medium',
      ).length;

      const score = Math.max(
        0,
        100 - (criticalCount * 30 + highCount * 20 + mediumCount * 10),
      );
      const compliant = criticalCount === 0 && highCount === 0;

      status[framework] = {
        compliant,
        score,
        gaps: frameworkFindings.map((f) => f.title),
      };
    }

    return status;
  }

  /**
   * Calculate audit summary
   */
  private calculateAuditSummary(
    findings: PrivacyAuditFinding[],
    complianceStatus: Record<
      ComplianceFramework,
      { compliant: boolean; score: number; gaps: string[] }
    >,
  ): PrivacyAuditReport['summary'] {
    const criticalFindings = findings.filter(
      (f) => f.level === 'critical',
    ).length;
    const highFindings = findings.filter((f) => f.level === 'high').length;
    const mediumFindings = findings.filter((f) => f.level === 'medium').length;
    const lowFindings = findings.filter((f) => f.level === 'low').length;

    const totalFindings = findings.length;
    const complianceScore =
      Object.values(complianceStatus).reduce(
        (sum, status) => sum + status.score,
        0,
      ) / Object.keys(complianceStatus).length || 100;

    return {
      totalFindings,
      criticalFindings,
      highFindings,
      mediumFindings,
      lowFindings,
      complianceScore: Math.round(complianceScore),
    };
  }

  /**
   * Generate prioritized recommendations
   */
  private generateRecommendations(findings: PrivacyAuditFinding[]): {
    immediate: string[];
    shortTerm: string[];
    longTerm: string[];
  } {
    const immediate = findings
      .filter(
        (f) =>
          f.level === 'critical' ||
          (f.level === 'high' && f.remediation.priority === 1),
      )
      .map((f) => f.recommendation);

    const shortTerm = findings
      .filter(
        (f) =>
          f.level === 'high' ||
          (f.level === 'medium' && f.remediation.priority <= 2),
      )
      .map((f) => f.recommendation);

    const longTerm = findings
      .filter((f) => f.level === 'medium' || f.level === 'low')
      .map((f) => f.recommendation);

    return {
      immediate: [...new Set(immediate)].slice(0, 5),
      shortTerm: [...new Set(shortTerm)].slice(0, 8),
      longTerm: [...new Set(longTerm)].slice(0, 10),
    };
  }

  /**
   * Save audit report to disk
   */
  private async saveAuditReport(report: PrivacyAuditReport): Promise<void> {
    try {
      await fs.mkdir(this.auditDir, { recursive: true });
      const reportPath = path.join(this.auditDir, `${report.id}.json`);
      await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    } catch (error) {
      console.warn('Failed to save audit report:', error);
    }
  }

  /**
   * Load historical audit reports
   */
  async getAuditHistory(limit: number = 10): Promise<PrivacyAuditReport[]> {
    try {
      const files = await fs.readdir(this.auditDir);
      const reports: PrivacyAuditReport[] = [];

      for (const file of files.slice(0, limit)) {
        if (file.endsWith('.json')) {
          try {
            const content = await fs.readFile(
              path.join(this.auditDir, file),
              'utf-8',
            );
            const report = JSON.parse(content);
            // Convert timestamp string back to Date object
            if (typeof report.timestamp === 'string') {
              report.timestamp = new Date(report.timestamp);
            }
            reports.push(report);
          } catch (error) {
            console.warn(`Failed to load audit report ${file}:`, error);
          }
        }
      }

      return reports.sort(
        (a, b) => b.timestamp.getTime() - a.timestamp.getTime(),
      );
    } catch (_error) {
      return [];
    }
  }

  /**
   * Format audit report as human-readable text
   */
  formatReportAsText(report: PrivacyAuditReport): string {
    let output = '';

    output += `\n🔒 Privacy Audit Report\n`;
    output += `═`.repeat(50) + '\n\n';
    output += `Audit ID: ${report.id}\n`;
    output += `Timestamp: ${report.timestamp.toISOString()}\n`;
    output += `Duration: ${(report.duration / 1000).toFixed(2)}s\n`;
    output += `Compliance Score: ${report.summary.complianceScore}/100\n\n`;

    // Summary
    output += `📊 Summary:\n`;
    output += `   Total Findings: ${report.summary.totalFindings}\n`;
    output += `   Critical: ${report.summary.criticalFindings}\n`;
    output += `   High: ${report.summary.highFindings}\n`;
    output += `   Medium: ${report.summary.mediumFindings}\n`;
    output += `   Low: ${report.summary.lowFindings}\n\n`;

    // Compliance status
    output += `✅ Compliance Status:\n`;
    for (const [framework, status] of Object.entries(report.complianceStatus)) {
      const emoji = status.compliant ? '✅' : '❌';
      output += `   ${emoji} ${framework.toUpperCase()}: ${status.score}/100\n`;
    }
    output += '\n';

    // Critical and high findings
    const criticalAndHigh = report.findings.filter(
      (f) => f.level === 'critical' || f.level === 'high',
    );
    if (criticalAndHigh.length > 0) {
      output += `🚨 Critical & High Priority Findings:\n`;
      criticalAndHigh.forEach((finding, i) => {
        const emoji = finding.level === 'critical' ? '🔴' : '🟠';
        output += `   ${i + 1}. ${emoji} ${finding.title}\n`;
        output += `      ${finding.description}\n`;
        output += `      Recommendation: ${finding.recommendation}\n\n`;
      });
    }

    // Immediate recommendations
    if (report.recommendations.immediate.length > 0) {
      output += `⚡ Immediate Actions Required:\n`;
      report.recommendations.immediate.forEach((rec, i) => {
        output += `   ${i + 1}. ${rec}\n`;
      });
      output += '\n';
    }

    output += `📅 Next Audit Recommended: ${report.nextAuditRecommended.toDateString()}\n`;

    return output;
  }
}
