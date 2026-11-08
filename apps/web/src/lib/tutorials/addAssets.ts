/**
 * Tutorial: add your assets — with the active character: the + ◆ button,
 * finding an asset in the picker, its first ability (a companion's to
 * choose), Add, and spending its 3 experience from the log's link; a new
 * character takes three, paid for with the 9 experience it starts with.
 *
 * Targets (`data-tour`): tab-characters (home's mobile tab bar),
 * char-switcher, char-add-asset and char-assets (CharactersArea),
 * asset-picker-search / asset-picker-grid (AssetPicker), asset-card and
 * asset-card-add (the asset's card and its Add button); and the log's
 * .xp-cost-link.
 */
import { getActiveDiceCtx } from '#lib/diceContext.svelte.js';
import { ADD_ASSET } from './keys.js';
import { tourTarget, type TourStep, type Tutorial } from './tour.js';

export const addAssets: Tutorial = {
	route: '/home',
	ready: 'char-switcher',
	steps: (): TourStep[] => {
		if (!getActiveDiceCtx())
			return [
				{
					title: 'First, a character',
					body: 'Assets need someone to carry them. Run Create a character, and come back.',
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
				target: 'char-add-asset',
				title: 'Choose three assets',
				body: `You start with three assets: any mix of Companions, Paths, Combat Talents and Rituals. Your 9 experience pays for them, 3 each. Click ${ADD_ASSET} to choose your first.`,
				continueWhen: 'asset-picker-search',
				wait: 3000,
			},
			{
				target: 'asset-picker-search',
				title: 'Find one',
				body: 'Search by name, or open Filters to show just one kind.',
				wait: 3000,
				// This and the picker's and the card's other steps: if one closes,
				// back to the + button.
				backIfGone: true,
			},
			{
				target: 'asset-picker-grid',
				title: 'Pick one',
				body: 'Each card shows its kind and what it does. Click one to read it in full.',
				continueWhen: 'asset-card',
				back: true,
				backIfGone: true,
			},
			{
				target: 'asset-card',
				title: 'Its first ability',
				body: 'Its first ability comes marked: that’s what you start with. A companion comes with none, so choose the one it starts with.',
				backIfGone: true,
			},
			{
				// A step of its own, with the popover above the button: on a phone
				// the card fills the screen, and a popover beside it covers Add.
				target: 'asset-card-add',
				title: 'Take it',
				body: 'Click Add. A new asset costs 3 experience.',
				side: 'top',
				clickToContinue: true,
				back: true,
				backIfGone: true,
			},
			{
				// The log is written as HTML, so this one goes by its class: the
				// newest purchase's link is the first (the log runs newest first).
				selector: '.xp-cost-link',
				title: 'Spend the experience',
				body: 'The log records each purchase. Click −3 experience to spend it.',
				wait: 3000,
				pageClass: 'il-tour-log',
				clickToContinue: true,
			},
			{
				target: 'char-assets',
				title: 'Two more to go',
				body: 'Add two more the same way, spending 3 experience on each. That uses up your 9.',
			},
		];
	},
};
