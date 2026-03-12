<script lang="ts">
	import type { ActionData } from './$types';
	import PasswordInput from '$lib/components/PasswordInput.svelte';

	let { form }: { form: ActionData } = $props();
</script>

<svelte:head>
	<title>Sign In — Iron Ledger</title>
</svelte:head>

<div class="auth-wrap">
	<div class="auth-card card">
		<div class="auth-brand">
			<div class="auth-brand-rule"></div>
			<h1>Iron Ledger</h1>
			<div class="auth-brand-rule"></div>
		</div>
		<h2>Enter your credentials</h2>

		{#if form?.error}
			<div class="error-msg">{form.error}</div>
		{/if}

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

			<PasswordInput
				name="password"
				label="Password"
				autocomplete="current-password"
			/>

			<div class="auth-actions">
				<button type="submit" class="btn btn-primary">Sign In</button>
				<a href="/forgot-password" class="forgot-link">Forgot password?</a>
			</div>
		</form>

		<p class="auth-link">
			No account yet? <a href="/register">Create one</a>
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

	.auth-actions {
		display: flex;
		align-items: center;
		gap: 1rem;
		margin-top: 0.25rem;
	}

	.auth-actions .btn-primary {
		flex: 1;
	}

	.forgot-link {
		font-family: var(--font-body);
		font-size: 0.8rem;
		font-style: italic;
		color: var(--text-dimmer);
		white-space: nowrap;
		transition: color 0.12s;
	}

	.forgot-link:hover {
		color: var(--text-accent);
		text-decoration: none;
	}
</style>
