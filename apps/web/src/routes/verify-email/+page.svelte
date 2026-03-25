<script lang="ts">
	import type { PageData } from './$types';
	import swordSvg from '$icons/sharp-axe.svg?raw';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Verify email — Iron Ledger</title>
</svelte:head>

{#if data.maintenance}
	<div class="maintenance-page">
		<img
			src="/ironledger-under-construction.webp"
			alt="A knight surveys a castle under construction"
			class="maintenance-image"
		/>
		<div class="maintenance-body">
			<p class="maintenance-title">Under Construction</p>
			<p class="maintenance-message">{data.maintenanceMessage}</p>
		</div>
	</div>
{:else}
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
					src="/ironledger-email-expired.webp"
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
					src="/ironledger-email-verified.webp"
					alt="A Norse warrior pumps his fist in triumphant relief"
				/>
				<p class="hero-caption">The oath is sworn.</p>
			</div>
			<p class="auth-info">Verifying your account…</p>
		{/if}
	</div>
</div>
{/if}

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

	h2 {
		font-family: var(--font-ui);
		font-style: italic;
		font-weight: 400;
		font-size: 0.95rem;
		color: var(--text-muted);
		margin-bottom: 0.75rem;
	}

	.auth-info {
		margin-top: 1rem;
		color: var(--text-muted);
	}

	/* ── Maintenance mode ─────────────────────────────────────────── */
	.maintenance-page {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 100dvh;
		padding: 2rem;
		gap: 1.5rem;
		background: var(--bg-base);
	}

	.maintenance-image {
		width: min(520px, 90vw);
		border-radius: 12px;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.35);
	}

	.maintenance-body {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.4rem;
		text-align: center;
	}

	.maintenance-title {
		font-family: var(--font-display);
		font-size: 2rem;
		font-weight: 700;
		color: var(--text-accent);
		margin: 0;
		letter-spacing: 0.05em;
	}

	.maintenance-message {
		font-family: var(--font-display);
		font-size: 0.9rem;
		color: var(--text-muted);
		margin: 0;
		max-width: 45ch;
	}
</style>
