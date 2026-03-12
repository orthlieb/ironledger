/**
 * Mailer — thin abstraction over two email providers.
 *
 * EMAIL_PROVIDER=resend  → uses Resend API (recommended)
 * EMAIL_PROVIDER=smtp    → uses Nodemailer over SMTP (IONOS fallback)
 *
 * Both providers are configured from config.ts. The rest of the app only
 * calls the exported send*() functions and never touches the provider directly.
 */

import { config } from '../config.js';

// ---------------------------------------------------------------------------
// Low-level send — routes to the correct provider
// ---------------------------------------------------------------------------

interface MailOptions {
  to:      string;
  subject: string;
  html:    string;
  text:    string;   // plain-text fallback (important for spam filters)
}

async function send(opts: MailOptions): Promise<void> {
  if (config.EMAIL_PROVIDER === 'resend') {
    await sendViaResend(opts);
  } else {
    await sendViaSmtp(opts);
  }
}

async function sendViaResend(opts: MailOptions): Promise<void> {
  const { Resend } = await import('resend');
  const resend = new Resend(config.RESEND_API_KEY);

  const { error } = await resend.emails.send({
    from:    config.EMAIL_FROM,
    to:      opts.to,
    subject: opts.subject,
    html:    opts.html,
    text:    opts.text,
  });

  if (error) {
    throw new MailError(`Resend error: ${error.message}`);
  }
}

async function sendViaSmtp(opts: MailOptions): Promise<void> {
  const nodemailer = await import('nodemailer');
  const transporter = nodemailer.createTransport({
    host:   config.SMTP_HOST,
    port:   config.SMTP_PORT,
    secure: config.SMTP_PORT === 465,   // true for port 465, STARTTLS for 587
    auth: {
      user: config.SMTP_USER,
      pass: config.SMTP_PASS,
    },
  });

  await transporter.sendMail({
    from:    config.EMAIL_FROM,
    to:      opts.to,
    subject: opts.subject,
    html:    opts.html,
    text:    opts.text,
  });
}

// ---------------------------------------------------------------------------
// Email templates
// ---------------------------------------------------------------------------

/**
 * Sends the email verification link after registration.
 * The token in the link is the raw (unhashed) value from generateAuthToken().
 */
export async function sendVerificationEmail(
  to: string,
  token: string,
): Promise<void> {
  const link = `${config.APP_URL}/verify-email?token=${token}`;

  await send({
    to,
    subject: 'Verify your Iron Ledger account',
    text: `Welcome to Iron Ledger!\n\nVerify your email address by visiting:\n${link}\n\nThis link expires in 1 hour.\n\nIf you didn't create an account, you can safely ignore this email.`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #1e293b;">Welcome to Iron Ledger</h2>
        <p>Verify your email address to activate your account.</p>
        <p style="margin: 2rem 0;">
          <a href="${link}"
             style="background: #6366f1; color: white; padding: 12px 24px;
                    border-radius: 6px; text-decoration: none; font-weight: bold;">
            Verify Email Address
          </a>
        </p>
        <p style="color: #64748b; font-size: 0.875rem;">
          This link expires in 1 hour. If you didn't create an account,
          you can safely ignore this email.
        </p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 2rem 0;">
        <p style="color: #94a3b8; font-size: 0.75rem;">
          Or copy this link: <code>${link}</code>
        </p>
      </div>
    `,
  });
}

/**
 * Sends the password reset link.
 * The token is the raw (unhashed) value from generateAuthToken().
 */
export async function sendPasswordResetEmail(
  to: string,
  token: string,
): Promise<void> {
  const link = `${config.APP_URL}/reset-password?token=${token}`;

  await send({
    to,
    subject: 'Reset your Iron Ledger password',
    text: `You requested a password reset.\n\nReset your password:\n${link}\n\nThis link expires in 1 hour.\n\nIf you didn't request a reset, you can safely ignore this email. Your password has not changed.`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #1e293b;">Reset your password</h2>
        <p>We received a request to reset the password for your Iron Ledger account.</p>
        <p style="margin: 2rem 0;">
          <a href="${link}"
             style="background: #6366f1; color: white; padding: 12px 24px;
                    border-radius: 6px; text-decoration: none; font-weight: bold;">
            Reset Password
          </a>
        </p>
        <p style="color: #64748b; font-size: 0.875rem;">
          This link expires in 1 hour. If you didn't request a password reset,
          you can safely ignore this email — your password has not changed.
        </p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 2rem 0;">
        <p style="color: #94a3b8; font-size: 0.75rem;">
          Or copy this link: <code>${link}</code>
        </p>
      </div>
    `,
  });
}

export class MailError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MailError';
  }
}
