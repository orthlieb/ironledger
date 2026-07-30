<script lang="ts">
	/**
	 * SessionExpiredBanner — full-width red banner pinned to the top of the
	 * viewport when `sessionState.expired` flips true (any auth-gated fetch
	 * returned 401). Purely presentational; the redirect to /login is
	 * scheduled by `triggerSessionExpired()` in sessionGuard, so this
	 * component only has to render + fade in.
	 */

	import { fly, fade } from 'svelte/transition';
	import { sessionState } from '$lib/sessionGuard.svelte.js';
</script>

{#if sessionState.expired}
	<div
		class="seb"
		role="alert"
		aria-live="assertive"
		in:fly={{ y: -24, duration: 220 }}
		out:fade={{ duration: 180 }}
	>
		<span class="seb-icon" aria-hidden="true">&#9888;</span>
		<span class="seb-text">Your session has expired. Redirecting to sign in…</span>
	</div>
{/if}

<style>
	.seb {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		z-index: 100;
		padding: 10px 16px;
		background: color-mix(in srgb, var(--color-danger, #ef4444) 22%, var(--bg-card));
		border-bottom: 1px solid var(--color-danger, #ef4444);
		color: var(--color-danger, #ef4444);
		font-family: var(--font-ui);
		font-size: 0.85rem;
		font-weight: 600;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 10px;
		box-shadow: 0 4px 16px #00000040;
	}
	.seb-icon {
		font-size: 1rem;
	}
</style>
