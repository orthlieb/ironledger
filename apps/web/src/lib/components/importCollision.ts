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
 * with length 0. Detection is by NORMALISED NAME (lowercase + trimmed) so
 * cross-user transfers — where IDs never match — still flag duplicates.
 *
 * Journeys and sites are listed separately even though both live in the
 * expedition store, because the user thinks of them as distinct kinds
 * ("transferring a location" = a site).
 */
export interface CollisionItems {
	characters: string[];
	communities: string[];
	npcs: string[];
	places: string[];
	journeys: string[];
	sites: string[];
}

/** Lowercase + trim — the key used everywhere collisions are matched by name. */
export function normaliseName(name: string | null | undefined): string {
	return (name ?? '').toLowerCase().trim();
}
