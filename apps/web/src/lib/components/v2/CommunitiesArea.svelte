<script lang="ts">
	/**
	 * CommunitiesArea (v2 prototype) — combined Communities + NPCs deck.
	 *
	 * Spine column lists both entry types interleaved (sorted by createdAt).
	 * Each entry's spine accent and stage-header LHS band are coloured by type:
	 *   community → #D06840 (terracotta)
	 *   npc       → #C848A8 (orchid)
	 *
	 * Header toolbar adds "+ Community" and "+ NPC" (both open V1 random /
	 * manual dialogs with oracle pickers).
	 *
	 * Two tabs per entry:
	 *   • CORE — community: region / location / desc / trouble
	 *            npc:       role / goal / descriptor / relationship / location
	 *   • NOTES — portrait floats right, markdown notes wrap around it.
	 *
	 * All edits flow through a 1.5 s debounce shared between both stores.
	 */
	import {
		getCommunities, isCommunityLoading,
		persistCommunitiesNow,
		addCommunity, removeCommunity,
	} from '$lib/communityStore.svelte.js';
	import {
		getNpcs,
		persistNpcsNow,
		addNpc, removeNpc,
	} from '$lib/npcStore.svelte.js';
	import type { Community, Npc, NpcRelationship } from '$lib/types.js';
	import { renderNote } from '$lib/markdown.js';
	import { isYrtEnabled } from '$lib/expansionStore.svelte.js';
	import { loadOracles, getOracles, rollOracle, findOracle, rollFromRangeTable } from '$lib/oracleStore.svelte.js';
	import { tooltip } from '$lib/actions/tooltip.js';

	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import trashSvg     from '$icons/trash-solid-full.svg?raw';
	import hutSvg       from '$icons/hut.svg?raw';
	import farmerSvg    from '$icons/farmer.svg?raw';
	import villageIconSvg from '$icons/village.svg?raw';
	import { headingText } from '$lib/fontStore.svelte.js';

	let { showTitle = true }: { showTitle?: boolean } = $props();

	const COMMUNITY_COLOR = '#D06840';
	const NPC_COLOR       = '#C848A8';

	type EntryKind = 'community' | 'npc';
	type CommunityEntry = { kind: 'community'; id: string; createdAt: number; data: Community };
	type NpcEntry       = { kind: 'npc';       id: string; createdAt: number; data: Npc };
	type Entry          = CommunityEntry | NpcEntry;

	type CmTab = 'core' | 'notes';
	const TAB_LABELS: { key: CmTab; label: string }[] = [
		{ key: 'core',  label: 'Core'  },
		{ key: 'notes', label: 'Description' },
	];

	const RELATIONSHIPS: { value: NpcRelationship; label: string }[] = [
		{ value: 'bond',    label: 'Bond'    },
		{ value: 'neutral', label: 'Neutral' },
		{ value: 'foe',     label: 'Foe'     },
	];

	let activeEntryId    = $state<string | null>(null);
	let activeTab        = $state<CmTab>('core');
	let deleteDialogRef  = $state<{ open(): void; close(): void } | null>(null);
	let newlyCreatedId   = $state('');

	// New-community dialog state
	let newCommunityDialogRef = $state<{ open(): void; close(): void } | null>(null);
	let _pendingCommunity: Community | null = null;
	let _pendingCommunityRegionType   = $state<'ironlands' | 'yrt'>('ironlands');
	let _pendingCommunityLocationType = $state<'location' | 'coastalWatersLocation'>('location');

	// New-NPC dialog state
	let newNpcDialogRef       = $state<{ open(): void; close(): void } | null>(null);
	let _pendingNpc: Npc | null = null;
	let _pendingNpcNameOracle = $state<string>('namesIronlander');

	// Inline-edit state
	let editingName     = $state(false);
	let editingNotes        = $state(false);
	let editingCoreNotes    = $state(false);
	let nameBeforeEdit      = $state('');
	let nameInputEl         = $state<HTMLInputElement | null>(null);
	let notesTextareaEl     = $state<HTMLTextAreaElement | null>(null);
	let coreNotesTextareaEl = $state<HTMLTextAreaElement | null>(null);
	$effect(() => { if (editingName && nameInputEl) { nameInputEl.focus(); nameInputEl.select(); } });
	$effect(() => { if (editingNotes && notesTextareaEl) notesTextareaEl.focus(); });
	$effect(() => { if (editingCoreNotes && coreNotesTextareaEl) coreNotesTextareaEl.focus(); });

	const communities = $derived(getCommunities());
	const npcs        = $derived(getNpcs());
	const loading     = $derived(isCommunityLoading());

	/** Combined list — communities + NPCs, sorted by createdAt (oldest first). */
	const entries = $derived<Entry[]>([
		...communities.map<CommunityEntry>(c => ({ kind: 'community', id: c.id, createdAt: c.createdAt ?? 0, data: c })),
		...npcs       .map<NpcEntry>      (n => ({ kind: 'npc',       id: n.id, createdAt: n.createdAt ?? 0, data: n })),
	].sort((a, b) => a.createdAt - b.createdAt));

	$effect(() => {
		if (!activeEntryId && entries.length > 0) activeEntryId = entries[0].id;
	});

	const activeEntry = $derived(entries.find(e => e.id === activeEntryId));
	const activeKind  = $derived<EntryKind | null>(activeEntry?.kind ?? null);
	const activeColor = $derived(activeKind === 'npc' ? NPC_COLOR : COMMUNITY_COLOR);

	function selectEntry(id: string) {
		flushPersist();
		activeEntryId    = id;
		activeTab        = 'core';
		editingName      = false;
		editingNotes     = false;
		editingCoreNotes = false;
	}

	// ── Direct-proxy writes + debounced API flush ─────────────────────────
	// updateCommunity/updateNpc mutate fields on the active entry's data
	// object (a $state proxy from the store array). Identity is preserved
	// so anything binding to it stays in sync. A single $effect watches
	// the active entry's snapshot and schedules a kind-aware flush that
	// pushes the right store (communities vs npcs) to the API.
	let _saveTimer: ReturnType<typeof setTimeout> | null = null;
	let _savingKind: EntryKind | null = null;

	function updateCommunity(patch: Partial<Community>) {
		if (activeEntry?.kind !== 'community') return;
		Object.assign(activeEntry.data as object, patch);
	}
	function updateNpc(patch: Partial<Npc>) {
		if (activeEntry?.kind !== 'npc') return;
		Object.assign(activeEntry.data as object, patch);
	}

	$effect(() => {
		if (!activeEntry) return;
		const kind = activeEntry.kind;
		$state.snapshot(activeEntry.data);
		// If the pending save targets a different store, flush it first so
		// we don't lose a Community edit by overwriting the timer with an NPC edit.
		if (_saveTimer && _savingKind && _savingKind !== kind) flushPersist();
		_savingKind = kind;
		if (_saveTimer) clearTimeout(_saveTimer);
		_saveTimer = setTimeout(() => {
			const k = _savingKind;
			_saveTimer = null;
			_savingKind = null;
			const p = k === 'npc' ? persistNpcsNow() : persistCommunitiesNow();
			p.catch(err => console.error('[v2] save failed', err));
		}, 1500);
		return () => {
			if (_saveTimer) {
				clearTimeout(_saveTimer);
				const k = _savingKind;
				_saveTimer = null;
				_savingKind = null;
				const p = k === 'npc' ? persistNpcsNow() : persistCommunitiesNow();
				p.catch(err => console.error('[v2] save failed', err));
			}
		};
	});

	function flushPersist() {
		if (_saveTimer) {
			clearTimeout(_saveTimer);
			const k = _savingKind;
			_saveTimer = null;
			_savingKind = null;
			const p = k === 'npc' ? persistNpcsNow() : persistCommunitiesNow();
			p.catch(err => console.error('[v2] save failed', err));
		}
	}

	function startEditName() {
		if (!activeEntry) return;
		nameBeforeEdit = activeEntry.data.name;
		editingName = true;
	}
	function commitName() { editingName = false; }
	function cancelName() {
		if (activeEntry?.kind === 'community') updateCommunity({ name: nameBeforeEdit });
		else if (activeEntry?.kind === 'npc')  updateNpc({ name: nameBeforeEdit });
		editingName = false;
	}
	function setName(value: string) {
		if (activeEntry?.kind === 'community') updateCommunity({ name: value });
		else if (activeEntry?.kind === 'npc')  updateNpc({ name: value });
	}
	function setNotes(value: string) {
		if (activeEntry?.kind === 'community') updateCommunity({ notes: value });
		else if (activeEntry?.kind === 'npc')  updateNpc({ notes: value });
	}

	function handlePortrait(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file || !activeEntry) return;
		const reader = new FileReader();
		reader.onload = () => {
			const img = new Image();
			img.onload = () => {
				const canvas = document.createElement('canvas');
				const size = Math.min(img.width, img.height, 256);
				canvas.width = size;
				canvas.height = size;
				const ctx = canvas.getContext('2d')!;
				const side = Math.min(img.width, img.height);
				const sx = (img.width  - side) / 2;
				const sy = (img.height - side) / 2;
				ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
				const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
				if (activeEntry?.kind === 'community') updateCommunity({ imageUrl: dataUrl });
				else if (activeEntry?.kind === 'npc')  updateNpc({ imageUrl: dataUrl });
			};
			img.src = reader.result as string;
		};
		reader.readAsDataURL(file);
	}

	// ── Add Community / NPC (V1 random-or-manual pattern) ──────────────────
	async function addNewCommunity() {
		_pendingCommunity = {
			id:                  crypto.randomUUID(),
			name:                'New Connection',
			region:              '',
			location:            '',
			locationDescription: '',
			trouble:             '',
			notes:               '',
			createdAt:           Date.now(),
		};
		await loadOracles();
		newCommunityDialogRef?.open();
	}

	async function _commitCommunity(random: boolean) {
		if (!_pendingCommunity) return;
		const c = _pendingCommunity;
		_pendingCommunity = null;
		if (random) {
			const oracles = getOracles();
			const nameOracle = Math.random() < 0.5 ? 'settlementName' : 'settlementNameQuick';
			const nameVal = rollOracle(nameOracle, oracles).value;
			if (nameVal) c.name = nameVal;
			c.region              = _pendingCommunityRegionType === 'yrt'
				? rollOracle('yrtRegion', oracles).value
				: rollOracle('region', oracles).value;
			c.location            = rollOracle(_pendingCommunityLocationType, oracles).value;
			c.locationDescription = rollOracle('locationDescriptor', oracles).value;
			c.trouble             = rollOracle('settlementTrouble', oracles).value;
		}
		await addCommunity(c);
		activeEntryId  = c.id;
		newlyCreatedId = c.id;
		activeTab      = 'core';
		setTimeout(() => (newlyCreatedId = ''), 0);
	}

	async function addNewNpc() {
		_pendingNpc = {
			id:           crypto.randomUUID(),
			name:         'New NPC',
			role:         '',
			goal:         '',
			descriptor:   '',
			relationship: 'neutral',
			location:     '',
			notes:        '',
			createdAt:    Date.now(),
		};
		await loadOracles();
		newNpcDialogRef?.open();
	}

	async function _commitNpc(random: boolean) {
		if (!_pendingNpc) return;
		const n = _pendingNpc;
		_pendingNpc = null;
		if (random) {
			const oracles = getOracles();
			n.role       = rollOracle('characterRole', oracles).value;
			n.goal       = rollOracle('characterGoal', oracles).value;
			n.descriptor = rollOracle('characterDescriptor', oracles).value;
			if (_pendingNpcNameOracle.startsWith('namesOther_')) {
				const o = findOracle('namesOther');
				if (o) {
					const r = rollFromRangeTable(o.data);
					const v = r.value as { giants: string; varou: string; trolls: string };
					const sub = _pendingNpcNameOracle.split('_')[1] as keyof typeof v;
					n.name = v[sub];
				}
			} else {
				const o = findOracle(_pendingNpcNameOracle);
				if (o) n.name = rollFromRangeTable(o.data).value as string;
			}
		}
		await addNpc(n);
		activeEntryId  = n.id;
		newlyCreatedId = n.id;
		activeTab      = 'core';
		setTimeout(() => (newlyCreatedId = ''), 0);
	}

	async function confirmDeleteEntry() {
		if (!activeEntry) return;
		const id = activeEntry.id;
		if (activeEntry.kind === 'community') await removeCommunity(id);
		else                                   await removeNpc(id);
		if (activeEntryId === id) activeEntryId = null;
	}
</script>

<div class="cm-area">
	<header class="cm-header">
		{#if showTitle}
			<span class="cm-title-icon" aria-hidden="true">{@html villageIconSvg}</span>
			<span class="cmt-title">{headingText('Connections')}</span>
		{/if}
		<div class="cm-header-actions">
			<button class="btn cm-hdr-btn" onclick={addNewCommunity} title="Add connection">+ Connection</button>
			<button class="btn cm-hdr-btn" onclick={addNewNpc}       title="Add NPC">+ NPC</button>
		</div>
	</header>

	{#if loading}
		<div class="cm-loading">Loading…</div>
	{:else if entries.length === 0}
		<div class="cm-empty">
			<span class="cm-empty-icon" aria-hidden="true">{@html villageIconSvg}</span>
			<p class="cm-empty-text">There are people and places to <s>plunder</s> discover. Click <strong>+ COMMUNITY</strong> or <strong>+ NPC</strong> to begin.</p>
		</div>
	{:else}
		<div class="cm-body">
			<nav class="cm-spines" aria-label="Connections and NPCs">
				{#each entries as entry (entry.id)}
					{@const accent = entry.kind === 'npc' ? NPC_COLOR : COMMUNITY_COLOR}
					<button
						class="cm-spine"
						class:cm-spine--active={entry.id === activeEntryId}
						style="--cm-spine-color: {accent}"
						onclick={() => selectEntry(entry.id)}
						use:tooltip={`${entry.data.name} (${entry.kind})`}
					>
						<span class="cm-spine-name">{entry.data.name || (entry.kind === 'npc' ? 'Unnamed NPC' : 'Unnamed Connection')}</span>
					</button>
				{/each}
			</nav>

			{#if activeEntry}
				<div class="cm-stage-header" style="--cm-nature: {activeColor}">
					{#if editingName}
						<input
							bind:this={nameInputEl}
							class="cm-stage-name-input"
							type="text"
							value={activeEntry.data.name}
							placeholder={activeEntry.kind === 'npc' ? 'NPC name…' : 'Connection name…'}
							oninput={(e) => setName((e.target as HTMLInputElement).value)}
							onblur={commitName}
							onkeydown={(e) => {
								if (e.key === 'Enter') nameInputEl?.blur();
								if (e.key === 'Escape') cancelName();
							}}
						/>
					{:else}
						<button
							type="button"
							class="cm-stage-name cm-stage-name--editable"
							title="Click to rename"
							onclick={startEditName}
						>{headingText(activeEntry.data.name || (activeEntry.kind === 'npc' ? 'Unnamed NPC' : 'Unnamed Connection'))}</button>
					{/if}
					<button
						class="btn btn-icon icon-btn btn-trash cm-stage-delete-btn"
						onclick={() => deleteDialogRef?.open()}
						use:tooltip={activeEntry.kind === 'npc' ? 'Delete NPC' : 'Delete connection'}
						aria-label={activeEntry.kind === 'npc' ? 'Delete NPC' : 'Delete connection'}
					>{@html trashSvg}</button>
				</div>

				<div class="cm-stage">
					<div class="cm-tabs" role="tablist">
						{#each TAB_LABELS as tab (tab.key)}
							<button
								role="tab"
								class="cm-tab"
								class:cm-tab--active={activeTab === tab.key}
								aria-selected={activeTab === tab.key}
								onclick={() => (activeTab = tab.key)}
							>{tab.label}</button>
						{/each}
					</div>

					<div class="cm-card" role="tabpanel">
						{#if activeTab === 'core'}
							{#if activeEntry.kind === 'community'}
								{@const c = activeEntry.data}
								<div class="cm-field-row">
									<label class="cm-field-label" for="cm-region-{c.id}">Region</label>
									<input id="cm-region-{c.id}" class="cm-input" type="text"
										value={c.region}
										oninput={(e) => updateCommunity({ region: (e.target as HTMLInputElement).value })}
										placeholder="Region…" />
								</div>
								<div class="cm-field-row">
									<label class="cm-field-label" for="cm-location-{c.id}">Location</label>
									<input id="cm-location-{c.id}" class="cm-input" type="text"
										value={c.location}
										oninput={(e) => updateCommunity({ location: (e.target as HTMLInputElement).value })}
										placeholder="Location…" />
								</div>
								<div class="cm-field-row">
									<label class="cm-field-label" for="cm-locdesc-{c.id}">Description</label>
									<input id="cm-locdesc-{c.id}" class="cm-input" type="text"
										value={c.locationDescription}
										oninput={(e) => updateCommunity({ locationDescription: (e.target as HTMLInputElement).value })}
										placeholder="Location description…" />
								</div>
								<div class="cm-field-row">
									<label class="cm-field-label" for="cm-trouble-{c.id}">Trouble</label>
									<input id="cm-trouble-{c.id}" class="cm-input" type="text"
										value={c.trouble}
										oninput={(e) => updateCommunity({ trouble: (e.target as HTMLInputElement).value })}
										placeholder="Settlement trouble…" />
								</div>
							{:else}
								{@const n = activeEntry.data}
								<div class="cm-field-row">
									<label class="cm-field-label" for="cm-role-{n.id}">Role</label>
									<input id="cm-role-{n.id}" class="cm-input" type="text"
										value={n.role}
										oninput={(e) => updateNpc({ role: (e.target as HTMLInputElement).value })}
										placeholder="Role…" />
								</div>
								<div class="cm-field-row">
									<label class="cm-field-label" for="cm-goal-{n.id}">Goal</label>
									<input id="cm-goal-{n.id}" class="cm-input" type="text"
										value={n.goal}
										oninput={(e) => updateNpc({ goal: (e.target as HTMLInputElement).value })}
										placeholder="Goal…" />
								</div>
								<div class="cm-field-row">
									<label class="cm-field-label" for="cm-desc-{n.id}">Descriptor</label>
									<input id="cm-desc-{n.id}" class="cm-input" type="text"
										value={n.descriptor}
										oninput={(e) => updateNpc({ descriptor: (e.target as HTMLInputElement).value })}
										placeholder="Descriptor…" />
								</div>
								<div class="cm-field-row">
									<label class="cm-field-label" for="cm-rel-{n.id}">Relationship</label>
									<select id="cm-rel-{n.id}" class="cm-input"
										value={n.relationship}
										onchange={(e) => updateNpc({ relationship: (e.target as HTMLSelectElement).value as NpcRelationship })}>
										{#each RELATIONSHIPS as r}
											<option value={r.value}>{r.label}</option>
										{/each}
									</select>
								</div>
								<div class="cm-field-row">
									<label class="cm-field-label" for="cm-loc-{n.id}">Location</label>
									<input id="cm-loc-{n.id}" class="cm-input" type="text"
										value={n.location}
										oninput={(e) => updateNpc({ location: (e.target as HTMLInputElement).value })}
										placeholder="Location…" />
								</div>
							{/if}

							<!-- Notes — same markdown field exposed in the Description tab,
							     surfaced here for quick access without tab-switching.
							     Click to edit; blur commits via the standard debounced
							     persist path (no separate import/export wiring needed —
							     the `notes` field is already part of the entry). -->
							<div class="cm-core-notes">
								<span class="cm-field-label cm-core-notes-label">Notes</span>
								{#if editingCoreNotes}
									<textarea
										bind:this={coreNotesTextareaEl}
										value={activeEntry.data.notes ?? ''}
										oninput={(e) => setNotes((e.target as HTMLTextAreaElement).value)}
										placeholder={activeEntry.kind === 'npc' ? 'Notes about this NPC… (markdown supported)' : 'Notes about this connection… (markdown supported)'}
										class="cm-notes-input"
										rows="5"
										onblur={() => (editingCoreNotes = false)}
									></textarea>
								{:else}
									<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
									<div
										class="cm-notes cm-notes--display"
										class:cm-notes--empty={!activeEntry.data.notes?.trim()}
										role="button"
										tabindex="0"
										title="Click to edit (markdown supported)"
										onclick={() => (editingCoreNotes = true)}
										onkeydown={(e) => { if (e.key === 'Enter') editingCoreNotes = true; }}
									>
										{#if activeEntry.data.notes?.trim()}
											{@html renderNote(activeEntry.data.notes)}
										{:else}
											<span class="cm-notes-placeholder">{activeEntry.kind === 'npc' ? 'Notes about this NPC…' : 'Notes about this connection…'}</span>
										{/if}
									</div>
								{/if}
							</div>
						{:else if activeTab === 'notes'}
							<div class="cm-notes-section">
								{#if !editingNotes}
									<label class="cm-portrait-label" title="Click to change portrait">
										{#if activeEntry.data.imageUrl}
											<img class="cm-portrait" src={activeEntry.data.imageUrl} alt={activeEntry.data.name} />
										{:else}
											<div class="cm-portrait cm-portrait--placeholder" aria-hidden="true">
												{@html activeEntry.kind === 'npc' ? farmerSvg : hutSvg}
											</div>
										{/if}
										<input
											type="file"
											accept="image/*"
											class="cm-portrait-input"
											onchange={handlePortrait}
											aria-label="Upload portrait"
										/>
									</label>
								{/if}

								{#if editingNotes}
									<textarea
										bind:this={notesTextareaEl}
										value={activeEntry.data.notes ?? ''}
										oninput={(e) => setNotes((e.target as HTMLTextAreaElement).value)}
										placeholder={activeEntry.kind === 'npc' ? 'Notes about this NPC… (markdown supported)' : 'Notes about this connection… (markdown supported)'}
										class="cm-notes-input"
										rows="6"
										onblur={() => (editingNotes = false)}
									></textarea>
								{:else}
									<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
									<div
										class="cm-notes cm-notes--display"
										class:cm-notes--empty={!activeEntry.data.notes?.trim()}
										role="button"
										tabindex="0"
										title="Click to edit (markdown supported)"
										onclick={() => (editingNotes = true)}
										onkeydown={(e) => { if (e.key === 'Enter') editingNotes = true; }}
									>
										{#if activeEntry.data.notes?.trim()}
											{@html renderNote(activeEntry.data.notes)}
										{:else}
											<span class="cm-notes-placeholder">{activeEntry.kind === 'npc' ? 'Notes about this NPC…' : 'Notes about this connection…'}</span>
										{/if}
									</div>
								{/if}
							</div>
						{/if}
					</div>
				</div>
			{/if}
		</div>
	{/if}
</div>

{#if activeEntry}
	<ConfirmDialog
		bind:this={deleteDialogRef}
		title={activeEntry.kind === 'npc' ? 'Delete NPC' : 'Delete Connection'}
		confirmLabel="Delete"
		onconfirm={confirmDeleteEntry}
	>
		<p>Permanently delete <strong>{activeEntry.data.name || (activeEntry.kind === 'npc' ? 'this NPC' : 'this connection')}</strong>? This cannot be undone.</p>
	</ConfirmDialog>
{/if}

<!-- New Connection dialog — V1 pattern. -->
<ConfirmDialog
	bind:this={newCommunityDialogRef}
	title="New Connection"
	confirmLabel="Generate Randomly"
	confirmClass="btn-primary"
	showCancelButton={false}
	alternateLabel="Create Manually"
	accentColor={COMMUNITY_COLOR}
	onconfirm={() => _commitCommunity(true)}
	onalternate={() => _commitCommunity(false)}
	ondismiss={() => { _pendingCommunity = null; }}
>
	<p style="font-family: var(--font-ui); font-size: 0.8rem; color: var(--text-muted); margin: 0 0 10px;">
		Generate fields randomly using oracles, or create the connection manually?
	</p>
	<div style="display: flex; gap: 20px; align-items: flex-start;">
		<fieldset style="border: none; padding: 0; margin: 0;">
			<legend style="font-family: var(--font-ui); font-size: 0.65rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-dimmer); margin-bottom: 5px;">Region oracle</legend>
			<label style="display: flex; align-items: center; gap: 6px; font-family: var(--font-ui); font-size: 0.78rem; color: var(--text); cursor: pointer; margin-bottom: 4px;">
				<input type="radio" bind:group={_pendingCommunityRegionType} value="ironlands" /> Ironlands
			</label>
			{#if isYrtEnabled()}
				<label style="display: flex; align-items: center; gap: 6px; font-family: var(--font-ui); font-size: 0.78rem; color: var(--text); cursor: pointer;">
					<input type="radio" bind:group={_pendingCommunityRegionType} value="yrt" /> YRT
				</label>
			{/if}
		</fieldset>
		<fieldset style="border: none; padding: 0; margin: 0;">
			<legend style="font-family: var(--font-ui); font-size: 0.65rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-dimmer); margin-bottom: 5px;">Location oracle</legend>
			<label style="display: flex; align-items: center; gap: 6px; font-family: var(--font-ui); font-size: 0.78rem; color: var(--text); cursor: pointer; margin-bottom: 4px;">
				<input type="radio" bind:group={_pendingCommunityLocationType} value="location" /> Inland
			</label>
			<label style="display: flex; align-items: center; gap: 6px; font-family: var(--font-ui); font-size: 0.78rem; color: var(--text); cursor: pointer;">
				<input type="radio" bind:group={_pendingCommunityLocationType} value="coastalWatersLocation" /> Coastal Waters
			</label>
		</fieldset>
	</div>
</ConfirmDialog>

<!-- New NPC dialog — V1 pattern with name-oracle selector. -->
<ConfirmDialog
	bind:this={newNpcDialogRef}
	title="New NPC"
	confirmLabel="Generate Randomly"
	confirmClass="btn-primary"
	showCancelButton={false}
	alternateLabel="Create Manually"
	accentColor={NPC_COLOR}
	onconfirm={() => _commitNpc(true)}
	onalternate={() => _commitNpc(false)}
	ondismiss={() => { _pendingNpc = null; }}
>
	<p style="font-family: var(--font-ui); font-size: 0.8rem; color: var(--text-muted); margin: 0 0 8px;">
		Generate fields randomly using oracles, or create the NPC manually?
	</p>
	<fieldset style="border: none; padding: 0; margin: 0 0 4px;">
		<legend style="font-family: var(--font-ui); font-size: 0.65rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-dimmer); margin-bottom: 5px;">Name oracle</legend>
		{#each [
			{ value: 'namesIronlander',   label: 'Ironlander'   },
			{ value: 'namesIronlander2',  label: 'Ironlander 2' },
			{ value: 'namesElf',          label: 'Elf'          },
			{ value: 'namesOther_giants', label: 'Giants'       },
			{ value: 'namesOther_varou',  label: 'Varou'        },
			{ value: 'namesOther_trolls', label: 'Trolls'       },
		] as opt}
			<label style="display: flex; align-items: center; gap: 6px; font-family: var(--font-ui); font-size: 0.78rem; color: var(--text); cursor: pointer; margin-bottom: 3px;">
				<input type="radio" bind:group={_pendingNpcNameOracle} value={opt.value} /> {opt.label}
			</label>
		{/each}
	</fieldset>
</ConfirmDialog>

<style>
	.cm-area { display: flex; flex-direction: column; height: 100%; min-height: 0; }

	.cm-header {
		display: flex; align-items: center; gap: 10px;
		padding: 6px 12px;
		border-bottom: 1px solid var(--border);
		background: var(--bg-control);
		flex-shrink: 0;
	}
	.cm-title-icon {
		display: inline-flex; align-items: center; justify-content: center;
		width: 18px; height: 18px;
		flex-shrink: 0;
		color: var(--text-accent);
	}
	.cm-title-icon :global(svg) { width: 100%; height: 100%; fill: currentColor; }
	.cm-title-icon :global(svg) :global(path) { fill: currentColor; }
	.cmt-title {
		font-family:    var(--font-display);
		font-size:      calc(0.82rem * var(--font-display-scale));
		font-weight:    700;
		letter-spacing: 0.08em;
		text-transform: var(--font-display-transform);
		color:          var(--text-accent);
	}
	.cm-header-actions { display: flex; align-items: center; gap: 6px; flex: 1; justify-content: flex-end; }
	.cm-hdr-btn { font-size: 0.7rem; padding: 3px 9px; min-width: unset; }

	.cm-loading, .cm-empty {
		flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
		font-family: var(--font-ui); font-size: 0.8rem; color: var(--text-muted);
		padding: 20px; gap: 12px; text-align: center;
	}

	.cm-empty-icon { display: flex; width: 48px; height: 48px; opacity: 0.25; }
	.cm-empty-icon :global(svg) { width: 100%; height: 100%; fill: currentColor; }
	.cm-empty-text { margin: 0; line-height: 1.5; max-width: 26ch; }

	.cm-body {
		display: grid;
		grid-template-columns: 36px 1fr;
		grid-template-rows: auto 1fr;
		flex: 1; min-height: 0;
	}
	.cm-spines       { grid-row: 1 / span 2; }
	.cm-stage-header { grid-column: 2; grid-row: 1; }
	.cm-stage {
		grid-column: 2; grid-row: 2;
		padding: 0 12px 10px 0;
		min-height: 0; min-width: 0;
		overflow: auto;
		display: flex; flex-direction: column;
	}

	.cm-spines {
		display: flex; flex-direction: column; align-items: stretch;
		gap: 0; padding: 0; overflow-y: auto;
		border-right: 1px solid var(--border);
		background: transparent;
	}
	.cm-spine {
		all: unset;
		cursor: pointer;
		font-family:    var(--font-ui);
		font-size:      0.72rem;
		font-weight:    600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color:          var(--text-dimmer);
		background:     transparent;
		border: none;
		border-right: 2px solid transparent;
		padding: 16px 7px 16px 7px;
		text-align: center;
		writing-mode: sideways-lr;
		flex: 1 1 0; min-height: 0; overflow: hidden;
		margin-right: -1px;
		transition: color 0.12s, border-color 0.12s;
	}
	.cm-spine:hover { color: var(--text-muted); }
	.cm-spine--active {
		color:              var(--text-accent);
		border-right-color: var(--text-accent);
	}
	.cm-spine-name {
		display: inline-block;
		max-height: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* Stage banner — colored band keyed to entry type. */
	.cm-stage-header {
		display: flex; align-items: center; gap: 6px;
		padding: 5px 10px;
		background: var(--bg-control);
		border: none;
		border-left: 3px solid var(--cm-nature, var(--text-muted));
		border-bottom: 1px solid var(--border);
	}
	.cm-stage-name {
		appearance:     none;
		-webkit-appearance: none;
		text-align:     left;
		background:     transparent;
		flex: 1; margin: 0;
		font-family:    var(--font-display);
		font-size:      calc(0.82rem * var(--font-display-scale));
		font-weight:    var(--font-display-weight);
		font-variant:   var(--font-display-variant);
		letter-spacing: 0.08em;
		text-transform: var(--font-display-transform);
		color:          var(--text-accent);
		overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
	}
	.cm-stage-name--editable {
		cursor: pointer;
		padding: 2px 6px;
		border: 1px solid transparent;
		border-radius: 3px;
		transition: background 0.12s, border-color 0.12s;
	}
	.cm-stage-name--editable:hover {
		background: var(--bg-hover);
		border-color: var(--border);
	}
	.cm-stage-name-input {
		flex: 1;
		font-family:    var(--font-display);
		font-size:      calc(0.82rem * var(--font-display-scale));
		font-weight:    var(--font-display-weight);
		font-variant:   var(--font-display-variant);
		letter-spacing: 0.08em;
		text-transform: var(--font-display-transform);
		color:          var(--text-accent);
		background:     transparent;
		border:         1px solid var(--border-mid);
		border-radius:  3px;
		padding:        2px 6px;
		outline:        none;
	}
	.cm-stage-name-input:focus { border-color: var(--text-accent); }
	/* Delete: visual comes from .btn-trash in app.css; only positioning here. */
	.cm-stage-delete-btn { flex-shrink: 0; }

	.cm-tabs {
		display: flex; align-items: stretch; gap: 0;
		margin-bottom: 8px;
		border-bottom: 1px solid var(--border);
	}
	.cm-tab {
		all: unset; cursor: pointer;
		font-family:    var(--font-ui);
		font-size:      0.72rem;
		font-weight:    600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color:          var(--text-dimmer);
		background:     transparent;
		border: none; border-bottom: 2px solid transparent;
		padding: 7px 8px 6px;
		white-space: nowrap; flex-shrink: 0;
		margin-bottom: -1px;
		transition: color 0.12s, border-color 0.12s;
		display: inline-flex; align-items: center; gap: 0.35rem;
	}
	.cm-tab:hover { color: var(--text-muted); }
	.cm-tab--active { color: var(--text-accent); border-bottom-color: var(--text-accent); }

	.cm-card {
		flex: 1; min-height: 200px;
		background: var(--bg-inset);
		border: none; border-radius: 0;
		padding: 7px;
		overflow: auto;
		position: relative;
		display: flex; flex-direction: column; gap: 10px;
	}

	.cm-notes-section { display: block; }

	/* Core-tab notes block — same `notes` field as the Description tab,
	   exposed at the bottom of Core for quick edits. The Description tab
	   keeps its richer view (portrait + notes wrapping around it). */
	.cm-core-notes {
		display: block;
		margin-top: 12px;
		padding-top: 10px;
		border-top: 1px solid var(--border);
	}
	.cm-core-notes-label {
		display: block;
		margin-bottom: 4px;
	}
	.cm-portrait-label {
		display: contents;
		cursor: pointer;
	}
	.cm-portrait {
		float: right;
		width: 170px; height: 170px; max-height: 240px;
		object-fit: cover;
		margin: 0 0 10px 14px;
		border: 1px solid var(--border);
		border-radius: 6px;
		opacity: 0.95;
		shape-outside: margin-box;
		transition: opacity 0.12s;
	}
	.cm-portrait-label:hover .cm-portrait { opacity: 0.75; }
	.cm-portrait--placeholder {
		background: var(--bg-inset);
		display: flex; align-items: center; justify-content: center;
		color: var(--text-dimmer);
	}
	.cm-portrait--placeholder :global(svg) {
		width: 60%; height: 60%; fill: var(--text-dimmer);
	}
	.cm-portrait-input {
		position: absolute;
		left: -9999px; width: 1px; height: 1px;
	}

	.cm-notes--display {
		cursor: pointer;
		min-height: 1.5em;
		font-family: var(--font-ui);
		font-size: 0.85rem;
		line-height: 1.5;
		color: var(--text);
	}
	.cm-notes--display:focus-visible {
		outline: 2px solid var(--text-accent);
		outline-offset: 2px;
		border-radius: 2px;
	}
	.cm-notes--display :global(p) { margin: 0 0 0.6em; }
	.cm-notes--display :global(p:last-child) { margin-bottom: 0; }
	.cm-notes--display :global(ul),
	.cm-notes--display :global(ol) {
		margin: 0 0 0.6em;
		padding-left: 1.2em;
	}
	.cm-notes--display :global(strong) { font-weight: 700; color: var(--text); }
	.cm-notes--display :global(em)     { font-style: italic; }
	.cm-notes-placeholder {
		font-family: var(--font-ui);
		font-size: 0.85rem;
		color: var(--text-dimmer);
		font-style: italic;
	}
	.cm-notes-input {
		width: 100%;
		min-height: 7em;
		font-family: var(--font-ui);
		font-size: 0.85rem;
		line-height: 1.5;
		color: var(--text);
		background: var(--bg-inset);
		border: 1px solid var(--border);
		border-radius: 4px;
		padding: 8px 10px;
		outline: none;
		resize: vertical;
	}
	.cm-notes-input:focus { border-color: var(--text-accent); }

	.cm-field-row {
		display: flex; align-items: center; gap: 8px;
	}
	.cm-field-label {
		font-family: var(--font-ui);
		font-size: 0.7rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--text-dimmer);
		min-width: 90px;
	}
	.cm-input {
		flex: 1;
		font-family: var(--font-ui);
		font-size: 0.78rem;
		color: var(--text);
		background: var(--bg-inset);
		border: 1px solid var(--border);
		border-radius: 4px;
		padding: 3px 8px;
		outline: none;
	}
	.cm-input:focus { border-color: var(--text-accent); }
</style>
