/**
 * Tutorial: fight your foe — with the active character and foe, look at the
 * character's vitals and initiative; make a move (Move → search → Enter the
 * Fray → a stat → Roll Move) and apply its outcome from the log's links;
 * say what the character does, as a note in the log; Strike or Clash, as
 * initiative allows, and see the harm marked on the
 * foe's progress track; then Endure Harm, apply it, roll, and see it come
 * off the character's health.
 *
 * Dice decide what each roll gives, so the steps read the log as it is:
 * the roll each one points at is the newest the tour hasn't seen, and Next
 * applies what the fight needs (initiative, harm) if the player left its
 * link.
 *
 * Targets (`data-tour`): tab-characters / tab-foes (home's mobile tab bar),
 * char-switcher, char-tab-core, char-vitals and char-initiative
 * (CharactersArea), tb-move (the layout's Move button), moves-search,
 * move-<id> (each move's tile: move-enter-the-fray, move-strike,
 * move-clash, move-endure-harm), move-stats, move-harm and move-roll
 * (MovesDialog), foe-progress (FoesArea), log-note (CommandBar, the log's
 * note bar); and the log's entries (`.log-entry` holding a `.move-outcome`).
 */
import { getActiveFoeId } from '#lib/activeContext.svelte.js';
import { getActiveDiceCtx } from '#lib/diceContext.svelte.js';
import { getEncounters } from '#lib/encounterStore.svelte.js';
import { getLog, triggerAction } from '#lib/log.svelte.js';
import { tourTarget, type TourStep, type Tutorial } from './tour.js';

/** Initiative as the character stores it (1 is the character's). */
const NONE = 0,
	FOE = 2;

const initiative = () => (getActiveDiceCtx()?.data.initiative as number | undefined) ?? NONE;

function setInitiative(value: number) {
	const ctx = getActiveDiceCtx();
	if (ctx) triggerAction({ charId: ctx.charId, type: 'set', key: 'initiative', value });
}

/** Is a foe in play — picked, and not yet vanquished? */
function hasFoe(): boolean {
	const id = getActiveFoeId();
	return !!id && getEncounters().some((e) => e.id === id && !e.vanquished);
}

/** Phones and tablets (and the Tabs view) show one panel at a time. */
const tabbed = () => !!tourTarget('tab-foes');

/** The log's move rolls, newest first. */
const rolls = () =>
	[...document.querySelectorAll<HTMLElement>('.log-entry')].filter((e) =>
		e.querySelector('.move-outcome'),
	);

/** Click the first link of `kind` left in `entry` (one not yet used). */
function use(entry: Element | undefined, kind: string) {
	entry?.querySelector<HTMLElement>(`a.${kind}`)?.click();
}

/** Close the Moves dialog, should an outcome's link have opened it (Pay
 *  the Price, on a miss): the next step is elsewhere. */
function closeMoves() {
	const dialog = document.querySelector('.moves-dialog');
	if (!dialog) return;
	const buttons = [...dialog.querySelectorAll<HTMLButtonElement>('button')];
	(
		dialog.querySelector<HTMLButtonElement>('button[aria-label="Close"]') ??
		buttons.find((b) => b.textContent?.trim() === 'Close')
	)?.click();
}

/** In the search box `el` holds, search for `text`, unless the move `id`
 *  is already showing. */
function searchFor(el: Element | undefined, id: string, text: string) {
	if (tourTarget(id)) return;
	const input = el?.querySelector('input');
	if (!input) return;
	input.value = text;
	input.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Choose whichever of the stats `el` lists is highest. */
function pickHighest(el: Element | undefined) {
	const rows = [...(el?.querySelectorAll<HTMLElement>('.md-stat-row-btn') ?? [])];
	const value = (row: HTMLElement) => Number(row.querySelector('.md-sval')?.textContent ?? 0);
	const best = rows.reduce<HTMLElement | undefined>(
		(top, row) => (!top || value(row) > value(top) ? row : top),
		undefined,
	);
	best?.click();
}

export const fightFoe: Tutorial = {
	id: 'fight-foe',
	title: 'Fight your foe',
	route: '/home',
	ready: 'char-switcher',
	steps: (): TourStep[] => {
		if (!getActiveDiceCtx())
			return [
				{
					title: 'First, a character',
					body: 'A fight needs someone to fight it. Run Create a character, then Create your first foe, and come back.',
				},
			];
		if (!hasFoe())
			return [
				{
					title: 'First, a foe',
					body: 'A fight needs a foe. Run Create your first foe, and come back.',
				},
			];

		// The rolls already in the log; each roll step points at the newest
		// one that isn't, then adds it.
		const seen = new Set(rolls().map((e) => e.dataset['entryId']));
		const newRoll = () => rolls().find((e) => !seen.has(e.dataset['entryId'])) ?? null;
		const done = () => rolls().forEach((e) => seen.add(e.dataset['entryId']));
		// And the entries, to tell a note the player writes from those before.
		const before = new Set(getLog().map((e) => e.id));
		const wroteNote = () => getLog().some((e) => e.title === 'Note' && !before.has(e.id));

		return [
			{
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
				title: 'Your vitals',
				body: 'A fight wears these down and builds them up: momentum, health, spirit and supply. Moves change them, mostly through links in the log.',
				wait: 3000,
			},
			{
				when: () => initiative() === NONE,
				target: 'char-initiative',
				title: 'Initiative',
				body: 'Whoever has initiative is in control of a fight. Out of one, no one has it: Enter the Fray decides who does.',
			},
			{
				when: () => initiative() !== NONE,
				target: 'char-initiative',
				title: 'Initiative',
				body: 'Whoever has initiative is in control of a fight. A new fight starts with no one holding it: Next sets None, so you can Enter the Fray.',
				beforeNext: () => setInitiative(NONE),
			},

			// ── Enter the Fray ──────────────────────────────────────────────
			{
				target: 'tb-move',
				title: 'Make a move',
				body: 'When you do something risky, you make a move: it says what to roll and what comes of it. Click Move.',
				continueWhen: 'moves-search',
			},
			{
				target: 'moves-search',
				title: 'Find a move',
				body: 'Search by name, or open Filters for one kind. Moves you can’t make right now are greyed out. Search for “fray”.',
				wait: 3000,
				// This and the dialog's other steps: if it closes, back to Move.
				backIfGone: true,
				beforeNext: (el) => searchFor(el, 'move-enter-the-fray', 'fray'),
			},
			{
				target: 'move-enter-the-fray',
				title: 'Enter the Fray',
				body: 'You make it as a fight begins, to see who has the upper hand. Click it.',
				continueWhen: 'move-stats',
				back: true,
				backIfGone: true,
			},
			{
				target: 'move-stats',
				title: 'How you go in',
				body: 'Choose the stat for how it starts: Heart to face your foe down, Shadow to strike from hiding, Wits if you’re ambushed. It’s added to your roll.',
				wait: 3000,
				backIfGone: true,
			},
			{
				target: 'move-roll',
				title: 'Roll',
				body: 'Click Roll Move. Your action die plus the stat has to beat two challenge dice: both for a strong hit, one for a weak hit, neither for a miss.',
				// Above it: beside it on a phone, the popover would cover it.
				side: 'top',
				clickToContinue: true,
				back: true,
				backIfGone: true,
			},
			{
				find: newRoll,
				title: 'What happened',
				body: 'The roll goes in the log, with its outcome. Its links apply it: click them to take momentum, and to give initiative to whoever has it. Each works once. If you leave initiative, Next sets it.',
				// The dice roll first.
				wait: 8000,
				pageClass: 'il-tour-log',
				beforeNext: (roll) => {
					closeMoves();
					if (initiative() === NONE) {
						// A weak hit's choice: momentum leaves your foe to act first.
						const tookMomentum = !roll?.querySelector('a.resource-link');
						if (roll?.querySelector('.roll-outcome-weak') && tookMomentum) setInitiative(FOE);
						else use(roll, 'initiative-link');
					}
					done();
				},
			},

			// ── Strike or Clash ─────────────────────────────────────────────
			{
				target: 'log-note',
				title: 'Say what you do',
				body: 'Before you roll, say what your character does. Type it here, as you’d tell it — “I rush in, axe high” — and press Enter. It goes in the log, so your fight reads as a story.',
				continueWhen: wroteNote,
			},
			{
				target: 'tb-move',
				title: 'Make the move',
				body: 'Now make the move it calls for. With initiative, that’s Strike; if your foe has it, Clash, to fight back. Click Move.',
				continueWhen: 'moves-search',
			},
			{
				find: () => tourTarget(initiative() === FOE ? 'move-clash' : 'move-strike'),
				title: 'Strike or Clash',
				body: 'The one you can make now is lit. Click it.',
				wait: 3000,
				continueWhen: 'move-stats',
				backIfGone: true,
			},
			{
				target: 'move-stats',
				title: 'Close in, or at range',
				body: 'Iron to fight hand to hand, Edge to shoot from range.',
				wait: 3000,
				backIfGone: true,
			},
			{
				target: 'move-roll',
				title: 'Roll',
				body: 'Click Roll Move.',
				side: 'top',
				clickToContinue: true,
				back: true,
				backIfGone: true,
			},
			{
				find: newRoll,
				title: 'Harm your foe',
				body: 'On a hit, click Inflict your harm: it marks progress against your foe, double on a strong hit. On a miss your foe hits back, and you Pay the Price. Next applies the harm and initiative if you don’t.',
				wait: 8000,
				pageClass: 'il-tour-log',
				beforeNext: (roll) => {
					closeMoves();
					use(roll, 'progress-link');
					use(roll, 'initiative-link');
					done();
				},
			},
			{
				when: tabbed,
				target: 'tab-foes',
				title: 'Your foe',
				body: 'Tap Foes to show your foe.',
				continueWhen: 'foe-progress',
			},
			{
				target: 'foe-progress',
				title: 'Wearing your foe down',
				body: 'Your foe has no health to count down: you beat it by filling this track. Each harm marks progress, more against a weaker foe. When you think it’s enough, End the Fight: a roll against it.',
				wait: 3000,
			},

			// ── Endure Harm ─────────────────────────────────────────────────
			{
				target: 'tb-move',
				title: 'When you’re hurt',
				body: 'When your foe lands a blow, you Endure Harm. Click Move.',
				continueWhen: 'moves-search',
			},
			{
				target: 'move-endure-harm',
				title: 'Endure Harm',
				body: 'Click Endure Harm, under Suffer.',
				wait: 3000,
				continueWhen: 'move-harm',
				backIfGone: true,
			},
			{
				target: 'move-harm',
				title: 'Take the harm',
				body: 'It starts at your foe’s rank; change it to fit the blow. Click Apply: it comes off your health.',
				clickToContinue: '.md-harm-apply',
				backIfGone: true,
			},
			{
				target: 'move-stats',
				title: 'Health or iron',
				body: 'Roll with whichever is higher now. Next chooses it for you.',
				backIfGone: true,
				beforeNext: pickHighest,
			},
			{
				target: 'move-roll',
				title: 'Shake it off?',
				body: 'Click Roll Move. A strong hit lets you shake some of it off; a miss costs you more.',
				side: 'top',
				clickToContinue: true,
				backIfGone: true,
			},
			{
				find: newRoll,
				title: 'What it cost',
				body: 'Click its links to apply them, as before.',
				wait: 8000,
				pageClass: 'il-tour-log',
				beforeNext: () => {
					closeMoves();
					done();
				},
			},
			{
				when: tabbed,
				target: 'tab-characters',
				title: 'Back to you',
				body: 'Tap Characters.',
				continueWhen: 'char-vitals',
			},
			{
				target: 'char-vitals',
				title: 'Your health',
				body: 'The harm came off your health here. Heal and Make Camp bring it back. Fight on like this until it’s done: say what you do, make the move, apply what it says.',
				wait: 3000,
			},
		];
	},
};
