/**
 * Debility → move penalty mapping for Ironsworn.
 *
 * Each entry describes one debility condition, the move(s) it penalises,
 * and an optional runtime condition (e.g. supply must be 0).
 *
 * moves: '*'          applies to every move (Cursed, Unprepared when supply=0)
 * moves: string[]     specific move IDs only
 */

import type { CharacterData } from '$lib/types.js';

export interface DebilityWarning {
	key:       keyof CharacterData;
	label:     string;
	penalty:   string;
	moves:     string[] | '*';
	/** Extra runtime check beyond just the debility being true. */
	condition?: (data: CharacterData) => boolean;
}

export const DEBILITY_PENALTIES: DebilityWarning[] = [
	{
		key: 'wounded',
		label: 'Wounded',
		penalty: 'Add −1 to your Adds before rolling.',
		moves: ['move/heal'],
	},
	{
		key: 'shaken',
		label: 'Shaken',
		penalty: 'Add −1 to your Adds before rolling.',
		moves: ['move/sojourn', 'move/make-camp', 'move/endure-stress', 'move/face-desolation'],
	},
	{
		key: 'unprepared',
		label: 'Unprepared',
		penalty: 'Your Supply is 0 — add −1 to your Adds before rolling.',
		moves: '*',
		condition: (d) => (d.supply ?? 1) === 0,
	},
	{
		key: 'encumbered',
		label: 'Encumbered',
		penalty: 'If this move requires speed or agility, add −1 to your Adds before rolling.',
		moves: [
			'move/face-danger',
			'move/secure-an-advantage',
			'move/undertake-a-journey',
			'move/reach-your-destination',
			'move/escape-the-depths',
		],
	},
	{
		key: 'maimed',
		label: 'Maimed',
		penalty: 'If this move requires physical action, add −1 to your Adds before rolling.',
		moves: [
			'move/face-danger',
			'move/secure-an-advantage',
			'move/strike',
			'move/clash',
			'move/turn-the-tide',
			'move/battle',
			'move/enter-the-fray',
			'move/endure-harm',
			'move/face-death',
			'move/draw-the-circle',
			'move/aid-your-ally',
		],
	},
	{
		key: 'corrupted',
		label: 'Corrupted',
		penalty: 'If this move draws on your humanity or fellowship, add −1 to your Adds before rolling.',
		moves: [
			'move/forge-a-bond',
			'move/test-your-bond',
			'move/swear-an-iron-vow',
			'move/aid-your-ally',
			'move/compel',
			'move/sojourn',
		],
	},
	{
		key: 'tormented',
		label: 'Tormented',
		penalty: 'If this move invokes your bonds or past, add −1 to your Adds before rolling.',
		moves: ['move/sojourn', 'move/swear-an-iron-vow'],
	},
	{
		key: 'cursed',
		label: 'Cursed',
		penalty: 'Add −1 to your Adds before rolling.',
		moves: '*',
	},
];

/**
 * Return all active debility warnings relevant to a specific move.
 *
 * Pass moveId = '*' to get every currently-active warning regardless of move
 * (used by the free-roll dice dialog).
 */
export function getActiveDebilityWarnings(
	moveId: string | '*',
	data: CharacterData,
): DebilityWarning[] {
	return DEBILITY_PENALTIES.filter(p => {
		if (!data[p.key])                          return false; // debility not active
		if (p.condition && !p.condition(data))     return false; // extra condition unmet
		if (moveId === '*')                        return true;  // caller wants all
		if (p.moves === '*')                       return true;  // applies to every move
		return (p.moves as string[]).includes(moveId);
	});
}
