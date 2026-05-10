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

	const LOG_WIDTH_KEY = 'il:v2:logWidth';
	const MIN_LOG       = 240;
	const MAX_LOG       = 600;

	let logWidth   = $state(320);
	let dragging   = $state(false);

	onMount(async () => {
		// Persisted log-width preference (per browser).
		const saved = Number(localStorage.getItem(LOG_WIDTH_KEY));
		if (Number.isFinite(saved) && saved >= MIN_LOG && saved <= MAX_LOG) {
			logWidth = saved;
		}

		// Fire all data loads in parallel — each store is independently reactive.
		await Promise.all([
			loadAssets(),
			loadCharacters(),
			loadEncounters(),
			loadExpeditions(),
			loadCommunities(),
		]);
	});

	function startResize(e: MouseEvent) {
		e.preventDefault();
		dragging = true;
		const startX     = e.clientX;
		const startWidth = logWidth;

		const onMove = (ev: MouseEvent) => {
			// Drag handle is to the left of the log; dragging left increases width.
			const delta = startX - ev.clientX;
			const next  = Math.max(MIN_LOG, Math.min(MAX_LOG, startWidth + delta));
			logWidth = next;
		};
		const onUp = () => {
			dragging = false;
			window.removeEventListener('mousemove', onMove);
			window.removeEventListener('mouseup',   onUp);
			localStorage.setItem(LOG_WIDTH_KEY, String(logWidth));
		};
		window.addEventListener('mousemove', onMove);
		window.addEventListener('mouseup',   onUp);
	}
</script>

<svelte:head>
	<title>Iron Ledger</title>
</svelte:head>

<div
	class="v2-shell"
	class:v2-shell--dragging={dragging}
	style:--log-width="{logWidth}px"
>
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
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div
		class="v2-resize-handle"
		role="separator"
		aria-label="Resize log"
		aria-orientation="vertical"
		aria-valuenow={logWidth}
		aria-valuemin={MIN_LOG}
		aria-valuemax={MAX_LOG}
		onmousedown={startResize}
	></div>
	<aside class="v2-log">
		<LogPanel />
	</aside>
</div>

<style>
	.v2-shell {
		display:        grid;
		grid-template-columns: 1fr 6px var(--log-width, 320px);
		gap:            0;
		height:         100vh;
		padding:        10px;
		background:     var(--bg);
		box-sizing:     border-box;
	}
	/* Each child gets a small inner gap via margin so the resize handle keeps a gutter feel. */
	.v2-shell > .v2-grid     { margin-right: 4px; }
	.v2-shell > .v2-log      { margin-left:  4px; }
	.v2-shell--dragging      { cursor: col-resize; user-select: none; }
	.v2-shell--dragging * {
		pointer-events: none;            /* lock UI while dragging the handle */
	}

	.v2-resize-handle {
		width: 6px;
		cursor: col-resize;
		background: transparent;
		position: relative;
		transition: background 0.12s;
		z-index: 1;
	}
	.v2-resize-handle::before {
		content: '';
		position: absolute;
		top: 0; bottom: 0;
		left: 50%;
		width: 1px;
		background: var(--border);
		transform: translateX(-50%);
		transition: background 0.12s, width 0.12s;
	}
	.v2-resize-handle:hover::before,
	.v2-shell--dragging .v2-resize-handle::before {
		background: var(--text-accent);
		width: 2px;
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
		.v2-log,
		.v2-resize-handle {
			display: none;
		}
		.v2-shell > .v2-grid { margin-right: 0; }
	}
</style>
