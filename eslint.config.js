import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores([
    '**/dist',
    '**/coverage',
    'apps/docs/build',
    'apps/docs/.react-router',
    'packages/chargraph/src/vendor',
  ]),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
    ],
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      // React Compiler is not enabled; enforce the runtime Hook contract without compiler-only diagnostics.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
  {
    files: ['apps/*/src/**/*.{ts,tsx}'],
    rules: {
      // Mixed component/helper modules can still run; Fast Refresh falls back to a remount.
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  {
    files: ['src/**/*.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='title']",
          message: 'Native title tooltips are prohibited in the Host UI; use @/shared/ui/tooltip.',
        },
      ],
    },
  },
  {
    files: ['src/**/*.worker.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/domains/*/public', '@/domains/*/react'],
              message: 'Workers may only import worker-safe domain leaf modules.',
            },
          ],
        },
      ],
    },
  },
])
