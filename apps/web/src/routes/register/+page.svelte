<script lang="ts">
	import type { ActionData, PageData } from './$types';
	import PasswordInput from '$lib/components/PasswordInput.svelte';
	import swordSvg from '$icons/sharp-axe.svg?raw';
	import { browser } from '$app/environment';

	let { form, data }: { form: ActionData; data: PageData } = $props();

	const captchaTheme = browser
		? ((localStorage.getItem('theme') as 'dark' | 'light' | null) ?? 'auto')
		: 'auto';
</script>

<svelte:head>
	<title>Create Account — Iron Ledger</title>
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
		<h2>Forge your account</h2>

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
				label="Password — 12 characters or more"
				autocomplete="new-password"
				minlength={12}
			/>

			<PasswordInput
				name="confirm"
				label="Confirm password"
				autocomplete="new-password"
				minlength={12}
			/>

			<div class="captcha-wrap">
				{#if data.isDev}
					<div class="captcha-dev-bypass">⚙ Captcha bypassed in development</div>
					<input type="hidden" name="h-captcha-response" value="dev-bypass" />
				{:else}
					<div class="h-captcha" data-sitekey="{data.hcaptchaSiteKey}" data-theme={captchaTheme}></div>
				{/if}
			</div>

			<button type="submit" class="btn btn-primary">Forge Account</button>
		</form>

		<p class="auth-link">
			Already sworn in? <a href="/login">Sign in</a>
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

	h2 {
		font-family: var(--font-ui);
		font-style: italic;
		font-weight: 400;
		font-size: 0.95rem;
		color: var(--text-muted);
		margin-bottom: 0.75rem;
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
</style>
