<script lang="ts">
	/**
	 * An expedition's Description tab (a journey's or a site's; scenes have
	 * none): a site's Objective at the top, then the Summary (its
	 * `shortDescription`, shown in its map marker's card) and the detailed
	 * description. The portrait floats right and the prose wraps around it;
	 * while the description is edited the portrait hides and the editor fills
	 * the panel.
	 *
	 * `onupdate` patches the expedition (ExpeditionsArea saves it).
	 */
	import MarkdownNotes from '#lib/components/MarkdownNotes.svelte';
	import PortraitUploader from '#lib/components/PortraitUploader.svelte';
	import type { Expedition, Site } from '#lib/types.js';

	let {
		exp,
		placeholderSvg,
		editingNotes = $bindable(false),
		editingShortDesc = $bindable(false),
		onupdate,
	}: {
		/** The live expedition. */
		exp: Expedition;
		/** The portrait's stand-in: the expedition kind's glyph. */
		placeholderSvg: string;
		/** The detailed description is being edited. */
		editingNotes?: boolean;
		/** The summary is being edited. */
		editingShortDesc?: boolean;
		onupdate: (patch: Partial<Expedition>) => void;
	} = $props();

	const site = $derived(exp.type === 'site' ? (exp as Site) : null);
</script>

{#if site}
	<div class="ea-field-row ea-objective-row">
		<label class="ea-field-label" for="ea-obj-{site.id}">Objective</label>
		<input
			id="ea-obj-{site.id}"
			class="ea-input"
			type="text"
			placeholder="What are you seeking here?"
			value={site.objective}
			oninput={(e) => onupdate({ objective: (e.target as HTMLInputElement).value })}
		/>
	</div>
{/if}
{#if !editingNotes}
	<div class="ea-short-desc">
		<span class="ea-field-label">Summary</span>
		<MarkdownNotes
			bind:editing={editingShortDesc}
			value={exp.shortDescription ?? ''}
			oninput={(v) => onupdate({ shortDescription: v })}
			placeholder="A line or two, shown when its map marker is selected…"
			rows={3}
		/>
	</div>
{/if}
<!-- Above the section, so the floated portrait starts below it rather than
     covering it. -->
<span class="ea-field-label ea-detail-label">Detailed description</span>
<div class="ea-desc-section" class:ea-desc-section--editing={editingNotes}>
	{#if !editingNotes}
		<PortraitUploader
			endpoint={`/api/session/expeditions/${exp.id}/portrait`}
			etag={exp.portraitEtag ?? ''}
			oninput={(etag) => onupdate({ portraitEtag: etag })}
			{placeholderSvg}
			alt={exp.name}
		/>
	{/if}

	<MarkdownNotes
		bind:editing={editingNotes}
		value={exp.notes ?? ''}
		oninput={(v) => onupdate({ notes: v })}
		placeholder={site
			? 'Discoveries, encounters, observations…'
			: 'Waypoints, landmarks, perils encountered…'}
		rows={6}
	/>
</div>

<style>
	.ea-short-desc {
		display: flex;
		flex-direction: column;
		gap: 4px;
		margin-bottom: 12px;
	}
	.ea-detail-label {
		display: block;
		margin-bottom: 4px;
		white-space: nowrap;
	}
	/* flow-root holds the right-floated portrait; MarkdownNotes takes normal
	   block flow so the prose wraps around it (it's a flex column otherwise,
	   its own block formatting context). */
	.ea-desc-section {
		display: flow-root;
	}
	.ea-desc-section :global(.md-notes) {
		display: block;
	}
	/* While editing, the portrait is hidden: the editor fills the card. */
	.ea-desc-section--editing {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
	}
	.ea-desc-section--editing :global(.md-notes) {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
	}
	.ea-desc-section--editing :global(.md-notes-input) {
		flex: 1;
		min-height: 0;
	}
</style>
