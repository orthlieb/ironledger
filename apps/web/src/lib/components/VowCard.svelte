<script lang="ts">
	import type { Vow, VowDifficulty, VowStatus } from '$lib/types.js';
	import { VOW_MARK_TICKS, VOW_FORSAKE_STRESS } from '$lib/types.js';
	import ProgressTrackPanel from './ProgressTrackPanel.svelte';
	import MarkdownNotes from './MarkdownNotes.svelte';
	import ConfirmDialog from './ConfirmDialog.svelte';
	import VowOptionsDialog from './VowOptionsDialog.svelte';
	import SegmentedRadio from './SegmentedRadio.svelte';
	import { difficultyBadgeStyle } from '$lib/badgeStyles.js';
	// (Renaming lives in VowOptionsDialog now — no inline header edit.)
	import iconGearSvg from '$icons/gear-solid-full.svg?raw';
	import linkSolidSvg from '$icons/link-solid-full.svg?raw';
	import linkBrokenSvg from '$icons/link-broken-solid-full.svg?raw';
	import checkSvg from '$icons/circle-check-solid-full.svg?raw';
	import { isSourceEnabled } from '$lib/expansionStore.svelte.js';
	import { tooltip } from '$lib/actions/tooltip.js';

	let {
		vow = $bindable(),
		onDelete,
		onForsake,
	}: {
		vow: Vow;
		onDelete: () => void;
		/** Fires once the user confirms forsaking (status → forsaken). The parent
		 *  logs it with an Endure Stress link. */
		onForsake?: () => void;
	} = $props();

	const DIFF_LABELS: Record<VowDifficulty, string> = {
		troublesome: 'Troublesome',
		dangerous: 'Dangerous',
		formidable: 'Formidable',
		extreme: 'Extreme',
		epic: 'Epic',
	};
	const STATUS_LABELS: Record<VowStatus, string> = {
		active: 'Active',
		fulfilled: 'Fulfilled',
		forsaken: 'Forsaken',
	};

	let forsakeDialogRef = $state<{ open(): void; close(): void } | null>(null);
	let vowOptionsRef = $state<{ open(): void; close(): void } | null>(null);

	// Status is the source of truth; fall back to the legacy `fulfilled` boolean.
	const status = $derived<VowStatus>(vow.status ?? (vow.fulfilled ? 'fulfilled' : 'active'));
	const diffLabel = $derived(DIFF_LABELS[vow.difficulty] ?? vow.difficulty);
	const stressCost = $derived(VOW_FORSAKE_STRESS[vow.difficulty]);

	// Remember the pre-forsake state so cancelling the warning dialog reverts it.
	let prevStatus = $state<VowStatus>('active');

	function onStatusChange(next: VowStatus) {
		if (next === 'forsaken') {
			// Commit optimistically so the radio stays controlled, then confirm.
			prevStatus = status;
			vow.status = 'forsaken';
			forsakeDialogRef?.open();
			return;
		}
		vow.status = next;
	}
	function confirmForsake() {
		vow.status = 'forsaken';
		onForsake?.();
	}
	function cancelForsake() {
		vow.status = prevStatus;
	}
</script>

<div class="vow-card">
	<!-- Header: collapse toggle, name, collapsed status pill, settings gear -->
	<div class="vow-header">
		<button
			class="collapse-btn"
			onclick={() => (vow.collapsed = !vow.collapsed)}
			aria-label={vow.collapsed ? 'Expand vow' : 'Collapse vow'}
			use:tooltip={vow.collapsed ? 'Expand' : 'Collapse'}
		>
			{vow.collapsed ? '▶' : '▼'}
		</button>

		<!-- Name is display-only; rename lives in the gear (Vow options) dialog. -->
		<span class="vow-name">{vow.name || 'Unnamed Vow'}</span>

		<!-- Collapsed-only status pill (display-only — the SegmentedRadio in the
		     body is the control). Yellow active, green fulfilled, red forsaken. -->
		{#if vow.collapsed}
			<span class="vow-status-pill vow-status-pill--{status}">{STATUS_LABELS[status]}</span>
		{/if}

		<button
			class="btn btn-icon icon-btn vow-settings-btn"
			onclick={() => vowOptionsRef?.open()}
			use:tooltip={'Vow options'}
			aria-label="Vow options">{@html iconGearSvg}</button
		>
	</div>

	<!-- Expandable body -->
	{#if !vow.collapsed}
		<div class="vow-body">
			<!-- Rank pill + Status radio, one divider below — mirrors the
			     Expeditions Core header (pills row + status section). The rank is
			     fixed at creation and shown read-only here; the status radio stays
			     live even when the vow is fulfilled/forsaken so it can be reopened. -->
			<div class="vow-topline">
				<div class="vow-pills-row">
					<span class="vow-badge vow-badge--diff" style={difficultyBadgeStyle(vow.difficulty)}
						>{diffLabel}</span
					>
				</div>
				<div class="vow-status-section">
					<span class="vow-field-label">Status</span>
					<SegmentedRadio
						ariaLabel="Vow status"
						labels="always"
						value={status}
						onchange={(v) => onStatusChange(v as VowStatus)}
						options={[
							{
								value: 'active',
								icon: linkSolidSvg,
								text: 'Active',
								label: 'Mark active',
								tone: 'warn',
							},
							{
								value: 'fulfilled',
								icon: checkSvg,
								text: 'Fulfilled',
								label: 'Mark fulfilled',
								tone: 'go',
							},
							{
								value: 'forsaken',
								icon: linkBrokenSvg,
								text: 'Forsaken',
								label: 'Mark forsaken',
								tone: 'stop',
							},
						]}
					/>
				</div>
			</div>

			<!-- Everything below the status row dims + goes inert once the vow is
			     no longer active. Only the Status radio (above) and the gear button
			     (header) stay clickable. -->
			<div
				class="vow-dimmable"
				class:vow-dimmable--locked={status !== 'active'}
				inert={status !== 'active'}
			>
				<!-- Threat + Menace row (Delve-only — preserves underlying data when hidden) -->
				{#if isSourceEnabled('delve')}
					<div class="vow-extras">
						<label class="vow-extra vow-threat">
							<span>Threat</span>
							<input bind:value={vow.threat} placeholder="—" aria-label="Threat" />
						</label>
						<div class="vow-extra menace-control">
							<span>Menace</span>
							<button
								class="adj-btn"
								onclick={() => (vow.menace = Math.max(0, vow.menace - 1))}
								disabled={vow.menace <= 0}
								aria-label="Decrease menace">−</button
							>
							<span class="menace-val" class:menace-high={vow.menace >= 7}>{vow.menace}</span>
							<button
								class="adj-btn"
								onclick={() => (vow.menace = Math.min(10, vow.menace + 1))}
								disabled={vow.menace >= 10}
								aria-label="Increase menace">+</button
							>
							<span class="menace-max">/10</span>
						</div>
					</div>
				{/if}

				<!-- value + oninput (not bind:value) so a legacy vow with no `notes`
				     field — undefined — doesn't trip MarkdownNotes' bindable fallback
				     (props_invalid_value). Matches CommunitiesArea / ExpeditionsArea. -->
				<MarkdownNotes
					label="Notes"
					value={vow.notes ?? ''}
					oninput={(v) => (vow.notes = v)}
					placeholder="Notes… (**bold**, *italic*, # heading, - list)"
					rows={3}
				/>

				<div style="--track-inner-bg: var(--bg-inset); display: contents">
					<ProgressTrackPanel
						label="Progress"
						bind:value={vow.ticks}
						step={VOW_MARK_TICKS[vow.difficulty]}
						showStep
						dangerCount={isSourceEnabled('delve') ? vow.menace : 0}
					/>
				</div>
			</div>
		</div>
	{/if}
</div>

<VowOptionsDialog
	bind:this={vowOptionsRef}
	name={vow.name}
	oncommit={(next) => (vow.name = next)}
	ondelete={onDelete}
/>

<ConfirmDialog
	bind:this={forsakeDialogRef}
	title="Forsake Your Vow"
	accentColor="var(--color-danger)"
	confirmLabel="Forsake Vow"
	cancelLabel="Keep Vow"
	onconfirm={confirmForsake}
	oncancel={cancelForsake}
>
	<div class="forsake-vow-name">"{vow.name || 'Unnamed Vow'}" ({diffLabel})</div>
	<p class="forsake-rule">
		When you renounce your quest or are unable to continue, mark the vow Forsaken and Endure Stress.
	</p>
	<p class="forsake-cost">
		An iron vow is a sacred promise. Forsaking it means accepting failure and the weight of a broken
		oath. You must
		<strong>Endure Stress (−{stressCost})</strong> for a
		{diffLabel.toLowerCase()} vow.
	</p>
</ConfirmDialog>

<style>
	.vow-card {
		background: var(--bg-inset);
		border: 1px solid var(--border);
		border-radius: 6px;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		transition: border-color 0.2s;
	}

	/* ---- Header ---- */
	.vow-header {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 7px 10px;
		background: var(--bg-control);
	}

	.collapse-btn {
		background: transparent;
		border: none;
		color: var(--text-dimmer);
		padding: 2px 4px;
		cursor: pointer;
		font-size: 0.55rem;
		line-height: 1;
		flex-shrink: 0;
		border-radius: 2px;
		font-family: inherit;
		transition: color 0.12s;
	}
	.collapse-btn:hover {
		color: var(--text);
	}

	/* Display-only name (rename is in the gear dialog). */
	.vow-name {
		flex: 1;
		min-width: 0;
		font-weight: 400;
		font-size: 0.88rem;
		padding: 2px 6px;
		color: var(--text);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* Settings / gear + trash-style icon buttons keep an 11×11 svg. */
	.icon-btn:not(.btn-trash) :global(svg) {
		width: 11px;
		height: 11px;
		fill: currentColor;
	}

	/* ---- Expandable body ---- */
	.vow-body {
		padding: 8px 10px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	/* Rank pill + status radio grouped above one divider (mirrors Journeys). */
	.vow-topline {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding-bottom: 8px;
		border-bottom: 1px solid #c3baa1;
	}

	.vow-pills-row {
		display: flex;
		flex-wrap: wrap;
		gap: 5px;
		align-items: center;
	}

	.vow-badge {
		font-family: var(--font-ui);
		font-size: 0.6rem;
		font-weight: 600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		padding: 2px 7px;
		border-radius: 10px;
		border: 1px solid transparent;
		white-space: nowrap;
	}

	.vow-status-section {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.vow-extras {
		display: flex;
		gap: 10px;
		flex-wrap: wrap;
		align-items: center;
	}

	.vow-extra {
		display: flex;
		align-items: center;
		gap: 5px;
		font-family: var(--font-ui);
		font-size: 0.78rem;
	}

	/* App-wide field-label convention (matches .ea-field-label / .cm-field-label):
	   uppercase, spaced, --text-dimmer. Applies to the Threat/Menace <span>s and
	   the standalone Status label above the SegmentedRadio. */
	.vow-extra span,
	.vow-field-label {
		font-family: var(--font-ui);
		font-size: 0.7rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--text-dimmer);
		white-space: nowrap;
	}

	/* Fields below the status row: dim while inert once the vow leaves Active. */
	.vow-dimmable {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.vow-dimmable--locked {
		opacity: 0.5;
	}

	/* Collapsed-header status pill — display-only, tinted by state to match the
	   SegmentedRadio tones (yellow / green / red). */
	.vow-status-pill {
		font-family: var(--font-ui);
		font-size: 0.6rem;
		font-weight: 600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		padding: 3px 8px;
		border-radius: 10px;
		line-height: 1;
		white-space: nowrap;
		flex-shrink: 0;
		border: 1px solid transparent;
	}
	.vow-status-pill--active {
		background: rgba(234, 179, 8, 0.18);
		color: #eab308;
		border-color: rgba(234, 179, 8, 0.35);
	}
	.vow-status-pill--fulfilled {
		background: rgba(52, 211, 153, 0.18);
		color: #34d399;
		border-color: rgba(52, 211, 153, 0.35);
	}
	.vow-status-pill--forsaken {
		background: rgba(239, 68, 68, 0.14);
		color: #ef4444;
		border-color: rgba(239, 68, 68, 0.3);
	}

	/* Threat grows to fill available space */
	.vow-threat {
		flex: 1;
		min-width: 120px;
	}

	.vow-threat input {
		flex: 1;
		min-width: 0;
		font-size: 0.8rem;
		padding: 2px 6px;
	}

	/* Menace pushed to the right */
	.menace-control {
		margin-left: auto;
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.adj-btn {
		width: 20px;
		height: 20px;
		padding: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 3px;
		cursor: pointer;
		font-size: 0.85rem;
		font-family: var(--font-ui);
		color: var(--text);
		line-height: 1;
	}

	.adj-btn:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}
	.adj-btn:not(:disabled):hover {
		background: var(--bg-hover);
		border-color: var(--border-mid);
	}

	.menace-val {
		min-width: 16px;
		text-align: center;
		font-family: var(--font-ui);
		font-size: 0.82rem;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}
	.menace-val.menace-high {
		color: var(--color-danger);
	}

	.menace-max {
		color: var(--text-muted);
		font-family: var(--font-ui);
		font-size: 0.72rem;
	}

	.forsake-vow-name {
		font-family: var(--font-ui);
		font-size: 0.9rem;
		font-style: italic;
		color: var(--text);
		font-weight: 500;
	}

	.forsake-rule {
		font-family: var(--font-ui);
		font-size: 0.8rem;
		font-style: italic;
		color: var(--text-muted);
		line-height: 1.45;
	}

	.forsake-cost {
		font-family: var(--font-ui);
		font-size: 0.82rem;
		color: var(--text-muted);
		line-height: 1.45;
	}

	.forsake-cost :global(strong) {
		color: var(--color-danger);
		font-weight: 700;
	}
</style>
