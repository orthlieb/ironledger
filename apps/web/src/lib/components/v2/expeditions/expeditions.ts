/**
 * What the Expeditions area (ExpeditionsArea) and its tab components share.
 */
import type { VowDifficulty } from '#lib/types.js';

/** The ranks, in order, with their labels. */
export const DIFFICULTIES: { value: VowDifficulty; label: string }[] = [
	{ value: 'troublesome', label: 'Troublesome' },
	{ value: 'dangerous', label: 'Dangerous' },
	{ value: 'formidable', label: 'Formidable' },
	{ value: 'extreme', label: 'Extreme' },
	{ value: 'epic', label: 'Epic' },
];
