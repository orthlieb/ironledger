<script lang="ts">
	/**
	 * SiteCard — collapsible expedition card for a Delve site.
	 *
	 * Displays name, theme, domain, objective, 12-cell denizen grid,
	 * progress track (10 boxes × 4 ticks), and a complete toggle.
	 * Emits log entries for all significant actions.
	 */

	import type { Site, VowDifficulty, DelveTheme, DelveDomain } from '$lib/types.js';
	import {
		EXPEDITION_MARK_TICKS,
		DENIZEN_CELLS,
	} from '$lib/types.js';
	import { appendLog, SESSION_LOG_ID } from '$lib/log.svelte.js';
	import { loadDelveData, buildCombinedTable } from '$lib/delveStore.svelte.js';
	import { findFoeByName, RANK_COLORS } from '$lib/foeStore.svelte.js';
	import { animateDice, DIE_BLACK, DIE_WHITE } from '$lib/dice.js';
	import ProgressTrack    from '$lib/components/ProgressTrack.svelte';
	import DelveTableDialog from '$lib/components/DelveTableDialog.svelte';
	import FoePickerDialog  from '$lib/components/FoePickerDialog.svelte';
	import { onMount } from 'svelte';

	import trashSvg      from '$icons/trash-solid-full.svg?raw';
	import checkSvg      from '$icons/circle-check-solid-full.svg?raw';
	import locationSvg   from '$icons/location-dot-solid-full.svg?raw';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';

	// ---------------------------------------------------------------------------
	// Props
	// ---------------------------------------------------------------------------
	let {
		expedition,
		onChange,
		onDelete,
		onAddEncounter,
		focusName = false,
	}: {
		expedition: Site;
		onChange:       (updated: Site) => void;
		onDelete:      () => void;
		/** Called when the user wants to add a denizen foe as an encounter. */
		onAddEncounter?: (foeName: string) => void;
		focusName?: boolean;
	} = $props();

	// ---------------------------------------------------------------------------
	// Local UI state
	// ---------------------------------------------------------------------------
	let collapsed          = $state(false);
	let denizensCollapsed  = $state(false);
	let deleteDialogRef    = $state<{ open(): void; close(): void } | null>(null);
	let highlightedCell    = $state(-1);
	let denizenPickIndex   = $state(-1);
	let rollingDenizen     = $state(false);
	let editingName        = $state(false);
	let nameInputEl        = $state<HTMLInputElement | null>(null);
	let nameBeforeEdit     = '';
	$effect(() => {
		if (editingName && nameInputEl) nameInputEl.select();
	});
	$effect(() => {
		if (focusName) { nameBeforeEdit = expedition.name; editingName = true; }
	});

	// "Add Foe?" dialog state
	let addFoeDialogEl     = $state<HTMLDialogElement | null>(null);
	let addFoeName         = $state('');

	// Dialog refs
	let delveTableRef = $state<{ open(t: string, tbl: import('$lib/oracleStore.svelte.js').OracleEntry[]): void; close(): void } | null>(null);
	let foePickerRef  = $state<{ openForDenizen(): Promise<void> } | null>(null);

	onMount(() => { loadDelveData(); });

	// ---------------------------------------------------------------------------
	// Derived
	// ---------------------------------------------------------------------------
	const DIFFICULTIES: { value: VowDifficulty; label: string }[] = [
		{ value: 'troublesome', label: 'Troublesome' },
		{ value: 'dangerous',   label: 'Dangerous' },
		{ value: 'formidable',  label: 'Formidable' },
		{ value: 'extreme',     label: 'Extreme' },
		{ value: 'epic',        label: 'Epic' },
	];

	const displayName       = $derived(expedition.name || 'Unnamed Site');

	const DIFFICULTY_RANK: Record<string, number> = {
		troublesome: 1, dangerous: 2, formidable: 3, extreme: 4, epic: 5,
	};
	function diffBadgeStyle(difficulty: string): string {
		const rc = RANK_COLORS[DIFFICULTY_RANK[difficulty] ?? 2];
		if (!rc) return '';
		return `background: ${rc.bg}22; color: ${rc.bg}`;
	}
	const markTicks         = $derived(EXPEDITION_MARK_TICKS[expedition.difficulty]);
	const progressScore     = $derived(Math.floor(expedition.ticks / 4));
	const hasThemeAndDomain = $derived(expedition.theme !== '' && expedition.domain !== '');

	// ---------------------------------------------------------------------------
	// Helpers
	// ---------------------------------------------------------------------------
	function update(patch: Partial<Site>) {
		onChange({ ...expedition, ...patch });
	}

	function logLine(html: string) {
		appendLog(SESSION_LOG_ID, `Site — ${displayName}`, html);
	}

	// ---------------------------------------------------------------------------
	// Progress
	// ---------------------------------------------------------------------------
	function handleTrackChange(_oldTicks: number, newTicks: number) {
		const prev = progressScore;
		const next = Math.floor(newTicks / 4);
		update({ ticks: newTicks });
		logLine(`<div>Progress adjusted (${prev}/10 → ${next}/10)</div>`);
	}

	function markProgress() {
		const prev = progressScore;
		const newTicks = Math.min(40, expedition.ticks + markTicks);
		update({ ticks: newTicks });
		const next = Math.floor(newTicks / 4);
		logLine(`<div>Progress marked (${prev}/10 → ${next}/10)</div>`);
	}

	function unmarkProgress() {
		const prev = progressScore;
		const newTicks = Math.max(0, expedition.ticks - markTicks);
		update({ ticks: newTicks });
		const next = Math.floor(newTicks / 4);
		logLine(`<div>Progress unmarked (${prev}/10 → ${next}/10)</div>`);
	}

	// ---------------------------------------------------------------------------
	// Complete toggle
	// ---------------------------------------------------------------------------
	function toggleComplete() {
		const next = !expedition.complete;
		update({ complete: next });
		logLine(next
			? `<div>Marked as <strong>complete</strong></div>`
			: `<div>Returned to <strong>active</strong></div>`);
	}

	// ---------------------------------------------------------------------------
	// Field handlers
	// ---------------------------------------------------------------------------
	function handleNameChange(e: Event) {
		update({ name: (e.target as HTMLInputElement).value });
	}

	function handleObjectiveChange(e: Event) {
		update({ objective: (e.target as HTMLInputElement).value });
	}

	function handleDenizenChange(index: number, value: string) {
		const denizens = [...expedition.denizens];
		denizens[index] = value;
		update({ denizens });
	}

	// ---------------------------------------------------------------------------
	// Features / Dangers dialogs
	// ---------------------------------------------------------------------------
	function openFeatures() {
		if (!hasThemeAndDomain) return;
		const table = buildCombinedTable(expedition.theme as DelveTheme, expedition.domain as DelveDomain, 'features');
		delveTableRef?.open(`Features: ${expedition.theme} + ${expedition.domain}`, table);
	}

	function openDangers() {
		if (!hasThemeAndDomain) return;
		const table = buildCombinedTable(expedition.theme as DelveTheme, expedition.domain as DelveDomain, 'dangers');
		delveTableRef?.open(`Dangers: ${expedition.theme} + ${expedition.domain}`, table);
	}

	// ---------------------------------------------------------------------------
	// Denizen foe picker
	// ---------------------------------------------------------------------------
	function openDenizenPicker(index: number) {
		denizenPickIndex = index;
		foePickerRef?.openForDenizen();
	}

	function handleDenizenFoePick(foeName: string) {
		if (denizenPickIndex < 0) return;
		handleDenizenChange(denizenPickIndex, foeName);
		logLine(`<div>Denizen ${denizenPickIndex + 1} set to <strong>${foeName}</strong> (foe picker)</div>`);
		denizenPickIndex = -1;
	}

	// ---------------------------------------------------------------------------
	// Roll denizen (d100) — with foe matching
	// ---------------------------------------------------------------------------
	async function rollDenizen() {
		if (rollingDenizen) return;
		rollingDenizen = true;

		const roll = Math.floor(Math.random() * 100) + 1;
		const cellIndex = DENIZEN_CELLS.findIndex(c => roll >= c.low && roll <= c.high);
		highlightedCell = cellIndex;
		const cell = DENIZEN_CELLS[cellIndex];
		const denizen = expedition.denizens[cellIndex];

		// d100 dice animation
		const tensV = Math.floor(roll % 100 / 10) || 10;
		const onesV = roll % 10 || 10;
		await animateDice([
			{ sides: 10, value: tensV, color: DIE_BLACK },
			{ sides: 10, value: onesV, color: DIE_WHITE },
		]);

		logLine(`<div>Rolled d100: <strong>${roll}</strong> → ${cell.label} (${cell.range})${denizen ? `: <strong>${denizen}</strong>` : ''}</div>`);

		// Check if denizen name matches a foe in the catalogue
		if (denizen && findFoeByName(denizen)) {
			addFoeName = denizen;
			addFoeDialogEl?.showModal();
		}

		// Clear highlight after 4s
		setTimeout(() => { highlightedCell = -1; }, 4000);
		rollingDenizen = false;
	}

	function confirmAddFoe() {
		addFoeDialogEl?.close();
		if (addFoeName) onAddEncounter?.(addFoeName);
		addFoeName = '';
	}

	function cancelAddFoe() {
		addFoeDialogEl?.close();
		addFoeName = '';
	}

	// ---------------------------------------------------------------------------
	// Delete
	// ---------------------------------------------------------------------------
	function confirmDelete() {
		logLine(`<div>Site removed</div>`);
		onDelete();
	}
</script>

<div
	class="sc-card"
	class:sc-complete={expedition.complete}
	class:collapsed={collapsed}
	style="border-left: 3px solid #60a5fa"
>

	<!-- ── Header (always visible) ── -->
	<div class="sc-header">
		<button
			class="sc-collapse-btn"
			onclick={() => (collapsed = !collapsed)}
			aria-label={collapsed ? 'Expand' : 'Collapse'}
		>{collapsed ? '▶' : '▼'}</button>

		{#if editingName}
			<input
				bind:this={nameInputEl}
				class="sc-name-input"
				type="text"
				value={expedition.name}
				placeholder="Site name..."
				oninput={(e) => update({ name: (e.target as HTMLInputElement).value })}
				onblur={() => (editingName = false)}
				onkeydown={(e) => {
					if (e.key === 'Enter') nameInputEl?.blur();
					if (e.key === 'Escape') { update({ name: nameBeforeEdit }); editingName = false; }
				}}
			/>
		{:else}
			<!-- svelte-ignore a11y_interactive_supports_focus -->
			<span
				class="sc-name"
				role="button"
				onclick={() => { nameBeforeEdit = expedition.name; editingName = true; }}
				onkeydown={(e) => e.key === 'Enter' && (editingName = true)}
				title="Click to rename"
			>{displayName}</span>
		{/if}

		<!-- Status icon -->
		<span class="sc-status-icon" class:status-complete={expedition.complete}>
			{#if expedition.complete}
				{@html checkSvg}
			{:else}
				{@html locationSvg}
			{/if}
		</span>

		<!-- Delete controls -->
		<button class="btn btn-icon sc-del-btn" onclick={() => deleteDialogRef?.open()} title="Remove site" aria-label="Remove site">
			{@html trashSvg}
		</button>
	</div>

	<!-- ── Collapsible body ── -->
	{#if !collapsed}
		<div class="sc-body">

			<!-- Pills -->
			<div class="sc-pill-strip">
				<span class="sc-badge sc-badge--type">Site</span>
				<span class="sc-badge sc-badge--diff" style={diffBadgeStyle(expedition.difficulty)}>
					{DIFFICULTIES.find(d => d.value === expedition.difficulty)?.label ?? expedition.difficulty}
				</span>
				{#if expedition.theme}
					<span class="sc-badge sc-badge--theme">{expedition.theme}</span>
				{/if}
				{#if expedition.domain}
					<span class="sc-badge sc-badge--domain">{expedition.domain}</span>
				{/if}
			</div>

			<!-- Objective -->
			<div class="sc-field-row">
				<label class="sc-label" for="sc-obj-{expedition.id}">Objective</label>
				<input
					id="sc-obj-{expedition.id}"
					class="sc-input"
					type="text"
					placeholder="What are you seeking here?"
					value={expedition.objective}
					oninput={handleObjectiveChange}
				/>
			</div>

			<!-- Oracle + Denizen roll buttons -->
			<div class="sc-oracle-row">
				<button
					class="btn btn-sm sc-oracle-btn sc-oracle-btn--features"
					onclick={openFeatures}
					disabled={!hasThemeAndDomain}
					title={hasThemeAndDomain ? 'Roll features table' : 'Set theme and domain first'}
				>Roll Feature</button>
				<button
					class="btn btn-sm sc-oracle-btn sc-oracle-btn--dangers"
					onclick={openDangers}
					disabled={!hasThemeAndDomain}
					title={hasThemeAndDomain ? 'Roll dangers table' : 'Set theme and domain first'}
				>Roll Danger</button>
				<button
					class="btn btn-sm sc-oracle-btn sc-oracle-btn--denizen"
					onclick={rollDenizen}
					title="Roll d100 for a denizen"
				>Roll Denizen</button>
			</div>

			<!-- Denizens sub-section (collapsible) -->
			<div class="sc-section">
				<div class="sc-section-header">
					<button
						class="sc-collapse-btn"
						onclick={() => (denizensCollapsed = !denizensCollapsed)}
						aria-label={denizensCollapsed ? 'Expand denizens' : 'Collapse denizens'}
					>{denizensCollapsed ? '▶' : '▼'}</button>
					<span class="sc-section-label">Denizens</span>
				</div>

				{#if !denizensCollapsed}
					<div class="sc-denizen-grid">
						{#each DENIZEN_CELLS as cell, i (i)}
							<div
								class="sc-denizen-cell"
								class:sc-denizen-highlight={highlightedCell === i}
							>
								<div class="sc-denizen-meta">
									<span class="sc-denizen-freq">{cell.label}</span>
									<span class="sc-denizen-range">{cell.range}</span>
								</div>
								<div class="sc-denizen-input-row">
									<input
										class="sc-denizen-input"
										type="text"
										placeholder="—"
										value={expedition.denizens[i] ?? ''}
										oninput={(e) => handleDenizenChange(i, (e.target as HTMLInputElement).value)}
									/>
									<button
										class="sc-denizen-pick-btn"
										onclick={() => openDenizenPicker(i)}
										title="Pick a foe for this denizen"
										aria-label="Pick foe for denizen {i + 1}"
									>&#8853;</button>
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>

			<!-- Progress track -->
			<div class="sc-section">
				<span class="sc-section-label">Progress track</span>
				<div class="sc-progress-row">
					<ProgressTrack
						label=""
						value={expedition.ticks}
						onchange={handleTrackChange}
					/>
					<button
						class="btn-progress"
						onclick={markProgress}
						disabled={expedition.ticks >= 40}
						title="Mark progress (+{markTicks} ticks)"
					>+{markTicks}</button>
					<button
						class="btn-progress"
						onclick={unmarkProgress}
						disabled={expedition.ticks <= 0}
						title="Unmark progress (−{markTicks} ticks)"
					>−{markTicks}</button>
				</div>
			</div>

			<!-- Complete toggle -->
			<div class="sc-status-row">
				<button
					class="btn btn-sm"
					class:btn-success={!expedition.complete}
					onclick={toggleComplete}
				>
					{expedition.complete ? '↩ Mark Active' : '✓ Mark Complete'}
				</button>
			</div>
		</div>
	{/if}
</div>

<!-- Dialogs (always mounted, controlled via refs) -->
<DelveTableDialog bind:this={delveTableRef} />
<FoePickerDialog
	bind:this={foePickerRef}
	onSelect={() => {}}
	onDenizenPick={handleDenizenFoePick}
/>

<ConfirmDialog
	bind:this={deleteDialogRef}
	title="Remove Site?"
	onconfirm={confirmDelete}
	confirmLabel="Remove"
>
	<p style="font-family: var(--font-ui); font-size: 0.82rem; color: var(--text-muted); margin: 0; line-height: 1.5;">Remove this site from your expeditions?</p>
</ConfirmDialog>

<!-- Add Foe? confirmation dialog -->
<dialog bind:this={addFoeDialogEl} class="sc-add-foe-dialog" oncancel={cancelAddFoe}>
	<div class="sc-afd-body">
		<p class="sc-afd-text">
			<strong>{addFoeName}</strong> is in the foe catalogue. Add as an encounter?
		</p>
		<div class="sc-afd-actions">
			<button class="btn btn-sm" onclick={cancelAddFoe}>Cancel</button>
			<button class="btn btn-sm btn-primary" onclick={confirmAddFoe}>Add Foe</button>
		</div>
	</div>
</dialog>

<style>
	/* ── Card shell ─────────────────────────────────────────────────────── */
	.sc-card {
		border: 1px solid var(--border);
		border-radius: 5px;
		background: var(--bg-card);
		overflow: hidden;
		box-shadow: inset 0 1px 0 #ffffff04, 0 2px 12px #00000050;
		transition: opacity 0.2s;
	}
	.sc-card.sc-complete { opacity: 0.55; }

	/* Remove header divider when collapsed */
	.sc-card.collapsed .sc-header {
		border-bottom: none;
	}

	/* ── Header ─────────────────────────────────────────────────────────── */
	.sc-header {
		position: relative;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 12px;
		flex-wrap: wrap;
		min-height: 55px;
		background: var(--bg-inset);
		border-bottom: 1px solid var(--border);
	}

	.sc-collapse-btn {
		background: none;
		border: none;
		cursor: pointer;
		color: var(--text-dimmer);
		font-size: 0.65rem;
		padding: 2px 4px;
		flex-shrink: 0;
	}

	.sc-pill-strip {
		display: flex;
		flex-wrap: wrap;
		gap: 5px;
		align-items: center;
			}

	.sc-name {
		flex: 1;
		font-family: var(--font-display);
		font-size: 0.88rem;
		font-weight: 700;
		letter-spacing: 0.04em;
		cursor: text;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.sc-name-input {
		flex: 1;
		font-family: var(--font-display);
		font-weight: 700;
		font-size: 0.88rem;
		letter-spacing: 0.04em;
		background: var(--bg-input);
		border: 1px solid var(--accent);
		border-radius: 4px;
		padding: 2px 6px;
		color: var(--text);
		min-width: 0;
	}

	/* ── Badges ─────────────────────────────────────────────────────────── */
	.sc-badge {
		font-family: var(--font-ui);
		font-size: 0.6rem;
		font-weight: 600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		padding: 2px 7px;
		border-radius: 10px;
		border: 1px solid color-mix(in srgb, currentColor 35%, transparent);
		white-space: nowrap;
		flex-shrink: 0;
	}
	.sc-badge--type   { background: rgba(96, 165, 250, 0.15); color: #60a5fa; }
	.sc-badge--theme  { background: rgba(168, 85, 247, 0.15); color: #a855f7; }
	.sc-badge--domain { background: rgba(251, 146, 60, 0.15); color: #fb923c; }
	.sc-badge--diff   { background: rgba(255,255,255,0.08); color: var(--text-muted); }

	/* ── Status icon ────────────────────────────────────────────────────── */
	.sc-status-icon {
		display: flex;
		align-items: center;
		flex-shrink: 0;
		color: var(--text-dimmer);
	}
	.sc-status-icon.status-complete { color: #34d399; }
	.sc-status-icon :global(svg) {
		width: 14px;
		height: 14px;
		fill: currentColor;
	}

	/* ── Delete ─────────────────────────────────────────────────────────── */
	.sc-del-btn {
		width: 26px;
		height: 26px;
		padding: 4px;
		margin-left: auto;
		flex-shrink: 0;
	}
	.sc-del-btn :global(svg) {
		width: 13px;
		height: 13px;
		fill: currentColor;
	}

	/* ── Body ───────────────────────────────────────────────────────────── */
	.sc-body {
		padding: 0.75rem var(--page-gutter) 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.65rem;
	}

	.sc-field-row {
		display: flex;
		flex-direction: column;
		gap: 3px;
	}

	.sc-field-group {
		display: flex;
		flex-direction: column;
		gap: 3px;
	}
	.sc-label {
		font-family: var(--font-ui);
		font-size: 0.65rem;
		font-weight: 600;
		letter-spacing: 0.07em;
		text-transform: uppercase;
		color: var(--text-dimmer);
	}

	.sc-input, .sc-select {
		font-family: var(--font-ui);
		font-size: 0.82rem;
		padding: 4px 8px;
		background: var(--bg-inset);
		border: 1px solid var(--border);
		border-radius: 4px;
		color: var(--text);
	}
	.sc-input:focus, .sc-select:focus {
		outline: none;
		border-color: var(--focus-ring);
		box-shadow: 0 0 0 2px var(--accent-glow);
	}

	/* ── Section headers ────────────────────────────────────────────────── */
	.sc-section {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.sc-section-header {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.sc-section-label {
		font-family: var(--font-ui);
		font-size: 0.65rem;
		font-weight: 600;
		letter-spacing: 0.07em;
		text-transform: uppercase;
		color: var(--text-dimmer);
		flex: 1;
	}

	/* ── Denizen grid ───────────────────────────────────────────────────── */
	.sc-denizen-grid {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		margin-top: 4px;
	}

	.sc-denizen-cell {
		flex: 1 1 calc(25% - 3px);
		min-width: 9rem;
		background: var(--bg-inset);
		border: 1px solid var(--border);
		border-radius: 4px;
		padding: 4px 6px;
		display: flex;
		flex-direction: column;
		gap: 2px;
		transition: border-color 0.3s, background 0.3s;
	}

	.sc-denizen-cell.sc-denizen-highlight {
		border-color: var(--text-accent);
		background: color-mix(in srgb, var(--text-accent) 12%, transparent);
	}

	.sc-denizen-meta {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
	}

	.sc-denizen-freq {
		font-family: var(--font-ui);
		font-size: 0.6rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--text-dimmer);
	}

	.sc-denizen-range {
		font-family: var(--font-ui);
		font-size: 0.6rem;
		color: var(--text-dimmer);
		opacity: 0.7;
	}

	.sc-denizen-input {
		font-family: var(--font-ui);
		font-size: 0.78rem;
		padding: 2px 4px;
		background: transparent;
		border: 1px solid transparent;
		border-radius: 3px;
		color: var(--text);
		width: 100%;
	}
	.sc-denizen-input:focus {
		outline: none;
		border-color: var(--focus-ring);
		background: var(--bg-inset);
		box-shadow: 0 0 0 2px var(--accent-glow);
	}

	/* ── Progress ───────────────────────────────────────────────────────── */
	.sc-progress-row {
		display: flex;
		align-items: center;
		gap: 6px;
		flex-wrap: nowrap;
		padding-left: 0.4rem;
	}

	.btn-progress {
		display: inline-flex;
		align-items: center;
		justify-content: center;
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
	.btn-progress:hover:not(:disabled) {
		background: var(--bg-hover);
		color: var(--text);
	}
	.btn-progress:disabled { opacity: 0.35; cursor: not-allowed; }

	/* ── Oracle buttons row ─────────────────────────────────────────────── */
	.sc-oracle-row {
		display: flex;
		gap: 6px;
		align-self: flex-end;
		flex-shrink: 0;
	}

	.sc-oracle-btn {
		font-size: 0.65rem;
		padding: 3px 10px;
		font-weight: 600;
		letter-spacing: 0.04em;
	}
	.sc-oracle-btn--features {
		border-color: rgba(168, 85, 247, 0.4);
		color: #a855f7;
	}
	.sc-oracle-btn--features:hover:not(:disabled) {
		background: rgba(168, 85, 247, 0.12);
	}
	.sc-oracle-btn--dangers {
		border-color: rgba(239, 68, 68, 0.4);
		color: #ef4444;
	}
	.sc-oracle-btn--dangers:hover:not(:disabled) {
		background: rgba(239, 68, 68, 0.12);
	}
	.sc-oracle-btn--denizen {
		border-color: rgba(52, 211, 153, 0.4);
		color: #34d399;
	}
	.sc-oracle-btn--denizen:hover:not(:disabled) {
		background: rgba(52, 211, 153, 0.12);
	}
	.sc-oracle-btn:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}

	/* ── Denizen input row (input + pick button) ──────────────────────── */
	.sc-denizen-input-row {
		display: flex;
		align-items: center;
		gap: 2px;
	}

	.sc-denizen-pick-btn {
		background: none;
		border: none;
		color: var(--text-dimmer);
		cursor: pointer;
		font-size: 0.85rem;
		padding: 0 2px;
		line-height: 1;
		flex-shrink: 0;
		border-radius: 3px;
		transition: color 0.12s;
	}
	.sc-denizen-pick-btn:hover {
		color: var(--text-accent);
	}

	/* ── Add Foe? dialog ─────────────────────────────────────────────── */
	.sc-add-foe-dialog {
		border: none;
		padding: 0;
		border-radius: 10px;
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: min(360px, calc(100vw - 2rem));
		background: var(--bg-card);
		color: var(--text);
		box-shadow: 0 16px 48px #00000070, 0 0 0 1px var(--border-mid);
		outline: none;
	}
	.sc-add-foe-dialog::backdrop {
		background: #00000060;
		backdrop-filter: blur(1px);
	}
	.sc-afd-body {
		padding: 1.25rem 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
	.sc-afd-text {
		font-family: var(--font-ui);
		font-size: 0.85rem;
		line-height: 1.5;
	}
	.sc-afd-actions {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
	}

	/* ── Status row ─────────────────────────────────────────────────────── */
	.sc-status-row {
		display: flex;
		justify-content: flex-end;
	}
</style>
