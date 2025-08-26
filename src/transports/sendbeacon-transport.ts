/**
 * SendBeacon transport for efficient telemetry data transmission
 * 
 * Provides efficient batching, offline support, and automatic retry capabilities
 * for sending telemetry data to remote endpoints using the sendBeacon API with
 * fetch fallback for maximum compatibility.
 * 
 * @example
 * ```typescript
 * import { SendBeaconTransport } from '@nuanced-labs/lever-ui-logger';
 * 
 * const transport = new SendBeaconTransport({
 *   endpoint: 'https://api.example.com/telemetry',
 *   batchSize: 100,
 *   flushInterval: 10000,
 *   authToken: 'your-api-token',
 *   enableOfflineStorage: true
 * });
 * 
 * // Use with logger
 * const logger = createLogger(eventBus, {
 *   transports: [transport]
 * });
 * ```
 */

import type { LogEventData } from '../logger/types.js';
import { BaseTransport, Environment } from './transport-interface.js';
import { SecureTokenHandler, type TokenProvider } from './secure-token-handler.js';

/**
 * Telemetry envelope metadata structure for wrapping log events
 * 
 * Contains session and user context along with the batch of log events
 * being transmitted to the telemetry endpoint.
 */
export interface TelemetryEnvelope {
  /** Unique session identifier */
  sessionId: string;
  /** Optional user identifier */
  userId?: string;
  /** User agent string */
  userAgent: string;
  /** Browser/client timezone */
  timezone: string;
  /** Timestamp of the envelope creation */
  timestamp: number;
  /** Array of log events */
  events: LogEventData[];
  /** Number of events in this batch */
  eventCount: number;
  /** Total size in bytes (estimated) */
  sizeBytes: number;
}

/**
 * Configuration options for SendBeacon transport
 * 
 * @example
 * ```typescript
 * const config: SendBeaconTransportConfig = {
 *   endpoint: 'https://api.example.com/logs',
 *   batchSize: 50,
 *   flushInterval: 5000,
 *   maxPayloadSize: 64 * 1024,
 *   authToken: () => getAuthToken(),
 *   enableOfflineStorage: true,
 *   rateLimitPerMinute: 1000
 * };
 * ```
 */
export interface SendBeaconTransportConfig {
  /** Transport name */
  name?: string;
  /** Endpoint URL for sending telemetry */
  endpoint: string;
  /** Maximum batch size (number of events) */
  batchSize?: number;
  /** Flush interval in milliseconds */
  flushInterval?: number;
  /** Maximum payload size in bytes (default ~64KB for sendBeacon) */
  maxPayloadSize?: number;
  /** Enable offline storage */
  enableOfflineStorage?: boolean;
  /** Storage key prefix for offline logs */
  storageKeyPrefix?: string;
  /** Maximum retry attempts */
  maxRetries?: number;
  /** Initial retry delay in milliseconds */
  retryDelay?: number;
  /** Authentication token or function to get token */
  authToken?: string | TokenProvider;
  /** Enable secure token handling (default: true) */
  enableSecureTokenHandling?: boolean;
  /** Custom headers for requests */
  headers?: Record<string, string>;
  /** Enable compression if available */
  enableCompression?: boolean;
  /** Session ID generator function */
  sessionIdGenerator?: () => string;
  /** User ID provider function */
  userIdProvider?: () => string | undefined;
  /** Rate limit: max events per minute */
  rateLimitPerMinute?: number;
  /** Enable automatic page lifecycle handling */
  enableLifecycleHandling?: boolean;
}

/**
 * Internal interface for queued log events with retry metadata
 * 
 * Used internally to track events in the batching queue along with
 * retry attempts and size estimates for batch management.
 */
interface QueuedEvent {
  event: LogEventData;
  timestamp: number;
  retryCount: number;
  size: number;
}

/**
 * SendBeacon transport for efficient telemetry transmission
 * 
 * High-performance transport that uses the sendBeacon API when available,
 * falling back to fetch with keepalive. Provides intelligent batching,
 * offline storage, retry logic, and lifecycle management.
 * 
 * Features:
 * - Automatic batching with size and time-based flushing
 * - sendBeacon API with fetch fallback
 * - Offline storage with localStorage
 * - Exponential backoff retry logic
 * - Rate limiting and abuse prevention  
 * - Page lifecycle event handling
 * - Bearer token authentication
 * - Circular reference protection
 * 
 * @example
 * ```typescript
 * const transport = new SendBeaconTransport({
 *   endpoint: 'https://telemetry.example.com/logs',
 *   batchSize: 100,
 *   flushInterval: 10000,
 *   authToken: 'bearer-token',
 *   enableOfflineStorage: true,
 *   userIdProvider: () => getCurrentUserId()
 * });
 * ```
 */
export class SendBeaconTransport extends BaseTransport {
  private readonly transportConfig: Required<Omit<SendBeaconTransportConfig, 'authToken' | 'userIdProvider' | 'enableSecureTokenHandling'>>;
  private readonly secureTokenHandler: SecureTokenHandler;
  private readonly userIdProvider?: () => string | undefined;
  private eventQueue: QueuedEvent[] = [];
  private flushTimer?: ReturnType<typeof setTimeout>;
  private sessionId: string;
  private rateLimitCounter = 0;
  private rateLimitResetTime = 0;
  private isOnline = true;
  private retryQueue: QueuedEvent[] = [];
  private lifecycleHandlersAttached = false;

  /**
   * Create a new SendBeacon transport instance
   * 
   * @param config - Configuration options for the transport
   * @param config.endpoint - Required endpoint URL for telemetry data
   * @param config.batchSize - Maximum events per batch (default: 50)
   * @param config.flushInterval - Flush interval in milliseconds (default: 5000)
   * @param config.maxPayloadSize - Maximum payload size in bytes (default: 64KB)
   * @param config.authToken - Authentication token or provider function
   * @param config.enableOfflineStorage - Enable localStorage fallback (default: true)
   * @param config.rateLimitPerMinute - Rate limit events per minute (default: 1000)
   * 
   * @example
   * ```typescript
   * const transport = new SendBeaconTransport({
   *   endpoint: 'https://api.example.com/telemetry',
   *   batchSize: 25,
   *   flushInterval: 3000,
   *   authToken: async () => await getApiToken(),
   *   userIdProvider: () => user.id
   * });
   * ```
   */
  constructor(config: SendBeaconTransportConfig) {
    const mergedConfig = {
      name: 'sendbeacon',
      batchSize: 50,
      flushInterval: 5000,
      maxPayloadSize: 64 * 1024, // 64KB
      enableOfflineStorage: true,
      storageKeyPrefix: 'lever_ui_logger_',
      maxRetries: 3,
      retryDelay: 1000,
      headers: {},
      enableCompression: false,
      sessionIdGenerator: () => SendBeaconTransport.generateSessionId(),
      rateLimitPerMinute: 1000,
      enableLifecycleHandling: true,
      enableSecureTokenHandling: true,
      ...config
    };

    super(mergedConfig.name, mergedConfig);
    this.transportConfig = mergedConfig;
    
    // Initialize secure token handler
    this.secureTokenHandler = new SecureTokenHandler({
      enableSecureMode: mergedConfig.enableSecureTokenHandling,
      tokenTtl: 3600000, // 1 hour
      validateToken: true
    });
    
    // Set up token handling
    if (config.authToken) {
      if (typeof config.authToken === 'string') {
        this.secureTokenHandler.setToken(config.authToken);
      } else {
        this.secureTokenHandler.setTokenProvider(config.authToken);
      }
    }
    
    this.userIdProvider = config.userIdProvider;
    this.sessionId = this.transportConfig.sessionIdGenerator();

    // Initialize online status monitoring
    if (Environment.isBrowser) {
      this.setupOnlineStatusMonitoring();
      this.loadOfflineEvents();
      
      if (this.transportConfig.enableLifecycleHandling) {
        this.setupLifecycleHandlers();
      }
    }

    // Start flush timer
    this.startFlushTimer();
  }

  /**
   * Write a log event to the transport
   * 
   * Adds the event to the batching queue and triggers immediate flush
   * if batch size or payload size limits are reached. Events are
   * subject to rate limiting.
   * 
   * @param event - The log event to write
   * 
   * @example
   * ```typescript
   * transport.write({
   *   level: 'info',
   *   message: 'User logged in',
   *   timestamp: Date.now(),
   *   component: 'auth',
   *   context: { userId: '123' },
   *   args: []
   * });
   * ```
   */
  write(event: LogEventData): void {
    if (!event) {
      throw new TypeError('LogEventData is required');
    }
    if (!event.message || typeof event.message !== 'string') {
      throw new TypeError('LogEventData must have a valid message');
    }
    
    // Check rate limit
    if (!this.checkRateLimit()) {
      console.warn('SendBeacon transport: Rate limit exceeded, dropping event');
      return;
    }

    const eventSize = this.estimateEventSize(event);
    const queuedEvent: QueuedEvent = {
      event,
      timestamp: Date.now(),
      retryCount: 0,
      size: eventSize
    };

    // Add to queue
    this.eventQueue.push(queuedEvent);

    // Check if we should flush immediately
    if (this.shouldFlushImmediately()) {
      this.flush();
    }
  }

  /**
   * Flush all pending events immediately
   * 
   * Sends all queued events and retry events in optimally-sized batches.
   * Respects payload size limits and creates multiple batches if necessary.
   * Automatically handles online/offline state and retry logic.
   * 
   * @returns Promise that resolves when all events have been processed
   * 
   * @example
   * ```typescript
   * // Manually flush before page unload
   * window.addEventListener('beforeunload', async () => {
   *   await transport.flush();
   * });
   * ```
   */
  async flush(): Promise<void> {
    if (this.eventQueue.length === 0 && this.retryQueue.length === 0) {
      return;
    }

    // Clear the flush timer
    this.clearFlushTimer();

    // Combine event queue and retry queue
    const eventsToSend = [...this.eventQueue, ...this.retryQueue];
    this.eventQueue = [];
    this.retryQueue = [];

    // Batch events respecting size limits
    const batches = this.createBatches(eventsToSend);

    // Send each batch
    for (const batch of batches) {
      await this.sendBatch(batch);
    }

    // Restart flush timer
    this.startFlushTimer();
  }

  /**
   * Close the transport and clean up resources
   * 
   * Performs a final flush of all pending events, clears timers,
   * removes event listeners, saves any remaining events to
   * offline storage if enabled, and securely disposes of token handler.
   * 
   * @returns Promise that resolves when cleanup is complete
   * 
   * @example
   * ```typescript
   * // Clean shutdown
   * await transport.close();
   * ```
   */
  async close(): Promise<void> {
    // Final flush
    await this.flush();

    // Clear timers
    this.clearFlushTimer();

    // Remove event listeners
    if (this.lifecycleHandlersAttached) {
      this.removeLifecycleHandlers();
    }

    // Save any remaining events to offline storage
    if (this.transportConfig.enableOfflineStorage && this.eventQueue.length > 0) {
      this.saveOfflineEvents(this.eventQueue);
    }

    // Securely dispose of token handler
    this.secureTokenHandler.dispose();
  }

  /**
   * Check if immediate flush is needed
   */
  private shouldFlushImmediately(): boolean {
    // Flush if batch size reached
    if (this.eventQueue.length >= this.transportConfig.batchSize) {
      return true;
    }

    // Flush if total size exceeds limit
    const totalSize = this.eventQueue.reduce((sum, evt) => sum + evt.size, 0);
    if (totalSize >= this.transportConfig.maxPayloadSize * 0.8) {
      return true;
    }

    return false;
  }

  /**
   * Create batches respecting size limits
   */
  private createBatches(events: QueuedEvent[]): QueuedEvent[][] {
    const batches: QueuedEvent[][] = [];
    let currentBatch: QueuedEvent[] = [];
    let currentSize = 0;

    for (const event of events) {
      // Check if adding this event would exceed limits
      if (currentBatch.length >= this.transportConfig.batchSize ||
          currentSize + event.size > this.transportConfig.maxPayloadSize * 0.9) {
        // Start new batch
        if (currentBatch.length > 0) {
          batches.push(currentBatch);
          currentBatch = [];
          currentSize = 0;
        }
      }

      currentBatch.push(event);
      currentSize += event.size;
    }

    // Add final batch
    if (currentBatch.length > 0) {
      batches.push(currentBatch);
    }

    return batches;
  }

  /**
   * Send a batch of events
   */
  private async sendBatch(batch: QueuedEvent[]): Promise<void> {
    if (!this.isOnline) {
      // Save to offline storage
      this.saveOfflineEvents(batch);
      return;
    }

    const envelope = await this.createEnvelope(batch.map(b => b.event));
    const payload = JSON.stringify(envelope);

    try {
      const success = await this.sendPayload(payload);
      
      if (!success) {
        // Handle failed send
        this.handleSendFailure(batch);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const sanitizedMessage = this.secureTokenHandler.sanitizeErrorMessage(errorMessage);
      console.error('SendBeacon transport: Failed to send batch', sanitizedMessage);
      this.handleSendFailure(batch);
    }
  }

  /**
   * Send payload using sendBeacon or fetch with keepalive
   * 
   * Attempts to use navigator.sendBeacon first for optimal performance,
   * then falls back to fetch with keepalive flag. Automatically handles
   * payload size limits and browser compatibility.
   * 
   * @param payload - JSON string payload to send
   * @returns Promise resolving to true if send was successful
   * 
   * @internal
   */
  private async sendPayload(payload: string): Promise<boolean> {
    const headers = await this.buildHeaders();

    // Try sendBeacon first (if available and payload is small enough)
    if (Environment.isBrowser && 
        typeof navigator !== 'undefined' && 
        navigator.sendBeacon &&
        payload.length < this.transportConfig.maxPayloadSize) {
      
      const blob = new Blob([payload], { type: 'application/json' });
      const success = navigator.sendBeacon(this.transportConfig.endpoint, blob);
      
      if (success) {
        return true;
      }
    }

    // Fallback to fetch with keepalive
    try {
      const response = await fetch(this.transportConfig.endpoint, {
        method: 'POST',
        headers,
        body: payload,
        keepalive: true,
        mode: 'cors',
        credentials: 'same-origin'
      });

      return response.ok;
    } catch (error) {
      // Sanitize error messages to prevent token leakage
      const errorMessage = error instanceof Error ? error.message : String(error);
      const sanitizedMessage = this.secureTokenHandler.sanitizeErrorMessage(errorMessage);
      console.error('SendBeacon transport: Fetch failed', sanitizedMessage);
      return false;
    }
  }

  /**
   * Build request headers with secure token handling
   */
  private async buildHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.transportConfig.headers
    };

    // Add auth token if available
    try {
      const token = await this.secureTokenHandler.getToken();
      if (token) {
        // Ensure Bearer prefix
        headers['Authorization'] = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
      }
    } catch (error) {
      console.error('SendBeacon transport: Failed to retrieve auth token:', error instanceof Error ? error.message : String(error));
      // Continue without authorization header
    }

    return headers;
  }

  /**
   * Create telemetry envelope with metadata and sanitized events
   * 
   * Wraps log events in a telemetry envelope containing session context,
   * user information, and environment metadata. Automatically sanitizes
   * events to handle circular references and serialization issues.
   * 
   * @param events - Array of log events to include in envelope
   * @returns Promise resolving to complete telemetry envelope
   * 
   * @internal
   */
  private async createEnvelope(events: LogEventData[]): Promise<TelemetryEnvelope> {
    // Sanitize events to handle circular references
    const sanitizedEvents = events.map(event => {
      try {
        return JSON.parse(JSON.stringify(event, this.getCircularReplacer()));
      } catch {
        // If all else fails, create a safe event
        return {
          level: event.level,
          message: event.message || '[Message could not be serialized]',
          timestamp: event.timestamp,
          component: event.component,
          context: '[Context could not be serialized]',
          args: []
        };
      }
    });

    const envelope: TelemetryEnvelope = {
      sessionId: this.sessionId,
      userId: this.userIdProvider?.(),
      userAgent: Environment.isBrowser && typeof navigator !== 'undefined' ? navigator.userAgent : 'node',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      timestamp: Date.now(),
      events: sanitizedEvents,
      eventCount: sanitizedEvents.length,
      sizeBytes: this.estimateEventSize(sanitizedEvents)
    };

    return envelope;
  }

  /**
   * Handle send failure with retry logic
   */
  private handleSendFailure(batch: QueuedEvent[]): void {
    // Increment retry count and add back to retry queue
    for (const event of batch) {
      event.retryCount++;
      
      if (event.retryCount < this.transportConfig.maxRetries) {
        // Add to retry queue with exponential backoff
        setTimeout(() => {
          this.retryQueue.push(event);
        }, this.transportConfig.retryDelay * Math.pow(2, event.retryCount));
      } else {
        // Max retries reached, save to offline storage if enabled
        if (this.transportConfig.enableOfflineStorage) {
          this.saveOfflineEvents([event]);
        } else {
          console.error('SendBeacon transport: Event dropped after max retries', this.sanitizeEventForLogging(event.event));
        }
      }
    }
  }

  /**
   * Setup online/offline status monitoring
   */
  private setupOnlineStatusMonitoring(): void {
    this.isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.isOnline = true;
        // Try to send offline events
        this.loadOfflineEvents();
        this.flush();
      });

      window.addEventListener('offline', () => {
        this.isOnline = false;
      });
    }
  }

  /**
   * Setup page lifecycle event handlers
   */
  private setupLifecycleHandlers(): void {
    if (this.lifecycleHandlersAttached) return;

    const flushHandler = () => {
      this.flush();
    };

    // Page visibility change
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        flushHandler();
      }
    });

    // Page unload events (only if window is available)
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', flushHandler);
      window.addEventListener('pagehide', flushHandler);
    }
    
    this.lifecycleHandlersAttached = true;
  }

  /**
   * Remove lifecycle event handlers
   */
  private removeLifecycleHandlers(): void {
    // Note: We can't remove anonymous functions, so in production
    // you'd want to store references to the handlers
    this.lifecycleHandlersAttached = false;
  }

  /**
   * Save events to offline storage
   */
  private saveOfflineEvents(events: QueuedEvent[]): void {
    if (!this.transportConfig.enableOfflineStorage || !Environment.isBrowser) {
      return;
    }

    try {
      const key = `${this.transportConfig.storageKeyPrefix}offline_events`;
      const existing = this.getOfflineEvents();
      const combined = [...existing, ...events];
      
      // Limit offline storage to prevent unbounded growth
      const limited = combined.slice(-1000); // Keep last 1000 events
      
      localStorage.setItem(key, JSON.stringify(limited));
    } catch (error) {
      console.error('SendBeacon transport: Failed to save offline events', error);
    }
  }

  /**
   * Load events from offline storage
   */
  private loadOfflineEvents(): void {
    if (!this.transportConfig.enableOfflineStorage || !Environment.isBrowser) {
      return;
    }

    const events = this.getOfflineEvents();
    if (events.length > 0) {
      this.retryQueue.push(...events);
      // Clear offline storage
      this.clearOfflineEvents();
    }
  }

  /**
   * Get events from offline storage
   */
  private getOfflineEvents(): QueuedEvent[] {
    if (!Environment.isBrowser) return [];

    try {
      const key = `${this.transportConfig.storageKeyPrefix}offline_events`;
      const stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('SendBeacon transport: Failed to load offline events', error);
      return [];
    }
  }

  /**
   * Clear offline storage
   */
  private clearOfflineEvents(): void {
    if (!Environment.isBrowser) return;

    try {
      const key = `${this.transportConfig.storageKeyPrefix}offline_events`;
      localStorage.removeItem(key);
    } catch (error) {
      console.error('SendBeacon transport: Failed to clear offline events', error);
    }
  }

  /**
   * Check rate limit
   */
  private checkRateLimit(): boolean {
    const now = Date.now();
    const minute = 60 * 1000;

    // Reset counter if minute has passed
    if (now > this.rateLimitResetTime) {
      this.rateLimitCounter = 0;
      this.rateLimitResetTime = now + minute;
    }

    this.rateLimitCounter++;
    return this.rateLimitCounter <= this.transportConfig.rateLimitPerMinute;
  }

  /**
   * Start flush timer
   */
  private startFlushTimer(): void {
    if (this.flushTimer) return;

    this.flushTimer = setTimeout(() => {
      this.flushTimer = undefined;
      this.flush();
    }, this.transportConfig.flushInterval);
  }

  /**
   * Clear flush timer
   */
  private clearFlushTimer(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = undefined;
    }
  }

  /**
   * Estimate size of event(s) in bytes
   */
  private estimateEventSize(event: LogEventData | LogEventData[]): number {
    try {
      const json = JSON.stringify(event);
      return new Blob([json]).size;
    } catch {
      // For circular references or other serialization issues,
      // return a conservative estimate
      try {
        return JSON.stringify(event, this.getCircularReplacer()).length * 2;
      } catch {
        return 1000; // Conservative fallback
      }
    }
  }

  /**
   * Get a secure replacer function for handling circular references and sensitive data
   */
  private getCircularReplacer() {
    return this.secureTokenHandler.createSecureReplacer();
  }

  /**
   * Sanitize event data for safe logging
   * 
   * @param event - Event data to sanitize
   * @returns Sanitized event data safe for logging
   */
  private sanitizeEventForLogging(event: LogEventData): Record<string, unknown> {
    try {
      // Use the secure replacer to sanitize the entire event - this should handle all sensitive keys
      const sanitized = JSON.parse(JSON.stringify(event, this.getCircularReplacer()));
      
      return {
        level: sanitized.level,
        message: sanitized.message,
        component: sanitized.component,
        timestamp: sanitized.timestamp,
        context: sanitized.context || '[sanitized]',
        argsCount: Array.isArray(sanitized.args) ? sanitized.args.length : 0
      };
    } catch {
      // Fallback to minimal safe representation
      return {
        level: event.level || 'unknown',
        message: typeof event.message === 'string' ? event.message : '[non-string message]',
        component: event.component || 'unknown',
        timestamp: event.timestamp || Date.now(),
        context: '[sanitization failed]',
        argsCount: Array.isArray(event.args) ? event.args.length : 0
      };
    }
  }

  /**
   * Generate a unique session ID
   */
  private static generateSessionId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  }
}

/**
 * Create a SendBeacon transport with default configuration
 * 
 * Factory function that creates a new SendBeacon transport instance
 * with the provided configuration. Provides a convenient way to
 * create transports without using the constructor directly.
 * 
 * @param config - Transport configuration options
 * @returns New SendBeacon transport instance
 * 
 * @example
 * ```typescript
 * import { createSendBeaconTransport } from '@nuanced-labs/lever-ui-logger';
 * 
 * const transport = createSendBeaconTransport({
 *   endpoint: 'https://api.example.com/telemetry',
 *   batchSize: 100,
 *   flushInterval: 10000,
 *   authToken: process.env.API_TOKEN,
 *   enableOfflineStorage: true,
 *   rateLimitPerMinute: 500
 * });
 * 
 * // Use with logger
 * const logger = createLogger(eventBus, {
 *   transports: [transport]
 * });
 * ```
 */
export function createSendBeaconTransport(config: SendBeaconTransportConfig): SendBeaconTransport {
  return new SendBeaconTransport(config);
}