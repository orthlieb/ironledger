<script lang="ts">
	/**
	 * DiceRollerDialog — floating modal for all Ironsworn dice rolls.
	 *
	 * Roll types:
	 *   Quick    — d6, d10, 2d10, d100 (no stat modifier)
	 *   Action   — 1d6 + stat + adds vs 2d10  (core Ironsworn resolution)
	 *
	 * All results are appended to the session log.
	 * 3D dice animation runs via @3d-dice/dice-box-threejs (CDN, lazy-loaded).
	 */
	import { appendLog, SESSION_LOG_ID } from '$lib/log.svelte.js';
	import { rollDie, rollD100, animateDice, DIE_BLACK, DIE_WHITE } from '$lib/dice.js';
	import type { DiceCtx } from '$lib/diceContext.svelte.js';

	import diceD6Svg   from '$icons/dice-d6-light.svg?raw';
	import { draggable } from '$lib/actions/draggable.js';
	import diceD10Svg  from '$icons/dice-d10-light.svg?raw';
	import diceD100Svg from '$icons/dice-d100-solid.svg?raw';

	// ---------------------------------------------------------------------------
	// Props
	// ---------------------------------------------------------------------------
	let {
		ctx = null,
	}: {
		/** Active character context. Null = no character selected; action roll is disabled. */
		ctx: DiceCtx | null;
	} = $props();

	/** Build a log entry title: "<CharName> — <label>". Falls back to just the label if no char. */
	function logTitle(label: string) {
		return ctx ? `${ctx.charName} \u2014 ${label}` : label;
	}

	// ---------------------------------------------------------------------------
	// Stat definitions
	// ---------------------------------------------------------------------------
	type StatKey = 'edge' | 'heart' | 'iron' | 'shadow' | 'wits';

	const STATS: { key: StatKey; label: string; color: string }[] = [
		{ key: 'edge',   label: 'Edge',   color: 'var(--color-edge)'   },
		{ key: 'heart',  label: 'Heart',  color: 'var(--color-heart)'  },
		{ key: 'iron',   label: 'Iron',   color: 'var(--color-iron)'   },
		{ key: 'shadow', label: 'Shadow', color: 'var(--color-shadow)' },
		{ key: 'wits',   label: 'Wits',   color: 'var(--color-wits)'   },
	];

	// ---------------------------------------------------------------------------
	// Component state
	// ---------------------------------------------------------------------------
	let dialogEl     = $state<HTMLDialogElement | null>(null);
	let selectedStat = $state<StatKey>('heart');
	let adds         = $state(0);
	let rolling      = $state(false);

	// ---------------------------------------------------------------------------
	// Helpers
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

	// ---------------------------------------------------------------------------
	// Quick rolls — always available; log only when a character is active
	// ---------------------------------------------------------------------------
	async function quickRoll(sides: number, label: string) {
		if (rolling) return;
		rolling = true;
		const v    = rollDie(sides);
		const html = `<div class="roll-line"><span class="roll-die-label">${label}</span> → <strong>${v}</strong></div>`;
		close();
		await animateDice([{ sides, value: v }]);
		appendLog(SESSION_LOG_ID, logTitle(label), html);
		rolling = false;
	}

	async function quickRoll2d10() {
		if (rolling) return;
		rolling  = true;
		const d6 = rollDie(6);
		const v1 = rollDie(10), v2 = rollDie(10);
		const html = `<div class="roll-line"><span class="roll-die-label">2d10 + d6</span> → challenge [<strong>${v1}</strong>, <strong>${v2}</strong>] action [<strong>${d6}</strong>]</div>`;
		close();
		await animateDice([{ sides: 6, value: d6 }, { sides: 10, value: v1 }, { sides: 10, value: v2 }]);
		appendLog(SESSION_LOG_ID, logTitle('2d10 + d6'), html);
		rolling = false;
	}

	async function quickRollD100() {
		if (rolling) return;
		rolling = true;
		const v     = rollD100();
		// Split into two d10 values for animation (tens die + ones die)
		const tensV = Math.floor(v % 100 / 10) || 10;
		const onesV = v % 10                   || 10;
		const html  = `<div class="roll-line"><span class="roll-die-label">d100</span> → <strong>${v}</strong></div>`;
		close();
		await animateDice([
			{ sides: 10, value: tensV, color: DIE_BLACK },
			{ sides: 10, value: onesV, color: DIE_WHITE },
		]);
		appendLog(SESSION_LOG_ID, logTitle('d100'), html);
		rolling = false;
	}

	// ---------------------------------------------------------------------------
	// Action roll  (1d6 + stat + adds  vs  2d10)  — requires ctx
	// ---------------------------------------------------------------------------
	async function actionRoll() {
		if (rolling || !ctx) return;
		rolling = true;

		const stat      = selectedStat;
		const statVal   = ctx.data[stat] as number;
		const actionDie = rollDie(6);
		const c1        = rollDie(10);
		const c2        = rollDie(10);
		const momentum  = ctx.data.momentum;

		// Momentum cancellation: if momentum < 0 and |momentum| = action die, negate it
		const cancelled          = momentum < 0 && Math.abs(momentum) === actionDie;
		const actionDieEffective = cancelled ? 0 : actionDie;
		const total              = actionDieEffective + statVal + adds;

		const hits1   = total > c1;
		const hits2   = total > c2;
		const isMatch = c1 === c2;

		const statLabel = STATS.find(s => s.key === stat)!.label;
		const addsStr   = adds !== 0
			? ` + adds[${adds > 0 ? '+' : ''}${adds}]`
			: '';
		const dieStr    = cancelled
			? `<s>${actionDie}</s>&thinsp;0`
			: `${actionDie}`;

		const parts: string[] = [];
		if (cancelled) {
			parts.push(
				`<div class="roll-cancel">Momentum cancel! Momentum is ${momentum}, ` +
				`action die ${actionDie} → 0.</div>`,
			);
		}
		parts.push(
			`<div class="roll-line">` +
			`1d6 [${dieStr}] + ${statLabel.toLowerCase()}[${statVal}]${addsStr}` +
			` = <strong>${total}</strong> vs 2d10 [${c1}] [${c2}]` +
			`</div>`,
		);
		const matchSpan = isMatch ? ' <span class="roll-match">with a match!</span>' : '';
		parts.push(
			`<div class="${outcomeClass(hits1, hits2)}">` +
			`<strong>${outcomeLabel(hits1, hits2)}</strong>${matchSpan}` +
			`</div>`,
		);

		const html = parts.join('');

		close();
		await animateDice([
			{ sides: 6,  value: actionDie },
			{ sides: 10, value: c1        },
			{ sides: 10, value: c2        },
		]);

		appendLog(SESSION_LOG_ID, logTitle(`Action (${statLabel})`), html);
		rolling = false;
	}

	// ---------------------------------------------------------------------------
	// Public API (accessed via bind:this)
	// ---------------------------------------------------------------------------
	export function open() {
		dialogEl?.showModal();
	}

	export function close() {
		dialogEl?.close();
	}
</script>

<!-- =========================================================================
     Dialog
     ========================================================================= -->
<dialog
	bind:this={dialogEl}
	class="dice-dialog"
	oncancel={close}
>

	<!-- Header -->
	<div class="dice-header" use:draggable>
		<span class="dice-title">Roll Dice</span>
		<button class="dice-close" onclick={close} aria-label="Close">✕</button>
	</div>

	<div class="dice-body">

		<!-- ── Quick Rolls ── -->
		<section>
			<div class="section-label">Quick Roll</div>
			<div class="quick-row">
				<button class="quick-btn" onclick={() => quickRoll(6, 'd6')}   disabled={rolling} title="Roll d6">
					<span class="qicon">{@html diceD6Svg}</span>
					<span class="qdie">d6</span>
				</button>
				<button class="quick-btn" onclick={() => quickRoll(10, 'd10')} disabled={rolling} title="Roll d10">
					<span class="qicon">{@html diceD10Svg}</span>
					<span class="qdie">d10</span>
				</button>
				<button class="quick-btn" onclick={quickRoll2d10}              disabled={rolling} title="Roll 2d10 + d6 (challenge dice)">
					<span class="qicon qicon-triple">{@html diceD10Svg}{@html diceD10Svg}{@html diceD6Svg}</span>
					<span class="qdie">2d10+d6</span>
				</button>
				<button class="quick-btn" onclick={quickRollD100}              disabled={rolling} title="Roll d100">
					<span class="qicon">{@html diceD100Svg}</span>
					<span class="qdie">d100</span>
				</button>
			</div>
		</section>

		<hr class="dice-rule" />

		<!-- ── Action Roll ── -->
		<section class="action-section">
			<div class="section-label">Action Roll  <span class="formula-hint">1d6 + stat + adds  vs  2d10</span></div>

			<!-- Stat selector -->
			<div class="stat-row">
				{#each STATS as s (s.key)}
					<button
						class="stat-btn"
						class:selected={selectedStat === s.key}
						style:--scolor={s.color}
						onclick={() => (selectedStat = s.key)}
						disabled={rolling || !ctx}
						title="{s.label}: {ctx ? ctx.data[s.key] : '—'}"
					>
						<span class="sname">{s.label}</span>
						<span class="sval">{ctx ? ctx.data[s.key] : '—'}</span>
					</button>
				{/each}
			</div>

			<!-- Adds + momentum -->
			<div class="adds-row">
				<span class="adds-label">Adds</span>
				<button
					class="adj"
					onclick={() => (adds = Math.max(-5, adds - 1))}
					disabled={rolling || !ctx || adds <= -5}
					aria-label="Decrease adds"
				>−</button>
				<span
					class="adds-val"
					class:positive={adds > 0}
					class:negative={adds < 0}
				>{adds >= 0 ? '+' : ''}{adds}</span>
				<button
					class="adj"
					onclick={() => (adds = Math.min(5, adds + 1))}
					disabled={rolling || !ctx || adds >= 5}
					aria-label="Increase adds"
				>+</button>

				<span
					class="momentum-chip"
					class:momentum-neg={(ctx?.data.momentum ?? 0) < 0}
					title="Current momentum (affects momentum cancellation)"
				>↯ {(ctx?.data.momentum ?? 0) >= 0 ? '+' : ''}{ctx?.data.momentum ?? 0}</span>
			</div>

			<button
				class="btn btn-primary roll-btn"
				onclick={actionRoll}
				disabled={rolling || !ctx}
			>{rolling ? 'Rolling…' : 'Roll Action'}</button>
		</section>

	</div>
</dialog>

<style>
	/* ── Dialog shell ── */
	.dice-dialog {
		border:        none;
		padding:       0;
		border-radius: 10px;
		position:      fixed;
		top:           50%;
		left:          50%;
		transform:     translate(-50%, -50%);
		width:         min(400px, calc(100vw - 2rem));
		background:    var(--bg-card);
		color:         var(--text);
		box-shadow:    0 16px 48px #00000070, 0 0 0 1px var(--border-mid);
		outline:       none;
	}
	.dice-dialog::backdrop {
		background:     #00000060;
		backdrop-filter: blur(1px);
	}

	/* ── Header ── */
	.dice-header {
		display:         flex;
		align-items:     center;
		justify-content: space-between;
		padding:         10px 14px;
		border-bottom:   1px solid var(--border);
		background:      var(--bg-control);
		border-radius:   10px 10px 0 0;
	}
	.dice-title {
		font-family:     var(--font-display);
		font-size:       0.78rem;
		font-weight:     700;
		letter-spacing:  0.08em;
		text-transform:  uppercase;
		color:           var(--text-accent);
	}
	.dice-close {
		background:  transparent;
		border:      none;
		color:       var(--text-dimmer);
		cursor:      pointer;
		font-size:   0.9rem;
		padding:     2px 5px;
		border-radius: 3px;
		line-height: 1;
		font-family: inherit;
	}
	.dice-close:hover { color: var(--text); }

	/* ── Body ── */
	.dice-body {
		padding:        12px 14px;
		display:        flex;
		flex-direction: column;
		gap:            12px;
	}

	/* ── Quick rolls ── */
	.quick-row {
		display:    flex;
		gap:        6px;
		margin-top: 6px;
	}
	.quick-btn {
		flex:            1;
		display:         flex;
		flex-direction:  column;
		align-items:     center;
		justify-content: center;
		gap:             4px;
		min-height:      56px;
		padding:         8px 4px;
		background:      var(--bg-control);
		border:          1px solid var(--border);
		border-radius:   6px;
		cursor:          pointer;
		color:           var(--text);
		font-family:     var(--font-ui);
		transition:      background 0.12s, border-color 0.12s, color 0.12s;
	}
	.quick-btn:hover:not(:disabled) {
		background:    var(--bg-hover);
		border-color:  var(--border-mid);
		color:         var(--text-accent);
	}
	.quick-btn:disabled { opacity: 0.4; cursor: not-allowed; }

	.qicon {
		display:     flex;
		align-items: center;
		gap:         2px;
		color:       var(--text-muted);
		transition:  color 0.12s;
	}
	.quick-btn:hover:not(:disabled) .qicon { color: var(--text-accent); }
	.qicon :global(svg) {
		width:  22px;
		height: 22px;
		fill:   currentColor;
	}
	.qicon-triple :global(svg) {
		width:  14px;
		height: 14px;
	}

	.qdie {
		font-size:      0.72rem;
		font-weight:    700;
		letter-spacing: 0.04em;
		color:          var(--text-dimmer);
	}

	/* ── Divider ── */
	.dice-rule {
		border:     none;
		border-top: 1px solid var(--border);
		margin:     0;
	}

	/* ── Action roll ── */
	.action-section { display: flex; flex-direction: column; gap: 8px; }

	.formula-hint {
		font-family:  var(--font-ui);
		font-size:    0.62rem;
		color:        var(--text-dimmer);
		font-style:   italic;
		font-weight:  400;
		letter-spacing: 0;
		text-transform: none;
		margin-left:  6px;
	}

	/* Stat buttons */
	.stat-row {
		display: flex;
		gap:     4px;
	}
	.stat-btn {
		flex:            1;
		display:         flex;
		flex-direction:  column;
		align-items:     center;
		gap:             2px;
		padding:         6px 2px;
		background:      var(--bg-control);
		border:          1px solid var(--border);
		border-radius:   5px;
		cursor:          pointer;
		color:           var(--text-muted);
		font-family:     var(--font-ui);
		transition:      background 0.12s, border-color 0.12s, color 0.12s;
	}
	.stat-btn:hover:not(:disabled):not(.selected) {
		background:   var(--bg-hover);
		border-color: var(--border-mid);
	}
	.stat-btn.selected {
		background:   color-mix(in srgb, var(--scolor) 12%, var(--bg-control));
		border-color: var(--scolor);
		color:        var(--scolor);
	}
	.stat-btn:disabled { opacity: 0.4; cursor: not-allowed; }

	.sname {
		font-size:       0.58rem;
		letter-spacing:  0.05em;
		text-transform:  uppercase;
		line-height:     1;
	}
	.sval {
		font-size:   1.05rem;
		font-weight: 700;
		line-height: 1;
	}

	/* Adds row */
	.adds-row {
		display:     flex;
		align-items: center;
		gap:         6px;
	}
	.adds-label {
		font-family: var(--font-ui);
		font-size:   0.75rem;
		color:       var(--text-muted);
		min-width:   28px;
	}
	.adj {
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
	.adj:disabled { opacity: 0.35; cursor: not-allowed; }
	.adj:not(:disabled):hover { background: var(--bg-hover); border-color: var(--border-mid); }

	.adds-val {
		min-width:            28px;
		text-align:           center;
		font-family:          var(--font-ui);
		font-size:            0.9rem;
		font-weight:          700;
		font-variant-numeric: tabular-nums;
		color:                var(--text);
	}
	.adds-val.positive { color: var(--color-success); }
	.adds-val.negative { color: var(--color-danger); }

	.momentum-chip {
		margin-left:  auto;
		font-family:  var(--font-ui);
		font-size:    0.72rem;
		font-weight:  600;
		color:        var(--color-momentum);
		padding:      2px 6px;
		border-radius: 3px;
		border:       1px solid color-mix(in srgb, var(--color-momentum) 30%, transparent);
		background:   color-mix(in srgb, var(--color-momentum) 8%, transparent);
	}
	.momentum-chip.momentum-neg {
		color:      var(--color-danger);
		border-color: color-mix(in srgb, var(--color-danger) 30%, transparent);
		background:  color-mix(in srgb, var(--color-danger) 8%, transparent);
	}

	/* Roll button */
	.roll-btn { width: 100%; padding: 8px; font-size: 0.8rem; }
</style>
