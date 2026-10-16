/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';

export default defineConfig({
  plugins: [react()],
  build: {
    // rolldown-vite: `manualChunks`/`advancedChunks` are
    // deprecated; codeSplitting.groups is the supported API.
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              // TipTap + ProseMirror only load with the lazy
              // note modals / note routes.
              name: 'vendor-tiptap',
              test: new RegExp(
                'node_modules[\\\\/]' +
                  '(@tiptap|prosemirror-|@mantine[\\\\/]tiptap)'
              ),
            },
            {
              name: 'vendor-mantine',
              test: /node_modules[\\/](@mantine|@emotion)[\\/]/,
            },
            {
              name: 'vendor-howler',
              test: /node_modules[\\/]howler[\\/]/,
            },
            {
              name: 'vendor-dndkit',
              test: /node_modules[\\/]@dnd-kit[\\/]/,
            },
            {
              name: 'vendor-react',
              test: new RegExp(
                'node_modules[\\\\/]' +
                  '(react|react-dom|scheduler|' +
                  'react-router-dom|react-router)[\\\\/]'
              ),
            },
          ],
        },
      },
    },
  },
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
    fileParallelism: false,
  },
});
