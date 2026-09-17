/**
 * Unit tests for characterRollups — the shared "randomize on Create"
 * primitives the New NPC and New Character dialogs both consume.
 *
 * The module also exposes wrappers that pull rows out of the live oracle
 * store (rollByNameOracleKey, regionOriginOptions, rollRandomRegionOrigin,
 * religionColumnForOrigin, rollYrtTouchedStructured, and the composite
 * rollCharacterRandomizations); those are exercised end-to-end by
 * `characters.spec.ts` / `communities.spec.ts` because they only mean
 * something with a real catalogue behind them. What we cover here are the
 * pure helpers — the flag-set defaults, the Touched markdown + log
 * emitters, and the RandomizeResult → background-markdown formatter —
 * where the interesting behaviour is entirely local and every branch is
 * cheap to hit.
 */
import { describe, it, expect } from 'vitest';
import {
	defaultRandomizeFlags,
	formatTouchedMd,
	touchedLogHtml,
	randomizationsAsMarkdown,
	type RandomizeResult,
	type TouchedRoll,
} from '../../src/lib/characterRollupsFormat.js';

describe('defaultRandomizeFlags', () => {
	it('checks every flag — concept oracles + both YRT extras', () => {
		// touched + religion default on so a YRT session opens with the full
		// roll-on-Create set armed; RandomizeBlock's origin/religion sync
		// still disables religion visually until a region is picked.
		expect(defaultRandomizeFlags()).toEqual({
			firstLook: true,
			activity: true,
			disposition: true,
			role: true,
			goal: true,
			descriptor: true,
			touched: true,
			religion: true,
		});
	});

	it('returns a fresh object each call — mutating one does not poison the next', () => {
		const a = defaultRandomizeFlags();
		a.firstLook = false;
		a.touched = false;
		const b = defaultRandomizeFlags();
		expect(b.firstLook).toBe(true);
		expect(b.touched).toBe(true);
	});
});

// ── formatTouchedMd ────────────────────────────────────────────────────────

/** Build a TouchedRoll fixture with sensible defaults so each test can name
 *  only the fields it cares about. */
const touched = (over: Partial<TouchedRoll> = {}): TouchedRoll => ({
	className: 'Prime',
	classRoll: 12,
	animal: 'wolf',
	animalRoll: 34,
	countRange: '',
	features: [{ value: 'yellow eyes', roll: 56 }],
	...over,
});

describe('formatTouchedMd', () => {
	it('Pure — no animal, no features, no bullet list', () => {
		const md = formatTouchedMd('Aldric', touched({ className: 'Pure', animal: '', features: [] }));
		expect(md).toBe('Aldric is **Pure with no touched features**.');
	});

	it('Prime with one feature — singular "feature" and one bullet', () => {
		const md = formatTouchedMd('Aldric', touched({ className: 'Prime' }));
		expect(md).toBe('Aldric is **Prime with 1** feature of a wolf.\n- yellow eyes');
	});

	it('Second with two features — plural "features", two bullets, "1–3" only in the log', () => {
		const md = formatTouchedMd(
			'Vela',
			touched({
				className: 'Second',
				countRange: '1–3',
				features: [
					{ value: 'yellow eyes', roll: 4 },
					{ value: 'canine teeth', roll: 88 },
				],
			}),
		);
		expect(md).toBe('Vela is **Second with 2** features of a wolf.\n- yellow eyes\n- canine teeth');
	});

	it('Third with four features — bullet list stays flat', () => {
		const md = formatTouchedMd(
			'Ren',
			touched({
				className: 'Third',
				countRange: '4–6',
				features: [
					{ value: 'a', roll: 1 },
					{ value: 'b', roll: 2 },
					{ value: 'c', roll: 3 },
					{ value: 'd', roll: 4 },
				],
			}),
		);
		expect(md).toBe('Ren is **Third with 4** features of a wolf.\n- a\n- b\n- c\n- d');
	});

	it('Feral — no bullet list, italic narrative placeholder', () => {
		const md = formatTouchedMd(
			'Wraith',
			touched({ className: 'Feral', animal: 'eagle', features: [] }),
		);
		expect(md).toBe(
			'Wraith is **Feral with many** features of an eagle.\n' +
				'- _Enter narrative concerning this character here._',
		);
	});

	it('picks "an" for a vowel-initial animal', () => {
		const md = formatTouchedMd('X', touched({ animal: 'owl' }));
		expect(md.startsWith('X is **Prime with 1** feature of an owl.')).toBe(true);
	});

	it('picks "a" for a consonant-initial animal', () => {
		const md = formatTouchedMd('X', touched({ animal: 'boar' }));
		expect(md.startsWith('X is **Prime with 1** feature of a boar.')).toBe(true);
	});

	it('falls back to "They" when the name is blank or whitespace', () => {
		expect(formatTouchedMd('', touched()).startsWith('They is ')).toBe(true);
		expect(formatTouchedMd('   ', touched()).startsWith('They is ')).toBe(true);
	});
});

// ── touchedLogHtml ─────────────────────────────────────────────────────────

describe('touchedLogHtml', () => {
	it('Pure — only the class line, no animal, no features', () => {
		const html = touchedLogHtml(
			touched({ className: 'Pure', classRoll: 1, animal: '', features: [] }),
		);
		expect(html).toBe('<div class="roll-line">Class: <strong>Pure</strong> (d100 → 1)</div>');
	});

	it('Prime — class + animal + one feature (no count-range line)', () => {
		const html = touchedLogHtml(
			touched({
				className: 'Prime',
				classRoll: 25,
				animal: 'wolf',
				animalRoll: 61,
				features: [{ value: 'yellow eyes', roll: 44 }],
			}),
		);
		expect(html).toContain('Class: <strong>Prime</strong> (d100 → 25)');
		expect(html).toContain('Animal aspect: <strong>wolf</strong> (d100 → 61)');
		expect(html).toContain('— <strong>yellow eyes</strong> (d100 → 44)');
		expect(html).not.toContain('Features:'); // no count-range line for Prime
	});

	it('Second — class + animal + count-range line + each feature', () => {
		const html = touchedLogHtml(
			touched({
				className: 'Second',
				classRoll: 55,
				animal: 'wolf',
				animalRoll: 20,
				countRange: '1–3',
				features: [
					{ value: 'a', roll: 10 },
					{ value: 'b', roll: 90 },
				],
			}),
		);
		expect(html).toContain('Features: (1–3 → 2)');
		expect(html).toContain('— <strong>a</strong> (d100 → 10)');
		expect(html).toContain('— <strong>b</strong> (d100 → 90)');
	});

	it('Feral — narrative-placeholder line stands in for a feature list', () => {
		const html = touchedLogHtml(
			touched({ className: 'Feral', animal: 'eagle', animalRoll: 3, features: [] }),
		);
		expect(html).toContain('Animal aspect: <strong>eagle</strong> (d100 → 3)');
		expect(html).toContain('Features are all-encompassing');
		expect(html).not.toContain('— <strong>');
	});
});

// ── randomizationsAsMarkdown ───────────────────────────────────────────────

describe('randomizationsAsMarkdown', () => {
	it('empty result → empty string (no header, no blank block)', () => {
		expect(randomizationsAsMarkdown({ rolled: [] })).toBe('');
	});

	it('concept fields only — joined into a single block with blank-line separators', () => {
		const r: RandomizeResult = {
			rolled: [],
			firstLook: 'weather-beaten cloak',
			role: 'trader',
			goal: 'settle a debt',
		};
		expect(randomizationsAsMarkdown(r)).toBe(
			'**First Look:** weather-beaten cloak\n\n**Role:** trader\n\n**Goal:** settle a debt',
		);
	});

	it('skips empty-string concept fields — no dangling label', () => {
		const r: RandomizeResult = {
			rolled: [],
			firstLook: '',
			role: 'trader',
		};
		expect(randomizationsAsMarkdown(r)).toBe('**Role:** trader');
	});

	it('origin block appears with region alone; religion joins on when set', () => {
		expect(randomizationsAsMarkdown({ rolled: [], origin: 'The Barrier Islands' })).toBe(
			'**Region of origin:** The Barrier Islands',
		);
		expect(
			randomizationsAsMarkdown({
				rolled: [],
				origin: 'The Barrier Islands',
				religionMd: '**Wildens**: an animist faith',
			}),
		).toBe(
			'**Region of origin:** The Barrier Islands\n\n**Religion:** **Wildens**: an animist faith',
		);
	});

	it('Touched block reuses formatTouchedMd and lands after concepts + origin', () => {
		const r: RandomizeResult = {
			rolled: [],
			role: 'trader',
			origin: 'Havens',
			touched: touched({ className: 'Prime', animal: 'wolf' }),
		};
		const md = randomizationsAsMarkdown(r, 'Vela');
		// Sections are separated by \n\n; Touched must be the tail.
		const parts = md.split('\n\n');
		expect(parts[0]).toBe('**Role:** trader');
		expect(parts[1]).toBe('**Region of origin:** Havens');
		expect(md.endsWith('Vela is **Prime with 1** feature of a wolf.\n- yellow eyes')).toBe(true);
	});

	it('name is forwarded into the Touched block (falls back to "They" when omitted)', () => {
		const r: RandomizeResult = {
			rolled: [],
			touched: touched({ className: 'Pure', animal: '', features: [] }),
		};
		expect(randomizationsAsMarkdown(r)).toBe('They is **Pure with no touched features**.');
		expect(randomizationsAsMarkdown(r, 'Aldric')).toBe(
			'Aldric is **Pure with no touched features**.',
		);
	});

	it('order across every kind of field matches the checkbox row', () => {
		// firstLook / activity / disposition / role / goal / descriptor,
		// then origin (+ religion), then Touched.
		const r: RandomizeResult = {
			rolled: [],
			firstLook: 'A',
			activity: 'B',
			disposition: 'C',
			role: 'D',
			goal: 'E',
			descriptor: 'F',
			origin: 'G',
			religionMd: 'H',
			touched: touched({ className: 'Pure', animal: '', features: [] }),
		};
		const md = randomizationsAsMarkdown(r, 'Z');
		expect(md).toBe(
			[
				'**First Look:** A',
				'**Activity:** B',
				'**Disposition:** C',
				'**Role:** D',
				'**Goal:** E',
				'**Revealed Details:** F',
				'**Region of origin:** G\n\n**Religion:** H',
				'Z is **Pure with no touched features**.',
			].join('\n\n'),
		);
	});
});
