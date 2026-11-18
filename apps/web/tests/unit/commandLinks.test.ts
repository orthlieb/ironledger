/**
 * Command links (#lib/commands/links.ts): how a link in content or an
 * app-written entry is rendered, bound to its entry, read back on a click,
 * and struck through once spent.
 */
import { describe, it, expect } from 'vitest';
import {
	bindCommandLinks,
	commandLinkHtml,
	commandLinksIn,
	linkVerb,
	presetCommandLinks,
	readCommandLink,
	spendCommandLink,
} from '../../src/lib/commands/links.js';

describe('commandLinkHtml', () => {
	it('puts the class first and the command in data-cmd', () => {
		expect(commandLinkHtml('+1 momentum', '/momentum++')).toBe(
			'<a class="cmd-link" data-cmd="/momentum++">+1 momentum</a>',
		);
	});

	it('marks a link that opens something with its verb', () => {
		expect(commandLinkHtml('Face Danger', '/move face-danger')).toContain('data-verb="move"');
		expect(commandLinkHtml('Region', '/oracle region')).toContain('data-verb="oracle"');
		expect(commandLinkHtml('burn', '/burn')).toContain('data-verb="burn"');
		expect(commandLinkHtml('+1', '/health++')).not.toContain('data-verb');
	});

	it('carries a binding given up front', () => {
		expect(commandLinkHtml('burn', '/burn', { charId: 'c1', rollId: 'r1' })).toBe(
			'<a class="cmd-link" data-cmd="/burn" data-verb="burn" data-char-id="c1" data-roll-entry-id="r1">burn</a>',
		);
	});
});

describe('bindCommandLinks', () => {
	const two =
		'<p><a class="cmd-link" data-cmd="/health++">+1 health</a> or ' +
		'<a class="cmd-link" data-cmd="/health++">+1 health</a></p>';

	it('gives each link the entry, its place in it, and the binding', () => {
		const out = bindCommandLinks(two, 'e1', { charId: 'c1', foeId: 'f1', vowId: 'v1', harm: 3 });
		expect(out).toBe(
			'<p><a class="cmd-link" data-cmd="/health++" data-entry-id="e1" data-link="0" data-char-id="c1" data-foe-id="f1" data-vow-id="v1" data-harm="3">+1 health</a> or ' +
				'<a class="cmd-link" data-cmd="/health++" data-entry-id="e1" data-link="1" data-char-id="c1" data-foe-id="f1" data-vow-id="v1" data-harm="3">+1 health</a></p>',
		);
	});

	it('keeps a binding a link already carries', () => {
		const html = commandLinkHtml('Reduce', '/momentum=4', { charId: 'mine' });
		expect(bindCommandLinks(html, 'e1', { charId: 'other' })).toBe(
			'<a class="cmd-link" data-cmd="/momentum=4" data-char-id="mine" data-entry-id="e1" data-link="0">Reduce</a>',
		);
	});

	it('leaves other links and text alone', () => {
		const html = '<a href="https://example.com">site</a> <a class="resource-link">old</a>';
		expect(bindCommandLinks(html, 'e1', { charId: 'c1' })).toBe(html);
	});
});

describe('readCommandLink', () => {
	it('reads the command, the binding, the entry and the place', () => {
		const host = document.createElement('div');
		host.innerHTML = bindCommandLinks(
			commandLinkHtml('Endure', '/move endure-harm', { stat: 'edge' }),
			'e9',
			{ charId: 'c1', companionId: 'companion/hawk', harm: 2, rollId: 'r1' },
		);
		const a = host.querySelector('a') as HTMLElement;
		expect(readCommandLink(a)).toEqual({
			cmd: '/move endure-harm',
			entryId: 'e9',
			index: 0,
			bind: {
				charId: 'c1',
				foeId: undefined,
				expId: undefined,
				vowId: undefined,
				companionId: 'companion/hawk',
				selfId: undefined,
				harm: 2,
				rollId: 'r1',
				stat: 'edge',
			},
		});
	});

	it('takes the entry from the log entry around an unbound link', () => {
		const host = document.createElement('div');
		host.innerHTML =
			'<div class="log-entry" data-entry-id="outer"><a class="cmd-link" data-cmd="/health++">+1</a></div>';
		const r = readCommandLink(host.querySelector('a') as HTMLElement);
		expect(r.entryId).toBe('outer');
		expect(r.index).toBeUndefined();
	});
});

describe('spendCommandLink', () => {
	const bound = bindCommandLinks(
		'<li><a class="cmd-link" data-cmd="/health++">+1 health</a></li>' +
			'<li><a class="cmd-link" data-cmd="/health++">+1 health</a></li>',
		'e1',
		{ charId: 'c1' },
	);

	it('strikes the link at its place, not the first that reads alike', () => {
		const out = spendCommandLink(bound, 1, '/health++');
		expect(out).toContain(
			'<li><a class="cmd-link" data-cmd="/health++" data-entry-id="e1" data-link="0"',
		);
		expect(out).toContain('<li><s class="resource-spent">+1 health</s></li>');
	});

	it('strikes the one with that command when two share a place', () => {
		// Saved before an entry was bound in one piece: two links at place 0.
		const html =
			'<a class="cmd-link" data-cmd="/move pay-the-price" data-link="0">Pay the Price</a> ' +
			'<a class="cmd-link" data-cmd="/failures++" data-link="0">+1 failure</a>';
		expect(spendCommandLink(html, 0, '/failures++')).toBe(
			'<a class="cmd-link" data-cmd="/move pay-the-price" data-link="0">Pay the Price</a> ' +
				'<s class="resource-spent">+1 failure</s>',
		);
	});

	it('strikes the first with that command when the link has no place', () => {
		const html = '<a class="cmd-link" data-cmd="/foe.progress+=2">harm</a>';
		expect(spendCommandLink(html, undefined, '/foe.progress+=2')).toBe(
			'<s class="resource-spent">harm</s>',
		);
	});
});

describe('linkVerb and commandLinksIn', () => {
	it('tells a verb link from a value link', () => {
		expect(linkVerb('/oracle region')).toEqual({ verb: 'oracle', arg: 'region' });
		expect(linkVerb('/foe.progress++')).toBeNull();
	});

	it('lists the command links in some HTML', () => {
		const html =
			commandLinkHtml('a &amp; b', '/hawk.name="A&B"') + ' ' + commandLinkHtml('x', '/momentum++');
		expect(commandLinksIn(html)).toEqual([
			{ cmd: '/hawk.name="A&B"', label: 'a &amp; b' },
			{ cmd: '/momentum++', label: 'x' },
		]);
	});
});

describe('presetCommandLinks', () => {
	it('gives links a binding before their entry binds the rest', () => {
		const html = presetCommandLinks(
			commandLinkHtml('+1', '/health++') + commandLinkHtml('x', '/self.health--', { selfId: 'a' }),
			{ selfId: 'path/herbalist' },
		);
		expect(html).toBe(
			'<a class="cmd-link" data-cmd="/health++" data-self-id="path/herbalist">+1</a>' +
				'<a class="cmd-link" data-cmd="/self.health--" data-self-id="a">x</a>',
		);
		expect(bindCommandLinks(html, 'e1', { charId: 'c1' })).toContain(
			'data-self-id="path/herbalist" data-entry-id="e1" data-link="0" data-char-id="c1"',
		);
	});
});
