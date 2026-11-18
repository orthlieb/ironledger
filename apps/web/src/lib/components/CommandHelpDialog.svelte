<script lang="ts">
	/**
	 * CommandHelpDialog — the command language at a glance
	 * (docs/command-language.md, docs/command-bar.md).
	 *
	 * Opened by the bar's ? button and by /help; /help with a topic (one of
	 * HELP_TOPICS: values, tracks, owners, active, verbs, keys) opens it at that
	 * section, highlighted for a moment. Nothing here runs a command: it's the
	 * reference, and the bar's typeahead does the remembering.
	 *
	 * bits-ui Dialog under the hood — Portal + Overlay + Content. Escape /
	 * focus trap / body scroll-lock all handled by the primitive.
	 */

	import { headingText } from '#lib/fontStore.svelte.js';
	import { Dialog } from 'bits-ui';
	import DialogHeader from '#lib/components/DialogHeader.svelte';
	import { pushDialog, popDialog, overlayZ, contentZ } from '#lib/dialogStack.svelte.js';
	import { HELP_TOPICS } from '#lib/commands/suggest.js';

	let dialogOpen = $state(false);
	let stackDepth = $state(1);
	$effect(() => {
		if (!dialogOpen) return;
		stackDepth = pushDialog();
		return () => popDialog();
	});
	let contentEl = $state<HTMLElement | null>(null);
	/** The topic to highlight and scroll to — set by open(topic), cleared
	 *  after a moment so a later open without one isn't highlighted. */
	let focusedTopic = $state<string | null>(null);

	export function open(topic?: string) {
		const t = topic && HELP_TOPICS.some((h) => h.id === topic) ? topic : null;
		focusedTopic = t;
		dialogOpen = true;
		if (t) {
			// Wait for the dialog to paint before scrolling to the section.
			setTimeout(() => {
				const el = contentEl?.querySelector(`[data-topic="${t}"]`) as HTMLElement | null;
				el?.scrollIntoView({ behavior: 'auto', block: 'start' });
			}, 0);
			setTimeout(() => {
				if (focusedTopic === t) focusedTopic = null;
			}, 2500);
		}
	}
	export function close() {
		dialogOpen = false;
	}

	interface Row {
		syntax: string;
		hint: string;
	}
	/** One section per help topic, in HELP_TOPICS order. */
	const SECTIONS: Record<string, Row[]> = {
		values: [
			{ syntax: '/health', hint: 'Show a value. Naming something only shows it.' },
			{ syntax: '/momentum++', hint: 'Add 1. On a true/false value, mark it (if it isn’t).' },
			{
				syntax: '/supply--',
				hint: 'Take away 1. On a true/false value, clear it (if it’s marked).',
			},
			{ syntax: '/health+=2', hint: 'Add an amount, a positive whole number.' },
			{
				syntax: '/health-=harm',
				hint: 'Take the active foe’s harm, by its rank: Troublesome 1 to Epic 5.',
			},
			{ syntax: '/xp=12', hint: 'Set it: a number, a list’s option, or text. =-2 sets −2.' },
			{ syntax: '/wounded!', hint: 'Flip a true/false value.' },
			{ syntax: '/initiative=foe', hint: 'A list takes one of its options: none, character, foe.' },
			{
				syntax: 'Values',
				hint: 'momentum, health, spirit, supply (the party’s), xp, edge, heart, iron, shadow, wits, bonds, failures, the debilities (wounded, shaken … tormented), initiative, and content-pack fields such as mana or touched. A change is held to the value’s range, refused if it’s read-only, and logged as a click on the sheet would be.',
			},
		],
		tracks: [
			{
				syntax: '/foe.progress++',
				hint: 'Mark progress once: one mark by rank (Troublesome 12 ticks, Dangerous 8, Formidable 4, Extreme 2, Epic 1).',
			},
			{ syntax: '/foe.progress+=2', hint: 'Two marks, by rank.' },
			{ syntax: '/foe.progress+=1b', hint: 'One box (4 ticks), whatever the rank.' },
			{ syntax: '/foe.progress+=3t', hint: 'Three ticks.' },
			{ syntax: '/foe.progress=4b', hint: 'Set the track: 4 boxes.' },
			{ syntax: '/bonds++', hint: 'Bonds and failures have no rank: a plain number is ticks.' },
		],
		owners: [
			{
				syntax: '/Bjorn.health-=2',
				hint: 'Another character’s value, without making them active.',
			},
			{
				syntax: '/foe.progress++',
				hint: 'The active foe. character, journey, site and scene name the active one too.',
			},
			{ syntax: '/Wolf.progress++', hint: 'A foe, journey, site, scene or vow by its name.' },
			{
				syntax: '/hawk.health--',
				hint: 'An asset of the active character, by name or id (/companion/hawk.health--), or a companion by the name you gave it (/Ash.health--).',
			},
			{
				syntax: '/companions.health++',
				hint: 'Every companion of the active character at once (not other characters).',
			},
			{
				syntax: '/allies.spirit++',
				hint: 'Every other character at once; /everyone.spirit++ is you and them.',
			},
			{ syntax: '/Avenge Bjorn.menace++', hint: 'A vow’s progress, menace or status.' },
			{
				syntax: '/foe.vanquished++',
				hint: 'Vanquish a foe; /journey.complete++ completes an expedition; -- undoes either.',
			},
			{ syntax: '/scene.countdown++', hint: 'Fill a segment of the scene’s countdown.' },
			{
				syntax: '/site.theme',
				hint: 'Open the site’s theme picker; /site.theme=Ancient sets it. Also domain.',
			},
			{
				syntax: '/foe:Barrow.progress++',
				hint: 'When a name means two things, put the kind before it. #2 picks the second of two with one name: /foe:Raider#2. Typeahead writes these when they’re needed.',
			},
			{
				syntax: '/"Wolf.Bane".progress++',
				hint: 'Quote a name that holds a dot or an operator, or reads as a value or keyword.',
			},
			{
				syntax: '/supply++',
				hint: 'A party value (supply) has one home, so it takes no owner.',
			},
		],
		active: [
			{ syntax: '/character=Bjorn', hint: 'Make Bjorn the active character.' },
			{ syntax: '/foe=Wolf', hint: 'Make Wolf the active foe. /foe=Raider#2 between two Raiders.' },
			{
				syntax: '/journey=The Long Road',
				hint: 'Also /site= and /scene=: one expedition is active at a time.',
			},
			{ syntax: '/foe', hint: 'Show the active foe (or journey, site, scene, character).' },
		],
		verbs: [
			{
				syntax: '/move face danger',
				hint: 'Open a move. A number after it is the harm or amount it asks for: /move endure harm 2.',
			},
			{ syntax: '/oracle region', hint: 'Open an oracle.' },
			{
				syntax: '/roll 2d10 1d6+2',
				hint: 'Roll dice: [n]d sides [±k], sides 4, 6, 8, 10, 12, 20 or 100, up to 4 groups.',
			},
			{ syntax: '/note …', hint: 'Add a note to the log. Plain text does the same.' },
			{ syntax: '/burn', hint: 'Burn momentum on the newest action roll, when that improves it.' },
			{
				syntax: '/story start',
				hint: 'Mark the newest log entry as the start of a story section; /story end marks its end; /story write opens Generate on it.',
			},
			{ syntax: '/help tracks', hint: 'This help, at a topic.' },
		],
		keys: [
			{
				syntax: 'Tab',
				hint: 'Take the highlighted suggestion. Taking an owner adds its dot, so its values come next.',
			},
			{ syntax: '→', hint: 'At the end of the input, take the greyed rest of the suggestion.' },
			{
				syntax: '↑ ↓',
				hint: 'Move through the suggestions. In an empty bar, step through the commands you’ve run on this device.',
			},
			{
				syntax: 'Enter',
				hint: 'Run a whole command; otherwise take the suggestion. The strip’s top line says which.',
			},
			{ syntax: 'Esc', hint: 'Clear the bar.' },
			{
				syntax: '/he ⇥ ⇥ ↵',
				hint: 'In a fight: take the active foe’s harm. With a foe active, health’s first operator is -=harm.',
			},
			{
				syntax: '/pro ⇥ ⇥ ↵',
				hint: 'Mark progress on the active foe by its rank (/foe.progress++).',
			},
			{
				syntax: 'Phone',
				hint: 'Tap a suggestion to take it. The operator keys (++ -- += -= = ! .) sit under the suggestions.',
			},
		],
	};
</script>

<Dialog.Root bind:open={dialogOpen}>
	<Dialog.Portal>
		<Dialog.Overlay class="dialog-overlay ch-overlay" style="z-index: {overlayZ(stackDepth)}" />
		<Dialog.Content bind:ref={contentEl} class="ch-dialog" style="z-index: {contentZ(stackDepth)}">
			<DialogHeader title={headingText('Command Bar')} onclose={close} />

			<div class="ch-body">
				<p class="ch-intro">
					Plain text is a note. A line starting with <code>/</code> is a command:
					<code>/[owner.]value[operator]</code>, or a verb such as <code>/move</code>. Spaces are
					optional except inside names, and case doesn’t matter. The strip above the bar suggests
					what fits as you type; its top line says what <kbd>Enter</kbd> will do.
				</p>

				{#each HELP_TOPICS as topic (topic.id)}
					<section
						class="ch-section"
						class:ch-section-focused={focusedTopic === topic.id}
						data-topic={topic.id}
					>
						<h3 class="ch-heading">{topic.label}</h3>
						<ul class="ch-list">
							{#each SECTIONS[topic.id] ?? [] as row (row.syntax)}
								<li class="ch-row">
									<code class="ch-syntax">{row.syntax}</code>
									<span class="ch-hint">{row.hint}</span>
								</li>
							{/each}
						</ul>
					</section>
				{/each}

				<p class="ch-footnote">
					Log entries also carry hover-revealed <span class="ch-marker">▲</span> /
					<span class="ch-marker">▼</span> buttons — click them to mark a story section without typing
					a command. The AI-story selection surface is hidden on mobile.
				</p>
			</div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<style>
	/* bits-ui portals Content + Overlay to <body> — scope everything
	   globally so Svelte's CSS pruning can see through the portal.
	   z-index is set inline via dialogStack — see <script>. */
	:global(.ch-dialog) {
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: min(560px, calc(100vw - 2rem));
		max-height: 82vh;
		overflow: hidden;
		background: var(--bg-card);
		color: var(--text);
		border-radius: 10px;
		box-shadow:
			0 16px 48px #00000070,
			0 0 0 1px var(--border-mid);
		outline: none;
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
	:global(.ch-intro code) {
		font-family: var(--font-mono, 'Roboto Mono', ui-monospace, monospace);
		font-size: 0.76rem;
		color: var(--text-accent);
	}
	:global(.ch-section) {
		border-radius: 6px;
		padding: 2px 4px;
		margin: 0 -4px 6px;
		scroll-margin-top: 8px;
	}
	:global(.ch-section-focused) {
		background: color-mix(in srgb, var(--text-accent) 12%, transparent);
		box-shadow: inset 3px 0 0 0 var(--text-accent);
	}
	:global(.ch-heading) {
		font-family: var(--font-ui);
		font-size: 0.74rem;
		font-weight: 700;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--text-dimmer);
		margin: 6px 0 4px;
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
		margin: 0 0 8px;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	:global(.ch-row) {
		display: grid;
		grid-template-columns: 11rem 1fr;
		gap: 10px;
		padding: 5px 7px;
		border-radius: 4px;
		align-items: baseline;
	}
	@media (max-width: 480px) {
		:global(.ch-row) {
			grid-template-columns: 1fr;
			gap: 2px;
		}
	}
	:global(.ch-row:nth-child(odd)) {
		background: color-mix(in srgb, var(--text-accent) 4%, transparent);
	}
	:global(.ch-syntax) {
		font-family: var(--font-mono, 'Roboto Mono', ui-monospace, monospace);
		font-size: 0.78rem;
		font-weight: 600;
		color: var(--text-accent);
		overflow-wrap: anywhere;
	}
	:global(.ch-hint) {
		font-family: var(--font-ui);
		/* `--` is an operator here, not a dash. */
		font-variant-ligatures: none;
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
</style>
