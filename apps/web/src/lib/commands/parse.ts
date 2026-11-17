// =============================================================================
// Iron Ledger — command parser (docs/command-language.md → Commands)
//
//   /[owner.]value[operator]       show or change a value
//   /verb free text                move, oracle, roll, note, burn, story, help
//   plain text                     a note
//
// Syntax only: what a name means is the resolver's business (resolve.ts). An
// unquoted name holds no dot and no operator, so where a name ends is plain
// from the text; a name that holds one is quoted: /"Wolf.Bane".progress++.
// The parse also keeps where each part starts, for typeahead, and it never
// fails on a command still being typed: an open quote or a lone `+` is
// reported, not refused.
// =============================================================================

export const VERBS = ['move', 'oracle', 'roll', 'note', 'burn', 'story', 'help'] as const;
export type Verb = (typeof VERBS)[number];

export const OPERATORS = ['++', '--', '+=', '-=', '=', '!'] as const;
export type Op = (typeof OPERATORS)[number];

/** The kinds a `kind:` qualifier names. */
export const QUALIFIER_KINDS = [
	'character',
	'foe',
	'journey',
	'site',
	'scene',
	'vow',
	'asset',
] as const;
export type QualifierKind = (typeof QUALIFIER_KINDS)[number];

/** A name as written: its text (quotes taken off), and a `kind:` before it
 *  or `#n` after it when there was one. */
export interface NamePart {
	text: string;
	/** In double quotes: never a keyword or a value's name. */
	quoted: boolean;
	/** The quote isn't closed yet (still being typed). */
	open?: boolean;
	qualifier?: QualifierKind;
	/** `#n`: the n-th of that kind with that name, from 1. */
	index?: number;
	/** Where the part starts and ends in the input. */
	start: number;
	end: number;
}

export type Parsed =
	| { kind: 'empty' }
	| { kind: 'note'; text: string }
	| { kind: 'verb'; verb: Verb; arg: string; argStart: number }
	| {
			kind: 'value';
			/** Before the dot; absent with no dot. */
			owner?: NamePart;
			/** After the dot, or the whole target with none; text "" while the
			 *  slot is empty. */
			value: NamePart;
			dot: boolean;
			op?: Op;
			opStart?: number;
			/** A lone `+` or `-` at the end: an operator half typed. */
			partialOp?: '+' | '-';
			/** What follows the operator (trimmed; quotes off for `=`). */
			operand?: string;
			/** `=` took a value in quotes (so `=""` is empty text, not missing). */
			operandQuoted?: boolean;
			operandStart?: number;
	  }
	| { kind: 'error'; message: string; at: number };

/** Collapse runs of space and lower the case: how names compare. */
export function normName(s: string): string {
	return s.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Parse one name part, `text` sitting at `offset` in the input. */
function namePart(raw: string, offset: number): NamePart | { error: string; at: number } {
	// Leading and trailing space are free.
	const lead = raw.length - raw.trimStart().length;
	let s = raw.trim();
	let start = offset + lead;
	const end = start + s.length;
	let qualifier: QualifierKind | undefined;
	const q = s.match(/^([a-z]+)\s*:\s*/i);
	if (q && (QUALIFIER_KINDS as readonly string[]).includes(q[1]!.toLowerCase())) {
		qualifier = q[1]!.toLowerCase() as QualifierKind;
		s = s.slice(q[0].length);
		start += q[0].length;
	}
	let index: number | undefined;
	if (s.startsWith('"')) {
		const close = s.indexOf('"', 1);
		if (close < 0) return { text: s.slice(1), quoted: true, open: true, qualifier, start, end };
		const rest = s.slice(close + 1).trim();
		if (rest) {
			const m = rest.match(/^#(\d+)$/);
			if (!m)
				return { error: `Unexpected "${rest}" after the quoted name.`, at: start + close + 1 };
			index = Number(m[1]);
		}
		return { text: s.slice(1, close), quoted: true, qualifier, index, start, end };
	}
	if (qualifier) {
		const m = s.match(/^(.*?)\s*#(\d+)$/);
		if (m) {
			s = m[1]!;
			index = Number(m[2]);
		}
	}
	if (s.includes('"')) return { error: 'A name in quotes starts with the quote.', at: start };
	return { text: s, quoted: false, qualifier, index, start, end };
}

/** Where the operator starts in `body` (outside quotes), and which. */
function findOperator(
	body: string,
): { op: Op; at: number } | { partial: '+' | '-'; at: number } | null {
	let inQuote = false;
	for (let i = 0; i < body.length; i++) {
		const c = body[i]!;
		if (c === '"') {
			inQuote = !inQuote;
			continue;
		}
		if (inQuote) continue;
		const two = body.slice(i, i + 2);
		if (two === '++' || two === '--' || two === '+=' || two === '-=') return { op: two, at: i };
		if (c === '=') return { op: '=', at: i };
		if (c === '!' && !body.slice(i + 1).trim()) return { op: '!', at: i };
		if ((c === '+' || c === '-') && !body.slice(i + 1).trim()) return { partial: c, at: i };
	}
	return null;
}

/** Split `s` on dots outside quotes. */
function splitDots(s: string): { part: string; at: number }[] {
	const out: { part: string; at: number }[] = [];
	let inQuote = false;
	let from = 0;
	for (let i = 0; i < s.length; i++) {
		if (s[i] === '"') inQuote = !inQuote;
		else if (s[i] === '.' && !inQuote) {
			out.push({ part: s.slice(from, i), at: from });
			from = i + 1;
		}
	}
	out.push({ part: s.slice(from), at: from });
	return out;
}

/** Parse what's in the command bar. */
export function parseCommand(input: string): Parsed {
	const lead = input.length - input.trimStart().length;
	const s = input.trim();
	if (!s) return { kind: 'empty' };
	if (!s.startsWith('/')) return { kind: 'note', text: s };

	const bodyAt = lead + 1;
	const body = input.slice(bodyAt);

	// A verb: its name, then a space or the end. Free text follows.
	const v = body.match(/^\s*([a-z]+)(?=\s|$)/i);
	if (v && (VERBS as readonly string[]).includes(v[1]!.toLowerCase())) {
		const afterVerb = v[0].length;
		const restRaw = body.slice(afterVerb);
		const argLead = restRaw.length - restRaw.trimStart().length;
		return {
			kind: 'verb',
			verb: v[1]!.toLowerCase() as Verb,
			arg: restRaw.trim(),
			argStart: bodyAt + afterVerb + argLead,
		};
	}

	const found = findOperator(body);
	const targetText = found ? body.slice(0, found.at) : body;
	let op: Op | undefined;
	let opStart: number | undefined;
	let partialOp: '+' | '-' | undefined;
	let operand: string | undefined;
	let operandStart: number | undefined;
	let operandQuoted = false;
	if (found && 'op' in found) {
		op = found.op;
		opStart = bodyAt + found.at;
		const after = body.slice(found.at + op.length);
		const aLead = after.length - after.trimStart().length;
		operandStart = opStart + op.length + aLead;
		let text = after.trim();
		if (op === '++' || op === '--' || op === '!') {
			if (text)
				return { kind: 'error', message: `${op} takes nothing after it.`, at: operandStart };
		} else {
			if (op === '=' && text.length >= 2 && text.startsWith('"') && text.endsWith('"')) {
				text = text.slice(1, -1);
				operandQuoted = true;
			}
			operand = text;
		}
	} else if (found) partialOp = found.partial;

	const parts = splitDots(targetText);
	if (parts.length > 2)
		return {
			kind: 'error',
			message: 'One dot at most: /owner.value, e.g. /foe.progress++',
			at: bodyAt + parts[2]!.at - 1,
		};
	const named = parts.map((p) => namePart(p.part, bodyAt + p.at));
	for (const n of named) if ('error' in n) return { kind: 'error', message: n.error, at: n.at };
	const [first, second] = named as NamePart[];
	return {
		kind: 'value',
		owner: second ? first : undefined,
		value: second ?? first!,
		dot: !!second,
		op,
		opStart,
		partialOp,
		operand,
		operandStart,
		operandQuoted,
	};
}

/** Write a name for a command: quoted when it holds a dot, an operator or a
 *  quote, or reads as a keyword (`keyword` says whether it does). */
export function quoteName(name: string, keyword = false): string {
	if (keyword || /[.=!"]|\+\+|--|\+=|-=|^\s|\s$|[+-]$|#\d+$/.test(name) || name.includes(':'))
		return `"${name.replace(/"/g, '')}"`;
	return name;
}

// ---------------------------------------------------------------------------
// Operands
// ---------------------------------------------------------------------------

/** An amount after `+=`, `-=` or `=`: a whole number, a unit for a track
 *  (`b` boxes, `t` ticks), or `harm`. */
export type Amount =
	| { kind: 'number'; n: number; unit?: 'b' | 't' }
	| { kind: 'harm' }
	| { kind: 'bad'; text: string };

export function parseAmount(text: string, allowNegative = false): Amount {
	const t = text.trim().toLowerCase();
	if (t === 'harm') return { kind: 'harm' };
	const m = t.replace(/^[−–]/, '-').match(/^(-?)\s*(\d+)\s*([bt])?$/);
	if (!m || (m[1] && !allowNegative)) return { kind: 'bad', text };
	const n = Number(m[2]) * (m[1] ? -1 : 1);
	return { kind: 'number', n, unit: (m[3] as 'b' | 't' | undefined) ?? undefined };
}

// ---------------------------------------------------------------------------
// /roll
// ---------------------------------------------------------------------------

/** Die sides /roll takes (what the 3D dice draw). */
export const ROLL_DIE_SIDES = [4, 6, 8, 10, 12, 20, 100] as const;
export type RollDieSides = (typeof ROLL_DIE_SIDES)[number];
export const ROLL_MAX_N = 10;
export const ROLL_MAX_MODIFIER = 99;
export const ROLL_MAX_GROUPS = 4;

/** One die term of /roll: `2d10`, `d100`, `1d6+2`. */
export interface RollGroup {
	n: number;
	sides: RollDieSides;
	modifier: number;
	raw: string;
}

export function parseRollGroup(raw: string): RollGroup | null {
	const m = raw.match(/^(?<n>\d+)?d(?<sides>\d+)(?<mod>[+-]\d+)?$/i);
	if (!m || !m.groups) return null;
	const n = m.groups.n === undefined ? 1 : parseInt(m.groups.n, 10);
	const sides = parseInt(m.groups.sides!, 10);
	const modifier = m.groups.mod ? parseInt(m.groups.mod, 10) : 0;
	if (!Number.isFinite(n) || n < 1 || n > ROLL_MAX_N) return null;
	if (!(ROLL_DIE_SIDES as readonly number[]).includes(sides)) return null;
	if (Math.abs(modifier) > ROLL_MAX_MODIFIER) return null;
	return { n, sides: sides as RollDieSides, modifier, raw };
}

/** /roll's dice, or why they don't parse. */
export function parseRoll(arg: string): RollGroup[] | { error: string } {
	if (!arg) return { error: 'Needs dice: /roll 2d10 1d6+2' };
	const raws = arg.split(/\s+/).filter(Boolean);
	if (raws.length > ROLL_MAX_GROUPS) return { error: `At most ${ROLL_MAX_GROUPS} groups of dice.` };
	const groups: RollGroup[] = [];
	for (const g of raws) {
		const p = parseRollGroup(g);
		if (!p)
			return {
				error: `Can't read "${g}": write 2d10, d100 or 1d6+2, with sides ${ROLL_DIE_SIDES.join(', ')}, up to ${ROLL_MAX_N} dice and ±${ROLL_MAX_MODIFIER}.`,
			};
		groups.push(p);
	}
	return groups;
}
