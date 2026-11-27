<script lang="ts">
	/**
	 * MovesDialog — browse, filter, and roll Ironsworn moves.
	 *
	 * Two internal views:
	 *   picker — searchable, filterable tile grid of all moves
	 *   detail — trigger text, stat selection, adds, Roll button
	 *
	 * Usage:
	 *   <MovesDialog bind:this={ref} ctx={diceCtx} pctx={preconditionCtx} />
	 *   ref.open()          // opens picker
	 *   ref.open('move/id') // opens detail for a specific move
	 */

	import type { MoveDefinition } from '@ironledger/shared';
	import LoadingSpinner from '#lib/components/LoadingSpinner.svelte';
	import type { DiceCtx } from '#lib/diceContext.svelte.js';
	import type { PreconditionContext } from '#lib/preconditions.js';
	import { headingText } from '#lib/fontStore.svelte.js';
	import { moveCategoryIcon } from '#lib/iconRegistry.js';
	import { moveCategoryMeta } from '#lib/extensionCategories.svelte.js';
	import { matchNoteHtml } from '#lib/rollMatch.js';
	import { actionScore } from '#lib/rules/actionScore.js';
	import {
		actionRollHtml,
		askOracleHtml,
		burnMomentumHtml,
		burnMomentumOffer,
		d100Faces,
		moveLogTitle,
		moveMd,
		moveOutcomeBlock,
		outcomeHeaderHtml,
		progressRollHtml,
		resolveHarmLinks,
		spellRollHtml,
		stripHtml,
		tableRollHtml,
		takeAHiatusHtml,
	} from '#lib/moveRoll.js';
	import {
		loadMoves,
		getVisibleMoves,
		getVisibleMoveCategories,
		findMove,
		isProgressMove,
		isNoRollMove,
		isSpellRollMove,
		isTableRollMove,
		hasRollableStats,
	} from '#lib/moveStore.svelte.js';
	import { movePreconditionFailure } from '#lib/preconditions.js';
	import { applyInitiativeDowngrade } from '#lib/initiativeDowngrade.js';
	import { appendLog, bindCommandLinks, triggerAction } from '#lib/log.svelte.js';
	import {
		commandLinkHtml,
		linkVerb,
		readCommandLink,
		type LinkBinding,
	} from '#lib/commands/links.js';
	import { companionHealth, runLink, reportCommandResult } from '#lib/commands/run.svelte.js';
	import { renderRich } from '#lib/dsl.js';
	import { getActiveFoeId, getActiveExpeditionId } from '#lib/activeContext.svelte.js';
	import { untrack } from 'svelte';
	import { momentumReset } from '#lib/character.js';
	import { BURN_MOMENTUM_TITLE } from '#lib/cascadeRules.js';
	import { rollDie, animateDice, DIE_BLACK, DIE_WHITE } from '#lib/dice.js';
	import { playMissScream, preloadMissScream } from '#lib/diceSound.js';

	import diceD6RawSvg from '#icons/dice-d6-light.svg?raw';
	import diceD10RawSvg from '#icons/dice-d10-light.svg?raw';
	import { Dialog } from 'bits-ui';
	import { pushDialog, popDialog, overlayZ, contentZ } from '#lib/dialogStack.svelte.js';
	import DialogHeader from '#lib/components/DialogHeader.svelte';
	import FilterBar from '#lib/components/FilterBar.svelte';
	import { tooltip } from '#lib/actions/tooltip.js';
	import { escHtml } from '#lib/markdown.js';
	import { loadAssets, findAsset } from '#lib/assetStore.svelte.js';
	import Select from '#lib/components/Select.svelte';
	import { vowStatus } from '#lib/commands/values.js';
	import { VOW_FORSAKE_STRESS, type Vow } from '#lib/types.js';
	import { getRelevantAbilities } from '#lib/assetMatcherStore.svelte.js';
	import { getActiveDebilityWarnings } from '#lib/debilityWarnings.js';
	import { isSourceEnabled } from '#lib/expansionStore.svelte.js';

	// ---------------------------------------------------------------------------
	// Props
	// ---------------------------------------------------------------------------
	let {
		ctx = null,
		pctx = {},
		progressContext = {},
	}: {
		ctx: DiceCtx | null;
		pctx: PreconditionContext;
		progressContext?: Record<string, number>;
	} = $props();

	// ---------------------------------------------------------------------------
	// Internal state
	// ---------------------------------------------------------------------------
	// bits-ui Dialog open flag — the primitive owns everything else
	// (portal, overlay, Escape, focus trap). The `open()` / `close()`
	// public methods just flip this.
	let dialogOpen = $state(false);
	let stackDepth = $state(1);
	$effect(() => {
		if (!dialogOpen) return;
		stackDepth = pushDialog();
		return () => popDialog();
	});
	// Ref to the picker view's search input so `onOpenAutoFocus` can
	// land the caret there when the dialog opens in picker mode. The
	// default focus-trap otherwise lands on the DialogHeader's ✕
	// button — the first tabbable descendant.
	let searchInputEl = $state<HTMLInputElement | null>(null);
	let view = $state<'picker' | 'detail'>('picker');
	let selectedId = $state<string | null>(null);
	let search = $state('');
	let activeCategories = $state(new Set<string>());
	let rolling = $state(false);
	let hideDisabled = $state(false);
	let filtersOpen = $state(false);

	// Detail view state
	let selectedStat = $state('');
	let adds = $state(0);
	// Endure Harm/Stress: the amount of harm/stress suffered. Defaults to the
	// active foe's rank when a move is opened, but is editable so the player can
	// set it "as appropriate to the situation" (a fall, a trap, no foe at all).
	let harmValue = $state(1);
	/** The moves that take an amount of harm or stress, with − + and Apply. */
	const ENDURE_MOVES = new Set([
		'move/endure-harm',
		'move/endure-stress',
		'move/companion-endure-harm',
	]);
	// Whether the Apply button has already committed this harm to the character
	// (locks the amount and the button to prevent a double-apply). Reset when the
	// move is (re)opened.
	let harmApplied = $state(false);
	// Declared here (before progressValue, rollStatusHtml, isOracleRollMove, oracleTable)
	// so all derived values that reference it are in TDZ-safe order.
	const selectedMove = $derived(selectedId ? (findMove(selectedId) ?? null) : null);
	const isEndureMove = $derived(!!selectedMove && ENDURE_MOVES.has(selectedMove.id));
	/** Companion Endure Harm: the harm comes off the companion chosen. */
	const isCompanionHarm = $derived(selectedMove?.id === 'move/companion-endure-harm');
	// The harm value that drives the harm-links: the editable input for Endure
	// Harm/Stress, otherwise the active foe's rank.
	const effectiveHarm = $derived(isEndureMove ? harmValue : pctx.foeHarm);
	// ── The vow or companion a move acts on (docs/command-language.md → Moves
	// that act on a vow or a companion). A move with `choose` asks for one
	// here; the choice binds `vow` or `companion` in the entry's links, and
	// Fulfill Your Vow rolls against that vow's progress.
	const chooseKind = $derived(
		selectedMove?.choose === 'vow' || selectedMove?.choose === 'companion'
			? (selectedMove.choose as 'vow' | 'companion')
			: null,
	);
	const vowOptions = $derived(
		((ctx?.data?.vows ?? []) as Vow[])
			.filter((v) => vowStatus(v) === 'active')
			.map((v) => ({
				value: v.id,
				label: `${v.name?.trim() || 'Unnamed vow'} (${v.difficulty.charAt(0).toUpperCase()}${v.difficulty.slice(1)})`,
			})),
	);
	const companionOptions = $derived(
		(ctx?.data?.assets ?? [])
			.filter((a) => findAsset(a.assetId)?.category === 'Companion')
			.map((a) => ({
				value: a.assetId,
				label:
					a.customValues?.['companion-name']?.trim() ||
					a.customValues?.['name']?.trim() ||
					findAsset(a.assetId)?.name ||
					a.assetId,
			})),
	);
	const chooseOptions = $derived(
		chooseKind === 'vow' ? vowOptions : chooseKind === 'companion' ? companionOptions : [],
	);
	/** What the picker shows; the first option until one is picked. */
	let picked = $state('');
	const chosenId = $derived(
		chooseOptions.some((o) => o.value === picked) ? picked : (chooseOptions[0]?.value ?? ''),
	);
	const chosenVow = $derived(
		chooseKind === 'vow'
			? ((ctx?.data?.vows ?? []) as Vow[]).find((v) => v.id === chosenId)
			: undefined,
	);
	const chosenVowId = $derived(chooseKind === 'vow' ? chosenId : '');
	const chosenCompanionId = $derived(chooseKind === 'companion' ? chosenId : '');
	/** What an entry's command links act on: the character, foe and
	 *  expedition it's made for, the vow or companion chosen, and Endure
	 *  Harm/Stress's amount (#lib/commands/links.ts). */
	function entryBinding(): LinkBinding {
		return {
			charId: ctx?.charId,
			foeId: getActiveFoeId() || undefined,
			expId: getActiveExpeditionId() || undefined,
			vowId: chosenVowId || undefined,
			companionId: chosenCompanionId || undefined,
			harm: isEndureMove ? harmValue : undefined,
		};
	}
	// Label + resource for the harm stepper (harm→health, stress→spirit).
	const harmWord = $derived(selectedMove?.id === 'move/endure-stress' ? 'Stress' : 'Harm');
	const progressValue = $derived.by(() => {
		// A move that asks for a vow rolls against its progress.
		if (chooseKind === 'vow') return Math.floor((chosenVow?.ticks ?? 0) / 4);
		const src = selectedMove?.progressSource ?? 'combat';
		const ticks = progressContext[src] ?? 0;
		return Math.floor(ticks / 4);
	});

	// Prepare inline die icons (currentColor so they match the muted text)
	const d6Icon = diceD6RawSvg.replace('<svg ', '<svg fill="currentColor" class="rs-die" ');
	const d10Icon = diceD10RawSvg.replace('<svg ', '<svg fill="currentColor" class="rs-die" ');

	// Roll formula shown in the status area between spinners and roll button
	const rollStatusHtml = $derived.by(() => {
		if (!selectedMove) return '';
		const addsStr = (n: number) => (n !== 0 ? ` + adds[${n >= 0 ? '+' : ''}${n}]` : '');
		if (selectedMove.progressTrack) {
			return `progress[${progressValue}]${addsStr(adds)} vs ${d10Icon} &amp; ${d10Icon}`;
		}
		if (selectedMove.spellRoll) {
			return `${d6Icon} + mana[${manaCommit}] + adds[${adds >= 0 ? '+' : ''}${adds}] vs difficulty[${spellDifficulty}] &amp; ${d10Icon}`;
		}
		if (selectedStat && ctx) {
			// Number(): a character's data can come from a shared backup, and
			// this string is rendered as HTML.
			const val = Number((ctx.data as unknown as Record<string, unknown>)[selectedStat]) || 0;
			return `${d6Icon} + ${escHtml(selectedStat)}[${val}]${addsStr(adds)} vs ${d10Icon} &amp; ${d10Icon}`;
		}
		if (isOracleRollMove && oracleTable.length) {
			const threshold = oracleTable[selectedOddsIdx]?.value?.threshold ?? '?';
			return `${d10Icon} &amp; ${d10Icon} &ge; odds[${threshold}]`;
		}
		if (selectedMove && isTableRollMove(selectedMove)) {
			return `${d10Icon} &amp; ${d10Icon}`;
		}
		return '';
	});

	// Oracle roll move detection
	type OracleOddsEntry = { topRange: number; value: { odds: string; threshold: number } };
	const isOracleRollMove = $derived(
		!!(selectedMove && (selectedMove as Record<string, unknown>)['tableType'] === 'askOracle'),
	);
	const oracleTable = $derived(
		isOracleRollMove
			? (((selectedMove as Record<string, unknown>)['table'] as OracleOddsEntry[]) ?? [])
			: ([] as OracleOddsEntry[]),
	);

	let spellDifficulty = $state(1);
	let manaCommit = $state(0);
	let selectedOddsIdx = $state(2); // default 50/50
	let factorLevels = $state<Record<string, number>>({});
	let factorsManuallySet = $state(false);

	// ---------------------------------------------------------------------------
	// Derived
	// ---------------------------------------------------------------------------
	const moves = $derived(getVisibleMoves());
	const categories = $derived(getVisibleMoveCategories());

	const relevantAbilities = $derived.by(() => {
		if (!selectedMove || !ctx) return [];
		return getRelevantAbilities(
			selectedMove.id,
			(ctx.data.assets as import('#lib/types.js').CharacterAsset[]) ?? [],
			findAsset,
		);
	});

	const debilityWarnings = $derived.by(() => {
		if (!selectedMove || !ctx) return [];
		return getActiveDebilityWarnings(selectedMove.id, ctx.data);
	});

	const filteredMoves = $derived(() => {
		const q = search.trim().toLowerCase();
		return moves.filter((m) => {
			const catMatch = activeCategories.size === 0 || activeCategories.has(m.category);
			const textMatch =
				!q || m.name.toLowerCase().includes(q) || m.triggerShort.toLowerCase().includes(q);
			return catMatch && textMatch;
		});
	});

	// ---------------------------------------------------------------------------
	// Category colour — from the extension manifest (each extension declares
	// its own tint on its moveCategories entry). Falls back to --text-accent
	// for unknown categories so nothing renders black.
	// ---------------------------------------------------------------------------
	function catColor(cat: string): string {
		return moveCategoryMeta(cat)?.color ?? 'var(--text-accent)';
	}

	// ---------------------------------------------------------------------------
	// Stat definitions (for display)
	// ---------------------------------------------------------------------------
	const STAT_COLORS: Record<string, string> = {
		edge: 'var(--color-edge)',
		heart: 'var(--color-heart)',
		iron: 'var(--color-iron)',
		shadow: 'var(--color-shadow)',
		wits: 'var(--color-wits)',
		health: 'var(--color-health)',
		spirit: 'var(--color-spirit)',
		supply: 'var(--color-supply)',
		mana: 'var(--color-touched)',
	};

	function statColor(stat: string): string {
		return STAT_COLORS[stat] ?? 'var(--text-accent)';
	}

	function statValue(stat: string): number | string {
		if (!ctx) return '—';
		return ((ctx.data as unknown as Record<string, unknown>)[stat] as number) ?? 0;
	}

	/** Current numeric value of a character resource, or undefined if no ctx. */
	function resourceValue(key: string): number | undefined {
		if (!ctx) return undefined;
		return ((ctx.data as unknown as Record<string, unknown>)[key] as number) ?? 0;
	}

	// ---------------------------------------------------------------------------
	// Precondition check
	// ---------------------------------------------------------------------------
	function moveFailReason(m: MoveDefinition): string | null {
		return movePreconditionFailure(m.preconditions as string | undefined, ctx?.data, pctx);
	}

	// ---------------------------------------------------------------------------
	// Log text — the pure builders live in lib/moveRoll.ts
	// ---------------------------------------------------------------------------
	/** A roll's log title for this character, expedition and foe. */
	function resolveTitle(move: MoveDefinition, stat?: string): string {
		return moveLogTitle(
			move,
			{ character: ctx?.charName ?? '', expedition: pctx.expeditionName, foe: pctx.foeName },
			stat,
		);
	}

	// Resolve harm links for display in the dialog outcome preview.
	function displayHtml(html: string | undefined): string {
		if (!html) return '';
		return resolveHarmLinks(moveMd(selectedMove, html), {
			moveId: selectedMove?.id,
			foeHarm: effectiveHarm,
			curHealth: resourceValue('health'),
			curSpirit: resourceValue('spirit'),
		});
	}

	// Trigger text, with Endure Harm/Stress harm-links resolved to the harm value
	// (plus the momentum-overflow split). Clicking a resolved link in the trigger
	// applies the harm (see handleDetailClick). Recomputes when the move or the
	// harm input changes, but reads health/spirit via untrack so applying the harm
	// doesn't re-split the still-visible trigger and wipe the struck-through marks.
	const resolvedTriggerHtml = $derived.by(() => {
		const m = selectedMove;
		if (!m) return '';
		let raw = moveMd(m, ((m as Record<string, unknown>).triggerPreamble as string) ?? m.trigger);
		// Forsaking a vow: Endure Stress at the chosen vow's rank.
		if (m.id === 'move/forsake-your-vow' && chosenVow)
			raw = raw.replace(
				'data-cmd="/move endure-stress"',
				`data-cmd="/move endure-stress ${VOW_FORSAKE_STRESS[chosenVow.difficulty]}"`,
			);
		if (!ENDURE_MOVES.has(m.id)) return raw;
		const harm = effectiveHarm; // tracked — recompute when the player edits the amount
		const companionId = chosenCompanionId; // tracked — and when another companion is picked
		return untrack(() =>
			resolveHarmLinks(raw, {
				moveId: m.id,
				foeHarm: harm,
				curHealth: resourceValue('health'),
				curSpirit: resourceValue('spirit'),
				curCompanionHealth: ctx
					? companionHealth(ctx.charId).find((c) => c.id === companionId)?.health
					: undefined,
			}),
		);
	});

	/**
	 * Apply the Endure Harm/Stress amount to the character: reduce health (harm)
	 * or spirit (stress) down to 0, overflowing the remainder to momentum — per
	 * the move's trigger. Locks afterwards to prevent a double-apply.
	 */
	function applyHarm() {
		if (!ctx || harmApplied || !isEndureMove) return;
		// The companion's: through the runner, which logs it and offers any
		// leftover as −momentum (cascadeRules → COMPANION_HEALTH_OVERFLOW).
		if (isCompanionHarm) {
			const r = runLink(`/companion.health-=${harmValue}`, entryBinding());
			reportCommandResult(r);
			if (r.ok) harmApplied = true;
			return;
		}
		const resource = selectedMove?.id === 'move/endure-stress' ? 'spirit' : 'health';
		const curVal = resourceValue(resource) ?? 0;
		const resourceLoss = Math.min(harmValue, curVal);
		const overflow = Math.max(0, harmValue - curVal);
		if (resourceLoss > 0)
			triggerAction({ charId: ctx.charId, type: 'resource', key: resource, value: -resourceLoss });
		if (overflow > 0)
			triggerAction({ charId: ctx.charId, type: 'resource', key: 'momentum', value: -overflow });
		harmApplied = true;
	}

	// ---------------------------------------------------------------------------
	// Public API
	// ---------------------------------------------------------------------------
	export function open(moveId?: string, harm?: number) {
		// Pre-warm the Wilhelm scream buffer so a miss outcome doesn't
		// have to wait on the fetch (idempotent — cached after first call).
		preloadMissScream();
		picked = '';
		if (moveId) {
			selectedId = moveId;
			view = 'detail';
			if (ENDURE_MOVES.has(moveId)) {
				// A link that carries an explicit amount (e.g. forsaking a vow →
				// Endure Stress at the vow's rank) overrides the active-foe default.
				harmValue = harm ?? pctx.foeHarm ?? 1;
				harmApplied = false;
			}
		} else {
			view = 'picker';
			selectedId = null;
		}
		search = '';
		activeCategories = new Set();
		adds = 0;
		spellDifficulty = 1;
		manaCommit = 0;
		selectedOddsIdx = 2;
		factorLevels = {};
		factorsManuallySet = false;
		loadMoves();
		loadAssets();
		dialogOpen = true;
	}

	export function close() {
		dialogOpen = false;
	}

	// ---------------------------------------------------------------------------
	// Navigation
	// ---------------------------------------------------------------------------
	function selectMove(m: MoveDefinition, harm?: number) {
		selectedId = m.id;
		picked = '';
		view = 'detail';
		adds = 0;
		spellDifficulty = 1;
		manaCommit = 0;
		selectedOddsIdx = 2;
		factorLevels = {};
		factorsManuallySet = false;
		if (ENDURE_MOVES.has(m.id)) {
			harmValue = harm ?? pctx.foeHarm ?? 1;
			harmApplied = false;
		}
		// Auto-select first stat
		if (m.stats && m.stats.length > 0) {
			selectedStat = m.stats[0].stat;
		} else {
			selectedStat = '';
		}
	}

	function backToPicker() {
		view = 'picker';
	}

	/** Click delegation inside the detail view: trigger harm links + move-link nav. */
	function handleDetailClick(e: MouseEvent) {
		const target = e.target as HTMLElement;
		const link = target.closest('a.cmd-link') as HTMLElement | null;
		if (!link || link.closest('s')) return;
		e.preventDefault();
		const { cmd } = readCommandLink(link);
		const verb = linkVerb(cmd);
		// A move's link opens that move here.
		if (verb?.verb === 'move') {
			const m = verb.arg.match(/^(.*?)(?:\s+(\d+))?$/);
			const id = `move/${(m?.[1] ?? '').trim().toLowerCase().replace(/\s+/g, '-')}`;
			const targetMove = findMove(id);
			if (targetMove) selectMove(targetMove, m?.[2] ? Number(m[2]) : undefined);
			return;
		}
		if (verb?.verb === 'oracle') {
			reportCommandResult(runLink(cmd, {}));
			return;
		}
		// A value link in the trigger (Endure Harm's, say) applies to the
		// character on a click, and is struck so it can't be applied twice (the
		// trigger HTML is snapshotted, so this survives — see
		// resolvedTriggerHtml). Outcome previews stay read-only: those are
		// committed by rolling, then clicked in the log.
		if (!link.closest('.md-trigger') || !ctx) return;
		const r = runLink(cmd, entryBinding());
		if (r.spend) {
			const struck = document.createElement('s');
			struck.className = 'resource-spent';
			struck.textContent = link.textContent;
			link.replaceWith(struck);
		}
		reportCommandResult(r);
	}

	// ---------------------------------------------------------------------------
	// Helpers
	// ---------------------------------------------------------------------------
	/** Group filtered moves by category, optionally hiding disabled ones. */
	function movesByCategory(cat: string): MoveDefinition[] {
		return filteredMoves().filter((m) => {
			if (m.category !== cat) return false;
			if (hideDisabled && moveFailReason(m)) return false;
			return true;
		});
	}

	// ---------------------------------------------------------------------------
	// Action Roll (1d6 + stat + adds vs 2d10)
	// ---------------------------------------------------------------------------
	async function doActionRoll() {
		if (rolling || !ctx || !selectedMove) return;
		rolling = true;

		const stat = selectedStat;
		// Number(): imported data is untrusted, and both values go into log HTML.
		const sVal = Number((ctx.data as unknown as Record<string, unknown>)[stat]) || 0;
		const aDie = rollDie(6);
		const c1 = rollDie(10);
		const c2 = rollDie(10);
		const mom = Number(ctx.data.momentum) || 0;

		// Momentum cancellation
		const cancelled = mom < 0 && Math.abs(mom) === aDie;
		const effective = cancelled ? 0 : aDie;
		const action = actionScore(effective, sVal, adds);
		const total = action.score;

		const hits1 = total > c1;
		const hits2 = total > c2;
		const isMatch = c1 === c2;

		// Pre-generate entry id for link enrichment
		const entryId = crypto.randomUUID();

		// Build log HTML
		const statLabel = stat.charAt(0).toUpperCase() + stat.slice(1);
		const parts: string[] = [
			actionRollHtml({
				actionDie: aDie,
				cancelled,
				momentum: mom,
				stat,
				statValue: sVal,
				adds,
				action,
				c1,
				c2,
			}),
			outcomeHeaderHtml(hits1, hits2, isMatch),
			matchNoteHtml(hits1, hits2, isMatch),
		];

		// The stat goes with it so Delve the Depths' weak-hit oracle opens on
		// the stat's column; it's saved with the roll for a burn to do the same.
		parts.push(
			moveOutcomeBlock(selectedMove, hits1, hits2, {
				foeHarm: effectiveHarm,
				curHealth: resourceValue('health'),
				curSpirit: resourceValue('spirit'),
				stat,
			}),
		);

		// On a miss for a character move, offer +1 failure (Delve-only mechanic)
		if (!hits1 && !hits2 && isSourceEnabled('delve')) {
			parts.push(
				`<div class="move-failure-row">` +
					commandLinkHtml('+1 failure', '/failures++', { charId: ctx.charId }) +
					`</div>`,
			);
		}

		// Bound in one piece, so each link's place in the entry is its own.
		const html = bindCommandLinks(parts.join(''), entryId, entryBinding());

		close();
		await animateDice([
			{ sides: 6, value: aDie },
			{ sides: 10, value: c1 },
			{ sides: 10, value: c2 },
		]);
		if (!hits1 && !hits2) void playMissScream();
		// Tag the active foe/expedition id when this move's title references it, so
		// the story preface scan can match those entities exactly (not just by name).
		const titleTpl = selectedMove.logTitle ?? '';
		const foeId = titleTpl.includes('{foe}') ? getActiveFoeId() : '';
		const expeditionId = titleTpl.includes('{expedition}') ? getActiveExpeditionId() : '';
		appendLog(resolveTitle(selectedMove, statLabel), html, entryId, undefined, {
			moveId: selectedMove.id,
			actionScore: total,
			c1,
			c2,
			charId: ctx.charId,
			stat,
			...(foeId ? { foeId } : {}),
			...(expeditionId ? { expeditionId } : {}),
			bind: entryBinding(),
		});

		// Burn momentum suggestion: auto-append a clickable log entry when burn would improve outcome.
		// Consistent with overflow/floor/debility cascade pattern — player decides whether to click.
		const burn = burnMomentumOffer({ momentum: mom, cancelled, c1, c2, hits1, hits2 });
		if (burn) {
			const burnEntryId = crypto.randomUUID();
			const burnHtml = burnMomentumHtml({
				rollEntryId: entryId,
				charId: ctx.charId,
				momentum: mom,
				reset: momentumReset(ctx.data),
				...burn,
			});
			appendLog(BURN_MOMENTUM_TITLE, bindCommandLinks(burnHtml, burnEntryId), burnEntryId);
		}

		rolling = false;
	}

	// ---------------------------------------------------------------------------
	// Progress Roll (progress score vs 2d10)
	// ---------------------------------------------------------------------------
	async function doProgressRoll() {
		if (rolling || !selectedMove) return;
		rolling = true;

		const total = progressValue + adds;
		const c1 = rollDie(10);
		const c2 = rollDie(10);
		const hits1 = total > c1;
		const hits2 = total > c2;
		const isMatch = c1 === c2;

		// Initiative downgrade (Lodestar flexible End the Fight): if the move opts
		// in and the character does NOT have initiative, count a strong hit as a
		// weak hit and a weak hit as a miss. eh1/eh2 are the effective (possibly
		// downgraded) hits that drive the logged outcome; the raw dice are still
		// shown in the roll line.
		const {
			hits1: eh1,
			hits2: eh2,
			downgraded,
		} = applyInitiativeDowngrade(hits1, hits2, {
			enabled: !!selectedMove.initiativeDowngrade,
			initiative: pctx.initiative ?? 0,
		});

		// Pre-generate entry id for link enrichment
		const entryId = crypto.randomUUID();

		const parts: string[] = [
			progressRollHtml(progressValue, adds, c1, c2),
			outcomeHeaderHtml(eh1, eh2, isMatch),
		];
		if (downgraded) {
			parts.push(
				'<div class="roll-match-note">Downgraded — you did not have initiative (strong hit counts as weak, weak hit as miss).</div>',
			);
		}
		parts.push(matchNoteHtml(eh1, eh2, isMatch));

		parts.push(
			moveOutcomeBlock(selectedMove, eh1, eh2, {
				foeHarm: effectiveHarm,
				curHealth: resourceValue('health'),
				curSpirit: resourceValue('spirit'),
			}),
		);

		const html = bindCommandLinks(parts.join(''), entryId, entryBinding());

		close();
		await animateDice([
			{ sides: 10, value: c1 },
			{ sides: 10, value: c2 },
		]);
		if (!eh1 && !eh2) void playMissScream();
		appendLog(resolveTitle(selectedMove), html, entryId);

		rolling = false;
	}

	// ---------------------------------------------------------------------------
	// Spell Roll (1d6 + adds vs difficulty + 1d10) — Cast Conclave Ritual
	// ---------------------------------------------------------------------------
	async function doSpellRoll() {
		if (rolling || !ctx || !selectedMove) return;
		rolling = true;

		const aDie = rollDie(6);
		const c1 = rollDie(10);
		const diff = spellDifficulty;
		const mana = manaCommit;
		const total = aDie + adds + mana;

		const hitsDiff = total > diff;
		const hitsC1 = total > c1;

		const entryId = crypto.randomUUID();
		const parts: string[] = [];

		parts.push(
			spellRollHtml({ actionDie: aDie, adds, mana, difficulty: diff, c1 }),
			outcomeHeaderHtml(hitsDiff, hitsC1),
		);

		// Build body: outcome text + mandatory mana cost (always spent)
		let bodyHtml = moveOutcomeBlock(selectedMove, hitsDiff, hitsC1, {
			foeHarm: effectiveHarm,
			curHealth: resourceValue('health'),
			curSpirit: resourceValue('spirit'),
		});
		if (mana > 0) {
			bodyHtml += `<div class="move-outcome">${commandLinkHtml(`-${mana} mana`, `/mana-=${mana}`)} committed.</div>`;
		}
		if (bodyHtml) {
			bodyHtml = bindCommandLinks(bodyHtml, entryId, entryBinding());
			parts.push(bodyHtml);
		}

		const html = parts.join('');

		close();
		await animateDice([
			{ sides: 6, value: aDie },
			{ sides: 10, value: c1 },
		]);
		if (!hitsDiff && !hitsC1) void playMissScream();
		appendLog(resolveTitle(selectedMove), html, entryId);
		rolling = false;
	}

	async function doAskOracle() {
		if (rolling || !oracleTable.length) return;
		const entry = oracleTable[selectedOddsIdx];
		if (!entry) return;
		rolling = true;
		const { odds, threshold } = entry.value;
		const roll = rollDie(100);
		const html = askOracleHtml(roll, odds, threshold);
		const [tensV, onesV] = d100Faces(roll);
		close();
		await animateDice([
			{ sides: 10, value: tensV, color: DIE_BLACK },
			{ sides: 10, value: onesV, color: DIE_WHITE },
		]);
		appendLog(
			selectedMove
				? resolveTitle(selectedMove)
				: ctx
					? `${ctx.charName} \u2014 Ask the Oracle`
					: 'Ask the Oracle',
			html,
			crypto.randomUUID(),
		);
		rolling = false;
	}

	async function doTableRoll() {
		if (rolling || !selectedMove) return;
		rolling = true;
		type TableEntry = { topRange: number; value: string };
		const raw = (selectedMove as Record<string, unknown>)['table'] as TableEntry[] | undefined;
		if (!raw?.length) {
			rolling = false;
			return;
		}
		const entryId = crypto.randomUUID();
		const roll = rollDie(100);
		const found = raw.find((e) => roll <= e.topRange) ?? raw[raw.length - 1];
		const rendered = moveMd(selectedMove, found.value);
		const enriched = bindCommandLinks(rendered, entryId, entryBinding());
		// A d100 table roll is an oracle-style roll — match the oracle log format
		// (`Roll: d100 → N`) rather than the action-die bracket format.
		const html = tableRollHtml(roll, enriched);
		const [tensV, onesV] = d100Faces(roll);
		close();
		await animateDice([
			{ sides: 10, value: tensV, color: DIE_BLACK },
			{ sides: 10, value: onesV, color: DIE_WHITE },
		]);
		appendLog(resolveTitle(selectedMove), html, entryId);
		rolling = false;
	}

	async function doApplyNoRollMove() {
		if (!ctx || !selectedMove) return;

		// Take a Hiatus: the log body comes from the character as it stands.
		if (selectedMove.id === 'move/take-a-hiatus') {
			const entryId = crypto.randomUUID();
			const body = takeAHiatusHtml(
				ctx.data as unknown as Record<string, unknown>,
				momentumReset(ctx.data),
				companionHealth(ctx.charId),
			);
			const enriched = bindCommandLinks(body, entryId, entryBinding());
			close();
			appendLog(resolveTitle(selectedMove), enriched, entryId);
			return;
		}

		const logBody = selectedMove['logBody'] as string | undefined;
		if (!logBody) return;

		const entryId = crypto.randomUUID();
		// logBody is authored in the same markdown + `[label](scheme:args)` DSL as
		// the outcome text, so render it to HTML before enriching its links.
		const enriched = bindCommandLinks(renderRich(logBody), entryId, entryBinding());
		close();
		appendLog(resolveTitle(selectedMove), enriched, entryId);
	}

	// When factor levels change (user explicitly set), sync sum → spellDifficulty.
	$effect(() => {
		if (!factorsManuallySet) return;
		spellDifficulty = Math.max(
			1,
			Object.values(factorLevels).reduce((s, v) => s + v, 0),
		);
	});

	function setFactorLevel(ritualId: string, factorKey: string, level: number) {
		factorsManuallySet = true;
		factorLevels = { ...factorLevels, [`${ritualId}|${factorKey}`]: level };
	}

	// Auto-select first stat when move changes
	$effect(() => {
		if (selectedMove?.stats?.length) {
			selectedStat = selectedMove.stats[0].stat;
		}
	});
</script>

<!-- A move's three outcomes as the detail view previews them. `tour` marks
     the first view's block for the tutorials. -->
{#snippet outcomesPreview(m: MoveDefinition, tour?: string)}
	{#if m.strong || m.weak || m.miss}
		<div class="md-outcomes" data-tour={tour}>
			{#if m.strong}
				<div class="md-outcome-section" style:--outcome-color="var(--color-success, #34d399)">
					<div class="md-outcome-label md-outcome-strong">Strong Hit</div>
					<div class="md-outcome-text">{@html displayHtml(m.strong)}</div>
				</div>
			{/if}
			{#if m.weak}
				<div class="md-outcome-section" style:--outcome-color="var(--color-momentum, #60a5fa)">
					<div class="md-outcome-label md-outcome-weak">Weak Hit</div>
					<div class="md-outcome-text">{@html displayHtml(m.weak)}</div>
				</div>
			{/if}
			{#if m.miss}
				<div class="md-outcome-section" style:--outcome-color="var(--color-danger, #ef4444)">
					<div class="md-outcome-label md-outcome-miss">Miss</div>
					<div class="md-outcome-text">{@html displayHtml(m.miss)}</div>
				</div>
			{/if}
		</div>
	{/if}
{/snippet}

<!-- The Adds stepper, −5 to +5. `needsChar`: off without a character (an
     action or spell roll); a progress roll needs none. -->
{#snippet addsStepper(needsChar: boolean)}
	<span class="md-adds-label">Adds</span>
	<button
		class="md-adj"
		onclick={() => (adds = Math.max(-5, adds - 1))}
		disabled={rolling || (needsChar && !ctx) || adds <= -5}
		aria-label="Decrease adds">−</button
	>
	<span class="md-adds-val" class:positive={adds > 0} class:negative={adds < 0}
		>{adds >= 0 ? '+' : ''}{adds}</span
	>
	<button
		class="md-adj"
		onclick={() => (adds = Math.min(5, adds + 1))}
		disabled={rolling || (needsChar && !ctx) || adds >= 5}
		aria-label="Increase adds">+</button
	>
{/snippet}

<!-- =========================================================================
     Dialog — bits-ui Dialog primitive. Portals into `document.body`,
     manages Escape / focus trap / body scroll lock automatically.
     ========================================================================= -->
<Dialog.Root bind:open={dialogOpen}>
	<Dialog.Portal>
		<Dialog.Overlay class="dialog-overlay md-overlay" style="z-index: {overlayZ(stackDepth)}" />
		<Dialog.Content
			class="moves-dialog"
			style="z-index: {contentZ(stackDepth)}"
			onOpenAutoFocus={(e) => {
				// bits-ui's default focus-trap lands on the first tabbable
				// descendant — the DialogHeader's ✕ button. In picker view
				// jump straight to the search input so the user can start
				// typing immediately. Detail view keeps default behavior
				// (focus lands on the Back button, which is fine there).
				if (view === 'picker') {
					e.preventDefault();
					searchInputEl?.focus();
				}
			}}
		>
			{#if view === 'picker'}
				<!-- ── Picker view ────────────────────────────────────────────────────── -->

				<DialogHeader title={headingText('Moves')} onclose={close} />

				<!-- Controls -->
				<div class="md-controls" data-tour="moves-search">
					<FilterBar
						bind:search
						bind:active={activeCategories}
						bind:filtersOpen
						bind:inputEl={searchInputEl}
						placeholder="Search moves…"
						categories={categories.map((c) => ({ key: c, label: c, color: catColor(c) }))}
					>
						{#snippet trailing()}
							<button
								class="md-hide-disabled-btn"
								class:md-hide-disabled-btn--active={hideDisabled}
								use:tooltip={hideDisabled ? 'Show all moves' : 'Hide unavailable moves'}
								onclick={() => (hideDisabled = !hideDisabled)}
								aria-label={hideDisabled ? 'Show all moves' : 'Hide unavailable moves'}
							>
								{#if hideDisabled}
									<svg
										xmlns="http://www.w3.org/2000/svg"
										width="16"
										height="16"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
										><path
											d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"
										/><path
											d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"
										/><line x1="1" y1="1" x2="23" y2="23" /><path
											d="M14.12 14.12a3 3 0 1 1-4.24-4.24"
										/></svg
									>
								{:else}
									<svg
										xmlns="http://www.w3.org/2000/svg"
										width="16"
										height="16"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
										><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle
											cx="12"
											cy="12"
											r="3"
										/></svg
									>
								{/if}
							</button>
						{/snippet}
					</FilterBar>
				</div>

				<!-- Tile grid grouped by category -->
				<div class="md-body">
					{#if moves.length === 0}
						<div class="md-loading"><LoadingSpinner label="Loading moves…" /></div>
					{:else}
						{@const list = filteredMoves()}
						{#if list.length === 0}
							<div class="md-empty">No moves match.</div>
						{:else}
							{#each categories as cat (cat)}
								{@const catMoves = movesByCategory(cat)}
								{#if catMoves.length > 0}
									<div class="md-category-header" style:--ccolor={catColor(cat)}>{cat}</div>
									<div class="md-grid">
										{#each catMoves as move (move.id)}
											{@const fail = moveFailReason(move)}
											<button
												class="md-tile"
												class:md-tile--dimmed={!!fail}
												data-tour={`move-${move.id.split('/').pop()}`}
												style:--tcolor={catColor(move.category)}
												use:tooltip={{ text: fail ?? move.triggerShort }}
												onclick={() => {
													if (!fail) selectMove(move);
												}}
											>
												<div class="md-tile-stripe"></div>
												<div class="md-tile-body">
													<div class="md-tile-name-row">
														<span class="md-tile-icon" aria-hidden="true">
															{@html moveCategoryIcon(move.category)}
														</span>
														<div class="md-tile-name">{move.name}</div>
													</div>
													<div class="md-tile-desc">{move.triggerShort}</div>
												</div>
											</button>
										{/each}
									</div>
								{/if}
							{/each}
						{/if}
					{/if}
				</div>
			{:else if view === 'detail' && selectedMove}
				<!-- ── Detail view ───────────────────────────────────────────────────── -->

				<DialogHeader title={selectedMove.name} detail>
					{#snippet leading()}
						<span
							class="md-header-icon"
							aria-hidden="true"
							style:--ccolor={catColor(selectedMove.category)}
						>
							{@html moveCategoryIcon(selectedMove.category)}
						</span>
					{/snippet}
					{#snippet trailing()}
						<span class="md-category-badge" style:--ccolor={catColor(selectedMove.category)}>
							{selectedMove.category}
						</span>
					{/snippet}
				</DialogHeader>

				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
				<div class="md-body md-body--detail" role="region" onclick={handleDetailClick}>
					<!-- ── Scrollable read area ── -->
					<div class="md-detail-scroll">
						<!-- Trigger text -->
						<div class="md-trigger" class:applied={isEndureMove && harmApplied}>
							{@html resolvedTriggerHtml}
						</div>

						<!-- A move that acts on a vow or a companion asks which. -->
						{#if chooseKind && ctx}
							<div class="md-choose-row" data-tour="move-choose">
								<span class="md-harm-label">{chooseKind === 'vow' ? 'Vow' : 'Companion'}</span>
								{#if chooseOptions.length}
									<Select
										value={chosenId}
										options={chooseOptions}
										ariaLabel={chooseKind === 'vow' ? 'Vow' : 'Companion'}
										class="md-choose-select"
										onchange={(v) => (picked = String(v))}
									/>
								{:else}
									<span class="md-harm-hint"
										>{chooseKind === 'vow' ? 'No active vow.' : 'No companion.'}</span
									>
								{/if}
							</div>
						{/if}

						<!-- Endure Harm/Stress: how much harm/stress this blow deals. Defaults to
				     the foe's rank; editable for "as appropriate to the situation". The
				     Apply button commits it to the character; then roll. -->
						{#if isEndureMove}
							<div class="md-harm-row" data-tour="move-harm">
								<span class="md-harm-label">{harmWord}</span>
								<button
									class="md-adj"
									onclick={() => (harmValue = Math.max(1, harmValue - 1))}
									disabled={harmValue <= 1 || harmApplied}
									aria-label="Decrease {harmWord.toLowerCase()}">−</button
								>
								<span class="md-harm-val">{harmValue}</span>
								<button
									class="md-adj"
									onclick={() => (harmValue = Math.min(10, harmValue + 1))}
									disabled={harmValue >= 10 || harmApplied}
									aria-label="Increase {harmWord.toLowerCase()}">+</button
								>
								<button
									class="md-harm-apply"
									class:applied={harmApplied}
									onclick={applyHarm}
									disabled={harmApplied || !ctx}
									use:tooltip={harmApplied
										? 'Harm applied'
										: `Apply ${harmValue} ${harmWord.toLowerCase()} to ${isCompanionHarm ? (companionOptions.find((o) => o.value === chosenCompanionId)?.label ?? 'the companion') : 'the character'}`}
								>
									{harmApplied ? 'Applied ✓' : 'Apply'}
								</button>
								<span class="md-harm-hint">foe's rank, or as appropriate</span>
							</div>
						{/if}

						<!-- ── Standard action move ── -->
						{#if hasRollableStats(selectedMove)}
							<!-- Stat picker -->
							{#if selectedMove.stats && selectedMove.stats.length > 0}
								<div class="md-stat-list" data-tour="move-stats">
									{#each selectedMove.stats as s (s.stat)}
										<button
											class="md-stat-row-btn"
											class:selected={selectedStat === s.stat}
											style:--scolor={statColor(s.stat)}
											onclick={() => (selectedStat = s.stat)}
											disabled={rolling || !ctx}
										>
											<span class="md-stat-check" aria-hidden="true"
												>{selectedStat === s.stat ? '✔' : ''}</span
											>
											<span class="md-sdesc">{s.desc}</span>
											<span class="md-stat-chip" style:--scolor={statColor(s.stat)}>
												<span class="md-sname">{s.stat}</span>
												<span class="md-sval">+{statValue(s.stat)}</span>
											</span>
										</button>
									{/each}
								</div>
							{/if}
							<!-- Outcomes -->
							{@render outcomesPreview(selectedMove, 'move-outcomes')}

							<!-- ── Spell roll move ── -->
						{:else if isSpellRollMove(selectedMove)}
							{@render outcomesPreview(selectedMove)}
							<!-- Difficulty factors collapsible -->
							{#if pctx.ritualAssets && pctx.ritualAssets.length > 0}
								<details class="md-factors">
									<summary class="md-factors-summary">
										Difficulty Factors
										{#if factorsManuallySet}
											<span class="md-factors-total">= {spellDifficulty}</span>
										{/if}
									</summary>
									{#each pctx.ritualAssets as ritual (ritual.id)}
										{#if pctx.ritualAssets.length > 1}
											<div class="md-factors-ritual-name">{ritual.name}</div>
										{/if}
										{#each ritual.inspectionFactors as factor (factor.key)}
											{@const levelKey = `${ritual.id}|${factor.key}`}
											{@const currentLevel = factorLevels[levelKey] ?? 0}
											<div class="md-factor">
												<div class="md-factor-header">
													<span class="md-factor-name">{factor.name}</span>
													<div class="md-factor-levels">
														{#each [0, 1, 2] as lvl}
															<button
																class="md-factor-lvl"
																class:active={currentLevel === lvl}
																onclick={() => setFactorLevel(ritual.id, factor.key, lvl)}
																>{lvl}</button
															>
														{/each}
													</div>
												</div>
												<div class="md-factor-desc">{factor.levels[currentLevel]}</div>
											</div>
										{/each}
									{/each}
								</details>
							{/if}

							<!-- ── Progress move ── -->
						{:else if isProgressMove(selectedMove)}
							{@render outcomesPreview(selectedMove)}

							<!-- ── Ask the Oracle ── -->
						{:else if isOracleRollMove}
							<div class="md-stat-list">
								{#each oracleTable as entry, i (entry.value.odds)}
									<button
										class="md-stat-row-btn"
										class:selected={selectedOddsIdx === i}
										style="--scolor: var(--color-accent, #f59e0b)"
										onclick={() => (selectedOddsIdx = i)}
									>
										<span class="md-stat-check" aria-hidden="true"
											>{selectedOddsIdx === i ? '\u2714' : ''}</span
										>
										<span class="md-sdesc">{entry.value.odds}</span>
										<span class="md-oracle-threshold">{entry.value.threshold}</span>
									</button>
								{/each}
							</div>

							<!-- ── Table-roll move ── -->
						{:else if isTableRollMove(selectedMove)}
							{@const tableEntries =
								((selectedMove as Record<string, unknown>)['table'] as Array<{
									topRange: number;
									value: string;
								}>) ?? []}
							{#if tableEntries.length > 0}
								<div class="md-table-list">
									{#each tableEntries as entry, i (entry.topRange)}
										{@const prevTop = i === 0 ? 0 : tableEntries[i - 1].topRange}
										{@const rangeLabel =
											prevTop + 1 === entry.topRange
												? `${entry.topRange}`
												: `${prevTop + 1}\u2013${entry.topRange}`}
										<div class="md-table-row">
											<span class="md-table-range">{rangeLabel}</span>
											<span class="md-table-value">{@html displayHtml(entry.value)}</span>
										</div>
									{/each}
								</div>
							{/if}

							<!-- ── No-roll move ── -->
						{:else if isNoRollMove(selectedMove)}
							{@render outcomesPreview(selectedMove)}
						{/if}

						<!-- Notes -->
						{#if selectedMove.notes}
							<div class="md-notes">
								<div class="md-notes-text">{@html moveMd(selectedMove, selectedMove.notes)}</div>
							</div>
						{/if}
					</div>
					<!-- end md-detail-scroll -->

					<!-- ── Sticky action footer ── -->
					<div class="md-detail-footer">
						<!-- Relevant Assets -->
						{#if ctx && relevantAbilities.length > 0}
							<div class="md-relevant-assets">
								<span class="md-relevant-label">Relevant Assets</span>
								<div class="md-relevant-tags">
									{#each relevantAbilities as ra (`${ra.assetId}-${ra.abilityIndex}`)}
										<div
											class="md-relevant-tag"
											use:tooltip={{ text: stripHtml(ra.abilityText), placement: 'above' }}
										>
											<span class="md-relevant-check">✓</span>
											{ra.assetName} #{ra.abilityIndex + 1}
										</div>
									{/each}
								</div>
							</div>
						{/if}

						<!-- Debility Warnings -->
						{#if ctx && debilityWarnings.length > 0}
							<div class="md-debility-bar">
								<span class="md-debility-label">Debilities</span>
								<div class="md-debility-tags">
									{#each debilityWarnings as w (w.key)}
										<div
											class="md-debility-tag"
											use:tooltip={{ text: w.penalty, placement: 'above' }}
										>
											{w.label}
										</div>
									{/each}
								</div>
							</div>
						{/if}

						{#if hasRollableStats(selectedMove)}
							{@const fail = moveFailReason(selectedMove)}
							<div class="md-footer-top">
								<div class="md-adds-row">
									{@render addsStepper(true)}
								</div>
								<div class="md-roll-status" aria-live="polite">{@html rollStatusHtml}</div>
							</div>
							<div class="md-footer-btns">
								<button class="btn back-btn" onclick={backToPicker} style="margin-right: auto"
									>Back</button
								>
								<button class="btn" onclick={close}>Close</button>
								<span use:tooltip={{ text: fail ?? '' }} style="display: inline-flex;">
									<button
										class="btn btn-primary md-roll-btn"
										onclick={doActionRoll}
										data-tour="move-roll"
										disabled={rolling || !ctx || !!fail}
									>
										{rolling ? 'Rolling…' : 'Roll Move'}
									</button>
								</span>
							</div>
						{:else if isSpellRollMove(selectedMove)}
							<div class="md-footer-top">
								<div class="md-adds-row">
									{@render addsStepper(true)}
									<span class="md-adds-label md-adds-label--gap">Mana</span>
									<button
										class="md-adj"
										onclick={() => (manaCommit = Math.max(0, manaCommit - 1))}
										disabled={rolling || manaCommit <= 0}
										aria-label="Decrease mana">−</button
									>
									<span class="md-adds-val" class:positive={manaCommit > 0}>{manaCommit}</span>
									<button
										class="md-adj"
										onclick={() =>
											(manaCommit = Math.min(
												parseInt(ctx?.data?.globalValues?.['mana'] ?? '0'),
												manaCommit + 1,
											))}
										disabled={rolling ||
											manaCommit >= parseInt(ctx?.data?.globalValues?.['mana'] ?? '0')}
										aria-label="Increase mana">+</button
									>
									<span class="md-adds-label md-adds-label--gap">Difficulty</span>
									<button
										class="md-adj"
										onclick={() => (spellDifficulty = Math.max(1, spellDifficulty - 1))}
										disabled={rolling || spellDifficulty <= 1}
										aria-label="Decrease difficulty">−</button
									>
									<span class="md-adds-val">{spellDifficulty}</span>
									<button
										class="md-adj"
										onclick={() => (spellDifficulty = Math.min(10, spellDifficulty + 1))}
										disabled={rolling || spellDifficulty >= 10}
										aria-label="Increase difficulty">+</button
									>
								</div>
								<div class="md-roll-status" aria-live="polite">{@html rollStatusHtml}</div>
							</div>
							<div class="md-footer-btns">
								<button class="btn back-btn" onclick={backToPicker} style="margin-right: auto"
									>Back</button
								>
								<button class="btn" onclick={close}>Close</button>
								<button
									class="btn btn-primary md-roll-btn md-roll-btn--spell"
									onclick={doSpellRoll}
									disabled={rolling || !ctx}
								>
									{rolling ? 'Rolling…' : 'Roll Move'}
								</button>
							</div>
						{:else if isProgressMove(selectedMove)}
							<div class="md-footer-top">
								<div class="md-adds-row">
									{@render addsStepper(false)}
								</div>
								<div class="md-roll-status" aria-live="polite">{@html rollStatusHtml}</div>
							</div>
							<div class="md-footer-btns">
								<button class="btn back-btn" onclick={backToPicker} style="margin-right: auto"
									>Back</button
								>
								<button class="btn" onclick={close}>Close</button>
								<button
									class="btn btn-primary md-roll-btn"
									onclick={doProgressRoll}
									disabled={rolling}
								>
									{rolling ? 'Rolling…' : 'Roll Move'}
								</button>
							</div>
						{:else if isOracleRollMove}
							<div class="md-footer-btns">
								<button class="btn back-btn" onclick={backToPicker}>Back</button>
								<div class="md-roll-status" aria-live="polite">{@html rollStatusHtml}</div>
								<button class="btn" onclick={close}>Close</button>
								<button class="btn btn-primary md-roll-btn" onclick={doAskOracle} disabled={rolling}
									>{rolling ? 'Rolling…' : 'Roll Move'}</button
								>
							</div>
						{:else if isTableRollMove(selectedMove)}
							<div class="md-footer-btns">
								<button class="btn back-btn" onclick={backToPicker}>Back</button>
								<div class="md-roll-status" aria-live="polite">{@html rollStatusHtml}</div>
								<button class="btn" onclick={close}>Close</button>
								<button
									class="btn btn-primary md-roll-btn"
									onclick={doTableRoll}
									disabled={rolling || !ctx}>{rolling ? 'Rolling…' : 'Roll Move'}</button
								>
							</div>
						{:else if isNoRollMove(selectedMove)}
							<div class="md-footer-btns">
								<button class="btn back-btn" onclick={backToPicker} style="margin-right: auto"
									>Back</button
								>
								{#if selectedMove['logBody'] || selectedMove.id === 'move/take-a-hiatus'}
									<button
										class="btn btn-primary md-roll-btn md-roll-btn--full"
										onclick={doApplyNoRollMove}>Use Move</button
									>
								{/if}
								<button class="btn" onclick={close}>Close</button>
							</div>
						{:else}
							<div class="md-footer-btns">
								<button class="btn back-btn" onclick={backToPicker} style="margin-right: auto"
									>Back</button
								>
								<button class="btn" onclick={close}>Close</button>
							</div>
						{/if}
					</div>
					<!-- end md-detail-footer -->
				</div>
			{/if}
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<style>
	/* ── Dialog shell — bits-ui Dialog.Content ────────────────────────────
	   Portalled to <body>, so the class passes through the component
	   boundary and has to be scoped globally. The shell is a plain
	   position:fixed div (not top-layer), which unblocks a few things
	   the old native <dialog> couldn't do — `dvh` is fine here, and
	   inner popovers no longer need `portalTo={dialogEl}` since
	   there's no top-layer to escape from. */
	:global(.moves-dialog) {
		display: flex;
		flex-direction: column;
		position: fixed;
		top: 8vh;
		left: 50%;
		transform: translateX(-50%);
		width: min(640px, calc(100vw - 1rem));
		/* Definite height — fit-content + max-height collapses the flex:1 body
		   to near-zero on mobile (dialog only shows header + search bar). */
		height: min(84vh, 720px);
		background: var(--bg-card);
		color: var(--text);
		border-radius: 10px;
		box-shadow:
			0 16px 48px #00000070,
			0 0 0 1px var(--border-mid);
		outline: none;
		overflow: hidden;
	}
	/* z-index is set inline via dialogStack — see <script>. */

	/* ── Header ─────────────────────────────────────────────────────────── */
	.md-category-badge {
		font-family: var(--font-ui);
		font-size: 0.6rem;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--ccolor, var(--text-dimmer));
		border: 1px solid color-mix(in srgb, var(--ccolor, var(--border)) 40%, transparent);
		border-radius: 10px;
		padding: 2px 7px;
		flex-shrink: 0;
		white-space: nowrap;
		display: inline-flex;
		align-items: center;
		gap: 4px;
	}
	/* Detail-header leading glyph — the category icon next to the move name,
	   tinted with the category colour (matches the asset card's name icon). */
	.md-header-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 16px;
		height: 16px;
		flex-shrink: 0;
		color: var(--ccolor, var(--text-accent));
	}
	.md-header-icon :global(svg) {
		width: 16px;
		height: 16px;
		fill: currentColor;
	}

	/* ── Controls (search + category tags) ─────────────────────────────── */
	.md-controls {
		padding: 8px 14px 6px;
		border-bottom: 1px solid var(--border);
		flex-shrink: 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.md-hide-disabled-btn {
		background: transparent;
		border: 1px solid transparent;
		color: var(--text-dimmer);
		cursor: pointer;
		padding: 3px 5px;
		border-radius: 3px;
		display: flex;
		align-items: center;
		flex-shrink: 0;
		transition:
			color 0.15s,
			border-color 0.15s;
	}
	.md-hide-disabled-btn:hover {
		color: var(--text);
		border-color: var(--border-mid);
	}
	.md-hide-disabled-btn--active {
		color: var(--text-accent);
	}

	/* ── Scrollable body ─────────────────────────────────────────────────── */
	.md-body {
		flex: 1;
		overflow-y: auto;
		overscroll-behavior: contain;
		padding: 10px 14px;
		min-height: 0;
	}
	.md-body--detail {
		display: flex;
		flex-direction: column;
		gap: 0;
		overflow: hidden;
		padding: 0;
	}

	.md-detail-scroll {
		flex: 1;
		overflow-y: auto;
		overscroll-behavior: contain;
		padding: 10px 14px;
		min-height: 0;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.md-detail-footer {
		flex-shrink: 0;
		border-top: 1px solid var(--border);
		padding: 10px 14px;
		display: flex;
		flex-direction: column;
		gap: 8px;
		background: var(--bg-card);
	}

	.md-footer-top {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 8px;
	}

	.md-footer-btns {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 8px;
	}

	.md-loading,
	.md-empty {
		font-family: var(--font-ui);
		font-size: 0.78rem;
		color: var(--text-dimmer);
		text-align: center;
		padding: 2rem 1rem;
	}

	/* ── Category headers ───────────────────────────────────────────────── */
	.md-category-header {
		font-family: var(--font-ui);
		font-size: 0.62rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--ccolor, var(--text-dimmer));
		padding: 10px 0 4px;
	}
	.md-category-header:first-child {
		padding-top: 0;
	}

	/* ── Tile grid ───────────────────────────────────────────────────────── */
	.md-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
		gap: 6px;
		margin-bottom: 4px;
	}
	.md-tile {
		display: flex;
		flex-direction: row;
		align-items: stretch;
		text-align: left;
		background: var(--bg-control);
		border: 1px solid var(--border);
		border-radius: 6px;
		overflow: hidden;
		cursor: pointer;
		padding: 0;
		color: var(--text);
		font-family: var(--font-ui);
		transition:
			background 0.12s,
			border-color 0.12s;
	}
	.md-tile:hover {
		background: var(--bg-hover);
		border-color: var(--tcolor, var(--border-mid));
	}
	.md-tile--dimmed,
	.md-tile:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
	.md-tile--dimmed:hover:not(:disabled) {
		opacity: 0.65;
	}

	.md-tile-stripe {
		width: 4px;
		flex-shrink: 0;
		background: var(--tcolor, var(--text-accent));
	}
	.md-tile-body {
		padding: 6px 8px;
		flex: 1;
		min-width: 0;
	}
	/* Name row — small category glyph inline before the name, tinted with the
	   category colour. Matches the asset picker tile (icon next to the header,
	   not a full-height left column). */
	.md-tile-name-row {
		display: flex;
		align-items: center;
		gap: 6px;
		min-width: 0;
		margin-bottom: 2px;
	}
	.md-tile-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 15px;
		height: 15px;
		flex-shrink: 0;
		color: var(--tcolor, var(--text-muted));
	}
	.md-tile-icon :global(svg) {
		width: 15px;
		height: 15px;
		fill: currentColor;
	}
	.md-tile-name {
		flex: 1;
		min-width: 0;
		font-size: 0.72rem;
		font-weight: 700;
		line-height: 1.2;
		color: var(--text);
	}
	.md-tile-desc {
		font-size: 0.62rem;
		color: var(--text-dimmer);
		line-height: 1.3;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	/* ── Detail view ─────────────────────────────────────────────────────── */
	.md-trigger {
		font-family: var(--font-ui);
		font-size: 0.78rem;
		color: var(--text-muted);
		line-height: 1.5;
	}
	.md-trigger :global(strong) {
		color: var(--text);
		font-weight: 600;
	}
	.md-trigger :global(a) {
		cursor: pointer;
		color: var(--text-accent);
	}
	.md-trigger :global(ul),
	.md-trigger :global(ol) {
		margin: 4px 0;
		padding-left: 1.5em;
	}
	.md-trigger :global(li) {
		margin-bottom: 3px;
	}

	/* ── Stat picker ─────────────────────────────────────────────────────── */
	.md-stat-list {
		display: flex;
		flex-direction: column;
		gap: 3px;
	}
	.md-stat-row-btn {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 5px 8px;
		background: var(--bg-control);
		border: 1px solid var(--border);
		border-radius: 5px;
		cursor: pointer;
		color: var(--text-muted);
		font-family: var(--font-ui);
		transition:
			background 0.12s,
			border-color 0.12s;
		text-align: left;
	}
	.md-stat-row-btn:hover:not(:disabled):not(.selected) {
		background: var(--bg-hover);
		border-color: var(--border-mid);
	}
	.md-stat-row-btn.selected {
		background: color-mix(in srgb, var(--scolor) 10%, var(--bg-control));
		border-color: var(--scolor);
	}
	.md-stat-row-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.md-stat-check {
		width: 16px;
		flex-shrink: 0;
		font-size: 0.7rem;
		color: var(--scolor);
		text-align: center;
	}

	.md-sdesc {
		flex: 1;
		font-family: var(--font-ui);
		font-size: 0.78rem;
		color: var(--text-muted);
		line-height: 1.3;
	}

	.md-stat-chip {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 4px;
		min-width: 80px;
		padding: 2px 8px;
		border-radius: 4px;
		background: color-mix(in srgb, var(--scolor) 12%, var(--bg-control));
		border: 1px solid color-mix(in srgb, var(--scolor) 30%, transparent);
		color: var(--scolor);
		flex-shrink: 0;
	}
	.md-sname {
		font-size: 0.58rem;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		line-height: 1;
	}
	.md-sval {
		font-size: 0.85rem;
		font-weight: 700;
		line-height: 1;
	}

	/* ── Action row (adds + roll button) ─────────────────────────────────── */
	.md-adds-row {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.md-adds-label {
		font-family: var(--font-ui);
		font-size: 0.75rem;
		color: var(--text-muted);
		min-width: 28px;
	}
	.md-adj {
		width: 22px;
		height: 22px;
		padding: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 3px;
		cursor: pointer;
		font-size: 0.9rem;
		font-family: var(--font-ui);
		color: var(--text);
		line-height: 1;
	}
	.md-adj:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}
	.md-adj:not(:disabled):hover {
		background: var(--bg-hover);
		border-color: var(--border-mid);
	}

	.md-adds-val {
		min-width: 28px;
		text-align: center;
		font-family: var(--font-ui);
		font-size: 0.9rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		color: var(--text);
	}
	.md-adds-val.positive {
		color: var(--color-success);
	}
	.md-adds-val.negative {
		color: var(--color-danger);
	}

	/* ── Endure Harm/Stress amount stepper ───────────────────────────────── */
	.md-harm-row {
		display: flex;
		align-items: center;
		gap: 6px;
		margin: 8px 0 2px;
	}
	.md-harm-label {
		font-family: var(--font-ui);
		font-size: 0.72rem;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.md-harm-val {
		min-width: 22px;
		text-align: center;
		font-family: var(--font-ui);
		font-size: 0.95rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		color: var(--color-danger);
	}
	.md-harm-hint {
		font-family: var(--font-ui);
		font-size: 0.66rem;
		font-style: italic;
		color: var(--text-dimmer);
		margin-left: 2px;
	}
	.md-harm-apply {
		padding: 3px 10px;
		border: 1px solid var(--color-danger);
		border-radius: 3px;
		background: var(--bg-control);
		color: var(--color-danger);
		font-family: var(--font-ui);
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		cursor: pointer;
		white-space: nowrap;
	}
	.md-harm-apply:not(:disabled):hover {
		background: var(--bg-hover);
	}
	.md-harm-apply.applied {
		border-color: var(--border);
		color: var(--color-success);
	}
	.md-harm-apply:disabled {
		cursor: default;
		opacity: 0.85;
	}

	/* Endure Harm/Stress damage amounts in the trigger — descriptive (the Apply
	   button commits them), struck once applied. */
	.md-trigger :global(.harm-amount) {
		color: var(--color-danger);
		font-weight: 600;
	}
	.md-trigger.applied :global(.harm-amount) {
		color: var(--text-dimmer);
		font-weight: 400;
		text-decoration: line-through;
	}

	/* ── Progress row ────────────────────────────────────────────────────── */

	/* ── Roll button ─────────────────────────────────────────────────────── */
	.md-roll-btn {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 5px 16px;
	}
	/* Roll status — left side of footer-btns row, expands to fill space */
	.md-roll-status {
		flex: 1;
		min-width: 0;
		text-align: left;
		font-family: var(--font-ui, monospace);
		font-size: 0.864rem;
		color: var(--text-muted);
		font-style: italic;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		padding: 0 6px;
	}
	/* Inline die icons inside roll status formula (injected via @html) */
	:global(.rs-die) {
		width: 1em;
		height: 1em;
		display: inline;
		vertical-align: -0.15em;
	}

	/* ── Ask the Oracle odds selection ───────────────────────── */
	.md-oracle-threshold {
		margin-left: auto;
		font-size: 0.8rem;
		font-weight: 600;
		color: var(--text-muted);
		min-width: 2.5em;
		text-align: right;
	}
	.md-stat-row-btn.selected .md-oracle-threshold {
		color: var(--scolor);
	}
	/* Roll formula elements */

	/* ── Outcomes (no-roll moves) ────────────────────────────────────────── */
	.md-outcomes {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.md-outcome-section {
		padding: 6px 8px;
		border-left: 3px solid var(--outcome-color, var(--border));
		border-radius: 0 4px 4px 0;
		background: var(--bg-inset);
	}
	.md-outcome-label {
		font-family: var(--font-ui);
		font-size: 0.65rem;
		font-weight: 700;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		margin-bottom: 3px;
	}
	.md-outcome-strong {
		color: var(--color-success, #34d399);
	}
	.md-outcome-weak {
		color: var(--color-momentum, #60a5fa);
	}
	.md-outcome-miss {
		color: var(--color-danger, #ef4444);
	}
	.md-outcome-text {
		font-family: var(--font-ui);
		font-size: 0.76rem;
		color: var(--text-muted);
		line-height: 1.5;
	}
	.md-outcome-text :global(.log-only) {
		display: none;
	}
	/* renderRich wraps prose in <p>; zero the browser default so spacing matches
	   the old inline output (last-child flush to the container). */
	.md-outcome-text :global(p) {
		margin: 0 0 4px;
	}
	.md-outcome-text :global(p:last-child) {
		margin-bottom: 0;
	}
	.md-outcome-text :global(strong) {
		color: var(--text);
		font-weight: 600;
	}
	.md-outcome-text :global(ul) {
		margin: 3px 0;
		padding-left: 1.3em;
	}
	.md-outcome-text :global(li) {
		margin-bottom: 2px;
	}
	.md-outcome-text :global(a) {
		color: var(--text-accent);
		text-decoration: underline;
		cursor: pointer;
	}
	/* Value links are inert in an outcome preview: they come alive in the log,
	   once the roll is made. Move and oracle links stay live. */
	.md-outcome-text :global(a.cmd-link:not([data-verb])) {
		pointer-events: none;
		cursor: default;
		text-decoration: none;
	}

	/* The vow or companion a move acts on. */
	.md-choose-row {
		display: flex;
		align-items: center;
		gap: 10px;
		margin: 8px 0 4px;
	}
	.md-choose-row :global(.md-choose-select) {
		flex: 1;
		min-width: 0;
	}

	/* Harm placeholder: no foe context — player must resolve manually */
	.md-outcome-text :global(.harm-note) {
		font-style: italic;
		color: var(--text-dimmer);
	}

	/* ── Inline table (tableRoll moves) ───────────────────────────────────── */
	.md-table-list {
		display: flex;
		flex-direction: column;
		gap: 2px;
		margin: 8px 0;
	}
	.md-table-row {
		display: grid;
		grid-template-columns: 3.5rem 1fr;
		gap: 8px;
		font-size: 0.8rem;
		line-height: 1.4;
		padding: 4px 0;
		border-bottom: 1px solid var(--border);
	}
	.md-table-row:last-child {
		border-bottom: none;
	}
	.md-table-range {
		color: var(--text-dimmer);
		font-size: 0.75rem;
		text-align: right;
		padding-right: 4px;
		white-space: nowrap;
		align-self: start;
		padding-top: 1px;
	}
	.md-table-value {
		color: var(--text);
	}

	/* ── Notes ────────────────────────────────────────────────────────────── */
	.md-notes {
		border-top: 1px solid var(--border);
		padding-top: 8px;
	}
	.md-notes-text {
		font-family: var(--font-ui);
		font-size: 0.72rem;
		color: var(--text-dimmer);
		line-height: 1.5;
		/* Plain by default — emphasis comes from markdown (`*italic*` → <em>), not
		   a blanket font-style on the whole note. */
	}
	.md-notes-text :global(p) {
		margin: 0 0 4px;
	}
	.md-notes-text :global(p:last-child) {
		margin-bottom: 0;
	}
	/* ── Difficulty Factors (spell roll collapsible) ───────────────────────── */
	.md-factors {
		margin-top: 6px;
		border: 1px solid var(--border-mid);
		border-radius: 6px;
		overflow: hidden;
	}

	.md-factors-summary {
		padding: 6px 10px;
		font-size: 0.7rem;
		font-weight: 600;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.06em;
		cursor: pointer;
		list-style: none;
		display: flex;
		align-items: center;
		gap: 6px;
		user-select: none;
	}
	.md-factors-summary::-webkit-details-marker {
		display: none;
	}
	.md-factors-summary::before {
		content: '\25B8';
		font-size: 0.65rem;
		transition: transform 0.15s;
	}
	details.md-factors[open] .md-factors-summary::before {
		transform: rotate(90deg);
	}

	.md-factors-total {
		margin-left: auto;
		font-size: 0.8rem;
		font-weight: 700;
		color: var(--text-accent, #60a5fa);
	}

	.md-factors-ritual-name {
		padding: 4px 10px 2px;
		font-size: 0.65rem;
		color: var(--text-dimmer);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		font-weight: 600;
	}

	.md-factor {
		padding: 5px 10px;
		border-top: 1px solid var(--border-mid);
	}

	.md-factor-header {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.md-factor-name {
		flex: 1;
		font-size: 0.72rem;
		color: var(--text);
		font-weight: 500;
	}

	.md-factor-levels {
		display: flex;
		gap: 3px;
	}

	.md-factor-lvl {
		width: 22px;
		height: 22px;
		border-radius: 4px;
		border: 1px solid var(--border-mid);
		background: transparent;
		color: var(--text-muted);
		font-size: 0.72rem;
		cursor: pointer;
		padding: 0;
		text-align: center;
		transition:
			background 0.1s,
			color 0.1s;
	}
	.md-factor-lvl.active {
		background: var(--text-accent, #60a5fa);
		color: #fff;
		border-color: transparent;
	}
	.md-factor-lvl:hover:not(.active) {
		background: rgba(255, 255, 255, 0.06);
		color: var(--text);
	}

	.md-factor-desc {
		margin-top: 2px;
		font-size: 0.67rem;
		color: var(--text-dimmer);
		line-height: 1.45;
	}

	.md-adds-label--gap {
		margin-left: 0.65rem;
	}

	.md-roll-btn--spell {
		flex: 0 0 auto;
		margin-left: auto;
	}

	/* ── Relevant Assets — tag row ───────────────────────────────────────── */
	.md-relevant-assets {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 6px;
	}

	.md-relevant-label {
		font-family: var(--font-ui);
		font-size: 0.62rem;
		font-weight: 600;
		letter-spacing: 0.07em;
		text-transform: uppercase;
		color: var(--text-dimmer);
		white-space: nowrap;
		flex-shrink: 0;
	}

	.md-relevant-tags {
		display: flex;
		flex-wrap: wrap;
		gap: 5px;
	}

	.md-relevant-tag {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 3px 9px 3px 7px;
		border-radius: 10px;
		border: 1px solid var(--border-mid);
		background: var(--bg-inset);
		font-family: var(--font-ui);
		font-size: 0.72rem;
		font-weight: 500;
		color: var(--text-muted);
		cursor: default;
		transition:
			border-color 0.12s,
			color 0.12s,
			background 0.12s;
	}
	.md-relevant-tag:hover {
		border-color: var(--text-accent);
		color: var(--text);
		background: color-mix(in srgb, var(--text-accent) 8%, var(--bg-inset));
	}

	.md-relevant-check {
		font-size: 0.65rem;
		color: var(--color-success, #34d399);
		flex-shrink: 0;
	}

	/* ── Debility warning bar ──────────────────────────────────────────── */
	.md-debility-bar {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 6px;
	}

	.md-debility-label {
		font-family: var(--font-ui);
		font-size: 0.62rem;
		font-weight: 600;
		letter-spacing: 0.07em;
		text-transform: uppercase;
		color: var(--color-danger);
		white-space: nowrap;
		flex-shrink: 0;
	}

	.md-debility-tags {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}

	.md-debility-tag {
		display: inline-flex;
		align-items: center;
		padding: 2px 6px;
		border-radius: 4px;
		border: 1px solid var(--color-danger);
		background: color-mix(in srgb, var(--color-danger) 12%, transparent);
		font-family: var(--font-ui);
		font-size: 0.6rem;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--color-danger);
		cursor: default;
	}
</style>
