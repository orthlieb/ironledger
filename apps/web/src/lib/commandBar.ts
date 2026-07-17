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
//   /move <name> [+<stat>]        → { kind: 'move', name, stat? }
//   /char <name>                  → { kind: 'char', name }
//   /foe <name>                   → { kind: 'foe', name }
// =============================================================================

export type Command =
	| { kind: 'note'; text: string }
	| { kind: 'help' }
	| { kind: 'oracle'; key: string }
	| { kind: 'move'; name: string; stat?: string }
	| { kind: 'char'; name: string }
	| { kind: 'foe'; name: string }
	| { kind: 'error'; message: string };

/** Set of leading slugs that route to slash-commands. Keep in sync with parseCommand. */
export const COMMAND_NAMES = ['note', 'help', 'oracle', 'move', 'char', 'foe'] as const;
export type CommandName = (typeof COMMAND_NAMES)[number];

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
		case 'move': {
			if (!args) return { kind: 'error', message: '/move needs a move name.' };
			// Split off an optional trailing +<stat> chunk.
			const statMatch = args.match(/\s\+(\w+)\s*$/);
			if (statMatch) {
				return {
					kind: 'move',
					name: args.slice(0, statMatch.index).trim(),
					stat: statMatch[1].toLowerCase(),
				};
			}
			return { kind: 'move', name: args };
		}
		case 'char':
			if (!args) return { kind: 'error', message: '/char needs a name.' };
			return { kind: 'char', name: args };
		case 'foe':
			if (!args) return { kind: 'error', message: '/foe needs a name.' };
			return { kind: 'foe', name: args };
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
