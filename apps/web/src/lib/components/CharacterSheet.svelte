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
				menace: '',
			} satisfies Vow,
		];
	}

	function removeVow(id: string) {
		data.vows = data.vows.filter((v) => v.id !== id);
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

		{#if onDelete}
			<button
				class="btn btn-danger btn-icon"
				onclick={onDelete}
				title="Delete character"
				aria-label="Delete character"
			>🗑</button>
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
		border-radius: 8px;
		overflow: hidden;
	}

	/* ---- Header ---- */
	.char-header {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 12px;
		background: var(--bg-inset);
		border-bottom: 1px solid var(--border);
		min-height: 52px;
	}

	.char-title {
		flex: 1;
		font-weight: 700;
		font-size: 1rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* Portrait */
	.portrait-label {
		cursor: pointer;
		flex-shrink: 0;
	}

	.portrait-img {
		width: 36px;
		height: 36px;
		border-radius: 50%;
		object-fit: cover;
		border: 2px solid var(--border-mid);
		display: block;
	}

	.portrait-placeholder {
		width: 36px;
		height: 36px;
		border-radius: 50%;
		border: 2px dashed var(--border-mid);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 1.2rem;
		color: var(--text-dimmer);
	}

	.portrait-input {
		display: none;
	}

	/* Save indicator */
	.save-status {
		font-size: 0.7rem;
		color: transparent;
		transition: color 0.2s;
	}
	.save-status.saving { color: var(--text-dimmer); }
	.save-status.error  { color: var(--color-danger); }

	/* ---- Body ---- */
	.char-body {
		padding: 0;
	}

	.char-section {
		padding: 12px 14px;
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
		gap: 8px;
	}

	.name-input {
		width: 100%;
		font-size: 1rem;
		font-weight: 600;
	}

	.background-input {
		width: 100%;
		resize: vertical;
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
		gap: 4px;
	}

	.touched-select {
		font-size: 0.8rem;
		padding: 3px 6px;
	}

	.animal-input {
		width: 100px;
		font-size: 0.8rem;
		padding: 3px 6px;
	}

	/* Meters */
	.meters-row {
		display: flex;
		flex-wrap: wrap;
		gap: 14px;
		align-items: flex-start;
	}

	.debility-count {
		font-size: 0.7rem;
		color: var(--color-danger);
		font-weight: 400;
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
</style>
