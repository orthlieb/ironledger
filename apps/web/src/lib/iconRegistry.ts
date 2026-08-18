// =============================================================================
// Icon registry — build-time scan of $lib/icons/*.svg.
//
// Vite's import.meta.glob enumerates every SVG in the icons directory at
// build time and inlines them as raw strings. Adding a new SVG to the
// directory makes it automatically available; no per-file import line or
// map entry is needed.
//
// Each consumer renders an icon by slug — either the catalogue's per-asset
// override (`def.icon = "wolf-pup"`) or the category fallback. The renderer
// gracefully returns an empty string when the slug isn't registered, so
// missing icons degrade silently instead of throwing.
// =============================================================================
import type { AssetCategory, AssetDefinition, FoeDef, FoeNature } from '$lib/types.js';

// `eager: true` inlines the SVG text into the bundle (no async, no chunk
// splitting). With the current ~12 icons each ~1–3 KB this is comfortably
// trivial; if the registry grew to hundreds we'd switch to eager: false
// and async-loaded chunks.
// Two sources, merged: the app's own icons, and each extension's bundled
// icons (extensions/<id>/icons/*.svg at the repo root). The extension glob is
// relative to this module (apps/web/src/lib/ → ../../../../extensions). Icon
// slugs are namespaced by convention (e.g. `asset-touched-salamandrine`), so
// the flat filename→slug mapping stays collision-free across extensions.
const sources = {
	...(import.meta.glob('/src/lib/icons/*.svg', {
		eager: true,
		query: '?raw',
		import: 'default',
	}) as Record<string, string>),
	...(import.meta.glob('../../../../extensions/*/icons/*.svg', {
		eager: true,
		query: '?raw',
		import: 'default',
	}) as Record<string, string>),
};

/** Map of icon slug → raw SVG. Slug is the filename minus directory and
 *  `.svg` extension: e.g. `/src/lib/icons/cat-combat.svg` → `cat-combat`. */
const REGISTRY: Map<string, string> = new Map(
	Object.entries(sources).map(([path, svg]) => [
		path.replace(/^.*\//, '').replace(/\.svg$/, ''),
		svg,
	]),
);

/** Lookup by slug. Returns undefined when the slug isn't a registered file. */
export function getIcon(slug: string | undefined | null): string | undefined {
	if (!slug) return undefined;
	return REGISTRY.get(slug);
}

/** True when an icon with the given slug exists. Useful for catalogue lints. */
export function hasIcon(slug: string): boolean {
	return REGISTRY.has(slug);
}

/** Every registered slug. Useful for catalogue lints and dev tooling. */
export function listIcons(): string[] {
	return Array.from(REGISTRY.keys());
}

// ---------------------------------------------------------------------------
// Category / nature fallbacks
// ---------------------------------------------------------------------------

const CAT_ICON: Record<AssetCategory, string> = {
	'Combat Talent': 'cat-combat',
	Companion: 'cat-companion',
	Path: 'cat-path',
	Ritual: 'cat-ritual',
	Touched: 'cat-touched',
};

const NATURE_ICON: Record<FoeNature, string> = {
	Ironlander: 'foe-ironlander',
	Firstborn: 'foe-firstborn',
	Animal: 'foe-animal',
	Beast: 'foe-beast',
	Horror: 'foe-horror',
	Anomaly: 'foe-anomaly',
	Construct: 'foe-construct',
};

/** Resolve the icon SVG for an asset, with per-asset override taking
 *  precedence over the category fallback. Returns '' when nothing matches
 *  so consumers can render `{@html assetIcon(def)}` directly. */
export function assetIcon(def: AssetDefinition | undefined | null): string {
	if (!def) return '';
	return getIcon(def.icon) ?? getIcon(CAT_ICON[def.category]) ?? '';
}

/** Same as assetIcon, by category alone. Use in places where you don't have
 *  the full definition (e.g. picker filter chips that show category names). */
export function categoryIcon(category: AssetCategory): string {
	return getIcon(CAT_ICON[category]) ?? '';
}

/** Resolve the icon SVG for a foe, with per-foe override taking precedence
 *  over the nature fallback. */
export function foeIcon(def: FoeDef | undefined | null): string {
	if (!def) return '';
	return getIcon(def.icon) ?? getIcon(NATURE_ICON[def.nature]) ?? '';
}

/** Foe icon by nature alone (picker filter chips, etc.). */
export function natureIcon(nature: FoeNature): string {
	return getIcon(NATURE_ICON[nature]) ?? '';
}

// ---------------------------------------------------------------------------
// Oracle category → icon
//
// Oracles carry an optional `category` string (e.g. "Character", "Location",
// "Threat") that groups them under the picker's filter chips. Each category
// also gets a per-tile glyph so the picker reads at a glance. All slugs
// resolve to icons already in the library — no new SVG art is needed.
// An unknown or absent category falls back to a neutral d100 glyph so tiles
// never render iconless.
// ---------------------------------------------------------------------------

const ORACLE_CAT_ICON: Record<string, string> = {
	Core: 'crystal-ball',
	Location: 'location',
	Character: 'farmer',
	Settlement: 'village',
	'Delve Site': 'dungeon-gate',
	Threat: 'skull-crossbones-solid-full',
	Move: 'person-running-solid',
	Creature: 'foe-beast',
	Combat: 'sword-solid-full',
	// Scale absorbs the former Quest cluster (challengeRank moved). fa-scale-unbalanced.
	Scale: 'scale-unbalanced-solid-full',
	// FA Free (hydra + sparkles are Pro-only — substituted from the same visual family):
	Monstrosity: 'dragon-solid-full',
	Story: 'book-solid-full',
	Magic: 'wand-sparkles-solid-full',
	// Encounter reuses the neutral d100 glyph — single-oracle category, no distinctive art.
	Encounter: 'dice-d100-solid',
	// Sample/dev-only oracles surface as "Other" — d100 fallback is the right neutral.
	Other: 'dice-d100-solid',
};

/** Resolve the icon SVG for an oracle by category. Falls back to a neutral
 *  d100 glyph for unknown/absent categories so tiles never render blank. */
export function oracleCategoryIcon(category: string | undefined | null): string {
	const slug = category ? ORACLE_CAT_ICON[category] : undefined;
	return getIcon(slug) ?? getIcon('dice-d100-solid') ?? '';
}

// ---------------------------------------------------------------------------
// Move category → icon
//
// Same asset-card treatment on the Moves picker + detail header. Moves are
// grouped by their canonical Ironsworn/Delve category (Adventure, Combat,
// Journey, Suffer, …). Each gets a distinctive glyph reused from the
// existing library so the tile reads at a glance and the detail-view header
// carries a badge that matches. Absent/unknown categories fall back to the
// person-running glyph — the same one the app-nav Move button uses.
// ---------------------------------------------------------------------------

const MOVE_CAT_ICON: Record<string, string> = {
	Adventure: 'compass-rose',
	Combat: 'sword-solid-full',
	Journey: 'journey',
	Suffer: 'heart-pulse-solid-full',
	Fate: 'star-solid-full',
	Failure: 'link-broken-solid-full',
	Quest: 'sack-dollar-solid-full',
	Relationship: 'farmer',
	Threat: 'skull-crossbones-solid-full',
	Delve: 'dungeon-gate',
	Scene: 'hourglass-clock-solid-full',
	Rarity: 'gem-solid',
	Yrt: 'foe-beast',
	Sample: 'dice-d100-solid',
};

/** Resolve the icon SVG for a move by category. Falls back to the app-nav
 *  Move glyph for unknown/absent categories so the header/tile never renders
 *  blank. */
export function moveCategoryIcon(category: string | undefined | null): string {
	const slug = category ? MOVE_CAT_ICON[category] : undefined;
	return getIcon(slug) ?? getIcon('person-running-solid') ?? '';
}
