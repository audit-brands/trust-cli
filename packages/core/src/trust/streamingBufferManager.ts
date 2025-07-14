/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Performance metrics for buffer monitoring
 */
export interface BufferMetrics {
  /** Current buffer utilization as percentage (0-100) */
  bufferUtilization: number;
  /** Number of overflow events (buffer full) */
  overflowEvents: number;
  /** Current memory usage in bytes */
  memoryUsage: number;
  /** Average processing latency in milliseconds */
  averageLatency: number;
  /** Total chunks processed */
  chunksProcessed: number;
  /** Bytes processed since last reset */
  bytesProcessed: number;
  /** Current backpressure level (0-1) */
  backpressureLevel: number;
  /** Timestamp of last metrics update */
  lastUpdated: Date;
}

/**
 * Configuration options for the streaming buffer manager
 */
export interface StreamingBufferConfig {
  /** Maximum buffer size in bytes (default: 64KB) */
  maxBufferSize?: number;
  /** Maximum chunk size in bytes (default: 8KB) */
  maxChunkSize?: number;
  /** Chunk processing timeout in milliseconds (default: 5000) */
  chunkTimeout?: number;
  /** Enable backpressure handling (default: true) */
  enableBackpressure?: boolean;
  /** Backpressure threshold (0-1, default: 0.8) */
  backpressureThreshold?: number;
  /** Enable performance metrics collection (default: true) */
  enableMetrics?: boolean;
  /** Memory usage warning threshold in bytes (default: 16MB) */
  memoryWarningThreshold?: number;
}

/**
 * Internal buffer chunk representation
 */
interface BufferChunk {
  /** Chunk data */
  data: string;
  /** Chunk creation timestamp */
  timestamp: number;
  /** Chunk size in bytes */
  size: number;
  /** Chunk sequence number */
  sequence: number;
}

/**
 * Error types for streaming buffer operations
 */
export class StreamingBufferError extends Error {
  constructor(
    message: string,
    public readonly code: 'BUFFER_OVERFLOW' | 'CHUNK_TIMEOUT' | 'BACKPRESSURE' | 'MEMORY_LIMIT' | 'INVALID_CHUNK'
  ) {
    super(message);
    this.name = 'StreamingBufferError';
  }
}

/**
 * High-performance streaming buffer manager with circular buffer implementation
 * Designed to prevent unbounded memory growth and handle backpressure efficiently
 */
export class StreamingBufferManager {
  private readonly config: Required<StreamingBufferConfig>;
  private readonly buffer: BufferChunk[];
  private readonly metrics: BufferMetrics;
  
  private bufferHead: number = 0;
  private bufferTail: number = 0;
  private bufferSize: number = 0;
  private sequenceCounter: number = 0;
  private processingStartTime: number = 0;
  private latencyHistory: number[] = [];
  private isDisposed: boolean = false;

  constructor(config: StreamingBufferConfig = {}) {
    this.config = {
      maxBufferSize: config.maxBufferSize ?? 64 * 1024, // 64KB
      maxChunkSize: config.maxChunkSize ?? 8 * 1024, // 8KB
      chunkTimeout: config.chunkTimeout ?? 5000,
      enableBackpressure: config.enableBackpressure ?? true,
      backpressureThreshold: config.backpressureThreshold ?? 0.8,
      enableMetrics: config.enableMetrics ?? true,
      memoryWarningThreshold: config.memoryWarningThreshold ?? 16 * 1024 * 1024 // 16MB
    };

    // Initialize circular buffer
    const bufferCapacity = Math.ceil(this.config.maxBufferSize / this.config.maxChunkSize);
    this.buffer = new Array(bufferCapacity);

    // Initialize metrics
    this.metrics = {
      bufferUtilization: 0,
      overflowEvents: 0,
      memoryUsage: 0,
      averageLatency: 0,
      chunksProcessed: 0,
      bytesProcessed: 0,
      backpressureLevel: 0,
      lastUpdated: new Date()
    };
  }

  /**
   * Add a chunk to the buffer with overflow and backpressure handling
   */
  public addChunk(data: string): void {
    if (this.isDisposed) {
      throw new StreamingBufferError('Buffer manager has been disposed', 'INVALID_CHUNK');
    }

    const chunkSize = this.getByteSize(data);
    
    // Validate chunk size
    if (chunkSize > this.config.maxChunkSize) {
      throw new StreamingBufferError(
        `Chunk size ${chunkSize} exceeds maximum ${this.config.maxChunkSize}`,
        'INVALID_CHUNK'
      );
    }

    // Check for buffer overflow
    if (this.bufferSize + chunkSize > this.config.maxBufferSize) {
      this.handleBufferOverflow();
    }

    // Check backpressure
    if (this.config.enableBackpressure && this.getUtilization() > this.config.backpressureThreshold) {
      this.metrics.backpressureLevel = Math.min(1, this.getUtilization() / this.config.backpressureThreshold);
      throw new StreamingBufferError('Buffer backpressure threshold exceeded', 'BACKPRESSURE');
    }

    // Add chunk to circular buffer
    const chunk: BufferChunk = {
      data,
      timestamp: Date.now(),
      size: chunkSize,
      sequence: this.sequenceCounter++
    };

    this.buffer[this.bufferTail] = chunk;
    this.bufferTail = (this.bufferTail + 1) % this.buffer.length;
    this.bufferSize += chunkSize;

    // Update metrics
    if (this.config.enableMetrics) {
      this.updateMetrics();
    }
  }

  /**
   * Get the next chunk from the buffer (FIFO order)
   */
  public getNextChunk(): string | null {
    if (this.isDisposed || this.isEmpty()) {
      return null;
    }

    const chunk = this.buffer[this.bufferHead];
    if (!chunk) {
      return null;
    }

    // Check for chunk timeout
    const age = Date.now() - chunk.timestamp;
    if (age > this.config.chunkTimeout) {
      this.removeChunk();
      throw new StreamingBufferError(
        `Chunk timeout after ${age}ms (limit: ${this.config.chunkTimeout}ms)`,
        'CHUNK_TIMEOUT'
      );
    }

    const data = chunk.data;
    this.removeChunk();

    // Update processing metrics
    if (this.config.enableMetrics) {
      this.updateProcessingMetrics(age);
    }

    return data;
  }

  /**
   * Remove the oldest chunk from the buffer
   */
  private removeChunk(): void {
    if (this.isEmpty()) {
      return;
    }

    const chunk = this.buffer[this.bufferHead];
    if (chunk) {
      this.bufferSize -= chunk.size;
      this.buffer[this.bufferHead] = undefined as any;
      this.bufferHead = (this.bufferHead + 1) % this.buffer.length;
    }
  }

  /**
   * Handle buffer overflow by removing oldest chunks
   */
  private handleBufferOverflow(): void {
    // Remove chunks until we have space or buffer is empty
    while (!this.isEmpty() && this.bufferSize >= this.config.maxBufferSize * 0.5) {
      this.removeChunk();
    }

    this.metrics.overflowEvents++;
  }

  /**
   * Check if buffer is empty
   */
  public isEmpty(): boolean {
    return this.bufferHead === this.bufferTail && this.bufferSize === 0;
  }

  /**
   * Get current buffer utilization (0-1)
   */
  public getUtilization(): number {
    return this.bufferSize / this.config.maxBufferSize;
  }

  /**
   * Get current buffer metrics
   */
  public getMetrics(): BufferMetrics {
    if (this.config.enableMetrics) {
      this.updateMetrics();
    }
    return { ...this.metrics };
  }

  /**
   * Reset buffer metrics
   */
  public resetMetrics(): void {
    this.metrics.overflowEvents = 0;
    this.metrics.chunksProcessed = 0;
    this.metrics.bytesProcessed = 0;
    this.metrics.backpressureLevel = 0;
    this.latencyHistory = [];
    this.metrics.lastUpdated = new Date();
  }

  /**
   * Clear all buffer contents
   */
  public clear(): void {
    this.bufferHead = 0;
    this.bufferTail = 0;
    this.bufferSize = 0;
    this.sequenceCounter = 0;
    this.buffer.fill(undefined as any);
    
    if (this.config.enableMetrics) {
      this.updateMetrics();
    }
  }

  /**
   * Dispose of the buffer manager and free resources
   */
  public dispose(): void {
    this.clear();
    this.isDisposed = true;
  }

  /**
   * Update buffer metrics
   */
  private updateMetrics(): void {
    this.metrics.bufferUtilization = this.getUtilization() * 100;
    this.metrics.memoryUsage = this.estimateMemoryUsage();
    this.metrics.lastUpdated = new Date();

    // Check memory warning threshold
    if (this.metrics.memoryUsage > this.config.memoryWarningThreshold) {
      console.warn(`StreamingBufferManager: Memory usage (${this.metrics.memoryUsage} bytes) exceeds warning threshold`);
    }
  }

  /**
   * Update processing-related metrics
   */
  private updateProcessingMetrics(latency: number): void {
    this.metrics.chunksProcessed++;
    this.latencyHistory.push(latency);

    // Keep only last 100 latency measurements for rolling average
    if (this.latencyHistory.length > 100) {
      this.latencyHistory.shift();
    }

    this.metrics.averageLatency = this.latencyHistory.reduce((sum, l) => sum + l, 0) / this.latencyHistory.length;
  }

  /**
   * Estimate current memory usage in bytes
   */
  private estimateMemoryUsage(): number {
    let totalSize = 0;
    
    for (let i = 0; i < this.buffer.length; i++) {
      const chunk = this.buffer[i];
      if (chunk) {
        // String data + object overhead
        totalSize += chunk.size + 64; // Estimated object overhead
      }
    }

    // Add array and manager overhead
    totalSize += this.buffer.length * 8; // Array slot overhead
    totalSize += 1024; // Manager instance overhead

    return totalSize;
  }

  /**
   * Get byte size of a string (UTF-8 encoding)
   */
  private getByteSize(str: string): number {
    return new Blob([str]).size;
  }

  /**
   * Wrap an existing streaming generator with buffer management
   */
  public static wrapStream<T extends string>(
    stream: AsyncIterable<T>,
    config?: StreamingBufferConfig
  ): AsyncIterable<string> {
    return new StreamingBufferWrapper(stream, config);
  }

  /**
   * Create a managed stream from a ReadableStream
   */
  public static fromReadableStream(
    stream: ReadableStream<Uint8Array>,
    config?: StreamingBufferConfig
  ): AsyncIterable<string> {
    return new ReadableStreamWrapper(stream, config);
  }
}

/**
 * Wrapper for async iterables that adds buffer management
 */
class StreamingBufferWrapper<T extends string> implements AsyncIterable<string> {
  private readonly bufferManager: StreamingBufferManager;

  constructor(
    private readonly source: AsyncIterable<T>,
    config?: StreamingBufferConfig
  ) {
    this.bufferManager = new StreamingBufferManager(config);
  }

  async* [Symbol.asyncIterator](): AsyncIterator<string> {
    try {
      // Start background processing of source stream
      const processingPromise = this.processSource();

      // Yield chunks as they become available
      while (true) {
        const chunk = this.bufferManager.getNextChunk();
        
        if (chunk !== null) {
          yield chunk;
        } else {
          // No chunks available, wait briefly
          await new Promise(resolve => setTimeout(resolve, 10));
          
          // Check if source is done and buffer is empty
          if (this.bufferManager.isEmpty()) {
            const isSourceDone = await Promise.race([
              processingPromise.then(() => true),
              new Promise<boolean>(resolve => setTimeout(() => resolve(false), 0))
            ]);
            
            if (isSourceDone) {
              break;
            }
          }
        }
      }
    } finally {
      this.bufferManager.dispose();
    }
  }

  private async processSource(): Promise<void> {
    try {
      for await (const chunk of this.source) {
        try {
          this.bufferManager.addChunk(chunk);
        } catch (error) {
          if (error instanceof StreamingBufferError && error.code === 'BACKPRESSURE') {
            // Handle backpressure by waiting
            await new Promise(resolve => setTimeout(resolve, 50));
            // Retry adding the chunk
            this.bufferManager.addChunk(chunk);
          } else {
            throw error;
          }
        }
      }
    } catch (error) {
      console.error('Error processing source stream:', error);
      throw error;
    }
  }
}

/**
 * Wrapper for ReadableStream that adds buffer management
 */
class ReadableStreamWrapper implements AsyncIterable<string> {
  private readonly bufferManager: StreamingBufferManager;
  private readonly decoder: TextDecoder;

  constructor(
    private readonly stream: ReadableStream<Uint8Array>,
    config?: StreamingBufferConfig
  ) {
    this.bufferManager = new StreamingBufferManager(config);
    this.decoder = new TextDecoder();
  }

  async* [Symbol.asyncIterator](): AsyncIterator<string> {
    const reader = this.stream.getReader();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          // Process any remaining buffer content
          if (buffer.trim()) {
            this.bufferManager.addChunk(buffer);
          }
          break;
        }

        // Decode and buffer the chunk
        buffer += this.decoder.decode(value, { stream: true });
        
        // Process complete lines
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.trim()) {
            try {
              this.bufferManager.addChunk(line);
            } catch (error) {
              if (error instanceof StreamingBufferError && error.code === 'BACKPRESSURE') {
                // Handle backpressure
                await new Promise(resolve => setTimeout(resolve, 20));
                this.bufferManager.addChunk(line);
              } else {
                throw error;
              }
            }
          }
        }

        // Yield available chunks
        while (!this.bufferManager.isEmpty()) {
          const chunk = this.bufferManager.getNextChunk();
          if (chunk !== null) {
            yield chunk;
          } else {
            break;
          }
        }
      }

      // Yield any remaining chunks
      while (!this.bufferManager.isEmpty()) {
        const chunk = this.bufferManager.getNextChunk();
        if (chunk !== null) {
          yield chunk;
        } else {
          break;
        }
      }

    } finally {
      reader.releaseLock();
      this.bufferManager.dispose();
    }
  }
}

/**
 * Integration helpers for existing adapters
 */
export class StreamingIntegrationHelpers {
  /**
   * Enhance Ollama streaming with buffer management
   */
  public static enhanceOllamaStream(
    response: Response,
    config?: StreamingBufferConfig
  ): AsyncIterable<string> {
    if (!response.body) {
      throw new Error('No response body available');
    }

    return StreamingBufferManager.fromReadableStream(response.body, config);
  }

  /**
   * Create a fake streaming generator with proper buffer management
   */
  public static createFakeStream(
    text: string,
    options: {
      chunkSize?: number;
      delayMs?: number;
      config?: StreamingBufferConfig;
    } = {}
  ): AsyncIterable<string> {
    const chunkSize = options.chunkSize ?? 10; // Characters per chunk
    const delayMs = options.delayMs ?? 50;

    async function* generator(): AsyncIterable<string> {
      for (let i = 0; i < text.length; i += chunkSize) {
        const chunk = text.slice(i, i + chunkSize);
        yield chunk;
        if (i + chunkSize < text.length) {
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }
    }

    return StreamingBufferManager.wrapStream(generator(), options.config);
  }

  /**
   * Parse streaming JSON responses with error recovery
   */
  public static parseStreamingJson(
    stream: AsyncIterable<string>,
    config?: StreamingBufferConfig
  ): AsyncIterable<any> {
    return this.parseWithErrorRecovery(stream, config);
  }

  /**
   * Private method for parsing with error recovery
   */
  private static async* parseWithErrorRecovery(
    stream: AsyncIterable<string>,
    config?: StreamingBufferConfig
  ): AsyncIterable<any> {
    let buffer = '';
    const wrappedStream = StreamingBufferManager.wrapStream(stream, config);

    for await (const chunk of wrappedStream) {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed) {
          try {
            const parsed = JSON.parse(trimmed);
            yield parsed;
          } catch (error) {
            // Log malformed JSON but continue processing
            console.warn('Malformed JSON in stream:', trimmed.substring(0, 100));
          }
        }
      }
    }

    // Process any remaining buffer content
    if (buffer.trim()) {
      try {
        const parsed = JSON.parse(buffer.trim());
        yield parsed;
      } catch (error) {
        console.warn('Final buffer contains malformed JSON:', buffer.substring(0, 100));
      }
    }
  }

  /**
   * Monitor stream performance and log metrics
   */
  public static monitorStream(
    stream: AsyncIterable<string>,
    options: {
      logInterval?: number;
      config?: StreamingBufferConfig;
    } = {}
  ): AsyncIterable<string> {
    const logInterval = options.logInterval ?? 5000; // 5 seconds
    const bufferManager = new StreamingBufferManager(options.config);
    
    return this.createMonitoredStream(stream, bufferManager, logInterval);
  }

  /**
   * Create a monitored stream with periodic metrics logging
   */
  private static async* createMonitoredStream(
    stream: AsyncIterable<string>,
    bufferManager: StreamingBufferManager,
    logInterval: number
  ): AsyncIterable<string> {
    let lastLogTime = Date.now();
    
    try {
      for await (const chunk of stream) {
        yield chunk;

        // Log metrics periodically
        const now = Date.now();
        if (now - lastLogTime >= logInterval) {
          const metrics = bufferManager.getMetrics();
          console.log('Streaming metrics:', {
            utilization: `${metrics.bufferUtilization.toFixed(1)}%`,
            processed: metrics.chunksProcessed,
            memory: `${Math.round(metrics.memoryUsage / 1024)}KB`,
            latency: `${metrics.averageLatency.toFixed(1)}ms`,
            backpressure: `${(metrics.backpressureLevel * 100).toFixed(1)}%`
          });
          lastLogTime = now;
        }
      }
    } finally {
      bufferManager.dispose();
    }
  }

  /**
   * Create a resilient stream wrapper that handles errors gracefully
   */
  public static createResilientStream(
    streamFactory: () => AsyncIterable<string>,
    options: {
      maxRetries?: number;
      retryDelay?: number;
      config?: StreamingBufferConfig;
    } = {}
  ): AsyncIterable<string> {
    const maxRetries = options.maxRetries ?? 3;
    const retryDelay = options.retryDelay ?? 1000;

    return this.createRetryableStream(streamFactory, maxRetries, retryDelay, options.config);
  }

  /**
   * Create a retryable stream implementation
   */
  private static async* createRetryableStream(
    streamFactory: () => AsyncIterable<string>,
    maxRetries: number,
    retryDelay: number,
    config?: StreamingBufferConfig
  ): AsyncIterable<string> {
    let retries = 0;

    while (retries <= maxRetries) {
      try {
        const stream = StreamingBufferManager.wrapStream(streamFactory(), config);
        
        for await (const chunk of stream) {
          yield chunk;
        }
        
        return; // Success, exit retry loop
        
      } catch (error) {
        retries++;
        
        if (retries > maxRetries) {
          throw new Error(`Stream failed after ${maxRetries} retries: ${error}`);
        }
        
        console.warn(`Stream error (attempt ${retries}/${maxRetries}):`, error);
        await new Promise(resolve => setTimeout(resolve, retryDelay * retries));
      }
    }
  }
}