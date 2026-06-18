/**
 * Types shared between ImportCollisionDialog.svelte and its callers.
 *
 * Lives in a separate .ts file because Svelte 5 components can't export types
 * from their main <script> block — they'd need a <script module>, and a plain
 * .ts file keeps editors / type-checkers happy without that ceremony.
 */

export type CollisionStrategy = 'new' | 'replace' | 'skip' | 'cancel';

export interface CollisionCounts {
	communities: number;
	npcs: number;
	expeditions: number;
}
