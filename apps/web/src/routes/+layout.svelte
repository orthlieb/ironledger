<script lang="ts">
	import '../app.css';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();
</script>

{#if data.user}
	<nav class="app-nav">
		<a href="/characters" class="nav-brand">⚔ Iron Ledger</a>
		<div class="nav-links">
			<a href="/characters">Characters</a>
			<form method="POST" action="/logout">
				<button type="submit" class="btn btn-icon">Sign out</button>
			</form>
		</div>
	</nav>
{/if}

<main class="app-main">
	{@render children()}
</main>
