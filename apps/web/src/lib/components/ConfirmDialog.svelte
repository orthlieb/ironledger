<script lang="ts">
	/**
	 * ConfirmDialog — reusable modal confirmation dialog.
	 *
	 * Matches the forsake-vow dialog pattern: centered, draggable, color-tinted
	 * with a danger (or custom) accent color.
	 *
	 * Usage:
	 *   let ref = $state<ReturnType<typeof ConfirmDialog> | null>(null);
	 *   <ConfirmDialog bind:this={ref} title="Delete?" onconfirm={doDelete} confirmLabel="Delete">
	 *     <p>Body content here.</p>
	 *   </ConfirmDialog>
	 *   ref?.open();
	 */
	import type { Snippet } from 'svelte';

	let {
		title,
		accentColor  = 'var(--color-danger)',
		confirmLabel = 'Confirm',
		confirmClass = 'btn-danger',
		cancelLabel  = 'Cancel',
		dialogClass  = '',
		onconfirm,
		oncancel,
		children,
	}: {
		title:          string;
		accentColor?:   string;
		confirmLabel?:  string;
		confirmClass?:  string;
		cancelLabel?:   string;
		dialogClass?:   string;
		onconfirm:      () => void;
		oncancel?:      () => void;
		children?:      Snippet;
	} = $props();

	let dialogEl = $state<HTMLDialogElement | null>(null);
	let dragX    = $state(0);
	let dragY    = $state(0);

	let _dragging    = false;
	let _startMouseX = 0;
	let _startMouseY = 0;
	let _startDragX  = 0;
	let _startDragY  = 0;

	export function open() {
		dragX = 0;
		dragY = 0;
		dialogEl?.showModal();
	}

	export function close() {
		dialogEl?.close();
	}

	function handleConfirm() {
		dialogEl?.close();
		onconfirm();
	}

	function handleCancel() {
		dialogEl?.close();
		oncancel?.();
	}

	function startDrag(e: MouseEvent) {
		_dragging    = true;
		_startMouseX = e.clientX;
		_startMouseY = e.clientY;
		_startDragX  = dragX;
		_startDragY  = dragY;
		e.preventDefault();
		window.addEventListener('mousemove', onDragMove);
		window.addEventListener('mouseup',   onDragEnd);
	}

	function onDragMove(e: MouseEvent) {
		if (!_dragging) return;
		dragX = _startDragX + (e.clientX - _startMouseX);
		dragY = _startDragY + (e.clientY - _startMouseY);
	}

	function onDragEnd() {
		_dragging = false;
		window.removeEventListener('mousemove', onDragMove);
		window.removeEventListener('mouseup',   onDragEnd);
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<dialog
	bind:this={dialogEl}
	class="confirm-modal {dialogClass}"
	style:--accent={accentColor}
	style:transform="translate(calc(-50% + {dragX}px), calc(-50% + {dragY}px))"
	oncancel={handleCancel}
>
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="cm-drag-handle" onmousedown={startDrag}>
		<span class="drag-grip" aria-hidden="true">⠿</span>
		<span class="cm-title">{title}</span>
		<button class="cm-close-btn" onclick={handleCancel} onmousedown={(e) => e.stopPropagation()} aria-label="Close">✕</button>
	</div>
	<div class="cm-body">
		{@render children?.()}
		<div class="cm-actions">
			<button class="btn" onclick={handleCancel}>{cancelLabel}</button>
			<button class="btn {confirmClass}" onclick={handleConfirm}>{confirmLabel}</button>
		</div>
	</div>
</dialog>

<style>
	.confirm-modal {
		border:     none;
		padding:    0;
		border-radius: 8px;
		position:   fixed;
		top:        50%;
		left:       50%;
		width:      340px;
		max-width:  calc(100vw - 2rem);
		background: color-mix(in srgb, var(--accent) 6%, var(--bg-card));
		color:      var(--text);
		box-shadow:
			0 12px 40px #00000060,
			0 0 0 1px color-mix(in srgb, var(--accent) 35%, transparent);
		outline: none;
		margin:  0;
	}

	.confirm-modal::backdrop {
		background:      #00000050;
		backdrop-filter: blur(1px);
	}

	/* ---- Drag handle / title bar ---- */
	.cm-drag-handle {
		display:         flex;
		align-items:     center;
		gap:             8px;
		padding:         10px 14px 9px;
		border-bottom:   1px solid color-mix(in srgb, var(--accent) 25%, transparent);
		cursor:          grab;
		user-select:     none;
		border-radius:   8px 8px 0 0;
		background:      color-mix(in srgb, var(--accent) 10%, var(--bg-card));
	}
	.cm-drag-handle:active { cursor: grabbing; }

	.drag-grip {
		font-size:   1rem;
		color:       var(--text-dimmer);
		line-height: 1;
		opacity:     0.6;
		flex-shrink: 0;
	}

	.cm-title {
		font-family:    var(--font-display);
		font-size:      0.78rem;
		font-weight:    700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color:          var(--accent);
		flex:           1;
	}

	.cm-close-btn {
		all:         unset;
		cursor:      pointer;
		line-height: 1;
		font-size:   0.85rem;
		color:       var(--text-dimmer);
		opacity:     0.6;
		padding:     2px 4px;
		border-radius: 3px;
		flex-shrink: 0;
		transition:  opacity 0.15s, background 0.15s;
	}
	.cm-close-btn:hover {
		opacity:    1;
		background: color-mix(in srgb, var(--accent) 15%, transparent);
		color:      var(--accent);
	}

	/* ---- Body ---- */
	.cm-body {
		padding:        12px 14px;
		display:        flex;
		flex-direction: column;
		gap:            8px;
	}

	.cm-actions {
		display:         flex;
		gap:             6px;
		margin-top:      4px;
		justify-content: flex-end;
	}
</style>
