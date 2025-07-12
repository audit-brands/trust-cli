/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  TrustSchemaEnforcement,
  type JSONSchema,
  type StructuredRequest,
  type OutputFormat,
} from './schemaEnforcement.js';
import { TrustNodeLlamaClient } from './nodeLlamaClient.js';

// Mock the client
vi.mock('./nodeLlamaClient.js');

describe('TrustSchemaEnforcement', () => {
  let schemaEnforcement: TrustSchemaEnforcement;
  let mockClient: any;

  beforeEach(() => {
    mockClient = {
      generateText: vi.fn(),
      generateStream: vi.fn(),
      isModelLoaded: vi.fn().mockReturnValue(true),
    };

    schemaEnforcement = new TrustSchemaEnforcement(mockClient);
  });

  describe('JSON Schema Validation', () => {
    it('should validate valid JSON against schema', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
          active: { type: 'boolean' },
        },
        required: ['name', 'age'],
      };

      const validData = {
        name: 'John',
        age: 30,
        active: true,
      };

      const result = schemaEnforcement.validateJSON(validData, schema);

      expect(result.valid).toBe(true);
      expect(result.data).toEqual(validData);
      expect(result.errors).toHaveLength(0);
    });

    it('should catch missing required properties', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
        required: ['name', 'age'],
      };

      const invalidData = {
        name: 'John',
        // missing age
      };

      const result = schemaEnforcement.validateJSON(invalidData, schema);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(": Missing required property 'age'");
    });

    it('should catch type mismatches', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
      };

      const invalidData = {
        name: 'John',
        age: 'thirty', // should be number
      };

      const result = schemaEnforcement.validateJSON(invalidData, schema);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('.age: Expected number, got string');
    });

    it('should validate arrays', () => {
      const schema: JSONSchema = {
        type: 'array',
        items: { type: 'string' },
      };

      const validData = ['apple', 'banana', 'cherry'];
      const result = schemaEnforcement.validateJSON(validData, schema);

      expect(result.valid).toBe(true);
      expect(result.data).toEqual(validData);
    });

    it('should validate string constraints', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          shortText: { type: 'string', minLength: 5, maxLength: 10 },
          pattern: { type: 'string', pattern: '^[A-Z]+$' },
        },
      };

      const invalidData = {
        shortText: 'hi', // too short
        pattern: 'abc', // doesn't match pattern
      };

      const result = schemaEnforcement.validateJSON(invalidData, schema);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('.shortText: String too short (min: 5)');
      expect(result.errors).toContain(
        '.pattern: String does not match pattern ^[A-Z]+$',
      );
    });

    it('should validate number constraints', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          score: { type: 'number', minimum: 0, maximum: 100 },
        },
      };

      const invalidData = {
        score: -5, // below minimum
      };

      const result = schemaEnforcement.validateJSON(invalidData, schema);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('.score: Number too small (min: 0)');
    });

    it('should validate enum values', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['active', 'inactive', 'pending'] },
        },
      };

      const invalidData = {
        status: 'unknown', // not in enum
      };

      const result = schemaEnforcement.validateJSON(invalidData, schema);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        '.status: Value must be one of ["active","inactive","pending"]',
      );
    });
  });

  describe('XML Support', () => {
    it('should generate XML example from schema', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
      };

      const patterns = schemaEnforcement.createPatternPrompts();
      const prompt = patterns.structured('Test prompt', 'xml');

      expect(prompt).toContain('XML');
      expect(prompt).toContain('Test prompt');
    });

    it('should convert JSON to XML format', () => {
      const data = {
        name: 'John',
        age: 30,
        active: true,
      };

      // Access private method through any cast for testing
      const xmlString = (schemaEnforcement as any).convertJSONToXML(data);

      expect(xmlString).toContain('<name>John</name>');
      expect(xmlString).toContain('<age>30</age>');
      expect(xmlString).toContain('<active>true</active>');
    });

    it('should handle nested objects in XML', () => {
      const data = {
        user: {
          name: 'John',
          profile: {
            age: 30,
          },
        },
      };

      const xmlString = (schemaEnforcement as any).convertJSONToXML(data);

      expect(xmlString).toContain('<user>');
      expect(xmlString).toContain('<name>John</name>');
      expect(xmlString).toContain('<profile>');
      expect(xmlString).toContain('<age>30</age>');
      expect(xmlString).toContain('</profile>');
      expect(xmlString).toContain('</user>');
    });

    it('should handle arrays in XML', () => {
      const data = {
        items: ['apple', 'banana'],
      };

      const xmlString = (schemaEnforcement as any).convertJSONToXML(data);

      expect(xmlString).toContain('<item>apple</item>');
      expect(xmlString).toContain('<item>banana</item>');
    });

    it('should parse XML back to JSON', () => {
      const xmlString = '<root><name>John</name><age>30</age></root>';

      const jsonData = (schemaEnforcement as any).parseXMLToJSON(xmlString);

      expect(jsonData).toEqual({
        name: 'John',
        age: 30,
      });
    });

    it('should validate XML format', () => {
      const validXML = '<root><name>John</name></root>';
      const invalidXML = 'not xml';

      expect((schemaEnforcement as any).isValidXML(validXML)).toBe(true);
      expect((schemaEnforcement as any).isValidXML(invalidXML)).toBe(false);
    });

    it('should extract XML from response', () => {
      const response = `
        Here is your XML:
        \`\`\`xml
        <root><name>John</name><age>30</age></root>
        \`\`\`
        That's the result.
      `;

      const extracted = (schemaEnforcement as any).extractXML(response);

      expect(extracted).toContain('<name>John</name>');
      expect(extracted).toContain('<age>30</age>');
    });
  });

  describe('Key-Value Support', () => {
    it('should generate KV example from schema', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
      };

      const patterns = schemaEnforcement.createPatternPrompts();
      const prompt = patterns.structured('Test prompt', 'kv');

      expect(prompt).toContain('key-value');
      expect(prompt).toContain('Test prompt');
    });

    it('should convert JSON to KV format', () => {
      const data = {
        name: 'John',
        age: 30,
        active: true,
      };

      const kvString = (schemaEnforcement as any).convertJSONToKV(data);

      expect(kvString).toContain('name=John');
      expect(kvString).toContain('age=30');
      expect(kvString).toContain('active=true');
    });

    it('should handle nested objects in KV', () => {
      const data = {
        user: {
          name: 'John',
          profile: {
            age: 30,
          },
        },
      };

      const kvString = (schemaEnforcement as any).convertJSONToKV(data);

      expect(kvString).toContain('user.name=John');
      expect(kvString).toContain('user.profile.age=30');
    });

    it('should handle arrays in KV', () => {
      const data = {
        items: ['apple', 'banana'],
      };

      const kvString = (schemaEnforcement as any).convertJSONToKV(data);

      expect(kvString).toContain('items[0]=apple');
      expect(kvString).toContain('items[1]=banana');
    });

    it('should parse KV back to JSON', () => {
      const kvString = 'name=John\nage=30\nactive=true';

      const jsonData = (schemaEnforcement as any).parseKVToJSON(kvString);

      expect(jsonData).toEqual({
        name: 'John',
        age: 30,
        active: true,
      });
    });

    it('should handle nested KV parsing', () => {
      const kvString = 'user.name=John\nuser.profile.age=30';

      const jsonData = (schemaEnforcement as any).parseKVToJSON(kvString);

      expect(jsonData).toEqual({
        user: {
          name: 'John',
          profile: {
            age: 30,
          },
        },
      });
    });

    it('should handle array KV parsing', () => {
      const kvString = 'items[0]=apple\nitems[1]=banana';

      const jsonData = (schemaEnforcement as any).parseKVToJSON(kvString);

      expect(jsonData).toEqual({
        items: ['apple', 'banana'],
      });
    });

    it('should validate KV format', () => {
      const validKV = 'name=John\nage=30';
      const invalidKV = 'not key value';

      expect((schemaEnforcement as any).isValidKV(validKV)).toBe(true);
      expect((schemaEnforcement as any).isValidKV(invalidKV)).toBe(false);
    });

    it('should extract KV from response', () => {
      const response = `
        Here are your key-value pairs:
        \`\`\`kv
        name=John
        age=30
        active=true
        \`\`\`
        That's the result.
      `;

      const extracted = (schemaEnforcement as any).extractKV(response);

      expect(extracted).toContain('name=John');
      expect(extracted).toContain('age=30');
      expect(extracted).toContain('active=true');
    });
  });

  describe('Structured Generation', () => {
    it('should generate structured output in JSON format', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
        required: ['name', 'age'],
      };

      const request: StructuredRequest = {
        prompt: 'Generate a person',
        schema,
        format: 'json',
      };

      // Mock successful JSON response
      mockClient.generateText.mockResolvedValue('{"name": "John", "age": 30}');

      const result = await schemaEnforcement.generateStructured(request);

      expect(result.valid).toBe(true);
      expect(result.data).toEqual({ name: 'John', age: 30 });
      expect(mockClient.generateText).toHaveBeenCalledWith(
        expect.stringContaining('JSON'),
        expect.any(Object),
      );
    });

    it('should generate structured output in XML format', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
        required: ['name', 'age'],
      };

      const request: StructuredRequest = {
        prompt: 'Generate a person',
        schema,
        format: 'xml',
      };

      // Mock successful XML response
      mockClient.generateText.mockResolvedValue(
        '<root><name>John</name><age>30</age></root>',
      );

      const result = await schemaEnforcement.generateStructured(request);

      expect(result.valid).toBe(true);
      expect(result.data).toEqual({ name: 'John', age: 30 });
      expect(mockClient.generateText).toHaveBeenCalledWith(
        expect.stringContaining('XML'),
        expect.any(Object),
      );
    });

    it('should generate structured output in KV format', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
        required: ['name', 'age'],
      };

      const request: StructuredRequest = {
        prompt: 'Generate a person',
        schema,
        format: 'kv',
      };

      // Mock successful KV response
      mockClient.generateText.mockResolvedValue('name=John\nage=30');

      const result = await schemaEnforcement.generateStructured(request);

      expect(result.valid).toBe(true);
      expect(result.data).toEqual({ name: 'John', age: 30 });
      expect(mockClient.generateText).toHaveBeenCalledWith(
        expect.stringContaining('key-value'),
        expect.any(Object),
      );
    });

    it('should retry on validation failure', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
        required: ['name', 'age'],
      };

      const request: StructuredRequest = {
        prompt: 'Generate a person',
        schema,
        maxRetries: 2,
      };

      // Mock first call returns invalid JSON, second call returns valid JSON
      mockClient.generateText
        .mockResolvedValueOnce('invalid json')
        .mockResolvedValueOnce('{"name": "John", "age": 30}');

      const result = await schemaEnforcement.generateStructured(request);

      expect(result.valid).toBe(true);
      expect(result.data).toEqual({ name: 'John', age: 30 });
      expect(mockClient.generateText).toHaveBeenCalledTimes(2);
    });

    it('should fail after max retries', async () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
        required: ['name'],
      };

      const request: StructuredRequest = {
        prompt: 'Generate a person',
        schema,
        maxRetries: 2,
      };

      // Mock all calls return invalid JSON
      mockClient.generateText.mockResolvedValue('invalid json');

      const result = await schemaEnforcement.generateStructured(request);

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Failed after 2 attempts');
      expect(mockClient.generateText).toHaveBeenCalledTimes(2);
    });
  });

  describe('Common Schemas', () => {
    it('should provide common schema templates', () => {
      const schemas = schemaEnforcement.getCommonSchemas();

      expect(schemas).toHaveProperty('stringList');
      expect(schemas).toHaveProperty('keyValuePairs');
      expect(schemas).toHaveProperty('codeAnalysis');
      expect(schemas).toHaveProperty('taskBreakdown');
      expect(schemas).toHaveProperty('documentSummary');

      // Verify structure of code analysis schema
      expect(schemas.codeAnalysis).toHaveProperty('type', 'object');
      expect(schemas.codeAnalysis).toHaveProperty('properties');
      expect(schemas.codeAnalysis.properties).toHaveProperty('summary');
      expect(schemas.codeAnalysis.properties).toHaveProperty('issues');
      expect(schemas.codeAnalysis.properties).toHaveProperty('suggestions');
    });
  });

  describe('Pattern Prompts', () => {
    it('should generate format-specific prompts', () => {
      const patterns = schemaEnforcement.createPatternPrompts();

      expect(patterns).toHaveProperty('list');
      expect(patterns).toHaveProperty('keyValue');
      expect(patterns).toHaveProperty('structured');
      expect(patterns).toHaveProperty('analysis');
      expect(patterns).toHaveProperty('summary');

      // Test different formats
      expect(patterns.list('List items', 'json')).toContain('JSON array');
      expect(patterns.list('List items', 'xml')).toContain('XML list');
      expect(patterns.list('List items', 'kv')).toContain('key-value pairs');

      expect(patterns.keyValue('Get data', 'json')).toContain('JSON object');
      expect(patterns.keyValue('Get data', 'xml')).toContain('XML containing');
      expect(patterns.keyValue('Get data', 'kv')).toContain('key-value pairs');
    });
  });
});
