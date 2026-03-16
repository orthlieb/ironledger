<script lang="ts">
	/**
	 * GlobalContextBar — Sticky context bar above the tab area.
	 *
	 * Shows a character selector dropdown (all owned characters), a live foe
	 * selector (all active encounters), stubbed expedition selector, action
	 * buttons (Moves / Oracles / Dice / Notes), and a live stats/resources
	 * summary for the active character.
	 */

	import type { CharacterFull } from '$lib/api.js';
	import type { FoeEncounter, Expedition } from '$lib/types.js';
	import { hydrateCharacter } from '$lib/character.js';
	import { findFoe, FOE_RANKS, FOE_NATURE_COLORS, FOE_QUANTITIES } from '$lib/foeStore.svelte.js';

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
		encounters  = [],
		activeFoeId = '',
		expeditions = [],
		activeExpeditionId = '',
		initiative  = 0,
		onSelect,
		onFoeSelect,
		onExpeditionSelect,
		onDiceClick,
		onOraclesClick,
		onMovesClick,
		onNotesClick,
	}: {
		chars:               CharacterFull[];
		activeCharId:        string;
		encounters?:         FoeEncounter[];
		activeFoeId?:        string;
		expeditions?:        Expedition[];
		activeExpeditionId?: string;
		initiative?:         number;
		onSelect:            (id: string) => void;
		onFoeSelect?:        (id: string) => void;
		onExpeditionSelect?: (id: string) => void;
		onDiceClick?:        () => void;
		onOraclesClick?:     () => void;
		onMovesClick?:       () => void;
		onNotesClick?:       () => void;
	} = $props();

	// Derive the active character and its typed data
	const character = $derived(chars.find((c) => c.id === activeCharId));
	const data      = $derived(character ? hydrateCharacter(character.data) : null);

	// Derive active foe stats
	const activeFoe         = $derived(encounters.find((e) => e.id === activeFoeId));
	const activeFoeDef      = $derived(activeFoe ? findFoe(activeFoe.foeId) : null);
	const activeFoeRank     = $derived(activeFoe ? FOE_RANKS[activeFoe.effectiveRank] : null);
	const activeFoeNature   = $derived(activeFoeDef ? (FOE_NATURE_COLORS[activeFoeDef.nature] ?? '#9ca3af') : '#9ca3af');
	const activeFoeProgress = $derived(activeFoe ? Math.floor(activeFoe.ticks / 4) : 0);
	const activeFoeQty      = $derived(activeFoe ? FOE_QUANTITIES.find((q) => q.value === activeFoe.quantity) : null);

	// Derive active expedition
	const activeExpedition  = $derived(expeditions.find((e) => e.id === activeExpeditionId));
	const expProgress       = $derived(activeExpedition ? Math.floor(activeExpedition.ticks / 4) : 0);

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

		<!-- Expedition selector -->
		<div class="gc-group">
			<label class="gc-label" for="gcExpedition">Expedition</label>
			{#if expeditions.length === 0}
				<span class="gc-name gc-name--empty">(none)</span>
			{:else}
				<select
					id="gcExpedition"
					class="gc-select"
					class:gc-select--active={activeExpeditionId !== ''}
					value={activeExpeditionId}
					onchange={(e) => onExpeditionSelect?.((e.target as HTMLSelectElement).value)}
				>
					<option value="">(none)</option>
					{#each expeditions as exp (exp.id)}
						<option value={exp.id}>
							{exp.name || (exp.type === 'journey' ? 'Unnamed Journey' : 'Unnamed Site')}
							{exp.complete ? ' \u2713' : ''}
						</option>
					{/each}
				</select>
			{/if}
		</div>

		<!-- Foe selector -->
		<div class="gc-group">
			<label class="gc-label" for="gcFoe">Foe</label>
			{#if encounters.length === 0}
				<span class="gc-name gc-name--empty">(none)</span>
			{:else}
				<select
					id="gcFoe"
					class="gc-select"
					class:gc-select--active={activeFoeId !== ''}
					value={activeFoeId}
					onchange={(e) => onFoeSelect?.((e.target as HTMLSelectElement).value)}
				>
					<option value="">(none)</option>
					{#each encounters as enc (enc.id)}
						{@const foeDef = findFoe(enc.foeId)}
						<option value={enc.id}>
							{enc.customName || foeDef?.name || enc.foeId}
							{enc.vanquished ? ' ☠' : ''}
						</option>
					{/each}
				</select>
			{/if}
		</div>

		<!-- Action buttons -->
		<div class="gc-actions">
			<button
				class="gc-action-btn"
				onclick={() => onMovesClick?.()}
				title="Browse and roll moves"
			>Moves</button>
			<button
				class="gc-action-btn"
				onclick={() => onOraclesClick?.()}
				title="Browse and roll oracles"
			>Oracles</button>
			<button
				class="gc-action-btn"
				onclick={onDiceClick}
				disabled={!onDiceClick}
				title="Roll dice"
			>Dice</button>
			<button
				class="gc-action-btn"
				onclick={() => onNotesClick?.()}
				title="Add a session note"
			>Notes</button>
		</div>

	</div>

	<!-- ===== Stats + resources summary row (only when a character is selected) ===== -->
	{#if data}
		<div class="gc-stats-row">

			<!-- Character portrait + name -->
			{#if data.portrait}
				<img class="gc-char-portrait" src={data.portrait} alt={character?.name ?? 'Character'} />
			{:else}
				<span class="gc-char-portrait gc-char-portrait--placeholder" aria-hidden="true">👤</span>
			{/if}
			<span class="gc-entity-name">{character?.name ?? ''}</span>

			<span class="gc-stats-sep" aria-hidden="true"></span>

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

	<!-- ===== Foe summary row (only when a foe is selected) ===== -->
	{#if activeFoe && activeFoeDef}
		<div class="gc-foe-row">

			<!-- Portrait + name -->
			<img
				class="gc-foe-portrait"
				src="/foes/{encodeURIComponent(activeFoeDef.name)}.png"
				alt={activeFoeDef.name}
				onerror={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
			/>
			<span class="gc-entity-name">{activeFoe.customName || activeFoeDef.name}</span>

			<span class="gc-stats-sep" aria-hidden="true"></span>

			<div class="gc-stats-group">
				<!-- Nature -->
				<span class="gc-stat-item" title="Nature">
					<span class="gc-stat-label" style="color: {activeFoeNature}">{activeFoeDef.nature}</span>
				</span>

				<span class="gc-stats-sep" aria-hidden="true"></span>

				<!-- Rank -->
				<span class="gc-stat-item" title="Rank">
					<span class="gc-stat-label">Rank</span>
					<span class="gc-stat-value gc-stat-value--normal">{activeFoeRank?.label ?? activeFoe.effectiveRank}</span>
				</span>

				<!-- Harm -->
				<span class="gc-stat-item" title="Harm per strike">
					<span class="gc-stat-label" style="color: #f87171">Harm</span>
					<span class="gc-stat-value">{activeFoeRank?.harm ?? '?'}</span>
				</span>

				<!-- Progress -->
				<span class="gc-stat-item" title="Progress">
					<span class="gc-stat-label">Progress</span>
					<span class="gc-stat-value">{activeFoeProgress}/10</span>
				</span>

				<!-- Quantity (if not solo) -->
				{#if activeFoe.quantity !== 'solo' && activeFoeQty}
					<span class="gc-stat-item" title="Quantity">
						<span class="gc-stat-label">Qty</span>
						<span class="gc-stat-value">{activeFoeQty.label}</span>
					</span>
				{/if}

				<!-- Initiative badge -->
				{#if initiative === 1}
					<span class="gc-initiative gc-initiative--you" title="You have initiative">You</span>
				{:else if initiative === 2}
					<span class="gc-initiative gc-initiative--foe" title="Foe has initiative">Foe</span>
				{/if}

				<!-- Vanquished marker -->
				{#if activeFoe.vanquished}
					<span class="gc-foe-vanquished" title="Vanquished">☠ Vanquished</span>
				{/if}
			</div>

		</div>
	{/if}

	<!-- ===== Expedition summary row (only when an expedition is selected) ===== -->
	{#if activeExpedition}
		<div class="gc-expedition-row">
			<span class="gc-expedition-type-badge"
				style="background: {activeExpedition.type === 'journey' ? 'rgba(52,211,153,0.15)' : 'rgba(96,165,250,0.15)'}; color: {activeExpedition.type === 'journey' ? '#34d399' : '#60a5fa'}"
			>{activeExpedition.type === 'journey' ? 'Journey' : 'Site'}</span>
			<span class="gc-entity-name">{activeExpedition.name || 'Unnamed'}</span>

			<span class="gc-stats-sep" aria-hidden="true"></span>

			<div class="gc-stats-group">
				<!-- Difficulty -->
				<span class="gc-stat-item" title="Difficulty">
					<span class="gc-stat-label">Rank</span>
					<span class="gc-stat-value gc-stat-value--normal">
						{activeExpedition.difficulty.charAt(0).toUpperCase() + activeExpedition.difficulty.slice(1)}
					</span>
				</span>

				<!-- Progress -->
				<span class="gc-stat-item" title="Progress">
					<span class="gc-stat-label">Progress</span>
					<span class="gc-stat-value">{expProgress}/10</span>
				</span>

				<!-- Theme (sites only) -->
				{#if activeExpedition.type === 'site' && activeExpedition.theme}
					<span class="gc-stat-item" title="Theme">
						<span class="gc-stat-label" style="color: #a855f7">Theme</span>
						<span class="gc-stat-value gc-stat-value--normal">{activeExpedition.theme}</span>
					</span>
				{/if}

				<!-- Domain (sites only) -->
				{#if activeExpedition.type === 'site' && activeExpedition.domain}
					<span class="gc-stat-item" title="Domain">
						<span class="gc-stat-label" style="color: #fb923c">Domain</span>
						<span class="gc-stat-value gc-stat-value--normal">{activeExpedition.domain}</span>
					</span>
				{/if}

				<!-- Complete marker -->
				{#if activeExpedition.complete}
					<span class="gc-expedition-complete" title="Complete">{'\u2713'} Complete</span>
				{/if}
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
		background: var(--bg-inset);
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
		background: var(--bg-inset);
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
	.gc-stat-value--normal { font-weight: 400; }

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

	/* Entity name (character or foe) beside portrait */
	.gc-entity-name {
		font-family: var(--font-display);
		font-size: 0.78rem;
		font-weight: 700;
		letter-spacing: 0.03em;
		color: var(--text);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 10rem;
	}

	/* Character portrait in stats row */
	.gc-char-portrait {
		width: 28px;
		height: 28px;
		border-radius: 50%;
		object-fit: cover;
		border: 1px solid var(--border-mid);
		flex-shrink: 0;
	}
	.gc-char-portrait--placeholder {
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--bg-inset);
		font-size: 0.85rem;
	}

	/* Foe summary row */
	.gc-foe-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-top: 0.5rem;
		padding-top: 0.4rem;
		border-top: 1px solid rgba(245, 158, 11, 0.15);
	}

	.gc-foe-portrait {
		width: 28px;
		height: 28px;
		border-radius: 50%;
		object-fit: cover;
		border: 1px solid var(--border-mid);
		flex-shrink: 0;
	}

	.gc-initiative {
		font-family: var(--font-ui);
		font-size: 0.6rem;
		font-weight: 700;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		padding: 1px 5px;
		border-radius: 3px;
		white-space: nowrap;
	}
	.gc-initiative--you {
		background: rgba(52, 211, 153, 0.15);
		color: #34d399;
	}
	.gc-initiative--foe {
		background: rgba(239, 68, 68, 0.15);
		color: #ef4444;
	}

	.gc-foe-vanquished {
		font-family: var(--font-ui);
		font-size: 0.62rem;
		font-weight: 600;
		letter-spacing: 0.04em;
		color: var(--color-danger, #ef4444);
		opacity: 0.8;
	}

	/* Expedition summary row */
	.gc-expedition-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-top: 0.5rem;
		padding-top: 0.4rem;
		border-top: 1px solid rgba(245, 158, 11, 0.15);
	}

	.gc-expedition-type-badge {
		font-family: var(--font-ui);
		font-size: 0.62rem;
		font-weight: 600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		padding: 2px 6px;
		border-radius: 3px;
		white-space: nowrap;
		flex-shrink: 0;
	}

	.gc-expedition-complete {
		font-family: var(--font-ui);
		font-size: 0.62rem;
		font-weight: 600;
		letter-spacing: 0.04em;
		color: #34d399;
		opacity: 0.8;
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
