import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name:        'unit',
    include:     ['tests/unit/**/*.test.ts'],
    // happy-dom gives us a real DOM so isomorphic-dompurify runs in browser mode
    // (the same code path as the actual app) rather than falling back to a
    // server-side stub that skips most sanitisation.
    environment: 'happy-dom',
    coverage: {
      provider: 'v8',
      include:  ['src/lib/**/*.ts'],
      exclude:  [],
    },
  },
});
