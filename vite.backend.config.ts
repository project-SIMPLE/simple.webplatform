import { defineConfig } from 'vite';
import { builtinModules } from 'module';
import path from 'path';

export default defineConfig({
  build: {
    target: 'node24',
    lib: {
      entry: path.resolve(__dirname, 'src/api/index.ts'),
      formats: ['cjs'],
      fileName: 'index',
    },
    outDir: 'dist-api',
    rollupOptions: {
      external: [
        ...builtinModules,
        ...builtinModules.map((m) => `node:${m}`),
        'uWebSockets.js',
        'fsevents',
        // Add other native modules if any
      ],
    },
    ssr: true,
  },
  ssr: {
    noExternal: true,
    external: ['uWebSockets.js'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
