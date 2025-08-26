import { describe, it, expect, vi, beforeEach } from 'vitest';
import { 
  Environment, 
  Formatters, 
  Colors, 
  BrowserStyles, 
  BaseTransport 
} from '../../src/transports/transport-interface.js';
import type { LogEventData } from '../../src/logger/types.js';

describe('Environment Detection', () => {
  describe('Basic Environment Detection', () => {
    it('has environment detection properties', () => {
      expect(typeof Environment.isBrowser).toBe('boolean');
      expect(typeof Environment.isNode).toBe('boolean'); 
      expect(typeof Environment.isProduction).toBe('boolean');
      expect(typeof Environment.supportsConsoleStyles).toBe('boolean');
    });

    it('detects browser environment in test environment', () => {
      // In vitest/jsdom environment, this should be true
      expect(Environment.isBrowser).toBe(true);
    });

    it('detects console style support', () => {
      // Should be true in browser or TTY environments
      expect(Environment.supportsConsoleStyles).toBe(true);
    });
  });
});

describe('Formatters', () => {
  describe('timestamp', () => {
    const testTimestamp = new Date('2023-12-25T10:30:45.123Z').getTime();

    it('formats timestamp with default format', () => {
      const result = Formatters.timestamp(testTimestamp);
      expect(result).toBe('10:30:45.123');
    });

    it('formats timestamp with ISO format', () => {
      const result = Formatters.timestamp(testTimestamp, 'iso');
      expect(result).toBe('2023-12-25T10:30:45.123Z');
    });

    it('formats timestamp with HH:mm:ss format', () => {
      const result = Formatters.timestamp(testTimestamp, 'HH:mm:ss');
      expect(result).toBe('10:30:45');
    });

    it('formats timestamp with HH:mm:ss.SSS format', () => {
      const result = Formatters.timestamp(testTimestamp, 'HH:mm:ss.SSS');
      expect(result).toBe('10:30:45.123');
    });

    it('falls back to default for unknown formats', () => {
      const result = Formatters.timestamp(testTimestamp, 'unknown-format');
      expect(result).toBe('10:30:45.123');
    });
  });

  describe('prettyObject', () => {
    it('formats simple objects with indentation', () => {
      const obj = { name: 'John', age: 30 };
      const result = Formatters.prettyObject(obj);
      
      expect(result).toContain('{\n');
      expect(result).toContain('  "name": "John"');
      expect(result).toContain('  "age": 30');
    });

    it('formats nested objects correctly', () => {
      const obj = { user: { profile: { name: 'John' } } };
      const result = Formatters.prettyObject(obj);
      
      expect(result).toContain('  "user": {');
      expect(result).toContain('    "profile": {');
      expect(result).toContain('      "name": "John"');
    });

    it('handles custom indentation', () => {
      const obj = { test: 'value' };
      const result = Formatters.prettyObject(obj, 4);
      
      expect(result).toContain('    "test": "value"');
    });

    it('handles circular references gracefully', () => {
      const circular: any = { name: 'test' };
      circular.self = circular;
      
      const result = Formatters.prettyObject(circular);
      expect(typeof result).toBe('string');
      expect(result).not.toContain('"self"'); // Should fallback to String()
    });

    it('handles non-serializable objects', () => {
      const nonSerializable = { 
        func: () => 'test',
        symbol: Symbol('test')
      };
      
      const result = Formatters.prettyObject(nonSerializable);
      expect(typeof result).toBe('string');
    });
  });

  describe('compactObject', () => {
    it('formats objects without indentation', () => {
      const obj = { name: 'John', age: 30 };
      const result = Formatters.compactObject(obj);
      
      expect(result).toBe('{"name":"John","age":30}');
    });

    it('handles circular references gracefully', () => {
      const circular: any = { name: 'test' };
      circular.self = circular;
      
      const result = Formatters.compactObject(circular);
      expect(typeof result).toBe('string');
      expect(result).not.toContain('"self"');
    });

    it('handles primitives correctly', () => {
      expect(Formatters.compactObject('string')).toBe('"string"');
      expect(Formatters.compactObject(42)).toBe('42');
      expect(Formatters.compactObject(true)).toBe('true');
      expect(Formatters.compactObject(null)).toBe('null');
    });
  });

  describe('getLogLevelPriority', () => {
    it('returns correct priorities for all log levels', () => {
      expect(Formatters.getLogLevelPriority('trace')).toBe(0);
      expect(Formatters.getLogLevelPriority('debug')).toBe(1);
      expect(Formatters.getLogLevelPriority('info')).toBe(2);
      expect(Formatters.getLogLevelPriority('warn')).toBe(3);
      expect(Formatters.getLogLevelPriority('error')).toBe(4);
    });

    it('returns default priority for unknown levels', () => {
      expect(Formatters.getLogLevelPriority('unknown' as any)).toBe(2);
    });

    it('allows level comparison', () => {
      expect(Formatters.getLogLevelPriority('error')).toBeGreaterThan(
        Formatters.getLogLevelPriority('warn')
      );
      expect(Formatters.getLogLevelPriority('warn')).toBeGreaterThan(
        Formatters.getLogLevelPriority('info')
      );
    });
  });
});

describe('Colors and Styles', () => {
  describe('Colors (ANSI)', () => {
    it('defines colors for all log levels', () => {
      expect(Colors.trace).toBe('\x1b[36m'); // Cyan
      expect(Colors.debug).toBe('\x1b[34m'); // Blue
      expect(Colors.info).toBe('\x1b[32m');  // Green
      expect(Colors.warn).toBe('\x1b[33m');  // Yellow
      expect(Colors.error).toBe('\x1b[31m'); // Red
    });

    it('defines style control codes', () => {
      expect(Colors.reset).toBe('\x1b[0m');
      expect(Colors.bold).toBe('\x1b[1m');
      expect(Colors.dim).toBe('\x1b[2m');
    });

    it('defines utility colors', () => {
      expect(Colors.component).toBe('\x1b[35m'); // Magenta
      expect(Colors.timestamp).toBe('\x1b[90m'); // Bright Black
    });
  });

  describe('BrowserStyles (CSS)', () => {
    it('defines CSS styles for all log levels', () => {
      expect(BrowserStyles.trace).toContain('color: #00bcd4');
      expect(BrowserStyles.debug).toContain('color: #2196f3');
      expect(BrowserStyles.info).toContain('color: #4caf50');
      expect(BrowserStyles.warn).toContain('color: #ff9800');
      expect(BrowserStyles.error).toContain('color: #f44336');
    });

    it('defines utility styles', () => {
      expect(BrowserStyles.component).toContain('color: #9c27b0');
      expect(BrowserStyles.timestamp).toContain('color: #666');
    });

    it('uses appropriate font weights', () => {
      expect(BrowserStyles.warn).toContain('font-weight: bold');
      expect(BrowserStyles.error).toContain('font-weight: bold');
      expect(BrowserStyles.info).toContain('font-weight: normal');
    });
  });
});

describe('BaseTransport', () => {
  class TestTransport extends BaseTransport {
    public writeCallCount = 0;
    
    write(): void {
      this.writeCallCount++;
    }
  }

  let transport: TestTransport;

  beforeEach(() => {
    transport = new TestTransport('test-transport', { testConfig: true });
  });

  describe('Construction', () => {
    it('sets name and config correctly', () => {
      expect(transport.name).toBe('test-transport');
      expect(transport.config).toEqual({ testConfig: true });
    });

    it('handles empty config', () => {
      const emptyTransport = new TestTransport('empty');
      expect(emptyTransport.config).toEqual({});
    });
  });

  describe('Interface Implementation', () => {
    it('provides default flush implementation', () => {
      expect(() => transport.flush()).not.toThrow();
      expect(transport.flush()).toBeUndefined();
    });

    it('provides default close implementation', () => {
      expect(() => transport.close()).not.toThrow();
      expect(transport.close()).toBeUndefined();
    });

    it('requires write method implementation', () => {
      expect(() => transport.write({} as LogEventData)).not.toThrow();
      expect(transport.writeCallCount).toBe(1);
    });
  });

  describe('isEnabled', () => {
    it('returns true by default', () => {
      expect(transport['isEnabled']()).toBe(true);
    });
  });

  describe('measurePerformance', () => {
    it('measures function execution time', () => {
      const mockFn = vi.fn(() => 'result');
      
      const result = transport['measurePerformance'](mockFn, 1000);
      
      expect(result).toBe('result');
      expect(mockFn).toHaveBeenCalledOnce();
    });

    it('warns when threshold exceeded in development', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const slowFn = vi.fn(() => {
        // Simulate slow operation
        const start = Date.now();
        while (Date.now() - start < 2) {
          // Busy wait for 2ms
        }
        return 'result';
      });
      
      // Mock production check
      vi.spyOn(Environment, 'isProduction', 'get').mockReturnValue(false);
      
      transport['measurePerformance'](slowFn, 0.1); // Very low threshold
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Transport "test-transport" took')
      );
      
      consoleSpy.mockRestore();
    });

    it('does not warn in production environment', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const slowFn = vi.fn(() => 'result');
      
      vi.spyOn(Environment, 'isProduction', 'get').mockReturnValue(true);
      
      transport['measurePerformance'](slowFn, 0); // Zero threshold
      
      expect(consoleSpy).not.toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });

    it('does not warn when performance is acceptable', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const fastFn = vi.fn(() => 'result');
      
      transport['measurePerformance'](fastFn, 1000); // High threshold
      
      expect(consoleSpy).not.toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });
  });
});