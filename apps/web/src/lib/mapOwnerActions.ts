// =============================================================================
// Iron Ledger — Map-owner actions shared by the v2 area components
//
// CommunitiesArea and ExpeditionsArea both let their active entity own a
// campaign map: open it, add a background image (iOS-safe file-input gesture),
// and jump to a marker back-reference. The logic was duplicated verbatim,
// differing only in how the owner's { kind, id, name } is read. This factory
// captures that as an injected `getOwner`, plus a getter for the area's
// MapDialog ref, so both areas share one implementation.
// =============================================================================

import { openMapForOwner, setBackground, type EntityMarkerRef, type MapOwnerKind } from '$lib/mapStore.svelte.js';
import { downscaleImage, MapImageError } from '$lib/mapImage.js';

export interface MapOwner {
	kind: MapOwnerKind;
	id: string;
	name: string;
}

type MapDialogRef =
	| { open(target?: { mapId?: string; markerId?: string; promptUpload?: boolean }): void }
	| null
	| undefined;

/** Short "(x, y)" for marker chip labels — integers stay integer, else 2 dp. */
export function fmtCoord(v: number): string {
	return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

/**
 * Build the owner-map actions for a v2 area.
 *
 * @param getOwner  returns the active entity's map-owner identity, or `null`
 *                  when there's no active owner (or it can't own a map).
 * @param getDialog returns the area's MapDialog ref.
 */
export function createMapOwnerActions(getOwner: () => MapOwner | null, getDialog: () => MapDialogRef) {
	/** Open the active owner's existing map. */
	async function openOwnedMap(): Promise<void> {
		const o = getOwner();
		if (!o) return;
		const mapId = await openMapForOwner(o.kind, o.id, o.name || 'Untitled');
		getDialog()?.open({ mapId: mapId ?? undefined });
	}

	/**
	 * "+ Map" variant — the trigger is a `<label>` wrapping a hidden file
	 * input, so tapping it opens the OS file picker as part of the tap's
	 * native user gesture (essential on iOS Safari, which refuses
	 * `input.click()` calls issued from JS after any `await`). Once the user
	 * picks a file we get-or-create the map, upload the downscaled image, and
	 * open the dialog on the result.
	 */
	async function handleAddMapWithFile(e: Event): Promise<void> {
		const o = getOwner();
		if (!o) return;
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		try {
			const mapId = await openMapForOwner(o.kind, o.id, o.name || 'Untitled');
			if (!mapId) return;
			const result = await downscaleImage(file);
			await setBackground(result.dataUrl, result.aspect);
			getDialog()?.open({ mapId });
		} catch (err) {
			if (err instanceof MapImageError) console.warn('Add map image failed:', err.message);
			else console.error('Add map failed', err);
		}
	}

	/** Jump the dialog directly to a marker back-reference (the chips under
	 *  the stage header). */
	function jumpToMarker(ref: EntityMarkerRef): void {
		getDialog()?.open({ mapId: ref.mapId, markerId: ref.markerId });
	}

	return { openOwnedMap, handleAddMapWithFile, jumpToMarker };
}
