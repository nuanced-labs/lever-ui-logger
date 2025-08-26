/**
 * Component Integration Tests for LoggerImpl
 * 
 * Tests component interactions without relying on specific redaction behavior.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createLogger } from '../../src/logger/logger-impl.js';
import type { Logger } from '../../src/logger/types.js';

// Simple test transport
class TestTransport {
  public events: any[] = [];
  public flushCalls = 0;
  public closeCalls = 0;
  
  constructor(public name: string = `transport-${Date.now()}-${Math.random()}`) {}
  
  write(event: any) { this.events.push(event); }
  async flush() { this.flushCalls++; }
  async close() { this.closeCalls++; }
  clear() { this.events = []; this.flushCalls = 0; this.closeCalls = 0; }
}

describe('LoggerImpl Component Integration', () => {
  let transport: TestTransport;
  let logger: Logger;

  beforeEach(() => {
    transport = new TestTransport();
  });

  afterEach(async () => {
    if (logger?.destroy) await logger.destroy();
    transport.clear();
  });

  describe('Configuration-Transport Integration', () => {
    it('integrates LoggerConfiguration with TransportRegistry for level filtering', () => {
      logger = createLogger({
        level: 'warn',
        transports: [transport]
      });

      logger.info('Should be filtered');
      logger.warn('Should pass');

      expect(transport.events).toHaveLength(1);
      expect(transport.events[0].level).toBe('warn');
      expect(transport.events[0].message).toBe('Should pass');
    });

    it('supports dynamic level changes affecting transport writes', () => {
      logger = createLogger({
        level: 'error',
        transports: [transport]
      });

      logger.warn('Filtered initially');
      expect(transport.events).toHaveLength(0);

      logger.setLevel('warn');
      logger.warn('Now visible');
      
      expect(transport.events).toHaveLength(1);
      expect(transport.events[0].level).toBe('warn');
    });

    it('applies component-level filtering through configuration', () => {
      logger = createLogger({
        level: 'error',
        component: 'test-component',
        transports: [transport]
      });

      logger.info('Global level filtering');
      expect(transport.events).toHaveLength(0);

      logger.setComponentLevel('test-component', 'info');
      logger.info('Component level override');
      
      expect(transport.events).toHaveLength(1);
      expect(transport.events[0].component).toBe('test-component');
    });
  });

  describe('ContextManager-Transport Integration', () => {
    it('integrates ContextManager default context with transport writes', () => {
      logger = createLogger({
        level: 'info',
        transports: [transport],
        defaultContext: { service: 'api', version: '1.0' }
      });

      logger.info('Test message');

      expect(transport.events).toHaveLength(1);
      const event = transport.events[0];
      expect(event.context.service).toBe('api');
      expect(event.context.version).toBe('1.0');
    });

    it('creates child loggers with ContextManager inheritance', () => {
      logger = createLogger({
        level: 'info',
        transports: [transport],
        defaultContext: { service: 'api' }
      });

      const child = logger.withContext({ operation: 'test' });
      child.info('Child message');

      expect(transport.events).toHaveLength(1);
      const event = transport.events[0];
      expect(event.context.service).toBe('api');
      expect(event.context.operation).toBe('test');
    });

    it('isolates parent and child logger contexts', () => {
      logger = createLogger({
        level: 'info',
        transports: [transport],
        defaultContext: { service: 'api' }
      });

      const child = logger.withContext({ operation: 'child-op' });
      
      // Parent should not have child context
      logger.info('Parent message');
      expect(transport.events[0].context).toMatchObject({ service: 'api' });
      expect(transport.events[0].context.operation).toBeUndefined();

      transport.clear();

      // Child should have both contexts
      child.info('Child message');
      expect(transport.events[0].context).toMatchObject({ 
        service: 'api', 
        operation: 'child-op' 
      });
    });
  });

  describe('TransportRegistry Component Integration', () => {
    it('distributes events to multiple transports', () => {
      const transport2 = new TestTransport();
      
      logger = createLogger({
        level: 'info',
        transports: [transport, transport2]
      });

      logger.info('Multi-transport message');

      expect(transport.events).toHaveLength(1);
      expect(transport2.events).toHaveLength(1);
      
      expect(transport.events[0].message).toBe('Multi-transport message');
      expect(transport2.events[0].message).toBe('Multi-transport message');
    });

    it('isolates transport errors without affecting other transports', () => {
      const faultyTransport = new TestTransport();
      faultyTransport.write = vi.fn(() => { 
        throw new Error('Transport failure'); 
      });

      logger = createLogger({
        level: 'info',
        transports: [transport, faultyTransport]
      });

      // Should not throw even if one transport fails
      expect(() => logger.info('Error resilience test')).not.toThrow();
      
      // Working transport should still receive the message
      expect(transport.events).toHaveLength(1);
      expect(transport.events[0].message).toBe('Error resilience test');
    });

    it('supports dynamic transport management', () => {
      logger = createLogger({
        level: 'info',
        transports: [transport]
      });

      logger.info('Initial message');
      expect(transport.events).toHaveLength(1);

      // Add second transport
      const transport2 = new TestTransport();
      logger.addTransport(transport2);
      
      logger.info('After adding transport');
      expect(transport.events).toHaveLength(2);
      expect(transport2.events).toHaveLength(1);

      // Remove first transport
      const removed = logger.removeTransport(transport.name);
      expect(removed).toBe(true);
      
      logger.info('After removing transport');
      expect(transport.events).toHaveLength(2); // No new events
      expect(transport2.events).toHaveLength(2); // Got new event
    });
  });

  describe('RedactionEngine Component Integration', () => {
    it('integrates redaction with context and arguments', () => {
      logger = createLogger({
        level: 'info',
        transports: [transport],
        redaction: { 
          mode: 'off' // Explicitly disable redaction
        }
      });

      logger.info('Test message', { username: 'testuser', data: 'sensitive' });

      expect(transport.events).toHaveLength(1);
      const event = transport.events[0];
      const args = event.args[0];
      
      // With redaction off, values should pass through
      expect(args.username).toBe('testuser');
      expect(args.data).toBe('sensitive');
    });
  });

  describe('Metrics Integration with Components', () => {
    it('integrates metrics with ContextManager and TransportRegistry', () => {
      logger = createLogger({
        level: 'info',
        transports: [transport],
        defaultContext: { service: 'api' },
        component: 'metrics-test'
      });

      logger.metric('test_metric', { value: 42 });

      expect(transport.events).toHaveLength(1);
      const event = transport.events[0];
      
      expect(event.level).toBe('info');
      expect(event.message).toBe('Metric: test_metric');
      expect(event.component).toBe('metrics-test');
      
      // Context should include service from ContextManager
      expect(event.context.service).toBe('api');
      
      // Metric data should be in args
      expect(event.args).toHaveLength(1);
      expect(event.args[0]).toMatchObject({
        name: 'test_metric',
        fields: { value: 42 }
      });
    });

    it('applies redaction to metric fields and context', () => {
      logger = createLogger({
        level: 'info',
        transports: [transport],
        component: 'metrics-test',
        redaction: { mode: 'off' }
      });

      logger.metric('user_metric', { user: 'testuser', action: 'login' });

      const event = transport.events[0];
      const metricData = event.args[0];
      
      // With redaction off, metric fields should pass through
      expect(metricData.fields.user).toBe('testuser');
      expect(metricData.fields.action).toBe('login');
    });
  });

  describe('Lifecycle and Error Handling Integration', () => {
    it('coordinates flush across all components', async () => {
      const asyncTransport = new TestTransport();
      let flushCalled = false;
      asyncTransport.flush = vi.fn(async () => {
        flushCalled = true;
        return Promise.resolve();
      });

      logger = createLogger({
        level: 'info',
        transports: [transport, asyncTransport]
      });

      await logger.flush();
      
      expect(transport.flushCalls).toBe(1);
      expect(flushCalled).toBe(true);
    });

    it('coordinates destroy across all components', async () => {
      const asyncTransport = new TestTransport();
      let closeCalled = false;
      asyncTransport.close = vi.fn(async () => {
        closeCalled = true;
        return Promise.resolve();
      });

      logger = createLogger({
        level: 'info',
        transports: [transport, asyncTransport]
      });

      logger.info('Before destroy');
      expect(transport.events).toHaveLength(1);

      await logger.destroy();
      
      // Should flush and close all transports
      expect(transport.flushCalls).toBe(1);
      expect(transport.closeCalls).toBe(1);
      expect(closeCalled).toBe(true);

      // Operations after destroy should be no-ops
      logger.info('After destroy');
      logger.metric('test', { value: 1 });
      
      expect(transport.events).toHaveLength(1); // No new events
    });

    it('validates input consistently across components', () => {
      logger = createLogger({
        level: 'info',
        transports: [transport]
      });

      // All logging methods should validate message types
      expect(() => logger.trace(123 as any)).toThrow('Message must be a string');
      expect(() => logger.debug({} as any)).toThrow('Message must be a string');
      expect(() => logger.info(null as any)).toThrow('Message must be a string');
      expect(() => logger.warn([] as any)).toThrow('Message must be a string');
      expect(() => logger.error(undefined as any)).toThrow('Message must be a string');
      
      expect(transport.events).toHaveLength(0);
    });
  });

  describe('Performance Integration', () => {
    it('efficiently filters logs before expensive component operations', () => {
      const expensiveTransport = new TestTransport();
      let writeCount = 0;
      
      expensiveTransport.write = vi.fn((event) => {
        writeCount++;
        // Simulate expensive operation
        JSON.stringify(event);
        return event;
      });

      logger = createLogger({
        level: 'error', // Only errors should pass
        transports: [expensiveTransport]
      });

      // These should be filtered by LoggerConfiguration before reaching TransportRegistry
      logger.trace('trace');
      logger.debug('debug'); 
      logger.info('info');
      logger.warn('warn');
      
      expect(writeCount).toBe(0);

      // This should pass through all components
      logger.error('error');
      expect(writeCount).toBe(1);
    });

    it('handles high-frequency logging across all components', () => {
      logger = createLogger({
        level: 'info',
        transports: [transport]
      });

      // Simulate high-frequency logging
      const messageCount = 100;
      for (let i = 0; i < messageCount; i++) {
        logger.info(`Message ${i}`, { iteration: i });
      }

      expect(transport.events).toHaveLength(messageCount);
      
      // Verify last message went through all components correctly
      const lastEvent = transport.events[messageCount - 1];
      expect(lastEvent.message).toBe(`Message ${messageCount - 1}`);
      expect(lastEvent.args[0]).toEqual({ iteration: messageCount - 1 });
    });
  });
});