<script lang="ts">
	import type { PageData } from './$types';
	import type { CharacterSummary } from '$lib/api.js';

	let { data }: { data: PageData } = $props();

	function formatDate(iso: string) {
		return new Date(iso).toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
		});
	}
</script>

<svelte:head>
	<title>Characters — Iron Ledger</title>
</svelte:head>

<div class="page-header">
	<h1>Characters</h1>
	<form method="POST" action="?/create">
		<button type="submit" class="btn btn-primary">+ New Character</button>
	</form>
</div>

{#if data.characters.length === 0}
	<div class="empty-state">
		<p>No characters yet.</p>
		<p style="margin-top: 0.5rem; font-size: 0.85rem;">
			Click <strong>+ New Character</strong> to begin your first journey.
		</p>
	</div>
{:else}
	<div class="char-list">
		{#each data.characters as char (char.id)}
			<a href="/characters/{char.id}" class="char-list-item">
				<span class="char-list-name">{char.name}</span>
				<span class="char-list-meta">Updated {formatDate(char.updatedAt)}</span>
			</a>
		{/each}
	</div>
{/if}
