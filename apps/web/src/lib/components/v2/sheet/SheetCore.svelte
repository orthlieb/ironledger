<script lang="ts">
	/**
	 * The character sheet's Core tab: initiative, stats, vitals, debilities,
	 * and the Bonds and Failures tracks with their notes.
	 *
	 * Stats read out; a double-click (or double-tap) on one asks first, then
	 * opens a draft for an asset ability that changes it, and leaving the
	 * field asks to apply the change, which is logged. A debility toggle is
	 * logged and clamps momentum to the new maximum. The note button at the
	 * end of each track opens its notes (Bonds Formed, Lessons Learned).
	 *
	 * `data` is the live character: edits land on it directly, and the
	 * parent's autosave sees them.
	 */
	import StatControl from '#lib/components/StatControl.svelte';
	import ResourceTile from '#lib/components/ResourceTile.svelte';
	import MomentumTile from '#lib/components/MomentumTile.svelte';
	import ProgressTrackPanel from '#lib/components/ProgressTrackPanel.svelte';
	import DebilitiesSection from '#lib/components/DebilitiesSection.svelte';
	import SegmentedRadio from '#lib/components/SegmentedRadio.svelte';
	import TrackNotesDialog from '#lib/components/TrackNotesDialog.svelte';
	import ConfirmDialog from '#lib/components/ConfirmDialog.svelte';
	import { tooltip } from '#lib/actions/tooltip.js';
	import { setPartySupply } from '#lib/characterStore.svelte.js';
	import { isSourceEnabled } from '#lib/expansionStore.svelte.js';
	import { maxMomentum, momentumReset } from '#lib/character.js';
	import { STAT_MAX, STAT_MIN, type Stat } from '#lib/rules/statArrays.js';
	import { appendLog } from '#lib/log.svelte.js';
	import type { CharacterData } from '#lib/types.js';
	import iconHealth from '#icons/icon-health.svg?raw';
	import iconSpirit from '#icons/icon-spirit.svg?raw';
	import iconSupply from '#icons/icon-supply.svg?raw';
	import iconStar from '#icons/star-solid.svg?raw';
	import iconNote from '#icons/note-sticky-solid.svg?raw';
	import swordSvg from '#icons/sword-solid.svg?raw';
	import shieldSvg from '#icons/shield-halved-solid.svg?raw';

	let {
		charId,
		data: cd,
		onmomentumreset,
	}: {
		/** The character's id: switching character drops a stat draft. */
		charId: string;
		/** The live character data. */
		data: CharacterData;
		/** Momentum's reset button: the parent applies and logs it. */
		onmomentumreset: () => void;
	} = $props();

	// The notes behind the Bonds and Failures note buttons.
	let bondsNotesRef = $state<ReturnType<typeof TrackNotesDialog> | null>(null);
	let lessonsNotesRef = $state<ReturnType<typeof TrackNotesDialog> | null>(null);

	function charTitle(name: string): string {
		return `${cd.name || 'Unnamed'} — ${name}`;
	}

	// Write a session-log entry whenever a debility toggles. Mirrors V1
	// CharacterSheet's logDebility — uses the character's current name so
	// the log entry attributes the change to the right character.
	// Also clamps current momentum to the new cap (each debility reduces
	// max momentum by 1, so an active debility can push current momentum
	// above the new cap).
	function logDebility(data: CharacterData, label: string, active: boolean) {
		const name = data.name || 'Unnamed';
		appendLog(
			`${name} — Debilities`,
			`<div>${label}: <strong>${active ? 'Marked' : 'Cleared'}</strong></div>`,
		);
		const cap = maxMomentum(data);
		if (data.momentum > cap) data.momentum = cap;
	}

	// Stats are set when the character is made; a few path assets change one
	// by an ability (Battle-Scarred, Shadow-Kin, Lorekeeper, Oathbreaker), so
	// the Stats row's pen, after a warning that this is unusual, opens a
	// draft of them. The check then shows what changed and asks to apply it
	// (or discard it, or keep editing); applied changes are logged, as a
	// resource's are. Another character discards it.
	const STAT_TILES: { key: Stat; label: string; color: string; tooltip: string }[] = [
		{
			key: 'edge',
			label: 'Edge',
			color: 'var(--color-edge)',
			tooltip: 'Quickness, agility, and prowess in ranged combat',
		},
		{
			key: 'heart',
			label: 'Heart',
			color: 'var(--color-heart)',
			tooltip: 'Courage, willpower, empathy, sociability, and loyalty',
		},
		{
			key: 'iron',
			label: 'Iron',
			color: 'var(--color-iron)',
			tooltip: 'Physical strength, endurance, and prowess in close combat',
		},
		{
			key: 'shadow',
			label: 'Shadow',
			color: 'var(--color-shadow)',
			tooltip: 'Sneakiness, deceptiveness, and cunning',
		},
		{
			key: 'wits',
			label: 'Wits',
			color: 'var(--color-wits)',
			tooltip: 'Expertise, knowledge, and observation',
		},
	];
	/** A draft of the stats while one is edited, or null when they read out. */
	let statsDraft = $state<Record<Stat, number> | null>(null);
	/** The stat being edited: its tile is a field. */
	let editingStat = $state<Stat | null>(null);
	/** The stat a double-click asked to edit, while the warning is up. */
	let askedStat: Stat | null = null;
	let statsRowEl = $state<HTMLElement | null>(null);
	let statsDialogRef = $state<{ open(): void; close(): void } | null>(null);
	/** The double-click's warning: editing stats after creation is unusual. */
	let statsWarningRef = $state<{ open(): void; close(): void } | null>(null);
	/** How the stat tiles' tooltip says to edit one. */
	const statEditHint =
		typeof window !== 'undefined' && window.matchMedia?.('(hover: none)').matches
			? 'Double-tap to edit'
			: 'Double-click to edit';
	$effect(() => {
		void charId;
		statsDraft = null;
		editingStat = null;
	});
	/** What the draft changes, stat by stat. */
	const statChanges = $derived.by(() => {
		const draft = statsDraft;
		const data = cd;
		if (!draft) return [];
		return STAT_TILES.filter((t) => draft[t.key] !== data[t.key]).map((t) => ({
			key: t.key,
			label: t.label,
			old: data[t.key],
			next: draft[t.key],
		}));
	});
	/** The last click on a stat tile, to spot a double-click or double-tap. */
	let lastStatTap = { key: '', at: 0 };
	/** A double-click, or a double-tap (which iOS doesn't report as one), on
	 *  a stat warns, then opens it. */
	function onStatsClick(e: MouseEvent) {
		if (statsDraft) return;
		const key = (e.target as HTMLElement).closest<HTMLElement>('[data-stat]')?.dataset.stat;
		if (!key) return;
		const twice = e.detail === 2 || (lastStatTap.key === key && e.timeStamp - lastStatTap.at < 500);
		lastStatTap = twice ? { key: '', at: 0 } : { key, at: e.timeStamp };
		if (!twice) return;
		askedStat = key as Stat;
		statsWarningRef?.open();
	}
	/** Yes to the warning: a draft of the stats, with the asked one a field. */
	function openStatsDraft() {
		const data = cd;
		if (!askedStat) return;
		statsDraft = {
			edge: data.edge,
			heart: data.heart,
			iron: data.iron,
			shadow: data.shadow,
			wits: data.wits,
		};
		editingStat = askedStat;
		focusStatField();
	}
	/** Into the stat's field, once the dialog has closed and handed focus back. */
	function focusStatField() {
		setTimeout(() => {
			const field = statsRowEl?.querySelector<HTMLInputElement>('input');
			field?.focus();
			field?.select();
		}, 0);
	}
	function closeStatsDraft() {
		statsDraft = null;
		editingStat = null;
	}
	/** Leaving the field ends the edit, asking first if it changed the stat.
	 *  The window losing focus (another tab or app) keeps it open. */
	function onStatsFocusOut() {
		if (!statsDraft) return;
		setTimeout(() => {
			if (!statsDraft || !document.hasFocus()) return;
			if (statsRowEl?.contains(document.activeElement)) return;
			if (statChanges.length === 0) closeStatsDraft();
			else statsDialogRef?.open();
		}, 0);
	}
	/** In the field, Enter leaves it (asking to apply); Escape drops the edit. */
	function onStatsKeydown(e: KeyboardEvent) {
		if (!statsDraft) return;
		if (e.key === 'Enter') {
			e.preventDefault();
			(e.target as HTMLElement).blur();
		} else if (e.key === 'Escape') {
			e.preventDefault();
			e.stopPropagation();
			closeStatsDraft();
		}
	}
	/** Apply the draft to the character, log it, and read the stats out again. */
	function applyStatChanges() {
		const data = cd;
		const changes = statChanges;
		if (changes.length === 0) return;
		for (const c of changes) data[c.key] = c.next;
		appendLog(
			charTitle('Stats'),
			changes
				.map((c) => {
					const delta = c.next - c.old;
					return `<div>${c.label}: ${c.old} → <strong>${c.next}</strong> (${delta > 0 ? '+' : '−'}${Math.abs(delta)})</div>`;
				})
				.join(''),
		);
		closeStatsDraft();
	}
</script>

<!-- Initiative — None / Foe / Character. Mirrors V1's
     cs-init-section. Stored on data.initiative
     (0 = none, 1 = character, 2 = foe). -->
<div class="ca-init-section" data-tour="char-initiative">
	<span class="ca-init-label">Initiative</span>
	<SegmentedRadio
		ariaLabel="Initiative"
		labels="always"
		value={(cd.initiative as number) ?? 0}
		onchange={(v) => (cd.initiative = v)}
		options={[
			{ value: 0, text: 'None', label: 'No initiative', tone: 'neutral' },
			{
				value: 2,
				icon: shieldSvg,
				text: 'Foe',
				label: 'Foe has initiative',
				tone: 'stop',
			},
			{
				value: 1,
				icon: swordSvg,
				text: 'Character',
				label: 'You have initiative',
				tone: 'go',
			},
		]}
	/>
</div>

<!-- Stats — same StatControl tiles as v1, with the same color vars and stat-icon mapping.
     Wrapped with a vertical "STATS" side label on the LHS (V1 stats-row-wrapper pattern). -->
<div class="ca-stats-wrapper" data-tour="char-stats">
	<div class="ca-side-label">Stats</div>
	<!-- Stats are set in the New Character dialog; here they read out
	     only, unless a double-click (or double-tap) on one opens it
	     for an asset ability that changes it. Leaving the field asks
	     to apply the change. -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="ca-stats-row"
		bind:this={statsRowEl}
		onclick={onStatsClick}
		onkeydown={onStatsKeydown}
		onfocusout={onStatsFocusOut}
	>
		{#each STAT_TILES as t (t.key)}
			<div class="ca-stat" data-stat={t.key}>
				{#if statsDraft && editingStat === t.key}
					<StatControl
						label={t.label}
						bind:value={statsDraft[t.key]}
						color={t.color}
						min={STAT_MIN}
						max={STAT_MAX}
						tooltip={t.tooltip}
					/>
				{:else}
					<StatControl
						label={t.label}
						value={cd[t.key]}
						color={t.color}
						readonly
						tooltip={statsDraft ? t.tooltip : `${t.tooltip}. ${statEditHint}.`}
					/>
				{/if}
			</div>
		{/each}
	</div>
</div>

<!-- Vitals — Momentum + Health/Spirit/Supply + Experience. Spinners on every tile;
     ResourceTile carries its own +/− buttons. XP lives here per the v2 layout
     so it sits with the other tracked resources. Wrapped with a vertical
     "VITALS" side label on the LHS (V1 vitals-row-wrapper pattern). -->
<div class="ca-vitals-wrapper" data-tour="char-vitals">
	<div class="ca-side-label">Vitals</div>
	<div class="ca-vitals-row">
		<MomentumTile
			bind:value={cd.momentum}
			resetVal={momentumReset(cd)}
			maxVal={maxMomentum(cd)}
			tooltipText="Your overall advantage or disadvantage on the quest. Build it up through good rolls and smart choices, then burn it at a crucial moment to force a better outcome."
			onreset={onmomentumreset}
		/>
		<ResourceTile
			label="Health"
			bind:value={cd.health}
			color="var(--color-health)"
			max={5}
			icon={iconHealth}
			tooltip="Physical condition and readiness"
		/>
		<ResourceTile
			label="Spirit"
			bind:value={cd.spirit}
			color="var(--color-spirit)"
			max={5}
			icon={iconSpirit}
			tooltip="Mental fortitude and morale"
		/>
		<ResourceTile
			label="Supply"
			bind:value={cd.supply}
			color="var(--color-supply)"
			max={5}
			icon={iconSupply}
			tooltip="Available provisions and resources"
			onchange={(_old, next) => setPartySupply(next)}
		/>
		<ResourceTile
			label="Experience"
			bind:value={cd.xp}
			color="var(--color-xp)"
			max={30}
			icon={iconStar}
			tooltip="Accumulated experience that can be spent on assets and other enhancements."
		/>
	</div>
</div>

<!-- Debilities — Conditions / Banes / Burdens. -->
<div class="ca-debilities-wrapper" data-tour="char-debilities">
	<div class="ca-side-label">Debilities</div>
	<div class="ca-debilities-body">
		<DebilitiesSection data={cd} onchange={(label, active) => logDebility(cd, label, active)} />
	</div>
</div>

<!-- Bonds & Failures — progress tracks with ± spinners; the note
     button at the end of each opens its notes (Bonds Formed,
     Lessons Learned) in a dialog. -->
<div class="ca-tracks-wrapper" data-tour="char-tracks">
	<div class="ca-side-label">Tracks</div>
	<div class="ca-tracks-row">
		<ProgressTrackPanel label="Bonds" bind:value={cd.bonds}>
			{#snippet trailing()}
				{@render trackNotesButton(
					'Bonds Formed',
					cd.bondsFormed,
					() => bondsNotesRef?.open(cd.bondsFormed ?? ''),
					'char-bonds-notes',
				)}
			{/snippet}
		</ProgressTrackPanel>
		{#if isSourceEnabled('delve')}
			<ProgressTrackPanel label="Failures" bind:value={cd.failures}>
				{#snippet trailing()}
					{@render trackNotesButton(
						'Lessons Learned',
						cd.lessonsLearned,
						() => lessonsNotesRef?.open(cd.lessonsLearned ?? ''),
						'char-failures-notes',
					)}
				{/snippet}
			</ProgressTrackPanel>
		{/if}
	</div>
</div>

<!-- The note button at the end of the Bonds and Failures tracks; lit when
     the track has notes. -->
{#snippet trackNotesButton(
	label: string,
	notes: string | undefined,
	onopen: () => void,
	tour: string,
)}
	{@const has = !!notes?.trim()}
	<button
		class="ca-track-note-btn"
		class:ca-track-note-btn--has={has}
		type="button"
		onclick={onopen}
		use:tooltip={has ? label : `${label}: none yet`}
		aria-label={label}
		data-tour={tour}>{@html iconNote}</button
	>
{/snippet}

<TrackNotesDialog
	bind:this={bondsNotesRef}
	title="Bonds Formed"
	placeholder="Note significant bonds — people, communities, places…"
	onsave={(v) => (cd.bondsFormed = v)}
/>
<TrackNotesDialog
	bind:this={lessonsNotesRef}
	title="Lessons Learned"
	placeholder="What has this character learned from their failures…"
	onsave={(v) => (cd.lessonsLearned = v)}
/>

<!-- A double-click on a stat: stats are set at creation, so editing one is
     unusual. -->
<ConfirmDialog
	bind:this={statsWarningRef}
	title="Edit Stats"
	confirmLabel="Yes"
	confirmClass="btn-primary"
	cancelLabel="No"
	onconfirm={openStatsDraft}
	tour="stats-warning"
>
	<p>
		Editing your stats post character creation is an unusual event (some assets allow this).
		Proceed?
	</p>
</ConfirmDialog>

<!-- A changed stat, on leaving its field: apply it, discard it, or (Cancel,
     ✕) go back to editing. -->
<ConfirmDialog
	bind:this={statsDialogRef}
	title="Change Stats"
	confirmLabel="Apply"
	confirmClass="btn-primary"
	cancelLabel="Cancel"
	alternateLabel="Discard"
	accentColor="var(--text-accent)"
	onconfirm={applyStatChanges}
	onalternate={closeStatsDraft}
	oncancel={focusStatField}
	tour="stats-dialog"
>
	<p>Change {cd.name || 'this character'}'s stats?</p>
	<ul class="ca-stat-changes">
		{#each statChanges as c (c.key)}
			<li>{c.label}: {c.old} → <strong>{c.next}</strong></li>
		{/each}
	</ul>
</ConfirmDialog>

<style>
	/* Initiative widget — mirrors V1 .cs-init-section: small toggle group
	   with three pill buttons (None / Foe / Character). */
	.ca-init-section {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.ca-init-label {
		font-family: var(--font-ui);
		font-size: 0.7rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--text-dimmer);
	}
	/* The initiative toggle now uses the shared <SegmentedRadio> (labels="always",
	   tones none→neutral / foe→stop / character→go), which carries these styles. */

	/* Stats / Vitals wrappers — wrap each row with a vertical "STATS" /
	   "VITALS" side label on the left, V1-style with a separator. Upper
	   border separates the section from whatever is above (initiative for
	   stats, stats for vitals). */
	.ca-stats-wrapper,
	.ca-vitals-wrapper,
	.ca-debilities-wrapper,
	.ca-tracks-wrapper {
		display: flex;
		align-items: stretch;
		gap: 8px;
		border-top: 1px solid var(--border);
		padding-top: 8px;
	}
	.ca-side-label {
		writing-mode: vertical-rl;
		transform: rotate(180deg);
		font-family: var(--font-ui);
		font-size: 0.55rem;
		font-weight: 800;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--text-dimmer);
		flex-shrink: 0;
		align-self: stretch;
		display: flex;
		align-items: center;
		justify-content: center;
		/* The element is rotated 180° (writing-mode + transform), so a CSS
		   `border-left` shows up on the visual RIGHT of the label — between
		   the label text and the chits to its right. */
		border-left: 1px solid var(--border);
		padding-left: 6px;
		padding-right: 2px;
	}

	/* Chit rows: fixed-width chits packed against the left. */
	.ca-stats-row {
		display: flex;
		justify-content: flex-start;
		align-items: stretch;
		gap: 8px;
		flex-wrap: wrap;
		flex: 1;
	}
	/* Each tile's wrapper only names its stat (for the double-click), so it
	   adds no box: the tiles stay the row's flex items. */
	.ca-stat {
		display: contents;
	}
	.ca-stats-row :global(.stat-tile) {
		flex: 0 0 auto;
		/* Both taps of a double-tap land as clicks, with no zoom between. */
		touch-action: manipulation;
	}
	/* A double-click doesn't select the stat's name. Read-out tiles only:
	   Safari won't type into a field under user-select: none. */
	.ca-stats-row :global(.stat-tile:not(:has(input))) {
		user-select: none;
		-webkit-user-select: none;
	}
	/* A 375px phone: a slightly tighter gap keeps all five on one row. */
	@media (max-width: 389px) {
		.ca-stats-row {
			gap: 6px;
		}
	}
	/* The stats dialog's list of changes. */
	.ca-stat-changes {
		margin: 6px 0 0;
		padding-left: 18px;
		font-size: 0.85rem;
	}
	/* The stat being edited: outlined, so it reads as a field. */
	.ca-stats-row :global(.stat-tile:has(input)) {
		outline: 1px dashed var(--text-accent);
		outline-offset: 1px;
	}

	.ca-vitals-row {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-start;
		align-items: stretch;
		gap: 8px;
		flex: 1;
	}
	.ca-vitals-row > :global(*) {
		flex: 0 0 auto;
	}
	.ca-vitals-row > :global(.mt-tile) {
		width: 168px;
	}

	/* Debilities and Tracks: rows like Stats and Vitals, with a side label. */
	.ca-debilities-body {
		flex: 1;
		min-width: 0;
	}
	.ca-tracks-row {
		display: flex;
		flex-direction: column;
		gap: 10px;
		flex: 1;
		min-width: 0;
	}
	/* The note button at the end of a track, sized like its ± buttons; lit
	   when the track has notes. */
	.ca-track-note-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		height: 22px;
		padding: 0 6px;
		border: 1px solid var(--border-mid);
		border-radius: 3px;
		background: transparent;
		color: var(--text-dimmer);
		cursor: pointer;
		flex-shrink: 0;
		transition:
			background 0.12s,
			color 0.12s;
	}
	.ca-track-note-btn :global(svg) {
		width: 0.75rem;
		height: 0.75rem;
		fill: currentColor;
		display: block;
	}
	.ca-track-note-btn:hover {
		background: var(--bg-hover);
		color: var(--text);
	}
	.ca-track-note-btn--has {
		color: var(--text-accent);
		border-color: var(--text-accent);
	}
</style>
