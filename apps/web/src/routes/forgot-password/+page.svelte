<script lang="ts">
	import type { ActionData } from './$types';
	import swordSvg from '$lib/images/sword.svg?raw';

	let { form }: { form: ActionData } = $props();
</script>

<svelte:head>
	<title>Forgot Password — Iron Ledger</title>
</svelte:head>

<div class="auth-wrap">
	<div class="auth-card card">
		<div class="auth-brand">
			<div class="auth-brand-rule"></div>
			<h1><span class="auth-brand-icon" aria-hidden="true">{@html swordSvg}</span>Iron Ledger</h1>
			<div class="auth-brand-rule"></div>
		</div>
		<h2>Reset your password</h2>

		{#if form?.sent}
			<div class="success-msg">
				If an account exists for <strong>{form.email}</strong>, a reset link is on its way.
				Check your inbox — and your spam folder.
			</div>
			<p class="auth-link"><a href="/login">← Back to sign in</a></p>
		{:else}
			{#if form?.error}
				<div class="error-msg">{form.error}</div>
			{/if}

			<p class="instruction">
				Enter your email address and we'll send you a link to reset your password.
			</p>

			<form method="POST" class="auth-form">
				<label class="field-group">
					<span>Email</span>
					<input
						type="email"
						name="email"
						required
						autocomplete="email"
						value={form?.email ?? ''}
					/>
				</label>

				<button type="submit" class="btn btn-primary">Send Reset Link</button>
			</form>

			<p class="auth-link">
				Remembered it? <a href="/login">Sign in</a>
			</p>
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

	.instruction {
		font-family: var(--font-body);
		font-size: 0.85rem;
		color: var(--text-muted);
		line-height: 1.5;
		margin: 0 0 0.25rem;
	}

	.success-msg {
		font-family: var(--font-body);
		font-size: 0.88rem;
		line-height: 1.55;
		color: var(--text-muted);
		background: rgba(52, 211, 153, 0.08);
		border: 1px solid rgba(52, 211, 153, 0.25);
		border-radius: 5px;
		padding: 10px 14px;
		margin-bottom: 0.75rem;
	}
</style>
