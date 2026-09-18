import path from 'node:path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [react()],
  test: { environment: 'node', include: ['src/**/*.test.ts', 'src/**/*.test.tsx'], globals: true },
  ...(mode === 'preload' ? {
    build: {
      outDir: 'dist-electron/electron',
      emptyOutDir: false,
      lib: { entry: path.resolve(__dirname, 'src/electron/preload.ts'), formats: ['cjs'], fileName: 'preload' },
      rollupOptions: { external: ['electron'] },
    },
  } : {}),
}));