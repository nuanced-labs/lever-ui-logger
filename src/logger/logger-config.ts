/**
 * Logger configuration types and default values
 */

import type { LogLevel, LoggerConfig, Transport } from './types.js';

/**
 * Default log level for new loggers
 */
export const DEFAULT_LOG_LEVEL: LogLevel = 'info';

/**
 * Log level hierarchy for comparison
 * Higher numbers indicate higher priority
 */
export const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4
};

/**
 * Default logger configuration
 */
export const DEFAULT_LOGGER_CONFIG: Required<Omit<LoggerConfig, 'transports'>> & { transports: Transport[] } = {
  level: DEFAULT_LOG_LEVEL,
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
    enabled: true, // Enable by default for security
    patterns: [],
    mode: 'balanced'
  },
  transports: [],
  captureUnhandledErrors: false,
  captureUnhandledRejections: false,
  captureConsoleErrors: false
};

/**
 * Merges user configuration with defaults
 * 
 * @param userConfig - User-provided configuration
 * @returns Complete configuration with defaults applied
 */
export function mergeConfig(userConfig: LoggerConfig = {}): Required<LoggerConfig> {
  return {
    ...DEFAULT_LOGGER_CONFIG,
    ...userConfig,
    defaultContext: {
      ...DEFAULT_LOGGER_CONFIG.defaultContext,
      ...userConfig.defaultContext
    },
    sampling: {
      ...DEFAULT_LOGGER_CONFIG.sampling,
      ...userConfig.sampling
    },
    redaction: {
      ...DEFAULT_LOGGER_CONFIG.redaction,
      ...userConfig.redaction,
      patterns: [
        ...(DEFAULT_LOGGER_CONFIG.redaction.patterns || []),
        ...(userConfig.redaction?.patterns || [])
      ]
    },
    transports: userConfig.transports || DEFAULT_LOGGER_CONFIG.transports
  };
}

/**
 * Checks if a log level should be processed based on current minimum level
 * 
 * @param level - Log level to check
 * @param minLevel - Minimum log level configured
 * @returns True if log should be processed
 */
export function shouldLog(level: LogLevel, minLevel: LogLevel): boolean {
  return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[minLevel];
}

/**
 * Applies sampling to determine if a log should be processed
 * 
 * @param level - Log level
 * @param samplingRates - Sampling configuration
 * @returns True if log passes sampling check
 */
export function passesSampling(
  level: LogLevel, 
  samplingRates: Partial<Record<LogLevel, number>>
): boolean {
  const rate = samplingRates[level] ?? 1.0;
  return Math.random() < rate;
}