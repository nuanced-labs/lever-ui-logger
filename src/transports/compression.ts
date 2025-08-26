/**
 * @fileoverview Compression support for transports using native browser APIs
 * @module @nuanced-labs/lever-ui-logger/transports
 */

import type { MiddlewareFunction, MiddlewareContext } from './transport-middleware.js';

/**
 * Compression format types
 */
export type CompressionFormat = 'gzip' | 'deflate' | 'deflate-raw';

/**
 * Compression options
 */
export interface CompressionOptions {
  /** Compression format to use */
  format?: CompressionFormat;
  /** Minimum size in bytes before compression is applied */
  threshold?: number;
  /** Add content-encoding header */
  addHeaders?: boolean;
}

/**
 * Check if CompressionStream API is available
 */
export function isCompressionSupported(): boolean {
  return typeof globalThis.CompressionStream !== 'undefined';
}

/**
 * Compress a string using native CompressionStream API
 * 
 * @param {string} text - The text to compress
 * @param {CompressionFormat} format - The compression format to use (default: 'gzip')
 * @returns {Promise<ArrayBuffer>} The compressed data as an ArrayBuffer
 * @throws {Error} If CompressionStream API is not supported
 */
export async function compressString(
  text: string,
  format: CompressionFormat = 'gzip'
): Promise<ArrayBuffer> {
  if (!isCompressionSupported()) {
    throw new Error('CompressionStream API is not supported in this environment');
  }

  const encoder = new TextEncoder();
  const data = encoder.encode(text);

  // Create compression stream
  const compressionStream = new CompressionStream(format);
  
  // Create a readable stream from the data
  const readable = new ReadableStream({
    start(controller) {
      controller.enqueue(data);
      controller.close();
    }
  });

  // Pipe through compression
  const compressedStream = readable.pipeThrough(compressionStream);
  
  // Read the compressed data
  const chunks: Uint8Array[] = [];
  const reader = compressedStream.getReader();
  
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  // Combine chunks into single ArrayBuffer
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result.buffer;
}

/**
 * Calculate compression ratio
 * 
 * @param {number} originalSize - The original size in bytes
 * @param {number} compressedSize - The compressed size in bytes
 * @returns {number} The compression ratio as a percentage (0-100)
 */
export function calculateCompressionRatio(originalSize: number, compressedSize: number): number {
  if (originalSize === 0) return 0;
  return ((originalSize - compressedSize) / originalSize) * 100;
}

/**
 * Compression middleware for transports
 * 
 * @param {CompressionOptions} options - Compression configuration options
 * @returns {MiddlewareFunction} Middleware function that compresses log data
 * 
 * @example
 * ```typescript
 * const middleware = new TransportMiddleware();
 * middleware.use(compressionMiddleware({
 *   format: 'gzip',
 *   threshold: 1024,
 *   addHeaders: true
 * }));
 * ```
 */
export function compressionMiddleware(options: CompressionOptions = {}): MiddlewareFunction {
  const {
    format = 'gzip',
    threshold = 1024, // 1KB default threshold
    addHeaders = true
  } = options;

  // Check support once
  const supported = isCompressionSupported();

  return async (context: MiddlewareContext, next: () => void | Promise<void>) => {
    // Skip if not supported
    if (!supported) {
      await next();
      return;
    }

    // Serialize event to JSON
    const jsonString = JSON.stringify(context.event);
    const originalSize = new TextEncoder().encode(jsonString).length;

    // Skip compression for small payloads
    if (originalSize < threshold) {
      await next();
      return;
    }

    try {
      // Compress the data
      const compressed = await compressString(jsonString, format);
      const compressedSize = compressed.byteLength;

      // Only use compression if it actually reduces size
      if (compressedSize < originalSize) {
        // Store compressed data in metadata
        context.metadata.compressed = compressed;
        context.metadata.compressionFormat = format;
        context.metadata.originalSize = originalSize;
        context.metadata.compressedSize = compressedSize;
        context.metadata.compressionRatio = calculateCompressionRatio(originalSize, compressedSize);

        // Add headers if requested
        if (addHeaders) {
          context.headers = context.headers || {};
          context.headers['content-encoding'] = format;
          context.headers['x-original-size'] = originalSize.toString();
        }
      }
    } catch (error) {
      // Compression failed, continue without compression
      console.warn('Compression failed:', error);
    }

    await next();
  };
}

/**
 * Decompress data using native DecompressionStream API
 * Useful for testing and debugging
 */
export async function decompressData(
  data: ArrayBuffer,
  format: CompressionFormat = 'gzip'
): Promise<string> {
  if (!isCompressionSupported()) {
    throw new Error('DecompressionStream API is not supported in this environment');
  }

  // Create decompression stream
  const decompressionStream = new DecompressionStream(format);
  
  // Create a readable stream from the compressed data
  const readable = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(data));
      controller.close();
    }
  });

  // Pipe through decompression
  const decompressedStream = readable.pipeThrough(decompressionStream);
  
  // Read the decompressed data
  const chunks: Uint8Array[] = [];
  const reader = decompressedStream.getReader();
  
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  // Combine chunks and decode to string
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  const decoder = new TextDecoder();
  return decoder.decode(result);
}

/**
 * Batch compression middleware
 * Compresses entire batches of events together for better compression ratios
 */
export function batchCompressionMiddleware(options: CompressionOptions = {}): MiddlewareFunction {
  const {
    format = 'gzip',
    threshold = 5120, // 5KB default for batches
    addHeaders = true
  } = options;

  const supported = isCompressionSupported();

  return async (context: MiddlewareContext, next: () => void | Promise<void>) => {
    if (!supported) {
      await next();
      return;
    }

    // Check if this is a batch context
    const events = context.metadata.batch as unknown[];
    if (!Array.isArray(events) || events.length === 0) {
      await next();
      return;
    }

    // Serialize batch to JSON
    const jsonString = JSON.stringify(events);
    const originalSize = new TextEncoder().encode(jsonString).length;

    // Skip compression for small batches
    if (originalSize < threshold) {
      await next();
      return;
    }

    try {
      // Compress the batch
      const compressed = await compressString(jsonString, format);
      const compressedSize = compressed.byteLength;

      // Use compression if beneficial
      if (compressedSize < originalSize) {
        context.metadata.batchCompressed = compressed;
        context.metadata.compressionFormat = format;
        context.metadata.originalSize = originalSize;
        context.metadata.compressedSize = compressedSize;
        context.metadata.compressionRatio = calculateCompressionRatio(originalSize, compressedSize);

        if (addHeaders) {
          context.headers = context.headers || {};
          context.headers['content-encoding'] = format;
          context.headers['x-original-size'] = originalSize.toString();
          context.headers['x-batch-size'] = events.length.toString();
        }
      }
    } catch (error) {
      console.warn('Batch compression failed:', error);
    }

    await next();
  };
}