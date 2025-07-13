/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  RealTimeMonitor,
  DashboardWidgetFactory,
  DashboardWidget,
  // SystemHealth,
  // PerformanceMetrics,
  Alert,
} from '@trust-cli/trust-cli-core';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface MonitoringCommandArgs {
  action:
    | 'start'
    | 'stop'
    | 'status'
    | 'dashboard'
    | 'alerts'
    | 'metrics'
    | 'widget'
    | 'health';
  subaction?: string;
  widgetId?: string;
  widgetType?: 'overview' | 'security' | 'alerts' | 'performance';
  interval?: number;
  format?: 'json' | 'table' | 'text';
  output?: string;
  watch?: boolean;
  filter?: string;
  duration?: string;
  verbose?: boolean;
}

export class MonitoringCommandHandler {
  private monitor: RealTimeMonitor;
  private configPath: string;

  constructor() {
    this.configPath = path.join(process.cwd(), '.trustcli', 'monitoring');
    this.monitor = new RealTimeMonitor(this.configPath);
    this.setupEventHandlers();
  }

  async handleCommand(args: MonitoringCommandArgs): Promise<void> {
    switch (args.action) {
      case 'start':
        await this.handleStartCommand(args);
        break;
      case 'stop':
        await this.handleStopCommand(args);
        break;
      case 'status':
        await this.handleStatusCommand(args);
        break;
      case 'dashboard':
        await this.handleDashboardCommand(args);
        break;
      case 'alerts':
        await this.handleAlertsCommand(args);
        break;
      case 'metrics':
        await this.handleMetricsCommand(args);
        break;
      case 'widget':
        await this.handleWidgetCommand(args);
        break;
      case 'health':
        await this.handleHealthCommand(args);
        break;
      default:
        throw new Error(`Unknown monitoring action: ${args.action}`);
    }
  }

  private async handleStartCommand(args: MonitoringCommandArgs): Promise<void> {
    console.log('🚀 Starting Trust CLI Real-Time Monitoring');
    console.log('═══════════════════════════════════════════════════════════');

    try {
      await this.monitor.start();

      // Setup default widgets if none exist
      const widgets = this.monitor.getWidgets();
      if (widgets.length === 0) {
        console.log('📊 Setting up default dashboard widgets...');
        this.monitor.addWidget(DashboardWidgetFactory.createSystemOverview());
        this.monitor.addWidget(
          DashboardWidgetFactory.createSecurityDashboard(),
        );
        this.monitor.addWidget(DashboardWidgetFactory.createAlertTable());
        this.monitor.addWidget(DashboardWidgetFactory.createPerformanceChart());
      }

      console.log('✅ Monitoring started successfully');
      console.log('📊 Dashboard widgets configured');
      console.log(`🗂️  Config saved to: ${this.configPath}`);

      if (args.watch) {
        console.log('\n👀 Watching system metrics (Press Ctrl+C to stop)...');
        console.log(
          '═══════════════════════════════════════════════════════════',
        );
        await this.startWatchMode();
      } else {
        console.log(
          '\n💡 Use `trust monitoring dashboard` to view real-time data',
        );
        console.log('💡 Use `trust monitoring stop` to stop monitoring');
      }
    } catch (error) {
      console.error(
        `❌ Failed to start monitoring: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  private async handleStopCommand(_args: MonitoringCommandArgs): Promise<void> {
    console.log('⏹️  Stopping Trust CLI Real-Time Monitoring');
    console.log('═══════════════════════════════════════════════════════════');

    try {
      await this.monitor.stop();
      console.log('✅ Monitoring stopped successfully');
      console.log('💾 Configuration and data saved');
    } catch (error) {
      console.error(
        `❌ Failed to stop monitoring: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  private async handleStatusCommand(
    args: MonitoringCommandArgs,
  ): Promise<void> {
    console.log('🖥️  Trust CLI Monitoring Status');
    console.log('═══════════════════════════════════════════════════════════');

    try {
      const health = await this.monitor.getSystemHealth();
      const metrics = await this.monitor.getPerformanceMetrics();
      const alerts = this.monitor.getActiveAlerts();
      const widgets = this.monitor.getWidgets();

      // System Health
      console.log('\n🏥 System Health:');
      const healthIcon = this.getHealthIcon(health.overall);
      console.log(`   Overall: ${healthIcon} ${health.overall.toUpperCase()}`);
      console.log(`   Uptime: ${this.formatUptime(health.uptime)}`);
      console.log(
        `   Last Update: ${new Date(health.lastUpdate).toLocaleString()}`,
      );

      console.log('\n📊 Component Status:');
      Object.entries(health.components).forEach(([component, status]) => {
        const icon = this.getHealthIcon(status);
        console.log(
          `   ${component.toUpperCase().padEnd(8)}: ${icon} ${status}`,
        );
      });

      // Performance Metrics
      console.log('\n⚡ Performance Metrics:');
      console.log(`   CPU Usage: ${metrics.cpu.usage.toFixed(1)}%`);
      console.log(
        `   Memory Usage: ${((metrics.memory.used / metrics.memory.total) * 100).toFixed(1)}%`,
      );
      console.log(
        `   Disk Usage: ${((metrics.disk.used / metrics.disk.total) * 100).toFixed(1)}%`,
      );
      console.log(
        `   Load Average: [${metrics.cpu.load.map((l) => l.toFixed(2)).join(', ')}]`,
      );

      // Active Alerts
      console.log(`\n🚨 Active Alerts: ${alerts.length}`);
      if (alerts.length > 0) {
        const criticalCount = alerts.filter(
          (a) => a.severity === 'critical',
        ).length;
        const warningCount = alerts.filter(
          (a) => a.severity === 'warning',
        ).length;
        const infoCount = alerts.filter((a) => a.severity === 'info').length;

        if (criticalCount > 0) console.log(`   🔴 Critical: ${criticalCount}`);
        if (warningCount > 0) console.log(`   🟡 Warning: ${warningCount}`);
        if (infoCount > 0) console.log(`   ℹ️  Info: ${infoCount}`);
      } else {
        console.log('   ✅ No active alerts');
      }

      // Dashboard Info
      console.log(`\n📊 Dashboard: ${widgets.length} widgets configured`);
      console.log(`   Config Path: ${this.configPath}`);

      if (args.verbose) {
        console.log('\n📈 Widget Details:');
        widgets.forEach((widget) => {
          console.log(
            `   • ${widget.title} (${widget.type}) - ${widget.refreshInterval}ms refresh`,
          );
        });
      }
    } catch (error) {
      console.error(
        `❌ Failed to get status: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  private async handleDashboardCommand(
    args: MonitoringCommandArgs,
  ): Promise<void> {
    if (args.subaction === 'export') {
      await this.exportDashboard(args);
      return;
    }

    console.log('📊 Trust CLI Real-Time Dashboard');
    console.log('═══════════════════════════════════════════════════════════');

    try {
      const widgets = this.monitor.getWidgets();
      const metrics = this.monitor.getMetrics();
      const _health = await this.monitor.getSystemHealth();

      if (widgets.length === 0) {
        console.log('⚠️  No dashboard widgets configured');
        console.log('💡 Use `trust monitoring start` to setup default widgets');
        return;
      }

      console.log(`\n🎛️  Dashboard Overview (${widgets.length} widgets):`);
      widgets.forEach((widget) => {
        console.log(`\n📊 ${widget.title}`);
        console.log(`   Type: ${widget.type}`);
        console.log(
          `   Position: ${widget.position.x},${widget.position.y} (${widget.position.width}x${widget.position.height})`,
        );
        console.log(`   Refresh: ${widget.refreshInterval}ms`);
        console.log(`   Data Source: ${widget.dataSource}`);
      });

      console.log(`\n📈 Available Metrics (${metrics.length} series):`);
      metrics.forEach((metric) => {
        const latest = metric.points[metric.points.length - 1];
        if (latest) {
          console.log(
            `   ${metric.name}: ${latest.value.toFixed(2)} ${metric.unit} (${metric.type})`,
          );
        }
      });

      console.log('\n💡 Dashboard Commands:');
      console.log(
        '   trust monitoring dashboard export --format json --output dashboard.json',
      );
      console.log('   trust monitoring widget add overview');
      console.log('   trust monitoring widget list');
    } catch (error) {
      console.error(
        `❌ Failed to display dashboard: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  private async handleAlertsCommand(
    args: MonitoringCommandArgs,
  ): Promise<void> {
    if (args.subaction === 'ack' && args.filter) {
      this.monitor.acknowledgeAlert(args.filter);
      console.log(`✅ Alert ${args.filter} acknowledged`);
      return;
    }

    if (args.subaction === 'clear' && args.filter) {
      this.monitor.clearAlert(args.filter);
      console.log(`🗑️  Alert ${args.filter} cleared`);
      return;
    }

    console.log('🚨 Trust CLI Monitoring Alerts');
    console.log('═══════════════════════════════════════════════════════════');

    const alerts =
      args.subaction === 'all'
        ? this.monitor.getAlerts()
        : this.monitor.getActiveAlerts();

    if (alerts.length === 0) {
      console.log('✅ No alerts found');
      return;
    }

    console.log(`\n📋 Found ${alerts.length} alert(s):`);

    // Group alerts by severity
    const grouped = alerts.reduce(
      (acc, alert) => {
        if (!acc[alert.severity]) acc[alert.severity] = [];
        acc[alert.severity].push(alert);
        return acc;
      },
      {} as Record<string, Alert[]>,
    );

    ['critical', 'warning', 'info'].forEach((severity) => {
      const severityAlerts = grouped[severity] || [];
      if (severityAlerts.length === 0) return;

      const icon =
        severity === 'critical' ? '🔴' : severity === 'warning' ? '🟡' : 'ℹ️';
      console.log(
        `\n${icon} ${severity.toUpperCase()} (${severityAlerts.length}):`,
      );

      severityAlerts.forEach((alert) => {
        const status = alert.acknowledged ? '✅' : '❌';
        const time = new Date(alert.timestamp).toLocaleString();
        console.log(`   ${status} [${alert.id}] ${alert.title}`);
        console.log(`      Source: ${alert.source} | Time: ${time}`);
        console.log(`      ${alert.message}`);
      });
    });

    console.log('\n💡 Alert Commands:');
    console.log(
      '   trust monitoring alerts ack <alert-id>     # Acknowledge alert',
    );
    console.log('   trust monitoring alerts clear <alert-id>   # Clear alert');
    console.log(
      '   trust monitoring alerts all                # Show all alerts',
    );
  }

  private async handleMetricsCommand(
    args: MonitoringCommandArgs,
  ): Promise<void> {
    console.log('📈 Trust CLI Monitoring Metrics');
    console.log('═══════════════════════════════════════════════════════════');

    const metrics = this.monitor.getMetrics();

    if (metrics.length === 0) {
      console.log('⚠️  No metrics available');
      console.log('💡 Start monitoring to begin collecting metrics');
      return;
    }

    if (args.filter) {
      const filtered = metrics.filter((m) => m.name.includes(args.filter!));
      this.displayMetrics(filtered, args);
    } else {
      this.displayMetrics(metrics, args);
    }
  }

  private async handleWidgetCommand(
    args: MonitoringCommandArgs,
  ): Promise<void> {
    if (args.subaction === 'add' && args.widgetType) {
      await this.addWidget(args.widgetType);
      return;
    }

    if (args.subaction === 'remove' && args.widgetId) {
      this.monitor.removeWidget(args.widgetId);
      console.log(`🗑️  Widget ${args.widgetId} removed`);
      return;
    }

    if (args.subaction === 'list') {
      const widgets = this.monitor.getWidgets();
      console.log(`📊 Dashboard Widgets (${widgets.length}):`);
      widgets.forEach((widget) => {
        console.log(`   • ${widget.id}: ${widget.title} (${widget.type})`);
      });
      return;
    }

    console.log('🎛️  Widget Management Commands:');
    console.log(
      '   trust monitoring widget add overview      # Add system overview',
    );
    console.log(
      '   trust monitoring widget add security      # Add security dashboard',
    );
    console.log(
      '   trust monitoring widget add alerts        # Add alerts table',
    );
    console.log(
      '   trust monitoring widget add performance   # Add performance chart',
    );
    console.log(
      '   trust monitoring widget list              # List all widgets',
    );
    console.log('   trust monitoring widget remove <id>       # Remove widget');
  }

  private async handleHealthCommand(
    _args: MonitoringCommandArgs,
  ): Promise<void> {
    console.log('🏥 Trust CLI System Health Check');
    console.log('═══════════════════════════════════════════════════════════');

    try {
      const health = await this.monitor.getSystemHealth();
      const metrics = await this.monitor.getPerformanceMetrics();

      // Overall health
      const healthIcon = this.getHealthIcon(health.overall);
      console.log(
        `\n🎯 Overall Status: ${healthIcon} ${health.overall.toUpperCase()}`,
      );
      console.log(`⏰ Uptime: ${this.formatUptime(health.uptime)}`);
      console.log(
        `🔄 Last Update: ${new Date(health.lastUpdate).toLocaleString()}`,
      );

      // Detailed component analysis
      console.log('\n🔍 Component Analysis:');

      // CPU Health
      const cpuIcon = this.getHealthIcon(health.components.cpu);
      console.log(`\n🖥️  CPU: ${cpuIcon} ${health.components.cpu}`);
      console.log(`   Usage: ${metrics.cpu.usage.toFixed(1)}%`);
      console.log(`   Cores: ${metrics.cpu.cores}`);
      console.log(
        `   Load Average: [${metrics.cpu.load.map((l) => l.toFixed(2)).join(', ')}]`,
      );

      // Memory Health
      const memIcon = this.getHealthIcon(health.components.memory);
      const memUsage = (metrics.memory.used / metrics.memory.total) * 100;
      console.log(`\n💾 Memory: ${memIcon} ${health.components.memory}`);
      console.log(`   Usage: ${memUsage.toFixed(1)}%`);
      console.log(`   Total: ${this.formatBytes(metrics.memory.total)}`);
      console.log(`   Used: ${this.formatBytes(metrics.memory.used)}`);
      console.log(`   Free: ${this.formatBytes(metrics.memory.free)}`);

      // Disk Health
      const diskIcon = this.getHealthIcon(health.components.disk);
      const diskUsage = (metrics.disk.used / metrics.disk.total) * 100;
      console.log(`\n💽 Disk: ${diskIcon} ${health.components.disk}`);
      console.log(`   Usage: ${diskUsage.toFixed(1)}%`);
      console.log(`   Total: ${this.formatBytes(metrics.disk.total)}`);
      console.log(`   Used: ${this.formatBytes(metrics.disk.used)}`);
      console.log(`   Free: ${this.formatBytes(metrics.disk.free)}`);

      // Security Health
      const secIcon = this.getHealthIcon(health.components.security);
      console.log(`\n🛡️  Security: ${secIcon} ${health.components.security}`);

      // Network Health
      const netIcon = this.getHealthIcon(health.components.network);
      console.log(`\n🌐 Network: ${netIcon} ${health.components.network}`);

      // Recommendations
      console.log('\n💡 Recommendations:');
      if (
        health.components.cpu === 'warning' ||
        health.components.cpu === 'critical'
      ) {
        console.log('   • Consider reducing CPU load or scaling resources');
      }
      if (
        health.components.memory === 'warning' ||
        health.components.memory === 'critical'
      ) {
        console.log('   • Free up memory or increase available RAM');
      }
      if (
        health.components.disk === 'warning' ||
        health.components.disk === 'critical'
      ) {
        console.log('   • Clean up disk space or add storage capacity');
      }
      if (health.overall === 'healthy') {
        console.log('   ✅ System is running optimally');
      }
    } catch (error) {
      console.error(
        `❌ Health check failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  private setupEventHandlers(): void {
    this.monitor.on('alert-added', (alert: Alert) => {
      if (alert.severity === 'critical') {
        console.log(`\n🚨 CRITICAL ALERT: ${alert.title}`);
        console.log(`   ${alert.message}`);
        console.log(`   Source: ${alert.source}`);
      }
    });

    this.monitor.on('error', (error: { collector: string; error: Error }) => {
      console.error(
        `❌ Monitoring error in ${error.collector}: ${error.error.message}`,
      );
    });
  }

  private async startWatchMode(): Promise<void> {
    const interval = setInterval(async () => {
      try {
        console.clear();
        console.log('👀 Trust CLI Real-Time Monitor - Watch Mode');
        console.log(
          '═══════════════════════════════════════════════════════════',
        );
        console.log(`🕒 Updated: ${new Date().toLocaleString()}`);

        const health = await this.monitor.getSystemHealth();
        const metrics = await this.monitor.getPerformanceMetrics();
        const alerts = this.monitor.getActiveAlerts();

        // Quick status
        const healthIcon = this.getHealthIcon(health.overall);
        console.log(
          `\n🎯 Status: ${healthIcon} ${health.overall.toUpperCase()} | Alerts: ${alerts.length}`,
        );

        // Real-time metrics
        console.log('\n📊 Live Metrics:');
        console.log(
          `   CPU: ${metrics.cpu.usage.toFixed(1)}% | Memory: ${((metrics.memory.used / metrics.memory.total) * 100).toFixed(1)}% | Disk: ${((metrics.disk.used / metrics.disk.total) * 100).toFixed(1)}%`,
        );

        // Recent alerts
        if (alerts.length > 0) {
          console.log('\n🚨 Active Alerts:');
          alerts.slice(0, 5).forEach((alert) => {
            const icon =
              alert.severity === 'critical'
                ? '🔴'
                : alert.severity === 'warning'
                  ? '🟡'
                  : 'ℹ️';
            console.log(`   ${icon} ${alert.title} (${alert.source})`);
          });
        }

        console.log('\nPress Ctrl+C to exit watch mode...');
      } catch (error) {
        console.error('Watch mode error:', error);
      }
    }, 2000);

    // Handle Ctrl+C
    process.on('SIGINT', () => {
      clearInterval(interval);
      console.log('\n👋 Exiting watch mode...');
      process.exit(0);
    });
  }

  private displayMetrics(metrics: any[], args: MonitoringCommandArgs): void {
    console.log(`\n📊 Metrics (${metrics.length} series):`);

    metrics.forEach((metric) => {
      console.log(`\n📈 ${metric.name} (${metric.type}):`);
      console.log(`   Unit: ${metric.unit}`);
      console.log(`   Points: ${metric.points.length}`);

      if (metric.labels) {
        console.log(
          `   Labels: ${Object.entries(metric.labels)
            .map(([k, v]) => `${k}=${v}`)
            .join(', ')}`,
        );
      }

      if (metric.points.length > 0) {
        const latest = metric.points[metric.points.length - 1];
        const oldest = metric.points[0];
        console.log(
          `   Latest: ${latest.value.toFixed(2)} @ ${new Date(latest.timestamp).toLocaleString()}`,
        );
        console.log(
          `   Range: ${new Date(oldest.timestamp).toLocaleString()} - ${new Date(latest.timestamp).toLocaleString()}`,
        );

        if (args.verbose && metric.points.length > 1) {
          console.log(`   Recent values:`);
          metric.points.slice(-5).forEach((point: any) => {
            console.log(
              `     ${point.value.toFixed(2)} @ ${new Date(point.timestamp).toLocaleTimeString()}`,
            );
          });
        }
      }
    });
  }

  private async exportDashboard(args: MonitoringCommandArgs): Promise<void> {
    const widgets = this.monitor.getWidgets();
    const metrics = this.monitor.getMetrics();
    const health = await this.monitor.getSystemHealth();

    const dashboard = {
      exported: new Date().toISOString(),
      version: '1.0.0',
      health,
      widgets: widgets.map((w) => ({ ...w, data: undefined })), // Remove runtime data
      metrics: metrics.map((m) => ({
        name: m.name,
        unit: m.unit,
        type: m.type,
        labels: m.labels,
        pointCount: m.points.length,
        latestValue: m.points[m.points.length - 1]?.value,
      })),
    };

    const format = args.format || 'json';
    const output = args.output || `dashboard-export.${format}`;

    let content: string;
    if (format === 'json') {
      content = JSON.stringify(dashboard, null, 2);
    } else {
      content = this.formatDashboardAsText(dashboard);
    }

    await fs.writeFile(output, content);
    console.log(`📄 Dashboard exported to ${output}`);
  }

  private formatDashboardAsText(dashboard: any): string {
    return `Trust CLI Dashboard Export
Generated: ${dashboard.exported}

System Health: ${dashboard.health.overall}
Widgets: ${dashboard.widgets.length}
Metrics: ${dashboard.metrics.length}

Widgets:
${dashboard.widgets.map((w: any) => `  - ${w.title} (${w.type})`).join('\n')}

Metrics:
${dashboard.metrics.map((m: any) => `  - ${m.name}: ${m.latestValue} ${m.unit}`).join('\n')}
`;
  }

  private async addWidget(type: string): Promise<void> {
    let widget: DashboardWidget;

    switch (type) {
      case 'overview':
        widget = DashboardWidgetFactory.createSystemOverview();
        break;
      case 'security':
        widget = DashboardWidgetFactory.createSecurityDashboard();
        break;
      case 'alerts':
        widget = DashboardWidgetFactory.createAlertTable();
        break;
      case 'performance':
        widget = DashboardWidgetFactory.createPerformanceChart();
        break;
      default:
        throw new Error(`Unknown widget type: ${type}`);
    }

    this.monitor.addWidget(widget);
    console.log(`📊 Added ${widget.title} widget`);
  }

  private getHealthIcon(status: string): string {
    switch (status) {
      case 'healthy':
        return '✅';
      case 'warning':
        return '⚠️';
      case 'critical':
        return '🔴';
      default:
        return '❓';
    }
  }

  private formatUptime(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (days > 0) {
      return `${days}d ${hours}h ${minutes}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  }

  private formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }
}

export async function handleMonitoringCommand(
  args: MonitoringCommandArgs,
): Promise<void> {
  const handler = new MonitoringCommandHandler();
  await handler.handleCommand(args);
}
