/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as os from 'os';
import * as fs from 'fs/promises';
import { TrustConfiguration } from '../config/trustConfig.js';

/**
 * System resource information
 */
export interface SystemResources {
  cpu: {
    cores: number;
    architecture: string;
    model: string;
    currentLoad: number; // 0-100 percentage
    temperature?: number; // Celsius
  };
  memory: {
    totalRAM: number; // GB
    availableRAM: number; // GB
    usedRAM: number; // GB
    swapTotal: number; // GB
    swapUsed: number; // GB
  };
  disk: {
    totalSpace: number; // GB
    availableSpace: number; // GB
    usedSpace: number; // GB
    ioLoad: number; // 0-100 percentage
  };
  gpu?: Array<{
    name: string;
    memoryTotal: number; // GB
    memoryUsed: number; // GB
    utilization: number; // 0-100 percentage
    temperature?: number; // Celsius
  }>;
  network: {
    downloadSpeed: number; // Mbps
    uploadSpeed: number; // Mbps
    latency: number; // ms
  };
}

/**
 * Resource optimization suggestion
 */
export interface ResourceOptimization {
  type: 'warning' | 'suggestion' | 'critical';
  category: 'memory' | 'cpu' | 'disk' | 'gpu' | 'network' | 'general';
  title: string;
  description: string;
  impact: 'low' | 'medium' | 'high';
  actionable: boolean;
  actions: string[];
  priority: number; // 1-10, 10 being highest
}

/**
 * Resource monitoring and optimization service
 */
export class ResourceMonitor {
  private trustConfig: TrustConfiguration;
  private lastResourceCheck?: SystemResources;
  private lastCheckTime?: number;
  private cacheTimeoutMs = 10000; // 10 seconds

  constructor(trustConfig?: TrustConfiguration) {
    this.trustConfig = trustConfig || new TrustConfiguration();
  }

  /**
   * Initialize the resource monitor
   */
  async initialize(): Promise<void> {
    await this.trustConfig.initialize();
  }

  /**
   * Get current system resources with caching
   */
  async getSystemResources(forceRefresh = false): Promise<SystemResources> {
    const now = Date.now();

    if (
      !forceRefresh &&
      this.lastResourceCheck &&
      this.lastCheckTime &&
      now - this.lastCheckTime < this.cacheTimeoutMs
    ) {
      return this.lastResourceCheck;
    }

    const resources = await this.detectSystemResources();
    this.lastResourceCheck = resources;
    this.lastCheckTime = now;

    return resources;
  }

  /**
   * Detect current system resources
   */
  private async detectSystemResources(): Promise<SystemResources> {
    const [cpuInfo, memoryInfo, diskInfo, networkInfo] = await Promise.all([
      this.getCPUInfo(),
      this.getMemoryInfo(),
      this.getDiskInfo(),
      this.getNetworkInfo(),
    ]);

    const gpuInfo = await this.getGPUInfo();

    return {
      cpu: cpuInfo,
      memory: memoryInfo,
      disk: diskInfo,
      gpu: gpuInfo && gpuInfo.length > 0 ? gpuInfo : undefined,
      network: networkInfo,
    };
  }

  /**
   * Get CPU information and current load
   */
  private async getCPUInfo(): Promise<SystemResources['cpu']> {
    const cpus = os.cpus();
    const arch = os.arch();
    const loadavg = os.loadavg();

    // Calculate current load percentage (simplified)
    const currentLoad = Math.min(100, (loadavg[0] / cpus.length) * 100);

    return {
      cores: cpus.length,
      architecture: arch,
      model: cpus[0]?.model || 'Unknown',
      currentLoad: Math.round(currentLoad),
    };
  }

  /**
   * Get memory information
   */
  private async getMemoryInfo(): Promise<SystemResources['memory']> {
    const totalBytes = os.totalmem();
    const freeBytes = os.freemem();
    const usedBytes = totalBytes - freeBytes;

    // Try to get swap information (Linux/Unix)
    let swapTotal = 0;
    let swapUsed = 0;

    try {
      if (process.platform === 'linux') {
        const swapInfo = await this.getLinuxSwapInfo();
        swapTotal = swapInfo.total;
        swapUsed = swapInfo.used;
      }
    } catch (error) {
      // Swap info not available, continue with zeros
    }

    return {
      totalRAM: Math.round((totalBytes / 1024 ** 3) * 10) / 10,
      availableRAM: Math.round((freeBytes / 1024 ** 3) * 10) / 10,
      usedRAM: Math.round((usedBytes / 1024 ** 3) * 10) / 10,
      swapTotal: Math.round((swapTotal / 1024 ** 3) * 10) / 10,
      swapUsed: Math.round((swapUsed / 1024 ** 3) * 10) / 10,
    };
  }

  /**
   * Get Linux swap information from /proc/meminfo
   */
  private async getLinuxSwapInfo(): Promise<{ total: number; used: number }> {
    try {
      const meminfo = await fs.readFile('/proc/meminfo', 'utf8');
      const lines = meminfo.split('\n');

      let swapTotal = 0;
      let swapFree = 0;

      for (const line of lines) {
        if (line.startsWith('SwapTotal:')) {
          swapTotal = parseInt(line.split(/\s+/)[1]) * 1024; // Convert kB to bytes
        } else if (line.startsWith('SwapFree:')) {
          swapFree = parseInt(line.split(/\s+/)[1]) * 1024; // Convert kB to bytes
        }
      }

      return {
        total: swapTotal,
        used: swapTotal - swapFree,
      };
    } catch (error) {
      return { total: 0, used: 0 };
    }
  }

  /**
   * Get disk information
   */
  private async getDiskInfo(): Promise<SystemResources['disk']> {
    try {
      // For cross-platform compatibility, check current working directory
      const stats = (await (fs as any).statvfs?.(process.cwd())) || null;

      if (stats) {
        const blockSize = stats.bavail;
        const totalBlocks = stats.blocks;
        const freeBlocks = stats.bavail;
        const usedBlocks = totalBlocks - freeBlocks;

        const bytesPerBlock = stats.frsize || stats.bsize || 4096;

        return {
          totalSpace:
            Math.round(((totalBlocks * bytesPerBlock) / 1024 ** 3) * 10) / 10,
          availableSpace:
            Math.round(((freeBlocks * bytesPerBlock) / 1024 ** 3) * 10) / 10,
          usedSpace:
            Math.round(((usedBlocks * bytesPerBlock) / 1024 ** 3) * 10) / 10,
          ioLoad: 0, // Would need platform-specific implementation
        };
      }
    } catch (error) {
      // Fallback for systems without statvfs
    }

    // Fallback: estimate based on common scenarios
    return {
      totalSpace: 100, // 100GB estimate
      availableSpace: 50, // 50GB estimate
      usedSpace: 50,
      ioLoad: 0,
    };
  }

  /**
   * Get GPU information (if available)
   */
  private async getGPUInfo(): Promise<SystemResources['gpu']> {
    const gpus: SystemResources['gpu'] = [];

    try {
      // Try nvidia-smi for NVIDIA GPUs
      const { execSync } = await import('child_process');

      const nvidiaSmi = execSync(
        'nvidia-smi --query-gpu=name,memory.total,memory.used,utilization.gpu,temperature.gpu --format=csv,noheader,nounits',
        { encoding: 'utf8', timeout: 5000 },
      );

      const lines = nvidiaSmi.trim().split('\n');
      for (const line of lines) {
        const [name, memTotal, memUsed, util, temp] = line.split(', ');

        // Validate that we have valid numeric data
        const memTotalNum = parseFloat(memTotal);
        const memUsedNum = parseFloat(memUsed);
        const utilNum = parseInt(util);
        const tempNum = parseFloat(temp);

        if (isNaN(memTotalNum) || isNaN(memUsedNum) || isNaN(utilNum)) {
          // Skip invalid GPU data
          continue;
        }

        gpus.push({
          name: name.trim(),
          memoryTotal: Math.round((memTotalNum / 1024) * 10) / 10, // Convert MB to GB
          memoryUsed: Math.round((memUsedNum / 1024) * 10) / 10,
          utilization: utilNum,
          temperature: isNaN(tempNum) ? undefined : tempNum,
        });
      }
    } catch (error) {
      // NVIDIA GPU not available or nvidia-smi not found
    }

    return gpus;
  }

  /**
   * Get network information
   */
  private async getNetworkInfo(): Promise<SystemResources['network']> {
    // Simplified network info - would need platform-specific implementation for real data
    return {
      downloadSpeed: 100, // Mbps - placeholder
      uploadSpeed: 50, // Mbps - placeholder
      latency: 20, // ms - placeholder
    };
  }

  /**
   * Analyze resources and generate optimization suggestions
   */
  async analyzeAndOptimize(): Promise<ResourceOptimization[]> {
    const resources = await this.getSystemResources();
    const optimizations: ResourceOptimization[] = [];

    // Memory analysis
    optimizations.push(...this.analyzeMemory(resources.memory));

    // CPU analysis
    optimizations.push(...this.analyzeCPU(resources.cpu));

    // Disk analysis
    optimizations.push(...this.analyzeDisk(resources.disk));

    // GPU analysis
    if (resources.gpu) {
      optimizations.push(...this.analyzeGPU(resources.gpu));
    }

    // Network analysis
    optimizations.push(...this.analyzeNetwork(resources.network));

    // General system analysis
    optimizations.push(...this.analyzeGeneralSystem(resources));

    // Sort by priority (highest first)
    return optimizations.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Analyze memory usage and suggest optimizations
   */
  private analyzeMemory(
    memory: SystemResources['memory'],
  ): ResourceOptimization[] {
    const optimizations: ResourceOptimization[] = [];
    const memoryUsagePercent = (memory.usedRAM / memory.totalRAM) * 100;

    if (memoryUsagePercent > 85) {
      optimizations.push({
        type: 'critical',
        category: 'memory',
        title: 'Critical Memory Usage',
        description: `System memory usage is at ${Math.round(memoryUsagePercent)}% (${memory.usedRAM}GB/${memory.totalRAM}GB). This may cause performance issues.`,
        impact: 'high',
        actionable: true,
        actions: [
          'Close unnecessary applications',
          'Consider using smaller models (1.5B-3B parameters)',
          'Enable model quantization to reduce memory usage',
          'Use swap file if available',
          'Restart Trust CLI to clear memory leaks',
        ],
        priority: 9,
      });
    } else if (memoryUsagePercent > 70) {
      optimizations.push({
        type: 'warning',
        category: 'memory',
        title: 'High Memory Usage',
        description: `Memory usage is ${Math.round(memoryUsagePercent)}%. Consider optimizations for better performance.`,
        impact: 'medium',
        actionable: true,
        actions: [
          'Prefer models under 7B parameters',
          'Enable GGUF quantization (Q4_K_M or Q5_K_M)',
          'Monitor memory usage with: trust status --resources',
        ],
        priority: 6,
      });
    } else if (memory.availableRAM > 16) {
      optimizations.push({
        type: 'suggestion',
        category: 'memory',
        title: 'Excellent Memory Resources',
        description: `You have ${memory.availableRAM}GB available RAM. You can run larger models efficiently.`,
        impact: 'low',
        actionable: true,
        actions: [
          'Consider 13B+ parameter models for better performance',
          'Enable multiple concurrent model sessions',
          'Use unquantized models for best quality',
        ],
        priority: 3,
      });
    }

    if (memory.swapUsed > memory.swapTotal * 0.5 && memory.swapTotal > 0) {
      optimizations.push({
        type: 'warning',
        category: 'memory',
        title: 'High Swap Usage',
        description: `Swap usage is ${memory.swapUsed}GB/${memory.swapTotal}GB. This will slow performance.`,
        impact: 'high',
        actionable: true,
        actions: [
          'Free up RAM by closing applications',
          'Use smaller models to reduce memory pressure',
          'Consider adding more physical RAM',
        ],
        priority: 7,
      });
    }

    return optimizations;
  }

  /**
   * Analyze CPU usage and suggest optimizations
   */
  private analyzeCPU(cpu: SystemResources['cpu']): ResourceOptimization[] {
    const optimizations: ResourceOptimization[] = [];

    if (cpu.currentLoad > 90) {
      optimizations.push({
        type: 'critical',
        category: 'cpu',
        title: 'Critical CPU Load',
        description: `CPU load is at ${cpu.currentLoad}%. System may be unresponsive.`,
        impact: 'high',
        actionable: true,
        actions: [
          'Close CPU-intensive applications',
          'Reduce model context length',
          'Use CPU-optimized models (GGUF format)',
          'Consider using smaller models',
        ],
        priority: 8,
      });
    } else if (cpu.currentLoad > 70) {
      optimizations.push({
        type: 'warning',
        category: 'cpu',
        title: 'High CPU Usage',
        description: `CPU load is ${cpu.currentLoad}%. Performance may be impacted.`,
        impact: 'medium',
        actionable: true,
        actions: [
          'Monitor CPU usage during model inference',
          'Use models optimized for your CPU architecture',
          'Consider reducing batch size for generation',
        ],
        priority: 5,
      });
    }

    if (cpu.cores >= 8) {
      optimizations.push({
        type: 'suggestion',
        category: 'cpu',
        title: 'Multi-Core CPU Detected',
        description: `Your ${cpu.cores}-core CPU can handle parallel processing efficiently.`,
        impact: 'low',
        actionable: true,
        actions: [
          'Enable parallel processing in Ollama',
          'Use multiple model sessions concurrently',
          'Consider CPU-only inference for smaller models',
        ],
        priority: 2,
      });
    }

    return optimizations;
  }

  /**
   * Analyze disk usage and suggest optimizations
   */
  private analyzeDisk(disk: SystemResources['disk']): ResourceOptimization[] {
    const optimizations: ResourceOptimization[] = [];
    const diskUsagePercent = (disk.usedSpace / disk.totalSpace) * 100;

    if (diskUsagePercent > 90) {
      optimizations.push({
        type: 'critical',
        category: 'disk',
        title: 'Critical Disk Space',
        description: `Disk usage is at ${Math.round(diskUsagePercent)}% (${disk.usedSpace}GB/${disk.totalSpace}GB).`,
        impact: 'high',
        actionable: true,
        actions: [
          'Remove unused models with: ollama rm <model>',
          'Clear model cache and temporary files',
          'Move models to external storage',
          'Use smaller quantized models',
        ],
        priority: 10,
      });
    } else if (diskUsagePercent > 80) {
      optimizations.push({
        type: 'warning',
        category: 'disk',
        title: 'High Disk Usage',
        description: `Disk usage is ${Math.round(diskUsagePercent)}%. Consider cleanup.`,
        impact: 'medium',
        actionable: true,
        actions: [
          'Review installed models: ollama list',
          'Remove unused models and cache files',
          'Monitor disk space regularly',
        ],
        priority: 6,
      });
    }

    if (disk.availableSpace < 10) {
      optimizations.push({
        type: 'warning',
        category: 'disk',
        title: 'Low Available Space',
        description: `Only ${disk.availableSpace}GB available. This may prevent model downloads.`,
        impact: 'medium',
        actionable: true,
        actions: [
          'Free up space before downloading new models',
          'Each model typically requires 2-15GB',
          'Consider external storage for model files',
        ],
        priority: 7,
      });
    }

    return optimizations;
  }

  /**
   * Analyze GPU usage and suggest optimizations
   */
  private analyzeGPU(
    gpus: NonNullable<SystemResources['gpu']>,
  ): ResourceOptimization[] {
    const optimizations: ResourceOptimization[] = [];

    for (const gpu of gpus) {
      const memoryUsagePercent = (gpu.memoryUsed / gpu.memoryTotal) * 100;

      if (memoryUsagePercent > 90) {
        optimizations.push({
          type: 'critical',
          category: 'gpu',
          title: `Critical GPU Memory (${gpu.name})`,
          description: `GPU memory usage is ${Math.round(memoryUsagePercent)}% (${gpu.memoryUsed}GB/${gpu.memoryTotal}GB).`,
          impact: 'high',
          actionable: true,
          actions: [
            'Use smaller models or increase quantization',
            'Reduce context length and batch size',
            'Enable CPU fallback for large models',
            'Close other GPU-accelerated applications',
          ],
          priority: 9,
        });
      } else if (gpu.memoryTotal >= 8) {
        optimizations.push({
          type: 'suggestion',
          category: 'gpu',
          title: `High-End GPU Detected (${gpu.name})`,
          description: `Your GPU has ${gpu.memoryTotal}GB VRAM. Excellent for large models.`,
          impact: 'low',
          actionable: true,
          actions: [
            'Enable GPU acceleration in Ollama',
            'Use larger unquantized models for best quality',
            'Consider 13B-70B parameter models',
            'Enable mixed precision for better performance',
          ],
          priority: 1,
        });
      }

      if (gpu.temperature && gpu.temperature > 80) {
        optimizations.push({
          type: 'warning',
          category: 'gpu',
          title: `High GPU Temperature (${gpu.name})`,
          description: `GPU temperature is ${gpu.temperature}°C. This may cause throttling.`,
          impact: 'medium',
          actionable: true,
          actions: [
            'Improve GPU cooling and airflow',
            'Reduce model workload temporarily',
            'Monitor temperature during inference',
            'Consider undervolting if temperatures persist',
          ],
          priority: 6,
        });
      }
    }

    return optimizations;
  }

  /**
   * Analyze network and suggest optimizations
   */
  private analyzeNetwork(
    network: SystemResources['network'],
  ): ResourceOptimization[] {
    const optimizations: ResourceOptimization[] = [];

    if (network.downloadSpeed < 10) {
      optimizations.push({
        type: 'warning',
        category: 'network',
        title: 'Slow Internet Connection',
        description: `Download speed is ${network.downloadSpeed}Mbps. Model downloads will be slow.`,
        impact: 'medium',
        actionable: true,
        actions: [
          'Download models during off-peak hours',
          'Use smaller models to reduce download time',
          'Consider offline model management',
          'Check network connectivity and bandwidth',
        ],
        priority: 4,
      });
    }

    if (network.latency > 100) {
      optimizations.push({
        type: 'suggestion',
        category: 'network',
        title: 'High Network Latency',
        description: `Network latency is ${network.latency}ms. Cloud models may be slower.`,
        impact: 'low',
        actionable: true,
        actions: [
          'Prefer local models for better responsiveness',
          'Use cloud models only when necessary',
          'Consider local model fine-tuning',
          'Check network stability',
        ],
        priority: 2,
      });
    }

    return optimizations;
  }

  /**
   * Analyze general system health and suggest optimizations
   */
  private analyzeGeneralSystem(
    resources: SystemResources,
  ): ResourceOptimization[] {
    const optimizations: ResourceOptimization[] = [];

    // Check for balanced system
    const memoryUsagePercent =
      (resources.memory.usedRAM / resources.memory.totalRAM) * 100;
    const isSystemHealthy =
      memoryUsagePercent < 70 &&
      resources.cpu.currentLoad < 70 &&
      resources.disk.availableSpace > 20;

    if (isSystemHealthy) {
      optimizations.push({
        type: 'suggestion',
        category: 'general',
        title: 'System Running Optimally',
        description:
          'Your system has good resource availability across CPU, memory, and disk.',
        impact: 'low',
        actionable: false,
        actions: [
          'System is well-optimized for AI workloads',
          'Consider trying larger models for better quality',
          'Experiment with multiple concurrent sessions',
        ],
        priority: 1,
      });
    }

    // Check for resource imbalance
    if (resources.memory.totalRAM < 8 && resources.cpu.cores >= 8) {
      optimizations.push({
        type: 'suggestion',
        category: 'general',
        title: 'Memory-Limited System',
        description:
          'High CPU core count but limited RAM. CPU-optimized models recommended.',
        impact: 'medium',
        actionable: true,
        actions: [
          'Focus on CPU-optimized models (GGUF format)',
          'Use quantized models to reduce memory usage',
          'Consider RAM upgrade for better performance',
          'Avoid large parameter models (>7B)',
        ],
        priority: 5,
      });
    }

    return optimizations;
  }

  /**
   * Generate a resource utilization report
   */
  async generateResourceReport(): Promise<string> {
    const resources = await this.getSystemResources();
    const optimizations = await this.analyzeAndOptimize();

    let report = '📊 System Resource Report\n';
    report += '═'.repeat(50) + '\n\n';

    // CPU Section
    report += `🔧 CPU Information:\n`;
    report += `   Model: ${resources.cpu.model}\n`;
    report += `   Cores: ${resources.cpu.cores} (${resources.cpu.architecture})\n`;
    report += `   Current Load: ${resources.cpu.currentLoad}%\n`;
    if (resources.cpu.temperature) {
      report += `   Temperature: ${resources.cpu.temperature}°C\n`;
    }
    report += '\n';

    // Memory Section
    report += `💾 Memory Information:\n`;
    report += `   Total RAM: ${resources.memory.totalRAM}GB\n`;
    report += `   Available: ${resources.memory.availableRAM}GB\n`;
    report += `   Used: ${resources.memory.usedRAM}GB (${Math.round((resources.memory.usedRAM / resources.memory.totalRAM) * 100)}%)\n`;
    if (resources.memory.swapTotal > 0) {
      report += `   Swap: ${resources.memory.swapUsed}GB/${resources.memory.swapTotal}GB\n`;
    }
    report += '\n';

    // Disk Section
    report += `💿 Disk Information:\n`;
    report += `   Total: ${resources.disk.totalSpace}GB\n`;
    report += `   Available: ${resources.disk.availableSpace}GB\n`;
    report += `   Used: ${resources.disk.usedSpace}GB (${Math.round((resources.disk.usedSpace / resources.disk.totalSpace) * 100)}%)\n`;
    report += '\n';

    // GPU Section
    if (resources.gpu && resources.gpu.length > 0) {
      report += `🎮 GPU Information:\n`;
      for (const gpu of resources.gpu) {
        report += `   ${gpu.name}:\n`;
        report += `     Memory: ${gpu.memoryUsed}GB/${gpu.memoryTotal}GB (${Math.round((gpu.memoryUsed / gpu.memoryTotal) * 100)}%)\n`;
        report += `     Utilization: ${gpu.utilization}%\n`;
        if (gpu.temperature) {
          report += `     Temperature: ${gpu.temperature}°C\n`;
        }
      }
      report += '\n';
    }

    // Network Section
    report += `🌐 Network Information:\n`;
    report += `   Download: ${resources.network.downloadSpeed}Mbps\n`;
    report += `   Upload: ${resources.network.uploadSpeed}Mbps\n`;
    report += `   Latency: ${resources.network.latency}ms\n`;
    report += '\n';

    // Optimizations Section
    if (optimizations.length > 0) {
      report += `💡 Optimization Suggestions:\n`;
      report += '─'.repeat(30) + '\n';

      const criticalOpts = optimizations.filter(
        (opt) => opt.type === 'critical',
      );
      const warningOpts = optimizations.filter((opt) => opt.type === 'warning');
      const suggestionOpts = optimizations.filter(
        (opt) => opt.type === 'suggestion',
      );

      if (criticalOpts.length > 0) {
        report += '\n🔴 Critical Issues:\n';
        for (const opt of criticalOpts) {
          report += `   • ${opt.title}\n`;
          report += `     ${opt.description}\n`;
          if (opt.actionable) {
            report += `     Actions: ${opt.actions.slice(0, 2).join(', ')}\n`;
          }
        }
      }

      if (warningOpts.length > 0) {
        report += '\n🟡 Warnings:\n';
        for (const opt of warningOpts) {
          report += `   • ${opt.title}\n`;
          report += `     ${opt.description}\n`;
        }
      }

      if (suggestionOpts.length > 0) {
        report += '\n🟢 Suggestions:\n';
        for (const opt of suggestionOpts.slice(0, 3)) {
          report += `   • ${opt.title}\n`;
          report += `     ${opt.description}\n`;
        }
      }
    } else {
      report +=
        '✅ No optimization suggestions needed. System is running well!\n';
    }

    report += '\n📋 Report generated at: ' + new Date().toISOString();

    return report;
  }

  /**
   * Get model recommendations based on current system resources
   */
  async getModelRecommendationsForSystem(): Promise<{
    recommended: string[];
    discouraged: string[];
    reasoning: string;
  }> {
    const resources = await this.getSystemResources();
    const recommended: string[] = [];
    const discouraged: string[] = [];

    let reasoning = 'Based on your system resources: ';

    // Memory-based recommendations
    if (resources.memory.availableRAM >= 16) {
      recommended.push('Large models (13B-70B parameters)');
      recommended.push('Unquantized models for best quality');
      reasoning += `${resources.memory.availableRAM}GB RAM supports large models. `;
    } else if (resources.memory.availableRAM >= 8) {
      recommended.push('Medium models (7B-13B parameters)');
      recommended.push('Q5_K_M or Q6_K quantization');
      reasoning += `${resources.memory.availableRAM}GB RAM is good for medium models. `;
    } else if (resources.memory.availableRAM >= 4) {
      recommended.push('Small models (1.5B-7B parameters)');
      recommended.push('Q4_K_M quantization for efficiency');
      discouraged.push('Models larger than 7B parameters');
      reasoning += `${resources.memory.availableRAM}GB RAM requires small models. `;
    } else {
      recommended.push('Tiny models (1B-3B parameters)');
      recommended.push('Maximum quantization (Q2_K or Q3_K)');
      discouraged.push('Models larger than 3B parameters');
      reasoning += `Limited RAM (${resources.memory.availableRAM}GB) requires tiny models. `;
    }

    // GPU-based recommendations
    if (resources.gpu && resources.gpu.length > 0) {
      const primaryGPU = resources.gpu[0];
      if (primaryGPU.memoryTotal >= 12) {
        recommended.push('GPU-accelerated inference');
        recommended.push('CUDA/ROCm optimized models');
        reasoning += `${primaryGPU.memoryTotal}GB VRAM enables GPU acceleration. `;
      } else if (primaryGPU.memoryTotal >= 6) {
        recommended.push('Hybrid CPU+GPU inference');
        recommended.push('Smaller GPU-optimized models');
        reasoning += `${primaryGPU.memoryTotal}GB VRAM supports hybrid inference. `;
      } else {
        discouraged.push('GPU-only inference');
        recommended.push('CPU-optimized models');
        reasoning += `Limited VRAM suggests CPU inference. `;
      }
    } else {
      recommended.push('CPU-optimized models (GGUF format)');
      recommended.push('AVX2/AVX512 optimized builds');
      reasoning += 'No GPU detected, CPU optimization recommended. ';
    }

    // CPU-based recommendations
    if (resources.cpu.cores >= 8) {
      recommended.push('Parallel processing enabled');
      reasoning += `${resources.cpu.cores} cores support parallel processing. `;
    } else if (resources.cpu.cores <= 4) {
      discouraged.push('High context length generation');
      recommended.push('Reduced batch sizes');
      reasoning += `Limited cores (${resources.cpu.cores}) suggest conservative settings. `;
    }

    return {
      recommended,
      discouraged,
      reasoning,
    };
  }
}
