/**
 * Unit tests for TransportRegistry
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TransportRegistry } from '../../src/logger/transport-registry.js';
import type { Transport, LogEventData } from '../../src/logger/types.js';

// Mock transport for testing
class MockTransport implements Transport {
  public writeCalls: LogEventData[] = [];
  public flushCalls: number = 0;
  public closeCalls: number = 0;
  public writeError: Error | null = null;
  public flushError: Error | null = null;
  public closeError: Error | null = null;
  public asyncWrite: boolean = false;
  public asyncFlush: boolean = false;
  public asyncClose: boolean = false;

  constructor(public name: string) {}

  write(eventData: LogEventData): void | Promise<void> {
    if (this.writeError) {
      if (this.asyncWrite) {
        return Promise.reject(this.writeError);
      } else {
        throw this.writeError;
      }
    }
    this.writeCalls.push(eventData);
    
    if (this.asyncWrite) {
      return Promise.resolve();
    }
  }

  flush(): void | Promise<void> {
    this.flushCalls++;
    if (this.flushError) {
      if (this.asyncFlush) {
        return Promise.reject(this.flushError);
      } else {
        throw this.flushError;
      }
    }
    
    if (this.asyncFlush) {
      return Promise.resolve();
    }
  }

  close(): void | Promise<void> {
    this.closeCalls++;
    if (this.closeError) {
      if (this.asyncClose) {
        return Promise.reject(this.closeError);
      } else {
        throw this.closeError;
      }
    }
    
    if (this.asyncClose) {
      return Promise.resolve();
    }
  }

  reset() {
    this.writeCalls = [];
    this.flushCalls = 0;
    this.closeCalls = 0;
    this.writeError = null;
    this.flushError = null;
    this.closeError = null;
    this.asyncWrite = false;
    this.asyncFlush = false;
    this.asyncClose = false;
  }
}

describe('TransportRegistry', () => {
  let registry: TransportRegistry;
  let mockTransport1: MockTransport;
  let mockTransport2: MockTransport;
  let testEventData: LogEventData;

  beforeEach(() => {
    registry = new TransportRegistry();
    mockTransport1 = new MockTransport('transport1');
    mockTransport2 = new MockTransport('transport2');
    
    testEventData = {
      level: 'info',
      message: 'test message',
      timestamp: Date.now(),
      context: { test: 'data' },
      args: ['arg1', 'arg2'],
      component: 'test-component',
      logger: 'test-logger'
    };
  });

  afterEach(() => {
    mockTransport1.reset();
    mockTransport2.reset();
  });

  describe('Transport Management', () => {
    it('starts with empty registry', () => {
      expect(registry.size).toBe(0);
      expect(registry.isEmpty).toBe(true);
      expect(registry.getTransportNames()).toEqual([]);
    });

    it('adds transports successfully', () => {
      registry.add(mockTransport1);
      registry.add(mockTransport2);

      expect(registry.size).toBe(2);
      expect(registry.isEmpty).toBe(false);
      expect(registry.getTransportNames()).toEqual(['transport1', 'transport2']);
    });

    it('throws error for invalid transport objects', () => {
      expect(() => registry.add(null as any)).toThrow('Transport must be a valid object');
      expect(() => registry.add(undefined as any)).toThrow('Transport must be a valid object');
      expect(() => registry.add('string' as any)).toThrow('Transport must be a valid object');
    });

    it('throws error for transport without write method', () => {
      const invalidTransport = { name: 'invalid' } as any;
      expect(() => registry.add(invalidTransport)).toThrow('Transport must have a write method');
    });

    it('throws error for transport without valid name', () => {
      const noNameTransport = { write: vi.fn() } as any;
      expect(() => registry.add(noNameTransport)).toThrow('Transport must have a valid name');
      
      const emptyNameTransport = { name: '', write: vi.fn() } as any;
      expect(() => registry.add(emptyNameTransport)).toThrow('Transport must have a valid name');
    });

    it('throws error for duplicate transport names', () => {
      registry.add(mockTransport1);
      const duplicate = new MockTransport('transport1');
      
      expect(() => registry.add(duplicate)).toThrow("Transport with name 'transport1' already exists");
    });

    it('removes transports by name', () => {
      registry.add(mockTransport1);
      registry.add(mockTransport2);

      const removed = registry.remove('transport1');
      expect(removed).toBe(true);
      expect(registry.size).toBe(1);
      expect(registry.getTransportNames()).toEqual(['transport2']);
    });

    it('returns false when removing non-existent transport', () => {
      registry.add(mockTransport1);
      
      const removed = registry.remove('nonexistent');
      expect(removed).toBe(false);
      expect(registry.size).toBe(1);
    });

    it('throws error for invalid transport name in remove', () => {
      expect(() => registry.remove('')).toThrow('Transport name must be a non-empty string');
      expect(() => registry.remove(null as any)).toThrow('Transport name must be a non-empty string');
    });

    it('gets transport by name', () => {
      registry.add(mockTransport1);
      registry.add(mockTransport2);

      expect(registry.getTransport('transport1')).toBe(mockTransport1);
      expect(registry.getTransport('transport2')).toBe(mockTransport2);
      expect(registry.getTransport('nonexistent')).toBeUndefined();
    });

    it('clears all transports without closing them', () => {
      registry.add(mockTransport1);
      registry.add(mockTransport2);

      registry.clear();

      expect(registry.size).toBe(0);
      expect(registry.isEmpty).toBe(true);
      expect(mockTransport1.closeCalls).toBe(0);
      expect(mockTransport2.closeCalls).toBe(0);
    });
  });

  describe('Write Operations', () => {
    it('writes to all registered transports', () => {
      registry.add(mockTransport1);
      registry.add(mockTransport2);

      registry.writeToAll(testEventData);

      expect(mockTransport1.writeCalls).toHaveLength(1);
      expect(mockTransport1.writeCalls[0]).toBe(testEventData);
      expect(mockTransport2.writeCalls).toHaveLength(1);
      expect(mockTransport2.writeCalls[0]).toBe(testEventData);
    });

    it('handles sync transport write errors gracefully', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      mockTransport1.writeError = new Error('Sync write error');
      registry.add(mockTransport1);
      registry.add(mockTransport2);

      expect(() => registry.writeToAll(testEventData)).not.toThrow();
      
      expect(mockTransport1.writeCalls).toHaveLength(0);
      expect(mockTransport2.writeCalls).toHaveLength(1);
      expect(consoleSpy).toHaveBeenCalledWith(
        'Transport transport1 write failed:',
        expect.any(Error)
      );
      
      consoleSpy.mockRestore();
    });

    it('handles async transport write errors gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      mockTransport1.asyncWrite = true;
      mockTransport1.writeError = new Error('Async write error');
      registry.add(mockTransport1);
      registry.add(mockTransport2);

      registry.writeToAll(testEventData);
      
      // Wait for async error handling
      await new Promise(resolve => setTimeout(resolve, 0));
      
      expect(mockTransport2.writeCalls).toHaveLength(1);
      expect(consoleSpy).toHaveBeenCalledWith(
        'Transport transport1 write failed:',
        expect.any(Error)
      );
      
      consoleSpy.mockRestore();
    });

    it('works with empty registry', () => {
      expect(() => registry.writeToAll(testEventData)).not.toThrow();
    });
  });

  describe('Flush Operations', () => {
    it('flushes all registered transports', async () => {
      registry.add(mockTransport1);
      registry.add(mockTransport2);

      await registry.flushAll();

      expect(mockTransport1.flushCalls).toBe(1);
      expect(mockTransport2.flushCalls).toBe(1);
    });

    it('handles sync transport flush errors gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      mockTransport1.flushError = new Error('Sync flush error');
      registry.add(mockTransport1);
      registry.add(mockTransport2);

      await expect(registry.flushAll()).resolves.toBeUndefined();
      
      expect(mockTransport1.flushCalls).toBe(1);
      expect(mockTransport2.flushCalls).toBe(1);
      expect(consoleSpy).toHaveBeenCalledWith(
        'Transport transport1 flush failed:',
        expect.any(Error)
      );
      
      consoleSpy.mockRestore();
    });

    it('handles async transport flush errors gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      mockTransport1.asyncFlush = true;
      mockTransport1.flushError = new Error('Async flush error');
      registry.add(mockTransport1);
      registry.add(mockTransport2);

      await expect(registry.flushAll()).resolves.toBeUndefined();
      
      expect(mockTransport1.flushCalls).toBe(1);
      expect(mockTransport2.flushCalls).toBe(1);
      expect(consoleSpy).toHaveBeenCalledWith(
        'Transport transport1 flush failed:',
        expect.any(Error)
      );
      
      consoleSpy.mockRestore();
    });

    it('flushes with empty registry', async () => {
      await expect(registry.flushAll()).resolves.toBeUndefined();
    });
  });

  describe('Close Operations', () => {
    it('closes all registered transports and clears registry', async () => {
      registry.add(mockTransport1);
      registry.add(mockTransport2);

      await registry.closeAll();

      expect(mockTransport1.closeCalls).toBe(1);
      expect(mockTransport2.closeCalls).toBe(1);
      expect(registry.size).toBe(0);
      expect(registry.isEmpty).toBe(true);
    });

    it('handles sync transport close errors gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      mockTransport1.closeError = new Error('Sync close error');
      registry.add(mockTransport1);
      registry.add(mockTransport2);

      await expect(registry.closeAll()).resolves.toBeUndefined();
      
      expect(mockTransport1.closeCalls).toBe(1);
      expect(mockTransport2.closeCalls).toBe(1);
      expect(registry.size).toBe(0);
      expect(consoleSpy).toHaveBeenCalledWith(
        'Transport transport1 close failed:',
        expect.any(Error)
      );
      
      consoleSpy.mockRestore();
    });

    it('handles async transport close errors gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      mockTransport1.asyncClose = true;
      mockTransport1.closeError = new Error('Async close error');
      registry.add(mockTransport1);
      registry.add(mockTransport2);

      await expect(registry.closeAll()).resolves.toBeUndefined();
      
      expect(mockTransport1.closeCalls).toBe(1);
      expect(mockTransport2.closeCalls).toBe(1);
      expect(registry.size).toBe(0);
      expect(consoleSpy).toHaveBeenCalledWith(
        'Transport transport1 close failed:',
        expect.any(Error)
      );
      
      consoleSpy.mockRestore();
    });

    it('closes with empty registry', async () => {
      await expect(registry.closeAll()).resolves.toBeUndefined();
      expect(registry.isEmpty).toBe(true);
    });
  });

  describe('Mixed Sync/Async Operations', () => {
    it('handles mixed sync/async transports in write operations', () => {
      mockTransport1.asyncWrite = true; // Async transport
      mockTransport2.asyncWrite = false; // Sync transport
      
      registry.add(mockTransport1);
      registry.add(mockTransport2);

      registry.writeToAll(testEventData);

      expect(mockTransport1.writeCalls).toHaveLength(1);
      expect(mockTransport2.writeCalls).toHaveLength(1);
    });

    it('handles mixed sync/async transports in flush operations', async () => {
      mockTransport1.asyncFlush = true; // Async transport
      mockTransport2.asyncFlush = false; // Sync transport
      
      registry.add(mockTransport1);
      registry.add(mockTransport2);

      await registry.flushAll();

      expect(mockTransport1.flushCalls).toBe(1);
      expect(mockTransport2.flushCalls).toBe(1);
    });

    it('handles mixed sync/async transports in close operations', async () => {
      mockTransport1.asyncClose = true; // Async transport
      mockTransport2.asyncClose = false; // Sync transport
      
      registry.add(mockTransport1);
      registry.add(mockTransport2);

      await registry.closeAll();

      expect(mockTransport1.closeCalls).toBe(1);
      expect(mockTransport2.closeCalls).toBe(1);
      expect(registry.size).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    it('handles transport that returns undefined from write', () => {
      const undefinedTransport = {
        name: 'undefined-transport',
        write: vi.fn().mockReturnValue(undefined),
        flush: vi.fn(),
        close: vi.fn()
      };

      registry.add(undefinedTransport);
      expect(() => registry.writeToAll(testEventData)).not.toThrow();
      expect(undefinedTransport.write).toHaveBeenCalledWith(testEventData);
    });

    it('handles transport that returns non-promise from write', () => {
      const nonPromiseTransport = {
        name: 'non-promise-transport',
        write: vi.fn().mockReturnValue('not a promise'),
        flush: vi.fn(),
        close: vi.fn()
      };

      registry.add(nonPromiseTransport);
      expect(() => registry.writeToAll(testEventData)).not.toThrow();
      expect(nonPromiseTransport.write).toHaveBeenCalledWith(testEventData);
    });

    it('handles multiple errors from same transport', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      mockTransport1.writeError = new Error('Write error');
      mockTransport1.flushError = new Error('Flush error');
      mockTransport1.closeError = new Error('Close error');
      
      registry.add(mockTransport1);

      registry.writeToAll(testEventData);
      await registry.flushAll();
      await registry.closeAll();

      expect(consoleSpy).toHaveBeenCalledTimes(3);
      expect(consoleSpy).toHaveBeenNthCalledWith(1, 'Transport transport1 write failed:', expect.any(Error));
      expect(consoleSpy).toHaveBeenNthCalledWith(2, 'Transport transport1 flush failed:', expect.any(Error));
      expect(consoleSpy).toHaveBeenNthCalledWith(3, 'Transport transport1 close failed:', expect.any(Error));
      
      consoleSpy.mockRestore();
    });
  });
});