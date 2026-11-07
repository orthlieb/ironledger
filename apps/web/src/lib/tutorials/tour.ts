/**
 * Point-and-click tutorials, on driver.js (MIT — https://driverjs.com).
 *
 * A tutorial is a list of `TourStep`s, each pointing at an element by its
 * `data-tour` id. Driver dims the page, cuts out the highlighted element
 * (which stays clickable) and shows a popover beside it. Three kinds of
 * step:
 *
 *   • do-this (`continueWhen`) — no Next button; the tour moves on once
 *     what the user's action opens is on screen (the list's "+ New
 *     character…" row, the dialog). Keyed to the result rather than the
 *     click, so it can't get out of step: a list closed and reopened, or
 *     already open, still lands right.
 *   • click-along (`clickToContinue`) — no Next button; the tour moves on
 *     when the user clicks the highlighted control, waiting (`wait`) for
 *     the next step's target. For clicks whose result is already on
 *     screen (Create, then the character it made).
 *   • explain (the default) — Next moves on. `beforeNext` can do the step
 *     for the user first (roll a name they skipped), so the tour never
 *     strands them at a disabled button further on.
 *
 * Driver and its CSS are loaded on first use, so nothing ships in the main
 * bundle for users who never open a tutorial. tour.css restyles driver's
 * popover in the house style and lifts bits-ui menus above its overlay.
 */
import type { Driver, DriveStep, Popover } from 'driver.js';

export interface TourStep {
	/** `data-tour` id of the element to highlight; none centres the popover. */
	target?: string;
	/** A CSS selector instead, for what the app writes as HTML and can't tag
	 *  (a log entry's link): the first match is highlighted. */
	selector?: string;
	/** Or a function that finds it, for an element known only once the step
	 *  is reached (the roll just made, the move that can be made now). */
	find?: () => Element | null;
	title: string;
	body: string;
	side?: 'top' | 'right' | 'bottom' | 'left';
	align?: 'start' | 'center' | 'end';
	/** Move on once this `data-tour` target is on screen (no Next button). */
	continueWhen?: string;
	/** Move on when the user clicks the highlighted element (no Next button) —
	 *  or, given a selector, a control in it that matches (Apply, not the
	 *  steppers beside it). */
	clickToContinue?: boolean | string;
	/** Wait up to this many ms for the target to appear (a dialog opening). */
	wait?: number;
	/** Leave the step out unless this returns true (asked when the tour starts). */
	when?: () => boolean;
	/** Runs when Next is pressed, before moving on (`el` is the target). */
	beforeNext?: (el: Element | undefined) => void;
	/** If the target vanishes while showing (its list or dialog closed), go
	 *  back to the nearest earlier step still on screen. */
	backIfGone?: boolean;
	/** Show Back — only where the step before is still on screen. */
	back?: boolean;
	/** Skip the step, rather than wait or point at nothing, when its target
	 *  isn't there (a section only some foes have). */
	optional?: boolean;
	/** A class on `<body>` while the step shows, for tour.css to make room
	 *  for its target (`il-tour-log`: a taller log on a phone). */
	pageClass?: string;
}

export interface Tutorial {
	id: string;
	/** Menu label. */
	title: string;
	/** The route it runs on; the runner navigates there first. */
	route: string;
	/** `data-tour` id that's on the page once the route has rendered. */
	ready: string;
	steps: () => TourStep[];
}

/** The `[data-tour]` selector for an id. */
export const tourSel = (id: string) => `[data-tour="${id}"]`;

/** The element with this `data-tour` id, if it's rendered and visible. */
export function tourTarget(id: string): HTMLElement | null {
	const el = document.querySelector<HTMLElement>(tourSel(id));
	return el && el.getClientRects().length > 0 ? el : null;
}

/** Resolves once an element with this `data-tour` id exists (or after `ms`). */
export function whenRendered(id: string, ms = 5000): Promise<boolean> {
	return new Promise((resolve) => {
		const start = performance.now();
		const tick = () => {
			if (document.querySelector(tourSel(id))) resolve(true);
			else if (performance.now() - start > ms) resolve(false);
			else requestAnimationFrame(tick);
		};
		tick();
	});
}

let active: Driver | null = null;

/** Is a tutorial running? */
export function tourRunning(): boolean {
	return !!active?.isActive();
}

/** Run a tour. Replaces any tour already running. */
export async function runTour(steps: TourStep[]): Promise<void> {
	const [{ driver }] = await Promise.all([
		import('driver.js'),
		import('driver.js/dist/driver.css'),
		import('./tour.css'),
	]);
	active?.destroy();

	const chosen = steps.filter((s) => s.when?.() ?? true);
	/** Stops the current step's watches (continueWhen, backIfGone). */
	let unwatch: (() => void)[] = [];
	/** Has driver finished moving to the current step? Until it has, a
	 *  refresh measures the step before (driver only takes the new one's
	 *  element as the move ends) and puts the popover by that. */
	let settled = false;
	const stopWatch = () => {
		unwatch.forEach((stop) => stop());
		unwatch = [];
	};

	const toDriveStep = (s: TourStep, i: number): DriveStep => {
		const popover: Popover = {
			title: s.title,
			description: s.body,
			side: s.side,
			align: s.align,
			showButtons: [
				...(s.clickToContinue || s.continueWhen ? [] : (['next'] as const)),
				...(s.back ? (['previous'] as const) : []),
				'close',
			],
		};
		// Only set when there's a hook: driver spreads the popover over its
		// own defaults, so an `onNextClick: undefined` would wipe out Next.
		if (s.beforeNext) {
			const before = s.beforeNext;
			popover.onNextClick = (el, _step, { driver: d }) => {
				before(el);
				// A tick later, once the page shows what `before` did (a
				// rolled name, an editor closed and the portrait back).
				window.setTimeout(() => d.moveNext(), 0);
			};
		}
		return {
			// driver takes a function too, and calls it as it reaches the step.
			element: s.target
				? tourSel(s.target)
				: ((s.find as (() => Element) | undefined) ?? s.selector),
			waitForElement: s.wait ?? 0,
			skipMissingElement: s.optional,
			// From the start of the step's highlight, not its end: driver
			// animates the move to a step and its own click-to-advance
			// (`advanceOnClick`) ignores clicks until that's done, so a quick
			// click on Create made the character but left the tour behind.
			onHighlightStarted: (el) => {
				stopWatch();
				settled = false;
				// Before driver scrolls to the target, so it scrolls by the room made.
				if (s.pageClass) {
					const c = s.pageClass;
					document.body.classList.add(c);
					unwatch.push(() => document.body.classList.remove(c));
				}
				if (el) unwatch.push(follow(el));
				if (s.clickToContinue && el) {
					const only = typeof s.clickToContinue === 'string' ? s.clickToContinue : undefined;
					unwatch.push(onClickOf(el, i, only));
				}
				if (s.continueWhen) unwatch.push(watchFor(s.continueWhen, i));
				if (s.backIfGone && el) unwatch.push(watchGone(el, i));
			},
			// Measure again now the move's done, for a target that changed size
			// on the way (a list still loading), whose resize was held back.
			onHighlighted: () => {
				settled = true;
				active?.refresh();
			},
			onDeselected: stopWatch,
			popover,
		};
	};

	/** Keep the highlight on `el` as it moves or changes size — a field
	 *  switching to its editor, a list scrolled to it, a log entry pushed
	 *  down by a newer one — where driver re-measures only when the window
	 *  scrolls or resizes. Checked every frame, once the step has settled. */
	function follow(el: Element): () => void {
		let last = '';
		let frame = requestAnimationFrame(function check() {
			const r = el.getBoundingClientRect();
			const now = `${r.x} ${r.y} ${r.width} ${r.height}`;
			if (now !== last) {
				if (settled && last) active?.refresh();
				last = now;
			}
			frame = requestAnimationFrame(check);
		});
		return () => cancelAnimationFrame(frame);
	}

	/** Move on from step `index` when `el` is clicked — or tapped, where the
	 *  page acts on the tap itself and cancels the click that would follow
	 *  (the log's links do, to skip the browser's click delay). With `only`,
	 *  just a click on what matches it inside `el`. */
	function onClickOf(el: Element, index: number, only?: string): () => void {
		const advance = () => {
			if (active?.getActiveIndex() === index) active.moveNext();
		};
		const counts = (e: Event) => !only || (e.target instanceof Element && !!e.target.closest(only));
		// After the click's own handlers have run (it may close a dialog).
		const click = (e: Event) => {
			if (counts(e)) window.setTimeout(advance, 0);
		};
		// Only a cancelled tap: otherwise its click is still to come, and
		// moving on first would cover the control it lands on.
		const tap = (e: Event) =>
			window.setTimeout(() => {
				if (e.defaultPrevented && counts(e)) advance();
			}, 0);
		el.addEventListener('click', click, { capture: true });
		el.addEventListener('touchend', tap, { capture: true, passive: true });
		return () => {
			el.removeEventListener('click', click, { capture: true });
			el.removeEventListener('touchend', tap, { capture: true });
		};
	}

	/** Move on from step `index` once the `id` target is on screen. */
	function watchFor(id: string, index: number): () => void {
		const timer = window.setInterval(() => {
			const d = active;
			if (!d || d.getActiveIndex() !== index || !tourTarget(id)) return;
			window.clearInterval(timer);
			d.moveNext();
		}, 150);
		return () => window.clearInterval(timer);
	}

	/** Is step `s`'s target there? (One with none, its popover centred, is.) */
	function onScreen(s: TourStep | undefined): boolean {
		if (s?.target) return !!tourTarget(s.target);
		if (s?.find) return !!s.find();
		if (s?.selector) return !!document.querySelector(s.selector);
		return true;
	}

	/**
	 * Go back if the target leaves the screen while the tour is still on it
	 * — a list row the step points at, filtered out by typing in the list's
	 * search box; the list closed; a dialog cancelled — to the nearest step
	 * before it whose target is still there (for a cancelled dialog, the
	 * control that opens it). Only after it's stayed gone for two checks, so
	 * a moment's re-render doesn't count, and not while the tour is already
	 * moving on: waiting for the next step's target, which the click that
	 * closed this one (Add, Create) opens.
	 */
	function watchGone(el: Element, index: number): () => void {
		let misses = 0;
		const timer = window.setInterval(() => {
			const d = active;
			const gone = !el.isConnected || el.getClientRects().length === 0;
			if (!d || !gone || d.getActiveIndex() !== index) return (misses = 0);
			if (d.getState('__pendingWaitCancel')) return (misses = 0);
			if (++misses < 2) return;
			window.clearInterval(timer);
			let to = index - 1;
			while (to > 0 && !onScreen(chosen[to])) to--;
			d.moveTo(Math.max(0, to));
		}, 250);
		return () => window.clearInterval(timer);
	}

	const d = driver({
		steps: chosen.map(toDriveStep),
		showProgress: chosen.length > 1,
		progressText: '{{current}} of {{total}}',
		nextBtnText: 'Next',
		prevBtnText: 'Back',
		doneBtnText: 'Done',
		// A stray tap on the dimmed page shouldn't end the tutorial: it ends
		// with ✕, Escape or Done.
		overlayClickBehavior: 'none',
		overlayOpacity: 0.55,
		stagePadding: 6,
		stageRadius: 6,
		popoverClass: 'il-tour',
		smoothScroll: true,
		onDestroyed: () => {
			stopWatch();
			if (active === d) active = null;
		},
	});
	active = d;
	d.drive();
}
