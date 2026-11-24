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
import { companionOwners, ownerLabel, plan as planCommand } from './resolve.js';
import type { CompanionHealth } from '#lib/moveRoll.js';
import { bindCommandLinks, type LinkBinding } from './links.js';
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
import { getMoves, getVisibleMoves } from '#lib/moveStore.svelte.js';
import { getOracles, getVisibleOracles } from '#lib/oracleStore.svelte.js';
import { movePreconditionFailure, type PreconditionContext } from '#lib/preconditions.js';
import { appendLog, sessionLog } from '#lib/log.svelte.js';
import { renderNote, escHtml } from '#lib/markdown.js';
import { rollDie, animateDice, type DiceSpec } from '#lib/dice.js';
import { getEndId, getStartId, hasSection, setEnd, setStart } from '#lib/sectionStore.svelte.js';
import { capAbilitiesForField, maxMomentum } from '#lib/character.js';
import {
	COMPANION_HEALTH_OVERFLOW,
	FLOOR_RULES,
	FLOOR_OVERFLOW_RULES,
	OVERFLOW_RULES,
} from '#lib/cascadeRules.js';
import { DEBILITIES } from './values.js';
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
 *  a reactive context to follow them. A link's binding stands in for what's
 *  active: the entry's character, foe and expedition, the vow or companion
 *  its move chose, the harm it was made with. A link opens a move whatever
 *  its condition (the dialog says why it can't be made). */
export function buildWorld(bind?: LinkBinding): World {
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
	// A link reaches a move or an oracle whatever packs are on (a saved log
	// can name one from a pack turned off since); typed, only the visible ones.
	const moves: MoveRef[] = (bind ? getMoves() : getVisibleMoves()).map((m) => ({
		id: m.id,
		name: m.name,
		category: m.category,
		blocked: bind
			? null
			: movePreconditionFailure(m.preconditions as string | undefined, data, ctx),
	}));
	const oracles: OracleRef[] = (bind ? getOracles() : getVisibleOracles()).map((o) => ({
		key: o.key,
		title: o.title,
		source: o.source,
	}));
	return {
		characters,
		foes,
		expeditions,
		activeCharacterId: bind?.charId || getActiveCharacterId() || null,
		activeFoeId: bind?.foeId || getActiveFoeId() || null,
		activeExpeditionId: bind?.expId || getActiveExpeditionId() || null,
		cat: liveCatalogue(),
		moves,
		oracles,
		bound: bind
			? {
					vowId: bind.vowId,
					companionId: bind.companionId,
					selfAssetId: bind.selfId,
					harm: bind.harm,
				}
			: undefined,
	};
}

/** A character's companions with their health and its maximum (which their
 *  abilities may raise): what Take a Hiatus restores. */
export function companionHealth(charId: string): CompanionHealth[] {
	const c = getCharacters().find((x) => x.id === charId);
	if (!c) return [];
	const data = c.data as unknown as CharacterData;
	const ch: CharacterOwner = { kind: 'character', id: c.id, name: data.name || c.name, data };
	const cat = liveCatalogue();
	return companionOwners(ch, cat).flatMap((o) => {
		const spec = findValue(o, 'health', cat);
		if (!spec || spec.max === undefined) return [];
		return [{ id: o.id, name: ownerLabel(o), health: Number(spec.get()) || 0, max: spec.max }];
	});
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
	wanted?: number,
): void {
	const data = ch.data;
	/** A cascade's own entry, its links bound to it. */
	const note = (title: string, html: string) => {
		const entryId = crypto.randomUUID();
		appendLog(title, bindCommandLinks(html, entryId), entryId);
	};
	// Marking a debility lowers momentum's top: momentum above it comes down.
	if (typeof to === 'number' && to > 0 && Number(from) === 0) {
		const top = maxMomentum(data);
		if ((DEBILITIES as readonly string[]).includes(key) && data.momentum > top) {
			const old = data.momentum;
			data.momentum = top;
			appendLog(
				`${ch.name} — Momentum`,
				`<div>Momentum: ${old} → <strong>${top}</strong> (max ${top})</div>`,
			);
		}
	}
	if (typeof to !== 'number' || typeof from !== 'number') return;
	const asked = wanted ?? to;
	if (asked < from) {
		// Taken past 0: the rest comes off momentum (health, spirit).
		const over = OVERFLOW_RULES.find((r) => r.resource === key);
		if (over && asked < 0) note(over.logTitle, over.logHtml({ overflow: -asked, charId: ch.id }));
		// Already at the floor and taken further: Face Death, Face a Setback, …
		const past = FLOOR_OVERFLOW_RULES.find((r) => r.resource === key && from <= r.floor);
		if (past) note(past.logTitle, past.logHtml({ overflow: from - asked, charId: ch.id }));
	}
	// Reaching the floor this change: what happens next.
	if (to < from) {
		const rule = FLOOR_RULES.find((r) => r.resource === key && to === r.floor);
		if (rule) note(rule.logTitle, rule.logHtml({ charId: ch.id }));
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
	if (owner.kind === 'character' && ch) cascade(ch, spec.key, p.from, p.to, p.wanted);
	// A companion's health taken past 0: the rest comes off momentum.
	const asked = p.wanted ?? Number(p.to);
	if (
		owner.kind === 'asset' &&
		owner.def?.category === 'Companion' &&
		spec.key === 'health' &&
		typeof p.from === 'number' &&
		asked < 0 &&
		asked < p.from
	) {
		const entryId = crypto.randomUUID();
		appendLog(
			COMPANION_HEALTH_OVERFLOW.logTitle,
			bindCommandLinks(
				COMPANION_HEALTH_OVERFLOW.logHtml({
					overflow: -asked,
					charId: owner.character.id,
					name: ownerLabel(owner),
				}),
				entryId,
			),
			entryId,
		);
	}
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

/** Burn momentum: the log panel holds the roll, so it's asked to — the
 *  newest action roll, or (a burn link) the roll the link was offered on. */
function runBurn(rollId?: string): RunResult {
	let result: RunResult = {
		ok: false,
		message: 'The log isn’t open: nothing to burn momentum on.',
	};
	document.dispatchEvent(
		new CustomEvent('ironledger:burn', {
			detail: { rollId, reply: (message: string, ok: boolean) => (result = { ok, message }) },
		}),
	);
	return result;
}

/** Open a move: Ask the Oracle is the oracle dialog. */
function openMove(id: string, harm?: number): void {
	if (id === 'move/ask-the-oracle')
		document.dispatchEvent(new CustomEvent('ironledger:open-oracle', { detail: { key: '' } }));
	else document.dispatchEvent(new CustomEvent('ironledger:open-move', { detail: { id, harm } }));
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
		case 'changes':
			// Each companion's change is its own entry, as if typed by name.
			for (const c of p.changes) runChange(c);
			return { ok: true, message: p.summary };
		case 'select': {
			const o = p.owner;
			if (o.kind === 'character') setActiveCharacterId(o.id);
			else if (o.kind === 'foe') setActiveFoeId(o.id);
			else setActiveExpeditionId(o.id);
			return { ok: true, message: `${p.summary}.` };
		}
		case 'move':
			openMove(p.move.id, p.amount);
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

// ---------------------------------------------------------------------------
// Running a link
// ---------------------------------------------------------------------------

export interface LinkResult extends RunResult {
	/** It ran (a value it sets already so counts): strike the link through. */
	spend: boolean;
}

/**
 * Run a link's command against its binding (docs/command-language.md →
 * Clicking them). A link changes a value, burns momentum, opens a move or an
 * oracle, or opens a site's picker; anything else a command can do (make
 * something active, write a note, mark a story section, help) is the
 * command bar's. A link that can't run says why and stays unspent.
 */
export function runLink(cmd: string, bind: LinkBinding = {}): LinkResult {
	const w = buildWorld(bind);
	const fail = (message: string): LinkResult => ({ ok: false, message, spend: false });
	if (bind.charId && !w.characters.some((c) => c.id === bind.charId))
		return fail('The character this entry was for is gone.');
	const p = planCommand(cmd, w);
	if (p.kind === 'error' || p.kind === 'incomplete') {
		if (bind.foeId && !w.foes.some((f) => f.id === bind.foeId) && /^No active foe/.test(p.message))
			return fail('The foe this entry was made against is gone.');
		if (
			bind.expId &&
			!w.expeditions.some((e) => e.id === bind.expId) &&
			/^No active (journey|site|scene)/.test(p.message)
		)
			return fail('The expedition this entry was made for is gone.');
		return fail(p.message);
	}
	switch (p.kind) {
		case 'change':
		case 'changes': {
			// Spent even when it was already so (You retain initiative when you
			// have it): what it asks for holds, so it isn't there to click again.
			const r = runPlan(p, { openHelp: () => {} });
			return { ...r, spend: r.ok };
		}
		case 'burn': {
			const r = runBurn(bind.rollId);
			return { ...r, spend: r.ok };
		}
		case 'move':
			openMove(p.move.id, p.amount ?? (bind.harm !== undefined ? bind.harm : undefined));
			return { ok: true, message: '', spend: false };
		case 'oracle':
			document.dispatchEvent(
				new CustomEvent('ironledger:open-oracle', {
					detail: { key: p.oracle.key, stat: bind.stat },
				}),
			);
			return { ok: true, message: '', spend: false };
		case 'show':
			if (p.picker) {
				document.dispatchEvent(new CustomEvent('ironledger:site-picker', { detail: p.picker }));
				return { ok: true, message: '', spend: true };
			}
			return fail('A link changes a value or opens a move or an oracle; this one only names one.');
		default:
			return fail('A link can’t do that: it’s for the command bar.');
	}
}

/** Say a command's result in the command bar's status line (a link's,
 *  clicked in the log or a dialog). */
export function reportCommandResult(r: RunResult): void {
	if (!r.message) return;
	document.dispatchEvent(new CustomEvent('ironledger:command-status', { detail: r }));
}
