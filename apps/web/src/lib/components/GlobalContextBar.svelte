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
	import { getActiveDiceCtx } from '$lib/diceContext.svelte.js';
	import { findFoe, FOE_RANKS, FOE_NATURE_COLORS, FOE_QUANTITIES, RANK_COLORS } from '$lib/foeStore.svelte.js';
	import { getAssets, loadAssets } from '$lib/assetStore.svelte.js';
	import { tooltip } from '$lib/actions/tooltip.js';

	// Pre-load the asset catalogue so pills can be derived without visiting Characters tab.
	$effect(() => { loadAssets(); });
	import ProgressTrack from '$lib/components/ProgressTrack.svelte';

	// Resource icons
	import iconMomentum from '$icons/icon-momentum.svg?raw';
	import iconHeart    from '$icons/icon-heart.svg?raw';
	import iconHealth   from '$icons/icon-health.svg?raw';
	import iconSpirit   from '$icons/icon-spirit.svg?raw';
	import iconSupply   from '$icons/icon-supply.svg?raw';
	import iconXp       from '$icons/star-solid-full.svg?raw';
	import iconEdge     from '$icons/rabbit-running-solid-full.svg?raw';
	import iconIron     from '$icons/fist.svg?raw';
	import iconShadow   from '$icons/shadow.svg?raw';
	import iconWits     from '$icons/brain.svg?raw';

	// Initiative icons
	import swordSvg  from '$icons/sword-solid-full.svg?raw';
	import shieldSvg from '$icons/shield-halved-solid.svg?raw';

	// Action button icons
	import iconMoves   from '$icons/person-running-solid.svg?raw';
	import iconOracles from '$icons/crystal-ball.svg?raw';
	import iconDice    from '$icons/dice-d10-light.svg?raw';
	import iconNotes   from '$icons/note-sticky-solid.svg?raw';

	// Tab/placeholder icons
	import charactersSvgUrl from '$icons/Characters.svg?url';
	import foesSvgUrl           from '$icons/Foes.svg?url';
	import skullCrossbonesSvg   from '$icons/skull-crossbones-solid-full.svg?raw';
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
		onInitiativeClick,
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
		onInitiativeClick?:    (next: number) => void;
	} = $props();

	// Derive the active character and its typed data.
	// Prefer the live DiceCtx (CharacterSheet's $state reference) so all vital
	// changes are visible immediately — both from +/- buttons on the Characters
	// tab and from log resource-link clicks on the Adventure tab.
	// Falls back to chars[i].data (hydrated) when no DiceCtx is set yet.
	const character = $derived(chars.find((c) => c.id === activeCharId));
	const _liveCtx  = $derived(getActiveDiceCtx());
	const data      = $derived(
		_liveCtx?.charId === activeCharId
			? _liveCtx.data
			: character ? hydrateCharacter(character.data) : null
	);

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

	const DIFFICULTY_RANK: Record<string, number> = {
		troublesome: 1, dangerous: 2, formidable: 3, extreme: 4, epic: 5,
	};
	function rankBadgeStyle(rank: number): string {
		const rc = RANK_COLORS[rank];
		if (!rc) return '';
		return `background: ${rc.bg}22; color: ${rc.bg}`;
	}

	// ---------------------------------------------------------------------------
	// Stat / resource definitions
	// ---------------------------------------------------------------------------
	const STAT_DEFS = [
		{ key: 'edge',   label: 'Edge',   icon: iconEdge,   color: 'var(--color-edge)' },
		{ key: 'heart',  label: 'Heart',  icon: iconHeart,  color: 'var(--color-heart)' },
		{ key: 'iron',   label: 'Iron',   icon: iconIron,   color: 'var(--color-iron)' },
		{ key: 'shadow', label: 'Shadow', icon: iconShadow, color: 'var(--color-shadow)' },
		{ key: 'wits',   label: 'Wits',   icon: iconWits,   color: 'var(--color-wits)' },
	] as const;

	const RESOURCE_DEFS = [
		{ key: 'momentum', label: 'Mom',    icon: iconMomentum, color: 'var(--color-momentum)' },
		{ key: 'health',   label: 'Health', icon: iconHealth,   color: 'var(--color-health)' },
		{ key: 'spirit',   label: 'Spirit', icon: iconSpirit,   color: 'var(--color-spirit)' },
		{ key: 'supply',   label: 'Supply', icon: iconSupply,   color: 'var(--color-supply)' },
		{ key: 'xp',       label: 'XP',     icon: iconXp,       color: 'var(--color-xp)' },
	] as const;

	const ASSET_CAT_COLOR: Record<string, string> = {
		'Combat Talent': 'var(--color-iron)',
		'Path':          'var(--color-edge)',
		'Companion':     'var(--color-heart)',
		'Ritual':        'var(--color-mana)',
		'Touched':       'var(--color-touched)',
	};

	const DEBILITY_DEFS = [
		{ key: 'wounded',    label: 'Wounded',    color: 'var(--color-health)' },
		{ key: 'unprepared', label: 'Unprepared', color: 'var(--color-health)' },
		{ key: 'shaken',     label: 'Shaken',     color: 'var(--color-health)' },
		{ key: 'encumbered', label: 'Encumbered', color: 'var(--color-health)' },
		{ key: 'maimed',     label: 'Maimed',     color: 'var(--color-danger)' },
		{ key: 'corrupted',  label: 'Corrupted',  color: 'var(--color-danger)' },
		{ key: 'cursed',     label: 'Cursed',     color: 'var(--color-shadow)' },
		{ key: 'tormented',  label: 'Tormented',  color: 'var(--color-shadow)' },
	] as const;

	const activeDebilities = $derived(
		data ? DEBILITY_DEFS.filter(d => (data as unknown as Record<string, boolean>)[d.key]) : []
	);

	// Derive pills for asset custom fields that have a shortLabel.
	// Global fields (e.g. mana) are deduplicated by field id.
	const assetPills = $derived((() => {
		if (!data?.assets?.length) return [];
		const catalogue = getAssets();
		if (!catalogue.length) return [];
		const pills: Array<{ label: string; value: string; color: string; assetName: string }> = [];
		const seenFieldIds = new Set<string>();
		for (const owned of data.assets) {
			const def = catalogue.find(a => a.id === owned.assetId);
			if (!def?.customFields) continue;
			const color = ASSET_CAT_COLOR[def.category] ?? 'var(--text-muted)';
			for (const field of def.customFields) {
				if (field.type === 'string') continue;
				// Deduplicate global fields across assets
				if (field.global && seenFieldIds.has(field.id)) continue;
				if (field.global) seenFieldIds.add(field.id);
				const raw = field.global
					? (data.globalValues?.[field.id] ?? String(field.default ?? 0))
					: (owned.customValues?.[field.id] ?? String(field.default ?? 0));
				let displayVal: string;
				if (field.type === 'counter') {
					displayVal = raw;
				} else if (field.type === 'dropdown' || field.type === 'radio') {
					displayVal = field.options?.find(o => o.id === raw)?.label ?? raw;
				} else if (field.type === 'switch') {
					displayVal = raw === '1' || raw === 'true' ? 'On' : 'Off';
				} else {
					continue;
				}
				// shortLabel / tooltipLabel may be absent if stripped by AJV; fall back gracefully
				const pillLabel = field.shortLabel ?? field.label;
				const tooltipText = field.tooltipLabel ?? def.name;
				pills.push({ label: pillLabel, value: displayVal, color, assetName: tooltipText });
			}
		}
		return pills;
	})());

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

	<!-- ===== Scenario heading (card header) ===== -->
	<div class="gc-scenario-heading">Current Scenario</div>

	<div class="gc-layout">

	<!-- ===== Three tiles ===== -->
	<div class="gc-tiles">

		<!-- CHARACTER TILE -->
		<div class="gc-tile" class:gc-tile--active={!!data} class:gc-tile--empty={!data} class:gc-tile--open={openSelector === 'character'}>
			<button class="gc-tile-btn" onclick={() => toggleSelector('character')} title="Select character">
				{#if data}
					<div class="gc-tile-row gc-tile-name-row">
						{#if data.portrait}
							<img class="gc-tile-portrait" src={data.portrait} alt={character?.name ?? ''} />
						{:else}
							<span class="gc-tile-portrait gc-tile-portrait--placeholder" aria-hidden="true">👤</span>
						{/if}
						<span class="gc-tile-name">{character?.name ?? ''}</span>
						{#if initiative === 1}
							<div role="button" tabindex="0" class="gc-init-badge gc-init-badge--you" onclick={(e) => { e.stopPropagation(); onInitiativeClick?.(2); }} onkeydown={(e) => e.key === 'Enter' && onInitiativeClick?.(2)} title="You have initiative — click to give it to foe">{@html swordSvg}<span class="gc-init-label">Has Initiative</span></div>
						{:else if initiative === 2}
							<div role="button" tabindex="0" class="gc-init-badge gc-init-badge--foe" onclick={(e) => { e.stopPropagation(); onInitiativeClick?.(0); }} onkeydown={(e) => e.key === 'Enter' && onInitiativeClick?.(0)} title="Foe has initiative — click to clear">{@html shieldSvg}<span class="gc-init-label">Foe Has Initiative</span></div>
						{:else}
							<div role="button" tabindex="0" class="gc-init-badge gc-init-badge--none" onclick={(e) => { e.stopPropagation(); onInitiativeClick?.(1); }} onkeydown={(e) => e.key === 'Enter' && onInitiativeClick?.(1)} title="No initiative — click to give it to you"><span class="gc-init-label">No Initiative</span></div>
						{/if}
					</div>
					<div class="gc-char-chips">
						<div class="gc-chip-group gc-chip-group--stats">
							{#each STAT_DEFS as stat}
								<span class="gc-chip gc-chip--stat" style="--chip-color: {stat.color}" title={stat.key}>
									<span class="gc-chip-label">{stat.label}</span>
									<span class="gc-chip-value"><span class="gc-chip-icon">{@html stat.icon}</span> {(data as unknown as Record<string, number>)[stat.key] ?? 0}</span>
								</span>
							{/each}
						</div>
						<div class="gc-chip-group gc-chip-group--resources">
							{#each RESOURCE_DEFS as res}
								<span class="gc-chip gc-chip--resource" class:gc-chip--shake={shakingKeys.has(res.key)} style="--chip-color: {res.color}" title={res.key}>
									<span class="gc-chip-label">{res.label}</span>
									<span class="gc-chip-value"><span class="gc-chip-icon">{@html res.icon}</span> {(data as unknown as Record<string, number>)[res.key] ?? 0}</span>
								</span>
							{/each}
						</div>
						{#if activeDebilities.length > 0 || assetPills.length > 0}
							<hr class="gc-chip-divider" />
						{/if}
						{#if activeDebilities.length > 0}
							<div class="gc-chip-group gc-chip-group--debilities">
								<span class="gc-inline-label">Debilities</span>
								{#each activeDebilities as deb}
									<span class="gc-debility-pill" use:tooltip={deb.label} style="color: {deb.color}; background: color-mix(in srgb, {deb.color} 12%, transparent); border: 1px solid color-mix(in srgb, {deb.color} 30%, transparent);">{deb.label}</span>
								{/each}
							</div>
						{/if}
						{#if assetPills.length > 0}
							<div class="gc-chip-group gc-chip-group--assets">
								<span class="gc-inline-label">Assets</span>
								{#each assetPills as pill}
									<span class="gc-asset-pill" use:tooltip={pill.assetName} style="color: {pill.color}; background: color-mix(in srgb, {pill.color} 12%, transparent); border: 1px solid color-mix(in srgb, {pill.color} 30%, transparent);">{pill.label}: {pill.value}</span>
								{/each}
							</div>
						{/if}
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
		<div class="gc-tile" class:gc-tile--active={!!activeFoe && !!activeFoeDef} class:gc-tile--empty={!activeFoe || !activeFoeDef} class:gc-tile--open={openSelector === 'foe'}
			style={activeFoe && activeFoeDef ? `border-left: 3px solid ${activeFoeNature}` : ''}>
			<button class="gc-tile-btn" onclick={() => toggleSelector('foe')} title="Select foe">
				{#if activeFoe && activeFoeDef}
					<div class="gc-tile-row gc-tile-name-row">
						<img
							class="gc-tile-portrait"
							src="/foes/{encodeURIComponent(activeFoeDef.name)}.webp"
							alt={activeFoeDef.name}
							onerror={(e) => { (e.target as HTMLImageElement).src = '/foes/unknown-foe.webp'; }}
						/>
						<span class="gc-tile-name">{activeFoe.customName || activeFoeDef.name}</span>
					</div>
					<div class="gc-tile-row gc-tile-pills">
						<span class="gc-badge" style="background: {activeFoeNature}22; color: {activeFoeNature}">{activeFoeDef.nature}</span>
						<span class="gc-badge gc-badge--rank" style={rankBadgeStyle(activeFoe.effectiveRank)}>{activeFoeRank?.label ?? activeFoe.effectiveRank}</span>
						{#if activeFoe.quantity !== 'solo' && activeFoeQty}
							<span class="gc-badge gc-badge--qty">{activeFoeQty.label}</span>
						{/if}
						<span class="gc-badge gc-badge--harm">Harm: {activeFoeRank?.harm ?? '?'}</span>
					</div>
				{:else}
					<span class="gc-tile-placeholder"><img class="gc-placeholder-img" src={foesSvgUrl} alt="" aria-hidden="true">Select Foe</span>
				{/if}
			</button>
			{#if activeFoe && activeFoeDef}
				<div class="gc-tile-foe-bottom">
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
							{#if activeFoe.vanquished}
								<span class="gc-tile-vanquished" title="Vanquished">{@html skullCrossbonesSvg}</span>
							{/if}
						</div>
					</div>
				</div>
			{/if}

			{#if openSelector === 'foe'}
				<div class="gc-popover">
					<button class="gc-popover-item" class:gc-popover-item--active={!activeFoeId} onclick={() => selectFoe('')}>(None)</button>
					{#each encounters.filter(e => !e.vanquished) as enc (enc.id)}
						{@const foeDef = findFoe(enc.foeId)}
						<button class="gc-popover-item" class:gc-popover-item--active={enc.id === activeFoeId} onclick={() => selectFoe(enc.id)}>
							{enc.customName || foeDef?.name || enc.foeId}
						</button>
					{/each}
					{#if encounters.filter(e => !e.vanquished).length === 0}
						<span class="gc-popover-empty">No foes</span>
					{/if}
				</div>
			{/if}
		</div>

		<!-- EXPEDITION TILE -->
		<div class="gc-tile" class:gc-tile--active={!!activeExpedition} class:gc-tile--empty={!activeExpedition} class:gc-tile--open={openSelector === 'expedition'}
			style={activeExpedition ? `border-left: 3px solid ${activeExpedition.type === 'journey' ? '#34d399' : '#60a5fa'}` : ''}>
			<button class="gc-tile-btn" onclick={() => toggleSelector('expedition')} title="Select expedition">
				{#if activeExpedition}
					<div class="gc-tile-row gc-tile-name-row">
						<span class="gc-tile-name">{activeExpedition.name || 'Unnamed'}</span>
					</div>
					<div class="gc-tile-row gc-tile-pills">
						<span class="gc-badge"
							style="background: {activeExpedition.type === 'journey' ? 'rgba(52,211,153,0.15)' : 'rgba(96,165,250,0.15)'}; color: {activeExpedition.type === 'journey' ? '#34d399' : '#60a5fa'}"
						>{activeExpedition.type === 'journey' ? 'Journey' : 'Site'}</span>
						<span class="gc-badge gc-badge--diff" style={rankBadgeStyle(DIFFICULTY_RANK[activeExpedition.difficulty] ?? 2)}>
							{activeExpedition.difficulty.charAt(0).toUpperCase() + activeExpedition.difficulty.slice(1)}
						</span>
						{#if activeExpedition.type === 'site' && activeExpedition.theme}
							<span class="gc-badge gc-badge--theme">{activeExpedition.theme}</span>
						{/if}
						{#if activeExpedition.type === 'site' && activeExpedition.domain}
							<span class="gc-badge gc-badge--domain">{activeExpedition.domain}</span>
						{/if}
					</div>
				{:else}
					<span class="gc-tile-placeholder"><img class="gc-placeholder-img" src={expedSvgUrl} alt="" aria-hidden="true">Select Expedition</span>
				{/if}
			</button>
			{#if activeExpedition}
				<div class="gc-tile-exp-bottom">
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
			{/if}

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

	<!-- ===== Action buttons column (hidden in stacked/Adventure mode) ===== -->
	{#if !stacked}
	<div class="gc-actions">
		<button class="btn btn-primary gc-action-btn" onclick={() => onMovesClick?.()} title="Browse and roll moves"><span class="gc-action-icon">{@html iconMoves}</span><span class="gc-btn-label">Make a Move</span></button>
		<button class="btn btn-primary gc-action-btn" onclick={() => onOraclesClick?.()} title="Browse and roll oracles"><span class="gc-action-icon">{@html iconOracles}</span><span class="gc-btn-label">Ask an Oracle</span></button>
		<button class="btn btn-primary gc-action-btn" onclick={onDiceClick} disabled={!onDiceClick} title="Roll dice"><span class="gc-action-icon">{@html iconDice}</span><span class="gc-btn-label">Roll Dice</span></button>
		<button class="btn btn-primary gc-action-btn" onclick={() => onNotesClick?.()} title="Add a session note"><span class="gc-action-icon">{@html iconNotes}</span><span class="gc-btn-label">Add a Note</span></button>
	</div>
	{/if}

	</div>

</div>

<style>
	/* ===== Container ===== */
	.global-context {
		flex-shrink: 0;
	}

	/* ===== Main layout: tiles + actions side-by-side ===== */
	.gc-layout {
		display: flex;
		gap: 0.5rem;
		align-items: stretch;
		padding: 0.5rem 0.6rem;
	}

	/* ===== Action buttons ===== */
	/* Default (≥1100px, side column): 2×2 grid with labels */
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
		gap: 0.4rem;
	}

	/* ===== Individual tile (section within the single card) ===== */
	/* NOTE: overflow must stay visible so the popover dropdown can extend below the tile.
	   The button handles its own hover clipping via border-radius + overflow:hidden. */
	.gc-tile {
		position: relative;
		container-name: gc;
		container-type: inline-size;
		display: flex;
		flex-direction: column;
		border: 1px solid var(--border);
		border-left: 3px solid transparent;
		border-radius: 5px;
		box-shadow: none;
	}

	/* .gc-tile--empty — opacity applied to button only so popover dropdown stays fully opaque */
	.gc-tile--active {
		border-color: var(--border-mid);
	}
	.gc-tile--open {
		z-index: 35;
	}

	/* Scenario heading — acts as the card header for the whole GCB tile */
	.gc-scenario-heading {
		display: flex;
		align-items: center;
		padding: 8px 14px;
		background: var(--bg-inset);
		border-bottom: 1px solid var(--border);
		border-radius: 5px 5px 0 0;
		font-family: var(--font-display);
		font-size: 0.75rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-muted);
	}

	/* Full-area clickable button */
	.gc-tile-btn {
		display: flex;
		flex-direction: column;
		justify-content: flex-start;
		width: 100%;
		flex: 1;
		min-height: 3rem;
		padding: 0;
		background: none;
		border: none;
		color: inherit;
		cursor: pointer;
		text-align: left;
		gap: 0;
		transition: background 0.12s;
		border-radius: 4px;
		overflow: hidden;
	}
	.gc-tile-btn:hover {
		background: rgba(245, 158, 11, 0.06);
	}
	.gc-tile--empty {
		border-left-color: var(--border-mid);
	}
	.gc-tile--empty .gc-tile-btn {
		justify-content: center;
		align-items: center;
	}

	/* Placeholder text for empty tiles */
	.gc-tile-placeholder {
		font-family: var(--font-ui);
		font-size: 0.82rem;
		color: var(--text-muted);
		text-align: center;
		width: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.3rem;
		height: 100%;
		padding: 0.5rem;
	}
	.gc-placeholder-img {
		width: 36px;
		height: 36px;
		object-fit: contain;
		/* Tint to match --text-muted (#96886D): invert → darken → full sepia → trim */
		filter: invert(1) brightness(0.59) sepia(1) brightness(0.75);
		transition: opacity 0.12s, filter 0.12s;
	}
	.gc-tile-btn:hover .gc-placeholder-img {
		filter: invert(1) brightness(0.59) sepia(1) brightness(0.9);
	}

	/* Tile rows */
	.gc-tile-row {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		min-height: 0;
	}

	/* Name/header row — card header style */
	.gc-tile-name-row {
		background: var(--bg-inset);
		padding: 0.4rem 0.6rem 0;
		gap: 0.4rem;
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
		padding: 0.35rem 0.5rem 0.4rem;
		justify-content: center;
	}
	.gc-chip-group {
		display: flex;
		flex-wrap: wrap;
		gap: 2px;
		justify-content: center;
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
		display: flex;
		align-items: center;
		gap: 3px;
	}
	.gc-chip-icon {
		display: inline-flex;
		width: 10px;
		height: 10px;
		flex-shrink: 0;
	}
	.gc-chip-icon :global(svg) {
		width: 100%;
		height: 100%;
		fill: currentColor;
	}
	/* Stats: transparent bg, thick colored bottom bar.
	   Edge is pinned left, Wits right; inner stats fill the space.
	   space-between only on small screens — wider layouts look fine at natural spacing. */
	.gc-chip-group--stats {
		gap: 3px;
	}
	@media (max-width: 767px) {
		.gc-chip-group--stats { justify-content: space-between; width: 100%; }
	}
	.gc-chip--stat {
		color: var(--chip-color);
		background: transparent;
		border-radius: 3px 3px 0 0;
		padding: 3px 6px 4px;
		border-bottom: 3px solid var(--chip-color);
	}
	.gc-chip--stat .gc-chip-value {
		font-weight: 700;
	}
	.gc-chip-group--resources {
	}
	@media (max-width: 767px) {
		.gc-chip-group--resources { justify-content: space-between; width: 100%; }
	}
	/* Resources: same treatment as stats */
	.gc-chip--resource {
		color: var(--chip-color);
		background: transparent;
		border-radius: 3px 3px 0 0;
		padding: 3px 4px 4px;
		border-bottom: 3px solid var(--chip-color);
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

	/* Inline section label before pills */
	.gc-inline-label {
		font-family:    var(--font-ui);
		font-size:      0.5rem;
		font-weight:    700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color:          var(--text-dimmer);
		flex-shrink:    0;
		align-self:     center;
		white-space:    nowrap;
	}

	/* Divider between stats/vitals chips and debility/asset pills */
	.gc-chip-divider {
		width:      100%;
		margin:     4px 0 2px;
		border:     none;
		border-top: 1px solid var(--border);
		flex-shrink: 0;
	}

	/* Debility pills row */
	.gc-chip-group--debilities {
		width:           100%;
		gap:             3px;
		justify-content: flex-start;
	}
	.gc-debility-pill {
		font-family:    var(--font-ui);
		font-size:      0.55rem;
		font-weight:    700;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		padding:        2px 6px;
		border-radius:  8px;
		white-space:    nowrap;
	}

	/* Asset pills row */
	.gc-chip-group--assets {
		width:           100%;
		margin-top:      1px;
		gap:             3px;
		justify-content: flex-start;
	}
	.gc-asset-pill {
		font-family:    var(--font-ui);
		font-size:      0.55rem;
		font-weight:    700;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		padding:        2px 6px;
		border-radius:  8px;
		white-space:    nowrap;
	}

	/* ===== Canonical pill badge ===== */
	.gc-badge {
		font-family: var(--font-ui);
		font-size: 0.6rem;
		font-weight: 600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		padding: 2px 7px;
		border-radius: 10px;
		border: 1px solid color-mix(in srgb, currentColor 35%, transparent);
		white-space: nowrap;
		flex-shrink: 0;
	}
	.gc-badge--qty    { background: rgba(255,255,255,0.08); color: var(--text-muted); }
	.gc-badge--rank   { background: rgba(255,255,255,0.08); color: var(--text-muted); }
	.gc-badge--harm   { background: rgba(239,68,68,0.10);  color: #ef4444; }
	.gc-badge--diff   { background: rgba(255,255,255,0.08); color: var(--text-muted); }
	.gc-badge--theme  { background: rgba(168,85,247,0.15);  color: #a855f7; }
	.gc-badge--domain { background: rgba(251,146,60,0.15);  color: #fb923c; }

	/* ===== Pill row within tiles ===== */
	.gc-tile-pills {
		gap: 5px;
		flex-wrap: wrap;
		padding: 0.3rem 0.6rem 0;
	}
	.gc-tile-foe-bottom {
		font-family: var(--font-ui);
		font-size: 0.72rem;
		width: 100%;
		padding: 0.35rem 0 0.5rem;
	}
	.gc-tile-vanquished {
		color: var(--color-danger, #ef4444);
		display: flex;
		align-items: center;
	}
	.gc-tile-vanquished :global(svg) {
		width: 20px;
		height: 20px;
		fill: currentColor;
	}

	/* Initiative badge — canonical pill style, floated right in name row */
	.gc-init-badge {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 2px 7px;
		border-radius: 10px;
		border: 1px solid color-mix(in srgb, currentColor 35%, transparent);
		cursor: pointer;
		pointer-events: auto;
		transition: opacity 0.15s;
		white-space: nowrap;
		flex-shrink: 0;
		margin-left: auto;
		font-family: var(--font-ui);
		font-size: 0.6rem;
		font-weight: 600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		/* reset button styles */
		appearance: none;
		background: none;
		outline: none;
	}
	.gc-init-badge:hover { opacity: 0.75; }
	.gc-init-badge :global(svg) { width: 11px; height: 11px; fill: currentColor; flex-shrink: 0; }
	.gc-init-badge--you {
		background: rgba(52, 211, 153, 0.15);
		color: #34d399;
	}
	.gc-init-badge--foe {
		background: rgba(239, 68, 68, 0.10);
		color: #ef4444;
	}
	.gc-init-badge--none {
		background: transparent;
		color: var(--text-dimmer);
		border-color: color-mix(in srgb, var(--text-dimmer) 30%, transparent);
		opacity: 0.6;
	}
	.gc-init-badge--none:hover { opacity: 1; }

	/* ===== Expedition tile details ===== */
	.gc-tile-exp-bottom {
		font-family: var(--font-ui);
		font-size: 0.72rem;
		width: 100%;
		padding: 0.35rem 0 0.5rem;
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
		white-space: nowrap;
		overflow: hidden;
	}
	.gc-btn-label {
		overflow: hidden;
		text-overflow: ellipsis;
		min-width: 0;
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
		padding-left: 0.4rem;
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

	/* ===== Stacked mode (Adventure tab) ===== */
	.gc--stacked .gc-layout { flex-direction: column; }
	.gc--stacked .gc-tiles  { grid-template-columns: 1fr; }

	/* 1×4 row when log is side-by-side (≥768px) */
	.gc--stacked .gc-actions {
		grid-template-columns: repeat(4, 1fr);
		padding-left: 0;
		border-left: none;
		padding-top: 0.4rem;
		border-top: 1px solid var(--border);
	}

	/* 2×2 grid when log stacks below (<768px) */
	@media (max-width: 767px) {
		.gc--stacked .gc-actions {
			grid-template-columns: 1fr 1fr;
		}
	}

	/* ===== Non-stacked responsive (narrow screens) ===== */
	@media (max-width: 768px) {
		.gc-layout { flex-direction: column; }
		.gc-tiles  { grid-template-columns: 1fr; }
		.gc-actions {
			grid-template-columns: 1fr 1fr;
			padding-left: 0;
			border-left: none;
			padding-top: 0.4rem;
			border-top: 1px solid rgba(245, 158, 11, 0.15);
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
		:global(:root:not([data-theme='dark'])) .gc-tile-btn:hover .gc-placeholder-img {
			opacity: 0.65;
			filter: grayscale(0.2) brightness(0.85);
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
