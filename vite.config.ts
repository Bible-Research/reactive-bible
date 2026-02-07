/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ["src/setupTests.ts"],
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    // Run tests sequentially to prevent memory leaks from compounding
    maxConcurrency: 1,
    // Increase timeout to prevent premature termination
    testTimeout: 30000,
  },
});
