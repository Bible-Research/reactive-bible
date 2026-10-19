/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
  },
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['src/setupTests.ts'],
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    testTimeout: 30000,
    // Files run sequentially on purpose: several suites mount the
    // full <App/> tree (which eagerly bundles kjv.json's ~31k
    // verses), so parallel workers peak well past the default heap
    // and die with ERR_WORKER_OUT_OF_MEMORY. Serial execution keeps
    // peak memory in bounds at the cost of wall-clock time.
    fileParallelism: false,
  },
});
