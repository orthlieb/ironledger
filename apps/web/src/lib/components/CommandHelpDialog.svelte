<script lang="ts">
	/**
	 * CommandHelpDialog — cheat-sheet for the command bar.
	 *
	 * Replaces the earlier /help behavior that appended a "Command help" entry
	 * to the log (which cluttered the log and burnt an entry every time). Now
	 * /help and the ? button open this dialog; the log is untouched.
	 *
	 * The command reference (verb, arg shape, tagline) lives here — one row per
	 * command. Keep it in sync with parseCommand() in $lib/commandBar.ts.
	 *
	 * Follows CLAUDE.md's iOS-safe dialog rules: `vh` (not `dvh`), centred via
	 * `top:50%+transform`, no `display:flex` on the dialog itself, `max-height`
	 * on the scrollable body with `overscroll-behavior: contain`.
	 */

	import { headingText } from '$lib/fontStore.svelte.js';
	import DialogHeader from '$lib/components/DialogHeader.svelte';

	let dialogEl = $state<HTMLDialogElement | null>(null);
	/** Verb to highlight and scroll into view — set by open(focus). Cleared
	 *  automatically after ~2.5s so a re-open without focus is unhighlighted. */
	let focusedVerb = $state<string | null>(null);

	export function open(focus?: string) {
		focusedVerb = focus ?? null;
		dialogEl?.showModal();
		if (focus) {
			// Wait for the dialog to paint before scrolling into view.
			queueMicrotask(() => {
				const el = dialogEl?.querySelector(`[data-row-verb="${focus}"]`) as HTMLElement | null;
				el?.scrollIntoView({ behavior: 'auto', block: 'center' });
			});
			// Fade the highlight after a moment so re-opens without focus don't
			// look mysteriously pre-selected.
			setTimeout(() => {
				if (focusedVerb === focus) focusedVerb = null;
			}, 2500);
		}
	}
	export function close() {
		dialogEl?.close();
	}

	interface Row {
		/** Stable id used by open(focus) to scroll a specific row into view. */
		verb: string;
		syntax: string;
		hint: string;
	}
	const COMMANDS: Row[] = [
		{ verb: 'note', syntax: '<text>', hint: 'Bare prose is added to the log as a Note.' },
		{ verb: 'note', syntax: '/note <text>', hint: 'Same as bare prose.' },
		{ verb: 'oracle', syntax: '/oracle <table>', hint: 'Roll an oracle (e.g. /oracle place).' },
		{
			verb: 'move',
			syntax: '/move <name>',
			hint: 'Open a move (e.g. /move face → Face Danger).',
		},
		{ verb: 'char', syntax: '/char <name>', hint: 'Set the active character.' },
		{
			verb: 'char',
			syntax: '/char <op> [n]',
			hint: 'Take harm (-) or heal (+) on the active character. Applies to health, clamped 0..5. n defaults to 1. Examples: /char - (take 1 harm), /char -2, /char +. Absolute health set: /vital health = N.',
		},
		{
			verb: 'foe',
			syntax: '/foe <name>',
			hint: 'Set the active foe.',
		},
		{
			verb: 'foe',
			syntax: '/foe <op> [n]',
			hint: 'Advance the active foe’s combat progress by n boxes (rank-aware ticks). + / - only; no = (ticks vs boxes would be ambiguous). Examples: /foe + (1 box), /foe +2, /foe -.',
		},
		{
			verb: 'foe',
			syntax: '/foe vanquish',
			hint: 'Mark the active foe as vanquished. Does not delete the encounter.',
		},
		{
			verb: 'exp',
			syntax: '/exp <name>',
			hint: 'Set the active expedition (journey or site).',
		},
		{
			verb: 'exp',
			syntax: '/exp <op> [n]',
			hint: 'Advance the active expedition by n progress marks (difficulty-aware ticks). + / - only. Examples: /exp +, /exp -2.',
		},
		{
			verb: 'vital',
			syntax: '/vital <res> <op> [n]',
			hint: 'Adjust a vital on the active character. res: momentum / health / spirit / supply / experience (xp). op: + (delta up), - (delta down), = (set absolute). n defaults to 1 for +/-, is required for =. Examples: /vital momentum +2, /vital health -3, /vital experience = 12.',
		},
		{
			verb: 'debility',
			syntax: '/debility <name> <state>',
			hint: 'Mark a debility on the active character. name: wounded / shaken / unprepared / encumbered / maimed / corrupted / cursed / tormented. state: on / off / toggle (required, no default). Examples: /debility wounded on, /debility shaken toggle.',
		},
		{
			verb: 'bonds',
			syntax: '/bonds <op> [n]',
			hint: 'Edit the bonds track on the active character (0..40). Same operator grammar as /vital: + / - default n=1, = requires an explicit n. Examples: /bonds +, /bonds = 8.',
		},
		{
			verb: 'failures',
			syntax: '/failures <op> [n]',
			hint: 'Edit the failures track on the active character (0..40). Same operator grammar as /vital. Examples: /failures +, /failures = 0.',
		},
		{
			verb: 'initiative',
			syntax: '/initiative <who>',
			hint: 'Set combat initiative on the active character. who: none / character / foe. Examples: /initiative foe, /initiative character.',
		},
		{
			verb: 'start',
			syntax: '/start',
			hint: 'Pin the ▲ start marker on the newest log entry (open, growing selection).',
		},
		{
			verb: 'end',
			syntax: '/end',
			hint: 'Pin the ▼ end marker on the newest log entry (closes the selection).',
		},
		{
			verb: 'story',
			syntax: '/story',
			hint: 'Open the AI-story generate dialog on the current section.',
		},
		{ verb: 'help', syntax: '/help', hint: 'This cheat-sheet.' },
	];
</script>

<dialog bind:this={dialogEl} class="ch-dialog" oncancel={close}>
	<DialogHeader title={headingText('Command Bar')} onclose={close} />

	<div class="ch-body">
		<p class="ch-intro">
			The bar at the bottom of Home takes prose or a slash-command. Autocomplete floats above the
			input; <kbd>Tab</kbd> completes the highlighted suggestion, <kbd>↑</kbd>/<kbd>↓</kbd> move
			through them, <kbd>Esc</kbd> clears the input.
		</p>

		<ul class="ch-list">
			{#each COMMANDS as cmd}
				<li class="ch-row" class:ch-row-focused={focusedVerb === cmd.verb} data-row-verb={cmd.verb}>
					<code class="ch-syntax">{cmd.syntax}</code>
					<span class="ch-hint">{cmd.hint}</span>
				</li>
			{/each}
		</ul>

		<p class="ch-footnote">
			Log entries also carry hover-revealed <span class="ch-marker">▲</span> /
			<span class="ch-marker">▼</span> buttons — click them to pin section markers directly without typing
			a command. The AI-story selection surface is hidden on mobile.
		</p>
	</div>

	<div class="ch-footer">
		<button class="btn" type="button" onclick={close}>Close</button>
	</div>
</dialog>

<style>
	.ch-dialog {
		border: none;
		padding: 0;
		border-radius: 10px;
		position: fixed;
		top: 50%;
		left: 50%;
		margin: 0;
		transform: translate(-50%, -50%);
		width: min(480px, calc(100vw - 2rem));
		max-height: 82vh;
		overflow: hidden;
		background: var(--bg-card);
		color: var(--text);
		box-shadow:
			0 16px 48px #00000070,
			0 0 0 1px var(--border-mid);
		outline: none;
	}
	.ch-dialog::backdrop {
		background: #00000060;
		backdrop-filter: blur(1px);
	}

	.ch-body {
		padding: 14px;
		max-height: calc(82vh - 6rem);
		overflow-y: auto;
		overscroll-behavior: contain;
	}

	.ch-intro {
		font-family: var(--font-ui);
		font-size: 0.82rem;
		line-height: 1.5;
		color: var(--text-muted);
		margin: 0 0 12px;
	}
	.ch-intro kbd {
		display: inline-block;
		padding: 0 5px;
		font-family: var(--font-mono, 'Roboto Mono', ui-monospace, monospace);
		font-size: 0.72rem;
		color: var(--text);
		background: var(--bg-inset);
		border: 1px solid var(--border-mid);
		border-radius: 3px;
	}

	.ch-list {
		list-style: none;
		margin: 0 0 14px;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.ch-row {
		display: grid;
		grid-template-columns: minmax(130px, max-content) 1fr;
		gap: 10px;
		padding: 5px 7px;
		border-radius: 4px;
		align-items: baseline;
	}
	.ch-row:nth-child(odd) {
		background: color-mix(in srgb, var(--text-accent) 4%, transparent);
	}
	.ch-row-focused {
		background: color-mix(in srgb, var(--text-accent) 20%, transparent) !important;
		box-shadow: inset 3px 0 0 0 var(--text-accent);
	}
	.ch-syntax {
		font-family: var(--font-mono, 'Roboto Mono', ui-monospace, monospace);
		font-size: 0.78rem;
		font-weight: 600;
		color: var(--text-accent);
		white-space: nowrap;
	}
	.ch-hint {
		font-family: var(--font-ui);
		font-size: 0.78rem;
		line-height: 1.45;
		color: var(--text-muted);
	}

	.ch-footnote {
		font-family: var(--font-ui);
		font-size: 0.72rem;
		line-height: 1.5;
		color: var(--text-dimmer);
		margin: 0;
		padding-top: 8px;
		border-top: 1px solid var(--border);
	}
	.ch-marker {
		color: var(--text-accent);
		font-weight: 700;
	}

	.ch-footer {
		display: flex;
		justify-content: flex-end;
		padding: 10px 14px;
		border-top: 1px solid var(--border);
		background: var(--bg-inset);
	}
</style>
