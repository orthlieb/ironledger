<script lang="ts">
	/**
	 * FoeCard — collapsible combat encounter card for a single foe.
	 *
	 * Displays the foe's portrait, stats, progress track (10 boxes × 4 ticks),
	 * notes, and a vanquish toggle. Emits log entries for all significant actions.
	 */

	import type { FoeEncounter, FoeDef } from '$lib/types.js';
	import {
		FOE_RANKS, FOE_QUANTITIES, FOE_NATURE_COLORS,
	} from '$lib/foeStore.svelte.js';
	import { progressText } from '$lib/character.js';
	import { appendLog, SESSION_LOG_ID } from '$lib/log.svelte.js';
	import ProgressTrack from '$lib/components/ProgressTrack.svelte';

	import trashSvg  from '$icons/trash-solid-full.svg?raw';
	import swordSvg  from '$icons/sword-solid-full.svg?raw';
	import skullSvg  from '$icons/skull-crossbones-solid-full.svg?raw';

	// ---------------------------------------------------------------------------
	// Props
	// ---------------------------------------------------------------------------
	let {
		enc,
		foeDef,
		onChange,
		onDelete,
	}: {
		enc:      FoeEncounter;
		foeDef:   FoeDef;
		onChange: (updated: FoeEncounter) => void;
		onDelete: () => void;
	} = $props();

	// ---------------------------------------------------------------------------
	// Local UI state
	// ---------------------------------------------------------------------------
	let collapsed        = $state(false);
	let confirmingDelete = $state(false);
	let imgVisible       = $state(true);
	let thumbHovered     = $state(false);
	let editingName      = $state(false);
	let nameInputEl      = $state<HTMLInputElement | null>(null);
	let nameBeforeEdit   = '';
	$effect(() => {
		if (editingName && nameInputEl) nameInputEl.select();
	});

	// ---------------------------------------------------------------------------
	// Derived display values
	// ---------------------------------------------------------------------------
	const displayName   = $derived(enc.customName || foeDef.name);
	const rankInfo      = $derived(FOE_RANKS[enc.effectiveRank]);
	const qtyDef        = $derived(FOE_QUANTITIES.find((q) => q.value === enc.quantity));
	const natureColor   = $derived(FOE_NATURE_COLORS[foeDef.nature] ?? '#9ca3af');
	const progressScore = $derived(Math.floor(enc.ticks / 4));

	// ---------------------------------------------------------------------------
	// Helpers
	// ---------------------------------------------------------------------------
	function imageUrl(name: string): string {
		return `/foes/${encodeURIComponent(name)}.png`;
	}

	function update(patch: Partial<FoeEncounter>) {
		onChange({ ...enc, ...patch });
	}

	function logLine(html: string) {
		appendLog(SESSION_LOG_ID, `Foe — ${displayName}`, html);
	}

	// ---------------------------------------------------------------------------
	// Progress track
	// ---------------------------------------------------------------------------

	function handleTrackChange(_oldTicks: number, newTicks: number) {
		const prev = progressScore;
		const next = Math.floor(newTicks / 4);
		update({ ticks: newTicks });
		logLine(`<div>Progress adjusted (${prev}/10 → ${next}/10)</div>`);
	}

	function markProgress() {
		if (!rankInfo) return;
		const prev = progressScore;
		const newTicks = Math.min(40, enc.ticks + rankInfo.progressPerHit);
		update({ ticks: newTicks });
		const next = Math.floor(newTicks / 4);
		logLine(`<div>Progress marked (${prev}/10 → ${next}/10)</div>`);
	}

	function unmarkProgress() {
		if (!rankInfo) return;
		const prev = progressScore;
		const newTicks = Math.max(0, enc.ticks - rankInfo.progressPerHit);
		update({ ticks: newTicks });
		const next = Math.floor(newTicks / 4);
		logLine(`<div>Progress unmarked (${prev}/10 → ${next}/10)</div>`);
	}

	// ---------------------------------------------------------------------------
	// Status toggle
	// ---------------------------------------------------------------------------
	function toggleVanquished() {
		const next = !enc.vanquished;
		update({ vanquished: next });
		logLine(next
			? `<div>Marked as <strong>vanquished</strong></div>`
			: `<div>Returned to <strong>active</strong></div>`);
	}

	// ---------------------------------------------------------------------------
	// Custom name
	// ---------------------------------------------------------------------------
	function handleNameChange(e: Event) {
		update({ customName: (e.target as HTMLInputElement).value });
	}

	// ---------------------------------------------------------------------------
	// Delete
	// ---------------------------------------------------------------------------
	function startDelete() { confirmingDelete = true; }
	function cancelDelete() { confirmingDelete = false; }
	function confirmDelete() {
		logLine(`<div>Removed from encounter</div>`);
		onDelete();
	}
</script>

<div
	class="foe-card"
	class:vanquished={enc.vanquished}
>

	<!-- ── Header (always visible) ── -->
	<div class="fc-header">
		<!-- Collapse toggle -->
		<button
			class="fc-collapse-btn"
			onclick={() => (collapsed = !collapsed)}
			aria-label={collapsed ? 'Expand' : 'Collapse'}
		>{collapsed ? '▶' : '▼'}</button>

		<!-- Portrait thumbnail + hover lightbox -->
		{#if imgVisible}
			<img
				class="fc-thumb"
				src={imageUrl(foeDef.name)}
				alt={foeDef.name}
				onerror={() => (imgVisible = false)}
				onmouseenter={() => (thumbHovered = true)}
				onmouseleave={() => (thumbHovered = false)}
			/>
		{/if}
		{#if thumbHovered && imgVisible}
			<div class="fc-lightbox" aria-hidden="true">
				<img src={imageUrl(foeDef.name)} alt={foeDef.name} />
			</div>
		{/if}

		<!-- Name (click to edit) -->
		{#if editingName}
			<input
				bind:this={nameInputEl}
				class="fc-name-input"
				type="text"
				value={enc.customName}
				placeholder={foeDef.name}
				oninput={(e) => update({ customName: (e.target as HTMLInputElement).value })}
				onblur={() => (editingName = false)}
				onkeydown={(e) => {
					if (e.key === 'Enter') nameInputEl?.blur();
					if (e.key === 'Escape') { update({ customName: nameBeforeEdit }); editingName = false; }
				}}
			/>
		{:else}
			<!-- svelte-ignore a11y_interactive_supports_focus -->
			<span
				class="fc-name"
				role="button"
				onclick={() => { nameBeforeEdit = enc.customName; editingName = true; }}
				onkeydown={(e) => e.key === 'Enter' && (editingName = true)}
				title="Click to rename"
			>{displayName}</span>
		{/if}

		<!-- Quantity badge (hidden when solo) -->
		{#if enc.quantity !== 'solo'}
			<span class="fc-badge fc-badge--qty">{qtyDef?.label ?? enc.quantity}</span>
		{/if}

		<!-- Nature badge -->
		<span
			class="fc-badge"
			style="background: {natureColor}22; color: {natureColor}"
		>{foeDef.nature}</span>

		<!-- Rank badge -->
		<span
			class="fc-badge fc-badge--rank"
			title={enc.quantity !== 'solo' ? `Base rank ${foeDef.rank} + ${qtyDef?.rankAdj ?? 0} for ${enc.quantity}` : ''}
		>{rankInfo?.label ?? enc.effectiveRank}</span>

		<!-- Status icon -->
		<span class="fc-status-icon" class:status-vanquished={enc.vanquished}>
			{#if enc.vanquished}
				{@html skullSvg}
			{:else}
				{@html swordSvg}
			{/if}
		</span>

		<!-- Delete controls -->
		{#if confirmingDelete}
			<span class="fc-del-confirm">
				<span class="fc-del-label">Remove?</span>
				<button class="btn btn-danger btn-sm" onclick={confirmDelete}>Yes</button>
				<button class="btn btn-sm" onclick={cancelDelete}>No</button>
			</span>
		{:else}
			<button class="btn btn-icon fc-del-btn" onclick={startDelete} title="Remove foe" aria-label="Remove foe">
				{@html trashSvg}
			</button>
		{/if}
	</div>

	<!-- ── Collapsible body ── -->
	{#if !collapsed}
		<div class="fc-body">

			{#if rankInfo}
				<div class="fc-harm-note">
					Inflicts <strong>{rankInfo.harm}</strong> harm per strike
				</div>
			{/if}

			<!-- Description -->
			{#if foeDef.description}
				<p class="fc-desc">{foeDef.description}</p>
			{/if}

			<!-- Features / Drives / Tactics -->
			{#if foeDef.features.length > 0}
				<div class="fc-section">
					<span class="fc-section-label">Features</span>
					<ul class="fc-list">
						{#each foeDef.features as feat}<li>{feat}</li>{/each}
					</ul>
				</div>
			{/if}

			{#if foeDef.drives.length > 0}
				<div class="fc-section">
					<span class="fc-section-label">Drives</span>
					<ul class="fc-list">
						{#each foeDef.drives as d}<li>{d}</li>{/each}
					</ul>
				</div>
			{/if}

			{#if foeDef.tactics.length > 0}
				<div class="fc-section">
					<span class="fc-section-label">Tactics</span>
					<ul class="fc-list">
						{#each foeDef.tactics as t}<li>{t}</li>{/each}
					</ul>
				</div>
			{/if}

			<!-- Progress track -->
			<div class="fc-section">
				<div class="fc-progress-header">
					<span class="fc-section-label">Progress track</span>
					<span class="fc-track-readout">{progressText(enc.ticks)}</span>
				</div>
				<div class="fc-progress-row">
					<ProgressTrack
						label=""
						value={enc.ticks}
						onchange={handleTrackChange}
					/>
					<div class="fc-progress-actions">
						<button
							class="btn-progress"
							onclick={markProgress}
							disabled={enc.ticks >= 40}
							title="Mark progress (+{rankInfo?.progressPerHit} ticks)"
						>+{rankInfo?.progressPerHit}</button>
						<button
							class="btn-progress"
							onclick={unmarkProgress}
							disabled={enc.ticks <= 0}
							title="Unmark progress (−{rankInfo?.progressPerHit} ticks)"
						>−{rankInfo?.progressPerHit}</button>
					</div>
				</div>
			</div>

			<!-- Vanquished toggle -->
			<div class="fc-status-row">
				<button
					class="btn btn-sm"
					class:btn-danger={!enc.vanquished}
					onclick={toggleVanquished}
				>
					{enc.vanquished ? '⚔ Mark Active' : '☠ Mark Vanquished'}
				</button>
			</div>
		</div>
	{/if}
</div>

<style>
	/* ── Card shell ─────────────────────────────────────────────────────── */
	.foe-card {
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--bg-card);
		overflow: hidden;
		transition: opacity 0.2s;
	}
	.foe-card.vanquished { opacity: 0.55; }

	/* ── Header ─────────────────────────────────────────────────────────── */
	.fc-header {
		position: relative;
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 8px;
		flex-wrap: wrap;
		min-height: 42px;
	}

	.fc-collapse-btn {
		background: none;
		border: none;
		cursor: pointer;
		color: var(--text-dimmer);
		font-size: 0.65rem;
		padding: 2px 4px;
		flex-shrink: 0;
	}

	.fc-thumb {
		width: 38px;
		height: 38px;
		object-fit: cover;
		border-radius: 50%;
		flex-shrink: 0;
		border: 1px solid var(--border-mid);
		cursor: default;
		display: block;
		transition: opacity 0.12s;
	}
	.fc-thumb:hover { opacity: 0.85; }

	.fc-lightbox {
		position: absolute;
		left: 0;
		top: calc(100% + 4px);
		z-index: 200;
		background: var(--bg-card);
		border: 2px solid var(--border-mid);
		border-radius: 8px;
		padding: 4px;
		box-shadow: 0 8px 32px #00000080;
		pointer-events: none;
	}
	.fc-lightbox img {
		width: 160px;
		height: 160px;
		object-fit: cover;
		border-radius: 5px;
		display: block;
	}

	.fc-name {
		font-family: var(--font-display);
		font-size: 0.88rem;
		font-weight: 700;
		letter-spacing: 0.04em;
		cursor: text;
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.fc-name-input {
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
	.fc-badge {
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
	.fc-badge--qty  { background: rgba(255,255,255,0.08); color: var(--text-muted); }
	.fc-badge--rank { background: rgba(255,255,255,0.08); color: var(--text-muted); }

	/* ── Status icon ────────────────────────────────────────────────────── */
	.fc-status-icon {
		display: flex;
		align-items: center;
		flex-shrink: 0;
		color: var(--text-dimmer);
	}
	.fc-status-icon.status-vanquished { color: var(--color-danger, #ef4444); }
	.fc-status-icon :global(svg) {
		width: 14px;
		height: 14px;
		fill: currentColor;
	}

	/* ── Delete ─────────────────────────────────────────────────────────── */
	.fc-del-btn {
		width: 26px;
		height: 26px;
		padding: 4px;
		margin-left: auto;
		flex-shrink: 0;
	}
	.fc-del-btn :global(svg) {
		width: 13px;
		height: 13px;
		fill: currentColor;
	}

	.fc-del-confirm {
		display: flex;
		align-items: center;
		gap: 5px;
		margin-left: auto;
		flex-shrink: 0;
	}
	.fc-del-label {
		font-family: var(--font-ui);
		font-size: 0.72rem;
		color: var(--text-dimmer);
	}

	/* ── Body ───────────────────────────────────────────────────────────── */
	.fc-body {
		padding: 0.75rem 1rem 1rem;
		border-top: 1px solid var(--border);
		display: flex;
		flex-direction: column;
		gap: 0.65rem;
	}

	/* Input + harm note on the same line, same height */
	.fc-input-harm-row {
		display: flex;
		align-items: stretch;
		gap: 8px;
	}
	.fc-input-harm-row .fc-input {
		flex: 1;
		min-width: 0;
	}
	.fc-input-harm-row .fc-harm-note {
		flex-shrink: 0;
		white-space: nowrap;
		align-self: center;
	}

	.fc-field-row {
		display: flex;
		flex-direction: column;
		gap: 3px;
	}

	.fc-label {
		font-family: var(--font-ui);
		font-size: 0.65rem;
		font-weight: 600;
		letter-spacing: 0.07em;
		text-transform: uppercase;
		color: var(--text-dimmer);
	}

	.fc-input {
		font-family: var(--font-ui);
		font-size: 0.82rem;
		padding: 4px 8px;
		background: var(--bg-inset);
		border: 1px solid var(--border);
		border-radius: 4px;
		color: var(--text);
	}
	.fc-input:focus {
		outline: none;
		border-color: var(--focus-ring);
		box-shadow: 0 0 0 2px var(--accent-glow);
	}

	.fc-harm-note {
		font-family: var(--font-ui);
		font-size: 0.75rem;
		color: var(--text-dimmer);
		padding: 4px 8px;
		background: rgba(239,68,68,0.07);
		border: 1px solid rgba(239,68,68,0.2);
		border-radius: 4px;
	}

	.fc-desc {
		font-family: var(--font-ui);
		font-size: 0.78rem;
		line-height: 1.55;
		color: var(--text-muted);
		margin: 0;
	}

	/* ── Sections (features/drives/tactics/progress/notes) ─────────────── */
	.fc-section {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.fc-section-label {
		font-family: var(--font-ui);
		font-size: 0.65rem;
		font-weight: 600;
		letter-spacing: 0.07em;
		text-transform: uppercase;
		color: var(--text-dimmer);
	}

	.fc-list {
		margin: 0;
		padding-left: 1.2em;
		list-style: disc;
	}
	.fc-list li {
		font-family: var(--font-ui);
		font-size: 0.78rem;
		color: var(--text-muted);
		margin-bottom: 1px;
	}

	/* ── Progress track ─────────────────────────────────────────────────── */
	.fc-progress-header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 8px;
	}

	.fc-track-readout {
		font-size: 0.65rem;
		color: var(--text-dimmer);
		white-space: nowrap;
		flex-shrink: 0;
	}

	.fc-progress-row {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.fc-progress-actions {
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
	.fc-status-row {
		display: flex;
		justify-content: flex-end;
	}
</style>
