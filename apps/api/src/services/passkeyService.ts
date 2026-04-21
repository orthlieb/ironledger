/**
 * Passkey (WebAuthn) service.
 *
 * Four flows:
 *
 *   startRegistration(userId)  → returns creation options + puts the expected
 *                                challenge in Redis (5-min TTL).
 *   finishRegistration(userId, response, label?)
 *                              → verifies the response against the stored
 *                                challenge, stores the new credential.
 *
 *   startAuthentication()      → returns request options + an opaque session
 *                                ID that binds the challenge to this flow.
 *   finishAuthentication(session, response)
 *                              → looks up the credential by its ID, verifies
 *                                the signature, bumps counter + last-used,
 *                                issues JWT + refresh-token just like a
 *                                password login.
 *
 * Usernameless discovery is used on the login side (allowCredentials is
 * empty) — the browser lets the user pick which passkey to present, the
 * server looks it up by credential ID. Works on all modern browsers.
 */

import {
	generateRegistrationOptions,
	verifyRegistrationResponse,
	generateAuthenticationOptions,
	verifyAuthenticationResponse,
	type PublicKeyCredentialCreationOptionsJSON,
	type PublicKeyCredentialRequestOptionsJSON,
	type RegistrationResponseJSON,
	type AuthenticationResponseJSON,
} from '@simplewebauthn/server';
import { randomBytes } from 'crypto';
import { eq } from 'drizzle-orm';
import { adminDb } from '../db/index.js';
import { users, webauthnCredentials, refreshTokens, type User } from '../db/schema.js';
import { redis } from '../server.js';
import { config } from '../config.js';
import { AuthError } from './authService.js';
import {
	signAccessToken,
	generateRefreshToken,
	generateFamilyId,
	refreshTokenExpiresAt,
} from '../lib/tokens.js';

// ---------------------------------------------------------------------------
// Relying-party config derived from APP_URL.
// ---------------------------------------------------------------------------

const APP_URL_OBJ = new URL(config.APP_URL);
/** WebAuthn requires the rpID to be a pure host, not a URL or origin. */
const RP_ID   = APP_URL_OBJ.hostname;
const RP_NAME = 'Iron Ledger';
const ORIGIN  = APP_URL_OBJ.origin;

const CHALLENGE_TTL_SEC = 5 * 60;

function regChallengeKey(userId: string): string {
	return `webauthn:challenge:reg:${userId}`;
}
function authChallengeKey(session: string): string {
	return `webauthn:challenge:auth:${session}`;
}

function requireAdminDb() {
	if (!adminDb) throw new AuthError('Admin DB not configured', 'CONFIG_ERROR', 500);
	return adminDb;
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export async function startRegistration(
	userId: string,
): Promise<PublicKeyCredentialCreationOptionsJSON> {
	const db = requireAdminDb();

	const [user] = await db
		.select({ id: users.id, email: users.email, displayName: users.displayName })
		.from(users)
		.where(eq(users.id, userId))
		.limit(1);
	if (!user) throw new AuthError('User not found', 'NOT_FOUND', 404);

	// Don't let the authenticator re-enrol an already-registered credential.
	const existing = await db
		.select({ credentialId: webauthnCredentials.credentialId, transports: webauthnCredentials.transports })
		.from(webauthnCredentials)
		.where(eq(webauthnCredentials.userId, userId));

	const options = await generateRegistrationOptions({
		rpName:           RP_NAME,
		rpID:             RP_ID,
		userID:           Buffer.from(user.id),
		userName:         user.email,
		userDisplayName:  user.displayName ?? user.email,
		attestationType:  'none',
		authenticatorSelection: {
			residentKey:      'preferred',   // "preferred" discoverable credential
			userVerification: 'preferred',
		},
		excludeCredentials: existing.map((c) => ({
			id:         c.credentialId.toString('base64url'),
			transports: (c.transports ?? []) as AuthenticatorTransportFuture[],
		})),
	});

	await redis.setex(regChallengeKey(userId), CHALLENGE_TTL_SEC, options.challenge);
	return options;
}

export async function finishRegistration(
	userId:   string,
	response: RegistrationResponseJSON,
	label?:   string,
): Promise<{ id: string; label: string | null }> {
	const db = requireAdminDb();

	const expectedChallenge = await redis.get(regChallengeKey(userId));
	if (!expectedChallenge) {
		throw new AuthError('Registration challenge expired — please try again', 'CHALLENGE_EXPIRED', 400);
	}

	const verification = await verifyRegistrationResponse({
		response,
		expectedChallenge,
		expectedOrigin:          ORIGIN,
		expectedRPID:            RP_ID,
		requireUserVerification: false,
	});

	if (!verification.verified || !verification.registrationInfo) {
		throw new AuthError('Passkey registration failed', 'VERIFY_FAILED', 400);
	}

	const { credential } = verification.registrationInfo;
	const trimmedLabel   = label?.trim() || null;

	const [row] = await db
		.insert(webauthnCredentials)
		.values({
			userId,
			credentialId: Buffer.from(credential.id, 'base64url'),
			publicKey:    Buffer.from(credential.publicKey),
			counter:      credential.counter,
			transports:   (credential.transports ?? []) as string[],
			label:        trimmedLabel,
		})
		.returning({ id: webauthnCredentials.id });

	await redis.del(regChallengeKey(userId));
	return { id: row!.id, label: trimmedLabel };
}

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

export async function startAuthentication(): Promise<{
	session: string;
	options: PublicKeyCredentialRequestOptionsJSON;
}> {
	// Empty allowCredentials = "discoverable" flow: the browser decides which
	// credential to present, based on whatever's enrolled on the device.
	const options = await generateAuthenticationOptions({
		rpID:             RP_ID,
		userVerification: 'preferred',
		allowCredentials: [],
	});

	// Bind this specific login attempt to a random session id so concurrent
	// passkey attempts from the same machine don't step on each other.
	const session = randomBytes(16).toString('hex');
	await redis.setex(authChallengeKey(session), CHALLENGE_TTL_SEC, options.challenge);
	return { session, options };
}

export interface PasskeyAuthResult {
	user:         Pick<User, 'id' | 'email' | 'role' | 'displayName'>;
	accessToken:  string;
	refreshToken: string;
	familyId:     string;
}

export async function finishAuthentication(
	session:  string,
	response: AuthenticationResponseJSON,
): Promise<PasskeyAuthResult> {
	const db = requireAdminDb();

	const expectedChallenge = await redis.get(authChallengeKey(session));
	if (!expectedChallenge) {
		throw new AuthError('Authentication challenge expired — please try again', 'CHALLENGE_EXPIRED', 400);
	}

	// The browser returns the credential ID (base64url) — look up the row.
	const credentialId = Buffer.from(response.id, 'base64url');
	const [cred] = await db
		.select()
		.from(webauthnCredentials)
		.where(eq(webauthnCredentials.credentialId, credentialId))
		.limit(1);
	if (!cred) throw new AuthError('Passkey not recognised', 'CREDENTIAL_NOT_FOUND', 401);

	const verification = await verifyAuthenticationResponse({
		response,
		expectedChallenge,
		expectedOrigin:          ORIGIN,
		expectedRPID:            RP_ID,
		credential: {
			id:         cred.credentialId.toString('base64url'),
			publicKey:  new Uint8Array(cred.publicKey),
			counter:    cred.counter,
			transports: (cred.transports ?? []) as AuthenticatorTransportFuture[],
		},
		requireUserVerification: false,
	});

	if (!verification.verified) {
		throw new AuthError('Passkey verification failed', 'VERIFY_FAILED', 401);
	}

	// Bump the clone-detection counter and last-used timestamp.
	await db
		.update(webauthnCredentials)
		.set({
			counter:    verification.authenticationInfo.newCounter,
			lastUsedAt: new Date(),
		})
		.where(eq(webauthnCredentials.id, cred.id));

	const [user] = await db
		.select({
			id:          users.id,
			email:       users.email,
			role:        users.role,
			displayName: users.displayName,
			isActive:    users.isActive,
		})
		.from(users)
		.where(eq(users.id, cred.userId))
		.limit(1);
	if (!user)             throw new AuthError('User not found', 'NOT_FOUND', 401);
	if (!user.isActive)    throw new AuthError('Account is disabled', 'ACCOUNT_DISABLED', 403);

	// Issue a fresh token family — same shape as password login.
	const familyId  = generateFamilyId();
	const refresh   = generateRefreshToken();
	const rtExpires = refreshTokenExpiresAt();

	await db.insert(refreshTokens).values({
		userId:    user.id,
		tokenHash: refresh.hash,
		familyId,
		expiresAt: rtExpires,
	});

	await redis.del(authChallengeKey(session));

	const accessToken = await signAccessToken(user.id, user.email, user.role);
	return {
		user:         { id: user.id, email: user.email, role: user.role, displayName: user.displayName },
		accessToken,
		refreshToken: refresh.raw,
		familyId,
	};
}

// ---------------------------------------------------------------------------
// List / revoke
// ---------------------------------------------------------------------------

export interface PasskeySummary {
	id:         string;
	label:      string | null;
	createdAt:  string;
	lastUsedAt: string | null;
}

export async function listForUser(userId: string): Promise<PasskeySummary[]> {
	const db = requireAdminDb();
	const rows = await db
		.select({
			id:         webauthnCredentials.id,
			label:      webauthnCredentials.label,
			createdAt:  webauthnCredentials.createdAt,
			lastUsedAt: webauthnCredentials.lastUsedAt,
		})
		.from(webauthnCredentials)
		.where(eq(webauthnCredentials.userId, userId))
		.orderBy(webauthnCredentials.createdAt);

	return rows.map((r) => ({
		id:         r.id,
		label:      r.label,
		createdAt:  r.createdAt.toISOString(),
		lastUsedAt: r.lastUsedAt?.toISOString() ?? null,
	}));
}

export async function removeCredential(userId: string, credentialId: string): Promise<void> {
	const db = requireAdminDb();
	// Enforce ownership — avoid IDOR where a valid user deletes somebody
	// else's passkey by id.
	const [cred] = await db
		.select({ userId: webauthnCredentials.userId })
		.from(webauthnCredentials)
		.where(eq(webauthnCredentials.id, credentialId))
		.limit(1);
	if (!cred) throw new AuthError('Passkey not found', 'NOT_FOUND', 404);
	if (cred.userId !== userId) throw new AuthError('Forbidden', 'FORBIDDEN', 403);

	await db.delete(webauthnCredentials).where(eq(webauthnCredentials.id, credentialId));
}

// Re-export for client use — avoids a second dep in the web package.
export type AuthenticatorTransportFuture =
	| 'ble' | 'hybrid' | 'internal' | 'nfc' | 'usb' | 'cable' | 'smart-card';
