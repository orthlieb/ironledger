<script lang="ts">
	/**
	 * /home — deck-of-cards UI.
	 *
	 * Three columns, each ⅓ of the viewport width initially:
	 *   ┌────────────────┬────────────────┬──────────┐
	 *   │   Characters   │   Expeditions  │          │
	 *   ├────────────────┼────────────────┤   Log    │
	 *   │     Foes       │  Communities   │          │
	 *   └────────────────┴────────────────┴──────────┘
	 *
	 * The log has a drag handle on its left edge; dragging it resizes the log
	 * directly, and the two left-hand columns share the remaining space
	 * proportionally (they're 1fr 1fr in CSS Grid, so they auto-rebalance).
	 *
	 * Each area is a "deck stage": the front card of the active deck is shown
	 * at full size; other decks for that area appear as edge-on spines.
	 *
	 * Mobile: not implemented yet — desktop layout only.
	 */
	import { onMount } from 'svelte';
	import { loadCharacters }  from '$lib/characterStore.svelte.js';
	import { loadEncounters }  from '$lib/encounterStore.svelte.js';
	import { loadExpeditions } from '$lib/expeditionStore.svelte.js';
	import { loadCommunities } from '$lib/communityStore.svelte.js';
	import { loadNpcs }        from '$lib/npcStore.svelte.js';
	import { loadAssets }      from '$lib/assetStore.svelte.js';
	import { loadFoes }        from '$lib/foeStore.svelte.js';
	import LogPanel             from '$lib/components/LogPanel.svelte';
	import CharactersArea       from '$lib/components/v2/CharactersArea.svelte';
	import FoesArea             from '$lib/components/v2/FoesArea.svelte';
	import ExpeditionsArea      from '$lib/components/v2/ExpeditionsArea.svelte';
	import CommunitiesArea      from '$lib/components/v2/CommunitiesArea.svelte';

	const LOG_WIDTH_KEY = 'il:home:logWidth';
	const MIN_LOG       = 240;
	const MAX_LOG       = 800;

	/** Width of the log column in px. Defaults to 1/3 of the viewport on first
	    paint; persisted to localStorage thereafter. */
	let logWidth = $state(0);
	let dragging = $state(false);
	let shellEl  = $state<HTMLDivElement | null>(null);

	/** Ref to ExpeditionsArea — used to forward `change-theme-link` /
	    `change-domain-link` clicks from the LogPanel into the right
	    expedition's theme/domain change dialog. */
	let expAreaRef = $state<{
		openChangeThemeForExp(expId: string):  void;
		openChangeDomainForExp(expId: string): void;
	} | null>(null);

	onMount(async () => {
		// First-paint default: 1/3 of viewport so Char/Foe + Exp/Comm + Log
		// each get an equal share. Persisted preference overrides.
		const saved = Number(localStorage.getItem(LOG_WIDTH_KEY));
		if (Number.isFinite(saved) && saved >= MIN_LOG && saved <= MAX_LOG) {
			logWidth = saved;
		} else {
			logWidth = Math.max(MIN_LOG, Math.min(MAX_LOG, Math.round(window.innerWidth / 3)));
		}

		await Promise.all([
			loadAssets(),
			loadFoes(),
			loadCharacters(),
			loadEncounters(),
			loadExpeditions(),
			loadCommunities(),
			loadNpcs(),
		]);
	});

	function startResize(e: MouseEvent) {
		e.preventDefault();
		dragging = true;
		const startX     = e.clientX;
		const startWidth = logWidth;

		const onMove = (ev: MouseEvent) => {
			// Drag handle sits to the left of the log; dragging left widens the log,
			// dragging right shrinks it. The two left columns are `1fr 1fr` in
			// CSS Grid, so they re-balance automatically as the log changes.
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
	bind:this={shellEl}
	class="home-shell"
	class:home-shell--dragging={dragging}
	style:--log-width="{logWidth}px"
>
	<!-- Column 1: Characters (top) + Foes (bottom) -->
	<div class="home-col home-col--char-foe">
		<section class="home-area home-area--characters">
			<CharactersArea />
		</section>
		<section class="home-area home-area--foes">
			<FoesArea />
		</section>
	</div>

	<!-- Column 2: Expeditions (top) + Communities (bottom) -->
	<div class="home-col home-col--exp-comm">
		<section class="home-area home-area--expeditions">
			<ExpeditionsArea bind:this={expAreaRef} />
		</section>
		<section class="home-area home-area--communities">
			<CommunitiesArea />
		</section>
	</div>

	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div
		class="home-resize-handle"
		role="separator"
		aria-label="Resize log"
		aria-orientation="vertical"
		aria-valuenow={logWidth}
		aria-valuemin={MIN_LOG}
		aria-valuemax={MAX_LOG}
		onmousedown={startResize}
	></div>

	<!-- Column 3: Log. The change-theme/domain links emitted on d100 99/100
	     feature/danger rolls delegate back to ExpeditionsArea so the user
	     stays in flow — the corresponding expedition is selected and the
	     change dialog opens. -->
	<aside class="home-log">
		<LogPanel
			onChangeTheme={(id) => expAreaRef?.openChangeThemeForExp(id)}
			onChangeDomain={(id) => expAreaRef?.openChangeDomainForExp(id)}
		/>
	</aside>
</div>

<style>
	/* The shell sizes itself to the viewport; the layout's default app-main
	   padding (`0 0 4rem`) and max-width would create scrollable empty space
	   below the shell. Override globally only while this page is mounted. */
	:global(.app-main) {
		max-width: none;
		padding: 0;
	}

	.home-shell {
		display:        grid;
		/* Two 1fr columns share the space remaining after the log + resize
		   handle. Drag the handle → log changes → 1fr columns auto-rebalance. */
		grid-template-columns: 1fr 1fr 6px var(--log-width, 33vw);
		gap:            0;
		height:         calc(100vh - 52px);   /* leave room for the app-nav */
		padding:        10px;
		background:     var(--bg);
		box-sizing:     border-box;
		overflow:       hidden;               /* the page never scrolls — areas scroll internally */
	}
	/* Inner gutters so the resize handle reads as a gutter, not a wall. */
	.home-shell > .home-col:nth-of-type(1) { margin-right: 12px; }
	.home-shell > .home-col:nth-of-type(2) { margin-right: 4px; }
	.home-shell > .home-log                { margin-left:  4px; }
	.home-shell--dragging                  { cursor: col-resize; user-select: none; }
	.home-shell--dragging * {
		pointer-events: none;            /* lock UI while dragging the handle */
	}

	.home-resize-handle {
		width: 6px;
		cursor: col-resize;
		background: transparent;
		position: relative;
		transition: background 0.12s;
		z-index: 1;
	}
	.home-resize-handle::before {
		content: '';
		position: absolute;
		top: 0; bottom: 0;
		left: 50%;
		width: 1px;
		background: var(--border);
		transform: translateX(-50%);
		transition: background 0.12s, width 0.12s;
	}
	.home-resize-handle:hover::before,
	.home-shell--dragging .home-resize-handle::before {
		background: var(--text-accent);
		width: 2px;
	}

	/* Vertical column: 50/50 split of available height for its two stacked areas. */
	.home-col {
		display: grid;
		grid-template-rows: 1fr 1fr;
		gap: 10px;
		min-width: 0;
		min-height: 0;
	}

	.home-area {
		background:    var(--bg-inset);
		border:        1px solid var(--border);
		border-radius: 6px;
		overflow:      hidden;
		min-width:     0;
		min-height:    0;
		display:       flex;
		flex-direction: column;
	}

	.home-log {
		background:    var(--bg-inset);
		border:        1px solid var(--border);
		border-radius: 6px;
		overflow:      hidden;
		display:       flex;
		flex-direction: column;
	}

	/* Narrow / mobile — single-column stub. Mobile isn't fully designed yet;
	   for now hide the log + resize handle and communities, and stack the rest. */
	@media (max-width: 900px) {
		.home-shell {
			grid-template-columns: 1fr;
			height: calc(100vh - 52px);
		}
		.home-col {
			grid-template-rows: 1fr 1fr;
		}
		.home-shell > .home-col:nth-of-type(1),
		.home-shell > .home-col:nth-of-type(2) { margin-right: 0; }
		.home-log,
		.home-resize-handle {
			display: none;
		}
		.home-area { min-height: 0; }
		.home-area--communities { display: none; }
	}
</style>
