<script lang="ts" generics="T extends string | number">
	/**
	 * SegmentedRadio — a squared segmented toggle (pick one of N), styled to
	 * match the Initiative control in CharactersArea. Each option is an
	 * icon-and/or-label segment; the selected one is tinted by its `tone`.
	 *
	 * Used for: foe active/vanquished, journey/site active/complete, NPC
	 * alive/deceased, and character initiative (none/foe/character).
	 *
	 * Tones (active-segment tint): 'go' = green, 'stop' = red, 'neutral' = accent.
	 *
	 * Labels:
	 *   'always' — icon + uppercase text (initiative).
	 *   'auto'   — icon + text when the nearest container ancestor has room,
	 *              collapsing to icon-only (+ tooltip) when tight. The consuming
	 *              header must set `container-type: inline-size`.
	 *   'never'  — icon-only always.
	 *
	 * Tooltips use the shared `tooltip` action; `label` doubles as the
	 * accessible name (required, since icon-only segments have no text).
	 */
	import { tooltip } from '$lib/actions/tooltip.js';

	type Tone = 'go' | 'stop' | 'neutral';

	interface Option {
		value: T;
		/** Tooltip + accessible name. */
		label: string;
		/** Raw SVG markup (imported with ?raw). */
		icon?: string;
		/** Visible uppercase label (shown per the `labels` mode). */
		text?: string;
		/** Active-segment tint. Defaults to 'neutral'. */
		tone?: Tone;
	}

	let {
		options,
		value = $bindable(),
		onchange,
		ariaLabel,
		labels = 'never',
	}: {
		options: Option[];
		value: T;
		onchange?: (v: T) => void;
		ariaLabel: string;
		labels?: 'always' | 'auto' | 'never';
	} = $props();

	function select(v: T) {
		if (v === value) return;
		value = v;
		onchange?.(v);
	}
</script>

<div class="sr sr--{labels}" role="radiogroup" aria-label={ariaLabel}>
	{#each options as opt (opt.value)}
		<button
			type="button"
			class="sr-btn sr-btn--{opt.tone ?? 'neutral'}"
			class:sr-btn--active={value === opt.value}
			role="radio"
			aria-checked={value === opt.value}
			aria-label={opt.label}
			use:tooltip={opt.label}
			onclick={() => select(opt.value)}
		>
			{#if opt.icon}<span class="sr-ic">{@html opt.icon}</span>{/if}
			{#if opt.text && labels !== 'never'}<span class="sr-lbl">{opt.text}</span>{/if}
		</button>
	{/each}
</div>

<style>
	.sr {
		display: inline-flex;
		border: 1px solid var(--border-mid);
		border-radius: 4px;
		overflow: hidden;
	}
	.sr-btn {
		all: unset;
		display: inline-flex;
		align-items: center;
		gap: 3px;
		padding: 2px 7px;
		font-family: var(--font-ui);
		font-size: 0.58rem;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--text-muted);
		background: transparent;
		border-right: 1px solid var(--border-mid);
		cursor: pointer;
		box-sizing: border-box;
		transition:
			background 0.12s,
			color 0.12s;
	}
	.sr-btn:last-child {
		border-right: none;
	}
	.sr-btn:hover:not(.sr-btn--active) {
		background: rgba(255, 255, 255, 0.05);
	}
	.sr-ic {
		display: inline-flex;
	}
	.sr-ic :global(svg) {
		display: block;
		width: 9px;
		height: 9px;
		fill: currentColor;
		flex-shrink: 0;
	}

	/* Icon-only modes: a touch larger glyph and balanced padding. */
	.sr--never .sr-btn {
		padding: 3px 6px;
	}
	.sr--never .sr-ic :global(svg) {
		width: 12px;
		height: 12px;
	}

	/* Active-segment tints — copied verbatim from the Initiative control. */
	.sr-btn--active.sr-btn--neutral {
		background: var(--text-accent);
		color: var(--bg-card);
	}
	.sr-btn--active.sr-btn--go {
		background: rgba(52, 211, 153, 0.18);
		color: #34d399;
	}
	.sr-btn--active.sr-btn--stop {
		background: rgba(239, 68, 68, 0.14);
		color: #ef4444;
	}

	/* Responsive labels: collapse to icon-only when the header is tight. The
	   query measures the nearest container ancestor (the consuming header). */
	@container (max-width: 360px) {
		.sr--auto .sr-lbl {
			display: none;
		}
		.sr--auto .sr-btn {
			padding: 3px 6px;
		}
		.sr--auto .sr-ic :global(svg) {
			width: 12px;
			height: 12px;
		}
	}
</style>
