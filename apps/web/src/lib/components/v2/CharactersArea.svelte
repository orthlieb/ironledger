<script lang="ts">
	/**
	 * CharactersArea (v2 prototype) — Characters deck stage.
	 *
	 * Layout:
	 *   ┌─────────────────────────────────────────────────────┐
	 *   │ Header: "Characters"                                │
	 *   ├──────┬──────────────────────────────────────────────┤
	 *   │      │  Active card tab strip [Background|Core|Vows]│
	 *   │ Spine│  ┌────────────────────────────────────────┐  │
	 *   │ strip│  │  Active card content                   │  │
	 *   │ ───  │  │                                        │  │
	 *   │ char1│  └────────────────────────────────────────┘  │
	 *   │ char2│  Asset strip ▒▒▒ ▒▒▒ ▒▒▒                   │
	 *   └──────┴──────────────────────────────────────────────┘
	 *
	 * "Active character" is the front-of-deck. Click a spine to bring its deck
	 * to the front. Asset tabs are tucked under the bottom of the active card;
	 * clicking one opens the v1 AssetCard in a dismissible dialog.
	 */
	import { untrack } from 'svelte';
	import {
		getCharacters,
		isCharacterLoading,
		createCharacter,
		deleteCharacter,
		flushCharacterToApi,
		persistCharacterNow,
		setPartySupply,
	} from '$lib/characterStore.svelte.js';
	import { setActiveDiceCtx } from '$lib/diceContext.svelte.js';
	import { getActiveCharacterId, setActiveCharacterId } from '$lib/activeContext.svelte.js';
	import { createDebouncedSave } from '$lib/debouncedSave.js';
	import { tooltip } from '$lib/actions/tooltip.js';
	import {
		findAsset,
		findRaritiesForAsset,
		getGlobalCounterDef,
		isAssetsLoading,
		getAssets,
	} from '$lib/assetStore.svelte.js';
	import { isDelveEnabled } from '$lib/expansionStore.svelte.js';
	import {
		hydrateCharacterInPlace,
		maxMomentum,
		momentumReset,
		computeAssetXpDiff,
		assetDisplayName,
	} from '$lib/character.js';
	import hornedHelmSvg from '$icons/horned-helm.svg?raw';
	import charactersIconSvg from '$icons/Characters.svg?raw';
	import type { CharacterData, CharacterAsset } from '$lib/types.js';
	import AssetCard from '$lib/components/AssetCard.svelte';
	import SegmentedRadio from '$lib/components/SegmentedRadio.svelte';
	import AssetPicker from '$lib/components/AssetPicker.svelte';
	import StatControl from '$lib/components/StatControl.svelte';
	import ResourceTile from '$lib/components/ResourceTile.svelte';
	import MomentumTile from '$lib/components/MomentumTile.svelte';
	import ProgressTrackPanel from '$lib/components/ProgressTrackPanel.svelte';
	import MarkdownNotes from '$lib/components/MarkdownNotes.svelte';
	import PortraitUploader from '$lib/components/PortraitUploader.svelte';
	import { assetIcon } from '$lib/iconRegistry.js';
	import { Dialog, Popover, Command, Tabs } from 'bits-ui';
	import iconCaretDownSvg from '$icons/caret-large-down-solid.svg?raw';
	import searchIconSvg from '$icons/magnifying-glass-solid-full.svg?raw';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import CharacterOptionsDialog from '$lib/components/CharacterOptionsDialog.svelte';
	import VowCard from '$lib/components/VowCard.svelte';
	import DebilitiesSection from '$lib/components/DebilitiesSection.svelte';
	import {
		appendLog,
		getXpSpendNonce,
		drainXpSpend,
		getActionNonce,
		drainActions,
		type LogAction,
	} from '$lib/log.svelte.js';
	import { FLOOR_RULES, DEBILITY_MOMENTUM_TITLE } from '$lib/cascadeRules.js';
	import type { Vow } from '$lib/types.js';
	import iconHealth from '$icons/icon-health.svg?raw';
	import iconSpirit from '$icons/icon-spirit.svg?raw';
	import iconSupply from '$icons/icon-supply.svg?raw';
	import iconStar from '$icons/star-solid-full.svg?raw';
	import iconGearSvg from '$icons/gear-solid-full.svg?raw';
	import swordSvg from '$icons/sword-solid-full.svg?raw';
	import gemSvg from '$icons/gem-solid.svg?raw';
	import linkSvg from '$icons/link-solid-full.svg?raw';
	// Counter icons — same map as v1 AssetCard.COUNTER_ICONS. The asset
	// definition's customField.icon string keys into this map.
	import iconHeart from '$icons/icon-heart.svg?raw';
	import iconSkull from '$icons/skull-crossbones-solid-full.svg?raw';
	import iconShield from '$icons/shield-halved-solid.svg?raw';
	import iconEye from '$icons/eye-solid.svg?raw';
	import iconMoon from '$icons/moon-solid.svg?raw';
	import iconSun from '$icons/sun-solid.svg?raw';
	import iconDice from '$icons/dice-d10-light.svg?raw';
	import iconNote from '$icons/note-sticky-solid.svg?raw';
	import iconSackDollar from '$icons/sack-dollar-solid-full.svg?raw';
	import iconMana from '$icons/icon-mana.svg?raw';
	import iconPuppet from '$icons/puppet-solid.svg?raw';
	import iconGolem from '$icons/rock-golem.svg?raw';
	import { headingText } from '$lib/fontStore.svelte.js';

	let { showTitle = true }: { showTitle?: boolean } = $props();

	const COUNTER_ICONS: Record<string, string> = {
		heart: iconHeart,
		'skull-and-crossbones': iconSkull,
		sword: swordSvg,
		shield: iconShield,
		eye: iconEye,
		moon: iconMoon,
		sun: iconSun,
		dice: iconDice,
		note: iconNote,
		'sack-dollar': iconSackDollar,
		mana: iconMana,
		puppet: iconPuppet,
		'rock-golem': iconGolem,
	};
	import shieldSvg from '$icons/shield-halved-solid.svg?raw';

	type CardKey = 'background' | 'core' | 'vows' | 'assets' | 'status';
	const CARD_LABELS: { key: CardKey; label: string }[] = [
		{ key: 'core', label: 'Core' },
		{ key: 'background', label: 'Background' },
		{ key: 'vows', label: 'Vows' },
		{ key: 'assets', label: 'Assets' },
		{ key: 'status', label: 'Status' },
	];

	/** Category colour for asset tabs — mirrors AssetCard's CAT_COLOR. */
	const CAT_COLOR: Record<string, string> = {
		'Combat Talent': 'var(--color-iron)',
		Path: 'var(--color-edge)',
		Companion: 'var(--color-heart)',
		Ritual: 'var(--color-mana)',
		Touched: 'var(--color-touched)',
	};

	let activeCharId = $state<string | null>(null);
	let activeCard = $state<CardKey>('core');
	let dialogOpen = $state(false);
	let dialogEl = $state<HTMLElement | null>(null);
	let pickerOpen = $state(false);

	// Asset dialog (add + edit modes). Edits accumulate in a local draft so
	// Cancel/X never mutate the live character. On OK / Add the parent
	// computes the XP diff vs the snapshot, logs once, and persists.
	let dialogMode = $state<'add' | 'edit'>('edit');
	let dialogDraft = $state<CharacterAsset | null>(null);
	let dialogGlobals = $state<Record<string, string>>({});
	let dialogSnapshotAbilities = $state<boolean[]>([]);
	let dialogSnapshotRarityId = $state<string | undefined>(undefined);
	let dialogPurchaseCost = $state(0);

	// Background card edit state
	let editingBackground = $state(false);
	// Status-tab note edit state (so each can expand to fill while editing)
	let editingBondsFormed = $state(false);
	let editingLessonsLearned = $state(false);
	const characters = $derived(getCharacters());
	const loading = $derived(isCharacterLoading() || isAssetsLoading());

	// Auto-select the first character once data has loaded.
	$effect(() => {
		if (!activeCharId && characters.length > 0) {
			activeCharId = characters[0].id;
		}
	});

	// Two-way sync with the module-level active-character id in activeContext
	// so external code (the /home command bar, deep links, …) can request a
	// character switch by id.
	//
	// The tricky bit: each half must only track ONE side. If Effect A tracked
	// both `activeCharId` and `getActiveCharacterId()`, then an external
	// setActiveCharacterId(newId) would re-fire Effect A, see activeCharId
	// (still the old local value) !== newId, and write the STALE local id back
	// — undoing the external change. `untrack` on the comparison read fixes it.
	$effect(() => {
		// Direction A: our local selection publishes out. Deps: activeCharId only.
		if (activeCharId && activeCharId !== untrack(() => getActiveCharacterId())) {
			setActiveCharacterId(activeCharId);
		}
	});
	$effect(() => {
		// Direction B: an external write pulls our local selection to match.
		// Deps: getActiveCharacterId() only (via read). `characters` is also
		// tracked so a store hydration after the external write catches up.
		const wanted = getActiveCharacterId();
		if (
			wanted &&
			wanted !== untrack(() => activeCharId) &&
			characters.some((c) => c.id === wanted)
		) {
			activeCharId = wanted;
		}
	});

	const activeChar = $derived(characters.find((c) => c.id === activeCharId));

	/** Displayable name for a spine — prefer live `data.name` (renames are
	 *  reactive) with the row's stored `name` as a fallback. */
	function charDisplayName(c: (typeof characters)[number]): string {
		const dn = (c.data as Record<string, unknown> | undefined)?.name as string | undefined;
		return (dn && dn.trim()) || c.name || 'Unnamed';
	}

	/** Popover list ordered A→Z. Sort at render-time; Command doesn't sort. */
	const sortedCharacters = $derived(
		characters.slice().sort((a, b) => charDisplayName(a).localeCompare(charDisplayName(b))),
	);

	/** Combobox open state — bound so item handlers can close the popover
	 *  before dispatching (mirror of Foes area). */
	let charPickerOpen = $state(false);

	// Hydrate the active character's data IN PLACE the first time it becomes
	// active — patches missing keys onto the existing $state proxy so
	// `bind:value` writes still hit the store. Replacing the data object
	// here (as the old code did) would clone away the proxy and break
	// reactivity for everything bound through it.
	let _hydratedIds = new Set<string>();
	$effect(() => {
		const ac = activeChar;
		if (!ac) return;
		if (!_hydratedIds.has(ac.id)) {
			untrack(() => {
				hydrateCharacterInPlace(ac.data as Record<string, unknown>);
				_hydratedIds.add(ac.id);
			});
		}
	});

	// Bindable view of the active character's data. Reads through the store
	// proxy so mutations from anywhere — UI binds, bus drains, log-link
	// clicks — all hit the single source of truth.
	const activeData = $derived(activeChar?.data as CharacterData | undefined);

	// Auto-save — watch the live data deeply; debounce a 1.5 s write to the
	// API. The store is already up to date because every mutation went
	// through the proxy directly.
	const _save = createDebouncedSave();
	$effect(() => {
		const ac = activeChar;
		if (!ac) return;
		// Subscribe to deep data changes via snapshot.
		$state.snapshot(ac.data);

		// Capture the id so a char switch before the timer fires still writes
		// the character that was being edited; flush() on switch/unmount
		// commits it so edits aren't dropped.
		const charId = ac.id;
		_save.schedule(() => flushCharacterToApi(charId));
		return () => _save.flush();
	});

	// Publish the active character to the global dice context so the layout's
	// MovesDialog / DiceRollerDialog read live data from this area's selection.
	$effect(() => {
		if (activeChar && activeData) {
			setActiveDiceCtx({
				charId: activeChar.id,
				charName: activeData.name || 'Unnamed',
				data: activeData,
			});
		} else {
			setActiveDiceCtx(null);
		}
	});

	// Find the first `counter` custom field on the asset (e.g. Mana for
	// Compulsion, Health for a companion) and return its short label plus
	// the current value resolved against the effective max — accounting for
	// per-ability-level maxValue arrays. Returns null when the asset has no
	// counter so the card just shows its category.
	function assetCounter(
		asset: CharacterAsset,
		globalValues?: Record<string, string>,
	): { iconSvg: string; label: string; value: number; max: number } | null {
		const def = findAsset(asset.assetId);
		const field = (def?.customFields ?? []).find((f) => f.type === 'counter');
		if (!def || !field) return null;
		// For global counters use the canonical catalogue-wide definition so
		// cap/default/icon are consistent across every surface that renders
		// the same counter id.
		const eff = field.global ? (getGlobalCounterDef(field.id) ?? field) : field;
		if (eff.maxValue === undefined) return null;
		const store = field.global ? globalValues : asset.customValues;
		const raw = store?.[field.id];
		const dflt = typeof eff.default === 'number' ? eff.default : 0;
		const value = raw != null && raw !== '' ? Number(raw) : dflt;
		let max: number;
		if (typeof eff.maxValue === 'number') {
			max = eff.maxValue;
		} else {
			let lastEnabled = 0;
			for (let i = 0; i < asset.abilities.length; i++) if (asset.abilities[i]) lastEnabled = i;
			const arr = eff.maxValue as number[];
			max = arr[Math.min(lastEnabled, arr.length - 1)] ?? 0;
		}
		const iconSvg = (eff.icon && COUNTER_ICONS[eff.icon]) || iconHeart;
		return { iconSvg, label: eff.label ?? field.label, value, max };
	}

	/** Apply a counter delta directly to the live character. Used by the chit
	 *  ± buttons in the assets tab (asset counters never cost XP, so the
	 *  snapshot/diff machinery doesn't apply here — these mutations are
	 *  immediate). Routes to globalValues for global:true fields, otherwise
	 *  to the asset's customValues. */
	function bumpAssetCounter(asset: CharacterAsset, delta: number) {
		if (!activeData) return;
		const def = findAsset(asset.assetId);
		const field = (def?.customFields ?? []).find((f) => f.type === 'counter');
		if (!def || !field) return;
		const cur = assetCounter(asset, activeData.globalValues);
		if (!cur) return;
		const next = Math.max(0, Math.min(cur.max, cur.value + delta));
		if (next === cur.value) return;
		if (field.global) {
			activeData.globalValues = { ...(activeData.globalValues ?? {}), [field.id]: String(next) };
		} else {
			const arr = (activeData.assets ?? []) as CharacterAsset[];
			activeData.assets = arr.map((a) =>
				a.assetId === asset.assetId
					? { ...a, customValues: { ...(a.customValues ?? {}), [field.id]: String(next) } }
					: a,
			);
		}
	}

	function selectChar(id: string) {
		activeCharId = id;
		activeCard = 'core';
		closeAssetDialog();
	}

	// Write a session-log entry whenever a debility toggles. Mirrors V1
	// CharacterSheet's logDebility — uses the character's current name so
	// the log entry attributes the change to the right character.
	// Also clamps current momentum to the new cap (each debility reduces
	// max momentum by 1, so an active debility can push current momentum
	// above the new cap).
	function logDebility(data: CharacterData, label: string, active: boolean) {
		const name = data.name || 'Unnamed';
		appendLog(
			`${name} — Debilities`,
			`<div>${label}: <strong>${active ? 'Activated' : 'Cleared'}</strong></div>`,
		);
		const cap = maxMomentum(data);
		if (data.momentum > cap) data.momentum = cap;
	}

	function charTitle(name: string): string {
		return `${activeData?.name || 'Unnamed'} — ${name}`;
	}

	// ── Apply functions invoked by the action bus ─────────────────────────
	// All mutations target `activeData` (the v2 writable copy synced from
	// the store on character switch). Mirrors v1 CharacterSheet.applyResourceChange.
	function applyResourceChange(key: string, delta: number) {
		if (!activeData) return;
		const data = activeData;
		// Global counters (e.g. mana) live in data.globalValues as numeric strings.
		if (key === 'mana') {
			const gv = data.globalValues ?? {};
			const old = parseInt(gv['mana'] ?? '0');
			const next = Math.max(0, Math.min(10, old + delta));
			if (next !== old) {
				data.globalValues = { ...gv, mana: String(next) };
				appendLog(
					charTitle('Mana'),
					`<div>Mana: ${old} → <strong>${next}</strong> (${delta > 0 ? '+' : ''}${delta})</div>`,
				);
			}
			return;
		}
		const rec = data as unknown as Record<string, number>;
		const old = rec[key] ?? 0;
		let next: number;
		switch (key) {
			case 'momentum':
				next = Math.max(-6, Math.min(maxMomentum(data), old + delta));
				break;
			case 'health':
			case 'spirit':
			case 'supply':
			case 'xp':
				next = Math.max(0, Math.min(999, old + delta));
				break;
			case 'bonds':
			case 'failures':
				next = Math.max(0, Math.min(40, old + delta));
				break;
			default:
				return;
		}
		if (next !== old) {
			rec[key] = next;
			const label = key.charAt(0).toUpperCase() + key.slice(1);
			appendLog(
				charTitle(label),
				`<div>${label}: ${old} → <strong>${next}</strong> (${delta > 0 ? '+' : ''}${delta})</div>`,
			);
			// Supply is party-wide — broadcast to every character.
			if (key === 'supply') setPartySupply(next);
			// Floor cascade — resource just landed at its minimum this change.
			if (delta < 0) {
				const charId = activeCharId ?? '';
				const floorRule = FLOOR_RULES.find((r) => r.resource === key && next === r.floor);
				if (floorRule) {
					const entryId = crypto.randomUUID();
					appendLog(floorRule.logTitle, floorRule.logHtml({ charId, entryId }), entryId);
				}
			}
		}
	}

	function applyDebilityToggle(key: string, value: number) {
		if (!activeData) return;
		const data = activeData;
		const rec = data as unknown as Record<string, boolean>;
		if (rec[key] === undefined) return;
		const active = value === 1;
		if (rec[key] !== active) {
			rec[key] = active;
			const label = key.charAt(0).toUpperCase() + key.slice(1);
			appendLog(
				charTitle('Debilities'),
				`<div>${label}: <strong>${active ? 'Marked' : 'Cleared'}</strong></div>`,
			);
			// Cascade — marking a debility lowers the momentum cap.
			if (active) {
				const newMax = maxMomentum(data);
				const resetVal = momentumReset(data);
				if (data.momentum > newMax) {
					const cappedFrom = data.momentum;
					const delta = newMax - cappedFrom;
					const entryId = crypto.randomUUID();
					const charId = activeCharId ?? '';
					const html =
						`<p>Max momentum reduced to <strong>${newMax}</strong>. ` +
						`<a class="resource-link" data-resource="momentum" data-value="${delta}" ` +
						`data-entry-id="${entryId}" data-char-id="${charId}">` +
						`Reduce momentum to ${newMax}</a> ` +
						`(currently ${cappedFrom}). Reset value is now <strong>${resetVal}</strong>.</p>`;
					appendLog(DEBILITY_MOMENTUM_TITLE, html, entryId);
				}
			}
		}
	}

	function applyResetTrack(key: string) {
		if (!activeData) return;
		const rec = activeData as unknown as Record<string, number>;
		const old = rec[key] ?? 0;
		if (old !== 0) {
			rec[key] = 0;
			const label = key.charAt(0).toUpperCase() + key.slice(1);
			appendLog(charTitle(label), `<div>${label} track cleared (${old} ticks → 0)</div>`);
		}
	}

	// Set (not add) a field to an absolute value — used for initiative.
	function applySet(key: string, value: number) {
		if (!activeData) return;
		const rec = activeData as unknown as Record<string, number>;
		const old = rec[key] ?? 0;
		if (old !== value) {
			rec[key] = value;
			const label = key.charAt(0).toUpperCase() + key.slice(1);
			const INITIATIVE_NAMES_ACTIVE: Record<number, string> = {
				0: 'None',
				1: 'Character',
				2: 'Foe',
			};
			const display =
				key === 'initiative'
					? `${INITIATIVE_NAMES_ACTIVE[old] ?? old} → <strong>${INITIATIVE_NAMES_ACTIVE[value] ?? value}</strong>`
					: `${old} → <strong>${value}</strong>`;
			appendLog(charTitle(label), `<div>${label}: ${display}</div>`);
		}
	}

	// Dedicated initiative applier — enforces the 0|1|2 enum at the action-bus
	// edge so a bad value from a caller can't corrupt the field. The log line
	// is the same shape applySet(key='initiative') emits, so switching between
	// the two produces indistinguishable history.
	const INITIATIVE_LABELS: Record<number, string> = { 0: 'None', 1: 'Character', 2: 'Foe' };
	function applyInitiative(value: number) {
		if (!activeData) return;
		if (value !== 0 && value !== 1 && value !== 2) return;
		const rec = activeData as unknown as Record<string, number>;
		const old = rec.initiative ?? 0;
		if (old !== value) {
			rec.initiative = value;
			appendLog(
				charTitle('Initiative'),
				`<div>Initiative: ${INITIATIVE_LABELS[old] ?? old} → <strong>${INITIATIVE_LABELS[value]}</strong></div>`,
			);
		}
	}

	// Apply a LogAction to an arbitrary character's plain data object.
	// Used for non-active characters whose actions can't go through the
	// activeData fast path. Cascades (floor rules, debility momentum cap,
	// supply sync) are intentionally skipped — the primary field mutation
	// and log entry are what matter for historical log-link clicks.
	const _INITIATIVE_NAMES: Record<number, string> = { 0: 'None', 1: 'Character', 2: 'Foe' };
	function applyActionToData(
		data: Record<string, unknown>,
		action: LogAction,
		charName: string,
	): void {
		const title = (label: string) => `${charName || 'Character'} — ${label}`;
		if (action.type === 'resource') {
			const key = action.key;
			const delta = action.value as number;
			if (key === 'mana') {
				const gv = (data.globalValues as Record<string, string>) ?? {};
				const old = parseInt(gv['mana'] ?? '0');
				const next = Math.max(0, Math.min(10, old + delta));
				if (next !== old) {
					data.globalValues = { ...gv, mana: String(next) };
					appendLog(
						title('Mana'),
						`<div>Mana: ${old} → <strong>${next}</strong> (${delta > 0 ? '+' : ''}${delta})</div>`,
					);
				}
				return;
			}
			const rec = data as unknown as Record<string, number>;
			const old = rec[key] ?? 0;
			let next: number;
			switch (key) {
				case 'momentum':
					next = Math.max(
						-6,
						Math.min(
							maxMomentum(data as unknown as import('$lib/types.js').CharacterData),
							old + delta,
						),
					);
					break;
				case 'health':
				case 'spirit':
				case 'supply':
				case 'xp':
					next = Math.max(0, Math.min(999, old + delta));
					break;
				case 'bonds':
				case 'failures':
					next = Math.max(0, Math.min(40, old + delta));
					break;
				default:
					return;
			}
			if (next !== old) {
				rec[key] = next;
				const label = key.charAt(0).toUpperCase() + key.slice(1);
				appendLog(
					title(label),
					`<div>${label}: ${old} → <strong>${next}</strong> (${delta > 0 ? '+' : ''}${delta})</div>`,
				);
				// Supply is party-wide — broadcast to every character.
				if (key === 'supply') setPartySupply(next);
			}
		} else if (action.type === 'debility') {
			const rec = data as unknown as Record<string, boolean>;
			if (rec[action.key] === undefined) return;
			const active = (action.value as number) === 1;
			if (rec[action.key] !== active) {
				rec[action.key] = active;
				const label = action.key.charAt(0).toUpperCase() + action.key.slice(1);
				appendLog(
					title('Debilities'),
					`<div>${label}: <strong>${active ? 'Marked' : 'Cleared'}</strong></div>`,
				);
			}
		} else if (action.type === 'reset-track') {
			const rec = data as unknown as Record<string, number>;
			const old = rec[action.key] ?? 0;
			if (old !== 0) {
				rec[action.key] = 0;
				const label = action.key.charAt(0).toUpperCase() + action.key.slice(1);
				appendLog(title(label), `<div>${label} track cleared (${old} ticks → 0)</div>`);
			}
		} else if (action.type === 'set') {
			const rec = data as unknown as Record<string, number>;
			const old = rec[action.key] ?? 0;
			const next = action.value as number;
			if (old !== next) {
				rec[action.key] = next;
				const label = action.key.charAt(0).toUpperCase() + action.key.slice(1);
				const display =
					action.key === 'initiative'
						? `${_INITIATIVE_NAMES[old] ?? old} → <strong>${_INITIATIVE_NAMES[next] ?? next}</strong>`
						: `${old} → <strong>${next}</strong>`;
				appendLog(title(label), `<div>${label}: ${display}</div>`);
			}
		} else if (action.type === 'initiative') {
			const next = action.value;
			if (next !== 0 && next !== 1 && next !== 2) return;
			const rec = data as unknown as Record<string, number>;
			const old = rec.initiative ?? 0;
			if (old !== next) {
				rec.initiative = next;
				appendLog(
					title('Initiative'),
					`<div>Initiative: ${_INITIATIVE_NAMES[old] ?? old} → <strong>${_INITIATIVE_NAMES[next]}</strong></div>`,
				);
			}
		}
	}

	// ── XP spend bus drain — fires when AssetCard logs an XP cost via
	//     triggerXpSpend(charId, amount). Drains the active character first,
	//     then sweeps all other loaded characters so a click on a non-active
	//     character's XP link is applied to the correct character. ──────────
	$effect(() => {
		getXpSpendNonce(); // subscribe
		// Active character fast path.
		if (activeData && activeCharId) {
			const amount = drainXpSpend(activeCharId);
			if (amount > 0) {
				const old = activeData.xp;
				const next = Math.max(0, old - amount);
				if (next !== old) {
					activeData.xp = next;
					appendLog(
						charTitle('Experience'),
						`<div>XP spent: <strong>−${amount}</strong> (${old} → <strong>${next}</strong>)</div>`,
					);
				}
			}
		}
		// Non-active characters — apply directly and persist.
		for (const char of getCharacters()) {
			if (char.id === activeCharId) continue;
			const amount = drainXpSpend(char.id);
			if (amount <= 0) continue;
			const data = $state.snapshot(char.data) as Record<string, unknown>;
			const old = (data.xp as number) ?? 0;
			const next = Math.max(0, old - amount);
			if (next !== old) {
				data.xp = next;
				const name = char.name || 'Character';
				appendLog(
					`${name} — Experience`,
					`<div>XP spent: <strong>−${amount}</strong> (${old} → <strong>${next}</strong>)</div>`,
				);
				persistCharacterNow(char.id, { name: char.name, data });
			}
		}
	});

	// ── Action bus drain — handles clicks on interactive log links
	//     (resource / debility / reset-track / set). LogPanel's click handler
	//     calls triggerAction({ type, key, value, charId }) and we consume
	//     them here. Active character uses the fast reactive path; non-active
	//     characters are updated directly in the store and persisted. ────────
	$effect(() => {
		getActionNonce();
		// Active character fast path — mutations via activeData are reactive.
		if (activeCharId) {
			const actions = drainActions(activeCharId);
			for (const action of actions) {
				if (action.type === 'resource') applyResourceChange(action.key, action.value);
				else if (action.type === 'debility') applyDebilityToggle(action.key, action.value);
				else if (action.type === 'reset-track') applyResetTrack(action.key);
				else if (action.type === 'set') applySet(action.key, action.value);
				else if (action.type === 'initiative') applyInitiative(action.value);
			}
		}
		// Non-active characters — drain their queued actions and persist.
		for (const char of getCharacters()) {
			if (char.id === activeCharId) continue;
			const actions = drainActions(char.id);
			if (!actions.length) continue;
			const data = $state.snapshot(char.data) as Record<string, unknown>;
			for (const action of actions) {
				applyActionToData(data, action, char.name);
			}
			persistCharacterNow(char.id, { name: char.name, data });
		}
	});

	/** Open the asset dialog in edit mode for an owned asset. Snapshots the
	 *  live asset's abilities/rarity and clones it into a draft; the dialog
	 *  mutates only the draft until OK is clicked. */
	function openAssetDialog(id: string, evt: MouseEvent) {
		if (!activeData) return;
		const arr = (activeData.assets ?? []) as CharacterAsset[];
		const live = arr.find((a) => a.assetId === id);
		if (!live) return;

		dialogMode = 'edit';
		dialogDraft = cloneAsset(live);
		dialogGlobals = { ...(activeData.globalValues ?? {}) };
		dialogSnapshotAbilities = [...live.abilities];
		dialogSnapshotRarityId = live.rarityId;
		dialogPurchaseCost = 0;

		showDialogFromOrigin(evt);
	}

	/** Capture the clicked element's centre so the dialog can scale-fade in
	 *  from that point (set via CSS custom properties on dialogEl). */
	function showDialogFromOrigin(evt: MouseEvent | null) {
		const tab = (evt?.currentTarget as HTMLElement | null)?.getBoundingClientRect();
		// Open bits-ui Dialog first; wait one microtask so Content mounts,
		// then stamp the scale-fade origin custom properties on it.
		dialogOpen = true;
		queueMicrotask(() => {
			if (!dialogEl || !tab) return;
			const offsetX = tab.left + tab.width / 2 - window.innerWidth / 2;
			const offsetY = tab.top + tab.height / 2 - window.innerHeight / 2;
			dialogEl.style.setProperty('--ca-origin-x', `${offsetX}px`);
			dialogEl.style.setProperty('--ca-origin-y', `${offsetY}px`);
		});
	}

	function cloneAsset(a: CharacterAsset): CharacterAsset {
		return {
			assetId: a.assetId,
			abilities: [...a.abilities],
			rarityId: a.rarityId,
			selections: a.selections ? [...a.selections] : undefined,
			customValues: a.customValues ? { ...a.customValues } : undefined,
		};
	}

	/** Cancel/X — discard the draft. Live character was never touched. */
	function closeAssetDialog() {
		dialogOpen = false;
		dialogDraft = null;
	}

	/** OK / Add — diff the draft against the snapshot, log the consolidated
	 *  XP cost (if any), and persist draft → live. */
	function commitAssetDialog() {
		if (!dialogDraft || !activeData || !activeChar) return;

		const rarities = findRaritiesForAsset(dialogDraft.assetId);
		const totalCost = computeAssetXpDiff({
			snapshotAbilities: dialogSnapshotAbilities,
			draftAbilities: dialogDraft.abilities,
			snapshotRarityId: dialogSnapshotRarityId,
			draftRarityId: dialogDraft.rarityId,
			rarityXpCost: (id) => rarities.find((r) => r.id === id)?.xpCost ?? 0,
			purchaseCost: dialogPurchaseCost,
		});

		// Persist draft → live
		const arr = (activeData.assets ?? []) as CharacterAsset[];
		if (dialogMode === 'add') {
			activeData.assets = [...arr, dialogDraft];
		} else {
			activeData.assets = arr.map((a) => (a.assetId === dialogDraft!.assetId ? dialogDraft! : a));
		}
		activeData.globalValues = dialogGlobals;

		// Consolidated log entry — only when something costs XP.
		if (totalCost > 0) {
			const def = findAsset(dialogDraft.assetId);
			const action = dialogMode === 'add' ? 'added' : 'modified';
			const entryId = crypto.randomUUID();
			const xpLink = `<a class="xp-cost-link" data-entry-id="${entryId}" data-cost="${totalCost}" data-char-id="${activeChar.id}" href="#">−${totalCost} experience</a>`;
			appendLog(
				charTitle('Assets'),
				`<div>Asset ${action}: <strong>${def?.name ?? dialogDraft.assetId}</strong> ${xpLink}</div>`,
				entryId,
			);
		}

		closeAssetDialog();
	}

	let characterOptionsRef = $state<{ open(): void; close(): void } | null>(null);
	async function confirmDeleteCharacter() {
		if (!activeChar) return;
		const id = activeChar.id;
		try {
			await deleteCharacter(id);
			if (activeCharId === id) activeCharId = null;
		} catch (err) {
			console.error('[v2] deleteCharacter failed', err);
		}
	}

	// ── Asset removal confirmation ──────────────────────────────────────
	// Clicking the trash icon inside the asset dialog opens a ConfirmDialog;
	// confirming removes the asset from activeData.assets, which the deep-
	// snapshot auto-save effect will then persist.
	let removeAssetDialogRef = $state<{ open(): void; close(): void } | null>(null);
	let pendingRemoveAssetId = $state<string | null>(null);
	function openRemoveAssetConfirm(id: string) {
		pendingRemoveAssetId = id;
		removeAssetDialogRef?.open();
	}
	function confirmRemoveAsset() {
		if (!activeData || !pendingRemoveAssetId) return;
		const id = pendingRemoveAssetId;
		const arr = (activeData.assets ?? []) as CharacterAsset[];
		const def = findAsset(id);
		activeData.assets = arr.filter((a) => a.assetId !== id);
		if (def) {
			appendLog(
				charTitle('Assets'),
				`<div>Asset removed: <strong>${def.name}</strong> <em>(${def.category})</em></div>`,
			);
		}
		pendingRemoveAssetId = null;
		closeAssetDialog();
	}

	let newlyCreatedVowId = $state('');
	function addVow() {
		if (!activeData) return;
		// Switch the card's tab strip to Vows so the new card actually renders;
		// VowCard's focusName effect can then move the user straight into the
		// name input.
		activeCard = 'vows';
		const newVow: Vow = {
			id: crypto.randomUUID(),
			name: '',
			difficulty: 'formidable',
			ticks: 0,
			threat: '',
			menace: 0,
			notes: '',
		};
		activeData.vows = [...(activeData.vows ?? []), newVow];
		newlyCreatedVowId = newVow.id;
		// Mirror V1: log the new vow at creation time. Difficulty defaults to
		// Formidable; the user can change it in the card afterward.
		appendLog(charTitle('Vow'), `<div>Swore a new iron vow — <strong>Formidable</strong></div>`);
	}
	function removeVow(id: string) {
		if (!activeData) return;
		activeData.vows = (activeData.vows ?? []).filter((v) => v.id !== id);
	}

	// ── New-character dialog ──────────────────────────────────────────────
	// + Character (empty state) and "+ New character…" (combobox) both go
	// through the same one-field dialog so users name the character up
	// front instead of having to open the gear afterwards.
	let creatingChar = $state(false);
	let newCharDialogRef = $state<{ open(): void; close(): void } | null>(null);
	let newCharName = $state('');

	function addCharacter() {
		// Reset the input each time — never carry a stale draft across opens.
		newCharName = '';
		newCharDialogRef?.open();
	}

	async function _commitNewCharacter() {
		if (creatingChar) return;
		const nameToUse = newCharName.trim() || 'New Character';
		creatingChar = true;
		try {
			const newChar = await createCharacter(nameToUse);
			activeCharId = newChar.id;
			activeCard = 'core';
		} catch (err) {
			console.error('[v2] createCharacter failed', err);
		} finally {
			creatingChar = false;
			newCharName = '';
		}
	}

	/** Picker → parent flow. Instead of immediately appending the asset, set
	 *  up a draft and open the asset dialog in 'add' mode so the user can
	 *  pre-configure abilities/rarity/counters before committing. The 3-XP
	 *  asset-purchase cost rides along in dialogPurchaseCost. */
	function handleAddAsset(assetId: string) {
		if (!activeData || !activeChar) return;
		const def = findAsset(assetId);
		if (!def) return;
		const arr = (activeData.assets ?? []) as CharacterAsset[];
		if (arr.some((a) => a.assetId === assetId)) return;

		// Exclusive group enforcement (mirrors v1 AssetsSection.addAsset):
		// defence-in-depth for any non-picker entry path. The picker already
		// disables conflicting tiles up front, so reaching this branch from
		// the UI shouldn't happen — silent refusal is fine.
		if (def.exclusiveGroup) {
			const allDefs = getAssets();
			const conflict = arr.find((owned) => {
				const ownedDef = allDefs.find((a) => a.id === owned.assetId);
				return ownedDef?.exclusiveGroup === def.exclusiveGroup;
			});
			if (conflict) {
				pickerOpen = false;
				return;
			}
		}

		// Construct a draft from definition defaults. The dialog's snapshot is
		// also the defaults — so newly-flipped-on abilities count as 2 XP each
		// against the 3-XP asset purchase budget.
		const defaultAbilities = def.abilities.map((a) => a.enabled);
		dialogMode = 'add';
		dialogDraft = {
			assetId,
			abilities: [...defaultAbilities],
		};
		dialogGlobals = { ...(activeData.globalValues ?? {}) };
		dialogSnapshotAbilities = defaultAbilities;
		dialogSnapshotRarityId = undefined;
		dialogPurchaseCost = 3;
		pickerOpen = false;
		showDialogFromOrigin(null);
	}
</script>

<div class="ca-area" data-char-count={characters.length}>
	<!-- Header -->
	<header class="ca-header">
		{#if showTitle}
			<span class="ca-title-icon" aria-hidden="true">{@html charactersIconSvg}</span>
			<span class="ca-title">{headingText('Characters')}</span>
		{/if}

		<!-- Toolbar actions. Empty state falls back to a plain "+ Character"
		     button; once there is at least one character the combobox becomes
		     the switcher (with "+ New character" inside), and the trash + per-
		     character add-buttons live on the right. -->
		<div class="ca-header-actions" data-char-count={characters.length}>
			<!-- Always show the switcher — even when the list is empty. Trigger
			     reads the active name; when empty a muted placeholder reads
			     "— No characters yet —", and the popover surfaces
			     "+ New character…" as the only action. -->
			<!-- Character switcher (Popover + Command). Trigger reads live
					 data.name (reactive) so renames in the stage below propagate
					 here without extra plumbing. -->
			<Popover.Root bind:open={charPickerOpen}>
				<Popover.Trigger class="mp-combobox ca-hdr-combobox" aria-label="Switch or add character">
					{#if activeChar}<span class="mp-combobox-value">{charDisplayName(activeChar)}</span
						>{:else}<span class="mp-combobox-value mp-combobox-value--placeholder"
							>— No characters yet —</span
						>{/if}
					<span class="mp-combobox-caret" aria-hidden="true">{@html iconCaretDownSvg}</span>
				</Popover.Trigger>
				<Popover.Portal>
					<Popover.Content class="mp-cmd-popover" sideOffset={4} align="start" collisionPadding={8}>
						<Command.Root class="mp-cmd">
							<div class="mp-cmd-search-row">
								<span class="mp-cmd-search-icon" aria-hidden="true">{@html searchIconSvg}</span>
								<Command.Input class="mp-cmd-search" placeholder="Search characters…" autofocus />
							</div>
							<Command.List class="mp-cmd-list">
								<Command.Empty class="mp-cmd-empty">No matching characters.</Command.Empty>
								{#each sortedCharacters as ch (ch.id)}
									{@const n = charDisplayName(ch)}
									<Command.Item
										class="mp-cmd-item"
										value={n}
										onSelect={() => {
											selectChar(ch.id);
											charPickerOpen = false;
										}}
									>
										<span class="mp-cmd-check" aria-hidden="true">
											{#if ch.id === activeCharId}
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
										<span class="mp-cmd-item-name">{n}</span>
									</Command.Item>
								{/each}
								<Command.Separator class="mp-cmd-sep" />
								<Command.Item
									class="mp-cmd-item mp-cmd-item--action"
									value="+ New character"
									onSelect={() => {
										charPickerOpen = false;
										void addCharacter();
									}}
								>
									<span class="mp-cmd-check" aria-hidden="true"></span>
									<span class="mp-cmd-item-name">+ New character…</span>
								</Command.Item>
							</Command.List>
						</Command.Root>
					</Popover.Content>
				</Popover.Portal>
			</Popover.Root>

			{#if activeChar && activeData}
				<!-- Per-character add buttons — icon-only to save header width.
					 Link = vow; gem = asset. Vow first (left) because it's the
					 more common per-character action. Same glyphs used inline
					 in the panel below. -->
				<button
					class="btn btn-icon icon-btn ca-hdr-icon-btn"
					onclick={addVow}
					use:tooltip={'Add Vow'}
					aria-label="Add Vow"
					><span class="ca-hdr-icon-plus" aria-hidden="true">+</span>{@html linkSvg}</button
				>
				<button
					class="btn btn-icon icon-btn ca-hdr-icon-btn"
					onclick={() => {
						activeCard = 'assets';
						pickerOpen = true;
					}}
					use:tooltip={'Add Asset'}
					aria-label="Add Asset"
					><span class="ca-hdr-icon-plus" aria-hidden="true">+</span>{@html gemSvg}</button
				>

				<!-- Character options (gear) — opens CharacterOptionsDialog,
					 which hosts rename + delete. Matches the map's gear pattern
					 so low-frequency actions don't crowd the header row. -->
				<button
					class="btn btn-icon icon-btn ca-hdr-settings-btn"
					onclick={() => characterOptionsRef?.open()}
					use:tooltip={'Character options'}
					aria-label="Character options">{@html iconGearSvg}</button
				>
			{/if}
		</div>
	</header>

	{#if loading}
		<div class="ca-loading">Loading…</div>
	{:else if characters.length === 0}
		<div class="ca-empty">
			<span class="ca-empty-icon" aria-hidden="true">{@html charactersIconSvg}</span>
			<p class="ca-empty-text">
				Your saga begins not with a battle, but with a button. Pick
				<strong>+ New character…</strong> from the switcher above to start.
			</p>
		</div>
	{:else}
		<div class="ca-body">
			<div class="deck-stage ca-stage">
				{#if activeChar && activeData}
					{@const d = activeData}
					<!-- Card tab strip -->
					<Tabs.Root
						value={activeCard}
						onValueChange={(v) => (activeCard = v as CardKey)}
						class="ca-tabs-root"
					>
						<Tabs.List class="ca-tabs">
							{#each CARD_LABELS as tab (tab.key)}
								<Tabs.Trigger value={tab.key} class="ca-tab">{tab.label}</Tabs.Trigger>
							{/each}
						</Tabs.List>
					</Tabs.Root>
					<!-- Active card content -->
					<div class="deck-card ca-card" role="tabpanel">
						{#if activeCard === 'background'}
							<div
								class="ca-card-section ca-bg-section"
								class:ca-bg-section--editing={editingBackground}
							>
								<!-- Portrait floats right and the prose wraps around it; it's
								     hidden while editing so the textarea fills the whole panel. -->
								{#if !editingBackground}
									<PortraitUploader
										endpoint={`/api/characters/${activeChar.id}/portrait`}
										etag={(d.portraitEtag as string) ?? ''}
										oninput={(etag) => {
											const data = activeChar.data as Record<string, unknown>;
											data.portraitEtag = etag;
											delete data.portrait; // drop any legacy inline portrait
										}}
										placeholderSvg={hornedHelmSvg}
										alt={`Portrait of ${d.name || activeChar.name}`}
									/>
								{/if}

								<MarkdownNotes
									bind:value={d.background}
									bind:editing={editingBackground}
									placeholder="Origin, upbringing, major traits…"
									rows={6}
								/>
							</div>
						{:else if activeCard === 'core'}
							<div class="ca-card-section">
								<!-- Initiative — None / Foe / Character. Mirrors V1's
								     cs-init-section. Stored on data.initiative
								     (0 = none, 1 = character, 2 = foe). -->
								<div class="ca-init-section">
									<span class="ca-init-label">Initiative</span>
									<SegmentedRadio
										ariaLabel="Initiative"
										labels="always"
										value={(d.initiative as number) ?? 0}
										onchange={(v) => (d.initiative = v)}
										options={[
											{ value: 0, text: 'None', label: 'No initiative', tone: 'neutral' },
											{
												value: 2,
												icon: shieldSvg,
												text: 'Foe',
												label: 'Foe has initiative',
												tone: 'stop',
											},
											{
												value: 1,
												icon: swordSvg,
												text: 'Character',
												label: 'You have initiative',
												tone: 'go',
											},
										]}
									/>
								</div>

								<!-- Stats — same StatControl tiles as v1, with the same color vars and stat-icon mapping.
								     Wrapped with a vertical "STATS" side label on the LHS (V1 stats-row-wrapper pattern). -->
								<div class="ca-stats-wrapper">
									<div class="ca-side-label">Stats</div>
									<div class="ca-stats-row">
										<StatControl
											label="Edge"
											bind:value={d.edge}
											color="var(--color-edge)"
											tooltip="Quickness, agility, and prowess in ranged combat"
										/>
										<StatControl
											label="Heart"
											bind:value={d.heart}
											color="var(--color-heart)"
											tooltip="Courage, willpower, empathy, sociability, and loyalty"
										/>
										<StatControl
											label="Iron"
											bind:value={d.iron}
											color="var(--color-iron)"
											tooltip="Physical strength, endurance, and prowess in close combat"
										/>
										<StatControl
											label="Shadow"
											bind:value={d.shadow}
											color="var(--color-shadow)"
											tooltip="Sneakiness, deceptiveness, and cunning"
										/>
										<StatControl
											label="Wits"
											bind:value={d.wits}
											color="var(--color-wits)"
											tooltip="Expertise, knowledge, and observation"
										/>
									</div>
								</div>

								<!-- Vitals — Momentum + Health/Spirit/Supply + Experience. Spinners on every tile;
								     ResourceTile carries its own +/− buttons. XP lives here per the v2 layout
								     so it sits with the other tracked resources. Wrapped with a vertical
								     "VITALS" side label on the LHS (V1 vitals-row-wrapper pattern). -->
								<div class="ca-vitals-wrapper">
									<div class="ca-side-label">Vitals</div>
									<div class="ca-vitals-row">
										<MomentumTile
											bind:value={d.momentum}
											resetVal={momentumReset(d)}
											maxVal={maxMomentum(d)}
											tooltipText="Your overall advantage or disadvantage on the quest. Build it up through good rolls and smart choices, then burn it at a crucial moment to force a better outcome."
											onreset={() => applyResourceChange('momentum', momentumReset(d) - d.momentum)}
										/>
										<ResourceTile
											label="Health"
											bind:value={d.health}
											color="var(--color-health)"
											max={5}
											icon={iconHealth}
											tooltip="Physical condition and readiness"
										/>
										<ResourceTile
											label="Spirit"
											bind:value={d.spirit}
											color="var(--color-spirit)"
											max={5}
											icon={iconSpirit}
											tooltip="Mental fortitude and morale"
										/>
										<ResourceTile
											label="Supply"
											bind:value={d.supply}
											color="var(--color-supply)"
											max={5}
											icon={iconSupply}
											tooltip="Available provisions and resources"
											onchange={(_old, next) => setPartySupply(next)}
										/>
										<ResourceTile
											label="Experience"
											bind:value={d.xp}
											color="var(--color-xp)"
											max={30}
											icon={iconStar}
											tooltip="Accumulated experience that can be spent on assets and other enhancements."
										/>
									</div>
								</div>
							</div>
						{:else if activeCard === 'vows'}
							<div class="ca-card-section">
								{#if (d.vows ?? []).length === 0}
									<div class="ca-empty">
										<span class="ca-empty-icon" aria-hidden="true">{@html linkSvg}</span>
										<p class="ca-empty-text">
											You currently have no vows. Do you want to fade into obscurity or perform
											great deeds? Click <strong>+ VOW</strong> to swear on iron.
										</p>
									</div>
								{:else}
									<div class="ca-vows-list">
										{#each d.vows ?? [] as vow, i (vow.id)}
											<VowCard
												bind:vow={d.vows[i]}
												focusName={vow.id === newlyCreatedVowId}
												onDelete={() => removeVow(vow.id)}
											/>
										{/each}
									</div>
								{/if}
							</div>
						{:else if activeCard === 'assets'}
							<div class="ca-card-section">
								{#if (d.assets ?? []).length === 0}
									<div class="ca-empty">
										<span class="ca-empty-icon" aria-hidden="true">{@html gemSvg}</span>
										<p class="ca-empty-text">
											You currently have no assets. You are either unskilled, destitute, or both.
											Click <strong>+ ASSET</strong> to prove me wrong.
										</p>
									</div>
								{:else}
									<div class="ca-asset-grid" aria-label="Assets">
										{#each d.assets ?? [] as a (a.assetId)}
											{@const def = findAsset(a.assetId)}
											{@const catColor = CAT_COLOR[def?.category ?? ''] ?? 'var(--text-muted)'}
											{@const counter = assetCounter(a, d.globalValues)}
											{@const display = assetDisplayName(a, def)}
											<div class="ca-asset-card" style="--cat-color: {catColor}">
												<button
													class="ca-asset-card-main"
													onclick={(e) => openAssetDialog(a.assetId, e)}
													use:tooltip={def ? `${def.name} · ${def.category}` : a.assetId}
												>
													<span class="ca-asset-card-meta">
														<span class="ca-asset-card-cat">{def?.category ?? ''}</span>
														{#if a.rarityId}
															{@const rarity = findRaritiesForAsset(a.assetId).find(
																(r) => r.id === a.rarityId,
															)}
															<span
																class="ca-asset-card-rarity"
																use:tooltip={rarity ? `Rarity: ${rarity.name}` : 'Has rarity'}
																aria-label={rarity ? `Rarity: ${rarity.name}` : 'Has rarity'}
																>{@html gemSvg}</span
															>
														{/if}
													</span>
													<span class="ca-asset-card-name-row">
														<span class="ca-asset-card-name-icon" aria-hidden="true"
															>{@html assetIcon(def)}</span
														>
														<span
															class="ca-asset-card-name"
															class:ca-asset-card-name--custom={display.custom}>{display.text}</span
														>
													</span>
												</button>
												{#if counter}
													<div
														class="ca-asset-card-tile"
														style:--res-color={catColor}
														use:tooltip={`${counter.label}: ${counter.value}/${counter.max}`}
													>
														<div class="ca-asset-card-tile-bg" aria-hidden="true">
															{@html counter.iconSvg}
														</div>
														<span class="ca-asset-card-tile-name">{counter.label}</span>
														<div class="ca-asset-card-tile-row">
															<button
																class="ca-asset-card-tile-btn"
																onclick={() => bumpAssetCounter(a, -1)}
																disabled={counter.value <= 0}
																aria-label="Decrease {counter.label}">−</button
															>
															<span class="ca-asset-card-tile-val"
																>{counter.value}/{counter.max}</span
															>
															<button
																class="ca-asset-card-tile-btn"
																onclick={() => bumpAssetCounter(a, 1)}
																disabled={counter.value >= counter.max}
																aria-label="Increase {counter.label}">+</button
															>
														</div>
													</div>
												{/if}
											</div>
										{/each}
									</div>
								{/if}
							</div>
						{:else if activeCard === 'status'}
							<div class="ca-card-section ca-status-section">
								<!-- Debilities — Conditions / Banes / Burdens grid (V1 component). -->
								<div class="ca-debilities-wrapper">
									<div class="section-label">Debilities</div>
									<DebilitiesSection
										data={d}
										onchange={(label, active) => logDebility(d, label, active)}
									/>
								</div>

								<!-- Bonds & Failures — V1 progress tracks with ± spinners. The
								     note fields expand to fill the panel while being edited. -->
								<div class="ca-tracks-row">
									<ProgressTrackPanel label="Bonds" bind:value={d.bonds} />

									<!-- value + oninput (not bind:value): bondsFormed/lessonsLearned
									     are optional, so legacy/imported characters may have them
									     undefined, which trips MarkdownNotes' bindable fallback. -->
									<div class="ca-track-notes" class:ca-track-notes--editing={editingBondsFormed}>
										<MarkdownNotes
											label="Bonds Formed"
											bind:editing={editingBondsFormed}
											value={d.bondsFormed ?? ''}
											oninput={(v) => (d.bondsFormed = v)}
											placeholder="Note significant bonds — people, communities, places…"
										/>
									</div>

									{#if isDelveEnabled()}
										<ProgressTrackPanel label="Failures" bind:value={d.failures} />
										<div
											class="ca-track-notes"
											class:ca-track-notes--editing={editingLessonsLearned}
										>
											<MarkdownNotes
												label="Lessons Learned"
												bind:editing={editingLessonsLearned}
												value={d.lessonsLearned ?? ''}
												oninput={(v) => (d.lessonsLearned = v)}
												placeholder="What has this character learned from their failures…"
											/>
										</div>
									{/if}
								</div>
							</div>
						{/if}
					</div>
				{/if}
			</div>
		</div>
	{/if}
</div>

<!-- Asset card dialog — hosts AssetCard in either 'add' or 'edit' mode.
     dialogDraft is a clone of the live asset (edit) or a defaults-seeded
     stub (add); edits accumulate locally and only persist on OK / Add. -->
{#if activeChar && activeData && dialogDraft}
	{@const def = findAsset(dialogDraft.assetId)}
	{#if def}
		<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
		<Dialog.Root
			bind:open={dialogOpen}
			onOpenChange={(next) => {
				if (!next) {
					dialogDraft = null;
				}
			}}
		>
			<Dialog.Portal>
				<Dialog.Overlay class="ca-asset-overlay" onclick={closeAssetDialog} />
				<Dialog.Content
					bind:ref={dialogEl}
					class="ca-asset-dialog"
					onkeydown={(e) => {
						// Enter = OK/Add (the primary action). Skip when the user is
						// typing into a textarea (markdown notes), in which case
						// Enter should insert a newline. Buttons handle their own
						// Enter via the default activation behaviour.
						if (e.key !== 'Enter') return;
						const t = e.target as HTMLElement | null;
						if (t?.tagName === 'TEXTAREA') return;
						if (t?.tagName === 'BUTTON') return;
						e.preventDefault();
						commitAssetDialog();
					}}
					onclick={(e) => {
						// Delegate move-links / oracle-links inside asset abilities to
						// the layout-level dialogs via a custom DOM event. AssetCard
						// has no internal handler for these; without this delegation
						// clicking e.g. "Face Danger" inside an ability text is a no-op.
						const ml = (e.target as HTMLElement).closest('a.move-link') as HTMLElement | null;
						if (ml) {
							e.preventDefault();
							document.dispatchEvent(
								new CustomEvent('ironledger:open-move', {
									detail: { id: ml.dataset['id'] ?? '' },
								}),
							);
							return;
						}
						const ol = (e.target as HTMLElement).closest('a.oracle-link') as HTMLElement | null;
						if (ol) {
							e.preventDefault();
							document.dispatchEvent(
								new CustomEvent('ironledger:open-oracle', {
									detail: {
										key: ol.dataset['oracle'] ?? '',
										stat: ol.dataset['stat'] ?? '',
									},
								}),
							);
							return;
						}
					}}
				>
					<AssetCard
						bind:asset={dialogDraft}
						definition={def}
						characterXp={activeData.xp ?? 0}
						bind:globalValues={dialogGlobals}
						mode={dialogMode}
						snapshotAbilities={dialogSnapshotAbilities}
						snapshotRarityId={dialogSnapshotRarityId}
						purchaseCost={dialogPurchaseCost}
						onRemove={() => dialogDraft && openRemoveAssetConfirm(dialogDraft.assetId)}
						onCommit={commitAssetDialog}
						onClose={closeAssetDialog}
					/>
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog.Root>
	{/if}
{/if}

<!-- Asset picker — opens when the trailing "+" asset tab is clicked.
     onAdd appends a new asset entry to the active character (in-memory). -->
{#if pickerOpen && activeChar && activeData}
	<AssetPicker
		ownedIds={((activeData.assets ?? []) as CharacterAsset[]).map((a) => a.assetId)}
		characterData={activeData}
		onAdd={handleAddAsset}
		onClose={() => (pickerOpen = false)}
	/>
{/if}

<!-- New Character dialog — opens from the empty-state "+ Character"
     button and the combobox "+ New character…" action. Users name the
     character up front so the header combobox trigger reads sensibly
     right after creation. Empty name falls back to "New Character". -->
<ConfirmDialog
	bind:this={newCharDialogRef}
	title="New Character"
	confirmLabel="Create"
	confirmClass="btn-primary"
	confirmDisabled={!newCharName.trim()}
	accentColor="var(--text-accent)"
	onconfirm={_commitNewCharacter}
	oncancel={() => {
		newCharName = '';
	}}
	ondismiss={() => {
		newCharName = '';
	}}
>
	<label class="co-field">
		<span class="co-field-label">Character name</span>
		<!-- svelte-ignore a11y_autofocus -->
		<input
			class="co-input"
			type="text"
			bind:value={newCharName}
			placeholder="New Character"
			autofocus
			onkeydown={(e) => {
				if (e.key === 'Enter') {
					e.preventDefault();
					newCharDialogRef?.close();
					void _commitNewCharacter();
				}
			}}
		/>
	</label>
</ConfirmDialog>

<!-- Character options — gear icon in the header opens this. Rename +
     delete both live behind it, matching MapOptionsDialog's pattern. -->
{#if activeChar && activeData}
	{@const d = activeData}
	<CharacterOptionsDialog
		bind:this={characterOptionsRef}
		name={d.name || activeChar.name || ''}
		oncommit={(next) => {
			if (activeData) activeData.name = next;
		}}
		ondelete={confirmDeleteCharacter}
	/>
{/if}

<!-- Remove-asset confirmation — opens from the asset dialog's trash icon,
     then on confirm filters the asset out of activeData.assets. -->
{#if activeChar && activeData}
	{@const assetDef = pendingRemoveAssetId ? findAsset(pendingRemoveAssetId) : undefined}
	<ConfirmDialog
		bind:this={removeAssetDialogRef}
		title="Delete Asset"
		confirmLabel="DELETE"
		onconfirm={confirmRemoveAsset}
		oncancel={() => (pendingRemoveAssetId = null)}
		ondismiss={() => (pendingRemoveAssetId = null)}
	>
		<p>
			Delete <strong>{assetDef?.name ?? 'this asset'}</strong> from
			<strong>{activeChar.name || 'this character'}</strong>?
		</p>
	</ConfirmDialog>
{/if}

<style>
	.ca-area {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
	}

	/* ── Header ───────────────────────────────────────── */
	.ca-header {
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: var(--area-header-height);
		padding: 6px 12px;
		border-bottom: 1px solid var(--border);
		background: var(--bg-control);
		flex-shrink: 0;
		/* Named container so the title label can hide when the panel
		   narrows enough that its combobox + toggles + gear crowd out. */
		container-type: inline-size;
		container-name: area-header;
	}
	@container area-header (max-width: 420px) {
		.ca-title {
			display: none;
		}
	}
	.ca-title-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 18px;
		height: 18px;
		flex-shrink: 0;
		color: var(--text-accent);
	}
	.ca-title-icon :global(svg) {
		width: 100%;
		height: 100%;
		fill: currentColor;
	}
	.ca-title-icon :global(svg) :global(path) {
		fill: currentColor;
	}
	.ca-title {
		font-family: var(--font-display);
		font-size: calc(0.82rem * var(--font-display-scale));
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: var(--font-display-transform);
		color: var(--text-accent);
	}
	/* Toolbar — + Character / + Asset / + Vow / Delete. Delete pinned right. */
	.ca-header-actions {
		display: flex;
		align-items: center;
		gap: 6px;
		flex: 1;
		justify-content: flex-end;
	}
	.ca-loading,
	.ca-empty {
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

	.ca-empty-icon {
		display: flex;
		width: 48px;
		height: 48px;
		opacity: 0.25;
	}
	.ca-empty-icon :global(svg) {
		width: 100%;
		height: 100%;
		fill: currentColor;
	}

	.ca-empty-text {
		margin: 0;
		line-height: 1.5;
		max-width: 26ch;
	}

	/* ── Body: name header + stage (spine strip retired). ─────────── */
	.ca-body {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
	}

	/* Stage — flex / padding / scroll live on the shared `.deck-stage`
	   in app.css so all four decks stay in sync. Chars has no LHS band
	   (unlike Foes / Exp / Connections). */
	.ca-stage {
		margin: 0;
	}

	/* Header combobox trigger — takes flex slack so long character names
	   truncate before pushing the trash + Asset/Vow buttons off-screen. */
	:global(.ca-hdr-combobox) {
		flex: 1 1 auto;
		min-width: 0;
	}

	/* Icon-only header buttons — the plus glyph sits inline with the
	   category glyph (gem / link / gear) to fit them into ~28px each.
	   Raw ?raw SVGs have no intrinsic width, so nail one down here or
	   they collapse to zero inside the flex row. */
	:global(.ca-hdr-icon-btn) {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		padding: 4px 6px;
		flex-shrink: 0;
	}
	:global(.ca-hdr-icon-btn svg) {
		width: 12px;
		height: 12px;
		fill: currentColor;
		flex-shrink: 0;
	}
	:global(.ca-hdr-icon-btn svg path) {
		fill: currentColor;
	}
	:global(.ca-hdr-icon-plus) {
		font-family: var(--font-ui);
		font-size: 0.85rem;
		font-weight: 700;
		line-height: 1;
		color: currentColor;
	}
	:global(.ca-hdr-settings-btn) {
		flex-shrink: 0;
	}
	:global(.ca-hdr-settings-btn svg) {
		width: 13px;
		height: 13px;
		fill: currentColor;
	}
	:global(.ca-hdr-settings-btn svg path) {
		fill: currentColor;
	}

	/* Card tabs (Background / Core / Vows) — V1 tab-btn style: flat,
	   underlined, transparent background. */
	:global(.ca-tabs) {
		display: flex;
		align-items: stretch;
		gap: 0;
		margin-bottom: 8px;
		border-bottom: 1px solid var(--border);
	}
	:global(.ca-tab) {
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
		padding: 7px 8px 6px; /* half of v1's 13/16/11 */
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
	:global(.ca-tab:hover) {
		color: var(--text-muted);
	}
	:global(.ca-tab[data-state='active']) {
		color: var(--text-accent);
		border-bottom-color: var(--text-accent);
	}

	/* Card layout — flex column, padding, background, min-height, gap
	   all live on the shared `.deck-card` in app.css so all four home
	   decks stay in sync. This class carries no unique overrides today;
	   kept as an anchor for any chars-only tweaks in future. */
	.ca-card-section {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	/* Background section — portrait floats right; prose wraps around it.
	   flow-root contains the float; MarkdownNotes is forced to block flow so
	   the text wraps (it's normally a flex column = its own BFC, which would
	   sit beside the float instead). */
	.ca-bg-section {
		display: flow-root;
		position: relative;
	}
	.ca-bg-section :global(.md-notes) {
		display: block;
	}
	/* While editing, the portrait is hidden — let the textarea fill the whole
	   panel (full width and height of the containing card). */
	.ca-bg-section--editing {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
	}
	.ca-bg-section--editing :global(.md-notes) {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
	}
	.ca-bg-section--editing :global(.md-notes-input) {
		flex: 1;
		min-height: 0;
	}

	/* Initiative widget — mirrors V1 .cs-init-section: small toggle group
	   with three pill buttons (None / Foe / Character). */
	.ca-init-section {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.ca-init-label {
		font-family: var(--font-ui);
		font-size: 0.7rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--text-dimmer);
	}
	/* The initiative toggle now uses the shared <SegmentedRadio> (labels="always",
	   tones none→neutral / foe→stop / character→go), which carries these styles. */

	/* Stats / Vitals wrappers — wrap each row with a vertical "STATS" /
	   "VITALS" side label on the left, V1-style with a separator. Upper
	   border separates the section from whatever is above (initiative for
	   stats, stats for vitals). */
	.ca-stats-wrapper,
	.ca-vitals-wrapper {
		display: flex;
		align-items: stretch;
		gap: 8px;
		border-top: 1px solid #c5b99e;
		padding-top: 8px;
	}
	.ca-side-label {
		writing-mode: vertical-rl;
		transform: rotate(180deg);
		font-family: var(--font-ui);
		font-size: 0.55rem;
		font-weight: 800;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--text-dimmer);
		flex-shrink: 0;
		align-self: stretch;
		display: flex;
		align-items: center;
		justify-content: center;
		/* The element is rotated 180° (writing-mode + transform), so a CSS
		   `border-left` shows up on the visual RIGHT of the label — between
		   the label text and the chits to its right. */
		border-left: 1px solid var(--border);
		padding-left: 6px;
		padding-right: 2px;
	}

	/* Chit rows: fixed-width chits packed against the left. */
	.ca-stats-row {
		display: flex;
		justify-content: flex-start;
		align-items: stretch;
		gap: 8px;
		flex-wrap: wrap;
		flex: 1;
	}
	.ca-stats-row > :global(*) {
		flex: 0 0 auto;
	}

	.ca-vitals-row {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-start;
		align-items: stretch;
		gap: 8px;
		flex: 1;
	}
	.ca-vitals-row > :global(*) {
		flex: 0 0 auto;
	}
	.ca-vitals-row > :global(.mt-tile) {
		width: 168px;
	}

	/* Debilities — Conditions / Banes / Burdens grid above Bonds/Failures.
	   padding-bottom matches v2 ExpeditionsArea's .ea-pills-row (14px) so the
	   gap below the debility buttons reads the same as the gap below the
	   journey pills, and roughly equals the top gap above the section
	   label (tabs margin-bottom 8px + card padding-top 7px ≈ 15px). */
	.ca-debilities-wrapper {
		padding-bottom: 14px;
		border-bottom: 1px solid var(--border);
	}

	/* Tracks — V1 tracks-row layout: side-by-side Bonds + Failures groups,
	   each with label · tally on top and progress boxes + ± buttons below. */
	/* Status tab fills the card so a note being edited can grow to the bottom. */
	.ca-status-section {
		height: 100%;
		min-height: 0;
	}
	.ca-tracks-row {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding-top: 4px;
		flex: 1;
		min-height: 0;
	}
	/* A note field grows to fill the remaining track-row space while editing,
	   with the textarea filling it and the markdown hint pinned at the bottom. */
	.ca-track-notes--editing {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
	}
	.ca-track-notes--editing :global(.md-notes) {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
	}
	.ca-track-notes--editing :global(.md-notes-input) {
		flex: 1;
		min-height: 0;
	}
	/* Vows tab — stack of VowCards. The "+ Vow" action lives in the header
	   toolbar now, so no per-tab header is needed. */
	.ca-vows-list {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	/* Tab empty state — icon + witty prompt, mirrors FoesArea/CommunitiesArea. */
	.ca-empty {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 180px;
		font-family: var(--font-ui);
		font-size: 0.8rem;
		color: var(--text-muted);
		padding: 20px;
		gap: 12px;
		text-align: center;
	}
	.ca-empty-icon {
		display: flex;
		width: 48px;
		height: 48px;
		opacity: 0.25;
	}
	.ca-empty-icon :global(svg) {
		width: 100%;
		height: 100%;
		fill: currentColor;
	}
	.ca-empty-text {
		margin: 0;
		line-height: 1.5;
		max-width: 30ch;
	}

	/* ── Asset tab content — clickable cards in a responsive grid.
	   Each card is auto-sized so a row fits as many as possible. Hover
	   raises the card slightly and brightens it; clicking opens the
	   AssetCard dialog (same as v1). The left-edge accent uses the
	   asset's category color (Combat/Path/Companion/Ritual/Talent). */
	.ca-asset-grid {
		display: grid;
		/* As many ~220-px columns as fit. Mobile gets 1 column; mid-width
		   screens get 2; wide desktops can get 3+. */
		grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
		gap: 6px;
	}
	/* Outer card is now a flex row: main info area on the left + optional
	   counter tile on the right. Hover state is on the inner main-button
	   area only — putting it on the outer card caused the whole chit to
	   lift when the cursor moved onto the counter ± buttons. */
	.ca-asset-card {
		display: flex;
		align-items: stretch;
		gap: 0;
		background: var(--bg-inset);
		border: 1px solid var(--border);
		border-left: 3px solid var(--cat-color, var(--text-muted));
		border-radius: 4px;
		overflow: hidden;
		transition: border-color 0.12s;
	}
	/* Clickable main area — opens the asset dialog. The ± buttons in the
	   tile to its right have their own focus, so this region is purely
	   for "open detail". */
	.ca-asset-card-main {
		all: unset;
		flex: 1;
		min-width: 0;
		cursor: pointer;
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 7px 10px;
		transition: background 0.12s;
	}
	.ca-asset-card-main:hover {
		background: var(--bg-hover);
	}
	.ca-asset-card-meta {
		display: flex;
		align-items: center;
		gap: 5px;
	}
	.ca-asset-card-cat {
		font-family: var(--font-ui);
		font-size: 0.55rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--cat-color, var(--text-muted));
		line-height: 1;
	}
	/* Name row — flex with category icon on the left and the name text
	   on the right. Mirrors the Communities / Expeditions stage-icon
	   pattern. 16-px icon fits the compact chit size. */
	.ca-asset-card-name-row {
		display: flex;
		align-items: center;
		gap: 6px;
		min-width: 0;
	}
	.ca-asset-card-name-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 16px;
		height: 16px;
		color: var(--cat-color, var(--text-muted));
		flex-shrink: 0;
	}
	.ca-asset-card-name-icon :global(svg) {
		width: 100%;
		height: 100%;
		fill: currentColor;
	}
	.ca-asset-card-name-icon :global(svg path) {
		fill: currentColor;
	}
	/* Gem badge — appears in the meta row when the asset has a selected
	   rarity. Inherits the asset category colour via currentColor on the
	   SVG fill. */
	.ca-asset-card-rarity {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 12px;
		height: 12px;
		color: var(--cat-color, var(--text-muted));
		flex-shrink: 0;
	}
	.ca-asset-card-rarity :global(svg) {
		width: 100%;
		height: 100%;
		fill: currentColor;
	}
	.ca-asset-card-rarity :global(svg path) {
		fill: currentColor;
	}
	.ca-asset-card-name {
		flex: 1;
		min-width: 0;
		font-family: var(--font-ui);
		font-size: 0.78rem;
		color: var(--text);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	/* User-supplied name (filled in via the asset's "string" custom field —
	   companion name, specialty, etc.). Italic signals it's not the catalogue
	   name. */
	.ca-asset-card-name--custom {
		font-style: italic;
	}

	/* Counter tile on the right end of the chit — mirrors ResourceTile's
	   visual structure (label + value/± row + faded background icon) but
	   compact. ± buttons mutate the underlying counter directly; counters
	   don't cost XP so no draft/snapshot is needed. */
	.ca-asset-card-tile {
		position: relative;
		flex-shrink: 0;
		width: 84px;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: space-between;
		gap: 3px;
		padding: 5px 4px;
		border-left: 1px solid color-mix(in srgb, var(--res-color) 30%, var(--border));
		background: color-mix(in srgb, var(--res-color) 8%, var(--bg-card));
		overflow: hidden;
	}
	.ca-asset-card-tile-bg {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		opacity: 0.18;
		pointer-events: none;
	}
	:global([data-theme='dark']) .ca-asset-card-tile-bg {
		opacity: 0.4;
	}
	.ca-asset-card-tile-bg :global(svg) {
		width: 60%;
		height: 60%;
		fill: var(--res-color);
		color: var(--res-color);
	}
	.ca-asset-card-tile-name {
		font-family: var(--font-ui);
		font-size: 0.55rem;
		font-weight: 900;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--res-color);
		line-height: 1;
		position: relative;
		z-index: 1;
	}
	.ca-asset-card-tile-row {
		display: flex;
		align-items: center;
		gap: 3px;
		position: relative;
		z-index: 1;
	}
	.ca-asset-card-tile-btn {
		background: transparent;
		border: 1px solid var(--border-mid);
		color: var(--text-muted);
		cursor: pointer;
		padding: 0;
		width: 18px;
		height: 18px;
		font-size: 0.7rem;
		line-height: 1;
		border-radius: 3px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		transition:
			border-color 0.12s,
			color 0.12s;
	}
	.ca-asset-card-tile-btn:hover:not(:disabled) {
		border-color: var(--res-color);
		color: var(--res-color);
	}
	.ca-asset-card-tile-btn:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}
	.ca-asset-card-tile-val {
		font-family: var(--font-ui);
		font-size: 0.65rem;
		font-weight: 800;
		color: var(--res-color);
		font-variant-numeric: tabular-nums;
		min-width: 2.6em;
		text-align: center;
		line-height: 1;
	}

	/* ── Asset detail dialog ── transparent shell; the AssetCard inside owns
	   all visual structure (header, abilities, custom fields) so the popup
	   matches v1's expanded asset look exactly. The dialog itself uses no
	   flex container — content sizes it naturally — and overflow scrolling
	   is delegated to the .asset-body with a viewport-relative max-height.
	   This avoids a flex chain (`display: flex` + `min-height: 0` children)
	   that collapsed the dialog to a thin line on iOS Safari. */
	/* bits-ui portals Content + Overlay to <body>; scope everything
	   globally. Overlay 80 / content 81 matches the modal z-index tier. */
	:global(.ca-asset-overlay) {
		position: fixed;
		inset: 0;
		background: #00000060;
		backdrop-filter: blur(1px);
		animation: ca-asset-backdrop-in 0.5s ease-out;
		z-index: 80;
	}
	:global(.ca-asset-dialog) {
		background: transparent;
		color: var(--text);
		width: min(640px, calc(100vw - 1rem));
		max-height: 80vh;
		overflow: hidden;
		outline: none;
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		z-index: 81;
		/* Scale-fade in from the clicked asset tab's centre. Origin CSS
		   custom properties are stamped inline by showDialogFromOrigin(). */
		animation: ca-asset-open 0.5s cubic-bezier(0.16, 1, 0.3, 1);
	}
	@keyframes ca-asset-open {
		from {
			opacity: 0;
			transform: translate(
					calc(-50% + var(--ca-origin-x, 0px)),
					calc(-50% + var(--ca-origin-y, 0px))
				)
				scale(0.05);
		}
		to {
			opacity: 1;
			transform: translate(-50%, -50%) scale(1);
		}
	}
	@keyframes ca-asset-backdrop-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}
	/* AssetCard sizes itself to its content; no flex-fill needed. The body
	   carries the scroll constraint directly. */
	:global(.ca-asset-dialog .asset-card) {
		width: 100%;
	}
	:global(.ca-asset-dialog .asset-header) {
		position: sticky;
		top: 0;
		z-index: 1;
	}
	:global(.ca-asset-dialog .asset-body) {
		/* Cap the body's height so it scrolls internally when an asset is
		   tall (e.g. Difficulty Factors expanded). Leaves ~3rem each for the
		   sticky header and the Cancel/Delete footer — the dialog's own
		   80vh cap contains everything. `overscroll-behavior: contain` stops
		   touch-drag at the body's scroll boundary from bleeding through to
		   the page on iOS Safari. */
		max-height: calc(80vh - 6rem);
		overflow-y: auto;
		overscroll-behavior: contain;
	}
	/* asset-body is itself a flex column. Without flex-shrink: 0 on its
	   children, sections with overflow: hidden (e.g. .factors-section) get
	   squashed by the flex algorithm to fit the available space. */
	:global(.ca-asset-dialog .asset-body > *) {
		flex-shrink: 0;
	}
</style>
