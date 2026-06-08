/**
 * markdown.test.ts — renderNote() unit coverage.
 *
 * VowCard, CommunityCard, the session-log note, and CharacterSheet's
 * background field all funnel user-typed text through renderNote().
 * These tests pin the supported markdown subset so a refactor doesn't
 * silently strip a feature that every notes UI relies on.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { renderNote } from '../../src/lib/markdown.js';

describe('renderNote — empty / whitespace input', () => {
	it('returns "" for empty string', () => {
		expect(renderNote('')).toBe('');
	});
	it('returns "" for whitespace-only string', () => {
		expect(renderNote('   \n  \t  ')).toBe('');
	});
});

describe('renderNote — paragraphs', () => {
	it('wraps a single line in <p>', () => {
		expect(renderNote('hello')).toBe('<p>hello</p>');
	});
	it('wraps each line in its own <p>', () => {
		expect(renderNote('one\ntwo')).toBe('<p>one</p><p>two</p>');
	});
	it('emits <br> for blank lines', () => {
		expect(renderNote('one\n\ntwo')).toBe('<p>one</p><br><p>two</p>');
	});
});

describe('renderNote — inline formatting', () => {
	it('renders **bold**', () => {
		expect(renderNote('**bold**')).toBe('<p><strong>bold</strong></p>');
	});
	it('renders *italic*', () => {
		expect(renderNote('*italic*')).toBe('<p><em>italic</em></p>');
	});
	it('renders _italic_', () => {
		expect(renderNote('_italic_')).toBe('<p><em>italic</em></p>');
	});
	it('mixes bold and italic in one line', () => {
		expect(renderNote('a **b** c *d* e')).toBe('<p>a <strong>b</strong> c <em>d</em> e</p>');
	});
});

describe('renderNote — headings', () => {
	it('# → <h3>', () => {
		expect(renderNote('# Title')).toBe('<h3>Title</h3>');
	});
	it('## → <h4>', () => {
		expect(renderNote('## Sub')).toBe('<h4>Sub</h4>');
	});
	it('### → <h5>', () => {
		expect(renderNote('### SubSub')).toBe('<h5>SubSub</h5>');
	});
	it('headings allow inline formatting', () => {
		expect(renderNote('# **bold** title')).toBe('<h3><strong>bold</strong> title</h3>');
	});
});

describe('renderNote — lists', () => {
	it('renders a bullet list with -', () => {
		expect(renderNote('- one\n- two')).toBe('<ul><li>one</li><li>two</li></ul>');
	});
	it('renders a bullet list with *', () => {
		expect(renderNote('* one\n* two')).toBe('<ul><li>one</li><li>two</li></ul>');
	});
	it('renders an ordered list', () => {
		expect(renderNote('1. one\n2. two')).toBe('<ol><li>one</li><li>two</li></ol>');
	});
	it('closes a list when a paragraph follows', () => {
		expect(renderNote('- one\nfollowup')).toBe('<ul><li>one</li></ul><p>followup</p>');
	});
	it('switches between list types cleanly', () => {
		expect(renderNote('- a\n1. b')).toBe('<ul><li>a</li></ul><ol><li>b</li></ol>');
	});
});

describe('renderNote — XSS / escaping', () => {
	it('escapes raw HTML inside paragraphs', () => {
		expect(renderNote('<script>alert(1)</script>')).toBe(
			'<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>',
		);
	});
	it('escapes < > & " in plain text', () => {
		expect(renderNote('a < b & c "d"')).toBe('<p>a &lt; b &amp; c &quot;d&quot;</p>');
	});
	it('escapes HTML inside bold/italic spans', () => {
		expect(renderNote('**<img>**')).toBe('<p><strong>&lt;img&gt;</strong></p>');
	});
	it('escapes HTML inside list items', () => {
		expect(renderNote('- <b>x</b>')).toBe('<ul><li>&lt;b&gt;x&lt;/b&gt;</li></ul>');
	});
});

describe('renderNote — vow-notes integration scenario', () => {
	it('renders a realistic multi-feature vow note', () => {
		const input =
			'# The Iron Heart\n' +
			'Promised to **Edda** the smith.\n' +
			'- recover the shard\n' +
			'- *quietly*\n' +
			'1. find the cave\n' +
			'2. survive';
		expect(renderNote(input)).toBe(
			'<h3>The Iron Heart</h3>' +
				'<p>Promised to <strong>Edda</strong> the smith.</p>' +
				'<ul><li>recover the shard</li><li><em>quietly</em></li></ul>' +
				'<ol><li>find the cave</li><li>survive</li></ol>',
		);
	});
});
