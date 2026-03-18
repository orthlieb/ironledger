<script lang="ts">
	import { page } from '$app/stores';
</script>

<svelte:head>
	<title>Error — Iron Ledger</title>
</svelte:head>

<div class="error-page">
	<img
		src="/Oopsie.png"
		alt="A fallen knight lies face-down in a forest clearing"
		class="error-image"
	/>
	<div class="error-body">
		<p class="error-code">{$page.status}</p>
		<p class="error-message">{$page.error?.message ?? 'An unexpected error occurred'}</p>
		<a href="/" class="error-home">Return to safety</a>
	</div>
</div>

<style>
	.error-page {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 100dvh;
		padding: 2rem;
		gap: 1.5rem;
		background: var(--bg-base);
	}

	.error-image {
		width: min(480px, 90vw);
		border-radius: 12px;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.35);
	}

	.error-body {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.4rem;
		text-align: center;
	}

	.error-code {
		font-family: var(--font-display);
		font-size: 2.5rem;
		font-weight: 700;
		color: var(--text-accent);
		margin: 0;
		letter-spacing: 0.05em;
	}

	.error-message {
		font-family: var(--font-display);
		font-size: 1rem;
		color: var(--text-muted);
		margin: 0;
		max-width: 40ch;
	}

	.error-home {
		margin-top: 0.75rem;
		font-family: var(--font-display);
		font-size: 0.85rem;
		color: var(--text-accent);
		text-decoration: none;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		border: 1px solid rgba(245, 158, 11, 0.4);
		padding: 0.4rem 1.2rem;
		border-radius: 4px;
		transition: background 0.15s, color 0.15s;
	}

	.error-home:hover {
		background: rgba(245, 158, 11, 0.12);
		color: var(--text-accent);
		text-decoration: none;
	}
</style>
