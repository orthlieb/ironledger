<script lang="ts">
	/**
	 * /home — deck-of-cards UI.
	 *
	 * Desktop: three-column grid.
	 *   ┌────────────────┬────────────────┬──────────┐
	 *   │   Characters   │   Expeditions  │          │
	 *   ├────────────────┼────────────────┤   Log    │
	 *   │     Foes       │  Communities   │          │
	 *   └────────────────┴────────────────┴──────────┘
	 *
	 * Mobile (≤900px): tab bar + active area + vertical resize + log.
	 *   ┌─────────────────────────────┐
	 *   │ [Chars][Foes][Exp][Comm]    │  ← tab bar
	 *   ├─────────────────────────────┤
	 *   │   active area (scrollable)  │
	 *   ├─────────────────────────────┤
	 *   │   ─── drag handle ──────── │
	 *   ├─────────────────────────────┤
	 *   │   log (scrollable)          │
	 *   └─────────────────────────────┘
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
	import { getActiveDiceCtx } from '$lib/diceContext.svelte.js';
	import { getActiveFoeId }   from '$lib/activeContext.svelte.js';
	import { getEncounters }    from '$lib/encounterStore.svelte.js';
	import { triggerAction }    from '$lib/log.svelte.js';
	import charactersIconSvg    from '$icons/Characters.svg?raw';
	import foesIconSvg          from '$icons/Foes.svg?raw';
	import expeditionsIconSvg   from '$icons/Expeditions.svg?raw';
	import villageIconSvg       from '$icons/village.svg?raw';

	const LOG_WIDTH_KEY      = 'il:home:logWidth';
	const MIN_LOG            = 240;
	const MAX_LOG            = 800;
	const MOB_LOG_HEIGHT_KEY = 'il:home:mobLogHeight';
	const MIN_MOB_LOG        = 80;
	const MAX_MOB_LOG_FRAC   = 0.70;

	/** Desktop: log column width in px. */
	let logWidth = $state(0);
	let dragging = $state(false);
	let shellEl  = $state<HTMLDivElement | null>(null);

	/** Mobile state. */
	type MobileTab = 'characters' | 'foes' | 'expeditions' | 'communities';
	let mobileTab    = $state<MobileTab>('characters');
	let mobLogHeight = $state(200);   // px; updated in onMount from saved pref / viewport
	let mobDragging  = $state(false);
	let isMobile     = $state(false);

	/** Ref to ExpeditionsArea — forwards log link actions. */
	let expAreaRef = $state<{
		openChangeThemeForExp(expId: string):  void;
		openChangeDomainForExp(expId: string): void;
		applyProgress(marks: number): void;
	} | null>(null);

	/** Ref to FoesArea — forwards vanquish / menace from log links. */
	let foeAreaRef = $state<{
		selectFoe(id: string): void;
		vanquishActiveFoe():   void;
		applyMenace(value: number): void;
	} | null>(null);

	/** Active dice context — provides charId + data for LogPanel's link handlers. */
	const activeDiceCtx = $derived(getActiveDiceCtx());

	/** Track mobile breakpoint reactively. */
	$effect(() => {
		const mq = window.matchMedia('(max-width: 900px)');
		isMobile = mq.matches;
		const handler = (ev: MediaQueryListEvent) => { isMobile = ev.matches; };
		mq.addEventListener('change', handler);
		return () => mq.removeEventListener('change', handler);
	});

	onMount(async () => {
		// Desktop log width
		const saved = Number(localStorage.getItem(LOG_WIDTH_KEY));
		if (Number.isFinite(saved) && saved >= MIN_LOG && saved <= MAX_LOG) {
			logWidth = saved;
		} else {
			logWidth = Math.max(MIN_LOG, Math.min(MAX_LOG, Math.round(window.innerWidth / 3)));
		}

		// Mobile log height
		const savedMob = Number(localStorage.getItem(MOB_LOG_HEIGHT_KEY));
		if (Number.isFinite(savedMob) && savedMob >= MIN_MOB_LOG) {
			mobLogHeight = savedMob;
		} else {
			mobLogHeight = Math.round(window.innerHeight * 0.25);
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

	/** Desktop horizontal resize (log width). */
	function startResize(e: MouseEvent) {
		e.preventDefault();
		dragging = true;
		const startX     = e.clientX;
		const startWidth = logWidth;

		const onMove = (ev: MouseEvent) => {
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

	/** Mobile vertical resize (log height). */
	function startMobResize(e: MouseEvent | TouchEvent) {
		e.preventDefault();
		mobDragging = true;
		const startY = 'touches' in e ? e.touches[0].clientY : e.clientY;
		const startH = mobLogHeight;

		const onMove = (ev: MouseEvent | TouchEvent) => {
			const y     = 'touches' in ev ? ev.touches[0].clientY : ev.clientY;
			const delta = startY - y;   // drag up → taller log
			const maxH  = Math.round(window.innerHeight * MAX_MOB_LOG_FRAC);
			const next  = Math.max(MIN_MOB_LOG, Math.min(maxH, startH + delta));
			mobLogHeight = next;
		};
		const onUp = () => {
			mobDragging = false;
			window.removeEventListener('mousemove', onMove as EventListener);
			window.removeEventListener('mouseup',   onUp);
			window.removeEventListener('touchmove', onMove as EventListener);
			window.removeEventListener('touchend',  onUp);
			localStorage.setItem(MOB_LOG_HEIGHT_KEY, String(mobLogHeight));
		};
		window.addEventListener('mousemove', onMove as EventListener);
		window.addEventListener('mouseup',   onUp);
		window.addEventListener('touchmove', onMove as EventListener, { passive: false });
		window.addEventListener('touchend',  onUp);
	}
</script>

<svelte:head>
	<title>Iron Ledger</title>
</svelte:head>

<div
	bind:this={shellEl}
	class="home-shell"
	class:home-shell--dragging={dragging}
	class:home-shell--mob-dragging={mobDragging}
	style:--log-width="{logWidth}px"
	style:--mob-log-height="{mobLogHeight}px"
>
	<!-- Mobile tab bar (hidden on desktop via CSS) -->
	<nav class="mob-tabbar">
		<button class="mob-tab" class:mob-tab--active={mobileTab === 'characters'}  onclick={() => mobileTab = 'characters'}>
			<span class="mob-tab-icon" aria-hidden="true">{@html charactersIconSvg}</span>Characters
		</button>
		<button class="mob-tab" class:mob-tab--active={mobileTab === 'foes'}         onclick={() => mobileTab = 'foes'}>
			<span class="mob-tab-icon" aria-hidden="true">{@html foesIconSvg}</span>Foes
		</button>
		<button class="mob-tab" class:mob-tab--active={mobileTab === 'expeditions'} onclick={() => mobileTab = 'expeditions'}>
			<span class="mob-tab-icon" aria-hidden="true">{@html expeditionsIconSvg}</span>Expeditions
		</button>
		<button class="mob-tab" class:mob-tab--active={mobileTab === 'communities'} onclick={() => mobileTab = 'communities'}>
			<span class="mob-tab-icon" aria-hidden="true">{@html villageIconSvg}</span>Communities
		</button>
	</nav>

	<!-- Column 1: Characters (top) + Foes (bottom) -->
	<div class="home-col home-col--char-foe">
		<section class="home-area home-area--characters" class:mob-hidden={mobileTab !== 'characters'}>
			<CharactersArea showTitle={!isMobile} />
		</section>
		<section class="home-area home-area--foes" class:mob-hidden={mobileTab !== 'foes'}>
			<FoesArea bind:this={foeAreaRef} showTitle={!isMobile} />
		</section>
	</div>

	<!-- Column 2: Expeditions (top) + Communities (bottom) -->
	<div class="home-col home-col--exp-comm">
		<section class="home-area home-area--expeditions" class:mob-hidden={mobileTab !== 'expeditions'}>
			<ExpeditionsArea bind:this={expAreaRef} showTitle={!isMobile} />
		</section>
		<section class="home-area home-area--communities" class:mob-hidden={mobileTab !== 'communities'}>
			<CommunitiesArea showTitle={!isMobile} />
		</section>
	</div>

	<!-- Desktop horizontal resize handle (hidden on mobile) -->
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

	<!-- Mobile vertical resize handle (hidden on desktop) -->
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div
		class="mob-resize-handle"
		role="separator"
		aria-label="Resize log"
		aria-orientation="horizontal"
		onmousedown={startMobResize}
		ontouchstart={startMobResize}
	></div>

	<!-- Log. The change-theme/domain links emitted on d100 99/100
	     feature/danger rolls delegate back to ExpeditionsArea so the user
	     stays in flow — the corresponding expedition is selected and the
	     change dialog opens. -->
	<aside class="home-log">
		<LogPanel
			ctx={activeDiceCtx}
			onMoveLink={(moveId) => document.dispatchEvent(new CustomEvent('ironledger:open-move', { detail: { id: moveId } }))}
			onOracleLink={(key, stat) => document.dispatchEvent(new CustomEvent('ironledger:open-oracle', { detail: { key, stat } }))}
			onProgressLink={(track, value) => {
				if (track === 'combat') {
					foeAreaRef?.applyMenace(value);
				} else if (track === 'journey' || track === 'delve') {
					expAreaRef?.applyProgress(value);
				}
			}}
			onInitiativeLink={(value, charId) => {
				const id = charId || activeDiceCtx?.charId;
				if (id) {
					const numVal = value === 'character' ? 1 : value === 'foe' ? 2 : 0;
					triggerAction({ charId: id, type: 'set', key: 'initiative', value: numVal });
				}
			}}
			onMenaceLink={(value) => foeAreaRef?.applyMenace(value)}
			onVanquishFoe={() => foeAreaRef?.vanquishActiveFoe()}
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

	/* ── Desktop layout ──────────────────────────────────────────────────────── */

	.home-shell {
		display:        grid;
		grid-template-columns: 1fr 1fr 6px var(--log-width, 33vw);
		gap:            0;
		height:         calc(100vh - 52px);
		padding:        10px;
		background:     var(--bg);
		box-sizing:     border-box;
		overflow:       hidden;
	}
	.home-shell > .home-col:nth-of-type(1) { margin-right: 12px; }
	.home-shell > .home-col:nth-of-type(2) { margin-right: 4px; }
	.home-shell > .home-log                { margin-left:  4px; }
	.home-shell--dragging                  { cursor: col-resize; user-select: none; }
	.home-shell--dragging *                { pointer-events: none; }
	.home-shell--mob-dragging              { cursor: row-resize; user-select: none; }
	.home-shell--mob-dragging *            { pointer-events: none; }

	/* Desktop horizontal resize handle */
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

	/* Mobile-only elements — hidden on desktop */
	.mob-tabbar      { display: none; }
	.mob-resize-handle { display: none; }

	/* ── Mobile layout (≤900px) ──────────────────────────────────────────────── */

	@media (max-width: 900px) {
		.home-shell {
			display:        flex;
			flex-direction: column;
			grid-template-columns: unset;
			height:         calc(100vh - 52px);
			padding:        0;
		}

		/* Columns become transparent — sections flow directly into the flex shell */
		.home-col {
			display: contents;
		}

		/* Desktop gutters and resize handle invisible on mobile */
		.home-shell > .home-col:nth-of-type(1),
		.home-shell > .home-col:nth-of-type(2) { margin-right: 0; }
		.home-shell > .home-log                { margin-left:  0; }
		.home-resize-handle                    { display: none; }

		/* Tab bar */
		.mob-tabbar {
			display:      flex;
			flex-shrink:  0;
			background:   var(--bg-control);
			border-bottom: 1px solid var(--border);
		}
		.mob-tab {
			flex:           1;
			padding:        7px 4px;
			display:        flex;
			flex-direction: column;
			align-items:    center;
			gap:            3px;
			font-family:    var(--font-ui);
			font-size:      0.6rem;
			font-weight:    600;
			text-transform: uppercase;
			letter-spacing: 0.04em;
			color:          var(--text-muted);
			background:     transparent;
			border:         none;
			border-bottom:  2px solid transparent;
			cursor:         pointer;
			transition:     color 0.1s, border-color 0.1s;
		}
		.mob-tab--active {
			color:               var(--text-accent);
			border-bottom-color: var(--text-accent);
		}
		.mob-tab-icon {
			display:     flex;
			width:       18px;
			height:      18px;
			flex-shrink: 0;
		}
		.mob-tab-icon :global(svg) {
			width:  100% !important;
			height: 100% !important;
		}
		.mob-tab-icon :global(svg path) { fill: currentColor; }

		/* Areas fill the remaining flex space */
		.home-area {
			flex:          1;
			min-height:    0;
			border-radius: 0;
			border:        none;
			border-top:    1px solid var(--border);
		}
		/* Non-active tabs hidden */
		.home-area.mob-hidden { display: none; }

		/* Mobile vertical resize handle */
		.mob-resize-handle {
			display:    block;
			flex-shrink: 0;
			height:     10px;
			cursor:     row-resize;
			background: transparent;
			position:   relative;
			z-index:    1;
		}
		.mob-resize-handle::before {
			content:  '';
			position: absolute;
			left: 0; right: 0;
			top:    50%;
			height: 1px;
			background: var(--border);
			transform: translateY(-50%);
			transition: background 0.12s, height 0.12s;
		}
		.mob-resize-handle:hover::before,
		.home-shell--mob-dragging .mob-resize-handle::before {
			background: var(--text-accent);
			height: 2px;
		}

		/* Log at bottom */
		.home-log {
			height:        var(--mob-log-height, 25vh);
			flex:          none;
			min-height:    0;
			border-radius: 0;
			border:        none;
			border-top:    1px solid var(--border);
			margin-left:   0;
		}
	}
</style>
