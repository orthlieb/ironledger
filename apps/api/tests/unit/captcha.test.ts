/**
 * Unit tests for lib/captcha.ts
 *
 * We mock the global fetch so no real HTTP calls are made.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { verifyCaptcha, CaptchaError }           from '../../src/lib/captcha.js';

// ---------------------------------------------------------------------------
// Minimal env so config.ts parses without errors
// ---------------------------------------------------------------------------
process.env['HCAPTCHA_SECRET']  = '0x0000000000000000000000000000000000000000';
process.env['NODE_ENV']         = 'test';
process.env['APP_URL']          = 'http://localhost:3000';
process.env['DATABASE_URL']     = 'postgres://test:test@localhost:5432/test';
process.env['REDIS_URL']        = 'redis://localhost:6379';
process.env['EMAIL_FROM']       = 'test@example.com';
process.env['JWT_PRIVATE_KEY']  = 'placeholder';
process.env['JWT_PUBLIC_KEY']   = 'placeholder';
process.env['EMAIL_PROVIDER']   = 'resend';
process.env['RESEND_API_KEY']   = 're_test';

describe('verifyCaptcha', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves when hCaptcha returns success: true', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: async () => ({ success: true }),
    }));

    await expect(verifyCaptcha('valid-token', '1.2.3.4')).resolves.toBeUndefined();
  });

  it('throws CaptchaError when hCaptcha returns success: false', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: async () => ({ success: false, 'error-codes': ['invalid-input-response'] }),
    }));

    await expect(verifyCaptcha('bad-token')).rejects.toThrow(CaptchaError);
  });

  it('throws CaptchaError when fetch fails (network error)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

    await expect(verifyCaptcha('token')).rejects.toThrow(CaptchaError);
  });

  it('includes error codes in the error message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: async () => ({
        success: false,
        'error-codes': ['timeout-or-duplicate'],
      }),
    }));

    await expect(verifyCaptcha('token'))
      .rejects
      .toThrow('timeout-or-duplicate');
  });
});
