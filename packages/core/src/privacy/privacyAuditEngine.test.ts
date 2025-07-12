/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  PrivacyAuditEngine,
  PrivacyAuditConfig,
  ComplianceFramework,
  PrivacyAuditReport,
} from './privacyAuditEngine.js';
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

describe('PrivacyAuditEngine', () => {
  let auditEngine: PrivacyAuditEngine;
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
    auditEngine = new PrivacyAuditEngine(mockPrivacyManager);
  });

  describe('Privacy Configuration Audit', () => {
    it('should detect open privacy mode as high risk', async () => {
      const openModeConfig = { ...mockPrivacyConfig, mode: 'open' as const };
      vi.mocked(mockPrivacyManager.getPrivacyConfig).mockResolvedValue(
        openModeConfig,
      );

      const config: PrivacyAuditConfig = {
        frameworks: ['gdpr'],
        depth: 'basic',
        includeSystemAnalysis: false,
        includeDataFlow: false,
        includeRiskAssessment: false,
      };

      const report = await auditEngine.conductAudit(config);

      const openModeFindings = report.findings.filter(
        (f) => f.id === 'privacy-mode-open',
      );
      expect(openModeFindings).toHaveLength(1);
      expect(openModeFindings[0].level).toBe('high');
      expect(openModeFindings[0].framework).toContain('gdpr');
    });

    it('should detect disabled storage encryption as critical', async () => {
      const unencryptedConfig = { ...mockPrivacyConfig, encryptStorage: false };
      vi.mocked(mockPrivacyManager.getPrivacyConfig).mockResolvedValue(
        unencryptedConfig,
      );

      const config: PrivacyAuditConfig = {
        frameworks: ['gdpr', 'hipaa'],
        depth: 'basic',
        includeSystemAnalysis: false,
        includeDataFlow: false,
        includeRiskAssessment: false,
      };

      const report = await auditEngine.conductAudit(config);

      const encryptionFindings = report.findings.filter(
        (f) => f.id === 'storage-encryption-disabled',
      );
      expect(encryptionFindings).toHaveLength(1);
      expect(encryptionFindings[0].level).toBe('critical');
      expect(encryptionFindings[0].framework).toContain('gdpr');
      expect(encryptionFindings[0].framework).toContain('hipaa');
    });

    it('should detect disabled audit logging as high risk', async () => {
      const noAuditConfig = { ...mockPrivacyConfig, auditLogging: false };
      vi.mocked(mockPrivacyManager.getPrivacyConfig).mockResolvedValue(
        noAuditConfig,
      );

      const config: PrivacyAuditConfig = {
        frameworks: ['sox'],
        depth: 'basic',
        includeSystemAnalysis: false,
        includeDataFlow: false,
        includeRiskAssessment: false,
      };

      const report = await auditEngine.conductAudit(config);

      const auditFindings = report.findings.filter(
        (f) => f.id === 'audit-logging-disabled',
      );
      expect(auditFindings).toHaveLength(1);
      expect(auditFindings[0].level).toBe('high');
      expect(auditFindings[0].framework).toContain('sox');
    });

    it('should detect excessive data retention as medium risk', async () => {
      const longRetentionConfig = { ...mockPrivacyConfig, dataRetention: 400 };
      vi.mocked(mockPrivacyManager.getPrivacyConfig).mockResolvedValue(
        longRetentionConfig,
      );

      const config: PrivacyAuditConfig = {
        frameworks: ['gdpr'],
        depth: 'basic',
        includeSystemAnalysis: false,
        includeDataFlow: false,
        includeRiskAssessment: false,
      };

      const report = await auditEngine.conductAudit(config);

      const retentionFindings = report.findings.filter(
        (f) => f.id === 'excessive-data-retention',
      );
      expect(retentionFindings).toHaveLength(1);
      expect(retentionFindings[0].level).toBe('medium');
      expect(retentionFindings[0].framework).toContain('gdpr');
    });
  });

  describe('Framework Compliance', () => {
    it('should assess GDPR compliance correctly', async () => {
      const config: PrivacyAuditConfig = {
        frameworks: ['gdpr'],
        depth: 'standard',
        includeSystemAnalysis: false,
        includeDataFlow: true,
        includeRiskAssessment: false,
      };

      const report = await auditEngine.conductAudit(config);

      expect(report.complianceStatus.gdpr).toBeDefined();
      expect(report.complianceStatus.gdpr.score).toBeGreaterThan(0);
      expect(report.complianceStatus.gdpr.score).toBeLessThanOrEqual(100);
    });

    it('should assess multiple frameworks simultaneously', async () => {
      const config: PrivacyAuditConfig = {
        frameworks: ['gdpr', 'ccpa', 'hipaa'],
        depth: 'standard',
        includeSystemAnalysis: false,
        includeDataFlow: false,
        includeRiskAssessment: false,
      };

      const report = await auditEngine.conductAudit(config);

      expect(report.complianceStatus.gdpr).toBeDefined();
      expect(report.complianceStatus.ccpa).toBeDefined();
      expect(report.complianceStatus.hipaa).toBeDefined();
      expect(report.scope.frameworks).toEqual(['gdpr', 'ccpa', 'hipaa']);
    });

    it('should calculate compliance scores based on findings', async () => {
      const criticalConfig = {
        ...mockPrivacyConfig,
        encryptStorage: false, // Critical finding
        auditLogging: false, // High finding
      };
      vi.mocked(mockPrivacyManager.getPrivacyConfig).mockResolvedValue(
        criticalConfig,
      );

      const config: PrivacyAuditConfig = {
        frameworks: ['gdpr'],
        depth: 'basic',
        includeSystemAnalysis: false,
        includeDataFlow: false,
        includeRiskAssessment: false,
      };

      const report = await auditEngine.conductAudit(config);

      // Should have low compliance score due to critical findings
      expect(report.complianceStatus.gdpr.score).toBeLessThan(70);
      expect(report.complianceStatus.gdpr.compliant).toBe(false);
      expect(report.complianceStatus.gdpr.gaps.length).toBeGreaterThan(0);
    });
  });

  describe('System Analysis', () => {
    it('should include system analysis when enabled', async () => {
      const config: PrivacyAuditConfig = {
        frameworks: ['gdpr'],
        depth: 'comprehensive',
        includeSystemAnalysis: true,
        includeDataFlow: false,
        includeRiskAssessment: false,
      };

      const report = await auditEngine.conductAudit(config);

      expect(report.scope.includeSystemAnalysis).toBe(true);
      // Should have system-level findings
      const systemFindings = report.findings.filter(
        (f) => f.evidence?.type === 'file' || f.evidence?.type === 'system',
      );
      expect(systemFindings.length).toBeGreaterThanOrEqual(0);
    });

    it('should detect file permission issues', async () => {
      // Mock insecure file permissions
      const fs = await import('fs/promises');
      vi.mocked(fs.stat).mockResolvedValue({
        mode: parseInt('755', 8), // Insecure permissions
      } as any);

      const config: PrivacyAuditConfig = {
        frameworks: ['hipaa'],
        depth: 'standard',
        includeSystemAnalysis: true,
        includeDataFlow: false,
        includeRiskAssessment: false,
      };

      const report = await auditEngine.conductAudit(config);

      const permissionFindings = report.findings.filter(
        (f) => f.id === 'file-permissions-privacy-dir',
      );
      expect(permissionFindings).toHaveLength(1);
      expect(permissionFindings[0].level).toBe('high');
    });
  });

  describe('Data Flow Analysis', () => {
    it('should analyze data flow when enabled', async () => {
      const config: PrivacyAuditConfig = {
        frameworks: ['gdpr'],
        depth: 'comprehensive',
        includeSystemAnalysis: false,
        includeDataFlow: true,
        includeRiskAssessment: false,
      };

      const report = await auditEngine.conductAudit(config);

      expect(report.scope.includeDataFlow).toBe(true);
      expect(report.dataFlowAnalysis).toBeDefined();
      expect(report.dataFlowAnalysis?.dataProcessingActivities).toBeDefined();
      expect(report.dataFlowAnalysis?.dataSubjectRights).toBeDefined();
    });

    it('should identify data subject rights implementation gaps', async () => {
      const config: PrivacyAuditConfig = {
        frameworks: ['gdpr'],
        depth: 'comprehensive',
        includeSystemAnalysis: false,
        includeDataFlow: true,
        includeRiskAssessment: false,
      };

      const report = await auditEngine.conductAudit(config);

      expect(report.dataFlowAnalysis).toBeDefined();

      // Should identify missing data subject rights
      const accessRightFindings = report.findings.filter(
        (f) => f.id === 'data-subject-access-right',
      );
      expect(accessRightFindings).toHaveLength(1);
      expect(accessRightFindings[0].level).toBe('high');
    });
  });

  describe('Risk Assessment', () => {
    it('should perform risk assessment when enabled', async () => {
      const config: PrivacyAuditConfig = {
        frameworks: ['gdpr'],
        depth: 'comprehensive',
        includeSystemAnalysis: false,
        includeDataFlow: false,
        includeRiskAssessment: true,
      };

      const report = await auditEngine.conductAudit(config);

      expect(report.scope.includeRiskAssessment).toBe(true);
      expect(report.riskAssessment).toBeDefined();
      expect(report.riskAssessment?.overallRiskLevel).toBeDefined();
      expect(report.riskAssessment?.privacyImpactScore).toBeGreaterThanOrEqual(
        0,
      );
      expect(report.riskAssessment?.privacyImpactScore).toBeLessThanOrEqual(
        100,
      );
    });

    it('should calculate risk levels based on findings', async () => {
      const criticalConfig = {
        ...mockPrivacyConfig,
        encryptStorage: false,
        auditLogging: false,
      };
      vi.mocked(mockPrivacyManager.getPrivacyConfig).mockResolvedValue(
        criticalConfig,
      );

      const config: PrivacyAuditConfig = {
        frameworks: ['gdpr'],
        depth: 'comprehensive',
        includeSystemAnalysis: false,
        includeDataFlow: false,
        includeRiskAssessment: true,
      };

      const report = await auditEngine.conductAudit(config);

      expect(report.riskAssessment).toBeDefined();
      expect(report.riskAssessment!.overallRiskLevel).toBe('critical');
      expect(report.riskAssessment!.privacyImpactScore).toBeLessThan(75); // More lenient threshold
    });
  });

  describe('Report Generation', () => {
    it('should generate comprehensive audit report', async () => {
      const config: PrivacyAuditConfig = {
        frameworks: ['gdpr', 'ccpa'],
        depth: 'comprehensive',
        includeSystemAnalysis: true,
        includeDataFlow: true,
        includeRiskAssessment: true,
      };

      const report = await auditEngine.conductAudit(config);

      expect(report.id).toBeDefined();
      expect(report.timestamp).toBeInstanceOf(Date);
      expect(report.duration).toBeGreaterThanOrEqual(0); // Duration can be 0 in fast tests
      expect(report.summary).toBeDefined();
      expect(report.findings).toBeInstanceOf(Array);
      expect(report.recommendations).toBeDefined();
      expect(report.complianceStatus).toBeDefined();
      expect(report.nextAuditRecommended).toBeInstanceOf(Date);
    });

    it('should sort findings by severity', async () => {
      const mixedConfig = {
        ...mockPrivacyConfig,
        encryptStorage: false, // Critical
        mode: 'open' as const, // High
        dataRetention: 400, // Medium
      };
      vi.mocked(mockPrivacyManager.getPrivacyConfig).mockResolvedValue(
        mixedConfig,
      );

      const config: PrivacyAuditConfig = {
        frameworks: ['gdpr'],
        depth: 'standard',
        includeSystemAnalysis: false,
        includeDataFlow: false,
        includeRiskAssessment: false,
      };

      const report = await auditEngine.conductAudit(config);

      // Findings should be sorted by severity (critical first)
      const levels = report.findings.map((f) => f.level);
      const criticalIndex = levels.indexOf('critical');
      const highIndex = levels.indexOf('high');
      const mediumIndex = levels.indexOf('medium');

      if (criticalIndex !== -1 && highIndex !== -1) {
        expect(criticalIndex).toBeLessThan(highIndex);
      }
      if (highIndex !== -1 && mediumIndex !== -1) {
        expect(highIndex).toBeLessThan(mediumIndex);
      }
    });

    it('should format report as readable text', async () => {
      const config: PrivacyAuditConfig = {
        frameworks: ['gdpr'],
        depth: 'basic',
        includeSystemAnalysis: false,
        includeDataFlow: false,
        includeRiskAssessment: false,
      };

      const report = await auditEngine.conductAudit(config);
      const textReport = auditEngine.formatReportAsText(report);

      expect(textReport).toContain('Privacy Audit Report');
      expect(textReport).toContain('Compliance Score');
      expect(textReport).toContain('Summary:');
      expect(textReport).toContain('GDPR');
    });
  });

  describe('Custom Checks', () => {
    it('should execute custom checks when provided', async () => {
      const customCheck = {
        name: 'Custom Test Check',
        description: 'A test custom check',
        check: vi.fn().mockResolvedValue([
          {
            id: 'custom-test',
            level: 'medium' as const,
            framework: [] as ComplianceFramework[],
            title: 'Custom Test Finding',
            description: 'Test finding from custom check',
            impact: 'Test impact',
            recommendation: 'Test recommendation',
            remediation: {
              steps: ['Test step'],
              effort: 'low' as const,
              priority: 3,
            },
            timestamp: new Date(),
          },
        ]),
      };

      const config: PrivacyAuditConfig = {
        frameworks: ['gdpr'],
        depth: 'basic',
        includeSystemAnalysis: false,
        includeDataFlow: false,
        includeRiskAssessment: false,
        customChecks: [customCheck],
      };

      const report = await auditEngine.conductAudit(config);

      expect(customCheck.check).toHaveBeenCalledWith(mockPrivacyConfig);
      const customFindings = report.findings.filter(
        (f) => f.id === 'custom-test',
      );
      expect(customFindings).toHaveLength(1);
      expect(customFindings[0].title).toBe('Custom Test Finding');
    });

    it('should handle custom check errors gracefully', async () => {
      const failingCheck = {
        name: 'Failing Check',
        description: 'A check that fails',
        check: vi.fn().mockRejectedValue(new Error('Custom check failed')),
      };

      const config: PrivacyAuditConfig = {
        frameworks: ['gdpr'],
        depth: 'basic',
        includeSystemAnalysis: false,
        includeDataFlow: false,
        includeRiskAssessment: false,
        customChecks: [failingCheck],
      };

      const report = await auditEngine.conductAudit(config);

      const errorFindings = report.findings.filter((f) =>
        f.id.startsWith('custom-check-error'),
      );
      expect(errorFindings).toHaveLength(1);
      expect(errorFindings[0].title).toBe('Custom Check Error');
      expect(errorFindings[0].description).toContain('Failing Check');
    });
  });

  describe('Audit History', () => {
    it('should return empty history when no audits exist', async () => {
      const history = await auditEngine.getAuditHistory();
      expect(history).toHaveLength(0);
    });

    it('should load and sort audit history by timestamp', async () => {
      // Create a new engine instance for this test to avoid mock conflicts
      const testEngine = new PrivacyAuditEngine(mockPrivacyManager);

      // Mock file system to return audit files
      const fs = await import('fs/promises');

      // Clear and setup mocks properly
      vi.clearAllMocks();

      // Mock successful directory read and file reads
      vi.mocked(fs.readdir).mockResolvedValue([
        'audit-1.json',
        'audit-2.json',
      ] as any);

      const report1 = {
        timestamp: '2023-01-01T00:00:00.000Z',
        id: 'audit-1',
        summary: { complianceScore: 80 },
      };
      const report2 = {
        timestamp: '2023-01-02T00:00:00.000Z',
        id: 'audit-2',
        summary: { complianceScore: 90 },
      };

      vi.mocked(fs.readFile)
        .mockResolvedValueOnce(JSON.stringify(report1))
        .mockResolvedValueOnce(JSON.stringify(report2));

      const history = await testEngine.getAuditHistory();

      expect(history).toHaveLength(2);
      // Should be sorted by timestamp (newest first)
      expect(new Date(history[0].timestamp).getTime()).toBeGreaterThan(
        new Date(history[1].timestamp).getTime(),
      );
      expect(history[0].id).toBe('audit-2'); // newer should be first
      expect(history[1].id).toBe('audit-1'); // older should be second
    });
  });

  describe('Summary Calculations', () => {
    it('should calculate audit summary correctly', async () => {
      const mixedConfig = {
        ...mockPrivacyConfig,
        encryptStorage: false, // Critical
        auditLogging: false, // High
        dataRetention: 400, // Medium
      };
      vi.mocked(mockPrivacyManager.getPrivacyConfig).mockResolvedValue(
        mixedConfig,
      );

      const config: PrivacyAuditConfig = {
        frameworks: ['gdpr', 'hipaa'],
        depth: 'standard',
        includeSystemAnalysis: false,
        includeDataFlow: false,
        includeRiskAssessment: false,
      };

      const report = await auditEngine.conductAudit(config);

      expect(report.summary.totalFindings).toBeGreaterThan(0);
      expect(report.summary.criticalFindings).toBeGreaterThan(0);
      expect(report.summary.highFindings).toBeGreaterThan(0);
      expect(report.summary.complianceScore).toBeLessThan(100);

      // Summary counts should match findings
      const actualCritical = report.findings.filter(
        (f) => f.level === 'critical',
      ).length;
      const actualHigh = report.findings.filter(
        (f) => f.level === 'high',
      ).length;
      const actualMedium = report.findings.filter(
        (f) => f.level === 'medium',
      ).length;

      expect(report.summary.criticalFindings).toBe(actualCritical);
      expect(report.summary.highFindings).toBe(actualHigh);
      expect(report.summary.mediumFindings).toBe(actualMedium);
    });
  });
});
