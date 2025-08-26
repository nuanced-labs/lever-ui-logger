/**
 * Production-grade secure token handler for authentication tokens
 * 
 * Provides comprehensive token security including:
 * - Memory protection against serialization attacks
 * - Token obfuscation using industry-standard techniques
 * - Comprehensive error message sanitization
 * - PII and token detection for debug outputs
 */

import { ErrorMessageSanitizer } from './error-sanitizer.js';

/**
 * Token provider function type
 */
export type TokenProvider = () => string | Promise<string>;

/**
 * Configuration for secure token handling
 */
export interface SecureTokenConfig {
  /** Enable additional security measures (default: true) */
  enableSecureMode?: boolean;
  /** Token expiration time in milliseconds (default: 1 hour) */
  tokenTtl?: number;
  /** Enable token validation (default: true) */
  validateToken?: boolean;
  /** Custom token validator function */
  tokenValidator?: (_token: string) => boolean;
}

/**
 * Internal token storage structure with security metadata
 */
interface TokenEntry {
  /** Encrypted/obfuscated token value */
  value: string;
  /** Token acquisition timestamp */
  timestamp: number;
  /** Token expiration timestamp */
  expiresAt: number;
  /** Token source type */
  source: 'static' | 'function';
  /** Security flags */
  secure: boolean;
}

/** Secure token handler that prevents accidental token exposure */
export class SecureTokenHandler {
  private readonly config: Required<SecureTokenConfig>;
  private readonly errorSanitizer: ErrorMessageSanitizer;
  private tokenEntry: TokenEntry | null = null;
  private tokenProvider: TokenProvider | null = null;
  private disposed = false;
  private obfuscationKey: Uint8Array | null = null;

  constructor(config: SecureTokenConfig = {}) {
    this.config = {
      enableSecureMode: config.enableSecureMode ?? true,
      tokenTtl: config.tokenTtl ?? 3600000, // 1 hour default
      validateToken: config.validateToken ?? true,
      tokenValidator: config.tokenValidator ?? this.defaultTokenValidator.bind(this)
    };

    // Initialize comprehensive error sanitizer
    this.errorSanitizer = new ErrorMessageSanitizer({
      enableTokenDetection: true,
      replacementStrategy: 'mask',
      maskRevealLength: 8
    });

    // Make this object non-serializable to prevent token leakage
    if (this.config.enableSecureMode) {
      this.makeNonSerializable();
    }
  }

  /**
   * Set a static authentication token
   * 
   * @param token - The authentication token to store securely
   * @throws Error if token is invalid or handler is disposed
   */
  setToken(token: string | null): void {
    this.checkDisposed();

    if (token === null) {
      this.tokenEntry = null;
      this.tokenProvider = null;
      return;
    }

    if (this.config.validateToken && !this.config.tokenValidator(token)) {
      throw new Error('Invalid token format');
    }

    const now = Date.now();
    const value = this.config.enableSecureMode ? this.obfuscateToken(token) : token;
    
    this.tokenEntry = {
      value,
      timestamp: now,
      expiresAt: now + this.config.tokenTtl,
      source: 'static',
      secure: this.config.enableSecureMode
    };

    this.tokenProvider = null;
  }

  /**
   * Set a token provider function for dynamic token retrieval
   * 
   * @param provider - Function that returns an authentication token
   * @throws Error if provider is invalid or handler is disposed
   */
  setTokenProvider(provider: TokenProvider | null): void {
    this.checkDisposed();
    this.tokenProvider = provider;
    this.tokenEntry = null; // Clear any cached static token
  }

  /**
   * Retrieve the current authentication token
   * 
   * @returns The current token or null if none available
   * @throws Error if token retrieval fails or handler is disposed
   */
  async getToken(): Promise<string | null> {
    this.checkDisposed();

    // Try cached token first
    if (this.tokenEntry && this.isTokenValid(this.tokenEntry)) {
      const value = this.tokenEntry.secure ? 
        this.deobfuscateToken(this.tokenEntry.value) : 
        this.tokenEntry.value;
      return value;
    }

    // Try token provider
    if (this.tokenProvider) {
      try {
        const token = await this.tokenProvider();
        
        if (this.config.validateToken && !this.config.tokenValidator(token)) {
          throw new Error('Token provider returned invalid token');
        }

        const now = Date.now();
        const value = this.config.enableSecureMode ? this.obfuscateToken(token) : token;
        
        this.tokenEntry = {
          value,
          timestamp: now,
          expiresAt: now + this.config.tokenTtl,
          source: 'function',
          secure: this.config.enableSecureMode
        };

        return token;
      } catch (error) {
        const sanitizedError = this.sanitizeErrorMessage(error instanceof Error ? error.message : String(error));
        console.error('SecureTokenHandler: Token provider failed:', sanitizedError);
        return null;
      }
    }

    return null;
  }

  /**
   * Check if a token is currently available and valid
   */
  hasToken(): boolean {
    if (this.disposed) return false;
    
    if (this.tokenEntry && this.isTokenValid(this.tokenEntry)) {
      return true;
    }

    return this.tokenProvider !== null;
  }

  /**
   * Clear all token data and dispose resources
   * 
   * This method should be called when the handler is no longer needed
   * to ensure tokens are properly cleared from memory.
   */
  dispose(): void {
    if (this.disposed) return;

    // Securely clear token data
    if (this.tokenEntry) {
      // Overwrite token value with random data
      if (typeof this.tokenEntry.value === 'string') {
        this.tokenEntry.value = this.generateRandomString(this.tokenEntry.value.length);
      }
    }
    this.tokenEntry = null;

    this.tokenProvider = null;
    
    // Clear obfuscation key
    if (this.obfuscationKey) {
      this.obfuscationKey.fill(0);
      this.obfuscationKey = null;
    }
    
    this.disposed = true;

    // Remove serialization protection
    if (this.config.enableSecureMode) {
      this.removeNonSerializable();
    }
  }

  /**
   * Create a secure JSON replacer function that sanitizes sensitive data
   */
  createSecureReplacer(): (_key: string, _value: unknown) => unknown {
    const seen = new WeakSet();
    return (_key: string, value: unknown): unknown => {
      // Prevent circular references
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) {
          return '[Circular Reference]';
        }
        seen.add(value);
      }

      if (typeof value === 'string') {
        const keyValuePair = `${_key}=${value}`;
        const isSensitiveKey = this.errorSanitizer.hasSensitiveData(keyValuePair);
        
        if (isSensitiveKey) {
          return this.forceSanitizeValue(value);
        }

        if (this.errorSanitizer.hasSensitiveData(value)) {
          return this.errorSanitizer.sanitize(value);
        }
      }

      return value;
    };
  }

  /**
   * Sanitize HTTP headers to remove or mask authentication tokens
   * 
   * @param headers - Headers object to sanitize
   * @returns New headers object with sensitive values masked
   */
  sanitizeHeaders(headers: Record<string, string>): Record<string, string> {
    const sanitized: Record<string, string> = {};
    
    const sensitiveHeaderNames = [
      'authorization', 'auth', 'x-api-key', 'x-auth-token', 'x-access-token',
      'bearer', 'token', 'api-key', 'apikey', 'secret', 'credential'
    ];
    
    for (const [key, value] of Object.entries(headers)) {
      const lowerKey = key.toLowerCase();
      
      // Check if this is a sensitive header by exact name match
      if (sensitiveHeaderNames.includes(lowerKey)) {
        sanitized[key] = this.maskToken(value);
      } else {
        sanitized[key] = value;
      }
    }
    
    return sanitized;
  }

  /**
   * Mask a token showing first and last few characters
   * 
   * @param token - Token to mask
   * @returns Masked token
   */
  maskToken(token: string): string {
    if (!token || typeof token !== 'string') {
      return token;
    }

    if (token.length <= 8) {
      return '*'.repeat(token.length);
    }

    const revealLength = 4;
    const start = token.substring(0, revealLength);
    const end = token.substring(token.length - revealLength);
    const maskLength = Math.min(20, Math.max(4, token.length - (revealLength * 2)));
    
    return `${start}${'*'.repeat(maskLength)}${end}`;
  }

  /**
   * Force sanitization of a value using masking strategy
   */
  private forceSanitizeValue(value: string): string {
    if (!value || value.length <= 8) {
      return '*'.repeat(value.length);
    }
    
    const revealLength = Math.floor(4 / 2); // Show 2 chars at start and end
    const start = value.substring(0, revealLength);
    const end = value.substring(value.length - revealLength);
    const maskLength = Math.min(20, Math.max(4, value.length - (revealLength * 2)));
    
    return `${start}${'*'.repeat(maskLength)}${end}`;
  }

  /**
   * Default token validator
   */
  private defaultTokenValidator(token: string): boolean {
    if (!token || typeof token !== 'string') return false;
    if (token.length < 8) return false; // Minimum reasonable token length
    if (token.includes(' ') && !token.startsWith('Bearer ')) return false;
    return true;
  }

  /**
   * Check if handler is disposed
   */
  private checkDisposed(): void {
    if (this.disposed) {
      throw new Error('SecureTokenHandler has been disposed');
    }
  }

  /**
   * Check if a token entry is valid and not expired
   */
  private isTokenValid(entry: TokenEntry): boolean {
    return entry.expiresAt > Date.now();
  }

  /**
   * Multi-round obfuscation to protect tokens in memory using session key.
   * Uses a combination of XOR, character substitution, and encoding rounds
   * of transformation to protect tokens in memory against casual inspection
   * and memory dumps. Not meant for cryptographic security but provides
   * defense-in-depth against token extraction.
   */
  private obfuscateToken(token: string): string {
    if (!token) return '';

    try {
      // Generate a session-specific key (random but consistent per instance)
      const key = this.getObfuscationKey();
      
      // Apply multi-round obfuscation
      let obfuscated = token;
      
      // Round 1: XOR cipher
      obfuscated = this.xorCipher(obfuscated, key);
      
      // Round 2: Character substitution
      obfuscated = this.substituteChars(obfuscated);
      
      // Round 3: Encoding
      obfuscated = this.encodeObfuscated(obfuscated);
      
      return obfuscated;
    } catch {
      // If obfuscation fails, return empty string for safety
      return '';
    }
  }

  /**
   * Reverse the multi-round obfuscation process
   */
  private deobfuscateToken(obfuscated: string): string {
    if (!obfuscated) return '';
    
    try {
      // Reverse the obfuscation process in opposite order
      
      // Reverse Round 3: Decoding
      let decoded = this.decodeObfuscated(obfuscated);
      
      // Reverse Round 2: Character substitution
      decoded = this.reverseSubstituteChars(decoded);
      
      // Reverse Round 1: XOR cipher using the same session key
      const key = this.getObfuscationKey();
      decoded = this.xorCipher(decoded, key); // XOR is self-inverse
      
      // Sanity check: decoded result should be printable text (tokens/passwords)
      if (!/^[\x20-\x7E]+$/.test(decoded)) {
        throw new Error('Deobfuscated data contains non-printable characters');
      }
      
      return decoded;
    } catch {
      // For malformed tokens, return empty string instead of corrupted data
      return '';
    }
  }

  /**
   * XOR cipher implementation
   */
  private xorCipher(text: string, key: Uint8Array): string {
    const result = new Array(text.length);
    for (let i = 0; i < text.length; i++) {
      result[i] = String.fromCharCode(text.charCodeAt(i) ^ key[i % key.length]);
    }
    return result.join('');
  }

  /**
   * Character substitution using a custom mapping
   */
  private substituteChars(text: string): string {
    const substitutionMap = this.createSubstitutionMap();
    return text.split('').map(char => substitutionMap[char] || char).join('');
  }

  /**
   * Reverse character substitution
   */
  private reverseSubstituteChars(text: string): string {
    const reverseMap = this.createReverseSubstitutionMap();
    return text.split('').map(char => reverseMap[char] || char).join('');
  }

  /**
   * Encode the obfuscated string using base64 or similar
   */
  private encodeObfuscated(text: string): string {
    // Use base64 encoding, fallback to simple encoding if not available
    try {
      return typeof btoa !== 'undefined' ? btoa(text) : this.simpleEncode(text);
    } catch {
      return this.simpleEncode(text);
    }
  }

  /**
   * Decode the obfuscated string
   */
  private decodeObfuscated(encoded: string): string {
    try {
      return typeof atob !== 'undefined' ? atob(encoded) : this.simpleDecode(encoded);
    } catch {
      return this.simpleDecode(encoded);
    }
  }

  /**
   * Sanitize error messages to prevent token leakage
   */
  sanitizeErrorMessage(errorMessage: string): string {
    return this.errorSanitizer.sanitize(errorMessage);
  }

  /**
   * Create character substitution map
   */
  private createSubstitutionMap(): Record<string, string> {
    const map: Record<string, string> = {};
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    const shuffled = 'ZYXWVUTSRQPONMLKJIHGFEDCBAzyxwvutsrqponmlkjihgfedcba9876543210/+=';
    
    for (let i = 0; i < chars.length; i++) {
      map[chars[i]] = shuffled[i];
    }
    
    return map;
  }

  /**
   * Create reverse substitution map
   */
  private createReverseSubstitutionMap(): Record<string, string> {
    const map: Record<string, string> = {};
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    const shuffled = 'ZYXWVUTSRQPONMLKJIHGFEDCBAzyxwvutsrqponmlkjihgfedcba9876543210/+=';
    
    for (let i = 0; i < chars.length; i++) {
      map[shuffled[i]] = chars[i];
    }
    
    return map;
  }

  /**
   * Simple encoding fallback for environments without btoa
   */
  private simpleEncode(text: string): string {
    // Simple character code shifting as fallback
    return text.split('').map(char => String.fromCharCode(char.charCodeAt(0) + 1)).join('');
  }

  /**
   * Simple decoding fallback for environments without atob
   */
  private simpleDecode(encoded: string): string {
    try {
      return encoded.split('').map(char => String.fromCharCode(char.charCodeAt(0) - 1)).join('');
    } catch {
      return '';
    }
  }

  /**
   * Generate a random string for token clearing
   */
  private generateRandomString(length: number): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  /**
   * Get or generate the session-specific obfuscation key
   */
  private getObfuscationKey(): Uint8Array {
    if (!this.obfuscationKey) {
      // Generate a random key using secure random values
      this.obfuscationKey = new Uint8Array(8);
      
      // Use crypto.getRandomValues if available (browser), otherwise Math.random fallback
      if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        crypto.getRandomValues(this.obfuscationKey);
      } else {
        // Fallback for environments without crypto.getRandomValues
        for (let i = 0; i < this.obfuscationKey.length; i++) {
          this.obfuscationKey[i] = Math.floor(Math.random() * 256);
        }
      }
    }
    return this.obfuscationKey;
  }

  /**
   * Make object non-serializable to prevent token leakage
   */
  private makeNonSerializable(): void {
    // Override toJSON to prevent serialization
    Object.defineProperty(this, 'toJSON', {
      value: () => '[SecureTokenHandler - Non-Serializable]',
      writable: false,
      enumerable: false
    });

    // Override toString to prevent accidental exposure
    Object.defineProperty(this, 'toString', {
      value: () => '[SecureTokenHandler - Protected]',
      writable: false,
      enumerable: false
    });

    // Override valueOf to prevent accidental exposure
    Object.defineProperty(this, 'valueOf', {
      value: () => '[SecureTokenHandler - Protected]',
      writable: false,
      enumerable: false
    });
  }

  /**
   * Remove non-serializable protection (for disposal)
   */
  private removeNonSerializable(): void {
    try {
      // Reset to original methods using Reflect.deleteProperty
      Reflect.deleteProperty(this, 'toJSON');
      Reflect.deleteProperty(this, 'toString');
      Reflect.deleteProperty(this, 'valueOf');
    } catch {
      // Ignore errors during cleanup
    }
  }
}

/**
 * Default secure token handler instance for immediate use
 */
export const defaultSecureTokenHandler = new SecureTokenHandler();