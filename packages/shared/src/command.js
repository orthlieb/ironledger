// @ts-check
/**
 * Command parser (docs/command-language.md → Commands)
 *
 *   /[owner.]value[operator]       show or change a value
 *   /verb free text                move, oracle, roll, note, burn, story, help
 *   plain text                     a note
 *
 * Syntax only: what a name means is the web app's resolver's business
 * (apps/web/src/lib/commands/resolve.ts). An unquoted name holds no dot and
 * no operator, so where a name ends is plain from the text; a name that holds
 * one is quoted: /"Wolf.Bane".progress++. The parse keeps where each part
 * starts, for typeahead, and never fails on a command still being typed: an
 * open quote or a lone `+` is reported, not refused.
 *
 * Plain JavaScript with JSDoc types so the content linter
 * (scripts/lint-dsl.mjs) can import it from source to check the commands in
 * content links; the web app gets it through `@ironledger/shared`.
 */

export const VERBS = /** @type {const} */ ([
  'move',
  'oracle',
  'roll',
  'note',
  'burn',
  'discard',
  'story',
  'help',
]);
/** @typedef {(typeof VERBS)[number]} Verb */

export const OPERATORS = /** @type {const} */ (['++', '--', '+=', '-=', '=', '!']);
/** @typedef {(typeof OPERATORS)[number]} Op */

/** The kinds a `kind:` qualifier names. */
export const QUALIFIER_KINDS = /** @type {const} */ ([
  'character',
  'foe',
  'journey',
  'site',
  'scene',
  'vow',
  'asset',
]);
/** @typedef {(typeof QUALIFIER_KINDS)[number]} QualifierKind */

/**
 * A name as written: its text (quotes taken off), and a `kind:` before it or
 * `#n` after it when there was one. `quoted`: in double quotes, so never a
 * keyword or a value's name. `open`: the quote isn't closed yet (still being
 * typed). `index`: `#n`, the n-th of that kind with that name, from 1.
 * `start` and `end`: where the part sits in the input.
 * @typedef {{ text: string, quoted: boolean, open?: boolean, qualifier?: QualifierKind, index?: number, start: number, end: number }} NamePart
 */

/**
 * A value command as parsed. `owner`: before the dot, absent with no dot.
 * `value`: after the dot, or the whole target with none (text "" while the
 * slot is empty). `partialOp`: a lone `+` or `-` at the end, an operator
 * half typed. `operand`: what follows the operator (trimmed; quotes off for
 * `=`). `operandQuoted`: `=` took a value in quotes (so `=""` is empty text,
 * not missing).
 * @typedef {{ kind: 'value', owner?: NamePart, value: NamePart, dot: boolean, op?: Op, opStart?: number, partialOp?: '+' | '-', operand?: string, operandQuoted?: boolean, operandStart?: number }} ValueCommand
 */

/**
 * @typedef {{ kind: 'empty' }
 *   | { kind: 'note', text: string }
 *   | { kind: 'verb', verb: Verb, arg: string, argStart: number }
 *   | ValueCommand
 *   | { kind: 'error', message: string, at: number }} Parsed
 */

/**
 * Collapse runs of space and lower the case: how names compare.
 * @param {string} s
 * @returns {string}
 */
export function normName(s) {
  return s.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Parse one name part, `raw` sitting at `offset` in the input.
 * @param {string} raw
 * @param {number} offset
 * @returns {NamePart | { error: string, at: number }}
 */
function namePart(raw, offset) {
  // Leading and trailing space are free.
  const lead = raw.length - raw.trimStart().length;
  let s = raw.trim();
  let start = offset + lead;
  const end = start + s.length;
  /** @type {QualifierKind | undefined} */
  let qualifier;
  const q = s.match(/^([a-z]+)\s*:\s*/i);
  if (q && /** @type {readonly string[]} */ (QUALIFIER_KINDS).includes(q[1].toLowerCase())) {
    qualifier = /** @type {QualifierKind} */ (q[1].toLowerCase());
    s = s.slice(q[0].length);
    start += q[0].length;
  }
  /** @type {number | undefined} */
  let index;
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
      s = m[1];
      index = Number(m[2]);
    }
  }
  if (s.includes('"')) return { error: 'A name in quotes starts with the quote.', at: start };
  return { text: s, quoted: false, qualifier, index, start, end };
}

/**
 * Where the operator starts in `body` (outside quotes), and which.
 * @param {string} body
 * @returns {{ op: Op, at: number } | { partial: '+' | '-', at: number } | null}
 */
function findOperator(body) {
  let inQuote = false;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
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

/**
 * Split `s` on dots outside quotes.
 * @param {string} s
 * @returns {{ part: string, at: number }[]}
 */
function splitDots(s) {
  /** @type {{ part: string, at: number }[]} */
  const out = [];
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

/**
 * Parse what's in the command bar, or a link's command.
 * @param {string} input
 * @returns {Parsed}
 */
export function parseCommand(input) {
  const lead = input.length - input.trimStart().length;
  const s = input.trim();
  if (!s) return { kind: 'empty' };
  if (!s.startsWith('/')) return { kind: 'note', text: s };

  const bodyAt = lead + 1;
  const body = input.slice(bodyAt);

  // A verb: its name, then a space or the end. Free text follows.
  const v = body.match(/^\s*([a-z]+)(?=\s|$)/i);
  if (v && /** @type {readonly string[]} */ (VERBS).includes(v[1].toLowerCase())) {
    const afterVerb = v[0].length;
    const restRaw = body.slice(afterVerb);
    const argLead = restRaw.length - restRaw.trimStart().length;
    return {
      kind: 'verb',
      verb: /** @type {Verb} */ (v[1].toLowerCase()),
      arg: restRaw.trim(),
      argStart: bodyAt + afterVerb + argLead,
    };
  }

  const found = findOperator(body);
  const targetText = found ? body.slice(0, found.at) : body;
  /** @type {Op | undefined} */
  let op;
  /** @type {number | undefined} */
  let opStart;
  /** @type {'+' | '-' | undefined} */
  let partialOp;
  /** @type {string | undefined} */
  let operand;
  /** @type {number | undefined} */
  let operandStart;
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
      at: bodyAt + parts[2].at - 1,
    };
  const named = parts.map((p) => namePart(p.part, bodyAt + p.at));
  for (const n of named) if ('error' in n) return { kind: 'error', message: n.error, at: n.at };
  const [first, second] = /** @type {NamePart[]} */ (named);
  return {
    kind: 'value',
    owner: second ? first : undefined,
    value: second ?? first,
    dot: !!second,
    op,
    opStart,
    partialOp,
    operand,
    operandStart,
    operandQuoted,
  };
}

/**
 * Write a name for a command: quoted when it holds a dot, an operator or a
 * quote, or reads as a keyword (`keyword` says whether it does).
 * @param {string} name
 * @param {boolean} [keyword]
 * @returns {string}
 */
export function quoteName(name, keyword = false) {
  if (keyword || /[.=!"]|\+\+|--|\+=|-=|^\s|\s$|[+-]$|#\d+$/.test(name) || name.includes(':'))
    return `"${name.replace(/"/g, '')}"`;
  return name;
}

// ---------------------------------------------------------------------------
// Operands
// ---------------------------------------------------------------------------

/**
 * An amount after `+=`, `-=` or `=`: a whole number, with a unit for a track
 * (`b` boxes, `t` ticks), or `harm`.
 * @typedef {{ kind: 'number', n: number, unit?: 'b' | 't' } | { kind: 'harm' } | { kind: 'bad', text: string }} Amount
 */

/**
 * @param {string} text
 * @param {boolean} [allowNegative]
 * @returns {Amount}
 */
export function parseAmount(text, allowNegative = false) {
  const t = text.trim().toLowerCase();
  if (t === 'harm') return { kind: 'harm' };
  const m = t.replace(/^[−–]/, '-').match(/^(-?)\s*(\d+)\s*([bt])?$/);
  if (!m || (m[1] && !allowNegative)) return { kind: 'bad', text };
  const n = Number(m[2]) * (m[1] ? -1 : 1);
  return { kind: 'number', n, unit: /** @type {'b' | 't' | undefined} */ (m[3]) ?? undefined };
}

// ---------------------------------------------------------------------------
// /roll
// ---------------------------------------------------------------------------

/** Die sides /roll takes (what the 3D dice draw). */
export const ROLL_DIE_SIDES = /** @type {const} */ ([4, 6, 8, 10, 12, 20, 100]);
/** @typedef {(typeof ROLL_DIE_SIDES)[number]} RollDieSides */
export const ROLL_MAX_N = 10;
export const ROLL_MAX_MODIFIER = 99;
export const ROLL_MAX_GROUPS = 4;

/**
 * One die term of /roll: `2d10`, `d100`, `1d6+2`.
 * @typedef {{ n: number, sides: RollDieSides, modifier: number, raw: string }} RollGroup
 */

/**
 * @param {string} raw
 * @returns {RollGroup | null}
 */
export function parseRollGroup(raw) {
  const m = raw.match(/^(?<n>\d+)?d(?<sides>\d+)(?<mod>[+-]\d+)?$/i);
  if (!m || !m.groups) return null;
  const n = m.groups.n === undefined ? 1 : parseInt(m.groups.n, 10);
  const sides = parseInt(m.groups.sides, 10);
  const modifier = m.groups.mod ? parseInt(m.groups.mod, 10) : 0;
  if (!Number.isFinite(n) || n < 1 || n > ROLL_MAX_N) return null;
  if (!(/** @type {readonly number[]} */ (ROLL_DIE_SIDES).includes(sides))) return null;
  if (Math.abs(modifier) > ROLL_MAX_MODIFIER) return null;
  return { n, sides: /** @type {RollDieSides} */ (sides), modifier, raw };
}

/**
 * /roll's dice, or why they don't parse.
 * @param {string} arg
 * @returns {RollGroup[] | { error: string }}
 */
export function parseRoll(arg) {
  if (!arg) return { error: 'Needs dice: /roll 2d10 1d6+2' };
  const raws = arg.split(/\s+/).filter(Boolean);
  if (raws.length > ROLL_MAX_GROUPS) return { error: `At most ${ROLL_MAX_GROUPS} groups of dice.` };
  /** @type {RollGroup[]} */
  const groups = [];
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

// ---------------------------------------------------------------------------
// The built-in values, by owner — what a content link may name
// ---------------------------------------------------------------------------

/**
 * The kinds of value: a number, true/false, a list, text, a progress track,
 * a count (read-only).
 * @typedef {'number' | 'bool' | 'list' | 'text' | 'track' | 'count'} BuiltinKind
 */

/**
 * The built-in values each owner has, by key, with their kind and (lists)
 * options. Content packs add fields to characters and assets on top. The web
 * app's value registry (commands/values.ts) builds the same keys; a unit test
 * keeps the two in step. The content linter checks a link's value against
 * this.
 * @type {Record<'character' | 'foe' | 'journey' | 'site' | 'scene' | 'vow', Record<string, { kind: BuiltinKind, options?: readonly string[] }>>}
 */
export const BUILTIN_VALUES = {
  character: {
    momentum: { kind: 'number' },
    health: { kind: 'number' },
    spirit: { kind: 'number' },
    supply: { kind: 'number' },
    xp: { kind: 'number' },
    edge: { kind: 'number' },
    heart: { kind: 'number' },
    iron: { kind: 'number' },
    shadow: { kind: 'number' },
    wits: { kind: 'number' },
    bonds: { kind: 'track' },
    failures: { kind: 'track' },
    wounded: { kind: 'bool' },
    shaken: { kind: 'bool' },
    unprepared: { kind: 'bool' },
    encumbered: { kind: 'bool' },
    maimed: { kind: 'bool' },
    corrupted: { kind: 'bool' },
    cursed: { kind: 'bool' },
    tormented: { kind: 'bool' },
    initiative: { kind: 'list', options: ['none', 'me', 'foe'] },
    vowCount: { kind: 'count' },
    assetCount: { kind: 'count' },
    companionCount: { kind: 'count' },
    rarityCount: { kind: 'count' },
  },
  foe: { progress: { kind: 'track' }, vanquished: { kind: 'bool' } },
  journey: { progress: { kind: 'track' }, complete: { kind: 'bool' } },
  site: {
    progress: { kind: 'track' },
    complete: { kind: 'bool' },
    theme: {
      kind: 'list',
      options: [
        'ancient',
        'corrupted',
        'fortified',
        'hallowed',
        'haunted',
        'infested',
        'ravaged',
        'wild',
      ],
    },
    domain: {
      kind: 'list',
      options: [
        'barrow',
        'cavern',
        'frozen cavern',
        'icereach',
        'mine',
        'pass',
        'ruin',
        'sea cave',
        'shadowfen',
        'stronghold',
        'tanglewood',
        'underkeep',
      ],
    },
  },
  scene: { progress: { kind: 'track' }, complete: { kind: 'bool' }, countdown: { kind: 'number' } },
  vow: {
    progress: { kind: 'track' },
    menace: { kind: 'number' },
    status: { kind: 'list', options: ['active', 'fulfilled', 'forsaken'] },
  },
};

/** Keywords a content link names an owner by: the active one of a kind
 *  (`me` is the active character, as `character` is), what a move or link
 *  chose (vow, companion) or belongs to (self), or a
 *  group, each changed alike: every companion of the character (companions),
 *  every other character (allies), the character and every ally (everyone). */
export const OWNER_KEYWORDS = /** @type {const} */ ([
  'character',
  'foe',
  'journey',
  'site',
  'scene',
  'vow',
  'companion',
  'companions',
  'allies',
  'everyone',
  'me',
  'self',
]);

/** Verbs a link may run: anything else (note, story, help, roll) is the
 *  command bar's. */
export const LINK_VERBS = /** @type {const} */ (['move', 'oracle', 'burn', 'discard']);
