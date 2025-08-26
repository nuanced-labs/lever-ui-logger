import { describe, it, expect } from 'vitest';
import { 
  DEFAULT_LOG_LEVEL, 
  LOG_LEVEL_PRIORITY, 
  mergeConfig, 
  shouldLog, 
  passesSampling 
} from '../../src/logger/logger-config.js';

describe('Logger Configuration', () => {
  describe('Constants', () => {
    it('has correct default log level', () => {
      expect(DEFAULT_LOG_LEVEL).toBe('info');
    });

    it('has correct log level priorities', () => {
      expect(LOG_LEVEL_PRIORITY).toEqual({
        trace: 0,
        debug: 1,
        info: 2,
        warn: 3,
        error: 4
      });
    });
  });

  describe('mergeConfig', () => {
    it('returns default config when no user config provided', () => {
      const config = mergeConfig();
      
      expect(config.level).toBe('info');
      expect(config.component).toBe('default');
      expect(config.defaultContext).toEqual({});
      expect(config.transports).toEqual([]);
      expect(config.captureUnhandledErrors).toBe(false);
    });

    it('merges user config with defaults', () => {
      const userConfig = {
        level: 'debug' as const,
        component: 'test-component',
        defaultContext: { userId: '123' }
      };
      
      const config = mergeConfig(userConfig);
      
      expect(config.level).toBe('debug');
      expect(config.component).toBe('test-component');
      expect(config.defaultContext).toEqual({ userId: '123' });
      expect(config.captureUnhandledErrors).toBe(false); // Default preserved
    });

    it('merges nested objects correctly', () => {
      const userConfig = {
        defaultContext: { service: 'auth', version: '1.0' },
        sampling: { debug: 0.5, error: 1.0 },
        redaction: { enabled: true, mode: 'strict' as const }
      };
      
      const config = mergeConfig(userConfig);
      
      expect(config.defaultContext).toEqual({ service: 'auth', version: '1.0' });
      expect(config.sampling).toEqual({
        trace: 1.0,  // Default
        debug: 0.5,  // User override
        info: 1.0,   // Default
        warn: 1.0,   // Default
        error: 1.0   // User override
      });
      expect(config.redaction).toEqual(
        expect.objectContaining({
          enabled: true,
          mode: 'strict',
          patterns: [] // Default preserved
        })
      );
    });

    it('merges redaction patterns arrays', () => {
      const userConfig = {
        redaction: {
          patterns: [
            { pattern: /test/, replacement: '<test>', description: 'Test pattern' }
          ]
        }
      };
      
      const config = mergeConfig(userConfig);
      
      expect(config.redaction.patterns).toHaveLength(1);
      expect(config.redaction.patterns![0].replacement).toBe('<test>');
    });
  });

  describe('shouldLog', () => {
    it('allows logs at or above minimum level', () => {
      expect(shouldLog('trace', 'trace')).toBe(true);
      expect(shouldLog('debug', 'trace')).toBe(true);
      expect(shouldLog('info', 'trace')).toBe(true);
      expect(shouldLog('warn', 'trace')).toBe(true);
      expect(shouldLog('error', 'trace')).toBe(true);
    });

    it('filters logs below minimum level', () => {
      expect(shouldLog('trace', 'info')).toBe(false);
      expect(shouldLog('debug', 'info')).toBe(false);
      expect(shouldLog('info', 'info')).toBe(true);
      expect(shouldLog('warn', 'info')).toBe(true);
      expect(shouldLog('error', 'info')).toBe(true);
    });

    it('handles edge cases correctly', () => {
      expect(shouldLog('error', 'trace')).toBe(true);  // Highest to lowest
      expect(shouldLog('trace', 'error')).toBe(false); // Lowest to highest
      expect(shouldLog('warn', 'warn')).toBe(true);    // Same level
    });
  });

  describe('passesSampling', () => {
    it('passes sampling when rate is 1.0', () => {
      const originalRandom = Math.random;
      Math.random = () => 0.5; // Any value should pass
      
      expect(passesSampling('info', { info: 1.0 })).toBe(true);
      expect(passesSampling('error', { error: 1.0 })).toBe(true);
      
      Math.random = originalRandom;
    });

    it('fails sampling when rate is 0.0', () => {
      const originalRandom = Math.random;
      Math.random = () => 0.1; // Low value should still fail
      
      expect(passesSampling('debug', { debug: 0.0 })).toBe(false);
      
      Math.random = originalRandom;
    });

    it('applies sampling rate correctly', () => {
      const originalRandom = Math.random;
      
      Math.random = () => 0.3; // 30%
      expect(passesSampling('info', { info: 0.5 })).toBe(true);  // Passes 50% sampling
      expect(passesSampling('debug', { debug: 0.2 })).toBe(false); // Fails 20% sampling
      
      Math.random = () => 0.7; // 70%
      expect(passesSampling('warn', { warn: 0.8 })).toBe(true);  // Passes 80% sampling
      expect(passesSampling('info', { info: 0.6 })).toBe(false); // Fails 60% sampling
      
      Math.random = originalRandom;
    });

    it('defaults to 1.0 sampling rate when not specified', () => {
      const originalRandom = Math.random;
      Math.random = () => 0.9; // High value
      
      expect(passesSampling('trace', {})).toBe(true); // No sampling config = 100%
      expect(passesSampling('info', { debug: 0.5 })).toBe(true); // info not in config = 100%
      
      Math.random = originalRandom;
    });

    it('handles boundary conditions', () => {
      const originalRandom = Math.random;
      
      Math.random = () => 0.0; // Exactly 0
      expect(passesSampling('info', { info: 0.0 })).toBe(false);
      expect(passesSampling('info', { info: 0.1 })).toBe(true);
      
      Math.random = () => 0.999999; // Very close to 1
      expect(passesSampling('info', { info: 1.0 })).toBe(true);
      expect(passesSampling('info', { info: 0.99 })).toBe(false);
      
      Math.random = originalRandom;
    });
  });
});