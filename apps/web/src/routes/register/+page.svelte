<script lang="ts">
	import type { ActionData } from './$types';
	import PasswordInput from '$lib/components/PasswordInput.svelte';

	let { form }: { form: ActionData } = $props();
</script>

<svelte:head>
	<title>Create account — Iron Ledger</title>
</svelte:head>

<div class="auth-wrap">
	<div class="auth-card card">
		<h1>⚔ Iron Ledger</h1>
		<h2>Create your account</h2>

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
				label="Password (12+ characters)"
				autocomplete="new-password"
				minlength={12}
			/>

			<PasswordInput
				name="confirm"
				label="Confirm password"
				autocomplete="new-password"
				minlength={12}
			/>

			<button type="submit" class="btn btn-primary">Create account</button>
		</form>

		<p class="auth-link">
			Already have an account? <a href="/login">Sign in</a>
		</p>
	</div>
</div>
