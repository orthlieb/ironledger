// Flat ESLint config (ESLint 9) for the Iron Ledger monorepo.
//
//   apps/api      — Node / TypeScript (Fastify)
//   apps/web      — SvelteKit 5 (TypeScript + .svelte)
//   packages/shared — TypeScript
//
// Prettier owns all formatting; eslint-config-prettier (applied last)
// disables every stylistic rule that would fight it. ESLint here is for
// correctness/lint concerns only.

import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default ts.config(
  // Paths ESLint must never touch.
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/node_modules/**',
      '.claude/**',
      '**/.claude/**',
      'apps/web/.svelte-kit/**',
      'apps/web/playwright-report/**',
      'apps/web/test-results/**',
      'apps/api/src/db/migrations/**',
      '**/*.d.ts',
    ],
  },

  // Base JS + TypeScript recommended rules.
  js.configs.recommended,
  ...ts.configs.recommended,

  // Svelte component rules.
  ...svelte.configs['flat/recommended'],

  // Language environment.
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },

  // .svelte files: use the TS parser for <script lang="ts"> blocks.
  {
    files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
    languageOptions: {
      parserOptions: {
        parser: ts.parser,
      },
    },
  },

  // Project-wide rule tuning. Kept pragmatic so the previously-unlinted
  // codebase passes as a clean baseline; tighten over time.
  {
    rules: {
      // TS already enforces no-undef via the type checker; the ESLint
      // core rule produces false positives on TS/Svelte globals.
      'no-undef': 'off',

      // `any` and unused vars surface as warnings (don't block CI) so they
      // can be burned down incrementally without a flag-day cleanup.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],

      // Intentional unicode (braille drag grips ⠿, glyphs) lives in source.
      'no-irregular-whitespace': 'off',

      // --- Opinionated Svelte rules the app intentionally violates ---------
      // {@html} is a core feature here: the session log renders sanitized
      // HTML (see importSanitizer.sanitizeLogHtml). Flagging every use is noise.
      'svelte/no-at-html-tags': 'off',
      // Keyed {#each} is not required for this app's static/derived lists.
      'svelte/require-each-key': 'off',
      // SvelteKit resolve() for hrefs — not adopted; plain hrefs are fine here.
      'svelte/no-navigation-without-resolve': 'off',
      // Stylistic preference for Svelte reactive primitives over plain values.
      'svelte/prefer-svelte-reactivity': 'off',
      'svelte/prefer-writable-derived': 'off',
      // Stale `<!-- svelte-ignore -->` comments from Svelte-version drift.
      'svelte/no-unused-svelte-ignore': 'off',
    },
  },

  // Web server code calls the API with apiFetch, never bare fetch, so the
  // API sees the visitor's address rather than 127.0.0.1 for everyone (its
  // per-IP limits and security log depend on it). See lib/server/apiFetch.ts.
  {
    files: [
      'apps/web/src/hooks.server.ts',
      'apps/web/src/routes/**/+server.ts',
      'apps/web/src/routes/**/+page.server.ts',
      'apps/web/src/routes/**/+layout.server.ts',
    ],
    rules: {
      'no-restricted-globals': [
        'error',
        {
          name: 'fetch',
          message:
            "Call the API with apiFetch from '#lib/server/apiFetch.js', so it sees the visitor's address.",
        },
      ],
    },
  },

  // Test files: allow the looser patterns tests tend to use.
  {
    files: ['**/*.test.ts', '**/tests/**'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },

  // MUST be last: turn off rules that conflict with Prettier.
  prettier,
);
