/**
 * Tutorial: put your settlement on the map — once there's a settlement
 * (Add a settlement and an NPC): the header's Map; a picture to draw on,
 * if the map has none yet; + marker and a click where the settlement lies;
 * the marker's editor, linking it to the settlement and opening its icon;
 * the Choose Icon dialog's three tabs — Icons, Buildings and the
 * Settlement builder, where the settlement is drawn; OK; the marker's card
 * and its Go To; and the settlement's card, which lists the map now.
 *
 * The map loads as it opens, so the Map step waits for it, and notes the
 * markers on it then: the link step waits for a new one linked to a
 * settlement.
 *
 * Targets (`data-tour`): cm-switcher (ready), tb-map (the header's Map),
 * map-background (an empty map's Add background image), map-add-marker and
 * map-canvas (MapDialog); marker-dialog, marker-link, marker-icon and
 * marker-ok (MarkerPropertiesDialog); icon-picker, icon-icons,
 * icon-tab-buildings + icon-buildings and icon-tab-builder + icon-builder
 * (MapIconPicker), and sb-knobs + sb-preview (its SettlementBuilder);
 * marker-card (MarkerCard); map-dialog; and cm-map (the
 * settlement card's Map field, CommunitiesArea).
 */
import { getCommunities, isCommunityLoaded } from '#lib/communityStore.svelte.js';
import { mapState } from '#lib/mapStore.svelte.js';
import { ADD_MARKER, MAP } from './keys.js';
import { tourTarget, type TourStep, type Tutorial } from './tour.js';

export const mapSettlement: Tutorial = {
	route: '/home',
	ready: 'cm-switcher',
	loaded: isCommunityLoaded,
	steps: (): TourStep[] => {
		if (getCommunities().length === 0)
			return [
				{
					title: 'First, a settlement',
					body: 'There’s nothing to put on the map yet. Run Add a settlement and an NPC, and come back.',
				},
			];
		/** The markers on the map as it opened: the one placed isn't. */
		let before: Set<string> | undefined;
		const opened = () => {
			if (!tourTarget('map-add-marker') || !mapState.loaded) return false;
			before = new Set(mapState.markers.map((m) => m.id));
			return true;
		};
		const linked = () =>
			mapState.markers.some(
				(m) => before && !before.has(m.id) && m.entityId?.startsWith('community:'),
			);
		// The tab's name as the dialog shows it: shortened on a phone.
		const builder = matchMedia('(max-width: 480px)').matches ? 'Settlements' : 'Settlement builder';

		return [
			{
				target: 'tb-map',
				title: 'Your campaign map',
				body: `The settlements, landmarks and journeys of your story can be marked on a map of your own. Click ${MAP}.`,
				continueWhen: opened,
			},
			{
				// A new map: no picture yet.
				target: 'map-background',
				optional: true,
				title: 'A picture to draw on',
				body: 'A map starts as a picture: the Ironlands, a region you’ve drawn, a page of your notebook. Click Add background image and choose one.',
				continueWhen: () => !!mapState.backgroundHash && !!tourTarget('map-add-marker'),
				// The map closed: back to Map.
				backIfGone: true,
			},
			{
				target: 'map-add-marker',
				title: 'Mark your settlement',
				body: `Click ${ADD_MARKER} to add a marker.`,
				continueWhen: () => tourTarget('map-add-marker')?.getAttribute('aria-pressed') === 'true',
			},
			{
				target: 'map-canvas',
				title: 'Where is it?',
				body: 'Now click the map where your settlement lies.',
				continueWhen: 'marker-dialog',
				// Placing called off (Esc, or + again): back to +.
				back: true,
			},
			{
				target: 'marker-link',
				title: 'Link it',
				body: 'Under Link to, choose your settlement. The marker takes its name, and the settlement’s card will show the map it’s on.',
				continueWhen: linked,
				wait: 3000,
				// This and the editor's other steps: if it closes, back to the map.
				backIfGone: true,
			},
			{
				target: 'marker-icon',
				title: 'How it looks',
				body: 'Now its icon. Click it to choose one.',
				continueWhen: 'icon-picker',
				backIfGone: true,
			},
			{
				target: 'icon-icons',
				title: 'Icons',
				body: 'Icons for whatever you mark: beasts, ruins, dangers, roads. Search for one, or filter them by kind.',
				wait: 3000,
				// This and the picker's other steps: if it closes, back to the icon.
				backIfGone: true,
			},
			{
				target: 'icon-tab-buildings',
				title: 'Buildings',
				body: 'A settlement is better drawn. Click Buildings.',
				continueWhen: 'icon-buildings',
				backIfGone: true,
			},
			{
				target: 'icon-buildings',
				title: 'One building',
				body: 'One building, drawn in any culture: a hall, a tower, a shrine. With walls or without, on land or water, standing or in ruins.',
				wait: 3000,
				backIfGone: true,
			},
			{
				target: 'icon-tab-builder',
				title: 'A whole settlement',
				body: `Click ${builder}.`,
				continueWhen: 'icon-builder',
				backIfGone: true,
			},
			{
				target: 'sb-knobs',
				title: 'Draw your settlement',
				body: 'Set its size and culture, its walls and harbour, to match yours.',
				wait: 3000,
				backIfGone: true,
			},
			{
				// The preview and its buttons, apart from the knobs: a phone
				// has no room beside the builder, and a popover on all of it
				// would cover Use this.
				target: 'sb-preview',
				title: 'Use this',
				body: 'The die draws another layout. When you like it, click Use this.',
				continueWhen: () => !tourTarget('icon-picker'),
				backIfGone: true,
			},
			{
				target: 'marker-ok',
				title: 'Done',
				body: 'Click OK.',
				continueWhen: () => !tourTarget('marker-dialog'),
			},
			{
				target: 'marker-card',
				title: 'On the map',
				body: 'There it is. Click a marker to see its card; Go To Settlement takes you there. Click it now.',
				continueWhen: () => !tourTarget('map-dialog') && !!tourTarget('cm-map'),
				wait: 3000,
			},
			{
				target: 'cm-map',
				title: 'Where it’s marked',
				body: 'The settlement’s card lists every map it’s on. Click the map’s name to go straight back to its marker.',
				wait: 3000,
			},
		];
	},
};
