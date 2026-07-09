/**
 * sanitize.test.ts
 *
 * Two-tier regression suite for log HTML sanitisation.
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────────────
 * isomorphic-dompurify was listed in package.json but never installed, so
 * sanitisation was silently a no-op.  When finally installed, DOMPurify began
 * stripping six data-* attributes and the <s> tag that interactive log links
 * depend on — breaking Mark Progress, Burn Momentum, XP spend, debility links,
 * and the "spent" strikethrough state.
 *
 * ── TEST STRUCTURE ────────────────────────────────────────────────────────────
 * Tier 1 – Allowlist integrity (pure unit, no DOM required)
 *   Asserts that LOG_TAGS and LOG_ATTRS contain every tag / attribute that each
 *   interactive link type needs.  If a developer removes an entry they'll get a
 *   clear, named failure rather than a silent runtime regression.
 *
 * Tier 2 – XSS / dangerous-content removal (output-based)
 *   Calls sanitizeLogHtml() and checks that genuinely dangerous payloads are
 *   stripped.  These work reliably across environments (happy-dom, jsdom, node)
 *   because DOMPurify always strips script/event-handler/js: content regardless
 *   of the DOM implementation.
 *
 * NOTE ON ATTRIBUTE TESTING
 * Tier 3 (below) tests attribute preservation end-to-end using happy-dom, which
 * runs isomorphic-dompurify in browser mode.  This caught a regression where
 * combining ALLOW_DATA_ATTR:false + ALLOWED_URI_REGEXP stripped ALL data-*
 * attributes even when explicitly listed in ALLOWED_ATTR.  The fix was to drop
 * the custom ALLOWED_URI_REGEXP (DOMPurify's built-in protection is sufficient).
 */

import { describe, it, expect } from 'vitest';
import { LOG_TAGS, LOG_ATTRS, sanitizeLogHtml } from '../../src/lib/sanitize.js';

// ---------------------------------------------------------------------------
// Tier 1 — Allowlist integrity
// ---------------------------------------------------------------------------

// ── Helper ──────────────────────────────────────────────────────────────────
function expectTag(tag: string) {
	it(`LOG_TAGS includes <${tag}>`, () => {
		expect(LOG_TAGS).toContain(tag);
	});
}

function expectAttr(attr: string, reason: string) {
	it(`LOG_ATTRS includes ${attr}  (${reason})`, () => {
		expect(LOG_ATTRS).toContain(attr);
	});
}

// ── Tags ────────────────────────────────────────────────────────────────────
describe('LOG_TAGS allowlist', () => {
	// Structural / formatting tags used by move outcome HTML
	for (const tag of ['a', 'span', 'div', 'p', 'br', 'strong', 'em', 'ul', 'ol', 'li']) {
		expectTag(tag);
	}
	// h3–h5: renderNote emits these for markdown headings (# / ## / ###) in
	// AI story entries — see sanitizeLogHtml survival test in Tier 2.
	for (const tag of ['h3', 'h4', 'h5']) {
		expectTag(tag);
	}
	// <s> written by markLinkSpent after a link is clicked
	expectTag('s');
});

// ── Attributes shared by multiple link types ─────────────────────────────────
describe('LOG_ATTRS — shared attributes', () => {
	expectAttr('class', 'every link needs its CSS class to be clickable');
	expectAttr('href', 'failure/xp links use href="#"; move-links use a path');
	expectAttr('data-value', 'resource-link, progress-link, initiative-link, menace-link');
	expectAttr('data-entry-id', 'all stateful links — markLinkSpent + early-return guard');
	expectAttr(
		'data-char-id',
		'resource-link, debility-link, failure-link, burn-momentum-link, xp-cost-link',
	);
});

// ── resource-link ────────────────────────────────────────────────────────────
describe('LOG_ATTRS — resource-link', () => {
	expectAttr('data-resource', 'identifies which stat to change (momentum, health, spirit, …)');
});

// ── progress-link ────────────────────────────────────────────────────────────
describe('LOG_ATTRS — progress-link', () => {
	// Handler: const track = progLink.dataset['track'] ?? ''; if (!track …) return;
	expectAttr('data-track', 'identifies which progress track to mark (combat, journey, delve)');
});

// ── debility-link ─────────────────────────────────────────────────────────────
describe('LOG_ATTRS — debility-link', () => {
	// Handler: const debility = debLink.dataset['debility'] ?? ''; if (!debility …) return;
	expectAttr('data-debility', 'identifies which debility to set or clear');
});

// ── move-link ─────────────────────────────────────────────────────────────────
describe('LOG_ATTRS — move-link', () => {
	expectAttr('data-id', 'move id to open in MovesDialog');
});

// ── oracle-link ───────────────────────────────────────────────────────────────
describe('LOG_ATTRS — oracle-link', () => {
	expectAttr('data-oracle', 'oracle key to open in OraclesDialog');
	// oracleLink.dataset['stat'] is passed to the oracle dialog for column pre-selection
	expectAttr('data-stat', 'stat column pre-selected in the oracle (e.g. "edge")');
});

// ── failure-link (no extra attrs — uses shared data-entry-id / data-char-id)
describe('LOG_ATTRS — failure-link', () => {
	// All required attrs already covered by the shared block above
	it('all required attrs (data-entry-id, data-char-id, href) are covered by shared tests', () => {
		expect(LOG_ATTRS).toContain('data-entry-id');
		expect(LOG_ATTRS).toContain('data-char-id');
		expect(LOG_ATTRS).toContain('href');
	});
});

// ── burn-momentum-link ───────────────────────────────────────────────────────
describe('LOG_ATTRS — burn-momentum-link', () => {
	// Handler: const rollEntryId = burnLink.dataset['rollEntryId'] ?? ''; if (!rollEntryId …) return;
	expectAttr(
		'data-roll-entry-id',
		'id of the original roll log entry — handler returns early if missing',
	);
	// Also stored on the element for burnMomentum() context:
	expectAttr('data-move-id', 'move id passed to burnMomentum()');
	expectAttr('data-action-score', 'action score passed to burnMomentum()');
});

// ── xp-cost-link ─────────────────────────────────────────────────────────────
describe('LOG_ATTRS — xp-cost-link', () => {
	// Handler: const cost = parseInt(xpLink.dataset['cost'] ?? '0', 10); if (!cost …) return;
	expectAttr('data-cost', 'XP amount to deduct — handler returns early if 0/missing');
});

// ── change-theme / change-domain links ───────────────────────────────────────
describe('LOG_ATTRS — change-theme-link / change-domain-link', () => {
	expectAttr('data-expedition-id', 'which expedition to modify');
});

// ── <s> tag coverage (attribute side) ────────────────────────────────────────
describe('LOG_ATTRS — <s class="resource-spent/xp-spent">', () => {
	it('class is in ALLOWED_ATTR so resource-spent / xp-spent classes survive', () => {
		expect(LOG_ATTRS).toContain('class');
	});
});

// ---------------------------------------------------------------------------
// Tier 2 — XSS / dangerous-content removal (output-based)
// ---------------------------------------------------------------------------

describe('sanitizeLogHtml — XSS / injection is blocked', () => {
	it('strips <script> tags entirely', () => {
		const html = `<p>Safe text</p><script>alert('xss')</script>`;
		const out = sanitizeLogHtml(html);
		expect(out).not.toContain('<script');
		expect(out).not.toContain('alert(');
		expect(out).toContain('Safe text');
	});

	it('strips inline event handlers (onclick, onerror, …)', () => {
		const html = `<a href="#" onclick="evil()" onerror="evil()">click me</a>`;
		const out = sanitizeLogHtml(html);
		expect(out).not.toContain('onclick');
		expect(out).not.toContain('onerror');
	});

	it('strips javascript: href', () => {
		const html = `<a href="javascript:evil()">click me</a>`;
		expect(sanitizeLogHtml(html)).not.toContain('javascript:');
	});

	it('strips data: URI in href', () => {
		const html = `<a href="data:text/html,<script>evil()</script>">click me</a>`;
		expect(sanitizeLogHtml(html)).not.toContain('data:text');
	});

	it('preserves safe structural tags', () => {
		const html = `<div><p>Hello <strong>world</strong></p></div>`;
		const out = sanitizeLogHtml(html);
		expect(out).toContain('<div>');
		expect(out).toContain('<strong>');
		expect(out).toContain('Hello');
	});

	it('preserves h3–h5 heading tags (renderNote markdown headings in stories)', () => {
		const html = `<h3>The Barrow</h3><h4>Descent</h4><h5>The Silence</h5>`;
		const out = sanitizeLogHtml(html);
		expect(out).toContain('<h3>The Barrow</h3>');
		expect(out).toContain('<h4>Descent</h4>');
		expect(out).toContain('<h5>The Silence</h5>');
	});

	it('strips unknown tags but keeps their text', () => {
		const html = `<marquee>old school</marquee>`;
		const out = sanitizeLogHtml(html);
		expect(out).not.toContain('<marquee');
		expect(out).toContain('old school');
	});

	it('returns empty string for null / undefined input', () => {
		expect(sanitizeLogHtml(null)).toBe('');
		expect(sanitizeLogHtml(undefined)).toBe('');
		expect(sanitizeLogHtml('')).toBe('');
	});
});

// ---------------------------------------------------------------------------
// Tier 3 — Data attribute preservation (output-based, happy-dom required)
//
// WHY THIS EXISTS
// The combination of ALLOW_DATA_ATTR:false + ALLOWED_URI_REGEXP in DOMPurify
// silently strips ALL data-* attributes — even explicitly listed ones — from
// log entry links.  This caused every interactive link (momentum, initiative,
// debility, etc.) to silently no-op on click because the click handler reads
// charId / resource / value from the element's dataset.
//
// The fix: remove ALLOWED_URI_REGEXP (DOMPurify's built-in URI protection is
// sufficient).  These tests guard against that regression being reintroduced.
// ---------------------------------------------------------------------------

describe('sanitizeLogHtml — data attribute preservation (regression guard)', () => {
	// ── resource-link (as enrichOutcomeLinks produces it: data-* before class) ─

	it('preserves all data-* attrs on a resource-link in enrichOutcomeLinks output format', () => {
		// enrichOutcomeLinks puts data-entry-id and data-char-id BEFORE the class attr
		const html =
			'<a data-entry-id="eid-123" data-char-id="cid-456" class="resource-link" data-resource="momentum" data-value="+2">+2 momentum</a>';
		const out = sanitizeLogHtml(html);
		expect(out).toContain('class="resource-link"');
		expect(out).toContain('data-entry-id="eid-123"');
		expect(out).toContain('data-char-id="cid-456"');
		expect(out).toContain('data-resource="momentum"');
		expect(out).toContain('data-value="+2"');
		expect(out).toContain('+2 momentum');
	});

	// ── initiative-link ───────────────────────────────────────────────────────

	it('preserves data-value and data-entry-id on initiative-link', () => {
		const html =
			'<a data-entry-id="eid-789" data-char-id="cid-456" class="initiative-link" data-value="character">You have initiative</a>';
		const out = sanitizeLogHtml(html);
		expect(out).toContain('class="initiative-link"');
		expect(out).toContain('data-entry-id="eid-789"');
		expect(out).toContain('data-char-id="cid-456"');
		expect(out).toContain('data-value="character"');
	});

	// ── debility-link ─────────────────────────────────────────────────────────

	it('preserves data-debility, data-value, data-entry-id, data-char-id on debility-link', () => {
		const html =
			'<a data-entry-id="eid-abc" data-char-id="cid-def" class="debility-link" data-debility="shaken" data-value="1">Mark Shaken</a>';
		const out = sanitizeLogHtml(html);
		expect(out).toContain('data-debility="shaken"');
		expect(out).toContain('data-value="1"');
		expect(out).toContain('data-entry-id="eid-abc"');
		expect(out).toContain('data-char-id="cid-def"');
	});

	// ── burn-momentum-link ────────────────────────────────────────────────────

	it('preserves data-roll-entry-id and data-entry-id on burn-momentum-link', () => {
		const html =
			'<a data-entry-id="burn-001" data-char-id="cid-456" data-roll-entry-id="roll-001" class="burn-momentum-link">Burn momentum</a>';
		const out = sanitizeLogHtml(html);
		expect(out).toContain('data-roll-entry-id="roll-001"');
		expect(out).toContain('data-entry-id="burn-001"');
		expect(out).toContain('data-char-id="cid-456"');
	});

	// ── full move-outcome block (real-world shape) ────────────────────────────

	it('preserves data attrs on all links in a full move-outcome block', () => {
		const html = `
      <div class="roll-line">1d6 [4] + heart[1] = <strong>5</strong> vs 2d10 [1] [3]</div>
      <div class="roll-outcome-strong"><strong>Strong Hit</strong></div>
      <div class="move-outcome">Take
        <a data-entry-id="eid-full" data-char-id="cid-full" class="resource-link" data-resource="momentum" data-value="+2">+2 momentum</a>.
        <a data-entry-id="eid-full" data-char-id="cid-full" class="initiative-link" data-value="character">You have initiative</a>.
      </div>
    `;
		const out = sanitizeLogHtml(html);
		// Both links should have all their attrs
		expect(out.match(/data-entry-id="eid-full"/g)?.length).toBe(2);
		expect(out.match(/data-char-id="cid-full"/g)?.length).toBe(2);
		expect(out).toContain('data-resource="momentum"');
		expect(out).toContain('data-value="+2"');
		expect(out).toContain('data-value="character"');
	});

	// ── ALLOWED_URI_REGEXP regression guard ───────────────────────────────────

	it('still blocks javascript: href even without a custom ALLOWED_URI_REGEXP', () => {
		// DOMPurify's built-in URI protection covers this — no custom regexp needed.
		expect(sanitizeLogHtml('<a href="javascript:evil()">bad</a>')).not.toContain('javascript:');
	});

	it('still blocks data: URI in href', () => {
		expect(sanitizeLogHtml('<a href="data:text/html,<h1>xss</h1>">bad</a>')).not.toContain(
			'data:text',
		);
	});

	it('strips unlisted data-* attributes (ALLOW_DATA_ATTR:false enforced)', () => {
		const html =
			'<a class="resource-link" data-evil="injected" data-resource="momentum" data-value="+1">test</a>';
		const out = sanitizeLogHtml(html);
		expect(out).not.toContain('data-evil');
		expect(out).toContain('data-resource="momentum"');
	});
});
