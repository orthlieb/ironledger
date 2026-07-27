<script lang="ts">
	/**
	 * Checkbox — shared bits-ui Checkbox wrapper.
	 *
	 * Drop-in replacement for a native `type="checkbox"` input, with
	 * house-style chrome (.bui-check-* classes, global in this component's
	 * style block) that matches on desktop and mobile. Use whenever a
	 * plain boolean toggle is needed. The label snippet slot takes the
	 * text that would have sat next to the native input.
	 *
	 * Two visual modes:
	 *   • default — a compact square box + inline label. Use for settings
	 *     toggles ("Show grid", "Include preface").
	 *   • variant="switch" — a track + thumb pill that reads as an on/off
	 *     switch. Use where a card-like row previously used a bespoke
	 *     .cf-switch or similar.
	 *
	 * The bits-ui primitive is headless — this file owns the visible
	 * chrome and the check glyph. Ref exposes the underlying button
	 * so callers can imperatively .focus() when needed.
	 */
	import { Checkbox as BitsCheckbox } from 'bits-ui';
	import type { Snippet } from 'svelte';

	let {
		checked = $bindable(false),
		disabled = false,
		id,
		name,
		value,
		ariaLabel,
		variant = 'default',
		bare = false,
		class: cls = '',
		onCheckedChange,
		children,
	}: {
		checked?: boolean;
		disabled?: boolean;
		id?: string;
		name?: string;
		value?: string;
		ariaLabel?: string;
		variant?: 'default' | 'switch';
		/** Skip the outer `<label>` wrapper. Use when the checkbox is
		 *  already sitting inside a parent `<label>` (or bespoke row
		 *  chrome) — nesting `<label>`s is invalid HTML. */
		bare?: boolean;
		class?: string;
		onCheckedChange?: (v: boolean) => void;
		children?: Snippet;
	} = $props();

	function handleChange(v: boolean) {
		checked = v;
		onCheckedChange?.(v);
	}
</script>

{#snippet primitive()}
	<BitsCheckbox.Root
		{id}
		{name}
		{value}
		{checked}
		{disabled}
		aria-label={ariaLabel}
		onCheckedChange={handleChange}
		class={variant === 'switch' ? `bui-switch ${bare ? cls : ''}` : `bui-check ${bare ? cls : ''}`}
	>
		{#snippet children({ checked: c })}
			{#if variant === 'switch'}
				<span class="bui-switch-thumb" class:bui-switch-thumb--on={c}></span>
			{:else if c}
				<svg
					class="bui-check-glyph"
					viewBox="0 0 12 12"
					aria-hidden="true"
					xmlns="http://www.w3.org/2000/svg"
				>
					<path
						d="M2.5 6.2l2.4 2.4L9.7 3.6"
						fill="none"
						stroke="currentColor"
						stroke-width="1.8"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
			{/if}
		{/snippet}
	</BitsCheckbox.Root>
{/snippet}

{#if bare}
	{@render primitive()}
{:else}
	<label
		class="bui-check-row {variant === 'switch' ? 'bui-check-row--switch' : ''} {cls}"
		class:bui-check-row--disabled={disabled}
	>
		{@render primitive()}
		{#if children}
			<span class="bui-check-label">{@render children()}</span>
		{/if}
	</label>
{/if}

<style>
	/* bits-ui Checkbox renders a plain <button>; owned chrome lives on the
	   `.bui-check` / `.bui-switch` classes and their surrounding row. */
	:global(.bui-check-row) {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		cursor: pointer;
		user-select: none;
		font-family: var(--font-ui);
		font-size: 0.82rem;
		color: var(--text);
	}
	:global(.bui-check-row--disabled) {
		opacity: 0.55;
		cursor: default;
	}

	:global(.bui-check) {
		flex-shrink: 0;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 16px;
		height: 16px;
		padding: 0;
		background: var(--bg-control);
		color: var(--text-accent);
		border: 1px solid var(--border-mid);
		border-radius: 3px;
		cursor: pointer;
		transition:
			background 0.12s,
			border-color 0.12s;
	}
	:global(.bui-check:hover:not(:disabled)) {
		border-color: var(--text-accent);
	}
	:global(.bui-check:focus-visible) {
		outline: 2px solid var(--text-accent);
		outline-offset: 1px;
	}
	:global(.bui-check[data-state='checked']) {
		background: var(--bui-check-color, var(--text-accent));
		border-color: var(--bui-check-color, var(--text-accent));
		color: var(--bg-card);
	}
	:global(.bui-check:disabled) {
		cursor: default;
	}
	:global(.bui-check-glyph) {
		width: 12px;
		height: 12px;
		pointer-events: none;
	}
	:global(.bui-check-label) {
		min-width: 0;
	}

	/* Switch variant — track + thumb. Same primitive, different chrome. */
	:global(.bui-switch) {
		flex-shrink: 0;
		display: inline-flex;
		align-items: center;
		width: 30px;
		height: 16px;
		padding: 1px;
		background: var(--bg-inset);
		border: 1px solid var(--border-mid);
		border-radius: 999px;
		cursor: pointer;
		transition:
			background 0.15s,
			border-color 0.15s;
	}
	:global(.bui-switch:hover:not(:disabled)) {
		border-color: var(--text-accent);
	}
	:global(.bui-switch:focus-visible) {
		outline: 2px solid var(--text-accent);
		outline-offset: 1px;
	}
	:global(.bui-switch[data-state='checked']) {
		background: var(--text-accent);
		border-color: var(--text-accent);
	}
	:global(.bui-switch-thumb) {
		display: block;
		width: 12px;
		height: 12px;
		background: var(--text);
		border-radius: 999px;
		transform: translateX(0);
		transition: transform 0.15s ease-out;
	}
	:global(.bui-switch-thumb--on) {
		background: var(--bg-card);
		transform: translateX(14px);
	}
</style>
