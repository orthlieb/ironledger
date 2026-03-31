/**
 * Svelte `use:tooltip` action — Popover API tooltip, above dialogs, no clipping.
 *
 * ## Why not CSS [data-tooltip]::after?
 * CSS pseudo-element tooltips are clipped by `overflow: hidden/auto` ancestors
 * (e.g. scroll panes inside dialogs).
 *
 * ## Why not append to <body> with position:fixed?
 * Browser `<dialog>` elements render in the **top layer**. Any ancestor with a
 * CSS `transform`, `filter`, `perspective`, or `will-change: transform` creates
 * a new containing block for `position: fixed` descendants, so the coordinates
 * become relative to that element rather than the viewport — causing misalignment.
 *
 * ## Solution — Popover API
 * Append the tooltip to `<body>` but call `showPopover()` on it. This promotes
 * the element into the browser's top layer directly, painting it above all
 * dialogs and overlays. `position: fixed` then always resolves against the
 * viewport (the initial containing block), so `getBoundingClientRect()` coords
 * are correct without any DOM-walking or coordinate translation.
 *
 * Supported in Chrome 114+, Safari 17+, Firefox 125+. Falls back gracefully
 * (tooltip simply won't show) in older browsers.
 *
 * Also handles touch (touchstart shows, touchend/touchcancel hide after a
 * short delay) so it works on mobile where CSS :hover never fires.
 *
 * Usage:
 *   <div use:tooltip="text">…</div>
 *   <div use:tooltip={{ text, placement: 'below' }}>…</div>
 *
 * Options:
 *   text       — tooltip string (plain text, no HTML)
 *   placement  — 'above' (default) | 'below'
 */

export interface TooltipOptions {
	text:       string;
	placement?: 'above' | 'below';
}

type TooltipParam = string | TooltipOptions;

function normalise(param: TooltipParam): TooltipOptions {
	return typeof param === 'string' ? { text: param } : param;
}

export function tooltip(node: HTMLElement, param: TooltipParam) {
	let opts  = normalise(param);
	let tipEl: HTMLDivElement | null = null;
	let hideTimer: ReturnType<typeof setTimeout> | null = null;

	function show() {
		if (!opts.text) return;
		if (tipEl) return;  // already visible

		tipEl = document.createElement('div');
		tipEl.setAttribute('popover', 'manual');
		tipEl.className   = 'js-tooltip';
		tipEl.textContent = opts.text;
		document.body.appendChild(tipEl);

		// showPopover() promotes the element into the browser top layer.
		// Guard for browsers that don't support the Popover API yet.
		if (typeof tipEl.showPopover === 'function') {
			tipEl.showPopover();
		}

		// Use rAF so the browser lays out the popover element before we
		// measure its dimensions for positioning (fixes first-hover misfire).
		requestAnimationFrame(() => { if (tipEl) position(); });
	}

	function position() {
		if (!tipEl) return;
		const rect      = node.getBoundingClientRect();
		const placement = opts.placement ?? 'above';
		const gap       = 8;

		// Measure tooltip dimensions (render off-screen first).
		tipEl.style.visibility = 'hidden';
		tipEl.style.left = '0';
		tipEl.style.top  = '0';

		const tw = tipEl.offsetWidth;
		const th = tipEl.offsetHeight;

		tipEl.style.visibility = '';

		// Centre horizontally on the trigger, clamped to viewport edges.
		let left = rect.left + rect.width / 2 - tw / 2;
		left = Math.max(8, Math.min(left, window.innerWidth - tw - 8));

		// Preferred placement with auto-flip if it overflows the viewport.
		let top: number;
		if (placement === 'below') {
			top = rect.bottom + gap;
			if (top + th > window.innerHeight - 8) top = rect.top - th - gap;
		} else {
			top = rect.top - th - gap;
			if (top < 8) top = rect.bottom + gap;
		}

		tipEl.style.left = `${left}px`;
		tipEl.style.top  = `${top}px`;
	}

	function hide() {
		if (tipEl) {
			if (typeof tipEl.hidePopover === 'function') {
				tipEl.hidePopover();
			}
			tipEl.remove();
			tipEl = null;
		}
	}

	// Touch: show on touchstart, auto-hide 1.2 s after release.
	function onTouchStart(e: TouchEvent) {
		e.preventDefault();  // suppress the synthetic mouse events that follow
		if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
		show();
	}
	function onTouchEnd() {
		hideTimer = setTimeout(hide, 1200);
	}

	node.addEventListener('mouseenter',  show);
	node.addEventListener('mouseleave',  hide);
	node.addEventListener('focus',       show);
	node.addEventListener('blur',        hide);
	node.addEventListener('touchstart',  onTouchStart, { passive: false });
	node.addEventListener('touchend',    onTouchEnd);
	node.addEventListener('touchcancel', hide);

	return {
		update(newParam: TooltipParam) {
			opts = normalise(newParam);
			if (tipEl) {
				tipEl.textContent = opts.text;
				position();
			}
		},
		destroy() {
			hide();
			node.removeEventListener('mouseenter',  show);
			node.removeEventListener('mouseleave',  hide);
			node.removeEventListener('focus',       show);
			node.removeEventListener('blur',        hide);
			node.removeEventListener('touchstart',  onTouchStart);
			node.removeEventListener('touchend',    onTouchEnd);
			node.removeEventListener('touchcancel', hide);
		},
	};
}
