<script lang="ts">
	import type { Vow, VowDifficulty } from '$lib/types.js';
	import { VOW_MARK_TICKS } from '$lib/types.js';
	import ProgressTrack from './ProgressTrack.svelte';
	import trashSvg from '$lib/images/trash-solid.svg?raw';

	let {
		vow = $bindable(),
		onDelete,
	}: {
		vow: Vow;
		onDelete: () => void;
	} = $props();

	const DIFFICULTIES: { value: VowDifficulty; label: string }[] = [
		{ value: 'troublesome', label: 'Troublesome' },
		{ value: 'dangerous',   label: 'Dangerous' },
		{ value: 'formidable',  label: 'Formidable' },
		{ value: 'extreme',     label: 'Extreme' },
		{ value: 'epic',        label: 'Epic' },
	];

	/** Endure Stress cost when forsaking each rank of vow. */
	const FORSAKE_STRESS: Record<VowDifficulty, number> = {
		troublesome: 1,
		dangerous:   2,
		formidable:  3,
		extreme:     4,
		epic:        5,
	};

	let collapsed  = $state(false);
	let dialogEl   = $state<HTMLDialogElement | null>(null);
	let dragX      = $state(0);
	let dragY      = $state(0);

	// Non-reactive drag tracking (plain variables, no $state needed)
	let _dragging    = false;
	let _startMouseX = 0;
	let _startMouseY = 0;
	let _startDragX  = 0;
	let _startDragY  = 0;

	const diffLabel  = $derived(
		DIFFICULTIES.find((d) => d.value === vow.difficulty)?.label ?? vow.difficulty
	);
	const stressCost = $derived(FORSAKE_STRESS[vow.difficulty]);

	function markProgress() {
		const ticks = VOW_MARK_TICKS[vow.difficulty];
		vow.ticks = Math.min(40, vow.ticks + ticks);
	}

	function unmarkProgress() {
		const ticks = VOW_MARK_TICKS[vow.difficulty];
		vow.ticks = Math.max(0, vow.ticks - ticks);
	}

	function beginForsake() {
		dragX = 0;
		dragY = 0;
		dialogEl?.showModal();
	}

	function cancelForsake() {
		dialogEl?.close();
	}

	function confirmForsake() {
		dialogEl?.close();
		onDelete();
	}

	function startDrag(e: MouseEvent) {
		_dragging    = true;
		_startMouseX = e.clientX;
		_startMouseY = e.clientY;
		_startDragX  = dragX;
		_startDragY  = dragY;
		e.preventDefault(); // prevent text selection while dragging
		window.addEventListener('mousemove', onDragMove);
		window.addEventListener('mouseup',   onDragEnd);
	}

	function onDragMove(e: MouseEvent) {
		if (!_dragging) return;
		dragX = _startDragX + (e.clientX - _startMouseX);
		dragY = _startDragY + (e.clientY - _startMouseY);
	}

	function onDragEnd() {
		_dragging = false;
		window.removeEventListener('mousemove', onDragMove);
		window.removeEventListener('mouseup',   onDragEnd);
	}
</script>

<div class="vow-card">

	<!-- Header: collapse toggle, name, difficulty, forsake button -->
	<div class="vow-header">
		<button
			class="collapse-btn"
			onclick={() => (collapsed = !collapsed)}
			aria-label={collapsed ? 'Expand vow' : 'Collapse vow'}
			title={collapsed ? 'Expand' : 'Collapse'}
		>
			{collapsed ? '▶' : '▼'}
		</button>

		<input
			class="vow-name"
			bind:value={vow.name}
			placeholder="Vow name…"
			aria-label="Vow name"
		/>

		<select
			class="vow-difficulty"
			bind:value={vow.difficulty}
			aria-label="Vow difficulty"
		>
			{#each DIFFICULTIES as d (d.value)}
				<option value={d.value}>{d.label}</option>
			{/each}
		</select>

		<button
			class="btn btn-icon icon-btn btn-forsake"
			onclick={beginForsake}
			title="Forsake vow"
			aria-label="Forsake vow"
		>{@html trashSvg}</button>
	</div>

	<!-- Expandable body -->
	{#if !collapsed}
		<div class="vow-body">
			<!-- Threat + Menace row -->
			<div class="vow-extras">
				<label class="vow-extra vow-threat">
					<span>Threat</span>
					<input bind:value={vow.threat} placeholder="—" aria-label="Threat" />
				</label>
				<div class="vow-extra menace-control">
					<span>Menace</span>
					<button
						class="adj-btn"
						onclick={() => (vow.menace = Math.max(0, vow.menace - 1))}
						disabled={vow.menace <= 0}
						aria-label="Decrease menace"
					>−</button>
					<span class="menace-val" class:menace-high={vow.menace >= 7}>{vow.menace}</span>
					<button
						class="adj-btn"
						onclick={() => (vow.menace = Math.min(10, vow.menace + 1))}
						disabled={vow.menace >= 10}
						aria-label="Increase menace"
					>+</button>
					<span class="menace-max">/10</span>
				</div>
			</div>

			<!-- Progress track + Mark/Unmark buttons (inline right, same height as boxes) -->
			<div class="vow-progress-row">
				<div class="progress-wrap">
					<ProgressTrack bind:value={vow.ticks} label="" boxes={10} dangerCount={vow.menace} />
				</div>
				<div class="vow-actions">
					<button
						class="btn btn-progress"
						onclick={markProgress}
						disabled={vow.ticks >= 40}
						title="Mark progress (+{VOW_MARK_TICKS[vow.difficulty]} ticks)"
					>+{VOW_MARK_TICKS[vow.difficulty]}</button>
					<button
						class="btn btn-progress"
						onclick={unmarkProgress}
						disabled={vow.ticks <= 0}
						title="Unmark progress (−{VOW_MARK_TICKS[vow.difficulty]} ticks)"
					>−{VOW_MARK_TICKS[vow.difficulty]}</button>
				</div>
			</div>
		</div>
	{/if}
</div>

<!-- Forsake confirmation — native <dialog>, floats above everything, draggable -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<dialog
	bind:this={dialogEl}
	class="forsake-modal"
	style:transform="translate(calc(-50% + {dragX}px), calc(-50% + {dragY}px))"
	oncancel={cancelForsake}
>
	<!-- Drag handle / title bar -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="forsake-drag-handle" onmousedown={startDrag}>
		<span class="forsake-title">Forsake Your Vow</span>
		<span class="drag-grip" aria-hidden="true">⠿</span>
	</div>

	<!-- Content -->
	<div class="forsake-body">
		<div class="forsake-vow-name">"{vow.name || 'Unnamed Vow'}" ({diffLabel})</div>
		<p class="forsake-rule">
			When you renounce your quest or are unable to continue, clear the vow
			and Endure Stress.
		</p>
		<p class="forsake-cost">
			An iron vow is a sacred promise. Forsaking it means accepting failure
			and the weight of a broken oath. You must
			<strong>Endure Stress (−{stressCost})</strong> for a
			{diffLabel.toLowerCase()} vow.
		</p>
		<div class="forsake-actions">
			<button class="btn" onclick={cancelForsake}>Keep Vow</button>
			<button class="btn btn-danger" onclick={confirmForsake}>Forsake Vow</button>
		</div>
	</div>
</dialog>

<style>
	.vow-card {
		background: var(--bg-inset);
		border: 1px solid var(--border);
		border-radius: 6px;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		transition: border-color 0.2s;
	}

	/* ---- Header ---- */
	.vow-header {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 7px 10px;
		background: var(--bg-control);
	}

	.collapse-btn {
		background: transparent;
		border: none;
		color: var(--text-dimmer);
		padding: 2px 4px;
		cursor: pointer;
		font-size: 0.55rem;
		line-height: 1;
		flex-shrink: 0;
		border-radius: 2px;
		font-family: inherit;
		transition: color 0.12s;
	}
	.collapse-btn:hover { color: var(--text); }

	.vow-name {
		flex: 1;
		min-width: 100px;
		font-weight: 600;
		font-size: 0.88rem;
		padding: 3px 7px;
	}

	.vow-difficulty {
		flex-shrink: 0;
		font-family: var(--font-ui);
		font-size: 0.72rem;
		padding: 3px 6px;
	}

	/* Forsake button (trash icon) — danger color */
	.btn-forsake {
		color: var(--color-danger);
		border-color: transparent;
		background: transparent;
		opacity: 0.55;
		transition: opacity 0.12s, border-color 0.12s;
	}
	.btn-forsake:hover:not(:disabled) {
		opacity: 1;
		border-color: var(--color-danger);
		background: transparent;
	}
	.icon-btn :global(svg) {
		width: 11px;
		height: 11px;
		fill: currentColor;
	}

	/* ---- Expandable body ---- */
	.vow-body {
		padding: 8px 10px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.vow-extras {
		display: flex;
		gap: 10px;
		flex-wrap: wrap;
		align-items: center;
	}

	.vow-extra {
		display: flex;
		align-items: center;
		gap: 5px;
		font-family: var(--font-ui);
		font-size: 0.78rem;
	}

	.vow-extra span {
		color: var(--text-muted);
		white-space: nowrap;
	}

	/* Threat grows to fill available space */
	.vow-threat {
		flex: 1;
		min-width: 120px;
	}

	.vow-threat input {
		flex: 1;
		min-width: 0;
		font-size: 0.8rem;
		padding: 2px 6px;
	}

	/* Menace pushed to the right */
	.menace-control {
		margin-left: auto;
	}

	.menace-control {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.adj-btn {
		width: 20px;
		height: 20px;
		padding: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 3px;
		cursor: pointer;
		font-size: 0.85rem;
		font-family: var(--font-ui);
		color: var(--text);
		line-height: 1;
	}

	.adj-btn:disabled { opacity: 0.35; cursor: not-allowed; }
	.adj-btn:not(:disabled):hover {
		background: var(--bg-hover);
		border-color: var(--border-mid);
	}

	.menace-val {
		min-width: 16px;
		text-align: center;
		font-family: var(--font-ui);
		font-size: 0.82rem;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}
	.menace-val.menace-high { color: var(--color-danger); }

	.menace-max {
		color: var(--text-muted);
		font-family: var(--font-ui);
		font-size: 0.72rem;
	}

	/* ---- Progress track row — mirrors Bonds/Failures layout in CharacterSheet ---- */
	.vow-progress-row {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.progress-wrap {
		flex-shrink: 0;
	}

	/* Buttons sit inline to the right of the track, flex-shrink: 0 so they never wrap */
	.vow-actions {
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

	/* ================================================================
	   Forsake modal — native <dialog> floating + draggable
	   ================================================================ */
	.forsake-modal {
		/* Reset UA dialog defaults */
		border: none;
		padding: 0;
		border-radius: 8px;
		/* Positioning: centered via top/left + transform (drag offsets added inline) */
		position: fixed;
		top: 50%;
		left: 50%;
		/* Width */
		width: 340px;
		max-width: calc(100vw - 2rem);
		/* Appearance */
		background: color-mix(in srgb, var(--color-danger) 6%, var(--bg-card));
		color: var(--text);
		box-shadow:
			0 12px 40px #00000060,
			0 0 0 1px color-mix(in srgb, var(--color-danger) 35%, transparent);
		outline: none;
	}

	/* Backdrop — semi-transparent dark veil */
	.forsake-modal::backdrop {
		background: #00000050;
		backdrop-filter: blur(1px);
	}

	/* ---- Drag handle / title bar ---- */
	.forsake-drag-handle {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 10px 14px 9px;
		border-bottom: 1px solid color-mix(in srgb, var(--color-danger) 25%, transparent);
		cursor: grab;
		user-select: none;
		border-radius: 8px 8px 0 0;
		background: color-mix(in srgb, var(--color-danger) 10%, var(--bg-card));
	}
	.forsake-drag-handle:active { cursor: grabbing; }

	.forsake-title {
		font-family: var(--font-display);
		font-size: 0.78rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-danger);
	}

	.drag-grip {
		font-size: 1rem;
		color: var(--text-dimmer);
		line-height: 1;
		opacity: 0.6;
	}

	/* ---- Modal body ---- */
	.forsake-body {
		padding: 12px 14px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.forsake-vow-name {
		font-family: var(--font-body);
		font-size: 0.9rem;
		font-style: italic;
		color: var(--text);
		font-weight: 500;
	}

	.forsake-rule {
		font-family: var(--font-body);
		font-size: 0.8rem;
		font-style: italic;
		color: var(--text-muted);
		line-height: 1.45;
	}

	.forsake-cost {
		font-family: var(--font-body);
		font-size: 0.82rem;
		color: var(--text-muted);
		line-height: 1.45;
	}

	.forsake-cost :global(strong) {
		color: var(--color-danger);
		font-weight: 700;
	}

	.forsake-actions {
		display: flex;
		gap: 6px;
		margin-top: 4px;
		justify-content: flex-end;
	}
</style>
