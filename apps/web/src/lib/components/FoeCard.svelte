<script lang="ts">
	/**
	 * FoeCard — collapsible combat encounter card for a single foe.
	 *
	 * Displays a portrait thumbnail (with hover lightbox) in the title bar, the foe's stats, progress track (10 boxes × 4 ticks),
	 * notes, and a vanquish toggle. Emits log entries for all significant actions.
	 */

	import type { FoeEncounter, FoeDef } from '$lib/types.js';
	import {
		RANK_COLORS, FOE_RANKS, FOE_QUANTITIES, FOE_NATURE_COLORS,
		resolveFoeDescription,
	} from '$lib/foeStore.svelte.js';
	import { untrack } from 'svelte';
	import { appendLog, SESSION_LOG_ID } from '$lib/log.svelte.js';
	import { foePortraitUrl, UNKNOWN_FOE_PORTRAIT } from '$lib/foePortrait.js';
	import FoeImageCarousel from '$lib/components/FoeImageCarousel.svelte';
	import ProgressTrack   from '$lib/components/ProgressTrack.svelte';
	import ConfirmDialog   from '$lib/components/ConfirmDialog.svelte';

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
		onVanquish,
	}: {
		enc:         FoeEncounter;
		foeDef:      FoeDef;
		onChange:    (updated: FoeEncounter) => void;
		onDelete:    () => void;
		onVanquish?: () => void;
	} = $props();

	// ---------------------------------------------------------------------------
	// Local UI state
	// ---------------------------------------------------------------------------
	let descOpen        = $state(untrack(() => typeof window !== 'undefined' ? localStorage.getItem('il:foe:desc:' + enc.id) !== 'false' : true));
	$effect(() => { if (typeof window !== 'undefined') localStorage.setItem('il:foe:desc:' + enc.id, String(descOpen)); });
	let deleteDialogRef = $state<{ open(): void; close(): void } | null>(null);
	let imgVisible      = $state(true);
	let thumbHovered    = $state(false);
	let editingName     = $state(false);
	let nameInputEl      = $state<HTMLInputElement | null>(null);
	let nameBeforeEdit   = '';
	$effect(() => {
		if (editingName && nameInputEl) nameInputEl.select();
	});

	// ---------------------------------------------------------------------------
	// Derived display values
	// ---------------------------------------------------------------------------
	const displayName      = $derived(enc.customName || foeDef.name);
	const rankInfo         = $derived(FOE_RANKS[enc.effectiveRank]);
	const qtyDef           = $derived(FOE_QUANTITIES.find((q) => q.value === enc.quantity));
	const natureColor      = $derived(FOE_NATURE_COLORS[foeDef.nature] ?? '#9ca3af');
	const progressScore    = $derived(Math.floor(enc.ticks / 4));
	const resolvedFoeDesc  = $derived(resolveFoeDescription(foeDef));
	const hasDescription   = $derived(
		!!resolvedFoeDesc ||
		foeDef.features.length > 0 ||
		foeDef.drives.length > 0 ||
		foeDef.tactics.length > 0
	);

	// ---------------------------------------------------------------------------
	// Escalating harm (YRT extension)
	// ---------------------------------------------------------------------------
	// Cap = effective rank + 1 (1→2, 2→3, 3→4, 4→5), capped at 5 for Epic.
	const currentHarm = $derived(enc.currentHarm ?? 1);
	const harmCap     = $derived(Math.min(enc.effectiveRank + 1, 5));

	function increaseHarm() {
		const next = Math.min(harmCap, currentHarm + 1);
		update({ currentHarm: next });
		logLine(`<div>Escalating harm increased to <strong>${next}</strong></div>`);
	}
	function decreaseHarm() {
		const next = Math.max(1, currentHarm - 1);
		update({ currentHarm: next });
		logLine(`<div>Escalating harm reduced to <strong>${next}</strong></div>`);
	}

	// ---------------------------------------------------------------------------
	// Escalating defense (YRT extension)
	// ---------------------------------------------------------------------------
	// Cap = progressPerHit − 1 (so progress ticks never drop below 1).
	// Reuses FOE_RANKS — no separate lookup table needed.
	const defenseCap     = $derived((FOE_RANKS[enc.effectiveRank]?.progressPerHit ?? 8) - 1);
	/** Absent = 0 (no armor yet). Increases by 1 on each miss, up to defenseCap. */
	const currentDefense = $derived(enc.currentDefense ?? 0);
	/** Tick value shown on progress buttons: progressPerHit − currentDefense (minimum 1). */
	const progressTickVal = $derived(
		foeDef.escalatesDefense ? ((rankInfo?.progressPerHit ?? 1) - currentDefense) : (rankInfo?.progressPerHit ?? 0)
	);

	function increaseDefense() {
		const next = Math.min(defenseCap, currentDefense + 1);
		update({ currentDefense: next });
		logLine(`<div>Escalating defense increased to <strong>${next}</strong> (progress −${(rankInfo?.progressPerHit ?? 1) - next} ticks/mark)</div>`);
	}
	function decreaseDefense() {
		const next = Math.max(0, currentDefense - 1);
		update({ currentDefense: next });
		logLine(`<div>Escalating defense decreased to <strong>${next}</strong> (progress ${(rankInfo?.progressPerHit ?? 1) - next} ticks/mark)</div>`);
	}

	// ---------------------------------------------------------------------------
	// Helpers
	// ---------------------------------------------------------------------------
	// Thumbnail uses just the primary image (index 0); the lightbox
	// carousel below lets the user cycle through any alternates.
	function imageUrl(def: { name: string; images?: string[] }): string {
		return foePortraitUrl(def.name, def.images);
	}

	function rankBadgeStyle(rank: number): string {
		const rc = RANK_COLORS[rank];
		if (!rc) return '';
		return `background:${rc.bg}22; color:${rc.bg}`;
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
		const newTicks = Math.min(40, enc.ticks + progressTickVal);
		update({ ticks: newTicks });
		const next = Math.floor(newTicks / 4);
		logLine(`<div>Progress marked (${prev}/10 → ${next}/10)</div>`);
	}

	function unmarkProgress() {
		if (!rankInfo) return;
		const prev = progressScore;
		const newTicks = Math.max(0, enc.ticks - progressTickVal);
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
		if (next) onVanquish?.();
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
	function confirmDelete() {
		logLine(`<div>Removed from encounter</div>`);
		onDelete();
	}
</script>

<div
	class="foe-card"
	class:vanquished={enc.vanquished}
	style="border-left: 3px solid {natureColor}"
>

	<!-- ── Header (always visible) ── -->
	<div class="fc-header">

		<!-- Portrait thumbnail + hover lightbox -->
		{#if imgVisible}
			<img
				class="fc-thumb"
				src={imageUrl(foeDef)}
				alt={foeDef.name}
				onerror={(e) => { (e.currentTarget as HTMLImageElement).src = UNKNOWN_FOE_PORTRAIT; imgVisible = false; }}
				onmouseenter={() => (thumbHovered = true)}
				onmouseleave={() => (thumbHovered = false)}
			/>
		{/if}
		{#if thumbHovered && imgVisible}
			<div
				class="fc-lightbox"
				onmouseenter={() => (thumbHovered = true)}
				onmouseleave={() => (thumbHovered = false)}
				role="presentation"
			>
					<FoeImageCarousel name={foeDef.name} images={foeDef.images} alt={foeDef.name} class="fc-lightbox-img" />
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


		<!-- Status icon -->
		<span class="fc-status-icon" class:status-vanquished={enc.vanquished}>
			{#if enc.vanquished}
				{@html skullSvg}
			{:else}
				{@html swordSvg}
			{/if}
		</span>

		<!-- Delete controls -->
		<button class="btn btn-icon fc-del-btn" onclick={() => deleteDialogRef?.open()} title="Remove foe" aria-label="Remove foe">
			{@html trashSvg}
		</button>
	</div>

	<!-- ── Body (always visible) ── -->
	<div class="fc-body">

		<!-- Pills: nature · rank · quantity · harm · progress -->
		{#if rankInfo}
			<div class="fc-pills-row">
				<span class="fc-badge" style="background: {natureColor}22; color: {natureColor}">{foeDef.nature}</span>
				<span class="fc-badge fc-badge--rank" style={rankBadgeStyle(enc.effectiveRank)}
					title={enc.quantity !== 'solo' ? `Base rank ${foeDef.rank} + ${qtyDef?.rankAdj ?? 0} for ${enc.quantity}` : ''}
				>{rankInfo.label}</span>
				{#if enc.quantity !== 'solo'}
					<span class="fc-badge fc-badge--qty">{qtyDef?.label ?? enc.quantity}</span>
				{/if}
				{#if foeDef.escalates}
					<span class="fc-badge fc-badge--harm fc-badge--escalating">Harm: {currentHarm} ↑</span>
				{:else}
					<span class="fc-badge fc-badge--harm">Harm: {rankInfo.harm}</span>
				{/if}
				{#if foeDef.escalatesDefense && currentDefense > 0}
					<span class="fc-badge fc-badge--progress fc-badge--defense-progress">Progress: {progressTickVal} ↓</span>
				{:else}
					<span class="fc-badge fc-badge--progress">Progress: {rankInfo.progressPerHit}</span>
				{/if}
			</div>
		{/if}

		<!-- Escalating harm counter (YRT extension) -->
		<!-- Collapsible description section -->
		{#if hasDescription}
			<div class="fc-desc-section">
				<button
					class="fc-desc-toggle"
					onclick={() => (descOpen = !descOpen)}
					aria-expanded={descOpen}
				>
					<span class="fc-desc-arrow" class:fc-desc-arrow--open={descOpen}>▸</span>
					Description
				</button>

				{#if descOpen}
					<div class="fc-desc-body">
						{#if resolvedFoeDesc}
							<p class="fc-desc" style="white-space: pre-line">{resolvedFoeDesc}</p>
						{/if}
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
					</div>
				{/if}
			</div>
		{/if}

		<!-- Escalating harm (above progress track) -->
		{#if foeDef.escalates}
			<div class="fc-escalate-row">
				<span class="fc-escalate-label">Escalating Harm</span>
				<div class="fc-escalate-ctrl">
					<button
						class="fc-adj-btn"
						onclick={decreaseHarm}
						disabled={currentHarm <= 1}
						aria-label="Decrease harm"
					>−</button>
					<span class="fc-harm-val" class:fc-harm-high={currentHarm >= harmCap}>{currentHarm}</span>
					<button
						class="fc-adj-btn"
						onclick={increaseHarm}
						disabled={currentHarm >= harmCap}
						aria-label="Increase harm"
					>+</button>
					<span class="fc-harm-cap">/ {harmCap}</span>
				</div>
			</div>
		{/if}

		<!-- Escalating defense (above progress track) -->
		{#if foeDef.escalatesDefense}
			<div class="fc-escalate-row">
				<span class="fc-escalate-label">Escalating Defense</span>
				<div class="fc-escalate-ctrl">
					<button
						class="fc-adj-btn fc-adj-btn--defense"
						onclick={decreaseDefense}
						disabled={currentDefense <= 0}
						aria-label="Decrease defense"
					>−</button>
					<span class="fc-defense-val" class:fc-defense-low={currentDefense <= 0}>{currentDefense}</span>
					<button
						class="fc-adj-btn fc-adj-btn--defense"
						onclick={increaseDefense}
						disabled={currentDefense >= defenseCap}
						aria-label="Increase defense"
					>+</button>
					<span class="fc-harm-cap">/ {defenseCap}</span>
				</div>
			</div>
		{/if}

		<!-- Progress track -->
		<div class="fc-section">
			<span class="fc-section-label">Progress track</span>
			<div class="fc-progress-row">
				<ProgressTrack
					label=""
					value={enc.ticks}
					color={natureColor}
					onchange={handleTrackChange}
				/>
				<div class="fc-track-btns">
					<button
						class="btn-progress"
						onclick={unmarkProgress}
						disabled={enc.ticks <= 0}
						title="Unmark progress (−{progressTickVal} ticks)"
					>−{progressTickVal}</button>
					<button
						class="btn-progress"
						onclick={markProgress}
						disabled={enc.ticks >= 40}
						title="Mark progress (+{progressTickVal} ticks)"
					>+{progressTickVal}</button>
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
				{#if enc.vanquished}{@html swordSvg} Mark Active{:else}{@html skullSvg} Mark Vanquished{/if}
			</button>
		</div>

	</div>
</div>

<ConfirmDialog
	bind:this={deleteDialogRef}
	title="Remove Foe?"
	onconfirm={confirmDelete}
	confirmLabel="Remove"
>
	<p style="font-family: var(--font-ui); font-size: 0.82rem; color: var(--text-muted); margin: 0; line-height: 1.5;">Remove this foe from the encounter?</p>
</ConfirmDialog>

<style>
	/* ── Card shell ─────────────────────────────────────────────────────── */
	.foe-card {
		border: 1px solid var(--border);
		border-radius: 5px;
		background: var(--bg-card);
		overflow: hidden;
		box-shadow: inset 0 1px 0 #ffffff04, 0 2px 12px #00000050;
		transition: opacity 0.2s;
	}
	.foe-card.vanquished { opacity: 0.55; }

	/* ── Header ─────────────────────────────────────────────────────────── */
	.fc-header {
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
		/* pointer-events enabled so the carousel arrows are clickable. The
		   lightbox handles its own mouseenter/leave to stay open while the
		   user hovers the arrows. */
	}
	.fc-lightbox :global(.fc-lightbox-img) {
		width: 160px;
		height: 160px;
		border-radius: 5px;
	}
	.fc-lightbox :global(.fc-lightbox-img) :global(img) {
		border-radius: 5px;
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
	.fc-badge--qty        { background: rgba(255,255,255,0.08); color: var(--text-muted); }
	.fc-badge--rank       { background: rgba(255,255,255,0.08); color: var(--text-muted); }
	.fc-badge--harm       { background: rgba(239,68,68,0.10);   color: #ef4444; }
	.fc-badge--escalating { background: rgba(239,68,68,0.18);   color: #ef4444; font-style: italic; }
	.fc-badge--progress   { background: rgba(59,130,246,0.10);  color: #60a5fa; }

	.fc-pills-row {
		display: flex;
		flex-wrap: wrap;
		gap: 5px;
		align-items: center;
	}

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

	/* ── Body ───────────────────────────────────────────────────────────── */
	.fc-body {
		padding: 0.6rem var(--page-gutter) 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.65rem;
	}

	/* ── Collapsible description section ───────────────────────────────── */
	.fc-desc-section {
		display: flex;
		flex-direction: column;
		gap: 0;
		border-top: 1px solid var(--border);
		margin: 0 calc(-1 * var(--page-gutter));
		padding: 0 var(--page-gutter);
	}

	.fc-desc-toggle {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		width: 100%;
		padding: 0.4rem 0;
		background: none;
		border: none;
		cursor: pointer;
		text-align: left;
		font-family: var(--font-ui);
		font-size: 0.62rem;
		font-weight: 700;
		letter-spacing: 0.07em;
		text-transform: uppercase;
		color: var(--text-dimmer);
		transition: color 0.12s;
	}
	.fc-desc-toggle:hover { color: var(--text-muted); }

	.fc-desc-arrow {
		font-size: 0.6rem;
		transition: transform 0.15s;
		line-height: 1;
		flex-shrink: 0;
	}
	.fc-desc-arrow--open { transform: rotate(90deg); }

	.fc-desc-body {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		padding-bottom: 0.5rem;
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
	.fc-progress-row {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.fc-track-btns {
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

	/* ── Escalating harm (YRT extension) ───────────────────────────────── */
	.fc-escalate-row {
		display:     flex;
		align-items: center;
		gap:         0.5rem;
		padding:     0.15rem 0;
	}

	.fc-escalate-label {
		font-family:    var(--font-ui);
		font-size:      0.6rem;
		font-weight:    700;
		letter-spacing: 0.07em;
		text-transform: uppercase;
		color:          var(--text-dimmer);
		flex-shrink:    1;
		min-width:      0;
	}

	.fc-escalate-ctrl {
		display:     flex;
		align-items: center;
		gap:         6px;
		flex-shrink: 0;
	}

	.fc-adj-btn {
		display:         inline-flex;
		align-items:     center;
		justify-content: center;
		width:           20px;
		height:          20px;
		padding:         0;
		background:      transparent;
		border:          1px solid var(--border-mid);
		border-radius:   3px;
		cursor:          pointer;
		font-family:     var(--font-ui);
		font-size:       0.85rem;
		font-weight:     700;
		color:           var(--text-muted);
		line-height:     1;
		transition:      background 0.12s, color 0.12s;
	}
	.fc-adj-btn:disabled { opacity: 0.35; cursor: not-allowed; }
	.fc-adj-btn:not(:disabled):hover {
		background:   rgba(239,68,68,0.1);
		color:        #ef4444;
		border-color: rgba(239,68,68,0.4);
	}

	.fc-harm-val {
		font-family:         var(--font-ui);
		font-size:           0.68rem;
		font-weight:         800;
		font-variant-numeric: tabular-nums;
		min-width:           1em;
		text-align:          center;
		color:               var(--text-muted);
		transition:          color 0.2s;
	}
	.fc-harm-high { color: #ef4444; }

	.fc-badge--defense-progress {
		font-style: italic;
		background: rgba(96, 165, 250, 0.18);
		color:      #60a5fa;
	}

	.fc-adj-btn--defense:not(:disabled):hover {
		background:   rgba(96, 165, 250, 0.1);
		color:        #60a5fa;
		border-color: rgba(96, 165, 250, 0.4);
	}

	.fc-defense-val {
		font-family:          var(--font-ui);
		font-size:            0.68rem;
		font-weight:          800;
		font-variant-numeric: tabular-nums;
		min-width:            1em;
		text-align:           center;
		color:                var(--text-muted);
		transition:           color 0.2s;
	}
	.fc-defense-low { color: #60a5fa; }

	.fc-harm-cap {
		font-family: var(--font-ui);
		font-size:   0.68rem;
		color:       var(--text-dimmer);
	}

	/* ── Status row ─────────────────────────────────────────────────────── */
	.fc-status-row {
		display: flex;
		justify-content: flex-end;
	}
	.fc-status-row .btn :global(svg) {
		width: 14px;
		height: 14px;
		fill: currentColor;
		vertical-align: middle;
		flex-shrink: 0;
		margin-right: 4px;
	}
</style>
