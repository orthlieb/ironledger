<script lang="ts">
	import type { CharacterData } from '$lib/types.js';
	import { tooltip } from '$lib/actions/tooltip.js';

	let {
		data,
		onchange,
	}: {
		data: CharacterData;
		onchange?: (label: string, active: boolean) => void;
	} = $props();

	const CONDITIONS = [
		{ key: 'wounded',    label: 'Wounded',    tip: 'You are severely injured and need treatment to recover.' },
		{ key: 'unprepared', label: 'Unprepared', tip: 'You lack the resources and provisions necessary for your journey.' },
		{ key: 'shaken',     label: 'Shaken',     tip: 'You are despairing or distraught, and need comfort to recover.' },
		{ key: 'encumbered', label: 'Encumbered', tip: 'You are carrying excessive or cumbersome weight.' },
	] as const;

	const BANES = [
		{ key: 'maimed',    label: 'Maimed',    tip: 'You have suffered a wound which causes ongoing physical challenges, such as the loss of an eye or hand. Or, you bear horrific scars which serve as a constant reminder of your failures.' },
		{ key: 'corrupted', label: 'Corrupted', tip: 'Your experiences have left you emotionally scarred. You are at the threshold of losing yourself to darkness.' },
	] as const;

	const BURDENS = [
		{ key: 'cursed',    label: 'Cursed',    tip: 'You have faced Death and returned with a soul-bound quest.' },
		{ key: 'tormented', label: 'Tormented', tip: 'You have faced Desolation and undertake a quest to prevent a dire future.' },
	] as const;
</script>

<div class="debilities">
	<div class="section-label">Debilities</div>
	<div class="debility-groups">
		<div class="debility-group">
			<div class="group-name">Conditions</div>
			<div class="btn-grid conditions-grid">
				{#each CONDITIONS as d (d.key)}
					<button
						class="debility-btn"
						class:active={data[d.key]}
						use:tooltip={d.tip}
						onclick={() => { const v = !data[d.key]; data[d.key] = v; onchange?.(d.label, v); }}
					>{d.label}</button>
				{/each}
			</div>
		</div>
		<div class="debility-group">
			<div class="group-name">Banes</div>
			<div class="btn-grid single-col">
				{#each BANES as d (d.key)}
					<button
						class="debility-btn"
						class:active={data[d.key]}
						use:tooltip={d.tip}
						onclick={() => { const v = !data[d.key]; data[d.key] = v; onchange?.(d.label, v); }}
					>{d.label}</button>
				{/each}
			</div>
		</div>
		<div class="debility-group">
			<div class="group-name">Burdens</div>
			<div class="btn-grid single-col">
				{#each BURDENS as d (d.key)}
					<button
						class="debility-btn"
						class:active={data[d.key]}
						use:tooltip={d.tip}
						onclick={() => { const v = !data[d.key]; data[d.key] = v; onchange?.(d.label, v); }}
					>{d.label}</button>
				{/each}
			</div>
		</div>
	</div>
</div>

<style>
	.debilities {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
	}

	.debilities :global(.section-label) {
		margin-bottom: 0;
	}

	.debility-groups {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		justify-content: center;
		align-items: flex-start;
	}

	.debility-group {
		display: flex;
		flex-direction: column;
		gap: 3px;
	}

	.group-name {
		font-family: var(--font-ui);
		font-size:   0.65rem;
		color:       var(--text-dimmer);
		font-style:  italic;
		text-align:  center;
	}

	.btn-grid {
		display: grid;
		gap: 4px;
	}

	.conditions-grid {
		grid-template-columns: repeat(2, auto);
	}

	.single-col {
		grid-template-columns: auto;
	}

	.debility-btn {
		font-family:    var(--font-ui);
		font-size:      0.6rem;
		font-weight:    600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color:          var(--text-dimmer);
		background:     transparent;
		border:         1px solid var(--border);
		border-radius:  4px;
		padding:        2px 6px;
		cursor:         pointer;
		white-space:    nowrap;
		transition:     background 0.12s, color 0.12s, border-color 0.12s;
	}

	.debility-btn:hover {
		color:        var(--text);
		border-color: var(--border-mid);
	}

	.debility-btn.active {
		color:        var(--color-danger);
		border-color: var(--color-danger);
		background:   color-mix(in srgb, var(--color-danger) 12%, transparent);
	}
</style>
