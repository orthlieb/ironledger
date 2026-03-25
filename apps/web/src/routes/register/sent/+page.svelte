<script lang="ts">
	import swordSvg from '$icons/sharp-axe.svg?raw';
</script>

<svelte:head>
	<title>Check your email — Iron Ledger</title>
</svelte:head>

<div class="auth-wrap">
	<div class="auth-card card">
		<div class="auth-brand">
			<div class="auth-brand-rule"></div>
			<h1><span class="auth-brand-icon" aria-hidden="true">{@html swordSvg}</span>Iron Ledger</h1>
			<div class="auth-brand-rule"></div>
		</div>
		<h2>Check your email</h2>

		<div class="hero-image-wrap">
			<img
				class="hero-image"
				src="/viking-scanning.webp"
				alt="A Norse warrior scans the horizon, waiting for your verification to arrive"
			/>
			<p class="hero-caption">The raven has been dispatched.</p>
		</div>

		<p class="auth-info">
			A verification link is on its way to your address. Click it to forge your account
			and begin your chronicle.
		</p>

		<p class="auth-info muted">
			Didn't receive it? Check your spam — even the swiftest ravens go astray. Or
			<a href="/register">try again</a> with a different address.
		</p>
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

	h2 {
		font-family: var(--font-ui);
		font-style: italic;
		font-weight: 400;
		font-size: 0.95rem;
		color: var(--text-muted);
		margin-bottom: 0.75rem;
	}

	.auth-info {
		font-family: var(--font-ui);
		margin-top: 1rem;
		line-height: 1.6;
		color: var(--text);
	}
	.auth-info.muted {
		color: var(--text-muted);
		font-size: 0.875rem;
	}
</style>
