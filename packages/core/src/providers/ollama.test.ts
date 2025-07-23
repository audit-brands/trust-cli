/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OllamaContentGenerator } from './ollama.js';
import { FinishReason } from '@google/genai';

const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }));

vi.mock('node-fetch', () => ({
  default: mockFetch,
}));

describe('OllamaContentGenerator', () => {
  const generator = new OllamaContentGenerator('test-model');

  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('generateContent', () => {
    it('should return a valid GenerateContentResponse on success', async () => {
      const mockOllamaResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: Date.now(),
        model: 'test-model',
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: 'Hello, world!',
          },
          finish_reason: 'stop',
        }],
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockOllamaResponse),
      });

      const response = await generator.generateContent({ model: 'test-model', contents: [{ role: 'user', parts: [{ text: 'Hi' }] }] });

      expect(response.candidates).toBeDefined();
      expect(response.candidates).toHaveLength(1);
      const candidate = response.candidates![0];
      expect(candidate).toBeDefined();

      if (candidate.content && candidate.content.parts) {
        const parts = candidate.content.parts;
        expect(parts).toHaveLength(1);
        const part = parts[0];
        expect(part).toBeDefined();
        expect(part.text).toBe('Hello, world!');
      } else {
        throw new Error('Candidate content or parts were not defined');
      }
      expect(candidate.finishReason).toBe(FinishReason.STOP);
      expect(mockFetch).toHaveBeenCalledWith('http://localhost:11434/api/chat', expect.any(Object));
    });

    it('should throw an error if the fetch request fails', async () => {
      mockFetch.mockResolvedValue({ ok: false, statusText: 'Not Found' });

      await expect(generator.generateContent({ model: 'test-model', contents: [{ role: 'user', parts: [{ text: 'Hi' }] }] })).rejects.toThrow(
        'Ollama request failed: Not Found',
      );
    });
  });

  describe('embedContent', () => {
    it('should return a valid EmbedContentResponse on success', async () => {
      const mockOllamaResponse = { embedding: [0.1, 0.2, 0.3] };
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockOllamaResponse),
      });

      const response = await generator.embedContent({ model: 'test-model', contents: [{ role: 'user', parts: [{ text: 'Embed this' }] }] });

      if (response.embeddings) {
        expect(response.embeddings).toHaveLength(1);
        expect(response.embeddings[0].values).toEqual([0.1, 0.2, 0.3]);
      } else {
        throw new Error('response.embeddings was not defined');
      }
      expect(mockFetch).toHaveBeenCalledWith('http://localhost:11434/api/embeddings', expect.any(Object));
    });

    it('should throw an error if the fetch request fails', async () => {
      mockFetch.mockResolvedValue({ ok: false, statusText: 'Error' });

      await expect(generator.embedContent({ model: 'test-model', contents: [{ role: 'user', parts: [{ text: 'Embed this' }] }] })).rejects.toThrow(
        'Ollama embeddings request failed: Error',
      );
    });
  });

  describe('countTokens', () => {
    it('should return an estimated token count', async () => {
      const response = await generator.countTokens({ model: 'test-model', contents: [{ role: 'user', parts: [{ text: 'Count these tokens' }] }] });
      // "Count these tokens" is 18 chars. 18 / 4 = 4.5. ceil(4.5) = 5
      expect(response.totalTokens).toBe(5);
    });
  });
});
