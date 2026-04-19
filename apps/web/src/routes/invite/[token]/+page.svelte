<script lang="ts">
	import type { ActionData, PageData } from './$types';
	import PasswordInput from '$lib/components/PasswordInput.svelte';
	import swordSvg from '$icons/sharp-axe.svg?raw';

	let { form, data }: { form: ActionData; data: PageData } = $props();

	// Pre-fill the display-name field from the invited value if the admin set one;
	// blank otherwise. User can type over it before submitting.
	let displayName = $state(
		(form?.displayName as string | undefined) ?? data.preview?.displayName ?? '',
	);
</script>

<svelte:head>
	<title>Accept Invitation — Iron Ledger</title>
</svelte:head>

<div class="auth-page">
	<div class="auth-card">
		<div class="auth-brand">
			<span class="auth-brand-rule"></span>
			<h1>
				<span class="auth-brand-icon">{@html swordSvg}</span>
				Iron Ledger
			</h1>
			<span class="auth-brand-rule"></span>
		</div>
		<p class="hero-caption">You have been invited.</p>

		{#if data.error}
			<div class="error-msg">{data.error}</div>
			<p class="auth-link"><a href="/login">Go to sign in</a></p>
		{:else if data.preview}
			<p class="invite-intro">
				An Iron Ledger admin has opened an account for
				<strong>{data.preview.email}</strong>. Set a password below to finish
				claiming it. This link expires on {new Date(data.preview.expiresAt).toLocaleString()}.
			</p>

			{#if data.alreadySignedIn}
				<div class="info-msg">
					You are currently signed in as a different account. Accepting this invitation
					will sign you in as <strong>{data.preview.email}</strong>.
				</div>
			{/if}

			{#if form?.error}
				<div class="error-msg">{form.error}</div>
			{/if}

			<form method="POST" class="auth-form">
				<label class="field-group">
					<span>Display name <span class="field-optional">— shown in Iron Ledger</span></span>
					<input
						type="text"
						name="displayName"
						autocomplete="nickname"
						maxlength="80"
						bind:value={displayName}
					/>
				</label>

				<PasswordInput
					name="password"
					label="Choose a password — 12 characters or more"
					autocomplete="new-password"
					minlength={12}
				/>

				<PasswordInput
					name="confirm"
					label="Confirm password"
					autocomplete="new-password"
					minlength={12}
				/>

				<button type="submit" class="btn btn-primary">Accept Invitation</button>
			</form>
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
	.invite-intro {
		font-size: 0.92rem;
		line-height: 1.6;
		color: var(--text-muted);
		margin: 0.5rem 0 1rem;
	}
	.field-optional {
		color: var(--text-dimmer);
		font-size: 0.85em;
		font-weight: normal;
	}
	.info-msg {
		padding: 10px 12px;
		border: 1px solid var(--border-mid);
		border-radius: 4px;
		background: var(--bg-inset);
		font-size: 0.82rem;
		line-height: 1.55;
		color: var(--text-muted);
		margin-bottom: 1rem;
	}
</style>
