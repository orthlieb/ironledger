<script lang="ts">
	/**
	 * /home-v2 — UI prototype (deck-of-cards layout).
	 *
	 * Four areas in a 2x2 grid:
	 *   ┌──────────────┬──────────────┐
	 *   │  Characters  │     Foes     │
	 *   ├──────────────┼──────────────┤
	 *   │ Expeditions  │ Communities  │
	 *   └──────────────┴──────────────┘
	 *
	 * Each area is a "deck stage": the front card of the active deck is shown
	 * at full size; other decks for that area appear as edge-on spines.
	 *
	 * Right rail: session log (existing component).
	 *
	 * Mobile: not implemented in this scaffold — desktop layout only for now.
	 */
	import { onMount } from 'svelte';
	import { loadCharacters }  from '$lib/characterStore.svelte.js';
	import { loadEncounters }  from '$lib/encounterStore.svelte.js';
	import { loadExpeditions } from '$lib/expeditionStore.svelte.js';
	import { loadCommunities } from '$lib/communityStore.svelte.js';
	import { loadAssets }      from '$lib/assetStore.svelte.js';
	import LogPanel             from '$lib/components/LogPanel.svelte';
	import CharactersArea       from '$lib/components/v2/CharactersArea.svelte';
	import AreaPlaceholder      from '$lib/components/v2/AreaPlaceholder.svelte';

	onMount(async () => {
		// Fire all data loads in parallel — each store is independently reactive.
		await Promise.all([
			loadAssets(),
			loadCharacters(),
			loadEncounters(),
			loadExpeditions(),
			loadCommunities(),
		]);
	});
</script>

<svelte:head>
	<title>Iron Ledger</title>
</svelte:head>

<div class="v2-shell">
	<div class="v2-grid">
		<section class="v2-area v2-area--characters">
			<CharactersArea />
		</section>
		<section class="v2-area v2-area--foes">
			<AreaPlaceholder title="Foes" subtitle="Each card = one foe; deck = encounter." />
		</section>
		<section class="v2-area v2-area--expeditions">
			<AreaPlaceholder title="Expeditions" subtitle="Each card = one site; deck = journey." />
		</section>
		<section class="v2-area v2-area--communities">
			<AreaPlaceholder title="Communities" subtitle="Each card = one community." />
		</section>
	</div>
	<aside class="v2-log">
		<LogPanel />
	</aside>
</div>

<style>
	.v2-shell {
		display:        grid;
		grid-template-columns: 1fr 320px;
		gap:            10px;
		height:         100vh;
		padding:        10px;
		background:     var(--bg);
		box-sizing:     border-box;
	}

	.v2-grid {
		display:               grid;
		grid-template-columns: 1fr 1fr;
		grid-template-rows:    1fr 1fr;
		gap:                   10px;
		min-height:            0;
	}

	.v2-area {
		background:    var(--bg-inset);
		border:        1px solid var(--border);
		border-radius: 6px;
		overflow:      hidden;
		min-width:     0;
		min-height:    0;
		display:       flex;
		flex-direction: column;
	}

	.v2-log {
		background:    var(--bg-inset);
		border:        1px solid var(--border);
		border-radius: 6px;
		overflow:      hidden;
		display:       flex;
		flex-direction: column;
	}

	/* Mobile — not yet designed; collapse to single column with the log as a drawer. */
	@media (max-width: 900px) {
		.v2-shell {
			grid-template-columns: 1fr;
			height: auto;
		}
		.v2-grid {
			grid-template-columns: 1fr;
			grid-template-rows: auto;
		}
		.v2-log {
			display: none;
		}
	}
</style>
