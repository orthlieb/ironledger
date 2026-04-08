<script lang="ts">
	/**
	 * JourneyCard — collapsible expedition card for a journey.
	 *
	 * Displays name, difficulty, notes, progress track (10 boxes × 4 ticks),
	 * and a complete toggle. Emits log entries for all significant actions.
	 */

	import type { Journey, VowDifficulty } from '$lib/types.js';
	import { EXPEDITION_MARK_TICKS } from '$lib/types.js';
	import { appendLog, SESSION_LOG_ID } from '$lib/log.svelte.js';
	import ProgressTrack   from '$lib/components/ProgressTrack.svelte';
	import { RANK_COLORS } from '$lib/foeStore.svelte.js';
	import ConfirmDialog   from '$lib/components/ConfirmDialog.svelte';

	import trashSvg       from '$icons/trash-solid-full.svg?raw';
	import checkSvg       from '$icons/circle-check-solid-full.svg?raw';
	import locationSvg    from '$icons/location-dot-solid-full.svg?raw';
	import placeholderSvg from '$icons/treasure-map.svg?raw';

	// ---------------------------------------------------------------------------
	// Props
	// ---------------------------------------------------------------------------
	let {
		expedition,
		onChange,
		onDelete,
		focusName = false,
	}: {
		expedition: Journey;
		onChange:   (updated: Journey) => void;
		onDelete:  () => void;
		focusName?: boolean;
	} = $props();

	// ---------------------------------------------------------------------------
	// Local UI state
	// ---------------------------------------------------------------------------
	let collapsed        = $state(false);
	let deleteDialogRef  = $state<{ open(): void; close(): void } | null>(null);
	let editingName      = $state(false);
	let portraitHovered  = $state(false);

	function handlePortrait(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = () => {
			const img = new Image();
			img.onload = () => {
				const canvas = document.createElement('canvas');
				const size = Math.min(img.width, img.height, 256);
				canvas.width  = size;
				canvas.height = size;
				const ctx = canvas.getContext('2d')!;
				const side = Math.min(img.width, img.height);
				const sx   = (img.width  - side) / 2;
				const sy   = (img.height - side) / 2;
				ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
				update({ imageUrl: canvas.toDataURL('image/jpeg', 0.85) });
			};
			img.src = reader.result as string;
		};
		reader.readAsDataURL(file);
	}
	let nameInputEl      = $state<HTMLInputElement | null>(null);
	let nameBeforeEdit   = '';
	$effect(() => {
		if (editingName && nameInputEl) nameInputEl.select();
	});
	$effect(() => {
		if (focusName) { nameBeforeEdit = expedition.name; editingName = true; }
	});

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

	const DIFFICULTY_RANK: Record<string, number> = {
		troublesome: 1, dangerous: 2, formidable: 3, extreme: 4, epic: 5,
	};
	function diffBadgeStyle(difficulty: string): string {
		const rc = RANK_COLORS[DIFFICULTY_RANK[difficulty] ?? 2];
		if (!rc) return '';
		return `background: ${rc.bg}22; color: ${rc.bg}`;
	}
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


	function handleNotesChange(e: Event) {
		update({ notes: (e.target as HTMLTextAreaElement).value });
	}

	// ---------------------------------------------------------------------------
	// Delete
	// ---------------------------------------------------------------------------
	function confirmDelete() {
		logLine(`<div>Journey removed</div>`);
		onDelete();
	}
</script>

<div
	class="jc-card"
	class:jc-complete={expedition.complete}
	class:collapsed={collapsed}
>

	<!-- ── Header (always visible) ── -->
	<div class="jc-header">
		<button
			class="jc-collapse-btn"
			onclick={() => (collapsed = !collapsed)}
			aria-label={collapsed ? 'Expand' : 'Collapse'}
		>{collapsed ? '▶' : '▼'}</button>

		<!-- Portrait -->
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<label
			class="jc-portrait-label"
			title="Click to change portrait"
			onmouseenter={() => (portraitHovered = true)}
			onmouseleave={() => (portraitHovered = false)}
		>
			{#if expedition.imageUrl}
				<img src={expedition.imageUrl} alt="Portrait" class="jc-portrait-img" />
			{:else}
				<div class="jc-portrait-placeholder">{@html placeholderSvg}</div>
			{/if}
			<input type="file" accept="image/*" class="jc-portrait-input" aria-label="Upload portrait" onchange={handlePortrait} />
		</label>
		{#if portraitHovered && expedition.imageUrl}
			<div class="jc-portrait-lightbox">
				<img src={expedition.imageUrl} alt="Portrait" />
			</div>
		{/if}

		{#if editingName}
			<input
				bind:this={nameInputEl}
				class="jc-name-input"
				type="text"
				value={expedition.name}
				placeholder="Journey name..."
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
				class="jc-name"
				role="button"
				onclick={() => { nameBeforeEdit = expedition.name; editingName = true; }}
				onkeydown={(e) => e.key === 'Enter' && (editingName = true)}
				title="Click to rename"
			>{displayName}</span>
		{/if}

		<!-- Status icon -->
		<span class="jc-status-icon" class:status-complete={expedition.complete}>
			{#if expedition.complete}
				{@html checkSvg}
			{:else}
				{@html locationSvg}
			{/if}
		</span>

		<!-- Delete controls -->
		<button class="btn btn-icon jc-del-btn" onclick={() => deleteDialogRef?.open()} title="Remove journey" aria-label="Remove journey">
			{@html trashSvg}
		</button>
	</div>

	<!-- ── Collapsible body ── -->
	{#if !collapsed}
		<div class="jc-body">

			<!-- Pills -->
			<div class="jc-pill-strip">
				<span class="jc-badge jc-badge--type">Journey</span>
				<span class="jc-badge jc-badge--diff" style={diffBadgeStyle(expedition.difficulty)}>
					{DIFFICULTIES.find(d => d.value === expedition.difficulty)?.label ?? expedition.difficulty}
				</span>
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
				<span class="jc-section-label">Progress track</span>
				<div class="jc-progress-row">
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

<ConfirmDialog
	bind:this={deleteDialogRef}
	title="Remove Journey?"
	onconfirm={confirmDelete}
	confirmLabel="Remove"
>
	<p style="font-family: var(--font-ui); font-size: 0.82rem; color: var(--text-muted); margin: 0; line-height: 1.5;">Remove this journey from your expeditions?</p>
</ConfirmDialog>

<style>
	/* ── Card shell ─────────────────────────────────────────────────────── */
	.jc-card {
		border: 1px solid var(--border);
		border-radius: 5px;
		background: var(--bg-card);
		overflow: hidden;
		box-shadow: inset 0 1px 0 #ffffff04, 0 2px 12px #00000050;
		transition: opacity 0.2s;
	}
	.jc-card.jc-complete { opacity: 0.55; }

	/* Remove header divider when collapsed */
	.jc-card.collapsed .jc-header {
		border-bottom: none;
	}

	/* ── Header ─────────────────────────────────────────────────────────── */
	.jc-header {
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

	.jc-collapse-btn {
		background: none;
		border: none;
		cursor: pointer;
		color: var(--text-dimmer);
		font-size: 0.65rem;
		padding: 2px 4px;
		flex-shrink: 0;
	}

	/* ── Portrait ───────────────────────────────────────────────────────── */
	.jc-portrait-label {
		width:           38px;
		height:          38px;
		border-radius:   50%;
		flex-shrink:     0;
		cursor:          pointer;
		display:         flex;
		align-items:     center;
		justify-content: center;
		transition:      opacity 0.15s;
	}
	.jc-portrait-label:has(.jc-portrait-img) {
		overflow: hidden;
		border:   1px solid var(--border-mid);
	}
	.jc-portrait-label:hover { opacity: 0.85; }

	.jc-portrait-img {
		width:      100%;
		height:     100%;
		object-fit: cover;
		display:    block;
	}

	.jc-portrait-placeholder {
		width:           38px;
		height:          38px;
		border-radius:   50%;
		border:          1px dashed var(--border-mid);
		display:         flex;
		align-items:     center;
		justify-content: center;
		color:           var(--text-dimmer);
		background:      var(--bg-control);
		user-select:     none;
		flex-shrink:     0;
	}
	.jc-portrait-placeholder :global(svg) {
		width:   20px;
		height:  20px;
		fill:    currentColor;
		opacity: 0.5;
	}

	.jc-portrait-input { display: none; }

	.jc-portrait-lightbox {
		position:       absolute;
		top:            60px;
		left:           10px;
		z-index:        100;
		border-radius:  6px;
		overflow:       hidden;
		box-shadow:     0 8px 32px rgba(0,0,0,0.7);
		border:         1px solid var(--border);
		pointer-events: none;
	}
	.jc-portrait-lightbox img {
		display:    block;
		width:      160px;
		height:     160px;
		object-fit: cover;
	}

	.jc-pill-strip {
		display: flex;
		flex-wrap: wrap;
		gap: 5px;
		align-items: center;
	}

	.jc-name {
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

	.jc-name-input {
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
	.jc-badge {
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

	/* ── Body ───────────────────────────────────────────────────────────── */
	.jc-body {
		padding: 0.75rem var(--page-gutter) 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.65rem;
	}

	.jc-field-row {
		display: flex;
		flex-direction: column;
		gap: 3px;
	}


	.jc-label {
		font-family: var(--font-ui);
		font-size: 0.65rem;
		font-weight: 600;
		letter-spacing: 0.07em;
		text-transform: uppercase;
		color: var(--text-dimmer);
	}

	.jc-textarea {
		font-family: var(--font-ui);
		font-size: 0.82rem;
		padding: 4px 8px;
		background: var(--bg-inset);
		border: 1px solid var(--border);
		border-radius: 4px;
		color: var(--text);
	}
	.jc-textarea:focus {
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

	.jc-progress-row {
		display: flex;
		align-items: center;
		gap: 6px;
		flex-wrap: nowrap;
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
