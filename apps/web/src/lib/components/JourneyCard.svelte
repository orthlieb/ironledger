<script lang="ts">
	/**
	 * JourneyCard — collapsible expedition card for a journey.
	 *
	 * Displays name, difficulty, notes, progress track (10 boxes × 4 ticks),
	 * and a complete toggle. Emits log entries for all significant actions.
	 */

	import type { Journey, VowDifficulty } from '$lib/types.js';
	import { EXPEDITION_MARK_TICKS } from '$lib/types.js';
	import { progressText } from '$lib/character.js';
	import { appendLog, SESSION_LOG_ID } from '$lib/log.svelte.js';
	import ProgressTrack from '$lib/components/ProgressTrack.svelte';

	import trashSvg       from '$lib/icons/trash-solid-full.svg?raw';
	import checkSvg       from '$lib/icons/circle-check-solid-full.svg?raw';
	import locationSvg    from '$lib/icons/location-dot-solid-full.svg?raw';

	// ---------------------------------------------------------------------------
	// Props
	// ---------------------------------------------------------------------------
	let {
		expedition,
		onChange,
		onDelete,
	}: {
		expedition: Journey;
		onChange:   (updated: Journey) => void;
		onDelete:  () => void;
	} = $props();

	// ---------------------------------------------------------------------------
	// Local UI state
	// ---------------------------------------------------------------------------
	let collapsed        = $state(false);
	let confirmingDelete = $state(false);

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

	const displayName   = $derived(expedition.name || 'Unnamed Journey');
	const markTicks     = $derived(EXPEDITION_MARK_TICKS[expedition.difficulty]);
	const progressScore = $derived(Math.floor(expedition.ticks / 4));

	// ---------------------------------------------------------------------------
	// Helpers
	// ---------------------------------------------------------------------------
	function update(patch: Partial<Journey>) {
		onChange({ ...expedition, ...patch });
	}

	function logLine(html: string) {
		appendLog(SESSION_LOG_ID, `Journey — ${displayName}`, html);
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

	function handleDifficultyChange(e: Event) {
		const val = (e.target as HTMLSelectElement).value as VowDifficulty;
		logLine(`<div>Difficulty changed to <strong>${val}</strong></div>`);
		update({ difficulty: val });
	}

	function handleNotesChange(e: Event) {
		update({ notes: (e.target as HTMLTextAreaElement).value });
	}

	// ---------------------------------------------------------------------------
	// Delete
	// ---------------------------------------------------------------------------
	function startDelete()   { confirmingDelete = true; }
	function cancelDelete()  { confirmingDelete = false; }
	function confirmDelete() {
		logLine(`<div>Journey removed</div>`);
		onDelete();
	}
</script>

<div
	class="jc-card"
	class:jc-complete={expedition.complete}
>

	<!-- ── Header (always visible) ── -->
	<div class="jc-header">
		<button
			class="jc-collapse-btn"
			onclick={() => (collapsed = !collapsed)}
			aria-label={collapsed ? 'Expand' : 'Collapse'}
		>{collapsed ? '▶' : '▼'}</button>

		<!-- svelte-ignore a11y_interactive_supports_focus -->
		<span
			class="jc-name"
			role="button"
			onclick={() => (collapsed = !collapsed)}
			onkeydown={(e) => e.key === 'Enter' && (collapsed = !collapsed)}
		>{displayName}</span>

		<span class="jc-badge jc-badge--type">Journey</span>

		<span class="jc-badge jc-badge--diff">
			{DIFFICULTIES.find(d => d.value === expedition.difficulty)?.label ?? expedition.difficulty}
		</span>

		<!-- Status icon -->
		<span class="jc-status-icon" class:status-complete={expedition.complete}>
			{#if expedition.complete}
				{@html checkSvg}
			{:else}
				{@html locationSvg}
			{/if}
		</span>

		<!-- Delete controls -->
		{#if confirmingDelete}
			<span class="jc-del-confirm">
				<span class="jc-del-label">Remove?</span>
				<button class="btn btn-danger btn-sm" onclick={confirmDelete}>Yes</button>
				<button class="btn btn-sm" onclick={cancelDelete}>No</button>
			</span>
		{:else}
			<button class="btn btn-icon jc-del-btn" onclick={startDelete} title="Remove journey" aria-label="Remove journey">
				{@html trashSvg}
			</button>
		{/if}
	</div>

	<!-- ── Collapsible body ── -->
	{#if !collapsed}
		<div class="jc-body">

			<!-- Name input + difficulty select -->
			<div class="jc-field-row jc-name-diff-row">
				<div class="jc-field-group jc-field-group--grow">
					<label class="jc-label" for="jc-name-{expedition.id}">Name</label>
					<input
						id="jc-name-{expedition.id}"
						class="jc-input"
						type="text"
						placeholder="Journey name…"
						value={expedition.name}
						oninput={handleNameChange}
					/>
				</div>
				<div class="jc-field-group">
					<label class="jc-label" for="jc-diff-{expedition.id}">Difficulty</label>
					<select
						id="jc-diff-{expedition.id}"
						class="jc-select"
						value={expedition.difficulty}
						onchange={handleDifficultyChange}
					>
						{#each DIFFICULTIES as d (d.value)}
							<option value={d.value}>{d.label}</option>
						{/each}
					</select>
				</div>
			</div>

			<!-- Notes -->
			<div class="jc-field-row">
				<label class="jc-label" for="jc-notes-{expedition.id}">Notes</label>
				<textarea
					id="jc-notes-{expedition.id}"
					class="jc-textarea"
					placeholder="Waypoints, landmarks, perils encountered…"
					value={expedition.notes}
					oninput={handleNotesChange}
					rows="3"
				></textarea>
			</div>

			<!-- Progress track -->
			<div class="jc-section">
				<div class="jc-progress-header">
					<span class="jc-section-label">Progress track</span>
					<span class="jc-track-readout">{progressText(expedition.ticks)}</span>
				</div>
				<div class="jc-progress-row">
					<ProgressTrack
						label=""
						value={expedition.ticks}
						onchange={handleTrackChange}
					/>
					<div class="jc-progress-actions">
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
			</div>

			<!-- Complete toggle -->
			<div class="jc-status-row">
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

<style>
	/* ── Card shell ─────────────────────────────────────────────────────── */
	.jc-card {
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--bg-card);
		overflow: hidden;
		transition: opacity 0.2s;
	}
	.jc-card.jc-complete { opacity: 0.55; }

	/* ── Header ─────────────────────────────────────────────────────────── */
	.jc-header {
		position: relative;
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 8px;
		flex-wrap: wrap;
		min-height: 42px;
	}

	.jc-collapse-btn {
		background: none;
		border: none;
		cursor: pointer;
		color: var(--text-dimmer);
		font-size: 0.65rem;
		padding: 2px 4px;
		flex-shrink: 0;
	}

	.jc-name {
		font-family: var(--font-display);
		font-size: 0.88rem;
		font-weight: 700;
		letter-spacing: 0.04em;
		cursor: pointer;
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* ── Badges ─────────────────────────────────────────────────────────── */
	.jc-badge {
		font-family: var(--font-ui);
		font-size: 0.62rem;
		font-weight: 600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		padding: 2px 6px;
		border-radius: 3px;
		white-space: nowrap;
		flex-shrink: 0;
	}
	.jc-badge--type { background: rgba(52, 211, 153, 0.15); color: #34d399; }
	.jc-badge--diff { background: rgba(255,255,255,0.08); color: var(--text-muted); }

	/* ── Status icon ────────────────────────────────────────────────────── */
	.jc-status-icon {
		display: flex;
		align-items: center;
		flex-shrink: 0;
		color: var(--text-dimmer);
	}
	.jc-status-icon.status-complete { color: #34d399; }
	.jc-status-icon :global(svg) {
		width: 14px;
		height: 14px;
		fill: currentColor;
	}

	/* ── Delete ─────────────────────────────────────────────────────────── */
	.jc-del-btn {
		width: 26px;
		height: 26px;
		padding: 4px;
		margin-left: auto;
		flex-shrink: 0;
	}
	.jc-del-btn :global(svg) {
		width: 13px;
		height: 13px;
		fill: currentColor;
	}

	.jc-del-confirm {
		display: flex;
		align-items: center;
		gap: 5px;
		margin-left: auto;
		flex-shrink: 0;
	}
	.jc-del-label {
		font-family: var(--font-ui);
		font-size: 0.72rem;
		color: var(--text-dimmer);
	}

	/* ── Body ───────────────────────────────────────────────────────────── */
	.jc-body {
		padding: 0.75rem 1rem 1rem;
		border-top: 1px solid var(--border);
		display: flex;
		flex-direction: column;
		gap: 0.65rem;
	}

	.jc-field-row {
		display: flex;
		flex-direction: column;
		gap: 3px;
	}

	.jc-name-diff-row {
		flex-direction: row;
		gap: 8px;
		align-items: flex-end;
	}

	.jc-field-group {
		display: flex;
		flex-direction: column;
		gap: 3px;
	}
	.jc-field-group--grow { flex: 1; min-width: 0; }

	.jc-label {
		font-family: var(--font-ui);
		font-size: 0.65rem;
		font-weight: 600;
		letter-spacing: 0.07em;
		text-transform: uppercase;
		color: var(--text-dimmer);
	}

	.jc-input, .jc-select, .jc-textarea {
		font-family: var(--font-ui);
		font-size: 0.82rem;
		padding: 4px 8px;
		background: var(--bg-inset);
		border: 1px solid var(--border);
		border-radius: 4px;
		color: var(--text);
	}
	.jc-input:focus, .jc-select:focus, .jc-textarea:focus {
		outline: none;
		border-color: var(--focus-ring);
		box-shadow: 0 0 0 2px var(--accent-glow);
	}

	.jc-textarea {
		resize: vertical;
		min-height: 3rem;
		line-height: 1.45;
	}

	/* ── Progress ───────────────────────────────────────────────────────── */
	.jc-section {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.jc-section-label {
		font-family: var(--font-ui);
		font-size: 0.65rem;
		font-weight: 600;
		letter-spacing: 0.07em;
		text-transform: uppercase;
		color: var(--text-dimmer);
	}

	.jc-progress-header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 8px;
	}

	.jc-track-readout {
		font-size: 0.65rem;
		color: var(--text-dimmer);
		white-space: nowrap;
		flex-shrink: 0;
	}

	.jc-progress-row {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.jc-progress-actions {
		display: flex;
		gap: 4px;
		flex-shrink: 0;
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

	/* ── Status row ─────────────────────────────────────────────────────── */
	.jc-status-row {
		display: flex;
		justify-content: flex-end;
	}
</style>
