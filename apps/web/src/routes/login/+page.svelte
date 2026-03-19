<script lang="ts">
	import type { ActionData } from './$types';
	import PasswordInput from '$lib/components/PasswordInput.svelte';
	import swordSvg from '$icons/sword.svg?raw';

	let { form }: { form: ActionData } = $props();
</script>

<svelte:head>
	<title>Sign In — Iron Ledger</title>
</svelte:head>

{#if (form as any)?.maintenance}
	<div class="maintenance-page">
		<img
			src="/UnderConstruction.png"
			alt="A knight surveys a castle under construction"
			class="maintenance-image"
		/>
		<div class="maintenance-body">
			<p class="maintenance-title">Under Construction</p>
			<p class="maintenance-message">{(form as any).message}</p>
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
{/if}

<style>
	.auth-brand {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-bottom: 0.4rem;
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
