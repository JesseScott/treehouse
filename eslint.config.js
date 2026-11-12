import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['dist', 'reports', 'test-results', 'playwright-report', 'tools/reference'] },
  js.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [...tseslint.configs.strictTypeChecked],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { project: './tsconfig.app.json', tsconfigRootDir: import.meta.dirname },
    },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
    },
  },
  {
    files: ['e2e/**/*.ts', '*.config.ts'],
    extends: [...tseslint.configs.strictTypeChecked],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
      parserOptions: { project: './tsconfig.node.json', tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
    },
  },
  {
    files: ['**/*.mjs', '*.config.js'],
    languageOptions: { globals: globals.node },
  },
  prettier,
);
