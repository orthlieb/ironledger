/**
 * Passkey (WebAuthn) routes.
 *
 * Authenticated (the user is enrolling / managing their own passkeys):
 *   POST   /api/v1/auth/passkey/register/challenge
 *   POST   /api/v1/auth/passkey/register/verify
 *   GET    /api/v1/auth/passkey/credentials
 *   DELETE /api/v1/auth/passkey/credentials/:id
 *
 * Public (anyone can attempt to sign in):
 *   POST   /api/v1/auth/passkey/login/challenge
 *   POST   /api/v1/auth/passkey/login/verify
 *
 * The register endpoints are mounted behind `authenticate`; login endpoints
 * are explicitly public. Rate-limit the login-verify path with the
 * RATE_LIMIT_LOGIN bucket so passkey attempts count against the same
 * anti-brute-forcing budget as password attempts.
 */

import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { FastifyReply } from 'fastify';
import { authenticate } from '../middleware/authenticate.js';
import * as passkey from '../services/passkeyService.js';
import { AuthError } from '../services/authService.js';
import { PwnedPasswordError } from '../lib/hibp.js';
import { logSecurityEvent } from '../middleware/securityLogger.js';
import { config } from '../config.js';

const REFRESH_COOKIE = 'rt';

function cookieOptions() {
	return {
		httpOnly: true,
		secure:   config.NODE_ENV === 'production',
		sameSite: 'strict' as const,
		path:     '/api/v1/auth',
		maxAge:   config.REFRESH_TOKEN_TTL_DAYS * 86400,
	};
}

function handlePasskeyError(reply: FastifyReply) {
	return (err: unknown) => {
		if (err instanceof AuthError) {
			reply.status(err.statusCode).send({
				statusCode: err.statusCode,
				error:      err.name,
				message:    err.message,
			});
		} else if (err instanceof PwnedPasswordError) {
			reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: err.message });
		} else {
			reply.log.error({ err }, 'passkey error');
			reply.status(500).send({
				statusCode: 500,
				error:      'Internal Server Error',
				message:    'An unexpected error occurred',
			});
		}
	};
}

// Both the registration response and the authentication response are
// browser-built JSON structures. We don't want to re-describe every sub-
// field here — let @simplewebauthn/server do the strict validation and
// accept them as passthrough objects at the Fastify layer.
const passthroughResponse = z.record(z.string(), z.unknown());

const registerVerifyBody = z.object({
	response: passthroughResponse,
	label:    z.string().trim().max(80).optional(),
});

const loginVerifyBody = z.object({
	session:  z.string().min(16).max(64),
	response: passthroughResponse,
});

const credentialIdParam = z.object({
	id: z.string().uuid(),
});

// ---------------------------------------------------------------------------
// Route plugin
// ---------------------------------------------------------------------------

export const passkeyRoutes: FastifyPluginAsyncZod = async (server) => {

	// ── Authenticated enrolment / management ────────────────────────────────
	server.post('/register/challenge', {
		preHandler: authenticate,
		schema: {
			tags:     ['Auth — Passkeys'],
			summary:  'Begin passkey enrolment — returns WebAuthn creation options',
			security: [{ bearerAuth: [] }],
		},
	}, async (req, reply) => {
		const options = await passkey.startRegistration(req.user!.id).catch(handlePasskeyError(reply));
		if (!options || reply.sent) return;
		return reply.status(200).send(options);
	});

	server.post('/register/verify', {
		preHandler: authenticate,
		schema: {
			tags:     ['Auth — Passkeys'],
			summary:  'Finish passkey enrolment',
			body:     registerVerifyBody,
			security: [{ bearerAuth: [] }],
		},
	}, async (req, reply) => {
		const result = await passkey.finishRegistration(
			req.user!.id,
			req.body.response as Parameters<typeof passkey.finishRegistration>[1],
			req.body.label,
		).catch(handlePasskeyError(reply));
		if (!result || reply.sent) return;

		logSecurityEvent({
			eventType: 'passkey_registered',
			req,
			userId:    req.user!.id,
			metadata:  { credentialId: result.id, label: result.label },
		});
		return reply.status(201).send(result);
	});

	server.get('/credentials', {
		preHandler: authenticate,
		schema: {
			tags:     ['Auth — Passkeys'],
			summary:  'List the current user\'s enrolled passkeys',
			security: [{ bearerAuth: [] }],
		},
	}, async (req, reply) => {
		const creds = await passkey.listForUser(req.user!.id).catch(handlePasskeyError(reply));
		if (!creds || reply.sent) return;
		return reply.status(200).send(creds);
	});

	server.delete('/credentials/:id', {
		preHandler: authenticate,
		schema: {
			tags:     ['Auth — Passkeys'],
			summary:  'Revoke a passkey by credential row id',
			params:   credentialIdParam,
			security: [{ bearerAuth: [] }],
		},
	}, async (req, reply) => {
		await passkey.removeCredential(req.user!.id, req.params.id).catch(handlePasskeyError(reply));
		if (reply.sent) return;

		logSecurityEvent({
			eventType: 'passkey_revoked',
			req,
			userId:    req.user!.id,
			metadata:  { credentialId: req.params.id },
		});
		return reply.status(204).send();
	});

	// ── Public login ─────────────────────────────────────────────────────────
	server.post('/login/challenge', {
		schema: {
			tags:    ['Auth — Passkeys'],
			summary: 'Begin passkey sign-in — returns WebAuthn request options + session id',
		},
	}, async (_req, reply) => {
		const result = await passkey.startAuthentication().catch(handlePasskeyError(reply));
		if (!result || reply.sent) return;
		return reply.status(200).send(result);
	});

	server.post('/login/verify', {
		schema: {
			tags:    ['Auth — Passkeys'],
			summary: 'Finish passkey sign-in — issues access token + refresh cookie',
			body:    loginVerifyBody,
		},
		// Share the login rate-limit bucket so passkey attempts count against
		// the same anti-brute-forcing budget as password attempts.
		config: {
			rateLimit: {
				max:        config.RATE_LIMIT_LOGIN,
				timeWindow: '1 minute',
			},
		},
	}, async (req, reply) => {
		const result = await passkey.finishAuthentication(
			req.body.session,
			req.body.response as Parameters<typeof passkey.finishAuthentication>[1],
		).catch(handlePasskeyError(reply));
		if (!result || reply.sent) return;

		logSecurityEvent({
			eventType: 'passkey_login',
			req,
			userId:    result.user.id,
			metadata:  { email: result.user.email },
		});

		reply.setCookie(REFRESH_COOKIE, result.refreshToken, cookieOptions());
		return reply.status(200).send({
			user:        result.user,
			accessToken: result.accessToken,
		});
	});
};
