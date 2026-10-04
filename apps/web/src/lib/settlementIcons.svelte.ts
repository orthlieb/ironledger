// =============================================================================
// Iron Ledger — generated settlement icons (client cache).
//
// A marker with a `settlement` recipe draws an icon generated on the fly:
// settlementIcon(recipe) returns a synthetic layered MapIcon once the worker
// has drawn it (undefined until then — callers fall back to the marker's
// plain `icon`). The SVG text primes mapIconCache under a `gen:` src, so the
// generated icon renders through the exact path a baked layered icon does
// (mapGlyphInner → layeredPaths), marker colour on the roofs included.
//
// Everything is reactive (SvelteMap + the culture store), so a marker
// re-renders by itself when its icon arrives or the cultures load.
// =============================================================================

import { SvelteMap } from 'svelte/reactivity';
import type { MapIcon } from '$lib/generated/mapIconManifest.js';
import { resolveMapIcon } from '$lib/mapConstants.js';
import { primeLayered } from '$lib/mapIconCache.js';
import type { MapMarker } from '$lib/mapStore.svelte.js';
import type { Culture } from '$lib/settlement-kit/generate.js';
import { culturesLoaded, loadCultures, resolveCulture } from '$lib/cultureStore.svelte.js';
import { recipeKey, type SettlementRecipe } from '$lib/settlementRecipe.js';

/** Most generated icons kept (rerolls in the builder make a lot of them). */
const MAX_CACHED = 120;

const icons = new SvelteMap<string, MapIcon>();
const inflight = new Set<string>();

// ─── Generation: a worker in the browser, the main thread elsewhere ─────────

let worker: Worker | null = null;
let nextId = 1;
const waiting = new Map<number, { resolve: (svg: string) => void; reject: (e: Error) => void }>();

function getWorker(): Worker | null {
	if (worker || typeof Worker === 'undefined') return worker;
	try {
		worker = new Worker(new URL('./settlementWorker.ts', import.meta.url), { type: 'module' });
		worker.onmessage = (e: MessageEvent<{ id: number; svg?: string; error?: string }>) => {
			const w = waiting.get(e.data.id);
			if (!w) return;
			waiting.delete(e.data.id);
			if (e.data.svg) w.resolve(e.data.svg);
			else w.reject(new Error(e.data.error ?? 'generation failed'));
		};
	} catch {
		worker = null;
	}
	return worker;
}

/** Draw a recipe to layered SVG text (off the main thread when possible). */
export async function generateSvg(
	recipe: SettlementRecipe,
	culture: Culture | null,
): Promise<string> {
	const w = getWorker();
	if (!w) {
		// No workers (SSR, unit tests): generate inline. Dynamic import keeps
		// the kit and clipper-lib out of the main bundle either way.
		const { generateSettlementSvg } = await import('$lib/settlement-kit/generate.js');
		return generateSettlementSvg(recipe, culture);
	}
	const id = nextId++;
	return new Promise((resolve, reject) => {
		waiting.set(id, { resolve, reject });
		// $state proxies don't survive structuredClone — send plain copies.
		w.postMessage({
			id,
			recipe: { ...recipe },
			culture: culture && JSON.parse(JSON.stringify(culture)),
		});
	});
}

/** Synthetic manifest entry for a generated icon. */
export function generatedIcon(key: string, label: string, svg: string): MapIcon {
	const src = `gen:${key}`;
	primeLayered(src, svg);
	return {
		slug: `gen-${key}`,
		label,
		category: 'generated',
		categoryLabel: 'Settlement builder',
		viewBox: svg.match(/viewBox="([^"]+)"/)?.[1] ?? '0 0 100 100',
		inner: '',
		layered: true,
		src,
		palette: svg.match(/data-palette="([^"]+)"/)?.[1] ?? '',
	};
}

const TIER_LABEL: Record<string, string> = {
	stead: 'Stead',
	camp: 'Camp',
	outpost: 'Outpost',
	hamlet: 'Hamlet',
	village: 'Village',
	hold: 'Hold',
	town: 'Town',
	city: 'City',
	capital: 'Capital',
	freeport: 'Freeport',
};

/** Human label for a recipe, e.g. "Ruined Nysis Town". */
export function recipeLabel(recipe: SettlementRecipe, culture: Culture | null): string {
	const name = culture?.name ?? 'Ironlander';
	const state = recipe.ruin ? (recipe.ruin.burned ? 'Burned ' : 'Ruined ') : '';
	return `${state}${name} ${TIER_LABEL[recipe.tier] ?? recipe.tier}`;
}

/**
 * The generated icon for a recipe, or undefined while cultures load / the
 * worker draws it. Safe to call from templates and $derived — the first call
 * kicks generation off, and the SvelteMap re-renders the caller on arrival.
 */
export function settlementIcon(recipe: SettlementRecipe): MapIcon | undefined {
	if (!culturesLoaded()) {
		void loadCultures();
		return undefined;
	}
	const culture = resolveCulture(recipe.culture);
	const key = `${recipeKey(recipe)}#${culture?.key ?? '-'}`;
	const hit = icons.get(key);
	if (hit) return hit;
	if (!inflight.has(key)) {
		inflight.add(key);
		generateSvg(recipe, culture)
			.then((svg) => {
				if (icons.size >= MAX_CACHED) {
					const oldest = icons.keys().next().value;
					if (oldest !== undefined) icons.delete(oldest);
				}
				icons.set(key, generatedIcon(key, recipeLabel(recipe, culture), svg));
			})
			.catch(() => {
				/* leave it on the fallback icon */
			})
			.finally(() => inflight.delete(key));
	}
	return undefined;
}

/**
 * What a marker draws: its generated settlement icon when it has a recipe
 * and the icon is ready, else its plain manifest icon.
 */
export function resolveMarkerIcon(m: Pick<MapMarker, 'icon' | 'settlement'>): MapIcon | undefined {
	return (m.settlement && settlementIcon(m.settlement)) || resolveMapIcon(m.icon);
}
