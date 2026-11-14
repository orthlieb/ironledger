<script lang="ts">
	/**
	 * ConfirmDialog — reusable modal confirmation dialog.
	 *
	 * Backed by bits-ui `AlertDialog` (Escape + focus trap + focus
	 * return + backdrop layer all handled by the library). Public
	 * API is unchanged from the native-`<dialog>` version so
	 * callers still `bind:this={ref}` and call `ref?.open()`.
	 *
	 * Draggable is opt-in via the `draggable` prop (off by default —
	 * most confirmations are small and transient). When on, the header
	 * bar is the drag handle. Form-style confirms (New* dialogs) turn
	 * it on so they can be moved aside to see the panel behind them.
	 *
	 * Focus: a field in the body marked `autofocus` gets the caret when the
	 * dialog opens (New Character's name). Without one, bits-ui's default
	 * applies.
	 *
	 * Usage:
	 *   let ref = $state<ReturnType<typeof ConfirmDialog> | null>(null);
	 *   <ConfirmDialog bind:this={ref} title="Delete?" onconfirm={doDelete} confirmLabel="Delete">
	 *     <p>Body content here.</p>
	 *   </ConfirmDialog>
	 *   ref?.open();
	 */
	import type { Snippet } from 'svelte';
	import { AlertDialog } from 'bits-ui';
	import { headingText } from '#lib/fontStore.svelte.js';
	import { draggable as dragAction } from '#lib/actions/draggable.js';
	import { pushDialog, popDialog, overlayZ, contentZ } from '#lib/dialogStack.svelte.js';
	import gripSvg from '#icons/grip-vertical-solid.svg?raw';
	import xmarkSvg from '#icons/xmark-solid.svg?raw';

	let {
		title,
		accentColor = 'var(--color-danger)',
		draggable = false,
		width,
		maxHeight,
		confirmLabel = 'Confirm',
		confirmClass = 'btn-danger',
		cancelLabel = 'Cancel',
		showCancelButton = true,
		alternateLabel,
		alternateClass = 'btn',
		confirmDisabled = false,
		onconfirm,
		oncancel,
		ondismiss,
		onalternate,
		portalTo,
		tour,
		children,
	}: {
		title: string;
		accentColor?: string;
		/** When true, the header bar becomes a drag handle. Default false. */
		draggable?: boolean;
		/** Optional dialog width (CSS length, e.g. "420px"). Defaults to 340px. */
		width?: string;
		/** Optional height cap (CSS length, e.g. "80dvh"). The content between
		 *  the title bar and the buttons scrolls when it doesn't fit; the
		 *  title bar and buttons stay put. Uncapped by default. */
		maxHeight?: string;
		confirmLabel?: string;
		confirmClass?: string;
		cancelLabel?: string;
		showCancelButton?: boolean;
		alternateLabel?: string;
		alternateClass?: string;
		confirmDisabled?: boolean;
		onconfirm: () => void;
		oncancel?: () => void;
		/** Called when the dialog is dismissed via ✕ or Escape — falls back to oncancel if not provided. */
		ondismiss?: () => void;
		onalternate?: () => void;
		/** Portal target. Defaults to `document.body`; pass a parent
		 *  native `<dialog>` element when this confirm is invoked from
		 *  inside one, so it doesn't render behind that dialog's top
		 *  layer. */
		portalTo?: Element | string;
		/** `data-tour` id for tutorials (#lib/tutorials): on the dialog, and
		 *  `<tour>-confirm` on its confirm button. */
		tour?: string;
		children?: Snippet;
	} = $props();

	let open = $state(false);
	let contentEl = $state<HTMLElement | null>(null);

	// bits-ui focuses the dialog itself on open, after a body field's own
	// `autofocus` has fired, so hand the caret back to that field.
	function onOpenAutoFocus(e: Event) {
		const field = contentEl?.querySelector<HTMLElement>('[autofocus]');
		if (!field) return;
		e.preventDefault();
		// setTimeout(0) so bits-ui finishes its own focus routine first.
		setTimeout(() => field.focus(), 0);
	}

	// Tracks how the dialog closed. bits-ui doesn't distinguish
	// Cancel-button close from Escape/outside close — we watch the
	// `open → false` transition and, if no explicit intent was
	// recorded, treat it as a dismiss.
	let _closeIntent: 'confirm' | 'cancel' | 'alternate' | 'dismiss' | null = null;

	function openMethod() {
		_closeIntent = null;
		open = true;
	}
	function closeMethod() {
		open = false;
	}
	export { openMethod as open, closeMethod as close };

	function handleConfirm() {
		_closeIntent = 'confirm';
		open = false;
		onconfirm();
	}
	function handleCancel() {
		_closeIntent = 'cancel';
		open = false;
		oncancel?.();
	}
	function handleAlternate() {
		_closeIntent = 'alternate';
		open = false;
		onalternate?.();
	}
	function handleDismiss() {
		_closeIntent = 'dismiss';
		open = false;
		if (ondismiss) ondismiss();
		else oncancel?.();
	}

	function onOpenChange(next: boolean) {
		if (!next && _closeIntent === null) {
			if (ondismiss) ondismiss();
			else oncancel?.();
		}
		open = next;
	}

	// Stack-aware z-indexing — a confirm shown over another dialog fully
	// covers it (matching the dialogStack contract).
	let stackDepth = $state(1);
	$effect(() => {
		if (!open) return;
		stackDepth = pushDialog();
		return () => popDialog();
	});
</script>

<AlertDialog.Root bind:open {onOpenChange}>
	<AlertDialog.Portal to={portalTo}>
		<AlertDialog.Overlay class="cm-overlay" style="z-index: {overlayZ(stackDepth)}" />
		<AlertDialog.Content
			bind:ref={contentEl}
			{onOpenAutoFocus}
			class={maxHeight ? 'confirm-modal confirm-modal--capped' : 'confirm-modal'}
			data-tour={tour}
			style="--accent: {accentColor}; z-index: {contentZ(stackDepth)}{width
				? `; width: ${width}`
				: ''}{maxHeight ? `; max-height: ${maxHeight}` : ''}"
		>
			<div class="cm-header" use:dragAction={draggable}>
				{#if draggable}
					<span class="drag-grip" aria-hidden="true">{@html gripSvg}</span>
				{/if}
				<AlertDialog.Title class="cm-title">{headingText(title)}</AlertDialog.Title>
				{#if !showCancelButton}
					<button class="cm-close-btn" type="button" onclick={handleDismiss} aria-label="Close"
						>{@html xmarkSvg}</button
					>
				{/if}
			</div>
			<div class="cm-body">
				{#if children}
					<div class="cm-content">{@render children()}</div>
				{/if}
				<div class="cm-actions">
					{#if showCancelButton}
						<AlertDialog.Cancel class="btn" onclick={handleCancel}>{cancelLabel}</AlertDialog.Cancel
						>
					{/if}
					{#if alternateLabel}
						<button class="btn {alternateClass}" type="button" onclick={handleAlternate}
							>{alternateLabel}</button
						>
					{/if}
					<AlertDialog.Action
						class="btn {confirmClass}"
						data-tour={tour ? `${tour}-confirm` : undefined}
						onclick={handleConfirm}
						disabled={confirmDisabled}>{confirmLabel}</AlertDialog.Action
					>
				</div>
			</div>
		</AlertDialog.Content>
	</AlertDialog.Portal>
</AlertDialog.Root>

<style>
	/* Classes are threaded through bits-ui components, so scope with
	   :global(...) — Svelte's CSS pruning can't see class names
	   passed to a foreign component's rendered root. */
	/* Overlay + content z-index is assigned inline by dialogStack so any
	 * dialog opened later fully covers what's beneath — regardless of the
	 * base tier. See <script>. Popovers/menus (at 90+) still win by design,
	 * which is correct: a picker opened from inside a confirm must beat
	 * the confirm. */
	:global(.cm-overlay) {
		position: fixed;
		inset: 0;
		background: #00000050;
		backdrop-filter: blur(1px);
	}
	/* Standard neutral dialog surface — matches every other bits-ui
	   Dialog in the app. The `--accent` prop only surfaces as a 3px
	   LHS band (mirroring `.ea-stage` / `.cm-stage` / `.fa-stage` on
	   the home page) so entity-flavoured confirms read as "belongs to
	   the community/site/etc." without tinting the whole modal. */
	:global(.confirm-modal) {
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: 340px;
		max-width: calc(100vw - 2rem);
		border-radius: 8px;
		background: var(--bg-card);
		color: var(--text);
		border: 1px solid var(--border-mid);
		border-left: 3px solid var(--accent);
		box-shadow: 0 12px 40px #00000060;
		outline: none;
		overflow: hidden;
	}

	/* Header (title + optional ✕) — matches DialogHeader so every
	   dialog title bar reads the same. */
	:global(.confirm-modal .cm-header) {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 14px 9px;
		border-bottom: 1px solid var(--border);
		user-select: none;
		background: var(--bg-control);
	}
	:global(.confirm-modal .cm-title) {
		font-family: var(--font-display);
		font-size: calc(0.78rem * var(--font-display-scale));
		font-weight: var(--font-display-weight);
		font-variant: var(--font-display-variant);
		letter-spacing: 0.08em;
		text-transform: var(--font-display-transform);
		color: var(--text-accent);
		flex: 1;
		margin: 0;
	}
	:global(.confirm-modal .cm-close-btn) {
		all: unset;
		cursor: pointer;
		line-height: 1;
		font-size: 0.85rem;
		color: var(--text-dimmer);
		opacity: 0.6;
		padding: 2px 4px;
		border-radius: 3px;
		flex-shrink: 0;
		transition:
			opacity 0.15s,
			color 0.15s;
	}
	:global(.confirm-modal .cm-close-btn svg) {
		width: 0.74rem;
		height: 0.74rem;
		fill: currentColor;
		display: block;
	}
	:global(.confirm-modal .cm-close-btn:hover) {
		opacity: 1;
		color: var(--text);
	}

	/* Body: the content, then the buttons. The padding sits on each part
	   rather than the body, so a capped dialog's scrolling content keeps
	   room for its fields' focus rings. */
	:global(.confirm-modal .cm-body) {
		display: flex;
		flex-direction: column;
	}
	:global(.confirm-modal .cm-content) {
		padding: 12px 14px 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	:global(.confirm-modal .cm-actions) {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		padding: 12px 14px;
		justify-content: flex-end;
	}

	/* maxHeight: header and buttons stay, the content scrolls between them. */
	:global(.confirm-modal--capped) {
		display: flex;
		flex-direction: column;
	}
	:global(.confirm-modal--capped .cm-header) {
		flex-shrink: 0;
	}
	:global(.confirm-modal--capped .cm-body) {
		flex: 1;
		min-height: 0;
	}
	:global(.confirm-modal--capped .cm-content) {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		overscroll-behavior: contain;
		padding-bottom: 10px;
	}
	/* A rule over the buttons, so content scrolled under it reads as cut. */
	:global(.confirm-modal--capped .cm-actions) {
		flex-shrink: 0;
		padding-top: 10px;
		border-top: 1px solid var(--border);
	}
</style>
