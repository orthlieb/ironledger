// =============================================================================
// Iron Ledger — NPC Store
//
// Global standalone NPC state (independent of communities so NPCs travel
// freely across the world). Stored server-side in user_data (npcs column).
// Thin facade over the shared entity-store factory — see makeEntityStore.
// =============================================================================

import type { Npc } from '$lib/types.js';
import { makeEntityStore } from '$lib/makeEntityStore.svelte.js';

const store = makeEntityStore<Npc>('npcs', 'npcStore');

/** Load NPCs from the server (idempotent — only fetches once per session). */
export const loadNpcs = store.load;
/** All NPCs, in insertion order. Reactive. */
export const getNpcs = store.get;
export const isNpcLoading = store.isLoading;
export const isNpcSaving = store.isSaving;
/** Append a new NPC and persist. */
export const addNpc = store.add;
/** Replace one NPC by id and persist. */
export const updateNpc = store.update;
/** Replace one NPC by id WITHOUT persisting (pair with persistNpcsNow). */
export const updateNpcLocal = store.updateLocal;
/** Force a save of the current NPC list (debounce-friendly partner). */
export const persistNpcsNow = store.persistNow;
/** Remove one NPC by id and persist. */
export const removeNpc = store.remove;
