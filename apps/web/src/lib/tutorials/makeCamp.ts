/**
 * Tutorial: make camp and heal — after a fight, with the active character:
 * their vitals; Heal (Move → Heal → a stat → Roll Move → its links in the
 * log); say where they camp, as a note in the log; Make Camp (Move → Make
 * Camp → what it lets you choose → Roll Move → choosing from its links);
 * and their vitals again.
 *
 * Dice decide each roll, so a roll's step points at the newest roll the
 * tour hasn't seen (moves.ts), whatever came up.
 *
 * Targets (`data-tour`): tab-characters (home's mobile tab bar),
 * char-switcher, char-tab-core and char-vitals (CharactersArea), tb-move
 * (the layout's Move button), move-heal and move-make-camp (the moves'
 * tiles), move-stats, move-outcomes and move-roll (MovesDialog), log-note
 * (CommandBar); and the log's rolls (`.log-entry` holding a
 * `.move-outcome`).
 */
import { getActiveDiceCtx } from '#lib/diceContext.svelte.js';
import { closeMoves, logWatch } from './moves.js';
import { tourTarget, type TourStep, type Tutorial } from './tour.js';
import { MOVE } from './keys.js';

export const makeCamp: Tutorial = {
	route: '/home',
	ready: 'char-switcher',
	steps: (): TourStep[] => {
		const ctx = getActiveDiceCtx();
		if (!ctx)
			return [
				{
					title: 'First, a character',
					body: 'Resting needs someone to rest. Run Create a character, and come back.',
				},
			];
		const health = ctx.data.health;
		const log = logWatch();
		/** As a roll's step ends: close what its links opened, and count it seen. */
		const rolled = () => {
			closeMoves();
			log.done();
		};

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
				when: () => !tourTarget('char-vitals'),
				target: 'char-tab-core',
				title: 'Your character sheet',
				body: 'Click Core for your vitals.',
				continueWhen: 'char-vitals',
				wait: 3000,
			},
			{
				target: 'char-vitals',
				title: 'After the fight',
				body:
					(health < 5
						? `The fight left its mark: health ${health} of 5. `
						: 'You came through unhurt this time, but fights wear you down. ') +
					'Two moves bring you back: Heal, to tend your wounds, and Make Camp, to rest. Both lean on your supply.',
				wait: 3000,
			},

			// ── Heal ────────────────────────────────────────────────────────
			{
				target: 'tb-move',
				title: 'Tend your wounds',
				body: `Healing is a move too. Click ${MOVE}.`,
				continueWhen: 'moves-search',
			},
			{
				target: 'move-heal',
				title: 'Heal',
				body: 'Click Heal, under Adventure.',
				wait: 3000,
				continueWhen: 'move-stats',
				// This and the dialog's other steps: if it closes, back to Move.
				backIfGone: true,
			},
			{
				target: 'move-stats',
				title: 'Whose wounds?',
				body: 'Wits to tend someone else. To mend your own, roll wits or iron, whichever is lower: you’re both the healer and the hurt.',
				wait: 3000,
				backIfGone: true,
			},
			{
				target: 'move-roll',
				title: 'Roll',
				body: 'Click Roll Move.',
				// Above it: beside it on a phone, the popover would cover it.
				side: 'top',
				clickToContinue: true,
				back: true,
				backIfGone: true,
			},
			{
				find: log.newRoll,
				title: 'Take the health',
				body: 'On a hit, click +2 health to take it, and wounded to clear it if you’re marked. A weak hit costs you too: click −1 supply or −1 momentum, whichever you pay. A miss doesn’t help: Pay the Price.',
				// The dice roll first.
				wait: 8000,
				pageClass: 'il-tour-log',
				beforeNext: rolled,
			},

			// ── Make Camp ───────────────────────────────────────────────────
			{
				target: 'log-note',
				title: 'Where do you camp?',
				body: 'Say where you shelter, and how: a cave mouth out of the wind, a fire you dare to light. Type it here and press Enter.',
				continueWhen: log.wroteNote,
			},
			{
				target: 'tb-move',
				title: 'Make camp',
				body: `Resting for a few hours in the wild is Make Camp. Click ${MOVE}.`,
				continueWhen: 'moves-search',
			},
			{
				target: 'move-make-camp',
				title: 'Make Camp',
				body: 'Click Make Camp, under Adventure.',
				wait: 3000,
				continueWhen: 'move-outcomes',
				backIfGone: true,
			},
			{
				target: 'move-outcomes',
				title: 'How you rest',
				body: 'A strong hit lets you choose two of these, a weak hit one: Recuperate or Partake for health (Partake eats a supply), Relax for spirit, Focus for momentum, Prepare for the road ahead.',
				wait: 3000,
				backIfGone: true,
			},
			{
				target: 'move-roll',
				title: 'Roll +supply',
				body: 'Click Roll Move. You roll your supply: the better provisioned, the better you rest.',
				side: 'top',
				clickToContinue: true,
				back: true,
				backIfGone: true,
			},
			{
				find: log.newRoll,
				title: 'Choose',
				body: 'Click the links for what you choose: two on a strong hit, one on a weak hit. On a miss you take no comfort: Pay the Price.',
				wait: 8000,
				pageClass: 'il-tour-log',
				beforeNext: rolled,
			},
			{
				target: 'char-vitals',
				title: 'Rested',
				body: 'Your vitals show what you took back. Heal and rest like this between fights, and when supply runs low, Resupply.',
				wait: 3000,
			},
		];
	},
};
