/**
 * Comprehensive PII Redaction System
 * 
 * Advanced data protection system that automatically detects and redacts personally
 * identifiable information (PII) from log messages, structured data, and function
 * arguments. Uses pattern matching, field name detection, and customizable rules.
 * 
 * Features:
 * - Built-in patterns for emails, phones, SSN, credit cards, API keys
 * - Field name detection (password, email, token, etc.)
 * - Configurable redaction modes (balanced, strict, permissive)
 * - Custom redaction patterns and functions
 * - Hash-based redaction for analytics preservation
 * - Performance monitoring and statistics
 * - Support for nested objects and arrays
 * 
 * @example
 * ```typescript
 * import { RedactionEngine, redactString, redactObject } from '@nuanced-labs/lever-ui-logger';
 * 
 * // Global redaction functions
 * const safe = redactString('Contact user@example.com for help');
 * // Result: "Contact <email> for help"
 * 
 * const safeData = redactObject({
 *   username: 'john_doe',
 *   password: 'secret123',
 *   email: 'john@example.com',
 *   age: 30
 * });
 * // Result: { username: '<redacted>', password: '<redacted>', email: '<redacted>', age: 30 }
 * 
 * // Custom redaction engine
 * const engine = new RedactionEngine({
 *   enabled: true,
 *   mode: 'strict',
 *   hashRedaction: false,
 *   customPatterns: [{
 *     name: 'internal-id',
 *     pattern: /ID-\d{6}/g,
 *     replacement: '<internal-id>',
 *     priority: 100
 *   }]
 * });
 * 
 * const result = engine.redactString('User ID-123456 logged in');
 * // Result: "User <internal-id> logged in"
 * ```
 */

import { 
  BuiltInRedactionPattern, 
  BUILT_IN_PATTERNS, 
  getEnabledPatterns, 
  sortPatternsByPriority, 
  isPIIFieldName 
} from './redaction-patterns.js';
import type { RedactionConfig } from './types.js';

/**
 * Redaction modes with different levels of protection
 */
export type RedactionMode = 'strict' | 'balanced' | 'permissive' | 'off';

/**
 * Performance statistics for redaction operations
 */
export interface RedactionStats {
  /** Total redaction operations performed */
  totalOperations: number;
  /** Total time spent on redaction (ms) */
  totalTimeMs: number;
  /** Average time per operation (ms) */
  averageTimeMs: number;
  /** Redactions performed by pattern name */
  patternHits: Record<string, number>;
  /** Field redactions by field name */
  fieldHits: Record<string, number>;
}

/**
 * Core redaction engine with pattern matching and field detection.
 * 
 * Provides comprehensive PII redaction capabilities including:
 * - Pattern-based string redaction (emails, phones, API keys, etc.)
 * - Field name detection for sensitive data
 * - Configurable redaction modes
 * - Performance monitoring and statistics
 * - Hash-based redaction for analytics
 * - Differential privacy support
 * 
 * @example
 * ```typescript
 * const engine = new RedactionEngine({
 *   mode: 'balanced',
 *   enabled: true,
 *   disabledPatterns: ['ipv4'] // Keep IP addresses for debugging
 * });
 * 
 * // Redact strings
 * const safe = engine.redactString('Contact user@example.com for help');
 * // Result: 'Contact <email> for help'
 * 
 * // Redact objects
 * const safeObj = engine.redactObject({
 *   username: 'john_doe',
 *   password: 'secret123',
 *   email: 'john@example.com'
 * });
 * // Result: { username: '<redacted>', password: '<redacted>', email: '<redacted>' }
 * ```
 */
export class RedactionEngine {
  private readonly patterns: BuiltInRedactionPattern[];
  private readonly config: Required<Omit<RedactionConfig, 'customRedactor' | 'enabledPatterns' | 'disabledPatterns'>> & { 
    customRedactor?: (_input: string) => string;
    enabledPatterns?: string[];
    disabledPatterns?: string[];
  };
  private readonly stats: RedactionStats;
  private performanceWarningThreshold: number = 1; // 1ms threshold

  constructor(config: RedactionConfig = {}) {
    this.config = this.mergeConfig(config);
    this.patterns = this.initializePatterns();
    this.stats = this.initializeStats();
  }

  /**
   * Redacts PII from a string value using configured patterns and custom redactor.
   * 
   * @param value - The string to redact PII from
   * @returns The string with PII replaced by redaction tokens
   * 
   * @example
   * ```typescript
   * const engine = new RedactionEngine();
   * engine.redactString('Contact user@example.com for help');
   * // Returns: 'Contact <email> for help'
   * 
   * engine.redactString('Call us at (555) 123-4567');  
   * // Returns: 'Call us at <phone>'
   * ```
   */
  redactString(value: string): string {
    if (!value || this.config.mode === 'off' || typeof value !== 'string') {
      return value;
    }

    const startTime = performance.now();
    let result = value;

    // Apply pattern-based redaction
    for (const pattern of this.patterns) {
      const matches = result.match(pattern.pattern);
      if (matches) {
        result = result.replace(pattern.pattern, pattern.replacement);
        this.stats.patternHits[pattern.name] = (this.stats.patternHits[pattern.name] || 0) + matches.length;
      }
    }

    // Apply custom redaction function if provided
    if (this.config.customRedactor) {
      result = this.config.customRedactor(result);
    }

    this.updateStats(startTime);
    return result;
  }

  /**
   * Redacts PII from an object, handling nested structures and circular references.
   * 
   * @param obj - The object to redact PII from
   * @param visited - Internal WeakSet for tracking circular references
   * @returns The object with PII fields and string values redacted
   * 
   * @example
   * ```typescript
   * const engine = new RedactionEngine();
   * const user = {
   *   name: 'John Doe',
   *   email: 'john@example.com',
   *   password: 'secret123',
   *   profile: {
   *     phone: '555-1234',
   *     bio: 'Contact me at john@example.com'
   *   }
   * };
   * 
   * engine.redactObject(user);
   * // Returns: {
   * //   name: 'John Doe',
   * //   email: '<redacted>',     // Field name detected
   * //   password: '<redacted>',  // Field name detected  
   * //   profile: {
   * //     phone: '<redacted>',   // Field name detected
   * //     bio: 'Contact me at <email>'  // Pattern matched
   * //   }
   * // }
   * ```
   */
  redactObject(obj: unknown, visited: WeakSet<object> = new WeakSet()): unknown {
    if (this.config.mode === 'off' || obj === null || obj === undefined) {
      return obj;
    }

    // Primitive types
    if (typeof obj === 'string') {
      return this.redactString(obj);
    }

    if (typeof obj !== 'object') {
      return obj;
    }

    // Handle circular references
    if (visited.has(obj)) {
      return '<circular>';
    }
    visited.add(obj);

    // Arrays
    if (Array.isArray(obj)) {
      const result = obj.map(item => this.redactObject(item, visited));
      visited.delete(obj);
      return result;
    }

    // Objects
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      // Check if field name indicates PII
      if (isPIIFieldName(key)) {
        result[key] = this.config.hashRedaction ? this.hashValue(value) : '<redacted>';
        this.stats.fieldHits[key] = (this.stats.fieldHits[key] || 0) + 1;
      } else {
        // For non-PII field names, apply string redaction to string values
        if (typeof value === 'string') {
          result[key] = this.redactString(value);
        } else {
          // Recursively redact nested objects
          result[key] = this.redactObject(value, visited);
        }
      }
    }

    visited.delete(obj);
    return result;
  }

  /**
   * Redacts PII from log arguments array, processing each argument as an object.
   * 
   * @param args - Array of log arguments to redact
   * @returns Array with PII redacted from each argument
   * 
   * @example
   * ```typescript
   * const engine = new RedactionEngine();
   * const logArgs = [
   *   'User logged in',
   *   { email: 'user@example.com', token: 'abc123' },
   *   'Session started at user@example.com'
   * ];
   * 
   * engine.redactArgs(logArgs);
   * // Returns: [
   * //   'User logged in', 
   * //   { email: '<redacted>', token: '<redacted>' },
   * //   'Session started at <email>'
   * // ]
   * ```
   */
  redactArgs(args: readonly unknown[]): readonly unknown[] {
    if (this.config.mode === 'off' || !args || args.length === 0) {
      return args;
    }

    return args.map(arg => this.redactObject(arg, new WeakSet()));
  }

  /**
   * Adds Laplace noise to numeric values for differential privacy protection.
   * 
   * @param value - The numeric value to add noise to
   * @param epsilon - Privacy budget parameter (default: 1.0, lower = more privacy)
   * @returns The value with differential privacy noise added
   * 
   * @example
   * ```typescript
   * const engine = new RedactionEngine({ differentialPrivacy: true });
   * 
   * // Add noise with default epsilon (1.0)
   * const noisyValue = engine.addDifferentialPrivacyNoise(100);
   * // Returns: ~99.83 (varies each call)
   * 
   * // More privacy (more noise) with lower epsilon
   * const privateValue = engine.addDifferentialPrivacyNoise(100, 0.1);  
   * // Returns: ~107.42 (varies each call, larger deviation)
   * ```
   */
  addDifferentialPrivacyNoise(value: number, epsilon: number = 1.0): number {
    if (this.config.mode === 'off' || !this.config.differentialPrivacy) {
      return value;
    }

    // Laplace mechanism for differential privacy
    const sensitivity = 1; // Adjust based on your use case
    const scale = sensitivity / epsilon;
    
    // Generate Laplace noise
    const u = Math.random() - 0.5;
    const noise = scale * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
    
    return value + noise;
  }

  /**
   * Gets current redaction statistics including operation counts and performance metrics.
   * 
   * @returns Copy of current redaction statistics
   * 
   * @example
   * ```typescript
   * const engine = new RedactionEngine();
   * engine.redactString('Contact user@example.com');
   * engine.redactString('Call (555) 123-4567');
   * 
   * const stats = engine.getStats();
   * // Returns: {
   * //   totalOperations: 2,
   * //   totalTimeMs: 0.43,
   * //   averageTimeMs: 0.215,
   * //   patternHits: { email: 1, 'phone-us': 1 },
   * //   fieldHits: {}
   * // }
   * ```
   */
  getStats(): RedactionStats {
    return { ...this.stats };
  }

  /**
   * Resets redaction statistics to initial values.
   * 
   * @example
   * ```typescript
   * const engine = new RedactionEngine();
   * engine.redactString('user@example.com'); // Creates stats
   * 
   * console.log(engine.getStats().totalOperations); // 1
   * engine.resetStats();
   * console.log(engine.getStats().totalOperations); // 0
   * ```
   */
  resetStats(): void {
    this.stats.totalOperations = 0;
    this.stats.totalTimeMs = 0;
    this.stats.averageTimeMs = 0;
    this.stats.patternHits = {};
    this.stats.fieldHits = {};
  }

  /**
   * Validates potential PII in development mode, checking against all patterns.
   * 
   * @param value - String to validate for potential PII
   * @param context - Optional context description for warnings
   * @returns Array of warning messages for detected PII patterns
   * 
   * @example
   * ```typescript
   * const engine = new RedactionEngine();
   * const warnings = engine.validateForPII(
   *   'Contact user@example.com or call 555-1234',
   *   'user input'
   * );
   * 
   * // Returns: [
   * //   'Potential Email addresses detected in user input: email',
   * //   'Potential US phone numbers detected in user input: phone-us'
   * // ]
   * ```
   */
  validateForPII(value: string, context?: string): string[] {
    if (this.config.mode === 'off' || typeof value !== 'string') {
      return [];
    }

    const warnings: string[] = [];

    // Check against all patterns (even disabled ones in dev)
    for (const pattern of BUILT_IN_PATTERNS) {
      const matches = value.match(pattern.pattern);
      if (matches) {
        const contextStr = context ? ` in ${context}` : '';
        warnings.push(`Potential ${pattern.description} detected${contextStr}: ${pattern.name}`);
      }
    }

    return warnings;
  }

  /**
   * Merges user configuration with defaults
   */
  private mergeConfig(userConfig: RedactionConfig = {}): Required<Omit<RedactionConfig, 'customRedactor' | 'enabledPatterns' | 'disabledPatterns'>> & { 
    customRedactor?: (_input: string) => string;
    enabledPatterns?: string[];
    disabledPatterns?: string[];
  } {
    return {
      enabled: userConfig.enabled ?? true,
      mode: userConfig.mode ?? 'balanced',
      patterns: userConfig.patterns ?? [],
      enabledPatterns: userConfig.enabledPatterns,
      disabledPatterns: userConfig.disabledPatterns,
      customRedactor: userConfig.customRedactor,
      hashRedaction: userConfig.hashRedaction ?? false,
      differentialPrivacy: userConfig.differentialPrivacy ?? false,
      performanceThreshold: userConfig.performanceThreshold ?? 1.0
    };
  }

  /**
   * Initializes redaction patterns based on configuration
   */
  private initializePatterns(): BuiltInRedactionPattern[] {
    if (!this.config.enabled || this.config.mode === 'off') {
      return [];
    }

    // Get built-in patterns
    let patterns = getEnabledPatterns(
      this.config.enabledPatterns,
      this.config.disabledPatterns
    );

    // Apply mode-specific filtering
    patterns = this.filterPatternsByMode(patterns);

    // Add custom patterns (convert to built-in format)
    if (this.config.patterns && this.config.patterns.length > 0) {
      const customPatterns = this.config.patterns.map((pattern, index) => ({
        name: pattern.name || `custom-${index}`,
        pattern: pattern.pattern,
        replacement: pattern.replacement,
        description: pattern.description || 'Custom pattern',
        defaultEnabled: pattern.defaultEnabled ?? true,
        priority: pattern.priority || 'medium' as const
      }));
      patterns.push(...customPatterns);
    }

    // Sort by priority for performance
    return sortPatternsByPriority(patterns);
  }

  /**
   * Filters patterns based on redaction mode
   */
  private filterPatternsByMode(patterns: BuiltInRedactionPattern[]): BuiltInRedactionPattern[] {
    switch (this.config.mode) {
      case 'strict':
        // Enable all patterns including low priority ones
        return patterns;
        
      case 'balanced':
        // Default behavior - exclude low priority patterns that might be noisy
        return patterns.filter(p => p.priority !== 'low' || p.name === 'api-key');
        
      case 'permissive':
        // Only high priority patterns
        return patterns.filter(p => p.priority === 'high');
        
      case 'off':
        return [];
        
      default:
        return patterns;
    }
  }

  /**
   * Hash-based redaction for analytics preservation
   */
  private hashValue(value: unknown): string {
    if (value === null || value === undefined) {
      return '<redacted>';
    }

    const str = String(value);
    if (str.length === 0) {
      return '<redacted>';
    }

    // Simple hash function for deterministic redaction
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }

    const hashStr = Math.abs(hash).toString(16).padStart(8, '0');
    return `<hash:${hashStr}>`;
  }

  /**
   * Updates performance statistics
   */
  private updateStats(startTime: number): void {
    const duration = performance.now() - startTime;
    
    this.stats.totalOperations++;
    this.stats.totalTimeMs += duration;
    this.stats.averageTimeMs = this.stats.totalTimeMs / this.stats.totalOperations;

    // Performance warning
    if (duration > this.performanceWarningThreshold) {
      if (typeof console !== 'undefined') {
        console.warn(`Lever UI Logger: Redaction operation took ${duration.toFixed(2)}ms, consider optimizing patterns`);
      }
    }
  }

  /**
   * Initializes statistics tracking
   */
  private initializeStats(): RedactionStats {
    return {
      totalOperations: 0,
      totalTimeMs: 0,
      averageTimeMs: 0,
      patternHits: {},
      fieldHits: {}
    };
  }
}

/**
 * Global redaction engine instance for shared use
 */
let globalEngine: RedactionEngine | null = null;

/**
 * Gets or creates the global redaction engine instance.
 * 
 * @param config - Optional configuration to create new engine with
 * @returns Global redaction engine instance
 * 
 * @example
 * ```typescript
 * // Get default engine
 * const engine = getRedactionEngine();
 * 
 * // Create new engine with custom config  
 * const strictEngine = getRedactionEngine({ mode: 'strict' });
 * ```
 */
export function getRedactionEngine(config?: RedactionConfig): RedactionEngine {
  if (!globalEngine || config) {
    globalEngine = new RedactionEngine(config);
  }
  return globalEngine;
}

/**
 * Convenience function for redacting strings using the global engine.
 * 
 * @param value - String to redact PII from
 * @param config - Optional configuration for custom redaction behavior
 * @returns String with PII redacted
 * 
 * @example
 * ```typescript
 * import { redactString } from '@nuanced-labs/lever-ui-logger';
 * 
 * const safe = redactString('Contact user@example.com for help');
 * // Returns: 'Contact <email> for help'
 * 
 * const strictSafe = redactString('Call 555-1234', { mode: 'strict' });
 * // Returns: 'Call <phone>'
 * ```
 */
export function redactString(value: string, config?: RedactionConfig): string {
  return getRedactionEngine(config).redactString(value);
}

/**
 * Convenience function for redacting objects using the global engine.
 * 
 * @param obj - Object to redact PII from
 * @param config - Optional configuration for custom redaction behavior
 * @returns Object with PII redacted
 * 
 * @example
 * ```typescript
 * import { redactObject } from '@nuanced-labs/lever-ui-logger';
 * 
 * const user = { email: 'user@example.com', password: 'secret' };
 * const safe = redactObject(user);
 * // Returns: { email: '<redacted>', password: '<redacted>' }
 * 
 * const hashRedacted = redactObject(user, { hashRedaction: true });
 * // Returns: { email: '<hash:a1b2c3d4>', password: '<hash:e5f6g7h8>' }
 * ```
 */
export function redactObject(obj: unknown, config?: RedactionConfig): unknown {
  return getRedactionEngine(config).redactObject(obj, new WeakSet());
}

/**
 * Convenience function for redacting log arguments using the global engine.
 * 
 * @param args - Array of log arguments to redact
 * @param config - Optional configuration for custom redaction behavior
 * @returns Array with PII redacted from each argument
 * 
 * @example
 * ```typescript
 * import { redactArgs } from '@nuanced-labs/lever-ui-logger';
 * 
 * const logArgs = [
 *   'Login attempt',
 *   { user: 'john@example.com', ip: '192.168.1.1' },
 *   'Session token: abc123xyz'
 * ];
 * 
 * const safe = redactArgs(logArgs);
 * // Returns: [
 * //   'Login attempt',
 * //   { user: '<redacted>', ip: '192.168.1.1' },  // IP not redacted in balanced mode
 * //   'Session token: abc123xyz'
 * // ]
 * ```
 */
export function redactArgs(args: readonly unknown[], config?: RedactionConfig): readonly unknown[] {
  return getRedactionEngine(config).redactArgs(args);
}