<script lang="ts">
	/**
	 * Three groups of debility toggles: Conditions, Banes, Burdens.
	 * Receives the full character data object and mutates it directly
	 * (safe because it's a Svelte 5 deep-reactive $state in the parent).
	 *
	 * Layout:
	 *   Conditions — 2 × 2 grid
	 *   Banes      — 1 × 2 column
	 *   Burdens    — 1 × 2 column
	 *
	 * Toggles are styled as radio buttons (no border / background).
	 */
	import type { CharacterData } from '$lib/types.js';

	let {
		data,
		onchange,
	}: {
		data: CharacterData;
		onchange?: (label: string, active: boolean) => void;
	} = $props();

	const CONDITIONS = [
		{ key: 'wounded',    label: 'Wounded' },
		{ key: 'unprepared', label: 'Unprepared' },
		{ key: 'shaken',     label: 'Shaken' },
		{ key: 'encumbered', label: 'Encumbered' },
	] as const;

	const BANES = [
		{ key: 'maimed',    label: 'Maimed' },
		{ key: 'corrupted', label: 'Corrupted' },
	] as const;

	const BURDENS = [
		{ key: 'cursed',    label: 'Cursed' },
		{ key: 'tormented', label: 'Tormented' },
	] as const;
</script>

<div class="debilities">
	<div class="section-label">Debilities</div>

	<div class="debility-groups">
		<!-- Conditions — 2 × 2 -->
		<div class="debility-group">
			<div class="group-name">Conditions</div>
			<div class="toggle-grid conditions-grid">
				{#each CONDITIONS as d (d.key)}
					<label class="toggle" class:active={data[d.key]}>
						<input
							type="checkbox"
							class="toggle-radio"
							checked={data[d.key]}
							onchange={() => { const v = !data[d.key]; data[d.key] = v; onchange?.(d.label, v); }}
						/>
						{d.label}
					</label>
				{/each}
			</div>
		</div>

		<!-- Banes — 1 × 2 -->
		<div class="debility-group">
			<div class="group-name">Banes</div>
			<div class="toggle-grid single-col">
				{#each BANES as d (d.key)}
					<label class="toggle" class:active={data[d.key]}>
						<input
							type="checkbox"
							class="toggle-radio"
							checked={data[d.key]}
							onchange={() => { const v = !data[d.key]; data[d.key] = v; onchange?.(d.label, v); }}
						/>
						{d.label}
					</label>
				{/each}
			</div>
		</div>

		<!-- Burdens — 1 × 2 -->
		<div class="debility-group">
			<div class="group-name">Burdens</div>
			<div class="toggle-grid single-col">
				{#each BURDENS as d (d.key)}
					<label class="toggle" class:active={data[d.key]}>
						<input
							type="checkbox"
							class="toggle-radio"
							checked={data[d.key]}
							onchange={() => { const v = !data[d.key]; data[d.key] = v; onchange?.(d.label, v); }}
						/>
						{d.label}
					</label>
				{/each}
			</div>
		</div>
	</div>
</div>

<style>
	.debilities {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.debility-groups {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		align-items: flex-start;
	}

	.debility-group {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.group-name {
		font-family: var(--font-ui);
		font-size: 0.68rem;
		color: var(--text-dimmer);
		font-style: italic;
	}

	/* Conditions: 2 columns × 2 rows */
	.toggle-grid {
		display: grid;
		gap: 2px;
	}

	.conditions-grid {
		grid-template-columns: repeat(2, auto);
	}

	/* Banes / Burdens: 1 column × 2 rows */
	.single-col {
		grid-template-columns: auto;
	}

	/* Label wrapper — no border, no background, looks like a checkbox label */
	.toggle {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 2px 3px;
		cursor: pointer;
		font-family: var(--font-ui);
		font-size: 0.78rem;
		color: var(--text-muted);
		white-space: nowrap;
		user-select: none;
		border-radius: 3px;
		transition: color 0.12s;
	}

	.toggle:hover {
		color: var(--text);
	}

	.toggle.active {
		color: var(--color-danger);
	}

	/* Radio-style checkbox — circular, no native appearance */
	.toggle-radio {
		appearance: none;
		-webkit-appearance: none;
		width: 13px;
		height: 13px;
		border-radius: 50%;
		border: 1.5px solid var(--text-dimmer);
		background: transparent;
		cursor: pointer;
		flex-shrink: 0;
		transition: border-color 0.12s, background 0.12s;
		margin: 0;
	}

	.toggle:hover .toggle-radio {
		border-color: var(--color-danger);
	}

	.toggle.active .toggle-radio {
		border-color: var(--color-danger);
		background: var(--color-danger);
		/* Inner white dot via box-shadow */
		box-shadow: inset 0 0 0 2.5px var(--bg-card);
	}
</style>
