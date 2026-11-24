/**
 * oracleLog.test.ts — the short log body the name dice and Settlement Trouble
 * write (lib/oracleLog.ts): the result renders as oracle text, not as written.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { oracleResultLogHtml } from '../../src/lib/oracleLog.js';

describe('oracleResultLogHtml', () => {
	it('logs the d100 and a plain result unchanged', () => {
		expect(oracleResultLogHtml({ roll: 42, value: 'Ashborne' }, 'e1')).toBe(
			'<div class="roll-line">Roll: d100 → 42</div><div>Result: <strong>Ashborne</strong></div>',
		);
	});

	it('renders markdown and escapes the rest', () => {
		expect(oracleResultLogHtml({ roll: 7, value: '**Stead** & <hall>' }, 'e1')).toContain(
			'<strong><strong>Stead</strong> &amp; &lt;hall&gt;</strong>',
		);
	});

	it('makes a command link live, bound to the entry', () => {
		const html = oracleResultLogHtml({ roll: 3, value: 'Take [+1 momentum](/momentum++)' }, 'e9');
		expect(html).toContain('class="cmd-link" data-cmd="/momentum++"');
		expect(html).toContain('data-entry-id="e9"');
		expect(html).not.toContain('](');
	});
});
