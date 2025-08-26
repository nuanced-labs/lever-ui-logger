/**
 * Error message sanitizer for preventing sensitive data leakage
 * 
 * This module provides comprehensive sanitization of error messages and other strings
 * to prevent accidental exposure of tokens, API keys, passwords, and other sensitive data.
 * Based on security research and production patterns from major security tools.
 */

/**
 * Comprehensive regex patterns for detecting various types of sensitive tokens and PII
 * Based on research from security tools like TruffleHog and industry standards
 */
export interface TokenPatterns {
  /** JWT tokens - Base64url encoded with 3 parts */
  jwt: RegExp;
  /** Generic Bearer tokens */
  bearer: RegExp;
  /** Generic API keys with common prefixes */
  genericApiKey: RegExp;
  /** URLs with credentials */
  urlWithCredentials: RegExp;
  /** Email addresses */
  email: RegExp;
  /** Phone numbers */
  phone: RegExp;
  /** Credit card numbers */
  creditCard: RegExp;
}

/**
 * Configuration for the error sanitizer
 */
export interface ErrorSanitizerConfig {
  /** Enable comprehensive token detection (default: true) */
  enableTokenDetection?: boolean;
  /** Replacement strategy for detected sensitive data */
  replacementStrategy?: 'mask' | 'redact' | 'hash';
  /** Custom token patterns to detect */
  customPatterns?: RegExp[];
  /** Fields to always redact regardless of content */
  sensitiveFields?: string[];
  /** Maximum length of original value to show in mask (default: 8) */
  maskRevealLength?: number;
}

/**
 * Production-grade error message sanitizer
 */
export class ErrorMessageSanitizer {
  private readonly config: Required<ErrorSanitizerConfig>;
  private readonly tokenPatterns: TokenPatterns;
  private readonly sensitiveFieldQuotedPattern: RegExp;
  private readonly sensitiveFieldUnquotedPattern: RegExp;

  constructor(config: ErrorSanitizerConfig = {}) {
    this.config = {
      enableTokenDetection: config.enableTokenDetection ?? true,
      replacementStrategy: config.replacementStrategy ?? 'mask',
      customPatterns: config.customPatterns ?? [],
      sensitiveFields: config.sensitiveFields ?? [
        'token', 'auth', 'authorization', 'bearer', 'password', 'secret',
        'key', 'apikey', 'api_key', 'access_token', 'refresh_token',
        'client_secret', 'private_key', 'credential', 'session'
      ],
      maskRevealLength: config.maskRevealLength ?? 8
    };

    this.tokenPatterns = this.createTokenPatterns();
    
    // Pattern for quoted sensitive fields: field="value" or field='value'
    this.sensitiveFieldQuotedPattern = new RegExp(
      `(${this.config.sensitiveFields.join('|')})\\s*[=:]\\s*(['"])([^'"]+)\\2`,
      'gi'
    );
    
    // Pattern for unquoted sensitive fields: field=value or field:value
    this.sensitiveFieldUnquotedPattern = new RegExp(
      `(${this.config.sensitiveFields.join('|')})\\s*[=:]\\s*([^\\s,}\\]\\)'"]+)`,
      'gi'
    );
  }

  /**
   * Sanitize an error message or any string containing potentially sensitive data
   * 
   * @param input - The string to sanitize
   * @returns Sanitized string with sensitive data masked/redacted
   */
  sanitize(input: string): string {
    if (!input || typeof input !== 'string') {
      return String(input);
    }

    let sanitized = input;

    try {
      // 1. Detect and sanitize token patterns first (catches full tokens)
      if (this.config.enableTokenDetection) {
        sanitized = this.sanitizeTokens(sanitized);
      }

      // 2. Sanitize based on sensitive field patterns (key=value, key: value) 
      sanitized = this.sanitizeSensitiveFields(sanitized);

      // 3. Apply custom patterns
      sanitized = this.applyCustomPatterns(sanitized);

      return sanitized;
    } catch {
      // If sanitization fails, return a generic safe message
      return '[Error message sanitization failed - content redacted for security]';
    }
  }

  /**
   * Sanitize sensitive key-value pairs in strings
   */
  private sanitizeSensitiveFields(input: string): string {
    let sanitized = input;
    
    // Handle quoted fields: field="value" or field='value'
    sanitized = sanitized.replace(this.sensitiveFieldQuotedPattern, (match, field, quote, value) => {
      const sanitizedValue = this.applySanitization(value);
      return `${field}=${quote}${sanitizedValue}${quote}`;
    });
    
    // Handle unquoted fields: field=value or field:value
    sanitized = sanitized.replace(this.sensitiveFieldUnquotedPattern, (match, field, value) => {
      const sanitizedValue = this.applySanitization(value);
      return match.replace(value, sanitizedValue);
    });
    
    return sanitized;
  }

  /**
   * Detect and sanitize various token patterns
   */
  private sanitizeTokens(input: string): string {
    let sanitized = input;

    for (const [patternName, pattern] of Object.entries(this.tokenPatterns)) {
      // Reset the lastIndex for global regex patterns
      if (pattern.global) {
        pattern.lastIndex = 0;
      }
      
      sanitized = sanitized.replace(pattern, (match) => {
        return this.applySanitization(match, `[${patternName.toUpperCase()}_TOKEN]`);
      });
    }

    return sanitized;
  }


  /**
   * Apply custom user-defined patterns
   */
  private applyCustomPatterns(input: string): string {
    let sanitized = input;

    for (const pattern of this.config.customPatterns) {
      sanitized = sanitized.replace(pattern, (match) => {
        return this.applySanitization(match, '[CUSTOM_REDACTED]');
      });
    }

    return sanitized;
  }

  /**
   * Apply the configured sanitization strategy to a detected sensitive value
   */
  private applySanitization(value: string, _placeholder?: string): string {
    switch (this.config.replacementStrategy) {
      case 'redact':
        return '[REDACTED]';
      
      case 'hash':
        return this.hashValue(value);
      
      case 'mask':
      default:
        return this.maskValue(value);
    }
  }

  /**
   * Mask a value showing first and last few characters
   */
  private maskValue(value: string): string {
    if (value.length <= this.config.maskRevealLength) {
      return '*'.repeat(value.length);
    }

    const revealLength = Math.floor(this.config.maskRevealLength / 2);
    const start = value.substring(0, revealLength);
    const end = value.substring(value.length - revealLength);
    // Cap mask length to prevent extremely long masked strings
    const maskLength = Math.min(20, Math.max(4, value.length - (revealLength * 2)));
    
    return `${start}${'*'.repeat(maskLength)}${end}`;
  }

  /**
   * Create a hash of the value for logging purposes
   */
  private hashValue(value: string): string {
    // Simple hash implementation for browsers without crypto.subtle
    let hash = 0;
    for (let i = 0; i < value.length; i++) {
      const char = value.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return `[HASH:${Math.abs(hash).toString(16)}]`;
  }

  /**
   * Create comprehensive token detection patterns
   */
  private createTokenPatterns(): TokenPatterns {
    return {
      // JWT tokens: header.payload.signature (base64url encoded)
      jwt: /\b[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/g,

      // Bearer tokens in various formats
      bearer: /bearer\s+[A-Za-z0-9+/=_-]{6,}/gi,

      // Generic API key patterns - match just the value after field identifiers
      genericApiKey: /(?<=(?:api[_-]?key|apikey|key|secret)[\s=:"']+)[A-Za-z0-9+/=_-]{6,}/gi,

      // URLs with embedded credentials
      urlWithCredentials: /\b[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^\s:]+:[^\s@]+@[^\s/]+/gi,

      // Basic PII patterns
      email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
      phone: /\b(?:\+?1[-.)\s]?)?(?:\([0-9]{3}\)|[0-9]{3})[-.)\s]?[0-9]{3}[-.)\s]?[0-9]{4}\b/g,
      creditCard: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b/g
    };
  }

  /**
   * Check if a string contains any detectable sensitive data
   * 
   * @param input - String to check
   * @returns True if sensitive data is detected
   */
  hasSensitiveData(input: string): boolean {
    if (!input || typeof input !== 'string') {
      return false;
    }

    // Reset regex lastIndex for proper testing
    this.sensitiveFieldQuotedPattern.lastIndex = 0;
    this.sensitiveFieldUnquotedPattern.lastIndex = 0;

    // Check sensitive field patterns
    if (this.sensitiveFieldQuotedPattern.test(input) || this.sensitiveFieldUnquotedPattern.test(input)) {
      return true;
    }

    // Check token patterns
    if (this.config.enableTokenDetection) {
      for (const pattern of Object.values(this.tokenPatterns)) {
        if (pattern.global) {
          pattern.lastIndex = 0;
        }
        if (pattern.test(input)) {
          return true;
        }
      }
    }

    // Check custom patterns
    for (const pattern of this.config.customPatterns) {
      if (pattern.global) {
        pattern.lastIndex = 0;
      }
      if (pattern.test(input)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get statistics about what types of sensitive data were found
   * 
   * @param input - String to analyze
   * @returns Object with counts of different sensitive data types found
   */
  analyzeSensitiveData(input: string): Record<string, number> {
    const analysis: Record<string, number> = {};

    if (!input || typeof input !== 'string') {
      return analysis;
    }

    // Analyze token patterns
    if (this.config.enableTokenDetection) {
      for (const [patternName, pattern] of Object.entries(this.tokenPatterns)) {
        const matches = input.match(pattern);
        if (matches) {
          analysis[patternName] = matches.length;
        }
      }
    }

    // Analyze sensitive fields
    const quotedFieldMatches = input.match(this.sensitiveFieldQuotedPattern);
    const unquotedFieldMatches = input.match(this.sensitiveFieldUnquotedPattern);
    const totalFieldMatches = (quotedFieldMatches?.length || 0) + (unquotedFieldMatches?.length || 0);
    if (totalFieldMatches > 0) {
      analysis.sensitiveFields = totalFieldMatches;
    }

    return analysis;
  }

}

/**
 * Default error sanitizer instance for immediate use
 */
export const defaultErrorSanitizer = new ErrorMessageSanitizer();