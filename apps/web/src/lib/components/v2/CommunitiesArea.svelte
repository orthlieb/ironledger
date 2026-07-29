<script lang="ts">
	/**
	 * CommunitiesArea (v2 prototype) — combined Communities + NPCs deck.
	 *
	 * Master-detail: a searchable/filterable rail lists both entry types
	 * interleaved; selecting one opens its detail in the stage. The rail
	 * scales to dozens of entries (search + type filter + Added/A–Z sort).
	 * On narrow widths the two panes collapse to a single-pane drill-down
	 * (list → detail → back) via a viewport @media query (≤600px).
	 * Each entry's row accent and stage-header LHS band are coloured by type:
	 *   community → #D06840 (terracotta)
	 *   npc       → #C848A8 (orchid)
	 *
	 * Header toolbar adds "+ Community" and "+ NPC" (both open V1 random /
	 * manual dialogs with oracle pickers).
	 *
	 * Two tabs per entry:
	 *   • CORE — community: region / location / desc / trouble
	 *            npc:       role / goal / descriptor / relationship / location
	 *   • NOTES — portrait floats right, markdown notes wrap around it.
	 *
	 * All edits flow through a 1.5 s debounce shared between both stores.
	 */
	import {
		getCommunities,
		isCommunityLoading,
		persistCommunitiesNow,
		addCommunity,
		removeCommunity,
	} from '$lib/communityStore.svelte.js';
	import { getNpcs, persistNpcsNow, addNpc, removeNpc } from '$lib/npcStore.svelte.js';
	import { getPlaces, persistPlacesNow, addPlace, removePlace } from '$lib/placeStore.svelte.js';
	import type { Community, Npc, Place, NpcRelationship } from '$lib/types.js';
	import Select from '$lib/components/Select.svelte';
	import MarkdownNotes from '$lib/components/MarkdownNotes.svelte';
	import PortraitUploader from '$lib/components/PortraitUploader.svelte';
	import { isYrtEnabled } from '$lib/expansionStore.svelte.js';
	import { Popover, Command, RadioGroup, Tabs } from 'bits-ui';
	import {
		loadOracles,
		getOracles,
		rollOracle,
		findOracle,
		rollFromRangeTable,
	} from '$lib/oracleStore.svelte.js';
	import { appendLog } from '$lib/log.svelte.js';
	import { tooltip } from '$lib/actions/tooltip.js';

	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import ConnectionOptionsDialog from '$lib/components/ConnectionOptionsDialog.svelte';
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
	import heartPulseSvg from '$icons/heart-pulse-solid-full.svg?raw';
	import skullSvg from '$icons/skull-crossbones-solid-full.svg?raw';
	import SegmentedRadio from '$lib/components/SegmentedRadio.svelte';
	import villageIconSvg from '$icons/village.svg?raw';
	import { ENTITY_KIND_META } from '$lib/entityKinds.js';
	import diceD6Svg from '$icons/dice-d6-light.svg?raw';
	import searchIconSvg from '$icons/magnifying-glass-solid-full.svg?raw';
	import { headingText } from '$lib/fontStore.svelte.js';

	let { showTitle = true }: { showTitle?: boolean } = $props();

	// Colours + icons + labels come from the shared kind-meta module
	// so a rename or a colour tweak only happens once. Local wrappers
	// keep the `kind: EntryKind` signature the rail markup uses.
	const COMMUNITY_COLOR = ENTITY_KIND_META.community.color;
	const NPC_COLOR = ENTITY_KIND_META.npc.color;
	const PLACE_COLOR = ENTITY_KIND_META.place.color;

	type EntryKind = 'community' | 'npc' | 'place';
	type CommunityEntry = { kind: 'community'; id: string; createdAt: number; data: Community };
	type NpcEntry = { kind: 'npc'; id: string; createdAt: number; data: Npc };
	type PlaceEntry = { kind: 'place'; id: string; createdAt: number; data: Place };
	type Entry = CommunityEntry | NpcEntry | PlaceEntry;

	function accentFor(kind: EntryKind): string {
		return ENTITY_KIND_META[kind].color;
	}
	function iconFor(kind: EntryKind): string {
		return ENTITY_KIND_META[kind].icon;
	}
	function kindLabelSingular(kind: EntryKind): string {
		return ENTITY_KIND_META[kind].label;
	}

	type CmTab = 'core' | 'notes';

	const RELATIONSHIPS: { value: NpcRelationship; label: string }[] = [
		{ value: 'bond', label: 'Bond' },
		{ value: 'neutral', label: 'Neutral' },
		{ value: 'foe', label: 'Foe' },
	];

	let activeEntryId = $state<string | null>(null);
	let activeTab = $state<CmTab>('core');

	// Cross-component focus signal — the campaign map (or anywhere else) can
	// dispatch `ironledger:focus-entity` with {kind, id} and any matching
	// area listens for its own kinds. Here we handle community / place / npc.
	// Filter clearing avoids the awkward case where the target is hidden by
	// the current type filter — otherwise the click-through appears to no-op.
	$effect(() => {
		const onFocus = (e: Event) => {
			const d = (e as CustomEvent<{ kind: string; id: string }>).detail;
			if (!d) return;
			if (d.kind !== 'community' && d.kind !== 'place' && d.kind !== 'npc') return;
			activeEntryId = d.id;
			activeTab = 'core';
		};
		document.addEventListener('ironledger:focus-entity', onFocus);
		return () => document.removeEventListener('ironledger:focus-entity', onFocus);
	});

	// New-community dialog state
	let newCommunityDialogRef = $state<{ open(): void; close(): void } | null>(null);
	let _pendingCommunity: Community | null = null;
	let _pendingCommunityRegionType = $state<'ironlands' | 'yrt'>('ironlands');
	let _pendingCommunityLocationType = $state<'location' | 'coastalWatersLocation'>('location');

	// New-NPC dialog state
	let newNpcDialogRef = $state<{ open(): void; close(): void } | null>(null);
	let _pendingNpc: Npc | null = null;
	let _pendingNpcNameOracle = $state<string>('namesIronlander');

	// New-Place dialog state
	let newPlaceDialogRef = $state<{ open(): void; close(): void } | null>(null);
	let _pendingPlace: Place | null = null;
	let _pendingPlaceRegionType = $state<'ironlands' | 'yrt'>('ironlands');
	let _pendingPlaceLocationType = $state<'location' | 'coastalWatersLocation'>('location');

	// Combobox switcher + gear-options refs (mirrors Chars/Foes/Exp).
	let entryPickerOpen = $state(false);
	let entryOptionsRef = $state<{ open(): void; close(): void } | null>(null);

	// Name-first drafts for the three New * dialogs.
	let newCommunityName = $state<string>('');
	let newNpcName = $state<string>('');
	let newPlaceName = $state<string>('');

	// Inline-edit state
	let editingNotes = $state(false);
	let editingCoreNotes = $state(false);

	// Re-entrance guard for dice-button rolls (matches ExpeditionsArea pattern).
	let rolling = $state(false);

	const communities = $derived(getCommunities());
	const npcs = $derived(getNpcs());
	const places = $derived(getPlaces());
	const loading = $derived(isCommunityLoading());

	/** Combined list — communities + NPCs, sorted by createdAt (oldest first). */
	const entries = $derived<Entry[]>(
		[
			...communities.map<CommunityEntry>((c) => ({
				kind: 'community',
				id: c.id,
				createdAt: c.createdAt ?? 0,
				data: c,
			})),
			...npcs.map<NpcEntry>((n) => ({
				kind: 'npc',
				id: n.id,
				createdAt: n.createdAt ?? 0,
				data: n,
			})),
			...places.map<PlaceEntry>((pl) => ({
				kind: 'place',
				id: pl.id,
				createdAt: pl.createdAt ?? 0,
				data: pl,
			})),
		].sort((a, b) => a.createdAt - b.createdAt),
	);

	/** Popover list — sorted A→Z, all three kinds interleaved. */
	const sortedEntries = $derived<Entry[]>(
		entries
			.slice()
			.sort((a, b) =>
				(a.data.name ?? '').localeCompare(b.data.name ?? '', undefined, { sensitivity: 'base' }),
			),
	);

	$effect(() => {
		if (!activeEntryId && entries.length > 0) activeEntryId = entries[0].id;
	});

	const activeEntry = $derived(entries.find((e) => e.id === activeEntryId));
	const activeKind = $derived<EntryKind | null>(activeEntry?.kind ?? null);
	const activeColor = $derived(activeKind ? accentFor(activeKind) : COMMUNITY_COLOR);

	// Map integration: only communities and places can own a map or be
	// linked from a marker; NPCs are explicitly excluded by mapEntityLinks.
	let mapDialogRef = $state<{
		open(target?: { mapId?: string; markerId?: string; promptUpload?: boolean }): void;
		close(): void;
	} | null>(null);

	$effect(() => {
		void loadEntityMarkerIndex();
	});

	/** True when the active entry is map-owner-eligible (community or place). */
	const activeIsMapOwner = $derived(activeKind === 'community' || activeKind === 'place');

	/** Back-references for the active entry, if any. Empty until index loads. */
	const activeEntryMarkers = $derived.by<EntityMarkerRef[]>(() => {
		if (!activeEntry || !activeIsMapOwner) return [];
		void entityMarkerIndexState.index; // subscribe
		return markersForEntity(
			formatEntityId(activeEntry.kind as 'community' | 'place', activeEntry.data.id),
		);
	});

	/** The (possibly-not-yet-created) map summary for the active
	 *  community/place, looked up by (ownerKind, ownerId). Undefined
	 *  until either the summary list loads or the map is get-or-created. */
	const activeEntryMap = $derived.by(() => {
		if (!activeEntry || !activeIsMapOwner) return undefined;
		return mapListState.maps.find(
			(m) => m.ownerKind === activeEntry.kind && m.ownerId === activeEntry.data.id,
		);
	});
	/** True when the entity's map has no background image (or the map
	 *  doesn't exist at all yet). Drives the "+ Map" vs "Map" button. */
	const activeEntryMapEmpty = $derived(!activeEntryMap || !activeEntryMap.backgroundHash);

	async function openOwnedMap() {
		if (!activeEntry || !activeIsMapOwner) return;
		const mapId = await openMapForOwner(
			activeEntry.kind as 'community' | 'place',
			activeEntry.data.id,
			activeEntry.data.name || 'Untitled',
		);
		mapDialogRef?.open({ mapId: mapId ?? undefined });
	}

	/** "+ Map" variant — the button is a `<label>` wrapping a hidden
	 *  file input, so tapping it opens the OS file picker as part of
	 *  the tap's native user gesture (essential on iOS Safari). */
	async function handleAddMapWithFile(e: Event) {
		if (!activeEntry || !activeIsMapOwner) return;
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		try {
			const mapId = await openMapForOwner(
				activeEntry.kind as 'community' | 'place',
				activeEntry.data.id,
				activeEntry.data.name || 'Untitled',
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

	function jumpToMarker(ref: EntityMarkerRef) {
		mapDialogRef?.open({ mapId: ref.mapId, markerId: ref.markerId });
	}

	function fmtCoord(v: number): string {
		return Number.isInteger(v) ? String(v) : v.toFixed(2);
	}

	// The Notes/description tab is labelled "Background" for NPCs (origin,
	// upbringing, major traits — fits a person) and "Description" for
	// communities (it describes a place). Same underlying `notes` field
	// either way.
	const tabs = $derived<{ key: CmTab; label: string }[]>([
		{ key: 'core', label: 'Core' },
		{ key: 'notes', label: activeKind === 'npc' ? 'Background' : 'Description' },
	]);

	function selectEntry(id: string) {
		flushPersist();
		activeEntryId = id;
		activeTab = 'core';
		editingNotes = false;
		editingCoreNotes = false;
	}

	// ── Direct-proxy writes + debounced API flush ─────────────────────────
	// updateCommunity/updateNpc mutate fields on the active entry's data
	// object (a $state proxy from the store array). Identity is preserved
	// so anything binding to it stays in sync. A single $effect watches
	// the active entry's snapshot and schedules a kind-aware flush that
	// pushes the right store (communities vs npcs) to the API.
	let _saveTimer: ReturnType<typeof setTimeout> | null = null;
	let _savingKind: EntryKind | null = null;

	function updateCommunity(patch: Partial<Community>) {
		if (activeEntry?.kind !== 'community') return;
		Object.assign(activeEntry.data as object, patch);
	}
	function updateNpc(patch: Partial<Npc>) {
		if (activeEntry?.kind !== 'npc') return;
		Object.assign(activeEntry.data as object, patch);
	}
	function updatePlace(patch: Partial<Place>) {
		if (activeEntry?.kind !== 'place') return;
		Object.assign(activeEntry.data as object, patch);
	}
	function updateCommunityLike(patch: Partial<Community & Place>) {
		if (activeEntry?.kind === 'community') updateCommunity(patch);
		else if (activeEntry?.kind === 'place') updatePlace(patch);
	}

	/** Roll on the Settlement Trouble oracle, animate the d100, log the
	 *  outcome, then apply it to the active community — mirrors the pattern
	 *  used by ExpeditionsArea.rollFeature / rollDanger. */
	async function rollSettlementTrouble() {
		if (activeEntry?.kind !== 'community' || rolling) return;
		rolling = true;
		try {
			// Ensure the oracle catalogue is loaded — a user who jumps straight
			// into a pre-existing community without opening the OraclesDialog or
			// the new-community flow won't have it yet, and rollOracle would
			// silently return value='' (unknown oracle key).
			await loadOracles();
			const result = rollOracle('settlementTrouble', getOracles());
			if (!result.value) return;
			appendLog(
				result.title,
				`<div class="roll-line">Roll: d100 → ${result.roll}</div>` +
					`<div>Result: <strong>${result.value}</strong></div>`,
			);
			updateCommunity({ trouble: result.value });
		} finally {
			rolling = false;
		}
	}

	$effect(() => {
		if (!activeEntry) return;
		const kind = activeEntry.kind;
		$state.snapshot(activeEntry.data);
		// If the pending save targets a different store, flush it first so
		// we don't lose a Community edit by overwriting the timer with an NPC edit.
		if (_saveTimer && _savingKind && _savingKind !== kind) flushPersist();
		_savingKind = kind;
		if (_saveTimer) clearTimeout(_saveTimer);
		_saveTimer = setTimeout(() => {
			const k = _savingKind;
			_saveTimer = null;
			_savingKind = null;
			const p =
				k === 'npc'
					? persistNpcsNow()
					: k === 'place'
						? persistPlacesNow()
						: persistCommunitiesNow();
			p.catch((err) => console.error('[v2] save failed', err));
		}, 1500);
		return () => {
			if (_saveTimer) {
				clearTimeout(_saveTimer);
				const k = _savingKind;
				_saveTimer = null;
				_savingKind = null;
				const p =
					k === 'npc'
						? persistNpcsNow()
						: k === 'place'
							? persistPlacesNow()
							: persistCommunitiesNow();
				p.catch((err) => console.error('[v2] save failed', err));
			}
		};
	});

	function flushPersist() {
		if (_saveTimer) {
			clearTimeout(_saveTimer);
			const k = _savingKind;
			_saveTimer = null;
			_savingKind = null;
			const p =
				k === 'npc'
					? persistNpcsNow()
					: k === 'place'
						? persistPlacesNow()
						: persistCommunitiesNow();
			p.catch((err) => console.error('[v2] save failed', err));
		}
	}

	function setNotes(value: string) {
		if (activeEntry?.kind === 'community') updateCommunity({ notes: value });
		else if (activeEntry?.kind === 'npc') updateNpc({ notes: value });
		else if (activeEntry?.kind === 'place') updatePlace({ notes: value });
	}
	function setSituationalNotes(value: string) {
		if (activeEntry?.kind === 'community') updateCommunity({ situationalNotes: value });
		else if (activeEntry?.kind === 'npc') updateNpc({ situationalNotes: value });
		else if (activeEntry?.kind === 'place') updatePlace({ situationalNotes: value });
	}

	// ── Add Community / NPC (V1 random-or-manual pattern) ──────────────────
	async function addNewCommunity() {
		_pendingCommunity = {
			id: crypto.randomUUID(),
			name: 'New Community',
			region: '',
			location: '',
			locationDescription: '',
			trouble: '',
			notes: '',
			createdAt: Date.now(),
		};
		newCommunityName = '';
		await loadOracles();
		newCommunityDialogRef?.open();
	}

	async function _commitCommunity(random: boolean) {
		if (!_pendingCommunity) return;
		const c = _pendingCommunity;
		_pendingCommunity = null;
		if (random) {
			const oracles = getOracles();
			const nameOracle = Math.random() < 0.5 ? 'settlementName' : 'settlementNameQuick';
			const nameVal = rollOracle(nameOracle, oracles).value;
			if (nameVal) c.name = nameVal;
			c.region =
				_pendingCommunityRegionType === 'yrt'
					? rollOracle('yrtRegion', oracles).value
					: rollOracle('region', oracles).value;
			c.location = rollOracle(_pendingCommunityLocationType, oracles).value;
			c.locationDescription = rollOracle('locationDescriptor', oracles).value;
			c.trouble = rollOracle('settlementTrouble', oracles).value;
		}
		if (newCommunityName.trim()) c.name = newCommunityName.trim();
		await addCommunity(c);
		activeEntryId = c.id;
		activeTab = 'core';
	}

	async function addNewNpc() {
		_pendingNpc = {
			id: crypto.randomUUID(),
			name: 'New NPC',
			role: '',
			goal: '',
			descriptor: '',
			relationship: 'neutral',
			location: '',
			notes: '',
			createdAt: Date.now(),
		};
		newNpcName = '';
		await loadOracles();
		newNpcDialogRef?.open();
	}

	async function _commitNpc(random: boolean) {
		if (!_pendingNpc) return;
		const n = _pendingNpc;
		_pendingNpc = null;
		if (random) {
			const oracles = getOracles();
			n.role = rollOracle('characterRole', oracles).value;
			n.goal = rollOracle('characterGoal', oracles).value;
			n.descriptor = rollOracle('characterDescriptor', oracles).value;
			if (_pendingNpcNameOracle.startsWith('namesOther_')) {
				const o = findOracle('namesOther');
				if (o) {
					const r = rollFromRangeTable(o.data);
					const v = r.value as { giants: string; varou: string; trolls: string };
					const sub = _pendingNpcNameOracle.split('_')[1] as keyof typeof v;
					n.name = v[sub];
				}
			} else {
				const o = findOracle(_pendingNpcNameOracle);
				if (o) n.name = rollFromRangeTable(o.data).value as string;
			}
		}
		if (newNpcName.trim()) n.name = newNpcName.trim();
		await addNpc(n);
		activeEntryId = n.id;
		activeTab = 'core';
	}

	async function addNewPlace() {
		_pendingPlace = {
			id: crypto.randomUUID(),
			name: 'New Place',
			region: '',
			location: '',
			locationDescription: '',
			trouble: '',
			notes: '',
			createdAt: Date.now(),
		};
		newPlaceName = '';
		await loadOracles();
		newPlaceDialogRef?.open();
	}

	async function _commitPlace(random: boolean) {
		if (!_pendingPlace) return;
		const pl = _pendingPlace;
		_pendingPlace = null;
		if (random) {
			const oracles = getOracles();
			// Places don't have their own oracles yet — reuse the settlement ones
			// so the random flow feels consistent with Communities. Trouble is
			// intentionally NOT auto-rolled: the Settlement Trouble oracle is
			// community-specific and doesn't map to inns / forests / ruins.
			const nameOracle = Math.random() < 0.5 ? 'settlementName' : 'settlementNameQuick';
			const nameVal = rollOracle(nameOracle, oracles).value;
			if (nameVal) pl.name = nameVal;
			pl.region =
				_pendingPlaceRegionType === 'yrt'
					? rollOracle('yrtRegion', oracles).value
					: rollOracle('region', oracles).value;
			pl.location = rollOracle(_pendingPlaceLocationType, oracles).value;
			pl.locationDescription = rollOracle('locationDescriptor', oracles).value;
		}
		await addPlace(pl);
		activeEntryId = pl.id;
		activeTab = 'core';
	}

	async function confirmDeleteEntry() {
		if (!activeEntry) return;
		const id = activeEntry.id;
		if (activeEntry.kind === 'community') await removeCommunity(id);
		else if (activeEntry.kind === 'npc') await removeNpc(id);
		else await removePlace(id);
		if (activeEntryId === id) activeEntryId = null;
		// Return to the list on narrow layouts after deleting the open entry.
	}
</script>

<div class="cm-area">
	<header class="cm-header">
		{#if showTitle}
			<span class="cm-title-icon" aria-hidden="true">{@html villageIconSvg}</span>
			<span class="cmt-title">{headingText('Connections')}</span>
		{/if}
		<div class="cm-header-actions" data-entry-count={entries.length}>
			<Popover.Root bind:open={entryPickerOpen}>
				<Popover.Trigger class="mp-combobox cm-hdr-combobox" aria-label="Switch or add connection">
					{#if activeEntry}
						<span class="mp-combobox-value"
							>{activeEntry.data.name || `Unnamed ${kindLabelSingular(activeEntry.kind)}`}</span
						>
					{:else}
						<span class="mp-combobox-value mp-combobox-value--placeholder"
							>— No connections yet —</span
						>
					{/if}
					<span class="mp-combobox-caret" aria-hidden="true">{@html iconCaretDownSvg}</span>
				</Popover.Trigger>
				<Popover.Portal>
					<Popover.Content class="mp-cmd-popover" sideOffset={4} align="start" collisionPadding={8}>
						<Command.Root class="mp-cmd">
							<div class="mp-cmd-search-row">
								<span class="mp-cmd-search-icon" aria-hidden="true">{@html searchIconSvg}</span>
								<Command.Input class="mp-cmd-search" placeholder="Search connections…" autofocus />
							</div>
							<Command.List class="mp-cmd-list">
								<Command.Empty class="mp-cmd-empty">No matching connections.</Command.Empty>
								{#each sortedEntries as entry (entry.id)}
									{@const n = entry.data.name || `Unnamed ${kindLabelSingular(entry.kind)}`}
									{@const accent = accentFor(entry.kind)}
									<Command.Item
										class="mp-cmd-item"
										value={n}
										onSelect={() => {
											selectEntry(entry.id);
											entryPickerOpen = false;
										}}
									>
										<span class="mp-cmd-check" aria-hidden="true">
											{#if entry.id === activeEntryId}
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
											class="mp-cmd-item-icon cm-cmd-type-icon"
											style="color: {accent}"
											aria-hidden="true">{@html iconFor(entry.kind)}</span
										>
										<span class="mp-cmd-item-name">{n}</span>
									</Command.Item>
								{/each}
								<Command.Separator class="mp-cmd-sep" />
								<Command.Item
									class="mp-cmd-item mp-cmd-item--action"
									value="+ New Community"
									onSelect={() => {
										entryPickerOpen = false;
										void addNewCommunity();
									}}
								>
									<span class="mp-cmd-check" aria-hidden="true"></span>
									<span class="mp-cmd-item-name">+ New Community…</span>
								</Command.Item>
								<Command.Item
									class="mp-cmd-item mp-cmd-item--action"
									value="+ New NPC"
									onSelect={() => {
										entryPickerOpen = false;
										void addNewNpc();
									}}
								>
									<span class="mp-cmd-check" aria-hidden="true"></span>
									<span class="mp-cmd-item-name">+ New NPC…</span>
								</Command.Item>
								<Command.Item
									class="mp-cmd-item mp-cmd-item--action"
									value="+ New Place"
									onSelect={() => {
										entryPickerOpen = false;
										void addNewPlace();
									}}
								>
									<span class="mp-cmd-check" aria-hidden="true"></span>
									<span class="mp-cmd-item-name">+ New Place…</span>
								</Command.Item>
							</Command.List>
						</Command.Root>
					</Popover.Content>
				</Popover.Portal>
			</Popover.Root>
			{#if activeEntry}
				{#if activeEntry.kind === 'npc'}
					<SegmentedRadio
						ariaLabel="NPC status"
						labels="auto"
						value={(activeEntry.data as Npc).deceased ? 'deceased' : 'alive'}
						onchange={(v) => updateNpc({ deceased: v === 'deceased' })}
						options={[
							{
								value: 'alive',
								icon: heartPulseSvg,
								text: 'Alive',
								label: 'Mark alive',
								tone: 'go',
							},
							{
								value: 'deceased',
								icon: skullSvg,
								text: 'Deceased',
								label: 'Mark deceased',
								tone: 'stop',
							},
						]}
					/>
				{/if}
				{#if activeIsMapOwner}
					{#if activeEntryMapEmpty}
						<label
							class="btn cm-stage-map-btn"
							use:tooltip={`Add a background image to this ${kindLabelSingular(activeEntry.kind).toLowerCase()}’s map`}
							aria-label="Add map"
						>
							+ Map
							<input type="file" accept="image/*" hidden onchange={handleAddMapWithFile} />
						</label>
					{:else}
						<button
							class="btn cm-stage-map-btn"
							onclick={openOwnedMap}
							use:tooltip={`Open the map for this ${kindLabelSingular(activeEntry.kind).toLowerCase()}`}
							aria-label="Open map">Map</button
						>
					{/if}
				{/if}
				<button
					class="btn btn-icon icon-btn cm-hdr-settings-btn"
					onclick={() => entryOptionsRef?.open()}
					use:tooltip={`${kindLabelSingular(activeEntry.kind)} options`}
					aria-label="Connection options">{@html iconGearSvg}</button
				>
			{/if}
		</div>
	</header>

	{#if loading}
		<div class="cm-loading">Loading…</div>
	{:else if entries.length === 0}
		<div class="cm-empty">
			<span class="cm-empty-icon" aria-hidden="true">{@html villageIconSvg}</span>
			<p class="cm-empty-text">
				There are people and places to <s>plunder</s> discover. Pick
				<strong>+ New Community…</strong>, <strong>+ New NPC…</strong>, or
				<strong>+ New Place…</strong> from the switcher above to begin.
			</p>
		</div>
	{:else}
		<div class="cm-body">
			{#if activeEntry}
				<div class="cm-stage" role="tabpanel" style="--cm-nature: {activeColor}">
					<Tabs.Root
						value={activeTab}
						onValueChange={(v) => (activeTab = v as CmTab)}
						class="cm-tabs-root"
					>
						<Tabs.List class="cm-tabs">
							{#each tabs as tab (tab.key)}
								<Tabs.Trigger value={tab.key} class="cm-tab">{tab.label}</Tabs.Trigger>
							{/each}
						</Tabs.List>
					</Tabs.Root>

					{#if activeTab === 'core'}
						{#if activeEntry.kind === 'community' || activeEntry.kind === 'place'}
							{@const c = activeEntry.data}
							<div class="cm-field-row">
								<label class="cm-field-label" for="cm-region-{c.id}">Region</label>
								<input
									id="cm-region-{c.id}"
									class="cm-input"
									type="text"
									value={c.region}
									oninput={(e) =>
										updateCommunityLike({ region: (e.target as HTMLInputElement).value })}
									placeholder="Region…"
								/>
							</div>
							<div class="cm-field-row">
								<label class="cm-field-label" for="cm-location-{c.id}">Location</label>
								<input
									id="cm-location-{c.id}"
									class="cm-input"
									type="text"
									value={c.location}
									oninput={(e) =>
										updateCommunityLike({ location: (e.target as HTMLInputElement).value })}
									placeholder="Location…"
								/>
							</div>
							<div class="cm-field-row">
								<label class="cm-field-label" for="cm-locdesc-{c.id}">Description</label>
								<input
									id="cm-locdesc-{c.id}"
									class="cm-input"
									type="text"
									value={c.locationDescription}
									oninput={(e) =>
										updateCommunityLike({
											locationDescription: (e.target as HTMLInputElement).value,
										})}
									placeholder="Location description…"
								/>
							</div>
							<!-- Map field: one chip per marker referencing this
								     community/place. Multi-map is supported natively —
								     the store returns refs across all maps, chips wrap
								     onto new rows via flex-wrap. Coord (x, y) lives in
								     the tooltip; chip text is the map name only. -->
							<div class="cm-field-row cm-field-row--map">
								<span class="cm-field-label">Map</span>
								<div class="cm-mapref-chips">
									{#if activeEntryMarkers.length === 0}
										<span class="cm-mapref-empty">Not on any map</span>
									{:else}
										{#each activeEntryMarkers as ref (ref.markerId)}
											<button
												class="cm-mapref-chip"
												onclick={() => jumpToMarker(ref)}
												use:tooltip={`Jump to "${ref.label || '(unlabeled)'}" on ${ref.mapName} — (${fmtCoord(ref.x)}, ${fmtCoord(ref.y)})`}
												aria-label={`Jump to marker on ${ref.mapName}`}
											>
												<span class="cm-mapref-name">{ref.mapName}</span>
											</button>
										{/each}
									{/if}
								</div>
							</div>
							<div class="cm-field-row cm-field-row--trouble">
								<label class="cm-field-label" for="cm-trouble-{c.id}">Trouble</label>
								<input
									id="cm-trouble-{c.id}"
									class="cm-input"
									type="text"
									value={c.trouble}
									oninput={(e) =>
										updateCommunityLike({ trouble: (e.target as HTMLInputElement).value })}
									placeholder={activeEntry.kind === 'place' ? 'Trouble…' : 'Settlement trouble…'}
								/>
								{#if activeEntry.kind === 'community'}
									<!-- Settlement Trouble oracle is community-only; places don't
										     have their own trouble oracle yet, so the dice button
										     is hidden for them. -->
									<button
										class="cm-dice-btn"
										type="button"
										onclick={rollSettlementTrouble}
										disabled={rolling}
										use:tooltip={'Roll settlement trouble oracle'}
										aria-label="Roll settlement trouble oracle">{@html diceD6Svg}</button
									>
								{/if}
							</div>
						{:else}
							{@const n = activeEntry.data}
							<div class="cm-field-row">
								<label class="cm-field-label" for="cm-role-{n.id}">Role</label>
								<input
									id="cm-role-{n.id}"
									class="cm-input"
									type="text"
									value={n.role}
									oninput={(e) => updateNpc({ role: (e.target as HTMLInputElement).value })}
									placeholder="Role…"
								/>
							</div>
							<div class="cm-field-row">
								<label class="cm-field-label" for="cm-goal-{n.id}">Goal</label>
								<input
									id="cm-goal-{n.id}"
									class="cm-input"
									type="text"
									value={n.goal}
									oninput={(e) => updateNpc({ goal: (e.target as HTMLInputElement).value })}
									placeholder="Goal…"
								/>
							</div>
							<div class="cm-field-row">
								<label class="cm-field-label" for="cm-desc-{n.id}">Descriptor</label>
								<input
									id="cm-desc-{n.id}"
									class="cm-input"
									type="text"
									value={n.descriptor}
									oninput={(e) => updateNpc({ descriptor: (e.target as HTMLInputElement).value })}
									placeholder="Short likeness — tall, gaunt, scarred…"
								/>
							</div>
							<div class="cm-field-row">
								<label class="cm-field-label" for="cm-rel-{n.id}">Relationship</label>
								<Select
									id="cm-rel-{n.id}"
									class="cm-select"
									value={n.relationship}
									options={RELATIONSHIPS}
									onchange={(v) => updateNpc({ relationship: v })}
								/>
							</div>
							<div class="cm-field-row">
								<label class="cm-field-label" for="cm-loc-{n.id}">Location</label>
								<input
									id="cm-loc-{n.id}"
									class="cm-input"
									type="text"
									value={n.location}
									oninput={(e) => updateNpc({ location: (e.target as HTMLInputElement).value })}
									placeholder="Location…"
								/>
							</div>
						{/if}

						<!-- Situational notes — short notes about current conditions,
							     separate from the long-form Description (notes) field. While
							     editing, the block grows to fill the rest of the Core panel. -->
						<div class="cm-core-notes" class:cm-core-notes--editing={editingCoreNotes}>
							<span class="cm-field-label cm-core-notes-label">Notes</span>
							<MarkdownNotes
								bind:editing={editingCoreNotes}
								value={activeEntry.data.situationalNotes ?? ''}
								oninput={(v) => setSituationalNotes(v)}
								placeholder={activeEntry.kind === 'npc'
									? 'Actions taken by or things that have happened to this NPC in your story…'
									: activeEntry.kind === 'place'
										? 'Events that have happened here, current state…'
										: 'Situational notes — conditions, or aspects of the trouble…'}
								rows={4}
							/>
						</div>
					{:else if activeTab === 'notes'}
						<div class="cm-notes-section" class:cm-notes-section--editing={editingNotes}>
							<!-- Portrait floats right and the prose wraps around it; it's
								     hidden while editing so the textarea fills the whole panel. -->
							{#if !editingNotes}
								<PortraitUploader
									endpoint={`/api/session/${
										activeEntry.kind === 'npc'
											? 'npcs'
											: activeEntry.kind === 'place'
												? 'places'
												: 'communities'
									}/${activeEntry.data.id}/portrait`}
									etag={activeEntry.data.portraitEtag ?? ''}
									oninput={(etag) => {
										if (activeEntry?.kind === 'community') updateCommunity({ portraitEtag: etag });
										else if (activeEntry?.kind === 'npc') updateNpc({ portraitEtag: etag });
										else if (activeEntry?.kind === 'place') updatePlace({ portraitEtag: etag });
									}}
									placeholderSvg={iconFor(activeEntry.kind)}
									alt={activeEntry.data.name}
								/>
							{/if}

							<MarkdownNotes
								bind:editing={editingNotes}
								value={activeEntry.data.notes ?? ''}
								oninput={(v) => setNotes(v)}
								placeholder={activeEntry.kind === 'npc'
									? 'Origin, upbringing, major traits…'
									: activeEntry.kind === 'place'
										? 'Physical features, atmosphere, notable details…'
										: 'Description of this community…'}
								rows={6}
							/>
						</div>
					{/if}
				</div>
			{/if}
		</div>
	{/if}
</div>

{#if activeEntry}
	<ConnectionOptionsDialog
		bind:this={entryOptionsRef}
		name={activeEntry.data.name || ''}
		kind={activeEntry.kind}
		oncommit={(next) => {
			if (activeEntry?.kind === 'community') updateCommunity({ name: next });
			else if (activeEntry?.kind === 'npc') updateNpc({ name: next });
			else if (activeEntry?.kind === 'place') updatePlace({ name: next });
		}}
		ondelete={confirmDeleteEntry}
	/>
{/if}

<!-- New Community dialog — V1 pattern. -->
<ConfirmDialog
	bind:this={newCommunityDialogRef}
	title="New Community"
	confirmLabel="Random"
	confirmClass="btn-primary"
	showCancelButton={false}
	alternateLabel="Create"
	accentColor={COMMUNITY_COLOR}
	onconfirm={() => _commitCommunity(true)}
	onalternate={() => _commitCommunity(false)}
	ondismiss={() => {
		_pendingCommunity = null;
	}}
>
	<label class="co-field" style="margin-bottom: 10px;">
		<span class="co-field-label">Community name</span>
		<input class="co-input" type="text" bind:value={newCommunityName} placeholder="New Community" />
	</label>
	<p
		style="font-family: var(--font-ui); font-size: 0.8rem; color: var(--text-muted); margin: 0 0 10px;"
	>
		Generate fields randomly using oracles, or create the community manually?
	</p>
	<div class="v2-radio-row">
		<RadioGroup.Root
			class="v2-radio-group"
			value={_pendingCommunityRegionType}
			onValueChange={(v) => (_pendingCommunityRegionType = v as typeof _pendingCommunityRegionType)}
			aria-label="Region oracle"
		>
			<span class="v2-radio-legend">Region oracle</span>
			<label class="v2-radio-label">
				<RadioGroup.Item value="ironlands" class="v2-radio-btn">
					<span class="v2-radio-dot"></span>
				</RadioGroup.Item> Ironlands
			</label>
			{#if isYrtEnabled()}
				<label class="v2-radio-label">
					<RadioGroup.Item value="yrt" class="v2-radio-btn">
						<span class="v2-radio-dot"></span>
					</RadioGroup.Item> YRT
				</label>
			{/if}
		</RadioGroup.Root>
		<RadioGroup.Root
			class="v2-radio-group"
			value={_pendingCommunityLocationType}
			onValueChange={(v) =>
				(_pendingCommunityLocationType = v as typeof _pendingCommunityLocationType)}
			aria-label="Location oracle"
		>
			<span class="v2-radio-legend">Location oracle</span>
			<label class="v2-radio-label">
				<RadioGroup.Item value="location" class="v2-radio-btn">
					<span class="v2-radio-dot"></span>
				</RadioGroup.Item> Inland
			</label>
			<label class="v2-radio-label">
				<RadioGroup.Item value="coastalWatersLocation" class="v2-radio-btn">
					<span class="v2-radio-dot"></span>
				</RadioGroup.Item> Coastal Waters
			</label>
		</RadioGroup.Root>
	</div>
</ConfirmDialog>

<!-- New NPC dialog — V1 pattern with name-oracle selector. -->
<ConfirmDialog
	bind:this={newNpcDialogRef}
	title="New NPC"
	confirmLabel="Random"
	confirmClass="btn-primary"
	showCancelButton={false}
	alternateLabel="Create"
	accentColor={NPC_COLOR}
	onconfirm={() => _commitNpc(true)}
	onalternate={() => _commitNpc(false)}
	ondismiss={() => {
		_pendingNpc = null;
	}}
>
	<label class="co-field" style="margin-bottom: 10px;">
		<span class="co-field-label">NPC name</span>
		<input class="co-input" type="text" bind:value={newNpcName} placeholder="New NPC" />
	</label>
	<p
		style="font-family: var(--font-ui); font-size: 0.8rem; color: var(--text-muted); margin: 0 0 8px;"
	>
		Generate fields randomly using oracles, or create the NPC manually?
	</p>
	<RadioGroup.Root
		class="v2-radio-group"
		value={_pendingNpcNameOracle}
		onValueChange={(v) => (_pendingNpcNameOracle = v as typeof _pendingNpcNameOracle)}
		aria-label="Name oracle"
	>
		<span class="v2-radio-legend">Name oracle</span>
		{#each [{ value: 'namesIronlander', label: 'Ironlander' }, { value: 'namesIronlander2', label: 'Ironlander 2' }, { value: 'namesElf', label: 'Elf' }, { value: 'namesOther_giants', label: 'Giants' }, { value: 'namesOther_varou', label: 'Varou' }, { value: 'namesOther_trolls', label: 'Trolls' }] as opt}
			<label class="v2-radio-label">
				<RadioGroup.Item value={opt.value} class="v2-radio-btn">
					<span class="v2-radio-dot"></span>
				</RadioGroup.Item>
				{opt.label}
			</label>
		{/each}
	</RadioGroup.Root>
</ConfirmDialog>

<!-- New Place dialog — mirrors the New Community pattern. Places don't have
     their own place-specific oracle yet, so random generation reuses the
     settlement oracles. Trouble is intentionally NOT auto-rolled (settlement
     trouble doesn't map to inns, forests, ruins, etc). -->
<ConfirmDialog
	bind:this={newPlaceDialogRef}
	title="New Place"
	confirmLabel="Random"
	confirmClass="btn-primary"
	showCancelButton={false}
	alternateLabel="Create"
	accentColor={PLACE_COLOR}
	onconfirm={() => _commitPlace(true)}
	onalternate={() => _commitPlace(false)}
	ondismiss={() => {
		_pendingPlace = null;
	}}
>
	<label class="co-field" style="margin-bottom: 10px;">
		<span class="co-field-label">Place name</span>
		<input class="co-input" type="text" bind:value={newPlaceName} placeholder="New Place" />
	</label>
	<p
		style="font-family: var(--font-ui); font-size: 0.8rem; color: var(--text-muted); margin: 0 0 10px;"
	>
		Generate fields randomly using oracles, or create the place manually?
	</p>
	<div class="v2-radio-row">
		<RadioGroup.Root
			class="v2-radio-group"
			value={_pendingPlaceRegionType}
			onValueChange={(v) => (_pendingPlaceRegionType = v as typeof _pendingPlaceRegionType)}
			aria-label="Region oracle"
		>
			<span class="v2-radio-legend">Region oracle</span>
			<label class="v2-radio-label">
				<RadioGroup.Item value="ironlands" class="v2-radio-btn">
					<span class="v2-radio-dot"></span>
				</RadioGroup.Item> Ironlands
			</label>
			{#if isYrtEnabled()}
				<label class="v2-radio-label">
					<RadioGroup.Item value="yrt" class="v2-radio-btn">
						<span class="v2-radio-dot"></span>
					</RadioGroup.Item> YRT
				</label>
			{/if}
		</RadioGroup.Root>
		<RadioGroup.Root
			class="v2-radio-group"
			value={_pendingPlaceLocationType}
			onValueChange={(v) => (_pendingPlaceLocationType = v as typeof _pendingPlaceLocationType)}
			aria-label="Location oracle"
		>
			<span class="v2-radio-legend">Location oracle</span>
			<label class="v2-radio-label">
				<RadioGroup.Item value="location" class="v2-radio-btn">
					<span class="v2-radio-dot"></span>
				</RadioGroup.Item> Inland
			</label>
			<label class="v2-radio-label">
				<RadioGroup.Item value="coastalWatersLocation" class="v2-radio-btn">
					<span class="v2-radio-dot"></span>
				</RadioGroup.Item> Coastal Waters
			</label>
		</RadioGroup.Root>
	</div>
</ConfirmDialog>

<MapDialog bind:this={mapDialogRef} />

<style>
	.cm-area {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
	}
	/* Height-match the neighbouring trash button. The trash btn renders
	   at ~22px (12px SVG + 4+4 padding + 1+1 border via
	   `.btn.btn-icon.btn-trash`), while `.btn`'s inherited
	   `line-height: 1.5` on `0.72rem` would puff the map btn to ~27px.
	   `line-height: 1` collapses the text baseline and `min-height:
	   22px` pins the final height to the trash btn's natural size. */
	.cm-stage-map-btn {
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
	/* Map field — the chip strip lives inside a `.cm-field-row` in
	   the Core tab now (previously a header-level band). One chip per
	   marker referencing this community/place; hover surfaces the
	   marker label + coordinates. Multi-map users get multiple chips
	   that wrap onto new rows via `flex-wrap`. */
	.cm-mapref-chips {
		flex: 1 1 auto;
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		align-items: center;
	}
	.cm-mapref-empty {
		font-family: var(--font-ui);
		font-size: 0.75rem;
		font-style: italic;
		color: var(--text-dimmer);
	}
	.cm-mapref-chip {
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
	.cm-mapref-chip:hover {
		border-color: var(--text-accent);
		color: var(--text-accent);
	}
	.cm-mapref-name {
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 12rem;
	}

	.cm-header {
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
		.cmt-title {
			display: none;
		}
	}
	.cm-title-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 18px;
		height: 18px;
		flex-shrink: 0;
		color: var(--text-accent);
	}
	.cm-title-icon :global(svg) {
		width: 100%;
		height: 100%;
		fill: currentColor;
	}
	.cm-title-icon :global(svg) :global(path) {
		fill: currentColor;
	}
	.cmt-title {
		font-family: var(--font-display);
		font-size: calc(0.82rem * var(--font-display-scale));
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: var(--font-display-transform);
		color: var(--text-accent);
	}
	.cm-header-actions {
		display: flex;
		align-items: center;
		gap: 6px;
		flex: 1;
		justify-content: flex-end;
		/* container for SegmentedRadio's responsive (labels="auto") collapse */
		container-type: inline-size;
	}

	.cm-loading,
	.cm-empty {
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

	.cm-empty-icon {
		display: flex;
		width: 48px;
		height: 48px;
		opacity: 0.25;
	}
	.cm-empty-icon :global(svg) {
		width: 100%;
		height: 100%;
		fill: currentColor;
	}
	.cm-empty-text {
		margin: 0;
		line-height: 1.5;
		max-width: 26ch;
	}

	.cm-body {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
	}
	/* Stage — coloured 3 px band on the LHS keyed to entry type
	   (community / npc / place). Also the tabpanel surface (its
	   background is the inset "card" the retired .cm-card wrapped). */
	.cm-stage {
		flex: 1;
		min-height: 0;
		min-width: 0;
		padding: 7px;
		background: var(--bg-inset);
		border-left: 3px solid var(--cm-nature, var(--text-muted));
		overflow: auto;
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	/* Rail tools — search, type filter, sort. */
	/* Search + Filters + Sort on one row. Search takes the flexible slack
	   so the two chips on the right stay a fixed size and don't jump
	   around as the user types. Wraps to a second line on very narrow
	   viewports (~<260 px) where the three side by side would overflow. */
	/* Rail list — one row per connection. */
	/* Deceased status — red skull icon, shown on NPC rows only when deceased.
	   Matches the SegmentedRadio "stop" tone so the list and card status agree. */

	/* Toolbar back button — styled by .btn .cm-hdr-btn .back-btn (the shared
	   "← Back" style). This rule only handles its conditional visibility:
	   hidden except in the mobile single-pane drill-down (viewport ≤600px
	   while a detail entry is open; see @media). */

	:global(.cm-tabs) {
		display: flex;
		align-items: stretch;
		gap: 0;
		margin-bottom: 8px;
		border-bottom: 1px solid var(--border);
	}
	:global(.cm-tab) {
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
	:global(.cm-tab:hover) {
		color: var(--text-muted);
	}
	:global(.cm-tab[data-state='active']) {
		color: var(--text-accent);
		border-bottom-color: var(--text-accent);
	}

	.cm-notes-section {
		/* flow-root contains the right-floated portrait so the section grows
		   to hold it even when the prose is short. */
		display: flow-root;
	}
	/* Description tab: let the prose wrap around the floated portrait.
	   MarkdownNotes is normally a flex column — its own block-formatting
	   context, which would sit beside the float instead of flowing around it.
	   Force normal block flow here (scoped to this section) so text wraps. */
	.cm-notes-section :global(.md-notes) {
		display: block;
	}
	/* While editing, the portrait is hidden — let the textarea fill the whole
	   panel (full width and height of the containing card). */
	.cm-notes-section--editing {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
	}
	.cm-notes-section--editing :global(.md-notes) {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
	}
	.cm-notes-section--editing :global(.md-notes-input) {
		flex: 1;
		min-height: 0;
	}

	/* Core-tab notes block — same `notes` field as the Description tab,
	   exposed at the bottom of Core for quick edits. The Description tab
	   keeps its richer view (portrait + notes wrapping around it). */
	.cm-core-notes {
		display: block;
		margin-top: 12px;
		padding-top: 10px;
		border-top: 1px solid var(--border);
	}
	/* While editing, the situational-notes block grows to fill the rest of the
	   Core panel (it's a direct flex child of .cm-stage); the textarea fills it
	   with the markdown hint pinned to the bottom. */
	.cm-core-notes--editing {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
	}
	.cm-core-notes--editing :global(.md-notes) {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
	}
	.cm-core-notes--editing :global(.md-notes-input) {
		flex: 1;
		min-height: 0;
	}
	.cm-core-notes-label {
		display: block;
		margin-bottom: 4px;
	}
	.cm-field-row {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.cm-field-label {
		font-family: var(--font-ui);
		font-size: 0.7rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--text-dimmer);
		min-width: 90px;
	}
	.cm-input {
		flex: 1;
		font-family: var(--font-ui);
		font-size: 0.78rem;
		color: var(--text);
		background: var(--bg-inset);
		border: 1px solid var(--border);
		border-radius: 4px;
		padding: 3px 8px;
		outline: none;
	}
	.cm-input:focus {
		border-color: var(--text-accent);
	}
	/* Threaded to bits-ui via `<Select class="cm-select">` so scope
	   globally. Base look from `.bui-select-trigger`; override just
	   makes the trigger flex-fill inside `.cm-field-row` like the
	   sibling `<input class="cm-input">` fields. */
	:global(.cm-select) {
		flex: 1;
		font-size: 0.78rem;
		padding: 3px 8px;
		min-height: 0;
	}

	.cm-field-row--trouble {
		align-items: center;
	}

	/* Square d6 button sitting next to the trouble input. Sized to match the
	   ea-dice-btn spec used by ExpeditionsArea's feature/danger rolls so
	   both areas read the same — 22×22, 12 px svg. */
	.cm-dice-btn {
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
	.cm-dice-btn:hover:not(:disabled) {
		color: var(--text-accent);
		border-color: var(--text-accent);
	}
	.cm-dice-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
	.cm-dice-btn :global(svg) {
		width: 12px;
		height: 12px;
		fill: currentColor;
		pointer-events: none;
	}

	/* Header gear + combobox — sizing and svg tint. */
	:global(.cm-hdr-settings-btn) {
		flex-shrink: 0;
	}
	:global(.cm-hdr-settings-btn svg) {
		width: 13px;
		height: 13px;
		fill: currentColor;
	}
	:global(.cm-hdr-settings-btn svg path) {
		fill: currentColor;
	}
	:global(.cm-hdr-combobox) {
		flex: 1 1 auto;
		min-width: 0;
	}
	/* Type-icon glyph (community / npc / place) inside popover items. */
	:global(.cm-cmd-type-icon svg) {
		fill: currentColor;
	}
	:global(.cm-cmd-type-icon svg path) {
		fill: currentColor;
	}
</style>
