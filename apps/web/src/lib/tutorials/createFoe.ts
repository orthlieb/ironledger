/**
 * Tutorial: create your first foe — open the foe picker from the Foes
 * panel's switcher, find a foe (search, filters), choose one, set how many
 * you face, read what it is and does, and add it; then, on its sheet, what
 * its pills mean, marking progress on a hit, and vanquishing it.
 *
 * Targets (`data-tour`): tab-foes (home's mobile tab bar), foe-switcher +
 * new-foe-action (FoesArea's switcher and its "+ New foe…" row),
 * foe-picker-search, foe-picker-grid, foe-quantity, foe-details and
 * foe-picker-confirm (FoePickerDialog), foe-pills, foe-progress and
 * foe-status (FoesArea's Core tab).
 */
import { tourTarget, type Tutorial } from './tour.js';

export const createFoe: Tutorial = {
	id: 'create-foe',
	title: 'Create your first foe',
	route: '/home',
	ready: 'foe-switcher',
	steps: () => [
		{
			// Phones and tablets (and the Tabs view) show one panel at a time.
			when: () => !tourTarget('foe-switcher'),
			target: 'tab-foes',
			title: 'Your foes',
			body: 'Tap Foes to show the foes you face.',
			continueWhen: 'foe-switcher',
		},
		{
			target: 'foe-switcher',
			title: 'Open the foe list',
			body: 'This switcher holds every foe in play. Click it to open the list.',
			continueWhen: 'new-foe-action',
			wait: 3000,
		},
		{
			target: 'new-foe-action',
			title: 'Add a foe',
			body: 'Choose “+ New foe…”.',
			// Below the row: above it would cover the list's search box.
			side: 'bottom',
			continueWhen: 'foe-picker-search',
			// Typed away by the list's search, or the list closed.
			backIfGone: true,
		},
		{
			target: 'foe-picker-search',
			title: 'Find your foe',
			body: 'Search by name or feature — “wolf”, “undead”, “fire”. Filters narrows the list by nature, source and rank.',
			wait: 3000,
			// This and the dialog's other steps: if it's cancelled, back to
			// the switcher.
			backIfGone: true,
		},
		{
			target: 'foe-picker-grid',
			title: 'Choose a foe',
			body: 'Each card shows its nature and rank. Click one to see it in full.',
			side: 'top',
			continueWhen: 'foe-quantity',
			back: true,
			backIfGone: true,
		},
		{
			target: 'foe-quantity',
			title: 'How many?',
			body: 'Face it alone, as a pack (2–4) or a horde (5+). A pack counts one rank tougher, a horde two: it deals more harm, and each hit marks less progress. The pills show the result.',
			backIfGone: true,
		},
		{
			// Only when the foe has a description, features, drives or tactics.
			optional: true,
			target: 'foe-details',
			title: 'Know your foe',
			body: 'Features describe what you see, drives what it wants, tactics what it does in a fight. They’re prompts for you to describe the fight.',
			side: 'top',
			back: true,
			backIfGone: true,
		},
		{
			target: 'foe-picker-confirm',
			title: 'Add it',
			body: 'Click Add to Foes to bring it into play.',
			side: 'top',
			clickToContinue: true,
			back: true,
			backIfGone: true,
		},
		{
			target: 'foe-pills',
			title: 'Your foe',
			body: 'Its pills sum it up: its nature and rank, how many you face, the harm it deals when it hits you, and the progress you mark each time you hit it.',
			wait: 3000,
		},
		{
			target: 'foe-progress',
			title: 'Mark progress',
			body: 'Each time you strike a blow, click + to mark progress. When the track is full enough, end the fight: the more progress, the better your odds.',
			back: true,
		},
		{
			target: 'foe-status',
			title: 'Vanquish it',
			body: 'When it’s defeated, mark it Vanquished. It stays on the list until you delete it from its options (the gear).',
			back: true,
		},
	],
};
