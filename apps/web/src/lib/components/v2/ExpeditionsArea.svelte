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
		isExpeditionLoaded,
		persistExpeditionsNow,
		removeExpedition,
		addExpedition,
	} from '#lib/expeditionStore.svelte.js';
	import LoadingSpinner from '#lib/components/LoadingSpinner.svelte';
	import type {
		Expedition,
		Journey,
		Site,
		Scene,
		VowDifficulty,
		FoeDef,
		FoeQuantity,
		FoeEncounter,
	} from '#lib/types.js';
	import { DELVE_THEMES, DELVE_DOMAINS } from '#lib/types.js';
	import Select from '#lib/components/Select.svelte';
	import { isSourceEnabled } from '#lib/expansionStore.svelte.js';
	import { setActiveExpeditionId } from '#lib/activeContext.svelte.js';
	import { createDebouncedSave } from '#lib/debouncedSave.js';
	import { initialSelection, rememberSelection } from '#lib/rememberedSelection.js';
	import { tooltip } from '#lib/actions/tooltip.js';
	import { loadDelveData } from '#lib/delveStore.svelte.js';
	import { rollOracle, getOracles } from '#lib/oracleStore.svelte.js';
	import { appendLog } from '#lib/log.svelte.js';
	import { addEncounter } from '#lib/encounterStore.svelte.js';
	import { onMount } from 'svelte';

	import ExpeditionDescription from './expeditions/ExpeditionDescription.svelte';
	import ExpeditionCore from './expeditions/ExpeditionCore.svelte';
	import SiteDenizens from './expeditions/SiteDenizens.svelte';
	import { DIFFICULTIES } from './expeditions/expeditions.js';
	import FoePickerDialog from '#lib/components/FoePickerDialog.svelte';
	import DenizenDialog from '#lib/components/DenizenDialog.svelte';
	import ConfirmDialog from '#lib/components/ConfirmDialog.svelte';
	import Checkbox from '#lib/components/Checkbox.svelte';
	import ExpeditionOptionsDialog from '#lib/components/ExpeditionOptionsDialog.svelte';
	import MapDialog from '#lib/components/MapDialog.svelte';
	import {
		entityMarkerIndexState,
		loadEntityMarkerIndex,
		markersForEntity,
		unlinkEntityFromMaps,
		type EntityMarkerRef,
	} from '#lib/mapStore.svelte.js';
	import { formatEntityId } from '#lib/mapEntityLinks.js';
	import iconGearSvg from '#icons/gear-solid.svg?raw';
	import { Tabs } from 'bits-ui';
	import Combobox from '#lib/components/Combobox.svelte';
	import { ENTITY_KIND_META } from '#lib/entityKinds.js';
	// Derived, so they follow the livery (a livery may ship its own).
	const journeyPlaceholderSvg = $derived(ENTITY_KIND_META.journey.icon);
	const sitePlaceholderSvg = $derived(ENTITY_KIND_META.site.icon);
	const scenePlaceholderSvg = $derived(ENTITY_KIND_META.scene.icon);
	import diceD6Svg from '#icons/dice-d6-light.svg?raw';
	import { appIcon } from '#lib/liveryIcons.js';
	import { headingText } from '#lib/fontStore.svelte.js';

	let { showTitle = true }: { showTitle?: boolean } = $props();

	// Colours + icons come from the shared kind-meta module — same
	// source of truth CommunitiesArea and the map's Link Marker picker
	// read from, so a tweak lands everywhere at once.
	const JOURNEY_COLOR = ENTITY_KIND_META.journey.color;
	const SITE_COLOR = ENTITY_KIND_META.site.color;
	const SCENE_COLOR = ENTITY_KIND_META.scene.color;

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
	// Scenes carry everything on one tab — objective, consequences, tracks, and
	// notes all live in Core (no separate Description tab, no portrait).
	const SCENE_TAB_LABELS: { key: ExpTab; label: string }[] = [{ key: 'core', label: 'Core' }];

	// A Scene's rank guidance (Begin the Scene) only spans the first three;
	// the creator picker offers just those.
	const SCENE_DIFFICULTIES = DIFFICULTIES.slice(0, 3);

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
			if (d.kind !== 'journey' && d.kind !== 'site' && d.kind !== 'scene') return;
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
	// Type-filter pill row in the switcher popover — multi-select set of
	// expedition types currently allowed through. Empty set = show all
	// (default). Mirrors the Connections popover's kind-filter pills.
	type ExpKind = 'journey' | 'site' | 'scene';
	let expTypeFilter = $state<Set<string>>(new Set<string>());
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
	// New Site dialog stays lean — name + difficulty + a checklist of
	// what to randomize on Create. Theme/domain are edited on the sheet.
	let newSiteRollTheme = $state(true);
	let newSiteRollDomain = $state(true);
	let newJourneyName = $state<string>('');
	let newSiteName = $state<string>('');
	// New-scene dialog state.
	let newSceneDialogRef = $state<{ open(): void; close(): void } | null>(null);
	let newSceneDifficulty = $state<VowDifficulty>('dangerous');
	let newSceneName = $state<string>('');
	let newSceneObjective = $state<string>('');

	// Inline-edit state for journeys
	let editingNotes = $state(false);
	let editingShortDesc = $state(false);

	const expeditions = $derived(getExpeditions());
	// The spinner until the first load has settled, not the empty state.
	const loading = $derived(!isExpeditionLoaded() || isExpeditionLoading());

	// Open the expedition this device had open last, or else the first.
	$effect(() => {
		if (!activeExpId && expeditions.length > 0) {
			activeExpId = initialSelection(
				'expeditions',
				expeditions.map((e) => e.id),
			);
		}
	});
	$effect(() => rememberSelection('expeditions', activeExpId));

	const activeExp = $derived(expeditions.find((e) => e.id === activeExpId));
	const activeSite = $derived<Site | null>(activeExp?.type === 'site' ? (activeExp as Site) : null);

	/** Display name for a spine / combobox — never blank so the popover
	 *  and the trigger have something to render. */
	function expDisplayName(e: Expedition): string {
		const fallback = e.type === 'site' ? 'Site' : e.type === 'scene' ? 'Scene' : 'Journey';
		return (e.name || `Unnamed ${fallback}`).trim();
	}

	/** Popover list sorted A→Z. Command doesn't sort — pre-sort here. */
	const sortedExpeditions = $derived(
		expeditions.slice().sort((a, b) => expDisplayName(a).localeCompare(expDisplayName(b))),
	);
	/** Switcher combobox config: type-filter pills, per-item glyph/colour, and
	 *  the source-gated "+ New …" action rows. */
	const EXP_PILLS: { key: string; label: string; color: string }[] = [
		{ key: 'journey', label: 'Journeys', color: JOURNEY_COLOR },
		{ key: 'site', label: 'Sites', color: SITE_COLOR },
		{ key: 'scene', label: 'Scenes', color: SCENE_COLOR },
	];
	const EXP_ICON = $derived<Record<ExpKind, string>>({
		journey: journeyPlaceholderSvg,
		site: sitePlaceholderSvg,
		scene: scenePlaceholderSvg,
	});
	const EXP_COLOR: Record<ExpKind, string> = {
		journey: JOURNEY_COLOR,
		site: SITE_COLOR,
		scene: SCENE_COLOR,
	};
	const expActions = $derived([
		{
			label: '+ New Journey…',
			value: '+ New Journey',
			tour: 'new-journey-action',
			onselect: addJourney,
		},
		...(isSourceEnabled('delve')
			? [{ label: '+ New Site…', value: '+ New Site', onselect: addSite }]
			: []),
		// Scenes are gated on Lodestar (which supplies the four Scene moves).
		// Existing scenes keep rendering when Lodestar is later disabled; only
		// the create affordance is hidden.
		...(isSourceEnabled('lodestar')
			? [{ label: '+ New Scene…', value: '+ New Scene', onselect: addScene }]
			: []),
	]);

	/** Back-references for the active expedition, if any. Empty until the
	 *  index has loaded. Re-derived when either the index or the active
	 *  entity changes. */
	const activeExpMarkers = $derived.by<EntityMarkerRef[]>(() => {
		// Scenes are non-map-spatial (like foes/NPCs) — never carry markers.
		if (!activeExp || activeExp.type === 'scene') return [];
		void entityMarkerIndexState.index; // subscribe
		return markersForEntity(formatEntityId(activeExp.type, activeExp.id));
	});

	/** Jump the dialog directly to a marker back-reference (the chips
	 *  under the stage header). */
	function jumpToMarker(ref: EntityMarkerRef): void {
		mapDialogRef?.open({ mapId: ref.mapId, markerId: ref.markerId });
	}

	// Publish active expedition id so MovesDialog / preconditions can see it.
	$effect(() => {
		setActiveExpeditionId(activeExpId ?? '');
	});
	const tabLabels = $derived(
		activeExp?.type === 'site'
			? SITE_TAB_LABELS
			: activeExp?.type === 'scene'
				? SCENE_TAB_LABELS
				: JOURNEY_TAB_LABELS,
	);

	function selectExp(id: string) {
		_save.flush(); // commit pending edit before switching
		activeExpId = id;
		activeTab = 'core';
		editingNotes = false;
		editingShortDesc = false;
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

	// Exported handlers for a `/site.theme` or `/site.domain` link or command
	// (the home page's `ironledger:site-picker` listener). Switch active expedition to the linked one, switch to
	// the Core tab, then open the existing theme/domain dialog so the user
	// confirms the choice (matches the v1 confirm flow). The dialog reads
	// activeSite, so we have to wait one tick after activeExpId changes
	// before opening, or activeSite will still be stale.
	export function openChangeThemeForExp(expId: string) {
		_save.flush();
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
		_save.flush();
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
	/** A foe picked from the list goes in as its id; the slot shows its name. */
	function handleDenizenFoePick(foeId: string) {
		if (denizenPickIndex < 0) return;
		handleDenizenChange(denizenPickIndex, foeId);
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

	const _save = createDebouncedSave();
	$effect(() => {
		if (!activeExp) return;
		$state.snapshot(activeExp);
		_save.schedule(() =>
			persistExpeditionsNow().catch((err) => console.error('[v2] expedition save failed', err)),
		);
		return () => _save.flush();
	});

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
		newSiteName = '';
		newSiteDialogRef?.open();
	}
	/** Roll the compound Site Name oracle (format → recursive sub-rolls) to
	 *  seed the name field, mirroring New Settlement's name dice. Logs the roll —
	 *  any oracle use, dialog or not, goes to the session log. */
	function rollNewSiteName() {
		const r = rollOracle('siteName', getOracles());
		if (r.value) {
			newSiteName = r.value;
			appendLog(r.title, r.html);
		}
	}
	async function confirmAddSite() {
		// Roll the WEIGHTED Site Nature oracles (matching the panel dice), not a
		// uniform pick. The create-time rolls fold into ONE combined log entry
		// (the name-dice click logs on its own).
		const oracles = getOracles();
		const name = newSiteName.trim() || 'New Site';
		let theme: Site['theme'] = '';
		let domain: Site['domain'] = '';
		const rolled: string[] = [];
		if (newSiteRollTheme) {
			theme = (rollOracle('siteNatureTheme', oracles).value || '') as Site['theme'];
			if (theme) rolled.push(`Theme: <strong>${theme}</strong>`);
		}
		if (newSiteRollDomain) {
			domain = (rollOracle('siteNatureDomain', oracles).value || '') as Site['domain'];
			if (domain) rolled.push(`Domain: <strong>${domain}</strong>`);
		}
		if (rolled.length) appendLog(`New Site — ${name}`, `<div>${rolled.join(' · ')}</div>`);
		const s: Site = {
			id: crypto.randomUUID(),
			type: 'site',
			name,
			objective: '',
			notes: '',
			theme: theme as Site['theme'],
			domain: domain as Site['domain'],
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

	function addScene() {
		newSceneDifficulty = 'dangerous';
		newSceneName = '';
		newSceneObjective = '';
		newSceneDialogRef?.open();
	}
	async function confirmAddScene() {
		const sc: Scene = {
			id: crypto.randomUUID(),
			type: 'scene',
			name: newSceneName.trim() || 'New Scene',
			objective: newSceneObjective.trim(),
			consequences: '',
			difficulty: newSceneDifficulty,
			ticks: 0,
			countdownFilled: 0,
			notes: '',
			complete: false,
			createdAt: Date.now(),
		};
		await addExpedition(sc);
		activeExpId = sc.id;
		activeTab = 'core';
	}

	async function confirmDeleteExp() {
		if (!activeExp) return;
		const id = activeExp.id;
		const type = activeExp.type;
		await removeExpedition(id);
		// Journeys and sites can be marker targets (scenes can't). Unlink any
		// markers that pointed here so their pins stay but shed the dead link.
		if (type === 'journey' || type === 'site') {
			await unlinkEntityFromMaps(formatEntityId(type, id));
		}
		if (activeExpId === id) activeExpId = null;
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

	const activeColor = $derived(
		activeExp?.type === 'site'
			? SITE_COLOR
			: activeExp?.type === 'scene'
				? SCENE_COLOR
				: JOURNEY_COLOR,
	);
	const placeholderImg = $derived(
		activeExp?.type === 'site'
			? sitePlaceholderSvg
			: activeExp?.type === 'scene'
				? scenePlaceholderSvg
				: journeyPlaceholderSvg,
	);
</script>

<div class="ea-area">
	<header class="ea-header">
		{#if showTitle}
			<span class="ea-title-icon" aria-hidden="true">{@html appIcon('expeditions')}</span>
			<span class="ea-title">{headingText('Expeditions')}</span>
		{/if}
		<div class="ea-header-actions" data-exp-count={expeditions.length}>
			<!-- Always show the switcher — even when the list is empty. Trigger
			     reads the active expedition name; when empty it renders a
			     muted placeholder, and the popover surfaces "+ New Journey…"
			     / "+ New Site…" as the only actions. Campaign map moved to
			     the app-nav (Map button next to Move). -->
			<Combobox
				bind:open={expPickerOpen}
				items={sortedExpeditions}
				getKey={(e) => e.id}
				getLabel={expDisplayName}
				getIcon={(e) => EXP_ICON[e.type as ExpKind]}
				getColor={(e) => EXP_COLOR[e.type as ExpKind]}
				activeKey={activeExpId}
				onselect={(e) => selectExp(e.id)}
				triggerValue={activeExp ? expDisplayName(activeExp) : ''}
				triggerIcon={activeExp ? EXP_ICON[activeExp.type as ExpKind] : undefined}
				triggerColor={activeExp ? EXP_COLOR[activeExp.type as ExpKind] : undefined}
				placeholder="— No expeditions yet —"
				searchPlaceholder="Search expeditions…"
				emptyText="No matching expeditions."
				ariaLabel="Switch or add expedition"
				filterGroupLabel="Filter by expedition type"
				class="ea-hdr-combobox"
				tour="exp-switcher"
				filters={EXP_PILLS}
				bind:activeFilters={expTypeFilter}
				filterOf={(e) => e.type}
				actions={expActions}
			/>
			{#if activeExp}
				<button
					class="btn btn-icon icon-btn ea-hdr-settings-btn"
					onclick={() => expOptionsRef?.open()}
					use:tooltip={activeExp.type === 'site'
						? 'Site options'
						: activeExp.type === 'scene'
							? 'Scene options'
							: 'Journey options'}
					aria-label="Expedition options">{@html iconGearSvg}</button
				>
			{/if}
		</div>
	</header>

	{#if loading}
		<div class="ea-loading"><LoadingSpinner label="Loading…" /></div>
	{:else if expeditions.length === 0}
		<div class="ea-empty">
			<span class="ea-empty-icon" aria-hidden="true">{@html appIcon('expeditions')}</span>
			<p class="ea-empty-text">
				You seem to be a homebody. Pick <strong>+ New Journey…</strong> or
				<strong>+ New Site…</strong> from the switcher above to take your first step.
			</p>
		</div>
	{:else}
		<div class="ea-body">
			{#if activeExp}
				<div
					class="deck-stage ea-stage"
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
								<Tabs.Trigger value={tab.key} class="ea-tab" disabled={activeExp.complete}
									>{tab.label}</Tabs.Trigger
								>
							{/each}
						</Tabs.List>
					</Tabs.Root>

					<div class="deck-card ea-card" role="tabpanel">
						{#if activeTab === 'description' || activeTab === 'notes'}
							<ExpeditionDescription
								exp={activeExp}
								placeholderSvg={placeholderImg}
								bind:editingNotes
								bind:editingShortDesc
								onupdate={updateExp}
							/>
						{:else if activeTab === 'core'}
							<ExpeditionCore
								exp={activeExp}
								color={activeColor}
								markers={activeExpMarkers}
								bind:editingNotes
								bind:rolling
								onupdate={updateExp}
								onjump={jumpToMarker}
							/>
						{:else if activeTab === 'denizens' && activeSite}
							<SiteDenizens
								site={activeSite}
								{rolling}
								onroll={rollDenizen}
								onchange={handleDenizenChange}
								onpick={openDenizenPicker}
							/>
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
		title="Delete {activeExp.type === 'site'
			? 'Site'
			: activeExp.type === 'scene'
				? 'Scene'
				: 'Journey'}"
		confirmLabel="DELETE"
		onconfirm={confirmDeleteExp}
	>
		<p>
			Permanently delete <strong
				>{activeExp.name ||
					(activeExp.type === 'site'
						? 'this site'
						: activeExp.type === 'scene'
							? 'this scene'
							: 'this journey')}</strong
			>? This cannot be undone.
		</p>
	</ConfirmDialog>
{/if}

<!-- Foe picker — used by Denizens tab to pick a foe for any of the 12 cells. -->
<FoePickerDialog
	bind:this={foePickerRef}
	onSelect={() => {}}
	onDenizenPick={handleDenizenFoePick}
/>

<!-- DenizenDialog — rolls d100 against the active site's denizen table.
     Selecting a row creates a new foe encounter via the same flow as
     FoesArea.handleFoeSelected. -->
<DenizenDialog bind:this={denizenDialogRef} onSelect={handleDenizenSelected} />

<!-- New Journey dialog — name + difficulty (defaults to Dangerous). -->
<ConfirmDialog
	bind:this={newJourneyDialogRef}
	tour="new-journey-dialog"
	title="New Journey"
	draggable
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
	<div class="ns-grid">
		<label class="ns-label" for="nj-difficulty">Difficulty</label>
		<Select
			id="nj-difficulty"
			class="ea-ns-select"
			bind:value={newJourneyDifficulty}
			options={DIFFICULTIES}
		/>
	</div>
</ConfirmDialog>

<!-- New Site dialog — name + difficulty + an "Also randomize" checklist
     for Theme / Domain. Create only requires a name; theme + domain are
     rolled from the delve catalogue on commit when checked. -->
<ConfirmDialog
	bind:this={newSiteDialogRef}
	title="New Site"
	draggable
	confirmLabel="Create"
	confirmClass="btn-primary"
	confirmDisabled={!newSiteName.trim()}
	cancelLabel="Cancel"
	accentColor={SITE_COLOR}
	onconfirm={confirmAddSite}
>
	<div class="co-field" style="margin-bottom: 10px;">
		<span class="co-field-label">Site name</span>
		<div class="ns-name-row">
			<input class="co-input" type="text" bind:value={newSiteName} placeholder="New Site" />
			<button
				class="dice-btn"
				type="button"
				onclick={rollNewSiteName}
				use:tooltip={'Roll a site name'}
				aria-label="Random site name">{@html diceD6Svg}</button
			>
		</div>
	</div>
	<div class="ns-grid">
		<label class="ns-label" for="ns-difficulty">Difficulty</label>
		<Select
			id="ns-difficulty"
			class="ea-ns-select"
			bind:value={newSiteDifficulty}
			options={DIFFICULTIES}
		/>
	</div>

	<div class="nn-randomize">
		<span class="nn-randomize-label">Also randomize</span>
		<Checkbox
			class="nn-check"
			checked={newSiteRollTheme}
			onCheckedChange={(v) => (newSiteRollTheme = !!v)}
		>
			<span class="nn-check-label">Theme</span>
		</Checkbox>
		<Checkbox
			class="nn-check"
			checked={newSiteRollDomain}
			onCheckedChange={(v) => (newSiteRollDomain = !!v)}
		>
			<span class="nn-check-label">Domain</span>
		</Checkbox>
	</div>
</ConfirmDialog>

<!-- New Scene dialog — name + objective + rank (Troublesome/Dangerous/Formidable). -->
<ConfirmDialog
	bind:this={newSceneDialogRef}
	title="New Scene"
	draggable
	confirmLabel="Create"
	confirmClass="btn-primary"
	confirmDisabled={!newSceneName.trim()}
	cancelLabel="Cancel"
	accentColor={SCENE_COLOR}
	onconfirm={confirmAddScene}
>
	<label class="co-field" style="margin-bottom: 10px;">
		<span class="co-field-label">Scene name</span>
		<input class="co-input" type="text" bind:value={newSceneName} placeholder="New Scene" />
	</label>
	<label class="co-field" style="margin-bottom: 10px;">
		<span class="co-field-label">Objective</span>
		<input
			class="co-input"
			type="text"
			bind:value={newSceneObjective}
			placeholder="What are you trying to accomplish?"
		/>
	</label>
	<div class="ns-grid">
		<label class="ns-label" for="nsc-difficulty">Rank</label>
		<Select
			id="nsc-difficulty"
			class="ea-ns-select"
			bind:value={newSceneDifficulty}
			options={SCENE_DIFFICULTIES}
		/>
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
		draggable
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
		draggable
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
	@container area-header (max-width: 420px) {
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
	/* Stage — flex / padding / scroll live on the shared `.deck-stage`
	   in app.css so all four decks stay in sync. This rule only carries
	   the expedition-type LHS band. */
	.ea-stage {
		border-left: 3px solid var(--ea-nature, var(--text-muted));
	}
	/* Header gear + combobox. Every fixed item pins `flex-shrink: 0` so
	   the SegmentedRadio and map icon never squeeze into their content
	   (which would clip on a narrow deck panel like iPad Air landscape).
	   The combobox absorbs the shrink instead — its `min-width: 0` lets
	   it truncate its label all the way to zero if needed. */
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
	/* Card content — flex layout, padding, gap, background live on the shared
	   `.deck-card` in app.css so the three decks stay in sync. No ea-specific
	   overrides are needed at the base; the `.ea-stage--complete .ea-card`
	   opacity rule above still targets this class. */

	/* Field rows, shared with the tab components (expeditions/*), so global
	   within the card. */
	.ea-card :global(.ea-field-row) {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.ea-card :global(.ea-field-label) {
		font-family: var(--font-ui);
		font-size: 0.7rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--text-dimmer);
		min-width: 80px;
	}
	.ea-card :global(.ea-input) {
		flex: 1;
		/* min-width: 0 + width: 0 let it shrink to its share of the row. */
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
	.ea-card :global(.ea-input:focus) {
		border-color: var(--text-accent);
	}
	/* A site's or scene's Objective: the card's gap spaces it. */
	.ea-card :global(.ea-objective-row) {
		margin: 0;
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

	/* New Site name field — input grows, dice button rolls the compound
	   Site Name oracle to seed it (mirrors New Settlement's name dice). */
	.ns-name-row {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.ns-name-row :global(.co-input) {
		flex: 1 1 auto;
		min-width: 0;
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
