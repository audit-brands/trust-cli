/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { FunctionCall } from '@google/genai';

export interface ParseResult {
  success: boolean;
  functionCalls: FunctionCall[];
  repairedJson?: string;
  errors?: string[];
}

/**
 * Tolerant JSON parser with auto-repair capabilities
 * Handles common JSON errors from LLMs and attempts to fix them
 */
export class JsonRepairParser {
  private repairStrategies: Array<(text: string) => string> = [
    this.fixMissingQuotes.bind(this),
    this.fixTrailingCommas.bind(this),
    this.fixSingleQuotes.bind(this),
    this.fixUnescapedQuotes.bind(this),
    this.fixMissingCommas.bind(this),
    this.fixMissingBraces.bind(this),
    this.fixExtraCommas.bind(this),
    this.unwrapCodeBlocks.bind(this),
    this.extractJsonFromText.bind(this),
  ];

  /**
   * Parse function calls from text with auto-repair
   */
  parseFunctionCalls(text: string): ParseResult {
    const errors: string[] = [];

    // Try to parse as-is first
    const directResult = this.tryDirectParse(text);
    if (directResult.success) {
      return directResult;
    }

    errors.push(`Direct parse failed: ${directResult.error}`);

    // Apply repair strategies
    let repairedText = text;
    for (const strategy of this.repairStrategies) {
      try {
        repairedText = strategy(repairedText);

        // Test after each strategy
        const result = this.tryDirectParse(repairedText);
        if (result.success) {
          return {
            success: true,
            functionCalls: result.functionCalls || [],
            repairedJson: repairedText,
            errors,
          };
        }

        // If strategy didn't help, continue with the modified text anyway
        // This allows multiple strategies to work together
      } catch (e) {
        errors.push(`Strategy ${strategy.name} failed: ${e}`);
      }
    }

    // Last resort: try to extract function call patterns
    const extractedCalls = this.extractFunctionCallPatterns(text);
    if (extractedCalls.length > 0) {
      return {
        success: true,
        functionCalls: extractedCalls,
        repairedJson: JSON.stringify({ function_call: extractedCalls[0] }),
        errors,
      };
    }

    return {
      success: false,
      functionCalls: [],
      errors,
    };
  }

  private tryDirectParse(text: string): {
    success: boolean;
    functionCalls: FunctionCall[];
    error?: string;
  } {
    try {
      // First, try parsing the whole text directly
      const parsed = JSON.parse(text);
      const functionCalls = this.extractFunctionCallsFromObject(parsed);
      if (functionCalls.length > 0) {
        return { success: true, functionCalls };
      }

      // If no function calls found, try pattern matching
      const patterns = [
        // With code blocks
        /```json\s*(\{.*?\})\s*```/s,
        // Standard format: {"function_call": {"name": "...", "arguments": {...}}}
        /\{"function_call":\s*\{.*?\}\s*\}/,
        // Alternative format: {"name": "...", "arguments": {...}}
        /\{"name":\s*"[^"]+",\s*"arguments":\s*\{.*?\}\s*\}/,
      ];

      for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
          const jsonText = match[1] || match[0];
          try {
            const parsed = JSON.parse(jsonText);

            let functionCall: FunctionCall | null = null;

            if (parsed.function_call) {
              functionCall = {
                name: parsed.function_call.name,
                args: parsed.function_call.arguments || {},
                id: `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              };
            } else if (parsed.name && parsed.arguments !== undefined) {
              functionCall = {
                name: parsed.name,
                args: parsed.arguments || {},
                id: `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              };
            }

            if (functionCall) {
              return { success: true, functionCalls: [functionCall] };
            }
          } catch (e) {
            // Continue to next pattern
          }
        }
      }

      return {
        success: false,
        functionCalls: [],
        error: 'No function calls found in parsed JSON',
      };
    } catch (e) {
      return { success: false, functionCalls: [], error: String(e) };
    }
  }

  private extractFunctionCallsFromObject(obj: any): FunctionCall[] {
    const calls: FunctionCall[] = [];

    if (obj.function_call) {
      calls.push({
        name: obj.function_call.name,
        args: obj.function_call.arguments || {},
        id: `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      });
    } else if (obj.name && obj.arguments !== undefined) {
      calls.push({
        name: obj.name,
        args: obj.arguments || {},
        id: `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      });
    }

    return calls;
  }

  private fixMissingQuotes(text: string): string {
    // Fix unquoted keys: {name: "value"} -> {"name": "value"}
    // Handle both at start of object and after commas
    return text.replace(/([{,]\s*)([a-zA-Z_]\w*)(\s*):/g, '$1"$2"$3:');
  }

  private fixTrailingCommas(text: string): string {
    // Remove trailing commas: {"a": 1,} -> {"a": 1}
    return text.replace(/,(\s*[}\]])/g, '$1');
  }

  private fixSingleQuotes(text: string): string {
    // Replace single quotes with double quotes
    return text.replace(/'/g, '"');
  }

  private fixUnescapedQuotes(text: string): string {
    // Fix unescaped quotes inside strings - but only if they're actually inside strings
    // This is tricky and may need refinement - skip for now if it's causing issues
    return text;
  }

  private fixMissingCommas(text: string): string {
    // Add missing commas between properties like "key": "value" "key2": "value2"
    // Handle both quoted and unquoted values, including nested objects
    let result = text.replace(
      /(":\s*(?:"[^"]*"|\{[^}]*\}|[^,}\]]*?))\s+("[\w_]+"\s*:)/g,
      '$1,$2',
    );

    // Additional pattern for specific case like "test" "arguments"
    result = result.replace(/(")\s+("[\w_]+"\s*:)/g, '$1,$2');

    return result;
  }

  private fixMissingBraces(text: string): string {
    // Try to wrap in braces if they're missing
    const trimmed = text.trim();
    // Only add braces if it looks like a JSON property without surrounding braces
    // and doesn't already contain a complete JSON object
    if (
      !trimmed.startsWith('{') &&
      trimmed.includes('"name"') &&
      !trimmed.includes('{"') &&
      trimmed.match(/^"name":\s*"[^"]*"/) // Starts with name property
    ) {
      return '{' + trimmed + '}';
    }
    return text;
  }

  private fixExtraCommas(text: string): string {
    // Remove double commas
    return text.replace(/,\s*,/g, ',');
  }

  private unwrapCodeBlocks(text: string): string {
    // Extract JSON from code blocks
    const codeBlockMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (codeBlockMatch) {
      return codeBlockMatch[1];
    }
    return text;
  }

  private extractJsonFromText(text: string): string {
    // Try to extract JSON object from surrounding text
    // Only extract if there's clearly non-JSON text around it
    if (text.trim().startsWith('{') && text.trim().endsWith('}')) {
      // Already looks like JSON, don't extract
      return text;
    }

    // Use a greedy approach to find the largest JSON object
    const jsonMatch = text.match(/\{.*\}/);
    if (jsonMatch) {
      return jsonMatch[0];
    }
    return text;
  }

  private extractFunctionCallPatterns(text: string): FunctionCall[] {
    const calls: FunctionCall[] = [];

    // Pattern 1: Direct function name and arguments
    const pattern1 =
      /(?:function[_\s]*)?(?:call|name)[:\s]*["']?(\w+)["']?\s*(?:arguments|args|parameters)[:\s]*(\{[^}]*\})/gi;
    let match;
    while ((match = pattern1.exec(text)) !== null) {
      try {
        const args = JSON.parse(match[2]);
        calls.push({
          name: match[1],
          args,
          id: `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        });
      } catch (e) {
        // Continue if JSON parse fails
      }
    }

    // Pattern 2: Tool/function mentions with parameters
    const pattern2 = /Execute tool:\s*(\w+)\s*with arguments:\s*(\{[^}]*\})/gi;
    while ((match = pattern2.exec(text)) !== null) {
      try {
        const args = JSON.parse(match[2]);
        calls.push({
          name: match[1],
          args,
          id: `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        });
      } catch (e) {
        // Continue if JSON parse fails
      }
    }

    return calls;
  }

  /**
   * Validate function call structure
   */
  validateFunctionCall(call: FunctionCall): string[] {
    const errors: string[] = [];

    if (!call.name || typeof call.name !== 'string') {
      errors.push('Function name must be a non-empty string');
    }

    if (!call.args || typeof call.args !== 'object') {
      errors.push('Function arguments must be an object');
    }

    if (!call.id) {
      errors.push('Function call must have an ID');
    }

    return errors;
  }
}
