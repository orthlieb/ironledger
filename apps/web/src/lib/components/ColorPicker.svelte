<script lang="ts">
	/**
	 * ColorPicker — a small reusable Pickr colour swatch.
	 *
	 * Renders a single swatch button that opens the Pickr popover (nano
	 * theme, portalled to <body>) on click. Picking from a swatch or
	 * releasing the wheel commits the colour and auto-closes, mirroring
	 * the marker editor's picker. Two-way via `bind:value`; `onchange`
	 * fires after each commit for persistence side-effects.
	 *
	 * Self-contained: it carries its own `:global(.pcr-app)` z-index rule
	 * (200, above every dialog) so it works anywhere, not only where
	 * MapDialog happens to be mounted. When `disabled`, no Pickr is
	 * created and the button is inert.
	 */
	import { untrack } from 'svelte';
	import Pickr from '@simonwep/pickr';
	import '@simonwep/pickr/dist/themes/nano.min.css';

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
		disabled = false,
		ariaLabel = 'Colour',
		swatches = DEFAULT_SWATCHES,
	}: {
		value: string;
		onchange?: (v: string) => void;
		disabled?: boolean;
		ariaLabel?: string;
		swatches?: string[];
	} = $props();

	let anchor = $state<HTMLButtonElement | null>(null);
	let pickr: Pickr | null = null;

	/** Seven-char `#rrggbb` (no alpha) — trim Pickr's HEXA `…ff` tail. */
	function normalizeHex(color: string): string {
		return color.startsWith('#') ? color.slice(0, 7).toLowerCase() : color;
	}

	// Create/tear down Pickr with the anchor's presence + the disabled
	// flag. `untrack` the colour read so edits don't recreate the widget.
	$effect(() => {
		if (disabled || !anchor) return;
		const el = anchor;
		const initial = untrack(() => value);
		const instance = Pickr.create({
			el,
			container: document.body,
			useAsButton: true,
			theme: 'nano',
			default: initial,
			swatches,
			components: {
				preview: true,
				opacity: false,
				hue: true,
				interaction: { hex: false, input: false, clear: false, save: false },
			},
		});
		instance.on('change', (c: ReturnType<Pickr['getColor']>) => {
			value = normalizeHex(c.toHEXA().toString());
			onchange?.(value);
			// No Save button (save:false), so nudge applyColor ourselves to
			// refresh the trigger chip. Guarded — applyColor emits 'save',
			// which some Pickr versions choke on when save UI is disabled.
			try {
				instance.applyColor(true);
			} catch {
				/* known: applyColor's save-emit path when save:false */
			}
		});
		// Swatch tap or wheel release = commit → auto-close.
		instance.on('swatchselect', () => {
			try {
				instance.hide();
			} catch {
				/* Pickr teardown race — safe to ignore */
			}
		});
		instance.on('changestop', () => {
			try {
				instance.hide();
			} catch {
				/* Pickr teardown race — safe to ignore */
			}
		});
		pickr = instance;
		return () => {
			try {
				instance.destroyAndRemove();
			} catch {
				/* known Pickr teardown race */
			}
			if (pickr === instance) pickr = null;
		};
	});

	// External `value` change → sync the widget silently (no 'change' echo).
	$effect(() => {
		const c = value;
		const p = pickr;
		if (!p || !c) return;
		const cur = normalizeHex(p.getColor()?.toHEXA().toString() ?? '');
		if (cur !== c.toLowerCase()) p.setColor(c, true);
	});
</script>

<button
	type="button"
	class="cp-swatch"
	style="--cp-color: {value}"
	bind:this={anchor}
	{disabled}
	aria-label={ariaLabel}
></button>

<style>
	.cp-swatch {
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
	.cp-swatch:hover:not(:disabled),
	.cp-swatch:focus-visible {
		border-color: var(--text-accent);
		outline: none;
	}
	.cp-swatch:disabled {
		opacity: 0.4;
		cursor: default;
	}

	/* Pickr portals its popover to <body>; lift it above every dialog
	   (settings content 81, popovers 90). Matches MapDialog's rule so
	   the two never disagree. */
	:global(.pcr-app) {
		z-index: 200;
		pointer-events: auto;
	}
</style>
