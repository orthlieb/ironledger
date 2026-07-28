<script lang="ts">
	/**
	 * ConfirmDialog — reusable modal confirmation dialog.
	 *
	 * Backed by bits-ui `AlertDialog` (Escape + focus trap + focus
	 * return + backdrop layer all handled by the library). Public
	 * API is unchanged from the native-`<dialog>` version so
	 * callers still `bind:this={ref}` and call `ref?.open()`.
	 *
	 * Draggability from the old version is retired — small confirm
	 * dialogs rarely need repositioning and bits-ui doesn't own
	 * drag. If a specific caller needs it back, use a custom
	 * `Dialog` there instead.
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
	import { headingText } from '$lib/fontStore.svelte.js';

	let {
		title,
		accentColor = 'var(--color-danger)',
		width,
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
		children,
	}: {
		title: string;
		accentColor?: string;
		/** Optional dialog width (CSS length, e.g. "420px"). Defaults to 340px. */
		width?: string;
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
		children?: Snippet;
	} = $props();

	let open = $state(false);
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
</script>

<AlertDialog.Root bind:open {onOpenChange}>
	<AlertDialog.Portal to={portalTo}>
		<AlertDialog.Overlay class="cm-overlay" />
		<AlertDialog.Content
			class="confirm-modal"
			style="--accent: {accentColor}{width ? `; width: ${width}` : ''}"
		>
			<div class="cm-header">
				<AlertDialog.Title class="cm-title">{headingText(title)}</AlertDialog.Title>
				{#if !showCancelButton}
					<button class="cm-close-btn" type="button" onclick={handleDismiss} aria-label="Close"
						>✕</button
					>
				{/if}
			</div>
			<div class="cm-body">
				{@render children?.()}
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
	/* Overlay + content sit ONE tier above the standard 80/81 modal tier
	 * so a Confirm opened from inside another modal (e.g. the asset
	 * dialog's "Delete Asset" confirm) reliably stacks on top instead of
	 * relying on portal DOM-append order. Popovers and menus (at 90+)
	 * still win, which is correct — a picker opened from inside a
	 * confirm dialog must beat the confirm. */
	:global(.cm-overlay) {
		position: fixed;
		inset: 0;
		background: #00000050;
		backdrop-filter: blur(1px);
		z-index: 82;
	}
	:global(.confirm-modal) {
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: 340px;
		max-width: calc(100vw - 2rem);
		border: none;
		border-radius: 8px;
		background: color-mix(in srgb, var(--accent) 6%, var(--bg-card));
		color: var(--text);
		box-shadow:
			0 12px 40px #00000060,
			0 0 0 1px color-mix(in srgb, var(--accent) 35%, transparent);
		outline: none;
		z-index: 83;
	}

	/* Header (title + optional ✕) */
	:global(.confirm-modal .cm-header) {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 14px 9px;
		border-bottom: 1px solid color-mix(in srgb, var(--accent) 25%, transparent);
		user-select: none;
		border-radius: 8px 8px 0 0;
		background: color-mix(in srgb, var(--accent) 10%, var(--bg-card));
	}
	:global(.confirm-modal .cm-title) {
		font-family: var(--font-display);
		font-size: calc(0.78rem * var(--font-display-scale));
		font-weight: var(--font-display-weight);
		font-variant: var(--font-display-variant);
		letter-spacing: 0.08em;
		text-transform: var(--font-display-transform);
		color: var(--accent);
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
			background 0.15s;
	}
	:global(.confirm-modal .cm-close-btn:hover) {
		opacity: 1;
		background: color-mix(in srgb, var(--accent) 15%, transparent);
		color: var(--accent);
	}

	/* Body */
	:global(.confirm-modal .cm-body) {
		padding: 12px 14px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	:global(.confirm-modal .cm-actions) {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		margin-top: 4px;
		justify-content: flex-end;
	}
</style>
