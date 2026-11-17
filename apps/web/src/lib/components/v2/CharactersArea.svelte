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
	} from '#lib/characterStore.svelte.js';
	import { setActiveDiceCtx } from '#lib/diceContext.svelte.js';
	import { getActiveCharacterId, setActiveCharacterId } from '#lib/activeContext.svelte.js';
	import { createDebouncedSave } from '#lib/debouncedSave.js';
	import { initialSelection, rememberSelection } from '#lib/rememberedSelection.js';
	import { tooltip } from '#lib/actions/tooltip.js';
	import { rollOracle, getOracles, findOracle } from '#lib/oracleStore.svelte.js';
	import {
		NAME_ORACLES,
		defaultRandomizeFlags,
		rollCharacterRandomizations,
		randomizationsAsMarkdown,
		logCreateRolls,
		rollYrtTouchedFeatures,
		touchedFeaturesLogHtml,
		touchedFeaturesMd,
		type CharacterRandomizeFlags,
	} from '#lib/characterRollups.js';
	import RandomizeBlock from '#lib/components/RandomizeBlock.svelte';
	import CharacterFields from '#lib/components/CharacterFields.svelte';
	import {
		characterFieldGroups,
		fieldShown,
		fieldValue,
		findCharacterField,
		rollCharacterField,
		valueLabel,
		type ResolvedField,
	} from '#lib/characterFields.svelte.js';
	import StatAllocator from '#lib/components/StatAllocator.svelte';
	import { availableStatArrays, type Stat } from '#lib/rules/statArrays.js';
	import Select from '#lib/components/Select.svelte';
	import diceD6Svg from '#icons/dice-d6-light.svg?raw';
	import {
		findAsset,
		findRaritiesForAsset,
		isAssetsLoading,
		getAssets,
	} from '#lib/assetStore.svelte.js';
	import { isSourceEnabled } from '#lib/expansionStore.svelte.js';
	import {
		hydrateCharacterInPlace,
		maxMomentum,
		momentumReset,
		changeResource,
		setResource,
		computeAssetXpDiff,
		STARTING_XP,
		type ResourceChange,
	} from '#lib/character.js';
	import hornedHelmSvg from '#icons/horned-helm.svg?raw';
	import { appIcon } from '#lib/liveryIcons.js';
	import type { AssetDefinition, CharacterData, CharacterAsset } from '#lib/types.js';
	import { escHtml } from '#lib/markdown.js';
	import { firstPreconditionFailure } from '#lib/preconditions.js';
	import AssetCard from '#lib/components/AssetCard.svelte';
	import AssetPicker from '#lib/components/AssetPicker.svelte';
	import MarkdownNotes from '#lib/components/MarkdownNotes.svelte';
	import PortraitUploader from '#lib/components/PortraitUploader.svelte';
	import { Dialog, Tabs } from 'bits-ui';
	import Combobox from '#lib/components/Combobox.svelte';
	import { pushDialog, popDialog, overlayZ, contentZ } from '#lib/dialogStack.svelte.js';
	import ConfirmDialog from '#lib/components/ConfirmDialog.svelte';
	import CharacterOptionsDialog from '#lib/components/CharacterOptionsDialog.svelte';
	import SheetCore from '#lib/components/v2/sheet/SheetCore.svelte';
	import SheetVows from '#lib/components/v2/sheet/SheetVows.svelte';
	import SheetAssets from '#lib/components/v2/sheet/SheetAssets.svelte';
	import {
		appendLog,
		enrichOutcomeLinks,
		getXpSpendNonce,
		drainXpSpend,
		getActionNonce,
		drainActions,
		type LogAction,
	} from '#lib/log.svelte.js';
	import { renderRich } from '#lib/dsl.js';
	import { FLOOR_RULES, DEBILITY_MOMENTUM_TITLE } from '#lib/cascadeRules.js';
	import { type Vow, type VowDifficulty, VOW_FORSAKE_STRESS } from '#lib/types.js';
	import iconGearSvg from '#icons/gear-solid.svg?raw';
	import gemSvg from '#icons/gem-solid.svg?raw';
	import linkSvg from '#icons/link-solid.svg?raw';
	import { headingText } from '#lib/fontStore.svelte.js';

	let { showTitle = true }: { showTitle?: boolean } = $props();

	type CardKey = 'core' | 'details' | 'background' | 'vows' | 'assets';
	const CARD_LABELS: { key: CardKey; label: string }[] = [
		{ key: 'core', label: 'Core' },
		{ key: 'details', label: 'Details' },
		{ key: 'background', label: 'Background' },
		{ key: 'vows', label: 'Vows' },
		{ key: 'assets', label: 'Assets' },
	];

	let activeCharId = $state<string | null>(null);
	let activeCard = $state<CardKey>('core');
	let dialogOpen = $state(false);
	let dialogEl = $state<HTMLElement | null>(null);
	let pickerOpen = $state(false);
	let stackDepth = $state(1);
	$effect(() => {
		if (!dialogOpen) return;
		stackDepth = pushDialog();
		return () => popDialog();
	});

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
	const characters = $derived(getCharacters());
	const loading = $derived(isCharacterLoading() || isAssetsLoading());

	// Once data has loaded, open the character this device had open last, or
	// else the first (see rememberedSelection.ts).
	$effect(() => {
		if (!activeCharId && characters.length > 0) {
			activeCharId = initialSelection(
				'characters',
				characters.map((c) => c.id),
			);
		}
	});
	$effect(() => rememberSelection('characters', activeCharId));

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
	/** Switcher combobox action row. */
	const charActions = [
		{
			label: '+ New character…',
			value: '+ New character',
			onselect: () => void addCharacter(),
			tour: 'new-char-action',
		},
	];

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

	function selectChar(id: string) {
		activeCharId = id;
		activeCard = 'core';
		closeAssetDialog();
	}

	function charTitle(name: string): string {
		return `${activeData?.name || 'Unnamed'} — ${name}`;
	}

	/** Why an owned asset can't be used now (its preconditions fail, e.g. a
	 *  Touched asset on a Pure character), or null. */
	function assetBlocked(def: AssetDefinition | undefined): string | null {
		if (!def || !activeData) return null;
		return firstPreconditionFailure(def.preconditions as string | undefined, activeData, {
			self: activeData.assets.find((a) => a.assetId === def.id),
		});
	}

	/** A change to an extension field on the sheet: stored, logged, and — for
	 *  a field an asset's ability limit follows (a Touched asset's
	 *  `abilityMaxByField.touched`) — the abilities above the new limit
	 *  unmarked, keeping the first ones. No XP comes back, as when an ability
	 *  is unmarked by hand. */
	function setCharField(field: ResolvedField, value: string) {
		const data = activeData;
		if (!data) return;
		const old = fieldValue(field, data.fields);
		if (value === old) return;
		data.fields = { ...(data.fields ?? {}), [field.id]: value };
		const notes: string[] = [];
		for (const a of (data.assets ?? []) as CharacterAsset[]) {
			const def = findAsset(a.assetId);
			const limits = def?.abilityMaxByField?.[field.id];
			if (!def || !limits || (a.customValues && field.id in a.customValues)) continue;
			const cap = limits[value] ?? Infinity;
			let kept = 0;
			let dropped = 0;
			const next = a.abilities.map((on) => {
				if (!on) return false;
				if (kept < cap) {
					kept++;
					return true;
				}
				dropped++;
				return false;
			});
			if (dropped) {
				a.abilities = next;
				notes.push(`unmarked ${dropped} ${dropped === 1 ? 'ability' : 'abilities'} on ${def.name}`);
			}
		}
		// Notes aren't logged as they're typed, as the background isn't.
		if (field.type === 'markdown') return;
		const show = (v: string) => escHtml(valueLabel(field, v) || '—');
		appendLog(
			charTitle(field.label),
			`<div>${escHtml(field.label)}: ${show(old)} → <strong>${show(value)}</strong>${notes.length ? `; ${notes.join('; ')}` : ''}</div>`,
		);
	}

	// ── Apply functions invoked by the action bus ─────────────────────────
	// All mutations target `activeData` (the v2 writable copy synced from
	// the store on character switch). Mirrors v1 CharacterSheet.applyResourceChange.

	/** A resource change's log line: `Health: 4 → 5 (+2)`, adding the top of
	 *  the range when that cut the change short: `Health: 4 → 5 (+2, max 5)`. */
	function resourceLine(label: string, old: number, delta: number, change: ResourceChange) {
		const cap = change.capped ? `, max ${change.max}` : '';
		return (
			`<div>${label}: ${old} → <strong>${change.next}</strong> ` +
			`(${delta > 0 ? '+' : '−'}${Math.abs(delta)}${cap})</div>`
		);
	}

	/**
	 * A resource link's change to a character's data: held to the resource's
	 * range (changeResource), logged under `title(label)`, and for supply,
	 * shared with the party. Returns the old and new values, or null for a
	 * key that isn't a resource or a change of nothing. A change the top of
	 * the range swallows whole still logs (`Health: 5 → 5 (+1, max 5)`), so
	 * the spent link says why nothing moved.
	 */
	function applyResourceTo(
		data: CharacterData,
		key: string,
		delta: number,
		title: (label: string) => string,
	): { old: number; next: number } | null {
		// Global counters (e.g. mana) live in data.globalValues as numeric strings.
		const gv = data.globalValues ?? {};
		const rec = data as unknown as Record<string, number>;
		const old = key === 'mana' ? parseInt(gv['mana'] ?? '0') : (rec[key] ?? 0);
		const change = changeResource(key, old, delta, data);
		if (!change || (change.next === old && !change.capped)) return null;
		const { next } = change;
		if (next !== old) {
			if (key === 'mana') data.globalValues = { ...gv, mana: String(next) };
			else rec[key] = next;
		}
		const label = key.charAt(0).toUpperCase() + key.slice(1);
		appendLog(title(label), resourceLine(label, old, delta, change));
		// Supply is party-wide — broadcast to every character.
		if (key === 'supply' && next !== old) setPartySupply(next);
		return { old, next };
	}

	function applyResourceChange(key: string, delta: number) {
		if (!activeData) return;
		const change = applyResourceTo(activeData, key, delta, charTitle);
		// Floor cascade — resource just landed at its minimum this change.
		if (!change || change.next === change.old || delta >= 0) return;
		const floorRule = FLOOR_RULES.find((r) => r.resource === key && change.next === r.floor);
		if (floorRule) {
			const entryId = crypto.randomUUID();
			const charId = activeCharId ?? '';
			appendLog(floorRule.logTitle, floorRule.logHtml({ charId, entryId }), entryId);
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
			appendLog(charTitle(label), `<div>${label}: ${old} → <strong>0</strong> (−${old})</div>`);
		}
	}

	/**
	 * Set (not add) a field to an absolute value: initiative, and `/vital`,
	 * `/bonds`, `/failures` with `=`. A resource is held to its range
	 * (setResource), and a value the range cuts says so in the log line,
	 * `Health: 4 → 5 (= 9, max 5)`, even when nothing moves. Supply, being
	 * party-wide, is shared with the party.
	 */
	function applySetTo(
		data: CharacterData,
		key: string,
		value: number,
		title: (label: string) => string,
	) {
		const rec = data as unknown as Record<string, number>;
		const old = rec[key] ?? 0;
		const next = setResource(key, value, data);
		if (next === old && next === value) return;
		if (next !== old) rec[key] = next;
		const label = key.charAt(0).toUpperCase() + key.slice(1);
		const display =
			key === 'initiative'
				? `${INITIATIVE_LABELS[old] ?? old} → <strong>${INITIATIVE_LABELS[next] ?? next}</strong>`
				: `${old} → <strong>${next}</strong>`;
		const num = (n: number) => (n < 0 ? `−${-n}` : String(n));
		const cut =
			next === value ? '' : ` (= ${num(value)}, ${value > next ? 'max' : 'min'} ${num(next)})`;
		appendLog(title(label), `<div>${label}: ${display}${cut}</div>`);
		if (key === 'supply' && next !== old) setPartySupply(next);
	}

	function applySet(key: string, value: number) {
		if (activeData) applySetTo(activeData, key, value, charTitle);
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
			applyResourceTo(data as unknown as CharacterData, action.key, action.value, title);
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
				appendLog(title(label), `<div>${label}: ${old} → <strong>0</strong> (−${old})</div>`);
			}
		} else if (action.type === 'set') {
			applySetTo(data as unknown as CharacterData, action.key, action.value, title);
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

	// New Vow dialog — the rank is chosen at creation and is immutable afterward
	// (the card shows it as a read-only pill), so it lives in a create dialog
	// mirroring New Journey rather than an inline field.
	const VOW_DIFFICULTIES: { value: VowDifficulty; label: string }[] = [
		{ value: 'troublesome', label: 'Troublesome' },
		{ value: 'dangerous', label: 'Dangerous' },
		{ value: 'formidable', label: 'Formidable' },
		{ value: 'extreme', label: 'Extreme' },
		{ value: 'epic', label: 'Epic' },
	];
	let newVowName = $state('');
	let newVowDifficulty = $state<VowDifficulty>('formidable');
	let newVowDialogRef = $state<{ open(): void; close(): void } | null>(null);

	function addVow() {
		if (!activeData) return;
		newVowName = '';
		newVowDifficulty = 'formidable';
		newVowDialogRef?.open();
	}
	function confirmAddVow() {
		if (!activeData) return;
		// Switch the card's tab strip to Vows so the new card renders.
		activeCard = 'vows';
		const label = VOW_DIFFICULTIES.find((d) => d.value === newVowDifficulty)?.label ?? '';
		const newVow: Vow = {
			id: crypto.randomUUID(),
			name: newVowName.trim(),
			difficulty: newVowDifficulty,
			ticks: 0,
			threat: '',
			menace: 0,
			notes: '',
			status: 'active',
		};
		activeData.vows = [...(activeData.vows ?? []), newVow];
		appendLog(charTitle('Vow'), `<div>Swore a new iron vow — <strong>${label}</strong></div>`);
	}
	function removeVow(id: string) {
		if (!activeData) return;
		activeData.vows = (activeData.vows ?? []).filter((v) => v.id !== id);
	}
	/** Forsaking a vow logs it with a link to Endure Stress at the vow's rank. */
	function logForsakeVow(vow: Vow) {
		const rank = VOW_FORSAKE_STRESS[vow.difficulty];
		const label = VOW_DIFFICULTIES.find((d) => d.value === vow.difficulty)?.label ?? vow.difficulty;
		const md =
			`Forsook the iron vow **${vow.name || 'Unnamed Vow'}** (${label}) — ` +
			`[Endure Stress](move:endure-stress?harm=${rank}) (−${rank}) for its rank.`;
		const entryId = crypto.randomUUID();
		const html = enrichOutcomeLinks(renderRich(md), entryId, activeCharId ?? '');
		appendLog(charTitle('Vow'), html, entryId);
	}

	// ── New-character dialog ──────────────────────────────────────────────
	// + Character (empty state) and "+ New character…" (combobox) both go
	// through the same one-field dialog so users name the character up
	// front instead of having to open the gear afterwards.
	let creatingChar = $state(false);
	let newCharDialogRef = $state<{ open(): void; close(): void } | null>(null);
	let newCharName = $state('');
	// Character-name randomizer: pick any Name-category oracle and roll it into
	// the field. NAME_ORACLES + rollByNameOracleKey mirror the New NPC dialog,
	// living in `characterRollups` so both dialogs stay in lock-step.
	let newCharNameOracle = $state('namesIronlander');
	// Also-randomize checklist + YRT region-of-origin — same shared UI + roll
	// pipeline as the New NPC dialog. Character has no dedicated slots for any
	// of these, so the results are folded into `background` as a markdown block.
	let newCharFlags = $state<CharacterRandomizeFlags>(defaultRandomizeFlags());
	/** New Character's draft of the extension fields (CharacterFields): only
	 *  what's been rolled or picked; Create rolls the rest. */
	let newCharFields = $state<Record<string, string>>({});
	// Stat allocator — the dialog opens with all-zero stats so Create is gated
	// until the user either rolls a starting array (Lodestar offers three) or
	// hand-types values. Values live in a plain object bound through
	// <StatAllocator>; on commit they ride along as `initialData` to
	// createCharacter, overriding DEFAULT_CHARACTER's 1/1/1/1/1.
	const zeroStats = (): Record<Stat, number> => ({
		edge: 0,
		heart: 0,
		iron: 0,
		shadow: 0,
		wits: 0,
	});
	let newCharStats = $state<Record<Stat, number>>(zeroStats());
	const statArrays = $derived(availableStatArrays(isSourceEnabled('lodestar')));
	// Create needs a name AND at least one non-zero stat — a blank stat row
	// would leave the caller with an under-hydrated character. Rolling any of
	// the three Lodestar arrays (or the base) satisfies this on its own.
	const canCreateChar = $derived(
		newCharName.trim().length > 0 &&
			(newCharStats.edge > 0 ||
				newCharStats.heart > 0 ||
				newCharStats.iron > 0 ||
				newCharStats.shadow > 0 ||
				newCharStats.wits > 0),
	);

	function rollNewCharName() {
		const key = newCharNameOracle;
		const usc = key.indexOf('_');
		const oracleKey = usc >= 0 ? key.slice(0, usc) : key;
		const col = usc >= 0 ? key.slice(usc + 1) : undefined;
		const r = rollOracle(oracleKey, getOracles(), col ? { stat: col } : undefined);
		newCharName = r.value ?? '';
		if (r.value)
			appendLog(
				r.title,
				`<div class="roll-line">Roll: d100 → ${r.roll}</div><div>Result: <strong>${r.value}</strong></div>`,
			);
	}

	/** Reset every draft field to its fresh-open state — called by
	 *  `addCharacter` on open and by the dialog's cancel/dismiss handlers so
	 *  a partially-filled dialog never survives across opens. Stats reset to
	 *  all zeros; Create is gated on ≥1 non-zero stat, so this is exactly
	 *  the "user must act before committing" gate the spec calls for. */
	function resetNewCharDraft() {
		newCharName = '';
		newCharFlags = defaultRandomizeFlags();
		newCharFields = {};
		newCharStats = zeroStats();
	}

	function addCharacter() {
		resetNewCharDraft();
		newCharDialogRef?.open();
	}

	async function _commitNewCharacter() {
		if (creatingChar) return;
		const nameToUse = newCharName.trim() || 'New Character';
		creatingChar = true;
		try {
			// Roll every flagged field now (concept-gated, YRT-gated), so the
			// resulting character opens with a filled-in background and a
			// composite log entry sits alongside the individual concept rolls.
			// The region of origin, religion and touched level are character
			// fields here (CharacterFields), not part of this roll: its Touched
			// box only rolls the features, below.
			const r = rollCharacterRandomizations(
				{ ...newCharFlags, touched: false, religion: false },
				{ yrtEnabled: isSourceEnabled('yrt') },
			);
			// Fields left empty are rolled now, in order, so the origin is set
			// before religion rolls on its country and the level before the
			// animal's `if` is checked.
			const fields: Record<string, string> = {};
			for (const [k, v] of Object.entries(newCharFields)) if (v.trim()) fields[k] = v.trim();
			for (const g of characterFieldGroups())
				for (const f of g.fields) {
					if (fields[f.id] || !fieldShown(f, fields, findCharacterField)) continue;
					const rolled = rollCharacterField(f, fields);
					if (rolled) fields[f.id] = rolled.value;
				}
			for (const g of characterFieldGroups())
				for (const f of g.fields)
					if (fields[f.id] && f.type !== 'markdown' && fieldShown(f, fields, findCharacterField))
						r.rolled.push([f.label, valueLabel(f, fields[f.id]!)]);
			logCreateRolls(`New Character — ${nameToUse}`, r.rolled);
			let md = randomizationsAsMarkdown(r, nameToUse);
			// YRT's features: how many depends on the touched level just set.
			const touched = findCharacterField('touched');
			if (isSourceEnabled('yrt') && newCharFlags.touched && touched) {
				const feats = rollYrtTouchedFeatures(valueLabel(touched, fieldValue(touched, fields)));
				if (feats) {
					appendLog(
						findOracle('touchedFeatures')?.title ?? 'Touched Features',
						touchedFeaturesLogHtml(feats),
					);
					const fmd = touchedFeaturesMd(feats);
					if (fmd) md = md ? `${md}\n\n${fmd}` : fmd;
				}
			}
			// Ride the just-rolled/edited stats along with the background prose
			// as `initialData` — createCharacter merges these into a fresh
			// character before the API create call, so DEFAULT_CHARACTER's 1s
			// never override what the user chose.
			// Also stash the typed name in `data.name`: charDisplayName() prefers
			// data.name over the row's stored `name`, so without this the dialog
			// name shows up as "New Character" (DEFAULT_CHARACTER's fallback) in
			// the spine until the user renames via the gear dialog.
			const initial: Record<string, unknown> = {
				name: nameToUse,
				edge: newCharStats.edge,
				heart: newCharStats.heart,
				iron: newCharStats.iron,
				shadow: newCharStats.shadow,
				wits: newCharStats.wits,
				// Enough to buy the three starting assets (Advance: 3 each).
				xp: STARTING_XP,
				fields,
			};
			if (md) initial.background = md;
			const newChar = await createCharacter(nameToUse, initial);
			activeCharId = newChar.id;
			activeCard = md ? 'background' : 'core';
		} catch (err) {
			console.error('[v2] createCharacter failed', err);
		} finally {
			creatingChar = false;
			resetNewCharDraft();
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
			<span class="ca-title-icon" aria-hidden="true">{@html appIcon('characters')}</span>
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
			<Combobox
				bind:open={charPickerOpen}
				items={sortedCharacters}
				getKey={(ch) => ch.id}
				getLabel={charDisplayName}
				activeKey={activeCharId}
				onselect={(ch) => selectChar(ch.id)}
				triggerValue={activeChar ? charDisplayName(activeChar) : ''}
				placeholder="— No characters yet —"
				searchPlaceholder="Search characters…"
				emptyText="No matching characters."
				ariaLabel="Switch or add character"
				class="ca-hdr-combobox"
				actions={charActions}
				tour="char-switcher"
			/>

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
					data-tour="char-add-vow"
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
					data-tour="char-add-asset"
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
			<span class="ca-empty-icon" aria-hidden="true">{@html appIcon('characters')}</span>
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
								<Tabs.Trigger value={tab.key} class="ca-tab" data-tour={`char-tab-${tab.key}`}
									>{tab.label}</Tabs.Trigger
								>
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
										tour="char-portrait"
									/>
								{/if}

								<MarkdownNotes
									bind:value={d.background}
									bind:editing={editingBackground}
									placeholder="Origin, upbringing, major traits…"
									rows={6}
									tour="char-bio"
								/>
							</div>
						{:else if activeCard === 'core'}
							<div class="ca-card-section">
								<SheetCore
									charId={activeChar.id}
									data={d}
									onmomentumreset={() =>
										applyResourceChange('momentum', momentumReset(d) - d.momentum)}
								/>
							</div>
						{:else if activeCard === 'details'}
							<!-- Fields the core rules and extensions add to the character
							     (Region of origin; with YRT, Religion, Touched and Animal),
							     under each extension's heading. -->
							<div class="ca-card-section">
								<CharacterFields mode="sheet" values={d.fields} onset={setCharField} />
							</div>
						{:else if activeCard === 'vows'}
							<div class="ca-card-section">
								<SheetVows data={d} onremove={removeVow} onforsake={logForsakeVow} />
							</div>
						{:else if activeCard === 'assets'}
							<div class="ca-card-section">
								<SheetAssets data={d} onopen={openAssetDialog} />
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
				<Dialog.Overlay
					class="dialog-overlay ca-asset-overlay"
					style="z-index: {overlayZ(stackDepth)}"
					onclick={closeAssetDialog}
				/>
				<Dialog.Content
					bind:ref={dialogEl}
					class="ca-asset-dialog"
					data-tour="asset-card"
					style="z-index: {contentZ(stackDepth)}"
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
							const h = ml.dataset['harm'];
							document.dispatchEvent(
								new CustomEvent('ironledger:open-move', {
									detail: {
										id: ml.dataset['id'] ?? '',
										harm: h != null && h !== '' ? Number(h) : undefined,
									},
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
						characterFields={activeData.fields}
						blockedReason={dialogMode === 'edit' ? assetBlocked(def) : null}
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
	draggable
	maxHeight="80dvh"
	confirmLabel="Create"
	confirmClass="btn-primary"
	confirmDisabled={!canCreateChar}
	accentColor="var(--text-accent)"
	onconfirm={_commitNewCharacter}
	oncancel={resetNewCharDraft}
	ondismiss={resetNewCharDraft}
	tour="new-char-dialog"
>
	<!-- The name field and its oracle roller, grouped so the Create-a-
	     character tutorial (#lib/tutorials) can highlight them together. -->
	<div class="nc-name" data-tour="new-char-name">
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
					// Enter commits only when the Create button would be enabled —
					// same gate as the button (name + ≥1 non-zero stat) so a hasty
					// Enter with unrolled stats doesn't leak an under-hydrated
					// character through.
					if (e.key === 'Enter' && canCreateChar) {
						e.preventDefault();
						newCharDialogRef?.close();
						void _commitNewCharacter();
					}
				}}
			/>
		</label>
		<div class="co-field">
			<span class="co-field-label">Use a name oracle to roll a random name</span>
			<div class="co-name-row">
				<Select bind:value={newCharNameOracle} options={NAME_ORACLES} />
				<button
					class="dice-btn"
					type="button"
					onclick={rollNewCharName}
					use:tooltip={'Roll a name'}
					aria-label="Random name"
					data-tour="roll-name">{@html diceD6Svg}</button
				>
			</div>
		</div>
	</div>

	<div data-tour="new-char-stats">
		<StatAllocator bind:stats={newCharStats} arrays={statArrays} />
	</div>

	<CharacterFields
		mode="create"
		values={newCharFields}
		onset={(f, v) => (newCharFields = { ...newCharFields, [f.id]: v })}
	/>

	<RandomizeBlock bind:flags={newCharFlags} characterFields />
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

<!-- New Vow dialog — name + rank (rank is fixed at creation, shown read-only
     on the card afterward). Mirrors New Journey. -->
<ConfirmDialog
	bind:this={newVowDialogRef}
	title="New Vow"
	draggable
	tour="new-vow-dialog"
	confirmLabel="Swear Vow"
	confirmClass="btn-primary"
	cancelLabel="Cancel"
	accentColor="var(--text-accent)"
	onconfirm={confirmAddVow}
>
	<label class="co-field" style="margin-bottom: 10px;">
		<span class="co-field-label">Vow name</span>
		<input class="co-input" type="text" bind:value={newVowName} placeholder="New Vow" />
	</label>
	<label class="co-field">
		<span class="co-field-label">Rank</span>
		<Select bind:value={newVowDifficulty} options={VOW_DIFFICULTIES} ariaLabel="Vow rank" />
	</label>
</ConfirmDialog>

<style>
	.ca-area {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
	}

	/* New Character dialog: the name field + its oracle roller as one block
	   (a tutorial target), spaced like the dialog body's other rows. */
	.nc-name {
		display: flex;
		flex-direction: column;
		gap: 8px;
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
	/* Empty states — the deck's (no characters) and the Vows and Assets tabs'
	   (sheet/), so global under .ca-area: an icon and a witty prompt, mirroring
	   FoesArea/CommunitiesArea. */
	.ca-area :global(.ca-empty) {
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
	.ca-area :global(.ca-empty-icon) {
		display: flex;
		width: 48px;
		height: 48px;
		opacity: 0.25;
	}
	.ca-area :global(.ca-empty-icon svg) {
		width: 100%;
		height: 100%;
		fill: currentColor;
	}
	.ca-area :global(.ca-empty-text) {
		margin: 0;
		line-height: 1.5;
		max-width: 30ch;
	}
	/* The header's add button, drawn into the empty state's text ("Click + ⛓
	   to swear on iron"): it has no label, so the text shows what to look for. */
	.ca-area :global(.ca-empty-key) {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		padding: 2px 5px;
		margin: 0 1px;
		border: 1px solid var(--border-mid);
		border-radius: 3px;
		background: var(--bg-control);
		color: var(--text-muted);
		line-height: 1;
		vertical-align: middle;
	}
	.ca-area :global(.ca-empty-key-plus) {
		font-weight: 700;
		font-size: 0.85rem;
	}
	.ca-area :global(.ca-empty-key svg),
	.ca-area :global(.ca-empty-key svg path) {
		width: 11px;
		height: 11px;
		fill: currentColor;
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

	/* ── Asset detail dialog ── transparent shell; the AssetCard inside owns
	   all visual structure (header, abilities, custom fields) so the popup
	   matches v1's expanded asset look exactly. The dialog itself uses no
	   flex container — content sizes it naturally — and overflow scrolling
	   is delegated to the .asset-body with a viewport-relative max-height.
	   This avoids a flex chain (`display: flex` + `min-height: 0` children)
	   that collapsed the dialog to a thin line on iOS Safari. */
	/* bits-ui portals Content + Overlay to <body>; scope everything
	   globally. z-index is set inline via dialogStack — see <script>. */
	/* The backdrop is the shared .dialog-overlay (app.css), fading in. */
	:global(.ca-asset-overlay) {
		animation: ca-asset-backdrop-in 0.5s ease-out;
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
