import { describe, it, expect, vi } from 'vitest';
import { touchSafeTrigger } from '../../src/lib/touchSafeTrigger.js';

const click = (detail: number, timeStamp: number, pointerType?: string) => ({
	detail,
	timeStamp,
	pointerType,
	preventDefault: vi.fn(),
});

describe('touchSafeTrigger', () => {
	it('drops a click marked as a touch', () => {
		const t = touchSafeTrigger();
		const c = click(0, 100, 'touch');
		t.onclick(c);
		expect(c.preventDefault).toHaveBeenCalled();
	});

	it('drops an uncounted click that comes soon after a touch lets go', () => {
		const t = touchSafeTrigger();
		t.onpointerup({ pointerType: 'touch', timeStamp: 1000 });
		const c = click(0, 1200);
		t.onclick(c);
		expect(c.preventDefault).toHaveBeenCalled();
	});

	it('leaves a screen reader’s click alone (no touch before it, or long ago)', () => {
		const t = touchSafeTrigger();
		const first = click(0, 500, '');
		t.onclick(first);
		expect(first.preventDefault).not.toHaveBeenCalled();
		t.onpointerup({ pointerType: 'touch', timeStamp: 1000 });
		const later = click(0, 3000, '');
		t.onclick(later);
		expect(later.preventDefault).not.toHaveBeenCalled();
	});

	it('leaves a mouse click alone, even after a touch', () => {
		const t = touchSafeTrigger();
		t.onpointerup({ pointerType: 'mouse', timeStamp: 1000 });
		const c = click(1, 1100, 'mouse');
		t.onclick(c);
		expect(c.preventDefault).not.toHaveBeenCalled();
		t.onpointerup({ pointerType: 'touch', timeStamp: 2000 });
		const m = click(1, 2100, 'mouse');
		t.onclick(m);
		expect(m.preventDefault).not.toHaveBeenCalled();
	});

	it('remembers each trigger’s touch apart', () => {
		const a = touchSafeTrigger();
		const b = touchSafeTrigger();
		a.onpointerup({ pointerType: 'touch', timeStamp: 1000 });
		const c = click(0, 1100);
		b.onclick(c);
		expect(c.preventDefault).not.toHaveBeenCalled();
	});
});
