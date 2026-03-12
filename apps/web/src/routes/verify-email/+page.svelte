<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Verify email — Iron Ledger</title>
</svelte:head>

<div class="auth-wrap">
	<div class="auth-card card">
		<h1>⚔ Iron Ledger</h1>
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
	.auth-info {
		margin-top: 1rem;
		color: var(--text-muted);
	}
</style>
