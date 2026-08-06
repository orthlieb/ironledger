<script lang="ts">
	/**
	 * FoeRollDialog — a generic "roll a d100 foe table → foe detail → Add to
	 * Foes" dialog, extracted from the old site-only DenizenDialog. It's driven
	 * entirely by props so it can back BOTH the delve denizen table (fixed
	 * frequency bands + per-site foe names) and extension roll-tables (arbitrary
	 * ranges + foe ids):
	 *
	 *   • `rows`    — the d100 table: `{ low, high, ref, label?, range? }[]`.
	 *   • `resolve` — maps a row's `ref` to a FoeDef (by name for denizens, by
	 *     id for roll-tables) — the dialog never cares which.
	 *   • `title` / `logLabel` — dialog heading + log-entry prefix.
	 *   • `onSelect` — Add to Foes callback (foe, quantity, effective rank).
	 *
	 * View 1 (table): read-only table (d100 [· label] · foe), "Roll d100".
	 * View 2 (result): rolled foe detail (portrait, quantity, pills, description)
	 *                  with Back → table and "Add to Foes".
	 *
	 * Usage:
	 *   <FoeRollDialog bind:this={ref} {title} {logLabel} {rows} {resolve} {onSelect} />
	 *   ref.open();
	 */

	import type { FoeDef, FoeQuantity, FoeRollRow } from '$lib/types.js';
	import { headingText } from '$lib/fontStore.svelte.js';
	import { Dialog, RadioGroup } from 'bits-ui';
	import DialogHeader from '$lib/components/DialogHeader.svelte';
	import { rankBadgeStyle } from '$lib/badgeStyles.js';
	import {
		FOE_RANKS,
		FOE_QUANTITIES,
		FOE_NATURE_COLORS,
		effectiveRank as calcEffectiveRank,
	} from '$lib/foeStore.svelte.js';
	import { animateDice, DIE_BLACK, DIE_WHITE } from '$lib/dice.js';
	import { appendLog } from '$lib/log.svelte.js';
	import FoeImageCarousel from '$lib/components/FoeImageCarousel.svelte';

	let {
		title,
		logLabel,
		rows,
		resolve,
		onSelect,
	}: {
		title: string;
		logLabel: string;
		rows: FoeRollRow[];
		resolve: (ref: string) => FoeDef | undefined;
		onSelect: (foeDef: FoeDef, quantity: FoeQuantity, effectiveRank: number) => void;
	} = $props();

	// ---------------------------------------------------------------------------
	// State
	// ---------------------------------------------------------------------------
	let dialogOpen = $state(false);
	// Focus target for the CLAUDE.md dialog focus rule — Roll is the primary
	// default action on the table view (no search field).
	let rollBtnEl = $state<HTMLButtonElement | null>(null);
	let view = $state<'table' | 'result'>('table');
	let rolling = $state(false);
	let rolledRow = $state<FoeRollRow | null>(null);
	let quantity = $state<FoeQuantity>('solo');

	// ---------------------------------------------------------------------------
	// Derived
	// ---------------------------------------------------------------------------
	/** Show the label column only when some row carries one (denizen frequency). */
	const hasLabels = $derived(rows.some((r) => !!r.label));
	const rolledFoe = $derived(rolledRow ? (resolve(rolledRow.ref) ?? null) : null);
	const rolledName = $derived(rolledFoe?.name ?? rolledRow?.ref ?? '');
	const natureColor = $derived(
		rolledFoe ? (FOE_NATURE_COLORS[rolledFoe.nature] ?? '#7A9AB8') : '#7A9AB8',
	);
	const rankAdj = $derived(FOE_QUANTITIES.find((q) => q.value === quantity)?.rankAdj ?? 0);
	const effRank = $derived(rolledFoe ? calcEffectiveRank(rolledFoe.rank, rankAdj) : 1);
	const rankInfo = $derived(FOE_RANKS[effRank]);

	/** "3" for a single value, "3–5" for a span; a row's own `range` wins. */
	function rangeStr(r: FoeRollRow): string {
		return r.range ?? (r.low === r.high ? String(r.low) : `${r.low}–${r.high}`);
	}

	// ---------------------------------------------------------------------------
	// Public API
	// ---------------------------------------------------------------------------
	export function open(): void {
		view = 'table';
		rolling = false;
		rolledRow = null;
		quantity = 'solo';
		dialogOpen = true;
	}

	export function close(): void {
		dialogOpen = false;
	}

	// ---------------------------------------------------------------------------
	// Rolling
	// ---------------------------------------------------------------------------
	async function roll(): Promise<void> {
		if (rolling) return;
		rolling = true;

		const rollVal = Math.floor(Math.random() * 100) + 1;
		const row = rows.find((r) => rollVal >= r.low && rollVal <= r.high) ?? null;

		// Close dialog so dice animation is visible
		dialogOpen = false;

		const tensV = Math.floor((rollVal % 100) / 10) || 10;
		const onesV = rollVal % 10 || 10;
		await animateDice([
			{ sides: 10, value: tensV, color: DIE_BLACK },
			{ sides: 10, value: onesV, color: DIE_WHITE },
		]);

		const foeName = row ? (resolve(row.ref)?.name ?? row.ref) : '';
		const cellPart = row ? (row.label ? `${row.label} (${rangeStr(row)})` : rangeStr(row)) : '';
		appendLog(
			logLabel,
			`<div>Rolled d100: <strong>${rollVal}</strong> → ${cellPart}${foeName ? `: <strong>${foeName}</strong>` : ''}</div>`,
		);

		rolledRow = row;
		quantity = 'solo';
		rolling = false;
		view = 'result';

		// Reopen dialog to show result
		dialogOpen = true;
	}

	// ---------------------------------------------------------------------------
	// Confirm (add foe)
	// ---------------------------------------------------------------------------
	function confirm(): void {
		if (!rolledFoe) return;
		const qty = quantity;
		const er = effRank;
		dialogOpen = false;
		onSelect(rolledFoe, qty, er);
	}
</script>

<Dialog.Root bind:open={dialogOpen}>
	<Dialog.Portal>
		<Dialog.Overlay class="denizen-overlay" />
		<Dialog.Content
			class="denizen-dialog"
			aria-label={title}
			onOpenAutoFocus={(e) => {
				// In table view, focus the primary Roll button. Result view
				// gets bits-ui's default (usually the Back button).
				if (view !== 'table') return;
				e.preventDefault();
				setTimeout(() => rollBtnEl?.focus(), 0);
			}}
		>
			<!-- ===== TABLE VIEW ===== -->
			{#if view === 'table'}
				<DialogHeader title={headingText(title)} radius="8px 8px 0 0" />

				<div class="dd-table-wrap">
					<table class="dd-table">
						<thead>
							<tr>
								<th>d100</th>
								{#if hasLabels}<th>Frequency</th>{/if}
								<th>Foe</th>
							</tr>
						</thead>
						<tbody>
							{#each rows as row, i}
								<tr
									class:dd-row-rolled={rolledRow?.low === row.low && rolledRow?.high === row.high}
								>
									<td class="dd-range">{rangeStr(row)}</td>
									{#if hasLabels}<td class="dd-freq">{row.label ?? ''}</td>{/if}
									<td class="dd-foe-name">{resolve(row.ref)?.name ?? (row.ref || '—')}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>

				<div class="dd-footer">
					<button class="btn" onclick={close}>Cancel</button>
					<button bind:this={rollBtnEl} class="btn btn-primary" onclick={roll} disabled={rolling}>
						{rolling ? 'Rolling…' : 'Roll d100'}
					</button>
				</div>

				<!-- ===== RESULT VIEW ===== -->
			{:else if view === 'result'}
				{@const qtyDef = FOE_QUANTITIES.find((q) => q.value === quantity)}

				<DialogHeader
					title={headingText(rolledFoe?.name ?? (rolledName || 'Unknown Foe'))}
					radius="8px 8px 0 0"
				/>

				<div class="dd-result-scroll">
					{#if rolledFoe && rankInfo}
						<!-- Top row: portrait + quantity/pills -->
						<div class="dd-confirm-top">
							<div class="dd-portrait-wrap">
								<FoeImageCarousel
									name={rolledFoe.name}
									images={rolledFoe.images}
									alt={rolledFoe.name}
									class="dd-portrait"
								/>
							</div>

							<div class="dd-qty-section">
								<RadioGroup.Root
									class="dd-quantity-group"
									value={quantity}
									onValueChange={(v) => (quantity = v as typeof quantity)}
									aria-label="Quantity"
								>
									<span class="dd-quantity-legend">Quantity</span>
									{#each FOE_QUANTITIES as qty}
										<label class="dd-qty-label" class:selected={quantity === qty.value}>
											<RadioGroup.Item value={qty.value} class="dd-qty-radio">
												<span class="dd-qty-radio-dot"></span>
											</RadioGroup.Item>
											<span class="dd-qty-name">{qty.label}</span>
										</label>
									{/each}
								</RadioGroup.Root>

								<div class="dd-pills">
									<span class="dd-badge" style="background: {natureColor}22; color: {natureColor}"
										>{rolledFoe.nature}</span
									>
									<span class="dd-badge dd-badge--rank" style={rankBadgeStyle(effRank)}
										>{rankInfo.label}</span
									>
									<span class="dd-stat-pill dd-stat-pill--harm">Harm: {rankInfo.harm}</span>
									<span class="dd-stat-pill dd-stat-pill--progress"
										>Progress: {rankInfo.progressPerHit}</span
									>
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
							{#if rolledRow}
								<p class="dd-no-foe-roll">Rolled <strong>{rangeStr(rolledRow)}</strong></p>
							{/if}
							{#if rolledRow?.ref}
								<p class="dd-no-foe-name">"{rolledRow.ref}" is not in the foe catalogue.</p>
							{:else}
								<p class="dd-no-foe-name">No foe assigned for this range.</p>
							{/if}
						</div>
					{/if}
				</div>

				<div class="dd-footer">
					<button class="btn back-btn" onclick={() => (view = 'table')} style="margin-right: auto"
						>Back</button
					>
					<button class="btn" onclick={close}>Cancel</button>
					{#if rolledFoe}
						<button class="btn btn-primary" onclick={confirm}>Add to Foes</button>
					{/if}
				</div>
			{/if}
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<style>
	/* bits-ui portals Content + Overlay to <body>; scope everything
	   globally. Overlay 80 / content 81 matches the modal z-index tier. */
	:global(.denizen-overlay) {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.6);
		backdrop-filter: blur(2px);
		z-index: 80;
	}
	:global(.denizen-dialog) {
		display: flex;
		flex-direction: column;
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: min(640px, calc(100vw - 1rem));
		height: min(85vh, 720px);
		background: var(--bg-card);
		color: var(--text);
		border: 1px solid var(--border);
		border-radius: 8px;
		box-shadow: 0 16px 48px rgba(0, 0, 0, 0.55);
		overflow: hidden;
		outline: none;
		z-index: 81;
	}

	/* ── Shared header / footer ────────────────────────────────────── */

	:global(.dd-footer) {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		padding: 10px 14px;
		border-top: 1px solid var(--border);
		flex-shrink: 0;
	}

	/* ── Table view ────────────────────────────────────────────────── */
	:global(.dd-table-wrap) {
		flex: 1;
		overflow-y: auto;
		overscroll-behavior: contain;
		min-height: 0;
	}

	:global(.dd-table) {
		width: 100%;
		border-collapse: collapse;
		font-family: var(--font-ui);
		font-size: 0.78rem;
	}

	:global(.dd-table th) {
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

	:global(.dd-table td) {
		padding: 6px 12px;
		border-bottom: 1px solid var(--border);
		color: var(--text);
		vertical-align: middle;
	}

	:global(.dd-range) {
		font-variant-numeric: tabular-nums;
		color: var(--text-dimmer);
		white-space: nowrap;
		width: 4rem;
	}

	:global(.dd-freq) {
		color: var(--text-muted);
		white-space: nowrap;
		width: 8rem;
	}

	:global(.dd-foe-name) {
		color: var(--text);
	}

	:global(.dd-table tbody tr:hover td) {
		background: var(--bg-hover);
	}

	:global(.dd-row-rolled td) {
		background: color-mix(in srgb, var(--text-accent) 12%, transparent) !important;
		color: var(--text-accent);
		font-weight: 600;
	}

	/* ── Result view: back bar ─────────────────────────────────────── */
	/* ── Result scroll area ────────────────────────────────────────── */
	:global(.dd-result-scroll) {
		flex: 1;
		overflow-y: auto;
		overscroll-behavior: contain;
		min-height: 0;
		padding: 0.75rem 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	/* ── Top row: portrait + quantity/pills ────────────────────────── */
	:global(.dd-confirm-top) {
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
		.dd-qty-section {
			flex: 1;
		}
	}

	:global(.dd-portrait-wrap) {
		width: 100%;
	}

	:global(.dd-portrait) {
		width: 100%;
		aspect-ratio: 1;
		object-fit: cover;
		border-radius: 6px;
		border: 1px solid var(--border-mid);
		display: block;
	}

	:global(.dd-qty-section) {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		min-width: 0;
	}

	/* ── Quantity fieldset ─────────────────────────────────────────── */
	:global(.dd-quantity-group) {
		border: 1px solid var(--border);
		border-radius: 6px;
		padding: 0.35rem 0.6rem 0.5rem;
		margin: 0;
	}

	:global(.dd-quantity-legend) {
		font-family: var(--font-ui);
		font-size: 0.65rem;
		font-weight: 600;
		letter-spacing: 0.07em;
		text-transform: uppercase;
		color: var(--text-dimmer);
		padding: 0 4px;
	}

	:global(.dd-qty-label) {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 3px 4px;
		border-radius: 4px;
		cursor: pointer;
		transition: background 0.1s;
	}
	:global(.dd-qty-label:hover) {
		background: rgba(255, 255, 255, 0.05);
	}
	:global(.dd-qty-label.selected) {
		background: rgba(255, 255, 255, 0.08);
	}
	:global(.dd-qty-radio) {
		flex-shrink: 0;
		width: 14px;
		height: 14px;
		padding: 0;
		background: var(--bg-control);
		border: 1px solid var(--border-mid);
		border-radius: 999px;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}
	:global(.dd-qty-radio:focus-visible) {
		outline: 2px solid var(--text-accent);
		outline-offset: 1px;
	}
	:global(.dd-qty-radio[data-state='checked']) {
		border-color: var(--text-accent);
	}
	:global(.dd-qty-radio-dot) {
		width: 7px;
		height: 7px;
		border-radius: 999px;
		background: var(--text-accent);
		opacity: 0;
	}
	:global(.dd-qty-radio[data-state='checked'] .dd-qty-radio-dot) {
		opacity: 1;
	}

	:global(.dd-qty-name) {
		font-family: var(--font-ui);
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--text);
	}

	/* ── Pills ─────────────────────────────────────────────────────── */
	:global(.dd-pills) {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		align-items: center;
	}

	:global(.dd-badge) {
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
	:global(.dd-badge--rank) {
		background: rgba(255, 255, 255, 0.06);
		color: var(--text-muted);
	}

	:global(.dd-stat-pill) {
		font-family: var(--font-ui);
		font-size: 0.6rem;
		font-weight: 600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		padding: 2px 7px;
		border-radius: 10px;
		white-space: nowrap;
	}
	:global(.dd-stat-pill--harm) {
		background: rgba(239, 68, 68, 0.1);
		color: #ef4444;
		border: 1px solid rgba(239, 68, 68, 0.25);
	}
	:global(.dd-stat-pill--progress) {
		background: rgba(59, 130, 246, 0.1);
		color: #60a5fa;
		border: 1px solid rgba(59, 130, 246, 0.25);
	}
	:global(.dd-stat-pill--qty) {
		background: rgba(255, 255, 255, 0.08);
		color: var(--text-muted);
		border: 1px solid color-mix(in srgb, currentColor 35%, transparent);
	}

	/* ── Bottom: description + sections ───────────────────────────── */
	:global(.dd-confirm-bottom) {
		display: flex;
		flex-direction: column;
		gap: 0.65rem;
	}

	:global(.dd-desc) {
		font-family: var(--font-ui);
		font-size: 0.78rem;
		line-height: 1.55;
		color: var(--text-muted);
		margin: 0;
	}

	:global(.dd-section) {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	:global(.dd-section-label) {
		font-family: var(--font-ui);
		font-size: 0.65rem;
		font-weight: 600;
		letter-spacing: 0.07em;
		text-transform: uppercase;
		color: var(--text-dimmer);
	}

	:global(.dd-list) {
		margin: 0;
		padding-left: 1.2em;
		list-style: disc;
	}
	:global(.dd-list li) {
		font-family: var(--font-ui);
		font-size: 0.78rem;
		color: var(--text-muted);
		margin-bottom: 1px;
	}

	/* ── No-foe fallback ───────────────────────────────────────────── */
	:global(.dd-no-foe) {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 2rem 1rem;
		text-align: center;
	}

	:global(.dd-no-foe-roll) {
		font-family: var(--font-ui);
		font-size: 0.9rem;
		color: var(--text);
		margin: 0;
	}

	:global(.dd-no-foe-name) {
		font-family: var(--font-ui);
		font-size: 0.78rem;
		font-style: italic;
		color: var(--text-muted);
		margin: 0;
	}
</style>
