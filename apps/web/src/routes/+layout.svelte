<script lang="ts">
	import '../app.css';
	import type { LayoutData } from './$types';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import swordSvg from '$lib/images/sword.svg?raw';

	let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();
</script>

{#if data.user}
	<nav class="app-nav">
		<a href="/characters" class="nav-brand">
			<span class="nav-brand-icon" aria-hidden="true">{@html swordSvg}</span>
			Iron Ledger
		</a>
		<div class="nav-links">
			<ThemeToggle />
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
	/* Span wrapper + SVG sizing for the sword brand icon */
	.nav-brand-icon {
		display: flex;
		align-items: center;
		flex-shrink: 0;
		color: var(--color-mana);
	}

	.nav-brand-icon :global(svg) {
		width: 16px;
		height: 16px;
		fill: currentColor;
	}

	.nav-sep {
		font-size: 0.45rem;
		color: var(--text-dimmer);
		opacity: 0.6;
		user-select: none;
	}
</style>
