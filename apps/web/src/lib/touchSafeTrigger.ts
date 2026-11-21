// =============================================================================
// Iron Ledger — a bits-ui DropdownMenu trigger that a tap opens and leaves open
//
// bits-ui's DropdownMenu.Trigger opens on a touch's pointerup, and also
// toggles on a click whose `detail` is 0 (meant for a screen reader's click,
// which sends no pointer events). Some browsers follow a tap with just such a
// click, so the menu shut the moment it opened: ☰ flashed and closed.
//
// Spread these handlers onto the trigger. bits-ui runs a trigger's own
// handlers before its own and skips its own once one has called
// preventDefault, so dropping a click here keeps the menu as the tap left it.
// A click is dropped when it comes from a touch: marked as one, or with no
// count soon after a touch let go of the trigger. A mouse click, a key, or a
// screen reader's click is left alone.
// =============================================================================

/** How long after a touch lets go its click can still arrive, in ms. */
const AFTER_TOUCH_MS = 800;

interface TriggerPointerUp {
	pointerType: string;
	timeStamp: number;
}
interface TriggerClick {
	detail: number;
	timeStamp: number;
	pointerType?: string;
	preventDefault(): void;
}

/** Handlers for one trigger (each trigger its own: they remember its last touch). */
export function touchSafeTrigger(): {
	onpointerup: (e: TriggerPointerUp) => void;
	onclick: (e: TriggerClick) => void;
} {
	let touchUpAt = Number.NEGATIVE_INFINITY;
	return {
		onpointerup(e) {
			if (e.pointerType === 'touch') touchUpAt = e.timeStamp;
		},
		onclick(e) {
			const fromTouch =
				e.pointerType === 'touch' ||
				(e.detail === 0 && !e.pointerType && e.timeStamp - touchUpAt < AFTER_TOUCH_MS);
			if (fromTouch) e.preventDefault();
		},
	};
}
