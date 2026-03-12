<script lang="ts">
	import type { PageData } from './$types';
	import CharacterSheet from '$lib/components/CharacterSheet.svelte';

	let { data }: { data: PageData } = $props();

	let deleteForm: HTMLFormElement;
</script>

<svelte:head>
	<title>{data.character.name} — Iron Ledger</title>
</svelte:head>

<div class="breadcrumb">
	<a href="/characters">← All characters</a>
</div>

<!-- Hidden form that submits the server-side delete action -->
<form
	method="POST"
	action="?/delete"
	bind:this={deleteForm}
	style="display: none"
></form>

<CharacterSheet
	character={data.character}
	onDelete={() => deleteForm.requestSubmit()}
/>
