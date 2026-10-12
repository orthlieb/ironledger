<script lang="ts">
	/**
	 * SettlementBuilder — the Choose Icon dialog's "Settlement builder" and
	 * "Buildings" tabs (`kind`).
	 *
	 * Just the essentials of the settlement kit: tier, culture, walls and
	 * their shape, ground, a harbour, ruined (with decay, and
	 * optionally burned), and a reroll for the
	 * layout. A large preview shows the result in the marker's colour; "Use this" hands the RECIPE back to the caller
	 * (the marker stores the recipe, never the culture definition). The full
	 * set of knobs lives in the standalone playground under tools/, which
	 * also exports new culture plugins.
	 *
	 * The Buildings kind draws one building instead of a settlement: the
	 * building in place of the size, walls that enclose it (none by default;
	 * none at all for the Wall, in its own stone), ground, on stilts (not
	 * the Wall either), and no harbour. Walls and ground are the recipe's
	 * alone — no culture sets them (a culture's wall shape it keeps, as
	 * "Culture's own"). Its reroll varies the building's details (and a
	 * mixed culture's builder).
	 *
	 * A Recent strip above the knobs keeps the last few recipes used, per
	 * kind (per browser, like the colour picker's swatches); clicking one
	 * reuses it straight away. Generation runs in a worker via
	 * settlementIcons.
	 */
	import { untrack } from 'svelte';
	import Select from '$lib/components/Select.svelte';
	import Checkbox from '$lib/components/Checkbox.svelte';
	import { tooltip } from '$lib/actions/tooltip.js';
	import diceD6Svg from '$icons/dice-d6-light.svg?raw';
	import { haloPaddedViewBox, mapGlyphInner } from '$lib/mapConstants.js';
	import { sourceLabel } from '$lib/expansionStore.svelte.js';
	import {
		DEFAULT_CULTURE,
		allCultures,
		loadCultures,
		offeredCultures,
		resolveCulture,
	} from '$lib/cultureStore.svelte.js';
	import { recipeLabel, settlementIcon } from '$lib/settlementIcons.svelte.js';
	import {
		SETTLEMENT_BUILDINGS,
		UNWALLED_BUILDINGS,
		cleanSettlementRecipe,
		sameRecipe,
		type SettlementBuilding,
		type SettlementGround,
		type SettlementRecipe,
		type SettlementTier,
		type SettlementWalls,
	} from '$lib/settlementRecipe.js';

	let {
		kind = 'settlement',
		color,
		initial,
		onuse,
		useButton = $bindable(null),
	}: {
		/** A whole settlement, or one building (the Buildings tab). */
		kind?: 'settlement' | 'building';
		/** The marker's colour — roofs take it in every preview. */
		color: string;
		/** Recipe to start from (the marker's own when it already has one). */
		initial?: SettlementRecipe;
		/** "Use this" / a Recent tile: the chosen recipe. */
		onuse: (recipe: SettlementRecipe) => void;
		/** The "Use this" button, so the dialog can focus it on open. */
		useButton?: HTMLButtonElement | null;
	} = $props();

	// Sizes with their populations (as in the kit's TEMPLATES — kept here so
	// the builder doesn't pull the kit into its bundle). Freeport isn't on
	// the list — a freeport is a culture's mix, not a size — but a marker
	// that already is one keeps it.
	const TIERS: { value: SettlementTier; label: string }[] = [
		{ value: 'stead', label: 'Stead · 5–20' },
		{ value: 'camp', label: 'Camp · 20–200, transient' },
		{ value: 'outpost', label: 'Outpost · 20–100' },
		{ value: 'hamlet', label: 'Hamlet · 20–100' },
		{ value: 'village', label: 'Village · 100–600' },
		{ value: 'hold', label: 'Hold · 600–2,500' },
		{ value: 'town', label: 'Town · 600–2,500' },
		{ value: 'city', label: 'City · 2,500–6,000' },
		{ value: 'capital', label: 'Capital · 6,000–10,000' },
	];
	const WALLS: { value: SettlementWalls; label: string }[] = [
		{ value: 'auto', label: 'Usual for its size' },
		{ value: 'none', label: 'None' },
		{ value: 'stone', label: 'Stone' },
		{ value: 'palisade', label: 'Palisade' },
		{ value: 'earth', label: 'Earthwork' },
		{ value: 'hedge', label: 'Hedge' },
		{ value: 'bone', label: 'Whalebone' },
		{ value: 'reef', label: 'Reef' },
	];
	type Shape = 'culture' | 'round' | 'square';
	const SHAPES: { value: Shape; label: string }[] = [
		{ value: 'culture', label: "Culture's own" },
		{ value: 'round', label: 'Round' },
		{ value: 'square', label: 'Square' },
	];
	const GROUNDS: { value: SettlementGround; label: string }[] = [
		{ value: 'none', label: 'None' },
		{ value: 'dirt', label: 'Dirt' },
		{ value: 'grass', label: 'Grass' },
		{ value: 'farmland', label: 'Farmland' },
		{ value: 'sand', label: 'Sand' },
		{ value: 'rock', label: 'Rock' },
		{ value: 'snow', label: 'Snow' },
		{ value: 'ice', label: 'Ice' },
		{ value: 'marsh', label: 'Marsh' },
		{ value: 'lava', label: 'Lava' },
		{ value: 'water', label: 'Water' },
	];

	const BUILDINGS = Object.entries(SETTLEMENT_BUILDINGS).map(([value, label]) => ({
		value: value as SettlementBuilding,
		label,
	}));

	const newSeed = () => Math.floor(Math.random() * 999_999) + 1;

	// Knob state, seeded once from `initial` (the dialog remounts the
	// builder on every open, so this never needs to re-sync).
	const start = untrack(() => initial);
	const isBuilding = untrack(() => kind) === 'building';
	let tier = $state<SettlementTier>(start?.tier ?? 'village');
	/** The sizes on offer: a freeport marker keeps its own. */
	const tierOptions = $derived(
		tier === 'freeport'
			? [...TIERS, { value: 'freeport' as const, label: 'Freeport · ~15,900' }]
			: TIERS,
	);
	let building = $state<SettlementBuilding>(start?.building ?? 'gable-house');
	let culture = $state(start?.culture ?? DEFAULT_CULTURE);
	let seed = $state(start?.seed ?? newSeed());
	let walls = $state<SettlementWalls>(start?.walls ?? (isBuilding ? 'none' : 'auto'));
	let shape = $state<Shape>(start?.wallShape ?? 'culture');
	let ground = $state<SettlementGround>(start?.ground ?? 'none');
	let stilts = $state(!!start?.stilts);
	let harbor = $state(!!start?.harbor);
	let ruined = $state(!!start?.ruin);
	let decay = $state(start?.ruin?.decay ?? 0.5);
	let burned = $state(!!start?.ruin?.burned);

	void loadCultures();

	/** A wall building (in its own material) or a ship: never enclosed, so
	 *  no Walls. */
	const wallBuilding = $derived(isBuilding && UNWALLED_BUILDINGS.has(building));
	/** A building's walls are an enclosure: none by default, and no "usual
	 *  for its size". */
	const wallOptions = isBuilding ? WALLS.filter((w) => w.value !== 'auto') : WALLS;
	const showWalls = $derived(!wallBuilding);
	const showShape = $derived(!isBuilding || (!wallBuilding && walls !== 'none'));
	const ruin = $derived(
		ruined
			? {
					ruin: {
						decay: Math.round(decay * 100) / 100,
						...(burned ? { burned: true } : {}),
					},
				}
			: {},
	);
	const recipe = $derived<SettlementRecipe>(
		isBuilding
			? {
					// A building has no size; `tier` stays for the recipe's shape.
					tier: 'stead',
					culture,
					seed,
					building,
					...(showWalls && walls !== 'none' && walls !== 'auto' ? { walls } : {}),
					...(showShape && shape !== 'culture' ? { wallShape: shape } : {}),
					...(ground !== 'none' ? { ground } : {}),
					...(stilts && !wallBuilding ? { stilts: true } : {}),
					...ruin,
				}
			: {
					tier,
					culture,
					seed,
					...(walls !== 'auto' ? { walls } : {}),
					...(shape !== 'culture' ? { wallShape: shape } : {}),
					...(ground !== 'none' ? { ground } : {}),
					...(stilts ? { stilts: true } : {}),
					...(harbor ? { harbor: true } : {}),
					...ruin,
				},
	);
	const icon = $derived(settlementIcon(recipe));

	/** Offered cultures, plus the starting one if it's no longer offered
	 *  (its extension is off) so the select can still show it. */
	const cultureOptions = $derived.by(() => {
		const list = offeredCultures();
		const cur = allCultures().find((c) => c.key === culture);
		const all = cur && !list.includes(cur) ? [...list, cur] : list;
		return all.map((c) => ({
			value: c.key,
			label: c.source && c.source !== 'base' ? `${c.name} · ${sourceLabel(c.source)}` : c.name,
		}));
	});
	const note = $derived(resolveCulture(culture)?.note ?? '');

	// ─── Recent recipes (MRU, per browser, per kind) ────────────────────
	const RECENTS_KEY = isBuilding ? 'il:recentBuildings' : 'il:recentSettlements';
	const RECENTS_MAX = 8;
	function readRecents(): SettlementRecipe[] {
		try {
			const raw = JSON.parse(localStorage.getItem(RECENTS_KEY) ?? '[]');
			return Array.isArray(raw)
				? raw
						.map(cleanSettlementRecipe)
						.filter((r): r is SettlementRecipe => !!r && !!r.building === isBuilding)
				: [];
		} catch {
			return [];
		}
	}
	let recents = $state<SettlementRecipe[]>(readRecents());
	function recordRecent(r: SettlementRecipe) {
		recents = [r, ...recents.filter((x) => !sameRecipe(x, r))].slice(0, RECENTS_MAX);
		try {
			localStorage.setItem(RECENTS_KEY, JSON.stringify(recents));
		} catch {
			/* storage blocked: the strip just won't persist */
		}
	}

	function use(r: SettlementRecipe) {
		const plain = $state.snapshot(r) as SettlementRecipe;
		recordRecent(plain);
		onuse(plain);
	}
</script>

<div class="sb">
	{#if recents.length}
		<div class="sb-recents" aria-label={isBuilding ? 'Recent buildings' : 'Recent settlements'}>
			<span class="sb-label">Recent</span>
			<div class="sb-recent-row">
				{#each recents as r, i (i)}
					{@const ric = settlementIcon(r)}
					{@const rlabel = recipeLabel(r, resolveCulture(r.culture))}
					<button
						class="sb-recent"
						type="button"
						onclick={() => use(r)}
						use:tooltip={rlabel}
						aria-label={`Use ${rlabel}`}
					>
						{#if ric}
							<svg viewBox={haloPaddedViewBox(ric)} aria-hidden="true">
								{@html mapGlyphInner(ric, color, `sb-recent-${i}`, 'proportional', 48)}
							</svg>
						{/if}
					</button>
				{/each}
			</div>
		</div>
	{/if}

	<div class="sb-main">
		<div class="sb-knobs">
			{#if isBuilding}
				<label class="sb-field">
					<span class="sb-label">Building</span>
					<Select bind:value={building} options={BUILDINGS} ariaLabel="Building" />
				</label>
			{:else}
				<label class="sb-field">
					<span class="sb-label">Size</span>
					<Select bind:value={tier} options={tierOptions} ariaLabel="Settlement size" />
				</label>
			{/if}
			<label class="sb-field">
				<span class="sb-label">Culture</span>
				<Select bind:value={culture} options={cultureOptions} ariaLabel="Culture" />
			</label>
			{#if note}<p class="sb-note">{note}</p>{/if}
			{#if showWalls}
				<label class="sb-field">
					<span class="sb-label">Walls</span>
					<Select bind:value={walls} options={wallOptions} ariaLabel="Walls" />
				</label>
			{/if}
			{#if showShape}
				<label class="sb-field">
					<span class="sb-label">Wall shape</span>
					<Select bind:value={shape} options={SHAPES} ariaLabel="Wall shape" />
				</label>
			{/if}
			<label class="sb-field">
				<span class="sb-label">Ground</span>
				<Select bind:value={ground} options={GROUNDS} ariaLabel="Ground" />
			</label>
			<!-- Side by side, wrapping, so the switches don't each take a row. -->
			<div class="sb-checks">
				{#if !wallBuilding}
					<Checkbox bind:checked={stilts}><span class="sb-check">On stilts</span></Checkbox>
				{/if}
				{#if !isBuilding}
					<Checkbox bind:checked={harbor}><span class="sb-check">Harbour</span></Checkbox>
				{/if}
				<Checkbox bind:checked={ruined}><span class="sb-check">Ruined</span></Checkbox>
			</div>
			{#if ruined}
				<label class="sb-field sb-field--range">
					<span class="sb-label">Decay</span>
					<input type="range" min="0.1" max="1" step="0.05" bind:value={decay} />
					<output>{Math.round(decay * 100)}%</output>
				</label>
				<Checkbox bind:checked={burned}><span class="sb-check">Burned</span></Checkbox>
			{/if}
		</div>

		<div class="sb-preview">
			<div class="sb-big" aria-live="polite">
				{#if icon}
					<svg viewBox={haloPaddedViewBox(icon)} role="img" aria-label={icon.label}>
						{@html mapGlyphInner(icon, color, 'sb-big', 'proportional')}
					</svg>
				{:else}
					<span class="sb-drawing">Drawing…</span>
				{/if}
			</div>
			<div class="sb-actions">
				<button
					class="dice-btn"
					type="button"
					onclick={() => (seed = newSeed())}
					use:tooltip={isBuilding ? 'Reroll the details' : 'Reroll the layout'}
					aria-label={isBuilding ? 'Reroll the details' : 'Reroll the layout'}
					>{@html diceD6Svg}</button
				>
				<span class="sb-name">{icon?.label ?? ''}</span>
				<button
					bind:this={useButton}
					class="btn btn-primary"
					type="button"
					aria-disabled={!icon}
					class:sb-pending={!icon}
					onclick={() => icon && use(recipe)}>Use this</button
				>
			</div>
		</div>
	</div>
</div>

<style>
	/* The builder fills its tab panel, and the big preview takes whatever
	   height the knobs leave, so the whole tab — "Use this" included —
	   fits the dialog without scrolling; only when even the smallest
	   preview won't fit does the panel scroll. */
	.sb {
		flex: 1 0 auto;
		display: flex;
		flex-direction: column;
		gap: 12px;
		font-family: var(--font-ui);
	}
	.sb-label {
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-dimmer);
	}
	.sb-recents {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.sb-recent-row {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}
	.sb-recent {
		all: unset;
		cursor: pointer;
		box-sizing: border-box;
		width: 48px;
		height: 48px;
		padding: 5px;
		background: var(--bg-control);
		border: 1px solid var(--border);
		border-radius: 4px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}
	.sb-recent:hover,
	.sb-recent:focus-visible {
		border-color: var(--text-accent);
	}
	.sb-recent svg {
		width: 100%;
		height: 100%;
	}
	.sb-main {
		flex: 1;
		display: grid;
		grid-template-columns: minmax(180px, 230px) minmax(0, 1fr);
		gap: 16px;
	}
	.sb-knobs {
		align-self: start;
	}
	.sb-knobs {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.sb-field {
		display: flex;
		flex-direction: column;
		gap: 3px;
	}
	.sb-field--range {
		flex-direction: row;
		align-items: center;
		gap: 8px;
	}
	.sb-field--range input {
		flex: 1;
		min-width: 0;
	}
	.sb-field--range output {
		font-size: 0.75rem;
		color: var(--text-muted);
		font-variant-numeric: tabular-nums;
		min-width: 2.6em;
		text-align: right;
	}
	.sb-check {
		font-size: 0.85rem;
	}
	.sb-checks {
		display: flex;
		flex-wrap: wrap;
		gap: 6px 14px;
	}
	.sb-note {
		margin: 0;
		font-size: 0.75rem;
		font-style: italic;
		color: var(--text-muted);
	}
	.sb-preview {
		display: flex;
		flex-direction: column;
		gap: 8px;
		min-width: 0;
	}
	.sb-big {
		flex: 1 1 0;
		min-height: 140px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--bg-inset);
		border: 1px solid var(--border);
		border-radius: 6px;
		padding: 10px;
	}
	.sb-big svg {
		width: 100%;
		height: 100%;
	}
	.sb-drawing {
		font-size: 0.85rem;
		color: var(--text-dimmer);
	}
	.sb-actions {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	/* aria-disabled (not disabled) while the icon draws, so the button can
	   still take focus on open (CLAUDE.md dialog focus rule). */
	.sb-pending {
		opacity: 0.55;
		cursor: progress;
	}
	.sb-name {
		flex: 1;
		min-width: 0;
		font-size: 0.85rem;
		color: var(--text-muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	/* Phones — narrow, or short in landscape: knobs two to a row so the
	   preview and "Use this" keep their room on screen. */
	@media (max-width: 640px), (max-height: 500px) {
		.sb-knobs {
			display: grid;
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
			gap: 8px 10px;
		}
		.sb-note,
		.sb-checks,
		.sb-field--range {
			grid-column: 1 / -1;
		}
		.sb-note {
			display: -webkit-box;
			-webkit-box-orient: vertical;
			-webkit-line-clamp: 2;
			line-clamp: 2;
			overflow: hidden;
		}
		.sb-big {
			min-height: 110px;
		}
	}
	/* Narrow: the knobs above the preview. */
	@media (max-width: 640px) {
		.sb-main {
			grid-template-columns: 1fr;
			grid-template-rows: auto 1fr;
		}
	}
	/* Short and wide (a phone on its side): a wider knobs column beside it. */
	@media (min-width: 641px) and (max-height: 500px) {
		.sb-main {
			grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
		}
	}
</style>
