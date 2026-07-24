<script lang="ts">
	/**
	 * MapOptionsDialog — nested modal opened from the Campaign Map's
	 * toolbar. Tunes the decorative view overlays.
	 *
	 * Two persistence backends:
	 *   • Scale bar (enabled + unit + perHex + segments) → `mapState.settings.scale`,
	 *     persisted server-side via `persistSettings()`. Scale is a property
	 *     of the map itself (5 miles per hex on desktop is 5 miles per hex
	 *     on mobile) so it travels across devices.
	 *   • Checkered border + hex-grid visibility → `mapSettings` (localStorage).
	 *     Per-device display preferences.
	 *
	 * Every field auto-commits the moment it changes — no Save button.
	 *
	 * Follows CLAUDE.md's iOS-safe dialog rules: `vh` (not `dvh`),
	 * centred via top:50%+transform, no `display: flex` on the dialog
	 * element, `max-height` on the scrollable body with
	 * `overscroll-behavior: contain`.
	 */

	import { headingText } from '$lib/fontStore.svelte.js';
	import DialogHeader from './DialogHeader.svelte';
	import { mapSettings, persistMapSettings } from '$lib/mapSettingsStore.svelte.js';
	import { mapState, persistSettings } from '$lib/mapStore.svelte.js';

	let dialogEl = $state<HTMLDialogElement | null>(null);

	export function open() {
		dialogEl?.showModal();
	}
	export function close() {
		dialogEl?.close();
	}

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

	function onScaleEnabled(e: Event) {
		patchScale({ enabled: (e.target as HTMLInputElement).checked });
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

	function onBorderEnabled(e: Event) {
		mapSettings.border.enabled = (e.target as HTMLInputElement).checked;
		persistMapSettings();
	}
	function onHexesVisible(e: Event) {
		mapSettings.hexes.visible = (e.target as HTMLInputElement).checked;
		persistMapSettings();
	}
	function onHexesOpacity(e: Event) {
		const v = Number((e.target as HTMLInputElement).value);
		if (Number.isFinite(v) && v >= 0 && v <= 100) {
			mapSettings.hexes.opacity = v / 100;
			persistMapSettings();
		}
	}
	function onLabelsVisible(e: Event) {
		mapSettings.labels.visible = (e.target as HTMLInputElement).checked;
		persistMapSettings();
	}
</script>

<dialog bind:this={dialogEl} class="mo-dialog" oncancel={close}>
	<DialogHeader title={headingText('Map Options')} onclose={close} radius="8px 8px 0 0" />

	<div class="mo-body">
		<section class="mo-section">
			<label class="mo-toggle">
				<input type="checkbox" checked={mapSettings.labels.visible} onchange={onLabelsVisible} />
				<span class="mo-toggle-label">Show names</span>
			</label>
			<p class="mo-hint">Text label beneath each marker. This device only.</p>
		</section>

		<section class="mo-section">
			<label class="mo-toggle">
				<input type="checkbox" checked={mapSettings.hexes.visible} onchange={onHexesVisible} />
				<span class="mo-toggle-label">Show hex grid</span>
			</label>
			<p class="mo-hint">
				Hides the hex outlines. Clicks still place markers on the underlying grid. This device only.
			</p>

			<div class="mo-fields" class:mo-fields-disabled={!mapSettings.hexes.visible}>
				<label class="mo-field">
					<span class="mo-field-label"
						>Opacity — {Math.round(mapSettings.hexes.opacity * 100)}%</span
					>
					<input
						class="mo-slider"
						type="range"
						min="0"
						max="100"
						step="5"
						value={Math.round(mapSettings.hexes.opacity * 100)}
						oninput={onHexesOpacity}
						disabled={!mapSettings.hexes.visible}
					/>
				</label>
			</div>
		</section>

		<section class="mo-section">
			<label class="mo-toggle">
				<input type="checkbox" checked={mapSettings.border.enabled} onchange={onBorderEnabled} />
				<span class="mo-toggle-label">Checkered border</span>
			</label>
			<p class="mo-hint">
				Narrow black/white checker ring around the visible view — one segment per hex. This device
				only.
			</p>
		</section>

		<section class="mo-section">
			<label class="mo-toggle">
				<input type="checkbox" checked={scaleEnabled} onchange={onScaleEnabled} />
				<span class="mo-toggle-label">Scale bar</span>
			</label>
			<p class="mo-hint">Distance scale drawn in the bottom-left. Saved with the map.</p>

			<div class="mo-fields" class:mo-fields-disabled={!scaleEnabled}>
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

				<label class="mo-field">
					<span class="mo-field-label">
						{scaleUnit === 'miles' ? 'Miles' : 'Km'} per hex
					</span>
					<input
						class="mo-input"
						type="number"
						min="0.1"
						step="0.1"
						value={scalePerHex}
						oninput={onScalePerHex}
						disabled={!scaleEnabled}
					/>
				</label>

				<label class="mo-field">
					<span class="mo-field-label">Segments</span>
					<input
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
	</div>
</dialog>

<style>
	.mo-dialog {
		border: none;
		padding: 0;
		border-radius: 8px;
		position: fixed;
		top: 50%;
		left: 50%;
		margin: 0;
		transform: translate(-50%, -50%);
		width: min(440px, calc(100vw - 2rem));
		max-height: 82vh;
		overflow: hidden;
		background: var(--bg-card);
		color: var(--text);
		box-shadow:
			0 16px 48px #00000070,
			0 0 0 1px var(--border-mid);
		outline: none;
	}
	.mo-dialog::backdrop {
		background: #00000060;
	}
	.mo-body {
		max-height: calc(82vh - 4rem);
		overflow-y: auto;
		overscroll-behavior: contain;
		padding: 14px;
		display: flex;
		flex-direction: column;
		gap: 18px;
	}
	.mo-section {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.mo-toggle {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		font-family: var(--font-ui);
		font-size: 0.9rem;
		color: var(--text);
		cursor: pointer;
	}
	.mo-toggle input {
		accent-color: var(--text-accent);
		width: 18px;
		height: 18px;
	}
	.mo-toggle-label {
		font-weight: 600;
	}
	.mo-hint {
		font-family: var(--font-ui);
		font-size: 0.72rem;
		color: var(--text-dimmer);
		margin: 0 0 0 26px;
		line-height: 1.4;
	}
	.mo-fields {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding-left: 26px;
		margin-top: 8px;
	}
	.mo-fields-disabled {
		opacity: 0.5;
	}
	.mo-field {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.mo-field-label {
		font-family: var(--font-ui);
		font-size: 0.68rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-dimmer);
	}
	.mo-input {
		padding: 5px 8px;
		font-family: var(--font-ui);
		font-size: 0.85rem;
		color: var(--text);
		background: var(--bg-control);
		border: 1px solid var(--border-mid);
		border-radius: 4px;
		max-width: 120px;
	}
	.mo-slider {
		width: 100%;
		max-width: 240px;
		accent-color: var(--text-accent);
	}
	.mo-input:focus {
		outline: none;
		border-color: var(--text-accent);
	}
	.mo-unit-group {
		display: inline-flex;
		gap: 6px;
	}
	.mo-unit {
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
	.mo-unit:hover:not(:disabled) {
		color: var(--text);
		border-color: var(--text-accent);
	}
	.mo-unit-selected {
		background: var(--text-accent) !important;
		color: var(--bg-card) !important;
		border-color: var(--text-accent) !important;
	}
	.mo-unit:disabled {
		cursor: not-allowed;
	}
</style>
