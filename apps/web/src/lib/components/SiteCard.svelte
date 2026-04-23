<script lang="ts">
	/**
	 * SiteCard — collapsible expedition card for a Delve site.
	 *
	 * Displays name, theme, domain, objective, 12-cell denizen grid,
	 * progress track (10 boxes × 4 ticks), and a complete toggle.
	 * Emits log entries for all significant actions.
	 */

	import type { Site, VowDifficulty } from '$lib/types.js';
	import { renderNote } from '$lib/markdown.js';
	import {
		EXPEDITION_MARK_TICKS,
		DENIZEN_CELLS,
		DELVE_THEMES,
		DELVE_DOMAINS,
	} from '$lib/types.js';
	import { untrack } from 'svelte';
	import { appendLog, SESSION_LOG_ID } from '$lib/log.svelte.js';
	import { RANK_COLORS } from '$lib/foeStore.svelte.js';
	import ProgressTrack    from '$lib/components/ProgressTrack.svelte';
	import FoePickerDialog  from '$lib/components/FoePickerDialog.svelte';

	import trashSvg       from '$icons/trash-solid-full.svg?raw';
	import checkSvg       from '$icons/circle-check-solid-full.svg?raw';
	import locationSvg    from '$icons/location-dot-solid-full.svg?raw';
	import placeholderSvg from '$icons/dungeon-gate.svg?raw';
	import ConfirmDialog  from '$lib/components/ConfirmDialog.svelte';

	// ---------------------------------------------------------------------------
	// Props
	// ---------------------------------------------------------------------------
	let {
		expedition,
		onChange,
		onDelete,
		onAddEncounter,
		focusName = false,
	}: {
		expedition: Site;
		onChange:       (updated: Site) => void;
		onDelete:      () => void;
		/** Called when the user wants to add a denizen foe as an encounter. */
		onAddEncounter?: (foeName: string) => void;
		focusName?: boolean;
	} = $props();

	// ---------------------------------------------------------------------------
	// Local UI state
	// ---------------------------------------------------------------------------
	let collapsed          = $state(untrack(() => typeof window !== 'undefined' ? localStorage.getItem('il:site:collapse:' + expedition.id) === 'true' : false));
	$effect(() => { if (typeof window !== 'undefined') localStorage.setItem('il:site:collapse:' + expedition.id, String(collapsed)); });
	let denizensCollapsed  = $state(untrack(() => typeof window !== 'undefined' ? localStorage.getItem('il:site:denizens:' + expedition.id) === 'true' : false));
	$effect(() => { if (typeof window !== 'undefined') localStorage.setItem('il:site:denizens:' + expedition.id, String(denizensCollapsed)); });
	let deleteDialogRef    = $state<{ open(): void; close(): void } | null>(null);
	let denizenPickIndex   = $state(-1);
	let editingName        = $state(false);
	let nameInputEl        = $state<HTMLInputElement | null>(null);
	let nameBeforeEdit     = '';
	let portraitHovered    = $state(false);

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
	$effect(() => {
		if (editingName && nameInputEl) nameInputEl.select();
	});
	$effect(() => {
		if (focusName) { nameBeforeEdit = expedition.name; editingName = true; }
	});

	let editingNotes      = $state(false);
	let notesTextareaEl   = $state<HTMLTextAreaElement | null>(null);
	$effect(() => { if (editingNotes && notesTextareaEl) notesTextareaEl.focus(); });

	let foePickerRef          = $state<{ openForDenizen(): Promise<void> } | null>(null);
	let changeThemeDialogRef  = $state<{ open(): void; close(): void } | null>(null);
	let changeDomainDialogRef = $state<{ open(): void; close(): void } | null>(null);
	let newThemeValue         = $state<string>('');
	let newDomainValue        = $state<string>('');

	function openChangeTheme() {
		newThemeValue = expedition.theme;
		changeThemeDialogRef?.open();
	}

	function openChangeDomain() {
		newDomainValue = expedition.domain;
		changeDomainDialogRef?.open();
	}

	function confirmChangeTheme() {
		if (!newThemeValue) return;
		logLine(`<div>Changed theme to <strong>${newThemeValue}</strong>.</div>`);
		update({ theme: newThemeValue as Site['theme'] });
	}

	function confirmChangeDomain() {
		if (!newDomainValue) return;
		logLine(`<div>Changed domain to <strong>${newDomainValue}</strong>.</div>`);
		update({ domain: newDomainValue as Site['domain'] });
	}

	// ---------------------------------------------------------------------------
	// Derived
	// ---------------------------------------------------------------------------
	const DIFFICULTIES: { value: VowDifficulty; label: string }[] = [
		{ value: 'troublesome', label: 'Troublesome' },
		{ value: 'dangerous',   label: 'Dangerous' },
		{ value: 'formidable',  label: 'Formidable' },
		{ value: 'extreme',     label: 'Extreme' },
		{ value: 'epic',        label: 'Epic' },
	];

	const displayName       = $derived(expedition.name || 'Unnamed Site');

	const DIFFICULTY_RANK: Record<string, number> = {
		troublesome: 1, dangerous: 2, formidable: 3, extreme: 4, epic: 5,
	};
	function diffBadgeStyle(difficulty: string): string {
		const rc = RANK_COLORS[DIFFICULTY_RANK[difficulty] ?? 2];
		if (!rc) return '';
		return `background: ${rc.bg}22; color: ${rc.bg}`;
	}
	const markTicks         = $derived(EXPEDITION_MARK_TICKS[expedition.difficulty]);
	const progressScore     = $derived(Math.floor(expedition.ticks / 4));
	const hasThemeAndDomain = $derived(expedition.theme !== '' && expedition.domain !== '');

	// ---------------------------------------------------------------------------
	// Helpers
	// ---------------------------------------------------------------------------
	function update(patch: Partial<Site>) {
		onChange({ ...expedition, ...patch });
	}

	function logLine(html: string) {
		appendLog(SESSION_LOG_ID, `Site — ${displayName}`, html);
	}

	// ---------------------------------------------------------------------------
	// Progress
	// ---------------------------------------------------------------------------
	function handleTrackChange(_oldTicks: number, newTicks: number) {
		const prev = progressScore;
		const next = Math.floor(newTicks / 4);
		update({ ticks: newTicks });
		logLine(`<div>Progress adjusted (${prev}/10 → ${next}/10)</div>`);
	}

	function markProgress() {
		const prev = progressScore;
		const newTicks = Math.min(40, expedition.ticks + markTicks);
		update({ ticks: newTicks });
		const next = Math.floor(newTicks / 4);
		logLine(`<div>Progress marked (${prev}/10 → ${next}/10)</div>`);
	}

	function unmarkProgress() {
		const prev = progressScore;
		const newTicks = Math.max(0, expedition.ticks - markTicks);
		update({ ticks: newTicks });
		const next = Math.floor(newTicks / 4);
		logLine(`<div>Progress unmarked (${prev}/10 → ${next}/10)</div>`);
	}

	// ---------------------------------------------------------------------------
	// Complete toggle
	// ---------------------------------------------------------------------------
	function toggleComplete() {
		const next = !expedition.complete;
		update({ complete: next });
		logLine(next
			? `<div>Marked as <strong>complete</strong></div>`
			: `<div>Returned to <strong>active</strong></div>`);
	}

	// ---------------------------------------------------------------------------
	// Field handlers
	// ---------------------------------------------------------------------------
	function handleNameChange(e: Event) {
		update({ name: (e.target as HTMLInputElement).value });
	}

	function handleObjectiveChange(e: Event) {
		update({ objective: (e.target as HTMLInputElement).value });
	}

	function handleNotesChange(e: Event) {
		update({ notes: (e.target as HTMLTextAreaElement).value });
	}

	function handleDenizenChange(index: number, value: string) {
		const denizens = [...expedition.denizens];
		denizens[index] = value;
		update({ denizens });
	}

	// ---------------------------------------------------------------------------
	// Denizen foe picker
	// ---------------------------------------------------------------------------
	function openDenizenPicker(index: number) {
		denizenPickIndex = index;
		foePickerRef?.openForDenizen();
	}

	function handleDenizenFoePick(foeName: string) {
		if (denizenPickIndex < 0) return;
		handleDenizenChange(denizenPickIndex, foeName);
		logLine(`<div>Denizen ${denizenPickIndex + 1} set to <strong>${foeName}</strong> (foe picker)</div>`);
		denizenPickIndex = -1;
	}

	// ---------------------------------------------------------------------------
	// Delete
	// ---------------------------------------------------------------------------
	function confirmDelete() {
		logLine(`<div>Site removed</div>`);
		onDelete();
	}
</script>

<div
	class="sc-card"
	class:sc-complete={expedition.complete}
	class:collapsed={collapsed}
	style="border-left: 3px solid #60a5fa"
>

	<!-- ── Header (always visible) ── -->
	<div class="sc-header">
		<button
			class="sc-collapse-btn"
			onclick={() => (collapsed = !collapsed)}
			aria-label={collapsed ? 'Expand' : 'Collapse'}
		>{collapsed ? '▶' : '▼'}</button>

		<!-- Portrait -->
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<label
			class="sc-portrait-label"
			title="Click to change portrait"
			onmouseenter={() => (portraitHovered = true)}
			onmouseleave={() => (portraitHovered = false)}
		>
			{#if expedition.imageUrl}
				<img src={expedition.imageUrl} alt="Portrait" class="sc-portrait-img" />
			{:else}
				<div class="sc-portrait-placeholder">{@html placeholderSvg}</div>
			{/if}
			<input type="file" accept="image/*" class="sc-portrait-input" aria-label="Upload portrait" onchange={handlePortrait} />
		</label>
		{#if portraitHovered && expedition.imageUrl}
			<div class="sc-portrait-lightbox">
				<img src={expedition.imageUrl} alt="Portrait" />
			</div>
		{/if}

		{#if editingName}
			<input
				bind:this={nameInputEl}
				class="sc-name-input"
				type="text"
				value={expedition.name}
				placeholder="Site name..."
				oninput={(e) => update({ name: (e.target as HTMLInputElement).value })}
				onblur={() => (editingName = false)}
				onkeydown={(e) => {
					if (e.key === 'Enter') nameInputEl?.blur();
					if (e.key === 'Escape') { update({ name: nameBeforeEdit }); editingName = false; }
				}}
			/>
		{:else}
			<!-- svelte-ignore a11y_interactive_supports_focus -->
			<span
				class="sc-name"
				role="button"
				onclick={() => { nameBeforeEdit = expedition.name; editingName = true; }}
				onkeydown={(e) => e.key === 'Enter' && (editingName = true)}
				title="Click to rename"
			>{displayName}</span>
		{/if}

		<!-- Status icon -->
		<span class="sc-status-icon" class:status-complete={expedition.complete}>
			{#if expedition.complete}
				{@html checkSvg}
			{:else}
				{@html locationSvg}
			{/if}
		</span>

		<!-- Delete controls -->
		<button class="btn btn-icon sc-del-btn" onclick={() => deleteDialogRef?.open()} title="Remove site" aria-label="Remove site">
			{@html trashSvg}
		</button>
	</div>

	<!-- ── Collapsible body ── -->
	{#if !collapsed}
		<div class="sc-body">

			<!-- Pills -->
			<div class="sc-pill-strip">
				<span class="sc-badge sc-badge--type">Site</span>
				<span class="sc-badge sc-badge--diff" style={diffBadgeStyle(expedition.difficulty)}>
					{DIFFICULTIES.find(d => d.value === expedition.difficulty)?.label ?? expedition.difficulty}
				</span>
				{#if expedition.theme}
					<span class="sc-badge sc-badge--theme">{expedition.theme}</span>
				{/if}
				{#if expedition.domain}
					<span class="sc-badge sc-badge--domain">{expedition.domain}</span>
				{/if}
			</div>

			<!-- Current feature / danger from oracle rolls -->
			{#if expedition.currentFeature || expedition.currentDanger}
				<div class="sc-fd-results">
					{#if expedition.currentFeature}
						<div class="sc-fd-line">
							<span class="sc-fd-label">Feature</span>
							<span class="sc-fd-text">{expedition.currentFeature}</span>
						</div>
					{/if}
					{#if expedition.currentDanger}
						<div class="sc-fd-line">
							<span class="sc-fd-label">Danger</span>
							<span class="sc-fd-text">{expedition.currentDanger}</span>
						</div>
					{/if}
				</div>
			{/if}

			<!-- Change theme / domain -->
			<div class="sc-theme-actions">
				<button class="sc-theme-btn" onclick={openChangeTheme}>Change Theme</button>
				<button class="sc-theme-btn" onclick={openChangeDomain}>Change Domain</button>
			</div>

			<!-- Objective -->
			<div class="sc-field-row">
				<label class="sc-label" for="sc-obj-{expedition.id}">Objective</label>
				<input
					id="sc-obj-{expedition.id}"
					class="sc-input"
					type="text"
					placeholder="What are you seeking here?"
					value={expedition.objective}
					oninput={handleObjectiveChange}
				/>
			</div>

			<!-- Notes (click-to-edit markdown display, same pattern as CharacterSheet background) -->
			<div class="sc-field-row">
				<label class="sc-label" for="sc-notes-{expedition.id}">Notes</label>
				{#if editingNotes}
					<textarea
						bind:this={notesTextareaEl}
						id="sc-notes-{expedition.id}"
						class="sc-input sc-textarea"
						rows="3"
						placeholder="Discoveries, encounters, observations… (**bold**, *italic*, # heading, - list)"
						value={expedition.notes ?? ''}
						oninput={handleNotesChange}
						onblur={() => (editingNotes = false)}
					></textarea>
				{:else}
					<!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
					<div
						id="sc-notes-{expedition.id}"
						class="sc-notes-display"
						class:sc-notes-empty={!(expedition.notes ?? '').trim()}
						onclick={() => (editingNotes = true)}
						onkeydown={(e) => { if (e.key === 'Enter') editingNotes = true; }}
						title="Click to edit"
						role="button"
						tabindex="0"
					>
						{#if (expedition.notes ?? '').trim()}
							{@html renderNote(expedition.notes ?? '')}
						{:else}
							<span class="sc-notes-placeholder">Discoveries, encounters, observations… (**bold**, *italic*, # heading, - list)</span>
						{/if}
					</div>
				{/if}
			</div>

			<!-- Denizens sub-section (collapsible) -->
			<div class="sc-section">
				<div class="sc-section-header">
					<button
						class="sc-collapse-btn"
						onclick={() => (denizensCollapsed = !denizensCollapsed)}
						aria-label={denizensCollapsed ? 'Expand denizens' : 'Collapse denizens'}
					>{denizensCollapsed ? '▶' : '▼'}</button>
					<span class="sc-section-label">Denizens</span>
				</div>

				{#if !denizensCollapsed}
					<div class="sc-denizen-grid">
						{#each DENIZEN_CELLS as cell, i (i)}
							<div
								class="sc-denizen-cell"
							>
								<div class="sc-denizen-meta">
									<span class="sc-denizen-freq">{cell.label}</span>
									<span class="sc-denizen-range">{cell.range}</span>
								</div>
								<div class="sc-denizen-input-row">
									<input
										class="sc-denizen-input"
										type="text"
										placeholder="—"
										value={expedition.denizens[i] ?? ''}
										oninput={(e) => handleDenizenChange(i, (e.target as HTMLInputElement).value)}
									/>
									<button
										class="sc-denizen-pick-btn"
										onclick={() => openDenizenPicker(i)}
										title="Pick a foe for this denizen"
										aria-label="Pick foe for denizen {i + 1}"
									>&#8853;</button>
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>

			<!-- Progress track -->
			<div class="sc-section">
				<span class="sc-section-label">Progress track</span>
				<div class="sc-progress-row">
					<div class="sc-track-wrap">
						<ProgressTrack
							label=""
							value={expedition.ticks}
							onchange={handleTrackChange}
						/>
					</div>
					<button
						class="btn-progress"
						onclick={markProgress}
						disabled={expedition.ticks >= 40}
						title="Mark progress (+{markTicks} ticks)"
					>+{markTicks}</button>
					<button
						class="btn-progress"
						onclick={unmarkProgress}
						disabled={expedition.ticks <= 0}
						title="Unmark progress (−{markTicks} ticks)"
					>−{markTicks}</button>
				</div>
			</div>

			<!-- Complete toggle -->
			<div class="sc-status-row">
				<button
					class="btn btn-sm"
					class:btn-success={!expedition.complete}
					onclick={toggleComplete}
				>
					{expedition.complete ? '↩ Mark Active' : '✓ Mark Complete'}
				</button>
			</div>
		</div>
	{/if}
</div>

<!-- Dialogs (always mounted, controlled via refs) -->
<FoePickerDialog
	bind:this={foePickerRef}
	onSelect={() => {}}
	onDenizenPick={handleDenizenFoePick}
/>

<ConfirmDialog
	bind:this={deleteDialogRef}
	title="Remove Site?"
	onconfirm={confirmDelete}
	confirmLabel="Remove"
>
	<p style="font-family: var(--font-ui); font-size: 0.82rem; color: var(--text-muted); margin: 0; line-height: 1.5;">Remove this site from your expeditions?</p>
</ConfirmDialog>

<ConfirmDialog
	bind:this={changeThemeDialogRef}
	title="Change Theme"
	confirmLabel="Change Theme"
	confirmClass="btn-primary"
	cancelLabel="Cancel"
	accentColor="#60a5fa"
	confirmDisabled={!newThemeValue}
	onconfirm={confirmChangeTheme}
>
	<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
		<label for="sc-ct-theme-{expedition.id}" style="font-family: var(--font-ui); font-size: 0.65rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-dimmer); width: 56px; flex-shrink: 0;">Theme <span style="color: var(--color-danger);">*</span></label>
		<select id="sc-ct-theme-{expedition.id}" style="flex: 1; font-family: var(--font-ui); font-size: 0.75rem; background: var(--bg-control); border: 1px solid var(--border); border-radius: 4px; color: var(--text); padding: 3px 6px; outline: none;" bind:value={newThemeValue}>
			<option value="" disabled>Select a theme…</option>
			{#each DELVE_THEMES as t (t)}<option value={t}>{t}</option>{/each}
		</select>
	</div>
</ConfirmDialog>

<ConfirmDialog
	bind:this={changeDomainDialogRef}
	title="Change Domain"
	confirmLabel="Change Domain"
	confirmClass="btn-primary"
	cancelLabel="Cancel"
	accentColor="#60a5fa"
	confirmDisabled={!newDomainValue}
	onconfirm={confirmChangeDomain}
>
	<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
		<label for="sc-cd-domain-{expedition.id}" style="font-family: var(--font-ui); font-size: 0.65rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-dimmer); width: 56px; flex-shrink: 0;">Domain <span style="color: var(--color-danger);">*</span></label>
		<select id="sc-cd-domain-{expedition.id}" style="flex: 1; font-family: var(--font-ui); font-size: 0.75rem; background: var(--bg-control); border: 1px solid var(--border); border-radius: 4px; color: var(--text); padding: 3px 6px; outline: none;" bind:value={newDomainValue}>
			<option value="" disabled>Select a domain…</option>
			{#each DELVE_DOMAINS as d (d)}<option value={d}>{d}</option>{/each}
		</select>
	</div>
</ConfirmDialog>

<style>
	/* ── Card shell ─────────────────────────────────────────────────────── */
	.sc-card {
		border: 1px solid var(--border);
		border-radius: 5px;
		background: var(--bg-card);
		overflow: hidden;
		box-shadow: inset 0 1px 0 #ffffff04, 0 2px 12px #00000050;
		transition: opacity 0.2s;
	}
	.sc-card.sc-complete { opacity: 0.55; }

	/* Remove header divider when collapsed */
	.sc-card.collapsed .sc-header {
		border-bottom: none;
	}

	/* ── Header ─────────────────────────────────────────────────────────── */
	.sc-header {
		position: relative;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 12px;
		flex-wrap: wrap;
		min-height: 55px;
		background: var(--bg-inset);
		border-bottom: 1px solid var(--border);
	}

	.sc-collapse-btn {
		background: none;
		border: none;
		cursor: pointer;
		color: var(--text-dimmer);
		font-size: 0.65rem;
		padding: 2px 4px;
		flex-shrink: 0;
	}

	/* ── Portrait ───────────────────────────────────────────────────────── */
	.sc-portrait-label {
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
	.sc-portrait-label:has(.sc-portrait-img) {
		overflow: hidden;
		border:   1px solid var(--border-mid);
	}
	.sc-portrait-label:hover { opacity: 0.85; }

	.sc-portrait-img {
		width:      100%;
		height:     100%;
		object-fit: cover;
		display:    block;
	}

	.sc-portrait-placeholder {
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
	.sc-portrait-placeholder :global(svg) {
		width:   20px;
		height:  20px;
		fill:    currentColor;
		opacity: 0.5;
	}

	.sc-portrait-input { display: none; }

	.sc-portrait-lightbox {
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
	.sc-portrait-lightbox img {
		display:    block;
		width:      160px;
		height:     160px;
		object-fit: cover;
	}

	.sc-pill-strip {
		display: flex;
		flex-wrap: wrap;
		gap: 5px;
		align-items: center;
	}

	/* Current feature / danger display */
	.sc-fd-results {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 4px 0 2px;
	}
	.sc-fd-line {
		display: flex;
		flex-direction: column;
		gap: 1px;
	}
	.sc-fd-label {
		font-family:    var(--font-ui);
		font-size:      0.55rem;
		font-weight:    700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color:          var(--text-dimmer);
	}
	.sc-fd-text {
		font-family: var(--font-ui);
		font-size:   0.8rem;
		line-height: 1.4;
		color:       var(--text-muted);
		font-style:  italic;
	}

	.sc-theme-actions {
		display:   flex;
		gap:       6px;
		flex-wrap: wrap;
	}
	.sc-theme-btn {
		font-family:    var(--font-ui);
		font-size:      0.65rem;
		font-weight:    600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color:          var(--text-dimmer);
		background:     transparent;
		border:         1px solid var(--border);
		border-radius:  4px;
		padding:        2px 8px;
		cursor:         pointer;
		line-height:    1.6;
	}
	.sc-theme-btn:hover {
		color:      var(--text);
		border-color: var(--border-mid);
		background: var(--bg-hover);
	}

	.sc-name {
		flex: 1;
		font-family: var(--font-display);
		font-size: 0.88rem;
		font-weight: 700;
		letter-spacing: 0.04em;
		cursor: text;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.sc-name-input {
		flex: 1;
		font-family: var(--font-display);
		font-weight: 700;
		font-size: 0.88rem;
		letter-spacing: 0.04em;
		background: var(--bg-input);
		border: 1px solid var(--accent);
		border-radius: 4px;
		padding: 2px 6px;
		color: var(--text);
		min-width: 0;
	}

	/* ── Badges ─────────────────────────────────────────────────────────── */
	.sc-badge {
		font-family: var(--font-ui);
		font-size: 0.6rem;
		font-weight: 600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		padding: 2px 7px;
		border-radius: 10px;
		border: 1px solid color-mix(in srgb, currentColor 35%, transparent);
		line-height: 1;
		white-space: nowrap;
		flex-shrink: 0;
	}
	.sc-badge--type   { background: rgba(96, 165, 250, 0.15); color: #60a5fa; }
	.sc-badge--theme  { background: rgba(168, 85, 247, 0.15); color: #a855f7; }
	.sc-badge--domain { background: rgba(251, 146, 60, 0.15); color: #fb923c; }
	.sc-badge--diff   { background: rgba(255,255,255,0.08); color: var(--text-muted); }

	/* ── Status icon ────────────────────────────────────────────────────── */
	.sc-status-icon {
		display: flex;
		align-items: center;
		flex-shrink: 0;
		color: var(--text-dimmer);
	}
	.sc-status-icon.status-complete { color: #34d399; }
	.sc-status-icon :global(svg) {
		width: 14px;
		height: 14px;
		fill: currentColor;
	}

	/* ── Delete ─────────────────────────────────────────────────────────── */
	.sc-del-btn {
		width: 26px;
		height: 26px;
		padding: 4px;
		margin-left: auto;
		flex-shrink: 0;
	}
	.sc-del-btn :global(svg) {
		width: 13px;
		height: 13px;
		fill: currentColor;
	}

	/* ── Body ───────────────────────────────────────────────────────────── */
	.sc-body {
		padding: 0.75rem var(--page-gutter) 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.65rem;
	}

	.sc-field-row {
		display: flex;
		flex-direction: column;
		gap: 3px;
	}

	.sc-label {
		font-family: var(--font-ui);
		font-size: 0.65rem;
		font-weight: 600;
		letter-spacing: 0.07em;
		text-transform: uppercase;
		color: var(--text-dimmer);
	}

	.sc-input {
		font-family: var(--font-ui);
		font-size: 0.82rem;
		padding: 4px 8px;
		background: var(--bg-inset);
		border: 1px solid var(--border);
		border-radius: 4px;
		color: var(--text);
	}
	.sc-input:focus {
		outline: none;
		border-color: var(--focus-ring);
		box-shadow: 0 0 0 2px var(--accent-glow);
	}

	.sc-textarea {
		resize: vertical;
		min-height: 3rem;
		line-height: 1.45;
	}

	/* Read-only markdown display for the notes field (click to edit) */
	.sc-notes-display {
		width: 100%;
		font-family: var(--font-ui);
		font-size: 0.82rem;
		line-height: 1.45;
		min-height: 3rem;
		padding: 4px 8px;
		border: 1px solid var(--border);
		border-radius: 4px;
		background: var(--bg-inset);
		color: var(--text);
		box-sizing: border-box;
		cursor: text;
		transition: border-color 0.12s;
	}
	.sc-notes-display:hover,
	.sc-notes-display:focus {
		border-color: var(--border-mid);
		outline: none;
	}
	.sc-notes-placeholder {
		color: var(--text-dimmer);
		font-style: italic;
	}
	.sc-notes-display :global(p)            { margin: 0 0 3px; }
	.sc-notes-display :global(p:last-child) { margin-bottom: 0; }
	.sc-notes-display :global(h3),
	.sc-notes-display :global(h4),
	.sc-notes-display :global(h5) {
		font-family: var(--font-ui);
		font-size: 0.78rem;
		font-weight: 700;
		letter-spacing: 0.04em;
		color: var(--text-accent);
		margin: 4px 0 2px;
	}
	.sc-notes-display :global(ul),
	.sc-notes-display :global(ol)      { margin: 2px 0; padding-left: 1.3em; }
	.sc-notes-display :global(li)      { margin-bottom: 1px; }
	.sc-notes-display :global(strong)  { font-weight: 700; color: var(--text); }
	.sc-notes-display :global(em)      { font-style: italic; }
	.sc-notes-display :global(br)      { display: block; margin-bottom: 3px; content: ''; }

	/* ── Section headers ────────────────────────────────────────────────── */
	.sc-section {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.sc-section-header {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.sc-section-label {
		font-family: var(--font-ui);
		font-size: 0.65rem;
		font-weight: 600;
		letter-spacing: 0.07em;
		text-transform: uppercase;
		color: var(--text-dimmer);
		flex: 1;
	}

	/* ── Denizen grid ───────────────────────────────────────────────────── */
	.sc-denizen-grid {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		margin-top: 4px;
	}

	.sc-denizen-cell {
		flex: 1 1 calc(25% - 3px);
		min-width: 9rem;
		background: var(--bg-inset);
		border: 1px solid var(--border);
		border-radius: 4px;
		padding: 4px 6px;
		display: flex;
		flex-direction: column;
		gap: 2px;
		transition: border-color 0.3s, background 0.3s;
	}


	.sc-denizen-meta {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
	}

	.sc-denizen-freq {
		font-family: var(--font-ui);
		font-size: 0.6rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--text-dimmer);
	}

	.sc-denizen-range {
		font-family: var(--font-ui);
		font-size: 0.6rem;
		color: var(--text-dimmer);
		opacity: 0.7;
	}

	.sc-denizen-input {
		font-family: var(--font-ui);
		font-size: 0.78rem;
		padding: 2px 4px;
		background: transparent;
		border: 1px solid transparent;
		border-radius: 3px;
		color: var(--text);
		width: 100%;
	}
	.sc-denizen-input:focus {
		outline: none;
		border-color: var(--focus-ring);
		background: var(--bg-inset);
		box-shadow: 0 0 0 2px var(--accent-glow);
	}

	/* ── Progress ───────────────────────────────────────────────────────── */
	.sc-progress-row {
		display: flex;
		align-items: center;
		gap: 6px;
		flex-wrap: nowrap;
	}
	.sc-track-wrap {
		flex: 1;
		min-width: 0;
	}
	.sc-track-wrap :global(.track-boxes) { flex-wrap: nowrap; }
	.sc-track-wrap :global(.track-box)   { flex: 1; width: auto; }

	.btn-progress {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		height: 22px;
		padding: 0 7px;
		border-radius: 3px;
		border: 1px solid var(--border-mid);
		background: transparent;
		color: var(--text-muted);
		font-family: var(--font-ui);
		font-size: 0.68rem;
		font-weight: 600;
		letter-spacing: 0.02em;
		cursor: pointer;
		white-space: nowrap;
		transition: background 0.12s, color 0.12s;
	}
	.btn-progress:hover:not(:disabled) {
		background: var(--bg-hover);
		color: var(--text);
	}
	.btn-progress:disabled { opacity: 0.35; cursor: not-allowed; }

	/* ── Denizen input row (input + pick button) ──────────────────────── */
	.sc-denizen-input-row {
		display: flex;
		align-items: center;
		gap: 2px;
	}

	.sc-denizen-pick-btn {
		background: none;
		border: none;
		color: var(--text-dimmer);
		cursor: pointer;
		font-size: 0.85rem;
		padding: 0 2px;
		line-height: 1;
		flex-shrink: 0;
		border-radius: 3px;
		transition: color 0.12s;
	}
	.sc-denizen-pick-btn:hover {
		color: var(--text-accent);
	}

	/* ── Status row ─────────────────────────────────────────────────────── */
	.sc-status-row {
		display: flex;
		justify-content: flex-end;
	}
</style>
