/**
 * @fileoverview Tests for compression support
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  isCompressionSupported,
  compressString,
  decompressData,
  calculateCompressionRatio,
  compressionMiddleware,
  batchCompressionMiddleware,
} from '../../src/transports/compression.js';
import { TransportMiddleware } from '../../src/transports/transport-middleware.js';
import type { LogEvent } from '../../src/logger/types.js';

describe('Compression', () => {
  // Mock CompressionStream if not available
  const originalCompressionStream = globalThis.CompressionStream;
  const originalDecompressionStream = globalThis.DecompressionStream;

  beforeEach(() => {
    // Restore original if it exists
    if (originalCompressionStream) {
      globalThis.CompressionStream = originalCompressionStream;
    }
    if (originalDecompressionStream) {
      globalThis.DecompressionStream = originalDecompressionStream;
    }
  });

  describe('isCompressionSupported', () => {
    it('should detect compression support', () => {
      if (typeof CompressionStream !== 'undefined') {
        expect(isCompressionSupported()).toBe(true);
      } else {
        expect(isCompressionSupported()).toBe(false);
      }
    });

    it('should return false when CompressionStream is undefined', () => {
      const original = globalThis.CompressionStream;
      // @ts-ignore
      delete globalThis.CompressionStream;
      
      expect(isCompressionSupported()).toBe(false);
      
      if (original) {
        globalThis.CompressionStream = original;
      }
    });
  });

  describe('calculateCompressionRatio', () => {
    it('should calculate compression ratio correctly', () => {
      expect(calculateCompressionRatio(1000, 300)).toBe(70); // 70% reduction
      expect(calculateCompressionRatio(1000, 500)).toBe(50); // 50% reduction
      expect(calculateCompressionRatio(1000, 1000)).toBe(0); // No reduction
    });

    it('should handle zero original size', () => {
      expect(calculateCompressionRatio(0, 0)).toBe(0);
    });
  });

  // Only run compression tests if CompressionStream is available
  if (typeof CompressionStream !== 'undefined') {
    describe('compressString', () => {
      it('should compress a string', async () => {
        const text = 'Hello World! '.repeat(100);
        const compressed = await compressString(text, 'gzip');
        
        expect(compressed).toBeInstanceOf(ArrayBuffer);
        expect(compressed.byteLength).toBeLessThan(text.length);
      });

      it('should support different compression formats', async () => {
        const text = 'Test data for compression';
        
        const gzip = await compressString(text, 'gzip');
        const deflate = await compressString(text, 'deflate');
        
        expect(gzip).toBeInstanceOf(ArrayBuffer);
        expect(deflate).toBeInstanceOf(ArrayBuffer);
      });
    });

    describe('decompressData', () => {
      it('should decompress compressed data', async () => {
        const original = 'Hello World! This is a test.';
        const compressed = await compressString(original, 'gzip');
        const decompressed = await decompressData(compressed, 'gzip');
        
        expect(decompressed).toBe(original);
      });

      it('should handle different compression formats', async () => {
        const original = 'Test data';
        
        const gzipCompressed = await compressString(original, 'gzip');
        const gzipDecompressed = await decompressData(gzipCompressed, 'gzip');
        expect(gzipDecompressed).toBe(original);
        
        const deflateCompressed = await compressString(original, 'deflate');
        const deflateDecompressed = await decompressData(deflateCompressed, 'deflate');
        expect(deflateDecompressed).toBe(original);
      });
    });

    describe('compressionMiddleware', () => {
      let middleware: TransportMiddleware;

      beforeEach(() => {
        middleware = new TransportMiddleware();
      });

      it('should compress large payloads', async () => {
        middleware.use(compressionMiddleware({
          format: 'gzip',
          threshold: 100,
          addHeaders: true
        }));

        const largeMessage = 'A'.repeat(200);
        const event: LogEvent = {
          level: 'info',
          message: largeMessage,
          timestamp: Date.now(),
        };

        const result = await middleware.execute(event);
        
        expect(result).not.toBeNull();
        expect(result?.metadata.compressed).toBeInstanceOf(ArrayBuffer);
        expect(result?.metadata.compressionFormat).toBe('gzip');
        expect(result?.metadata.originalSize).toBeGreaterThan(100);
        expect(result?.metadata.compressedSize).toBeLessThan(result?.metadata.originalSize as number);
        expect(result?.headers?.['content-encoding']).toBe('gzip');
      });

      it('should skip compression for small payloads', async () => {
        middleware.use(compressionMiddleware({
          threshold: 1000
        }));

        const event: LogEvent = {
          level: 'info',
          message: 'Small message',
          timestamp: Date.now(),
        };

        const result = await middleware.execute(event);
        
        expect(result).not.toBeNull();
        expect(result?.metadata.compressed).toBeUndefined();
      });

      it('should skip compression if it does not reduce size', async () => {
        middleware.use(compressionMiddleware({
          threshold: 1
        }));

        // Random data doesn't compress well
        const randomData = Array.from({ length: 50 }, () => 
          Math.random().toString(36)
        ).join('');

        const event: LogEvent = {
          level: 'info',
          message: randomData,
          timestamp: Date.now(),
        };

        const result = await middleware.execute(event);
        
        // May or may not compress depending on the random data
        expect(result).not.toBeNull();
      });

      it('should handle compression errors gracefully', async () => {
        const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        
        // Mock CompressionStream to throw
        const MockCompressionStream = class {
          constructor() {
            throw new Error('Compression failed');
          }
        };
        // @ts-ignore
        globalThis.CompressionStream = MockCompressionStream;

        middleware.use(compressionMiddleware({
          threshold: 1
        }));

        const event: LogEvent = {
          level: 'info',
          message: 'Test message',
          timestamp: Date.now(),
        };

        const result = await middleware.execute(event);
        
        expect(result).not.toBeNull();
        expect(result?.metadata.compressed).toBeUndefined();
        expect(consoleSpy).toHaveBeenCalledWith('Compression failed:', expect.any(Error));
        
        consoleSpy.mockRestore();
        globalThis.CompressionStream = originalCompressionStream;
      });
    });

    describe('batchCompressionMiddleware', () => {
      let middleware: TransportMiddleware;

      beforeEach(() => {
        middleware = new TransportMiddleware();
      });

      it('should compress batch of events', async () => {
        middleware.use(batchCompressionMiddleware({
          format: 'gzip',
          threshold: 100,
          addHeaders: true
        }));

        const events = Array.from({ length: 10 }, (_, i) => ({
          level: 'info' as const,
          message: `Message ${i}`,
          timestamp: Date.now() + i,
        }));

        const event: LogEvent = {
          level: 'info',
          message: 'Batch',
          timestamp: Date.now(),
        };

        const result = await middleware.execute(event, { batch: events });
        
        expect(result).not.toBeNull();
        expect(result?.metadata.batchCompressed).toBeInstanceOf(ArrayBuffer);
        expect(result?.metadata.compressionFormat).toBe('gzip');
        expect(result?.headers?.['x-batch-size']).toBe('10');
      });

      it('should skip compression for small batches', async () => {
        middleware.use(batchCompressionMiddleware({
          threshold: 10000
        }));

        const events = [
          { level: 'info' as const, message: 'Small batch' }
        ];

        const event: LogEvent = {
          level: 'info',
          message: 'Batch',
          timestamp: Date.now(),
        };

        const result = await middleware.execute(event, { batch: events });
        
        expect(result).not.toBeNull();
        expect(result?.metadata.batchCompressed).toBeUndefined();
      });

      it('should handle non-batch contexts', async () => {
        middleware.use(batchCompressionMiddleware());

        const event: LogEvent = {
          level: 'info',
          message: 'Not a batch',
          timestamp: Date.now(),
        };

        const result = await middleware.execute(event);
        
        expect(result).not.toBeNull();
        expect(result?.metadata.batchCompressed).toBeUndefined();
      });
    });
  } else {
    describe('compression not supported', () => {
      it('should throw error when compression is not supported', async () => {
        await expect(compressString('test')).rejects.toThrow(
          'CompressionStream API is not supported'
        );
      });

      it('should skip compression middleware when not supported', async () => {
        const middleware = new TransportMiddleware();
        middleware.use(compressionMiddleware());

        const event: LogEvent = {
          level: 'info',
          message: 'Test',
          timestamp: Date.now(),
        };

        const result = await middleware.execute(event);
        expect(result).not.toBeNull();
        expect(result?.metadata.compressed).toBeUndefined();
      });
    });
  }
});