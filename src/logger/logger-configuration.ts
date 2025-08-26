/**
 * Logger Configuration Management Component
 * 
 * Centralized configuration management for the logger system, handling
 * level management, component-specific overrides, sampling rates, and
 * configuration validation. Provides a clean API for configuration updates
 * with proper immutability and change tracking.
 * 
 * @example
 * ```typescript
 * import { LoggerConfiguration } from './logger-configuration';
 * 
 * const config = new LoggerConfiguration({
 *   level: 'debug',
 *   component: 'user-service',
 *   sampling: { debug: 0.1 }
 * });
 * 
 * // Check if a log should be processed
 * if (config.shouldProcess('debug')) {
 *   // Log the message
 * }
 * 
 * // Update configuration
 * config.setLevel('warn');
 * config.setComponentLevel('database', 'trace');
 * ```
 */

import type { LogLevel, LoggerConfig, Transport } from './types.js';

/**
 * Log level hierarchy for comparison
 */
const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4
};

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: Required<Omit<LoggerConfig, 'transports'>> & { transports: Transport[] } = {
  level: 'info',
  component: 'default',
  defaultContext: {},
  sampling: {
    trace: 1.0,
    debug: 1.0,
    info: 1.0,
    warn: 1.0,
    error: 1.0
  },
  redaction: {
    enabled: true,
    patterns: [],
    mode: 'balanced'
  },
  transports: [],
  captureUnhandledErrors: false,
  captureUnhandledRejections: false,
  captureConsoleErrors: false
};

/**
 * Configuration management for logger instances
 */
export class LoggerConfiguration {
  private config: Required<LoggerConfig>;
  private componentLevels: Map<string, LogLevel> = new Map();
  private readonly originalConfig: LoggerConfig;

  /**
   * Creates a new configuration manager
   * 
   * @param userConfig - User-provided configuration
   */
  constructor(userConfig: LoggerConfig = {}) {
    this.originalConfig = { ...userConfig };
    this.config = this.mergeConfig(userConfig);
  }

  /**
   * Get the current log level
   */
  get level(): LogLevel {
    return this.config.level;
  }

  /**
   * Get the component name
   */
  get component(): string {
    return this.config.component;
  }

  /**
   * Get the default context
   */
  get defaultContext(): Record<string, unknown> {
    return { ...this.config.defaultContext };
  }

  /**
   * Get the sampling configuration
   */
  get sampling(): Partial<Record<LogLevel, number>> {
    return { ...this.config.sampling };
  }

  /**
   * Get the redaction configuration
   */
  get redaction(): Required<LoggerConfig>['redaction'] {
    return {
      ...this.config.redaction,
      patterns: [...(this.config.redaction.patterns || [])]
    };
  }

  /**
   * Get the transports configuration
   */
  get transports(): Transport[] {
    return [...this.config.transports];
  }

  /**
   * Get capture settings
   */
  get captureSettings(): {
    unhandledErrors: boolean;
    unhandledRejections: boolean;
    consoleErrors: boolean;
  } {
    return {
      unhandledErrors: this.config.captureUnhandledErrors,
      unhandledRejections: this.config.captureUnhandledRejections,
      consoleErrors: this.config.captureConsoleErrors
    };
  }

  /**
   * Get the full configuration object (frozen copy)
   */
  get fullConfig(): Readonly<Required<LoggerConfig>> {
    return Object.freeze({ ...this.config });
  }

  /**
   * Set the minimum log level
   * 
   * @param level - New log level
   */
  setLevel(level: LogLevel): void {
    if (!(level in LOG_LEVEL_PRIORITY)) {
      throw new TypeError(`Invalid log level: ${level}`);
    }
    this.config.level = level;
  }

  /**
   * Set log level for a specific component
   * 
   * @param component - Component name
   * @param level - Log level for this component
   */
  setComponentLevel(component: string, level: LogLevel): void {
    if (!component || typeof component !== 'string') {
      throw new TypeError('Component must be a non-empty string');
    }
    if (!(level in LOG_LEVEL_PRIORITY)) {
      throw new TypeError(`Invalid log level: ${level}`);
    }
    this.componentLevels.set(component, level);
  }

  /**
   * Remove component-specific log level
   * 
   * @param component - Component name
   * @returns True if component level was removed
   */
  removeComponentLevel(component: string): boolean {
    return this.componentLevels.delete(component);
  }

  /**
   * Get effective log level for a component
   * 
   * @param component - Component name (optional)
   * @returns Effective log level
   */
  getEffectiveLevel(component?: string): LogLevel {
    if (component && this.componentLevels.has(component)) {
      return this.componentLevels.get(component)!;
    }
    return this.config.level;
  }

  /**
   * Check if a log should be processed based on level and sampling
   * 
   * @param level - Log level to check
   * @param component - Optional component name for component-specific levels
   * @returns True if log should be processed
   */
  shouldProcess(level: LogLevel, component?: string): boolean {
    // Check level filtering
    const effectiveLevel = component 
      ? this.getEffectiveLevel(component)
      : this.getEffectiveLevel(this.config.component);
    if (!this.shouldLog(level, effectiveLevel)) {
      return false;
    }

    // Check sampling
    return this.passesSampling(level);
  }

  /**
   * Update sampling rate for a specific level
   * 
   * @param level - Log level
   * @param rate - Sampling rate (0-1)
   */
  setSamplingRate(level: LogLevel, rate: number): void {
    if (rate < 0 || rate > 1) {
      throw new RangeError('Sampling rate must be between 0 and 1');
    }
    this.config.sampling[level] = rate;
  }

  /**
   * Update default context
   * 
   * @param context - New context to merge with existing
   */
  updateDefaultContext(context: Record<string, unknown>): void {
    this.config.defaultContext = {
      ...this.config.defaultContext,
      ...context
    };
  }

  /**
   * Clear all component-specific log levels
   */
  clearComponentLevels(): void {
    this.componentLevels.clear();
  }

  /**
   * Get all component-specific log levels
   */
  getComponentLevels(): Map<string, LogLevel> {
    return new Map(this.componentLevels);
  }

  /**
   * Reset configuration to original values
   */
  reset(): void {
    this.config = this.mergeConfig(this.originalConfig);
    this.componentLevels.clear();
  }

  /**
   * Clone this configuration
   * 
   * @param overrides - Optional configuration overrides
   * @returns New LoggerConfiguration instance
   */
  clone(overrides?: Partial<LoggerConfig>): LoggerConfiguration {
    // Clone current config state (not original)
    const currentConfig: LoggerConfig = {
      level: this.config.level,
      component: this.config.component,
      defaultContext: { ...this.config.defaultContext },
      sampling: { ...this.config.sampling },
      redaction: {
        ...this.config.redaction,
        patterns: [...(this.config.redaction.patterns || [])]
      },
      transports: [...this.config.transports],
      captureUnhandledErrors: this.config.captureUnhandledErrors,
      captureUnhandledRejections: this.config.captureUnhandledRejections,
      captureConsoleErrors: this.config.captureConsoleErrors
    };
    
    const newConfig = {
      ...currentConfig,
      ...overrides
    };
    const cloned = new LoggerConfiguration(newConfig);
    
    // Copy component levels
    this.componentLevels.forEach((level, component) => {
      cloned.setComponentLevel(component, level);
    });
    
    return cloned;
  }

  /**
   * Merge user configuration with defaults
   * 
   * @private
   */
  private mergeConfig(userConfig: LoggerConfig): Required<LoggerConfig> {
    return {
      ...DEFAULT_CONFIG,
      ...userConfig,
      defaultContext: {
        ...DEFAULT_CONFIG.defaultContext,
        ...userConfig.defaultContext
      },
      sampling: {
        ...DEFAULT_CONFIG.sampling,
        ...userConfig.sampling
      },
      redaction: {
        ...DEFAULT_CONFIG.redaction,
        ...userConfig.redaction,
        patterns: [
          ...(DEFAULT_CONFIG.redaction.patterns || []),
          ...(userConfig.redaction?.patterns || [])
        ]
      },
      transports: userConfig.transports || DEFAULT_CONFIG.transports
    };
  }

  /**
   * Check if a log level should be processed
   * 
   * @private
   */
  private shouldLog(level: LogLevel, minLevel: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[minLevel];
  }

  /**
   * Apply sampling to determine if log should be processed
   * 
   * @private
   */
  private passesSampling(level: LogLevel): boolean {
    const rate = this.config.sampling[level] ?? 1.0;
    return Math.random() < rate;
  }
}