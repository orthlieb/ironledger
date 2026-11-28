/**
 * Controls drawn into a step's text as they look on the page, for the ones
 * that show an icon rather than a word: "Click [🏃 Move]", "Click [+ ⛓]".
 * Styled in tour.css (.il-tour-key). A label (the Move button's) hides
 * where the page hides it, on narrow screens; screen readers get the name.
 */
import mapSvg from '#icons/compass-rose.svg?raw';
import gemSvg from '#icons/gem-solid.svg?raw';
import linkSvg from '#icons/link-solid.svg?raw';
import pinSvg from '#icons/location-dot-solid.svg?raw';
import moveSvg from '#icons/person-running-solid.svg?raw';

const key = (name: string, inner: string, tone = '') =>
	`<span class="il-tour-key${tone}" role="img" aria-label="${name}">${inner}</span>`;
const plus = '<span class="il-tour-key-plus">+</span>';

/** The header's Move button (its label hidden on phones, as there). */
export const MOVE = key(
	'Move',
	`${moveSvg}<span class="il-tour-key-label">Move</span>`,
	' il-tour-key--primary',
);
/** The character header's Add Vow button: + and a chain link. */
export const ADD_VOW = key('Add Vow', plus + linkSvg);
/** The character header's Add Asset button: + and a gem. */
export const ADD_ASSET = key('Add Asset', plus + gemSvg);
/** The header's Map button (its label hidden on phones, as there). */
export const MAP = key(
	'Map',
	`${mapSvg}<span class="il-tour-key-label">Map</span>`,
	' il-tour-key--primary',
);
/** The map's Add marker button: + and a pin. */
export const ADD_MARKER = key('Add marker', plus + pinSvg);
/** The header's ☰ menu button (HamburgerMenu), its three bars. */
export const MENU = key(
	'Menu',
	'<svg viewBox="0 0 16 16"><rect y="2" width="16" height="2" rx="1" fill="currentColor"/><rect y="7" width="16" height="2" rx="1" fill="currentColor"/><rect y="12" width="16" height="2" rx="1" fill="currentColor"/></svg>',
);

/** A keyboard key, or a key in the command bar, by its label: Tab, Enter,
 *  ↑, ++, ↵. */
export const kbd = (label: string) => key(label, label);
