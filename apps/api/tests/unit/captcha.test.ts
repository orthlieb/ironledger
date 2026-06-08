/**
 * Unit tests for lib/captcha.ts
 *
 * We mock the global fetch so no real HTTP calls are made.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { verifyCaptcha, CaptchaError } from '../../src/lib/captcha.js';

// ---------------------------------------------------------------------------
// Mock the config module so captcha.ts sees NODE_ENV:'production' and always
// runs real verification — without triggering the config parser's process.exit.
// vi.mock is hoisted above imports by Vitest, so captcha.ts picks this up.
// ---------------------------------------------------------------------------
vi.mock('../../src/config.js', () => ({
  config: {
    NODE_ENV: 'production',
    HCAPTCHA_SECRET: '0x0000000000000000000000000000000000000000',
  },
}));

describe('verifyCaptcha', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves when hCaptcha returns success: true', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({ success: true }),
      }),
    );

    await expect(verifyCaptcha('valid-token', '1.2.3.4')).resolves.toBeUndefined();
  });

  it('throws CaptchaError when hCaptcha returns success: false', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({ success: false, 'error-codes': ['invalid-input-response'] }),
      }),
    );

    await expect(verifyCaptcha('bad-token')).rejects.toThrow(CaptchaError);
  });

  it('throws CaptchaError when fetch fails (network error)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

    await expect(verifyCaptcha('token')).rejects.toThrow(CaptchaError);
  });

  it('includes error codes in the error message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: async () => ({
          success: false,
          'error-codes': ['timeout-or-duplicate'],
        }),
      }),
    );

    await expect(verifyCaptcha('token')).rejects.toThrow('timeout-or-duplicate');
  });
});
