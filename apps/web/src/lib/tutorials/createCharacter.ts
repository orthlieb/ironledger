/**
 * Tutorial: create a character — open the New Character dialog from the
 * Characters panel's switcher, roll a name, roll stats, roll a region of
 * origin (YRT), leave everything else to be randomized, and create; then,
 * on the sheet's Background tab, rewrite the rolled details as a bio and
 * add a portrait; on Core, initiative; swear a first vow; take a first
 * starting asset (of three, paid for with the 9 experience a new character
 * starts with) and spend its experience from the log; and on Status, the
 * debilities and bonds.
 *
 * Targets (`data-tour`): tab-characters (home's mobile tab bar),
 * char-switcher + new-char-action (CharactersArea's switcher and its
 * "+ New character…" row), new-char-name / roll-name, new-char-stats /
 * roll-stats (StatAllocator), randomize-origin / roll-origin and
 * randomize-also (RandomizeBlock), new-char-dialog-confirm (Create),
 * char-tab-background, char-bio (MarkdownNotes) and char-portrait
 * (PortraitUploader), char-tab-core / char-initiative, char-add-vow /
 * new-vow-dialog / char-vows, char-add-asset / asset-picker-search /
 * asset-picker-grid (AssetPicker) / asset-card / asset-card-add (its Add
 * button) / char-assets, the log's
 * .xp-cost-link, and char-tab-status / char-debilities / char-tracks.
 */
import { isSourceEnabled } from '#lib/expansionStore.svelte.js';
import { tourSel, tourTarget, type Tutorial } from './tour.js';

/** Click the `data-tour` control `id` inside `root`. */
function press(root: Element | undefined, id: string) {
	root?.querySelector<HTMLElement>(tourSel(id))?.click();
}

export const createCharacter: Tutorial = {
	route: '/home',
	ready: 'char-switcher',
	steps: () => [
		{
			// Phones (and the Tabs view) show one panel at a time.
			when: () => !tourTarget('char-switcher'),
			target: 'tab-characters',
			title: 'Your characters',
			body: 'Tap Characters to show your characters.',
			continueWhen: 'char-switcher',
		},
		{
			target: 'char-switcher',
			title: 'Open the character list',
			body: 'This switcher holds all your characters. Click it to open the list.',
			continueWhen: 'new-char-action',
			wait: 3000,
		},
		{
			target: 'new-char-action',
			title: 'Start a new character',
			body: 'Choose “+ New character…”.',
			// Below the row: above it would cover the list's search box.
			side: 'bottom',
			continueWhen: 'new-char-name',
			// Typed away by the list's search, or the list closed.
			backIfGone: true,
		},
		{
			target: 'new-char-name',
			title: 'Roll a name',
			body: 'Pick a name oracle — Ironlander, Elf, Giant and more — and click the die to roll a name. Roll again until one fits, or type your own. If you skip it, Next rolls one for you.',
			wait: 3000,
			// This and the dialog's other steps: if it's cancelled, back to
			// the switcher.
			backIfGone: true,
			beforeNext: (el) => {
				if (!el?.querySelector('input')?.value.trim()) press(el, 'roll-name');
			},
		},
		{
			target: 'new-char-stats',
			title: 'Roll your stats',
			backIfGone: true,
			body: 'Click the die to roll your stats across Edge, Heart, Iron, Shadow and Wits. With Lodestar on, choose a difficulty level first — Challenging, Perilous or Grim: the harder it is, the lower your stats. You can still adjust any stat by hand.',
			back: true,
			beforeNext: (el) => {
				const values = [...(el?.querySelectorAll('input') ?? [])].map((i) => Number(i.value));
				if (values.every((v) => !v)) press(el, 'roll-stats');
			},
		},
		{
			// The region picker is part of the YRT extension.
			when: () => isSourceEnabled('yrt'),
			target: 'randomize-origin',
			title: 'Roll a region of origin',
			backIfGone: true,
			body: 'Choose where your character was born, or click the die for a random region. Their religion is rolled for that region.',
			back: true,
			beforeNext: (el) => {
				if (el?.querySelector('.bui-select-value--placeholder')) press(el, 'roll-origin');
			},
		},
		{
			target: 'randomize-also',
			title: 'Randomize the rest',
			backIfGone: true,
			// All ticked by default; what the player unticks stays unticked.
			body: 'Everything ticked here is rolled when you create the character and written into their background. Untick anything you’d rather fill in yourself.',
			back: true,
		},
		{
			target: 'new-char-dialog-confirm',
			title: 'Create your character',
			backIfGone: true,
			body: 'Click Create. Everything you ticked is rolled, and every roll goes in the log.',
			side: 'top',
			clickToContinue: true,
			back: true,
		},
		{
			target: 'char-switcher',
			title: 'Meet your character',
			body: 'Your new character is ready. Switch between your characters here.',
			beforeNext: () => {
				// The sheet opens on Background when there's something rolled
				// to show; if it isn't, bring it up for the next step.
				if (!tourTarget('char-bio')) press(document.body, 'char-tab-background');
			},
		},
		{
			target: 'char-bio',
			title: 'Turn the rolls into a bio',
			body: 'This is your character’s background, starting with what you rolled. Click it to edit, and turn the details into a short bio in your own words: who they are, where they come from, what drives them. Markdown works. Click Next when you’re done; it saves as you type.',
			wait: 3000,
			back: true,
			beforeNext: (el) => {
				// Close the editor (it closes when it loses focus) so the
				// portrait, hidden while editing, is back for the next step.
				// The tour's own buttons don't take focus, so Next doesn't.
				const editor = el?.querySelector('textarea');
				if (editor && document.activeElement === editor) editor.blur();
			},
		},
		{
			target: 'char-portrait',
			title: 'Add a portrait',
			body: 'Click the frame to upload a picture of your character from your device. Click it afterwards to see it full size.',
			// Hidden while the bio is being edited: back once Next ends that.
			wait: 3000,
			back: true,
		},
		{
			target: 'char-tab-core',
			title: 'Your character sheet',
			body: 'Click Core for the rest of your sheet: stats, vitals and initiative.',
			continueWhen: 'char-initiative',
			back: true,
		},
		{
			target: 'char-initiative',
			title: 'Initiative',
			body: 'In a fight, whoever has initiative is in control. Set Character when you have it, Foe when your foe does, and None out of combat. Your moves tell you when it changes hands.',
			back: true,
		},
		{
			target: 'char-add-vow',
			title: 'Swear your first vow',
			body: 'Every Ironsworn is bound by iron vows. Click + to swear your first: the quest that sets your story in motion.',
			continueWhen: 'new-vow-dialog',
			back: true,
		},
		{
			target: 'new-vow-dialog',
			title: 'Name it and rank it',
			body: 'Say what you swear to do, and choose its rank: the harder the vow, the more progress it takes, and the more experience it earns when you fulfill it. Then click Swear Vow.',
			continueWhen: 'char-vows',
			backIfGone: true,
		},
		{
			target: 'char-vows',
			title: 'Your vow',
			body: 'Mark progress here each time you Reach a Milestone. When you believe you’ve done what you swore, Fulfill Your Vow.',
			wait: 3000,
		},
		{
			target: 'char-add-asset',
			title: 'Choose three assets',
			body: 'You start with three assets: any mix of Companions, Paths, Combat Talents and Rituals. Your 9 experience pays for them, 3 each. Click + to choose your first.',
			continueWhen: 'asset-picker-search',
			back: true,
		},
		{
			target: 'asset-picker-search',
			title: 'Find one',
			body: 'Search by name, or open Filters to show just one kind.',
			wait: 3000,
			// This and the picker's and the card's other steps: if one closes,
			// back to the + button.
			backIfGone: true,
		},
		{
			target: 'asset-picker-grid',
			title: 'Pick one',
			body: 'Each card shows its kind and what it does. Click one to read it in full.',
			continueWhen: 'asset-card',
			back: true,
			backIfGone: true,
		},
		{
			target: 'asset-card',
			title: 'Its first ability',
			body: 'Its first ability comes marked: that’s what you start with. A companion comes with none, so choose the one it starts with.',
			backIfGone: true,
		},
		{
			// A step of its own, with the popover above the button: on a phone
			// the card fills the screen, and a popover beside it covers Add.
			target: 'asset-card-add',
			title: 'Take it',
			body: 'Click Add. A new asset costs 3 experience.',
			side: 'top',
			clickToContinue: true,
			back: true,
			backIfGone: true,
		},
		{
			// The log is written as HTML, so this one goes by its class: the
			// newest purchase's link is the first (the log runs newest first).
			selector: '.xp-cost-link',
			title: 'Spend the experience',
			body: 'The log records each purchase. Click −3 experience to spend it.',
			wait: 3000,
			clickToContinue: true,
		},
		{
			target: 'char-assets',
			title: 'Two more to go',
			body: 'Add two more the same way, spending 3 experience on each. That uses up your 9.',
		},
		{
			target: 'char-tab-status',
			title: 'Your status',
			body: 'Click Status for what can go wrong, and the bonds you forge.',
			continueWhen: 'char-debilities',
			back: true,
		},
		{
			target: 'char-debilities',
			title: 'Debilities',
			body: 'Mark these when a move tells you to. Conditions (wounded, shaken, unprepared, encumbered) clear as you recover; banes (maimed, corrupted) and burdens (cursed, tormented) last. Each one lowers your maximum momentum.',
			back: true,
		},
		{
			target: 'char-tracks',
			title: 'Bonds',
			body:
				'When you Forge a Bond, mark progress here and note who or where. At the end of your story, your bonds are your legacy.' +
				(isSourceEnabled('delve')
					? ' With Delve on, Failures tracks your setbacks, and Learn From Your Failures turns them into experience.'
					: ''),
			back: true,
		},
	],
};
