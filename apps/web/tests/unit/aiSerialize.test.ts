/**
 * aiSerialize.test.ts
 *
 * Unit tests for the AI-prose log serializer. Covers the two invariants
 * from the design: log is stored newest-first (reverse before sending),
 * and unstruck action-link choices are dropped (kept: struck items and
 * plain-narrative bullets).
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { Window } from 'happy-dom';
import type { LogEntry } from '../../src/lib/log.svelte.js';
import {
	entryBodyToPrompt,
	serializeLogSection,
	estimateTokens,
	buildStoryPreface,
	castSummary,
	type PrefaceCharacter,
	type PrefaceFoe,
	type PrefaceExpedition,
} from '../../src/lib/aiSerialize.js';

const CHAR: PrefaceCharacter = {
	name: 'Beepalache',
	background: 'A wary tinker of the Deep Wilds.',
};
const FOE: PrefaceFoe = {
	name: 'Blood Thorn',
	nature: 'anomaly',
	rank: 2,
	description: 'A writhing mass of crimson brambles.',
	notes: 'Guards the shattered spire.',
};
const JOURNEY: PrefaceExpedition = {
	name: 'The Long Road North',
	kind: 'journey',
	difficulty: 'dangerous',
	notes: 'Snowbound passes and bandit tolls.',
};
const SITE: PrefaceExpedition = {
	name: 'Blackroot Barrow',
	kind: 'site',
	difficulty: 'formidable',
	theme: 'Ancient',
	domain: 'Barrow',
	objective: 'Recover the sunstone.',
	notes: 'Cold stone and older silence.',
};

let doc: Document;

beforeAll(() => {
	const window = new Window();
	doc = window.document as unknown as Document;
});

/** Minimal LogEntry factory. `ts` is deterministic so title lines match. */
function entry(title: string, html: string, tsIso = '2026-07-08T12:00:00Z'): LogEntry {
	return { id: `id-${title}`, title, html, ts: tsIso };
}

describe('entryBodyToPrompt', () => {
	it('flattens a simple <div> body', () => {
		const html = '<div>The wind was cold on the ridge.</div>';
		expect(entryBodyToPrompt(html, doc)).toBe('The wind was cold on the ridge.');
	});

	it('drops <li> items with an unstruck action link', () => {
		const html = `
			<div class="move-outcome">
				<strong>Weak Hit</strong>
				<ul>
					<li><a class="resource-link" data-resource="momentum" data-value="+1">+1 momentum</a></li>
					<li><a class="resource-link" data-resource="supply" data-value="-1">-1 supply</a></li>
				</ul>
			</div>
		`;
		const out = entryBodyToPrompt(html, doc);
		// Neither choice was taken → the <li> lines vanish; only the outcome tag remains.
		expect(out).toContain('Weak Hit');
		expect(out).not.toContain('+1 momentum');
		expect(out).not.toContain('-1 supply');
	});

	it('keeps <li> items whose link was clicked (converted to <s class="resource-spent">)', () => {
		const html = `
			<div class="move-outcome">
				<strong>Weak Hit</strong>
				<ul>
					<li><s class="resource-spent">+1 momentum</s></li>
					<li><a class="resource-link" data-resource="supply" data-value="-1">-1 supply</a></li>
				</ul>
			</div>
		`;
		const out = entryBodyToPrompt(html, doc);
		expect(out).toContain('+1 momentum');
		expect(out).not.toContain('-1 supply');
	});

	it('keeps plain-narrative <li> items (no action link)', () => {
		const html = `
			<ul>
				<li>Introduce a new twist.</li>
				<li>Reveal a hidden threat.</li>
			</ul>
		`;
		const out = entryBodyToPrompt(html, doc);
		expect(out).toContain('- Introduce a new twist.');
		expect(out).toContain('- Reveal a hidden threat.');
	});

	it('strips inline action-link text at top level (keeps surrounding prose)', () => {
		const html =
			'<div>Vale drew steel and swung wide. ' +
			'<a class="resource-link" data-resource="health" data-value="-2">-2 health</a></div>';
		const out = entryBodyToPrompt(html, doc);
		expect(out).toContain('Vale drew steel and swung wide.');
		expect(out).not.toContain('-2 health');
	});

	it('drops elements marked .dialog-only', () => {
		const html = '<div>Kept.</div><div class="dialog-only">Hidden.</div>';
		const out = entryBodyToPrompt(html, doc);
		expect(out).toContain('Kept.');
		expect(out).not.toContain('Hidden.');
	});

	it('preserves xp-spent strikethroughs', () => {
		const html = '<div>Trained: <s class="xp-spent">3 xp</s></div>';
		const out = entryBodyToPrompt(html, doc);
		expect(out).toContain('3 xp');
	});

	it('collapses whitespace runs', () => {
		const html = '<div>Two    spaces\n\nand\tnewline.</div>';
		const out = entryBodyToPrompt(html, doc);
		expect(out).toBe('Two spaces and newline.');
	});
});

describe('serializeLogSection', () => {
	it('reverses newest-first to chronological order', () => {
		const newest = entry('Third', '<div>C</div>', '2026-07-08T12:03:00Z');
		const middle = entry('Second', '<div>B</div>', '2026-07-08T12:02:00Z');
		const oldest = entry('First', '<div>A</div>', '2026-07-08T12:01:00Z');
		const out = serializeLogSection([newest, middle, oldest], doc);
		const iFirst = out.indexOf('First');
		const iSecond = out.indexOf('Second');
		const iThird = out.indexOf('Third');
		expect(iFirst).toBeGreaterThan(-1);
		expect(iSecond).toBeGreaterThan(iFirst);
		expect(iThird).toBeGreaterThan(iSecond);
	});

	it('returns an empty string for no entries', () => {
		expect(serializeLogSection([], doc)).toBe('');
	});

	it('emits titled blocks separated by a blank line', () => {
		const a = entry('First', '<div>Alpha.</div>', '2026-07-08T12:00:00Z');
		const b = entry('Second', '<div>Beta.</div>', '2026-07-08T12:01:00Z');
		const out = serializeLogSection([b, a], doc); // stored newest-first
		expect(out).toMatch(/## First — /);
		expect(out).toMatch(/## Second — /);
		expect(out).toContain('\n\n');
	});

	it('appends the user note when present', () => {
		const withNote: LogEntry = {
			...entry('Note-carrier', '<div>Body.</div>'),
			note: 'Vale was terrified.',
		};
		const out = serializeLogSection([withNote], doc);
		expect(out).toContain('Note: Vale was terrified.');
	});
});

describe('estimateTokens', () => {
	it('returns roughly one token per four characters', () => {
		expect(estimateTokens('')).toBe(0);
		expect(estimateTokens('abcd')).toBe(1);
		expect(estimateTokens('a'.repeat(400))).toBe(100);
	});
});

describe('buildStoryPreface', () => {
	it('returns empty string when there is no character and no foe', () => {
		expect(buildStoryPreface(null, null)).toBe('');
	});

	it('includes the character name and background', () => {
		const out = buildStoryPreface(CHAR, null);
		expect(out).toContain('# Cast & setting');
		expect(out).toContain('**Beepalache** — the player character.');
		expect(out).toContain('A wary tinker of the Deep Wilds.');
	});

	it('includes the foe name, nature, rank, description, and notes', () => {
		const out = buildStoryPreface(null, FOE);
		expect(out).toContain('**Blood Thorn** — anomaly, rank 2 foe.');
		expect(out).toContain('A writhing mass of crimson brambles.');
		expect(out).toContain('Guards the shattered spire.');
	});

	it('omits empty background/description/notes lines', () => {
		const out = buildStoryPreface(
			{ name: 'Nameless', background: '  ' },
			{ name: 'Wraith', nature: 'horror', rank: 3, description: '', notes: '' },
		);
		expect(out).toBe(
			'# Cast & setting\n\n**Nameless** — the player character.\n\n**Wraith** — horror, rank 3 foe.',
		);
	});

	it('skips a character/foe whose name is blank', () => {
		expect(buildStoryPreface({ name: '   ', background: 'x' }, null)).toBe('');
	});

	it('includes a journey with its difficulty and notes', () => {
		const out = buildStoryPreface(null, null, JOURNEY);
		expect(out).toContain('**The Long Road North** — dangerous journey.');
		expect(out).toContain('Snowbound passes and bandit tolls.');
		expect(out).not.toContain('Theme:');
		expect(out).not.toContain('Objective:');
	});

	it('includes a site with theme, domain, objective, and notes', () => {
		const out = buildStoryPreface(null, null, SITE);
		expect(out).toContain('**Blackroot Barrow** — formidable site.');
		expect(out).toContain('Theme: Ancient. Domain: Barrow.');
		expect(out).toContain('Objective: Recover the sunstone.');
		expect(out).toContain('Cold stone and older silence.');
	});

	it('orders character, foe, then expedition', () => {
		const out = buildStoryPreface(CHAR, FOE, SITE);
		expect(out.indexOf('Beepalache')).toBeLessThan(out.indexOf('Blood Thorn'));
		expect(out.indexOf('Blood Thorn')).toBeLessThan(out.indexOf('Blackroot Barrow'));
	});
});

describe('castSummary', () => {
	it('joins character and foe with "vs"', () => {
		expect(castSummary(CHAR, FOE)).toBe('Beepalache vs Blood Thorn');
	});
	it('appends the expedition location with a middot', () => {
		expect(castSummary(CHAR, FOE, SITE)).toBe('Beepalache vs Blood Thorn · Blackroot Barrow');
	});
	it('shows the location alone when there is no cast', () => {
		expect(castSummary(null, null, JOURNEY)).toBe('The Long Road North');
	});
	it('returns whichever side is present alone', () => {
		expect(castSummary(CHAR, null)).toBe('Beepalache');
		expect(castSummary(null, FOE)).toBe('Blood Thorn');
	});
	it('returns empty string when nothing is present', () => {
		expect(castSummary(null, null)).toBe('');
	});
});
