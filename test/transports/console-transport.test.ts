import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConsoleTransport, createConsoleTransport } from '../../src/transports/console-transport.js';
import { Environment } from '../../src/transports/transport-interface.js';
import type { LogEventData, LogLevel } from '../../src/logger/types.js';

describe('ConsoleTransport', () => {
  let mockConsole: {
    log: ReturnType<typeof vi.fn>;
    debug: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    trace: ReturnType<typeof vi.fn>;
  };

  let originalConsole: typeof console;

  beforeEach(() => {
    mockConsole = {
      log: vi.fn(),
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      trace: vi.fn()
    };

    originalConsole = globalThis.console;
    globalThis.console = mockConsole as any;
  });

  afterEach(() => {
    globalThis.console = originalConsole;
    vi.clearAllMocks();
  });

  const createTestEvent = (level: LogLevel, message: string, overrides?: Partial<LogEventData>): LogEventData => ({
    level,
    message,
    timestamp: Date.now(),
    context: {},
    args: [],
    component: 'test',
    logger: 'test-logger',
    ...overrides
  });

  describe('Construction', () => {
    it('creates transport with default configuration', () => {
      const transport = new ConsoleTransport();
      
      expect(transport.name).toBe('console');
      expect(transport.config.format).toBe('pretty');
      expect(transport.config.colors).toBe(true);
      expect(transport.config.timestamps).toBe(true);
    });

    it('creates transport with custom configuration', () => {
      const transport = new ConsoleTransport({
        name: 'custom-console',
        format: 'json',
        colors: false,
        timestamps: false,
        enableInProduction: true
      });
      
      expect(transport.name).toBe('custom-console');
      expect(transport.config.format).toBe('json');
      expect(transport.config.colors).toBe(false);
      expect(transport.config.timestamps).toBe(false);
      expect(transport.config.enableInProduction).toBe(true);
    });

    it('creates transport using factory function', () => {
      const transport = createConsoleTransport({ format: 'compact' });
      
      expect(transport).toBeInstanceOf(ConsoleTransport);
      expect(transport.config.format).toBe('compact');
    });
  });

  describe('Console Method Mapping', () => {
    it('maps log levels to appropriate console methods', () => {
      const transport = new ConsoleTransport({ colors: false, timestamps: false });
      
      transport.write(createTestEvent('trace', 'trace message'));
      expect(mockConsole.trace).toHaveBeenCalledWith('TRACE [test] trace message');
      
      transport.write(createTestEvent('debug', 'debug message'));
      expect(mockConsole.debug).toHaveBeenCalledWith('DEBUG [test] debug message');
      
      transport.write(createTestEvent('info', 'info message'));
      expect(mockConsole.info).toHaveBeenCalledWith('INFO  [test] info message');
      
      transport.write(createTestEvent('warn', 'warn message'));
      expect(mockConsole.warn).toHaveBeenCalledWith('WARN  [test] warn message');
      
      transport.write(createTestEvent('error', 'error message'));
      expect(mockConsole.error).toHaveBeenCalledWith('ERROR [test] error message');
    });

    it('uses custom console method mapping', () => {
      const transport = new ConsoleTransport({
        consoleMethods: {
          error: 'warn',
          warn: 'log'
        },
        colors: false,
        timestamps: false
      });
      
      transport.write(createTestEvent('error', 'error message'));
      expect(mockConsole.warn).toHaveBeenCalledWith('ERROR [test] error message');
      
      transport.write(createTestEvent('warn', 'warn message'));
      expect(mockConsole.log).toHaveBeenCalledWith('WARN  [test] warn message');
    });

    it('falls back to console.log when method not available', () => {
      const incompleteConsole = { log: vi.fn() };
      globalThis.console = incompleteConsole as any;
      
      const transport = new ConsoleTransport({ colors: false, timestamps: false });
      transport.write(createTestEvent('debug', 'debug message'));
      
      expect(incompleteConsole.log).toHaveBeenCalledWith('DEBUG [test] debug message');
    });
  });

  describe('Formatting', () => {
    describe('Timestamp Formatting', () => {
      it('includes timestamps when enabled', () => {
        const transport = new ConsoleTransport({ 
          timestamps: true, 
          colors: false,
          timestampFormat: 'HH:mm:ss'
        });
        
        const event = createTestEvent('info', 'test message');
        transport.write(event);
        
        const call = mockConsole.info.mock.calls[0][0];
        expect(call).toMatch(/^\d{2}:\d{2}:\d{2} INFO {2}\[test\] test message$/);
      });

      it('excludes timestamps when disabled', () => {
        const transport = new ConsoleTransport({ timestamps: false, colors: false });
        
        transport.write(createTestEvent('info', 'test message'));
        
        expect(mockConsole.info).toHaveBeenCalledWith('INFO  [test] test message');
      });

      it('supports different timestamp formats', () => {
        const transport = new ConsoleTransport({
          timestamps: true,
          timestampFormat: 'iso',
          colors: false
        });
        
        transport.write(createTestEvent('info', 'test message'));
        
        const call = mockConsole.info.mock.calls[0][0];
        expect(call).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z INFO {2}\[test\] test message$/);
      });
    });

    describe('Format Modes', () => {
      it('formats in pretty mode', () => {
        const transport = new ConsoleTransport({ 
          format: 'pretty', 
          colors: false, 
          timestamps: false 
        });
        
        const event = createTestEvent('info', 'test message', {
          context: { userId: '123', action: 'login' },
          args: [{ extra: 'data' }]
        });
        
        transport.write(event);
        
        const call = mockConsole.info.mock.calls[0][0];
        expect(call).toContain('INFO  [test] test message');
        expect(call).toContain('Context: {\n  "userId": "123",\n  "action": "login"\n}');
        expect(call).toContain('Args: {\n  "extra": "data"\n}');
      });

      it('formats in compact mode', () => {
        const transport = new ConsoleTransport({ 
          format: 'compact', 
          colors: false, 
          timestamps: false 
        });
        
        const event = createTestEvent('info', 'test message', {
          context: { userId: '123' },
          args: ['arg1', { arg2: 'value' }]
        });
        
        transport.write(event);
        
        const call = mockConsole.info.mock.calls[0][0];
        expect(call).toContain('INFO  [test] test message');
        expect(call).toContain('Context: {"userId":"123"}');
        expect(call).toContain('Args: arg1 {"arg2":"value"}');
      });

      it('formats in json mode', () => {
        const transport = new ConsoleTransport({ 
          format: 'json', 
          colors: false, 
          timestamps: false 
        });
        
        const event = createTestEvent('info', 'test message', {
          context: { userId: '123' },
          args: ['arg1']
        });
        
        transport.write(event);
        
        const call = mockConsole.info.mock.calls[0][0];
        expect(call).toContain('INFO  [test] test message');
        expect(call).toContain('Context: {"userId":"123"}');
        expect(call).toContain('Args: "arg1"');
      });
    });

    describe('Component Display', () => {
      it('includes component name when present', () => {
        const transport = new ConsoleTransport({ colors: false, timestamps: false });
        
        transport.write(createTestEvent('info', 'test message', { component: 'auth-service' }));
        
        expect(mockConsole.info).toHaveBeenCalledWith('INFO  [auth-service] test message');
      });

      it('omits component brackets when component is empty', () => {
        const transport = new ConsoleTransport({ colors: false, timestamps: false });
        
        transport.write(createTestEvent('info', 'test message', { component: '' }));
        
        expect(mockConsole.info).toHaveBeenCalledWith('INFO  test message');
      });
    });

    describe('Context and Args Handling', () => {
      it('handles empty context and args', () => {
        const transport = new ConsoleTransport({ colors: false, timestamps: false });
        
        transport.write(createTestEvent('info', 'test message', {
          context: {},
          args: []
        }));
        
        expect(mockConsole.info).toHaveBeenCalledWith('INFO  [test] test message');
      });

      it('handles complex nested objects', () => {
        const transport = new ConsoleTransport({ 
          format: 'pretty', 
          colors: false, 
          timestamps: false 
        });
        
        const complexContext = {
          user: { id: '123', profile: { name: 'John', settings: { theme: 'dark' } } },
          metadata: ['tag1', 'tag2']
        };
        
        transport.write(createTestEvent('info', 'test message', { context: complexContext }));
        
        const call = mockConsole.info.mock.calls[0][0];
        expect(call).toContain('"user"');
        expect(call).toContain('"profile"');
        expect(call).toContain('"settings"');
        expect(call).toContain('"theme": "dark"');
      });

      it('handles circular references gracefully', () => {
        const transport = new ConsoleTransport({ colors: false, timestamps: false });
        
        const circular: any = { name: 'test' };
        circular.self = circular;
        
        transport.write(createTestEvent('info', 'test message', { context: circular }));
        
        // Should not throw and should convert to string representation
        expect(mockConsole.info).toHaveBeenCalled();
      });

      it('handles various data types in context and args', () => {
        const transport = new ConsoleTransport({ colors: false, timestamps: false, format: 'json' });
        
        const complexData = {
          string: 'text',
          number: 42,
          boolean: true,
          null: null,
          undefined: undefined,
          array: [1, 2, 3],
          date: new Date('2023-01-01'),
          regexp: /test/g,
          function: () => 'test'
        };
        
        transport.write(createTestEvent('info', 'test message', {
          context: complexData,
          args: [complexData.string, complexData.number, complexData.array]
        }));
        
        expect(mockConsole.info).toHaveBeenCalled();
        const call = mockConsole.info.mock.calls[0][0];
        expect(call).toContain('Context:');
        expect(call).toContain('Args:');
      });

      it('handles large objects without performance issues', () => {
        const transport = new ConsoleTransport({ colors: false, timestamps: false });
        
        // Create a large object
        const largeContext: Record<string, any> = {};
        for (let i = 0; i < 100; i++) {
          largeContext[`key${i}`] = { nested: { value: `value${i}`, array: new Array(10).fill(i) } };
        }
        
        const startTime = performance.now();
        transport.write(createTestEvent('info', 'test message', { context: largeContext }));
        const endTime = performance.now();
        
        expect(mockConsole.info).toHaveBeenCalled();
        expect(endTime - startTime).toBeLessThan(50); // Should complete within 50ms
      });
    });
  });

  describe('Colorization', () => {
    describe('Browser Environment', () => {
      beforeEach(() => {
        vi.spyOn(Environment, 'isBrowser', 'get').mockReturnValue(true);
        vi.spyOn(Environment, 'supportsConsoleStyles', 'get').mockReturnValue(true);
      });

      it('uses browser CSS styles when colors enabled', () => {
        const transport = new ConsoleTransport({ 
          colors: true, 
          timestamps: true,
          format: 'compact'
        });
        
        transport.write(createTestEvent('error', 'error message'));
        
        const call = mockConsole.error.mock.calls[0];
        expect(call[0]).toContain('%c'); // CSS style markers
        expect(call.length).toBeGreaterThan(1); // Should have style arguments
      });

      it('includes styles for timestamp, level, and component', () => {
        const transport = new ConsoleTransport({ 
          colors: true, 
          timestamps: true 
        });
        
        transport.write(createTestEvent('warn', 'warning message', { component: 'auth' }));
        
        const call = mockConsole.warn.mock.calls[0];
        const message = call[0];
        
        // Should have style placeholders for timestamp, level, component, and message
        const styleCount = (message.match(/%c/g) || []).length;
        expect(styleCount).toBe(4);
        expect(call.length).toBe(5); // message + 4 styles
      });
    });

    describe('Node.js Environment', () => {
      beforeEach(() => {
        vi.spyOn(Environment, 'isBrowser', 'get').mockReturnValue(false);
        vi.spyOn(Environment, 'supportsConsoleStyles', 'get').mockReturnValue(true);
      });

      it('uses ANSI colors when colors enabled', () => {
        const transport = new ConsoleTransport({ 
          colors: true, 
          timestamps: true 
        });
        
        transport.write(createTestEvent('error', 'error message'));
        
        const call = mockConsole.error.mock.calls[0][0];
        expect(call).toContain('\x1b['); // ANSI color codes
        expect(call).toContain('\x1b[0m'); // Reset code
      });

      it('applies different colors for different log levels', () => {
        const transport = new ConsoleTransport({ colors: true, timestamps: false });
        
        transport.write(createTestEvent('info', 'info message'));
        transport.write(createTestEvent('error', 'error message'));
        
        const infoCall = mockConsole.info.mock.calls[0][0];
        const errorCall = mockConsole.error.mock.calls[0][0];
        
        expect(infoCall).toContain('\x1b[32m'); // Green for info
        expect(errorCall).toContain('\x1b[31m'); // Red for error
      });

      it('formats context and args with ANSI colors in pretty mode', () => {
        const transport = new ConsoleTransport({ 
          colors: true, 
          timestamps: false,
          format: 'pretty'
        });
        
        transport.write(createTestEvent('info', 'test message', {
          context: { userId: '123' },
          args: ['arg1', 'arg2']
        }));
        
        const call = mockConsole.info.mock.calls[0][0];
        expect(call).toContain('Context:');
        expect(call).toContain('Args:');
        expect(call).toContain('\x1b[2m'); // Dim color for labels
        expect(call).toContain('\x1b[0m'); // Reset color
      });

      it('formats context and args with ANSI colors in compact mode', () => {
        const transport = new ConsoleTransport({ 
          colors: true, 
          timestamps: false,
          format: 'compact'
        });
        
        transport.write(createTestEvent('info', 'test message', {
          context: { userId: '123' },
          args: ['arg1']
        }));
        
        const call = mockConsole.info.mock.calls[0][0];
        expect(call).toContain('Context:');
        expect(call).toContain('Args:');
        expect(call).toContain('\x1b[2m'); // Dim color
        expect(call).toContain('\x1b[0m'); // Reset color
        // Should be on same line in compact mode
        expect(call.split('\n').length).toBe(1);
      });
    });

    describe('No Color Support', () => {
      beforeEach(() => {
        vi.spyOn(Environment, 'supportsConsoleStyles', 'get').mockReturnValue(false);
      });

      it('outputs plain text when colors disabled', () => {
        const transport = new ConsoleTransport({ colors: false });
        
        transport.write(createTestEvent('error', 'error message'));
        
        const call = mockConsole.error.mock.calls[0][0];
        expect(call).not.toContain('\x1b['); // No ANSI codes
        expect(call).not.toContain('%c'); // No CSS style markers
      });

      it('outputs plain text when color support unavailable', () => {
        const transport = new ConsoleTransport({ colors: true }); // colors enabled but not supported
        
        transport.write(createTestEvent('warn', 'warning message'));
        
        const call = mockConsole.warn.mock.calls[0][0];
        expect(call).not.toContain('\x1b[');
        expect(call).not.toContain('%c');
      });
    });
  });

  describe('Environment Detection', () => {
    describe('Production Environment', () => {
      beforeEach(() => {
        vi.spyOn(Environment, 'isProduction', 'get').mockReturnValue(true);
      });

      it('disables transport in production by default', () => {
        const transport = new ConsoleTransport();
        
        transport.write(createTestEvent('info', 'test message'));
        
        expect(mockConsole.info).not.toHaveBeenCalled();
      });

      it('enables transport in production when explicitly configured', () => {
        const transport = new ConsoleTransport({ enableInProduction: true });
        
        transport.write(createTestEvent('info', 'test message'));
        
        expect(mockConsole.info).toHaveBeenCalled();
      });
    });

    describe('Development Environment', () => {
      beforeEach(() => {
        vi.spyOn(Environment, 'isProduction', 'get').mockReturnValue(false);
      });

      it('enables transport in development by default', () => {
        const transport = new ConsoleTransport();
        
        transport.write(createTestEvent('info', 'test message'));
        
        expect(mockConsole.info).toHaveBeenCalled();
      });
    });

    describe('Console Availability', () => {
      it('handles missing console gracefully', () => {
        const originalConsole = globalThis.console;
        // @ts-expect-error - Testing missing console
        globalThis.console = undefined;
        
        const transport = new ConsoleTransport();
        
        expect(() => {
          transport.write(createTestEvent('info', 'test message'));
        }).not.toThrow();
        
        globalThis.console = originalConsole;
      });
    });
  });

  describe('Performance Monitoring', () => {
    it('measures performance of write operations', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      const transport = new ConsoleTransport({ 
        performanceThreshold: 0, // Very low threshold to trigger warning
        enableInProduction: true
      });
      
      transport.write(createTestEvent('info', 'test message'));
      
      // In development, should warn about performance
      vi.spyOn(Environment, 'isProduction', 'get').mockReturnValue(false);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Transport "console" took')
      );
      
      consoleSpy.mockRestore();
    });

    it('does not warn when performance is acceptable', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      const transport = new ConsoleTransport({ 
        performanceThreshold: 1000 // Very high threshold
      });
      
      transport.write(createTestEvent('info', 'test message'));
      
      expect(consoleSpy).not.toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });

    it('measures performance accurately across different formats', () => {
      const formats = ['pretty', 'compact', 'json'] as const;
      
      formats.forEach(format => {
        const transport = new ConsoleTransport({ 
          format,
          performanceThreshold: 1000 // High threshold to avoid warnings
        });
        
        const startTime = performance.now();
        transport.write(createTestEvent('info', 'performance test', {
          context: { format, data: 'test' },
          args: ['arg1', { nested: 'value' }]
        }));
        const endTime = performance.now();
        
        expect(endTime - startTime).toBeLessThan(10); // Should be very fast
        expect(mockConsole.info).toHaveBeenCalled();
      });
    });

    it('disables performance warnings in production', () => {
      vi.spyOn(Environment, 'isProduction', 'get').mockReturnValue(true);
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      const transport = new ConsoleTransport({ 
        performanceThreshold: 0, // Very low threshold
        enableInProduction: true
      });
      
      transport.write(createTestEvent('info', 'test message'));
      
      // Should not warn in production even if threshold is exceeded
      expect(consoleSpy).not.toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });
  });

  describe('Transport Interface Compliance', () => {
    it('implements required transport methods', () => {
      const transport = new ConsoleTransport();
      
      expect(typeof transport.write).toBe('function');
      expect(typeof transport.flush).toBe('function');
      expect(typeof transport.close).toBe('function');
      expect(typeof transport.name).toBe('string');
      expect(typeof transport.config).toBe('object');
    });

    it('flush method does not throw', async () => {
      const transport = new ConsoleTransport();
      
      expect(() => transport.flush()).not.toThrow();
      expect(transport.flush()).toBeUndefined();
    });

    it('close method does not throw', async () => {
      const transport = new ConsoleTransport();
      
      expect(() => transport.close()).not.toThrow();
      expect(transport.close()).toBeUndefined();
    });
  });
});