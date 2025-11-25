import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';

const IMPERATIVE_DOM_SELECTOR =
  'CallExpression[callee.property.name=/^(querySelector|querySelectorAll|getElementById|getElementsByClassName|getElementsByTagName|getElementsByName|closest|matches)$/]';

const IMPERATIVE_DOM_SELECTOR_EXCEPT_ROOT_ID =
  'CallExpression[callee.property.name=/^(querySelector|querySelectorAll|getElementsByClassName|getElementsByTagName|getElementsByName|closest|matches)$/]';

const localTsxRulesPlugin = {
  rules: {
    'single-value-export': {
      meta: {
        type: 'suggestion',
        docs: {
          description:
            'Allow at most one runtime value export per .tsx file (exported types and interfaces are allowed).',
        },
        schema: [],
      },
      create(context) {
        let valueExports = 0;
        const recordExport = (node) => {
          valueExports += 1;
          if (valueExports > 1) {
            context.report({
              node,
              message:
                'Each .tsx file may have at most one runtime value export (one React component). Move extra components into their own .tsx file or pure helpers into a .ts file.',
            });
          }
        };
        return {
          ExportDefaultDeclaration(node) {
            if (node.exportKind !== 'type') {
              recordExport(node);
            }
          },
          ExportNamedDeclaration(node) {
            if (node.exportKind === 'type') return;
            if (node.declaration) {
              if (
                node.declaration.type === 'TSTypeAliasDeclaration' ||
                node.declaration.type === 'TSInterfaceDeclaration'
              ) {
                return;
              }
              if (node.declaration.type === 'VariableDeclaration') {
                for (const declarator of node.declaration.declarations) {
                  recordExport(declarator);
                }
                return;
              }
              recordExport(node);
              return;
            }
            for (const spec of node.specifiers || []) {
              if (spec.exportKind !== 'type') {
                recordExport(spec);
              }
            }
          },
          ExportAllDeclaration(node) {
            if (node.exportKind !== 'type') {
              recordExport(node);
            }
          },
        };
      },
    },
  },
};

export default defineConfig([
  globalIgnores([
    'dist',
    'node_modules',
    'playwright-report',
    'test-results',
    'src/types/openapi.d.ts',
  ]),

  // 1. Statically forbid untyped JavaScript files anywhere inside src/
  {
    files: ['src/**/*.{js,jsx,mjs,cjs}', '**/src/**/*.{js,jsx,mjs,cjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Program',
          message:
            'Untyped JavaScript files (.js/.jsx) are forbidden in src/. Use strict TypeScript (.ts/.tsx) instead.',
        },
      ],
    },
  },

  // 2. Strict TypeScript (Type-Checked) + React Hooks + Fast Refresh + Imperative DOM Ban
  {
    files: ['src/**/*.{ts,tsx}', '**/src/**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommendedTypeChecked,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': 'error',
      '@typescript-eslint/consistent-type-assertions': [
        'error',
        { assertionStyle: 'never' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^[A-Z_]' },
      ],
      complexity: ['error', 20],
      'no-restricted-syntax': [
        'error',
        {
          selector: IMPERATIVE_DOM_SELECTOR,
          message:
            'Imperative DOM selector queries (querySelector*, getElementBy*, closest, matches) are forbidden in React code. Use React refs, declarative state, or UiShellContext instead.',
        },
      ],
    },
  },

  // 2b. Non-src TypeScript files (e2e/, playwright.config.ts, vite.config.ts)
  {
    files: ['e2e/**/*.{ts,tsx}', '*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': 'error',
      '@typescript-eslint/consistent-type-assertions': [
        'error',
        { assertionStyle: 'never' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^[A-Z_]' },
      ],
      complexity: ['error', 20],
    },
  },

  // 3. Enforce max 1 runtime value export per file in src/pages/ and src/components/ (types/interfaces & index.ts barrels allowed)
  {
    files: [
      'src/pages/**/*.{ts,tsx}',
      'src/components/**/*.{ts,tsx}',
      '**/src/pages/**/*.{ts,tsx}',
      '**/src/components/**/*.{ts,tsx}',
    ],
    ignores: ['**/index.ts'],
    plugins: {
      'polosanca-tsx': localTsxRulesPlugin,
    },
    rules: {
      'polosanca-tsx/single-value-export': 'error',
    },
  },

  // 4. Narrow exception ONLY for mounting React's root container in src/main.tsx
  {
    files: ['src/main.tsx', '**/src/main.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: IMPERATIVE_DOM_SELECTOR_EXCEPT_ROOT_ID,
          message:
            'Imperative DOM selector queries are forbidden. Only document.getElementById("root") is permitted in src/main.tsx.',
        },
      ],
    },
  },
]);
