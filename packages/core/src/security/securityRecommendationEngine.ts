/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { PrivacyManager } from '../trust/privacyManager.js';
import { PerformanceMonitor } from '../trust/performanceMonitor.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

/**
 * Security recommendation levels
 */
export type SecurityLevel = 'critical' | 'high' | 'medium' | 'low' | 'info';

/**
 * Security categories for recommendations
 */
export type SecurityCategory = 'authentication' | 'authorization' | 'encryption' | 'network' | 'system' | 'application' | 'compliance' | 'monitoring';

/**
 * Individual security recommendation
 */
export interface SecurityRecommendation {
  id: string;
  level: SecurityLevel;
  category: SecurityCategory;
  title: string;
  description: string;
  impact: string;
  recommendation: string;
  implementation: {
    steps: string[];
    effort: 'low' | 'medium' | 'high';
    timeEstimate: string;
    cost: 'none' | 'low' | 'medium' | 'high';
  };
  remediation: {
    automated: boolean;
    automationScript?: string;
    manualSteps: string[];
    verificationSteps: string[];
  };
  compliance: string[];
  priority: number;
  riskScore: number; // 0-100
  evidence?: {
    type: 'config' | 'scan' | 'log' | 'system';
    source: string;
    details: any;
  };
  timestamp: Date;
}

/**
 * Security assessment report
 */
export interface SecurityAssessmentReport {
  id: string;
  timestamp: Date;
  duration: number;
  scope: {
    categories: SecurityCategory[];
    systemScan: boolean;
    configurationReview: boolean;
    vulnerabilityAssessment: boolean;
  };
  summary: {
    totalRecommendations: number;
    criticalRecommendations: number;
    highRecommendations: number;
    overallSecurityScore: number; // 0-100
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
  };
  recommendations: SecurityRecommendation[];
  vulnerabilities: SecurityVulnerability[];
  systemHardening: SystemHardeningCheck[];
  complianceGaps: ComplianceGap[];
  actionPlan: {
    immediate: SecurityRecommendation[];
    shortTerm: SecurityRecommendation[];
    longTerm: SecurityRecommendation[];
  };
}

/**
 * Security vulnerability finding
 */
export interface SecurityVulnerability {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  type: 'configuration' | 'software' | 'permission' | 'network' | 'cryptographic';
  title: string;
  description: string;
  affected: string;
  cve?: string;
  cvssScore?: number;
  exploitability: 'high' | 'medium' | 'low';
  impact: string;
  solution: string;
  workaround?: string;
  references: string[];
  detected: Date;
}

/**
 * System hardening check
 */
export interface SystemHardeningCheck {
  id: string;
  category: 'filesystem' | 'network' | 'process' | 'user' | 'service';
  name: string;
  description: string;
  status: 'pass' | 'fail' | 'warning' | 'not_applicable';
  expected: string;
  actual: string;
  recommendation?: string;
  securityImpact: 'high' | 'medium' | 'low';
}

/**
 * Compliance gap finding
 */
export interface ComplianceGap {
  id: string;
  framework: string;
  control: string;
  requirement: string;
  currentStatus: 'not_implemented' | 'partially_implemented' | 'implemented';
  gap: string;
  recommendation: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
}

/**
 * Security assessment configuration
 */
export interface SecurityAssessmentConfig {
  categories: SecurityCategory[];
  depth: 'basic' | 'standard' | 'comprehensive';
  includeSystemScan: boolean;
  includeVulnerabilityAssessment: boolean;
  includeComplianceCheck: boolean;
  customChecks?: {
    name: string;
    description: string;
    check: () => Promise<SecurityRecommendation[]>;
  }[];
}

/**
 * Comprehensive security recommendation engine
 */
export class SecurityRecommendationEngine {
  private privacyManager: PrivacyManager;
  private performanceMonitor: PerformanceMonitor;
  private reportsDir: string;

  constructor(privacyManager: PrivacyManager, performanceMonitor: PerformanceMonitor) {
    this.privacyManager = privacyManager;
    this.performanceMonitor = performanceMonitor;
    this.reportsDir = path.join(os.homedir(), '.trustcli', 'security', 'reports');
  }

  /**
   * Conduct comprehensive security assessment
   */
  async conductSecurityAssessment(config: SecurityAssessmentConfig): Promise<SecurityAssessmentReport> {
    const startTime = Date.now();
    const assessmentId = `security-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const recommendations: SecurityRecommendation[] = [];
    const vulnerabilities: SecurityVulnerability[] = [];
    const systemHardening: SystemHardeningCheck[] = [];
    const complianceGaps: ComplianceGap[] = [];

    // Core security checks
    recommendations.push(...await this.assessAuthentication());
    recommendations.push(...await this.assessEncryption());
    recommendations.push(...await this.assessSystemSecurity());
    recommendations.push(...await this.assessApplicationSecurity());

    // Category-specific assessments
    for (const category of config.categories) {
      recommendations.push(...await this.assessSecurityCategory(category));
    }

    // System scanning
    if (config.includeSystemScan) {
      systemHardening.push(...await this.performSystemHardening());
    }

    // Vulnerability assessment
    if (config.includeVulnerabilityAssessment) {
      vulnerabilities.push(...await this.assessVulnerabilities());
    }

    // Compliance checking
    if (config.includeComplianceCheck) {
      complianceGaps.push(...await this.checkComplianceGaps());
    }

    // Custom checks
    if (config.customChecks) {
      for (const customCheck of config.customChecks) {
        try {
          const customRecommendations = await customCheck.check();
          recommendations.push(...customRecommendations);
        } catch (error) {
          recommendations.push({
            id: `custom-security-check-error-${Date.now()}`,
            level: 'medium',
            category: 'system',
            title: 'Custom Security Check Error',
            description: `Failed to execute custom security check "${customCheck.name}": ${error}`,
            impact: 'Security assessment coverage may be incomplete',
            recommendation: 'Review and fix the custom security check implementation',
            implementation: {
              steps: ['Review custom check code', 'Fix implementation errors', 'Re-run assessment'],
              effort: 'medium',
              timeEstimate: '1-2 hours',
              cost: 'none'
            },
            remediation: {
              automated: false,
              manualSteps: ['Debug custom check', 'Fix errors', 'Test'],
              verificationSteps: ['Re-run assessment']
            },
            compliance: [],
            priority: 3,
            riskScore: 30,
            timestamp: new Date()
          });
        }
      }
    }

    // Calculate summary and risk metrics
    const summary = this.calculateSecuritySummary(recommendations, vulnerabilities);
    const actionPlan = this.generateSecurityActionPlan(recommendations);

    const report: SecurityAssessmentReport = {
      id: assessmentId,
      timestamp: new Date(),
      duration: Date.now() - startTime,
      scope: {
        categories: config.categories,
        systemScan: config.includeSystemScan,
        configurationReview: true,
        vulnerabilityAssessment: config.includeVulnerabilityAssessment
      },
      summary,
      recommendations: recommendations.sort((a, b) => {
        const levelOrder = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };
        return levelOrder[b.level] - levelOrder[a.level] || b.riskScore - a.riskScore;
      }),
      vulnerabilities: vulnerabilities.sort((a, b) => {
        const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
        return severityOrder[b.severity] - severityOrder[a.severity];
      }),
      systemHardening,
      complianceGaps,
      actionPlan
    };

    // Save assessment report
    await this.saveSecurityReport(report);

    return report;
  }

  /**
   * Assess authentication security
   */
  private async assessAuthentication(): Promise<SecurityRecommendation[]> {
    const recommendations: SecurityRecommendation[] = [];

    // Check for proper authentication mechanisms
    // Note: This is a basic check - in a real implementation, this would
    // analyze actual authentication configurations
    
    recommendations.push({
      id: 'auth-local-only',
      level: 'info',
      category: 'authentication',
      title: 'Local-Only Authentication Model',
      description: 'Trust CLI uses local-only inference, reducing authentication attack surface',
      impact: 'Positive security posture - no external authentication required',
      recommendation: 'Continue using local-only model for enhanced security',
      implementation: {
        steps: ['Maintain local inference configuration', 'Avoid cloud-based authentication'],
        effort: 'low',
        timeEstimate: 'Ongoing',
        cost: 'none'
      },
      remediation: {
        automated: false,
        manualSteps: ['Monitor authentication configuration'],
        verificationSteps: ['Verify no external auth configured']
      },
      compliance: ['SOX', 'HIPAA', 'PCI-DSS'],
      priority: 5,
      riskScore: 10,
      timestamp: new Date()
    });

    return recommendations;
  }

  /**
   * Assess encryption security
   */
  private async assessEncryption(): Promise<SecurityRecommendation[]> {
    const recommendations: SecurityRecommendation[] = [];
    const privacyConfig = await this.privacyManager.getPrivacyConfig();

    if (!privacyConfig.encryptStorage) {
      recommendations.push({
        id: 'encryption-at-rest',
        level: 'critical',
        category: 'encryption',
        title: 'Enable Encryption at Rest',
        description: 'Data storage is not encrypted, exposing sensitive information to unauthorized access',
        impact: 'High risk of data breach if system is compromised',
        recommendation: 'Enable storage encryption immediately using AES-256',
        implementation: {
          steps: [
            'Enable encryptStorage in privacy configuration',
            'Generate encryption keys',
            'Re-encrypt existing data',
            'Verify encryption is active'
          ],
          effort: 'medium',
          timeEstimate: '2-4 hours',
          cost: 'none'
        },
        remediation: {
          automated: true,
          automationScript: 'trust privacy mode strict && trust privacy encrypt enable',
          manualSteps: [
            'Backup existing data',
            'Enable encryption in config',
            'Verify all data is encrypted'
          ],
          verificationSteps: [
            'Check privacy configuration',
            'Verify encrypted file extensions',
            'Test data access with encryption'
          ]
        },
        compliance: ['GDPR', 'HIPAA', 'PCI-DSS', 'SOX'],
        priority: 1,
        riskScore: 90,
        evidence: {
          type: 'config',
          source: 'privacy-config.json',
          details: { encryptStorage: privacyConfig.encryptStorage }
        },
        timestamp: new Date()
      });
    }

    // Check encryption strength
    if (privacyConfig.encryptStorage) {
      recommendations.push({
        id: 'encryption-strength-verification',
        level: 'medium',
        category: 'encryption',
        title: 'Verify Encryption Strength',
        description: 'Ensure encryption uses industry-standard algorithms and key lengths',
        impact: 'Weak encryption could be broken by determined attackers',
        recommendation: 'Verify AES-256-GCM is being used for encryption',
        implementation: {
          steps: [
            'Review encryption implementation',
            'Verify AES-256-GCM usage',
            'Check key generation methods',
            'Validate key storage security'
          ],
          effort: 'low',
          timeEstimate: '30 minutes',
          cost: 'none'
        },
        remediation: {
          automated: false,
          manualSteps: [
            'Check encryption algorithm in code',
            'Verify key length is 256 bits',
            'Ensure proper IV generation'
          ],
          verificationSteps: [
            'Code review of encryption functions',
            'Test encryption/decryption',
            'Verify against security standards'
          ]
        },
        compliance: ['FIPS 140-2', 'Common Criteria'],
        priority: 3,
        riskScore: 40,
        timestamp: new Date()
      });
    }

    return recommendations;
  }

  /**
   * Assess system security
   */
  private async assessSystemSecurity(): Promise<SecurityRecommendation[]> {
    const recommendations: SecurityRecommendation[] = [];

    // Check file permissions
    try {
      const trustDir = path.join(os.homedir(), '.trustcli');
      const stats = await fs.stat(trustDir);
      const mode = stats.mode & parseInt('777', 8);

      if (mode !== parseInt('700', 8)) {
        recommendations.push({
          id: 'file-permissions-trust-dir',
          level: 'high',
          category: 'system',
          title: 'Secure Trust CLI Directory Permissions',
          description: `Trust CLI directory has permissions ${mode.toString(8)}, should be 700 for security`,
          impact: 'Unauthorized users may access sensitive configuration and data',
          recommendation: 'Set directory permissions to 700 (owner read/write/execute only)',
          implementation: {
            steps: [
              `chmod 700 ${trustDir}`,
              'Verify permissions are correct',
              'Check subdirectory permissions'
            ],
            effort: 'low',
            timeEstimate: '5 minutes',
            cost: 'none'
          },
          remediation: {
            automated: true,
            automationScript: `chmod 700 ${trustDir}`,
            manualSteps: ['Change directory permissions', 'Verify changes'],
            verificationSteps: ['ls -la to check permissions']
          },
          compliance: ['NIST SP 800-53', 'CIS Controls'],
          priority: 2,
          riskScore: 60,
          evidence: {
            type: 'system',
            source: trustDir,
            details: { currentMode: mode.toString(8), expectedMode: '700' }
          },
          timestamp: new Date()
        });
      }
    } catch (error) {
      // Directory doesn't exist - this is handled elsewhere
    }

    // Check for secure defaults
    recommendations.push({
      id: 'secure-defaults',
      level: 'info',
      category: 'system',
      title: 'Secure Default Configuration',
      description: 'Review and maintain secure default configurations',
      impact: 'Proper defaults reduce security configuration burden',
      recommendation: 'Regularly review and update security defaults',
      implementation: {
        steps: [
          'Review privacy mode defaults',
          'Check audit logging defaults',
          'Verify encryption defaults',
          'Update as needed'
        ],
        effort: 'low',
        timeEstimate: '1 hour quarterly',
        cost: 'none'
      },
      remediation: {
        automated: false,
        manualSteps: ['Regular configuration review', 'Update defaults'],
        verificationSteps: ['Test default configurations']
      },
      compliance: ['Security by Design'],
      priority: 4,
      riskScore: 20,
      timestamp: new Date()
    });

    return recommendations;
  }

  /**
   * Assess application security
   */
  private async assessApplicationSecurity(): Promise<SecurityRecommendation[]> {
    const recommendations: SecurityRecommendation[] = [];

    // Model integrity checks
    recommendations.push({
      id: 'model-integrity-verification',
      level: 'high',
      category: 'application',
      title: 'Implement Model Integrity Verification',
      description: 'Verify AI model integrity to prevent tampering and ensure authenticity',
      impact: 'Compromised models could produce malicious outputs or leak data',
      recommendation: 'Implement checksum verification for all AI models',
      implementation: {
        steps: [
          'Generate checksums for all models',
          'Store checksums securely',
          'Verify before each use',
          'Alert on mismatch'
        ],
        effort: 'medium',
        timeEstimate: '4-6 hours',
        cost: 'low'
      },
      remediation: {
        automated: true,
        automationScript: 'trust model verify --all',
        manualSteps: [
          'Calculate model checksums',
          'Store in secure location',
          'Implement verification process'
        ],
        verificationSteps: [
          'Test model verification',
          'Verify checksum storage',
          'Test tamper detection'
        ]
      },
      compliance: ['NIST AI Risk Management Framework'],
      priority: 2,
      riskScore: 70,
      timestamp: new Date()
    });

    // Input validation
    recommendations.push({
      id: 'input-validation',
      level: 'medium',
      category: 'application',
      title: 'Implement Comprehensive Input Validation',
      description: 'Validate and sanitize all user inputs to prevent injection attacks',
      impact: 'Improper input handling could lead to prompt injection or data leakage',
      recommendation: 'Implement robust input validation and sanitization',
      implementation: {
        steps: [
          'Define input validation rules',
          'Implement sanitization functions',
          'Add length and content checks',
          'Test with malicious inputs'
        ],
        effort: 'medium',
        timeEstimate: '3-5 hours',
        cost: 'none'
      },
      remediation: {
        automated: false,
        manualSteps: [
          'Code input validation',
          'Test validation functions',
          'Document validation rules'
        ],
        verificationSteps: [
          'Test with various inputs',
          'Verify sanitization works',
          'Check error handling'
        ]
      },
      compliance: ['OWASP Top 10'],
      priority: 3,
      riskScore: 50,
      timestamp: new Date()
    });

    return recommendations;
  }

  /**
   * Assess specific security category
   */
  private async assessSecurityCategory(category: SecurityCategory): Promise<SecurityRecommendation[]> {
    const recommendations: SecurityRecommendation[] = [];

    switch (category) {
      case 'monitoring':
        recommendations.push(...await this.assessMonitoring());
        break;
      case 'network':
        recommendations.push(...await this.assessNetwork());
        break;
      case 'authorization':
        recommendations.push(...await this.assessAuthorization());
        break;
      case 'compliance':
        recommendations.push(...await this.assessCompliance());
        break;
    }

    return recommendations;
  }

  /**
   * Assess monitoring and logging security
   */
  private async assessMonitoring(): Promise<SecurityRecommendation[]> {
    const recommendations: SecurityRecommendation[] = [];
    const privacyConfig = await this.privacyManager.getPrivacyConfig();

    if (!privacyConfig.auditLogging) {
      recommendations.push({
        id: 'security-monitoring',
        level: 'high',
        category: 'monitoring',
        title: 'Enable Security Monitoring and Logging',
        description: 'Security events are not being logged, preventing incident detection',
        impact: 'Security incidents may go undetected, hampering response efforts',
        recommendation: 'Enable comprehensive audit logging for security monitoring',
        implementation: {
          steps: [
            'Enable audit logging in privacy config',
            'Configure log retention policies',
            'Set up log monitoring',
            'Define alerting rules'
          ],
          effort: 'medium',
          timeEstimate: '2-3 hours',
          cost: 'none'
        },
        remediation: {
          automated: true,
          automationScript: 'trust privacy audit enable',
          manualSteps: ['Enable logging', 'Configure monitoring'],
          verificationSteps: ['Check log generation', 'Verify monitoring']
        },
        compliance: ['SOX', 'PCI-DSS', 'ISO 27001'],
        priority: 2,
        riskScore: 65,
        timestamp: new Date()
      });
    }

    return recommendations;
  }

  /**
   * Assess network security
   */
  private async assessNetwork(): Promise<SecurityRecommendation[]> {
    const recommendations: SecurityRecommendation[] = [];

    // Local-only operation is a security strength
    recommendations.push({
      id: 'network-isolation',
      level: 'info',
      category: 'network',
      title: 'Network Isolation Advantage',
      description: 'Local-only AI operation provides network isolation benefits',
      impact: 'Reduced attack surface by eliminating network dependencies',
      recommendation: 'Maintain local-only operation model for security',
      implementation: {
        steps: ['Continue local inference', 'Avoid network-dependent models'],
        effort: 'low',
        timeEstimate: 'Ongoing',
        cost: 'none'
      },
      remediation: {
        automated: false,
        manualSteps: ['Monitor for network dependencies'],
        verificationSteps: ['Verify no external connections']
      },
      compliance: ['Zero Trust Architecture'],
      priority: 4,
      riskScore: 15,
      timestamp: new Date()
    });

    return recommendations;
  }

  /**
   * Assess authorization mechanisms
   */
  private async assessAuthorization(): Promise<SecurityRecommendation[]> {
    const recommendations: SecurityRecommendation[] = [];

    // File-based access control
    recommendations.push({
      id: 'file-based-authorization',
      level: 'medium',
      category: 'authorization',
      title: 'File-Based Access Control Review',
      description: 'Review and strengthen file-based access controls',
      impact: 'Weak file permissions could allow unauthorized access',
      recommendation: 'Implement principle of least privilege for file access',
      implementation: {
        steps: [
          'Audit current file permissions',
          'Apply least privilege principle',
          'Set restrictive defaults',
          'Monitor access patterns'
        ],
        effort: 'medium',
        timeEstimate: '2-3 hours',
        cost: 'none'
      },
      remediation: {
        automated: true,
        automationScript: 'find ~/.trustcli -type f -exec chmod 600 {} \\;',
        manualSteps: ['Set restrictive permissions', 'Verify access'],
        verificationSteps: ['Test file access', 'Check permissions']
      },
      compliance: ['NIST SP 800-53 AC-3'],
      priority: 3,
      riskScore: 45,
      timestamp: new Date()
    });

    return recommendations;
  }

  /**
   * Assess compliance posture
   */
  private async assessCompliance(): Promise<SecurityRecommendation[]> {
    const recommendations: SecurityRecommendation[] = [];

    // Regular compliance assessment
    recommendations.push({
      id: 'regular-compliance-assessment',
      level: 'medium',
      category: 'compliance',
      title: 'Establish Regular Compliance Assessments',
      description: 'Implement regular security and privacy compliance assessments',
      impact: 'Compliance drift may result in regulatory violations',
      recommendation: 'Schedule quarterly security and privacy assessments',
      implementation: {
        steps: [
          'Define assessment schedule',
          'Create assessment checklists',
          'Automate where possible',
          'Track remediation progress'
        ],
        effort: 'medium',
        timeEstimate: '4-6 hours initial setup',
        cost: 'low'
      },
      remediation: {
        automated: true,
        automationScript: 'trust privacy audit --comprehensive',
        manualSteps: ['Schedule assessments', 'Create processes'],
        verificationSteps: ['Run test assessment', 'Verify reporting']
      },
      compliance: ['Continuous Compliance'],
      priority: 3,
      riskScore: 35,
      timestamp: new Date()
    });

    return recommendations;
  }

  /**
   * Perform system hardening checks
   */
  private async performSystemHardening(): Promise<SystemHardeningCheck[]> {
    const checks: SystemHardeningCheck[] = [];

    // File permissions check
    try {
      const trustDir = path.join(os.homedir(), '.trustcli');
      const stats = await fs.stat(trustDir);
      const mode = stats.mode & parseInt('777', 8);

      checks.push({
        id: 'trust-dir-permissions',
        category: 'filesystem',
        name: 'Trust CLI Directory Permissions',
        description: 'Trust CLI directory should have restrictive permissions',
        status: mode === parseInt('700', 8) ? 'pass' : 'fail',
        expected: '700 (owner only)',
        actual: mode.toString(8),
        recommendation: mode !== parseInt('700', 8) ? 'Set permissions to 700' : undefined,
        securityImpact: 'high'
      });
    } catch (error) {
      checks.push({
        id: 'trust-dir-exists',
        category: 'filesystem',
        name: 'Trust CLI Directory Existence',
        description: 'Trust CLI directory should exist',
        status: 'fail',
        expected: 'Directory exists',
        actual: 'Directory not found',
        recommendation: 'Initialize Trust CLI configuration',
        securityImpact: 'medium'
      });
    }

    return checks;
  }

  /**
   * Assess vulnerabilities
   */
  private async assessVulnerabilities(): Promise<SecurityVulnerability[]> {
    const vulnerabilities: SecurityVulnerability[] = [];

    // This is a placeholder for actual vulnerability scanning
    // In a real implementation, this would scan for known vulnerabilities
    
    return vulnerabilities;
  }

  /**
   * Check compliance gaps
   */
  private async checkComplianceGaps(): Promise<ComplianceGap[]> {
    const gaps: ComplianceGap[] = [];
    const privacyConfig = await this.privacyManager.getPrivacyConfig();

    // GDPR compliance gaps
    if (!privacyConfig.encryptStorage) {
      gaps.push({
        id: 'gdpr-encryption',
        framework: 'GDPR',
        control: 'Article 32',
        requirement: 'Security of processing - encryption',
        currentStatus: 'not_implemented',
        gap: 'Personal data encryption not implemented',
        recommendation: 'Enable storage encryption',
        priority: 'critical'
      });
    }

    return gaps;
  }

  /**
   * Calculate security summary
   */
  private calculateSecuritySummary(
    recommendations: SecurityRecommendation[],
    vulnerabilities: SecurityVulnerability[]
  ): SecurityAssessmentReport['summary'] {
    const criticalRecs = recommendations.filter(r => r.level === 'critical').length;
    const highRecs = recommendations.filter(r => r.level === 'high').length;
    const criticalVulns = vulnerabilities.filter(v => v.severity === 'critical').length;
    const highVulns = vulnerabilities.filter(v => v.severity === 'high').length;

    const totalRecommendations = recommendations.length;
    const criticalRecommendations = criticalRecs;
    const highRecommendations = highRecs;

    // Calculate overall security score (0-100)
    let securityScore = 100;
    securityScore -= criticalRecs * 20;
    securityScore -= highRecs * 10;
    securityScore -= criticalVulns * 25;
    securityScore -= highVulns * 15;
    securityScore = Math.max(0, securityScore);

    // Determine risk level
    let riskLevel: 'low' | 'medium' | 'high' | 'critical';
    if (criticalRecs > 0 || criticalVulns > 0) riskLevel = 'critical';
    else if (highRecs > 2 || highVulns > 1) riskLevel = 'high';
    else if (highRecs > 0 || highVulns > 0) riskLevel = 'medium';
    else riskLevel = 'low';

    return {
      totalRecommendations,
      criticalRecommendations,
      highRecommendations,
      overallSecurityScore: securityScore,
      riskLevel
    };
  }

  /**
   * Generate security action plan
   */
  private generateSecurityActionPlan(recommendations: SecurityRecommendation[]): {
    immediate: SecurityRecommendation[];
    shortTerm: SecurityRecommendation[];
    longTerm: SecurityRecommendation[];
  } {
    const immediate = recommendations
      .filter(r => r.level === 'critical' || (r.level === 'high' && r.priority === 1))
      .slice(0, 5);

    const shortTerm = recommendations
      .filter(r => r.level === 'high' || (r.level === 'medium' && r.priority <= 2))
      .slice(0, 8);

    const longTerm = recommendations
      .filter(r => r.level === 'medium' || r.level === 'low')
      .slice(0, 10);

    return { immediate, shortTerm, longTerm };
  }

  /**
   * Save security report to disk
   */
  private async saveSecurityReport(report: SecurityAssessmentReport): Promise<void> {
    try {
      await fs.mkdir(this.reportsDir, { recursive: true });
      const reportPath = path.join(this.reportsDir, `${report.id}.json`);
      await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    } catch (error) {
      console.warn('Failed to save security report:', error);
    }
  }

  /**
   * Format security report as human-readable text
   */
  formatReportAsText(report: SecurityAssessmentReport): string {
    let output = '';

    output += `\n🔐 Security Assessment Report\n`;
    output += `═`.repeat(60) + '\n\n';
    output += `Assessment ID: ${report.id}\n`;
    output += `Timestamp: ${report.timestamp.toISOString()}\n`;
    output += `Duration: ${(report.duration / 1000).toFixed(2)}s\n`;
    output += `Security Score: ${report.summary.overallSecurityScore}/100\n`;
    output += `Risk Level: ${report.summary.riskLevel.toUpperCase()}\n\n`;

    // Summary
    output += `📊 Summary:\n`;
    output += `   Total Recommendations: ${report.summary.totalRecommendations}\n`;
    output += `   Critical: ${report.summary.criticalRecommendations}\n`;
    output += `   High: ${report.summary.highRecommendations}\n\n`;

    // Critical and high recommendations
    const criticalAndHigh = report.recommendations.filter(r => r.level === 'critical' || r.level === 'high');
    if (criticalAndHigh.length > 0) {
      output += `🚨 Critical & High Priority Recommendations:\n`;
      criticalAndHigh.forEach((rec, i) => {
        const emoji = rec.level === 'critical' ? '🔴' : '🟠';
        output += `   ${i + 1}. ${emoji} ${rec.title}\n`;
        output += `      ${rec.description}\n`;
        output += `      Action: ${rec.recommendation}\n`;
        if (rec.remediation.automated) {
          output += `      Quick Fix: ${rec.remediation.automationScript}\n`;
        }
        output += `\n`;
      });
    }

    // Vulnerabilities
    if (report.vulnerabilities.length > 0) {
      output += `🛡️  Vulnerabilities Found:\n`;
      report.vulnerabilities.slice(0, 5).forEach((vuln, i) => {
        const emoji = vuln.severity === 'critical' ? '🔴' : vuln.severity === 'high' ? '🟠' : '🟡';
        output += `   ${i + 1}. ${emoji} ${vuln.title}\n`;
        output += `      ${vuln.description}\n`;
        if (vuln.cve) output += `      CVE: ${vuln.cve}\n`;
        output += `\n`;
      });
    }

    // Immediate actions
    if (report.actionPlan.immediate.length > 0) {
      output += `⚡ Immediate Actions Required:\n`;
      report.actionPlan.immediate.forEach((action, i) => {
        output += `   ${i + 1}. ${action.title}\n`;
        if (action.remediation.automated) {
          output += `      Command: ${action.remediation.automationScript}\n`;
        }
      });
      output += '\n';
    }

    return output;
  }
}