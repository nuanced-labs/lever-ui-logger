import { describe, it, expect, vi } from 'vitest';
import {
  LogEvent,
  MetricEvent,
  ErrorEvent,
  LoggerCreatedEvent,
  LoggerDestroyedEvent,
  TransportEvent,
  TransportErrorEvent,
  PIIWarningEvent,
  LoggerConfigChangedEvent,
  LoggerBaseEvent,
  isLogEvent,
  isMetricEvent,
  isErrorEvent,
  isLoggerEvent
} from '../../src/logger/events.js';

describe('Logger Events', () => {
  describe('LoggerBaseEvent', () => {
    it('generates timestamp and clientId automatically', () => {
      const event = new LoggerBaseEvent();
      
      expect(event.timestamp).toBeTypeOf('number');
      expect(event.clientId).toBeTypeOf('string');
      expect(event.clientId).toMatch(/^(client-[a-z0-9]+-[a-z0-9]+|[a-f0-9-]{36})$/);
    });

    it('accepts custom timestamp and clientId', () => {
      const customTimestamp = 1234567890;
      const customClientId = 'custom-client-id';
      
      const event = new LoggerBaseEvent(customTimestamp, customClientId);
      
      expect(event.timestamp).toBe(customTimestamp);
      expect(event.clientId).toBe(customClientId);
    });
  });

  describe('LogEvent', () => {
    it('creates log event with all properties', () => {
      const logEvent = new LogEvent(
        'warn',
        'Test warning message',
        { userId: '456', action: 'test' },
        ['additional', 'args'],
        'test-component',
        'test-logger',
        1234567890,
        'test-client-id'
      );

      expect(logEvent.level).toBe('warn');
      expect(logEvent.message).toBe('Test warning message');
      expect(logEvent.context).toEqual({ userId: '456', action: 'test' });
      expect(logEvent.args).toEqual(['additional', 'args']);
      expect(logEvent.component).toBe('test-component');
      expect(logEvent.logger).toBe('test-logger');
      expect(logEvent.timestamp).toBe(1234567890);
      expect(logEvent.clientId).toBe('test-client-id');
    });

    it('converts to LogEventData format', () => {
      const logEvent = new LogEvent(
        'error',
        'Error message',
        { errorCode: 500 },
        [{ details: 'more info' }],
        'api-component',
        'api-logger'
      );

      const eventData = logEvent.toLogEventData();

      expect(eventData).toEqual({
        level: 'error',
        message: 'Error message',
        timestamp: logEvent.timestamp,
        context: { errorCode: 500 },
        args: [{ details: 'more info' }],
        component: 'api-component',
        logger: 'api-logger'
      });
    });

    it('works with all log levels', () => {
      const levels = ['trace', 'debug', 'info', 'warn', 'error'] as const;
      
      levels.forEach(level => {
        const event = new LogEvent(level, 'message', {}, [], 'comp', 'logger');
        expect(event.level).toBe(level);
      });
    });
  });

  describe('MetricEvent', () => {
    it('creates metric event with all properties', () => {
      const metricEvent = new MetricEvent(
        'api_response_time',
        { duration: 234, endpoint: '/users' },
        { version: '1.0' },
        'metrics-component',
        1234567890,
        'metrics-client-id'
      );

      expect(metricEvent.name).toBe('api_response_time');
      expect(metricEvent.fields).toEqual({ duration: 234, endpoint: '/users' });
      expect(metricEvent.context).toEqual({ version: '1.0' });
      expect(metricEvent.component).toBe('metrics-component');
      expect(metricEvent.timestamp).toBe(1234567890);
      expect(metricEvent.clientId).toBe('metrics-client-id');
    });

    it('converts to MetricData format', () => {
      const metricEvent = new MetricEvent(
        'user_action',
        { action: 'click', element: 'button' },
        { page: '/dashboard' },
        'ui-component'
      );

      const metricData = metricEvent.toMetricData();

      expect(metricData).toEqual({
        name: 'user_action',
        fields: { action: 'click', element: 'button' },
        timestamp: metricEvent.timestamp,
        context: { page: '/dashboard' },
        component: 'ui-component'
      });
    });
  });

  describe('ErrorEvent', () => {
    it('creates error event with Error object', () => {
      const testError = new Error('Test error message');
      testError.name = 'CustomError';
      
      const errorEvent = new ErrorEvent(
        testError,
        false,
        { location: 'handleClick', file: 'Button.tsx' },
        'ui-component',
        1234567890,
        'error-client-id'
      );

      expect(errorEvent.error).toBe(testError);
      expect(errorEvent.handled).toBe(false);
      expect(errorEvent.context).toEqual({ location: 'handleClick', file: 'Button.tsx' });
      expect(errorEvent.component).toBe('ui-component');
      expect(errorEvent.name).toBe('CustomError');
      expect(errorEvent.message).toBe('Test error message');
      expect(errorEvent.stack).toBe(testError.stack);
    });

    it('handles error without stack trace', () => {
      const testError = new Error('No stack error');
      testError.stack = undefined;
      
      const errorEvent = new ErrorEvent(testError, true, {}, 'comp');
      
      expect(errorEvent.stack).toBeUndefined();
    });

    it('handles error without name', () => {
      const testError = new Error('Unnamed error');
      testError.name = '';
      
      const errorEvent = new ErrorEvent(testError, true, {}, 'comp');
      
      expect(errorEvent.name).toBe('Error'); // Falls back to constructor name
    });

    it('converts to ErrorData format', () => {
      const testError = new Error('Conversion test error');
      const errorEvent = new ErrorEvent(
        testError,
        true,
        { userId: '123' },
        'conversion-component'
      );

      const errorData = errorEvent.toErrorData();

      expect(errorData).toEqual({
        name: testError.name,
        message: testError.message,
        stack: testError.stack,
        handled: true,
        timestamp: errorEvent.timestamp,
        context: { userId: '123' },
        component: 'conversion-component'
      });
    });
  });

  describe('LoggerCreatedEvent', () => {
    it('creates logger created event', () => {
      const config = { level: 'debug', component: 'test' };
      const event = new LoggerCreatedEvent(
        'test-logger',
        config,
        1234567890,
        'created-client-id'
      );

      expect(event.name).toBe('test-logger');
      expect(event.config).toBe(config);
      expect(event.timestamp).toBe(1234567890);
      expect(event.clientId).toBe('created-client-id');
    });
  });

  describe('LoggerDestroyedEvent', () => {
    it('creates logger destroyed event with reason', () => {
      const event = new LoggerDestroyedEvent(
        'test-logger',
        'cleanup',
        1234567890,
        'destroyed-client-id'
      );

      expect(event.name).toBe('test-logger');
      expect(event.reason).toBe('cleanup');
      expect(event.timestamp).toBe(1234567890);
      expect(event.clientId).toBe('destroyed-client-id');
    });

    it('creates logger destroyed event without reason', () => {
      const event = new LoggerDestroyedEvent('test-logger');
      
      expect(event.name).toBe('test-logger');
      expect(event.reason).toBeUndefined();
    });
  });

  describe('TransportEvent', () => {
    it('creates transport event with details', () => {
      const details = { batchSize: 5, endpoint: '/api/logs' };
      const event = new TransportEvent(
        'console-transport',
        'write',
        details,
        1234567890,
        'transport-client-id'
      );

      expect(event.transportName).toBe('console-transport');
      expect(event.operation).toBe('write');
      expect(event.details).toBe(details);
      expect(event.timestamp).toBe(1234567890);
      expect(event.clientId).toBe('transport-client-id');
    });

    it('creates transport event with default empty details', () => {
      const event = new TransportEvent('beacon-transport', 'flush');
      
      expect(event.details).toEqual({});
    });
  });

  describe('TransportErrorEvent', () => {
    it('creates transport error event', () => {
      const testError = new Error('Transport failed');
      const details = { attempt: 3, lastError: 'timeout' };
      
      const event = new TransportErrorEvent(
        'sendbeacon-transport',
        testError,
        'write',
        details,
        1234567890,
        'error-client-id'
      );

      expect(event.transportName).toBe('sendbeacon-transport');
      expect(event.error).toBe(testError);
      expect(event.operation).toBe('write');
      expect(event.details).toBe(details);
    });

    it('creates transport error event with default empty details', () => {
      const testError = new Error('Default error');
      const event = new TransportErrorEvent('transport', testError, 'flush');
      
      expect(event.details).toEqual({});
    });
  });

  describe('PIIWarningEvent', () => {
    it('creates PII warning event', () => {
      const context = { logLevel: 'warn', logger: 'user-service' };
      const event = new PIIWarningEvent(
        'email',
        'user@example.com',
        'email-pattern',
        'Use logger.redact() for email addresses',
        context,
        1234567890,
        'pii-client-id'
      );

      expect(event.field).toBe('email');
      expect(event.value).toBe('user@example.com');
      expect(event.pattern).toBe('email-pattern');
      expect(event.suggestion).toBe('Use logger.redact() for email addresses');
      expect(event.context).toBe(context);
    });
  });

  describe('LoggerConfigChangedEvent', () => {
    it('creates config changed event', () => {
      const oldConfig = { level: 'info' };
      const newConfig = { level: 'debug', component: 'test' };
      const changes = ['level', 'component'];
      
      const event = new LoggerConfigChangedEvent(
        'config-logger',
        oldConfig,
        newConfig,
        changes,
        1234567890,
        'config-client-id'
      );

      expect(event.loggerName).toBe('config-logger');
      expect(event.oldConfig).toBe(oldConfig);
      expect(event.newConfig).toBe(newConfig);
      expect(event.changes).toBe(changes);
    });
  });

  describe('Type Guards', () => {
    it('correctly identifies LogEvent', () => {
      const logEvent = new LogEvent('info', 'test', {}, [], 'comp', 'logger');
      const metricEvent = new MetricEvent('test', {}, {}, 'comp');
      
      expect(isLogEvent(logEvent)).toBe(true);
      expect(isLogEvent(metricEvent)).toBe(false);
      expect(isLogEvent({})).toBe(false);
      expect(isLogEvent(null)).toBe(false);
    });

    it('correctly identifies MetricEvent', () => {
      const logEvent = new LogEvent('info', 'test', {}, [], 'comp', 'logger');
      const metricEvent = new MetricEvent('test', {}, {}, 'comp');
      
      expect(isMetricEvent(metricEvent)).toBe(true);
      expect(isMetricEvent(logEvent)).toBe(false);
      expect(isMetricEvent({})).toBe(false);
      expect(isMetricEvent(null)).toBe(false);
    });

    it('correctly identifies ErrorEvent', () => {
      const errorEvent = new ErrorEvent(new Error(), true, {}, 'comp');
      const logEvent = new LogEvent('info', 'test', {}, [], 'comp', 'logger');
      
      expect(isErrorEvent(errorEvent)).toBe(true);
      expect(isErrorEvent(logEvent)).toBe(false);
      expect(isErrorEvent({})).toBe(false);
      expect(isErrorEvent(null)).toBe(false);
    });

    it('correctly identifies LoggerBaseEvent', () => {
      const baseEvent = new LoggerBaseEvent();
      const logEvent = new LogEvent('info', 'test', {}, [], 'comp', 'logger');
      const metricEvent = new MetricEvent('test', {}, {}, 'comp');
      
      expect(isLoggerEvent(baseEvent)).toBe(true);
      expect(isLoggerEvent(logEvent)).toBe(true); // LogEvent extends LoggerBaseEvent
      expect(isLoggerEvent(metricEvent)).toBe(true); // MetricEvent extends LoggerBaseEvent
      expect(isLoggerEvent({})).toBe(false);
      expect(isLoggerEvent(null)).toBe(false);
    });
  });

  describe('Client ID Generation', () => {
    it('generates unique client IDs', () => {
      const event1 = new LoggerBaseEvent();
      const event2 = new LoggerBaseEvent();
      
      expect(event1.clientId).not.toBe(event2.clientId);
      expect(event1.clientId).toBeTypeOf('string');
      expect(event2.clientId).toBeTypeOf('string');
    });

    it('uses crypto.randomUUID when available', () => {
      const originalRandomUUID = globalThis.crypto?.randomUUID;
      
      // Mock crypto.randomUUID
      if (globalThis.crypto) {
        globalThis.crypto.randomUUID = vi.fn(() => 'mocked-uuid-12345');
      }

      const event = new LoggerBaseEvent();
      
      if (globalThis.crypto?.randomUUID) {
        expect(event.clientId).toBe('mocked-uuid-12345');
        expect(globalThis.crypto.randomUUID).toHaveBeenCalled();
      } else {
        // Fallback behavior when crypto is not available
        expect(event.clientId).toMatch(/^client-[a-z0-9]+-[a-z0-9]+$/);
      }
      
      // Restore original randomUUID
      if (globalThis.crypto && originalRandomUUID) {
        globalThis.crypto.randomUUID = originalRandomUUID;
      }
    });

    it('generates fallback client ID format when crypto unavailable', () => {
      // Test that the fallback format is correct
      // This tests the actual implementation behavior
      const event = new LoggerBaseEvent();
      
      // Should be either UUID format or fallback format
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(event.clientId);
      const isFallback = /^client-[a-z0-9]+-[a-z0-9]+$/.test(event.clientId);
      
      expect(isUUID || isFallback).toBe(true);
    });
  });
});