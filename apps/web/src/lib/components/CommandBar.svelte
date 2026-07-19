<script lang="ts">
	/**
	 * CommandBar — always-visible input strip at the bottom of /home.
	 *
	 * Accepts prose (→ Note) and slash-commands (→ dispatched to existing move,
	 * oracle, character, and foe surfaces). Autocomplete floats above the input
	 * for the commands that take a name argument.
	 *
	 * External dispatch — reuses the CustomEvent bus /home already wires:
	 *   ironledger:open-move       { id }         → MovesDialog opens preselected
	 *   ironledger:open-oracle     { key, stat? } → OraclesDialog opens preselected
	 *   ironledger:story-generate  ()             → LogPanel opens the Story dialog
	 *                                               on the current section markers.
	 *
	 * /start and /end mutate sectionStore directly (no bus needed — it's a
	 * client-side reactive store).
	 *
	 * Character/foe switching is handled locally via the active-context stores.
	 */

	import type { Command, CommandName } from '$lib/commandBar.js';
	import {
		COMMAND_NAMES,
		parseCommand,
		fuzzyPick,
		prefixPick,
		VITAL_RESOURCE_ALIASES,
		DEBILITY_NAMES,
		DEBILITY_STATES,
		NUMERIC_OPS,
		INITIATIVE_VALUES,
		initiativeToNumber,
	} from '$lib/commandBar.js';
	import { appendLog, sessionLog, triggerAction } from '$lib/log.svelte.js';
	import { renderNote } from '$lib/markdown.js';
	import { rollDie, animateDice, type DiceSpec } from '$lib/dice.js';
	import { getCharacters } from '$lib/characterStore.svelte.js';
	import { getEncounters } from '$lib/encounterStore.svelte.js';
	import { findFoe } from '$lib/foeStore.svelte.js';
	import { getVisibleMoves, loadMoves } from '$lib/moveStore.svelte.js';
	import { getVisibleOracles, loadOracles } from '$lib/oracleStore.svelte.js';
	import { getStartId, getEndId, hasSection, setStart, setEnd } from '$lib/sectionStore.svelte.js';
	import {
		getActiveCharacterId,
		setActiveCharacterId,
		getActiveFoeId,
		setActiveFoeId,
		getActiveExpeditionId,
		setActiveExpeditionId,
	} from '$lib/activeContext.svelte.js';
	import { getActiveDiceCtx } from '$lib/diceContext.svelte.js';
	import { firstPreconditionFailure } from '$lib/preconditions.js';
	import type { PreconditionContext, Precondition } from '$lib/preconditions.js';
	import { getExpeditions } from '$lib/expeditionStore.svelte.js';
	import { FOE_RANKS } from '$lib/foeStore.svelte.js';
	import type { MoveDefinition } from '@ironledger/shared';
	import type { CharacterData } from '$lib/types.js';
	import CommandHelpDialog from './CommandHelpDialog.svelte';

	let input = $state('');
	let inputEl = $state<HTMLInputElement | null>(null);
	let statusMsg = $state('');
	let helpDialogRef = $state<{ open(focus?: string): void; close(): void } | null>(null);

	// The move + oracle catalogues are normally lazy-loaded by MovesDialog /
	// OraclesDialog on their first open. That's too late for us — /move e ↵
	// against an empty list would show nothing. Both load* fns are idempotent,
	// so preloading here is safe and cheap.
	$effect(() => {
		loadMoves();
		loadOracles();
	});
	let statusKind = $state<'info' | 'error'>('info');
	let suggestionIdx = $state(0);

	// ── Active character/foe display chips ────────────────────────────────
	const activeChar = $derived.by(() => {
		const id = getActiveCharacterId();
		return id ? getCharacters().find((c) => c.id === id) : null;
	});
	const activeCharName = $derived.by(() => {
		const c = activeChar;
		return c ? (c.data as unknown as CharacterData).name || 'Unnamed' : '';
	});
	const activeFoe = $derived.by(() => {
		const id = getActiveFoeId();
		if (!id) return null;
		const enc = getEncounters().find((e) => e.id === id);
		if (!enc) return null;
		const def = findFoe(enc.foeId);
		return { name: enc.customName || def?.name || 'Foe' };
	});

	// Build the same precondition context /home passes to MovesDialog so we
	// can filter the /move autocomplete to only moves that are possible right
	// now. Mirrors +layout.svelte's `preconditionCtx` deliberately — two
	// consumers isn't enough to justify a shared helper yet.
	const preconditionCtx = $derived.by<PreconditionContext>(() => {
		const activeDiceCtx = getActiveDiceCtx();
		const foeId = getActiveFoeId();
		const expId = getActiveExpeditionId();
		const encs = getEncounters();
		const exps = getExpeditions();
		const enc = foeId ? encs.find((e) => e.id === foeId) : undefined;
		const exp = expId ? exps.find((e) => e.id === expId) : undefined;
		const foeDef = enc ? findFoe(enc.foeId) : undefined;
		const foeName = enc ? enc.customName?.trim() || foeDef?.name || enc.foeId : undefined;
		return {
			hasCharacter: !!activeDiceCtx,
			hasFoe: !!enc,
			hasJourney: exp?.type === 'journey',
			hasSite: exp?.type === 'site',
			expeditionName: exp?.name,
			foeName,
			initiative: activeDiceCtx?.data?.initiative,
			foeHarm: enc ? FOE_RANKS[enc.effectiveRank]?.harm : undefined,
		};
	});

	/**
	 * True when a move satisfies its preconditions in the current context.
	 * Matches MovesDialog's `moveFailReason` semantics: with no character,
	 * moves that have any precondition are unavailable; with a character,
	 * preconditions are evaluated against the character + spine ctx.
	 */
	function isMoveAvailable(m: MoveDefinition): boolean {
		const ctx = getActiveDiceCtx();
		if (!ctx) return !m.preconditions?.length;
		return !firstPreconditionFailure(
			m.preconditions as Precondition[] | undefined,
			ctx.data,
			preconditionCtx,
		);
	}

	// ── Autocomplete: derive the current suggestion pool from what's typed ──
	interface Suggestion {
		label: string;
		hint: string;
		apply: string;
	}

	const parsed = $derived(parseCommand(input));

	// Store-arg suggestion builders — extracted so we can invoke them from the
	// regex-driven arg-completion block below, which fires whether or not the
	// parser produced a happy result (e.g. `/foe ` with no arg parses as
	// help-focus, but we still want the autocomplete strip populated).
	function buildOracleSuggestions(q: string): Suggestion[] {
		return fuzzyPick(getVisibleOracles(), (o) => o.title, q, 8).map((o) => ({
			label: o.title,
			hint: o.key,
			apply: `/oracle ${o.key}`,
		}));
	}
	function buildMoveSuggestions(q: string): Suggestion[] {
		const available = getVisibleMoves().filter(isMoveAvailable);
		return prefixPick(available, (m) => m.name, q, 12).map((m) => ({
			label: m.name,
			hint: m.category ?? '',
			apply: `/move ${m.name}`,
		}));
	}
	function buildCharSuggestions(q: string): Suggestion[] {
		const chars = prefixPick(
			getCharacters(),
			(c) => (c.data as unknown as CharacterData).name || 'Unnamed',
			q,
			8,
		).map((c) => {
			const n = (c.data as unknown as CharacterData).name || 'Unnamed';
			return { label: n, hint: '', apply: `/char ${n}` };
		});
		if (getActiveCharacterId()) {
			const foeId = getActiveFoeId();
			const foeEnc = foeId ? getEncounters().find((e) => e.id === foeId) : undefined;
			const foeRankHarm = foeEnc ? (FOE_RANKS[foeEnc.effectiveRank]?.harm ?? 0) : 0;
			const harmHint =
				foeRankHarm > 0 ? `take ${foeRankHarm} harm (active foe rank)` : 'take 1 harm';
			const specials: Suggestion[] = [
				{ label: '+', hint: 'heal +1 health', apply: '/char +' },
				{ label: '-', hint: harmHint, apply: '/char -' },
			].filter((s) => !q || s.label.toLowerCase().startsWith(q.toLowerCase()));
			return [...specials, ...chars];
		}
		return chars;
	}
	function buildFoeSuggestions(q: string): Suggestion[] {
		const foes = prefixPick(
			getEncounters(),
			(e) => e.customName || findFoe(e.foeId)?.name || '',
			q,
			8,
		).map((e) => {
			const n = e.customName || findFoe(e.foeId)?.name || '';
			return { label: n, hint: '', apply: `/foe ${n}` };
		});
		if (getActiveFoeId()) {
			// `active` and `vanquish` are opposite subcommands; both appear in
			// the strip so the user can flip either direction with one keystroke
			// sequence. The action itself no-ops if the target state already
			// matches — the fallback keeps the strip predictable across states.
			const specials: Suggestion[] = [
				{ label: '+', hint: 'tick progress +1 box', apply: '/foe +' },
				{ label: '-', hint: 'tick progress -1 box', apply: '/foe -' },
				{ label: 'vanquish', hint: 'mark the active foe vanquished', apply: '/foe vanquish' },
				{ label: 'active', hint: 'reactivate a vanquished foe', apply: '/foe active' },
			].filter((s) => !q || s.label.toLowerCase().startsWith(q.toLowerCase()));
			return [...specials, ...foes];
		}
		return foes;
	}
	function buildExpSuggestions(q: string): Suggestion[] {
		const exps = prefixPick(getExpeditions(), (e) => e.name || '', q, 8).map((e) => ({
			label: e.name || '',
			hint: e.type,
			apply: `/exp ${e.name}`,
		}));
		if (getActiveExpeditionId()) {
			const specials: Suggestion[] = [
				{ label: '+', hint: 'tick progress +1 mark', apply: '/exp +' },
				{ label: '-', hint: 'tick progress -1 mark', apply: '/exp -' },
			].filter((s) => !q || s.label.toLowerCase().startsWith(q.toLowerCase()));
			return [...specials, ...exps];
		}
		return exps;
	}

	const suggestions = $derived.by<Suggestion[]>(() => {
		// trimStart (not trim) — preserve trailing spaces so `/vital ` (right
		// after the user tab-completes the verb) still has the space the arg
		// regexes need to match. Without this, `raw.match(/^\/vital\s+([a-z]*)$/)`
		// fails on an empty arg and autocomplete stays dark until the user
		// starts typing.
		const raw = input.trimStart();
		if (!raw.startsWith('/')) return [];
		// Still typing the verb — no space means no arg started.
		if (!raw.includes(' ')) {
			const q = raw.slice(1).toLowerCase();
			return fuzzyPick(COMMAND_NAMES as unknown as string[], (n) => n, q, 8).map((n) => ({
				label: `/${n}`,
				hint: verbHint(n as CommandName),
				apply: `/${n} `,
			}));
		}
		// /vital resource-name completion — kicks in on any partial input after
		// the verb, before the parser is happy. Show resource aliases whose name
		// prefixes the second token (empty query lists all).
		const vitalMatch = raw.match(/^\/vital\s+([a-z]*)$/i);
		if (vitalMatch) {
			const q = vitalMatch[1];
			return prefixPick(VITAL_RESOURCE_ALIASES as unknown as string[], (r) => r, q, 8).map((r) => ({
				label: r,
				hint: r === 'xp' ? 'alias for experience' : '',
				apply: `/vital ${r} `,
			}));
		}
		// /vital operator completion — after a valid resource is picked.
		const vitalOpMatch = raw.match(/^\/vital\s+([a-z]+)\s+([+\-=]?)$/i);
		if (vitalOpMatch) {
			const rname = vitalOpMatch[1].toLowerCase();
			if ((VITAL_RESOURCE_ALIASES as unknown as string[]).includes(rname)) {
				const q = vitalOpMatch[2];
				return prefixPick(NUMERIC_OPS as unknown as string[], (o) => o, q, 3).map((op) => ({
					label: op,
					hint:
						op === '+'
							? 'delta up (default 1)'
							: op === '-'
								? 'delta down (default 1)'
								: 'set absolute',
					apply: `/vital ${rname} ${op}${op === '=' ? ' ' : ''}`,
				}));
			}
		}
		// /bonds and /failures operator completion — same op set.
		const trackOpMatch = raw.match(/^\/(bonds|failures)\s+([+\-=]?)$/i);
		if (trackOpMatch) {
			const trackVerb = trackOpMatch[1].toLowerCase();
			const q = trackOpMatch[2];
			return prefixPick(NUMERIC_OPS as unknown as string[], (o) => o, q, 3).map((op) => ({
				label: op,
				hint:
					op === '+'
						? 'delta up (default 1)'
						: op === '-'
							? 'delta down (default 1)'
							: 'set absolute',
				apply: `/${trackVerb} ${op}${op === '=' ? ' ' : ''}`,
			}));
		}
		// /initiative value completion — three fixed enums, prefix-filtered.
		const initMatch = raw.match(/^\/initiative\s+([a-z]*)$/i);
		if (initMatch) {
			const q = initMatch[1];
			return prefixPick(INITIATIVE_VALUES as unknown as string[], (v) => v, q, 3).map((v) => ({
				label: v,
				hint:
					v === 'none'
						? 'neither side holds it'
						: v === 'character'
							? 'you hold initiative'
							: 'the foe holds initiative',
				apply: `/initiative ${v}`,
			}));
		}
		// /roll — offer Ironsworn preset patterns when the arg slot is empty
		// or being typed. Prefix-filter against whatever the user has already
		// entered so `/roll 2` narrows to presets starting with 2.
		const rollMatch = raw.match(/^\/roll(\s+([^\s]*))?$/i);
		if (rollMatch) {
			const q = (rollMatch[2] ?? '').toLowerCase();
			const presets: Suggestion[] = [
				{ label: '2d10 1d6', hint: 'action roll (challenge + action)', apply: '/roll 2d10 1d6' },
				{ label: '2d10', hint: 'challenge dice', apply: '/roll 2d10' },
				{ label: '1d6', hint: 'action die', apply: '/roll 1d6' },
				{ label: '1d100', hint: 'oracle', apply: '/roll 1d100' },
				{ label: '1d6+2', hint: 'action die + adds', apply: '/roll 1d6+2' },
			];
			return presets.filter((p) => !q || p.label.toLowerCase().startsWith(q));
		}
		// /debility name completion — before the state is typed.
		const debilityNameMatch = raw.match(/^\/debility\s+([a-z]*)$/i);
		if (debilityNameMatch) {
			const q = debilityNameMatch[1];
			return prefixPick(DEBILITY_NAMES as unknown as string[], (n) => n, q, 8).map((n) => ({
				label: n,
				hint: '',
				apply: `/debility ${n} `,
			}));
		}
		// /debility state completion — after a valid name.
		const debilityStateMatch = raw.match(/^\/debility\s+([a-z]+)\s+([a-z]*)$/i);
		if (debilityStateMatch) {
			const name = debilityStateMatch[1].toLowerCase();
			if (DEBILITY_NAMES.includes(name as (typeof DEBILITY_NAMES)[number])) {
				const q = debilityStateMatch[2];
				return prefixPick(DEBILITY_STATES as unknown as string[], (s) => s, q, 8).map((s) => ({
					label: s,
					hint: s === 'toggle' ? 'flip current value' : `mark ${s}`,
					apply: `/debility ${name} ${s}`,
				}));
			}
		}
		// Store-driven arg completion for /oracle, /move, /char, /foe, /exp.
		// Regex-driven (not parser-driven) so autocomplete lights up immediately
		// after the user tab-completes the verb — the parser would return
		// help-focus or error for an empty arg and the switch used to skip.
		const oracleArg = raw.match(/^\/oracle\s+(.*)$/i);
		if (oracleArg) return buildOracleSuggestions(oracleArg[1].trim());
		const moveArg = raw.match(/^\/move\s+(.*)$/i);
		if (moveArg) return buildMoveSuggestions(moveArg[1].trim());
		const charArg = raw.match(/^\/char\s+(.*)$/i);
		if (charArg) return buildCharSuggestions(charArg[1].trim());
		const foeArg = raw.match(/^\/foe\s+(.*)$/i);
		if (foeArg) return buildFoeSuggestions(foeArg[1].trim());
		const expArg = raw.match(/^\/exp\s+(.*)$/i);
		if (expArg) return buildExpSuggestions(expArg[1].trim());
		return [];
	});

	function verbHint(v: CommandName): string {
		switch (v) {
			case 'help':
				return 'commands cheat-sheet';
			case 'note':
				return 'add a log note';
			case 'oracle':
				return 'roll an oracle';
			case 'move':
				return 'roll a move';
			case 'char':
				return 'active character: set / take harm / heal';
			case 'foe':
				return 'active foe: set / tick progress / vanquish';
			case 'exp':
				return 'active expedition: set / tick progress';
			case 'start':
				return 'pin ▲ start marker on the newest entry';
			case 'end':
				return 'pin ▼ end marker on the newest entry';
			case 'story':
				return 'generate a story from the section';
			case 'vital':
				return 'adjust a vital on the active character';
			case 'debility':
				return 'set a debility on/off/toggle';
			case 'bonds':
				return 'edit the bonds track (0..40)';
			case 'failures':
				return 'edit the failures track (0..40)';
			case 'initiative':
				return 'set combat initiative';
			case 'roll':
				return 'roll dice — e.g. 2d10 1d6+2';
		}
	}

	// ── Dispatch: turn a parsed Command into side effects ─────────────────
	function dispatch(cmd: Command) {
		switch (cmd.kind) {
			case 'note': {
				appendLog('Note', renderNote(cmd.text), undefined, cmd.text);
				setStatus(`Noted.`, 'info');
				break;
			}
			case 'help': {
				helpDialogRef?.open(cmd.focus);
				break;
			}
			case 'oracle': {
				const oracle = resolveOracle(cmd.key);
				if (!oracle) {
					setStatus(`No oracle matches "${cmd.key}".`, 'error');
					return;
				}
				document.dispatchEvent(
					new CustomEvent('ironledger:open-oracle', { detail: { key: oracle.key } }),
				);
				setStatus(`Opened ${oracle.title}.`, 'info');
				break;
			}
			case 'move': {
				const move = resolveMove(cmd.name);
				if (!move) {
					setStatus(`No move matches "${cmd.name}".`, 'error');
					return;
				}
				document.dispatchEvent(
					new CustomEvent('ironledger:open-move', { detail: { id: move.id } }),
				);
				setStatus(`Opened ${move.name}.`, 'info');
				break;
			}
			case 'char': {
				const c = resolveCharacter(cmd.name);
				if (!c) {
					setStatus(`No character matches "${cmd.name}".`, 'error');
					return;
				}
				setActiveCharacterId(c.id);
				setStatus(`Active character → ${(c.data as unknown as CharacterData).name}.`, 'info');
				break;
			}
			case 'char-harm': {
				const charId = getActiveCharacterId();
				if (!charId) {
					setStatus('/char +/- needs an active character. Type /char <name> first.', 'error');
					return;
				}
				// Value on /char is harm — always applied to health. Applier
				// clamps 0..5 and appends the log line. `+` heals, `-` harms.
				//
				// On bare `/char -` (no explicit value), take the active foe's
				// rank harm instead of 1 — the most common combat action becomes
				// a single keystroke sequence. Explicit values (`/char -2`) win.
				// `/char +` bare stays at 1 — healing has no rank derivation.
				let n = cmd.value;
				let usedFoeRank = false;
				if (cmd.op === '-' && cmd.defaulted) {
					const foeId = getActiveFoeId();
					if (foeId) {
						const enc = getEncounters().find((e) => e.id === foeId);
						if (enc) {
							const rankHarm = FOE_RANKS[enc.effectiveRank]?.harm;
							if (rankHarm && rankHarm > 0) {
								n = rankHarm;
								usedFoeRank = true;
							}
						}
					}
				}
				const delta = cmd.op === '+' ? n : -n;
				triggerAction({ charId, type: 'resource', key: 'health', value: delta });
				setStatus(
					cmd.op === '+'
						? `Healed ${n} health.`
						: usedFoeRank
							? `Took ${n} harm (active foe rank).`
							: `Took ${n} harm.`,
					'info',
				);
				break;
			}
			case 'foe': {
				const e = resolveFoe(cmd.name);
				if (!e) {
					setStatus(`No foe matches "${cmd.name}".`, 'error');
					return;
				}
				setActiveFoeId(e.id);
				const nm = e.customName || findFoe(e.foeId)?.name || 'foe';
				setStatus(`Active foe → ${nm}.`, 'info');
				break;
			}
			case 'foe-progress': {
				if (!getActiveFoeId()) {
					setStatus('/foe +/- needs an active foe. Type /foe <name> first.', 'error');
					return;
				}
				// FoesArea.applyMenace does the rank-aware tick conversion + log
				// line. We forward a signed box count through a CustomEvent;
				// +page.svelte holds the ref and calls the method.
				const signedBoxes = cmd.op === '+' ? cmd.value : -cmd.value;
				document.dispatchEvent(
					new CustomEvent('ironledger:foe-progress', { detail: { boxes: signedBoxes } }),
				);
				setStatus(`Foe progress ${cmd.op}${cmd.value} box${cmd.value === 1 ? '' : 'es'}.`, 'info');
				break;
			}
			case 'foe-vanquish': {
				if (!getActiveFoeId()) {
					setStatus('/foe vanquish needs an active foe.', 'error');
					return;
				}
				document.dispatchEvent(new CustomEvent('ironledger:foe-vanquish'));
				setStatus('Vanquished the active foe.', 'info');
				break;
			}
			case 'foe-reactivate': {
				if (!getActiveFoeId()) {
					setStatus('/foe active needs an active foe.', 'error');
					return;
				}
				document.dispatchEvent(new CustomEvent('ironledger:foe-reactivate'));
				setStatus('Reactivated the foe.', 'info');
				break;
			}
			case 'exp': {
				const e = resolveExpedition(cmd.name);
				if (!e) {
					setStatus(`No expedition matches "${cmd.name}".`, 'error');
					return;
				}
				setActiveExpeditionId(e.id);
				setStatus(`Active expedition → ${e.name}.`, 'info');
				break;
			}
			case 'exp-progress': {
				if (!getActiveExpeditionId()) {
					setStatus('/exp +/- needs an active expedition. Type /exp <name> first.', 'error');
					return;
				}
				const signedMarks = cmd.op === '+' ? cmd.value : -cmd.value;
				document.dispatchEvent(
					new CustomEvent('ironledger:exp-progress', { detail: { marks: signedMarks } }),
				);
				setStatus(
					`Expedition progress ${cmd.op}${cmd.value} mark${cmd.value === 1 ? '' : 's'}.`,
					'info',
				);
				break;
			}
			case 'start': {
				// Pin the ▲ start marker on the current top-of-log (newest) entry.
				// The section is open-ended by default: as new entries arrive they
				// automatically join the selection, until the user runs /end or
				// clicks ▼ on a specific entry.
				const top = sessionLog.entries[0];
				if (!top) {
					setStatus('No log entries yet — nothing to mark.', 'error');
					return;
				}
				setStart(top.id);
				setStatus(`▲ Start pinned on "${top.title}" — section is open, growing.`, 'info');
				break;
			}
			case 'end': {
				// Pin the ▼ end marker on the current top-of-log (newest) entry.
				// Needs a start marker first — the section semantics don't allow
				// a bare end.
				if (!hasSection()) {
					setStatus('Pin a start (/start) before pinning an end.', 'error');
					return;
				}
				const top = sessionLog.entries[0];
				if (!top) {
					setStatus('No log entries yet — nothing to mark.', 'error');
					return;
				}
				if (top.id === getStartId()) {
					setStatus(
						'End would be the same entry as the start — that would leave nothing between them.',
						'error',
					);
					return;
				}
				setEnd(top.id);
				setStatus(
					`▼ End pinned on "${top.title}" — section closed. Type /story to generate.`,
					'info',
				);
				break;
			}
			case 'story': {
				if (!hasSection()) {
					setStatus('No section marked. Pin a start (/start) on an entry, then /story.', 'error');
					return;
				}
				document.dispatchEvent(new CustomEvent('ironledger:story-generate'));
				setStatus(
					getEndId() === null
						? 'Generating story from the open section (▲ to now).'
						: 'Generating story from the marked section (▲ to ▼).',
					'info',
				);
				break;
			}
			case 'vital': {
				const charId = getActiveCharacterId();
				if (!charId) {
					setStatus('/vital needs an active character. Type /char <name> first.', 'error');
					return;
				}
				// resource + set actions both drain in CharactersArea, which auto-
				// appends the log line ("Momentum: 2 → 4 (+2)") — nothing to log
				// here beyond the status pill.
				const label = cmd.resource === 'xp' ? 'experience' : cmd.resource;
				if (cmd.op === '=') {
					triggerAction({ charId, type: 'set', key: cmd.resource, value: cmd.value });
					setStatus(`${label} set to ${cmd.value}.`, 'info');
				} else {
					const delta = cmd.op === '+' ? cmd.value : -cmd.value;
					triggerAction({ charId, type: 'resource', key: cmd.resource, value: delta });
					setStatus(`${label} ${delta > 0 ? '+' : ''}${delta}.`, 'info');
				}
				break;
			}
			case 'roll': {
				// Freeform dice roll — no active-context requirement. Each group is
				// rolled with the same CSPRNG the move dialog uses, then flattened
				// into a single DiceSpec[] so the 3D animation shows every die
				// grouped by (sides, color). animateDice no-ops when the user's
				// dice3d preference is off, so no branching needed here.
				const rolled = cmd.groups.map((g) => {
					const values: number[] = [];
					for (let i = 0; i < g.n; i++) values.push(rollDie(g.sides));
					const sum = values.reduce((a, b) => a + b, 0) + g.modifier;
					return { g, values, sum };
				});
				const dice: DiceSpec[] = rolled.flatMap(({ g, values }) =>
					values.map((v) => ({ sides: g.sides, value: v })),
				);
				// Fire-and-forget — the log line lands immediately; animation
				// runs in the overlay behind everything else.
				void animateDice(dice);
				// Build the log body: one row per group + Total when > 1 group.
				// Widths are locked with a monospace-ish alignment via the roll-line
				// class (same font stack as move rolls, keeps digits column-aligned).
				const rows = rolled
					.map(({ g, values, sum }) => {
						const mod =
							g.modifier === 0 ? '' : g.modifier > 0 ? ` +${g.modifier}` : ` ${g.modifier}`;
						return `<div class="roll-line">${g.raw}: [${values.join(', ')}]${mod} = <strong>${sum}</strong></div>`;
					})
					.join('');
				const grandTotal = rolled.reduce((a, r) => a + r.sum, 0);
				const totalRow =
					rolled.length > 1
						? `<div class="roll-line"><strong>Total:</strong> ${grandTotal}</div>`
						: '';
				const label = cmd.groups.map((g) => g.raw).join(' ');
				appendLog(`Roll — ${label}`, rows + totalRow);
				setStatus(
					rolled.length === 1
						? `Rolled ${label} → ${rolled[0].sum}.`
						: `Rolled ${label} → total ${grandTotal}.`,
					'info',
				);
				break;
			}
			case 'initiative': {
				const charId = getActiveCharacterId();
				if (!charId) {
					setStatus('/initiative needs an active character. Type /char <name> first.', 'error');
					return;
				}
				triggerAction({
					charId,
					type: 'initiative',
					key: 'initiative',
					value: initiativeToNumber(cmd.who),
				});
				setStatus(`Initiative → ${cmd.who}.`, 'info');
				break;
			}
			case 'track': {
				const charId = getActiveCharacterId();
				if (!charId) {
					setStatus(`/${cmd.name} needs an active character. Type /char <name> first.`, 'error');
					return;
				}
				if (cmd.op === '=') {
					triggerAction({ charId, type: 'set', key: cmd.name, value: cmd.value });
					setStatus(`${cmd.name} set to ${cmd.value}.`, 'info');
				} else {
					const delta = cmd.op === '+' ? cmd.value : -cmd.value;
					triggerAction({ charId, type: 'resource', key: cmd.name, value: delta });
					setStatus(`${cmd.name} ${delta > 0 ? '+' : ''}${delta}.`, 'info');
				}
				break;
			}
			case 'debility': {
				const charId = getActiveCharacterId();
				if (!charId) {
					setStatus('/debility needs an active character. Type /char <name> first.', 'error');
					return;
				}
				// `toggle` is resolved here against the character's current value;
				// the action bus itself only knows on/off (1/0). Reading through the
				// character store keeps this reactive-safe — no direct data mutation.
				let target: boolean;
				if (cmd.state === 'toggle') {
					const char = getCharacters().find((c) => c.id === charId);
					if (!char) {
						setStatus(`/debility couldn't find the active character.`, 'error');
						return;
					}
					const currently = (char.data as unknown as Record<string, boolean>)[cmd.name];
					target = !currently;
				} else {
					target = cmd.state === 'on';
				}
				triggerAction({ charId, type: 'debility', key: cmd.name, value: target ? 1 : 0 });
				const nameLabel = cmd.name.charAt(0).toUpperCase() + cmd.name.slice(1);
				setStatus(`${nameLabel} ${target ? 'marked' : 'cleared'}.`, 'info');
				break;
			}
			case 'error': {
				setStatus(cmd.message, 'error');
				break;
			}
		}
	}

	// ── Name resolution: prefer exact-id, then prefix, then fuzzy ─────────
	// Restricted to available moves so `/move f ↵` with no character selected
	// doesn't silently open Face Danger — it says "no move matches" instead,
	// matching the (empty) suggestion list.
	function resolveMove(query: string) {
		const list = getVisibleMoves().filter(isMoveAvailable);
		const q = query.toLowerCase().replace(/\s+/g, '-');
		const byId = list.find((m) => m.id === q || m.id === `move/${q}`);
		if (byId) return byId;
		return (
			prefixPick(list, (m) => m.name, query, 1)[0] ??
			fuzzyPick(list, (m) => m.name, query, 1)[0] ??
			null
		);
	}
	function resolveOracle(query: string) {
		const list = getVisibleOracles();
		const q = query.toLowerCase();
		const byKey = list.find((o) => o.key.toLowerCase() === q);
		if (byKey) return byKey;
		return fuzzyPick(list, (o) => o.title, query, 1)[0] ?? null;
	}
	function resolveCharacter(query: string) {
		const list = getCharacters();
		const label = (c: (typeof list)[number]) =>
			(c.data as unknown as CharacterData).name || 'Unnamed';
		return prefixPick(list, label, query, 1)[0] ?? fuzzyPick(list, label, query, 1)[0] ?? null;
	}
	function resolveFoe(query: string) {
		const list = getEncounters();
		const label = (e: (typeof list)[number]) => e.customName || findFoe(e.foeId)?.name || '';
		return prefixPick(list, label, query, 1)[0] ?? fuzzyPick(list, label, query, 1)[0] ?? null;
	}
	function resolveExpedition(query: string) {
		const list = getExpeditions();
		const label = (e: (typeof list)[number]) => e.name || '';
		return prefixPick(list, label, query, 1)[0] ?? fuzzyPick(list, label, query, 1)[0] ?? null;
	}

	// ── Input handlers ────────────────────────────────────────────────────
	// True for commands whose argument is a name that autocomplete is picking
	// from a list. On Enter for these, we prefer the *highlighted* suggestion
	// over whatever raw text is in the input — so "/move e ↵" fires the
	// currently-highlighted move (default: first result) instead of trying to
	// dispatch the literal string "e".
	const NAME_KINDS = new Set(['oracle', 'move', 'char', 'foe', 'exp']);

	function handleSubmit() {
		const cmd = parsed;
		if (!cmd) return;
		if (NAME_KINDS.has(cmd.kind) && suggestions.length > 0) {
			const picked = parseCommand(suggestions[suggestionIdx].apply);
			if (picked) {
				dispatch(picked);
				input = '';
				suggestionIdx = 0;
				return;
			}
		}
		dispatch(cmd);
		input = '';
		suggestionIdx = 0;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			// Tab-complete first if a suggestion is highlighted and args differ.
			if (suggestions.length > 0) {
				const s = suggestions[suggestionIdx];
				if (
					s &&
					input.trim() !== s.apply.trim() &&
					input.trim().startsWith('/') &&
					!input.trim().includes(' ')
				) {
					// Verb-only completion: fill the verb, don't submit.
					input = s.apply;
					e.preventDefault();
					return;
				}
			}
			e.preventDefault();
			handleSubmit();
		} else if (e.key === 'Tab' && suggestions.length > 0) {
			e.preventDefault();
			const s = suggestions[suggestionIdx];
			if (s) input = s.apply;
		} else if (e.key === 'ArrowDown' && suggestions.length > 0) {
			e.preventDefault();
			suggestionIdx = (suggestionIdx + 1) % suggestions.length;
		} else if (e.key === 'ArrowUp' && suggestions.length > 0) {
			e.preventDefault();
			suggestionIdx = (suggestionIdx - 1 + suggestions.length) % suggestions.length;
		} else if (e.key === 'Escape') {
			input = '';
			statusMsg = '';
		}
	}

	function pickSuggestion(s: Suggestion) {
		input = s.apply;
		inputEl?.focus();
	}

	function setStatus(msg: string, kind: 'info' | 'error') {
		statusMsg = msg;
		statusKind = kind;
		// Auto-clear info after a beat; keep errors until the next action.
		if (kind === 'info') {
			const snapshot = msg;
			setTimeout(() => {
				if (statusMsg === snapshot) statusMsg = '';
			}, 2500);
		}
	}
</script>

<div class="cb">
	<div class="cb-context" aria-label="Active context">
		{#if activeCharName}
			<span class="cb-chip cb-chip-char" title="Active character">👤 {activeCharName}</span>
		{/if}
		{#if activeFoe}
			<span class="cb-chip cb-chip-foe" title="Active foe">⚔ {activeFoe.name}</span>
		{/if}
	</div>

	{#if suggestions.length > 0}
		<ul class="cb-sugg" role="listbox">
			{#each suggestions as s, i (s.apply)}
				<li
					class="cb-sugg-item"
					class:cb-sugg-active={i === suggestionIdx}
					role="option"
					aria-selected={i === suggestionIdx}
				>
					<button
						class="cb-sugg-btn"
						type="button"
						onclick={() => pickSuggestion(s)}
						onmousedown={(e) => e.preventDefault()}
					>
						<span class="cb-sugg-label">{s.label}</span>
						{#if s.hint}<span class="cb-sugg-hint">{s.hint}</span>{/if}
					</button>
				</li>
			{/each}
		</ul>
	{/if}

	{#if statusMsg}
		<div class="cb-status" class:cb-status-err={statusKind === 'error'}>{statusMsg}</div>
	{/if}

	<div class="cb-row">
		<span class="cb-caret" aria-hidden="true">›</span>
		<input
			bind:this={inputEl}
			bind:value={input}
			onkeydown={handleKeydown}
			type="text"
			class="cb-input"
			placeholder="Type a note, or hit / for commands, tab to complete."
			autocomplete="off"
			spellcheck="true"
			aria-label="Command bar"
		/>
		<button
			class="cb-help-btn"
			type="button"
			title="Show command help"
			aria-label="Show command help"
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
		background: var(--bg-inset);
		border-top: 1px solid var(--border);
		position: relative;
		flex-shrink: 0;
	}
	.cb-context {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
		min-height: 18px;
	}
	.cb-chip {
		font-family: var(--font-ui);
		font-size: 0.68rem;
		font-weight: 600;
		padding: 2px 8px;
		border-radius: 10px;
		background: var(--bg-control);
		border: 1px solid var(--border-mid);
		color: var(--text-muted);
		white-space: nowrap;
	}
	.cb-chip-char {
		color: var(--text-accent);
	}
	.cb-chip-foe {
		color: var(--color-danger, #ef4444);
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
	.cb-input {
		flex: 1;
		min-width: 0;
		padding: 6px 10px;
		font-family: var(--font-mono, ui-monospace, monospace);
		font-size: 0.85rem;
		background: var(--bg-control);
		color: var(--text);
		border: 1px solid var(--border-mid);
		border-radius: 4px;
	}
	.cb-input:focus {
		outline: none;
		border-color: var(--text-accent);
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
		list-style: none;
		margin: 0;
		padding: 4px 0;
		max-height: 40vh;
		overflow-y: auto;
		background: var(--bg-card);
		border: 1px solid var(--border-mid);
		border-bottom: none;
		border-radius: 6px 6px 0 0;
		box-shadow: 0 -6px 18px #00000030;
		z-index: 5;
	}
	.cb-sugg-item {
		list-style: none;
	}
	.cb-sugg-btn {
		display: flex;
		width: 100%;
		gap: 12px;
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
	.cb-sugg-label {
		flex: 1;
		font-weight: 500;
	}
	.cb-sugg-hint {
		color: var(--text-dimmer);
		font-size: 0.72rem;
	}
</style>
