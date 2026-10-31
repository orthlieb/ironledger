// =============================================================================
// demo-campaign.mjs — the small Ironlands campaign the About screenshots show
//
// Original content written for the screenshots: one Ironsworn (Bryn Halvard),
// her vows and assets, a fight's worth of foes, three expeditions and a pair
// of settlements with their people. The Starter Ironlands map and its regions
// come from the real starter import (see about-screenshots.mjs); settlements
// here are placed inside those regions by name.
// =============================================================================

const uid = () => crypto.randomUUID();

export const CHARACTER = {
	name: 'Bryn Halvard',
	data: {
		name: 'Bryn Halvard',
		background:
			'A hunter from the Havens who swore on her sister’s grave to see the raiders of the Broken Tooth answer for what they did. She travels with a hawk named Ember and trusts very little else.',
		edge: 2,
		heart: 3,
		iron: 2,
		shadow: 1,
		wits: 1,
		momentum: 5,
		health: 4,
		spirit: 5,
		supply: 4,
		xp: 3,
		bonds: 6,
		bondsFormed: '- **Asha Vell**, healer of Barrow’s Edge\n- **Ember**, my hawk',
		failures: 3,
		wounded: true,
		unprepared: false,
		shaken: false,
		encumbered: false,
		maimed: false,
		corrupted: false,
		cursed: false,
		tormented: false,
		vows: [
			{
				id: uid(),
				name: 'Avenge my sister, slain by the raiders of the Broken Tooth',
				difficulty: 'formidable',
				ticks: 16,
				threat: 'The raiders grow bolder with every unanswered raid',
				menace: 3,
				status: 'active',
			},
			{
				id: uid(),
				name: 'Carry the healer’s satchel to Barrow’s Edge before the first frost',
				difficulty: 'dangerous',
				ticks: 24,
				threat: '',
				menace: 0,
				status: 'active',
			},
			{
				id: uid(),
				name: 'Find what is poisoning the Deep Wilds',
				difficulty: 'extreme',
				ticks: 4,
				threat: '',
				menace: 0,
				status: 'active',
				collapsed: true,
			},
		],
		assets: [
			{
				assetId: 'companion/hawk',
				abilities: [true, true, false],
				customValues: { 'companion-name': 'Ember', health: '3' },
			},
			{ assetId: 'path/wayfinder', abilities: [true, false, false] },
			{ assetId: 'combat/archer', abilities: [true, true, false] },
		],
	},
};

const encounter = (foeId, rank, extra = {}) => ({
	id: uid(),
	foeId,
	quantity: 'solo',
	effectiveRank: rank,
	ticks: 0,
	notes: '',
	customName: '',
	vanquished: false,
	...extra,
});

export const ENCOUNTERS = [
	encounter('ironsworn/raider', 2, {
		quantity: 'pack',
		customName: 'Broken Tooth Raiders',
		ticks: 12,
		notes: 'Led by a scarred woman with an iron torc. They took the north road.',
	}),
	encounter('ironsworn/wolf', 2, { quantity: 'pack', ticks: 32, vanquished: true }),
	encounter('ironsworn/frostbound', 3, { ticks: 4 }),
	encounter('ironsworn/troll', 3),
];

const site = uid();

const denizens = [
	'Bonewalker',
	'Haunt',
	'Marsh Rat',
	'Sodden',
	'Bonewalker',
	'Hollow',
	'Haunt',
	'Raider',
	'Gaunt',
	'Frostbound',
	'Iron Revenant',
	'Wyvern',
];

export const EXPEDITIONS = [
	{
		id: uid(),
		type: 'journey',
		name: 'The Long Road to Barrow’s Edge',
		difficulty: 'dangerous',
		ticks: 20,
		notes: 'Three days along the old cairn road, then across the ford at Rook’s Rest.',
		shortDescription: 'Carrying the healer’s satchel north before the frost.',
		complete: false,
		createdAt: Date.now() - 3000,
	},
	{
		id: site,
		type: 'site',
		name: 'The Drowned Barrow',
		objective: 'Recover the iron circlet from the barrow-king’s tomb',
		notes: 'Black water stands in the lower halls. Something knocks beneath it.',
		shortDescription: 'A flooded barrow in the Flooded Lands.',
		theme: 'Haunted',
		domain: 'Barrow',
		difficulty: 'formidable',
		ticks: 12,
		denizens,
		currentFeature: 'Offerings to the dead',
		currentDanger: 'Unsettling sounds or foreboding signs',
		complete: false,
		createdAt: Date.now() - 2000,
	},
	{
		id: uid(),
		type: 'scene',
		name: 'Parley at the Ford',
		objective: 'Talk the raiders out of burning the ferry',
		consequences: 'The ferry burns and Rook’s Rest is cut off for the winter',
		difficulty: 'troublesome',
		ticks: 12,
		countdownFilled: 1,
		notes: '',
		complete: false,
		createdAt: Date.now() - 1000,
	},
];

/** Settlements + people, placed inside the starter's regions by name, plus
 *  their pins (and the barrow's) for the starter's Regional Map. */
export function connections(places) {
	const placeId = (name) => places.find((p) => p.name === name)?.id;
	const hinterlands = placeId('The Hinterlands');
	const havens = placeId('The Havens');
	const barrowsEdge = uid();
	const rooksRest = uid();
	const community = (id, name, within, fields) => ({
		id,
		name,
		region: '',
		location: '',
		locationDescription: '',
		trouble: '',
		notes: '',
		...(within ? { within: `place:${within}` } : {}),
		createdAt: Date.now(),
		...fields,
	});
	const npc = (name, within, fields) => ({
		id: uid(),
		name,
		role: '',
		goal: '',
		descriptor: '',
		relationship: 'neutral',
		location: '',
		notes: '',
		within: `community:${within}`,
		createdAt: Date.now(),
		...fields,
	});
	const marker = (id, kind, label, x, y, icon) => ({
		id: uid(),
		x,
		y,
		label,
		icon,
		scale: 1.6,
		labelStyle: { bold: true },
		entityId: `${kind}:${id}`,
	});
	return {
		communities: [
			community(barrowsEdge, 'Barrow’s Edge', hinterlands, {
				location: 'A palisaded village on a ridge above old barrow-mounds',
				locationDescription: 'Wind-scoured and watchful',
				trouble: 'A sickness spreading through the herds',
				type: 'Village',
				condition: 'Struggling',
				firstLook: 'Smoke from a dozen hearths, bones hung above the gate',
				disposition: 'Wary of strangers',
				projects: 'Raising a second palisade before winter',
				culturalTouchstones: 'Mead poured on the barrow-mounds at the new moon',
				shortDescription: 'The last village before the barrows.',
			}),
			community(rooksRest, 'Rook’s Rest', havens, {
				location: 'A ferry crossing on the Rook river',
				locationDescription: 'Busy, muddy, and full of strangers',
				trouble: 'Raiders demanding tribute for safe crossing',
			}),
		],
		markers: [
			marker(barrowsEdge, 'community', 'Barrow’s Edge', 6.35, 7.7, 'settlement/village-wood-wall'),
			marker(rooksRest, 'community', 'Rook’s Rest', 7.9, 10.55, 'settlement/huts-village'),
			marker(site, 'site', 'The Drowned Barrow', 8.25, 11.6, 'site/crypt-entrance'),
		],
		npcs: [
			npc('Asha Vell', barrowsEdge, {
				role: 'Healer',
				goal: 'Keep the village alive through the winter',
				descriptor: 'Calm voice, stained hands, never sleeps',
				firstLook: 'Grey-streaked braid, a satchel of herbs at her hip',
				activity: 'Grinding feverfew by lamplight',
				disposition: 'Warm, but worn thin',
				relationship: 'bond',
			}),
			npc('Torvald Greycloak', barrowsEdge, {
				role: 'Elder',
				goal: 'Keep the old ways',
				descriptor: 'Leans on a spear older than the village',
			}),
			npc('Kell the Ferryman', rooksRest, {
				role: 'Ferryman',
				goal: 'Pay off the raiders without losing the ferry',
				descriptor: 'Nervous, talks too much, knows every rumour',
			}),
			npc('Hrolf Ironhand', rooksRest, {
				role: 'Raider chief’s envoy',
				goal: 'Collect the tribute',
				descriptor: 'Smiles while he threatens',
				relationship: 'foe',
			}),
		],
	};
}

/**
 * A few turns played through the log's command bar, oldest first — the
 * Session Log shot shows the newest at the top. Move and oracle results are
 * whatever the dice say.
 */
export const PLAY = [
	{
		note: 'Bryn reaches the ford at dusk. The Broken Tooth are already there, torches lit, the ferry roped to the far bank.',
	},
	{ move: 'Enter the Fray', option: 'Facing off against your foe' },
	{ oracle: 'Action' },
	{ command: '/initiative character' },
	{ move: 'Strike', option: 'Attack at range' },
	{ note: 'Ember stoops on the torch-bearer; in the dark the raiders lose their nerve.' },
	{ move: 'Face Danger', option: 'With speed, agility, or precision' },
];
