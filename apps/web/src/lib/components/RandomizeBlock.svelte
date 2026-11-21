<script lang="ts">
	/**
	 * RandomizeBlock — the shared "Region of origin (optional)" picker +
	 * "Also randomize" checklist rendered inside the New NPC and New Character
	 * dialogs. Every field it toggles is one of the ones the shared
	 * `rollCharacterRandomizations` helper knows how to roll, so the flags
	 * bindable here map straight through to that call.
	 *
	 * Two host-owned bindables:
	 *   flags   — the tick state (First Look / Activity / Disposition / Role /
	 *             Goal / Revealed Details, plus YRT-only Touched + Religion)
	 *   origin  — the raw YRT region label the user picked (or '' for none);
	 *             ignored entirely when YRT is off
	 *
	 * The rendered checkboxes for firstLook / activity / disposition only
	 * appear when a currently-visible oracle backs the concept (base +
	 * whatever extensions are enabled), matching how the New NPC dialog
	 * already gated them.
	 */
	import { resolveCharacterOracle } from '#lib/oracleStore.svelte.js';
	import { isSourceEnabled } from '#lib/expansionStore.svelte.js';
	import { tooltip } from '#lib/actions/tooltip.js';
	import Checkbox from './Checkbox.svelte';
	import Select from './Select.svelte';
	import diceD6Svg from '#icons/dice-d6-light.svg?raw';
	import {
		regionOriginOptions,
		rollRandomRegionOrigin,
		type CharacterRandomizeFlags,
	} from '#lib/characterRollups.js';

	let {
		flags = $bindable(),
		origin = $bindable(''),
		characterFields = false,
	}: {
		flags: CharacterRandomizeFlags;
		origin?: string;
		/** New Character: the region of origin, religion and touched level are
		 *  character fields there (CharacterFields), so this block drops the
		 *  region picker and the Religion box, and its Touched box rolls only
		 *  the features. New NPC leaves it off. */
		characterFields?: boolean;
	} = $props();

	const yrt = $derived(isSourceEnabled('yrt'));
	const firstLookOk = $derived(!!resolveCharacterOracle('firstLook'));
	const activityOk = $derived(!!resolveCharacterOracle('activity'));
	const dispositionOk = $derived(!!resolveCharacterOracle('disposition'));

	// Region of origin drives the religion checkbox — no region → no country
	// column to roll against. Sync on every origin transition: picking a
	// region auto-arms religion (its checkbox is now meaningful), clearing a
	// region unticks it (nothing to roll against). `seenOrigin` starts at a
	// sentinel so the very first mount counts as a transition — that way a
	// dialog opened with `religion: true` in its defaults but no region yet
	// still shows the checkbox unchecked, matching what will actually roll.
	// A user re-check / uncheck between origin changes sticks until the
	// next origin transition, which is a fresh state either way.
	let seenOrigin: string | undefined = undefined;
	$effect(() => {
		if (origin !== seenOrigin) {
			flags.religion = !!origin;
			seenOrigin = origin;
		}
	});

	function randomOrigin() {
		const v = rollRandomRegionOrigin();
		if (v) origin = v;
	}

	const originOpts = $derived(regionOriginOptions());
</script>

{#if yrt && !characterFields}
	<div class="co-field" data-tour="randomize-origin">
		<span class="co-field-label">Region of origin (optional — where they were born)</span>
		<div class="co-name-row">
			<Select bind:value={origin} options={originOpts} placeholder="Select a region…" />
			<button
				class="dice-btn"
				type="button"
				onclick={randomOrigin}
				use:tooltip={'Random region of origin'}
				aria-label="Random region of origin"
				data-tour="roll-origin">{@html diceD6Svg}</button
			>
		</div>
	</div>
{/if}

<div class="nn-randomize" data-tour="randomize-also">
	<span class="nn-randomize-label">Also randomize</span>
	{#if firstLookOk}
		<Checkbox
			class="nn-check"
			checked={flags.firstLook}
			onCheckedChange={(v) => (flags.firstLook = !!v)}
		>
			<span class="nn-check-label">First Look</span>
		</Checkbox>
	{/if}
	{#if activityOk}
		<Checkbox
			class="nn-check"
			checked={flags.activity}
			onCheckedChange={(v) => (flags.activity = !!v)}
		>
			<span class="nn-check-label">Activity</span>
		</Checkbox>
	{/if}
	{#if dispositionOk}
		<Checkbox
			class="nn-check"
			checked={flags.disposition}
			onCheckedChange={(v) => (flags.disposition = !!v)}
		>
			<span class="nn-check-label">Disposition</span>
		</Checkbox>
	{/if}
	<Checkbox class="nn-check" checked={flags.role} onCheckedChange={(v) => (flags.role = !!v)}>
		<span class="nn-check-label">Role</span>
	</Checkbox>
	<Checkbox class="nn-check" checked={flags.goal} onCheckedChange={(v) => (flags.goal = !!v)}>
		<span class="nn-check-label">Goal</span>
	</Checkbox>
	<Checkbox
		class="nn-check"
		checked={flags.descriptor}
		onCheckedChange={(v) => (flags.descriptor = !!v)}
	>
		<span class="nn-check-label">Revealed Details</span>
	</Checkbox>
	{#if yrt}
		<Checkbox
			class="nn-check"
			checked={flags.touched}
			onCheckedChange={(v) => (flags.touched = !!v)}
		>
			<span
				class="nn-check-label"
				use:tooltip={characterFields
					? 'Roll the features of a Prime, Second or Third character into their background'
					: ''}>{characterFields ? 'Touched features' : 'Touched'}</span
			>
		</Checkbox>
		{#if !characterFields}
			<Checkbox
				class="nn-check"
				checked={flags.religion}
				disabled={!origin}
				onCheckedChange={(v) => (flags.religion = !!v)}
			>
				<span class="nn-check-label" use:tooltip={origin ? '' : 'Choose a region of origin first'}>
					Religion
				</span>
			</Checkbox>
		{/if}
	{/if}
</div>
