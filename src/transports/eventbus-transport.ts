/**
 * EventBus transport for cross-library integration
 * 
 * Publishes log events to the EventBus system to enable other parts of the
 * application to subscribe to and react to logging events. Provides filtering
 * to prevent infinite loops and error isolation to ensure transport failures
 * don't break the main logging system.
 * 
 * @example
 * ```typescript
 * import { EventBusTransport } from 'lever-ui-logger/transports';
 * 
 * // Your EventBus implementation (must have 'post' method)

 * 
 * const transport = new EventBusTransport(eventBus, {
 *   enableSelfLogging: false,
 *   filterComponents: ['eventbus-transport']
 * });
 * 
 * // Use with logger
 * const logger = createLogger({
 *   transports: [transport]
 * });
 * ```
 */

import type { LogEventData } from '../logger/types.js';
import { BaseTransport } from './transport-interface.js';
import { 
  LogEvent, 
  MetricEvent, 
  ErrorEvent, 
  LoggerCreatedEvent, 
  LoggerDestroyedEvent, 
  LoggerConfigChangedEvent 
} from '../logger/events.js';

/**
 * Configuration options for EventBus transport
 * 
 * @example
 * ```typescript
 * const config: EventBusTransportConfig = {
 *   name: 'custom-eventbus',
 *   enableSelfLogging: false,
 *   filterComponents: ['eventbus-transport', 'sensitive-component'],
 *   silentErrors: false,
 *   transformMetadata: {
 *     transportId: 'main-eventbus',
 *     version: '1.0.0'
 *   }
 * };
 * ```
 */
export interface EventBusTransportConfig {
  /** Transport name (default: 'eventbus') */
  name?: string;
  
  /** Enable logging from the transport itself (default: false to prevent loops) */
  enableSelfLogging?: boolean;
  
  /** Component names to filter out (prevents infinite loops) */
  filterComponents?: string[];
  
  /** Suppress error logging when EventBus operations fail (default: false) */
  silentErrors?: boolean;
  
  /** Additional metadata to add to all published events */
  transformMetadata?: Record<string, unknown>;
  
  /** Custom event transformer function */
  eventTransformer?: (_event: LogEventData, _metadata: EventTransformMetadata) => LogEvent | MetricEvent | ErrorEvent | null;
  
  /** Enable publishing logger lifecycle events (default: true) */
  enableLifecycleEvents?: boolean;
}

/**
 * EventBus interface for dependency injection
 * 
 * Defines the minimal EventBus interface needed by the transport.
 * This allows for testing with mock EventBus instances.
 */
export interface EventBusInterface {
  /** Post an event to all subscribers */
  post<T>(_event: T): void | Promise<void>;
  
  /** Optional: Check if EventBus is healthy/connected */
  isConnected?(): boolean;
}

/**
 * Metadata passed to event transformers
 */
export interface EventTransformMetadata {
  /** Transport name */
  transportName: string;
  
  /** Transformation timestamp */
  transformTimestamp: number;
  
  /** Additional custom metadata */
  metadata?: Record<string, unknown>;
}

/**
 * EventBus transport for cross-library integration
 * 
 * Transforms log events into EventBus events and publishes them for
 * subscription by other systems. Includes comprehensive protection
 * against infinite loops and robust error handling.
 * 
 * Features:
 * - Automatic event transformation (LogEvent, MetricEvent, ErrorEvent)
 * - Logger lifecycle event publishing (LoggerCreatedEvent, LoggerDestroyedEvent, LoggerConfigChangedEvent)
 * - Infinite loop prevention with component filtering
 * - Error isolation - transport failures don't break logging
 * - Configurable metadata enrichment
 * - Custom event transformation support
 * - Silent mode for production environments
 * 
 * @example
 * ```typescript
 * const transport = new EventBusTransport(eventBus, {
 *   filterComponents: ['eventbus-transport', 'analytics'],
 *   transformMetadata: { source: 'main-app' },
 *   silentErrors: process.env.NODE_ENV === 'production'
 * });
 * ```
 */
export class EventBusTransport extends BaseTransport {
  private readonly transportConfig: Required<Omit<EventBusTransportConfig, 'eventTransformer' | 'transformMetadata'>>;
  private readonly eventTransformer?: EventBusTransportConfig['eventTransformer'];
  private readonly transformMetadata: Record<string, unknown>;
  private readonly eventBus: EventBusInterface;

  /**
   * Create a new EventBus transport instance
   * 
   * @param eventBus - EventBus instance to publish events to
   * @param config - Transport configuration options
   * @param config.name - Transport name (default: 'eventbus')
   * @param config.enableSelfLogging - Allow transport to log about itself (default: false)
   * @param config.filterComponents - Component names to ignore (default: ['eventbus-transport'])
   * @param config.silentErrors - Suppress error logging (default: false)
   * @param config.transformMetadata - Additional metadata for events (default: {})
   * @param config.eventTransformer - Custom event transformation function (optional)
   * 
   * @example
   * ```typescript
   * const transport = new EventBusTransport(eventBus, {
   *   enableSelfLogging: false,
   *   filterComponents: ['eventbus-transport', 'debug-panel'],
   *   transformMetadata: {
   *     appVersion: '2.1.0',
   *     environment: 'production'
   *   }
   * });
   * ```
   */
  constructor(eventBus: EventBusInterface, config: EventBusTransportConfig = {}) {
    const mergedConfig = {
      name: 'eventbus',
      enableSelfLogging: false,
      filterComponents: ['eventbus-transport'],
      silentErrors: false,
      enableLifecycleEvents: true,
      ...config
    };

    super(mergedConfig.name, mergedConfig);
    this.transportConfig = mergedConfig;
    this.eventTransformer = config.eventTransformer;
    this.transformMetadata = config.transformMetadata || {};
    this.eventBus = eventBus;
  }

  /**
   * Write a log event to the EventBus
   * 
   * Transforms the log event data into appropriate EventBus event objects
   * and publishes them. Includes filtering to prevent infinite loops and
   * error handling to ensure transport failures don't break logging.
   * 
   * @param event - The log event data to publish
   * 
   * @example
   * ```typescript
   * // This will create and publish a LogEvent to EventBus
   * transport.write({
   *   level: 'info',
   *   message: 'User action completed',
   *   timestamp: Date.now(),
   *   component: 'user-service',
   *   context: { userId: '123', action: 'login' },
   *   args: []
   * });
   * ```
   */
  write(event: LogEventData): void {
    // Apply filtering to prevent infinite loops
    if (!this.shouldProcessEvent(event)) {
      return;
    }

    try {
      // Check if EventBus is available
      if (!this.isEventBusReady()) {
        if (!this.transportConfig.silentErrors) {
          console.warn('EventBus transport: EventBus not available, skipping event');
        }
        return;
      }

      // Transform and publish the event
      const busEvent = this.transformEvent(event);
      if (busEvent) {
        this.publishEvent(busEvent);
      }
    } catch (error) {
      this.handlePublishError(error, event);
    }
  }

  /**
   * Flush any pending events (no-op for EventBus transport)
   * 
   * EventBus transport publishes events immediately, so flushing
   * is not necessary. This method is provided for transport interface
   * compatibility.
   * 
   * @returns Resolved promise
   */
  async flush(): Promise<void> {
    // EventBus transport publishes immediately, no buffering
    return Promise.resolve();
  }

  /**
   * Close the transport (no-op for EventBus transport)
   * 
   * EventBus transport doesn't maintain persistent connections,
   * so closing is not necessary. This method is provided for
   * transport interface compatibility.
   * 
   * Note: Use publishLifecycleEvent('destroyed') explicitly if you
   * want to publish lifecycle events.
   * 
   * @returns Resolved promise
   */
  async close(): Promise<void> {
    // EventBus transport doesn't need cleanup
    // Lifecycle events should be published explicitly by the caller
    return Promise.resolve();
  }

  /**
   * Publish logger lifecycle events to EventBus
   * 
   * Publishes lifecycle events (created, destroyed, config-changed) to the EventBus
   * to allow other systems to track logger state changes.
   * 
   * @param eventType - Type of lifecycle event
   * @param config - Logger configuration (for created/config-changed events)
   * @param loggerName - Name of the logger (optional)
   * 
   * @example
   * ```typescript
   * // Publish logger created event
   * transport.publishLifecycleEvent('created', { level: 'info' }, 'main-logger');
   * 
   * // Publish config changed event
   * transport.publishLifecycleEvent('config-changed', { level: 'debug' });
   * 
   * // Publish destroyed event
   * transport.publishLifecycleEvent('destroyed');
   * ```
   */
  publishLifecycleEvent(
    eventType: 'created' | 'destroyed' | 'config-changed',
    config?: Record<string, unknown>,
    loggerName?: string
  ): void {
    if (!this.transportConfig.enableLifecycleEvents) {
      return;
    }

    try {
      if (!this.isEventBusReady()) {
        return;
      }

      let lifecycleEvent: LoggerCreatedEvent | LoggerDestroyedEvent | LoggerConfigChangedEvent;

      switch (eventType) {
        case 'created':
          lifecycleEvent = new LoggerCreatedEvent(
            loggerName || this.transportConfig.name,
            config || {},
            Date.now()
          );
          break;

        case 'destroyed':
          lifecycleEvent = new LoggerDestroyedEvent(
            loggerName || this.transportConfig.name,
            'Logger destroyed via transport',
            Date.now()
          );
          break;

        case 'config-changed':
          lifecycleEvent = new LoggerConfigChangedEvent(
            loggerName || this.transportConfig.name,
            {}, // oldConfig - not available in this context
            config || {},
            ['transport-initiated'], // changes
            Date.now()
          );
          break;

        default:
          return;
      }

      this.publishEvent(lifecycleEvent);
    } catch (error) {
      this.handlePublishError(error, null);
    }
  }

  /**
   * Check if an event should be processed (infinite loop prevention)
   * 
   * Filters out events from components that might cause infinite loops,
   * particularly events from the transport itself or other sensitive
   * components specified in the configuration.
   * 
   * @param event - Log event to check
   * @returns True if event should be processed
   * 
   * @internal
   */
  private shouldProcessEvent(event: LogEventData): boolean {
    // Check if self-logging is disabled and this is from the transport
    if (!this.transportConfig.enableSelfLogging && 
        event.component === this.transportConfig.name) {
      return false;
    }

    // Check component filter list
    if (this.transportConfig.filterComponents.includes(event.component)) {
      return false;
    }

    return true;
  }

  /**
   * Check if EventBus is ready to receive events
   * 
   * Performs basic health checks on the EventBus instance to ensure
   * it's safe to publish events. Handles cases where EventBus might
   * be undefined or not connected.
   * 
   * @returns True if EventBus is ready
   * 
   * @internal
   */
  private isEventBusReady(): boolean {
    if (!this.eventBus) {
      return false;
    }

    // Check if EventBus has isConnected method and use it
    if (typeof this.eventBus.isConnected === 'function') {
      return this.eventBus.isConnected();
    }

    // If no health check method, assume ready if post method exists
    return typeof this.eventBus.post === 'function';
  }

  /**
   * Transform log event data into EventBus event objects
   * 
   * Creates appropriate EventBus event instances (LogEvent, MetricEvent, ErrorEvent)
   * based on the log event data. Supports custom transformation functions
   * and adds transport metadata.
   * 
   * @param event - Log event data to transform
   * @returns Transformed EventBus event or null if transformation fails
   * 
   * @internal
   */
  private transformEvent(event: LogEventData): LogEvent | MetricEvent | ErrorEvent | null {
    const metadata: EventTransformMetadata = {
      transportName: this.transportConfig.name,
      transformTimestamp: Date.now(),
      metadata: this.transformMetadata
    };

    // Use custom transformer if provided
    if (this.eventTransformer) {
      try {
        return this.eventTransformer(event, metadata);
      } catch (error) {
        if (!this.transportConfig.silentErrors) {
          console.error('EventBus transport: Custom transformer failed', error);
        }
        // Fall back to default transformation
      }
    }

    // Default transformation based on event content
    return this.createDefaultEvent(event, metadata);
  }

  /**
   * Create default EventBus events from log data
   * 
   * Applies intelligent event type detection based on log content:
   * - Error events for error level logs or Error objects in context
   * - Metric events for logs with numeric data or specific patterns
   * - Log events for everything else
   * 
   * @param event - Log event data
   * @param metadata - Transform metadata
   * @returns Appropriate EventBus event
   * 
   * @internal
   */
  private createDefaultEvent(
    event: LogEventData, 
    metadata: EventTransformMetadata
  ): LogEvent | MetricEvent | ErrorEvent | null {
    
    // Check for error events
    if (this.isErrorEvent(event)) {
      return this.createErrorEvent(event, metadata);
    }

    // Check for metric events
    if (this.isMetricEvent(event)) {
      return this.createMetricEvent(event, metadata);
    }

    // Default to log event
    return this.createLogEvent(event, metadata);
  }

  /**
   * Detect if event should be treated as an error event
   * 
   * @param event - Log event data
   * @returns True if this should be an ErrorEvent
   * 
   * @internal
   */
  private isErrorEvent(event: LogEventData): boolean {
    // Error level logs
    if (event.level === 'error') {
      return true;
    }

    // Error objects in context or args
    const hasErrorInContext = Object.values(event.context).some(value => value instanceof Error);
    const hasErrorInArgs = event.args.some(arg => arg instanceof Error);

    return hasErrorInContext || hasErrorInArgs;
  }

  /**
   * Detect if event should be treated as a metric event
   * 
   * @param event - Log event data
   * @returns True if this should be a MetricEvent
   * 
   * @internal
   */
  private isMetricEvent(event: LogEventData): boolean {
    // Look for metric patterns in message
    const metricKeywords = ['metric:', 'measure:', 'timing:', 'count:', 'gauge:'];
    const hasMetricKeyword = metricKeywords.some(keyword => 
      event.message.toLowerCase().includes(keyword)
    );

    if (hasMetricKeyword) {
      return true;
    }

    // Look for numeric data in context (simple heuristic)
    const contextValues = Object.values(event.context);
    const hasNumericData = contextValues.some(value => 
      typeof value === 'number' && !isNaN(value)
    );

    // Consider it a metric if it has numeric data and specific patterns
    if (hasNumericData && (
      event.message.includes('time') ||
      event.message.includes('duration') ||
      event.message.includes('count') ||
      event.message.includes('size')
    )) {
      return true;
    }

    return false;
  }

  /**
   * Create ErrorEvent from log data
   * 
   * @param event - Log event data
   * @param metadata - Transform metadata
   * @returns ErrorEvent instance
   * 
   * @internal
   */
  private createErrorEvent(event: LogEventData, _metadata: EventTransformMetadata): ErrorEvent {
    // Find Error object in context or args
    let error: Error | null = null;
    
    // Check context for Error objects
    for (const value of Object.values(event.context)) {
      if (value instanceof Error) {
        error = value;
        break;
      }
    }

    // Check args for Error objects
    if (!error) {
      for (const arg of event.args) {
        if (arg instanceof Error) {
          error = arg;
          break;
        }
      }
    }

    // Create synthetic error if no Error object found
    if (!error) {
      error = new Error(event.message);
    }

    return new ErrorEvent(
      error,
      true, // Assume handled since it went through logger
      event.context,
      event.component,
      event.timestamp
    );
  }

  /**
   * Create MetricEvent from log data
   * 
   * @param event - Log event data
   * @param metadata - Transform metadata
   * @returns MetricEvent instance
   * 
   * @internal
   */
  private createMetricEvent(event: LogEventData, _metadata: EventTransformMetadata): MetricEvent {
    // Extract metric name from message
    let metricName = event.message;
    
    // Clean up metric name
    const metricKeywords = ['metric:', 'measure:', 'timing:', 'count:', 'gauge:'];
    for (const keyword of metricKeywords) {
      if (metricName.toLowerCase().includes(keyword)) {
        metricName = metricName.replace(new RegExp(keyword, 'i'), '').trim();
        break;
      }
    }

    // Use numeric values from context as fields
    const fields: Record<string, unknown> = {};
    const contextCopy = { ...event.context };

    for (const [key, value] of Object.entries(event.context)) {
      if (typeof value === 'number' && !isNaN(value)) {
        fields[key] = value;
        delete contextCopy[key]; // Move to fields
      }
    }

    return new MetricEvent(
      metricName,
      fields as Record<string, string | number | boolean>,
      contextCopy, // Non-numeric context
      event.component,
      event.timestamp
    );
  }

  /**
   * Create LogEvent from log data
   * 
   * @param event - Log event data
   * @param metadata - Transform metadata
   * @returns LogEvent instance
   * 
   * @internal
   */
  private createLogEvent(event: LogEventData, _metadata: EventTransformMetadata): LogEvent {
    return new LogEvent(
      event.level,
      event.message,
      event.context,
      event.args,
      event.component,
      this.transportConfig.name, // Use transport as logger name
      event.timestamp
    );
  }

  /**
   * Publish event to EventBus
   * 
   * Handles both synchronous and asynchronous EventBus post methods.
   * Includes error handling for publish failures.
   * 
   * @param event - EventBus event to publish
   * 
   * @internal
   */
  private publishEvent(event: LogEvent | MetricEvent | ErrorEvent | LoggerCreatedEvent | LoggerDestroyedEvent | LoggerConfigChangedEvent): void {
    try {
      const result = this.eventBus.post(event);
      
      // Handle async publish
      if (result && typeof result.then === 'function') {
        result.catch((error: Error) => {
          this.handlePublishError(error, null);
        });
      }
    } catch (error) {
      this.handlePublishError(error, null);
    }
  }

  /**
   * Handle EventBus post errors
   * 
   * Provides error logging and graceful degradation when EventBus
   * operations fail. Respects silent error configuration.
   * 
   * @param error - Error that occurred
   * @param originalEvent - Original log event (if available)
   * 
   * @internal
   */
  private handlePublishError(error: unknown, originalEvent: LogEventData | null): void {
    if (this.transportConfig.silentErrors) {
      return;
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    
    if (originalEvent) {
      console.error(
        `EventBus transport: Failed to publish event from ${originalEvent.component}: ${errorMessage}`
      );
    } else {
      console.error(`EventBus transport: Post failed: ${errorMessage}`);
    }
  }
}

/**
 * Create an EventBus transport with default configuration
 * 
 * Factory function that creates a new EventBus transport instance
 * with the provided EventBus and configuration. Provides a convenient
 * way to create transports without using the constructor directly.
 * 
 * @param eventBus - EventBus instance to publish events to
 * @param config - Transport configuration options
 * @returns New EventBus transport instance
 * 
 * @example
 * ```typescript
 * import { createEventBusTransport } from 'lever-ui-logger/transports';
 * 
 * // Your EventBus implementation
 * const eventBus = { post: (event) => console.log(event) };
 * 
 * const transport = createEventBusTransport(eventBus, {
 *   filterComponents: ['eventbus-transport', 'analytics'],
 *   transformMetadata: {
 *     appVersion: '1.0.0',
 *     environment: process.env.NODE_ENV
 *   },
 *   silentErrors: process.env.NODE_ENV === 'production'
 * });
 * 
 * // Use with logger
 * const logger = createLogger({
 *   transports: [transport]
 * });
 * ```
 */
export function createEventBusTransport(
  eventBus: EventBusInterface, 
  config?: EventBusTransportConfig
): EventBusTransport {
  return new EventBusTransport(eventBus, config);
}