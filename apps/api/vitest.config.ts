import { defineConfig } from 'vitest/config';
import { generateKeyPairSync } from 'crypto';

// Populate a minimal fake env for every tier BEFORE any test file's
// imports resolve. Otherwise `src/config.ts::parseConfig` runs against
// an empty env at module-load time and kills the worker with
// `process.exit(1)` before the test's own setup can run — this beats
// the ESM import hoist that would defeat any in-file top-level env
// assignment. `??=` semantics via the spread pattern below let a real
// CI-provided value (e.g. real DATABASE_URL / DATABASE_ADMIN_URL) win.
const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});
const TEST_ENV_DEFAULTS: Record<string, string> = {
  NODE_ENV: 'test',
  APP_URL: 'http://localhost:3000',
  DATABASE_URL: 'postgres://test:test@localhost:5432/ironledger_test',
  REDIS_URL: 'redis://localhost:6379',
  EMAIL_FROM: 'test@example.com',
  HCAPTCHA_SECRET: '0x0000000000000000000000000000000000000000',
  EMAIL_PROVIDER: 'resend',
  RESEND_API_KEY: 're_test',
  REFRESH_TOKEN_TTL_DAYS: '30',
  JWT_EXPIRES_IN: '900',
  JWT_PRIVATE_KEY: privateKey.replace(/\n/g, '\\n'),
  JWT_PUBLIC_KEY: publicKey.replace(/\n/g, '\\n'),
};
const testEnv = Object.fromEntries(
  Object.entries(TEST_ENV_DEFAULTS).filter(([k]) => process.env[k] == null),
);

export default defineConfig({
  test: {
    // Run test files in each subdirectory in order: unit → integration → e2e
    // Each tier may depend on the previous being green.
    projects: [
      {
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          environment: 'node',
          // Unit tests must never touch the network or file system.
          // If they do, it means they're not really unit tests.
          pool: 'forks', // isolate each file in a separate process
          env: testEnv,
        },
      },
      {
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          environment: 'node',
          env: testEnv,
          // Integration tests run sequentially — they share a real DB
          // and parallel execution causes constraint violations.
          pool: 'forks',
          fileParallelism: false,
          // Give DB operations time to complete
          testTimeout: 15000,
          hookTimeout: 30000,
          setupFiles: ['tests/integration/setup.ts'],
        },
      },
      {
        test: {
          name: 'e2e',
          include: ['tests/e2e/**/*.test.ts'],
          environment: 'node',
          env: testEnv,
          pool: 'forks',
          fileParallelism: false,
          testTimeout: 20000,
          hookTimeout: 30000,
          setupFiles: ['tests/e2e/setup.ts'],
        },
      },
    ],
    // Coverage across all tiers combined
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/db/migrations/**', 'src/main.ts'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 75,
        statements: 80,
      },
    },
  },
});
