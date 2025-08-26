/**
 * Transport interfaces and utilities for lever-ui-logger
 */

import type { LogLevel, LogEventData, Transport } from '../logger/types.js';

/**
 * Environment detection utilities
 */
// Safely access process without TypeScript errors
declare const process: {
  env: Record<string, string | undefined>;
  versions?: { node?: string };
  stdout?: { isTTY?: boolean };
} | undefined;

export const Environment = {
  /** Check if running in browser environment */
  isBrowser: typeof window !== 'undefined' && typeof window.document !== 'undefined',
  
  /** Check if running in Node.js environment */  
  isNode: typeof process !== 'undefined' && !!process?.versions?.node,
  
  /** Check if running in production environment */
  isProduction: typeof process !== 'undefined' && process?.env?.NODE_ENV === 'production',
  
  /** Check if console methods support styling */
  supportsConsoleStyles: typeof window !== 'undefined' || (typeof process !== 'undefined' && !!process?.stdout?.isTTY)
} as const;

/**
 * Console transport formatting modes
 */
export type ConsoleFormatMode = 'json' | 'pretty' | 'compact';

/**
 * Console transport configuration
 */
export interface ConsoleTransportConfig {
  /** Transport name (default: 'console') */
  name?: string;
  
  /** Formatting mode for output */
  format?: ConsoleFormatMode;
  
  /** Enable/disable colorized output */
  colors?: boolean;
  
  /** Enable/disable timestamps */
  timestamps?: boolean;
  
  /** Timestamp format string */
  timestampFormat?: string;
  
  /** Enable/disable in production environments */
  enableInProduction?: boolean;
  
  /** Maximum performance threshold in ms */
  performanceThreshold?: number;
  
  /** Custom log level to console method mapping */
  consoleMethods?: Partial<Record<LogLevel, string>>;
}

/**
 * Base transport class with common functionality
 */
export abstract class BaseTransport implements Transport {
  public readonly name: string;
  public readonly config: Record<string, unknown>;
  
  constructor(name: string, config: Record<string, unknown> = {}) {
    this.name = name;
    this.config = config;
  }
  
  /**
   * Write a log event to this transport
   */
  abstract write(_event: LogEventData): Promise<void> | void;
  
  /**
   * Flush any pending logs (default: no-op)
   */
  flush(): Promise<void> | void {
    // Default implementation - no buffering
  }
  
  /**
   * Close the transport and clean up resources (default: no-op)
   */
  close(): Promise<void> | void {
    // Default implementation - no cleanup needed
  }
  
  /**
   * Check if transport should be active in current environment
   */
  protected isEnabled(): boolean {
    return true; // Default: always enabled
  }
  
  /**
   * Measure performance of a function call
   */
  protected measurePerformance<T>(fn: () => T, threshold: number = 1): T {
    const start = performance.now();
    const result = fn();
    const duration = performance.now() - start;
    
    if (duration > threshold && !Environment.isProduction) {
      console.warn(`Transport "${this.name}" took ${duration.toFixed(2)}ms (threshold: ${threshold}ms)`);
    }
    
    return result;
  }
}

/**
 * Utility functions for formatting log data
 */
export const Formatters = {
  /**
   * Format timestamp with configurable format
   */
  timestamp(timestamp: number, format: string = 'HH:mm:ss.SSS'): string {
    const date = new Date(timestamp);
    
    if (format === 'iso') {
      return date.toISOString();
    }
    
    if (format === 'HH:mm:ss.SSS') {
      return date.toISOString().slice(11, 23); // HH:mm:ss.SSS from ISO string
    }
    
    if (format === 'HH:mm:ss') {
      return date.toISOString().slice(11, 19); // HH:mm:ss from ISO string
    }
    
    // Custom format support would go here
    return date.toISOString().slice(11, 23); // Default HH:mm:ss.SSS
  },
  
  /**
   * Pretty-print objects with indentation
   */
  prettyObject(obj: unknown, indent: number = 2): string {
    try {
      return JSON.stringify(obj, null, indent);
    } catch {
      // Handle circular references or non-serializable objects
      return String(obj);
    }
  },
  
  /**
   * Compact object representation
   */
  compactObject(obj: unknown): string {
    try {
      return JSON.stringify(obj);
    } catch {
      return String(obj);
    }
  },
  
  /**
   * Get log level priority for comparison
   */
  getLogLevelPriority(level: LogLevel): number {
    const priorities = {
      trace: 0,
      debug: 1, 
      info: 2,
      warn: 3,
      error: 4
    };
    return priorities[level] ?? 2;
  }
} as const;

/**
 * ANSI color codes for terminal output
 */
export const Colors = {
  // Log level colors
  trace: '\x1b[36m',    // Cyan
  debug: '\x1b[34m',    // Blue  
  info: '\x1b[32m',     // Green
  warn: '\x1b[33m',     // Yellow
  error: '\x1b[31m',    // Red
  
  // Style codes
  reset: '\x1b[0m',     // Reset
  bold: '\x1b[1m',      // Bold
  dim: '\x1b[2m',       // Dim
  
  // Component/context colors
  component: '\x1b[35m', // Magenta
  timestamp: '\x1b[90m', // Bright Black (Gray)
} as const;

/**
 * Browser console styling
 */
export const BrowserStyles = {
  trace: 'color: #00bcd4; font-weight: normal;',
  debug: 'color: #2196f3; font-weight: normal;',
  info: 'color: #4caf50; font-weight: normal;', 
  warn: 'color: #ff9800; font-weight: bold;',
  error: 'color: #f44336; font-weight: bold;',
  component: 'color: #9c27b0; font-weight: bold;',
  timestamp: 'color: #666; font-weight: normal;'
} as const;