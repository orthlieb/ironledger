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
	 *            place:     within / landmark / descriptor
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
	import { createDebouncedSave } from '$lib/debouncedSave.js';
	import { getPlaces, persistPlacesNow, addPlace, removePlace } from '$lib/placeStore.svelte.js';
	import type { Community, Npc, Place, NpcRelationship } from '$lib/types.js';
	import Select from '$lib/components/Select.svelte';
	import MarkdownNotes from '$lib/components/MarkdownNotes.svelte';
	import PortraitUploader from '$lib/components/PortraitUploader.svelte';
	import { isSourceEnabled, resolveOracleKey } from '$lib/expansionStore.svelte.js';
	import { Popover, Command, Tabs } from 'bits-ui';
	import {
		loadOracles,
		getOracles,
		rollOracle,
		findOracle,
		rollFromRangeTable,
		resolveCharacterOracle,
	} from '$lib/oracleStore.svelte.js';
	import { appendLog } from '$lib/log.svelte.js';
	import { tooltip } from '$lib/actions/tooltip.js';

	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import Checkbox from '$lib/components/Checkbox.svelte';
	import ConnectionOptionsDialog from '$lib/components/ConnectionOptionsDialog.svelte';
	import MapDialog from '$lib/components/MapDialog.svelte';
	import {
		entityMarkerIndexState,
		loadEntityMarkerIndex,
		mapListState,
		markersForEntity,
		type EntityMarkerRef,
	} from '$lib/mapStore.svelte.js';
	import { formatEntityId } from '$lib/mapEntityLinks.js';
	import { createMapOwnerActions, fmtCoord } from '$lib/mapOwnerActions.js';
	import iconGearSvg from '$icons/gear-solid-full.svg?raw';
	import iconMapSvg from '$icons/compass-rose.svg?raw';
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

	// New-community dialog state. Location is an oracle picker (which oracle to
	// roll from); the checkboxes control which flavour fields — Region / Location
	// / Description / Trouble — roll on Create. Region has no picker: it always
	// uses the base Region oracle, or YRT's replacement when YRT is enabled.
	let newCommunityDialogRef = $state<{ open(): void; close(): void } | null>(null);
	let _pendingCommunity: Community | null = null;
	let _pendingCommunityLocationType = $state<'location' | 'coastalWatersLocation'>('location');
	let newCommunityRollRegion = $state(true);
	let newCommunityRollLocation = $state(true);
	let newCommunityRollDescription = $state(true);
	let newCommunityRollTrouble = $state(true);

	// Lodestar settlement suite — six fields shown only under Lodestar (or when a
	// settlement already has a value for one). Type / Condition / First Look are
	// the book's "on reveal" set (default rolled on Create); Disposition /
	// Projects / Cultural Touchstones are situational (default off — roll from the
	// panel d6 when the fiction calls for it).
	const LODESTAR_SETTLEMENT_FIELDS = [
		{ key: 'type', label: 'Type' },
		{ key: 'condition', label: 'Condition' },
		{ key: 'firstLook', label: 'First Look' },
		{ key: 'disposition', label: 'Disposition' },
		{ key: 'projects', label: 'Projects' },
		{ key: 'culturalTouchstones', label: 'Cultural Touchstones' },
	] as const;
	type LodestarSettlementFieldKey = (typeof LODESTAR_SETTLEMENT_FIELDS)[number]['key'];
	let newCommunityRollLodestar = $state<Record<LodestarSettlementFieldKey, boolean>>({
		type: true,
		condition: true,
		firstLook: true,
		disposition: false,
		projects: false,
		culturalTouchstones: false,
	});

	// Lodestar replaces a settlement's Location + Location Descriptor with its
	// own settlement oracle suite (Type / Condition / First Look …), so when it's
	// enabled we drop those two from the New Settlement flow — no roll on Create,
	// and their pickers/checkboxes hide. Place creation is unaffected: a Place is
	// a location, where Descriptor stays on-brand even under Lodestar.
	const lodestarOn = $derived(isSourceEnabled('lodestar'));

	// New-NPC dialog state — the dialog stays minimal: just a Name + Oracle
	// picker + a checklist of what to randomize on Create. The user lands on
	// the sheet and edits every other field there, so we don't recreate the
	// edit surface up front.
	let newNpcDialogRef = $state<{ open(): void; close(): void } | null>(null);
	let _pendingNpc: Npc | null = null;
	let _pendingNpcNameOracle = $state<string>('namesIronlander');
	let newNpcRollFirstLook = $state(true);
	let newNpcRollActivity = $state(true);
	let newNpcRollDisposition = $state(true);
	let newNpcRollRole = $state(true);
	let newNpcRollGoal = $state(true);
	let newNpcRollDescriptor = $state(true);
	/** YRT: rolls the compound `yrtTouched` oracle (class + animal aspect +
	 *  N features) and prepends the result into the NPC's background/notes.
	 *  No schema change — everything lives in the notes prose. */
	let newNpcRollTouched = $state(false);
	const NPC_NAME_ORACLES: { value: string; label: string }[] = [
		{ value: 'namesIronlander', label: 'Ironlander' },
		{ value: 'namesIronlander2', label: 'Ironlander 2' },
		{ value: 'namesElf_elf1', label: 'Elf 1' },
		{ value: 'namesElf_elf2', label: 'Elf 2' },
		{ value: 'namesOther_giants', label: 'Giants' },
		{ value: 'namesOther_varou', label: 'Varou' },
		{ value: 'namesOther_trolls', label: 'Trolls' },
	];

	// New-Place dialog state. A Place is a location (Landmark), not a
	// settlement, so it rolls a Landmark oracle rather than Settlement
	// Trouble — freestanding (Overland / Coastal) via _pendingPlaceLandmarkKind,
	// or the Settlement Landmark table (Marketplace / Docks / …) when nested.
	let newPlaceDialogRef = $state<{ open(): void; close(): void } | null>(null);
	let _pendingPlace: Place | null = null;
	// A Place is a location (Landmark), not a settlement. It's either freestanding
	// (Overland / Coastal Landmark) or nested inside a settlement (Settlement
	// Landmark), selected by the optional `withinSettlementId` parent link. Region
	// is auto (base/YRT) or inherited from the parent settlement.
	let _pendingPlaceLandmarkKind = $state<'inland' | 'coastal'>('inland');
	let _pendingPlaceWithin = $state<string>('');
	let newPlaceRollLandmark = $state(true);
	let newPlaceRollDescription = $state(true);

	// Combobox switcher + gear-options refs (mirrors Chars/Foes/Exp).
	let entryPickerOpen = $state(false);
	let entryOptionsRef = $state<{ open(): void; close(): void } | null>(null);
	// Kind-filter chip row in the switcher popover — 'all' by default so the
	// list looks the same as before; picking a chip narrows to that kind
	// (the search input then filters within that subset).
	let entryKindFilter = $state<'all' | EntryKind>('all');

	// Name-first drafts for the three New * dialogs.
	let newCommunityName = $state<string>('');
	let newNpcName = $state<string>('');
	let newPlaceName = $state<string>('');

	// Settlement name randomizer — two "double-rolling" oracles: Settlement Name
	// (category → example) and Quick Settlement Name (prefix + suffix). rollOracle
	// composes each into a finished string, so the picker just selects the source.
	let newCommunityNameOracle = $state('settlementName');
	const SETTLEMENT_NAME_ORACLES = [
		{ value: 'settlementName', label: 'Settlement Name' },
		{ value: 'settlementNameQuick', label: 'Quick Settlement Name' },
	];

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

	/** Popover list after the kind-filter chip. `all` returns sortedEntries
	 *  unchanged so the pre-chip behaviour is preserved. */
	const visibleEntries = $derived<Entry[]>(
		entryKindFilter === 'all'
			? sortedEntries
			: sortedEntries.filter((e) => e.kind === entryKindFilter),
	);
	/** Counts for the kind-chip row — rendered as the trailing number on
	 *  each chip so the user sees how many entries the filter would show. */
	const kindCounts = $derived({
		all: sortedEntries.length,
		community: sortedEntries.filter((e) => e.kind === 'community').length,
		npc: sortedEntries.filter((e) => e.kind === 'npc').length,
		place: sortedEntries.filter((e) => e.kind === 'place').length,
	});

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

	const { openOwnedMap, handleAddMapWithFile, jumpToMarker } = createMapOwnerActions(
		() =>
			activeEntry && activeIsMapOwner
				? {
						kind: activeEntry.kind as 'community' | 'place',
						id: activeEntry.data.id,
						name: activeEntry.data.name || 'Untitled',
					}
				: null,
		() => mapDialogRef,
	);

	// The Notes/description tab is labelled "Background" for NPCs (origin,
	// upbringing, major traits — fits a person) and "Description" for
	// communities (it describes a place). Same underlying `notes` field
	// either way.
	const tabs = $derived<{ key: CmTab; label: string }[]>([
		{ key: 'core', label: 'Core' },
		{ key: 'notes', label: activeKind === 'npc' ? 'Background' : 'Description' },
	]);

	function selectEntry(id: string) {
		_save.flush();
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
	const _save = createDebouncedSave();
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

	/** Re-parent the active Place. Setting a parent settlement pulls that
	 *  settlement's region down onto the place (a nested place shares its
	 *  parent's region); choosing "No settlement" clears the link but leaves
	 *  the region as-is. Mirrors the inheritance in _commitPlace. */
	function setPlaceWithin(settlementId: string) {
		const parent = settlementId ? communities.find((c) => c.id === settlementId) : undefined;
		updatePlace({
			withinSettlementId: settlementId || undefined,
			...(parent ? { region: parent.region } : {}),
		});
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

	/** Land tier for the Settlement Type columnSelect, derived from the region
	 *  per the book's mapping (Havens → settled; Barrier Islands / Flooded Lands /
	 *  Hinterlands / Ragged Coast → boundary; Deep Wilds / Tempest Hills / Veiled
	 *  Mountains → remote). YRT / unknown regions fall back to boundary. */
	function tierForRegion(
		region: string,
		oracles: ReturnType<typeof getOracles>,
	): 'settled' | 'boundary' | 'remote' {
		// YRT regions carry their tier in the Region oracle's `type` field — look
		// up the rolled region there first (its value is the plain region name).
		const t = oracles
			.find((o) => o.key === 'yrtRegion')
			?.data.find((e) => e.value === region)
			?.type?.toLowerCase();
		if (t === 'settled' || t === 'boundary' || t === 'remote') return t;
		// Base Ironsworn regions map by name; unknown → boundary.
		const r = region.toLowerCase();
		if (r.includes('haven')) return 'settled';
		if (/barrier islands|flooded lands|hinterlands|ragged coast/.test(r)) return 'boundary';
		if (/deep wilds|tempest hills|veiled mountains/.test(r)) return 'remote';
		return 'boundary';
	}

	/** Roll one Lodestar settlement field, resolving the right oracle: Type is a
	 *  land-tier columnSelect (tier from region); Condition uses YRT's superseding
	 *  oracle when YRT is on; the rest are plain single rolls. */
	function rollSettlementFieldValue(
		key: LodestarSettlementFieldKey,
		region: string,
		oracles: ReturnType<typeof getOracles>,
	): string {
		if (key === 'type')
			// settlementType values carry <strong>…</strong> markup for the picker;
			// strip tags so the plain-text field shows "Outpost — Border or…".
			// resolveOracleKey picks up YRT's supersession (yrtSettlementType) when
			// YRT is on, else falls through to Lodestar's settlementType.
			return (
				rollOracle(resolveOracleKey('settlementType'), oracles, {
					stat: tierForRegion(region, oracles),
				}).value ?? ''
			).replace(/<[^>]+>/g, '');
		if (key === 'condition')
			return rollOracle(resolveOracleKey('settlementCondition'), oracles).value ?? '';
		const oracleKey: Record<Exclude<LodestarSettlementFieldKey, 'type' | 'condition'>, string> = {
			firstLook: 'settlementFirstLook',
			disposition: 'settlementDisposition',
			projects: 'settlementProjects',
			culturalTouchstones: 'settlementCulturalTouchstones',
		};
		return rollOracle(oracleKey[key], oracles).value ?? '';
	}

	/** Log the oracle rolls made while creating a connection — one combined
	 *  entry per Create (name-dice clicks log on their own). `rolled` is
	 *  [label, value] pairs; empty values are skipped. */
	function logCreateRolls(title: string, rolled: Array<[string, string]>) {
		const body = rolled
			.filter(([, v]) => v)
			.map(([l, v]) => `<div class="roll-line">${l}: <strong>${v}</strong></div>`)
			.join('');
		if (body) appendLog(title, body);
	}

	// Persist the store that was being edited. Reads (+ clears) _savingKind,
	// exactly as the inline timer did — shared by the debounced schedule and
	// every flush() site.
	function persistSavingKind() {
		const k = _savingKind;
		_savingKind = null;
		const p =
			k === 'npc' ? persistNpcsNow() : k === 'place' ? persistPlacesNow() : persistCommunitiesNow();
		p.catch((err) => console.error('[v2] save failed', err));
	}

	$effect(() => {
		if (!activeEntry) return;
		const kind = activeEntry.kind;
		$state.snapshot(activeEntry.data);
		// If the pending save targets a different store, flush it first so
		// we don't lose a Community edit by overwriting the timer with an NPC edit.
		if (_save.isPending() && _savingKind && _savingKind !== kind) _save.flush();
		_savingKind = kind;
		_save.schedule(persistSavingKind);
		return () => _save.flush();
	});

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
			name: 'New Settlement',
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

	/** Roll a settlement name off the selected name oracle and drop it into the
	 *  New Community draft — wired to the name d6. Both oracles double-roll;
	 *  rollOracle returns the finished composed string. */
	function rollNewCommunityName() {
		const r = rollOracle(newCommunityNameOracle, getOracles());
		if (typeof r.value === 'string' && r.value) {
			newCommunityName = r.value;
			appendLog(r.title, r.html);
		}
	}

	async function _commitCommunity() {
		if (!_pendingCommunity) return;
		const c = _pendingCommunity;
		_pendingCommunity = null;
		const oracles = getOracles();
		const rolled: Array<[string, string]> = [];
		// Region: the base Region oracle, or YRT's replacement when YRT is on.
		if (newCommunityRollRegion) {
			c.region = rollOracle(resolveOracleKey('region'), oracles).value ?? '';
			rolled.push(['Region', c.region]);
		}
		// Location + Descriptor are a Core-only settlement detail — Lodestar
		// supersedes them with its settlement suite, so skip both when it's on.
		if (newCommunityRollLocation && !lodestarOn) {
			c.location = rollOracle(_pendingCommunityLocationType, oracles).value ?? '';
			rolled.push(['Location', c.location]);
		}
		if (newCommunityRollDescription && !lodestarOn) {
			c.locationDescription = rollOracle('locationDescriptor', oracles).value ?? '';
			rolled.push(['Descriptor', c.locationDescription]);
		}
		if (newCommunityRollTrouble) {
			c.trouble = rollOracle('settlementTrouble', oracles).value ?? '';
			rolled.push(['Trouble', c.trouble]);
		}
		// Lodestar settlement suite — roll each checked field (Type derives its
		// land tier from the just-rolled region).
		if (lodestarOn)
			for (const f of LODESTAR_SETTLEMENT_FIELDS)
				if (newCommunityRollLodestar[f.key]) {
					c[f.key] = rollSettlementFieldValue(f.key, c.region, oracles);
					rolled.push([f.label, (c[f.key] as string) ?? '']);
				}
		if (newCommunityName.trim()) c.name = newCommunityName.trim();
		logCreateRolls(`New Settlement — ${c.name}`, rolled);
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
		newNpcRollTouched = false; // opt-in; the others stay checked from last open
		await loadOracles();
		newNpcDialogRef?.open();
	}

	/** Roll a name off the selected oracle and drop it into the form. Picker
	 *  entries are `oracleKey` or, for `matrix` name oracles (Name: Elf,
	 *  Name: Other), `oracleKey_columnKey` — the suffix picks the column
	 *  (elf1/elf2, giants/varou/trolls). rollOracle resolves both shapes. */
	function rollNpcNameField() {
		const usc = _pendingNpcNameOracle.indexOf('_');
		const key = usc >= 0 ? _pendingNpcNameOracle.slice(0, usc) : _pendingNpcNameOracle;
		const col = usc >= 0 ? _pendingNpcNameOracle.slice(usc + 1) : undefined;
		const r = rollOracle(key, getOracles(), col ? { stat: col } : undefined);
		newNpcName = r.value ?? '';
		if (r.value)
			appendLog(
				r.title,
				`<div class="roll-line">Roll: d100 → ${r.roll}</div><div>Result: <strong>${r.value}</strong></div>`,
			);
	}

	/** Run the compound YRT Touched roll and return the pieces the
	 *  formatter cares about: class, animal aspect (if any), and the
	 *  rolled features list (empty for Pure and Feral). Mirrors the
	 *  bespoke branching in `rollOracle('yrtTouched', …)` — we don't
	 *  reuse that call directly because it only exposes a pre-rendered
	 *  html blob; we want structured data to build our own template. */
	type TouchedRoll = {
		className: 'Pure' | 'Prime' | 'Second' | 'Third' | 'Feral';
		classRoll: number;
		animal: string;
		animalRoll: number;
		/** '1–3' / '4–6' when the feature count was rolled; '' when fixed/none. */
		countRange: string;
		features: Array<{ value: string; roll: number }>;
	};
	function rollYrtTouchedStructured(): TouchedRoll | null {
		const touched = findOracle('yrtTouched');
		if (!touched) return null;
		const clsRes = rollFromRangeTable(touched.data);
		const cls = clsRes.value as {
			className: TouchedRoll['className'];
			featureCount: number | { min: number; max: number } | null;
		};
		const r: TouchedRoll = {
			className: cls.className,
			classRoll: clsRes.roll,
			animal: '',
			animalRoll: 0,
			countRange: '',
			features: [],
		};
		if (cls.featureCount === 0) return r; // Pure — no animal, no features
		const animalOracle = findOracle('yrtAnimal');
		const aRes = animalOracle ? rollFromRangeTable(animalOracle.data) : { roll: 0, value: '' };
		r.animal = (aRes.value as string) ?? '';
		r.animalRoll = aRes.roll;
		if (cls.featureCount === null) return r; // Feral — animal, narrative features
		let count: number;
		if (typeof cls.featureCount === 'number') {
			count = cls.featureCount; // Prime — exactly 1
		} else {
			const { min } = cls.featureCount;
			// Second / Third: d6 % 3 + min → 1..3 or 4..6.
			count = (Math.floor(Math.random() * 6) % 3) + min;
			r.countRange = min === 1 ? '1–3' : '4–6';
		}
		const featOracle = findOracle('touchedFeatures');
		const seen = new Set<string>();
		let safety = 0;
		if (featOracle) {
			while (r.features.length < count && safety++ < 1000) {
				const fr = rollFromRangeTable(featOracle.data);
				const v = fr.value as string;
				if (!seen.has(v)) {
					seen.add(v);
					r.features.push({ value: v, roll: fr.roll });
				}
			}
		}
		return r;
	}

	/** Render the Touched roll into the concise markdown template we
	 *  prepend to the NPC's notes:
	 *    <name> is **<class> with <count>** features of a/an <animal>.
	 *    - feature 1
	 *    - feature 2
	 *  Pure has no animal (and no bullets). Feral drops the bullets for
	 *  a narrative placeholder. */
	function formatTouchedMd(name: string, r: TouchedRoll): string {
		const who = name.trim() || 'This NPC';
		if (r.className === 'Pure') {
			return `${who} is **Pure with no touched features**.`;
		}
		const article = /^[aeiouAEIOU]/.test(r.animal) ? 'an' : 'a';
		if (r.className === 'Feral') {
			return (
				`${who} is **Feral with many** features of ${article} ${r.animal}.\n\n` +
				`- _Enter narrative concerning this NPC here._`
			);
		}
		const n = r.features.length;
		const noun = n === 1 ? 'feature' : 'features';
		const bullets = r.features.map((f) => `- ${f.value}`).join('\n');
		return (
			`${who} is **${r.className} with ${n}** ${noun} of ${article} ${r.animal}.\n\n` + bullets
		);
	}

	/** Monstrosity-style log breakdown of a Touched roll: class + animal aspect,
	 *  the feature-count roll (Second/Third), then one line per feature. */
	function touchedLogHtml(r: TouchedRoll): string {
		const lines = [
			`<div class="roll-line">Class: <strong>${r.className}</strong> (d100 → ${r.classRoll})</div>`,
		];
		if (r.animal)
			lines.push(
				`<div class="roll-line">Animal aspect: <strong>${r.animal}</strong> (d100 → ${r.animalRoll})</div>`,
			);
		if (r.className === 'Feral') {
			lines.push(
				`<div class="roll-line"><em>Features are all-encompassing — determine narratively.</em></div>`,
			);
		} else if (r.features.length) {
			if (r.countRange)
				lines.push(
					`<div class="roll-line">Features: (${r.countRange} → ${r.features.length})</div>`,
				);
			for (const f of r.features)
				lines.push(`<div class="roll-line">— <strong>${f.value}</strong> (d100 → ${f.roll})</div>`);
		}
		return lines.join('');
	}

	async function _commitNpc() {
		if (!_pendingNpc) return;
		const n = _pendingNpc;
		_pendingNpc = null;
		if (newNpcName.trim()) n.name = newNpcName.trim();
		const oracles = getOracles();
		const rolled: Array<[string, string]> = [];
		// Concept-resolved rolls: each block runs only when the user asked for
		// it AND the concept has a currently-visible backing oracle. First Look,
		// Activity, and Disposition can be silently absent depending on which
		// extensions the user has enabled (see resolveCharacterOracle jsdoc).
		const firstLookOracle = resolveCharacterOracle('firstLook');
		if (newNpcRollFirstLook && firstLookOracle) {
			n.firstLook = rollOracle(firstLookOracle.key, oracles).value ?? '';
			rolled.push(['First Look', n.firstLook]);
		}
		const activityOracle = resolveCharacterOracle('activity');
		if (newNpcRollActivity && activityOracle) {
			n.activity = rollOracle(activityOracle.key, oracles).value ?? '';
			rolled.push(['Activity', n.activity]);
		}
		const dispositionOracle = resolveCharacterOracle('disposition');
		if (newNpcRollDisposition && dispositionOracle) {
			n.disposition = rollOracle(dispositionOracle.key, oracles).value ?? '';
			rolled.push(['Disposition', n.disposition]);
		}
		if (newNpcRollRole) {
			n.role = rollOracle('characterRole', oracles).value ?? '';
			rolled.push(['Role', n.role]);
		}
		if (newNpcRollGoal) {
			n.goal = rollOracle('characterGoal', oracles).value ?? '';
			rolled.push(['Goal', n.goal]);
		}
		if (newNpcRollDescriptor) {
			n.descriptor = rollOracle('characterDescriptor', oracles).value ?? '';
			rolled.push(['Descriptor', n.descriptor]);
		}
		logCreateRolls(`New NPC — ${n.name}`, rolled);
		if (newNpcRollTouched && isSourceEnabled('yrt')) {
			const r = rollYrtTouchedStructured();
			if (r) {
				n.notes = formatTouchedMd(n.name, r) + (n.notes ? `\n\n${n.notes}` : '');
				appendLog(findOracle('yrtTouched')?.title ?? 'Touched', touchedLogHtml(r));
			}
		}
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
		_pendingPlaceWithin = '';
		_pendingPlaceLandmarkKind = 'inland';
		await loadOracles();
		newPlaceDialogRef?.open();
	}

	/** Places don't have their own name oracle yet — reuse the settlement
	 *  ones so the d6 gives something reasonable. */
	function rollNewPlaceName() {
		const oracles = getOracles();
		const oracle = Math.random() < 0.5 ? 'settlementName' : 'settlementNameQuick';
		const r = rollOracle(oracle, oracles);
		if (r.value) {
			newPlaceName = r.value;
			appendLog(r.title, r.html);
		}
	}

	/** Resolve the Landmark oracle for a Place. The in-settlement and freestanding
	 *  cases are DIFFERENT oracles, not one superseded key:
	 *   • nested (inside a settlement) → YRT's Settlement Landmark, a *standalone*
	 *     oracle that complements — does not supersede — base `location`; falls
	 *     back to base "Location" when YRT is off.
	 *   • freestanding overland → base `location`, which Lodestar supersedes with
	 *     its Overland Landmark (via resolveOracleKey).
	 *   • coastal → base `coastalWatersLocation`, superseded by Lodestar.
	 *  Because Settlement Landmark is separate, the two never collide and the
	 *  result is independent of extension order. */
	function placeLandmarkKey(nested: boolean): string {
		if (nested) return isSourceEnabled('yrt') ? 'yrtCityTownLocation' : 'location';
		if (_pendingPlaceLandmarkKind === 'coastal') return resolveOracleKey('coastalWatersLocation');
		return resolveOracleKey('location');
	}

	async function _commitPlace() {
		if (!_pendingPlace) return;
		const pl = _pendingPlace;
		_pendingPlace = null;
		const oracles = getOracles();
		const parent = _pendingPlaceWithin
			? communities.find((c) => c.id === _pendingPlaceWithin)
			: undefined;
		pl.withinSettlementId = _pendingPlaceWithin || undefined;
		const rolled: Array<[string, string]> = [];
		// Region: inherit from the parent settlement when nested, else roll.
		if (parent) {
			pl.region = parent.region;
		} else {
			pl.region = rollOracle(resolveOracleKey('region'), oracles).value ?? '';
			rolled.push(['Region', pl.region]);
		}
		if (newPlaceRollLandmark) {
			pl.location = rollOracle(placeLandmarkKey(!!parent), oracles).value ?? '';
			rolled.push(['Landmark', pl.location]);
		}
		if (newPlaceRollDescription) {
			pl.locationDescription = rollOracle('locationDescriptor', oracles).value ?? '';
			rolled.push(['Descriptor', pl.locationDescription]);
		}
		if (newPlaceName.trim()) pl.name = newPlaceName.trim();
		logCreateRolls(`New Place — ${pl.name}`, rolled);
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
							<div class="cm-kind-chips" role="tablist" aria-label="Filter by connection kind">
								{#each [{ key: 'all', label: 'All', color: undefined }, { key: 'community', label: 'Settlements', color: accentFor('community') }, { key: 'npc', label: 'NPCs', color: accentFor('npc') }, { key: 'place', label: 'Places', color: accentFor('place') }] as chip (chip.key)}
									{@const active = entryKindFilter === chip.key}
									<button
										type="button"
										role="tab"
										aria-selected={active}
										class="cm-kind-chip"
										class:cm-kind-chip--active={active}
										style={chip.color ? `--chip-accent: ${chip.color};` : ''}
										onclick={() => (entryKindFilter = chip.key as 'all' | EntryKind)}
									>
										<span class="cm-kind-chip-label">{chip.label}</span>
										<span class="cm-kind-chip-count"
											>{kindCounts[chip.key as keyof typeof kindCounts]}</span
										>
									</button>
								{/each}
							</div>
							<Command.List class="mp-cmd-list">
								<Command.Empty class="mp-cmd-empty">No matching connections.</Command.Empty>
								{#each visibleEntries as entry (entry.id)}
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
									value="+ New Settlement"
									onSelect={() => {
										entryPickerOpen = false;
										void addNewCommunity();
									}}
								>
									<span class="mp-cmd-check" aria-hidden="true"></span>
									<span class="mp-cmd-item-name">+ New Settlement…</span>
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
				{#if activeIsMapOwner}
					{#if activeEntryMapEmpty}
						<label
							class="btn btn-icon icon-btn cm-hdr-icon-btn"
							use:tooltip={`Add a map to this ${kindLabelSingular(activeEntry.kind).toLowerCase()}`}
							aria-label="Add map"
						>
							<span class="cm-hdr-icon-plus" aria-hidden="true">+</span>{@html iconMapSvg}
							<input type="file" accept="image/*" hidden onchange={handleAddMapWithFile} />
						</label>
					{:else}
						<button
							class="btn btn-icon icon-btn cm-hdr-icon-btn"
							onclick={openOwnedMap}
							use:tooltip={`Open the map for this ${kindLabelSingular(activeEntry.kind).toLowerCase()}`}
							aria-label="Open map">{@html iconMapSvg}</button
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
				<strong>+ New Settlement…</strong>, <strong>+ New NPC…</strong>, or
				<strong>+ New Place…</strong> from the switcher above to begin.
			</p>
		</div>
	{:else}
		<div class="cm-body">
			{#if activeEntry}
				<div class="deck-stage cm-stage" style="--cm-nature: {activeColor}">
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

					<div class="deck-card cm-card" role="tabpanel">
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
								{#if activeEntry.kind === 'community'}
									{@const s = activeEntry.data}
									{#each LODESTAR_SETTLEMENT_FIELDS as f (f.key)}
										{#if lodestarOn || s[f.key]}
											<div class="cm-field-row">
												<label class="cm-field-label" for="cm-{f.key}-{s.id}">{f.label}</label>
												<input
													id="cm-{f.key}-{s.id}"
													class="cm-input"
													type="text"
													value={s[f.key] ?? ''}
													oninput={(e) =>
														updateCommunityLike({
															[f.key]: (e.target as HTMLInputElement).value,
														} as Partial<Community>)}
													placeholder="{f.label}…"
												/>
											</div>
										{/if}
									{/each}
								{/if}
								{#if activeEntry.kind === 'place' || !lodestarOn || c.location}
									<div class="cm-field-row">
										<label class="cm-field-label" for="cm-location-{c.id}"
											>{activeEntry.kind === 'place' ? 'Landmark' : 'Location'}</label
										>
										<input
											id="cm-location-{c.id}"
											class="cm-input"
											type="text"
											value={c.location}
											oninput={(e) =>
												updateCommunityLike({ location: (e.target as HTMLInputElement).value })}
											placeholder={activeEntry.kind === 'place' ? 'Landmark…' : 'Location…'}
										/>
									</div>
								{/if}
								{#if activeEntry.kind === 'place' || !lodestarOn || c.locationDescription}
									<div class="cm-field-row">
										<label class="cm-field-label" for="cm-locdesc-{c.id}">Descriptor</label>
										<input
											id="cm-locdesc-{c.id}"
											class="cm-input"
											type="text"
											value={c.locationDescription}
											oninput={(e) =>
												updateCommunityLike({
													locationDescription: (e.target as HTMLInputElement).value,
												})}
											placeholder="Location descriptor…"
										/>
									</div>
								{/if}
								{#if activeEntry.kind === 'place'}
									{@const pl = activeEntry.data}
									<div class="cm-field-row">
										<label class="cm-field-label" for="cm-within-{c.id}">Within</label>
										<Select
											id="cm-within-{c.id}"
											class="cm-within-select"
											value={pl.withinSettlementId ?? ''}
											onchange={(v) => setPlaceWithin(v)}
											options={[
												{ value: '', label: 'No settlement' },
												...communities.map((cc) => ({
													value: cc.id,
													label: cc.name || 'Settlement',
												})),
											]}
										/>
										{#if pl.withinSettlementId}
											<button
												class="cm-within-jump"
												type="button"
												onclick={() => (activeEntryId = pl.withinSettlementId ?? null)}
												use:tooltip={'Go to the parent settlement'}
												aria-label="Go to the parent settlement">↗</button
											>
										{/if}
									</div>
								{/if}
								{#if activeEntry.kind === 'community' || c.trouble}
									<div class="cm-field-row cm-field-row--trouble">
										<label class="cm-field-label" for="cm-trouble-{c.id}">Trouble</label>
										<input
											id="cm-trouble-{c.id}"
											class="cm-input"
											type="text"
											value={c.trouble}
											oninput={(e) =>
												updateCommunityLike({ trouble: (e.target as HTMLInputElement).value })}
											placeholder={activeEntry.kind === 'place'
												? 'Trouble…'
												: 'Settlement trouble…'}
										/>
										{#if activeEntry.kind === 'community'}
											<!-- Settlement Trouble oracle is community-only; places don't
										     have their own trouble oracle yet, so the dice button
										     is hidden for them. -->
											<button
												class="dice-btn"
												type="button"
												onclick={rollSettlementTrouble}
												disabled={rolling}
												use:tooltip={'Roll settlement trouble oracle'}
												aria-label="Roll settlement trouble oracle">{@html diceD6Svg}</button
											>
										{/if}
									</div>
								{/if}
								{#if activeEntry.kind === 'community'}
									{@const s = activeEntry.data}
									{@const here = places.filter((p) => p.withinSettlementId === s.id)}
									{#if here.length > 0}
										<div class="cm-field-row cm-field-row--places">
											<span class="cm-field-label">Places</span>
											<div class="cm-mapref-chips">
												{#each here as p (p.id)}
													<button
														class="cm-mapref-chip"
														type="button"
														onclick={() => (activeEntryId = p.id)}
														use:tooltip={'Go to this place'}
														><span class="cm-mapref-name">{p.name || 'Untitled place'}</span
														></button
													>
												{/each}
											</div>
										</div>
									{/if}
								{/if}
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
							{:else}
								{@const n = activeEntry.data}
								<!-- Status toggle — Alive / Deceased. Lives at the top of
							     the NPC Core tab so the header can stay lean; mirrors
							     the initiative line at the top of the Characters card. -->
								<div class="cm-status-section">
									<span class="cm-status-label">Status</span>
									<SegmentedRadio
										ariaLabel="NPC status"
										labels="always"
										value={(n as Npc).deceased ? 'deceased' : 'alive'}
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
								</div>
								{#if n.firstLook || resolveCharacterOracle('firstLook')}
									<div class="cm-field-row">
										<label class="cm-field-label" for="cm-first-look-{n.id}">First Look</label>
										<input
											id="cm-first-look-{n.id}"
											class="cm-input"
											type="text"
											value={n.firstLook ?? ''}
											oninput={(e) =>
												updateNpc({ firstLook: (e.target as HTMLInputElement).value })}
											placeholder="First look — well-armed, cloaked, weathered…"
										/>
									</div>
								{/if}
								{#if n.activity || resolveCharacterOracle('activity')}
									<div class="cm-field-row">
										<label class="cm-field-label" for="cm-activity-{n.id}">Activity</label>
										<input
											id="cm-activity-{n.id}"
											class="cm-input"
											type="text"
											value={n.activity ?? ''}
											oninput={(e) => updateNpc({ activity: (e.target as HTMLInputElement).value })}
											placeholder="Activity — patrolling, mending, resting…"
										/>
									</div>
								{/if}
								{#if n.disposition || resolveCharacterOracle('disposition')}
									<div class="cm-field-row">
										<label class="cm-field-label" for="cm-disposition-{n.id}">Disposition</label>
										<input
											id="cm-disposition-{n.id}"
											class="cm-input"
											type="text"
											value={n.disposition ?? ''}
											oninput={(e) =>
												updateNpc({ disposition: (e.target as HTMLInputElement).value })}
											placeholder="Disposition — helpful, wary, hostile…"
										/>
									</div>
								{/if}
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
									<label class="cm-field-label" for="cm-desc-{n.id}">Revealed Details</label>
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
											if (activeEntry?.kind === 'community')
												updateCommunity({ portraitEtag: etag });
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

<!-- New Community dialog — name + region-oracle + location-oracle, then
     "Also randomize" checkboxes for Location / Description / Trouble.
     Region always rolls from the picked oracle on Create; the other
     three roll only when checked. Create needs a name. -->
<ConfirmDialog
	bind:this={newCommunityDialogRef}
	title="New Settlement"
	draggable
	confirmLabel="Create"
	confirmClass="btn-primary"
	confirmDisabled={!newCommunityName.trim()}
	cancelLabel="Cancel"
	accentColor={COMMUNITY_COLOR}
	onconfirm={_commitCommunity}
	ondismiss={() => {
		_pendingCommunity = null;
	}}
>
	<label class="co-field">
		<span class="co-field-label">Settlement name</span>
		<input
			id="nc-name"
			class="co-input"
			type="text"
			bind:value={newCommunityName}
			placeholder="Settlement name"
		/>
	</label>
	<div class="co-field">
		<span class="co-field-label">Use a name oracle to roll a random name</span>
		<div class="co-name-row">
			<Select bind:value={newCommunityNameOracle} options={SETTLEMENT_NAME_ORACLES} />
			<button
				class="dice-btn"
				type="button"
				onclick={rollNewCommunityName}
				use:tooltip={'Roll a name'}
				aria-label="Random name">{@html diceD6Svg}</button
			>
		</div>
	</div>

	{#if !lodestarOn}
		<div class="ns-grid">
			<label class="ns-label" for="nc-loc">Location Oracle</label>
			<Select
				id="nc-loc"
				class="ea-ns-select"
				bind:value={_pendingCommunityLocationType}
				options={[
					{ value: 'location', label: 'Inland' },
					{ value: 'coastalWatersLocation', label: 'Coastal Waters' },
				]}
			/>
			<span class="ns-spacer" aria-hidden="true"></span>
		</div>
	{/if}

	<div class="nn-randomize">
		<span class="nn-randomize-label">Also randomize</span>
		<Checkbox
			class="nn-check"
			checked={newCommunityRollRegion}
			onCheckedChange={(v) => (newCommunityRollRegion = !!v)}
		>
			<span class="nn-check-label">Region</span>
		</Checkbox>
		{#if !lodestarOn}
			<Checkbox
				class="nn-check"
				checked={newCommunityRollLocation}
				onCheckedChange={(v) => (newCommunityRollLocation = !!v)}
			>
				<span class="nn-check-label">Location</span>
			</Checkbox>
			<Checkbox
				class="nn-check"
				checked={newCommunityRollDescription}
				onCheckedChange={(v) => (newCommunityRollDescription = !!v)}
			>
				<span class="nn-check-label">Descriptor</span>
			</Checkbox>
		{/if}
		{#if lodestarOn}
			{#each LODESTAR_SETTLEMENT_FIELDS as f (f.key)}
				<Checkbox
					class="nn-check"
					checked={newCommunityRollLodestar[f.key]}
					onCheckedChange={(v) => (newCommunityRollLodestar[f.key] = !!v)}
				>
					<span class="nn-check-label">{f.label}</span>
				</Checkbox>
			{/each}
		{/if}
		<Checkbox
			class="nn-check"
			checked={newCommunityRollTrouble}
			onCheckedChange={(v) => (newCommunityRollTrouble = !!v)}
		>
			<span class="nn-check-label">Trouble</span>
		</Checkbox>
	</div>
</ConfirmDialog>

<!-- New NPC dialog — minimal: Name + Oracle picker (with name d6),
     then an "Also randomize" checklist that rolls role / goal /
     descriptor on Create. YRT-only Touched checkbox rolls the compound
     class/aspect/features and prepends the outcome into Notes. -->
<ConfirmDialog
	bind:this={newNpcDialogRef}
	title="New NPC"
	draggable
	confirmLabel="Create"
	confirmClass="btn-primary"
	confirmDisabled={!newNpcName.trim()}
	cancelLabel="Cancel"
	accentColor={NPC_COLOR}
	onconfirm={_commitNpc}
	ondismiss={() => {
		_pendingNpc = null;
	}}
>
	<label class="co-field">
		<span class="co-field-label">Character name</span>
		<input
			id="nn-name"
			class="co-input"
			type="text"
			bind:value={newNpcName}
			placeholder="NPC name"
		/>
	</label>
	<div class="co-field">
		<span class="co-field-label">Use a name oracle to roll a random name</span>
		<div class="co-name-row">
			<Select id="nn-oracle" bind:value={_pendingNpcNameOracle} options={NPC_NAME_ORACLES} />
			<button
				class="dice-btn"
				type="button"
				onclick={rollNpcNameField}
				use:tooltip={'Roll a name'}
				aria-label="Random name">{@html diceD6Svg}</button
			>
		</div>
	</div>

	<div class="nn-randomize">
		<span class="nn-randomize-label">Also randomize</span>
		{#if resolveCharacterOracle('firstLook')}
			<Checkbox
				class="nn-check"
				checked={newNpcRollFirstLook}
				onCheckedChange={(v) => (newNpcRollFirstLook = !!v)}
			>
				<span class="nn-check-label">First Look</span>
			</Checkbox>
		{/if}
		{#if resolveCharacterOracle('activity')}
			<Checkbox
				class="nn-check"
				checked={newNpcRollActivity}
				onCheckedChange={(v) => (newNpcRollActivity = !!v)}
			>
				<span class="nn-check-label">Activity</span>
			</Checkbox>
		{/if}
		{#if resolveCharacterOracle('disposition')}
			<Checkbox
				class="nn-check"
				checked={newNpcRollDisposition}
				onCheckedChange={(v) => (newNpcRollDisposition = !!v)}
			>
				<span class="nn-check-label">Disposition</span>
			</Checkbox>
		{/if}
		<Checkbox
			class="nn-check"
			checked={newNpcRollRole}
			onCheckedChange={(v) => (newNpcRollRole = !!v)}
		>
			<span class="nn-check-label">Role</span>
		</Checkbox>
		<Checkbox
			class="nn-check"
			checked={newNpcRollGoal}
			onCheckedChange={(v) => (newNpcRollGoal = !!v)}
		>
			<span class="nn-check-label">Goal</span>
		</Checkbox>
		<Checkbox
			class="nn-check"
			checked={newNpcRollDescriptor}
			onCheckedChange={(v) => (newNpcRollDescriptor = !!v)}
		>
			<span class="nn-check-label">Revealed Details</span>
		</Checkbox>
		{#if isSourceEnabled('yrt')}
			<Checkbox
				class="nn-check"
				checked={newNpcRollTouched}
				onCheckedChange={(v) => (newNpcRollTouched = !!v)}
			>
				<span class="nn-check-label">Touched</span>
			</Checkbox>
		{/if}
	</div>
</ConfirmDialog>

<!-- New Place dialog — mirrors the New Community pattern. Places don't have
     their own place-specific oracle yet, so random generation reuses the
     settlement oracles. Trouble is intentionally NOT auto-rolled (settlement
     trouble doesn't map to inns, forests, ruins, etc). -->
<ConfirmDialog
	bind:this={newPlaceDialogRef}
	title="New Place"
	draggable
	confirmLabel="Create"
	confirmClass="btn-primary"
	confirmDisabled={!newPlaceName.trim()}
	cancelLabel="Cancel"
	accentColor={PLACE_COLOR}
	onconfirm={_commitPlace}
	ondismiss={() => {
		_pendingPlace = null;
	}}
>
	<div class="np-form">
		<div class="np-field">
			<label class="ns-label" for="np-name">Name</label>
			<div class="np-row">
				<input
					id="np-name"
					class="co-input"
					type="text"
					bind:value={newPlaceName}
					placeholder="Place name"
				/>
				<button
					class="btn btn-icon ea-dice-btn"
					type="button"
					onclick={rollNewPlaceName}
					use:tooltip={'Roll a name'}
					aria-label="Random name">{@html diceD6Svg}</button
				>
			</div>
		</div>

		<div class="np-field">
			<label class="ns-label" for="np-within">Within settlement</label>
			<Select
				id="np-within"
				class="ea-ns-select"
				bind:value={_pendingPlaceWithin}
				options={[
					{ value: '', label: 'No settlement' },
					...communities.map((c) => ({ value: c.id, label: c.name || 'Settlement' })),
				]}
			/>
		</div>

		{#if !_pendingPlaceWithin}
			<div class="np-field">
				<label class="ns-label" for="np-loc">Landmark oracle</label>
				<Select
					id="np-loc"
					class="ea-ns-select"
					bind:value={_pendingPlaceLandmarkKind}
					options={[
						{ value: 'inland', label: 'Overland' },
						{ value: 'coastal', label: 'Coastal Waters' },
					]}
				/>
			</div>
		{/if}
	</div>

	<div class="nn-randomize">
		<span class="nn-randomize-label">Also randomize</span>
		<Checkbox
			class="nn-check"
			checked={newPlaceRollLandmark}
			onCheckedChange={(v) => (newPlaceRollLandmark = !!v)}
		>
			<span class="nn-check-label">Landmark</span>
		</Checkbox>
		<Checkbox
			class="nn-check"
			checked={newPlaceRollDescription}
			onCheckedChange={(v) => (newPlaceRollDescription = !!v)}
		>
			<span class="nn-check-label">Descriptor</span>
		</Checkbox>
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

	/* New Place dialog — labels stacked ABOVE their controls (long labels
	   like "Within settlement" wrapped badly in the shared 56px ns-grid
	   label column). */
	.np-form {
		display: flex;
		flex-direction: column;
		gap: 12px;
		margin: 0 0 4px;
	}
	.np-field {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.np-row {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.np-row :global(.co-input) {
		flex: 1 1 auto;
		width: auto;
		min-width: 0;
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

	/* Places-here strip on a settlement panel + the jump-to-parent glyph on a
	   nested place's Within row — both surface the withinSettlementId link. */
	.cm-field-row--places {
		align-items: flex-start;
	}
	.cm-within-jump {
		flex: 0 0 auto;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 26px;
		height: 26px;
		border: 1px solid var(--border-mid);
		border-radius: 6px;
		background: var(--bg-control);
		color: var(--text-dim);
		font-size: 0.95rem;
		line-height: 1;
		cursor: pointer;
	}
	.cm-within-jump:hover {
		border-color: var(--text-accent);
		color: var(--text-accent);
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
	/* Stage — flex / padding / scroll live on the shared `.deck-stage`
	   in app.css. This rule only adds the entry-type LHS colour band;
	   the inset card surface, gap, and form-row rhythm live on
	   `.deck-card` inside. */
	.cm-stage {
		border-left: 3px solid var(--cm-nature, var(--text-muted));
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
		padding-top: 8px;
		border-top: 1px solid var(--border);
	}
	/* While editing, the situational-notes block grows to fill the rest of the
	   Core panel (it's a direct flex child of .cm-card); the textarea fills it
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
	   Trouble-roll d6 uses the global `.dice-btn` style (app.css) — the
	   preferred d6 button, shared with ExpeditionsArea. */

	/* Prevent the status SegmentedRadio (NPCs) from clipping when the
	   panel header is tight — combobox shrinks instead. */
	.cm-header-actions :global(.sr) {
		flex-shrink: 0;
	}
	/* Header +/plain icon button (map btn) — matches Chars/Exp shape. */
	:global(.cm-hdr-icon-btn) {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		padding: 4px 6px;
		flex-shrink: 0;
	}
	:global(.cm-hdr-icon-btn svg) {
		width: 12px;
		height: 12px;
		fill: currentColor;
		flex-shrink: 0;
	}
	:global(.cm-hdr-icon-btn svg path) {
		fill: currentColor;
	}
	:global(.cm-hdr-icon-plus) {
		font-family: var(--font-ui);
		font-size: 0.85rem;
		font-weight: 700;
		line-height: 1;
		color: currentColor;
	}
	/* NPC status toggle (Alive/Deceased) — lives at the top of the NPC
	   Core tab. Same shape as CharactersArea's initiative row.
	   Communities/Places don't get one since they have no status. */
	.cm-status-section {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding-bottom: 8px;
		border-bottom: 1px solid #c3baa1;
	}
	.cm-status-label {
		font-family: var(--font-ui);
		font-size: 0.7rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--text-dimmer);
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

	/* Kind-filter chip row above the popover list. Compact pills — All /
	   Settlements / NPCs / Places — with a trailing count. Active chip
	   picks up the kind's accent colour as `--chip-accent`. */
	:global(.cm-kind-chips) {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		padding: 6px 8px 4px;
		border-bottom: 1px solid var(--border);
	}
	:global(.cm-kind-chip) {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 3px 8px;
		font: inherit;
		font-size: 0.72rem;
		line-height: 1.2;
		color: var(--text-muted);
		background: var(--bg-inset);
		border: 1px solid var(--border);
		border-radius: 999px;
		cursor: pointer;
		transition:
			background 0.12s,
			border-color 0.12s,
			color 0.12s;
	}
	:global(.cm-kind-chip:hover) {
		color: var(--text);
		background: var(--bg-hover);
	}
	:global(.cm-kind-chip--active) {
		color: var(--text);
		background: color-mix(in srgb, var(--chip-accent, var(--text-accent)) 14%, var(--bg-card));
		border-color: var(--chip-accent, var(--text-accent));
	}
	:global(.cm-kind-chip-count) {
		display: inline-block;
		min-width: 1.4em;
		padding: 0 5px;
		text-align: center;
		font-size: 0.66rem;
		font-variant-numeric: tabular-nums;
		color: var(--text-dimmer);
		background: var(--bg-card);
		border: 1px solid var(--border);
		border-radius: 999px;
	}
	:global(.cm-kind-chip--active .cm-kind-chip-count) {
		color: var(--text);
		border-color: color-mix(in srgb, var(--chip-accent, var(--text-accent)) 40%, var(--border));
	}

	/* "Also randomize" checklist inside the New * dialogs — one column,
	   compact spacing. Shared with the Site + NPC + Community + Place
	   dialogs so all four read the same. */
	:global(.nn-randomize) {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 4px 16px;
		align-items: center;
		margin-top: 10px;
		padding-top: 8px;
		border-top: 1px solid var(--border);
	}
	:global(.nn-randomize-label) {
		grid-column: 1 / -1;
		font-family: var(--font-ui);
		font-size: 0.65rem;
		font-weight: 600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--text-dimmer);
		margin-bottom: 2px;
	}
	:global(.nn-check-label) {
		font-family: var(--font-ui);
		font-size: 0.78rem;
		color: var(--text);
	}
</style>
