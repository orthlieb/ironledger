import { z } from 'zod';

/**
 * A new password: registration, password reset and accepting an invite all
 * use this one rule.
 */
export const passwordSchema = z
  .string()
  .min(12, 'Password must be at least 12 characters')
  .max(1000, 'Password is too long')
  // HIBP catches known-breached passwords at the service layer. This gate
  // catches low-entropy passwords that haven't been breached yet —
  // "aaaaaaaaaaaa" is a valid 12-char string but trivially brute-forceable.
  // Minimum 5 distinct characters rejects the obvious degenerate cases
  // (single-char repeats, "ababababab", "1234512345") without nagging
  // realistic pass-phrases.
  .refine((pw) => new Set(pw).size >= 5, {
    message: 'Password is too repetitive — use at least 5 distinct characters',
  });
