/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

export interface MetricPoint {
  timestamp: number;
  value: number;
  metadata?: Record<string, unknown>;
}

export interface MetricSeries {
  name: string;
  unit: string;
  type: 'gauge' | 'counter' | 'histogram';
  points: MetricPoint[];
  labels?: Record<string, string>;
}

export interface DashboardWidget {
  id: string;
  title: string;
  type: 'chart' | 'gauge' | 'table' | 'text' | 'alert';
  position: { x: number; y: number; width: number; height: number };
  config: Record<string, unknown>;
  dataSource: string;
  refreshInterval: number; // in milliseconds
}

export interface Alert {
  id: string;
  title: string;
  message: string;
  severity: 'critical' | 'warning' | 'info';
  timestamp: number;
  source: string;
  acknowledged: boolean;
  metadata?: Record<string, unknown>;
}

export interface SystemHealth {
  overall: 'healthy' | 'warning' | 'critical';
  components: {
    cpu: 'healthy' | 'warning' | 'critical';
    memory: 'healthy' | 'warning' | 'critical';
    disk: 'healthy' | 'warning' | 'critical';
    network: 'healthy' | 'warning' | 'critical';
    security: 'healthy' | 'warning' | 'critical';
  };
  uptime: number;
  lastUpdate: number;
}

export interface SecurityStatus {
  vulnerabilities: {
    critical: number;
    high: number;
    moderate: number;
    low: number;
  };
  lastScan: number;
  compliance: Array<{
    framework: string;
    score: number;
    checks: { passed: number; failed: number; total: number };
  }>;
  threats: {
    detected: number;
    blocked: number;
    active: number;
  };
}

export interface PerformanceMetrics {
  cpu: {
    usage: number;
    load: number[];
    cores: number;
  };
  memory: {
    total: number;
    used: number;
    free: number;
    cached: number;
  };
  disk: {
    total: number;
    used: number;
    free: number;
    iops: number;
  };
  network: {
    bytesIn: number;
    bytesOut: number;
    packetsIn: number;
    packetsOut: number;
    errors: number;
  };
}

export class RealTimeMonitor extends EventEmitter {
  private metrics: Map<string, MetricSeries> = new Map();
  private widgets: Map<string, DashboardWidget> = new Map();
  private alerts: Map<string, Alert> = new Map();
  private collectors: Map<string, () => Promise<void>> = new Map();
  private intervals: Map<string, NodeJS.Timeout> = new Map();
  private isRunning = false;

  constructor(private readonly configPath?: string) {
    super();
    this.setupDefaultCollectors();
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    console.log('🖥️  Starting real-time monitoring dashboard');
    this.isRunning = true;

    // Start all collectors
    for (const [name, collector] of Array.from(this.collectors.entries())) {
      const interval = setInterval(async () => {
        try {
          await collector();
        } catch (error) {
          this.emit('error', { collector: name, error });
        }
      }, 5000); // 5 second intervals

      this.intervals.set(name, interval);
    }

    // Load saved configuration
    await this.loadConfiguration();

    this.emit('started');
  }

  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    console.log('⏹️  Stopping real-time monitoring dashboard');
    this.isRunning = false;

    // Clear all intervals
    for (const interval of Array.from(this.intervals.values())) {
      clearInterval(interval);
    }
    this.intervals.clear();

    // Save configuration
    await this.saveConfiguration();

    this.emit('stopped');
  }

  addWidget(widget: DashboardWidget): void {
    this.widgets.set(widget.id, widget);
    this.emit('widget-added', widget);
  }

  removeWidget(widgetId: string): void {
    const widget = this.widgets.get(widgetId);
    if (widget) {
      this.widgets.delete(widgetId);
      this.emit('widget-removed', widget);
    }
  }

  updateWidget(widgetId: string, updates: Partial<DashboardWidget>): void {
    const widget = this.widgets.get(widgetId);
    if (widget) {
      const updated = { ...widget, ...updates };
      this.widgets.set(widgetId, updated);
      this.emit('widget-updated', updated);
    }
  }

  getWidgets(): DashboardWidget[] {
    return Array.from(this.widgets.values());
  }

  addMetric(series: MetricSeries): void {
    this.metrics.set(series.name, series);
    this.emit('metric-added', series);
  }

  updateMetric(name: string, point: MetricPoint): void {
    const series = this.metrics.get(name);
    if (series) {
      series.points.push(point);

      // Keep only last 1000 points for performance
      if (series.points.length > 1000) {
        series.points = series.points.slice(-1000);
      }

      this.emit('metric-updated', { name, point, series });
    }
  }

  getMetrics(): MetricSeries[] {
    return Array.from(this.metrics.values());
  }

  getMetric(name: string): MetricSeries | undefined {
    return this.metrics.get(name);
  }

  addAlert(alert: Alert): void {
    this.alerts.set(alert.id, alert);
    this.emit('alert-added', alert);
  }

  acknowledgeAlert(alertId: string): void {
    const alert = this.alerts.get(alertId);
    if (alert) {
      alert.acknowledged = true;
      this.emit('alert-acknowledged', alert);
    }
  }

  clearAlert(alertId: string): void {
    const alert = this.alerts.get(alertId);
    if (alert) {
      this.alerts.delete(alertId);
      this.emit('alert-cleared', alert);
    }
  }

  getAlerts(): Alert[] {
    return Array.from(this.alerts.values());
  }

  getActiveAlerts(): Alert[] {
    return this.getAlerts().filter((alert) => !alert.acknowledged);
  }

  async getSystemHealth(): Promise<SystemHealth> {
    const now = Date.now();
    const uptime = os.uptime();

    // Get system metrics
    const cpuUsage = await this.getCpuUsage();
    const memoryInfo = await this.getMemoryInfo();
    const diskInfo = await this.getDiskInfo();
    const securityInfo = await this.getSecurityInfo();

    // Determine component health
    const components = {
      cpu: cpuUsage > 90 ? 'critical' : cpuUsage > 75 ? 'warning' : 'healthy',
      memory:
        memoryInfo.usagePercent > 90
          ? 'critical'
          : memoryInfo.usagePercent > 80
            ? 'warning'
            : 'healthy',
      disk:
        diskInfo.usagePercent > 95
          ? 'critical'
          : diskInfo.usagePercent > 85
            ? 'warning'
            : 'healthy',
      network: 'healthy', // Simplified for now
      security:
        securityInfo.vulnerabilities.critical > 0
          ? 'critical'
          : securityInfo.vulnerabilities.high > 0
            ? 'warning'
            : 'healthy',
    } as const;

    // Determine overall health
    const hasAnyCritical = Object.values(components).includes('critical');
    const hasAnyWarning = Object.values(components).includes('warning');
    const overall = hasAnyCritical
      ? 'critical'
      : hasAnyWarning
        ? 'warning'
        : 'healthy';

    return {
      overall,
      components,
      uptime,
      lastUpdate: now,
    };
  }

  async getPerformanceMetrics(): Promise<PerformanceMetrics> {
    const cpuInfo = os.cpus();
    const memInfo = process.memoryUsage();
    const loadAvg = os.loadavg();

    // Get system memory info
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    return {
      cpu: {
        usage: await this.getCpuUsage(),
        load: loadAvg,
        cores: cpuInfo.length,
      },
      memory: {
        total: totalMem,
        used: usedMem,
        free: freeMem,
        cached: 0, // Would need platform-specific implementation
      },
      disk: await this.getDiskInfo(),
      network: await this.getNetworkInfo(),
    };
  }

  private setupDefaultCollectors(): void {
    // System performance collector
    this.collectors.set('system-performance', async () => {
      const metrics = await this.getPerformanceMetrics();
      const now = Date.now();

      this.updateMetric('cpu.usage', {
        timestamp: now,
        value: metrics.cpu.usage,
      });
      this.updateMetric('memory.usage', {
        timestamp: now,
        value: (metrics.memory.used / metrics.memory.total) * 100,
      });
      this.updateMetric('disk.usage', {
        timestamp: now,
        value: (metrics.disk.used / metrics.disk.total) * 100,
      });
    });

    // Health checker
    this.collectors.set('health-check', async () => {
      const health = await this.getSystemHealth();

      // Generate alerts for critical issues
      if (health.overall === 'critical') {
        const criticalComponents = Object.entries(health.components)
          .filter(([, status]) => status === 'critical')
          .map(([component]) => component);

        this.addAlert({
          id: `health-critical-${Date.now()}`,
          title: 'System Health Critical',
          message: `Critical issues detected in: ${criticalComponents.join(', ')}`,
          severity: 'critical',
          timestamp: Date.now(),
          source: 'health-monitor',
          acknowledged: false,
        });
      }
    });

    // Security monitoring collector
    this.collectors.set('security-monitor', async () => {
      const securityInfo = await this.getSecurityInfo();
      const now = Date.now();

      this.updateMetric('security.vulnerabilities.critical', {
        timestamp: now,
        value: securityInfo.vulnerabilities.critical,
      });

      this.updateMetric('security.vulnerabilities.high', {
        timestamp: now,
        value: securityInfo.vulnerabilities.high,
      });

      // Alert on new critical vulnerabilities
      if (securityInfo.vulnerabilities.critical > 0) {
        this.addAlert({
          id: `security-critical-${Date.now()}`,
          title: 'Critical Security Vulnerabilities',
          message: `${securityInfo.vulnerabilities.critical} critical vulnerabilities detected`,
          severity: 'critical',
          timestamp: Date.now(),
          source: 'security-scanner',
          acknowledged: false,
        });
      }
    });
  }

  private async getCpuUsage(): Promise<number> {
    // Simple CPU usage estimation using load average
    const loadAvg = os.loadavg()[0];
    const cpuCount = os.cpus().length;
    return Math.min(100, (loadAvg / cpuCount) * 100);
  }

  private async getMemoryInfo(): Promise<{
    usagePercent: number;
    used: number;
    total: number;
  }> {
    const total = os.totalmem();
    const free = os.freemem();
    const used = total - free;
    const usagePercent = (used / total) * 100;

    return { usagePercent, used, total };
  }

  private async getDiskInfo(): Promise<{
    usagePercent: number;
    used: number;
    total: number;
    free: number;
    iops: number;
  }> {
    // This is a simplified implementation
    // In a real implementation, you'd use platform-specific APIs
    const total = 100 * 1024 * 1024 * 1024; // 100GB
    const used = 50 * 1024 * 1024 * 1024; // 50GB
    const free = total - used;

    return {
      usagePercent: 50, // Placeholder
      used,
      total,
      free,
      iops: 0, // Would need OS-specific implementation
    };
  }

  private async getNetworkInfo(): Promise<{
    bytesIn: number;
    bytesOut: number;
    packetsIn: number;
    packetsOut: number;
    errors: number;
  }> {
    // This is a placeholder implementation
    // In a real implementation, you'd use platform-specific APIs
    return {
      bytesIn: 0,
      bytesOut: 0,
      packetsIn: 0,
      packetsOut: 0,
      errors: 0,
    };
  }

  private async getSecurityInfo(): Promise<SecurityStatus> {
    // This would integrate with the security scanner
    // For now, return placeholder data
    return {
      vulnerabilities: {
        critical: 0,
        high: 0,
        moderate: 0,
        low: 0,
      },
      lastScan: Date.now() - 3600000, // 1 hour ago
      compliance: [
        {
          framework: 'SOC 2',
          score: 95,
          checks: { passed: 38, failed: 2, total: 40 },
        },
        {
          framework: 'ISO 27001',
          score: 88,
          checks: { passed: 44, failed: 6, total: 50 },
        },
      ],
      threats: {
        detected: 0,
        blocked: 0,
        active: 0,
      },
    };
  }

  private async loadConfiguration(): Promise<void> {
    if (!this.configPath) {
      return;
    }

    try {
      const configFile = path.join(this.configPath, 'dashboard-config.json');
      const content = await fs.readFile(configFile, 'utf-8');
      const config = JSON.parse(content);

      // Load widgets
      if (config.widgets) {
        for (const widget of config.widgets) {
          this.widgets.set(widget.id, widget);
        }
      }

      // Load metric configurations
      if (config.metrics) {
        for (const metric of config.metrics) {
          this.metrics.set(metric.name, metric);
        }
      }

      console.log('📊 Dashboard configuration loaded');
    } catch (error) {
      console.log('📊 Using default dashboard configuration');
    }
  }

  private async saveConfiguration(): Promise<void> {
    if (!this.configPath) {
      return;
    }

    try {
      await fs.mkdir(this.configPath, { recursive: true });

      const config = {
        widgets: Array.from(this.widgets.values()),
        metrics: Array.from(this.metrics.values()).map((m) => ({
          name: m.name,
          unit: m.unit,
          type: m.type,
          labels: m.labels,
          // Don't save points to keep file size manageable
        })),
        lastSaved: Date.now(),
      };

      const configFile = path.join(this.configPath, 'dashboard-config.json');
      await fs.writeFile(configFile, JSON.stringify(config, null, 2));

      console.log('📊 Dashboard configuration saved');
    } catch (error) {
      console.error('Failed to save dashboard configuration:', error);
    }
  }
}

export class DashboardWidgetFactory {
  static createSystemOverview(): DashboardWidget {
    return {
      id: 'system-overview',
      title: 'System Overview',
      type: 'gauge',
      position: { x: 0, y: 0, width: 6, height: 4 },
      config: {
        metrics: ['cpu.usage', 'memory.usage', 'disk.usage'],
        thresholds: { warning: 75, critical: 90 },
      },
      dataSource: 'system-performance',
      refreshInterval: 5000,
    };
  }

  static createSecurityDashboard(): DashboardWidget {
    return {
      id: 'security-dashboard',
      title: 'Security Status',
      type: 'chart',
      position: { x: 6, y: 0, width: 6, height: 4 },
      config: {
        chartType: 'bar',
        metrics: [
          'security.vulnerabilities.critical',
          'security.vulnerabilities.high',
          'security.vulnerabilities.moderate',
          'security.vulnerabilities.low',
        ],
      },
      dataSource: 'security-monitor',
      refreshInterval: 30000,
    };
  }

  static createAlertTable(): DashboardWidget {
    return {
      id: 'alert-table',
      title: 'Active Alerts',
      type: 'table',
      position: { x: 0, y: 4, width: 12, height: 4 },
      config: {
        columns: ['severity', 'title', 'source', 'timestamp'],
        sortBy: 'timestamp',
        sortOrder: 'desc',
        maxRows: 10,
      },
      dataSource: 'alerts',
      refreshInterval: 1000,
    };
  }

  static createPerformanceChart(): DashboardWidget {
    return {
      id: 'performance-chart',
      title: 'Performance Metrics',
      type: 'chart',
      position: { x: 0, y: 8, width: 12, height: 6 },
      config: {
        chartType: 'line',
        metrics: ['cpu.usage', 'memory.usage', 'disk.usage'],
        timeRange: '1h',
        yAxisMax: 100,
      },
      dataSource: 'system-performance',
      refreshInterval: 5000,
    };
  }
}
