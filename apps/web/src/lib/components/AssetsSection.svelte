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
	import type { CharacterAsset, CharacterData } from '$lib/types.js';
	import { loadAssets, findAsset } from '$lib/assetStore.svelte.js';
	import { appendLog } from '$lib/log.svelte.js';
	import AssetCard   from './AssetCard.svelte';
	import AssetPicker from './AssetPicker.svelte';

	let {
		assets = $bindable<CharacterAsset[]>([]),
		characterData,
		characterId,
	}: {
		assets?:       CharacterAsset[];
		characterData: CharacterData;
		characterId:   string;
	} = $props();

	let pickerOpen = $state(false);

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
			abilities: def.abilities.map(() => false),
		};
		if (def.companionHealthMax !== undefined) {
			newEntry.companionHealth = def.companionHealthMax;
		}
		assets = [...assets, newEntry];
		appendLog(characterId, 'Assets',
			`<div>Asset added: <strong>${def.name}</strong> <em>(${def.category})</em> −3 experience</div>`);
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
				{@const def = findAsset(entry.assetId)}
				{#if def}
					<AssetCard
						bind:asset={assets[i]}
						definition={def}
						{characterId}
						onRemove={() => removeAsset(entry.assetId)}
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
