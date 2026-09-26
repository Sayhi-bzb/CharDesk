import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';
import path from 'path';
import { workspaceAliases } from './scripts/testing/workspace-aliases.js';

export default defineConfig({
  plugins: [react()],
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          globals: true,
          include: ['packages/ui/src/**/*.{test,spec}.ts', 'scripts/**/*.{test,spec}.ts'],
          exclude: ['**/*.dom.{test,spec}.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'dom',
          environment: 'jsdom',
          globals: true,
          setupFiles: ['./scripts/testing/setup-dom.ts'],
          include: [
            'packages/ui/src/**/*.dom.{test,spec}.ts',
            'packages/ui/src/**/*.{test,spec}.tsx',
            'scripts/**/*.dom.{test,spec}.ts',
            'scripts/**/*.{test,spec}.tsx',
          ],
        },
      },
    ],
  },
  resolve: { alias: [...workspaceAliases,
    { find: '@', replacement: path.resolve(import.meta.dirname, './apps/canvas/src') }],
  },
});
