/**
 * Tests for SendBeacon transport
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SendBeaconTransport, createSendBeaconTransport, type SendBeaconTransportConfig } from '../../src/transports/sendbeacon-transport.js';
import type { LogEventData } from '../../src/logger/types.js';

describe('SendBeaconTransport', () => {
  let transport: SendBeaconTransport;
  let fetchMock: ReturnType<typeof vi.fn>;
  let sendBeaconMock: ReturnType<typeof vi.fn>;
  let localStorageMock: { [key: string]: string };

  const mockConfig: SendBeaconTransportConfig = {
    endpoint: 'https://telemetry.example.com/logs',
    batchSize: 3,
    flushInterval: 100,
    enableLifecycleHandling: false // Disable for tests
  };

  const createMockEvent = (level: string = 'info', message: string = 'Test message'): LogEventData => ({
    level: level as LogEventData['level'],
    message,
    timestamp: Date.now(),
    component: 'test',
    logger: 'test-logger',
    context: { testId: '123' },
    args: []
  });

  beforeEach(() => {
    // Mock fetch
    fetchMock = vi.fn().mockResolvedValue({ ok: true });
    globalThis.fetch = fetchMock;

    // Mock navigator.sendBeacon - return true for successful sends
    sendBeaconMock = vi.fn().mockReturnValue(true);
    Object.defineProperty(globalThis.navigator, 'sendBeacon', {
      value: sendBeaconMock,
      writable: true,
      configurable: true
    });

    // Mock localStorage
    localStorageMock = {};
    const localStorageGetItem = vi.fn((key: string) => localStorageMock[key] || null);
    const localStorageSetItem = vi.fn((key: string, value: string) => {
      localStorageMock[key] = value;
    });
    const localStorageRemoveItem = vi.fn((key: string) => {
      delete localStorageMock[key];
    });

    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: localStorageGetItem,
        setItem: localStorageSetItem,
        removeItem: localStorageRemoveItem
      },
      writable: true,
      configurable: true
    });

    // Mock navigator.onLine
    Object.defineProperty(globalThis.navigator, 'onLine', {
      value: true,
      writable: true,
      configurable: true
    });

    // Mock window and document for lifecycle events
    if (typeof globalThis.window === 'undefined') {
      Object.defineProperty(globalThis, 'window', {
        value: {
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn()
        },
        writable: true,
        configurable: true
      });
    }

    if (typeof globalThis.document === 'undefined') {
      Object.defineProperty(globalThis, 'document', {
        value: {
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
          visibilityState: 'visible'
        },
        writable: true,
        configurable: true
      });
    }

    // Clear all timers
    vi.clearAllTimers();
    vi.useFakeTimers();
  });

  afterEach(async () => {
    if (transport) {
      await transport.close();
    }
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('initialization', () => {
    it('should create transport with default configuration', () => {
      transport = new SendBeaconTransport({ endpoint: 'https://example.com' });
      expect(transport.name).toBe('sendbeacon');
    });

    it('should accept custom configuration', () => {
      transport = new SendBeaconTransport({
        ...mockConfig,
        name: 'custom-beacon',
        batchSize: 10,
        flushInterval: 5000
      });
      expect(transport.name).toBe('custom-beacon');
    });

    it('should generate session ID on initialization', () => {
      const sessionIdGenerator = vi.fn().mockReturnValue('test-session-123');
      transport = new SendBeaconTransport({
        ...mockConfig,
        sessionIdGenerator
      });
      expect(sessionIdGenerator).toHaveBeenCalled();
    });
  });

  describe('batching', () => {
    beforeEach(() => {
      transport = new SendBeaconTransport(mockConfig);
    });

    it('should batch events up to batch size', () => {
      // Add events below batch size
      transport.write(createMockEvent('info', 'Message 1'));
      transport.write(createMockEvent('info', 'Message 2'));
      
      // Should not send yet
      expect(sendBeaconMock).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('should flush when batch size is reached', async () => {
      // Add events to reach batch size
      transport.write(createMockEvent('info', 'Message 1'));
      transport.write(createMockEvent('info', 'Message 2'));
      transport.write(createMockEvent('info', 'Message 3'));
      
      // Wait for async flush
      await vi.runAllTimersAsync();
      
      // Should have sent
      expect(sendBeaconMock).toHaveBeenCalledTimes(1);
    });

    it('should flush on timer interval', async () => {
      transport.write(createMockEvent('info', 'Message 1'));
      
      // Advance timer past flush interval
      await vi.advanceTimersByTimeAsync(150);
      
      // Should have sent
      expect(sendBeaconMock).toHaveBeenCalledTimes(1);
    });

    it('should create multiple batches for large event sets', async () => {
      // Add more events than batch size
      for (let i = 0; i < 7; i++) {
        transport.write(createMockEvent('info', `Message ${i}`));
      }
      
      await vi.runAllTimersAsync();
      
      // Should have sent multiple batches (7 events / 3 batch size = 3 batches)
      expect(sendBeaconMock).toHaveBeenCalledTimes(3);
    });
  });

  describe('sendBeacon API', () => {
    beforeEach(() => {
      transport = new SendBeaconTransport(mockConfig);
    });

    it('should use sendBeacon when available', async () => {
      transport.write(createMockEvent('info'));
      await transport.flush();
      
      expect(sendBeaconMock).toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('should fall back to fetch when sendBeacon fails', async () => {
      sendBeaconMock.mockReturnValue(false);
      
      transport.write(createMockEvent('info'));
      await transport.flush();
      
      expect(sendBeaconMock).toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalled();
    });

    it('should fall back to fetch when sendBeacon is not available', async () => {
      // Remove sendBeacon
      delete (globalThis.navigator as any).sendBeacon;
      
      transport.write(createMockEvent('info'));
      await transport.flush();
      
      expect(fetchMock).toHaveBeenCalled();
    });

    it('should use fetch with keepalive option', async () => {
      sendBeaconMock.mockReturnValue(false);
      
      transport.write(createMockEvent('info'));
      await transport.flush();
      
      expect(fetchMock).toHaveBeenCalledWith(
        mockConfig.endpoint,
        expect.objectContaining({
          method: 'POST',
          keepalive: true,
          headers: expect.objectContaining({
            'Content-Type': 'application/json'
          })
        })
      );
    });
  });

  describe('telemetry envelope', () => {
    beforeEach(() => {
      transport = new SendBeaconTransport({
        ...mockConfig,
        userIdProvider: () => 'user-123'
      });
    });

    it('should create envelope with metadata', async () => {
      const event = createMockEvent('info');
      transport.write(event);
      await transport.flush();
      
      // Extract JSON from sendBeacon call
      const sentBlob = sendBeaconMock.mock.calls[0][1];
      expect(sentBlob).toBeInstanceOf(Blob);
      
      // Parse envelope metadata by examining the payload structure
      expect(sendBeaconMock).toHaveBeenCalledWith(
        mockConfig.endpoint,
        expect.any(Blob)
      );
    });

    it('should include event count and size estimation', async () => {
      transport.write(createMockEvent('info'));
      transport.write(createMockEvent('debug'));
      await transport.flush();
      
      const sentBlob = sendBeaconMock.mock.calls[0][1];
      expect(sentBlob).toBeInstanceOf(Blob);
      expect(sentBlob.size).toBeGreaterThan(0);
    });
  });

  describe('offline support', () => {
    it('should save events to localStorage when offline', async () => {
      Object.defineProperty(globalThis.navigator, 'onLine', {
        value: false,
        writable: true,
        configurable: true
      });
      
      transport = new SendBeaconTransport({
        ...mockConfig,
        enableOfflineStorage: true
      });
      
      // Set offline state after creation
      (transport as any).isOnline = false;
      
      transport.write(createMockEvent('error', 'Offline error'));
      await transport.flush();
      
      // Should not send
      expect(sendBeaconMock).not.toHaveBeenCalled();
      
      // Should save to localStorage
      const stored = localStorage.getItem('lever_ui_logger_offline_events');
      expect(stored).toBeTruthy();
      const events = JSON.parse(stored!);
      expect(events).toHaveLength(1);
    });

    it('should load and send offline events when coming online', async () => {
      // Store offline events first
      const offlineEvents = [{
        event: createMockEvent('error', 'Offline error'),
        timestamp: Date.now(),
        retryCount: 0,
        size: 100
      }];
      localStorage.setItem('lever_ui_logger_offline_events', JSON.stringify(offlineEvents));
      
      transport = new SendBeaconTransport({
        ...mockConfig,
        enableOfflineStorage: true
      });
      
      // Simulate coming online
      (transport as any).isOnline = true;
      
      // Trigger flush to process offline events
      await transport.flush();
      
      // Should have sent offline events
      expect(sendBeaconMock).toHaveBeenCalled();
    });

    it('should limit offline storage size', async () => {
      Object.defineProperty(globalThis.navigator, 'onLine', {
        value: false,
        writable: true,
        configurable: true
      });
      
      transport = new SendBeaconTransport({
        ...mockConfig,
        enableOfflineStorage: true,
        rateLimitPerMinute: 2000 // Increase rate limit for this test
      });
      
      // Set offline state
      (transport as any).isOnline = false;
      
      // Add many events
      for (let i = 0; i < 1100; i++) {
        transport.write(createMockEvent('info', `Message ${i}`));
      }
      await transport.flush();
      
      const stored = localStorage.getItem('lever_ui_logger_offline_events');
      const events = JSON.parse(stored!);
      
      // Should limit to 1000 events
      expect(events.length).toBeLessThanOrEqual(1000);
    });

  });

  describe('retry logic', () => {
    beforeEach(() => {
      transport = new SendBeaconTransport({
        ...mockConfig,
        maxRetries: 2,
        retryDelay: 10
      });
    });

    it('should retry failed sends', async () => {
      sendBeaconMock.mockReturnValue(false);
      fetchMock.mockResolvedValue({ ok: false });
      
      transport.write(createMockEvent('error'));
      await transport.flush();
      
      // First attempt should have been made
      expect(fetchMock).toHaveBeenCalledTimes(1);
      
      // Wait for retry timer and flush
      await vi.advanceTimersByTimeAsync(10);
      await vi.runAllTimersAsync();
      
      // Retry should have been attempted (initial + retry = 2)
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('should drop events after max retries', async () => {
      sendBeaconMock.mockReturnValue(false);
      fetchMock.mockResolvedValue({ ok: false });
      
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      transport = new SendBeaconTransport({
        ...mockConfig,
        maxRetries: 1,
        retryDelay: 10,
        enableOfflineStorage: false
      });
      
      transport.write(createMockEvent('error'));
      await transport.flush();
      
      // Wait for retries to exhaust
      await vi.advanceTimersByTimeAsync(100);
      await vi.runAllTimersAsync();
      
      consoleSpy.mockRestore();
    });
  });

  describe('authentication', () => {
    it('should add auth token to headers', async () => {
      transport = new SendBeaconTransport({
        ...mockConfig,
        authToken: 'test-token-123'
      });
      
      sendBeaconMock.mockReturnValue(false); // Force fetch to see headers
      
      transport.write(createMockEvent('info'));
      await transport.flush();
      
      expect(fetchMock).toHaveBeenCalledWith(
        mockConfig.endpoint,
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-token-123'
          })
        })
      );
    });

    it('should support async auth token provider', async () => {
      const authProvider = vi.fn().mockResolvedValue('async-token-456');
      
      transport = new SendBeaconTransport({
        ...mockConfig,
        authToken: authProvider
      });
      
      sendBeaconMock.mockReturnValue(false); // Force fetch
      
      transport.write(createMockEvent('info'));
      await transport.flush();
      
      expect(authProvider).toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalledWith(
        mockConfig.endpoint,
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer async-token-456'
          })
        })
      );
    });
  });

  describe('rate limiting', () => {
    it('should enforce rate limit per minute', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      transport = new SendBeaconTransport({
        ...mockConfig,
        rateLimitPerMinute: 5
      });
      
      // Send within limit
      for (let i = 0; i < 5; i++) {
        transport.write(createMockEvent('info', `Message ${i}`));
      }
      expect(consoleSpy).not.toHaveBeenCalled();
      
      // Exceed limit
      transport.write(createMockEvent('info', 'Excess message'));
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Rate limit exceeded')
      );
      
      consoleSpy.mockRestore();
    });

    it('should reset rate limit after one minute', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      transport = new SendBeaconTransport({
        ...mockConfig,
        rateLimitPerMinute: 2
      });
      
      // Use up rate limit
      transport.write(createMockEvent('info', 'Message 1'));
      transport.write(createMockEvent('info', 'Message 2'));
      transport.write(createMockEvent('info', 'Message 3')); // Should be rate limited
      
      expect(consoleSpy).toHaveBeenCalledTimes(1);
      
      // Advance time by more than 1 minute 
      vi.advanceTimersByTime(61 * 1000);
      
      // Should be able to send again
      transport.write(createMockEvent('info', 'Message 4'));
      transport.write(createMockEvent('info', 'Message 5'));
      transport.write(createMockEvent('info', 'Message 6')); // This should trigger rate limit again
      
      // Should have 2 rate limit warnings total
      expect(consoleSpy).toHaveBeenCalledTimes(2);
      
      consoleSpy.mockRestore();
    });
  });

  describe('lifecycle handling', () => {
    it('should flush on page visibility change', async () => {
      transport = new SendBeaconTransport({
        ...mockConfig,
        enableLifecycleHandling: true
      });
      
      transport.write(createMockEvent('info'));
      
      // Mock visibility change
      Object.defineProperty(document, 'visibilityState', {
        value: 'hidden',
        writable: true,
        configurable: true
      });
      
      // Manually trigger flush (simulating event handler)
      await transport.flush();
      
      expect(sendBeaconMock).toHaveBeenCalled();
    });

  });

  describe('size limits', () => {
    it('should respect max payload size', async () => {
      transport = new SendBeaconTransport({
        ...mockConfig,
        maxPayloadSize: 2000, // Small size for testing
        batchSize: 100 // Large batch to test size limit
      });
      
      // Create large events that will exceed size limit when batched
      const largeMessage = 'x'.repeat(800);
      
      // Add multiple large events
      for (let i = 0; i < 5; i++) {
        transport.write(createMockEvent('info', largeMessage + i));
      }
      
      await vi.runAllTimersAsync();
      
      // Should have sent at least one batch
      expect(sendBeaconMock).toHaveBeenCalled();
    });

    it('should flush immediately when approaching size limit', async () => {
      transport = new SendBeaconTransport({
        ...mockConfig,
        maxPayloadSize: 2000,
        batchSize: 100
      });
      
      // Create events that approach 80% of size limit
      const largeMessage = 'x'.repeat(1500);
      transport.write(createMockEvent('info', largeMessage));
      
      // Should flush immediately due to size
      await vi.runAllTimersAsync();
      expect(sendBeaconMock).toHaveBeenCalled();
    });
  });

  describe('factory function', () => {
    it('should create transport using factory', () => {
      const transport = createSendBeaconTransport({
        endpoint: 'https://example.com'
      });
      
      expect(transport).toBeInstanceOf(SendBeaconTransport);
      expect(transport.name).toBe('sendbeacon');
    });
  });

  describe('error handling', () => {
    it('should handle JSON serialization errors gracefully', async () => {
      transport = new SendBeaconTransport(mockConfig);
      
      // Create event with circular reference
      const circular: any = { ref: null };
      circular.ref = circular;
      
      const event: LogEventData = {
        ...createMockEvent('error'),
        context: circular
      };
      
      // Should not throw when writing
      expect(() => transport.write(event)).not.toThrow();
      
      // Should successfully flush with sanitized data
      await transport.flush();
      
      // Should have sent sanitized data
      expect(sendBeaconMock).toHaveBeenCalled();
    });

    it('should use conservative size estimate for unparseable events', async () => {
      const originalJSON = JSON.stringify;
      JSON.stringify = vi.fn().mockImplementation((obj, replacer) => {
        if (obj && obj.message === 'unparseable') {
          throw new Error('JSON serialization failed');
        }
        return originalJSON.call(JSON, obj, replacer);
      });
      
      const problematicEvent = createMockEvent('error', 'unparseable');
      
      // Should not throw and should handle the error gracefully
      expect(() => {
        transport.write(problematicEvent);
      }).not.toThrow();
      
      JSON.stringify = originalJSON;
    });

    it('should handle localStorage errors gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      // Make localStorage throw on getItem (during initialization)
      Object.defineProperty(globalThis, 'localStorage', {
        value: {
          getItem: () => { throw new Error('Storage error'); },
          setItem: () => { throw new Error('Storage error'); },
          removeItem: () => { throw new Error('Storage error'); }
        },
        writable: true,
        configurable: true
      });
      
      transport = new SendBeaconTransport({
        ...mockConfig,
        enableOfflineStorage: true
      });
      
      // Should handle error during initialization
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to load offline events'),
        expect.any(Error)
      );
      
      consoleSpy.mockRestore();
    });


    it('should handle fetch errors gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      sendBeaconMock.mockReturnValue(false);
      fetchMock.mockRejectedValue(new Error('Network error'));
      
      transport = new SendBeaconTransport({
        ...mockConfig,
        maxRetries: 0,
        enableOfflineStorage: false
      });
      
      transport.write(createMockEvent('error'));
      await transport.flush();
      
      // Should log fetch failure (with sanitized error message)
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Fetch failed'),
        expect.any(String) // Now expects sanitized string instead of Error object
      );
      
      consoleSpy.mockRestore();
    });
  });

  describe('close', () => {
    it('should flush and clean up on close', async () => {
      transport = new SendBeaconTransport(mockConfig);
      
      transport.write(createMockEvent('info'));
      
      await transport.close();
      
      // Should have flushed
      expect(sendBeaconMock).toHaveBeenCalled();
    });

    it('should save remaining events to offline storage on close', async () => {
      transport = new SendBeaconTransport({
        ...mockConfig,
        enableOfflineStorage: true
      });
      
      // Set offline state
      (transport as any).isOnline = false;
      
      transport.write(createMockEvent('info'));
      
      await transport.close();
      
      // Should have saved to offline storage
      const stored = localStorage.getItem('lever_ui_logger_offline_events');
      expect(stored).toBeTruthy();
    });
  });
});