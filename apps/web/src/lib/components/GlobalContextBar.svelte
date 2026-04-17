<script lang="ts">
	/**
	 * GlobalContextBar — Sticky context bar above the tab area.
	 *
	 * Three tiles (Character, Foe, Expedition) with moderate detail.
	 * Clicking a tile opens a popover to select/deselect an entity.
	 * Action buttons (Moves / Oracles / Dice / Notes) stacked on the right.
	 */

	import type { CharacterFull } from '$lib/api.js';
	import type { FoeEncounter, Expedition, Site, DelveTheme, DelveDomain } from '$lib/types.js';
	import { EXPEDITION_MARK_TICKS } from '$lib/types.js';
	import { hydrateCharacter } from '$lib/character.js';
	import { getActiveDiceCtx } from '$lib/diceContext.svelte.js';
	import { findFoe, FOE_RANKS, FOE_NATURE_COLORS, FOE_QUANTITIES, RANK_COLORS } from '$lib/foeStore.svelte.js';
	import { getAssets, loadAssets } from '$lib/assetStore.svelte.js';
	import { tooltip } from '$lib/actions/tooltip.js';
	import { loadDelveData, buildCombinedTable } from '$lib/delveStore.svelte.js';
	import { rollFromRangeTable } from '$lib/oracleStore.svelte.js';
	import { appendLog, SESSION_LOG_ID } from '$lib/log.svelte.js';
	import { animateDice, DIE_BLACK, DIE_WHITE } from '$lib/dice.js';
	import { renderNote } from '$lib/markdown.js';

	// Pre-load asset catalogue and delve data.
	$effect(() => { loadAssets(); });
	$effect(() => { loadDelveData(); });
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
	import charactersSvgUrl  from '$icons/Characters.svg?url';
	import foesSvgUrl        from '$icons/Foes.svg?url';
	import skullCrossbonesSvg from '$icons/skull-crossbones-solid-full.svg?raw';
	import circleCheckSvg    from '$icons/circle-check-solid-full.svg?raw';
	import expedSvgUrl       from '$icons/Expeditions.svg?url';
	import dungeonGateSvg    from '$icons/dungeon-gate.svg?raw';
	import treasureMapSvg    from '$icons/treasure-map.svg?raw';


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
		onFoeVanquish,
		onExpeditionProgress,
		onExpeditionComplete,
		onDiceClick,
		onOraclesClick,
		onMovesClick,
		onNotesClick,
		onInitiativeClick,
		onRollDenizen,
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
		onFoeVanquish?:        (enc: FoeEncounter) => void;
		onExpeditionProgress?: (exp: Expedition)   => void;
		onExpeditionComplete?: (exp: Expedition)   => void;
		onDiceClick?:          () => void;
		onOraclesClick?:       () => void;
		onMovesClick?:         () => void;
		onNotesClick?:         () => void;
		onInitiativeClick?:    (next: number) => void;
		onRollDenizen?:        (site: Site) => void;
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
	const activeFoeQty      = $derived(activeFoe ? FOE_QUANTITIES.find((q) => q.value === activeFoe.quantity) : null);

	// Derive active expedition
	const activeExpedition      = $derived(expeditions.find((e) => e.id === activeExpeditionId));
	const expProgress           = $derived(activeExpedition ? Math.floor(activeExpedition.ticks / 4) : 0);
	const expMarkTicks          = $derived(activeExpedition ? (EXPEDITION_MARK_TICKS[activeExpedition.difficulty] ?? 4) : 4);
	const expHasThemeAndDomain  = $derived(
		activeExpedition?.type === 'site' &&
		(activeExpedition as Site).theme !== '' &&
		(activeExpedition as Site).domain !== ''
	);

	// Auto-deselect when the active foe is vanquished or the active expedition is marked complete.
	// This fires regardless of which UI triggered the state change (GCB button or Foes/Expeditions tab).
	$effect(() => {
		if (activeFoe?.vanquished) selectFoe('');
	});
	$effect(() => {
		if (activeExpedition?.complete) selectExpedition('');
	});

	// ── Site oracle rolls ──────────────────────────────────────────────────────
	let gcRolling    = $state(false);
	let expNotesOpen = $state(false);

	// Restore per-expedition notes open state (sticky)
	$effect(() => {
		expNotesOpen = typeof window !== 'undefined'
			? localStorage.getItem('il:gc:expNotes:' + activeExpeditionId) === 'true'
			: false;
	});
	$effect(() => {
		if (activeExpeditionId && typeof window !== 'undefined')
			localStorage.setItem('il:gc:expNotes:' + activeExpeditionId, String(expNotesOpen));
	});

	async function gcOpenFeatures() {
		if (!expHasThemeAndDomain || activeExpedition?.type !== 'site' || gcRolling) return;
		gcRolling = true;
		const site   = activeExpedition as Site;
		const table  = buildCombinedTable(site.theme as DelveTheme, site.domain as DelveDomain, 'features');
		const result = rollFromRangeTable(table);
		const tensV  = Math.floor(result.roll % 100 / 10) || 10;
		const onesV  = result.roll % 10 || 10;
		await animateDice([
			{ sides: 10, value: tensV, color: DIE_BLACK },
			{ sides: 10, value: onesV, color: DIE_WHITE },
		]);
		const valueStr = typeof result.value === 'string' ? result.value : String(result.value);
		const logTitle = `Features: ${site.theme} + ${site.domain}`;
		let resultHtml = `<div>Result: <strong>${valueStr}</strong>`;
		if (result.roll === 99)  resultHtml += ` <a class="change-theme-link"  data-expedition-id="${site.id}" href="#">Change Theme ↗</a>`;
		if (result.roll === 100) resultHtml += ` <a class="change-domain-link" data-expedition-id="${site.id}" href="#">Change Domain ↗</a>`;
		resultHtml += '</div>';
		appendLog(SESSION_LOG_ID, logTitle, `<div class="roll-line">Roll: d100 → ${result.roll}</div>` + resultHtml);
		onExpeditionProgress?.({ ...site, currentFeature: valueStr });
		gcRolling = false;
	}

	async function gcOpenDangers() {
		if (!expHasThemeAndDomain || activeExpedition?.type !== 'site' || gcRolling) return;
		gcRolling = true;
		const site   = activeExpedition as Site;
		const table  = buildCombinedTable(site.theme as DelveTheme, site.domain as DelveDomain, 'dangers');
		const result = rollFromRangeTable(table);
		const tensV  = Math.floor(result.roll % 100 / 10) || 10;
		const onesV  = result.roll % 10 || 10;
		await animateDice([
			{ sides: 10, value: tensV, color: DIE_BLACK },
			{ sides: 10, value: onesV, color: DIE_WHITE },
		]);
		const valueStr = typeof result.value === 'string' ? result.value : String(result.value);
		const logTitle = `Dangers: ${site.theme} + ${site.domain}`;
		let resultHtml = `<div>Result: <strong>${valueStr}</strong>`;
		if (result.roll === 99)  resultHtml += ` <a class="change-theme-link"  data-expedition-id="${site.id}" href="#">Change Theme ↗</a>`;
		if (result.roll === 100) resultHtml += ` <a class="change-domain-link" data-expedition-id="${site.id}" href="#">Change Domain ↗</a>`;
		resultHtml += '</div>';
		appendLog(SESSION_LOG_ID, logTitle, `<div class="roll-line">Roll: d100 → ${result.roll}</div>` + resultHtml);
		onExpeditionProgress?.({ ...site, currentDanger: valueStr });
		gcRolling = false;
	}

	function gcRollDenizen() {
		if (activeExpedition?.type !== 'site') return;
		onRollDenizen?.(activeExpedition as Site);
	}

	const DIFFICULTY_RANK: Record<string, number> = {
		troublesome: 1, dangerous: 2, formidable: 3, extreme: 4, epic: 5,
	};
	function progressDisplay(ticks: number): string {
		const boxes     = Math.floor(ticks / 4);
		const remainder = ticks % 4;
		if (boxes === 0 && remainder === 0) return '0 boxes';
		if (boxes === 0) return `${remainder}/4 ticks`;
		if (remainder === 0) return `${boxes}/10 boxes`;
		return `${boxes}/10 boxes, ${remainder}/4 ticks`;
	}

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

	// Thermometer fill % for resource chips (0–100, clamped to [0,100])
	function resFillPct(key: string, value: number): string {
		let pct: number;
		switch (key) {
			case 'momentum': pct = ((value + 6) / 15) * 100; break;    // –6 to +9
			case 'health':
			case 'spirit':
			case 'supply':   pct = (value / 5) * 100; break;           // 0 to 5
			case 'xp':       pct = (value / 30) * 100; break;          // 0 to 30
			default:         pct = 0;
		}
		return `${Math.min(100, Math.max(0, Math.round(pct)))}%`;
	}

	const ASSET_CAT_COLOR: Record<string, string> = {
		'Combat Talent': 'var(--color-iron)',
		'Path':          'var(--color-edge)',
		'Companion':     'var(--color-heart)',
		'Ritual':        'var(--color-mana)',
		'Touched':       'var(--color-touched)',
	};

	const DEBILITY_DEFS = [
		{ key: 'wounded',    label: 'Wounded',    color: 'var(--color-danger)', tip: 'You are severely injured and need treatment to recover.' },
		{ key: 'unprepared', label: 'Unprepared', color: 'var(--color-danger)', tip: 'You lack the resources and provisions necessary for your journey.' },
		{ key: 'shaken',     label: 'Shaken',     color: 'var(--color-danger)', tip: 'You are despairing or distraught, and need comfort to recover.' },
		{ key: 'encumbered', label: 'Encumbered', color: 'var(--color-danger)', tip: 'You are carrying excessive or cumbersome weight.' },
		{ key: 'maimed',     label: 'Maimed',     color: 'var(--color-danger)', tip: 'You have suffered a wound which causes ongoing physical challenges, such as the loss of an eye or hand. Or, you bear horrific scars which serve as a constant reminder of your failures.' },
		{ key: 'corrupted',  label: 'Corrupted',  color: 'var(--color-danger)', tip: 'Your experiences have left you emotionally scarred. You are at the threshold of losing yourself to darkness.' },
		{ key: 'cursed',     label: 'Cursed',     color: 'var(--color-danger)', tip: 'You have faced Death and returned with a soul-bound quest.' },
		{ key: 'tormented',  label: 'Tormented',  color: 'var(--color-danger)', tip: 'You have faced Desolation and undertake a quest to prevent a dire future.' },
	] as const;

	const activeDebilities = $derived(
		data ? DEBILITY_DEFS.filter(d => (data as unknown as Record<string, boolean>)[d.key]) : []
	);

	// Derive pills for every owned asset.
	// Assets with custom fields render one pill per non-string field
	// (e.g. "Mana: 3", "Touched: Prime"). Assets without custom fields
	// render a name-only pill so the full roster is visible.
	// Global fields (e.g. mana) are deduplicated by field id.
	const assetPills = $derived((() => {
		if (!data?.assets?.length) return [];
		const catalogue = getAssets();
		if (!catalogue.length) return [];
		const pills: Array<{ label: string; value: string; color: string; assetName: string }> = [];
		const seenFieldIds = new Set<string>();
		for (const owned of data.assets) {
			const def = catalogue.find(a => a.id === owned.assetId);
			if (!def) continue;
			const color = ASSET_CAT_COLOR[def.category] ?? 'var(--text-muted)';
			const tooltipText = def.summary ?? def.name;
			let emittedField = false;
			for (const field of def.customFields ?? []) {
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
				const fieldTooltip = field.tooltipLabel ?? tooltipText;
				pills.push({ label: pillLabel, value: displayVal, color, assetName: fieldTooltip });
				emittedField = true;
			}
			// Name-only pill for stateless assets (no custom fields, or only string fields)
			if (!emittedField) {
				pills.push({ label: def.name, value: '', color, assetName: tooltipText });
			}
		}
		return pills;
	})());

	// ---------------------------------------------------------------------------
	// Popover state
	// ---------------------------------------------------------------------------
	let openSelector  = $state<'character' | 'foe' | 'expedition' | null>(null);
	let foeInfoOpen   = $state(false);

	// Restore per-foe info open state (sticky)
	$effect(() => {
		foeInfoOpen = typeof window !== 'undefined'
			? localStorage.getItem('il:gc:foeInfo:' + activeFoeId) === 'true'
			: false;
	});
	$effect(() => {
		if (activeFoeId && typeof window !== 'undefined')
			localStorage.setItem('il:gc:foeInfo:' + activeFoeId, String(foeInfoOpen));
	});

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

	<!-- ===== Scenario heading (card header / rotated side label on narrow) ===== -->
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
					</div>
				{:else}
					<span class="gc-tile-placeholder"><img class="gc-placeholder-img" src={charactersSvgUrl} alt="" aria-hidden="true">Select Character</span>
				{/if}
			</button>
			{#if data}
				<div class="gc-init-row">
					<span class="gc-init-row-label">Initiative</span>
					<div class="gc-init-toggle" role="group" aria-label="Initiative">
						<button
							class="gc-init-btn"
							class:gc-init-btn--active={initiative === 0}
							onclick={() => onInitiativeClick?.(0)}
							title="No initiative">None</button>
						<button
							class="gc-init-btn gc-init-btn--foe"
							class:gc-init-btn--active={initiative === 2}
							onclick={() => onInitiativeClick?.(2)}
							title="Foe has initiative">{@html shieldSvg}Foe</button>
						<button
							class="gc-init-btn gc-init-btn--you"
							class:gc-init-btn--active={initiative === 1}
							onclick={() => onInitiativeClick?.(1)}
							title="You have initiative">{@html swordSvg}Character</button>
					</div>
				</div>
				<div class="gc-char-chips">
					<hr class="gc-chip-divider gc-chip-divider--init" />
					<div class="gc-chip-group gc-chip-group--stats">
						{#each STAT_DEFS as stat}
							<span class="gc-chip gc-chip--stat" style="--chip-color: {stat.color}" title={stat.key}>
								<span class="gc-chip-bg-icon" aria-hidden="true">{@html stat.icon}</span>
								<span class="gc-chip-label">{stat.label}</span>
								<span class="gc-chip-value">{(data as unknown as Record<string, number>)[stat.key] ?? 0}</span>
							</span>
						{/each}
					</div>
					<div class="gc-chip-group gc-chip-group--resources">
						{#each RESOURCE_DEFS as res}
							{@const resVal = (data as unknown as Record<string, number>)[res.key] ?? 0}
							{@const thermoColor = (res.key === 'momentum' && resVal <= 0) ? 'var(--color-danger)' : res.color}
							<span class="gc-chip gc-chip--resource" class:gc-chip--shake={shakingKeys.has(res.key)} style="--chip-color: {res.color}; --fill-pct: {resFillPct(res.key, resVal)}; --thermo-color: {thermoColor}" title={res.key}>
								<span class="gc-chip-label">{res.label}</span>
								<span class="gc-chip-value"><span class="gc-chip-icon">{@html res.icon}</span> {resVal}</span>
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
								<span class="gc-debility-pill" use:tooltip={deb.label} style="color: {deb.color}; background: color-mix(in srgb, {deb.color} 12%, transparent);">{deb.label}</span>
							{/each}
						</div>
					{/if}
					{#if assetPills.length > 0}
						<div class="gc-chip-group gc-chip-group--assets">
							<span class="gc-inline-label">Assets</span>
							{#each assetPills as pill}
								<span class="gc-asset-pill" use:tooltip={pill.assetName} style="color: {pill.color}; background: color-mix(in srgb, {pill.color} 12%, transparent);">{pill.label}{pill.value ? `: ${pill.value}` : ''}</span>
							{/each}
						</div>
					{/if}
				</div>
			{/if}

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
						{#if activeFoeQty}
							<span class="gc-badge gc-badge--qty">{activeFoeQty.label}</span>
						{/if}
						<span class="gc-badge gc-badge--harm">Harm: {activeFoeRank?.harm ?? '?'}</span>
					</div>
				{:else}
					<span class="gc-tile-placeholder"><img class="gc-placeholder-img" src={foesSvgUrl} alt="" aria-hidden="true">Select Foe</span>
				{/if}
			</button>
			{#if activeFoe && activeFoeDef && !activeFoe.vanquished}
				<button class="gc-tile-title-action gc-tile-title-action--vanquish"
					onclick={(e) => { e.stopPropagation(); onFoeVanquish?.({ ...activeFoe, vanquished: true }); }}
					title="Vanquish foe">{@html skullCrossbonesSvg}</button>
			{/if}
			{#if activeFoe && activeFoeDef}
				<div class="gc-tile-foe-bottom">
					<div class="gc-foe-info">
						<button class="gc-foe-toggle" onclick={() => (foeInfoOpen = !foeInfoOpen)} aria-expanded={foeInfoOpen}>
							<span class="gc-foe-toggle-arrow" class:gc-foe-toggle-arrow--open={foeInfoOpen}>▸</span>
							<span class="gc-foe-toggle-label">Description</span>
						</button>
						{#if foeInfoOpen}
							<div class="gc-foe-body">
								{#if activeFoeDef.description}
									<p class="gc-foe-desc">{activeFoeDef.description}</p>
								{/if}
								{#if activeFoeDef.features.length > 0}
									<div class="gc-foe-section">
										<span class="gc-foe-section-label">Features</span>
										<ul class="gc-foe-list">
											{#each activeFoeDef.features as feat}<li>{feat}</li>{/each}
										</ul>
									</div>
								{/if}
								{#if activeFoeDef.drives.length > 0}
									<div class="gc-foe-section">
										<span class="gc-foe-section-label">Drives</span>
										<ul class="gc-foe-list">
											{#each activeFoeDef.drives as d}<li>{d}</li>{/each}
										</ul>
									</div>
								{/if}
								{#if activeFoeDef.tactics.length > 0}
									<div class="gc-foe-section">
										<span class="gc-foe-section-label">Tactics</span>
										<ul class="gc-foe-list">
											{#each activeFoeDef.tactics as t}<li>{t}</li>{/each}
										</ul>
									</div>
								{/if}
							</div>
						{/if}
						<hr class="gc-chip-divider gc-chip-divider--foe" />
					</div>
					<div class="gc-progress-compact">
						<span class="gc-progress-label">Progress</span>
						<button class="gc-prog-btn" onclick={() => foeMark(-1)}
							disabled={activeFoe.ticks <= 0}
							title="Unmark progress">−{activeFoeRank?.progressPerHit}</button>
						<button class="gc-prog-btn" onclick={() => foeMark(1)}
							disabled={activeFoe.ticks >= 40}
							title="Mark progress (+{activeFoeRank?.progressPerHit} ticks)">+{activeFoeRank?.progressPerHit}</button>
						<span class="gc-progress-value">{progressDisplay(activeFoe.ticks)}</span>
						{#if activeFoe.vanquished}
							<span class="gc-tile-vanquished" title="Vanquished">{@html skullCrossbonesSvg}</span>
						{/if}
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
						{#if activeExpedition.imageUrl}
							<img class="gc-tile-portrait" src={activeExpedition.imageUrl} alt={activeExpedition.name} />
						{:else}
							<span class="gc-tile-portrait gc-tile-portrait--placeholder gc-tile-portrait--exped-icon" aria-hidden="true">
								{@html activeExpedition.type === 'site' ? dungeonGateSvg : treasureMapSvg}
							</span>
						{/if}
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
			{#if activeExpedition && !activeExpedition.complete}
				<button class="gc-tile-title-action gc-tile-title-action--complete"
					onclick={(e) => { e.stopPropagation(); onExpeditionComplete?.({ ...activeExpedition, complete: true }); }}
					title="Mark {activeExpedition.type === 'journey' ? 'journey' : 'site'} complete">{@html circleCheckSvg}</button>
			{/if}
			{#if activeExpedition}
				<div class="gc-tile-exp-bottom">
					{#if activeExpedition.type === 'site'}
					{@const site = activeExpedition as import('$lib/types.js').Site}
					{#if site.objective || site.notes}
						<div class="gc-exp-info">
							{#if site.objective}
								<div class="gc-tile-row gc-exp-objective">
									<span class="gc-exp-objective-label">Objective</span>
									<span class="gc-exp-objective-text">{site.objective}</span>
								</div>
							{/if}
							{#if site.notes}
								<button class="gc-foe-toggle" onclick={() => (expNotesOpen = !expNotesOpen)} aria-expanded={expNotesOpen}>
									<span class="gc-foe-toggle-arrow" class:gc-foe-toggle-arrow--open={expNotesOpen}>▸</span>
									<span class="gc-foe-toggle-label">Notes</span>
								</button>
								{#if expNotesOpen}
									<div class="gc-foe-body gc-exp-notes-body">
										{@html renderNote(site.notes)}
									</div>
								{/if}
							{/if}
							<hr class="gc-chip-divider gc-chip-divider--foe" />
						</div>
					{/if}
					<div class="gc-oracle-row">
						<button class="gc-oracle-btn"
							onclick={gcOpenFeatures}
							disabled={!expHasThemeAndDomain || gcRolling}
							title={expHasThemeAndDomain ? 'Roll features table' : 'Set theme and domain first'}
						>Roll Feature</button>
						<button class="gc-oracle-btn"
							onclick={gcOpenDangers}
							disabled={!expHasThemeAndDomain || gcRolling}
							title={expHasThemeAndDomain ? 'Roll dangers table' : 'Set theme and domain first'}
						>Roll Danger</button>
						<button class="gc-oracle-btn"
							onclick={gcRollDenizen}
							disabled={gcRolling}
							title="Roll d100 for a denizen"
						>Roll Denizen</button>
					</div>
					{#if site.currentFeature || site.currentDanger}
						<div class="gc-fd-strip">
							{#if site.currentFeature}
								<div class="gc-fd-line">
									<span class="gc-fd-label">Feature</span>
									<span class="gc-fd-text">{site.currentFeature}</span>
								</div>
							{/if}
							{#if site.currentDanger}
								<div class="gc-fd-line">
									<span class="gc-fd-label">Danger</span>
									<span class="gc-fd-text">{site.currentDanger}</span>
								</div>
							{/if}
						</div>
					{/if}
					<div class="gc-exp-divider-wrap"><hr class="gc-chip-divider" /></div>
					{/if}
					{#if activeExpedition.type === 'journey'}
					{@const journey = activeExpedition as import('$lib/types.js').Journey}
					{#if journey.notes}
						<div class="gc-exp-info">
							<button class="gc-foe-toggle" onclick={() => (expNotesOpen = !expNotesOpen)} aria-expanded={expNotesOpen}>
								<span class="gc-foe-toggle-arrow" class:gc-foe-toggle-arrow--open={expNotesOpen}>▸</span>
								<span class="gc-foe-toggle-label">Notes</span>
							</button>
							{#if expNotesOpen}
								<div class="gc-foe-body gc-exp-notes-body">
									{@html renderNote(journey.notes)}
								</div>
							{/if}
							<hr class="gc-chip-divider gc-chip-divider--foe" />
						</div>
					{/if}
					{/if}
					<div class="gc-progress-compact">
						<span class="gc-progress-label">Progress</span>
						<button class="gc-prog-btn" onclick={() => expMark(-1)}
							disabled={activeExpedition.ticks <= 0}
							title="Unmark progress">−{expMarkTicks}</button>
						<button class="gc-prog-btn" onclick={() => expMark(1)}
							disabled={activeExpedition.ticks >= 40}
							title="Mark progress (+{expMarkTicks} ticks)">+{expMarkTicks}</button>
						<span class="gc-progress-value">{progressDisplay(activeExpedition.ticks)}</span>
					</div>
				</div>
			{/if}

			{#if openSelector === 'expedition'}
				<div class="gc-popover">
					<button class="gc-popover-item" class:gc-popover-item--active={!activeExpeditionId} onclick={() => selectExpedition('')}>(None)</button>
					{#each expeditions.filter(e => !e.complete) as exp (exp.id)}
						<button class="gc-popover-item" class:gc-popover-item--active={exp.id === activeExpeditionId} onclick={() => selectExpedition(exp.id)}>
							{exp.name || (exp.type === 'journey' ? 'Unnamed Journey' : 'Unnamed Site')}
						</button>
					{/each}
					{#if expeditions.filter(e => !e.complete).length === 0}
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
		display: flex;
		align-items: stretch;
		gap: 6px;
	}

	/* ===== Main layout: tiles + actions side-by-side ===== */
	.gc-layout {
		display: flex;
		gap: 0.5rem;
		align-items: stretch;
		padding: 0.5rem 0.6rem;
		flex: 1;
		min-width: 0;
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
		background: var(--bg-card);
		border: 1px solid var(--border);
		border-left: 3px solid transparent;
		border-radius: 5px;
	}

	/* .gc-tile--empty — opacity applied to button only so popover dropdown stays fully opaque */
	.gc-tile--active {
		background: var(--bg-card);
		border-color: var(--border);
	}
	.gc-tile--open {
		z-index: 35;
	}

	/* Scenario heading — rotated side label (matches STATS / VITALS pattern) */
	.gc-scenario-heading {
		writing-mode: vertical-rl;
		transform: rotate(180deg);
		font-family: var(--font-ui);
		font-size: 0.55rem;
		font-weight: 800;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--text-dimmer);
		flex-shrink: 0;
		align-self: stretch;
		display: flex;
		align-items: center;
		justify-content: center;
		border-left: 1px solid var(--border);
		padding-left: 4px;
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
		padding: 0.4rem 0.6rem;
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
	/* Expedition placeholder — circular, inline SVG icon */
	.gc-tile-portrait--exped-icon {
		background: var(--bg-inset);
	}
	.gc-tile-portrait--exped-icon :global(svg) {
		width: 60%;
		height: 60%;
		fill: var(--text-dimmer);
		opacity: 0.7;
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
		gap: 5px;
		padding: 0.35rem 0.5rem 0.4rem;
		justify-content: center;
		container-type: inline-size;
	}
	@media (max-width: 767px) {
		.gc-char-chips {
			gap: 5px;
		}
	}
	/* When wide enough for both groups on one row (245px + 5px + 245px = 495px) */
	@container (min-width: 495px) {
		.gc-chip-group--stats,
		.gc-chip-group--resources {
			flex: 1;
			width: auto;
		}
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
	/* Stats: mini stat-tile look — colored bg tint, large faded background icon, label + value. */
	.gc-chip-group--stats {
		gap: 5px;
		flex-wrap: nowrap;
		width: 100%;
		justify-content: space-between;
		container-type: inline-size;
	}
	/* Tiles: 5 × 45px = 225px. Crossover (gap space = tile widths) at row-width = 450px → left-align. */
	@container (min-width: 450px) {
		.gc-chip-group--stats { justify-content: flex-start; }
	}
	.gc-chip--stat {
		position: relative;
		overflow: hidden;
		color: var(--chip-color);
		background: color-mix(in srgb, var(--chip-color) 10%, var(--bg-card));
		border-radius: 5px;
		padding: 3px 4px 4px;
		justify-content: space-between;
	}
	/* Large faded background icon — mirrors StatControl's .stat-icon */
	.gc-chip-bg-icon {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		opacity: 0.22;
		pointer-events: none;
	}
	:global([data-theme="dark"]) .gc-chip-bg-icon {
		opacity: 0.50;
	}
	.gc-chip-bg-icon :global(svg) {
		width: calc(100% - 4px);
		height: calc(100% - 4px);
		fill: var(--chip-color);
		color: var(--chip-color);
	}
	.gc-chip--stat .gc-chip-label,
	.gc-chip--stat .gc-chip-value {
		position: relative;
		z-index: 1;
	}
	.gc-chip--stat .gc-chip-value {
		font-size: 0.95rem;
		font-weight: 800;
	}
	.gc-chip-group--resources {
		gap: 5px;
		flex-wrap: nowrap;
		width: 100%;
		justify-content: space-between;
		container-type: inline-size;
	}
	/* Tiles: 5 × 45px = 225px. Crossover (gap space = tile widths) at row-width = 450px → left-align. */
	@container (min-width: 450px) {
		.gc-chip-group--resources { justify-content: flex-start; }
	}

	/* Narrow tile: shrink chips so 5 fit in ~185px */
	@container (max-width: 215px) {
		.gc-chip                        { width: 2.1rem; }
		.gc-chip-group--stats,
		.gc-chip-group--resources       { gap: 3px; }
		.gc-chip--stat .gc-chip-value   { font-size: 0.82rem; }
		.gc-chip-value                  { font-size: 0.78rem; }
	}
	/* Resources: thermometer on right edge — track (::before) + fill (::after) */
	.gc-chip--resource {
		position: relative;
		overflow: hidden;
		color: var(--thermo-color, var(--chip-color));
		background: transparent;
		border-radius: 4px;
		padding: 3px 7px 3px 4px;
	}
	/* Track: faint full-height bar on the right */
	.gc-chip--resource::before {
		content: '';
		position: absolute;
		right: 2px;
		top: 0;
		width: 3px;
		height: 100%;
		background: color-mix(in srgb, var(--thermo-color, var(--chip-color)) 20%, transparent);
		border-radius: 2px;
	}
	/* Fill: solid bar rising from the bottom, height = fill% */
	.gc-chip--resource::after {
		content: '';
		position: absolute;
		right: 2px;
		bottom: 0;
		width: 3px;
		height: var(--fill-pct, 0%);
		background: var(--thermo-color, var(--chip-color));
		border-radius: 2px 2px 0 0;
		transition: height 0.3s ease, background 0.3s ease;
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
	/* First divider at top of chips area (below init row) — no top margin */
	.gc-chip-divider--init {
		margin-top: 0;
	}

	/* Debility pills row */
	.gc-chip-group--debilities {
		width:           100%;
		gap:             3px;
		justify-content: flex-start;
	}
	.gc-debility-pill {
		font-family:    var(--font-ui);
		font-size:      0.6rem;
		font-weight:    600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		padding:        2px 7px;
		border-radius:  10px;
		border:         1px solid color-mix(in srgb, currentColor 35%, transparent);
		line-height:    1;
		white-space:    nowrap;
		flex-shrink:    0;
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
		font-size:      0.6rem;
		font-weight:    600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		padding:        2px 7px;
		border-radius:  10px;
		border:         1px solid color-mix(in srgb, currentColor 35%, transparent);
		line-height:    1;
		white-space:    nowrap;
		flex-shrink:    0;
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
		line-height: 1;
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
		padding: 0.35rem 0 0;
	}

	/* ===== Foe description / features / drives / tactics ===== */
	.gc-foe-info {
		padding: 0 0.5rem;
	}
	/* Partial divider in foe/expedition info sections — inset by container padding */
	.gc-chip-divider--foe {
		margin: 0.3rem 0;
	}
	.gc-foe-toggle {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		width: 100%;
		padding: 0.3rem 0.1rem;
		background: none;
		border: none;
		cursor: pointer;
		text-align: left;
		transition: background 0.12s;
	}
	.gc-foe-toggle:hover {
		background: rgba(245, 158, 11, 0.06);
	}
	.gc-foe-toggle-label {
		font-family:    var(--font-ui);
		font-size:      0.6rem;
		font-weight:    700;
		letter-spacing: 0.07em;
		text-transform: uppercase;
		color:          var(--text-dimmer);
	}
	.gc-foe-toggle-arrow {
		font-size:  0.6rem;
		color:      var(--text-dimmer);
		transition: transform 0.15s;
		line-height: 1;
	}
	.gc-foe-toggle-arrow--open {
		transform: rotate(90deg);
	}
	.gc-foe-body {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0 0.1rem 0.6rem;
		max-height: 14rem;
		overflow-y: auto;
	}
	.gc-foe-desc {
		font-family: var(--font-ui);
		font-size: 0.72rem;
		line-height: 1.5;
		color: var(--text-muted);
		font-style: italic;
		margin: 0;
	}
	.gc-foe-section {
		display: flex;
		flex-direction: column;
		gap: 3px;
	}
	.gc-foe-section-label {
		font-family:    var(--font-ui);
		font-size:      0.55rem;
		font-weight:    700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color:          var(--text-dimmer);
	}
	.gc-foe-list {
		margin: 0;
		padding-left: 1.1em;
		list-style: disc;
	}
	.gc-foe-list li {
		font-family: var(--font-ui);
		font-size:   0.7rem;
		line-height: 1.45;
		color:       var(--text-muted);
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

	/* Initiative row — sits between name bar and chips */
	.gc-init-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.25rem 0.6rem;
	}
	.gc-init-row-label {
		font-family:    var(--font-ui);
		font-size:      0.55rem;
		font-weight:    700;
		letter-spacing: 0.07em;
		text-transform: uppercase;
		color:          var(--text-dimmer);
		white-space:    nowrap;
		flex-shrink:    0;
	}

	/* Initiative toggle — segmented button group */
	.gc-init-toggle {
		display: flex;
		border: 1px solid var(--border-mid);
		border-radius: 4px;
		overflow: hidden;
	}
	.gc-init-btn {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		padding: 2px 7px;
		font-family:    var(--font-ui);
		font-size:      0.58rem;
		font-weight:    600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		background:     transparent;
		border:         none;
		border-right:   1px solid var(--border-mid);
		color:          var(--text-dimmer);
		cursor:         pointer;
		white-space:    nowrap;
		transition:     background 0.12s, color 0.12s;
		line-height:    1.6;
	}
	.gc-init-btn:last-child { border-right: none; }
	.gc-init-btn:hover:not(.gc-init-btn--active) {
		background: rgba(255,255,255,0.05);
		color: var(--text-muted);
	}
	.gc-init-btn :global(svg) {
		width: 9px; height: 9px; fill: currentColor; flex-shrink: 0;
	}
	/* Active states */
	.gc-init-btn--active {
		background: var(--text-accent);
		color: var(--bg-card);
	}
	.gc-init-btn--you.gc-init-btn--active {
		background: rgba(52, 211, 153, 0.18);
		color: #34d399;
	}
	.gc-init-btn--foe.gc-init-btn--active {
		background: rgba(239, 68, 68, 0.14);
		color: #ef4444;
	}

	/* ===== Site oracle roll buttons ===== */
	.gc-oracle-row {
		display: flex;
		gap: 5px;
		flex-wrap: wrap;
		padding-left: 0.4rem;
		padding-top: 5px;
		padding-bottom: 5px;
	}
	.gc-oracle-btn {
		font-family: var(--font-ui);
		font-size: 0.62rem;
		font-weight: 600;
		letter-spacing: 0.04em;
		padding: 2px 8px;
		background: transparent;
		border: 1px solid var(--border-mid);
		border-radius: 3px;
		color: var(--text-muted);
		cursor: pointer;
		transition: background 0.12s, color 0.12s;
	}
	.gc-oracle-btn:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.06);
		color: var(--text);
	}
	.gc-oracle-btn:disabled { opacity: 0.35; cursor: not-allowed; }

	/* Inset divider wrapper for expedition tile */
	.gc-exp-divider-wrap {
		padding: 0 0.5rem;
	}

	/* Site objective + notes section — same inset padding as gc-foe-info */
	.gc-exp-info {
		padding: 0 0.5rem;
	}
	.gc-exp-objective {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 2px;
		padding: 0.25rem 0.1rem 0.1rem;
	}
	.gc-exp-objective-label {
		font-family:    var(--font-ui);
		font-size:      0.6rem;
		font-weight:    700;
		letter-spacing: 0.07em;
		text-transform: uppercase;
		color:          var(--text-dimmer);
	}
	.gc-exp-objective-text {
		font-family: var(--font-ui);
		font-size:   0.72rem;
		line-height: 1.4;
		color:       var(--text-muted);
	}

	/* ===== Expedition tile details ===== */
	.gc-tile-exp-bottom {
		font-family: var(--font-ui);
		font-size: 0.72rem;
		width: 100%;
		padding: 0;
	}
	/* ===== Popover dropdown ===== */
	.gc-popover {
		position: absolute;
		top: 100%;
		left: 0;
		right: 0;
		z-index: 50;
		background: color-mix(in srgb, var(--bg-card) 88%, transparent);
		backdrop-filter: blur(16px) saturate(180%);
		-webkit-backdrop-filter: blur(16px) saturate(180%);
		border: 1px solid rgba(255, 255, 255, 0.11);
		border-radius: 6px;
		box-shadow:
			0 12px 40px rgba(0, 0, 0, 0.55),
			inset 0 1px 0 rgba(255, 255, 255, 0.12);
		max-height: 12rem;
		overflow-y: auto;
		margin-top: 4px;
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

	/* ===== Compact progress control (replaces ProgressTrack in tiles) ===== */
	.gc-progress-compact {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 0.35rem 0.5rem 0.5rem;
		flex-wrap: wrap;
	}
	.gc-progress-label {
		font-family:    var(--font-ui);
		font-size:      0.5rem;
		font-weight:    700;
		text-transform: uppercase;
		letter-spacing: 0.07em;
		color:          var(--text-muted);
		white-space:    nowrap;
	}
	.gc-progress-value {
		font-family: var(--font-ui);
		font-size:   0.78rem;
		font-weight: 700;
		color:       var(--text);
		text-align:  left;
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
	/* Mobile: single column; wider screens: three tiles in a row, reflowing when too narrow */
	.gc--stacked .gc-tiles  { grid-template-columns: 1fr; }
	@media (min-width: 768px) {
		.gc--stacked .gc-tiles { grid-template-columns: repeat(auto-fit, minmax(270px, 1fr)); }
	}

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

	/* ===== Title-bar action button (vanquish / complete) ===== */
	/* Absolutely positioned in top-right of name row; sibling to gc-tile-btn (not nested) */
	.gc-tile-title-action {
		position: absolute;
		top: 7px;
		right: 6px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 22px;
		background: transparent;
		border: 1px solid var(--border-mid);
		border-radius: 3px;
		cursor: pointer;
		z-index: 5;
		color: var(--text-muted);
		transition: background 0.12s, color 0.12s;
	}
	.gc-tile-title-action:hover {
		background: var(--bg-hover);
		color: var(--text);
	}
	.gc-tile-title-action :global(svg) {
		width: 11px;
		height: 11px;
		fill: currentColor;
	}
	.gc-tile-title-action--vanquish:hover {
		color: #ef4444;
		background: rgba(239, 68, 68, 0.1);
		border-color: rgba(239, 68, 68, 0.4);
	}
	.gc-tile-title-action--complete:hover {
		color: #34d399;
		background: rgba(52, 211, 153, 0.1);
		border-color: rgba(52, 211, 153, 0.4);
	}

	/* ===== Site notes — markdown body overrides ===== */
	.gc-exp-notes-body :global(p)  { font-family: var(--font-ui); font-size: 0.72rem; line-height: 1.45; color: var(--text-muted); margin: 0 0 4px; }
	.gc-exp-notes-body :global(h3),
	.gc-exp-notes-body :global(h4),
	.gc-exp-notes-body :global(h5) { font-family: var(--font-ui); font-size: 0.6rem; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-dimmer); margin: 6px 0 2px; }
	.gc-exp-notes-body :global(ul),
	.gc-exp-notes-body :global(ol) { margin: 0 0 4px; padding-left: 1.1em; }
	.gc-exp-notes-body :global(li) { font-family: var(--font-ui); font-size: 0.7rem; line-height: 1.45; color: var(--text-muted); }
	.gc-exp-notes-body :global(strong) { font-weight: 700; color: var(--text); }
	.gc-exp-notes-body :global(em)     { font-style: italic; }
	.gc-exp-notes-body :global(br)     { display: block; margin: 3px 0; content: \'\'; }

	/* ===== Feature / Danger current result strip (below oracle roll buttons) ===== */
	.gc-fd-strip {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 3px;
		padding: 0.25rem 0.6rem 0.3rem;
		width: 100%;
	}
	.gc-fd-line {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 1px;
	}
	.gc-fd-label {
		font-family:    var(--font-ui);
		font-size:      0.6rem;
		font-weight:    700;
		letter-spacing: 0.07em;
		text-transform: uppercase;
		color:          var(--text-dimmer);
	}
	.gc-fd-text {
		font-family: var(--font-ui);
		font-size:   0.72rem;
		line-height: 1.4;
		color:       var(--text-muted);
		font-style:  italic;
	}
</style>
