/**
 * helpers/reset.ts — API-based test data cleanup utilities.
 *
 * Call these from test.beforeAll hooks (or auth.setup) to ensure each test
 * suite starts from a blank slate, regardless of what previous runs left
 * behind.
 *
 * All functions obtain a fresh access token via the test-user credentials,
 * then make direct API calls to wipe the relevant data.  No browser required.
 *
 * Usage:
 *   import { resetCharacters, resetAll } from './helpers/reset';
 *
 *   test.describe('My suite', () => {
 *     test.beforeAll(async () => { await resetAll(); });
 *     // …tests…
 *   });
 */

const API = 'http://127.0.0.1:3000/api/v1';
const CREDS = {
	email: 'test@ironledger.local',
	password: 'IronLedgerTest2024!',
	captchaToken: 'dev-bypass',
};

// ── Auth ──────────────────────────────────────────────────────────────────────

/** Log in as the E2E test user and return a short-lived access token. */
export async function getTestToken(): Promise<string> {
	const res = await fetch(`${API}/auth/login`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(CREDS),
	});
	if (!res.ok) throw new Error(`E2E test login failed: ${res.status} ${await res.text()}`);
	return ((await res.json()) as { accessToken: string }).accessToken;
}

/** Auth-only header — for GET and DELETE requests (no body). */
function auth(tok: string): Record<string, string> {
	return { Authorization: `Bearer ${tok}` };
}

/** Auth + JSON content-type header — for PATCH and POST requests with a body. */
function json(tok: string): Record<string, string> {
	return { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' };
}

// ── Individual reset functions ────────────────────────────────────────────────

/**
 * Delete every character for the test user.
 * Deletes sequentially to respect SQLite's single-writer constraint.
 */
export async function resetCharacters(token?: string): Promise<void> {
	const tok = token ?? (await getTestToken());
	const res = await fetch(`${API}/characters`, { headers: auth(tok) });
	if (!res.ok) throw new Error(`GET /characters failed: ${res.status}`);
	const list = (await res.json()) as Array<{ id: string }>;
	for (const c of list) {
		const del = await fetch(`${API}/characters/${c.id}`, { method: 'DELETE', headers: auth(tok) });
		if (!del.ok && del.status !== 404) {
			throw new Error(`DELETE /characters/${c.id} failed: ${del.status}`);
		}
	}
}

/** Replace the foe-encounter list with an empty array. */
export async function resetFoes(token?: string): Promise<void> {
	const tok = token ?? (await getTestToken());
	await fetch(`${API}/session/encounters`, {
		method: 'PATCH',
		headers: json(tok),
		body: JSON.stringify({ encounters: [] }),
	});
}

/** Replace the expedition list with an empty array. */
export async function resetExpeditions(token?: string): Promise<void> {
	const tok = token ?? (await getTestToken());
	await fetch(`${API}/session/expeditions`, {
		method: 'PATCH',
		headers: json(tok),
		body: JSON.stringify({ expeditions: [] }),
	});
}

/** Replace both the communities list and the NPC list with empty arrays. */
export async function resetCommunities(token?: string): Promise<void> {
	const tok = token ?? (await getTestToken());
	await Promise.all([
		fetch(`${API}/session/communities`, {
			method: 'PATCH',
			headers: json(tok),
			body: JSON.stringify({ communities: [] }),
		}),
		fetch(`${API}/session/npcs`, {
			method: 'PATCH',
			headers: json(tok),
			body: JSON.stringify({ npcs: [] }),
		}),
	]);
}

/** Clear the entire session log. */
export async function resetLog(token?: string): Promise<void> {
	const tok = token ?? (await getTestToken());
	await fetch(`${API}/session/log`, { method: 'DELETE', headers: auth(tok) });
}

// ── Seeding ───────────────────────────────────────────────────────────────────

/**
 * Create one character for the test user.
 * Call after resetCharacters() so specs that need a character can skip the
 * slow UI-based creation path in beforeEach.
 */
export async function seedCharacter(name = 'Test Character', token?: string): Promise<void> {
	const tok = token ?? (await getTestToken());
	const res = await fetch(`${API}/characters`, {
		method: 'POST',
		headers: json(tok),
		body: JSON.stringify({ name }),
	});
	if (!res.ok) throw new Error(`POST /characters failed: ${res.status} ${await res.text()}`);
}

/**
 * Seed one community via the session-collections PATCH endpoint (passthrough
 * array). Returns the created id. Use after resetCommunities() so the
 * Connections rail has a community to filter on.
 */
export async function seedCommunity(name = 'Seed Community', token?: string): Promise<string> {
	const tok = token ?? (await getTestToken());
	const id = crypto.randomUUID();
	const community = {
		id,
		name,
		region: '',
		location: '',
		locationDescription: '',
		trouble: '',
		notes: '',
		createdAt: Date.now(),
	};
	const res = await fetch(`${API}/session/communities`, {
		method: 'PATCH',
		headers: json(tok),
		body: JSON.stringify({ communities: [community] }),
	});
	if (!res.ok) throw new Error(`seed community failed: ${res.status} ${await res.text()}`);
	return id;
}

/** Seed one NPC (see seedCommunity). Returns the created id. */
export async function seedNpc(name = 'Seed NPC', token?: string): Promise<string> {
	const tok = token ?? (await getTestToken());
	const id = crypto.randomUUID();
	const npc = {
		id,
		name,
		role: '',
		goal: '',
		descriptor: '',
		relationship: 'neutral',
		location: '',
		notes: '',
		createdAt: Date.now(),
	};
	const res = await fetch(`${API}/session/npcs`, {
		method: 'PATCH',
		headers: json(tok),
		body: JSON.stringify({ npcs: [npc] }),
	});
	if (!res.ok) throw new Error(`seed NPC failed: ${res.status} ${await res.text()}`);
	return id;
}

// ── Full reset ────────────────────────────────────────────────────────────────

/**
 * Wipe ALL persistent data for the test user in one shot:
 *   characters · foe encounters · expeditions · communities · NPCs · session log
 *
 * Pass a pre-fetched token to skip the redundant login round-trip when you
 * already have one (e.g. from auth.setup.ts).
 */
export async function resetAll(token?: string): Promise<void> {
	const tok = token ?? (await getTestToken());
	// Characters require sequential deletes (SQLite single-writer).
	await resetCharacters(tok);
	// Session collections and log are each a single atomic write — safe to parallelize.
	await Promise.all([resetFoes(tok), resetExpeditions(tok), resetCommunities(tok), resetLog(tok)]);
}
