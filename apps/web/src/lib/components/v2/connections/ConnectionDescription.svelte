<script lang="ts">
	/**
	 * A connection's second tab: "Description" for a settlement or landmark,
	 * "Background" for an NPC. A settlement or landmark has a Summary (its
	 * `shortDescription`, shown in its map marker's card) above the detailed
	 * description; an NPC has the one field. The portrait floats right and
	 * the prose wraps around it; while the description is edited the portrait
	 * hides and the editor fills the panel.
	 *
	 * `onupdate` patches the entry (CommunitiesArea writes and saves it).
	 */
	import MarkdownNotes from '#lib/components/MarkdownNotes.svelte';
	import PortraitUploader from '#lib/components/PortraitUploader.svelte';
	import { ENTITY_KIND_META } from '#lib/entityKinds.js';
	import type { Community, Npc, Place } from '#lib/types.js';
	import type { EntryKind } from './connections.js';

	let {
		kind,
		data,
		editingNotes = $bindable(false),
		editingShortDesc = $bindable(false),
		onupdate,
	}: {
		kind: EntryKind;
		/** The live entry. */
		data: Community | Npc | Place;
		/** The detailed description is being edited. */
		editingNotes?: boolean;
		/** The summary is being edited. */
		editingShortDesc?: boolean;
		onupdate: (patch: Partial<Community & Npc & Place>) => void;
	} = $props();

	const endpoint = $derived(
		`/api/session/${kind === 'npc' ? 'npcs' : kind === 'place' ? 'places' : 'communities'}/${data.id}/portrait`,
	);
	const shortDescription = $derived(
		kind === 'npc' ? '' : (data as Community | Place).shortDescription,
	);
</script>

{#if kind !== 'npc' && !editingNotes}
	<div class="cm-short-desc">
		<span class="cm-field-label">Summary</span>
		<MarkdownNotes
			bind:editing={editingShortDesc}
			value={shortDescription ?? ''}
			oninput={(v) => onupdate({ shortDescription: v })}
			placeholder="A line or two, shown when its map marker is selected…"
			rows={3}
		/>
	</div>
{/if}
{#if kind !== 'npc'}
	<!-- Above the section, so the floated portrait starts below it rather than
	     covering it. -->
	<span class="cm-field-label cm-detail-label">Detailed description</span>
{/if}
<div class="cm-notes-section" class:cm-notes-section--editing={editingNotes}>
	{#if !editingNotes}
		<PortraitUploader
			{endpoint}
			etag={data.portraitEtag ?? ''}
			oninput={(etag) => onupdate({ portraitEtag: etag })}
			placeholderSvg={ENTITY_KIND_META[kind].icon}
			alt={data.name}
		/>
	{/if}

	<MarkdownNotes
		bind:editing={editingNotes}
		value={data.notes ?? ''}
		oninput={(v) => onupdate({ notes: v })}
		placeholder={kind === 'npc'
			? 'Origin, upbringing, major traits…'
			: kind === 'place'
				? 'Physical features, atmosphere, notable details…'
				: 'Description of this community…'}
		rows={6}
	/>
</div>

<style>
	.cm-short-desc {
		display: flex;
		flex-direction: column;
		gap: 4px;
		margin-bottom: 12px;
	}
	.cm-detail-label {
		display: block;
		margin-bottom: 4px;
		white-space: nowrap;
	}
	.cm-notes-section {
		/* flow-root holds the right-floated portrait, so the section grows to
		   contain it even when the prose is short. */
		display: flow-root;
	}
	/* Let the prose wrap around the floated portrait: MarkdownNotes is a flex
	   column (its own block formatting context, which would sit beside the
	   float), so give it normal block flow here. */
	.cm-notes-section :global(.md-notes) {
		display: block;
	}
	/* While editing, the portrait is hidden: the editor fills the card. */
	.cm-notes-section--editing {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
	}
	.cm-notes-section--editing :global(.md-notes) {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
	}
	.cm-notes-section--editing :global(.md-notes-input) {
		flex: 1;
		min-height: 0;
	}
</style>
