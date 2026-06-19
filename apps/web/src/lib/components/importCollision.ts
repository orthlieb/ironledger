/**
 * Types shared between ImportCollisionDialog.svelte and its callers.
 *
 * Lives in a separate .ts file because Svelte 5 components can't export types
 * from their main <script> block — they'd need a <script module>, and a plain
 * .ts file keeps editors / type-checkers happy without that ceremony.
 */

export type CollisionStrategy = 'new' | 'replace' | 'skip' | 'cancel';

/**
 * Names of the colliding incoming rows, grouped by category. Empty arrays
 * mean "no collisions in this category" — the dialog suppresses any group
 * with length 0. We pass names instead of counts so the dialog can show
 * the user *which* entries are about to clash, not just how many.
 */
export interface CollisionItems {
	communities: string[];
	npcs: string[];
	expeditions: string[];
}

