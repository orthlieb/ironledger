<script lang="ts">
	/**
	 * The Core tab of a settlement (`community`) or landmark (`place`) in the
	 * Connections area:
	 *   - Region: its own, or, when it sits within another, the one it
	 *     inherits from the top of that chain (read-only).
	 *   - Lodestar's settlement fields (settlements only).
	 *   - Location / Landmark and Descriptor: hidden on a settlement under
	 *     Lodestar, whose suite replaces them.
	 *   - Trouble, with the Settlement Trouble roll (settlements only).
	 *   - Contains: what sits within it.
	 *   - Within: the `within` snippet, a WithinField.
	 *   - Map: a chip per marker that points at it.
	 *
	 * The parent (CommunitiesArea) keeps the situational notes below, the
	 * shared field-row styles, and every write: `onupdate` patches the entry.
	 */
	import type { Snippet } from 'svelte';
	import { tooltip } from '#lib/actions/tooltip.js';
	import { ENTITY_KIND_META } from '#lib/entityKinds.js';
	import type { EntityMarkerRef } from '#lib/mapStore.svelte.js';
	import type { Community, Place } from '#lib/types.js';
	import diceD6Svg from '#icons/dice-d6-light.svg?raw';
	import { LODESTAR_SETTLEMENT_FIELDS, type EntryKind } from './connections.js';

	let {
		kind,
		data: c,
		lodestarOn,
		inherited,
		contains,
		markers,
		rolling,
		within,
		onupdate,
		onrolltrouble,
		ongo,
		onjump,
	}: {
		kind: 'community' | 'place';
		/** The live entry. */
		data: Community | Place;
		lodestarOn: boolean;
		/** When it sits within another: the region it inherits, and the name of
		 *  the entry at the top of the chain that it comes from. */
		inherited: { region: string; from: string } | null;
		/** What sits within it. */
		contains: Array<{ id: string; kind: EntryKind; name: string }>;
		/** The markers that point at it. */
		markers: EntityMarkerRef[];
		/** A roll is under way: the Trouble d6 waits. */
		rolling: boolean;
		/** The Within field. */
		within: Snippet;
		onupdate: (patch: Partial<Community & Place>) => void;
		onrolltrouble: () => void;
		/** Go to another entry, by its id. */
		ongo: (id: string) => void;
		/** Open the map at a marker. */
		onjump: (ref: EntityMarkerRef) => void;
	} = $props();

	const isPlace = $derived(kind === 'place');

	/** Short "(x, y)" for a marker's tooltip: integers stay integer, else 2 dp. */
	function fmtCoord(v: number): string {
		return Number.isInteger(v) ? String(v) : v.toFixed(2);
	}

	const value = (e: Event) => (e.target as HTMLInputElement).value;
</script>

<div class="cm-field-row">
	<label class="cm-field-label" for="cm-region-{c.id}">Region</label>
	{#if inherited}
		<!-- Region is inherited from the ROOT of the Within chain (the
		     top-level entry), not the immediate parent — read-only here;
		     edit it on that root entry. -->
		<input
			id="cm-region-{c.id}"
			class="cm-input cm-input--readonly"
			type="text"
			disabled
			value={inherited.region}
			use:tooltip={inherited.from
				? `Region comes from ${inherited.from}`
				: 'Region comes from the top of this chain'}
			placeholder="—"
		/>
	{:else}
		<input
			id="cm-region-{c.id}"
			class="cm-input"
			type="text"
			value={c.region}
			oninput={(e) => onupdate({ region: value(e) })}
			placeholder="Region…"
		/>
	{/if}
</div>
{#if kind === 'community'}
	{@const s = c as Community}
	{#each LODESTAR_SETTLEMENT_FIELDS as f (f.key)}
		{#if lodestarOn || s[f.key]}
			<div class="cm-field-row">
				<label class="cm-field-label" for="cm-{f.key}-{s.id}">{f.label}</label>
				<input
					id="cm-{f.key}-{s.id}"
					class="cm-input"
					type="text"
					value={s[f.key] ?? ''}
					oninput={(e) => onupdate({ [f.key]: value(e) })}
					placeholder="{f.label}…"
				/>
			</div>
		{/if}
	{/each}
{/if}
<!-- Lodestar supersedes a settlement's Location + Descriptor with its own
     suite, so hide both under Lodestar even if legacy data still carries a
     value. Landmarks always show them. -->
{#if isPlace || !lodestarOn}
	<div class="cm-field-row">
		<label class="cm-field-label" for="cm-location-{c.id}"
			>{isPlace ? 'Landmark' : 'Location'}</label
		>
		<input
			id="cm-location-{c.id}"
			class="cm-input"
			type="text"
			value={c.location}
			oninput={(e) => onupdate({ location: value(e) })}
			placeholder={isPlace ? 'Landmark…' : 'Location…'}
		/>
	</div>
	<div class="cm-field-row">
		<label class="cm-field-label" for="cm-locdesc-{c.id}">Descriptor</label>
		<input
			id="cm-locdesc-{c.id}"
			class="cm-input"
			type="text"
			value={c.locationDescription}
			oninput={(e) => onupdate({ locationDescription: value(e) })}
			placeholder="Location descriptor…"
		/>
	</div>
{/if}
{#if !isPlace || c.trouble}
	<div class="cm-field-row cm-field-row--trouble">
		<label class="cm-field-label" for="cm-trouble-{c.id}">Trouble</label>
		<input
			id="cm-trouble-{c.id}"
			class="cm-input"
			type="text"
			value={c.trouble}
			oninput={(e) => onupdate({ trouble: value(e) })}
			placeholder={isPlace ? 'Trouble…' : 'Settlement trouble…'}
		/>
		{#if !isPlace}
			<!-- The Settlement Trouble oracle is a settlement's: landmarks have no
			     trouble oracle of their own, so no d6 for them. -->
			<button
				class="dice-btn"
				type="button"
				onclick={onrolltrouble}
				disabled={rolling}
				use:tooltip={'Roll settlement trouble oracle'}
				aria-label="Roll settlement trouble oracle">{@html diceD6Svg}</button
			>
		{/if}
	</div>
{/if}
{#if contains.length > 0}
	<div class="cm-field-row cm-field-row--places">
		<span class="cm-field-label">Contains</span>
		<div class="cm-mapref-chips">
			{#each contains as ch (ch.kind + ch.id)}
				<button
					class="cm-mapref-chip cm-mapref-chip--entity"
					type="button"
					style:--chip-color={ENTITY_KIND_META[ch.kind].color}
					onclick={() => ongo(ch.id)}
					use:tooltip={`Go to this ${ENTITY_KIND_META[ch.kind].label.toLowerCase()}`}
					><span class="cm-mapref-glyph" aria-hidden="true"
						>{@html ENTITY_KIND_META[ch.kind].icon}</span
					><span class="cm-mapref-name">{ch.name || 'Untitled'}</span></button
				>
			{/each}
		</div>
	</div>
{/if}
<!-- Within: right above the Map field. -->
{@render within()}
<!-- Map: a chip per marker pointing at it, across every map; the chips wrap.
     The marker's (x, y) is in the tooltip; the chip says the map's name. -->
<div class="cm-field-row cm-field-row--map" data-tour="cm-map">
	<span class="cm-field-label">Map</span>
	<div class="cm-mapref-chips">
		{#if markers.length === 0}
			<span class="cm-mapref-empty">Not on any map</span>
		{:else}
			{#each markers as ref (ref.markerId)}
				<button
					class="cm-mapref-chip"
					onclick={() => onjump(ref)}
					use:tooltip={`Jump to "${ref.label || '(unlabeled)'}" on ${ref.mapName} — (${fmtCoord(ref.x)}, ${fmtCoord(ref.y)})`}
					aria-label={`Jump to marker on ${ref.mapName}`}
				>
					<span class="cm-mapref-name">{ref.mapName}</span>
				</button>
			{/each}
		{/if}
	</div>
</div>

<style>
	/* Chips: the markers that point at it (Map), and what sits within it
	   (Contains, tinted with each one's kind colour). */
	.cm-mapref-chips {
		flex: 1 1 auto;
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		align-items: center;
	}
	.cm-mapref-empty {
		font-family: var(--font-ui);
		font-size: 0.75rem;
		font-style: italic;
		color: var(--text-dimmer);
	}
	.cm-mapref-chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 2px 10px;
		background: var(--bg-control);
		border: 1px solid var(--border-mid);
		border-radius: 12px;
		font-family: var(--font-ui);
		font-size: 0.75rem;
		color: var(--text);
		cursor: pointer;
		max-width: 100%;
		white-space: nowrap;
	}
	.cm-mapref-chip:hover {
		border-color: var(--text-accent);
		color: var(--text-accent);
	}
	.cm-mapref-chip--entity {
		border-color: color-mix(in srgb, var(--chip-color) 55%, var(--border-mid));
		color: var(--chip-color);
	}
	.cm-mapref-chip--entity:hover {
		background: color-mix(in srgb, var(--chip-color) 12%, transparent);
		border-color: var(--chip-color);
		color: var(--chip-color);
	}
	.cm-mapref-glyph {
		flex-shrink: 0;
		display: inline-flex;
		width: 12px;
		height: 12px;
		color: var(--chip-color);
	}
	.cm-mapref-glyph :global(svg) {
		width: 100%;
		height: 100%;
		fill: currentColor;
		display: block;
	}
	.cm-mapref-name {
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 12rem;
	}
</style>
