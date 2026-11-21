/**
 * Tutorial: back up your campaign — ☰ → Export…: what goes in (all of it,
 * to start), Zip archive or Markdown, and a real export, through its
 * progress overlay; then ☰ → Import…, where a backup goes back in.
 *
 * Targets (`data-tour`): app-menu (HamburgerMenu's ☰), export-dialog,
 * export-list, export-format and export-go (ExportDialog), export-progress
 * (ExportProgressDialog) and import-dialog (ImportDialog). Import and
 * Export are handled by the home page, so it runs there.
 */
import { getCharacters, isCharacterLoading } from '#lib/characterStore.svelte.js';
import { getCommunities, isCommunityLoaded } from '#lib/communityStore.svelte.js';
import { getEncounters, isEncounterLoading } from '#lib/encounterStore.svelte.js';
import { getExpeditions } from '#lib/expeditionStore.svelte.js';
import { sessionLog } from '#lib/log.svelte.js';
import { getNpcs, isNpcLoaded } from '#lib/npcStore.svelte.js';
import { getPlaces, isPlaceLoaded } from '#lib/placeStore.svelte.js';
import { MENU } from './keys.js';
import { tourTarget, type TourStep, type Tutorial } from './tour.js';

export const backUp: Tutorial = {
	route: '/home',
	// The home page's own: the menu is the layout's, there before the page.
	ready: 'tab-characters',
	loaded: () =>
		!isCharacterLoading() &&
		!isEncounterLoading() &&
		isCommunityLoaded() &&
		isNpcLoaded() &&
		isPlaceLoaded(),
	steps: (): TourStep[] => {
		const lists = [
			getCharacters(),
			getEncounters(),
			getExpeditions(),
			getCommunities(),
			getNpcs(),
			getPlaces(),
			sessionLog.entries,
		];
		if (lists.every((l) => l.length === 0))
			return [
				{
					title: 'Nothing to back up yet',
					body: 'Your campaign is empty so far. Run Create a character, and come back.',
				},
			];

		return [
			{
				target: 'app-menu',
				title: 'Back up your campaign',
				body: `Everything here is saved to your account as you go. A backup is a copy you keep yourself, to bring back what was lost or to move to another account. Click ${MENU}, then Export….`,
				continueWhen: 'export-dialog',
			},
			{
				target: 'export-list',
				title: 'What goes in',
				body: 'All of it, to start: characters, foes, journeys, connections, maps and the log. Untick what to leave out, or search for one thing and Select all.',
				// Cancelled: back to ☰.
				backIfGone: true,
			},
			{
				target: 'export-format',
				title: 'Zip or Markdown',
				body: 'Zip archive is the backup: it has everything, portraits and map pictures too, and can be imported again. Markdown is a copy to read, or to paste into notes elsewhere; it can’t be imported. Leave Zip archive selected.',
				backIfGone: true,
			},
			{
				target: 'export-go',
				title: 'Export it',
				body: 'Click Export Everything (Export Selection, if you left some out). The file goes to your downloads, named for the day and time.',
				clickToContinue: true,
				backIfGone: true,
			},
			{
				target: 'export-progress',
				title: 'On its way',
				body: 'Gathering it all takes a few seconds, then the file downloads. If it lists anything it left out, read it, and Close.',
				wait: 3000,
				continueWhen: () => !tourTarget('export-progress'),
			},
			{
				target: 'app-menu',
				title: 'Bringing it back',
				body: `To restore a backup, or bring in one someone sent you, click ${MENU}, then Import….`,
				continueWhen: 'import-dialog',
			},
			{
				target: 'import-dialog',
				title: 'Import',
				body: 'Click here to choose the zip, or drop it on. Anything with the same name as something already here is asked about first: keep both, replace it, or skip it. Click Done, and this stays open for your file.',
				backIfGone: true,
			},
		];
	},
};
