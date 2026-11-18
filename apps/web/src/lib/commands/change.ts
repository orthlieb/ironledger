// =============================================================================
// Iron Ledger — what an operator does to a value (docs/command-language.md →
// Operators, Kinds of value)
//
// planChange works out a change without making it: the value before and
// after, held to its range or options, the log line the sheet would write,
// and a summary for the status line ("Health 4 → 2"). The command bar shows
// the summary before Enter is pressed; the runner makes the change.
// =============================================================================

import type { Op } from './parse.js';
import { parseAmount } from './parse.js';
import { listLabel, trackText, TRACK_MAX, type ValueSpec } from './values.js';
import { escHtml } from '#lib/markdown.js';

/** The harm an amount of `harm` stands for, and whose it is (a foe's
 *  name; none for Endure Harm's amount with no foe). */
export interface Harm {
	n: number;
	from?: string;
}

export type ChangeResult =
	| {
			ok: true;
			from: number | string;
			to: number | string;
			/** Nothing to do (the value is already there): no log line. */
			nothing: boolean;
			/** The log entry's body. */
			line: string;
			/** "Health 4 → 2", "Wounded: Cleared → Marked". */
			summary: string;
			/** A number's target before its range held it: what a change past
			 *  the edge asked for (`/health-=3` at 1 wants −2), for the cascades
			 *  that say what becomes of the rest. */
			wanted?: number;
	  }
	| { ok: false; message: string; incomplete?: boolean };

const fail = (message: string, incomplete = false): ChangeResult => ({
	ok: false,
	message,
	incomplete,
});

/** A number as the log writes it: −6, not -6. */
const signed = (n: number) => (n < 0 ? `−${-n}` : String(n));
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Work out what `op` with `operand` does to `spec`. */
export function planChange(
	spec: ValueSpec,
	op: Op,
	operand: string,
	harm?: Harm,
	quoted = false,
): ChangeResult {
	if (spec.kind === 'notes') return fail(`${spec.label} is edited on the sheet.`);
	if (!spec.writable) return fail(`${spec.label} is read-only.`);
	switch (spec.kind) {
		case 'bool':
			return boolChange(spec, op, operand);
		case 'list':
		case 'text':
			return choiceChange(spec, op, operand, quoted);
		case 'number':
		case 'track':
			return numberChange(spec, op, operand, harm);
	}
}

// ── True/false ───────────────────────────────────────────────────────────

const TRUE_WORDS = ['true', 'yes', 'on'];
const FALSE_WORDS = ['false', 'no', 'off'];

function boolChange(spec: ValueSpec, op: Op, operand: string): ChangeResult {
	const from = Number(spec.get()) > 0 ? 1 : 0;
	let to: number;
	if (op === '!') to = from ? 0 : 1;
	else if (op === '++') to = 1;
	else if (op === '--') to = 0;
	else if (op === '=') {
		const t = operand.trim().toLowerCase();
		if (!t) return fail('Needs a value after =: 1 (true) or 0 (false).', true);
		if (TRUE_WORDS.includes(t)) to = 1;
		else if (FALSE_WORDS.includes(t)) to = 0;
		else {
			const a = parseAmount(t, true);
			if (a.kind !== 'number' || a.unit)
				return fail(`${spec.label} is true/false: =1 or =0, or ++, -- or !.`);
			to = a.n > 0 ? 1 : 0;
		}
	} else return fail(`${spec.label} is true/false: use ++, -- or !.`);
	const words = spec.words ?? ['No', 'Yes'];
	if (to === from)
		return {
			ok: true,
			from,
			to,
			nothing: true,
			line: '',
			summary: `${spec.label}: already ${words[to]}`,
		};
	return {
		ok: true,
		from,
		to,
		nothing: false,
		line: `<div>${escHtml(spec.label)}: <strong>${words[to]}</strong></div>`,
		summary: `${spec.label}: ${words[from]} → ${words[to]}`,
	};
}

// ── Lists and text ───────────────────────────────────────────────────────

const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

/** The option a typed value names, by id or label, ignoring case. */
export function matchOption(spec: ValueSpec, typed: string): string | null {
	const t = norm(typed);
	const o = spec.options?.find((o) => norm(o.id) === t || norm(o.label) === t);
	return o ? o.id : null;
}

function choiceChange(spec: ValueSpec, op: Op, operand: string, quoted: boolean): ChangeResult {
	if (op !== '=') {
		const eg =
			spec.kind === 'list' && spec.options?.length
				? `, e.g. /${spec.key}=${spec.options[0]!.id}`
				: '';
		return fail(
			spec.kind === 'list'
				? `${spec.label} is a list: set it with =${eg}.`
				: `${spec.label} is text: set it with =.`,
		);
	}
	const typed = operand.trim();
	if (!typed && !quoted) {
		const opts = spec.options?.length
			? `: ${spec.options
					.slice(0, 6)
					.map((o) => o.label)
					.join(', ')}${spec.options.length > 6 ? ', …' : ''}`
			: '';
		return fail(`Needs a value after =${opts}`, true);
	}
	const from = String(spec.get());
	let to: string;
	if (spec.kind === 'text') to = typed;
	else {
		const id = matchOption(spec, typed);
		if (id !== null) to = id;
		else if (spec.custom) to = typed;
		else {
			const opts = spec.options ?? [];
			const shown = opts
				.slice(0, 8)
				.map((o) => o.label)
				.join(', ');
			return fail(
				`${spec.label} has no option "${typed}": ${shown}${opts.length > 8 ? ', …' : ''}`,
			);
		}
	}
	const show = (v: string) => (spec.kind === 'list' ? listLabel(spec, v) : v || '—');
	if (to === from)
		return {
			ok: true,
			from,
			to,
			nothing: true,
			line: '',
			summary: `${spec.label}: already ${show(to)}`,
		};
	return {
		ok: true,
		from,
		to,
		nothing: false,
		line: `<div>${escHtml(spec.label)}: ${escHtml(show(from))} → <strong>${escHtml(show(to))}</strong></div>`,
		summary: `${spec.label}: ${show(from)} → ${show(to)}`,
	};
}

// ── Numbers and tracks ───────────────────────────────────────────────────

/** How many ticks a track amount is: marks by rank (ticks with none),
 *  boxes or ticks. */
function ticksOf(spec: ValueSpec, n: number, unit?: 'b' | 't'): number {
	if (unit === 'b') return n * 4;
	if (unit === 't') return n;
	return n * (spec.ticksPerMark ?? 1);
}

/** A track amount in words, as it was written: "2 marks", "1 box", "3 ticks". */
function trackAmount(spec: ValueSpec, n: number, unit?: 'b' | 't'): string {
	if (unit === 'b') return plural(n, 'box', 'boxes');
	if (unit === 't' || !spec.ticksPerMark) return plural(n, 'tick');
	return plural(n, 'mark');
}

function numberChange(spec: ValueSpec, op: Op, operand: string, harm?: Harm): ChangeResult {
	const track = spec.kind === 'track';
	if (op === '!') return fail(`${spec.label} isn't true/false.`);
	const from = Number(spec.get()) || 0;
	const min = spec.min ?? (track ? 0 : -Infinity);
	const max = spec.max ?? (track ? TRACK_MAX : Infinity);
	const unitHint = track ? ': a number of marks, or b for boxes, t for ticks' : '';

	// The amount, as a signed change or a value to set.
	let delta: number | null = null;
	let target: number | null = null;
	let words: string;
	let harmNote = '';
	if (op === '++' || op === '--') {
		const one = track ? ticksOf(spec, 1) : 1;
		delta = op === '++' ? one : -one;
		words = track ? trackAmount(spec, 1) : '1';
	} else {
		const t = operand.trim();
		if (!t) return fail(`Needs an amount after ${op}${unitHint}.`, true);
		const a = parseAmount(t, op === '=' && !track);
		if (a.kind === 'bad')
			return fail(`"${t}" isn't ${op === '=' ? 'a' : 'a positive'} whole number.`);
		let n: number;
		let unit: 'b' | 't' | undefined;
		if (a.kind === 'harm') {
			if (op === '=') return fail('harm is an amount: write it after += or -=.');
			if (!harm) return fail('No foe to take harm from.');
			n = harm.n;
		} else {
			n = a.n;
			unit = a.unit;
			if (unit && !track) return fail(`${spec.label} takes no unit.`);
		}
		const amount = track ? ticksOf(spec, n, unit) : n;
		words = track ? trackAmount(spec, n, unit) : String(n);
		if (a.kind === 'harm') harmNote = harm!.from ? `, ${harm!.from}’s harm` : ', harm';
		if (op === '=') target = amount;
		else delta = op === '+=' ? amount : -amount;
	}

	const wanted = target ?? from + delta!;
	const to = Math.max(min, Math.min(max, wanted));
	const text = (v: number) => (track ? trackText(v) : signed(v));
	const edge = wanted > max ? 'max' : wanted < min ? 'min' : '';
	const edgeText = edge ? `${edge} ${text(edge === 'max' ? max : min)}` : '';

	if (to === from && edge === '')
		return {
			ok: true,
			from,
			to,
			wanted,
			nothing: true,
			line: '',
			summary: `${spec.label}: already ${text(from)}${edgeText ? ` (${edgeText})` : ''}`,
		};

	let note: string;
	if (target !== null) {
		const asked = track ? words : signed(target);
		note = edge ? ` (= ${asked}, ${edgeText})` : '';
	} else {
		const sign = delta! > 0 ? '+' : '−';
		note = ` (${sign}${words}${harmNote}${edge ? `, ${edgeText}` : ''})`;
	}
	const fromText = track ? trackText(from) : String(from);
	const toText = track ? trackText(to) : String(to);
	return {
		ok: true,
		from,
		to,
		wanted,
		nothing: false,
		line: `<div>${escHtml(spec.label)}: ${fromText} → <strong>${toText}</strong>${escHtml(note)}</div>`,
		summary: `${spec.label} ${text(from)} → ${text(to)}${edge || harmNote ? ` (${[harmNote.slice(2), edgeText].filter(Boolean).join(', ')})` : ''}`,
	};
}
