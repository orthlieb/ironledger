// @vitest-environment jsdom
/**
 * sanitize.test.ts
 *
 * ── WHICH DOM ─────────────────────────────────────────────────────────────────
 * Runs on jsdom, not the happy-dom the other unit tests use. From DOMPurify
 * 3.4.9 on, sanitizing against a happy-dom window misbehaves: it leaves
 * <script> in place and strips allowed tags, while the same version is
 * correct in a real browser and in jsdom (the server path). That is a
 * happy-dom incompatibility, not an app bug; jsdom follows the DOM spec
 * closely enough that these results match the browser's.
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
 *   stripped. (A spec-faithful DOM is needed for these too: see WHICH DOM.)
 *
 * NOTE ON ATTRIBUTE TESTING
 * Tier 3 (below) tests attribute preservation end-to-end through
 * isomorphic-dompurify.  This caught a regression where
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
describe('LOG_ATTRS — a command link (#lib/commands/links.ts)', () => {
	expectAttr('class', 'cmd-link, and resource-spent once it is struck');
	expectAttr('data-cmd', 'the command a click runs');
	expectAttr('data-verb', 'marks a move or oracle link, live in dialogs');
	expectAttr('data-link', 'its place in the entry, so the link clicked is the one struck');
	expectAttr('data-entry-id', 'the entry it belongs to');
});

describe('LOG_ATTRS — what a command link is bound to', () => {
	expectAttr('data-char-id', 'the character the entry was made for');
	expectAttr('data-foe-id', 'the foe it was made against');
	expectAttr('data-exp-id', 'the journey, site or scene it was made for');
	expectAttr('data-vow-id', 'the vow its move chose');
	expectAttr('data-companion-id', 'the companion its move chose');
	expectAttr('data-self-id', 'the asset the link belongs to');
	expectAttr('data-harm', 'what `harm` stands for (Endure Harm’s amount)');
	expectAttr('data-roll-entry-id', 'the action roll a /burn link burns momentum on');
	expectAttr('data-stat', 'the column an /oracle link opens on');
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
	it('keeps a bound command link whole', () => {
		const html =
			'<a class="cmd-link" data-cmd="/foe.progress+=2" data-entry-id="eid-1" data-link="0" ' +
			'data-char-id="cid-1" data-foe-id="fid-1" data-exp-id="xid-1" data-vow-id="vid-1" ' +
			'data-companion-id="companion/hawk" data-harm="2">Inflict double harm</a>';
		const out = sanitizeLogHtml(html);
		for (const attr of [
			'class="cmd-link"',
			'data-cmd="/foe.progress+=2"',
			'data-entry-id="eid-1"',
			'data-link="0"',
			'data-char-id="cid-1"',
			'data-foe-id="fid-1"',
			'data-exp-id="xid-1"',
			'data-vow-id="vid-1"',
			'data-companion-id="companion/hawk"',
			'data-harm="2"',
		])
			expect(out).toContain(attr);
		expect(out).toContain('Inflict double harm');
	});

	it('keeps a burn link’s roll and a move link’s verb', () => {
		const out = sanitizeLogHtml(
			'<a class="cmd-link" data-cmd="/burn" data-roll-entry-id="roll-1">burn momentum</a> ' +
				'<a class="cmd-link" data-cmd="/move endure-harm" data-verb="move">Endure Harm</a>',
		);
		expect(out).toContain('data-roll-entry-id="roll-1"');
		expect(out).toContain('data-verb="move"');
	});

	it('keeps every link of a full move outcome', () => {
		const html = `
      <div class="roll-line">1d6 [4] + heart[1] = <strong>5</strong> vs 2d10 [1] [3]</div>
      <div class="roll-outcome-strong"><strong>Strong Hit</strong></div>
      <div class="move-outcome">Take
        <a class="cmd-link" data-cmd="/momentum+=2" data-entry-id="eid-full" data-link="0" data-char-id="cid-full">+2 momentum</a>.
        <a class="cmd-link" data-cmd="/initiative=me" data-entry-id="eid-full" data-link="1" data-char-id="cid-full">You have initiative</a>.
      </div>
    `;
		const out = sanitizeLogHtml(html);
		expect(out.match(/data-entry-id="eid-full"/g)?.length).toBe(2);
		expect(out.match(/data-char-id="cid-full"/g)?.length).toBe(2);
		expect(out).toContain('data-cmd="/momentum+=2"');
		expect(out).toContain('data-cmd="/initiative=me"');
	});

	it('strips an old link’s data, leaving its text (old links do nothing now)', () => {
		const out = sanitizeLogHtml(
			'<a class="resource-link" data-resource="momentum" data-value="+2">+2 momentum</a>',
		);
		expect(out).not.toContain('data-resource');
		expect(out).toContain('+2 momentum');
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
		const html = '<a class="cmd-link" data-evil="injected" data-cmd="/momentum++">test</a>';
		const out = sanitizeLogHtml(html);
		expect(out).not.toContain('data-evil');
		expect(out).toContain('data-cmd="/momentum++"');
	});
});
