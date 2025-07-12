/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { LogitBiasConfig } from './types.js';

/**
 * JSON parsing context for contextual bias application
 */
export type JsonContext =
  | 'object'
  | 'array'
  | 'string'
  | 'value'
  | 'key'
  | 'root';

/**
 * Common JSON structural tokens that should be biased for better JSON generation
 */
export const JSON_STRUCTURAL_TOKENS = {
  // Core structural tokens
  OPEN_BRACE: '{',
  CLOSE_BRACE: '}',
  OPEN_BRACKET: '[',
  CLOSE_BRACKET: ']',
  QUOTE: '"',
  COLON: ':',
  COMMA: ',',

  // Common values
  TRUE: 'true',
  FALSE: 'false',
  NULL: 'null',

  // Number patterns (simplified)
  ZERO: '0',
  ONE: '1',
  TWO: '2',
  THREE: '3',
  FOUR: '4',
  FIVE: '5',
  SIX: '6',
  SEVEN: '7',
  EIGHT: '8',
  NINE: '9',
  DECIMAL: '.',
  MINUS: '-',
} as const;

/**
 * Tokens that commonly break JSON structure and should be suppressed
 */
export const JSON_INVALID_TOKENS = [
  "'", // Single quotes break JSON
  '`', // Backticks break JSON
  '\\n', // Unescaped newlines
  '\\t', // Unescaped tabs
  '\\r', // Unescaped carriage returns
  '=', // Assignment operators
  ';', // Statement terminators
  '(',
  ')', // Function calls
  '<',
  '>', // XML/HTML tags
] as const;

/**
 * Logit bias manager for precise token control during generation
 * Trust: An Open System for Modern Assurance
 */
export class LogitBiasManager {
  private tokenizer: Map<string, number> = new Map();
  private reverseTokenizer: Map<number, string> = new Map();

  constructor() {
    this.initializeCommonTokens();
  }

  /**
   * Initialize common tokens for JSON generation
   */
  private initializeCommonTokens(): void {
    // This is a simplified tokenizer mapping for demonstration
    // In a real implementation, this would interface with the actual model tokenizer
    let tokenId = 0;

    // Add JSON structural tokens
    Object.values(JSON_STRUCTURAL_TOKENS).forEach((token) => {
      this.tokenizer.set(token, tokenId);
      this.reverseTokenizer.set(tokenId, token);
      tokenId++;
    });

    // Add invalid tokens
    JSON_INVALID_TOKENS.forEach((token) => {
      this.tokenizer.set(token, tokenId);
      this.reverseTokenizer.set(tokenId, token);
      tokenId++;
    });
  }

  /**
   * Generate logit bias values for JSON generation
   */
  generateJsonBias(config: LogitBiasConfig): Record<number, number> {
    const bias: Record<number, number> = {};

    // Apply token-specific biases
    if (config.tokenBias) {
      Object.entries(config.tokenBias).forEach(([tokenId, biasValue]) => {
        bias[parseInt(tokenId)] = this.clampBias(biasValue);
      });
    }

    // Apply string-based biases
    if (config.stringBias) {
      Object.entries(config.stringBias).forEach(([token, biasValue]) => {
        const tokenId = this.tokenizer.get(token);
        if (tokenId !== undefined) {
          bias[tokenId] = this.clampBias(biasValue);
        }
      });
    }

    // Apply JSON-specific biases
    if (config.jsonBias) {
      this.applyJsonStructuralBias(bias, config.jsonBias);
    }

    return bias;
  }

  /**
   * Apply JSON structural biases
   */
  private applyJsonStructuralBias(
    bias: Record<number, number>,
    jsonBias: NonNullable<LogitBiasConfig['jsonBias']>,
  ): void {
    if (jsonBias.boostStructural) {
      // Boost structural tokens to encourage proper JSON formatting
      Object.values(JSON_STRUCTURAL_TOKENS).forEach((token) => {
        const tokenId = this.tokenizer.get(token);
        if (tokenId !== undefined) {
          bias[tokenId] = (bias[tokenId] || 0) + 10; // Moderate boost
        }
      });
    }

    if (jsonBias.suppressInvalid) {
      // Suppress tokens that commonly break JSON
      JSON_INVALID_TOKENS.forEach((token) => {
        const tokenId = this.tokenizer.get(token);
        if (tokenId !== undefined) {
          bias[tokenId] = (bias[tokenId] || 0) - 20; // Strong suppression
        }
      });
    }

    if (jsonBias.valueBias) {
      // Apply custom value biases
      Object.entries(jsonBias.valueBias).forEach(([value, biasValue]) => {
        const tokenId = this.tokenizer.get(value);
        if (tokenId !== undefined) {
          bias[tokenId] = this.clampBias(biasValue);
        }
      });
    }
  }

  /**
   * Generate contextual bias based on current JSON parsing state
   */
  generateContextualBias(
    config: LogitBiasConfig,
    context: JsonContext,
    currentText: string,
  ): Record<number, number> {
    const bias: Record<number, number> = {};

    if (!config.contextualBias) {
      return bias;
    }

    let contextBias: Record<string, number> | undefined;

    switch (context) {
      case 'object':
        contextBias = config.contextualBias.inObject;
        // In objects, boost quotes and colons, suppress brackets
        this.applyContextualStructuralBias(bias, 'object');
        break;
      case 'array':
        contextBias = config.contextualBias.inArray;
        // In arrays, boost brackets and commas, suppress colons
        this.applyContextualStructuralBias(bias, 'array');
        break;
      case 'string':
        contextBias = config.contextualBias.inString;
        // In strings, suppress structural tokens except closing quote
        this.applyContextualStructuralBias(bias, 'string');
        break;
      case 'value':
        contextBias = config.contextualBias.inValue;
        break;
    }

    if (contextBias) {
      Object.entries(contextBias).forEach(([token, biasValue]) => {
        const tokenId = this.tokenizer.get(token);
        if (tokenId !== undefined) {
          bias[tokenId] = this.clampBias(biasValue);
        }
      });
    }

    return bias;
  }

  /**
   * Apply structural biases based on JSON context
   */
  private applyContextualStructuralBias(
    bias: Record<number, number>,
    context: JsonContext,
  ): void {
    switch (context) {
      case 'object':
        // Boost quotes (for keys) and colons
        this.adjustTokenBias(bias, JSON_STRUCTURAL_TOKENS.QUOTE, 5);
        this.adjustTokenBias(bias, JSON_STRUCTURAL_TOKENS.COLON, 8);
        // Suppress array brackets
        this.adjustTokenBias(bias, JSON_STRUCTURAL_TOKENS.OPEN_BRACKET, -15);
        this.adjustTokenBias(bias, JSON_STRUCTURAL_TOKENS.CLOSE_BRACKET, -15);
        break;

      case 'array':
        // Boost array brackets and commas
        this.adjustTokenBias(bias, JSON_STRUCTURAL_TOKENS.OPEN_BRACKET, 5);
        this.adjustTokenBias(bias, JSON_STRUCTURAL_TOKENS.CLOSE_BRACKET, 5);
        this.adjustTokenBias(bias, JSON_STRUCTURAL_TOKENS.COMMA, 8);
        // Suppress object colons
        this.adjustTokenBias(bias, JSON_STRUCTURAL_TOKENS.COLON, -15);
        break;

      case 'string':
        // Suppress all structural tokens except closing quote
        Object.values(JSON_STRUCTURAL_TOKENS).forEach((token) => {
          if (token !== JSON_STRUCTURAL_TOKENS.QUOTE) {
            this.adjustTokenBias(bias, token, -10);
          }
        });
        break;
    }
  }

  /**
   * Adjust bias for a specific token
   */
  private adjustTokenBias(
    bias: Record<number, number>,
    token: string,
    adjustment: number,
  ): void {
    const tokenId = this.tokenizer.get(token);
    if (tokenId !== undefined) {
      bias[tokenId] = this.clampBias((bias[tokenId] || 0) + adjustment);
    }
  }

  /**
   * Clamp bias values to valid range (-100 to 100)
   */
  private clampBias(value: number): number {
    return Math.max(-100, Math.min(100, value));
  }

  /**
   * Detect current JSON context from partial text
   */
  detectJsonContext(text: string): JsonContext {
    // Simple context detection based on text analysis
    const trimmed = text.trim();

    if (!trimmed) return 'root';

    // Track nested structures to find the most recent context
    const stack: JsonContext[] = [];
    let inString = false;
    let escaped = false;

    for (let i = 0; i < trimmed.length; i++) {
      const char = trimmed[i];

      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === '\\') {
        escaped = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (inString) {
        continue;
      }

      if (char === '{') {
        stack.push('object');
      } else if (char === '}') {
        if (stack.length > 0 && stack[stack.length - 1] === 'object') {
          stack.pop();
        }
      } else if (char === '[') {
        stack.push('array');
      } else if (char === ']') {
        if (stack.length > 0 && stack[stack.length - 1] === 'array') {
          stack.pop();
        }
      }
    }

    if (inString) return 'string';
    if (stack.length > 0) return stack[stack.length - 1];

    return 'value';
  }

  /**
   * Create a preset logit bias configuration for common JSON generation scenarios
   */
  static createJsonPreset(
    level: 'light' | 'moderate' | 'aggressive' = 'moderate',
  ): LogitBiasConfig {
    const baseConfig: LogitBiasConfig = {
      jsonBias: {
        boostStructural: true,
        suppressInvalid: true,
      },
    };

    switch (level) {
      case 'light':
        baseConfig.jsonBias!.valueBias = {
          true: 2,
          false: 2,
          null: 2,
        };
        break;

      case 'moderate':
        baseConfig.jsonBias!.valueBias = {
          true: 5,
          false: 5,
          null: 5,
        };
        baseConfig.contextualBias = {
          inObject: { ':': 8, ',': 5 },
          inArray: { ',': 8, ']': 5 },
          inString: { '"': 10 },
        };
        break;

      case 'aggressive':
        baseConfig.jsonBias!.valueBias = {
          true: 10,
          false: 10,
          null: 10,
        };
        baseConfig.contextualBias = {
          inObject: { ':': 15, ',': 10, '}': 8 },
          inArray: { ',': 15, ']': 10 },
          inString: { '"': 20 },
          inValue: { true: 8, false: 8, null: 8 },
        };
        // Aggressively suppress invalid tokens
        baseConfig.stringBias = {
          "'": -50,
          '`': -50,
          '=': -30,
          ';': -30,
          '(': -20,
          ')': -20,
        };
        break;
    }

    return baseConfig;
  }
}
