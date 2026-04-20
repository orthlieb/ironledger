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

// ---------------------------------------------------------------------------
// Shared email chrome — header + wrapper used by every outgoing email.
// Table-based layout for broad email client compatibility.
// Google Fonts @import works in Apple Mail / iOS Mail / Outlook Mac;
// degrades to Georgia / Arial on clients that strip <style> tags (Gmail web).
// ---------------------------------------------------------------------------

function emailWrap(bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@600&family=Roboto:wght@400;500&family=Roboto+Mono&display=swap');
  </style>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;">
    <tr>
      <td align="center" style="padding:32px 16px;">

        <table width="100%" cellpadding="0" cellspacing="0"
               style="max-width:520px;border-radius:8px;overflow:hidden;
                      box-shadow:0 4px 24px rgba(0,0,0,0.12);">

          <!-- Brand header -->
          <tr>
            <td style="background:#0f172a;padding:22px 32px;text-align:center;">
              <img src="${config.APP_URL}/axe-icon.svg"
                   width="22" height="22" alt=""
                   style="display:inline-block;vertical-align:middle;margin-right:8px;">
              <span style="font-family:'Cinzel',Georgia,'Times New Roman',serif;
                           font-size:1.2rem;font-weight:600;
                           color:#f59e0b;letter-spacing:0.1em;vertical-align:middle;">
                Iron Ledger
              </span>
            </td>
          </tr>

          <!-- Email body (injected per-email) -->
          ${bodyHtml}

          <!-- Footer -->
          <tr>
            <td style="background:#f8fafc;border-top:1px solid #e2e8f0;
                       padding:16px 32px;">
              <p style="margin:0;font-family:'Roboto',Arial,Helvetica,sans-serif;
                        font-size:0.72rem;color:#94a3b8;line-height:1.5;">
                Iron Ledger &mdash; sent to you because an account was requested with this address.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

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
    text: [
      'Welcome to Iron Ledger!',
      '',
      'Verify your email address by visiting:',
      link,
      '',
      'This link expires in 1 hour.',
      '',
      "If you didn't create an account, you can safely ignore this email.",
    ].join('\n'),
    html: emailWrap(`
          <tr>
            <td style="background:#ffffff;padding:0;line-height:0;">
              <img
                src="${config.APP_URL}/ironledger-email-hero.webp"
                alt="A Norse warrior points directly at you, demanding you claim your destiny"
                width="520"
                style="display:block;width:100%;height:auto;"
              >
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;padding:10px 32px 0;text-align:center;">
              <p style="margin:0;
                        font-family:'Cinzel',Georgia,'Times New Roman',serif;
                        font-size:0.78rem;color:#94a3b8;font-style:italic;">
                The Ironlands await. You specifically.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;padding:24px 32px 28px;">

              <h2 style="margin:0 0 14px;
                         font-family:'Cinzel',Georgia,'Times New Roman',serif;
                         font-size:1.05rem;font-weight:600;
                         color:#1e293b;letter-spacing:0.05em;">
                Your saga awaits.
              </h2>

              <p style="margin:0 0 24px;
                        font-family:'Roboto',Arial,Helvetica,sans-serif;
                        font-size:0.9rem;color:#334155;line-height:1.65;">
                The scribes are ready. One click stands between you and the Ironlands.
              </p>

              <p style="margin:0 0 24px;text-align:center;">
                <a href="${link}"
                   style="display:inline-block;background:#b45309;color:#ffffff;
                          padding:13px 28px;border-radius:5px;text-decoration:none;
                          font-family:'Roboto',Arial,Helvetica,sans-serif;
                          font-size:0.88rem;font-weight:500;letter-spacing:0.04em;">
                  Claim Your Destiny
                </a>
              </p>

              <p style="margin:0 0 20px;
                        font-family:'Roboto',Arial,Helvetica,sans-serif;
                        font-size:0.82rem;color:#64748b;line-height:1.6;">
                This link expires in&nbsp;1&nbsp;hour. If you didn&rsquo;t create an account,
                you can safely ignore this email.
              </p>

              <hr style="border:none;border-top:1px solid #e2e8f0;margin:0 0 16px;">

              <p style="margin:0;
                        font-family:'Roboto',Arial,Helvetica,sans-serif;
                        font-size:0.75rem;color:#94a3b8;line-height:1.5;">
                Or copy this link:<br>
                <span style="font-family:'Roboto Mono','Courier New',monospace;
                             word-break:break-all;color:#64748b;">${link}</span>
              </p>

            </td>
          </tr>`),
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
    text: [
      'You requested a password reset.',
      '',
      'Reset your password by visiting:',
      link,
      '',
      'This link expires in 1 hour.',
      '',
      "If you didn't request a reset, you can safely ignore this email. Your password has not changed.",
    ].join('\n'),
    html: emailWrap(`
          <tr>
            <td style="background:#ffffff;padding:0;line-height:0;">
              <img
                src="${config.APP_URL}/ironledger-reset-password.webp"
                alt="A Norse warrior kneels before an oracle, seeking wisdom he should already have"
                width="520"
                style="display:block;width:100%;height:auto;"
              >
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;padding:10px 32px 0;text-align:center;">
              <p style="margin:0;
                        font-family:'Cinzel',Georgia,'Times New Roman',serif;
                        font-size:0.78rem;color:#94a3b8;font-style:italic;">
                Even legends seek counsel.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;padding:24px 32px 28px;">

              <h2 style="margin:0 0 14px;
                         font-family:'Cinzel',Georgia,'Times New Roman',serif;
                         font-size:1.05rem;font-weight:600;
                         color:#1e293b;letter-spacing:0.05em;">
                Even legends forget.
              </h2>

              <p style="margin:0 0 24px;
                        font-family:'Roboto',Arial,Helvetica,sans-serif;
                        font-size:0.9rem;color:#334155;line-height:1.65;">
                The seer has been consulted. Click below to forge a new battle-word for your Iron&nbsp;Ledger account.
              </p>

              <p style="margin:0 0 24px;text-align:center;">
                <a href="${link}"
                   style="display:inline-block;background:#b45309;color:#ffffff;
                          padding:13px 28px;border-radius:5px;text-decoration:none;
                          font-family:'Roboto',Arial,Helvetica,sans-serif;
                          font-size:0.88rem;font-weight:500;letter-spacing:0.04em;">
                  Forge a New Oath
                </a>
              </p>

              <p style="margin:0 0 20px;
                        font-family:'Roboto',Arial,Helvetica,sans-serif;
                        font-size:0.82rem;color:#64748b;line-height:1.6;">
                This link expires in&nbsp;1&nbsp;hour. If you didn&rsquo;t request a password reset,
                you can safely ignore this email &mdash; your password has not changed.
              </p>

              <hr style="border:none;border-top:1px solid #e2e8f0;margin:0 0 16px;">

              <p style="margin:0;
                        font-family:'Roboto',Arial,Helvetica,sans-serif;
                        font-size:0.75rem;color:#94a3b8;line-height:1.5;">
                Or copy this link:<br>
                <span style="font-family:'Roboto Mono','Courier New',monospace;
                             word-break:break-all;color:#64748b;">${link}</span>
              </p>

            </td>
          </tr>`),
  });
}

/**
 * Sends an admin-issued invitation link.
 * The token is the raw (unhashed) value generated by inviteService.createInvite.
 * Link TTL matches the invite row's expires_at (72h).
 */
export async function sendInviteEmail(
  to: string,
  displayName: string | null,
  token: string,
): Promise<void> {
  const link  = `${config.APP_URL}/invite/${token}`;
  const hello = displayName ? `Hello ${displayName},` : 'Hello,';

  await send({
    to,
    subject: 'You have been invited to Iron Ledger',
    text: [
      hello,
      '',
      'An Iron Ledger admin has invited you to join. Accept the invitation and set your password by visiting:',
      link,
      '',
      'This link expires in 72 hours.',
      '',
      "If you weren't expecting this invitation, you can safely ignore this email.",
    ].join('\n'),
    html: emailWrap(`
          <tr>
            <td style="background:#ffffff;padding:0;line-height:0;">
              <img
                src="${config.APP_URL}/ironledger-email-hero.webp"
                alt="A Norse warrior points directly at you, demanding you claim your destiny"
                width="520"
                style="display:block;width:100%;height:auto;"
              >
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;padding:10px 32px 0;text-align:center;">
              <p style="margin:0;
                        font-family:'Cinzel',Georgia,'Times New Roman',serif;
                        font-size:0.78rem;color:#94a3b8;font-style:italic;">
                The Ironlands sends for you.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;padding:24px 32px 28px;">

              <h2 style="margin:0 0 14px;
                         font-family:'Cinzel',Georgia,'Times New Roman',serif;
                         font-size:1.05rem;font-weight:600;
                         color:#1e293b;letter-spacing:0.05em;">
                The Ironlands sends for you.
              </h2>

              <p style="margin:0 0 18px;
                        font-family:'Roboto',Arial,Helvetica,sans-serif;
                        font-size:0.9rem;color:#334155;line-height:1.65;">
                ${hello} An Iron Ledger admin has opened a seat at the fire for
                you. Click below to set your password and claim your account.
              </p>

              <p style="margin:0 0 24px;text-align:center;">
                <a href="${link}"
                   style="display:inline-block;background:#b45309;color:#ffffff;
                          padding:13px 28px;border-radius:5px;text-decoration:none;
                          font-family:'Roboto',Arial,Helvetica,sans-serif;
                          font-size:0.88rem;font-weight:500;letter-spacing:0.04em;">
                  Accept Your Invitation
                </a>
              </p>

              <p style="margin:0 0 20px;
                        font-family:'Roboto',Arial,Helvetica,sans-serif;
                        font-size:0.82rem;color:#64748b;line-height:1.6;">
                This link expires in&nbsp;72&nbsp;hours. If you weren&rsquo;t expecting
                this invitation, you can safely ignore this email.
              </p>

              <hr style="border:none;border-top:1px solid #e2e8f0;margin:0 0 16px;">

              <p style="margin:0;
                        font-family:'Roboto',Arial,Helvetica,sans-serif;
                        font-size:0.75rem;color:#94a3b8;line-height:1.5;">
                Or copy this link:<br>
                <span style="font-family:'Roboto Mono','Courier New',monospace;
                             word-break:break-all;color:#64748b;">${link}</span>
              </p>

            </td>
          </tr>`),
  });
}

export class MailError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MailError';
  }
}
