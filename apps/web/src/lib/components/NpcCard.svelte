<script lang="ts">
	/**
	 * NpcCard — collapsible card for a standalone NPC.
	 *
	 * JourneyCard-style header with purple sidebar accent.
	 * Portrait thumbnail (click to upload, hover to lightbox).
	 * Oracle eye buttons open OraclesDialog directly at the relevant oracle.
	 * Markdown notes (click-to-edit).
	 */

	import type { Npc, NpcRelationship } from '$lib/types.js';
	import { renderNote } from '$lib/markdown.js';
	import { untrack } from 'svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import { headingText } from '$lib/fontStore.svelte.js';

	import trashSvg  from '$icons/trash-solid-full.svg?raw';
	import farmerSvg from '$icons/farmer.svg?raw';

	// ---------------------------------------------------------------------------
	// Props
	// ---------------------------------------------------------------------------
	let {
		npc,
		onChange,
		onDelete,
		focusName = false,
	}: {
		npc:             Npc;
		onChange:        (updated: Npc) => void;
		onDelete:        () => void;
		focusName?:      boolean;
	} = $props();

	// ---------------------------------------------------------------------------
	// Local UI state
	// ---------------------------------------------------------------------------
	let collapsed         = $state(untrack(() => typeof window !== 'undefined' ? localStorage.getItem('il:npc:collapse:' + npc.id) === 'true' : false));
	$effect(() => { if (typeof window !== 'undefined') localStorage.setItem('il:npc:collapse:' + npc.id, String(collapsed)); });
	let deleteDialogRef   = $state<{ open(): void; close(): void } | null>(null);
	let editingName       = $state(false);
	let nameInputEl       = $state<HTMLInputElement | null>(null);
	let nameBeforeEdit    = '';
	let editingNoteId     = $state<string | null>(null);
	let noteTextareaEl    = $state<HTMLTextAreaElement | null>(null);
	let portraitHovered   = $state(false);

	$effect(() => {
		if (editingNoteId && noteTextareaEl) noteTextareaEl.focus();
	});
	$effect(() => {
		if (editingName && nameInputEl) nameInputEl.select();
	});
	$effect(() => {
		if (focusName) { nameBeforeEdit = npc.name; editingName = true; }
	});

	// ---------------------------------------------------------------------------
	// Derived
	// ---------------------------------------------------------------------------
	const displayName = $derived(npc.name || 'Unnamed NPC');

	const RELATIONSHIPS: { value: NpcRelationship; label: string; color: string }[] = [
		{ value: 'neutral', label: 'Neutral', color: 'var(--text-muted)' },
		{ value: 'bond',    label: 'Bond',    color: '#34d399' },
		{ value: 'foe',     label: 'Foe',     color: '#ef4444' },
	];

	// ---------------------------------------------------------------------------
	// Helpers
	// ---------------------------------------------------------------------------
	function update(patch: Partial<Npc>) {
		onChange({ ...npc, ...patch });
	}

	function startEditName() { nameBeforeEdit = npc.name; editingName = true; }
	function commitName(v: string) { editingName = false; update({ name: v.trim() || 'Unnamed NPC' }); }
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
<div class="nc-card" class:nc-collapsed={collapsed} style="border-left: 3px solid #a78bfa">

	<!-- ── Header ── -->
	<div class="nc-header">

		<!-- Collapse (leftmost) -->
		<button
			class="nc-collapse-btn"
			onclick={() => (collapsed = !collapsed)}
			aria-label={collapsed ? 'Expand' : 'Collapse'}
		>{collapsed ? '▶' : '▼'}</button>

		<!-- Portrait -->
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<label
			class="nc-portrait-label"
			title="Click to change portrait"
			onmouseenter={() => (portraitHovered = true)}
			onmouseleave={() => (portraitHovered = false)}
		>
			{#if npc.imageUrl}
				<img src={npc.imageUrl} alt="Portrait of {displayName}" class="nc-portrait-img" />
			{:else}
				<div class="nc-portrait-placeholder">{@html farmerSvg}</div>
			{/if}
			<input
				type="file"
				accept="image/*"
				class="nc-portrait-input"
				aria-label="Upload portrait"
				onchange={handlePortrait}
			/>
		</label>

		<!-- Name (click to edit) -->
		{#if editingName}
			<input
				bind:this={nameInputEl}
				class="nc-name-input"
				type="text"
				value={npc.name}
				placeholder="NPC name…"
				onblur={(e) => commitName((e.target as HTMLInputElement).value)}
				onkeydown={(e) => {
					if (e.key === 'Enter')  { commitName((e.target as HTMLInputElement).value); }
					if (e.key === 'Escape') { cancelName(); }
				}}
			/>
		{:else}
			<!-- svelte-ignore a11y_interactive_supports_focus -->
			<span
				class="nc-name"
				role="button"
				onclick={startEditName}
				onkeydown={(e) => e.key === 'Enter' && startEditName()}
				title="Click to rename"
			>{headingText(displayName)}</span>
		{/if}

		<!-- Delete -->
		<button
			class="btn btn-icon nc-del-btn"
			onclick={() => deleteDialogRef?.open()}
			title="Delete NPC"
			aria-label="Delete NPC"
		>{@html trashSvg}</button>

	</div>

	<!-- Lightbox (portrait hover) -->
	{#if portraitHovered && npc.imageUrl}
		<div class="nc-portrait-lightbox" aria-hidden="true">
			<img src={npc.imageUrl} alt="Portrait of {displayName}" />
		</div>
	{/if}

	<!-- ── Body ── -->
	{#if !collapsed}
		<div class="nc-body">

			<!-- Role -->
			<div class="nc-field-row">
				<label class="nc-label" for="nc-role-{npc.id}">Role</label>
				<input
					id="nc-role-{npc.id}"
					class="nc-input"
					type="text"
					value={npc.role}
					oninput={(e) => update({ role: (e.target as HTMLInputElement).value })}
					placeholder="Role…"
				/>
			</div>

			<!-- Goal -->
			<div class="nc-field-row">
				<label class="nc-label" for="nc-goal-{npc.id}">Goal</label>
				<input
					id="nc-goal-{npc.id}"
					class="nc-input"
					type="text"
					value={npc.goal}
					oninput={(e) => update({ goal: (e.target as HTMLInputElement).value })}
					placeholder="Goal…"
				/>
			</div>

			<!-- Descriptor -->
			<div class="nc-field-row">
				<label class="nc-label" for="nc-descriptor-{npc.id}">Descriptor</label>
				<input
					id="nc-descriptor-{npc.id}"
					class="nc-input"
					type="text"
					value={npc.descriptor}
					oninput={(e) => update({ descriptor: (e.target as HTMLInputElement).value })}
					placeholder="Descriptor…"
				/>
			</div>

			<!-- Location -->
			<div class="nc-field-row">
				<label class="nc-label" for="nc-location-{npc.id}">Location</label>
				<input
					id="nc-location-{npc.id}"
					class="nc-input"
					type="text"
					value={npc.location}
					oninput={(e) => update({ location: (e.target as HTMLInputElement).value })}
					placeholder="Current location…"
				/>
			</div>

			<!-- Relationship pills -->
			<div class="nc-field-row nc-field-row--rel">
				<span class="nc-label">Relationship</span>
				<div class="nc-rel-group">
					{#each RELATIONSHIPS as rel}
						<button
							class="nc-rel-btn"
							class:nc-rel-btn--active={npc.relationship === rel.value}
							style={npc.relationship === rel.value
								? `color: ${rel.color}; border-color: ${rel.color}; background: color-mix(in srgb, ${rel.color} 12%, transparent)`
								: ''}
							onclick={() => update({ relationship: rel.value })}
						>{rel.label}</button>
					{/each}
				</div>
			</div>

			<!-- Notes (markdown, click-to-edit) -->
			<div class="nc-field-row nc-field-row--full">
				<span class="nc-label">Notes</span>
				{#if editingNoteId === 'npc'}
					<textarea
						bind:this={noteTextareaEl}
						class="nc-textarea"
						value={npc.notes}
						oninput={(e) => update({ notes: (e.target as HTMLTextAreaElement).value })}
						onblur={() => (editingNoteId = null)}
						placeholder="Notes… (**bold**, *italic*, # heading, - list)"
						rows="3"
					></textarea>
				{:else}
					<!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
					<div
						class="nc-note-display"
						class:nc-note-display--empty={!npc.notes?.trim()}
						role="button"
						tabindex="0"
						title="Click to edit"
						onclick={() => (editingNoteId = 'npc')}
						onkeydown={(e) => { if (e.key === 'Enter') editingNoteId = 'npc'; }}
					>
						{#if npc.notes?.trim()}
							{@html renderNote(npc.notes)}
						{:else}
							<span class="nc-note-placeholder">Notes… (**bold**, *italic*, # heading, - list)</span>
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
	title="Delete NPC"
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
	.nc-card {
		border:        1px solid var(--border);
		border-radius: 5px;
		background:    var(--bg-card);
		overflow:      hidden;
		box-shadow:    inset 0 1px 0 #ffffff04, 0 2px 12px #00000050;
		position:      relative;
	}

	/* Remove header divider when collapsed */
	.nc-card.nc-collapsed .nc-header {
		border-bottom: none;
	}

	/* ── Header ─────────────────────────────────────────────────────────── */
	.nc-header {
		position:   relative;
		display:    flex;
		align-items: center;
		gap:        8px;
		padding:    8px 12px;
		min-height: 55px;
		background: var(--bg-inset);
		border-bottom: 1px solid var(--border);
	}

	/* ── Portrait ───────────────────────────────────────────────────────── */
	.nc-portrait-label {
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
	.nc-portrait-label:has(.nc-portrait-img) {
		overflow: hidden;
		border:   1px solid var(--border-mid);
	}
	.nc-portrait-label:hover { opacity: 0.85; }

	.nc-portrait-img {
		width:      100%;
		height:     100%;
		object-fit: cover;
		display:    block;
	}

	.nc-portrait-placeholder {
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
	.nc-portrait-placeholder :global(svg) {
		width:   20px;
		height:  20px;
		fill:    currentColor;
		opacity: 0.5;
	}

	.nc-portrait-input {
		display: none;
	}

	/* ── Lightbox ───────────────────────────────────────────────────────── */
	.nc-portrait-lightbox {
		position:      absolute;
		top:           60px;
		left:          10px;
		z-index:       100;
		border-radius: 6px;
		overflow:      hidden;
		box-shadow:    0 8px 32px rgba(0,0,0,0.7);
		border:        1px solid var(--border);
		pointer-events: none;
	}
	.nc-portrait-lightbox img {
		display:    block;
		width:      160px;
		height:     160px;
		object-fit: cover;
	}

	/* ── Collapse btn ───────────────────────────────────────────────────── */
	.nc-collapse-btn {
		background:  none;
		border:      none;
		cursor:      pointer;
		color:       var(--text-dimmer);
		font-size:   0.65rem;
		padding:     2px 4px;
		flex-shrink: 0;
	}

	/* ── Name ───────────────────────────────────────────────────────────── */
	.nc-name {
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
		padding:       2px 6px;
		border:        1px solid transparent;
		border-radius: 3px;
		transition:    background 0.12s, border-color 0.12s;
	}
	.nc-name:hover {
		background:   var(--bg-hover);
		border-color: var(--border);
	}

	.nc-name-input {
		flex:          1;
		font-family:   var(--font-display);
		font-weight:   700;
		font-size:     calc(0.88rem * var(--font-display-scale));
		letter-spacing: 0.04em;
		background:    var(--bg-input);
		border:        1px solid #a78bfa;
		border-radius: 4px;
		padding:       2px 6px;
		color:         var(--text);
		min-width:     0;
		outline:       none;
	}

	/* ── Delete btn ─────────────────────────────────────────────────────── */
	.nc-del-btn {
		width:       26px;
		height:      26px;
		padding:     4px;
		margin-left: auto;
		flex-shrink: 0;
	}
	.nc-del-btn :global(svg) {
		width:  13px;
		height: 13px;
		fill:   currentColor;
	}

	/* ── Body ───────────────────────────────────────────────────────────── */
	.nc-body {
		padding:        0.75rem var(--page-gutter, 14px) 1rem;
		display:        flex;
		flex-direction: column;
		gap:            0.55rem;
	}

	/* ── Field rows ─────────────────────────────────────────────────────── */
	.nc-field-row {
		display:     flex;
		align-items: center;
		gap:         8px;
	}
	.nc-field-row--full { align-items: flex-start; }
	.nc-field-row--rel  { align-items: center; }

	.nc-label {
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

	.nc-input {
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
	.nc-input:focus { border-color: #a78bfa; }

	.nc-textarea {
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
	.nc-textarea:focus { border-color: #a78bfa; }

	/* ── Markdown note display ───────────────────────────────────────────── */
	.nc-note-display {
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
	.nc-note-display:hover,
	.nc-note-display:focus { border-color: var(--border-mid); outline: none; }
	.nc-note-display--empty { min-height: 32px; }

	.nc-note-placeholder {
		font-style: italic;
		color:      var(--text-dimmer);
	}

	.nc-note-display :global(p)            { margin: 0 0 2px; }
	.nc-note-display :global(p:last-child) { margin-bottom: 0; }
	.nc-note-display :global(h3),
	.nc-note-display :global(h4),
	.nc-note-display :global(h5) {
		font-size:      0.73rem;
		font-weight:    700;
		letter-spacing: 0.04em;
		color:          var(--text-accent);
		margin:         4px 0 1px;
	}
	.nc-note-display :global(ul),
	.nc-note-display :global(ol)  { margin: 1px 0; padding-left: 1.2em; }
	.nc-note-display :global(li)  { margin-bottom: 1px; }
	.nc-note-display :global(strong) { font-weight: 700; color: var(--text); }
	.nc-note-display :global(br)  { display: block; margin-bottom: 2px; content: ''; }

	/* ── Relationship buttons ────────────────────────────────────────────── */
	.nc-rel-group {
		display: flex;
		gap:     3px;
	}

	.nc-rel-btn {
		font-family:    var(--font-ui);
		font-size:      0.58rem;
		font-weight:    600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color:          var(--text-dimmer);
		background:     transparent;
		border:         1px solid var(--border);
		border-radius:  10px;
		padding:        2px 6px;
		cursor:         pointer;
		white-space:    nowrap;
		transition:     background 0.12s, color 0.12s, border-color 0.12s;
	}
	.nc-rel-btn:hover { color: var(--text); border-color: var(--border-mid); }

</style>
