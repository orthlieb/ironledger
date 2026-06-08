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
	logout: () => request<void>('/api/auth/logout', { method: 'POST' }),
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
	list: () => request<CharacterFull[]>('/api/characters'),

	get: (id: string) => request<CharacterFull>(`/api/characters/${id}`),

	create: (name: string, data: Record<string, unknown> = {}) =>
		request<CharacterFull>('/api/characters', {
			method: 'POST',
			body: JSON.stringify({ name, data }),
		}),

	update: (id: string, patch: { name?: string; data?: Record<string, unknown> }) =>
		request<CharacterFull>(`/api/characters/${id}`, {
			method: 'PUT',
			body: JSON.stringify(patch),
		}),

	remove: (id: string) => request<void>(`/api/characters/${id}`, { method: 'DELETE' }),
};

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------
import type {
	AdminUser,
	AdminStats,
	AuditEvent,
	MaintenanceStatus,
	UserTimeseries,
	AdminInvite,
	CreateInviteResult,
} from '@ironledger/shared';

export const admin = {
	listUsers: () => request<AdminUser[]>('/api/admin'),

	getStats: () => request<AdminStats>('/api/admin/stats'),

	getTimeseries: (timeframe: '1hr' | '1day' | '7day' | '30day') =>
		request<UserTimeseries>(`/api/admin/stats/timeseries?timeframe=${timeframe}`),

	getAuditLog: (search?: string) => {
		const params = search ? `?search=${encodeURIComponent(search)}` : '';
		return request<AuditEvent[]>(`/api/admin/audit${params}`);
	},

	clearAuditLog: () => request<void>('/api/admin/audit', { method: 'DELETE' }),

	deleteUser: (id: string) => request<void>(`/api/admin/users/${id}`, { method: 'DELETE' }),

	setRole: (id: string, role: 'user' | 'admin') =>
		request<void>(`/api/admin/users/${id}`, {
			method: 'PATCH',
			body: JSON.stringify({ role }),
		}),

	suspendUser: (id: string, suspended: boolean) =>
		request<void>(`/api/admin/users/${id}/suspend`, {
			method: 'PATCH',
			body: JSON.stringify({ suspended }),
		}),

	getLogs: (file: 'api-out' | 'api-error' | 'web-out' | 'web-error', lines = 200) =>
		request<{ available: boolean; file: string; lines: string[] }>(
			`/api/admin/logs?file=${file}&lines=${lines}`,
		),

	enableMaintenance: (body: { message: string; minutesUntilShutdown: number }) =>
		request<MaintenanceStatus>('/api/admin/maintenance', {
			method: 'POST',
			body: JSON.stringify(body),
		}),

	disableMaintenance: () =>
		request<{ enabled: false }>('/api/admin/maintenance', { method: 'DELETE' }),

	// ── Invites ──────────────────────────────────────────────────────────
	listInvites: () => request<AdminInvite[]>('/api/admin/invites'),

	createInvite: (body: { email: string; displayName?: string }) =>
		request<CreateInviteResult>('/api/admin/invites', {
			method: 'POST',
			body: JSON.stringify(body),
		}),

	revokeInvite: (id: string) =>
		request<AdminInvite>(`/api/admin/invites/${id}`, { method: 'DELETE' }),
};

// ---------------------------------------------------------------------------
// Maintenance (public — deprecated, polls for maintenance only)
// Prefer `system.getStatus()` which returns maintenance + broadcast together.
// ---------------------------------------------------------------------------
export const maintenance = {
	getStatus: () => request<MaintenanceStatus>('/api/maintenance/status'),
};

// ---------------------------------------------------------------------------
// System status (public — combined maintenance + broadcast)
// ---------------------------------------------------------------------------
import type { SystemStatus, BroadcastStatus, BroadcastSeverity } from '@ironledger/shared';

export const system = {
	getStatus: () => request<SystemStatus>('/api/system/status'),
};

// ---------------------------------------------------------------------------
// Registration daily quota (admin)
// ---------------------------------------------------------------------------
export interface RegistrationQuotaStatus {
	daily: number | null;
	usedToday: number;
	remaining: number | null;
	resetsAt: string;
	exhausted: boolean;
}

export const registrationQuota = {
	getStatus: () => request<RegistrationQuotaStatus>('/api/admin/registration-quota'),

	setQuota: (daily: number | null) =>
		request<RegistrationQuotaStatus>('/api/admin/registration-quota', {
			method: 'PUT',
			body: JSON.stringify({ daily }),
		}),
};

// ---------------------------------------------------------------------------
// Broadcast (admin)
// ---------------------------------------------------------------------------
export const broadcast = {
	getStatus: () => request<BroadcastStatus>('/api/admin/broadcast'),

	post: (body: { message: string; severity: BroadcastSeverity }) =>
		request<BroadcastStatus>('/api/admin/broadcast', {
			method: 'POST',
			body: JSON.stringify(body),
		}),

	clear: () => request<void>('/api/admin/broadcast', { method: 'DELETE' }),
};
