/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ErrorCollector } from './errorCollector.js';
import { FunctionCallEvaluator } from './functionCallEvaluator.js';
import { TrustContentGenerator } from './trustContentGenerator.js';
import { ModelManager } from './modelManager.js';

/**
 * Demonstration of the error collection system
 * Shows how to use the ErrorCollector with the FunctionCallEvaluator
 */
export class ErrorCollectorDemo {
  private errorCollector: ErrorCollector;
  private evaluator: FunctionCallEvaluator;

  constructor() {
    this.errorCollector = new ErrorCollector();

    // Initialize the evaluator with error collection
    const modelManager = new ModelManager();
    const contentGenerator = new TrustContentGenerator(modelManager);
    this.evaluator = new FunctionCallEvaluator(
      contentGenerator,
      this.errorCollector,
    );
  }

  /**
   * Run a demonstration of error collection
   */
  async runDemo(): Promise<void> {
    console.log('🔍 Starting Error Collection Demo...\n');

    try {
      // Run the evaluation suite which will automatically collect errors
      console.log('Running function call evaluation suite...');
      const summary = await this.evaluator.runEvaluation();

      // Print the combined evaluation and error report
      this.evaluator.printReport(summary);

      // Demonstrate specific error analysis
      console.log('\n=== SPECIFIC ERROR ANALYSIS ===\n');

      const analytics = this.errorCollector.getAnalytics();

      // Show most common failure types
      console.log('Most Common Failure Types:');
      const sortedTypes = Object.entries(analytics.errorsByType)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3);

      for (const [type, count] of sortedTypes) {
        console.log(`  ${type}: ${count} errors`);

        // Show examples of this error type
        const examples = this.errorCollector.getErrorsByType(type).slice(0, 2);
        for (const example of examples) {
          console.log(
            `    Example: "${example.prompt}" → ${example.errors[0]}`,
          );
        }
      }

      // Show problematic categories
      console.log('\nMost Problematic Categories:');
      const sortedCategories = Object.entries(analytics.errorsByCategory)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3);

      for (const [category, count] of sortedCategories) {
        console.log(`  ${category}: ${count} errors`);
      }

      // Show tool-specific issues
      console.log('\nTool Accuracy Issues:');
      const toolStats = Object.entries(analytics.toolAccuracy)
        .filter(([, stats]) => stats.accuracy < 80)
        .sort(([, a], [, b]) => a.accuracy - b.accuracy)
        .slice(0, 3);

      for (const [tool, stats] of toolStats) {
        console.log(
          `  ${tool}: ${stats.accuracy.toFixed(1)}% accuracy (${stats.attempts} attempts)`,
        );
      }

      // Export detailed error data
      const exportPath = './error_analysis_export.json';
      this.evaluator.exportErrorData(exportPath);
      console.log(`\n📁 Detailed error data exported to: ${exportPath}`);
    } catch (error) {
      console.error('Demo failed:', error);
    }
  }

  /**
   * Show how to analyze specific error patterns
   */
  analyzeSpecificPatterns(): void {
    console.log('\n=== PATTERN-SPECIFIC ANALYSIS ===\n');

    const analytics = this.errorCollector.getAnalytics();

    // Show common failure patterns
    console.log('Common Failure Patterns:');
    for (const pattern of analytics.commonFailures.slice(0, 5)) {
      console.log(`\n  Pattern: "${pattern.pattern}"`);
      console.log(`  Occurrences: ${pattern.count}`);
      console.log(`  Examples:`);
      for (const example of pattern.examples.slice(0, 2)) {
        console.log(`    - ${example}`);
      }
    }

    // Analyze recent vs historical errors
    const recentErrors = this.errorCollector.getRecentErrors(1); // Last 1 day
    const weeklyErrors = this.errorCollector.getRecentErrors(7); // Last 7 days

    console.log(`\n📊 Error Trends:`);
    console.log(`  Last 24 hours: ${recentErrors.length} errors`);
    console.log(`  Last 7 days: ${weeklyErrors.length} errors`);

    if (weeklyErrors.length > 0) {
      const avgDaily = weeklyErrors.length / 7;
      console.log(`  Average daily errors: ${avgDaily.toFixed(1)}`);
    }
  }

  /**
   * Demonstrate error filtering and investigation
   */
  investigateSpecificErrors(): void {
    console.log('\n=== ERROR INVESTIGATION ===\n');

    // Find the most problematic prompts
    const allErrors = this.errorCollector.getRecentErrors(30);
    const promptFailures = new Map<string, number>();

    for (const error of allErrors) {
      const key = error.prompt.substring(0, 50) + '...';
      promptFailures.set(key, (promptFailures.get(key) || 0) + 1);
    }

    const sortedPrompts = Array.from(promptFailures.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);

    console.log('Most Problematic Prompts:');
    for (const [prompt, count] of sortedPrompts) {
      console.log(`  ${count}x failures: "${prompt}"`);
    }

    // Show model-specific issues if available
    const modelIssues = new Map<string, number>();
    for (const error of allErrors) {
      if (error.model) {
        modelIssues.set(error.model, (modelIssues.get(error.model) || 0) + 1);
      }
    }

    if (modelIssues.size > 0) {
      console.log('\nModel-Specific Error Rates:');
      for (const [model, count] of modelIssues) {
        console.log(`  ${model}: ${count} errors`);
      }
    }
  }

  /**
   * Clean up demo data
   */
  cleanup(): void {
    console.log('\n🧹 Cleaning up demo data...');
    this.evaluator.clearErrorData();
    console.log('Demo data cleared.');
  }
}

/**
 * Run the demo if this file is executed directly
 */
if (import.meta.url === `file://${process.argv[1]}`) {
  const demo = new ErrorCollectorDemo();

  demo
    .runDemo()
    .then(() => demo.analyzeSpecificPatterns())
    .then(() => demo.investigateSpecificErrors())
    .then(() => {
      console.log('\n✅ Error Collection Demo completed successfully!');
      console.log(
        '💡 The error collection system is now ready to help improve function calling accuracy.',
      );
    })
    .catch((error) => {
      console.error('❌ Demo failed:', error);
    });
}
