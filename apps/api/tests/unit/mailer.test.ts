/**
 * mailer.test.ts — unit tests for src/lib/mailer.ts.
 *
 * The mailer is a thin abstraction over two providers (Resend and SMTP via
 * nodemailer). These tests mock both at the module boundary so nothing
 * actually hits the network — we just verify the right provider is called
 * with the right payload, the link contains the token, and the MailError
 * path fires when Resend returns an error.
 *
 * Mocks are loaded with vi.mock(...) BEFORE the module under test is
 * dynamically imported in each test, so EMAIL_PROVIDER on the config mock
 * can be flipped per-suite.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Config mock — gets flipped between suites for the smtp vs resend cases
// ---------------------------------------------------------------------------

const configState = {
  EMAIL_PROVIDER: 'resend' as 'resend' | 'smtp',
  EMAIL_FROM: 'noreply@example.com',
  RESEND_API_KEY: 're_test_key',
  SMTP_HOST: 'smtp.example.com',
  SMTP_PORT: 587,
  SMTP_USER: 'noreply@example.com',
  SMTP_PASS: 'smtp-pass',
  APP_URL: 'https://iron-ledger.test',
};

vi.mock('../../src/config.js', () => ({
  get config() {
    return configState;
  },
}));

// ---------------------------------------------------------------------------
// Provider mocks — capture the payload Resend / nodemailer would receive
// ---------------------------------------------------------------------------

const resendSendMock = vi.fn();
// vitest 5 changed how a mock factory's exports are materialized: a
// `vi.fn().mockImplementation(() => ({...}))` binding no longer survives
// as a constructor at the `new Resend(...)` call site. A real class does.
vi.mock('resend', () => ({
  Resend: class MockResend {
    emails = { send: resendSendMock };
    constructor(_apiKey?: string) {}
  },
}));

const smtpSendMock = vi.fn();
const createTransportMock = vi.fn(() => ({ sendMail: smtpSendMock }));
vi.mock('nodemailer', () => ({
  default: { createTransport: createTransportMock },
  createTransport: createTransportMock,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function loadMailer() {
  // Re-import to pick up the current configState — vitest's vi.mock keeps
  // the same factory but the getter resolves the live state each call.
  vi.resetModules();
  return await import('../../src/lib/mailer.js');
}

beforeEach(() => {
  resendSendMock.mockReset();
  resendSendMock.mockResolvedValue({ data: { id: 'em_test_id' }, error: null });
  smtpSendMock.mockReset();
  smtpSendMock.mockResolvedValue({ messageId: 'msg_test_id' });
  createTransportMock.mockClear();
  configState.EMAIL_PROVIDER = 'resend';
});

// ---------------------------------------------------------------------------
// sendVerificationEmail
// ---------------------------------------------------------------------------

describe('sendVerificationEmail', () => {
  it('routes through Resend by default with correct payload', async () => {
    const { sendVerificationEmail } = await loadMailer();
    await sendVerificationEmail('user@example.com', 'tok-abc');

    expect(resendSendMock).toHaveBeenCalledTimes(1);
    const sent = resendSendMock.mock.calls[0][0];
    expect(sent.from).toBe('noreply@example.com');
    expect(sent.to).toBe('user@example.com');
    expect(sent.subject).toBe('Verify your Iron Ledger account');
    // Link must include the raw token and point at /verify-email.
    expect(sent.html).toContain('https://iron-ledger.test/verify-email?token=tok-abc');
    expect(sent.text).toContain('https://iron-ledger.test/verify-email?token=tok-abc');
    // Plain-text fallback is present (spam filters care).
    expect(sent.text.length).toBeGreaterThan(50);
  });

  it('throws MailError when Resend responds with an error', async () => {
    resendSendMock.mockResolvedValue({
      data: null,
      error: { message: 'rate limited' },
    });
    const { sendVerificationEmail, MailError } = await loadMailer();

    const err = await sendVerificationEmail('user@example.com', 'tok-x').catch((e) => e);
    expect(err).toBeInstanceOf(MailError);
    expect(err.message).toMatch(/rate limited/);
  });
});

// ---------------------------------------------------------------------------
// sendPasswordResetEmail
// ---------------------------------------------------------------------------

describe('sendPasswordResetEmail', () => {
  it('routes through Resend with /reset-password link', async () => {
    const { sendPasswordResetEmail } = await loadMailer();
    await sendPasswordResetEmail('user@example.com', 'reset-tok');

    expect(resendSendMock).toHaveBeenCalledTimes(1);
    const sent = resendSendMock.mock.calls[0][0];
    expect(sent.to).toBe('user@example.com');
    expect(sent.subject).toMatch(/reset/i);
    expect(sent.html).toContain('https://iron-ledger.test/reset-password?token=reset-tok');
    expect(sent.text).toContain('https://iron-ledger.test/reset-password?token=reset-tok');
  });
});

// ---------------------------------------------------------------------------
// sendInviteEmail
// ---------------------------------------------------------------------------

describe('sendInviteEmail', () => {
  it('greets the named recipient and includes the /invite/<token> link', async () => {
    const { sendInviteEmail } = await loadMailer();
    await sendInviteEmail('invited@example.com', 'Astrid', 'inv-tok-1');

    expect(resendSendMock).toHaveBeenCalledTimes(1);
    const sent = resendSendMock.mock.calls[0][0];
    expect(sent.to).toBe('invited@example.com');
    expect(sent.subject).toMatch(/invit/i);
    expect(sent.html).toContain('https://iron-ledger.test/invite/inv-tok-1');
    expect(sent.text).toContain('https://iron-ledger.test/invite/inv-tok-1');
    // Personalised greeting in the plain-text body.
    expect(sent.text).toContain('Hello Astrid');
  });

  it('falls back to a generic greeting when displayName is null', async () => {
    const { sendInviteEmail } = await loadMailer();
    await sendInviteEmail('invited@example.com', null, 'inv-tok-2');

    const sent = resendSendMock.mock.calls[0][0];
    expect(sent.text).toContain('Hello,');
    expect(sent.text).not.toContain('Hello null');
  });
});

// ---------------------------------------------------------------------------
// SMTP path
// ---------------------------------------------------------------------------

describe('SMTP provider', () => {
  it('routes through nodemailer when EMAIL_PROVIDER=smtp', async () => {
    configState.EMAIL_PROVIDER = 'smtp';
    const { sendVerificationEmail } = await loadMailer();

    await sendVerificationEmail('user@example.com', 'tok-smtp');

    expect(resendSendMock).not.toHaveBeenCalled();
    expect(createTransportMock).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'smtp.example.com',
        port: 587,
        secure: false, // 587 uses STARTTLS, not TLS-on-connect
        auth: { user: 'noreply@example.com', pass: 'smtp-pass' },
      }),
    );
    expect(smtpSendMock).toHaveBeenCalledTimes(1);
    const sent = smtpSendMock.mock.calls[0][0];
    expect(sent.to).toBe('user@example.com');
    expect(sent.from).toBe('noreply@example.com');
    expect(sent.html).toContain('verify-email?token=tok-smtp');
  });

  it('sets transporter.secure=true for port 465', async () => {
    configState.EMAIL_PROVIDER = 'smtp';
    configState.SMTP_PORT = 465;
    const { sendVerificationEmail } = await loadMailer();

    await sendVerificationEmail('user@example.com', 'tok-465');

    expect(createTransportMock).toHaveBeenCalledWith(
      expect.objectContaining({ port: 465, secure: true }),
    );

    // Restore for the next test in the file (beforeEach resets EMAIL_PROVIDER
    // but not the port — and other tests assume the default 587).
    configState.SMTP_PORT = 587;
  });
});

// ---------------------------------------------------------------------------
// MailError shape
// ---------------------------------------------------------------------------

describe('MailError', () => {
  it('is a real Error subclass with the right name', async () => {
    const { MailError } = await loadMailer();
    const e = new MailError('boom');
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('MailError');
    expect(e.message).toBe('boom');
  });
});
