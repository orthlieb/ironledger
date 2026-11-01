/**
 * pageExit.test.ts — pending saves are flushed when the page is hidden or
 * unloading, and the requests that flush starts are sent keepalive.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDebouncedSave } from '../../src/lib/debouncedSave';
import { makeEntitySync } from '../../src/lib/entitySync';
import { isPageExiting, keepaliveInit, onPageExit, runPageExit } from '../../src/lib/pageExit';

function setVisibility(state: 'visible' | 'hidden') {
	Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
	document.dispatchEvent(new Event('visibilitychange'));
}

describe('pageExit', () => {
	it('runs handlers on pagehide and on hide, with keepalive on', () => {
		const seen: boolean[] = [];
		const off = onPageExit(() => seen.push(isPageExiting()));
		window.dispatchEvent(new Event('pagehide'));
		setVisibility('hidden');
		setVisibility('visible'); // coming back runs nothing
		off();
		window.dispatchEvent(new Event('pagehide'));
		expect(seen).toEqual([true, true]);
		expect(isPageExiting()).toBe(false);
	});

	it('keepaliveInit is a no-op outside an exit and keeps under the 64 KiB budget', () => {
		expect(keepaliveInit('{}')).toEqual({});
		const results: Array<{ keepalive?: true }> = [];
		const off = onPageExit(() => {
			results.push(keepaliveInit('x'.repeat(40 * 1024)));
			results.push(keepaliveInit('x'.repeat(40 * 1024))); // would exceed 60 KiB
			results.push(keepaliveInit('x'.repeat(10 * 1024)));
		});
		runPageExit();
		off();
		expect(results).toEqual([{ keepalive: true }, {}, { keepalive: true }]);
	});
});

describe('createDebouncedSave + page exit', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it('flushes a pending write on page exit, once', () => {
		const save = createDebouncedSave(1500);
		const write = vi.fn();
		save.schedule(write);
		runPageExit();
		expect(write).toHaveBeenCalledTimes(1);
		expect(save.isPending()).toBe(false);
		vi.advanceTimersByTime(2000);
		runPageExit();
		expect(write).toHaveBeenCalledTimes(1);
	});

	it('does nothing on page exit once the timer has already saved', () => {
		const save = createDebouncedSave(1500);
		const write = vi.fn();
		save.schedule(write);
		vi.advanceTimersByTime(1500);
		expect(write).toHaveBeenCalledTimes(1);
		runPageExit();
		expect(write).toHaveBeenCalledTimes(1);
	});
});

describe('makeEntitySync on page exit', () => {
	type Row = { id: string; v: string };
	let calls: Array<{ method: string; url: string; body?: string; keepalive?: boolean }>;
	let resolvers: Array<() => void>;

	beforeEach(() => {
		calls = [];
		resolvers = [];
		vi.stubGlobal(
			'fetch',
			vi.fn((url: string, init: RequestInit) => {
				calls.push({
					method: init.method ?? 'GET',
					url,
					body: init.body as string | undefined,
					keepalive: init.keepalive,
				});
				return new Promise<Response>((resolve) =>
					resolvers.push(() => resolve(new Response(null, { status: 200 }))),
				);
			}),
		);
	});
	afterEach(() => vi.unstubAllGlobals());

	it('sends every unsynced row at once, keepalive', () => {
		let rows: Row[] = [
			{ id: 'a', v: '1' },
			{ id: 'b', v: '1' },
			{ id: 'gone', v: '1' },
		];
		const sync = makeEntitySync<Row>('things', () => rows, 'test');
		sync.reset(rows);
		rows = [
			{ id: 'a', v: '2' },
			{ id: 'b', v: '2' },
			{ id: 'new', v: '1' },
		];
		runPageExit();
		expect(calls.map((c) => `${c.method} ${c.url}`).sort()).toEqual([
			'DELETE /api/session/things/gone',
			'PATCH /api/session/things/a',
			'PATCH /api/session/things/b',
			'POST /api/session/things',
		]);
		expect(calls.every((c) => c.keepalive)).toBe(true);
	});

	it('persist() during an exit takes the all-at-once path, with no duplicates', async () => {
		let rows: Row[] = [{ id: 'a', v: '1' }];
		const sync = makeEntitySync<Row>('dups', () => rows, 'test');
		sync.reset(rows);
		rows = [{ id: 'a', v: '2' }];
		// The area's debounced save calls persist() from its exit flush, and the
		// store's own exit flush runs too: one PATCH, not two.
		const off = onPageExit(() => void sync.persist());
		runPageExit();
		off();
		expect(calls.map((c) => c.method)).toEqual(['PATCH']);
		expect(calls[0]!.keepalive).toBe(true);
	});

	it('skips a row whose create is still in flight', async () => {
		let rows: Row[] = [];
		const sync = makeEntitySync<Row>('creating', () => rows, 'test');
		sync.reset(rows);
		rows = [{ id: 'n', v: '1' }];
		const pending = sync.persist(); // POST on the wire, not answered yet
		expect(calls.map((c) => c.method)).toEqual(['POST']);
		rows = [{ id: 'n', v: '2' }];
		runPageExit();
		// A PATCH now could beat the POST to the server; nothing more is sent.
		expect(calls.map((c) => c.method)).toEqual(['POST']);
		for (const r of resolvers) r();
		await pending;
	});
});
