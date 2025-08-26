/**
 * Lever UI Logger - Standalone Logging System
 * 
 * Zero-dependency logging library with optional EventBus integration, providing structured
 * logging, PII redaction, and comprehensive transport system. Designed for
 * modern web applications with TypeScript-first architecture and tree-shakable exports.
 * 
 * ## Core Features
 * 
 * ### Logger System
 * - **Structured Logging**: Type-safe logging with context and metadata
 * - **Multiple Transports**: Console, SendBeacon, EventBus, and custom transports
 * - **PII Redaction**: Built-in data protection and sanitization
 * - **Performance Optimized**: Sampling, buffering, and async processing
 * - **EventBus Integration**: Cross-library coordination and event publishing
 * 
 * 
 * ### Transport System
 * - **ConsoleTransport**: Rich console output with colors and formatting
 * - **SendBeaconTransport**: Reliable telemetry delivery with offline support
 * - **EventBusTransport**: Optional cross-library event coordination
 * - **Custom Transports**: Extensible transport interface for custom destinations
 * 
 * ## Quick Start
 * 
 * @example
 * ```typescript
 * import { 
 *   createLogger,
 *   ConsoleTransport, 
 *   SendBeaconTransport,
 *   EventBusTransport
 * } from 'lever-ui-logger';
 * 
 * // Standalone logger (zero dependencies)
 * const logger = createLogger({
 *   level: 'info',
 *   component: 'app',
 *   defaultContext: { version: '1.0.0' },
 *   transports: [
 *     new ConsoleTransport({ colors: true }),
 *     new SendBeaconTransport({ 
 *       endpoint: 'https://api.example.com/logs',
 *       batchSize: 50 
 *     })
 *   ],
 *   redaction: { enabled: true }
 * });
 * 
 * // Optional EventBus integration via transport
 * import { EventBus } from 'lever-ui-eventbus';
 * const eventBus = new EventBus();
 * 
 * logger.addTransport(new EventBusTransport(eventBus));
 * 
 * // Use the logger
 * logger.info('Application started', { port: 3000 });
 * logger.error('Database connection failed', { database: 'postgres' });
 * logger.metric('login_duration', { duration: 245, userId: '123' });
 * ```
 * 
 * ## Tree-Shakable Architecture
 * 
 * Import only what you need for optimal bundle size:
 * 
 * @example  
 * ```typescript
 * // Minimal logger setup
 * import { createLogger } from 'lever-ui-logger/logger';
 * import { ConsoleTransport } from 'lever-ui-logger/transports';
 * 
 * // Specific transports (all core transports)
 * import { 
 *   SendBeaconTransport,
 *   EventBusTransport 
 * } from 'lever-ui-logger/transports';
 * ```
 */

export * from './logger/index.js';
export * from './transports/index.js';

