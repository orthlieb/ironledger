<script lang="ts">
	import type { PageData } from './$types';
	import type { CharacterFull } from '$lib/api.js';
	import { characters as api } from '$lib/api.js';
	import CharacterSheet from '$lib/components/CharacterSheet.svelte';
	import { untrack } from 'svelte';
	import importSvg from '$lib/images/file-arrow-up-solid.svg?raw';

	let { data }: { data: PageData } = $props();

	// Deep-reactive list — initialised from SSR data on first load.
	// untrack() prevents the rune from re-running when data.characters changes;
	// we own this list from here on and mutate it directly.
	let chars = $state<CharacterFull[]>(untrack(() => data.characters));

	let creating  = $state(false);
	let importing = $state(false);
	let createError = $state('');

	// Hidden file input reference for JSON import
	let importInput: HTMLInputElement;

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

	async function importCharacter(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;

		importing = true;
		createError = '';
		try {
			const text = await file.text();
			const parsed = JSON.parse(text) as { name?: string; data?: Record<string, unknown> };
			const name = parsed.name ?? 'Imported Character';
			const data = parsed.data ?? {};
			const newChar = await api.create(name, data);
			chars = [newChar, ...chars];
		} catch {
			createError = 'Could not import character. Make sure the file is a valid Iron Ledger JSON export.';
		} finally {
			importing = false;
			// Reset input so the same file can be reimported if needed
			importInput.value = '';
		}
	}
</script>

<svelte:head>
	<title>Characters — Iron Ledger</title>
</svelte:head>

<!-- Hidden file input for JSON import -->
<input
	bind:this={importInput}
	type="file"
	accept=".json,application/json"
	style="display: none"
	onchange={importCharacter}
/>

<div class="page-header">
	<h1>Characters</h1>
	<div class="header-actions">
		<button
			class="btn icon-btn"
			onclick={() => importInput.click()}
			disabled={importing}
			title="Import character from JSON"
			aria-label="Import character from JSON"
		>{@html importSvg}{importing ? ' Importing…' : ' Import'}</button>
		<button
			class="btn btn-primary"
			onclick={addCharacter}
			disabled={creating}
		>
			{creating ? 'Creating…' : '+ New Character'}
		</button>
	</div>
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
	.header-actions {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.icon-btn {
		display: inline-flex;
		align-items: center;
		gap: 5px;
	}

	.icon-btn :global(svg) {
		width: 13px;
		height: 13px;
		fill: currentColor;
		flex-shrink: 0;
	}

	.char-list {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
</style>
