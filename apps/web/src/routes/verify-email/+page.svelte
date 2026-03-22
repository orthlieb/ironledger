<script lang="ts">
	import type { PageData } from './$types';
	import swordSvg from '$icons/sword.svg?raw';

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
			<div class="error-msg">{data.error}</div>
			<p class="auth-link">
				<a href="/register">Register again</a> or <a href="/login">sign in</a>
			</p>
		{:else}
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

	.auth-info {
		margin-top: 1rem;
		color: var(--text-muted);
	}
</style>
