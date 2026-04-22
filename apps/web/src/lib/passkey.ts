/**
 * Client-side passkey helpers.
 *
 * Wraps @simplewebauthn/browser for the four flows the UI needs:
 *   - enrolPasskey(label?) — from Settings, for the logged-in user
 *   - signInWithPasskey()   — from the login page
 *   - listPasskeys()        — Settings lists them
 *   - removePasskey(id)     — Settings revoke button
 *
 * All four hit the BFF routes under /api/auth/passkey/... . Returns
 * plain objects the UI can render. Throws on failure so the caller can
 * show the error.
 */

import { startRegistration, startAuthentication } from '@simplewebauthn/browser';

export interface PasskeySummary {
	id:         string;
	label:      string | null;
	createdAt:  string;
	lastUsedAt: string | null;
}

export interface PasskeyAuthOk {
	user:        { id: string; email: string; role: string; displayName: string };
	accessToken: string;
}

/** True iff the browser advertises WebAuthn + platform-authenticator support. */
export function isPasskeySupported(): boolean {
	return typeof window !== 'undefined'
		&& typeof window.PublicKeyCredential !== 'undefined';
}

// ---------------------------------------------------------------------------
// Enrolment
// ---------------------------------------------------------------------------

export async function enrolPasskey(label?: string): Promise<PasskeySummary> {
	// 1. Pull options + server-side challenge.
	const challengeRes = await fetch('/api/auth/passkey/register/challenge', { method: 'POST' });
	if (!challengeRes.ok) throw new Error(await errorMessage(challengeRes));
	const options = await challengeRes.json();

	// 2. Hand off to the browser (native prompt).
	const credential = await startRegistration({ optionsJSON: options });

	// 3. Send the attestation back for verification.
	const verifyRes = await fetch('/api/auth/passkey/register/verify', {
		method:  'POST',
		headers: { 'Content-Type': 'application/json' },
		body:    JSON.stringify({ response: credential, label }),
	});
	if (!verifyRes.ok) throw new Error(await errorMessage(verifyRes));

	const created = await verifyRes.json() as { id: string };

	// Re-fetch list for a fresh summary row; the server's verify response
	// only returns id + label, and the Settings UI shows timestamps.
	const list = await listPasskeys();
	return list.find((p) => p.id === created.id) ?? list[list.length - 1]!;
}

// ---------------------------------------------------------------------------
// Sign-in
// ---------------------------------------------------------------------------

export async function signInWithPasskey(): Promise<PasskeyAuthOk> {
	const challengeRes = await fetch('/api/auth/passkey/login/challenge', { method: 'POST' });
	if (!challengeRes.ok) throw new Error(await errorMessage(challengeRes));
	const { session, options } = await challengeRes.json();

	const assertion = await startAuthentication({ optionsJSON: options });

	const verifyRes = await fetch('/api/auth/passkey/login/verify', {
		method:  'POST',
		headers: { 'Content-Type': 'application/json' },
		body:    JSON.stringify({ session, response: assertion }),
	});
	if (!verifyRes.ok) throw new Error(await errorMessage(verifyRes));
	return verifyRes.json();
}

// ---------------------------------------------------------------------------
// Management
// ---------------------------------------------------------------------------

export async function listPasskeys(): Promise<PasskeySummary[]> {
	const res = await fetch('/api/auth/passkey/credentials');
	if (!res.ok) throw new Error(await errorMessage(res));
	return res.json();
}

export async function removePasskey(id: string): Promise<void> {
	const res = await fetch(`/api/auth/passkey/credentials/${id}`, { method: 'DELETE' });
	if (!res.ok && res.status !== 204) throw new Error(await errorMessage(res));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function errorMessage(res: Response): Promise<string> {
	try {
		const body = await res.json() as { message?: string };
		return body.message ?? `HTTP ${res.status}`;
	} catch {
		return `HTTP ${res.status}`;
	}
}
