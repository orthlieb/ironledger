<script lang="ts">
	/**
	 * StatAllocator — the New Character dialog's stat-row + array picker.
	 *
	 * Renders one `StatControl` per stat (bound directly to the parent's
	 * draft `stats` object) and a Roll button that overwrites all five in
	 * one go by shuffling the currently-selected array. The array picker
	 * appears only when there is more than one array to pick from
	 * (Lodestar loaded → three; otherwise → one, and the picker collapses).
	 *
	 * Selecting a different array in the picker does NOT roll — it just
	 * arms the Roll button so the next click distributes that array's
	 * values. This mirrors "pick your poison, then commit" rather than a
	 * hidden auto-roll on every focus of the picker.
	 *
	 * Stays fully hand-editable: after a Roll, the user can still change
	 * any of the five StatControls, and the parent's `stats` proxy takes
	 * the edit through the same `bind:value` path.
	 */
	import StatControl from './StatControl.svelte';
	import Select from './Select.svelte';
	import { tooltip } from '$lib/actions/tooltip.js';
	import diceD6Svg from '$icons/dice-d6-light.svg?raw';
	import { rollStats, type Stat, type StatArray } from '$lib/rules/statArrays.js';

	let {
		stats = $bindable(),
		arrays,
	}: {
		/** Live draft stats — mutated in-place on Roll and by StatControl's
		 *  bind:value when the user edits a tile. */
		stats: Record<Stat, number>;
		/** Available arrays for this session — see `availableStatArrays`.
		 *  Never empty (BASE_ARRAY is the floor). */
		arrays: readonly StatArray[];
	} = $props();

	// Default the picker to the first array (Lodestar list-first → Challenging;
	// base-only → the standard array). Kept in local state so switching arrays
	// doesn't roll — it just arms the next Roll click. The effect fills in
	// the initial pick AND reconciles a stale selection if `arrays` swaps
	// (e.g. Lodestar gets toggled off mid-dialog).
	let selectedId = $state<string>('');
	$effect(() => {
		if (!arrays.find((a) => a.id === selectedId)) selectedId = arrays[0]?.id ?? '';
	});

	const selected = $derived(arrays.find((a) => a.id === selectedId) ?? arrays[0]);
	const options = $derived(arrays.map((a) => ({ value: a.id, label: a.label })));

	function roll() {
		if (!selected) return;
		const rolled = rollStats(selected);
		stats.edge = rolled.edge;
		stats.heart = rolled.heart;
		stats.iron = rolled.iron;
		stats.shadow = rolled.shadow;
		stats.wits = rolled.wits;
	}
</script>

<div class="sa-field">
	<span class="sa-label">Stats</span>

	{#if arrays.length > 1}
		<!-- Multi-array picker: appears only when the ruleset offers a choice.
		     A one-array session (no Lodestar) collapses the picker entirely so
		     the user isn't offered a decision that has one answer. -->
		<div class="sa-picker-row">
			<Select bind:value={selectedId} {options} />
			<button
				class="dice-btn"
				type="button"
				onclick={roll}
				use:tooltip={'Roll stats for the selected array'}
				aria-label="Roll stats">{@html diceD6Svg}</button
			>
		</div>
		{#if selected}
			<span class="sa-hint">{selected.hint}</span>
		{/if}
	{:else}
		<!-- Base-only session: no picker, just the Roll button. -->
		<div class="sa-picker-row sa-picker-row--single">
			<button
				class="dice-btn"
				type="button"
				onclick={roll}
				use:tooltip={'Roll stats'}
				aria-label="Roll stats">{@html diceD6Svg}</button
			>
			{#if selected}
				<span class="sa-hint">{selected.hint}</span>
			{/if}
		</div>
	{/if}

	<div class="sa-stats-row">
		<StatControl
			label="Edge"
			bind:value={stats.edge}
			color="var(--color-edge)"
			min={0}
			max={5}
			tooltip="Quickness, agility, and prowess in ranged combat"
		/>
		<StatControl
			label="Heart"
			bind:value={stats.heart}
			color="var(--color-heart)"
			min={0}
			max={5}
			tooltip="Courage, willpower, empathy, sociability, and loyalty"
		/>
		<StatControl
			label="Iron"
			bind:value={stats.iron}
			color="var(--color-iron)"
			min={0}
			max={5}
			tooltip="Physical strength, endurance, and prowess in close combat"
		/>
		<StatControl
			label="Shadow"
			bind:value={stats.shadow}
			color="var(--color-shadow)"
			min={0}
			max={5}
			tooltip="Sneakiness, deceptiveness, and cunning"
		/>
		<StatControl
			label="Wits"
			bind:value={stats.wits}
			color="var(--color-wits)"
			min={0}
			max={5}
			tooltip="Expertise, knowledge, and observation"
		/>
	</div>
</div>

<style>
	.sa-field {
		display: flex;
		flex-direction: column;
		gap: 6px;
		margin-top: 10px;
		padding-top: 8px;
		border-top: 1px solid var(--border);
	}
	.sa-label {
		font-family: var(--font-ui);
		font-size: 0.65rem;
		font-weight: 600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--text-dimmer);
	}
	.sa-picker-row {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.sa-picker-row :global(.bui-select-trigger) {
		flex: 1;
	}
	.sa-hint {
		font-family: var(--font-ui);
		font-size: 0.75rem;
		color: var(--text-dimmer);
		font-style: italic;
	}
	.sa-stats-row {
		display: flex;
		gap: 4px;
		justify-content: flex-start;
	}
</style>
