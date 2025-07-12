/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { TrustConfiguration } from '../config/trustConfig.js';

/**
 * Enhanced error with actionable guidance
 */
export interface EnhancedError {
  type:
    | 'model_not_found'
    | 'backend_unavailable'
    | 'insufficient_resources'
    | 'configuration_invalid'
    | 'network_error'
    | 'permission_denied'
    | 'routing_failed'
    | 'generic';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  cause: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context?: Record<string, any>;
  solutions: ErrorSolution[];
  relatedCommands: string[];
  documentation?: string;
  estimatedFixTime: string;
}

/**
 * Solution for resolving an error
 */
export interface ErrorSolution {
  type: 'immediate' | 'short_term' | 'long_term';
  title: string;
  description: string;
  commands: string[];
  automated: boolean;
  difficulty: 'easy' | 'moderate' | 'advanced';
  estimatedTime: string;
}

/**
 * Error pattern for matching and classification
 */
interface ErrorPattern {
  pattern: RegExp;
  type: EnhancedError['type'];
  severity: EnhancedError['severity'];
  titleTemplate: string;
  descriptionTemplate: string;
  causeTemplate: string;
  solutionGenerator: (
    match: RegExpMatchArray,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    context?: any,
  ) => ErrorSolution[];
  relatedCommands: string[];
  documentation?: string;
  estimatedFixTime: string;
}

/**
 * Enhanced error handler for Trust CLI
 * Converts generic errors into actionable guidance
 */
export class EnhancedErrorHandler {
  private trustConfig: TrustConfiguration;
  private errorPatterns: ErrorPattern[];

  constructor(trustConfig?: TrustConfiguration) {
    this.trustConfig = trustConfig || new TrustConfiguration();
    this.errorPatterns = this.initializeErrorPatterns();
  }

  /**
   * Initialize the error handler
   */
  async initialize(): Promise<void> {
    await this.trustConfig.initialize();
  }

  /**
   * Process an error and return enhanced guidance
   */
  async processError(
    error: Error | string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    context?: Record<string, any>,
  ): Promise<EnhancedError> {
    const errorMessage = error instanceof Error ? error.message : error || '';
    const stackTrace = error instanceof Error ? error.stack : undefined;

    // Handle null/undefined/empty errors
    if (!errorMessage) {
      return this.createGenericError('Empty or null error message', context);
    }

    // Try to match against known error patterns
    for (const pattern of this.errorPatterns) {
      const match = errorMessage.match(pattern.pattern);
      if (match) {
        return this.buildEnhancedError(pattern, match, {
          ...context,
          originalError: errorMessage,
          stackTrace,
        });
      }
    }

    // Fallback to generic error handling
    return this.createGenericError(errorMessage, context);
  }

  /**
   * Process multiple errors and prioritize by severity
   */
  async processErrors(
    errors: Array<Error | string>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    context?: Record<string, any>,
  ): Promise<EnhancedError[]> {
    const enhancedErrors = await Promise.all(
      errors.map((error) => this.processError(error, context)),
    );

    // Sort by severity (critical > high > medium > low)
    const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
    return enhancedErrors.sort(
      (a, b) => severityOrder[b.severity] - severityOrder[a.severity],
    );
  }

  /**
   * Get contextual help for a specific error type
   */
  getContextualHelp(errorType: EnhancedError['type']): string {
    const helpMap: Record<EnhancedError['type'], string> = {
      model_not_found:
        'This error occurs when Trust CLI cannot locate the specified model. This usually means the model needs to be downloaded or the name is incorrect.',
      backend_unavailable:
        'This error indicates that a required backend (Ollama, HuggingFace, etc.) is not running or properly configured.',
      insufficient_resources:
        'This error means your system lacks the necessary resources (RAM, disk space, etc.) to complete the operation.',
      configuration_invalid:
        'This error indicates there is an issue with your Trust CLI configuration that needs to be resolved.',
      network_error:
        'This error occurs when Trust CLI cannot connect to required network services or download resources.',
      permission_denied:
        'This error indicates insufficient permissions to access files or execute commands.',
      routing_failed:
        'This error occurs when the intelligent model routing system cannot find a suitable model for your request.',
      generic:
        'This is a general error that could not be specifically classified. Check the error details for more information.',
    };

    return helpMap[errorType] || helpMap.generic;
  }

  /**
   * Generate a user-friendly error report
   */
  generateErrorReport(enhancedError: EnhancedError): string {
    let report = `\n❌ **${enhancedError.title}**\n`;
    report += `${this.getSeverityIcon(enhancedError.severity)} Severity: ${enhancedError.severity.toUpperCase()}\n`;
    report += `⏱️  Estimated fix time: ${enhancedError.estimatedFixTime}\n\n`;

    report += `📋 **Problem Description:**\n`;
    report += `   ${enhancedError.description}\n\n`;

    report += `🔍 **Root Cause:**\n`;
    report += `   ${enhancedError.cause}\n\n`;

    if (enhancedError.solutions.length > 0) {
      report += `💡 **Solutions:**\n`;
      enhancedError.solutions.forEach((solution, i) => {
        const typeIcon = this.getSolutionTypeIcon(solution.type);
        const difficultyIcon = this.getDifficultyIcon(solution.difficulty);

        report += `\n${i + 1}. ${typeIcon} **${solution.title}** ${difficultyIcon}\n`;
        report += `   ${solution.description}\n`;
        report += `   ⏱️  Time: ${solution.estimatedTime}\n`;

        if (solution.commands.length > 0) {
          report += `   Commands:\n`;
          solution.commands.forEach((cmd) => {
            report += `     ${cmd}\n`;
          });
        }
      });
      report += '\n';
    }

    if (enhancedError.relatedCommands.length > 0) {
      report += `🔧 **Related Commands:**\n`;
      enhancedError.relatedCommands.forEach((cmd) => {
        report += `   ${cmd}\n`;
      });
      report += '\n';
    }

    if (enhancedError.documentation) {
      report += `📖 **Documentation:** ${enhancedError.documentation}\n\n`;
    }

    if (enhancedError.context) {
      report += `🔍 **Context Information:**\n`;
      Object.entries(enhancedError.context).forEach(([key, value]) => {
        if (key !== 'originalError' && key !== 'stackTrace') {
          report += `   ${key}: ${JSON.stringify(value)}\n`;
        }
      });
    }

    return report;
  }

  // Private helper methods

  private initializeErrorPatterns(): ErrorPattern[] {
    return [
      // Model not found errors
      {
        pattern:
          /model ['"`]?([^'"`\s]+)['"`]? not found|Model ['"`]?([^'"`\s]+)['"`]? does not exist|No such model|model.*not found/i,
        type: 'model_not_found',
        severity: 'medium',
        titleTemplate: 'Model Not Found',
        descriptionTemplate:
          'The requested model "{modelName}" could not be found in any enabled backend.',
        causeTemplate:
          'The model may not be downloaded, or the model name might be incorrect.',
        solutionGenerator: (match) =>
          this.generateModelNotFoundSolutions(
            match[1] || match[2] || 'unknown',
          ),
        relatedCommands: [
          'trust model list',
          'trust model-enhanced discover',
          'trust model download <model-name>',
          'ollama list',
          'ollama pull <model-name>',
        ],
        documentation: 'https://docs.trust-cli.com/models/installation',
        estimatedFixTime: '2-10 minutes',
      },

      // Backend unavailable errors
      {
        pattern:
          /connection refused|backend not available|ollama.*not running|server.*not responding|ECONNREFUSED/i,
        type: 'backend_unavailable',
        severity: 'high',
        titleTemplate: 'Backend Service Unavailable',
        descriptionTemplate:
          'A required backend service is not running or cannot be reached.',
        causeTemplate:
          'The backend service (Ollama, HuggingFace API, etc.) is not started or properly configured.',
        solutionGenerator: () => this.generateBackendUnavailableSolutions(),
        relatedCommands: [
          'trust status',
          'trust config show backends',
          'ollama serve',
          'systemctl start ollama',
        ],
        documentation: 'https://docs.trust-cli.com/backends/setup',
        estimatedFixTime: '1-5 minutes',
      },

      // Resource insufficiency errors
      {
        pattern:
          /out of memory|insufficient.*memory|not enough.*space|disk.*full|RAM.*exceeded/i,
        type: 'insufficient_resources',
        severity: 'high',
        titleTemplate: 'Insufficient System Resources',
        descriptionTemplate:
          'The system lacks sufficient resources to complete this operation.',
        causeTemplate:
          'Available RAM, disk space, or other system resources are below required thresholds.',
        solutionGenerator: () => this.generateResourceInsufficientSolutions(),
        relatedCommands: [
          'trust model-enhanced resource-check',
          'trust model-enhanced optimize',
          'trust model-enhanced system-report',
        ],
        documentation: 'https://docs.trust-cli.com/troubleshooting/resources',
        estimatedFixTime: '5-30 minutes',
      },

      // Configuration errors
      {
        pattern:
          /config.*invalid|configuration.*error|missing.*api.*key|invalid.*token|authentication.*failed/i,
        type: 'configuration_invalid',
        severity: 'medium',
        titleTemplate: 'Configuration Issue',
        descriptionTemplate:
          'There is an issue with your Trust CLI configuration.',
        causeTemplate:
          'Configuration file is missing, corrupted, or contains invalid values.',
        solutionGenerator: () => this.generateConfigurationSolutions(),
        relatedCommands: [
          'trust config show',
          'trust config validate',
          'trust config reset',
          'trust auth setup',
        ],
        documentation: 'https://docs.trust-cli.com/configuration',
        estimatedFixTime: '2-15 minutes',
      },

      // Network errors
      {
        pattern:
          /network.*error|timeout|dns.*resolution|certificate.*error|ssl.*error|fetch.*failed/i,
        type: 'network_error',
        severity: 'medium',
        titleTemplate: 'Network Connection Issue',
        descriptionTemplate: 'Trust CLI cannot establish a network connection.',
        causeTemplate:
          'Network connectivity issues, DNS problems, or firewall restrictions.',
        solutionGenerator: () => this.generateNetworkErrorSolutions(),
        relatedCommands: [
          'trust status --network',
          'trust config show proxy',
          'ping api.huggingface.co',
        ],
        documentation: 'https://docs.trust-cli.com/troubleshooting/network',
        estimatedFixTime: '2-20 minutes',
      },

      // Permission errors
      {
        pattern: /permission.*denied|access.*denied|EACCES|EPERM|unauthorized/i,
        type: 'permission_denied',
        severity: 'medium',
        titleTemplate: 'Permission Denied',
        descriptionTemplate:
          'Trust CLI lacks sufficient permissions to complete this operation.',
        causeTemplate:
          'File or directory permissions, or insufficient user privileges.',
        solutionGenerator: () => this.generatePermissionSolutions(),
        relatedCommands: [
          'ls -la ~/.trust',
          'chmod 755 ~/.trust',
          'sudo trust <command>',
        ],
        documentation: 'https://docs.trust-cli.com/troubleshooting/permissions',
        estimatedFixTime: '1-10 minutes',
      },

      // Routing failures
      {
        pattern:
          /routing.*failed|no suitable model|model selection.*failed|intelligent routing.*error/i,
        type: 'routing_failed',
        severity: 'medium',
        titleTemplate: 'Model Routing Failed',
        descriptionTemplate:
          'The intelligent routing system could not find a suitable model for your request.',
        causeTemplate:
          'No available models meet the criteria, or system constraints are too restrictive.',
        solutionGenerator: () => this.generateRoutingFailedSolutions(),
        relatedCommands: [
          'trust model-enhanced smart-recommend',
          'trust model-enhanced resource-check',
          'trust model list',
          'trust model-enhanced filter --verbose',
        ],
        documentation: 'https://docs.trust-cli.com/models/routing',
        estimatedFixTime: '2-10 minutes',
      },
    ];
  }

  private buildEnhancedError(
    pattern: ErrorPattern,
    match: RegExpMatchArray,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    context: any,
  ): EnhancedError {
    const modelName = match[1] || match[2] || 'unknown';

    return {
      type: pattern.type,
      severity: pattern.severity,
      title: pattern.titleTemplate.replace('{modelName}', modelName),
      description: pattern.descriptionTemplate.replace(
        '{modelName}',
        modelName,
      ),
      cause: pattern.causeTemplate.replace('{modelName}', modelName),
      context,
      solutions: pattern.solutionGenerator(match, context),
      relatedCommands: pattern.relatedCommands,
      documentation: pattern.documentation,
      estimatedFixTime: pattern.estimatedFixTime,
    };
  }

  private createGenericError(
    errorMessage: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    context?: Record<string, any>,
  ): EnhancedError {
    return {
      type: 'generic',
      severity: 'medium',
      title: 'Unexpected Error',
      description:
        'An unexpected error occurred that could not be automatically classified.',
      cause: errorMessage,
      context: {
        ...context,
        originalError: errorMessage,
      },
      solutions: [
        {
          type: 'immediate',
          title: 'Check System Status',
          description:
            'Verify that all services are running and the system is healthy.',
          commands: ['trust status', 'trust model-enhanced resource-check'],
          automated: false,
          difficulty: 'easy',
          estimatedTime: '1-2 minutes',
        },
        {
          type: 'short_term',
          title: 'Review Logs and Configuration',
          description: 'Check recent logs and validate your configuration.',
          commands: ['trust config show', 'trust logs --recent'],
          automated: false,
          difficulty: 'moderate',
          estimatedTime: '3-5 minutes',
        },
      ],
      relatedCommands: ['trust help', 'trust status', 'trust config validate'],
      estimatedFixTime: '5-15 minutes',
    };
  }

  // Solution generators for different error types

  private generateModelNotFoundSolutions(modelName: string): ErrorSolution[] {
    return [
      {
        type: 'immediate',
        title: 'Search for Similar Models',
        description:
          'Look for models with similar names or check available models.',
        commands: [
          'trust model list',
          'trust model-enhanced discover',
          `ollama list | grep -i ${modelName.split(':')[0]}`,
        ],
        automated: false,
        difficulty: 'easy',
        estimatedTime: '30 seconds',
      },
      {
        type: 'immediate',
        title: 'Download the Model',
        description: 'Download the model if the name is correct.',
        commands: [
          `ollama pull ${modelName}`,
          `trust model download ${modelName}`,
        ],
        automated: false,
        difficulty: 'easy',
        estimatedTime: '2-10 minutes',
      },
      {
        type: 'short_term',
        title: 'Use Smart Model Selection',
        description: 'Let Trust CLI recommend a suitable alternative model.',
        commands: [
          'trust model-enhanced smart-default',
          'trust model-enhanced smart-recommend --task general',
        ],
        automated: true,
        difficulty: 'easy',
        estimatedTime: '1 minute',
      },
    ];
  }

  private generateBackendUnavailableSolutions(): ErrorSolution[] {
    return [
      {
        type: 'immediate',
        title: 'Start Backend Services',
        description: 'Start the required backend services.',
        commands: [
          'ollama serve',
          'systemctl start ollama',
          'docker start ollama',
        ],
        automated: false,
        difficulty: 'easy',
        estimatedTime: '1-2 minutes',
      },
      {
        type: 'immediate',
        title: 'Check Service Status',
        description: 'Verify which backends are running and configured.',
        commands: [
          'trust status',
          'trust config show backends',
          'ps aux | grep ollama',
        ],
        automated: false,
        difficulty: 'easy',
        estimatedTime: '30 seconds',
      },
      {
        type: 'short_term',
        title: 'Configure Alternative Backends',
        description: 'Enable other backends as fallback options.',
        commands: [
          'trust config set backends.huggingface.enabled true',
          'trust config set backends.cloud.enabled true',
        ],
        automated: false,
        difficulty: 'moderate',
        estimatedTime: '3-5 minutes',
      },
    ];
  }

  private generateResourceInsufficientSolutions(): ErrorSolution[] {
    return [
      {
        type: 'immediate',
        title: 'Check Resource Usage',
        description: 'Analyze current system resource utilization.',
        commands: [
          'trust model-enhanced resource-check',
          'trust model-enhanced optimize',
        ],
        automated: false,
        difficulty: 'easy',
        estimatedTime: '1 minute',
      },
      {
        type: 'immediate',
        title: 'Use Smaller Models',
        description: 'Switch to models that require fewer resources.',
        commands: [
          'trust model-enhanced filter --ram-limit 4',
          'trust model-enhanced smart-default --urgency high',
        ],
        automated: true,
        difficulty: 'easy',
        estimatedTime: '30 seconds',
      },
      {
        type: 'short_term',
        title: 'Free Up Resources',
        description: 'Close unnecessary applications and clean up disk space.',
        commands: [
          'ollama rm <unused-model>',
          'docker system prune',
          'rm -rf ~/.cache/trust-cli/temp/*',
        ],
        automated: false,
        difficulty: 'moderate',
        estimatedTime: '5-15 minutes',
      },
    ];
  }

  private generateConfigurationSolutions(): ErrorSolution[] {
    return [
      {
        type: 'immediate',
        title: 'Validate Configuration',
        description: 'Check your current configuration for issues.',
        commands: ['trust config validate', 'trust config show'],
        automated: false,
        difficulty: 'easy',
        estimatedTime: '30 seconds',
      },
      {
        type: 'short_term',
        title: 'Reset Configuration',
        description: 'Reset configuration to defaults if corrupted.',
        commands: ['trust config reset', 'trust auth setup'],
        automated: false,
        difficulty: 'moderate',
        estimatedTime: '2-5 minutes',
      },
      {
        type: 'short_term',
        title: 'Manual Configuration',
        description: 'Manually configure required settings.',
        commands: [
          'trust config set api.huggingface.token <your-token>',
          'trust config set backends.ollama.url http://localhost:11434',
        ],
        automated: false,
        difficulty: 'moderate',
        estimatedTime: '3-10 minutes',
      },
    ];
  }

  private generateNetworkErrorSolutions(): ErrorSolution[] {
    return [
      {
        type: 'immediate',
        title: 'Check Network Connectivity',
        description: 'Verify basic network connectivity.',
        commands: [
          'ping google.com',
          'curl -I https://api.huggingface.co',
          'trust status --network',
        ],
        automated: false,
        difficulty: 'easy',
        estimatedTime: '30 seconds',
      },
      {
        type: 'short_term',
        title: 'Configure Proxy Settings',
        description: 'Set up proxy configuration if behind corporate firewall.',
        commands: [
          'trust config set proxy.http http://proxy:8080',
          'trust config set proxy.https https://proxy:8080',
        ],
        automated: false,
        difficulty: 'moderate',
        estimatedTime: '2-5 minutes',
      },
      {
        type: 'long_term',
        title: 'Use Offline Mode',
        description: 'Configure Trust CLI for offline operation.',
        commands: [
          'trust config set mode offline',
          'trust model-enhanced backends --local-only',
        ],
        automated: false,
        difficulty: 'advanced',
        estimatedTime: '10-20 minutes',
      },
    ];
  }

  private generatePermissionSolutions(): ErrorSolution[] {
    return [
      {
        type: 'immediate',
        title: 'Fix File Permissions',
        description: 'Correct file and directory permissions.',
        commands: [
          'chmod 755 ~/.trust',
          'chmod 644 ~/.trust/config.json',
          'chown -R $USER ~/.trust',
        ],
        automated: false,
        difficulty: 'easy',
        estimatedTime: '30 seconds',
      },
      {
        type: 'immediate',
        title: 'Run with Elevated Permissions',
        description: 'Use sudo for operations requiring elevated privileges.',
        commands: ['sudo trust <command>', 'sudo ollama pull <model>'],
        automated: false,
        difficulty: 'easy',
        estimatedTime: '30 seconds',
      },
      {
        type: 'short_term',
        title: 'Add User to Required Groups',
        description:
          'Add your user to groups that have the necessary permissions.',
        commands: ['sudo usermod -a -G docker $USER', 'newgrp docker'],
        automated: false,
        difficulty: 'moderate',
        estimatedTime: '2-5 minutes',
      },
    ];
  }

  private generateRoutingFailedSolutions(): ErrorSolution[] {
    return [
      {
        type: 'immediate',
        title: 'Use Smart Recommendations',
        description: 'Get AI-powered model recommendations for your system.',
        commands: [
          'trust model-enhanced smart-recommend',
          'trust model-enhanced resource-check',
        ],
        automated: true,
        difficulty: 'easy',
        estimatedTime: '1 minute',
      },
      {
        type: 'immediate',
        title: 'Expand Model Selection',
        description: 'Install additional models or enable more backends.',
        commands: [
          'ollama pull qwen2.5:1.5b',
          'ollama pull phi3.5:3.8b-mini-instruct',
          'trust config set backends.huggingface.enabled true',
        ],
        automated: false,
        difficulty: 'easy',
        estimatedTime: '3-10 minutes',
      },
      {
        type: 'short_term',
        title: 'Adjust Resource Constraints',
        description: 'Modify filtering criteria to allow more model options.',
        commands: [
          'trust model-enhanced filter --ram-limit 8 --verbose',
          'trust model-enhanced smart-default --urgency low',
        ],
        automated: false,
        difficulty: 'moderate',
        estimatedTime: '2-5 minutes',
      },
    ];
  }

  private getSeverityIcon(severity: EnhancedError['severity']): string {
    switch (severity) {
      case 'critical':
        return '🔴';
      case 'high':
        return '🟠';
      case 'medium':
        return '🟡';
      case 'low':
        return '🟢';
      default:
        return '❓';
    }
  }

  private getSolutionTypeIcon(type: ErrorSolution['type']): string {
    switch (type) {
      case 'immediate':
        return '⚡';
      case 'short_term':
        return '🔧';
      case 'long_term':
        return '🛠️';
      default:
        return '🔧';
    }
  }

  private getDifficultyIcon(difficulty: ErrorSolution['difficulty']): string {
    switch (difficulty) {
      case 'easy':
        return '🟢';
      case 'moderate':
        return '🟡';
      case 'advanced':
        return '🔴';
      default:
        return '❓';
    }
  }
}
