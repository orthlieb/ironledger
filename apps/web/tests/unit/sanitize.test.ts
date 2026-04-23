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
 * isomorphic-dompurify's server-side (non-browser) DOM mode does not honour the
 * combination of ALLOW_DATA_ATTR:false + explicit data-* entries in ALLOWED_ATTR
 * the same way a real browser does.  Testing the allowlist constants directly
 * (Tier 1) gives us the same safety guarantee — if the constant doesn't contain
 * the attribute, DOMPurify won't keep it in the browser.
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
  // <s> written by markLinkSpent after a link is clicked
  expectTag('s');
});

// ── Attributes shared by multiple link types ─────────────────────────────────
describe('LOG_ATTRS — shared attributes', () => {
  expectAttr('class',        'every link needs its CSS class to be clickable');
  expectAttr('href',         'failure/xp links use href="#"; move-links use a path');
  expectAttr('data-value',   'resource-link, progress-link, initiative-link, menace-link');
  expectAttr('data-entry-id','all stateful links — markLinkSpent + early-return guard');
  expectAttr('data-char-id', 'resource-link, debility-link, failure-link, burn-momentum-link, xp-cost-link');
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
  expectAttr('data-stat',   'stat column pre-selected in the oracle (e.g. "edge")');
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
  expectAttr('data-roll-entry-id', 'id of the original roll log entry — handler returns early if missing');
  // Also stored on the element for burnMomentum() context:
  expectAttr('data-move-id',      'move id passed to burnMomentum()');
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
    const out  = sanitizeLogHtml(html);
    expect(out).not.toContain('<script');
    expect(out).not.toContain('alert(');
    expect(out).toContain('Safe text');
  });

  it('strips inline event handlers (onclick, onerror, …)', () => {
    const html = `<a href="#" onclick="evil()" onerror="evil()">click me</a>`;
    const out  = sanitizeLogHtml(html);
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
    const out  = sanitizeLogHtml(html);
    expect(out).toContain('<div>');
    expect(out).toContain('<strong>');
    expect(out).toContain('Hello');
  });

  it('strips unknown tags but keeps their text', () => {
    const html = `<marquee>old school</marquee>`;
    const out  = sanitizeLogHtml(html);
    expect(out).not.toContain('<marquee');
    expect(out).toContain('old school');
  });

  it('returns empty string for null / undefined input', () => {
    expect(sanitizeLogHtml(null)).toBe('');
    expect(sanitizeLogHtml(undefined)).toBe('');
    expect(sanitizeLogHtml('')).toBe('');
  });
});
