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
	import type { DiceCtx } from '$lib/diceContext.svelte.js';
	import type { PreconditionContext } from '$lib/preconditions.js';
	import {
		loadMoves,
		getMoves,
		getMoveCategories,
		findMove,
		isProgressMove,
		isNoRollMove,
		isSpellRollMove,
		isTableRollMove,
		hasRollableStats,
	} from '$lib/moveStore.svelte.js';
	import { firstPreconditionFailure } from '$lib/preconditions.js';
	import { appendLog, enrichOutcomeLinks, SESSION_LOG_ID } from '$lib/log.svelte.js';
	import { momentumReset } from '$lib/character.js';
	import { BURN_MOMENTUM_TITLE } from '$lib/cascadeRules.js';
	import { rollDie, animateDice, DIE_BLACK, DIE_WHITE } from '$lib/dice.js';

	import clearFiltersSvg from '$icons/filter-circle-xmark-solid-full.svg?raw';
	import diceD6RawSvg   from '$icons/dice-d6-light.svg?raw';
	import diceD10RawSvg  from '$icons/dice-d10-light.svg?raw';
	import diceD100RawSvg from '$icons/dice-d100-solid.svg?raw';
	import { draggable } from '$lib/actions/draggable.js';

	// ---------------------------------------------------------------------------
	// Props
	// ---------------------------------------------------------------------------
	let {
		ctx  = null,
		pctx = {},
		progressContext = {},
		onInitiativeChange,
	}: {
		ctx:              DiceCtx | null;
		pctx:             PreconditionContext;
		progressContext?: Record<string, number>;
		onInitiativeChange?: (value: 'character' | 'foe' | 'none') => void;
	} = $props();

	// ---------------------------------------------------------------------------
	// Internal state
	// ---------------------------------------------------------------------------
	let dialogEl         = $state<HTMLDialogElement | null>(null);
	let view             = $state<'picker' | 'detail'>('picker');
	let selectedId       = $state<string | null>(null);
	let search           = $state('');
	let activeCategories = $state(new Set<string>());
	let rolling          = $state(false);
	let hideDisabled     = $state(false);

	// Detail view state
	let selectedStat     = $state('');
	let adds             = $state(0);
	const progressValue  = $derived.by(() => {
		const src   = selectedMove?.progressSource ?? 'combat';
		const ticks = progressContext[src] ?? 0;
		return Math.floor(ticks / 4);
	});

	// Prepare inline die icons (currentColor so they match the muted text)
	const d6Icon   = diceD6RawSvg.replace('<svg ', '<svg fill="currentColor" class="rs-die" ');
	const d10Icon  = diceD10RawSvg.replace('<svg ', '<svg fill="currentColor" class="rs-die" ');
	const d100Icon = diceD100RawSvg.replace('<svg ', '<svg fill="currentColor" class="rs-die" ');

	// Roll formula shown in the status area between spinners and roll button
	const rollStatusHtml = $derived.by(() => {
		if (!selectedMove) return '';
		const addsStr = (n: number) => n !== 0 ? ` + adds[${n >= 0 ? '+' : ''}${n}]` : '';
		if (selectedMove.progressTrack) {
			return `progress[${progressValue}]${addsStr(adds)} vs ${d10Icon} &amp; ${d10Icon}`;
		}
		if (selectedMove.spellRoll) {
			return `${d6Icon} + mana[${manaCommit}] + adds[${adds >= 0 ? '+' : ''}${adds}] vs difficulty[${spellDifficulty}] &amp; ${d10Icon}`;
		}
		if (selectedStat && ctx) {
			const val = (ctx.data as Record<string, unknown>)[selectedStat] as number ?? 0;
			return `${d6Icon} + ${selectedStat}[${val}]${addsStr(adds)} vs ${d10Icon} &amp; ${d10Icon}`;
		}
		if (isOracleRollMove && oracleTable.length) {
			const threshold = oracleTable[selectedOddsIdx]?.value?.threshold ?? '?';
			return `${d100Icon} &ge; odds[${threshold}]`;
		}
		if (selectedMove && isTableRollMove(selectedMove)) {
			return `${d100Icon}`;
		}
		return '';
	});

	// Oracle roll move detection
	type OracleOddsEntry = { topRange: number; value: { odds: string; threshold: number } };
	const isOracleRollMove = $derived(
		!!(selectedMove && (selectedMove as Record<string, unknown>)['tableType'] === 'askOracle')
	);
	const oracleTable = $derived(
		isOracleRollMove
			? ((selectedMove as Record<string, unknown>)['table'] as OracleOddsEntry[]) ?? []
			: [] as OracleOddsEntry[]
	);

	let spellDifficulty  = $state(1);
	let manaCommit       = $state(0);
	let selectedOddsIdx  = $state(2); // default 50/50
	let factorLevels     = $state<Record<string, number>>({});
	let factorsManuallySet = $state(false);

	// ---------------------------------------------------------------------------
	// Derived
	// ---------------------------------------------------------------------------
	const moves      = $derived(getMoves());
	const categories = $derived(getMoveCategories());
	const selectedMove = $derived(
		selectedId ? findMove(selectedId) ?? null : null,
	);

	const filteredMoves = $derived(() => {
		const q = search.trim().toLowerCase();
		return moves.filter((m) => {
			const catMatch  = activeCategories.size === 0 || activeCategories.has(m.category);
			const textMatch = !q
				|| m.name.toLowerCase().includes(q)
				|| m.triggerShort.toLowerCase().includes(q);
			return catMatch && textMatch;
		});
	});

	// ---------------------------------------------------------------------------
	// Category colours
	// ---------------------------------------------------------------------------
	const CATEGORY_COLORS: Record<string, string> = {
		'Adventure':    'var(--color-wits)',
		'Relationship': 'var(--color-heart)',
		'Combat':       'var(--color-iron)',
		'Suffer':       'var(--color-danger, #ef4444)',
		'Quest':        'var(--color-momentum)',
		'Fate':         'var(--color-spirit)',
		'Delve':        'var(--color-shadow)',
		'Rarity':       'var(--color-touched)',
		'Failure':      'var(--text-dimmer)',
		'Yrt':          'var(--color-touched)',
	};

	function catColor(cat: string): string {
		return CATEGORY_COLORS[cat] ?? 'var(--text-accent)';
	}

	// ---------------------------------------------------------------------------
	// Stat definitions (for display)
	// ---------------------------------------------------------------------------
	const STAT_COLORS: Record<string, string> = {
		edge:     'var(--color-edge)',
		heart:    'var(--color-heart)',
		iron:     'var(--color-iron)',
		shadow:   'var(--color-shadow)',
		wits:     'var(--color-wits)',
		health:   'var(--color-heart)',
		spirit:   'var(--color-spirit)',
		supply:   'var(--color-supply, #34d399)',
		mana:     'var(--color-touched)',
	};

	function statColor(stat: string): string {
		return STAT_COLORS[stat] ?? 'var(--text-accent)';
	}

	function statValue(stat: string): number | string {
		if (!ctx) return '—';
		return (ctx.data as Record<string, unknown>)[stat] as number ?? 0;
	}

	// ---------------------------------------------------------------------------
	// Precondition check
	// ---------------------------------------------------------------------------
	function moveFailReason(m: MoveDefinition): string | null {
		if (!ctx) {
			return m.preconditions?.length ? 'No character selected' : null;
		}
		return firstPreconditionFailure(
			m.preconditions as import('$lib/preconditions.js').Precondition[] | undefined,
			ctx.data,
			pctx,
		);
	}

	// ---------------------------------------------------------------------------
	// Outcome helpers
	// ---------------------------------------------------------------------------
	function outcomeClass(hits1: boolean, hits2: boolean): string {
		if (hits1 && hits2) return 'roll-outcome-strong';
		if (hits1 || hits2) return 'roll-outcome-weak';
		return 'roll-outcome-miss';
	}
	function outcomeLabel(hits1: boolean, hits2: boolean): string {
		if (hits1 && hits2) return 'Strong Hit';
		if (hits1 || hits2) return 'Weak Hit';
		return 'Miss';
	}

	function logTitle(label: string): string {
		return ctx ? `${ctx.charName} \u2014 ${label}` : label;
	}

	function getOutcomeHtml(m: MoveDefinition, hits1: boolean, hits2: boolean): string {
		if (hits1 && hits2) return m.strong ?? '';
		if (hits1 || hits2) return m.weak ?? '';
		return m.miss ?? '';
	}

	// Resolve <a class="harm-link"> placeholders.
	// ctx.moveId + ctx.foeHarm present (Endure Harm/Stress) → real resource-link.
	// Otherwise → move-link so the player can navigate to the appropriate suffer move.
	function resolveHarmLinks(html: string, ctx?: { moveId?: string; foeHarm?: number }): string {
		const harm   = ctx?.foeHarm ?? 1;
		const moveId = ctx?.moveId ?? '';
		// Health harm-links: known foe → clickable resource-link; no foe → plain placeholder text.
		html = html.replace(
			/<a class="harm-link" data-resource="health">-harm health<\/a>/g,
			moveId === 'move/endure-harm' && ctx?.foeHarm !== undefined
				? `<a class="resource-link" data-resource="health" data-value="-${harm}">-${harm} health</a>`
				: '<span class="harm-note">-harm health</span>',
		);
		// Spirit harm-links: known foe → clickable resource-link; no foe → plain placeholder text.
		html = html.replace(
			/<a class="harm-link" data-resource="spirit">-harm spirit<\/a>/g,
			moveId === 'move/endure-stress' && ctx?.foeHarm !== undefined
				? `<a class="resource-link" data-resource="spirit" data-value="-${harm}">-${harm} spirit</a>`
				: '<span class="harm-note">-harm spirit</span>',
		);
		return html;
	}

	// Resolve harm links for display in the dialog outcome preview.
	function displayHtml(html: string | undefined): string {
		if (!html) return '';
		return resolveHarmLinks(html, { moveId: selectedMove?.id, foeHarm: pctx.foeHarm });
	}

	// ---------------------------------------------------------------------------
	// Public API
	// ---------------------------------------------------------------------------
	export function open(moveId?: string) {
		if (moveId) {
			selectedId = moveId;
			view       = 'detail';
		} else {
			view       = 'picker';
			selectedId = null;
		}
		search           = '';
		activeCategories = new Set();
		adds               = 0;
			spellDifficulty    = 1;
		manaCommit         = 0;
		selectedOddsIdx    = 2;
		factorLevels       = {};
		factorsManuallySet = false;
		loadMoves();
		dialogEl?.showModal();
	}

	export function close() {
		dialogEl?.close();
	}

	// ---------------------------------------------------------------------------
	// Navigation
	// ---------------------------------------------------------------------------
	function selectMove(m: MoveDefinition) {
		selectedId     = m.id;
		view           = 'detail';
		adds           = 0;
			spellDifficulty  = 1;
		manaCommit       = 0;
		selectedOddsIdx  = 2;
		factorLevels     = {};
		factorsManuallySet = false;
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

	/** Click delegation for move-link navigation inside detail view. */
	function handleDetailClick(e: MouseEvent) {
		const link = (e.target as HTMLElement).closest('.move-link') as HTMLElement | null;
		if (!link) return;
		e.preventDefault();
		const moveId = link.dataset['id'];
		if (moveId) {
			const target = findMove(moveId);
			if (target) selectMove(target);
		}
	}

	// ---------------------------------------------------------------------------
	// Helpers
	// ---------------------------------------------------------------------------
	function toggleCategory(cat: string) {
		const next = new Set(activeCategories);
		if (next.has(cat)) next.delete(cat);
		else               next.add(cat);
		activeCategories = next;
	}

	function clearFilters() {
		search           = '';
		activeCategories = new Set();
	}

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

		const stat    = selectedStat;
		const sVal    = (ctx.data as Record<string, number>)[stat] ?? 0;
		const aDie    = rollDie(6);
		const c1      = rollDie(10);
		const c2      = rollDie(10);
		const mom     = ctx.data.momentum;

		// Momentum cancellation
		const cancelled = mom < 0 && Math.abs(mom) === aDie;
		const effective = cancelled ? 0 : aDie;
		const total     = effective + sVal + adds;

		const hits1   = total > c1;
		const hits2   = total > c2;
		const isMatch = c1 === c2;

		// Enter the Fray — default foe initiative so outcome links can flip it
		if (selectedMove.id === 'move/enter-the-fray') {
			onInitiativeChange?.('foe');
		}

		// Pre-generate entry id for link enrichment
		const entryId = crypto.randomUUID();

		// Build log HTML
		const parts: string[] = [];
		if (cancelled) {
			parts.push(
				`<div class="roll-cancel">Momentum cancel! Momentum is ${mom}, ` +
				`action die ${aDie} \u2192 0.</div>`,
			);
		}

		const dieStr  = cancelled ? `<s>${aDie}</s>&thinsp;0` : `${aDie}`;
		const addsStr = adds !== 0
			? ` + adds[${adds > 0 ? '+' : ''}${adds}]`
			: '';
		const statLabel = stat.charAt(0).toUpperCase() + stat.slice(1);

		parts.push(
			`<div class="roll-line">` +
			`1d6 [${dieStr}] + ${statLabel.toLowerCase()}[${sVal}]${addsStr}` +
			` = <strong>${total}</strong> vs 2d10 [${c1}] [${c2}]` +
			`</div>`,
		);

		const matchSpan = isMatch ? ' <span class="roll-match">with a match!</span>' : '';
		parts.push(
			`<div class="${outcomeClass(hits1, hits2)}">` +
			`<strong>${outcomeLabel(hits1, hits2)}</strong>${matchSpan}` +
			`</div>`,
		);

		let outcomeHtml = getOutcomeHtml(selectedMove, hits1, hits2);
		if (outcomeHtml) {
			outcomeHtml = resolveHarmLinks(outcomeHtml, { moveId: selectedMove.id, foeHarm: pctx.foeHarm });
			outcomeHtml = enrichOutcomeLinks(outcomeHtml, entryId, ctx.charId);
			parts.push(`<div class="move-outcome">${outcomeHtml}</div>`);
		}

		const html = parts.join('');

		close();
		await animateDice([
			{ sides: 6,  value: aDie },
			{ sides: 10, value: c1   },
			{ sides: 10, value: c2   },
		]);
		appendLog(SESSION_LOG_ID, logTitle(`${selectedMove.name} (${statLabel})`), html, entryId, undefined, {
			moveId: selectedMove.id,
			actionScore: total,
			c1, c2,
			charId: ctx.charId,
		});

		// Burn momentum suggestion: auto-append a clickable log entry when burn would improve outcome.
		// Consistent with overflow/floor/debility cascade pattern — player decides whether to click.
		const burnHits1 = mom > c1 ? true : hits1;
		const burnHits2 = mom > c2 ? true : hits2;
		if (!cancelled && mom > 0 && !(hits1 && hits2) && ((burnHits1 !== hits1) || (burnHits2 !== hits2))) {
			const resetVal     = momentumReset(ctx.data);
			const currentLabel = outcomeLabel(hits1, hits2);
			const burnLabel    = outcomeLabel(burnHits1, burnHits2);
			const burnEntryId  = crypto.randomUUID();
			const burnHtml =
				`<p>You may <a class="burn-momentum-link" ` +
				`data-roll-entry-id="${entryId}" ` +
				`data-move-id="${selectedMove.id}" ` +
				`data-action-score="${total}" ` +
				`data-c1="${c1}" data-c2="${c2}" ` +
				`data-char-id="${ctx.charId}" ` +
				`data-entry-id="${burnEntryId}">` +
				`burn momentum (${mom} → reset ${resetVal})` +
				`</a> to improve this from <em>${currentLabel}</em> to <em>${burnLabel}</em>.</p>`;
			appendLog(SESSION_LOG_ID, BURN_MOMENTUM_TITLE, burnHtml, burnEntryId);
		}

		rolling = false;
	}

	// ---------------------------------------------------------------------------
	// Progress Roll (progress score vs 2d10)
	// ---------------------------------------------------------------------------
	async function doProgressRoll() {
		if (rolling || !selectedMove) return;
		rolling = true;

		const total  = progressValue + adds;
		const c1     = rollDie(10);
		const c2     = rollDie(10);
		const hits1  = total > c1;
		const hits2  = total > c2;
		const isMatch = c1 === c2;

		// Pre-generate entry id for link enrichment
		const entryId = crypto.randomUUID();
		const charId  = ctx?.charId ?? '';

		const addsStr = adds !== 0 ? ` + Adds [<strong>${adds >= 0 ? '+' : ''}${adds}</strong>] = [<strong>${total}</strong>]` : '';

		const parts: string[] = [];
		parts.push(
			`<div class="roll-line">` +
			`Progress [<strong>${progressValue}</strong>]${addsStr} vs 2d10 [${c1}] [${c2}]` +
			`</div>`,
		);

		const matchSpan = isMatch ? ' <span class="roll-match">with a match!</span>' : '';
		parts.push(
			`<div class="${outcomeClass(hits1, hits2)}">` +
			`<strong>${outcomeLabel(hits1, hits2)}</strong>${matchSpan}` +
			`</div>`,
		);

		let outcomeHtml = getOutcomeHtml(selectedMove, hits1, hits2);
		if (outcomeHtml) {
			outcomeHtml = resolveHarmLinks(outcomeHtml, { moveId: selectedMove.id, foeHarm: pctx.foeHarm });
			if (charId) outcomeHtml = enrichOutcomeLinks(outcomeHtml, entryId, charId);
			parts.push(`<div class="move-outcome">${outcomeHtml}</div>`);
		}

		const html = parts.join('');

		close();
		await animateDice([
			{ sides: 10, value: c1 },
			{ sides: 10, value: c2 },
		]);
		appendLog(SESSION_LOG_ID, logTitle(selectedMove.name), html, entryId);

		// End the Fight clears the combat (no more initiative)
		if (selectedMove.id === 'move/end-the-fight') {
			onInitiativeChange?.('none');
		}

		rolling = false;
	}


	// ---------------------------------------------------------------------------
	// Spell Roll (1d6 + adds vs difficulty + 1d10) — Cast Conclave Ritual
	// ---------------------------------------------------------------------------
	async function doSpellRoll() {
		if (rolling || !ctx || !selectedMove) return;
		rolling = true;

		const aDie   = rollDie(6);
		const c1     = rollDie(10);
		const diff   = spellDifficulty;
		const mana   = manaCommit;
		const total  = aDie + adds + mana;

		const hitsDiff = total > diff;
		const hitsC1   = total > c1;

		const entryId = crypto.randomUUID();
		const parts: string[] = [];

		const addsStr = adds !== 0 ? ` + adds[${adds > 0 ? '+' : ''}${adds}]` : '';
		const manaStr = mana > 0 ? ` + mana[${mana}]` : '';
		parts.push(
			`<div class="roll-line">` +
			`1d6 [${aDie}]${addsStr}${manaStr}` +
			` = <strong>${total}</strong> vs difficulty[<strong>${diff}</strong>] 1d10[${c1}]` +
			`</div>`,
		);
		parts.push(
			`<div class="${outcomeClass(hitsDiff, hitsC1)}">` +
			`<strong>${outcomeLabel(hitsDiff, hitsC1)}</strong>` +
			`</div>`,
		);

		// Build body: outcome text + mandatory mana cost (always spent)
		let bodyHtml = '';
		let outcomeHtml = getOutcomeHtml(selectedMove, hitsDiff, hitsC1);
		if (outcomeHtml) {
			outcomeHtml = resolveHarmLinks(outcomeHtml, { moveId: selectedMove.id, foeHarm: pctx.foeHarm });
			bodyHtml += `<div class="move-outcome">${outcomeHtml}</div>`;
		}
		if (mana > 0) {
			bodyHtml += `<div class="move-outcome"><a class="resource-link" data-resource="mana" data-value="-${mana}">-${mana} mana</a> committed.</div>`;
		}
		if (bodyHtml) {
			bodyHtml = enrichOutcomeLinks(bodyHtml, entryId, ctx.charId);
			parts.push(bodyHtml);
		}

		const html = parts.join('');

		close();
		await animateDice([
			{ sides: 6,  value: aDie },
			{ sides: 10, value: c1   },
		]);
		appendLog(SESSION_LOG_ID, logTitle(selectedMove.name), html, entryId);
		rolling = false;
	}

	async function doAskOracle() {
		if (rolling || !oracleTable.length) return;
		const entry = oracleTable[selectedOddsIdx];
		if (!entry) return;
		rolling = true;
		const { odds, threshold } = entry.value;
		const roll = rollDie(100);
		const isYes = roll >= threshold;
		const outcomeClass = isYes ? 'roll-outcome-strong' : 'roll-outcome-miss';
		const html =
			`<div class="roll-line">1d100 [${roll}]</div>` +
			`<div class="${outcomeClass}"><strong>${isYes ? 'Yes' : 'No'}</strong> \u2014 ${odds} (\u2265${threshold})</div>`;
		const tensV = Math.floor(roll % 100 / 10) || 10;
		const onesV = roll % 10 || 10;
		close();
		await animateDice([
			{ sides: 10, value: tensV, color: DIE_BLACK },
			{ sides: 10, value: onesV, color: DIE_WHITE },
		]);
		appendLog(SESSION_LOG_ID, logTitle('Ask the Oracle'), html, crypto.randomUUID());
		rolling = false;
	}

	async function doTableRoll() {
		if (rolling || !selectedMove) return;
		rolling = true;
		type TableEntry = { topRange: number; value: string };
		const raw = (selectedMove as Record<string, unknown>)['table'] as TableEntry[] | undefined;
		if (!raw?.length) { rolling = false; return; }
		const entryId = crypto.randomUUID();
		const roll    = rollDie(100);
		const found   = raw.find(e => roll <= e.topRange) ?? raw[raw.length - 1];
		const enriched = ctx
			? enrichOutcomeLinks(found.value, entryId, ctx.charId)
			: found.value;
		const html =
			`<div class="roll-line">1d100 [${roll}]</div>` +
			`<div class="move-outcome">${enriched}</div>`;
		const tensV = Math.floor(roll % 100 / 10) || 10;
		const onesV = roll % 10 || 10;
		close();
		await animateDice([
			{ sides: 10, value: tensV, color: DIE_BLACK },
			{ sides: 10, value: onesV, color: DIE_WHITE },
		]);
		appendLog(SESSION_LOG_ID, logTitle(selectedMove.name), html, entryId);
		rolling = false;
	}

	async function doApplyNoRollMove() {
		if (!ctx || !selectedMove) return;

		// \u2500\u2500 Take a Hiatus: build logBody dynamically from character state \u2500\u2500
		if (selectedMove.id === 'move/take-a-hiatus') {
			const data = ctx.data as Record<string, unknown>;
			const parts: string[] = [];
			// 1. Clear marked conditions
			const allDebilities: Array<[string, string]> = [
				['wounded',    'Wounded'],
				['maimed',     'Maimed'],
				['shaken',     'Shaken'],
				['corrupted',  'Corrupted'],
				['cursed',     'Cursed'],
				['tormented',  'Tormented'],
				['unprepared', 'Unprepared'],
				['encumbered', 'Encumbered'],
			];
			const markedDebilities = allDebilities.filter(([key]) => data[key]);
			if (markedDebilities.length > 0) {
				const links = markedDebilities
					.map(([key, label]) =>
						`<a class="debility-link" data-debility="${key}" data-value="0">Clear ${label}</a>`)
					.join(' \u00b7 ');
				parts.push(`<p><strong>Conditions:</strong> ${links}</p>`);
			}
			// 2. Restore resources to max
			const restoreLinks: string[] = [];
			const toRestore: Array<[string, string, number]> = [
				['health', 'health', 5],
				['spirit', 'spirit', 5],
				['supply', 'supply', 5],
			];
			for (const [key, label, max] of toRestore) {
				const current = (data[key] as number) ?? 0;
				const delta = max - current;
				if (delta > 0) {
					restoreLinks.push(
						`<a class="resource-link" data-resource="${key}" data-value="+${delta}">+${delta} ${label}</a>`
					);
				}
			}
			if (restoreLinks.length > 0) {
				parts.push(`<p><strong>Resources:</strong> ${restoreLinks.join(' \u00b7 ')}</p>`);
			}
			// 3. Momentum reset
			const resetVal   = momentumReset(ctx.data);
			const momCurrent = (data['momentum'] as number) ?? 0;
			const momDelta   = resetVal - momCurrent;
			if (momDelta !== 0) {
				const sign = momDelta > 0 ? '+' : '';
				parts.push(
					`<p><strong>Momentum:</strong> ` +
					`<a class="resource-link" data-resource="momentum" data-value="${sign}${momDelta}">` +
					`${sign}${momDelta} momentum (reset to ${resetVal})</a></p>`
				);
			}
			// 4. Static reminders (always shown)
			parts.push(
				`<p>Set companion health to max if applicable.</p>` +
				`<p>For each active threat: ` +
				`<a class="move-link" data-id="move/advance-a-threat">Advance a Threat</a>.</p>`
			);
			const entryId = crypto.randomUUID();
			const enriched = enrichOutcomeLinks(parts.join(''), entryId, ctx.charId);
			close();
			appendLog(SESSION_LOG_ID, logTitle(selectedMove.name), enriched, entryId);
			return;
		}

		const logBody = selectedMove['logBody'] as string | undefined;
		if (!logBody) return;

		// Extract initiative value from the body and fire immediately
		const initMatch = logBody.match(/class="initiative-link"[^>]*data-value="(character|foe)"/);
		if (!initMatch) {
			const initMatch2 = logBody.match(/data-value="(character|foe)"[^>]*class="initiative-link"/);
			if (initMatch2) onInitiativeChange?.(initMatch2[1] as 'character' | 'foe');
		} else {
			onInitiativeChange?.(initMatch[1] as 'character' | 'foe');
		}

		const entryId = crypto.randomUUID();
		const enriched = enrichOutcomeLinks(logBody, entryId, ctx.charId);
		close();
		appendLog(SESSION_LOG_ID, logTitle(selectedMove.name), enriched, entryId);
	}


	// When factor levels change (user explicitly set), sync sum → spellDifficulty.
	$effect(() => {
		if (!factorsManuallySet) return;
		spellDifficulty = Math.max(1, Object.values(factorLevels).reduce((s, v) => s + v, 0));
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

<!-- =========================================================================
     Dialog
     ========================================================================= -->
<dialog
	bind:this={dialogEl}
	class="moves-dialog"
	oncancel={close}
>

{#if view === 'picker'}

	<!-- ── Picker view ────────────────────────────────────────────────────── -->

	<div class="md-header" use:draggable>
		<span class="md-title">Moves</span>
		<button class="md-close" onclick={close} aria-label="Close">✕</button>
	</div>

	<!-- Controls -->
	<div class="md-controls">
		<div class="md-search-row">
			<input
				class="md-search"
				type="search"
				placeholder="Search moves…"
				bind:value={search}
				aria-label="Search moves"
			/>
			<button
				class="md-clear-btn"
				title="Clear all filters"
				onclick={clearFilters}
				aria-label="Clear all filters"
			>{@html clearFiltersSvg}</button>
			<button
				class="md-hide-disabled-btn"
				class:md-hide-disabled-btn--active={hideDisabled}
				title={hideDisabled ? 'Show all moves' : 'Hide unavailable moves'}
				onclick={() => (hideDisabled = !hideDisabled)}
				aria-label={hideDisabled ? 'Show all moves' : 'Hide unavailable moves'}
			>
				{#if hideDisabled}
					<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/></svg>
				{:else}
					<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
				{/if}
			</button>
		</div>

		<div class="md-cat-filters">
			{#each categories as cat (cat)}
				<button
					class="md-cat-tag"
					class:md-cat-tag--active={activeCategories.has(cat)}
					style:--ccolor={catColor(cat)}
					onclick={() => toggleCategory(cat)}
				>{cat}</button>
			{/each}
		</div>
	</div>

	<!-- Tile grid grouped by category -->
	<div class="md-body">
		{#if moves.length === 0}
			<div class="md-loading">Loading moves…</div>
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
									style:--tcolor={catColor(move.category)}
									title={fail ?? move.triggerShort}
									onclick={() => { if (!fail) selectMove(move); }}
								disabled={!!fail}
								>
									<div class="md-tile-stripe"></div>
									<div class="md-tile-body">
										<div class="md-tile-name">{move.name}</div>
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

	<div class="md-header md-header--detail" use:draggable>
		<button class="md-back-btn" onclick={backToPicker}>← Back</button>
		<span class="md-title md-title--detail">{selectedMove.name}</span>
		<span class="md-category-badge" style:--ccolor={catColor(selectedMove.category)}>
			{selectedMove.category}
		</span>
		<button class="md-close" onclick={close} aria-label="Close">✕</button>
	</div>

	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div class="md-body md-body--detail" role="region" onclick={handleDetailClick}>
		<!-- Trigger text -->
		<div class="md-trigger">
			{@html (selectedMove as Record<string, unknown>).triggerPreamble as string ?? selectedMove.trigger}
		</div>

		<!-- ── Standard action move ── -->
		{#if hasRollableStats(selectedMove)}
			{@const fail = moveFailReason(selectedMove)}

			<!-- Stat picker -->
			{#if selectedMove.stats && selectedMove.stats.length > 0}
				<div class="md-stat-list">
					{#each selectedMove.stats as s (s.stat)}
						<button
							class="md-stat-row-btn"
							class:selected={selectedStat === s.stat}
							style:--scolor={statColor(s.stat)}
							onclick={() => (selectedStat = s.stat)}
							disabled={rolling || !ctx}
						>
							<span class="md-stat-check" aria-hidden="true">{selectedStat === s.stat ? '✔' : ''}</span>
							<span class="md-sdesc">{s.desc}</span>
							<span class="md-stat-chip" style:--scolor={statColor(s.stat)}>
								<span class="md-sname">{s.stat}</span>
								<span class="md-sval">+{statValue(s.stat)}</span>
							</span>
						</button>
					{/each}
				</div>
			{/if}

			<!-- ── Outcomes ── -->
			{#if selectedMove.strong || selectedMove.weak || selectedMove.miss}
				<div class="md-outcomes">
					{#if selectedMove.strong}
						<div class="md-outcome-section" style:--outcome-color="var(--color-success, #34d399)">
							<div class="md-outcome-label md-outcome-strong">Strong Hit</div>
							<div class="md-outcome-text">{@html displayHtml(selectedMove.strong)}</div>
						</div>
					{/if}
					{#if selectedMove.weak}
						<div class="md-outcome-section" style:--outcome-color="var(--color-momentum, #60a5fa)">
							<div class="md-outcome-label md-outcome-weak">Weak Hit</div>
							<div class="md-outcome-text">{@html displayHtml(selectedMove.weak)}</div>
						</div>
					{/if}
					{#if selectedMove.miss}
						<div class="md-outcome-section" style:--outcome-color="var(--color-danger, #ef4444)">
							<div class="md-outcome-label md-outcome-miss">Miss</div>
							<div class="md-outcome-text">{@html displayHtml(selectedMove.miss)}</div>
						</div>
					{/if}
				</div>
			{/if}

			<!-- Adds + Roll button -->
			<div class="md-action-row">
				<div class="md-adds-row">
					<span class="md-adds-label">Adds</span>
					<button
						class="md-adj"
						onclick={() => (adds = Math.max(-5, adds - 1))}
						disabled={rolling || !ctx || adds <= -5}
						aria-label="Decrease adds"
					>−</button>
					<span
						class="md-adds-val"
						class:positive={adds > 0}
						class:negative={adds < 0}
					>{adds >= 0 ? '+' : ''}{adds}</span>
					<button
						class="md-adj"
						onclick={() => (adds = Math.min(5, adds + 1))}
						disabled={rolling || !ctx || adds >= 5}
						aria-label="Increase adds"
					>+</button>
				</div>

				<div class="md-roll-status" aria-live="polite">{@html rollStatusHtml}</div>
				<button
					class="btn btn-primary md-roll-btn"
					onclick={doActionRoll}
					disabled={rolling || !ctx || !!fail}
					title={fail ?? ''}
				>
					{rolling ? 'Rolling…' : 'Roll Move'}
				</button>
			</div>

		<!-- ── Spell roll move (1d6+adds vs difficulty+1d10) ── -->
		{:else if isSpellRollMove(selectedMove)}
			<!-- Outcomes preview -->
			{#if selectedMove.strong || selectedMove.weak || selectedMove.miss}
				<div class="md-outcomes">
					{#if selectedMove.strong}
						<div class="md-outcome-section" style:--outcome-color="var(--color-success, #34d399)">
							<div class="md-outcome-label md-outcome-strong">Strong Hit</div>
							<div class="md-outcome-text">{@html displayHtml(selectedMove.strong)}</div>
						</div>
					{/if}
					{#if selectedMove.weak}
						<div class="md-outcome-section" style:--outcome-color="var(--color-momentum, #60a5fa)">
							<div class="md-outcome-label md-outcome-weak">Weak Hit</div>
							<div class="md-outcome-text">{@html displayHtml(selectedMove.weak)}</div>
						</div>
					{/if}
					{#if selectedMove.miss}
						<div class="md-outcome-section" style:--outcome-color="var(--color-danger, #ef4444)">
							<div class="md-outcome-label md-outcome-miss">Miss</div>
							<div class="md-outcome-text">{@html displayHtml(selectedMove.miss)}</div>
						</div>
					{/if}
				</div>
			{/if}

			<!-- Adds + Mana + Difficulty + Roll -->
			<div class="md-action-row md-action-row--spell">
				<div class="md-adds-row">
					<span class="md-adds-label">Adds</span>
					<button
						class="md-adj"
						onclick={() => (adds = Math.max(-5, adds - 1))}
						disabled={rolling || !ctx || adds <= -5}
						aria-label="Decrease adds"
					>−</button>
					<span
						class="md-adds-val"
						class:positive={adds > 0}
						class:negative={adds < 0}
					>{adds >= 0 ? '+' : ''}{adds}</span>
					<button
						class="md-adj"
						onclick={() => (adds = Math.min(5, adds + 1))}
						disabled={rolling || !ctx || adds >= 5}
						aria-label="Increase adds"
					>+</button>
					<span class="md-adds-label md-adds-label--gap">Mana</span>
					<button
						class="md-adj"
						onclick={() => (manaCommit = Math.max(0, manaCommit - 1))}
						disabled={rolling || manaCommit <= 0}
						aria-label="Decrease mana"
					>−</button>
					<span class="md-adds-val" class:positive={manaCommit > 0}>{manaCommit}</span>
					<button
						class="md-adj"
						onclick={() => (manaCommit = Math.min((ctx?.data as Record<string, number>)?.['mana'] ?? 0, manaCommit + 1))}
						disabled={rolling || manaCommit >= ((ctx?.data as Record<string, number>)?.['mana'] ?? 0)}
						aria-label="Increase mana"
					>+</button>
					<span class="md-adds-label md-adds-label--gap">Difficulty</span>
					<button
						class="md-adj"
						onclick={() => (spellDifficulty = Math.max(1, spellDifficulty - 1))}
						disabled={rolling || spellDifficulty <= 1}
						aria-label="Decrease difficulty"
					>−</button>
					<span class="md-adds-val">{spellDifficulty}</span>
					<button
						class="md-adj"
						onclick={() => (spellDifficulty = Math.min(10, spellDifficulty + 1))}
						disabled={rolling || spellDifficulty >= 10}
						aria-label="Increase difficulty"
					>+</button>
				</div>

				<div class="md-roll-status" aria-live="polite">{@html rollStatusHtml}</div>
				<button
					class="btn btn-primary md-roll-btn md-roll-btn--spell"
					onclick={doSpellRoll}
					disabled={rolling || !ctx}
				>
					{rolling ? 'Rolling\u2026' : 'Roll Move'}
				</button>
			</div>

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
											>{lvl}</button>
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
			<!-- ── Outcomes ── -->
			{#if selectedMove.strong || selectedMove.weak || selectedMove.miss}
				<div class="md-outcomes">
					{#if selectedMove.strong}
						<div class="md-outcome-section" style:--outcome-color="var(--color-success, #34d399)">
							<div class="md-outcome-label md-outcome-strong">Strong Hit</div>
							<div class="md-outcome-text">{@html displayHtml(selectedMove.strong)}</div>
						</div>
					{/if}
					{#if selectedMove.weak}
						<div class="md-outcome-section" style:--outcome-color="var(--color-momentum, #60a5fa)">
							<div class="md-outcome-label md-outcome-weak">Weak Hit</div>
							<div class="md-outcome-text">{@html displayHtml(selectedMove.weak)}</div>
						</div>
					{/if}
					{#if selectedMove.miss}
						<div class="md-outcome-section" style:--outcome-color="var(--color-danger, #ef4444)">
							<div class="md-outcome-label md-outcome-miss">Miss</div>
							<div class="md-outcome-text">{@html displayHtml(selectedMove.miss)}</div>
						</div>
					{/if}
				</div>
			{/if}
			<div class="md-action-row">
				<div class="md-adds-row">
					<span class="md-adds-label">Adds</span>
					<button
						class="md-adj"
						onclick={() => (adds = Math.max(-5, adds - 1))}
						disabled={rolling || adds <= -5}
						aria-label="Decrease adds"
					>−</button>
					<span
						class="md-adds-val"
						class:positive={adds > 0}
						class:negative={adds < 0}
					>{adds >= 0 ? '+' : ''}{adds}</span>
					<button
						class="md-adj"
						onclick={() => (adds = Math.min(5, adds + 1))}
						disabled={rolling || adds >= 5}
						aria-label="Increase adds"
					>+</button>
				</div>

				<div class="md-roll-status" aria-live="polite">{@html rollStatusHtml}</div>
				<button
					class="btn btn-primary md-roll-btn"
					onclick={doProgressRoll}
					disabled={rolling}
				>
					{rolling ? 'Rolling…' : 'Roll Move'}
				</button>
			</div>

		<!-- ── Ask the Oracle (d100 vs odds threshold) ── -->
		{:else if isOracleRollMove}
			<div class="md-stat-list">
				{#each oracleTable as entry, i (entry.value.odds)}
					<button
						class="md-stat-row-btn"
						class:selected={selectedOddsIdx === i}
						style="--scolor: var(--color-accent, #f59e0b)"
						onclick={() => selectedOddsIdx = i}
					>
						<span class="md-stat-check" aria-hidden="true">{selectedOddsIdx === i ? '\u2714' : ''}</span>
						<span class="md-sdesc">{entry.value.odds}</span>
						<span class="md-oracle-threshold">{entry.value.threshold}</span>
					</button>
				{/each}
			</div>
			<div class="md-action-row">
				<div class="md-roll-status" aria-live="polite">{@html rollStatusHtml}</div>
				<button
					class="btn btn-primary md-roll-btn"
					onclick={doAskOracle}
					disabled={rolling}
				>{rolling ? 'Rolling\u2026' : 'Roll Move'}</button>
			</div>

		<!-- ── Table-roll move (d100 against inline table) ── -->
		{:else if isTableRollMove(selectedMove)}
			{@const tableEntries = (selectedMove as Record<string, unknown>)['table'] as Array<{ topRange: number; value: string }> ?? []}
			{#if tableEntries.length > 0}
				<div class="md-table-list">
					{#each tableEntries as entry, i (entry.topRange)}
						{@const prevTop = i === 0 ? 0 : tableEntries[i - 1].topRange}
						{@const rangeLabel = prevTop + 1 === entry.topRange ? `${entry.topRange}` : `${prevTop + 1}\u2013${entry.topRange}`}
						<div class="md-table-row">
							<span class="md-table-range">{rangeLabel}</span>
							<span class="md-table-value">{@html displayHtml(entry.value)}</span>
						</div>
					{/each}
				</div>
			{/if}
			<div class="md-action-row">
				<div class="md-roll-status" aria-live="polite">{@html rollStatusHtml}</div>
				<button
					class="btn btn-primary md-roll-btn"
					onclick={doTableRoll}
					disabled={rolling || !ctx}
				>{rolling ? 'Rolling\u2026' : 'Roll Move'}</button>
			</div>

		<!-- ── No-roll move (no controls needed) ── -->
		{:else if isNoRollMove(selectedMove)}
			<!-- ── Apply button for moves with a logBody or special handling (e.g. Turn the Tide, Take a Hiatus) ── -->
			{#if selectedMove['logBody'] || selectedMove.id === 'move/take-a-hiatus'}
				<button
					class="btn btn-primary md-roll-btn md-roll-btn--full"
					onclick={doApplyNoRollMove}
				>Use Move</button>
			{/if}
			<!-- ── Outcomes ── -->
			{#if selectedMove.strong || selectedMove.weak || selectedMove.miss}
				<div class="md-outcomes">
					{#if selectedMove.strong}
						<div class="md-outcome-section" style:--outcome-color="var(--color-success, #34d399)">
							<div class="md-outcome-label md-outcome-strong">Strong Hit</div>
							<div class="md-outcome-text">{@html displayHtml(selectedMove.strong)}</div>
						</div>
					{/if}
					{#if selectedMove.weak}
						<div class="md-outcome-section" style:--outcome-color="var(--color-momentum, #60a5fa)">
							<div class="md-outcome-label md-outcome-weak">Weak Hit</div>
							<div class="md-outcome-text">{@html displayHtml(selectedMove.weak)}</div>
						</div>
					{/if}
					{#if selectedMove.miss}
						<div class="md-outcome-section" style:--outcome-color="var(--color-danger, #ef4444)">
							<div class="md-outcome-label md-outcome-miss">Miss</div>
							<div class="md-outcome-text">{@html displayHtml(selectedMove.miss)}</div>
						</div>
					{/if}
				</div>
			{/if}
		{/if}



		<!-- Notes -->
		{#if selectedMove.notes}
			<div class="md-notes">
				<div class="md-notes-text">{selectedMove.notes}</div>
			</div>
		{/if}
	</div>

{/if}

</dialog>

<style>
	/* ── Dialog shell ────────────────────────────────────────────────────── */
	.moves-dialog {
		border:        none;
		padding:       0;
		border-radius: 10px;
		position:      fixed;
		top:           8vh;
		left:          50%;
		transform:     translateX(-50%);
		width:         min(640px, calc(100vw - 2rem));
		max-height:    min(700px, calc(100dvh - 10vh));
		background:    var(--bg-card);
		color:         var(--text);
		box-shadow:    0 16px 48px #00000070, 0 0 0 1px var(--border-mid);
		outline:       none;
		overflow:      hidden;
	}
	.moves-dialog[open] {
		display:        flex;
		flex-direction: column;
	}
	.moves-dialog::backdrop {
		background:      #00000060;
		backdrop-filter: blur(1px);
	}

	/* ── Header ─────────────────────────────────────────────────────────── */
	.md-header {
		display:       flex;
		align-items:   center;
		gap:           8px;
		padding:       10px 14px;
		border-bottom: 1px solid var(--border);
		background:    var(--bg-control);
		border-radius: 10px 10px 0 0;
		flex-shrink:   0;
	}
	.md-header--detail { flex-wrap: nowrap; }
	.md-title {
		font-family:    var(--font-display);
		font-size:      0.78rem;
		font-weight:    700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color:          var(--text-accent);
		flex:           1;
	}
	.md-title--detail {
		font-size:     0.72rem;
		overflow:      hidden;
		text-overflow: ellipsis;
		white-space:   nowrap;
	}
	.md-close {
		background:    transparent;
		border:        none;
		color:         var(--text-dimmer);
		cursor:        pointer;
		font-size:     0.9rem;
		padding:       2px 5px;
		border-radius: 3px;
		line-height:   1;
		font-family:   inherit;
		flex-shrink:   0;
	}
	.md-close:hover { color: var(--text); }

	.md-back-btn {
		font-family:   var(--font-ui);
		font-size:     0.7rem;
		font-weight:   600;
		color:         var(--text-dimmer);
		background:    transparent;
		border:        1px solid var(--border);
		border-radius: 4px;
		padding:       3px 8px;
		cursor:        pointer;
		flex-shrink:   0;
		white-space:   nowrap;
	}
	.md-back-btn:hover { color: var(--text); border-color: var(--border-mid); }

	.md-category-badge {
		font-family:    var(--font-ui);
		font-size:      0.58rem;
		font-weight:    600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color:          var(--ccolor, var(--text-dimmer));
		border:         1px solid color-mix(in srgb, var(--ccolor, var(--border)) 40%, transparent);
		border-radius:  3px;
		padding:        2px 6px;
		flex-shrink:    0;
		white-space:    nowrap;
	}

	/* ── Controls (search + category tags) ─────────────────────────────── */
	.md-controls {
		padding:        8px 14px 6px;
		border-bottom:  1px solid var(--border);
		flex-shrink:    0;
		display:        flex;
		flex-direction: column;
		gap:            6px;
	}
	.md-search-row {
		display:     flex;
		align-items: center;
		gap:         6px;
	}
	.md-search {
		flex:          1;
		font-family:   var(--font-ui);
		font-size:     0.78rem;
		color:         var(--text);
		background:    var(--bg-inset);
		border:        1px solid var(--border);
		border-radius: 4px;
		padding:       5px 8px;
		min-width:     0;
	}
	.md-search:focus {
		outline:      none;
		border-color: var(--focus-ring);
		box-shadow:   0 0 0 2px var(--accent-glow);
	}
	.md-clear-btn {
		background:    transparent;
		border:        none;
		color:         var(--text-dimmer);
		cursor:        pointer;
		padding:       3px 5px;
		border-radius: 3px;
		display:       flex;
		align-items:   center;
		flex-shrink:   0;
	}
	.md-clear-btn:hover { color: var(--text); }
	.md-clear-btn :global(svg) {
		width:  18px;
		height: 18px;
		fill:   currentColor;
	}

	.md-hide-disabled-btn {
		background:    transparent;
		border:        1px solid transparent;
		color:         var(--text-dimmer);
		cursor:        pointer;
		padding:       3px 5px;
		border-radius: 3px;
		display:       flex;
		align-items:   center;
		flex-shrink:   0;
		transition:    color 0.15s, border-color 0.15s;
	}
	.md-hide-disabled-btn:hover {
		color: var(--text);
		border-color: var(--border-mid);
	}
	.md-hide-disabled-btn--active {
		color: var(--text-accent);
	}

	.md-cat-filters {
		display:   flex;
		flex-wrap: wrap;
		gap:       4px;
	}
	.md-cat-tag {
		font-family:    var(--font-ui);
		font-size:      0.65rem;
		font-weight:    600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color:          var(--ccolor, var(--text-dimmer));
		background:     transparent;
		border:         1px solid color-mix(in srgb, var(--ccolor, var(--border)) 40%, transparent);
		border-radius:  3px;
		padding:        2px 8px;
		cursor:         pointer;
		white-space:    nowrap;
		transition:     background 0.12s, color 0.12s;
	}
	.md-cat-tag:hover {
		background: color-mix(in srgb, var(--ccolor, var(--border)) 12%, transparent);
	}
	.md-cat-tag--active {
		background:   color-mix(in srgb, var(--ccolor, var(--border)) 18%, transparent);
		border-color: var(--ccolor, var(--border));
	}

	/* ── Scrollable body ─────────────────────────────────────────────────── */
	.md-body {
		flex:       1;
		overflow-y: auto;
		padding:    10px 14px;
		min-height: 0;
	}
	.md-body--detail {
		display:        flex;
		flex-direction: column;
		gap:            10px;
	}

	.md-loading,
	.md-empty {
		font-family: var(--font-ui);
		font-size:   0.78rem;
		color:       var(--text-dimmer);
		text-align:  center;
		padding:     2rem 1rem;
	}

	/* ── Category headers ───────────────────────────────────────────────── */
	.md-category-header {
		font-family:    var(--font-ui);
		font-size:      0.62rem;
		font-weight:    700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color:          var(--ccolor, var(--text-dimmer));
		padding:        10px 0 4px;
	}
	.md-category-header:first-child { padding-top: 0; }

	/* ── Tile grid ───────────────────────────────────────────────────────── */
	.md-grid {
		display:               grid;
		grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
		gap:                   6px;
		margin-bottom:         4px;
	}
	.md-tile {
		display:        flex;
		flex-direction: row;
		align-items:    stretch;
		text-align:     left;
		background:     var(--bg-control);
		border:         1px solid var(--border);
		border-radius:  6px;
		overflow:       hidden;
		cursor:         pointer;
		padding:        0;
		color:          var(--text);
		font-family:    var(--font-ui);
		transition:     background 0.12s, border-color 0.12s;
	}
	.md-tile:hover {
		background:   var(--bg-hover);
		border-color: var(--tcolor, var(--border-mid));
	}
	.md-tile--dimmed,
	.md-tile:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
	.md-tile--dimmed:hover:not(:disabled) { opacity: 0.65; }

	.md-tile-stripe {
		width:       4px;
		flex-shrink: 0;
		background:  var(--tcolor, var(--text-accent));
	}
	.md-tile-body {
		padding:   6px 8px;
		flex:      1;
		min-width: 0;
	}
	.md-tile-name {
		font-size:   0.72rem;
		font-weight: 700;
		line-height: 1.2;
		color:       var(--text);
		margin-bottom: 2px;
	}
	.md-tile-desc {
		font-size:   0.62rem;
		color:       var(--text-dimmer);
		line-height: 1.3;
		display:            -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow:           hidden;
	}

	/* ── Detail view ─────────────────────────────────────────────────────── */
	.md-trigger {
		font-family: var(--font-ui);
		font-size:   0.78rem;
		color:       var(--text-muted);
		line-height: 1.5;
	}
	.md-trigger :global(strong) { color: var(--text); font-weight: 600; }
	.md-trigger :global(a) { cursor: pointer; color: var(--text-accent); }
	.md-trigger :global(ul),
	.md-trigger :global(ol) { margin: 4px 0; padding-left: 1.5em; }
	.md-trigger :global(li) { margin-bottom: 3px; }

	/* ── Stat picker ─────────────────────────────────────────────────────── */
	.md-stat-list {
		display:        flex;
		flex-direction: column;
		gap:            3px;
	}
	.md-stat-row-btn {
		display:       flex;
		align-items:   center;
		gap:           8px;
		padding:       5px 8px;
		background:    var(--bg-control);
		border:        1px solid var(--border);
		border-radius: 5px;
		cursor:        pointer;
		color:         var(--text-muted);
		font-family:   var(--font-ui);
		transition:    background 0.12s, border-color 0.12s;
		text-align:    left;
	}
	.md-stat-row-btn:hover:not(:disabled):not(.selected) {
		background:   var(--bg-hover);
		border-color: var(--border-mid);
	}
	.md-stat-row-btn.selected {
		background:   color-mix(in srgb, var(--scolor) 10%, var(--bg-control));
		border-color: var(--scolor);
	}
	.md-stat-row-btn:disabled { opacity: 0.4; cursor: not-allowed; }

	.md-stat-check {
		width:          16px;
		flex-shrink:    0;
		font-size:      0.7rem;
		color:          var(--scolor);
		text-align:     center;
	}

	.md-sdesc {
		flex:        1;
		font-family: var(--font-ui);
		font-size:   0.78rem;
		color:       var(--text-muted);
		line-height: 1.3;
	}

	.md-stat-chip {
		display:         flex;
		align-items:     center;
		justify-content: center;
		gap:             4px;
		min-width:       80px;
		padding:         2px 8px;
		border-radius:   4px;
		background:      color-mix(in srgb, var(--scolor) 12%, var(--bg-control));
		border:          1px solid color-mix(in srgb, var(--scolor) 30%, transparent);
		color:           var(--scolor);
		flex-shrink:     0;
	}
	.md-sname {
		font-size:       0.58rem;
		letter-spacing:  0.05em;
		text-transform:  uppercase;
		line-height:     1;
	}
	.md-sval {
		font-size:   0.85rem;
		font-weight: 700;
		line-height: 1;
	}

	/* ── Action row (adds + roll button) ─────────────────────────────────── */
	.md-action-row {
		display:     flex;
		align-items: center;
		gap:         12px;
	}
	.md-adds-row {
		display:     flex;
		align-items: center;
		gap:         6px;
	}
	.md-adds-label {
		font-family: var(--font-ui);
		font-size:   0.75rem;
		color:       var(--text-muted);
		min-width:   28px;
	}
	.md-adj {
		width:           22px;
		height:          22px;
		padding:         0;
		display:         flex;
		align-items:     center;
		justify-content: center;
		background:      var(--bg);
		border:          1px solid var(--border);
		border-radius:   3px;
		cursor:          pointer;
		font-size:       0.9rem;
		font-family:     var(--font-ui);
		color:           var(--text);
		line-height:     1;
	}
	.md-adj:disabled { opacity: 0.35; cursor: not-allowed; }
	.md-adj:not(:disabled):hover { background: var(--bg-hover); border-color: var(--border-mid); }

	.md-adds-val {
		min-width:            28px;
		text-align:           center;
		font-family:          var(--font-ui);
		font-size:            0.9rem;
		font-weight:          700;
		font-variant-numeric: tabular-nums;
		color:                var(--text);
	}
	.md-adds-val.positive { color: var(--color-success); }
	.md-adds-val.negative { color: var(--color-danger); }


	/* ── Progress row ────────────────────────────────────────────────────── */
	.md-progress-row {
		display:     flex;
		align-items: center;
		gap:         6px;
	}
	.md-progress-label {
		font-family: var(--font-ui);
		font-size:   0.75rem;
		color:       var(--text-muted);
		flex:        1;
	}
	.md-progress-val {
		min-width:            28px;
		text-align:           center;
		font-family:          var(--font-ui);
		font-size:            1rem;
		font-weight:          700;
		font-variant-numeric: tabular-nums;
		color:                var(--text);
	}

	/* ── Roll button ─────────────────────────────────────────────────────── */
	.md-roll-btn {
		display:     inline-flex;
		align-items: center;
		gap:         6px;
		padding:     8px 16px;
		font-size:   0.8rem;
	}
	/* In action row, roll button fills remaining space */
	/* Roll status formula (between spinners and roll button) */
	.md-roll-status {
		flex:          1;
		text-align:    center;
		font-family:   var(--font-ui, monospace);
		font-size:     0.72rem;
		color:         var(--text-muted);
		font-style:    italic;
		white-space:   nowrap;
		overflow:      hidden;
		text-overflow: ellipsis;
		padding:       0 6px;
	}
	.md-action-row .md-roll-btn { justify-content: center; }
	/* Inline die icons inside roll status formula (injected via @html) */
	:global(.rs-die) {
		width:          1em;
		height:         1em;
		display:        inline;
		vertical-align: -0.15em;
	}

	/* ── Ask the Oracle odds selection ───────────────────────── */
	.md-oracle-threshold {
		margin-left:   auto;
		font-size:     0.8rem;
		font-weight:   600;
		color:         var(--text-muted);
		min-width:     2.5em;
		text-align:    right;
	}
	.md-stat-row-btn.selected .md-oracle-threshold {
		color: var(--scolor);
	}
	.md-roll-dice {
		display:     inline-flex;
		align-items: center;
		gap:         2px;
	}
	.md-roll-die {
		display:     flex;
		align-items: center;
	}
	.md-roll-die :global(svg) {
		fill: currentColor;
	}
	.md-roll-die--d6 :global(svg) {
		width:  14px;
		height: 14px;
	}
	.md-roll-die--d10 :global(svg) {
		width:  12px;
		height: 12px;
		opacity: 0.8;
	}
	/* Standalone roll buttons (progress moves) — full width */
	.md-roll-btn--full { width: 100%; }
	/* Roll formula elements */
	.md-roll-vs {
		font-size:   0.65rem;
		font-weight: 600;
		opacity:     0.6;
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}
	.md-roll-sep {
		font-size:   0.7rem;
		opacity:     0.5;
	}
	.md-roll-num {
		font-size:   0.85rem;
		font-weight: 700;
		font-family: var(--font-ui, monospace);
		min-width:   1ch;
		text-align:  center;
	}

	/* ── Outcomes (no-roll moves) ────────────────────────────────────────── */
	.md-outcomes {
		display:        flex;
		flex-direction: column;
		gap:            8px;
	}
	.md-outcome-section {
		padding:       6px 8px;
		border-left:   3px solid var(--outcome-color, var(--border));
		border-radius: 0 4px 4px 0;
		background:    var(--bg-inset);
	}
	.md-outcome-label {
		font-family:    var(--font-ui);
		font-size:      0.65rem;
		font-weight:    700;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		margin-bottom:  3px;
	}
	.md-outcome-strong { color: var(--color-success, #34d399); }
	.md-outcome-weak   { color: var(--color-momentum, #60a5fa); }
	.md-outcome-miss   { color: var(--color-danger, #ef4444); }
	.md-outcome-text {
		font-family: var(--font-ui);
		font-size:   0.76rem;
		color:       var(--text-muted);
		line-height: 1.5;
	}
	.md-outcome-text :global(.log-only) { display: none; }
	.md-outcome-text :global(strong) { color: var(--text); font-weight: 600; }
	.md-outcome-text :global(ul) { margin: 3px 0; padding-left: 1.3em; }
	.md-outcome-text :global(li) { margin-bottom: 2px; }
	.md-outcome-text :global(a) { color: var(--text-accent); text-decoration: underline; cursor: pointer; }
	/* Make non-move interactive links inert in dialog (only live in session log) */
	.md-outcome-text :global(a.resource-link),
	.md-outcome-text :global(a.debility-link),
	.md-outcome-text :global(a.progress-link),
	.md-outcome-text :global(a.initiative-link),
	.md-outcome-text :global(a.menace-link) {
		pointer-events: none;
		cursor: default;
		text-decoration: none;
	}

	/* Harm placeholder: no foe context — player must resolve manually */
	.md-outcome-text :global(.harm-note) {
		font-style: italic;
		color: var(--text-dimmer);
	}

	/* ── Inline table (tableRoll moves) ───────────────────────────────────── */
	.md-table-list {
		display:        flex;
		flex-direction: column;
		gap:            2px;
		margin:         8px 0;
	}
	.md-table-row {
		display:     grid;
		grid-template-columns: 3.5rem 1fr;
		gap:         8px;
		font-size:   0.8rem;
		line-height: 1.4;
		padding:     4px 0;
		border-bottom: 1px solid var(--border);
	}
	.md-table-row:last-child {
		border-bottom: none;
	}
	.md-table-range {
		font-family:  var(--font-mono, monospace);
		color:        var(--text-dimmer);
		font-size:    0.75rem;
		text-align:   right;
		padding-right: 4px;
		white-space:  nowrap;
		align-self:   start;
		padding-top:  1px;
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
		font-size:   0.72rem;
		color:       var(--text-dimmer);
		line-height: 1.5;
		font-style:  italic;
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
	.md-factors-summary::-webkit-details-marker { display: none; }
	.md-factors-summary::before {
		content: '\25B8';
		font-size: 0.65rem;
		transition: transform 0.15s;
	}
	details.md-factors[open] .md-factors-summary::before { transform: rotate(90deg); }

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
		transition: background 0.1s, color 0.1s;
	}
	.md-factor-lvl.active {
		background: var(--text-accent, #60a5fa);
		color: #fff;
		border-color: transparent;
	}
	.md-factor-lvl:hover:not(.active) {
		background: rgba(255,255,255,0.06);
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

	/* Spell roll action row — spinners wrap above roll button on narrow dialogs */
	.md-action-row--spell {
		flex-wrap: wrap;
		gap: 6px 0;
	}
	.md-roll-btn--spell {
		flex: 1 1 auto;
	}

</style>
