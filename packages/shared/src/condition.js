// @ts-check
/**
 * Condition expressions — when a move can be made, an asset taken, a field
 * shown (docs/command-language.md → Conditions).
 *
 *   character & foe & initiative == me
 *   touched >= prime
 *   companion/hawk | companion/raven
 *   !wounded & (mana >= 2 | self.health >= 1)
 *   bonds >= 2b
 *
 * Plain JavaScript with JSDoc types so the build-time content checker
 * (scripts/gen-extensions-manifest.mjs) can import it from source, before
 * the package is built; the web app gets it through `@ironledger/shared`.
 *
 * This module only parses and evaluates. What a name means (a debility, a
 * field, an owned asset, the active foe) is the caller's: it hands
 * evaluateCondition a `read` function that returns a Reading for each test.
 */

/** @typedef {'==' | '!=' | '>=' | '<=' | '>' | '<'} CompareOp */

/**
 * The right-hand side of a comparison: a whole number, on a track with an
 * optional unit (`b` boxes, `t` ticks; none counts marks by the track's
 * rank), or a word (a list option, such as `prime` or `foe`).
 * @typedef {{ kind: 'number', n: number, unit: '' | 't' | 'b' } | { kind: 'word', word: string }} Level
 */

/**
 * One test: `owner.name`, optionally compared with a level. `at` is its
 * position in the source, for error messages.
 * @typedef {{ type: 'test', owner: string | null, name: string, op: CompareOp | null, level: Level | null, at: number }} TestNode
 */

/**
 * @typedef {{ type: 'or', items: CondNode[] }
 *   | { type: 'and', items: CondNode[] }
 *   | { type: 'not', item: CondNode }
 *   | TestNode} CondNode
 */

/** @typedef {{ ok: true, node: CondNode } | { ok: false, error: string, at: number }} ParseResult */

/**
 * What a test reads, from the caller.
 *  - `number`: a count or a stat; `value` is the number.
 *  - `bool`: a debility, a switch; 0 or 1.
 *  - `exists`: an owned asset, an active foe; 0 or 1.
 *  - `list`: a dropdown, a radio, `initiative`; `value` is the chosen
 *    option's position from 0, −1 for none; `option(word)` gives a word's
 *    position, −1 if it isn't an option.
 *  - `text`: a line of text; `value` is its length.
 *  - `track`: progress, bonds, failures; `value` in ticks; `ticksPerMark`
 *    is what a plain number counts (the track's rank; 1 with none).
 * @typedef {object} Reading
 * @property {'number' | 'bool' | 'exists' | 'list' | 'text' | 'track'} kind
 * @property {number} value
 * @property {number} [ticksPerMark]
 * @property {(word: string) => number} [option]
 */

/** A name: an id (`touched`, `companion/hawk`, `companion-name`) or a keyword. */
const NAME = /^[A-Za-z_][A-Za-z0-9_\-/]*/;
/** A whole number, optionally negative, with an optional unit. */
const NUMBER = /^-?\d+(?:[tb](?![A-Za-z0-9_\-/]))?/;

/**
 * @typedef {{ kind: 'name' | 'number' | 'op' | 'punct', text: string, at: number }} Token
 */

/**
 * @param {string} src
 * @returns {{ ok: true, tokens: Token[] } | { ok: false, error: string, at: number }}
 */
function tokenize(src) {
  /** @type {Token[]} */
  const tokens = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\n') {
      i++;
      continue;
    }
    const rest = src.slice(i);
    const two = rest.slice(0, 2);
    if (two === '==' || two === '!=' || two === '>=' || two === '<=') {
      tokens.push({ kind: 'op', text: two, at: i });
      i += 2;
      continue;
    }
    if (c === '>' || c === '<') {
      tokens.push({ kind: 'op', text: c, at: i });
      i++;
      continue;
    }
    if ('()&|!.'.includes(c)) {
      tokens.push({ kind: 'punct', text: c, at: i });
      i++;
      continue;
    }
    const num = NUMBER.exec(rest);
    if (num) {
      tokens.push({ kind: 'number', text: num[0], at: i });
      i += num[0].length;
      continue;
    }
    const name = NAME.exec(rest);
    if (name) {
      tokens.push({ kind: 'name', text: name[0], at: i });
      i += name[0].length;
      continue;
    }
    return { ok: false, error: `Unexpected "${c}"`, at: i };
  }
  return { ok: true, tokens };
}

/**
 * Parse a condition. Comparisons bind tightest, then `!`, then `&`, then
 * `|`; parentheses group. `!` negates the test or group after it, so
 * `!touched >= prime` is "not (touched >= prime)".
 * @param {string} src
 * @returns {ParseResult}
 */
export function parseCondition(src) {
  if (typeof src !== 'string' || !src.trim()) return { ok: false, error: 'Empty condition', at: 0 };
  const lexed = tokenize(src);
  if (!lexed.ok) return lexed;
  const tokens = lexed.tokens;
  let pos = 0;
  const peek = () => tokens[pos];
  const end = () => src.length;
  /** @param {string} msg @param {number} [at] */
  const fail = (msg, at) => {
    throw { error: msg, at: at ?? peek()?.at ?? end() };
  };
  /** @param {string} text */
  const isPunct = (text) => peek()?.kind === 'punct' && peek()?.text === text;

  /** @returns {CondNode} */
  const parseOr = () => {
    const items = [parseAnd()];
    while (isPunct('|')) {
      pos++;
      items.push(parseAnd());
    }
    return items.length === 1 ? items[0] : { type: 'or', items };
  };
  /** @returns {CondNode} */
  const parseAnd = () => {
    const items = [parseNot()];
    while (isPunct('&')) {
      pos++;
      items.push(parseNot());
    }
    return items.length === 1 ? items[0] : { type: 'and', items };
  };
  /** @returns {CondNode} */
  const parseNot = () => {
    if (isPunct('!')) {
      pos++;
      return { type: 'not', item: parseNot() };
    }
    return parsePrimary();
  };
  /** @returns {CondNode} */
  const parsePrimary = () => {
    if (isPunct('(')) {
      pos++;
      const inner = parseOr();
      if (!isPunct(')')) fail('Expected ")"');
      pos++;
      return inner;
    }
    return parseTest();
  };
  /** @returns {TestNode} */
  const parseTest = () => {
    const first = peek();
    if (!first || first.kind !== 'name')
      fail(first ? `Expected a name, found "${first.text}"` : 'Expected a name');
    const at = /** @type {Token} */ (first).at;
    pos++;
    /** @type {string | null} */
    let owner = null;
    let name = /** @type {Token} */ (first).text;
    if (isPunct('.')) {
      pos++;
      const second = peek();
      if (!second || second.kind !== 'name') fail('Expected a value after "."');
      owner = name;
      name = /** @type {Token} */ (second).text;
      pos++;
    }
    /** @type {CompareOp | null} */
    let op = null;
    /** @type {Level | null} */
    let level = null;
    const next = peek();
    if (next?.kind === 'op') {
      op = /** @type {CompareOp} */ (next.text);
      pos++;
      const lv = peek();
      if (!lv) fail(`Expected a number or a word after "${op}"`);
      else if (lv.kind === 'number') {
        const unit = /[tb]$/.test(lv.text) ? /** @type {'t' | 'b'} */ (lv.text.slice(-1)) : '';
        level = { kind: 'number', n: Number(unit ? lv.text.slice(0, -1) : lv.text), unit };
        pos++;
      } else if (lv.kind === 'name') {
        level = { kind: 'word', word: lv.text };
        pos++;
      } else fail(`Expected a number or a word after "${op}"`);
    }
    return { type: 'test', owner, name, op, level, at };
  };

  try {
    const node = parseOr();
    if (pos < tokens.length) {
      const t = tokens[pos];
      return { ok: false, error: `Unexpected "${t.text}"`, at: t.at };
    }
    return { ok: true, node };
  } catch (e) {
    const err = /** @type {{ error: string, at: number }} */ (e);
    return { ok: false, error: err.error, at: err.at };
  }
}

/**
 * Every test in a condition, in source order: for checking that each name
 * exists and each comparison fits what it reads.
 * @param {CondNode} node
 * @returns {TestNode[]}
 */
export function conditionTests(node) {
  if (node.type === 'test') return [node];
  if (node.type === 'not') return conditionTests(node.item);
  return node.items.flatMap(conditionTests);
}

/**
 * A level as a number for a reading, or null when it doesn't fit (a word on
 * a number, a unit off a track, a word that isn't one of a list's options).
 * @param {Level} level
 * @param {Reading} reading
 * @returns {number | null}
 */
export function levelValue(level, reading) {
  if (level.kind === 'word') {
    if (reading.kind !== 'list' || !reading.option) return null;
    const i = reading.option(level.word);
    return i < 0 ? null : i;
  }
  if (reading.kind === 'track') {
    if (level.unit === 'b') return level.n * 4;
    if (level.unit === 't') return level.n;
    return level.n * (reading.ticksPerMark ?? 1);
  }
  if (level.unit) return null;
  if (reading.kind === 'list' || reading.kind === 'text') return null;
  return level.n;
}

/**
 * @param {number} a
 * @param {CompareOp} op
 * @param {number} b
 */
export function compare(a, op, b) {
  switch (op) {
    case '==':
      return a === b;
    case '!=':
      return a !== b;
    case '>=':
      return a >= b;
    case '<=':
      return a <= b;
    case '>':
      return a > b;
    case '<':
      return a < b;
  }
}

/**
 * A reading named on its own: true when it's above 0, chosen, or exists.
 * @param {Reading} reading
 */
export function truthy(reading) {
  return reading.kind === 'list' ? reading.value >= 0 : reading.value > 0;
}

/**
 * Whether one test holds. A comparison whose level doesn't fit the reading
 * fails (the content checker rejects those at build time).
 * @param {TestNode} test
 * @param {Reading} reading
 */
export function testHolds(test, reading) {
  if (!test.op || !test.level) return truthy(reading);
  const b = levelValue(test.level, reading);
  return b !== null && compare(reading.value, test.op, b);
}

/**
 * Evaluate a parsed condition.
 * @param {CondNode} node
 * @param {(test: TestNode) => Reading} read
 * @returns {boolean}
 */
export function evaluateCondition(node, read) {
  switch (node.type) {
    case 'or':
      return node.items.some((n) => evaluateCondition(n, read));
    case 'and':
      return node.items.every((n) => evaluateCondition(n, read));
    case 'not':
      return !evaluateCondition(node.item, read);
    case 'test':
      return testHolds(node, read(node));
  }
}
