/**
 * Tutorial: start a journey — with the active character: the Expeditions
 * switcher's "+ New Journey…", naming the journey and choosing its
 * difficulty, its progress track; saying how you set out, as a note in the
 * log; Undertake a Journey (Move → the tile → +wits → Roll Move) and
 * marking the progress its outcome gives from the log's links; then the
 * track again, with what comes next (Make Camp on the road, Reach Your
 * Destination when it's full).
 *
 * Dice decide the roll, so its step points at the newest roll the tour
 * hasn't seen (moves.ts), and Next marks the progress if the player clicked
 * none of its links.
 *
 * Targets (`data-tour`): tab-expeditions (home's mobile tab bar),
 * exp-switcher + new-journey-action (ExpeditionsArea's switcher and its
 * "+ New Journey…" row), new-journey-dialog, exp-progress (the journey's
 * track), log-note (CommandBar), tb-move, move-undertake-a-journey,
 * move-stats and move-roll (MovesDialog); and the log's rolls.
 */
import { getActiveDiceCtx } from '#lib/diceContext.svelte.js';
import { getExpeditions } from '#lib/expeditionStore.svelte.js';
import { MOVE } from './keys.js';
import { closeMoves, logWatch, use } from './moves.js';
import { tourTarget, type TourStep, type Tutorial } from './tour.js';

export const startJourney: Tutorial = {
	route: '/home',
	ready: 'exp-switcher',
	steps: (): TourStep[] => {
		if (!getActiveDiceCtx())
			return [
				{
					title: 'First, a character',
					body: 'A journey needs a traveller. Run Create a character, and come back.',
				},
			];
		const log = logWatch();
		// The journeys there already: the dialog's step waits for a new one
		// (an open journey's track may be on screen behind it all along).
		const before = new Set(getExpeditions().map((e) => e.id));
		const madeJourney = () =>
			!tourTarget('new-journey-dialog') &&
			getExpeditions().some((e) => e.type === 'journey' && !before.has(e.id));

		return [
			{
				// Phones and tablets (and the Tabs view) show one panel at a time.
				when: () => !tourTarget('exp-switcher'),
				target: 'tab-expeditions',
				title: 'Your expeditions',
				body: 'Tap Expeditions to show your journeys.',
				continueWhen: 'exp-switcher',
			},
			{
				target: 'exp-switcher',
				title: 'Plan a journey',
				body: 'Your journeys are kept here (and, with Delve on, the sites you explore). Click the switcher to open the list.',
				continueWhen: 'new-journey-action',
				wait: 3000,
			},
			{
				target: 'new-journey-action',
				title: 'A new journey',
				body: 'Choose “+ New Journey…”.',
				// Below the row: above it would cover the list's search box.
				side: 'bottom',
				continueWhen: 'new-journey-dialog',
				// Typed away by the list's search, or the list closed.
				backIfGone: true,
			},
			{
				target: 'new-journey-dialog',
				title: 'Where are you going?',
				body: 'Name the journey for where it leads, and choose its difficulty: how far, and how perilous. The harder it is, the less each waypoint marks — three boxes for Troublesome, a single tick for Epic. Then click Create.',
				continueWhen: madeJourney,
				// Cancelled: back to the switcher.
				backIfGone: true,
			},
			{
				target: 'exp-progress',
				title: 'Your journey',
				body: 'Each waypoint you reach marks progress on this track. When it’s full, you’re all but there.',
				wait: 3000,
			},
			{
				target: 'log-note',
				title: 'Set out',
				body: 'Say how you set out: by road or river, at first light, in the rain. Type it here and press Enter.',
				continueWhen: log.wroteNote,
			},
			{
				target: 'tb-move',
				title: 'On the road',
				body: `Each stretch of the way is a move: Undertake a Journey. Click ${MOVE}.`,
				continueWhen: 'moves-search',
			},
			{
				target: 'move-undertake-a-journey',
				title: 'Undertake a Journey',
				body: 'Click Undertake a Journey, under Adventure.',
				wait: 3000,
				continueWhen: 'move-stats',
				// This and the dialog's other steps: if it closes, back to Move.
				backIfGone: true,
			},
			{
				target: 'move-stats',
				title: 'Roll +wits',
				body: 'You find your way with wits: a roll for each stretch of the journey.',
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
				title: 'Reach a waypoint',
				body: 'On a hit you reach a waypoint: click Mark progress. A strong hit lets you push on instead (+1 momentum for −1 supply); a weak hit costs a supply. On a miss, something perilous waylays you: Pay the Price. If you click nothing, Next marks the progress.',
				// The dice roll first.
				wait: 8000,
				pageClass: 'il-tour-log',
				beforeNext: (roll) => {
					closeMoves();
					// None of its links used: take the waypoint's progress.
					if (roll && !roll.querySelector('.resource-spent')) use(roll, 'progress-link');
					log.done();
				},
			},
			{
				target: 'exp-progress',
				title: 'On your way',
				body: 'There’s your progress. Keep going, a roll for each stretch, and Make Camp to rest on the road. When the track is full, Reach Your Destination: a progress roll against it.',
				wait: 3000,
			},
		];
	},
};
