/**
 * dsl.test.ts — the markdown + interactive-link DSL (`#lib/dsl.ts`).
 *
 * Pins the three behaviours the whole migration leans on:
 *   • parseDslHref  — lenient query parsing (`+` stays literal, not a space)
 *   • dslLink       — a `/command` target → a command link, `class` first; any
 *                     other target (a `roll:` blank, an old scheme) left alone
 *   • renderRich    — protect DSL → renderNote formatting → restore, so link
 *                     HTML is never escaped and `&` between args never appears
 *
 * @vitest-environment node
 */
import { describe, it, expect, vi } from 'vitest';
import {
	parseDslHref,
	dslLink,
	renderRich,
	parseRollSpec,
	pillBadge,
	linkifyTemplate,
	fillTemplate,
	hasRollTemplate,
	type RollFn,
} from '../../src/lib/dsl.js';

describe('parseDslHref', () => {
	it('splits scheme / path with no query', () => {
		expect(parseDslHref('move:heal')).toEqual({ scheme: 'move', path: 'heal', args: {} });
	});

	it('keeps `+` literal in a value (does NOT decode to space)', () => {
		expect(parseDslHref('resource:momentum?value=+1').args.value).toBe('+1');
		expect(parseDslHref('resource:health?value=-2').args.value).toBe('-2');
	});

	it('parses multiple `&`-separated args', () => {
		expect(parseDslHref('roll:x?rollFrom=1&rollTo=3').args).toEqual({ rollFrom: '1', rollTo: '3' });
	});

	it('handles a valueless flag and a schemeless / pathless token', () => {
		expect(parseDslHref('x:y?flag').args).toEqual({ flag: '' });
		expect(parseDslHref('vanquish')).toEqual({ scheme: 'vanquish', path: '', args: {} });
	});
});

describe('dslLink', () => {
	it('renders a command target as a command link, class first', () => {
		expect(dslLink('+1 momentum', '/momentum++')).toBe(
			'<a class="cmd-link" data-cmd="/momentum++">+1 momentum</a>',
		);
		expect(dslLink('Endure Harm', '/move endure-harm 1')).toBe(
			'<a class="cmd-link" data-cmd="/move endure-harm 1" data-verb="move">Endure Harm</a>',
		);
		expect(dslLink('mark progress', '/foe.progress+=2')).toBe(
			'<a class="cmd-link" data-cmd="/foe.progress+=2">mark progress</a>',
		);
	});

	it('returns null for anything else: a roll: blank, an old scheme', () => {
		expect(dslLink('again', 'roll:self?times=2')).toBeNull();
		expect(dslLink('X', 'resource:momentum?value=+1')).toBeNull();
	});

	it('escapes the label and the command', () => {
		expect(dslLink('a<b>&c', '/hawk.name="A&B"')).toBe(
			'<a class="cmd-link" data-cmd="/hawk.name=&quot;A&amp;B&quot;">a&lt;b&gt;&amp;c</a>',
		);
	});
});

describe('renderRich', () => {
	it('renders a link + list combo without escaping the link HTML', () => {
		const md =
			'Make note, [mark a tick](/bonds++) and choose one:\n' +
			'- Take [+1 spirit](/spirit++).\n' +
			'- Take [+2 momentum](/momentum+=2).';
		const html = renderRich(md);
		expect(html).toBe(
			'<p>Make note, <a class="cmd-link" data-cmd="/bonds++">mark a tick</a> and choose one:</p>' +
				'<ul>' +
				'<li>Take <a class="cmd-link" data-cmd="/spirit++">+1 spirit</a>.</li>' +
				'<li>Take <a class="cmd-link" data-cmd="/momentum+=2">+2 momentum</a>.</li>' +
				'</ul>',
		);
	});

	it('applies markdown emphasis and the log-only span', () => {
		expect(renderRich('roll **+heart**.')).toBe('<p>roll <strong>+heart</strong>.</p>');
		expect(renderRich('[Momentum resets.]{.log-only}')).toBe(
			'<p><span class="log-only">Momentum resets.</span></p>',
		);
	});

	it('leaves an old-scheme link as literal text (dslLink returned null)', () => {
		// renderNote has no link syntax, so the bracket text survives verbatim.
		expect(renderRich('see [x](resource:momentum?value=+1)')).toContain(
			'[x](resource:momentum?value=+1)',
		);
	});

	it('is empty for empty input', () => {
		expect(renderRich('')).toBe('');
		expect(renderRich(undefined)).toBe('');
	});

	it('renders the dialog-only span', () => {
		expect(renderRich('[Only in the sheet.]{.dialog-only}')).toBe(
			'<p><span class="dialog-only">Only in the sheet.</span></p>',
		);
	});

	it('leaves an unknown span class as literal text', () => {
		expect(renderRich('[nope]{.bogus-class}')).toContain('[nope]{.bogus-class}');
	});

	it('renders an ordered list', () => {
		expect(renderRich('1. first\n2. second')).toBe('<ol><li>first</li><li>second</li></ol>');
	});

	it('keeps separate paragraphs across a blank line', () => {
		expect(renderRich('One.\n\nTwo.')).toBe('<p>One.</p><br><p>Two.</p>');
	});

	it('protects a link nested inside a bold list item (no escaping, emphasis applied)', () => {
		expect(renderRich('- **[Heal](/move heal) now**')).toBe(
			'<ul><li><strong><a class="cmd-link" data-cmd="/move heal" data-verb="move">Heal</a> now</strong></li></ul>',
		);
	});

	it('renders a {.class} span that WRAPS a link (nested brackets, looped restore)', () => {
		// The outer log-only span's `[` must not be swallowed into the inner
		// resource-link label, and the inner link must survive the restore.
		const md = '[Take [+1 momentum](/momentum++) now.]{.log-only}';
		expect(renderRich(md)).toBe(
			'<p><span class="log-only">Take ' +
				'<a class="cmd-link" data-cmd="/momentum++">+1 momentum</a>' +
				' now.</span></p>',
		);
	});

	it('renders adjacent dialog-only / log-only spans wrapping links', () => {
		const md =
			'[As above, but [+1 spirit](/spirit++).]{.dialog-only}' +
			'[Plain [+2 supply](/supply+=2).]{.log-only}';
		expect(renderRich(md)).toBe(
			'<p><span class="dialog-only">As above, but ' +
				'<a class="cmd-link" data-cmd="/spirit++">+1 spirit</a>.</span>' +
				'<span class="log-only">Plain ' +
				'<a class="cmd-link" data-cmd="/supply+=2">+2 supply</a>.</span></p>',
		);
	});

	it('applies emphasis inside a span', () => {
		expect(renderRich('[Choose **one** from the list above.]{.dialog-only}')).toBe(
			'<p><span class="dialog-only">Choose <strong>one</strong> from the list above.</span></p>',
		);
	});

	it('renders a span across lines as a block of its own, after the paragraph (Make Camp)', () => {
		const md =
			'[Choose **one** from the list above.]{.dialog-only}' +
			'[Choose **one**:\n- Relax: Take [+1 spirit](/spirit++).\n- Focus: Take +1 momentum.]{.log-only}';
		expect(renderRich(md)).toBe(
			'<p><span class="dialog-only">Choose <strong>one</strong> from the list above.</span></p>' +
				'<div class="log-only"><p>Choose <strong>one</strong>:</p><ul>' +
				'<li>Relax: Take <a class="cmd-link" data-cmd="/spirit++">+1 spirit</a>.</li>' +
				'<li>Focus: Take +1 momentum.</li></ul></div>',
		);
	});

	it('splits the paragraph round a block span written mid-line (Sojourn)', () => {
		expect(renderRich('Choose one.[\n**Mend**\n- Clear it.]{.log-only} Then rest.')).toBe(
			'<p>Choose one.</p>' +
				'<div class="log-only"><p><strong>Mend</strong></p><ul><li>Clear it.</li></ul></div>' +
				'<p> Then rest.</p>',
		);
	});
});

// ── Oracle roll: templates ───────────────────────────────────────────────────

describe('hasRollTemplate', () => {
	it('detects a roll: blank, ignores plain text and other schemes', () => {
		expect(hasRollTemplate('Roll [again](roll:self?times=2)')).toBe(true);
		expect(hasRollTemplate('plain value')).toBe(false);
		expect(hasRollTemplate('see [x](move:heal)')).toBe(false);
	});
});

describe('parseRollSpec', () => {
	it('resolves self to the current key, with dash + no dedupe', () => {
		expect(parseRollSpec('self?times=2', 'monstrosity')).toEqual({
			refKey: 'monstrosity',
			count: 2,
			dash: true,
			isSelf: true,
			note: '',
		});
	});

	it('resolves a named ref with a single fixed roll (no dash)', () => {
		expect(parseRollSpec('siteName', 'delveSite')).toEqual({
			refKey: 'siteName',
			count: 1,
			dash: false,
			isSelf: false,
			note: '',
		});
	});

	it('equal rollFrom/rollTo is a fixed count with no random and no note', () => {
		expect(parseRollSpec('primaryForm?rollFrom=2&rollTo=2', 'x')).toEqual({
			refKey: 'primaryForm',
			count: 2,
			dash: true,
			isSelf: false,
			note: '',
		});
	});

	it('a real range rolls within [lo,hi] and reports a d-notation note', () => {
		const rnd = vi.spyOn(Math, 'random').mockReturnValue(0.5); // 1 + floor(.5*3) = 2
		try {
			const spec = parseRollSpec('abilities?rollFrom=1&rollTo=3', 'x');
			expect(spec.count).toBe(2);
			expect(spec.dash).toBe(true);
			expect(spec.note).toBe('d3 → 2');
		} finally {
			rnd.mockRestore();
		}
	});
});

describe('pillBadge', () => {
	it('shows the count for times>1, nothing for times<=1', () => {
		expect(pillBadge('self?times=2')).toBe('2');
		expect(pillBadge('self?times=1')).toBe('');
		expect(pillBadge('siteName')).toBe('');
	});

	it('shows a range or a single number for rollFrom/rollTo', () => {
		expect(pillBadge('x?rollFrom=1&rollTo=3')).toBe('1–3');
		expect(pillBadge('x?rollFrom=2&rollTo=2')).toBe('2');
	});
});

describe('linkifyTemplate', () => {
	it('renders a plain ref as a bare pill', () => {
		expect(linkifyTemplate('[Site Name](roll:siteName)')).toBe(
			'<span class="oracle-ref">Site Name</span>',
		);
	});

	it('appends a ×badge when the spec repeats', () => {
		expect(linkifyTemplate('[Roll again](roll:self?times=2)')).toBe(
			'<span class="oracle-ref">Roll again</span><span class="oracle-ref-rep">×2</span>',
		);
	});
});

describe('fillTemplate', () => {
	/** A deterministic RollFn: each key yields a fixed cycle of values. */
	const cyclingRoll = (values: Record<string, string[]>): RollFn => {
		const idx: Record<string, number> = {};
		return (key) => {
			const list = values[key] ?? [`${key}?`];
			const i = idx[key] ?? 0;
			idx[key] = i + 1;
			return { roll: 10 + i, value: list[i % list.length] };
		};
	};

	it('rolls self twice with NO dedupe (Roll Twice mechanic keeps repeats)', () => {
		const roll = cyclingRoll({ omen: ['Dreadful omens', 'Dreadful omens'] });
		const { filled, lines } = fillTemplate('[Roll again](roll:self?times=2)', 'omen', roll, 0);
		expect(filled).toBe('Dreadful omens, Dreadful omens');
		expect(lines).toHaveLength(2);
		expect(lines[0]).toContain('<strong>Dreadful omens</strong>');
	});

	it('dedupes a named ref when the same value comes up twice', () => {
		const roll = cyclingRoll({ trait: ['Bold', 'Bold', 'Sly'] });
		const { filled, lines } = fillTemplate('[Trait](roll:trait?times=3)', 'x', roll, 0);
		expect(filled).toBe('Bold, Sly');
		expect(lines).toHaveLength(2);
	});

	it('composes a phrase from several distinct named refs', () => {
		const roll = cyclingRoll({ prefix: ['Hollow'], suffix: ['Morraine'] });
		const { filled } = fillTemplate(
			'[Prefix](roll:prefix) of [Suffix](roll:suffix)',
			'siteName',
			roll,
			0,
		);
		expect(filled).toBe('Hollow of Morraine');
	});

	it('falls back to a [key] placeholder when the ref yields an empty value', () => {
		const roll: RollFn = () => ({ roll: 7, value: '' });
		const { filled } = fillTemplate('[X](roll:missing)', 'x', roll, 0);
		expect(filled).toBe('[missing]');
	});

	it('stops recursing at depth 5 (guard)', () => {
		const roll: RollFn = () => ({ roll: 1, value: 'v' });
		const { filled, lines } = fillTemplate('[X](roll:self?times=2)', 'loop', roll, 5);
		expect(filled).toBe('');
		expect(lines).toHaveLength(0);
	});
});
