// =============================================================================
// Iron Ledger — the app icons a livery may replace
//
// The four areas' icons (Characters, Expeditions, Foes, Connections), the
// session log's, and the six entity kinds' (settlements, landmarks, NPCs,
// journeys, sites, scenes).
// A livery replaces any of them with its own `liveries/<id>/icons/<name>.svg`
// (inlined into liveries.manifest.json by scripts/gen-liveries-manifest.mjs);
// the ones it doesn't ship stay the app's own. Read one with `appIcon(name)`:
// it reads the active livery, so a template or `$derived` that calls it
// re-renders when the livery changes. The entity kinds' reach consumers
// through ENTITY_KIND_META's `icon`, which calls it.
// =============================================================================

import charactersSvg from '$icons/Characters.svg?raw';
import expeditionsSvg from '$icons/Expeditions.svg?raw';
import foesSvg from '$icons/Foes.svg?raw';
import villageSvg from '$icons/village.svg?raw';
import logSvg from '$icons/log.svg?raw';
import journeySvg from '$icons/journey.svg?raw';
import hourglassSvg from '$icons/hourglass-clock-solid.svg?raw';
import dungeonGateSvg from '$icons/dungeon-gate.svg?raw';
import hutSvg from '$icons/hut.svg?raw';
import farmerSvg from '$icons/farmer.svg?raw';
import locationDotSvg from '$icons/location-dot-solid.svg?raw';
import { activeLiveryIcons } from './fontStore.svelte.js';

/** The replaceable icons, by the name a livery's `icons/<name>.svg` takes.
 *  Mirrors ICON_NAMES in scripts/lint-liveries.mjs — keep the two in sync. */
export const LIVERY_ICON_NAMES = [
	'characters',
	'expeditions',
	'foes',
	'connections',
	'log',
	'journey',
	'scene',
	'site',
	'settlements',
	'npcs',
	'landmarks',
] as const;
export type LiveryIconName = (typeof LIVERY_ICON_NAMES)[number];

/** The app's own icon for each, where the active livery ships none. */
export const APP_ICONS: Record<LiveryIconName, string> = {
	characters: charactersSvg,
	expeditions: expeditionsSvg,
	foes: foesSvg,
	connections: villageSvg,
	log: logSvg,
	journey: journeySvg,
	scene: hourglassSvg,
	site: dungeonGateSvg,
	settlements: hutSvg,
	npcs: farmerSvg,
	landmarks: locationDotSvg,
};

/** The icon for `name` (raw SVG markup): the active livery's, if it ships
 *  one, else the app's own. Reactive, as activeLiveryBrand() is. */
export function appIcon(name: LiveryIconName): string {
	return activeLiveryIcons()[name] ?? APP_ICONS[name];
}
