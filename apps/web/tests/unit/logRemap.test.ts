import { describe, it, expect } from 'vitest';
import { remapLogEntries, remapLogEntry, type LogIdMaps } from '../../src/lib/logRemap.js';

const maps: LogIdMaps = {
	char: new Map([['old-char', 'new-char']]),
	foe: new Map([['old-foe', 'new-foe']]),
	exp: new Map([['old-exp', 'new-exp']]),
	entry: new Map([['old-entry', 'new-entry']]),
};

describe('remapLogEntry', () => {
	it('re-points every id-carrying link attribute', () => {
		const html =
			'<a data-entry-id="old-entry" data-char-id="old-char" data-exp-id="old-exp" data-foe-id="old-foe" class="progress-link" data-value="2" href="#">Mark progress</a>' +
			' <a class="change-theme-link" data-expedition-id="old-exp" href="#">Change Theme</a>' +
			' <a class="burn-momentum-link" data-roll-entry-id="old-entry" data-move-id="move/face-danger" data-char-id="old-char" href="#">Burn</a>';
		const out = remapLogEntry({ html }, maps);
		expect(out.html).toBe(
			'<a data-entry-id="new-entry" data-char-id="new-char" data-exp-id="new-exp" data-foe-id="new-foe" class="progress-link" data-value="2" href="#">Mark progress</a>' +
				' <a class="change-theme-link" data-expedition-id="new-exp" href="#">Change Theme</a>' +
				' <a class="burn-momentum-link" data-roll-entry-id="new-entry" data-move-id="move/face-danger" data-char-id="new-char" href="#">Burn</a>',
		);
	});

	it("re-points the roll's character, foe and expedition, keeping the rest", () => {
		const roll = {
			moveId: 'move/strike',
			actionScore: 6,
			c1: 3,
			c2: 9,
			charId: 'old-char',
			foeId: 'old-foe',
			expeditionId: 'old-exp',
		};
		expect(remapLogEntry({ html: '', roll }, maps).roll).toEqual({
			...roll,
			charId: 'new-char',
			foeId: 'new-foe',
			expeditionId: 'new-exp',
		});
	});

	it('leaves an id with nothing recorded, and a roll without the optional ids', () => {
		const entry = {
			html: '<a data-char-id="someone-else" class="resource-link">+1</a>',
			roll: { moveId: 'move/face-danger', actionScore: 4, c1: 1, c2: 2, charId: 'someone-else' },
		};
		expect(remapLogEntry(entry, maps)).toEqual(entry);
	});

	it('only touches the id attributes, not the same text elsewhere', () => {
		const html =
			'<div>old-char went to old-exp</div><a data-move-id="old-char" data-id="old-foe">x</a>';
		expect(remapLogEntry({ html }, maps).html).toBe(html);
	});

	it('does not change the entry it was given', () => {
		const entry = { html: '<a data-char-id="old-char">x</a>', roll: { charId: 'old-char' } };
		remapLogEntry(entry, maps);
		expect(entry).toEqual({
			html: '<a data-char-id="old-char">x</a>',
			roll: { charId: 'old-char' },
		});
	});
});

describe('remapLogEntries', () => {
	it('hands back the same array when nothing was recorded', () => {
		const entries = [{ html: '<a data-char-id="old-char">x</a>' }];
		expect(remapLogEntries(entries, {})).toBe(entries);
		expect(remapLogEntries(entries, { char: new Map() })).toBe(entries);
	});

	it('re-points each entry', () => {
		const out = remapLogEntries(
			[{ html: '<a data-char-id="old-char">x</a>' }, { html: '<a data-foe-id="old-foe">y</a>' }],
			maps,
		);
		expect(out.map((e) => e.html)).toEqual([
			'<a data-char-id="new-char">x</a>',
			'<a data-foe-id="new-foe">y</a>',
		]);
	});
});
