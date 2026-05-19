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
		getExpeditions, isExpeditionLoading,
		persistExpeditionsNow,
		removeExpedition, addExpedition,
	} from '$lib/expeditionStore.svelte.js';
	import type { Expedition, Journey, Site, VowDifficulty, DelveTheme, DelveDomain, FoeDef, FoeQuantity, FoeEncounter } from '$lib/types.js';
	import { EXPEDITION_MARK_TICKS, DENIZEN_CELLS, DELVE_THEMES, DELVE_DOMAINS } from '$lib/types.js';
	import { RANK_COLORS } from '$lib/foeStore.svelte.js';
	import { renderNote } from '$lib/markdown.js';
	import { isDelveEnabled } from '$lib/expansionStore.svelte.js';
	import { setActiveExpeditionId } from '$lib/activeContext.svelte.js';
	import { tooltip } from '$lib/actions/tooltip.js';
	import { loadDelveData, buildCombinedTable } from '$lib/delveStore.svelte.js';
	import { rollFromRangeTable } from '$lib/oracleStore.svelte.js';
	import { appendLog, SESSION_LOG_ID } from '$lib/log.svelte.js';
	import { animateDice, DIE_BLACK, DIE_WHITE } from '$lib/dice.js';
	import { addEncounter } from '$lib/encounterStore.svelte.js';
	import { onMount } from 'svelte';

	import ProgressTrack    from '$lib/components/ProgressTrack.svelte';
	import FoePickerDialog  from '$lib/components/FoePickerDialog.svelte';
	import DenizenDialog    from '$lib/components/DenizenDialog.svelte';
	import ConfirmDialog    from '$lib/components/ConfirmDialog.svelte';
	import trashSvg              from '$icons/trash-solid-full.svg?raw';
	import checkSvg              from '$icons/circle-check-solid-full.svg?raw';
	import locationSvg           from '$icons/location-dot-solid-full.svg?raw';
	import journeyPlaceholderSvg from '$icons/treasure-map.svg?raw';
	import sitePlaceholderSvg    from '$icons/dungeon-gate.svg?raw';
	import diceD6Svg              from '$icons/dice-d6-light.svg?raw';
	import expeditionsIconSvg    from '$icons/Expeditions.svg?raw';

	let { showTitle = true }: { showTitle?: boolean } = $props();

	const JOURNEY_COLOR = '#E4AA28';
	const SITE_COLOR    = '#4472D0';

	type ExpTab = 'description' | 'notes' | 'core' | 'denizens';
	const JOURNEY_TAB_LABELS: { key: ExpTab; label: string }[] = [
		{ key: 'core',        label: 'Core' },
		{ key: 'description', label: 'Description' },
	];
	const SITE_TAB_LABELS: { key: ExpTab; label: string }[] = [
		{ key: 'core',     label: 'Core' },
		{ key: 'notes',    label: 'Description' },
		{ key: 'denizens', label: 'Denizens' },
	];

	const DIFFICULTIES: { value: VowDifficulty; label: string }[] = [
		{ value: 'troublesome', label: 'Troublesome' },
		{ value: 'dangerous',   label: 'Dangerous' },
		{ value: 'formidable',  label: 'Formidable' },
		{ value: 'extreme',     label: 'Extreme' },
		{ value: 'epic',        label: 'Epic' },
	];
	const DIFFICULTY_RANK: Record<string, number> = {
		troublesome: 1, dangerous: 2, formidable: 3, extreme: 4, epic: 5,
	};
	function diffBadgeStyle(d: string): string {
		const rc = RANK_COLORS[DIFFICULTY_RANK[d] ?? 2];
		return rc ? `background: ${rc.bg}22; color: ${rc.bg}` : '';
	}

	let activeExpId      = $state<string | null>(null);
	let activeTab        = $state<ExpTab>('core');
	let deleteDialogRef  = $state<{ open(): void; close(): void } | null>(null);
	let newlyCreatedId   = $state('');

	// New-journey / new-site dialog state (mirrors V1 pattern).
	let newJourneyDialogRef = $state<{ open(): void; close(): void } | null>(null);
	let newSiteDialogRef    = $state<{ open(): void; close(): void } | null>(null);

	// Site oracle roll state — gate concurrent rolls so the dice animation
	// can complete before the next roll fires.
	let rolling             = $state(false);
	let denizenDialogRef    = $state<{ open(site: Site): Promise<void>; close(): void } | null>(null);

	// Make sure delve themes/domains are loaded so buildCombinedTable works.
	onMount(() => { void loadDelveData(); });
	let newJourneyDifficulty = $state<VowDifficulty>('dangerous');
	let newSiteDifficulty    = $state<VowDifficulty>('dangerous');
	let newSiteTheme         = $state<string>('');
	let newSiteDomain        = $state<string>('');

	// Inline-edit state for journeys
	let editingName     = $state(false);
	let editingNotes    = $state(false);
	let nameBeforeEdit  = $state('');
	let nameInputEl     = $state<HTMLInputElement | null>(null);
	let notesTextareaEl = $state<HTMLTextAreaElement | null>(null);
	$effect(() => { if (editingName && nameInputEl) { nameInputEl.focus(); nameInputEl.select(); } });
	$effect(() => { if (editingNotes && notesTextareaEl) notesTextareaEl.focus(); });

	const expeditions = $derived(getExpeditions());
	const loading     = $derived(isExpeditionLoading());

	$effect(() => {
		if (!activeExpId && expeditions.length > 0) activeExpId = expeditions[0].id;
	});

	const activeExp     = $derived(expeditions.find(e => e.id === activeExpId));
	const activeJourney = $derived<Journey | null>(activeExp?.type === 'journey' ? (activeExp as Journey) : null);
	const activeSite    = $derived<Site | null>(activeExp?.type === 'site' ? (activeExp as Site) : null);

	// Publish active expedition id so MovesDialog / preconditions can see it.
	$effect(() => { setActiveExpeditionId(activeExpId ?? ''); });
	const tabLabels     = $derived(activeExp?.type === 'site' ? SITE_TAB_LABELS : JOURNEY_TAB_LABELS);

	function selectExp(id: string) {
		flushPersist();                       // commit pending edit before switching
		activeExpId = id;
		const next = expeditions.find(e => e.id === id);
		activeTab   = 'core';
		editingName = false;
		editingNotes = false;
		editingObjective = false;
	}

	// Site state
	let editingObjective       = $state(false);
	let foePickerRef           = $state<{ open(): Promise<void>; openForDenizen(): Promise<void>; close(): void } | null>(null);
	let denizenPickIndex       = $state(-1);
	let changeThemeDialogRef   = $state<{ open(): void; close(): void } | null>(null);
	let changeDomainDialogRef  = $state<{ open(): void; close(): void } | null>(null);
	let newThemeValue          = $state<string>('');
	let newDomainValue         = $state<string>('');

	function openChangeTheme()  { if (activeSite) { newThemeValue  = activeSite.theme;  changeThemeDialogRef?.open();  } }
	function openChangeDomain() { if (activeSite) { newDomainValue = activeSite.domain; changeDomainDialogRef?.open(); } }

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

	export function openChangeThemeForExp(expId: string) {
		flushPersist();
		activeExpId = expId;
		activeTab   = 'core';
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
		activeTab   = 'core';
		queueMicrotask(() => {
			if (activeSite) {
				newDomainValue = activeSite.domain;
				changeDomainDialogRef?.open();
			}
		});
	}
	function confirmChangeTheme()  { if (newThemeValue)  updateExp({ theme:  newThemeValue  as Site['theme']  }); }
	function confirmChangeDomain() { if (newDomainValue) updateExp({ domain: newDomainValue as Site['domain'] }); }

	// Combined feature / danger options for the inline combo boxes.
	// Unique-by-value so the dropdown isn't full of repeats from overlapping
	// theme + domain + common-dangers rolls.
	const featureOptions = $derived.by<string[]>(() => {
		if (!activeSite || !activeSite.theme || !activeSite.domain) return [];
		const table = buildCombinedTable(activeSite.theme as DelveTheme, activeSite.domain as DelveDomain, 'features');
		const seen = new Set<string>();
		const out: string[] = [];
		for (const e of table) {
			const v = typeof e.value === 'string' ? e.value : String(e.value);
			if (!seen.has(v)) { seen.add(v); out.push(v); }
		}
		return out;
	});
	const dangerOptions = $derived.by<string[]>(() => {
		if (!activeSite || !activeSite.theme || !activeSite.domain) return [];
		const table = buildCombinedTable(activeSite.theme as DelveTheme, activeSite.domain as DelveDomain, 'dangers');
		const seen = new Set<string>();
		const out: string[] = [];
		for (const e of table) {
			const v = typeof e.value === 'string' ? e.value : String(e.value);
			if (!seen.has(v)) { seen.add(v); out.push(v); }
		}
		return out;
	});

	// Theme/Domain randomize — just pick a random entry from the master list.
	function randomizeTheme() {
		if (!activeSite) return;
		const v = DELVE_THEMES[Math.floor(Math.random() * DELVE_THEMES.length)];
		updateExp({ theme: v as Site['theme'] });
	}
	function randomizeDomain() {
		if (!activeSite) return;
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
			persistExpeditionsNow().catch(err => console.error('[v2] expedition save failed', err));
		}, 1500);
		return () => {
			if (_saveTimer) {
				clearTimeout(_saveTimer);
				_saveTimer = null;
				persistExpeditionsNow().catch(err => console.error('[v2] expedition save failed', err));
			}
		};
	});

	function flushPersist() {
		if (_saveTimer) {
			clearTimeout(_saveTimer);
			_saveTimer = null;
			persistExpeditionsNow().catch(err => console.error('[v2] expedition save failed', err));
		}
	}

	function startEditName() {
		if (!activeExp) return;
		nameBeforeEdit = activeExp.name;
		editingName = true;
	}
	function commitName() { editingName = false; }
	function cancelName() {
		if (activeExp) updateExp({ name: nameBeforeEdit });
		editingName = false;
	}

	function handlePortrait(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file || !activeExp) return;
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
				updateExp({ imageUrl: canvas.toDataURL('image/jpeg', 0.85) });
			};
			img.src = reader.result as string;
		};
		reader.readAsDataURL(file);
	}

	function addJourney() {
		newJourneyDifficulty = 'dangerous';
		newJourneyDialogRef?.open();
	}
	async function confirmAddJourney() {
		const j: Journey = {
			id:         crypto.randomUUID(),
			type:       'journey',
			name:       'New Journey',
			difficulty: newJourneyDifficulty,
			ticks:      0,
			notes:      '',
			complete:   false,
			createdAt:  Date.now(),
		};
		await addExpedition(j);
		activeExpId    = j.id;
		newlyCreatedId = j.id;
		activeTab      = 'core';
		setTimeout(() => (newlyCreatedId = ''), 0);
	}

	function addSite() {
		newSiteDifficulty = 'dangerous';
		newSiteTheme      = '';
		newSiteDomain     = '';
		newSiteDialogRef?.open();
	}
	async function confirmAddSite() {
		const s: Site = {
			id:         crypto.randomUUID(),
			type:       'site',
			name:       'New Site',
			objective:  '',
			notes:      '',
			theme:      newSiteTheme as Site['theme'],
			domain:     newSiteDomain as Site['domain'],
			difficulty: newSiteDifficulty,
			ticks:      0,
			denizens:   Array(12).fill(''),
			complete:   false,
			createdAt:  Date.now(),
		};
		await addExpedition(s);
		activeExpId    = s.id;
		newlyCreatedId = s.id;
		activeTab      = 'core';
		setTimeout(() => (newlyCreatedId = ''), 0);
	}

	async function confirmDeleteExp() {
		if (!activeExp) return;
		const id = activeExp.id;
		await removeExpedition(id);
		if (activeExpId === id) activeExpId = null;
	}

	// Derived values shared across journey + site
	const markTicks     = $derived(activeExp ? EXPEDITION_MARK_TICKS[activeExp.difficulty] : 0);
	const progressScore = $derived(activeExp ? Math.floor(activeExp.ticks / 4) : 0);

	function markProgress()   { if (activeExp) updateExp({ ticks: Math.min(40, activeExp.ticks + markTicks) }); }
	function unmarkProgress() { if (activeExp) updateExp({ ticks: Math.max(0,  activeExp.ticks - markTicks) }); }
	function handleTrackChange(_o: number, n: number) { updateExp({ ticks: n }); }
	function toggleComplete() { if (activeExp) updateExp({ complete: !activeExp.complete }); }

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
			const site   = activeSite;
			const table  = buildCombinedTable(site.theme as DelveTheme, site.domain as DelveDomain, 'features');
			const result = rollFromRangeTable(table);
			const tensV  = Math.floor(result.roll % 100 / 10) || 10;
			const onesV  = result.roll % 10 || 10;
			await animateDice([
				{ sides: 10, value: tensV, color: DIE_BLACK },
				{ sides: 10, value: onesV, color: DIE_WHITE },
			]);
			const valueStr = typeof result.value === 'string' ? result.value : String(result.value);
			let resultHtml = `<div>Result: <strong>${valueStr}</strong>`;
			if (result.roll === 99)  resultHtml += ` <a class="change-theme-link"  data-expedition-id="${site.id}" href="#">Change Theme ↗</a>`;
			if (result.roll === 100) resultHtml += ` <a class="change-domain-link" data-expedition-id="${site.id}" href="#">Change Domain ↗</a>`;
			resultHtml += '</div>';
			appendLog(SESSION_LOG_ID, `Features: ${site.theme} + ${site.domain}`,
				`<div class="roll-line">Roll: d100 → ${result.roll}</div>` + resultHtml);
			updateExp({ currentFeature: valueStr });
		} finally {
			rolling = false;
		}
	}

	async function rollDanger() {
		if (!activeSite || !expHasThemeAndDomain || rolling) return;
		rolling = true;
		try {
			const site   = activeSite;
			const table  = buildCombinedTable(site.theme as DelveTheme, site.domain as DelveDomain, 'dangers');
			const result = rollFromRangeTable(table);
			const tensV  = Math.floor(result.roll % 100 / 10) || 10;
			const onesV  = result.roll % 10 || 10;
			await animateDice([
				{ sides: 10, value: tensV, color: DIE_BLACK },
				{ sides: 10, value: onesV, color: DIE_WHITE },
			]);
			const valueStr = typeof result.value === 'string' ? result.value : String(result.value);
			let resultHtml = `<div>Result: <strong>${valueStr}</strong>`;
			if (result.roll === 99)  resultHtml += ` <a class="change-theme-link"  data-expedition-id="${site.id}" href="#">Change Theme ↗</a>`;
			if (result.roll === 100) resultHtml += ` <a class="change-domain-link" data-expedition-id="${site.id}" href="#">Change Domain ↗</a>`;
			resultHtml += '</div>';
			appendLog(SESSION_LOG_ID, `Dangers: ${site.theme} + ${site.domain}`,
				`<div class="roll-line">Roll: d100 → ${result.roll}</div>` + resultHtml);
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
	async function handleDenizenSelected(foeDef: FoeDef, quantity: FoeQuantity, effectiveRank: number) {
		const enc: FoeEncounter = {
			id:            crypto.randomUUID(),
			foeId:         foeDef.id,
			quantity,
			effectiveRank: effectiveRank as 1|2|3|4|5,
			ticks:         0,
			notes:         '',
			customName:    '',
			vanquished:    false,
		};
		await addEncounter(enc);
	}

	const activeColor   = $derived(activeExp?.type === 'site' ? SITE_COLOR : JOURNEY_COLOR);
	const placeholderImg = $derived(activeExp?.type === 'site' ? sitePlaceholderSvg : journeyPlaceholderSvg);
</script>

<div class="ea-area">
	<header class="ea-header">
		{#if showTitle}
			<span class="ea-title-icon" aria-hidden="true">{@html expeditionsIconSvg}</span>
			<span class="ea-title">Expeditions</span>
		{/if}
		<div class="ea-header-actions">
			<button class="btn ea-hdr-btn" onclick={addJourney} title="Add journey">+ Journey</button>
			{#if isDelveEnabled()}
				<button class="btn ea-hdr-btn" onclick={addSite}    title="Add site">+ Site</button>
			{/if}
		</div>
	</header>

	{#if loading}
		<div class="ea-loading">Loading…</div>
	{:else if expeditions.length === 0}
		<div class="ea-empty">No expeditions yet — use the “+ Journey” or “+ Site” button in the header to add one.</div>
	{:else}
		<div class="ea-body">
			<nav class="ea-spines" aria-label="Expedition list">
				{#each expeditions as exp (exp.id)}
					{@const typeColor = exp.type === 'site' ? SITE_COLOR : JOURNEY_COLOR}
					<button
						class="ea-spine"
						class:ea-spine--active={exp.id === activeExpId}
						style="--ea-spine-color: {typeColor}"
						onclick={() => selectExp(exp.id)}
						use:tooltip={`${exp.name} (${exp.type})`}
					>
						<span class="ea-spine-name">{exp.name || 'Unnamed ' + (exp.type === 'site' ? 'Site' : 'Journey')}</span>
					</button>
				{/each}
			</nav>

			{#if activeExp}
				<!-- Name + delete header — coloured band on the LHS keyed to type
				     (green = journey, blue = site). -->
				<div class="ea-stage-header" style="--ea-nature: {activeColor}">
					{#if editingName}
						<input
							bind:this={nameInputEl}
							class="ea-stage-name-input"
							type="text"
							value={activeExp.name}
							placeholder={activeExp.type === 'site' ? 'Site name…' : 'Journey name…'}
							oninput={(e) => updateExp({ name: (e.target as HTMLInputElement).value })}
							onblur={commitName}
							onkeydown={(e) => {
								if (e.key === 'Enter') nameInputEl?.blur();
								if (e.key === 'Escape') cancelName();
							}}
						/>
					{:else}
						<button
							type="button"
							class="ea-stage-name ea-stage-name--editable"
							title="Click to rename"
							onclick={startEditName}
						>{activeExp.name || 'Unnamed'}</button>
					{/if}
					<button
						class="btn btn-icon icon-btn ea-stage-complete-btn"
						class:ea-stage-complete-btn--complete={activeExp.complete}
						onclick={toggleComplete}
						use:tooltip={activeExp.complete ? 'Mark active' : 'Mark complete'}
						aria-label={activeExp.complete ? 'Mark active' : 'Mark complete'}
						aria-pressed={activeExp.complete}
					>{@html activeExp.complete ? locationSvg : checkSvg}</button>
					<button
						class="btn btn-icon icon-btn ea-stage-delete-btn"
						onclick={() => deleteDialogRef?.open()}
						use:tooltip={'Delete expedition'}
						aria-label="Delete expedition"
					>{@html trashSvg}</button>
				</div>

				<div class="ea-stage" class:ea-stage--complete={activeExp.complete}>
					<!-- Card tab strip — Journey: Description/Core, Site: Notes/Core/Denizens. -->
					<div class="ea-tabs" role="tablist">
						{#each tabLabels as tab (tab.key)}
							<button
								role="tab"
								class="ea-tab"
								class:ea-tab--active={activeTab === tab.key}
								aria-selected={activeTab === tab.key}
								onclick={() => (activeTab = tab.key)}
							>{tab.label}</button>
						{/each}
					</div>

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
							<div class="ea-desc-section">
								{#if !editingNotes}
									<label class="ea-portrait-label" title="Click to change portrait">
										{#if activeExp.imageUrl}
											<img class="ea-portrait" src={activeExp.imageUrl} alt={activeExp.name} />
										{:else}
											<div class="ea-portrait ea-portrait--placeholder" aria-hidden="true">{@html placeholderImg}</div>
										{/if}
										<input
											type="file"
											accept="image/*"
											class="ea-portrait-input"
											onchange={handlePortrait}
											aria-label="Upload portrait"
										/>
									</label>
								{/if}

								{#if editingNotes}
									<textarea
										bind:this={notesTextareaEl}
										value={activeExp.notes ?? ''}
										oninput={(e) => updateExp({ notes: (e.target as HTMLTextAreaElement).value })}
										placeholder={activeExp.type === 'site'
											? 'Discoveries, encounters, observations…  (markdown supported)'
											: 'Waypoints, landmarks, perils encountered…  (markdown supported)'}
										class="ea-notes-input"
										rows="6"
										onblur={() => (editingNotes = false)}
									></textarea>
								{:else}
									<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
									<div
										class="ea-notes ea-notes--display"
										class:ea-notes--empty={!activeExp.notes?.trim()}
										role="button"
										tabindex="0"
										title="Click to edit (markdown supported)"
										onclick={() => (editingNotes = true)}
										onkeydown={(e) => { if (e.key === 'Enter') editingNotes = true; }}
									>
										{#if activeExp.notes?.trim()}
											{@html renderNote(activeExp.notes)}
										{:else}
											<span class="ea-notes-placeholder">{activeExp.type === 'site'
												? 'Discoveries, encounters, observations…'
												: 'Waypoints, landmarks, perils encountered…'}</span>
										{/if}
									</div>
								{/if}
							</div>

						<!-- ── Core — pills + objective + difficulty + progress + complete. ── -->
						{:else if activeTab === 'core'}
							<div class="ea-pills-row">
								{#if activeExp.type === 'site'}
									<span class="ea-badge ea-badge--site">Site</span>
								{:else}
									<span class="ea-badge ea-badge--type">Journey</span>
								{/if}
								<span class="ea-badge ea-badge--diff" style={diffBadgeStyle(activeExp.difficulty)}>
									{DIFFICULTIES.find(d => d.value === activeExp.difficulty)?.label ?? activeExp.difficulty}
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
									<select id="ea-theme-{activeSite.id}" class="ea-input"
										value={activeSite.theme}
										onchange={(e) => updateExp({ theme: (e.target as HTMLSelectElement).value as Site['theme'] })}
									>
										{#each DELVE_THEMES as t}<option value={t}>{t}</option>{/each}
									</select>
									<button class="btn btn-icon ea-dice-btn" onclick={randomizeTheme}
										use:tooltip={'Pick a random theme'} aria-label="Random theme">{@html diceD6Svg}</button>
								</div>
								<div class="ea-field-row">
									<label class="ea-field-label" for="ea-domain-{activeSite.id}">Domain</label>
									<select id="ea-domain-{activeSite.id}" class="ea-input"
										value={activeSite.domain}
										onchange={(e) => updateExp({ domain: (e.target as HTMLSelectElement).value as Site['domain'] })}
									>
										{#each DELVE_DOMAINS as d}<option value={d}>{d}</option>{/each}
									</select>
									<button class="btn btn-icon ea-dice-btn" onclick={randomizeDomain}
										use:tooltip={'Pick a random domain'} aria-label="Random domain">{@html diceD6Svg}</button>
								</div>
								<div class="ea-field-row">
									<label class="ea-field-label" for="ea-feature-{activeSite.id}">Feature</label>
									<select id="ea-feature-{activeSite.id}" class="ea-input"
										value={activeSite.currentFeature ?? ''}
										onchange={(e) => updateExp({ currentFeature: (e.target as HTMLSelectElement).value })}
										disabled={!expHasThemeAndDomain}
									>
										<option value=""></option>
										{#each featureOptions as f}<option value={f}>{f}</option>{/each}
									</select>
									<button class="btn btn-icon ea-dice-btn" onclick={rollFeature}
										disabled={!expHasThemeAndDomain || rolling}
										use:tooltip={expHasThemeAndDomain ? 'Roll for a feature' : 'Set theme and domain first'}
										aria-label="Random feature">{@html diceD6Svg}</button>
								</div>
								<div class="ea-field-row">
									<label class="ea-field-label" for="ea-danger-{activeSite.id}">Danger</label>
									<select id="ea-danger-{activeSite.id}" class="ea-input"
										value={activeSite.currentDanger ?? ''}
										onchange={(e) => updateExp({ currentDanger: (e.target as HTMLSelectElement).value })}
										disabled={!expHasThemeAndDomain}
									>
										<option value=""></option>
										{#each dangerOptions as d}<option value={d}>{d}</option>{/each}
									</select>
									<button class="btn btn-icon ea-dice-btn" onclick={rollDanger}
										disabled={!expHasThemeAndDomain || rolling}
										use:tooltip={expHasThemeAndDomain ? 'Roll for a danger' : 'Set theme and domain first'}
										aria-label="Random danger">{@html diceD6Svg}</button>
								</div>

							{/if}

							<!-- Difficulty is set in the new-journey / new-site dialog,
							     surfaced via the rank-coloured pill above. -->

							<!-- Progress track -->
							<div class="ea-section ea-track-group">
								<div class="ea-track-label-row">
									<span class="ea-section-label">Progress track</span>
									<span class="ea-track-tally">{progressScore}/10 boxes{activeExp.ticks % 4 ? `, ${activeExp.ticks % 4}/4 ticks` : ''}</span>
								</div>
								<div class="ea-track-controls">
									<ProgressTrack
										label=""
										value={activeExp.ticks}
										color={activeColor}
										onchange={handleTrackChange}
									/>
									<div class="ea-track-btns">
										<button class="btn-progress" onclick={unmarkProgress} disabled={activeExp.ticks <= 0}  title="Unmark progress (−{markTicks} ticks)">−{markTicks}</button>
										<button class="btn-progress" onclick={markProgress}   disabled={activeExp.ticks >= 40} title="Mark progress (+{markTicks} ticks)">+{markTicks}</button>
									</div>
								</div>
							</div>

						<!-- ── Denizens — 12-cell d100 grid, foe picker per row. ── -->
						{:else if activeTab === 'denizens' && activeSite}
							<div class="ea-denizen-top">
								<button class="btn btn-sm"
									onclick={rollDenizen}
									disabled={rolling}
									use:tooltip={'Roll d100 for a denizen'}
								>Roll Denizen</button>
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
												oninput={(e) => handleDenizenChange(i, (e.target as HTMLInputElement).value)}
											/>
											<button
												class="ea-denizen-pick-btn"
												onclick={() => openDenizenPicker(i)}
												title="Pick a foe for this denizen"
												aria-label="Pick foe for denizen {i + 1}"
											>+</button>
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
		<p>Permanently delete <strong>{activeExp.name || (activeExp.type === 'site' ? 'this site' : 'this journey')}</strong>? This cannot be undone.</p>
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
	confirmLabel="Start Journey"
	confirmClass="btn-primary"
	cancelLabel="Cancel"
	accentColor={JOURNEY_COLOR}
	onconfirm={confirmAddJourney}
>
	<fieldset style="border: none; padding: 0; margin: 0 0 4px;">
		<legend style="font-family: var(--font-ui); font-size: 0.65rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-dimmer); margin-bottom: 5px;">Difficulty</legend>
		{#each DIFFICULTIES as opt}
			<label style="display: flex; align-items: center; gap: 6px; font-family: var(--font-ui); font-size: 0.78rem; color: var(--text); cursor: pointer; margin-bottom: 3px;">
				<input type="radio" bind:group={newJourneyDifficulty} value={opt.value} /> {opt.label}
			</label>
		{/each}
	</fieldset>
</ConfirmDialog>

<!-- New Site dialog — V1 pattern: difficulty + theme + domain (both required). -->
<ConfirmDialog
	bind:this={newSiteDialogRef}
	title="New Site"
	confirmLabel="Discover Site"
	confirmClass="btn-primary"
	cancelLabel="Cancel"
	accentColor={SITE_COLOR}
	confirmDisabled={!newSiteTheme || !newSiteDomain}
	onconfirm={confirmAddSite}
>
	<fieldset style="border: none; padding: 0; margin: 0 0 8px;">
		<legend style="font-family: var(--font-ui); font-size: 0.65rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-dimmer); margin-bottom: 5px;">Difficulty</legend>
		{#each DIFFICULTIES as opt}
			<label style="display: flex; align-items: center; gap: 6px; font-family: var(--font-ui); font-size: 0.78rem; color: var(--text); cursor: pointer; margin-bottom: 3px;">
				<input type="radio" bind:group={newSiteDifficulty} value={opt.value} /> {opt.label}
			</label>
		{/each}
	</fieldset>
	<div style="display: flex; flex-direction: column; gap: 6px; margin-bottom: 4px;">
		<div style="display: flex; align-items: center; gap: 8px;">
			<label for="ns-theme" style="font-family: var(--font-ui); font-size: 0.65rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-dimmer); width: 56px; flex-shrink: 0;">Theme <span style="color: var(--color-danger);">*</span></label>
			<select id="ns-theme" style="flex: 1; font-family: var(--font-ui); font-size: 0.75rem; background: var(--bg-control); border: 1px solid var(--border); border-radius: 4px; color: var(--text); padding: 3px 6px; outline: none;" bind:value={newSiteTheme}>
				<option value="" disabled>Select a theme…</option>
				{#each DELVE_THEMES as t (t)}<option value={t}>{t}</option>{/each}
			</select>
		</div>
		<div style="display: flex; align-items: center; gap: 8px;">
			<label for="ns-domain" style="font-family: var(--font-ui); font-size: 0.65rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-dimmer); width: 56px; flex-shrink: 0;">Domain <span style="color: var(--color-danger);">*</span></label>
			<select id="ns-domain" style="flex: 1; font-family: var(--font-ui); font-size: 0.75rem; background: var(--bg-control); border: 1px solid var(--border); border-radius: 4px; color: var(--text); padding: 3px 6px; outline: none;" bind:value={newSiteDomain}>
				<option value="" disabled>Select a domain…</option>
				{#each DELVE_DOMAINS as d (d)}<option value={d}>{d}</option>{/each}
			</select>
		</div>
	</div>
	{#if !newSiteTheme || !newSiteDomain}
		<p style="font-family: var(--font-ui); font-size: 0.72rem; color: var(--text-dimmer); margin: 0; font-style: italic;">
			Theme and domain are required to discover a site.
		</p>
	{/if}
</ConfirmDialog>

{#if activeSite}
	<ConfirmDialog
		bind:this={changeThemeDialogRef}
		title="Change Theme"
		confirmLabel="Change"
		onconfirm={confirmChangeTheme}
	>
		<div style="display: flex; flex-direction: column; gap: 8px; min-width: 240px;">
			<label style="font-family: var(--font-ui); font-size: 0.75rem; color: var(--text-muted);" for="ea-theme-{activeSite.id}">Theme</label>
			<select id="ea-theme-{activeSite.id}" class="ea-select" bind:value={newThemeValue}>
				<option value="">— None —</option>
				{#each DELVE_THEMES as t}
					<option value={t}>{t}</option>
				{/each}
			</select>
		</div>
	</ConfirmDialog>

	<ConfirmDialog
		bind:this={changeDomainDialogRef}
		title="Change Domain"
		confirmLabel="Change"
		onconfirm={confirmChangeDomain}
	>
		<div style="display: flex; flex-direction: column; gap: 8px; min-width: 240px;">
			<label style="font-family: var(--font-ui); font-size: 0.75rem; color: var(--text-muted);" for="ea-domain-{activeSite.id}">Domain</label>
			<select id="ea-domain-{activeSite.id}" class="ea-select" bind:value={newDomainValue}>
				<option value="">— None —</option>
				{#each DELVE_DOMAINS as d}
					<option value={d}>{d}</option>
				{/each}
			</select>
		</div>
	</ConfirmDialog>
{/if}

<style>
	.ea-area { display: flex; flex-direction: column; height: 100%; min-height: 0; }

	.ea-header {
		display: flex; align-items: center; gap: 10px;
		padding: 6px 12px;
		border-bottom: 1px solid var(--border);
		background: var(--bg-control);
		flex-shrink: 0;
	}
	.ea-title-icon {
		display: inline-flex; align-items: center; justify-content: center;
		width: 18px; height: 18px;
		flex-shrink: 0;
		color: var(--text-accent);
	}
	.ea-title-icon :global(svg) { width: 100%; height: 100%; fill: currentColor; }
	.ea-title-icon :global(svg) :global(path) { fill: currentColor; }
	.ea-title {
		font-family:    var(--font-display);
		font-size:      calc(0.82rem * var(--font-display-scale));
		font-weight:    700;
		letter-spacing: 0.08em;
		text-transform: var(--font-display-transform);
		color:          var(--text-accent);
	}
	.ea-header-actions { display: flex; align-items: center; gap: 6px; flex: 1; justify-content: flex-end; }
	.ea-hdr-btn { font-size: 0.7rem; padding: 3px 9px; min-width: unset; }

	.ea-loading, .ea-empty {
		flex: 1; display: flex; align-items: center; justify-content: center;
		font-family: var(--font-ui); font-size: 0.8rem; color: var(--text-muted);
		font-style: italic; padding: 20px; text-align: center;
	}

	.ea-body {
		display: grid;
		grid-template-columns: 36px 1fr;
		grid-template-rows: auto 1fr;
		flex: 1; min-height: 0;
	}
	.ea-spines       { grid-row: 1 / span 2; }
	.ea-stage-header { grid-column: 2; grid-row: 1; }
	.ea-stage {
		grid-column: 2; grid-row: 2;
		padding: 0 12px 10px 0;
		min-height: 0; min-width: 0;
		overflow: auto;
		display: flex; flex-direction: column;
	}
	.ea-stage--complete .ea-card { opacity: 0.7; }

	/* Spine strip — type-color accent on active. */
	.ea-spines {
		display: flex; flex-direction: column; align-items: stretch;
		gap: 0; padding: 0; overflow-y: auto;
		border-right: 1px solid var(--border);
		background: transparent;
	}
	.ea-spine {
		all: unset;
		cursor: pointer;
		font-family:    var(--font-ui);
		font-size:      0.72rem;
		font-weight:    600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color:          var(--text-dimmer);
		background:     transparent;
		border: none;
		border-right: 2px solid transparent;
		padding: 16px 7px 16px 7px;
		text-align: center;
		writing-mode: sideways-lr;
		flex: 1 1 0; min-height: 0; overflow: hidden;
		margin-right: -1px;
		transition: color 0.12s, border-color 0.12s;
	}
	.ea-spine:hover { color: var(--text-muted); }
	/* Active spine uses the same amber accent as Characters/Foes spines —
	   the type colour (journey/site) lives on the stage header's LHS band,
	   not on the spine itself. */
	.ea-spine--active {
		color:              var(--text-accent);
		border-right-color: var(--text-accent);
	}
	.ea-spine-name {
		display: inline-block;
		max-height: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* Stage name banner — coloured band on the LHS keyed to type. */
	.ea-stage-header {
		display: flex; align-items: center; gap: 6px;
		padding: 5px 10px;
		background: var(--bg-control);
		border: none;
		border-left: 3px solid var(--ea-nature, var(--text-muted));
		border-bottom: 1px solid var(--border);
	}
	.ea-stage-name {
		appearance:     none;
		-webkit-appearance: none;
		text-align:     left;
		background:     transparent;
		flex: 1; margin: 0;
		font-family:    var(--font-display);
		font-size:      calc(0.82rem * var(--font-display-scale));
		font-weight:    var(--font-display-weight);
		font-variant:   var(--font-display-variant);
		letter-spacing: 0.08em;
		text-transform: var(--font-display-transform);
		color:          var(--text-accent);
		overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
	}
	.ea-stage-name--editable {
		cursor: pointer;
		padding: 2px 6px;
		border: 1px solid transparent;
		border-radius: 3px;
		transition: background 0.12s, border-color 0.12s;
	}
	.ea-stage-name--editable:hover {
		background:   var(--bg-hover);
		border-color: var(--border);
	}
	.ea-stage-name-input {
		flex: 1;
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
		outline:        none;
	}
	.ea-stage-name-input:focus { border-color: var(--text-accent); }
	.ea-stage-delete-btn { flex-shrink: 0; opacity: 0.7; transition: opacity 0.12s, color 0.12s; }
	.ea-stage-delete-btn:hover { opacity: 1; color: var(--color-danger); }

	/* Mark-complete toggle — square icon-only sibling of the delete button.
	   Icon renders the active-state action: circle-check when not complete
	   (clicking marks it complete), location-dot when complete (clicking
	   marks it active again). Green tint when currently marked complete. */
	.ea-stage-complete-btn { flex-shrink: 0; opacity: 0.7; transition: opacity 0.12s, color 0.12s; }
	.ea-stage-complete-btn:hover { opacity: 1; color: #E4AA28; }
	.ea-stage-complete-btn--complete { opacity: 1; color: #E4AA28; }

	/* Lock all stage-header icon button SVGs to a 12px square so non-square
	   FontAwesome icons (e.g. location-dot 3:4) don't stretch the button.
	   pointer-events: none lets the native `title` tooltip on the button
	   surface even when the cursor is over the SVG path. */
	.ea-stage-complete-btn :global(svg),
	.ea-stage-delete-btn   :global(svg) {
		width: 12px; height: 12px;
		flex-shrink: 0;
		pointer-events: none;
		fill: currentColor;
	}
	.ea-stage-complete-btn :global(svg) :global(path),
	.ea-stage-delete-btn   :global(svg) :global(path) {
		fill: currentColor;
	}

	/* Tabs — V1 tab-btn style. */
	.ea-tabs {
		display: flex; align-items: stretch; gap: 0;
		margin-bottom: 8px;
		border-bottom: 1px solid var(--border);
	}
	.ea-tab {
		all: unset; cursor: pointer;
		font-family:    var(--font-ui);
		font-size:      0.72rem;
		font-weight:    600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color:          var(--text-dimmer);
		background:     transparent;
		border: none; border-bottom: 2px solid transparent;
		padding: 7px 8px 6px;
		white-space: nowrap; flex-shrink: 0;
		margin-bottom: -1px;
		transition: color 0.12s, border-color 0.12s;
		display: inline-flex; align-items: center; gap: 0.35rem;
	}
	.ea-tab:hover { color: var(--text-muted); }
	.ea-tab--active { color: var(--text-accent); border-bottom-color: var(--text-accent); }

	/* Card content — theme-aware: cream (--bg-inset) in light, near-black in dark. */
	.ea-card {
		flex: 1; min-height: 200px;
		background: var(--bg-inset);
		border: none; border-radius: 0;
		padding: 7px;
		overflow: auto;
		position: relative;
		display: flex; flex-direction: column; gap: 10px;
	}

	/* ── Description tab ── portrait floats right; notes wrap. */
	.ea-desc-section { display: block; }
	.ea-portrait-label {
		display: contents;
		cursor: pointer;
	}
	.ea-portrait {
		float: right;
		width: 170px; height: 170px; max-height: 240px;
		object-fit: cover;
		margin: 0 0 10px 14px;
		border: 1px solid var(--border);
		border-radius: 6px;
		opacity: 0.95;
		shape-outside: margin-box;
		transition: opacity 0.12s;
	}
	.ea-portrait-label:hover .ea-portrait { opacity: 0.75; }
	.ea-portrait--placeholder {
		background: var(--bg-inset);
		display: flex; align-items: center; justify-content: center;
		color: var(--text-dimmer);
	}
	.ea-portrait--placeholder :global(svg) {
		width: 60%; height: 60%; fill: var(--text-dimmer);
	}
	.ea-portrait-input {
		position: absolute;
		left: -9999px; width: 1px; height: 1px;
	}

	.ea-notes--display {
		cursor: pointer;
		min-height: 1.5em;
		font-family: var(--font-ui);
		font-size: 0.85rem;
		line-height: 1.5;
		color: var(--text);
	}
	.ea-notes--display:focus-visible {
		outline: 2px solid var(--text-accent);
		outline-offset: 2px;
		border-radius: 2px;
	}
	.ea-notes--display :global(p) { margin: 0 0 0.6em; }
	.ea-notes--display :global(p:last-child) { margin-bottom: 0; }
	.ea-notes--display :global(ul),
	.ea-notes--display :global(ol) {
		margin: 0 0 0.6em;
		padding-left: 1.2em;
	}
	.ea-notes--display :global(strong) { font-weight: 700; color: var(--text); }
	.ea-notes--display :global(em)     { font-style: italic; }
	.ea-notes-placeholder {
		font-family: var(--font-ui);
		font-size: 0.85rem;
		color: var(--text-dimmer);
		font-style: italic;
	}
	.ea-notes-input {
		width: 100%;
		min-height: 7em;
		font-family: var(--font-ui);
		font-size: 0.85rem;
		line-height: 1.5;
		color: var(--text);
		background: var(--bg-inset);
		border: 1px solid var(--border);
		border-radius: 4px;
		padding: 8px 10px;
		outline: none;
		resize: vertical;
	}
	.ea-notes-input:focus { border-color: var(--text-accent); }

	/* ── Core tab ── pills, difficulty selector, progress, complete. */
	.ea-pills-row {
		display: flex; flex-wrap: wrap; gap: 5px; align-items: center;
		border-bottom: 1px solid #C3BAA1;
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
		background: rgba(228,170,40,0.15);
		color: #E4AA28;
	}
	.ea-badge--site {
		background: rgba(68,114,208,0.15);
		color: #4472D0;
	}
	.ea-badge--diff { border-color: transparent; }

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
	.ea-input:focus { border-color: var(--text-accent); }

	/* Square d6 button sitting next to a combo box. Sized to match the
	   combo's height (22 px) so the row reads as one control. */
	.ea-dice-btn {
		all: unset; cursor: pointer;
		box-sizing: border-box;
		width: 22px; height: 22px;
		display: inline-flex; align-items: center; justify-content: center;
		border: 1px solid var(--border-mid);
		border-radius: 3px;
		background: transparent;
		color: var(--text-muted);
		flex-shrink: 0;
		transition: color 0.12s, border-color 0.12s, background 0.12s;
	}
	.ea-dice-btn:hover:not(:disabled) { color: var(--text-accent); border-color: var(--text-accent); }
	.ea-dice-btn:disabled              { opacity: 0.4; cursor: not-allowed; }
	.ea-dice-btn :global(svg)          { width: 12px; height: 12px; fill: currentColor; pointer-events: none; }
	.ea-dice-btn :global(svg) :global(path) { fill: currentColor; }

	/* Roll Denizen button row at the top of the Denizens tab. */
	.ea-denizen-top { display: flex; justify-content: flex-end; margin-bottom: 8px; }

	/* Objective lives at the top of the Notes tab — give it bottom margin so
	   the portrait + prose flow below it without crowding the input. */
	.ea-objective-row { margin-bottom: 10px; }

	/* Denizens tab — 12-cell grid, always 2 columns × 6 rows. */
	.ea-denizen-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 6px;
	}
	.ea-denizen-cell {
		display: flex; flex-direction: column; gap: 2px;
		padding: 6px 8px;
		min-width: 0;
		background: var(--bg-inset);
		border: 1px solid var(--border);
		border-radius: 4px;
	}
	.ea-denizen-meta {
		display: flex; justify-content: space-between;
		font-family: var(--font-ui);
		font-size: 0.6rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-dimmer);
	}
	.ea-denizen-freq { font-weight: 700; }
	.ea-denizen-input-row { display: flex; gap: 4px; }
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
	.ea-denizen-input:focus { border-color: var(--text-accent); }
	.ea-denizen-pick-btn {
		display:         inline-flex;
		align-items:     center;
		justify-content: center;
		flex-shrink:     0;
		width:           22px;
		height:          22px;
		padding:         0;
		font-family:     var(--font-ui);
		font-size:       0.82rem;
		font-weight:     600;
		line-height:     1;
		background:      transparent;
		border:          1px solid var(--border-mid);
		border-radius:   3px;
		color:           var(--text-muted);
		cursor:          pointer;
		transition:      background 0.12s, color 0.12s, border-color 0.12s;
	}
	.ea-denizen-pick-btn:hover {
		background:    var(--bg-hover);
		color:         var(--text-accent);
		border-color:  var(--text-accent);
	}

	.ea-field-row {
		display: flex; align-items: center; gap: 8px;
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
	.ea-select {
		font-family: var(--font-ui);
		font-size: 0.78rem;
		color: var(--text);
		background: var(--bg-control);
		border: 1px solid var(--border);
		border-radius: 4px;
		padding: 3px 6px;
		outline: none;
	}

	.ea-section { display: flex; flex-direction: column; gap: 4px; }
	.ea-section-label {
		font-family: var(--font-ui);
		font-size: 0.7rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--text-dimmer);
	}
	.ea-track-group {
		display: flex; flex-direction: column; gap: 6px;
		align-self: flex-start;
	}
	.ea-track-label-row {
		display: flex; justify-content: space-between; align-items: baseline; gap: 8px;
	}
	.ea-track-tally {
		font-family: var(--font-ui);
		font-size: 0.65rem;
		color: var(--text-dimmer);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
	.ea-track-controls { display: flex; align-items: center; gap: 6px; }
	.ea-track-btns { display: flex; gap: 4px; flex-shrink: 0; }
	.ea-track-btns :global(.btn-progress) {
		display: inline-flex; align-items: center; justify-content: center;
		height: 22px;
		padding: 0 7px;
		border-radius: 3px;
		border: 1px solid var(--border-mid);
		background: transparent;
		color: var(--text-muted);
		font-family: var(--font-ui);
		font-size: 0.68rem;
		font-weight: 600;
		letter-spacing: 0.02em;
		cursor: pointer;
		white-space: nowrap;
		transition: background 0.12s, color 0.12s;
	}
	.ea-track-btns :global(.btn-progress:hover:not(:disabled)) {
		background: var(--bg-hover);
		color: var(--text);
	}
	.ea-track-btns :global(.btn-progress:disabled) { opacity: 0.35; cursor: not-allowed; }


</style>
