<script lang="ts">
	/**
	 * StatAllocator — the New Character dialog's stat-row + array picker.
	 *
	 * Renders one `StatControl` per stat (bound directly to the parent's
	 * draft `stats` object) and a Roll button that overwrites all five in
	 * one go by shuffling the currently-selected array. Two picker shapes
	 * share the same underlying state:
	 *
	 *   • Lodestar loaded (three arrays) → bits-ui DropdownMenu. Its
	 *     trigger shows the current selection; opening the menu reveals
	 *     the three tone options, each with a leading ✓ on the LHS of
	 *     the currently-armed one (mirrors HamburgerMenu's View submenu).
	 *   • Base only (single array) → a single house-style Checkbox with
	 *     the array's label. Checked + non-interactive: there is nothing
	 *     to switch to, so the checkbox is a static "this is the array
	 *     you'll roll" affordance rather than a toggle.
	 *
	 * Selecting a different array in the dropdown does NOT roll — it just
	 * arms the Roll button so the next click distributes that array's
	 * values. "Pick your poison, then commit" rather than a hidden
	 * auto-roll on every menu interaction.
	 *
	 * Stays fully hand-editable: after a Roll, the user can still change
	 * any of the five StatControls, and the parent's `stats` proxy takes
	 * the edit through the same `bind:value` path.
	 */
	import StatControl from './StatControl.svelte';
	import Checkbox from './Checkbox.svelte';
	import { DropdownMenu } from 'bits-ui';
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

	// The currently-armed array. Kept in local state so switching arrays
	// doesn't roll — it just arms the next Roll click. The effect fills in
	// the initial pick AND reconciles a stale selection if `arrays` swaps
	// (e.g. Lodestar gets toggled off mid-dialog). Prefers the array whose
	// `default: true` is set (Perilous under Lodestar, the standard array
	// under base) so the dropdown opens on the RAW default rather than
	// whichever entry happens to lead the list.
	let selectedId = $state<string>('');
	$effect(() => {
		if (!arrays.find((a) => a.id === selectedId)) {
			selectedId = (arrays.find((a) => a.default) ?? arrays[0])?.id ?? '';
		}
	});

	const selected = $derived(arrays.find((a) => a.id === selectedId) ?? arrays[0]);

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
		<!-- Multi-array picker: a bits-ui DropdownMenu whose items show a
		     leading ✓ for the currently-armed array (parallels HamburgerMenu's
		     View submenu). Selecting an item arms the next Roll — it does
		     NOT roll immediately. -->
		<div class="sa-picker-row">
			<DropdownMenu.Root>
				<DropdownMenu.Trigger class="sa-trigger" aria-label="Choose stat array">
					<span class="sa-trigger-label">{selected?.label ?? ''}</span>
					<span class="sa-trigger-chevron" aria-hidden="true">▾</span>
				</DropdownMenu.Trigger>
				<DropdownMenu.Portal>
					<DropdownMenu.Content class="sa-menu" sideOffset={4} align="start">
						{#each arrays as arr (arr.id)}
							<DropdownMenu.Item class="sa-menu-item" onSelect={() => (selectedId = arr.id)}>
								<span class="sa-menu-check" aria-hidden="true"
									>{selectedId === arr.id ? '✓' : ''}</span
								>
								<span class="sa-menu-label">{arr.label}</span>
							</DropdownMenu.Item>
						{/each}
					</DropdownMenu.Content>
				</DropdownMenu.Portal>
			</DropdownMenu.Root>
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
		<!-- Base-only session: no picker choice to make, just a checkbox
		     confirming the array you'll roll and the Roll button. The
		     checkbox is read-only (nothing else to switch to). -->
		<div class="sa-picker-row sa-picker-row--single">
			<Checkbox checked={true} disabled ariaLabel={selected?.label ?? 'Standard Array'}>
				<span class="sa-base-label">{selected?.label ?? 'Standard Array'}</span>
			</Checkbox>
			<button
				class="dice-btn"
				type="button"
				onclick={roll}
				use:tooltip={'Roll stats'}
				aria-label="Roll stats">{@html diceD6Svg}</button
			>
		</div>
		{#if selected}
			<span class="sa-hint">{selected.hint}</span>
		{/if}
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
	/* Base-mode label sits next to a read-only checkbox — same size + weight
	   as the dropdown trigger's current-selection label so the two modes read
	   as equivalent affordances. */
	.sa-base-label {
		font-family: var(--font-ui);
		font-size: 0.85rem;
		color: var(--text);
	}
	/* Dropdown trigger — house-style flat button that mirrors the width /
	   padding of the .sa-picker-row Select it replaces so the row layout
	   is unchanged when Lodestar toggles. */
	:global(.sa-trigger) {
		flex: 1;
		display: inline-flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		padding: 4px 8px;
		background: var(--bg-control);
		color: var(--text);
		border: 1px solid var(--border);
		border-radius: 6px;
		font-family: var(--font-ui);
		font-size: 0.85rem;
		cursor: pointer;
		min-height: 32px;
	}
	:global(.sa-trigger:hover) {
		background: var(--bg-hover);
	}
	:global(.sa-trigger:focus-visible) {
		outline: 2px solid var(--text-accent);
		outline-offset: 1px;
	}
	:global(.sa-trigger-chevron) {
		color: var(--text-dimmer);
		font-size: 0.8rem;
		line-height: 1;
	}
	/* Menu chrome — mirrors HamburgerMenu's .hm-menu so both dropdowns
	   look the same across the app. */
	:global(.sa-menu) {
		background: var(--bg-card);
		border: 1px solid var(--border);
		border-radius: 6px;
		padding: 4px;
		min-width: 180px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
		z-index: 200;
	}
	:global(.sa-menu-item) {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 8px;
		border-radius: 4px;
		font-family: var(--font-ui);
		font-size: 0.85rem;
		color: var(--text);
		cursor: pointer;
		outline: none;
	}
	:global(.sa-menu-item[data-highlighted]) {
		background: var(--bg-hover);
	}
	/* Fixed-width leading ✓ column so labels align whether or not the item
	   is the current pick. */
	:global(.sa-menu-check) {
		display: inline-block;
		width: 12px;
		color: var(--text-accent);
		text-align: center;
	}
</style>
