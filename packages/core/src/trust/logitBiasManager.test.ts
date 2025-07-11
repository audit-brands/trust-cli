/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { LogitBiasManager, JSON_STRUCTURAL_TOKENS, JSON_INVALID_TOKENS } from './logitBiasManager.js';
import { LogitBiasConfig } from './types.js';

describe('LogitBiasManager', () => {
  let biasManager: LogitBiasManager;

  beforeEach(() => {
    biasManager = new LogitBiasManager();
  });

  describe('JSON Context Detection', () => {
    it('should detect root context for empty text', () => {
      expect(biasManager.detectJsonContext('')).toBe('root');
      expect(biasManager.detectJsonContext('   ')).toBe('root');
    });

    it('should detect string context when inside quotes', () => {
      expect(biasManager.detectJsonContext('{"name": "test')).toBe('string');
      expect(biasManager.detectJsonContext('["hello')).toBe('string');
    });

    it('should detect object context when inside braces', () => {
      expect(biasManager.detectJsonContext('{')).toBe('object');
      expect(biasManager.detectJsonContext('{"name": "test", ')).toBe('object');
    });

    it('should detect array context when inside brackets', () => {
      expect(biasManager.detectJsonContext('[')).toBe('array');
      expect(biasManager.detectJsonContext('[1, 2, ')).toBe('array');
    });

    it('should handle nested structures correctly', () => {
      expect(biasManager.detectJsonContext('{"users": [')).toBe('array');
      expect(biasManager.detectJsonContext('[{"name": ')).toBe('object');
    });

    it('should handle escaped quotes correctly', () => {
      expect(biasManager.detectJsonContext('{"text": "He said \\"hello\\""}')).toBe('value');
    });
  });

  describe('JSON Bias Generation', () => {
    it('should generate bias for token IDs', () => {
      const config: LogitBiasConfig = {
        tokenBias: {
          1: 10,
          2: -5,
          3: 50,
        },
      };

      const bias = biasManager.generateJsonBias(config);
      
      expect(bias[1]).toBe(10);
      expect(bias[2]).toBe(-5);
      expect(bias[3]).toBe(50);
    });

    it('should clamp bias values to valid range', () => {
      const config: LogitBiasConfig = {
        tokenBias: {
          1: 150,  // Should be clamped to 100
          2: -150, // Should be clamped to -100
        },
      };

      const bias = biasManager.generateJsonBias(config);
      
      expect(bias[1]).toBe(100);
      expect(bias[2]).toBe(-100);
    });

    it('should apply string-based biases', () => {
      const config: LogitBiasConfig = {
        stringBias: {
          '{': 15,
          '}': 10,
          '"': 8,
        },
      };

      const bias = biasManager.generateJsonBias(config);
      
      // Should have bias values for structural tokens
      expect(Object.keys(bias).length).toBeGreaterThan(0);
    });

    it('should boost structural tokens when requested', () => {
      const config: LogitBiasConfig = {
        jsonBias: {
          boostStructural: true,
        },
      };

      const bias = biasManager.generateJsonBias(config);
      
      // Should have positive bias for structural tokens
      expect(Object.keys(bias).length).toBeGreaterThan(0);
      Object.values(bias).forEach(value => {
        expect(value).toBeGreaterThan(0);
      });
    });

    it('should suppress invalid tokens when requested', () => {
      const config: LogitBiasConfig = {
        jsonBias: {
          suppressInvalid: true,
        },
      };

      const bias = biasManager.generateJsonBias(config);
      
      // Should have negative bias for invalid tokens
      expect(Object.keys(bias).length).toBeGreaterThan(0);
      Object.values(bias).forEach(value => {
        expect(value).toBeLessThan(0);
      });
    });

    it('should apply value-specific biases', () => {
      const config: LogitBiasConfig = {
        jsonBias: {
          valueBias: {
            'true': 20,
            'false': 15,
            'null': -10,
          },
        },
      };

      const bias = biasManager.generateJsonBias(config);
      
      expect(Object.keys(bias).length).toBeGreaterThan(0);
    });
  });

  describe('Contextual Bias Generation', () => {
    it('should apply object context biases', () => {
      const config: LogitBiasConfig = {
        contextualBias: {
          inObject: {
            ':': 10,
            ',': 5,
          },
        },
      };

      const bias = biasManager.generateContextualBias(config, 'object', '{"key"');
      
      expect(Object.keys(bias).length).toBeGreaterThan(0);
    });

    it('should apply array context biases', () => {
      const config: LogitBiasConfig = {
        contextualBias: {
          inArray: {
            ',': 8,
            ']': 5,
          },
        },
      };

      const bias = biasManager.generateContextualBias(config, 'array', '[1, 2');
      
      expect(Object.keys(bias).length).toBeGreaterThan(0);
    });

    it('should apply string context biases', () => {
      const config: LogitBiasConfig = {
        contextualBias: {
          inString: {
            '"': 20,
          },
        },
      };

      const bias = biasManager.generateContextualBias(config, 'string', '"hello');
      
      expect(Object.keys(bias).length).toBeGreaterThan(0);
    });

    it('should return empty bias for missing contextual config', () => {
      const config: LogitBiasConfig = {};
      
      const bias = biasManager.generateContextualBias(config, 'object', '{}');
      
      expect(Object.keys(bias)).toHaveLength(0);
    });
  });

  describe('Preset Configurations', () => {
    it('should create light preset configuration', () => {
      const config = LogitBiasManager.createJsonPreset('light');
      
      expect(config.jsonBias?.boostStructural).toBe(true);
      expect(config.jsonBias?.suppressInvalid).toBe(true);
      expect(config.jsonBias?.valueBias).toBeDefined();
      expect(config.contextualBias).toBeUndefined();
    });

    it('should create moderate preset configuration', () => {
      const config = LogitBiasManager.createJsonPreset('moderate');
      
      expect(config.jsonBias?.boostStructural).toBe(true);
      expect(config.jsonBias?.suppressInvalid).toBe(true);
      expect(config.jsonBias?.valueBias).toBeDefined();
      expect(config.contextualBias).toBeDefined();
    });

    it('should create aggressive preset configuration', () => {
      const config = LogitBiasManager.createJsonPreset('aggressive');
      
      expect(config.jsonBias?.boostStructural).toBe(true);
      expect(config.jsonBias?.suppressInvalid).toBe(true);
      expect(config.jsonBias?.valueBias).toBeDefined();
      expect(config.contextualBias).toBeDefined();
      expect(config.stringBias).toBeDefined();
    });

    it('should default to moderate preset', () => {
      const config = LogitBiasManager.createJsonPreset();
      const moderateConfig = LogitBiasManager.createJsonPreset('moderate');
      
      expect(config).toEqual(moderateConfig);
    });
  });

  describe('Token Constants', () => {
    it('should have all required JSON structural tokens', () => {
      expect(JSON_STRUCTURAL_TOKENS.OPEN_BRACE).toBe('{');
      expect(JSON_STRUCTURAL_TOKENS.CLOSE_BRACE).toBe('}');
      expect(JSON_STRUCTURAL_TOKENS.OPEN_BRACKET).toBe('[');
      expect(JSON_STRUCTURAL_TOKENS.CLOSE_BRACKET).toBe(']');
      expect(JSON_STRUCTURAL_TOKENS.QUOTE).toBe('"');
      expect(JSON_STRUCTURAL_TOKENS.COLON).toBe(':');
      expect(JSON_STRUCTURAL_TOKENS.COMMA).toBe(',');
    });

    it('should have JSON value tokens', () => {
      expect(JSON_STRUCTURAL_TOKENS.TRUE).toBe('true');
      expect(JSON_STRUCTURAL_TOKENS.FALSE).toBe('false');
      expect(JSON_STRUCTURAL_TOKENS.NULL).toBe('null');
    });

    it('should have number tokens', () => {
      expect(JSON_STRUCTURAL_TOKENS.ZERO).toBe('0');
      expect(JSON_STRUCTURAL_TOKENS.ONE).toBe('1');
      expect(JSON_STRUCTURAL_TOKENS.DECIMAL).toBe('.');
      expect(JSON_STRUCTURAL_TOKENS.MINUS).toBe('-');
    });

    it('should have invalid JSON tokens', () => {
      expect(JSON_INVALID_TOKENS).toContain("'");
      expect(JSON_INVALID_TOKENS).toContain('`');
      expect(JSON_INVALID_TOKENS).toContain('=');
      expect(JSON_INVALID_TOKENS).toContain(';');
    });
  });

  describe('Bias Value Clamping', () => {
    it('should clamp positive values above 100', () => {
      const config: LogitBiasConfig = {
        tokenBias: {
          1: 200,
          2: 150,
          3: 999,
        },
      };

      const bias = biasManager.generateJsonBias(config);
      
      expect(bias[1]).toBe(100);
      expect(bias[2]).toBe(100);
      expect(bias[3]).toBe(100);
    });

    it('should clamp negative values below -100', () => {
      const config: LogitBiasConfig = {
        tokenBias: {
          1: -200,
          2: -150,
          3: -999,
        },
      };

      const bias = biasManager.generateJsonBias(config);
      
      expect(bias[1]).toBe(-100);
      expect(bias[2]).toBe(-100);
      expect(bias[3]).toBe(-100);
    });

    it('should preserve values within valid range', () => {
      const config: LogitBiasConfig = {
        tokenBias: {
          1: 50,
          2: -50,
          3: 0,
          4: 100,
          5: -100,
        },
      };

      const bias = biasManager.generateJsonBias(config);
      
      expect(bias[1]).toBe(50);
      expect(bias[2]).toBe(-50);
      expect(bias[3]).toBe(0);
      expect(bias[4]).toBe(100);
      expect(bias[5]).toBe(-100);
    });
  });

  describe('Complex Context Detection', () => {
    it('should handle deeply nested structures', () => {
      const deepObject = '{"level1": {"level2": {"level3": [{"level4": ';
      expect(biasManager.detectJsonContext(deepObject)).toBe('object');
    });

    it('should handle mixed array and object nesting', () => {
      const mixedStructure = '[{"array": [1, {"nested": ';
      expect(biasManager.detectJsonContext(mixedStructure)).toBe('object');
    });

    it('should handle empty objects and arrays', () => {
      expect(biasManager.detectJsonContext('{}')).toBe('value');
      expect(biasManager.detectJsonContext('[]')).toBe('value');
    });

    it('should handle strings with special characters', () => {
      const stringWithSpecial = '{"text": "This has {brackets} and [arrays] and \\"quotes\\"';
      expect(biasManager.detectJsonContext(stringWithSpecial)).toBe('string');
    });
  });
});