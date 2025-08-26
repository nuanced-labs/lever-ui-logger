/** Core Logger Implementation - Standalone logger with transport system */

import type { Logger, LoggerConfig, LogLevel, Transport, LogEventData } from './types.js';
import { LogEvent, MetricEvent } from './events.js';
import { RedactionEngine } from './redaction.js';
import { TransportRegistry } from './transport-registry.js';
import { LoggerConfiguration } from './logger-configuration.js';
import { ContextManager } from './context-manager.js';

/** Core standalone logger implementation with transport system */
export class LoggerImpl implements Logger {
  private readonly transportRegistry: TransportRegistry;
  private readonly configuration: LoggerConfiguration;
  private readonly contextManager: ContextManager;
  private readonly redactionEngine: RedactionEngine;
  private destroyed = false;

  /** Creates a new logger instance */
  constructor(
    config: LoggerConfig = {},
    private readonly loggerName: string = 'default'
  ) {
    this.configuration = new LoggerConfiguration(config);
    this.transportRegistry = new TransportRegistry();
    this.contextManager = new ContextManager(this.configuration.defaultContext);
    this.redactionEngine = new RedactionEngine(this.configuration.redaction);

    // Add all configured transports to the registry
    this.configuration.transports.forEach(transport => {
      this.transportRegistry.add(transport);
    });

  }

  /** Logger name/identifier */
  get name(): string {
    return this.loggerName;
  }

  /** Current minimum log level */
  get level(): LogLevel {
    return this.configuration.level;
  }

  /** Logs a trace-level message */
  trace(message: string, ...args: readonly unknown[]): void {
    if (typeof message !== 'string') throw new TypeError('Message must be a string');
    this.log('trace', message, ...args);
  }

  /** Logs a debug-level message */
  debug(message: string, ...args: readonly unknown[]): void {
    if (typeof message !== 'string') throw new TypeError('Message must be a string');
    this.log('debug', message, ...args);
  }

  /** Logs an info-level message */
  info(message: string, ...args: readonly unknown[]): void {
    if (typeof message !== 'string') throw new TypeError('Message must be a string');
    this.log('info', message, ...args);
  }

  /** Logs a warning-level message */
  warn(message: string, ...args: readonly unknown[]): void {
    if (typeof message !== 'string') throw new TypeError('Message must be a string');
    this.log('warn', message, ...args);
  }

  /** Logs an error-level message */
  error(message: string, ...args: readonly unknown[]): void {
    if (typeof message !== 'string') throw new TypeError('Message must be a string');
    this.log('error', message, ...args);
  }

  /** Records a structured metric */
  metric(name: string, fields: Record<string, number | string | boolean> = {}): void {
    if (this.destroyed) return;

    // Get current context from context manager and apply redaction
    const context = this.redactionEngine.redactObject(this.contextManager.getContext());
    const redactedFields = this.redactionEngine.redactObject(fields);
    
    // Create metric data directly (optimized for performance)
    const metricData = {
      name,
      fields: redactedFields as Record<string, number | string | boolean>,
      timestamp: Date.now(),
      context: context as Record<string, unknown>,
      component: this.configuration.component
    };

    // Create LogEventData for transports directly
    const eventData: LogEventData = {
      level: 'info',
      message: `Metric: ${name}`,
      timestamp: metricData.timestamp,
      context: { ...(context as Record<string, unknown>), ...(redactedFields as Record<string, unknown>) },
      args: [metricData],
      component: this.configuration.component,
      logger: this.loggerName
    };

    // Write to transports directly
    this.transportRegistry.writeToAll(eventData);
  }

  /** Creates a child logger with additional context */
  withContext(additionalContext: Record<string, unknown>): Logger {
    // Apply redaction to additional context
    const redactedContext = this.redactionEngine.redactObject(additionalContext);
    
    // Create a child context manager with the additional context
    const childContextManager = this.contextManager.createChild(redactedContext as Record<string, unknown>);
    
    // Clone configuration with merged context from child context manager
    const newConfig = this.configuration.clone({
      defaultContext: childContextManager.getContext()
    });
    const configObj = newConfig.fullConfig;

    return new LoggerImpl(configObj, `${this.loggerName}:child`);
  }

  /** Sets the minimum log level for this logger */
  setLevel(level: LogLevel): void {
    this.configuration.setLevel(level);
  }

  /** Sets log level for a specific component */
  setComponentLevel(component: string, level: LogLevel): void {
    this.configuration.setComponentLevel(component, level);
  }

  /** Explicitly redacts a value using the configured redaction engine */
  redact(value: unknown): string {
    if (typeof value === 'string') {
      return this.redactionEngine.redactString(value);
    }
    return this.redactionEngine.redactString(JSON.stringify(value));
  }

  /** Adds a transport to this logger */
  addTransport(transport: Transport): void {
    this.transportRegistry.add(transport);
  }

  /** Removes a transport from this logger */
  removeTransport(transportName: string): boolean {
    return this.transportRegistry.remove(transportName);
  }

  /** Flushes all transports */
  async flush(): Promise<void> {
    await this.transportRegistry.flushAll();
  }

  /** Destroys the logger and cleans up resources */
  async destroy(): Promise<void> {
    if (this.destroyed) return;

    this.destroyed = true;

    await this.transportRegistry.flushAll();
    await this.transportRegistry.closeAll();
  }

  /** Core logging method that handles all log levels */
  private log(level: LogLevel, message: string, ...args: readonly unknown[]): void {
    if (this.destroyed) return;

    // Check if this log level should be processed
    if (!this.configuration.shouldProcess(level, this.configuration.component)) {
      return;
    }

    // Get current context from context manager
    const baseContext = this.contextManager.getContext();
    
    // Merge any object arguments into the context
    const mergedContext = { ...baseContext };
    args.forEach(arg => {
      if (arg && typeof arg === 'object' && arg.constructor === Object) {
        Object.assign(mergedContext, arg);
      }
    });
    
    // Apply redaction to merged context
    const context = this.redactionEngine.redactObject(mergedContext);
    
    // Apply redaction to message and arguments
    const redactedMessage = this.redactionEngine.redactString(message);
    const redactedArgs = this.redactionEngine.redactArgs(args);

    // Create LogEventData directly (optimized for performance)
    const eventData: LogEventData = {
      level,
      message: redactedMessage,
      timestamp: Date.now(),
      context: context as Record<string, unknown>,
      args: redactedArgs,
      component: this.configuration.component,
      logger: this.loggerName
    };

    // Write to transports (they work directly with LogEventData)
    this.transportRegistry.writeToAll(eventData);
  }

}

/** Creates a new standalone logger instance */
export function createLogger(config?: LoggerConfig): Logger {
  return new LoggerImpl(config);
}