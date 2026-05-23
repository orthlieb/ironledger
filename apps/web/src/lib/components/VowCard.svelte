<script lang="ts">
	import type { Vow, VowDifficulty } from '$lib/types.js';
	import { VOW_MARK_TICKS } from '$lib/types.js';
	import ProgressTrackPanel from './ProgressTrackPanel.svelte';
	import MarkdownNotes from './MarkdownNotes.svelte';
	import ConfirmDialog from './ConfirmDialog.svelte';
	import trashSvg from '$icons/trash-solid.svg?raw';
	import { isDelveEnabled } from '$lib/expansionStore.svelte.js';

	let {
		vow = $bindable(),
		focusName = false,
		onDelete,
	}: {
		vow: Vow;
		/** If true, immediately enter name-edit mode (used when a vow is first created). */
		focusName?: boolean;
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

	// Inline name editing (same pattern as CharacterSheet / FoeCard)
	let editingName  = $state(false);
	let nameBeforeEdit = '';
	let nameInputEl  = $state<HTMLInputElement | null>(null);

	$effect(() => {
		if (editingName && nameInputEl) {
			nameInputEl.focus();
			nameInputEl.select();
			// New vows are appended to the end of the list — if the user has a
			// long list, the new card lives below the visible area. `nearest`
			// is a no-op when the input is already in view, so clicking an
			// existing vow name doesn't trigger a stray scroll.
			nameInputEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
		}
	});
	$effect(() => { if (focusName) { nameBeforeEdit = vow.name; editingName = true; } });

	const diffLabel  = $derived(
		DIFFICULTIES.find((d) => d.value === vow.difficulty)?.label ?? vow.difficulty
	);
	const stressCost = $derived(FORSAKE_STRESS[vow.difficulty]);
</script>

<div class="vow-card">

	<!-- Header: collapse toggle, name, forsake button -->
	<div class="vow-header">
		<button
			class="collapse-btn"
			onclick={() => (collapsed = !collapsed)}
			aria-label={collapsed ? 'Expand vow' : 'Collapse vow'}
			title={collapsed ? 'Expand' : 'Collapse'}
		>
			{collapsed ? '▶' : '▼'}
		</button>

		{#if editingName}
			<input
				class="vow-name vow-name--editing"
				bind:this={nameInputEl}
				bind:value={vow.name}
				placeholder="Vow name…"
				aria-label="Vow name"
				onblur={() => (editingName = false)}
				onkeydown={(e) => {
					if (e.key === 'Enter') { e.currentTarget.blur(); }
					if (e.key === 'Escape') { vow.name = nameBeforeEdit; editingName = false; }
				}}
			/>
		{:else}
			<!-- svelte-ignore a11y_interactive_supports_focus -->
			<span
				class="vow-name vow-name--display"
				role="button"
				onclick={() => { nameBeforeEdit = vow.name; editingName = true; }}
				onkeydown={(e) => e.key === 'Enter' && (editingName = true)}
				title="Click to rename"
			>{vow.name || 'Unnamed Vow'}</span>
		{/if}

		<button
			class="btn btn-icon icon-btn btn-trash"
			onclick={() => forsakeDialogRef?.open()}
			title="Forsake vow"
			aria-label="Forsake vow"
		>{@html trashSvg}</button>
	</div>

	<!-- Expandable body -->
	{#if !collapsed}
		<div class="vow-body">
			<!-- Rank row -->
			<div class="vow-extras">
				<label class="vow-extra">
					<span>Rank</span>
					<select
						class="vow-difficulty"
						bind:value={vow.difficulty}
						aria-label="Vow difficulty"
					>
						{#each DIFFICULTIES as d (d.value)}
							<option value={d.value}>{d.label}</option>
						{/each}
					</select>
				</label>
			</div>

			<!-- Threat + Menace row (Delve-only — preserves underlying data when hidden) -->
			{#if isDelveEnabled()}
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
			{/if}

			<MarkdownNotes
				label="Notes"
				bind:value={vow.notes}
				placeholder="Notes… (**bold**, *italic*, # heading, - list)"
				rows={3}
			/>

			<div style="--track-inner-bg: var(--bg-inset); display: contents">
				<ProgressTrackPanel
					label="Progress"
					bind:value={vow.ticks}
					step={VOW_MARK_TICKS[vow.difficulty]}
					showStep
					dangerCount={isDelveEnabled() ? vow.menace : 0}
				/>
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
		min-width: 0;
		font-weight: 400;
		font-size: 0.88rem;
	}

	/* Display mode: looks like plain header text, reveals border on hover */
	.vow-name--display {
		display:       block;
		padding:       2px 6px;
		border-radius: 3px;
		color:         var(--text);
		cursor:        text;
		white-space:   nowrap;
		overflow:      hidden;
		text-overflow: ellipsis;
		border:        1px solid transparent;
		transition:    background 0.12s, border-color 0.12s;
	}
	.vow-name--display:hover {
		background:   var(--bg-hover);
		border-color: var(--border);
	}

	/* Edit mode: normal input field */
	.vow-name--editing {
		padding: 2px 6px;
	}

	.vow-difficulty {
		flex-shrink: 0;
		font-family: var(--font-ui);
		font-size: 0.72rem;
		padding: 3px 6px;
	}

	/* Forsake / trash button uses the shared .btn-trash styling from app.css.
	   Other .icon-btn instances on this card keep an 11×11 svg. */
	.icon-btn:not(.btn-trash) :global(svg) {
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
