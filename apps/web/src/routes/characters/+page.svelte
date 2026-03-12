<script lang="ts">
	import type { PageData } from './$types';
	import type { CharacterFull } from '$lib/api.js';
	import { characters as api } from '$lib/api.js';
	import CharacterSheet from '$lib/components/CharacterSheet.svelte';
	import { untrack } from 'svelte';

	let { data }: { data: PageData } = $props();

	// Deep-reactive list — initialised from SSR data on first load.
	// untrack() prevents the rune from re-running when data.characters changes;
	// we own this list from here on and mutate it directly.
	let chars = $state<CharacterFull[]>(untrack(() => data.characters));

	let creating = $state(false);
	let createError = $state('');

	async function addCharacter() {
		if (creating) return;
		creating = true;
		createError = '';
		try {
			const newChar = await api.create('New Character');
			// Prepend so the new card appears at the top
			chars = [newChar, ...chars];
		} catch (err) {
			createError = 'Could not create character. Is the server running?';
			console.error(err);
		} finally {
			creating = false;
		}
	}

	async function deleteCharacter(id: string) {
		try {
			await api.remove(id);
			chars = chars.filter((c) => c.id !== id);
		} catch (err) {
			console.error('Failed to delete character:', err);
		}
	}
</script>

<svelte:head>
	<title>Characters — Iron Ledger</title>
</svelte:head>

<div class="page-header">
	<h1>Characters</h1>
	<button
		class="btn btn-primary"
		onclick={addCharacter}
		disabled={creating}
	>
		{creating ? 'Creating…' : '+ New Character'}
	</button>
</div>

{#if createError}
	<div class="error-msg">{createError}</div>
{/if}

{#if chars.length === 0}
	<div class="empty-state">
		<p>No characters yet.</p>
		<p style="margin-top: 0.5rem; font-size: 0.85rem;">
			Click <strong>+ New Character</strong> to begin your first journey.
		</p>
	</div>
{:else}
	<div class="char-list">
		{#each chars as char (char.id)}
			<CharacterSheet
				character={char}
				onDelete={() => deleteCharacter(char.id)}
			/>
		{/each}
	</div>
{/if}

<style>
	.char-list {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
</style>
