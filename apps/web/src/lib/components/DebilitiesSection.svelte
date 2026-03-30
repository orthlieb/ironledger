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
	 * Toggles are styled as iOS-style slider switches (off/on).
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
							class="toggle-input"
							checked={data[d.key]}
							onchange={() => { const v = !data[d.key]; data[d.key] = v; onchange?.(d.label, v); }}
						/>
						<span class="toggle-track"><span class="toggle-knob"></span></span>
						<span class="toggle-label">{d.label}</span>
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
							class="toggle-input"
							checked={data[d.key]}
							onchange={() => { const v = !data[d.key]; data[d.key] = v; onchange?.(d.label, v); }}
						/>
						<span class="toggle-track"><span class="toggle-knob"></span></span>
						<span class="toggle-label">{d.label}</span>
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
							class="toggle-input"
							checked={data[d.key]}
							onchange={() => { const v = !data[d.key]; data[d.key] = v; onchange?.(d.label, v); }}
						/>
						<span class="toggle-track"><span class="toggle-knob"></span></span>
						<span class="toggle-label">{d.label}</span>
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
		gap: 0;
	}

	/* section-label has a global margin-bottom: 6px — not needed inside a flex gap */
	.debilities :global(.section-label) {
		margin-bottom: 0;
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
		gap: 0;
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
		gap: 2px 6px;
	}

	.conditions-grid {
		grid-template-columns: repeat(2, auto);
	}

	/* Banes / Burdens: 1 column × 2 rows */
	.single-col {
		grid-template-columns: auto;
	}

	/* Label wrapper */
	.toggle {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 0;
		margin: 0;
		cursor: pointer;
		user-select: none;
	}

	/* Hide native checkbox */
	.toggle-input {
		position: absolute;
		opacity: 0;
		width: 0;
		height: 0;
		pointer-events: none;
	}

	/* Slider track */
	.toggle-track {
		position:      relative;
		width:         28px;
		height:        15px;
		border-radius: 8px;
		background:    var(--bg-inset);
		border:        1px solid var(--border);
		flex-shrink:   0;
		transition:    background 0.2s, border-color 0.2s;
	}

	/* Sliding knob */
	.toggle-knob {
		position:      absolute;
		top:           2px;
		left:          2px;
		width:         9px;
		height:        9px;
		border-radius: 50%;
		background:    var(--text-dimmer);
		transition:    left 0.2s, background 0.2s;
	}

	/* Label text */
	.toggle-label {
		font-family: var(--font-ui);
		font-size:   0.75rem;
		color:       var(--text-muted);
		white-space: nowrap;
		transition:  color 0.15s;
	}

	/* Hover */
	.toggle:hover .toggle-track {
		border-color: var(--text-dimmer);
	}
	.toggle:hover .toggle-knob {
		background: var(--text);
	}
	.toggle:hover .toggle-label {
		color: var(--text);
	}

	/* Active (ON) state */
	.toggle.active .toggle-track {
		background:   color-mix(in srgb, var(--color-danger) 20%, transparent);
		border-color: var(--color-danger);
	}
	.toggle.active .toggle-knob {
		left:       15px;
		background: var(--color-danger);
	}
	.toggle.active .toggle-label {
		color: var(--color-danger);
	}
</style>
