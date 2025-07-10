/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { WebSearchTool } from './web-search.js';
import { Config } from '../config/config.js';

describe('WebSearchTool', () => {
  let mockConfig: Config;
  let webSearchTool: WebSearchTool;

  beforeEach(() => {
    mockConfig = {
      getGeminiClient: vi.fn(),
    } as unknown as Config;
    webSearchTool = new WebSearchTool(mockConfig);
  });

  describe('validateToolParams', () => {
    it('should accept valid search queries', () => {
      expect(webSearchTool.validateToolParams({ query: 'latest Node.js documentation' })).toBeNull();
      expect(webSearchTool.validateToolParams({ query: 'weather in San Francisco' })).toBeNull();
      expect(webSearchTool.validateToolParams({ query: 'how to use React hooks' })).toBeNull();
      expect(webSearchTool.validateToolParams({ query: 'current stock price of AAPL' })).toBeNull();
    });

    it('should reject empty queries', () => {
      expect(webSearchTool.validateToolParams({ query: '' })).toContain('cannot be empty');
      expect(webSearchTool.validateToolParams({ query: '   ' })).toContain('cannot be empty');
    });

    describe('arithmetic filtering', () => {
      it('should reject simple arithmetic expressions', () => {
        const testCases = [
          '2 + 2',
          '10 - 5',
          '3 * 4',
          '20 / 4',
          '(5 + 3) * 2',
          '3.14 * 2',
          '100 / 25',
        ];

        testCases.forEach(query => {
          const result = webSearchTool.validateToolParams({ query });
          expect(result).toContain('Web search is not needed for basic arithmetic');
        });
      });

      it('should reject arithmetic questions with natural language', () => {
        const testCases = [
          'what is 2 + 2',
          'calculate 10 * 5',
          'compute 100 / 4',
          'solve 15 - 8',
          'evaluate (3 + 5) * 2',
          'What is 3.14 * 2',
          'CALCULATE 25 + 75',
        ];

        testCases.forEach(query => {
          const result = webSearchTool.validateToolParams({ query });
          expect(result).toContain('Web search is not needed for basic arithmetic');
        });
      });
    });

    describe('number property filtering', () => {
      it('should reject prime number checks', () => {
        const testCases = [
          'is 17 prime',
          'is 23 a prime number',
          '13 prime',
          'IS 29 PRIME',
          'is 7 a prime',
        ];

        testCases.forEach(query => {
          const result = webSearchTool.validateToolParams({ query });
          expect(result).toContain('Web search is not needed for basic number properties');
        });
      });

      it('should reject even/odd checks', () => {
        const testCases = [
          'is 4 even',
          'is 7 odd',
          '10 even',
          'IS 15 ODD',
          'is 22 even',
        ];

        testCases.forEach(query => {
          const result = webSearchTool.validateToolParams({ query });
          expect(result).toContain('Web search is not needed for basic number properties');
        });
      });
    });

    it('should accept complex mathematical queries that might need research', () => {
      const validQueries = [
        'Riemann hypothesis proof',
        'latest developments in quantum computing',
        'how to solve differential equations',
        'machine learning algorithms comparison',
        'what is the value of pi to 100 digits',
      ];

      validQueries.forEach(query => {
        expect(webSearchTool.validateToolParams({ query })).toBeNull();
      });
    });
  });

  describe('tool description', () => {
    it('should include clear guidance on when to use the tool', () => {
      expect(webSearchTool.description).toContain('DO NOT use this tool for');
      expect(webSearchTool.description).toContain('basic arithmetic/calculations');
      expect(webSearchTool.description).toContain('simple logic questions');
    });
  });
});