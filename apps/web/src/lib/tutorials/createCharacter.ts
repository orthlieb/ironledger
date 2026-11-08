/**
 * Tutorial: create a character — open the New Character dialog from the
 * Characters panel's switcher, roll a name, roll stats, roll a region of
 * origin (YRT), leave everything else to be randomized, and create; then,
 * on the sheet's Background tab, rewrite the rolled details as a bio and
 * add a portrait; on Core, initiative; and on Status, the debilities and
 * bonds. Its first vow and its assets have tutorials of their own (addVow,
 * addAssets), which its last step points to.
 *
 * Targets (`data-tour`): tab-characters (home's mobile tab bar),
 * char-switcher + new-char-action (CharactersArea's switcher and its
 * "+ New character…" row), new-char-name / roll-name, new-char-stats /
 * roll-stats (StatAllocator), randomize-origin / roll-origin and
 * randomize-also (RandomizeBlock), new-char-dialog-confirm (Create),
 * char-tab-background, char-bio (MarkdownNotes) and char-portrait
 * (PortraitUploader), char-tab-core / char-initiative, and char-tab-status
 * / char-debilities / char-tracks.
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
					: '') +
				' Next, swear your first vow and choose your assets: ☰ → Tutorials → Add your first vow, then Add your assets.',
			back: true,
		},
	],
};
