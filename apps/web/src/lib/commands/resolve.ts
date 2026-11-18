// =============================================================================
// Iron Ledger — command resolver (docs/command-language.md → Owners and names,
// When names collide, Making something active, Verbs)
//
// plan(input, world) turns what's typed into what Enter would do — a Plan —
// without doing it: show a value, change one (before → after), make
// something active, open a move, or the error it would give. The command bar
// shows the plan as the input changes and runs it on Enter (run.svelte.ts).
//
// Pure: the World is handed in (characters, foes, expeditions, what's active,
// the catalogue), so tests build one by hand.
// =============================================================================

import {
	normName,
	parseCommand,
	parseRoll,
	quoteName,
	type NamePart,
	type Parsed,
	type QualifierKind,
	type RollGroup,
	type Verb,
} from './parse.js';
import {
	characterValues,
	findValue,
	showOwner,
	showValue,
	valuesOf,
	type AssetOwner,
	type Catalogue,
	type CharacterOwner,
	type ExpeditionOwner,
	type FoeOwner,
	type Owner,
	type OwnerKind,
	type ValueSpec,
	type VowOwner,
} from './values.js';
import { planChange, type Harm } from './change.js';
import type { CharacterData } from '#lib/types.js';

// ---------------------------------------------------------------------------
// The world a command resolves against
// ---------------------------------------------------------------------------

export interface MoveRef {
	id: string;
	name: string;
	category?: string;
	/** Why it can't be made now (its condition fails), or null. */
	blocked: string | null;
}
export interface OracleRef {
	key: string;
	title: string;
	source?: string;
}

/** What a command acts on beyond what's active: a log link's or a move's
 *  vow and companion, and the asset a link belongs to (`self`). */
export interface Binding {
	vowId?: string;
	companionId?: string;
	selfAssetId?: string;
	/** What `harm` stands for, when the entry says (Endure Harm's amount). */
	harm?: number;
}

export interface World {
	characters: CharacterOwner[];
	foes: FoeOwner[];
	expeditions: ExpeditionOwner[];
	activeCharacterId: string | null;
	/** The selected foe, vanquished or not. */
	activeFoeId: string | null;
	activeExpeditionId: string | null;
	cat: Catalogue;
	moves: MoveRef[];
	oracles: OracleRef[];
	bound?: Binding;
}

/** Kinds `=` makes active, and that name the active one as an owner. */
export const SELECT_KINDS = ['character', 'foe', 'journey', 'site', 'scene'] as const;
export type SelectKind = (typeof SELECT_KINDS)[number];
/** Keywords for what a move or a link chooses; typed, they're refused. */
export const BOUND_KEYWORDS = ['vow', 'companion', 'self'] as const;
/** Every companion of the active character, at once: Make Camp's "+1 health
 *  for you and any companions". */
export const COMPANIONS = 'companions';

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------

/** One value of one owner, changed. */
export interface ChangePlan {
	kind: 'change';
	owner: Owner;
	spec: ValueSpec;
	from: number | string;
	to: number | string;
	/** Already so: nothing to change, nothing to log. */
	nothing: boolean;
	/** A number's target before its range held it. */
	wanted?: number;
	title: string;
	line: string;
	summary: string;
}

export type Plan =
	| { kind: 'empty' }
	| { kind: 'note'; text: string; summary: string }
	| {
			kind: 'show';
			text: string;
			/** `/site.theme`: open the site's picker too. */
			picker?: { expId: string; which: 'theme' | 'domain' };
	  }
	| ChangePlan
	| {
			/** `/companions.health++`: the same change to each companion. */
			kind: 'changes';
			changes: ChangePlan[];
			/** Every one already so. */
			nothing: boolean;
			summary: string;
	  }
	| { kind: 'select'; owner: Owner; summary: string }
	| { kind: 'move'; move: MoveRef; amount?: number; summary: string }
	| { kind: 'oracle'; oracle: OracleRef; summary: string }
	| { kind: 'roll'; groups: RollGroup[]; summary: string }
	| { kind: 'burn'; summary: string }
	| { kind: 'story'; action: 'start' | 'end' | 'write'; summary: string }
	| { kind: 'help'; topic: string; summary: string }
	| { kind: 'error'; message: string }
	| { kind: 'incomplete'; message: string };

const error = (message: string): Plan => ({ kind: 'error', message });
const incomplete = (message: string): Plan => ({ kind: 'incomplete', message });
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// ---------------------------------------------------------------------------
// Owners by name
// ---------------------------------------------------------------------------

export function activeCharacter(w: World): CharacterOwner | undefined {
	return w.characters.find((c) => c.id === w.activeCharacterId);
}
export function activeFoe(w: World): FoeOwner | undefined {
	return w.foes.find((f) => f.id === w.activeFoeId);
}
export function activeExpedition(w: World): ExpeditionOwner | undefined {
	return w.expeditions.find((e) => e.id === w.activeExpeditionId);
}

/** A character's vows as owners. */
export function vowOwners(ch: CharacterOwner): VowOwner[] {
	return (ch.data.vows ?? []).map((vow) => ({
		kind: 'vow',
		id: vow.id,
		name: vow.name?.trim() || 'Unnamed vow',
		vow,
		character: ch,
	}));
}

/** The string fields that hold the name a player gives an asset. */
const GIVEN_NAME_FIELDS = ['companion-name', 'name'];

/** A character's assets as owners. */
export function assetOwners(ch: CharacterOwner, cat: Catalogue): AssetOwner[] {
	return (ch.data.assets ?? []).map((asset) => {
		const def = cat.findAsset(asset.assetId);
		const given =
			GIVEN_NAME_FIELDS.map((f) => asset.customValues?.[f]?.trim()).find((v) => !!v) ?? '';
		return {
			kind: 'asset',
			id: asset.assetId,
			name: def?.name ?? asset.assetId,
			given,
			asset,
			def,
			character: ch,
		};
	});
}

/** A character's companions (its Companion assets) as owners. Not other
 *  characters, and not an asset that only has health, like Awakening's
 *  simulacrum ("not a companion and may not be healed"). */
export function companionOwners(ch: CharacterOwner, cat: Catalogue): AssetOwner[] {
	return assetOwners(ch, cat).filter((o) => o.def?.category === 'Companion');
}

/** Everything a typed name can stand for, in list order: characters, foes,
 *  expeditions, and the active character's vows and assets. */
export function namedOwners(w: World): Owner[] {
	const ch = activeCharacter(w);
	return [
		...w.characters,
		...w.foes,
		...w.expeditions,
		...(ch ? [...vowOwners(ch), ...assetOwners(ch, w.cat)] : []),
	];
}

/** The names an owner answers to: an asset by its name, id or given name. */
export function namesOf(o: Owner): string[] {
	if (o.kind === 'asset') return [o.name, o.id, o.given].filter(Boolean);
	return [o.name];
}

/** What an owner is called in a message: a companion by its given name. */
export function ownerLabel(o: Owner): string {
	return o.kind === 'asset' && o.given ? o.given : o.name;
}

const NOUN: Record<OwnerKind, string> = {
	character: 'a character',
	foe: 'a foe',
	journey: 'a journey',
	site: 'a site',
	scene: 'a scene',
	vow: 'a vow',
	asset: 'an asset',
};

/** The owners of one kind, in their list's order: what `#n` counts in. */
function kindList(w: World, kind: QualifierKind): Owner[] {
	return namedOwners(w).filter((o) => o.kind === kind);
}

/** The shortest reference that names exactly this owner: its name, quoted
 *  if needed; then `kind:Name`; then `kind:Name#n`. `valueKey` narrows
 *  the field as resolution does (only owners with that value count). */
export function ownerRef(o: Owner, w: World, valueKey?: string): string {
	const name = o.kind === 'asset' ? o.given || o.name : o.name;
	const keyword = isReserved(name, w);
	const plain = quoteName(name, keyword);
	const same = sameNamed(name, w, valueKey);
	if (same.length <= 1 && !keyword) return plain;
	const ofKind = same.filter((x) => x.kind === o.kind);
	const kq = `${o.kind}:${quoteName(name)}`;
	if (ofKind.length <= 1) return kq;
	const i = kindList(w, o.kind)
		.filter((x) => sameName(x, name))
		.indexOf(o);
	return `${kq}#${i + 1}`;
}

function sameName(o: Owner, name: string): boolean {
	const t = normName(name);
	return namesOf(o).some((n) => normName(n) === t);
}

function sameNamed(name: string, w: World, valueKey?: string): Owner[] {
	let c = namedOwners(w).filter((o) => sameName(o, name));
	if (valueKey) {
		const having = c.filter((o) => findValue(o, valueKey, w.cat));
		if (having.length) c = having;
	}
	return c;
}

/** The keys of the values a character has (the party's among them). */
export function characterValueKeys(cat: Catalogue): string[] {
	const dummy: CharacterOwner = {
		kind: 'character',
		id: '',
		name: '',
		data: { vows: [], assets: [] } as unknown as CharacterData,
	};
	return characterValues(dummy, cat).map((v) => v.key);
}

/** A word that commands read as a keyword or a value's name, not a name. */
export function isReserved(name: string, w: World): boolean {
	const t = normName(name);
	return (
		(SELECT_KINDS as readonly string[]).includes(t) ||
		(BOUND_KEYWORDS as readonly string[]).includes(t) ||
		t === COMPANIONS ||
		t === 'harm' ||
		characterValueKeys(w.cat).some((k) => k.toLowerCase() === t)
	);
}

// ── Did you mean ──────────────────────────────────────────────────────────

function distance(a: string, b: string): number {
	const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i]);
	for (let j = 1; j <= b.length; j++) d[0]![j] = j;
	for (let i = 1; i <= a.length; i++)
		for (let j = 1; j <= b.length; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
			if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
				d[i]![j] = Math.min(d[i]![j]!, d[i - 2]![j - 2]! + 1);
		}
	return d[a.length]![b.length]!;
}

/** The closest of `names` to `typed`, if close enough to be a slip. */
export function closest(typed: string, names: string[]): string | null {
	const t = normName(typed);
	let best: string | null = null;
	let bestD = Infinity;
	for (const n of names) {
		const dd = distance(t, normName(n));
		if (dd < bestD) {
			bestD = dd;
			best = n;
		}
	}
	return best !== null && bestD <= Math.max(1, Math.floor(t.length / 3)) ? best : null;
}

function unknownName(typed: string, w: World, extra: string[] = []): string {
	const names = [...namedOwners(w).flatMap(namesOf), ...extra];
	const guess = closest(typed, names);
	return `Unknown name "${typed}".${guess ? ` Did you mean ${guess}?` : ''}`;
}

/** Why a name stands for more than one thing, with how to name each. */
function collision(name: string, owners: Owner[], w: World, valueKey?: string): string {
	const refs = owners.map((o) => `/${ownerRef(o, w, valueKey)}${valueKey ? `.${valueKey}` : ''}`);
	const kinds = [...new Set(owners.map((o) => o.kind))];
	if (kinds.length === 1)
		return `There are ${owners.length} ${kinds[0]}s called ${name}: ${refs.join(', ')}`;
	const nouns = kinds.map((k) => NOUN[k]);
	const list = nouns.length > 1 ? `${nouns.slice(0, -1).join(', ')} and ${nouns.at(-1)}` : nouns[0];
	return `${name} is ${list}: ${refs.join(', ')}`;
}

/** The example a "Which vow?" message gives. */
function nameExample(w: World, kind: 'vow' | 'asset', fallback: string): string {
	const ch = activeCharacter(w);
	const first = ch
		? kind === 'vow'
			? vowOwners(ch)[0]
			: assetOwners(ch, w.cat).find((a) => a.def?.category === 'Companion')
		: undefined;
	return first ? ownerRef(first, w) : fallback;
}

/** An owner from what's written before the dot (or alone, `/Wolf`). */
export function resolveOwner(
	part: NamePart,
	w: World,
	valueKey?: string,
): Owner | { error: string } {
	const t = normName(part.text);
	if (!part.quoted && !part.qualifier) {
		const ch = activeCharacter(w);
		switch (t) {
			case 'character':
				return ch ?? { error: 'No active character.' };
			case 'foe':
				return activeFoe(w) ?? { error: 'No active foe.' };
			case 'journey':
			case 'site':
			case 'scene': {
				const e = activeExpedition(w);
				if (!e) return { error: `No active ${t}.` };
				if (e.kind !== t)
					return { error: `No active ${t}: the active expedition is the ${e.kind} ${e.name}.` };
				return e;
			}
			case 'vow': {
				const v = ch && w.bound?.vowId && vowOwners(ch).find((x) => x.id === w.bound!.vowId);
				if (v) return v;
				const eg = nameExample(w, 'vow', 'Avenge Bjorn');
				return { error: `Which vow? Name it: /${eg}.${valueKey || 'progress'}++` };
			}
			case 'companion': {
				const c =
					ch &&
					w.bound?.companionId &&
					assetOwners(ch, w.cat).find((x) => x.id === w.bound!.companionId);
				if (c) return c;
				const eg = nameExample(w, 'asset', 'hawk');
				return { error: `Which companion? Name it: /${eg}.${valueKey || 'health'}--` };
			}
			case 'self': {
				const s =
					ch &&
					w.bound?.selfAssetId &&
					assetOwners(ch, w.cat).find((x) => x.id === w.bound!.selfAssetId);
				if (s) return s;
				return {
					error: 'self is the asset a link belongs to: name the asset, e.g. /hawk.health--',
				};
			}
		}
	}
	let found = namedOwners(w).filter((o) => sameName(o, part.text));
	if (part.qualifier) found = found.filter((o) => o.kind === part.qualifier);
	if (part.index !== undefined) {
		const kind = part.qualifier!;
		const ofKind = kindList(w, kind).filter((o) => sameName(o, part.text));
		const o = ofKind[part.index - 1];
		if (!o)
			return {
				error: ofKind.length
					? `There ${ofKind.length === 1 ? 'is 1' : `are ${ofKind.length}`} ${kind}${ofKind.length === 1 ? '' : 's'} called ${part.text}, not ${part.index}.`
					: `No ${kind} called "${part.text}".`,
			};
		return o;
	}
	if (valueKey && found.length) {
		const having = found.filter((o) => findValue(o, valueKey, w.cat));
		if (!having.length) return { error: `${ownerLabel(found[0]!)} has no ${valueKey}.` };
		found = having;
	}
	if (found.length === 1) return found[0]!;
	if (found.length > 1) return { error: collision(part.text, found, w, valueKey) };
	// An asset the active character doesn't have: "Edda has no Hawk."
	const ch = activeCharacter(w);
	const def = w.cat.assets?.find((a) => normName(a.name) === t || normName(a.id) === t);
	if (def && ch) return { error: `${ch.name} has no ${def.name}.` };
	if (part.qualifier) return { error: `No ${part.qualifier} called "${part.text}".` };
	return { error: unknownName(part.text, w) };
}

// ---------------------------------------------------------------------------
// Planning
// ---------------------------------------------------------------------------

/** The active foe's harm, if it can deal any. */
function activeHarm(w: World): Harm | undefined {
	const f = activeFoe(w);
	if (w.bound?.harm !== undefined) return { n: w.bound.harm, from: f?.name };
	if (!f || f.enc.vanquished) return undefined;
	return { n: w.cat.foe(f.enc).harm, from: f.name };
}

/** The log entry's title: whose value, and which. */
function logTitle(owner: Owner, spec: ValueSpec): string {
	switch (owner.kind) {
		case 'character':
			return `${owner.name} — ${spec.label}`;
		case 'vow':
			return `${owner.character.name} — ${owner.name}`;
		case 'asset':
			return `${owner.character.name} — ${ownerLabel(owner)}`;
		default:
			return `${owner.name} — ${spec.label}`;
	}
}

/** "Wolf: " before a summary about anything but the active character. */
function prefix(owner: Owner, w: World): string {
	if (owner.kind === 'character' && owner.id === w.activeCharacterId) return '';
	return `${ownerLabel(owner)}: `;
}

/** Plan a command on one value of one owner. */
function onValue(
	owner: Owner,
	spec: ValueSpec,
	p: Extract<Parsed, { kind: 'value' }>,
	w: World,
): Plan {
	if (!p.op) {
		const text = prefix(owner, w) + showValue(spec);
		if (owner.kind === 'site' && (spec.key === 'theme' || spec.key === 'domain'))
			return { kind: 'show', text, picker: { expId: owner.id, which: spec.key } };
		return { kind: 'show', text };
	}
	const r = planChange(spec, p.op, p.operand ?? '', activeHarm(w), p.operandQuoted);
	if (!r.ok) return r.incomplete ? incomplete(r.message) : error(r.message);
	return {
		kind: 'change',
		owner,
		spec,
		from: r.from,
		to: r.to,
		wanted: r.wanted,
		nothing: r.nothing,
		title: logTitle(owner, spec),
		line: r.line,
		summary: prefix(owner, w) + r.summary,
	};
}

/** `/companions.health++`: one value of every companion the active
 *  character has, changed alike (or shown, with no operator). */
function onCompanions(p: Extract<Parsed, { kind: 'value' }>, w: World): Plan {
	const ch = activeCharacter(w);
	if (!ch) return error('No active character.');
	const list = companionOwners(ch, w.cat);
	if (!list.length) return error(`${ch.name} has no companions.`);
	const changes: ChangePlan[] = [];
	const shown: string[] = [];
	for (const o of list) {
		const spec = findValue(o, p.value.text, w.cat);
		if (!spec) return error(`${ownerLabel(o)} has no ${p.value.text}.`);
		const one = onValue(o, spec, p, w);
		if (one.kind === 'change') changes.push(one);
		else if (one.kind === 'show') shown.push(one.text);
		else return one;
	}
	if (!p.op) return { kind: 'show', text: shown.join('; ') };
	return {
		kind: 'changes',
		changes,
		nothing: changes.every((c) => c.nothing),
		summary: changes.map((c) => c.summary).join('; '),
	};
}

/** The text of an operator as typed, for a "do it this way" message. */
function opText(p: Extract<Parsed, { kind: 'value' }>): string {
	if (!p.op) return '';
	return p.op + (p.operand ?? '');
}

/** `/foe`, `/foe=Wolf`, `/journey`, `/character=Bjorn`. */
function onKind(kind: SelectKind, p: Extract<Parsed, { kind: 'value' }>, w: World): Plan {
	if (!p.op) {
		const o = resolveOwner({ ...p.value, text: kind, quoted: false }, w);
		if ('error' in o) return error(o.error);
		return { kind: 'show', text: showOwner(o, w.cat) };
	}
	if (p.op !== '=')
		return error(
			`/${kind} is the active ${kind}: change one of its values (/${kind}.progress${opText(p)}) or choose one (/${kind}=name).`,
		);
	const typed = (p.operand ?? '').trim();
	if (!typed) return incomplete(`Needs a name: /${kind}=…`);
	const list = w[
		kind === 'character' ? 'characters' : kind === 'foe' ? 'foes' : 'expeditions'
	] as Owner[];
	const ofKind = list.filter((o) => o.kind === kind);
	let found = ofKind.filter((o) => sameName(o, typed));
	if (!found.length) {
		const m = typed.match(/^(.*?)\s*#(\d+)$/);
		if (m) {
			const same = ofKind.filter((o) => sameName(o, m[1]!));
			const o = same[Number(m[2]) - 1];
			if (o) found = [o];
			else if (same.length)
				return error(
					`There ${same.length === 1 ? 'is 1' : `are ${same.length}`} ${kind}${same.length === 1 ? '' : 's'} called ${m[1]}.`,
				);
		}
	}
	if (found.length > 1)
		return error(
			`There are ${found.length} ${kind}s called ${typed}: ${found.map((_, i) => `/${kind}=${typed}#${i + 1}`).join(', ')}`,
		);
	const o = found[0];
	if (!o) {
		const other = w.expeditions.find((e) => sameName(e, typed));
		if (other && other.kind !== kind)
			return error(`${other.name} is ${NOUN[other.kind]}: /${other.kind}=${typed}`);
		const guess = closest(
			typed,
			ofKind.map((x) => x.name),
		);
		return error(`No ${kind} called "${typed}".${guess ? ` Did you mean ${guess}?` : ''}`);
	}
	const isActive =
		kind === 'character'
			? o.id === w.activeCharacterId
			: kind === 'foe'
				? o.id === w.activeFoeId
				: o.id === w.activeExpeditionId;
	if (isActive) return { kind: 'show', text: `${o.name} is already the active ${kind}.` };
	return { kind: 'select', owner: o, summary: `${o.name} becomes the active ${kind}` };
}

function onValueCommand(p: Extract<Parsed, { kind: 'value' }>, w: World): Plan {
	if (p.value.open || p.owner?.open) return incomplete('Close the quote: "…"');
	if (!p.value.text) {
		if (p.dot) return incomplete('Needs a value after the dot: /foe.progress');
		return incomplete('Type a value, a name, or a command: /health, /foe, /move');
	}
	if (p.partialOp) return incomplete('Needs an operator: ++ -- += -= = !');

	const isCompanions = (n: NamePart) =>
		!n.quoted && !n.qualifier && normName(n.text) === COMPANIONS;
	if (p.owner && isCompanions(p.owner)) return onCompanions(p, w);
	if (!p.owner && isCompanions(p.value)) {
		if (p.op) return error(`Change one of their values: /companions.health${opText(p)}`);
		const ch = activeCharacter(w);
		if (!ch) return error('No active character.');
		const list = companionOwners(ch, w.cat);
		if (!list.length) return { kind: 'show', text: `${ch.name} has no companions.` };
		return { kind: 'show', text: list.map((o) => showOwner(o, w.cat)).join('; ') };
	}

	if (p.owner) {
		const owner = resolveOwner(p.owner, w, p.value.text);
		if ('error' in owner) return error(owner.error);
		const spec = findValue(owner, p.value.text, w.cat);
		if (!spec) return error(`${ownerLabel(owner)} has no ${p.value.text}.`);
		if (spec.party) return error(`${spec.label} is the party's: /${spec.key}${opText(p)}`);
		return onValue(owner, spec, p, w);
	}

	const t = normName(p.value.text);
	if (!p.value.quoted && !p.value.qualifier) {
		if ((SELECT_KINDS as readonly string[]).includes(t)) return onKind(t as SelectKind, p, w);
		if ((BOUND_KEYWORDS as readonly string[]).includes(t)) {
			const o = resolveOwner(p.value, w);
			if ('error' in o) return error(o.error);
			if (p.op) return error(`Change one of its values: /${t}.progress${opText(p)}`);
			return { kind: 'show', text: showOwner(o, w.cat) };
		}
		if (characterValueKeys(w.cat).some((k) => k.toLowerCase() === t)) {
			const ch = activeCharacter(w);
			if (!ch) return error('No active character.');
			return onValue(ch, findValue(ch, t, w.cat)!, p, w);
		}
	}
	// A name on its own shows what it names.
	const owner = resolveOwner(p.value, w);
	if ('error' in owner) {
		const keys = characterValueKeys(w.cat);
		return error(
			owner.error.startsWith('Unknown name')
				? unknownName(p.value.text, w, [...keys, ...SELECT_KINDS])
				: owner.error,
		);
	}
	if (p.op) {
		const eg = valuesOf(owner, w.cat).find((v) => v.writable && v.kind !== 'notes');
		const ref = ownerRef(owner, w);
		const select = (SELECT_KINDS as readonly string[]).includes(owner.kind)
			? `, or make it active: /${owner.kind}=${owner.name}`
			: '';
		return error(
			`${ownerLabel(owner)} is ${NOUN[owner.kind]}: change one of its values${eg ? `, e.g. /${ref}.${eg.key}${opText(p)}` : ''}${select}.`,
		);
	}
	return { kind: 'show', text: showOwner(owner, w.cat) };
}

// ── Verbs ─────────────────────────────────────────────────────────────────

/** A move by what's typed: its name or id, else the first whose name starts
 *  with it (A→Z). */
export function findMove(w: World, typed: string): MoveRef | undefined {
	const t = normName(typed);
	const slug = t.replace(/\s+/g, '-');
	const byId = w.moves.find((m) => m.id === slug || m.id === `move/${slug}`);
	if (byId) return byId;
	// Two moves can share a name (Lodestar's scene Face Danger): the one that
	// can be made now first.
	const exact = w.moves
		.filter((m) => normName(m.name) === t)
		.sort((a, b) => Number(!!a.blocked) - Number(!!b.blocked))[0];
	if (exact) return exact;
	return [...w.moves]
		.filter((m) => normName(m.name).startsWith(t))
		.sort((a, b) => Number(!!a.blocked) - Number(!!b.blocked) || a.name.localeCompare(b.name))[0];
}

/** An oracle by its key or title, else the first whose title starts with
 *  what's typed, else one that holds it. */
export function findOracle(w: World, typed: string): OracleRef | undefined {
	const t = normName(typed);
	return (
		w.oracles.find((o) => o.key.toLowerCase() === t || normName(o.title) === t) ??
		w.oracles.find((o) => normName(o.title).startsWith(t)) ??
		w.oracles.find((o) => normName(o.title).includes(t))
	);
}

export const STORY_ACTIONS = ['start', 'end', 'write'] as const;

function onVerb(verb: Verb, arg: string, w: World): Plan {
	switch (verb) {
		case 'note':
			return arg
				? { kind: 'note', text: arg, summary: 'Adds a note' }
				: incomplete('Needs some text: /note …');
		case 'move': {
			if (!arg) return incomplete('Needs a move: /move face danger');
			const m = arg.match(/^(.*?)\s+(\d+)$/);
			const name = m ? m[1]! : arg;
			const move = findMove(w, name) ?? (m ? findMove(w, arg) : undefined);
			if (!move) return error(`No move called "${name}".`);
			if (move.blocked) return error(`${move.name}: ${move.blocked}`);
			const amount = m && findMove(w, name) ? Number(m[2]) : undefined;
			return {
				kind: 'move',
				move,
				amount,
				summary: `Opens ${move.name}${amount !== undefined ? ` (${amount})` : ''}`,
			};
		}
		case 'oracle': {
			if (!arg) return incomplete('Needs an oracle: /oracle region');
			const o = findOracle(w, arg);
			if (!o) return error(`No oracle called "${arg}".`);
			return { kind: 'oracle', oracle: o, summary: `Opens ${o.title}` };
		}
		case 'roll': {
			if (!arg) return incomplete('Needs dice: /roll 2d10 1d6+2');
			const r = parseRoll(arg);
			if ('error' in r) return error(r.error);
			return { kind: 'roll', groups: r, summary: `Rolls ${r.map((g) => g.raw).join(' ')}` };
		}
		case 'burn':
			if (arg) return error('/burn takes nothing after it.');
			return { kind: 'burn', summary: 'Burns momentum on the newest action roll' };
		case 'story': {
			if (!arg) return incomplete('Needs start, end or write: /story start');
			const a = arg.toLowerCase();
			if (!(STORY_ACTIONS as readonly string[]).includes(a))
				return error(`/story takes start, end or write, not "${arg}".`);
			const summary =
				a === 'start'
					? 'Marks the newest entry as the start of a story section'
					: a === 'end'
						? 'Marks the newest entry as the end of the story section'
						: 'Opens Generate on the story section';
			return { kind: 'story', action: a as 'start' | 'end' | 'write', summary };
		}
		case 'help':
			return { kind: 'help', topic: arg.toLowerCase(), summary: 'Opens the command help' };
	}
}

/** What Enter would do with `input`. */
export function plan(input: string, w: World): Plan {
	const p = parseCommand(input);
	switch (p.kind) {
		case 'empty':
			return { kind: 'empty' };
		case 'note':
			return { kind: 'note', text: p.text, summary: 'Adds a note' };
		case 'error':
			return error(p.message);
		case 'verb':
			return onVerb(p.verb, p.arg, w);
		case 'value':
			return onValueCommand(p, w);
	}
}

export { cap as capitalize };
