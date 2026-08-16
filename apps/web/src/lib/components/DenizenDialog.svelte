<script lang="ts">
	/**
	 * DenizenDialog — the "Roll Denizen" GCB action for a Delve site.
	 *
	 * A thin wrapper around the shared FoeRollDialog. All it supplies is the
	 * site's denizen table — the fixed DENIZEN_CELLS frequency bands zipped with
	 * this site's twelve denizen names — plus a resolver that maps a rolled
	 * denizen name to a foe (case-insensitive). Every bit of the roll / detail /
	 * add-to-foes UI lives in FoeRollDialog, which also backs the extension
	 * per-site denizen tables that resolve foes by name.
	 *
	 * Public API is unchanged from the pre-refactor dialog, so callers need no
	 * edits:
	 *   <DenizenDialog bind:this={ref} onSelect={handleFoeSelected} />
	 *   ref.open(site);
	 */
	import type { Site, FoeDef, FoeQuantity, FoeRollRow } from '$lib/types.js';
	import { DENIZEN_CELLS } from '$lib/types.js';
	import { loadFoes, getFoes } from '$lib/foeStore.svelte.js';
	import FoeRollDialog from '$lib/components/FoeRollDialog.svelte';

	let {
		onSelect,
	}: {
		onSelect: (foeDef: FoeDef, quantity: FoeQuantity, effectiveRank: number) => void;
	} = $props();

	let inner = $state<{ open(): void; close(): void } | null>(null);
	let site = $state<Site | null>(null);

	/** Zip the fixed frequency bands with this site's denizen names into rows
	 *  the shared dialog understands (ref = denizen name, resolved below). */
	const rows = $derived<FoeRollRow[]>(
		site
			? DENIZEN_CELLS.map((c, i) => ({
					low: c.low,
					high: c.high,
					label: c.label,
					range: c.range,
					ref: site!.denizens[i] ?? '',
				}))
			: [],
	);
	const logLabel = $derived(`Site — ${site?.name || 'Unnamed Site'}`);

	/** Resolve a denizen name → foe (case-insensitive). Names are human-authored
	 *  per site, so there's no id to key on — match on the foe catalogue name. */
	function resolve(ref: string): FoeDef | undefined {
		if (!ref) return undefined;
		return getFoes().find((f) => f.name.toLowerCase() === ref.toLowerCase());
	}

	export async function open(s: Site): Promise<void> {
		await loadFoes();
		site = s;
		inner?.open();
	}
	export function close(): void {
		inner?.close();
	}
</script>

<FoeRollDialog bind:this={inner} title="Denizen Table" {logLabel} {rows} {resolve} {onSelect} />
