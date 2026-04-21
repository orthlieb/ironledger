<script lang="ts">
	import type { ActionData, PageData } from './$types';
	import PasswordInput from '$lib/components/PasswordInput.svelte';
	import swordSvg from '$icons/sharp-axe.svg?raw';
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { signInWithPasskey, isPasskeySupported } from '$lib/passkey.js';

	let { form, data }: { form: ActionData; data: PageData } = $props();

	const captchaTheme = browser
		? ((localStorage.getItem('theme') as 'dark' | 'light' | null) ?? 'auto')
		: 'auto';

	// Passkey sign-in — JS-driven; the password form remains the default path.
	let passkeyBusy  = $state(false);
	let passkeyError = $state('');
	const passkeySupported = browser && isPasskeySupported();

	async function handlePasskeyLogin() {
		passkeyError = '';
		passkeyBusy  = true;
		try {
			await signInWithPasskey();
			await goto('/home');
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			// User cancel / NotAllowedError is expected when they dismiss the prompt.
			if (!/cancel|aborted|NotAllowedError/i.test(msg)) {
				passkeyError = msg;
			}
		} finally {
			passkeyBusy = false;
		}
	}
</script>

<svelte:head>
	<title>Sign In — Iron Ledger</title>
	{#if !data.isDev}
		<script src="https://js.hcaptcha.com/1/api.js" async defer></script>
	{/if}
</svelte:head>

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
			<p class="hero-caption">{data.tagline}</p>
		</div>

		{#if (form as any)?.maintenance}
			<div class="maintenance-banner">
				<strong>Under Construction</strong> — {(form as any).message}
			</div>
		{:else if form?.error}
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

			<label class="remember-me-row">
				<input type="checkbox" name="rememberMe" />
				<span>Remember me for 30 days</span>
			</label>

			<button type="submit" class="btn btn-primary">Sign In</button>
		</form>

		{#if passkeySupported}
			<div class="passkey-divider" aria-hidden="true"><span>or</span></div>
			<button
				type="button"
				class="btn passkey-btn"
				onclick={handlePasskeyLogin}
				disabled={passkeyBusy}
			>
				{passkeyBusy ? 'Waiting for passkey…' : 'Sign in with a passkey'}
			</button>
			{#if passkeyError}
				<div class="error-msg">{passkeyError}</div>
			{/if}
		{/if}

		<p class="auth-link">
			No account yet? <a href="/register">Create one</a> · <a href="/forgot-password" class="forgot-link">Forgot password?</a> · <a href="/about" class="forgot-link">About</a>
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

	.remember-me-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-family: var(--font-ui);
		font-size: 0.8rem;
		color: var(--text-muted);
		cursor: pointer;
		user-select: none;
	}

	.remember-me-row input[type='checkbox'] {
		width: 14px;
		height: 14px;
		accent-color: var(--text-accent);
		cursor: pointer;
	}

	.forgot-link {
		color: var(--text-dimmer);
		transition: color 0.12s;
	}

	.forgot-link:hover {
		color: var(--text-accent);
		text-decoration: none;
	}

	/* ── Maintenance banner ────────────────────────────────────────── */
	.maintenance-banner {
		font-family: var(--font-ui);
		font-size: 0.8rem;
		background: rgba(220, 38, 38, 0.1);
		border: 1px solid rgba(220, 38, 38, 0.3);
		border-radius: 5px;
		padding: 0.6rem 0.75rem;
		color: var(--text-muted);
		line-height: 1.5;
	}
	.maintenance-banner strong {
		color: #fca5a5;
	}

	/* ── Passkey divider + button ───────────────────────────────── */
	.passkey-divider {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin: 0.8rem 0 0.5rem;
		color: var(--text-dimmer);
		font-family: var(--font-ui);
		font-size: 0.72rem;
		text-transform: uppercase;
		letter-spacing: 0.1em;
	}
	.passkey-divider::before,
	.passkey-divider::after {
		content: '';
		flex: 1;
		height: 1px;
		background: var(--border);
	}
	.passkey-btn {
		width: 100%;
	}
</style>
