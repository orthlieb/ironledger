<script lang="ts">
	/**
	 * MapOptionsDialog — nested modal opened from the Campaign Map's
	 * toolbar. Tunes the decorative view overlays.
	 *
	 * Two persistence backends:
	 *   • Scale bar (enabled + unit + perHex + segments) → `mapState.settings.scale`,
	 *     persisted server-side via `persistSettings()`. Scale is a property
	 *     of the map itself (5 miles per cell on desktop is 5 miles per cell
	 *     on mobile) so it travels across devices.
	 *   • Names + grid visibility + grid opacity → `mapSettings`
	 *     (localStorage). Per-device display preferences.
	 *
	 * Every field auto-commits the moment it changes — no Save button.
	 *
	 * bits-ui Dialog — nested inside MapDialog. `.mo-dialog` z-index sits
	 * one tier above the outer `.mp-dialog` so it renders on top.
	 */

	import { headingText } from '$lib/fontStore.svelte.js';
	import { Dialog } from 'bits-ui';
	import DialogHeader from './DialogHeader.svelte';
	import ConfirmDialog from './ConfirmDialog.svelte';
	import Checkbox from './Checkbox.svelte';
	import { mapSettings, persistMapSettings } from '$lib/mapSettingsStore.svelte.js';
	import {
		mapState,
		persistSettings,
		clearMarkers,
		renameMap,
		deleteMap,
	} from '$lib/mapStore.svelte.js';

	interface Props {
		/** Fires when the user clicks "Replace background image…". Wired
		 *  by MapDialog to trigger its own hidden background file input. */
		onReplaceBackground?: () => void;
	}
	let { onReplaceBackground }: Props = $props();

	let dialogOpen = $state(false);
	let clearMarkersDialogRef = $state<{ open(): void; close(): void } | null>(null);
	let deleteMapDialogRef = $state<{ open(): void; close(): void } | null>(null);

	function onRename(e: Event) {
		const v = (e.target as HTMLInputElement).value.trim();
		if (v && v !== mapState.name && mapState.activeId) {
			void renameMap(mapState.activeId, v);
		}
	}
	async function onDeleteMap() {
		if (mapState.activeId) await deleteMap(mapState.activeId);
		// Auto-dismiss: the map the user was configuring is gone;
		// nothing left to configure.
		close();
	}
	async function onClearMarkers() {
		await clearMarkers();
		// Auto-dismiss so the user sees their now-empty map instead
		// of the settings sheet still covering it.
		close();
	}
	function onReplaceBackgroundClicked() {
		onReplaceBackground?.();
		// The parent dialog will handle the file picker; close settings
		// so the user isn't blocked when the picker returns.
		close();
	}
	export function open() {
		dialogOpen = true;
	}
	export function close() {
		dialogOpen = false;
	}

	const markerCount = $derived(mapState.markers.length);

	// Scale defaults live here so a fresh map (no server value yet) still
	// shows sensible defaults in the form.
	const scaleEnabled = $derived(mapState.settings.scale?.enabled ?? false);
	const scaleUnit = $derived(mapState.settings.scale?.unit ?? 'miles');
	const scalePerHex = $derived(mapState.settings.scale?.perHex ?? 5);
	const scaleSegments = $derived(mapState.settings.scale?.segments ?? 4);

	function patchScale(patch: Partial<NonNullable<typeof mapState.settings.scale>>): void {
		mapState.settings.scale = { ...(mapState.settings.scale ?? {}), ...patch };
		void persistSettings();
	}

	function onScaleEnabled(v: boolean) {
		patchScale({ enabled: v });
	}
	function onScaleUnit(unit: 'miles' | 'km') {
		patchScale({ unit });
	}
	function onScalePerHex(e: Event) {
		const v = Number((e.target as HTMLInputElement).value);
		if (Number.isFinite(v) && v > 0) patchScale({ perHex: v });
	}
	function onScaleSegments(e: Event) {
		const v = Math.round(Number((e.target as HTMLInputElement).value));
		if (Number.isFinite(v) && v >= 1 && v <= 20) patchScale({ segments: v });
	}

	function onGridVisible(v: boolean) {
		mapSettings.grid.visible = v;
		persistMapSettings();
	}
	function onGridOpacity(e: Event) {
		const v = Number((e.target as HTMLInputElement).value);
		if (Number.isFinite(v) && v >= 0 && v <= 100) {
			mapSettings.grid.opacity = v / 100;
			persistMapSettings();
		}
	}
</script>

<Dialog.Root bind:open={dialogOpen}>
	<Dialog.Portal>
		<Dialog.Overlay class="mo-overlay" />
		<Dialog.Content class="mo-dialog">
			<DialogHeader title={headingText('Map Options')} onclose={close} radius="8px 8px 0 0" />

			<div class="mo-body">
				<section class="mo-section">
					<label class="mo-field">
						<span class="mo-field-label">Map name</span>
						<input
							id="mo-map-name"
							name="mo-map-name"
							class="mo-input mo-input-wide"
							type="text"
							value={mapState.name}
							onchange={onRename}
						/>
					</label>
				</section>

				<section class="mo-section">
					<Checkbox
						class="mo-toggle"
						checked={mapSettings.grid.visible}
						onCheckedChange={onGridVisible}
					>
						<span class="mo-toggle-label">Show grid</span>
					</Checkbox>
					<p class="mo-hint">
						Hides the grid lines. Clicks still place markers on the underlying grid. This device
						only.
					</p>

					<div class="mo-fields" class:mo-fields-disabled={!mapSettings.grid.visible}>
						<label class="mo-field">
							<span class="mo-field-label"
								>Opacity — {Math.round(mapSettings.grid.opacity * 100)}%</span
							>
							<input
								id="mo-grid-opacity"
								name="mo-grid-opacity"
								class="mo-slider"
								type="range"
								min="0"
								max="100"
								step="5"
								value={Math.round(mapSettings.grid.opacity * 100)}
								oninput={onGridOpacity}
								disabled={!mapSettings.grid.visible}
							/>
						</label>
					</div>
				</section>

				<section class="mo-section">
					<Checkbox class="mo-toggle" checked={scaleEnabled} onCheckedChange={onScaleEnabled}>
						<span class="mo-toggle-label">Scale bar</span>
					</Checkbox>
					<p class="mo-hint">Distance scale drawn in the bottom-left. Saved with the map.</p>

					<div class="mo-fields mo-fields-row" class:mo-fields-disabled={!scaleEnabled}>
						<div class="mo-field">
							<span class="mo-field-label">Unit</span>
							<div class="mo-unit-group" role="group" aria-label="Scale unit">
								<button
									class="mo-unit"
									class:mo-unit-selected={scaleUnit === 'miles'}
									onclick={() => onScaleUnit('miles')}
									disabled={!scaleEnabled}>Miles</button
								>
								<button
									class="mo-unit"
									class:mo-unit-selected={scaleUnit === 'km'}
									onclick={() => onScaleUnit('km')}
									disabled={!scaleEnabled}>Km</button
								>
							</div>
						</div>

						<label class="mo-field mo-field-narrow">
							<span class="mo-field-label">Per cell</span>
							<input
								id="mo-scale-per-cell"
								name="mo-scale-per-cell"
								class="mo-input"
								type="number"
								min="0.1"
								step="0.1"
								value={scalePerHex}
								oninput={onScalePerHex}
								disabled={!scaleEnabled}
							/>
						</label>

						<label class="mo-field mo-field-narrow">
							<span class="mo-field-label">Segments</span>
							<input
								id="mo-scale-segments"
								name="mo-scale-segments"
								class="mo-input"
								type="number"
								min="1"
								max="20"
								step="1"
								value={scaleSegments}
								oninput={onScaleSegments}
								disabled={!scaleEnabled}
							/>
						</label>
					</div>
				</section>

				<section class="mo-section mo-section-danger">
					<div class="mo-danger-header">Danger zone</div>
					<div class="mo-danger-row">
						<button
							class="mo-danger-btn"
							onclick={onReplaceBackgroundClicked}
							disabled={!onReplaceBackground}>Replace image…</button
						>
						<span class="mo-hint">
							Uploads a fresh image and keeps every marker where it is. <strong
								>Use an image with the same framing and aspect ratio</strong
							> — otherwise markers will shift relative to the new background.
						</span>
					</div>
					<div class="mo-danger-row">
						<button
							class="mo-danger-btn"
							onclick={() => clearMarkersDialogRef?.open()}
							disabled={markerCount === 0}>Clear all markers</button
						>
						<span class="mo-hint">Removes every marker. Keeps the background image.</span>
					</div>
					<div class="mo-danger-row">
						<button class="btn btn-danger" onclick={() => deleteMapDialogRef?.open()}>DELETE</button
						>
						<span class="mo-hint">
							Removes this map entirely. If it was your only map, a fresh Regional Map is created to
							replace it.
						</span>
					</div>
				</section>
			</div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<ConfirmDialog
	bind:this={clearMarkersDialogRef}
	title="Clear All Markers?"
	confirmLabel="Clear Markers"
	onconfirm={onClearMarkers}
>
	<p
		style="font-family: var(--font-ui); font-size: 0.82rem; color: var(--text-muted); margin: 0; line-height: 1.5;"
	>
		This will remove every marker on the map. The background image will be kept. This can't be
		undone.
	</p>
</ConfirmDialog>

<ConfirmDialog
	bind:this={deleteMapDialogRef}
	title="Delete this map?"
	confirmLabel="DELETE"
	onconfirm={onDeleteMap}
>
	<p
		style="font-family: var(--font-ui); font-size: 0.82rem; color: var(--text-muted); margin: 0; line-height: 1.5;"
	>
		This deletes <strong>{mapState.name}</strong> entirely — background, markers, and settings. You'll
		be switched to another map. This can't be undone.
	</p>
</ConfirmDialog>

<style>
	/* Nested inside MapDialog (which is also on bits-ui Dialog now).
	   MapDialog uses overlay 80 / content 81; this dialog needs to
	   render above it, so overlay 82 / content 83 puts it one tier
	   higher without breaking the modal budget for anything else. */
	:global(.mo-overlay) {
		position: fixed;
		inset: 0;
		background: #00000060;
		z-index: 82;
	}
	:global(.mo-dialog) {
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		/* Mobile bump handled by the media query below. */
		width: min(440px, calc(100vw - 2rem));
		max-height: 82vh;
		overflow: hidden;
		background: var(--bg-card);
		color: var(--text);
		border-radius: 8px;
		box-shadow:
			0 16px 48px #00000070,
			0 0 0 1px var(--border-mid);
		outline: none;
		z-index: 83;
	}
	:global(.mo-body) {
		max-height: calc(82vh - 4rem);
		overflow-y: auto;
		overscroll-behavior: contain;
		padding: 14px;
		display: flex;
		flex-direction: column;
		gap: 18px;
	}
	@media (max-width: 640px) {
		:global(.mo-dialog) {
			width: 90vw;
			max-height: 90vh;
		}
		:global(.mo-body) {
			max-height: calc(90vh - 4rem);
		}
	}
	:global(.mo-section) {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	:global(.mo-toggle) {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		font-family: var(--font-ui);
		font-size: 0.9rem;
		color: var(--text);
		cursor: pointer;
	}
	:global(.mo-toggle input) {
		accent-color: var(--text-accent);
		width: 18px;
		height: 18px;
	}
	:global(.mo-toggle-label) {
		font-weight: 600;
	}
	:global(.mo-hint) {
		font-family: var(--font-ui);
		font-size: 0.72rem;
		color: var(--text-dimmer);
		margin: 0 0 0 26px;
		line-height: 1.4;
	}
	:global(.mo-fields) {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding-left: 26px;
		margin-top: 8px;
	}
	/* Horizontal row variant — scale unit / per-hex / segments sit
	   side-by-side rather than stacked. Wraps on narrow widths so the
	   inputs stay readable on mobile. */
	:global(.mo-fields-row) {
		flex-direction: row;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: 12px;
	}
	:global(.mo-fields-disabled) {
		opacity: 0.5;
	}
	:global(.mo-field) {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	/* `.mo-input` sets a shared max-width: 120px cap further down the
	   sheet; this needs equal-or-greater specificity to lift it, so
	   scope it as `.mo-input.mo-input-wide` instead of the bare
	   `.mo-input-wide` we used to have. */
	:global(.mo-input.mo-input-wide) {
		max-width: none;
		width: 100%;
	}
	:global(.mo-field-narrow .mo-input) {
		max-width: 80px;
	}

	/* Danger zone — clear markers + clear map, styled clearly destructive
	   with a top divider so they don't get accidentally clicked. */
	:global(.mo-section-danger) {
		border-top: 1px solid var(--border);
		padding-top: 14px;
		margin-top: 4px;
	}
	:global(.mo-danger-header) {
		font-family: var(--font-ui);
		font-size: 0.68rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--color-danger, #ef4444);
	}
	:global(.mo-danger-row) {
		display: flex;
		align-items: center;
		gap: 10px;
		flex-wrap: wrap;
	}
	:global(.mo-danger-row .mo-hint) {
		margin: 0;
		padding: 0;
		font-style: normal;
	}
	:global(.mo-danger-btn) {
		font-family: var(--font-ui);
		font-size: 0.72rem;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		padding: 5px 12px;
		background: var(--bg-control);
		color: var(--color-danger, #ef4444);
		border: 1px solid var(--border-mid);
		border-radius: 4px;
		cursor: pointer;
		white-space: nowrap;
	}
	:global(.mo-danger-btn:hover:not(:disabled)) {
		border-color: var(--color-danger, #ef4444);
	}
	:global(.mo-danger-btn:disabled) {
		opacity: 0.4;
		cursor: default;
	}
	:global(.mo-field-label) {
		font-family: var(--font-ui);
		font-size: 0.68rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-dimmer);
	}
	:global(.mo-input) {
		padding: 5px 8px;
		font-family: var(--font-ui);
		font-size: 0.85rem;
		color: var(--text);
		background: var(--bg-control);
		border: 1px solid var(--border-mid);
		border-radius: 4px;
		max-width: 120px;
	}
	:global(.mo-slider) {
		width: 100%;
		max-width: 240px;
		accent-color: var(--text-accent);
	}
	:global(.mo-input:focus) {
		outline: none;
		border-color: var(--text-accent);
	}
	:global(.mo-unit-group) {
		display: inline-flex;
		gap: 6px;
	}
	:global(.mo-unit) {
		padding: 4px 12px;
		font-family: var(--font-ui);
		font-size: 0.72rem;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		background: var(--bg-control);
		color: var(--text-muted);
		border: 1px solid var(--border-mid);
		border-radius: 4px;
		cursor: pointer;
	}
	:global(.mo-unit:hover:not(:disabled)) {
		color: var(--text);
		border-color: var(--text-accent);
	}
	:global(.mo-unit-selected) {
		background: var(--text-accent) !important;
		color: var(--bg-card) !important;
		border-color: var(--text-accent) !important;
	}
	:global(.mo-unit:disabled) {
		cursor: not-allowed;
	}
</style>
