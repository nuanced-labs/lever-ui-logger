import { defineConfig } from 'vitest/config';

/// <reference types="vitest/globals" />

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.d.ts',
        '**/*.config.{js,ts}',
        'eslint.config.js',
        'scripts/**/*',
      ],
      thresholds: {
        global: {
          branches: 50,
          functions: 50,
          lines: 50,
          statements: 50,
        },
        // Per-module thresholds - disabled during setup phase
        // './src/logger/**/*': {
        //   branches: 90,
        //   functions: 95,
        //   lines: 95,
        //   statements: 95,
        // },
        // './src/transports/**/*': {
        //   branches: 85,
        //   functions: 90,
        //   lines: 85,
        //   statements: 85,
        // },
        // Allow lower coverage for simple utility/type files
        './src/**/types.ts': {
          branches: 0,
          functions: 0,
          lines: 0,
          statements: 0,
        },
        './src/**/events.ts': {
          branches: 50,
          functions: 80,
          lines: 80,
          statements: 80,
        },
      },
    },
  },
});