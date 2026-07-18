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
//   /debility <name> <state>      → { kind: 'debility', name, state }
//     name:  wounded | shaken | unprepared | encumbered | maimed | corrupted
//            | cursed | tormented (exact match, case-insensitive — no prefix)
//     state: on | off | toggle (required — no default)
//     Applies to the active character via the debility action bus. Toggle is
//     resolved at dispatch time against the character's current value.
//   /bonds <op> [n]               → { kind: 'track', name: 'bonds', op, value }
//   /failures <op> [n]            → { kind: 'track', name: 'failures', op, value }
//     Same operator semantics as /vital (reuses parseVitalOp). Track values
//     are clamped 0..40 by the resource applier.
//   /initiative <who>             → { kind: 'initiative', who }
//     who: none | foe | character (exact match, case-insensitive)
//     Applies to the active character via a new action-bus type so the log
//     line reads "Initiative → foe" (not "Initiative: 0 → 2 (+2)").
//
// Overloaded verbs — /char, /foe, /exp accept multiple argument shapes; the
// first non-space token decides the mode:
//   /char                         → { kind: 'help', focus: 'char' }
//   /char <name>                  → { kind: 'char', name }
//   /char <op> [n]                → { kind: 'char-harm', op, value }
//   /foe                          → { kind: 'help', focus: 'foe' }
//   /foe <name>                   → { kind: 'foe', name }
//   /foe <op> [n]                 → { kind: 'foe-progress', op, value }
//   /foe vanquish                 → { kind: 'foe-vanquish' }
//   /exp                          → { kind: 'help', focus: 'exp' }
//   /exp <name>                   → { kind: 'exp', name }
//   /exp <op> [n]                 → { kind: 'exp-progress', op, value }
//
// Operators accepted on the overloaded verbs are + and - only; `=` is
// deliberately absent — the ticks-vs-boxes semantics for foe/exp progress
// makes `=N` ambiguous ("set to N ticks? N boxes?"), and consistency wins
// over cleverness. For an absolute health set use /vital health = N.
//
// Progress operators for /foe and /exp are rank-aware: n counts **boxes**
// (foes) or **marks** (expeditions); the applier multiplies by ticksPerBox
// based on the encounter rank / expedition difficulty. /char <op> is flat
// on the health field (character health has no rank system).
// =============================================================================

/** Canonical vital keys — same strings the action bus / character data use. */
export type VitalResource = 'momentum' | 'health' | 'spirit' | 'supply' | 'xp';

/** Canonical debility keys — same strings the action bus / character data use.
 *  Kept in sync with DEBILITY_KEYS in preconditions.ts and the boolean fields
 *  on CharacterData in types.ts. Order is display-order (conditions → banes →
 *  burdens) — autocomplete shows them in this order. */
export const DEBILITY_NAMES = [
	'wounded',
	'shaken',
	'unprepared',
	'encumbered',
	'maimed',
	'corrupted',
	'cursed',
	'tormented',
] as const;
export type DebilityName = (typeof DEBILITY_NAMES)[number];

/** Debility state tokens accepted by /debility. */
export const DEBILITY_STATES = ['on', 'off', 'toggle'] as const;
export type DebilityState = (typeof DEBILITY_STATES)[number];

/** Progress-track names editable by /bonds and /failures. */
export type TrackName = 'bonds' | 'failures';

/** Operators offered by autocomplete for /vital / /bonds / /failures.
 *  These accept `=` (absolute set); /char, /foe, /exp deliberately do not. */
export const NUMERIC_OPS = ['+', '-', '='] as const;

/**
 * Parse the `<op> [n]` tail for a delta-only overload (/char, /foe, /exp).
 * Same shape as parseVitalOp but rejects `=`: an absolute set is available on
 * /vital (health, xp) and would be ambiguous on foe/exp progress (boxes vs
 * ticks). Errors surface an explicit "use + or -" so users don't hunt for `=`.
 */
export function parseDeltaOp(
	tail: string,
): { op: '+' | '-'; value: number } | { kind: 'error'; message: string } {
	const m = tail.match(/^([+\-=])\s*(-?\d+)?$/);
	if (!m) {
		return { kind: 'error', message: 'Need an operator (+ or -) and a value.' };
	}
	const op = m[1];
	if (op === '=') {
		return {
			kind: 'error',
			message:
				'= is not supported here — use + or -. For an absolute health set, use /vital health = N.',
		};
	}
	const rawN = m[2];
	const n = rawN === undefined ? 1 : parseInt(rawN, 10);
	if (n < 0) {
		return { kind: 'error', message: `Use ${op === '+' ? '-' : '+'} for negative deltas.` };
	}
	return { op: op as '+' | '-', value: n };
}

/** Initiative values accepted by /initiative. Order matters — it drives the
 *  autocomplete strip and matches the enum encoded on CharacterData.initiative
 *  (0 = none, 1 = character, 2 = foe). */
export const INITIATIVE_VALUES = ['none', 'character', 'foe'] as const;
export type InitiativeValue = (typeof INITIATIVE_VALUES)[number];

/** Map an InitiativeValue to the on-disk numeric enum. */
export function initiativeToNumber(v: InitiativeValue): 0 | 1 | 2 {
	if (v === 'none') return 0;
	if (v === 'character') return 1;
	return 2;
}

export type Command =
	| { kind: 'note'; text: string }
	| { kind: 'help'; focus?: string }
	| { kind: 'oracle'; key: string }
	| { kind: 'move'; name: string }
	| { kind: 'char'; name: string }
	| {
			kind: 'char-harm';
			op: '+' | '-';
			value: number;
			/** True when the user typed `/char -` (or `+`) with no explicit
			 *  number, so the default 1 was filled in. Dispatch swaps this for
			 *  the active foe's rank harm on `-` when a foe is set. */
			defaulted: boolean;
	  }
	| { kind: 'foe'; name: string }
	| { kind: 'foe-progress'; op: '+' | '-'; value: number }
	| { kind: 'foe-vanquish' }
	| { kind: 'exp'; name: string }
	| { kind: 'exp-progress'; op: '+' | '-'; value: number }
	| { kind: 'start' }
	| { kind: 'end' }
	| { kind: 'story' }
	| { kind: 'vital'; resource: VitalResource; op: '+' | '-' | '='; value: number }
	| { kind: 'debility'; name: DebilityName; state: DebilityState }
	| { kind: 'track'; name: TrackName; op: '+' | '-' | '='; value: number }
	| { kind: 'initiative'; who: InitiativeValue }
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
	'debility',
	'bonds',
	'failures',
	'initiative',
	'exp',
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
		case 'char': {
			// Overload matches /foe and /exp: empty → help, +/- → char-harm on
			// health, anything else → name (set active). No `=` — for absolute
			// health use /vital health = N.
			if (!args) return { kind: 'help', focus: 'char' };
			const trimmed = args.trim();
			if (/^[+\-=]/.test(trimmed)) {
				const compact = trimmed.replace(/\s+/g, ' ');
				// Bare `+` or `-` means no explicit value — dispatch swaps in the
				// active foe's rank harm on `-` before applying.
				const defaulted = /^[+-]$/.test(compact);
				const parsed = parseDeltaOp(compact);
				if ('kind' in parsed) return parsed;
				return { kind: 'char-harm', op: parsed.op, value: parsed.value, defaulted };
			}
			return { kind: 'char', name: trimmed };
		}
		case 'foe': {
			// Empty args → open the help dialog focused on /foe so the user sees
			// the full overloaded grammar rather than an inline one-liner error.
			if (!args) return { kind: 'help', focus: 'foe' };
			const trimmed = args.trim();
			// Subcommand: vanquish. Case-insensitive; guaranteed unambiguous —
			// foes cannot be named "vanquish" per repo policy.
			if (/^vanquish$/i.test(trimmed)) return { kind: 'foe-vanquish' };
			// Operator: + or - → progress on the active foe (rank-aware).
			if (/^[+\-=]/.test(trimmed)) {
				const parsed = parseDeltaOp(trimmed.replace(/\s+/g, ' '));
				if ('kind' in parsed) return parsed;
				return { kind: 'foe-progress', op: parsed.op, value: parsed.value };
			}
			// Otherwise: set active foe by name (existing behavior).
			return { kind: 'foe', name: trimmed };
		}
		case 'exp': {
			// Same overload pattern as /foe, minus the vanquish subcommand.
			if (!args) return { kind: 'help', focus: 'exp' };
			const trimmed = args.trim();
			if (/^[+\-=]/.test(trimmed)) {
				const parsed = parseDeltaOp(trimmed.replace(/\s+/g, ' '));
				if ('kind' in parsed) return parsed;
				return { kind: 'exp-progress', op: parsed.op, value: parsed.value };
			}
			return { kind: 'exp', name: trimmed };
		}
		case 'start':
			return { kind: 'start' };
		case 'end':
			return { kind: 'end' };
		case 'story':
			return { kind: 'story' };
		case 'initiative': {
			if (!args) {
				return {
					kind: 'error',
					message: '/initiative needs a value: none, character, or foe.',
				};
			}
			// Single token — reject anything with a space in the args (extras).
			if (/\s/.test(args)) {
				return {
					kind: 'error',
					message: '/initiative takes a single value: none, character, or foe.',
				};
			}
			const who = args.toLowerCase();
			if (!INITIATIVE_VALUES.includes(who as InitiativeValue)) {
				return {
					kind: 'error',
					message: `/initiative doesn't recognise "${args}". Use none / character / foe.`,
				};
			}
			return { kind: 'initiative', who: who as InitiativeValue };
		}
		case 'bonds':
		case 'failures': {
			// Shared body — both are 0..40 tracks driven by the same op grammar.
			const trackName = verb as TrackName;
			if (!args) {
				return {
					kind: 'error',
					message: `/${trackName} needs an operator (+, -, or =).`,
				};
			}
			const parsed = parseVitalOp(args.replace(/\s+/g, ' ').trim());
			if ('kind' in parsed) return parsed;
			return { kind: 'track', name: trackName, op: parsed.op, value: parsed.value };
		}
		case 'debility': {
			if (!args) {
				return {
					kind: 'error',
					message: '/debility needs a name and a state (e.g. /debility wounded on).',
				};
			}
			const parts = args.split(/\s+/);
			if (parts.length !== 2) {
				return {
					kind: 'error',
					message: '/debility takes exactly two args: a name and a state (on / off / toggle).',
				};
			}
			const name = parts[0].toLowerCase();
			const state = parts[1].toLowerCase();
			if (!DEBILITY_NAMES.includes(name as DebilityName)) {
				return {
					kind: 'error',
					message: `/debility doesn't recognise "${parts[0]}". Use one of: ${DEBILITY_NAMES.join(', ')}.`,
				};
			}
			if (!DEBILITY_STATES.includes(state as DebilityState)) {
				return {
					kind: 'error',
					message: `/debility state must be one of: on, off, toggle.`,
				};
			}
			return {
				kind: 'debility',
				name: name as DebilityName,
				state: state as DebilityState,
			};
		}
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
