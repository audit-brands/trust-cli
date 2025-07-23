/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { ContentGenerator } from '../core/contentGenerator.js';
import {
  GenerateContentParameters,
  GenerateContentResponse,
  CountTokensParameters,
  CountTokensResponse,
  EmbedContentParameters,
  EmbedContentResponse,
  Content,
  Part,
  ContentListUnion,
  FinishReason,
} from '@google/genai';
import fetch from 'node-fetch';
import { 
  convertChatCompletion, 
  convertStreamToGemini,
  ChatCompletion,
  ChatCompletionChunk,
} from './ollama-gemini-converter.js';
import { createGeminiResponse } from './response-mappers.js';

interface OllamaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  images?: string[];
}

interface OllamaGenerateRequest {
  model: string;
  messages: OllamaMessage[];
  stream?: boolean;
  tools?: unknown[];
  format?: string;
  options?: {
    temperature?: number;
    top_p?: number;
    top_k?: number;
    num_predict?: number;
  };
}

export class OllamaContentGenerator implements ContentGenerator {
  private modelName: string;
  private baseUrl: string;

  constructor(modelName: string, baseUrl: string = 'http://localhost:11434') {
    this.modelName = modelName;
    this.baseUrl = baseUrl;
  }

  async generateContent(
    request: GenerateContentParameters,
  ): Promise<GenerateContentResponse> {
    const ollamaRequest = this.createOllamaRequest(request, false);

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ollamaRequest),
    });

    if (!response.ok) {
      throw new Error(`Ollama request failed: ${response.statusText}`);
    }

    const data = (await response.json()) as ChatCompletion;
    const geminiResponse = convertChatCompletion(data);
    
    // Map the converter's response to match @google/genai types
    const candidates = geminiResponse.candidates.map(candidate => ({
      content: candidate.content,
      finishReason: candidate.finishReason as FinishReason | undefined,
      index: candidate.index
    }));
    
    return createGeminiResponse(candidates, undefined, geminiResponse.usageMetadata);
  }

  async generateContentStream(
    request: GenerateContentParameters,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    const ollamaRequest = this.createOllamaRequest(request, true);
    
    // Create async generator that handles the conversion
    async function* streamGenerator(baseUrl: string, ollamaReq: OllamaGenerateRequest): AsyncGenerator<GenerateContentResponse> {
      const response = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ollamaReq),
      });

      if (!response.ok) {
        throw new Error(`Ollama request failed: ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error('Response body is null');
      }

      // Create async iterable from response chunks
      const chunks = async function* (): AsyncIterable<ChatCompletionChunk> {
        let buffer = '';
        
        for await (const chunk of response.body as AsyncIterable<Buffer>) {
          buffer += chunk.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          
          for (const line of lines) {
            if (line.trim()) {
              try {
                const data = JSON.parse(line) as ChatCompletionChunk;
                yield data;
              } catch (e) {
                console.error('Failed to parse Ollama stream chunk:', e);
              }
            }
          }
        }
      };

      // Use the converter to handle the stream
      for await (const geminiChunk of convertStreamToGemini(chunks())) {
        // Map to @google/genai response format
        const candidates = geminiChunk.candidates.map(candidate => ({
          content: candidate.content,
          finishReason: candidate.finishReason as FinishReason | undefined,
          index: candidate.index
        }));
        
        yield createGeminiResponse(candidates, undefined, geminiChunk.usageMetadata);
      }
    }
    
    return streamGenerator(this.baseUrl, ollamaRequest);
  }

  // NOTE: This is a rough estimation. The Ollama API does not currently have a
  // dedicated token counting endpoint.
  async countTokens(
    request: CountTokensParameters,
  ): Promise<CountTokensResponse> {
    const contents = this.normalizeContents(request.contents);
    const text = contents
      .flatMap(content => content.parts || []) // Add null check
      .map(part => ('text' in part ? part.text : ''))
      .join(' ');

    return {
      totalTokens: Math.ceil(text.length / 4),
    };
  }

  async embedContent(
    request: EmbedContentParameters,
  ): Promise<EmbedContentResponse> {
    const text = this.normalizeContents(request.contents) // Corrected typo: request.contents
      .flatMap(content => content.parts || []) // Add null check
      .map(part => ('text' in part ? part.text : ''))
      .join(' ');

    const response = await fetch(`${this.baseUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.modelName,
        prompt: text,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama embeddings request failed: ${response.statusText}`);
    }

    const data = (await response.json()) as { embedding: number[] };

    // Corrected the response structure to match EmbedContentResponse
    return {
      embeddings: [
        {
          values: data.embedding,
        },
      ],
    };
  }

  private createOllamaRequest(
    request: GenerateContentParameters,
    stream: boolean,
  ): OllamaGenerateRequest {
    const messages = this.convertToOllamaMessages(
      this.normalizeContents(request.contents),
    );

    const ollamaRequest: OllamaGenerateRequest = {
      model: this.modelName,
      messages,
      stream,
    };

    // Note: @google/genai types do not have generationConfig or tools directly
    // on GenerateContentParameters. This logic would need to be revisited if
    // those parameters are passed differently.

    return ollamaRequest;
  }

  private normalizeContents(contents: ContentListUnion): Content[] {
    // Case 1: The content is just a string
    if (typeof contents === 'string') {
      return [{ role: 'user', parts: [{ text: contents }] }];
    }

    // Case 2: It's an array. It could be Content[] or Part[]
    if (Array.isArray(contents)) {
      // If the array is empty, it's safe to cast to Content[]
      if (contents.length === 0) {
        return [];
      }
      // Check the first element to determine the type of the array
      const firstItem = contents[0];
      if (typeof firstItem === 'object' && firstItem !== null && 'role' in firstItem && 'parts' in firstItem) {
        // It's already a Content[] array
        return contents as Content[];
      }
      // It's a Part[] array, so we need to wrap it in a Content object
      return [{ role: 'user', parts: contents as Part[] }];
    }

    // Case 3: It's a single Content object (not in an array)
    if (typeof contents === 'object' && contents !== null && 'role' in contents && 'parts' in contents) {
      return [contents as Content];
    }

    // If it's none of the above, it's likely a Part or something else not assignable.
    // We'll treat it as a user part and wrap it accordingly.
    return [{ role: 'user', parts: [contents as Part] }];
  }

  private convertToOllamaMessages(contents: Content[]): OllamaMessage[] {
    return contents.map(content => ({
      role: content.role === 'model' ? 'assistant' : 'user',
      content: (content.parts || []).map(part => ('text' in part ? part.text : '')).join(''),
    }));
  }
}