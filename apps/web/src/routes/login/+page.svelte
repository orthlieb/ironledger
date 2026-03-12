<script lang="ts">
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
</script>

<svelte:head>
	<title>Sign in — Iron Ledger</title>
</svelte:head>

<div class="auth-wrap">
	<div class="auth-card card">
		<h1>⚔ Iron Ledger</h1>
		<h2>Sign in to your account</h2>

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

			<label class="field-group">
				<span>Password</span>
				<input
					type="password"
					name="password"
					required
					autocomplete="current-password"
				/>
			</label>

			<button type="submit" class="btn btn-primary">Sign in</button>
		</form>

		<p class="auth-link">
			No account? <a href="/register">Create one</a>
		</p>
	</div>
</div>
