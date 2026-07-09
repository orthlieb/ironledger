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
	sectionText,
	mentions,
	referencedCharIds,
	type PrefaceCharacter,
	type PrefaceFoe,
	type PrefaceExpedition,
} from '../../src/lib/aiSerialize.js';

const CHAR: PrefaceCharacter = {
	name: 'Beepalache',
	background: 'A wary tinker of the Deep Wilds.',
	assets: ['Tinker', 'Ritualist'],
	vows: [{ name: 'Avenge my sister', difficulty: 'formidable', threat: 'the Bloodthorn Coven' }],
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
	it('returns empty string when nothing is referenced', () => {
		expect(buildStoryPreface([], [], [])).toBe('');
	});

	it('includes the character name, background, assets, and vows', () => {
		const out = buildStoryPreface([CHAR], [], []);
		expect(out).toContain('# Cast & setting');
		expect(out).toContain('**Beepalache** — player character.');
		expect(out).toContain('A wary tinker of the Deep Wilds.');
		expect(out).toContain('Assets: Tinker, Ritualist.');
		expect(out).toContain('Vows: Avenge my sister (formidable, against the Bloodthorn Coven).');
	});

	it('omits the assets/vows lines when the character has none', () => {
		const out = buildStoryPreface(
			[{ name: 'Plainfolk', background: '', assets: [], vows: [] }],
			[],
			[],
		);
		expect(out).toBe('# Cast & setting\n\n**Plainfolk** — player character.');
	});

	it('includes the foe name, nature, rank, description, and notes', () => {
		const out = buildStoryPreface([], [FOE], []);
		expect(out).toContain('**Blood Thorn** — anomaly, rank 2 foe.');
		expect(out).toContain('A writhing mass of crimson brambles.');
		expect(out).toContain('Guards the shattered spire.');
	});

	it('renders multiple characters and foes, each as its own block', () => {
		const other: PrefaceCharacter = { name: 'Mr. Pibbles', background: '', assets: [], vows: [] };
		const out = buildStoryPreface([CHAR, other], [FOE], []);
		expect(out).toContain('**Beepalache** — player character.');
		expect(out).toContain('**Mr. Pibbles** — player character.');
		expect(out).toContain('**Blood Thorn** — anomaly, rank 2 foe.');
	});

	it('skips entities whose name is blank', () => {
		expect(
			buildStoryPreface([{ name: '   ', background: 'x', assets: [], vows: [] }], [], []),
		).toBe('');
	});

	it('includes a journey with its difficulty and notes', () => {
		const out = buildStoryPreface([], [], [JOURNEY]);
		expect(out).toContain('**The Long Road North** — dangerous journey.');
		expect(out).toContain('Snowbound passes and bandit tolls.');
		expect(out).not.toContain('Theme:');
		expect(out).not.toContain('Objective:');
	});

	it('includes a site with theme, domain, objective, and notes', () => {
		const out = buildStoryPreface([], [], [SITE]);
		expect(out).toContain('**Blackroot Barrow** — formidable site.');
		expect(out).toContain('Theme: Ancient. Domain: Barrow.');
		expect(out).toContain('Objective: Recover the sunstone.');
		expect(out).toContain('Cold stone and older silence.');
	});

	it('orders characters, then foes, then expeditions', () => {
		const out = buildStoryPreface([CHAR], [FOE], [SITE]);
		expect(out.indexOf('Beepalache')).toBeLessThan(out.indexOf('Blood Thorn'));
		expect(out.indexOf('Blood Thorn')).toBeLessThan(out.indexOf('Blackroot Barrow'));
	});
});

describe('castSummary', () => {
	it('joins characters and foes with "vs"', () => {
		expect(castSummary([CHAR], [FOE], [])).toBe('Beepalache vs Blood Thorn');
	});
	it('appends the expedition location with a middot', () => {
		expect(castSummary([CHAR], [FOE], [SITE])).toBe('Beepalache vs Blood Thorn · Blackroot Barrow');
	});
	it('comma-joins multiple characters', () => {
		const other: PrefaceCharacter = { name: 'Mr. Pibbles', background: '', assets: [], vows: [] };
		expect(castSummary([CHAR, other], [FOE], [])).toBe('Beepalache, Mr. Pibbles vs Blood Thorn');
	});
	it('shows the location alone when there is no cast', () => {
		expect(castSummary([], [], [JOURNEY])).toBe('The Long Road North');
	});
	it('returns empty string when nothing is present', () => {
		expect(castSummary([], [], [])).toBe('');
	});
});

// ---------------------------------------------------------------------------
// Section scanning
// ---------------------------------------------------------------------------

const rollEntry = (title: string, html: string, charId: string): LogEntry => ({
	id: crypto.randomUUID(),
	title,
	html,
	ts: new Date().toISOString(),
	roll: { moveId: 'move/clash', actionScore: 7, c1: 8, c2: 2, charId },
});

describe('sectionText', () => {
	it('flattens titles, body text, and notes into one lowercased blob', () => {
		const e: LogEntry = {
			id: '1',
			title: 'Beepalache Clashes',
			html: '<p>She struck the <strong>Blood Thorn</strong>.</p>',
			ts: new Date().toISOString(),
			note: 'It hissed.',
		};
		const out = sectionText([e], doc);
		expect(out).toContain('beepalache clashes');
		expect(out).toContain('she struck the blood thorn');
		expect(out).toContain('it hissed');
		expect(out).not.toContain('<strong>');
	});
});

describe('mentions', () => {
	const text = 'beepalache clashes with blood thorn near the barrow';
	it('matches a whole-word name case-insensitively', () => {
		expect(mentions(text, 'Blood Thorn')).toBe(true);
		expect(mentions(text, 'BEEPALACHE')).toBe(true);
	});
	it('does not match a substring inside another word', () => {
		expect(mentions('wolfsbane grows here', 'Wolf')).toBe(false);
	});
	it('ignores names shorter than two characters', () => {
		expect(mentions('a b c', 'a')).toBe(false);
	});
});

describe('referencedCharIds', () => {
	it('collects ids from roll.charId and data-char-id attributes', () => {
		const entries: LogEntry[] = [
			rollEntry('Beepalache Clashes', '<p>hit</p>', 'char-A'),
			{
				id: '2',
				title: 'Resource',
				html: '<a class="resource-link" data-char-id="char-B" data-resource="health">-1 health</a>',
				ts: new Date().toISOString(),
			},
		];
		const ids = referencedCharIds(entries, doc);
		expect(ids.sort()).toEqual(['char-A', 'char-B']);
	});
});
