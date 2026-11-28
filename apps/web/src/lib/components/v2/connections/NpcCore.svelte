<script lang="ts">
	/**
	 * The Core tab of an NPC in the Connections area: Alive / Deceased, then
	 * First Look / Activity / Disposition (when a content pack has their
	 * oracles, or they hold a value), Role, Goal, Revealed Details,
	 * Relationship, Location (free text: where within the place below), and
	 * Within (the `within` snippet, a WithinField).
	 *
	 * The parent (CommunitiesArea) keeps the situational notes below, the
	 * shared field-row styles, and every write: `onupdate` patches the NPC.
	 */
	import type { Snippet } from 'svelte';
	import Select from '#lib/components/Select.svelte';
	import SegmentedRadio from '#lib/components/SegmentedRadio.svelte';
	import { resolveCharacterOracle } from '#lib/oracleStore.svelte.js';
	import type { Npc, NpcRelationship } from '#lib/types.js';
	import heartPulseSvg from '#icons/heart-pulse-solid.svg?raw';
	import skullSvg from '#icons/skull-crossbones-solid.svg?raw';

	let {
		data: n,
		within,
		onupdate,
	}: {
		/** The live NPC. */
		data: Npc;
		/** The Within field. */
		within: Snippet;
		onupdate: (patch: Partial<Npc>) => void;
	} = $props();

	const RELATIONSHIPS: { value: NpcRelationship; label: string }[] = [
		{ value: 'bond', label: 'Bond' },
		{ value: 'neutral', label: 'Neutral' },
		{ value: 'foe', label: 'Foe' },
	];

	const value = (e: Event) => (e.target as HTMLInputElement).value;
</script>

<!-- Status, at the top of the tab so the header stays lean; as the
     initiative line tops the Characters card. -->
<div class="cm-status-section">
	<span class="cm-status-label">Status</span>
	<SegmentedRadio
		ariaLabel="NPC status"
		labels="always"
		value={n.deceased ? 'deceased' : 'alive'}
		onchange={(v) => onupdate({ deceased: v === 'deceased' })}
		options={[
			{ value: 'alive', icon: heartPulseSvg, text: 'Alive', label: 'Mark alive', tone: 'go' },
			{
				value: 'deceased',
				icon: skullSvg,
				text: 'Deceased',
				label: 'Mark deceased',
				tone: 'stop',
			},
		]}
	/>
</div>
{#if n.firstLook || resolveCharacterOracle('firstLook')}
	<div class="cm-field-row">
		<label class="cm-field-label" for="cm-first-look-{n.id}">First Look</label>
		<input
			id="cm-first-look-{n.id}"
			class="cm-input"
			type="text"
			value={n.firstLook ?? ''}
			oninput={(e) => onupdate({ firstLook: value(e) })}
			placeholder="How they strike you at first sight…"
		/>
	</div>
{/if}
{#if n.activity || resolveCharacterOracle('activity')}
	<div class="cm-field-row">
		<label class="cm-field-label" for="cm-activity-{n.id}">Activity</label>
		<input
			id="cm-activity-{n.id}"
			class="cm-input"
			type="text"
			value={n.activity ?? ''}
			oninput={(e) => onupdate({ activity: value(e) })}
			placeholder="What they’re doing when you meet them…"
		/>
	</div>
{/if}
{#if n.disposition || resolveCharacterOracle('disposition')}
	<div class="cm-field-row">
		<label class="cm-field-label" for="cm-disposition-{n.id}">Disposition</label>
		<input
			id="cm-disposition-{n.id}"
			class="cm-input"
			type="text"
			value={n.disposition ?? ''}
			oninput={(e) => onupdate({ disposition: value(e) })}
			placeholder="How they feel toward you…"
		/>
	</div>
{/if}
<div class="cm-field-row">
	<label class="cm-field-label" for="cm-role-{n.id}">Role</label>
	<input
		id="cm-role-{n.id}"
		class="cm-input"
		type="text"
		value={n.role}
		oninput={(e) => onupdate({ role: value(e) })}
		placeholder="What they do, their place in the world…"
	/>
</div>
<div class="cm-field-row">
	<label class="cm-field-label" for="cm-goal-{n.id}">Goal</label>
	<input
		id="cm-goal-{n.id}"
		class="cm-input"
		type="text"
		value={n.goal}
		oninput={(e) => onupdate({ goal: value(e) })}
		placeholder="What they want…"
	/>
</div>
<div class="cm-field-row">
	<label class="cm-field-label" for="cm-desc-{n.id}">Revealed Details</label>
	<input
		id="cm-desc-{n.id}"
		class="cm-input"
		type="text"
		value={n.descriptor}
		oninput={(e) => onupdate({ descriptor: value(e) })}
		placeholder="What you’ve learned about them…"
	/>
</div>
<div class="cm-field-row">
	<label class="cm-field-label" for="cm-rel-{n.id}">Relationship</label>
	<Select
		id="cm-rel-{n.id}"
		class="cm-select"
		value={n.relationship}
		options={RELATIONSHIPS}
		onchange={(v) => onupdate({ relationship: v })}
	/>
</div>
<div class="cm-field-row">
	<label class="cm-field-label" for="cm-loc-{n.id}">Location</label>
	<input
		id="cm-loc-{n.id}"
		class="cm-input"
		type="text"
		value={n.location}
		oninput={(e) => onupdate({ location: value(e) })}
		placeholder="Where to find them, in the place below…"
	/>
</div>
<!-- Within: the settlement or landmark, below the free-text Location (a spot
     within it). -->
{@render within()}

<style>
	.cm-status-section {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding-bottom: 8px;
		border-bottom: 1px solid var(--border);
	}
	.cm-status-label {
		font-family: var(--font-ui);
		font-size: 0.7rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--text-dimmer);
	}
</style>
