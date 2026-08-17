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
import { describe, it, expect } from 'vitest';
import { parseDslHref, dslActionLink, renderRich } from '../../src/lib/dsl.js';

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
});
