/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  GenerateContentResponse,
  Candidate,
} from '@google/genai';

/**
 * Creates a GenerateContentResponse-compatible object from Ollama response data
 */
interface ResponseUsageMetadata {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
}

export function createGeminiResponse(
  candidates: Candidate[],
  promptFeedback?: unknown,
  usageMetadata?: ResponseUsageMetadata
): GenerateContentResponse {
  // Create a response object that includes the required getter methods
  const response = {
    candidates,
    promptFeedback,
    usageMetadata,
    
    // Implement the required getter methods
    get text(): string {
      if (!this.candidates?.[0]?.content?.parts) return '';
      return this.candidates[0].content.parts
        .filter((part: any) => part.text)
        .map((part: any) => part.text)
        .join('');
    },
    
    get functionCalls(): any[] | undefined {
      if (!this.candidates?.[0]?.content?.parts) return undefined;
      const calls = this.candidates[0].content.parts
        .filter((part: any) => part.functionCall)
        .map((part: any) => part.functionCall);
      return calls.length > 0 ? calls : undefined;
    },
    
    get data(): string | undefined {
      if (!this.candidates?.[0]?.content?.parts) return undefined;
      const dataParts = this.candidates[0].content.parts
        .filter((part: any) => part.inlineData)
        .map((part: any) => part.inlineData);
      return dataParts.length > 0 ? JSON.stringify(dataParts) : undefined;
    },
    
    get executableCode(): string | undefined {
      if (!this.candidates?.[0]?.content?.parts) return undefined;
      const codePart = this.candidates[0].content.parts
        .find((part: any) => part.executableCode);
      return codePart?.executableCode?.code;
    },
    
    get codeExecutionResult(): string | undefined {
      if (!this.candidates?.[0]?.content?.parts) return undefined;
      const resultPart = this.candidates[0].content.parts
        .find((part: any) => part.codeExecutionResult);
      return resultPart?.codeExecutionResult?.output;
    }
  };
  
  return response as GenerateContentResponse;
}