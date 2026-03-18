<script lang="ts">
	/**
	 * MovesDialog — browse, filter, and roll Ironsworn moves.
	 *
	 * Two internal views:
	 *   picker — searchable, filterable tile grid of all moves
	 *   detail — trigger text, stat selection, adds, Roll button
	 *
	 * Usage:
	 *   <MovesDialog bind:this={ref} ctx={diceCtx} pctx={preconditionCtx} />
	 *   ref.open()          // opens picker
	 *   ref.open('move/id') // opens detail for a specific move
	 */

	import type { MoveDefinition } from '@ironledger/shared';
	import type { DiceCtx } from '$lib/diceContext.svelte.js';
	import type { PreconditionContext } from '$lib/preconditions.js';
	import {
		loadMoves,
		getMoves,
		getMoveCategories,
		findMove,
		isProgressMove,
		isNoRollMove,
		hasRollableStats,
	} from '$lib/moveStore.svelte.js';
	import { firstPreconditionFailure } from '$lib/preconditions.js';
	import { appendLog, enrichOutcomeLinks, SESSION_LOG_ID } from '$lib/log.svelte.js';
	import { rollDie, animateDice } from '$lib/dice.js';

	import clearFiltersSvg from '$lib/icons/filter-circle-xmark-solid-full.svg?raw';
	import diceD6Svg  from '$icons/dice-d6-light.svg?raw';
	import diceD10Svg from '$icons/dice-d10-light.svg?raw';
	import { draggable } from '$lib/actions/draggable.js';

	// ---------------------------------------------------------------------------
	// Props
	// ---------------------------------------------------------------------------
	let {
		ctx  = null,
		pctx = {},
		onInitiativeChange,
	}: {
		ctx:  DiceCtx | null;
		pctx: PreconditionContext;
		onInitiativeChange?: (value: 'character' | 'foe') => void;
	} = $props();

	// ---------------------------------------------------------------------------
	// Internal state
	// ---------------------------------------------------------------------------
	let dialogEl         = $state<HTMLDialogElement | null>(null);
	let view             = $state<'picker' | 'detail'>('picker');
	let selectedId       = $state<string | null>(null);
	let search           = $state('');
	let activeCategories = $state(new Set<string>());
	let rolling          = $state(false);
	let hideDisabled     = $state(false);

	// Detail view state
	let selectedStat     = $state('');
	let adds             = $state(0);
	let progressValue    = $state(0);

	// ---------------------------------------------------------------------------
	// Derived
	// ---------------------------------------------------------------------------
	const moves      = $derived(getMoves());
	const categories = $derived(getMoveCategories());
	const selectedMove = $derived(
		selectedId ? findMove(selectedId) ?? null : null,
	);

	const filteredMoves = $derived(() => {
		const q = search.trim().toLowerCase();
		return moves.filter((m) => {
			const catMatch  = activeCategories.size === 0 || activeCategories.has(m.category);
			const textMatch = !q
				|| m.name.toLowerCase().includes(q)
				|| m.triggerShort.toLowerCase().includes(q);
			return catMatch && textMatch;
		});
	});

	// ---------------------------------------------------------------------------
	// Category colours
	// ---------------------------------------------------------------------------
	const CATEGORY_COLORS: Record<string, string> = {
		'Adventure':    'var(--color-wits)',
		'Relationship': 'var(--color-heart)',
		'Combat':       'var(--color-iron)',
		'Suffer':       'var(--color-danger, #ef4444)',
		'Quest':        'var(--color-momentum)',
		'Fate':         'var(--color-spirit)',
		'Delve':        'var(--color-shadow)',
		'Rarity':       'var(--color-touched)',
		'Failure':      'var(--text-dimmer)',
		'Yrt':          'var(--color-touched)',
	};

	function catColor(cat: string): string {
		return CATEGORY_COLORS[cat] ?? 'var(--text-accent)';
	}

	// ---------------------------------------------------------------------------
	// Stat definitions (for display)
	// ---------------------------------------------------------------------------
	const STAT_COLORS: Record<string, string> = {
		edge:     'var(--color-edge)',
		heart:    'var(--color-heart)',
		iron:     'var(--color-iron)',
		shadow:   'var(--color-shadow)',
		wits:     'var(--color-wits)',
		health:   'var(--color-heart)',
		spirit:   'var(--color-spirit)',
		supply:   'var(--color-supply, #34d399)',
		mana:     'var(--color-touched)',
	};

	function statColor(stat: string): string {
		return STAT_COLORS[stat] ?? 'var(--text-accent)';
	}

	function statValue(stat: string): number | string {
		if (!ctx) return '—';
		return (ctx.data as Record<string, unknown>)[stat] as number ?? 0;
	}

	// ---------------------------------------------------------------------------
	// Precondition check
	// ---------------------------------------------------------------------------
	function moveFailReason(m: MoveDefinition): string | null {
		if (!ctx) {
			return m.preconditions?.length ? 'No character selected' : null;
		}
		return firstPreconditionFailure(
			m.preconditions as import('$lib/preconditions.js').Precondition[] | undefined,
			ctx.data,
			pctx,
		);
	}

	// ---------------------------------------------------------------------------
	// Outcome helpers
	// ---------------------------------------------------------------------------
	function outcomeClass(hits1: boolean, hits2: boolean): string {
		if (hits1 && hits2) return 'roll-outcome-strong';
		if (hits1 || hits2) return 'roll-outcome-weak';
		return 'roll-outcome-miss';
	}
	function outcomeLabel(hits1: boolean, hits2: boolean): string {
		if (hits1 && hits2) return 'Strong Hit';
		if (hits1 || hits2) return 'Weak Hit';
		return 'Miss';
	}

	function logTitle(label: string): string {
		return ctx ? `${ctx.charName} \u2014 ${label}` : label;
	}

	function getOutcomeHtml(m: MoveDefinition, hits1: boolean, hits2: boolean): string {
		if (hits1 && hits2) return m.strong ?? '';
		if (hits1 || hits2) return m.weak ?? '';
		return m.miss ?? '';
	}

	// Resolve <a class="harm-link"> placeholders to concrete resource-links.
	// Must be called before enrichOutcomeLinks so the stamping pass picks up the
	// resolved resource-link class. Falls back to plain text if no foe harm is known.
	function resolveHarmLinks(html: string): string {
		const harm = pctx.foeHarm;
		const harmRe = /<a class="harm-link" data-resource="health">-harm health<\/a>/g;
		if (harm) {
			return html.replace(
				harmRe,
				`<a class="resource-link" data-resource="health" data-value="-${harm}">-${harm} health</a>`,
			);
		}
		// No active foe harm — strip to plain text so the link doesn't appear broken
		return html.replace(harmRe, '-harm health');
	}

	// ---------------------------------------------------------------------------
	// Public API
	// ---------------------------------------------------------------------------
	export function open(moveId?: string) {
		if (moveId) {
			selectedId = moveId;
			view       = 'detail';
		} else {
			view       = 'picker';
			selectedId = null;
		}
		search           = '';
		activeCategories = new Set();
		adds             = 0;
		progressValue    = 0;
		loadMoves();
		dialogEl?.showModal();
	}

	export function close() {
		dialogEl?.close();
	}

	// ---------------------------------------------------------------------------
	// Navigation
	// ---------------------------------------------------------------------------
	function selectMove(m: MoveDefinition) {
		selectedId   = m.id;
		view         = 'detail';
		adds         = 0;
		progressValue = 0;
		// Auto-select first stat
		if (m.stats && m.stats.length > 0) {
			selectedStat = m.stats[0].stat;
		} else {
			selectedStat = '';
		}
	}

	function backToPicker() {
		view = 'picker';
	}

	/** Click delegation for move-link navigation inside detail view. */
	function handleDetailClick(e: MouseEvent) {
		const link = (e.target as HTMLElement).closest('.move-link') as HTMLElement | null;
		if (!link) return;
		e.preventDefault();
		const moveId = link.dataset['id'];
		if (moveId) {
			const target = findMove(moveId);
			if (target) selectMove(target);
		}
	}

	// ---------------------------------------------------------------------------
	// Helpers
	// ---------------------------------------------------------------------------
	function toggleCategory(cat: string) {
		const next = new Set(activeCategories);
		if (next.has(cat)) next.delete(cat);
		else               next.add(cat);
		activeCategories = next;
	}

	function clearFilters() {
		search           = '';
		activeCategories = new Set();
	}

	/** Group filtered moves by category, optionally hiding disabled ones. */
	function movesByCategory(cat: string): MoveDefinition[] {
		return filteredMoves().filter((m) => {
			if (m.category !== cat) return false;
			if (hideDisabled && moveFailReason(m)) return false;
			return true;
		});
	}

	// ---------------------------------------------------------------------------
	// Action Roll (1d6 + stat + adds vs 2d10)
	// ---------------------------------------------------------------------------
	async function doActionRoll() {
		if (rolling || !ctx || !selectedMove) return;
		rolling = true;

		const stat    = selectedStat;
		const sVal    = (ctx.data as Record<string, number>)[stat] ?? 0;
		const aDie    = rollDie(6);
		const c1      = rollDie(10);
		const c2      = rollDie(10);
		const mom     = ctx.data.momentum;

		// Momentum cancellation
		const cancelled = mom < 0 && Math.abs(mom) === aDie;
		const effective = cancelled ? 0 : aDie;
		const total     = effective + sVal + adds;

		const hits1   = total > c1;
		const hits2   = total > c2;
		const isMatch = c1 === c2;

		// Enter the Fray — default foe initiative so outcome links can flip it
		if (selectedMove.id === 'move/enter-the-fray') {
			onInitiativeChange?.('foe');
		}

		// Pre-generate entry id for link enrichment
		const entryId = crypto.randomUUID();

		// Build log HTML
		const parts: string[] = [];
		if (cancelled) {
			parts.push(
				`<div class="roll-cancel">Momentum cancel! Momentum is ${mom}, ` +
				`action die ${aDie} \u2192 0.</div>`,
			);
		}

		const dieStr  = cancelled ? `<s>${aDie}</s>&thinsp;0` : `${aDie}`;
		const addsStr = adds !== 0
			? ` + adds[${adds > 0 ? '+' : ''}${adds}]`
			: '';
		const statLabel = stat.charAt(0).toUpperCase() + stat.slice(1);

		parts.push(
			`<div class="roll-line">` +
			`1d6 [${dieStr}] + ${statLabel.toLowerCase()}[${sVal}]${addsStr}` +
			` = <strong>${total}</strong> vs 2d10 [${c1}] [${c2}]` +
			`</div>`,
		);

		const matchSpan = isMatch ? ' <span class="roll-match">with a match!</span>' : '';
		parts.push(
			`<div class="${outcomeClass(hits1, hits2)}">` +
			`<strong>${outcomeLabel(hits1, hits2)}</strong>${matchSpan}` +
			`</div>`,
		);

		let outcomeHtml = getOutcomeHtml(selectedMove, hits1, hits2);
		if (outcomeHtml) {
			outcomeHtml = resolveHarmLinks(outcomeHtml);
			outcomeHtml = enrichOutcomeLinks(outcomeHtml, entryId, ctx.charId);
			parts.push(`<div class="move-outcome">${outcomeHtml}</div>`);
		}

		const html = parts.join('');

		close();
		await animateDice([
			{ sides: 6,  value: aDie },
			{ sides: 10, value: c1   },
			{ sides: 10, value: c2   },
		]);
		appendLog(SESSION_LOG_ID, logTitle(`${selectedMove.name} (${statLabel})`), html, entryId, undefined, {
			moveId: selectedMove.id,
			actionScore: total,
			c1, c2,
			charId: ctx.charId,
		});
		rolling = false;
	}

	// ---------------------------------------------------------------------------
	// Progress Roll (progress score vs 2d10)
	// ---------------------------------------------------------------------------
	async function doProgressRoll() {
		if (rolling || !selectedMove) return;
		rolling = true;

		const c1    = rollDie(10);
		const c2    = rollDie(10);
		const hits1 = progressValue > c1;
		const hits2 = progressValue > c2;
		const isMatch = c1 === c2;

		// Pre-generate entry id for link enrichment
		const entryId = crypto.randomUUID();
		const charId  = ctx?.charId ?? '';

		const parts: string[] = [];
		parts.push(
			`<div class="roll-line">` +
			`Progress [<strong>${progressValue}</strong>] vs 2d10 [${c1}] [${c2}]` +
			`</div>`,
		);

		const matchSpan = isMatch ? ' <span class="roll-match">with a match!</span>' : '';
		parts.push(
			`<div class="${outcomeClass(hits1, hits2)}">` +
			`<strong>${outcomeLabel(hits1, hits2)}</strong>${matchSpan}` +
			`</div>`,
		);

		let outcomeHtml = getOutcomeHtml(selectedMove, hits1, hits2);
		if (outcomeHtml) {
			outcomeHtml = resolveHarmLinks(outcomeHtml);
			if (charId) outcomeHtml = enrichOutcomeLinks(outcomeHtml, entryId, charId);
			parts.push(`<div class="move-outcome">${outcomeHtml}</div>`);
		}

		const html = parts.join('');

		close();
		await animateDice([
			{ sides: 10, value: c1 },
			{ sides: 10, value: c2 },
		]);
		appendLog(SESSION_LOG_ID, logTitle(selectedMove.name), html, entryId);
		rolling = false;
	}

	// Auto-select first stat when move changes
	$effect(() => {
		if (selectedMove?.stats?.length) {
			selectedStat = selectedMove.stats[0].stat;
		}
	});
</script>

<!-- =========================================================================
     Dialog
     ========================================================================= -->
<dialog
	bind:this={dialogEl}
	class="moves-dialog"
	oncancel={close}
>

{#if view === 'picker'}

	<!-- ── Picker view ────────────────────────────────────────────────────── -->

	<div class="md-header" use:draggable>
		<span class="md-title">Moves</span>
		<button class="md-close" onclick={close} aria-label="Close">✕</button>
	</div>

	<!-- Controls -->
	<div class="md-controls">
		<div class="md-search-row">
			<input
				class="md-search"
				type="search"
				placeholder="Search moves…"
				bind:value={search}
				aria-label="Search moves"
			/>
			<button
				class="md-clear-btn"
				title="Clear all filters"
				onclick={clearFilters}
				aria-label="Clear all filters"
			>{@html clearFiltersSvg}</button>
			<button
				class="md-hide-disabled-btn"
				class:md-hide-disabled-btn--active={hideDisabled}
				title={hideDisabled ? 'Show all moves' : 'Hide unavailable moves'}
				onclick={() => (hideDisabled = !hideDisabled)}
				aria-label={hideDisabled ? 'Show all moves' : 'Hide unavailable moves'}
			>
				{#if hideDisabled}
					<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/></svg>
				{:else}
					<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
				{/if}
			</button>
		</div>

		<div class="md-cat-filters">
			{#each categories as cat (cat)}
				<button
					class="md-cat-tag"
					class:md-cat-tag--active={activeCategories.has(cat)}
					style:--ccolor={catColor(cat)}
					onclick={() => toggleCategory(cat)}
				>{cat}</button>
			{/each}
		</div>
	</div>

	<!-- Tile grid grouped by category -->
	<div class="md-body">
		{#if moves.length === 0}
			<div class="md-loading">Loading moves…</div>
		{:else}
			{@const list = filteredMoves()}
			{#if list.length === 0}
				<div class="md-empty">No moves match.</div>
			{:else}
				{#each categories as cat (cat)}
					{@const catMoves = movesByCategory(cat)}
					{#if catMoves.length > 0}
						<div class="md-category-header" style:--ccolor={catColor(cat)}>{cat}</div>
						<div class="md-grid">
							{#each catMoves as move (move.id)}
								{@const fail = moveFailReason(move)}
								<button
									class="md-tile"
									class:md-tile--dimmed={!!fail}
									style:--tcolor={catColor(move.category)}
									title={fail ?? move.triggerShort}
									onclick={() => { if (!fail) selectMove(move); }}
								disabled={!!fail}
								>
									<div class="md-tile-stripe"></div>
									<div class="md-tile-body">
										<div class="md-tile-name">{move.name}</div>
										<div class="md-tile-desc">{move.triggerShort}</div>
									</div>
								</button>
							{/each}
						</div>
					{/if}
				{/each}
			{/if}
		{/if}
	</div>

{:else if view === 'detail' && selectedMove}

	<!-- ── Detail view ───────────────────────────────────────────────────── -->

	<div class="md-header md-header--detail" use:draggable>
		<button class="md-back-btn" onclick={backToPicker}>← Back</button>
		<span class="md-title md-title--detail">{selectedMove.name}</span>
		<span class="md-category-badge" style:--ccolor={catColor(selectedMove.category)}>
			{selectedMove.category}
		</span>
		<button class="md-close" onclick={close} aria-label="Close">✕</button>
	</div>

	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div class="md-body md-body--detail" role="region" onclick={handleDetailClick}>
		<!-- Trigger text -->
		<div class="md-trigger">
			{@html (selectedMove as Record<string, unknown>).triggerPreamble as string ?? selectedMove.trigger}
		</div>

		<!-- ── Standard action move ── -->
		{#if hasRollableStats(selectedMove)}
			{@const fail = moveFailReason(selectedMove)}

			<!-- Stat picker -->
			{#if selectedMove.stats && selectedMove.stats.length > 0}
				<div class="md-stat-list">
					{#each selectedMove.stats as s (s.stat)}
						<button
							class="md-stat-row-btn"
							class:selected={selectedStat === s.stat}
							style:--scolor={statColor(s.stat)}
							onclick={() => (selectedStat = s.stat)}
							disabled={rolling || !ctx}
						>
							<span class="md-stat-check" aria-hidden="true">{selectedStat === s.stat ? '✔' : ''}</span>
							<span class="md-sdesc">{s.desc}</span>
							<span class="md-stat-chip" style:--scolor={statColor(s.stat)}>
								<span class="md-sname">{s.stat}</span>
								<span class="md-sval">+{statValue(s.stat)}</span>
							</span>
						</button>
					{/each}
				</div>
			{/if}

			<!-- ── Outcomes ── -->
			{#if selectedMove.strong || selectedMove.weak || selectedMove.miss}
				<div class="md-outcomes">
					{#if selectedMove.strong}
						<div class="md-outcome-section" style:--outcome-color="var(--color-success, #34d399)">
							<div class="md-outcome-label md-outcome-strong">Strong Hit</div>
							<div class="md-outcome-text">{@html selectedMove.strong}</div>
						</div>
					{/if}
					{#if selectedMove.weak}
						<div class="md-outcome-section" style:--outcome-color="var(--color-momentum, #60a5fa)">
							<div class="md-outcome-label md-outcome-weak">Weak Hit</div>
							<div class="md-outcome-text">{@html selectedMove.weak}</div>
						</div>
					{/if}
					{#if selectedMove.miss}
						<div class="md-outcome-section" style:--outcome-color="var(--color-danger, #ef4444)">
							<div class="md-outcome-label md-outcome-miss">Miss</div>
							<div class="md-outcome-text">{@html selectedMove.miss}</div>
						</div>
					{/if}
				</div>
			{/if}

			<!-- Adds + Roll button -->
			<div class="md-action-row">
				<div class="md-adds-row">
					<span class="md-adds-label">Adds</span>
					<button
						class="md-adj"
						onclick={() => (adds = Math.max(-5, adds - 1))}
						disabled={rolling || !ctx || adds <= -5}
						aria-label="Decrease adds"
					>−</button>
					<span
						class="md-adds-val"
						class:positive={adds > 0}
						class:negative={adds < 0}
					>{adds >= 0 ? '+' : ''}{adds}</span>
					<button
						class="md-adj"
						onclick={() => (adds = Math.min(5, adds + 1))}
						disabled={rolling || !ctx || adds >= 5}
						aria-label="Increase adds"
					>+</button>
				</div>

				<button
					class="btn btn-primary md-roll-btn"
					onclick={doActionRoll}
					disabled={rolling || !ctx || !!fail}
					title={fail ?? ''}
				>
					<span class="md-roll-dice" aria-hidden="true">
						<span class="md-roll-die md-roll-die--d6">{@html diceD6Svg}</span>
						<span class="md-roll-die md-roll-die--d10">{@html diceD10Svg}</span>
						<span class="md-roll-die md-roll-die--d10">{@html diceD10Svg}</span>
					</span>
					{rolling ? 'Rolling…' : 'Roll Move'}
				</button>
			</div>

		<!-- ── Progress move ── -->
		{:else if isProgressMove(selectedMove)}
			<div class="md-progress-row">
				<span class="md-progress-label">
					Progress ({(selectedMove as Record<string, unknown>).progressTrack as string})
				</span>
				<button
					class="md-adj"
					onclick={() => (progressValue = Math.max(0, progressValue - 1))}
					disabled={rolling || progressValue <= 0}
					aria-label="Decrease progress"
				>−</button>
				<span class="md-progress-val">{progressValue}</span>
				<button
					class="md-adj"
					onclick={() => (progressValue = Math.min(10, progressValue + 1))}
					disabled={rolling || progressValue >= 10}
					aria-label="Increase progress"
				>+</button>
			</div>

			<!-- ── Outcomes ── -->
			{#if selectedMove.strong || selectedMove.weak || selectedMove.miss}
				<div class="md-outcomes">
					{#if selectedMove.strong}
						<div class="md-outcome-section" style:--outcome-color="var(--color-success, #34d399)">
							<div class="md-outcome-label md-outcome-strong">Strong Hit</div>
							<div class="md-outcome-text">{@html selectedMove.strong}</div>
						</div>
					{/if}
					{#if selectedMove.weak}
						<div class="md-outcome-section" style:--outcome-color="var(--color-momentum, #60a5fa)">
							<div class="md-outcome-label md-outcome-weak">Weak Hit</div>
							<div class="md-outcome-text">{@html selectedMove.weak}</div>
						</div>
					{/if}
					{#if selectedMove.miss}
						<div class="md-outcome-section" style:--outcome-color="var(--color-danger, #ef4444)">
							<div class="md-outcome-label md-outcome-miss">Miss</div>
							<div class="md-outcome-text">{@html selectedMove.miss}</div>
						</div>
					{/if}
				</div>
			{/if}

			<button
				class="btn btn-primary md-roll-btn md-roll-btn--full"
				onclick={doProgressRoll}
				disabled={rolling}
			>{rolling ? 'Rolling…' : 'Roll Progress'}</button>

		<!-- ── No-roll move (no controls needed) ── -->
		{:else if isNoRollMove(selectedMove)}
			<!-- ── Outcomes ── -->
			{#if selectedMove.strong || selectedMove.weak || selectedMove.miss}
				<div class="md-outcomes">
					{#if selectedMove.strong}
						<div class="md-outcome-section" style:--outcome-color="var(--color-success, #34d399)">
							<div class="md-outcome-label md-outcome-strong">Strong Hit</div>
							<div class="md-outcome-text">{@html selectedMove.strong}</div>
						</div>
					{/if}
					{#if selectedMove.weak}
						<div class="md-outcome-section" style:--outcome-color="var(--color-momentum, #60a5fa)">
							<div class="md-outcome-label md-outcome-weak">Weak Hit</div>
							<div class="md-outcome-text">{@html selectedMove.weak}</div>
						</div>
					{/if}
					{#if selectedMove.miss}
						<div class="md-outcome-section" style:--outcome-color="var(--color-danger, #ef4444)">
							<div class="md-outcome-label md-outcome-miss">Miss</div>
							<div class="md-outcome-text">{@html selectedMove.miss}</div>
						</div>
					{/if}
				</div>
			{/if}
		{/if}



		<!-- Notes -->
		{#if selectedMove.notes}
			<div class="md-notes">
				<div class="md-notes-text">{selectedMove.notes}</div>
			</div>
		{/if}
	</div>

{/if}

</dialog>

<style>
	/* ── Dialog shell ────────────────────────────────────────────────────── */
	.moves-dialog {
		border:        none;
		padding:       0;
		border-radius: 10px;
		position:      fixed;
		top:           8vh;
		left:          50%;
		transform:     translateX(-50%);
		width:         min(640px, calc(100vw - 2rem));
		max-height:    min(700px, calc(100dvh - 10vh));
		background:    var(--bg-card);
		color:         var(--text);
		box-shadow:    0 16px 48px #00000070, 0 0 0 1px var(--border-mid);
		outline:       none;
		overflow:      hidden;
	}
	.moves-dialog[open] {
		display:        flex;
		flex-direction: column;
	}
	.moves-dialog::backdrop {
		background:      #00000060;
		backdrop-filter: blur(1px);
	}

	/* ── Header ─────────────────────────────────────────────────────────── */
	.md-header {
		display:       flex;
		align-items:   center;
		gap:           8px;
		padding:       10px 14px;
		border-bottom: 1px solid var(--border);
		background:    var(--bg-control);
		border-radius: 10px 10px 0 0;
		flex-shrink:   0;
	}
	.md-header--detail { flex-wrap: nowrap; }
	.md-title {
		font-family:    var(--font-display);
		font-size:      0.78rem;
		font-weight:    700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color:          var(--text-accent);
		flex:           1;
	}
	.md-title--detail {
		font-size:     0.72rem;
		overflow:      hidden;
		text-overflow: ellipsis;
		white-space:   nowrap;
	}
	.md-close {
		background:    transparent;
		border:        none;
		color:         var(--text-dimmer);
		cursor:        pointer;
		font-size:     0.9rem;
		padding:       2px 5px;
		border-radius: 3px;
		line-height:   1;
		font-family:   inherit;
		flex-shrink:   0;
	}
	.md-close:hover { color: var(--text); }

	.md-back-btn {
		font-family:   var(--font-ui);
		font-size:     0.7rem;
		font-weight:   600;
		color:         var(--text-dimmer);
		background:    transparent;
		border:        1px solid var(--border);
		border-radius: 4px;
		padding:       3px 8px;
		cursor:        pointer;
		flex-shrink:   0;
		white-space:   nowrap;
	}
	.md-back-btn:hover { color: var(--text); border-color: var(--border-mid); }

	.md-category-badge {
		font-family:    var(--font-ui);
		font-size:      0.58rem;
		font-weight:    600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color:          var(--ccolor, var(--text-dimmer));
		border:         1px solid color-mix(in srgb, var(--ccolor, var(--border)) 40%, transparent);
		border-radius:  3px;
		padding:        2px 6px;
		flex-shrink:    0;
		white-space:    nowrap;
	}

	/* ── Controls (search + category tags) ─────────────────────────────── */
	.md-controls {
		padding:        8px 14px 6px;
		border-bottom:  1px solid var(--border);
		flex-shrink:    0;
		display:        flex;
		flex-direction: column;
		gap:            6px;
	}
	.md-search-row {
		display:     flex;
		align-items: center;
		gap:         6px;
	}
	.md-search {
		flex:          1;
		font-family:   var(--font-ui);
		font-size:     0.78rem;
		color:         var(--text);
		background:    var(--bg-inset);
		border:        1px solid var(--border);
		border-radius: 4px;
		padding:       5px 8px;
		min-width:     0;
	}
	.md-search:focus {
		outline:      none;
		border-color: var(--focus-ring);
		box-shadow:   0 0 0 2px var(--accent-glow);
	}
	.md-clear-btn {
		background:    transparent;
		border:        none;
		color:         var(--text-dimmer);
		cursor:        pointer;
		padding:       3px 5px;
		border-radius: 3px;
		display:       flex;
		align-items:   center;
		flex-shrink:   0;
	}
	.md-clear-btn:hover { color: var(--text); }
	.md-clear-btn :global(svg) {
		width:  18px;
		height: 18px;
		fill:   currentColor;
	}

	.md-hide-disabled-btn {
		background:    transparent;
		border:        1px solid transparent;
		color:         var(--text-dimmer);
		cursor:        pointer;
		padding:       3px 5px;
		border-radius: 3px;
		display:       flex;
		align-items:   center;
		flex-shrink:   0;
		transition:    color 0.15s, border-color 0.15s;
	}
	.md-hide-disabled-btn:hover {
		color: var(--text);
		border-color: var(--border-mid);
	}
	.md-hide-disabled-btn--active {
		color: var(--text-accent);
	}

	.md-cat-filters {
		display:   flex;
		flex-wrap: wrap;
		gap:       4px;
	}
	.md-cat-tag {
		font-family:    var(--font-ui);
		font-size:      0.65rem;
		font-weight:    600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color:          var(--ccolor, var(--text-dimmer));
		background:     transparent;
		border:         1px solid color-mix(in srgb, var(--ccolor, var(--border)) 40%, transparent);
		border-radius:  3px;
		padding:        2px 8px;
		cursor:         pointer;
		white-space:    nowrap;
		transition:     background 0.12s, color 0.12s;
	}
	.md-cat-tag:hover {
		background: color-mix(in srgb, var(--ccolor, var(--border)) 12%, transparent);
	}
	.md-cat-tag--active {
		background:   color-mix(in srgb, var(--ccolor, var(--border)) 18%, transparent);
		border-color: var(--ccolor, var(--border));
	}

	/* ── Scrollable body ─────────────────────────────────────────────────── */
	.md-body {
		flex:       1;
		overflow-y: auto;
		padding:    10px 14px;
		min-height: 0;
	}
	.md-body--detail {
		display:        flex;
		flex-direction: column;
		gap:            10px;
	}

	.md-loading,
	.md-empty {
		font-family: var(--font-ui);
		font-size:   0.78rem;
		color:       var(--text-dimmer);
		text-align:  center;
		padding:     2rem 1rem;
	}

	/* ── Category headers ───────────────────────────────────────────────── */
	.md-category-header {
		font-family:    var(--font-ui);
		font-size:      0.62rem;
		font-weight:    700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color:          var(--ccolor, var(--text-dimmer));
		padding:        10px 0 4px;
	}
	.md-category-header:first-child { padding-top: 0; }

	/* ── Tile grid ───────────────────────────────────────────────────────── */
	.md-grid {
		display:               grid;
		grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
		gap:                   6px;
		margin-bottom:         4px;
	}
	.md-tile {
		display:        flex;
		flex-direction: row;
		align-items:    stretch;
		text-align:     left;
		background:     var(--bg-control);
		border:         1px solid var(--border);
		border-radius:  6px;
		overflow:       hidden;
		cursor:         pointer;
		padding:        0;
		color:          var(--text);
		font-family:    var(--font-ui);
		transition:     background 0.12s, border-color 0.12s;
	}
	.md-tile:hover {
		background:   var(--bg-hover);
		border-color: var(--tcolor, var(--border-mid));
	}
	.md-tile--dimmed,
	.md-tile:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
	.md-tile--dimmed:hover:not(:disabled) { opacity: 0.65; }

	.md-tile-stripe {
		width:       4px;
		flex-shrink: 0;
		background:  var(--tcolor, var(--text-accent));
	}
	.md-tile-body {
		padding:   6px 8px;
		flex:      1;
		min-width: 0;
	}
	.md-tile-name {
		font-size:   0.72rem;
		font-weight: 700;
		line-height: 1.2;
		color:       var(--text);
		margin-bottom: 2px;
	}
	.md-tile-desc {
		font-size:   0.62rem;
		color:       var(--text-dimmer);
		line-height: 1.3;
		display:            -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow:           hidden;
	}

	/* ── Detail view ─────────────────────────────────────────────────────── */
	.md-trigger {
		font-family: var(--font-ui);
		font-size:   0.78rem;
		color:       var(--text-muted);
		line-height: 1.5;
	}
	.md-trigger :global(strong) { color: var(--text); font-weight: 600; }
	.md-trigger :global(a) { cursor: pointer; color: var(--text-accent); }
	.md-trigger :global(ul) { margin: 4px 0; padding-left: 1.3em; }
	.md-trigger :global(li) { margin-bottom: 2px; }

	/* ── Stat picker ─────────────────────────────────────────────────────── */
	.md-stat-list {
		display:        flex;
		flex-direction: column;
		gap:            3px;
	}
	.md-stat-row-btn {
		display:       flex;
		align-items:   center;
		gap:           8px;
		padding:       5px 8px;
		background:    var(--bg-control);
		border:        1px solid var(--border);
		border-radius: 5px;
		cursor:        pointer;
		color:         var(--text-muted);
		font-family:   var(--font-ui);
		transition:    background 0.12s, border-color 0.12s;
		text-align:    left;
	}
	.md-stat-row-btn:hover:not(:disabled):not(.selected) {
		background:   var(--bg-hover);
		border-color: var(--border-mid);
	}
	.md-stat-row-btn.selected {
		background:   color-mix(in srgb, var(--scolor) 10%, var(--bg-control));
		border-color: var(--scolor);
	}
	.md-stat-row-btn:disabled { opacity: 0.4; cursor: not-allowed; }

	.md-stat-check {
		width:          16px;
		flex-shrink:    0;
		font-size:      0.7rem;
		color:          var(--scolor);
		text-align:     center;
	}

	.md-sdesc {
		flex:        1;
		font-family: var(--font-ui);
		font-size:   0.78rem;
		color:       var(--text-muted);
		line-height: 1.3;
	}

	.md-stat-chip {
		display:         flex;
		align-items:     center;
		justify-content: center;
		gap:             4px;
		min-width:       80px;
		padding:         2px 8px;
		border-radius:   4px;
		background:      color-mix(in srgb, var(--scolor) 12%, var(--bg-control));
		border:          1px solid color-mix(in srgb, var(--scolor) 30%, transparent);
		color:           var(--scolor);
		flex-shrink:     0;
	}
	.md-sname {
		font-size:       0.58rem;
		letter-spacing:  0.05em;
		text-transform:  uppercase;
		line-height:     1;
	}
	.md-sval {
		font-size:   0.85rem;
		font-weight: 700;
		line-height: 1;
	}

	/* ── Action row (adds + roll button) ─────────────────────────────────── */
	.md-action-row {
		display:     flex;
		align-items: center;
		gap:         12px;
	}
	.md-adds-row {
		display:     flex;
		align-items: center;
		gap:         6px;
	}
	.md-adds-label {
		font-family: var(--font-ui);
		font-size:   0.75rem;
		color:       var(--text-muted);
		min-width:   28px;
	}
	.md-adj {
		width:           22px;
		height:          22px;
		padding:         0;
		display:         flex;
		align-items:     center;
		justify-content: center;
		background:      var(--bg);
		border:          1px solid var(--border);
		border-radius:   3px;
		cursor:          pointer;
		font-size:       0.9rem;
		font-family:     var(--font-ui);
		color:           var(--text);
		line-height:     1;
	}
	.md-adj:disabled { opacity: 0.35; cursor: not-allowed; }
	.md-adj:not(:disabled):hover { background: var(--bg-hover); border-color: var(--border-mid); }

	.md-adds-val {
		min-width:            28px;
		text-align:           center;
		font-family:          var(--font-ui);
		font-size:            0.9rem;
		font-weight:          700;
		font-variant-numeric: tabular-nums;
		color:                var(--text);
	}
	.md-adds-val.positive { color: var(--color-success); }
	.md-adds-val.negative { color: var(--color-danger); }


	/* ── Progress row ────────────────────────────────────────────────────── */
	.md-progress-row {
		display:     flex;
		align-items: center;
		gap:         6px;
	}
	.md-progress-label {
		font-family: var(--font-ui);
		font-size:   0.75rem;
		color:       var(--text-muted);
		flex:        1;
	}
	.md-progress-val {
		min-width:            28px;
		text-align:           center;
		font-family:          var(--font-ui);
		font-size:            1rem;
		font-weight:          700;
		font-variant-numeric: tabular-nums;
		color:                var(--text);
	}

	/* ── Roll button ─────────────────────────────────────────────────────── */
	.md-roll-btn {
		display:     inline-flex;
		align-items: center;
		gap:         6px;
		padding:     8px 16px;
		font-size:   0.8rem;
	}
	/* In action row, roll button fills remaining space */
	.md-action-row .md-roll-btn { flex: 1; justify-content: center; }

	.md-roll-dice {
		display:     inline-flex;
		align-items: center;
		gap:         2px;
	}
	.md-roll-die {
		display:     flex;
		align-items: center;
	}
	.md-roll-die :global(svg) {
		fill: currentColor;
	}
	.md-roll-die--d6 :global(svg) {
		width:  14px;
		height: 14px;
	}
	.md-roll-die--d10 :global(svg) {
		width:  12px;
		height: 12px;
		opacity: 0.8;
	}
	/* Standalone roll buttons (progress moves) — full width */
	.md-roll-btn--full { width: 100%; }

	/* ── Outcomes (no-roll moves) ────────────────────────────────────────── */
	.md-outcomes {
		display:        flex;
		flex-direction: column;
		gap:            8px;
	}
	.md-outcome-section {
		padding:       6px 8px;
		border-left:   3px solid var(--outcome-color, var(--border));
		border-radius: 0 4px 4px 0;
		background:    var(--bg-inset);
	}
	.md-outcome-label {
		font-family:    var(--font-ui);
		font-size:      0.65rem;
		font-weight:    700;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		margin-bottom:  3px;
	}
	.md-outcome-strong { color: var(--color-success, #34d399); }
	.md-outcome-weak   { color: var(--color-momentum, #60a5fa); }
	.md-outcome-miss   { color: var(--color-danger, #ef4444); }
	.md-outcome-text {
		font-family: var(--font-ui);
		font-size:   0.76rem;
		color:       var(--text-muted);
		line-height: 1.5;
	}
	.md-outcome-text :global(.log-only) { display: none; }
	.md-outcome-text :global(strong) { color: var(--text); font-weight: 600; }
	.md-outcome-text :global(ul) { margin: 3px 0; padding-left: 1.3em; }
	.md-outcome-text :global(li) { margin-bottom: 2px; }
	.md-outcome-text :global(a) { color: var(--text-accent); text-decoration: underline; cursor: pointer; }
	/* Make non-move interactive links inert in dialog (only live in session log) */
	.md-outcome-text :global(a.resource-link),
	.md-outcome-text :global(a.debility-link),
	.md-outcome-text :global(a.progress-link),
	.md-outcome-text :global(a.initiative-link),
	.md-outcome-text :global(a.menace-link) {
		pointer-events: none;
		cursor: default;
		text-decoration: none;
	}

	/* ── Notes ────────────────────────────────────────────────────────────── */
	.md-notes {
		border-top: 1px solid var(--border);
		padding-top: 8px;
	}
	.md-notes-text {
		font-family: var(--font-ui);
		font-size:   0.72rem;
		color:       var(--text-dimmer);
		line-height: 1.5;
		font-style:  italic;
	}
</style>
