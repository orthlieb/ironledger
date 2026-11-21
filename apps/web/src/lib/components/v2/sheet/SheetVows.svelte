<script lang="ts">
	/**
	 * The character sheet's Vows tab: a VowCard per vow, or, with none, a
	 * prompt toward the header's + Vow. `data` is the live character: a vow's
	 * edits land on it directly. Deleting and forsaking go to the parent,
	 * which logs them.
	 */
	import VowCard from '#lib/components/VowCard.svelte';
	import type { CharacterData, Vow } from '#lib/types.js';
	import linkSvg from '#icons/link-solid.svg?raw';

	let {
		data: cd,
		onremove,
		onforsake,
	}: {
		/** The live character data. */
		data: CharacterData;
		onremove: (vowId: string) => void;
		onforsake: (vow: Vow) => void;
	} = $props();
</script>

{#if (cd.vows ?? []).length === 0}
	<div class="ca-empty">
		<span class="ca-empty-icon" aria-hidden="true">{@html linkSvg}</span>
		<p class="ca-empty-text">
			You currently have no vows. Do you want to fade into obscurity or perform great deeds? Click
			<span class="ca-empty-key" role="img" aria-label="Add Vow"
				><span class="ca-empty-key-plus">+</span>{@html linkSvg}</span
			> to swear on iron.
		</p>
	</div>
{:else}
	<div class="ca-vows-list" data-tour="char-vows">
		{#each cd.vows ?? [] as vow, i (vow.id)}
			<VowCard
				bind:vow={cd.vows[i]}
				onDelete={() => onremove(vow.id)}
				onForsake={() => onforsake(cd.vows[i])}
			/>
		{/each}
	</div>
{/if}

<style>
	/* Vows tab — stack of VowCards. The "+ Vow" action lives in the header
	   toolbar now, so no per-tab header is needed. */
	.ca-vows-list {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
</style>
