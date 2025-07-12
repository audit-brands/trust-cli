/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CountTokensResponse,
  GenerateContentResponse,
  GenerateContentParameters,
  CountTokensParameters,
  EmbedContentResponse,
  EmbedContentParameters,
  Part,
  FunctionCall,
  FinishReason,
} from '@google/genai';
import { ContentGenerator } from '../core/contentGenerator.js';
import { TrustNodeLlamaClient } from './nodeLlamaClient.js';
import { TrustModelManagerImpl } from './modelManager.js';
import {
  TrustModelConfig,
  GenerationOptions,
  AIBackend,
} from './types.js';
import { GBNFunctionRegistry } from './gbnfFunctionRegistry.js';
import { JsonRepairParser } from './jsonRepairParser.js';
import { OllamaContentGenerator } from './ollamaContentGenerator.js';
import { TrustConfiguration } from '../config/trustConfig.js';

export class TrustContentGenerator implements ContentGenerator {
  private modelClient: TrustNodeLlamaClient;
  private modelManager: TrustModelManagerImpl;
  private ollamaGenerator?: OllamaContentGenerator;
  private isInitialized = false;
  private gbnfEnabled = true; // Feature flag for GBNF grammar-based function calling
  private config?: any; // Will be properly typed later
  private toolRegistry?: any; // Will be properly typed later
  private jsonRepairParser: JsonRepairParser;
  private useOllama = false; // Flag to track if Ollama is available and preferred
  private trustConfig: TrustConfiguration;
  private backendInitHistory: Array<{
    backend: string;
    success: boolean;
    error?: string;
  }> = [];

  constructor(modelsDir?: string, config?: any, toolRegistry?: any) {
    this.modelClient = new TrustNodeLlamaClient();
    this.modelManager = new TrustModelManagerImpl(modelsDir);
    this.config = config;
    this.toolRegistry = toolRegistry;
    this.jsonRepairParser = new JsonRepairParser();
    this.trustConfig = new TrustConfiguration();
  }

  async initialize(): Promise<void> {
    console.log('🔧 TrustContentGenerator.initialize() called');
    if (this.isInitialized) {
      console.log('⚠️  Already initialized, skipping');
      return;
    }

    // Initialize configuration
    await this.trustConfig.initialize();

    // Use configuration-based backend ordering
    const fallbackOrder = this.trustConfig.getFallbackOrder();
    const isFallbackEnabled = this.trustConfig.isFallbackEnabled();

    console.log(
      `🔧 AI Backend Configuration: ${fallbackOrder.join(' → ')} (fallback: ${isFallbackEnabled ? 'enabled' : 'disabled'})`,
    );

    // Try each backend in order
    let _successfulBackend: string | null = null;

    for (const backend of fallbackOrder) {
      if (this.trustConfig.isBackendEnabled(backend as AIBackend)) {
        if (await this.tryInitializeBackend(backend as AIBackend)) {
          console.log(`✅ Successfully initialized ${backend} backend`);
          this.backendInitHistory.push({ backend, success: true });
          _successfulBackend = backend;
          break;
        } else if (!isFallbackEnabled) {
          console.log(
            `❌ Failed to initialize ${backend} backend (fallback disabled)`,
          );
          break;
        }
      } else {
        console.log(`⚠️  Backend ${backend} is disabled in configuration`);
        this.backendInitHistory.push({
          backend,
          success: false,
          error: 'Disabled in configuration',
        });
      }
    }

    this.isInitialized = true;
    console.log('✅ TrustContentGenerator initialization complete');
  }

  /**
   * Try to initialize a specific backend
   */
  private async tryInitializeBackend(backend: AIBackend): Promise<boolean> {
    try {
      switch (backend) {
        case 'ollama':
          return await this.tryInitializeOllama();
        case 'huggingface':
          return await this.tryInitializeHuggingFace();
        case 'cloud':
          return await this.tryInitializeCloud();
        default:
          console.log(`⚠️  Unknown backend: ${backend}`);
          this.backendInitHistory.push({
            backend,
            success: false,
            error: 'Unknown backend type',
          });
          return false;
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log(`❌ Failed to initialize ${backend} backend:`, errorMsg);
      this.backendInitHistory.push({
        backend,
        success: false,
        error: errorMsg,
      });
      return false;
    }
  }

  /**
   * Try to initialize Ollama integration (preferred local option)
   */
  private async tryInitializeOllama(): Promise<boolean> {
    console.log('🔍 Checking for Ollama availability...');

    // Get Ollama configuration from trust config
    const ollamaConfig = this.trustConfig.getOllamaConfig();

    // Create Ollama content generator with configuration
    this.ollamaGenerator = new OllamaContentGenerator(
      this.config,
      this.toolRegistry,
      {
        model: ollamaConfig.defaultModel,
        baseUrl: ollamaConfig.baseUrl,
        enableToolCalling: true,
        maxToolCalls: ollamaConfig.maxToolCalls,
        timeout: ollamaConfig.timeout,
      },
    );

    // Try to initialize
    await this.ollamaGenerator.initialize();

    this.useOllama = true;
    console.log(
      '✅ Ollama initialized successfully - using Ollama for local AI',
    );
    console.log(
      `ℹ️  Model: ${ollamaConfig.defaultModel} | Timeout: ${ollamaConfig.timeout}ms`,
    );

    return true;
  }

  /**
   * Try to initialize HuggingFace models (GGUF fallback)
   */
  private async tryInitializeHuggingFace(): Promise<boolean> {
    console.log('🔍 Initializing HuggingFace models...');

    // Check if HuggingFace is enabled
    const huggingFaceConfig = this.trustConfig.getHuggingFaceConfig();
    if (!huggingFaceConfig.enabled) {
      console.log('⚠️  HuggingFace backend is disabled in configuration');
      return false;
    }

    await this.modelManager.initialize();

    // Load default model if available
    const currentModel = this.modelManager.getCurrentModel();
    if (currentModel) {
      try {
        await this.modelClient.loadModel(currentModel.path, currentModel);
        console.log(`✅ Loaded default model: ${currentModel.name}`);
        return true;
      } catch (error) {
        console.warn(
          `Failed to load default model ${currentModel.name}:`,
          error,
        );
        // Try to load a recommended model
        const recommended = this.modelManager.getRecommendedModel('default');
        if (recommended) {
          try {
            await this.modelClient.loadModel(recommended.path, recommended);
            await this.modelManager.switchModel(recommended.name);
            console.log(`✅ Loaded recommended model: ${recommended.name}`);
            return true;
          } catch (error2) {
            console.error('❌ Failed to load any HuggingFace model');
            console.log('💡 Troubleshooting steps:');
            console.log('   1. Check model files: trust model list --verbose');
            console.log(
              '   2. Verify model integrity: trust model verify <model-name>',
            );
            console.log(
              '   3. Try downloading a fresh model: trust model download phi-3.5-mini-instruct',
            );
            console.log(
              `   4. Error details: ${error2 instanceof Error ? error2.message : String(error2)}`,
            );
            return false;
          }
        }
      }
    } else {
      console.log('⚠️  No HuggingFace models available');
      console.log('💡 To use HuggingFace models:');
      console.log(
        '   1. Download a model: trust model download phi-3.5-mini-instruct',
      );
      console.log('   2. See available models: trust model list');
      console.log(
        '   3. Or use Ollama: ollama serve && ollama pull qwen2.5:1.5b',
      );
      return false;
    }

    return false;
  }

  /**
   * Try to initialize Cloud backend
   */
  private async tryInitializeCloud(): Promise<boolean> {
    console.log('🔍 Checking for Cloud backend availability...');

    // Check if Cloud is enabled
    const cloudConfig = this.trustConfig.getCloudConfig();
    if (!cloudConfig.enabled) {
      console.log('⚠️  Cloud backend is disabled in configuration');
      return false;
    }

    console.log(`✅ Cloud backend ready (provider: ${cloudConfig.provider})`);
    console.log('ℹ️  Note: Cloud functionality requires additional setup');

    // For now, return true since cloud setup is handled elsewhere
    return true;
  }

  async generateContent(
    request: GenerateContentParameters,
  ): Promise<GenerateContentResponse> {
    await this.initialize();

    // Smart model-aware routing: Check if current model is a HuggingFace model
    const currentModel = this.modelManager.getCurrentModel();
    const isHuggingFaceModel =
      currentModel && this.modelManager.isHuggingFaceModel(currentModel.name);

    if (isHuggingFaceModel) {
      console.log(
        `🤗 Model ${currentModel?.name} is a HuggingFace model - using HuggingFace backend`,
      );

      // Ensure the HuggingFace model is loaded
      if (!this.modelClient.isModelLoaded()) {
        try {
          console.log(`📥 Loading HuggingFace model: ${currentModel.name}`);
          await this.modelClient.loadModel(currentModel.path, currentModel);
        } catch (error) {
          const errorMsg =
            error instanceof Error ? error.message : String(error);
          let helpfulError = `Failed to load HuggingFace model ${currentModel.name}.\n\n`;
          helpfulError += `❌ Error: ${errorMsg}\n\n`;

          // Add helpful suggestions based on common errors
          if (
            errorMsg.includes('not found') ||
            errorMsg.includes('does not exist')
          ) {
            helpfulError += '💡 Model file not found. Try:\n';
            helpfulError += `   1. Download the model: trust model download ${currentModel.name}\n`;
            helpfulError += '   2. Check model status: trust model list\n';
          } else if (
            errorMsg.includes('permission') ||
            errorMsg.includes('access')
          ) {
            helpfulError += '💡 Permission issue. Try:\n';
            helpfulError +=
              '   1. Check file permissions in ~/.trustcli/models/\n';
            helpfulError += '   2. Run with appropriate permissions\n';
          } else if (errorMsg.includes('memory') || errorMsg.includes('RAM')) {
            helpfulError += '💡 Insufficient memory. Try:\n';
            helpfulError +=
              '   1. Use a smaller model: trust model recommend lightweight\n';
            helpfulError += '   2. Close other applications to free up RAM\n';
            helpfulError += `   3. Current model requires: ${currentModel.ramRequirement}\n`;
          }

          throw new Error(helpfulError);
        }
      }
    } else {
      // For non-HuggingFace models, use the original routing logic
      if (this.useOllama && this.ollamaGenerator) {
        console.log('🚀 Using Ollama for content generation');
        return this.ollamaGenerator.generateContent(request);
      }

      // Fallback to HuggingFace models if no Ollama
      if (!this.modelClient.isModelLoaded()) {
        throw new Error(this.generateBackendErrorMessage());
      }
    }

    console.log('🤗 Using HuggingFace models for content generation');

    try {
      // Convert Gemini request format to simple text prompt
      const prompt = this.convertRequestToPrompt(request);

      // Get optimized generation options based on model and request type
      const options: GenerationOptions = this.getOptimizedGenerationOptions(
        request,
        currentModel,
      );

      // Add GBNF function calling if tools are available
      if (this.gbnfEnabled && this.shouldUseGBNFunctions(request)) {
        const functions = await this.createGBNFFunctions(request);
        if (functions && Object.keys(functions).length > 0) {
          options.functions = functions;
        }
      }

      // Generate response using local model
      const response = await this.modelClient.generateText(prompt, options);

      // Convert to Gemini response format
      const geminiResponse = this.convertToGeminiResponse(response);
      return geminiResponse;
    } catch (error) {
      console.error('Error in generateContent:', error);
      throw new Error(`Local model generation failed: ${error}`);
    }
  }

  async generateContentStream(
    request: GenerateContentParameters,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    await this.initialize();

    // Smart model-aware routing: Check if current model is a HuggingFace model
    const currentModel = this.modelManager.getCurrentModel();
    const isHuggingFaceModel =
      currentModel && this.modelManager.isHuggingFaceModel(currentModel.name);

    if (isHuggingFaceModel) {
      console.log(
        `🤗 Model ${currentModel?.name} is a HuggingFace model - using HuggingFace backend for streaming`,
      );

      // Ensure the HuggingFace model is loaded
      if (!this.modelClient.isModelLoaded()) {
        try {
          console.log(`📥 Loading HuggingFace model: ${currentModel.name}`);
          await this.modelClient.loadModel(currentModel.path, currentModel);
        } catch (error) {
          const errorMsg =
            error instanceof Error ? error.message : String(error);
          let helpfulError = `Failed to load HuggingFace model ${currentModel.name}.\n\n`;
          helpfulError += `❌ Error: ${errorMsg}\n\n`;

          // Add helpful suggestions based on common errors
          if (
            errorMsg.includes('not found') ||
            errorMsg.includes('does not exist')
          ) {
            helpfulError += '💡 Model file not found. Try:\n';
            helpfulError += `   1. Download the model: trust model download ${currentModel.name}\n`;
            helpfulError += '   2. Check model status: trust model list\n';
          } else if (
            errorMsg.includes('permission') ||
            errorMsg.includes('access')
          ) {
            helpfulError += '💡 Permission issue. Try:\n';
            helpfulError +=
              '   1. Check file permissions in ~/.trustcli/models/\n';
            helpfulError += '   2. Run with appropriate permissions\n';
          } else if (errorMsg.includes('memory') || errorMsg.includes('RAM')) {
            helpfulError += '💡 Insufficient memory. Try:\n';
            helpfulError +=
              '   1. Use a smaller model: trust model recommend lightweight\n';
            helpfulError += '   2. Close other applications to free up RAM\n';
            helpfulError += `   3. Current model requires: ${currentModel.ramRequirement}\n`;
          }

          throw new Error(helpfulError);
        }
      }
    } else {
      // For non-HuggingFace models, use the original routing logic
      if (this.useOllama && this.ollamaGenerator) {
        console.log('🚀 Using Ollama for streaming content generation');
        return this.ollamaGenerator.generateContentStream(request);
      }

      // Fallback to HuggingFace models if no Ollama
      if (!this.modelClient.isModelLoaded()) {
        throw new Error(this.generateBackendErrorMessage());
      }
    }

    console.log('🤗 Using HuggingFace models for streaming content generation');

    const prompt = this.convertRequestToPrompt(request);
    const options: GenerationOptions = this.getOptimizedGenerationOptions(
      request,
      currentModel,
    );

    return this.generateStreamingResponse(prompt, options);
  }

  private async *generateStreamingResponse(
    prompt: string,
    options: GenerationOptions,
  ): AsyncGenerator<GenerateContentResponse> {
    const streamGenerator = this.modelClient.generateStream(prompt, options);

    for await (const chunk of streamGenerator) {
      const geminiResponse = this.convertToGeminiResponse(chunk);
      yield geminiResponse;
    }
  }

  async countTokens(
    request: CountTokensParameters,
  ): Promise<CountTokensResponse> {
    // Simple token counting estimation
    // In a real implementation, this would use the model's tokenizer
    const prompt = this.convertRequestToPrompt(request);
    const estimatedTokens = Math.ceil(prompt.length / 4); // Rough estimation

    return {
      totalTokens: estimatedTokens,
    };
  }

  async embedContent(
    _request: EmbedContentParameters,
  ): Promise<EmbedContentResponse> {
    // Local embedding models would be implemented here
    // For now, return empty response
    throw new Error('Local embedding models not yet implemented');
  }

  // Helper methods for format conversion
  private convertRequestToPrompt(
    request: GenerateContentParameters | CountTokensParameters,
  ): string {
    if (!request.contents) {
      return '';
    }

    // Handle both array and single content
    const contentsArray = Array.isArray(request.contents)
      ? request.contents
      : [request.contents];

    if (contentsArray.length === 0) {
      return '';
    }

    const currentModel = this.modelManager.getCurrentModel();
    const hasTools =
      'config' in request &&
      request.config?.tools &&
      request.config.tools.length > 0;

    const rawPrompt = this.buildOptimizedPrompt(
      request,
      contentsArray,
      currentModel,
      hasTools || false,
    );

    // Apply context window optimization
    return this.optimizeForContextWindow(rawPrompt, currentModel);
  }

  /**
   * Build an optimized prompt based on model type and context
   */
  private buildOptimizedPrompt(
    request: GenerateContentParameters | CountTokensParameters,
    contentsArray: any[],
    currentModel: TrustModelConfig | null,
    hasTools: boolean,
  ): string {
    const modelName = currentModel?.name || 'unknown';
    let prompt = '';

    // Add system instruction with model-specific formatting
    if ('config' in request && request.config?.systemInstruction) {
      if (
        typeof request.config.systemInstruction === 'object' &&
        'parts' in request.config.systemInstruction
      ) {
        const systemText = this.extractTextFromParts(
          request.config.systemInstruction.parts,
        );
        if (systemText) {
          prompt += this.formatSystemInstruction(systemText, modelName);
        }
      }
    }

    // Add optimized tools information if tools are present
    if (hasTools) {
      prompt += this.buildOptimizedToolsSection(request, modelName);
    }

    // Convert conversation history with model-specific formatting
    prompt += this.formatConversationHistory(contentsArray, modelName);

    return prompt.trim();
  }

  /**
   * Format system instruction based on model preferences
   */
  private formatSystemInstruction(
    systemText: string,
    modelName: string,
  ): string {
    if (modelName.includes('phi')) {
      // Phi models prefer clear instruction formatting
      return `<|system|>\n${systemText}<|end|>\n\n`;
    } else if (modelName.includes('qwen')) {
      // Qwen models work well with simple system format
      return `System: ${systemText}\n\n`;
    } else if (modelName.includes('llama')) {
      // Llama models prefer this format
      return `<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n${systemText}<|eot_id|>\n\n`;
    }

    // Default format for unknown models
    return `${systemText}\n\n`;
  }

  /**
   * Build optimized tools section based on model capabilities
   */
  private buildOptimizedToolsSection(
    request: GenerateContentParameters | CountTokensParameters,
    modelName: string,
  ): string {
    if (!('config' in request) || !request.config?.tools) {
      return '';
    }

    let toolsPrompt = '';

    // Model-specific tool calling instructions
    if (modelName.includes('phi')) {
      toolsPrompt += `\n<|user|>\nYou have access to the following tools. When you need to use a tool, respond with a JSON function call in this exact format:\n\`\`\`json\n{"function_call": {"name": "TOOL_NAME", "arguments": {...}}}\n\`\`\`<end_of_json>\n\n`;
    } else {
      toolsPrompt += `\nTOOLS: You have access to function calling. When you need to use tools, respond with valid JSON.\n\nFormat: \`\`\`json\n{"function_call": {"name": "TOOL_NAME", "arguments": {...}}}\n\`\`\`<end_of_json>\n\n`;
    }

    // Add function definitions in compact format
    toolsPrompt += `Available functions:\n`;

    for (const tool of request.config.tools) {
      if (
        tool &&
        typeof tool === 'object' &&
        'functionDeclarations' in tool &&
        tool.functionDeclarations
      ) {
        for (const func of tool.functionDeclarations) {
          if (func.name) {
            // More compact function description
            const params = func.parameters?.properties
              ? Object.keys(func.parameters.properties).join(', ')
              : 'none';
            toolsPrompt += `• ${func.name}(${params}): ${func.description || 'No description'}\n`;
          }
        }
      }
    }

    // Add a practical example
    toolsPrompt += `\nExample:\nUser: List files here\nAssistant: \`\`\`json\n{"function_call": {"name": "list_directory", "arguments": {"path": "."}}}\n\`\`\`<end_of_json>\n\n`;

    return toolsPrompt;
  }

  /**
   * Format conversation history based on model preferences
   */
  private formatConversationHistory(
    contentsArray: any[],
    modelName: string,
  ): string {
    let historyPrompt = '';

    for (const content of contentsArray) {
      if (
        typeof content === 'object' &&
        content !== null &&
        'parts' in content
      ) {
        const text = this.extractTextFromParts(content.parts);
        if (text) {
          if (modelName.includes('phi')) {
            // Phi models prefer explicit role markers
            const role =
              content.role === 'model' ? '<|assistant|>' : '<|user|>';
            historyPrompt += `${role}\n${text}<|end|>\n\n`;
          } else if (modelName.includes('llama')) {
            // Llama models prefer header format
            const role = content.role === 'model' ? 'assistant' : 'user';
            historyPrompt += `<|start_header_id|>${role}<|end_header_id|>\n${text}<|eot_id|>\n\n`;
          } else {
            // Default format for other models
            const role = content.role === 'model' ? 'Assistant' : 'User';
            historyPrompt += `${role}: ${text}\n\n`;
          }
        }
      }
    }

    return historyPrompt;
  }

  /**
   * Optimize prompt for model's context window limitations
   */
  private optimizeForContextWindow(
    prompt: string,
    currentModel: TrustModelConfig | null,
  ): string {
    const modelName = currentModel?.name || 'unknown';
    const maxContextLength = this.getModelContextLimit(modelName);

    // Rough token estimation (4 chars per token on average)
    const estimatedTokens = Math.ceil(prompt.length / 4);

    if (estimatedTokens <= maxContextLength * 0.7) {
      // We're well within limits, return as-is
      return prompt;
    }

    // Need to truncate - preserve system instruction and recent context
    const lines = prompt.split('\n');
    const systemEndIndex = this.findSystemSectionEnd(lines);
    const toolsEndIndex = this.findToolsSectionEnd(lines, systemEndIndex);

    // Keep system instruction and tools section intact
    const preservedStart = lines
      .slice(0, Math.max(systemEndIndex, toolsEndIndex))
      .join('\n');
    const conversationPart = lines
      .slice(Math.max(systemEndIndex, toolsEndIndex))
      .join('\n');

    // Calculate how much conversation we can keep
    const preservedTokens = Math.ceil(preservedStart.length / 4);
    const availableTokens =
      Math.floor(maxContextLength * 0.7) - preservedTokens;
    const maxConversationChars = availableTokens * 4;

    if (conversationPart.length <= maxConversationChars) {
      return prompt; // Still fits
    }

    // Truncate conversation history, keeping most recent
    const truncatedConversation = conversationPart.slice(-maxConversationChars);

    // Add truncation indicator
    const truncationNotice =
      '\n[... earlier conversation truncated for context window ...]\n';

    return preservedStart + truncationNotice + truncatedConversation;
  }

  /**
   * Get context limit for different model types
   */
  private getModelContextLimit(modelName: string): number {
    if (modelName.includes('7b') || modelName.includes('large')) {
      return 8192; // Larger models typically have more context
    } else if (modelName.includes('3b') || modelName.includes('small')) {
      return 4096; // Medium models
    } else if (modelName.includes('1.5b') || modelName.includes('mini')) {
      return 2048; // Smaller models have limited context
    } else if (modelName.includes('qwen')) {
      return 8192; // Qwen models typically have good context length
    } else if (modelName.includes('phi')) {
      return 4096; // Phi models moderate context
    }

    return 4096; // Conservative default
  }

  /**
   * Find where system section ends in prompt lines
   */
  private findSystemSectionEnd(lines: string[]): number {
    for (let i = 0; i < lines.length; i++) {
      if (
        lines[i].includes('<|end|>') ||
        lines[i].includes('<|eot_id|>') ||
        (lines[i].trim() === '' && i > 0 && !lines[i - 1].includes('System:'))
      ) {
        return i + 1;
      }
    }
    return Math.min(10, lines.length); // Fallback to first 10 lines
  }

  /**
   * Find where tools section ends in prompt lines
   */
  private findToolsSectionEnd(lines: string[], startIndex: number): number {
    for (let i = startIndex; i < lines.length; i++) {
      if (lines[i].includes('Example:') && i + 5 < lines.length) {
        // Look for end of example section
        for (let j = i; j < Math.min(i + 10, lines.length); j++) {
          if (lines[j].includes('<end_of_json>')) {
            return j + 2; // Include some buffer after example
          }
        }
      }
    }
    return startIndex; // No tools section found
  }

  private extractTextFromParts(parts: Part[] | Part | undefined): string {
    if (!parts) return '';

    const partsArray = Array.isArray(parts) ? parts : [parts];

    return partsArray
      .map((part) => {
        if (typeof part === 'string') return part;
        if (typeof part === 'object' && part !== null) {
          if ('text' in part && part.text) return part.text;
          if ('functionCall' in part && part.functionCall)
            return `[Function call: ${part.functionCall.name}]`;
          if ('functionResponse' in part && part.functionResponse) {
            const response = part.functionResponse.response;
            const responseText =
              typeof response === 'string'
                ? response
                : JSON.stringify(response);
            return `[Function ${part.functionResponse.name} returned: ${responseText}]`;
          }
        }
        return '';
      })
      .join(' ')
      .trim();
  }

  private parseFunctionCalls(text: string): {
    text: string;
    functionCalls: FunctionCall[];
  } {
    // First try the tolerant parser
    const parseResult = this.jsonRepairParser.parseFunctionCalls(text);

    if (parseResult.success && parseResult.functionCalls.length > 0) {
      // Log successful repairs for debugging
      if (
        parseResult.repairedJson &&
        parseResult.errors &&
        parseResult.errors.length > 0
      ) {
        // JSON auto-repair succeeded
      }

      // Remove function calls from original text
      let cleanedText = text;
      for (const call of parseResult.functionCalls) {
        // Try to remove various patterns
        const patterns = [
          new RegExp(
            `\\{"function_call":\\s*\\{"name":\\s*"${call.name}"[^}]+\\}\\s*\\}`,
            'g',
          ),
          new RegExp(`\\{"name":\\s*"${call.name}"[^}]+\\}`, 'g'),
          new RegExp(
            `\`\`\`(?:json)?[^\\}]*"${call.name}"[^\\}]+\\}\`\`\``,
            'gs',
          ),
        ];

        for (const pattern of patterns) {
          cleanedText = cleanedText.replace(pattern, '').trim();
        }
      }

      return { text: cleanedText, functionCalls: parseResult.functionCalls };
    }

    // Fall back to original parsing logic if repair fails
    const functionCalls: FunctionCall[] = [];
    let cleanedText = text;

    // Look for JSON function call patterns - updated to handle nested objects and multiline formatting
    // Support both ```json and ```bash blocks since models sometimes use different blocks
    const functionCallRegex = /```(?:json|bash)\s*\n([\s\S]*?)\n\s*```/gs;
    let match;

    while ((match = functionCallRegex.exec(text)) !== null) {
      try {
        const jsonMatch = match[1].trim();
        // Only process if it contains function_call
        if (jsonMatch.includes('function_call')) {
          const parsed = JSON.parse(jsonMatch);

          if (parsed.function_call && parsed.function_call.name) {
            const functionCall: FunctionCall = {
              name: parsed.function_call.name,
              args: parsed.function_call.arguments || {},
              id: `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            };
            functionCalls.push(functionCall);

            // Remove the function call from the text
            cleanedText = cleanedText.replace(match[0], '').trim();
          }
        }
      } catch (error) {
        console.warn('Failed to parse function call JSON:', error);
      }
    }

    // Also look for simpler patterns without code blocks
    const simpleFunctionCallRegex =
      /{"function_call":\s*{"name":\s*"[^"]+",\s*"arguments":\s*{.*?}}}/gs;

    while ((match = simpleFunctionCallRegex.exec(cleanedText)) !== null) {
      try {
        const parsed = JSON.parse(match[0]);

        if (parsed.function_call && parsed.function_call.name) {
          const functionCall: FunctionCall = {
            name: parsed.function_call.name,
            args: parsed.function_call.arguments || {},
            id: `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          };
          functionCalls.push(functionCall);

          // Remove the function call from the text
          cleanedText = cleanedText.replace(match[0], '').trim();
        }
      } catch (error) {
        console.warn('Failed to parse simple function call JSON:', error);
      }
    }

    return { text: cleanedText, functionCalls };
  }

  private convertToGeminiResponse(text: string): GenerateContentResponse {
    const { text: cleanedText, functionCalls } = this.parseFunctionCalls(text);

    const response: GenerateContentResponse = {
      candidates: [
        {
          content: {
            parts: [{ text: cleanedText }],
            role: 'model',
          },
          finishReason: FinishReason.STOP,
          index: 0,
        },
      ],
      text: cleanedText,
      data: undefined,
      functionCalls,
      executableCode: undefined,
      codeExecutionResult: undefined,
    } as unknown as GenerateContentResponse;

    // If we found function calls, we need to add them to the response parts
    if (functionCalls.length > 0) {
      const parts: Part[] = [];

      // Add text part if there's any text content
      if (cleanedText.trim()) {
        parts.push({ text: cleanedText });
      }

      // Add function call parts
      for (const call of functionCalls) {
        parts.push({ functionCall: call });
      }

      // Update the candidate content parts
      if (
        response.candidates &&
        response.candidates[0] &&
        response.candidates[0].content
      ) {
        response.candidates[0].content.parts = parts;
      }
    }

    return response;
  }

  // Model management methods
  async switchModel(modelName: string): Promise<void> {
    await this.modelManager.switchModel(modelName);
    const newModel = this.modelManager.getCurrentModel();
    if (newModel) {
      await this.modelClient.loadModel(newModel.path, newModel);
    }
  }

  async downloadModel(modelId: string): Promise<void> {
    await this.modelManager.downloadModel(modelId);
  }

  listAvailableModels(): TrustModelConfig[] {
    return this.modelManager.listAvailableModels();
  }

  getCurrentModel(): TrustModelConfig | null {
    return this.modelManager.getCurrentModel();
  }

  getModelMetrics() {
    return this.modelClient.getMetrics();
  }

  getRecommendedModel(
    task: string,
    ramLimit?: number,
  ): TrustModelConfig | null {
    return this.modelManager.getRecommendedModel(task, ramLimit);
  }

  // Configuration management methods
  getTrustConfig(): TrustConfiguration {
    return this.trustConfig;
  }

  async saveConfig(): Promise<void> {
    await this.trustConfig.save();
  }

  async setBackendPreference(backend: AIBackend): Promise<void> {
    this.trustConfig.setPreferredBackend(backend);
    await this.saveConfig();

    // Reinitialize with new preference
    this.isInitialized = false;
    this.useOllama = false;
    this.ollamaGenerator = undefined;

    await this.initialize();
  }

  async setFallbackOrder(order: AIBackend[]): Promise<void> {
    this.trustConfig.setFallbackOrder(order);
    await this.saveConfig();

    // Reinitialize with new order
    this.isInitialized = false;
    this.useOllama = false;
    this.ollamaGenerator = undefined;

    await this.initialize();
  }

  getCurrentBackend(): string {
    if (this.useOllama && this.ollamaGenerator) {
      return 'ollama';
    } else if (this.modelClient.isModelLoaded()) {
      return 'huggingface';
    } else {
      return 'cloud';
    }
  }

  private generateBackendErrorMessage(): string {
    let message = 'No AI backend available.\n\n';

    // Show what was tried
    if (this.backendInitHistory.length > 0) {
      message += '📊 Backend initialization attempts:\n';
      for (const attempt of this.backendInitHistory) {
        const icon = attempt.success ? '✅' : '❌';
        message += `   ${icon} ${attempt.backend}`;
        if (attempt.error) {
          message += ` - ${attempt.error}`;
        }
        message += '\n';
      }
      message += '\n';
    }

    // Add specific suggestions based on what failed
    const failedBackends = this.backendInitHistory.filter((h) => !h.success);

    if (
      failedBackends.some(
        (b) => b.backend === 'ollama' && b.error?.includes('not running'),
      )
    ) {
      message += '💡 To use Ollama (recommended for best performance):\n';
      message += '   1. Install Ollama from https://ollama.ai\n';
      message += '   2. Start Ollama with: ollama serve\n';
      message += '   3. Pull a model: ollama pull qwen2.5:1.5b\n\n';
    }

    if (failedBackends.some((b) => b.backend === 'huggingface')) {
      message += '💡 To use HuggingFace models:\n';
      message +=
        '   1. Download a model: trust model download phi-3.5-mini-instruct\n';
      message +=
        '   2. Switch to it: trust model switch phi-3.5-mini-instruct\n';
      message += '   3. Try again\n\n';
    }

    if (
      failedBackends.some(
        (b) => b.backend === 'cloud' && b.error?.includes('Disabled'),
      )
    ) {
      message += '💡 To enable cloud backend:\n';
      message += '   1. Run: trust config set ai.cloud.enabled true\n';
      message += '   2. Configure cloud provider settings\n\n';
    }

    message += '📖 For more help: trust status backend --verbose';

    return message;
  }

  getBackendStatus(): { [key: string]: boolean } {
    return {
      ollama: this.useOllama && !!this.ollamaGenerator,
      huggingface: this.modelClient.isModelLoaded(),
      cloud: this.trustConfig.getCloudConfig().enabled,
    };
  }

  /**
   * Get optimized generation options based on model type and request context
   */
  private getOptimizedGenerationOptions(
    request: GenerateContentParameters,
    currentModel: TrustModelConfig | null,
  ): GenerationOptions {
    const hasTools =
      'config' in request &&
      request.config?.tools &&
      request.config.tools.length > 0;
    const modelName = currentModel?.name || 'unknown';

    // Base options with smart defaults
    const options: GenerationOptions = {
      temperature: request.config?.temperature || (hasTools ? 0.1 : 0.7), // Lower temp for function calls, higher for creative tasks
      topP: request.config?.topP || 0.9,
      maxTokens: this.getOptimalMaxTokens(modelName, hasTools || false),
      stopTokens: this.getOptimalStopTokens(modelName, hasTools || false),
    };

    // Model-specific optimizations
    if (modelName.includes('phi')) {
      // Phi models prefer slightly higher temperature and different stop tokens
      options.temperature = Math.min((options.temperature || 0.7) * 1.2, 0.9);
      options.topP = 0.95;
    } else if (modelName.includes('qwen')) {
      // Qwen models work well with more diverse outputs
      options.topP = 0.85;
    } else if (modelName.includes('llama')) {
      // Llama models benefit from specific stop patterns
      if (hasTools) {
        options.stopTokens = [
          ...(options.stopTokens || []),
          '</function_call>',
          '```\n\n',
        ];
      }
    }

    return options;
  }

  /**
   * Get optimal max tokens based on model and task type
   */
  private getOptimalMaxTokens(modelName: string, hasTools: boolean): number {
    // Function calling typically needs fewer tokens
    if (hasTools) {
      return 1024; // Increased from 512 to allow for complete function calls and explanations
    }

    // For general chat, allow more tokens for detailed responses
    if (modelName.includes('7b') || modelName.includes('large')) {
      return 2048; // Larger models can handle more context
    } else if (modelName.includes('3b') || modelName.includes('small')) {
      return 1536; // Smaller models get moderate limit
    } else if (modelName.includes('1.5b') || modelName.includes('mini')) {
      return 1024; // Very small models get conservative limit
    }

    return 1536; // Default for unknown models
  }

  /**
   * Get optimal stop tokens based on model and task type
   */
  private getOptimalStopTokens(modelName: string, hasTools: boolean): string[] {
    const baseStopTokens = ['<|im_end|>', '<|endoftext|>', 'User:', 'Human:'];

    if (hasTools) {
      // For function calling, we want to stop after JSON completion
      return [
        ...baseStopTokens,
        '<end_of_json>',
        '```\n\nUser:',
        '```\n\nHuman:',
      ];
    }

    // For general chat, use broader stop patterns
    return [...baseStopTokens, '\n\nUser:', '\n\nHuman:'];
  }

  /**
   * Determine if we should use GBNF function calling for this request
   */
  private shouldUseGBNFunctions(request: GenerateContentParameters): boolean {
    return !!(
      'config' in request &&
      request.config?.tools &&
      request.config.tools.length > 0
    );
  }

  /**
   * Create GBNF functions from Gemini function declarations
   * This enables grammar-based JSON schema enforcement for reliable function calling
   */
  private async createGBNFFunctions(
    request: GenerateContentParameters,
  ): Promise<Record<string, any> | null> {
    if (!('config' in request) || !request.config?.tools) {
      return null;
    }

    // Check if we have the required dependencies
    if (!this.config || !this.toolRegistry) {
      return null;
    }

    try {
      // Create GBNF function registry
      const gbnfRegistry = new GBNFunctionRegistry(
        this.config,
        this.toolRegistry,
      );

      // Convert our tools to native node-llama-cpp functions
      const functions = await gbnfRegistry.createNativeFunctions();

      return functions;
    } catch (error) {
      console.error('Error creating GBNF functions:', error);
      return null;
    }
  }
}
