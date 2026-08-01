// =============================================================================
// Iron Ledger — Expedition Store
//
// Global standalone expedition state (Journeys + Sites). Stored server-side in
// user_data (expeditions column). Thin facade over the shared entity-store
// factory — see makeEntityStore.
// =============================================================================

import type { Expedition } from '$lib/types.js';
import { makeEntityStore } from '$lib/makeEntityStore.svelte.js';

const store = makeEntityStore<Expedition>('expeditions', 'expeditionStore');

/** Load expeditions from the server (idempotent — only fetches once). */
export const loadExpeditions = store.load;
/** All expeditions, in insertion order. Reactive. */
export const getExpeditions = store.get;
export const isExpeditionLoading = store.isLoading;
export const isExpeditionSaving = store.isSaving;
/** Append a new expedition and persist. */
export const addExpedition = store.add;
/** Replace one expedition by id and persist. */
export const updateExpedition = store.update;
/** Replace one expedition by id WITHOUT persisting (pair with persistExpeditionsNow). */
export const updateExpeditionLocal = store.updateLocal;
/** Force a save of the current expedition list (debounce-friendly partner). */
export const persistExpeditionsNow = store.persistNow;
/** Remove one expedition by id and persist. */
export const removeExpedition = store.remove;
