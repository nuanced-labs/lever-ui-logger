/**
 * Context Management Component for Logger
 * 
 * Manages hierarchical context for logging, supporting context inheritance,
 * merging, and isolation. Provides efficient context stacking for child
 * loggers and temporary context scopes.
 * 
 * @example
 * ```typescript
 * import { ContextManager } from './context-manager';
 * 
 * const contextManager = new ContextManager({ service: 'api' });
 * 
 * // Add context
 * contextManager.add({ userId: '123' });
 * 
 * // Get merged context
 * const context = contextManager.getContext(); // { service: 'api', userId: '123' }
 * 
 * // Create child with additional context
 * const child = contextManager.createChild({ requestId: 'abc' });
 * ```
 */

/**
 * Manages logging context with support for inheritance and merging
 */
export class ContextManager {
  private readonly baseContext: Record<string, unknown>;
  private additionalContext: Record<string, unknown> = {};
  private readonly contextStack: Record<string, unknown>[] = [];
  private readonly parent?: ContextManager;

  /**
   * Creates a new context manager
   * 
   * @param baseContext - Base context that cannot be modified
   * @param parent - Optional parent context manager for inheritance
   */
  constructor(
    baseContext: Record<string, unknown> = {},
    parent?: ContextManager
  ) {
    // Deep clone the base context to prevent external modifications
    this.baseContext = ContextManager.deepCloneStatic(baseContext);
    this.parent = parent;
    
    // Inherit parent's context if available
    if (parent) {
      this.additionalContext = { ...parent.getContext() };
    }
  }

  /**
   * Get the current merged context
   * 
   * @returns Merged context from all layers
   */
  getContext(): Record<string, unknown> {
    // Merge contexts in order: parent -> base -> additional -> stack
    let merged: Record<string, unknown> = {};
    
    // Start with base context
    merged = { ...this.baseContext };
    
    // Add additional context
    merged = { ...merged, ...this.additionalContext };
    
    // Apply context stack (each level overrides previous)
    for (const stackContext of this.contextStack) {
      merged = { ...merged, ...stackContext };
    }
    
    return merged;
  }

  /**
   * Get only the base context (immutable)
   */
  getBaseContext(): Record<string, unknown> {
    return { ...this.baseContext };
  }

  /**
   * Get only the additional context
   */
  getAdditionalContext(): Record<string, unknown> {
    return { ...this.additionalContext };
  }

  /**
   * Add or update context fields
   * 
   * @param context - Context to add/merge
   */
  add(context: Record<string, unknown>): void {
    // Deep clone to prevent external modifications
    const cloned = this.deepClone(context);
    this.additionalContext = {
      ...this.additionalContext,
      ...cloned
    };
  }

  /**
   * Set context (replaces additional context)
   * 
   * @param context - New context to set
   */
  set(context: Record<string, unknown>): void {
    this.additionalContext = this.deepClone(context);
  }

  /**
   * Remove specific context fields
   * 
   * @param keys - Keys to remove from context
   */
  remove(...keys: string[]): void {
    for (const key of keys) {
      delete this.additionalContext[key];
    }
  }

  /**
   * Clear all additional context (keeps base context)
   */
  clear(): void {
    this.additionalContext = {};
    this.contextStack.length = 0;
  }

  /**
   * Push a temporary context onto the stack
   * 
   * @param context - Temporary context to push
   * @returns Function to pop this context
   */
  push(context: Record<string, unknown>): () => void {
    this.contextStack.push({ ...context });
    
    // Return a function to pop this specific context
    const stackIndex = this.contextStack.length - 1;
    return () => {
      // Only pop if it's still at the expected position
      if (this.contextStack.length > stackIndex) {
        this.contextStack.splice(stackIndex, 1);
      }
    };
  }

  /**
   * Pop the most recent context from the stack
   * 
   * @returns The popped context or undefined
   */
  pop(): Record<string, unknown> | undefined {
    return this.contextStack.pop();
  }

  /**
   * Execute a function with temporary context
   * 
   * @param context - Temporary context
   * @param fn - Function to execute
   * @returns Result of the function
   */
  withContext<T>(
    context: Record<string, unknown>,
    fn: () => T
  ): T {
    const popContext = this.push(context);
    try {
      return fn();
    } finally {
      popContext();
    }
  }

  /**
   * Execute an async function with temporary context
   * 
   * @param context - Temporary context
   * @param fn - Async function to execute
   * @returns Promise with result of the function
   */
  async withContextAsync<T>(
    context: Record<string, unknown>,
    fn: () => Promise<T>
  ): Promise<T> {
    const popContext = this.push(context);
    try {
      return await fn();
    } finally {
      popContext();
    }
  }

  /**
   * Create a child context manager
   * 
   * @param additionalContext - Additional context for the child
   * @returns New ContextManager instance
   */
  createChild(additionalContext: Record<string, unknown> = {}): ContextManager {
    const child = new ContextManager(
      { ...this.getContext(), ...additionalContext },
      this
    );
    return child;
  }

  /**
   * Clone this context manager
   * 
   * @param includeStack - Whether to include the context stack
   * @returns New ContextManager instance
   */
  clone(includeStack = false): ContextManager {
    const cloned = new ContextManager(this.baseContext);
    cloned.additionalContext = { ...this.additionalContext };
    
    if (includeStack) {
      cloned.contextStack.push(...this.contextStack.map(ctx => ({ ...ctx })));
    }
    
    return cloned;
  }

  /**
   * Check if context has a specific key
   * 
   * @param key - Key to check
   * @returns True if key exists in context
   */
  has(key: string): boolean {
    const context = this.getContext();
    return key in context;
  }

  /**
   * Get a specific context value
   * 
   * @param key - Key to get
   * @returns Value or undefined
   */
  get(key: string): unknown {
    const context = this.getContext();
    return context[key];
  }

  /**
   * Get the size of the current context
   * 
   * @returns Number of keys in merged context
   */
  get size(): number {
    return Object.keys(this.getContext()).length;
  }

  /**
   * Get the depth of the context stack
   * 
   * @returns Stack depth
   */
  get stackDepth(): number {
    return this.contextStack.length;
  }

  /**
   * Check if context is empty
   * 
   * @returns True if no context is set
   */
  get isEmpty(): boolean {
    return this.size === 0;
  }

  /**
   * Merge multiple contexts
   * 
   * @param contexts - Contexts to merge
   * @returns Merged context
   */
  static merge(...contexts: Record<string, unknown>[]): Record<string, unknown> {
    return contexts.reduce((merged, context) => ({
      ...merged,
      ...context
    }), {});
  }

  /**
   * Filter context by allowed keys
   * 
   * @param context - Context to filter
   * @param allowedKeys - Keys to allow
   * @returns Filtered context
   */
  static filter(
    context: Record<string, unknown>,
    allowedKeys: string[]
  ): Record<string, unknown> {
    const filtered: Record<string, unknown> = {};
    for (const key of allowedKeys) {
      if (key in context) {
        filtered[key] = context[key];
      }
    }
    return filtered;
  }

  /**
   * Exclude keys from context
   * 
   * @param context - Context to filter
   * @param excludedKeys - Keys to exclude
   * @returns Filtered context
   */
  static exclude(
    context: Record<string, unknown>,
    excludedKeys: string[]
  ): Record<string, unknown> {
    const filtered = { ...context };
    for (const key of excludedKeys) {
      delete filtered[key];
    }
    return filtered;
  }

  /**
   * Static deep clone helper for use in constructor
   * 
   * @private
   */
  private static deepCloneStatic(obj: Record<string, unknown>): Record<string, unknown> {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }

    const cloned: Record<string, unknown> = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const value = obj[key];
        if (value === null || value === undefined) {
          cloned[key] = value;
        } else if (typeof value === 'object') {
          if (Array.isArray(value)) {
            cloned[key] = [...value];
          } else if (value instanceof Date) {
            cloned[key] = new Date(value.getTime());
          } else {
            // Recursively clone nested objects
            cloned[key] = ContextManager.deepCloneStatic(value as Record<string, unknown>);
          }
        } else {
          cloned[key] = value;
        }
      }
    }
    return cloned;
  }

  /**
   * Deep clone an object (simple implementation for context objects)
   * 
   * @private
   * @param obj - Object to clone
   * @returns Deep cloned object
   */
  private deepClone(obj: Record<string, unknown>): Record<string, unknown> {
    return ContextManager.deepCloneStatic(obj);
  }
}