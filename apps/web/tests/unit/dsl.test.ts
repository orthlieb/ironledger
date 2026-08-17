/**
 * dsl.test.ts — the markdown + interactive-link DSL (`$lib/dsl.ts`).
 *
 * Pins the three behaviours the whole migration leans on:
 *   • parseDslHref  — lenient query parsing (`+` stays literal, not a space)
 *   • dslActionLink — every scheme → the EXACT interactive HTML the app's click
 *                     handlers match on, with `class` emitted first
 *   • renderRich    — protect DSL → renderNote formatting → restore, so link
 *                     HTML is never escaped and `&` between args never appears
 *
 * @vitest-environment node
 */
import { describe, it, expect, vi } from 'vitest';
import {
	parseDslHref,
	dslActionLink,
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

describe('dslActionLink', () => {
	const link = (href: string, label = 'X') => dslActionLink(label, parseDslHref(href));

	it('emits class first (so enrichOutcomeLinks regex matches)', () => {
		expect(link('resource:momentum?value=+1')).toMatch(/^<a class="resource-link"/);
	});

	it('maps every scheme to the exact interactive HTML', () => {
		expect(link('move:heal', 'Heal')).toBe('<a class="move-link" data-id="move/heal">Heal</a>');
		expect(link('move:endure-harm?harm=1', 'Endure Harm')).toBe(
			'<a class="move-link" data-id="move/endure-harm" data-harm="1">Endure Harm</a>',
		);
		expect(link('resource:momentum?value=+1')).toBe(
			'<a class="resource-link" data-resource="momentum" data-value="+1">X</a>',
		);
		expect(link('progress:journey?value=1')).toBe(
			'<a class="progress-link" data-track="journey" data-value="1">X</a>',
		);
		expect(link('debility:wounded?value=0')).toBe(
			'<a class="debility-link" data-debility="wounded" data-value="0">X</a>',
		);
		expect(link('initiative:foe')).toBe('<a class="initiative-link" data-value="foe">X</a>');
		expect(link('oracle:endureExtremeHarm')).toBe(
			'<a class="oracle-link" data-oracle="endureExtremeHarm">X</a>',
		);
		expect(link('reset:failures')).toBe('<a class="reset-track-link" data-track="failures">X</a>');
		expect(link('harm:health')).toBe('<a class="harm-link" data-resource="health">X</a>');
		expect(link('menace:2')).toBe('<a class="menace-link" data-value="2">X</a>');
		expect(link('vanquish', 'vanquish it')).toBe('<a class="vanquish-foe-link">vanquish it</a>');
	});

	it('returns null for a scheme it does not own (roll: is the oracle renderer)', () => {
		expect(link('roll:self?times=2')).toBeNull();
		expect(link('bogus:1')).toBeNull();
	});

	it('escapes the label', () => {
		expect(link('move:heal', 'a<b>&c')).toBe(
			'<a class="move-link" data-id="move/heal">a&lt;b&gt;&amp;c</a>',
		);
	});
});

describe('renderRich', () => {
	it('renders a link + list combo without escaping the link HTML', () => {
		const md =
			'Make note, [mark a tick](resource:bonds?value=+1) and choose one:\n' +
			'- Take [+1 spirit](resource:spirit?value=+1).\n' +
			'- Take [+2 momentum](resource:momentum?value=+2).';
		const html = renderRich(md);
		expect(html).toBe(
			'<p>Make note, <a class="resource-link" data-resource="bonds" data-value="+1">mark a tick</a> and choose one:</p>' +
				'<ul>' +
				'<li>Take <a class="resource-link" data-resource="spirit" data-value="+1">+1 spirit</a>.</li>' +
				'<li>Take <a class="resource-link" data-resource="momentum" data-value="+2">+2 momentum</a>.</li>' +
				'</ul>',
		);
	});

	it('applies markdown emphasis and the log-only span', () => {
		expect(renderRich('roll **+heart**.')).toBe('<p>roll <strong>+heart</strong>.</p>');
		expect(renderRich('[Momentum resets.]{.log-only}')).toBe(
			'<p><span class="log-only">Momentum resets.</span></p>',
		);
	});

	it('leaves an unknown-scheme link as literal text (dslActionLink returned null)', () => {
		// renderNote has no link syntax, so the bracket text survives verbatim.
		expect(renderRich('see [x](bogus:1)')).toContain('[x](bogus:1)');
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
		expect(renderRich('- **[Heal](move:heal) now**')).toBe(
			'<ul><li><strong><a class="move-link" data-id="move/heal">Heal</a> now</strong></li></ul>',
		);
	});

	it('renders a {.class} span that WRAPS a link (nested brackets, looped restore)', () => {
		// The outer log-only span's `[` must not be swallowed into the inner
		// resource-link label, and the inner link must survive the restore.
		const md = '[Take [+1 momentum](resource:momentum?value=+1) now.]{.log-only}';
		expect(renderRich(md)).toBe(
			'<p><span class="log-only">Take ' +
				'<a class="resource-link" data-resource="momentum" data-value="+1">+1 momentum</a>' +
				' now.</span></p>',
		);
	});

	it('renders adjacent dialog-only / log-only spans wrapping links', () => {
		const md =
			'[As above, but [+1 spirit](resource:spirit?value=+1).]{.dialog-only}' +
			'[Plain [+2 supply](resource:supply?value=+2).]{.log-only}';
		expect(renderRich(md)).toBe(
			'<p><span class="dialog-only">As above, but ' +
				'<a class="resource-link" data-resource="spirit" data-value="+1">+1 spirit</a>.</span>' +
				'<span class="log-only">Plain ' +
				'<a class="resource-link" data-resource="supply" data-value="+2">+2 supply</a>.</span></p>',
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
