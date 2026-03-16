<script lang="ts">
	/**
	 * GlobalContextBar — Sticky context bar above the tab area.
	 *
	 * Three tiles (Character, Foe, Expedition) with moderate detail.
	 * Clicking a tile opens a popover to select/deselect an entity.
	 * Action buttons (Moves / Oracles / Dice / Notes) stacked on the right.
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
		{ key: 'momentum', icon: iconMomentum, color: '#60a5fa' },
		{ key: 'health',   icon: iconHeart,    color: '#f87171' },
		{ key: 'spirit',   icon: iconSpirit,   color: '#a78bfa' },
		{ key: 'supply',   icon: iconSupply,   color: '#34d399' },
		{ key: 'mana',     icon: iconMana,     color: '#f59e0b' },
	] as const;

	// ---------------------------------------------------------------------------
	// Popover state
	// ---------------------------------------------------------------------------
	let openSelector = $state<'character' | 'foe' | 'expedition' | null>(null);

	function toggleSelector(which: 'character' | 'foe' | 'expedition') {
		openSelector = openSelector === which ? null : which;
	}
	function selectChar(id: string)       { onSelect(id); openSelector = null; }
	function selectFoe(id: string)        { onFoeSelect?.(id); openSelector = null; }
	function selectExpedition(id: string)  { onExpeditionSelect?.(id); openSelector = null; }

	function handleWindowClick(e: MouseEvent) {
		if (openSelector && !(e.target as HTMLElement)?.closest('.gc-tile')) {
			openSelector = null;
		}
	}
</script>

<svelte:window onclick={handleWindowClick} />

<div class="global-context">

	<div class="gc-layout">

	<!-- ===== Three tiles ===== -->
	<div class="gc-tiles">

		<!-- CHARACTER TILE -->
		<div class="gc-tile" class:gc-tile--active={!!data} class:gc-tile--empty={!data}>
			<button class="gc-tile-btn" onclick={() => toggleSelector('character')} title="Select character">
				{#if data}
					<div class="gc-tile-row">
						{#if data.portrait}
							<img class="gc-tile-portrait" src={data.portrait} alt={character?.name ?? ''} />
						{:else}
							<span class="gc-tile-portrait gc-tile-portrait--placeholder" aria-hidden="true">👤</span>
						{/if}
						<span class="gc-tile-name">{character?.name ?? ''}</span>
					</div>
					<div class="gc-tile-stat-grid">
						{#each STAT_DEFS as stat, i}
							<div class="gc-tile-stat-col">
								<span class="gc-tile-stat" style="background: {stat.color}22; color: {stat.color}" title={stat.key}>
									<span class="gc-tile-stat-label">{stat.label}</span>
									<span class="gc-tile-stat-value">{(data as unknown as Record<string, number>)[stat.key] ?? 0}</span>
								</span>
								<span class="gc-tile-resource" style="color: {RESOURCE_DEFS[i].color}" title={RESOURCE_DEFS[i].key}>
									<span class="gc-tile-resource-icon">{@html RESOURCE_DEFS[i].icon}</span>
									{(data as unknown as Record<string, number>)[RESOURCE_DEFS[i].key] ?? 0}
								</span>
							</div>
						{/each}
					</div>
				{:else}
					<span class="gc-tile-placeholder">Select Character</span>
				{/if}
			</button>

			{#if openSelector === 'character'}
				<div class="gc-popover">
					<button class="gc-popover-item" class:gc-popover-item--active={!activeCharId} onclick={() => selectChar('')}>(None)</button>
					{#each chars as c (c.id)}
						<button class="gc-popover-item" class:gc-popover-item--active={c.id === activeCharId} onclick={() => selectChar(c.id)}>
							{c.name}
						</button>
					{/each}
					{#if chars.length === 0}
						<span class="gc-popover-empty">No characters</span>
					{/if}
				</div>
			{/if}
		</div>

		<!-- FOE TILE -->
		<div class="gc-tile" class:gc-tile--active={!!activeFoe && !!activeFoeDef} class:gc-tile--empty={!activeFoe || !activeFoeDef}>
			<button class="gc-tile-btn" onclick={() => toggleSelector('foe')} title="Select foe">
				{#if activeFoe && activeFoeDef}
					<div class="gc-tile-row">
						<img
							class="gc-tile-portrait"
							src="/foes/{encodeURIComponent(activeFoeDef.name)}.png"
							alt={activeFoeDef.name}
							onerror={(e) => ((e.target as HTMLImageElement).style.display = 'none')}
						/>
						<span class="gc-tile-name">{activeFoe.customName || activeFoeDef.name}</span>
					</div>
					<div class="gc-tile-row gc-tile-foe-details">
						<span class="gc-tile-badge" style="background: {activeFoeNature}22; color: {activeFoeNature}">{activeFoeDef.nature}</span>
						<span class="gc-tile-foe-rank">{activeFoeRank?.label ?? activeFoe.effectiveRank}</span>
						<span class="gc-tile-foe-harm" title="Harm">Harm:{activeFoeRank?.harm ?? '?'}</span>
					</div>
					<div class="gc-tile-row gc-tile-foe-bottom">
						<span class="gc-tile-foe-progress">Progress {activeFoeProgress}/10</span>
						{#if activeFoe.quantity !== 'solo' && activeFoeQty}
							<span class="gc-tile-foe-qty">{activeFoeQty.label}</span>
						{/if}
						{#if initiative === 1}
							<span class="gc-initiative gc-initiative--you" title="You have initiative">You</span>
						{:else if initiative === 2}
							<span class="gc-initiative gc-initiative--foe" title="Foe has initiative">Foe</span>
						{/if}
						{#if activeFoe.vanquished}
							<span class="gc-tile-vanquished" title="Vanquished">☠</span>
						{/if}
					</div>
				{:else}
					<span class="gc-tile-placeholder">Select Foe</span>
				{/if}
			</button>

			{#if openSelector === 'foe'}
				<div class="gc-popover">
					<button class="gc-popover-item" class:gc-popover-item--active={!activeFoeId} onclick={() => selectFoe('')}>(None)</button>
					{#each encounters as enc (enc.id)}
						{@const foeDef = findFoe(enc.foeId)}
						<button class="gc-popover-item" class:gc-popover-item--active={enc.id === activeFoeId} onclick={() => selectFoe(enc.id)}>
							{enc.customName || foeDef?.name || enc.foeId}
							{enc.vanquished ? ' ☠' : ''}
						</button>
					{/each}
					{#if encounters.length === 0}
						<span class="gc-popover-empty">No encounters</span>
					{/if}
				</div>
			{/if}
		</div>

		<!-- EXPEDITION TILE -->
		<div class="gc-tile" class:gc-tile--active={!!activeExpedition} class:gc-tile--empty={!activeExpedition}>
			<button class="gc-tile-btn" onclick={() => toggleSelector('expedition')} title="Select expedition">
				{#if activeExpedition}
					<div class="gc-tile-row">
						<span class="gc-tile-name">{activeExpedition.name || 'Unnamed'}</span>
					</div>
					<div class="gc-tile-row gc-tile-exp-details">
						<span class="gc-tile-badge"
							style="background: {activeExpedition.type === 'journey' ? 'rgba(52,211,153,0.15)' : 'rgba(96,165,250,0.15)'}; color: {activeExpedition.type === 'journey' ? '#34d399' : '#60a5fa'}"
						>{activeExpedition.type === 'journey' ? 'Journey' : 'Site'}</span>
						<span class="gc-tile-exp-difficulty">
							{activeExpedition.difficulty.charAt(0).toUpperCase() + activeExpedition.difficulty.slice(1)}
						</span>
						{#if activeExpedition.type === 'site' && activeExpedition.theme}
							<span class="gc-tile-exp-meta" style="color: #a855f7">{activeExpedition.theme}</span>
						{/if}
						{#if activeExpedition.type === 'site' && activeExpedition.domain}
							<span class="gc-tile-exp-meta" style="color: #fb923c">{activeExpedition.domain}</span>
						{/if}
					</div>
					<div class="gc-tile-row gc-tile-exp-bottom">
						<span class="gc-tile-exp-progress">Progress {expProgress}/10</span>
						{#if activeExpedition.complete}
							<span class="gc-tile-exp-complete" title="Complete">{'\u2713'} Complete</span>
						{/if}
					</div>
				{:else}
					<span class="gc-tile-placeholder">Select Expedition</span>
				{/if}
			</button>

			{#if openSelector === 'expedition'}
				<div class="gc-popover">
					<button class="gc-popover-item" class:gc-popover-item--active={!activeExpeditionId} onclick={() => selectExpedition('')}>(None)</button>
					{#each expeditions as exp (exp.id)}
						<button class="gc-popover-item" class:gc-popover-item--active={exp.id === activeExpeditionId} onclick={() => selectExpedition(exp.id)}>
							{exp.name || (exp.type === 'journey' ? 'Unnamed Journey' : 'Unnamed Site')}
							{exp.complete ? ' \u2713' : ''}
						</button>
					{/each}
					{#if expeditions.length === 0}
						<span class="gc-popover-empty">No expeditions</span>
					{/if}
				</div>
			{/if}
		</div>

	</div>

	<!-- ===== Action buttons column ===== -->
	<div class="gc-actions">
		<button class="btn btn-primary" onclick={() => onMovesClick?.()} title="Browse and roll moves">Moves</button>
		<button class="btn btn-primary" onclick={() => onOraclesClick?.()} title="Browse and roll oracles">Oracles</button>
		<button class="btn btn-primary" onclick={onDiceClick} disabled={!onDiceClick} title="Roll dice">Dice</button>
		<button class="btn btn-primary" onclick={() => onNotesClick?.()} title="Add a session note">Notes</button>
	</div>

	</div>

</div>

<style>
	/* ===== Container ===== */
	.global-context {
		background: rgba(245, 158, 11, 0.07);
		border: 1px solid rgba(245, 158, 11, 0.18);
		border-radius: 6px;
		padding: 0.5rem 0.6rem;
		flex-shrink: 0;
	}

	/* ===== Main layout: tiles + actions side-by-side ===== */
	.gc-layout {
		display: flex;
		gap: 0.5rem;
		align-items: stretch;
	}

	/* ===== Action buttons 2×2 grid ===== */
	.gc-actions {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.3rem;
		flex-shrink: 0;
		align-content: center;
		padding-left: 0.4rem;
		border-left: 1px solid rgba(245, 158, 11, 0.15);
	}

	/* ===== Tile grid ===== */
	.gc-tiles {
		flex: 1;
		min-width: 0;
		display: grid;
		grid-template-columns: 1fr 1fr 1fr;
		gap: 0.5rem;
	}

	/* ===== Individual tile ===== */
	.gc-tile {
		position: relative;
		border-radius: 6px;
		min-height: 4.5rem;
	}

	.gc-tile--empty {
		border: 1.5px dashed var(--border);
		background: rgba(0, 0, 0, 0.06);
	}
	.gc-tile--active {
		border: 1.5px solid rgba(245, 158, 11, 0.3);
		background: var(--bg-card, rgba(0, 0, 0, 0.12));
		border-left: 3px solid rgba(245, 158, 11, 0.6);
	}

	/* Full-area clickable button */
	.gc-tile-btn {
		display: flex;
		flex-direction: column;
		justify-content: center;
		width: 100%;
		height: 100%;
		min-height: 4.5rem;
		padding: 0.4rem 0.5rem;
		background: none;
		border: none;
		color: inherit;
		cursor: pointer;
		text-align: left;
		gap: 0.2rem;
		transition: background 0.12s;
		border-radius: 6px;
	}
	.gc-tile-btn:hover {
		background: rgba(245, 158, 11, 0.06);
	}

	/* Placeholder text for empty tiles */
	.gc-tile-placeholder {
		font-family: var(--font-ui);
		font-size: 0.82rem;
		color: var(--text-dimmer);
		opacity: 0.6;
		text-align: center;
		width: 100%;
	}

	/* Tile rows */
	.gc-tile-row {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		min-height: 0;
	}

	/* Portrait */
	.gc-tile-portrait {
		width: 28px;
		height: 28px;
		border-radius: 50%;
		object-fit: cover;
		border: 1px solid var(--border-mid);
		flex-shrink: 0;
	}
	.gc-tile-portrait--placeholder {
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--bg-inset);
		font-size: 0.85rem;
	}

	/* Entity name */
	.gc-tile-name {
		font-family: var(--font-display);
		font-size: 0.85rem;
		font-weight: 700;
		letter-spacing: 0.02em;
		color: var(--text);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* ===== Character tile stat+resource grid ===== */
	.gc-tile-stat-grid {
		display: flex;
		gap: 0.3rem;
		justify-content: center;
	}
	.gc-tile-stat-col {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
	}
	.gc-tile-stat {
		font-family: var(--font-ui);
		font-weight: 700;
		letter-spacing: 0.02em;
		padding: 2px 6px;
		border-radius: 3px;
		display: inline-flex;
		flex-direction: column;
		align-items: center;
		line-height: 1;
		gap: 1px;
	}
	.gc-tile-stat-label {
		font-size: 0.62rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.gc-tile-stat-value {
		font-size: 0.82rem;
	}

	.gc-tile-resource {
		display: flex;
		align-items: center;
		gap: 2px;
		font-family: var(--font-ui);
		font-size: 0.78rem;
		font-weight: 700;
	}
	.gc-tile-resource-icon {
		display: flex;
		align-items: center;
		line-height: 0;
	}
	.gc-tile-resource-icon :global(svg) {
		width: 12px;
		height: 12px;
		fill: currentColor;
	}

	/* ===== Shared badge/tag (foe nature, expedition type) ===== */
	.gc-tile-badge {
		font-family: var(--font-ui);
		font-size: 0.68rem;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: capitalize;
		padding: 2px 6px;
		border-radius: 3px;
		white-space: nowrap;
		flex-shrink: 0;
	}

	/* ===== Foe tile details ===== */
	.gc-tile-foe-details {
		gap: 0.4rem;
		font-family: var(--font-ui);
		font-size: 0.75rem;
		font-weight: 600;
	}
	.gc-tile-foe-rank {
		color: var(--text-dimmer);
	}
	.gc-tile-foe-harm {
		color: #f87171;
	}
	.gc-tile-foe-bottom {
		gap: 0.35rem;
		font-family: var(--font-ui);
		font-size: 0.72rem;
	}
	.gc-tile-foe-progress {
		color: var(--text-dimmer);
		font-weight: 600;
	}
	.gc-tile-foe-qty {
		color: var(--text-dimmer);
		font-weight: 500;
	}
	.gc-tile-vanquished {
		color: var(--color-danger, #ef4444);
		font-size: 0.8rem;
	}

	/* Initiative badges */
	.gc-initiative {
		font-family: var(--font-ui);
		font-size: 0.65rem;
		font-weight: 700;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		padding: 2px 5px;
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

	/* ===== Expedition tile details ===== */
	.gc-tile-exp-details {
		gap: 0.45rem;
		font-family: var(--font-ui);
		font-size: 0.75rem;
		font-weight: 600;
	}
	.gc-tile-exp-difficulty {
		color: var(--text-dimmer);
	}
	.gc-tile-exp-progress {
		color: var(--text-dimmer);
	}
	.gc-tile-exp-bottom {
		gap: 0.35rem;
		font-family: var(--font-ui);
		font-size: 0.72rem;
	}
	.gc-tile-exp-meta {
		font-weight: 600;
		font-size: 0.7rem;
	}
	.gc-tile-exp-complete {
		color: #34d399;
		font-weight: 600;
		font-size: 0.72rem;
	}

	/* ===== Popover dropdown ===== */
	.gc-popover {
		position: absolute;
		top: 100%;
		left: 0;
		right: 0;
		z-index: 50;
		background: var(--bg-surface, #1e1e2e);
		border: 1px solid var(--border);
		border-radius: 6px;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
		max-height: 12rem;
		overflow-y: auto;
		margin-top: 2px;
		display: flex;
		flex-direction: column;
	}

	.gc-popover-item {
		font-family: var(--font-ui);
		font-size: 0.82rem;
		color: var(--text);
		background: none;
		border: none;
		padding: 0.45rem 0.6rem;
		cursor: pointer;
		text-align: left;
		transition: background 0.1s;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.gc-popover-item:hover {
		background: rgba(245, 158, 11, 0.12);
	}
	.gc-popover-item--active {
		color: var(--text-accent, #f59e0b);
		font-weight: 600;
	}

	.gc-popover-empty {
		font-family: var(--font-ui);
		font-size: 0.78rem;
		color: var(--text-dimmer);
		padding: 0.45rem 0.6rem;
		opacity: 0.6;
	}

	/* ===== Responsive: stack on mobile ===== */
	@media (max-width: 768px) {
		.gc-layout {
			flex-direction: column;
		}
		.gc-tiles {
			grid-template-columns: 1fr;
		}
		.gc-actions {
			flex-direction: row;
			justify-content: flex-end;
			padding-left: 0;
			border-left: none;
			padding-top: 0.4rem;
			border-top: 1px solid rgba(245, 158, 11, 0.15);
		}
	}
</style>
