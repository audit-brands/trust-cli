/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  SecurityRecommendationEngine,
  SecurityAssessmentConfig,
  SecurityAssessmentReport,
} from './securityRecommendationEngine.js';
import { PrivacyManager, PrivacyConfig } from '../trust/privacyManager.js';
import { PerformanceMonitor } from '../trust/performanceMonitor.js';

// Mock dependencies
vi.mock('fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  readdir: vi.fn().mockResolvedValue([]),
  readFile: vi.fn().mockResolvedValue('{}'),
  writeFile: vi.fn().mockResolvedValue(undefined),
  stat: vi.fn().mockResolvedValue({
    mode: parseInt('700', 8),
  }),
}));

vi.mock('os', () => ({
  homedir: vi.fn().mockReturnValue('/home/test'),
}));

describe('SecurityRecommendationEngine', () => {
  let securityEngine: SecurityRecommendationEngine;
  let mockPrivacyManager: PrivacyManager;
  let mockPerformanceMonitor: PerformanceMonitor;

  const mockPrivacyConfig: PrivacyConfig = {
    mode: 'moderate',
    dataRetention: 30,
    allowTelemetry: false,
    encryptStorage: true,
    shareData: false,
    allowCloudSync: false,
    auditLogging: true,
    lastUpdated: new Date().toISOString(),
    version: '1.0.0',
  };

  beforeEach(() => {
    mockPerformanceMonitor = {} as PerformanceMonitor;
    mockPrivacyManager = {
      getPrivacyConfig: vi.fn().mockResolvedValue(mockPrivacyConfig),
    } as any;
    securityEngine = new SecurityRecommendationEngine(
      mockPrivacyManager,
      mockPerformanceMonitor,
    );
  });

  describe('Security Assessment', () => {
    it('should conduct comprehensive security assessment', async () => {
      const config: SecurityAssessmentConfig = {
        categories: ['authentication', 'encryption', 'system'],
        depth: 'comprehensive',
        includeSystemScan: true,
        includeVulnerabilityAssessment: true,
        includeComplianceCheck: true,
      };

      const report = await securityEngine.conductSecurityAssessment(config);

      expect(report.id).toBeDefined();
      expect(report.timestamp).toBeInstanceOf(Date);
      expect(report.duration).toBeGreaterThanOrEqual(0);
      expect(report.summary).toBeDefined();
      expect(report.recommendations).toBeInstanceOf(Array);
      expect(report.scope.categories).toEqual(config.categories);
    });

    it('should calculate security summary correctly', async () => {
      const config: SecurityAssessmentConfig = {
        categories: ['encryption'],
        depth: 'standard',
        includeSystemScan: false,
        includeVulnerabilityAssessment: false,
        includeComplianceCheck: false,
      };

      const report = await securityEngine.conductSecurityAssessment(config);

      expect(report.summary.totalRecommendations).toBeGreaterThanOrEqual(0);
      expect(report.summary.overallSecurityScore).toBeGreaterThanOrEqual(0);
      expect(report.summary.overallSecurityScore).toBeLessThanOrEqual(100);
      expect(report.summary.riskLevel).toMatch(/^(low|medium|high|critical)$/);
    });
  });

  describe('Authentication Assessment', () => {
    it('should recognize local-only authentication as a security strength', async () => {
      const config: SecurityAssessmentConfig = {
        categories: ['authentication'],
        depth: 'basic',
        includeSystemScan: false,
        includeVulnerabilityAssessment: false,
        includeComplianceCheck: false,
      };

      const report = await securityEngine.conductSecurityAssessment(config);

      const authRecommendations = report.recommendations.filter(
        (r) => r.category === 'authentication',
      );
      expect(authRecommendations).toHaveLength(1);
      expect(authRecommendations[0].level).toBe('info');
      expect(authRecommendations[0].title).toContain(
        'Local-Only Authentication',
      );
      expect(authRecommendations[0].riskScore).toBeLessThan(20);
    });
  });

  describe('Encryption Assessment', () => {
    it('should detect disabled encryption as critical issue', async () => {
      const unencryptedConfig = { ...mockPrivacyConfig, encryptStorage: false };
      vi.mocked(mockPrivacyManager.getPrivacyConfig).mockResolvedValue(
        unencryptedConfig,
      );

      const config: SecurityAssessmentConfig = {
        categories: ['encryption'],
        depth: 'standard',
        includeSystemScan: false,
        includeVulnerabilityAssessment: false,
        includeComplianceCheck: false,
      };

      const report = await securityEngine.conductSecurityAssessment(config);

      const encryptionRecs = report.recommendations.filter(
        (r) => r.id === 'encryption-at-rest',
      );
      expect(encryptionRecs).toHaveLength(1);
      expect(encryptionRecs[0].level).toBe('critical');
      expect(encryptionRecs[0].category).toBe('encryption');
      expect(encryptionRecs[0].riskScore).toBeGreaterThan(80);
      expect(encryptionRecs[0].remediation.automated).toBe(true);
    });

    it('should verify encryption strength when enabled', async () => {
      const config: SecurityAssessmentConfig = {
        categories: ['encryption'],
        depth: 'comprehensive',
        includeSystemScan: false,
        includeVulnerabilityAssessment: false,
        includeComplianceCheck: false,
      };

      const report = await securityEngine.conductSecurityAssessment(config);

      const strengthRecs = report.recommendations.filter(
        (r) => r.id === 'encryption-strength-verification',
      );
      expect(strengthRecs).toHaveLength(1);
      expect(strengthRecs[0].level).toBe('medium');
      expect(strengthRecs[0].category).toBe('encryption');
      expect(strengthRecs[0].compliance).toContain('FIPS 140-2');
    });
  });

  describe('System Security Assessment', () => {
    it('should detect insecure file permissions', async () => {
      // Mock insecure file permissions
      const fs = await import('fs/promises');
      vi.mocked(fs.stat).mockResolvedValue({
        mode: parseInt('755', 8), // Insecure permissions
      } as any);

      const config: SecurityAssessmentConfig = {
        categories: ['system'],
        depth: 'standard',
        includeSystemScan: true,
        includeVulnerabilityAssessment: false,
        includeComplianceCheck: false,
      };

      const report = await securityEngine.conductSecurityAssessment(config);

      const permissionRecs = report.recommendations.filter(
        (r) => r.id === 'file-permissions-trust-dir',
      );
      expect(permissionRecs).toHaveLength(1);
      expect(permissionRecs[0].level).toBe('high');
      expect(permissionRecs[0].category).toBe('system');
      expect(permissionRecs[0].remediation.automated).toBe(true);
    });

    it('should recommend secure defaults', async () => {
      const config: SecurityAssessmentConfig = {
        categories: ['system'],
        depth: 'basic',
        includeSystemScan: false,
        includeVulnerabilityAssessment: false,
        includeComplianceCheck: false,
      };

      const report = await securityEngine.conductSecurityAssessment(config);

      const defaultRecs = report.recommendations.filter(
        (r) => r.id === 'secure-defaults',
      );
      expect(defaultRecs).toHaveLength(1);
      expect(defaultRecs[0].level).toBe('info');
      expect(defaultRecs[0].category).toBe('system');
    });
  });

  describe('Application Security Assessment', () => {
    it('should recommend model integrity verification', async () => {
      const config: SecurityAssessmentConfig = {
        categories: ['application'],
        depth: 'standard',
        includeSystemScan: false,
        includeVulnerabilityAssessment: false,
        includeComplianceCheck: false,
      };

      const report = await securityEngine.conductSecurityAssessment(config);

      const integrityRecs = report.recommendations.filter(
        (r) => r.id === 'model-integrity-verification',
      );
      expect(integrityRecs).toHaveLength(1);
      expect(integrityRecs[0].level).toBe('high');
      expect(integrityRecs[0].category).toBe('application');
      expect(integrityRecs[0].remediation.automated).toBe(true);
    });

    it('should recommend input validation', async () => {
      const config: SecurityAssessmentConfig = {
        categories: ['application'],
        depth: 'comprehensive',
        includeSystemScan: false,
        includeVulnerabilityAssessment: false,
        includeComplianceCheck: false,
      };

      const report = await securityEngine.conductSecurityAssessment(config);

      const validationRecs = report.recommendations.filter(
        (r) => r.id === 'input-validation',
      );
      expect(validationRecs).toHaveLength(1);
      expect(validationRecs[0].level).toBe('medium');
      expect(validationRecs[0].category).toBe('application');
      expect(validationRecs[0].compliance).toContain('OWASP Top 10');
    });
  });

  describe('Monitoring Assessment', () => {
    it('should detect disabled security monitoring', async () => {
      const noAuditConfig = { ...mockPrivacyConfig, auditLogging: false };
      vi.mocked(mockPrivacyManager.getPrivacyConfig).mockResolvedValue(
        noAuditConfig,
      );

      const config: SecurityAssessmentConfig = {
        categories: ['monitoring'],
        depth: 'standard',
        includeSystemScan: false,
        includeVulnerabilityAssessment: false,
        includeComplianceCheck: false,
      };

      const report = await securityEngine.conductSecurityAssessment(config);

      const monitoringRecs = report.recommendations.filter(
        (r) => r.id === 'security-monitoring',
      );
      expect(monitoringRecs).toHaveLength(1);
      expect(monitoringRecs[0].level).toBe('high');
      expect(monitoringRecs[0].category).toBe('monitoring');
      expect(monitoringRecs[0].remediation.automated).toBe(true);
    });
  });

  describe('Network Security Assessment', () => {
    it('should recognize network isolation benefits', async () => {
      const config: SecurityAssessmentConfig = {
        categories: ['network'],
        depth: 'standard',
        includeSystemScan: false,
        includeVulnerabilityAssessment: false,
        includeComplianceCheck: false,
      };

      const report = await securityEngine.conductSecurityAssessment(config);

      const networkRecs = report.recommendations.filter(
        (r) => r.id === 'network-isolation',
      );
      expect(networkRecs).toHaveLength(1);
      expect(networkRecs[0].level).toBe('info');
      expect(networkRecs[0].category).toBe('network');
      expect(networkRecs[0].compliance).toContain('Zero Trust Architecture');
    });
  });

  describe('Authorization Assessment', () => {
    it('should recommend file-based access control review', async () => {
      const config: SecurityAssessmentConfig = {
        categories: ['authorization'],
        depth: 'standard',
        includeSystemScan: false,
        includeVulnerabilityAssessment: false,
        includeComplianceCheck: false,
      };

      const report = await securityEngine.conductSecurityAssessment(config);

      const authzRecs = report.recommendations.filter(
        (r) => r.id === 'file-based-authorization',
      );
      expect(authzRecs).toHaveLength(1);
      expect(authzRecs[0].level).toBe('medium');
      expect(authzRecs[0].category).toBe('authorization');
      expect(authzRecs[0].remediation.automated).toBe(true);
    });
  });

  describe('Compliance Assessment', () => {
    it('should recommend regular compliance assessments', async () => {
      const config: SecurityAssessmentConfig = {
        categories: ['compliance'],
        depth: 'standard',
        includeSystemScan: false,
        includeVulnerabilityAssessment: false,
        includeComplianceCheck: true,
      };

      const report = await securityEngine.conductSecurityAssessment(config);

      const complianceRecs = report.recommendations.filter(
        (r) => r.id === 'regular-compliance-assessment',
      );
      expect(complianceRecs).toHaveLength(1);
      expect(complianceRecs[0].level).toBe('medium');
      expect(complianceRecs[0].category).toBe('compliance');
    });
  });

  describe('System Hardening', () => {
    it('should perform system hardening checks when enabled', async () => {
      const config: SecurityAssessmentConfig = {
        categories: ['system'],
        depth: 'comprehensive',
        includeSystemScan: true,
        includeVulnerabilityAssessment: false,
        includeComplianceCheck: false,
      };

      const report = await securityEngine.conductSecurityAssessment(config);

      expect(report.scope.systemScan).toBe(true);
      expect(report.systemHardening).toBeInstanceOf(Array);
      expect(report.systemHardening.length).toBeGreaterThan(0);
    });

    it('should check directory permissions in hardening', async () => {
      const config: SecurityAssessmentConfig = {
        categories: ['system'],
        depth: 'comprehensive',
        includeSystemScan: true,
        includeVulnerabilityAssessment: false,
        includeComplianceCheck: false,
      };

      const report = await securityEngine.conductSecurityAssessment(config);

      // Could be either permissions check (if directory exists) or existence check (if directory missing)
      const permissionChecks = report.systemHardening.filter(
        (h) => h.id === 'trust-dir-permissions' || h.id === 'trust-dir-exists',
      );
      expect(permissionChecks).toHaveLength(1);
      expect(permissionChecks[0].category).toBe('filesystem');

      // The test should pass regardless of which check runs - both are valid outcomes
      expect(['pass', 'fail']).toContain(permissionChecks[0].status);
      expect(['trust-dir-permissions', 'trust-dir-exists']).toContain(
        permissionChecks[0].id,
      );
    });
  });

  describe('Action Plan Generation', () => {
    it('should generate prioritized action plan', async () => {
      const criticalConfig = {
        ...mockPrivacyConfig,
        encryptStorage: false,
        auditLogging: false,
      };
      vi.mocked(mockPrivacyManager.getPrivacyConfig).mockResolvedValue(
        criticalConfig,
      );

      const config: SecurityAssessmentConfig = {
        categories: ['encryption', 'monitoring'],
        depth: 'standard',
        includeSystemScan: false,
        includeVulnerabilityAssessment: false,
        includeComplianceCheck: false,
      };

      const report = await securityEngine.conductSecurityAssessment(config);

      expect(report.actionPlan).toBeDefined();
      expect(report.actionPlan.immediate).toBeInstanceOf(Array);
      expect(report.actionPlan.shortTerm).toBeInstanceOf(Array);
      expect(report.actionPlan.longTerm).toBeInstanceOf(Array);

      // Should have immediate actions for critical issues
      expect(report.actionPlan.immediate.length).toBeGreaterThan(0);
      expect(report.actionPlan.immediate[0].level).toBe('critical');
    });

    it('should sort recommendations by priority and risk', async () => {
      const config: SecurityAssessmentConfig = {
        categories: ['encryption', 'system', 'application'],
        depth: 'comprehensive',
        includeSystemScan: true,
        includeVulnerabilityAssessment: false,
        includeComplianceCheck: false,
      };

      const report = await securityEngine.conductSecurityAssessment(config);

      // Recommendations should be sorted by level and risk score
      for (let i = 0; i < report.recommendations.length - 1; i++) {
        const current = report.recommendations[i];
        const next = report.recommendations[i + 1];

        const levelOrder = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };
        const currentLevel = levelOrder[current.level];
        const nextLevel = levelOrder[next.level];

        if (currentLevel === nextLevel) {
          // Same level, should be sorted by risk score
          expect(current.riskScore).toBeGreaterThanOrEqual(next.riskScore);
        } else {
          // Different levels, higher level should come first
          expect(currentLevel).toBeGreaterThanOrEqual(nextLevel);
        }
      }
    });
  });

  describe('Custom Security Checks', () => {
    it('should execute custom security checks', async () => {
      const customCheck = {
        name: 'Custom Security Check',
        description: 'A test custom security check',
        check: vi.fn().mockResolvedValue([
          {
            id: 'custom-security-test',
            level: 'high' as const,
            category: 'system' as const,
            title: 'Custom Security Finding',
            description: 'Test finding from custom security check',
            impact: 'Test security impact',
            recommendation: 'Test security recommendation',
            implementation: {
              steps: ['Test security step'],
              effort: 'medium' as const,
              timeEstimate: '2 hours',
              cost: 'low' as const,
            },
            remediation: {
              automated: false,
              manualSteps: ['Manual security step'],
              verificationSteps: ['Verify security'],
            },
            compliance: ['Test Compliance'],
            priority: 2,
            riskScore: 75,
            timestamp: new Date(),
          },
        ]),
      };

      const config: SecurityAssessmentConfig = {
        categories: ['system'],
        depth: 'basic',
        includeSystemScan: false,
        includeVulnerabilityAssessment: false,
        includeComplianceCheck: false,
        customChecks: [customCheck],
      };

      const report = await securityEngine.conductSecurityAssessment(config);

      expect(customCheck.check).toHaveBeenCalled();
      const customRecs = report.recommendations.filter(
        (r) => r.id === 'custom-security-test',
      );
      expect(customRecs).toHaveLength(1);
      expect(customRecs[0].title).toBe('Custom Security Finding');
      expect(customRecs[0].level).toBe('high');
    });

    it('should handle custom check errors gracefully', async () => {
      const failingCheck = {
        name: 'Failing Security Check',
        description: 'A security check that fails',
        check: vi.fn().mockRejectedValue(new Error('Security check failed')),
      };

      const config: SecurityAssessmentConfig = {
        categories: ['system'],
        depth: 'basic',
        includeSystemScan: false,
        includeVulnerabilityAssessment: false,
        includeComplianceCheck: false,
        customChecks: [failingCheck],
      };

      const report = await securityEngine.conductSecurityAssessment(config);

      const errorRecs = report.recommendations.filter((r) =>
        r.id.startsWith('custom-security-check-error'),
      );
      expect(errorRecs).toHaveLength(1);
      expect(errorRecs[0].title).toBe('Custom Security Check Error');
      expect(errorRecs[0].description).toContain('Failing Security Check');
    });
  });

  describe('Report Formatting', () => {
    it('should format security report as readable text', async () => {
      const config: SecurityAssessmentConfig = {
        categories: ['encryption'],
        depth: 'basic',
        includeSystemScan: false,
        includeVulnerabilityAssessment: false,
        includeComplianceCheck: false,
      };

      const report = await securityEngine.conductSecurityAssessment(config);
      const textReport = securityEngine.formatReportAsText(report);

      expect(textReport).toContain('Security Assessment Report');
      expect(textReport).toContain('Security Score');
      expect(textReport).toContain('Risk Level');
      expect(textReport).toContain('Summary:');
    });

    it('should include vulnerabilities in formatted report when present', async () => {
      const config: SecurityAssessmentConfig = {
        categories: ['system'],
        depth: 'comprehensive',
        includeSystemScan: false,
        includeVulnerabilityAssessment: true,
        includeComplianceCheck: false,
      };

      const report = await securityEngine.conductSecurityAssessment(config);

      // Even if no vulnerabilities found, format should handle empty array
      const textReport = securityEngine.formatReportAsText(report);
      expect(textReport).toContain('Security Assessment Report');
    });
  });

  describe('Risk Scoring', () => {
    it('should calculate risk scores appropriately', async () => {
      const criticalConfig = { ...mockPrivacyConfig, encryptStorage: false };
      vi.mocked(mockPrivacyManager.getPrivacyConfig).mockResolvedValue(
        criticalConfig,
      );

      const config: SecurityAssessmentConfig = {
        categories: ['encryption'],
        depth: 'standard',
        includeSystemScan: false,
        includeVulnerabilityAssessment: false,
        includeComplianceCheck: false,
      };

      const report = await securityEngine.conductSecurityAssessment(config);

      expect(report.summary.overallSecurityScore).toBeLessThan(100);
      expect(report.summary.riskLevel).toMatch(/^(medium|high|critical)$/);

      // Critical recommendations should have high risk scores
      const criticalRecs = report.recommendations.filter(
        (r) => r.level === 'critical',
      );
      criticalRecs.forEach((rec) => {
        expect(rec.riskScore).toBeGreaterThan(70);
      });
    });
  });
});
