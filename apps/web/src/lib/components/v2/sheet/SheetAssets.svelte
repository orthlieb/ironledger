<script lang="ts">
	/**
	 * The character sheet's Assets tab: each owned asset as a chit in a grid,
	 * coloured by category, with its counter (Mana, a companion's health)
	 * and ± buttons when it has one. Clicking a chit opens it (`onopen`); an
	 * asset whose requirement no longer holds stays, faded, with the reason
	 * on hover. An empty sheet gets a prompt toward the header's + Asset.
	 *
	 * `data` is the live character: a counter's ± lands on it directly.
	 */
	import { tooltip } from '#lib/actions/tooltip.js';
	import { findAsset, findRaritiesForAsset, getGlobalCounterDef } from '#lib/assetStore.svelte.js';
	import { assetDisplayName } from '#lib/character.js';
	import { fieldShown, fieldValue, findCharacterField } from '#lib/characterFields.svelte.js';
	import { firstPreconditionFailure, type Precondition } from '#lib/preconditions.js';
	import { assetIcon } from '#lib/iconRegistry.js';
	import type { AssetDefinition, CharacterAsset, CharacterData } from '#lib/types.js';
	import gemSvg from '#icons/gem-solid.svg?raw';
	import swordSvg from '#icons/sword-solid.svg?raw';
	// Counter icons — same map as v1 AssetCard.COUNTER_ICONS. The asset
	// definition's customField.icon string keys into this map.
	import iconHeart from '#icons/icon-heart.svg?raw';
	import iconSkull from '#icons/skull-crossbones-solid.svg?raw';
	import iconShield from '#icons/shield-halved-solid.svg?raw';
	import iconEye from '#icons/eye-solid.svg?raw';
	import iconMoon from '#icons/moon-solid.svg?raw';
	import iconSun from '#icons/sun-solid.svg?raw';
	import iconDice from '#icons/dice-d10-light.svg?raw';
	import iconNote from '#icons/note-sticky-solid.svg?raw';
	import iconSackDollar from '#icons/sack-dollar-solid.svg?raw';
	import iconMana from '#icons/icon-mana.svg?raw';
	import iconPuppet from '#icons/puppet-solid.svg?raw';
	import iconGolem from '#icons/rock-golem.svg?raw';

	let {
		data: cd,
		onopen,
	}: {
		/** The live character data. */
		data: CharacterData;
		/** A chit was clicked: open that asset (the event's target is the chit). */
		onopen: (assetId: string, e: MouseEvent) => void;
	} = $props();

	const COUNTER_ICONS: Record<string, string> = {
		heart: iconHeart,
		'skull-and-crossbones': iconSkull,
		sword: swordSvg,
		shield: iconShield,
		eye: iconEye,
		moon: iconMoon,
		sun: iconSun,
		dice: iconDice,
		note: iconNote,
		'sack-dollar': iconSackDollar,
		mana: iconMana,
		puppet: iconPuppet,
		'rock-golem': iconGolem,
	};

	/** Category colour for asset tabs — mirrors AssetCard's CAT_COLOR. */
	const CAT_COLOR: Record<string, string> = {
		'Combat Talent': 'var(--color-iron)',
		Path: 'var(--color-edge)',
		Companion: 'var(--color-heart)',
		Ritual: 'var(--color-mana)',
		Touched: 'var(--color-touched)',
	};

	// Find the first `counter` custom field on the asset (e.g. Mana for
	// Compulsion, Health for a companion) and return its short label plus
	// the current value resolved against the effective max — accounting for
	// per-ability-level maxValue arrays. Returns null when the asset has no
	// counter so the card just shows its category.
	function assetCounter(
		asset: CharacterAsset,
		globalValues?: Record<string, string>,
	): { iconSvg: string; label: string; value: number; max: number } | null {
		const def = findAsset(asset.assetId);
		const field = (def?.customFields ?? []).find((f) => f.type === 'counter');
		if (!def || !field) return null;
		// For global counters use the canonical catalogue-wide definition so
		// cap/default/icon are consistent across every surface that renders
		// the same counter id.
		const eff = field.global ? (getGlobalCounterDef(field.id) ?? field) : field;
		if (eff.maxValue === undefined) return null;
		const store = field.global ? globalValues : asset.customValues;
		const raw = store?.[field.id];
		const dflt = typeof eff.default === 'number' ? eff.default : 0;
		const value = raw != null && raw !== '' ? Number(raw) : dflt;
		let max: number;
		if (typeof eff.maxValue === 'number') {
			max = eff.maxValue;
		} else {
			let lastEnabled = 0;
			for (let i = 0; i < asset.abilities.length; i++) if (asset.abilities[i]) lastEnabled = i;
			const arr = eff.maxValue as number[];
			max = arr[Math.min(lastEnabled, arr.length - 1)] ?? 0;
		}
		const iconSvg = (eff.icon && COUNTER_ICONS[eff.icon]) || iconHeart;
		return { iconSvg, label: eff.label ?? field.label, value, max };
	}

	/** Apply a counter delta directly to the live character. Used by the chit
	 *  ± buttons in the assets tab (asset counters never cost XP, so the
	 *  snapshot/diff machinery doesn't apply here — these mutations are
	 *  immediate). Routes to globalValues for global:true fields, otherwise
	 *  to the asset's customValues. */
	function bumpAssetCounter(asset: CharacterAsset, delta: number) {
		const def = findAsset(asset.assetId);
		const field = (def?.customFields ?? []).find((f) => f.type === 'counter');
		if (!def || !field) return;
		const cur = assetCounter(asset, cd.globalValues);
		if (!cur) return;
		const next = Math.max(0, Math.min(cur.max, cur.value + delta));
		if (next === cur.value) return;
		if (field.global) {
			cd.globalValues = { ...(cd.globalValues ?? {}), [field.id]: String(next) };
		} else {
			const arr = (cd.assets ?? []) as CharacterAsset[];
			cd.assets = arr.map((a) =>
				a.assetId === asset.assetId
					? { ...a, customValues: { ...(a.customValues ?? {}), [field.id]: String(next) } }
					: a,
			);
		}
	}

	/** Why an owned asset can't be used now (its preconditions fail, e.g. a
	 *  Touched asset on a Pure character), or null. */
	function assetBlocked(def: AssetDefinition | undefined): string | null {
		if (!def) return null;
		return firstPreconditionFailure(def.preconditions as Precondition[] | undefined, cd);
	}

	/** An asset's chit name from the character fields it shows (a Touched
	 *  asset: the animal), when one is set. */
	function assetFieldName(
		def: { characterFields?: string[] } | undefined,
	): { text: string; custom: boolean } | null {
		for (const id of def?.characterFields ?? []) {
			const f = findCharacterField(id);
			if (f?.type !== 'string' || !fieldShown(f, cd.fields, findCharacterField)) continue;
			const v = fieldValue(f, cd.fields);
			if (v) return { text: v, custom: true };
		}
		return null;
	}
</script>

{#if (cd.assets ?? []).length === 0}
	<div class="ca-empty">
		<span class="ca-empty-icon" aria-hidden="true">{@html gemSvg}</span>
		<p class="ca-empty-text">
			You currently have no assets. You are either unskilled, destitute, or both. Click
			<span class="ca-empty-key" role="img" aria-label="Add Asset"
				><span class="ca-empty-key-plus">+</span>{@html gemSvg}</span
			> to prove me wrong.
		</p>
	</div>
{:else}
	<div class="ca-asset-grid" aria-label="Assets" data-tour="char-assets">
		{#each cd.assets ?? [] as a (a.assetId)}
			{@const def = findAsset(a.assetId)}
			{@const catColor = CAT_COLOR[def?.category ?? ''] ?? 'var(--text-muted)'}
			{@const counter = assetCounter(a, cd.globalValues)}
			{@const display = assetFieldName(def) ?? assetDisplayName(a, def)}
			{@const blocked = assetBlocked(def)}
			<!-- An asset whose requirement no longer holds (a Touched asset on a
			     Pure character) stays, faded, with the reason on hover; its
			     card still opens, so it can be deleted. -->
			<div
				class="ca-asset-card"
				class:ca-asset-card--blocked={!!blocked}
				style="--cat-color: {catColor}"
			>
				<button
					class="ca-asset-card-main"
					onclick={(e) => onopen(a.assetId, e)}
					use:tooltip={blocked
						? `${def?.name}: can't be used. ${blocked}`
						: def
							? `${def.name} · ${def.category}`
							: a.assetId}
				>
					<span class="ca-asset-card-meta">
						<span class="ca-asset-card-cat">{def?.category ?? ''}</span>
						{#if a.rarityId}
							{@const rarity = findRaritiesForAsset(a.assetId).find((r) => r.id === a.rarityId)}
							<span
								class="ca-asset-card-rarity"
								use:tooltip={rarity ? `Rarity: ${rarity.name}` : 'Has rarity'}
								aria-label={rarity ? `Rarity: ${rarity.name}` : 'Has rarity'}>{@html gemSvg}</span
							>
						{/if}
					</span>
					<span class="ca-asset-card-name-row">
						<span class="ca-asset-card-name-icon" aria-hidden="true">{@html assetIcon(def)}</span>
						<span class="ca-asset-card-name" class:ca-asset-card-name--custom={display.custom}
							>{display.text}</span
						>
					</span>
				</button>
				{#if counter}
					<div
						class="ca-asset-card-tile"
						style:--res-color={catColor}
						use:tooltip={`${counter.label}: ${counter.value}/${counter.max}`}
					>
						<div class="ca-asset-card-tile-bg" aria-hidden="true">
							{@html counter.iconSvg}
						</div>
						<span class="ca-asset-card-tile-name">{counter.label}</span>
						<div class="ca-asset-card-tile-row">
							<button
								class="ca-asset-card-tile-btn"
								onclick={() => bumpAssetCounter(a, -1)}
								disabled={counter.value <= 0}
								aria-label="Decrease {counter.label}">−</button
							>
							<span class="ca-asset-card-tile-val">{counter.value}/{counter.max}</span>
							<button
								class="ca-asset-card-tile-btn"
								onclick={() => bumpAssetCounter(a, 1)}
								disabled={counter.value >= counter.max}
								aria-label="Increase {counter.label}">+</button
							>
						</div>
					</div>
				{/if}
			</div>
		{/each}
	</div>
{/if}

<style>
	/* ── Asset tab content — clickable cards in a responsive grid.
	   Each card is auto-sized so a row fits as many as possible. Hover
	   raises the card slightly and brightens it; clicking opens the
	   AssetCard dialog (same as v1). The left-edge accent uses the
	   asset's category color (Combat/Path/Companion/Ritual/Talent). */
	.ca-asset-grid {
		display: grid;
		/* As many ~220-px columns as fit. Mobile gets 1 column; mid-width
		   screens get 2; wide desktops can get 3+. */
		grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
		gap: 6px;
	}
	/* Outer card is now a flex row: main info area on the left + optional
	   counter tile on the right. Hover state is on the inner main-button
	   area only — putting it on the outer card caused the whole chit to
	   lift when the cursor moved onto the counter ± buttons. */
	/* An owned asset whose requirement no longer holds: still there, and
	   still opens (to delete it), but plainly out of use. */
	.ca-asset-card--blocked {
		opacity: 0.5;
		border-left-style: dashed;
	}
	.ca-asset-card {
		display: flex;
		align-items: stretch;
		gap: 0;
		background: var(--bg-inset);
		border: 1px solid var(--border);
		border-left: 3px solid var(--cat-color, var(--text-muted));
		border-radius: 4px;
		overflow: hidden;
		transition: border-color 0.12s;
	}
	/* Clickable main area — opens the asset dialog. The ± buttons in the
	   tile to its right have their own focus, so this region is purely
	   for "open detail". */
	.ca-asset-card-main {
		all: unset;
		flex: 1;
		min-width: 0;
		cursor: pointer;
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 7px 10px;
		transition: background 0.12s;
	}
	.ca-asset-card-main:hover {
		background: var(--bg-hover);
	}
	.ca-asset-card-meta {
		display: flex;
		align-items: center;
		gap: 5px;
	}
	.ca-asset-card-cat {
		font-family: var(--font-ui);
		font-size: 0.55rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--cat-color, var(--text-muted));
		line-height: 1;
	}
	/* Name row — flex with category icon on the left and the name text
	   on the right. Mirrors the Communities / Expeditions stage-icon
	   pattern. 16-px icon fits the compact chit size. */
	.ca-asset-card-name-row {
		display: flex;
		align-items: center;
		gap: 6px;
		min-width: 0;
	}
	.ca-asset-card-name-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 16px;
		height: 16px;
		color: var(--cat-color, var(--text-muted));
		flex-shrink: 0;
	}
	.ca-asset-card-name-icon :global(svg) {
		width: 100%;
		height: 100%;
		fill: currentColor;
	}
	.ca-asset-card-name-icon :global(svg path) {
		fill: currentColor;
	}
	/* Gem badge — appears in the meta row when the asset has a selected
	   rarity. Inherits the asset category colour via currentColor on the
	   SVG fill. */
	.ca-asset-card-rarity {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 12px;
		height: 12px;
		color: var(--cat-color, var(--text-muted));
		flex-shrink: 0;
	}
	.ca-asset-card-rarity :global(svg) {
		width: 100%;
		height: 100%;
		fill: currentColor;
	}
	.ca-asset-card-rarity :global(svg path) {
		fill: currentColor;
	}
	.ca-asset-card-name {
		flex: 1;
		min-width: 0;
		font-family: var(--font-ui);
		font-size: 0.78rem;
		color: var(--text);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	/* User-supplied name (filled in via the asset's "string" custom field —
	   companion name, specialty, etc.). Italic signals it's not the catalogue
	   name. */
	.ca-asset-card-name--custom {
		font-style: italic;
	}

	/* Counter tile on the right end of the chit — mirrors ResourceTile's
	   visual structure (label + value/± row + faded background icon) but
	   compact. ± buttons mutate the underlying counter directly; counters
	   don't cost XP so no draft/snapshot is needed. */
	.ca-asset-card-tile {
		position: relative;
		flex-shrink: 0;
		width: 84px;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: space-between;
		gap: 3px;
		padding: 5px 4px;
		border-left: 1px solid color-mix(in srgb, var(--res-color) 30%, var(--border));
		background: color-mix(in srgb, var(--res-color) 8%, var(--bg-card));
		overflow: hidden;
	}
	.ca-asset-card-tile-bg {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		opacity: 0.18;
		pointer-events: none;
	}
	:global([data-theme='dark']) .ca-asset-card-tile-bg {
		opacity: 0.4;
	}
	.ca-asset-card-tile-bg :global(svg) {
		width: 60%;
		height: 60%;
		fill: var(--res-color);
		color: var(--res-color);
	}
	.ca-asset-card-tile-name {
		font-family: var(--font-ui);
		font-size: 0.55rem;
		font-weight: 900;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--res-color);
		line-height: 1;
		position: relative;
		z-index: 1;
	}
	.ca-asset-card-tile-row {
		display: flex;
		align-items: center;
		gap: 3px;
		position: relative;
		z-index: 1;
	}
	.ca-asset-card-tile-btn {
		background: transparent;
		border: 1px solid var(--border-mid);
		color: var(--text-muted);
		cursor: pointer;
		padding: 0;
		width: 18px;
		height: 18px;
		font-size: 0.7rem;
		line-height: 1;
		border-radius: 3px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		transition:
			border-color 0.12s,
			color 0.12s;
	}
	.ca-asset-card-tile-btn:hover:not(:disabled) {
		border-color: var(--res-color);
		color: var(--res-color);
	}
	.ca-asset-card-tile-btn:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}
	.ca-asset-card-tile-val {
		font-family: var(--font-ui);
		font-size: 0.65rem;
		font-weight: 800;
		color: var(--res-color);
		font-variant-numeric: tabular-nums;
		min-width: 2.6em;
		text-align: center;
		line-height: 1;
	}
</style>
