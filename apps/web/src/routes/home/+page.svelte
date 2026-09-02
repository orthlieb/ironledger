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
	import type { Community, Npc, Expedition, Place } from '$lib/types.js';
	import {
		loadCharacters,
		getCharacters,
		createCharacter,
		persistCharacterNow,
	} from '$lib/characterStore.svelte.js';
	import { loadEncounters, getEncounters } from '$lib/encounterStore.svelte.js';
	import {
		loadExpeditions,
		getExpeditions,
		addExpedition,
		updateExpedition,
	} from '$lib/expeditionStore.svelte.js';
	import {
		loadCommunities,
		getCommunities,
		addCommunity,
		updateCommunity,
	} from '$lib/communityStore.svelte.js';
	import { loadNpcs, getNpcs, addNpc, updateNpc } from '$lib/npcStore.svelte.js';
	import { loadPlaces, getPlaces, addPlace, updatePlace } from '$lib/placeStore.svelte.js';
	import {
		loadAssets,
		getAssets,
		getGlobalCounterDef,
		getGlobalCounterIds,
	} from '$lib/assetStore.svelte.js';
	import { reconcileGlobalValues } from '$lib/character.js';
	import { loadFoes, findFoe, FOE_RANKS } from '$lib/foeStore.svelte.js';
	import { loadExtensions } from '$lib/expansionStore.svelte.js';
	import { viewMode } from '$lib/viewModeStore.svelte.js';
	import LogPanel from '$lib/components/LogPanel.svelte';
	import CommandBar from '$lib/components/CommandBar.svelte';
	import CharactersArea from '$lib/components/v2/CharactersArea.svelte';
	import FoesArea from '$lib/components/v2/FoesArea.svelte';
	import ExpeditionsArea from '$lib/components/v2/ExpeditionsArea.svelte';
	import CommunitiesArea from '$lib/components/v2/CommunitiesArea.svelte';
	import ImportCollisionDialog from '$lib/components/ImportCollisionDialog.svelte';
	import MapOwnerConflictDialog from '$lib/components/MapOwnerConflictDialog.svelte';
	import {
		normaliseName,
		type CollisionItems,
		type CollisionStrategy,
	} from '$lib/components/importCollision.js';
	import ErrorBar from '$lib/components/ErrorBar.svelte';
	import { getActiveDiceCtx } from '$lib/diceContext.svelte.js';
	import { getActiveFoeId, getActiveExpeditionId } from '$lib/activeContext.svelte.js';
	import { triggerAction, appendLog, sessionLog } from '$lib/log.svelte.js';
	import { parseImportZip, sanitizeLogHtml, ImportError } from '$lib/importSanitizer.js';
	import { zipSync, strToU8, unzipSync, strFromU8 } from 'fflate';
	import {
		makeTimestamp,
		downloadFile,
		exportJson,
		exportZip,
		b64ToU8,
		slugify,
		formatTicks,
	} from '$lib/exportSerialize.js';
	import type { ExportSelection } from '$lib/exportSelection.js';
	import { logToMarkdown } from '$lib/exportMarkdown.js';
	import {
		buildMapZipEntries,
		importMapZip,
		parseBundledMaps,
		applyMapImport,
		populateMap,
		type MapZipBody,
	} from '$lib/mapExport.js';
	import type { MapOwnerKind } from '$lib/mapStore.svelte.js';

	/** Peek a zip's manifest.json to see if this is a per-map bundle.
	 *  Cheap enough (only unzips into an entries dict + parses one small
	 *  entry) that we can do it before delegating to either
	 *  `importMapZip` (map bundle) or `parseImportZip` (everything /
	 *  per-entity bundle). Returns false on any decompression / parse
	 *  error — the main pipeline will produce a proper user-facing error
	 *  message. */
	async function isMapZip(bytes: Uint8Array): Promise<boolean> {
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
	import charactersIconSvg from '$icons/Characters.svg?raw';
	import foesIconSvg from '$icons/Foes.svg?raw';
	import expeditionsIconSvg from '$icons/Expeditions.svg?raw';
	import villageIconSvg from '$icons/village.svg?raw';

	// Log divider width is persisted PER desktop view mode — grid and log keep
	// independent positions (a dominant log in "log" view must not carry over
	// and swallow the grid). Defaults: grid 25% of the viewport, log 50%.
	const logWidthKey = (mode: 'grid' | 'log') => `il:home:logWidth:${mode}`;
	const LOG_WIDTH_DEFAULT_FRAC: Record<'grid' | 'log', number> = { grid: 0.25, log: 0.5 };
	const MIN_LOG = 240;
	const MAX_LOG = 800;
	const MOB_LOG_HEIGHT_KEY = 'il:home:mobLogHeight';
	const MIN_MOB_LOG = 80;
	const MAX_MOB_LOG_FRAC = 0.7;
	const COL1_WIDTH_KEY = 'il:home:col1Width';
	// Both columns share ONE row-split height so the horizontal divider
	// between Characters/Foes stays aligned with the one between
	// Expeditions/Connections. Older exports used separate `charHeight`
	// / `expedHeight` keys — read the first available one as fallback.
	const ROW_HEIGHT_KEY = 'il:home:rowHeight';
	const LEGACY_CHAR_HEIGHT_KEY = 'il:home:charHeight';
	const LEGACY_EXPED_HEIGHT_KEY = 'il:home:expedHeight';
	const MIN_COL = 200;
	const MIN_AREA = 80;

	/** Log width (px) for a desktop view mode — saved value, else the mode's
	 *  fractional default, clamped to [MIN_LOG, MAX_LOG]. */
	function loadLogWidth(mode: 'grid' | 'log'): number {
		const saved = Number(localStorage.getItem(logWidthKey(mode)));
		if (Number.isFinite(saved) && saved >= MIN_LOG && saved <= MAX_LOG) return saved;
		const frac = LOG_WIDTH_DEFAULT_FRAC[mode];
		return Math.max(MIN_LOG, Math.min(MAX_LOG, Math.round(window.innerWidth * frac)));
	}

	/** Desktop: log column width in px. */
	let logWidth = $state(0);
	let dragging = $state(false);
	let shellEl = $state<HTMLDivElement | null>(null);
	/** Which desktop mode's log width is currently loaded (for the swap effect). */
	let lastLogMode: 'grid' | 'log' | null = null;
	/** Set once onMount has seeded the dividers, so the swap effect ignores the
	 *  initial reactive run and only reacts to genuine later mode switches. */
	let dividersReady = false;

	/** Mobile state. */
	type MobileTab = 'characters' | 'foes' | 'expeditions' | 'communities';
	let mobileTab = $state<MobileTab>('characters');
	let mobLogHeight = $state(200); // px; updated in onMount from saved pref / viewport
	let mobDragging = $state(false);
	let isMobile = $state(false);

	// Home-page layout mode. Grid = current 2×2 deck + log column. Log =
	// panels-tabbed on the left, log dominant on the right (~50/50). Tabs
	// = mobile-style tabbar + one panel + log at the bottom. Mobile
	// always renders `tabs` regardless of stored preference; desktop
	// honours the user's choice from the hamburger's View submenu.
	const layoutMode = $derived(isMobile ? 'tabs' : viewMode.mode);
	let col1Width = $state<number | null>(null);
	/** Shared row-split height (px) — locks the horizontal divider between
	 *  Characters/Foes to the one between Expeditions/Connections. */
	let rowHeight = $state<number | null>(null);
	let colDragging = $state(false);
	let rowDragging = $state(false);
	let charFoeColEl = $state<HTMLDivElement | null>(null);
	let expCommColEl = $state<HTMLDivElement | null>(null);

	/** Ref to ExpeditionsArea — forwards log link actions. */
	let expAreaRef = $state<{
		openChangeThemeForExp(expId: string): void;
		openChangeDomainForExp(expId: string): void;
		applyProgress(marks: number, expId?: string): void;
		applyCountdown(n: number, expId?: string): void;
		completeActiveExpedition(): void;
		reactivateActiveExpedition(): void;
	} | null>(null);

	/** Ref to FoesArea — forwards vanquish / menace from log links. */
	let foeAreaRef = $state<{
		selectFoe(id: string): void;
		vanquishActiveFoe(): void;
		vanquishFoe(foeId?: string): void;
		reactivateActiveFoe(): void;
		applyMenace(value: number, foeId?: string): void;
	} | null>(null);

	/** Active dice context — provides charId + data for LogPanel's link handlers. */
	const activeDiceCtx = $derived(getActiveDiceCtx());

	/** Store snapshots used by import/export. */
	const chars = $derived(getCharacters());
	const encounters = $derived(getEncounters());
	const expeditions = $derived(getExpeditions());
	const communities = $derived(getCommunities());
	const npcs = $derived(getNpcs());
	const places = $derived(getPlaces());
	const activeCharId = $derived(activeDiceCtx?.charId ?? '');
	const activeFoeId = $derived(getActiveFoeId());
	const activeExpeditionId = $derived(getActiveExpeditionId());

	/** Import UI state. */
	let importInput = $state<HTMLInputElement | null>(null);
	// Resolves once the mount's initial store loads (communities, npcs, places,
	// expeditions, characters, foes …) have finished. An import must await this
	// before applying: otherwise its optimistic additions race an in-flight
	// load, whose `_sync.reset()` on resolve discards the just-added rows (and
	// can trigger a spurious DELETE), silently dropping the import.
	let initialLoad: Promise<unknown> = Promise.resolve();
	let importCollisionRef = $state<{
		open(items: CollisionItems): Promise<CollisionStrategy>;
	} | null>(null);
	let mapConflictRef = $state<{
		open(names: string[]): Promise<'replace' | 'skip'>;
	} | null>(null);
	let importError = $state('');

	/** Track mobile breakpoint reactively. */
	$effect(() => {
		const mq = window.matchMedia('(max-width: 900px)');
		isMobile = mq.matches;
		const handler = (ev: MediaQueryListEvent) => {
			isMobile = ev.matches;
		};
		mq.addEventListener('change', handler);
		return () => mq.removeEventListener('change', handler);
	});

	// Swap the log width when the desktop view mode changes so grid and log keep
	// their own persisted positions (and per-mode defaults). Skips the initial
	// mount (dividersReady), the mobile `tabs` mode (uses mobLogHeight), and any
	// in-progress drag.
	$effect(() => {
		const mode = layoutMode;
		if (!dividersReady || dragging) return;
		if (mode !== 'grid' && mode !== 'log') return;
		if (mode === lastLogMode) return;
		lastLogMode = mode;
		logWidth = loadLogWidth(mode);
	});

	onMount(() => {
		// Desktop log width — per view mode (grid 25% / log 50%), independent.
		// 'tabs' (mobile) uses the mobile log height instead, so seed the grid
		// value for when the viewport grows back to a desktop layout.
		const initMode = layoutMode === 'log' ? 'log' : 'grid';
		logWidth = loadLogWidth(initMode);
		lastLogMode = initMode;

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
		const shellW = shellEl?.offsetWidth ?? window.innerWidth;
		const availW = shellW - 20 - logWidth - 12;
		if (Number.isFinite(savedCol1) && savedCol1 >= MIN_COL && savedCol1 <= availW - MIN_COL) {
			col1Width = savedCol1;
		} else {
			col1Width = Math.max(MIN_COL, Math.round(availW / 2));
		}

		// Desktop row split — one shared value drives both columns so their
		// horizontal dividers stay in lock-step. Prefer the new key; fall
		// back to whichever legacy per-column key the user had persisted so
		// a returning user doesn't get a fresh 50/50 split.
		const savedRow = Number(localStorage.getItem(ROW_HEIGHT_KEY));
		const legacyChar = Number(localStorage.getItem(LEGACY_CHAR_HEIGHT_KEY));
		const legacyExped = Number(localStorage.getItem(LEGACY_EXPED_HEIGHT_KEY));
		const colH =
			charFoeColEl?.offsetHeight ??
			expCommColEl?.offsetHeight ??
			Math.round(window.innerHeight * 0.8);
		const upperMax = colH - 6 - MIN_AREA;
		const inBounds = (n: number) => Number.isFinite(n) && n >= MIN_AREA && n <= upperMax;
		if (inBounds(savedRow)) rowHeight = savedRow;
		else if (inBounds(legacyChar)) rowHeight = legacyChar;
		else if (inBounds(legacyExped)) rowHeight = legacyExped;
		else rowHeight = Math.max(MIN_AREA, Math.round((colH - 6) / 2));

		// Dividers are seeded — the log-width swap effect may now react to
		// genuine view-mode switches.
		dividersReady = true;

		// Fire-and-forget for rendering — stores update reactively when each
		// resolves — but keep the aggregate promise so imports can await it
		// (see `initialLoad`) and never mutate a store mid-load.
		initialLoad = Promise.all([
			loadAssets(),
			loadFoes(),
			loadCharacters(),
			loadEncounters(),
			loadExpeditions(),
			loadCommunities(),
			loadNpcs(),
			loadPlaces(),
			loadExtensions(),
		]);

		// Starter-Ironlands seed. When the user checked the box on /register,
		// the server dropped an `il_seed_starter=1` cookie; we consume it here
		// on the first load of /home after email verification. Guards:
		//   • cookie present
		//   • initial loads finished (so the emptiness check is against real
		//     server state, not the pre-load defaults)
		//   • the account is demonstrably empty across every user-owned
		//     collection (never overwrite existing saga data)
		// The zip is fetched from the same /about/ironlands-starter.zip URL
		// the About page links to, wrapped in a synthetic File, and pushed
		// through the existing hidden file input — which triggers the same
		// onImportFile pipeline manual imports use (collision handling,
		// portrait reassembly, and log-html sanitiser all inclusive). The
		// cookie is cleared up front so an aborted import can't loop.
		void (async () => {
			if (typeof document === 'undefined') return;
			const has = document.cookie.split(';').some((c) => c.trim() === 'il_seed_starter=1');
			if (!has) return;
			document.cookie = 'il_seed_starter=; Path=/; Max-Age=0; SameSite=Strict';
			try {
				await initialLoad;
				const empty =
					getCharacters().length === 0 &&
					expeditions.length === 0 &&
					communities.length === 0 &&
					npcs.length === 0 &&
					places.length === 0 &&
					getEncounters().length === 0;
				if (!empty) return;
				const res = await fetch('/about/ironlands-starter.zip');
				if (!res.ok) return;
				const blob = await res.blob();
				const file = new File([blob], 'ironlands-starter.zip', {
					type: 'application/zip',
				});
				// Wait a microtask so the file input is definitely in the DOM (it's
				// bound near the bottom of the template).
				await Promise.resolve();
				if (!importInput) return;
				const dt = new DataTransfer();
				dt.items.add(file);
				importInput.files = dt.files;
				importInput.dispatchEvent(new Event('change', { bubbles: true }));
			} catch (err) {
				console.warn('[seed-starter] auto-import failed', err);
			}
		})();

		document.addEventListener('il-menu-action', handleMenuAction);

		// Import <input> change → onImportFile, via a DOCUMENT-level listener
		// matched by SELECTOR (not element identity). The template <input> is
		// intermittently recreated during hydration, orphaning any element-bound
		// handler — Svelte's delegated `onchange={...}` keys off a property on
		// the original element, so it silently stopped firing ~half the time and
		// dropped the import with no error. The change event bubbles from
		// whatever the current input is, so a selector match on document is
		// immune to the recreation.
		const onImportChange = (e: Event) => {
			const t = e.target as HTMLElement | null;
			if (t?.matches?.('input[type="file"][accept=".zip,application/zip"]')) onImportFile(e);
		};
		// Attach AFTER the synchronous hydration pass, not during it: a listener
		// added inside the onMount body was silently dropped ~half the time,
		// whereas one added a microtask later fires consistently. Both a
		// microtask and the post-initial-load hook attach it (same fn ref →
		// addEventListener de-dupes to a single listener) so it is present as
		// early as reliably possible.
		const attachImportListener = () => document.addEventListener('change', onImportChange, true);
		queueMicrotask(attachImportListener);
		initialLoad.finally(attachImportListener);

		// Command-bar bus: /foe +N/-N, /foe vanquish, /exp +N/-N. CommandBar
		// dispatches these as CustomEvents so it doesn't need to hold refs to
		// the sheet areas — this route already does. FoesArea / ExpeditionsArea
		// handle the rank/difficulty tick conversion + log-line writing inside
		// their apply methods, so we just forward the signed box/mark count.
		const onFoeProgress = (e: Event) => {
			const d = (e as CustomEvent<{ boxes: number }>).detail;
			if (!d) return;
			foeAreaRef?.applyMenace(d.boxes);
		};
		const onFoeVanquish = () => foeAreaRef?.vanquishActiveFoe();
		const onFoeReactivate = () => foeAreaRef?.reactivateActiveFoe();
		const onExpProgress = (e: Event) => {
			const d = (e as CustomEvent<{ marks: number }>).detail;
			if (!d) return;
			expAreaRef?.applyProgress(d.marks);
		};
		const onExpComplete = () => expAreaRef?.completeActiveExpedition();
		const onExpReactivate = () => expAreaRef?.reactivateActiveExpedition();

		// Map-marker click-through: focus an entity from the campaign map by
		// switching the mobile tab (desktop shows everything already) and
		// letting the relevant area's own listener set its active entry.
		const onFocusEntity = (e: Event) => {
			const d = (e as CustomEvent<{ kind: string; id: string }>).detail;
			if (!d) return;
			if (!isMobile) return; // desktop deck has every area visible; nothing to switch
			if (d.kind === 'journey' || d.kind === 'site' || d.kind === 'scene')
				mobileTab = 'expeditions';
			else if (d.kind === 'community' || d.kind === 'place' || d.kind === 'npc')
				mobileTab = 'communities';
		};

		document.addEventListener('ironledger:foe-progress', onFoeProgress);
		document.addEventListener('ironledger:foe-vanquish', onFoeVanquish);
		document.addEventListener('ironledger:foe-reactivate', onFoeReactivate);
		document.addEventListener('ironledger:exp-progress', onExpProgress);
		document.addEventListener('ironledger:exp-complete', onExpComplete);
		document.addEventListener('ironledger:exp-reactivate', onExpReactivate);
		document.addEventListener('ironledger:focus-entity', onFocusEntity);

		return () => {
			document.removeEventListener('change', onImportChange, true);
			document.removeEventListener('il-menu-action', handleMenuAction);
			document.removeEventListener('ironledger:foe-progress', onFoeProgress);
			document.removeEventListener('ironledger:foe-vanquish', onFoeVanquish);
			document.removeEventListener('ironledger:foe-reactivate', onFoeReactivate);
			document.removeEventListener('ironledger:exp-progress', onExpProgress);
			document.removeEventListener('ironledger:exp-complete', onExpComplete);
			document.removeEventListener('ironledger:exp-reactivate', onExpReactivate);
			document.removeEventListener('ironledger:focus-entity', onFocusEntity);
		};
	});

	/** Desktop horizontal resize (log width). */
	function startResize(e: MouseEvent | TouchEvent) {
		e.preventDefault();
		dragging = true;
		const startX = 'touches' in e ? e.touches[0].clientX : e.clientX;
		const startWidth = logWidth;

		const onMove = (ev: MouseEvent | TouchEvent) => {
			const x = 'touches' in ev ? ev.touches[0].clientX : ev.clientX;
			const delta = startX - x;
			const next = Math.max(MIN_LOG, Math.min(MAX_LOG, startWidth + delta));
			logWidth = next;
		};
		const onUp = () => {
			dragging = false;
			window.removeEventListener('mousemove', onMove as EventListener);
			window.removeEventListener('mouseup', onUp);
			window.removeEventListener('touchmove', onMove as EventListener);
			window.removeEventListener('touchend', onUp);
			// Persist to the current view mode's key so grid/log stay independent.
			const mode = layoutMode === 'log' ? 'log' : 'grid';
			localStorage.setItem(logWidthKey(mode), String(logWidth));
			lastLogMode = mode;
		};
		window.addEventListener('mousemove', onMove as EventListener);
		window.addEventListener('mouseup', onUp);
		window.addEventListener('touchmove', onMove as EventListener, { passive: false });
		window.addEventListener('touchend', onUp);
	}

	/** Mobile vertical resize (log height). */
	function startMobResize(e: MouseEvent | TouchEvent) {
		e.preventDefault();
		mobDragging = true;
		const startY = 'touches' in e ? e.touches[0].clientY : e.clientY;
		const startH = mobLogHeight;

		const onMove = (ev: MouseEvent | TouchEvent) => {
			const y = 'touches' in ev ? ev.touches[0].clientY : ev.clientY;
			const delta = startY - y; // drag up → taller log
			const maxH = Math.round(window.innerHeight * MAX_MOB_LOG_FRAC);
			const next = Math.max(MIN_MOB_LOG, Math.min(maxH, startH + delta));
			mobLogHeight = next;
		};
		const onUp = () => {
			mobDragging = false;
			window.removeEventListener('mousemove', onMove as EventListener);
			window.removeEventListener('mouseup', onUp);
			window.removeEventListener('touchmove', onMove as EventListener);
			window.removeEventListener('touchend', onUp);
			localStorage.setItem(MOB_LOG_HEIGHT_KEY, String(mobLogHeight));
		};
		window.addEventListener('mousemove', onMove as EventListener);
		window.addEventListener('mouseup', onUp);
		window.addEventListener('touchmove', onMove as EventListener, { passive: false });
		window.addEventListener('touchend', onUp);
	}

	/** Desktop column split (between chars/foes and expeditions/communities). */
	function startColResize(e: MouseEvent | TouchEvent) {
		e.preventDefault();
		colDragging = true;
		const startX = 'touches' in e ? e.touches[0].clientX : e.clientX;
		const startW = col1Width ?? 0;

		const onMove = (ev: MouseEvent | TouchEvent) => {
			const x = 'touches' in ev ? ev.touches[0].clientX : ev.clientX;
			const shellW = shellEl?.offsetWidth ?? window.innerWidth;
			const maxW = shellW - 20 - logWidth - 12 - MIN_COL;
			const next = Math.max(MIN_COL, Math.min(maxW, startW + (x - startX)));
			col1Width = next;
		};
		const onUp = () => {
			colDragging = false;
			window.removeEventListener('mousemove', onMove as EventListener);
			window.removeEventListener('mouseup', onUp);
			window.removeEventListener('touchmove', onMove as EventListener);
			window.removeEventListener('touchend', onUp);
			if (col1Width !== null) localStorage.setItem(COL1_WIDTH_KEY, String(col1Width));
		};
		window.addEventListener('mousemove', onMove as EventListener);
		window.addEventListener('mouseup', onUp);
		window.addEventListener('touchmove', onMove as EventListener, { passive: false });
		window.addEventListener('touchend', onUp);
	}

	/** Desktop row split — dragging either handle updates the single shared
	 *  `rowHeight`, so the chars/foes divider and the expeditions/
	 *  connections divider stay locked. */
	function startRowResize(e: MouseEvent | TouchEvent) {
		e.preventDefault();
		rowDragging = true;
		const startY = 'touches' in e ? e.touches[0].clientY : e.clientY;
		const startH = rowHeight ?? 0;

		const onMove = (ev: MouseEvent | TouchEvent) => {
			const y = 'touches' in ev ? ev.touches[0].clientY : ev.clientY;
			const colH = charFoeColEl?.offsetHeight ?? expCommColEl?.offsetHeight ?? 600;
			const maxH = colH - 6 - MIN_AREA;
			const next = Math.max(MIN_AREA, Math.min(maxH, startH + (y - startY)));
			rowHeight = next;
		};
		const onUp = () => {
			rowDragging = false;
			window.removeEventListener('mousemove', onMove as EventListener);
			window.removeEventListener('mouseup', onUp);
			window.removeEventListener('touchmove', onMove as EventListener);
			window.removeEventListener('touchend', onUp);
			if (rowHeight !== null) localStorage.setItem(ROW_HEIGHT_KEY, String(rowHeight));
		};
		window.addEventListener('mousemove', onMove as EventListener);
		window.addEventListener('mouseup', onUp);
		window.addEventListener('touchmove', onMove as EventListener, { passive: false });
		window.addEventListener('touchend', onUp);
	}

	// ── Menu action handler ──────────────────────────────────────────────────
	function handleMenuAction(e: Event) {
		const detail = (e as CustomEvent).detail as {
			action: string;
			selection?: ExportSelection;
		};
		if (detail.action === 'import') {
			importError = '';
			importInput?.click();
		} else if (detail.action === 'export' && detail.selection) {
			void handleExportSelection(detail.selection).catch((err) =>
				console.error('[home] export failed', err),
			);
		}
	}

	// ── Import ───────────────────────────────────────────────────────────────
	// Accepts only the `.zip` bundles produced by `exportZip()`. Legacy
	// bare-JSON exports are no longer supported — anyone with an older
	// file can re-export from the previous session or hand-wrap the JSON
	// into a `{ manifest.json + <type>.json + images/ }` zip.
	async function onImportFile(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;
		importError = '';
		try {
			const bytes = new Uint8Array(await file.arrayBuffer());
			// Map zips are a different beast (manifest.type === 'map',
			// background.jpg at the top level rather than under images/),
			// so they get their own importer. Peek the manifest before
			// running the full parseImportZip pipeline.
			if (await isMapZip(bytes)) {
				await importMapZip(file);
				return;
			}
			const parsed = parseImportZip(bytes) as Record<string, unknown>;

			// Wait for the mount's store loads to settle before touching any
			// store. Applying an import while a collection load is still in
			// flight lets the load's `_sync.reset()` clobber the just-imported
			// rows (silent drop). `loadAssets()` stays for the catalogue below.
			await initialLoad;
			// Reconcile imported globalValues against the current catalogue
			// (drops unknown counter ids, clamps to canonical maxValue, drops
			// non-numeric values). Catalogue is already auto-loaded on mount;
			// this await is a safety net for very early imports.
			await loadAssets();
			const knownDefs = new Map(
				getGlobalCounterIds().map((id) => [id, getGlobalCounterDef(id)!] as const),
			);
			function reconcileImportedChar(entry: { name?: string; data?: Record<string, unknown> }) {
				const data = entry.data ?? {};
				if (data.globalValues && typeof data.globalValues === 'object') {
					data.globalValues = reconcileGlobalValues(
						data.globalValues as Record<string, string>,
						knownDefs,
					);
				}
				return entry;
			}

			function appendSafeLog(entry: {
				title?: string;
				html?: string;
				note?: string;
				source?: string;
				roll?: unknown;
			}) {
				appendLog(
					String(entry.title ?? ''),
					sanitizeLogHtml(String(entry.html ?? '')),
					undefined,
					entry.source as string | undefined,
					entry.roll as import('$lib/log.svelte.js').LogEntry['roll'],
				);
			}

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
			// Logs aren't surfaced here: entries always mint fresh ids and
			// the dedupe in appendSafeLog is by id, not name.
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

			let incomingCharacters: ImportableChar[] = [];
			let incomingCommunities: Community[] = [];
			let incomingNpcs: Npc[] = [];
			let incomingPlaces: Place[] = [];
			let incomingExpeditions: Expedition[] = [];

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
					};
					incomingCharacters = d.characters ?? [];
					incomingCommunities = d.communities ?? [];
					incomingNpcs = d.npcs ?? [];
					incomingPlaces = d.places ?? [];
					incomingExpeditions = d.expeditions ?? [];
				}
			} else {
				incomingCharacters = [parsed as ImportableChar];
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
			};
			const totalCollisions =
				collisions.characters.length +
				collisions.communities.length +
				collisions.npcs.length +
				collisions.places.length +
				collisions.journeys.length +
				collisions.sites.length +
				collisions.scenes.length;

			let strategy: CollisionStrategy = 'new';
			if (totalCollisions > 0) {
				strategy = (await importCollisionRef?.open(collisions)) ?? 'cancel';
				if (strategy === 'cancel') {
					if (importInput) importInput.value = '';
					return;
				}
			}

			/** Apply the chosen collision strategy to one row. Returns true
			 *  if the caller should still call addXxx(row); false if the
			 *  collision was handled internally (skip / replace). On replace,
			 *  the row's id is realigned to the existing row's id so updateXxx
			 *  targets the right record. */
			async function applyStrategy<T extends { id: string; name?: string | null }>(
				row: T,
				existingByName: Map<string, string>,
				replace: (updated: T) => Promise<void>,
			): Promise<boolean> {
				const existingId = existingByName.get(normaliseName(row.name));
				if (!existingId) return true; // no collision — caller appends
				if (strategy === 'skip') return false;
				if (strategy === 'new') {
					row.id = crypto.randomUUID();
					return true; // caller appends with the new id
				}
				// 'replace' — realign id, overwrite in place; caller does NOT also append
				row.id = existingId;
				await replace(row);
				return false;
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
				const reconciled = reconcileImportedChar(entry);
				const data = (reconciled.data ?? {}) as Record<string, unknown>;
				reconciled.data = data;
				// Lift any inline portrait out of the JSON; it goes to the blob store.
				const inline = takeInlineDataUrl(data, 'portrait');
				const collided = existingCharByName.has(normaliseName(reconciled.name));
				if (await applyCharacterStrategy(reconciled)) {
					const created = await createCharacter(reconciled.name ?? 'Imported Character', data);
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
					const existingId = existingCharByName.get(normaliseName(reconciled.name));
					if (existingId) {
						const etag = await uploadPortrait(`/api/characters/${existingId}/portrait`, inline);
						if (etag) {
							persistCharacterNow(existingId, {
								name: reconciled.name ?? 'Imported Character',
								data: { ...data, portraitEtag: etag },
							});
						}
					}
				}
			}

			/** Import one session-collection row: lift its inline portrait into the
			 *  blob store, apply the collision strategy, then persist with the
			 *  resulting portraitEtag. */
			async function importEntityRow<
				T extends {
					id: string;
					name?: string | null;
					portraitEtag?: string;
					imageUrl?: string;
				},
			>(
				row: T,
				seg: string,
				existingByName: Map<string, string>,
				add: (r: T) => Promise<void>,
				update: (r: T) => Promise<void>,
			): Promise<void> {
				const inline = takeInlineDataUrl(row as Record<string, unknown>, 'imageUrl');
				const collided = existingByName.has(normaliseName(row.name));
				const append = await applyStrategy(row, existingByName, update);
				if (!append && collided && strategy === 'skip') return; // skipped — leave existing
				if (inline) {
					const etag = await uploadPortrait(`/api/session/${seg}/${row.id}/portrait`, inline);
					if (etag) row.portraitEtag = etag;
				}
				if (append) await add(row);
				else if (inline && row.portraitEtag) await update(row); // replace: persist etag
			}

			/** Re-link imported Places to their parent settlement BY NAME. Exports
			 *  carry `withinSettlementName` (not a raw id — ids are minted per-user);
			 *  resolve it against the just-imported communities. Call AFTER communities
			 *  land so the live store holds their new ids. Unresolved / standalone →
			 *  link cleared. Rows with no name field (legacy raw-id exports) untouched. */
			function relinkPlaces(rows: Place[]): void {
				const idByName = new Map(getCommunities().map((c) => [normaliseName(c.name), c.id]));
				for (const pl of rows) {
					const rec = pl as unknown as Record<string, unknown>;
					const name = rec.withinSettlementName;
					if (typeof name !== 'string') continue; // legacy raw id — leave as-is
					delete rec.withinSettlementName;
					const id = name ? idByName.get(normaliseName(name)) : undefined;
					if (id) rec.withinSettlementId = id;
					else delete rec.withinSettlementId;
				}
			}

			if (parsed.manifest && parsed.data) {
				const m = parsed.manifest as { type: string };
				if (m.type === 'character' || m.type === 'all-characters') {
					for (const entry of incomingCharacters) await importChar(entry);
				} else if (m.type === 'log') {
					const entries = parsed.data as Array<Record<string, unknown>>;
					for (const entry of entries) appendSafeLog(entry);
				} else if (m.type === 'communities') {
					for (const c of incomingCommunities)
						await importEntityRow(
							c,
							'communities',
							existingCommunityByName,
							addCommunity,
							updateCommunity,
						);
					for (const n of incomingNpcs)
						await importEntityRow(n, 'npcs', existingNpcByName, addNpc, updateNpc);
					relinkPlaces(incomingPlaces);
					for (const pl of incomingPlaces)
						await importEntityRow(pl, 'places', existingPlaceByName, addPlace, updatePlace);
				} else if (m.type === 'expeditions') {
					for (const exp of incomingExpeditions) {
						const byName =
							exp.type === 'site'
								? existingSiteByName
								: exp.type === 'scene'
									? existingSceneByName
									: existingJourneyByName;
						await importEntityRow(exp, 'expeditions', byName, addExpedition, updateExpedition);
					}
				} else if (m.type === 'everything') {
					for (const entry of incomingCharacters) await importChar(entry);
					const d = parsed.data as { log?: Array<Record<string, unknown>> };
					for (const entry of d.log ?? []) appendSafeLog(entry);
					for (const c of incomingCommunities)
						await importEntityRow(
							c,
							'communities',
							existingCommunityByName,
							addCommunity,
							updateCommunity,
						);
					for (const n of incomingNpcs)
						await importEntityRow(n, 'npcs', existingNpcByName, addNpc, updateNpc);
					relinkPlaces(incomingPlaces);
					for (const pl of incomingPlaces)
						await importEntityRow(pl, 'places', existingPlaceByName, addPlace, updatePlace);
					for (const exp of incomingExpeditions) {
						const byName =
							exp.type === 'site'
								? existingSiteByName
								: exp.type === 'scene'
									? existingSceneByName
									: existingJourneyByName;
						await importEntityRow(exp, 'expeditions', byName, addExpedition, updateExpedition);
					}
					// Restore bundled maps (markers + backgrounds) from the nested
					// `maps/<id>/…` dirs, re-linking each to its owner entity by
					// name now that the entity rows above have landed with their new
					// ids. Unzips the raw bytes here rather than threading them
					// through parseImportZip (which only surfaces the JSON body +
					// portrait images). Best-effort: a map failure never aborts the
					// entity import that already landed above.
					try {
						await restoreBundledMaps(unzipSync(bytes));
					} catch {
						/* non-fatal — entities imported fine */
					}
				}
			} else {
				for (const entry of incomingCharacters) await importChar(entry);
			}
		} catch (err) {
			importError =
				err instanceof ImportError
					? err.message
					: 'Could not import. Make sure the file is a valid Iron Ledger JSON export.';
		} finally {
			if (importInput) importInput.value = '';
		}
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
	 */
	async function restoreBundledMaps(entries: Record<string, Uint8Array>): Promise<void> {
		const bundled = parseBundledMaps(entries);
		if (bundled.length === 0) return;

		// (kind, name) → current entity id, from the just-imported stores.
		const key = (kind: MapOwnerKind, name: string) => `${kind}:${normaliseName(name)}`;
		const ownerIdByKey = new Map<string, string>();
		for (const c of communities) ownerIdByKey.set(key('community', c.name), c.id);
		for (const p of places) ownerIdByKey.set(key('place', p.name), p.id);
		for (const e of expeditions)
			ownerIdByKey.set(key(e.type === 'site' ? 'site' : 'journey', e.name), e.id);

		// Which owners already have a map (and its id) — for conflict detection.
		const ownedMapId = new Map<string, string>();
		try {
			const res = await fetch('/api/session/maps');
			if (res.ok) {
				const body = (await res.json()) as {
					maps?: Array<{ id: string; ownerKind: MapOwnerKind | null; ownerId: string | null }>;
				};
				for (const m of body.maps ?? []) {
					if (m.ownerKind && m.ownerId) ownedMapId.set(`${m.ownerKind}:${m.ownerId}`, m.id);
				}
			}
		} catch {
			/* treat as "no owned maps" — everything links or goes standalone */
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
			standalone.push({ body, background });
		}

		// One decision covers every owned-map conflict in the file.
		let strategy: 'replace' | 'skip' = 'skip';
		if (conflicts.length > 0) {
			const names = conflicts.map((c) => c.body.ownerName || c.body.name || '(unnamed)');
			strategy = (await mapConflictRef?.open(names)) ?? 'skip';
		}

		for (const p of linked) await applyMapImport(p.body, p.background, p.owner);
		for (const p of standalone) await applyMapImport(p.body, p.background);
		for (const p of conflicts) {
			if (strategy === 'replace' && p.existingMapId) {
				await populateMap(p.existingMapId, p.body, p.background);
			} else {
				await applyMapImport(p.body, p.background); // skip → standalone
			}
		}
	}

	// ── Portrait blob ↔ inline base64 bridges ───────────────────────────────────
	// Portraits live in the content-addressed blob store, not the entity JSON.
	// Export re-embeds them inline (the pre-Tier-2 shape) so a single file stays
	// self-contained and portable; import lifts inline portraits back into the
	// (deduping) blob store. Old exports that already carry inline portraits flow
	// through the same import path unchanged.

	/** Fetch a portrait by URL and return it as a base64 data URL ('' on failure). */
	async function fetchPortraitDataUrl(url: string): Promise<string> {
		try {
			const res = await fetch(url, { credentials: 'include' });
			if (!res.ok) return '';
			const blob = await res.blob();
			return await new Promise<string>((resolve, reject) => {
				const fr = new FileReader();
				fr.onload = () => resolve(fr.result as string);
				fr.onerror = () => reject(fr.error);
				fr.readAsDataURL(blob);
			});
		} catch {
			return '';
		}
	}

	/** PUT an inline base64 portrait to an entity's blob endpoint; returns the
	 *  stored content hash (etag), or '' on failure. */
	async function uploadPortrait(endpoint: string, dataUrl: string): Promise<string> {
		try {
			const res = await fetch(endpoint, {
				method: 'PUT',
				credentials: 'include',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ dataUrl }),
			});
			if (!res.ok) return '';
			const { etag } = (await res.json()) as { etag: string };
			return etag ?? '';
		} catch {
			return '';
		}
	}

	/** Pull an inline base64 data URL off an object's field and delete it. Returns
	 *  '' when absent or not a data: URL (https values are left untouched). */
	function takeInlineDataUrl(obj: Record<string, unknown>, key: string): string {
		const v = obj[key];
		if (typeof v === 'string' && v.startsWith('data:')) {
			delete obj[key];
			return v;
		}
		return '';
	}

	async function exportMarkdownZip(stamp: string) {
		const zipFiles: Record<string, Uint8Array> = {};
		const usedNames = new Set<string>();

		function addImage(dataUrl: string, prefix: string, name: string): string {
			let base = `images/${prefix}-${slugify(name)}`;
			let path = `${base}.jpg`;
			let i = 2;
			while (usedNames.has(path)) {
				path = `${base}-${i++}.jpg`;
			}
			usedNames.add(path);
			zipFiles[path] = b64ToU8(dataUrl);
			return `./${path}`;
		}

		// Fetch every portrait's bytes up front (concurrently) so the markdown
		// builders below stay synchronous. Falls back to any legacy inline value.
		const charPortraits = new Map<string, string>();
		const commPortraits = new Map<string, string>();
		const npcPortraits = new Map<string, string>();
		const expPortraits = new Map<string, string>();
		async function prefetch<T extends { id: string }>(
			items: T[],
			urlFor: (it: T) => string,
			legacy: (it: T) => string,
			into: Map<string, string>,
		) {
			await Promise.all(
				items.map(async (it) => {
					const url = urlFor(it);
					const du = url ? await fetchPortraitDataUrl(url) : legacy(it);
					if (du) into.set(it.id, du);
				}),
			);
		}
		await Promise.all([
			prefetch(
				chars,
				(c) => {
					const et = (c.data as Record<string, unknown>).portraitEtag as string | undefined;
					return et ? `/api/characters/${c.id}/portrait?v=${encodeURIComponent(et)}` : '';
				},
				(c) => ((c.data as Record<string, unknown>).portrait as string) ?? '',
				charPortraits,
			),
			prefetch(
				communities,
				(c) =>
					c.portraitEtag
						? `/api/session/communities/${c.id}/portrait?v=${encodeURIComponent(c.portraitEtag)}`
						: '',
				(c) => c.imageUrl ?? '',
				commPortraits,
			),
			prefetch(
				npcs,
				(n) =>
					n.portraitEtag
						? `/api/session/npcs/${n.id}/portrait?v=${encodeURIComponent(n.portraitEtag)}`
						: '',
				(n) => n.imageUrl ?? '',
				npcPortraits,
			),
			prefetch(
				expeditions,
				(e) =>
					e.portraitEtag
						? `/api/session/expeditions/${e.id}/portrait?v=${encodeURIComponent(e.portraitEtag)}`
						: '',
				(e) => e.imageUrl ?? '',
				expPortraits,
			),
		]);

		// ── Characters ──────────────────────────────────────────────────
		if (chars.length) {
			const lines: string[] = [];
			chars.forEach((char, idx) => {
				if (idx > 0) lines.push('', '---', '');
				const d = char.data as Record<string, unknown>;
				lines.push(`# ${char.name || 'Unnamed Character'}`, '');
				const charDu = charPortraits.get(char.id);
				if (charDu) {
					const src = addImage(charDu, 'char', char.name);
					lines.push(`![Portrait](${src})`, '');
				}
				if (d.background) lines.push(`**Background:** ${d.background}`, '');
				const initiativeLabels: Record<number, string> = {
					0: 'None',
					1: 'You have initiative',
					2: 'Foe has initiative',
				};
				const init = d.initiative as number | undefined;
				if (init !== undefined && init !== null)
					lines.push(`**Initiative:** ${initiativeLabels[init] ?? init}`, '');
				lines.push(
					'## Stats',
					`| Edge | Heart | Iron | Shadow | Wits |`,
					`|------|-------|------|--------|------|`,
					`| ${d.edge ?? 0} | ${d.heart ?? 0} | ${d.iron ?? 0} | ${d.shadow ?? 0} | ${d.wits ?? 0} |`,
					'',
				);
				lines.push(
					'## Resources',
					`- **Health:** ${d.health ?? 0}/5`,
					`- **Spirit:** ${d.spirit ?? 0}/5`,
					`- **Supply:** ${d.supply ?? 0}/5`,
					`- **Momentum:** ${d.momentum ?? 0}`,
					'',
				);
				const gv = d.globalValues as Record<string, string> | undefined;
				if (gv && Object.keys(gv).length > 0) {
					lines.push('## Counters');
					Object.entries(gv).forEach(([k, v]) =>
						lines.push(`- **${k.charAt(0).toUpperCase() + k.slice(1)}:** ${v}`),
					);
					lines.push('');
				}
				lines.push(
					'## Progress',
					`- **XP:** ${d.xp ?? 0}`,
					`- **Bonds:** ${formatTicks(Number(d.bonds ?? 0))}`,
				);
				if ((d.bondsFormed as string | undefined)?.trim())
					lines.push(`  - Bonds Formed: ${(d.bondsFormed as string).trim()}`);
				lines.push(`- **Failures:** ${formatTicks(Number(d.failures ?? 0))}`);
				if ((d.lessonsLearned as string | undefined)?.trim())
					lines.push(`  - Lessons Learned: ${(d.lessonsLearned as string).trim()}`);
				lines.push('');
				const debilities = [
					'wounded',
					'unprepared',
					'shaken',
					'encumbered',
					'maimed',
					'corrupted',
					'cursed',
					'tormented',
				];
				const active = debilities.filter((k) => d[k]);
				if (active.length) {
					lines.push('## Debilities');
					active.forEach((k) => lines.push(`- ${k.charAt(0).toUpperCase() + k.slice(1)}`));
					lines.push('');
				}
				const vows = d.vows as
					| Array<{
							name: string;
							difficulty: string;
							ticks: number;
							threat?: string;
							menace?: number;
							notes?: string;
					  }>
					| undefined;
				if (vows?.length) {
					lines.push('## Vows');
					vows.forEach((v) => {
						lines.push(`- **${v.name}** (${v.difficulty}) — ${formatTicks(v.ticks)}`);
						if (v.threat?.trim()) lines.push(`  - Threat: ${v.threat.trim()}`);
						if (v.menace) lines.push(`  - Menace: ${v.menace}/10`);
						if (v.notes?.trim()) lines.push(`  - Notes: ${v.notes.trim()}`);
					});
					lines.push('');
				}
				const assets = d.assets as Array<{ assetId: string; abilities: boolean[] }> | undefined;
				if (assets?.length) {
					lines.push('## Assets');
					const catalogue = getAssets();
					assets.forEach((a) => {
						const def = catalogue.find((x) => x.id === a.assetId);
						lines.push(
							`- **${def?.name ?? a.assetId}** (${def?.category ?? '?'}) — ${a.abilities.filter(Boolean).length}/${a.abilities.length} abilities`,
						);
					});
				}
			});
			zipFiles['characters.md'] = strToU8(lines.join('\n'));
		}

		// ── Connections & NPCs ───────────────────────────────────────────
		if (communities.length || npcs.length) {
			const lines: string[] = ['# Connections & NPCs', ''];
			for (const c of communities) {
				lines.push(`## ${c.name} _(Settlement)_`);
				const commDu = commPortraits.get(c.id);
				if (commDu) {
					const src = addImage(commDu, 'community', c.name);
					lines.push(`![Portrait](${src})`);
				}
				if (c.region) lines.push(`**Region:** ${c.region}`);
				if (c.location) lines.push(`**Location:** ${c.location}`);
				if (c.locationDescription) lines.push(`**Description:** ${c.locationDescription}`);
				if (c.trouble) lines.push(`**Trouble:** ${c.trouble}`);
				if (c.notes?.trim()) lines.push(``, `**Notes:**`, c.notes.trim());
				lines.push('');
			}
			for (const n of npcs) {
				lines.push(`## ${n.name} _(NPC)_`);
				const npcDu = npcPortraits.get(n.id);
				if (npcDu) {
					const src = addImage(npcDu, 'npc', n.name);
					lines.push(`![Portrait](${src})`);
				}
				if (n.role) lines.push(`**Role:** ${n.role}`);
				if (n.goal) lines.push(`**Goal:** ${n.goal}`);
				if (n.descriptor) lines.push(`**Descriptor:** ${n.descriptor}`);
				if (n.relationship)
					lines.push(
						`**Relationship:** ${n.relationship.charAt(0).toUpperCase() + n.relationship.slice(1)}`,
					);
				if (n.location) lines.push(`**Location:** ${n.location}`);
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
				const expDu = expPortraits.get(exp.id);
				if (expDu) {
					const src = addImage(expDu, 'expedition', exp.name);
					lines.push(`![Portrait](${src})`);
				}
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
						.map((id) => (id ? (findFoe(id)?.name ?? id) : null))
						.filter(Boolean) as string[];
					if (activeDenizens.length > 0) lines.push(`- **Denizens:** ${activeDenizens.join(', ')}`);
				}
				if (exp.notes?.trim()) lines.push(``, `**Notes:**`, exp.notes.trim());
				lines.push('');
			}
			zipFiles['expeditions.md'] = strToU8(lines.join('\n').trimEnd());
		}

		// ── Foes ─────────────────────────────────────────────────────────
		// Markdown only: encounters are transient (deleted session to session)
		// and are deliberately excluded from the JSON export.
		if (encounters.length) {
			const lines: string[] = ['# Foes', ''];
			for (const enc of encounters) {
				const def = findFoe(enc.foeId);
				const name = enc.customName?.trim() || def?.name || enc.foeId;
				lines.push(`## ${name}`);
				if (enc.vanquished) lines.push(`- **Status:** Vanquished`);
				if (def?.nature) lines.push(`- **Nature:** ${def.nature}`);
				lines.push(`- **Rank:** ${FOE_RANKS[enc.effectiveRank]?.label ?? enc.effectiveRank}`);
				lines.push(
					`- **Quantity:** ${enc.quantity.charAt(0).toUpperCase() + enc.quantity.slice(1)}`,
				);
				lines.push(`- **Progress:** ${formatTicks(enc.ticks)}`);
				if (enc.notes?.trim()) lines.push(``, `**Notes:**`, enc.notes.trim());
				lines.push('');
			}
			zipFiles['foes.md'] = strToU8(lines.join('\n').trimEnd());
		}

		// ── Campaign Maps ────────────────────────────────────────────────
		// Each map contributes a `maps/<mapId>/` folder with the same
		// per-map zip contents `exportMapZip()` produces (manifest.json
		// + map.json + optional background.jpg). A tiny top-level
		// `maps.md` lists them with relative links so a human can
		// navigate the bundle without unzipping into an editor first.
		try {
			const mapListRes = await fetch('/api/session/maps');
			if (mapListRes.ok) {
				const listBody = (await mapListRes.json()) as {
					maps?: Array<{ id: string; name: string; updatedAt: string }>;
				};
				const maps = Array.isArray(listBody.maps) ? listBody.maps : [];
				const mapsMdLines: string[] = [];
				if (maps.length) {
					mapsMdLines.push('# Campaign Maps', '');
				}
				for (const summary of maps) {
					const detailRes = await fetch(`/api/session/maps/${summary.id}`);
					if (!detailRes.ok) continue;
					const detail = (await detailRes.json()) as {
						id: string;
						name: string;
						markers: Array<Record<string, unknown>>;
						backgroundHash: string | null;
						settings: Record<string, unknown>;
					};
					const bgUrl = detail.backgroundHash
						? `/api/session/maps/${detail.id}/background?v=${encodeURIComponent(
								detail.backgroundHash,
							)}`
						: '';
					const entries = await buildMapZipEntries({
						name: detail.name,
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						markers: detail.markers as any,
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						settings: detail.settings as any,
						backgroundUrl: bgUrl,
					});
					const dir = `maps/${detail.id}`;
					for (const [path, bytes] of Object.entries(entries)) {
						zipFiles[`${dir}/${path}`] = bytes;
					}
					mapsMdLines.push(`## ${detail.name || 'Untitled Map'}`);
					mapsMdLines.push(
						`- Markers: ${Array.isArray(detail.markers) ? detail.markers.length : 0}`,
					);
					mapsMdLines.push(`- [Data](./${dir}/map.json)`);
					if (entries['background.jpg']) {
						mapsMdLines.push(`- ![Background](./${dir}/background.jpg)`);
					}
					mapsMdLines.push('');
				}
				if (mapsMdLines.length > 0) {
					zipFiles['maps.md'] = strToU8(mapsMdLines.join('\n').trimEnd());
				}
			}
		} catch {
			// Best-effort — a failed maps fetch doesn't block the rest of
			// the bundle. The user still gets characters / connections /
			// expeditions / log; maps just missing from this snapshot.
		}

		// ── Session Log ──────────────────────────────────────────────────
		zipFiles['session-log.md'] = strToU8(logToMarkdown(sessionLog.entries));

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
	async function embedCharForExport(c: CharacterFull): Promise<{
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
	async function embedEntityForExport<
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
		// A Place's parent settlement is exported BY NAME (ids are minted
		// per-user, so a raw id never re-links on another ledger). Drop the id
		// and record the current settlement's name; import resolves it back.
		if (seg === 'places') {
			const p = out as unknown as Place;
			const parentName = p.withinSettlementId
				? communities.find((c) => c.id === p.withinSettlementId)?.name
				: undefined;
			if (parentName) p.withinSettlementName = parentName;
			delete p.withinSettlementId;
		}
		return out;
	}

	/** Fetch every map the user owns and build its zip entries under
	 *  `maps/<mapId>/…` (manifest.json + map.json + optional background.jpg),
	 *  plus a `maps.md` index. Shared by the "All Maps" export and the
	 *  Everything bundle, which nests the same dirs alongside its JSON body so
	 *  a full backup captures maps + markers + backgrounds. */
	/** Resolve a map owner's (kind, id) to the owning entity's current name,
	 *  or undefined if it no longer exists. `journey`/`site` both live in the
	 *  expeditions store; `npc` is never a map owner. */
	function mapOwnerName(kind: MapOwnerKind, id: string): string | undefined {
		if (kind === 'community') return communities.find((c) => c.id === id)?.name || undefined;
		if (kind === 'place') return places.find((p) => p.id === id)?.name || undefined;
		return expeditions.find((e) => e.id === id)?.name || undefined; // journey | site
	}

	async function collectMapEntries(mapIdFilter?: Set<string>): Promise<{
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
			const entries = await buildMapZipEntries({
				name: detail.name,
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				markers: detail.markers as any,
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

	// Comprehensive export — build the payload from the dialog's selection.
	// Zip fully honours the selection (per-category and per-item); Markdown is
	// still whole-campaign except for a log-only pick (per-category markdown
	// filtering is a follow-up). Foes are never in the JSON — transient
	// encounters — so they surface only in the Markdown bundle.
	async function handleExportSelection(sel: ExportSelection) {
		const stamp = makeTimestamp();
		const charSet = new Set(sel.characters);
		const expSet = new Set(sel.expeditions);
		const mapSet = new Set(sel.maps);
		const commSet = new Set(sel.communities);
		const npcSet = new Set(sel.npcs);
		const placeSet = new Set(sel.places);
		const selChars = chars.filter((c) => charSet.has(c.id));
		const selExps = expeditions.filter((e) => expSet.has(e.id));
		const selComms = communities.filter((c) => commSet.has(c.id));
		const selNpcs = npcs.filter((n) => npcSet.has(n.id));
		const selPlaces = places.filter((p) => placeSet.has(p.id));
		const wantConn = selComms.length > 0 || selNpcs.length > 0 || selPlaces.length > 0;

		// ── Markdown ──────────────────────────────────────────────────────────
		if (sel.format === 'md') {
			const onlyLog =
				selChars.length === 0 && selExps.length === 0 && !wantConn && mapSet.size === 0 && sel.log;
			if (onlyLog) {
				downloadFile(`session-log-${stamp}.md`, logToMarkdown(sessionLog.entries), 'text/markdown');
				return;
			}
			await exportMarkdownZip(stamp);
			return;
		}

		// ── Zip (re-importable; merges by whichever keys are present) ───────────
		const payload: Record<string, unknown> = {};
		let count = 0;
		if (selChars.length) {
			payload.characters = await Promise.all(selChars.map(embedCharForExport));
			count += selChars.length;
		}
		if (selComms.length) {
			payload.communities = await Promise.all(
				selComms.map((c) => embedEntityForExport('communities', c)),
			);
			count += selComms.length;
		}
		if (selNpcs.length) {
			payload.npcs = await Promise.all(selNpcs.map((n) => embedEntityForExport('npcs', n)));
			count += selNpcs.length;
		}
		if (selPlaces.length) {
			payload.places = await Promise.all(selPlaces.map((p) => embedEntityForExport('places', p)));
			count += selPlaces.length;
		}
		if (selExps.length) {
			payload.expeditions = await Promise.all(
				selExps.map((e) => embedEntityForExport('expeditions', e)),
			);
			count += selExps.length;
		}
		if (sel.log) {
			const entries = [...sessionLog.entries].reverse();
			payload.log = entries;
			count += entries.length;
		}
		payload.session = { activeCharId, activeFoeId, activeExpeditionId };

		// Selected maps ride along as nested `maps/<id>/…` dirs (markers +
		// background bytes). No id filter → every map; here we pass the picked set.
		const { mapFiles } = mapSet.size
			? await collectMapEntries(mapSet)
			: { mapFiles: {} as Record<string, Uint8Array> };
		count += mapSet.size;

		await exportZip('everything', payload, count, `ironledger-export-${stamp}.zip`, mapFiles);
	}
</script>

<svelte:head>
	<title>Iron Ledger</title>
</svelte:head>

<!-- Hidden file input — accepts only the `.zip` bundles produced by
     `exportZip()`. Legacy bare-JSON imports were dropped when the
     export format switched to zip. -->
<input bind:this={importInput} type="file" accept=".zip,application/zip" style="display: none" />

<!-- Top-level error bar — shows import failures from sanitization, parsing,
     or post-parse validation. Selecting Import from the menu opens the file
     picker directly; any failure surfaces here. -->
<div class="error-bar-host">
	<ErrorBar message={importError} onDismiss={() => (importError = '')} />
</div>

<!-- ID-collision prompt — surfaces only when an import's NPC/community/expedition
     ids clash with the active session. onImportFile awaits its open() promise
     before routing the import payload through the per-type appenders. -->
<ImportCollisionDialog bind:this={importCollisionRef} />

<!-- Owned-map conflict prompt — surfaces during an Everything import when a
     bundled map re-links to an owner that already has a map (Replace / Skip). -->
<MapOwnerConflictDialog bind:this={mapConflictRef} />

<div
	bind:this={shellEl}
	class="home-shell"
	class:home-shell--layout-tabs={layoutMode === 'tabs'}
	class:home-shell--layout-log={layoutMode === 'log'}
	class:home-shell--dragging={dragging}
	class:home-shell--mob-dragging={mobDragging}
	class:home-shell--col-dragging={colDragging}
	class:home-shell--row-dragging={rowDragging}
	style:--log-width="{logWidth}px"
	style:--mob-log-height="{mobLogHeight}px"
	style:--col1-width={col1Width !== null ? col1Width + 'px' : undefined}
	style:--row-height={rowHeight !== null ? rowHeight + 'px' : undefined}
>
	<!-- Mobile tab bar (hidden on desktop via CSS) -->
	<nav class="mob-tabbar">
		<button
			class="mob-tab"
			class:mob-tab--active={mobileTab === 'characters'}
			onclick={() => (mobileTab = 'characters')}
		>
			<span class="mob-tab-icon" aria-hidden="true">{@html charactersIconSvg}</span>Characters
		</button>
		<button
			class="mob-tab"
			class:mob-tab--active={mobileTab === 'foes'}
			onclick={() => (mobileTab = 'foes')}
		>
			<span class="mob-tab-icon" aria-hidden="true">{@html foesIconSvg}</span>Foes
		</button>
		<button
			class="mob-tab"
			class:mob-tab--active={mobileTab === 'expeditions'}
			onclick={() => (mobileTab = 'expeditions')}
		>
			<span class="mob-tab-icon" aria-hidden="true">{@html expeditionsIconSvg}</span>Expeditions
		</button>
		<button
			class="mob-tab"
			class:mob-tab--active={mobileTab === 'communities'}
			onclick={() => (mobileTab = 'communities')}
		>
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
			onmousedown={startRowResize}
			ontouchstart={startRowResize}
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
		ontouchstart={startColResize}
	></div>

	<!-- Column 2: Expeditions (top) + Connections (bottom) -->
	<div bind:this={expCommColEl} class="home-col home-col--exp-comm">
		<section
			class="home-area home-area--expeditions"
			class:mob-hidden={mobileTab !== 'expeditions'}
		>
			<ExpeditionsArea bind:this={expAreaRef} showTitle={!isMobile} />
		</section>
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<div
			class="row-resize-handle"
			role="separator"
			aria-label="Resize expeditions and connections"
			aria-orientation="horizontal"
			onmousedown={startRowResize}
			ontouchstart={startRowResize}
		></div>
		<section
			class="home-area home-area--communities"
			class:mob-hidden={mobileTab !== 'communities'}
		>
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
		ontouchstart={startResize}
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
			onMoveLink={(moveId, harm) =>
				document.dispatchEvent(
					new CustomEvent('ironledger:open-move', { detail: { id: moveId, harm } }),
				)}
			onOracleLink={(key, stat) =>
				document.dispatchEvent(
					new CustomEvent('ironledger:open-oracle', { detail: { key, stat } }),
				)}
			onProgressLink={(track, value, expId, foeId) => {
				if (track === 'combat') {
					foeAreaRef?.applyMenace(value, foeId);
				} else if (track === 'journey' || track === 'delve' || track === 'scene') {
					expAreaRef?.applyProgress(value, expId);
				}
			}}
			onCountdownLink={(_track, value, expId) => expAreaRef?.applyCountdown(value, expId)}
			onInitiativeLink={(value, charId) => {
				const id = charId || activeDiceCtx?.charId;
				if (id) {
					const numVal = value === 'character' ? 1 : value === 'foe' ? 2 : 0;
					triggerAction({ charId: id, type: 'set', key: 'initiative', value: numVal });
				}
			}}
			onMenaceLink={(value, foeId) => foeAreaRef?.applyMenace(value, foeId)}
			onVanquishFoe={(foeId) => foeAreaRef?.vanquishFoe(foeId)}
			onChangeTheme={(id) => expAreaRef?.openChangeThemeForExp(id)}
			onChangeDomain={(id) => expAreaRef?.openChangeDomainForExp(id)}
		/>
		<CommandBar />
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
	.error-bar-host:empty {
		display: none;
	}

	/* ── Desktop layout ──────────────────────────────────────────────────────── */

	.home-shell {
		display: grid;
		/* col1 | col-handle | col2 | log-handle | log */
		grid-template-columns: var(--col1-width, 1fr) 6px 1fr 6px var(--log-width, 33vw);
		gap: 0;
		/* Fill <main> as a flex item — main is `display: flex` column with
		   flex: 1 inside a 100dvh body, so `flex: 1` reliably gives us the
		   full available height (more robust than `height: 100%` on Safari). */
		flex: 1;
		min-height: 0;
		/* Safe-area padding lives here (not on body) so the shell itself
		   extends edge-to-edge and its content avoids the home indicator
		   and any landscape notch. */
		padding: 10px;
		padding-bottom: max(10px, env(safe-area-inset-bottom));
		padding-left: max(10px, env(safe-area-inset-left));
		padding-right: max(10px, env(safe-area-inset-right));
		background: var(--bg);
		box-sizing: border-box;
		overflow: hidden;
	}
	.home-shell--dragging {
		cursor: col-resize;
		user-select: none;
	}
	.home-shell--dragging * {
		pointer-events: none;
	}
	.home-shell--mob-dragging {
		cursor: row-resize;
		user-select: none;
	}
	.home-shell--mob-dragging * {
		pointer-events: none;
	}
	.home-shell--col-dragging {
		cursor: col-resize;
		user-select: none;
	}
	.home-shell--col-dragging * {
		pointer-events: none;
	}
	.home-shell--row-dragging {
		cursor: row-resize;
		user-select: none;
	}
	.home-shell--row-dragging * {
		pointer-events: none;
	}

	/* Desktop log resize handle (vertical bar, right edge) */
	.home-resize-handle {
		width: 6px;
		cursor: col-resize;
		background: transparent;
		position: relative;
		transition: background 0.12s;
		z-index: 1;
		/* Suppress browser gestures (scroll/pinch) on touch drag so the
		   handler can read every touchmove without the page scrolling. */
		touch-action: none;
	}
	.home-resize-handle::before {
		content: '';
		position: absolute;
		top: 0;
		bottom: 0;
		left: 50%;
		width: 1px;
		background: var(--border);
		transform: translateX(-50%);
		transition:
			background 0.12s,
			width 0.12s;
	}
	.home-resize-handle:hover::before,
	.home-shell--dragging .home-resize-handle::before {
		background: var(--text-accent);
		width: 2px;
	}

	/* Desktop column + row resize handles — the gap itself is the grab
	   surface; no visible divider line. The `col-resize` / `row-resize`
	   cursor is the only affordance, appearing on hover over the gap.
	   `touch-action: none` suppresses browser scroll/pinch so the touch
	   handler can read every move. */
	.col-resize-handle {
		cursor: col-resize;
		background: transparent;
		z-index: 1;
		touch-action: none;
	}
	.row-resize-handle {
		cursor: row-resize;
		background: transparent;
		z-index: 1;
		touch-action: none;
	}

	/* Both columns share ONE row-split so the horizontal dividers stay
	   aligned across the deck (drag either handle → both move). */
	.home-col {
		display: grid;
		gap: 0;
		min-width: 0;
		min-height: 0;
		grid-template-rows: var(--row-height, 1fr) 6px 1fr;
	}

	.home-area {
		background: var(--bg-inset);
		border: 1px solid var(--border);
		border-radius: 6px;
		overflow: hidden;
		min-width: 0;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}

	.home-log {
		background: var(--bg-inset);
		border: 1px solid var(--border);
		border-radius: 6px;
		overflow: hidden;
		display: flex;
		flex-direction: column;
	}
	/* Let LogPanel expand into the aside; CommandBar sits under it at natural
	   size (it sets flex-shrink: 0 itself). */
	.home-log :global(.log-panel) {
		flex: 1;
		min-height: 0;
	}

	/* Mobile-tabbar button styling — visible only in `tabs` layout
	   (see `.home-shell--layout-tabs .mob-tabbar` below). Declared
	   here at top level so the same button styles apply whether the
	   tabbar is used on mobile or in Tabs mode on desktop, and — via
	   the log-layout selectors further down — inside the Log mode's
	   left column too. */
	.mob-tabbar {
		display: none;
	}
	.mob-resize-handle {
		display: none;
	}
	.mob-tab {
		flex: 1;
		padding: 7px 4px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 3px;
		font-family: var(--font-ui);
		font-size: 0.6rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--text-muted);
		background: transparent;
		border: none;
		border-bottom: 2px solid transparent;
		cursor: pointer;
		transition:
			color 0.1s,
			border-color 0.1s;
	}
	.mob-tab--active {
		color: var(--text-accent);
		border-bottom-color: var(--text-accent);
	}
	.mob-tab-icon {
		display: flex;
		width: 18px;
		height: 18px;
		flex-shrink: 0;
	}
	.mob-tab-icon :global(svg) {
		width: 100%;
		height: 100%;
	}
	.mob-tab-icon :global(svg path) {
		fill: currentColor;
	}

	/* ── Layout: Tabs (mobile-style + desktop Tabs mode) ───────────────────── */
	/* Triggered by JS-computed `layoutMode === 'tabs'` — mobile
	   viewport always maps to `'tabs'` via the `isMobile` derived,
	   and desktop users can pick it explicitly from the hamburger's
	   View submenu. Replaces the old `@media (max-width: 900px)`
	   block so the same rules apply in both places. */
	.home-shell--layout-tabs {
		display: flex;
		flex-direction: column;
		grid-template-columns: unset;
		padding: 0;
		/* No padding-bottom on tabs mode — the log lives at the
		   bottom and carries its own safe-area-inset internally so its
		   surface extends edge-to-edge while entries clear the home
		   indicator. */
		padding-left: env(safe-area-inset-left);
		padding-right: env(safe-area-inset-right);
	}

	/* Columns become transparent — sections flow directly into the flex shell */
	.home-shell--layout-tabs .home-col {
		display: contents;
	}

	/* Desktop gutters and resize handles invisible in Tabs mode */
	.home-shell--layout-tabs .home-resize-handle,
	.home-shell--layout-tabs .col-resize-handle,
	.home-shell--layout-tabs .row-resize-handle {
		display: none;
	}

	/* Tab bar visible; areas fill the remaining flex space; non-active tabs hidden */
	.home-shell--layout-tabs .mob-tabbar {
		display: flex;
		flex-shrink: 0;
		background: var(--bg-control);
		border-bottom: 1px solid var(--border);
	}
	.home-shell--layout-tabs .home-area {
		flex: 1;
		min-height: 0;
		border-radius: 0;
		border: none;
		border-top: 1px solid var(--border);
	}
	.home-shell--layout-tabs .home-area.mob-hidden {
		display: none;
	}

	/* Vertical resize handle between panels and log */
	.home-shell--layout-tabs .mob-resize-handle {
		display: block;
		flex-shrink: 0;
		height: 10px;
		cursor: row-resize;
		background: transparent;
		position: relative;
		z-index: 1;
		touch-action: none;
	}
	.home-shell--layout-tabs .mob-resize-handle::before {
		content: '';
		position: absolute;
		left: 0;
		right: 0;
		top: 50%;
		height: 1px;
		background: var(--border);
		transform: translateY(-50%);
		transition:
			background 0.12s,
			height 0.12s;
	}
	.home-shell--layout-tabs .mob-resize-handle:hover::before,
	.home-shell--layout-tabs.home-shell--mob-dragging .mob-resize-handle::before {
		background: var(--text-accent);
		height: 2px;
	}

	/* Log at bottom */
	.home-shell--layout-tabs .home-log {
		height: var(--mob-log-height, 25vh);
		flex: none;
		min-height: 0;
		border-radius: 0;
		border: none;
		border-top: 1px solid var(--border);
		margin-left: 0;
	}

	/* ── Layout: Log (log-dominant, panels tabbed on the left) ─────────────── */
	/* Two-column grid: mobile-style tabbar + one panel on the left,
	   log column on the right. `home-resize-handle` becomes the sole
	   vertical divider (position drives `--log-width` — same key
	   Grid mode uses, so the log column width stays consistent when
	   flipping between the two). Row / column resize handles hide
	   since Log mode has none of those axes. */
	.home-shell--layout-log {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 6px var(--log-width, 50%);
		grid-template-rows: auto 1fr;
		grid-template-areas:
			'tabs .      log'
			'panel handle log';
		padding: 10px;
		padding-bottom: max(10px, env(safe-area-inset-bottom));
		padding-left: max(10px, env(safe-area-inset-left));
		padding-right: max(10px, env(safe-area-inset-right));
	}
	.home-shell--layout-log .home-col {
		display: contents;
	}
	.home-shell--layout-log .mob-tabbar {
		grid-area: tabs;
		display: flex;
		flex-shrink: 0;
		background: var(--bg-control);
		border-bottom: 1px solid var(--border);
		border-top-left-radius: 6px;
		border-top-right-radius: 6px;
	}
	.home-shell--layout-log .home-area {
		grid-area: panel;
		min-height: 0;
		border-top: none;
		border-top-left-radius: 0;
		border-top-right-radius: 0;
	}
	.home-shell--layout-log .home-area.mob-hidden {
		display: none;
	}
	.home-shell--layout-log .home-resize-handle {
		grid-area: handle;
	}
	.home-shell--layout-log .home-log {
		grid-area: log;
	}
	.home-shell--layout-log .col-resize-handle,
	.home-shell--layout-log .row-resize-handle,
	.home-shell--layout-log .mob-resize-handle {
		display: none;
	}
</style>
