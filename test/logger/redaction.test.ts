import { describe, it, expect, beforeEach, vi } from 'vitest';
import { 
  RedactionEngine, 
  getRedactionEngine, 
  redactString, 
  redactObject, 
  redactArgs 
} from '../../src/logger/redaction.js';

describe('Redaction System', () => {
  let engine: RedactionEngine;

  beforeEach(() => {
    engine = new RedactionEngine();
  });

  describe('RedactionEngine Construction', () => {
    it('creates engine with default config', () => {
      const defaultEngine = new RedactionEngine();
      const stats = defaultEngine.getStats();
      
      expect(stats.totalOperations).toBe(0);
      expect(stats.totalTimeMs).toBe(0);
      expect(stats.averageTimeMs).toBe(0);
    });

    it('creates engine with custom config', () => {
      const customEngine = new RedactionEngine({
        mode: 'strict',
        enabled: true,
        hashRedaction: true
      });
      
      expect(customEngine).toBeDefined();
    });

    it('creates engine with disabled redaction', () => {
      const disabledEngine = new RedactionEngine({ mode: 'off' });
      
      const result = disabledEngine.redactString('test@example.com');
      expect(result).toBe('test@example.com'); // Should not be redacted
    });
  });

  describe('String Redaction', () => {
    it('redacts email addresses', () => {
      const input = 'Contact user@example.com for support';
      const result = engine.redactString(input);
      
      expect(result).toBe('Contact <email> for support');
    });

    it('redacts multiple PII types in one string', () => {
      const input = 'User: john@example.com, Phone: (555) 123-4567, SSN: 123-45-6789';
      const result = engine.redactString(input);
      
      expect(result).toContain('<email>');
      expect(result).toContain('<phone>');
      expect(result).toContain('<ssn>');
      expect(result).not.toContain('john@example.com');
      expect(result).not.toContain('(555) 123-4567');
      expect(result).not.toContain('123-45-6789');
    });

    it('handles strings with no PII', () => {
      const input = 'This is a normal log message with no sensitive data';
      const result = engine.redactString(input);
      
      expect(result).toBe(input);
    });

    it('handles empty and null strings', () => {
      expect(engine.redactString('')).toBe('');
      expect(engine.redactString(null as any)).toBe(null);
      expect(engine.redactString(undefined as any)).toBe(undefined);
    });

    it('redacts API keys and tokens', () => {
      const input = 'API_KEY=abc123def456ghi789jkl012 and access_token: "Bearer987654321token"';
      const result = engine.redactString(input);
      
      expect(result).toContain('<api-key>');
      expect(result).not.toContain('abc123def456ghi789jkl012');
    });

    it('redacts JWT tokens', () => {
      const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
      const input = `Authorization: Bearer ${jwt}`;
      const result = engine.redactString(input);
      
      expect(result).toContain('<jwt>');
      expect(result).not.toContain(jwt);
    });
  });

  describe('Object Redaction', () => {
    it('redacts PII field names', () => {
      const input = {
        username: 'john_doe',
        password: 'secret123',
        email: 'john@example.com',
        normalField: 'normal_value'
      };
      
      const result = engine.redactObject(input);
      
      expect(result.username).toBe('<redacted>');
      expect(result.password).toBe('<redacted>');
      expect(result.email).toBe('<redacted>');
      expect(result.normalField).toBe('normal_value');
    });

    it('redacts nested objects with PII-sensitive field names', () => {
      const input = {
        user: {
          name: 'John Doe',
          email: 'john@example.com',
          credentials: {
            password: 'secret',
            token: 'abc123'
          }
        },
        metadata: {
          timestamp: '2024-01-01',
          version: '1.0'
        }
      };
      
      const result = engine.redactObject(input);
      
      // 'user' field is detected as PII, so entire object is redacted for security
      expect(result.user).toBe('<redacted>');
      expect(result.metadata.timestamp).toBe('2024-01-01');
      expect(result.metadata.version).toBe('1.0');
    });

    it('redacts individual fields within non-PII objects', () => {
      const input = {
        person: { // 'person' is not a PII field name
          name: 'John Doe',
          email: 'john@example.com',
          contact: {
            password: 'secret',
            token: 'abc123'
          }
        },
        metadata: {
          timestamp: '2024-01-01',
          version: '1.0'
        }
      };
      
      const result = engine.redactObject(input);
      
      // 'person' is not PII, so we redact individual fields
      expect(result.person.name).toBe('John Doe');
      expect(result.person.email).toBe('<redacted>');
      expect(result.person.contact.password).toBe('<redacted>');
      expect(result.person.contact.token).toBe('<redacted>');
      expect(result.metadata.timestamp).toBe('2024-01-01');
      expect(result.metadata.version).toBe('1.0');
    });

    it('redacts arrays containing objects', () => {
      const input = {
        people: [ // 'people' is not a PII field name
          { name: 'John', email: 'john@test.com' },
          { name: 'Jane', email: 'jane@test.com' }
        ]
      };
      
      const result = engine.redactObject(input);
      
      expect(result.people[0].name).toBe('John');
      expect(result.people[0].email).toBe('<redacted>');
      expect(result.people[1].name).toBe('Jane');
      expect(result.people[1].email).toBe('<redacted>');
    });

    it('redacts string content within objects', () => {
      const input = {
        content: 'User email is user@example.com', // 'content' is not a PII field
        description: 'Phone: (555) 123-4567'        // 'description' is not a PII field
      };
      
      const result = engine.redactObject(input);
      
      expect(result.content).toBe('User email is <email>');
      expect(result.description).toBe('Phone: <phone>');
    });

    it('handles primitive values', () => {
      expect(engine.redactObject('test@example.com')).toBe('<email>');
      expect(engine.redactObject(123)).toBe(123);
      expect(engine.redactObject(true)).toBe(true);
      expect(engine.redactObject(null)).toBe(null);
      expect(engine.redactObject(undefined)).toBe(undefined);
    });
  });

  describe('Args Redaction', () => {
    it('redacts array of mixed arguments', () => {
      const args = [
        'User logged in',
        { username: 'john', password: 'secret' },
        'email: user@example.com',
        { metadata: { token: 'abc123' } }
      ];
      
      const result = engine.redactArgs(args);
      
      expect(result[0]).toBe('User logged in');
      expect(result[1].username).toBe('<redacted>');
      expect(result[1].password).toBe('<redacted>');
      expect(result[2]).toBe('email: <email>');
      expect(result[3].metadata.token).toBe('<redacted>');
    });

    it('handles empty args array', () => {
      expect(engine.redactArgs([])).toEqual([]);
    });

    it('handles non-array input gracefully', () => {
      expect(engine.redactArgs(null as any)).toBe(null);
      expect(engine.redactArgs(undefined as any)).toBe(undefined);
    });
  });

  describe('Hash-based Redaction', () => {
    it('uses hash redaction when enabled', () => {
      const hashEngine = new RedactionEngine({ hashRedaction: true });
      
      const input = { password: 'secret123' };
      const result = hashEngine.redactObject(input);
      
      expect(result.password).toMatch(/^<hash:[a-f0-9]{8}>$/);
    });

    it('produces consistent hashes for same input', () => {
      const hashEngine = new RedactionEngine({ hashRedaction: true });
      
      const input1 = { password: 'secret123' };
      const input2 = { password: 'secret123' };
      
      const result1 = hashEngine.redactObject(input1);
      const result2 = hashEngine.redactObject(input2);
      
      expect(result1.password).toBe(result2.password);
    });

    it('produces different hashes for different inputs', () => {
      const hashEngine = new RedactionEngine({ hashRedaction: true });
      
      const input1 = { password: 'secret123' };
      const input2 = { password: 'different456' };
      
      const result1 = hashEngine.redactObject(input1);
      const result2 = hashEngine.redactObject(input2);
      
      expect(result1.password).not.toBe(result2.password);
    });
  });

  describe('Differential Privacy', () => {
    it('adds noise to numeric values when enabled', () => {
      const dpEngine = new RedactionEngine({ differentialPrivacy: true });
      
      const originalValue = 100;
      const noisyValue = dpEngine.addDifferentialPrivacyNoise(originalValue);
      
      // Should add some noise (very unlikely to be exactly the same)
      expect(noisyValue).not.toBe(originalValue);
      expect(typeof noisyValue).toBe('number');
    });

    it('returns original value when disabled', () => {
      const originalValue = 100;
      const result = engine.addDifferentialPrivacyNoise(originalValue);
      
      expect(result).toBe(originalValue);
    });
  });

  describe('Redaction Modes', () => {
    it('strict mode enables all patterns', () => {
      const strictEngine = new RedactionEngine({ mode: 'strict' });
      const input = '127.0.0.1 and user@example.com';
      const result = strictEngine.redactString(input);
      
      // Strict mode might redact IP addresses that balanced mode wouldn't
      expect(result).toContain('<email>');
    });

    it('permissive mode only uses high priority patterns', () => {
      const permissiveEngine = new RedactionEngine({ mode: 'permissive' });
      const input = 'user@example.com and some data';
      const result = permissiveEngine.redactString(input);
      
      expect(result).toContain('<email>'); // Email should still be redacted (high priority)
    });

    it('off mode disables all redaction', () => {
      const offEngine = new RedactionEngine({ mode: 'off' });
      const input = { password: 'secret', email: 'test@example.com' };
      const result = offEngine.redactObject(input);
      
      expect(result).toEqual(input); // Should be unchanged
    });
  });

  describe('Custom Redaction', () => {
    it('applies custom redaction function', () => {
      const customEngine = new RedactionEngine({
        customRedactor: (input: string) => input.replace(/CUSTOM_SECRET/g, '<custom>')
      });
      
      const input = 'This contains CUSTOM_SECRET data';
      const result = customEngine.redactString(input);
      
      expect(result).toBe('This contains <custom> data');
    });

    it('applies custom redaction after pattern redaction', () => {
      const customEngine = new RedactionEngine({
        customRedactor: (input: string) => input.replace(/USER_ID/g, '<user-id>')
      });
      
      const input = 'USER_ID: 123, email: test@example.com';
      const result = customEngine.redactString(input);
      
      expect(result).toContain('<user-id>');
      expect(result).toContain('<email>');
    });
  });

  describe('Performance and Statistics', () => {
    it('tracks redaction statistics', () => {
      const input = 'Contact user@example.com or admin@test.org';
      engine.redactString(input);
      
      const stats = engine.getStats();
      expect(stats.totalOperations).toBe(1);
      expect(stats.totalTimeMs).toBeGreaterThan(0);
      expect(stats.patternHits['email']).toBe(2);
    });

    it('resets statistics correctly', () => {
      engine.redactString('test@example.com');
      engine.resetStats();
      
      const stats = engine.getStats();
      expect(stats.totalOperations).toBe(0);
      expect(stats.totalTimeMs).toBe(0);
      expect(stats.patternHits).toEqual({});
    });

    it('tracks field redaction hits', () => {
      const input = { email: 'test@example.com', password: 'secret' };
      engine.redactObject(input);
      
      const stats = engine.getStats();
      expect(stats.fieldHits['email']).toBe(1);
      expect(stats.fieldHits['password']).toBe(1);
    });
  });

  describe('PII Validation (Development)', () => {
    it('validates potential PII and returns warnings', () => {
      const input = 'User: john@example.com, Phone: (555) 123-4567';
      const warnings = engine.validateForPII(input, 'user registration');
      
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings.some(w => w.includes('email'))).toBe(true);
      expect(warnings.some(w => w.includes('phone'))).toBe(true);
      expect(warnings.some(w => w.includes('user registration'))).toBe(true);
    });

    it('returns empty warnings for clean input', () => {
      const input = 'This is a clean log message with no PII';
      const warnings = engine.validateForPII(input);
      
      expect(warnings).toEqual([]);
    });
  });

  describe('Global Functions', () => {
    it('provides global redaction engine', () => {
      const globalEngine = getRedactionEngine();
      expect(globalEngine).toBeInstanceOf(RedactionEngine);
      
      // Should return same instance on subsequent calls
      const sameEngine = getRedactionEngine();
      expect(sameEngine).toBe(globalEngine);
    });

    it('creates new engine when config provided', () => {
      const globalEngine = getRedactionEngine();
      const customEngine = getRedactionEngine({ mode: 'strict' });
      
      expect(customEngine).not.toBe(globalEngine);
    });

    it('provides convenience redaction functions', () => {
      expect(redactString('test@example.com')).toBe('<email>');
      expect(redactObject({ password: 'secret' })).toEqual({ password: '<redacted>' });
      expect(redactArgs(['test@example.com'])).toEqual(['<email>']);
    });
  });

  describe('Edge Cases', () => {
    it('handles circular references gracefully', () => {
      const circular: any = { name: 'test' };
      circular.self = circular;
      
      // Should not throw but may not fully redact circular structure
      expect(() => engine.redactObject(circular)).not.toThrow();
    });

    it('handles very large objects efficiently', () => {
      const largeObject: any = {};
      for (let i = 0; i < 1000; i++) {
        largeObject[`field${i}`] = `value${i}`;
      }
      largeObject.email = 'test@example.com'; // Add one PII field
      
      const result = engine.redactObject(largeObject);
      expect(result.email).toBe('<redacted>');
      expect(Object.keys(result)).toHaveLength(1001);
    });

    it('handles special characters in strings', () => {
      const input = 'Email: test@example.com\nPhone: (555) 123-4567\tToken: abc123';
      const result = engine.redactString(input);
      
      expect(result).toContain('<email>');
      expect(result).toContain('<phone>');
      expect(result).toContain('\n'); // Preserves newlines
      expect(result).toContain('\t'); // Preserves tabs
    });
  });
});