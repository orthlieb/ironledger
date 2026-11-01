// =============================================================================
// Iron Ledger — per-entity sync helper
//
// Shared engine behind the session-collection stores (encounters, expeditions,
// communities, npcs). Each save used to PATCH the entire collection in one
// request body; with inline base64 portraits a collection could exceed the
// request body limit and become unsaveable. This diffs the live list against a
// snapshot of what the server holds and issues ONE request per changed entity:
//
//   • id not in snapshot   → POST   /api/session/<kind>
//   • body changed         → PATCH  /api/session/<kind>/<id>
//   • id vanished          → DELETE /api/session/<kind>/<id>
//
// The snapshot only advances on a successful response, so a failed write is
// naturally retried on the next pass. Overlapping persist() calls coalesce: a
// change made mid-flight flags a re-run rather than racing the in-flight loop.
//
// When the page is hidden or unloading (pageExit.ts) the loop is too slow:
// each request waits for the last, so the later ones would never start.
// Instead every unsynced row goes out at once, as keepalive requests the
// browser finishes after the page is gone (flushOnExit).
// =============================================================================

import { isPageExiting, keepaliveInit, onPageExit } from './pageExit.js';

/** inFlight marker for a DELETE (never valid entity JSON). */
const DELETING = '\u0000delete';

export interface EntitySync<T> {
	/** Rebuild the snapshot from a freshly-loaded list (call after load). */
	reset(items: T[]): void;
	/** Diff the live list and push per-entity writes to the server. */
	persist(): Promise<void>;
	/** Push every unsynced row in ONE `PUT /kind/batch` request. Upsert
	 *  only — won't send deletes. Used by the import pipeline so a bundle
	 *  with N entities lands in a single server round-trip per kind
	 *  instead of N serial POST/PATCH calls. Suppresses the TypeScript
	 *  unused-import warning on `T`. */
	persistBatch(): Promise<void>;
}

export function makeEntitySync<T extends { id?: string }>(
	kind: string,
	getItems: () => T[],
	tag: string,
): EntitySync<T> {
	let synced = new Map<string, string>();
	/** What's on the wire per id: the JSON being written, or DELETING. */
	const inFlight = new Map<string, string>();
	let syncing = false;
	let again = false;

	/** Mark `id` as being written with `body` until `req` settles. */
	async function track<R>(id: string, body: string, req: Promise<R>): Promise<R> {
		inFlight.set(id, body);
		try {
			return await req;
		} finally {
			if (inFlight.get(id) === body) inFlight.delete(id);
		}
	}

	function reset(items: T[]): void {
		synced = new Map();
		for (const it of items) {
			if (it && typeof it.id === 'string') synced.set(it.id, JSON.stringify(it));
		}
	}

	async function syncDiff(): Promise<void> {
		const base = `/api/session/${kind}`;
		const present = new Set<string>();

		for (const it of getItems()) {
			if (!it || typeof it.id !== 'string') continue;
			present.add(it.id);
			const json = JSON.stringify(it);
			const prev = synced.get(it.id);
			if (prev === json) continue; // unchanged
			try {
				const res = await track(
					it.id,
					json,
					prev === undefined
						? fetch(base, {
								method: 'POST',
								credentials: 'include',
								headers: { 'Content-Type': 'application/json' },
								body: json,
							})
						: fetch(`${base}/${encodeURIComponent(it.id)}`, {
								method: 'PATCH',
								credentials: 'include',
								headers: { 'Content-Type': 'application/json' },
								body: json,
							}),
				);
				if (res.ok) synced.set(it.id, json);
				else console.error(`[${tag}] Persist failed:`, res.status);
			} catch (err) {
				console.error(`[${tag}] Persist error:`, err);
			}
		}

		for (const id of [...synced.keys()]) {
			if (present.has(id)) continue;
			try {
				const res = await track(
					id,
					DELETING,
					fetch(`${base}/${encodeURIComponent(id)}`, {
						method: 'DELETE',
						credentials: 'include',
					}),
				);
				if (res.ok || res.status === 404) synced.delete(id);
				else console.error(`[${tag}] Delete failed:`, res.status);
			} catch (err) {
				console.error(`[${tag}] Delete error:`, err);
			}
		}
	}

	/**
	 * Page exit: send every unsynced row NOW, all at once and keepalive,
	 * instead of one at a time. Skips a row whose same content is already on
	 * the wire, and a row whose create (POST) is still in flight, since a
	 * PATCH could reach the server before the row exists.
	 */
	function flushOnExit(): void {
		const base = `/api/session/${kind}`;
		const present = new Set<string>();
		for (const it of getItems()) {
			if (!it || typeof it.id !== 'string') continue;
			present.add(it.id);
			const json = JSON.stringify(it);
			const prev = synced.get(it.id);
			const wire = inFlight.get(it.id);
			if (prev === json || wire === json) continue;
			if (prev === undefined && wire !== undefined) continue;
			const id = it.id;
			const create = prev === undefined;
			void track(
				id,
				json,
				fetch(create ? base : `${base}/${encodeURIComponent(id)}`, {
					method: create ? 'POST' : 'PATCH',
					credentials: 'include',
					headers: { 'Content-Type': 'application/json' },
					body: json,
					...keepaliveInit(json),
				}),
			)
				.then((res) => {
					if (res.ok) synced.set(id, json);
					else console.error(`[${tag}] Persist on exit failed:`, res.status);
				})
				.catch((err) => console.error(`[${tag}] Persist on exit error:`, err));
		}
		for (const id of [...synced.keys()]) {
			if (present.has(id) || inFlight.get(id) === DELETING) continue;
			void track(
				id,
				DELETING,
				fetch(`${base}/${encodeURIComponent(id)}`, {
					method: 'DELETE',
					credentials: 'include',
					...keepaliveInit(),
				}),
			)
				.then((res) => {
					if (res.ok || res.status === 404) synced.delete(id);
					else console.error(`[${tag}] Delete on exit failed:`, res.status);
				})
				.catch((err) => console.error(`[${tag}] Delete on exit error:`, err));
		}
	}
	if (typeof window !== 'undefined') onPageExit(flushOnExit);

	async function persist(): Promise<void> {
		if (isPageExiting()) {
			flushOnExit();
			return;
		}
		if (syncing) {
			again = true;
			return;
		}
		syncing = true;
		try {
			do {
				again = false;
				await syncDiff();
			} while (again);
		} finally {
			syncing = false;
		}
	}

	/**
	 * Push every unsynced row to the server in a single PUT /kind/batch
	 * request instead of one POST / PATCH per row. Entities with ids
	 * that already match the `synced` snapshot are skipped (nothing
	 * changed server-side). After a successful batch the `synced` map
	 * absorbs every id that was sent, so subsequent `persist()` calls
	 * see nothing to do.
	 *
	 * Deletes are NOT included — the batch endpoint is upsert-only.
	 * Callers that need to remove rows (unusual during import) should
	 * fall back to the single-item `persist()` after the batch lands.
	 */
	async function persistBatch(): Promise<void> {
		const base = `/api/session/${kind}`;
		const batch: T[] = [];
		for (const it of getItems()) {
			if (!it || typeof it.id !== 'string') continue;
			const json = JSON.stringify(it);
			if (synced.get(it.id) === json) continue;
			batch.push(it);
		}
		if (batch.length === 0) return;
		try {
			const res = await fetch(`${base}/batch`, {
				method: 'PUT',
				credentials: 'include',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ entities: batch }),
			});
			if (res.ok) {
				for (const it of batch) {
					if (typeof it.id === 'string') synced.set(it.id, JSON.stringify(it));
				}
			} else {
				console.error(`[${tag}] Batch persist failed:`, res.status);
			}
		} catch (err) {
			console.error(`[${tag}] Batch persist error:`, err);
		}
	}

	return { reset, persist, persistBatch };
}
