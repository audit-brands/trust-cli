/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  MultiModelOrchestrator,
  EnhancedUnifiedModelManager,
  IntelligentModelRouter,
  ToolExecutionEngine,
  globalPerformanceMonitor,
  TrustModelManagerImpl,
  Config,
  type MultiModelWorkflow,
  type MultiModelExecutionResult,
  type SharedWorkflowContext
} from '@trust-cli/trust-cli-core';
import { ToolRegistry } from '@trust-cli/trust-cli-core';
import * as fs from 'fs/promises';
import * as path from 'path';
import chalk from 'chalk';

export interface WorkflowCommandArgs {
  action: 'run' | 'list' | 'register' | 'results' | 'help';
  workflowId?: string;
  file?: string;
  input?: string;
  output?: string;
  format?: 'json' | 'text';
  verbose?: boolean;
}

export class WorkflowCommandHandler {
  private orchestrator: MultiModelOrchestrator;
  private modelManager: TrustModelManagerImpl;
  private unifiedModelManager: EnhancedUnifiedModelManager;
  private router: IntelligentModelRouter;
  private toolExecutor: ToolExecutionEngine;
  private config: Config;

  constructor() {
    // Create a minimal config for workflow execution
    this.config = new Config({
      sessionId: `workflow_${Date.now()}`,
      targetDir: process.cwd(),
      debugMode: false,
      cwd: process.cwd(),
      model: 'workflow-execution'
    });
    
    this.modelManager = new TrustModelManagerImpl();
    this.unifiedModelManager = new EnhancedUnifiedModelManager();
    this.router = new IntelligentModelRouter();
    
    // Initialize tool executor with default security config
    this.toolExecutor = new ToolExecutionEngine(
      new ToolRegistry(this.config),
      {
        allowFileOperations: true,
        allowNetworkAccess: false,
        allowShellExecution: false,
        maxExecutionTime: 60000
      }
    );

    this.orchestrator = new MultiModelOrchestrator(
      this.unifiedModelManager,
      this.router,
      this.toolExecutor
    );
  }

  async initialize(): Promise<void> {
    await this.modelManager.initialize();
    await this.unifiedModelManager.initialize();
    await this.router.initialize();
  }

  async handleCommand(args: WorkflowCommandArgs): Promise<void> {
    try {
      switch (args.action) {
        case 'run':
          await this.runWorkflow(args);
          break;
        case 'list':
          await this.listWorkflows(args);
          break;
        case 'register':
          await this.registerWorkflow(args);
          break;
        case 'results':
          await this.showResults(args);
          break;
        case 'help':
        default:
          this.showHelp();
          break;
      }
    } catch (error) {
      console.error(
        chalk.red(
          `❌ Workflow command failed: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
      throw error;
    }
  }

  private async runWorkflow(args: WorkflowCommandArgs): Promise<void> {
    if (!args.workflowId) {
      console.log('❌ Workflow ID is required');
      console.log('💡 Usage: trust workflow run --workflow <workflow-id>');
      return;
    }

    console.log(`\n🚀 Starting Multi-Model Workflow: ${args.workflowId}`);
    console.log('─'.repeat(60));

    const startTime = Date.now();

    try {
      // Prepare execution context
      const executionContext = {
        sessionId: `workflow_${Date.now()}`,
        workingDirectory: process.cwd(),
        securityConfig: {
          allowFileOperations: true,
          allowNetworkAccess: false,
          allowShellExecution: false,
          maxExecutionTime: 60000
        }
      };

      // Prepare initial context
      let initialContext: Partial<SharedWorkflowContext> = {
        metadata: {
          startTime: new Date().toISOString(),
          user: process.env.USER || 'unknown'
        }
      };

      // Load context from input file if provided
      if (args.input) {
        const inputData = await fs.readFile(args.input, 'utf-8');
        const parsedInput = JSON.parse(inputData);
        initialContext = { ...initialContext, ...parsedInput };
      }

      // Execute workflow
      const result = await this.orchestrator.executeWorkflow(
        args.workflowId,
        initialContext,
        executionContext
      );

      const duration = Date.now() - startTime;
      
      if (result.success) {
        console.log(`\n✅ Workflow completed successfully in ${(duration / 1000).toFixed(1)}s`);
        
        // Display results
        this.displayWorkflowResults(result, args.verbose);

        // Save results if output specified
        if (args.output) {
          await this.saveResults(result, args.output, args.format || 'json');
          console.log(`💾 Results saved to: ${args.output}`);
        }
      } else {
        console.log(`\n❌ Workflow failed after ${(duration / 1000).toFixed(1)}s`);
        console.log(`Error: ${result.error}`);
        
        if (result.warnings && result.warnings.length > 0) {
          console.log('\n⚠️  Warnings:');
          result.warnings.forEach(warning => console.log(`   • ${warning}`));
        }
      }

    } catch (error) {
      console.error(
        `❌ Workflow execution failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      console.log('\n🔧 Troubleshooting:');
      console.log('   • Check that required models are available');
      console.log('   • Verify workflow definition is valid');
      console.log('   • Ensure sufficient system resources');
      throw error;
    }
  }

  private async listWorkflows(args: WorkflowCommandArgs): Promise<void> {
    const workflows = this.orchestrator.getRegisteredWorkflows();

    console.log('\n📋 Available Multi-Model Workflows');
    console.log('═'.repeat(60));

    if (workflows.length === 0) {
      console.log('No workflows registered.');
      console.log('💡 Register a workflow: trust workflow register --file <workflow.json>');
      return;
    }

    for (const workflow of workflows) {
      console.log(`\n🔄 ${workflow.name} (${workflow.id})`);
      console.log(`   Strategy: ${workflow.strategy}`);
      console.log(`   Description: ${workflow.description}`);
      console.log(`   Steps: ${workflow.steps.length}`);

      if (args.verbose) {
        console.log('   Step Details:');
        for (const step of workflow.steps) {
          console.log(`     • ${step.name} (${step.type})`);
          if (step.dependencies && step.dependencies.length > 0) {
            console.log(`       Dependencies: ${step.dependencies.join(', ')}`);
          }
        }
      }
    }

    console.log('\n💡 Usage:');
    console.log('   trust workflow run --workflow <workflow-id>');
    console.log('   trust workflow list --verbose  # Show detailed information');
  }

  private async registerWorkflow(args: WorkflowCommandArgs): Promise<void> {
    if (!args.file) {
      console.log('❌ Workflow file is required');
      console.log('💡 Usage: trust workflow register --file <workflow.json>');
      return;
    }

    try {
      const workflowData = await fs.readFile(args.file, 'utf-8');
      const workflow: MultiModelWorkflow = JSON.parse(workflowData);

      // Validate workflow
      this.validateWorkflow(workflow);

      // Register workflow
      this.orchestrator.registerWorkflow(workflow);

      console.log(`✅ Workflow '${workflow.name}' registered successfully`);
      console.log(`   ID: ${workflow.id}`);
      console.log(`   Strategy: ${workflow.strategy}`);
      console.log(`   Steps: ${workflow.steps.length}`);

    } catch (error) {
      console.error(`❌ Failed to register workflow: ${error}`);
      console.log('\n🔧 Troubleshooting:');
      console.log('   • Check that the workflow file exists and is valid JSON');
      console.log('   • Verify the workflow schema is correct');
      throw error;
    }
  }

  private async showResults(args: WorkflowCommandArgs): Promise<void> {
    const history = this.orchestrator.getExecutionHistory();

    if (history.size === 0) {
      console.log('📊 No workflow execution results found.');
      console.log('💡 Run a workflow first: trust workflow run --workflow <workflow-id>');
      return;
    }

    console.log('\n📊 Workflow Execution Results');
    console.log('═'.repeat(60));

    for (const [workflowId, result] of history) {
      if (args.workflowId && workflowId !== args.workflowId) {
        continue;
      }

      const status = result.success ? '✅' : '❌';
      console.log(`\n${status} ${workflowId}`);
      console.log(`   Duration: ${(result.executionTime / 1000).toFixed(1)}s`);
      console.log(`   Results: ${result.results.size} steps completed`);

      if (result.modelPerformance.size > 0) {
        console.log(`   Models Used: ${Array.from(result.modelPerformance.keys()).join(', ')}`);
      }

      if (result.error) {
        console.log(`   Error: ${result.error}`);
      }

      if (args.verbose) {
        this.displayWorkflowResults(result, true);
      }
    }

    console.log('\n💡 Use --verbose for detailed results');
    console.log('💡 Use --workflow <id> to filter by workflow');
  }

  private displayWorkflowResults(result: MultiModelExecutionResult, verbose = false): void {
    console.log('\n📊 Execution Summary:');
    console.log(`   • Total Steps: ${result.results.size}`);
    console.log(`   • Models Used: ${result.modelPerformance.size}`);
    console.log(`   • Duration: ${(result.executionTime / 1000).toFixed(1)}s`);

    if (result.modelPerformance.size > 0) {
      console.log('\n🤖 Model Performance:');
      for (const [modelName, metrics] of result.modelPerformance) {
        console.log(`   • ${modelName}:`);
        console.log(`     Tasks: ${metrics.tasksExecuted}`);
        console.log(`     Avg Latency: ${metrics.averageLatency.toFixed(0)}ms`);
        console.log(`     Success Rate: ${(metrics.successRate * 100).toFixed(1)}%`);
      }
    }

    if (verbose && result.results.size > 0) {
      console.log('\n📋 Step Results:');
      for (const [stepId, stepResult] of result.results) {
        console.log(`   • ${stepId}:`);
        const resultStr = typeof stepResult === 'string' 
          ? stepResult.substring(0, 100) + (stepResult.length > 100 ? '...' : '')
          : JSON.stringify(stepResult, null, 2).substring(0, 200);
        console.log(`     ${resultStr}`);
      }
    }

    if (result.warnings && result.warnings.length > 0) {
      console.log('\n⚠️  Warnings:');
      result.warnings.forEach(warning => console.log(`   • ${warning}`));
    }
  }

  private async saveResults(
    result: MultiModelExecutionResult,
    outputPath: string,
    format: string
  ): Promise<void> {
    const dir = path.dirname(outputPath);
    await fs.mkdir(dir, { recursive: true });

    switch (format) {
      case 'json':
        await fs.writeFile(outputPath, JSON.stringify(result, null, 2));
        break;
      case 'text':
        const textReport = this.generateTextReport(result);
        await fs.writeFile(outputPath, textReport);
        break;
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }

  private generateTextReport(result: MultiModelExecutionResult): string {
    let report = `Multi-Model Workflow Execution Report\n`;
    report += '═'.repeat(50) + '\n\n';

    report += `Workflow ID: ${result.workflowId}\n`;
    report += `Success: ${result.success ? 'Yes' : 'No'}\n`;
    report += `Duration: ${(result.executionTime / 1000).toFixed(1)}s\n`;
    report += `Steps Completed: ${result.results.size}\n`;
    report += `Models Used: ${result.modelPerformance.size}\n\n`;

    if (result.error) {
      report += `Error: ${result.error}\n\n`;
    }

    if (result.modelPerformance.size > 0) {
      report += 'Model Performance:\n';
      for (const [modelName, metrics] of result.modelPerformance) {
        report += `  ${modelName}:\n`;
        report += `    Tasks: ${metrics.tasksExecuted}\n`;
        report += `    Avg Latency: ${metrics.averageLatency.toFixed(0)}ms\n`;
        report += `    Success Rate: ${(metrics.successRate * 100).toFixed(1)}%\n`;
        report += `    Total Tokens: ${metrics.totalTokens}\n\n`;
      }
    }

    if (result.results.size > 0) {
      report += 'Step Results:\n';
      for (const [stepId, stepResult] of result.results) {
        report += `  ${stepId}:\n`;
        const resultStr = typeof stepResult === 'string' 
          ? stepResult 
          : JSON.stringify(stepResult, null, 4);
        report += `    ${resultStr}\n\n`;
      }
    }

    return report;
  }

  private validateWorkflow(workflow: MultiModelWorkflow): void {
    if (!workflow.id || !workflow.name || !workflow.strategy || !workflow.steps) {
      throw new Error('Invalid workflow: missing required fields (id, name, strategy, steps)');
    }

    const validStrategies = ['single_model', 'specialized', 'consensus', 'pipeline', 'review_validate', 'load_balance'];
    if (!validStrategies.includes(workflow.strategy)) {
      throw new Error(`Invalid strategy: ${workflow.strategy}`);
    }

    if (workflow.steps.length === 0) {
      throw new Error('Workflow must have at least one step');
    }

    // Validate step dependencies
    const stepIds = new Set(workflow.steps.map(s => s.id));
    for (const step of workflow.steps) {
      if (step.dependencies) {
        for (const depId of step.dependencies) {
          if (!stepIds.has(depId)) {
            throw new Error(`Step ${step.id} depends on non-existent step ${depId}`);
          }
        }
      }
    }
  }

  private showHelp(): void {
    console.log(`
🔄 Trust CLI - Multi-Model Workflow Commands

USAGE:
    trust workflow <action> [options]

ACTIONS:
    run --workflow <id>         Execute a multi-model workflow
    list [--verbose]            List available workflows
    register --file <path>      Register a new workflow from file
    results [--workflow <id>]   Show workflow execution results
    help                        Show this help message

OPTIONS:
    --workflow <id>             Workflow ID to execute or filter by
    --file <path>               Path to workflow definition file
    --input <path>              Input context file (JSON)
    --output <path>             Output file for results
    --format <type>             Output format (json, text)
    --verbose                   Show detailed output

EXAMPLES:
    trust workflow list                                    # List all workflows
    trust workflow run --workflow code_analysis_review    # Run code review workflow
    trust workflow register --file my-workflow.json       # Register custom workflow
    trust workflow results --workflow research_synthesis  # Show results for specific workflow

WORKFLOW STRATEGIES:
    single_model     - One model handles all steps
    specialized      - Route steps to specialized models
    consensus        - Multiple models vote on results
    pipeline         - Sequential model processing
    review_validate  - Generate with one model, review with another
    load_balance     - Distribute steps across available models

📄 Multi-model workflows enable sophisticated AI task coordination,
    leveraging the strengths of different models for complex tasks.
`);
  }
}