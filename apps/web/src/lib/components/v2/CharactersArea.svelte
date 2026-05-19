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
	import { getCharacters, isCharacterLoading, createCharacter, deleteCharacter, flushCharacterToApi, persistCharacterNow, setPartySupply } from '$lib/characterStore.svelte.js';
	import { setActiveDiceCtx } from '$lib/diceContext.svelte.js';
	import { tooltip } from '$lib/actions/tooltip.js';
	import { findAsset, isAssetsLoading, getAssets } from '$lib/assetStore.svelte.js';
	import { isDelveEnabled }                    from '$lib/expansionStore.svelte.js';
	import { hydrateCharacterInPlace, progressText, maxMomentum, momentumReset } from '$lib/character.js';
	import { renderNote }                        from '$lib/markdown.js';
	import hornedHelmSvg from '$icons/horned-helm.svg?raw';
	import charactersIconSvg from '$icons/Characters.svg?raw';
	import type { CharacterData, CharacterAsset } from '$lib/types.js';
	import AssetCard      from '$lib/components/AssetCard.svelte';
	import AssetPicker    from '$lib/components/AssetPicker.svelte';
	import StatControl    from '$lib/components/StatControl.svelte';
	import ResourceTile   from '$lib/components/ResourceTile.svelte';
	import MomentumTile   from '$lib/components/MomentumTile.svelte';
	import ProgressTrack  from '$lib/components/ProgressTrack.svelte';
	import ConfirmDialog  from '$lib/components/ConfirmDialog.svelte';
	import VowCard        from '$lib/components/VowCard.svelte';
	import DebilitiesSection from '$lib/components/DebilitiesSection.svelte';
	import {
		appendLog, SESSION_LOG_ID,
		getXpSpendNonce, drainXpSpend,
		getActionNonce, drainActions,
		type LogAction,
	} from '$lib/log.svelte.js';
	import { FLOOR_RULES, DEBILITY_MOMENTUM_TITLE } from '$lib/cascadeRules.js';
	import type { Vow } from '$lib/types.js';
	import iconHealth     from '$icons/icon-health.svg?raw';
	import iconSpirit     from '$icons/icon-spirit.svg?raw';
	import iconSupply     from '$icons/icon-supply.svg?raw';
	import iconStar       from '$icons/star-solid-full.svg?raw';
	import trashSvg       from '$icons/trash-solid-full.svg?raw';
	import swordSvg       from '$icons/sword-solid-full.svg?raw';
	// Counter icons — same map as v1 AssetCard.COUNTER_ICONS. The asset
	// definition's customField.icon string keys into this map.
	import iconHeart      from '$icons/icon-heart.svg?raw';
	import iconSkull      from '$icons/skull-crossbones-solid-full.svg?raw';
	import iconShield     from '$icons/shield-halved-solid.svg?raw';
	import iconEye        from '$icons/eye-solid.svg?raw';
	import iconMoon       from '$icons/moon-solid.svg?raw';
	import iconSun        from '$icons/sun-solid.svg?raw';
	import iconDice       from '$icons/dice-d10-light.svg?raw';
	import iconNote       from '$icons/note-sticky-solid.svg?raw';
	import iconSackDollar from '$icons/sack-dollar-solid-full.svg?raw';
	import iconMana       from '$icons/icon-mana.svg?raw';
	import iconPuppet     from '$icons/puppet-solid.svg?raw';
	import iconGolem      from '$icons/rock-golem.svg?raw';
	import { headingText } from '$lib/fontStore.svelte.js';

	let { showTitle = true }: { showTitle?: boolean } = $props();

	const COUNTER_ICONS: Record<string, string> = {
		'heart':                iconHeart,
		'skull-and-crossbones': iconSkull,
		'sword':                swordSvg,
		'shield':               iconShield,
		'eye':                  iconEye,
		'moon':                 iconMoon,
		'sun':                  iconSun,
		'dice':                 iconDice,
		'note':                 iconNote,
		'sack-dollar':          iconSackDollar,
		'mana':                 iconMana,
		'puppet':               iconPuppet,
		'rock-golem':           iconGolem,
	};
	import shieldSvg      from '$icons/shield-halved-solid.svg?raw';

	type CardKey = 'background' | 'core' | 'vows' | 'assets' | 'status';
	const CARD_LABELS: { key: CardKey; label: string }[] = [
		{ key: 'core',       label: 'Core' },
		{ key: 'background', label: 'Description' },
		{ key: 'vows',       label: 'Vows' },
		{ key: 'assets',     label: 'Assets' },
		{ key: 'status',     label: 'Status' },
	];

	/** Category colour for asset tabs — mirrors AssetCard's CAT_COLOR. */
	const CAT_COLOR: Record<string, string> = {
		'Combat Talent': 'var(--color-iron)',
		'Path':          'var(--color-edge)',
		'Companion':     'var(--color-heart)',
		'Ritual':        'var(--color-mana)',
		'Touched':       'var(--color-touched)',
	};

	let activeCharId  = $state<string | null>(null);
	let activeCard    = $state<CardKey>('core');
	let dialogAssetId = $state<string | null>(null);
	let dialogEl      = $state<HTMLDialogElement | null>(null);
	let pickerOpen    = $state(false);

	// Background card edit state
	let editingName       = $state(false);
	let editingBackground = $state(false);
	let nameBeforeEdit    = $state('');
	let nameInputEl       = $state<HTMLInputElement | null>(null);
	let bgTextareaEl      = $state<HTMLTextAreaElement | null>(null);
	$effect(() => { if (editingName && nameInputEl) { nameInputEl.focus(); nameInputEl.select(); } });
	$effect(() => { if (editingBackground && bgTextareaEl) bgTextareaEl.focus(); });

	const characters = $derived(getCharacters());
	const loading    = $derived(isCharacterLoading() || isAssetsLoading());

	// Auto-select the first character once data has loaded.
	$effect(() => {
		if (!activeCharId && characters.length > 0) {
			activeCharId = characters[0].id;
		}
	});

	const activeChar = $derived(characters.find(c => c.id === activeCharId));

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
	let _saveTimer: ReturnType<typeof setTimeout> | null = null;
	let _pendingId: string | null = null;
	$effect(() => {
		const ac = activeChar;
		if (!ac) return;
		// Subscribe to deep data changes via snapshot.
		$state.snapshot(ac.data);

		const charId = ac.id;
		_pendingId = charId;
		if (_saveTimer) clearTimeout(_saveTimer);
		_saveTimer = setTimeout(() => {
			_saveTimer = null;
			_pendingId = null;
			flushCharacterToApi(charId);
		}, 1500);

		return () => {
			// On char switch or unmount, flush pending save so edits aren't dropped.
			if (_saveTimer && _pendingId) {
				clearTimeout(_saveTimer);
				const id = _pendingId;
				_saveTimer = null;
				_pendingId = null;
				flushCharacterToApi(id);
			}
		};
	});

	// Publish the active character to the global dice context so the layout's
	// MovesDialog / DiceRollerDialog read live data from this area's selection.
	$effect(() => {
		if (activeChar && activeData) {
			setActiveDiceCtx({ charId: activeChar.id, charName: activeData.name || 'Unnamed', data: activeData });
		} else {
			setActiveDiceCtx(null);
		}
	});

	// Find the first `counter` custom field on the asset (e.g. Mana for
	// Compulsion, Health for a companion) and return its short label plus
	// the current value resolved against the effective max — accounting for
	// per-ability-level maxValue arrays. Returns null when the asset has no
	// counter so the card just shows its category.
	function assetCounter(asset: CharacterAsset): { iconSvg: string; label: string; value: number; max: number } | null {
		const def = findAsset(asset.assetId);
		const field = (def?.customFields ?? []).find((f) => f.type === 'counter');
		if (!def || !field || field.maxValue === undefined) return null;
		const raw = asset.customValues?.[field.id];
		const dflt = typeof field.default === 'number' ? field.default : 0;
		const value = raw != null && raw !== '' ? Number(raw) : dflt;
		let max: number;
		if (typeof field.maxValue === 'number') {
			max = field.maxValue;
		} else {
			let lastEnabled = 0;
			for (let i = 0; i < asset.abilities.length; i++) if (asset.abilities[i]) lastEnabled = i;
			const arr = field.maxValue as number[];
			max = arr[Math.min(lastEnabled, arr.length - 1)] ?? 0;
		}
		const iconSvg = (field.icon && COUNTER_ICONS[field.icon]) || iconHeart;
		return { iconSvg, label: field.label, value, max };
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
		appendLog(SESSION_LOG_ID, `${name} — Debilities`,
			`<div>${label}: <strong>${active ? 'Activated' : 'Cleared'}</strong></div>`);
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
			const gv  = data.globalValues ?? {};
			const old = parseInt(gv['mana'] ?? '0');
			const next = Math.max(0, Math.min(10, old + delta));
			if (next !== old) {
				data.globalValues = { ...gv, mana: String(next) };
				appendLog(SESSION_LOG_ID, charTitle('Mana'),
					`<div>Mana: ${old} → <strong>${next}</strong> (${delta > 0 ? '+' : ''}${delta})</div>`);
			}
			return;
		}
		const rec = data as unknown as Record<string, number>;
		const old = rec[key] ?? 0;
		let next: number;
		switch (key) {
			case 'momentum': next = Math.max(-6, Math.min(maxMomentum(data), old + delta)); break;
			case 'health':
			case 'spirit':
			case 'supply':
			case 'xp':       next = Math.max(0, Math.min(999, old + delta)); break;
			case 'bonds':
			case 'failures': next = Math.max(0, Math.min(40, old + delta)); break;
			default:         return;
		}
		if (next !== old) {
			rec[key] = next;
			const label = key.charAt(0).toUpperCase() + key.slice(1);
			appendLog(SESSION_LOG_ID, charTitle(label),
				`<div>${label}: ${old} → <strong>${next}</strong> (${delta > 0 ? '+' : ''}${delta})</div>`);
			// Supply is party-wide — broadcast to every character.
			if (key === 'supply') setPartySupply(next);
			// Floor cascade — resource just landed at its minimum this change.
			if (delta < 0) {
				const charId = activeCharId ?? '';
				const floorRule = FLOOR_RULES.find(r => r.resource === key && next === r.floor);
				if (floorRule) {
					const entryId = crypto.randomUUID();
					appendLog(SESSION_LOG_ID, floorRule.logTitle,
						floorRule.logHtml({ charId, entryId }), entryId);
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
			appendLog(SESSION_LOG_ID, charTitle('Debilities'),
				`<div>${label}: <strong>${active ? 'Marked' : 'Cleared'}</strong></div>`);
			// Cascade — marking a debility lowers the momentum cap.
			if (active) {
				const newMax   = maxMomentum(data);
				const resetVal = momentumReset(data);
				if (data.momentum > newMax) {
					const cappedFrom = data.momentum;
					const delta      = newMax - cappedFrom;
					const entryId    = crypto.randomUUID();
					const charId     = activeCharId ?? '';
					const html =
						`<p>Max momentum reduced to <strong>${newMax}</strong>. ` +
						`<a class="resource-link" data-resource="momentum" data-value="${delta}" ` +
						`data-entry-id="${entryId}" data-char-id="${charId}">` +
						`Reduce momentum to ${newMax}</a> ` +
						`(currently ${cappedFrom}). Reset value is now <strong>${resetVal}</strong>.</p>`;
					appendLog(SESSION_LOG_ID, DEBILITY_MOMENTUM_TITLE, html, entryId);
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
			appendLog(SESSION_LOG_ID, charTitle(label),
				`<div>${label} track cleared (${old} ticks → 0)</div>`);
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
			const INITIATIVE_NAMES_ACTIVE: Record<number, string> = { 0: 'None', 1: 'Character', 2: 'Foe' };
			const display = key === 'initiative'
				? `${INITIATIVE_NAMES_ACTIVE[old] ?? old} → <strong>${INITIATIVE_NAMES_ACTIVE[value] ?? value}</strong>`
				: `${old} → <strong>${value}</strong>`;
			appendLog(SESSION_LOG_ID, charTitle(label),
				`<div>${label}: ${display}</div>`);
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
			const key   = action.key;
			const delta = action.value as number;
			if (key === 'mana') {
				const gv  = (data.globalValues as Record<string, string>) ?? {};
				const old = parseInt(gv['mana'] ?? '0');
				const next = Math.max(0, Math.min(10, old + delta));
				if (next !== old) {
					data.globalValues = { ...gv, mana: String(next) };
					appendLog(SESSION_LOG_ID, title('Mana'),
						`<div>Mana: ${old} → <strong>${next}</strong> (${delta > 0 ? '+' : ''}${delta})</div>`);
				}
				return;
			}
			const rec = data as unknown as Record<string, number>;
			const old = rec[key] ?? 0;
			let next: number;
			switch (key) {
				case 'momentum': next = Math.max(-6, Math.min(maxMomentum(data as unknown as import('$lib/types.js').CharacterData), old + delta)); break;
				case 'health':
				case 'spirit':
				case 'supply':
				case 'xp':       next = Math.max(0, Math.min(999, old + delta)); break;
				case 'bonds':
				case 'failures': next = Math.max(0, Math.min(40, old + delta)); break;
				default: return;
			}
			if (next !== old) {
				rec[key] = next;
				const label = key.charAt(0).toUpperCase() + key.slice(1);
				appendLog(SESSION_LOG_ID, title(label),
					`<div>${label}: ${old} → <strong>${next}</strong> (${delta > 0 ? '+' : ''}${delta})</div>`);
				// Supply is party-wide — broadcast to every character.
				if (key === 'supply') setPartySupply(next);
			}
		} else if (action.type === 'debility') {
			const rec    = data as unknown as Record<string, boolean>;
			if (rec[action.key] === undefined) return;
			const active = (action.value as number) === 1;
			if (rec[action.key] !== active) {
				rec[action.key] = active;
				const label = action.key.charAt(0).toUpperCase() + action.key.slice(1);
				appendLog(SESSION_LOG_ID, title('Debilities'),
					`<div>${label}: <strong>${active ? 'Marked' : 'Cleared'}</strong></div>`);
			}
		} else if (action.type === 'reset-track') {
			const rec = data as unknown as Record<string, number>;
			const old = rec[action.key] ?? 0;
			if (old !== 0) {
				rec[action.key] = 0;
				const label = action.key.charAt(0).toUpperCase() + action.key.slice(1);
				appendLog(SESSION_LOG_ID, title(label),
					`<div>${label} track cleared (${old} ticks → 0)</div>`);
			}
		} else if (action.type === 'set') {
			const rec  = data as unknown as Record<string, number>;
			const old  = rec[action.key] ?? 0;
			const next = action.value as number;
			if (old !== next) {
				rec[action.key] = next;
				const label   = action.key.charAt(0).toUpperCase() + action.key.slice(1);
				const display = action.key === 'initiative'
					? `${_INITIATIVE_NAMES[old] ?? old} → <strong>${_INITIATIVE_NAMES[next] ?? next}</strong>`
					: `${old} → <strong>${next}</strong>`;
				appendLog(SESSION_LOG_ID, title(label),
					`<div>${label}: ${display}</div>`);
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
				const old  = activeData.xp;
				const next = Math.max(0, old - amount);
				if (next !== old) {
					activeData.xp = next;
					appendLog(SESSION_LOG_ID, charTitle('Experience'),
						`<div>XP spent: <strong>−${amount}</strong> (${old} → <strong>${next}</strong>)</div>`);
				}
			}
		}
		// Non-active characters — apply directly and persist.
		for (const char of getCharacters()) {
			if (char.id === activeCharId) continue;
			const amount = drainXpSpend(char.id);
			if (amount <= 0) continue;
			const data = $state.snapshot(char.data) as Record<string, unknown>;
			const old  = (data.xp as number) ?? 0;
			const next = Math.max(0, old - amount);
			if (next !== old) {
				data.xp = next;
				const name = char.name || 'Character';
				appendLog(SESSION_LOG_ID, `${name} — Experience`,
					`<div>XP spent: <strong>−${amount}</strong> (${old} → <strong>${next}</strong>)</div>`);
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
				if      (action.type === 'resource')    applyResourceChange(action.key, action.value);
				else if (action.type === 'debility')    applyDebilityToggle(action.key, action.value);
				else if (action.type === 'reset-track') applyResetTrack(action.key);
				else if (action.type === 'set')         applySet(action.key, action.value);
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

	function openAssetDialog(id: string, evt: MouseEvent) {
		dialogAssetId = id;
		// Capture the clicked tab's centre so the dialog can grow from there.
		const tab = (evt.currentTarget as HTMLElement | null)?.getBoundingClientRect();
		queueMicrotask(() => {
			if (!dialogEl) return;
			if (tab) {
				const offsetX = (tab.left + tab.width / 2) - window.innerWidth / 2;
				const offsetY = (tab.top + tab.height / 2) - window.innerHeight / 2;
				dialogEl.style.setProperty('--ca-origin-x', `${offsetX}px`);
				dialogEl.style.setProperty('--ca-origin-y', `${offsetY}px`);
			}
			dialogEl.showModal();
		});
	}

	function closeAssetDialog() {
		dialogEl?.close();
		dialogAssetId = null;
	}

	let deleteDialogRef = $state<{ open(): void; close(): void } | null>(null);
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

	let newlyCreatedVowId = $state('');
	function addVow() {
		if (!activeData) return;
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
		appendLog(SESSION_LOG_ID, charTitle('Vow'),
			`<div>Swore a new iron vow — <strong>Formidable</strong></div>`);
	}
	function removeVow(id: string) {
		if (!activeData) return;
		activeData.vows = (activeData.vows ?? []).filter(v => v.id !== id);
	}

	let creatingChar = $state(false);
	async function addCharacter() {
		if (creatingChar) return;
		creatingChar = true;
		try {
			const newChar = await createCharacter();
			activeCharId = newChar.id;
			activeCard = 'background';
		} catch (err) {
			console.error('[v2] addCharacter failed', err);
		} finally {
			creatingChar = false;
		}
	}

	function handlePortrait(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file || !activeChar) return;
		const reader = new FileReader();
		reader.onload = () => {
			const img = new Image();
			img.onload = () => {
				const canvas = document.createElement('canvas');
				const size = Math.min(img.width, img.height, 256);
				canvas.width = size;
				canvas.height = size;
				const ctx = canvas.getContext('2d')!;
				const side = Math.min(img.width, img.height);
				const sx = (img.width  - side) / 2;
				const sy = (img.height - side) / 2;
				ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
				if (activeChar) {
					(activeChar.data as Record<string, unknown>).portrait = canvas.toDataURL('image/jpeg', 0.85);
				}
			};
			img.src = reader.result as string;
		};
		reader.readAsDataURL(file);
	}

	function startEditName() {
		if (!activeData) return;
		nameBeforeEdit = activeData.name ?? '';
		editingName = true;
	}
	function commitName() { editingName = false; }
	function cancelName() {
		if (activeData) activeData.name = nameBeforeEdit;
		editingName = false;
	}

	function handleAddAsset(assetId: string) {
		// activeData is a $derived view of activeChar.data — mutating it
		// writes through the store proxy and triggers the deep-snapshot
		// auto-save effect.
		if (!activeData || !activeChar) return;
		const def = findAsset(assetId);
		if (!def) return;
		const arr = (activeData.assets ?? []) as CharacterAsset[];
		if (arr.some(a => a.assetId === assetId)) return;

		// Exclusive group enforcement (mirrors v1 AssetsSection.addAsset):
		// block adding a second asset in the same group. Surface the
		// conflict via a transient log entry so the user sees why nothing
		// happened.
		if (def.exclusiveGroup) {
			const allDefs  = getAssets();
			const conflict = arr.find(owned => {
				const ownedDef = allDefs.find(a => a.id === owned.assetId);
				return ownedDef?.exclusiveGroup === def.exclusiveGroup;
			});
			if (conflict) {
				const conflictDef = allDefs.find(a => a.id === conflict.assetId);
				appendLog(SESSION_LOG_ID, charTitle('Assets'),
					`<div>Can't add <strong>${def.name}</strong>: only one ${def.exclusiveGroup} asset may be active at a time (already have <strong>${conflictDef?.name ?? conflict.assetId}</strong>).</div>`);
				pickerOpen = false;
				return;
			}
		}

		const newEntry: CharacterAsset = {
			assetId,
			abilities: def.abilities.map((ab) => ab.enabled),
		};
		activeData.assets = [...arr, newEntry];

		// Log asset acquisition with an XP-cost link (3 XP per v1 pricing).
		// Clicking the link triggers the XP spend bus which our drain
		// effect already handles.
		const entryId = crypto.randomUUID();
		const xpLink  = `<a class="xp-cost-link" data-entry-id="${entryId}" data-cost="3" data-char-id="${activeChar.id}" href="#">−3 experience</a>`;
		appendLog(SESSION_LOG_ID, charTitle('Assets'),
			`<div>Asset added: <strong>${def.name}</strong> <em>(${def.category})</em> ${xpLink}</div>`,
			entryId);

		pickerOpen = false;
	}
</script>

<div class="ca-area">
	<!-- Header -->
	<header class="ca-header">
		{#if showTitle}
			<span class="ca-title-icon" aria-hidden="true">{@html charactersIconSvg}</span>
			<span class="ca-title">{headingText('Characters')}</span>
		{/if}

		<!-- Toolbar actions — apply to the active character. + Asset / + Vow
		     are disabled when there's no character. Delete lives next to the
		     character name (not here) so it's unambiguous which character it
		     targets and isn't confused with vow deletion. -->
		<div class="ca-header-actions">
			<button
				class="btn ca-hdr-btn"
				onclick={addCharacter}
				disabled={creatingChar}
				title="Add character"
			>+ Character</button>
			<button
				class="btn ca-hdr-btn"
				onclick={() => (pickerOpen = true)}
				disabled={!activeChar}
				title="Add asset"
			>+ Asset</button>
			<button
				class="btn ca-hdr-btn"
				onclick={addVow}
				disabled={!activeChar}
				title="Add vow"
			>+ Vow</button>
		</div>
	</header>

	{#if loading}
		<div class="ca-loading">Loading…</div>
	{:else if characters.length === 0}
		<div class="ca-empty">
			<span class="ca-empty-icon" aria-hidden="true">{@html charactersIconSvg}</span>
			<p class="ca-empty-text">Your saga begins not with a battle, but with a button. Click <strong>+ CHARACTER</strong> to start.</p>
		</div>
	{:else}
		<div class="ca-body">
			<!-- Spine strip (left). Add-character moved to the header toolbar. -->
			<nav class="ca-spines" aria-label="Character decks">
				{#each characters as char (char.id)}
					{@const cn = ((char.data as Record<string, unknown>)?.name as string) || char.name}
					<button
						class="ca-spine"
						class:ca-spine--active={char.id === activeCharId}
						data-char-id={char.id}
						onclick={() => selectChar(char.id)}
						use:tooltip={cn}
					>
						<span class="ca-spine-name">{cn}</span>
					</button>
				{/each}
			</nav>

			<!-- Active deck stage (right) -->
			{#if activeChar && activeData}
				{@const d = activeData}
				<!-- Character name + actions row sits ABOVE the stage so it's
				     visible on every tab. Name: click to rename / Enter / Escape.
				     Trash button to the right opens the V1 ConfirmDialog. -->
				<div class="ca-stage-header">
					{#if editingName}
						<input
							bind:this={nameInputEl}
							class="ca-stage-name-input"
							type="text"
							bind:value={d.name}
							placeholder="Character name"
							onblur={commitName}
							onkeydown={(e) => {
								if (e.key === 'Enter') nameInputEl?.blur();
								if (e.key === 'Escape') cancelName();
							}}
						/>
					{:else}
						<button
							type="button"
							class="ca-stage-name ca-card-name--editable"
							title="Click to rename"
							onclick={startEditName}
						>{headingText(d.name || activeChar.name || 'Unnamed')}</button>
					{/if}
					<button
						class="btn btn-icon icon-btn ca-stage-delete-btn"
						onclick={() => deleteDialogRef?.open()}
						use:tooltip={'Delete character'}
						aria-label="Delete character"
					>{@html trashSvg}</button>
				</div>
			{/if}
			<div class="ca-stage">
				{#if activeChar && activeData}
					{@const d = activeData}
					<!-- Card tab strip -->
					<div class="ca-tabs" role="tablist">
						{#each CARD_LABELS as tab (tab.key)}
							<button
								role="tab"
								class="ca-tab"
								class:ca-tab--active={activeCard === tab.key}
								aria-selected={activeCard === tab.key}
								onclick={() => (activeCard = tab.key)}
							>{tab.label}</button>
						{/each}
					</div>
					<!-- Active card content -->
					<div class="ca-card" role="tabpanel">
						{#if activeCard === 'background'}
							<div class="ca-card-section ca-bg-section">
								<!-- Portrait — click to upload + crop. Floats right so background
								     text wraps around it (markdown-aware). Hidden while the
								     background is being edited so the textarea gets the full
								     card width; reappears on blur. -->
								{#if !editingBackground}
									<label class="ca-bg-portrait-label" title="Click to change portrait">
										{#if d.portrait}
											<img
												class="ca-bg-portrait"
												src={d.portrait}
												alt="Portrait of {d.name || activeChar.name}"
											/>
										{:else}
											<div class="ca-bg-portrait ca-bg-portrait--placeholder" aria-hidden="true">
												{@html hornedHelmSvg}
											</div>
										{/if}
										<input
											type="file"
											accept="image/*"
											class="ca-bg-portrait-input"
											onchange={handlePortrait}
											aria-label="Upload portrait"
										/>
									</label>
								{/if}

								<!-- Editable background — click renders a textarea, otherwise
								     the markdown-rendered text is shown. -->
								{#if editingBackground}
									<textarea
										bind:this={bgTextareaEl}
										bind:value={d.background}
										placeholder="Background, history, or notes…  (markdown supported)"
										class="ca-card-bg-input"
										rows="6"
										onblur={() => (editingBackground = false)}
									></textarea>
								{:else}
									<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
									<div
										class="ca-card-bg ca-card-bg--display"
										class:ca-card-bg--empty={!d.background?.trim()}
										role="button"
										tabindex="0"
										title="Click to edit (markdown supported)"
										onclick={() => (editingBackground = true)}
										onkeydown={(e) => { if (e.key === 'Enter') editingBackground = true; }}
									>
										{#if d.background?.trim()}
											{@html renderNote(d.background)}
										{:else}
											<span class="ca-card-bg-placeholder">Background, history, or notes…</span>
										{/if}
									</div>
								{/if}
							</div>
						{:else if activeCard === 'core'}
							<div class="ca-card-section">
								<!-- Initiative — None / Foe / Character. Mirrors V1's
								     cs-init-section. Stored on data.initiative
								     (0 = none, 1 = character, 2 = foe). -->
								<div class="ca-init-section">
									<span class="ca-init-label">Initiative</span>
									<div class="ca-init-toggle" role="group" aria-label="Initiative">
										<button
											class="ca-init-btn"
											class:ca-init-btn--active={(d.initiative ?? 0) === 0}
											onclick={() => { d.initiative = 0; }}
											title="No initiative"
										>None</button>
										<button
											class="ca-init-btn ca-init-btn--foe"
											class:ca-init-btn--active={(d.initiative ?? 0) === 2}
											onclick={() => { d.initiative = 2; }}
											title="Foe has initiative"
										>{@html shieldSvg}Foe</button>
										<button
											class="ca-init-btn ca-init-btn--you"
											class:ca-init-btn--active={(d.initiative ?? 0) === 1}
											onclick={() => { d.initiative = 1; }}
											title="You have initiative"
										>{@html swordSvg}Character</button>
									</div>
								</div>

								<!-- Stats — same StatControl tiles as v1, with the same color vars and stat-icon mapping.
								     Wrapped with a vertical "STATS" side label on the LHS (V1 stats-row-wrapper pattern). -->
								<div class="ca-stats-wrapper">
									<div class="ca-side-label">Stats</div>
									<div class="ca-stats-row">
										<StatControl
											label="Edge"   bind:value={d.edge}   color="var(--color-edge)"
											tooltip="Quickness, agility, and prowess in ranged combat"
										/>
										<StatControl
											label="Heart"  bind:value={d.heart}  color="var(--color-heart)"
											tooltip="Courage, willpower, empathy, sociability, and loyalty"
										/>
										<StatControl
											label="Iron"   bind:value={d.iron}   color="var(--color-iron)"
											tooltip="Physical strength, endurance, and prowess in close combat"
										/>
										<StatControl
											label="Shadow" bind:value={d.shadow} color="var(--color-shadow)"
											tooltip="Sneakiness, deceptiveness, and cunning"
										/>
										<StatControl
											label="Wits"   bind:value={d.wits}   color="var(--color-wits)"
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
									<p class="ca-empty-mini">No vows yet — use “+ Vow” in the header.</p>
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
									<p class="ca-empty-mini">No assets yet — use “+ Asset” in the header.</p>
								{:else}
									<div class="ca-asset-grid" aria-label="Assets">
										{#each d.assets ?? [] as a (a.assetId)}
											{@const def = findAsset(a.assetId)}
											{@const catColor = CAT_COLOR[def?.category ?? ''] ?? 'var(--text-muted)'}
											{@const counter = assetCounter(a)}
											<button
												class="ca-asset-card"
												style="--cat-color: {catColor}"
												onclick={(e) => openAssetDialog(a.assetId, e)}
												use:tooltip={def ? `${def.name} · ${def.category}` : a.assetId}
											>
												<span class="ca-asset-card-meta">
													<span class="ca-asset-card-cat">{def?.category ?? ''}</span>
													{#if counter}
														<span class="ca-asset-card-counter" title="{counter.label}: {counter.value}/{counter.max}">
															<span class="ca-asset-card-counter-icon" aria-hidden="true">{@html counter.iconSvg}</span>
															<span>{counter.value}/{counter.max}</span>
														</span>
													{/if}
												</span>
												<span class="ca-asset-card-name">{def?.name ?? a.assetId}</span>
											</button>
										{/each}
									</div>
								{/if}
							</div>
						{:else if activeCard === 'status'}
							<div class="ca-card-section">
								<!-- Debilities — Conditions / Banes / Burdens grid (V1 component). -->
								<div class="ca-debilities-wrapper">
									<div class="section-label">Debilities</div>
									<DebilitiesSection
										data={d}
										onchange={(label, active) => logDebility(d, label, active)}
									/>
								</div>

								<!-- Bonds & Failures — V1 progress tracks with ± spinners. -->
								<div class="ca-tracks-row">
									<div class="ca-track-group">
										<div class="ca-track-label-row">
											<span class="ca-track-label">Bonds</span>
											<span class="ca-track-tally">{progressText(d.bonds ?? 0)}</span>
										</div>
										<div class="ca-track-controls">
											<ProgressTrack label="" bind:value={d.bonds} />
											<div class="ca-track-actions">
												<button
													class="btn btn-track"
													onclick={() => { d.bonds = Math.max(0, (d.bonds ?? 0) - 1); }}
													disabled={(d.bonds ?? 0) <= 0}
												>−</button>
												<button
													class="btn btn-track"
													onclick={() => { d.bonds = Math.min(40, (d.bonds ?? 0) + 1); }}
													disabled={(d.bonds ?? 0) >= 40}
												>+</button>
											</div>
										</div>
									</div>

									{#if isDelveEnabled()}
										<div class="ca-track-group">
											<div class="ca-track-label-row">
												<span class="ca-track-label">Failures</span>
												<span class="ca-track-tally">{progressText(d.failures ?? 0)}</span>
											</div>
											<div class="ca-track-controls">
												<ProgressTrack label="" bind:value={d.failures} />
												<div class="ca-track-actions">
													<button
														class="btn btn-track"
														onclick={() => { d.failures = Math.max(0, (d.failures ?? 0) - 1); }}
														disabled={(d.failures ?? 0) <= 0}
													>−</button>
													<button
														class="btn btn-track"
														onclick={() => { d.failures = Math.min(40, (d.failures ?? 0) + 1); }}
														disabled={(d.failures ?? 0) >= 40}
													>+</button>
												</div>
											</div>
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

<!-- Asset card dialog — hosts the v1 AssetCard with full editing affordances.
     Mutations here flow to in-memory character state but aren't persisted to
     the API yet (prototype is read-mostly). -->
{#if activeChar && activeData && dialogAssetId}
	{@const arr = (activeData.assets ?? []) as CharacterAsset[]}
	{@const idx = arr.findIndex(a => a.assetId === dialogAssetId)}
	{@const def = findAsset(dialogAssetId)}
	{#if idx >= 0 && def}
		<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
		<dialog
			bind:this={dialogEl}
			class="ca-asset-dialog"
			oncancel={closeAssetDialog}
			onclose={() => { dialogAssetId = null; }}
			onclick={(e) => {
				if (e.target === dialogEl) { closeAssetDialog(); return; }
				// Delegate move-links / oracle-links inside asset abilities to the
				// layout-level dialogs via a custom DOM event. v1's AssetCard has
				// no internal handler for these; without this delegation clicking
				// e.g. "Face Danger" inside an ability text is a no-op.
				const ml = (e.target as HTMLElement).closest('a.move-link') as HTMLElement | null;
				if (ml) {
					e.preventDefault();
					document.dispatchEvent(new CustomEvent('ironledger:open-move', { detail: { id: ml.dataset['id'] ?? '' } }));
					return;
				}
				const ol = (e.target as HTMLElement).closest('a.oracle-link') as HTMLElement | null;
				if (ol) {
					e.preventDefault();
					document.dispatchEvent(new CustomEvent('ironledger:open-oracle', { detail: {
						key:  ol.dataset['oracle'] ?? '',
						stat: ol.dataset['stat']   ?? '',
					}}));
					return;
				}
			}}
		>
			<!-- AssetCard renders with v1 header / body styling. forceExpanded
			     starts it un-collapsed and hides the ▶ toggle; onClose renders
			     the ✕ in the upper-right of the header. -->
			<AssetCard
				bind:asset={arr[idx]}
				definition={def}
				characterId={activeChar.id}
				characterName={activeChar.name}
				characterXp={activeData.xp ?? 0}
				bind:globalValues={activeData.globalValues as Record<string, string>}
				onRemove={closeAssetDialog}
				onClose={closeAssetDialog}
				forceExpanded
			/>
		</dialog>
	{/if}
{/if}

<!-- Asset picker — opens when the trailing "+" asset tab is clicked.
     onAdd appends a new asset entry to the active character (in-memory). -->
{#if pickerOpen && activeChar && activeData}
	<AssetPicker
		ownedIds={((activeData.assets ?? []) as CharacterAsset[]).map(a => a.assetId)}
		characterData={activeData}
		onAdd={handleAddAsset}
		onClose={() => (pickerOpen = false)}
	/>
{/if}

<!-- Delete-character confirmation — matches V1's pattern: red accent,
     "Delete" confirm label, message names the active character. -->
{#if activeChar && activeData}
	{@const d = activeData}
	<ConfirmDialog
		bind:this={deleteDialogRef}
		title="Delete Character"
		confirmLabel="Delete"
		onconfirm={confirmDeleteCharacter}
	>
		<p>Permanently delete <strong>{d.name || activeChar.name || 'this character'}</strong>? This cannot be undone.</p>
	</ConfirmDialog>
{/if}

<style>
	.ca-area {
		display:        flex;
		flex-direction: column;
		height:         100%;
		min-height:     0;
	}

	/* ── Header ───────────────────────────────────────── */
	.ca-header {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 6px 12px;
		border-bottom: 1px solid var(--border);
		background: var(--bg-control);
		flex-shrink: 0;
	}
	.ca-title-icon {
		display: inline-flex; align-items: center; justify-content: center;
		width: 18px; height: 18px;
		flex-shrink: 0;
		color: var(--text-accent);
	}
	.ca-title-icon :global(svg) {
		width: 100%; height: 100%;
		fill: currentColor;
	}
	.ca-title-icon :global(svg) :global(path) { fill: currentColor; }
	.ca-title {
		font-family:    var(--font-display);
		font-size:      calc(0.82rem * var(--font-display-scale));
		font-weight:    700;
		letter-spacing: 0.08em;
		text-transform: var(--font-display-transform);
		color:          var(--text-accent);
	}
	/* Toolbar — + Character / + Asset / + Vow / Delete. Delete pinned right. */
	.ca-header-actions {
		display: flex;
		align-items: center;
		gap: 6px;
		flex: 1;
		justify-content: flex-end;
	}
	.ca-hdr-btn {
		font-size:   0.7rem;
		padding:     3px 9px;
		min-width:   unset;
	}
	.ca-hdr-btn[disabled] {
		opacity: 0.4;
		cursor:  not-allowed;
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

	/* ── Body: spines + (name header + stage) ─────────── */
	.ca-body {
		display: grid;
		grid-template-columns: 36px 1fr;
		grid-template-rows: auto 1fr;
		flex: 1;
		min-height: 0;
	}
	.ca-spines { grid-row: 1 / span 2; }
	.ca-stage-header { grid-column: 2; grid-row: 1; }
	.ca-stage        { grid-column: 2; grid-row: 2; }

	/* Stage header row — name on the left, trash icon on the right. Same
	   background tone as VowCard's .vow-header so the character card and
	   the vow cards inside it read as the same UI family. */
	.ca-stage-header {
		display:        flex;
		align-items:    center;
		gap:            6px;
		padding:        5px 10px;            /* sized so the row's total height matches .ca-header (38px) */
		background:     var(--bg-control);
		border:         none;
		border-bottom:  1px solid var(--border);
		border-radius:  0;
	}
	.ca-stage-header > .ca-stage-name,
	.ca-stage-header > .ca-stage-name-input { flex: 1; margin: 0; }
	.ca-stage-delete-btn {
		flex-shrink: 0;
		opacity:     0.7;
		transition:  opacity 0.12s, color 0.12s;
	}
	.ca-stage-delete-btn:hover {
		opacity: 1;
		color:   var(--color-danger);
	}
	.ca-stage-delete-btn :global(svg) {
		width: 12px; height: 12px;
		flex-shrink: 0;
		pointer-events: none;
		fill: currentColor;
	}
	.ca-stage-delete-btn :global(svg) :global(path) { fill: currentColor; }

	/* Persistent character name sits above the tab strip / stage. Sized to
	   match V1's .char-title (0.82rem × font-display-scale, 0.08em tracking,
	   default line-height, 2px 6px padding, 1px transparent border). */
	.ca-stage-name {
		appearance:     none;
		-webkit-appearance: none;
		text-align:     left;
		background:     transparent;
		font-family:    var(--font-display);
		font-size:      calc(0.82rem * var(--font-display-scale));
		font-weight:    var(--font-display-weight);
		font-variant:   var(--font-display-variant);
		letter-spacing: 0.08em;
		text-transform: var(--font-display-transform);
		color:          var(--text-accent);
		padding:        2px 6px;
		border:         1px solid transparent;
		border-radius:  3px;
		margin:         6px 12px 2px;
		overflow:       hidden;
		text-overflow:  ellipsis;
		white-space:    nowrap;
		transition:     background 0.12s, border-color 0.12s;
	}
	.ca-stage-name.ca-card-name--editable:hover {
		background:   var(--bg-hover);
		border-color: var(--border);
	}
	.ca-stage-name-input {
		font-family:    var(--font-display);
		font-size:      calc(0.82rem * var(--font-display-scale));
		font-weight:    var(--font-display-weight);
		font-variant:   var(--font-display-variant);
		letter-spacing: 0.08em;
		text-transform: var(--font-display-transform);
		color:          var(--text-accent);
		background:     transparent;
		border:         1px solid var(--border-mid);
		border-radius:  3px;
		padding:        2px 6px;
		margin:         6px 12px 2px;
		width:          calc(100% - 24px);
		outline:        none;
	}
	.ca-stage-name-input:focus { border-color: var(--text-accent); }

	/* Spine strip — vertical tabs along the LEFT edge of the active card.
	   V1 tab-btn style applied with `writing-mode: sideways-lr` so the text
	   reads bottom-to-top; the active indicator is the right border (the
	   side touching the card content). */
	.ca-spines {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: 0;
		padding: 0;
		overflow-y: auto;
		border-right: 1px solid var(--border);
		background: transparent;
	}
	.ca-spine {
		all: unset;
		cursor: pointer;
		font-family:    var(--font-ui);
		font-size:      0.72rem;
		font-weight:    600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color:          var(--text-dimmer);
		background:     transparent;
		border:         none;
		border-right:   2px solid transparent;   /* underline on the side touching the card */
		padding:        16px 7px 16px 7px;       /* 7px visual margin on left and right of the rotated text */
		text-align:     center;
		writing-mode:   sideways-lr;
		/* Variable height: share remaining column space equally; clip overflow
		   so the rotated name uses ellipsis instead of pushing the column. */
		flex:           1 1 0;
		min-height:     0;
		overflow:       hidden;
		margin-right:   -1px;                    /* overlap the column border so the active accent reads cleanly */
		transition:     color 0.12s, border-color 0.12s;
	}
	.ca-spine:hover { color: var(--text-muted); }
	.ca-spine--active {
		color:              var(--text-accent);
		border-right-color: var(--text-accent);
	}
	.ca-spine-name {
		display:       inline-block;
		max-height:    100%;
		overflow:      hidden;
		text-overflow: ellipsis;
		white-space:   nowrap;
	}
	/* Stage */
	.ca-stage {
		display: flex;
		flex-direction: column;
		min-height: 0;
		min-width: 0;
		overflow: auto;
		padding: 0;                /* tab strip and card now extend full-width to the spine */
		margin: 0;
	}

	/* Card tabs (Background / Core / Vows) — V1 tab-btn style: flat,
	   underlined, transparent background. */
	.ca-tabs {
		display: flex;
		align-items: stretch;
		gap: 0;
		margin-bottom: 8px;
		border-bottom: 1px solid var(--border);
	}
	.ca-tab {
		all: unset;
		cursor: pointer;
		font-family:    var(--font-ui);
		font-size:      0.72rem;
		font-weight:    600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color:          var(--text-dimmer);
		background:     transparent;
		border:         none;
		border-bottom:  2px solid transparent;
		padding:        7px 8px 6px;       /* half of v1's 13/16/11 */
		white-space:    nowrap;
		flex-shrink:    0;
		margin-bottom:  -1px;
		transition:     color 0.12s, border-color 0.12s;
		display:        inline-flex;
		align-items:    center;
		gap:            0.35rem;
	}
	.ca-tab:hover { color: var(--text-muted); }
	.ca-tab--active {
		color:               var(--text-accent);
		border-bottom-color: var(--text-accent);
	}

	/* Card content — simplified: no top/side border, no background. Bottom
	   border closes off the card from the asset tabs below. Section
	   dividers come from per-section border-top rules below. */
	.ca-card {
		flex: 1;
		min-height: 200px;
		/* Matches the surrounding area so the card reads as borderless but is
		   still opaque — needed so the asset tabs that are tucked under it
		   (margin-top: -6px) don't poke through. */
		background: var(--bg-inset);
		border: none;
		border-bottom: 1px solid #C5B99E;
		border-radius: 0;
		padding: 7px 7px 0;               /* no bottom padding — bottom border hugs the last section */
		margin-bottom: 0;
		overflow: auto;
		position: relative;
		z-index: 1;                       /* sit above ca-asset-tabs so the tucked edge is hidden */
	}
	.ca-card-section {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.ca-card-bg {
		font-family: var(--font-ui);
		font-size: 0.85rem;
		line-height: 1.5;
		color: var(--text);
		margin: 0;
		white-space: pre-wrap;
	}
	.ca-card-bg--empty {
		color: var(--text-dimmer);
		font-style: italic;
	}

	/* Background card portrait — floats right so the text wraps around it.
	   `float` is ignored inside flex containers, so the background section
	   uses block layout (overriding .ca-card-section's flex). */
	.ca-bg-section {
		display: block;
		position: relative;
	}
	.ca-bg-portrait-label {
		display: contents;            /* let the inner <img> own the float */
		cursor: pointer;
	}
	.ca-bg-portrait {
		float:         right;
		width:         170px;
		height:        170px;
		max-height:    240px;
		object-fit:    cover;
		margin:        0 0 10px 14px;
		border:        1px solid var(--border);
		border-radius: 6px;
		shape-outside: margin-box;
		opacity:       0.95;
		transition:    opacity 0.12s;
	}
	.ca-bg-portrait-label:hover .ca-bg-portrait { opacity: 0.7; }
	.ca-bg-portrait--placeholder {
		background: var(--bg-inset);
		display:    flex;
		align-items: center;
		justify-content: center;
		color:      var(--text-dimmer);
	}
	.ca-bg-portrait--placeholder :global(svg) {
		width:  60%;
		height: 60%;
		fill:   var(--text-dimmer);
	}
	.ca-bg-portrait-input {
		position: absolute;
		left:     -9999px;            /* keep input accessible but visually hidden */
		width:    1px;
		height:   1px;
	}

	/* Editable name / background — click to edit affordances. */
	.ca-card-name--editable {
		cursor: pointer;
		transition: color 0.12s;
	}
	.ca-card-name--editable:hover { color: var(--text); }
	.ca-card-bg--display {
		cursor: pointer;
		min-height: 1.5em;
	}
	.ca-card-bg--display:focus-visible {
		outline: 2px solid var(--text-accent);
		outline-offset: 2px;
		border-radius: 2px;
	}
	/* Style the markdown the same way the raw <p> was styled. */
	.ca-card-bg--display :global(p) {
		font-family: var(--font-ui);
		font-size:   0.85rem;
		line-height: 1.5;
		color:       var(--text);
		margin:      0 0 0.6em;
	}
	.ca-card-bg--display :global(p:last-child) { margin-bottom: 0; }
	.ca-card-bg--display :global(ul),
	.ca-card-bg--display :global(ol) {
		font-family: var(--font-ui);
		font-size:   0.85rem;
		line-height: 1.5;
		color:       var(--text);
		margin:      0 0 0.6em;
		padding-left: 1.2em;
	}
	.ca-card-bg--display :global(strong) { font-weight: 700; color: var(--text); }
	.ca-card-bg--display :global(em)     { font-style: italic; }
	.ca-card-bg--display :global(h1),
	.ca-card-bg--display :global(h2),
	.ca-card-bg--display :global(h3) {
		font-family: var(--font-ui);
		font-weight: 700;
		color:       var(--text-accent);
		margin:      0.4em 0 0.3em;
	}
	.ca-card-bg-placeholder {
		font-family: var(--font-ui);
		font-size:   0.85rem;
		color:       var(--text-dimmer);
		font-style:  italic;
	}
	.ca-card-bg-input {
		width:          100%;
		min-height:     7em;
		font-family:    var(--font-ui);
		font-size:      0.85rem;
		line-height:    1.5;
		color:          var(--text);
		background:     var(--bg-inset);
		border:         1px solid var(--border);
		border-radius:  4px;
		padding:        8px 10px;
		outline:        none;
		resize:         vertical;
	}
	.ca-card-bg-input:focus { border-color: var(--text-accent); }

	/* Initiative widget — mirrors V1 .cs-init-section: small toggle group
	   with three pill buttons (None / Foe / Character). */
	.ca-init-section {
		display:     flex;
		align-items: center;
		gap:         0.5rem;
	}
	.ca-init-label {
		font-family:    var(--font-ui);
		font-size:      0.7rem;
		font-weight:    600;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color:          var(--text-dimmer);
	}
	.ca-init-toggle {
		display:       flex;
		border:        1px solid var(--border-mid);
		border-radius: 4px;
		overflow:      hidden;
	}
	.ca-init-btn {
		all: unset;
		display:        inline-flex;
		align-items:    center;
		gap:            3px;
		padding:        2px 7px;
		font-family:    var(--font-ui);
		font-size:      0.58rem;
		font-weight:    600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color:          var(--text-muted);
		background:     transparent;
		border-right:   1px solid var(--border-mid);
		cursor:         pointer;
		transition:     background 0.12s, color 0.12s;
	}
	.ca-init-btn:last-child { border-right: none; }
	.ca-init-btn:hover:not(.ca-init-btn--active) {
		background: rgba(255,255,255,0.05);
		color:      var(--text-muted);
	}
	.ca-init-btn :global(svg) {
		width: 9px; height: 9px; fill: currentColor; flex-shrink: 0;
	}
	.ca-init-btn--active {
		background: var(--text-accent);
		color:      var(--bg-card);
	}
	.ca-init-btn--you.ca-init-btn--active {
		background: rgba(52, 211, 153, 0.18);
		color:      #34d399;
	}
	.ca-init-btn--foe.ca-init-btn--active {
		background: rgba(239, 68, 68, 0.14);
		color:      #ef4444;
	}

	/* Stats / Vitals wrappers — wrap each row with a vertical "STATS" /
	   "VITALS" side label on the left, V1-style with a separator. Upper
	   border separates the section from whatever is above (initiative for
	   stats, stats for vitals). */
	.ca-stats-wrapper,
	.ca-vitals-wrapper {
		display: flex;
		align-items: stretch;
		gap: 8px;
		border-top: 1px solid #C5B99E;
		padding-top: 8px;
	}
	.ca-side-label {
		writing-mode:   vertical-rl;
		transform:      rotate(180deg);
		font-family:    var(--font-ui);
		font-size:      0.55rem;
		font-weight:    800;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color:          var(--text-dimmer);
		flex-shrink:    0;
		align-self:     stretch;
		display:        flex;
		align-items:    center;
		justify-content: center;
		/* The element is rotated 180° (writing-mode + transform), so a CSS
		   `border-left` shows up on the visual RIGHT of the label — between
		   the label text and the chits to its right. */
		border-left:    1px solid var(--border);
		padding-left:   6px;
		padding-right:  2px;
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
	.ca-stats-row > :global(*) { flex: 0 0 auto; }

	.ca-vitals-row {
		display: flex;
		justify-content: flex-start;
		align-items: stretch;
		gap: 8px;
		flex-wrap: wrap;
		flex: 1;
	}
	.ca-vitals-row > :global(*) { flex: 0 0 auto; }

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
	.ca-tracks-row {
		display: flex;
		gap: 10px;
		flex-wrap: wrap;
		justify-content: flex-start;
		padding-top: 4px;
	}
	.ca-track-group {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.ca-track-label-row {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 8px;
	}
	/* Mirror V1 .section-label exactly (margin-bottom 0 inside tracks-row). */
	.ca-track-label {
		font-family:    var(--font-ui);
		font-size:      0.7rem;
		font-weight:    600;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color:          var(--text-dimmer);
		margin-bottom:  0;
	}
	.ca-track-tally {
		font-family:          var(--font-ui);
		font-size:            0.65rem;
		color:                var(--text-dimmer);
		font-variant-numeric: tabular-nums;
		white-space:          nowrap;
	}
	.ca-track-controls {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.ca-track-actions {
		display: flex;
		gap: 4px;
		flex-shrink: 0;
	}
	/* V1's compact track ± button — match CharacterSheet so the buttons line
	   up with the 22px progress boxes. */
	:global(.btn-track) {
		height:     22px;
		padding:    0 7px;
		font-size:  0.68rem;
		line-height: 1;
		min-width:  unset;
	}

	/* Vows tab — stack of VowCards. The "+ Vow" action lives in the header
	   toolbar now, so no per-tab header is needed. */
	.ca-vows-list {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.ca-empty-mini {
		font-family: var(--font-ui);
		font-size: 0.78rem;
		color: var(--text-dimmer);
		font-style: italic;
	}

	/* ── Asset tab content — clickable cards in a responsive grid.
	   Each card is auto-sized so a row fits as many as possible. Hover
	   raises the card slightly and brightens it; clicking opens the
	   AssetCard dialog (same as v1). The left-edge accent uses the
	   asset's category color (Combat/Path/Companion/Ritual/Talent). */
	.ca-asset-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
		gap: 6px;
	}
	.ca-asset-card {
		all: unset;
		cursor: pointer;
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 7px 10px;
		background: var(--bg-inset);
		border: 1px solid var(--border);
		border-left: 3px solid var(--cat-color, var(--text-muted));
		border-radius: 4px;
		transition: background 0.12s, border-color 0.12s, transform 0.12s;
	}
	.ca-asset-card:hover {
		background: var(--bg-hover);
		border-top-color: var(--border-mid);
		border-right-color: var(--border-mid);
		border-bottom-color: var(--border-mid);
		transform: translateY(-1px);
	}
	.ca-asset-card-meta {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 6px;
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
	/* Counter pill on the right of the meta row — icon + "N/MAX". Icon
	   inherits the counter's color via currentColor on the SVG fill. */
	.ca-asset-card-counter {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		font-family: var(--font-ui);
		font-size: 0.6rem;
		font-weight: 700;
		letter-spacing: 0.03em;
		color: var(--text-muted);
		line-height: 1;
	}
	.ca-asset-card-counter-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 11px;
		height: 11px;
		color: var(--cat-color, var(--text-muted));
	}
	.ca-asset-card-counter-icon :global(svg) { width: 100%; height: 100%; fill: currentColor; }
	.ca-asset-card-counter-icon :global(svg) :global(path) { fill: currentColor; }
	.ca-asset-card-name {
		font-family: var(--font-ui);
		font-size: 0.78rem;
		font-weight: 600;
		color: var(--text);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* ── Asset detail dialog ── transparent shell; the AssetCard inside owns
	   all visual structure (header, abilities, custom fields) so the popup
	   matches v1's expanded asset look exactly. Height fits the content but
	   never exceeds 80% of the viewport — when content is taller, the body
	   scrolls and the header stays pinned to the top.

	   Centering uses top/left + transform instead of `inset: 0; margin: auto`
	   because the latter combined with `display: flex` + `min-height: 0`
	   children collapses to a thin line on mobile Safari. */
	.ca-asset-dialog {
		border: none;
		padding: 0;
		background: transparent;
		color: var(--text);
		width: min(640px, calc(100vw - 1rem));
		height: fit-content;              /* shrink to content when smaller */
		max-height: 80vh;                 /* but never exceed 80% of viewport */
		overflow: hidden;                 /* clip the inner card to max-height */
		outline: none;
		display: flex;                    /* let the AssetCard fill height */
		flex-direction: column;
		position: fixed;
		top: 50%;
		left: 50%;
		margin: 0;
		transform: translate(-50%, -50%); /* steady-state centering */
		z-index: 9999;                    /* sit above any in-page stacking contexts */
	}
	.ca-asset-dialog::backdrop {
		background: #00000060;
		backdrop-filter: blur(1px);
		animation: ca-asset-backdrop-in 0.5s ease-out;
	}
	/* Ensure every open dialog (asset dialog, asset picker, etc.) sits above
	   the rest of the v2 UI. Native modal dialogs are in the top layer, but
	   non-modal dialogs and stacked contexts can still cause z conflicts. */
	:global(dialog[open]) {
		z-index: 9999;
	}
	:global(dialog::backdrop) {
		z-index: 9998;
	}
	/* Grow the dialog from the clicked asset tab's centre to viewport centre.
	   --ca-origin-x / --ca-origin-y are set inline by openAssetDialog() based
	   on the click target's bounding rect. */
	.ca-asset-dialog[open] {
		animation: ca-asset-open 0.5s cubic-bezier(0.16, 1, 0.3, 1);
	}
	@keyframes ca-asset-open {
		from {
			opacity: 0;
			transform: translate(calc(-50% + var(--ca-origin-x, 0px)), calc(-50% + var(--ca-origin-y, 0px))) scale(0.05);
		}
		to {
			opacity: 1;
			transform: translate(-50%, -50%) scale(1);
		}
	}
	@keyframes ca-asset-backdrop-in {
		from { opacity: 0; }
		to   { opacity: 1; }
	}
	/* Let the AssetCard fill the dialog height and scroll only its body. */
	.ca-asset-dialog :global(.asset-card) {
		flex: 1 1 auto;
		min-height: 0;
		max-height: 100%;
	}
	.ca-asset-dialog :global(.asset-header) {
		flex-shrink: 0;
		position: sticky;
		top: 0;
		z-index: 1;
	}
	.ca-asset-dialog :global(.asset-body) {
		/* Without flex: 1, the body grows to fit content and overflows the
		   capped dialog — opening a collapsible (e.g. Difficulty Factors)
		   would push past the viewport instead of scrolling internally. */
		flex:       1 1 auto;
		min-height: 0;
		overflow-y: auto;
	}
	/* asset-body is itself a flex column. Without flex-shrink: 0 on its
	   children, sections like .factors-section (which has overflow: hidden)
	   get squashed by the flex algorithm to fit the available space — so
	   when Difficulty Factors expands its inner table never makes the body
	   overflow. Force every direct child to keep its natural height. */
	.ca-asset-dialog :global(.asset-body > *) {
		flex-shrink: 0;
	}
</style>
