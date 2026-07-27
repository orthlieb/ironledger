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
	 * bits-ui Dialog under the hood — Portal + Overlay + Content. Escape /
	 * focus trap / body scroll-lock all handled by the primitive.
	 */

	import { headingText } from '$lib/fontStore.svelte.js';
	import { Dialog } from 'bits-ui';
	import DialogHeader from '$lib/components/DialogHeader.svelte';

	let dialogOpen = $state(false);
	let contentEl = $state<HTMLElement | null>(null);
	/** Verb to highlight and scroll into view — set by open(focus). Cleared
	 *  automatically after ~2.5s so a re-open without focus is unhighlighted. */
	let focusedVerb = $state<string | null>(null);

	export function open(focus?: string) {
		focusedVerb = focus ?? null;
		dialogOpen = true;
		if (focus) {
			// Wait for the dialog to paint before scrolling into view.
			queueMicrotask(() => {
				const el = contentEl?.querySelector(`[data-row-verb="${focus}"]`) as HTMLElement | null;
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
		dialogOpen = false;
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
			hint: 'Take harm (-) or heal (+) on the active character. Applies to health, clamped 0..5. Bare /char - takes the active foe’s rank harm (troublesome=1 … epic=5) when a foe is set — otherwise 1. Explicit /char -N ignores the foe. Bare /char + heals 1. Absolute health set: /vital health = N.',
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
			verb: 'foe',
			syntax: '/foe active',
			hint: 'Reactivate a previously-vanquished active foe (opposite of vanquish). No-ops if the foe is already active.',
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
			verb: 'exp',
			syntax: '/exp complete',
			hint: 'Mark the active expedition complete (analog to /foe vanquish). Preserves ticks, notes, and the expedition id.',
		},
		{
			verb: 'exp',
			syntax: '/exp active',
			hint: 'Reactivate a previously-completed expedition (inverse of /exp complete). No-op if the expedition is already active.',
		},
		{
			verb: 'vital',
			syntax: '/vital <name> <op> [n]',
			hint: 'Adjust a vital on the active character. name: momentum / health / spirit / supply / experience (xp). op: + (delta up), - (delta down), = (set absolute). n defaults to 1 for +/-, is required for =. Examples: /vital momentum +2, /vital health -3, /vital experience = 12.',
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
		{
			verb: 'roll',
			syntax: '/roll <group>+',
			hint: 'Roll dice. A group is [n]d<sides>[±k]: n defaults to 1, sides ∈ {4, 6, 8, 10, 12, 20, 100}, k is an optional flat modifier. Up to 4 groups per /roll. Drives the 3D dice animation if enabled. Examples: /roll 2d10 1d6+2 (action roll), /roll d100 (oracle), /roll 3d6.',
		},
	];
</script>

<Dialog.Root bind:open={dialogOpen}>
	<Dialog.Portal>
		<Dialog.Overlay class="ch-overlay" />
		<Dialog.Content bind:ref={contentEl} class="ch-dialog">
			<DialogHeader title={headingText('Command Bar')} onclose={close} />

			<div class="ch-body">
				<p class="ch-intro">
					The bar at the bottom of Home takes prose or a slash-command. Autocomplete floats above
					the input; <kbd>Tab</kbd> completes the highlighted suggestion, <kbd>↑</kbd>/<kbd>↓</kbd>
					move through them, <kbd>Esc</kbd> clears the input.
				</p>

				<ul class="ch-list">
					{#each COMMANDS as cmd}
						<li
							class="ch-row"
							class:ch-row-focused={focusedVerb === cmd.verb}
							data-row-verb={cmd.verb}
						>
							<code class="ch-syntax">{cmd.syntax}</code>
							<span class="ch-hint">{cmd.hint}</span>
						</li>
					{/each}
				</ul>

				<p class="ch-footnote">
					Log entries also carry hover-revealed <span class="ch-marker">▲</span> /
					<span class="ch-marker">▼</span> buttons — click them to pin section markers directly without
					typing a command. The AI-story selection surface is hidden on mobile.
				</p>
			</div>

			<div class="ch-footer">
				<button class="btn" type="button" onclick={close}>Close</button>
			</div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<style>
	/* bits-ui portals Content + Overlay to <body> — scope everything
	   globally so Svelte's CSS pruning can see through the portal.
	   Overlay 80 / content 81 matches the modal z-index tier. */
	:global(.ch-overlay) {
		position: fixed;
		inset: 0;
		background: #00000060;
		backdrop-filter: blur(1px);
		z-index: 80;
	}
	:global(.ch-dialog) {
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: min(480px, calc(100vw - 2rem));
		max-height: 82vh;
		overflow: hidden;
		background: var(--bg-card);
		color: var(--text);
		border-radius: 10px;
		box-shadow:
			0 16px 48px #00000070,
			0 0 0 1px var(--border-mid);
		outline: none;
		z-index: 81;
	}

	:global(.ch-body) {
		padding: 14px;
		max-height: calc(82vh - 6rem);
		overflow-y: auto;
		overscroll-behavior: contain;
	}

	:global(.ch-intro) {
		font-family: var(--font-ui);
		font-size: 0.82rem;
		line-height: 1.5;
		color: var(--text-muted);
		margin: 0 0 12px;
	}
	:global(.ch-intro kbd) {
		display: inline-block;
		padding: 0 5px;
		font-family: var(--font-mono, 'Roboto Mono', ui-monospace, monospace);
		font-size: 0.72rem;
		color: var(--text);
		background: var(--bg-inset);
		border: 1px solid var(--border-mid);
		border-radius: 3px;
	}

	:global(.ch-list) {
		list-style: none;
		margin: 0 0 14px;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	:global(.ch-row) {
		display: grid;
		grid-template-columns: minmax(130px, max-content) 1fr;
		gap: 10px;
		padding: 5px 7px;
		border-radius: 4px;
		align-items: baseline;
	}
	:global(.ch-row:nth-child(odd)) {
		background: color-mix(in srgb, var(--text-accent) 4%, transparent);
	}
	:global(.ch-row-focused) {
		background: color-mix(in srgb, var(--text-accent) 20%, transparent) !important;
		box-shadow: inset 3px 0 0 0 var(--text-accent);
	}
	:global(.ch-syntax) {
		font-family: var(--font-mono, 'Roboto Mono', ui-monospace, monospace);
		font-size: 0.78rem;
		font-weight: 600;
		color: var(--text-accent);
		white-space: nowrap;
	}
	:global(.ch-hint) {
		font-family: var(--font-ui);
		font-size: 0.78rem;
		line-height: 1.45;
		color: var(--text-muted);
	}

	:global(.ch-footnote) {
		font-family: var(--font-ui);
		font-size: 0.72rem;
		line-height: 1.5;
		color: var(--text-dimmer);
		margin: 0;
		padding-top: 8px;
		border-top: 1px solid var(--border);
	}
	:global(.ch-marker) {
		color: var(--text-accent);
		font-weight: 700;
	}

	:global(.ch-footer) {
		display: flex;
		justify-content: flex-end;
		padding: 10px 14px;
		border-top: 1px solid var(--border);
		background: var(--bg-inset);
	}
</style>
