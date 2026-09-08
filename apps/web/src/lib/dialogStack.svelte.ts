/**
 * dialogStack — single source of truth for how modal dialogs stack.
 *
 * bits-ui `Dialog` / `AlertDialog` are individually modal (focus trap +
 * aria-modal), but nothing arbitrates z-index BETWEEN two open dialogs.
 * When two dialogs at the same CSS tier stack (e.g. `MapOwnerConflictDialog`
 * opening over `ImportDialog` during an Everything re-import), the top
 * dialog's Overlay sits BENEATH the underlying dialog's Content, so the
 * user can still click the underlying dialog's header ✕ or buttons — a
 * modality break.
 *
 * Every `Dialog.Root` / `AlertDialog.Root` in the app calls `pushDialog()`
 * on open and `popDialog()` on close (via `$effect`). `pushDialog` returns
 * a monotonic depth (1, 2, 3, …); the caller uses it to compute inline
 * z-indexes for the Overlay and Content:
 *
 *     overlayZ = 80 + depth * 2   // overlay of dialog N sits above content of N-1
 *     contentZ = 81 + depth * 2   // content of dialog N sits above its overlay
 *
 * Once the stack drains to zero, the depth counter resets so numbers stay
 * small (a few hundred is comfortably below the 9999 tooltip tier — tooltips
 * always float above regardless).
 */

let stackSize = 0;
let nextDepth = 0;

/** Register a newly-opened dialog. Returns its assigned depth (>= 1). */
export function pushDialog(): number {
	stackSize++;
	return ++nextDepth;
}

/** Unregister a closed dialog. Resets the counter when the stack drains. */
export function popDialog(): void {
	stackSize = Math.max(0, stackSize - 1);
	if (stackSize === 0) nextDepth = 0;
}

/**
 * Convenience: compute the z-index for a Dialog.Overlay at the given depth.
 * Kept as an exported helper so the arithmetic lives in one place — a future
 * change to the tier base only needs to touch this file.
 */
export function overlayZ(depth: number): number {
	return 80 + depth * 2;
}

/** Convenience: compute the z-index for a Dialog.Content at the given depth. */
export function contentZ(depth: number): number {
	return 81 + depth * 2;
}
