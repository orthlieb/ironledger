<script lang="ts">
	import type { ActionData, PageData } from './$types';
	import swordSvg from '$icons/sharp-axe.svg?raw';
	import { browser } from '$app/environment';

	let { form, data }: { form: ActionData; data: PageData } = $props();

	const captchaTheme = browser
		? ((localStorage.getItem('theme') as 'dark' | 'light' | null) ?? 'auto')
		: 'auto';
</script>

<svelte:head>
	<title>Forgot Password — Iron Ledger</title>
	{#if !data.isDev}
		<script src="https://js.hcaptcha.com/1/api.js" async defer></script>
	{/if}
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
		{#if form?.sent}
			<div class="hero-image-wrap">
				<img
					class="hero-image"
					src="/ironledger-forgot-password.webp"
					alt="A Norse smith hammers a new key into shape at the forge"
				/>
				<p class="hero-caption">Forged in fire. Delivered by raven.</p>
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

			<div class="hero-image-wrap">
				<img
					class="hero-image"
					src="/ironledger-reset-password.webp"
					alt="A Norse warrior kneels before an oracle, seeking wisdom he should already have"
				/>
				<p class="hero-caption">Even legends seek counsel.</p>
			</div>

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
					{#if data.isDev}
						<div class="captcha-dev-bypass">⚙ Captcha bypassed in development</div>
						<input type="hidden" name="h-captcha-response" value="dev-bypass" />
					{:else}
						<div class="h-captcha" data-sitekey="{data.hcaptchaSiteKey}" data-theme={captchaTheme}></div>
					{/if}
				</div>

				<button type="submit" class="btn btn-primary">Send Reset Link</button>
			</form>

			<p class="auth-link">
				Remembered it? <a href="/login">Sign in</a>
			</p>
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
		font-family: 'Roboto', sans-serif;
		font-size: 0.85rem;
		color: var(--text-muted);
		line-height: 1.5;
		margin: 0 0 0.25rem;
	}

	.success-msg {
		font-family: 'Roboto', sans-serif;
		font-size: 0.88rem;
		line-height: 1.55;
		color: var(--text-muted);
		background: rgba(52, 211, 153, 0.08);
		border: 1px solid rgba(52, 211, 153, 0.25);
		border-radius: 5px;
		padding: 10px 14px;
		margin-bottom: 0.75rem;
	}
	.captcha-dev-bypass {
		font-size: 0.72rem;
		color: var(--text-dimmer);
		border: 1px dashed var(--border);
		border-radius: 4px;
		padding: 6px 12px;
		width: 100%;
		text-align: center;
	}

	.captcha-wrap {
		display: flex;
		justify-content: center;
		margin: 0.25rem 0;
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
