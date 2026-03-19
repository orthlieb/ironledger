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
	import { EXPEDITION_MARK_TICKS } from '$lib/types.js';
	import { hydrateCharacter } from '$lib/character.js';
	import { findFoe, FOE_RANKS, FOE_NATURE_COLORS, FOE_QUANTITIES } from '$lib/foeStore.svelte.js';
	import ProgressTrack from '$lib/components/ProgressTrack.svelte';

	// Resource icons
	import iconMomentum from '$icons/icon-momentum.svg?raw';
	import iconHeart    from '$icons/icon-heart.svg?raw';
	import iconSpirit   from '$icons/icon-spirit.svg?raw';
	import iconSupply   from '$icons/icon-supply.svg?raw';
	import iconMana     from '$icons/icon-mana.svg?raw';

	// Initiative icons
	import swordSvg  from '$icons/sword-solid-full.svg?raw';
	import shieldSvg from '$icons/shield-halved-solid.svg?raw';

	// Action button icons
	import iconMoves   from '$icons/person-running-solid.svg?raw';
	import iconOracles from '$icons/eye-solid.svg?raw';
	import iconDice    from '$icons/dice-d10-light.svg?raw';
	import iconNotes   from '$icons/note-sticky-solid.svg?raw';

	// Tab/placeholder icons
	import charactersSvgUrl from '$icons/Characters.svg?url';
	import foesSvgUrl       from '$icons/Foes.svg?url';
	import expedSvgUrl      from '$icons/Expeditions.svg?url';


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
		stacked     = false,
		onSelect,
		onFoeSelect,
		onExpeditionSelect,
		onFoeProgress,
		onExpeditionProgress,
		onDiceClick,
		onOraclesClick,
		onMovesClick,
		onNotesClick,
		onInitiativeChange,
	}: {
		chars:               CharacterFull[];
		activeCharId:        string;
		encounters?:         FoeEncounter[];
		activeFoeId?:        string;
		expeditions?:        Expedition[];
		activeExpeditionId?: string;
		initiative?:         number;
		stacked?:            boolean;
		onSelect:              (id: string) => void;
		onFoeSelect?:          (id: string) => void;
		onExpeditionSelect?:   (id: string) => void;
		onFoeProgress?:        (enc: FoeEncounter) => void;
		onExpeditionProgress?: (exp: Expedition)   => void;
		onDiceClick?:          () => void;
		onOraclesClick?:       () => void;
		onMovesClick?:         () => void;
		onNotesClick?:         () => void;
		onInitiativeChange?:   (value: 'character' | 'foe') => void;
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
	const expMarkTicks      = $derived(activeExpedition ? (EXPEDITION_MARK_TICKS[activeExpedition.difficulty] ?? 4) : 4);

	// ---------------------------------------------------------------------------
	// Stat / resource definitions
	// ---------------------------------------------------------------------------
	const STAT_DEFS = [
		{ key: 'edge',   label: 'Edge',   color: 'var(--color-edge)' },
		{ key: 'heart',  label: 'Heart',  color: 'var(--color-heart)' },
		{ key: 'iron',   label: 'Iron',   color: 'var(--color-iron)' },
		{ key: 'shadow', label: 'Shadow', color: 'var(--color-shadow)' },
		{ key: 'wits',   label: 'Wits',   color: 'var(--color-wits)' },
	] as const;

	const RESOURCE_DEFS = [
		{ key: 'momentum', label: 'Mom',    icon: iconMomentum, color: 'var(--color-momentum)' },
		{ key: 'health',   label: 'Health', icon: iconHeart,    color: 'var(--color-health)' },
		{ key: 'spirit',   label: 'Spirit', icon: iconSpirit,   color: 'var(--color-spirit)' },
		{ key: 'supply',   label: 'Supply', icon: iconSupply,   color: 'var(--color-supply)' },
		{ key: 'mana',     label: 'Mana',   icon: iconMana,     color: 'var(--color-mana)' },
	] as const;

	// ---------------------------------------------------------------------------
	// Popover state
	// ---------------------------------------------------------------------------
	let openSelector = $state<'character' | 'foe' | 'expedition' | null>(null);

	// ---------------------------------------------------------------------------
	// Resource change shake animation
	// ---------------------------------------------------------------------------
	let shakingKeys = $state<Set<string>>(new Set());
	let prevResValues: Record<string, number> = {};

	$effect(() => {
		if (!data) { prevResValues = {}; return; }
		for (const res of RESOURCE_DEFS) {
			const val = (data as unknown as Record<string, number>)[res.key] ?? 0;
			if (res.key in prevResValues && prevResValues[res.key] !== val) {
				const key = res.key;
				shakingKeys = new Set([...shakingKeys, key]);
				setTimeout(() => {
					shakingKeys = new Set([...shakingKeys].filter(k => k !== key));
				}, 500);
			}
			prevResValues[res.key] = val;
		}
	});

	function toggleSelector(which: 'character' | 'foe' | 'expedition') {
		openSelector = openSelector === which ? null : which;
	}
	function selectChar(id: string)        { onSelect(id); openSelector = null; }
	function selectFoe(id: string)         { onFoeSelect?.(id); openSelector = null; }
	function selectExpedition(id: string)  { onExpeditionSelect?.(id); openSelector = null; }

	// ── Foe progress ───────────────────────────────────────────────────────────
	function handleFoeTrackChange(_old: number, newTicks: number) {
		if (!activeFoe) return;
		onFoeProgress?.({ ...activeFoe, ticks: newTicks });
	}
	function foeMark(delta: number) {
		if (!activeFoe || !activeFoeRank) return;
		const newTicks = Math.min(40, Math.max(0, activeFoe.ticks + delta * activeFoeRank.progressPerHit));
		onFoeProgress?.({ ...activeFoe, ticks: newTicks });
	}

	// ── Expedition progress ────────────────────────────────────────────────────
	function handleExpTrackChange(_old: number, newTicks: number) {
		if (!activeExpedition) return;
		onExpeditionProgress?.({ ...activeExpedition, ticks: newTicks });
	}
	function expMark(delta: number) {
		if (!activeExpedition) return;
		const expMarkTicks = EXPEDITION_MARK_TICKS[activeExpedition.difficulty] ?? 4;
		const newTicks = Math.min(40, Math.max(0, activeExpedition.ticks + delta * expMarkTicks));
		onExpeditionProgress?.({ ...activeExpedition, ticks: newTicks });
	}

	function handleWindowClick(e: MouseEvent) {
		if (openSelector && !(e.target as HTMLElement)?.closest('.gc-tile')) {
			openSelector = null;
		}
	}
</script>

<svelte:window onclick={handleWindowClick} />

<div class="global-context" class:gc--stacked={stacked}>

	<div class="gc-layout">

	<!-- ===== Three tiles ===== -->
	<div class="gc-tiles">

		<!-- CHARACTER TILE -->
		<div class="gc-tile" class:gc-tile--active={!!data} class:gc-tile--empty={!data}>
			{#if data && initiative === 1}
				<button class="gc-init-badge gc-init-badge--you" onclick={() => onInitiativeChange?.('foe')} title="Click to change">{@html swordSvg}<span class="gc-init-label">Has Initiative</span></button>
			{:else if data && initiative === 2}
				<button class="gc-init-badge gc-init-badge--foe" onclick={() => onInitiativeChange?.('character')} title="Click to change">{@html shieldSvg}<span class="gc-init-label">Foe Has Initiative</span></button>
			{/if}
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
					<div class="gc-char-chips">
						<div class="gc-chip-group gc-chip-group--stats">
							{#each STAT_DEFS as stat}
								<span class="gc-chip gc-chip--stat" style="--chip-color: {stat.color}" title={stat.key}>
									<span class="gc-chip-label">{stat.label}</span>
									<span class="gc-chip-value">{(data as unknown as Record<string, number>)[stat.key] ?? 0}</span>
								</span>
							{/each}
						</div>
						<div class="gc-chip-group gc-chip-group--resources">
							{#each RESOURCE_DEFS as res}
								<span class="gc-chip gc-chip--resource" class:gc-chip--shake={shakingKeys.has(res.key)} style="--chip-color: {res.color}" title={res.key}>
									<span class="gc-chip-label"><span class="gc-chip-icon">{@html res.icon}</span>{res.label}</span>
									<span class="gc-chip-value">{(data as unknown as Record<string, number>)[res.key] ?? 0}</span>
								</span>
							{/each}
						</div>
					</div>
				{:else}
					<span class="gc-tile-placeholder"><img class="gc-placeholder-img" src={charactersSvgUrl} alt="" aria-hidden="true">Select Character</span>
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
		<div class="gc-tile" class:gc-tile--active={!!activeFoe && !!activeFoeDef} class:gc-tile--empty={!activeFoe || !activeFoeDef}
			style={activeFoe && activeFoeDef ? `border-left: 3px solid ${activeFoeNature}99` : ''}>
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
					<div class="gc-tile-foe-bottom" onclick={(e) => e.stopPropagation()}>
						<div class="gc-progress-wrap">
							<ProgressTrack label="" value={activeFoe.ticks} onchange={handleFoeTrackChange} />
							<div class="gc-progress-btns">
								<button class="gc-prog-btn" onclick={() => foeMark(1)}
									disabled={activeFoe.ticks >= 40}
									title="Mark progress (+{activeFoeRank?.progressPerHit} ticks)"
								>+{activeFoeRank?.progressPerHit}</button>
								<button class="gc-prog-btn" onclick={() => foeMark(-1)}
									disabled={activeFoe.ticks <= 0}
									title="Unmark progress"
								>−{activeFoeRank?.progressPerHit}</button>
								{#if activeFoe.quantity !== 'solo' && activeFoeQty}
									<span class="gc-tile-foe-qty">{activeFoeQty.label}</span>
								{/if}
								{#if activeFoe.vanquished}
									<span class="gc-tile-vanquished" title="Vanquished">☠</span>
								{/if}
							</div>
						</div>
					</div>
				{:else}
					<span class="gc-tile-placeholder"><img class="gc-placeholder-img" src={foesSvgUrl} alt="" aria-hidden="true">Select Foe</span>
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
						<span class="gc-popover-empty">No foes</span>
					{/if}
				</div>
			{/if}
		</div>

		<!-- EXPEDITION TILE -->
		<div class="gc-tile" class:gc-tile--active={!!activeExpedition} class:gc-tile--empty={!activeExpedition}
			style={activeExpedition ? `border-left: 3px solid ${activeExpedition.type === 'journey' ? '#34d399' : '#60a5fa'}99` : ''}>
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
					<div class="gc-tile-exp-bottom" onclick={(e) => e.stopPropagation()}>
						<div class="gc-progress-wrap">
							<ProgressTrack label="" value={activeExpedition.ticks} onchange={handleExpTrackChange} />
							<div class="gc-progress-btns">
								<button class="gc-prog-btn" onclick={() => expMark(1)}
									disabled={activeExpedition.ticks >= 40}
									title="Mark progress (+{expMarkTicks} ticks)"
								>+{expMarkTicks}</button>
								<button class="gc-prog-btn" onclick={() => expMark(-1)}
									disabled={activeExpedition.ticks <= 0}
									title="Unmark progress"
								>−{expMarkTicks}</button>
								{#if activeExpedition.complete}
									<span class="gc-tile-exp-complete" title="Complete">✓ Complete</span>
								{/if}
							</div>
						</div>
					</div>
				{:else}
					<span class="gc-tile-placeholder"><img class="gc-placeholder-img" src={expedSvgUrl} alt="" aria-hidden="true">Select Expedition</span>
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
		<button class="btn btn-primary gc-action-btn" onclick={() => onMovesClick?.()} title="Browse and roll moves"><span class="gc-action-icon">{@html iconMoves}</span>Moves</button>
		<button class="btn btn-primary gc-action-btn" onclick={() => onOraclesClick?.()} title="Browse and roll oracles"><span class="gc-action-icon">{@html iconOracles}</span>Oracles</button>
		<button class="btn btn-primary gc-action-btn" onclick={onDiceClick} disabled={!onDiceClick} title="Roll dice"><span class="gc-action-icon">{@html iconDice}</span>Dice</button>
		<button class="btn btn-primary gc-action-btn" onclick={() => onNotesClick?.()} title="Add a session note"><span class="gc-action-icon">{@html iconNotes}</span>Notes</button>
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

	/* ===== Action buttons — default: 2×2 grid (large screens) ===== */
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
		container-name: gc;
		container-type: inline-size;
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
		justify-content: flex-start;
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
	.gc-tile--empty .gc-tile-btn {
		justify-content: center;
		align-items: center;
	}

	/* Placeholder text for empty tiles */
	.gc-tile-placeholder {
		font-family: var(--font-ui);
		font-size: 0.82rem;
		color: var(--text-dimmer);
		opacity: 0.6;
		text-align: center;
		width: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.3rem;
		height: 100%;
	}
	.gc-placeholder-img {
		width: 36px;
		height: 36px;
		object-fit: contain;
		/* Dim + desaturate to signal "nothing selected yet" */
		opacity: 0.35;
		filter: grayscale(0.5);
		transition: opacity 0.12s, filter 0.12s;
	}
	.gc-tile-btn:hover .gc-placeholder-img {
		opacity: 0.6;
		filter: grayscale(0.2);
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

	/* ===== Character chips (stats + resources) ===== */
	.gc-char-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 2px;
	}
	.gc-chip-group {
		display: flex;
		flex-wrap: wrap;
		gap: 2px;
	}
	.gc-chip {
		font-family: var(--font-ui);
		font-weight: 700;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		width: 2.8rem;
		line-height: 1;
		white-space: nowrap;
		border-radius: 4px;
		padding: 2px 2px;
		gap: 1px;
	}
	.gc-chip-label {
		font-size: 0.5rem;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		font-weight: 600;
		display: flex;
		align-items: center;
		gap: 1px;
	}
	.gc-chip-value {
		font-size: 0.85rem;
		font-weight: 800;
	}
	.gc-chip-icon {
		display: inline-flex;
		width: 8px;
		height: 8px;
	}
	.gc-chip-icon :global(svg) {
		width: 100%;
		height: 100%;
		fill: currentColor;
	}
	/* Stats: muted colored text — rarely change */
	.gc-chip--stat {
		color: var(--chip-color);
		opacity: 0.7;
	}
	.gc-chip--stat .gc-chip-value {
		font-weight: 700;
	}
	/* Resources: colored background pill with icon — change frequently */
	.gc-chip--resource {
		background: color-mix(in srgb, var(--chip-color) 15%, transparent);
		color: var(--chip-color);
		border-radius: 6px;
		padding: 2px 4px;
	}
	/* Shake animation on resource value change */
	@keyframes chip-shake {
		0%, 100% { transform: translateX(0) rotate(0); }
		15% { transform: translateX(-2px) rotate(-3deg); }
		30% { transform: translateX(2px) rotate(3deg); }
		45% { transform: translateX(-1px) rotate(-1.5deg); }
		60% { transform: translateX(1px) rotate(1.5deg); }
		75% { transform: translateX(0) rotate(0); }
	}
	.gc-chip--shake {
		animation: chip-shake 0.4s ease-in-out;
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
		font-family: var(--font-ui);
		font-size: 0.72rem;
		width: 100%;
		margin-top: 0.2rem;
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

	/* Initiative icon badge (character tile, upper-right) */
	.gc-init-badge {
		position: absolute;
		top: 3px;
		right: 3px;
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 2px 6px 2px 4px;
		border-radius: 999px;
		z-index: 2;
		border: none;
		cursor: pointer;
		pointer-events: auto;
		transition: opacity 0.15s;
		white-space: nowrap;
	}
	.gc-init-badge:hover { opacity: 0.75; }
	.gc-init-badge :global(svg) { width: 10px; height: 10px; fill: currentColor; flex-shrink: 0; }
	.gc-init-label {
		font-size: 0.55rem;
		font-weight: 700;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		overflow: hidden;
		text-overflow: ellipsis;
		font-family: var(--font-ui);
	}
	.gc-init-badge--you {
		background: rgba(52, 211, 153, 0.2);
		color: #059669;
	}
	.gc-init-badge--foe {
		background: rgba(239, 68, 68, 0.2);
		color: #b91c1c;
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
		font-family: var(--font-ui);
		font-size: 0.72rem;
		width: 100%;
		margin-top: 0.2rem;
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
		background: var(--bg-card);
		border: 1px solid var(--border);
		border-radius: 6px;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
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

	/* ===== Action button icons ===== */
	.gc-action-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.3rem;
	}
	.gc-action-icon {
		display: inline-flex;
		width: 14px;
		height: 14px;
		flex-shrink: 0;
	}
	.gc-action-icon :global(svg) {
		width: 100%;
		height: 100%;
		fill: currentColor;
	}

	/* ===== Progress track within tiles ===== */
	.gc-progress-wrap {
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: 0.3rem;
		width: 100%;
	}

	.gc-progress-btns {
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: 0.3rem;
	}

	.gc-prog-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		font-family: var(--font-ui);
		font-size: 0.68rem;
		font-weight: 600;
		background: transparent;
		border: 1px solid var(--border-mid);
		border-radius: 3px;
		padding: 0 7px;
		height: 22px;
		cursor: pointer;
		color: var(--text-muted);
		letter-spacing: 0.02em;
		white-space: nowrap;
		transition: background 0.12s, color 0.12s;
	}
	.gc-prog-btn:hover:not(:disabled) {
		background: var(--bg-hover);
		color: var(--text);
	}
	.gc-prog-btn:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}

	/* ===== Stacked mode (used in Adventure tab sidebar) ===== */
	.gc--stacked .gc-layout {
		flex-direction: column;
	}
	.gc--stacked .gc-tiles {
		grid-template-columns: 1fr;
	}
	.gc--stacked .gc-actions {
		grid-template-columns: repeat(4, 1fr);
		padding-left: 0;
		border-left: none;
		padding-top: 0.4rem;
		border-top: 1px solid rgba(245, 158, 11, 0.15);
	}

	/* ===== Responsive ===== */
	/* Small: tiles stack, actions row below */
	@media (max-width: 768px) {
		.gc-layout {
			flex-direction: column;
		}
		.gc-tiles {
			grid-template-columns: 1fr;
		}
		.gc-actions {
			grid-template-columns: repeat(4, 1fr);
			padding-left: 0;
			border-left: none;
			padding-top: 0.4rem;
			border-top: 1px solid rgba(245, 158, 11, 0.15);
		}
	}
	/* Very small screens: actions collapse to 2×2 grid */
	@media (max-width: 480px) {
		.gc-actions {
			grid-template-columns: 1fr 1fr;
		}
		.gc--stacked .gc-actions {
			grid-template-columns: 1fr 1fr;
		}
	}
	/* Medium: actions as 1×4 column */
	@media (min-width: 769px) and (max-width: 1099px) {
		.gc-actions {
			grid-template-columns: 1fr;
			gap: 0.25rem;
		}
	}

	/* ===== Theme-aware tinting for placeholder images ===== */
	/* In dark mode (default): images are dim against a dark background */
	/* In light mode: keep same perceived dimness — tweak brightness + opacity */
	@media (prefers-color-scheme: light) {
		:global(:root:not([data-theme='dark'])) .gc-placeholder-img {
			opacity: 0.45;
			filter: grayscale(0.45) brightness(0.75);
		}
	}
	:global(html[data-theme='light']) .gc-placeholder-img {
		opacity: 0.45;
		filter: grayscale(0.45) brightness(0.75);
	}
	:global(html[data-theme='light']) .gc-tile-btn:hover .gc-placeholder-img {
		opacity: 0.65;
		filter: grayscale(0.2) brightness(0.85);
	}
</style>
