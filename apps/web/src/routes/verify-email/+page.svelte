<script lang="ts">
	import type { PageData } from './$types';
	import swordSvg from '$icons/sharp-axe.svg?raw';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Verify email — Iron Ledger</title>
</svelte:head>

<div class="auth-wrap">
	<div class="auth-card card">
		<div class="auth-brand">
			<div class="auth-brand-rule"></div>
			<h1><span class="auth-brand-icon" aria-hidden="true">{@html swordSvg}</span>Iron Ledger</h1>
			<div class="auth-brand-rule"></div>
		</div>
		<h2>Email verification</h2>

		{#if data.error}
			<div class="hero-image-wrap">
				<img
					class="hero-image"
					src="/viking-burned-scroll.png"
					alt="A Norse warrior holds the charred remains of a scroll with resigned disappointment"
				/>
				<p class="hero-caption">The link has perished.</p>
			</div>
			<div class="error-msg">{data.error}</div>
			<p class="auth-link">
				<a href="/register">Register again</a> or <a href="/login">sign in</a>
			</p>
		{:else}
			<div class="hero-image-wrap">
				<img
					class="hero-image"
					src="/viking-oath-sworn.png"
					alt="A Norse warrior pumps his fist in triumphant relief"
				/>
				<p class="hero-caption">The oath is sworn.</p>
			</div>
			<p class="auth-info">Verifying your account…</p>
		{/if}
	</div>
</div>

<style>
	.auth-brand {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-bottom: 0.4rem;
	}

	.auth-brand-rule {
		flex: 1;
		height: 1px;
		background: linear-gradient(to right, transparent, var(--border-mid));
	}

	.auth-brand-rule:first-child {
		background: linear-gradient(to left, transparent, var(--border-mid));
	}

	h1 {
		display: flex;
		align-items: center;
		gap: 7px;
	}

	.auth-brand-icon {
		display: flex;
		align-items: center;
		line-height: 0;
	}
	.auth-brand-icon :global(svg) {
		width: 18px;
		height: 18px;
		fill: var(--color-mana, #f59e0b);
	}

	h2 { margin-bottom: 0.75rem; }

	.hero-image-wrap {
		display: flex;
		flex-direction: column;
		align-items: center;
		margin: 0 0 0.75rem;
	}

	.hero-image {
		width: 100%;
		height: auto;
		aspect-ratio: 1.82;
		border-radius: 4px;
	}

	.hero-caption {
		font-family: var(--font-display, 'Cinzel', Georgia, serif);
		font-size: 0.875rem;
		color: var(--text-muted);
		font-style: italic;
		margin: 0.5rem 0 0;
		text-align: center;
	}

	.auth-info {
		margin-top: 1rem;
		color: var(--text-muted);
	}
</style>
