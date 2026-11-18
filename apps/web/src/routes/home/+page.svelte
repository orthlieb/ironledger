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
	import { loadCharacters, getCharacters } from '#lib/characterStore.svelte.js';
	import { loadEncounters, getEncounters } from '#lib/encounterStore.svelte.js';
	import { loadExpeditions, getExpeditions } from '#lib/expeditionStore.svelte.js';
	import { loadCommunities, getCommunities } from '#lib/communityStore.svelte.js';
	import { loadNpcs, getNpcs } from '#lib/npcStore.svelte.js';
	import { loadPlaces, getPlaces } from '#lib/placeStore.svelte.js';
	import { loadAssets } from '#lib/assetStore.svelte.js';
	import { loadFoes } from '#lib/foeStore.svelte.js';
	import { loadExtensions } from '#lib/expansionStore.svelte.js';
	import { viewMode } from '#lib/viewModeStore.svelte.js';
	import LogPanel from '#lib/components/LogPanel.svelte';
	import CommandBar from '#lib/components/CommandBar.svelte';
	import CharactersArea from '#lib/components/v2/CharactersArea.svelte';
	import FoesArea from '#lib/components/v2/FoesArea.svelte';
	import ExpeditionsArea from '#lib/components/v2/ExpeditionsArea.svelte';
	import CommunitiesArea from '#lib/components/v2/CommunitiesArea.svelte';
	import ImportCollisionDialog from '#lib/components/ImportCollisionDialog.svelte';
	import ImportDialog from '#lib/components/ImportDialog.svelte';
	import ExportProgressDialog from '#lib/components/ExportProgressDialog.svelte';
	import MapOwnerConflictDialog from '#lib/components/MapOwnerConflictDialog.svelte';
	import type { CollisionItems, CollisionStrategy } from '#lib/components/importCollision.js';
	import { getActiveDiceCtx } from '#lib/diceContext.svelte.js';
	import { getActiveFoeId, getActiveExpeditionId } from '#lib/activeContext.svelte.js';
	import type { ExportSelection } from '#lib/exportSelection.js';
	import { CampaignImport } from '#lib/campaignImport.svelte.js';
	import { CampaignExport } from '#lib/campaignExport.svelte.js';
	import { appIcon } from '#lib/liveryIcons.js';

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
	} | null>(null);

	/** Ref to FoesArea. */
	let foeAreaRef = $state<{
		selectFoe(id: string): void;
	} | null>(null);

	/** Active dice context — the active character, for LogPanel's burn. */
	const activeDiceCtx = $derived(getActiveDiceCtx());

	/** The hidden file input the menu's Import and a dropped file feed. */
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

	/** Import (lib/campaignImport.svelte.ts): the ImportDialog's state and the
	 *  import that drives it. The page lends it what only the page has. */
	const importer = new CampaignImport({
		storesLoaded: () => initialLoad,
		chooseCollisionStrategy: async (items) => (await importCollisionRef?.open(items)) ?? 'cancel',
		chooseMapConflict: async (names) => (await mapConflictRef?.open(names)) ?? 'skip',
		resetInput: () => {
			if (importInput) importInput.value = '';
		},
	});
	/** Export (lib/campaignExport.svelte.ts): the busy overlay's state. */
	const exporter = new CampaignExport();

	// Dismissing the dialog (✕/Escape) mid-review counts as "cancel" so the
	// paused import settles instead of hanging.
	$effect(() => {
		if (!importer.dialogOpen) importer.answerReview(false);
	});

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
					getExpeditions().length === 0 &&
					getCommunities().length === 0 &&
					getNpcs().length === 0 &&
					getPlaces().length === 0 &&
					getEncounters().length === 0;
				if (!empty) return;
				const res = await fetch('/about/ironlands-starter.zip');
				if (!res.ok) return;
				const blob = await res.blob();
				const file = new File([blob], 'ironlands-starter.zip', {
					type: 'application/zip',
				});
				// Import quietly — no dialog for the first-run starter seed.
				await importer.run(file, { silent: true });
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
		// immune to the recreation. Scoped with a `data-import-root="home"`
		// attribute so this capture-phase handler ONLY matches the hidden
		// input on this page, not the ImportDialog's own file input (which
		// has the same `accept` but handles its own onchange). Without the
		// data attribute the two handlers raced on every pick and runImport
		// fired twice — the user saw "76 of 39" on the progress bar.
		const onImportChange = (e: Event) => {
			const t = e.target as HTMLElement | null;
			if (t?.matches?.('input[type="file"][data-import-root="home"]')) onImportFile(e);
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

		// `/site.theme` and `/site.domain` in the command bar open the site's
		// picker, as its log links do.
		const onSitePicker = (e: Event) => {
			const d = (e as CustomEvent<{ expId: string; which: 'theme' | 'domain' }>).detail;
			if (!d) return;
			if (d.which === 'theme') expAreaRef?.openChangeThemeForExp(d.expId);
			else expAreaRef?.openChangeDomainForExp(d.expId);
		};

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

		document.addEventListener('ironledger:site-picker', onSitePicker);
		document.addEventListener('ironledger:focus-entity', onFocusEntity);

		return () => {
			document.removeEventListener('change', onImportChange, true);
			document.removeEventListener('il-menu-action', handleMenuAction);
			document.removeEventListener('ironledger:site-picker', onSitePicker);
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
			importer.open();
		} else if (detail.action === 'export' && detail.selection) {
			void exporter
				.run(detail.selection, {
					activeCharId: activeDiceCtx?.charId ?? '',
					activeFoeId: getActiveFoeId(),
					activeExpeditionId: getActiveExpeditionId(),
				})
				.catch((err) => console.error('[home] export failed', err));
		}
	}

	// ── Import ───────────────────────────────────────────────────────────────
	/** Thin adapter for the hidden <input> / page-drop path. */
	function onImportFile(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (file) void importer.run(file);
	}
</script>

<svelte:head>
	<title>Iron Ledger</title>
</svelte:head>

<!-- Hidden file input — accepts only the `.zip` bundles produced by
     `exportZip()`. Legacy bare-JSON imports were dropped when the
     export format switched to zip. The `data-import-root="home"`
     attribute scopes the document-level change listener attached in
     onMount to THIS input only — the ImportDialog has its own file
     input with the same `accept`, and without the data-attribute scope
     both the ImportDialog's own onchange AND the document capture
     handler fired on each pick, running runImport twice concurrently. -->
<input
	bind:this={importInput}
	type="file"
	accept=".zip,application/zip"
	data-import-root="home"
	style="display: none"
/>

<!-- Import dialog — file chooser → progress → validation review (apply the
     valid rows?) → done / error, driven by importer.run(). -->
<ImportDialog
	bind:open={importer.dialogOpen}
	stage={importer.stage}
	summary={importer.summary}
	liveSummary={importer.liveSummary}
	errors={importer.errors}
	warnings={importer.warnings}
	validCount={importer.validCount}
	progress={importer.progress}
	onfile={(file) => void importer.run(file)}
	onreview={(proceed) => importer.answerReview(proceed)}
	onreset={() => importer.reset()}
/>

<!-- Export busy overlay — gathers portraits + compresses the zip. Shown while
     exporter.run() works; closes when the download fires or an error is
     caught (progress → null in its finally). -->
<ExportProgressDialog
	open={exporter.progress !== null}
	progress={exporter.progress}
	summary={exporter.summary}
	warnings={exporter.warnings}
	held={exporter.held}
	onclose={() => exporter.dismiss()}
/>

<!-- Name-collision prompt — surfaces only when an import's rows share names
     with rows already here; the importer awaits its open() promise. -->
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
			data-tour="tab-characters"
		>
			<span class="mob-tab-icon" aria-hidden="true">{@html appIcon('characters')}</span>Characters
		</button>
		<button
			class="mob-tab"
			class:mob-tab--active={mobileTab === 'foes'}
			onclick={() => (mobileTab = 'foes')}
			data-tour="tab-foes"
		>
			<span class="mob-tab-icon" aria-hidden="true">{@html appIcon('foes')}</span>Foes
		</button>
		<button
			class="mob-tab"
			class:mob-tab--active={mobileTab === 'expeditions'}
			onclick={() => (mobileTab = 'expeditions')}
			data-tour="tab-expeditions"
		>
			<span class="mob-tab-icon" aria-hidden="true">{@html appIcon('expeditions')}</span>Expeditions
		</button>
		<button
			class="mob-tab"
			class:mob-tab--active={mobileTab === 'communities'}
			onclick={() => (mobileTab = 'communities')}
			data-tour="tab-connections"
		>
			<span class="mob-tab-icon" aria-hidden="true">{@html appIcon('connections')}</span>Connections
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
		<LogPanel ctx={activeDiceCtx} />
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
