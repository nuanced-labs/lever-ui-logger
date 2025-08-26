/**
 * @fileoverview Tests for transport middleware system
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  TransportMiddleware,
  filterByLevel,
  ensureTimestamp,
  addMetadata,
  transformEvent,
  rateLimit,
  sample,
  enrichErrors,
  batchAggregator,
  type MiddlewareContext,
} from '../../src/transports/transport-middleware.js';
import type { LogEventData } from '../../src/logger/types.js';

describe('TransportMiddleware', () => {
  let middleware: TransportMiddleware;

  beforeEach(() => {
    middleware = new TransportMiddleware();
  });

  // Helper function to create LogEventData objects
  const createLogEvent = (overrides: Partial<LogEventData>): LogEventData => ({
    level: 'info',
    message: 'test message',
    timestamp: Date.now(),
    context: {},
    args: [],
    component: 'test',
    logger: 'test-logger',
    ...overrides,
  });

  describe('basic functionality', () => {
    it('should execute middleware in order', async () => {
      const order: number[] = [];
      
      middleware.use((_ctx, next) => {
        order.push(1);
        next();
        order.push(4);
      });
      
      middleware.use((_ctx, next) => {
        order.push(2);
        next();
        order.push(3);
      });

      const event = createLogEvent({ message: 'test' });

      await middleware.execute(event);
      expect(order).toEqual([1, 2, 3, 4]);
    });

    it('should pass context through middleware chain', async () => {
      middleware.use((ctx, next) => {
        ctx.metadata.added = 'first';
        next();
      });
      
      middleware.use((ctx, next) => {
        expect(ctx.metadata.added).toBe('first');
        ctx.metadata.second = true;
        next();
      });

      const event = createLogEvent({ message: 'test' });

      const result = await middleware.execute(event);
      expect(result?.metadata.added).toBe('first');
      expect(result?.metadata.second).toBe(true);
    });

    it('should skip logs when context.skip is set', async () => {
      middleware.use((ctx, next) => {
        ctx.skip = true;
        next();
      });

      const event = createLogEvent({ message: 'test' });

      const result = await middleware.execute(event);
      expect(result).toBeNull();
    });

    it('should handle async middleware', async () => {
      const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
      
      middleware.use(async (ctx, next) => {
        await delay(10);
        ctx.metadata.async = true;
        await next();
      });

      const event = createLogEvent({ message: 'test' });

      const result = await middleware.execute(event);
      expect(result?.metadata.async).toBe(true);
    });

    it('should continue on middleware error', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      middleware.use((_ctx, _next) => {
        throw new Error('Middleware error');
      });
      
      middleware.use((ctx, next) => {
        ctx.metadata.afterError = true;
        next();
      });

      const event = createLogEvent({ message: 'test' });

      const result = await middleware.execute(event);
      expect(result?.metadata.afterError).toBe(true);
      expect(consoleSpy).toHaveBeenCalled();
      
      consoleSpy.mockRestore();
    });

    it('should respect level filtering in options', async () => {
      const fn = vi.fn((_ctx, next) => next());
      
      middleware.use(fn, { levels: ['error', 'warn'] });

      const infoEvent = createLogEvent({ level: 'info', message: 'info' });

      const errorEvent = createLogEvent({ level: 'error', message: 'error' });

      await middleware.execute(infoEvent);
      expect(fn).not.toHaveBeenCalled();

      await middleware.execute(errorEvent);
      expect(fn).toHaveBeenCalled();
    });

    it('should respect condition in options', async () => {
      const fn = vi.fn((_ctx, next) => next());
      
      middleware.use(fn, {
        condition: (ctx) => ctx.event.message.includes('important')
      });

      const normalEvent = createLogEvent({ level: 'info', message: 'normal' });

      const importantEvent = createLogEvent({ level: 'info', message: 'important message' });

      await middleware.execute(normalEvent);
      expect(fn).not.toHaveBeenCalled();

      await middleware.execute(importantEvent);
      expect(fn).toHaveBeenCalled();
    });

    it('should clear middleware', () => {
      middleware.use((_ctx, next) => next());
      middleware.use((_ctx, next) => next());
      
      expect(middleware.length).toBe(2);
      
      middleware.clear();
      expect(middleware.length).toBe(0);
    });
  });

  describe('filterByLevel middleware', () => {
    it('should filter logs below minimum level', async () => {
      middleware.use(filterByLevel('warn'));

      const debugEvent = createLogEvent({ level: 'debug', message: 'debug' });

      const warnEvent = createLogEvent({ level: 'warn', message: 'warn' });

      const debugResult = await middleware.execute(debugEvent);
      expect(debugResult).toBeNull();

      const warnResult = await middleware.execute(warnEvent);
      expect(warnResult).not.toBeNull();
    });

    it('should respect level hierarchy', async () => {
      middleware.use(filterByLevel('info'));

      const levels: Array<[LogEventData['level'], boolean]> = [
        ['trace', false],
        ['debug', false],
        ['info', true],
        ['warn', true],
        ['error', true],
      ];

      for (const [level, shouldPass] of levels) {
        const event = createLogEvent({ level, message: level });

        const result = await middleware.execute(event);
        if (shouldPass) {
          expect(result).not.toBeNull();
        } else {
          expect(result).toBeNull();
        }
      }
    });
  });

  describe('ensureTimestamp middleware', () => {
    it('should add timestamp if missing', async () => {
      middleware.use(ensureTimestamp());

      const event = createLogEvent({ message: 'test' });
      // @ts-ignore - explicitly remove timestamp to test the missing case
      delete event.timestamp;

      const result = await middleware.execute(event);
      expect(result?.event.timestamp).toBeDefined();
      expect(typeof result?.event.timestamp).toBe('number');
    });

    it('should not override existing timestamp', async () => {
      middleware.use(ensureTimestamp());

      const originalTimestamp = 1234567890;
      const event = createLogEvent({ message: 'test', timestamp: originalTimestamp });

      const result = await middleware.execute(event);
      expect(result?.event.timestamp).toBe(originalTimestamp);
    });
  });

  describe('addMetadata middleware', () => {
    it('should add metadata to context', async () => {
      middleware.use(addMetadata({
        app: 'test-app',
        version: '1.0.0'
      }));

      const event = createLogEvent({ message: 'test' });

      const result = await middleware.execute(event);
      expect(result?.event.context?.app).toBe('test-app');
      expect(result?.event.context?.version).toBe('1.0.0');
    });

    it('should merge with existing context', async () => {
      middleware.use(addMetadata({
        app: 'test-app',
        env: 'production'
      }));

      const event = createLogEvent({ message: 'test', context: { user: 'john' } });

      const result = await middleware.execute(event);
      expect(result?.event.context).toEqual({
        user: 'john',
        app: 'test-app',
        env: 'production'
      });
    });
  });

  describe('transformEvent middleware', () => {
    it('should transform event data', async () => {
      middleware.use(transformEvent((event) => ({
        ...event,
        message: event.message.toUpperCase(),
      })));

      const event = createLogEvent({ message: 'hello' });

      const result = await middleware.execute(event);
      expect(result?.event.message).toBe('HELLO');
    });

    it('should skip event when transformer returns null', async () => {
      middleware.use(transformEvent((event) => {
        if (event.message.includes('skip')) {
          return null;
        }
        return event;
      }));

      const skipEvent = createLogEvent({ message: 'skip this' });

      const keepEvent = createLogEvent({ message: 'keep this' });

      const skipResult = await middleware.execute(skipEvent);
      expect(skipResult).toBeNull();

      const keepResult = await middleware.execute(keepEvent);
      expect(keepResult).not.toBeNull();
    });
  });

  describe('rateLimit middleware', () => {
    it('should limit rate of events', async () => {
      // Allow 2 events per second
      middleware.use(rateLimit(2));

      const event = createLogEvent({ message: 'test' });

      // First two should pass
      const result1 = await middleware.execute(event);
      const result2 = await middleware.execute(event);
      const result3 = await middleware.execute(event);

      expect(result1).not.toBeNull();
      expect(result2).not.toBeNull();
      expect(result3).toBeNull(); // Should be rate limited
    });

    it('should refill tokens over time', async () => {
      vi.useFakeTimers();
      
      // Allow 1 event per second
      middleware.use(rateLimit(1));

      const event = createLogEvent({ message: 'test' });

      // First should pass
      const result1 = await middleware.execute(event);
      expect(result1).not.toBeNull();

      // Second should be limited
      const result2 = await middleware.execute(event);
      expect(result2).toBeNull();

      // Wait 1 second
      vi.advanceTimersByTime(1000);

      // Should pass again
      const result3 = await middleware.execute(event);
      expect(result3).not.toBeNull();

      vi.useRealTimers();
    });
  });

  describe('sample middleware', () => {
    it('should sample events based on rate', async () => {
      const mathSpy = vi.spyOn(Math, 'random');
      
      middleware.use(sample(0.5)); // 50% sampling

      const event = createLogEvent({ message: 'test' });

      // Should pass (random < 0.5)
      mathSpy.mockReturnValue(0.3);
      const result1 = await middleware.execute(event);
      expect(result1).not.toBeNull();

      // Should skip (random > 0.5)
      mathSpy.mockReturnValue(0.7);
      const result2 = await middleware.execute(event);
      expect(result2).toBeNull();

      mathSpy.mockRestore();
    });

    it('should validate sample rate', () => {
      expect(() => sample(-0.1)).toThrow('Sample rate must be between 0 and 1');
      expect(() => sample(1.1)).toThrow('Sample rate must be between 0 and 1');
    });

    it('should handle edge cases', async () => {
      const event = createLogEvent({ message: 'test' });

      // 0% sampling - all skipped
      middleware.clear();
      middleware.use(sample(0));
      const result1 = await middleware.execute(event);
      expect(result1).toBeNull();

      // 100% sampling - all pass
      middleware.clear();
      middleware.use(sample(1));
      const result2 = await middleware.execute(event);
      expect(result2).not.toBeNull();
    });
  });

  describe('enrichErrors middleware', () => {
    it('should enrich error events with stack trace', async () => {
      middleware.use(enrichErrors());

      const error = new Error('Test error');
      const event: LogEventData = {
        level: 'error',
        message: 'Error occurred',
        timestamp: Date.now(),
        context: { error },
        args: [],
        component: 'test',
        logger: 'test-logger',
      };

      const result = await middleware.execute(event);
      expect(result?.event.context?.stack).toBe(error.stack);
      expect(result?.event.context?.errorName).toBe('Error');
      expect(result?.event.context?.errorMessage).toBe('Test error');
    });

    it('should not affect non-error events', async () => {
      middleware.use(enrichErrors());

      const event: LogEventData = {
        level: 'info',
        message: 'Info message',
        timestamp: Date.now(),
        context: {},
        args: [],
        component: 'test',
        logger: 'test-logger',
      };

      const result = await middleware.execute(event);
      expect(result?.event.context?.stack).toBeUndefined();
    });

    it('should add error code if available', async () => {
      middleware.use(enrichErrors());

      const error = Object.assign(new Error('Test error'), { code: 'ERR_TEST' });
      const event: LogEventData = {
        level: 'error',
        message: 'Error occurred',
        timestamp: Date.now(),
        context: { error },
        args: [],
        component: 'test',
        logger: 'test-logger',
      };

      const result = await middleware.execute(event);
      expect(result?.event.context?.errorCode).toBe('ERR_TEST');
    });

    it('should not override existing stack in context', async () => {
      middleware.use(enrichErrors());

      const error = new Error('Test error');
      const event = createLogEvent({
        level: 'error',
        message: 'Error occurred',
        context: { error, stack: 'existing stack' },
      });

      const result = await middleware.execute(event);
      expect(result?.event.context?.stack).toBe('existing stack');
    });
  });

  describe('batchAggregator middleware', () => {
    it('should batch events and flush when max size reached', async () => {
      const flushedEvents: LogEventData[][] = [];
      middleware.use(batchAggregator({
        maxSize: 2,
        onFlush: (events) => {
          flushedEvents.push([...events]);
        }
      }));

      const event1 = createLogEvent({ message: 'test1' });
      const event2 = createLogEvent({ message: 'test2' });
      const event3 = createLogEvent({ message: 'test3' });

      await middleware.execute(event1);
      await middleware.execute(event2);
      // Should flush after 2 events
      expect(flushedEvents).toHaveLength(1);
      expect(flushedEvents[0]).toHaveLength(2);
      expect(flushedEvents[0][0].message).toBe('test1');
      expect(flushedEvents[0][1].message).toBe('test2');

      await middleware.execute(event3);
      // Third event should be in a new batch
      expect(flushedEvents).toHaveLength(1); // Still only one batch flushed
    });

    it('should flush on timer interval', async () => {
      const flushedEvents: LogEventData[][] = [];
      middleware.use(batchAggregator({
        maxSize: 10,
        flushInterval: 50, // 50ms
        onFlush: (events) => {
          flushedEvents.push([...events]);
        }
      }));

      const event = createLogEvent({ message: 'test' });
      await middleware.execute(event);

      // Wait for flush interval
      await new Promise(resolve => setTimeout(resolve, 60));
      
      expect(flushedEvents).toHaveLength(1);
      expect(flushedEvents[0]).toHaveLength(1);
      expect(flushedEvents[0][0].message).toBe('test');
    });

    it('should handle async onFlush', async () => {
      const flushedEvents: LogEventData[][] = [];
      middleware.use(batchAggregator({
        maxSize: 1,
        onFlush: async (events) => {
          await new Promise(resolve => setTimeout(resolve, 10));
          flushedEvents.push([...events]);
        }
      }));

      const event = createLogEvent({ message: 'test' });
      await middleware.execute(event);

      // Allow async flush to complete
      await new Promise(resolve => setTimeout(resolve, 20));
      
      expect(flushedEvents).toHaveLength(1);
      expect(flushedEvents[0][0].message).toBe('test');
    });
  });
});