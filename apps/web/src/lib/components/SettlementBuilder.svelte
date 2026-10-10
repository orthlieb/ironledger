<script lang="ts">
	/**
	 * SettlementBuilder — the Choose Icon dialog's "Settlement builder" tab.
	 *
	 * Just the essentials of the settlement kit: tier, culture, walls and
	 * their shape, a harbour, ruined (with decay, and
	 * optionally burned), and a reroll for the
	 * layout. A large preview and a marker-size preview show the result in
	 * the marker's colour; "Use this" hands the RECIPE back to the caller
	 * (the marker stores the recipe, never the culture definition). The full
	 * set of knobs lives in the standalone playground under tools/, which
	 * also exports new culture plugins.
	 *
	 * A Recent strip above the knobs keeps the last few recipes used (per
	 * browser, like the colour picker's swatches); clicking one reuses it
	 * straight away. Generation runs in a worker via settlementIcons.
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
		cleanSettlementRecipe,
		sameRecipe,
		type SettlementRecipe,
		type SettlementTier,
		type SettlementWalls,
	} from '$lib/settlementRecipe.js';

	let {
		color,
		initial,
		onuse,
		useButton = $bindable(null),
	}: {
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
	type Ground = 'culture' | 'land' | 'water';
	const GROUNDS: { value: Ground; label: string }[] = [
		{ value: 'culture', label: "Culture's own" },
		{ value: 'land', label: 'Land' },
		{ value: 'water', label: 'Water' },
	];

	const newSeed = () => Math.floor(Math.random() * 999_999) + 1;

	// Knob state, seeded once from `initial` (the dialog remounts the
	// builder on every open, so this never needs to re-sync).
	const start = untrack(() => initial);
	let tier = $state<SettlementTier>(start?.tier ?? 'village');
	/** The sizes on offer: a freeport marker keeps its own. */
	const tierOptions = $derived(
		tier === 'freeport'
			? [...TIERS, { value: 'freeport' as const, label: 'Freeport · ~15,900' }]
			: TIERS,
	);
	let culture = $state(start?.culture ?? DEFAULT_CULTURE);
	let seed = $state(start?.seed ?? newSeed());
	let walls = $state<SettlementWalls>(start?.walls ?? 'auto');
	let shape = $state<Shape>(start?.wallShape ?? 'culture');
	let ground = $state<Ground>(start?.ground ?? 'culture');
	let stilts = $state(!!start?.stilts);
	let harbor = $state(!!start?.harbor);
	let ruined = $state(!!start?.ruin);
	let decay = $state(start?.ruin?.decay ?? 0.5);
	let burned = $state(!!start?.ruin?.burned);

	void loadCultures();

	const recipe = $derived<SettlementRecipe>({
		tier,
		culture,
		seed,
		...(walls !== 'auto' ? { walls } : {}),
		...(shape !== 'culture' ? { wallShape: shape } : {}),
		...(ground !== 'culture' ? { ground } : {}),
		...(stilts ? { stilts: true } : {}),
		...(harbor ? { harbor: true } : {}),
		...(ruined
			? {
					ruin: {
						decay: Math.round(decay * 100) / 100,
						...(burned ? { burned: true } : {}),
					},
				}
			: {}),
	});
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

	// ─── Recent recipes (MRU, per browser) ──────────────────────────────
	const RECENTS_KEY = 'il:recentSettlements';
	const RECENTS_MAX = 8;
	function readRecents(): SettlementRecipe[] {
		try {
			const raw = JSON.parse(localStorage.getItem(RECENTS_KEY) ?? '[]');
			return Array.isArray(raw)
				? raw.map(cleanSettlementRecipe).filter((r): r is SettlementRecipe => !!r)
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
		<div class="sb-recents" aria-label="Recent settlements">
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
			<label class="sb-field">
				<span class="sb-label">Size</span>
				<Select bind:value={tier} options={tierOptions} ariaLabel="Settlement size" />
			</label>
			<label class="sb-field">
				<span class="sb-label">Culture</span>
				<Select bind:value={culture} options={cultureOptions} ariaLabel="Culture" />
			</label>
			{#if note}<p class="sb-note">{note}</p>{/if}
			<label class="sb-field">
				<span class="sb-label">Walls</span>
				<Select bind:value={walls} options={WALLS} ariaLabel="Walls" />
			</label>
			<label class="sb-field">
				<span class="sb-label">Wall shape</span>
				<Select bind:value={shape} options={SHAPES} ariaLabel="Wall shape" />
			</label>
			<label class="sb-field">
				<span class="sb-label">Ground</span>
				<Select bind:value={ground} options={GROUNDS} ariaLabel="Ground" />
			</label>
			<Checkbox bind:checked={stilts}><span class="sb-check">On stilts</span></Checkbox>
			<Checkbox bind:checked={harbor}><span class="sb-check">Harbour</span></Checkbox>
			<Checkbox bind:checked={ruined}><span class="sb-check">Ruined</span></Checkbox>
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
			<div class="sb-actual">
				{#if icon}
					<svg viewBox={haloPaddedViewBox(icon)} aria-hidden="true">
						{@html mapGlyphInner(icon, color, 'sb-small', 'proportional', 34)}
					</svg>
				{/if}
				<span>marker size</span>
			</div>
			<div class="sb-actions">
				<button
					class="dice-btn"
					type="button"
					onclick={() => (seed = newSeed())}
					use:tooltip={'Reroll the layout'}
					aria-label="Reroll the layout">{@html diceD6Svg}</button
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
	.sb {
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
		display: grid;
		grid-template-columns: minmax(180px, 230px) minmax(0, 1fr);
		gap: 16px;
		align-items: start;
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
		height: 260px;
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
	.sb-actual {
		display: flex;
		align-items: flex-end;
		gap: 10px;
		padding: 8px 10px;
		border-radius: 6px;
		border: 1px solid var(--border);
		/* A hint of map parchment behind the actual-size marker. */
		background: color-mix(in srgb, #d8cba5 55%, var(--bg-inset));
		font-size: 0.72rem;
		color: var(--text-muted);
	}
	.sb-actual svg {
		width: 34px;
		height: 34px;
	}
	.sb-actual span {
		margin-left: auto;
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
	@media (max-width: 640px) {
		.sb-main {
			grid-template-columns: 1fr;
		}
		.sb-big {
			height: 200px;
		}
	}
</style>
