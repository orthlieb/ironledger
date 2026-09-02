<script lang="ts">
	/**
	 * FilterBar — the shared search + category-filter control used by the picker
	 * dialogs (Moves, Oracles, Export). A search field with an inset icon, a
	 * "Filters" toggle carrying an active-count badge, and a collapsible panel of
	 * category chips + a Clear button. `search`, `active` (the set of active
	 * category keys) and `filtersOpen` are bindable, so the host owns the state
	 * and filters its own items; `inputEl` is bindable so the host can focus the
	 * search on open. A `trailing` snippet drops extra controls into the search
	 * row (e.g. the Moves "hide unavailable" eye).
	 *
	 * Styles are component-scoped — the hash rides on each element, so they apply
	 * even though the host portals its dialog out of this component's tree.
	 */
	import type { Snippet } from 'svelte';
	import { tooltip } from '$lib/actions/tooltip.js';
	import searchIconSvg from '$icons/magnifying-glass-solid-full.svg?raw';
	import clearFiltersSvg from '$icons/filter-circle-xmark-solid-full.svg?raw';

	let {
		search = $bindable(''),
		active = $bindable(new Set<string>()),
		categories,
		placeholder = 'Search…',
		filtersOpen = $bindable(false),
		inputEl = $bindable(null),
		trailing,
	}: {
		search?: string;
		/** Active category keys ([] = show all). */
		active?: Set<string>;
		/** Chips to offer: a key, a display label, and an optional accent colour. */
		categories: { key: string; label: string; color?: string }[];
		placeholder?: string;
		filtersOpen?: boolean;
		inputEl?: HTMLInputElement | null;
		trailing?: Snippet;
	} = $props();

	function toggle(key: string) {
		const n = new Set(active);
		if (n.has(key)) n.delete(key);
		else n.add(key);
		active = n;
	}
	function clear() {
		active = new Set();
	}
</script>

<div class="fb">
	<div class="fb-row">
		<div class="fb-field">
			<span class="fb-icon" aria-hidden="true">{@html searchIconSvg}</span>
			<input
				bind:this={inputEl}
				class="fb-input"
				type="search"
				{placeholder}
				aria-label={placeholder}
				bind:value={search}
			/>
		</div>
		{#if categories.length}
			<button
				type="button"
				class="fb-toggle"
				class:active={active.size > 0}
				onclick={() => (filtersOpen = !filtersOpen)}
				aria-expanded={filtersOpen}
				>Filters{#if active.size > 0}&nbsp;<span class="fb-badge">{active.size}</span>{/if}
				{filtersOpen ? '▲' : '▼'}</button
			>
		{/if}
		{@render trailing?.()}
	</div>
	{#if filtersOpen && categories.length}
		<div class="fb-panel">
			<div class="fb-chips" role="group" aria-label="Filter by category">
				{#each categories as c (c.key)}
					<button
						type="button"
						class="fb-chip"
						class:active={active.has(c.key)}
						style:--ccolor={c.color ?? 'var(--text-dimmer)'}
						aria-pressed={active.has(c.key)}
						onclick={() => toggle(c.key)}>{c.label}</button
					>
				{/each}
			</div>
			<button
				type="button"
				class="fb-clear"
				onclick={clear}
				disabled={active.size === 0}
				use:tooltip={'Clear all filters'}
				aria-label="Clear all filters">{@html clearFiltersSvg}</button
			>
		</div>
	{/if}
</div>

<style>
	.fb {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.fb-row {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.fb-field {
		flex: 1;
		min-width: 0;
		position: relative;
		display: flex;
		align-items: center;
	}
	.fb-icon {
		position: absolute;
		left: 8px;
		width: 13px;
		height: 13px;
		display: inline-flex;
		pointer-events: none;
		color: var(--text-dimmer);
	}
	.fb-icon :global(svg) {
		width: 13px;
		height: 13px;
		fill: currentColor;
	}
	.fb-input {
		flex: 1;
		min-width: 0;
		font-family: var(--font-ui);
		font-size: 0.78rem;
		color: var(--text);
		background: var(--bg-inset);
		border: 1px solid var(--border);
		border-radius: 4px;
		padding: 5px 8px 5px 28px;
	}
	.fb-input::placeholder {
		color: var(--text-dimmer);
	}

	.fb-toggle {
		font-family: var(--font-ui);
		font-size: 0.72rem;
		font-weight: 600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		padding: 5px 11px;
		border-radius: 999px;
		border: 1px solid var(--border);
		background: transparent;
		color: var(--text-dimmer);
		cursor: pointer;
		display: flex;
		align-items: center;
		gap: 5px;
		flex: none;
		transition:
			border-color 0.1s,
			color 0.1s;
	}
	.fb-toggle:hover {
		color: var(--text-muted);
		border-color: var(--border-mid);
	}
	.fb-toggle.active {
		color: var(--text-accent);
		border-color: color-mix(in srgb, var(--text-accent) 50%, var(--border));
	}
	.fb-badge {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
		font-size: 0.66rem;
		background: var(--text-accent);
		color: var(--bg-page);
		border-radius: 999px;
		padding: 0 5px;
		line-height: 1.5;
	}

	.fb-panel {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.fb-chips {
		flex: 1;
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.fb-chip {
		font-family: var(--font-ui);
		font-size: 0.66rem;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--ccolor, var(--text-dimmer));
		background: transparent;
		border: 1px solid color-mix(in srgb, var(--ccolor, var(--border)) 40%, transparent);
		border-radius: 999px;
		padding: 3px 10px;
		cursor: pointer;
		white-space: nowrap;
		transition:
			background 0.12s,
			border-color 0.12s;
	}
	.fb-chip:hover {
		background: color-mix(in srgb, var(--ccolor) 12%, transparent);
	}
	.fb-chip.active {
		background: color-mix(in srgb, var(--ccolor) 18%, transparent);
		border-color: var(--ccolor);
	}
	.fb-clear {
		flex: none;
		background: transparent;
		border: 0;
		color: var(--text-dimmer);
		cursor: pointer;
		padding: 3px;
		border-radius: 6px;
		display: grid;
		place-items: center;
	}
	.fb-clear:hover:not(:disabled) {
		color: var(--text-accent);
	}
	.fb-clear:disabled {
		opacity: 0.35;
		cursor: default;
	}
	.fb-clear :global(svg) {
		width: 15px;
		height: 15px;
		fill: currentColor;
	}
</style>
