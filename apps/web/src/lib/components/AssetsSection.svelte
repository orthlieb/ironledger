<script lang="ts">
	/**
	 * Assets section — stub.
	 * Shows the + Asset button (gated on XP ≥ 3) and lists asset IDs.
	 * Full asset picker and card rendering to be wired up later.
	 */
	import type { CharacterAsset } from '$lib/types.js';

	let {
		assets = $bindable<CharacterAsset[]>([]),
		xp = 0,
	}: {
		assets?: CharacterAsset[];
		xp?: number;
	} = $props();

	const canAdd = $derived(xp >= 3);
</script>

<div class="assets-section">
	<div class="assets-header">
		<div class="section-label">Assets</div>
		<button
			class="btn"
			disabled={!canAdd}
			title={canAdd
				? 'Add an asset'
				: 'You need at least 3 XP to add an asset'}
			onclick={() => {
				/* TODO: open asset picker */
				alert('Asset picker coming soon!');
			}}
		>
			+ Asset
		</button>
	</div>

	{#if !canAdd && assets.length === 0}
		<p class="assets-hint">Earn 3 XP to unlock assets.</p>
	{:else if assets.length === 0}
		<p class="assets-hint">No assets yet — click <strong>+ Asset</strong> to add one.</p>
	{:else}
		<div class="asset-list">
			{#each assets as asset (asset.assetId)}
				<!-- TODO: replace with full AssetCard component -->
				<div class="asset-stub">
					<span class="asset-id">{asset.assetId}</span>
					<span class="asset-abilities">
						{asset.abilities.filter(Boolean).length}/{asset.abilities.length} abilities
					</span>
				</div>
			{/each}
		</div>
	{/if}
</div>

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

	/* Placeholder card — will be replaced by real AssetCard */
	.asset-stub {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 8px 10px;
		background: var(--bg-inset);
		border: 1px solid var(--border);
		border-radius: 4px;
		font-size: 0.8rem;
	}

	.asset-id {
		font-family: ui-monospace, monospace;
		color: var(--text-accent);
	}

	.asset-abilities {
		color: var(--text-dimmer);
	}
</style>
