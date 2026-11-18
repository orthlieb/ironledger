<script lang="ts">
	/**
	 * CommandBar — the input strip at the bottom of /home.
	 *
	 * Plain text is a note; a line starting with `/` is a command in the
	 * command language (docs/command-language.md): `/health-=2`,
	 * `/foe.progress++`, `/foe=Wolf`, `/move face danger`. The suggestion
	 * strip above the input follows the command slot by slot
	 * (#lib/commands/suggest.ts), its top row saying what Enter would do; the
	 * plan behind it comes from #lib/commands/resolve.ts and runs through
	 * #lib/commands/run.svelte.ts.
	 *
	 * Keys: Tab (or → at the end) takes the highlighted suggestion; ↑/↓ move
	 * through the suggestions, or through the commands run before when the
	 * input is empty; Enter runs a whole command, else takes the suggestion;
	 * Esc clears. On a phone a tap on a row is Tab, and a row of operator
	 * keys sits under the suggestions.
	 */

	import {
		suggest,
		ghostText,
		type Suggestion,
		type SuggestionIcon,
	} from '#lib/commands/suggest.js';
	import { buildWorld, runPlan } from '#lib/commands/run.svelte.js';
	import { loadMoves } from '#lib/moveStore.svelte.js';
	import { loadOracles } from '#lib/oracleStore.svelte.js';
	import { getCharacters } from '#lib/characterStore.svelte.js';
	import { getEncounters } from '#lib/encounterStore.svelte.js';
	import { findFoe, FOE_NATURE_COLORS } from '#lib/foeStore.svelte.js';
	import { encounterName } from '#lib/commands/run.svelte.js';
	import { getExpeditions } from '#lib/expeditionStore.svelte.js';
	import {
		getActiveCharacterId,
		getActiveExpeditionId,
		getActiveFoeId,
	} from '#lib/activeContext.svelte.js';
	import { ENTITY_KIND_META } from '#lib/entityKinds.js';
	import { tooltip } from '#lib/actions/tooltip.js';
	import { appIcon } from '#lib/liveryIcons.js';
	import type { CharacterData } from '#lib/types.js';
	import CommandHelpDialog from './CommandHelpDialog.svelte';
	import heartSvg from '#icons/heart-pulse-solid.svg?raw';
	import eyeSvg from '#icons/eye-solid.svg?raw';
	import plusSvg from '#icons/plus-solid.svg?raw';
	import checkSvg from '#icons/circle-check-solid.svg?raw';
	import runSvg from '#icons/person-running-solid.svg?raw';
	import ballSvg from '#icons/crystal-ball.svg?raw';
	import diceSvg from '#icons/dice-d10-light.svg?raw';
	import bookSvg from '#icons/book-solid.svg?raw';
	import compassSvg from '#icons/compass-rose.svg?raw';
	import gemSvg from '#icons/gem-solid.svg?raw';

	let input = $state('');
	let inputEl = $state<HTMLInputElement | null>(null);
	let statusMsg = $state('');
	let statusKind = $state<'info' | 'error'>('info');
	let helpDialogRef = $state<{ open(focus?: string): void; close(): void } | null>(null);
	/** The highlighted suggestion. */
	let idx = $state(0);
	/** Whether the caret sits at the end of the input (ghost text shows only
	 *  there). */
	let caretAtEnd = $state(true);

	// A link clicked in the log or a dialog runs a command too: what it did,
	// or why it couldn't, shows here (#lib/commands/run.svelte.ts).
	$effect(() => {
		const onStatus = (e: Event) => {
			const d = (e as CustomEvent<{ ok: boolean; message: string }>).detail;
			if (d?.message) setStatus(d.message, d.ok ? 'info' : 'error');
		};
		document.addEventListener('ironledger:command-status', onStatus);
		return () => document.removeEventListener('ironledger:command-status', onStatus);
	});

	// `/move` and `/oracle` need the catalogues the dialogs otherwise load on
	// their first open. Both loads are idempotent.
	$effect(() => {
		loadMoves();
		loadOracles();
	});

	const world = $derived(buildWorld());
	const sugg = $derived(suggest(input, world));
	const rows = $derived(sugg.rows);
	const isCommand = $derived(input.trimStart().startsWith('/'));
	const highlighted = $derived<Suggestion | undefined>(rows[Math.min(idx, rows.length - 1)]);
	const ghost = $derived(caretAtEnd ? ghostText(input, highlighted) : '');

	const ICONS: Record<SuggestionIcon, () => string> = {
		value: () => heartSvg,
		lock: () => eyeSvg,
		op: () => plusSvg,
		option: () => checkSvg,
		unit: () => plusSvg,
		verb: () => runSvg,
		move: () => runSvg,
		oracle: () => ballSvg,
		dice: () => diceSvg,
		help: () => bookSvg,
		character: () => appIcon('characters'),
		foe: () => appIcon('foes'),
		journey: () => appIcon('journey'),
		site: () => appIcon('site'),
		scene: () => appIcon('scene'),
		vow: () => compassSvg,
		asset: () => gemSvg,
	};
	/** Operator keys for a phone, whose keyboard buries them. */
	const OP_KEYS = ['++', '--', '+=', '-=', '=', '!', '.'];

	// ── History (this device) ─────────────────────────────────────────────
	const HISTORY_KEY = 'ironledger:command-history';
	const HISTORY_MAX = 50;
	/** Where ↑/↓ are in the history: -1 is the line being typed. */
	let historyIdx = -1;
	function readHistory(): string[] {
		try {
			const v = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]');
			return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
		} catch {
			return [];
		}
	}
	function remember(cmd: string) {
		try {
			const h = [cmd, ...readHistory().filter((x) => x !== cmd)].slice(0, HISTORY_MAX);
			localStorage.setItem(HISTORY_KEY, JSON.stringify(h));
		} catch {
			/* storage off: no history */
		}
	}

	// ── Active context chips ──────────────────────────────────────────────
	const activeCharName = $derived.by(() => {
		const id = getActiveCharacterId();
		const c = id ? getCharacters().find((x) => x.id === id) : null;
		return c ? (c.data as unknown as CharacterData).name || 'Unnamed' : '';
	});
	const activeFoe = $derived.by(() => {
		const id = getActiveFoeId();
		const enc = id ? getEncounters().find((e) => e.id === id) : undefined;
		// A vanquished foe is done: no chip (it can still be named, /foe).
		if (!enc || enc.vanquished) return null;
		const def = findFoe(enc.foeId);
		const color = def ? (FOE_NATURE_COLORS[def.nature] ?? '#7A9AB8') : '#7A9AB8';
		return { name: encounterName(enc), color };
	});
	const activeExp = $derived.by(() => {
		const id = getActiveExpeditionId();
		const exp = id ? getExpeditions().find((e) => e.id === id) : undefined;
		if (!exp) return null;
		const name = exp.name || `New ${ENTITY_KIND_META[exp.type].label}`;
		const label = name.length > 25 ? name.slice(0, 24) + '…' : name;
		return { name, label, color: ENTITY_KIND_META[exp.type].color, kind: exp.type };
	});

	// ── Doing things ──────────────────────────────────────────────────────
	function setStatus(msg: string, kind: 'info' | 'error') {
		statusMsg = msg;
		statusKind = kind;
		if (kind === 'info' && msg) {
			const snapshot = msg;
			setTimeout(() => {
				if (statusMsg === snapshot) statusMsg = '';
			}, 4000);
		}
	}

	function setInput(v: string) {
		input = v;
		idx = 0;
		caretAtEnd = true;
		queueMicrotask(() => {
			const el = inputEl;
			if (!el) return;
			el.focus();
			el.setSelectionRange(v.length, v.length);
		});
	}

	/** Take a suggestion (Tab, a tap): its command goes in the input. */
	function accept(s: Suggestion) {
		if (s.disabled) {
			setStatus(`${s.label}: ${s.disabled}`, 'error');
			return;
		}
		setInput(s.apply);
	}

	/** Run what's in the input. */
	function run() {
		const p = sugg.plan;
		if (p.kind === 'empty') return;
		const r = runPlan(p, { openHelp: (topic) => helpDialogRef?.open(topic || undefined) });
		if (r.message) setStatus(r.message, r.ok ? 'info' : 'error');
		if (!r.ok) return;
		if (isCommand) remember(input.trim());
		historyIdx = -1;
		setInput('');
	}

	/** Whether Enter can run the input as it stands. */
	const runnable = $derived(sugg.plan.kind !== 'incomplete' && sugg.plan.kind !== 'error');
	/** The top row: what Enter does. While a command can't run yet but a
	 *  suggestion fits, Enter takes the suggestion, so it says that. */
	const top = $derived.by(() => {
		const s = highlighted;
		if (!runnable && s && !s.disabled)
			return { text: `Enter: ${s.apply.trim()}`, tone: 'incomplete' as const };
		return sugg.top;
	});

	/** Rows that open the next slot rather than finish a command: a value, a
	 *  read-only value, or a name (its owner rows end in a dot; a kind
	 *  keyword's has no operator yet). */
	const OPENING: SuggestionIcon[] = [
		'value',
		'lock',
		'character',
		'foe',
		'journey',
		'site',
		'scene',
		'vow',
		'asset',
	];
	/** A row whose command is whole, so taking it with Enter runs it: an
	 *  operator like `++`, an option, `/foe=Wolf`, a move, `/story start`.
	 *  One that leaves a slot open (`/move `, `/health+=`, `/Ash.`) isn't. */
	function isFinal(s: Suggestion): boolean {
		if (/[.=\s]$/.test(s.apply) || /[+-]=$/.test(s.apply)) return false;
		return !OPENING.includes(s.icon) || s.apply.includes('=');
	}

	function onEnter() {
		const s = highlighted;
		if (s && (idx > 0 || !runnable)) {
			accept(s);
			if (!s.disabled && isFinal(s)) queueMicrotask(run);
			return;
		}
		run();
	}

	function stepHistory(dir: 1 | -1) {
		const h = readHistory();
		if (!h.length) return;
		historyIdx = Math.max(-1, Math.min(h.length - 1, historyIdx + dir));
		setInput(historyIdx < 0 ? '' : h[historyIdx]!);
	}

	function handleKeydown(e: KeyboardEvent) {
		const browsing = !input || (historyIdx >= 0 && input === readHistory()[historyIdx]);
		if (e.key === 'Enter') {
			e.preventDefault();
			onEnter();
		} else if (e.key === 'Tab' && highlighted && isCommand) {
			e.preventDefault();
			accept(highlighted);
		} else if (e.key === 'ArrowRight' && ghost && inputEl?.selectionStart === input.length) {
			e.preventDefault();
			accept(highlighted!);
		} else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
			const up = e.key === 'ArrowUp';
			if (browsing) {
				e.preventDefault();
				stepHistory(up ? 1 : -1);
			} else if (rows.length) {
				e.preventDefault();
				idx = (idx + (up ? -1 : 1) + rows.length) % rows.length;
			}
		} else if (e.key === 'Escape') {
			setInput('');
			statusMsg = '';
			historyIdx = -1;
		}
	}

	function onInput() {
		idx = 0;
		historyIdx = -1;
		trackCaret();
	}
	function trackCaret() {
		const el = inputEl;
		caretAtEnd = !el || el.selectionStart === el.value.length;
	}

	/** A phone's operator key: typed at the caret. */
	function typeOp(k: string) {
		const el = inputEl;
		const at = el?.selectionStart ?? input.length;
		const v = input.slice(0, at).trimEnd() + k + input.slice(at);
		setInput(v);
	}

	// The highlighted row stays in view as ↑/↓ move it.
	let listEl = $state<HTMLElement | null>(null);
	$effect(() => {
		void idx;
		listEl?.querySelector('.cb-sugg-active')?.scrollIntoView({ block: 'nearest' });
	});
</script>

<div class="cb" data-tour="log-note">
	<div class="cb-context" aria-label="Active context">
		{#if activeCharName}
			<span class="cb-chip cb-chip-char" use:tooltip={'Active character'}>{activeCharName}</span>
		{/if}
		{#if activeFoe}
			<span
				class="cb-chip"
				style="background: {activeFoe.color}22; color: {activeFoe.color}"
				use:tooltip={'Active foe'}>{activeFoe.name}</span
			>
		{/if}
		{#if activeExp}
			<span
				class="cb-chip"
				style="background: {activeExp.color}22; color: {activeExp.color}"
				use:tooltip={`Active ${activeExp.kind}: ${activeExp.name}`}>{activeExp.label}</span
			>
		{/if}
	</div>

	{#if isCommand && (top.text || rows.length)}
		<div class="cb-sugg">
			{#if top.text}
				<div class="cb-top cb-top-{top.tone}" role="status">{top.text}</div>
			{/if}
			{#if rows.length}
				<ul class="cb-list" role="listbox" aria-label="Suggestions" bind:this={listEl}>
					{#each rows as s, i (i + ':' + s.apply)}
						<li
							class="cb-sugg-item"
							class:cb-sugg-active={i === idx}
							class:cb-sugg-disabled={!!s.disabled}
							role="option"
							aria-selected={i === idx}
							aria-disabled={!!s.disabled}
						>
							<button
								class="cb-sugg-btn"
								type="button"
								onclick={() => accept(s)}
								onmousedown={(e) => e.preventDefault()}
							>
								<span class="cb-sugg-icon" aria-hidden="true">{@html ICONS[s.icon]()}</span>
								<span class="cb-sugg-label">{s.label}</span>
								{#if s.detail}<span class="cb-sugg-hint">{s.detail}</span>{/if}
								{#if s.current}<span class="cb-sugg-tick" aria-label="current">✓</span>{/if}
							</button>
						</li>
					{/each}
				</ul>
			{/if}
			<div class="cb-ops" aria-label="Operators">
				{#each OP_KEYS as k (k)}
					<button
						type="button"
						class="cb-op"
						onclick={() => typeOp(k)}
						onmousedown={(e) => e.preventDefault()}>{k}</button
					>
				{/each}
			</div>
		</div>
	{/if}

	{#if statusMsg}
		<div class="cb-status" class:cb-status-err={statusKind === 'error'} role="status">
			{statusMsg}
		</div>
	{/if}

	<div class="cb-row">
		<span class="cb-caret" aria-hidden="true">›</span>
		<div class="cb-field">
			<input
				bind:this={inputEl}
				bind:value={input}
				onkeydown={handleKeydown}
				oninput={onInput}
				onclick={trackCaret}
				onkeyup={trackCaret}
				type="text"
				class="cb-input"
				placeholder="Type a note, or / for a command (Tab completes)."
				autocomplete="off"
				autocapitalize="off"
				spellcheck={!isCommand}
				aria-label="Command bar"
				aria-autocomplete="list"
			/>
			{#if ghost}
				<span class="cb-ghost" aria-hidden="true"
					><span class="cb-ghost-typed">{input}</span>{ghost}</span
				>
			{/if}
		</div>
		<button
			class="cb-help-btn"
			type="button"
			use:tooltip={'Command help'}
			aria-label="Command help"
			onclick={() => helpDialogRef?.open()}>?</button
		>
	</div>
</div>

<CommandHelpDialog bind:this={helpDialogRef} />

<style>
	.cb {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 6px 10px 8px;
		background: var(--bg-card);
		border-top: 1px solid var(--border);
		position: relative;
		flex-shrink: 0;
	}
	.cb-context {
		display: flex;
		gap: 5px;
		flex-wrap: wrap;
		align-items: center;
		min-height: 18px;
	}
	/* Canonical pill (docs/ui-components.md § Canonical Pill / Badge Style). */
	.cb-chip {
		font-family: var(--font-ui);
		font-size: 0.6rem;
		font-weight: 600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		padding: 2px 7px;
		border-radius: 10px;
		border: 1px solid color-mix(in srgb, currentColor 35%, transparent);
		line-height: 1;
		white-space: nowrap;
		flex-shrink: 0;
	}
	.cb-chip-char {
		background: color-mix(in srgb, var(--text-accent) 12%, transparent);
		color: var(--text-accent);
	}
	.cb-row {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.cb-caret {
		font-family: var(--font-mono, ui-monospace, monospace);
		font-size: 1rem;
		color: var(--text-dimmer);
		user-select: none;
	}
	.cb-field {
		position: relative;
		flex: 1;
		min-width: 0;
		display: flex;
	}
	.cb-input,
	.cb-ghost {
		font-family: var(--font-ui);
		/* `--` is an operator here, not a dash. */
		font-variant-ligatures: none;
		font-size: 0.85rem;
		padding: 6px 10px;
		border: 1px solid transparent;
		line-height: 1.3;
	}
	.cb-input {
		flex: 1;
		min-width: 0;
		background: var(--bg-inset);
		color: var(--text);
		border-color: var(--border-mid);
		border-radius: 4px;
	}
	.cb-input:focus {
		outline: none;
		border-color: var(--text-accent);
	}
	/* The rest of the highlighted suggestion, greyed after the caret. */
	.cb-ghost {
		position: absolute;
		inset: 0;
		pointer-events: none;
		white-space: pre;
		overflow: hidden;
		color: var(--text-dimmer);
	}
	.cb-ghost-typed {
		color: transparent;
	}
	.cb-help-btn {
		width: 28px;
		height: 28px;
		flex-shrink: 0;
		border-radius: 4px;
		background: var(--bg-control);
		border: 1px solid var(--border-mid);
		color: var(--text-muted);
		font-family: var(--font-ui);
		font-weight: 700;
		cursor: pointer;
	}
	.cb-help-btn:hover {
		color: var(--text);
		border-color: var(--text-accent);
	}
	.cb-status {
		font-family: var(--font-ui);
		font-size: 0.72rem;
		color: var(--text-muted);
	}
	.cb-status-err {
		color: var(--color-danger, #ef4444);
	}
	.cb-sugg {
		position: absolute;
		bottom: calc(100% - 1px);
		left: 10px;
		right: 10px;
		display: flex;
		flex-direction: column;
		max-height: 45vh;
		background: var(--bg-card);
		border: 1px solid var(--border-mid);
		border-bottom: none;
		border-radius: 6px 6px 0 0;
		box-shadow: 0 -6px 18px #00000030;
		z-index: 5;
	}
	.cb-top {
		padding: 6px 12px;
		font-family: var(--font-ui);
		font-size: 0.78rem;
		border-bottom: 1px solid var(--border);
		color: var(--text-muted);
	}
	.cb-top-ok {
		color: var(--text);
	}
	.cb-top-error {
		color: var(--color-danger, #ef4444);
	}
	.cb-top-incomplete {
		color: var(--text-dimmer);
		font-style: italic;
	}
	.cb-list {
		list-style: none;
		margin: 0;
		padding: 4px 0;
		overflow-y: auto;
		overscroll-behavior: contain;
		min-height: 0;
	}
	.cb-sugg-item {
		list-style: none;
	}
	.cb-sugg-btn {
		font-variant-ligatures: none;
		display: flex;
		align-items: center;
		width: 100%;
		gap: 8px;
		padding: 4px 12px;
		font-family: var(--font-ui);
		font-size: 0.82rem;
		color: var(--text);
		background: transparent;
		border: none;
		text-align: left;
		cursor: pointer;
	}
	.cb-sugg-btn:hover,
	.cb-sugg-active .cb-sugg-btn {
		background: var(--bg-hover);
	}
	.cb-sugg-disabled .cb-sugg-btn {
		opacity: 0.5;
	}
	.cb-sugg-icon {
		width: 14px;
		height: 14px;
		flex-shrink: 0;
		display: inline-flex;
		color: var(--text-dimmer);
	}
	.cb-sugg-icon :global(svg) {
		width: 100%;
		height: 100%;
		fill: currentColor;
	}
	.cb-sugg-label {
		font-weight: 500;
		white-space: nowrap;
	}
	.cb-sugg-hint {
		flex: 1;
		min-width: 0;
		color: var(--text-dimmer);
		font-size: 0.72rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.cb-sugg-tick {
		color: var(--text-accent);
		font-size: 0.8rem;
	}
	/* Operator keys: phones only (a coarse pointer), whose keyboards bury
	   these characters. */
	.cb-ops {
		display: none;
		gap: 4px;
		padding: 4px 8px 6px;
		border-top: 1px solid var(--border);
		flex-wrap: wrap;
	}
	@media (pointer: coarse) {
		.cb-ops {
			display: flex;
		}
	}
	.cb-op {
		min-width: 40px;
		min-height: 32px;
		padding: 2px 8px;
		font-family: var(--font-mono, ui-monospace, monospace);
		font-size: 0.9rem;
		color: var(--text);
		background: var(--bg-control);
		border: 1px solid var(--border-mid);
		border-radius: 4px;
		cursor: pointer;
	}
</style>
