<script lang="ts">
	import type { PageData } from './$types';
	import type { CharacterFull } from '$lib/api.js';
	import type { FoeDef, FoeQuantity, Expedition, Journey, Site } from '$lib/types.js';
	import { EXPEDITION_MARK_TICKS } from '$lib/types.js';
	import { characters as api } from '$lib/api.js';
	import { findFoe, findFoeByName, loadFoes, FOE_RANKS } from '$lib/foeStore.svelte.js';
	import { loadDelveData } from '$lib/delveStore.svelte.js';
	import { appendLog, getActionNonce, drainActions, SESSION_LOG_ID } from '$lib/log.svelte.js';
	import {
		loadEncounters, getEncounters,
		addEncounter, updateEncounter, removeEncounter,
	} from '$lib/encounterStore.svelte.js';
	import {
		loadExpeditions, getExpeditions,
		addExpedition, updateExpedition, removeExpedition,
	} from '$lib/expeditionStore.svelte.js';
	import CharacterSheet    from '$lib/components/CharacterSheet.svelte';
	import LogPanel          from '$lib/components/LogPanel.svelte';
	import GlobalContextBar  from '$lib/components/GlobalContextBar.svelte';
	import DiceRollerDialog  from '$lib/components/DiceRollerDialog.svelte';
	import OraclesDialog     from '$lib/components/OraclesDialog.svelte';
	import NotesDialog       from '$lib/components/NotesDialog.svelte';
	import MovesDialog       from '$lib/components/MovesDialog.svelte';
	import FoePickerDialog   from '$lib/components/FoePickerDialog.svelte';
	import FoeCard           from '$lib/components/FoeCard.svelte';
	import JourneyCard       from '$lib/components/JourneyCard.svelte';
	import SiteCard          from '$lib/components/SiteCard.svelte';
	import { getActiveDiceCtx } from '$lib/diceContext.svelte.js';
	import type { DiceCtx } from '$lib/diceContext.svelte.js';
	import { hydrateCharacter } from '$lib/character.js';
	import { loadMoves } from '$lib/moveStore.svelte.js';
	import { getAssets } from '$lib/assetStore.svelte.js';
	import type { InspectionFactor, RitualInfo } from '$lib/preconditions.js';
	import type { PreconditionContext } from '$lib/preconditions.js';
	import { onMount } from 'svelte';
	import fileImportSvg    from '$icons/file-import-solid-full.svg?raw';
			import trashSvg         from '$icons/trash-solid-full.svg?raw';
	import fileExportSvg    from '$icons/file-export-solid-full.svg?raw';
	import charactersSvgUrl from '$icons/Characters.svg?url';
	import foesSvgUrl       from '$icons/Foes.svg?url';
	import expedSvgUrl      from '$icons/Expeditions.svg?url';
	import adventSvgUrl     from '$icons/Adventure.svg?url';

	let { data }: { data: PageData } = $props();

	// ── Character list ─────────────────────────────────────────────────────────
	// Starts empty; populated after mount so the app shell renders immediately.
	let chars       = $state<CharacterFull[]>([]);
	let loadingChars = $state(true);

	let creating    = $state(false);
	let importing   = $state(false);
	let charError   = $state('');

	// ── Active character ───────────────────────────────────────────────────────
	let activeCharId = $state<string>('');
	const activeChar  = $derived(chars.find((c) => c.id === activeCharId));

	// Keep activeCharId valid after mutations (create / delete).
	// '' is a valid value meaning "no selection".
	$effect(() => {
		if (chars.length === 0) activeCharId = '';
		// If the currently-selected character was deleted, deselect.
		else if (activeCharId && !chars.find((c) => c.id === activeCharId)) {
			activeCharId = '';
		}
	});

	function setActiveChar(id: string) { activeCharId = id; }

	// ── Dice roller ────────────────────────────────────────────────────────────
	let diceRollerRef    = $state<{ open(): void } | null>(null);
	// Use the live DiceCtx from CharacterSheet when it's mounted and matches the
	// active character. Fall back to building one from the chars array when
	// CharacterSheet is unmounted (e.g., user is on the Adventure tab and selected
	// a character directly from the GCB without visiting the Characters tab first).
	const activeDiceCtx = $derived.by<DiceCtx | null>(() => {
		const fromModule = getActiveDiceCtx();
		if (fromModule?.charId === activeCharId) return fromModule;
		if (!activeCharId) return null;
		const char = chars.find(c => c.id === activeCharId);
		if (!char) return null;
		const d = hydrateCharacter(char.data);
		return { charId: char.id, charName: d.name || 'Unnamed', data: d };
	});

	// ── Oracles dialog ─────────────────────────────────────────────────────────
	let oraclesDialogRef = $state<{ open(oracleKey?: string): void } | null>(null);

	// ── Notes dialog ───────────────────────────────────────────────────────────
	let notesDialogRef   = $state<{ open(): void } | null>(null);

	// ── Foe picker dialog ──────────────────────────────────────────────────────
	let foePickerRef = $state<{ open(): void } | null>(null);
	let activeFoeId  = $state('');

	// Encounters from the global encounter store (not per-character)
	const encounters = $derived(getEncounters());

	// ── LogPanel ref (for toolbar buttons in tab mode) ────────────────────────
	let logPanelRef = $state<{ exportLog(): void; showClearDialog(): void; hasEntries(): boolean } | null>(null);

	// ── Moves dialog ──────────────────────────────────────────────────────────
	let movesDialogRef = $state<{ open(moveId?: string): void } | null>(null);

	// ── Expeditions ────────────────────────────────────────────────────────────
	let activeExpeditionId = $state('');
	const expeditions = $derived(getExpeditions());

	// ── Initiative state (per-character: 0=none, 1=character, 2=foe) ────────
	let initiativeMap = $state<Record<string, number>>({});
	const initiative = $derived(activeCharId ? (initiativeMap[activeCharId] ?? 0) : 0);

	// ── Session persistence ────────────────────────────────────────────────────
	const SESSION_STORAGE_KEY = 'ironledger:session';
	$effect(() => {
		localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
			charId:       activeCharId,
			foeId:        activeFoeId,
			expeditionId: activeExpeditionId,
		}));
	});

	// Build precondition context from active selections
	const preconditionCtx = $derived<PreconditionContext>({
		hasCharacter: !!activeCharId,
		hasFoe:       !!activeFoeId,
		hasJourney:   !!activeExpeditionId && expeditions.find(e => e.id === activeExpeditionId)?.type === 'journey',
		hasSite:      !!activeExpeditionId && expeditions.find(e => e.id === activeExpeditionId)?.type === 'site',
		initiative,
		foeHarm:      activeFoeId ? (FOE_RANKS[encounters.find(e => e.id === activeFoeId)?.effectiveRank ?? 0]?.harm) : undefined,
		ritualAssets: (() => {
			if (!activeCharId) return [];
			const char = chars.find(c => c.id === activeCharId);
			if (!char) return [];
			const allAssets = getAssets();
			return (char.data.assets ?? [])
				.map((a: { assetId: string }) => allAssets.find(d => d.id === a.assetId))
				.filter((d): d is NonNullable<typeof d> => !!d && !!(d as Record<string, unknown>)['inspectionFactors'])
				.map(d => ({
					id:                d.id,
					name:              d.name,
					inspectionFactors: (d as Record<string, unknown>)['inspectionFactors'] as InspectionFactor[],
				})) as RitualInfo[];
		})(),
	});

	// Drain the action bus when CharacterSheet is not mounted (Adventure / Foes /
	// Expeditions tabs). Keeps GCB resource chips in sync with log link clicks.
	const RESOURCE_CAPS: Record<string, [number, number]> = {
		momentum: [-6, 10], health: [0, 5], spirit: [0, 5],
		supply: [0, 5], mana: [0, 5], xp: [0, 999], bonds: [0, 40], failures: [0, 40],
	};
	$effect(() => {
		getActionNonce();
		if (activeTab === 'characters') return; // CharacterSheet handles it
		if (!activeCharId) return;
		const actions = drainActions(activeCharId);
		if (actions.length === 0) return;
		const char = chars.find(c => c.id === activeCharId);
		if (!char) return;
		const rec = char.data as Record<string, number | boolean>;
		for (const action of actions) {
			if (action.type === 'resource') {
				const caps = RESOURCE_CAPS[action.key];
				if (!caps) continue;
				const old = (rec[action.key] as number) ?? 0;
				const next = Math.max(caps[0], Math.min(caps[1], old + action.value));
				if (next !== old) {
					rec[action.key] = next;
					const label = action.key.charAt(0).toUpperCase() + action.key.slice(1);
					appendLog(SESSION_LOG_ID, `${char.name} — ${label}`,
						`<div>${label}: ${old} → <strong>${next}</strong> (${action.value > 0 ? '+' : ''}${action.value})</div>`);
				}
			} else if (action.type === 'debility') {
				const old = rec[action.key] as boolean;
				if (old === undefined) continue;
				const active = action.value === 1;
				if (old !== active) {
					rec[action.key] = active;
					const label = action.key.charAt(0).toUpperCase() + action.key.slice(1);
					appendLog(SESSION_LOG_ID, `${char.name} — Debilities`,
						`<div>${label}: <strong>${active ? 'Marked' : 'Cleared'}</strong></div>`);
				}
			}
		}
		// Shallow-clone the entry so Svelte sees the mutation and GCB re-renders
		chars = chars.map(c => c.id === activeCharId ? { ...c } : c);
		// Persist to API (fire-and-forget, same cadence as CharacterSheet auto-save)
		api.update(activeCharId, char.data).catch(() => {});
	});
	// ── Initial load ───────────────────────────────────────────────────────────
	onMount(async () => {
		// Load characters, foe catalogue, and global session data in parallel
		const [charResult] = await Promise.allSettled([
			api.list(),
			loadFoes(),
			loadEncounters(),
			loadExpeditions(),
			loadDelveData(),
			loadMoves(),
		]);
		if (charResult.status === 'fulfilled') {
			chars = charResult.value;
		} else {
			charError = 'Failed to load characters. Is the server running?';
		}
		// Restore previous session selections if they still exist
		try {
			const saved = JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) ?? '{}');
			if (saved.charId && chars.find((c: { id: string }) => c.id === saved.charId))
				activeCharId = saved.charId;
			if (saved.foeId && getEncounters().find(e => e.id === saved.foeId))
				activeFoeId = saved.foeId;
			if (saved.expeditionId && getExpeditions().find(e => e.id === saved.expeditionId))
				activeExpeditionId = saved.expeditionId;
		} catch { /* ignore bad storage data */ }
		loadingChars = false;
	});

	// ── Tabs ───────────────────────────────────────────────────────────────────
	type Tab = 'characters' | 'foes' | 'expeditions' | 'adventure';
	let activeTab = $state<Tab>('characters');

	// ── Tab group click handler (manual delegation for all tabs,
	//    works around Svelte 5 issue with display:none elements) ──────────────
	function handleTabGroupClick(e: MouseEvent) {
		const btn = (e.target as HTMLElement).closest('.tab-btn') as HTMLElement | null;
		if (!btn) return;
		const tab = btn.dataset.tab as Tab | undefined;
		if (tab) activeTab = tab;
	}

	// ── File input ref for import ──────────────────────────────────────────────
	let importInput: HTMLInputElement;

	// ── CRUD ───────────────────────────────────────────────────────────────────
	async function addCharacter() {
		if (creating) return;
		creating = true;
		charError = '';
		try {
			const newChar = await api.create('New Character');
			chars = [newChar, ...chars];
			activeCharId = newChar.id;
			activeTab = 'characters';
		} catch {
			charError = 'Could not create character. Is the server running?';
		} finally {
			creating = false;
		}
	}

	function handleSave(updated: CharacterFull) {
		chars = chars.map((c) => c.id === updated.id ? updated : c);
	}

	async function deleteCharacter(id: string) {
		try {
			await api.remove(id);
			chars = chars.filter((c) => c.id !== id);
		} catch {
			charError = 'Could not delete character.';
		}
	}

	// ── Foe encounter CRUD (via global encounterStore) ─────────────────────────

	/** Called by FoePickerDialog when the user confirms a foe selection. */
	async function handleFoeSelected(foeDef: FoeDef, quantity: FoeQuantity, effectiveRank: number) {
		const enc: import('$lib/types.js').FoeEncounter = {
			id:            crypto.randomUUID(),
			foeId:         foeDef.id,
			quantity,
			effectiveRank: effectiveRank as 1|2|3|4|5,
			ticks:         0,
			notes:         '',
			customName:    '',
			vanquished:    false,
		};
		const rankLabel = FOE_RANKS[effectiveRank]?.label ?? String(effectiveRank);
		appendLog(SESSION_LOG_ID, `Foe — ${foeDef.name}`,
			`<div>Added to encounter: <strong>${foeDef.name}</strong> (${quantity}, ${rankLabel})</div>`);
		activeFoeId = enc.id;
		await addEncounter(enc);
	}

	/** Update a single encounter (from FoeCard onChange). */
	async function handleEncounterChange(enc: import('$lib/types.js').FoeEncounter) {
		await updateEncounter(enc);
	}

	/** Remove a single encounter. */
	async function handleEncounterDelete(id: string) {
		if (activeFoeId === id) {
			activeFoeId = '';
			if (activeCharId) delete initiativeMap[activeCharId];
		}
		await removeEncounter(id);
	}

	// ── Expedition CRUD ────────────────────────────────────────────────────────

	function handleAddJourney() {
		const journey: Journey = {
			id:         crypto.randomUUID(),
			type:       'journey',
			name:       'New Journey',
			difficulty: 'dangerous',
			ticks:      0,
			notes:      '',
			complete:   false,
		};
		appendLog(SESSION_LOG_ID, `Journey — ${journey.name}`,
			`<div>Started a new journey: <strong>${journey.name}</strong></div>`);
		activeExpeditionId = journey.id;
		addExpedition(journey);
	}

	function handleAddSite() {
		const site: Site = {
			id:         crypto.randomUUID(),
			type:       'site',
			name:       'New Site',
			objective:  '',
			theme:      '',
			domain:     '',
			difficulty: 'dangerous',
			ticks:      0,
			denizens:   Array(12).fill(''),
			complete:   false,
		};
		appendLog(SESSION_LOG_ID, `Site — ${site.name}`,
			`<div>Discovered a new site: <strong>${site.name}</strong></div>`);
		activeExpeditionId = site.id;
		addExpedition(site);
	}

	async function handleExpeditionChange(exp: Expedition) {
		await updateExpedition(exp);
	}

	async function handleExpeditionDelete(id: string) {
		if (activeExpeditionId === id) activeExpeditionId = '';
		await removeExpedition(id);
	}

	/** Called by SiteCard when the user wants to add a denizen as a foe encounter. */
	function handleDenizenAddFoe(foeName: string) {
		const foeDef = findFoeByName(foeName);
		if (!foeDef) {
			appendLog(SESSION_LOG_ID, 'Denizen',
				`<div>No matching foe found in catalogue for "<strong>${foeName}</strong>".</div>`);
			return;
		}
		// Go through the normal foe-add flow with defaults
		handleFoeSelected(foeDef, 'solo', foeDef.rank);
	}

	// ── Phase 2: Interactive log link handlers ─────────────────────────────
	function handleProgressLink(track: string, value: number) {
		if (track === 'combat') {
			// Apply progress to active foe encounter
			const enc = encounters.find((e) => e.id === activeFoeId);
			if (!enc) return;
			const rank = FOE_RANKS[enc.effectiveRank];
			if (!rank) return;
			const ticksToAdd = value * rank.progressPerHit;
			const oldTicks = enc.ticks;
			const newTicks = Math.min(40, oldTicks + ticksToAdd);
			enc.ticks = newTicks;
			updateEncounter(enc);
			appendLog(SESSION_LOG_ID, `Foe — Progress`,
				`<div>Combat progress: ${Math.floor(oldTicks / 4)} → <strong>${Math.floor(newTicks / 4)}</strong> (+${ticksToAdd} ticks)</div>`);
		} else if (track === 'journey' || track === 'delve') {
			// Apply progress to active expedition
			const exp = expeditions.find((e) => e.id === activeExpeditionId);
			if (!exp) return;
			const ticksPerMark = EXPEDITION_MARK_TICKS[exp.difficulty] ?? 4;
			const ticksToAdd = value * ticksPerMark;
			const oldTicks = exp.ticks;
			const newTicks = Math.min(40, oldTicks + ticksToAdd);
			exp.ticks = newTicks;
			updateExpedition(exp);
			const label = track.charAt(0).toUpperCase() + track.slice(1);
			appendLog(SESSION_LOG_ID, `${label} — Progress`,
				`<div>${label} progress: ${Math.floor(oldTicks / 4)} → <strong>${Math.floor(newTicks / 4)}</strong> (+${ticksToAdd} ticks)</div>`);
		}
	}

	function handleMenaceLink(value: number) {
		if (!activeCharId) return;
		const char = chars.find((c) => c.id === activeCharId);
		if (!char) return;
		const data = char.data as { vows?: Array<{ name: string; threat: string; menace: number }> };
		const vows = data.vows ?? [];
		const vow = vows.find((v) => v.threat);
		if (!vow) return;
		const old = vow.menace ?? 0;
		vow.menace = Math.min(10, old + value);
		appendLog(SESSION_LOG_ID, `Menace — ${vow.name}`,
			`<div>Menace: ${old} → <strong>${vow.menace}</strong> (+${value})</div>`);
	}

	async function importCharacter(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;
		importing = true;
		charError = '';
		try {
			const text   = await file.text();
			const parsed = JSON.parse(text) as { name?: string; data?: Record<string, unknown> };
			const newChar = await api.create(parsed.name ?? 'Imported Character', parsed.data ?? {});
			chars = [newChar, ...chars];
			activeCharId = newChar.id;
			activeTab = 'characters';
		} catch {
			charError = 'Could not import character. Make sure the file is a valid Iron Ledger JSON export.';
		} finally {
			importing = false;
			importInput.value = '';
		}
	}
</script>

<svelte:head>
	<title>{activeChar ? `${activeChar.name} — Iron Ledger` : 'Characters — Iron Ledger'}</title>
</svelte:head>

<!-- Hidden file input for JSON import -->
<input
	bind:this={importInput}
	type="file"
	accept=".json,application/json"
	style="display: none"
	onchange={importCharacter}
/>

<!-- Dice roller dialog (always mounted; opened by GlobalContextBar Dice button) -->
<DiceRollerDialog bind:this={diceRollerRef} ctx={activeDiceCtx} />

<!-- Oracles dialog (always mounted; opened by GlobalContextBar Oracles button) -->
<OraclesDialog bind:this={oraclesDialogRef} />

<!-- Notes dialog (always mounted; opened by GlobalContextBar Notes button) -->
<NotesDialog bind:this={notesDialogRef} />

<!-- Moves dialog (always mounted; opened by GlobalContextBar Moves button) -->
<MovesDialog bind:this={movesDialogRef} ctx={activeDiceCtx} pctx={preconditionCtx}
	progressContext={{
		combat:   encounters.find(e => e.id === activeFoeId)?.ticks ?? 0,
		journey:  expeditions.find(e => e.id === activeExpeditionId && e.type === 'journey')?.ticks ?? 0,
		delve:    expeditions.find(e => e.id === activeExpeditionId && e.type === 'site')?.ticks    ?? 0,
		bonds:    ((activeChar?.data ?? {}) as Record<string, number>).bonds    ?? 0,
		failures: ((activeChar?.data ?? {}) as Record<string, number>).failures ?? 0,
		vows:     0,
	}}
	onInitiativeChange={(val) => { if (activeCharId) initiativeMap[activeCharId] = val === 'character' ? 1 : val === 'foe' ? 2 : 0; }}
/>

<!-- Foe picker dialog (always mounted; opened by + New Foe button in Foes tab) -->
<FoePickerDialog bind:this={foePickerRef} onSelect={handleFoeSelected} />


<!-- ===== Content + collapse control bar ===== -->
<div class="page-layout">

	<!-- ── Content pane ── -->
	<div class="content-pane">

		<!-- Sticky tab bar -->
		<nav class="tab-bar" aria-label="Section tabs">
			<!-- onclick on group for delegated handling (works around Svelte 5
			     event delegation issue with display:none elements) -->
			<div class="tab-group" role="tablist" onclick={handleTabGroupClick}>
				<button class="tab-btn" class:active={activeTab === 'characters'}
					role="tab" aria-selected={activeTab === 'characters'}
					data-tab="characters" title="Characters">
					<img class="tab-icon" src={charactersSvgUrl} alt="" aria-hidden="true">
					<span class="tab-label">Characters</span>
				</button>

				<button class="tab-btn" class:active={activeTab === 'foes'}
					role="tab" aria-selected={activeTab === 'foes'}
					data-tab="foes" title="Foes">
					<img class="tab-icon" src={foesSvgUrl} alt="" aria-hidden="true">
					<span class="tab-label">Foes</span>
				</button>

				<button class="tab-btn" class:active={activeTab === 'expeditions'}
					role="tab" aria-selected={activeTab === 'expeditions'}
					data-tab="expeditions" title="Expeditions">
					<img class="tab-icon" src={expedSvgUrl} alt="" aria-hidden="true">
					<span class="tab-label">Expeditions</span>
				</button>

				<button class="tab-btn" class:active={activeTab === 'adventure'}
					role="tab" aria-selected={activeTab === 'adventure'}
					data-tab="adventure" title="Adventure">
					<img class="tab-icon" src={adventSvgUrl} alt="" aria-hidden="true">
					<span class="tab-label">Adventure</span>
				</button>
			</div>
		</nav>

		<!-- Tab body -->
		<div class="tab-body">

			{#if activeTab === 'characters'}
				<div class="char-toolbar">
					{#if charError}<span class="char-error">{charError}</span>{/if}
					<div class="char-toolbar-actions">
						<button
							class="btn icon-btn"
							onclick={() => importInput.click()}
							disabled={importing}
							title="Import character from JSON"
							aria-label="Import character from JSON"
						>{@html fileImportSvg}{importing ? ' Importing…' : ' Import'}</button>
						<button
							class="btn btn-primary"
							onclick={addCharacter}
							disabled={creating}
						>{creating ? 'Creating…' : '+ New Character'}</button>
					</div>
				</div>

				{#if loadingChars}
					<div class="loading-tab">
						<span class="loading-dot"></span>
						<span class="loading-dot"></span>
						<span class="loading-dot"></span>
					</div>
				{:else if chars.length === 0}
					<div class="empty-tab">
						<img class="empty-tab-img" src={charactersSvgUrl} alt="">
						<span class="empty-tab-title">No Characters Yet</span>
						<span class="empty-tab-sub">Click <strong>+ New Character</strong> to create your first character.</span>
					</div>
				{:else}
					<div class="char-list">
						{#each chars as char (char.id)}
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<!-- svelte-ignore a11y_click_events_have_key_events -->
							<div
								class="char-card"
								class:char-card--active={char.id === activeCharId}
								onfocusin={() => setActiveChar(char.id)}
								onclick={() => setActiveChar(char.id)}
							>
								<CharacterSheet
									character={char}
									active={char.id === activeCharId}
									initiative={initiativeMap[char.id] ?? 0}
									onDelete={() => deleteCharacter(char.id)}
									onSave={handleSave}
									onInitiativeChange={(val) => {
										initiativeMap[char.id] = val === 'character' ? 1 : 2;
										const name = char.name || 'Character';
										appendLog(SESSION_LOG_ID, `${name} — Initiative`,
											val === 'character' ? '<div>You seize the initiative.</div>' : '<div>You cede the initiative to the foe.</div>');
									}}
								/>
							</div>
						{/each}
					</div>
				{/if}

			{:else if activeTab === 'foes'}
				<div class="char-toolbar">
					<div class="char-toolbar-actions">
						<button
							class="btn btn-primary"
							onclick={() => foePickerRef?.open()}
						>+ New Foe</button>
					</div>
				</div>

				{#if encounters.length === 0}
					<div class="empty-tab">
						<img class="empty-tab-img" src={foesSvgUrl} alt="">
						<span class="empty-tab-title">No Foes Tracked</span>
						<span class="empty-tab-sub">Click <strong>+ New Foe</strong> to create your first foe.</span>
					</div>
				{:else}
					<div class="char-list">
						{#each encounters as enc (enc.id)}
							{@const foeDef = findFoe(enc.foeId)}
							{#if foeDef}
								<!-- svelte-ignore a11y_no_static_element_interactions -->
								<!-- svelte-ignore a11y_click_events_have_key_events -->
								<div
									class="char-card"
									class:char-card--active={enc.id === activeFoeId}
									onclick={() => (activeFoeId = enc.id)}
									onfocusin={() => (activeFoeId = enc.id)}
								>
									<FoeCard
										{enc}
										{foeDef}
										onChange={handleEncounterChange}
										onDelete={() => handleEncounterDelete(enc.id)}
									/>
								</div>
							{/if}
						{/each}
					</div>
				{/if}

			{:else if activeTab === 'expeditions'}
				<div class="char-toolbar">
					<div class="char-toolbar-actions">
						<button
							class="btn btn-primary"
							onclick={handleAddJourney}
						>+ New Journey</button>
						<button
							class="btn btn-primary"
							onclick={handleAddSite}
						>+ New Site</button>
					</div>
				</div>

				{#if expeditions.length === 0}
					<div class="empty-tab">
						<img class="empty-tab-img" src={expedSvgUrl} alt="">
						<span class="empty-tab-title">No Expeditions</span>
						<span class="empty-tab-sub">Start a <strong>Journey</strong> to travel or a <strong>Site</strong> to delve into a perilous location.</span>
					</div>
				{:else}
					<div class="char-list">
						{#each expeditions as exp (exp.id)}
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<!-- svelte-ignore a11y_click_events_have_key_events -->
							<div
								class="char-card"
								class:char-card--active={exp.id === activeExpeditionId}
								onclick={() => (activeExpeditionId = exp.id)}
								onfocusin={() => (activeExpeditionId = exp.id)}
							>
								{#if exp.type === 'journey'}
									<JourneyCard
										expedition={exp}
										onChange={handleExpeditionChange}
										onDelete={() => handleExpeditionDelete(exp.id)}
									/>
								{:else}
									<SiteCard
										expedition={exp}
										onChange={handleExpeditionChange}
										onDelete={() => handleExpeditionDelete(exp.id)}
										onAddEncounter={handleDenizenAddFoe}
									/>
								{/if}
							</div>
						{/each}
					</div>
				{/if}
			{:else if activeTab === 'adventure'}
				<div class="adventure-layout">

					<!-- GCB column -->
					<div class="adventure-gcb">
						<GlobalContextBar
							{chars}
							{activeCharId}
							{encounters}
							{activeFoeId}
							{expeditions}
							{activeExpeditionId}
							{initiative}
							stacked
							onSelect={setActiveChar}
							onFoeSelect={(id) => { activeFoeId = id; if (!id && activeCharId) delete initiativeMap[activeCharId]; }}
							onExpeditionSelect={(id) => (activeExpeditionId = id)}
							onFoeProgress={handleEncounterChange}
							onExpeditionProgress={handleExpeditionChange}
							onDiceClick={() => diceRollerRef?.open()}
							onOraclesClick={() => oraclesDialogRef?.open()}
							onMovesClick={() => movesDialogRef?.open()}
							onNotesClick={() => notesDialogRef?.open()}
							onInitiativeChange={(val) => {
								if (!activeCharId) return;
								initiativeMap[activeCharId] = val === 'character' ? 1 : 2;
								const name = activeChar?.name || 'Character';
								appendLog(SESSION_LOG_ID, `${name} — Initiative`,
									val === 'character' ? '<div>You seize the initiative.</div>' : '<div>You cede the initiative to the foe.</div>');
							}}
						/>
					</div>

					<!-- Log column -->
					<div class="adventure-log">
						<div class="char-toolbar">
							<span class="log-panel-title">Session Log</span>
							<div class="char-toolbar-actions">
								<button
									class="btn icon-btn"
									onclick={() => logPanelRef?.exportLog()}
									title="Export log as Markdown"
									aria-label="Export session log as Markdown"
									disabled={!logPanelRef?.hasEntries()}
								>{@html fileExportSvg} Export</button>
								<button
									class="btn icon-btn"
									onclick={() => logPanelRef?.showClearDialog()}
									title="Clear log"
									aria-label="Clear session log"
									disabled={!logPanelRef?.hasEntries()}
								>{@html trashSvg} Clear</button>
							</div>
						</div>
						<LogPanel
							bind:this={logPanelRef}
							ctx={activeDiceCtx}
							onMoveLink={(id) => movesDialogRef?.open(id)}
							onOracleLink={(key) => oraclesDialogRef?.open(key || undefined)}
							onProgressLink={handleProgressLink}
							onInitiativeLink={(val) => { if (activeCharId) initiativeMap[activeCharId] = val === 'character' ? 1 : 2; }}
							onMenaceLink={handleMenaceLink}
							onVanquishFoe={async () => {
								if (!activeFoeId) return;
								const enc = encounters.find(e => e.id === activeFoeId);
								if (enc) await updateEncounter({ ...enc, vanquished: true });
								if (activeCharId) delete initiativeMap[activeCharId];
								activeFoeId = '';
							}}
						/>
					</div>

				</div>
			{/if}

		</div>
	</div>

	<!-- Collapse control bar -->
	<div class="cc-bar" aria-hidden="true"></div>

</div>

<style>
	/* ============================================================
	   Adventure tab layout — GCB + log, stacked on mobile,
	   side-by-side on desktop
	   ============================================================ */
	.adventure-layout {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.adventure-log {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	@media (min-width: 768px) {
		.adventure-layout {
			flex-direction: row;
			align-items: flex-start;
			gap: 1.25rem;
		}

		.adventure-gcb {
			flex: 1;
			min-width: 0;
		}

		.adventure-log {
			flex: 1;
		}
	}

	/* Toolbar row inside the Characters tab (Import + New buttons) */
	.char-toolbar {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 8px;
		padding-bottom: 0.75rem;
		border-bottom: 1px solid var(--border);
		margin-bottom: 0.75rem;
	}

	.char-toolbar-actions {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.log-panel-title {
		font-family:    var(--font-display, 'Cinzel', serif);
		font-size:      0.75rem;
		font-weight:    700;
		letter-spacing: 0.08em;
		color:          var(--text-muted);
		margin-right:   auto;
	}

	.char-error {
		font-family: var(--font-ui);
		font-size: 0.78rem;
		color: var(--color-danger, #ef4444);
		margin-right: auto;
	}

	.icon-btn {
		display: inline-flex;
		align-items: center;
		gap: 5px;
	}

	.icon-btn :global(svg) {
		width: 13px;
		height: 13px;
		fill: currentColor;
		flex-shrink: 0;
	}

	/* Loading state */
	.loading-tab {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		padding: 5rem 2rem;
	}

	.loading-dot {
		display: inline-block;
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--text-dimmer);
		opacity: 0.4;
		animation: loading-pulse 1.2s ease-in-out infinite;
	}
	.loading-dot:nth-child(2) { animation-delay: 0.2s; }
	.loading-dot:nth-child(3) { animation-delay: 0.4s; }

	@keyframes loading-pulse {
		0%, 80%, 100% { transform: scale(0.8); opacity: 0.3; }
		40%            { transform: scale(1.2); opacity: 0.9; }
	}

	/* Character list inside the Characters tab */
	.char-list {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.char-card {
		cursor: default;
		border-radius: 6px;
		outline: 2px solid transparent;
		outline-offset: 2px;
		transition: outline-color 0.12s;
	}

	.char-card--active {
		outline-color: var(--text-accent);
	}

	/* ============================================================
	   Tab bar — sticky just below the app nav
	   ============================================================ */
	.tab-bar {
		display: flex;
		align-items: stretch;
		background: var(--bg-card);
		border-bottom: 1px solid var(--border);
		position: sticky;
		top: 52px; /* must match .app-nav height */
		z-index: 40;
		overflow-x: auto;
		scrollbar-width: none;
		flex-shrink: 0;
		padding-left: 4px;
	}
	.tab-bar::-webkit-scrollbar { display: none; }

	.tab-group {
		display: flex;
		align-items: stretch;
	}

	.tab-btn {
		font-family: var(--font-ui);
		font-size: 0.72rem;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-dimmer);
		background: transparent;
		border: none;
		border-bottom: 2px solid transparent;
		padding: 13px 16px 11px;
		cursor: pointer;
		white-space: nowrap;
		flex-shrink: 0;
		transition: color 0.12s, border-color 0.12s;
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
	}
	.tab-btn:hover  { color: var(--text-muted); }
	.tab-btn.active {
		color: var(--text-accent);
		border-bottom-color: var(--text-accent);
	}
	/* Tab icon — visible at all sizes; label hidden on very small screens */
	/* brightness(0) forces source image to black, then subsequent filters tint to theme color */
	.tab-icon {
		width: 20px;
		height: 20px;
		object-fit: contain;
		flex-shrink: 0;
		opacity: 0.38;
		transition: opacity 0.12s, filter 0.12s;
		/* Dark theme: tint to #E8A13B (amber gold) */
		filter: brightness(0) invert(0.55) sepia(1) saturate(5) brightness(0.91);
	}
	.tab-btn:hover .tab-icon { opacity: 0.68; }
	.tab-btn.active .tab-icon { opacity: 1; }

	/* ============================================================
	   Empty tab state
	   ============================================================ */
	.empty-tab {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 5rem 2rem;
		text-align: center;
		gap: 12px;
	}

	.empty-tab-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		opacity: 0.15;
	}
	.empty-tab-icon :global(svg) {
		width: 40px;
		height: 40px;
		fill: var(--text-dimmer);
	}
	.empty-tab-img {
		width: 80px;
		height: 80px;
		object-fit: contain;
		opacity: 0.2;
		filter: grayscale(0.4);
	}

	.empty-tab-title {
		font-family: var(--font-display);
		font-size: 0.88rem;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--text-dimmer);
	}

	.empty-tab-sub {
		font-family: var(--font-ui);
		font-size: 0.78rem;
		font-style: italic;
		color: var(--text-dimmer);
		max-width: 280px;
		line-height: 1.5;
	}

	/* ============================================================
	   Desktop layout ≥ 768 px — content + CC bar
	   ============================================================ */
	@media (min-width: 768px) {
		.page-layout {
			display: grid;
			grid-template-columns: 1fr 10px;
			align-items: start;
			gap: 0;
			margin-left: -1.25rem;
			margin-right: -1.25rem;
			margin-bottom: -4rem; /* cancel .app-main bottom padding */
			min-height: calc(100dvh + 4rem);
		}

		/* Content pane: natural flow, no sticky container */
		.content-pane {
			display: flex;
			flex-direction: column;
			min-width: 0;
		}

		/* Tab body padding (tab-bar sticky is inherited from base styles) */
		.tab-body {
			padding: 1rem 1.25rem 4rem;
		}

		/* ── Collapse control bar stretches to match content height ── */
		.cc-bar {
			display: block;
			background: var(--bg-card);
			border-left: 1px solid var(--border);
			border-right: 1px solid var(--border);
			align-self: stretch;
		}
	}

	/* ============================================================
	   Mobile layout < 768 px — single column, no CC bar
	   ============================================================ */
	@media (max-width: 767px) {
		.content-pane {
			display: flex;
			flex-direction: column;
		}

		.tab-body {
			padding: 0.75rem 0 3rem;
		}

		.cc-bar {
			display: none;
		}
	}

	/* Hide tab text labels on very small screens — icons + title tooltip suffice */
	@media (max-width: 520px) {
		.tab-label { display: none; }
		.tab-btn { padding: 10px 12px 8px; gap: 0; }
	}

	/* ===== Theme-aware tinting for tab icons and empty-state images ===== */
	/* Light theme: tint tab icons to #7A5A1B (dark amber brown) */
	@media (prefers-color-scheme: light) {
		:global(:root:not([data-theme='dark'])) .tab-icon {
			filter: brightness(0) invert(0.35) sepia(1) saturate(4) brightness(0.78);
		}
		:global(:root:not([data-theme='dark'])) .empty-tab-img {
			opacity: 0.25;
			filter: grayscale(0.5) brightness(0.7);
		}
	}
	:global(html[data-theme='light']) .tab-icon {
		filter: brightness(0) invert(0.35) sepia(1) saturate(4) brightness(0.78);
	}
	:global(html[data-theme='light']) .empty-tab-img {
		opacity: 0.25;
		filter: grayscale(0.5) brightness(0.7);
	}
</style>