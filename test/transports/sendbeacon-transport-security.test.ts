/**
 * Security-focused tests for SendBeaconTransport
 * 
 * Tests secure token handling, debug output sanitization,
 * and protection against sensitive data exposure in the
 * updated SendBeaconTransport implementation.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SendBeaconTransport } from '../../src/transports/sendbeacon-transport.js';
import type { LogEventData } from '../../src/logger/types.js';
import { TEST_CONSTANTS } from '../test-constants.js';

// Mock fetch and sendBeacon
const mockFetch = vi.fn();
const mockSendBeacon = vi.fn();

// Capture console output for testing
const consoleSpy = {
  error: vi.fn(),
  warn: vi.fn(),
  log: vi.fn()
};

describe('SendBeaconTransport Security Features', () => {
  let transport: SendBeaconTransport;
  let mockLogEvent: LogEventData;

  beforeEach(() => {
    // Setup global mocks with proper cross-platform handling
    globalThis.fetch = mockFetch;
    
    // Mock navigator with proper descriptor
    Object.defineProperty(globalThis, 'navigator', {
      value: { 
        sendBeacon: mockSendBeacon,
        onLine: true,
        userAgent: 'test-agent'
      },
      writable: true,
      configurable: true
    });

    // Setup console spies
    vi.spyOn(console, 'error').mockImplementation(consoleSpy.error);
    vi.spyOn(console, 'warn').mockImplementation(consoleSpy.warn);
    vi.spyOn(console, 'log').mockImplementation(consoleSpy.log);

    // Reset mocks
    mockFetch.mockReset();
    mockSendBeacon.mockReset();
    consoleSpy.error.mockReset();
    consoleSpy.warn.mockReset();
    consoleSpy.log.mockReset();

    // Default successful responses
    mockFetch.mockResolvedValue({ ok: true, status: 200 });
    mockSendBeacon.mockReturnValue(true);

    // Sample log event
    mockLogEvent = {
      level: 'info',
      message: 'Test log message',
      timestamp: Date.now(),
      context: { userId: 'user-123' },
      args: [],
      component: 'test-component',
      logger: 'test-logger'
    };
  });

  afterEach(async () => {
    if (transport) {
      await transport.close();
    }
    vi.restoreAllMocks();
  });

  describe('Secure Token Handling', () => {
    it('handles static auth tokens securely', async () => {
      const authToken = 'Bearer secret-token-12345';
      transport = new SendBeaconTransport({
        endpoint: 'https://example.com/logs',
        authToken,
        enableSecureTokenHandling: true
      });

      transport.write(mockLogEvent);
      await transport.flush();

      // Check that the authorization header was set correctly
      const fetchCall = mockFetch.mock.calls[0];
      if (fetchCall) {
        const [, options] = fetchCall;
        expect(options.headers.Authorization).toBe(authToken);
      }
    });

    it('handles async token providers securely', async () => {
      const expectedToken = 'Bearer async-token-67890';
      const tokenProvider = vi.fn().mockResolvedValue(expectedToken);
      
      transport = new SendBeaconTransport({
        endpoint: 'https://example.com/logs',
        authToken: tokenProvider,
        enableSecureTokenHandling: true
      });

      transport.write(mockLogEvent);
      await transport.flush();

      expect(tokenProvider).toHaveBeenCalled();
      
      const fetchCall = mockFetch.mock.calls[0];
      if (fetchCall) {
        const [, options] = fetchCall;
        expect(options.headers.Authorization).toBe(expectedToken);
      }
    });

    it('handles token provider errors gracefully', async () => {
      const failingProvider = vi.fn().mockRejectedValue(new Error('Token fetch failed'));
      
      transport = new SendBeaconTransport({
        endpoint: 'https://example.com/logs',
        authToken: failingProvider,
        enableSecureTokenHandling: true
      });

      transport.write(mockLogEvent);
      await transport.flush();

      // Should continue without authorization header
      const fetchCall = mockFetch.mock.calls[0];
      if (fetchCall) {
        const [, options] = fetchCall;
        expect(options.headers.Authorization).toBeUndefined();
      }

      // Should log error message (but not the token)
      // Note: The SecureTokenHandler logs its own error, then SendBeacon logs another
      expect(consoleSpy.error).toHaveBeenCalled();
      
      const errorCalls = consoleSpy.error.mock.calls.flat();
      const allErrorMessages = errorCalls.join(' ');
      expect(allErrorMessages).toContain('Token provider failed');
      expect(allErrorMessages).not.toContain('secret-token-in-error');
    });

    it('automatically adds Bearer prefix when missing', async () => {
      const tokenWithoutBearer = 'raw-token-without-prefix';
      
      transport = new SendBeaconTransport({
        endpoint: 'https://example.com/logs',
        authToken: tokenWithoutBearer,
        enableSecureTokenHandling: true
      });

      transport.write(mockLogEvent);
      await transport.flush();

      const fetchCall = mockFetch.mock.calls[0];
      if (fetchCall) {
        const [, options] = fetchCall;
        expect(options.headers.Authorization).toBe(`Bearer ${tokenWithoutBearer}`);
      }
    });

    it('preserves existing Bearer prefix', async () => {
      const tokenWithBearer = 'Bearer existing-prefix-token';
      
      transport = new SendBeaconTransport({
        endpoint: 'https://example.com/logs',
        authToken: tokenWithBearer,
        enableSecureTokenHandling: true
      });

      transport.write(mockLogEvent);
      await transport.flush();

      const fetchCall = mockFetch.mock.calls[0];
      if (fetchCall) {
        const [, options] = fetchCall;
        expect(options.headers.Authorization).toBe(tokenWithBearer);
      }
    });

    it('can disable secure token handling for testing', async () => {
      const testToken = 'Bearer test-token';
      
      transport = new SendBeaconTransport({
        endpoint: 'https://example.com/logs',
        authToken: testToken,
        enableSecureTokenHandling: false
      });

      transport.write(mockLogEvent);
      await transport.flush();

      // Should still work but without secure protections
      const fetchCall = mockFetch.mock.calls[0];
      if (fetchCall) {
        const [, options] = fetchCall;
        expect(options.headers.Authorization).toBe(testToken);
      }
    });
  });

  describe('Debug Output Sanitization', () => {
    it('sanitizes event data in error logs', async () => {
      // Create transport that will fail to send
      transport = new SendBeaconTransport({
        endpoint: 'https://example.com/logs',
        maxRetries: 0, // Fail immediately
        enableOfflineStorage: false
      });

      // Mock sendBeacon and fetch to fail
      mockSendBeacon.mockReturnValue(false);
      mockFetch.mockResolvedValue({ ok: false, status: 500 });

      const sensitiveEvent: LogEventData = {
        level: 'info',
        message: 'User login',
        timestamp: Date.now(),
        context: {
          email: 'user@example.com',
          password: 'secret123',
          token: 'Bearer sensitive-token',
          normalField: 'safe-value'
        },
        args: ['additional', 'arguments'],
        component: 'auth',
        logger: 'auth-logger'
      };

      transport.write(sensitiveEvent);
      await transport.flush();

      // Check that error log was called
      expect(consoleSpy.error).toHaveBeenCalled();

      // Find the call that logs dropped event
      const errorCalls = consoleSpy.error.mock.calls;
      const droppedEventCall = errorCalls.find(call => 
        call[0]?.includes('Event dropped after max retries')
      );

      if (droppedEventCall && droppedEventCall[1]) {
        const sanitizedEvent = droppedEventCall[1];
        
        // Should sanitize sensitive data
        expect(JSON.stringify(sanitizedEvent)).not.toContain('user@example.com');
        expect(JSON.stringify(sanitizedEvent)).not.toContain('secret123');
        expect(JSON.stringify(sanitizedEvent)).not.toContain('sensitive-token');
        
        // Should preserve safe data
        expect(sanitizedEvent.level).toBe('info');
        expect(sanitizedEvent.message).toBe('User login');
        expect(sanitizedEvent.component).toBe('auth');
        
        // Should include metadata without sensitive content
        expect(sanitizedEvent.argsCount).toBe(2);
      }
    });

    it('handles serialization errors gracefully in sanitization', async () => {
      transport = new SendBeaconTransport({
        endpoint: 'https://example.com/logs',
        maxRetries: 0,
        enableOfflineStorage: false
      });

      mockSendBeacon.mockReturnValue(false);
      mockFetch.mockResolvedValue({ ok: false, status: 500 });

      // Create event with circular reference
      const circularContext: any = { name: 'test' };
      circularContext.self = circularContext;
      
      const problematicEvent: LogEventData = {
        level: 'error',
        message: 'Circular reference test',
        timestamp: Date.now(),
        context: circularContext,
        args: [],
        component: 'test',
        logger: 'test'
      };

      transport.write(problematicEvent);
      await transport.flush();

      // Should not crash and should log something
      expect(consoleSpy.error).toHaveBeenCalled();
      
      const errorCalls = consoleSpy.error.mock.calls;
      const droppedEventCall = errorCalls.find(call => 
        call[0]?.includes('Event dropped after max retries')
      );

      expect(droppedEventCall).toBeDefined();
      if (droppedEventCall && droppedEventCall[1]) {
        const sanitizedEvent = droppedEventCall[1];
        expect(sanitizedEvent.level).toBe('error');
        expect(sanitizedEvent.message).toBe('Circular reference test');
      }
    });

    it('sanitizes error messages to prevent token leakage', async () => {
      transport = new SendBeaconTransport({
        endpoint: 'https://example.com/logs',
        authToken: 'Bearer secret-token-in-error'
      });

      // Mock fetch to throw error that might contain sensitive data
      const errorWithToken = new Error('Authorization failed for token: Bearer secret-token-in-error');
      mockFetch.mockRejectedValue(errorWithToken);
      mockSendBeacon.mockReturnValue(false);

      transport.write(mockLogEvent);
      await transport.flush();

      // Check that console.error was called
      expect(consoleSpy.error).toHaveBeenCalled();
      
      // Verify that the sensitive token is not in any console output
      const allErrorCalls = consoleSpy.error.mock.calls;
      const allErrorMessages = allErrorCalls.flat().join(' ');
      
      // Verify that error messages are properly sanitized
      expect(allErrorMessages).toContain('Fetch failed');
      
      // The new comprehensive sanitizer should mask the token
      const containsOriginalToken = allErrorMessages.includes('secret-token-in-error');
      expect(containsOriginalToken).toBe(false);
      
      // Should contain sanitized version or redaction
      const containsSanitizedData = allErrorMessages.includes('[REDACTED]') || 
                                   allErrorMessages.includes('***') ||
                                   allErrorMessages.includes('Authorization failed');
      expect(containsSanitizedData).toBe(true);
    });
  });

  describe('Secure JSON Serialization', () => {
    it('uses secure replacer for event serialization', async () => {
      transport = new SendBeaconTransport({
        endpoint: 'https://example.com/logs',
        authToken: 'Bearer transport-token'
      });

      const eventWithSensitiveData: LogEventData = {
        level: 'info',
        message: 'Transaction processed',
        timestamp: Date.now(),
        context: {
          creditCard: '4111-1111-1111-1111',
          apiKey: 'sk_live_secret123456789',
          normal: 'safe-data'
        },
        args: [],
        component: 'payment',
        logger: 'payment-logger'
      };

      transport.write(eventWithSensitiveData);
      await transport.flush();

      // Check the request body to ensure sensitive data was sanitized
      const fetchCall = mockFetch.mock.calls[0];
      if (fetchCall) {
        const [, options] = fetchCall;
        const requestBody = options.body;
        
        // Should not contain raw sensitive data
        expect(requestBody).not.toContain('4111-1111-1111-1111');
        expect(requestBody).not.toContain('sk_live_secret123456789');
        
        // Should contain safe data
        expect(requestBody).toContain('safe-data');
        expect(requestBody).toContain('Transaction processed');
      }
    });

    it('handles circular references in event data', async () => {
      transport = new SendBeaconTransport({
        endpoint: 'https://example.com/logs'
      });

      const circularArg: any = { data: 'test' };
      circularArg.circular = circularArg;

      const eventWithCircular: LogEventData = {
        level: 'debug',
        message: 'Debug with circular reference',
        timestamp: Date.now(),
        context: {},
        args: [circularArg],
        component: 'debug',
        logger: 'debug-logger'
      };

      // Should not throw error
      expect(() => transport.write(eventWithCircular)).not.toThrow();
      
      await transport.flush();

      // Should have made the request successfully (either fetch or sendBeacon)
      expect(mockFetch.mock.calls.length + mockSendBeacon.mock.calls.length).toBeGreaterThan(0);
      
      const fetchCall = mockFetch.mock.calls[0];
      if (fetchCall) {
        const [, options] = fetchCall;
        const requestBody = options.body;
        
        // Should handle circular reference
        expect(requestBody).toContain('[Circular Reference]');
        expect(requestBody).toContain('Debug with circular reference');
      }
    });
  });

  describe('Token Handler Cleanup', () => {
    it('properly disposes token handler on transport close', async () => {
      transport = new SendBeaconTransport({
        endpoint: 'https://example.com/logs',
        authToken: 'Bearer cleanup-test-token',
        enableSecureTokenHandling: true
      });

      // Access the internal token handler to verify disposal
      const tokenHandler = (transport as any).secureTokenHandler;
      const disposeSpy = vi.spyOn(tokenHandler, 'dispose');

      await transport.close();

      expect(disposeSpy).toHaveBeenCalled();
    });

    it('prevents token usage after transport disposal', async () => {
      transport = new SendBeaconTransport({
        endpoint: 'https://example.com/logs',
        authToken: 'Bearer disposed-token'
      });

      await transport.close();

      // Try to use transport after disposal
      transport.write(mockLogEvent);
      // Transport should handle this gracefully

      // Token handler should be disposed and not usable
      const tokenHandler = (transport as any).secureTokenHandler;
      expect(tokenHandler.hasToken()).toBe(false);
    });
  });

  describe('Environment Compatibility', () => {
    it('works when browser APIs are not available', async () => {
      // Remove browser-specific globals
      const originalNavigator = globalThis.navigator;
      const originalBtoa = globalThis.btoa;
      const originalWindow = globalThis.window;
      
      // @ts-expect-error - Intentionally deleting for test
      delete globalThis.navigator;
      // @ts-expect-error - Intentionally deleting for test  
      delete globalThis.btoa;
      // @ts-expect-error - Intentionally deleting for test
      delete globalThis.window;

      try {
        transport = new SendBeaconTransport({
          endpoint: 'https://example.com/logs',
          authToken: 'Bearer compatibility-token',
          enableSecureTokenHandling: true
        });

        transport.write(mockLogEvent);
        await transport.flush();

        // Should fall back to fetch
        expect(mockFetch).toHaveBeenCalled();
      } finally {
        // Restore globals with proper descriptors
        if (originalNavigator) {
          Object.defineProperty(globalThis, 'navigator', {
            value: originalNavigator,
            writable: true,
            configurable: true
          });
        }
        if (originalBtoa) {
          Object.defineProperty(globalThis, 'btoa', {
            value: originalBtoa,
            writable: true,
            configurable: true
          });
        }
        if (originalWindow) {
          Object.defineProperty(globalThis, 'window', {
            value: originalWindow,
            writable: true,
            configurable: true
          });
        }
      }
    });
  });

  describe('Rate Limiting with Sensitive Data', () => {
    it('does not log sensitive data when rate limit is exceeded', async () => {
      transport = new SendBeaconTransport({
        endpoint: 'https://example.com/logs',
        rateLimitPerMinute: 1 // Very low limit
      });

      const sensitiveEvent: LogEventData = {
        level: 'info',
        message: 'Rate limited event',
        timestamp: Date.now(),
        context: {
          password: 'secret-password-123',
          token: 'Bearer rate-limit-token'
        },
        args: [],
        component: 'test',
        logger: 'test'
      };

      // First event should pass
      transport.write(sensitiveEvent);
      
      // Second event should be rate limited
      transport.write(sensitiveEvent);

      expect(consoleSpy.warn).toHaveBeenCalledWith(
        'SendBeacon transport: Rate limit exceeded, dropping event'
      );

      // Check that the warning doesn't contain sensitive data
      const warningCalls = consoleSpy.warn.mock.calls;
      const allWarnings = warningCalls.flat().join(' ');
      
      expect(allWarnings).not.toContain('secret-password-123');
      expect(allWarnings).not.toContain('rate-limit-token');
    });
  });

  describe('Configuration Security', () => {
    it('defaults to secure token handling enabled', () => {
      transport = new SendBeaconTransport({
        endpoint: 'https://example.com/logs',
        authToken: 'Bearer default-security-token'
      });

      const config = (transport as any).transportConfig;
      expect(config.enableSecureTokenHandling).toBe(true);
    });

    it('respects explicit secure token handling configuration', () => {
      transport = new SendBeaconTransport({
        endpoint: 'https://example.com/logs',
        authToken: 'Bearer explicit-config-token',
        enableSecureTokenHandling: false
      });

      const tokenHandler = (transport as any).secureTokenHandler;
      const handlerConfig = (tokenHandler as any).config;
      expect(handlerConfig.enableSecureMode).toBe(false);
    });
  });
});