<script lang="ts">
	import type { PageData } from './$types';
	import CharacterSheet from '$lib/components/CharacterSheet.svelte';
	import { goto } from '$app/navigation';

	let { data }: { data: PageData } = $props();

	let deleteForm: HTMLFormElement;
	let confirmingDelete = $state(false);

	function handleDelete() {
		if (confirmingDelete) {
			deleteForm.requestSubmit();
		} else {
			confirmingDelete = true;
		}
	}
</script>

<svelte:head>
	<title>{data.character.name} — Iron Ledger</title>
</svelte:head>

<div class="breadcrumb">
	<a href="/characters">← All characters</a>
</div>

<!-- The hidden form that does the actual deletion via a server action -->
<form
	method="POST"
	action="?/delete"
	bind:this={deleteForm}
	style="display: none"
></form>

<CharacterSheet
	character={data.character}
	onDelete={handleDelete}
/>

{#if confirmingDelete}
	<div class="delete-confirm-bar">
		<span>Delete <strong>{data.character.name}</strong>? This cannot be undone.</span>
		<button class="btn btn-danger" onclick={() => deleteForm.requestSubmit()}>
			Yes, delete
		</button>
		<button class="btn" onclick={() => (confirmingDelete = false)}>Cancel</button>
	</div>
{/if}

<style>
	.delete-confirm-bar {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 1rem;
		padding: 12px 1rem;
		background: #450a0a;
		border-top: 1px solid #991b1b;
		color: #fca5a5;
		font-size: 0.9rem;
		z-index: 100;
	}
</style>
