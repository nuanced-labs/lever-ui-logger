/**
 * Comprehensive tests for SecureTokenHandler
 * 
 * Tests secure token storage, retrieval, validation, sanitization,
 * and protection against various attack vectors including serialization
 * attacks and debug output leakage.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SecureTokenHandler, type TokenProvider } from '../../src/transports/secure-token-handler.js';

describe('SecureTokenHandler', () => {
  let tokenHandler: SecureTokenHandler;

  beforeEach(() => {
    tokenHandler = new SecureTokenHandler({
      enableSecureMode: true,
      tokenTtl: 60000, // 1 minute for testing
      validateToken: true
    });
  });

  afterEach(() => {
    tokenHandler.dispose();
  });

  describe('Token Storage and Retrieval', () => {
    it('stores and retrieves static tokens', async () => {
      const testToken = 'Bearer test-token-123';
      tokenHandler.setToken(testToken);

      const retrievedToken = await tokenHandler.getToken();
      expect(retrievedToken).toBe(testToken);
      expect(tokenHandler.hasToken()).toBe(true);
    });

    it('stores and retrieves tokens from provider functions', async () => {
      const testToken = 'Bearer provider-token-456';
      const provider: TokenProvider = async () => testToken;
      
      tokenHandler.setTokenProvider(provider);

      const retrievedToken = await tokenHandler.getToken();
      expect(retrievedToken).toBe(testToken);
      expect(tokenHandler.hasToken()).toBe(true);
    });

    it('handles synchronous token providers', async () => {
      const testToken = 'Bearer sync-token-789';
      const provider: TokenProvider = () => testToken;
      
      tokenHandler.setTokenProvider(provider);

      const retrievedToken = await tokenHandler.getToken();
      expect(retrievedToken).toBe(testToken);
    });

    it('caches tokens from providers for performance', async () => {
      const mockProvider = vi.fn().mockResolvedValue('Bearer cached-token');
      tokenHandler.setTokenProvider(mockProvider);

      // First call
      await tokenHandler.getToken();
      expect(mockProvider).toHaveBeenCalledTimes(1);

      // Second call should use cached token
      await tokenHandler.getToken();
      expect(mockProvider).toHaveBeenCalledTimes(1);
    });

    it('returns null when no token is available', async () => {
      const token = await tokenHandler.getToken();
      expect(token).toBeNull();
      expect(tokenHandler.hasToken()).toBe(false);
    });

    it('clears tokens when set to null', async () => {
      tokenHandler.setToken('Bearer test-token');
      expect(tokenHandler.hasToken()).toBe(true);

      tokenHandler.setToken(null);
      expect(tokenHandler.hasToken()).toBe(false);
      expect(await tokenHandler.getToken()).toBeNull();
    });
  });

  describe('Token Validation', () => {
    it('validates tokens with default validator', () => {
      // Valid tokens should work
      expect(() => tokenHandler.setToken('Bearer valid-token-123')).not.toThrow();
      expect(() => tokenHandler.setToken('valid-token-without-bearer')).not.toThrow();

      // Invalid tokens should throw
      expect(() => tokenHandler.setToken('')).toThrow('Invalid token format');
      expect(() => tokenHandler.setToken('short')).toThrow('Invalid token format');
      expect(() => tokenHandler.setToken('invalid token with spaces')).toThrow('Invalid token format');
    });

    it('uses custom token validator when provided', () => {
      const customHandler = new SecureTokenHandler({
        tokenValidator: (token) => token.startsWith('CUSTOM_')
      });

      expect(() => customHandler.setToken('CUSTOM_valid-token')).not.toThrow();
      expect(() => customHandler.setToken('Bearer invalid')).toThrow('Invalid token format');

      customHandler.dispose();
    });

    it('validates tokens from providers', async () => {
      const invalidProvider: TokenProvider = () => 'short';
      tokenHandler.setTokenProvider(invalidProvider);

      const token = await tokenHandler.getToken();
      expect(token).toBeNull(); // Should return null for invalid tokens
    });

    it('can disable token validation', () => {
      const noValidationHandler = new SecureTokenHandler({
        validateToken: false
      });

      // Should accept any token when validation is disabled
      expect(() => noValidationHandler.setToken('x')).not.toThrow();
      expect(() => noValidationHandler.setToken('')).not.toThrow();

      noValidationHandler.dispose();
    });
  });

  describe('Token Expiration', () => {
    it('respects token TTL for static tokens', async () => {
      const shortTtlHandler = new SecureTokenHandler({
        tokenTtl: 100 // 100ms
      });

      shortTtlHandler.setToken('Bearer expires-soon');
      expect(await shortTtlHandler.getToken()).toBe('Bearer expires-soon');

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 150));

      expect(await shortTtlHandler.getToken()).toBeNull();
      shortTtlHandler.dispose();
    });

    it('refreshes expired tokens from providers', async () => {
      const shortTtlHandler = new SecureTokenHandler({
        tokenTtl: 100 // 100ms
      });

      let tokenCounter = 0;
      const provider: TokenProvider = () => `Bearer token-${++tokenCounter}`;
      shortTtlHandler.setTokenProvider(provider);

      const firstToken = await shortTtlHandler.getToken();
      expect(firstToken).toBe('Bearer token-1');

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 150));

      const secondToken = await shortTtlHandler.getToken();
      expect(secondToken).toBe('Bearer token-2');

      shortTtlHandler.dispose();
    });
  });

  describe('Security Protection', () => {
    it('prevents serialization in secure mode', () => {
      const secureHandler = new SecureTokenHandler({ enableSecureMode: true });
      secureHandler.setToken('Bearer secret-token');

      const serialized = JSON.stringify(secureHandler);
      expect(serialized).not.toContain('secret-token');
      expect(serialized).not.toContain('Bearer');
      expect(serialized).toBe('"[SecureTokenHandler - Non-Serializable]"');

      secureHandler.dispose();
    });

    it('prevents value extraction in secure mode', () => {
      const secureHandler = new SecureTokenHandler({ enableSecureMode: true });
      secureHandler.setToken('Bearer secret-token');

      expect(String(secureHandler)).toBe('[SecureTokenHandler - Protected]');
      expect(secureHandler.valueOf()).toBe('[SecureTokenHandler - Protected]');

      secureHandler.dispose();
    });

    it('allows serialization when secure mode is disabled', () => {
      const insecureHandler = new SecureTokenHandler({ enableSecureMode: false });
      insecureHandler.setToken('Bearer test-token');

      // Should not throw and should serialize normally
      expect(() => JSON.stringify(insecureHandler)).not.toThrow();

      insecureHandler.dispose();
    });

    it('obfuscates tokens in memory when secure mode is enabled', async () => {
      const secureHandler = new SecureTokenHandler({ enableSecureMode: true });
      const originalToken = 'Bearer secret-token-123';
      
      secureHandler.setToken(originalToken);
      
      // The token should be obfuscated in the internal structure
      const internalData = (secureHandler as any).tokenEntry;
      expect(internalData.value).not.toBe(originalToken);
      expect(internalData.secure).toBe(true);
      
      // But retrieval should return the original token
      expect(await secureHandler.getToken()).toBe(originalToken);

      secureHandler.dispose();
    });

    it('stores tokens in plain text when secure mode is disabled', async () => {
      const insecureHandler = new SecureTokenHandler({ enableSecureMode: false });
      const originalToken = 'Bearer plain-token-123';
      
      insecureHandler.setToken(originalToken);
      
      const internalData = (insecureHandler as any).tokenEntry;
      expect(internalData.value).toBe(originalToken);
      expect(internalData.secure).toBe(false);

      insecureHandler.dispose();
    });
  });

  describe('Error Handling', () => {
    it('handles provider function errors gracefully', async () => {
      const errorProvider: TokenProvider = () => {
        throw new Error('Provider failed');
      };

      tokenHandler.setTokenProvider(errorProvider);
      const token = await tokenHandler.getToken();
      expect(token).toBeNull();
    });

    it('handles async provider errors gracefully', async () => {
      const asyncErrorProvider: TokenProvider = async () => {
        throw new Error('Async provider failed');
      };

      tokenHandler.setTokenProvider(asyncErrorProvider);
      const token = await tokenHandler.getToken();
      expect(token).toBeNull();
    });

    it('throws when using disposed handler', async () => {
      tokenHandler.dispose();

      expect(() => tokenHandler.setToken('Bearer test')).toThrow('SecureTokenHandler has been disposed');
      expect(() => tokenHandler.setTokenProvider(() => 'test')).toThrow('SecureTokenHandler has been disposed');
      await expect(tokenHandler.getToken()).rejects.toThrow('SecureTokenHandler has been disposed');
      expect(tokenHandler.hasToken()).toBe(false);
    });

    it('handles malformed obfuscated tokens gracefully', async () => {
      const secureHandler = new SecureTokenHandler({ enableSecureMode: true });
      secureHandler.setToken('Bearer test-token');

      // Corrupt the internal token data
      const internalData = (secureHandler as any).tokenEntry;
      internalData.value = 'corrupted-data-that-cannot-be-decoded!!!';

      // Should handle gracefully and return empty string
      const token = await secureHandler.getToken();
      expect(token).toBe('');

      secureHandler.dispose();
    });
  });

  describe('Header Sanitization', () => {
    it('sanitizes authorization headers', () => {
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer secret-token-123',
        'auth': 'api-key-456',
        'X-Custom': 'safe-value'
      };

      const sanitized = tokenHandler.sanitizeHeaders(headers);

      expect(sanitized['Content-Type']).toBe('application/json');
      expect(sanitized['X-Custom']).toBe('safe-value');
      expect(sanitized['Authorization']).not.toContain('secret-token-123');
      expect(sanitized['auth']).not.toContain('api-key-456');
      expect(sanitized['Authorization']).toContain('Bear');
      expect(sanitized['Authorization']).toContain('123');
      expect(sanitized['Authorization']).toContain('*');
    });

    it('preserves non-sensitive headers unchanged', () => {
      const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'test-client/1.0'
      };

      const sanitized = tokenHandler.sanitizeHeaders(headers);
      expect(sanitized).toEqual(headers);
    });
  });

  describe('Secure JSON Replacer', () => {
    it('creates replacer that handles circular references', () => {
      const replacer = tokenHandler.createSecureReplacer();
      
      const circular: any = { name: 'test' };
      circular.self = circular;

      const result = JSON.stringify(circular, replacer);
      expect(result).toContain('[Circular Reference]');
    });

    it('masks sensitive field names', () => {
      const replacer = tokenHandler.createSecureReplacer();
      
      const data = {
        token: 'secret-token-123',
        authorization: 'Bearer abc123',
        apikey: 'key-456',
        normalField: 'safe-value'
      };

      const result = JSON.stringify(data, replacer);
      const parsed = JSON.parse(result);

      expect(parsed.normalField).toBe('safe-value');
      expect(parsed.token).not.toContain('secret-token-123');
      expect(parsed.authorization).not.toContain('Bearer abc123');
      expect(parsed.apikey).not.toContain('key-456');
    });

    it('detects and masks token-like strings', () => {
      const replacer = tokenHandler.createSecureReplacer();
      
      const data = {
        bearerToken: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
        apiKey: 'sk_live_abcdef123456789abcdef123456789',
        uuid: '550e8400-e29b-41d4-a716-446655440000', // UUIDs not detected by simplified patterns
        shortValue: 'ok',
        normalValue: 'this is just text'
      };

      const result = JSON.stringify(data, replacer);
      const parsed = JSON.parse(result);

      expect(parsed.shortValue).toBe('ok'); // Too short to be considered a token
      expect(parsed.normalValue).toBe('this is just text'); // Normal text
      expect(parsed.bearerToken).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'); // Should be masked
      expect(parsed.apiKey).not.toContain('sk_live_abcdef123456789abcdef123456789'); // Should be masked
      expect(parsed.uuid).toBe('550e8400-e29b-41d4-a716-446655440000'); // UUIDs not detected in simplified version
    });
  });

  describe('Disposal and Cleanup', () => {
    it('securely clears token data on disposal', () => {
      tokenHandler.setToken('Bearer secret-token-to-clear');
      
      const internalData = (tokenHandler as any).tokenEntry;
      const originalValue = internalData.value;
      
      tokenHandler.dispose();
      
      // Token entry should be cleared
      expect((tokenHandler as any).tokenEntry).toBeNull();
    });

    it('removes serialization protection on disposal', () => {
      const secureHandler = new SecureTokenHandler({ enableSecureMode: true });
      secureHandler.setToken('Bearer test');

      // Should be protected initially
      expect(JSON.stringify(secureHandler)).toBe('"[SecureTokenHandler - Non-Serializable]"');

      secureHandler.dispose();

      // Protection should be modified (though handler is now unusable)
      // After disposal, serialization should work differently
      expect(() => JSON.stringify(secureHandler)).not.toThrow();
    });

    it('can be disposed multiple times safely', () => {
      expect(() => {
        tokenHandler.dispose();
        tokenHandler.dispose();
        tokenHandler.dispose();
      }).not.toThrow();
    });
  });

  describe('Cross-Platform Compatibility', () => {
    it('works when btoa/atob are not available', async () => {
      // Mock absence of browser APIs
      const originalBtoa = global.btoa;
      const originalAtob = global.atob;
      
      delete (global as any).btoa;
      delete (global as any).atob;

      try {
        const handler = new SecureTokenHandler({ enableSecureMode: true });
        handler.setToken('Bearer cross-platform-token');
        
        const retrieved = await handler.getToken();
        expect(retrieved).toBe('Bearer cross-platform-token');
        
        handler.dispose();
      } finally {
        // Restore original functions
        if (originalBtoa) global.btoa = originalBtoa;
        if (originalAtob) global.atob = originalAtob;
      }
    });

    it('handles environment without Buffer or browser APIs', async () => {
      // Mock absence of all encoding APIs
      const originalBtoa = global.btoa;
      const originalAtob = global.atob;
      const originalBuffer = global.Buffer;
      
      delete (global as any).btoa;
      delete (global as any).atob;
      delete (global as any).Buffer;

      try {
        const handler = new SecureTokenHandler({ enableSecureMode: true });
        handler.setToken('Bearer fallback-token');
        
        const retrieved = await handler.getToken();
        expect(retrieved).toBe('Bearer fallback-token');
        
        handler.dispose();
      } finally {
        // Restore original functions
        if (originalBtoa) global.btoa = originalBtoa;
        if (originalAtob) global.atob = originalAtob;
        if (originalBuffer) global.Buffer = originalBuffer;
      }
    });
  });

  describe('Token Masking', () => {
    it('masks short tokens completely', () => {
      const sanitized = tokenHandler.sanitizeHeaders({ auth: 'short' });
      expect(sanitized.auth).toBe('*****');
    });

    it('shows first and last characters for longer tokens', () => {
      const longToken = 'Bearer very-long-secret-token-123456789';
      const sanitized = tokenHandler.sanitizeHeaders({ Authorization: longToken });
      
      expect(sanitized.Authorization.startsWith('Bear')).toBe(true);
      expect(sanitized.Authorization.endsWith('789')).toBe(true);
      expect(sanitized.Authorization).toContain('*');
      expect(sanitized.Authorization).not.toContain('very-long-secret-token');
    });

    it('handles empty and null tokens gracefully', () => {
      const sanitized = tokenHandler.sanitizeHeaders({
        empty: '',
        normal: 'Bearer valid-token'
      });
      
      expect(sanitized.empty).toBe('');
      // The sanitizeHeaders method doesn't mask 'normal' field since it's not an auth field
      expect(sanitized.normal).toBe('Bearer valid-token'); // This field is not masked by sanitizeHeaders
      expect(sanitized.empty).toBe('');
    });
  });
});