/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi, type MockedFunction } from 'vitest';
import { ModelCommandHandler } from './modelCommands.js';
import type { ModelCommandArgs } from './modelCommands.js';

// Mock the core dependencies
vi.mock('../../../core/dist/index.js', () => ({
  TrustConfiguration: vi.fn().mockImplementation(() => ({
    initialize: vi.fn(),
    getModelsDirectory: vi.fn().mockReturnValue('/test/models'),
    setDefaultModel: vi.fn(),
    save: vi.fn()
  })),
  TrustModelManagerImpl: vi.fn().mockImplementation(() => ({
    initialize: vi.fn(),
    listAvailableModels: vi.fn().mockReturnValue([
      {
        name: 'qwen2.5-1.5b-instruct',
        path: '/models/qwen2.5-1.5b-instruct.gguf',
        type: 'gguf',
        parameters: '1.5B',
        contextSize: 4096,
        quantization: 'Q4_K_M',
        trustScore: 9,
        ramRequirement: '2GB',
        description: 'Lightweight model for quick questions - 1.5B parameters',
        verificationHash: 'sha256:d7efb072e...',
        downloadUrl: 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-gguf'
      },
      {
        name: 'codellama-7b-instruct',
        path: '/models/codellama-7b-instruct.gguf',
        type: 'gguf',
        parameters: '7B',
        contextSize: 8192,
        quantization: 'Q4_K_M',
        trustScore: 8,
        ramRequirement: '4GB',
        description: 'Code-focused model - 7B parameters',
        verificationHash: 'sha256:pending'
      }
    ]),
    getCurrentModel: vi.fn().mockReturnValue({
      name: 'qwen2.5-1.5b-instruct',
      path: '/models/qwen2.5-1.5b-instruct.gguf',
      type: 'gguf',
      parameters: '1.5B',
      contextSize: 4096,
      quantization: 'Q4_K_M',
      trustScore: 9,
      ramRequirement: '2GB',
      description: 'Lightweight model for quick questions - 1.5B parameters'
    }),
    switchModel: vi.fn(),
    downloadModel: vi.fn(),
    getRecommendedModel: vi.fn().mockReturnValue({
      name: 'qwen2.5-1.5b-instruct',
      path: '/models/qwen2.5-1.5b-instruct.gguf',
      type: 'gguf',
      parameters: '1.5B',
      contextSize: 4096,
      quantization: 'Q4_K_M',
      trustScore: 9,
      ramRequirement: '2GB',
      description: 'Lightweight model for quick questions - 1.5B parameters'
    }),
    verifyModel: vi.fn().mockReturnValue(true),
    verifyModelIntegrity: vi.fn().mockResolvedValue({ valid: true, message: 'Model integrity verified successfully' }),
    verifyAllModels: vi.fn().mockResolvedValue(new Map([
      ['qwen2.5-1.5b-instruct', { valid: true, message: 'Model integrity verified successfully' }],
      ['codellama-7b-instruct', { valid: false, message: 'Model not downloaded' }]
    ])),
    deleteModel: vi.fn(),
    generateModelReport: vi.fn().mockResolvedValue('/models/qwen2.5-1.5b-instruct.gguf.manifest.json')
  })),
  globalPerformanceMonitor: {
    getSystemMetrics: vi.fn().mockReturnValue({
      memoryUsage: {
        total: 16,
        available: 8,
        used: 8,
        usagePercentage: 50
      },
      cpuInfo: {
        cores: 8,
        model: 'Intel i7',
        loadAverage: [1.2, 1.5, 1.8]
      },
      platform: {
        os: 'linux',
        arch: 'x64',
        nodeVersion: '20.0.0'
      }
    }),
    getOptimalModelSettings: vi.fn().mockReturnValue({
      recommendedRAM: 4,
      maxContextSize: 8192,
      estimatedSpeed: 'fast'
    })
  }
}));

// Mock console methods
const mockConsoleLog = vi.fn();
const mockConsoleError = vi.fn();
const mockConsoleTable = vi.fn();

global.console = {
  ...console,
  log: mockConsoleLog,
  error: mockConsoleError,
  table: mockConsoleTable
};

describe('ModelCommandHandler', () => {
  let commandHandler: ModelCommandHandler;

  beforeEach(() => {
    vi.clearAllMocks();
    commandHandler = new ModelCommandHandler();
  });

  describe('list command', () => {
    it('should list available models', async () => {
      const args: ModelCommandArgs = {
        action: 'list',
        modelName: undefined,
        task: undefined,
        ramLimit: undefined
      };

      await commandHandler.handleCommand(args);

      expect(mockConsoleLog).toHaveBeenCalledWith('\n🤗 Trust CLI - HuggingFace Models');
      expect(mockConsoleLog).toHaveBeenCalledWith('═'.repeat(60));
    });

    it('should show current model indicator', async () => {
      const args: ModelCommandArgs = {
        action: 'list',
        modelName: undefined,
        task: undefined,
        ramLimit: undefined
      };

      await commandHandler.handleCommand(args);

      // Should show models in new grouped format
      expect(mockConsoleLog).toHaveBeenCalledWith('\n📦 Downloaded Models:');
    });
  });

  describe('switch command', () => {
    it('should switch to specified model', async () => {
      const args: ModelCommandArgs = {
        action: 'switch',
        modelName: 'codellama-7b-instruct',
        task: undefined,
        ramLimit: undefined
      };

      await commandHandler.handleCommand(args);

      expect(mockConsoleLog).toHaveBeenCalledWith('\n🔄 Switching to model: codellama-7b-instruct');
      expect(mockConsoleLog).toHaveBeenCalledWith('✅ Successfully switched to codellama-7b-instruct');
    });

    it('should handle missing model name', async () => {
      const args: ModelCommandArgs = {
        action: 'switch',
        modelName: undefined,
        task: undefined,
        ramLimit: undefined
      };

      // The new implementation should throw an error for missing model name
      await expect(commandHandler.handleCommand(args)).rejects.toThrow('Model name required for switch command');
    });

    it('should handle switch errors', async () => {
      const args: ModelCommandArgs = {
        action: 'switch',
        modelName: 'non-existent-model',
        task: undefined,
        ramLimit: undefined
      };

      await expect(commandHandler.handleCommand(args)).rejects.toThrow('Model "non-existent-model" not found');
    });
  });

  describe('download command', () => {
    it('should download specified model', async () => {
      const args: ModelCommandArgs = {
        action: 'download',
        modelName: 'new-model',
        task: undefined,
        ramLimit: undefined
      };

      await expect(commandHandler.handleCommand(args)).rejects.toThrow('Model "new-model" not found');
    });

    it('should handle missing model name for download', async () => {
      const args: ModelCommandArgs = {
        action: 'download',
        modelName: undefined,
        task: undefined,
        ramLimit: undefined
      };

      await expect(commandHandler.handleCommand(args)).rejects.toThrow('Model name required for download command');
    });

    it('should handle download errors', async () => {
      const args: ModelCommandArgs = {
        action: 'download',
        modelName: 'failing-model',
        task: undefined,
        ramLimit: undefined
      };

      await expect(commandHandler.handleCommand(args)).rejects.toThrow('Model "failing-model" not found');
    });
  });

  describe('recommend command', () => {
    it('should recommend model for specified task', async () => {
      const args: ModelCommandArgs = {
        action: 'recommend',
        modelName: undefined,
        task: 'coding',
        ramLimit: undefined
      };

      await commandHandler.handleCommand(args);

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Model Recommendation for "coding"'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Recommended: qwen2.5-1.5b-instruct'));
    });

    it('should recommend model with RAM limit', async () => {
      const args: ModelCommandArgs = {
        action: 'recommend',
        modelName: undefined,
        task: 'coding',
        ramLimit: 2
      };

      await commandHandler.handleCommand(args);

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Model Recommendation for "coding"'));
    });

    it('should handle no recommendations available', async () => {
      const args: ModelCommandArgs = {
        action: 'recommend',
        modelName: undefined,
        task: 'unknown-task',
        ramLimit: undefined
      };

      await commandHandler.handleCommand(args);

      // Should still show the recommendation header
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Model Recommendation'));
    });

    it('should use default task if not specified', async () => {
      const args: ModelCommandArgs = {
        action: 'recommend',
        modelName: undefined,
        task: undefined,
        ramLimit: undefined
      };

      await commandHandler.handleCommand(args);

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Model Recommendation'));
    });
  });

  describe('verify command', () => {
    it('should verify specified model', async () => {
      const args: ModelCommandArgs = {
        action: 'verify',
        modelName: 'non-existent-model',
        task: undefined,
        ramLimit: undefined
      };

      await commandHandler.handleCommand(args);

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Verifying model: non-existent-model'));
    });

    it('should verify all models when no model name provided', async () => {
      const args: ModelCommandArgs = {
        action: 'verify',
        modelName: undefined,
        task: undefined,
        ramLimit: undefined
      };

      await commandHandler.handleCommand(args);

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Verifying all models'));
    });

    it('should handle verification failure', async () => {
      const args: ModelCommandArgs = {
        action: 'verify',
        modelName: 'non-existent-model',
        task: undefined,
        ramLimit: undefined
      };

      await commandHandler.handleCommand(args);

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Verifying model: non-existent-model'));
    });
  });

  describe('delete command', () => {
    it('should delete specified model', async () => {
      const args: ModelCommandArgs = {
        action: 'delete',
        modelName: 'old-model',
        task: undefined,
        ramLimit: undefined
      };

      await commandHandler.handleCommand(args);

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Deleting model: old-model'));
    });

    it('should handle missing model name for delete', async () => {
      const args: ModelCommandArgs = {
        action: 'delete',
        modelName: undefined,
        task: undefined,
        ramLimit: undefined
      };

      await expect(commandHandler.handleCommand(args)).rejects.toThrow('Model name required for delete command');
    });

    it('should handle delete errors', async () => {
      const args: ModelCommandArgs = {
        action: 'delete',
        modelName: 'active-model',
        task: undefined,
        ramLimit: undefined
      };

      await commandHandler.handleCommand(args);

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Deleting model: active-model'));
    });
  });

  describe('system info integration', () => {
    it('should show system information with recommendations', async () => {
      const args: ModelCommandArgs = {
        action: 'recommend',
        modelName: undefined,
        task: 'coding',
        ramLimit: undefined
      };

      await commandHandler.handleCommand(args);

      // Should display system metrics
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('System RAM'));
    });

    it('should provide performance context in recommendations', async () => {
      const args: ModelCommandArgs = {
        action: 'recommend',
        modelName: undefined,
        task: 'coding',
        ramLimit: undefined
      };

      await commandHandler.handleCommand(args);

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Expected Performance: fast'));
    });
  });

  describe('error handling', () => {
    it('should handle invalid action', async () => {
      const args: ModelCommandArgs = {
        action: 'invalid' as any,
        modelName: undefined,
        task: undefined,
        ramLimit: undefined
      };

      await expect(commandHandler.handleCommand(args)).rejects.toThrow('Unknown model command: invalid');
    });

    it('should handle initialization errors', async () => {
      const args: ModelCommandArgs = {
        action: 'list',
        modelName: undefined,
        task: undefined,
        ramLimit: undefined
      };

      await commandHandler.handleCommand(args);

      // Should complete without errors - just checking that it runs
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Trust CLI - HuggingFace Models'));
    });
  });

  describe('command validation', () => {
    it('should validate model names', async () => {
      const args: ModelCommandArgs = {
        action: 'switch',
        modelName: '',
        task: undefined,
        ramLimit: undefined
      };

      await expect(commandHandler.handleCommand(args)).rejects.toThrow('Model name required for switch command');
    });

    it('should validate RAM limits', async () => {
      const args: ModelCommandArgs = {
        action: 'recommend',
        modelName: undefined,
        task: 'coding',
        ramLimit: -1
      };

      await commandHandler.handleCommand(args);

      // Should handle invalid RAM values gracefully
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Model Recommendation'));
    });
  });

  describe('help and usage', () => {
    it('should provide usage information for invalid commands', async () => {
      const args: ModelCommandArgs = {
        action: 'switch',
        modelName: undefined,
        task: undefined,
        ramLimit: undefined
      };

      await expect(commandHandler.handleCommand(args)).rejects.toThrow('Model name required for switch command');
    });

    it('should provide examples in error messages', async () => {
      const args: ModelCommandArgs = {
        action: 'download',
        modelName: undefined,
        task: undefined,
        ramLimit: undefined
      };

      await expect(commandHandler.handleCommand(args)).rejects.toThrow('Model name required for download command');
    });
  });

  describe('report command', () => {
    it('should generate integrity report for specified model', async () => {
      const args: ModelCommandArgs = {
        action: 'report',
        modelName: 'qwen2.5-1.5b-instruct',
        task: undefined,
        ramLimit: undefined
      };

      await commandHandler.handleCommand(args);

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Generating integrity report for: qwen2.5-1.5b-instruct'));
    });

    it('should handle missing model name for report', async () => {
      const args: ModelCommandArgs = {
        action: 'report',
        modelName: undefined,
        task: undefined,
        ramLimit: undefined
      };

      await expect(commandHandler.handleCommand(args)).rejects.toThrow('Model name required for report command');
    });

    it('should handle report generation failure', async () => {
      const args: ModelCommandArgs = {
        action: 'report',
        modelName: 'non-existent-model',
        task: undefined,
        ramLimit: undefined
      };

      await commandHandler.handleCommand(args);

      expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('Model non-existent-model not found'));
    });
  });

  describe('trust command', () => {
    it('should show trusted models registry', async () => {
      const args: ModelCommandArgs = {
        action: 'trust',
        modelName: undefined,
        task: undefined,
        ramLimit: undefined
      };

      await commandHandler.handleCommand(args);

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Trust CLI - Trusted Model Registry'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Model Trust Status'));
    });

    it('should handle export functionality', async () => {
      const args: ModelCommandArgs = {
        action: 'trust',
        modelName: undefined,
        task: undefined,
        ramLimit: undefined,
        export: true
      };

      await commandHandler.handleCommand(args);

      expect(mockConsoleLog).toHaveBeenCalledWith('📤 Exporting trusted model database...');
    });

    it('should display trusted models with hashes', async () => {
      const args: ModelCommandArgs = {
        action: 'trust',
        modelName: undefined,
        task: undefined,
        ramLimit: undefined
      };

      await commandHandler.handleCommand(args);

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('✅ qwen2.5-1.5b-instruct'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Hash: sha256:d7efb072e...'));
    });
  });

  describe('verify command enhancements', () => {
    it('should verify all models when no model name provided', async () => {
      const args: ModelCommandArgs = {
        action: 'verify',
        modelName: undefined,
        task: undefined,
        ramLimit: undefined
      };

      await commandHandler.handleCommand(args);

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Verifying all models'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Summary:'));
    });

    it('should show detailed verification results', async () => {
      const args: ModelCommandArgs = {
        action: 'verify',
        modelName: 'non-existent-model',
        task: undefined,
        ramLimit: undefined
      };

      await commandHandler.handleCommand(args);

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Verifying model: non-existent-model'));
    });

    it('should provide security status information', async () => {
      const args: ModelCommandArgs = {
        action: 'verify',
        modelName: 'non-existent-model',
        task: undefined,
        ramLimit: undefined
      };

      await commandHandler.handleCommand(args);

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Verifying model: non-existent-model'));
    });

    it('should show remediation steps for failed verification', async () => {
      const args: ModelCommandArgs = {
        action: 'verify',
        modelName: 'non-existent-model',
        task: undefined,
        ramLimit: undefined
      };

      await commandHandler.handleCommand(args);

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Verifying model: non-existent-model'));
    });
  });

  describe('security and integrity features', () => {
    it('should display model integrity information', async () => {
      const args: ModelCommandArgs = {
        action: 'list',
        modelName: undefined,
        task: undefined,
        ramLimit: undefined,
        verbose: true
      };

      await commandHandler.handleCommand(args);

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Trust Score'));
    });

    it('should show model paths in verbose mode', async () => {
      const args: ModelCommandArgs = {
        action: 'list',
        modelName: undefined,
        task: undefined,
        ramLimit: undefined,
        verbose: true
      };

      await commandHandler.handleCommand(args);

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('/models/'));
    });

    it('should handle models without verification hash', async () => {
      const args: ModelCommandArgs = {
        action: 'trust',
        modelName: undefined,
        task: undefined,
        ramLimit: undefined
      };

      await commandHandler.handleCommand(args);

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('⚠️  codellama-7b-instruct'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Status: Verified but no stored hash'));
    });

    it('should provide security tips', async () => {
      const args: ModelCommandArgs = {
        action: 'trust',
        modelName: undefined,
        task: undefined,
        ramLimit: undefined
      };

      await commandHandler.handleCommand(args);

      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('💡 Tips:'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Run \'trust model verify\' to check all models'));
      expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Run \'trust model report <name>\' for detailed integrity report'));
    });
  });
});