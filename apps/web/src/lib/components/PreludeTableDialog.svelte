<script lang="ts">
	/**
	 * PreludeTableDialog — the Prelude Event *oracle* entry point (Ask/Oracles
	 * list). Unlike the asset picker's d6 button (which rolls instantly), the
	 * oracle brings up the d100 table so the player can see it, then rolls on
	 * demand. Rolling animates the dice and hands off — via `firePreludeOracle` —
	 * to the character's asset-detail dialog (which shows the prelude narrative
	 * on top); this dialog closes first so nothing stacks.
	 *
	 * Usage:
	 *   <PreludeTableDialog bind:this={ref} />
	 *   ref.open();
	 */
	import { headingText } from '$lib/fontStore.svelte.js';
	import { Dialog } from 'bits-ui';
	import DialogHeader from '$lib/components/DialogHeader.svelte';
	import { animateDice, DIE_BLACK, DIE_WHITE } from '$lib/dice.js';
	import { findAsset } from '$lib/assetStore.svelte.js';
	import { getPreludeTable, firePreludeOracle } from '$lib/preludeOracle.svelte.js';

	let {
		onBack,
	}: {
		/** When set (invoked from the Oracle selection list), the footer shows a
		 *  "← Back" that returns to the oracle picker. */
		onBack?: () => void;
	} = $props();

	let dialogOpen = $state(false);
	let rolling = $state(false);
	let rollBtnEl = $state<HTMLButtonElement | null>(null);

	const table = $derived(getPreludeTable());
	const rows = $derived(table?.entries ?? []);

	function rangeStr(r: { low: number; high: number }): string {
		return r.low === r.high ? String(r.low) : `${r.low}–${r.high}`;
	}

	export function open(): void {
		rolling = false;
		dialogOpen = true;
	}
	export function close(): void {
		dialogOpen = false;
	}

	async function roll(): Promise<void> {
		if (rolling || !table) return;
		rolling = true;
		const val = Math.floor(Math.random() * 100) + 1;
		// Close so the dice animation is visible, then hand off to the asset
		// detail dialog (firePreludeOracle logs + dispatches the resolved asset).
		dialogOpen = false;
		const tensV = Math.floor((val % 100) / 10) || 10;
		const onesV = val % 10 || 10;
		await animateDice([
			{ sides: 10, value: tensV, color: DIE_BLACK },
			{ sides: 10, value: onesV, color: DIE_WHITE },
		]);
		firePreludeOracle(val);
		rolling = false;
	}
</script>

<Dialog.Root bind:open={dialogOpen}>
	<Dialog.Portal>
		<Dialog.Overlay class="prl-overlay" />
		<Dialog.Content
			class="prl-dialog"
			aria-label={table?.name ?? 'Prelude Event'}
			onOpenAutoFocus={(e) => {
				e.preventDefault();
				setTimeout(() => rollBtnEl?.focus(), 0);
			}}
		>
			<DialogHeader title={headingText(table?.name ?? 'Prelude Event')} radius="8px 8px 0 0" />

			<div class="prl-table-wrap">
				{#if table?.description}
					<div class="prl-preface">
						{#each table.description.split('\n\n') as para}<p>{para}</p>{/each}
					</div>
				{/if}
				<div class="prl-grid">
					{#each rows as row, i (i)}
						<div class="prl-cell">
							<span class="prl-range">{rangeStr(row)}</span>
							<span class="prl-name">{findAsset(row.ref)?.name ?? (row.ref || '—')}</span>
						</div>
					{/each}
				</div>
			</div>

			<div class="prl-footer">
				{#if onBack}
					<button
						class="btn back-btn"
						style="margin-right: auto"
						onclick={() => {
							close();
							onBack?.();
						}}>Back</button
					>
				{/if}
				<button class="btn" onclick={close}>Cancel</button>
				<button bind:this={rollBtnEl} class="btn btn-primary" onclick={roll} disabled={rolling}>
					{rolling ? 'Rolling…' : 'Roll d100'}
				</button>
			</div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<style>
	:global(.prl-overlay) {
		position: fixed;
		inset: 0;
		z-index: 80;
		background: rgba(0, 0, 0, 0.5);
	}
	:global(.prl-dialog) {
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		z-index: 81;
		width: min(640px, calc(100vw - 1rem));
		max-height: min(80vh, 720px);
		display: flex;
		flex-direction: column;
		background: var(--bg-panel, var(--bg-card));
		border: 1px solid var(--border-mid);
		border-radius: 8px;
		box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4);
		overflow: hidden;
	}
	:global(.prl-table-wrap) {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		overscroll-behavior: contain;
	}
	:global(.prl-preface) {
		padding: 12px 14px 4px;
		font-family: var(--font-ui);
		font-size: 0.8rem;
		line-height: 1.5;
		color: var(--text-muted);
	}
	:global(.prl-preface p) {
		margin: 0 0 8px;
	}
	:global(.prl-preface p:last-child) {
		margin-bottom: 0;
	}
	/* 2 columns on mobile, 3 from 520px up — matches the Encounter Index grid. */
	:global(.prl-grid) {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 4px 10px;
		padding: 10px 12px;
	}
	@media (min-width: 520px) {
		:global(.prl-grid) {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
	}
	:global(.prl-cell) {
		display: flex;
		align-items: baseline;
		gap: 8px;
		padding: 4px 6px;
		border-radius: 5px;
		min-width: 0;
		font-family: var(--font-ui);
		font-size: 0.82rem;
	}
	:global(.prl-range) {
		font-variant-numeric: tabular-nums;
		color: var(--text-dimmer);
		white-space: nowrap;
		flex-shrink: 0;
		min-width: 2.6rem;
	}
	:global(.prl-name) {
		color: var(--text-body);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	:global(.prl-footer) {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		padding: 10px 14px;
		border-top: 1px solid var(--border-mid);
		background: var(--bg-elevated, var(--bg-card));
	}
</style>
