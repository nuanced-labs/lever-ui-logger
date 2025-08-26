/**
 * Core Transport System for Lever UI Logger
 * 
 * Minimal, focused transport implementations for directing log output to 
 * essential destinations. Advanced features like WebSocket streaming, IndexedDB
 * persistence, and worker processing are handled by external services that
 * integrate via EventBus subscription.
 * 
 * Core Transports:
 * - ConsoleTransport: Browser console and Node.js stdout/stderr
 * - EventBusTransport: Integration point for external services
 * - SendBeaconTransport: Browser sendBeacon API for reliable delivery
 * 
 * Features:
 * - Middleware pipeline for data processing
 * - Compression support (gzip, deflate, brotli)
 * - Level filtering and sampling
 * - Rate limiting and batching
 * - Metadata enrichment
 * - Tree-shakable exports for optimal bundle size
 * 
 * @example
 * ```typescript
 * import { 
 *   ConsoleTransport, 
 *   EventBusTransport,
 *   SendBeaconTransport, 
 *   TransportMiddleware,
 *   filterByLevel,
 *   compressionMiddleware
 * } from '@nuanced-labs/lever-ui-logger';
 * 
 * // Basic console transport
 * const console = new ConsoleTransport({
 *   level: 'info',
 *   format: 'pretty'
 * });
 * 
 * // EventBus integration for external services
 * const eventBus = new EventBusTransport({
 *   eventBus: myEventBus,
 *   topic: 'logs'
 * });
 * 
 * // Network transport with compression
 * const beacon = new SendBeaconTransport({
 *   endpoint: 'https://logs.example.com/collect',
 *   middleware: [
 *     filterByLevel('warn'),
 *     compressionMiddleware({ format: 'gzip' })
 *   ]
 * });
 * ```
 */

// Core transport interfaces and utilities
export * from './transport-interface.js';

// Console transport implementation
export * from './console-transport.js';

// SendBeacon transport implementation  
export * from './sendbeacon-transport.js';

// EventBus transport implementation
export * from './eventbus-transport.js';

// Error sanitization utilities
export * from './error-sanitizer.js';

// Secure token handling utilities
export * from './secure-token-handler.js';

// Transport middleware system (export key functions for better tree-shaking)
export { 
  TransportMiddleware,
  filterByLevel,
  transformEvent,
  rateLimit,
  sample,
  addMetadata,
  enrichErrors
} from './transport-middleware.js';
export type { MiddlewareContext, MiddlewareFunction } from './transport-middleware.js';

// Compression support (export individual functions for better tree-shaking)
export { 
  isCompressionSupported, 
  compressString, 
  compressionMiddleware,
  batchCompressionMiddleware
} from './compression.js';
export type { CompressionOptions, CompressionFormat } from './compression.js';

/** Current version of the transports module */
export const TRANSPORTS_VERSION = '0.4.0';