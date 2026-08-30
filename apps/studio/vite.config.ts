import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const resolveFromHere = (relativePath: string): string =>
  fileURLToPath(new URL(relativePath, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolveFromHere('./src'),
    },
  },
  server: {
    // Overridable so a second instance can run alongside the first.
    port: Number(process.env['PORT'] ?? 5173),
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
