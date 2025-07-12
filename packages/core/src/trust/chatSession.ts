/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { TrustNodeLlamaClient } from './nodeLlamaClient.js';
import { TrustModelConfig, GenerationOptions } from './types.js';
import { globalPerformanceMonitor } from './performanceMonitor.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

/**
 * Chat message interface
 */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  modelUsed?: string;
  tokensUsed?: number;
  responseTime?: number;
  isCompressed?: boolean; // Indicates if this message was part of compression
}

/**
 * Compression information for tracking context reduction
 */
export interface ChatCompressionInfo {
  originalMessageCount: number;
  compressedMessageCount: number;
  compressionRatio: number;
  timestamp: Date;
  preservedRecentCount: number;
}

/**
 * Chat session configuration
 */
export interface ChatSessionConfig {
  sessionId?: string;
  systemPrompt?: string;
  maxHistory?: number;
  persistHistory?: boolean;
  modelConfig?: TrustModelConfig;
  generationOptions?: GenerationOptions;
  compressionThreshold?: number; // Number of messages before compression
  recentHistorySize?: number; // Number of recent messages to preserve during compression
}

/**
 * Enhanced chat session with streaming and history management
 * Part of Trust: An Open System for Modern Assurance
 */
export class TrustChatSession {
  private client: TrustNodeLlamaClient;
  private config: ChatSessionConfig;
  private messages: ChatMessage[] = [];
  private sessionId: string;
  private historyPath?: string;

  constructor(client: TrustNodeLlamaClient, config: ChatSessionConfig = {}) {
    this.client = client;
    this.config = {
      maxHistory: 50,
      persistHistory: true,
      compressionThreshold: 30, // Compress when more than 30 messages
      recentHistorySize: 10, // Preserve last 10 messages during compression
      ...config,
    };
    this.sessionId = config.sessionId || this.generateSessionId();

    if (this.config.persistHistory) {
      this.historyPath = path.join(
        os.homedir(),
        '.trustcli',
        'history',
        `${this.sessionId}.json`,
      );
    }
  }

  /**
   * Initialize the chat session
   */
  async initialize(): Promise<void> {
    // Load existing history if available
    if (this.historyPath) {
      try {
        await fs.mkdir(path.dirname(this.historyPath), { recursive: true });
        const historyData = await fs.readFile(this.historyPath, 'utf-8');
        const history = JSON.parse(historyData);
        this.messages = history.messages || [];
      } catch (_error) {
        // History file doesn't exist yet, start fresh
        this.messages = [];
      }
    }

    // Add system prompt if provided
    if (this.config.systemPrompt) {
      this.addMessage('system', this.config.systemPrompt);
    }
  }

  /**
   * Send a message and get streaming response
   */
  async *sendMessage(
    content: string,
    options?: GenerationOptions,
  ): AsyncGenerator<{ chunk: string; messageId: string; isComplete: boolean }> {
    const messageId = this.generateMessageId();
    const startTime = Date.now();

    // Add user message to history
    this.addMessage('user', content);

    // Prepare the conversation context
    const conversationContext = this.buildConversationContext();
    const finalOptions = { ...this.config.generationOptions, ...options };

    let fullResponse = '';
    let tokenCount = 0;

    try {
      // Generate streaming response
      for await (const chunk of this.client.generateStream(
        conversationContext,
        finalOptions,
      )) {
        fullResponse += chunk;
        tokenCount++;

        yield {
          chunk,
          messageId,
          isComplete: false,
        };
      }

      const responseTime = Date.now() - startTime;

      // Add assistant response to history
      const assistantMessage = this.addMessage('assistant', fullResponse, {
        modelUsed: this.client.getModelInfo()?.name,
        tokensUsed: tokenCount,
        responseTime,
      });

      // Record performance metrics
      globalPerformanceMonitor.recordInference({
        tokensPerSecond: tokenCount / (responseTime / 1000),
        totalTokens: tokenCount,
        inferenceTime: responseTime,
        modelName: this.client.getModelInfo()?.name || 'unknown',
        promptLength: content.length,
        responseLength: fullResponse.length,
        timestamp: new Date(),
      });

      // Check if compression is needed
      if (this.shouldCompress()) {
        await this.compressHistory();
      }

      // Save history
      await this.saveHistory();

      yield {
        chunk: '',
        messageId: assistantMessage.id,
        isComplete: true,
      };
    } catch (error) {
      console.error('Error in chat session:', error);

      // Add error message to history
      const errorMessage = this.addMessage('assistant', `Error: ${error}`, {
        modelUsed: this.client.getModelInfo()?.name,
        responseTime: Date.now() - startTime,
      });

      yield {
        chunk: `Error: ${error}`,
        messageId: errorMessage.id,
        isComplete: true,
      };
    }
  }

  /**
   * Send a message and get complete response (non-streaming)
   */
  async sendMessageSync(
    content: string,
    options?: GenerationOptions,
  ): Promise<ChatMessage> {
    let _fullResponse = '';
    let messageId = '';

    for await (const { chunk, messageId: id, isComplete } of this.sendMessage(
      content,
      options,
    )) {
      _fullResponse += chunk;
      messageId = id;

      if (isComplete) {
        break;
      }
    }

    return this.getMessageById(messageId)!;
  }

  /**
   * Get chat history
   */
  getHistory(): ChatMessage[] {
    return [...this.messages];
  }

  /**
   * Clear chat history
   */
  async clearHistory(): Promise<void> {
    this.messages = [];

    // Re-add system prompt if configured
    if (this.config.systemPrompt) {
      this.addMessage('system', this.config.systemPrompt);
    }

    await this.saveHistory();
  }

  /**
   * Get conversation statistics
   */
  getStats(): {
    totalMessages: number;
    userMessages: number;
    assistantMessages: number;
    averageResponseTime: number;
    totalTokensUsed: number;
  } {
    const userMessages = this.messages.filter((m) => m.role === 'user').length;
    const assistantMessages = this.messages.filter(
      (m) => m.role === 'assistant',
    );
    const totalTokens = assistantMessages.reduce(
      (sum, m) => sum + (m.tokensUsed || 0),
      0,
    );
    const avgResponseTime =
      assistantMessages.reduce((sum, m) => sum + (m.responseTime || 0), 0) /
      assistantMessages.length;

    return {
      totalMessages: this.messages.length,
      userMessages,
      assistantMessages: assistantMessages.length,
      averageResponseTime: avgResponseTime || 0,
      totalTokensUsed: totalTokens,
    };
  }

  /**
   * Export conversation as markdown
   */
  exportAsMarkdown(): string {
    let markdown = `# Trust CLI Conversation\\n`;
    markdown += `**Session ID:** ${this.sessionId}\\n`;
    markdown += `**Date:** ${new Date().toISOString()}\\n\\n`;

    for (const message of this.messages) {
      if (message.role === 'system') continue;

      const role = message.role === 'user' ? '**User**' : '**Assistant**';
      const timestamp = message.timestamp.toLocaleString();

      markdown += `## ${role} (${timestamp})\\n\\n`;
      markdown += `${message.content}\\n\\n`;

      if (message.role === 'assistant' && message.modelUsed) {
        markdown += `*Model: ${message.modelUsed}*`;
        if (message.tokensUsed) {
          markdown += ` | *Tokens: ${message.tokensUsed}*`;
        }
        if (message.responseTime) {
          markdown += ` | *Time: ${message.responseTime}ms*`;
        }
        markdown += '\\n\\n';
      }
    }

    return markdown;
  }

  /**
   * Compress conversation history to preserve recent context while reducing size
   * Based on upstream Gemini CLI context compression implementation
   */
  async compressHistory(): Promise<ChatCompressionInfo | null> {
    const nonSystemMessages = this.messages.filter((m) => m.role !== 'system');

    if (
      !this.config.compressionThreshold ||
      nonSystemMessages.length <= this.config.compressionThreshold
    ) {
      return null; // No compression needed
    }

    const systemMessages = this.messages.filter((m) => m.role === 'system');
    const recentHistorySize = this.config.recentHistorySize || 10;

    // Preserve recent messages
    const recentMessages = nonSystemMessages.slice(-recentHistorySize);
    const olderMessages = nonSystemMessages.slice(0, -recentHistorySize);

    if (olderMessages.length === 0) {
      return null; // Nothing to compress
    }

    try {
      // Create a summary of older messages
      const compressionContext = this.buildCompressionContext(olderMessages);
      const compressionPrompt = this.getCompressionPrompt(compressionContext);

      // Generate compressed summary using the client
      const compressedSummary =
        await this.generateCompression(compressionPrompt);

      // Create compressed message
      const compressedMessage: ChatMessage = {
        id: this.generateMessageId(),
        role: 'system',
        content: `[COMPRESSED HISTORY] ${compressedSummary}`,
        timestamp: new Date(),
        isCompressed: true,
      };

      // Replace old messages with compressed summary
      this.messages = [...systemMessages, compressedMessage, ...recentMessages];

      const compressionInfo: ChatCompressionInfo = {
        originalMessageCount: systemMessages.length + nonSystemMessages.length,
        compressedMessageCount: this.messages.length,
        compressionRatio: olderMessages.length / this.messages.length,
        timestamp: new Date(),
        preservedRecentCount: recentMessages.length,
      };

      // Save updated history
      await this.saveHistory();

      return compressionInfo;
    } catch (error) {
      console.warn('Failed to compress chat history:', error);
      return null;
    }
  }

  /**
   * Check if compression should be triggered
   */
  shouldCompress(): boolean {
    if (!this.config.compressionThreshold) {
      return false;
    }

    const nonSystemMessages = this.messages.filter((m) => m.role !== 'system');
    return nonSystemMessages.length > this.config.compressionThreshold;
  }

  private addMessage(
    role: 'user' | 'assistant' | 'system',
    content: string,
    metadata?: Partial<ChatMessage>,
  ): ChatMessage {
    const message: ChatMessage = {
      id: this.generateMessageId(),
      role,
      content,
      timestamp: new Date(),
      ...metadata,
    };

    this.messages.push(message);

    // Trim history if needed
    if (
      this.config.maxHistory &&
      this.messages.length > this.config.maxHistory
    ) {
      const systemMessages = this.messages.filter((m) => m.role === 'system');
      const otherMessages = this.messages.filter((m) => m.role !== 'system');

      // Keep system messages and trim others
      const trimmed = otherMessages.slice(
        -this.config.maxHistory + systemMessages.length,
      );
      this.messages = [...systemMessages, ...trimmed];
    }

    return message;
  }

  private buildConversationContext(): string {
    let context = '';

    for (const message of this.messages) {
      if (message.role === 'system') {
        context += `System: ${message.content}\\n\\n`;
      } else if (message.role === 'user') {
        context += `User: ${message.content}\\n\\n`;
      } else if (message.role === 'assistant') {
        context += `Assistant: ${message.content}\\n\\n`;
      }
    }

    return context.trim();
  }

  private async saveHistory(): Promise<void> {
    if (!this.historyPath || !this.config.persistHistory) {
      return;
    }

    try {
      const historyData = {
        sessionId: this.sessionId,
        createdAt: new Date().toISOString(),
        messages: this.messages,
      };

      await fs.writeFile(
        this.historyPath,
        JSON.stringify(historyData, null, 2),
      );
    } catch (error) {
      console.warn('Failed to save chat history:', error);
    }
  }

  private getMessageById(id: string): ChatMessage | undefined {
    return this.messages.find((m) => m.id === id);
  }

  private generateSessionId(): string {
    return `trust-session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateMessageId(): string {
    return `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private buildCompressionContext(messages: ChatMessage[]): string {
    let context = '';

    for (const message of messages) {
      if (message.role === 'user') {
        context += `User: ${message.content}\n\n`;
      } else if (message.role === 'assistant') {
        context += `Assistant: ${message.content}\n\n`;
      }
    }

    return context.trim();
  }

  private getCompressionPrompt(context: string): string {
    return `Please provide a concise summary of this conversation history, preserving key context and important details:

${context}

Summary:`;
  }

  private async generateCompression(prompt: string): Promise<string> {
    try {
      // Use the client to generate a compression summary
      let summary = '';
      for await (const chunk of this.client.generateStream(prompt, {
        maxTokens: 500, // Limit summary length
        temperature: 0.3, // Lower temperature for more consistent summaries
      })) {
        summary += chunk;
      }
      return summary.trim();
    } catch (_error) {
      // Fallback to simple truncation if AI compression fails
      const lines = prompt.split('\n').slice(0, 10);
      return `Previous conversation context: ${lines.join(' ')}...`;
    }
  }
}
