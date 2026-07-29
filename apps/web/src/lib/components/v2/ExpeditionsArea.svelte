<script lang="ts">
	/**
	 * ExpeditionsArea (v2 prototype) — Expeditions deck stage.
	 *
	 * Mirrors FoesArea / CharactersArea: vertical spine tabs on the LEFT,
	 * a name+delete banner on top of the stage, and per-card content below.
	 * For JOURNEYS, the v1 JourneyCard is decomposed into a two-tab layout
	 * (Description / Core), matching the FoesArea pattern. For SITES we
	 * continue to render the v1 SiteCard as-is (will be rebuilt later).
	 *
	 * All edits persist through expeditionStore.
	 */
	import {
		getExpeditions,
		isExpeditionLoading,
		persistExpeditionsNow,
		removeExpedition,
		addExpedition,
	} from '$lib/expeditionStore.svelte.js';
	import type {
		Expedition,
		Journey,
		Site,
		VowDifficulty,
		DelveTheme,
		DelveDomain,
		FoeDef,
		FoeQuantity,
		FoeEncounter,
	} from '$lib/types.js';
	import { EXPEDITION_MARK_TICKS, DENIZEN_CELLS, DELVE_THEMES, DELVE_DOMAINS } from '$lib/types.js';
	import Select from '$lib/components/Select.svelte';
	import { difficultyBadgeStyle } from '$lib/badgeStyles.js';
	import { isDelveEnabled } from '$lib/expansionStore.svelte.js';
	import { setActiveExpeditionId } from '$lib/activeContext.svelte.js';
	import { tooltip } from '$lib/actions/tooltip.js';
	import { loadDelveData, buildCombinedTable } from '$lib/delveStore.svelte.js';
	import { rollFromRangeTable } from '$lib/oracleStore.svelte.js';
	import { appendLog } from '$lib/log.svelte.js';
	import { addEncounter } from '$lib/encounterStore.svelte.js';
	import { onMount } from 'svelte';

	import ProgressTrackPanel from '$lib/components/ProgressTrackPanel.svelte';
	import MarkdownNotes from '$lib/components/MarkdownNotes.svelte';
	import PortraitUploader from '$lib/components/PortraitUploader.svelte';
	import FoePickerDialog from '$lib/components/FoePickerDialog.svelte';
	import DenizenDialog from '$lib/components/DenizenDialog.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import ExpeditionOptionsDialog from '$lib/components/ExpeditionOptionsDialog.svelte';
	import MapDialog from '$lib/components/MapDialog.svelte';
	import {
		entityMarkerIndexState,
		loadEntityMarkerIndex,
		mapListState,
		markersForEntity,
		openMapForOwner,
		setBackground,
		type EntityMarkerRef,
	} from '$lib/mapStore.svelte.js';
	import { downscaleImage, MapImageError } from '$lib/mapImage.js';
	import { formatEntityId } from '$lib/mapEntityLinks.js';
	import iconGearSvg from '$icons/gear-solid-full.svg?raw';
	import iconCaretDownSvg from '$icons/caret-large-down-solid.svg?raw';
	import searchIconSvg from '$icons/magnifying-glass-solid-full.svg?raw';
	import checkSvg from '$icons/circle-check-solid-full.svg?raw';
	import locationSvg from '$icons/location-dot-solid-full.svg?raw';
	import SegmentedRadio from '$lib/components/SegmentedRadio.svelte';
	import { RadioGroup, Tabs, Popover, Command } from 'bits-ui';
	import { ENTITY_KIND_META } from '$lib/entityKinds.js';
	const journeyPlaceholderSvg = ENTITY_KIND_META.journey.icon;
	const sitePlaceholderSvg = ENTITY_KIND_META.site.icon;
	import diceD6Svg from '$icons/dice-d6-light.svg?raw';
	import expeditionsIconSvg from '$icons/Expeditions.svg?raw';
	import { headingText } from '$lib/fontStore.svelte.js';

	let { showTitle = true }: { showTitle?: boolean } = $props();

	// Colours + icons come from the shared kind-meta module — same
	// source of truth CommunitiesArea and the map's Link Marker picker
	// read from, so a tweak lands everywhere at once.
	const JOURNEY_COLOR = ENTITY_KIND_META.journey.color;
	const SITE_COLOR = ENTITY_KIND_META.site.color;

	type ExpTab = 'description' | 'notes' | 'core' | 'denizens';
	const JOURNEY_TAB_LABELS: { key: ExpTab; label: string }[] = [
		{ key: 'core', label: 'Core' },
		{ key: 'description', label: 'Description' },
	];
	const SITE_TAB_LABELS: { key: ExpTab; label: string }[] = [
		{ key: 'core', label: 'Core' },
		{ key: 'notes', label: 'Description' },
		{ key: 'denizens', label: 'Denizens' },
	];

	const DIFFICULTIES: { value: VowDifficulty; label: string }[] = [
		{ value: 'troublesome', label: 'Troublesome' },
		{ value: 'dangerous', label: 'Dangerous' },
		{ value: 'formidable', label: 'Formidable' },
		{ value: 'extreme', label: 'Extreme' },
		{ value: 'epic', label: 'Epic' },
	];

	let activeExpId = $state<string | null>(null);

	// Load the cross-map entity marker index once so the "📍 On map at"
	// back-ref chip renders as soon as the first expedition is opened.
	// No-op if already loaded (idempotent + de-duped).
	$effect(() => {
		void loadEntityMarkerIndex();
	});

	// Cross-component focus signal from the campaign map (or elsewhere) —
	// {kind, id} where kind is journey or site. Sets the active expedition
	// so the click-through from a map marker lands on the linked row.
	$effect(() => {
		const onFocus = (e: Event) => {
			const d = (e as CustomEvent<{ kind: string; id: string }>).detail;
			if (!d) return;
			if (d.kind !== 'journey' && d.kind !== 'site') return;
			activeExpId = d.id;
			activeTab = 'core';
		};
		document.addEventListener('ironledger:focus-entity', onFocus);
		return () => document.removeEventListener('ironledger:focus-entity', onFocus);
	});

	// Global "open the campaign map" — dispatched by the app-nav's Map
	// button in the layout, so users can reach the map from any page /
	// panel without the button crowding the Expeditions header.
	$effect(() => {
		const onOpen = () => mapDialogRef?.open();
		document.addEventListener('ironledger:open-campaign-map', onOpen);
		return () => document.removeEventListener('ironledger:open-campaign-map', onOpen);
	});
	let activeTab = $state<ExpTab>('core');
	let deleteDialogRef = $state<{ open(): void; close(): void } | null>(null);

	// New-journey / new-site dialog state (mirrors V1 pattern).
	let newJourneyDialogRef = $state<{ open(): void; close(): void } | null>(null);
	let newSiteDialogRef = $state<{ open(): void; close(): void } | null>(null);
	let expPickerOpen = $state(false);
	let expOptionsRef = $state<{ open(): void; close(): void } | null>(null);
	let mapDialogRef = $state<{
		open(target?: { mapId?: string; markerId?: string; promptUpload?: boolean }): void;
		close(): void;
	} | null>(null);

	// Site oracle roll state — gate concurrent rolls so the dice animation
	// can complete before the next roll fires.
	let rolling = $state(false);
	let denizenDialogRef = $state<{ open(site: Site): Promise<void>; close(): void } | null>(null);

	// Make sure delve themes/domains are loaded so buildCombinedTable works.
	onMount(() => {
		void loadDelveData();
	});
	let newJourneyDifficulty = $state<VowDifficulty>('dangerous');
	let newSiteDifficulty = $state<VowDifficulty>('dangerous');
	let newSiteTheme = $state<string>('');
	let newSiteDomain = $state<string>('');
	let newJourneyName = $state<string>('');
	let newSiteName = $state<string>('');

	// Inline-edit state for journeys
	let editingNotes = $state(false);

	const expeditions = $derived(getExpeditions());
	const loading = $derived(isExpeditionLoading());

	$effect(() => {
		if (!activeExpId && expeditions.length > 0) activeExpId = expeditions[0].id;
	});

	const activeExp = $derived(expeditions.find((e) => e.id === activeExpId));
	const activeSite = $derived<Site | null>(activeExp?.type === 'site' ? (activeExp as Site) : null);

	/** Display name for a spine / combobox — never blank so the popover
	 *  and the trigger have something to render. */
	function expDisplayName(e: Expedition): string {
		return (e.name || `Unnamed ${e.type === 'site' ? 'Site' : 'Journey'}`).trim();
	}

	/** Popover list sorted A→Z. Command doesn't sort — pre-sort here. */
	const sortedExpeditions = $derived(
		expeditions.slice().sort((a, b) => expDisplayName(a).localeCompare(expDisplayName(b))),
	);

	/** Back-references for the active expedition, if any. Empty until the
	 *  index has loaded. Re-derived when either the index or the active
	 *  entity changes. */
	const activeExpMarkers = $derived.by<EntityMarkerRef[]>(() => {
		if (!activeExp) return [];
		void entityMarkerIndexState.index; // subscribe
		return markersForEntity(formatEntityId(activeExp.type, activeExp.id));
	});

	/** The (possibly-not-yet-created) map summary for the active
	 *  expedition, looked up by (ownerKind, ownerId). Undefined until
	 *  either the summary list loads or the map is get-or-created. */
	const activeExpMap = $derived.by(() => {
		if (!activeExp) return undefined;
		return mapListState.maps.find(
			(m) => m.ownerKind === activeExp.type && m.ownerId === activeExp.id,
		);
	});
	/** True when the entity's map has no background image (or the map
	 *  doesn't exist at all yet). Drives the "+ Map" vs "Map" button. */
	const activeExpMapEmpty = $derived(!activeExpMap || !activeExpMap.backgroundHash);

	/** Open the entity's existing map — the "Map" button variant when
	 *  the owner already has a background uploaded. */
	async function openOwnedMap() {
		if (!activeExp) return;
		const mapId = await openMapForOwner(activeExp.type, activeExp.id, activeExp.name || 'Untitled');
		mapDialogRef?.open({ mapId: mapId ?? undefined });
	}

	/** "+ Map" variant — the button is a `<label>` wrapping a hidden
	 *  file input, so tapping it opens the OS file picker as part of
	 *  the tap's native user gesture (essential on iOS Safari, which
	 *  refuses `input.click()` calls issued from JS after any `await`).
	 *  Once the user picks a file we get-or-create the map, upload the
	 *  image, and open the dialog to show the result. */
	async function handleAddMapWithFile(e: Event) {
		if (!activeExp) return;
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		try {
			const mapId = await openMapForOwner(
				activeExp.type,
				activeExp.id,
				activeExp.name || 'Untitled',
			);
			if (!mapId) return;
			const result = await downscaleImage(file);
			await setBackground(result.dataUrl, result.aspect);
			mapDialogRef?.open({ mapId });
		} catch (err) {
			if (err instanceof MapImageError) console.warn('Add map image failed:', err.message);
			else console.error('Add map failed', err);
		}
	}

	/** Jump the dialog directly to a marker back-reference — used by the
	 *  chips under the stage header. */
	function jumpToMarker(ref: EntityMarkerRef) {
		mapDialogRef?.open({ mapId: ref.mapId, markerId: ref.markerId });
	}

	/** Short "(x, y)" for chip labels — integers stay integer, else 2dp. */
	function fmtCoord(v: number): string {
		return Number.isInteger(v) ? String(v) : v.toFixed(2);
	}

	// Publish active expedition id so MovesDialog / preconditions can see it.
	$effect(() => {
		setActiveExpeditionId(activeExpId ?? '');
	});
	const tabLabels = $derived(activeExp?.type === 'site' ? SITE_TAB_LABELS : JOURNEY_TAB_LABELS);

	function selectExp(id: string) {
		flushPersist(); // commit pending edit before switching
		activeExpId = id;
		activeTab = 'core';
		editingNotes = false;
	}

	// Site state
	let foePickerRef = $state<{
		open(): Promise<void>;
		openForDenizen(): Promise<void>;
		close(): void;
	} | null>(null);
	let denizenPickIndex = $state(-1);
	let changeThemeDialogRef = $state<{ open(): void; close(): void } | null>(null);
	let changeDomainDialogRef = $state<{ open(): void; close(): void } | null>(null);
	let newThemeValue = $state<string>('');
	let newDomainValue = $state<string>('');

	// Exported handlers for LogPanel's change-theme-link / change-domain-link
	// click delegation. Switch active expedition to the linked one, switch to
	// the Core tab, then open the existing theme/domain dialog so the user
	// confirms the choice (matches the v1 confirm flow). The dialog reads
	// activeSite, so we have to wait one tick after activeExpId changes
	// before opening, or activeSite will still be stale.
	/** Mark progress on the active expedition. `marks` = number of progress marks (each worth markTicks ticks). */
	export function applyProgress(marks: number) {
		if (activeExp) updateExp({ ticks: Math.min(40, activeExp.ticks + marks * markTicks) });
	}
	/** Mark the active expedition complete. Sibling to /foe vanquish — no-op
	 *  if already complete. */
	export function completeActiveExpedition() {
		if (!activeExp || activeExp.complete) return;
		const name = activeExp.name || 'Expedition';
		updateExp({ complete: true });
		appendLog(`${name} — Completed`, `<div><strong>Completed.</strong></div>`);
	}
	/** Reactivate a completed expedition. Sibling to /foe active — no-op if
	 *  already active. */
	export function reactivateActiveExpedition() {
		if (!activeExp || !activeExp.complete) return;
		const name = activeExp.name || 'Expedition';
		updateExp({ complete: false });
		appendLog(`${name} — Reactivated`, `<div><strong>Reactivated.</strong></div>`);
	}

	export function openChangeThemeForExp(expId: string) {
		flushPersist();
		activeExpId = expId;
		activeTab = 'core';
		queueMicrotask(() => {
			if (activeSite) {
				newThemeValue = activeSite.theme;
				changeThemeDialogRef?.open();
			}
		});
	}
	export function openChangeDomainForExp(expId: string) {
		flushPersist();
		activeExpId = expId;
		activeTab = 'core';
		queueMicrotask(() => {
			if (activeSite) {
				newDomainValue = activeSite.domain;
				changeDomainDialogRef?.open();
			}
		});
	}
	function confirmChangeTheme() {
		if (newThemeValue) updateExp({ theme: newThemeValue as Site['theme'] });
	}
	function confirmChangeDomain() {
		if (newDomainValue) updateExp({ domain: newDomainValue as Site['domain'] });
	}

	// Combined feature / danger options for the inline combo boxes.
	// Unique-by-value so the dropdown isn't full of repeats from overlapping
	// theme + domain + common-dangers rolls.
	const featureOptions = $derived.by<string[]>(() => {
		if (!activeSite || !activeSite.theme || !activeSite.domain) return [];
		const table = buildCombinedTable(
			activeSite.theme as DelveTheme,
			activeSite.domain as DelveDomain,
			'features',
		);
		const seen = new Set<string>();
		const out: string[] = [];
		for (const e of table) {
			const v = typeof e.value === 'string' ? e.value : String(e.value);
			if (!seen.has(v)) {
				seen.add(v);
				out.push(v);
			}
		}
		return out;
	});
	const dangerOptions = $derived.by<string[]>(() => {
		if (!activeSite || !activeSite.theme || !activeSite.domain) return [];
		const table = buildCombinedTable(
			activeSite.theme as DelveTheme,
			activeSite.domain as DelveDomain,
			'dangers',
		);
		const seen = new Set<string>();
		const out: string[] = [];
		for (const e of table) {
			const v = typeof e.value === 'string' ? e.value : String(e.value);
			if (!seen.has(v)) {
				seen.add(v);
				out.push(v);
			}
		}
		return out;
	});

	// Theme/Domain randomize — just pick a random entry from the master
	// list. Guard on `rolling` (same flag Feature/Danger use) so clicks
	// during an in-flight d100 animation are ignored — the buttons are
	// also `disabled={rolling}`, but keyboard Space/Enter can still
	// fire before Svelte reflects the disabled attribute on some
	// browsers.
	function randomizeTheme() {
		if (!activeSite || rolling) return;
		const v = DELVE_THEMES[Math.floor(Math.random() * DELVE_THEMES.length)];
		updateExp({ theme: v as Site['theme'] });
	}
	function randomizeDomain() {
		if (!activeSite || rolling) return;
		const v = DELVE_DOMAINS[Math.floor(Math.random() * DELVE_DOMAINS.length)];
		updateExp({ domain: v as Site['domain'] });
	}

	function handleDenizenChange(index: number, value: string) {
		if (!activeSite) return;
		const denizens = [...activeSite.denizens];
		denizens[index] = value;
		updateExp({ denizens });
	}
	function openDenizenPicker(index: number) {
		denizenPickIndex = index;
		foePickerRef?.openForDenizen();
	}
	function handleDenizenFoePick(foeName: string) {
		if (denizenPickIndex < 0) return;
		handleDenizenChange(denizenPickIndex, foeName);
		denizenPickIndex = -1;
	}

	/** Local-first edit: mutate the store's expedition immediately so the UI
	    stays in sync, but debounce the PATCH so rapid typing in notes /
	    objective / denizen inputs doesn't spam the API. */
	// Patch fields onto the active expedition proxy directly — the store
	// array identity is preserved and the deep-snapshot effect below
	// schedules a debounced API flush.
	function updateExp(patch: Partial<Expedition>) {
		if (!activeExp) return;
		Object.assign(activeExp as object, patch);
	}

	let _saveTimer: ReturnType<typeof setTimeout> | null = null;
	$effect(() => {
		if (!activeExp) return;
		$state.snapshot(activeExp);
		if (_saveTimer) clearTimeout(_saveTimer);
		_saveTimer = setTimeout(() => {
			_saveTimer = null;
			persistExpeditionsNow().catch((err) => console.error('[v2] expedition save failed', err));
		}, 1500);
		return () => {
			if (_saveTimer) {
				clearTimeout(_saveTimer);
				_saveTimer = null;
				persistExpeditionsNow().catch((err) => console.error('[v2] expedition save failed', err));
			}
		};
	});

	function flushPersist() {
		if (_saveTimer) {
			clearTimeout(_saveTimer);
			_saveTimer = null;
			persistExpeditionsNow().catch((err) => console.error('[v2] expedition save failed', err));
		}
	}

	function addJourney() {
		newJourneyDifficulty = 'dangerous';
		newJourneyName = '';
		newJourneyDialogRef?.open();
	}
	async function confirmAddJourney() {
		const j: Journey = {
			id: crypto.randomUUID(),
			type: 'journey',
			name: newJourneyName.trim() || 'New Journey',
			difficulty: newJourneyDifficulty,
			ticks: 0,
			notes: '',
			complete: false,
			createdAt: Date.now(),
		};
		await addExpedition(j);
		activeExpId = j.id;
		activeTab = 'core';
	}

	function addSite() {
		newSiteDifficulty = 'dangerous';
		newSiteTheme = '';
		newSiteDomain = '';
		newSiteName = '';
		newSiteDialogRef?.open();
	}
	async function confirmAddSite() {
		const s: Site = {
			id: crypto.randomUUID(),
			type: 'site',
			name: newSiteName.trim() || 'New Site',
			objective: '',
			notes: '',
			theme: newSiteTheme as Site['theme'],
			domain: newSiteDomain as Site['domain'],
			difficulty: newSiteDifficulty,
			ticks: 0,
			denizens: Array(12).fill(''),
			complete: false,
			createdAt: Date.now(),
		};
		await addExpedition(s);
		activeExpId = s.id;
		activeTab = 'core';
	}
	/** Roll a random theme / domain for the New Site dialog — wired to
	 *  the d6 buttons next to each dropdown (mirrors the Core-tab pattern
	 *  and the Journey has no equivalent). */
	function randomizeNewSiteTheme() {
		newSiteTheme = DELVE_THEMES[Math.floor(Math.random() * DELVE_THEMES.length)];
	}
	function randomizeNewSiteDomain() {
		newSiteDomain = DELVE_DOMAINS[Math.floor(Math.random() * DELVE_DOMAINS.length)];
	}

	async function confirmDeleteExp() {
		if (!activeExp) return;
		const id = activeExp.id;
		await removeExpedition(id);
		if (activeExpId === id) activeExpId = null;
	}

	// Derived values shared across journey + site
	const markTicks = $derived(activeExp ? EXPEDITION_MARK_TICKS[activeExp.difficulty] : 0);

	function handleTrackChange(_o: number, n: number) {
		updateExp({ ticks: n });
	}

	// ── Site oracle rolls ─────────────────────────────────────────────────
	// Mirrors v1 GlobalContextBar.gcOpenFeatures / gcOpenDangers / gcRollDenizen.
	// Disabled until the site has both a theme and a domain selected.
	const expHasThemeAndDomain = $derived(
		activeSite ? !!activeSite.theme && !!activeSite.domain : false,
	);

	async function rollFeature() {
		if (!activeSite || !expHasThemeAndDomain || rolling) return;
		rolling = true;
		try {
			// onMount fires loadDelveData() but doesn't await it; if the user
			// picks theme+domain and clicks Random Feature before the fetch
			// settles, buildCombinedTable returns [] and rollFromRangeTable
			// crashes on the empty array. Await before reading.
			await loadDelveData();
			const site = activeSite;
			const table = buildCombinedTable(
				site.theme as DelveTheme,
				site.domain as DelveDomain,
				'features',
			);
			const result = rollFromRangeTable(table);
			const valueStr = typeof result.value === 'string' ? result.value : String(result.value);
			let resultHtml = `<div>Result: <strong>${valueStr}</strong>`;
			if (result.roll === 99)
				resultHtml += ` <a class="change-theme-link"  data-expedition-id="${site.id}" href="#">Change Theme ↗</a>`;
			if (result.roll === 100)
				resultHtml += ` <a class="change-domain-link" data-expedition-id="${site.id}" href="#">Change Domain ↗</a>`;
			resultHtml += '</div>';
			appendLog(
				`Features: ${site.theme} + ${site.domain}`,
				`<div class="roll-line">Roll: d100 → ${result.roll}</div>` + resultHtml,
			);
			updateExp({ currentFeature: valueStr });
		} finally {
			rolling = false;
		}
	}

	async function rollDanger() {
		if (!activeSite || !expHasThemeAndDomain || rolling) return;
		rolling = true;
		try {
			// Same race as rollFeature — see note there.
			await loadDelveData();
			const site = activeSite;
			const table = buildCombinedTable(
				site.theme as DelveTheme,
				site.domain as DelveDomain,
				'dangers',
			);
			const result = rollFromRangeTable(table);
			const valueStr = typeof result.value === 'string' ? result.value : String(result.value);
			let resultHtml = `<div>Result: <strong>${valueStr}</strong>`;
			if (result.roll === 99)
				resultHtml += ` <a class="change-theme-link"  data-expedition-id="${site.id}" href="#">Change Theme ↗</a>`;
			if (result.roll === 100)
				resultHtml += ` <a class="change-domain-link" data-expedition-id="${site.id}" href="#">Change Domain ↗</a>`;
			resultHtml += '</div>';
			appendLog(
				`Dangers: ${site.theme} + ${site.domain}`,
				`<div class="roll-line">Roll: d100 → ${result.roll}</div>` + resultHtml,
			);
			updateExp({ currentDanger: valueStr });
		} finally {
			rolling = false;
		}
	}

	function rollDenizen() {
		if (!activeSite || rolling) return;
		void denizenDialogRef?.open(activeSite);
	}

	// When the DenizenDialog selects a foe, add it as an encounter — same
	// shape as FoesArea.handleFoeSelected.
	async function handleDenizenSelected(
		foeDef: FoeDef,
		quantity: FoeQuantity,
		effectiveRank: number,
	) {
		const enc: FoeEncounter = {
			id: crypto.randomUUID(),
			foeId: foeDef.id,
			quantity,
			effectiveRank: effectiveRank as 1 | 2 | 3 | 4 | 5,
			ticks: 0,
			notes: '',
			customName: '',
			vanquished: false,
		};
		await addEncounter(enc);
	}

	const activeColor = $derived(activeExp?.type === 'site' ? SITE_COLOR : JOURNEY_COLOR);
	const placeholderImg = $derived(
		activeExp?.type === 'site' ? sitePlaceholderSvg : journeyPlaceholderSvg,
	);
</script>

<div class="ea-area">
	<header class="ea-header">
		{#if showTitle}
			<span class="ea-title-icon" aria-hidden="true">{@html expeditionsIconSvg}</span>
			<span class="ea-title">{headingText('Expeditions')}</span>
		{/if}
		<div class="ea-header-actions" data-exp-count={expeditions.length}>
			<!-- Always show the switcher — even when the list is empty. Trigger
			     reads the active expedition name; when empty it renders a
			     muted placeholder, and the popover surfaces "+ New Journey…"
			     / "+ New Site…" as the only actions. Campaign map moved to
			     the app-nav (Map button next to Move). -->
			<Popover.Root bind:open={expPickerOpen}>
				<Popover.Trigger class="mp-combobox ea-hdr-combobox" aria-label="Switch or add expedition">
					{#if activeExp}<span class="mp-combobox-value">{expDisplayName(activeExp)}</span
						>{:else}<span class="mp-combobox-value mp-combobox-value--placeholder"
							>— No expeditions yet —</span
						>{/if}
					<span class="mp-combobox-caret" aria-hidden="true">{@html iconCaretDownSvg}</span>
				</Popover.Trigger>
				<Popover.Portal>
					<Popover.Content class="mp-cmd-popover" sideOffset={4} align="start" collisionPadding={8}>
						<Command.Root class="mp-cmd">
							<div class="mp-cmd-search-row">
								<span class="mp-cmd-search-icon" aria-hidden="true">{@html searchIconSvg}</span>
								<Command.Input class="mp-cmd-search" placeholder="Search expeditions…" autofocus />
							</div>
							<Command.List class="mp-cmd-list">
								<Command.Empty class="mp-cmd-empty">No matching expeditions.</Command.Empty>
								{#each sortedExpeditions as exp (exp.id)}
									{@const n = expDisplayName(exp)}
									{@const typeIcon =
										exp.type === 'site' ? sitePlaceholderSvg : journeyPlaceholderSvg}
									{@const typeColor = exp.type === 'site' ? SITE_COLOR : JOURNEY_COLOR}
									<Command.Item
										class="mp-cmd-item"
										value={n}
										onSelect={() => {
											selectExp(exp.id);
											expPickerOpen = false;
										}}
									>
										<span class="mp-cmd-check" aria-hidden="true">
											{#if exp.id === activeExpId}
												<svg
													viewBox="0 0 20 20"
													fill="none"
													stroke="currentColor"
													stroke-width="2.5"
													><polyline
														points="4 11 8 15 16 6"
														stroke-linecap="round"
														stroke-linejoin="round"
													></polyline></svg
												>
											{/if}
										</span>
										<span
											class="mp-cmd-item-icon ea-cmd-type-icon"
											style="color: {typeColor}"
											aria-hidden="true">{@html typeIcon}</span
										>
										<span class="mp-cmd-item-name">{n}</span>
									</Command.Item>
								{/each}
								<Command.Separator class="mp-cmd-sep" />
								<Command.Item
									class="mp-cmd-item mp-cmd-item--action"
									value="+ New Journey"
									onSelect={() => {
										expPickerOpen = false;
										addJourney();
									}}
								>
									<span class="mp-cmd-check" aria-hidden="true"></span>
									<span class="mp-cmd-item-name">+ New Journey…</span>
								</Command.Item>
								{#if isDelveEnabled()}
									<Command.Item
										class="mp-cmd-item mp-cmd-item--action"
										value="+ New Site"
										onSelect={() => {
											expPickerOpen = false;
											addSite();
										}}
									>
										<span class="mp-cmd-check" aria-hidden="true"></span>
										<span class="mp-cmd-item-name">+ New Site…</span>
									</Command.Item>
								{/if}
							</Command.List>
						</Command.Root>
					</Popover.Content>
				</Popover.Portal>
			</Popover.Root>
			{#if activeExp}
				<SegmentedRadio
					ariaLabel="Expedition status"
					labels="auto"
					value={activeExp.complete ? 'complete' : 'active'}
					onchange={(v) => updateExp({ complete: v === 'complete' })}
					options={[
						{
							value: 'active',
							icon: locationSvg,
							text: 'Active',
							label: 'Mark active',
							tone: 'go',
						},
						{
							value: 'complete',
							icon: checkSvg,
							text: 'Complete',
							label: 'Mark complete',
							tone: 'stop',
						},
					]}
				/>
				{#if activeExpMapEmpty}
					<label
						class="btn ea-stage-map-btn"
						use:tooltip={'Add a background image to this ' + activeExp.type + '’s map'}
						aria-label="Add map"
					>
						+ Map
						<input type="file" accept="image/*" hidden onchange={handleAddMapWithFile} />
					</label>
				{:else}
					<button
						class="btn ea-stage-map-btn"
						onclick={openOwnedMap}
						use:tooltip={'Open the map for this ' + activeExp.type}
						aria-label="Open map">Map</button
					>
				{/if}
				<button
					class="btn btn-icon icon-btn ea-hdr-settings-btn"
					onclick={() => expOptionsRef?.open()}
					use:tooltip={activeExp.type === 'site' ? 'Site options' : 'Journey options'}
					aria-label="Expedition options">{@html iconGearSvg}</button
				>
			{/if}
		</div>
	</header>

	{#if loading}
		<div class="ea-loading">Loading…</div>
	{:else if expeditions.length === 0}
		<div class="ea-empty">
			<span class="ea-empty-icon" aria-hidden="true">{@html expeditionsIconSvg}</span>
			<p class="ea-empty-text">
				You seem to be a homebody. Pick <strong>+ New Journey…</strong> or
				<strong>+ New Site…</strong> from the switcher above to take your first step.
			</p>
		</div>
	{:else}
		<div class="ea-body">
			{#if activeExp}
				<div
					class="ea-stage"
					class:ea-stage--complete={activeExp.complete}
					style="--ea-nature: {activeColor}"
				>
					<Tabs.Root
						value={activeTab}
						onValueChange={(v) => (activeTab = v as ExpTab)}
						class="ea-tabs-root"
					>
						<Tabs.List class="ea-tabs">
							{#each tabLabels as tab (tab.key)}
								<Tabs.Trigger value={tab.key} class="ea-tab">{tab.label}</Tabs.Trigger>
							{/each}
						</Tabs.List>
					</Tabs.Root>

					<div class="ea-card" role="tabpanel">
						<!-- ── Description / Notes — portrait floats right, prose wraps.
						     Sites get an Objective row pinned to the top of Notes; it
						     was previously in Core but lives more naturally next to the
						     prose that elaborates on it. -->
						{#if activeTab === 'description' || activeTab === 'notes'}
							{#if activeSite}
								<div class="ea-field-row ea-objective-row">
									<label class="ea-field-label" for="ea-obj-{activeSite.id}">Objective</label>
									<input
										id="ea-obj-{activeSite.id}"
										class="ea-input"
										type="text"
										placeholder="What are you seeking here?"
										value={activeSite.objective}
										oninput={(e) => updateExp({ objective: (e.target as HTMLInputElement).value })}
									/>
								</div>
							{/if}
							<div class="ea-desc-section" class:ea-desc-section--editing={editingNotes}>
								<!-- Portrait floats right and the prose wraps around it; it's
								     hidden while editing so the textarea fills the whole panel. -->
								{#if !editingNotes}
									<PortraitUploader
										endpoint={`/api/session/expeditions/${activeExp.id}/portrait`}
										etag={activeExp.portraitEtag ?? ''}
										oninput={(etag) => updateExp({ portraitEtag: etag })}
										placeholderSvg={placeholderImg}
										alt={activeExp.name}
									/>
								{/if}

								<MarkdownNotes
									bind:editing={editingNotes}
									value={activeExp.notes ?? ''}
									oninput={(v) => updateExp({ notes: v })}
									placeholder={activeExp.type === 'site'
										? 'Discoveries, encounters, observations…'
										: 'Waypoints, landmarks, perils encountered…'}
									rows={6}
								/>
							</div>

							<!-- ── Core — pills + objective + difficulty + progress + complete. ── -->
						{:else if activeTab === 'core'}
							<div class="ea-pills-row">
								{#if activeExp.type === 'site'}
									<span class="ea-badge ea-badge--site">Site</span>
								{:else}
									<span class="ea-badge ea-badge--type">Journey</span>
								{/if}
								<span
									class="ea-badge ea-badge--diff"
									style={difficultyBadgeStyle(activeExp.difficulty)}
								>
									{DIFFICULTIES.find((d) => d.value === activeExp.difficulty)?.label ??
										activeExp.difficulty}
								</span>
							</div>

							{#if activeSite}
								<!-- Theme / Domain / Feature / Danger — combo boxes with
								     a d6 button on the right to randomize. Theme/Domain
								     pick from the master lists; Feature/Danger pick from
								     the current theme+domain combined table.  The dice
								     button on Feature/Danger uses the rolled d100 path
								     so the result still gets logged (and 99/100 still
								     emit Change-Theme/Domain links). -->
								<div class="ea-field-row">
									<label class="ea-field-label" for="ea-theme-{activeSite.id}">Theme</label>
									<Select
										id="ea-theme-{activeSite.id}"
										class="ea-select"
										value={activeSite.theme}
										options={DELVE_THEMES.map((t) => ({ value: t, label: t }))}
										onchange={(v) => updateExp({ theme: v as Site['theme'] })}
									/>
									<button
										class="btn btn-icon ea-dice-btn"
										onclick={randomizeTheme}
										disabled={rolling}
										use:tooltip={'Pick a random theme'}
										aria-label="Random theme">{@html diceD6Svg}</button
									>
								</div>
								<div class="ea-field-row">
									<label class="ea-field-label" for="ea-domain-{activeSite.id}">Domain</label>
									<Select
										id="ea-domain-{activeSite.id}"
										class="ea-select"
										value={activeSite.domain}
										options={DELVE_DOMAINS.map((d) => ({ value: d, label: d }))}
										onchange={(v) => updateExp({ domain: v as Site['domain'] })}
									/>
									<button
										class="btn btn-icon ea-dice-btn"
										onclick={randomizeDomain}
										disabled={rolling}
										use:tooltip={'Pick a random domain'}
										aria-label="Random domain">{@html diceD6Svg}</button
									>
								</div>
								<div class="ea-field-row">
									<label class="ea-field-label" for="ea-feature-{activeSite.id}">Feature</label>
									<Select
										id="ea-feature-{activeSite.id}"
										class="ea-select"
										value={activeSite.currentFeature ?? ''}
										disabled={!expHasThemeAndDomain}
										placeholder="—"
										options={[
											{ value: '', label: '—' },
											...featureOptions.map((f) => ({ value: f, label: f })),
										]}
										onchange={(v) => updateExp({ currentFeature: v })}
									/>
									<button
										class="btn btn-icon ea-dice-btn"
										onclick={rollFeature}
										disabled={!expHasThemeAndDomain || rolling}
										use:tooltip={expHasThemeAndDomain
											? 'Roll for a feature'
											: 'Set theme and domain first'}
										aria-label="Random feature">{@html diceD6Svg}</button
									>
								</div>
								<div class="ea-field-row">
									<label class="ea-field-label" for="ea-danger-{activeSite.id}">Danger</label>
									<Select
										id="ea-danger-{activeSite.id}"
										class="ea-select"
										value={activeSite.currentDanger ?? ''}
										disabled={!expHasThemeAndDomain}
										placeholder="—"
										options={[
											{ value: '', label: '—' },
											...dangerOptions.map((d) => ({ value: d, label: d })),
										]}
										onchange={(v) => updateExp({ currentDanger: v })}
									/>
									<button
										class="btn btn-icon ea-dice-btn"
										onclick={rollDanger}
										disabled={!expHasThemeAndDomain || rolling}
										use:tooltip={expHasThemeAndDomain
											? 'Roll for a danger'
											: 'Set theme and domain first'}
										aria-label="Random danger">{@html diceD6Svg}</button
									>
								</div>
							{/if}

							<!-- Difficulty is set in the new-journey / new-site dialog,
							     surfaced via the rank-coloured pill above. -->

							<!-- Progress track -->
							<div class="ea-section">
								<ProgressTrackPanel
									label="Progress track"
									value={activeExp.ticks}
									color={activeColor}
									step={markTicks}
									showStep
									onchange={handleTrackChange}
								/>
							</div>

							<!-- Map field: one chip per marker referencing this
							     expedition. Multi-map is supported — the store
							     returns refs across every map, chips wrap onto
							     new rows via flex-wrap. Coord (x, y) lives in
							     the tooltip; chip text is the map name only. -->
							<div class="ea-section ea-mapref-section">
								<span class="ea-mapref-label">Map</span>
								<div class="ea-mapref-chips">
									{#if activeExpMarkers.length === 0}
										<span class="ea-mapref-empty">Not on any map</span>
									{:else}
										{#each activeExpMarkers as ref (ref.markerId)}
											<button
												class="ea-mapref-chip"
												onclick={() => jumpToMarker(ref)}
												use:tooltip={`Jump to "${ref.label || '(unlabeled)'}" on ${ref.mapName} — (${fmtCoord(ref.x)}, ${fmtCoord(ref.y)})`}
												aria-label={`Jump to marker on ${ref.mapName}`}
											>
												<span class="ea-mapref-name">{ref.mapName}</span>
											</button>
										{/each}
									{/if}
								</div>
							</div>

							<!-- ── Denizens — 12-cell d100 grid, foe picker per row. ── -->
						{:else if activeTab === 'denizens' && activeSite}
							<div class="ea-denizen-top">
								<button
									class="btn btn-sm"
									onclick={rollDenizen}
									disabled={rolling}
									use:tooltip={'Roll d100 for a denizen'}>Roll Denizen</button
								>
							</div>
							<div class="ea-denizen-grid">
								{#each DENIZEN_CELLS as cell, i (i)}
									<div class="ea-denizen-cell">
										<div class="ea-denizen-meta">
											<span class="ea-denizen-freq">{cell.label}</span>
											<span class="ea-denizen-range">{cell.range}</span>
										</div>
										<div class="ea-denizen-input-row">
											<input
												class="ea-denizen-input"
												type="text"
												placeholder="—"
												value={activeSite.denizens[i] ?? ''}
												oninput={(e) =>
													handleDenizenChange(i, (e.target as HTMLInputElement).value)}
											/>
											<button
												class="ea-denizen-pick-btn"
												onclick={() => openDenizenPicker(i)}
												use:tooltip={'Pick a foe for this denizen'}
												aria-label="Pick foe for denizen {i + 1}">+</button
											>
										</div>
									</div>
								{/each}
							</div>
						{/if}
					</div>
				</div>
			{/if}
		</div>
	{/if}
</div>

{#if activeExp}
	<ConfirmDialog
		bind:this={deleteDialogRef}
		title={activeExp.type === 'site' ? 'Delete Site' : 'Delete Journey'}
		confirmLabel="Delete"
		onconfirm={confirmDeleteExp}
	>
		<p>
			Permanently delete <strong
				>{activeExp.name || (activeExp.type === 'site' ? 'this site' : 'this journey')}</strong
			>? This cannot be undone.
		</p>
	</ConfirmDialog>
{/if}

<!-- Foe picker — used by Denizens tab to pick a foe name for any of the 12 cells. -->
<FoePickerDialog
	bind:this={foePickerRef}
	onSelect={() => {}}
	onDenizenPick={handleDenizenFoePick}
/>

<!-- DenizenDialog — rolls d100 against the active site's denizen table.
     Selecting a row creates a new foe encounter via the same flow as
     FoesArea.handleFoeSelected. -->
<DenizenDialog bind:this={denizenDialogRef} onSelect={handleDenizenSelected} />

<!-- New Journey dialog — V1 pattern: pick difficulty, then create. -->
<ConfirmDialog
	bind:this={newJourneyDialogRef}
	title="New Journey"
	confirmLabel="Create"
	confirmClass="btn-primary"
	confirmDisabled={!newJourneyName.trim()}
	cancelLabel="Cancel"
	accentColor={JOURNEY_COLOR}
	onconfirm={confirmAddJourney}
>
	<label class="co-field" style="margin-bottom: 10px;">
		<span class="co-field-label">Journey name</span>
		<input class="co-input" type="text" bind:value={newJourneyName} placeholder="New Journey" />
	</label>
	<RadioGroup.Root
		class="v2-radio-group"
		value={newJourneyDifficulty}
		onValueChange={(v) => (newJourneyDifficulty = v as VowDifficulty)}
		aria-label="Difficulty"
	>
		<span class="v2-radio-legend">Difficulty</span>
		{#each DIFFICULTIES as opt}
			<label class="v2-radio-label">
				<RadioGroup.Item value={opt.value} class="v2-radio-btn">
					<span class="v2-radio-dot"></span>
				</RadioGroup.Item>
				{opt.label}
			</label>
		{/each}
	</RadioGroup.Root>
</ConfirmDialog>

<!-- New Site dialog — name + difficulty + theme + domain up front.
     Each of theme / domain has a d6 button that rolls a random value
     from the delve catalogue (same pattern as the Core-tab combos).
     Create stays disabled until name, theme, and domain are all set. -->
<ConfirmDialog
	bind:this={newSiteDialogRef}
	title="New Site"
	confirmLabel="Create"
	confirmClass="btn-primary"
	confirmDisabled={!newSiteName.trim() || !newSiteTheme || !newSiteDomain}
	cancelLabel="Cancel"
	accentColor={SITE_COLOR}
	onconfirm={confirmAddSite}
>
	<label class="co-field" style="margin-bottom: 10px;">
		<span class="co-field-label">Site name</span>
		<input class="co-input" type="text" bind:value={newSiteName} placeholder="New Site" />
	</label>
	<div class="ns-grid">
		<label class="ns-label" for="ns-difficulty">Difficulty</label>
		<Select
			id="ns-difficulty"
			class="ea-ns-select"
			bind:value={newSiteDifficulty}
			options={DIFFICULTIES}
		/>
		<span class="ns-spacer" aria-hidden="true"></span>

		<label class="ns-label" for="ns-theme">Theme</label>
		<Select
			id="ns-theme"
			class="ea-ns-select"
			bind:value={newSiteTheme}
			placeholder="Select a theme…"
			options={DELVE_THEMES.map((t) => ({ value: t, label: t }))}
		/>
		<button
			class="btn btn-icon ea-dice-btn"
			type="button"
			onclick={randomizeNewSiteTheme}
			use:tooltip={'Pick a random theme'}
			aria-label="Random theme">{@html diceD6Svg}</button
		>

		<label class="ns-label" for="ns-domain">Domain</label>
		<Select
			id="ns-domain"
			class="ea-ns-select"
			bind:value={newSiteDomain}
			placeholder="Select a domain…"
			options={DELVE_DOMAINS.map((d) => ({ value: d, label: d }))}
		/>
		<button
			class="btn btn-icon ea-dice-btn"
			type="button"
			onclick={randomizeNewSiteDomain}
			use:tooltip={'Pick a random domain'}
			aria-label="Random domain">{@html diceD6Svg}</button
		>
	</div>
</ConfirmDialog>

<!-- Expedition options — gear icon in the header opens this. Rename +
     delete both live behind it, matching CharacterOptionsDialog. -->
{#if activeExp}
	<ExpeditionOptionsDialog
		bind:this={expOptionsRef}
		name={activeExp.name || ''}
		kind={activeExp.type}
		oncommit={(next) => updateExp({ name: next })}
		ondelete={confirmDeleteExp}
	/>
{/if}

{#if activeSite}
	<ConfirmDialog
		bind:this={changeThemeDialogRef}
		title="Change Theme"
		confirmLabel="Change"
		onconfirm={confirmChangeTheme}
	>
		<div style="display: flex; flex-direction: column; gap: 8px; min-width: 240px;">
			<label
				style="font-family: var(--font-ui); font-size: 0.75rem; color: var(--text-muted);"
				for="ea-theme-{activeSite.id}">Theme</label
			>
			<Select
				id="ea-theme-{activeSite.id}"
				class="ea-select"
				bind:value={newThemeValue}
				placeholder="— None —"
				options={[
					{ value: '', label: '— None —' },
					...DELVE_THEMES.map((t) => ({ value: t, label: t })),
				]}
			/>
		</div>
	</ConfirmDialog>

	<ConfirmDialog
		bind:this={changeDomainDialogRef}
		title="Change Domain"
		confirmLabel="Change"
		onconfirm={confirmChangeDomain}
	>
		<div style="display: flex; flex-direction: column; gap: 8px; min-width: 240px;">
			<label
				style="font-family: var(--font-ui); font-size: 0.75rem; color: var(--text-muted);"
				for="ea-domain-{activeSite.id}">Domain</label
			>
			<Select
				id="ea-domain-{activeSite.id}"
				class="ea-select"
				bind:value={newDomainValue}
				placeholder="— None —"
				options={[
					{ value: '', label: '— None —' },
					...DELVE_DOMAINS.map((d) => ({ value: d, label: d })),
				]}
			/>
		</div>
	</ConfirmDialog>
{/if}

<!-- Campaign map — SVG pointy-top hex grid, painted terrain, one per user.
     Opened from the "Map" button in the header above. -->
<MapDialog bind:this={mapDialogRef} />

<style>
	.ea-area {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
	}

	.ea-header {
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: var(--area-header-height);
		padding: 6px 12px;
		border-bottom: 1px solid var(--border);
		background: var(--bg-control);
		flex-shrink: 0;
		/* Named container so the title label hides when the panel narrows. */
		container-type: inline-size;
		container-name: area-header;
	}
	@container area-header (max-width: 320px) {
		.ea-title {
			display: none;
		}
	}
	.ea-title-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 18px;
		height: 18px;
		flex-shrink: 0;
		color: var(--text-accent);
	}
	.ea-title-icon :global(svg) {
		width: 100%;
		height: 100%;
		fill: currentColor;
	}
	.ea-title-icon :global(svg) :global(path) {
		fill: currentColor;
	}
	.ea-title {
		font-family: var(--font-display);
		font-size: calc(0.82rem * var(--font-display-scale));
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: var(--font-display-transform);
		color: var(--text-accent);
	}
	.ea-header-actions {
		display: flex;
		align-items: center;
		gap: 6px;
		flex: 1;
		justify-content: flex-end;
		/* container for SegmentedRadio's responsive (labels="auto") collapse */
		container-type: inline-size;
	}

	.ea-loading,
	.ea-empty {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		font-family: var(--font-ui);
		font-size: 0.8rem;
		color: var(--text-muted);
		padding: 20px;
		gap: 12px;
		text-align: center;
	}

	.ea-empty-icon {
		display: flex;
		width: 48px;
		height: 48px;
		opacity: 0.25;
	}
	.ea-empty-icon :global(svg) {
		width: 100%;
		height: 100%;
		fill: currentColor;
	}
	.ea-empty-text {
		margin: 0;
		line-height: 1.5;
		max-width: 26ch;
	}

	/* Body: stage-header + stage stack. Spine strip retired. */
	.ea-body {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
	}
	/* Stage — coloured 3 px band on the LHS keyed to expedition type
	   (journey / site). Replaces the retired ea-stage-header band. */
	.ea-stage {
		padding: 0 12px 10px 12px;
		min-height: 0;
		min-width: 0;
		flex: 1;
		overflow: auto;
		display: flex;
		flex-direction: column;
		border-left: 3px solid var(--ea-nature, var(--text-muted));
	}
	.ea-stage--complete .ea-card {
		opacity: 0.7;
	}
	/* Height-match the neighbouring trash button. The trash btn renders
	   at ~22px (12px SVG + 4+4 padding + 1+1 border via
	   `.btn.btn-icon.btn-trash`), while `.btn`'s inherited
	   `line-height: 1.5` on `0.72rem` would puff the map btn to ~27px.
	   `line-height: 1` collapses the text baseline and `min-height:
	   22px` pins the final height to the trash btn's natural size. */
	.ea-stage-map-btn {
		flex-shrink: 0;
		font-family: var(--font-ui);
		font-size: 0.72rem;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		padding: 4px 12px;
		line-height: 1;
		min-height: 22px;
		box-sizing: border-box;
	}

	/* Map field — a labelled section below the Progress Track in the
	   Core tab. One chip per marker referencing this expedition;
	   click jumps into the map dialog at that marker. Hover surfaces
	   the marker label + coordinates. Multi-map users get multiple
	   chips that wrap onto new rows via `flex-wrap`. */
	.ea-mapref-section {
		display: flex;
		align-items: flex-start;
		gap: 12px;
	}
	.ea-mapref-label {
		flex: 0 0 auto;
		padding-top: 4px;
		font-family: var(--font-ui);
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--text-dimmer);
	}
	.ea-mapref-chips {
		flex: 1 1 auto;
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		align-items: center;
	}
	.ea-mapref-empty {
		font-family: var(--font-ui);
		font-size: 0.75rem;
		font-style: italic;
		color: var(--text-dimmer);
	}
	.ea-mapref-chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 2px 10px;
		background: var(--bg-control);
		border: 1px solid var(--border-mid);
		border-radius: 12px;
		font-family: var(--font-ui);
		font-size: 0.75rem;
		color: var(--text);
		cursor: pointer;
		max-width: 100%;
		white-space: nowrap;
	}
	.ea-mapref-chip:hover {
		border-color: var(--text-accent);
		color: var(--text-accent);
	}
	.ea-mapref-name {
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 12rem;
	}

	/* Header gear + combobox. */
	:global(.ea-hdr-settings-btn) {
		flex-shrink: 0;
	}
	:global(.ea-hdr-settings-btn svg) {
		width: 13px;
		height: 13px;
		fill: currentColor;
	}
	:global(.ea-hdr-settings-btn svg path) {
		fill: currentColor;
	}
	:global(.ea-hdr-combobox) {
		flex: 1 1 auto;
		min-width: 0;
	}
	/* Type-icon glyph inside the popover items. */
	:global(.ea-cmd-type-icon svg) {
		fill: currentColor;
	}
	:global(.ea-cmd-type-icon svg path) {
		fill: currentColor;
	}

	/* Tabs — V1 tab-btn style. */
	:global(.ea-tabs) {
		display: flex;
		align-items: stretch;
		gap: 0;
		margin-bottom: 8px;
		border-bottom: 1px solid var(--border);
	}
	:global(.ea-tab) {
		all: unset;
		cursor: pointer;
		font-family: var(--font-ui);
		font-size: 0.72rem;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-dimmer);
		background: transparent;
		border: none;
		border-bottom: 2px solid transparent;
		padding: 7px 8px 6px;
		white-space: nowrap;
		flex-shrink: 0;
		margin-bottom: -1px;
		transition:
			color 0.12s,
			border-color 0.12s;
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
	}
	:global(.ea-tab:hover) {
		color: var(--text-muted);
	}
	:global(.ea-tab[data-state='active']) {
		color: var(--text-accent);
		border-bottom-color: var(--text-accent);
	}

	/* Card content — theme-aware: cream (--bg-inset) in light, near-black in dark. */
	.ea-card {
		flex: 1;
		min-height: 200px;
		background: var(--bg-inset);
		border: none;
		border-radius: 0;
		padding: 7px;
		overflow: auto;
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	/* ── Description tab ── portrait floats right; notes wrap around it.
	   flow-root contains the float; MarkdownNotes is forced to block flow so
	   the prose wraps (it's normally a flex column = its own BFC). */
	.ea-desc-section {
		display: flow-root;
	}
	.ea-desc-section :global(.md-notes) {
		display: block;
	}
	/* While editing, the portrait is hidden — let the textarea fill the whole
	   panel (full width and height of the containing card). */
	.ea-desc-section--editing {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
	}
	.ea-desc-section--editing :global(.md-notes) {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
	}
	.ea-desc-section--editing :global(.md-notes-input) {
		flex: 1;
		min-height: 0;
	}

	/* ── Core tab ── pills, difficulty selector, progress, complete. */
	.ea-pills-row {
		display: flex;
		flex-wrap: wrap;
		gap: 5px;
		align-items: center;
		border-bottom: 1px solid #c3baa1;
		padding: 0 0 14px;
	}
	.ea-badge {
		font-family: var(--font-ui);
		font-size: 0.6rem;
		font-weight: 600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		padding: 2px 7px;
		border-radius: 10px;
		border: 1px solid color-mix(in srgb, currentColor 35%, transparent);
		line-height: 1;
		white-space: nowrap;
		flex-shrink: 0;
	}
	.ea-badge--type {
		background: rgba(228, 170, 40, 0.15);
		color: #e4aa28;
	}
	.ea-badge--site {
		background: rgba(68, 114, 208, 0.15);
		color: #4472d0;
	}
	.ea-badge--diff {
		border-color: transparent;
	}

	/* Inputs (text, select) for Site fields. */
	.ea-input {
		flex: 1;
		/* Selects with long option text would otherwise force the field row
		   wider than its flex share. min-width: 0 + width: 0 lets the flex
		   item shrink to the row's available width and the chosen option
		   ellipses inside the control. */
		min-width: 0;
		width: 0;
		font-family: var(--font-ui);
		font-size: 0.78rem;
		color: var(--text);
		background: var(--bg-inset);
		border: 1px solid var(--border);
		border-radius: 4px;
		padding: 3px 8px;
		outline: none;
	}
	.ea-input:focus {
		border-color: var(--text-accent);
	}

	/* Square d6 button sitting next to a combo box. Sized to match the
	   combo's height (22 px) so the row reads as one control. */
	.ea-dice-btn {
		all: unset;
		cursor: pointer;
		box-sizing: border-box;
		width: 22px;
		height: 22px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border: 1px solid var(--border-mid);
		border-radius: 3px;
		background: transparent;
		color: var(--text-muted);
		flex-shrink: 0;
		transition:
			color 0.12s,
			border-color 0.12s,
			background 0.12s;
	}
	.ea-dice-btn:hover:not(:disabled) {
		color: var(--text-accent);
		border-color: var(--text-accent);
	}
	.ea-dice-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
	.ea-dice-btn :global(svg) {
		width: 12px;
		height: 12px;
		fill: currentColor;
		pointer-events: none;
	}
	.ea-dice-btn :global(svg) :global(path) {
		fill: currentColor;
	}

	/* Roll Denizen button row at the top of the Denizens tab. */
	.ea-denizen-top {
		display: flex;
		justify-content: flex-end;
		margin-bottom: 8px;
	}

	/* Objective lives at the top of the Notes tab — give it bottom margin so
	   the portrait + prose flow below it without crowding the input. */
	.ea-objective-row {
		margin-bottom: 10px;
	}

	/* Denizens tab — 12-cell grid, always 2 columns × 6 rows. */
	.ea-denizen-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 6px;
	}
	.ea-denizen-cell {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 6px 8px;
		min-width: 0;
		background: var(--bg-inset);
		border: 1px solid var(--border);
		border-radius: 4px;
	}
	.ea-denizen-meta {
		display: flex;
		justify-content: space-between;
		font-family: var(--font-ui);
		font-size: 0.6rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-dimmer);
	}
	.ea-denizen-freq {
		font-weight: 700;
	}
	.ea-denizen-input-row {
		display: flex;
		gap: 4px;
	}
	.ea-denizen-input {
		flex: 1;
		min-width: 0;
		font-family: var(--font-ui);
		font-size: 0.78rem;
		color: var(--text);
		background: transparent;
		border: 1px solid var(--border);
		border-radius: 3px;
		padding: 2px 6px;
		outline: none;
	}
	.ea-denizen-input:focus {
		border-color: var(--text-accent);
	}
	.ea-denizen-pick-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		width: 22px;
		height: 22px;
		padding: 0;
		font-family: var(--font-ui);
		font-size: 0.82rem;
		font-weight: 600;
		line-height: 1;
		background: transparent;
		border: 1px solid var(--border-mid);
		border-radius: 3px;
		color: var(--text-muted);
		cursor: pointer;
		transition:
			background 0.12s,
			color 0.12s,
			border-color 0.12s;
	}
	.ea-denizen-pick-btn:hover {
		background: var(--bg-hover);
		color: var(--text-accent);
		border-color: var(--text-accent);
	}

	.ea-field-row {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.ea-field-label {
		font-family: var(--font-ui);
		font-size: 0.7rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--text-dimmer);
		min-width: 80px;
	}
	/* Threaded to bits-ui via `<Select class="ea-select">` (Change-
	   Theme / Change-Domain dialogs) and `<Select class="ea-select">`
	   inside `.ea-field-row` (inline Theme/Domain/Feature/Danger on
	   the Core tab). Passes through the component so scope globally.
	   Base look from `.bui-select-trigger`. */
	:global(.ea-select) {
		width: 100%;
		font-size: 0.78rem;
		padding: 3px 8px;
		min-height: 0;
	}
	:global(.ea-field-row .ea-select) {
		flex: 1;
		width: auto;
	}
	/* New-site theme/domain selects (inside +Site ConfirmDialog).
	   Flex-fills next to the ns-* label. */
	:global(.ea-ns-select) {
		flex: 1;
		font-size: 0.75rem;
		padding: 3px 6px;
		min-height: 0;
	}

	.ea-section {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	/* New Site dialog form grid — label | select | dice-btn rows. The
	   difficulty row uses a spacer where the dice button would go so
	   the three rows line up. */
	:global(.ns-grid) {
		display: grid;
		grid-template-columns: 56px 1fr auto;
		gap: 6px 8px;
		align-items: center;
		margin: 0 0 4px;
	}
	:global(.ns-label) {
		font-family: var(--font-ui);
		font-size: 0.65rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-dimmer);
	}
	:global(.ns-spacer) {
		display: block;
		width: 22px;
	}
</style>
