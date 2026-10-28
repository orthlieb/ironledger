<script lang="ts">
	/**
	 * UpdateBanner — "a new version is out" strip with a Reload button.
	 *
	 * SvelteKit polls /_app/version.json (kit.version.pollInterval in
	 * svelte.config.js) and flips `updated.current` once the deployed build
	 * differs from the one this page is running. That matters most for the
	 * installed app (Chrome / home-screen), whose window can stay open for
	 * days on old code. We also check whenever the window comes back into
	 * view, so a window left in the background learns straight away.
	 *
	 * Until the user reloads, a route change does a full page load instead of
	 * a client-side one, so the old client never asks the new server for code
	 * it no longer serves. Same-page URL changes (query / hash) stay
	 * client-side, so nothing in memory is thrown away mid-edit.
	 *
	 * Reload waits out the stores' 1.5 s autosave debounce first (the app has
	 * no save-on-unload flush), so the last edit isn't lost.
	 */
	import { onMount } from 'svelte';
	import { updated } from '$app/state';
	import { beforeNavigate } from '$app/navigation';

	/** Longer than the 1.5 s trailing autosave debounce in the stores. */
	const SAVE_GRACE_MS = 2000;

	let reloading = $state(false);

	beforeNavigate(({ willUnload, to }) => {
		if (updated.current && !willUnload && to?.url && to.url.pathname !== location.pathname) {
			location.href = to.url.href;
		}
	});

	onMount(() => {
		const onVisible = () => {
			if (document.visibilityState === 'visible') void updated.check();
		};
		document.addEventListener('visibilitychange', onVisible);
		return () => document.removeEventListener('visibilitychange', onVisible);
	});

	function reload() {
		reloading = true;
		// Blur first so a field that saves on blur gets its turn.
		(document.activeElement as HTMLElement | null)?.blur?.();
		setTimeout(() => location.reload(), SAVE_GRACE_MS);
	}
</script>

{#if updated.current}
	<div class="upd-banner" role="status" aria-live="polite">
		<span class="upd-icon" aria-hidden="true">&#x27F3;</span>
		<span class="upd-text">A new version of Iron Ledger is available.</span>
		<button type="button" class="btn btn-primary upd-reload" onclick={reload} disabled={reloading}
			>{reloading ? 'Saving…' : 'Reload'}</button
		>
	</div>
{/if}

<style>
	.upd-banner {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.6rem;
		padding: 6px 16px;
		background: color-mix(in srgb, var(--text-accent) 14%, var(--bg-inset));
		border-bottom: 1px solid color-mix(in srgb, var(--text-accent) 40%, transparent);
		color: var(--text);
		font-family: var(--font-ui);
		font-size: 0.82rem;
		line-height: 1.4;
	}
	.upd-icon {
		flex-shrink: 0;
		font-size: 1rem;
		color: var(--text-accent);
	}
	.upd-reload {
		flex-shrink: 0;
	}
</style>
