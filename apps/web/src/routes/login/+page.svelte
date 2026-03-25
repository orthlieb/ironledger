<script lang="ts">
	import type { ActionData, PageData } from './$types';
	import PasswordInput from '$lib/components/PasswordInput.svelte';
	import swordSvg from '$icons/sharp-axe.svg?raw';
	import { browser } from '$app/environment';

	let { form, data }: { form: ActionData; data: PageData } = $props();

	// Match hCaptcha theme to the app's current theme (set by app.html from localStorage).
	// Must be computed synchronously so the DOM attribute is correct before hCaptcha initialises.
	const captchaTheme = browser
		? ((localStorage.getItem('theme') as 'dark' | 'light' | null) ?? 'auto')
		: 'auto';
</script>

<svelte:head>
	<title>Sign In — Iron Ledger</title>
	{#if !data.isDev}
		<script src="https://js.hcaptcha.com/1/api.js" async defer></script>
	{/if}
</svelte:head>

{#if (form as any)?.maintenance}
	<div class="maintenance-page">
		<img
			src="/ironledger-under-construction.webp"
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
		<div class="hero-image-wrap">
			<img
				class="hero-image"
				src="/ironledger-login.webp"
				alt="A lone Norse warrior stands before the iron-banded doors of a great mead hall, two stern guardians watching"
			/>
			<p class="hero-caption">The gates await. Prove yourself worthy.</p>
		</div>

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

			<div class="captcha-wrap">
				{#if data.isDev}
					<div class="captcha-dev-bypass">⚙ Captcha bypassed in development</div>
					<input type="hidden" name="h-captcha-response" value="dev-bypass" />
				{:else}
					<div class="h-captcha" data-sitekey="{data.hcaptchaSiteKey}" data-theme={captchaTheme}></div>
				{/if}
			</div>

			<button type="submit" class="btn btn-primary">Sign In</button>
		</form>

		<p class="auth-link">
			No account yet? <a href="/register">Create one</a> · <a href="/forgot-password" class="forgot-link">Forgot password?</a> · <a href="/about" class="forgot-link">About</a>
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


	.captcha-wrap {
		display: flex;
		justify-content: center;
		margin: 0.25rem 0;
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

	.forgot-link {
		color: var(--text-dimmer);
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
