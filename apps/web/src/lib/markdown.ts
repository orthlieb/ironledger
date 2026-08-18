// =============================================================================
// Iron Ledger — Lightweight Markdown → HTML renderer
// Used for user-authored log entry notes.
//
// Supported syntax:
//   # Heading      → <h3>
//   ## Heading     → <h4>
//   ### Heading    → <h5>
//   - item         → <ul><li>
//   * item         → <ul><li>
//   1. item        → <ol><li>
//   > quote        → <blockquote> (consecutive lines join with <br>)
//   **bold**       → <strong>
//   *italic*       → <em>
//   _italic_       → <em>
//   blank line     → paragraph break (closes any open list / blockquote)
// =============================================================================

/** Escape HTML special characters in plain text nodes. */
function escHtml(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

/**
 * Apply inline formatting (**bold**, *italic*, _italic_) to a plain-text
 * segment and return the HTML string.
 */
function applyInline(text: string): string {
	// Split on **…**, *…*, or _…_ spans, then classify each segment.
	return text
		.split(/(\*\*[^*]+\*\*|\*[^*]+\*|_[^_]+_)/g)
		.map((seg) => {
			if (/^\*\*(.+)\*\*$/.test(seg)) {
				return `<strong>${escHtml(seg.slice(2, -2))}</strong>`;
			}
			if (/^\*(.+)\*$/.test(seg) || /^_(.+)_$/.test(seg)) {
				return `<em>${escHtml(seg.slice(1, -1))}</em>`;
			}
			return escHtml(seg);
		})
		.join('');
}

/**
 * Convert a user note (plain text with simple Markdown) to an HTML string.
 * Safe to use with Svelte's {@html} — all untrusted text is escHtml-encoded.
 */
export function renderNote(text: string): string {
	if (!text?.trim()) return '';

	const lines = text.split('\n');
	const parts: string[] = [];

	let listTag: 'ul' | 'ol' | null = null;
	let inQuote = false;

	function closeList() {
		if (listTag) {
			parts.push(`</${listTag}>`);
			listTag = null;
		}
	}
	function closeQuote() {
		if (inQuote) {
			parts.push('</blockquote>');
			inQuote = false;
		}
	}

	for (const rawLine of lines) {
		const line = rawLine.trimEnd();

		const isBullet = /^[-*]\s+/.test(line);
		const isOrdered = /^\d+\.\s+/.test(line);
		const heading = line.match(/^(#{1,3})\s+(.*)/);
		const quote = line.match(/^>\s?(.*)/);

		if (heading) {
			closeList();
			closeQuote();
			const tag = ({ 1: 'h3', 2: 'h4', 3: 'h5' } as Record<number, string>)[heading[1].length];
			parts.push(`<${tag}>${applyInline(heading[2])}</${tag}>`);
		} else if (isBullet) {
			closeQuote();
			if (listTag !== 'ul') {
				closeList();
				parts.push('<ul>');
				listTag = 'ul';
			}
			parts.push(`<li>${applyInline(line.replace(/^[-*]\s+/, ''))}</li>`);
		} else if (isOrdered) {
			closeQuote();
			if (listTag !== 'ol') {
				closeList();
				parts.push('<ol>');
				listTag = 'ol';
			}
			parts.push(`<li>${applyInline(line.replace(/^\d+\.\s+/, ''))}</li>`);
		} else if (quote) {
			// Consecutive `>` lines share one blockquote; join them with <br>.
			closeList();
			if (!inQuote) {
				parts.push('<blockquote>');
				inQuote = true;
			} else {
				parts.push('<br>');
			}
			parts.push(applyInline(quote[1]));
		} else if (line === '') {
			closeList();
			closeQuote();
			parts.push('<br>');
		} else {
			closeList();
			closeQuote();
			parts.push(`<p>${applyInline(line)}</p>`);
		}
	}

	closeList();
	closeQuote();
	return parts.join('');
}
