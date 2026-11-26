// =============================================================================
// Iron Ledger — Markdown for the exports: the log, stories, characters, maps
//
// The human-readable Markdown pieces of the exports: the session log, stories,
// a character's page, and a map as an SVG with numbered pins. Pure (callers
// pass in what they read from the stores), so they're testable; the bundle
// that strings them together is campaignExport.svelte.ts. HTML→Markdown
// conversion is shared with the zip exports via exportSerialize.
// =============================================================================

import type { LogEntry } from '#lib/log.svelte.js';
import { parseStorySource } from '#lib/aiSerialize.js';
import { htmlToMd, formatTicks } from '#lib/exportSerialize.js';

/** Full session log as Markdown (oldest first), each entry's HTML converted to
 *  Markdown, with any note rendered as a blockquote. */
export function logToMarkdown(entries: LogEntry[]): string {
	if (entries.length === 0) return '# Session Log\n\n_No entries._\n';
	const stamp = new Date().toLocaleString(undefined, {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
	});
	const lines = ['# Session Log', `_Exported ${stamp}_`, '', '---', ''];
	[...entries].reverse().forEach((entry) => {
		const time = new Date(entry.ts).toLocaleString(undefined, {
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
		});
		lines.push(`## ${entry.title}  —  ${time}`, '', htmlToMd(entry.html));
		if (entry.note?.trim()) {
			lines.push('');
			entry.note.split('\n').forEach((l) => lines.push(`> ${l}`));
		}
		lines.push('');
	});
	return lines.join('\n').trimEnd();
}

/** Markdown of every AI-generated Story entry (title + its raw prose). */
export function storiesToMarkdown(entries: LogEntry[]): string {
	const stories = [...entries]
		.reverse()
		.map((e) => ({ entry: e, story: parseStorySource(e.source) }))
		.filter(
			(x): x is { entry: (typeof x)['entry']; story: NonNullable<(typeof x)['story']> } =>
				x.story !== null,
		);
	if (stories.length === 0) return '# Stories\n\n_No stories yet._\n';
	const stamp = new Date().toLocaleString(undefined, {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
	});
	const lines = ['# Stories', `_Exported ${stamp}_`, '', '---', ''];
	stories.forEach(({ entry, story }) => {
		// Prefer the exact markdown the model produced; fall back to the rendered HTML.
		const body = story.md?.trim() || htmlToMd(entry.html);
		lines.push(`## ${entry.title}`, '', body, '', '---', '');
	});
	return lines.join('\n').trimEnd() + '\n';
}

/**
 * A character's page in the Markdown export: name, portrait, background,
 * initiative, the Details tab's fields, stats, vitals, global counters,
 * progress (with the Bonds and Failures notes), debilities, vows and assets.
 * `portrait` is the image's path relative to the page; `fields` the Details
 * section (characterFields' `fieldsMarkdown`); `assets` the catalogue, for
 * asset names and categories.
 */
export function characterMarkdown(
	name: string,
	d: Record<string, unknown>,
	opts: {
		portrait?: string;
		fields: string[];
		assets: ReadonlyArray<{ id: string; name: string; category?: string }>;
	},
): string {
	const lines: string[] = [];
	lines.push(`# ${name || 'Unnamed Character'}`, '');
	if (opts.portrait) lines.push(`![Portrait](${opts.portrait})`, '');
	if (d.background) lines.push(`**Background:** ${d.background}`, '');
	const initiativeLabels: Record<number, string> = {
		0: 'None',
		1: 'You have initiative',
		2: 'Foe has initiative',
	};
	const init = d.initiative as number | undefined;
	if (init !== undefined && init !== null)
		lines.push(`**Initiative:** ${initiativeLabels[init] ?? init}`, '');
	// The Details tab: Region of origin and the extensions' fields.
	lines.push(...opts.fields);
	lines.push(
		'## Stats',
		`| Edge | Heart | Iron | Shadow | Wits |`,
		`|------|-------|------|--------|------|`,
		`| ${d.edge ?? 0} | ${d.heart ?? 0} | ${d.iron ?? 0} | ${d.shadow ?? 0} | ${d.wits ?? 0} |`,
		'',
	);
	lines.push(
		'## Resources',
		`- **Health:** ${d.health ?? 0}/5`,
		`- **Spirit:** ${d.spirit ?? 0}/5`,
		`- **Supply:** ${d.supply ?? 0}/5`,
		`- **Momentum:** ${d.momentum ?? 0}`,
		'',
	);
	const gv = d.globalValues as Record<string, string> | undefined;
	if (gv && Object.keys(gv).length > 0) {
		lines.push('## Counters');
		Object.entries(gv).forEach(([k, v]) =>
			lines.push(`- **${k.charAt(0).toUpperCase() + k.slice(1)}:** ${v}`),
		);
		lines.push('');
	}
	lines.push(
		'## Progress',
		`- **XP:** ${d.xp ?? 0}`,
		`- **Bonds:** ${formatTicks(Number(d.bonds ?? 0))}`,
	);
	if ((d.bondsFormed as string | undefined)?.trim())
		lines.push(`  - Bonds Formed: ${(d.bondsFormed as string).trim()}`);
	lines.push(`- **Failures:** ${formatTicks(Number(d.failures ?? 0))}`);
	if ((d.lessonsLearned as string | undefined)?.trim())
		lines.push(`  - Lessons Learned: ${(d.lessonsLearned as string).trim()}`);
	lines.push('');
	const debilities = [
		'wounded',
		'unprepared',
		'shaken',
		'encumbered',
		'maimed',
		'corrupted',
		'cursed',
		'tormented',
	];
	const active = debilities.filter((k) => d[k]);
	if (active.length) {
		lines.push('## Debilities');
		active.forEach((k) => lines.push(`- ${k.charAt(0).toUpperCase() + k.slice(1)}`));
		lines.push('');
	}
	const vows = d.vows as
		| Array<{
				name: string;
				difficulty: string;
				ticks: number;
				threat?: string;
				menace?: number;
				notes?: string;
		  }>
		| undefined;
	if (vows?.length) {
		lines.push('## Vows');
		vows.forEach((v) => {
			lines.push(`- **${v.name}** (${v.difficulty}) — ${formatTicks(v.ticks)}`);
			if (v.threat?.trim()) lines.push(`  - Threat: ${v.threat.trim()}`);
			if (v.menace) lines.push(`  - Menace: ${v.menace}/10`);
			if (v.notes?.trim()) lines.push(`  - Notes: ${v.notes.trim()}`);
		});
		lines.push('');
	}
	const assets = d.assets as Array<{ assetId: string; abilities: boolean[] }> | undefined;
	if (assets?.length) {
		lines.push('## Assets');
		assets.forEach((a) => {
			const def = opts.assets.find((x) => x.id === a.assetId);
			lines.push(
				`- **${def?.name ?? a.assetId}** (${def?.category ?? '?'}) — ${a.abilities.filter(Boolean).length}/${a.abilities.length} abilities`,
			);
		});
	}
	return lines.join('\n').trimEnd() + '\n';
}

// ── Campaign maps ────────────────────────────────────────────────────────────

const svgEsc = (v: string) =>
	v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * A legible number colour for a map pin of this fill: a light disc (a pale
 * water or site marker) needs a dark number, a dark disc a white one, or the
 * white-on-white number vanishes. White for a colour it can't read.
 */
export function pinInk(color: string): string {
	const hex = color.trim().replace(/^#/, '');
	const h =
		hex.length === 3
			? hex
					.split('')
					.map((c) => c + c)
					.join('')
			: hex;
	if (!/^[0-9a-fA-F]{6}$/.test(h)) return '#fff';
	const r8 = parseInt(h.slice(0, 2), 16);
	const g8 = parseInt(h.slice(2, 4), 16);
	const b8 = parseInt(h.slice(4, 6), 16);
	// Perceived luminance (ITU-R BT.601); >0.6 ⇒ light fill ⇒ dark ink.
	const lum = (0.299 * r8 + 0.587 * g8 + 0.114 * b8) / 255;
	return lum > 0.6 ? '#1a1a1a' : '#fff';
}

/**
 * A map as a self-contained, scalable SVG: the background as a data URI under
 * a numbered pin per marker. Vector so it never gets "too small", and numbers
 * rather than overlapping labels keep a dense map legible; the page's legend
 * maps each number to its entity.
 */
export function mapSvg(
	bg: string,
	cols: number,
	rows: number,
	markers: Array<Record<string, unknown>>,
): string {
	const r = Math.max(cols, rows) * 0.009 + 0.125;
	const pins = markers
		.map((mk, idx) => {
			const x = Number(mk.x) || 0;
			const y = Number(mk.y) || 0;
			const color = typeof mk.color === 'string' && mk.color ? mk.color : '#e63946';
			const ink = pinInk(color);
			// A halo stroke opposite the ink keeps the number crisp against
			// the disc even where the fill sits near the luminance cutoff.
			const halo = ink === '#fff' ? '#1a1a1a' : '#fff';
			return (
				`<g><circle cx="${x}" cy="${y}" r="${r}" fill="${svgEsc(color)}" stroke="#fff" stroke-width="${r * 0.14}"/>` +
				`<text x="${x}" y="${y}" font-size="${r * 0.575}" fill="${ink}" stroke="${halo}" stroke-width="${r * 0.03}" font-family="sans-serif" font-weight="700" text-anchor="middle" dominant-baseline="central">${idx + 1}</text></g>`
			);
		})
		.join('');
	return (
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${cols} ${rows}">` +
		`<image href="${bg}" x="0" y="0" width="${cols}" height="${rows}" preserveAspectRatio="none"/>` +
		pins +
		`</svg>`
	);
}
