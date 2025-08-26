/**
 * Transport registry for managing multiple log transports
 * 
 * Handles transport lifecycle, error isolation, and parallel operations.
 * Provides a clean separation between logging logic and transport management.
 * 
 * @example
 * ```typescript
 * import { TransportRegistry } from './transport-registry';
 * import { ConsoleTransport, EventBusTransport } from '../transports';
 * 
 * const registry = new TransportRegistry();
 * registry.add(new ConsoleTransport());
 * registry.add(new EventBusTransport(eventBus));
 * 
 * // Write to all transports
 * registry.writeToAll(logEventData);
 * 
 * // Lifecycle management
 * await registry.flushAll();
 * await registry.closeAll();
 * ```
 */

import type { Transport, LogEventData } from './types.js';

/**
 * Registry for managing transport instances with error isolation and lifecycle management
 */
export class TransportRegistry {
  private transports: Transport[] = [];

  /**
   * Add a transport to the registry
   * 
   * @param transport - Transport instance to add
   * @throws {TypeError} If transport is invalid or duplicate name exists
   * 
   * @example
   * ```typescript
   * const registry = new TransportRegistry();
   * registry.add(new ConsoleTransport());
   * registry.add(new EventBusTransport(eventBus));
   * ```
   */
  add(transport: Transport): void {
    if (!transport || typeof transport !== 'object') {
      throw new TypeError('Transport must be a valid object');
    }
    if (typeof transport.write !== 'function') {
      throw new TypeError('Transport must have a write method');
    }
    if (!transport.name || typeof transport.name !== 'string') {
      throw new TypeError('Transport must have a valid name');
    }
    if (this.transports.find(t => t.name === transport.name)) {
      throw new Error(`Transport with name '${transport.name}' already exists`);
    }
    
    this.transports.push(transport);
  }

  /**
   * Remove a transport from the registry by name
   * 
   * @param transportName - Name of transport to remove
   * @returns True if transport was found and removed, false otherwise
   * 
   * @example
   * ```typescript
   * const removed = registry.remove('console');
   * console.log(`Transport removed: ${removed}`);
   * ```
   */
  remove(transportName: string): boolean {
    if (typeof transportName !== 'string' || transportName.length === 0) {
      throw new TypeError('Transport name must be a non-empty string');
    }

    const index = this.transports.findIndex(t => t.name === transportName);
    if (index >= 0) {
      this.transports.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Write log event data to all registered transports
   * 
   * Errors from individual transports are isolated and logged to console
   * to prevent one failing transport from breaking others.
   * 
   * @param eventData - Log event data to write to all transports
   * 
   * @example
   * ```typescript
   * const eventData = {
   *   level: 'info',
   *   message: 'User logged in',
   *   timestamp: Date.now(),
   *   context: { userId: '123' },
   *   args: [],
   *   component: 'auth',
   *   logger: 'main'
   * };
   * registry.writeToAll(eventData);
   * ```
   */
  writeToAll(eventData: LogEventData): void {
    this.transports.forEach(transport => {
      try {
        const result = transport.write(eventData);
        // Handle async transports
        if (result && typeof result.catch === 'function') {
          result.catch((error: Error) => {
            this.handleTransportError(transport.name, 'write', error);
          });
        }
      } catch (error) {
        this.handleTransportError(transport.name, 'write', error as Error);
      }
    });
  }

  /**
   * Flush all registered transports in parallel
   * 
   * Individual transport flush errors are isolated and logged.
   * The operation continues even if some transports fail to flush.
   * 
   * @returns Promise that resolves when all transports have attempted to flush
   * 
   * @example
   * ```typescript
   * await registry.flushAll();
   * console.log('All transports flushed');
   * ```
   */
  async flushAll(): Promise<void> {
    const flushPromises = this.transports.map(async transport => {
      try {
        await Promise.resolve(transport.flush());
      } catch (error) {
        this.handleTransportError(transport.name, 'flush', error as Error);
      }
    });

    await Promise.all(flushPromises);
  }

  /**
   * Close all registered transports in parallel and clear the registry
   * 
   * Individual transport close errors are isolated and logged.
   * The registry is cleared regardless of individual transport failures.
   * 
   * @returns Promise that resolves when all transports have attempted to close
   * 
   * @example
   * ```typescript
   * await registry.closeAll();
   * console.log('All transports closed and registry cleared');
   * ```
   */
  async closeAll(): Promise<void> {
    const closePromises = this.transports.map(async transport => {
      try {
        await Promise.resolve(transport.close());
      } catch (error) {
        this.handleTransportError(transport.name, 'close', error as Error);
      }
    });

    await Promise.all(closePromises);
    
    // Clear transports array after closing all
    this.transports.length = 0;
  }

  /**
   * Get the list of registered transport names
   * 
   * @returns Array of transport names currently in the registry
   * 
   * @example
   * ```typescript
   * const names = registry.getTransportNames();
   * console.log('Registered transports:', names);
   * ```
   */
  getTransportNames(): string[] {
    return this.transports.map(t => t.name);
  }

  /**
   * Get the number of registered transports
   * 
   * @returns Number of transports in the registry
   * 
   * @example
   * ```typescript
   * console.log(`Registry has ${registry.size} transports`);
   * ```
   */
  get size(): number {
    return this.transports.length;
  }

  /**
   * Check if registry has any transports
   * 
   * @returns True if registry has no transports
   * 
   * @example
   * ```typescript
   * if (registry.isEmpty) {
   *   console.log('No transports registered');
   * }
   * ```
   */
  get isEmpty(): boolean {
    return this.transports.length === 0;
  }

  /**
   * Get a transport by name
   * 
   * @param name - Transport name to find
   * @returns Transport instance or undefined if not found
   * 
   * @example
   * ```typescript
   * const consoleTransport = registry.getTransport('console');
   * if (consoleTransport) {
   *   console.log('Found console transport');
   * }
   * ```
   */
  getTransport(name: string): Transport | undefined {
    return this.transports.find(t => t.name === name);
  }

  /**
   * Clear all transports from the registry without closing them
   * 
   * Use this if you want to remove all transports without calling their close() methods.
   * For proper cleanup, use closeAll() instead.
   * 
   * @example
   * ```typescript
   * registry.clear(); // Removes all transports without closing them
   * ```
   */
  clear(): void {
    this.transports.length = 0;
  }

  /**
   * Handle transport operation errors with consistent logging
   * 
   * @private
   * @param transportName - Name of the failing transport
   * @param operation - Operation that failed (write, flush, close)
   * @param error - Error that occurred
   */
  private handleTransportError(transportName: string, operation: string, error: Error): void {
    // Don't log transport errors to avoid infinite loops
    console.error(`Transport ${transportName} ${operation} failed:`, error);
  }
}