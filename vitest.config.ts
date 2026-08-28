import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const fromRoot = (relativePath: string): string =>
  fileURLToPath(new URL(relativePath, import.meta.url));

const domSetup = [fromRoot('./test/setup.ts')];

export default defineConfig({
  test: {
    projects: [
      {
        // The shader core must stay usable without a DOM, so it is tested headlessly.
        test: {
          name: 'shader-core',
          root: fromRoot('./packages/shader-core'),
          environment: 'node',
          include: ['src/**/*.test.ts'],
        },
      },
      {
        plugins: [react()],
        test: {
          name: 'design-system',
          root: fromRoot('./packages/design-system'),
          environment: 'jsdom',
          setupFiles: domSetup,
          include: ['src/**/*.test.{ts,tsx}'],
        },
      },
      {
        plugins: [react()],
        test: {
          name: 'studio',
          root: fromRoot('./apps/studio'),
          environment: 'jsdom',
          setupFiles: domSetup,
          include: ['src/**/*.test.{ts,tsx}'],
        },
      },
    ],
  },
});
