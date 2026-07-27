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
	import { appendLog } from '$lib/log.svelte.js';
	import { matchNoteHtml } from '$lib/rollMatch.js';
	import { rollDie, rollD100, animateDice, DIE_BLACK, DIE_WHITE } from '$lib/dice.js';
	import type { DiceCtx } from '$lib/diceContext.svelte.js';
	import { headingText } from '$lib/fontStore.svelte.js';
	import { getActiveDebilityWarnings } from '$lib/debilityWarnings.js';
	import { tooltip } from '$lib/actions/tooltip.js';

	import diceD6Svg from '$icons/dice-d6-light.svg?raw';
	import { Dialog } from 'bits-ui';
	import DialogHeader from '$lib/components/DialogHeader.svelte';
	import diceD10Svg from '$icons/dice-d10-light.svg?raw';

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
		{ key: 'edge', label: 'Edge', color: 'var(--color-edge)' },
		{ key: 'heart', label: 'Heart', color: 'var(--color-heart)' },
		{ key: 'iron', label: 'Iron', color: 'var(--color-iron)' },
		{ key: 'shadow', label: 'Shadow', color: 'var(--color-shadow)' },
		{ key: 'wits', label: 'Wits', color: 'var(--color-wits)' },
	];

	// ---------------------------------------------------------------------------
	// Component state
	// ---------------------------------------------------------------------------
	let dialogOpen = $state(false);
	let selectedStat = $state<StatKey | null>(null);
	let adds = $state(0);
	let rolling = $state(false);

	// All active debility warnings — shown on free rolls since any move could apply
	const debilityWarnings = $derived(ctx ? getActiveDebilityWarnings('*', ctx.data) : []);

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
	/** Wait one animation frame so the dialog's removal is painted before the dice overlay appears. */
	function afterClose(): Promise<void> {
		return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
	}

	async function quickRoll(sides: number, label: string) {
		if (rolling) return;
		rolling = true;
		const v = rollDie(sides);
		const html = `<div class="roll-line"><span class="roll-die-label">${label}</span> → <strong>${v}</strong></div>`;
		close();
		await afterClose();
		await animateDice([{ sides, value: v }]);
		appendLog(logTitle(label), html);
		rolling = false;
	}

	async function quickRollD100() {
		if (rolling) return;
		rolling = true;
		const v = rollD100();
		// Split into two d10 values for animation (tens die + ones die)
		const tensV = Math.floor((v % 100) / 10) || 10;
		const onesV = v % 10 || 10;
		const html = `<div class="roll-line"><span class="roll-die-label">d100</span> → <strong>${v}</strong></div>`;
		close();
		await afterClose();
		await animateDice([
			{ sides: 10, value: tensV, color: DIE_BLACK },
			{ sides: 10, value: onesV, color: DIE_WHITE },
		]);
		appendLog(logTitle('d100'), html);
		rolling = false;
	}

	// ---------------------------------------------------------------------------
	// Action roll  (1d6 + stat + adds  vs  2d10)  — requires ctx
	// ---------------------------------------------------------------------------
	async function actionRoll() {
		if (rolling || !ctx) return;
		rolling = true;

		const stat = selectedStat;
		const statVal = stat ? (ctx.data[stat] as number) : 0;
		const actionDie = rollDie(6);
		const c1 = rollDie(10);
		const c2 = rollDie(10);
		const momentum = ctx.data.momentum;

		// Momentum cancellation: if momentum < 0 and |momentum| = action die, negate it
		const cancelled = momentum < 0 && Math.abs(momentum) === actionDie;
		const actionDieEffective = cancelled ? 0 : actionDie;
		const total = actionDieEffective + statVal + adds;

		const hits1 = total > c1;
		const hits2 = total > c2;
		const isMatch = c1 === c2;

		const statLabel = stat ? STATS.find((s) => s.key === stat)!.label : null;
		const statStr = statLabel ? ` + ${statLabel.toLowerCase()}[${statVal}]` : '';
		const addsStr = adds !== 0 ? ` + adds[${adds > 0 ? '+' : ''}${adds}]` : '';
		const dieStr = cancelled ? `<s>${actionDie}</s>&thinsp;0` : `${actionDie}`;

		const parts: string[] = [];
		if (cancelled) {
			parts.push(
				`<div class="roll-cancel">Momentum cancel! Momentum is ${momentum}, ` +
					`action die ${actionDie} → 0.</div>`,
			);
		}
		parts.push(
			`<div class="roll-line">` +
				`1d6 [${dieStr}]${statStr}${addsStr}` +
				` = <strong>${total}</strong> vs 2d10 [${c1}] [${c2}]` +
				`</div>`,
		);
		const matchSpan = isMatch ? ' <span class="roll-match">with a match!</span>' : '';
		parts.push(
			`<div class="${outcomeClass(hits1, hits2)}">` +
				`<strong>${outcomeLabel(hits1, hits2)}</strong>${matchSpan}` +
				`</div>`,
		);
		parts.push(matchNoteHtml(hits1, hits2, isMatch));

		const html = parts.join('');

		close();
		await afterClose();
		await animateDice([
			{ sides: 6, value: actionDie },
			{ sides: 10, value: c1 },
			{ sides: 10, value: c2 },
		]);

		appendLog(logTitle(statLabel ? `Action (${statLabel})` : 'Action'), html);
		rolling = false;
	}

	// ---------------------------------------------------------------------------
	// Public API (accessed via bind:this)
	// ---------------------------------------------------------------------------
	export function open() {
		dialogOpen = true;
	}

	export function close() {
		dialogOpen = false;
	}
</script>

<!-- =========================================================================
     Dialog — bits-ui Dialog: portalled, escape-aware, focus-trapped.
     ========================================================================= -->
<Dialog.Root bind:open={dialogOpen}>
	<Dialog.Portal>
		<Dialog.Overlay class="dice-overlay" />
		<Dialog.Content class="dice-dialog">
			<DialogHeader title={headingText('Roll Dice')} onclose={close} />

			<div class="dice-body">
				<!-- ── Quick Rolls ── -->
				<section>
					<div class="section-label">Quick Roll</div>
					<div class="quick-row">
						<button
							class="quick-btn"
							onclick={() => quickRoll(6, 'd6')}
							disabled={rolling}
							use:tooltip={'Roll d6'}
						>
							<span class="qicon">{@html diceD6Svg}</span>
							<span class="qdie">d6</span>
						</button>
						<button
							class="quick-btn"
							onclick={() => quickRoll(10, 'd10')}
							disabled={rolling}
							use:tooltip={'Roll d10'}
						>
							<span class="qicon">{@html diceD10Svg}</span>
							<span class="qdie">d10</span>
						</button>
						<button
							class="quick-btn"
							onclick={quickRollD100}
							disabled={rolling}
							use:tooltip={'Roll d100'}
						>
							<span class="qicon qicon-d100">
								<span class="d100-dark">{@html diceD10Svg}</span>
								<span class="d100-light">{@html diceD10Svg}</span>
							</span>
							<span class="qdie">d100</span>
						</button>
					</div>
				</section>

				<hr class="dice-rule" />

				<!-- ── Action Roll ── -->
				<section class="action-section">
					<div class="section-label">
						Action Roll <span class="formula-hint">1d6 + stat + adds vs 2d10</span>
					</div>

					<!-- Stat selector -->
					<div class="stat-row">
						{#each STATS as s (s.key)}
							<button
								class="stat-btn"
								class:selected={selectedStat === s.key}
								style:--scolor={s.color}
								onclick={() => (selectedStat = selectedStat === s.key ? null : s.key)}
								disabled={rolling || !ctx}
								use:tooltip={`${s.label}: ${ctx ? ctx.data[s.key] : '—'}`}
							>
								<span class="sname">{s.label}</span>
								<span class="sval">{ctx ? `+${ctx.data[s.key]}` : '—'}</span>
							</button>
						{/each}
					</div>

					<!-- Active debility warnings -->
					{#if debilityWarnings.length > 0}
						<div class="drd-debility-bar">
							<span class="drd-debility-label">Debilities</span>
							<div class="drd-debility-tags">
								{#each debilityWarnings as w (w.key)}
									<div
										class="drd-debility-tag"
										use:tooltip={{ text: w.penalty, placement: 'above' }}
									>
										{w.label}
									</div>
								{/each}
							</div>
						</div>
					{/if}

					<!-- Adds + Roll (side by side) -->
					<div class="adds-roll-row">
						<div class="adds-row">
							<span class="adds-label">Adds</span>
							<button
								class="adj"
								onclick={() => (adds = Math.max(-5, adds - 1))}
								disabled={rolling || !ctx || adds <= -5}
								aria-label="Decrease adds">−</button
							>
							<span class="adds-val" class:positive={adds > 0} class:negative={adds < 0}
								>{adds >= 0 ? '+' : ''}{adds}</span
							>
							<button
								class="adj"
								onclick={() => (adds = Math.min(5, adds + 1))}
								disabled={rolling || !ctx || adds >= 5}
								aria-label="Increase adds">+</button
							>
						</div>

						<button class="btn btn-primary roll-btn" onclick={actionRoll} disabled={rolling || !ctx}
							>{rolling ? 'Rolling…' : 'Roll Action'}</button
						>
					</div>
				</section>
			</div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<style>
	/* bits-ui portals Content + Overlay to <body> — scope everything
	   globally. Overlay 80 / content 81 matches the modal z-index tier. */
	:global(.dice-overlay) {
		position: fixed;
		inset: 0;
		background: #00000060;
		backdrop-filter: blur(1px);
		z-index: 80;
	}
	:global(.dice-dialog) {
		display: flex;
		flex-direction: column;
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: min(400px, calc(100vw - 2rem));
		background: var(--bg-card);
		color: var(--text);
		border-radius: 10px;
		box-shadow:
			0 16px 48px #00000070,
			0 0 0 1px var(--border-mid);
		outline: none;
		z-index: 81;
	}

	/* ── Header ── */

	/* ── Body ── */
	:global(.dice-body) {
		padding: 12px 14px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	/* ── Quick rolls ── */
	:global(.quick-row) {
		display: flex;
		gap: 6px;
		margin-top: 6px;
	}
	:global(.quick-btn) {
		flex: 1;
		display: flex;
		flex-direction: row;
		align-items: center;
		justify-content: center;
		gap: 6px;
		padding: 5px 10px;
		background: var(--bg-control);
		border: 1px solid var(--border);
		border-radius: 6px;
		cursor: pointer;
		color: var(--text);
		font-family: var(--font-ui);
		transition:
			background 0.12s,
			border-color 0.12s,
			color 0.12s;
	}
	:global(.quick-btn:hover:not(:disabled)) {
		background: var(--bg-hover);
		border-color: var(--border-mid);
		color: var(--text-accent);
	}
	:global(.quick-btn:disabled) {
		opacity: 0.4;
		cursor: not-allowed;
	}

	:global(.qicon) {
		display: flex;
		align-items: center;
		gap: 2px;
		color: var(--text-muted);
		transition: color 0.12s;
	}
	:global(.quick-btn:hover:not(:disabled) .qicon) {
		color: var(--text-accent);
	}
	:global(.qicon svg) {
		width: 22px;
		height: 22px;
		fill: currentColor;
	}
	.qdie {
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.04em;
		color: var(--text-dimmer);
	}

	/* ── Divider ── */
	:global(.dice-rule) {
		border: none;
		border-top: 1px solid var(--border);
		margin: 0;
	}

	/* ── Action roll ── */
	:global(.action-section) {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.formula-hint {
		font-family: var(--font-ui);
		font-size: 0.62rem;
		color: var(--text-dimmer);
		font-style: italic;
		font-weight: 400;
		letter-spacing: 0;
		text-transform: none;
		margin-left: 6px;
	}

	/* Stat buttons */
	:global(.stat-row) {
		display: flex;
		gap: 4px;
	}
	:global(.stat-btn) {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2px;
		padding: 6px 2px;
		background: var(--bg-control);
		border: 1px solid var(--border);
		border-radius: 5px;
		cursor: pointer;
		color: var(--text-muted);
		font-family: var(--font-ui);
		transition:
			background 0.12s,
			border-color 0.12s,
			color 0.12s;
	}
	:global(.stat-btn:hover:not(:disabled):not(.selected)) {
		background: var(--bg-hover);
		border-color: var(--border-mid);
	}
	:global(.stat-btn.selected) {
		background: color-mix(in srgb, var(--scolor) 12%, var(--bg-control));
		border-color: var(--scolor);
		color: var(--scolor);
	}
	:global(.stat-btn:disabled) {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.sname {
		font-size: 0.58rem;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		line-height: 1;
	}
	.sval {
		font-size: 1.05rem;
		font-weight: 700;
		line-height: 1;
	}

	/* Adds row */
	:global(.adds-row) {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	:global(.adds-label) {
		font-family: var(--font-ui);
		font-size: 0.75rem;
		color: var(--text-muted);
		min-width: 28px;
	}
	.adj {
		width: 22px;
		height: 22px;
		padding: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 3px;
		cursor: pointer;
		font-size: 0.9rem;
		font-family: var(--font-ui);
		color: var(--text);
		line-height: 1;
	}
	.adj:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}
	.adj:not(:disabled):hover {
		background: var(--bg-hover);
		border-color: var(--border-mid);
	}

	:global(.adds-val) {
		min-width: 28px;
		text-align: center;
		font-family: var(--font-ui);
		font-size: 0.9rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		color: var(--text);
	}
	:global(.adds-val.positive) {
		color: var(--color-success);
	}
	:global(.adds-val.negative) {
		color: var(--color-danger);
	}

	/* d100 = two coloured d10s */
	:global(.qicon-d100) {
		gap: 3px;
	}
	:global(.qicon-d100 svg) {
		width: 17px;
		height: 17px;
	}
	:global(.d100-dark svg) {
		fill: #7b4f2e;
	}
	:global(.d100-light svg) {
		fill: #c4895e;
	}
	:global(.quick-btn:hover:not(:disabled) .d100-dark :global(svg)) {
		fill: #9e6640;
	}
	:global(.quick-btn:hover:not(:disabled) .d100-light :global(svg)) {
		fill: #dba878;
	}

	/* Adds + roll side by side */
	:global(.adds-roll-row) {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	:global(.roll-btn) {
		margin-left: auto;
		padding: 5px 16px;
		white-space: nowrap;
	}

	/* ── Debility warning bar ── */
	.drd-debility-bar {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 6px;
		margin-top: 8px;
	}
	.drd-debility-label {
		font-family: var(--font-ui);
		font-size: 0.62rem;
		font-weight: 600;
		letter-spacing: 0.07em;
		text-transform: uppercase;
		color: var(--color-danger);
		white-space: nowrap;
		flex-shrink: 0;
	}
	.drd-debility-tags {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}
	.drd-debility-tag {
		display: inline-flex;
		align-items: center;
		padding: 2px 6px;
		border-radius: 4px;
		border: 1px solid var(--color-danger);
		background: color-mix(in srgb, var(--color-danger) 12%, transparent);
		font-family: var(--font-ui);
		font-size: 0.6rem;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--color-danger);
		cursor: default;
	}
</style>
