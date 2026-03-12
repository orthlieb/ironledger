<script lang="ts">
	import '../app.css';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();
</script>

{#if data.user}
	<nav class="app-nav">
		<a href="/characters" class="nav-brand">
			<svg class="nav-brand-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
				<path d="M14.5 2.5L19 7l-1.5 1.5L16 7l-6 6 2 2-1.5 1.5L9 15l-5.5 5.5L2 19l5.5-5.5-1.5-1.5L7.5 10.5l2 2 6-6-1.5-1.5L15.5 4z"/>
			</svg>
			Iron Ledger
		</a>
		<div class="nav-links">
			<a href="/characters">Characters</a>
			<span class="nav-sep" aria-hidden="true">◆</span>
			<form method="POST" action="/logout">
				<button type="submit" class="btn btn-icon">Sign Out</button>
			</form>
		</div>
	</nav>
{/if}

<main class="app-main">
	{@render children()}
</main>

<style>
	.nav-brand-icon {
		width: 16px;
		height: 16px;
		opacity: 0.85;
	}

	.nav-sep {
		font-size: 0.45rem;
		color: var(--text-dimmer);
		opacity: 0.6;
		user-select: none;
	}
</style>
