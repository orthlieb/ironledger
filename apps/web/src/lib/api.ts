// =============================================================================
// Iron Ledger — Client-side API client
//
// All calls go to SvelteKit proxy routes (/api/*) which add the Bearer token
// server-side from the HttpOnly access_token cookie. The client never sees the
// token — clean BFF pattern.
// =============================================================================

export class ApiError extends Error {
	constructor(
		public readonly status: number,
		message: string,
	) {
		super(message);
		this.name = 'ApiError';
	}
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
	const res = await fetch(path, {
		...init,
		headers: {
			'Content-Type': 'application/json',
			...init.headers,
		},
		credentials: 'include', // send cookies (refresh token)
	});

	if (!res.ok) {
		let message = res.statusText;
		try {
			const body = (await res.json()) as { message?: string };
			message = body.message ?? message;
		} catch {
			// ignore parse failures
		}
		throw new ApiError(res.status, message);
	}

	if (res.status === 204) return undefined as T;
	return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Auth (calls to SvelteKit form actions, not direct API — auth uses progressive
// enhancement via HTML forms; these helpers are for programmatic use in JS)
// ---------------------------------------------------------------------------
export const auth = {
	logout: () =>
		request<void>('/api/auth/logout', { method: 'POST' }),
};

// ---------------------------------------------------------------------------
// Characters
// ---------------------------------------------------------------------------
export interface CharacterSummary {
	id: string;
	name: string;
	createdAt: string;
	updatedAt: string;
}

export interface CharacterFull extends CharacterSummary {
	data: Record<string, unknown>;
}

export const characters = {
	list: () =>
		request<CharacterSummary[]>('/api/characters'),

	get: (id: string) =>
		request<CharacterFull>(`/api/characters/${id}`),

	create: (name: string, data: Record<string, unknown> = {}) =>
		request<CharacterFull>('/api/characters', {
			method: 'POST',
			body: JSON.stringify({ name, data }),
		}),

	update: (
		id: string,
		patch: { name?: string; data?: Record<string, unknown> },
	) =>
		request<CharacterFull>(`/api/characters/${id}`, {
			method: 'PUT',
			body: JSON.stringify(patch),
		}),

	remove: (id: string) =>
		request<void>(`/api/characters/${id}`, { method: 'DELETE' }),
};
