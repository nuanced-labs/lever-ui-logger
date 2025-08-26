/**
 * Integration tests for logger with multiple transports
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { 
  createLogger,
  LoggerImpl
} from '../../src/logger/index.js';
import { ConsoleTransport } from '../../src/transports/index.js';
import { TEST_CONSTANTS } from '../test-constants.js';

// Mock transport for integration testing
class IntegrationMockTransport {
  public name: string;
  public events: any[] = [];
  public flushCalled = false;
  public closeCalled = false;

  constructor(name: string) {
    this.name = name;
  }

  write(eventData: any) {
    this.events.push({ ...eventData, transport: this.name });
  }

  flush() {
    this.flushCalled = true;
  }

  close() {
    this.closeCalled = true;
  }

  reset() {
    this.events = [];
    this.flushCalled = false;
    this.closeCalled = false;
  }
}

describe('Logger Integration Tests', () => {
  let transport1: IntegrationMockTransport;
  let transport2: IntegrationMockTransport;
  let consoleTransport: ConsoleTransport;
  
  beforeEach(() => {
    transport1 = new IntegrationMockTransport(TEST_CONSTANTS.TRANSPORT_NAMES.MOCK_1);
    transport2 = new IntegrationMockTransport(TEST_CONSTANTS.TRANSPORT_NAMES.MOCK_2);
    consoleTransport = new ConsoleTransport({ 
      enableInProduction: true,
      colors: false // Disable colors for testing
    });
  });

  afterEach(() => {
    transport1.reset();
    transport2.reset();
  });

  describe('Multi-Transport Logging', () => {
    it('writes the same log to all transports', () => {
      const logger = createLogger({
        component: TEST_CONSTANTS.COMPONENTS.INTEGRATION_TEST,
        level: TEST_CONSTANTS.LEVELS.DEBUG,
        transports: [transport1, transport2]
      });

      logger.info(TEST_CONSTANTS.MESSAGES.INTEGRATION_TEST_MESSAGE, { 
        testType: 'multi-transport',
        timestamp: Date.now()
      });

      // Both transports should receive the log
      expect(transport1.events).toHaveLength(1);
      expect(transport2.events).toHaveLength(1);

      // Log data should be identical
      const event1 = transport1.events[0];
      const event2 = transport2.events[0];

      expect(event1.level).toBe('info');
      expect(event2.level).toBe('info');
      expect(event1.message).toBe(TEST_CONSTANTS.MESSAGES.INTEGRATION_TEST_MESSAGE);
      expect(event2.message).toBe(TEST_CONSTANTS.MESSAGES.INTEGRATION_TEST_MESSAGE);
      expect(event1.component).toBe(TEST_CONSTANTS.COMPONENTS.INTEGRATION_TEST);
      expect(event2.component).toBe(TEST_CONSTANTS.COMPONENTS.INTEGRATION_TEST);
    });

    it('handles mixed transport failures gracefully', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      // Make transport1 fail
      transport1.write = () => {
        throw new Error('Transport 1 failed');
      };

      const logger = createLogger({
        transports: [transport1, transport2]
      });

      // Should not throw, but should log error
      expect(() => {
        logger.error('Test with failing transport');
      }).not.toThrow();

      // transport2 should still receive the log
      expect(transport2.events).toHaveLength(1);
      expect(transport2.events[0].message).toBe('Test with failing transport');

      // Console should log the transport error
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Transport mock-1 write failed:'),
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('PII Redaction Integration', () => {
    it('applies PII redaction across all transports', () => {
      const logger = createLogger({
        component: 'pii-test',
        transports: [transport1, transport2],
        redaction: { 
          mode: 'strict',
          enabled: true
        }
      });

      logger.info('User data', {
        email: 'user@example.com',
        phone: '+1-555-123-4567',
        normalData: 'this should not be redacted'
      });

      expect(transport1.events).toHaveLength(1);
      expect(transport2.events).toHaveLength(1);

      // Both transports should have redacted PII
      for (const transport of [transport1, transport2]) {
        const event = transport.events[0];
        console.log('Event context:', event.context);
        expect(event.context).toBeDefined();
        
        // Check if email exists and is redacted
        if (event.context.email) {
          expect(event.context.email).toMatch(/<.*redacted.*>/i);
        }
        if (event.context.phone) {
          expect(event.context.phone).toMatch(/<.*redacted.*>/i);
        }
        // Non-PII data should remain
        expect(event.context.normalData).toBe('this should not be redacted');
      }
    });
  });

  describe('Contextual Logging Integration', () => {
    it('child loggers work correctly with multiple transports', () => {
      const parentLogger = createLogger({
        component: 'parent-service',
        transports: [transport1, transport2],
        redaction: { enabled: false } // Disable PII redaction for this test
      });

      const childLogger = parentLogger.withContext({
        requestId: 'req-12345',
        customerId: 'cust-67890' // Use customerId instead of userId to avoid PII redaction
      });

      childLogger.warn('Child logger test', { additionalContext: 'test' });

      expect(transport1.events).toHaveLength(1);
      expect(transport2.events).toHaveLength(1);

      // Both transports should have the inherited context
      for (const transport of [transport1, transport2]) {
        const event = transport.events[0];
        console.log('Child logger context:', event.context);
        expect(event.context).toEqual({
          requestId: 'req-12345',
          customerId: 'cust-67890',
          additionalContext: 'test'
        });
      }
    });
  });

  describe('Performance Under Load', () => {
    it('handles concurrent logging from multiple loggers', () => {
      const logger1 = createLogger({
        component: 'concurrent-1',
        transports: [transport1]
      });

      const logger2 = createLogger({
        component: 'concurrent-2',
        transports: [transport2]
      });

      const promises: Promise<void>[] = [];

      // Simulate concurrent logging
      for (let i = 0; i < 50; i++) {
        promises.push(
          Promise.resolve().then(() => {
            logger1.info(`Logger1 message ${i}`);
            logger2.info(`Logger2 message ${i}`);
          })
        );
      }

      return Promise.all(promises).then(() => {
        // Each transport should receive 50 messages
        expect(transport1.events).toHaveLength(50);
        expect(transport2.events).toHaveLength(50);

        // Messages should be properly attributed
        expect(transport1.events[0].component).toBe('concurrent-1');
        expect(transport2.events[0].component).toBe('concurrent-2');
      });
    });
  });

  describe('Memory Management Integration', () => {
    it('cleans up resources properly when multiple loggers are destroyed', async () => {
      const loggers: Array<{ logger: ReturnType<typeof createLogger>; transport: IntegrationMockTransport }> = [];

      // Create multiple loggers
      for (let i = 0; i < 10; i++) {
        const transport = new IntegrationMockTransport(`transport-${i}`);
        const logger = createLogger({
          component: `service-${i}`,
          transports: [transport]
        });
        loggers.push({ logger, transport });
      }

      // Use all loggers
      loggers.forEach(({ logger }, i) => {
        logger.info(`Message from logger ${i}`);
      });

      // Destroy all loggers
      await Promise.all(loggers.map(({ logger }) => logger.destroy()));

      // All transports should be closed
      loggers.forEach(({ transport }) => {
        expect(transport.closeCalled).toBe(true);
      });
    });
  });

  describe('Configuration Validation Integration', () => {
    it('handles invalid configuration gracefully', () => {
      // Should not throw with missing transports
      expect(() => {
        const logger = createLogger({
          component: 'config-test',
          transports: [] // Empty transports array
        });
        logger.info('Test message');
      }).not.toThrow();
    });

    it('applies default configuration when partial config provided', () => {
      const logger = createLogger({
        transports: [transport1]
        // No level specified - should default
      });

      logger.debug('Debug message'); // Should be filtered by default level
      logger.info('Info message');   // Should pass

      expect(transport1.events).toHaveLength(1);
      expect(transport1.events[0].message).toBe('Info message');
    });
  });
});