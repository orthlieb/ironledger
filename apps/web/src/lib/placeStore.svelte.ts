// =============================================================================
// Iron Ledger — Place Store
//
// Global place state — inns, markets, remote locations (dire forest, ruin).
// A distinct connection kind alongside communities and NPCs; shares the
// Community field set today but lives in its own storage. Thin facade over the
// shared entity-store factory — see makeEntityStore.
// =============================================================================

import type { Place } from '$lib/types.js';
import { makeEntityStore } from '$lib/makeEntityStore.svelte.js';

const store = makeEntityStore<Place>('places', 'placeStore');

/** Load Places from the server (idempotent — only fetches once per session). */
export const loadPlaces = store.load;
/** All Places, in insertion order. Reactive. */
export const getPlaces = store.get;
export const isPlaceLoading = store.isLoading;
export const isPlaceSaving = store.isSaving;
/** Append a new Place and persist. */
export const addPlace = store.add;
/** Replace one Place by id and persist. */
export const updatePlace = store.update;
/** Replace one Place by id WITHOUT persisting (pair with persistPlacesNow). */
export const updatePlaceLocal = store.updateLocal;
/** Force a save of the current Place list (debounce-friendly partner). */
export const persistPlacesNow = store.persistNow;
/** Remove one Place by id and persist. */
export const removePlace = store.remove;
