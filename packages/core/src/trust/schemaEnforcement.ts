/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { TrustNodeLlamaClient } from './nodeLlamaClient.js';
import { GenerationOptions, LogitBiasConfig } from './types.js';
import { LogitBiasManager } from './logitBiasManager.js';

/**
 * JSON Schema definition
 */
export interface JSONSchema {
  type: 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';
  properties?: Record<string, JSONSchema>;
  items?: JSONSchema;
  required?: string[];
  enum?: any[];
  format?: string;
  pattern?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  description?: string;
  examples?: any[];
}

/**
 * Supported structured output formats
 */
export type OutputFormat = 'json' | 'xml' | 'kv';

/**
 * Structured output request
 */
export interface StructuredRequest {
  prompt: string;
  schema: JSONSchema;
  format?: OutputFormat;
  options?: GenerationOptions;
  maxRetries?: number;
  validationStrict?: boolean;
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  data?: any;
  errors: string[];
  rawResponse: string;
}

/**
 * JSON Schema enforcement for structured outputs
 * Trust: An Open System for Modern Assurance
 */
export class TrustSchemaEnforcement {
  private client: TrustNodeLlamaClient;
  private biasManager: LogitBiasManager;

  constructor(client: TrustNodeLlamaClient) {
    this.client = client;
    this.biasManager = new LogitBiasManager();
  }

  /**
   * Generate structured output with schema enforcement
   */
  async generateStructured(
    request: StructuredRequest,
  ): Promise<ValidationResult> {
    const {
      prompt,
      schema,
      format = 'json',
      options = {},
      maxRetries = 3,
      validationStrict = true,
    } = request;

    // Enhance prompt with schema information
    let enhancedPrompt = this.createSchemaPrompt(prompt, schema, format);

    let lastError = '';
    let rawResponse = '';

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Prepare generation options with logit bias for JSON
        const generationOptions = this.prepareGenerationOptions(
          options,
          format,
          attempt,
        );

        // Generate response
        rawResponse = await this.client.generateText(
          enhancedPrompt,
          generationOptions,
        );

        // Extract and validate based on format
        const validationResult = this.validateAndExtract(
          rawResponse,
          schema,
          validationStrict,
          format,
        );

        if (validationResult.valid) {
          return validationResult;
        }

        // If validation failed, prepare for retry
        lastError = validationResult.errors.join(', ');

        if (attempt < maxRetries - 1) {
          // Enhance prompt with error feedback for retry
          const errorPrompt = this.createRetryPrompt(
            prompt,
            schema,
            validationResult.errors,
            rawResponse,
            format,
          );
          enhancedPrompt = errorPrompt;
        }
      } catch (error) {
        lastError = String(error);
        if (attempt === maxRetries - 1) {
          return {
            valid: false,
            errors: [`Generation failed: ${lastError}`],
            rawResponse,
          };
        }
      }
    }

    return {
      valid: false,
      errors: [`Failed after ${maxRetries} attempts. Last error: ${lastError}`],
      rawResponse,
    };
  }

  /**
   * Validate JSON against schema
   */
  validateJSON(data: any, schema: JSONSchema): ValidationResult {
    const errors: string[] = [];

    try {
      this.validateValue(data, schema, '', errors);

      return {
        valid: errors.length === 0,
        data: errors.length === 0 ? data : undefined,
        errors,
        rawResponse: JSON.stringify(data, null, 2),
      };
    } catch (error) {
      return {
        valid: false,
        errors: [`Validation error: ${error}`],
        rawResponse: JSON.stringify(data, null, 2),
      };
    }
  }

  /**
   * Generate schema-aware prompts for common patterns
   */
  createPatternPrompts(): Record<
    string,
    (userPrompt: string, format?: OutputFormat) => string
  > {
    return {
      list: (userPrompt: string, format: OutputFormat = 'json') => {
        switch (format) {
          case 'xml':
            return `${userPrompt}\n\nPlease respond with an XML list structure.`;
          case 'kv':
            return `${userPrompt}\n\nPlease respond with key-value pairs for list items.`;
          default:
            return `${userPrompt}\n\nPlease respond with a JSON array of strings.`;
        }
      },

      keyValue: (userPrompt: string, format: OutputFormat = 'json') => {
        switch (format) {
          case 'xml':
            return `${userPrompt}\n\nPlease respond with XML containing key-value pairs.`;
          case 'kv':
            return `${userPrompt}\n\nPlease respond with key-value pairs (key=value format).`;
          default:
            return `${userPrompt}\n\nPlease respond with a JSON object containing key-value pairs.`;
        }
      },

      structured: (userPrompt: string, format: OutputFormat = 'json') => {
        switch (format) {
          case 'xml':
            return `${userPrompt}\n\nPlease respond with well-structured XML.`;
          case 'kv':
            return `${userPrompt}\n\nPlease respond with structured key-value pairs.`;
          default:
            return `${userPrompt}\n\nPlease respond with a well-structured JSON object.`;
        }
      },

      analysis: (userPrompt: string, format: OutputFormat = 'json') => {
        switch (format) {
          case 'xml':
            return `${userPrompt}\n\nPlease respond with XML containing your analysis with clear categories and findings.`;
          case 'kv':
            return `${userPrompt}\n\nPlease respond with key-value pairs for your analysis with clear categories and findings.`;
          default:
            return `${userPrompt}\n\nPlease respond with a JSON object containing your analysis with clear categories and findings.`;
        }
      },

      summary: (userPrompt: string, format: OutputFormat = 'json') => {
        switch (format) {
          case 'xml':
            return `${userPrompt}\n\nPlease respond with XML containing a summary with key points and conclusions.`;
          case 'kv':
            return `${userPrompt}\n\nPlease respond with key-value pairs for a summary with key points and conclusions.`;
          default:
            return `${userPrompt}\n\nPlease respond with a JSON object containing a summary with key points and conclusions.`;
        }
      },
    };
  }

  /**
   * Common schema templates
   */
  getCommonSchemas(): Record<string, JSONSchema> {
    return {
      stringList: {
        type: 'array',
        items: { type: 'string' },
        description: 'An array of strings',
      },

      keyValuePairs: {
        type: 'object',
        description: 'Key-value pairs as an object',
      },

      codeAnalysis: {
        type: 'object',
        properties: {
          summary: { type: 'string', description: 'Brief summary of the code' },
          issues: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['error', 'warning', 'info'] },
                message: { type: 'string' },
                line: { type: 'number' },
                severity: { type: 'number', minimum: 1, maximum: 10 },
              },
              required: ['type', 'message'],
            },
          },
          suggestions: {
            type: 'array',
            items: { type: 'string' },
          },
          metrics: {
            type: 'object',
            properties: {
              complexity: { type: 'number' },
              maintainability: { type: 'number' },
              testCoverage: { type: 'number' },
            },
          },
        },
        required: ['summary', 'issues', 'suggestions'],
      },

      taskBreakdown: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          tasks: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                title: { type: 'string' },
                description: { type: 'string' },
                priority: { type: 'string', enum: ['low', 'medium', 'high'] },
                estimatedHours: { type: 'number', minimum: 0 },
                dependencies: {
                  type: 'array',
                  items: { type: 'string' },
                },
              },
              required: ['id', 'title', 'priority'],
            },
          },
          totalEstimate: { type: 'number', minimum: 0 },
        },
        required: ['title', 'tasks'],
      },

      documentSummary: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          mainPoints: {
            type: 'array',
            items: { type: 'string' },
          },
          keyFindings: {
            type: 'array',
            items: { type: 'string' },
          },
          actionItems: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                action: { type: 'string' },
                priority: { type: 'string', enum: ['low', 'medium', 'high'] },
                deadline: { type: 'string', format: 'date' },
              },
              required: ['action', 'priority'],
            },
          },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
        },
        required: ['title', 'mainPoints', 'keyFindings'],
      },
    };
  }

  private createSchemaPrompt(
    userPrompt: string,
    schema: JSONSchema,
    format: OutputFormat = 'json',
  ): string {
    let prompt = userPrompt;

    switch (format) {
      case 'json':
        prompt +=
          '\n\nIMPORTANT: Please respond with valid JSON that matches this exact schema:\n';
        prompt += JSON.stringify(schema, null, 2);
        prompt +=
          '\n\nYour response must be pure JSON with no additional text or explanations.';
        prompt +=
          '\nEnsure all required fields are included and data types match the schema.';

        if (schema.examples && schema.examples.length > 0) {
          prompt += '\n\nExample format:\n';
          prompt += JSON.stringify(schema.examples[0], null, 2);
        }
        break;

      case 'xml':
        prompt +=
          '\n\nIMPORTANT: Please respond with valid XML that matches this schema structure:\n';
        prompt += this.generateXMLExample(schema);
        prompt +=
          '\n\nYour response must be well-formed XML with no additional text or explanations.';
        prompt +=
          '\nEnsure all required elements are included and follow the XML structure.';
        prompt += '\nUse appropriate XML tags and nesting based on the schema.';
        break;

      case 'kv':
        prompt +=
          '\n\nIMPORTANT: Please respond with key-value pairs that match this schema:\n';
        prompt += this.generateKVExample(schema);
        prompt +=
          '\n\nYour response must be in key-value format with no additional text or explanations.';
        prompt +=
          '\nUse the format: key=value (one per line for simple values)';
        prompt += '\nFor nested objects, use dot notation: parent.child=value';
        prompt += '\nFor arrays, use indexed notation: items[0]=value';
        break;
    }

    return prompt;
  }

  private createRetryPrompt(
    originalPrompt: string,
    schema: JSONSchema,
    errors: string[],
    previousResponse: string,
    format: OutputFormat = 'json',
  ): string {
    let prompt = originalPrompt;

    prompt += '\n\nThe previous response had validation errors:\n';
    for (const error of errors) {
      prompt += `- ${error}\n`;
    }

    prompt += '\nPrevious response:\n';
    prompt += previousResponse;

    switch (format) {
      case 'json':
        prompt +=
          '\n\nPlease provide a corrected JSON response that matches this schema:\n';
        prompt += JSON.stringify(schema, null, 2);
        prompt +=
          '\n\nYour response must be pure JSON with no additional text.';
        break;

      case 'xml':
        prompt +=
          '\n\nPlease provide a corrected XML response that matches this schema:\n';
        prompt += this.generateXMLExample(schema);
        prompt +=
          '\n\nYour response must be well-formed XML with no additional text.';
        break;

      case 'kv':
        prompt +=
          '\n\nPlease provide a corrected key-value response that matches this schema:\n';
        prompt += this.generateKVExample(schema);
        prompt +=
          '\n\nYour response must be in key-value format with no additional text.';
        break;
    }

    return prompt;
  }

  private validateAndExtract(
    response: string,
    schema: JSONSchema,
    strict: boolean,
    format: OutputFormat = 'json',
  ): ValidationResult {
    switch (format) {
      case 'json':
        return this.validateAndExtractJSON(response, schema, strict);
      case 'xml':
        return this.validateAndExtractXML(response, schema, strict);
      case 'kv':
        return this.validateAndExtractKV(response, schema, strict);
      default:
        return {
          valid: false,
          errors: [`Unknown format: ${format}`],
          rawResponse: response,
        };
    }
  }

  private validateAndExtractJSON(
    response: string,
    schema: JSONSchema,
    strict: boolean,
  ): ValidationResult {
    // Try to extract JSON from response
    const jsonMatch = this.extractJSON(response);

    if (!jsonMatch) {
      return {
        valid: false,
        errors: ['No valid JSON found in response'],
        rawResponse: response,
      };
    }

    try {
      const data = JSON.parse(jsonMatch);
      return this.validateJSON(data, schema);
    } catch (error) {
      return {
        valid: false,
        errors: [`JSON parsing failed: ${error}`],
        rawResponse: response,
      };
    }
  }

  private validateAndExtractXML(
    response: string,
    schema: JSONSchema,
    strict: boolean,
  ): ValidationResult {
    // Try to extract XML from response
    const xmlMatch = this.extractXML(response);

    if (!xmlMatch) {
      return {
        valid: false,
        errors: ['No valid XML found in response'],
        rawResponse: response,
      };
    }

    try {
      const data = this.parseXMLToJSON(xmlMatch);
      return this.validateJSON(data, schema);
    } catch (error) {
      return {
        valid: false,
        errors: [`XML parsing failed: ${error}`],
        rawResponse: response,
      };
    }
  }

  private validateAndExtractKV(
    response: string,
    schema: JSONSchema,
    strict: boolean,
  ): ValidationResult {
    // Try to extract key-value pairs from response
    const kvMatch = this.extractKV(response);

    if (!kvMatch) {
      return {
        valid: false,
        errors: ['No valid key-value pairs found in response'],
        rawResponse: response,
      };
    }

    try {
      const data = this.parseKVToJSON(kvMatch);
      return this.validateJSON(data, schema);
    } catch (error) {
      return {
        valid: false,
        errors: [`Key-value parsing failed: ${error}`],
        rawResponse: response,
      };
    }
  }

  private extractJSON(text: string): string | null {
    // Try to find JSON in various formats
    const patterns = [
      /```json\s*([\s\S]*?)\s*```/i, // JSON code blocks
      /```\s*([\s\S]*?)\s*```/, // Generic code blocks
      /{[\s\S]*}/, // JSON objects
      /\[[\s\S]*\]/, // JSON arrays
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        const candidate = match[1] || match[0];
        try {
          JSON.parse(candidate.trim());
          return candidate.trim();
        } catch (error) {
          continue;
        }
      }
    }

    return null;
  }

  private validateValue(
    value: any,
    schema: JSONSchema,
    path: string,
    errors: string[],
  ): void {
    // Type validation
    if (!this.validateType(value, schema.type)) {
      errors.push(`${path}: Expected ${schema.type}, got ${typeof value}`);
      return;
    }

    // Specific type validations
    switch (schema.type) {
      case 'object':
        this.validateObject(value, schema, path, errors);
        break;
      case 'array':
        this.validateArray(value, schema, path, errors);
        break;
      case 'string':
        this.validateString(value, schema, path, errors);
        break;
      case 'number':
        this.validateNumber(value, schema, path, errors);
        break;
    }

    // Enum validation
    if (schema.enum && !schema.enum.includes(value)) {
      errors.push(
        `${path}: Value must be one of ${JSON.stringify(schema.enum)}`,
      );
    }
  }

  private validateType(value: any, expectedType: string): boolean {
    switch (expectedType) {
      case 'object':
        return (
          typeof value === 'object' && value !== null && !Array.isArray(value)
        );
      case 'array':
        return Array.isArray(value);
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number' && !isNaN(value);
      case 'boolean':
        return typeof value === 'boolean';
      case 'null':
        return value === null;
      default:
        return true;
    }
  }

  private validateObject(
    obj: any,
    schema: JSONSchema,
    path: string,
    errors: string[],
  ): void {
    if (schema.required) {
      for (const required of schema.required) {
        if (!(required in obj)) {
          errors.push(`${path}: Missing required property '${required}'`);
        }
      }
    }

    if (schema.properties) {
      for (const [key, value] of Object.entries(obj)) {
        const propSchema = schema.properties[key];
        if (propSchema) {
          this.validateValue(value, propSchema, `${path}.${key}`, errors);
        }
      }
    }
  }

  private validateArray(
    arr: any[],
    schema: JSONSchema,
    path: string,
    errors: string[],
  ): void {
    if (schema.items) {
      arr.forEach((item, index) => {
        this.validateValue(item, schema.items!, `${path}[${index}]`, errors);
      });
    }
  }

  private validateString(
    str: string,
    schema: JSONSchema,
    path: string,
    errors: string[],
  ): void {
    if (schema.minLength !== undefined && str.length < schema.minLength) {
      errors.push(`${path}: String too short (min: ${schema.minLength})`);
    }

    if (schema.maxLength !== undefined && str.length > schema.maxLength) {
      errors.push(`${path}: String too long (max: ${schema.maxLength})`);
    }

    if (schema.pattern) {
      const regex = new RegExp(schema.pattern);
      if (!regex.test(str)) {
        errors.push(`${path}: String does not match pattern ${schema.pattern}`);
      }
    }
  }

  private validateNumber(
    num: number,
    schema: JSONSchema,
    path: string,
    errors: string[],
  ): void {
    if (schema.minimum !== undefined && num < schema.minimum) {
      errors.push(`${path}: Number too small (min: ${schema.minimum})`);
    }

    if (schema.maximum !== undefined && num > schema.maximum) {
      errors.push(`${path}: Number too large (max: ${schema.maximum})`);
    }
  }

  /**
   * Generate XML example from JSON schema
   */
  private generateXMLExample(schema: JSONSchema): string {
    const example = this.generateExampleFromSchema(schema);
    return this.convertJSONToXML(example);
  }

  /**
   * Generate KV example from JSON schema
   */
  private generateKVExample(schema: JSONSchema): string {
    const example = this.generateExampleFromSchema(schema);
    return this.convertJSONToKV(example);
  }

  /**
   * Generate example data from JSON schema
   */
  private generateExampleFromSchema(schema: JSONSchema): any {
    switch (schema.type) {
      case 'string':
        return schema.examples?.[0] || 'example_string';
      case 'number':
        return schema.examples?.[0] || 42;
      case 'boolean':
        return schema.examples?.[0] || true;
      case 'array':
        if (schema.items) {
          return [this.generateExampleFromSchema(schema.items)];
        }
        return ['example_item'];
      case 'object':
        const obj: any = {};
        if (schema.properties) {
          for (const [key, propSchema] of Object.entries(schema.properties)) {
            obj[key] = this.generateExampleFromSchema(propSchema);
          }
        }
        return obj;
      default:
        return 'example_value';
    }
  }

  /**
   * Convert JSON to XML format
   */
  private convertJSONToXML(obj: any, rootName: string = 'root'): string {
    const convertValue = (value: any, key: string): string => {
      if (value === null || value === undefined) {
        return `<${key}></${key}>`;
      }

      if (typeof value === 'object' && !Array.isArray(value)) {
        let xml = `<${key}>`;
        for (const [k, v] of Object.entries(value)) {
          xml += convertValue(v, k);
        }
        xml += `</${key}>`;
        return xml;
      }

      if (Array.isArray(value)) {
        return value
          .map((item) => convertValue(item, key.replace(/s$/, '')))
          .join('');
      }

      return `<${key}>${String(value)}</${key}>`;
    };

    return convertValue(obj, rootName);
  }

  /**
   * Convert JSON to KV format
   */
  private convertJSONToKV(obj: any, prefix: string = ''): string {
    const lines: string[] = [];

    const convertValue = (value: any, key: string): void => {
      const fullKey = prefix ? `${prefix}.${key}` : key;

      if (value === null || value === undefined) {
        lines.push(`${fullKey}=`);
        return;
      }

      if (typeof value === 'object' && !Array.isArray(value)) {
        for (const [k, v] of Object.entries(value)) {
          convertValue(v, `${fullKey}.${k}`);
        }
        return;
      }

      if (Array.isArray(value)) {
        value.forEach((item, index) => {
          convertValue(item, `${fullKey}[${index}]`);
        });
        return;
      }

      lines.push(`${fullKey}=${String(value)}`);
    };

    if (typeof obj === 'object' && !Array.isArray(obj)) {
      for (const [key, value] of Object.entries(obj)) {
        convertValue(value, key);
      }
    } else {
      lines.push(`value=${String(obj)}`);
    }

    return lines.join('\n');
  }

  /**
   * Extract XML from response
   */
  private extractXML(text: string): string | null {
    const patterns = [
      /```xml\s*([\s\S]*?)\s*```/i, // XML code blocks (has capture group)
      /```\s*([\s\S]*?)\s*```/, // Generic code blocks (has capture group)
      /<[^>]+>[\s\S]*<\/[^>]+>/, // XML tags (no capture group)
    ];

    for (let i = 0; i < patterns.length; i++) {
      const pattern = patterns[i];
      const match = text.match(pattern);
      if (match) {
        // For patterns with capture groups (first two), use match[1]
        // For patterns without capture groups (third), use match[0]
        const candidate = i < 2 ? match[1] || match[0] : match[0];
        if (this.isValidXML(candidate.trim())) {
          return candidate.trim();
        }
      }
    }

    return null;
  }

  /**
   * Extract key-value pairs from response
   */
  private extractKV(text: string): string | null {
    const patterns = [
      /```kv\s*([\s\S]*?)\s*```/i, // KV code blocks (has capture group)
      /```\s*([\s\S]*?)\s*```/, // Generic code blocks (has capture group)
    ];

    // Try code block patterns first
    for (let i = 0; i < patterns.length; i++) {
      const pattern = patterns[i];
      const match = text.match(pattern);
      if (match) {
        const candidate = match[1] || match[0];
        if (this.isValidKV(candidate.trim())) {
          return candidate.trim();
        }
      }
    }

    // If no code blocks found, try to extract key-value lines directly
    const kvLines = text
      .split('\n')
      .filter((line) => /^[\w\.\[\]]+\s*=.*$/.test(line.trim()));
    if (kvLines.length > 0) {
      const kvContent = kvLines.join('\n');
      if (this.isValidKV(kvContent)) {
        return kvContent;
      }
    }

    return null;
  }

  /**
   * Simple XML validation
   */
  private isValidXML(xml: string): boolean {
    try {
      // Basic XML structure check
      const tagRegex = /<\/?[^>]+>/g;
      const tags = xml.match(tagRegex);
      return tags !== null && tags.length > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Simple KV validation
   */
  private isValidKV(kv: string): boolean {
    const lines = kv.split('\n').filter((line) => line.trim());
    return lines.length > 0 && lines.every((line) => line.includes('='));
  }

  /**
   * Parse XML to JSON (simplified)
   */
  private parseXMLToJSON(xml: string): any {
    // This is a simplified XML parser - in production, you'd want a proper XML parser
    const result: any = {};

    // Remove XML declaration if present
    xml = xml.replace(/<\?xml[^>]*\?>/g, '');

    // Simple tag extraction
    const tagRegex = /<(\w+)>([^<]*)<\/\1>/g;
    let match;

    while ((match = tagRegex.exec(xml)) !== null) {
      const [, tagName, content] = match;
      result[tagName] = this.parseValue(content);
    }

    return result;
  }

  /**
   * Parse KV to JSON
   */
  private parseKVToJSON(kv: string): any {
    const result: any = {};

    const lines = kv.split('\n').filter((line) => line.trim());

    for (const line of lines) {
      const [key, ...valueParts] = line.split('=');
      const value = valueParts.join('=');

      if (key && value !== undefined) {
        this.setNestedValue(result, key.trim(), value.trim());
      }
    }

    return result;
  }

  /**
   * Set nested value in object using dot notation
   */
  private setNestedValue(obj: any, path: string, value: string): void {
    const keys = path.split('.');
    let current = obj;

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];

      // Handle array notation
      const arrayMatch = key.match(/^([^\[]+)\[(\d+)\]$/);
      if (arrayMatch) {
        const [, arrayKey, index] = arrayMatch;
        if (!current[arrayKey]) {
          current[arrayKey] = [];
        }
        if (!current[arrayKey][parseInt(index)]) {
          current[arrayKey][parseInt(index)] = {};
        }
        current = current[arrayKey][parseInt(index)];
      } else {
        if (!current[key]) {
          current[key] = {};
        }
        current = current[key];
      }
    }

    const lastKey = keys[keys.length - 1];
    const arrayMatch = lastKey.match(/^([^\[]+)\[(\d+)\]$/);

    if (arrayMatch) {
      const [, arrayKey, index] = arrayMatch;
      if (!current[arrayKey]) {
        current[arrayKey] = [];
      }
      current[arrayKey][parseInt(index)] = this.parseValue(value);
    } else {
      current[lastKey] = this.parseValue(value);
    }
  }

  /**
   * Parse string value to appropriate type
   */
  private parseValue(value: string): any {
    if (value === '') return null;
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (!isNaN(Number(value))) return Number(value);
    return value;
  }

  /**
   * Prepare generation options with appropriate logit bias for the target format
   */
  private prepareGenerationOptions(
    baseOptions: GenerationOptions,
    format: OutputFormat,
    attemptNumber: number,
  ): GenerationOptions {
    const options: GenerationOptions = {
      ...baseOptions,
      // Reduce creativity for structure - more aggressive on retries
      temperature: Math.max(
        0.1,
        (baseOptions.temperature || 0.7) * (0.8 - attemptNumber * 0.1),
      ),
    };

    // Apply logit bias for JSON format to improve structure adherence
    if (format === 'json') {
      if (!options.logitBias) {
        // Create default JSON bias if none provided
        const biasLevel = attemptNumber === 0 ? 'moderate' : 'aggressive';
        options.logitBias = LogitBiasManager.createJsonPreset(biasLevel);
      }
    }

    return options;
  }

  /**
   * Configure logit bias for JSON generation
   */
  configureJsonBias(config: LogitBiasConfig): void {
    // Store bias configuration for use in generation
    // This allows users to set custom bias configurations
    this.biasManager = new LogitBiasManager();
  }

  /**
   * Get default JSON generation configuration with logit bias
   */
  static getDefaultJsonConfig(
    level: 'light' | 'moderate' | 'aggressive' = 'moderate',
  ): GenerationOptions {
    return {
      temperature: 0.3,
      topP: 0.9,
      maxTokens: 2048,
      logitBias: LogitBiasManager.createJsonPreset(level),
    };
  }
}
