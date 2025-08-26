/**
 * @fileoverview Transport middleware system for log transformation and filtering
 * @module @nuanced-labs/lever-ui-logger/transports
 */

import type { LogLevel, LogEventData } from '../logger/types.js';

/**
 * Middleware context containing log data and metadata
 */
export interface MiddlewareContext {
  /** The log event being processed */
  event: LogEventData;
  /** Transport-specific metadata */
  metadata: Record<string, unknown>;
  /** Skip this log (don't send to transport) */
  skip?: boolean;
  /** Additional headers for the transport */
  headers?: Record<string, string>;
}

/**
 * Middleware function that processes log events
 */
export type MiddlewareFunction = (
  _context: MiddlewareContext,
  _next: () => void | Promise<void>
) => void | Promise<void>;

/**
 * Middleware configuration options
 */
export interface MiddlewareOptions {
  /** Name for debugging and error messages */
  name?: string;
  /** Only apply to specific log levels */
  levels?: LogLevel[];
  /** Skip middleware based on condition */
  condition?: (_context: MiddlewareContext) => boolean;
}

/**
 * Transport middleware for processing log events
 */
export class TransportMiddleware {
  private middlewares: Array<{
    fn: MiddlewareFunction;
    options: MiddlewareOptions;
  }> = [];

  /**
   * Add middleware to the pipeline
   */
  use(fn: MiddlewareFunction, options: MiddlewareOptions = {}): this {
    this.middlewares.push({ fn, options });
    return this;
  }

  /**
   * Execute middleware pipeline
   */
  async execute(event: LogEventData, metadata: Record<string, unknown> = {}): Promise<MiddlewareContext | null> {
    const context: MiddlewareContext = {
      event: { ...event }, // Clone to avoid mutations
      metadata: { ...metadata },
    };

    let index = 0;

    const next = async (): Promise<void> => {
      if (index >= this.middlewares.length) {
        return;
      }

      const { fn, options } = this.middlewares[index++];

      // Check if middleware should run
      if (options.levels && !options.levels.includes(event.level)) {
        return next();
      }

      if (options.condition && !options.condition(context)) {
        return next();
      }

      try {
        await fn(context, next);
      } catch (error) {
        console.error(`Middleware error${options.name ? ` in ${options.name}` : ''}:`, error);
        // Continue to next middleware even on error
        await next();
      }
    };

    await next();

    // Return null if log should be skipped
    return context.skip ? null : context;
  }

  /**
   * Clear all middleware
   */
  clear(): void {
    this.middlewares = [];
  }

  /**
   * Get middleware count
   */
  get length(): number {
    return this.middlewares.length;
  }
}

/**
 * Built-in middleware: Filter by log level
 * 
 * @param {LogLevel} minLevel - Minimum log level to allow through
 * @returns {MiddlewareFunction} Middleware that filters logs below the specified level
 */
export function filterByLevel(minLevel: LogLevel): MiddlewareFunction {
  const levelOrder: Record<LogLevel, number> = {
    trace: 0,
    debug: 1,
    info: 2,
    warn: 3,
    error: 4,
  };

  return (context, next) => {
    if (levelOrder[context.event.level] < levelOrder[minLevel]) {
      context.skip = true;
    }
    next();
  };
}

/**
 * Built-in middleware: Add timestamp if missing
 * 
 * @returns {MiddlewareFunction} Middleware that ensures all events have timestamps
 */
export function ensureTimestamp(): MiddlewareFunction {
  return (context, next) => {
    if (!context.event.timestamp) {
      context.event.timestamp = Date.now();
    }
    next();
  };
}

/**
 * Built-in middleware: Add metadata to all events
 * 
 * @param {Record<string, unknown>} metadata - Metadata to add to all events
 * @returns {MiddlewareFunction} Middleware that enriches events with additional metadata
 */
export function addMetadata(metadata: Record<string, unknown>): MiddlewareFunction {
  return (context, next) => {
    context.event.context = {
      ...context.event.context,
      ...metadata,
    };
    next();
  };
}

/**
 * Built-in middleware: Transform event data
 * 
 * @param {Function} transformer - Function to transform the event
 * @returns {MiddlewareFunction} Middleware that transforms events
 */
export function transformEvent(
  transformer: (_event: LogEventData) => LogEventData | null
): MiddlewareFunction {
  return (context, next) => {
    const transformed = transformer(context.event);
    if (transformed === null) {
      context.skip = true;
    } else {
      context.event = transformed;
    }
    next();
  };
}

/**
 * Built-in middleware: Rate limiting
 * 
 * @param {number} maxPerSecond - Maximum events allowed per second
 * @returns {MiddlewareFunction} Middleware that rate limits events
 */
export function rateLimit(maxPerSecond: number): MiddlewareFunction {
  let tokens = maxPerSecond;
  let lastRefill = Date.now();

  return (context, next) => {
    const now = Date.now();
    const elapsed = (now - lastRefill) / 1000;
    
    // Refill tokens
    tokens = Math.min(maxPerSecond, tokens + elapsed * maxPerSecond);
    lastRefill = now;

    if (tokens >= 1) {
      tokens--;
      next();
    } else {
      context.skip = true;
      next();
    }
  };
}

/**
 * Built-in middleware: Batch aggregation
 * 
 * @param {Object} options - Batch aggregation options
 * @param {number} options.maxSize - Maximum batch size before flush
 * @param {number} options.flushInterval - Time interval for automatic flush
 * @param {Function} options.onFlush - Callback when batch is flushed
 * @returns {MiddlewareFunction} Middleware that batches events
 */
export function batchAggregator(
  options: {
    maxSize?: number;
    flushInterval?: number;
    onFlush: (_events: LogEventData[]) => void | Promise<void>;
  }
): MiddlewareFunction {
  const { maxSize = 100, flushInterval = 5000, onFlush } = options;
  let batch: LogEventData[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = async () => {
    if (batch.length === 0) return;
    
    const events = [...batch];
    batch = [];
    
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }

    try {
      await onFlush(events);
    } catch (error) {
      console.error('Batch flush error:', error);
    }
  };

  const scheduleFlush = () => {
    if (!timer && batch.length > 0) {
      timer = setTimeout(flush, flushInterval);
    }
  };

  return async (context, next) => {
    batch.push(context.event);
    
    if (batch.length >= maxSize) {
      await flush();
    } else {
      scheduleFlush();
    }

    // Skip individual send since we're batching
    context.skip = true;
    next();
  };
}

/**
 * Built-in middleware: Sampling
 * 
 * @param {number} rate - Sample rate between 0 and 1 (e.g., 0.1 for 10%)
 * @returns {MiddlewareFunction} Middleware that samples events
 * @throws {Error} If rate is not between 0 and 1
 */
export function sample(rate: number): MiddlewareFunction {
  if (rate < 0 || rate > 1) {
    throw new Error('Sample rate must be between 0 and 1');
  }

  return (context, next) => {
    if (Math.random() > rate) {
      context.skip = true;
    }
    next();
  };
}

/**
 * Built-in middleware: Error enrichment
 * 
 * @returns {MiddlewareFunction} Middleware that enriches error events with stack traces and details
 */
export function enrichErrors(): MiddlewareFunction {
  return (context, next) => {
    // Check if this is an error log and has an error object in context
    if (context.event.level === 'error' && context.event.context?.error) {
      const error = context.event.context.error as Error;
      
      // Add stack trace if available
      if (error.stack && !context.event.context.stack) {
        context.event.context = {
          ...context.event.context,
          stack: error.stack,
          errorName: error.name,
          errorMessage: error.message,
        };
      }

      // Add error code if available
      if ('code' in error) {
        context.event.context = {
          ...context.event.context,
          errorCode: (error as { code?: string | number }).code,
        };
      }
    }
    next();
  };
}