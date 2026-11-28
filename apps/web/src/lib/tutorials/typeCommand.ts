/**
 * Tutorial: type a command — the command bar at the foot of /home, with
 * the active character: a line of plain text goes in the log as a note;
 * a command built from the suggestions (`/mom`, Tab or a tap on the row,
 * then `++` and Enter) changes momentum, and the log says so; what else
 * commands reach; history and Esc (keyboards only); the ? help.
 *
 * Targets (`data-tour`): log-note (CommandBar: the whole bar, its
 * suggestions and phone keys included) and cb-help (its ? button).
 */
import { getActiveDiceCtx } from '#lib/diceContext.svelte.js';
import { isCharacterLoaded } from '#lib/characterStore.svelte.js';
import { getLog } from '#lib/log.svelte.js';
import { kbd } from './keys.js';
import { logWatch } from './moves.js';
import type { TourStep, Tutorial } from './tour.js';

/** What's typed in the bar now. */
const typed = () => document.querySelector<HTMLInputElement>('.cb-input')?.value.trim() ?? '';

/** Puts the bar's suggestions in its box, so the highlight takes them in
 *  and the popover sits above them (tour.css). */
const CB = 'il-tour-cb';

/** A touch screen: suggestions are tapped, and the bar has its own keys. */
const touch = () => matchMedia('(pointer: coarse)').matches;

export const typeCommand: Tutorial = {
	route: '/home',
	ready: 'log-note',
	// Whether there's an active character decides the steps.
	loaded: isCharacterLoaded,
	steps: (): TourStep[] => {
		if (!getActiveDiceCtx())
			return [
				{
					title: 'First, a character',
					body: 'Commands change your character’s values, so you need one first. Run Create a character, and come back.',
				},
			];
		const log = logWatch();
		// The momentum change the player makes: a log entry since the tour began.
		const before = new Set(getLog().map((e) => e.id));
		const changed = () =>
			getLog().find((e) => !before.has(e.id) && e.title.endsWith('— Momentum')) ?? null;
		const enter = touch() ? kbd('↵') : kbd('Enter');

		return [
			{
				target: 'log-note',
				pageClass: CB,
				title: 'The command bar',
				body: 'Everything you type here goes in the log. Plain words are a note, the story so far. A line that starts with <code>/</code> is a command: it shows a value, changes it, or opens a move, an oracle or the dice.',
				side: 'top',
			},
			{
				target: 'log-note',
				pageClass: CB,
				title: 'Write a note',
				body: `Say what your character is doing: type a line and press ${enter}. It goes in the log as a note.`,
				side: 'top',
				continueWhen: log.wroteNote,
			},
			{
				target: 'log-note',
				pageClass: CB,
				title: 'Start a command',
				body: touch()
					? 'Now type <code>/mom</code>. The list above narrows to momentum, with its value. Tap the Momentum row to take it.'
					: `Now type <code>/mom</code>. The list above narrows to momentum, and the rest of the word shows greyed after the caret. Press ${kbd('Tab')} to take it.`,
				side: 'top',
				// Typed out in full, or past it already, counts too.
				continueWhen: () => typed().startsWith('/momentum') || !!changed(),
			},
			{
				target: 'log-note',
				pageClass: CB,
				title: 'Change it',
				body: `The list now shows what each operator does, and the result: ${kbd('++')} adds 1, ${kbd('--')} takes 1 away, ${kbd('+=')} and ${kbd('-=')} an amount, ${kbd('=')} sets it. The top row says what ${enter} will do. ${
					touch() ? `Tap the ${kbd('++')} key under the list` : `Type ${kbd('++')}`
				}, then press ${enter}.`,
				side: 'top',
				continueWhen: () => !!changed(),
			},
			{
				find: () => {
					const id = changed()?.id;
					return id ? document.querySelector(`.log-entry[data-entry-id="${id}"]`) : null;
				},
				title: 'In the log',
				body: 'The change is in the log, as a click on the sheet would write it, and the sheet shows it. A command is held to the rules: momentum can’t pass its maximum, and a value already set says so.',
				wait: 3000,
				pageClass: 'il-tour-log',
			},
			{
				target: 'log-note',
				pageClass: CB,
				title: 'And more',
				body: 'Commands reach whatever is active: <code>/foe.progress++</code> marks progress on your foe, <code>/journey.progress++</code> on your journey. <code>/move face danger</code> opens a move, <code>/oracle region</code> an oracle, <code>/roll 2d10</code> rolls dice. Type <code>/</code> to see everything you can reach now.',
				side: 'top',
			},
			{
				when: () => !touch(),
				target: 'log-note',
				pageClass: CB,
				title: 'Again, and away',
				body: `In an empty bar, ${kbd('↑')} brings back the commands you’ve run, newest first. ${kbd('Esc')} clears the bar.`,
				side: 'top',
			},
			{
				target: 'cb-help',
				title: 'Every command',
				body: 'The ? opens the full list, with examples, as <code>/help</code> does.',
				side: 'top',
				align: 'end',
			},
		];
	},
};
