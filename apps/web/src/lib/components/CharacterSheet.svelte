<script lang="ts">
	/**
	 * CharacterSheet — full character editor.
	 * Ported from YRT 08-characters.js + 08b-assets.js into Svelte 5.
	 *
	 * State is a deep-reactive $state object mirroring the DB jsonb column.
	 * Auto-saves to the API 1.5 s after the last change (debounced).
	 */
	import type { CharacterFull } from '$lib/api.js';
	import type { Vow } from '$lib/types.js';
	import { DEFAULT_CHARACTER } from '$lib/types.js';
	import {
		maxMomentum,
		momentumReset,
		countDebilities,
		hydrateCharacter,
	} from '$lib/character.js';
	import { untrack } from 'svelte';
	import { characters } from '$lib/api.js';

	import trashSvg      from '$lib/images/trash-solid.svg?raw';
	import floppySvg     from '$lib/images/floppy-disk-solid.svg?raw';

	import StatControl      from './StatControl.svelte';
	import MeterControl     from './MeterControl.svelte';
	import XpTrack          from './XpTrack.svelte';
	import ProgressTrack    from './ProgressTrack.svelte';
	import DebilitiesSection from './DebilitiesSection.svelte';
	import VowCard          from './VowCard.svelte';
	import AssetsSection    from './AssetsSection.svelte';

	// ---------------------------------------------------------------------------
	// Props
	// ---------------------------------------------------------------------------
	let {
		character,
		onDelete,
	}: {
		character: CharacterFull;
		onDelete?: () => void;
	} = $props();

	// ---------------------------------------------------------------------------
	// State
	// ---------------------------------------------------------------------------
	// Read the prop once at mount without subscribing to future changes.
	// We own this state from here on — changes are persisted via auto-save.
	// untrack() suppresses the "captured initial value" rune warning correctly.
	let data = $state(untrack(() => hydrateCharacter(character.data)));
	let collapsed = $state(false);
	let confirmingDelete = $state(false);
	let saveStatus = $state<'idle' | 'saving' | 'error'>('idle');
	let saveTimer: ReturnType<typeof setTimeout> | null = null;

	// ---------------------------------------------------------------------------
	// Derived game-logic values (reactive to debility changes)
	// ---------------------------------------------------------------------------
	const momentumMax   = $derived(maxMomentum(data));
	const momentumRstV  = $derived(momentumReset(data));
	const debilityCount = $derived(countDebilities(data));

	// Certain meters have their increment blocked by specific debilities
	const healthIncBlocked  = $derived(data.wounded);
	const spiritIncBlocked  = $derived(data.shaken);

	// ---------------------------------------------------------------------------
	// Auto-save — debounced 1.5 s after any change
	// ---------------------------------------------------------------------------
	$effect(() => {
		// Snapshot serialises the deep-reactive proxy to a plain object
		const snapshot = $state.snapshot(data) as Record<string, unknown>;

		// Cancel pending save
		if (saveTimer) clearTimeout(saveTimer);
		saveStatus = 'idle';

		saveTimer = setTimeout(() => {
			void save(snapshot);
		}, 1500);

		// Cleanup: cancel timer when component is destroyed
		return () => {
			if (saveTimer) clearTimeout(saveTimer);
		};
	});

	async function save(snapshot: Record<string, unknown>) {
		saveStatus = 'saving';
		try {
			await characters.update(character.id, {
				name: (snapshot.name as string) || 'New Character',
				data: snapshot,
			});
			saveStatus = 'idle';
		} catch (err) {
			console.error('Auto-save failed:', err);
			saveStatus = 'error';
		}
	}

	// ---------------------------------------------------------------------------
	// Vow helpers
	// ---------------------------------------------------------------------------
	function addVow() {
		data.vows = [
			...data.vows,
			{
				id: crypto.randomUUID(),
				name: '',
				difficulty: 'formidable',
				ticks: 0,
				threat: '',
				menace: 0,
			} satisfies Vow,
		];
	}

	function removeVow(id: string) {
		data.vows = data.vows.filter((v) => v.id !== id);
	}

	// ---------------------------------------------------------------------------
	// Export — download character as JSON
	// ---------------------------------------------------------------------------
	function exportCharacter() {
		const snapshot = $state.snapshot(data);
		const blob = new Blob([JSON.stringify({ name: character.name, data: snapshot }, null, 2)], {
			type: 'application/json',
		});
		const url  = URL.createObjectURL(blob);
		const link = document.createElement('a');
		const safeName = (character.name || 'character').replace(/[^a-z0-9_\-]+/gi, '_');
		link.href     = url;
		link.download = `${safeName}.json`;
		link.click();
		URL.revokeObjectURL(url);
	}

	// ---------------------------------------------------------------------------
	// Portrait upload (mirror YRT: resize to 256 px JPEG)
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
				canvas.width = size;
				canvas.height = size;
				const ctx = canvas.getContext('2d')!;
				// Centre-crop to square
				const side = Math.min(img.width, img.height);
				const sx   = (img.width  - side) / 2;
				const sy   = (img.height - side) / 2;
				ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
				data.portrait = canvas.toDataURL('image/jpeg', 0.85);
			};
			img.src = reader.result as string;
		};
		reader.readAsDataURL(file);
	}
</script>

<!-- ============================================================
     Character Card
     ============================================================ -->
<div class="char-card" class:collapsed>

	<!-- Header ------------------------------------------------- -->
	<div class="char-header">
		<button
			class="collapse-btn btn btn-icon"
			onclick={() => (collapsed = !collapsed)}
			aria-label={collapsed ? 'Expand character' : 'Collapse character'}
			title={collapsed ? 'Expand' : 'Collapse'}
		>
			{collapsed ? '▶' : '▼'}
		</button>

		<!-- Portrait -->
		<label class="portrait-label" title="Click to change portrait">
			{#if data.portrait}
				<img src={data.portrait} alt="Portrait of {data.name}" class="portrait-img" />
			{:else}
				<div class="portrait-placeholder">👤</div>
			{/if}
			<input
				type="file"
				accept="image/*"
				class="portrait-input"
				onchange={handlePortrait}
				aria-label="Upload portrait"
			/>
		</label>

		<span class="char-title">{data.name || 'Unnamed'}</span>

		<span
			class="save-status"
			class:saving={saveStatus === 'saving'}
			class:error={saveStatus === 'error'}
		>
			{#if saveStatus === 'saving'}Saving…{/if}
			{#if saveStatus === 'error'}Save failed!{/if}
		</span>

		<!-- Export button — always visible -->
		<button
			class="btn btn-icon icon-btn"
			onclick={exportCharacter}
			title="Export character as JSON"
			aria-label="Export character as JSON"
		>{@html floppySvg}</button>

		{#if onDelete}
			{#if confirmingDelete}
				<span class="delete-confirm">
					<span class="delete-confirm-label">Delete?</span>
					<button class="btn btn-danger btn-sm" onclick={() => onDelete!()}>Yes</button>
					<button class="btn btn-sm" onclick={() => (confirmingDelete = false)}>No</button>
				</span>
			{:else}
				<button
					class="btn btn-danger btn-icon icon-btn"
					onclick={() => (confirmingDelete = true)}
					title="Delete character"
					aria-label="Delete character"
				>{@html trashSvg}</button>
			{/if}
		{/if}
	</div>

	<!-- Body (collapsible) ------------------------------------- -->
	{#if !collapsed}
		<div class="char-body">

			<!-- Identity -->
			<section class="char-section">
				<div class="identity-fields">
					<label class="field-group">
						<span class="section-label">Name</span>
						<input
							type="text"
							bind:value={data.name}
							placeholder="Character name"
							class="name-input"
						/>
					</label>
					<label class="field-group flex-1">
						<span class="section-label">Background</span>
						<textarea
							bind:value={data.background}
							placeholder="Background, history, or notes…"
							class="background-input"
							rows="2"
						></textarea>
					</label>
				</div>
			</section>

			<div class="section-divider"></div>

			<!-- Stats -->
			<section class="char-section">
				<div class="section-label">Stats</div>
				<div class="stats-row">
					<StatControl label="Edge"   bind:value={data.edge}   color="var(--color-edge)" />
					<StatControl label="Heart"  bind:value={data.heart}  color="var(--color-heart)" />
					<StatControl label="Iron"   bind:value={data.iron}   color="var(--color-iron)" />
					<StatControl label="Shadow" bind:value={data.shadow} color="var(--color-shadow)" />
					<StatControl label="Wits"   bind:value={data.wits}   color="var(--color-wits)" />

					<div class="touched-group">
						<div class="section-label">Touched</div>
						<select bind:value={data.touched} class="touched-select">
							<option value="pure">Pure</option>
							<option value="prime">Prime</option>
							<option value="second">Second</option>
							<option value="third">Third</option>
							<option value="feral">Feral</option>
						</select>
						<input
							type="text"
							bind:value={data.touchedAnimal}
							placeholder="Animal…"
							class="animal-input"
							aria-label="Touched animal"
						/>
					</div>
				</div>
			</section>

			<div class="section-divider"></div>

			<!-- Resources / Meters -->
			<section class="char-section">
				<div class="section-label">
					Resources
					{#if debilityCount > 0}
						<span class="debility-count">({debilityCount} debility{debilityCount > 1 ? 'ies' : ''})</span>
					{/if}
				</div>
				<div class="meters-row">
					<MeterControl
						label="Momentum"
						bind:value={data.momentum}
						color="var(--color-momentum)"
						min={-6}
						max={momentumMax}
						showReset
						resetValue={momentumRstV}
						showMax
					/>
					<MeterControl
						label="Health"
						bind:value={data.health}
						color="var(--color-health)"
						min={0}
						max={5}
						incDisabled={healthIncBlocked}
					/>
					<MeterControl
						label="Spirit"
						bind:value={data.spirit}
						color="var(--color-spirit)"
						min={0}
						max={5}
						incDisabled={spiritIncBlocked}
					/>
					<MeterControl
						label="Supply"
						bind:value={data.supply}
						color="var(--color-supply)"
						min={0}
						max={5}
					/>
					<MeterControl
						label="Mana"
						bind:value={data.mana}
						color="var(--color-mana)"
						min={0}
						max={10}
					/>
				</div>
			</section>

			<div class="section-divider"></div>

			<!-- XP -->
			<section class="char-section">
				<XpTrack bind:value={data.xp} />
			</section>

			<div class="section-divider"></div>

			<!-- Debilities -->
			<section class="char-section">
				<DebilitiesSection {data} />
			</section>

			<div class="section-divider"></div>

			<!-- Bonds & Failures -->
			<section class="char-section tracks-row">
				<ProgressTrack label="Bonds"    bind:value={data.bonds} />
				<ProgressTrack label="Failures" bind:value={data.failures} />
			</section>

			<div class="section-divider"></div>

			<!-- Vows -->
			<section class="char-section">
				<div class="section-header">
					<div class="section-label">Vows</div>
					<button class="btn" onclick={addVow}>+ Vow</button>
				</div>

				{#if data.vows.length === 0}
					<p class="empty-hint">No vows yet.</p>
				{:else}
					<div class="vows-list">
						{#each data.vows as vow, i (vow.id)}
							<VowCard
								bind:vow={data.vows[i]}
								onDelete={() => removeVow(vow.id)}
							/>
						{/each}
					</div>
				{/if}
			</section>

			<div class="section-divider"></div>

			<!-- Assets -->
			<section class="char-section">
				<AssetsSection bind:assets={data.assets} xp={data.xp} />
			</section>

		</div>
	{/if}
</div>

<style>
	/* ---- Card shell ---- */
	.char-card {
		background: var(--bg-card);
		border: 1px solid var(--border);
		border-radius: 5px;
		overflow: hidden;
		box-shadow: inset 0 1px 0 #ffffff04, 0 2px 12px #00000050;
		transition: box-shadow 0.2s;
	}

	/* ---- Header ---- */
	.char-header {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 14px;
		background: var(--bg-inset);
		border-bottom: 1px solid var(--border);
		min-height: 54px;
	}

	.char-title {
		flex: 1;
		font-family: var(--font-display);
		font-weight: 700;
		font-size: 0.82rem;
		letter-spacing: 0.08em;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--text);
	}

	/* Portrait */
	.portrait-label {
		cursor: pointer;
		flex-shrink: 0;
		transition: opacity 0.12s;
	}
	.portrait-label:hover { opacity: 0.85; }

	.portrait-img {
		width: 38px;
		height: 38px;
		border-radius: 50%;
		object-fit: cover;
		border: 1px solid var(--border-mid);
		display: block;
	}

	.portrait-placeholder {
		width: 38px;
		height: 38px;
		border-radius: 50%;
		border: 1px dashed var(--border-mid);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 1.1rem;
		color: var(--text-dimmer);
		background: var(--bg-control);
	}

	.portrait-input {
		display: none;
	}

	/* FA SVG icon sizing inside btn-icon buttons */
	.icon-btn :global(svg) {
		width: 13px;
		height: 13px;
		fill: currentColor;
	}

	/* Delete confirmation */
	.delete-confirm {
		display: flex;
		align-items: center;
		gap: 5px;
		flex-shrink: 0;
	}

	.delete-confirm-label {
		font-family: var(--font-display);
		font-size: 0.58rem;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--color-danger);
		white-space: nowrap;
	}

	.btn-sm {
		padding: 3px 9px;
		font-size: 0.58rem;
	}

	/* Save indicator */
	.save-status {
		font-family: var(--font-display);
		font-size: 0.55rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: transparent;
		transition: color 0.3s;
		flex-shrink: 0;
	}
	.save-status.saving { color: var(--text-dimmer); }
	.save-status.error  { color: var(--color-danger); }

	/* ---- Body ---- */
	.char-body {
		padding: 0;
	}

	.char-section {
		padding: 12px 16px;
	}

	.section-divider {
		height: 1px;
		background: var(--border);
	}

	.section-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 8px;
	}

	/* Identity */
	.identity-fields {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.name-input {
		width: 100%;
		font-family: var(--font-display);
		font-size: 0.88rem;
		font-weight: 600;
		letter-spacing: 0.06em;
	}

	.background-input {
		width: 100%;
		resize: vertical;
		font-size: 0.9rem;
		line-height: 1.55;
	}

	.flex-1 {
		flex: 1;
	}

	/* Stats */
	.stats-row {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		gap: 16px;
	}

	.touched-group {
		display: flex;
		flex-direction: column;
		gap: 5px;
	}

	.touched-select {
		font-size: 0.82rem;
		padding: 4px 7px;
	}

	.animal-input {
		width: 100px;
		font-size: 0.82rem;
		padding: 4px 7px;
	}

	/* Meters */
	.meters-row {
		display: flex;
		flex-wrap: wrap;
		gap: 14px;
		align-items: flex-start;
	}

	.debility-count {
		font-family: var(--font-body);
		font-size: 0.75rem;
		color: var(--color-danger);
		font-weight: 400;
		font-style: italic;
		text-transform: none;
		letter-spacing: 0;
		margin-left: 4px;
	}

	/* Tracks */
	.tracks-row {
		display: flex;
		gap: 2rem;
		flex-wrap: wrap;
	}

	/* Vows */
	.vows-list {
		display: flex;
		flex-direction: column;
		gap: 10px;
		margin-top: 6px;
	}

	.empty-hint {
		font-size: 0.8rem;
		color: var(--text-dimmer);
		font-style: italic;
		margin-top: 4px;
	}

	/* Collapsed state */
	.char-card.collapsed .char-header {
		border-bottom: none;
	}

	/* Accent left-border on hover — forge line */
	.char-card:not(.collapsed) {
		border-left: 2px solid var(--border-mid);
		transition: border-color 0.2s;
	}
	.char-card:not(.collapsed):hover {
		border-left-color: #c98c3850;
	}
</style>
