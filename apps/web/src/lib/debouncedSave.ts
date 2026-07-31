/**
 * Trailing-debounced save — the timer plumbing shared by the v2 area
 * components (Characters / Foes / Expeditions / Connections).
 *
 * Each area's auto-save `$effect` deep-reads the active entity's
 * `$state.snapshot(...)` (so it re-runs on any nested edit) and then calls
 * `schedule(flush)`. The `flush` closure is captured per call, so if the
 * active entity changes before the timer fires, the pending write still
 * targets the entity that was actually being edited.
 *
 * `flush()` commits any pending write immediately and is a no-op when nothing
 * is scheduled — call it from the effect's teardown (Svelte runs that before
 * every re-run and on unmount) and from switch handlers so an in-flight edit
 * is never dropped when the user moves to another entry.
 *
 * This intentionally has no reactive state of its own; it's plain closures so
 * it can live in a `.ts` module and be instantiated once per component.
 */
export interface DebouncedSave {
	/** (Re)start the trailing timer; `flush` is captured for this write. */
	schedule(flush: () => void): void;
	/** Commit the pending write now (no-op if nothing is scheduled). */
	flush(): void;
	/** Whether a write is currently scheduled but not yet committed. */
	isPending(): boolean;
}

export function createDebouncedSave(delay = 1500): DebouncedSave {
	let timer: ReturnType<typeof setTimeout> | null = null;
	let pending: (() => void) | null = null;

	function schedule(flush: () => void): void {
		pending = flush;
		if (timer) clearTimeout(timer);
		timer = setTimeout(() => {
			timer = null;
			const run = pending;
			pending = null;
			run?.();
		}, delay);
	}

	function flush(): void {
		if (!timer) return; // matches the `if (_saveTimer)` guard the areas used
		clearTimeout(timer);
		timer = null;
		const run = pending;
		pending = null;
		run?.();
	}

	return { schedule, flush, isPending: () => timer !== null };
}
