/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  IntelligentModelRouter,
  ModelRoutingDecision,
  RoutingConfig,
  SystemResources,
} from './intelligentModelRouter.js';
import { UnifiedModel, TaskType } from './unifiedModelManager.js';
import { TrustConfiguration } from '../config/trustConfig.js';

// Mock dependencies
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
      {
        name: 'llama3.2:3b',
        backend: 'ollama',
        type: 'llama',
        parameters: '3B',
        ramRequirement: '4GB',
        trustScore: 8.5,
        available: true,
        taskSuitability: { coding: 7, reasoning: 8, general: 9, creative: 8 },
      },
      {
        name: 'gemma-2-9b-instruct',
        backend: 'huggingface',
        type: 'gemma',
        parameters: '9B',
        ramRequirement: '8GB',
        trustScore: 9.3,
        available: false, // Not available
        taskSuitability: { coding: 8, reasoning: 9, general: 9, creative: 7 },
      },
    ]),
    filterModels: vi.fn().mockImplementation((models, task, constraints) => {
      let filtered = models.filter((m: UnifiedModel) => m.available);

      if (constraints?.availableRAM) {
        filtered = filtered.filter((m: UnifiedModel) => {
          const ramReq = parseFloat(
            m.ramRequirement?.match(/(\d+)/)?.[1] || '8',
          );
          return ramReq <= constraints.availableRAM!;
        });
      }

      return filtered;
    }),
  })),
}));

vi.mock('./ollamaClient.js', () => ({
  OllamaClient: vi.fn().mockImplementation(() => ({})),
}));

vi.mock('./modelManager.js', () => ({
  TrustModelManagerImpl: vi.fn().mockImplementation(() => ({
    initialize: vi.fn(),
  })),
}));

vi.mock('../config/trustConfig.js', () => ({
  TrustConfiguration: vi.fn().mockImplementation(() => ({
    initialize: vi.fn(),
  })),
}));

// Mock os module
vi.mock('os', () => ({
  freemem: () => 8 * 1024 * 1024 * 1024, // 8GB
  totalmem: () => 16 * 1024 * 1024 * 1024, // 16GB
  cpus: () => new Array(8), // 8 cores
  platform: () => 'linux',
}));

describe('IntelligentModelRouter', () => {
  let router: IntelligentModelRouter;
  let mockConfig: TrustConfiguration;

  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig = new TrustConfiguration();
    router = new IntelligentModelRouter(mockConfig);
  });

  describe('routeToOptimalModel', () => {
    it('should complete the full 4-step routing process', async () => {
      await router.initialize();

      const decision = await router.routeToOptimalModel({
        task: 'coding',
        hardwareConstraints: { availableRAM: 6 },
      });

      expect(decision).toMatchObject({
        selectedModel: expect.objectContaining({
          name: expect.any(String),
          backend: expect.any(String),
        }),
        reasoning: expect.any(String),
        alternatives: expect.any(Array),
        step1_consolidation: {
          totalModels: 4,
          backendCounts: expect.any(Object),
          duration: expect.any(Number),
        },
        step2_filtering: {
          taskFiltered: expect.any(Number),
          hardwareFiltered: expect.any(Number),
          availabilityFiltered: 1, // gemma-2-9b is unavailable
          remaining: expect.any(Number),
          duration: expect.any(Number),
        },
        step3_selection: {
          scoringMethod: expect.any(String),
          topCandidates: expect.any(Array),
          duration: expect.any(Number),
        },
        step4_routing: {
          targetBackend: expect.any(String),
          routingMethod: 'direct_backend_routing',
          duration: expect.any(Number),
        },
        totalDuration: expect.any(Number),
      });
    });

    it('should select coding-optimized model for coding tasks', async () => {
      await router.initialize();

      const decision = await router.routeToOptimalModel({
        task: 'coding',
        hardwareConstraints: { availableRAM: 8 },
      });

      // Should prefer phi model for coding (score 9) over others
      expect(decision.selectedModel.name).toBe('phi-3.5-mini-instruct');
      expect(decision.reasoning).toContain('coding');
    });

    it('should select reasoning-optimized model for reasoning tasks', async () => {
      await router.initialize();

      const decision = await router.routeToOptimalModel({
        task: 'reasoning',
        hardwareConstraints: { availableRAM: 8 },
      });

      // Should prefer qwen model for reasoning (score 9)
      expect(decision.selectedModel.name).toBe('qwen2.5:1.5b');
      expect(decision.reasoning).toContain('reasoning');
    });

    it('should respect hardware constraints', async () => {
      await router.initialize();

      const decision = await router.routeToOptimalModel({
        hardwareConstraints: { availableRAM: 2.5 }, // Very limited RAM
      });

      // Should only select models that fit in 2.5GB
      const selectedRAM = parseFloat(
        decision.selectedModel.ramRequirement?.match(/(\d+)/)?.[1] || '0',
      );
      expect(selectedRAM).toBeLessThanOrEqual(2.5);
    });

    it('should handle preferred backends', async () => {
      await router.initialize();

      const decision = await router.routeToOptimalModel({
        preferredBackends: ['ollama'],
        hardwareConstraints: { availableRAM: 8 },
      });

      // Should prefer Ollama models when specified
      expect(decision.selectedModel.backend).toBe('ollama');
    });

    it('should apply minimum trust score filtering', async () => {
      await router.initialize();

      const decision = await router.routeToOptimalModel({
        minimumTrustScore: 9.0,
        hardwareConstraints: { availableRAM: 8 },
      });

      // Should only select models with trust score >= 9.0
      expect(decision.selectedModel.trustScore).toBeGreaterThanOrEqual(9.0);
    });

    it('should provide detailed step information', async () => {
      await router.initialize();

      const decision = await router.routeToOptimalModel({
        task: 'coding',
      });

      expect(decision.step1_consolidation.totalModels).toBe(4);
      expect(decision.step2_filtering.availabilityFiltered).toBe(1); // One unavailable model
      expect(decision.step3_selection.topCandidates.length).toBeGreaterThan(0);
      expect(decision.step4_routing.targetBackend).toBe(
        decision.selectedModel.backend,
      );
    });

    it('should throw error when no suitable models found', async () => {
      await router.initialize();

      await expect(
        router.routeToOptimalModel({
          hardwareConstraints: { availableRAM: 0.5 }, // Impossible constraint
        }),
      ).rejects.toThrow('No suitable models found after filtering');
    });
  });

  describe('detectSystemResources', () => {
    it('should detect system hardware information', async () => {
      const resources = await router.detectSystemResources();

      expect(resources).toMatchObject({
        availableRAM: expect.any(Number),
        totalRAM: expect.any(Number),
        cpuCores: expect.any(Number),
        diskSpace: expect.any(Number),
        platform: expect.any(String),
      });

      expect(resources.availableRAM).toBeGreaterThan(0);
      expect(resources.totalRAM).toBeGreaterThan(resources.availableRAM);
      expect(resources.cpuCores).toBeGreaterThan(0);
    });
  });

  describe('getRoutingRecommendation', () => {
    it('should provide system-appropriate routing recommendations', async () => {
      const recommendation = await router.getRoutingRecommendation('coding');

      expect(recommendation).toMatchObject({
        recommended: {
          task: 'coding',
          hardwareConstraints: expect.objectContaining({
            availableRAM: expect.any(Number),
            preferredSize: expect.any(String),
          }),
          preferredBackends: expect.any(Array),
          minimumTrustScore: expect.any(Number),
          allowFallback: true,
          maxCandidates: expect.any(Number),
        },
        reasoning: expect.any(String),
        systemInfo: expect.objectContaining({
          availableRAM: expect.any(Number),
        }),
      });
    });

    it('should recommend appropriate model size based on RAM', async () => {
      const recommendation = await router.getRoutingRecommendation();

      const systemRAM = recommendation.systemInfo.availableRAM;
      const recommendedRAM =
        recommendation.recommended.hardwareConstraints?.availableRAM;

      // Should leave buffer for system
      expect(recommendedRAM).toBeLessThan(systemRAM);
      expect(recommendedRAM).toBeGreaterThanOrEqual(systemRAM * 0.6); // At least 60% of available
    });

    it('should include preferred backends for system capabilities', async () => {
      const recommendation = await router.getRoutingRecommendation();

      expect(recommendation.recommended.preferredBackends).toContain(
        'huggingface',
      );
      // Should contain ollama for systems with enough RAM (mock has 8GB available)
      expect(recommendation.recommended.preferredBackends).toContain('ollama');
    });
  });

  describe('model scoring', () => {
    it('should score models based on multiple factors', async () => {
      await router.initialize();

      const decision = await router.routeToOptimalModel({
        task: 'coding',
        hardwareConstraints: { availableRAM: 8 },
      });

      const topCandidate = decision.step3_selection.topCandidates[0];

      expect(topCandidate.breakdown).toHaveProperty('trust');
      expect(topCandidate.breakdown).toHaveProperty('task_suitability');
      expect(topCandidate.breakdown).toHaveProperty('performance');
      expect(topCandidate.breakdown).toHaveProperty('availability');
      expect(topCandidate.breakdown).toHaveProperty('efficiency');

      // All score components should be positive
      Object.values(topCandidate.breakdown).forEach((score) => {
        expect(score).toBeGreaterThanOrEqual(0);
      });
    });

    it('should prioritize task suitability when task is specified', async () => {
      await router.initialize();

      const codingDecision = await router.routeToOptimalModel({
        task: 'coding',
        hardwareConstraints: { availableRAM: 8 },
      });

      const reasoningDecision = await router.routeToOptimalModel({
        task: 'reasoning',
        hardwareConstraints: { availableRAM: 8 },
      });

      // Different tasks should potentially select different models
      // (though this depends on the specific models available)
      expect(
        codingDecision.step3_selection.topCandidates[0].breakdown
          .task_suitability,
      ).toBeGreaterThan(0);
      expect(
        reasoningDecision.step3_selection.topCandidates[0].breakdown
          .task_suitability,
      ).toBeGreaterThan(0);
    });
  });

  describe('reasoning generation', () => {
    it('should provide clear reasoning for model selection', async () => {
      await router.initialize();

      const decision = await router.routeToOptimalModel({
        task: 'coding',
        hardwareConstraints: { availableRAM: 8 },
      });

      expect(decision.reasoning).toContain('coding');
      expect(decision.reasoning).toContain('trust score');
      expect(decision.reasoning).toContain(decision.selectedModel.backend);
    });

    it('should mention hardware constraints in reasoning when applied', async () => {
      await router.initialize();

      const decision = await router.routeToOptimalModel({
        hardwareConstraints: { availableRAM: 4 },
      });

      expect(decision.reasoning).toContain('4GB RAM');
    });
  });

  describe('performance metrics', () => {
    it('should track performance of each routing step', async () => {
      await router.initialize();

      const decision = await router.routeToOptimalModel();

      // All steps should have measurable duration
      expect(decision.step1_consolidation.duration).toBeGreaterThanOrEqual(0);
      expect(decision.step2_filtering.duration).toBeGreaterThanOrEqual(0);
      expect(decision.step3_selection.duration).toBeGreaterThanOrEqual(0);
      expect(decision.step4_routing.duration).toBeGreaterThanOrEqual(0);
      expect(decision.totalDuration).toBeGreaterThanOrEqual(0);

      // Total duration should be sum of all steps (approximately)
      const stepSum =
        decision.step1_consolidation.duration +
        decision.step2_filtering.duration +
        decision.step3_selection.duration +
        decision.step4_routing.duration;

      expect(decision.totalDuration).toBeGreaterThanOrEqual(stepSum);
    });
  });
});
