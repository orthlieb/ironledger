<script lang="ts">
	/**
	 * AssetRollDialog — a generic "roll a d100 asset table → asset detail (with
	 * flavor narrative) → Add to Character" dialog. The asset-side sibling of
	 * FoeRollDialog, it backs resolver oracles that resolve to an asset — namely
	 * Lodestar's Prelude Event, attached to the asset picker.
	 *
	 *   • `rows`     — the d100 table: `{ low, high, ref, category?, text? }[]`
	 *                  (`ref` = catalogue asset id, `text` = prelude narrative).
	 *   • `resolve`  — maps a row's `ref` to an AssetDefinition (findAsset).
	 *   • `title` / `logLabel` — dialog heading + log-entry prefix.
	 *   • `onSelect` — Add to Character callback, given the asset id.
	 *
	 * View 1 (table): read-only d100 · category · asset, "Roll d100".
	 * View 2 (result): rolled asset detail (category badge, prelude narrative,
	 *                  preamble, abilities) with Back → table and Add to Character.
	 *
	 * Usage:
	 *   <AssetRollDialog bind:this={ref} {title} {logLabel} {rows} {resolve} {onSelect} />
	 *   ref.open();
	 */
	import type { AssetDefinition, AssetRollRow } from '$lib/types.js';
	import { headingText } from '$lib/fontStore.svelte.js';
	import { Dialog } from 'bits-ui';
	import DialogHeader from '$lib/components/DialogHeader.svelte';
	import { animateDice, DIE_BLACK, DIE_WHITE } from '$lib/dice.js';
	import { appendLog } from '$lib/log.svelte.js';
	import { assetIcon } from '$lib/iconRegistry.js';

	let {
		title,
		logLabel,
		rows,
		resolve,
		onSelect,
	}: {
		title: string;
		logLabel: string;
		rows: AssetRollRow[];
		resolve: (ref: string) => AssetDefinition | undefined;
		onSelect: (assetId: string) => void;
	} = $props();

	// Category accent colours — shared with AssetPicker / AssetCard.
	const CAT_COLOR: Record<string, string> = {
		'Combat Talent': 'var(--color-iron)',
		Path: 'var(--color-edge)',
		Companion: 'var(--color-heart)',
		Ritual: 'var(--color-mana)',
		Touched: 'var(--color-touched)',
	};

	// ---------------------------------------------------------------------------
	// State
	// ---------------------------------------------------------------------------
	let dialogOpen = $state(false);
	// Focus target for the CLAUDE.md dialog focus rule — Roll is the primary
	// default action on the table view (no search field).
	let rollBtnEl = $state<HTMLButtonElement | null>(null);
	let view = $state<'table' | 'result'>('table');
	let rolling = $state(false);
	let rolledRow = $state<AssetRollRow | null>(null);

	// ---------------------------------------------------------------------------
	// Derived
	// ---------------------------------------------------------------------------
	const rolledAsset = $derived(rolledRow ? (resolve(rolledRow.ref) ?? null) : null);
	const rolledCategory = $derived(rolledAsset?.category ?? rolledRow?.category ?? '');
	const catColor = $derived(CAT_COLOR[rolledCategory] ?? 'var(--text-muted)');
	/** Enabled starting abilities — the ones the asset grants on acquisition. */
	const startingAbilities = $derived((rolledAsset?.abilities ?? []).filter((a) => a.enabled));

	/** "3" for a single value, "3–5" for a span. */
	function rangeStr(r: AssetRollRow): string {
		return r.low === r.high ? String(r.low) : `${r.low}–${r.high}`;
	}
	/** Plain-text preview of asset copy: drop markdown links `[t](u)` → `t`,
	 *  strip HTML tags (ability text carries `<a class="move-link">…</a>` and the
	 *  like) keeping their inner text, and collapse whitespace. Rendered as text
	 *  (not `{@html}`) so the roll-result preview stays inert and readable. */
	function previewText(raw: string): string {
		return raw
			.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
			.replace(/<[^>]+>/g, '')
			.replace(/\s+/g, ' ')
			.trim();
	}

	// ---------------------------------------------------------------------------
	// Public API
	// ---------------------------------------------------------------------------
	export function open(): void {
		view = 'table';
		rolling = false;
		rolledRow = null;
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

		// Close dialog so the dice animation is visible.
		dialogOpen = false;
		const tensV = Math.floor((rollVal % 100) / 10) || 10;
		const onesV = rollVal % 10 || 10;
		await animateDice([
			{ sides: 10, value: tensV, color: DIE_BLACK },
			{ sides: 10, value: onesV, color: DIE_WHITE },
		]);

		const assetName = row ? (resolve(row.ref)?.name ?? row.ref) : '';
		const cat = row?.category ? `${row.category}: ` : '';
		appendLog(
			logLabel,
			`<div>Rolled d100: <strong>${rollVal}</strong> → ${cat}${assetName ? `<strong>${assetName}</strong>` : '—'}</div>`,
		);

		rolledRow = row;
		rolling = false;
		view = 'result';
		dialogOpen = true;
	}

	// ---------------------------------------------------------------------------
	// Confirm (add asset)
	// ---------------------------------------------------------------------------
	function confirm(): void {
		if (!rolledAsset) return;
		const id = rolledAsset.id;
		dialogOpen = false;
		onSelect(id);
	}
</script>

<Dialog.Root bind:open={dialogOpen}>
	<Dialog.Portal>
		<Dialog.Overlay class="prd-overlay" />
		<Dialog.Content
			class="prd-dialog"
			aria-label={title}
			onOpenAutoFocus={(e) => {
				if (view !== 'table') return;
				e.preventDefault();
				setTimeout(() => rollBtnEl?.focus(), 0);
			}}
		>
			<!-- ===== TABLE VIEW ===== -->
			{#if view === 'table'}
				<DialogHeader title={headingText(title)} radius="8px 8px 0 0" />

				<div class="prd-table-wrap">
					<table class="prd-table">
						<thead>
							<tr>
								<th>d100</th>
								<th>Category</th>
								<th>Asset</th>
							</tr>
						</thead>
						<tbody>
							{#each rows as row, i (i)}
								<tr
									class:prd-row-rolled={rolledRow?.low === row.low && rolledRow?.high === row.high}
								>
									<td class="prd-range">{rangeStr(row)}</td>
									<td class="prd-cat">{row.category ?? ''}</td>
									<td class="prd-asset-name">{resolve(row.ref)?.name ?? (row.ref || '—')}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>

				<div class="prd-footer">
					<button class="btn" onclick={close}>Cancel</button>
					<button bind:this={rollBtnEl} class="btn btn-primary" onclick={roll} disabled={rolling}>
						{rolling ? 'Rolling…' : 'Roll d100'}
					</button>
				</div>

				<!-- ===== RESULT VIEW ===== -->
			{:else if view === 'result'}
				<DialogHeader
					title={headingText(rolledAsset?.name ?? (rolledRow?.ref || 'Unknown Asset'))}
					radius="8px 8px 0 0"
				/>

				<div class="prd-result-scroll">
					{#if rolledAsset}
						<div class="prd-result-head" style:--cat-color={catColor}>
							<span class="prd-asset-icon" aria-hidden="true">{@html assetIcon(rolledAsset)}</span>
							<span class="prd-cat-badge">{rolledCategory}</span>
						</div>

						{#if rolledRow?.text}
							<blockquote class="prd-prelude">{rolledRow.text}</blockquote>
						{/if}

						{#if rolledAsset.preamble}
							<p class="prd-preamble">{previewText(rolledAsset.preamble)}</p>
						{/if}

						{#if startingAbilities.length > 0}
							<div class="prd-abilities">
								<span class="prd-section-label">Abilities</span>
								<ul class="prd-ability-list">
									{#each startingAbilities as ab (ab.text)}
										<li>
											{#if ab.name}<strong>{ab.name}.</strong>
											{/if}{previewText(ab.text)}
										</li>
									{/each}
								</ul>
							</div>
						{/if}
					{:else}
						<div class="prd-no-asset">
							{#if rolledRow}
								<p class="prd-no-asset-roll">Rolled <strong>{rangeStr(rolledRow)}</strong></p>
							{/if}
							{#if rolledRow?.ref}
								<p class="prd-no-asset-ref">"{rolledRow.ref}" is not in the asset catalogue.</p>
							{/if}
						</div>
					{/if}
				</div>

				<div class="prd-footer">
					<button class="btn prd-back" onclick={() => (view = 'table')} style="margin-right: auto"
						>Back</button
					>
					<button class="btn" onclick={close}>Cancel</button>
					<button class="btn btn-primary" onclick={confirm} disabled={!rolledAsset}
						>Add to Character</button
					>
				</div>
			{/if}
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<style>
	/* bits-ui portals Content + Overlay to <body>; scope everything globally.
	   Overlay 80 / content 81 matches the modal z-index tier used across the
	   app's dialogs. Self-contained (own `prd-*` namespace) so it never depends
	   on FoeRollDialog's styles being mounted. */
	:global(.prd-overlay) {
		position: fixed;
		inset: 0;
		z-index: 80;
		background: rgba(0, 0, 0, 0.5);
	}
	:global(.prd-dialog) {
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		z-index: 81;
		width: min(560px, calc(100vw - 32px));
		max-height: min(80vh, 720px);
		display: flex;
		flex-direction: column;
		background: var(--bg-panel, var(--bg-card));
		border: 1px solid var(--border-mid);
		border-radius: 8px;
		box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4);
		overflow: hidden;
	}

	/* ── Table view ─────────────────────────────────────────────────────── */
	:global(.prd-table-wrap) {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		overscroll-behavior: contain;
	}
	:global(.prd-table) {
		width: 100%;
		border-collapse: collapse;
		font-family: var(--font-ui);
		font-size: 0.82rem;
	}
	:global(.prd-table thead th) {
		position: sticky;
		top: 0;
		background: var(--bg-elevated, var(--bg-card));
		text-align: left;
		font-size: 0.62rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-dimmer);
		padding: 8px 14px;
		border-bottom: 1px solid var(--border-mid);
	}
	:global(.prd-table tbody td) {
		padding: 7px 14px;
		border-bottom: 1px solid var(--border-subtle, var(--border-mid));
		color: var(--text-body);
	}
	:global(.prd-table tbody tr:nth-child(even)) {
		background: color-mix(in srgb, var(--text-body) 3%, transparent);
	}
	:global(.prd-range) {
		white-space: nowrap;
		color: var(--text-dimmer);
		font-variant-numeric: tabular-nums;
	}
	:global(.prd-cat) {
		white-space: nowrap;
		color: var(--text-muted);
	}
	:global(.prd-asset-name) {
		font-weight: 600;
	}
	:global(.prd-row-rolled) {
		background: color-mix(in srgb, var(--text-accent) 16%, transparent) !important;
	}

	/* ── Result view ────────────────────────────────────────────────────── */
	:global(.prd-result-scroll) {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		overscroll-behavior: contain;
		padding: 14px 16px 4px;
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	:global(.prd-result-head) {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	:global(.prd-asset-icon) {
		display: inline-flex;
		color: var(--cat-color);
	}
	:global(.prd-asset-icon svg) {
		width: 26px;
		height: 26px;
		fill: currentColor;
	}
	:global(.prd-cat-badge) {
		font-family: var(--font-ui);
		font-size: 0.66rem;
		font-weight: 700;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: #fff;
		background: var(--cat-color);
		padding: 3px 9px;
		border-radius: 999px;
	}
	:global(.prd-prelude) {
		margin: 0;
		padding: 10px 14px;
		border-left: 3px solid var(--cat-color, var(--text-accent));
		background: color-mix(in srgb, var(--cat-color, var(--text-accent)) 8%, transparent);
		border-radius: 0 6px 6px 0;
		font-family: var(--font-ui);
		font-size: 0.86rem;
		font-style: italic;
		line-height: 1.5;
		color: var(--text-body);
	}
	:global(.prd-preamble) {
		margin: 0;
		font-family: var(--font-ui);
		font-size: 0.84rem;
		line-height: 1.5;
		color: var(--text-muted);
	}
	:global(.prd-section-label) {
		display: block;
		font-family: var(--font-ui);
		font-size: 0.62rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-dimmer);
		margin-bottom: 4px;
	}
	:global(.prd-ability-list) {
		margin: 0;
		padding-left: 18px;
		display: flex;
		flex-direction: column;
		gap: 6px;
		font-family: var(--font-ui);
		font-size: 0.84rem;
		line-height: 1.45;
		color: var(--text-body);
	}
	:global(.prd-no-asset) {
		padding: 20px 4px;
		text-align: center;
		color: var(--text-muted);
		font-family: var(--font-ui);
	}
	:global(.prd-no-asset-ref) {
		font-size: 0.8rem;
		color: var(--text-dimmer);
	}

	/* ── Footer ─────────────────────────────────────────────────────────── */
	/* Buttons group at the right; the result view's Back button carries an
	   inline `margin-right:auto` to sit at the far left. */
	:global(.prd-footer) {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		padding: 10px 14px;
		border-top: 1px solid var(--border-mid);
		background: var(--bg-elevated, var(--bg-card));
	}
</style>
