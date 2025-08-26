/**
 * Unit tests for LoggerConfiguration
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LoggerConfiguration } from '../../src/logger/logger-configuration.js';
import type { LoggerConfig } from '../../src/logger/types.js';

describe('LoggerConfiguration', () => {
  let config: LoggerConfiguration;

  beforeEach(() => {
    config = new LoggerConfiguration();
  });

  describe('Construction and Defaults', () => {
    it('creates configuration with default values', () => {
      expect(config.level).toBe('info');
      expect(config.component).toBe('default');
      expect(config.defaultContext).toEqual({});
      expect(config.transports).toEqual([]);
    });

    it('creates configuration with custom values', () => {
      const customConfig: LoggerConfig = {
        level: 'debug',
        component: 'test-component',
        defaultContext: { service: 'api' },
        sampling: { debug: 0.5 }
      };

      config = new LoggerConfiguration(customConfig);

      expect(config.level).toBe('debug');
      expect(config.component).toBe('test-component');
      expect(config.defaultContext).toEqual({ service: 'api' });
      expect(config.sampling.debug).toBe(0.5);
    });

    it('merges partial configuration with defaults', () => {
      config = new LoggerConfiguration({ level: 'warn' });

      expect(config.level).toBe('warn');
      expect(config.component).toBe('default'); // Default value
      expect(config.sampling.info).toBe(1.0); // Default value
    });

    it('returns frozen full configuration', () => {
      const fullConfig = config.fullConfig;
      
      expect(Object.isFrozen(fullConfig)).toBe(true);
      expect(fullConfig.level).toBe('info');
      expect(fullConfig.component).toBe('default');
    });
  });

  describe('Level Management', () => {
    it('sets log level', () => {
      config.setLevel('debug');
      expect(config.level).toBe('debug');

      config.setLevel('error');
      expect(config.level).toBe('error');
    });

    it('throws error for invalid log level', () => {
      expect(() => config.setLevel('invalid' as any)).toThrow('Invalid log level: invalid');
    });

    it('sets component-specific log level', () => {
      config.setComponentLevel('database', 'trace');
      expect(config.getEffectiveLevel('database')).toBe('trace');
      expect(config.getEffectiveLevel('other')).toBe('info');
    });

    it('throws error for invalid component in setComponentLevel', () => {
      expect(() => config.setComponentLevel('', 'debug')).toThrow('Component must be a non-empty string');
      expect(() => config.setComponentLevel(null as any, 'debug')).toThrow('Component must be a non-empty string');
    });

    it('throws error for invalid level in setComponentLevel', () => {
      expect(() => config.setComponentLevel('test', 'invalid' as any)).toThrow('Invalid log level: invalid');
    });

    it('removes component-specific log level', () => {
      config.setComponentLevel('database', 'trace');
      expect(config.removeComponentLevel('database')).toBe(true);
      expect(config.getEffectiveLevel('database')).toBe('info');
      expect(config.removeComponentLevel('database')).toBe(false);
    });

    it('returns all component levels', () => {
      config.setComponentLevel('db', 'trace');
      config.setComponentLevel('api', 'debug');

      const levels = config.getComponentLevels();
      expect(levels.size).toBe(2);
      expect(levels.get('db')).toBe('trace');
      expect(levels.get('api')).toBe('debug');
    });

    it('clears all component levels', () => {
      config.setComponentLevel('db', 'trace');
      config.setComponentLevel('api', 'debug');

      config.clearComponentLevels();

      const levels = config.getComponentLevels();
      expect(levels.size).toBe(0);
    });
  });

  describe('Should Process Logic', () => {
    it('filters logs based on level', () => {
      config.setLevel('warn');

      expect(config.shouldProcess('trace')).toBe(false);
      expect(config.shouldProcess('debug')).toBe(false);
      expect(config.shouldProcess('info')).toBe(false);
      expect(config.shouldProcess('warn')).toBe(true);
      expect(config.shouldProcess('error')).toBe(true);
    });

    it('uses component-specific level when provided', () => {
      config.setLevel('warn');
      config.setComponentLevel('database', 'debug');

      expect(config.shouldProcess('debug', 'database')).toBe(true);
      expect(config.shouldProcess('debug', 'other')).toBe(false);
    });

    it('applies sampling rates', () => {
      // Mock Math.random for consistent testing
      const originalRandom = Math.random;
      let randomValue = 0.5;
      Math.random = vi.fn(() => randomValue);

      config.setLevel('debug'); // Allow debug logs
      config.setSamplingRate('debug', 0.6);

      randomValue = 0.5; // Below threshold
      expect(config.shouldProcess('debug')).toBe(true);

      randomValue = 0.7; // Above threshold
      expect(config.shouldProcess('debug')).toBe(false);

      Math.random = originalRandom;
    });

    it('combines level and sampling checks', () => {
      const originalRandom = Math.random;
      Math.random = vi.fn(() => 0.5);

      config.setLevel('info');
      config.setSamplingRate('info', 0.6);

      // Below level, should not process regardless of sampling
      expect(config.shouldProcess('debug')).toBe(false);

      // At level and passes sampling
      expect(config.shouldProcess('info')).toBe(true);

      Math.random = vi.fn(() => 0.7); // Fails sampling
      expect(config.shouldProcess('info')).toBe(false);

      Math.random = originalRandom;
    });
  });

  describe('Sampling Configuration', () => {
    it('sets sampling rate for specific level', () => {
      config.setSamplingRate('debug', 0.25);
      expect(config.sampling.debug).toBe(0.25);
    });

    it('throws error for invalid sampling rate', () => {
      expect(() => config.setSamplingRate('debug', -0.1)).toThrow('Sampling rate must be between 0 and 1');
      expect(() => config.setSamplingRate('debug', 1.1)).toThrow('Sampling rate must be between 0 and 1');
    });

    it('accepts boundary sampling rates', () => {
      config.setSamplingRate('debug', 0);
      expect(config.sampling.debug).toBe(0);

      config.setSamplingRate('info', 1);
      expect(config.sampling.info).toBe(1);
    });
  });

  describe('Context Management', () => {
    it('updates default context', () => {
      config.updateDefaultContext({ user: '123' });
      expect(config.defaultContext).toEqual({ user: '123' });

      config.updateDefaultContext({ session: 'abc' });
      expect(config.defaultContext).toEqual({ user: '123', session: 'abc' });
    });

    it('overwrites existing context values', () => {
      config.updateDefaultContext({ user: '123' });
      config.updateDefaultContext({ user: '456' });
      expect(config.defaultContext).toEqual({ user: '456' });
    });

    it('returns copy of default context', () => {
      config.updateDefaultContext({ user: '123' });
      const context = config.defaultContext;
      context.modified = true;
      
      expect(config.defaultContext).toEqual({ user: '123' });
      expect(config.defaultContext).not.toHaveProperty('modified');
    });
  });

  describe('Capture Settings', () => {
    it('returns capture settings', () => {
      const settings = config.captureSettings;
      expect(settings).toEqual({
        unhandledErrors: false,
        unhandledRejections: false,
        consoleErrors: false
      });
    });

    it('reflects configured capture settings', () => {
      config = new LoggerConfiguration({
        captureUnhandledErrors: true,
        captureConsoleErrors: true
      });

      const settings = config.captureSettings;
      expect(settings.unhandledErrors).toBe(true);
      expect(settings.consoleErrors).toBe(true);
      expect(settings.unhandledRejections).toBe(false);
    });
  });

  describe('Configuration Properties', () => {
    it('returns redaction configuration', () => {
      config = new LoggerConfiguration({
        redaction: {
          enabled: false,
          mode: 'strict',
          patterns: [{ pattern: /test/, replacement: 'REDACTED' }]
        }
      });

      const redaction = config.redaction;
      expect(redaction.enabled).toBe(false);
      expect(redaction.mode).toBe('strict');
      expect(redaction.patterns).toHaveLength(1);
    });

    it('returns copy of transports array', () => {
      const transport1 = { name: 't1', write: vi.fn(), flush: vi.fn(), close: vi.fn() };
      const transport2 = { name: 't2', write: vi.fn(), flush: vi.fn(), close: vi.fn() };
      
      config = new LoggerConfiguration({
        transports: [transport1, transport2]
      });

      const transports = config.transports;
      expect(transports).toHaveLength(2);
      
      transports.push({ name: 't3' } as any);
      expect(config.transports).toHaveLength(2); // Original unchanged
    });
  });

  describe('Reset and Clone', () => {
    it('resets configuration to original values', () => {
      config = new LoggerConfiguration({ level: 'debug' });
      
      config.setLevel('error');
      config.setComponentLevel('db', 'trace');
      config.updateDefaultContext({ modified: true });

      config.reset();

      expect(config.level).toBe('debug');
      expect(config.getComponentLevels().size).toBe(0);
      expect(config.defaultContext).toEqual({});
    });

    it('clones configuration', () => {
      config.setLevel('warn');
      config.setComponentLevel('db', 'trace');
      config.updateDefaultContext({ original: true });

      const cloned = config.clone();

      expect(cloned.level).toBe('warn');
      expect(cloned.getEffectiveLevel('db')).toBe('trace');
      expect(cloned.defaultContext).toEqual({ original: true });

      // Verify independence
      cloned.setLevel('error');
      expect(config.level).toBe('warn');
    });

    it('clones configuration with overrides', () => {
      config.setLevel('info');
      config.setComponentLevel('db', 'trace');

      const cloned = config.clone({ level: 'error', component: 'cloned' });

      expect(cloned.level).toBe('error');
      expect(cloned.component).toBe('cloned');
      expect(cloned.getEffectiveLevel('db')).toBe('trace'); // Component levels preserved
    });
  });

  describe('Edge Cases', () => {
    it('handles undefined sampling rate', () => {
      const customConfig = new LoggerConfiguration({
        sampling: { debug: 0.5 }
        // info not specified
      });

      // Should use default (1.0) for unspecified levels
      const originalRandom = Math.random;
      Math.random = vi.fn(() => 0.99);
      
      expect(customConfig.shouldProcess('info')).toBe(true);
      
      Math.random = originalRandom;
    });

    it('handles empty component string in getEffectiveLevel', () => {
      config.setComponentLevel('test', 'debug');
      expect(config.getEffectiveLevel('')).toBe('info'); // Falls back to default
    });

    it('preserves patterns array immutability', () => {
      const pattern = { pattern: /test/, replacement: 'X' };
      config = new LoggerConfiguration({
        redaction: { patterns: [pattern] }
      });

      const redaction1 = config.redaction;
      const redaction2 = config.redaction;
      
      expect(redaction1.patterns).not.toBe(redaction2.patterns); // Different arrays
      expect(redaction1.patterns).toEqual(redaction2.patterns); // Same content
    });
  });
});