<script lang="ts">
	/**
	 * CommunityCard — collapsible card for a community/region with NPC list.
	 *
	 * Oracle eye buttons open the OraclesDialog directly at the relevant oracle
	 * (bypassing the picker). The dialog handles dice animation and logging.
	 */

	import type { Community, CommunityNpc, NpcRelationship } from '$lib/types.js';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';

	import trashSvg from '$icons/trash-solid-full.svg?raw';
	import eyeSvg   from '$icons/eye.svg?raw';

	// ---------------------------------------------------------------------------
	// Props
	// ---------------------------------------------------------------------------
	let {
		community,
		onChange,
		onDelete,
		onOracleClick,
		focusName = false,
	}: {
		community:       Community;
		onChange:        (updated: Community) => void;
		onDelete:        () => void;
		onOracleClick?:  (key: string, onFill: (value: string) => void) => void;
		focusName?:      boolean;
	} = $props();

	// ---------------------------------------------------------------------------
	// Local UI state
	// ---------------------------------------------------------------------------
	let collapsed       = $state(false);
	let deleteDialogRef = $state<{ open(): void; close(): void } | null>(null);
	let editingName     = $state(false);
	let nameInputEl     = $state<HTMLInputElement | null>(null);
	let nameBeforeEdit  = '';

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

	// NPC relationship options
	const RELATIONSHIPS: { value: NpcRelationship; label: string; color: string }[] = [
		{ value: 'neutral', label: 'Neutral', color: 'var(--text-muted)' },
		{ value: 'bond',    label: 'Bond',    color: '#34d399' },
		{ value: 'foe',     label: 'Foe',     color: '#ef4444' },
	];

	// ---------------------------------------------------------------------------
	// Helpers
	// ---------------------------------------------------------------------------
	function update(patch: Partial<Community>) {
		onChange({ ...community, ...patch });
	}

	// NPC helpers
	function addNpc() {
		const npc: CommunityNpc = {
			id:           crypto.randomUUID(),
			name:         '',
			role:         '',
			goal:         '',
			descriptor:   '',
			relationship: 'neutral',
			notes:        '',
		};
		update({ npcs: [...community.npcs, npc] });
	}

	function updateNpc(npcId: string, patch: Partial<CommunityNpc>) {
		update({
			npcs: community.npcs.map((n) => n.id === npcId ? { ...n, ...patch } : n),
		});
	}

	function removeNpc(npcId: string) {
		update({ npcs: community.npcs.filter((n) => n.id !== npcId) });
	}

	// Name editing
	function startEditName() { nameBeforeEdit = community.name; editingName = true; }
	function commitName(v: string) { editingName = false; update({ name: v.trim() || 'Unnamed Community' }); }
	function cancelName() { editingName = false; update({ name: nameBeforeEdit }); }
</script>

<!-- ── Card ──────────────────────────────────────────────────────────────── -->
<div class="cc-card">

	<!-- Header -->
	<div class="cc-header">
		<button
			class="cc-collapse-btn"
			onclick={() => (collapsed = !collapsed)}
			aria-label={collapsed ? 'Expand' : 'Collapse'}
			title={collapsed ? 'Expand' : 'Collapse'}
		>
			<svg class="cc-chevron" class:cc-chevron--collapsed={collapsed}
				viewBox="0 0 10 6" width="10" height="6">
				<path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.5"
					fill="none" stroke-linecap="round" stroke-linejoin="round"/>
			</svg>
		</button>

		<!-- Name (click to edit) -->
		{#if editingName}
			<input
				bind:this={nameInputEl}
				class="cc-name-input"
				type="text"
				value={community.name}
				onblur={(e) => commitName((e.target as HTMLInputElement).value)}
				onkeydown={(e) => {
					if (e.key === 'Enter')  { commitName((e.target as HTMLInputElement).value); }
					if (e.key === 'Escape') { cancelName(); }
				}}
			/>
		{:else}
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<span class="cc-name" title="Click to rename" onclick={startEditName}>{displayName}</span>
		{/if}

		<!-- Delete -->
		<button
			class="cc-icon-btn cc-icon-btn--danger"
			onclick={() => deleteDialogRef?.open()}
			title="Delete community"
			aria-label="Delete community"
		>{@html trashSvg}</button>
	</div>

	<!-- Body -->
	{#if !collapsed}
		<div class="cc-body">

			<!-- Community fields -->
			<div class="cc-fields">

				<!-- Name row (with oracle) -->
				<div class="cc-field-row">
					<label class="cc-label" for="cc-name-{community.id}">Name</label>
					<div class="cc-input-group">
						<input
							id="cc-name-{community.id}"
							class="cc-input"
							type="text"
							value={community.name}
							oninput={(e) => update({ name: (e.target as HTMLInputElement).value })}
							placeholder="Community name…"
						/>
						<button
							class="cc-oracle-btn"
							title="Roll Settlement Name oracle"
							aria-label="Roll Settlement Name oracle"
							onclick={() => onOracleClick?.('settlementName', (v) => update({ name: v }))}
						>{@html eyeSvg}</button>
					</div>
				</div>

				<!-- Region row (with oracle) -->
				<div class="cc-field-row">
					<label class="cc-label" for="cc-region-{community.id}">Region</label>
					<div class="cc-input-group">
						<input
							id="cc-region-{community.id}"
							class="cc-input"
							type="text"
							value={community.region}
							oninput={(e) => update({ region: (e.target as HTMLInputElement).value })}
							placeholder="Region…"
						/>
						<button
							class="cc-oracle-btn"
							title="Roll Region oracle"
							aria-label="Roll Region oracle"
							onclick={() => onOracleClick?.('region', (v) => update({ region: v }))}
						>{@html eyeSvg}</button>
					</div>
				</div>

				<!-- Location row (with oracle) -->
				<div class="cc-field-row">
					<label class="cc-label" for="cc-location-{community.id}">Location</label>
					<div class="cc-input-group">
						<input
							id="cc-location-{community.id}"
							class="cc-input"
							type="text"
							value={community.location}
							oninput={(e) => update({ location: (e.target as HTMLInputElement).value })}
							placeholder="Location…"
						/>
						<button
							class="cc-oracle-btn"
							title="Roll Location oracle"
							aria-label="Roll Location oracle"
							onclick={() => onOracleClick?.('location', (v) => update({ location: v }))}
						>{@html eyeSvg}</button>
					</div>
				</div>

				<!-- Location description row (with oracle) -->
				<div class="cc-field-row">
					<label class="cc-label" for="cc-locdesc-{community.id}">Description</label>
					<div class="cc-input-group">
						<input
							id="cc-locdesc-{community.id}"
							class="cc-input"
							type="text"
							value={community.locationDescription}
							oninput={(e) => update({ locationDescription: (e.target as HTMLInputElement).value })}
							placeholder="Location description…"
						/>
						<button
							class="cc-oracle-btn"
							title="Roll Location Descriptor oracle"
							aria-label="Roll Location Descriptor oracle"
							onclick={() => onOracleClick?.('locationDescriptor', (v) => update({ locationDescription: v }))}
						>{@html eyeSvg}</button>
					</div>
				</div>

				<!-- Trouble row (with oracle) -->
				<div class="cc-field-row">
					<label class="cc-label" for="cc-trouble-{community.id}">Trouble</label>
					<div class="cc-input-group">
						<input
							id="cc-trouble-{community.id}"
							class="cc-input"
							type="text"
							value={community.trouble}
							oninput={(e) => update({ trouble: (e.target as HTMLInputElement).value })}
							placeholder="Settlement trouble…"
						/>
						<button
							class="cc-oracle-btn"
							title="Roll Settlement Trouble oracle"
							aria-label="Roll Settlement Trouble oracle"
							onclick={() => onOracleClick?.('settlementTrouble', (v) => update({ trouble: v }))}
						>{@html eyeSvg}</button>
					</div>
				</div>

				<!-- Notes (no oracle) -->
				<div class="cc-field-row cc-field-row--full">
					<label class="cc-label" for="cc-notes-{community.id}">Notes</label>
					<textarea
						id="cc-notes-{community.id}"
						class="cc-textarea"
						value={community.notes}
						oninput={(e) => update({ notes: (e.target as HTMLTextAreaElement).value })}
						placeholder="Notes…"
						rows="3"
					></textarea>
				</div>

			</div>

			<!-- NPC section -->
			<div class="cc-npc-section">
				<div class="cc-npc-header">
					<span class="cc-npc-title">NPCs</span>
					<button class="cc-add-npc-btn" onclick={addNpc}>+ Add NPC</button>
				</div>

				{#if community.npcs.length === 0}
					<div class="cc-npc-empty">No NPCs yet — click <strong>+ Add NPC</strong> to add one.</div>
				{:else}
					<div class="cc-npc-list">
						{#each community.npcs as npc (npc.id)}
							<div class="cc-npc-card">

								<!-- NPC header row: name + relationship + delete -->
								<div class="cc-npc-top">
									<input
										class="cc-input cc-npc-name-input"
										type="text"
										value={npc.name}
										oninput={(e) => updateNpc(npc.id, { name: (e.target as HTMLInputElement).value })}
										placeholder="NPC name…"
									/>

									<!-- Relationship pill buttons -->
									<div class="cc-rel-group">
										{#each RELATIONSHIPS as rel}
											<button
												class="cc-rel-btn"
												class:cc-rel-btn--active={npc.relationship === rel.value}
												style={npc.relationship === rel.value ? `color: ${rel.color}; border-color: ${rel.color}; background: color-mix(in srgb, ${rel.color} 12%, transparent)` : ''}
												onclick={() => updateNpc(npc.id, { relationship: rel.value })}
											>{rel.label}</button>
										{/each}
									</div>

									<button
										class="cc-icon-btn cc-icon-btn--danger"
										onclick={() => removeNpc(npc.id)}
										title="Remove NPC"
										aria-label="Remove NPC"
									>{@html trashSvg}</button>
								</div>

								<!-- NPC fields: role, goal, descriptor (all with oracle) -->
								<div class="cc-npc-fields">

									<div class="cc-field-row">
										<label class="cc-label" for="cc-role-{npc.id}">Role</label>
										<div class="cc-input-group">
											<input
												id="cc-role-{npc.id}"
												class="cc-input"
												type="text"
												value={npc.role}
												oninput={(e) => updateNpc(npc.id, { role: (e.target as HTMLInputElement).value })}
												placeholder="Role…"
											/>
											<button
												class="cc-oracle-btn"
												title="Roll Character Role oracle"
												aria-label="Roll Character Role oracle"
												onclick={() => onOracleClick?.('characterRole', (v) => updateNpc(npc.id, { role: v }))}
											>{@html eyeSvg}</button>
										</div>
									</div>

									<div class="cc-field-row">
										<label class="cc-label" for="cc-goal-{npc.id}">Goal</label>
										<div class="cc-input-group">
											<input
												id="cc-goal-{npc.id}"
												class="cc-input"
												type="text"
												value={npc.goal}
												oninput={(e) => updateNpc(npc.id, { goal: (e.target as HTMLInputElement).value })}
												placeholder="Goal…"
											/>
											<button
												class="cc-oracle-btn"
												title="Roll Character Goal oracle"
												aria-label="Roll Character Goal oracle"
												onclick={() => onOracleClick?.('characterGoal', (v) => updateNpc(npc.id, { goal: v }))}
											>{@html eyeSvg}</button>
										</div>
									</div>

									<div class="cc-field-row">
										<label class="cc-label" for="cc-descriptor-{npc.id}">Descriptor</label>
										<div class="cc-input-group">
											<input
												id="cc-descriptor-{npc.id}"
												class="cc-input"
												type="text"
												value={npc.descriptor}
												oninput={(e) => updateNpc(npc.id, { descriptor: (e.target as HTMLInputElement).value })}
												placeholder="Descriptor…"
											/>
											<button
												class="cc-oracle-btn"
												title="Roll Character Descriptor oracle"
												aria-label="Roll Character Descriptor oracle"
												onclick={() => onOracleClick?.('characterDescriptor', (v) => updateNpc(npc.id, { descriptor: v }))}
											>{@html eyeSvg}</button>
										</div>
									</div>

									<!-- Notes (no oracle) -->
									<div class="cc-field-row cc-field-row--full">
										<label class="cc-label" for="cc-npcnotes-{npc.id}">Notes</label>
										<textarea
											id="cc-npcnotes-{npc.id}"
											class="cc-textarea"
											value={npc.notes}
											oninput={(e) => updateNpc(npc.id, { notes: (e.target as HTMLTextAreaElement).value })}
											placeholder="Notes about this NPC…"
											rows="2"
										></textarea>
									</div>

								</div>
							</div>
						{/each}
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
		Delete <strong>{displayName}</strong> and all its NPCs? This cannot be undone.
	</p>
</ConfirmDialog>

<style>
	/* ── Card shell ─────────────────────────────────────────────────── */
	.cc-card {
		background:    var(--surface-1);
		border:        1px solid var(--border);
		border-radius: 8px;
		overflow:      hidden;
	}

	/* ── Header ─────────────────────────────────────────────────────── */
	.cc-header {
		display:      flex;
		align-items:  center;
		gap:          8px;
		padding:      8px 10px;
		background:   var(--surface-2);
		border-bottom: 1px solid var(--border);
		min-height:   40px;
	}

	.cc-collapse-btn {
		background:  none;
		border:      none;
		cursor:      pointer;
		color:       var(--text-muted);
		padding:     2px;
		line-height: 1;
		flex-shrink: 0;
	}
	.cc-collapse-btn:hover { color: var(--text); }

	.cc-chevron {
		transition: transform 0.15s;
	}
	.cc-chevron--collapsed { transform: rotate(-90deg); }

	.cc-name {
		flex:          1;
		font-family:   var(--font-ui);
		font-size:     0.85rem;
		font-weight:   600;
		color:         var(--text);
		cursor:        text;
		overflow:      hidden;
		text-overflow: ellipsis;
		white-space:   nowrap;
	}
	.cc-name:hover { color: var(--accent); }

	.cc-name-input {
		flex:        1;
		font-family: var(--font-ui);
		font-size:   0.85rem;
		font-weight: 600;
		background:  var(--input-bg);
		border:      1px solid var(--accent);
		border-radius: 4px;
		color:       var(--text);
		padding:     2px 6px;
		outline:     none;
		min-width:   0;
	}

	/* ── Icon buttons ────────────────────────────────────────────────── */
	.cc-icon-btn {
		background:  none;
		border:      none;
		cursor:      pointer;
		color:       var(--text-dimmer);
		padding:     3px;
		line-height: 1;
		flex-shrink: 0;
		border-radius: 4px;
	}
	.cc-icon-btn :global(svg) { width: 14px; height: 14px; display: block; fill: currentColor; }
	.cc-icon-btn:hover { color: var(--text); }
	.cc-icon-btn--danger:hover { color: var(--color-danger); }

	/* ── Body ────────────────────────────────────────────────────────── */
	.cc-body {
		padding: 12px 14px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	/* ── Community fields ────────────────────────────────────────────── */
	.cc-fields {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.cc-field-row {
		display:     flex;
		align-items: center;
		gap:         8px;
	}
	.cc-field-row--full { align-items: flex-start; }

	.cc-label {
		font-family:  var(--font-ui);
		font-size:    0.65rem;
		font-weight:  600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color:        var(--text-dimmer);
		white-space:  nowrap;
		width:        76px;
		flex-shrink:  0;
	}

	.cc-input-group {
		display:   flex;
		flex:      1;
		gap:       4px;
		min-width: 0;
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
	.cc-input:focus { border-color: var(--accent); }

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
	.cc-textarea:focus { border-color: var(--accent); }

	/* ── Oracle button ───────────────────────────────────────────────── */
	.cc-oracle-btn {
		flex-shrink:   0;
		width:         24px;
		height:        24px;
		display:       flex;
		align-items:   center;
		justify-content: center;
		background:    var(--surface-3, var(--surface-2));
		border:        1px solid var(--border);
		border-radius: 4px;
		cursor:        pointer;
		color:         var(--text-dimmer);
		padding:       0;
	}
	.cc-oracle-btn :global(svg) { width: 12px; height: 12px; fill: currentColor; }
	.cc-oracle-btn:hover {
		background: var(--surface-2);
		color:      var(--accent);
		border-color: var(--accent);
	}

	/* ── NPC section ─────────────────────────────────────────────────── */
	.cc-npc-section {
		display:        flex;
		flex-direction: column;
		gap:            8px;
		border-top:     1px solid var(--border);
		padding-top:    12px;
	}

	.cc-npc-header {
		display:     flex;
		align-items: center;
		gap:         8px;
	}

	.cc-npc-title {
		font-family:   var(--font-ui);
		font-size:     0.7rem;
		font-weight:   700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color:         var(--text-muted);
	}

	.cc-add-npc-btn {
		font-family:   var(--font-ui);
		font-size:     0.65rem;
		font-weight:   600;
		background:    transparent;
		border:        1px solid var(--border-mid);
		border-radius: 4px;
		color:         var(--text-muted);
		padding:       2px 8px;
		cursor:        pointer;
	}
	.cc-add-npc-btn:hover { color: var(--text); border-color: var(--accent); }

	.cc-npc-empty {
		font-family: var(--font-ui);
		font-size:   0.72rem;
		color:       var(--text-dimmer);
		font-style:  italic;
		padding:     4px 0;
	}

	.cc-npc-list {
		display:        flex;
		flex-direction: column;
		gap:            10px;
	}

	/* ── NPC card ────────────────────────────────────────────────────── */
	.cc-npc-card {
		background:    var(--surface-2);
		border:        1px solid var(--border);
		border-radius: 6px;
		padding:       8px 10px;
		display:       flex;
		flex-direction: column;
		gap:           8px;
	}

	.cc-npc-top {
		display:     flex;
		align-items: center;
		gap:         6px;
	}

	.cc-npc-name-input {
		flex: 1;
		font-weight: 600;
	}

	/* ── Relationship buttons ────────────────────────────────────────── */
	.cc-rel-group {
		display: flex;
		gap:     3px;
	}

	.cc-rel-btn {
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
	.cc-rel-btn:hover { color: var(--text); border-color: var(--border-mid); }

	/* ── NPC fields ──────────────────────────────────────────────────── */
	.cc-npc-fields {
		display:        flex;
		flex-direction: column;
		gap:            6px;
	}
</style>
