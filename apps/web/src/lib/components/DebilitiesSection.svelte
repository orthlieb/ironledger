<script lang="ts">
	/**
	 * Three groups of debility toggles: Conditions, Banes, Burdens.
	 * Receives the full character data object and mutates it directly
	 * (safe because it's a Svelte 5 deep-reactive $state in the parent).
	 */
	import type { CharacterData } from '$lib/types.js';

	let {
		data,
		onchange,
	}: {
		data: CharacterData;
		onchange?: (label: string, active: boolean) => void;
	} = $props();

	const CONDITIONS = [
		{ key: 'wounded',    label: 'Wounded' },
		{ key: 'unprepared', label: 'Unprepared' },
		{ key: 'shaken',     label: 'Shaken' },
		{ key: 'encumbered', label: 'Encumbered' },
	] as const;

	const BANES = [
		{ key: 'maimed',    label: 'Maimed' },
		{ key: 'corrupted', label: 'Corrupted' },
	] as const;

	const BURDENS = [
		{ key: 'cursed',    label: 'Cursed' },
		{ key: 'tormented', label: 'Tormented' },
	] as const;
</script>

<div class="debilities">
	<div class="section-label">Debilities</div>

	<div class="debility-groups">
		<div class="debility-group">
			<div class="group-name">Conditions</div>
			<div class="toggle-row">
				{#each CONDITIONS as d (d.key)}
					<button
						class="toggle"
						class:active={data[d.key]}
						onclick={() => { const v = !data[d.key]; data[d.key] = v; onchange?.(d.label, v); }}
						aria-pressed={data[d.key]}
					>
						<span class="dot">{data[d.key] ? '●' : '○'}</span>
						{d.label}
					</button>
				{/each}
			</div>
		</div>

		<div class="debility-group">
			<div class="group-name">Banes</div>
			<div class="toggle-row">
				{#each BANES as d (d.key)}
					<button
						class="toggle"
						class:active={data[d.key]}
						onclick={() => { const v = !data[d.key]; data[d.key] = v; onchange?.(d.label, v); }}
						aria-pressed={data[d.key]}
					>
						<span class="dot">{data[d.key] ? '●' : '○'}</span>
						{d.label}
					</button>
				{/each}
			</div>
		</div>

		<div class="debility-group">
			<div class="group-name">Burdens</div>
			<div class="toggle-row">
				{#each BURDENS as d (d.key)}
					<button
						class="toggle"
						class:active={data[d.key]}
						onclick={() => { const v = !data[d.key]; data[d.key] = v; onchange?.(d.label, v); }}
						aria-pressed={data[d.key]}
					>
						<span class="dot">{data[d.key] ? '●' : '○'}</span>
						{d.label}
					</button>
				{/each}
			</div>
		</div>
	</div>
</div>

<style>
	.debilities {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.debility-groups {
		display: flex;
		flex-wrap: wrap;
		gap: 12px;
	}

	.debility-group {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.group-name {
		font-size: 0.68rem;
		color: var(--text-dimmer);
		font-style: italic;
	}

	.toggle-row {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}

	.toggle {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 3px 8px;
		border-radius: 4px;
		border: 1px solid var(--border);
		background: var(--bg-control);
		color: var(--text-muted);
		font-size: 0.8rem;
		cursor: pointer;
		transition:
			background 0.12s,
			color 0.12s,
			border-color 0.12s;
	}

	.toggle:hover {
		background: var(--bg-hover);
		color: var(--text);
	}

	.toggle.active {
		background: color-mix(in srgb, var(--color-danger) 20%, var(--bg-card));
		border-color: var(--color-danger);
		color: var(--color-health);
	}

	.dot {
		font-size: 0.65rem;
		line-height: 1;
	}
</style>
