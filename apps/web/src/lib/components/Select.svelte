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

	const selectedLabel = $derived(options.find((o) => o.value === value)?.label ?? '');
	const isPlaceholder = $derived(selectedLabel === '');
</script>

<BitsSelect.Root type="single" {value} onValueChange={handleValueChange} {disabled} {required}>
	<BitsSelect.Trigger {id} class={`bui-select-trigger ${cls}`.trim()} aria-label={ariaLabel}>
		<span class="bui-select-value" class:bui-select-value--placeholder={isPlaceholder}>
			{isPlaceholder ? placeholder : selectedLabel}
		</span>
		<span class="bui-select-caret" aria-hidden="true">{@html caretDownSvg}</span>
	</BitsSelect.Trigger>
	<BitsSelect.Portal to={portalTo}>
		<BitsSelect.Content class="bui-select-content" sideOffset={4}>
			{#each options as opt (opt.value)}
				<BitsSelect.Item
					value={opt.value}
					label={opt.label}
					disabled={opt.disabled}
					class="bui-select-item"
				>
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
		z-index: 60;
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
