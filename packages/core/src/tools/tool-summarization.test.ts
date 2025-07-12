/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { Tool, ToolResult } from './tools.js';
import { ContentGenerator } from '../core/contentGenerator.js';

// Mock ContentGenerator
const mockContentGenerator: ContentGenerator = {
  generateContent: vi.fn().mockResolvedValue({
    candidates: [{ content: { parts: [{ text: 'Mock summary' }] } }],
  }),
  generateContentStream: vi.fn(),
  countTokens: vi.fn(),
  embedContent: vi.fn(),
};

// Mock tool with summarizer
class MockToolWithSummarizer implements Tool<{ input: string }, ToolResult> {
  name = 'mock-tool';
  displayName = 'Mock Tool';
  description = 'A test tool';
  isOutputMarkdown = true;
  canUpdateOutput = false;

  get schema() {
    return {
      name: this.name,
      description: this.description,
      parameters: {
        type: 'object',
        properties: {
          input: { type: 'string' },
        },
      },
    };
  }

  validateToolParams(): string | null {
    return null;
  }

  getDescription(): string {
    return 'Mock tool description';
  }

  shouldConfirmExecute(): Promise<false> {
    return Promise.resolve(false);
  }

  async execute(): Promise<ToolResult> {
    return {
      llmContent:
        'Tool executed successfully with lots of detailed output that could benefit from summarization',
      returnDisplay:
        'Tool executed successfully with lots of detailed output that could benefit from summarization',
    };
  }

  // Summarizer implementation
  async summarizer(
    result: ToolResult,
    contentGenerator: ContentGenerator,
    _signal: AbortSignal,
  ): Promise<string> {
    const prompt = `Summarize this tool output concisely: ${JSON.stringify(result.llmContent)}`;

    const response = await contentGenerator.generateContent({
      model: 'test-model',
      contents: [{ parts: [{ text: prompt }] }],
    });

    return (
      response.candidates?.[0]?.content?.parts?.[0]?.text ||
      'Summary generation failed'
    );
  }
}

describe('Tool Summarization Feature', () => {
  it('should allow tools to have optional summarizer method', () => {
    const tool = new MockToolWithSummarizer();
    expect(tool.summarizer).toBeDefined();
    expect(typeof tool.summarizer).toBe('function');
  });

  it('should generate summary when tool has summarizer', async () => {
    const tool = new MockToolWithSummarizer();
    const toolResult = await tool.execute({}, new AbortController().signal);

    expect(toolResult.llmContent).toBeDefined();
    expect(toolResult.returnDisplay).toBeDefined();

    // Test summarizer
    const summary = await tool.summarizer!(
      toolResult,
      mockContentGenerator,
      new AbortController().signal,
    );

    expect(summary).toBe('Mock summary');
    expect(mockContentGenerator.generateContent).toHaveBeenCalled();
  });

  it('should include summary field in ToolResult interface', () => {
    const result: ToolResult = {
      llmContent: 'test content',
      returnDisplay: 'test display',
      summary: 'test summary',
    };

    expect(result.summary).toBe('test summary');
  });

  it('should work without summarizer (backward compatibility)', async () => {
    class MockToolWithoutSummarizer
      implements Tool<{ input: string }, ToolResult>
    {
      name = 'mock-tool-no-summarizer';
      displayName = 'Mock Tool No Summarizer';
      description = 'A test tool without summarizer';
      isOutputMarkdown = true;
      canUpdateOutput = false;

      get schema() {
        return {
          name: this.name,
          description: this.description,
          parameters: {
            type: 'object',
            properties: { input: { type: 'string' } },
          },
        };
      }

      validateToolParams(): string | null {
        return null;
      }
      getDescription(): string {
        return 'Mock tool description';
      }
      shouldConfirmExecute(): Promise<false> {
        return Promise.resolve(false);
      }

      async execute(): Promise<ToolResult> {
        return {
          llmContent: 'Tool executed without summarizer',
          returnDisplay: 'Tool executed without summarizer',
        };
      }
      // No summarizer method
    }

    const tool = new MockToolWithoutSummarizer();
    expect(tool.summarizer).toBeUndefined();

    const result = await tool.execute({}, new AbortController().signal);
    expect(result.llmContent).toBeDefined();
    expect(result.returnDisplay).toBeDefined();
    expect(result.summary).toBeUndefined();
  });
});
