<script lang="ts">
	/**
	 * DenizenDialog — two-view dialog for the Roll Denizen GCB action.
	 *
	 * View 1 (table): Read-only denizen table formatted like an oracle.
	 *                 "Roll d100" button animates dice and transitions to the result view.
	 * View 2 (result): Rolled foe detail (portrait, quantity, pills, description, etc.)
	 *                  with Back → table and "Add to Foes" buttons.
	 *
	 * Usage:
	 *   <DenizenDialog bind:this={ref} onSelect={handleFoeSelected} />
	 *   ref.open(site);
	 */

	import type { Site, FoeDef, FoeQuantity } from '$lib/types.js';
	import { DENIZEN_CELLS } from '$lib/types.js';
	import {
		loadFoes, getFoes, RANK_COLORS, FOE_RANKS, FOE_QUANTITIES,
		FOE_NATURE_COLORS, effectiveRank as calcEffectiveRank,
	} from '$lib/foeStore.svelte.js';
	import { animateDice, DIE_BLACK, DIE_WHITE } from '$lib/dice.js';
	import { appendLog, SESSION_LOG_ID } from '$lib/log.svelte.js';
	import FoeImageCarousel from '$lib/components/FoeImageCarousel.svelte';

	// ---------------------------------------------------------------------------
	// Props
	// ---------------------------------------------------------------------------
	let {
		onSelect,
	}: {
		onSelect: (foeDef: FoeDef, quantity: FoeQuantity, effectiveRank: number) => void;
	} = $props();

	// ---------------------------------------------------------------------------
	// State
	// ---------------------------------------------------------------------------
	let dialogEl    = $state<HTMLDialogElement | null>(null);
	let view        = $state<'table' | 'result'>('table');
	let rolling     = $state(false);
	let rolledIndex = $state(-1);
	let site        = $state<Site | null>(null);
	let quantity    = $state<FoeQuantity>('solo');

	// ---------------------------------------------------------------------------
	// Derived
	// ---------------------------------------------------------------------------
	const rolledCell  = $derived(rolledIndex >= 0 ? DENIZEN_CELLS[rolledIndex] : null);
	const rolledName  = $derived(rolledIndex >= 0 ? (site?.denizens[rolledIndex] ?? '') : '');
	const rolledFoe   = $derived(
		rolledName
			? (getFoes().find(f => f.name.toLowerCase() === rolledName.toLowerCase()) ?? null)
			: null
	);
	const natureColor = $derived(rolledFoe ? (FOE_NATURE_COLORS[rolledFoe.nature] ?? '#9ca3af') : '#9ca3af');
	const rankAdj     = $derived(FOE_QUANTITIES.find(q => q.value === quantity)?.rankAdj ?? 0);
	const effRank     = $derived(rolledFoe ? calcEffectiveRank(rolledFoe.rank, rankAdj) : 1);
	const rankInfo    = $derived(FOE_RANKS[effRank]);

	// ---------------------------------------------------------------------------
	// Public API
	// ---------------------------------------------------------------------------
	export async function open(s: Site): Promise<void> {
		await loadFoes();
		site        = s;
		view        = 'table';
		rolling     = false;
		rolledIndex = -1;
		quantity    = 'solo';
		dialogEl?.showModal();
	}

	export function close(): void {
		dialogEl?.close();
	}

	// ---------------------------------------------------------------------------
	// Rolling
	// ---------------------------------------------------------------------------
	async function roll(): Promise<void> {
		if (rolling) return;
		rolling = true;

		const rollVal     = Math.floor(Math.random() * 100) + 1;
		const idx         = DENIZEN_CELLS.findIndex(c => rollVal >= c.low && rollVal <= c.high);
		const cell        = DENIZEN_CELLS[idx];
		const denizenName = site?.denizens[idx] ?? '';

		// Close dialog so dice animation is visible
		dialogEl?.close();

		const tensV = Math.floor(rollVal % 100 / 10) || 10;
		const onesV = rollVal % 10 || 10;
		await animateDice([
			{ sides: 10, value: tensV, color: DIE_BLACK },
			{ sides: 10, value: onesV, color: DIE_WHITE },
		]);

		appendLog(SESSION_LOG_ID, `Site — ${site?.name || 'Unnamed Site'}`,
			`<div>Rolled d100: <strong>${rollVal}</strong> → ${cell.label} (${cell.range})${denizenName ? `: <strong>${denizenName}</strong>` : ''}</div>`);

		rolledIndex = idx;
		quantity    = 'solo';
		rolling     = false;
		view        = 'result';

		// Reopen dialog to show result
		dialogEl?.showModal();
	}

	// ---------------------------------------------------------------------------
	// Confirm (add foe)
	// ---------------------------------------------------------------------------
	function confirm(): void {
		if (!rolledFoe) return;
		const qty = quantity;
		const er  = effRank;
		dialogEl?.close();
		onSelect(rolledFoe, qty, er);
	}

	// ---------------------------------------------------------------------------
	// Helpers
	// ---------------------------------------------------------------------------
	function rankBadgeStyle(rank: number): string {
		const rc = RANK_COLORS[rank];
		if (!rc) return '';
		return `background:${rc.bg}22; color:${rc.bg}`;
	}

</script>

<dialog
	bind:this={dialogEl}
	class="denizen-dialog"
	aria-label="Denizen Table"
>

	<!-- ===== TABLE VIEW ===== -->
	{#if view === 'table'}
		<div class="dd-header">
			<span class="dd-title">Denizen Table</span>
		</div>

		<div class="dd-table-wrap">
			<table class="dd-table">
				<thead>
					<tr>
						<th>d100</th>
						<th>Frequency</th>
						<th>Foe</th>
					</tr>
				</thead>
				<tbody>
					{#each DENIZEN_CELLS as cell, i}
						<tr class:dd-row-rolled={rolledIndex === i}>
							<td class="dd-range">{cell.range}</td>
							<td class="dd-freq">{cell.label}</td>
							<td class="dd-foe-name">{site?.denizens[i] || '—'}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<div class="dd-footer">
			<button class="btn" onclick={close}>Cancel</button>
			<button class="btn btn-primary" onclick={roll} disabled={rolling}>
				{rolling ? 'Rolling…' : 'Roll d100'}
			</button>
		</div>

	<!-- ===== RESULT VIEW ===== -->
	{:else if view === 'result'}
		{@const qtyDef = FOE_QUANTITIES.find(q => q.value === quantity)}

		<div class="dd-back-bar">
			<button class="btn dd-back-btn" onclick={() => (view = 'table')}>← Back</button>
			<span class="dd-title">{rolledFoe?.name ?? (rolledName || 'Unknown Denizen')}</span>
		</div>

		<div class="dd-result-scroll">
			{#if rolledFoe && rankInfo}

				<!-- Top row: portrait + quantity/pills -->
				<div class="dd-confirm-top">
					<div class="dd-portrait-wrap">
						<FoeImageCarousel name={rolledFoe.name} images={rolledFoe.images} alt={rolledFoe.name} class="dd-portrait" />
					</div>

					<div class="dd-qty-section">
						<fieldset class="dd-quantity-group">
							<legend class="dd-quantity-legend">Quantity</legend>
							{#each FOE_QUANTITIES as qty}
								<label class="dd-qty-label" class:selected={quantity === qty.value}>
									<input
										type="radio"
										name="denizen-quantity"
										value={qty.value}
										checked={quantity === qty.value}
										onchange={() => (quantity = qty.value)}
									/>
									<span class="dd-qty-name">{qty.label}</span>
								</label>
							{/each}
						</fieldset>

						<div class="dd-pills">
							<span class="dd-badge" style="background: {natureColor}22; color: {natureColor}">{rolledFoe.nature}</span>
							<span class="dd-badge dd-badge--rank" style={rankBadgeStyle(effRank)}>{rankInfo.label}</span>
							<span class="dd-stat-pill dd-stat-pill--harm">Harm: {rankInfo.harm}</span>
							<span class="dd-stat-pill dd-stat-pill--progress">Progress: {rankInfo.progressPerHit}</span>
							<span class="dd-stat-pill dd-stat-pill--qty">{qtyDef?.label ?? quantity}</span>
						</div>
					</div>
				</div>

				<!-- Bottom: description + features/drives/tactics, full width -->
				{#if rolledFoe.description || rolledFoe.features.length > 0 || rolledFoe.drives.length > 0 || rolledFoe.tactics.length > 0}
					<div class="dd-confirm-bottom">
						{#if rolledFoe.description}
							<p class="dd-desc">{rolledFoe.description}</p>
						{/if}
						{#if rolledFoe.features.length > 0}
							<div class="dd-section">
								<span class="dd-section-label">Features</span>
								<ul class="dd-list">
									{#each rolledFoe.features as feat}<li>{feat}</li>{/each}
								</ul>
							</div>
						{/if}
						{#if rolledFoe.drives.length > 0}
							<div class="dd-section">
								<span class="dd-section-label">Drives</span>
								<ul class="dd-list">
									{#each rolledFoe.drives as d}<li>{d}</li>{/each}
								</ul>
							</div>
						{/if}
						{#if rolledFoe.tactics.length > 0}
							<div class="dd-section">
								<span class="dd-section-label">Tactics</span>
								<ul class="dd-list">
									{#each rolledFoe.tactics as t}<li>{t}</li>{/each}
								</ul>
							</div>
						{/if}
					</div>
				{/if}

			{:else}
				<!-- No matching foe — show roll info only -->
				<div class="dd-no-foe">
					{#if rolledCell}
						<p class="dd-no-foe-roll">
							Rolled <strong>{rolledCell.range}</strong> — {rolledCell.label}
						</p>
					{/if}
					{#if rolledName}
						<p class="dd-no-foe-name">"{rolledName}" is not in the foe catalogue.</p>
					{:else}
						<p class="dd-no-foe-name">No denizen assigned for this range.</p>
					{/if}
				</div>
			{/if}
		</div>

		<div class="dd-footer">
			<button class="btn" onclick={close}>Cancel</button>
			{#if rolledFoe}
				<button class="btn btn-primary" onclick={confirm}>Add to Foes</button>
			{/if}
		</div>
	{/if}

</dialog>

<style>
	/* ── Dialog shell ──────────────────────────────────────────────── */
	.denizen-dialog {
		margin: auto;
		padding: 0;
		border: 1px solid var(--border);
		border-radius: 8px;
		background: var(--bg-card);
		color: var(--text);
		box-shadow: 0 16px 48px rgba(0,0,0,0.55);
		position: fixed;
		inset: 0;
		width: min(640px, calc(100vw - 1rem));
		/* Definite height — fit-content + max-height collapses the flex:1 body
		   to near-zero on mobile (dialog only shows header + footer). */
		height: min(85dvh, 720px);
		overflow: hidden;
	}
	.denizen-dialog[open] {
		display: flex;
		flex-direction: column;
	}
	.denizen-dialog::backdrop {
		background: rgba(0,0,0,0.6);
		backdrop-filter: blur(2px);
	}

	/* ── Shared header / footer ────────────────────────────────────── */
	.dd-header {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 14px;
		border-bottom: 1px solid var(--border);
		background: var(--bg-control);
		border-radius: 8px 8px 0 0;
		flex-shrink: 0;
	}

	.dd-title {
		font-family: var(--font-display);
		font-size: 0.78rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-accent);
		flex: 1;
	}

	.dd-back-btn {
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
	.dd-back-btn:hover { color: var(--text); border-color: var(--border-mid); }

	.dd-footer {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		padding: 10px 14px;
		border-top: 1px solid var(--border);
		flex-shrink: 0;
	}

	/* ── Table view ────────────────────────────────────────────────── */
	.dd-table-wrap {
		flex: 1;
		overflow-y: auto;
		min-height: 0;
	}

	.dd-table {
		width: 100%;
		border-collapse: collapse;
		font-family: var(--font-ui);
		font-size: 0.78rem;
	}

	.dd-table th {
		position: sticky;
		top: 0;
		background: var(--bg-inset);
		color: var(--text-dimmer);
		font-size: 0.62rem;
		font-weight: 700;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		padding: 6px 12px;
		border-bottom: 2px solid var(--border);
		text-align: left;
		white-space: nowrap;
		z-index: 1;
	}

	.dd-table td {
		padding: 6px 12px;
		border-bottom: 1px solid var(--border);
		color: var(--text);
		vertical-align: middle;
	}

	.dd-range {
		font-variant-numeric: tabular-nums;
		color: var(--text-dimmer);
		white-space: nowrap;
		width: 4rem;
	}

	.dd-freq {
		color: var(--text-muted);
		white-space: nowrap;
		width: 8rem;
	}

	.dd-foe-name {
		color: var(--text);
	}

	.dd-table tbody tr:hover td { background: var(--bg-hover); }

	.dd-row-rolled td {
		background: color-mix(in srgb, var(--text-accent) 12%, transparent) !important;
		color: var(--text-accent);
		font-weight: 600;
	}

	/* ── Result view: back bar ─────────────────────────────────────── */
	.dd-back-bar {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 10px 14px;
		border-bottom: 1px solid var(--border);
		background: var(--bg-control);
		border-radius: 8px 8px 0 0;
		flex-shrink: 0;
	}
	.dd-back-bar .dd-title { flex: 1; }
	.dd-back-btn { flex-shrink: 0; }

	/* ── Result scroll area ────────────────────────────────────────── */
	.dd-result-scroll {
		flex: 1;
		overflow-y: auto;
		min-height: 0;
		padding: 0.75rem 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	/* ── Top row: portrait + quantity/pills ────────────────────────── */
	.dd-confirm-top {
		display: flex;
		flex-direction: column;
		gap: 0.65rem;
	}

	@media (min-width: 520px) {
		.dd-confirm-top {
			flex-direction: row;
			align-items: flex-start;
			gap: 0.85rem;
		}
		.dd-portrait-wrap {
			flex: 0 0 45%;
			max-width: 45%;
		}
		.dd-qty-section { flex: 1; }
	}

	.dd-portrait-wrap { width: 100%; }

	:global(.dd-portrait) {
		width: 100%;
		aspect-ratio: 1;
		object-fit: cover;
		border-radius: 6px;
		border: 1px solid var(--border-mid);
		display: block;
	}

	.dd-qty-section {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		min-width: 0;
	}

	/* ── Quantity fieldset ─────────────────────────────────────────── */
	.dd-quantity-group {
		border: 1px solid var(--border);
		border-radius: 6px;
		padding: 0.35rem 0.6rem 0.5rem;
		margin: 0;
	}

	.dd-quantity-legend {
		font-family: var(--font-ui);
		font-size: 0.65rem;
		font-weight: 600;
		letter-spacing: 0.07em;
		text-transform: uppercase;
		color: var(--text-dimmer);
		padding: 0 4px;
	}

	.dd-qty-label {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 3px 4px;
		border-radius: 4px;
		cursor: pointer;
		transition: background 0.1s;
	}
	.dd-qty-label:hover { background: rgba(255,255,255,0.05); }
	.dd-qty-label.selected { background: rgba(255,255,255,0.08); }
	.dd-qty-label input[type="radio"] { flex-shrink: 0; accent-color: var(--text-accent); }

	.dd-qty-name {
		font-family: var(--font-ui);
		font-size: 0.80rem;
		font-weight: 600;
		color: var(--text);
	}

	/* ── Pills ─────────────────────────────────────────────────────── */
	.dd-pills {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		align-items: center;
	}

	.dd-badge {
		font-family: var(--font-ui);
		font-size: 0.6rem;
		font-weight: 600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		padding: 2px 7px;
		border-radius: 10px;
		border: 1px solid color-mix(in srgb, currentColor 35%, transparent);
		white-space: nowrap;
	}
	.dd-badge--rank { background: rgba(255,255,255,0.06); color: var(--text-muted); }

	.dd-stat-pill {
		font-family: var(--font-ui);
		font-size: 0.6rem;
		font-weight: 600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		padding: 2px 7px;
		border-radius: 10px;
		white-space: nowrap;
	}
	.dd-stat-pill--harm     { background: rgba(239,68,68,0.10);   color: #ef4444; border: 1px solid rgba(239,68,68,0.25); }
	.dd-stat-pill--progress { background: rgba(59,130,246,0.10);  color: #60a5fa; border: 1px solid rgba(59,130,246,0.25); }
	.dd-stat-pill--qty      { background: rgba(255,255,255,0.08); color: var(--text-muted); border: 1px solid color-mix(in srgb, currentColor 35%, transparent); }

	/* ── Bottom: description + sections ───────────────────────────── */
	.dd-confirm-bottom {
		display: flex;
		flex-direction: column;
		gap: 0.65rem;
	}

	.dd-desc {
		font-family: var(--font-ui);
		font-size: 0.78rem;
		line-height: 1.55;
		color: var(--text-muted);
		margin: 0;
	}

	.dd-section {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.dd-section-label {
		font-family: var(--font-ui);
		font-size: 0.65rem;
		font-weight: 600;
		letter-spacing: 0.07em;
		text-transform: uppercase;
		color: var(--text-dimmer);
	}

	.dd-list {
		margin: 0;
		padding-left: 1.2em;
		list-style: disc;
	}
	.dd-list li {
		font-family: var(--font-ui);
		font-size: 0.78rem;
		color: var(--text-muted);
		margin-bottom: 1px;
	}

	/* ── No-foe fallback ───────────────────────────────────────────── */
	.dd-no-foe {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 2rem 1rem;
		text-align: center;
	}

	.dd-no-foe-roll {
		font-family: var(--font-ui);
		font-size: 0.9rem;
		color: var(--text);
		margin: 0;
	}

	.dd-no-foe-name {
		font-family: var(--font-ui);
		font-size: 0.78rem;
		font-style: italic;
		color: var(--text-muted);
		margin: 0;
	}
</style>
