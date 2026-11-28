<script lang="ts">
	/**
	 * A connection's Within field (Core tab): the settlement or landmark it
	 * sits inside, picked from the eligible containers (kind pills, and a
	 * "Nowhere" row that clears it), with a jump to that container. Shared by
	 * the settlement/landmark and NPC Core tabs.
	 */
	import Combobox from '#lib/components/Combobox.svelte';
	import { tooltip } from '#lib/actions/tooltip.js';
	import { ENTITY_KIND_META } from '#lib/entityKinds.js';
	import gotoSvg from '#icons/arrow-up-right-from-square-solid.svg?raw';
	import type { EntryKind, WithinItem } from './connections.js';

	let {
		id,
		tour,
		items,
		value,
		label,
		filters = $bindable(),
		onselect,
		ongo,
	}: {
		/** The picker's id, for the row's label. */
		id: string;
		/** A `data-tour` hook for the picker. */
		tour?: string;
		/** The containers it may sit inside. */
		items: WithinItem[];
		/** The container's `kind:id` ref; none when it sits nowhere. */
		value: string | undefined;
		/** The container's name. */
		label: string;
		/** The kind pills switched on (shared across entries). */
		filters: Set<string>;
		/** A container picked, by ref; '' for Nowhere. */
		onselect: (ref: string) => void;
		/** Go to the container, by its id. */
		ongo: (id: string) => void;
	} = $props();

	const PILLS: { key: string; label: string; color: string }[] = [
		{ key: 'community', label: 'Settlements', color: ENTITY_KIND_META.community.color },
		{ key: 'place', label: 'Landmarks', color: ENTITY_KIND_META.place.color },
	];

	/** The container's kind and id, from its ref. */
	const parent = $derived.by(() => {
		if (!value) return null;
		const i = value.indexOf(':');
		return i > 0 ? { kind: value.slice(0, i) as EntryKind, id: value.slice(i + 1) } : null;
	});
	/** Containers are only settlements or landmarks. */
	const parentMeta = $derived(value ? ENTITY_KIND_META[parent?.kind ?? 'place'] : undefined);
	const goLabel = $derived(`Go to ${parent ? ENTITY_KIND_META[parent.kind].label : 'container'}`);
</script>

<div class="cm-field-row">
	<label class="cm-field-label" for={id}>Within</label>
	<Combobox
		{id}
		class="cm-within-select"
		{tour}
		{items}
		getKey={(o) => o.ref}
		getLabel={(o) => o.label}
		getIcon={(o) => o.icon}
		getColor={(o) => o.color}
		activeKey={value ?? ''}
		onselect={(o) => onselect(o.ref)}
		triggerValue={value ? label : 'Nowhere'}
		triggerIcon={parentMeta?.icon}
		triggerColor={parentMeta?.color}
		searchPlaceholder="Search settlements & landmarks…"
		emptyText="No eligible containers."
		ariaLabel="Within — the container this sits inside"
		filterGroupLabel="Filter by container kind"
		filters={PILLS}
		bind:activeFilters={filters}
		filterOf={(o) => o.kind}
		clearItem={{ label: 'Nowhere', onselect: () => onselect('') }}
	/>
	{#if value}
		<button
			class="cm-within-jump"
			type="button"
			onclick={() => ongo(parent?.id ?? '')}
			use:tooltip={goLabel}
			aria-label={goLabel}>{@html gotoSvg}</button
		>
	{/if}
</div>

<style>
	/* The jump to the container: matches the d6 roll button (.dice-btn,
	   app.css): 22×22, 3px radius, transparent, centred in the row. */
	.cm-within-jump {
		flex: 0 0 auto;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		box-sizing: border-box;
		width: 22px;
		height: 22px;
		align-self: center;
		border: 1px solid var(--border-mid);
		border-radius: 3px;
		background: transparent;
		color: var(--text-muted);
		line-height: 1;
		cursor: pointer;
	}
	.cm-within-jump :global(svg) {
		width: 13px;
		height: 13px;
		fill: currentColor;
		display: block;
	}
	.cm-within-jump:hover {
		border-color: var(--text-accent);
		color: var(--text-accent);
	}
</style>
