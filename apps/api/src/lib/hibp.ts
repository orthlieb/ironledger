/**
 * HaveIBeenPwned — Pwned Passwords API (k-anonymity model)
 *
 * Checks whether a password has appeared in a known data breach.
 * We use the k-anonymity API: only the first 5 characters of the SHA-1
 * hash are sent to HIBP's servers. They return all hashes starting with
 * those 5 chars; we check locally whether the full hash is in the list.
 *
 * This means the actual password — or even its full hash — never leaves
 * the server. HIBP cannot know which password we are checking.
 *
 * See: https://haveibeenpwned.com/API/v3#PwnedPasswords
 */

import { createHash } from 'crypto';
import { config } from '../config.js';

/**
 * Returns the number of times a password has appeared in known breaches.
 * Returns 0 if it has never appeared (or if HIBP is unreachable).
 */
export async function getPwnedCount(password: string): Promise<number> {
  // SHA-1 hash of the password (HIBP uses SHA-1 for its Pwned Passwords API)
  const sha1 = createHash('sha1')
    .update(password)
    .digest('hex')
    .toUpperCase();

  const prefix = sha1.slice(0, 5);    // sent to HIBP
  const suffix = sha1.slice(5);       // checked locally — never sent

  const headers: Record<string, string> = {
    'Add-Padding': 'true',   // ask HIBP to pad response to fixed size (prevents traffic analysis)
  };
  if (config.HIBP_API_KEY) {
    headers['hibp-api-key'] = config.HIBP_API_KEY;
  }

  try {
    const res = await fetch(
      `https://api.pwnedpasswords.com/range/${prefix}`,
      {
        headers,
        signal: AbortSignal.timeout(4000),
      },
    );

    if (!res.ok) return 0;  // fail open for HIBP — don't block registration if it's down

    const text = await res.text();

    // Response format: "SUFFIX:COUNT\r\n" per line
    for (const line of text.split('\r\n')) {
      const [hashSuffix, countStr] = line.split(':');
      if (hashSuffix === suffix) {
        return parseInt(countStr ?? '0', 10);
      }
    }

    return 0;  // not found in breach list
  } catch {
    return 0;  // fail open — network error shouldn't block registration
  }
}

/**
 * Throws if the password has appeared in a known breach.
 * Call this during registration and password reset.
 */
export async function assertPasswordNotPwned(password: string): Promise<void> {
  const count = await getPwnedCount(password);
  if (count > 0) {
    throw new PwnedPasswordError(
      `This password has appeared in ${count.toLocaleString()} data breach${count === 1 ? '' : 'es'}. Please choose a different password.`,
    );
  }
}

export class PwnedPasswordError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PwnedPasswordError';
  }
}
