/**
 * Unit tests for ContextManager
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ContextManager } from '../../src/logger/context-manager.js';

describe('ContextManager', () => {
  let manager: ContextManager;

  beforeEach(() => {
    manager = new ContextManager();
  });

  describe('Construction and Base Context', () => {
    it('creates manager with empty context', () => {
      expect(manager.getContext()).toEqual({});
      expect(manager.isEmpty).toBe(true);
      expect(manager.size).toBe(0);
    });

    it('creates manager with base context', () => {
      manager = new ContextManager({ service: 'api', version: '1.0' });
      expect(manager.getContext()).toEqual({ service: 'api', version: '1.0' });
      expect(manager.getBaseContext()).toEqual({ service: 'api', version: '1.0' });
      expect(manager.size).toBe(2);
    });

    it('base context is immutable', () => {
      manager = new ContextManager({ service: 'api' });
      const base = manager.getBaseContext();
      base.modified = true;
      
      expect(manager.getBaseContext()).toEqual({ service: 'api' });
      expect(manager.getBaseContext()).not.toHaveProperty('modified');
    });
  });

  describe('Context Management', () => {
    it('adds context fields', () => {
      manager.add({ userId: '123' });
      expect(manager.getContext()).toEqual({ userId: '123' });
      
      manager.add({ sessionId: 'abc' });
      expect(manager.getContext()).toEqual({ userId: '123', sessionId: 'abc' });
    });

    it('overwrites existing fields when adding', () => {
      manager.add({ userId: '123' });
      manager.add({ userId: '456' });
      expect(manager.getContext()).toEqual({ userId: '456' });
    });

    it('sets context (replaces additional)', () => {
      manager.add({ userId: '123', sessionId: 'abc' });
      manager.set({ requestId: 'xyz' });
      
      expect(manager.getContext()).toEqual({ requestId: 'xyz' });
      expect(manager.has('userId')).toBe(false);
    });

    it('removes specific context fields', () => {
      manager.add({ userId: '123', sessionId: 'abc', requestId: 'xyz' });
      manager.remove('userId', 'requestId');
      
      expect(manager.getContext()).toEqual({ sessionId: 'abc' });
      expect(manager.has('userId')).toBe(false);
      expect(manager.has('requestId')).toBe(false);
    });

    it('clears all additional context', () => {
      manager = new ContextManager({ service: 'api' });
      manager.add({ userId: '123', sessionId: 'abc' });
      manager.clear();
      
      expect(manager.getContext()).toEqual({ service: 'api' });
      expect(manager.getAdditionalContext()).toEqual({});
    });

    it('preserves base context when clearing', () => {
      manager = new ContextManager({ service: 'api', version: '1.0' });
      manager.add({ userId: '123' });
      manager.clear();
      
      expect(manager.getContext()).toEqual({ service: 'api', version: '1.0' });
    });
  });

  describe('Context Stack', () => {
    it('pushes temporary context onto stack', () => {
      manager.add({ userId: '123' });
      manager.push({ requestId: 'abc' });
      
      expect(manager.getContext()).toEqual({ userId: '123', requestId: 'abc' });
      expect(manager.stackDepth).toBe(1);
    });

    it('pops context from stack', () => {
      manager.add({ userId: '123' });
      manager.push({ requestId: 'abc' });
      
      const popped = manager.pop();
      expect(popped).toEqual({ requestId: 'abc' });
      expect(manager.getContext()).toEqual({ userId: '123' });
      expect(manager.stackDepth).toBe(0);
    });

    it('returns undefined when popping empty stack', () => {
      expect(manager.pop()).toBeUndefined();
    });

    it('push returns function to pop specific context', () => {
      manager.push({ level1: 'a' });
      const popLevel2 = manager.push({ level2: 'b' });
      manager.push({ level3: 'c' });
      
      expect(manager.stackDepth).toBe(3);
      
      popLevel2(); // Should remove level2
      
      expect(manager.stackDepth).toBe(2);
      expect(manager.getContext()).toEqual({ level1: 'a', level3: 'c' });
    });

    it('stack contexts override each other in order', () => {
      manager.add({ key: 'base' });
      manager.push({ key: 'stack1' });
      manager.push({ key: 'stack2' });
      
      expect(manager.get('key')).toBe('stack2');
      
      manager.pop();
      expect(manager.get('key')).toBe('stack1');
      
      manager.pop();
      expect(manager.get('key')).toBe('base');
    });
  });

  describe('Temporary Context Execution', () => {
    it('executes function with temporary context', () => {
      manager.add({ userId: '123' });
      
      let contextDuringExecution: Record<string, unknown> | null = null;
      const result = manager.withContext({ requestId: 'abc' }, () => {
        contextDuringExecution = manager.getContext();
        return 'success';
      });
      
      expect(result).toBe('success');
      expect(contextDuringExecution).toEqual({ userId: '123', requestId: 'abc' });
      expect(manager.getContext()).toEqual({ userId: '123' });
    });

    it('executes async function with temporary context', async () => {
      manager.add({ userId: '123' });
      
      let contextDuringExecution: Record<string, unknown> | null = null;
      const result = await manager.withContextAsync({ requestId: 'abc' }, async () => {
        contextDuringExecution = manager.getContext();
        await new Promise(resolve => setTimeout(resolve, 10));
        return 'async-success';
      });
      
      expect(result).toBe('async-success');
      expect(contextDuringExecution).toEqual({ userId: '123', requestId: 'abc' });
      expect(manager.getContext()).toEqual({ userId: '123' });
    });

    it('removes temporary context even if function throws', () => {
      manager.add({ userId: '123' });
      
      expect(() => {
        manager.withContext({ requestId: 'abc' }, () => {
          throw new Error('Test error');
        });
      }).toThrow('Test error');
      
      expect(manager.getContext()).toEqual({ userId: '123' });
      expect(manager.stackDepth).toBe(0);
    });

    it('removes temporary context even if async function rejects', async () => {
      manager.add({ userId: '123' });
      
      await expect(
        manager.withContextAsync({ requestId: 'abc' }, async () => {
          throw new Error('Async error');
        })
      ).rejects.toThrow('Async error');
      
      expect(manager.getContext()).toEqual({ userId: '123' });
      expect(manager.stackDepth).toBe(0);
    });
  });

  describe('Child Contexts', () => {
    it('creates child with inherited context', () => {
      manager.add({ userId: '123', sessionId: 'abc' });
      const child = manager.createChild({ requestId: 'xyz' });
      
      expect(child.getContext()).toEqual({
        userId: '123',
        sessionId: 'abc',
        requestId: 'xyz'
      });
    });

    it('child changes do not affect parent', () => {
      manager.add({ userId: '123' });
      const child = manager.createChild();
      
      child.add({ sessionId: 'abc' });
      
      expect(child.getContext()).toEqual({ userId: '123', sessionId: 'abc' });
      expect(manager.getContext()).toEqual({ userId: '123' });
    });

    it('parent changes do not affect child after creation', () => {
      manager.add({ userId: '123' });
      const child = manager.createChild();
      
      manager.add({ sessionId: 'abc' });
      
      expect(manager.getContext()).toEqual({ userId: '123', sessionId: 'abc' });
      expect(child.getContext()).toEqual({ userId: '123' });
    });
  });

  describe('Cloning', () => {
    it('clones context manager', () => {
      manager.add({ userId: '123', sessionId: 'abc' });
      const cloned = manager.clone();
      
      expect(cloned.getContext()).toEqual({ userId: '123', sessionId: 'abc' });
      
      cloned.add({ requestId: 'xyz' });
      expect(cloned.getContext()).toEqual({
        userId: '123',
        sessionId: 'abc',
        requestId: 'xyz'
      });
      expect(manager.getContext()).toEqual({ userId: '123', sessionId: 'abc' });
    });

    it('clones without stack by default', () => {
      manager.add({ userId: '123' });
      manager.push({ requestId: 'abc' });
      
      const cloned = manager.clone();
      
      expect(cloned.getContext()).toEqual({ userId: '123' });
      expect(cloned.stackDepth).toBe(0);
    });

    it('clones with stack when requested', () => {
      manager.add({ userId: '123' });
      manager.push({ requestId: 'abc' });
      manager.push({ level: 'debug' });
      
      const cloned = manager.clone(true);
      
      expect(cloned.getContext()).toEqual({
        userId: '123',
        requestId: 'abc',
        level: 'debug'
      });
      expect(cloned.stackDepth).toBe(2);
    });
  });

  describe('Context Queries', () => {
    it('checks if context has key', () => {
      manager.add({ userId: '123', sessionId: 'abc' });
      
      expect(manager.has('userId')).toBe(true);
      expect(manager.has('sessionId')).toBe(true);
      expect(manager.has('requestId')).toBe(false);
    });

    it('gets specific context value', () => {
      manager.add({ userId: '123', count: 42, active: true });
      
      expect(manager.get('userId')).toBe('123');
      expect(manager.get('count')).toBe(42);
      expect(manager.get('active')).toBe(true);
      expect(manager.get('missing')).toBeUndefined();
    });

    it('returns context size', () => {
      expect(manager.size).toBe(0);
      
      manager.add({ a: 1 });
      expect(manager.size).toBe(1);
      
      manager.add({ b: 2, c: 3 });
      expect(manager.size).toBe(3);
    });
  });

  describe('Static Utility Methods', () => {
    it('merges multiple contexts', () => {
      const ctx1 = { a: 1, b: 2 };
      const ctx2 = { b: 3, c: 4 };
      const ctx3 = { d: 5 };
      
      const merged = ContextManager.merge(ctx1, ctx2, ctx3);
      
      expect(merged).toEqual({ a: 1, b: 3, c: 4, d: 5 });
    });

    it('filters context by allowed keys', () => {
      const context = { userId: '123', password: 'secret', email: 'test@example.com' };
      const filtered = ContextManager.filter(context, ['userId', 'email']);
      
      expect(filtered).toEqual({ userId: '123', email: 'test@example.com' });
      expect(filtered).not.toHaveProperty('password');
    });

    it('excludes keys from context', () => {
      const context = { userId: '123', password: 'secret', email: 'test@example.com' };
      const filtered = ContextManager.exclude(context, ['password']);
      
      expect(filtered).toEqual({ userId: '123', email: 'test@example.com' });
      expect(filtered).not.toHaveProperty('password');
    });
  });

  describe('Edge Cases', () => {
    it('handles undefined values in context', () => {
      manager.add({ key: undefined });
      expect(manager.get('key')).toBeUndefined();
      expect(manager.has('key')).toBe(true);
    });

    it('handles null values in context', () => {
      manager.add({ key: null });
      expect(manager.get('key')).toBeNull();
      expect(manager.has('key')).toBe(true);
    });

    it('handles nested objects in context', () => {
      const nested = { inner: { value: 42 } };
      manager.add({ data: nested });
      
      const retrieved = manager.get('data') as any;
      expect(retrieved).toEqual({ inner: { value: 42 } });
      
      // Verify it's a copy
      nested.inner.value = 100;
      expect((manager.get('data') as any).inner.value).toBe(42);
    });

    it('handles empty string keys', () => {
      manager.add({ '': 'empty-key-value' });
      expect(manager.get('')).toBe('empty-key-value');
      expect(manager.has('')).toBe(true);
    });
  });
});