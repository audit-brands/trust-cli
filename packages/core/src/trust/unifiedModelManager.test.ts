/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UnifiedModelManager, UnifiedModel, TaskType, HardwareConstraints } from './unifiedModelManager.js';
import { TrustConfiguration } from '../config/trustConfig.js';

// Mock dependencies
vi.mock('./modelManager.js', () => ({
  TrustModelManagerImpl: vi.fn().mockImplementation(() => ({
    initialize: vi.fn(),
    listAvailableModels: vi.fn().mockReturnValue([
      {
        name: 'phi-3.5-mini-instruct',
        type: 'phi',
        parameters: '3.8B',
        contextSize: 4096,
        ramRequirement: '3GB',
        description: 'Fast coding assistance model',
        trustScore: 9.5,
        quantization: 'Q4_K_M',
        downloadUrl: 'https://example.com/model.gguf',
        expectedSize: 2393232672,
        verificationHash: 'sha256:abc123',
      },
      {
        name: 'qwen2.5-1.5b-instruct',
        type: 'qwen',
        parameters: '1.5B',
        contextSize: 8192,
        ramRequirement: '2GB',
        description: 'Lightweight reasoning model',
        trustScore: 8.8,
        quantization: 'Q4_K_M',
        downloadUrl: 'https://example.com/qwen.gguf',
        expectedSize: 1640000000,
        verificationHash: 'sha256:def456',
      },
    ]),
  })),
}));

vi.mock('./ollamaClient.js', () => ({
  OllamaClient: vi.fn().mockImplementation(() => ({
    listModels: vi.fn().mockResolvedValue([
      'qwen2.5:1.5b',
      'llama3.2:3b',
      'phi3.5:3.8b-mini-instruct',
    ]),
  })),
}));

vi.mock('../config/trustConfig.js', () => ({
  TrustConfiguration: vi.fn().mockImplementation(() => ({
    initialize: vi.fn(),
    isBackendEnabled: vi.fn().mockImplementation((backend: string) => {
      return ['ollama', 'huggingface'].includes(backend);
    }),
  })),
}));

describe('UnifiedModelManager', () => {
  let manager: UnifiedModelManager;
  let mockConfig: TrustConfiguration;

  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig = new TrustConfiguration();
    manager = new UnifiedModelManager(mockConfig);
  });

  describe('discoverAllModels', () => {
    it('should discover models from all enabled backends', async () => {
      await manager.initialize();
      const models = await manager.discoverAllModels();

      expect(models).toHaveLength(5); // 2 HuggingFace + 3 Ollama
      
      // Check HuggingFace models
      const hfModels = models.filter(m => m.backend === 'huggingface');
      expect(hfModels).toHaveLength(2);
      expect(hfModels[0]).toMatchObject({
        name: 'phi-3.5-mini-instruct',
        backend: 'huggingface',
        type: 'phi',
        parameters: '3.8B',
        trustScore: 9.5,
        available: true,
      });

      // Check Ollama models
      const ollamaModels = models.filter(m => m.backend === 'ollama');
      expect(ollamaModels).toHaveLength(3);
      expect(ollamaModels[0]).toMatchObject({
        name: 'qwen2.5:1.5b',
        backend: 'ollama',
        type: 'qwen',
        parameters: '1.5B',
        available: true,
      });
    });

    it('should use cached models when cache is valid', async () => {
      await manager.initialize();
      
      // First call
      const models1 = await manager.discoverAllModels();
      
      // Second call should use cache
      const models2 = await manager.discoverAllModels();
      
      expect(models1).toBe(models2); // Same reference, indicating cache usage
    });

    it('should force refresh when requested', async () => {
      await manager.initialize();
      
      // First call
      await manager.discoverAllModels();
      
      // Force refresh
      const models = await manager.discoverAllModels(true);
      
      expect(models).toHaveLength(5);
    });
  });

  describe('filterModels', () => {
    let testModels: UnifiedModel[];

    beforeEach(async () => {
      await manager.initialize();
      testModels = await manager.discoverAllModels();
    });

    it('should filter by task type', () => {
      const codingModels = manager.filterModels(testModels, 'coding');
      
      // Models with 'phi' or 'code' in name should score high for coding
      expect(codingModels.length).toBeGreaterThan(0);
      expect(codingModels.some(m => m.name.includes('phi'))).toBe(true);
    });

    it('should filter by hardware constraints - RAM', () => {
      const constraints: HardwareConstraints = {
        availableRAM: 2, // 2GB limit
      };
      
      const filteredModels = manager.filterModels(testModels, undefined, constraints);
      
      // Should only include models requiring 2GB or less
      filteredModels.forEach(model => {
        const ramReq = manager['parseRAMRequirement'](model.ramRequirement);
        expect(ramReq).toBeLessThanOrEqual(2);
      });
    });

    it('should filter by hardware constraints - download size', () => {
      const constraints: HardwareConstraints = {
        maxDownloadSize: 2000000000, // 2GB limit
      };
      
      const filteredModels = manager.filterModels(testModels, undefined, constraints);
      
      filteredModels.forEach(model => {
        const size = model.metadata?.expectedSize || 0;
        expect(size).toBeLessThanOrEqual(2000000000);
      });
    });

    it('should filter by availability', () => {
      // Mark one model as unavailable
      testModels[0].available = false;
      
      const filteredModels = manager.filterModels(testModels);
      
      expect(filteredModels.every(m => m.available)).toBe(true);
      expect(filteredModels.length).toBe(testModels.length - 1);
    });
  });

  describe('selectBestModel', () => {
    let testModels: UnifiedModel[];

    beforeEach(async () => {
      await manager.initialize();
      testModels = await manager.discoverAllModels();
    });

    it('should select model with highest combined score', () => {
      const bestModel = manager.selectBestModel(testModels);
      
      expect(bestModel).toBeTruthy();
      expect(bestModel?.trustScore).toBeGreaterThan(0);
    });

    it('should consider task suitability in selection', () => {
      const bestCodingModel = manager.selectBestModel(testModels, 'coding');
      
      expect(bestCodingModel).toBeTruthy();
      expect(bestCodingModel?.taskSuitability?.coding).toBeGreaterThan(6);
    });

    it('should return null for empty model list', () => {
      const bestModel = manager.selectBestModel([]);
      
      expect(bestModel).toBeNull();
    });
  });

  describe('getModelsByBackend', () => {
    it('should group models by backend', async () => {
      await manager.initialize();
      const grouped = await manager.getModelsByBackend();
      
      expect(grouped).toHaveProperty('huggingface');
      expect(grouped).toHaveProperty('ollama');
      expect(grouped.huggingface).toHaveLength(2);
      expect(grouped.ollama).toHaveLength(3);
    });
  });

  describe('task suitability inference', () => {
    it('should score coding models highly for coding tasks', () => {
      const suitability = manager['inferTaskSuitability']('phi-3.5-mini-instruct', 'phi', 'coding model');
      
      expect(suitability.coding).toBeGreaterThanOrEqual(9);
    });

    it('should score reasoning models highly for reasoning tasks', () => {
      const suitability = manager['inferTaskSuitability']('qwen2.5-reasoning', 'qwen', 'reasoning model');
      
      expect(suitability.reasoning).toBeGreaterThanOrEqual(9);
    });

    it('should provide balanced scores for general models', () => {
      const suitability = manager['inferTaskSuitability']('general-assistant', 'unknown', 'general purpose');
      
      expect(suitability.general).toBeGreaterThanOrEqual(7);
    });
  });

  describe('Ollama model inference', () => {
    it('should infer correct model type from name', () => {
      expect(manager['inferOllamaModelType']('llama3.2:3b')).toBe('llama');
      expect(manager['inferOllamaModelType']('qwen2.5:1.5b')).toBe('qwen');
      expect(manager['inferOllamaModelType']('phi3.5:mini')).toBe('phi');
    });

    it('should infer parameters from model name', () => {
      expect(manager['inferOllamaParameters']('qwen2.5:1.5b')).toBe('1.5B');
      expect(manager['inferOllamaParameters']('llama3.2:3b')).toBe('3B');
      expect(manager['inferOllamaParameters']('phi3.5:3.8b')).toBe('3.8B');
    });

    it('should infer RAM requirements from parameters', () => {
      expect(manager['inferOllamaRAMRequirement']('qwen2.5:1.5b')).toBe('2GB');
      expect(manager['inferOllamaRAMRequirement']('llama3.2:3b')).toBe('4GB');
      expect(manager['inferOllamaRAMRequirement']('llama3:70b')).toBe('48GB');
    });
  });

  describe('cache management', () => {
    it('should clear cache when requested', async () => {
      await manager.initialize();
      await manager.discoverAllModels();
      
      manager.clearCache();
      
      // Cache should be cleared
      expect(manager['cachedModels']).toHaveLength(0);
      expect(manager['lastCacheUpdate']).toBe(0);
    });
  });
});