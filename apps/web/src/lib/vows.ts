/**
 * Forsaking a vow (Forsake Your Vow): the line every way of doing it logs —
 * the vow card's Forsake, `/<vow>.status=forsaken` typed or as a link, and
 * the move's Use Move — with Endure Stress at the vow's rank (Troublesome 1
 * to Epic 5). HTML, the vow's name escaped: a name is the player's text and
 * mustn't become a link of its own.
 */
import { commandLinkHtml } from './commands/links.js';
import { escHtml } from './markdown.js';
import { VOW_FORSAKE_STRESS, type Vow, type VowDifficulty } from './types.js';

const RANK_LABEL: Record<VowDifficulty, string> = {
	troublesome: 'Troublesome',
	dangerous: 'Dangerous',
	formidable: 'Formidable',
	extreme: 'Extreme',
	epic: 'Epic',
};

/** The forsake line; bind its links to the entry (bindCommandLinks) with the
 *  character and the vow. */
export function forsakeVowHtml(vow: Pick<Vow, 'name' | 'difficulty'>): string {
	const rank = VOW_FORSAKE_STRESS[vow.difficulty];
	const name = escHtml(vow.name?.trim() || 'Unnamed Vow');
	const endure = commandLinkHtml('Endure Stress', `/move endure-stress ${rank}`);
	return `<p>Forsook the iron vow <strong>${name}</strong> (${RANK_LABEL[vow.difficulty]}) — ${endure} (−${rank}) for its rank.</p>`;
}
