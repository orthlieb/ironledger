<script lang="ts">
	/**
	 * AssetsSection — lists a character's owned assets and hosts the asset picker.
	 *
	 * Data flow:
	 *   CharacterSheet → bind:assets → AssetsSection
	 *   AssetsSection  → bind:asset  → AssetCard (per entry)
	 *   AssetsSection  → onAdd / onClose → AssetPicker
	 *
	 * The catalogue is fetched lazily the first time the picker is opened
	 * (or when this component mounts, so the first click is instant).
	 */
	import type { CharacterAsset, CharacterData, AssetDefinition } from '$lib/types.js';
	import { loadAssets, findAsset, getAssets } from '$lib/assetStore.svelte.js';
	import { appendLog, SESSION_LOG_ID } from '$lib/log.svelte.js';
	import AssetCard     from './AssetCard.svelte';
	import AssetPicker   from './AssetPicker.svelte';
	import ConfirmDialog from './ConfirmDialog.svelte';

	let {
		assets = $bindable<CharacterAsset[]>([]),
		characterData = $bindable<CharacterData>(),
		characterId,
	}: {
		assets?:        CharacterAsset[];
		characterData:  CharacterData;
		characterId:    string;
	} = $props();

	let pickerOpen = $state(false);

	// ── Remove-asset dialog (lifted out of AssetCard to avoid bind:this in keyed {#each}) ──
	let removeTarget    = $state<{ assetId: string; def: AssetDefinition; enabledCount: number } | null>(null);
	let removeDialogRef = $state<{ open(): void; close(): void } | null>(null);

	function requestRemove(assetId: string, def: AssetDefinition, enabledCount: number) {
		removeTarget = { assetId, def, enabledCount };
		removeDialogRef?.open();
	}

	function confirmRemove() {
		if (!removeTarget) return;
		appendLog(SESSION_LOG_ID, `${characterData.name} — Assets`,
			`<div>Asset removed: <strong>${removeTarget.def.name}</strong> (${removeTarget.def.category}, ${removeTarget.enabledCount} marked)</div>`);
		removeAsset(removeTarget.assetId);
		removeTarget = null;
	}

	// Pre-load the catalogue in the background as soon as this section mounts
	$effect(() => { loadAssets(); });

	const ownedIds = $derived(assets.map((a) => a.assetId));

	function openPicker()  { pickerOpen = true;  }
	function closePicker() { pickerOpen = false; }

	function addAsset(assetId: string) {
		if (ownedIds.includes(assetId)) return; // guard against double-add
		const def = findAsset(assetId);
		if (!def) return;
		const newEntry: CharacterAsset = {
			assetId,
			abilities: def.abilities.map((ab) => ab.enabled), // all categories: ability[0].enabled = true
		};
		assets = [...assets, newEntry];
		// Pre-generate the entry id so we can embed it in the XP cost link
		const entryId = crypto.randomUUID();
		const xpLink  = `<a class="xp-cost-link" data-entry-id="${entryId}" data-cost="3" data-char-id="${characterId}" href="#">−3 experience</a>`;
		appendLog(SESSION_LOG_ID, `${characterData.name} — Assets`,
			`<div>Asset added: <strong>${def.name}</strong> <em>(${def.category})</em> ${xpLink}</div>`,
			entryId);
		// Close the picker after successfully adding so the user returns to the sheet
		closePicker();
	}

	function removeAsset(assetId: string) {
		assets = assets.filter((a) => a.assetId !== assetId);
	}
</script>

<div class="assets-section">

	<!-- Section header -->
	<div class="assets-header">
		<div class="section-label">Assets</div>
		<button
			class="btn"
			onclick={openPicker}
			disabled={characterData.xp < 3}
			title={characterData.xp < 3 ? 'Requires 3 XP to acquire an asset' : undefined}
		>+ Asset</button>
	</div>

	<!-- Owned asset cards -->
	{#if assets.length === 0}
		<p class="assets-hint">No assets yet — click <strong>+ Asset</strong> to add one.</p>
	{:else}
		<div class="asset-list">
			{#each assets as entry, i (entry.assetId)}
				{@const _catalogue = getAssets()}
				{@const def = _catalogue.find(a => a.id === entry.assetId)}
				{#if def}
					<AssetCard
						bind:asset={assets[i]}
						definition={def}
						{characterId}
						characterName={characterData.name}
						characterXp={characterData.xp}
						bind:globalValues={characterData.globalValues}
						onRemove={() => requestRemove(entry.assetId, def, assets[i].abilities.filter(Boolean).length)}
					/>
				{:else}
					<!-- Definition not yet loaded or id mismatch — show minimal fallback -->
					<div class="asset-loading">
						<span class="asset-loading-id">{entry.assetId}</span>
						<span class="asset-loading-hint">Loading…</span>
					</div>
				{/if}
			{/each}
		</div>
	{/if}

	<!-- Remove-asset confirmation dialog -->
	<ConfirmDialog
		bind:this={removeDialogRef}
		title="Remove {removeTarget?.def.name ?? 'Asset'}?"
		onconfirm={confirmRemove}
		oncancel={() => (removeTarget = null)}
		confirmLabel="Remove"
		cancelLabel="Keep Asset"
	>
		<div class="rm-body">
			<p>Losing an asset is rare and usually the result of a unique narrative circumstance dictated by the storyline.</p>

			{#if removeTarget?.def.category === 'Companion'}
				<p>
					<strong>Companion Endure Harm:</strong> If your companion is killed or you
					choose to end your bond, roll +Heart. On a strong hit, take +1 spirit. On a
					weak hit, take +1 spirit and suffer −1 momentum. On a miss, you must Endure
					Stress. Gain {removeTarget?.enabledCount ?? 1} XP (1 per marked ability, minimum 1).
				</p>
			{/if}

			<p>
				<strong>Learn From Your Failures:</strong> On a strong hit, you may discard a
				single asset and gain {Math.max(1, (removeTarget?.enabledCount ?? 0) * 2)} XP (2 per marked ability, minimum 1).
			</p>
		</div>
	</ConfirmDialog>

</div>

<!-- Asset picker modal (rendered outside normal flow via native <dialog>) -->
{#if pickerOpen}
	<AssetPicker
		{ownedIds}
		{characterData}
		onAdd={addAsset}
		onClose={closePicker}
	/>
{/if}

<style>
	.assets-section {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.assets-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.assets-hint {
		font-size: 0.8rem;
		color: var(--text-dimmer);
		font-style: italic;
	}

	.asset-list {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	/* ================================================================
	   Remove-asset dialog body
	   ================================================================ */
	.rm-body {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.rm-body p {
		font-family: var(--font-ui);
		font-size: 0.8rem;
		line-height: 1.5;
		color: var(--text-muted);
		margin: 0;
	}

	.rm-body :global(strong) {
		color: var(--text);
		font-weight: 600;
	}

	.btn-primary {
		background: var(--text-accent);
		border-color: var(--text-accent);
		color: var(--bg-card);
		font-weight: 600;
	}
	.btn-primary:hover { opacity: 0.88; }

	/* Fallback row while catalogue is loading */
	.asset-loading {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 7px 10px;
		background: var(--bg-inset);
		border: 1px solid var(--border);
		border-radius: 6px;
		font-family: var(--font-ui);
		font-size: 0.78rem;
		opacity: 0.6;
	}
	.asset-loading-id   { font-style: italic; color: var(--text-muted); }
	.asset-loading-hint { color: var(--text-dimmer); }
</style>
