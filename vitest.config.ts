import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react-swc';
import path from 'path';
import { workspaceAliases } from './scripts/testing/workspace-aliases.js'

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
          setupFiles: ['./src/test/setup-node.ts'],
          include: [
            'src/**/*.{test,spec}.ts',
            'packages/ui/src/**/*.{test,spec}.ts',
            'scripts/**/*.{test,spec}.ts',
          ],
          exclude: ['**/*.dom.{test,spec}.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'dom',
          environment: 'jsdom',
          globals: true,
          setupFiles: ['./src/test/setup-dom.ts'],
          include: [
            'src/**/*.dom.{test,spec}.ts',
            'src/**/*.{test,spec}.tsx',
            'packages/ui/src/**/*.dom.{test,spec}.ts',
            'packages/ui/src/**/*.{test,spec}.tsx',
            'scripts/**/*.dom.{test,spec}.ts',
            'scripts/**/*.{test,spec}.tsx',
          ],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: ['node_modules/', 'src/test/', '**/*.{test,spec}.{ts,tsx}']
    }
  },
  resolve: {
    alias: [
      ...workspaceAliases,
      { find: '@', replacement: path.resolve(import.meta.dirname, './src') }
    ]
  }
});
