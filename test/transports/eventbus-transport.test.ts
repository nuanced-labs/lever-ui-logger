/**
 * Tests for EventBus transport
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventBusTransport, createEventBusTransport, type EventBusTransportConfig, type EventBusInterface } from '../../src/transports/eventbus-transport.js';
import { LogEvent, MetricEvent, ErrorEvent } from '../../src/logger/events.js';
import type { LogEventData } from '../../src/logger/types.js';

describe('EventBusTransport', () => {
  let transport: EventBusTransport;
  let mockEventBus: EventBusInterface;
  let publishSpy: ReturnType<typeof vi.fn>;

  const defaultConfig: EventBusTransportConfig = {
    name: 'test-eventbus',
    enableSelfLogging: false,
    filterComponents: ['eventbus-transport'],
    silentErrors: false
  };

  const createMockEvent = (level: string = 'info', message: string = 'Test message'): LogEventData => ({
    level: level as LogEventData['level'],
    message,
    timestamp: Date.now(),
    component: 'test-component',
    context: { testId: '123' },
    args: [],
    logger: 'test-logger'
  });

  beforeEach(() => {
    publishSpy = vi.fn();
    mockEventBus = {
      post: publishSpy,
      isConnected: vi.fn().mockReturnValue(true)
    };
  });

  describe('initialization', () => {
    it('should create transport with default configuration', () => {
      transport = new EventBusTransport(mockEventBus);
      expect(transport.name).toBe('eventbus');
    });

    it('should accept custom configuration', () => {
      transport = new EventBusTransport(mockEventBus, {
        name: 'custom-eventbus',
        enableSelfLogging: true,
        filterComponents: ['custom-filter']
      });
      expect(transport.name).toBe('custom-eventbus');
    });

    it('should handle EventBus without isConnected method', () => {
      const simpleEventBus = { post: publishSpy };
      transport = new EventBusTransport(simpleEventBus, defaultConfig);
      expect(transport).toBeInstanceOf(EventBusTransport);
    });
  });

  describe('event publishing', () => {
    beforeEach(() => {
      transport = new EventBusTransport(mockEventBus, defaultConfig);
    });

    it('should publish LogEvent for regular log messages', () => {
      const event = createMockEvent('info', 'Test log message');
      transport.write(event);

      expect(publishSpy).toHaveBeenCalledTimes(1);
      const publishedEvent = publishSpy.mock.calls[0][0];
      expect(publishedEvent).toBeInstanceOf(LogEvent);
      expect(publishedEvent.level).toBe('info');
      expect(publishedEvent.message).toBe('Test log message');
      expect(publishedEvent.component).toBe('test-component');
    });

    it('should publish ErrorEvent for error level logs', () => {
      const event = createMockEvent('error', 'Something went wrong');
      transport.write(event);

      expect(publishSpy).toHaveBeenCalledTimes(1);
      const publishedEvent = publishSpy.mock.calls[0][0];
      expect(publishedEvent).toBeInstanceOf(ErrorEvent);
      expect(publishedEvent.error.message).toBe('Something went wrong');
    });

    it('should publish ErrorEvent when Error object in context', () => {
      const testError = new Error('Test error');
      const event: LogEventData = {
        ...createMockEvent('info', 'Error occurred'),
        context: { error: testError, userId: '123' }
      };
      
      transport.write(event);

      expect(publishSpy).toHaveBeenCalledTimes(1);
      const publishedEvent = publishSpy.mock.calls[0][0];
      expect(publishedEvent).toBeInstanceOf(ErrorEvent);
      expect(publishedEvent.error).toBe(testError);
      expect(publishedEvent.handled).toBe(true);
    });

    it('should publish ErrorEvent when Error object in args', () => {
      const testError = new Error('Arg error');
      const event: LogEventData = {
        ...createMockEvent('info', 'Error in args'),
        args: [testError, 'additional data']
      };
      
      transport.write(event);

      expect(publishSpy).toHaveBeenCalledTimes(1);
      const publishedEvent = publishSpy.mock.calls[0][0];
      expect(publishedEvent).toBeInstanceOf(ErrorEvent);
      expect(publishedEvent.error).toBe(testError);
    });

    it('should publish MetricEvent for metric-style messages', () => {
      const event: LogEventData = {
        ...createMockEvent('info', 'timing: page load'),
        context: { duration: 1234, endpoint: '/api/users' }
      };
      
      transport.write(event);

      expect(publishSpy).toHaveBeenCalledTimes(1);
      const publishedEvent = publishSpy.mock.calls[0][0];
      expect(publishedEvent).toBeInstanceOf(MetricEvent);
      expect(publishedEvent.name).toBe('page load');
      expect(publishedEvent.fields).toEqual({ duration: 1234 });
      expect(publishedEvent.context).toEqual({ endpoint: '/api/users' });
    });

    it('should detect metrics by numeric data and keywords', () => {
      const event: LogEventData = {
        ...createMockEvent('info', 'Response time measured'),
        context: { responseTime: 234, status: 'success' }
      };
      
      transport.write(event);

      expect(publishSpy).toHaveBeenCalledTimes(1);
      const publishedEvent = publishSpy.mock.calls[0][0];
      expect(publishedEvent).toBeInstanceOf(MetricEvent);
      expect(publishedEvent.fields).toEqual({ responseTime: 234 });
      expect(publishedEvent.context).toEqual({ status: 'success' });
    });

    it('should preserve timestamp from original event', () => {
      const testTimestamp = 1640995200000;
      const event = { ...createMockEvent('info'), timestamp: testTimestamp };
      
      transport.write(event);

      const publishedEvent = publishSpy.mock.calls[0][0];
      expect(publishedEvent.timestamp).toBe(testTimestamp);
    });
  });

  describe('infinite loop prevention', () => {
    it('should filter out events from transport itself when self-logging disabled', () => {
      transport = new EventBusTransport(mockEventBus, {
        ...defaultConfig,
        enableSelfLogging: false
      });

      const event = { ...createMockEvent('info'), component: 'test-eventbus' };
      transport.write(event);

      expect(publishSpy).not.toHaveBeenCalled();
    });

    it('should allow events from transport when self-logging enabled', () => {
      transport = new EventBusTransport(mockEventBus, {
        ...defaultConfig,
        enableSelfLogging: true
      });

      const event = { ...createMockEvent('info'), component: 'test-eventbus' };
      transport.write(event);

      expect(publishSpy).toHaveBeenCalledTimes(1);
    });

    it('should filter out events from configured filter components', () => {
      transport = new EventBusTransport(mockEventBus, {
        ...defaultConfig,
        filterComponents: ['blocked-component', 'another-blocked']
      });

      const event1 = { ...createMockEvent('info'), component: 'blocked-component' };
      const event2 = { ...createMockEvent('info'), component: 'another-blocked' };
      const event3 = { ...createMockEvent('info'), component: 'allowed-component' };

      transport.write(event1);
      transport.write(event2);
      transport.write(event3);

      expect(publishSpy).toHaveBeenCalledTimes(1);
      const publishedEvent = publishSpy.mock.calls[0][0];
      expect(publishedEvent.component).toBe('allowed-component');
    });

    it('should process events from non-filtered components', () => {
      transport = new EventBusTransport(mockEventBus, {
        ...defaultConfig,
        filterComponents: ['blocked-component']
      });

      const event = { ...createMockEvent('info'), component: 'normal-component' };
      transport.write(event);

      expect(publishSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('EventBus health checks', () => {
    it('should skip publishing when EventBus is not connected', () => {
      const disconnectedEventBus = {
        post: publishSpy,
        isConnected: vi.fn().mockReturnValue(false)
      };

      transport = new EventBusTransport(disconnectedEventBus, defaultConfig);
      const event = createMockEvent('info');
      
      transport.write(event);

      expect(publishSpy).not.toHaveBeenCalled();
    });

    it('should log warning when EventBus not connected and silentErrors false', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const disconnectedEventBus = {
        post: publishSpy,
        isConnected: vi.fn().mockReturnValue(false)
      };

      transport = new EventBusTransport(disconnectedEventBus, {
        ...defaultConfig,
        silentErrors: false
      });
      
      transport.write(createMockEvent('info'));

      expect(consoleSpy).toHaveBeenCalledWith(
        'EventBus transport: EventBus not available, skipping event'
      );
      
      consoleSpy.mockRestore();
    });

    it('should not log warning when EventBus not connected and silentErrors true', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const disconnectedEventBus = {
        post: publishSpy,
        isConnected: vi.fn().mockReturnValue(false)
      };

      transport = new EventBusTransport(disconnectedEventBus, {
        ...defaultConfig,
        silentErrors: true
      });
      
      transport.write(createMockEvent('info'));

      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should handle missing EventBus gracefully', () => {
      transport = new EventBusTransport(null as any, defaultConfig);
      
      expect(() => {
        transport.write(createMockEvent('info'));
      }).not.toThrow();
      
      expect(publishSpy).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle synchronous publish errors', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      publishSpy.mockImplementation(() => {
        throw new Error('Publish failed');
      });

      transport = new EventBusTransport(mockEventBus, defaultConfig);
      
      expect(() => {
        transport.write(createMockEvent('info'));
      }).not.toThrow();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('EventBus transport: Post failed: Publish failed')
      );
      
      consoleSpy.mockRestore();
    });

    it('should handle asynchronous publish errors', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      publishSpy.mockReturnValue(Promise.reject(new Error('Async post failed')));

      transport = new EventBusTransport(mockEventBus, defaultConfig);
      transport.write(createMockEvent('info'));

      // Wait for async error handling
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('EventBus transport: Post failed: Async post failed')
      );
      
      consoleSpy.mockRestore();
    });

    it('should suppress error logging when silentErrors is true', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      publishSpy.mockImplementation(() => {
        throw new Error('Silent error');
      });

      transport = new EventBusTransport(mockEventBus, {
        ...defaultConfig,
        silentErrors: true
      });
      
      transport.write(createMockEvent('info'));

      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should handle non-Error exceptions', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      publishSpy.mockImplementation(() => {
        throw 'String error'; // Non-Error exception
      });

      transport = new EventBusTransport(mockEventBus, defaultConfig);
      transport.write(createMockEvent('info'));

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('EventBus transport: Post failed: String error')
      );
      
      consoleSpy.mockRestore();
    });
  });

  describe('custom event transformation', () => {
    it('should use custom event transformer when provided', () => {
      const customTransformer = vi.fn().mockReturnValue(
        new LogEvent('debug', 'Custom transformed', {}, [], 'custom', 'transformer')
      );

      transport = new EventBusTransport(mockEventBus, {
        ...defaultConfig,
        eventTransformer: customTransformer
      });

      const event = createMockEvent('info', 'Original message');
      transport.write(event);

      expect(customTransformer).toHaveBeenCalledWith(
        event,
        expect.objectContaining({
          transportName: 'test-eventbus',
          transformTimestamp: expect.any(Number)
        })
      );

      expect(publishSpy).toHaveBeenCalledTimes(1);
      const publishedEvent = publishSpy.mock.calls[0][0];
      expect(publishedEvent.message).toBe('Custom transformed');
    });

    it('should fall back to default transformation when custom transformer fails', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const customTransformer = vi.fn().mockImplementation(() => {
        throw new Error('Transformer failed');
      });

      transport = new EventBusTransport(mockEventBus, {
        ...defaultConfig,
        eventTransformer: customTransformer
      });

      const event = createMockEvent('info', 'Fallback test');
      transport.write(event);

      expect(consoleSpy).toHaveBeenCalledWith(
        'EventBus transport: Custom transformer failed',
        expect.any(Error)
      );

      expect(publishSpy).toHaveBeenCalledTimes(1);
      const publishedEvent = publishSpy.mock.calls[0][0];
      expect(publishedEvent).toBeInstanceOf(LogEvent);
      expect(publishedEvent.message).toBe('Fallback test');
      
      consoleSpy.mockRestore();
    });

    it('should not publish when custom transformer returns null', () => {
      const customTransformer = vi.fn().mockReturnValue(null);

      transport = new EventBusTransport(mockEventBus, {
        ...defaultConfig,
        eventTransformer: customTransformer
      });

      transport.write(createMockEvent('info'));

      expect(customTransformer).toHaveBeenCalled();
      expect(publishSpy).not.toHaveBeenCalled();
    });
  });

  describe('metadata handling', () => {
    it('should include transform metadata in transformer calls', () => {
      const customTransformer = vi.fn().mockReturnValue(
        new LogEvent('info', 'test', {}, [], 'comp', 'logger')
      );

      transport = new EventBusTransport(mockEventBus, {
        ...defaultConfig,
        eventTransformer: customTransformer,
        transformMetadata: {
          appVersion: '1.0.0',
          environment: 'test'
        }
      });

      transport.write(createMockEvent('info'));

      expect(customTransformer).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          transportName: 'test-eventbus',
          transformTimestamp: expect.any(Number),
          metadata: {
            appVersion: '1.0.0',
            environment: 'test'
          }
        })
      );
    });

    it('should handle empty transform metadata', () => {
      const customTransformer = vi.fn().mockReturnValue(
        new LogEvent('info', 'test', {}, [], 'comp', 'logger')
      );

      transport = new EventBusTransport(mockEventBus, {
        ...defaultConfig,
        eventTransformer: customTransformer
      });

      transport.write(createMockEvent('info'));

      expect(customTransformer).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          metadata: {}
        })
      );
    });
  });

  describe('transport lifecycle', () => {
    beforeEach(() => {
      transport = new EventBusTransport(mockEventBus, defaultConfig);
    });

    it('should flush immediately (no-op)', async () => {
      await expect(transport.flush()).resolves.toBeUndefined();
    });

    it('should close gracefully (no-op)', async () => {
      await expect(transport.close()).resolves.toBeUndefined();
    });

    it('should continue working after flush and close', () => {
      transport.flush();
      transport.close();
      
      transport.write(createMockEvent('info'));
      expect(publishSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('metric detection edge cases', () => {
    it('should handle mixed numeric and non-numeric context', () => {
      const event: LogEventData = {
        ...createMockEvent('info', 'Response time analysis'),
        context: {
          duration: 123,
          status: 'success',
          count: 45,
          message: 'completed'
        }
      };

      transport = new EventBusTransport(mockEventBus, defaultConfig);
      transport.write(event);

      const publishedEvent = publishSpy.mock.calls[0][0];
      expect(publishedEvent).toBeInstanceOf(MetricEvent);
      expect(publishedEvent.fields).toEqual({ duration: 123, count: 45 });
      expect(publishedEvent.context).toEqual({ status: 'success', message: 'completed' });
    });

    it('should not create metrics for NaN values', () => {
      const event: LogEventData = {
        ...createMockEvent('info', 'Invalid timing data'),
        context: { duration: NaN, count: 'invalid' }
      };

      transport = new EventBusTransport(mockEventBus, defaultConfig);
      transport.write(event);

      const publishedEvent = publishSpy.mock.calls[0][0];
      expect(publishedEvent).toBeInstanceOf(LogEvent); // Should fallback to LogEvent
    });
  });

  describe('lifecycle events', () => {
    beforeEach(() => {
      transport = new EventBusTransport(mockEventBus, {
        ...defaultConfig,
        enableLifecycleEvents: true
      });
    });

    it('should publish logger created events', () => {
      const config = { level: 'info', component: 'test' };
      const loggerName = 'test-logger';

      transport.publishLifecycleEvent('created', config, loggerName);

      expect(publishSpy).toHaveBeenCalledTimes(1);
      const publishedEvent = publishSpy.mock.calls[0][0];
      expect(publishedEvent.constructor.name).toBe('LoggerCreatedEvent');
      expect(publishedEvent.name).toBe(loggerName);
      expect(publishedEvent.config).toEqual(config);
    });

    it('should publish logger destroyed events', () => {
      const loggerName = 'test-logger';

      transport.publishLifecycleEvent('destroyed', undefined, loggerName);

      expect(publishSpy).toHaveBeenCalledTimes(1);
      const publishedEvent = publishSpy.mock.calls[0][0];
      expect(publishedEvent.constructor.name).toBe('LoggerDestroyedEvent');
      expect(publishedEvent.name).toBe(loggerName);
      expect(publishedEvent.reason).toBe('Logger destroyed via transport');
    });

    it('should publish config changed events', () => {
      const config = { level: 'debug', component: 'updated' };
      const loggerName = 'test-logger';

      transport.publishLifecycleEvent('config-changed', config, loggerName);

      expect(publishSpy).toHaveBeenCalledTimes(1);
      const publishedEvent = publishSpy.mock.calls[0][0];
      expect(publishedEvent.constructor.name).toBe('LoggerConfigChangedEvent');
      expect(publishedEvent.loggerName).toBe(loggerName);
      expect(publishedEvent.newConfig).toEqual(config);
      expect(publishedEvent.changes).toEqual(['transport-initiated']);
    });

    it('should use transport name as default logger name', () => {
      transport.publishLifecycleEvent('created', { level: 'info' });

      expect(publishSpy).toHaveBeenCalledTimes(1);
      const publishedEvent = publishSpy.mock.calls[0][0];
      expect(publishedEvent.name).toBe(defaultConfig.name);
    });

    it('should not publish lifecycle events when disabled', () => {
      transport = new EventBusTransport(mockEventBus, {
        ...defaultConfig,
        enableLifecycleEvents: false
      });

      transport.publishLifecycleEvent('created', { level: 'info' });

      expect(publishSpy).not.toHaveBeenCalled();
    });

    it('should handle lifecycle event publishing errors gracefully', () => {
      publishSpy.mockImplementation(() => {
        throw new Error('EventBus post failed');
      });

      // Should not throw
      expect(() => {
        transport.publishLifecycleEvent('created', { level: 'info' });
      }).not.toThrow();
    });

    it('should not publish lifecycle events when EventBus is not ready', () => {
      mockEventBus.isConnected = vi.fn().mockReturnValue(false);

      transport.publishLifecycleEvent('created', { level: 'info' });

      expect(publishSpy).not.toHaveBeenCalled();
    });

    it('should handle async EventBus publish for lifecycle events', async () => {
      const asyncPromise = Promise.resolve();
      publishSpy.mockReturnValue(asyncPromise);

      transport.publishLifecycleEvent('created', { level: 'info' });

      expect(publishSpy).toHaveBeenCalledTimes(1);
      await asyncPromise; // Ensure async handling works
    });

    it('should handle async EventBus publish errors for lifecycle events', async () => {
      const rejectPromise = Promise.reject(new Error('Async post failed'));
      publishSpy.mockReturnValue(rejectPromise);

      transport.publishLifecycleEvent('created', { level: 'info' });

      expect(publishSpy).toHaveBeenCalledTimes(1);
      
      // Suppress the unhandled promise rejection for test
      try {
        await rejectPromise;
      } catch {
        // Expected to fail
      }
    });
  });

  describe('factory function', () => {
    it('should create transport using factory', () => {
      const transport = createEventBusTransport(mockEventBus, {
        name: 'factory-test',
        silentErrors: true
      });

      expect(transport).toBeInstanceOf(EventBusTransport);
      expect(transport.name).toBe('factory-test');
    });

    it('should create transport with default config when none provided', () => {
      const transport = createEventBusTransport(mockEventBus);

      expect(transport).toBeInstanceOf(EventBusTransport);
      expect(transport.name).toBe('eventbus');
    });
  });
});