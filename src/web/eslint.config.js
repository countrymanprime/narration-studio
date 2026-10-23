import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import tailwind from 'eslint-plugin-tailwindcss';
import globals from 'globals';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'demo/dist/**',
      'node_modules/**',
      'test-results/**',
      'playwright-report/**',
      // The build scripts are plain Node (node:test), and the pages' scripts and styles are browser text the build inlines: neither is linted here, as before.
      'build/**',
      'common/**',
      'docs/**',
      'landing/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  tailwind.configs.recommended,
  // The banner and the panel use the app's own design tokens and utilities, so the Tailwind rules read the app's stylesheet.
  { settings: { tailwindcss: { cssConfigPath: path.join(here, '..', 'studio', 'ui', 'src', 'styles.css') } } },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      // src/studio/ui is the shared side, read through the one `@ui` alias so a move inside it breaks one declared boundary, not a scatter of `../../ui/` strings.
      'no-restricted-imports': ['error', { patterns: [{ regex: '(^|/)ui/(src|wailsjs)(/|$)', message: 'Import the app as `@ui/<module>`.' }] }],
      'tailwindcss/no-custom-classname': 'off',
      'tailwindcss/enforces-canonical-classname': 'off',
      'tailwindcss/no-unnecessary-arbitrary-value': 'off',
    },
  },
);
