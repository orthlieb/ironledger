// =============================================================================
// Iron Ledger — export (Hamburger → Export…)
//
// The dialog's selection becomes either a re-importable zip (`exportZip`: the
// JSON body with portraits re-embedded inline, plus each selected map's
// `maps/<id>/…` dir) or a Markdown bundle (`exportMarkdownZip`: one file per
// entity, a README index, portraits under images/, each map as an SVG with
// numbered pins). `CampaignExport` drives the busy overlay. Foes appear only
// in the Markdown bundle: encounters are transient, so the JSON leaves them
// out. See docs/import-schema.md.
// =============================================================================

import { tick } from 'svelte';
import { zipSync, strToU8 } from 'fflate';
import type { CharacterFull } from '#lib/api.js';
import { getCharacters } from '#lib/characterStore.svelte.js';
import { getEncounters } from '#lib/encounterStore.svelte.js';
import { getExpeditions } from '#lib/expeditionStore.svelte.js';
import { getCommunities } from '#lib/communityStore.svelte.js';
import { getNpcs } from '#lib/npcStore.svelte.js';
import { getPlaces } from '#lib/placeStore.svelte.js';
import { getAssets } from '#lib/assetStore.svelte.js';
import {
	characterFieldGroups,
	fieldsMarkdown,
	findCharacterField,
} from '#lib/characterFields.svelte.js';
import { loadOracles } from '#lib/oracleStore.svelte.js';
import { findFoe, resolveFoeName, FOE_RANKS } from '#lib/foeStore.svelte.js';
import { sessionLog } from '#lib/log.svelte.js';
import {
	makeTimestamp,
	downloadFile,
	exportZip,
	b64ToU8,
	slugify,
	formatTicks,
} from '#lib/exportSerialize.js';
import type { ExportSelection } from '#lib/exportSelection.js';
import { characterMarkdown, logToMarkdown, mapSvg } from '#lib/exportMarkdown.js';
import { buildMapZipEntries } from '#lib/mapExport.js';
import { gridDimsForAspect } from '#lib/mapConstants.js';
import type { MapOwnerKind } from '#lib/mapStore.svelte.js';
import { resolveEntity } from '#lib/mapEntityLinks.js';
import { breadcrumbRefs, effectiveRegion } from '#lib/entityContainment.js';
import { cleanMapLayers, layerShownTest } from '#lib/mapLayerRules.js';
import {
	entityWithin,
	fetchPortraitDataUrl,
	liveContainmentGraph,
	refName,
	refOf,
	splitRef,
} from '#lib/campaignTransfer.js';

/** The active entries an Everything export records, so a restore reopens them. */
export interface ExportSessionIds {
	activeCharId: string;
	activeFoeId: string;
	activeExpeditionId: string;
}

/** The export overlay's state, and the export that drives it. */
export class CampaignExport {
	/** The overlay's bar while an export runs (`total` 0: a spinner); null when idle. */
	progress = $state<{ done: number; total: number; label: string } | null>(null);
	/** Live per-category tally ("3/15 settlements, 0/22 landmarks"). */
	summary = $state('');
	/** What the export left out, and why. The overlay stays open on them, with
	 *  a Close button, until `dismiss()`. */
	warnings = $state<string[]>([]);
	/** The export is done and the overlay is held open on its warnings. */
	held = $state(false);

	/** Close the overlay on its warnings. */
	dismiss(): void {
		this.progress = null;
		this.summary = '';
		this.warnings = [];
		this.held = false;
	}

	// Comprehensive export — build the payload from the dialog's selection.
	// Zip fully honours the selection (per-category and per-item); Markdown is
	// still whole-campaign except for a log-only pick (per-category markdown
	// filtering is a follow-up). Foes are never in the JSON — transient
	// encounters — so they surface only in the Markdown bundle.
	async run(sel: ExportSelection, session: ExportSessionIds): Promise<void> {
		const stamp = makeTimestamp();
		this.warnings = [];
		const charSet = new Set(sel.characters);
		const expSet = new Set(sel.expeditions);
		const mapSet = new Set(sel.maps);
		const commSet = new Set(sel.communities);
		const npcSet = new Set(sel.npcs);
		const placeSet = new Set(sel.places);
		const chars = getCharacters();
		const communities = getCommunities();
		const npcs = getNpcs();
		const places = getPlaces();
		const expeditions = getExpeditions();
		const selChars = chars.filter((c) => charSet.has(c.id));
		const selExps = expeditions.filter((e) => expSet.has(e.id));
		const selComms = communities.filter((c) => commSet.has(c.id));
		const selNpcs = npcs.filter((n) => npcSet.has(n.id));
		const selPlaces = places.filter((p) => placeSet.has(p.id));
		const wantConn = selComms.length > 0 || selNpcs.length > 0 || selPlaces.length > 0;

		// Live content tally for the overlay — done/total per category, ticking
		// up as each item is processed (e.g. "3/15 settlements, 0/22 landmarks").
		const word = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);
		const journeys = selExps.filter((e) => e.type === 'journey').length;
		const sites = selExps.filter((e) => e.type === 'site').length;
		const scenes = selExps.filter((e) => e.type === 'scene').length;
		const foeCount = sel.format === 'md' ? sel.foes.length : 0;
		const tally: Array<{ key: string; total: number; label: string }> = [
			{ key: 'char', total: selChars.length, label: word(selChars.length, 'character') },
			{ key: 'comm', total: selComms.length, label: word(selComms.length, 'settlement') },
			{ key: 'place', total: selPlaces.length, label: word(selPlaces.length, 'landmark') },
			{ key: 'npc', total: selNpcs.length, label: word(selNpcs.length, 'NPC') },
			{ key: 'journey', total: journeys, label: word(journeys, 'journey') },
			{ key: 'site', total: sites, label: word(sites, 'site') },
			{ key: 'scene', total: scenes, label: word(scenes, 'scene') },
			{ key: 'map', total: mapSet.size, label: word(mapSet.size, 'map') },
			{ key: 'foe', total: foeCount, label: word(foeCount, 'foe') },
			{
				key: 'log',
				total: sel.log ? sessionLog.entries.length : 0,
				label: word(sel.log ? sessionLog.entries.length : 0, 'log entry', 'log entries'),
			},
		];
		const doneBy: Record<string, number> = {};
		const renderSummary = () =>
			(this.summary = tally
				.filter((c) => c.total > 0)
				.map((c) => `${doneBy[c.key] ?? 0}/${c.total} ${c.label}`)
				.join(', '));
		renderSummary();

		this.progress = { done: 0, total: 0, label: 'Preparing export…' };
		const startedAt = performance.now();
		try {
			// ── Markdown ──────────────────────────────────────────────────────────
			if (sel.format === 'md') {
				const onlyLog =
					selChars.length === 0 &&
					selExps.length === 0 &&
					!wantConn &&
					mapSet.size === 0 &&
					sel.foes.length === 0 &&
					sel.log;
				if (onlyLog) {
					downloadFile(
						`session-log-${stamp}.md`,
						logToMarkdown(sessionLog.entries),
						'text/markdown',
					);
					return;
				}
				this.progress = { done: 0, total: 0, label: 'Building Markdown…' };
				await tick();
				await exportMarkdownZip(
					stamp,
					sel,
					(done, total, label) => {
						this.progress = { done, total, label };
					},
					(kind) => {
						doneBy[kind] = (doneBy[kind] ?? 0) + 1;
						renderSummary();
					},
					(warning) => this.warnings.push(warning),
				);
				// The markdown bundle also writes maps + the log + the foes
				// bestiary; reflect all three in the final tally.
				doneBy['map'] = mapSet.size;
				doneBy['foe'] = sel.foes.length;
				if (sel.log) doneBy['log'] = sessionLog.entries.length;
				renderSummary();
				this.progress = { done: 1, total: 1, label: 'Done' };
				return;
			}

			// ── Zip (re-importable; merges by whichever keys are present) ───────────
			const payload: Record<string, unknown> = {};
			let count = 0;
			// One tick per embedded entity + one for the synchronous compress step.
			const total =
				selChars.length +
				selComms.length +
				selNpcs.length +
				selPlaces.length +
				selExps.length +
				mapSet.size +
				1;
			let done = 0;
			this.progress = { done, total, label: 'Preparing export…' };
			// Embed a group concurrently, advancing the bar as each portrait fetch
			// resolves; `label` names the phase up front.
			const embedAll = async <T>(
				items: T[],
				fn: (it: T) => Promise<unknown>,
				label: string,
				keyOf: (it: T) => string,
			): Promise<unknown[]> => {
				this.progress = { done, total, label };
				return Promise.all(
					items.map(async (it) => {
						const r = await fn(it);
						done += 1;
						const k = keyOf(it);
						doneBy[k] = (doneBy[k] ?? 0) + 1;
						this.progress = { done, total, label };
						renderSummary();
						return r;
					}),
				);
			};
			if (selChars.length) {
				payload.characters = await embedAll(
					selChars,
					embedCharForExport,
					'Embedding characters…',
					() => 'char',
				);
				count += selChars.length;
			}
			if (selComms.length) {
				payload.communities = await embedAll(
					selComms,
					(c) => embedEntityForExport('communities', c),
					'Embedding settlements…',
					() => 'comm',
				);
				count += selComms.length;
			}
			if (selNpcs.length) {
				payload.npcs = await embedAll(
					selNpcs,
					(n) => embedEntityForExport('npcs', n),
					'Embedding NPCs…',
					() => 'npc',
				);
				count += selNpcs.length;
			}
			if (selPlaces.length) {
				payload.places = await embedAll(
					selPlaces,
					(p) => embedEntityForExport('places', p),
					'Embedding landmarks…',
					() => 'place',
				);
				count += selPlaces.length;
			}
			if (selExps.length) {
				payload.expeditions = await embedAll(
					selExps,
					(e) => embedEntityForExport('expeditions', e),
					'Embedding expeditions…',
					(e) => e.type,
				);
				count += selExps.length;
			}
			if (sel.log) {
				const entries = [...sessionLog.entries].reverse();
				payload.log = entries;
				count += entries.length;
				doneBy['log'] = entries.length;
				renderSummary();
			}
			payload.session = session;

			// Selected maps ride along as nested `maps/<id>/…` dirs (markers +
			// background bytes).
			let mapFiles: Record<string, Uint8Array> = {};
			if (mapSet.size) {
				this.progress = { done, total, label: 'Collecting maps…' };
				await tick();
				({ mapFiles } = await collectMapEntries(mapSet));
				done += mapSet.size;
				doneBy['map'] = mapSet.size;
				this.progress = { done, total, label: 'Collecting maps…' };
				renderSummary();
			}
			count += mapSet.size;

			// zipSync is synchronous and briefly freezes the thread — paint
			// "Compressing…" (via tick) before we block so the stall is explained.
			this.progress = { done, total, label: 'Compressing…' };
			await tick();
			await exportZip('everything', payload, count, `ironledger-export-${stamp}.zip`, mapFiles);
			done = total;
			this.progress = { done, total, label: 'Done' };
		} finally {
			// A cached/small export finishes in a blink; hold the overlay a 5s
			// minimum (matching the import dialog) so the feedback + summary
			// register rather than flashing past.
			// With warnings, the overlay waits on them instead (see dismiss()).
			const MIN_MS = 5000;
			const elapsed = performance.now() - startedAt;
			if (this.warnings.length) {
				this.progress = { done: 1, total: 1, label: 'Done' };
				this.held = true;
			} else {
				if (elapsed < MIN_MS) await new Promise((r) => setTimeout(r, MIN_MS - elapsed));
				this.progress = null;
				this.summary = '';
			}
		}
	}
}

export async function exportMarkdownZip(
	stamp: string,
	sel: ExportSelection,
	onProgress?: (done: number, total: number, label: string) => void,
	onItem?: (kind: string) => void,
	onWarning?: (warning: string) => void,
) {
	const zipFiles: Record<string, Uint8Array> = {};
	const usedNames = new Set<string>();
	const chars = getCharacters();
	const communities = getCommunities();
	const npcs = getNpcs();
	const places = getPlaces();
	const expeditions = getExpeditions();
	const encounters = getEncounters();
	const containmentGraph = liveContainmentGraph();

	// Selection → the entities this export covers (honours the dialog's
	// checklist; the zip export already did, the markdown one used to walk
	// everything).
	const charSet = new Set(sel.characters);
	const commSet = new Set(sel.communities);
	const npcSet = new Set(sel.npcs);
	const placeSet = new Set(sel.places);
	const expSet = new Set(sel.expeditions);
	const mapSet = new Set(sel.maps);
	const selChars = chars.filter((c) => charSet.has(c.id));
	const selComms = communities.filter((c) => commSet.has(c.id));
	const selNpcs = npcs.filter((n) => npcSet.has(n.id));
	const selPlaces = places.filter((p) => placeSet.has(p.id));
	const selExps = expeditions.filter((e) => expSet.has(e.id));
	// The character fields' dropdown labels come from the oracles.
	if (selChars.length) await loadOracles();

	// Portraits go under images/; entity files live one folder deep and link
	// to them with a ../ prefix. Returns the bare zip path (images/…).
	function addImage(dataUrl: string, prefix: string, name: string): string {
		const base = `images/${prefix}-${slugify(name)}`;
		let path = `${base}.jpg`;
		let i = 2;
		while (usedNames.has(path)) {
			path = `${base}-${i++}.jpg`;
		}
		usedNames.add(path);
		zipFiles[path] = b64ToU8(dataUrl);
		return path;
	}

	// Unique slug per folder so filenames and the links pointing at them
	// agree even when two entities share a name.
	function slugMap(items: Array<{ id: string; name?: string }>, fallback: string) {
		const used = new Set<string>();
		const m = new Map<string, string>();
		for (const it of items) {
			const base = slugify(it.name || fallback) || fallback;
			let slug = base;
			let i = 2;
			while (used.has(slug)) slug = `${base}-${i++}`;
			used.add(slug);
			m.set(it.id, slug);
		}
		return m;
	}
	const charSlugs = slugMap(selChars, 'character');
	// Settlements + landmarks + NPCs share one connections/ folder → one slug
	// namespace, so a within/contains link resolves to the right file. Each
	// item is tagged with its kind + parent so both directions can be built.
	const connItems: Array<{
		kind: 'community' | 'place' | 'npc';
		id: string;
		name: string;
		within?: string;
	}> = [
		...selComms.map((c) => ({
			kind: 'community' as const,
			id: c.id,
			name: c.name,
			within: entityWithin(c),
		})),
		...selPlaces.map((p) => ({
			kind: 'place' as const,
			id: p.id,
			name: p.name,
			within: entityWithin(p),
		})),
		...selNpcs.map((n) => ({
			kind: 'npc' as const,
			id: n.id,
			name: n.name,
			within: entityWithin(n),
		})),
	];
	const connSlugs = slugMap(connItems, 'connection');
	const expSlugs = slugMap(selExps, 'expedition');

	// A connection links to another connection in the SAME folder → bare
	// "<slug>.md". Falls back to the plain name for anything outside the
	// selection (or non-connection).
	function connLink(ref: string): string {
		const i = ref.indexOf(':');
		const id = i < 0 ? '' : ref.slice(i + 1);
		const slug = connSlugs.get(id);
		const ent = connItems.find((e) => e.id === id);
		return slug && ent ? `[${ent.name}](${slug}.md)` : refName(ref);
	}
	// "**Within:** [Root](root.md) / [Parent](parent.md)" (relative links),
	// or '' when top-level.
	function withinLine(ref: string): string {
		const chain = breadcrumbRefs(ref, containmentGraph);
		return chain.length ? `**Within:** ${chain.map(connLink).join(' / ')}` : '';
	}
	// "**Contains:** [Child](child.md) / …" — the direct children (the reverse
	// of Within), sorted by kind then name; '' for a leaf. NPCs never contain.
	function containsLine(ref: string): string {
		const kids = connItems
			.filter((x) => x.within === ref)
			.sort((a, b) =>
				a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind < b.kind ? -1 : 1,
			);
		return kids.length
			? `**Contains:** ${kids.map((k) => connLink(refOf(k.kind, k.id))).join(' / ')}`
			: '';
	}

	// README.md index ties the bundle together, linked into each folder.
	const index: string[] = ['# Iron Ledger Export', ''];

	// Fetch every portrait's bytes up front (concurrently) so the markdown
	// builders below stay synchronous. Falls back to any legacy inline value.
	const charPortraits = new Map<string, string>();
	const commPortraits = new Map<string, string>();
	const npcPortraits = new Map<string, string>();
	const placePortraits = new Map<string, string>();
	const expPortraits = new Map<string, string>();
	async function prefetch<T extends { id: string }>(
		items: T[],
		urlFor: (it: T) => string,
		legacy: (it: T) => string,
		into: Map<string, string>,
		onOne?: (it: T) => void,
	) {
		await Promise.all(
			items.map(async (it) => {
				const url = urlFor(it);
				const du = url ? await fetchPortraitDataUrl(url) : legacy(it);
				if (du) into.set(it.id, du);
				onOne?.(it);
			}),
		);
	}
	// Progress: one step per embedded entity, plus one for the final compress.
	const mdTotal =
		selChars.length + selComms.length + selNpcs.length + selPlaces.length + selExps.length + 1;
	let mdDone = 0;
	const bump = () => onProgress?.(++mdDone, mdTotal, 'Embedding portraits…');
	onProgress?.(0, mdTotal, 'Embedding portraits…');
	await Promise.all([
		prefetch(
			selChars,
			(c) => {
				const et = (c.data as Record<string, unknown>).portraitEtag as string | undefined;
				return et ? `/api/characters/${c.id}/portrait?v=${encodeURIComponent(et)}` : '';
			},
			(c) => ((c.data as Record<string, unknown>).portrait as string) ?? '',
			charPortraits,
			() => {
				bump();
				onItem?.('char');
			},
		),
		prefetch(
			selComms,
			(c) =>
				c.portraitEtag
					? `/api/session/communities/${c.id}/portrait?v=${encodeURIComponent(c.portraitEtag)}`
					: '',
			(c) => c.imageUrl ?? '',
			commPortraits,
			() => {
				bump();
				onItem?.('comm');
			},
		),
		prefetch(
			selNpcs,
			(n) =>
				n.portraitEtag
					? `/api/session/npcs/${n.id}/portrait?v=${encodeURIComponent(n.portraitEtag)}`
					: '',
			(n) => n.imageUrl ?? '',
			npcPortraits,
			() => {
				bump();
				onItem?.('npc');
			},
		),
		prefetch(
			selPlaces,
			(p) =>
				p.portraitEtag
					? `/api/session/places/${p.id}/portrait?v=${encodeURIComponent(p.portraitEtag)}`
					: '',
			(p) => p.imageUrl ?? '',
			placePortraits,
			() => {
				bump();
				onItem?.('place');
			},
		),
		prefetch(
			selExps,
			(e) =>
				e.portraitEtag
					? `/api/session/expeditions/${e.id}/portrait?v=${encodeURIComponent(e.portraitEtag)}`
					: '',
			(e) => e.imageUrl ?? '',
			expPortraits,
			(e) => {
				bump();
				onItem?.(e.type);
			},
		),
	]);

	// ── Characters — one file each under characters/ ──────────────────
	if (selChars.length) {
		index.push('## Characters', '');
		for (const char of selChars) {
			const d = char.data as Record<string, unknown>;
			const charDu = charPortraits.get(char.id);
			const page = characterMarkdown(char.name, d, {
				portrait: charDu ? `../${addImage(charDu, 'char', char.name)}` : undefined,
				fields: fieldsMarkdown(
					characterFieldGroups(),
					d.fields as Record<string, string> | undefined,
					findCharacterField,
				),
				assets: getAssets(),
			});
			const slug = charSlugs.get(char.id) ?? slugify(char.name || 'character');
			zipFiles[`characters/${slug}.md`] = strToU8(page);
			index.push(`- [${char.name || 'Unnamed Character'}](characters/${slug}.md)`);
		}
		index.push('');
	}

	// ── Connections — one file each under connections/ ────────────────
	if (connItems.length) {
		index.push('## Connections', '');
		const writeConn = (
			id: string,
			name: string,
			kindLabel: string,
			body: (lines: string[]) => void,
		) => {
			const slug = connSlugs.get(id) ?? slugify(name || 'connection');
			const lines: string[] = [`# ${name} _(${kindLabel})_`, ''];
			body(lines);
			zipFiles[`connections/${slug}.md`] = strToU8(lines.join('\n').trimEnd() + '\n');
			index.push(`- [${name}](connections/${slug}.md)`);
		};
		if (selComms.length) {
			index.push('### Settlements');
			for (const c of selComms) {
				writeConn(c.id, c.name, 'Settlement', (lines) => {
					const commDu = commPortraits.get(c.id);
					if (commDu) lines.push(`![Portrait](../${addImage(commDu, 'settlement', c.name)})`);
					const cRef = refOf('community', c.id);
					const cWithin = withinLine(cRef);
					if (cWithin) lines.push(cWithin);
					const cContains = containsLine(cRef);
					if (cContains) lines.push(cContains);
					const cRegion = effectiveRegion(cRef, containmentGraph);
					if (cRegion) lines.push(`**Region:** ${cRegion}`);
					if (c.location) lines.push(`**Location:** ${c.location}`);
					if (c.locationDescription) lines.push(`**Description:** ${c.locationDescription}`);
					if (c.trouble) lines.push(`**Trouble:** ${c.trouble}`);
					if (c.shortDescription?.trim()) lines.push(``, `**Summary:**`, c.shortDescription.trim());
					if (c.notes?.trim()) lines.push(``, `**Notes:**`, c.notes.trim());
				});
			}
			index.push('');
		}
		if (selPlaces.length) {
			index.push('### Landmarks');
			for (const p of selPlaces) {
				writeConn(p.id, p.name, 'Landmark', (lines) => {
					const plDu = placePortraits.get(p.id);
					if (plDu) lines.push(`![Portrait](../${addImage(plDu, 'landmark', p.name)})`);
					const pRef = refOf('place', p.id);
					const pWithin = withinLine(pRef);
					if (pWithin) lines.push(pWithin);
					const pContains = containsLine(pRef);
					if (pContains) lines.push(pContains);
					const pRegion = effectiveRegion(pRef, containmentGraph);
					if (pRegion) lines.push(`**Region:** ${pRegion}`);
					if (p.location) lines.push(`**Landmark:** ${p.location}`);
					if (p.locationDescription) lines.push(`**Description:** ${p.locationDescription}`);
					if (p.shortDescription?.trim()) lines.push(``, `**Summary:**`, p.shortDescription.trim());
					if (p.notes?.trim()) lines.push(``, `**Notes:**`, p.notes.trim());
				});
			}
			index.push('');
		}
		if (selNpcs.length) {
			index.push('### NPCs');
			for (const n of selNpcs) {
				writeConn(n.id, n.name, 'NPC', (lines) => {
					const npcDu = npcPortraits.get(n.id);
					if (npcDu) lines.push(`![Portrait](../${addImage(npcDu, 'npc', n.name)})`);
					const nWithin = withinLine(refOf('npc', n.id));
					if (nWithin) lines.push(nWithin);
					if (n.role) lines.push(`**Role:** ${n.role}`);
					if (n.goal) lines.push(`**Goal:** ${n.goal}`);
					if (n.descriptor) lines.push(`**Descriptor:** ${n.descriptor}`);
					if (n.relationship)
						lines.push(
							`**Relationship:** ${n.relationship.charAt(0).toUpperCase() + n.relationship.slice(1)}`,
						);
					if (n.location) lines.push(`**Location:** ${n.location}`);
					if (n.notes?.trim()) lines.push(``, `**Notes:**`, n.notes.trim());
				});
			}
			index.push('');
		}
	}

	// ── Expeditions — one file each under expeditions/ ────────────────
	if (selExps.length) {
		index.push('## Expeditions', '');
		for (const exp of selExps) {
			const type = exp.type === 'journey' ? 'Journey' : 'Site';
			const lines: string[] = [`# ${exp.name} _(${type})_`, ''];
			const expDu = expPortraits.get(exp.id);
			if (expDu) lines.push(`![Portrait](../${addImage(expDu, 'expedition', exp.name)})`);
			if (exp.complete) lines.push(`- **Status:** Complete`);
			lines.push(
				`- **Difficulty:** ${exp.difficulty.charAt(0).toUpperCase() + exp.difficulty.slice(1)}`,
			);
			lines.push(`- **Progress:** ${formatTicks(exp.ticks)}`);
			if (exp.type === 'site') {
				if (exp.theme) lines.push(`- **Theme:** ${exp.theme}`);
				if (exp.domain) lines.push(`- **Domain:** ${exp.domain}`);
				if (exp.objective?.trim()) lines.push(`- **Objective:** ${exp.objective.trim()}`);
				if (exp.currentFeature?.trim())
					lines.push(`- **Current Feature:** ${exp.currentFeature.trim()}`);
				if (exp.currentDanger?.trim())
					lines.push(`- **Current Danger:** ${exp.currentDanger.trim()}`);
				const activeDenizens = (exp.denizens ?? [])
					.map((id) => {
						if (!id) return null;
						const def = findFoe(id);
						return def ? resolveFoeName(def) : id;
					})
					.filter(Boolean) as string[];
				if (activeDenizens.length > 0) lines.push(`- **Denizens:** ${activeDenizens.join(', ')}`);
			}
			if ('shortDescription' in exp && exp.shortDescription?.trim())
				lines.push(``, `**Summary:**`, exp.shortDescription.trim());
			if (exp.notes?.trim()) lines.push(``, `**Notes:**`, exp.notes.trim());
			const slug = expSlugs.get(exp.id) ?? slugify(exp.name || 'expedition');
			zipFiles[`expeditions/${slug}.md`] = strToU8(lines.join('\n').trimEnd() + '\n');
			index.push(`- [${exp.name}](expeditions/${slug}.md)`);
		}
		index.push('');
	}

	// ── Foes ─────────────────────────────────────────────────────────
	// Markdown only: encounters are transient (deleted session to session)
	// and are deliberately excluded from the JSON export. The
	// ExportDialog surfaces a per-foe checklist under the Foes facet;
	// `sel.foes` names which encounter ids the user opted into. An
	// empty set means "no bestiary" (nothing rendered), which is why
	// we early-out here rather than defaulting to every encounter.
	const foeSet = new Set(sel.foes);
	const selEncounters = encounters.filter((e) => foeSet.has(e.id));
	if (selEncounters.length) {
		const lines: string[] = ['# Foes', ''];
		for (const enc of selEncounters) {
			const def = findFoe(enc.foeId);
			const name = enc.customName?.trim() || (def ? resolveFoeName(def) : null) || enc.foeId;
			lines.push(`## ${name}`);
			if (enc.vanquished) lines.push(`- **Status:** Vanquished`);
			if (def?.nature) lines.push(`- **Nature:** ${def.nature}`);
			lines.push(`- **Rank:** ${FOE_RANKS[enc.effectiveRank]?.label ?? enc.effectiveRank}`);
			lines.push(`- **Quantity:** ${enc.quantity.charAt(0).toUpperCase() + enc.quantity.slice(1)}`);
			lines.push(`- **Progress:** ${formatTicks(enc.ticks)}`);
			if (enc.notes?.trim()) lines.push(``, `**Notes:**`, enc.notes.trim());
			lines.push('');
		}
		zipFiles['foes.md'] = strToU8(lines.join('\n').trimEnd());
		index.push('## Foes', '', '- [Bestiary](foes.md)', '');
	}

	// ── Campaign Maps — one file per map under maps/ ──────────────────
	// Each map file shows its background with a numbered pin per marker, and
	// a linked list of the markers → the settlement / landmark / expedition
	// each one pins. Markers on hidden layers stay out, as they're off the
	// map; a map with no background is skipped, having nothing to draw the
	// pins on. Each of those is a warning, as is a map that can't be loaded.
	if (mapSet.size) {
		const mapsLeftOut = (why: string) => onWarning?.(`The maps ${why}, so they're left out.`);
		try {
			const mapListRes = await fetch('/api/session/maps');
			if (!mapListRes.ok) {
				mapsLeftOut("couldn't be loaded");
			} else {
				const listBody = (await mapListRes.json()) as {
					maps?: Array<{ id: string; name: string }>;
				};
				const maps = (Array.isArray(listBody.maps) ? listBody.maps : []).filter((m) =>
					mapSet.has(m.id),
				);
				const mapSlugs = slugMap(maps, 'map');
				// A numbered marker's linked entity → a relative link into the right
				// folder (maps/ is one level deep, like connections/ and expeditions/);
				// an unresolved link falls back to the label + any carried name.
				const markerLine = (n: number, entityId: unknown, label: string, entityName: unknown) => {
					const ref = typeof entityId === 'string' ? entityId : '';
					const i = ref.indexOf(':');
					const kind = i > 0 ? ref.slice(0, i) : '';
					const id = i > 0 ? ref.slice(i + 1) : '';
					const text = label || (typeof entityName === 'string' ? entityName : 'Marker');
					if ((kind === 'community' || kind === 'place') && connSlugs.has(id))
						return `${n}. [${text}](../connections/${connSlugs.get(id)}.md)`;
					if ((kind === 'journey' || kind === 'site' || kind === 'scene') && expSlugs.has(id))
						return `${n}. [${text}](../expeditions/${expSlugs.get(id)}.md)`;
					const suffix = typeof entityName === 'string' && entityName ? ` — ${entityName}` : '';
					return `${n}. ${text}${suffix}`;
				};
				let written = 0;
				for (const summary of maps) {
					const detailRes = await fetch(`/api/session/maps/${summary.id}`);
					if (!detailRes.ok) {
						onWarning?.(
							`${summary.name || 'Untitled Map'}: it couldn't be loaded, so it's left out.`,
						);
						continue;
					}
					const detail = (await detailRes.json()) as {
						id: string;
						name: string;
						markers: Array<Record<string, unknown>>;
						backgroundHash: string | null;
						settings?: { aspect?: number; layers?: unknown };
					};
					const name = detail.name || 'Untitled Map';
					if (!detail.backgroundHash) {
						onWarning?.(`${name}: no background, so it's left out.`);
						continue;
					}
					const du = await fetchPortraitDataUrl(
						`/api/session/maps/${detail.id}/background?v=${encodeURIComponent(detail.backgroundHash)}`,
					);
					if (!du) {
						onWarning?.(`${name}: its background couldn't be downloaded, so it's left out.`);
						continue;
					}
					const all = Array.isArray(detail.markers) ? detail.markers : [];
					const shown = layerShownTest(cleanMapLayers(detail.settings?.layers));
					const markers = all.filter((m) => shown(m as { layer?: string }));
					const hidden = all.length - markers.length;
					if (hidden) {
						onWarning?.(
							`${name}: ${hidden} marker${hidden === 1 ? '' : 's'} on hidden layers left out.`,
						);
					}
					const slug = mapSlugs.get(detail.id) ?? slugify(name);
					const aspect =
						typeof detail.settings?.aspect === 'number' && detail.settings.aspect > 0
							? detail.settings.aspect
							: 1;
					const { cols, rows } = gridDimsForAspect(aspect);
					zipFiles[`images/map-${slug}.svg`] = strToU8(mapSvg(du, cols, rows, markers));
					const lines: string[] = [`# ${name}`, '', `![${name}](../images/map-${slug}.svg)`, ''];
					if (markers.length) {
						lines.push('## Markers', '');
						markers.forEach((mk, idx) =>
							lines.push(markerLine(idx + 1, mk.entityId, String(mk.label ?? ''), mk.entityName)),
						);
					}
					zipFiles[`maps/${slug}.md`] = strToU8(lines.join('\n').trimEnd() + '\n');
					if (!written++) index.push('## Maps', '');
					index.push(`- [${name}](maps/${slug}.md)`);
				}
				if (written) index.push('');
			}
		} catch {
			mapsLeftOut("couldn't be loaded");
		}
	}

	// ── Session Log ──────────────────────────────────────────────────
	if (sel.log) {
		zipFiles['session-log.md'] = strToU8(logToMarkdown(sessionLog.entries));
		index.push('## Session Log', '', '- [Log](session-log.md)', '');
	}

	// ── README index ──────────────────────────────────────────────────
	zipFiles['README.md'] = strToU8(index.join('\n').trimEnd() + '\n');

	onProgress?.(mdTotal, mdTotal, 'Compressing…');
	await tick();

	// ── ZIP & download ───────────────────────────────────────────────
	const zip = zipSync(zipFiles, { level: 6 });
	const blob = new Blob([zip], { type: 'application/zip' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = `ironledger-export-${stamp}.zip`;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}

// Build an export-ready character copy with its portrait re-embedded inline
// (data.portrait) so the JSON stays self-contained. portraitEtag is dropped
// from the exported copy — import re-derives it when it stores the bytes.
export async function embedCharForExport(c: CharacterFull): Promise<{
	name: string;
	data: Record<string, unknown>;
}> {
	const data = $state.snapshot(c.data) as Record<string, unknown>;
	const et = data.portraitEtag as string | undefined;
	if (et) {
		const du = await fetchPortraitDataUrl(
			`/api/characters/${c.id}/portrait?v=${encodeURIComponent(et)}`,
		);
		if (du) data.portrait = du;
	}
	delete data.portraitEtag;
	return { name: c.name, data };
}

// Same for a session-collection entity — re-embeds into imageUrl.
export async function embedEntityForExport<
	T extends { id: string; portraitEtag?: string; imageUrl?: string },
>(seg: string, e: T): Promise<T> {
	const out = $state.snapshot(e) as T;
	if (out.portraitEtag) {
		const du = await fetchPortraitDataUrl(
			`/api/session/${seg}/${out.id}/portrait?v=${encodeURIComponent(out.portraitEtag)}`,
		);
		if (du) out.imageUrl = du;
	}
	delete out.portraitEtag;
	// The containment parent is exported BY NAME + KIND (ids are minted
	// per-user, so a raw id never re-links on another ledger). Resolve the
	// within ref — or a Place's legacy withinSettlementId — to a portable
	// {kind, name}; import re-links it to a fresh `within` id. A nested
	// settlement/landmark's region is flattened to the tree ROOT's region so
	// the export reads correctly (a nested node's own region is ignored at
	// runtime), matching the in-app inheritance.
	const rec = out as unknown as Record<string, unknown>;
	const withinStr = entityWithin(rec as { within?: string; withinSettlementId?: string });
	const parsed = withinStr ? splitRef(withinStr) : null;
	const parentName = withinStr ? refName(withinStr) : '';
	if (parsed && parentName) rec.withinRef = { kind: parsed.kind, name: parentName };
	delete rec.within;
	delete rec.withinSettlementId;
	delete rec.withinSettlementName;
	if (seg === 'communities' || seg === 'places') {
		const kind = seg === 'communities' ? 'community' : 'place';
		const er = effectiveRegion(refOf(kind, out.id), liveContainmentGraph());
		if (er !== undefined) (rec as { region?: string }).region = er;
	}
	return out;
}

/** Resolve a map owner's (kind, id) to the owning entity's current name,
 *  or undefined if it no longer exists. `journey`/`site` both live in the
 *  expeditions store; `npc` is never a map owner. */
function mapOwnerName(kind: MapOwnerKind, id: string): string | undefined {
	if (kind === 'community') return getCommunities().find((c) => c.id === id)?.name || undefined;
	if (kind === 'place') return getPlaces().find((p) => p.id === id)?.name || undefined;
	return getExpeditions().find((e) => e.id === id)?.name || undefined; // journey | site
}

/** Fetch every map the user owns and build its zip entries under
 *  `maps/<mapId>/…` (manifest.json + map.json + optional background.jpg),
 *  plus a `maps.md` index. Shared by the "All Maps" export and the
 *  Everything bundle, which nests the same dirs alongside its JSON body so
 *  a full backup captures maps + markers + backgrounds. */
export async function collectMapEntries(mapIdFilter?: Set<string>): Promise<{
	mapFiles: Record<string, Uint8Array>;
	count: number;
	mdLines: string[];
}> {
	const mapFiles: Record<string, Uint8Array> = {};
	const mdLines: string[] = ['# Campaign Maps', ''];
	const listRes = await fetch('/api/session/maps');
	if (!listRes.ok) return { mapFiles, count: 0, mdLines };
	const listBody = (await listRes.json()) as {
		maps?: Array<{ id: string; name: string; updatedAt: string }>;
	};
	let mapsList = Array.isArray(listBody.maps) ? listBody.maps : [];
	// Restrict to the selected maps when the caller passes an id filter
	// (the comprehensive export's per-map selection); undefined = all maps.
	if (mapIdFilter) mapsList = mapsList.filter((m) => mapIdFilter.has(m.id));
	for (const summary of mapsList) {
		const detailRes = await fetch(`/api/session/maps/${summary.id}`);
		if (!detailRes.ok) continue;
		const detail = (await detailRes.json()) as {
			id: string;
			name: string;
			markers: Array<Record<string, unknown>>;
			backgroundHash: string | null;
			settings: Record<string, unknown>;
			ownerKind: MapOwnerKind | null;
			ownerId: string | null;
		};
		const bgUrl = detail.backgroundHash
			? `/api/session/maps/${detail.id}/background?v=${encodeURIComponent(detail.backgroundHash)}`
			: '';
		// Resolve the owner entity's NAME so import can re-link across id
		// regeneration (ids are minted fresh on the importing account).
		const ownerName =
			detail.ownerKind && detail.ownerId
				? mapOwnerName(detail.ownerKind, detail.ownerId)
				: undefined;
		// Stamp each linked marker with its entity's NAME so the importer can
		// re-resolve the link across id regeneration (the raw entityId uuid is
		// meaningless on another account / after a merge). Mirrors ownerName.
		const markersWithNames = detail.markers.map((m) => {
			const entityId = (m as { entityId?: string }).entityId;
			const ent = entityId ? resolveEntity(entityId) : null;
			return ent ? { ...m, entityName: ent.name } : m;
		});
		const entries = await buildMapZipEntries({
			name: detail.name,
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			markers: markersWithNames as any,
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			settings: detail.settings as any,
			backgroundUrl: bgUrl,
			ownerKind: detail.ownerKind,
			ownerName,
		});
		const dir = `maps/${detail.id}`;
		for (const [path, bytes] of Object.entries(entries)) {
			mapFiles[`${dir}/${path}`] = bytes;
		}
		mdLines.push(`## ${detail.name || 'Untitled Map'}`);
		mdLines.push(`- Markers: ${Array.isArray(detail.markers) ? detail.markers.length : 0}`);
		mdLines.push(`- [Data](./${dir}/map.json)`);
		if (entries['background.jpg']) {
			mdLines.push(`- ![Background](./${dir}/background.jpg)`);
		}
		mdLines.push('');
	}
	return { mapFiles, count: mapsList.length, mdLines };
}
