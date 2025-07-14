/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ModelContext, ModelCapabilities } from './unifiedModelInterface.js';

/**
 * Configuration for smart context management
 */
export interface ContextManagementConfig {
  /** Maximum context utilization before triggering compression (0-1, default: 0.85) */
  maxUtilization?: number;
  /** Minimum context utilization to maintain after compression (0-1, default: 0.5) */
  targetUtilization?: number;
  /** Enable automatic context compression (default: true) */
  enableAutoCompression?: boolean;
  /** Enable context summarization (default: true) */
  enableSummarization?: boolean;
  /** Number of messages to preserve from the beginning (system prompts, etc.) */
  preserveFirstMessages?: number;
  /** Number of messages to preserve from the end (recent context) */
  preserveLastMessages?: number;
  /** Maximum compression attempts before fallback (default: 3) */
  maxCompressionAttempts?: number;
  /** Enable performance metrics (default: true) */
  enableMetrics?: boolean;
}

/**
 * Context management metrics
 */
export interface ContextMetrics {
  /** Current token count */
  currentTokens: number;
  /** Maximum token capacity */
  maxTokens: number;
  /** Current utilization percentage (0-100) */
  utilization: number;
  /** Number of compression operations performed */
  compressionCount: number;
  /** Number of messages removed by compression */
  messagesRemoved: number;
  /** Bytes saved through compression */
  bytesSaved: number;
  /** Average compression ratio (original/compressed) */
  averageCompressionRatio: number;
  /** Last compression timestamp */
  lastCompression: Date | null;
  /** Total context management operations */
  totalOperations: number;
}

/**
 * Message with enhanced metadata for context management
 */
export interface EnhancedMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  tokenCount: number;
  importance: number; // 0-1 scale, 1 being most important
  compressed: boolean;
  originalLength?: number;
  messageId: string;
}

/**
 * Context compression result
 */
export interface CompressionResult {
  success: boolean;
  originalTokens: number;
  compressedTokens: number;
  compressionRatio: number;
  messagesAffected: number;
  errorMessage?: string;
}

/**
 * Smart context manager that handles context window optimization
 */
export class SmartContextManager {
  private readonly config: Required<ContextManagementConfig>;
  private readonly metrics: ContextMetrics;
  private compressionHistory: CompressionResult[] = [];

  constructor(
    private readonly modelCapabilities: ModelCapabilities,
    config: ContextManagementConfig = {}
  ) {
    this.config = {
      maxUtilization: config.maxUtilization ?? 0.85,
      targetUtilization: config.targetUtilization ?? 0.5,
      enableAutoCompression: config.enableAutoCompression ?? true,
      enableSummarization: config.enableSummarization ?? true,
      preserveFirstMessages: config.preserveFirstMessages ?? 2,
      preserveLastMessages: config.preserveLastMessages ?? 5,
      maxCompressionAttempts: config.maxCompressionAttempts ?? 3,
      enableMetrics: config.enableMetrics ?? true
    };

    this.metrics = {
      currentTokens: 0,
      maxTokens: modelCapabilities.maxContextSize,
      utilization: 0,
      compressionCount: 0,
      messagesRemoved: 0,
      bytesSaved: 0,
      averageCompressionRatio: 1.0,
      lastCompression: null,
      totalOperations: 0
    };
  }

  /**
   * Manage context for a given model context
   */
  async manageContext(context: ModelContext): Promise<void> {
    if (!this.config.enableAutoCompression) {
      return;
    }

    this.updateMetrics(context);

    if (this.metrics.utilization > this.config.maxUtilization) {
      await this.compressContext(context);
    }
  }

  /**
   * Compress context to reduce token usage
   */
  async compressContext(context: ModelContext): Promise<CompressionResult> {
    const originalTokens = context.getTokenCount();
    let attempts = 0;
    let success = false;
    let errorMessage: string | undefined;

    while (attempts < this.config.maxCompressionAttempts && !success) {
      attempts++;

      try {
        const compressionResult = await this.performCompression(context, attempts);
        
        if (compressionResult.success) {
          success = true;
          this.updateCompressionMetrics(compressionResult);
          return compressionResult;
        }
      } catch (error) {
        errorMessage = error instanceof Error ? error.message : String(error);
      }
    }

    return {
      success: false,
      originalTokens,
      compressedTokens: context.getTokenCount(),
      compressionRatio: 1.0,
      messagesAffected: 0,
      errorMessage: errorMessage || 'Maximum compression attempts reached'
    };
  }

  /**
   * Perform a single compression operation
   */
  private async performCompression(context: ModelContext, attempt: number): Promise<CompressionResult> {
    const originalTokens = context.getTokenCount();
    const messages = context.getMessages();
    
    // Convert to enhanced messages for better management
    const enhancedMessages = this.convertToEnhancedMessages(messages);
    
    // Calculate how many tokens we need to remove
    const targetTokens = Math.floor(this.metrics.maxTokens * this.config.targetUtilization);
    const tokensToRemove = originalTokens - targetTokens;
    
    if (tokensToRemove <= 0) {
      return {
        success: true,
        originalTokens,
        compressedTokens: originalTokens,
        compressionRatio: 1.0,
        messagesAffected: 0
      };
    }

    // Choose compression strategy based on attempt number
    const strategy = this.selectCompressionStrategy(attempt);
    const compressedMessages = await this.applyCompressionStrategy(enhancedMessages, strategy, tokensToRemove);
    
    // Update context with compressed messages
    context.clear();
    for (const message of compressedMessages) {
      context.addMessage(message.role, message.content);
    }

    const compressedTokens = context.getTokenCount();
    const messagesAffected = messages.length - compressedMessages.length;

    return {
      success: compressedTokens <= targetTokens,
      originalTokens,
      compressedTokens,
      compressionRatio: originalTokens / compressedTokens,
      messagesAffected
    };
  }

  /**
   * Select compression strategy based on attempt number
   */
  private selectCompressionStrategy(attempt: number): 'truncate' | 'summarize' | 'adaptive' {
    switch (attempt) {
      case 1: return 'truncate'; // First attempt: simple truncation
      case 2: return 'summarize'; // Second attempt: summarization
      default: return 'adaptive'; // Fallback: adaptive approach
    }
  }

  /**
   * Apply compression strategy to messages
   */
  private async applyCompressionStrategy(
    messages: EnhancedMessage[],
    strategy: 'truncate' | 'summarize' | 'adaptive',
    tokensToRemove: number
  ): Promise<EnhancedMessage[]> {
    switch (strategy) {
      case 'truncate':
        return this.truncateMessages(messages, tokensToRemove);
      case 'summarize':
        return await this.summarizeMessages(messages, tokensToRemove);
      case 'adaptive':
        return await this.adaptiveCompression(messages, tokensToRemove);
      default:
        return messages;
    }
  }

  /**
   * Simple truncation strategy - remove middle messages
   */
  private truncateMessages(messages: EnhancedMessage[], tokensToRemove: number): EnhancedMessage[] {
    const preserve = this.config.preserveFirstMessages + this.config.preserveLastMessages;
    
    if (messages.length <= preserve) {
      return messages; // Can't truncate further
    }

    // Calculate which messages to remove from the middle
    const start = this.config.preserveFirstMessages;
    const end = messages.length - this.config.preserveLastMessages;
    
    let removedTokens = 0;
    let removeCount = 0;
    
    for (let i = start; i < end && removedTokens < tokensToRemove; i++) {
      removedTokens += messages[i].tokenCount;
      removeCount++;
    }

    return [
      ...messages.slice(0, start),
      ...messages.slice(end)
    ];
  }

  /**
   * Summarization strategy - compress content while preserving meaning
   */
  private async summarizeMessages(messages: EnhancedMessage[], tokensToRemove: number): Promise<EnhancedMessage[]> {
    // Find messages in the middle that can be summarized
    const start = this.config.preserveFirstMessages;
    const end = messages.length - this.config.preserveLastMessages;
    
    if (start >= end) {
      return messages; // Nothing to summarize
    }

    const middleMessages = messages.slice(start, end);
    const summarizedContent = this.createSummary(middleMessages);
    
    // Create a single summarized message
    const summaryMessage: EnhancedMessage = {
      role: 'assistant',
      content: `[SUMMARY] ${summarizedContent}`,
      timestamp: new Date(),
      tokenCount: Math.ceil(summarizedContent.length / 4), // Rough token estimate
      importance: 0.7, // Medium importance for summaries
      compressed: true,
      originalLength: middleMessages.reduce((sum, m) => sum + m.content.length, 0),
      messageId: `summary_${Date.now()}`
    };

    return [
      ...messages.slice(0, start),
      summaryMessage,
      ...messages.slice(end)
    ];
  }

  /**
   * Adaptive compression - combines multiple strategies
   */
  private async adaptiveCompression(messages: EnhancedMessage[], tokensToRemove: number): Promise<EnhancedMessage[]> {
    // Sort messages by importance (excluding preserved messages)
    const start = this.config.preserveFirstMessages;
    const end = messages.length - this.config.preserveLastMessages;
    
    const preservedStart = messages.slice(0, start);
    const preservedEnd = messages.slice(end);
    const compressibleMessages = messages.slice(start, end);
    
    // Sort by importance (ascending - remove least important first)
    compressibleMessages.sort((a, b) => a.importance - b.importance);
    
    let removedTokens = 0;
    const keptMessages: EnhancedMessage[] = [];
    
    // Remove messages starting from least important
    for (const message of compressibleMessages) {
      if (removedTokens >= tokensToRemove) {
        keptMessages.push(message);
      } else {
        removedTokens += message.tokenCount;
      }
    }
    
    // If we still need to remove more tokens, create a summary
    if (removedTokens < tokensToRemove && keptMessages.length > 2) {
      const toSummarize = keptMessages.splice(0, Math.floor(keptMessages.length / 2));
      const summary = this.createSummary(toSummarize);
      
      keptMessages.unshift({
        role: 'assistant',
        content: `[SUMMARY] ${summary}`,
        timestamp: new Date(),
        tokenCount: Math.ceil(summary.length / 4),
        importance: 0.8,
        compressed: true,
        originalLength: toSummarize.reduce((sum, m) => sum + m.content.length, 0),
        messageId: `adaptive_summary_${Date.now()}`
      });
    }

    // Restore chronological order for kept messages
    keptMessages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    return [
      ...preservedStart,
      ...keptMessages,
      ...preservedEnd
    ];
  }

  /**
   * Create a summary of messages
   */
  private createSummary(messages: EnhancedMessage[]): string {
    if (messages.length === 0) return '';
    
    // Simple extractive summarization
    const content = messages.map(m => `${m.role}: ${m.content}`).join(' ');
    
    // Extract key sentences (very basic approach)
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 10);
    const maxSentences = Math.max(1, Math.min(3, Math.floor(sentences.length / 3)));
    
    // Take sentences from beginning, middle, and end
    const summary = [];
    if (sentences.length > 0) summary.push(sentences[0]);
    if (sentences.length > 2) summary.push(sentences[Math.floor(sentences.length / 2)]);
    if (sentences.length > 1) summary.push(sentences[sentences.length - 1]);
    
    return summary.slice(0, maxSentences).join('. ') + '.';
  }

  /**
   * Convert standard messages to enhanced messages
   */
  private convertToEnhancedMessages(messages: Array<{ role: string; content: string }>): EnhancedMessage[] {
    return messages.map((message, index) => ({
      role: message.role as 'user' | 'assistant' | 'system',
      content: message.content,
      timestamp: new Date(Date.now() - (messages.length - index) * 1000), // Approximate timestamps
      tokenCount: Math.ceil(message.content.length / 4), // Rough token estimate
      importance: this.calculateMessageImportance(message, index, messages.length),
      compressed: false,
      messageId: `msg_${index}_${Date.now()}`
    }));
  }

  /**
   * Calculate message importance for compression decisions
   */
  private calculateMessageImportance(
    message: { role: string; content: string },
    index: number,
    totalMessages: number
  ): number {
    let importance = 0.5; // Base importance

    // System messages are very important
    if (message.role === 'system') {
      importance = 1.0;
    }
    
    // Recent messages are more important
    const recency = index / totalMessages;
    importance += recency * 0.3;
    
    // Longer messages might be more important
    if (message.content.length > 200) {
      importance += 0.1;
    }
    
    // Messages with code blocks are important
    if (message.content.includes('```')) {
      importance += 0.2;
    }
    
    // Questions are important
    if (message.content.includes('?')) {
      importance += 0.1;
    }

    return Math.min(1.0, importance);
  }

  /**
   * Update metrics based on current context
   */
  private updateMetrics(context: ModelContext): void {
    if (!this.config.enableMetrics) return;

    this.metrics.currentTokens = context.getTokenCount();
    this.metrics.utilization = (this.metrics.currentTokens / this.metrics.maxTokens) * 100;
    this.metrics.totalOperations++;
  }

  /**
   * Update compression-specific metrics
   */
  private updateCompressionMetrics(result: CompressionResult): void {
    if (!this.config.enableMetrics) return;

    this.metrics.compressionCount++;
    this.metrics.messagesRemoved += result.messagesAffected;
    
    const bytesSaved = (result.originalTokens - result.compressedTokens) * 4; // Rough bytes per token
    this.metrics.bytesSaved += bytesSaved;
    
    // Update average compression ratio
    this.compressionHistory.push(result);
    if (this.compressionHistory.length > 100) {
      this.compressionHistory.shift(); // Keep only last 100 compressions
    }
    
    this.metrics.averageCompressionRatio = this.compressionHistory.reduce(
      (sum, r) => sum + r.compressionRatio, 0
    ) / this.compressionHistory.length;
    
    this.metrics.lastCompression = new Date();
  }

  /**
   * Get current context metrics
   */
  getMetrics(): ContextMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics.compressionCount = 0;
    this.metrics.messagesRemoved = 0;
    this.metrics.bytesSaved = 0;
    this.metrics.totalOperations = 0;
    this.metrics.lastCompression = null;
    this.compressionHistory = [];
  }

  /**
   * Check if context needs compression
   */
  needsCompression(context: ModelContext): boolean {
    const utilization = (context.getTokenCount() / this.metrics.maxTokens);
    return utilization > this.config.maxUtilization;
  }

  /**
   * Estimate tokens for a given text
   */
  estimateTokens(text: string): number {
    // Simple estimation: ~4 characters per token for most models
    return Math.ceil(text.length / 4);
  }

  /**
   * Get optimal batch size for the current context
   */
  getOptimalBatchSize(): number {
    const available = this.metrics.maxTokens - this.metrics.currentTokens;
    const safetyMargin = this.metrics.maxTokens * 0.1; // 10% safety margin
    return Math.max(100, available - safetyMargin);
  }
}

/**
 * Context manager factory for creating optimized managers per model
 */
export class ContextManagerFactory {
  private static managers = new Map<string, SmartContextManager>();

  /**
   * Get or create a context manager for a specific model
   */
  static getManager(
    modelName: string,
    capabilities: ModelCapabilities,
    config?: ContextManagementConfig
  ): SmartContextManager {
    if (!this.managers.has(modelName)) {
      this.managers.set(modelName, new SmartContextManager(capabilities, config));
    }
    return this.managers.get(modelName)!;
  }

  /**
   * Clear all cached managers
   */
  static clearCache(): void {
    this.managers.clear();
  }

  /**
   * Get manager metrics for all models
   */
  static getAllMetrics(): Record<string, ContextMetrics> {
    const metrics: Record<string, ContextMetrics> = {};
    for (const [modelName, manager] of this.managers) {
      metrics[modelName] = manager.getMetrics();
    }
    return metrics;
  }
}