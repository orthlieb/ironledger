/**
 * The tutorials, for the menu (HamburgerMenu → Tutorials), and how to start
 * one. Each lives in its own module; see tour.ts for how they're written.
 */
import { goto } from '$app/navigation';
import { page } from '$app/state';
import { createCharacter } from './createCharacter.js';
import { createFoe } from './createFoe.js';
import { fightFoe } from './fightFoe.js';
import { makeCamp } from './makeCamp.js';
import { runTour, whenRendered, type Tutorial } from './tour.js';

export const TUTORIALS: readonly Tutorial[] = [createCharacter, createFoe, fightFoe, makeCamp];

/** Start a tutorial, going to its page first if need be. */
export async function startTutorial(id: string): Promise<void> {
	const t = TUTORIALS.find((x) => x.id === id);
	if (!t) return;
	if (page.url.pathname !== t.route) await goto(t.route);
	// Its steps (and their `when` checks) need the page drawn.
	await whenRendered(t.ready);
	await runTour(t.steps());
}
