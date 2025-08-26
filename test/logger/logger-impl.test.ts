import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { 
  LoggerImpl, 
  createLogger
} from '../../src/logger/index.js';
import { TEST_CONSTANTS } from '../test-constants.js';

// Mock transport for testing
class MockTransport {
  public writeCalls: any[] = [];
  public flushCalls: number = 0;
  public closeCalls: number = 0;
  public writeError: Error | null = null;

  constructor(public name: string = TEST_CONSTANTS.TRANSPORT_NAMES.MOCK_TRANSPORT) {}

  write(eventData: any) {
    if (this.writeError) throw this.writeError;
    this.writeCalls.push(eventData);
  }

  flush() {
    this.flushCalls++;
  }

  close() {
    this.closeCalls++;
  }

  reset() {
    this.writeCalls = [];
    this.flushCalls = 0;
    this.closeCalls = 0;
    this.writeError = null;
  }
}

describe('LoggerImpl (Standalone)', () => {
  let mockTransport: MockTransport;
  
  beforeEach(() => {
    mockTransport = new MockTransport();
  });

  afterEach(() => {
    mockTransport.reset();
  });

  describe('Construction and Lifecycle', () => {
    it('creates logger with default config', () => {
      const logger = new LoggerImpl();
      
      expect(logger.name).toBe(TEST_CONSTANTS.LOGGER_NAMES.DEFAULT);
      expect(logger.level).toBe(TEST_CONSTANTS.LEVELS.INFO);
    });

    it('creates logger with custom config', () => {
      const config = {
        level: TEST_CONSTANTS.LEVELS.DEBUG,
        component: TEST_CONSTANTS.COMPONENTS.TEST_COMPONENT,
        transports: [mockTransport]
      };
      
      const logger = new LoggerImpl(config, TEST_CONSTANTS.LOGGER_NAMES.TEST_LOGGER);
      
      expect(logger.name).toBe(TEST_CONSTANTS.LOGGER_NAMES.TEST_LOGGER);
      expect(logger.level).toBe(TEST_CONSTANTS.LEVELS.DEBUG);
    });

    it('creates logger without emitting events (standalone mode)', () => {
      const logger = new LoggerImpl({ level: TEST_CONSTANTS.LEVELS.DEBUG }, TEST_CONSTANTS.LOGGER_NAMES.TEST_LOGGER);
      
      // Logger should be created successfully without any event dependencies
      expect(logger.name).toBe(TEST_CONSTANTS.LOGGER_NAMES.TEST_LOGGER);
      expect(logger.level).toBe(TEST_CONSTANTS.LEVELS.DEBUG);
    });

    it('destroys logger without emitting events (standalone mode)', async () => {
      const logger = new LoggerImpl({}, TEST_CONSTANTS.LOGGER_NAMES.TEST_LOGGER);
      
      // Logger should destroy successfully without any event dependencies
      await expect(logger.destroy()).resolves.toBeUndefined();
    });

    it('cleans up resources on destroy', async () => {
      const logger = new LoggerImpl({ transports: [mockTransport] });
      
      await logger.destroy();
      
      expect(mockTransport.flushCalls).toBe(1);
      expect(mockTransport.closeCalls).toBe(1);
      
      // Should not process logs after destroy
      logger.info('test');
      expect(mockTransport.writeCalls).toHaveLength(0);
    });
  });

  describe('Log Level Management', () => {
    it('filters logs based on minimum level', () => {
      const logger = new LoggerImpl({ level: 'warn', transports: [mockTransport] });
      
      logger.trace('trace message'); // Should not write to transport
      logger.debug('debug message'); // Should not write to transport
      logger.info('info message');   // Should not write to transport
      logger.warn('warn message');   // Should write to transport
      logger.error('error message'); // Should write to transport
      
      expect(mockTransport.writeCalls).toHaveLength(2);
      expect(mockTransport.writeCalls[0]).toMatchObject({
        level: 'warn',
        message: 'warn message'
      });
      expect(mockTransport.writeCalls[1]).toMatchObject({
        level: 'error',
        message: 'error message'
      });
    });

    it('changes log level dynamically', () => {
      const logger = new LoggerImpl({ level: 'info', transports: [mockTransport] });
      expect(logger.level).toBe(TEST_CONSTANTS.LEVELS.INFO);
      
      logger.setLevel(TEST_CONSTANTS.LEVELS.DEBUG);
      expect(logger.level).toBe(TEST_CONSTANTS.LEVELS.DEBUG);
      
      // Configuration change should work without emitting events
      expect(logger.level).toBe(TEST_CONSTANTS.LEVELS.DEBUG);
    });

    it('sets component-specific log levels', () => {
      const logger = new LoggerImpl({ 
        level: TEST_CONSTANTS.LEVELS.WARN,
        component: TEST_CONSTANTS.COMPONENTS.TEST_COMPONENT,
        transports: [mockTransport]
      });
      
      logger.setComponentLevel(TEST_CONSTANTS.COMPONENTS.TEST_COMPONENT, TEST_CONSTANTS.LEVELS.DEBUG);
      
      // Should now log debug messages due to component override
      logger.debug(TEST_CONSTANTS.MESSAGES.DEBUG_MESSAGE);
      expect(mockTransport.writeCalls).toHaveLength(1);
      expect(mockTransport.writeCalls[0]).toMatchObject({ 
        level: TEST_CONSTANTS.LEVELS.DEBUG 
      });
    });
  });

  describe('Logging Methods', () => {
    it('logs messages at all levels', () => {
      const logger = new LoggerImpl({ 
        level: TEST_CONSTANTS.LEVELS.TRACE,
        transports: [mockTransport]
      });
      
      logger.trace(TEST_CONSTANTS.MESSAGES.TRACE_MESSAGE);
      logger.debug(TEST_CONSTANTS.MESSAGES.DEBUG_MESSAGE);
      logger.info(TEST_CONSTANTS.MESSAGES.INFO_MESSAGE);
      logger.warn(TEST_CONSTANTS.MESSAGES.WARN_MESSAGE);
      logger.error(TEST_CONSTANTS.MESSAGES.ERROR_MESSAGE);
      
      expect(mockTransport.writeCalls).toHaveLength(5);
      
      // Check that all levels are captured in transport writes
      const levels = mockTransport.writeCalls.map(call => call.level);
      expect(levels).toEqual(['trace', 'debug', 'info', 'warn', 'error']);
    });

    it('includes arguments and context in log events with redaction', () => {
      const logger = new LoggerImpl({ 
        level: 'info',
        component: 'test-component',
        transports: [mockTransport],
        defaultContext: { sessionId: 'abc123' },
        redaction: { enabled: true }
      });
      
      logger.info('User action', { userId: 'user123' }, 'additional', 'args');
      
      expect(mockTransport.writeCalls).toHaveLength(1);
      expect(mockTransport.writeCalls[0]).toMatchObject({
        level: 'info',
        message: 'User action',
        context: { sessionId: 'abc123' },
        component: 'test-component'
      });
    });

    it('writes to all configured transports', () => {
      const transport1 = new MockTransport('transport1');
      const transport2 = new MockTransport('transport2');
      
      const logger = new LoggerImpl({
        transports: [transport1, transport2]
      });
      
      logger.info('test message');
      
      expect(transport1.writeCalls).toHaveLength(1);
      expect(transport2.writeCalls).toHaveLength(1);
      expect(transport1.writeCalls[0]).toEqual(transport2.writeCalls[0]);
    });

    it('handles transport write errors gracefully', () => {
      mockTransport.writeError = new Error('Transport error');
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      const logger = new LoggerImpl({ transports: [mockTransport] });
      
      // Should not throw despite transport error
      expect(() => logger.info('test')).not.toThrow();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Transport mock-transport write failed:'),
        expect.any(Error)
      );
      
      consoleSpy.mockRestore();
    });
  });

  describe('Metrics', () => {
    it('records structured metrics', () => {
      const logger = new LoggerImpl({
        component: 'metrics-component',
        transports: [mockTransport]
      });
      
      logger.metric('page_load_time', { duration: 1234, page: '/home' });
      
      expect(mockTransport.writeCalls).toHaveLength(1);
      expect(mockTransport.writeCalls[0]).toMatchObject({
        level: 'info',
        message: 'Metric: page_load_time'
      });
    });

    it('handles metrics with empty fields', () => {
      const logger = new LoggerImpl({ transports: [mockTransport] });
      logger.metric('simple_counter');
      
      expect(mockTransport.writeCalls).toHaveLength(1);
      expect(mockTransport.writeCalls[0]).toMatchObject({
        level: 'info',
        message: 'Metric: simple_counter'
      });
    });
  });

  describe('Contextual Logging', () => {
    it('creates child logger with additional context and redaction', () => {
      const parentLogger = new LoggerImpl({
        defaultContext: { service: 'auth' },
        transports: [mockTransport]
      });
      
      const childLogger = parentLogger.withContext({ userId: '123' });
      childLogger.info('User logged in');
      
      expect(mockTransport.writeCalls).toHaveLength(1);
      expect(mockTransport.writeCalls[0].context).toMatchObject({
        service: 'auth',
        userId: '<redacted>' // userId is redacted by default
      });
    });

    it('child logger has independent configuration', () => {
      const parentLogger = new LoggerImpl({ level: 'info' });
      const childLogger = parentLogger.withContext({ childProp: 'value' });
      
      expect(childLogger.name).toBe('default:child');
      expect(parentLogger.name).toBe('default');
      expect(childLogger.level).toBe('info');
    });
  });

  describe('Transport Management', () => {
    it('adds transport dynamically', () => {
      const logger = new LoggerImpl();
      const transport = new MockTransport();
      
      logger.addTransport(transport);
      logger.info('test');
      
      expect(transport.writeCalls).toHaveLength(1);
    });

    it('removes transport by name', () => {
      const logger = new LoggerImpl({ transports: [mockTransport] });
      
      logger.removeTransport(mockTransport.name);
      logger.info('test');
      
      expect(mockTransport.writeCalls).toHaveLength(0);
    });

    it('flushes all transports', async () => {
      const logger = new LoggerImpl({ transports: [mockTransport] });
      
      await logger.flush();
      
      expect(mockTransport.flushCalls).toBe(1);
    });

    it('handles transport flush errors', async () => {
      const faultyTransport = new MockTransport();
      faultyTransport.flush = vi.fn().mockImplementation(() => {
        throw new Error('Flush error');
      });
      
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const logger = new LoggerImpl({ transports: [faultyTransport] });
      
      await expect(logger.flush()).resolves.toBeUndefined();
      expect(consoleSpy).toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });
  });

  describe('Sampling', () => {
    it('applies sampling rates', () => {
      // Mock Math.random to control sampling
      const originalRandom = Math.random;
      Math.random = vi.fn().mockReturnValue(0.5); // 50%
      
      const logger = new LoggerImpl({ 
        level: 'trace',
        sampling: { warn: 0.6 }, // 60% sampling rate for warn
        transports: [mockTransport]
      });
      
      logger.warn('sampled in');
      
      expect(mockTransport.writeCalls).toHaveLength(1);
      expect(mockTransport.writeCalls[0]).toMatchObject({ level: 'warn' });
      
      Math.random = originalRandom;
    });
  });

  describe('PII Redaction', () => {
    it('redacts PII from log messages', () => {
      const logger = new LoggerImpl({ 
        redaction: { enabled: true },
        transports: [mockTransport]
      });
      
      logger.info('User email: user@example.com');
      
      expect(mockTransport.writeCalls).toHaveLength(1);
      expect(mockTransport.writeCalls[0].message).toBe('User email: <email>');
    });

    it('provides redact method for manual redaction', () => {
      const logger = new LoggerImpl({ redaction: { enabled: true } });
      
      const redacted = logger.redact('Contact me at user@example.com');
      expect(redacted).toBe('Contact me at <email>');
    });
  });
});

describe('createLogger Factory', () => {
  it('creates logger with configuration', () => {
    const logger = createLogger({
      level: 'debug',
      component: 'test'
    });
    
    expect(logger.level).toBe('debug');
    expect(logger.name).toBe('default');
  });

  it('creates logger with default configuration', () => {
    const logger = createLogger();
    
    expect(logger.level).toBe('info');
    expect(logger.name).toBe('default');
  });
});