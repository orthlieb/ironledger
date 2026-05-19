<script lang="ts">
	/**
	 * FoesArea (v2 prototype) — Foes deck stage.
	 *
	 * Mirrors CharactersArea: vertical spine tabs on the LEFT (one per foe),
	 * a stage on the right with a name+delete header and two card tabs
	 * — Description / Core. Description: portrait floated right with the
	 * foe's prose + features/drives/tactics wrapping around it. Core:
	 * pills (nature/rank/quantity/harm/progress), escalating spinners,
	 * progress track, and the vanquish toggle. No inner collapsible — the
	 * card scrolls if content overflows.
	 *
	 * All edits persist via the existing encounterStore.
	 */
	import { getEncounters, isEncounterLoading, flushEncountersToApi, removeEncounter, addEncounter } from '$lib/encounterStore.svelte.js';
	import { setActiveFoeId } from '$lib/activeContext.svelte.js';
	import { tooltip } from '$lib/actions/tooltip.js';
	import {
		findFoe,
		RANK_COLORS, FOE_RANKS, FOE_QUANTITIES, FOE_NATURE_COLORS,
		resolveFoeDescription,
	} from '$lib/foeStore.svelte.js';
	import { foePortraitUrl, UNKNOWN_FOE_PORTRAIT } from '$lib/foePortrait.js';
	import type { FoeEncounter, FoeDef, FoeQuantity } from '$lib/types.js';

	import ProgressTrack   from '$lib/components/ProgressTrack.svelte';
	import FoePickerDialog from '$lib/components/FoePickerDialog.svelte';
	import ConfirmDialog   from '$lib/components/ConfirmDialog.svelte';
	import trashSvg from '$icons/trash-solid-full.svg?raw';
	import swordSvg from '$icons/sword-solid-full.svg?raw';
	import skullSvg from '$icons/skull-crossbones-solid-full.svg?raw';
	import foesIconSvg from '$icons/Foes.svg?raw';
	import { headingText } from '$lib/fontStore.svelte.js';

	let { showTitle = true }: { showTitle?: boolean } = $props();

	type FoeTab = 'description' | 'core';
	const TAB_LABELS: { key: FoeTab; label: string }[] = [
		{ key: 'core',        label: 'Core' },
		{ key: 'description', label: 'Description' },
	];

	let activeFoeId    = $state<string | null>(null);
	let activeTab      = $state<FoeTab>('core');
	let foePickerRef   = $state<{ open(): Promise<void>; close(): void } | null>(null);
	let deleteDialogRef = $state<{ open(): void; close(): void } | null>(null);
	let imgVisible     = $state(true);
	let editingName    = $state(false);

	const encounters = $derived(getEncounters());
	const loading    = $derived(isEncounterLoading());

	$effect(() => {
		if (!activeFoeId && encounters.length > 0) activeFoeId = encounters[0].id;
	});

	const activeEnc = $derived(encounters.find(e => e.id === activeFoeId));
	const activeDef = $derived<FoeDef | undefined>(activeEnc ? findFoe(activeEnc.foeId) : undefined);

	// Publish the active foe id so MovesDialog / log / preconditions can see it.
	$effect(() => { setActiveFoeId(activeFoeId ?? ''); });

	export function selectFoe(id: string) {
		activeFoeId = id;
		activeTab   = 'core';
		imgVisible  = true;
		editingName = false;
	}

	async function handleFoeSelected(foeDef: FoeDef, quantity: FoeQuantity, effectiveRank: number) {
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
		activeFoeId = enc.id;
		activeTab   = 'core';
	}

	// Patch fields onto the active encounter proxy directly. The store's
	// _encounters array identity is preserved; the per-encounter object is
	// the proxy from getEncounters() — assigning fields here writes through
	// the proxy so anything binding to it stays in sync, and the deep-snapshot
	// effect below schedules the debounced API flush.
	function update(patch: Partial<FoeEncounter>) {
		if (!activeEnc) return;
		Object.assign(activeEnc, patch);
	}

	// Debounced flush — watch the active encounter's snapshot; on any
	// change, schedule a single API write 1.5 s later. Cleanup flushes
	// pending edits on switch / unmount so nothing is dropped.
	let _saveTimer: ReturnType<typeof setTimeout> | null = null;
	$effect(() => {
		if (!activeEnc) return;
		$state.snapshot(activeEnc);
		if (_saveTimer) clearTimeout(_saveTimer);
		_saveTimer = setTimeout(() => {
			_saveTimer = null;
			void flushEncountersToApi();
		}, 1500);
		return () => {
			if (_saveTimer) {
				clearTimeout(_saveTimer);
				_saveTimer = null;
				void flushEncountersToApi();
			}
		};
	});

	async function confirmDeleteFoe() {
		if (!activeEnc) return;
		const id = activeEnc.id;
		await removeEncounter(id);
		if (activeFoeId === id) activeFoeId = null;
	}

	// ── Derived combat values (mirror FoeCard) ────────────────────────────
	const displayName     = $derived(activeEnc?.customName?.trim() || activeDef?.name || activeEnc?.foeId || '');
	const rankInfo        = $derived(activeEnc ? FOE_RANKS[activeEnc.effectiveRank] : undefined);
	const qtyDef          = $derived(activeEnc ? FOE_QUANTITIES.find(q => q.value === activeEnc.quantity) : undefined);
	const natureColor     = $derived(activeDef ? (FOE_NATURE_COLORS[activeDef.nature] ?? '#7A9AB8') : '#7A9AB8');
	const progressScore   = $derived(activeEnc ? Math.floor(activeEnc.ticks / 4) : 0);
	const resolvedDesc    = $derived(activeDef ? resolveFoeDescription(activeDef) : '');
	const hasDescription  = $derived(
		!!resolvedDesc ||
		(activeDef?.features?.length ?? 0) > 0 ||
		(activeDef?.drives?.length ?? 0) > 0 ||
		(activeDef?.tactics?.length ?? 0) > 0,
	);

	// Escalating harm (YRT extension)
	const currentHarm = $derived(activeEnc?.currentHarm ?? 1);
	const harmCap     = $derived(activeEnc ? Math.min(activeEnc.effectiveRank + 1, 5) : 1);
	function increaseHarm() { update({ currentHarm: Math.min(harmCap, currentHarm + 1) }); }
	function decreaseHarm() { update({ currentHarm: Math.max(1,       currentHarm - 1) }); }

	// Escalating defense (YRT extension)
	const defenseCap     = $derived(activeEnc ? (FOE_RANKS[activeEnc.effectiveRank]?.progressPerHit ?? 8) - 1 : 0);
	const currentDefense = $derived(activeEnc?.currentDefense ?? 0);
	const progressTickVal = $derived(
		activeDef?.escalatesDefense
			? ((rankInfo?.progressPerHit ?? 1) - currentDefense)
			: (rankInfo?.progressPerHit ?? 0),
	);
	function increaseDefense() { update({ currentDefense: Math.min(defenseCap, currentDefense + 1) }); }
	function decreaseDefense() { update({ currentDefense: Math.max(0,           currentDefense - 1) }); }

	// Progress track
	function handleTrackChange(_old: number, next: number) { update({ ticks: next }); }
	function markProgress()   { if (activeEnc) update({ ticks: Math.min(40, activeEnc.ticks + progressTickVal) }); }
	function unmarkProgress() { if (activeEnc) update({ ticks: Math.max(0,  activeEnc.ticks - progressTickVal) }); }

	// Vanquish
	function toggleVanquished() { update({ vanquished: !(activeEnc?.vanquished) }); }
	export function vanquishActiveFoe() { if (activeEnc && !activeEnc.vanquished) update({ vanquished: true }); }
	export function applyMenace(value: number) { if (activeEnc) update({ ticks: Math.min(40, activeEnc.ticks + value * progressTickVal) }); }

	// Name editing — matches CharactersArea / ExpeditionsArea pattern.
	let nameInputEl    = $state<HTMLInputElement | null>(null);
	let nameBeforeEdit = '';
	$effect(() => { if (editingName && nameInputEl) { nameInputEl.focus(); nameInputEl.select(); } });
	function startEditName() {
		if (!activeEnc) return;
		nameBeforeEdit = activeEnc.customName ?? '';
		editingName = true;
	}
	function commitName() { editingName = false; }
	function cancelName() {
		if (activeEnc) update({ customName: nameBeforeEdit });
		editingName = false;
	}

	function rankBadgeStyle(rank: number): string {
		const rc = RANK_COLORS[rank];
		return rc ? `background:${rc.bg}22; color:${rc.bg}` : '';
	}
	function imageUrl(def: FoeDef): string {
		return foePortraitUrl(def.name, def.images);
	}
</script>

<div class="fa-area">
	<header class="fa-header">
		{#if showTitle}
			<span class="fa-title-icon" aria-hidden="true">{@html foesIconSvg}</span>
			<span class="fa-title">Foes</span>
		{/if}
		<div class="fa-header-actions">
			<button class="btn fa-hdr-btn" onclick={() => foePickerRef?.open()} title="Add foe">+ Foe</button>
		</div>
	</header>

	{#if loading}
		<div class="fa-loading">Loading…</div>
	{:else if encounters.length === 0}
		<div class="fa-empty">
			<span class="fa-empty-icon" aria-hidden="true">{@html foesIconSvg}</span>
			<p class="fa-empty-text">Nothing currently wants you dead. Disappointing. Click <strong>+ FOE</strong> to dance with fate.</p>
		</div>
	{:else}
		<div class="fa-body">
			<nav class="fa-spines" aria-label="Foe encounters">
				{#each encounters as enc (enc.id)}
					{@const def = findFoe(enc.foeId)}
					{@const n = enc.customName?.trim() || def?.name || enc.foeId}
					<button
						class="fa-spine"
						class:fa-spine--active={enc.id === activeFoeId}
						onclick={() => selectFoe(enc.id)}
						use:tooltip={n}
					>
						<span class="fa-spine-name">{n}</span>
					</button>
				{/each}
			</nav>

			{#if activeEnc}
				<!-- Foe name + delete header — mirrors CharactersArea's stage header.
				     Carries the same --fa-nature so the coloured band is continuous
				     from the header all the way down the card's left side. -->
				<div class="fa-stage-header" style="--fa-nature: {natureColor}">
					{#if editingName}
						<input
							bind:this={nameInputEl}
							class="fa-stage-name-input"
							type="text"
							value={activeEnc.customName ?? ''}
							placeholder={activeDef?.name ?? activeEnc.foeId}
							oninput={(e) => update({ customName: (e.target as HTMLInputElement).value })}
							onblur={commitName}
							onkeydown={(e) => {
								if (e.key === 'Enter') nameInputEl?.blur();
								if (e.key === 'Escape') cancelName();
							}}
						/>
					{:else}
						<button
							type="button"
							class="fa-stage-name fa-stage-name--editable"
							title="Click to rename"
							onclick={startEditName}
						>{headingText(displayName)}</button>
					{/if}
					<button
						class="btn btn-icon icon-btn fa-stage-vanquish-btn"
						class:fa-stage-vanquish-btn--vanquished={activeEnc.vanquished}
						onclick={toggleVanquished}
						use:tooltip={activeEnc.vanquished ? 'Mark active' : 'Mark vanquished'}
						aria-label={activeEnc.vanquished ? 'Mark active' : 'Mark vanquished'}
						aria-pressed={activeEnc.vanquished}
					>{@html activeEnc.vanquished ? swordSvg : skullSvg}</button>
					<button
						class="btn btn-icon icon-btn fa-stage-delete-btn"
						onclick={() => deleteDialogRef?.open()}
						use:tooltip={'Delete foe'}
						aria-label="Delete foe"
					>{@html trashSvg}</button>
				</div>

				<div class="fa-stage" class:fa-stage--vanquished={activeEnc.vanquished}>
					<!-- Card tab strip — Description / Core -->
					<div class="fa-tabs" role="tablist">
						{#each TAB_LABELS as tab (tab.key)}
							<button
								role="tab"
								class="fa-tab"
								class:fa-tab--active={activeTab === tab.key}
								aria-selected={activeTab === tab.key}
								onclick={() => (activeTab = tab.key)}
							>{tab.label}</button>
						{/each}
					</div>

					<div
						class="fa-card"
						role="tabpanel"
						style="--fa-nature: {natureColor}"
					>
						{#if activeTab === 'description'}
							{#if activeDef}
								<div class="fa-desc-section">
									{#if imgVisible}
										<img
											class="fa-portrait"
											src={imageUrl(activeDef)}
											alt={activeDef.name}
											onerror={(e) => { (e.currentTarget as HTMLImageElement).src = UNKNOWN_FOE_PORTRAIT; imgVisible = false; }}
										/>
									{/if}
									{#if hasDescription}
										{#if resolvedDesc}
											<p class="fa-desc">{resolvedDesc}</p>
										{/if}
										{#if activeDef.features.length > 0}
											<div class="fa-section">
												<span class="fa-section-label">Features</span>
												<ul class="fa-list">
													{#each activeDef.features as feat}<li>{feat}</li>{/each}
												</ul>
											</div>
										{/if}
										{#if activeDef.drives.length > 0}
											<div class="fa-section">
												<span class="fa-section-label">Drives</span>
												<ul class="fa-list">
													{#each activeDef.drives as drv}<li>{drv}</li>{/each}
												</ul>
											</div>
										{/if}
										{#if activeDef.tactics.length > 0}
											<div class="fa-section">
												<span class="fa-section-label">Tactics</span>
												<ul class="fa-list">
													{#each activeDef.tactics as t}<li>{t}</li>{/each}
												</ul>
											</div>
										{/if}
									{:else}
										<p class="fa-empty-mini">No description available.</p>
									{/if}
								</div>
							{:else}
								<p class="fa-empty-mini">Catalogue entry “{activeEnc.foeId}” isn’t available (extension disabled?).</p>
							{/if}
						{:else if activeTab === 'core'}
							{#if activeDef && rankInfo}
								<!-- Pills row -->
								<div class="fa-pills-row">
									<span class="fa-badge" style="background: {natureColor}22; color: {natureColor}">{activeDef.nature}</span>
									<span
										class="fa-badge fa-badge--rank"
										style={rankBadgeStyle(activeEnc.effectiveRank)}
										title={activeEnc.quantity !== 'solo' ? `Base rank ${activeDef.rank} + ${qtyDef?.rankAdj ?? 0} for ${activeEnc.quantity}` : ''}
									>{rankInfo.label}</span>
									{#if activeEnc.quantity !== 'solo'}
										<span class="fa-badge fa-badge--qty">{qtyDef?.label ?? activeEnc.quantity}</span>
									{/if}
									{#if activeDef.escalates}
										<span class="fa-badge fa-badge--harm fa-badge--escalating">Harm: {currentHarm} ↑</span>
									{:else}
										<span class="fa-badge fa-badge--harm">Harm: {rankInfo.harm}</span>
									{/if}
									{#if activeDef.escalatesDefense && currentDefense > 0}
										<span class="fa-badge fa-badge--progress fa-badge--defense-progress">Progress: {progressTickVal} ↓</span>
									{:else}
										<span class="fa-badge fa-badge--progress">Progress: {rankInfo.progressPerHit}</span>
									{/if}
								</div>

								<!-- Escalating harm -->
								{#if activeDef.escalates}
									<div class="fa-escalate-row">
										<span class="fa-escalate-label" use:tooltip={"This foe's attack increases every time a miss happens in combat."}>Escalating Harm</span>
										<div class="fa-escalate-ctrl">
											<button class="fa-adj-btn" onclick={decreaseHarm} disabled={currentHarm <= 1}      aria-label="Decrease harm">−</button>
											<span class="fa-harm-val" class:fa-harm-high={currentHarm >= harmCap}>{currentHarm}</span>
											<button class="fa-adj-btn" onclick={increaseHarm} disabled={currentHarm >= harmCap} aria-label="Increase harm">+</button>
											<span class="fa-harm-cap">/ {harmCap}</span>
										</div>
									</div>
								{/if}

								<!-- Escalating defense -->
								{#if activeDef.escalatesDefense}
									<div class="fa-escalate-row">
										<span class="fa-escalate-label" use:tooltip={"This foe's defence increases every time a miss happens in combat."}>Escalating Defense</span>
										<div class="fa-escalate-ctrl">
											<button class="fa-adj-btn" onclick={decreaseDefense} disabled={currentDefense <= 0}          aria-label="Decrease defense">−</button>
											<span class="fa-harm-val">{currentDefense}</span>
											<button class="fa-adj-btn" onclick={increaseDefense} disabled={currentDefense >= defenseCap} aria-label="Increase defense">+</button>
											<span class="fa-harm-cap">/ {defenseCap}</span>
										</div>
									</div>
								{/if}

								<!-- Progress track — matches Characters' Bonds/Failures layout:
								     fa-track-group's natural width = boxes + ± buttons, so the
								     label-row (label + tally with justify-content: space-between)
								     stretches to the same right edge as the buttons. -->
								<div class="fa-section fa-track-group">
									<div class="fa-track-label-row">
										<span class="fa-section-label">Progress track</span>
										<span class="fa-track-tally">{progressScore}/10 boxes{activeEnc.ticks % 4 ? `, ${activeEnc.ticks % 4}/4 ticks` : ''}</span>
									</div>
									<div class="fa-track-controls">
										<ProgressTrack
											label=""
											value={activeEnc.ticks}
											color={natureColor}
											onchange={handleTrackChange}
										/>
										<div class="fa-track-btns">
											<button class="btn-progress" onclick={unmarkProgress} disabled={activeEnc.ticks <= 0}  title="Unmark progress (−{progressTickVal} ticks)">−{progressTickVal}</button>
											<button class="btn-progress" onclick={markProgress}   disabled={activeEnc.ticks >= 40} title="Mark progress (+{progressTickVal} ticks)">+{progressTickVal}</button>
										</div>
									</div>
								</div>

							{:else}
								<p class="fa-empty-mini">Catalogue entry “{activeEnc.foeId}” isn’t available — combat controls disabled.</p>
							{/if}
						{/if}
					</div>
				</div>
			{/if}
		</div>
	{/if}
</div>

<FoePickerDialog bind:this={foePickerRef} onSelect={handleFoeSelected} />

{#if activeEnc}
	<ConfirmDialog
		bind:this={deleteDialogRef}
		title="Delete Foe"
		confirmLabel="Delete"
		onconfirm={confirmDeleteFoe}
	>
		<p>Permanently delete <strong>{displayName}</strong>? This cannot be undone.</p>
	</ConfirmDialog>
{/if}

<style>
	.fa-area { display: flex; flex-direction: column; height: 100%; min-height: 0; }

	/* Header */
	.fa-header {
		display: flex; align-items: center; gap: 10px;
		padding: 6px 12px;
		border-bottom: 1px solid var(--border);
		background: var(--bg-control);
		flex-shrink: 0;
	}
	.fa-title-icon {
		display: inline-flex; align-items: center; justify-content: center;
		width: 18px; height: 18px;
		flex-shrink: 0;
		color: var(--text-accent);
	}
	.fa-title-icon :global(svg) { width: 100%; height: 100%; fill: currentColor; }
	.fa-title-icon :global(svg) :global(path) { fill: currentColor; }
	.fa-title {
		font-family:    var(--font-display);
		font-size:      calc(0.82rem * var(--font-display-scale));
		font-weight:    700;
		letter-spacing: 0.08em;
		text-transform: var(--font-display-transform);
		color:          var(--text-accent);
	}
	.fa-header-actions { display: flex; align-items: center; gap: 6px; flex: 1; justify-content: flex-end; }
	.fa-hdr-btn { font-size: 0.7rem; padding: 3px 9px; min-width: unset; }

	.fa-loading, .fa-empty {
		flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
		font-family: var(--font-ui); font-size: 0.8rem; color: var(--text-muted);
		padding: 20px; gap: 12px; text-align: center;
	}

	.fa-empty-icon {
		display: flex;
		width: 48px;
		height: 48px;
		opacity: 0.25;
	}
	.fa-empty-icon :global(svg) {
		width: 100%;
		height: 100%;
		fill: currentColor;
	}

	.fa-empty-text {
		margin: 0;
		line-height: 1.5;
		max-width: 26ch;
	}

	/* Body grid: spines (col 1, spans both rows) + name banner (row 1, col 2)
	   + stage (row 2, col 2). */
	.fa-body {
		display: grid;
		grid-template-columns: 36px 1fr;
		grid-template-rows: auto 1fr;
		flex: 1; min-height: 0;
	}
	.fa-spines       { grid-row: 1 / span 2; }
	.fa-stage-header { grid-column: 2; grid-row: 1; }
	.fa-stage        { grid-column: 2; grid-row: 2; padding: 0 12px 10px 0; min-height: 0; min-width: 0; overflow: auto; display: flex; flex-direction: column; }

	/* Spine strip */
	.fa-spines {
		display: flex; flex-direction: column; align-items: stretch;
		gap: 0; padding: 0; overflow-y: auto;
		border-right: 1px solid var(--border);
		background: transparent;
	}
	.fa-spine {
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
	.fa-spine:hover { color: var(--text-muted); }
	.fa-spine--active { color: var(--text-accent); border-right-color: var(--text-accent); }
	.fa-spine-name { display: inline-block; max-height: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

	.fa-stage--vanquished .fa-card { opacity: 0.6; }

	/* Stage banner — name + trash, matches CharactersArea ca-stage-header.
	   Picks up the same --fa-nature accent so the coloured band runs
	   continuously down the LHS from the header into the card below. */
	.fa-stage-header {
		display: flex; align-items: center; gap: 6px;
		padding: 5px 10px;
		background: var(--bg-control);
		border: none;
		border-left: 3px solid var(--fa-nature, var(--text-muted));
		border-bottom: 1px solid var(--border);
	}
	.fa-stage-name {
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
	.fa-stage-name--editable {
		cursor: pointer;
		padding: 2px 6px;
		border: 1px solid transparent;
		border-radius: 3px;
		transition: background 0.12s, border-color 0.12s;
	}
	.fa-stage-name--editable:hover {
		background:   var(--bg-hover);
		border-color: var(--border);
	}
	.fa-stage-name-input {
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
	.fa-stage-name-input:focus { border-color: var(--text-accent); }
	.fa-stage-delete-btn { flex-shrink: 0; opacity: 0.7; transition: opacity 0.12s, color 0.12s; }
	.fa-stage-delete-btn:hover { opacity: 1; color: var(--color-danger); }

	/* Vanquish toggle — square icon-only button in the title row.
	   Renders the active-state icon: skull when unvanquished, sword when vanquished.
	   When vanquished, the sword gets the muted-red color so it reads as "currently
	   marked vanquished" at a glance. */
	.fa-stage-vanquish-btn { flex-shrink: 0; opacity: 0.7; transition: opacity 0.12s, color 0.12s; }
	.fa-stage-vanquish-btn:hover { opacity: 1; color: var(--color-danger); }
	.fa-stage-vanquish-btn--vanquished { opacity: 1; color: var(--color-danger); }

	/* Lock stage-header icon-button SVGs to a 12px square; pointer-events:none
	   lets the native `title` tooltip on the button surface over the SVG path. */
	.fa-stage-vanquish-btn :global(svg),
	.fa-stage-delete-btn   :global(svg) {
		width: 12px; height: 12px;
		flex-shrink: 0;
		pointer-events: none;
		fill: currentColor;
	}
	.fa-stage-vanquish-btn :global(svg) :global(path),
	.fa-stage-delete-btn   :global(svg) :global(path) {
		fill: currentColor;
	}

	/* Card tabs — same V1 tab-btn style as CharactersArea. */
	.fa-tabs {
		display: flex; align-items: stretch; gap: 0;
		margin-bottom: 8px;
		border-bottom: 1px solid var(--border);
	}
	.fa-tab {
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
	.fa-tab:hover { color: var(--text-muted); }
	.fa-tab--active { color: var(--text-accent); border-bottom-color: var(--text-accent); }

	/* Card content — theme-aware: cream (--bg-inset) in light mode, near-black
	   in dark mode. The coloured nature band lives only on the stage header. */
	.fa-card {
		flex: 1; min-height: 200px;
		background: var(--bg-inset);
		border: none;
		border-radius: 0;
		padding: 7px;
		overflow: auto;
		position: relative;
		display: flex; flex-direction: column; gap: 10px;
	}

	/* ── Description tab ── portrait floats right; text wraps. */
	.fa-desc-section { display: block; }
	.fa-portrait {
		float: right;
		width: 170px; height: 170px; max-height: 240px;
		object-fit: cover;
		margin: 0 0 10px 14px;
		border: 1px solid var(--border);
		border-radius: 6px;
		opacity: 0.95;
		shape-outside: margin-box;
	}
	.fa-desc {
		font-family: var(--font-ui);
		font-size: 0.85rem; line-height: 1.5;
		color: var(--text);
		margin: 0 0 0.6em;
		white-space: pre-line;
	}
	.fa-section { display: flex; flex-direction: column; gap: 4px; margin-bottom: 8px; }
	.fa-section-label {
		font-family: var(--font-ui);
		font-size: 0.65rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-dimmer);
	}
	.fa-list {
		font-family: var(--font-ui);
		font-size: 0.82rem;
		line-height: 1.45;
		color: var(--text);
		margin: 0;
		padding-left: 1.2em;
	}
	.fa-list li { margin: 0 0 2px; }
	.fa-empty-mini {
		font-family: var(--font-ui); font-size: 0.78rem;
		color: var(--text-dimmer); font-style: italic;
	}

	/* ── Core tab ── pills, escalating spinners, progress track, vanquish. */
	.fa-pills-row {
		display: flex; flex-wrap: wrap; gap: 5px; align-items: center;
		border-bottom: 1px solid #C3BAA1;
		padding-top: 0;
		padding-bottom: 14px;
	}
	.fa-badge {
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
	.fa-badge--qty      { background: rgba(255,255,255,0.08); color: var(--text-muted); }
	.fa-badge--harm     { background: rgba(239,68,68,0.10);  color: #ef4444; }
	.fa-badge--escalating { background: rgba(239,68,68,0.18); font-style: italic; }
	.fa-badge--progress { background: rgba(59,130,246,0.10); color: #60a5fa; }
	.fa-badge--defense-progress { background: rgba(96,165,250,0.18); font-style: italic; }

	.fa-escalate-row {
		display: flex; align-items: center; gap: 10px;
		border-bottom: 1px solid #C3BAA1;
		padding-bottom: 8px;
	}
	.fa-escalate-label {
		font-family: var(--font-ui);
		font-size: 0.7rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--text-dimmer);
	}
	.fa-escalate-ctrl { display: flex; align-items: center; gap: 6px; }
	.fa-adj-btn {
		all: unset; cursor: pointer;
		box-sizing: border-box;
		height: 22px;
		display: inline-flex; align-items: center; justify-content: center;
		border: 1px solid var(--border-mid);
		border-radius: 3px;
		font-family: var(--font-ui);
		font-size: 0.68rem;
		font-weight: 600;
		color: var(--text-muted);
		background: transparent;
		padding: 0 6px;
		flex-shrink: 0;
	}
	.fa-adj-btn[disabled] { opacity: 0.35; cursor: not-allowed; }
	.fa-adj-btn:hover:not([disabled]) { background: var(--bg-hover); }
	.fa-harm-val {
		font-family: var(--font-ui);
		font-size: 0.95rem;
		font-weight: 700;
		min-width: 1.5ch;
		text-align: center;
		color: var(--text);
	}
	.fa-harm-high { color: #ef4444; }
	.fa-harm-cap {
		font-family: var(--font-ui);
		font-size: 0.7rem;
		color: var(--text-dimmer);
	}

	/* Track group — Characters Bonds/Failures pattern. The track-group is a
	   flex column sized to its content (boxes + ± buttons width). The
	   label-row uses justify-content: space-between, so the tally's right
	   edge lands on the same edge as the buttons. align-self: start keeps
	   the column from stretching to fill the parent. */
	.fa-track-group {
		display: flex;
		flex-direction: column;
		gap: 6px;
		align-self: flex-start;
	}
	.fa-track-label-row {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 8px;
	}
	.fa-track-tally {
		font-family:          var(--font-ui);
		font-size:            0.65rem;
		color:                var(--text-dimmer);
		font-variant-numeric: tabular-nums;
		white-space:          nowrap;
	}
	.fa-track-controls {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.fa-track-btns { display: flex; gap: 4px; flex-shrink: 0; }

	/* Progress ± buttons — mirror FoeCard's .btn-progress. The class is
	   scoped inside FoeCard's stylesheet, so v2 has to declare its own copy
	   (otherwise these buttons render unstyled). */
	.fa-track-btns :global(.btn-progress) {
		display:        inline-flex;
		align-items:    center;
		justify-content: center;
		height:         22px;
		padding:        0 7px;
		border-radius:  3px;
		border:         1px solid var(--border-mid);
		background:     transparent;
		color:          var(--text-muted);
		font-family:    var(--font-ui);
		font-size:      0.68rem;
		font-weight:    600;
		letter-spacing: 0.02em;
		cursor:         pointer;
		white-space:    nowrap;
		transition:     background 0.12s, color 0.12s;
	}
	.fa-track-btns :global(.btn-progress:hover:not(:disabled)) {
		background: var(--bg-hover);
		color:      var(--text);
	}
	.fa-track-btns :global(.btn-progress:disabled) {
		opacity: 0.35;
		cursor:  not-allowed;
	}
</style>
