/**
 * Console Transport with Advanced Formatting
 * 
 * Cross-platform console transport that provides rich formatting, colorization,
 * and environment-specific optimizations. Supports both browser and Node.js
 * environments with appropriate styling and performance considerations.
 * 
 * Features:
 * - Cross-platform support (browser/Node.js)
 * - Rich formatting with colors and styling
 * - Multiple format modes (pretty, compact, json)
 * - Performance monitoring and timing
 * - Level-specific console methods
 * - Grouping and indentation support
 * - Buffer management and flush control
 * 
 * @example
 * ```typescript
 * import { ConsoleTransport } from '@nuanced-labs/lever-ui-logger';
 * 
 * // Basic console transport
 * const transport = new ConsoleTransport({
 *   level: 'info',
 *   format: 'pretty',
 *   colors: true,
 *   timestamps: true
 * });
 * 
 * // Compact format for production
 * const compact = new ConsoleTransport({
 *   format: 'compact',
 *   colors: false,
 *   includeStack: false
 * });
 * 
 * // JSON format for log aggregation
 * const jsonTransport = new ConsoleTransport({
 *   format: 'json',
 *   includeMetadata: true,
 *   prettyPrint: false
 * });
 * ```
 */

import type { LogLevel, LogEventData } from '../logger/types.js';
import { 
  BaseTransport, 
  Environment, 
  Formatters, 
  Colors, 
  BrowserStyles,
  type ConsoleTransportConfig,
  type ConsoleFormatMode
} from './transport-interface.js';

/**
 * Console transport that outputs logs to the console with formatting and colors
 */
export class ConsoleTransport extends BaseTransport {
  private readonly transportConfig: Required<ConsoleTransportConfig>;
  private readonly consoleMethods: Record<LogLevel, (..._args: unknown[]) => void>;

  constructor(config: ConsoleTransportConfig = {}) {
    const mergedConfig: Required<ConsoleTransportConfig> = {
      name: 'console',
      format: 'pretty',
      colors: true,
      timestamps: true,
      timestampFormat: 'HH:mm:ss.SSS',
      enableInProduction: false,
      performanceThreshold: 0.1, // 0.1ms threshold for console output
      consoleMethods: {},
      ...config
    };

    super(mergedConfig.name, mergedConfig);
    this.transportConfig = mergedConfig;
    this.consoleMethods = this.initializeConsoleMethods();
  }

  /**
   * Write a log event to the console
   */
  write(event: LogEventData): void {
    if (!event) {
      throw new TypeError('LogEventData is required');
    }
    if (!event.message || typeof event.message !== 'string') {
      throw new TypeError('LogEventData must have a valid message');
    }
    if (!this.isEnabled()) {
      return;
    }

    this.measurePerformance(() => {
      const formatted = this.formatEvent(event);
      const consoleMethod = this.consoleMethods[event.level];
      
      if (this.transportConfig.colors && Environment.isBrowser) {
        this.writeWithBrowserStyles(formatted, consoleMethod);
      } else if (this.transportConfig.colors && Environment.supportsConsoleStyles) {
        this.writeWithAnsiColors(formatted, consoleMethod);
      } else {
        this.writeWithoutColors(formatted, consoleMethod);
      }
    }, this.transportConfig.performanceThreshold);
  }

  /**
   * Check if transport should be active in current environment
   */
  protected isEnabled(): boolean {
    // Disable in production unless explicitly enabled
    if (Environment.isProduction && !this.transportConfig.enableInProduction) {
      return false;
    }
    
    // Make sure console is available
    return typeof console !== 'undefined';
  }

  /**
   * Initialize console method mapping
   */
  private initializeConsoleMethods(): Record<LogLevel, (..._args: unknown[]) => void> {
    // Handle case where console is undefined or missing methods
    if (typeof console === 'undefined') {
      const noop = () => {}; // No-op function
      return {
        trace: noop,
        debug: noop,
        info: noop,
        warn: noop,
        error: noop
      };
    }

    const defaultMethods = {
      trace: console.trace?.bind(console) || console.log?.bind(console) || (() => {}),
      debug: console.debug?.bind(console) || console.log?.bind(console) || (() => {}),
      info: console.info?.bind(console) || console.log?.bind(console) || (() => {}),
      warn: console.warn?.bind(console) || console.log?.bind(console) || (() => {}),
      error: console.error?.bind(console) || console.log?.bind(console) || (() => {})
    };

    // Apply custom method mappings if provided
    const customMethods = this.transportConfig.consoleMethods;
    if (customMethods) {
      for (const [level, methodName] of Object.entries(customMethods)) {
        const method = (console as unknown as Record<string, (..._args: unknown[]) => void>)[methodName];
        if (typeof method === 'function') {
          defaultMethods[level as LogLevel] = method.bind(console);
        }
      }
    }

    return defaultMethods;
  }

  /**
   * Format a log event according to the configured format
   */
  private formatEvent(event: LogEventData): FormattedLogEvent {
    const timestamp = this.transportConfig.timestamps 
      ? Formatters.timestamp(event.timestamp, this.transportConfig.timestampFormat)
      : '';

    const component = event.component ? `[${event.component}]` : '';
    const level = event.level.toUpperCase().padEnd(5);

    let contextStr = '';
    let argsStr = '';

    // Format context and args based on format mode
    if (Object.keys(event.context).length > 0) {
      contextStr = this.formatData(event.context, this.transportConfig.format);
    }

    if (event.args.length > 0) {
      argsStr = event.args.map(arg => this.formatData(arg, this.transportConfig.format)).join(' ');
    }

    return {
      timestamp,
      level,
      component,
      message: event.message,
      context: contextStr,
      args: argsStr,
      raw: event
    };
  }

  /**
   * Format data based on the configured format mode
   */
  private formatData(data: unknown, format: ConsoleFormatMode): string {
    switch (format) {
      case 'json':
        return Formatters.compactObject(data);
      case 'pretty':
        if (typeof data === 'object' && data !== null) {
          return Formatters.prettyObject(data);
        }
        return String(data);
      case 'compact':
        return typeof data === 'object' && data !== null 
          ? Formatters.compactObject(data)
          : String(data);
      default:
        return String(data);
    }
  }

  /**
   * Write to console with browser CSS styles
   */
  private writeWithBrowserStyles(formatted: FormattedLogEvent, consoleMethod: (..._args: unknown[]) => void): void {
    const parts: string[] = [];
    const styles: string[] = [];

    if (formatted.timestamp) {
      parts.push(`%c${formatted.timestamp}`);
      styles.push(BrowserStyles.timestamp);
    }

    parts.push(`%c${formatted.level}`);
    styles.push(BrowserStyles[formatted.raw.level] || '');

    if (formatted.component) {
      parts.push(`%c${formatted.component}`);
      styles.push(BrowserStyles.component);
    }

    parts.push(`%c${formatted.message}`);
    styles.push(''); // Reset style for message

    const message = parts.join(' ');
    const logArgs = [message, ...styles];

    // Add context and args without styling
    if (formatted.context) {
      if (this.transportConfig.format === 'pretty') {
        logArgs.push('\nContext:', formatted.context);
      } else {
        logArgs.push('Context:', formatted.context);
      }
    }

    if (formatted.args) {
      if (this.transportConfig.format === 'pretty') {
        logArgs.push('\nArgs:', formatted.args);
      } else {
        logArgs.push('Args:', formatted.args);
      }
    }

    consoleMethod(...logArgs);
  }

  /**
   * Write to console with ANSI colors
   */
  private writeWithAnsiColors(formatted: FormattedLogEvent, consoleMethod: (..._args: unknown[]) => void): void {
    const parts: string[] = [];

    if (formatted.timestamp) {
      parts.push(`${Colors.timestamp}${formatted.timestamp}${Colors.reset}`);
    }

    const levelColor = Colors[formatted.raw.level] || '';
    parts.push(`${levelColor}${formatted.level}${Colors.reset}`);

    if (formatted.component) {
      parts.push(`${Colors.component}${formatted.component}${Colors.reset}`);
    }

    parts.push(formatted.message);

    let output = parts.join(' ');

    // Add context and args
    if (formatted.context) {
      output += this.transportConfig.format === 'pretty' 
        ? `\n${Colors.dim}Context:${Colors.reset} ${formatted.context}`
        : ` ${Colors.dim}Context:${Colors.reset} ${formatted.context}`;
    }

    if (formatted.args) {
      output += this.transportConfig.format === 'pretty'
        ? `\n${Colors.dim}Args:${Colors.reset} ${formatted.args}`
        : ` ${Colors.dim}Args:${Colors.reset} ${formatted.args}`;
    }

    consoleMethod(output);
  }

  /**
   * Write to console without colors
   */
  private writeWithoutColors(formatted: FormattedLogEvent, consoleMethod: (..._args: unknown[]) => void): void {
    const parts: string[] = [];

    if (formatted.timestamp) {
      parts.push(formatted.timestamp);
    }

    parts.push(formatted.level);

    if (formatted.component) {
      parts.push(formatted.component);
    }

    parts.push(formatted.message);

    let output = parts.join(' ');

    if (formatted.context) {
      output += this.transportConfig.format === 'pretty'
        ? `\nContext: ${formatted.context}`
        : ` Context: ${formatted.context}`;
    }

    if (formatted.args) {
      output += this.transportConfig.format === 'pretty'
        ? `\nArgs: ${formatted.args}`
        : ` Args: ${formatted.args}`;
    }

    consoleMethod(output);
  }
}

/**
 * Internal interface for formatted log events
 */
interface FormattedLogEvent {
  timestamp: string;
  level: string;
  component: string;
  message: string;
  context: string;
  args: string;
  raw: LogEventData;
}

/**
 * Create a console transport with default configuration
 */
export function createConsoleTransport(config?: ConsoleTransportConfig): ConsoleTransport {
  return new ConsoleTransport(config);
}