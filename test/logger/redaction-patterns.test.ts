import { describe, it, expect } from 'vitest';
import { 
  BUILT_IN_PATTERNS, 
  PII_FIELD_NAMES, 
  isPIIFieldName, 
  getEnabledPatterns, 
  sortPatternsByPriority 
} from '../../src/logger/redaction-patterns.js';

describe('Redaction Patterns', () => {
  describe('BUILT_IN_PATTERNS', () => {
    it('contains expected pattern types', () => {
      const patternNames = BUILT_IN_PATTERNS.map(p => p.name);
      
      expect(patternNames).toContain('email');
      expect(patternNames).toContain('phone-us');
      expect(patternNames).toContain('ssn');
      expect(patternNames).toContain('credit-card');
      expect(patternNames).toContain('api-key');
      expect(patternNames).toContain('jwt');
    });

    it('has proper pattern structure', () => {
      BUILT_IN_PATTERNS.forEach(pattern => {
        expect(pattern).toHaveProperty('name');
        expect(pattern).toHaveProperty('pattern');
        expect(pattern).toHaveProperty('replacement');
        expect(pattern).toHaveProperty('description');
        expect(pattern).toHaveProperty('defaultEnabled');
        expect(pattern).toHaveProperty('priority');
        
        expect(typeof pattern.name).toBe('string');
        expect(pattern.pattern).toBeInstanceOf(RegExp);
        expect(typeof pattern.replacement).toBe('string');
        expect(typeof pattern.description).toBe('string');
        expect(typeof pattern.defaultEnabled).toBe('boolean');
        expect(['high', 'medium', 'low']).toContain(pattern.priority);
      });
    });
  });

  describe('Pattern Matching', () => {
    it('matches email addresses correctly', () => {
      const emailPattern = BUILT_IN_PATTERNS.find(p => p.name === 'email')!;
      
      expect('user@example.com'.match(emailPattern.pattern)).toBeTruthy();
      expect('test.email+tag@domain.co.uk'.match(emailPattern.pattern)).toBeTruthy();
      expect('simple@test.org'.match(emailPattern.pattern)).toBeTruthy();
      
      expect('not-an-email'.match(emailPattern.pattern)).toBeFalsy();
      expect('@missing-local.com'.match(emailPattern.pattern)).toBeFalsy();
      expect('missing-at-symbol.com'.match(emailPattern.pattern)).toBeFalsy();
    });

    it('matches US phone numbers correctly', () => {
      const phonePattern = BUILT_IN_PATTERNS.find(p => p.name === 'phone-us')!;
      
      expect('(555) 123-4567'.match(phonePattern.pattern)).toBeTruthy();
      expect('555-123-4567'.match(phonePattern.pattern)).toBeTruthy();
      expect('555.123.4567'.match(phonePattern.pattern)).toBeTruthy();
      expect('5551234567'.match(phonePattern.pattern)).toBeTruthy();
      expect('+1 555 123 4567'.match(phonePattern.pattern)).toBeTruthy();
      
      expect('123'.match(phonePattern.pattern)).toBeFalsy();
      expect('555-12-3456'.match(phonePattern.pattern)).toBeFalsy();
    });

    it('matches SSN patterns correctly', () => {
      const ssnPattern = BUILT_IN_PATTERNS.find(p => p.name === 'ssn')!;
      
      expect('123-45-6789'.match(ssnPattern.pattern)).toBeTruthy();
      expect('123.45.6789'.match(ssnPattern.pattern)).toBeTruthy();
      expect('123 45 6789'.match(ssnPattern.pattern)).toBeTruthy();
      expect('123456789'.match(ssnPattern.pattern)).toBeTruthy();
      
      expect('12-34-5678'.match(ssnPattern.pattern)).toBeFalsy();
      expect('1234-56-789'.match(ssnPattern.pattern)).toBeFalsy();
    });

    it('matches credit card patterns correctly', () => {
      const ccPattern = BUILT_IN_PATTERNS.find(p => p.name === 'credit-card')!;
      
      expect('1234 5678 9012 3456'.match(ccPattern.pattern)).toBeTruthy();
      expect('1234-5678-9012-3456'.match(ccPattern.pattern)).toBeTruthy();
      expect('1234.5678.9012.3456'.match(ccPattern.pattern)).toBeTruthy();
      expect('1234567890123456'.match(ccPattern.pattern)).toBeTruthy();
      
      expect('1234 5678 9012'.match(ccPattern.pattern)).toBeFalsy();
      expect('12345'.match(ccPattern.pattern)).toBeFalsy();
    });

    it('matches API key patterns correctly', () => {
      const apiKeyPattern = BUILT_IN_PATTERNS.find(p => p.name === 'api-key')!;
      
      // Test various API key formats
      expect('api_key: abc123def456ghi789jkl'.match(apiKeyPattern.pattern)).toBeTruthy();
      expect('API-KEY=XYZ789ABC123DEF456GHI012'.match(apiKeyPattern.pattern)).toBeTruthy();
      expect('access_token "Bearer123Token456ABC"'.match(apiKeyPattern.pattern)).toBeTruthy();
      expect('secret-key: very_long_secret_key_here_123456'.match(apiKeyPattern.pattern)).toBeTruthy();
      
      // These should not match (too short)
      expect('api_key: short'.match(apiKeyPattern.pattern)).toBeFalsy();
      expect('key: 123'.match(apiKeyPattern.pattern)).toBeFalsy();
    });

    it('matches JWT tokens correctly', () => {
      const jwtPattern = BUILT_IN_PATTERNS.find(p => p.name === 'jwt')!;
      const sampleJWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
      
      expect(sampleJWT.match(jwtPattern.pattern)).toBeTruthy();
      expect('eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.hash'.match(jwtPattern.pattern)).toBeTruthy();
      
      expect('not-a-jwt-token'.match(jwtPattern.pattern)).toBeFalsy();
      expect('eyJ.incomplete'.match(jwtPattern.pattern)).toBeFalsy();
    });
  });

  describe('PII Field Names', () => {
    it('contains expected field names', () => {
      expect(PII_FIELD_NAMES).toContain('password');
      expect(PII_FIELD_NAMES).toContain('email');
      expect(PII_FIELD_NAMES).toContain('phone');
      expect(PII_FIELD_NAMES).toContain('ssn');
      expect(PII_FIELD_NAMES).toContain('credit');
      expect(PII_FIELD_NAMES).toContain('token');
    });

    it('detects PII field names correctly', () => {
      // Direct matches
      expect(isPIIFieldName('password')).toBe(true);
      expect(isPIIFieldName('email')).toBe(true);
      expect(isPIIFieldName('token')).toBe(true);
      
      // Case insensitive
      expect(isPIIFieldName('PASSWORD')).toBe(true);
      expect(isPIIFieldName('Email')).toBe(true);
      expect(isPIIFieldName('TOKEN')).toBe(true);
      
      // Contains patterns
      expect(isPIIFieldName('userPassword')).toBe(true);
      expect(isPIIFieldName('emailAddress')).toBe(true);
      expect(isPIIFieldName('authToken')).toBe(true);
      
      // Underscore and hyphen patterns
      expect(isPIIFieldName('user_password')).toBe(true);
      expect(isPIIFieldName('auth-token')).toBe(true);
      expect(isPIIFieldName('email_address')).toBe(true);
      
      // Non-PII fields
      expect(isPIIFieldName('username')).toBe(true); // Contains 'user'
      expect(isPIIFieldName('timestamp')).toBe(false);
      expect(isPIIFieldName('count')).toBe(false);
      expect(isPIIFieldName('status')).toBe(false);
    });
  });

  describe('Pattern Management', () => {
    it('gets enabled patterns by default', () => {
      const patterns = getEnabledPatterns();
      const enabledByDefault = BUILT_IN_PATTERNS.filter(p => p.defaultEnabled);
      
      expect(patterns).toHaveLength(enabledByDefault.length);
      patterns.forEach(pattern => {
        expect(pattern.defaultEnabled).toBe(true);
      });
    });

    it('filters by enabled patterns list', () => {
      const enabledPatterns = ['email', 'phone-us'];
      const patterns = getEnabledPatterns(enabledPatterns);
      
      expect(patterns).toHaveLength(2);
      expect(patterns.map(p => p.name)).toEqual(['email', 'phone-us']);
    });

    it('filters by disabled patterns list', () => {
      const disabledPatterns = ['ipv4', 'high-entropy'];
      const patterns = getEnabledPatterns(undefined, disabledPatterns);
      
      patterns.forEach(pattern => {
        expect(disabledPatterns).not.toContain(pattern.name);
      });
    });

    it('sorts patterns by priority correctly', () => {
      const testPatterns = [
        { name: 'low1', priority: 'low' as const, pattern: /test/, replacement: '', description: '', defaultEnabled: true },
        { name: 'high1', priority: 'high' as const, pattern: /test/, replacement: '', description: '', defaultEnabled: true },
        { name: 'medium1', priority: 'medium' as const, pattern: /test/, replacement: '', description: '', defaultEnabled: true },
        { name: 'high2', priority: 'high' as const, pattern: /test/, replacement: '', description: '', defaultEnabled: true },
      ];
      
      const sorted = sortPatternsByPriority(testPatterns);
      
      expect(sorted[0].priority).toBe('high');
      expect(sorted[1].priority).toBe('high');
      expect(sorted[2].priority).toBe('medium');
      expect(sorted[3].priority).toBe('low');
    });

    it('maintains secondary sort by name', () => {
      const testPatterns = [
        { name: 'zebra', priority: 'high' as const, pattern: /test/, replacement: '', description: '', defaultEnabled: true },
        { name: 'alpha', priority: 'high' as const, pattern: /test/, replacement: '', description: '', defaultEnabled: true },
      ];
      
      const sorted = sortPatternsByPriority(testPatterns);
      
      expect(sorted[0].name).toBe('alpha');
      expect(sorted[1].name).toBe('zebra');
    });
  });

  describe('Pattern Effectiveness', () => {
    it('handles global flag patterns correctly', () => {
      const emailPattern = BUILT_IN_PATTERNS.find(p => p.name === 'email')!;
      const text = 'Contact user@example.com or admin@test.org for help';
      
      const matches = text.match(emailPattern.pattern);
      expect(matches).toHaveLength(2);
      
      const redacted = text.replace(emailPattern.pattern, emailPattern.replacement);
      expect(redacted).toBe('Contact <email> or <email> for help');
    });

    it('preserves context in URL parameter redaction', () => {
      const urlPattern = BUILT_IN_PATTERNS.find(p => p.name === 'url-params')!;
      const url = 'https://example.com?user=john&email=john@example.com&public=data';
      
      const redacted = url.replace(urlPattern.pattern, urlPattern.replacement);
      expect(redacted).toContain('user=<redacted>');
      expect(redacted).toContain('email=<redacted>');
      expect(redacted).toContain('public=data'); // Should not be redacted
    });
  });
});