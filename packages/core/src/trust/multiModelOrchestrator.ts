/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { UniversalToolCall, UniversalToolDefinition, UniversalToolResult } from './universalToolInterface.js';
import { EnhancedUnifiedModelManager } from './unifiedModelManager.js';
import { IntelligentModelRouter, ModelRoutingDecision } from './intelligentModelRouter.js';
import { ToolExecutionEngine, ToolExecutionContext, ToolExecutionResult } from './toolExecutionEngine.js';
import { executeWithRecovery } from './errorRecoveryDecorators.js';
import { UnifiedModelInterface, GenerationOptions, GenerationResult } from './unifiedModelInterface.js';

/**
 * Model capability scoring for tool types
 */
export interface ModelCapabilityScore {
  modelName: string;
  score: number;
  reasoning: string;
  estimatedPerformance: {
    speed: number;    // 1-10 scale
    accuracy: number; // 1-10 scale
    efficiency: number; // 1-10 scale
  };
}

/**
 * Tool execution strategy definition
 */
export type ExecutionStrategy = 
  | 'single_model'       // One model handles all tools
  | 'specialized'        // Route tools to specialized models
  | 'consensus'          // Multiple models vote on tool results
  | 'pipeline'           // Sequential model pipeline
  | 'review_validate'    // One generates, another reviews
  | 'load_balance';      // Distribute across available models

/**
 * Multi-model workflow definition
 */
export interface MultiModelWorkflow {
  id: string;
  name: string;
  description: string;
  strategy: ExecutionStrategy;
  steps: WorkflowStep[];
  metadata?: Record<string, any>;
}

/**
 * Individual workflow step
 */
export interface WorkflowStep {
  id: string;
  name: string;
  type: 'tool_execution' | 'model_generation' | 'validation' | 'aggregation';
  modelSelectionCriteria?: ModelSelectionCriteria;
  dependencies?: string[]; // Step IDs this step depends on
  tools?: UniversalToolDefinition[];
  prompt?: string;
  options?: GenerationOptions;
  validationRules?: ValidationRule[];
}

/**
 * Model selection criteria for workflow steps
 */
export interface ModelSelectionCriteria {
  preferredModels?: string[];
  excludedModels?: string[];
  requiredCapabilities?: string[];
  minPerformanceScore?: number;
  maxLatency?: number;
  taskType?: 'coding' | 'reasoning' | 'creative' | 'analysis' | 'speed';
}

/**
 * Validation rules for workflow steps
 */
export interface ValidationRule {
  type: 'format' | 'content' | 'schema' | 'consensus';
  criteria: any;
  threshold?: number;
}

/**
 * Multi-model execution result
 */
export interface MultiModelExecutionResult {
  workflowId: string;
  success: boolean;
  results: Map<string, any>; // Step ID to result mapping
  modelPerformance: Map<string, ModelPerformanceMetrics>;
  executionTime: number;
  totalCost?: number;
  error?: string;
  warnings?: string[];
}

/**
 * Model performance metrics during execution
 */
export interface ModelPerformanceMetrics {
  modelName: string;
  tasksExecuted: number;
  averageLatency: number;
  successRate: number;
  totalTokens: number;
  errors: string[];
}

/**
 * Context shared between models in a workflow
 */
export interface SharedWorkflowContext {
  workflowId: string;
  currentStep: string;
  sharedMemory: Map<string, any>;
  previousResults: Map<string, any>;
  summary: string;
  metadata: Record<string, any>;
}

/**
 * Multi-model tool execution orchestrator
 */
export class MultiModelOrchestrator {
  private modelManager: EnhancedUnifiedModelManager;
  private router: IntelligentModelRouter;
  private toolExecutor: ToolExecutionEngine;
  private activeWorkflows: Map<string, MultiModelWorkflow> = new Map();
  private workflowRegistry: Map<string, MultiModelWorkflow> = new Map();
  private executionHistory: Map<string, MultiModelExecutionResult> = new Map();

  constructor(
    modelManager: EnhancedUnifiedModelManager,
    router: IntelligentModelRouter,
    toolExecutor: ToolExecutionEngine
  ) {
    this.modelManager = modelManager;
    this.router = router;
    this.toolExecutor = toolExecutor;
    
    this.initializeBuiltinWorkflows();
  }

  /**
   * Register a multi-model workflow
   */
  registerWorkflow(workflow: MultiModelWorkflow): void {
    this.workflowRegistry.set(workflow.id, workflow);
  }

  /**
   * Execute a multi-model workflow
   */
  async executeWorkflow(
    workflowId: string,
    initialContext: Partial<SharedWorkflowContext>,
    executionContext: ToolExecutionContext
  ): Promise<MultiModelExecutionResult> {
    const workflow = this.workflowRegistry.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    return executeWithRecovery(
      async () => this._executeWorkflowInternal(workflow, initialContext, executionContext),
      {
        operationName: `multiModel.workflow.${workflowId}`,
        category: 'tool_execution',
        enableCircuitBreaker: true,
        customStrategy: {
          maxRetries: 2,
          baseDelay: 1000,
          fallbackOptions: ['single_model_fallback', 'simplified_workflow']
        }
      }
    );
  }

  private async _executeWorkflowInternal(
    workflow: MultiModelWorkflow,
    initialContext: Partial<SharedWorkflowContext>,
    executionContext: ToolExecutionContext
  ): Promise<MultiModelExecutionResult> {
    const startTime = Date.now();
    const sharedContext: SharedWorkflowContext = {
      workflowId: workflow.id,
      currentStep: '',
      sharedMemory: new Map(),
      previousResults: new Map(),
      summary: '',
      metadata: {},
      ...initialContext
    };

    const results = new Map<string, any>();
    const modelPerformance = new Map<string, ModelPerformanceMetrics>();
    const warnings: string[] = [];

    try {
      this.activeWorkflows.set(workflow.id, workflow);

      // Execute workflow based on strategy
      switch (workflow.strategy) {
        case 'single_model':
          await this.executeSingleModelStrategy(workflow, sharedContext, executionContext, results);
          break;
        case 'specialized':
          await this.executeSpecializedStrategy(workflow, sharedContext, executionContext, results);
          break;
        case 'consensus':
          await this.executeConsensusStrategy(workflow, sharedContext, executionContext, results);
          break;
        case 'pipeline':
          await this.executePipelineStrategy(workflow, sharedContext, executionContext, results);
          break;
        case 'review_validate':
          await this.executeReviewValidateStrategy(workflow, sharedContext, executionContext, results);
          break;
        case 'load_balance':
          await this.executeLoadBalanceStrategy(workflow, sharedContext, executionContext, results);
          break;
        default:
          throw new Error(`Unsupported workflow strategy: ${workflow.strategy}`);
      }

      const executionTime = Date.now() - startTime;

      const executionResult: MultiModelExecutionResult = {
        workflowId: workflow.id,
        success: true,
        results,
        modelPerformance,
        executionTime,
        warnings
      };

      this.executionHistory.set(workflow.id, executionResult);
      return executionResult;

    } catch (error) {
      const executionTime = Date.now() - startTime;
      
      const executionResult: MultiModelExecutionResult = {
        workflowId: workflow.id,
        success: false,
        results,
        modelPerformance,
        executionTime,
        error: error instanceof Error ? error.message : String(error),
        warnings
      };

      this.executionHistory.set(workflow.id, executionResult);
      return executionResult;

    } finally {
      this.activeWorkflows.delete(workflow.id);
    }
  }

  /**
   * Single model strategy - one model handles everything
   */
  private async executeSingleModelStrategy(
    workflow: MultiModelWorkflow,
    context: SharedWorkflowContext,
    executionContext: ToolExecutionContext,
    results: Map<string, any>
  ): Promise<void> {
    // Select the best overall model for the workflow
    const modelDecision = await this.router.routeToOptimalModel({
      task: 'general' as any
    });

    const model = await this.modelManager.getModel(modelDecision.selectedModel.name);
    if (!model) {
      throw new Error(`Model ${modelDecision.selectedModel} not available`);
    }

    // Execute all steps with the same model
    for (const step of workflow.steps) {
      context.currentStep = step.id;
      
      const stepResult = await this.executeStep(step, model, context, executionContext);
      results.set(step.id, stepResult);
      context.previousResults.set(step.id, stepResult);
    }
  }

  /**
   * Specialized strategy - route tools to best specialized models
   */
  private async executeSpecializedStrategy(
    workflow: MultiModelWorkflow,
    context: SharedWorkflowContext,
    executionContext: ToolExecutionContext,
    results: Map<string, any>
  ): Promise<void> {
    for (const step of workflow.steps) {
      context.currentStep = step.id;
      
      // Select specialized model for this step
      const model = await this.selectModelForStep(step);
      
      const stepResult = await this.executeStep(step, model, context, executionContext);
      results.set(step.id, stepResult);
      context.previousResults.set(step.id, stepResult);
      
      // Update shared context with key insights
      this.updateSharedContext(context, step, stepResult);
    }
  }

  /**
   * Consensus strategy - multiple models provide input, coordinator decides
   */
  private async executeConsensusStrategy(
    workflow: MultiModelWorkflow,
    context: SharedWorkflowContext,
    executionContext: ToolExecutionContext,
    results: Map<string, any>
  ): Promise<void> {
    for (const step of workflow.steps) {
      context.currentStep = step.id;
      
      // Get multiple model opinions
      const models = await this.getTopModelsForStep(step, 3);
      const modelResults: Array<{ model: string; result: any }> = [];
      
      for (const model of models) {
        try {
          const stepResult = await this.executeStep(step, model, context, executionContext);
          modelResults.push({ model: model.name, result: stepResult });
        } catch (error) {
          console.warn(`Model ${model.name} failed on step ${step.id}:`, error);
        }
      }
      
      // Aggregate results using consensus
      const consensusResult = await this.buildConsensus(modelResults, step);
      results.set(step.id, consensusResult);
      context.previousResults.set(step.id, consensusResult);
    }
  }

  /**
   * Pipeline strategy - sequential model processing
   */
  private async executePipelineStrategy(
    workflow: MultiModelWorkflow,
    context: SharedWorkflowContext,
    executionContext: ToolExecutionContext,
    results: Map<string, any>
  ): Promise<void> {
    // Build dependency graph
    const dependencyGraph = this.buildDependencyGraph(workflow.steps);
    const executionOrder = this.topologicalSort(dependencyGraph);
    
    for (const stepId of executionOrder) {
      const step = workflow.steps.find(s => s.id === stepId);
      if (!step) continue;
      
      context.currentStep = step.id;
      
      // Wait for dependencies
      await this.waitForDependencies(step, results);
      
      // Select model for this step
      const model = await this.selectModelForStep(step);
      
      // Execute step with context from previous steps
      const enhancedContext = this.enrichStepContext(step, context);
      const stepResult = await this.executeStep(step, model, enhancedContext, executionContext);
      
      results.set(step.id, stepResult);
      context.previousResults.set(step.id, stepResult);
    }
  }

  /**
   * Review and validate strategy - one generates, another reviews
   */
  private async executeReviewValidateStrategy(
    workflow: MultiModelWorkflow,
    context: SharedWorkflowContext,
    executionContext: ToolExecutionContext,
    results: Map<string, any>
  ): Promise<void> {
    for (const step of workflow.steps) {
      context.currentStep = step.id;
      
      // Generator model
      const generatorModel = await this.selectModelForStep(step);
      const initialResult = await this.executeStep(step, generatorModel, context, executionContext);
      
      // Reviewer model (different from generator)
      const reviewerModel = await this.selectReviewerModel(generatorModel.name, step);
      const reviewResult = await this.reviewStepResult(step, initialResult, reviewerModel, context);
      
      // Combine generation and review
      const finalResult = await this.combineGenerationAndReview(initialResult, reviewResult);
      
      results.set(step.id, finalResult);
      context.previousResults.set(step.id, finalResult);
    }
  }

  /**
   * Load balance strategy - distribute across available models
   */
  private async executeLoadBalanceStrategy(
    workflow: MultiModelWorkflow,
    context: SharedWorkflowContext,
    executionContext: ToolExecutionContext,
    results: Map<string, any>
  ): Promise<void> {
    const availableModels = await this.getAvailableModels();
    let currentModelIndex = 0;
    
    for (const step of workflow.steps) {
      context.currentStep = step.id;
      
      // Round-robin model selection with capability checking
      let model: UnifiedModelInterface;
      let attempts = 0;
      
      do {
        model = availableModels[currentModelIndex % availableModels.length];
        currentModelIndex++;
        attempts++;
        
        if (attempts > availableModels.length) {
          throw new Error(`No suitable model found for step ${step.id}`);
        }
      } while (!await this.isModelSuitableForStep(model, step));
      
      const stepResult = await this.executeStep(step, model, context, executionContext);
      results.set(step.id, stepResult);
      context.previousResults.set(step.id, stepResult);
    }
  }

  /**
   * Execute a single workflow step
   */
  private async executeStep(
    step: WorkflowStep,
    model: UnifiedModelInterface,
    context: SharedWorkflowContext,
    executionContext: ToolExecutionContext
  ): Promise<any> {
    switch (step.type) {
      case 'tool_execution':
        return await this.executeToolStep(step, model, context, executionContext);
      case 'model_generation':
        return await this.executeGenerationStep(step, model, context);
      case 'validation':
        return await this.executeValidationStep(step, model, context);
      case 'aggregation':
        return await this.executeAggregationStep(step, context);
      default:
        throw new Error(`Unsupported step type: ${step.type}`);
    }
  }

  /**
   * Execute tool execution step
   */
  private async executeToolStep(
    step: WorkflowStep,
    model: UnifiedModelInterface,
    context: SharedWorkflowContext,
    executionContext: ToolExecutionContext
  ): Promise<any> {
    if (!step.tools || step.tools.length === 0) {
      throw new Error(`Tool execution step ${step.id} has no tools defined`);
    }

    const results: Record<string, any> = {};
    
    for (const tool of step.tools) {
      // Generate tool usage prompt
      const toolPrompt = this.generateToolPrompt(tool, context);
      
      // Create a mock tool call for the tool definition
      const toolCall: UniversalToolCall = {
        id: `step_${step.id}_tool_${tool.name}`,
        name: tool.name,
        arguments: {},
        description: tool.description
      };

      // Execute with model
      const generationResult = await model.generateWithTools(
        toolPrompt,
        [toolCall],
        step.options
      );
      
      if (generationResult.toolCalls && generationResult.toolCalls.length > 0) {
        // Execute the actual tool
        for (const toolCall of generationResult.toolCalls) {
          const toolResult = await this.toolExecutor.executeToolCall(
            {
              name: toolCall.name,
              arguments: toolCall.arguments
            } as any,
            executionContext
          );
          
          results[toolCall.name] = toolResult;
        }
      }
    }
    
    return results;
  }

  /**
   * Execute model generation step
   */
  private async executeGenerationStep(
    step: WorkflowStep,
    model: UnifiedModelInterface,
    context: SharedWorkflowContext
  ): Promise<string> {
    if (!step.prompt) {
      throw new Error(`Generation step ${step.id} has no prompt defined`);
    }

    const enhancedPrompt = this.enhancePromptWithContext(step.prompt, context);
    return await model.generateText(enhancedPrompt, step.options);
  }

  /**
   * Execute validation step
   */
  private async executeValidationStep(
    step: WorkflowStep,
    model: UnifiedModelInterface,
    context: SharedWorkflowContext
  ): Promise<{ valid: boolean; feedback?: string }> {
    if (!step.validationRules) {
      return { valid: true };
    }

    const results = context.previousResults;
    const validationPrompt = this.generateValidationPrompt(step, results);
    
    const validationResponse = await model.generateText(validationPrompt, {
      temperature: 0.3,
      maxTokens: 200
    });

    return this.parseValidationResponse(validationResponse);
  }

  /**
   * Execute aggregation step
   */
  private async executeAggregationStep(
    step: WorkflowStep,
    context: SharedWorkflowContext
  ): Promise<any> {
    // Aggregate results from previous steps
    const dependencyResults = step.dependencies?.map(depId => 
      context.previousResults.get(depId)
    ).filter(Boolean) || [];

    return {
      aggregatedResults: dependencyResults,
      summary: this.generateSummary(dependencyResults),
      metadata: {
        totalSteps: dependencyResults.length,
        timestamp: new Date().toISOString()
      }
    };
  }

  /**
   * Select the best model for a specific step
   */
  private async selectModelForStep(step: WorkflowStep): Promise<UnifiedModelInterface> {
    const criteria = step.modelSelectionCriteria;
    
    if (criteria?.preferredModels && criteria.preferredModels.length > 0) {
      for (const modelName of criteria.preferredModels) {
        const model = await this.modelManager.getModel(modelName);
        if (model && await this.isModelSuitableForStep(model, step)) {
          return model;
        }
      }
    }

    // Use intelligent router for general selection
    const routingDecision = await this.router.routeToOptimalModel({
      task: criteria?.taskType as any || 'general'
    });

    const model = await this.modelManager.getModel(routingDecision.selectedModel.name);
    if (!model) {
      throw new Error(`Selected model ${routingDecision.selectedModel} not available`);
    }

    return model;
  }

  /**
   * Initialize built-in workflows
   */
  private initializeBuiltinWorkflows(): void {
    // Code Analysis and Review Workflow
    this.registerWorkflow({
      id: 'code_analysis_review',
      name: 'Code Analysis and Review',
      description: 'Analyze code with one model and review with another',
      strategy: 'review_validate',
      steps: [
        {
          id: 'analyze_code',
          name: 'Code Analysis',
          type: 'model_generation',
          modelSelectionCriteria: { taskType: 'coding' },
          prompt: 'Analyze the provided code for potential issues, improvements, and documentation needs.',
          options: { temperature: 0.3, maxTokens: 500 }
        },
        {
          id: 'review_analysis',
          name: 'Review Analysis',
          type: 'validation',
          validationRules: [{ type: 'content', criteria: 'technical_accuracy' }]
        }
      ]
    });

    // Multi-Step Research Workflow
    this.registerWorkflow({
      id: 'research_synthesis',
      name: 'Research and Synthesis',
      description: 'Gather information with multiple models and synthesize findings',
      strategy: 'consensus',
      steps: [
        {
          id: 'gather_info',
          name: 'Information Gathering',
          type: 'tool_execution',
          tools: [
            {
              name: 'web_search',
              description: 'Search for information online',
              parameters: {
                type: 'object',
                properties: {
                  query: { type: 'string' },
                  num_results: { type: 'number' }
                },
                required: ['query']
              }
            }
          ]
        },
        {
          id: 'synthesize',
          name: 'Synthesize Findings',
          type: 'aggregation',
          dependencies: ['gather_info']
        }
      ]
    });

    // Creative Writing Pipeline
    this.registerWorkflow({
      id: 'creative_writing_pipeline',
      name: 'Creative Writing Pipeline',
      description: 'Brainstorm, draft, and refine creative content',
      strategy: 'pipeline',
      steps: [
        {
          id: 'brainstorm',
          name: 'Brainstorming',
          type: 'model_generation',
          modelSelectionCriteria: { taskType: 'creative' },
          prompt: 'Generate creative ideas and concepts for the requested content.',
          options: { temperature: 0.8, maxTokens: 300 }
        },
        {
          id: 'draft',
          name: 'First Draft',
          type: 'model_generation',
          dependencies: ['brainstorm'],
          prompt: 'Create a first draft based on the brainstormed ideas.',
          options: { temperature: 0.7, maxTokens: 600 }
        },
        {
          id: 'refine',
          name: 'Refinement',
          type: 'model_generation',
          dependencies: ['draft'],
          prompt: 'Refine and improve the draft for clarity and impact.',
          options: { temperature: 0.5, maxTokens: 400 }
        }
      ]
    });
  }

  // Helper methods implementation would continue here...
  private buildDependencyGraph(steps: WorkflowStep[]): Map<string, string[]> {
    const graph = new Map<string, string[]>();
    for (const step of steps) {
      graph.set(step.id, step.dependencies || []);
    }
    return graph;
  }

  private topologicalSort(graph: Map<string, string[]>): string[] {
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const result: string[] = [];

    const visit = (node: string) => {
      if (visiting.has(node)) {
        throw new Error(`Circular dependency detected involving ${node}`);
      }
      if (visited.has(node)) return;

      visiting.add(node);
      const dependencies = graph.get(node) || [];
      for (const dep of dependencies) {
        visit(dep);
      }
      visiting.delete(node);
      visited.add(node);
      result.push(node);
    };

    for (const node of graph.keys()) {
      visit(node);
    }

    return result;
  }

  private async waitForDependencies(step: WorkflowStep, results: Map<string, any>): Promise<void> {
    if (!step.dependencies) return;
    
    for (const depId of step.dependencies) {
      while (!results.has(depId)) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  }

  private enrichStepContext(step: WorkflowStep, context: SharedWorkflowContext): SharedWorkflowContext {
    const enriched = { ...context };
    
    if (step.dependencies) {
      enriched.summary = this.generateContextSummary(step.dependencies, context.previousResults);
    }
    
    return enriched;
  }

  private generateContextSummary(dependencies: string[], results: Map<string, any>): string {
    const summaryParts: string[] = [];
    
    for (const depId of dependencies) {
      const result = results.get(depId);
      if (result) {
        summaryParts.push(`${depId}: ${JSON.stringify(result).substring(0, 100)}...`);
      }
    }
    
    return summaryParts.join('\n');
  }

  private async getTopModelsForStep(step: WorkflowStep, count: number): Promise<UnifiedModelInterface[]> {
    const allModels = await this.getAvailableModels();
    const scoredModels: Array<{ model: UnifiedModelInterface; score: number }> = [];
    
    for (const model of allModels) {
      if (await this.isModelSuitableForStep(model, step)) {
        const score = await this.scoreModelForStep(model, step);
        scoredModels.push({ model, score });
      }
    }
    
    scoredModels.sort((a, b) => b.score - a.score);
    return scoredModels.slice(0, count).map(sm => sm.model);
  }

  private async buildConsensus(
    modelResults: Array<{ model: string; result: any }>,
    step: WorkflowStep
  ): Promise<any> {
    if (modelResults.length === 0) {
      throw new Error('No model results to build consensus from');
    }
    
    if (modelResults.length === 1) {
      return modelResults[0].result;
    }
    
    // Simple majority consensus for now
    const resultCounts = new Map<string, number>();
    
    for (const { result } of modelResults) {
      const resultStr = JSON.stringify(result);
      resultCounts.set(resultStr, (resultCounts.get(resultStr) || 0) + 1);
    }
    
    let maxCount = 0;
    let consensusResult = modelResults[0].result;
    
    for (const [resultStr, count] of resultCounts) {
      if (count > maxCount) {
        maxCount = count;
        consensusResult = JSON.parse(resultStr);
      }
    }
    
    return consensusResult;
  }

  private async selectReviewerModel(generatorModelName: string, step: WorkflowStep): Promise<UnifiedModelInterface> {
    const availableModels = await this.getAvailableModels();
    
    // Select a different model from the generator
    for (const model of availableModels) {
      if (model.name !== generatorModelName && await this.isModelSuitableForStep(model, step)) {
        return model;
      }
    }
    
    // Fallback to any available model
    const fallbackModel = availableModels[0];
    if (!fallbackModel) {
      throw new Error('No reviewer model available');
    }
    
    return fallbackModel;
  }

  private async reviewStepResult(
    step: WorkflowStep,
    result: any,
    reviewerModel: UnifiedModelInterface,
    context: SharedWorkflowContext
  ): Promise<{ score: number; feedback: string; approved: boolean }> {
    const reviewPrompt = `Please review the following result from step "${step.name}":

Result: ${JSON.stringify(result, null, 2)}

Provide a review with:
1. A quality score from 1-10
2. Specific feedback on accuracy and completeness
3. Whether you approve this result (yes/no)

Format your response as JSON with fields: score, feedback, approved`;

    const reviewResponse = await reviewerModel.generateText(reviewPrompt, {
      temperature: 0.3,
      maxTokens: 300
    });

    try {
      return JSON.parse(reviewResponse);
    } catch {
      return {
        score: 5,
        feedback: 'Unable to parse review response',
        approved: true
      };
    }
  }

  private async combineGenerationAndReview(
    generation: any,
    review: { score: number; feedback: string; approved: boolean }
  ): Promise<any> {
    return {
      result: generation,
      review,
      quality: review.score,
      validated: review.approved
    };
  }

  private async getAvailableModels(): Promise<UnifiedModelInterface[]> {
    const allModels = await this.modelManager.listAllModels();
    const models: UnifiedModelInterface[] = [];
    
    for (const unifiedModel of allModels) {
      const model = await this.modelManager.getModel(unifiedModel.name);
      if (model) {
        models.push(model);
      }
    }
    
    return models;
  }

  private async isModelSuitableForStep(model: UnifiedModelInterface, step: WorkflowStep): Promise<boolean> {
    const criteria = step.modelSelectionCriteria;
    
    if (criteria?.excludedModels?.includes(model.name)) {
      return false;
    }
    
    if (criteria?.requiredCapabilities) {
      const capabilities = model.getCapabilities();
      for (const capability of criteria.requiredCapabilities) {
        if (!this.hasCapability(capabilities, capability)) {
          return false;
        }
      }
    }
    
    return true;
  }

  private hasCapability(capabilities: any, capability: string): boolean {
    switch (capability) {
      case 'tool_calling':
        return capabilities.supportsToolCalling;
      case 'streaming':
        return capabilities.supportsStreaming;
      case 'image_input':
        return capabilities.supportsImageInput;
      default:
        return true;
    }
  }

  private async scoreModelForStep(model: UnifiedModelInterface, step: WorkflowStep): Promise<number> {
    let score = 5; // Base score
    
    const capabilities = model.getCapabilities();
    const criteria = step.modelSelectionCriteria;
    
    // Score based on task type preference
    if (criteria?.taskType) {
      score += this.getTaskTypeScore(model.name, criteria.taskType);
    }
    
    // Score based on capabilities
    if (step.type === 'tool_execution' && capabilities.supportsToolCalling) {
      score += 2;
    }
    
    if (criteria?.minPerformanceScore) {
      score = Math.max(score, criteria.minPerformanceScore);
    }
    
    return Math.min(score, 10);
  }

  private getTaskTypeScore(modelName: string, taskType: string): number {
    // Simple heuristic scoring - in reality would use performance data
    const lowercaseName = modelName.toLowerCase();
    
    switch (taskType) {
      case 'coding':
        if (lowercaseName.includes('code') || lowercaseName.includes('coder')) return 3;
        return 0;
      case 'creative':
        if (lowercaseName.includes('creative') || lowercaseName.includes('claude')) return 2;
        return 0;
      case 'reasoning':
        if (lowercaseName.includes('reasoning') || lowercaseName.includes('gpt')) return 2;
        return 0;
      case 'speed':
        if (lowercaseName.includes('mini') || lowercaseName.includes('fast')) return 3;
        return 0;
      default:
        return 1;
    }
  }

  private generateToolPrompt(tool: UniversalToolDefinition, context: SharedWorkflowContext): string {
    const contextSummary = context.summary || 'No prior context available.';
    
    return `You are part of a multi-model workflow: ${context.workflowId}

Context from previous steps: ${contextSummary}

Please use the ${tool.name} tool to complete the current step. The tool is described as: ${tool.description}

Use the tool appropriately based on the context and requirements.`;
  }

  private enhancePromptWithContext(prompt: string, context: SharedWorkflowContext): string {
    if (context.summary) {
      return `${prompt}\n\nContext from previous workflow steps: ${context.summary}`;
    }
    return prompt;
  }

  private generateValidationPrompt(step: WorkflowStep, results: Map<string, any>): string {
    const relevantResults = step.dependencies?.map(depId => 
      `${depId}: ${JSON.stringify(results.get(depId))}`
    ).join('\n') || '';

    return `Please validate the following results from workflow step "${step.name}":

${relevantResults}

Evaluate for:
1. Accuracy and correctness
2. Completeness
3. Relevance to the task

Respond with: VALID or INVALID, followed by brief feedback.`;
  }

  private parseValidationResponse(response: string): { valid: boolean; feedback?: string } {
    const lines = response.trim().split('\n');
    const firstLine = lines[0].toUpperCase();
    
    return {
      valid: firstLine.includes('VALID') && !firstLine.includes('INVALID'),
      feedback: lines.slice(1).join('\n').trim()
    };
  }

  private generateSummary(results: any[]): string {
    if (results.length === 0) return 'No results to summarize.';
    
    return `Aggregated ${results.length} results from workflow steps. Key outcomes: ${
      results.map((r, i) => `Step ${i + 1}: ${JSON.stringify(r).substring(0, 50)}...`).join('; ')
    }`;
  }

  private updateSharedContext(context: SharedWorkflowContext, step: WorkflowStep, result: any): void {
    // Store key insights in shared memory
    context.sharedMemory.set(`${step.id}_result`, result);
    
    // Update summary
    const resultSummary = typeof result === 'string' ? result.substring(0, 100) : JSON.stringify(result).substring(0, 100);
    context.summary += `\n${step.name}: ${resultSummary}...`;
  }

  /**
   * Get workflow execution history
   */
  getExecutionHistory(): Map<string, MultiModelExecutionResult> {
    return new Map(this.executionHistory);
  }

  /**
   * Get registered workflows
   */
  getRegisteredWorkflows(): MultiModelWorkflow[] {
    return Array.from(this.workflowRegistry.values());
  }

  /**
   * Get active workflows
   */
  getActiveWorkflows(): MultiModelWorkflow[] {
    return Array.from(this.activeWorkflows.values());
  }
}