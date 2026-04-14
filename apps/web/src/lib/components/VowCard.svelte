<script lang="ts">
	import type { Vow, VowDifficulty } from '$lib/types.js';
	import { VOW_MARK_TICKS } from '$lib/types.js';
	import ProgressTrack from './ProgressTrack.svelte';
	import ConfirmDialog from './ConfirmDialog.svelte';
	import trashSvg from '$icons/trash-solid.svg?raw';

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

	let collapsed        = $state(false);
	let forsakeDialogRef = $state<{ open(): void; close(): void } | null>(null);

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
			onclick={() => forsakeDialogRef?.open()}
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

<ConfirmDialog
	bind:this={forsakeDialogRef}
	title="Forsake Your Vow"
	accentColor="var(--color-danger)"
	confirmLabel="Forsake Vow"
	cancelLabel="Keep Vow"
	onconfirm={onDelete}
>
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
</ConfirmDialog>

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

	.forsake-vow-name {
		font-family: var(--font-ui);
		font-size: 0.9rem;
		font-style: italic;
		color: var(--text);
		font-weight: 500;
	}

	.forsake-rule {
		font-family: var(--font-ui);
		font-size: 0.8rem;
		font-style: italic;
		color: var(--text-muted);
		line-height: 1.45;
	}

	.forsake-cost {
		font-family: var(--font-ui);
		font-size: 0.82rem;
		color: var(--text-muted);
		line-height: 1.45;
	}

	.forsake-cost :global(strong) {
		color: var(--color-danger);
		font-weight: 700;
	}
</style>
