<script lang="ts" generics="T extends string">
	/**
	 * Select — shared bits-ui Select wrapper.
	 *
	 * A drop-in replacement for a native select inside a form field,
	 * with uniform styling (.bui-select-* classes, global in this
	 * component's style block) across every call site. Reach for this
	 * whenever a native select would do; reach for the Popover +
	 * Command combobox in docs/ui-components.md when you need
	 * typeahead search. Pass portalTo when this select lives inside
	 * a native dialog element so the popover renders on top of its
	 * top layer.
	 */
	import { Select as BitsSelect } from 'bits-ui';
	import caretDownSvg from '$icons/caret-large-down-solid.svg?raw';

	interface Option {
		value: T;
		label: string;
		disabled?: boolean;
		/** Optional inline SVG glyph (raw markup) shown before the label, in the
		 *  trigger and the item — e.g. a kind icon to distinguish options in a
		 *  long list. */
		icon?: string;
		/** Optional accent colour for the glyph (fill: currentColor on the svg). */
		color?: string;
	}

	let {
		value = $bindable(),
		options,
		placeholder = 'Select…',
		id,
		class: cls = '',
		ariaLabel,
		disabled = false,
		required = false,
		portalTo,
		onchange,
	}: {
		value: T;
		options: Option[];
		placeholder?: string;
		id?: string;
		class?: string;
		ariaLabel?: string;
		disabled?: boolean;
		required?: boolean;
		/** Portal target — pass a parent native `<dialog>` when this
		 *  select lives inside one, so the popover renders on top of
		 *  its top layer. Defaults to `document.body`. */
		portalTo?: Element | string;
		/** Fires after `value` updates. Optional — `bind:value` is the
		 *  usual channel. */
		onchange?: (v: T) => void;
	} = $props();

	function handleValueChange(v: string) {
		value = v as T;
		onchange?.(v as T);
	}

	const selected = $derived(options.find((o) => o.value === value));
	const selectedLabel = $derived(selected?.label ?? '');
	const isPlaceholder = $derived(selectedLabel === '');
</script>

<BitsSelect.Root type="single" {value} onValueChange={handleValueChange} {disabled} {required}>
	<BitsSelect.Trigger {id} class={`bui-select-trigger ${cls}`.trim()} aria-label={ariaLabel}>
		{#if selected?.icon}
			<span
				class="bui-select-optglyph"
				style:--opt-color={selected.color ?? 'currentColor'}
				aria-hidden="true">{@html selected.icon}</span
			>
		{/if}
		<span class="bui-select-value" class:bui-select-value--placeholder={isPlaceholder}>
			{isPlaceholder ? placeholder : selectedLabel}
		</span>
		<span class="bui-select-caret" aria-hidden="true">{@html caretDownSvg}</span>
	</BitsSelect.Trigger>
	<BitsSelect.Portal to={portalTo}>
		<!--
			Inline z-index mirrors the CSS below. bits-ui reads it off the
			content node in a rAF and copies it to the Floating-UI wrapper
			(the real stacking-context element); without it, the wrapper
			has no z-index for the first frame or two after mount and can
			paint behind a nested dialog. See the note on the CSS rule
			below and the z-index budget in docs/ui-components.md.
		-->
		<BitsSelect.Content class="bui-select-content" sideOffset={4} style="z-index: 200">
			{#each options as opt (opt.value)}
				<BitsSelect.Item
					value={opt.value}
					label={opt.label}
					disabled={opt.disabled}
					class="bui-select-item"
				>
					{#if opt.icon}
						<span
							class="bui-select-optglyph"
							style:--opt-color={opt.color ?? 'currentColor'}
							aria-hidden="true">{@html opt.icon}</span
						>
					{/if}
					{opt.label}
				</BitsSelect.Item>
			{/each}
		</BitsSelect.Content>
	</BitsSelect.Portal>
</BitsSelect.Root>

<style>
	/* All bits-ui components render their own DOM roots that Svelte's
	   CSS pruning can't see, so every selector below has to be
	   `:global()`. The `.bui-select-*` prefix is app-wide (see
	   docs/ui-components.md). */
	:global(.bui-select-trigger) {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 4px 6px 4px 10px;
		background: var(--bg-control);
		color: var(--text);
		border: 1px solid var(--border-mid);
		border-radius: 4px;
		font-family: var(--font-ui);
		font-size: 0.82rem;
		font-weight: 500;
		text-align: left;
		cursor: pointer;
		min-height: 30px;
		min-width: 0;
		transition: border-color 0.12s;
	}
	:global(.bui-select-trigger:hover:not(:disabled)),
	:global(.bui-select-trigger:focus-visible) {
		border-color: var(--text-accent);
		outline: none;
	}
	:global(.bui-select-trigger[data-state='open']) {
		border-color: var(--text-accent);
		box-shadow: inset 0 -2px 0 0 var(--text-accent);
	}
	:global(.bui-select-trigger:disabled) {
		opacity: 0.5;
		cursor: default;
	}
	:global(.bui-select-value) {
		flex: 1 1 auto;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	/* Optional per-option glyph (icon) — tinted via --opt-color. Shown in the
	   trigger's selected value and in each dropdown item. */
	:global(.bui-select-optglyph) {
		flex-shrink: 0;
		display: inline-flex;
		width: 14px;
		height: 14px;
		color: var(--opt-color, currentColor);
	}
	:global(.bui-select-optglyph svg) {
		width: 100%;
		height: 100%;
		fill: currentColor;
		display: block;
	}
	:global(.bui-select-value--placeholder) {
		color: var(--text-dimmer);
		font-style: italic;
	}
	:global(.bui-select-caret) {
		flex-shrink: 0;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 16px;
		height: 16px;
		color: var(--text-muted);
	}
	:global(.bui-select-caret svg) {
		width: 10px;
		height: 10px;
		fill: currentColor;
	}
	:global(.bui-select-caret svg path) {
		fill: currentColor;
	}

	:global(.bui-select-content) {
		width: var(--bits-select-anchor-width);
		min-width: 160px;
		max-height: min(320px, 60vh);
		overflow-y: auto;
		overscroll-behavior: contain;
		padding: 4px 0;
		background: var(--bg-card);
		color: var(--text);
		border: 1px solid var(--border-mid);
		border-radius: 6px;
		box-shadow: 0 12px 32px #00000060;
		/* 200 — popovers/menus must beat bits-ui modal content at any
		   nesting depth (contentZ(depth) = 81 + depth*2, so 85 at
		   depth 2, 87 at depth 3). bits-ui's Select has two nested
		   divs (a Floating-UI wrapper and an inner content div): the
		   class here is on the INNER one, and bits-ui reads its
		   computed z-index in a rAF and copies it up to the wrapper
		   (which is the real stacking-context element via its
		   transform). Content also carries an inline
		   `style="z-index: 200"` so the wrapper picks up the value on
		   the first frame — before that copy landed, the wrapper had
		   no z-index and could paint behind a nested dialog above it.
		   See the z-index budget in docs/ui-components.md. */
		z-index: 200;
		outline: none;
	}
	:global(.bui-select-item) {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 12px;
		font-family: var(--font-ui);
		font-size: 0.85rem;
		color: var(--text);
		cursor: pointer;
		user-select: none;
	}
	:global(.bui-select-item[data-highlighted]),
	:global(.bui-select-item:hover) {
		background: color-mix(in srgb, var(--text) 6%, transparent);
	}
	:global(.bui-select-item[data-selected]) {
		font-weight: 600;
		color: var(--text-accent);
	}
	:global(.bui-select-item[data-disabled]) {
		opacity: 0.5;
		cursor: default;
	}
</style>
