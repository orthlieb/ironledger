/**
 * Svelte action that makes a dialog draggable by its header.
 * Apply to the dialog's header element: `use:draggable`
 *
 * The action finds the closest parent dialog surface — either a native
 * `<dialog>` element or any bits-ui-style container marked
 * `role="dialog"` (both `Dialog.Content` and `AlertDialog.Content`
 * render with that role) — and enables drag-to-move. Position resets
 * to CSS defaults each time a native dialog opens; bits-ui dialogs
 * unmount their Content on close, so the fresh mount is the reset.
 */
export function draggable(headerEl: HTMLElement) {
	const dialogOrNull = headerEl.closest('dialog, [role="dialog"]') as HTMLElement | null;
	if (!dialogOrNull) return;
	// Capture as a non-null typed variable so the closures below see
	// HTMLElement, not HTMLElement | null.
	const dialog: HTMLElement = dialogOrNull;

	let startX = 0;
	let startY = 0;
	let origLeft = 0;
	let origTop = 0;

	// Reset inline position overrides when the dialog transitions to open
	// so CSS defaults apply. Only meaningful for native `<dialog>` (which
	// toggles the `open` attribute) — for bits-ui `Dialog.Content`, the
	// element unmounts when closed, so on re-open it's already a fresh
	// node with no inline styles and the mutation callback simply never
	// fires (the attribute never appears).
	const observer = new MutationObserver(() => {
		if (dialog instanceof HTMLDialogElement && dialog.open) {
			dialog.style.removeProperty('left');
			dialog.style.removeProperty('top');
			dialog.style.removeProperty('transform');
		}
	});
	observer.observe(dialog, { attributes: true, attributeFilter: ['open'] });

	function onMouseDown(e: MouseEvent) {
		// Don't initiate drag when clicking interactive children
		if ((e.target as HTMLElement).closest('button, input, a, textarea, select')) return;
		e.preventDefault();

		const rect = dialog.getBoundingClientRect();
		startX = e.clientX;
		startY = e.clientY;
		origLeft = rect.left;
		origTop = rect.top;

		document.addEventListener('mousemove', onMouseMove);
		document.addEventListener('mouseup', onMouseUp);
		headerEl.style.cursor = 'grabbing';
	}

	function onMouseMove(e: MouseEvent) {
		dialog.style.left = `${origLeft + (e.clientX - startX)}px`;
		dialog.style.top = `${origTop + (e.clientY - startY)}px`;
		dialog.style.transform = 'none';
	}

	function onMouseUp() {
		document.removeEventListener('mousemove', onMouseMove);
		document.removeEventListener('mouseup', onMouseUp);
		headerEl.style.cursor = '';
	}

	headerEl.addEventListener('mousedown', onMouseDown);
	headerEl.style.cursor = 'grab';

	return {
		destroy() {
			observer.disconnect();
			headerEl.removeEventListener('mousedown', onMouseDown);
			document.removeEventListener('mousemove', onMouseMove);
			document.removeEventListener('mouseup', onMouseUp);
		},
	};
}
