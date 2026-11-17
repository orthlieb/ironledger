import { describe, it, expect, vi, afterEach } from 'vitest';
import {
	dragHasFiles,
	dragHasImage,
	firstImageFile,
	dropImage,
	guardStrayFileDrops,
} from '../../src/lib/actions/dropImage.js';

const png = new File([new Uint8Array([1])], 'a.png', { type: 'image/png' });
const txt = new File(['hi'], 'a.txt', { type: 'text/plain' });

/** A DataTransfer as a drag from the desktop presents it. */
function transfer(files: File[], types = ['Files']) {
	return {
		types,
		items: files.map((f) => ({ kind: 'file', type: f.type })),
		files,
		dropEffect: 'none',
	};
}

/** A drag event carrying `dt`, as the browser dispatches it. */
function drag(type: string, dt: ReturnType<typeof transfer> | null) {
	const e = new Event(type, { bubbles: true, cancelable: true });
	Object.defineProperty(e, 'dataTransfer', { value: dt });
	return e as DragEvent;
}

describe('drag checks', () => {
	it('dragHasFiles: only drags that carry files', () => {
		expect(dragHasFiles(transfer([png]))).toBe(true);
		expect(dragHasFiles({ types: ['text/plain'] })).toBe(false);
		expect(dragHasFiles(null)).toBe(false);
	});

	it('dragHasImage: an image file, or a file whose type the browser hides', () => {
		expect(dragHasImage(transfer([png]))).toBe(true);
		expect(dragHasImage(transfer([txt, png]))).toBe(true);
		expect(dragHasImage(transfer([txt]))).toBe(false);
		expect(dragHasImage({ types: ['Files'], items: [{ kind: 'file', type: '' }] })).toBe(true);
		expect(dragHasImage({ types: ['Files'] })).toBe(true);
		expect(dragHasImage({ types: ['text/uri-list'], items: [] })).toBe(false);
	});

	it('firstImageFile: the first image among the files', () => {
		expect(firstImageFile(transfer([txt, png]))).toBe(png);
		expect(firstImageFile(transfer([txt]))).toBeNull();
		expect(firstImageFile(null)).toBeNull();
	});
});

describe('use:dropImage', () => {
	function setup(disabled = false) {
		const node = document.createElement('div');
		const child = document.createElement('span');
		node.append(child);
		document.body.append(node);
		const ondrop = vi.fn();
		const action = dropImage(node, { ondrop, disabled });
		return { node, child, ondrop, action };
	}

	afterEach(() => document.body.replaceChildren());

	it('highlights while an image is over it, across its children', () => {
		const { node, child } = setup();
		const enter = drag('dragenter', transfer([png]));
		node.dispatchEvent(enter);
		expect(enter.defaultPrevented).toBe(true);
		expect(node.hasAttribute('data-drop-over')).toBe(true);

		// Moving onto a child: enter on the child, then leave from the node.
		child.dispatchEvent(drag('dragenter', transfer([png])));
		node.dispatchEvent(drag('dragleave', transfer([png])));
		expect(node.hasAttribute('data-drop-over')).toBe(true);

		child.dispatchEvent(drag('dragleave', transfer([png])));
		expect(node.hasAttribute('data-drop-over')).toBe(false);
	});

	it('accepts the drag (so the browser will drop) and shows a copy cursor', () => {
		const { node } = setup();
		const dt = transfer([png]);
		const over = drag('dragover', dt);
		node.dispatchEvent(over);
		expect(over.defaultPrevented).toBe(true);
		expect(dt.dropEffect).toBe('copy');
	});

	it('hands the dropped image to ondrop and clears the highlight', () => {
		const { node, ondrop } = setup();
		node.dispatchEvent(drag('dragenter', transfer([png])));
		const drop = drag('drop', transfer([txt, png]));
		node.dispatchEvent(drop);
		expect(ondrop).toHaveBeenCalledWith(png);
		expect(drop.defaultPrevented).toBe(true);
		expect(node.hasAttribute('data-drop-over')).toBe(false);
	});

	it('leaves other drags alone: text, links, non-image files', () => {
		const { node, ondrop } = setup();
		const link = drag('dragenter', {
			types: ['text/uri-list'],
			items: [],
			files: [],
			dropEffect: 'none',
		});
		node.dispatchEvent(link);
		expect(link.defaultPrevented).toBe(false);
		const doc = drag('dragover', transfer([txt]));
		node.dispatchEvent(doc);
		expect(doc.defaultPrevented).toBe(false);
		expect(node.hasAttribute('data-drop-over')).toBe(false);

		const drop = drag('drop', transfer([txt]));
		node.dispatchEvent(drop);
		expect(ondrop).not.toHaveBeenCalled();
		expect(drop.defaultPrevented).toBe(false);
	});

	it('does nothing while disabled, and follows updates', () => {
		const { node, ondrop, action } = setup(true);
		node.dispatchEvent(drag('dragenter', transfer([png])));
		node.dispatchEvent(drag('drop', transfer([png])));
		expect(node.hasAttribute('data-drop-over')).toBe(false);
		expect(ondrop).not.toHaveBeenCalled();

		action?.update?.({ ondrop, disabled: false });
		node.dispatchEvent(drag('drop', transfer([png])));
		expect(ondrop).toHaveBeenCalledOnce();
	});

	it('stops listening when destroyed', () => {
		const { node, ondrop, action } = setup();
		action?.destroy?.();
		node.dispatchEvent(drag('drop', transfer([png])));
		expect(ondrop).not.toHaveBeenCalled();
	});
});

describe('guardStrayFileDrops', () => {
	let unguard: (() => void) | undefined;
	afterEach(() => {
		unguard?.();
		document.body.replaceChildren();
	});

	it('turns a file drop nothing took into a no-op, with the "no drop" cursor', () => {
		unguard = guardStrayFileDrops();
		const dt = transfer([png]);
		const over = drag('dragover', dt);
		document.body.dispatchEvent(over);
		expect(over.defaultPrevented).toBe(true);
		expect(dt.dropEffect).toBe('none');

		const drop = drag('drop', transfer([png]));
		document.body.dispatchEvent(drop);
		expect(drop.defaultPrevented).toBe(true);
	});

	it('leaves alone a drop a target took, a file input, and drags without files', () => {
		unguard = guardStrayFileDrops();
		const target = document.createElement('div');
		target.addEventListener('dragover', (e) => {
			e.preventDefault();
			(e as DragEvent).dataTransfer!.dropEffect = 'copy';
		});
		const input = document.createElement('input');
		input.type = 'file';
		document.body.append(target, input);

		const dt = transfer([png]);
		target.dispatchEvent(drag('dragover', dt));
		expect(dt.dropEffect).toBe('copy');

		const onInput = drag('drop', transfer([png]));
		input.dispatchEvent(onInput);
		expect(onInput.defaultPrevented).toBe(false);

		const text = drag('drop', { types: ['text/plain'], items: [], files: [], dropEffect: 'none' });
		document.body.dispatchEvent(text);
		expect(text.defaultPrevented).toBe(false);
	});
});
