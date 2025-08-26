/**
 * Comprehensive tests for ErrorMessageSanitizer
 * 
 * Tests production-grade error message sanitization including:
 * - Token detection and masking
 * - PII detection and redaction  
 * - Custom pattern matching
 * - Cross-platform compatibility
 * - Performance and edge cases
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ErrorMessageSanitizer } from '../../src/transports/error-sanitizer.js';

describe('ErrorMessageSanitizer', () => {
  let sanitizer: ErrorMessageSanitizer;

  beforeEach(() => {
    sanitizer = new ErrorMessageSanitizer();
  });

  describe('Token Detection and Sanitization', () => {
    it('detects and sanitizes JWT tokens', () => {
      const jwtToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
      const errorMessage = `Authentication failed with token: ${jwtToken}`;
      
      const sanitized = sanitizer.sanitize(errorMessage);
      
      expect(sanitized).not.toContain(jwtToken);
      expect(sanitized).toContain('Authentication failed');
      expect(sanitized).toMatch(/eyJ.*\*+.*w5c/); // Should show partial token
    });

    it('detects and sanitizes Bearer tokens', () => {
      const bearerToken = 'Bearer abc123def456ghi789';
      const errorMessage = `Request failed: ${bearerToken}`;
      
      const sanitized = sanitizer.sanitize(errorMessage);
      
      expect(sanitized).not.toContain('abc123def456ghi789');
      expect(sanitized).toContain('Request failed');
    });

    it('detects and sanitizes AWS access keys', () => {
      const awsKey = 'AKIAIOSFODNN7EXAMPLE';
      const errorMessage = `AWS Error: Invalid access key ${awsKey}`;
      
      const sanitized = sanitizer.sanitize(errorMessage);
      
      expect(sanitized).not.toContain(awsKey);
      expect(sanitized).toContain('AWS Error');
    });

    it('allows users to add GitHub token detection via customPatterns', () => {
      const githubToken = 'ghp_1234567890abcdef1234567890abcdef12345678';
      const errorMessage = `GitHub API error with token ${githubToken}`;
      
      // User must provide their own GitHub token pattern
      const customSanitizer = new ErrorMessageSanitizer({
        customPatterns: [/\bgh[ps]_[A-Za-z0-9_]{36,40}\b/g]
      });
      
      const sanitized = customSanitizer.sanitize(errorMessage);
      
      expect(sanitized).not.toContain(githubToken);
      expect(sanitized).toContain('GitHub API error');
    });

    it('demonstrates user-defined patterns for multiple token types', () => {
      const githubToken = 'ghp_1234567890abcdef1234567890abcdef12345678';
      const slackToken = 'xoxb-123456789012-123456789012-abcdef123456789012345678';
      const errorMessage = `Errors: GitHub ${githubToken}, Slack ${slackToken}`;
      
      // Users can add multiple custom patterns as needed
      const customSanitizer = new ErrorMessageSanitizer({
        customPatterns: [
          /\bgh[ps]_[A-Za-z0-9_]{36,40}\b/g, // GitHub tokens
          /\bxox[baprs]-(?:[0-9]{12}-)?[0-9]{12}-[a-zA-Z0-9]{24,}\b/g // Slack tokens
        ]
      });
      
      const sanitized = customSanitizer.sanitize(errorMessage);
      
      expect(sanitized).not.toContain(githubToken);
      expect(sanitized).not.toContain(slackToken);
      expect(sanitized).toContain('Errors:');
    });

    it('detects and sanitizes API keys in key-value format', () => {
      const errorMessage = 'Connection failed: api_key="sk_test_1234567890abcdef1234567890"';
      
      const sanitized = sanitizer.sanitize(errorMessage);
      
      expect(sanitized).not.toContain('sk_test_1234567890abcdef1234567890');
      expect(sanitized).toContain('Connection failed');
      expect(sanitized).toContain('api_key=');
    });

    it('detects and sanitizes multiple tokens in one message', () => {
      const errorMessage = 'Auth failed: token="Bearer abc123" and api_key="def456"';
      
      const sanitized = sanitizer.sanitize(errorMessage);
      
      expect(sanitized).not.toContain('abc123');
      expect(sanitized).not.toContain('def456');
      expect(sanitized).toContain('Auth failed');
    });
  });

  describe('Custom Patterns for PII Detection', () => {
    it('basic PII patterns work out of the box', () => {
      const errorMessage = 'User authentication failed for user@example.com';
      
      const sanitized = sanitizer.sanitize(errorMessage);
      
      expect(sanitized).not.toContain('user@example.com');
      expect(sanitized).toContain('User authentication failed');
    });

    it('basic PII patterns detect emails, phones, and credit cards', () => {
      const errorMessage = 'Error: email user@test.com, phone +1-555-123-4567, card 4111111111111111';
      
      const sanitized = sanitizer.sanitize(errorMessage);
      
      expect(sanitized).not.toContain('user@test.com');
      expect(sanitized).not.toContain('+1-555-123-4567');
      expect(sanitized).not.toContain('4111111111111111');
      expect(sanitized).toContain('Error:');
    });

    it('demonstrates how users can add custom patterns beyond basic PII', () => {
      const errorMessage = 'Database error: SSN 123-45-6789, IP 192.168.1.1, MAC 00:1B:44:11:3A:B7';
      
      // User adds custom patterns for additional sensitive data
      const customSanitizer = new ErrorMessageSanitizer({
        customPatterns: [
          /\b\d{3}-\d{2}-\d{4}\b/g, // SSN
          /\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/g, // IP addresses
          /\b[0-9A-Fa-f]{2}:[0-9A-Fa-f]{2}:[0-9A-Fa-f]{2}:[0-9A-Fa-f]{2}:[0-9A-Fa-f]{2}:[0-9A-Fa-f]{2}\b/g // MAC addresses
        ]
      });
      
      const sanitized = customSanitizer.sanitize(errorMessage);
      
      expect(sanitized).not.toContain('123-45-6789');
      expect(sanitized).not.toContain('192.168.1.1');
      expect(sanitized).not.toContain('00:1B:44:11:3A:B7');
      expect(sanitized).toContain('Database error:');
    });
  });

  describe('Configuration Options', () => {
    it('can disable token detection', () => {
      const noTokenSanitizer = new ErrorMessageSanitizer({
        enableTokenDetection: false
      });
      
      const jwtToken = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.abc123';
      const errorMessage = `Token error: ${jwtToken}`;
      
      const sanitized = noTokenSanitizer.sanitize(errorMessage);
      
      // Should not sanitize tokens when disabled
      expect(sanitized).toContain(jwtToken);
    });


    it('supports custom replacement strategy: redact', () => {
      const redactSanitizer = new ErrorMessageSanitizer({
        replacementStrategy: 'redact'
      });
      
      const errorMessage = 'Token error: Bearer abc123';
      
      const sanitized = redactSanitizer.sanitize(errorMessage);
      
      expect(sanitized).toContain('[REDACTED]');
      expect(sanitized).not.toContain('abc123');
    });

    it('supports custom replacement strategy: hash', () => {
      const hashSanitizer = new ErrorMessageSanitizer({
        replacementStrategy: 'hash'
      });
      
      const errorMessage = 'API key: sk_test_abc123';
      
      const sanitized = hashSanitizer.sanitize(errorMessage);
      
      expect(sanitized).toMatch(/\[HASH:[a-f0-9]+\]/);
      expect(sanitized).not.toContain('sk_test_abc123');
    });

    it('supports custom sensitive fields', () => {
      const customSanitizer = new ErrorMessageSanitizer({
        sensitiveFields: ['custom_field', 'secret_data']
      });
      
      const errorMessage = 'Error: custom_field="sensitive123" failed';
      
      const sanitized = customSanitizer.sanitize(errorMessage);
      
      expect(sanitized).not.toContain('sensitive123');
      expect(sanitized).toContain('custom_field=');
    });

    it('supports custom patterns', () => {
      const customPatternSanitizer = new ErrorMessageSanitizer({
        customPatterns: [/CUSTOM-\d{4}-[A-Z]{4}/g]
      });
      
      const errorMessage = 'Invalid code: CUSTOM-1234-ABCD';
      
      const sanitized = customPatternSanitizer.sanitize(errorMessage);
      
      expect(sanitized).not.toContain('CUSTOM-1234-ABCD');
      expect(sanitized).toContain('Invalid code');
    });

    it('supports custom mask reveal length', () => {
      const shortMaskSanitizer = new ErrorMessageSanitizer({
        maskRevealLength: 4
      });
      
      const errorMessage = 'Token: verylongtoken123456789';
      
      const sanitized = shortMaskSanitizer.sanitize(errorMessage);
      
      // Should reveal less characters with shorter mask length
      expect(sanitized).toMatch(/ve.*\*+.*89/);
    });
  });

  describe('Sensitive Data Detection', () => {
    it('correctly identifies sensitive data', () => {
      const sensitiveMessage = 'API call failed with token Bearer abc123';
      const nonSensitiveMessage = 'Connection timeout after 30 seconds';
      
      expect(sanitizer.hasSensitiveData(sensitiveMessage)).toBe(true);
      expect(sanitizer.hasSensitiveData(nonSensitiveMessage)).toBe(false);
    });

    it('analyzes sensitive data types', () => {
      const message = 'Multi-error: Bearer token123 and email user@test.com failed';
      
      const analysis = sanitizer.analyzeSensitiveData(message);
      
      expect(analysis.bearer).toBe(1);
      expect(analysis.email).toBe(1);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('handles null and undefined input', () => {
      expect(sanitizer.sanitize('')).toBe('');
      expect(sanitizer.sanitize(null as any)).toBe('null');
      expect(sanitizer.sanitize(undefined as any)).toBe('undefined');
    });

    it('handles non-string input', () => {
      expect(sanitizer.sanitize(123 as any)).toBe('123');
      expect(sanitizer.sanitize({} as any)).toBe('[object Object]');
    });

    it('handles very long strings', () => {
      const longString = 'Error: token=' + 'a'.repeat(10000);
      
      const sanitized = sanitizer.sanitize(longString);
      
      expect(sanitized).toContain('Error: token=');
      expect(sanitized.length).toBeLessThan(longString.length);
    });

    it('handles strings with special regex characters', () => {
      const specialChars = 'Error: token="(.*+?^${}[]|\\)"';
      
      const sanitized = sanitizer.sanitize(specialChars);
      
      // Should handle without throwing regex errors
      expect(sanitized).toContain('Error');
    });

    it('gracefully handles sanitization errors', () => {
      // Create a sanitizer that might fail
      const faultySanitizer = new ErrorMessageSanitizer({
        customPatterns: [null as any] // Invalid pattern
      });
      
      const errorMessage = 'Some error message';
      
      // Should not throw, should return safe fallback
      const sanitized = faultySanitizer.sanitize(errorMessage);
      expect(typeof sanitized).toBe('string');
    });
  });

  describe('Performance Considerations', () => {
    it('performs efficiently on large inputs', () => {
      const largeMessage = 'Connection failed: ' + 'x'.repeat(50000) + ' token=Bearer abc123';
      
      const start = Date.now();
      const sanitized = sanitizer.sanitize(largeMessage);
      const duration = Date.now() - start;
      
      expect(duration).toBeLessThan(100); // Should complete within 100ms
      expect(sanitized).not.toContain('abc123');
    });

    it('performs efficiently with many patterns', () => {
      const message = 'Multi-token error: Bearer abc123, API key def456, JWT ghi789.xyz012.uvw345';
      
      const start = Date.now();
      const sanitized = sanitizer.sanitize(message);
      const duration = Date.now() - start;
      
      expect(duration).toBeLessThan(50); // Should be fast even with multiple matches
      expect(sanitized).not.toContain('abc123');
      expect(sanitized).not.toContain('def456');
    });
  });

  describe('Real-world Error Message Patterns', () => {
    it('sanitizes database connection errors', () => {
      const dbError = 'Connection failed: mongodb://user:password123@localhost:27017/mydb';
      
      const sanitized = sanitizer.sanitize(dbError);
      
      expect(sanitized).not.toContain('password123');
      expect(sanitized).toContain('Connection failed');
    });

    it('sanitizes HTTP authorization errors', () => {
      const httpError = 'HTTP 401: Authorization header "Bearer eyJhbGci..." is invalid';
      
      const sanitized = sanitizer.sanitize(httpError);
      
      expect(sanitized).not.toContain('eyJhbGci');
      expect(sanitized).toContain('HTTP 401');
    });

    it('sanitizes webhook payload errors', () => {
      const webhookError = 'Webhook failed: {"api_key": "sk_live_abc123", "user": "user@example.com"}';
      
      const sanitized = sanitizer.sanitize(webhookError);
      
      expect(sanitized).not.toContain('sk_live_abc123');
      expect(sanitized).not.toContain('user@example.com');
      expect(sanitized).toContain('Webhook failed');
    });

    it('sanitizes cloud service errors', () => {
      const cloudError = 'AWS S3 Error: Access key AKIAIOSFODNN7EXAMPLE invalid for bucket access';
      
      const sanitized = sanitizer.sanitize(cloudError);
      
      expect(sanitized).not.toContain('AKIAIOSFODNN7EXAMPLE');
      expect(sanitized).toContain('AWS S3 Error');
    });

    it('sanitizes payment processing errors', () => {
      const paymentError = 'Payment declined: card 4111111111111111 insufficient funds';
      
      const sanitized = sanitizer.sanitize(paymentError);
      
      expect(sanitized).not.toContain('4111111111111111');
      expect(sanitized).toContain('Payment declined');
    });
  });

  describe('Cross-platform Compatibility', () => {
    it('works without btoa/atob functions', () => {
      // Mock absence of browser functions
      const originalBtoa = globalThis.btoa;
      const originalAtob = globalThis.atob;
      
      // @ts-expect-error - Intentionally removing for test
      delete globalThis.btoa;
      // @ts-expect-error - Intentionally removing for test
      delete globalThis.atob;
      
      try {
        const sanitizer = new ErrorMessageSanitizer();
        const result = sanitizer.sanitize('Token: Bearer abc123');
        
        expect(result).not.toContain('abc123');
        expect(result).toContain('Token:');
      } finally {
        // Restore functions
        if (originalBtoa) globalThis.btoa = originalBtoa;
        if (originalAtob) globalThis.atob = originalAtob;
      }
    });
  });
});