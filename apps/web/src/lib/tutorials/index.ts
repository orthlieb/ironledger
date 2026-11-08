/**
 * The tutorials, for the menu (HamburgerMenu → Tutorials), and how to start
 * one. The menu needs only their ids and titles: each tutorial's module,
 * the runner (tour.ts) and Driver.js load when one is picked, so none of
 * it ships with the page. See tour.ts for how they're written.
 */
import { goto } from '$app/navigation';
import { page } from '$app/state';
import type { Tutorial } from './tour.js';

export interface TutorialEntry {
	id: string;
	/** Menu label. */
	title: string;
	/** Its steps, loaded on demand. */
	load: () => Promise<Tutorial>;
}

export const TUTORIALS: readonly TutorialEntry[] = [
	{
		id: 'create-character',
		title: 'Create a character',
		load: () => import('./createCharacter.js').then((m) => m.createCharacter),
	},
	{
		id: 'first-vow',
		title: 'Add your first vow',
		load: () => import('./addVow.js').then((m) => m.addVow),
	},
	{
		id: 'add-assets',
		title: 'Add your assets',
		load: () => import('./addAssets.js').then((m) => m.addAssets),
	},
	{
		id: 'start-journey',
		title: 'Start a journey',
		load: () => import('./startJourney.js').then((m) => m.startJourney),
	},
	{
		id: 'add-connections',
		title: 'Add a settlement and an NPC',
		load: () => import('./addConnections.js').then((m) => m.addConnections),
	},
	{
		id: 'map-settlement',
		title: 'Put your settlement on the map',
		load: () => import('./mapSettlement.js').then((m) => m.mapSettlement),
	},
	{
		id: 'create-foe',
		title: 'Create your first foe',
		load: () => import('./createFoe.js').then((m) => m.createFoe),
	},
	{
		id: 'fight-foe',
		title: 'Fight your foe',
		load: () => import('./fightFoe.js').then((m) => m.fightFoe),
	},
	{
		id: 'make-camp',
		title: 'Make camp and heal',
		load: () => import('./makeCamp.js').then((m) => m.makeCamp),
	},
];

/** Start a tutorial, going to its page first if need be. */
export async function startTutorial(id: string): Promise<void> {
	const entry = TUTORIALS.find((x) => x.id === id);
	if (!entry) return;
	const [t, { runTour, until, whenRendered }] = await Promise.all([
		entry.load(),
		import('./tour.js'),
	]);
	if (page.url.pathname !== t.route) await goto(t.route);
	// Its steps (and their `when` checks) need the page drawn, and what
	// they read from its stores there.
	await whenRendered(t.ready);
	if (t.loaded) await until(t.loaded);
	await runTour(t.steps());
}
