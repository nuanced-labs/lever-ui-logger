/**
 * Built-in redaction patterns for common PII types
 */

export interface BuiltInRedactionPattern {
  /** Pattern name for debugging and configuration */
  name: string;
  /** Regular expression to match PII */
  pattern: RegExp;
  /** Replacement text (can include capture groups) */
  replacement: string;
  /** Description of what this pattern detects */
  description: string;
  /** Whether this pattern is enabled by default */
  defaultEnabled: boolean;
  /** Performance category for priority ordering */
  priority: 'high' | 'medium' | 'low';
}

/**
 * Built-in PII detection patterns
 * Ordered by detection priority (high performance patterns first)
 */
export const BUILT_IN_PATTERNS: readonly BuiltInRedactionPattern[] = [
  // Email addresses (high priority - very common)
  {
    name: 'email',
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    replacement: '<email>',
    description: 'Email addresses',
    defaultEnabled: true,
    priority: 'high'
  },

  // Phone numbers (various formats)
  {
    name: 'phone-us',
    pattern: /(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}\b/g,
    replacement: '<phone>',
    description: 'US phone numbers',
    defaultEnabled: true,
    priority: 'high'
  },

  // Social Security Numbers
  {
    name: 'ssn',
    pattern: /\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/g,
    replacement: '<ssn>',
    description: 'Social Security Numbers',
    defaultEnabled: true,
    priority: 'high'
  },

  // Credit card numbers (basic pattern)
  {
    name: 'credit-card',
    pattern: /\b(?:\d{4}[-.\s]?){3}\d{4}\b/g,
    replacement: '<credit-card>',
    description: 'Credit card numbers',
    defaultEnabled: true,
    priority: 'medium'
  },

  // IP addresses
  {
    name: 'ipv4',
    pattern: /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/g,
    replacement: '<ip>',
    description: 'IPv4 addresses',
    defaultEnabled: false, // Often needed for debugging
    priority: 'low'
  },

  // IPv6 addresses (simplified pattern)
  {
    name: 'ipv6',
    pattern: /\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b/g,
    replacement: '<ipv6>',
    description: 'IPv6 addresses',
    defaultEnabled: false,
    priority: 'low'
  },

  // URLs with potential PII in query params
  {
    name: 'url-params',
    pattern: /([?&](?:email|user|username|phone|ssn|token|key|secret|password|auth)=)[^&\s]+/gi,
    replacement: '$1<redacted>',
    description: 'URL parameters containing PII',
    defaultEnabled: true,
    priority: 'medium'
  },

  // JWT tokens (basic pattern)
  {
    name: 'jwt',
    pattern: /\beyJ[A-Za-z0-9_-]*\.[A-Za-z0-9._-]*\.[A-Za-z0-9._-]*\b/g,
    replacement: '<jwt>',
    description: 'JWT tokens',
    defaultEnabled: true,
    priority: 'medium'
  },

  // API keys (common patterns)
  {
    name: 'api-key',
    pattern: /(?:(?:api[_-]?key|secret[_-]?key)\s*[:=]\s*|access[_-]?token\s+)["']?[A-Za-z0-9_-]{16,}["']?/gi,
    replacement: '<api-key>',
    description: 'API keys and access tokens',
    defaultEnabled: true,
    priority: 'high'
  },

  // Generic secrets (high entropy strings)
  {
    name: 'high-entropy',
    pattern: /\b[A-Za-z0-9+/]{32,}={0,2}\b/g,
    replacement: '<secret>',
    description: 'High entropy strings (potential secrets)',
    defaultEnabled: false, // Can be noisy
    priority: 'low'
  }
];

/**
 * Field names that commonly contain PII
 * These trigger redaction regardless of content
 */
export const PII_FIELD_NAMES: readonly string[] = [
  'password',
  'passwd',
  'secret',
  'token',
  'key',
  'auth',
  'authorization',
  'email',
  'mail',
  'phone',
  'tel',
  'telephone',
  'ssn',
  'social',
  'credit',
  'card',
  'cvv',
  'pin',
  'account',
  'username',
  'user',
  'login',
  'address',
  'street',
  'zip',
  'postal',
  'dob',
  'birthdate',
  'birthday',
  'age',
  'gender',
  'race',
  'ethnicity',
  'religion',
  'sexual',
  'political',
  'medical',
  'health',
  'diagnosis',
  'prescription',
  'insurance',
  'license',
  'passport',
  'visa',
  'fingerprint',
  'biometric'
];

/**
 * Creates a case-insensitive field name matcher.
 * Uses exact matches and common patterns to avoid false positives.
 * 
 * @param fieldName - The field name to check for PII indicators
 * @returns True if the field name indicates it may contain PII
 * 
 * @example
 * ```typescript
 * isPIIFieldName('password'); // true
 * isPIIFieldName('userId'); // true  
 * isPIIFieldName('userPassword'); // true (camelCase)
 * isPIIFieldName('user_email'); // true (underscore)
 * isPIIFieldName('auth-token'); // true (hyphen)
 * isPIIFieldName('message'); // false
 * isPIIFieldName('timestamp'); // false
 * ```
 */
export function isPIIFieldName(fieldName: string): boolean {
  const lowerFieldName = fieldName.toLowerCase();
  
  return PII_FIELD_NAMES.some(piiField => {
    // Exact match
    if (lowerFieldName === piiField) {
      return true;
    }
    
    // Common patterns with underscore or hyphen
    if (lowerFieldName.endsWith('_' + piiField) || 
        lowerFieldName.endsWith('-' + piiField) ||
        lowerFieldName.startsWith(piiField + '_') ||
        lowerFieldName.startsWith(piiField + '-')) {
      return true;
    }
    
    // Composite patterns for ID fields (userId, userEmail, etc.) and camelCase
    if (lowerFieldName.includes(piiField + 'id') || 
        lowerFieldName.includes(piiField + 'name') ||
        lowerFieldName.includes(piiField + 'email') ||
        lowerFieldName.includes(piiField + 'phone') ||
        lowerFieldName.includes(piiField + 'password') ||
        lowerFieldName.includes(piiField + 'token') ||
        lowerFieldName.includes(piiField + 'key') ||
        lowerFieldName.includes(piiField + 'address')) {
      return true;
    }
    
    // Check for camelCase patterns (userPassword, emailAddress, authToken)
    if (piiField.length >= 4) {
      const camelCasePattern = new RegExp(piiField + '[A-Z]', 'i');
      if (camelCasePattern.test(fieldName)) {
        return true;
      }
    }
    
    // Word boundary check for longer fields only (avoiding false positives)
    if (piiField.length >= 5) { // Only check longer PII fields
      const wordBoundary = new RegExp(`\\b${piiField}\\b`, 'i');
      if (wordBoundary.test(fieldName)) {
        return true;
      }
    }
    
    return false;
  });
}

/**
 * Gets enabled patterns based on configuration.
 * 
 * @param enabledPatterns - Specific patterns to enable (overrides defaults)
 * @param disabledPatterns - Specific patterns to disable  
 * @returns Array of enabled redaction patterns
 * 
 * @example
 * ```typescript
 * // Get all default enabled patterns
 * const defaultPatterns = getEnabledPatterns();
 * 
 * // Only enable specific patterns
 * const emailOnly = getEnabledPatterns(['email']);
 * 
 * // Enable defaults except IP addresses
 * const noIPs = getEnabledPatterns(undefined, ['ipv4', 'ipv6']);
 * ```
 */
export function getEnabledPatterns(
  enabledPatterns?: string[],
  disabledPatterns?: string[]
): BuiltInRedactionPattern[] {
  return BUILT_IN_PATTERNS.filter(pattern => {
    // If specific patterns are enabled, only use those
    if (enabledPatterns && enabledPatterns.length > 0) {
      return enabledPatterns.includes(pattern.name);
    }
    
    // Otherwise use defaults minus any disabled patterns
    const isDisabled = disabledPatterns?.includes(pattern.name) ?? false;
    return pattern.defaultEnabled && !isDisabled;
  });
}

/**
 * Sorts patterns by priority for optimal performance.
 * High priority patterns are processed first for better performance.
 * 
 * @param patterns - Array of redaction patterns to sort
 * @returns Sorted array with high priority patterns first
 * 
 * @example
 * ```typescript
 * const unsorted = [
 *   { name: 'low-pattern', priority: 'low', ... },
 *   { name: 'high-pattern', priority: 'high', ... },
 *   { name: 'medium-pattern', priority: 'medium', ... }
 * ];
 * const sorted = sortPatternsByPriority(unsorted);
 * // Result: [high-pattern, medium-pattern, low-pattern]
 * ```
 */
export function sortPatternsByPriority(patterns: BuiltInRedactionPattern[]): BuiltInRedactionPattern[] {
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  
  return [...patterns].sort((a, b) => {
    const aPriority = priorityOrder[a.priority];
    const bPriority = priorityOrder[b.priority];
    
    if (aPriority !== bPriority) {
      return aPriority - bPriority;
    }
    
    // Secondary sort by name for consistency
    return a.name.localeCompare(b.name);
  });
}