/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { TrustConfig } from '../trust/types.js';

export const TRUST_CONFIG_DIR = path.join(os.homedir(), '.trustcli');
export const TRUST_CONFIG_FILE = path.join(TRUST_CONFIG_DIR, 'config.json');
export const TRUST_MODELS_DIR = path.join(TRUST_CONFIG_DIR, 'models');

export const DEFAULT_TRUST_CONFIG: TrustConfig = {
  privacy: {
    privacyMode: 'strict',
    auditLogging: false,
    modelVerification: true,
  },
  models: {
    default: 'phi-3.5-mini-instruct',
    directory: TRUST_MODELS_DIR,
    autoVerify: true,
  },
  inference: {
    temperature: 0.7,
    topP: 0.9,
    maxTokens: 2048,
    stream: true,
  },
  transparency: {
    logPrompts: false,
    logResponses: false,
    showModelInfo: true,
    showPerformanceMetrics: true,
  },
  ai: {
    preferredBackend: 'ollama',
    fallbackOrder: ['ollama', 'huggingface', 'cloud'],
    enableFallback: true,
    ollama: {
      baseUrl: 'http://localhost:11434',
      defaultModel: 'qwen2.5:1.5b',
      timeout: 60000, // Reduced to 1 minute for faster failures
      keepAlive: '5m', // Keep model loaded for 5 minutes
      maxToolCalls: 3,
      concurrency: 2, // Limit concurrent requests
      temperature: 0.1, // Lower temperature for more consistent results
      numPredict: 1000, // Limit response length for faster generation
    },
    huggingface: {
      enabled: true,
      gbnfFunctions: true,
    },
    cloud: {
      enabled: false,
      provider: 'google',
    },
  },
};

export class TrustConfiguration {
  private config: TrustConfig;
  private configPath: string;

  constructor(configPath?: string) {
    this.configPath = configPath || TRUST_CONFIG_FILE;
    this.config = { ...DEFAULT_TRUST_CONFIG };
  }

  async initialize(): Promise<void> {
    try {
      // Ensure config directory exists
      await fs.mkdir(TRUST_CONFIG_DIR, { recursive: true });
      await fs.mkdir(TRUST_MODELS_DIR, { recursive: true });

      // Load existing config if it exists
      try {
        const configData = await fs.readFile(this.configPath, 'utf-8');
        const loadedConfig = JSON.parse(configData);
        this.config = { ...DEFAULT_TRUST_CONFIG, ...loadedConfig };
      } catch (error) {
        // Config file doesn't exist, create it with defaults
        await this.save();
      }
    } catch (error) {
      console.error('Failed to initialize Trust config:', error);
      throw error;
    }
  }

  async save(): Promise<void> {
    try {
      await fs.writeFile(this.configPath, JSON.stringify(this.config, null, 2));
    } catch (error) {
      console.error('Failed to save Trust config:', error);
      throw error;
    }
  }

  get(): TrustConfig {
    return { ...this.config };
  }

  getModelsDirectory(): string {
    return this.config.models.directory;
  }

  getDefaultModel(): string {
    return this.config.models.default;
  }

  setDefaultModel(modelName: string): void {
    this.config.models.default = modelName;
  }

  getPrivacyMode(): 'strict' | 'moderate' | 'open' {
    return this.config.privacy.privacyMode;
  }

  setPrivacyMode(mode: 'strict' | 'moderate' | 'open'): void {
    this.config.privacy.privacyMode = mode;
  }

  getInferenceSettings() {
    return { ...this.config.inference };
  }

  setInferenceSettings(settings: Partial<TrustConfig['inference']>): void {
    this.config.inference = { ...this.config.inference, ...settings };
  }

  isAuditLoggingEnabled(): boolean {
    return this.config.privacy.auditLogging;
  }

  setAuditLogging(enabled: boolean): void {
    this.config.privacy.auditLogging = enabled;
  }

  isModelVerificationEnabled(): boolean {
    return this.config.privacy.modelVerification;
  }

  setModelVerification(enabled: boolean): void {
    this.config.privacy.modelVerification = enabled;
  }

  getTransparencySettings() {
    return { ...this.config.transparency };
  }

  setTransparencySettings(settings: Partial<TrustConfig['transparency']>): void {
    this.config.transparency = { ...this.config.transparency, ...settings };
  }

  // AI Backend Configuration Methods
  getPreferredBackend(): string {
    return this.config.ai.preferredBackend;
  }

  setPreferredBackend(backend: 'ollama' | 'huggingface' | 'cloud'): void {
    this.config.ai.preferredBackend = backend;
  }

  getFallbackOrder(): string[] {
    return [...this.config.ai.fallbackOrder];
  }

  setFallbackOrder(order: Array<'ollama' | 'huggingface' | 'cloud'>): void {
    this.config.ai.fallbackOrder = order;
  }

  isFallbackEnabled(): boolean {
    return this.config.ai.enableFallback;
  }

  setFallbackEnabled(enabled: boolean): void {
    this.config.ai.enableFallback = enabled;
  }

  getOllamaConfig() {
    return { ...this.config.ai.ollama };
  }

  setOllamaConfig(config: Partial<TrustConfig['ai']['ollama']>): void {
    this.config.ai.ollama = { ...this.config.ai.ollama, ...config };
  }

  getHuggingFaceConfig() {
    return { ...this.config.ai.huggingface };
  }

  setHuggingFaceConfig(config: Partial<TrustConfig['ai']['huggingface']>): void {
    this.config.ai.huggingface = { ...this.config.ai.huggingface, ...config };
  }

  getCloudConfig() {
    return { ...this.config.ai.cloud };
  }

  setCloudConfig(config: Partial<TrustConfig['ai']['cloud']>): void {
    this.config.ai.cloud = { ...this.config.ai.cloud, ...config };
  }

  isBackendEnabled(backend: 'ollama' | 'huggingface' | 'cloud'): boolean {
    switch (backend) {
      case 'ollama':
        return true; // Ollama is always enabled if available
      case 'huggingface':
        return this.config.ai.huggingface.enabled;
      case 'cloud':
        return this.config.ai.cloud.enabled;
      default:
        return false;
    }
  }

  setBackendEnabled(backend: 'huggingface' | 'cloud', enabled: boolean): void {
    switch (backend) {
      case 'huggingface':
        this.config.ai.huggingface.enabled = enabled;
        break;
      case 'cloud':
        this.config.ai.cloud.enabled = enabled;
        break;
    }
  }

  /**
   * Enhanced auth validation methods based on upstream Gemini CLI improvements
   */
  validateAuthConfiguration(): { isValid: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check for conflicting environment variables
    const geminiApiKey = process.env.GEMINI_API_KEY;
    const googleApiKey = process.env.GOOGLE_API_KEY;
    const googleCloudProject = process.env.GOOGLE_CLOUD_PROJECT;
    const googleCloudLocation = process.env.GOOGLE_CLOUD_LOCATION;
    const googleApplicationCredentials = process.env.GOOGLE_APPLICATION_CREDENTIALS;

    // Detect potentially confusing configurations
    if (geminiApiKey && googleApiKey) {
      warnings.push('Both GEMINI_API_KEY and GOOGLE_API_KEY are set. GEMINI_API_KEY takes precedence for Gemini API access.');
    }

    if (geminiApiKey && (googleCloudProject || googleCloudLocation)) {
      warnings.push('GEMINI_API_KEY is set along with Google Cloud settings. This may cause authentication confusion.');
    }

    if (googleApiKey && !googleCloudProject) {
      warnings.push('GOOGLE_API_KEY is set but GOOGLE_CLOUD_PROJECT is missing. Vertex AI may not work properly.');
    }

    if (googleCloudProject && !googleCloudLocation) {
      errors.push('GOOGLE_CLOUD_PROJECT is set but GOOGLE_CLOUD_LOCATION is missing. Both are required for Vertex AI.');
    }

    // Check for valid backend configurations
    if (this.isBackendEnabled('huggingface') && !geminiApiKey && !googleApiKey) {
      warnings.push('HuggingFace backend is enabled but no API key is configured.');
    }

    if (this.isBackendEnabled('cloud') && !googleCloudProject) {
      errors.push('Cloud backend is enabled but Google Cloud configuration is incomplete.');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Get auth type based on current environment and configuration
   */
  getAuthType(): 'gemini-api-key' | 'vertex-ai' | 'oauth-personal' | 'cloud-shell' | 'none' {
    const geminiApiKey = process.env.GEMINI_API_KEY;
    const googleApiKey = process.env.GOOGLE_API_KEY;
    const googleCloudProject = process.env.GOOGLE_CLOUD_PROJECT;
    const googleCloudLocation = process.env.GOOGLE_CLOUD_LOCATION;
    const isCloudShell = process.env.GOOGLE_CLOUD_SHELL === 'true';

    if (isCloudShell) {
      return 'cloud-shell';
    }

    if (geminiApiKey) {
      return 'gemini-api-key';
    }

    if (googleApiKey || (googleCloudProject && googleCloudLocation)) {
      return 'vertex-ai';
    }

    // Check if OAuth tokens might be available (simplified check)
    if (process.env.HOME) {
      return 'oauth-personal';
    }

    return 'none';
  }

  /**
   * Validate and suggest fixes for auth issues
   */
  getAuthValidationSuggestions(): string[] {
    const suggestions: string[] = [];
    const authValidation = this.validateAuthConfiguration();
    const authType = this.getAuthType();

    if (authType === 'none') {
      suggestions.push('No authentication configured. Set GEMINI_API_KEY for Gemini API or configure Google Cloud credentials for Vertex AI.');
    }

    if (authValidation.errors.length > 0) {
      suggestions.push('Fix configuration errors: ' + authValidation.errors.join(', '));
    }

    if (authValidation.warnings.length > 0) {
      suggestions.push('Consider resolving warnings: ' + authValidation.warnings.join(', '));
    }

    // Specific suggestions based on auth type
    switch (authType) {
      case 'gemini-api-key':
        suggestions.push('Using Gemini API Key authentication. Ensure the key has proper permissions.');
        break;
      case 'vertex-ai':
        suggestions.push('Using Vertex AI authentication. Verify project and location settings.');
        break;
      case 'oauth-personal':
        suggestions.push('Using OAuth authentication. Run `trust auth setup` if having issues.');
        break;
      case 'cloud-shell':
        suggestions.push('Using Cloud Shell authentication. Should work automatically.');
        break;
    }

    return suggestions;
  }
}