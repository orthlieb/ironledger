import { describe, it, expect, vi, afterEach } from 'vitest';
import { apiFetch, clientAddress, withClientAddress } from '../../src/lib/server/apiFetch.js';

const sent = () => {
	const call = vi.mocked(fetch).mock.calls.at(-1);
	return new Headers((call?.[1] as RequestInit | undefined)?.headers);
};

describe('apiFetch', () => {
	afterEach(() => vi.unstubAllGlobals());

	it('names the visitor of the request it runs in, keeping the other headers', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}')));
		await withClientAddress('203.0.113.7', () =>
			apiFetch('http://api/x', { headers: { Authorization: 'Bearer t' } }),
		);
		expect(sent().get('x-forwarded-for')).toBe('203.0.113.7');
		expect(sent().get('authorization')).toBe('Bearer t');
	});

	it('still names the visitor after an await inside the request', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}')));
		await withClientAddress('198.51.100.4', async () => {
			await new Promise((r) => setTimeout(r, 5));
			await apiFetch('http://api/y');
		});
		expect(sent().get('x-forwarded-for')).toBe('198.51.100.4');
	});

	it('adds nothing outside a request', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}')));
		await apiFetch('http://api/z');
		expect(sent().has('x-forwarded-for')).toBe(false);
	});
});

describe('clientAddress', () => {
	const event = (realIp: string | null, socket: () => string) => ({
		request: new Request('http://web/', { headers: realIp ? { 'x-real-ip': realIp } : {} }),
		getClientAddress: socket,
	});

	it('takes X-Real-IP, which Nginx sets from the connection', () => {
		expect(clientAddress(event('203.0.113.7', () => '127.0.0.1'))).toBe('203.0.113.7');
	});

	it('falls back to the socket when the header is missing or not an address', () => {
		expect(clientAddress(event(null, () => '::1'))).toBe('::1');
		expect(clientAddress(event('not-an-ip', () => '::1'))).toBe('::1');
	});

	it('falls back to loopback when even the socket is unknown', () => {
		expect(
			clientAddress(
				event(null, () => {
					throw new Error('no address');
				}),
			),
		).toBe('127.0.0.1');
	});
});
