/**
 * Edge case tests for LoggerImpl to achieve 100% coverage
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LoggerImpl } from '../../src/logger/index.js';

// Mock transport that can fail during close
class FailingTransport {
  public name = 'failing-transport';
  public writeCalls: any[] = [];
  public shouldFailClose = false;
  public shouldFailWrite = false;
  public asyncError = false;

  write(eventData: any) {
    this.writeCalls.push(eventData);
    
    if (this.shouldFailWrite) {
      if (this.asyncError) {
        // Return a promise that rejects
        return Promise.reject(new Error('Async write failed'));
      } else {
        // Throw synchronously
        throw new Error('Sync write failed');
      }
    }
  }

  flush() {}

  close() {
    if (this.shouldFailClose) {
      return Promise.reject(new Error('Transport close failed'));
    }
    return Promise.resolve();
  }
}

describe('LoggerImpl Edge Cases', () => {
  let failingTransport: FailingTransport;
  
  beforeEach(() => {
    failingTransport = new FailingTransport();
  });

  describe('Transport Close Error Handling', () => {
    it('handles transport close errors during destroy', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      failingTransport.shouldFailClose = true;
      const logger = new LoggerImpl({
        transports: [failingTransport]
      });
      
      // Should not throw even if transport.close() fails
      await expect(logger.destroy()).resolves.toBeUndefined();
      
      // Should log the error
      expect(consoleSpy).toHaveBeenCalledWith(
        'Transport failing-transport close failed:',
        expect.any(Error)
      );
      
      consoleSpy.mockRestore();
    });
  });

  describe('Async Transport Error Handling', () => {
    it('handles async transport write errors', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      failingTransport.shouldFailWrite = true;
      failingTransport.asyncError = true;
      
      const logger = new LoggerImpl({
        transports: [failingTransport]
      });
      
      // Log something to trigger async error
      logger.info('test message');
      
      // Wait for async error to be caught
      return new Promise(resolve => {
        setTimeout(() => {
          expect(consoleSpy).toHaveBeenCalledWith(
            'Transport failing-transport write failed:',
            expect.any(Error)
          );
          consoleSpy.mockRestore();
          resolve(undefined);
        }, 10);
      });
    });
  });

  describe('Sync Transport Error Handling', () => {
    it('handles synchronous transport write errors', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      failingTransport.shouldFailWrite = true;
      failingTransport.asyncError = false;
      
      const logger = new LoggerImpl({
        transports: [failingTransport]
      });
      
      // Should not throw even if transport.write() fails
      expect(() => {
        logger.info('test message');
      }).not.toThrow();
      
      // Should log the error
      expect(consoleSpy).toHaveBeenCalledWith(
        'Transport failing-transport write failed:',
        expect.any(Error)
      );
      
      consoleSpy.mockRestore();
    });
  });

  describe('Mixed Transport Scenarios', () => {
    it('continues logging to working transports when some fail', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const workingTransport = new FailingTransport();
      workingTransport.name = 'working-transport';
      
      failingTransport.shouldFailWrite = true;
      
      const logger = new LoggerImpl({
        transports: [failingTransport, workingTransport]
      });
      
      logger.info('test message');
      
      // Working transport should still receive the log
      expect(workingTransport.writeCalls).toHaveLength(1);
      expect(workingTransport.writeCalls[0]).toMatchObject({
        level: 'info',
        message: 'test message'
      });
      
      // Error should be logged for failing transport
      expect(consoleSpy).toHaveBeenCalledWith(
        'Transport failing-transport write failed:',
        expect.any(Error)
      );
      
      consoleSpy.mockRestore();
    });
  });

  describe('Destroy Error Recovery', () => {
    it('continues cleanup even when multiple transports fail to close', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      const transport1 = new FailingTransport();
      transport1.name = 'failing-1';
      transport1.shouldFailClose = true;
      
      const transport2 = new FailingTransport();
      transport2.name = 'failing-2';
      transport2.shouldFailClose = true;
      
      const logger = new LoggerImpl({
        transports: [transport1, transport2]
      });
      
      await logger.destroy();
      
      // Should log errors for both transports
      expect(consoleSpy).toHaveBeenCalledWith(
        'Transport failing-1 close failed:',
        expect.any(Error)
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        'Transport failing-2 close failed:',
        expect.any(Error)
      );
      
      // Logger should still be considered destroyed
      expect(() => logger.info('should not log')).not.toThrow();
      
      consoleSpy.mockRestore();
    });
  });
});