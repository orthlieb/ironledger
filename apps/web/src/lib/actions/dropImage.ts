/**
 * use:dropImage — a control takes an image file dragged in from the
 * desktop, as well as through its file picker.
 *
 *   <div use:dropImage={{ ondrop: upload }}>…</div>
 *
 * While a drag carrying an image is over the element it has the
 * `data-drop-over` attribute; style the highlight off that. Dropping hands
 * the first image file to `ondrop`, the same function the file picker's
 * change handler calls, so cropping, size limits and errors stay in one
 * place. A drag of anything else (text, a link, a non-image file, the
 * app's own pointer drags) is left alone: no highlight, and the browser
 * shows its "no drop" cursor.
 *
 * guardStrayFileDrops() (mounted once, in the root layout) stops a file
 * dropped anywhere else from replacing the app with the file itself, which
 * is what a browser does with a drop nothing handled.
 */
import type { Action } from 'svelte/action';

export interface DropImageOptions {
	/** Called with the dropped image file. */
	ondrop: (file: File) => void;
	/** Ignore drops while true (e.g. mid-upload). */
	disabled?: boolean;
}

type DragData = Pick<DataTransfer, 'types'> & {
	items?: ArrayLike<Pick<DataTransferItem, 'kind' | 'type'>> | null;
	files?: ArrayLike<File> | null;
};

const isImageType = (type: string) => type.startsWith('image/');

/** Whether a drag carries files at all (from the desktop, not the page). */
export function dragHasFiles(dt: DragData | null | undefined): boolean {
	return !!dt && Array.from(dt.types ?? []).includes('Files');
}

/**
 * Whether a drag in progress may carry an image. During a drag, browsers
 * show each item's kind and MIME type but not the file; a browser that
 * leaves the type blank gets the benefit of the doubt, and the drop itself
 * then checks the file.
 */
export function dragHasImage(dt: DragData | null | undefined): boolean {
	if (!dragHasFiles(dt)) return false;
	const files = Array.from(dt?.items ?? []).filter((i) => i.kind === 'file');
	if (files.length === 0) return true;
	return files.some((i) => i.type === '' || isImageType(i.type));
}

/** The first image among the dropped files, or null. */
export function firstImageFile(dt: DragData | null | undefined): File | null {
	return Array.from(dt?.files ?? []).find((f) => isImageType(f.type)) ?? null;
}

export const dropImage: Action<HTMLElement, DropImageOptions> = (node, initial) => {
	let opts = initial;
	// dragenter / dragleave also fire as the pointer crosses child elements;
	// counting them tells a real leave from moving onto a child.
	let depth = 0;

	const highlight = (on: boolean) => {
		if (on) node.setAttribute('data-drop-over', '');
		else node.removeAttribute('data-drop-over');
	};
	const accepts = (e: DragEvent) => !opts.disabled && dragHasImage(e.dataTransfer);

	function onEnter(e: DragEvent) {
		if (!accepts(e)) return;
		e.preventDefault();
		depth++;
		highlight(true);
	}
	function onOver(e: DragEvent) {
		if (!accepts(e)) return;
		// Without this the browser won't fire `drop` here.
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
	}
	function onLeave() {
		if (depth === 0) return;
		depth--;
		if (depth === 0) highlight(false);
	}
	function onDrop(e: DragEvent) {
		depth = 0;
		highlight(false);
		if (opts.disabled) return;
		const file = firstImageFile(e.dataTransfer);
		if (!file) return;
		e.preventDefault();
		e.stopPropagation();
		opts.ondrop(file);
	}

	node.addEventListener('dragenter', onEnter);
	node.addEventListener('dragover', onOver);
	node.addEventListener('dragleave', onLeave);
	node.addEventListener('drop', onDrop);
	return {
		update(next: DropImageOptions) {
			opts = next;
		},
		destroy() {
			node.removeEventListener('dragenter', onEnter);
			node.removeEventListener('dragover', onOver);
			node.removeEventListener('dragleave', onLeave);
			node.removeEventListener('drop', onDrop);
		},
	};
};

/**
 * Whether this device has a mouse or trackpad (so a file can be dragged in),
 * for hints like "or drop one here". False on the server and on touch screens.
 */
export function canDropFiles(): boolean {
	return (
		typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches
	);
}

/**
 * A file dropped where nothing takes it would otherwise be opened by the
 * browser in place of the app. This turns such drops into no-ops, with the
 * "no drop" cursor. Drop targets that handled the event (preventDefault)
 * and real file inputs are left alone. Returns the cleanup.
 */
export function guardStrayFileDrops(win: Window = window): () => void {
	const unhandled = (e: DragEvent) =>
		!e.defaultPrevented &&
		dragHasFiles(e.dataTransfer) &&
		!(e.target instanceof HTMLInputElement && e.target.type === 'file');
	const onOver = (e: DragEvent) => {
		if (!unhandled(e)) return;
		e.preventDefault();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'none';
	};
	const onDrop = (e: DragEvent) => {
		if (unhandled(e)) e.preventDefault();
	};
	win.addEventListener('dragover', onOver);
	win.addEventListener('drop', onDrop);
	return () => {
		win.removeEventListener('dragover', onOver);
		win.removeEventListener('drop', onDrop);
	};
}
