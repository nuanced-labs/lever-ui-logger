/**
 * EventBus integration event classes following lever-ui-eventbus patterns
 * All events follow the class-based event pattern with public readonly properties
 */

import type { LogLevel, LogEventData, MetricData, ErrorData } from './types.js';

/**
 * Base class for all logging events with sync coordination metadata.
 * 
 * All logger events extend this class to provide consistent timestamp and client ID
 * tracking for cross-library coordination and lever-ui-sync integration.
 * 
 * @example
 * ```typescript
 * // Events automatically get timestamp and clientId
 * const event = new LogEvent('info', 'message', {}, [], 'component', 'logger');
 * console.log(event.timestamp); // 1640995200000
 * console.log(event.clientId); // "550e8400-e29b-41d4-a716-446655440000" or "client-abc123-def456"
 * ```
 */
export class LoggerBaseEvent {
  /**
   * Creates a new logger base event.
   * 
   * @param timestamp - Unix timestamp when event was created (defaults to Date.now())
   * @param clientId - Unique client identifier for this browser session (auto-generated)
   */
  constructor(
    public readonly timestamp: number = Date.now(),
    public readonly clientId: string = generateClientId()
  ) {}
}

/**
 * Core logging event published to EventBus for all log calls.
 * 
 * This event is posted to the EventBus whenever a log method is called (trace, debug, info, warn, error).
 * Other systems can subscribe to these events for analytics, monitoring, error tracking, etc.
 * 
 * @example
 * ```typescript
 * // Subscribe to all log events
 * eventBus.subscribe(LogEvent, (event) => {
 *   console.log(`[${event.level.toUpperCase()}] ${event.message}`, event.context);
 *   
 *   if (event.level === 'error') {
 *     sendToErrorTracking(event);
 *   }
 * });
 * 
 * // Logger automatically posts LogEvent to EventBus
 * logger.info('User logged in', { userId: '123', method: 'oauth' });
 * ```
 */
export class LogEvent extends LoggerBaseEvent {
  /**
   * Creates a new log event.
   * 
   * @param level - Log level (trace, debug, info, warn, error)
   * @param message - Primary log message
   * @param context - Structured context data object
   * @param args - Additional arguments passed to the log call
   * @param component - Component or module name that generated the log
   * @param logger - Logger instance name
   * @param timestamp - Optional custom timestamp (defaults to current time)
   * @param clientId - Optional custom client ID (defaults to generated ID)
   */
  constructor(
    public readonly level: LogLevel,
    public readonly message: string,
    public readonly context: Record<string, unknown>,
    public readonly args: readonly unknown[],
    public readonly component: string,
    public readonly logger: string,
    timestamp?: number,
    clientId?: string
  ) {
    super(timestamp, clientId);
  }

  /**
   * Converts this event to the LogEventData format used by transports.
   * 
   * @returns LogEventData object ready for transport processing
   * @example
   * ```typescript
   * const event = new LogEvent('info', 'test', {}, [], 'comp', 'logger');
   * const transportData = event.toLogEventData();
   * consoleTransport.write(transportData);
   * ```
   */
  toLogEventData(): LogEventData {
    return {
      level: this.level,
      message: this.message,
      timestamp: this.timestamp,
      context: this.context,
      args: this.args,
      component: this.component,
      logger: this.logger
    };
  }
}

/**
 * Structured metrics event for performance monitoring and analytics.
 * 
 * Use this event type for recording quantitative measurements like response times,
 * user interactions, performance metrics, and business analytics.
 * 
 * @example
 * ```typescript
 * // Subscribe to metrics for analytics
 * eventBus.subscribe(MetricEvent, (event) => {
 *   analytics.track(event.name, event.fields);
 * });
 * 
 * // Logger posts MetricEvent to EventBus
 * logger.metric('api_response_time', { 
 *   duration: 234, 
 *   endpoint: '/users',
 *   status: 200 
 * });
 * ```
 */
export class MetricEvent extends LoggerBaseEvent {
  /**
   * Creates a new metric event.
   * 
   * @param name - Metric name (e.g., 'page_load_time', 'button_click')
   * @param fields - Metric data and measurements
   * @param context - Additional context for the metric
   * @param component - Component that recorded the metric
   * @param timestamp - Optional custom timestamp
   * @param clientId - Optional custom client ID
   */
  constructor(
    public readonly name: string,
    public readonly fields: Record<string, number | string | boolean>,
    public readonly context: Record<string, unknown>,
    public readonly component: string,
    timestamp?: number,
    clientId?: string
  ) {
    super(timestamp, clientId);
  }

  /**
   * Convert to metric data format
   */
  toMetricData(): MetricData {
    return {
      name: this.name,
      fields: this.fields,
      timestamp: this.timestamp,
      context: this.context,
      component: this.component
    };
  }
}

/**
 * Error event for unhandled errors, exceptions, and error boundary catches
 */
export class ErrorEvent extends LoggerBaseEvent {
  constructor(
    public readonly error: Error,
    public readonly handled: boolean,
    public readonly context: Record<string, unknown>,
    public readonly component: string,
    timestamp?: number,
    clientId?: string
  ) {
    super(timestamp, clientId);
  }

  /**
   * Get error name (constructor name or custom name)
   */
  get name(): string {
    return this.error.name || this.error.constructor.name || 'Error';
  }

  /**
   * Get error message
   */
  get message(): string {
    return this.error.message || 'Unknown error';
  }

  /**
   * Get stack trace if available
   */
  get stack(): string | undefined {
    return this.error.stack;
  }

  /**
   * Convert to error data format
   */
  toErrorData(): ErrorData {
    return {
      name: this.name,
      message: this.message,
      stack: this.stack,
      handled: this.handled,
      timestamp: this.timestamp,
      context: this.context,
      component: this.component
    };
  }
}

/**
 * Logger lifecycle event - emitted when a logger is created
 */
export class LoggerCreatedEvent extends LoggerBaseEvent {
  constructor(
    public readonly name: string,
    public readonly config: Record<string, unknown>,
    timestamp?: number,
    clientId?: string
  ) {
    super(timestamp, clientId);
  }
}

/**
 * Logger lifecycle event - emitted when a logger is destroyed
 */
export class LoggerDestroyedEvent extends LoggerBaseEvent {
  constructor(
    public readonly name: string,
    public readonly reason?: string,
    timestamp?: number,
    clientId?: string
  ) {
    super(timestamp, clientId);
  }
}

/**
 * Transport event - emitted when transport operations occur
 */
export class TransportEvent extends LoggerBaseEvent {
  constructor(
    public readonly transportName: string,
    public readonly operation: 'write' | 'flush' | 'close' | 'error',
    public readonly details: Record<string, unknown> = {},
    timestamp?: number,
    clientId?: string
  ) {
    super(timestamp, clientId);
  }
}

/**
 * Transport error event - emitted when transport operations fail
 */
export class TransportErrorEvent extends LoggerBaseEvent {
  constructor(
    public readonly transportName: string,
    public readonly error: Error,
    public readonly operation: string,
    public readonly details: Record<string, unknown> = {},
    timestamp?: number,
    clientId?: string
  ) {
    super(timestamp, clientId);
  }
}

/**
 * PII detection warning event - emitted in development when potential PII is detected
 */
export class PIIWarningEvent extends LoggerBaseEvent {
  constructor(
    public readonly field: string,
    public readonly value: string,
    public readonly pattern: string,
    public readonly suggestion: string,
    public readonly context: Record<string, unknown>,
    timestamp?: number,
    clientId?: string
  ) {
    super(timestamp, clientId);
  }
}

/**
 * Logger configuration change event
 */
export class LoggerConfigChangedEvent extends LoggerBaseEvent {
  constructor(
    public readonly loggerName: string,
    public readonly oldConfig: Record<string, unknown>,
    public readonly newConfig: Record<string, unknown>,
    public readonly changes: string[],
    timestamp?: number,
    clientId?: string
  ) {
    super(timestamp, clientId);
  }
}

/**
 * Generate a unique client ID for this browser session
 * Uses crypto.randomUUID if available, falls back to Math.random
 */
function generateClientId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  
  // Fallback for environments without crypto.randomUUID
  return 'client-' + Math.random().toString(36).substr(2, 9) + '-' + Date.now().toString(36);
}

/**
 * Type guard to check if an event is a LogEvent
 */
export function isLogEvent(event: unknown): event is LogEvent {
  return event instanceof LogEvent;
}

/**
 * Type guard to check if an event is a MetricEvent
 */
export function isMetricEvent(event: unknown): event is MetricEvent {
  return event instanceof MetricEvent;
}

/**
 * Type guard to check if an event is an ErrorEvent
 */
export function isErrorEvent(event: unknown): event is ErrorEvent {
  return event instanceof ErrorEvent;
}

/**
 * Type guard to check if an event is any logger-related event
 */
export function isLoggerEvent(event: unknown): event is LoggerBaseEvent {
  return event instanceof LoggerBaseEvent;
}