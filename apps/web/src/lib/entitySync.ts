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
// =============================================================================

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
	let syncing = false;
	let again = false;

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
				const res =
					prev === undefined
						? await fetch(base, {
								method: 'POST',
								credentials: 'include',
								headers: { 'Content-Type': 'application/json' },
								body: json,
							})
						: await fetch(`${base}/${encodeURIComponent(it.id)}`, {
								method: 'PATCH',
								credentials: 'include',
								headers: { 'Content-Type': 'application/json' },
								body: json,
							});
				if (res.ok) synced.set(it.id, json);
				else console.error(`[${tag}] Persist failed:`, res.status);
			} catch (err) {
				console.error(`[${tag}] Persist error:`, err);
			}
		}

		for (const id of [...synced.keys()]) {
			if (present.has(id)) continue;
			try {
				const res = await fetch(`${base}/${encodeURIComponent(id)}`, {
					method: 'DELETE',
					credentials: 'include',
				});
				if (res.ok || res.status === 404) synced.delete(id);
				else console.error(`[${tag}] Delete failed:`, res.status);
			} catch (err) {
				console.error(`[${tag}] Delete error:`, err);
			}
		}
	}

	async function persist(): Promise<void> {
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
