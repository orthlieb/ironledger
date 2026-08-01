// =============================================================================
// Iron Ledger — Session-log / Stories Markdown collectors
//
// The human-readable Markdown flavours of the log + stories exports. Extracted
// out of routes/home/+page.svelte and parameterised by the log entries (they
// previously read the sessionLog store directly) so they're pure and testable.
// HTML→Markdown conversion is shared with the zip exports via exportSerialize.
// =============================================================================

import type { LogEntry } from '$lib/log.svelte.js';
import { parseStorySource } from '$lib/aiSerialize.js';
import { htmlToMd } from '$lib/exportSerialize.js';

/** Full session log as Markdown (newest first), each entry's HTML converted to
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
