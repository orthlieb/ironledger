/**
 * Tutorial: add your first vow — with the active character: the + ⛓
 * button, the New Vow dialog (what you swear, and its rank), and the vow on
 * the Vows tab, where its progress is marked.
 *
 * Targets (`data-tour`): tab-characters (home's mobile tab bar),
 * char-switcher, char-add-vow, new-vow-dialog (its ConfirmDialog) and
 * char-vows (CharactersArea).
 */
import { getActiveDiceCtx } from '#lib/diceContext.svelte.js';
import { ADD_VOW } from './keys.js';
import { tourTarget, type TourStep, type Tutorial } from './tour.js';

export const addVow: Tutorial = {
	route: '/home',
	ready: 'char-switcher',
	steps: (): TourStep[] => {
		if (!getActiveDiceCtx())
			return [
				{
					title: 'First, a character',
					body: 'A vow needs someone to swear it. Run Create a character, and come back.',
				},
			];
		return [
			{
				// Phones and tablets (and the Tabs view) show one panel at a time.
				when: () => !tourTarget('char-switcher'),
				target: 'tab-characters',
				title: 'Your character',
				body: 'Tap Characters to show your character.',
				continueWhen: 'char-switcher',
			},
			{
				target: 'char-add-vow',
				title: 'Swear your first vow',
				body: `Every Ironsworn is bound by iron vows. Click ${ADD_VOW} to swear your first: the quest that sets your story in motion.`,
				continueWhen: 'new-vow-dialog',
				wait: 3000,
			},
			{
				target: 'new-vow-dialog',
				title: 'Name it and rank it',
				body: 'Say what you swear to do, and choose its rank: the harder the vow, the more progress it takes, and the more experience it earns when you fulfill it. Then click Swear Vow.',
				continueWhen: 'char-vows',
				// Cancelled: back to the + ⛓ button.
				backIfGone: true,
			},
			{
				target: 'char-vows',
				title: 'Your vow',
				body: 'Mark progress here each time you Reach a Milestone. When you believe you’ve done what you swore, Fulfill Your Vow.',
				wait: 3000,
			},
		];
	},
};
