<script lang="ts">
	import type { ActionData, PageData } from './$types';
	import swordSvg from '$icons/sharp-axe.svg?raw';

	let { form, data }: { form: ActionData; data: PageData } = $props();
</script>

<svelte:head>
	<title>Iron Ledger</title>
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
				<!-- Success: password updated, send the user to /login. -->
				<div class="success-msg">
					Your password has been forged anew. Please <a href="/login">sign in</a>.
				</div>
				<p class="auth-link"><a href="/login">← Back to sign in</a></p>
			{:else if !data.token}
				<!-- Bad link: no token in the URL. -->
				<div class="error-msg">
					This reset link is missing its token. Please request a new one from the
					<a href="/forgot-password">forgot-password</a> page.
				</div>
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
					<p class="hero-caption">A new key, forged for the gate.</p>
				</div>

				<p class="instruction">
					Choose a new password. At least 12 characters, with at least 5 distinct characters.
				</p>

				<form method="POST" class="auth-form">
					<input type="hidden" name="token" value={data.token} />

					<label class="field-group">
						<span>New password</span>
						<input
							type="password"
							name="password"
							required
							minlength="12"
							autocomplete="new-password"
						/>
					</label>

					<label class="field-group">
						<span>Confirm new password</span>
						<input
							type="password"
							name="confirm"
							required
							minlength="12"
							autocomplete="new-password"
						/>
					</label>

					<button type="submit" class="btn btn-primary">Set new password</button>
				</form>

				<p class="auth-link">
					Remembered it after all? <a href="/login">Sign in</a>
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
		fill: var(--text-accent);
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
		font-size: calc(2rem * var(--font-display-scale));
		font-weight: 700;
		color: var(--text-accent);
		margin: 0;
		letter-spacing: 0.05em;
	}

	.maintenance-message {
		font-family: var(--font-display);
		font-size: calc(0.9rem * var(--font-display-scale));
		color: var(--text-muted);
		margin: 0;
		max-width: 45ch;
	}
</style>
