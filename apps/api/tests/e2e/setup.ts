/**
 * E2E test setup.
 *
 * Builds the Fastify server once, starts it on a random port,
 * and tears it down after all tests complete.
 *
 * All external dependencies (email, captcha, HIBP) are mocked.
 * The database is real — same test DB used by integration tests.
 */

import { beforeAll, afterAll, vi } from 'vitest';
import { buildServer }             from '../../src/server.js';
import type { FastifyInstance }    from 'fastify';

// Mock external services before any import resolves
vi.mock('../../src/lib/mailer.js', () => ({
  sendVerificationEmail:  vi.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/lib/captcha.js', () => ({
  verifyCaptcha: vi.fn().mockResolvedValue(undefined),
  CaptchaError:  class CaptchaError extends Error {},
}));

vi.mock('../../src/lib/hibp.js', () => ({
  assertPasswordNotPwned: vi.fn().mockResolvedValue(undefined),
  getPwnedCount:          vi.fn().mockResolvedValue(0),
  PwnedPasswordError:     class PwnedPasswordError extends Error {},
}));

// Expose the server instance to tests
declare global {
  var testServer: FastifyInstance;
}

beforeAll(async () => {
  global.testServer = await buildServer();
  await global.testServer.ready();
  console.log('✔ E2E server ready');
}, 30000);

afterAll(async () => {
  await global.testServer?.close();
});
