<script lang="ts">
	/**
	 * ExportItemFilter — the searchable multi-select used inside an ExportDialog
	 * category expander. A search field filters the list; a "Select all" row in
	 * the upper-left toggles every *currently-filtered* item; each item has its
	 * own checkbox. `selected` (a Set of ids) is bindable, so the parent category
	 * reads it straight back for its own tri-state.
	 *
	 * Reuses ExportDialog's global `.exd-cb` / `.exd-subitem` / `.exd-tag`
	 * classes (this component only ever renders inside that dialog) and adds a
	 * few scoped `.eif-*` styles for the search field and select-all row.
	 */
	const CHECK =
		'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12l5 5L20 6"/></svg>';

	let {
		items,
		selected = $bindable(),
		placeholder = 'Search…',
		onchange,
	}: {
		items: { id: string; name: string; tag?: string }[];
		selected: Set<string>;
		placeholder?: string;
		onchange?: () => void;
	} = $props();

	let q = $state('');

	const filtered = $derived.by(() => {
		const s = q.trim().toLowerCase();
		if (!s) return items;
		return items.filter(
			(i) => i.name.toLowerCase().includes(s) || (i.tag?.toLowerCase().includes(s) ?? false),
		);
	});
	const allSel = $derived(filtered.length > 0 && filtered.every((i) => selected.has(i.id)));
	const someSel = $derived(filtered.some((i) => selected.has(i.id)));
	const allState = $derived<'on' | 'off' | 'mixed'>(allSel ? 'on' : someSel ? 'mixed' : 'off');

	function commit(next: Set<string>) {
		selected = next;
		onchange?.();
	}
	function toggle(id: string) {
		const n = new Set(selected);
		if (n.has(id)) n.delete(id);
		else n.add(id);
		commit(n);
	}
	function toggleAll() {
		const n = new Set(selected);
		if (allSel) filtered.forEach((i) => n.delete(i.id));
		else filtered.forEach((i) => n.add(i.id));
		commit(n);
	}
</script>

<div class="eif">
	<input class="eif-search" type="search" bind:value={q} {placeholder} aria-label={placeholder} />
	<button type="button" class="exd-subitem eif-all" onclick={toggleAll}>
		<span class="exd-cb sm" data-state={allState} aria-hidden="true">{@html CHECK}</span>
		<span class="exd-subname">Select all{q.trim() ? ` (${filtered.length} matching)` : ''}</span>
	</button>
	<div class="eif-list">
		{#each filtered as i (i.id)}
			<button type="button" class="exd-subitem" onclick={() => toggle(i.id)}>
				<span class="exd-cb sm" data-state={selected.has(i.id) ? 'on' : 'off'} aria-hidden="true"
					>{@html CHECK}</span
				>
				<span class="exd-subname"
					>{i.name}{#if i.tag}<span class="exd-tag">{i.tag}</span>{/if}</span
				>
			</button>
		{/each}
		{#if filtered.length === 0}
			<p class="eif-empty">No matches for “{q}”.</p>
		{/if}
	</div>
</div>

<style>
	.eif {
		display: flex;
		flex-direction: column;
		gap: 2px;
		width: 100%;
	}
	.eif-search {
		font: inherit;
		font-size: 12.5px;
		background: var(--bg-inset);
		border: 1px solid var(--border);
		border-radius: 6px;
		padding: 6px 9px;
		color: var(--text);
		margin-bottom: 2px;
	}
	.eif-search::placeholder {
		color: var(--text-dimmer);
	}
	.eif-search:focus-visible {
		outline: 2px solid var(--text-accent);
		outline-offset: 1px;
	}
	.eif-all {
		border-bottom: 1px solid var(--border);
		border-radius: 0;
		margin-bottom: 2px;
	}
	.eif-all :global(.exd-subname) {
		font-weight: 500;
		color: var(--text-muted);
	}
	.eif-list {
		display: flex;
		flex-direction: column;
		gap: 1px;
		max-height: 190px;
		overflow-y: auto;
		overscroll-behavior: contain;
	}
	.eif-empty {
		font-size: 12px;
		color: var(--text-dimmer);
		padding: 8px;
		margin: 0;
		text-align: center;
	}
</style>
