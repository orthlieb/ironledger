<script lang="ts">
	import type { ActionData, PageData } from './$types';
	import swordSvg from '$icons/sharp-axe.svg?raw';

	let { form, data }: { form: ActionData; data: PageData } = $props();
</script>

<svelte:head>
	<title>Forgot Password — Iron Ledger</title>
	<script src="https://js.hcaptcha.com/1/api.js" async defer></script>
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
			<div class="hero-image-wrap">
				<img
					class="hero-image"
					src="/viking-seer.png"
					alt="A Norse warrior kneels before an oracle, seeking wisdom he should already have"
				/>
				<p class="hero-caption">Even legends seek counsel.</p>
			</div>

			<div class="success-msg">
				A password reset link has been sent to <strong>{form.email}</strong>.
				It expires in one hour.
			</div>
			<p class="auth-info muted">No sign of it? The seer suggests checking your spam folder.</p>
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

				<div class="captcha-wrap">
					<div class="h-captcha" data-sitekey="{data.hcaptchaSiteKey}" data-theme="dark"></div>
				</div>

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
		font-family: var(--font-ui);
		margin-top: 0.75rem;
		line-height: 1.6;
		color: var(--text);
	}
	.auth-info.muted {
		color: var(--text-muted);
		font-size: 0.875rem;
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
	.captcha-wrap {
		display: flex;
		justify-content: center;
		margin: 0.25rem 0;
	}
</style>
