/**
 * Lever UI Logger - Standalone logging with PII redaction
 * 
 * A zero-dependency logging system with optional EventBus integration
 * via transports. Includes built-in PII redaction capabilities.
 * 
 * @example
 * ```typescript
 * import { createLogger, ConsoleTransport } from 'lever-ui-logger';
 * 
 * // Standalone logger
 * const logger = createLogger({
 *   level: 'debug',
 *   component: 'my-service',
 *   transports: [new ConsoleTransport()]
 * });
 * 
 * logger.info('User action completed', { userId: '123', action: 'login' });
 * ```
 */

// Core logger functionality
export * from './types.js';
export * from './events.js';
export * from './logger-config.js';
export * from './logger-impl.js';

// PII redaction system
export * from './redaction.js';
export { 
  BuiltInRedactionPattern,
  BUILT_IN_PATTERNS, 
  PII_FIELD_NAMES, 
  isPIIFieldName, 
  getEnabledPatterns, 
  sortPatternsByPriority 
} from './redaction-patterns.js';

/** Current version of the logger package */
export const LOGGER_VERSION = '0.1.0';