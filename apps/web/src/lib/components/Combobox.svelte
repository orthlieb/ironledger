<script lang="ts" generics="Item">
	/**
	 * Combobox — shared bits-ui Popover + Command searchable picker.
	 *
	 * The house "switch-or-add" picker: a text-field-shaped trigger that
	 * opens a popover with a search box, an optional kind/type filter-pill
	 * row, a scrollable list (per-item check + tinted glyph + name), an
	 * optional leading "clear" row (Nowhere / No link), and optional
	 * trailing action rows (+ New …) after a separator. Reach for this
	 * whenever a list is long enough to want typeahead; reach for Select
	 * (docs/ui-components.md) for a short static field with no search.
	 *
	 * This component OWNS the .cb-* styles (single source of truth, the way
	 * Select.svelte owns .bui-select-*). Text search is bits-ui Command's
	 * default value-based filter on each item's label; pill filtering is
	 * applied to the item list here before Command sees it. Pass portalTo a
	 * parent native dialog element so the popover renders atop its top layer.
	 */
	import { Popover, Command } from 'bits-ui';
	import type { Snippet } from 'svelte';
	import iconCaretDownSvg from '$icons/caret-large-down-solid.svg?raw';
	import searchIconSvg from '$icons/magnifying-glass-solid.svg?raw';
	import clearFiltersSvg from '$icons/filter-circle-xmark-solid.svg?raw';
	import { tooltip } from '$lib/actions/tooltip.js';

	interface FilterPill {
		key: string;
		label: string;
		/** Accent colour for the pill (border + fill tint), via --pcolor. */
		color?: string;
	}
	interface ComboAction {
		label: string;
		/** Command search value for the row (so it survives text filtering). */
		value: string;
		onselect: () => void;
	}

	let {
		open = $bindable(false),
		id,
		items,
		getKey,
		getLabel,
		getIcon,
		getColor,
		activeKey,
		onselect,
		triggerValue = '',
		triggerIcon,
		triggerColor,
		placeholder = 'Select…',
		searchPlaceholder = 'Search…',
		emptyText = 'No matches.',
		ariaLabel,
		class: cls = '',
		filters,
		activeFilters = $bindable(),
		filterOf,
		filterGroupLabel = 'Filter',
		clearItem,
		actions,
		portalTo,
		trigger,
	}: {
		/** Popover open state. */
		open?: boolean;
		/** Optional id on the trigger (for a `<label for>` association). */
		id?: string;
		/** The full domain list; pill filtering + text search narrow it. */
		items: Item[];
		/** Stable key for an item (dedupe + active-check match). */
		getKey: (item: Item) => string;
		/** Display + search text for an item. */
		getLabel: (item: Item) => string;
		/** Optional leading glyph (raw inline SVG) for an item. */
		getIcon?: (item: Item) => string | undefined;
		/** Optional accent colour for an item's glyph. */
		getColor?: (item: Item) => string | undefined;
		/** Key of the currently-selected item — draws the leading checkmark. */
		activeKey?: string | null;
		/** Fired when an item is chosen; the popover then closes. */
		onselect: (item: Item) => void;
		/** Trigger value text; muted-italic placeholder shown when empty. */
		triggerValue?: string;
		/** Optional leading glyph in the trigger (e.g. the selected kind icon). */
		triggerIcon?: string;
		/** Accent colour for the trigger glyph. */
		triggerColor?: string;
		placeholder?: string;
		searchPlaceholder?: string;
		emptyText?: string;
		/** Accessible name for the trigger button. */
		ariaLabel?: string;
		/** Extra class(es) on the trigger (per-site width tweaks). */
		class?: string;
		/** Filter pills; when set, a pill row + clear button render and the
		 *  list is pre-filtered by filterOf ∈ activeFilters (empty = all). */
		filters?: FilterPill[];
		/** Bindable active-filter set (pair with filters + filterOf). */
		activeFilters?: Set<string>;
		/** Maps an item to the filter key it belongs to. */
		filterOf?: (item: Item) => string;
		/** Accessible name for the pill group. */
		filterGroupLabel?: string;
		/** Optional leading "clear" row (e.g. Nowhere / No link); checked
		 *  when activeKey is falsy. */
		clearItem?: { label: string; onselect: () => void };
		/** Trailing action rows (+ New …) after a separator. */
		actions?: ComboAction[];
		/** Portal target — pass a parent native <dialog> when inside one. */
		portalTo?: Element | string;
		/** Optional trigger-content override (inside the Popover.Trigger). */
		trigger?: Snippet;
	} = $props();

	const visibleItems = $derived.by(() => {
		const set = activeFilters;
		if (!filters || !filterOf || !set || set.size === 0) return items;
		return items.filter((it) => set.has(filterOf(it)));
	});

	const isPlaceholder = $derived(triggerValue === '');

	function toggleFilter(key: string) {
		if (!activeFilters) return;
		const next = new Set(activeFilters);
		if (next.has(key)) next.delete(key);
		else next.add(key);
		activeFilters = next;
	}
	function clearFilters() {
		activeFilters = new Set<string>();
	}
	function choose(item: Item) {
		onselect(item);
		open = false;
	}
</script>

{#snippet checkMark(on: boolean)}
	<span class="cb-check" aria-hidden="true">
		{#if on}
			<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.5"
				><polyline points="4 11 8 15 16 6" stroke-linecap="round" stroke-linejoin="round"
				></polyline></svg
			>
		{/if}
	</span>
{/snippet}

<Popover.Root bind:open>
	<Popover.Trigger {id} class={`cb-trigger ${cls}`.trim()} aria-label={ariaLabel}>
		{#if trigger}
			{@render trigger()}
		{:else}
			{#if triggerIcon}
				<span
					class="cb-item-icon"
					style:--kind-color={triggerColor ?? 'var(--text-accent)'}
					aria-hidden="true">{@html triggerIcon}</span
				>
			{/if}
			<span class="cb-value" class:cb-value--placeholder={isPlaceholder}
				>{isPlaceholder ? placeholder : triggerValue}</span
			>
			<span class="cb-caret" aria-hidden="true">{@html iconCaretDownSvg}</span>
		{/if}
	</Popover.Trigger>
	<Popover.Portal to={portalTo}>
		<Popover.Content class="cb-popover" sideOffset={4} align="start" collisionPadding={8}>
			<Command.Root class="cb-cmd">
				<div class="cb-search-row">
					<span class="cb-search-icon" aria-hidden="true">{@html searchIconSvg}</span>
					<Command.Input class="cb-search" placeholder={searchPlaceholder} autofocus />
				</div>
				{#if filters && filters.length}
					<div class="cb-pills" role="group" aria-label={filterGroupLabel}>
						{#each filters as pill (pill.key)}
							{@const active = !!activeFilters?.has(pill.key)}
							<button
								type="button"
								class="cb-pill"
								class:active
								style:--pcolor={pill.color ?? 'var(--text-dimmer)'}
								aria-pressed={active}
								onclick={() => toggleFilter(pill.key)}>{pill.label}</button
							>
						{/each}
						<button
							type="button"
							class="cb-clear"
							onclick={clearFilters}
							disabled={!activeFilters || activeFilters.size === 0}
							use:tooltip={'Clear filters'}
							aria-label="Clear filters">{@html clearFiltersSvg}</button
						>
					</div>
				{/if}
				<Command.List class="cb-list">
					<Command.Empty class="cb-empty">{emptyText}</Command.Empty>
					{#if clearItem}
						<Command.Item
							class="cb-item"
							value={clearItem.label}
							onSelect={() => {
								clearItem.onselect();
								open = false;
							}}
						>
							{@render checkMark(!activeKey)}
							<span class="cb-item-name cb-item-name--muted">{clearItem.label}</span>
						</Command.Item>
					{/if}
					{#each visibleItems as item (getKey(item))}
						{@const label = getLabel(item)}
						{@const icon = getIcon?.(item)}
						<Command.Item class="cb-item" value={label} onSelect={() => choose(item)}>
							{@render checkMark(getKey(item) === activeKey)}
							{#if icon}
								<span
									class="cb-item-icon"
									style:--kind-color={getColor?.(item) ?? 'var(--text-accent)'}
									aria-hidden="true">{@html icon}</span
								>
							{/if}
							<span class="cb-item-name">{label}</span>
						</Command.Item>
					{/each}
					{#if actions && actions.length}
						{#if visibleItems.length || clearItem}
							<Command.Separator class="cb-sep" />
						{/if}
						{#each actions as action (action.value)}
							<Command.Item
								class="cb-item cb-item--action"
								value={action.value}
								onSelect={() => {
									open = false;
									action.onselect();
								}}
							>
								<span class="cb-check" aria-hidden="true"></span>
								<span class="cb-item-name">{action.label}</span>
							</Command.Item>
						{/each}
					{/if}
				</Command.List>
			</Command.Root>
		</Popover.Content>
	</Popover.Portal>
</Popover.Root>

<style>
	/* bits-ui renders its own DOM roots (and portals the popover) that
	   Svelte's CSS pruning can't see, so every selector is :global(). The
	   .cb-* prefix is owned by this component. */

	/* Trigger shell — a text-field-shaped button: optional prefix glyph, a
	   value/placeholder span, and a chevron. */
	:global(.cb-trigger) {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 4px 6px 4px 10px;
		background: var(--bg-inset);
		color: var(--text);
		border: 1px solid var(--border-mid);
		border-radius: 4px;
		font-family: var(--font-ui);
		font-size: 0.82rem;
		font-weight: 500;
		letter-spacing: 0;
		text-transform: none;
		text-align: left;
		cursor: pointer;
		min-height: 30px;
		min-width: 0;
		transition: border-color 0.12s;
	}
	:global(.cb-trigger:hover:not(:disabled)),
	:global(.cb-trigger:focus-visible) {
		border-color: var(--text-accent);
		outline: none;
	}
	:global(.cb-trigger[data-state='open']) {
		border-color: var(--text-accent);
		box-shadow: inset 0 -2px 0 0 var(--text-accent);
	}
	:global(.cb-value) {
		flex: 1 1 auto;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		text-align: left;
	}
	:global(.cb-value--placeholder) {
		color: var(--text-dimmer);
		font-style: italic;
	}
	:global(.cb-caret) {
		flex-shrink: 0;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 20px;
		height: 20px;
		color: var(--text-muted);
	}
	:global(.cb-caret svg) {
		width: 12px;
		height: 12px;
		fill: currentColor;
	}
	:global(.cb-caret svg path) {
		fill: currentColor;
	}

	/* Popover (Popover.Content + Command inside). */
	:global(.cb-popover) {
		width: min(320px, calc(100vw - 2rem));
		background: var(--bg-card);
		color: var(--text);
		border: 1px solid var(--border-mid);
		border-radius: 8px;
		box-shadow: 0 16px 48px #00000070;
		/* 90 — popovers must beat bits-ui modal content (81) so they still
		   show when opened from inside a ConfirmDialog / AlertDialog. See the
		   z-index budget in docs/ui-components.md. */
		z-index: 90;
		outline: none;
		overflow: hidden;
	}
	:global(.cb-cmd) {
		display: flex;
		flex-direction: column;
		/* Cap to the space Floating UI actually has on the chosen side
		   (`--bits-floating-available-height`, set by bits-ui) so the search
		   row + pills stay on-screen even when the popover flips upward from a
		   low anchor (e.g. the Within field mid-panel). Falls back to a fixed
		   cap when the var is absent; the list scrolls within whatever's left. */
		max-height: min(420px, var(--bits-floating-available-height, 70vh));
	}
	/* Search row: magnifying-glass prefix + Command.Input. */
	:global(.cb-search-row) {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 10px;
		border-bottom: 1px solid var(--border);
	}
	:global(.cb-search-icon) {
		display: inline-flex;
		width: 12px;
		height: 12px;
		color: var(--text-dimmer);
		flex-shrink: 0;
	}
	:global(.cb-search-icon svg) {
		width: 100%;
		height: 100%;
		fill: currentColor;
	}
	:global(.cb-search-icon svg path) {
		fill: currentColor;
	}
	/* Command.Input is a real <input> and inherits app.css's global input
	   styling; strip all of it so only the search-row divider frames it. */
	:global(.cb-search) {
		flex: 1 1 auto;
		min-width: 0;
		padding: 2px 0;
		background: transparent;
		border: none;
		border-radius: 0;
		outline: none;
		box-shadow: none;
		-webkit-appearance: none;
		appearance: none;
		color: var(--text);
		font: inherit;
		font-family: var(--font-ui);
		font-size: 0.82rem;
	}
	:global(.cb-search:focus) {
		outline: none;
		box-shadow: none;
	}
	:global(.cb-search::placeholder) {
		color: var(--text-dimmer);
	}

	/* Filter-pill row above the list — colour-tinted small caps, filled
	   ~18% when active; trailing clear button on the right. */
	:global(.cb-pills) {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 6px;
		padding: 6px 8px 4px;
		border-bottom: 1px solid var(--border);
	}
	:global(.cb-pill) {
		font-family: var(--font-ui);
		font-size: 0.66rem;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--pcolor, var(--text-dimmer));
		background: transparent;
		border: 1px solid color-mix(in srgb, var(--pcolor, var(--border)) 40%, transparent);
		border-radius: 999px;
		padding: 3px 10px;
		cursor: pointer;
		white-space: nowrap;
		transition:
			background 0.12s,
			border-color 0.12s;
	}
	:global(.cb-pill:hover) {
		background: color-mix(in srgb, var(--pcolor) 12%, transparent);
	}
	:global(.cb-pill.active) {
		background: color-mix(in srgb, var(--pcolor) 18%, transparent);
		border-color: var(--pcolor);
	}
	:global(.cb-clear) {
		margin-left: auto;
		background: transparent;
		border: 0;
		color: var(--text-dimmer);
		cursor: pointer;
		padding: 3px;
		border-radius: 6px;
		display: grid;
		place-items: center;
	}
	:global(.cb-clear:hover:not(:disabled)) {
		color: var(--text-accent);
	}
	:global(.cb-clear:disabled) {
		opacity: 0.35;
		cursor: default;
	}
	:global(.cb-clear svg) {
		width: 15px;
		height: 15px;
		fill: currentColor;
	}
	:global(.cb-clear svg path) {
		fill: currentColor;
	}

	:global(.cb-list) {
		flex: 1 1 auto;
		min-height: 0;
		overflow-y: auto;
		overscroll-behavior: contain;
		padding: 4px 0;
	}
	:global(.cb-empty) {
		padding: 12px;
		font-family: var(--font-ui);
		font-size: 0.82rem;
		color: var(--text-dimmer);
		font-style: italic;
		text-align: center;
	}
	:global(.cb-item) {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 12px;
		font-family: var(--font-ui);
		font-size: 0.85rem;
		color: var(--text);
		cursor: pointer;
		user-select: none;
	}
	/* bits-ui Command sets data-selected='true' on the highlighted item
	   (keyboard nav) — same visual as pointer hover. */
	:global(.cb-item[data-selected='true']),
	:global(.cb-item:hover) {
		background: color-mix(in srgb, var(--text) 6%, transparent);
	}
	:global(.cb-item[aria-disabled='true']) {
		opacity: 0.5;
		cursor: default;
	}
	:global(.cb-item--action) {
		color: var(--text-accent);
	}
	:global(.cb-check) {
		flex-shrink: 0;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 14px;
		height: 14px;
		color: var(--text-accent);
	}
	:global(.cb-check svg) {
		width: 100%;
		height: 100%;
	}
	:global(.cb-item-icon) {
		display: inline-flex;
		width: 18px;
		height: 18px;
		flex-shrink: 0;
		color: var(--kind-color, var(--text-accent));
	}
	:global(.cb-item-icon svg) {
		width: 100%;
		height: 100%;
		fill: currentColor;
	}
	:global(.cb-item-icon svg path) {
		fill: currentColor;
	}
	:global(.cb-item-name) {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	:global(.cb-item-name--muted) {
		color: var(--text-dimmer);
		font-style: italic;
	}
	:global(.cb-sep) {
		height: 1px;
		background: var(--border);
		margin: 4px 0;
	}
</style>
