import { defineConfig } from 'tsup';

export default defineConfig([
  // Core entry point
  {
    entry: { index: 'src/index.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
    outDir: 'dist',
  },
  // Logger subpath export
  {
    entry: { logger: 'src/logger/index.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    outDir: 'dist',
  },
  // Transports subpath export  
  {
    entry: { transports: 'src/transports/index.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    outDir: 'dist',
  },
]);