<script lang="ts">
	/**
	 * A stat tile with coloured background icon, stat name at top, and value at bottom.
	 * Used for Edge, Heart, Iron, Shadow, Wits.
	 * Stats rarely change so ± buttons have been intentionally omitted.
	 * Standard Ironsworn range: 1–3.
	 * Fires onchange(oldVal, newVal) on blur when the value actually changed.
	 */

	import brainSvg from '$icons/brain.svg?raw';
	import fistSvg from '$icons/fist.svg?raw';
	import shadowSvg from '$icons/shadow.svg?raw';
	import rabbitSvg from '$icons/rabbit-running-solid.svg?raw';
	import heartSvg from '$icons/icon-heart.svg?raw';
	import { tooltip as tooltipAction } from '$lib/actions/tooltip.js';

	const STAT_ICONS: Record<string, string> = {
		Edge: rabbitSvg,
		Heart: heartSvg,
		Iron: fistSvg,
		Shadow: shadowSvg,
		Wits: brainSvg,
	};

	let {
		label,
		value = $bindable(1),
		color = 'var(--text)',
		min = 1,
		max = 3,
		tooltip = '',
		readonly = false,
		onchange,
	}: {
		label: string;
		value?: number;
		color?: string;
		min?: number;
		max?: number;
		/** Tooltip text shown on hover */
		tooltip?: string;
		/** When true, the tile is a display only — the value is not editable
		 *  (spinners hidden anyway, but the input keeps its readonly attr so
		 *  the caret can't land and no keystroke changes the number). Kept
		 *  as a plain `<input>` so the tile layout, focus behaviour for
		 *  screen-reader / selection, and the styling contract with parent
		 *  containers all stay identical to the editable tile. */
		readonly?: boolean;
		/** Fired when value is committed (on blur) and differs from the focused value */
		onchange?: (oldVal: number, newVal: number) => void;
	} = $props();

	// Capture value at focus time so we know what changed on blur
	let focusValue = 0;

	const icon = $derived(STAT_ICONS[label] ?? '');

	// Per-instance stable id so the field has a `name` for autofill /
	// accessibility tooling ("A form field has neither an id nor a name"
	// Chrome DevTools warning). Not tied to any real form submission —
	// StatControl writes straight to bound state — but the DOM still
	// needs the attr for scoring + screen-reader stability. Derived so
	// changing `label` re-derives the id; the uid suffix is stable per
	// mount (captured once) to avoid re-derivation storms mid-edit.
	const uidSuffix = crypto.randomUUID().slice(0, 8);
	const inputId = $derived(`stat-${label.toLowerCase()}-${uidSuffix}`);
</script>

<div class="stat-tile" style:--stat-color={color} use:tooltipAction={tooltip}>
	<div class="stat-icon" aria-hidden="true">{@html icon}</div>
	<div class="stat-name">{label}</div>
	<input
		type="number"
		class="stat-value-input"
		class:stat-value-input--readonly={readonly}
		id={inputId}
		name={inputId}
		bind:value
		{min}
		{max}
		{readonly}
		onfocus={() => {
			focusValue = value;
		}}
		onblur={() => {
			// Editable tiles clamp + notify on blur; a readonly tile can't
			// have edited the value, so both are no-ops.
			if (readonly) return;
			const clamped = Math.min(max, Math.max(min, value || min));
			value = clamped;
			if (clamped !== focusValue) onchange?.(focusValue, clamped);
		}}
		aria-label="{label} stat value"
	/>
</div>

<style>
	.stat-tile {
		position: relative;
		width: 52px;
		height: 52px;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: space-between;
		padding: 5px 4px 4px;
		margin: 2px;
		border-radius: 6px;
		background: color-mix(in srgb, var(--stat-color) 8%, var(--bg-card));
		overflow: hidden;
		cursor: default;
		transition: background 0.15s;
	}

	/* Focus tint fires only for the editable variant — a readonly tile has
	   nothing to edit, so the hover/focus lift would just mislead. */
	.stat-tile:has(.stat-value-input:focus:not(.stat-value-input--readonly)) {
		background: color-mix(in srgb, var(--stat-color) 16%, var(--bg-card));
	}

	/* Background icon — aligned to bottom */
	.stat-icon {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		opacity: 0.22;
		pointer-events: none;
	}

	:global([data-theme='dark']) .stat-icon {
		opacity: 0.5;
	}

	.stat-icon :global(svg) {
		width: calc(100% - 6px);
		height: calc(100% - 6px);
		fill: var(--stat-color);
		color: var(--stat-color);
	}

	/* Stat name at top */
	.stat-name {
		font-family: var(--font-ui);
		font-size: 0.55rem;
		font-weight: 900;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--stat-color);
		position: relative;
		z-index: 1;
		line-height: 1;
	}

	/* Value input at bottom */
	.stat-value-input {
		font-family: var(--font-ui);
		font-size: 1.3rem;
		font-weight: 900;
		font-variant-numeric: tabular-nums;
		width: 100%;
		text-align: center;
		padding: 0;
		border: none;
		background: transparent;
		color: var(--stat-color);
		position: relative;
		z-index: 1;
		line-height: 1;
		margin-bottom: 2px;
		/* Hide browser number input spinners */
		-moz-appearance: textfield;
		appearance: textfield;
	}

	.stat-value-input:focus {
		outline: none;
	}

	/* Readonly tile: default cursor + text-select instead of the caret,
	   makes it clear the number is a display, not an edit field. */
	.stat-value-input--readonly {
		cursor: default;
	}

	.stat-value-input::-webkit-outer-spin-button,
	.stat-value-input::-webkit-inner-spin-button {
		-webkit-appearance: none;
		margin: 0;
	}
</style>
