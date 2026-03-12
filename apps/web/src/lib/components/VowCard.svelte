<script lang="ts">
	import type { Vow, VowDifficulty } from '$lib/types.js';
	import { VOW_MARK_TICKS } from '$lib/types.js';
	import ProgressTrack from './ProgressTrack.svelte';

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

	let confirmDelete = $state(false);

	function markProgress() {
		const ticks = VOW_MARK_TICKS[vow.difficulty];
		vow.ticks = Math.min(40, vow.ticks + ticks);
	}

	function unmarkProgress() {
		const ticks = VOW_MARK_TICKS[vow.difficulty];
		vow.ticks = Math.max(0, vow.ticks - ticks);
	}

	function handleDelete() {
		if (confirmDelete) {
			onDelete();
		} else {
			confirmDelete = true;
		}
	}
</script>

<div class="vow-card">
	<div class="vow-header">
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

		{#if confirmDelete}
			<button class="btn btn-danger" onclick={handleDelete}>Confirm delete</button>
			<button class="btn" onclick={() => (confirmDelete = false)}>Cancel</button>
		{:else}
			<button
				class="btn btn-icon btn-danger"
				onclick={handleDelete}
				title="Delete vow"
				aria-label="Delete vow"
			>✕</button>
		{/if}
	</div>

	<div class="vow-extras">
		<label class="vow-extra">
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

	<ProgressTrack bind:value={vow.ticks} label="" boxes={10} />

	<div class="vow-actions">
		<button
			class="btn"
			onclick={markProgress}
			disabled={vow.ticks >= 40}
		>
			Mark Progress
			<span class="ticks-hint">+{VOW_MARK_TICKS[vow.difficulty]}</span>
		</button>
		<button
			class="btn"
			onclick={unmarkProgress}
			disabled={vow.ticks <= 0}
		>Unmark</button>
	</div>
</div>

<style>
	.vow-card {
		background: var(--bg-inset);
		border: 1px solid var(--border);
		border-radius: 6px;
		padding: 10px 12px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.vow-header {
		display: flex;
		align-items: center;
		gap: 6px;
		flex-wrap: wrap;
	}

	.vow-name {
		flex: 1;
		min-width: 120px;
		font-weight: 600;
	}

	.vow-difficulty {
		flex-shrink: 0;
	}

	.vow-extras {
		display: flex;
		gap: 10px;
		flex-wrap: wrap;
	}

	.vow-extra {
		display: flex;
		align-items: center;
		gap: 5px;
		font-size: 0.8rem;
	}

	.vow-extra span {
		color: var(--text-muted);
		white-space: nowrap;
	}

	.vow-extra input {
		width: 140px;
		font-size: 0.8rem;
		padding: 2px 6px;
	}

	.menace-control {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.adj-btn {
		width: 22px;
		height: 22px;
		padding: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 3px;
		cursor: pointer;
		font-size: 0.85rem;
		color: var(--text);
		line-height: 1;
	}

	.adj-btn:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}

	.adj-btn:not(:disabled):hover {
		background: var(--bg-hover, var(--bg-inset));
		border-color: var(--border-strong, var(--text-muted));
	}

	.menace-val {
		min-width: 18px;
		text-align: center;
		font-size: 0.85rem;
		font-weight: 600;
	}

	.menace-val.menace-high {
		color: var(--danger, #c0392b);
	}

	.menace-max {
		color: var(--text-muted);
		font-size: 0.75rem;
	}

	.vow-actions {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
	}

	.ticks-hint {
		font-size: 0.7rem;
		color: var(--text-dimmer);
		margin-left: 2px;
	}
</style>
