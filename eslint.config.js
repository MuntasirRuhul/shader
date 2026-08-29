import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript';
import importX from 'eslint-plugin-import-x';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import designTokens from './tools/eslint-rules/no-literal-design-values.js';

const tsProjects = [
  'packages/design-system/tsconfig.json',
  'packages/shader-core/tsconfig.json',
  'apps/studio/tsconfig.json',
];

/**
 * Dependencies point one way only: the design system and the shader core never
 * reach into the application, and the design system never reaches into the core.
 * This is what keeps the design system separable rather than nominally separate.
 */
const layerBoundaries = [
  {
    files: ['packages/design-system/**/*.{ts,tsx}'],
    rules: {
      'import-x/no-restricted-paths': 'off',
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@shader/studio', '@shader/studio/**', '@shader/core', '@shader/core/**'],
              message:
                'The design system must not depend on the application or the shader core. Move shared code down, not up.',
            },
            {
              group: ['**/apps/**'],
              message: 'The design system must not import from the application.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/shader-core/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@shader/studio',
                '@shader/studio/**',
                '@shader/design-system',
                '@shader/design-system/**',
              ],
              message:
                'The shader core must not depend on the application or the design system. It stays headless and framework-free.',
            },
            {
              group: ['**/apps/**'],
              message: 'The shader core must not import from the application.',
            },
            {
              group: ['react', 'react-dom', 'react/**', 'react-dom/**'],
              message:
                'The shader core must stay framework-free so it can be tested without a DOM.',
            },
          ],
        },
      ],
    },
  },
];

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**', '**/generated/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          // Build tooling lives outside the packages' TS projects.
          allowDefaultProject: [
            'eslint.config.js',
            'vitest.config.ts',
            'test/*.ts',
            'apps/*/vite.config.ts',
            'tools/eslint-rules/*.js',
            'stylelint.config.js',
          ],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'import-x': importX,
    },
    settings: {
      'import-x/resolver-next': [
        createTypeScriptImportResolver({ project: tsProjects, noWarnOnMultipleProjects: true }),
      ],
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'import-x/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          'newlines-between': 'never',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      'import-x/no-cycle': 'error',
      'no-console': ['error', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
    },
  },
  {
    files: ['**/*.tsx'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'jsx-a11y': jsxA11y,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,
      // A focusable `separator` carrying aria-valuenow is the ARIA window
      // splitter pattern — a widget, despite the rule's default role list.
      'jsx-a11y/no-noninteractive-tabindex': [
        'error',
        { tags: [], roles: ['tabpanel', 'separator'], allowExpressionValues: true },
      ],
      'jsx-a11y/no-noninteractive-element-interactions': [
        'error',
        {
          handlers: ['onClick', 'onMouseDown', 'onMouseUp', 'onKeyPress', 'onKeyDown', 'onKeyUp'],
          alert: ['onKeyUp', 'onKeyDown', 'onKeyPress'],
          body: ['onError', 'onLoad'],
          dialog: ['onKeyUp', 'onKeyDown', 'onKeyPress'],
          iframe: ['onError', 'onLoad'],
          img: ['onError', 'onLoad'],
        },
      ],
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    },
  },
  ...layerBoundaries,
  {
    // Every visual value in a component must resolve from a design token.
    files: ['packages/design-system/src/**/*.{ts,tsx}', 'apps/studio/src/**/*.{ts,tsx}'],
    plugins: { 'design-tokens': designTokens },
    rules: {
      'design-tokens/no-literal-design-values': 'error',
    },
  },
  {
    // The token source is where literal values are defined, by definition.
    files: ['packages/design-system/src/tokens/**'],
    rules: {
      'design-tokens/no-literal-design-values': 'off',
    },
  },
  {
    files: ['**/*.test.{ts,tsx}', 'test/**/*.ts', '**/tokens/build.ts'],
    rules: {
      'no-console': 'off',
      'no-restricted-imports': 'off',
    },
  },
  {
    // Build tooling sits outside the packages' TS projects, so type-aware rules
    // have no type information to work from here.
    files: ['eslint.config.js', 'stylelint.config.js', '**/*.config.{ts,js}', 'tools/**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
    rules: {
      'no-console': 'off',
      'no-restricted-imports': 'off',
    },
  },
  prettier,
);
