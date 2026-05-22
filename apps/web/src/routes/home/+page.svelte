<script lang="ts">
	/**
	 * /home — deck-of-cards UI.
	 *
	 * Desktop: three-column grid.
	 *   ┌────────────────┬────────────────┬──────────┐
	 *   │   Characters   │   Expeditions  │          │
	 *   ├────────────────┼────────────────┤   Log    │
	 *   │     Foes       │  Connections   │          │
	 *   └────────────────┴────────────────┴──────────┘
	 *
	 * Mobile (≤900px): tab bar + active area + vertical resize + log.
	 *   ┌─────────────────────────────┐
	 *   │ [Chars][Foes][Exp][Comm]    │  ← tab bar
	 *   ├─────────────────────────────┤
	 *   │   active area (scrollable)  │
	 *   ├─────────────────────────────┤
	 *   │   ─── drag handle ──────── │
	 *   ├─────────────────────────────┤
	 *   │   log (scrollable)          │
	 *   └─────────────────────────────┘
	 */
	import { onMount } from 'svelte';
	import type { CharacterFull } from '$lib/api.js';
	import type { Community, Npc, Expedition } from '$lib/types.js';
	import {
		loadCharacters, getCharacters,
		createCharacter,
	} from '$lib/characterStore.svelte.js';
	import { loadEncounters, getEncounters, addEncounter } from '$lib/encounterStore.svelte.js';
	import { loadExpeditions, getExpeditions, addExpedition } from '$lib/expeditionStore.svelte.js';
	import { loadCommunities, getCommunities, addCommunity } from '$lib/communityStore.svelte.js';
	import { loadNpcs, getNpcs, addNpc } from '$lib/npcStore.svelte.js';
	import { loadAssets, getAssets } from '$lib/assetStore.svelte.js';
	import { loadFoes, findFoe, FOE_RANKS } from '$lib/foeStore.svelte.js';
	import LogPanel             from '$lib/components/LogPanel.svelte';
	import CharactersArea       from '$lib/components/v2/CharactersArea.svelte';
	import FoesArea             from '$lib/components/v2/FoesArea.svelte';
	import ExpeditionsArea      from '$lib/components/v2/ExpeditionsArea.svelte';
	import CommunitiesArea      from '$lib/components/v2/CommunitiesArea.svelte';
	import ConfirmDialog        from '$lib/components/ConfirmDialog.svelte';
	import ErrorBar             from '$lib/components/ErrorBar.svelte';
	import { getActiveDiceCtx } from '$lib/diceContext.svelte.js';
	import { getActiveFoeId, getActiveExpeditionId } from '$lib/activeContext.svelte.js';
	import { triggerAction, appendLog, logs, SESSION_LOG_ID } from '$lib/log.svelte.js';
	import { parseImportJson, sanitizeLogHtml, ImportError } from '$lib/importSanitizer.js';
	import { zipSync, strToU8 } from 'fflate';
	import charactersIconSvg    from '$icons/Characters.svg?raw';
	import foesIconSvg          from '$icons/Foes.svg?raw';
	import expeditionsIconSvg   from '$icons/Expeditions.svg?raw';
	import villageIconSvg       from '$icons/village.svg?raw';

	const LOG_WIDTH_KEY      = 'il:home:logWidth';
	const MIN_LOG            = 240;
	const MAX_LOG            = 800;
	const MOB_LOG_HEIGHT_KEY  = 'il:home:mobLogHeight';
	const MIN_MOB_LOG         = 80;
	const MAX_MOB_LOG_FRAC    = 0.70;
	const COL1_WIDTH_KEY      = 'il:home:col1Width';
	const CHAR_HEIGHT_KEY     = 'il:home:charHeight';
	const EXPED_HEIGHT_KEY    = 'il:home:expedHeight';
	const MIN_COL             = 200;
	const MIN_AREA            = 80;

	/** Desktop: log column width in px. */
	let logWidth = $state(0);
	let dragging = $state(false);
	let shellEl  = $state<HTMLDivElement | null>(null);

	/** Mobile state. */
	type MobileTab = 'characters' | 'foes' | 'expeditions' | 'communities';
	let mobileTab    = $state<MobileTab>('characters');
	let mobLogHeight = $state(200);   // px; updated in onMount from saved pref / viewport
	let mobDragging  = $state(false);
	let isMobile      = $state(false);
	let col1Width     = $state<number | null>(null);
	let charHeight    = $state<number | null>(null);
	let expedHeight   = $state<number | null>(null);
	let colDragging   = $state(false);
	let charDragging  = $state(false);
	let expedDragging = $state(false);
	let charFoeColEl  = $state<HTMLDivElement | null>(null);
	let expCommColEl  = $state<HTMLDivElement | null>(null);

	/** Ref to ExpeditionsArea — forwards log link actions. */
	let expAreaRef = $state<{
		openChangeThemeForExp(expId: string):  void;
		openChangeDomainForExp(expId: string): void;
		applyProgress(marks: number): void;
	} | null>(null);

	/** Ref to FoesArea — forwards vanquish / menace from log links. */
	let foeAreaRef = $state<{
		selectFoe(id: string): void;
		vanquishActiveFoe():   void;
		applyMenace(value: number): void;
	} | null>(null);

	/** Active dice context — provides charId + data for LogPanel's link handlers. */
	const activeDiceCtx = $derived(getActiveDiceCtx());

	/** Store snapshots used by import/export. */
	const chars        = $derived(getCharacters());
	const encounters   = $derived(getEncounters());
	const expeditions  = $derived(getExpeditions());
	const communities  = $derived(getCommunities());
	const npcs         = $derived(getNpcs());
	const activeCharId = $derived(activeDiceCtx?.charId ?? '');
	const activeFoeId  = $derived(getActiveFoeId());
	const activeExpeditionId = $derived(getActiveExpeditionId());

	/** Import UI state. */
	let importInput      = $state<HTMLInputElement | null>(null);
	let importConfirmRef = $state<{ open(): void; close(): void } | null>(null);
	let importError      = $state('');

	/** Track mobile breakpoint reactively. */
	$effect(() => {
		const mq = window.matchMedia('(max-width: 900px)');
		isMobile = mq.matches;
		const handler = (ev: MediaQueryListEvent) => { isMobile = ev.matches; };
		mq.addEventListener('change', handler);
		return () => mq.removeEventListener('change', handler);
	});

	onMount(() => {
		// Desktop log width
		const saved = Number(localStorage.getItem(LOG_WIDTH_KEY));
		if (Number.isFinite(saved) && saved >= MIN_LOG && saved <= MAX_LOG) {
			logWidth = saved;
		} else {
			logWidth = Math.max(MIN_LOG, Math.min(MAX_LOG, Math.round(window.innerWidth / 3)));
		}

		// Mobile log height
		const savedMob = Number(localStorage.getItem(MOB_LOG_HEIGHT_KEY));
		if (Number.isFinite(savedMob) && savedMob >= MIN_MOB_LOG) {
			mobLogHeight = savedMob;
		} else {
			mobLogHeight = Math.round(window.innerHeight * 0.25);
		}

		// Desktop column split (col1 pixel width)
		const savedCol1 = Number(localStorage.getItem(COL1_WIDTH_KEY));
		// Available width = shell width minus padding (20px) minus log minus two 6px handles
		const shellW   = shellEl?.offsetWidth ?? window.innerWidth;
		const availW   = shellW - 20 - logWidth - 12;
		if (Number.isFinite(savedCol1) && savedCol1 >= MIN_COL && savedCol1 <= availW - MIN_COL) {
			col1Width = savedCol1;
		} else {
			col1Width = Math.max(MIN_COL, Math.round(availW / 2));
		}

		// Desktop row splits (chars/foes and expeditions/communities)
		const savedChar  = Number(localStorage.getItem(CHAR_HEIGHT_KEY));
		const savedExped = Number(localStorage.getItem(EXPED_HEIGHT_KEY));
		// Read the actual col heights while the grid is still at 1fr/1fr fallback
		const charFoeH = charFoeColEl?.offsetHeight ?? Math.round(window.innerHeight * 0.8);
		const expCommH = expCommColEl?.offsetHeight ?? charFoeH;
		if (Number.isFinite(savedChar) && savedChar >= MIN_AREA && savedChar <= charFoeH - 6 - MIN_AREA) {
			charHeight = savedChar;
		} else {
			charHeight = Math.max(MIN_AREA, Math.round((charFoeH - 6) / 2));
		}
		if (Number.isFinite(savedExped) && savedExped >= MIN_AREA && savedExped <= expCommH - 6 - MIN_AREA) {
			expedHeight = savedExped;
		} else {
			expedHeight = Math.max(MIN_AREA, Math.round((expCommH - 6) / 2));
		}

		// Fire-and-forget — stores update reactively when each resolves
		Promise.all([
			loadAssets(),
			loadFoes(),
			loadCharacters(),
			loadEncounters(),
			loadExpeditions(),
			loadCommunities(),
			loadNpcs(),
		]);

		document.addEventListener('il-menu-action', handleMenuAction);
		return () => document.removeEventListener('il-menu-action', handleMenuAction);
	});

	/** Desktop horizontal resize (log width). */
	function startResize(e: MouseEvent) {
		e.preventDefault();
		dragging = true;
		const startX     = e.clientX;
		const startWidth = logWidth;

		const onMove = (ev: MouseEvent) => {
			const delta = startX - ev.clientX;
			const next  = Math.max(MIN_LOG, Math.min(MAX_LOG, startWidth + delta));
			logWidth = next;
		};
		const onUp = () => {
			dragging = false;
			window.removeEventListener('mousemove', onMove);
			window.removeEventListener('mouseup',   onUp);
			localStorage.setItem(LOG_WIDTH_KEY, String(logWidth));
		};
		window.addEventListener('mousemove', onMove);
		window.addEventListener('mouseup',   onUp);
	}

	/** Mobile vertical resize (log height). */
	function startMobResize(e: MouseEvent | TouchEvent) {
		e.preventDefault();
		mobDragging = true;
		const startY = 'touches' in e ? e.touches[0].clientY : e.clientY;
		const startH = mobLogHeight;

		const onMove = (ev: MouseEvent | TouchEvent) => {
			const y     = 'touches' in ev ? ev.touches[0].clientY : ev.clientY;
			const delta = startY - y;   // drag up → taller log
			const maxH  = Math.round(window.innerHeight * MAX_MOB_LOG_FRAC);
			const next  = Math.max(MIN_MOB_LOG, Math.min(maxH, startH + delta));
			mobLogHeight = next;
		};
		const onUp = () => {
			mobDragging = false;
			window.removeEventListener('mousemove', onMove as EventListener);
			window.removeEventListener('mouseup',   onUp);
			window.removeEventListener('touchmove', onMove as EventListener);
			window.removeEventListener('touchend',  onUp);
			localStorage.setItem(MOB_LOG_HEIGHT_KEY, String(mobLogHeight));
		};
		window.addEventListener('mousemove', onMove as EventListener);
		window.addEventListener('mouseup',   onUp);
		window.addEventListener('touchmove', onMove as EventListener, { passive: false });
		window.addEventListener('touchend',  onUp);
	}

	/** Desktop column split (between chars/foes and expeditions/communities). */
	function startColResize(e: MouseEvent) {
		e.preventDefault();
		colDragging = true;
		const startX = e.clientX;
		const startW = col1Width ?? 0;

		const onMove = (ev: MouseEvent) => {
			const shellW = shellEl?.offsetWidth ?? window.innerWidth;
			const maxW   = shellW - 20 - logWidth - 12 - MIN_COL;
			const next   = Math.max(MIN_COL, Math.min(maxW, startW + (ev.clientX - startX)));
			col1Width = next;
		};
		const onUp = () => {
			colDragging = false;
			window.removeEventListener('mousemove', onMove);
			window.removeEventListener('mouseup',   onUp);
			if (col1Width !== null) localStorage.setItem(COL1_WIDTH_KEY, String(col1Width));
		};
		window.addEventListener('mousemove', onMove);
		window.addEventListener('mouseup',   onUp);
	}

	/** Desktop row split — chars / foes within the left column. */
	function startCharResize(e: MouseEvent) {
		e.preventDefault();
		charDragging = true;
		const startY = e.clientY;
		const startH = charHeight ?? 0;

		const onMove = (ev: MouseEvent) => {
			const colH = charFoeColEl?.offsetHeight ?? 600;
			const maxH = colH - 6 - MIN_AREA;
			const next = Math.max(MIN_AREA, Math.min(maxH, startH + (ev.clientY - startY)));
			charHeight = next;
		};
		const onUp = () => {
			charDragging = false;
			window.removeEventListener('mousemove', onMove);
			window.removeEventListener('mouseup',   onUp);
			if (charHeight !== null) localStorage.setItem(CHAR_HEIGHT_KEY, String(charHeight));
		};
		window.addEventListener('mousemove', onMove);
		window.addEventListener('mouseup',   onUp);
	}

	/** Desktop row split — expeditions / communities within the right column. */
	function startExpedResize(e: MouseEvent) {
		e.preventDefault();
		expedDragging = true;
		const startY = e.clientY;
		const startH = expedHeight ?? 0;

		const onMove = (ev: MouseEvent) => {
			const colH = expCommColEl?.offsetHeight ?? 600;
			const maxH = colH - 6 - MIN_AREA;
			const next = Math.max(MIN_AREA, Math.min(maxH, startH + (ev.clientY - startY)));
			expedHeight = next;
		};
		const onUp = () => {
			expedDragging = false;
			window.removeEventListener('mousemove', onMove);
			window.removeEventListener('mouseup',   onUp);
			if (expedHeight !== null) localStorage.setItem(EXPED_HEIGHT_KEY, String(expedHeight));
		};
		window.addEventListener('mousemove', onMove);
		window.addEventListener('mouseup',   onUp);
	}

	// ── Menu action handler ──────────────────────────────────────────────────
	function handleMenuAction(e: Event) {
		const detail = (e as CustomEvent).detail as { action: string; content?: string; format?: string };
		if (detail.action === 'import') {
			importConfirmRef?.open();
		} else if (detail.action === 'export' && detail.content && detail.format) {
			handleExport(detail.content, detail.format);
		}
	}

	// ── Import ───────────────────────────────────────────────────────────────
	async function onImportFile(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;
		importError = '';
		try {
			const text   = await file.text();
			const parsed = parseImportJson(text) as Record<string, unknown>;

			function appendSafeLog(entry: { title?: string; html?: string; note?: string; source?: string; roll?: unknown }) {
				appendLog(
					SESSION_LOG_ID,
					String(entry.title ?? ''),
					sanitizeLogHtml(String(entry.html ?? '')),
					undefined,
					entry.source as string | undefined,
					entry.roll as import('$lib/log.svelte.js').LogEntry['roll'],
				);
			}

			if (parsed.manifest && parsed.data) {
				const m = parsed.manifest as { type: string };
				if (m.type === 'character') {
					const entry = parsed.data as { name?: string; data?: Record<string, unknown> };
					await createCharacter(entry.name ?? 'Imported Character', entry.data ?? {});
				} else if (m.type === 'all-characters') {
					const entries = parsed.data as Array<{ name?: string; data?: Record<string, unknown> }>;
					for (const entry of entries) await createCharacter(entry.name ?? 'Imported Character', entry.data ?? {});
				} else if (m.type === 'log') {
					const entries = parsed.data as Array<Record<string, unknown>>;
					for (const entry of entries) appendSafeLog(entry);
				} else if (m.type === 'communities') {
					const d = parsed.data as { communities?: Community[]; npcs?: Npc[] };
					for (const c of d.communities ?? []) await addCommunity(c);
					for (const n of d.npcs ?? [])        await addNpc(n);
				} else if (m.type === 'foes') {
					const entries = parsed.data as import('$lib/types.js').FoeEncounter[];
					for (const enc of entries) await addEncounter(enc);
				} else if (m.type === 'expeditions') {
					const entries = parsed.data as Expedition[];
					for (const exp of entries) await addExpedition(exp);
				} else if (m.type === 'everything') {
					const d = parsed.data as {
						characters?:  Array<{ name?: string; data?: Record<string, unknown> }>;
						log?:         Array<Record<string, unknown>>;
						communities?: Community[];
						npcs?:        Npc[];
						foes?:        import('$lib/types.js').FoeEncounter[];
						expeditions?: Expedition[];
					};
					for (const entry of d.characters ?? []) await createCharacter(entry.name ?? 'Imported Character', entry.data ?? {});
					for (const entry of d.log ?? [])        appendSafeLog(entry);
					for (const c of d.communities ?? [])    await addCommunity(c);
					for (const n of d.npcs ?? [])           await addNpc(n);
					for (const enc of d.foes ?? [])         await addEncounter(enc);
					for (const exp of d.expeditions ?? [])  await addExpedition(exp);
				}
			} else {
				const entry = parsed as { name?: string; data?: Record<string, unknown> };
				await createCharacter(entry.name ?? 'Imported Character', entry.data ?? {});
			}
		} catch (err) {
			importError = err instanceof ImportError
				? err.message
				: 'Could not import. Make sure the file is a valid Iron Ledger JSON export.';
		} finally {
			if (importInput) importInput.value = '';
		}
	}

	// ── Export helpers ────────────────────────────────────────────────────────
	function makeTimestamp(): string {
		const now = new Date();
		return `${now.getFullYear()}-`
			+ String(now.getMonth() + 1).padStart(2, '0') + '-'
			+ String(now.getDate()).padStart(2, '0') + '_'
			+ String(now.getHours()).padStart(2, '0')
			+ String(now.getMinutes()).padStart(2, '0');
	}

	function downloadFile(filename: string, content: string, mime: string) {
		const blob = new Blob([content], { type: mime });
		const url  = URL.createObjectURL(blob);
		const a    = document.createElement('a');
		a.href     = url;
		a.download = filename;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	}

	function exportJson(type: string, payload: unknown, count: number, filename: string) {
		const wrapper = {
			manifest: { app: 'Iron Ledger', version: '1.0.0', exportedAt: new Date().toISOString(), type, count },
			data: payload,
		};
		downloadFile(filename, JSON.stringify(wrapper, null, 2), 'application/json');
	}

	function b64ToU8(dataUrl: string): Uint8Array {
		const b64    = dataUrl.split(',')[1] ?? '';
		const binary = atob(b64);
		const bytes  = new Uint8Array(binary.length);
		for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
		return bytes;
	}

	function slugify(name: string): string {
		return (name || 'unnamed').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
	}

	function exportMarkdownZip(stamp: string) {
		const zipFiles: Record<string, Uint8Array> = {};
		const usedNames = new Set<string>();

		function addImage(dataUrl: string, prefix: string, name: string): string {
			let base = `images/${prefix}-${slugify(name)}`;
			let path = `${base}.jpg`;
			let i = 2;
			while (usedNames.has(path)) { path = `${base}-${i++}.jpg`; }
			usedNames.add(path);
			zipFiles[path] = b64ToU8(dataUrl);
			return `./${path}`;
		}

		// ── Characters ──────────────────────────────────────────────────
		if (chars.length) {
			const lines: string[] = [];
			chars.forEach((char, idx) => {
				if (idx > 0) lines.push('', '---', '');
				const d = char.data as Record<string, unknown>;
				lines.push(`# ${char.name || 'Unnamed Character'}`, '');
				if (d.portrait) {
					const src = addImage(d.portrait as string, 'char', char.name);
					lines.push(`![Portrait](${src})`, '');
				}
				if (d.background)  lines.push(`**Background:** ${d.background}`, '');
				const initiativeLabels: Record<number, string> = { 0: 'None', 1: 'You have initiative', 2: 'Foe has initiative' };
				const init = d.initiative as number | undefined;
				if (init !== undefined && init !== null) lines.push(`**Initiative:** ${initiativeLabels[init] ?? init}`, '');
				lines.push('## Stats', `| Edge | Heart | Iron | Shadow | Wits |`, `|------|-------|------|--------|------|`,
					`| ${d.edge ?? 0} | ${d.heart ?? 0} | ${d.iron ?? 0} | ${d.shadow ?? 0} | ${d.wits ?? 0} |`, '');
				lines.push('## Resources',
					`- **Health:** ${d.health ?? 0}/5`, `- **Spirit:** ${d.spirit ?? 0}/5`,
					`- **Supply:** ${d.supply ?? 0}/5`, `- **Momentum:** ${d.momentum ?? 0}`, '');
				const gv = d.globalValues as Record<string, string> | undefined;
				if (gv && Object.keys(gv).length > 0) {
					lines.push('## Counters');
					Object.entries(gv).forEach(([k, v]) => lines.push(`- **${k.charAt(0).toUpperCase() + k.slice(1)}:** ${v}`));
					lines.push('');
				}
				lines.push('## Progress', `- **XP:** ${d.xp ?? 0}`,
					`- **Bonds:** ${formatTicks(Number(d.bonds ?? 0))}`,
					`- **Failures:** ${formatTicks(Number(d.failures ?? 0))}`, '');
				const debilities = ['wounded','unprepared','shaken','encumbered','maimed','corrupted','cursed','tormented'];
				const active = debilities.filter(k => d[k]);
				if (active.length) {
					lines.push('## Debilities');
					active.forEach(k => lines.push(`- ${k.charAt(0).toUpperCase() + k.slice(1)}`));
					lines.push('');
				}
				const vows = d.vows as Array<{ name: string; difficulty: string; ticks: number; threat?: string; menace?: number; notes?: string }> | undefined;
				if (vows?.length) {
					lines.push('## Vows');
					vows.forEach(v => {
						lines.push(`- **${v.name}** (${v.difficulty}) — ${formatTicks(v.ticks)}`);
						if (v.threat?.trim())  lines.push(`  - Threat: ${v.threat.trim()}`);
						if (v.menace)          lines.push(`  - Menace: ${v.menace}/10`);
						if (v.notes?.trim())   lines.push(`  - Notes: ${v.notes.trim()}`);
					});
					lines.push('');
				}
				const assets = d.assets as Array<{ assetId: string; abilities: boolean[] }> | undefined;
				if (assets?.length) {
					lines.push('## Assets');
					const catalogue = getAssets();
					assets.forEach(a => {
						const def = catalogue.find(x => x.id === a.assetId);
						lines.push(`- **${def?.name ?? a.assetId}** (${def?.category ?? '?'}) — ${a.abilities.filter(Boolean).length}/${a.abilities.length} abilities`);
					});
				}
			});
			zipFiles['characters.md'] = strToU8(lines.join('\n'));
		}

		// ── Connections & NPCs ───────────────────────────────────────────
		if (communities.length || npcs.length) {
			const lines: string[] = ['# Connections & NPCs', ''];
			for (const c of communities) {
				lines.push(`## ${c.name} _(Community)_`);
				if (c.imageUrl) {
					const src = addImage(c.imageUrl, 'community', c.name);
					lines.push(`![Portrait](${src})`);
				}
				if (c.region)              lines.push(`**Region:** ${c.region}`);
				if (c.location)            lines.push(`**Location:** ${c.location}`);
				if (c.locationDescription) lines.push(`**Description:** ${c.locationDescription}`);
				if (c.trouble)             lines.push(`**Trouble:** ${c.trouble}`);
				if (c.notes?.trim())       lines.push(``, `**Notes:**`, c.notes.trim());
				lines.push('');
			}
			for (const n of npcs) {
				lines.push(`## ${n.name} _(NPC)_`);
				if (n.imageUrl) {
					const src = addImage(n.imageUrl, 'npc', n.name);
					lines.push(`![Portrait](${src})`);
				}
				if (n.role)          lines.push(`**Role:** ${n.role}`);
				if (n.goal)          lines.push(`**Goal:** ${n.goal}`);
				if (n.descriptor)    lines.push(`**Descriptor:** ${n.descriptor}`);
				if (n.relationship)  lines.push(`**Relationship:** ${n.relationship.charAt(0).toUpperCase() + n.relationship.slice(1)}`);
				if (n.location)      lines.push(`**Location:** ${n.location}`);
				if (n.notes?.trim()) lines.push(``, `**Notes:**`, n.notes.trim());
				lines.push('');
			}
			zipFiles['connections.md'] = strToU8(lines.join('\n').trimEnd());
		}

		// ── Expeditions ──────────────────────────────────────────────────
		if (expeditions.length) {
			const lines: string[] = ['# Expeditions', ''];
			for (const exp of expeditions) {
				const type = exp.type === 'journey' ? 'Journey' : 'Site';
				lines.push(`## ${exp.name} _(${type})_`);
				if (exp.imageUrl) {
					const src = addImage(exp.imageUrl, 'expedition', exp.name);
					lines.push(`![Portrait](${src})`);
				}
				if (exp.complete) lines.push(`- **Status:** Complete`);
				lines.push(`- **Difficulty:** ${exp.difficulty.charAt(0).toUpperCase() + exp.difficulty.slice(1)}`);
				lines.push(`- **Progress:** ${formatTicks(exp.ticks)}`);
				if (exp.type === 'site') {
					if (exp.theme)                 lines.push(`- **Theme:** ${exp.theme}`);
					if (exp.domain)                lines.push(`- **Domain:** ${exp.domain}`);
					if (exp.objective?.trim())      lines.push(`- **Objective:** ${exp.objective.trim()}`);
					if (exp.currentFeature?.trim()) lines.push(`- **Current Feature:** ${exp.currentFeature.trim()}`);
					if (exp.currentDanger?.trim())  lines.push(`- **Current Danger:** ${exp.currentDanger.trim()}`);
					const activeDenizens = (exp.denizens ?? []).map(id => id ? (findFoe(id)?.name ?? id) : null).filter(Boolean) as string[];
					if (activeDenizens.length > 0)  lines.push(`- **Denizens:** ${activeDenizens.join(', ')}`);
				}
				if (exp.notes?.trim()) lines.push(``, `**Notes:**`, exp.notes.trim());
				lines.push('');
			}
			zipFiles['expeditions.md'] = strToU8(lines.join('\n').trimEnd());
		}

		// ── Foes ─────────────────────────────────────────────────────────
		if (encounters.length) {
			const lines: string[] = ['# Foes', ''];
			for (const enc of encounters) {
				const def  = findFoe(enc.foeId);
				const name = enc.customName || def?.name || enc.foeId;
				lines.push(`## ${name}${enc.vanquished ? ' _(Vanquished)_' : ''}`);
				lines.push(`- **Rank:** ${FOE_RANKS[enc.effectiveRank]?.label ?? enc.effectiveRank}`);
				lines.push(`- **Quantity:** ${enc.quantity.charAt(0).toUpperCase() + enc.quantity.slice(1)}`);
				lines.push(`- **Progress:** ${formatTicks(enc.ticks)}`);
				if (enc.currentHarm    !== undefined) lines.push(`- **Escalating Harm:** ${enc.currentHarm}`);
				if (enc.currentDefense !== undefined) lines.push(`- **Defense Shield:** ${enc.currentDefense}`);
				if (enc.notes?.trim()) lines.push(`- **Notes:** ${enc.notes.trim()}`);
				lines.push('');
			}
			zipFiles['foes.md'] = strToU8(lines.join('\n').trimEnd());
		}

		// ── Session Log ──────────────────────────────────────────────────
		zipFiles['session-log.md'] = strToU8(logToMarkdown());

		// ── ZIP & download ───────────────────────────────────────────────
		const zip  = zipSync(zipFiles, { level: 6 });
		const blob = new Blob([zip], { type: 'application/zip' });
		const url  = URL.createObjectURL(blob);
		const a    = document.createElement('a');
		a.href     = url;
		a.download = `ironledger-export-${stamp}.zip`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
	}

	function htmlToMd(html: string): string {
		if (typeof document === 'undefined') return html;
		const tmp = document.createElement('div');
		tmp.innerHTML = html;
		const lines: string[] = [''];
		function walk(node: Node) {
			if (node.nodeType === Node.TEXT_NODE) {
				const t = (node.textContent ?? '').replace(/\n/g, ' ');
				if (t.trim()) lines[lines.length - 1] = (lines[lines.length - 1] ?? '') + t;
			} else if (node.nodeType === Node.ELEMENT_NODE) {
				const el  = node as HTMLElement;
				const tag = el.tagName.toLowerCase();
				if (tag === 'ul' || tag === 'ol') {
					el.querySelectorAll('li').forEach((li) => lines.push(`- ${li.textContent?.trim() ?? ''}`));
				} else if (tag === 'li') { /* handled by parent */ }
				else if (tag === 'br') { lines.push(''); }
				else {
					const block = ['div', 'p', 'h1', 'h2', 'h3', 'h4'].includes(tag);
					if (block && lines.length > 0) lines.push('');
					let inline = '';
					el.childNodes.forEach((child) => {
						if (child.nodeType === Node.TEXT_NODE) inline += child.textContent ?? '';
						else if (child.nodeType === Node.ELEMENT_NODE) {
							const ct = (child as HTMLElement).tagName.toLowerCase();
							const inner = (child as HTMLElement).textContent ?? '';
							if (ct === 'strong' || ct === 'b') inline += `**${inner}**`;
							else if (ct === 'em' || ct === 'i') inline += `_${inner}_`;
							else if (ct === 's') inline += `~~${inner}~~`;
							else inline += inner;
						}
					});
					const text = inline.trim();
					if (text) lines.push(text);
				}
			}
		}
		tmp.childNodes.forEach((n) => walk(n));
		return lines.filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n').trim();
	}

	function formatTicks(ticks: number, totalBoxes = 10): string {
		const boxes = Math.floor(ticks / 4);
		const rem   = ticks % 4;
		return rem > 0 ? `${boxes}/${totalBoxes} boxes, ${rem}/4 ticks` : `${boxes}/${totalBoxes} boxes`;
	}

	function charToMarkdown(char: CharacterFull): string {
		const d = char.data as Record<string, unknown>;
		const lines: string[] = [`# ${char.name || 'Unnamed Character'}`, ''];
		if (d.portrait)    lines.push(`_Has portrait photo — see JSON export for image data._`, '');
		if (d.background)  lines.push(`**Background:** ${d.background}`, '');
		const initiativeLabels: Record<number, string> = { 0: 'None', 1: 'You have initiative', 2: 'Foe has initiative' };
		const init = d.initiative as number | undefined;
		if (init !== undefined && init !== null) lines.push(`**Initiative:** ${initiativeLabels[init] ?? init}`, '');
		lines.push('## Stats', `| Edge | Heart | Iron | Shadow | Wits |`, `|------|-------|------|--------|------|`,
			`| ${d.edge ?? 0} | ${d.heart ?? 0} | ${d.iron ?? 0} | ${d.shadow ?? 0} | ${d.wits ?? 0} |`, '');
		lines.push('## Resources',
			`- **Health:** ${d.health ?? 0}/5`, `- **Spirit:** ${d.spirit ?? 0}/5`,
			`- **Supply:** ${d.supply ?? 0}/5`, `- **Momentum:** ${d.momentum ?? 0}`, '');
		const gv = d.globalValues as Record<string, string> | undefined;
		if (gv && Object.keys(gv).length > 0) {
			lines.push('## Counters');
			Object.entries(gv).forEach(([k, v]) => lines.push(`- **${k.charAt(0).toUpperCase() + k.slice(1)}:** ${v}`));
			lines.push('');
		}
		lines.push('## Progress', `- **XP:** ${d.xp ?? 0}`,
			`- **Bonds:** ${formatTicks(Number(d.bonds ?? 0))}`,
			`- **Failures:** ${formatTicks(Number(d.failures ?? 0))}`, '');
		const debilities = ['wounded','unprepared','shaken','encumbered','maimed','corrupted','cursed','tormented'];
		const active = debilities.filter(k => d[k]);
		if (active.length) {
			lines.push('## Debilities');
			active.forEach(k => lines.push(`- ${k.charAt(0).toUpperCase() + k.slice(1)}`));
			lines.push('');
		}
		const vows = d.vows as Array<{ name: string; difficulty: string; ticks: number; threat?: string; menace?: number; notes?: string }> | undefined;
		if (vows?.length) {
			lines.push('## Vows');
			vows.forEach(v => {
				lines.push(`- **${v.name}** (${v.difficulty}) — ${formatTicks(v.ticks)}`);
				if (v.threat?.trim())  lines.push(`  - Threat: ${v.threat.trim()}`);
				if (v.menace)          lines.push(`  - Menace: ${v.menace}/10`);
				if (v.notes?.trim())   lines.push(`  - Notes: ${v.notes.trim()}`);
			});
			lines.push('');
		}
		const assets = d.assets as Array<{ assetId: string; abilities: boolean[] }> | undefined;
		if (assets?.length) {
			lines.push('## Assets');
			const catalogue = getAssets();
			assets.forEach(a => {
				const def = catalogue.find(x => x.id === a.assetId);
				lines.push(`- **${def?.name ?? a.assetId}** (${def?.category ?? '?'}) — ${a.abilities.filter(Boolean).length}/${a.abilities.length} abilities`);
			});
		}
		return lines.join('\n');
	}

	function logToMarkdown(): string {
		const entries = logs[SESSION_LOG_ID] ?? [];
		if (entries.length === 0) return '# Session Log\n\n_No entries._\n';
		const stamp = new Date().toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
		const lines = ['# Session Log', `_Exported ${stamp}_`, '', '---', ''];
		[...entries].reverse().forEach((entry) => {
			const time = new Date(entry.ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
			lines.push(`## ${entry.title}  —  ${time}`, '', htmlToMd(entry.html));
			if (entry.note?.trim()) { lines.push(''); entry.note.split('\n').forEach(l => lines.push(`> ${l}`)); }
			lines.push('');
		});
		return lines.join('\n').trimEnd();
	}

	function foesToMarkdown(): string {
		if (encounters.length === 0) return '# Foes\n\n_No active foes._\n';
		const lines = ['# Foes', ''];
		for (const enc of encounters) {
			const def  = findFoe(enc.foeId);
			const name = enc.customName || def?.name || enc.foeId;
			lines.push(`## ${name}${enc.vanquished ? ' _(Vanquished)_' : ''}`);
			lines.push(`- **Rank:** ${FOE_RANKS[enc.effectiveRank]?.label ?? enc.effectiveRank}`);
			lines.push(`- **Quantity:** ${enc.quantity.charAt(0).toUpperCase() + enc.quantity.slice(1)}`);
			lines.push(`- **Progress:** ${formatTicks(enc.ticks)}`);
			if (enc.currentHarm    !== undefined) lines.push(`- **Escalating Harm:** ${enc.currentHarm}`);
			if (enc.currentDefense !== undefined) lines.push(`- **Defense Shield:** ${enc.currentDefense}`);
			if (enc.notes?.trim()) lines.push(`- **Notes:** ${enc.notes.trim()}`);
			lines.push('');
		}
		return lines.join('\n').trimEnd();
	}

	function expeditionsToMarkdown(): string {
		if (expeditions.length === 0) return '# Expeditions\n\n_No active expeditions._\n';
		const lines = ['# Expeditions', ''];
		for (const exp of expeditions) {
			const type = exp.type === 'journey' ? 'Journey' : 'Site';
			lines.push(`## ${exp.name} _(${type})_`);
			if (exp.imageUrl) lines.push(`_Has portrait photo — see JSON export for image data._`);
			if (exp.complete) lines.push(`- **Status:** Complete`);
			lines.push(`- **Difficulty:** ${exp.difficulty.charAt(0).toUpperCase() + exp.difficulty.slice(1)}`);
			lines.push(`- **Progress:** ${formatTicks(exp.ticks)}`);
			if (exp.type === 'site') {
				if (exp.theme)                    lines.push(`- **Theme:** ${exp.theme}`);
				if (exp.domain)                   lines.push(`- **Domain:** ${exp.domain}`);
				if (exp.objective?.trim())         lines.push(`- **Objective:** ${exp.objective.trim()}`);
				if (exp.currentFeature?.trim())    lines.push(`- **Current Feature:** ${exp.currentFeature.trim()}`);
				if (exp.currentDanger?.trim())     lines.push(`- **Current Danger:** ${exp.currentDanger.trim()}`);
				const activeDenizens = (exp.denizens ?? [])
					.map(id => id ? (findFoe(id)?.name ?? id) : null)
					.filter(Boolean) as string[];
				if (activeDenizens.length > 0) lines.push(`- **Denizens:** ${activeDenizens.join(', ')}`);
			}
			if (exp.notes?.trim()) lines.push(``, `**Notes:**`, exp.notes.trim());
			lines.push('');
		}
		return lines.join('\n').trimEnd();
	}

	function handleExport(content: string, format: string) {
		const stamp = makeTimestamp();
		if (content === 'everything') {
			if (format === 'md') {
				exportMarkdownZip(stamp);
			} else {
				const payload = {
					characters:  chars.map(c => ({ name: c.name, data: $state.snapshot(c.data) })),
					log:         [...(logs[SESSION_LOG_ID] ?? [])].reverse(),
					communities: $state.snapshot(communities),
					npcs:        $state.snapshot(npcs),
					foes:        $state.snapshot(encounters),
					expeditions: $state.snapshot(expeditions),
					session:     { activeCharId, activeFoeId, activeExpeditionId },
				};
				const count = chars.length + (logs[SESSION_LOG_ID]?.length ?? 0) + communities.length + npcs.length + encounters.length + expeditions.length;
				exportJson('everything', payload, count, `ironledger-export-${stamp}.json`);
			}
		} else if (content === 'character') {
			const char = chars.find(c => c.id === activeCharId);
			if (!char) return;
			const safeName = char.name.replace(/[^a-z0-9]/gi, '-').toLowerCase() || 'character';
			exportJson('character', { name: char.name, data: $state.snapshot(char.data) }, 1, `${safeName}.json`);
		} else if (content === 'all-characters') {
			const payload = chars.map(c => ({ name: c.name, data: $state.snapshot(c.data) }));
			exportJson('all-characters', payload, chars.length, `all-characters-${stamp}.json`);
		} else if (content === 'log') {
			if (format === 'json') {
				const entries = [...(logs[SESSION_LOG_ID] ?? [])].reverse();
				exportJson('log', entries, entries.length, `session-log-${stamp}.json`);
			} else downloadFile(`session-log-${stamp}.md`, logToMarkdown(), 'text/markdown');
		} else if (content === 'communities') {
			exportJson('communities', { communities: $state.snapshot(communities), npcs: $state.snapshot(npcs) }, communities.length + npcs.length, `communities-${stamp}.json`);
		} else if (content === 'foes') {
			exportJson('foes', $state.snapshot(encounters), encounters.length, `foes-${stamp}.json`);
		} else if (content === 'expeditions') {
			exportJson('expeditions', $state.snapshot(expeditions), expeditions.length, `expeditions-${stamp}.json`);
		}
	}
</script>

<svelte:head>
	<title>Iron Ledger</title>
</svelte:head>

<!-- Hidden file input for JSON import -->
<input
	bind:this={importInput}
	type="file"
	accept=".json,application/json"
	style="display: none"
	onchange={onImportFile}
/>

<!-- Top-level error bar — shows import failures from sanitization, parsing,
     or post-parse validation. The same message also appears inside the
     Import dialog body when that dialog is open. -->
<div class="error-bar-host">
	<ErrorBar message={importError} onDismiss={() => (importError = '')} />
</div>

<!-- Import warning dialog -->
<ConfirmDialog
	bind:this={importConfirmRef}
	title="Import Data?"
	confirmLabel="Choose File…"
	confirmClass="btn-primary"
	cancelLabel="Cancel"
	accentColor="var(--text-accent)"
	onconfirm={() => importInput?.click()}
>
	<div style="display:flex; flex-direction:column; gap:8px; font-family:var(--font-ui); font-size:0.8rem; line-height:1.5; color:var(--text-muted);">
		<p style="margin:0;">Importing a file will <strong style="color:var(--text);">replace</strong> the matching data in your current session.</p>
		<p style="margin:0;">Depending on the file type, this may overwrite characters, the session log, foes, expeditions, or all campaign data.</p>
		<p style="margin:0;">This action cannot be undone. Make sure you have exported a backup if needed.</p>
		{#if importError}<p style="margin:0; color:var(--color-danger);">{importError}</p>{/if}
	</div>
</ConfirmDialog>

<div
	bind:this={shellEl}
	class="home-shell"
	class:home-shell--dragging={dragging}
	class:home-shell--mob-dragging={mobDragging}
	class:home-shell--col-dragging={colDragging}
	class:home-shell--char-dragging={charDragging}
	class:home-shell--exped-dragging={expedDragging}
	style:--log-width="{logWidth}px"
	style:--mob-log-height="{mobLogHeight}px"
	style:--col1-width={col1Width !== null ? col1Width + 'px' : undefined}
	style:--char-height={charHeight !== null ? charHeight + 'px' : undefined}
	style:--exped-height={expedHeight !== null ? expedHeight + 'px' : undefined}
>
	<!-- Mobile tab bar (hidden on desktop via CSS) -->
	<nav class="mob-tabbar">
		<button class="mob-tab" class:mob-tab--active={mobileTab === 'characters'}  onclick={() => mobileTab = 'characters'}>
			<span class="mob-tab-icon" aria-hidden="true">{@html charactersIconSvg}</span>Characters
		</button>
		<button class="mob-tab" class:mob-tab--active={mobileTab === 'foes'}         onclick={() => mobileTab = 'foes'}>
			<span class="mob-tab-icon" aria-hidden="true">{@html foesIconSvg}</span>Foes
		</button>
		<button class="mob-tab" class:mob-tab--active={mobileTab === 'expeditions'} onclick={() => mobileTab = 'expeditions'}>
			<span class="mob-tab-icon" aria-hidden="true">{@html expeditionsIconSvg}</span>Expeditions
		</button>
		<button class="mob-tab" class:mob-tab--active={mobileTab === 'communities'} onclick={() => mobileTab = 'communities'}>
			<span class="mob-tab-icon" aria-hidden="true">{@html villageIconSvg}</span>Connections
		</button>
	</nav>

	<!-- Column 1: Characters (top) + Foes (bottom) -->
	<div bind:this={charFoeColEl} class="home-col home-col--char-foe">
		<section class="home-area home-area--characters" class:mob-hidden={mobileTab !== 'characters'}>
			<CharactersArea showTitle={!isMobile} />
		</section>
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<div
			class="row-resize-handle"
			role="separator"
			aria-label="Resize characters and foes"
			aria-orientation="horizontal"
			onmousedown={startCharResize}
		></div>
		<section class="home-area home-area--foes" class:mob-hidden={mobileTab !== 'foes'}>
			<FoesArea bind:this={foeAreaRef} showTitle={!isMobile} />
		</section>
	</div>

	<!-- Desktop column resize handle (hidden on mobile) -->
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div
		class="col-resize-handle"
		role="separator"
		aria-label="Resize columns"
		aria-orientation="vertical"
		onmousedown={startColResize}
	></div>

	<!-- Column 2: Expeditions (top) + Connections (bottom) -->
	<div bind:this={expCommColEl} class="home-col home-col--exp-comm">
		<section class="home-area home-area--expeditions" class:mob-hidden={mobileTab !== 'expeditions'}>
			<ExpeditionsArea bind:this={expAreaRef} showTitle={!isMobile} />
		</section>
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<div
			class="row-resize-handle"
			role="separator"
			aria-label="Resize expeditions and connections"
			aria-orientation="horizontal"
			onmousedown={startExpedResize}
		></div>
		<section class="home-area home-area--communities" class:mob-hidden={mobileTab !== 'communities'}>
			<CommunitiesArea showTitle={!isMobile} />
		</section>
	</div>

	<!-- Desktop log resize handle (hidden on mobile) -->
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div
		class="home-resize-handle"
		role="separator"
		aria-label="Resize log"
		aria-orientation="vertical"
		aria-valuenow={logWidth}
		aria-valuemin={MIN_LOG}
		aria-valuemax={MAX_LOG}
		onmousedown={startResize}
	></div>

	<!-- Mobile vertical resize handle (hidden on desktop) -->
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div
		class="mob-resize-handle"
		role="separator"
		aria-label="Resize log"
		aria-orientation="horizontal"
		onmousedown={startMobResize}
		ontouchstart={startMobResize}
	></div>

	<!-- Log. The change-theme/domain links emitted on d100 99/100
	     feature/danger rolls delegate back to ExpeditionsArea so the user
	     stays in flow — the corresponding expedition is selected and the
	     change dialog opens. -->
	<aside class="home-log">
		<LogPanel
			ctx={activeDiceCtx}
			onMoveLink={(moveId) => document.dispatchEvent(new CustomEvent('ironledger:open-move', { detail: { id: moveId } }))}
			onOracleLink={(key, stat) => document.dispatchEvent(new CustomEvent('ironledger:open-oracle', { detail: { key, stat } }))}
			onProgressLink={(track, value) => {
				if (track === 'combat') {
					foeAreaRef?.applyMenace(value);
				} else if (track === 'journey' || track === 'delve') {
					expAreaRef?.applyProgress(value);
				}
			}}
			onInitiativeLink={(value, charId) => {
				const id = charId || activeDiceCtx?.charId;
				if (id) {
					const numVal = value === 'character' ? 1 : value === 'foe' ? 2 : 0;
					triggerAction({ charId: id, type: 'set', key: 'initiative', value: numVal });
				}
			}}
			onMenaceLink={(value) => foeAreaRef?.applyMenace(value)}
			onVanquishFoe={() => foeAreaRef?.vanquishActiveFoe()}
			onChangeTheme={(id) => expAreaRef?.openChangeThemeForExp(id)}
			onChangeDomain={(id) => expAreaRef?.openChangeDomainForExp(id)}
		/>
	</aside>
</div>

<style>
	/* The shell sizes itself to the viewport; the layout's default app-main
	   padding (`0 0 4rem`) and max-width would create scrollable empty space
	   below the shell. Override globally only while this page is mounted. */
	:global(.app-main) {
		max-width: none;
		padding: 0;
	}

	/* ── Top-level error bar host (margin only; styles live in ErrorBar) ───── */
	.error-bar-host {
		margin: 8px var(--page-gutter, 10px) 0;
	}
	.error-bar-host:empty { display: none; }

	/* ── Desktop layout ──────────────────────────────────────────────────────── */

	.home-shell {
		display:        grid;
		/* col1 | col-handle | col2 | log-handle | log */
		grid-template-columns: var(--col1-width, 1fr) 6px 1fr 6px var(--log-width, 33vw);
		gap:            0;
		/* Fill <main> as a flex item — main is `display: flex` column with
		   flex: 1 inside a 100dvh body, so `flex: 1` reliably gives us the
		   full available height (more robust than `height: 100%` on Safari). */
		flex:           1;
		min-height:     0;
		/* Safe-area padding lives here (not on body) so the shell itself
		   extends edge-to-edge and its content avoids the home indicator
		   and any landscape notch. */
		padding:        10px;
		padding-bottom: max(10px, env(safe-area-inset-bottom));
		padding-left:   max(10px, env(safe-area-inset-left));
		padding-right:  max(10px, env(safe-area-inset-right));
		background:     var(--bg);
		box-sizing:     border-box;
		overflow:       hidden;
	}
	.home-shell--dragging      { cursor: col-resize; user-select: none; }
	.home-shell--dragging *    { pointer-events: none; }
	.home-shell--mob-dragging  { cursor: row-resize; user-select: none; }
	.home-shell--mob-dragging * { pointer-events: none; }
	.home-shell--col-dragging   { cursor: col-resize; user-select: none; }
	.home-shell--col-dragging * { pointer-events: none; }
	.home-shell--char-dragging,
	.home-shell--exped-dragging { cursor: row-resize; user-select: none; }
	.home-shell--char-dragging *,
	.home-shell--exped-dragging * { pointer-events: none; }

	/* Desktop log resize handle (vertical bar, right edge) */
	.home-resize-handle {
		width: 6px;
		cursor: col-resize;
		background: transparent;
		position: relative;
		transition: background 0.12s;
		z-index: 1;
	}
	.home-resize-handle::before {
		content: '';
		position: absolute;
		top: 0; bottom: 0;
		left: 50%;
		width: 1px;
		background: var(--border);
		transform: translateX(-50%);
		transition: background 0.12s, width 0.12s;
	}
	.home-resize-handle:hover::before,
	.home-shell--dragging .home-resize-handle::before {
		background: var(--text-accent);
		width: 2px;
	}

	/* Desktop column resize handle (vertical bar between the two content cols) */
	.col-resize-handle {
		cursor: col-resize;
		background: transparent;
		position: relative;
		z-index: 1;
	}
	.col-resize-handle::before {
		content: '';
		position: absolute;
		top: 0; bottom: 0;
		left: 50%;
		width: 1px;
		background: var(--border);
		transform: translateX(-50%);
		transition: background 0.12s, width 0.12s;
	}
	.col-resize-handle:hover::before,
	.home-shell--col-dragging .col-resize-handle::before {
		background: var(--text-accent);
		width: 2px;
	}

	/* Desktop row resize handle (horizontal bar within each column) */
	.row-resize-handle {
		cursor: row-resize;
		background: transparent;
		position: relative;
		z-index: 1;
	}
	.row-resize-handle::before {
		content: '';
		position: absolute;
		left: 0; right: 0;
		top: 50%;
		height: 1px;
		background: var(--border);
		transform: translateY(-50%);
		transition: background 0.12s, height 0.12s;
	}
	.row-resize-handle:hover::before,
	.home-shell--char-dragging .home-col--char-foe .row-resize-handle::before,
	.home-shell--exped-dragging .home-col--exp-comm .row-resize-handle::before {
		background: var(--text-accent);
		height: 2px;
	}

	/* Columns use explicit row tracks driven by CSS vars; gap replaced by 6px handle. */
	.home-col {
		display: grid;
		gap: 0;
		min-width: 0;
		min-height: 0;
	}
	.home-col--char-foe {
		grid-template-rows: var(--char-height, 1fr) 6px 1fr;
	}
	.home-col--exp-comm {
		grid-template-rows: var(--exped-height, 1fr) 6px 1fr;
	}

	.home-area {
		background:    var(--bg-inset);
		border:        1px solid var(--border);
		border-radius: 6px;
		overflow:      hidden;
		min-width:     0;
		min-height:    0;
		display:       flex;
		flex-direction: column;
	}

	.home-log {
		background:    var(--bg-inset);
		border:        1px solid var(--border);
		border-radius: 6px;
		overflow:      hidden;
		display:       flex;
		flex-direction: column;
	}

	/* Mobile-only elements — hidden on desktop */
	.mob-tabbar      { display: none; }
	.mob-resize-handle { display: none; }

	/* ── Mobile layout (≤900px) ──────────────────────────────────────────────── */

	@media (max-width: 900px) {
		.home-shell {
			display:        flex;
			flex-direction: column;
			grid-template-columns: unset;
			padding:        0;
			/* No padding-bottom here on mobile — the log lives at the bottom
			   and carries its own safe-area-inset internally so its surface
			   extends edge-to-edge while entries clear the home indicator. */
			padding-left:   env(safe-area-inset-left);
			padding-right:  env(safe-area-inset-right);
		}

		/* Columns become transparent — sections flow directly into the flex shell */
		.home-col {
			display: contents;
		}

		/* Desktop gutters and resize handles invisible on mobile */
		.home-resize-handle     { display: none; }
		.col-resize-handle      { display: none; }
		.row-resize-handle      { display: none; }

		/* Tab bar */
		.mob-tabbar {
			display:      flex;
			flex-shrink:  0;
			background:   var(--bg-control);
			border-bottom: 1px solid var(--border);
		}
		.mob-tab {
			flex:           1;
			padding:        7px 4px;
			display:        flex;
			flex-direction: column;
			align-items:    center;
			gap:            3px;
			font-family:    var(--font-ui);
			font-size:      0.6rem;
			font-weight:    600;
			text-transform: uppercase;
			letter-spacing: 0.04em;
			color:          var(--text-muted);
			background:     transparent;
			border:         none;
			border-bottom:  2px solid transparent;
			cursor:         pointer;
			transition:     color 0.1s, border-color 0.1s;
		}
		.mob-tab--active {
			color:               var(--text-accent);
			border-bottom-color: var(--text-accent);
		}
		.mob-tab-icon {
			display:     flex;
			width:       18px;
			height:      18px;
			flex-shrink: 0;
		}
		.mob-tab-icon :global(svg) {
			width:  100%;
			height: 100%;
		}
		.mob-tab-icon :global(svg path) { fill: currentColor; }

		/* Areas fill the remaining flex space */
		.home-area {
			flex:          1;
			min-height:    0;
			border-radius: 0;
			border:        none;
			border-top:    1px solid var(--border);
		}
		/* Non-active tabs hidden */
		.home-area.mob-hidden { display: none; }

		/* Mobile vertical resize handle */
		.mob-resize-handle {
			display:    block;
			flex-shrink: 0;
			height:     10px;
			cursor:     row-resize;
			background: transparent;
			position:   relative;
			z-index:    1;
		}
		.mob-resize-handle::before {
			content:  '';
			position: absolute;
			left: 0; right: 0;
			top:    50%;
			height: 1px;
			background: var(--border);
			transform: translateY(-50%);
			transition: background 0.12s, height 0.12s;
		}
		.mob-resize-handle:hover::before,
		.home-shell--mob-dragging .mob-resize-handle::before {
			background: var(--text-accent);
			height: 2px;
		}

		/* Log at bottom */
		.home-log {
			height:        var(--mob-log-height, 25vh);
			flex:          none;
			min-height:    0;
			border-radius: 0;
			border:        none;
			border-top:    1px solid var(--border);
			margin-left:   0;
		}
	}
</style>
