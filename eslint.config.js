import eslint from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

export default [
  eslint.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
      globals: {
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        queueMicrotask: 'readonly',
        Promise: 'readonly',
        Object: 'readonly',
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        location: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        addEventListener: 'readonly',
        crypto: 'readonly',
        Intl: 'readonly',
        performance: 'readonly',
        fetch: 'readonly',
        Blob: 'readonly',
        TextEncoder: 'readonly',
        TextDecoder: 'readonly',
        ReadableStream: 'readonly',
        CompressionStream: 'readonly',
        DecompressionStream: 'readonly',
        WebSocket: 'readonly',
        Worker: 'readonly',
        indexedDB: 'readonly',
        IDBDatabase: 'readonly',
        IDBRequest: 'readonly',
        IDBKeyRange: 'readonly',
        IDBOpenDBRequest: 'readonly',
        global: 'readonly',
        globalThis: 'readonly',
        AbortController: 'readonly',
        Response: 'readonly',
        Headers: 'readonly',
        Request: 'readonly',
        btoa: 'readonly',
        atob: 'readonly',
        PromiseRejectionEvent: 'readonly',
        OnErrorEventHandlerNonNull: 'readonly',
        WindowEventHandlers: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { 
        'argsIgnorePattern': '^_',
        'varsIgnorePattern': '^_' 
      }],
      'no-unused-vars': ['error', { 
        'argsIgnorePattern': '^_',
        'varsIgnorePattern': '^_' 
      }],
      '@typescript-eslint/no-explicit-any': 'error',
      'prefer-const': 'error',
      'no-undef': 'error',
    },
  },
  {
    files: ['**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off', // Allow any in tests
      '@typescript-eslint/no-unused-vars': 'off', // Allow unused vars in tests
      'no-unused-vars': 'off', // Allow unused vars in tests
    },
  },
  {
    files: ['**/types.ts', '**/events.ts', '**/logger-impl.ts', '**/error-categorizer.ts', '**/sourcemap-resolver.ts', '**/transport-interface.ts', '**/rate-limiter.ts', '**/recovery-strategies.ts', '**/reporting-integrations.ts', '**/index.ts', '**/global-error-capture.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn', // Allow any in type definitions but warn
      '@typescript-eslint/no-unused-vars': 'off', // Allow unused vars in type/interface definitions
      'no-unused-vars': 'off', // Allow unused vars in constructor parameters and placeholder implementations
    },
  },
];