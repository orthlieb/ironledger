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

	import trashSvg      from '$icons/trash-solid-full.svg?raw';
	import fileExportSvg from '$icons/file-export-solid-full.svg?raw';

	// Resource icons (stat icons removed per user request)
	import iconHeart    from '$lib/images/icon-heart.svg?raw';
	import iconMomentum from '$lib/images/icon-momentum.svg?raw';
	import iconSpirit   from '$lib/images/icon-spirit.svg?raw';
	import iconSupply   from '$lib/images/icon-supply.svg?raw';
	import iconMana     from '$lib/images/icon-mana.svg?raw';

	import { initLog, appendLog } from '$lib/log.svelte.js';

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
		onSave,
	}: {
		character: CharacterFull;
		onDelete?: () => void;
		onSave?:   (updated: CharacterFull) => void;
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
	let portraitHovered = $state(false);

	// Initialise log for this character on mount
	$effect(() => { initLog(character.id); });

	// ---------------------------------------------------------------------------
	// Log helpers (use character.id directly to avoid stale capture warning)
	// ---------------------------------------------------------------------------
	function logMeter(name: string, oldVal: number, newVal: number) {
		appendLog(character.id, name, `<div>${name}: ${oldVal} → <strong>${newVal}</strong></div>`);
	}

	function logDebility(label: string, active: boolean) {
		appendLog(character.id, 'Debilities',
			`<div>${label}: <strong>${active ? 'Activated' : 'Cleared'}</strong></div>`);
	}

	function logXp(oldVal: number, newVal: number) {
		appendLog(character.id, 'Experience', `<div>XP: ${oldVal} → <strong>${newVal}</strong></div>`);
	}

	function logTrack(name: string, oldVal: number, newVal: number) {
		appendLog(character.id, name, `<div>${name}: ${oldVal} ticks → <strong>${newVal} ticks</strong></div>`);
	}

	function logStat(name: string, oldVal: number, newVal: number) {
		appendLog(character.id, 'Stats', `<div>${name}: ${oldVal} → <strong>${newVal}</strong></div>`);
	}

	function decrementMomentum() {
		const next = Math.max(-6, data.momentum - 1);
		if (next !== data.momentum) { logMeter('Momentum', data.momentum, next); data.momentum = next; }
	}

	function incrementMomentum() {
		const next = Math.min(momentumMax, data.momentum + 1);
		if (next !== data.momentum) { logMeter('Momentum', data.momentum, next); data.momentum = next; }
	}

	function doMomentumReset() {
		const old = data.momentum;
		if (momentumRstV !== old) {
			appendLog(character.id, 'Momentum',
				`<div>Momentum reset: ${old} → <strong>${momentumRstV}</strong></div>`);
			data.momentum = momentumRstV;
		}
	}

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

		// Notify parent immediately (no debounce) so GlobalContextBar reflects live
		// values without waiting for the API round-trip.  untrack() prevents
		// `character` from becoming a reactive dependency of this effect (which would
		// cause an infinite loop when handleSave updates chars → character prop).
		untrack(() => {
			onSave?.({
				...character,
				name: (snapshot.name as string) || character.name,
				data: snapshot,
			});
		});

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
			const updated = await characters.update(character.id, {
				name: (snapshot.name as string) || 'New Character',
				data: snapshot,
			});
			saveStatus = 'idle';
			onSave?.(updated);
		} catch (err) {
			console.error('Auto-save failed:', err);
			saveStatus = 'error';
		}
	}

	// ---------------------------------------------------------------------------
	// Vow helpers
	// ---------------------------------------------------------------------------
	function addVow() {
		const newVow: Vow = {
			id: crypto.randomUUID(),
			name: '',
			difficulty: 'formidable',
			ticks: 0,
			threat: '',
			menace: 0,
		};
		data.vows = [...data.vows, newVow];
		appendLog(character.id, 'Vow',
			`<div>Swore a new iron vow — <strong>Formidable</strong></div>`);
	}

	function removeVow(id: string) {
		data.vows = data.vows.filter((v) => v.id !== id);
	}

	// ---------------------------------------------------------------------------
	// Bond / Failure helpers (one full box = 4 ticks)
	// ---------------------------------------------------------------------------
	const bondsMax    = 40; // 10 boxes × 4 ticks
	const failuresMax = 40;

	function addBond() {
		const old = data.bonds;
		const next = Math.min(bondsMax, data.bonds + 4);
		if (next !== old) { logTrack('Bonds', old, next); data.bonds = next; }
	}
	function removeBond() {
		const old = data.bonds;
		const next = Math.max(0, data.bonds - 4);
		if (next !== old) { logTrack('Bonds', old, next); data.bonds = next; }
	}
	function addFailure() {
		const old = data.failures;
		const next = Math.min(failuresMax, data.failures + 4);
		if (next !== old) { logTrack('Failures', old, next); data.failures = next; }
	}
	function removeFailure() {
		const old = data.failures;
		const next = Math.max(0, data.failures - 4);
		if (next !== old) { logTrack('Failures', old, next); data.failures = next; }
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
			class="collapse-btn"
			onclick={() => (collapsed = !collapsed)}
			aria-label={collapsed ? 'Expand character' : 'Collapse character'}
			title={collapsed ? 'Expand' : 'Collapse'}
		>
			{collapsed ? '▶' : '▼'}
		</button>

		<!-- Portrait -->
		<label
			class="portrait-label"
			title="Click to change portrait"
			onmouseenter={() => (portraitHovered = true)}
			onmouseleave={() => (portraitHovered = false)}
		>
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

		<!-- Portrait lightbox on hover -->
		{#if portraitHovered && data.portrait}
			<div class="portrait-lightbox" aria-hidden="true">
				<img src={data.portrait} alt="Portrait of {data.name}" />
			</div>
		{/if}

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
		>{@html fileExportSvg}</button>

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
					<StatControl
						label="Edge" bind:value={data.edge} color="var(--color-edge)"
						tooltip="Quickness, agility, and prowess in ranged combat"
						onchange={(o, n) => logStat('Edge', o, n)}
					/>
					<StatControl
						label="Heart" bind:value={data.heart} color="var(--color-heart)"
						tooltip="Courage, willpower, empathy, sociability, and loyalty"
						onchange={(o, n) => logStat('Heart', o, n)}
					/>
					<StatControl
						label="Iron" bind:value={data.iron} color="var(--color-iron)"
						tooltip="Physical strength, endurance, and prowess in close combat"
						onchange={(o, n) => logStat('Iron', o, n)}
					/>
					<StatControl
						label="Shadow" bind:value={data.shadow} color="var(--color-shadow)"
						tooltip="Sneakiness, deceptiveness, and cunning"
						onchange={(o, n) => logStat('Shadow', o, n)}
					/>
					<StatControl
						label="Wits" bind:value={data.wits} color="var(--color-wits)"
						tooltip="Expertise, knowledge, and observation"
						onchange={(o, n) => logStat('Wits', o, n)}
					/>

					<div class="touched-group">
						<div class="section-label" style:color="var(--color-touched)">Touched</div>
						<div class="touched-row">
							<select
								class="touched-select"
								style:border-color="var(--color-touched)"
								value={data.touched}
								onchange={(e) => {
									const old = data.touched;
									const next = (e.target as HTMLSelectElement).value as typeof data.touched;
									data.touched = next;
									appendLog(character.id, 'Touched',
										`<div>Touched: <strong>${old}</strong> → <strong>${next}</strong></div>`);
								}}
							>
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
								style:border-color="var(--color-touched)"
								aria-label="Touched animal"
								onblur={(e) => {
									const val = (e.target as HTMLInputElement).value.trim();
									if (val) appendLog(character.id, 'Touched',
										`<div>Touched animal: <strong>${val}</strong></div>`);
								}}
							/>
						</div>
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
					<!-- Momentum: two-row grid — labels on one line, controls on the next -->
					<div class="momentum-group">
						<!-- Label row -->
						<span class="mom-label" style:color="var(--color-momentum)">
							<span class="mom-icon" aria-hidden="true">{@html iconMomentum}</span>
							Momentum
						</span>
						<span class="mom-label" style:color="var(--color-momentum)">Reset</span>
						<span class="mom-label" style:color="var(--color-momentum)">Max</span>
						<!-- Control row -->
						<div class="mom-meter">
							<button
								class="btn btn-icon"
								onclick={decrementMomentum}
								disabled={data.momentum <= -6}
								aria-label="Decrease Momentum"
							>−</button>
							<span
								class="mom-val"
								class:negative={data.momentum < 0}
								style:color={data.momentum < 0 ? 'var(--color-danger)' : 'var(--color-momentum)'}
							>{data.momentum}</span>
							<button
								class="btn btn-icon"
								onclick={incrementMomentum}
								disabled={data.momentum >= momentumMax}
								aria-label="Increase Momentum"
							>+</button>
						</div>
						<div class="mom-reset">
							<button
								class="btn btn-icon momentum-reset-btn"
								onclick={doMomentumReset}
								title="Reset momentum to {momentumRstV}"
								aria-label="Reset momentum"
							>↺</button>
							<span class="mom-val">{momentumRstV}</span>
						</div>
						<span class="mom-val">{momentumMax}</span>
					</div>
					<MeterControl
						label="Health"
						bind:value={data.health}
						color="var(--color-health)"
						min={0}
						max={5}
						incDisabled={healthIncBlocked}
						icon={iconHeart}
						tooltip="Physical condition and readiness"
						onchange={(o, n) => logMeter('Health', o, n)}
					/>
					<MeterControl
						label="Spirit"
						bind:value={data.spirit}
						color="var(--color-spirit)"
						min={0}
						max={5}
						incDisabled={spiritIncBlocked}
						icon={iconSpirit}
						tooltip="Mental fortitude and morale"
						onchange={(o, n) => logMeter('Spirit', o, n)}
					/>
					<MeterControl
						label="Supply"
						bind:value={data.supply}
						color="var(--color-supply)"
						min={0}
						max={5}
						icon={iconSupply}
						tooltip="Available provisions and resources"
						onchange={(o, n) => logMeter('Supply', o, n)}
					/>
					<MeterControl
						label="Mana"
						bind:value={data.mana}
						color="var(--color-mana)"
						min={0}
						max={10}
						icon={iconMana}
						tooltip="Mana seeds — the foundation of Conclave spellcraft"
						onchange={(o, n) => logMeter('Mana', o, n)}
					/>
				</div>
			</section>

			<div class="section-divider"></div>

			<!-- XP + Debilities (side by side) -->
			<section class="char-section">
				<div class="xp-debilities-row">
					<XpTrack bind:value={data.xp} onchange={logXp} />
					<DebilitiesSection {data} onchange={logDebility} />
				</div>
			</section>

			<div class="section-divider"></div>

			<!-- Bonds & Failures -->
			<section class="char-section tracks-row">
				<div class="track-group">
					<div class="section-label">Bonds</div>
					<div class="track-row">
						<ProgressTrack
							label=""
							bind:value={data.bonds}
							onchange={(o, n) => logTrack('Bonds', o, n)}
						/>
						<div class="track-actions">
							<button class="btn btn-track" onclick={addBond} disabled={data.bonds >= bondsMax}>+ Bond</button>
							<button class="btn btn-track" onclick={removeBond} disabled={data.bonds <= 0}>−</button>
						</div>
					</div>
				</div>
				<div class="track-group">
					<div class="section-label">Failures</div>
					<div class="track-row">
						<ProgressTrack
							label=""
							bind:value={data.failures}
							onchange={(o, n) => logTrack('Failures', o, n)}
						/>
						<div class="track-actions">
							<button class="btn btn-track" onclick={addFailure} disabled={data.failures >= failuresMax}>+ Failure</button>
							<button class="btn btn-track" onclick={removeFailure} disabled={data.failures <= 0}>−</button>
						</div>
					</div>
				</div>
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
				<AssetsSection bind:assets={data.assets} characterData={data} characterId={character.id} />
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

	/* ---- Collapse button — flat, no border, blends with header bg ---- */
	.collapse-btn {
		background: transparent;
		border: none;
		color: var(--text-dimmer);
		padding: 3px 5px;
		cursor: pointer;
		font-size: 0.6rem;
		line-height: 1;
		flex-shrink: 0;
		border-radius: 3px;
		font-family: inherit;
		transition: color 0.12s;
	}
	.collapse-btn:hover {
		color: var(--text);
		background: transparent;
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
		position: relative;
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

	/* Portrait lightbox on hover */
	.portrait-lightbox {
		position: absolute;
		left: 10px;
		top: calc(100% + 6px);
		z-index: 200;
		background: var(--bg-card);
		border: 2px solid var(--border-mid);
		border-radius: 8px;
		padding: 4px;
		box-shadow: 0 8px 32px #00000080;
		pointer-events: none;
	}

	.portrait-lightbox img {
		width: 200px;
		height: 200px;
		object-fit: cover;
		border-radius: 5px;
		display: block;
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
		font-family: var(--font-ui);
		font-size: 0.7rem;
		font-weight: 600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--color-danger);
		white-space: nowrap;
	}

	.btn-sm {
		padding: 3px 9px;
		font-size: 0.68rem;
	}

	/* Save indicator */
	.save-status {
		font-family: var(--font-ui);
		font-size: 0.68rem;
		letter-spacing: 0.05em;
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
		font-family: var(--font-ui);
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

	/* The global .section-label has margin-bottom: 6px which stacks with the
	   flex gap and misaligns the Touched select with the stat inputs. Reset it. */
	.touched-group .section-label {
		margin-bottom: 0;
	}

	.touched-row {
		display: flex;
		align-items: center;
		gap: 6px;
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

	/* Momentum: 3-column grid, two rows (labels / controls) */
	.momentum-group {
		display: grid;
		grid-template-columns: auto auto auto;
		grid-template-rows: auto auto;
		align-items: center;
		justify-items: center;
		gap: 3px 10px;
	}

	.mom-label {
		font-family: var(--font-ui);
		font-size: 0.68rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		display: flex;
		align-items: center;
		gap: 4px;
		cursor: default;
	}

	.mom-icon {
		display: flex;
		align-items: center;
		flex-shrink: 0;
	}
	.mom-icon :global(svg) {
		width: 10px;
		height: 10px;
		fill: currentColor;
	}

	.mom-meter {
		display: flex;
		align-items: center;
		gap: 3px;
	}

	.mom-reset {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.mom-val {
		font-family: var(--font-ui);
		font-size: 1.3rem;
		font-weight: 700;
		min-width: 1.8rem;
		text-align: center;
		font-variant-numeric: tabular-nums;
		color: var(--color-momentum);
		line-height: 1;
	}
	.mom-val.negative { color: var(--color-danger); }

	.momentum-reset-btn {
		font-size: 1rem;
		padding: 2px 5px;
		color: var(--text-dimmer);
	}
	.momentum-reset-btn:hover {
		color: var(--color-momentum);
		border-color: var(--color-momentum);
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

	/* XP + Debilities side-by-side */
	.xp-debilities-row {
		display: flex;
		gap: 20px;
		align-items: flex-start;
		flex-wrap: wrap;
	}

	/* Tracks */
	.tracks-row {
		display: flex;
		gap: 2rem;
		flex-wrap: wrap;
	}

	.track-group {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	/* Progress track boxes + action buttons in a single row */
	.track-row {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.track-actions {
		display: flex;
		gap: 4px;
		flex-shrink: 0;
	}

	/* Compact button sized to match progress box height (22px) */
	:global(.btn-track) {
		height: 22px;
		padding: 0 7px;
		font-size: 0.68rem;
		line-height: 1;
		min-width: unset;
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
