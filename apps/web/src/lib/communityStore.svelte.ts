// =============================================================================
// Iron Ledger — Community Store
//
// Global standalone community state. Stored server-side in user_data
// (communities column). Thin facade over the shared entity-store factory —
// see makeEntityStore.
// =============================================================================

import type { Community } from '$lib/types.js';
import { makeEntityStore } from '$lib/makeEntityStore.svelte.js';

const store = makeEntityStore<Community>('communities', 'communityStore');

/** Load communities from the server (idempotent — only fetches once). */
export const loadCommunities = store.load;
/** All communities, in insertion order. Reactive. */
export const getCommunities = store.get;
export const isCommunityLoading = store.isLoading;
export const isCommunitySaving = store.isSaving;
/** Append a new community and persist. */
export const addCommunity = store.add;
/** Replace one community by id and persist. */
export const updateCommunity = store.update;
/** Replace one community by id WITHOUT persisting (pair with persistCommunitiesNow). */
export const updateCommunityLocal = store.updateLocal;
/** Force a save of the current community list (debounce-friendly partner). */
export const persistCommunitiesNow = store.persistNow;
/** Remove one community by id and persist. */
export const removeCommunity = store.remove;
