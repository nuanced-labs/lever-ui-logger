/**
 * Core Logger Types and Interface Definitions
 * 
 * Foundational type definitions for the lever-ui-logger system, providing
 * comprehensive TypeScript interfaces for logger configuration, transport
 * systems, and event structures. Designed for seamless integration with
 * the EventBus architecture and maximum type safety.
 * 
 * Key Types:
 * - Logger interface for structured logging with context and metadata
 * - Transport interface for pluggable log output destinations
 * - LoggerConfig for comprehensive logger configuration
 * - LogEventData for structured log event representation
 * - RedactionConfig for PII protection and data sanitization
 * - Sampling configuration for performance optimization
 * 
 * @example
 * ```typescript
 * import type { Logger, LoggerConfig, Transport } from '@nuanced-labs/lever-ui-logger';
 * 
 * // Type-safe logger configuration
 * const config: LoggerConfig = {
 *   level: 'info',
 *   component: 'user-service',
 *   defaultContext: { service: 'api', version: '1.0.0' },
 *   sampling: { debug: 0.1, info: 1.0 },
 *   redaction: { enabled: true, patterns: ['password', 'token'] },
 *   transports: [consoleTransport, beaconTransport]
 * };
 * 
 * // Custom transport implementation
 * const customTransport: Transport = {
 *   name: 'custom-transport',
 *   write: (event: LogEventData) => {
 *     console.log(`${event.level}: ${event.message}`, event.context);
 *   },
 *   flush: async () => { },
 *   close: async () => { }
 * };
 * ```
 */

/**
 * Log levels supported by the logger
 */
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';

/**
 * Logger configuration options
 */
export interface LoggerConfig {
  /** Minimum log level to process */
  level?: LogLevel;
  
  /** Component/module name for contextual logging */
  component?: string;
  
  /** Custom context that will be added to all logs */
  defaultContext?: Record<string, unknown>;
  
  /** Sampling rates per log level (0-1) */
  sampling?: Partial<Record<LogLevel, number>>;
  
  /** PII redaction configuration */
  redaction?: RedactionConfig;
  
  /** Transport configuration */
  transports?: Transport[];
  
  /** Enable/disable automatic error capture */
  captureUnhandledErrors?: boolean;
  
  /** Enable/disable automatic unhandled rejection capture */
  captureUnhandledRejections?: boolean;
  
  /** Enable/disable console.error interception */
  captureConsoleErrors?: boolean;
}

/**
 * PII redaction configuration
 */
export interface RedactionConfig {
  /** Enable/disable redaction */
  enabled?: boolean;
  
  /** Redaction mode: strict, balanced, permissive, off */
  mode?: 'strict' | 'balanced' | 'permissive' | 'off';
  
  /** Custom redaction patterns to add */
  patterns?: RedactionPattern[];
  
  /** Specific patterns to enable (overrides defaults) */
  enabledPatterns?: string[];
  
  /** Specific patterns to disable */
  disabledPatterns?: string[];
  
  /** Custom redaction function */
  customRedactor?: (input: string) => string;
  
  /** Use hash-based redaction for analytics */
  hashRedaction?: boolean;
  
  /** Enable differential privacy for metrics */
  differentialPrivacy?: boolean;
  
  /** Performance warning threshold in ms */
  performanceThreshold?: number;
}

/**
 * Redaction pattern definition
 */
export interface RedactionPattern {
  /** Pattern name for debugging and configuration */
  name?: string;
  /** Regular expression pattern to match */
  pattern: RegExp;
  /** Replacement string */
  replacement: string;
  /** Description of what this pattern matches */
  description?: string;
  /** Whether this pattern is enabled by default */
  defaultEnabled?: boolean;
  /** Performance category for priority ordering */
  priority?: 'high' | 'medium' | 'low';
}

/**
 * Transport interface for log output
 */
export interface Transport {
  /** Transport name for identification */
  name: string;
  
  /** Write a log event to this transport */
  write(event: LogEventData): Promise<void> | void;
  
  /** Flush any pending logs */
  flush(): Promise<void> | void;
  
  /** Close the transport and clean up resources */
  close(): Promise<void> | void;
  
  /** Transport configuration */
  config?: Record<string, unknown>;
}

/**
 * Log event data structure passed to transports
 */
export interface LogEventData {
  /** Log level */
  level: LogLevel;
  
  /** Log message */
  message: string;
  
  /** Timestamp when log was created */
  timestamp: number;
  
  /** Additional context data */
  context: Record<string, unknown>;
  
  /** Additional arguments passed to log call */
  args: readonly unknown[];
  
  /** Component/logger name that created this log */
  component: string;
  
  /** Logger instance name */
  logger: string;
}

/**
 * Metric data structure for structured metrics logging
 */
export interface MetricData {
  /** Metric name */
  name: string;
  
  /** Metric fields/values */
  fields: Record<string, number | string | boolean>;
  
  /** Timestamp when metric was recorded */
  timestamp: number;
  
  /** Additional context */
  context: Record<string, unknown>;
  
  /** Component that recorded the metric */
  component: string;
}

/**
 * Error data structure for error logging
 */
export interface ErrorData {
  /** Error name/type */
  name: string;
  
  /** Error message */
  message: string;
  
  /** Stack trace if available */
  stack?: string;
  
  /** Whether error was handled by application */
  handled: boolean;
  
  /** Timestamp when error occurred */
  timestamp: number;
  
  /** Additional context */
  context: Record<string, unknown>;
  
  /** Component where error occurred */
  component: string;
}

/**
 * Logger interface - main logging API
 */
export interface Logger {
  /** Logger name/identifier */
  readonly name: string;
  
  /** Current log level */
  readonly level: LogLevel;
  
  /** Log trace message */
  trace(message: string, ...args: readonly unknown[]): void;
  
  /** Log debug message */
  debug(message: string, ...args: readonly unknown[]): void;
  
  /** Log info message */
  info(message: string, ...args: readonly unknown[]): void;
  
  /** Log warning message */
  warn(message: string, ...args: readonly unknown[]): void;
  
  /** Log error message */
  error(message: string, ...args: readonly unknown[]): void;
  
  /** Record a metric */
  metric(name: string, fields?: Record<string, number | string | boolean>): void;
  
  /** Create child logger with additional context */
  withContext(context: Record<string, unknown>): Logger;
  
  /** Set minimum log level */
  setLevel(level: LogLevel): void;
  
  /** Set component-specific log level */
  setComponentLevel(component: string, level: LogLevel): void;
  
  /** Explicitly redact a value */
  redact(value: unknown): string;
  
  /** Add a transport to this logger */
  addTransport(transport: Transport): void;
  
  /** Remove a transport from this logger */
  removeTransport(transportName: string): boolean;
  
  /** Flush all transports */
  flush(): Promise<void>;
  
  /** Destroy logger and clean up resources */
  destroy(): Promise<void>;
}

/**
 * Logger factory function type
 */
export type LoggerFactory = (config?: LoggerConfig) => Logger;

