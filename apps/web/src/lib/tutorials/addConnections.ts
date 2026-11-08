/**
 * Tutorial: add a settlement and an NPC — the Connections switcher's
 * "+ New Settlement…" (a name, typed or rolled, and what else to roll) and
 * the card it makes; "+ New NPC…" the same way, then setting where they
 * live (Within) to that settlement; and Forge a Bond, the move that makes
 * them part of your story.
 *
 * Its dialogs' steps wait for a settlement or NPC that wasn't there when
 * the tour began, with the dialog closed: an open entry's card can sit
 * behind them all along.
 *
 * Targets (`data-tour`): tab-connections (home's mobile tab bar),
 * cm-switcher + new-settlement-action / new-npc-action (CommunitiesArea's
 * switcher and its rows), new-settlement-dialog / new-npc-dialog, cm-card
 * (the entry's card), npc-within (an NPC's Within picker), and tb-move.
 */
import { getCommunities } from '#lib/communityStore.svelte.js';
import { getNpcs } from '#lib/npcStore.svelte.js';
import { MOVE } from './keys.js';
import { tourTarget, type TourStep, type Tutorial } from './tour.js';

/** True once the store holds an entry it didn't when this was made, and
 *  the dialog `id` has closed. */
function madeNew(list: () => { id: string }[], dialog: string): () => boolean {
	const before = new Set(list().map((e) => e.id));
	return () => !tourTarget(dialog) && list().some((e) => !before.has(e.id));
}

export const addConnections: Tutorial = {
	route: '/home',
	ready: 'cm-switcher',
	steps: (): TourStep[] => {
		const madeSettlement = madeNew(getCommunities, 'new-settlement-dialog');
		const madeNpc = madeNew(getNpcs, 'new-npc-dialog');

		return [
			{
				// Phones and tablets (and the Tabs view) show one panel at a time.
				when: () => !tourTarget('cm-switcher'),
				target: 'tab-connections',
				title: 'Your connections',
				body: 'Tap Connections to show the people and places you know.',
				continueWhen: 'cm-switcher',
			},
			{
				target: 'cm-switcher',
				title: 'People and places',
				body: 'The settlements you know, the people in them and the landmarks you find are kept here. Click the switcher to open the list.',
				continueWhen: 'new-settlement-action',
				wait: 3000,
			},
			{
				target: 'new-settlement-action',
				title: 'A new settlement',
				body: 'Choose “+ New Settlement…”.',
				// Below the row: above it would cover the list's search box.
				side: 'bottom',
				continueWhen: 'new-settlement-dialog',
				// Typed away by the list's search, or the list closed.
				backIfGone: true,
			},
			{
				target: 'new-settlement-dialog',
				title: 'Name it',
				body: 'Name the settlement, or pick a name oracle and click the die to roll one. Everything ticked under Also randomize, its trouble among them, is rolled when you create it. Then click Create.',
				continueWhen: madeSettlement,
				// Cancelled: back to the switcher.
				backIfGone: true,
			},
			{
				target: 'cm-card',
				title: 'Your settlement',
				body: 'What was rolled is written here: its region, its trouble and the rest. Change anything that doesn’t fit your story.',
				wait: 3000,
			},
			{
				target: 'cm-switcher',
				title: 'Someone who lives there',
				body: 'Now someone who lives there. Open the list again.',
				continueWhen: 'new-npc-action',
			},
			{
				target: 'new-npc-action',
				title: 'A new NPC',
				body: 'Choose “+ New NPC…”.',
				side: 'bottom',
				continueWhen: 'new-npc-dialog',
				backIfGone: true,
			},
			{
				target: 'new-npc-dialog',
				title: 'Who are they?',
				body: 'Name them, or roll a name from an oracle. Everything ticked under Also randomize, from how they look to what they want, is rolled when you create them. Then click Create.',
				continueWhen: madeNpc,
				backIfGone: true,
			},
			{
				target: 'cm-card',
				title: 'Your NPC',
				body: 'Their card holds what was rolled, and how they feel about you. Change anything that doesn’t fit.',
				wait: 3000,
			},
			{
				target: 'npc-within',
				title: 'Where they live',
				body: 'Set Within to the settlement you made, so you’ll find them there.',
			},
			{
				target: 'tb-move',
				title: 'Forge a bond',
				body: `When you spend real time with them, stand with them through hardship or make sacrifices for them, you can Forge a Bond: a move, from ${MOVE}, rolled +heart. On a strong hit you mark a tick on your Bonds track.`,
			},
		];
	},
};
