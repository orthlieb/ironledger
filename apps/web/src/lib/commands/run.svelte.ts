// =============================================================================
// Iron Ledger — running commands against the live stores
//
// buildWorld() gathers what a command resolves against from the stores (the
// characters, foes and expeditions, what's active, the content packs' fields
// and the catalogue); runPlan() carries out a Plan from resolve.ts: it
// writes the value through the registry, logs the sheet's line, saves, and
// runs the cascades a change on the sheet has (the party's supply reaching
// every character, a debility lowering momentum's top, a resource reaching
// its floor).
// =============================================================================

import type { Plan, World, MoveRef, OracleRef } from './resolve.js';
import type { Catalogue, CharacterOwner, ExpeditionOwner, FoeOwner, Owner } from './values.js';
import { findValue } from './values.js';
import {
	getCharacters,
	flushCharacterToApi,
	setPartyFields,
	setPartySupply,
} from '#lib/characterStore.svelte.js';
import { getEncounters, flushEncountersToApi } from '#lib/encounterStore.svelte.js';
import { getExpeditions, persistExpeditionsNow } from '#lib/expeditionStore.svelte.js';
import {
	getActiveCharacterId,
	getActiveExpeditionId,
	getActiveFoeId,
	setActiveCharacterId,
	setActiveExpeditionId,
	setActiveFoeId,
} from '#lib/activeContext.svelte.js';
import { getActiveDiceCtx } from '#lib/diceContext.svelte.js';
import { findAsset, getAssets } from '#lib/assetStore.svelte.js';
import { characterFieldGroups } from '#lib/characterFields.svelte.js';
import { isSourceEnabled, getExtensions } from '#lib/expansionStore.svelte.js';
import { FOE_RANKS, findFoe, resolveFoeName } from '#lib/foeStore.svelte.js';
import { foeExtraFlag } from '#lib/foeExtras.js';
import { getVisibleMoves } from '#lib/moveStore.svelte.js';
import { getVisibleOracles } from '#lib/oracleStore.svelte.js';
import { movePreconditionFailure, type PreconditionContext } from '#lib/preconditions.js';
import { appendLog, sessionLog } from '#lib/log.svelte.js';
import { renderNote, escHtml } from '#lib/markdown.js';
import { rollDie, animateDice, type DiceSpec } from '#lib/dice.js';
import { getEndId, getStartId, hasSection, setEnd, setStart } from '#lib/sectionStore.svelte.js';
import { capAbilitiesForField, maxMomentum } from '#lib/character.js';
import { FLOOR_RULES } from '#lib/cascadeRules.js';
import type { CharacterData, FoeEncounter } from '#lib/types.js';

// ---------------------------------------------------------------------------
// The world, from the stores
// ---------------------------------------------------------------------------

/** A foe encounter's name: the one given it, else its catalogue name (an
 *  enabled pack may rename it, as YRT does the Giant), else its id. */
export function encounterName(enc: { foeId: string; customName?: string }): string {
	if (enc.customName?.trim()) return enc.customName.trim();
	const def = findFoe(enc.foeId);
	return def ? resolveFoeName(def) : enc.foeId || 'Foe';
}

/** Ticks per progress mark on a foe: its rank's, less a YRT foe's
 *  escalating defense (at least 1). */
export function foeTicksPerMark(enc: FoeEncounter): number {
	const per = FOE_RANKS[enc.effectiveRank]?.progressPerHit ?? 0;
	return foeExtraFlag(findFoe(enc.foeId), 'yrt', 'escalatesDefense')
		? Math.max(1, (per || 1) - (enc.currentDefense ?? 0))
		: per;
}

/** The catalogue a command reads: the enabled packs' fields and the assets. */
export function liveCatalogue(): Catalogue {
	return {
		fields: characterFieldGroups().flatMap((g) => g.fields),
		globals: getExtensions()
			.filter((e) => isSourceEnabled(e.id))
			.flatMap((e) => (e.fields ?? []).filter((f) => f.scope === 'global')),
		findAsset,
		assets: getAssets(),
		foe: (enc) => {
			const r = FOE_RANKS[enc.effectiveRank];
			return {
				name: encounterName(enc),
				rank: r?.label ?? 'Unranked',
				ticksPerMark: foeTicksPerMark(enc),
				harm: r?.harm ?? 0,
			};
		},
	};
}

/** The same precondition context /home gives the Moves dialog, so a move the
 *  dialog greys is refused here too. */
function preconditionContext(): PreconditionContext {
	const dice = getActiveDiceCtx();
	const foeId = getActiveFoeId();
	const expId = getActiveExpeditionId();
	const enc = foeId ? getEncounters().find((e) => e.id === foeId && !e.vanquished) : undefined;
	const exp = expId ? getExpeditions().find((e) => e.id === expId) : undefined;
	return {
		hasCharacter: !!dice,
		hasFoe: !!enc,
		hasJourney: exp?.type === 'journey',
		hasSite: exp?.type === 'site',
		hasScene: exp?.type === 'scene',
		expeditionName: exp?.name,
		foeName: enc ? encounterName(enc) : undefined,
		initiative: dice?.data?.initiative,
		foeHarm: enc ? FOE_RANKS[enc.effectiveRank]?.harm : undefined,
	};
}

/** Everything a command resolves against, read from the stores. Call it in
 *  a reactive context to follow them. */
export function buildWorld(): World {
	const characters: CharacterOwner[] = getCharacters().map((c) => {
		const data = c.data as unknown as CharacterData;
		return { kind: 'character', id: c.id, name: data.name?.trim() || c.name || 'Unnamed', data };
	});
	const foes: FoeOwner[] = getEncounters().map((enc) => ({
		kind: 'foe',
		id: enc.id,
		name: encounterName(enc),
		enc,
	}));
	const expeditions: ExpeditionOwner[] = getExpeditions().map((exp) => ({
		kind: exp.type,
		id: exp.id,
		name: exp.name?.trim() || `New ${exp.type}`,
		exp,
	}));
	const ctx = preconditionContext();
	const data = getActiveDiceCtx()?.data;
	const moves: MoveRef[] = getVisibleMoves().map((m) => ({
		id: m.id,
		name: m.name,
		category: m.category,
		blocked: movePreconditionFailure(m.preconditions as string | undefined, data, ctx),
	}));
	const oracles: OracleRef[] = getVisibleOracles().map((o) => ({
		key: o.key,
		title: o.title,
		source: o.source,
	}));
	return {
		characters,
		foes,
		expeditions,
		activeCharacterId: getActiveCharacterId() || null,
		activeFoeId: getActiveFoeId() || null,
		activeExpeditionId: getActiveExpeditionId() || null,
		cat: liveCatalogue(),
		moves,
		oracles,
	};
}

// ---------------------------------------------------------------------------
// Running a plan
// ---------------------------------------------------------------------------

export interface RunResult {
	ok: boolean;
	message: string;
}

/** What the runner needs from the page: the help dialog. */
export interface RunUi {
	openHelp(topic: string): void;
}

/** The character a value change lands on, if it's a character's. */
function characterOf(owner: Owner): CharacterOwner | undefined {
	if (owner.kind === 'character') return owner;
	if (owner.kind === 'vow' || owner.kind === 'asset') return owner.character;
	return undefined;
}

/** Save the owner a change was made to. */
function save(owner: Owner): void {
	const ch = characterOf(owner);
	if (ch) flushCharacterToApi(ch.id);
	else if (owner.kind === 'foe') void flushEncountersToApi();
	else
		persistExpeditionsNow().catch((err) => console.error('[commands] expedition save failed', err));
}

/** A change to a character's own data sets off what the sheet's would. */
function cascade(
	ch: CharacterOwner,
	key: string,
	from: number | string,
	to: number | string,
): void {
	const data = ch.data;
	// Marking a debility lowers momentum's top: momentum above it comes down.
	if (typeof to === 'number' && to > 0 && Number(from) === 0) {
		const top = maxMomentum(data);
		if (
			[
				'wounded',
				'shaken',
				'unprepared',
				'encumbered',
				'maimed',
				'corrupted',
				'cursed',
				'tormented',
			].includes(key) &&
			data.momentum > top
		) {
			const old = data.momentum;
			data.momentum = top;
			appendLog(
				`${ch.name} — Momentum`,
				`<div>Momentum: ${old} → <strong>${top}</strong> (max ${top})</div>`,
			);
		}
	}
	// A resource reaching its floor: what happens next.
	if (typeof to === 'number' && typeof from === 'number' && to < from) {
		const rule = FLOOR_RULES.find((r) => r.resource === key && to === r.floor);
		if (rule) {
			const entryId = crypto.randomUUID();
			appendLog(rule.logTitle, rule.logHtml({ charId: ch.id, entryId }), entryId);
		}
	}
}

/** Make a planned change: write it, log it, save it, and cascade. */
function runChange(p: Extract<Plan, { kind: 'change' }>): RunResult {
	if (p.nothing) return { ok: true, message: p.summary };
	const { owner, spec } = p;
	// The plan was made against the stores a moment ago; take the live value
	// again in case something moved since.
	const live = findValue(owner, spec.key, liveCatalogue()) ?? spec;
	live.set(p.to);
	let line = p.line;
	const ch = characterOf(owner);
	if (owner.kind === 'character' && ch) {
		const field = liveCatalogue().fields.find((f) => f.id === spec.key);
		if (field) {
			const notes = capAbilitiesForField(ch.data, field.id, String(p.to), findAsset);
			if (notes.length) line = line.replace(/<\/div>$/, `; ${escHtml(notes.join('; '))}</div>`);
		}
	}
	appendLog(p.title, line);
	if (spec.party) {
		if (spec.key === 'supply') setPartySupply(Number(p.to));
		else setPartyFields({ [spec.key]: String(p.to) });
	} else save(owner);
	if (owner.kind === 'character' && ch) cascade(ch, spec.key, p.from, p.to);
	return { ok: true, message: p.summary };
}

/** Roll dice and log them, each group with its dice and sum. */
function runRoll(p: Extract<Plan, { kind: 'roll' }>): RunResult {
	const rolled = p.groups.map((g) => {
		const values: number[] = [];
		for (let i = 0; i < g.n; i++) values.push(rollDie(g.sides));
		return { g, values, sum: values.reduce((a, b) => a + b, 0) + g.modifier };
	});
	const dice: DiceSpec[] = rolled.flatMap(({ g, values }) =>
		values.map((v) => ({ sides: g.sides, value: v })),
	);
	void animateDice(dice);
	const rows = rolled
		.map(({ g, values, sum }) => {
			const mod =
				g.modifier === 0 ? '' : g.modifier > 0 ? ` +${g.modifier}` : ` −${Math.abs(g.modifier)}`;
			const shown = values.map((v) => `[${v}]`).join(' ');
			return `<div class="roll-line">${g.raw}: ${shown}${mod} = <strong>${sum}</strong></div>`;
		})
		.join('');
	const total = rolled.reduce((a, r) => a + r.sum, 0);
	const totalRow =
		rolled.length > 1 ? `<div class="roll-line"><strong>Total:</strong> ${total}</div>` : '';
	const label = p.groups.map((g) => g.raw).join(' ');
	appendLog(`Roll — ${label}`, rows + totalRow);
	return {
		ok: true,
		message:
			rolled.length === 1
				? `Rolled ${label} → ${rolled[0]!.sum}.`
				: `Rolled ${label} → total ${total}.`,
	};
}

function runStory(action: 'start' | 'end' | 'write'): RunResult {
	const top = sessionLog.entries[0];
	if (action === 'start') {
		if (!top) return { ok: false, message: 'No log entries yet: nothing to mark.' };
		setStart(top.id);
		return {
			ok: true,
			message: `▲ Start marked on "${top.title}". The section grows until /story end.`,
		};
	}
	if (action === 'end') {
		if (!hasSection()) return { ok: false, message: 'Mark a start first: /story start' };
		if (!top) return { ok: false, message: 'No log entries yet: nothing to mark.' };
		if (top.id === getStartId())
			return { ok: false, message: 'The end would be the start: nothing between them.' };
		setEnd(top.id);
		return { ok: true, message: `▼ End marked on "${top.title}". /story write opens Generate.` };
	}
	if (!hasSection()) return { ok: false, message: 'No section marked: /story start first.' };
	document.dispatchEvent(new CustomEvent('ironledger:story-generate'));
	return {
		ok: true,
		message:
			getEndId() === null
				? 'Generating from the open section (▲ to now).'
				: 'Generating from the marked section (▲ to ▼).',
	};
}

/** Burn momentum: the log panel holds the roll, so it's asked to. */
function runBurn(): RunResult {
	let result: RunResult = {
		ok: false,
		message: 'The log isn’t open: nothing to burn momentum on.',
	};
	document.dispatchEvent(
		new CustomEvent('ironledger:burn', {
			detail: { reply: (message: string, ok: boolean) => (result = { ok, message }) },
		}),
	);
	return result;
}

/** Carry out a plan. */
export function runPlan(p: Plan, ui: RunUi): RunResult {
	switch (p.kind) {
		case 'empty':
			return { ok: true, message: '' };
		case 'note':
			appendLog('Note', renderNote(p.text), undefined, p.text);
			return { ok: true, message: 'Noted.' };
		case 'error':
		case 'incomplete':
			return { ok: false, message: p.message };
		case 'show':
			if (p.picker)
				document.dispatchEvent(new CustomEvent('ironledger:site-picker', { detail: p.picker }));
			return { ok: true, message: p.text };
		case 'change':
			return runChange(p);
		case 'select': {
			const o = p.owner;
			if (o.kind === 'character') setActiveCharacterId(o.id);
			else if (o.kind === 'foe') setActiveFoeId(o.id);
			else setActiveExpeditionId(o.id);
			return { ok: true, message: `${p.summary}.` };
		}
		case 'move':
			document.dispatchEvent(
				new CustomEvent('ironledger:open-move', { detail: { id: p.move.id, harm: p.amount } }),
			);
			return { ok: true, message: `Opened ${p.move.name}.` };
		case 'oracle':
			document.dispatchEvent(
				new CustomEvent('ironledger:open-oracle', { detail: { key: p.oracle.key } }),
			);
			return { ok: true, message: `Opened ${p.oracle.title}.` };
		case 'roll':
			return runRoll(p);
		case 'burn':
			return runBurn();
		case 'story':
			return runStory(p.action);
		case 'help':
			ui.openHelp(p.topic);
			return { ok: true, message: '' };
	}
}
