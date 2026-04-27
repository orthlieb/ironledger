<script lang="ts">
	/**
	 * CommunityCard — collapsible card for a community/region.
	 *
	 * JourneyCard-style header with amber sidebar accent and portrait thumbnail.
	 * Oracle eye buttons open OraclesDialog directly at the relevant oracle.
	 * Markdown notes (click-to-edit).
	 */

	import type { Community } from '$lib/types.js';
	import { renderNote } from '$lib/markdown.js';
	import { untrack } from 'svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import { headingText } from '$lib/fontStore.svelte.js';

	import trashSvg  from '$icons/trash-solid-full.svg?raw';
	import hutSvg from '$icons/hut.svg?raw';

	// ---------------------------------------------------------------------------
	// Props
	// ---------------------------------------------------------------------------
	let {
		community,
		onChange,
		onDelete,
		focusName = false,
	}: {
		community:       Community;
		onChange:        (updated: Community) => void;
		onDelete:        () => void;
		focusName?:      boolean;
	} = $props();

	// ---------------------------------------------------------------------------
	// Local UI state
	// ---------------------------------------------------------------------------
	let collapsed       = $state(untrack(() => typeof window !== 'undefined' ? localStorage.getItem('il:community:collapse:' + community.id) === 'true' : false));
	$effect(() => { if (typeof window !== 'undefined') localStorage.setItem('il:community:collapse:' + community.id, String(collapsed)); });
	let deleteDialogRef = $state<{ open(): void; close(): void } | null>(null);
	let editingName     = $state(false);
	let nameInputEl     = $state<HTMLInputElement | null>(null);
	let nameBeforeEdit  = '';
	let editingNoteId   = $state<string | null>(null);
	let noteTextareaEl  = $state<HTMLTextAreaElement | null>(null);
	let portraitHovered   = $state(false);

	$effect(() => {
		if (editingNoteId && noteTextareaEl) noteTextareaEl.focus();
	});
	$effect(() => {
		if (editingName && nameInputEl) nameInputEl.select();
	});
	$effect(() => {
		if (focusName) { nameBeforeEdit = community.name; editingName = true; }
	});

	// ---------------------------------------------------------------------------
	// Derived
	// ---------------------------------------------------------------------------
	const displayName = $derived(community.name || 'Unnamed Community');

	// ---------------------------------------------------------------------------
	// Helpers
	// ---------------------------------------------------------------------------
	function update(patch: Partial<Community>) {
		onChange({ ...community, ...patch });
	}

	function startEditName() { nameBeforeEdit = community.name; editingName = true; }
	function commitName(v: string) { editingName = false; update({ name: v.trim() || 'Unnamed Community' }); }
	function cancelName() { editingName = false; update({ name: nameBeforeEdit }); }

	// ---------------------------------------------------------------------------
	// Portrait upload (centre-crop to 256 px JPEG, same as CharacterSheet)
	// ---------------------------------------------------------------------------
	function handlePortrait(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = () => {
			const img = new Image();
			img.onload = () => {
				const canvas = document.createElement('canvas');
				const size = Math.min(img.width, img.height, 256);
				canvas.width  = size;
				canvas.height = size;
				const ctx = canvas.getContext('2d')!;
				const side = Math.min(img.width, img.height);
				const sx   = (img.width  - side) / 2;
				const sy   = (img.height - side) / 2;
				ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
				update({ imageUrl: canvas.toDataURL('image/jpeg', 0.85) });
			};
			img.src = reader.result as string;
		};
		reader.readAsDataURL(file);
	}
</script>

<!-- ── Card ──────────────────────────────────────────────────────────────── -->
<div class="cc-card" class:cc-collapsed={collapsed} style="border-left: 3px solid #E8A13B">

	<!-- ── Header ── -->
	<div class="cc-header">

		<!-- Collapse (leftmost) -->
		<button
			class="cc-collapse-btn"
			onclick={() => (collapsed = !collapsed)}
			aria-label={collapsed ? 'Expand' : 'Collapse'}
		>{collapsed ? '▶' : '▼'}</button>

		<!-- Portrait -->
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<label
			class="cc-portrait-label"
			title="Click to change portrait"
			onmouseenter={() => (portraitHovered = true)}
			onmouseleave={() => (portraitHovered = false)}
		>
			{#if community.imageUrl}
				<img src={community.imageUrl} alt="Portrait of {displayName}" class="cc-portrait-img" />
			{:else}
				<div class="cc-portrait-placeholder">{@html hutSvg}</div>
			{/if}
			<input
				type="file"
				accept="image/*"
				class="cc-portrait-input"
				aria-label="Upload portrait"
				onchange={handlePortrait}
			/>
		</label>

		<!-- Name (click to edit) -->
		{#if editingName}
			<input
				bind:this={nameInputEl}
				class="cc-name-input"
				type="text"
				value={community.name}
				placeholder="Community name…"
				onblur={(e) => commitName((e.target as HTMLInputElement).value)}
				onkeydown={(e) => {
					if (e.key === 'Enter')  { commitName((e.target as HTMLInputElement).value); }
					if (e.key === 'Escape') { cancelName(); }
				}}
			/>
		{:else}
			<!-- svelte-ignore a11y_interactive_supports_focus -->
			<span
				class="cc-name"
				role="button"
				onclick={startEditName}
				onkeydown={(e) => e.key === 'Enter' && startEditName()}
				title="Click to rename"
			>{headingText(displayName)}</span>
		{/if}

		<!-- Delete -->
		<button
			class="btn btn-icon cc-del-btn"
			onclick={() => deleteDialogRef?.open()}
			title="Delete community"
			aria-label="Delete community"
		>{@html trashSvg}</button>

	</div>

	<!-- Lightbox (portrait hover) -->
	{#if portraitHovered && community.imageUrl}
		<div class="cc-portrait-lightbox" aria-hidden="true">
			<img src={community.imageUrl} alt="Portrait of {displayName}" />
		</div>
	{/if}

	<!-- ── Body ── -->
	{#if !collapsed}
		<div class="cc-body">

			<!-- Region -->
			<div class="cc-field-row">
				<label class="cc-label" for="cc-region-{community.id}">Region</label>
				<input
					id="cc-region-{community.id}"
					class="cc-input"
					type="text"
					value={community.region}
					oninput={(e) => update({ region: (e.target as HTMLInputElement).value })}
					placeholder="Region…"
				/>
			</div>

			<!-- Location -->
			<div class="cc-field-row">
				<label class="cc-label" for="cc-location-{community.id}">Location</label>
				<input
					id="cc-location-{community.id}"
					class="cc-input"
					type="text"
					value={community.location}
					oninput={(e) => update({ location: (e.target as HTMLInputElement).value })}
					placeholder="Location…"
				/>
			</div>

			<!-- Location description -->
			<div class="cc-field-row">
				<label class="cc-label" for="cc-locdesc-{community.id}">Description</label>
				<input
					id="cc-locdesc-{community.id}"
					class="cc-input"
					type="text"
					value={community.locationDescription}
					oninput={(e) => update({ locationDescription: (e.target as HTMLInputElement).value })}
					placeholder="Location description…"
				/>
			</div>

			<!-- Trouble -->
			<div class="cc-field-row">
				<label class="cc-label" for="cc-trouble-{community.id}">Trouble</label>
				<input
					id="cc-trouble-{community.id}"
					class="cc-input"
					type="text"
					value={community.trouble}
					oninput={(e) => update({ trouble: (e.target as HTMLInputElement).value })}
					placeholder="Settlement trouble…"
				/>
			</div>

			<!-- Notes (markdown, click-to-edit) -->
			<div class="cc-field-row cc-field-row--full">
				<span class="cc-label">Notes</span>
				{#if editingNoteId === 'community'}
					<textarea
						bind:this={noteTextareaEl}
						class="cc-textarea"
						value={community.notes}
						oninput={(e) => update({ notes: (e.target as HTMLTextAreaElement).value })}
						onblur={() => (editingNoteId = null)}
						placeholder="Notes… (**bold**, *italic*, # heading, - list)"
						rows="3"
					></textarea>
				{:else}
					<!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
					<div
						class="cc-note-display"
						class:cc-note-display--empty={!community.notes?.trim()}
						role="button"
						tabindex="0"
						title="Click to edit"
						onclick={() => (editingNoteId = 'community')}
						onkeydown={(e) => { if (e.key === 'Enter') editingNoteId = 'community'; }}
					>
						{#if community.notes?.trim()}
							{@html renderNote(community.notes)}
						{:else}
							<span class="cc-note-placeholder">Notes… (**bold**, *italic*, # heading, - list)</span>
						{/if}
					</div>
				{/if}
			</div>

		</div>
	{/if}

</div>

<!-- Delete confirmation dialog -->
<ConfirmDialog
	bind:this={deleteDialogRef}
	title="Delete Community"
	confirmLabel="Delete"
	accentColor="var(--color-danger)"
	onconfirm={onDelete}
>
	<p style="font-family: var(--font-ui); font-size: 0.8rem; color: var(--text-muted); margin: 0 0 12px;">
		Delete <strong>{displayName}</strong>? This cannot be undone.
	</p>
</ConfirmDialog>

<style>
	/* ── Card shell ─────────────────────────────────────────────────────── */
	.cc-card {
		border:        1px solid var(--border);
		border-radius: 5px;
		background:    var(--bg-card);
		overflow:      hidden;
		box-shadow:    inset 0 1px 0 #ffffff04, 0 2px 12px #00000050;
		position:      relative;
	}

	/* Remove header divider when collapsed */
	.cc-card.cc-collapsed .cc-header {
		border-bottom: none;
	}

	/* ── Header ─────────────────────────────────────────────────────────── */
	.cc-header {
		position:      relative;
		display:       flex;
		align-items:   center;
		gap:           8px;
		padding:       8px 12px;
		min-height:    55px;
		background:    var(--bg-inset);
		border-bottom: 1px solid var(--border);
	}

	/* ── Portrait ───────────────────────────────────────────────────────── */
	.cc-portrait-label {
		width:           38px;
		height:          38px;
		border-radius:   50%;
		flex-shrink:     0;
		cursor:          pointer;
		display:         flex;
		align-items:     center;
		justify-content: center;
		transition:      opacity 0.15s;
	}
	.cc-portrait-label:has(.cc-portrait-img) {
		overflow: hidden;
		border:   1px solid var(--border-mid);
	}
	.cc-portrait-label:hover { opacity: 0.85; }

	.cc-portrait-img {
		width:      100%;
		height:     100%;
		object-fit: cover;
		display:    block;
	}

	.cc-portrait-placeholder {
		width:           38px;
		height:          38px;
		border-radius:   50%;
		border:          1px dashed var(--border-mid);
		display:         flex;
		align-items:     center;
		justify-content: center;
		color:           var(--text-dimmer);
		background:      var(--bg-control);
		user-select:     none;
		flex-shrink:     0;
	}
	.cc-portrait-placeholder :global(svg) {
		width:  20px;
		height: 20px;
		fill:   currentColor;
		opacity: 0.5;
	}

	.cc-portrait-input { display: none; }

	/* ── Lightbox ───────────────────────────────────────────────────────── */
	.cc-portrait-lightbox {
		position:       absolute;
		top:            60px;
		left:           10px;
		z-index:        100;
		border-radius:  6px;
		overflow:       hidden;
		box-shadow:     0 8px 32px rgba(0,0,0,0.7);
		border:         1px solid var(--border);
		pointer-events: none;
	}
	.cc-portrait-lightbox img {
		display:    block;
		width:      160px;
		height:     160px;
		object-fit: cover;
	}

	/* ── Collapse btn ───────────────────────────────────────────────────── */
	.cc-collapse-btn {
		background:  none;
		border:      none;
		cursor:      pointer;
		color:       var(--text-dimmer);
		font-size:   0.65rem;
		padding:     2px 4px;
		flex-shrink: 0;
	}

	/* ── Name ───────────────────────────────────────────────────────────── */
	.cc-name {
		flex:          1;
		font-family:   var(--font-display);
		font-size:     calc(0.88rem * var(--font-display-scale));
		font-weight:   700;
		letter-spacing: 0.04em;
		cursor:        text;
		min-width:     0;
		overflow:      hidden;
		text-overflow: ellipsis;
		white-space:   nowrap;
	}

	.cc-name-input {
		flex:          1;
		font-family:   var(--font-display);
		font-weight:   700;
		font-size:     calc(0.88rem * var(--font-display-scale));
		letter-spacing: 0.04em;
		background:    var(--bg-input);
		border:        1px solid #E8A13B;
		border-radius: 4px;
		padding:       2px 6px;
		color:         var(--text);
		min-width:     0;
		outline:       none;
	}

	/* ── Delete btn ─────────────────────────────────────────────────────── */
	.cc-del-btn {
		width:       26px;
		height:      26px;
		padding:     4px;
		margin-left: auto;
		flex-shrink: 0;
	}
	.cc-del-btn :global(svg) {
		width:  13px;
		height: 13px;
		fill:   currentColor;
	}

	/* ── Body ───────────────────────────────────────────────────────────── */
	.cc-body {
		padding:        0.75rem var(--page-gutter, 14px) 1rem;
		display:        flex;
		flex-direction: column;
		gap:            0.55rem;
	}

	/* ── Field rows ─────────────────────────────────────────────────────── */
	.cc-field-row {
		display:     flex;
		align-items: center;
		gap:         8px;
	}
	.cc-field-row--full { align-items: flex-start; }

	.cc-label {
		font-family:    var(--font-ui);
		font-size:      0.65rem;
		font-weight:    600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color:          var(--text-dimmer);
		white-space:    nowrap;
		width:          76px;
		flex-shrink:    0;
	}

	.cc-input {
		flex:          1;
		font-family:   var(--font-ui);
		font-size:     0.75rem;
		background:    var(--input-bg);
		border:        1px solid var(--border);
		border-radius: 4px;
		color:         var(--text);
		padding:       3px 7px;
		outline:       none;
		min-width:     0;
	}
	.cc-input:focus { border-color: #E8A13B; }

	.cc-textarea {
		flex:          1;
		font-family:   var(--font-ui);
		font-size:     0.75rem;
		background:    var(--input-bg);
		border:        1px solid var(--border);
		border-radius: 4px;
		color:         var(--text);
		padding:       4px 7px;
		outline:       none;
		resize:        vertical;
		min-height:    54px;
		width:         100%;
	}
	.cc-textarea:focus { border-color: #E8A13B; }

	/* ── Markdown note display ───────────────────────────────────────────── */
	.cc-note-display {
		flex:          1;
		font-family:   var(--font-ui);
		font-size:     0.75rem;
		line-height:   1.55;
		background:    var(--input-bg);
		border:        1px solid var(--border);
		border-radius: 4px;
		color:         var(--text);
		padding:       4px 7px;
		cursor:        text;
		min-height:    54px;
		width:         100%;
		transition:    border-color 0.12s;
	}
	.cc-note-display:hover,
	.cc-note-display:focus { border-color: var(--border-mid); outline: none; }
	.cc-note-display--empty { min-height: 32px; }

	.cc-note-placeholder {
		font-style: italic;
		color:      var(--text-dimmer);
	}

	.cc-note-display :global(p)            { margin: 0 0 2px; }
	.cc-note-display :global(p:last-child) { margin-bottom: 0; }
	.cc-note-display :global(h3),
	.cc-note-display :global(h4),
	.cc-note-display :global(h5) {
		font-size:      0.73rem;
		font-weight:    700;
		letter-spacing: 0.04em;
		color:          var(--text-accent);
		margin:         4px 0 1px;
	}
	.cc-note-display :global(ul),
	.cc-note-display :global(ol)  { margin: 1px 0; padding-left: 1.2em; }
	.cc-note-display :global(li)  { margin-bottom: 1px; }
	.cc-note-display :global(strong) { font-weight: 700; color: var(--text); }
	.cc-note-display :global(br)  { display: block; margin-bottom: 2px; content: ''; }

</style>
