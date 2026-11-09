/**
 * actionScore.test.ts — the action score and its cap of 10.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { ACTION_SCORE_MAX, actionScore, actionScoreHtml } from '../../src/lib/rules/actionScore.js';

describe('actionScore', () => {
	it('sums the action die, stat and adds', () => {
		expect(actionScore(4, 2, 1)).toEqual({ score: 7, raw: 7 });
		expect(actionScore(0, 3, 0)).toEqual({ score: 3, raw: 3 }); // die cancelled by momentum
		expect(actionScore(2, 1, -2)).toEqual({ score: 1, raw: 1 });
	});

	it('never scores more than 10', () => {
		expect(ACTION_SCORE_MAX).toBe(10);
		expect(actionScore(6, 4, 0)).toEqual({ score: 10, raw: 10 });
		expect(actionScore(6, 4, 3)).toEqual({ score: 10, raw: 13 });
	});
});

describe('actionScoreHtml', () => {
	it('shows the score in bold', () => {
		expect(actionScoreHtml({ score: 7, raw: 7 })).toBe('<strong>7</strong>');
	});

	it('strikes a capped sum through before the 10', () => {
		expect(actionScoreHtml({ score: 10, raw: 13 })).toBe('<s>13</s>&thinsp;<strong>10</strong>');
	});
});
