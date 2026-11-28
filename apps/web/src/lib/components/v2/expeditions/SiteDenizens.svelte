<script lang="ts">
	/**
	 * A site's Denizens tab: Roll Denizen (the parent opens DenizenDialog),
	 * then the twelve d100 cells, very common to very rare, each a free-text
	 * denizen or a foe picked from the list (stored as its id, shown by name).
	 */
	import { tooltip } from '#lib/actions/tooltip.js';
	import { denizenLabel } from '#lib/foeStore.svelte.js';
	import { DENIZEN_CELLS, type Site } from '#lib/types.js';

	let {
		site,
		rolling,
		onroll,
		onchange,
		onpick,
	}: {
		/** The live site. */
		site: Site;
		/** A roll is under way: Roll Denizen waits. */
		rolling: boolean;
		onroll: () => void;
		/** A cell's text changed. */
		onchange: (index: number, value: string) => void;
		/** Pick a foe for a cell. */
		onpick: (index: number) => void;
	} = $props();
</script>

<div class="ea-denizen-top">
	<button
		class="btn btn-sm"
		onclick={onroll}
		disabled={rolling}
		use:tooltip={'Roll d100 for a denizen'}>Roll Denizen</button
	>
</div>
<div class="ea-denizen-grid">
	{#each DENIZEN_CELLS as cell, i (i)}
		<div class="ea-denizen-cell">
			<div class="ea-denizen-meta">
				<span class="ea-denizen-freq">{cell.label}</span>
				<span class="ea-denizen-range">{cell.range}</span>
			</div>
			<div class="ea-denizen-input-row">
				<input
					class="ea-denizen-input"
					type="text"
					placeholder="—"
					value={denizenLabel(site.denizens[i] ?? '')}
					oninput={(e) => onchange(i, (e.target as HTMLInputElement).value)}
				/>
				<button
					class="ea-denizen-pick-btn"
					onclick={() => onpick(i)}
					use:tooltip={'Pick a foe for this denizen'}
					aria-label="Pick foe for denizen {i + 1}">+</button
				>
			</div>
		</div>
	{/each}
</div>

<style>
	/* Roll Denizen, right-aligned above the grid (the card's gap spaces them). */
	.ea-denizen-top {
		display: flex;
		justify-content: flex-end;
	}
	/* Twelve cells: always 2 columns × 6 rows. */
	.ea-denizen-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 6px;
	}
	.ea-denizen-cell {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 6px 8px;
		min-width: 0;
		background: var(--bg-inset);
		border: 1px solid var(--border);
		border-radius: 4px;
	}
	.ea-denizen-meta {
		display: flex;
		justify-content: space-between;
		font-family: var(--font-ui);
		font-size: 0.6rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-dimmer);
	}
	.ea-denizen-freq {
		font-weight: 700;
	}
	.ea-denizen-input-row {
		display: flex;
		gap: 4px;
	}
	.ea-denizen-input {
		flex: 1;
		min-width: 0;
		font-family: var(--font-ui);
		font-size: 0.78rem;
		color: var(--text);
		background: transparent;
		border: 1px solid var(--border);
		border-radius: 3px;
		padding: 2px 6px;
		outline: none;
	}
	.ea-denizen-input:focus {
		border-color: var(--text-accent);
	}
	.ea-denizen-pick-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		width: 22px;
		height: 22px;
		padding: 0;
		font-family: var(--font-ui);
		font-size: 0.82rem;
		font-weight: 600;
		line-height: 1;
		background: transparent;
		border: 1px solid var(--border-mid);
		border-radius: 3px;
		color: var(--text-muted);
		cursor: pointer;
		transition:
			background 0.12s,
			color 0.12s,
			border-color 0.12s;
	}
	.ea-denizen-pick-btn:hover {
		background: var(--bg-hover);
		color: var(--text-accent);
		border-color: var(--text-accent);
	}
</style>
