/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

const execAsync = promisify(exec);

export interface ProviderCapability {
  name: string;
  type: 'local' | 'cloud' | 'hybrid';
  available: boolean;
  version?: string;
  path?: string;
  endpoint?: string;
  modelCount?: number;
  requirements?: string[];
  configuration?: Record<string, any>;
  healthScore?: number; // 0-100 health score
}

export interface AutoDetectionResult {
  providers: ProviderCapability[];
  recommended: string[];
  quickStart: string[];
  warnings: string[];
}

export class ProviderAutoDetection {
  private detectionCache: Map<string, ProviderCapability> = new Map();
  private cacheExpiry: number = 5 * 60 * 1000; // 5 minutes
  private lastDetection: number = 0;

  /**
   * Perform comprehensive provider auto-detection
   */
  async detectAllProviders(): Promise<AutoDetectionResult> {
    const now = Date.now();
    
    // Use cache if available and not expired
    if (now - this.lastDetection < this.cacheExpiry && this.detectionCache.size > 0) {
      return this.formatResults(Array.from(this.detectionCache.values()));
    }

    console.log('🔍 Auto-detecting available AI providers...');
    
    // Run all detection methods in parallel for speed
    const detectionPromises = [
      this.detectOllama(),
      this.detectHuggingFace(),
      this.detectGemini(),
      this.detectVertexAI(),
      this.detectOpenAI(),
      this.detectAnthropic(),
      this.detectLocalModels(),
      this.detectDocker()
    ];

    const providers = await Promise.allSettled(detectionPromises);
    const capabilities: ProviderCapability[] = [];

    // Process results and filter out failed detections
    for (const result of providers) {
      if (result.status === 'fulfilled' && result.value) {
        capabilities.push(result.value);
        this.detectionCache.set(result.value.name, result.value);
      }
    }

    this.lastDetection = now;
    return this.formatResults(capabilities);
  }

  /**
   * Detect Ollama installation and available models
   */
  private async detectOllama(): Promise<ProviderCapability | null> {
    try {
      // Check if ollama command exists
      const { stdout: versionOutput } = await execAsync('ollama --version');
      const version = versionOutput.trim().split(' ')[1] || 'unknown';

      // Check if Ollama service is running
      try {
        const { stdout: listOutput } = await execAsync('ollama list');
        const models = listOutput.split('\n').filter(line => 
          line.trim() && !line.includes('NAME') && !line.includes('failed')
        );

        // Get service status
        let healthScore = 100;
        let endpoint: string | undefined = 'http://localhost:11434';
        
        try {
          const { stdout: serveCheck } = await execAsync('curl -s http://localhost:11434/api/tags');
          const response = JSON.parse(serveCheck);
          if (!response.models) healthScore = 70;
        } catch {
          healthScore = 40; // Service might be down
          endpoint = undefined;
        }

        return {
          name: 'Ollama',
          type: 'local',
          available: true,
          version,
          endpoint,
          modelCount: models.length,
          requirements: ['ollama installed'],
          configuration: {
            modelsPath: path.join(os.homedir(), '.ollama', 'models'),
            endpoint: 'http://localhost:11434'
          },
          healthScore
        };
      } catch {
        return {
          name: 'Ollama',
          type: 'local',
          available: false,
          version,
          requirements: ['ollama service not running'],
          healthScore: 20
        };
      }
    } catch {
      return {
        name: 'Ollama',
        type: 'local',
        available: false,
        requirements: ['ollama not installed'],
        healthScore: 0
      };
    }
  }

  /**
   * Detect HuggingFace capabilities
   */
  private async detectHuggingFace(): Promise<ProviderCapability> {
    let healthScore = 100;
    const requirements: string[] = [];
    
    // Check for transformers library (Python)
    try {
      await execAsync('python -c "import transformers; print(transformers.__version__)"');
    } catch {
      try {
        await execAsync('python3 -c "import transformers; print(transformers.__version__)"');
      } catch {
        healthScore -= 30;
        requirements.push('transformers library');
      }
    }

    // Check for HuggingFace CLI
    let cliVersion: string | undefined;
    try {
      const { stdout } = await execAsync('huggingface-cli --version');
      cliVersion = stdout.trim();
    } catch {
      healthScore -= 20;
      requirements.push('huggingface-cli');
    }

    // Check HuggingFace cache directory
    const cacheDir = path.join(os.homedir(), '.cache', 'huggingface', 'hub');
    let modelCount = 0;
    try {
      const items = await fs.readdir(cacheDir);
      modelCount = items.filter(item => item.startsWith('models--')).length;
    } catch {
      healthScore -= 10;
    }

    // Check for GPU support
    try {
      await execAsync('nvidia-smi');
      healthScore += 10; // Bonus for GPU
    } catch {
      // No GPU, that's fine
    }

    return {
      name: 'HuggingFace',
      type: 'hybrid',
      available: healthScore > 50,
      version: cliVersion,
      modelCount,
      requirements,
      configuration: {
        cacheDir,
        tokenEnv: 'HF_TOKEN'
      },
      healthScore
    };
  }

  /**
   * Detect Google Gemini API availability
   */
  private async detectGemini(): Promise<ProviderCapability> {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    
    return {
      name: 'Gemini',
      type: 'cloud',
      available: !!apiKey,
      endpoint: 'https://generativelanguage.googleapis.com/v1beta',
      requirements: apiKey ? [] : ['GEMINI_API_KEY environment variable'],
      configuration: {
        models: ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-pro'],
        rateLimit: '60 requests/minute'
      },
      healthScore: apiKey ? 90 : 0
    };
  }

  /**
   * Detect Google Vertex AI availability
   */
  private async detectVertexAI(): Promise<ProviderCapability> {
    const projectId = process.env.GOOGLE_CLOUD_PROJECT;
    const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    
    let healthScore = 0;
    const requirements: string[] = [];
    
    if (!projectId) {
      requirements.push('GOOGLE_CLOUD_PROJECT environment variable');
    } else {
      healthScore += 50;
    }
    
    if (!credentialsPath) {
      requirements.push('GOOGLE_APPLICATION_CREDENTIALS environment variable');
    } else {
      try {
        await fs.access(credentialsPath);
        healthScore += 50;
      } catch {
        requirements.push('valid service account credentials');
        healthScore += 20;
      }
    }

    return {
      name: 'Vertex AI',
      type: 'cloud',
      available: healthScore >= 70,
      endpoint: `https://{region}-aiplatform.googleapis.com`,
      requirements,
      configuration: {
        projectId,
        models: ['gemini-1.5-pro', 'gemini-1.5-flash', 'claude-3-5-sonnet']
      },
      healthScore
    };
  }

  /**
   * Detect OpenAI API availability
   */
  private async detectOpenAI(): Promise<ProviderCapability> {
    const apiKey = process.env.OPENAI_API_KEY;
    
    return {
      name: 'OpenAI',
      type: 'cloud',
      available: !!apiKey,
      endpoint: 'https://api.openai.com/v1',
      requirements: apiKey ? [] : ['OPENAI_API_KEY environment variable'],
      configuration: {
        models: ['gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo'],
        rateLimit: 'tier-based'
      },
      healthScore: apiKey ? 90 : 0
    };
  }

  /**
   * Detect Anthropic Claude API availability
   */
  private async detectAnthropic(): Promise<ProviderCapability> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    
    return {
      name: 'Anthropic',
      type: 'cloud',
      available: !!apiKey,
      endpoint: 'https://api.anthropic.com/v1',
      requirements: apiKey ? [] : ['ANTHROPIC_API_KEY environment variable'],
      configuration: {
        models: ['claude-3-5-sonnet-20241022', 'claude-3-opus-20240229', 'claude-3-haiku-20240307'],
        rateLimit: 'tier-based'
      },
      healthScore: apiKey ? 90 : 0
    };
  }

  /**
   * Detect local model files
   */
  private async detectLocalModels(): Promise<ProviderCapability> {
    const commonPaths = [
      path.join(os.homedir(), 'models'),
      path.join(os.homedir(), '.cache', 'huggingface'),
      path.join(os.homedir(), '.ollama'),
      '/usr/local/share/models',
      '/opt/models'
    ];

    let modelCount = 0;
    const foundPaths: string[] = [];

    for (const modelPath of commonPaths) {
      try {
        const items = await fs.readdir(modelPath);
        const models = items.filter(item => 
          item.endsWith('.gguf') || 
          item.endsWith('.safetensors') || 
          item.includes('pytorch_model')
        );
        modelCount += models.length;
        if (models.length > 0) {
          foundPaths.push(modelPath);
        }
      } catch {
        // Path doesn't exist or not accessible
      }
    }

    return {
      name: 'Local Models',
      type: 'local',
      available: modelCount > 0,
      modelCount,
      requirements: modelCount > 0 ? [] : ['downloadable model files'],
      configuration: {
        searchPaths: foundPaths,
        supportedFormats: ['.gguf', '.safetensors', 'pytorch_model.bin']
      },
      healthScore: Math.min(modelCount * 20, 100)
    };
  }

  /**
   * Detect Docker for containerized models
   */
  private async detectDocker(): Promise<ProviderCapability> {
    try {
      const { stdout } = await execAsync('docker --version');
      const version = stdout.trim();
      
      // Check if Docker is running
      try {
        await execAsync('docker ps');
        return {
          name: 'Docker',
          type: 'local',
          available: true,
          version,
          requirements: [],
          configuration: {
            containerSupport: true,
            ollama: 'ollama/ollama',
            textGeneration: 'huggingface/text-generation-inference'
          },
          healthScore: 85
        };
      } catch {
        return {
          name: 'Docker',
          type: 'local',
          available: false,
          version,
          requirements: ['Docker daemon running'],
          healthScore: 30
        };
      }
    } catch {
      return {
        name: 'Docker',
        type: 'local',
        available: false,
        requirements: ['Docker installed'],
        healthScore: 0
      };
    }
  }

  /**
   * Format detection results with recommendations
   */
  private formatResults(providers: ProviderCapability[]): AutoDetectionResult {
    // Sort by health score and availability
    const sortedProviders = providers.sort((a, b) => 
      (b.healthScore || 0) - (a.healthScore || 0)
    );

    const available = sortedProviders.filter(p => p.available);
    const unavailable = sortedProviders.filter(p => !p.available);

    // Generate recommendations
    const recommended: string[] = [];
    const quickStart: string[] = [];
    const warnings: string[] = [];

    // Recommend best available providers
    if (available.length > 0) {
      recommended.push(available[0].name);
      if (available.length > 1) {
        recommended.push(available[1].name);
      }
    }

    // Quick start suggestions
    const ollama = providers.find(p => p.name === 'Ollama');
    if (ollama?.available) {
      quickStart.push('trust model list  # See Ollama models');
    } else {
      quickStart.push('curl -fsSL https://ollama.ai/install.sh | sh  # Install Ollama');
    }

    const hf = providers.find(p => p.name === 'HuggingFace');
    if (hf?.available) {
      quickStart.push('trust model download qwen2.5-1.5b-instruct  # Download HF model');
    }

    // Generate warnings
    if (available.length === 0) {
      warnings.push('No AI providers detected. Install Ollama or configure API keys.');
    }

    const cloudOnly = available.filter(p => p.type === 'cloud');
    if (available.length === cloudOnly.length) {
      warnings.push('Only cloud providers available. Consider Ollama for privacy.');
    }

    const lowHealth = available.filter(p => (p.healthScore || 0) < 70);
    if (lowHealth.length > 0) {
      warnings.push(`Some providers have issues: ${lowHealth.map(p => p.name).join(', ')}`);
    }

    return {
      providers: sortedProviders,
      recommended,
      quickStart,
      warnings
    };
  }

  /**
   * Generate auto-configuration for detected providers
   */
  async generateConfiguration(providers: ProviderCapability[]): Promise<Record<string, any>> {
    const config: Record<string, any> = {
      backends: {},
      defaultBackend: null,
      autoDetected: true,
      timestamp: new Date().toISOString()
    };

    for (const provider of providers.filter(p => p.available)) {
      config.backends[provider.name.toLowerCase()] = {
        enabled: true,
        type: provider.type,
        endpoint: provider.endpoint,
        ...provider.configuration
      };

      // Set default backend (prefer local, then hybrid, then cloud)
      if (!config.defaultBackend) {
        if (provider.type === 'local' || 
           (provider.type === 'hybrid' && !config.defaultBackend)) {
          config.defaultBackend = provider.name.toLowerCase();
        }
      }
    }

    // If no local/hybrid, use best cloud provider
    if (!config.defaultBackend) {
      const available = providers.filter(p => p.available);
      if (available.length > 0) {
        config.defaultBackend = available[0].name.toLowerCase();
      }
    }

    return config;
  }

  /**
   * Test provider connectivity and performance
   */
  async testProvider(provider: ProviderCapability): Promise<{
    success: boolean;
    latency?: number;
    error?: string;
  }> {
    const startTime = Date.now();
    
    try {
      switch (provider.name) {
        case 'Ollama':
          if (provider.endpoint) {
            await execAsync(`curl -s ${provider.endpoint}/api/tags`);
          }
          break;
          
        case 'HuggingFace':
          // Test with a simple model check
          await execAsync('python -c "import transformers; print(\'OK\')"');
          break;
          
        default:
          // For cloud providers, we can't test without making actual API calls
          // so we just validate configuration
          if (provider.type === 'cloud' && !provider.available) {
            throw new Error('API key not configured');
          }
      }

      return {
        success: true,
        latency: Date.now() - startTime
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
}