// =============================================================================
// Iron Ledger — import (Hamburger → Import…, a dropped file, the starter seed)
//
// Takes the `.zip` bundles the export writes: a single map (`importMapZip`),
// or a bundle of characters, connections, expeditions, foes, log entries and
// maps, which also switches on the content packs it had on.
// Every row is shape-checked first; a file with bad rows pauses on the review
// stage. Names that already exist get one strategy for the whole file (new,
// replace, skip or cancel). Portraits go to the blob store, connections and
// map markers re-link by name, and each row's failure is collected rather
// than aborting the rest. `CampaignImport` holds the ImportDialog's state;
// the page supplies what only it has (ImportHost). See docs/import-schema.md.
// =============================================================================

import { unzipSync, strFromU8 } from 'fflate';
import type { Community, Npc, Expedition, Place, FoeEncounter } from '#lib/types.js';
import { getCharacters, createCharacter, persistCharacterNow } from '#lib/characterStore.svelte.js';
import { getExpeditions, addManyExpeditions } from '#lib/expeditionStore.svelte.js';
import { getEncounters, addManyEncounters } from '#lib/encounterStore.svelte.js';
import { findFoe, loadFoes, resolveFoeName } from '#lib/foeStore.svelte.js';
import { getCommunities, addManyCommunities } from '#lib/communityStore.svelte.js';
import { getNpcs, addManyNpcs } from '#lib/npcStore.svelte.js';
import { getPlaces, addManyPlaces } from '#lib/placeStore.svelte.js';
import { loadAssets, getGlobalCounterDef, getGlobalCounterIds } from '#lib/assetStore.svelte.js';
import { reconcileImportedCharacter } from '#lib/character.js';
import { findCharacterField } from '#lib/characterFields.svelte.js';
import { loadOracles } from '#lib/oracleStore.svelte.js';
import {
	normaliseName,
	type CollisionItems,
	type CollisionStrategy,
} from '#lib/components/importCollision.js';
import { importLogEntries, type LogEntry } from '#lib/log.svelte.js';
import { enableExtensions, getExtensions, loadExtensions } from '#lib/expansionStore.svelte.js';
import { planPackRestore, readPackChoices } from '#lib/packChoices.js';
import { parseImportZip, sanitizeLogHtml, ImportError } from '#lib/importSanitizer.js';
import {
	importMapZip,
	parseBundledMaps,
	applyMapImport,
	populateMap,
	type MapZipBody,
} from '#lib/mapExport.js';
import type { MapOwnerKind, MapMarker } from '#lib/mapStore.svelte.js';
import { resolveEntity, parseEntityId, formatEntityId } from '#lib/mapEntityLinks.js';
import { sanitizeContainment, type ContainmentNode } from '#lib/entityContainment.js';
import { refOf, takeInlineDataUrl, uploadPortrait } from '#lib/campaignTransfer.js';

/** What only the page can do for an import. */
export interface ImportHost {
	/** Resolves once the page's first store loads finish. An import waits for
	 *  it: a load still in flight would reset its store and drop the rows the
	 *  import just added. */
	storesLoaded(): Promise<unknown>;
	/** Ask once how to treat incoming rows whose names already exist. */
	chooseCollisionStrategy(items: CollisionItems): Promise<CollisionStrategy>;
	/** Ask once whether bundled maps replace the maps their owners already have. */
	chooseMapConflict(names: string[]): Promise<'replace' | 'skip'>;
	/** Clear the file input, so picking the same file again fires. */
	resetInput(): void;
}

export type ImportStage = 'idle' | 'importing' | 'review' | 'done' | 'error';

/** The ImportDialog's state, and the import that drives it. */
export class CampaignImport {
	dialogOpen = $state(false);
	stage = $state<ImportStage>('idle');
	/** "Imported 3 characters · 12 connections." */
	summary = $state('');
	/** Live per-category tally ("2/15 settlements, …"). */
	liveSummary = $state('');
	/** Every problem found: rows that failed the shape check or to apply. */
	errors = $state<string[]>([]);
	/** Worth knowing once it's in, though nothing failed: a content pack the
	 *  backup had on that this app doesn't have. */
	warnings = $state<string[]>([]);
	/** Rows left to import once the review stage drops the bad ones. */
	validCount = $state(0);
	/** The bar. `total` 0 = row count not known yet (still unpacking), which
	 *  the dialog shows as a spinner. Null when silent or idle. */
	progress = $state<{ done: number; total: number; label: string } | null>(null);

	#host: ImportHost;
	/** Settles the review pause with the player's answer. */
	#reviewResolve: ((proceed: boolean) => void) | null = null;

	constructor(host: ImportHost) {
		this.#host = host;
	}

	/** Open the dialog on its file chooser. */
	open(): void {
		this.stage = 'idle';
		this.errors = [];
		this.warnings = [];
		this.summary = '';
		this.dialogOpen = true;
	}

	/** Back to the file chooser ("Choose another file"). */
	reset(): void {
		this.stage = 'idle';
		this.errors = [];
		this.warnings = [];
		this.summary = '';
		this.liveSummary = '';
		this.progress = null;
	}

	/** The review stage's answer: import the valid rows, or nothing. Closing
	 *  the dialog mid-review answers false, so the paused import settles. */
	answerReview(proceed: boolean): void {
		this.#reviewResolve?.(proceed);
		this.#reviewResolve = null;
	}

	/**
	 * Import a `.zip`, driving the ImportDialog (progress → done/error). Applies
	 * the payload resiliently: a failure on one row is collected and reported
	 * alongside the rest rather than aborting the whole import. `silent` (used by
	 * the first-run starter seed) skips the dialog and logs instead.
	 */
	async run(file: File, opts: { silent?: boolean } = {}): Promise<void> {
		const silent = opts.silent === true;
		const errors: string[] = [];
		// Live content tally — totals seeded once the manifest is known (below),
		// counts advanced per row in step().
		const importTotals: Record<string, number> = {};
		const importDoneBy: Record<string, number> = {};
		const catOf = (label: string) =>
			label.startsWith('Character')
				? 'char'
				: label.startsWith('Settlement')
					? 'comm'
					: label.startsWith('Place')
						? 'place'
						: label.startsWith('NPC')
							? 'npc'
							: label.startsWith('Expedition')
								? 'exp'
								: label.startsWith('Foe')
									? 'foe'
									: label.startsWith('Log entr')
										? 'log'
										: '';
		const renderImportSummary = () => {
			const cats: Array<[string, string, string]> = [
				['char', 'character', 'characters'],
				['comm', 'settlement', 'settlements'],
				['place', 'landmark', 'landmarks'],
				['npc', 'NPC', 'NPCs'],
				['exp', 'expedition', 'expeditions'],
				['foe', 'foe', 'foes'],
				['log', 'log entry', 'log entries'],
			];
			this.liveSummary = cats
				.filter(([k]) => (importTotals[k] ?? 0) > 0)
				.map(([k, one, many]) => {
					const t = importTotals[k];
					return `${importDoneBy[k] ?? 0}/${t} ${t === 1 ? one : many}`;
				})
				.join(', ');
		};
		// Unpacking is synchronous and blocks paint, but applying rows is not:
		// every unit of work goes through step(), so that is where the bar
		// advances. Rows that hit the network yield on their own; rows that
		// don't (log entries) would starve paint through a microtask-only
		// chain, so give the browser a macrotask when enough time has passed.
		let lastPaint = 0;
		const paint = async () => {
			const now = performance.now();
			if (now - lastPaint < 50) return;
			lastPaint = now;
			await new Promise((r) => setTimeout(r, 0));
		};
		// `rows`: how many rows the step covers (a batch of log entries is one
		// step, but counts as each entry on the bar and in the tally).
		const step = async (label: string, fn: () => unknown | Promise<unknown>, rows = 1) => {
			if (this.progress) {
				this.progress = { ...this.progress, label };
				await paint();
			}
			try {
				await fn();
			} catch (e) {
				errors.push(`${label}: ${e instanceof Error ? e.message : String(e)}`);
			}
			if (this.progress) {
				this.progress = { ...this.progress, done: this.progress.done + rows };
				const cat = catOf(label);
				if (cat) {
					importDoneBy[cat] = (importDoneBy[cat] ?? 0) + rows;
					renderImportSummary();
				}
			}
		};
		this.errors = [];
		this.warnings = [];
		this.summary = '';
		this.liveSummary = '';
		this.progress = null;
		let importStartedAt = 0;
		// Hold the importing overlay a 5s minimum (matching the export overlay) so
		// its bar + progress register rather than flashing past on a fast import.
		const holdImportMin = async () => {
			const MIN_MS = 5000;
			const elapsed = performance.now() - importStartedAt;
			if (elapsed < MIN_MS) await new Promise((r) => setTimeout(r, MIN_MS - elapsed));
		};
		if (!silent) {
			this.stage = 'importing';
			this.dialogOpen = true;
			this.progress = { done: 0, total: 0, label: 'Reading the archive…' };
			importStartedAt = performance.now();
		}
		try {
			const bytes = new Uint8Array(await file.arrayBuffer());
			// Map zips are a different beast (manifest.type === 'map',
			// background.jpg at the top level rather than under images/),
			// so they get their own importer. Peek the manifest before
			// running the full parseImportZip pipeline.
			if (await isMapZip(bytes)) {
				await importMapZip(file, relinkMarkersByName);
				if (!silent) {
					this.summary = 'Map imported.';
					await holdImportMin();
					this.stage = 'done';
				}
				return;
			}
			// parseImportZip unzips and parses synchronously, so nothing repaints
			// until it returns. Hand the browser a frame first or the dialog
			// opens blank on a large archive.
			if (!silent) await new Promise((r) => requestAnimationFrame(() => r(null)));
			const parsed = parseImportZip(bytes) as Record<string, unknown>;

			// Wait for the mount's store loads to settle before touching any
			// store. Applying an import while a collection load is still in
			// flight lets the load's `_sync.reset()` clobber the just-imported
			// rows (silent drop). `loadAssets()` stays for the catalogue below.
			await this.#host.storesLoaded();
			// Imported characters are reconciled against the catalogue's
			// counters and the character fields' options (reconcileImportedCharacter).
			// Both are usually loaded by now; these awaits are a safety net for
			// very early imports.
			// The foe catalogue names the foes, for matching them by name.
			await Promise.all([loadAssets(), loadOracles(), loadFoes()]);
			const chars = getCharacters();
			const communities = getCommunities();
			const npcs = getNpcs();
			const places = getPlaces();
			const expeditions = getExpeditions();
			const encounters = getEncounters();
			const knownDefs = new Map(
				getGlobalCounterIds().map((id) => [id, getGlobalCounterDef(id)!] as const),
			);

			/** A backup's log, as it was: each entry keeps its id (so importing
			 *  the same file twice adds nothing), time, note and roll, with its
			 *  HTML made safe. One that's malformed gets a new id, or now. */
			const toLogEntries = (rows: unknown): LogEntry[] =>
				(Array.isArray(rows) ? rows : [])
					.filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
					.map((r) => ({
						id: typeof r.id === 'string' && UUID.test(r.id) ? r.id : crypto.randomUUID(),
						title: String(r.title ?? ''),
						html: sanitizeLogHtml(String(r.html ?? '')),
						ts:
							typeof r.ts === 'string' && !Number.isNaN(Date.parse(r.ts))
								? r.ts
								: new Date().toISOString(),
						...(typeof r.note === 'string' && r.note ? { note: r.note } : {}),
						...(typeof r.source === 'string' ? { source: r.source } : {}),
						...(r.roll && typeof r.roll === 'object' ? { roll: r.roll as LogEntry['roll'] } : {}),
					}));

			/** A foe's name as its card shows it: its own, else the catalogue's. */
			const foeName = (f: { customName?: unknown; foeId?: unknown }): string => {
				const own = typeof f.customName === 'string' ? f.customName.trim() : '';
				if (own) return own;
				const def = typeof f.foeId === 'string' ? findFoe(f.foeId) : undefined;
				return def ? resolveFoeName(def) : String(f.foeId ?? 'Foe');
			};

			// ── Name-collision handling ───────────────────────────────────
			// Scan the incoming payload up front, and if any entity's NAME
			// matches an existing row's name (lowercased + trimmed), prompt
			// the user to pick a single strategy for the whole file:
			//   'new'     — regenerate ids on the incoming copies, append
			//   'replace' — overwrite the existing row via updateXxx()
			//   'skip'    — drop the colliding incoming row entirely
			//   'cancel'  — abort the whole import
			// Non-conflicting items always import normally.
			//
			// Matching is by name (not id) so cross-user transfers — where
			// IDs are minted independently on each user's data — still flag
			// duplicates correctly. The user thinks "do I already have a
			// Brennan?", not "is the UUID identical".
			//
			// Logs aren't surfaced here: an entry keeps its id, and one whose
			// id is already in the log is left as it is (importLogEntries).
			type ImportableChar = { name?: string; data?: Record<string, unknown> };

			// name → existing id maps (only existing rows we can replace
			// back into; new strategy uses crypto.randomUUID() instead).
			const existingCharByName = new Map(chars.map((c) => [normaliseName(c.name), c.id]));
			const existingCommunityByName = new Map(
				communities.map((c) => [normaliseName(c.name), c.id]),
			);
			const existingNpcByName = new Map(npcs.map((n) => [normaliseName(n.name), n.id]));
			const existingPlaceByName = new Map(places.map((p) => [normaliseName(p.name), p.id]));
			const existingJourneyByName = new Map(
				expeditions.filter((e) => e.type === 'journey').map((e) => [normaliseName(e.name), e.id]),
			);
			const existingSiteByName = new Map(
				expeditions.filter((e) => e.type === 'site').map((e) => [normaliseName(e.name), e.id]),
			);
			const existingSceneByName = new Map(
				expeditions.filter((e) => e.type === 'scene').map((e) => [normaliseName(e.name), e.id]),
			);
			const existingFoeByName = new Map(encounters.map((f) => [normaliseName(foeName(f)), f.id]));
			// Every id in use, per collection (see stageImportRow).
			const takenIds: Record<string, Set<string>> = {
				communities: new Set(communities.map((c) => c.id)),
				npcs: new Set(npcs.map((n) => n.id)),
				places: new Set(places.map((p) => p.id)),
				expeditions: new Set(expeditions.map((e) => e.id)),
				encounters: new Set(encounters.map((f) => f.id)),
			};

			let incomingCharacters: ImportableChar[] = [];
			let incomingCommunities: Community[] = [];
			let incomingNpcs: Npc[] = [];
			let incomingPlaces: Place[] = [];
			let incomingExpeditions: Expedition[] = [];
			let incomingFoes: FoeEncounter[] = [];

			if (parsed.manifest && parsed.data) {
				const m = parsed.manifest as { type: string };
				if (m.type === 'character') {
					incomingCharacters = [parsed.data as ImportableChar];
				} else if (m.type === 'all-characters') {
					incomingCharacters = (parsed.data as ImportableChar[]) ?? [];
				} else if (m.type === 'communities') {
					const d = parsed.data as { communities?: Community[]; npcs?: Npc[]; places?: Place[] };
					incomingCommunities = d.communities ?? [];
					incomingNpcs = d.npcs ?? [];
					incomingPlaces = d.places ?? [];
				} else if (m.type === 'expeditions') {
					incomingExpeditions = (parsed.data as Expedition[]) ?? [];
				} else if (m.type === 'everything') {
					const d = parsed.data as {
						characters?: ImportableChar[];
						communities?: Community[];
						npcs?: Npc[];
						places?: Place[];
						expeditions?: Expedition[];
						encounters?: FoeEncounter[];
					};
					incomingCharacters = d.characters ?? [];
					incomingCommunities = d.communities ?? [];
					incomingNpcs = d.npcs ?? [];
					incomingPlaces = d.places ?? [];
					incomingExpeditions = d.expeditions ?? [];
					incomingFoes = Array.isArray(d.encounters) ? d.encounters : [];
				}
			} else {
				incomingCharacters = [parsed as ImportableChar];
			}

			// ── Validate ──────────────────────────────────────────────────
			// Shape-check every incoming row WITHOUT applying anything, collecting
			// all problems up front. A row is valid when it's an object with a
			// non-empty name (expeditions also need a type). Invalid rows are
			// dropped from the incoming arrays; if any were dropped we pause on
			// the `review` state and let the user decide whether to import the
			// rest (the starter-seed path imports the valid rows silently).
			const validErrors: string[] = [];
			function keepValid<T extends { name?: unknown; type?: unknown }>(
				rows: T[],
				kind: string,
				needsType = false,
			): T[] {
				return rows.filter((r, i) => {
					const rec = r as { name?: unknown; type?: unknown } | null;
					const named =
						!!rec &&
						typeof rec === 'object' &&
						typeof rec.name === 'string' &&
						rec.name.trim() !== '';
					const label = named ? `“${(rec as { name: string }).name}”` : `#${i + 1}`;
					if (!named) {
						validErrors.push(`${kind} ${label}: missing or invalid name`);
						return false;
					}
					if (needsType && typeof rec!.type !== 'string') {
						validErrors.push(`${kind} ${label}: missing type`);
						return false;
					}
					return true;
				});
			}
			incomingCharacters = keepValid(incomingCharacters, 'Character');
			incomingCommunities = keepValid(incomingCommunities, 'Settlement');
			incomingNpcs = keepValid(incomingNpcs, 'NPC');
			incomingPlaces = keepValid(incomingPlaces, 'Place');
			incomingExpeditions = keepValid(incomingExpeditions, 'Expedition', true);
			// A foe has no name of its own to check: it needs the catalogue foe
			// it's one of (which needn't be enabled here — it imports anyway,
			// and shows once that content is on).
			incomingFoes = incomingFoes.filter((f, i) => {
				const ok =
					!!f && typeof f === 'object' && typeof f.foeId === 'string' && f.foeId.trim() !== '';
				if (!ok) validErrors.push(`Foe #${i + 1}: missing which foe it is`);
				return ok;
			});

			if (validErrors.length > 0) {
				const validCount =
					incomingCharacters.length +
					incomingCommunities.length +
					incomingNpcs.length +
					incomingPlaces.length +
					incomingExpeditions.length +
					incomingFoes.length;
				if (silent) {
					// Starter seed: import whatever's valid, note the rest.
					for (const e of validErrors) console.warn('[import]', e);
				} else {
					this.errors = validErrors;
					this.validCount = validCount;
					this.stage = 'review';
					const proceed = await new Promise<boolean>((r) => (this.#reviewResolve = r));
					this.#reviewResolve = null;
					if (!proceed) {
						this.stage = 'idle';
						this.#host.resetInput();
						return;
					}
					this.stage = 'importing';
				}
			}

			const collisions: CollisionItems = {
				characters: incomingCharacters
					.filter((c) => existingCharByName.has(normaliseName(c.name)))
					.map((c) => c.name ?? ''),
				communities: incomingCommunities
					.filter((c) => existingCommunityByName.has(normaliseName(c.name)))
					.map((c) => c.name ?? ''),
				npcs: incomingNpcs
					.filter((n) => existingNpcByName.has(normaliseName(n.name)))
					.map((n) => n.name ?? ''),
				places: incomingPlaces
					.filter((p) => existingPlaceByName.has(normaliseName(p.name)))
					.map((p) => p.name ?? ''),
				journeys: incomingExpeditions
					.filter((e) => e.type === 'journey' && existingJourneyByName.has(normaliseName(e.name)))
					.map((e) => e.name ?? ''),
				sites: incomingExpeditions
					.filter((e) => e.type === 'site' && existingSiteByName.has(normaliseName(e.name)))
					.map((e) => e.name ?? ''),
				scenes: incomingExpeditions
					.filter((e) => e.type === 'scene' && existingSceneByName.has(normaliseName(e.name)))
					.map((e) => e.name ?? ''),
				foes: incomingFoes
					.filter((f) => existingFoeByName.has(normaliseName(foeName(f))))
					.map((f) => foeName(f)),
			};
			const totalCollisions = Object.values(collisions).reduce((n, names) => n + names.length, 0);

			let strategy: CollisionStrategy = 'new';
			if (totalCollisions > 0) {
				strategy = await this.#host.chooseCollisionStrategy(collisions);
				if (strategy === 'cancel') {
					this.#host.resetInput();
					return;
				}
			}

			/** Character-specific applyStrategy. createCharacter and
			 *  persistCharacterNow have different shapes than the addXxx /
			 *  updateXxx pair the generic version targets. Returns true if
			 *  the caller should still createCharacter(); false otherwise. */
			async function applyCharacterStrategy(entry: ImportableChar): Promise<boolean> {
				const existingId = existingCharByName.get(normaliseName(entry.name));
				if (!existingId) return true; // no collision — caller creates
				if (strategy === 'skip') return false;
				if (strategy === 'new') return true; // createCharacter mints a fresh id; both coexist
				// 'replace' — overwrite the existing character's data + name
				persistCharacterNow(existingId, {
					name: entry.name ?? 'Imported Character',
					data: entry.data ?? {},
				});
				return false;
			}

			async function importChar(entry: ImportableChar): Promise<void> {
				const data = reconcileImportedCharacter(entry, knownDefs, findCharacterField);
				// Lift any inline portrait out of the JSON; it goes to the blob store.
				const inline = takeInlineDataUrl(data, 'portrait');
				const collided = existingCharByName.has(normaliseName(entry.name));
				if (await applyCharacterStrategy(entry)) {
					const created = await createCharacter(entry.name ?? 'Imported Character', data);
					if (inline) {
						const etag = await uploadPortrait(`/api/characters/${created.id}/portrait`, inline);
						if (etag) {
							persistCharacterNow(created.id, {
								name: created.name,
								data: { ...(created.data as Record<string, unknown>), portraitEtag: etag },
							});
						}
					}
				} else if (inline && collided && strategy === 'replace') {
					// applyCharacterStrategy already overwrote the existing character;
					// attach the portrait to it and persist the etag.
					const existingId = existingCharByName.get(normaliseName(entry.name));
					if (existingId) {
						const etag = await uploadPortrait(`/api/characters/${existingId}/portrait`, inline);
						if (etag) {
							persistCharacterNow(existingId, {
								name: entry.name ?? 'Imported Character',
								data: { ...data, portraitEtag: etag },
							});
						}
					}
				}
			}

			/** Stage one session-collection row for a batched upsert. Decides
			 *  the strategy (skip/new/replace), uploads any inline portrait,
			 *  rewrites `row.id` to the resolved target id, and pushes it
			 *  onto `batch`. The caller flushes each kind's batch after the
			 *  row loop with `addManyX(batch)`, collapsing N per-row POST /
			 *  PATCH round-trips into ONE `PUT /:kind/batch` call. Portrait
			 *  uploads stay one-per-row (they're blobs; a batch endpoint for
			 *  images would need an entirely different wire shape).
			 *
			 *  A row whose id is already taken here but whose name isn't (it was
			 *  renamed since the backup, say) gets a new id rather than writing
			 *  over the other: replacing is only ever by name, as asked. */
			async function stageImportRow<
				T extends {
					id: string;
					portraitEtag?: string;
					imageUrl?: string;
				},
			>(
				row: T,
				seg: string,
				existingByName: Map<string, string>,
				batch: T[],
				name = (row as { name?: string | null }).name,
			): Promise<void> {
				const inline = takeInlineDataUrl(row as Record<string, unknown>, 'imageUrl');
				const taken = (takenIds[seg] ??= new Set());
				const existingId = existingByName.get(normaliseName(name));
				if (existingId) {
					if (strategy === 'skip') return;
					if (strategy === 'new') row.id = crypto.randomUUID();
					else if (strategy === 'replace') row.id = existingId;
				} else if (typeof row.id !== 'string' || row.id === '' || taken.has(row.id)) {
					row.id = crypto.randomUUID();
				}
				taken.add(row.id);
				if (inline) {
					const etag = await uploadPortrait(`/api/session/${seg}/${row.id}/portrait`, inline);
					if (etag) row.portraitEtag = etag;
				}
				batch.push(row);
			}

			/** Re-link every imported connection to its container BY NAME + KIND.
			 *  Exports carry a portable `withinRef` {kind, name} (ids are minted
			 *  per-user, so a raw id never re-links on another ledger); the legacy
			 *  place-only `withinSettlementName` is still honoured. Runs as a POST
			 *  pass — AFTER communities, places AND npcs land — so container ids of
			 *  every kind exist (a landmark can sit within another landmark).
			 *
			 *  The resolved forest is run through `sanitizeContainment` before it's
			 *  applied, so an imported file that describes illegal nesting (a
			 *  settlement inside a settlement, two settlements on one chain, a
			 *  cycle, an NPC as a container) can't create it here — the offending
			 *  links are dropped and those rows land top-level. The transport
			 *  fields are always cleared; a row with neither (legacy raw id) keeps
			 *  whatever `within` it already had (also sanitized). */
			async function relinkContainment(): Promise<void> {
				const nm = (s: string) => normaliseName(s);
				const commByName = new Map(getCommunities().map((c) => [nm(c.name), c.id]));
				const placeByName = new Map(getPlaces().map((p) => [nm(p.name), p.id]));
				/** Where this row WANTS to sit: resolved from its transport field by
				 *  name+kind, else its existing `within`. */
				const proposedWithin = (
					kind: 'community' | 'place' | 'npc',
					rec: Record<string, unknown>,
				): string | undefined => {
					const wr = rec.withinRef as { kind?: string; name?: string } | undefined;
					if (
						wr &&
						(wr.kind === 'community' || wr.kind === 'place') &&
						typeof wr.name === 'string'
					) {
						const id = (wr.kind === 'community' ? commByName : placeByName).get(nm(wr.name));
						return id ? `${wr.kind}:${id}` : undefined;
					}
					if (typeof rec.withinSettlementName === 'string') {
						const id = commByName.get(nm(rec.withinSettlementName));
						return id ? `community:${id}` : undefined;
					}
					return typeof rec.within === 'string' ? rec.within : undefined;
				};

				const passes = [
					['community', getCommunities(), addManyCommunities],
					['place', getPlaces(), addManyPlaces],
					['npc', getNpcs(), addManyNpcs],
				] as const;

				// 1. Resolve the whole proposed forest, then repair it to the rules.
				const nodes: ContainmentNode[] = [];
				for (const [kind, list] of passes)
					for (const e of list)
						nodes.push({
							ref: refOf(kind, e.id),
							within: proposedWithin(kind, e as unknown as Record<string, unknown>),
						});
				const sanitized = sanitizeContainment(nodes);

				// 2. Apply — write the sanitized `within` (or clear it) and drop every
				//    transport field. Skip rows that neither carried a transport field
				//    nor changed, so we don't churn untouched entities. Patches
				//    collected per-kind and flushed in ONE `addMany` per kind
				//    (one batched PUT, not N serial PATCHes).
				for (const [kind, list, addMany] of passes) {
					const patches: Array<Record<string, unknown> & { id: string }> = [];
					for (const e of list) {
						const rec = e as unknown as Record<string, unknown>;
						const hadTransport = 'withinRef' in rec || 'withinSettlementName' in rec;
						const next = sanitized.get(refOf(kind, e.id));
						const current = typeof rec.within === 'string' ? rec.within : undefined;
						if (!hadTransport && next === current) continue;
						const patch = { ...(e as object) } as Record<string, unknown> & { id: string };
						if (next) patch.within = next;
						else delete patch.within;
						delete patch.withinRef;
						delete patch.withinSettlementName;
						delete patch.withinSettlementId;
						patches.push(patch);
					}
					if (patches.length > 0) await addMany(patches as never);
				}
			}

			// Row count for the bar. Mirrors exactly what the dispatch below
			// walks, so `done` can never overshoot `total`: only an
			// `everything` bundle carries a log or bundled maps, and the maps
			// restore is one step however many it holds.
			const kind = (parsed.manifest as { type?: string } | undefined)?.type;
			const incomingLog = toLogEntries(
				kind === 'log'
					? parsed.data
					: kind === 'everything'
						? (parsed.data as { log?: unknown })?.log
						: [],
			);
			if (this.progress) {
				const total =
					incomingCharacters.length +
					incomingCommunities.length +
					incomingNpcs.length +
					incomingPlaces.length +
					incomingExpeditions.length +
					incomingFoes.length +
					incomingLog.length +
					(kind === 'everything' ? 1 : 0); // the bundled-maps step
				this.progress = { done: 0, total, label: this.progress.label };
				importTotals.char = incomingCharacters.length;
				importTotals.comm = incomingCommunities.length;
				importTotals.place = incomingPlaces.length;
				importTotals.npc = incomingNpcs.length;
				importTotals.exp = incomingExpeditions.length;
				importTotals.foe = incomingFoes.length;
				importTotals.log = incomingLog.length;
				renderImportSummary();
			}
			// The log goes up in a few batches, as one step that counts each entry.
			const importLog = () =>
				incomingLog.length
					? step('Log entries', () => importLogEntries(incomingLog), incomingLog.length)
					: undefined;

			// The content packs the backup had on are switched on first (none is
			// switched off), so what needs them shows. One this app doesn't have
			// is noted, and what the backup holds from it imports all the same.
			const packWarnings: string[] = [];
			let packsOn: string[] = [];
			const incomingPacks = readPackChoices(
				kind === 'everything' ? (parsed.data as { extensions?: unknown })?.extensions : undefined,
			);
			if (incomingPacks.some((p) => p.enabled)) {
				await step(
					'Content packs',
					async () => {
						await loadExtensions();
						const here = getExtensions().map((e) => e.id);
						if (here.length === 0)
							throw new Error("couldn't be read, so the backup's weren't switched on");
						const plan = planPackRestore(incomingPacks, here);
						for (const p of plan.missing)
							packWarnings.push(
								`This app doesn't have the “${p.name}” content pack the backup had on. Everything in the backup is imported anyway, but what comes from that pack won't show.`,
							);
						packsOn = (await enableExtensions(plan.switchOn)).map((e) => e.name);
					},
					0,
				);
			}

			if (parsed.manifest && parsed.data) {
				const m = parsed.manifest as { type: string };
				if (m.type === 'character' || m.type === 'all-characters') {
					for (const entry of incomingCharacters)
						await step(`Character “${entry.name}”`, () => importChar(entry));
				} else if (m.type === 'log') {
					await importLog();
				} else if (m.type === 'communities') {
					const commBatch: Community[] = [];
					const npcBatch: Npc[] = [];
					const placeBatch: Place[] = [];
					for (const c of incomingCommunities)
						await step(`Settlement “${c.name}”`, () =>
							stageImportRow(c, 'communities', existingCommunityByName, commBatch),
						);
					for (const n of incomingNpcs)
						await step(`NPC “${n.name}”`, () =>
							stageImportRow(n, 'npcs', existingNpcByName, npcBatch),
						);
					for (const pl of incomingPlaces)
						await step(`Place “${pl.name}”`, () =>
							stageImportRow(pl, 'places', existingPlaceByName, placeBatch),
						);
					// Flush each kind in ONE PUT /:kind/batch each (instead of
					// N serial POST/PATCH per row). addMany is a no-op on empty.
					await addManyCommunities(commBatch);
					await addManyNpcs(npcBatch);
					await addManyPlaces(placeBatch);
					// All connection kinds are in — now resolve the portable within refs.
					await relinkContainment();
				} else if (m.type === 'expeditions') {
					const expBatch: Expedition[] = [];
					for (const exp of incomingExpeditions) {
						const byName =
							exp.type === 'site'
								? existingSiteByName
								: exp.type === 'scene'
									? existingSceneByName
									: existingJourneyByName;
						await step(`Expedition “${exp.name}”`, () =>
							stageImportRow(exp, 'expeditions', byName, expBatch),
						);
					}
					await addManyExpeditions(expBatch);
				} else if (m.type === 'everything') {
					for (const entry of incomingCharacters)
						await step(`Character “${entry.name}”`, () => importChar(entry));
					await importLog();
					const commBatch: Community[] = [];
					const npcBatch: Npc[] = [];
					const placeBatch: Place[] = [];
					for (const c of incomingCommunities)
						await step(`Settlement “${c.name}”`, () =>
							stageImportRow(c, 'communities', existingCommunityByName, commBatch),
						);
					for (const n of incomingNpcs)
						await step(`NPC “${n.name}”`, () =>
							stageImportRow(n, 'npcs', existingNpcByName, npcBatch),
						);
					for (const pl of incomingPlaces)
						await step(`Place “${pl.name}”`, () =>
							stageImportRow(pl, 'places', existingPlaceByName, placeBatch),
						);
					await addManyCommunities(commBatch);
					await addManyNpcs(npcBatch);
					await addManyPlaces(placeBatch);
					// All connection kinds are in — now resolve the portable within refs.
					await relinkContainment();
					const expBatch: Expedition[] = [];
					for (const exp of incomingExpeditions) {
						const byName =
							exp.type === 'site'
								? existingSiteByName
								: exp.type === 'scene'
									? existingSceneByName
									: existingJourneyByName;
						await step(`Expedition “${exp.name}”`, () =>
							stageImportRow(exp, 'expeditions', byName, expBatch),
						);
					}
					await addManyExpeditions(expBatch);
					const foeBatch: FoeEncounter[] = [];
					for (const f of incomingFoes)
						await step(`Foe “${foeName(f)}”`, () =>
							stageImportRow(f, 'encounters', existingFoeByName, foeBatch, foeName(f)),
						);
					await addManyEncounters(foeBatch);
					// Restore bundled maps (markers + backgrounds) from the nested
					// `maps/<id>/…` dirs, re-linking each to its owner entity by name.
					await step('Maps', () =>
						restoreBundledMaps(unzipSync(bytes), (names) => this.#host.chooseMapConflict(names)),
					);
				}
			} else {
				for (const entry of incomingCharacters)
					await step(`Character “${entry.name}”`, () => importChar(entry));
			}

			// ── Report ────────────────────────────────────────────────────
			const connCount = incomingCommunities.length + incomingNpcs.length + incomingPlaces.length;
			const logCount = incomingLog.length;
			const parts: string[] = [];
			if (incomingCharacters.length)
				parts.push(
					`${incomingCharacters.length} character${incomingCharacters.length === 1 ? '' : 's'}`,
				);
			if (connCount) parts.push(`${connCount} connection${connCount === 1 ? '' : 's'}`);
			if (incomingExpeditions.length)
				parts.push(
					`${incomingExpeditions.length} expedition${incomingExpeditions.length === 1 ? '' : 's'}`,
				);
			if (incomingFoes.length)
				parts.push(`${incomingFoes.length} foe${incomingFoes.length === 1 ? '' : 's'}`);
			if (logCount) parts.push(`${logCount} log ${logCount === 1 ? 'entry' : 'entries'}`);
			const packNote = packsOn.length
				? ` Switched on the ${new Intl.ListFormat('en').format(packsOn)} content pack${packsOn.length === 1 ? '' : 's'}.`
				: '';
			this.summary =
				(parts.length ? `Imported ${parts.join(' · ')}.` : 'Nothing new to import.') +
				(validErrors.length ? ` ${validErrors.length} skipped.` : '') +
				packNote;
			this.errors = [...validErrors, ...errors];
			this.warnings = packWarnings;
			if (silent) for (const w of packWarnings) console.warn('[import]', w);
			// Hold the (full) bar the 5s minimum before flipping to the summary.
			if (!silent) {
				await holdImportMin();
				this.stage = 'done';
			}
			this.progress = null;
		} catch (err) {
			const msg =
				err instanceof ImportError
					? err.message
					: 'Could not import. Make sure the file is a valid Iron Ledger export.';
			if (silent) {
				console.warn('[import]', msg);
			} else {
				this.errors = [msg];
				this.progress = null;
				this.stage = 'error';
			}
		} finally {
			this.#host.resetInput();
		}
	}
}

/** A log entry id the API takes. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Peek a zip's manifest.json to see if this is a per-map bundle.
 *  Cheap enough (only unzips into an entries dict + parses one small
 *  entry) that we can do it before delegating to either
 *  `importMapZip` (map bundle) or `parseImportZip` (everything /
 *  per-entity bundle). Returns false on any decompression / parse
 *  error — the main pipeline will produce a proper user-facing error
 *  message. */
export async function isMapZip(bytes: Uint8Array): Promise<boolean> {
	try {
		const entries = unzipSync(bytes);
		const mBytes = entries['manifest.json'];
		if (!mBytes) return false;
		const m = JSON.parse(strFromU8(mBytes)) as { type?: string };
		return m.type === 'map';
	} catch {
		return false;
	}
}

/** Re-resolve imported markers' entity links BY NAME against the current
 *  entity stores. The raw `entityId` uuid came from the exporting account,
 *  so after id regeneration / a merge it's meaningless; the exporter stamps
 *  each linked marker with `entityName`, and we map (kind, name) → the
 *  entity's current id. A name that resolves → the live id; one that doesn't
 *  (entity not imported, or skipped) → drop the dead link so the pin
 *  survives as a plain annotation. Legacy exports (no `entityName`) keep
 *  their link only if the raw id still resolves (same-account restore).
 *  `entityName` is always stripped — it never persists server-side. Shared
 *  by the Everything-restore and standalone-map-import paths. */
export function relinkMarkersByName(markers: MapMarker[]): MapMarker[] {
	const communities = getCommunities();
	const places = getPlaces();
	const expeditions = getExpeditions();
	const key = (kind: MapOwnerKind, name: string) => `${kind}:${normaliseName(name)}`;
	const idByName = new Map<string, string>();
	for (const c of communities) idByName.set(key('community', c.name), c.id);
	for (const p of places) idByName.set(key('place', p.name), p.id);
	for (const e of expeditions)
		idByName.set(key(e.type === 'site' ? 'site' : 'journey', e.name), e.id);
	return markers.map((raw) => {
		const { entityName, ...m } = raw;
		const parsed = parseEntityId(m.entityId);
		if (!parsed) return m; // no / malformed link — nothing to resolve
		if (typeof entityName === 'string' && entityName.trim() !== '') {
			const newId = idByName.get(key(parsed.kind as MapOwnerKind, entityName));
			if (newId) return { ...m, entityId: formatEntityId(parsed.kind, newId) };
			const { entityId: _drop, ...noLink } = m;
			return noLink; // named entity absent on this account → drop the link
		}
		if (resolveEntity(m.entityId)) return m; // same-account restore
		const { entityId: _drop, ...noLink } = m;
		return noLink;
	});
}

/**
 * Apply the maps bundled in an Everything import, re-linking each to its
 * owner entity BY NAME (entity ids were regenerated during the entity
 * import above). Runs after the entity rows land, so the live stores hold
 * the imported entities and their new ids.
 *
 *   • owner resolves + has no map yet → create it linked (`applyMapImport`
 *     with owner).
 *   • owner resolves + already has a map → one prompt, Replace (overwrite
 *     that map in place) or Skip (import as standalone).
 *   • owner unknown / no match → import as a standalone map.
 *
 * `chooseConflict` asks once for every map whose owner already has one.
 */
async function restoreBundledMaps(
	entries: Record<string, Uint8Array>,
	chooseConflict: (names: string[]) => Promise<'replace' | 'skip'>,
): Promise<void> {
	const communities = getCommunities();
	const places = getPlaces();
	const expeditions = getExpeditions();
	const bundled = parseBundledMaps(entries);
	if (bundled.length === 0) return;

	// (kind, name) → current entity id, from the just-imported stores.
	const key = (kind: MapOwnerKind, name: string) => `${kind}:${normaliseName(name)}`;
	const ownerIdByKey = new Map<string, string>();
	for (const c of communities) ownerIdByKey.set(key('community', c.name), c.id);
	for (const p of places) ownerIdByKey.set(key('place', p.name), p.id);
	for (const e of expeditions)
		ownerIdByKey.set(key(e.type === 'site' ? 'site' : 'journey', e.name), e.id);

	// Re-resolve each marker's entity link BY NAME (see relinkMarkersByName),
	// the same way the map's owner is relinked above.
	for (const b of bundled) b.body.markers = relinkMarkersByName(b.body.markers);

	// Which owners already have a map (and its id) — for conflict detection.
	// Also: standalone maps already present, keyed by normalised name, so a
	// re-import of the same regional map replaces instead of duplicating.
	//
	// If this fetch fails we CANNOT dedupe against what's already in the
	// DB — every incoming map would go straight to `standalone.push()`
	// and get created blindly, even when a same-name copy already
	// exists. That is exactly how "two Regional Maps, one with a
	// background and one without" happens: the first import blew the
	// rate limit, this GET came back 429, the dedupe snapshot was
	// empty, and the retry created a second map alongside the first.
	// Better to surface the fetch failure to the user (they see an
	// error, they retry) than to silently duplicate.
	const ownedMapId = new Map<string, string>();
	const standaloneMapIdByName = new Map<string, string>();
	const res = await fetch('/api/session/maps');
	if (!res.ok) {
		throw new Error(
			`Failed to fetch current map list (${res.status}) — refusing to import bundled maps blind. Try again in a moment.`,
		);
	}
	const listBody = (await res.json()) as {
		maps?: Array<{
			id: string;
			name: string;
			ownerKind: MapOwnerKind | null;
			ownerId: string | null;
		}>;
	};
	for (const m of listBody.maps ?? []) {
		if (m.ownerKind && m.ownerId) ownedMapId.set(`${m.ownerKind}:${m.ownerId}`, m.id);
		else if (m.name) standaloneMapIdByName.set(normaliseName(m.name), m.id);
	}

	type Plan = {
		body: MapZipBody;
		background?: Uint8Array;
		owner?: { ownerKind: MapOwnerKind; ownerId: string };
		existingMapId?: string;
	};
	const linked: Plan[] = [];
	const standalone: Plan[] = [];
	const conflicts: Plan[] = [];
	for (const { body, background } of bundled) {
		if (body.ownerKind && body.ownerName) {
			const ownerId = ownerIdByKey.get(key(body.ownerKind, body.ownerName));
			if (ownerId) {
				const existingMapId = ownedMapId.get(`${body.ownerKind}:${ownerId}`);
				const owner = { ownerKind: body.ownerKind, ownerId };
				if (existingMapId) conflicts.push({ body, background, owner, existingMapId });
				else linked.push({ body, background, owner });
				continue;
			}
		}
		// Standalone (or unresolved-owner) map: dedupe against an existing
		// standalone map with the same name so re-imports replace instead
		// of duplicating.
		const existingMapId = body.name
			? standaloneMapIdByName.get(normaliseName(body.name))
			: undefined;
		if (existingMapId) conflicts.push({ body, background, existingMapId });
		else standalone.push({ body, background });
	}

	// One decision covers every owned-map conflict in the file.
	let strategy: 'replace' | 'skip' = 'skip';
	if (conflicts.length > 0) {
		const names = conflicts.map((c) => c.body.ownerName || c.body.name || '(unnamed)');
		strategy = await chooseConflict(names);
	}

	for (const p of linked) await applyMapImport(p.body, p.background, p.owner);
	for (const p of standalone) await applyMapImport(p.body, p.background);
	for (const p of conflicts) {
		if (strategy === 'replace' && p.existingMapId) {
			await populateMap(p.existingMapId, p.body, p.background);
		}
		// strategy === 'skip' → do nothing. Previous behaviour called
		// `applyMapImport(p.body, p.background)` which silently created
		// a second standalone map of the same name, which is exactly
		// the "duplicate maps after import" bug the dedupe was there
		// to prevent. The dialog's own docstring says skip means "leave
		// existing maps untouched"; honour that literally.
	}
}
