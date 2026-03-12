/**
 * hCaptcha server-side verification.
 *
 * The client completes the CAPTCHA challenge and receives a one-time token.
 * That token is sent to our API along with the form data. We verify it here
 * by calling hCaptcha's siteverify endpoint — the client cannot fake this.
 *
 * Local dev: set HCAPTCHA_SECRET=0x0000000000000000000000000000000000000000
 * in your .env. This is hCaptcha's published test secret that always passes.
 */

import { config } from '../config.js';

const SITEVERIFY_URL = 'https://api.hcaptcha.com/siteverify';

interface HCaptchaResponse {
  success: boolean;
  'error-codes'?: string[];
  challenge_ts?: string;
  hostname?: string;
}

/**
 * Verifies a hCaptcha token submitted by the client.
 *
 * @param token  - The h-captcha-response value from the client form
 * @param remoteip - The client's IP address (optional but recommended)
 * @throws       If the token is invalid, expired, or already used
 */
export async function verifyCaptcha(
  token: string,
  remoteip?: string,
): Promise<void> {
  // Build the form body
  const body = new URLSearchParams({
    secret:   config.HCAPTCHA_SECRET,
    response: token,
    ...(remoteip ? { remoteip } : {}),
  });

  let data: HCaptchaResponse;

  try {
    const res = await fetch(SITEVERIFY_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    body.toString(),
      signal:  AbortSignal.timeout(5000),   // fail fast — don't block the request
    });
    data = await res.json() as HCaptchaResponse;
  } catch (err) {
    // Network error reaching hCaptcha — fail closed (deny the request)
    throw new CaptchaError('CAPTCHA verification service unreachable');
  }

  if (!data.success) {
    const codes = data['error-codes']?.join(', ') ?? 'unknown';
    throw new CaptchaError(`CAPTCHA verification failed: ${codes}`);
  }
}

export class CaptchaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CaptchaError';
  }
}
