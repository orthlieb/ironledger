<svelte:head>
	<title>Check your email — Iron Ledger</title>
</svelte:head>

<div class="auth-wrap">
	<div class="auth-card card">
		<h1>⚔ Iron Ledger</h1>
		<h2>Check your email</h2>

		<p class="auth-info">
			We've sent a verification link to your address. Click it to activate your account
			and sign in.
		</p>

		<p class="auth-info muted">
			Didn't receive it? Check your spam folder, or
			<a href="/register">try again</a> with a different address.
		</p>
	</div>
</div>

<style>
	.auth-info {
		margin-top: 1rem;
		line-height: 1.6;
		color: var(--text);
	}
	.auth-info.muted {
		color: var(--text-muted);
		font-size: 0.875rem;
	}
</style>
