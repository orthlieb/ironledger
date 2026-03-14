<script lang="ts">
	/**
	 * GlobalContextBar — Sticky context bar above the tab area.
	 *
	 * Shows a character selector dropdown (all owned characters), stubbed
	 * expedition/foe selectors, action buttons (Moves / Oracles / Dice / Notes),
	 * and a live stats/resources summary for the active character.
	 */

	import type { CharacterFull } from '$lib/api.js';
	import { hydrateCharacter } from '$lib/character.js';

	// Resource icons
	import iconMomentum from '$lib/images/icon-momentum.svg?raw';
	import iconHeart    from '$lib/images/icon-heart.svg?raw';
	import iconSpirit   from '$lib/images/icon-spirit.svg?raw';
	import iconSupply   from '$lib/images/icon-supply.svg?raw';
	import iconMana     from '$lib/images/icon-mana.svg?raw';

	// ---------------------------------------------------------------------------
	// Props
	// ---------------------------------------------------------------------------
	let {
		chars,
		activeCharId,
		onSelect,
		onDiceClick,
	}: {
		chars:         CharacterFull[];
		activeCharId:  string;
		onSelect:      (id: string) => void;
		onDiceClick?:  () => void;
	} = $props();

	// Derive the active character and its typed data
	const character = $derived(chars.find((c) => c.id === activeCharId));
	const data      = $derived(character ? hydrateCharacter(character.data) : null);

	// ---------------------------------------------------------------------------
	// Stat / resource definitions
	// ---------------------------------------------------------------------------
	const STAT_DEFS = [
		{ key: 'edge',   label: 'Edge',   color: '#3b82f6' },
		{ key: 'heart',  label: 'Heart',  color: '#ef4444' },
		{ key: 'iron',   label: 'Iron',   color: '#9ca3af' },
		{ key: 'shadow', label: 'Shadow', color: '#a855f7' },
		{ key: 'wits',   label: 'Wits',   color: '#f59e0b' },
	] as const;

	const RESOURCE_DEFS = [
		{ key: 'momentum', label: 'Mom',    color: '#60a5fa', icon: iconMomentum },
		{ key: 'health',   label: 'Health', color: '#f87171', icon: iconHeart    },
		{ key: 'spirit',   label: 'Spirit', color: '#a78bfa', icon: iconSpirit   },
		{ key: 'supply',   label: 'Supply', color: '#34d399', icon: iconSupply   },
		{ key: 'mana',     label: 'Mana',   color: '#f59e0b', icon: iconMana     },
	] as const;
</script>

<div class="global-context">

	<!-- ===== Top row: selectors + action buttons ===== -->
	<div class="global-context-row">

		<!-- Character dropdown -->
		<div class="gc-group">
			<label class="gc-label" for="gcCharacter">Character</label>
			{#if chars.length === 0}
				<span class="gc-name gc-name--empty">(none)</span>
			{:else}
				<select
					id="gcCharacter"
					class="gc-select gc-select--active"
					value={activeCharId}
					onchange={(e) => onSelect((e.target as HTMLSelectElement).value)}
				>
					<option value="">(none)</option>
					{#each chars as c (c.id)}
						<option value={c.id}>{c.name}</option>
					{/each}
				</select>
			{/if}
		</div>

		<!-- Expedition selector (stub) -->
		<div class="gc-group">
			<label class="gc-label" for="gcExpedition">Expedition</label>
			<select id="gcExpedition" class="gc-select" disabled>
				<option value="">(none)</option>
			</select>
		</div>

		<!-- Foe selector (stub) -->
		<div class="gc-group">
			<label class="gc-label" for="gcFoe">Foe</label>
			<select id="gcFoe" class="gc-select" disabled>
				<option value="">(none)</option>
			</select>
		</div>

		<!-- Action buttons -->
		<div class="gc-actions">
			<button class="gc-action-btn" disabled title="Moves (coming soon)">Moves</button>
			<button class="gc-action-btn" disabled title="Oracles (coming soon)">Oracles</button>
			<button
				class="gc-action-btn"
				onclick={onDiceClick}
				disabled={!onDiceClick}
				title="Roll dice"
			>Dice</button>
			<button class="gc-action-btn" disabled title="Notes (coming soon)">Notes</button>
		</div>

	</div>

	<!-- ===== Stats + resources summary row (only when a character is selected) ===== -->
	{#if data}
		<div class="gc-stats-row">

			<!-- Core stats -->
			<div class="gc-stats-group">
				{#each STAT_DEFS as stat}
					<span class="gc-stat-item" title={stat.label}>
						<span class="gc-stat-label" style="color: {stat.color}">{stat.label}</span>
						<span class="gc-stat-value">{(data as unknown as Record<string, number>)[stat.key] ?? 0}</span>
					</span>
				{/each}
			</div>

			<span class="gc-stats-sep" aria-hidden="true"></span>

			<!-- Resources -->
			<div class="gc-stats-group">
				{#each RESOURCE_DEFS as res}
					<span class="gc-stat-item gc-resource-item" title={res.label}>
						<span class="gc-resource-icon" style="color: {res.color}">{@html res.icon}</span>
						<span class="gc-stat-label" style="color: {res.color}">{res.label}</span>
						<span class="gc-stat-value">{(data as unknown as Record<string, number>)[res.key] ?? 0}</span>
					</span>
				{/each}
			</div>

		</div>
	{/if}

</div>

<style>
	.global-context {
		background: rgba(245, 158, 11, 0.07);
		border: 1px solid rgba(245, 158, 11, 0.18);
		border-radius: 6px;
		padding: 0.6rem 0.75rem;
		flex-shrink: 0;
	}

	.global-context-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		align-items: flex-end;
	}

	.gc-group {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-width: 8rem;
	}

	.gc-label {
		font-family: var(--font-ui);
		font-size: 0.62rem;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-dimmer);
		margin-bottom: 3px;
	}

	/* Active character dropdown — slightly more prominent than stub selects */
	.gc-select--active {
		color: var(--text);
		opacity: 1;
		font-weight: 600;
	}

	/* Disabled/stub dropdowns */
	.gc-select {
		font-family: var(--font-ui);
		font-size: 0.8rem;
		color: var(--text-dimmer);
		background: var(--bg-input, rgba(0,0,0,0.25));
		border: 1px solid var(--border);
		border-radius: 4px;
		padding: 4px 8px;
	}
	.gc-select:disabled { opacity: 0.45; cursor: not-allowed; }

	/* Read-only name when no characters exist */
	.gc-name--empty {
		font-family: var(--font-ui);
		font-size: 0.8rem;
		color: var(--text-dimmer);
		padding: 4px 8px;
		background: var(--bg-input, rgba(0,0,0,0.25));
		border: 1px solid var(--border);
		border-radius: 4px;
		opacity: 0.45;
	}

	.gc-actions {
		display: flex;
		gap: 0.35rem;
		align-self: flex-end;
		margin-left: auto;
		padding-left: 0.75rem;
		border-left: 1px solid rgba(245, 158, 11, 0.2);
	}

	.gc-action-btn {
		font-family: var(--font-ui);
		font-size: 0.7rem;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--text-dimmer);
		background: transparent;
		border: 1px solid var(--border);
		border-radius: 4px;
		padding: 4px 10px;
		cursor: pointer;
		white-space: nowrap;
		transition: color 0.12s, border-color 0.12s, background 0.12s;
	}
	.gc-action-btn:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}
	.gc-action-btn:not(:disabled):hover {
		color: var(--text-accent);
		border-color: var(--text-accent);
		background: color-mix(in srgb, var(--text-accent) 8%, transparent);
	}

	/* Stats row */
	.gc-stats-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: center;
		margin-top: 0.5rem;
		padding-top: 0.4rem;
		border-top: 1px solid rgba(245, 158, 11, 0.15);
		font-size: 0.75rem;
	}

	.gc-stats-group {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}

	.gc-stat-item {
		display: flex;
		gap: 0.2rem;
		align-items: baseline;
	}

	.gc-resource-item { align-items: center; }

	.gc-stat-label {
		font-family: var(--font-ui);
		font-weight: 600;
		font-size: 0.62rem;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		opacity: 0.9;
	}

	.gc-stat-value {
		font-family: var(--font-ui);
		font-weight: 700;
		font-size: 0.8rem;
		color: var(--text);
	}

	.gc-resource-icon {
		display: flex;
		align-items: center;
		line-height: 0;
	}
	.gc-resource-icon :global(svg) {
		width: 11px;
		height: 11px;
		fill: currentColor;
	}

	.gc-stats-sep {
		display: inline-block;
		width: 1px;
		height: 0.9rem;
		background: var(--border);
		flex-shrink: 0;
		align-self: center;
	}

	@media (max-width: 480px) {
		.gc-actions {
			margin-left: 0;
			padding-left: 0;
			border-left: none;
			border-top: 1px solid rgba(245, 158, 11, 0.2);
			padding-top: 0.5rem;
			width: 100%;
			justify-content: flex-end;
		}
	}
</style>
