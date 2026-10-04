<script lang="ts">
	/**
	 * ColorPicker — a bits-ui Popover wrapped around vanilla-colorful's
	 * `<hex-color-picker>` web component. The popover also hosts the
	 * editable hex/RGB text field now (opt-in via `showField`); because
	 * the popover lives inside the dialog's focus trap, the field is
	 * fully keyboard-reachable without the cross-portal focus bouncing
	 * that killed the Pickr-era attempt.
	 *
	 * Public API:
	 *   • `value`     — bindable `#rrggbb` string.
	 *   • `onchange`  — fires on every commit (swatch tap, drag end, or
	 *                   hex/RGB field commit).
	 *   • `onswatch`  — fires only on a swatch pick, for MRU tracking.
	 *   • `disabled`  — inert button, no popover.
	 *   • `ariaLabel` — button a11y name.
	 *   • `swatches`  — optional swatch strip; defaults to eight tabletop hues.
	 *   • `showField` — show the editable hex/RGB field + format toggle
	 *                   inside the popover (default `true`). Set `false`
	 *                   for callers that only need swatch + wheel picking
	 *                   (SettingsDialog's small dice-colour pickers).
	 *   • `trigger`   — optional custom trigger snippet.
	 *
	 * The hex/RGB format toggle persists in localStorage under
	 * `il:colorFieldFormat` so a user who prefers RGB sees it that way
	 * across sessions and across every ColorPicker in the app.
	 */
	import { onMount } from 'svelte';
	import { Popover } from 'bits-ui';
	import type { Snippet } from 'svelte';

	// vanilla-colorful ships as a side-effecting custom-element registration.
	// Import it in the browser only so SSR doesn't try to touch `window`.
	onMount(() => {
		void import('vanilla-colorful/hex-color-picker.js');
	});

	/** Eight tabletop-friendly hues — same set the marker editor offers. */
	const DEFAULT_SWATCHES = [
		'#e63946',
		'#f4a261',
		'#e9c46a',
		'#2a9d8f',
		'#457b9d',
		'#8e44ad',
		'#111111',
		'#f1faee',
	];

	let {
		value = $bindable(),
		onchange,
		onswatch,
		disabled = false,
		ariaLabel = 'Colour',
		swatches = DEFAULT_SWATCHES,
		showField = true,
		trigger,
	}: {
		value: string;
		onchange?: (v: string) => void;
		onswatch?: (v: string) => void;
		disabled?: boolean;
		ariaLabel?: string;
		swatches?: string[];
		showField?: boolean;
		trigger?: Snippet<[{ props: Record<string, unknown> }]>;
	} = $props();

	let open = $state(false);

	/** Normalise to seven-char `#rrggbb`. vanilla-colorful emits lower-case
	 *  hex already, but a hand-set `value` may be upper-case or shorthand. */
	function normalizeHex(c: string): string {
		if (!c) return c;
		let hx = c.toLowerCase().replace(/^#/, '');
		if (/^[0-9a-f]{3}$/.test(hx)) hx = hx.replace(/./g, (ch) => ch + ch);
		return '#' + hx.slice(0, 6);
	}

	function onColorChanged(e: Event) {
		const next = (e as CustomEvent<{ value: string }>).detail?.value;
		if (!next) return;
		const hex = normalizeHex(next);
		if (hex === value) return;
		value = hex;
		onchange?.(hex);
	}

	function pickSwatch(hex: string) {
		value = hex;
		onchange?.(hex);
		onswatch?.(hex);
		open = false;
	}

	// ─── Hex / RGB field (inside the popover) ──────────────────────────────
	type ColorFormat = 'hex' | 'rgb';
	const FORMAT_KEY = 'il:colorFieldFormat';
	function loadFormat(): ColorFormat {
		try {
			const raw = localStorage.getItem(FORMAT_KEY);
			if (raw === 'rgb' || raw === 'hex') return raw;
		} catch {
			/* private mode / SSR — fall through to the default */
		}
		return 'hex';
	}
	let colorFormat = $state<ColorFormat>(loadFormat());
	function toggleColorFormat() {
		colorFormat = colorFormat === 'hex' ? 'rgb' : 'hex';
		try {
			localStorage.setItem(FORMAT_KEY, colorFormat);
		} catch {
			/* persistence is best-effort */
		}
	}

	/** `#rrggbb` → `r, g, b`. Returns the hex unchanged on malformed input. */
	function hexToRgbString(hex: string): string {
		const h = normalizeHex(hex).replace('#', '');
		if (!/^[0-9a-f]{6}$/.test(h)) return hex;
		const r = parseInt(h.slice(0, 2), 16);
		const g = parseInt(h.slice(2, 4), 16);
		const b = parseInt(h.slice(4, 6), 16);
		return `${r}, ${g}, ${b}`;
	}

	const fieldValue = $derived(colorFormat === 'rgb' ? hexToRgbString(value) : normalizeHex(value));

	/** Parse hex / rgb() / `r,g,b` / shorthand to a normalised `#rrggbb`. */
	function parseInput(input: string): string | null {
		const s = input.trim();
		const rgb = s.match(/^(?:rgb\s*\(\s*)?(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)?$/i);
		if (rgb) {
			const parts = [rgb[1], rgb[2], rgb[3]].map(Number);
			if (parts.every((n) => n >= 0 && n <= 255))
				return '#' + parts.map((n) => n.toString(16).padStart(2, '0')).join('');
			return null;
		}
		const hx = s.replace(/^#/, '');
		if (/^[0-9a-f]{3}$/i.test(hx)) return normalizeHex('#' + hx.replace(/./g, (c) => c + c));
		if (/^[0-9a-f]{6}$/i.test(hx)) return normalizeHex('#' + hx);
		return null;
	}
	function onFieldChange(e: Event) {
		const el = e.target as HTMLInputElement;
		const hex = parseInput(el.value);
		if (!hex) {
			el.value = fieldValue; // reject → restore
			return;
		}
		value = hex;
		onchange?.(hex);
	}
</script>

<Popover.Root bind:open>
	{#if trigger}
		<Popover.Trigger {disabled}>
			{#snippet child({ props })}
				{@render trigger({ props })}
			{/snippet}
		</Popover.Trigger>
	{:else}
		<Popover.Trigger
			class="cp-swatch"
			style="--cp-color: {value}"
			{disabled}
			aria-label={ariaLabel}
		/>
	{/if}
	<Popover.Portal>
		<Popover.Content
			class="cp-popover"
			side="bottom"
			align="start"
			sideOffset={6}
			collisionPadding={8}
		>
			<!-- svelte-ignore element_invalid_self_closing_tag -->
			<hex-color-picker color={value} oncolor-changed={onColorChanged} class="cp-picker"
			></hex-color-picker>
			<div class="cp-swatches" role="group" aria-label="Preset colours">
				{#each swatches as hex (hex)}
					<button
						type="button"
						class="cp-swatches-btn"
						style="--cp-swatch: {hex}"
						onclick={() => pickSwatch(hex)}
						aria-label="Pick {hex}"
					></button>
				{/each}
			</div>
			{#if showField}
				<label class="cp-field">
					<button
						type="button"
						class="cp-field-fmt"
						onclick={toggleColorFormat}
						aria-pressed={colorFormat === 'rgb'}
						aria-label={colorFormat === 'rgb'
							? 'Showing RGB — click to switch to Hex'
							: 'Showing Hex — click to switch to RGB'}
					>
						{colorFormat === 'rgb' ? 'RGB' : 'Hex'}
					</button>
					<input
						class="cp-field-input"
						type="text"
						spellcheck="false"
						autocomplete="off"
						value={fieldValue}
						onchange={onFieldChange}
						aria-label={colorFormat === 'rgb'
							? 'Colour as RGB — type r, g, b or any hex/rgb() value to set'
							: 'Colour as hex — type #rrggbb or any rgb() value to set'}
					/>
				</label>
			{/if}
		</Popover.Content>
	</Popover.Portal>
</Popover.Root>

<style>
	:global(.cp-swatch) {
		width: 44px;
		height: 28px;
		padding: 0;
		border-radius: 5px;
		border: 1px solid var(--border-mid);
		background: var(--cp-color, #888);
		cursor: pointer;
		/* Inset ring so light swatches stay visible against a light panel. */
		box-shadow: inset 0 0 0 1px #ffffff40;
		transition:
			border-color 0.12s,
			opacity 0.12s;
	}
	:global(.cp-swatch:hover:not(:disabled)),
	:global(.cp-swatch:focus-visible) {
		border-color: var(--text-accent);
		outline: none;
	}
	:global(.cp-swatch:disabled) {
		opacity: 0.4;
		cursor: default;
	}

	/* Popover content — a card hovering above the dialog. z-index 200
	   mirrors the old Pickr rule so coexisting dialogs stack cleanly. */
	:global(.cp-popover) {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 10px;
		background: var(--bg-card);
		border: 1px solid var(--border-mid);
		border-radius: 8px;
		box-shadow: 0 12px 32px #00000050;
		z-index: 200;
		outline: none;
	}

	/* The custom element itself: give it a square frame vanilla-colorful
	   can size against; its own shadow DOM owns the slider widgets. */
	:global(.cp-picker) {
		width: 200px;
		height: 180px;
	}

	:global(.cp-swatches) {
		display: grid;
		grid-template-columns: repeat(8, 1fr);
		gap: 4px;
	}
	:global(.cp-swatches-btn) {
		height: 20px;
		padding: 0;
		border-radius: 3px;
		border: 1px solid var(--border);
		background: var(--cp-swatch, #888);
		cursor: pointer;
		box-shadow: inset 0 0 0 1px #ffffff40;
	}
	:global(.cp-swatches-btn:hover),
	:global(.cp-swatches-btn:focus-visible) {
		border-color: var(--text-accent);
		outline: none;
	}

	/* Hex / RGB field — sits below the swatches: a short format-toggle
	   label on the left (Hex / RGB), the monospace editable input filling
	   the row. The toggle flips the input's DISPLAY format (what the user
	   selects + copies); both formats are accepted on paste regardless. */
	:global(.cp-field) {
		display: grid;
		grid-template-columns: 2.75rem 1fr;
		gap: 6px;
		align-items: center;
	}
	:global(.cp-field-fmt) {
		all: unset;
		cursor: pointer;
		font-family: var(--font-ui);
		font-size: 0.68rem;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-dimmer);
		text-align: left;
	}
	:global(.cp-field-fmt:hover),
	:global(.cp-field-fmt:focus-visible) {
		color: var(--text-accent);
		text-decoration: underline;
		text-underline-offset: 2px;
		outline: none;
	}
	:global(.cp-field-input) {
		box-sizing: border-box;
		width: 100%;
		height: 28px;
		padding: 0 8px;
		font-family: var(--font-mono);
		font-size: 0.82rem;
		color: var(--text);
		background: var(--bg-control);
		border: 1px solid var(--border-mid);
		border-radius: 4px;
	}
	:global(.cp-field-input:focus) {
		outline: none;
		border-color: var(--text-accent);
	}
</style>
