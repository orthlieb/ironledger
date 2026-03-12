import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Run test files in each subdirectory in order: unit → integration → e2e
    // Each tier may depend on the previous being green.
    projects: [
      {
        test: {
          name:        'unit',
          include:     ['tests/unit/**/*.test.ts'],
          environment: 'node',
          // Unit tests must never touch the network or file system.
          // If they do, it means they're not really unit tests.
          pool:        'forks',   // isolate each file in a separate process
          poolOptions: { forks: { singleFork: false } },
        },
      },
      {
        test: {
          name:        'integration',
          include:     ['tests/integration/**/*.test.ts'],
          environment: 'node',
          // Integration tests run sequentially — they share a real DB
          // and parallel execution causes constraint violations.
          pool:           'forks',
          poolOptions:    { forks: { singleFork: true } },
          // Give DB operations time to complete
          testTimeout:    15000,
          hookTimeout:    30000,
          setupFiles:     ['tests/integration/setup.ts'],
        },
      },
      {
        test: {
          name:        'e2e',
          include:     ['tests/e2e/**/*.test.ts'],
          environment: 'node',
          pool:           'forks',
          poolOptions:    { forks: { singleFork: true } },
          testTimeout:    20000,
          hookTimeout:    30000,
          setupFiles:     ['tests/e2e/setup.ts'],
        },
      },
    ],
    // Coverage across all tiers combined
    coverage: {
      provider: 'v8',
      include:  ['src/**/*.ts'],
      exclude:  ['src/db/migrations/**', 'src/main.ts'],
      thresholds: {
        lines:      80,
        functions:  80,
        branches:   75,
        statements: 80,
      },
    },
  },
});
