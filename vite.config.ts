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
          // Deliberately no vendor-tiptap group: TipTap +
          // ProseMirror are only reachable from lazy chunks
          // (note modals, note routes), so automatic
          // splitting already keeps them lazy. A manual group
          // with the default includeDependenciesRecursively
          // dragged their whole dep closure (react,
          // @mantine/*, ~690KB) into a chunk that index.html
          // modulepreloaded — defeating the lazy-modal work.
          groups: [
            {
              // Declared before vendor-mantine so react —
              // a dependency of every @mantine package —
              // lands here instead of being captured by
              // vendor-mantine's recursive dep inclusion.
              name: 'vendor-react',
              test: new RegExp(
                'node_modules[\\\\/]' +
                  '(react|react-dom|scheduler|' +
                  'react-router-dom|react-router)[\\\\/]'
              ),
            },
            {
              // @mantine/tiptap is excluded (negative
              // lookahead) — it belongs to the lazy editor
              // graph; capturing it here would pull all of
              // TipTap into this eagerly loaded chunk.
              name: 'vendor-mantine',
              test: new RegExp(
                'node_modules[\\\\/]' +
                  '(?!@mantine[\\\\/]tiptap)' +
                  '(@mantine|@emotion|@floating-ui)[\\\\/]'
              ),
            },
            {
              name: 'vendor-howler',
              test: /node_modules[\\/]howler[\\/]/,
            },
            {
              name: 'vendor-dndkit',
              test: /node_modules[\\/]@dnd-kit[\\/]/,
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
