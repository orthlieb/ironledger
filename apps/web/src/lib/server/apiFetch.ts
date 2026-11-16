/**
 * apiFetch — `fetch` for this server's calls to the Fastify API, carrying the
 * visitor's IP address.
 *
 * Every page action and BFF route reaches the API from this process, so
 * without this the API saw one address, 127.0.0.1, for every visitor: its
 * per-IP limits (sign-ups, log-ins, password resets, verification emails)
 * became one limit shared by the whole site, and the security log recorded
 * no real addresses.
 *
 * hooks.server.ts runs each request inside `withClientAddress`, and apiFetch
 * adds `X-Forwarded-For: <visitor>` to anything sent while it's handled. The
 * API trusts that header only from loopback (Fastify `trustProxy`), i.e.
 * from this server or Nginx on the same machine.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { isIP } from 'node:net';

const visitor = new AsyncLocalStorage<string>();

interface AddressSource {
	request: Request;
	getClientAddress(): string;
}

/**
 * The visitor's IP address. Behind Nginx, `X-Real-IP` is set from the
 * connection itself ($remote_addr), overwriting anything the visitor sent,
 * and this server can't be reached except through Nginx. Without Nginx (dev,
 * CI) the header is absent and the socket's address is used.
 */
export function clientAddress(event: AddressSource): string {
	const real = event.request.headers.get('x-real-ip')?.trim();
	if (real && isIP(real)) return real;
	try {
		return event.getClientAddress();
	} catch {
		return '127.0.0.1';
	}
}

/** Run `fn` with `ip` as the visitor for every apiFetch inside it. */
export function withClientAddress<T>(ip: string, fn: () => T): T {
	return visitor.run(ip, fn);
}

/** `fetch`, plus `X-Forwarded-For` naming the visitor whose request this is. */
export function apiFetch(input: string | URL, init: RequestInit = {}): Promise<Response> {
	const ip = visitor.getStore();
	if (!ip) return fetch(input, init);
	const headers = new Headers(init.headers);
	headers.set('X-Forwarded-For', ip);
	return fetch(input, { ...init, headers });
}
