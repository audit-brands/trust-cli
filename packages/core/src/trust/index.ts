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
export { 
  PerformanceBenchmark,
  type BenchmarkTest,
  type BenchmarkResult,
  type BenchmarkSuite,
  type BenchmarkReport,
  type ModelBenchmarkSummary
} from './performanceBenchmark.js';
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
export * from './universalToolInterface.js';
export { ToolExecutionEngine, ToolExecutionContext } from './toolExecutionEngine.js';
export { ModelSelector, TaskContext } from './modelSelector.js';
export { InteractiveModelSelector } from './interactiveModelSelector.js';
export { ProviderAutoDetection, ProviderCapability, AutoDetectionResult } from './providerAutoDetection.js';
export { ProviderConfigManager, ProviderConfig, BackendConfiguration } from './providerConfigManager.js';
export { 
  UnifiedModelInterface, 
  BaseUnifiedModel, 
  UnifiedModelRegistry, 
  UnifiedModelFactory,
  ModelCapabilities,
  GenerationOptions,
  GenerationResult,
  ContextOptions,
  ModelContext,
  ModelHealth,
  ModelInterfaceUtils,
  globalModelRegistry
} from './unifiedModelInterface.js';
export { OllamaModelAdapter } from './adapters/ollamaModelAdapter.js';
export { HuggingFaceModelAdapter } from './adapters/huggingfaceModelAdapter.js';
export { CloudModelAdapter, CloudProviderConfig } from './adapters/cloudModelAdapter.js';
export { EnhancedUnifiedModelManager } from './unifiedModelManager.js';
export { ReliableJsonGenerator, JsonGenerationOptions, JsonGenerationResult, ModelJsonPerformance, globalJsonGenerator } from './reliableJsonGenerator.js';
export { EnhancedFunctionCalling, FunctionCallingConfig, FunctionCallingResult, globalFunctionCalling } from './enhancedFunctionCalling.js';
export { FunctionCallingCoordinator, FunctionCallingMetrics, ModelFunctionCallingStats, globalFunctionCallingCoordinator } from './functionCallingCoordinator.js';

// Streaming Performance Optimization
export { StreamingIntegrationHelpers } from './streamingBufferManager.js';

// Context Management
export { 
  SmartContextManager,
  ContextManagerFactory,
  type ContextManagementConfig,
  type ContextMetrics,
  type EnhancedMessage,
  type CompressionResult
} from './smartContextManager.js';

// Error Recovery System
export {
  ErrorRecoverySystem,
  globalErrorRecovery,
  type ErrorSeverity,
  type ErrorCategory,
  type RecoveryAction,
  type ErrorContext,
  type RecoveryStrategy,
  type RecoveryResult,
  type RecoveryMetrics
} from './errorRecoverySystem.js';

export {
  withRecovery,
  withClassRecovery,
  executeWithRecovery,
  executeWithRecoveryResult,
  ErrorRecoveryMixin,
  withRecoveryWrapper,
  retryOnError,
  withTimeout,
  withFallback,
  withCircuitBreaker,
  type RecoveryDecoratorOptions
} from './errorRecoveryDecorators.js';

// Ollama Tool Provider
export {
  OllamaToolProvider,
  createOllamaToolProvider,
  defaultOllamaToolProvider,
  type OllamaToolConfig,
  type OllamaToolFormat
} from './ollamaToolProvider.js';

// Cloud Tool Provider
export {
  CloudToolProvider,
  createCloudToolProvider,
  createOpenAIToolProvider,
  createAnthropicToolProvider,
  createGeminiToolProvider,
  createVertexAIToolProvider,
  type CloudProvider,
  type CloudToolConfig,
  type CloudToolFormat
} from './cloudToolProvider.js';

// Provider Transformers
export {
  ProviderTransformers,
  ProviderTransformationUtils,
  BatchTransformer,
  type ProviderFormats,
  type TransformationContext
} from './providerTransformers.js';

// Trust version and metadata
// Trust: An Open System for Modern Assurance
export const TRUST_VERSION = '0.1.0';
export const TRUST_CLI_NAME = 'trust-cli';
export const TRUST_DESCRIPTION =
  'Trust: An Open System for Modern Assurance - Local-first AI CLI built on trust and transparency principles';
