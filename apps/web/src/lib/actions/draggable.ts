/**
 * Svelte action that makes a dialog draggable by its header.
 * Apply to the dialog's header element: `use:draggable`
 *
 * The action finds the closest parent <dialog> and enables drag-to-move.
 * Position resets to CSS defaults each time the dialog opens.
 */
export function draggable(headerEl: HTMLElement) {
	const dialog = headerEl.closest('dialog') as HTMLDialogElement | null;
	if (!dialog) return;

	let startX = 0;
	let startY = 0;
	let origLeft = 0;
	let origTop = 0;

	// Reset inline position overrides when dialog opens so CSS defaults apply
	const observer = new MutationObserver(() => {
		if (dialog.open) {
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
