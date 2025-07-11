/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SmartRoutingService, DefaultModelSelection, SmartRoutingRecommendation } from './smartRoutingService.js';
import { UnifiedModel, TaskType } from './unifiedModelManager.js';
import { TrustConfiguration } from '../config/trustConfig.js';

// Mock dependencies
vi.mock('./intelligentModelRouter.js', () => ({
  IntelligentModelRouter: vi.fn().mockImplementation(() => ({
    initialize: vi.fn(),
    routeToOptimalModel: vi.fn().mockResolvedValue({
      selectedModel: {
        name: 'phi-3.5-mini-instruct',
        backend: 'huggingface',
        type: 'phi',
        parameters: '3.8B',
        ramRequirement: '3GB',
        trustScore: 9.5,
        available: true,
        taskSuitability: { coding: 9, reasoning: 7, general: 8, creative: 6 },
      },
      reasoning: 'Optimized for coding tasks with high trust score',
      alternatives: [
        {
          name: 'qwen2.5:1.5b',
          backend: 'ollama',
          type: 'qwen',
          parameters: '1.5B',
          ramRequirement: '2GB',
          trustScore: 8.8,
          available: true,
          taskSuitability: { coding: 6, reasoning: 9, general: 8, creative: 7 },
        },
      ],
      step1_consolidation: { totalModels: 4, backendCounts: {}, duration: 10 },
      step2_filtering: { taskFiltered: 0, hardwareFiltered: 1, availabilityFiltered: 1, remaining: 2, duration: 5 },
      step3_selection: {
        scoringMethod: 'weighted_multi_factor',
        topCandidates: [
          {
            model: {
              name: 'phi-3.5-mini-instruct',
              backend: 'huggingface',
              type: 'phi',
              parameters: '3.8B',
              ramRequirement: '3GB',
              trustScore: 9.5,
              available: true,
              taskSuitability: { coding: 9, reasoning: 7, general: 8, creative: 6 },
            },
            score: 0.85,
            breakdown: { trust: 0.38, task_suitability: 0.27, performance: 0.12, availability: 0.1, efficiency: 0.04 },
          },
        ],
        duration: 15,
      },
      step4_routing: { targetBackend: 'huggingface', routingMethod: 'direct_backend_routing', duration: 2 },
      totalDuration: 32,
    }),
    detectSystemResources: vi.fn().mockResolvedValue({
      availableRAM: 8,
      totalRAM: 16,
      cpuCores: 8,
      diskSpace: 100,
      platform: 'linux',
    }),
    getRoutingRecommendation: vi.fn().mockResolvedValue({
      recommended: {
        task: 'coding',
        hardwareConstraints: { availableRAM: 6, preferredSize: 'medium' },
        preferredBackends: ['huggingface', 'ollama'],
        minimumTrustScore: 7.0,
        allowFallback: true,
        maxCandidates: 5,
      },
      reasoning: 'System has 8GB available RAM, recommending medium models for optimal performance',
      systemInfo: {
        availableRAM: 8,
        totalRAM: 16,
        cpuCores: 8,
        diskSpace: 100,
        platform: 'linux',
      },
    }),
  })),
}));

vi.mock('./unifiedModelManager.js', () => ({
  UnifiedModelManager: vi.fn().mockImplementation(() => ({
    initialize: vi.fn(),
    discoverAllModels: vi.fn().mockResolvedValue([
      {
        name: 'phi-3.5-mini-instruct',
        backend: 'huggingface',
        type: 'phi',
        parameters: '3.8B',
        ramRequirement: '3GB',
        trustScore: 9.5,
        available: true,
        taskSuitability: { coding: 9, reasoning: 7, general: 8, creative: 6 },
      },
      {
        name: 'qwen2.5:1.5b',
        backend: 'ollama',
        type: 'qwen',
        parameters: '1.5B',
        ramRequirement: '2GB',
        trustScore: 8.8,
        available: true,
        taskSuitability: { coding: 6, reasoning: 9, general: 8, creative: 7 },
      },
    ]),
  })),
}));

vi.mock('../config/trustConfig.js', () => ({
  TrustConfiguration: vi.fn().mockImplementation(() => ({
    initialize: vi.fn(),
  })),
}));

describe('SmartRoutingService', () => {
  let service: SmartRoutingService;
  let mockConfig: TrustConfiguration;

  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig = new TrustConfiguration();
    service = new SmartRoutingService(mockConfig);
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      await service.initialize();
      
      expect(mockConfig.initialize).toHaveBeenCalled();
    });
  });

  describe('getSmartDefault', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should return intelligent routing decision by default', async () => {
      const result = await service.getSmartDefault();
      
      expect(result).toMatchObject({
        selectedModel: expect.objectContaining({
          name: 'phi-3.5-mini-instruct',
          backend: 'huggingface',
        }),
        reason: 'intelligent_routing',
        alternatives: expect.any(Array),
        reasoning: expect.stringContaining('Optimized for coding tasks'),
        confidence: expect.any(Number),
      });
      
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should use cached decision when available and valid', async () => {
      // First call to establish cache
      await service.getSmartDefault();
      
      // Second call should use cache
      const result = await service.getSmartDefault();
      
      expect(result.reason).toBe('cached');
      expect(result.reasoning).toContain('cached intelligent routing decision');
    });

    it('should handle task-specific routing', async () => {
      const result = await service.getSmartDefault({
        task: 'reasoning',
        preferredBackends: ['ollama'],
      });
      
      expect(result.selectedModel).toBeDefined();
      expect(result.reason).toBe('intelligent_routing');
    });

    it('should optimize for speed when urgency is high', async () => {
      const result = await service.getSmartDefault({
        urgency: 'high',
      });
      
      expect(result.selectedModel).toBeDefined();
      // High urgency should still work, just with different constraints
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should fallback gracefully when routing fails', async () => {
      // Mock router to throw error
      const mockRouter = service['router'];
      vi.spyOn(mockRouter, 'routeToOptimalModel').mockRejectedValueOnce(new Error('Routing failed'));
      
      const result = await service.getSmartDefault();
      
      expect(result.reason).toBe('fallback');
      expect(result.reasoning).toContain('Routing failed');
      expect(result.confidence).toBeLessThan(0.5);
    });
  });

  describe('getRoutingRecommendation', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should provide comprehensive routing recommendation', async () => {
      const result = await service.getRoutingRecommendation('coding');
      
      expect(result).toMatchObject({
        primary: expect.objectContaining({
          name: 'phi-3.5-mini-instruct',
        }),
        alternatives: expect.any(Array),
        reasoning: expect.stringContaining('System has 8GB available RAM'),
        systemAnalysis: {
          availableRAM: 8,
          recommendedRAM: 6,
          recommendedTask: 'coding',
        },
        confidence: expect.any(Number),
        fallbackStrategy: expect.any(String),
      });
    });

    it('should include system analysis in recommendation', async () => {
      const result = await service.getRoutingRecommendation();
      
      expect(result.systemAnalysis.availableRAM).toBe(8);
      expect(result.systemAnalysis.recommendedRAM).toBe(6);
    });

    it('should provide fallback strategy', async () => {
      const result = await service.getRoutingRecommendation('reasoning');
      
      expect(result.fallbackStrategy).toContain('Fall back to');
    });
  });

  describe('routing confidence', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should calculate routing confidence correctly', async () => {
      const result = await service.getSmartDefault();
      
      // After getting a smart default, confidence should be calculated from the decision
      expect(result.confidence).toBeGreaterThan(0.5);
      
      // The service should report the same confidence
      const reportedConfidence = service.getRoutingConfidence();
      expect(reportedConfidence).toBeGreaterThan(0.5);
    });

    it('should return low confidence when no decision available', () => {
      const confidence = service.getRoutingConfidence();
      expect(confidence).toBe(0.5);
    });
  });

  describe('shouldUseIntelligentRouting', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should always use intelligent routing for explicit user choice', async () => {
      const result = await service.shouldUseIntelligentRouting({
        userExplicitChoice: true,
        systemLoad: 'high',
        complexity: 'simple',
      });
      
      expect(result).toBe(true);
    });

    it('should skip intelligent routing for simple tasks under high load', async () => {
      const result = await service.shouldUseIntelligentRouting({
        systemLoad: 'high',
        complexity: 'simple',
      });
      
      expect(result).toBe(false);
    });

    it('should use intelligent routing for moderate complexity tasks', async () => {
      const result = await service.shouldUseIntelligentRouting({
        complexity: 'moderate',
      });
      
      expect(result).toBe(true);
    });

    it('should use intelligent routing for complex tasks', async () => {
      const result = await service.shouldUseIntelligentRouting({
        complexity: 'complex',
      });
      
      expect(result).toBe(true);
    });

    it('should default to intelligent routing', async () => {
      const result = await service.shouldUseIntelligentRouting();
      
      expect(result).toBe(true);
    });
  });

  describe('transparency features', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should display routing transparency without errors', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      // Get a routing decision first
      await service.getSmartDefault();
      
      // Display transparency for the decision
      const mockDecision = {
        selectedModel: {
          name: 'phi-3.5-mini-instruct',
          backend: 'huggingface',
          type: 'phi',
          parameters: '3.8B',
          ramRequirement: '3GB',
          trustScore: 9.5,
          available: true,
          taskSuitability: { coding: 9, reasoning: 7, general: 8, creative: 6 },
        },
        reasoning: 'Test reasoning',
        alternatives: [],
        step1_consolidation: { totalModels: 4, backendCounts: {}, duration: 10 },
        step2_filtering: { taskFiltered: 0, hardwareFiltered: 1, availabilityFiltered: 1, remaining: 2, duration: 5 },
        step3_selection: {
          scoringMethod: 'weighted_multi_factor',
          topCandidates: [
            {
              model: {
                name: 'phi-3.5-mini-instruct',
                backend: 'huggingface',
                type: 'phi',
                parameters: '3.8B',
                ramRequirement: '3GB',
                trustScore: 9.5,
                available: true,
                taskSuitability: { coding: 9, reasoning: 7, general: 8, creative: 6 },
              },
              score: 0.85,
              breakdown: { trust: 0.38, task_suitability: 0.27, performance: 0.12 },
            },
          ],
          duration: 15,
        },
        step4_routing: { targetBackend: 'huggingface', routingMethod: 'direct_backend_routing', duration: 2 },
        totalDuration: 32,
      };
      
      await service.displayRoutingTransparency(mockDecision as any);
      
      expect(consoleSpy).toHaveBeenCalledWith('\n🔍 Routing Decision Transparency');
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('4-Step Routing Process'));
      
      consoleSpy.mockRestore();
    });
  });

  describe('error handling', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should handle routing errors gracefully', async () => {
      // Mock all dependencies to fail
      const mockRouter = service['router'];
      const mockUnifiedManager = service['unifiedManager'];
      
      vi.spyOn(mockRouter, 'routeToOptimalModel').mockRejectedValue(new Error('Router failed'));
      vi.spyOn(mockUnifiedManager, 'discoverAllModels').mockRejectedValue(new Error('Discovery failed'));
      
      const result = await service.getSmartDefault();
      
      expect(result.reason).toBe('system_default');
      expect(result.selectedModel.name).toBe('system-default');
      expect(result.confidence).toBe(0.1);
    });

    it('should provide meaningful error messages in fallback', async () => {
      const mockRouter = service['router'];
      vi.spyOn(mockRouter, 'routeToOptimalModel').mockRejectedValue(new Error('Specific error message'));
      
      const result = await service.getSmartDefault();
      
      expect(result.reasoning).toContain('Specific error message');
    });
  });

  describe('caching behavior', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should cache routing decisions', async () => {
      const result1 = await service.getSmartDefault();
      expect(result1.reason).toBe('intelligent_routing');
      
      const result2 = await service.getSmartDefault();
      expect(result2.reason).toBe('cached');
    });

    it('should invalidate cache after time', async () => {
      // Get initial decision
      await service.getSmartDefault();
      
      // Mock decision as old
      const mockDecision = service['lastRoutingDecision'];
      if (mockDecision) {
        // Make the decision appear old by setting a very old timestamp
        vi.spyOn(service as any, 'isDecisionStillValid').mockReturnValue(false);
      }
      
      const result = await service.getSmartDefault();
      expect(result.reason).toBe('intelligent_routing'); // Should not use cache
    });
  });
});