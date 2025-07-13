/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export * from './types.js';
export * from './nodeLlamaClient.js';
export * from './modelManager.js';
export * from './unifiedModelManager.js';
export {
  IntelligentModelRouter,
  ModelRoutingDecision,
  RoutingConfig,
} from './intelligentModelRouter.js';
export { RouterSystemResources as SystemResources } from './intelligentModelRouter.js';
export * from './smartRoutingService.js';
export * from './resourceMonitor.js';
export * from './enhancedErrorHandler.js';
export * from './trustContentGenerator.js';
export * from './performanceMonitor.js';
export * from './privacyManager.js';
export * from './chatSession.js';
export * from './contextManager.js';
export * from './gitIntegration.js';
export * from './helpSystem.js';
export * from './benchmarkSystem.js';
export * from './schemaEnforcement.js';
export * from './logitBiasManager.js';
export * from './modelProfiler.js';
export * from './jsonRepairParser.js';
export * from './gbnfFunctionRegistry.js';
export * from './functionCallEvaluator.js';
export * from './ollamaClient.js';
export * from './ollamaToolRegistry.js';
export * from './ollamaContentGenerator.js';
export * from './hardwareOptimizer.js';

// Trust version and metadata
// Trust: An Open System for Modern Assurance
export const TRUST_VERSION = '0.1.0';
export const TRUST_CLI_NAME = 'trust-cli';
export const TRUST_DESCRIPTION =
  'Trust: An Open System for Modern Assurance - Local-first AI CLI built on trust and transparency principles';
