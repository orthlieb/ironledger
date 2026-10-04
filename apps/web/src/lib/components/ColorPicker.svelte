<script lang="ts">
	/**
	 * ColorPicker — a bits-ui Popover wrapped around vanilla-colorful's
	 * `<hex-color-picker>` web component. Replaces the old Pickr-based
	 * version so the picker lives inside the dialog's focus trap (no
	 * cross-portal focus bouncing), themes via plain CSS variables, and
	 * drops a ~15 KB CSS + JS dependency.
	 *
	 * Public API is unchanged:
	 *   • `value`      — bindable `#rrggbb` string.
	 *   • `onchange`   — fires on every commit (swatch tap or picker drag end).
	 *   • `disabled`   — inert button, no popover.
	 *   • `ariaLabel`  — button a11y name.
	 *   • `swatches`   — optional swatch strip; defaults to eight tabletop hues.
	 *
	 * Rendering: a trigger button that opens a bits-ui Popover.Content on
	 * click. The content hosts the `<hex-color-picker>` custom element (live
	 * value sync via its `color-changed` event) and a strip of swatch
	 * buttons. The popover closes on Escape, outside click, or picking a
	 * swatch — same ergonomics as the old Pickr.
	 */
	import { onMount } from 'svelte';
	import { Popover } from 'bits-ui';

	// vanilla-colorful ships as a side-effecting custom-element registration.
	// Import it in the browser only so SSR doesn't try to touch `window`.
	// SvelteKit tree-shakes browser-only effects, so onMount is the safe hook.
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

	import type { Snippet } from 'svelte';

	let {
		value = $bindable(),
		onchange,
		onswatch,
		disabled = false,
		ariaLabel = 'Colour',
		swatches = DEFAULT_SWATCHES,
		trigger,
	}: {
		value: string;
		onchange?: (v: string) => void;
		/** Fires when the user picks a swatch (NOT on every picker drag).
		 *  Useful for MRU tracking so only committed colours are recorded. */
		onswatch?: (v: string) => void;
		disabled?: boolean;
		ariaLabel?: string;
		swatches?: string[];
		/** Optional custom trigger. When omitted, the default `.cp-swatch`
		 *  button is rendered. The snippet is wrapped in a Popover.Trigger
		 *  via bits-ui's child-render pattern so the caller controls the
		 *  button's markup entirely. */
		trigger?: Snippet<[{ props: Record<string, unknown> }]>;
	} = $props();

	let open = $state(false);

	/** Normalise to seven-char `#rrggbb`. vanilla-colorful emits lower-case
	 *  hex already, but a hand-set `value` may be upper-case or shorthand. */
	function normalizeHex(c: string): string {
		if (!c) return c;
		let hx = c.toLowerCase().replace(/^#/, '');
		if (/^[0-9a-f]{3}$/.test(hx)) hx = hx.replace(/./g, (ch) => ch + ch);
		return '#' + hx;
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
</style>
