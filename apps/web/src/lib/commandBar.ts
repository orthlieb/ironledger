// =============================================================================
// Iron Ledger — Command bar parser
//
// Parses the CommandBar input string into a structured command the dispatcher
// can act on. Pure and testable — no side effects, no store access.
//
// Grammar (v1):
//   <prose>                       → { kind: 'note', text }
//   /note <text>                  → { kind: 'note', text }
//   /help                         → { kind: 'help' }
//   /oracle <table>               → { kind: 'oracle', key }
//   /move <name>                  → { kind: 'move', name }
//   /char <name>                  → { kind: 'char', name }
//   /foe <name>                   → { kind: 'foe', name }
//   /start                        → { kind: 'start' }    pin ▲ on the newest entry
//   /end                          → { kind: 'end' }      pin ▼ on the newest entry
//   /story                        → { kind: 'story' }    open Generate on the section
//   /vital <res> <op> [n]         → { kind: 'vital', resource, op, value }
//     res:  momentum | health | spirit | supply | xp | experience (xp alias)
//     op:   + | - | =
//     n:    integer; defaults to 1 for +/-; required for = (negatives allowed).
//     Applies to the active character. Delegates to the resource / set action
//     bus so the existing per-character clamps + auto-log flow it through.
// =============================================================================

/** Canonical vital keys — same strings the action bus / character data use. */
export type VitalResource = 'momentum' | 'health' | 'spirit' | 'supply' | 'xp';

export type Command =
	| { kind: 'note'; text: string }
	| { kind: 'help' }
	| { kind: 'oracle'; key: string }
	| { kind: 'move'; name: string }
	| { kind: 'char'; name: string }
	| { kind: 'foe'; name: string }
	| { kind: 'start' }
	| { kind: 'end' }
	| { kind: 'story' }
	| { kind: 'vital'; resource: VitalResource; op: '+' | '-' | '='; value: number }
	| { kind: 'error'; message: string };

/** Set of leading slugs that route to slash-commands. Keep in sync with parseCommand. */
export const COMMAND_NAMES = [
	'note',
	'help',
	'oracle',
	'move',
	'char',
	'foe',
	'start',
	'end',
	'story',
	'vital',
] as const;
export type CommandName = (typeof COMMAND_NAMES)[number];

/** Vital resource labels shown in autocomplete / help. `experience` is an
 *  alias for `xp` — both parse identically; the internal key is always `xp`. */
export const VITAL_RESOURCE_ALIASES = [
	'momentum',
	'health',
	'spirit',
	'supply',
	'experience',
	'xp',
] as const;

function normalizeVitalResource(raw: string): VitalResource | null {
	const r = raw.toLowerCase();
	if (r === 'experience' || r === 'xp') return 'xp';
	if (r === 'momentum' || r === 'health' || r === 'spirit' || r === 'supply') return r;
	return null;
}

/**
 * Parse the `<op> [n]` tail of a /vital command. Accepts both spaced and
 * attached forms: `+ 2`, `+2`, `-3`, `= 12`, `=-3`, or a bare `+` / `-`
 * (defaults to 1). `=` on its own is an error — silent zeroing is a footgun.
 * `+`/`-` may not carry a negative value (would negate itself); `=` may.
 */
export function parseVitalOp(
	tail: string,
): { op: '+' | '-' | '='; value: number } | { kind: 'error'; message: string } {
	const m = tail.match(/^([+\-=])\s*(-?\d+)?$/);
	if (!m) {
		return { kind: 'error', message: '/vital needs an operator (+, -, or =) and a value.' };
	}
	const op = m[1] as '+' | '-' | '=';
	const rawN = m[2];
	if (op === '=') {
		if (rawN === undefined) {
			return { kind: 'error', message: '/vital = needs a value (e.g. /vital xp = 12).' };
		}
		return { op, value: parseInt(rawN, 10) };
	}
	// + / - : default to 1, disallow explicit negatives (would flip the op).
	const n = rawN === undefined ? 1 : parseInt(rawN, 10);
	if (n < 0) {
		return { kind: 'error', message: `Use ${op === '+' ? '-' : '+'} for negative deltas.` };
	}
	return { op, value: n };
}

/**
 * Parse a raw input line. Returns a Command or an { kind: 'error' } for
 * malformed slash-commands. Non-slash input is always a note (never errors).
 */
export function parseCommand(input: string): Command | null {
	const trimmed = input.trim();
	if (!trimmed) return null;

	// Non-slash input → note. Preserve internal whitespace but trim edges.
	if (!trimmed.startsWith('/')) {
		return { kind: 'note', text: trimmed };
	}

	// Slash-command: first token (after the /) is the verb, rest is the args.
	const rest = trimmed.slice(1);
	const spaceIdx = rest.search(/\s/);
	const verb = (spaceIdx < 0 ? rest : rest.slice(0, spaceIdx)).toLowerCase();
	const args = (spaceIdx < 0 ? '' : rest.slice(spaceIdx + 1)).trim();

	switch (verb) {
		case 'help':
			return { kind: 'help' };
		case 'note':
			if (!args) return { kind: 'error', message: '/note needs some text.' };
			return { kind: 'note', text: args };
		case 'oracle':
			if (!args) return { kind: 'error', message: '/oracle needs a table name.' };
			return { kind: 'oracle', key: args };
		case 'move':
			if (!args) return { kind: 'error', message: '/move needs a move name.' };
			return { kind: 'move', name: args };
		case 'char':
			if (!args) return { kind: 'error', message: '/char needs a name.' };
			return { kind: 'char', name: args };
		case 'foe':
			if (!args) return { kind: 'error', message: '/foe needs a name.' };
			return { kind: 'foe', name: args };
		case 'start':
			return { kind: 'start' };
		case 'end':
			return { kind: 'end' };
		case 'story':
			return { kind: 'story' };
		case 'vital': {
			if (!args) {
				return {
					kind: 'error',
					message: '/vital needs a resource and an operator (e.g. /vital momentum +2).',
				};
			}
			// Resource is always alphabetic; split on the first non-alpha char so
			// jammed forms parse too (e.g. `/vital momentum+2`, `/vital xp=12`).
			const m = args.match(/^([a-z]+)\s*(.*)$/i);
			if (!m) {
				return {
					kind: 'error',
					message: '/vital needs a resource name (e.g. momentum, health, xp).',
				};
			}
			const resource = normalizeVitalResource(m[1]);
			if (!resource) {
				return {
					kind: 'error',
					message: `/vital doesn't recognise "${m[1]}". Try momentum / health / spirit / supply / experience.`,
				};
			}
			const tail = m[2].trim();
			if (!tail) {
				return {
					kind: 'error',
					message: '/vital needs an operator (+, -, or =) after the resource.',
				};
			}
			const parsed = parseVitalOp(tail);
			if ('kind' in parsed) return parsed;
			return { kind: 'vital', resource, op: parsed.op, value: parsed.value };
		}
		default:
			return { kind: 'error', message: `Unknown command: /${verb}. Type /help for a list.` };
	}
}

// -----------------------------------------------------------------------------
// Fuzzy matching for autocomplete + name-based dispatch (char / foe / oracle).
// -----------------------------------------------------------------------------

/** Simple substring + prefix-priority scorer for autocomplete lists. */
export function fuzzyScore(candidate: string, query: string): number {
	if (!query) return 1;
	const c = candidate.toLowerCase();
	const q = query.toLowerCase();
	if (c === q) return 1000;
	if (c.startsWith(q)) return 500 - (c.length - q.length);
	const idx = c.indexOf(q);
	if (idx >= 0) return 100 - idx;
	// Sub-sequence match (each char in q appears in order): weakest signal.
	let ci = 0;
	for (const ch of q) {
		const found = c.indexOf(ch, ci);
		if (found < 0) return 0;
		ci = found + 1;
	}
	return 10;
}

/**
 * Return the top-N matches from candidates, ranked by fuzzyScore.
 * Zero-scored items are dropped.
 */
export function fuzzyPick<T>(items: T[], label: (t: T) => string, query: string, limit = 8): T[] {
	if (!query) return items.slice(0, limit);
	return items
		.map((it) => ({ it, s: fuzzyScore(label(it), query) }))
		.filter((r) => r.s > 0)
		.sort((a, b) => b.s - a.s)
		.slice(0, limit)
		.map((r) => r.it);
}

/**
 * Case-insensitive prefix filter — items whose label starts with `query`,
 * alphabetized. Empty query returns everything (up to limit).
 *
 * Used for /move (and other name-argument commands) where "starts with"
 * feels more natural than substring / sub-sequence matching: `/move e`
 * should list moves that begin with E, not everything containing an e.
 */
export function prefixPick<T>(items: T[], label: (t: T) => string, query: string, limit = 8): T[] {
	if (!query) return items.slice(0, limit);
	const q = query.toLowerCase();
	return items
		.filter((it) => label(it).toLowerCase().startsWith(q))
		.sort((a, b) => label(a).localeCompare(label(b)))
		.slice(0, limit);
}
