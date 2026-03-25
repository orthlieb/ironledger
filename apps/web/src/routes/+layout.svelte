<script lang="ts">
	import '../app.css';
	import type { LayoutData } from './$types';
	import type { MaintenanceStatus } from '@ironledger/shared';
	import SettingsDialog from '$lib/components/SettingsDialog.svelte';
	import { maintenance } from '$lib/api';
	import swordSvg from '$icons/sharp-axe.svg?raw';
	import { preloadDice } from '$lib/dice';
	import { page } from '$app/stores';
	import gearSvg from '$icons/gear-solid-full.svg?raw';

	let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();

	let settingsDialog = $state<ReturnType<typeof SettingsDialog> | null>(null);

	// ── Maintenance banner polling ────────────────────────────────────────
	let maintStatus: MaintenanceStatus | null = $state(null);
	let countdown = $state('');
	let countdownInterval: ReturnType<typeof setInterval> | undefined;
	let pollInterval: ReturnType<typeof setInterval> | undefined;

	function updateCountdown() {
		if (!maintStatus?.enabled || !maintStatus.shutdownAt) {
			countdown = '';
			return;
		}
		const diff = new Date(maintStatus.shutdownAt).getTime() - Date.now();
		if (diff <= 0) {
			countdown = 'NOW';
			return;
		}
		const mins = Math.floor(diff / 60_000);
		const secs = Math.floor((diff % 60_000) / 1000);
		countdown = `${mins}:${secs.toString().padStart(2, '0')}`;
	}

	async function pollMaintenance() {
		try {
			maintStatus = await maintenance.getStatus();
		} catch {
			// ignore — don't break the app if the status endpoint is down
		}
	}

	$effect(() => {
		// Preload 3D dice library and WebGL context in the background so the
		// first actual roll doesn't stall waiting for a CDN fetch + GPU init.
		if (data.user) preloadDice();

		// Start polling
		void pollMaintenance();
		pollInterval = setInterval(() => void pollMaintenance(), 10_000);

		return () => {
			clearInterval(pollInterval);
			clearInterval(countdownInterval);
		};
	});

	// Update countdown every second when maintenance is active
	$effect(() => {
		clearInterval(countdownInterval);
		if (maintStatus?.enabled && maintStatus.shutdownAt) {
			updateCountdown();
			countdownInterval = setInterval(updateCountdown, 1000);
		} else {
			countdown = '';
		}
	});
</script>

{#if data.user}
	<nav class="app-nav">
		<a href="/home" class="nav-brand">
			<span class="nav-brand-icon" aria-hidden="true">{@html swordSvg}</span>
			Iron Ledger
		</a>
		<div class="nav-links">
			{#if data.user?.role === 'admin'}
				<a href="/admin" class="btn btn-icon">Admin</a>
				<span class="nav-sep" aria-hidden="true">◆</span>
			{/if}
			<a href="/about" class="btn btn-icon">About</a>
			<span class="nav-sep" aria-hidden="true">◆</span>
			<div class="nav-user-actions">
				<button
					class="nav-settings-btn tooltip-down"
					onclick={() => settingsDialog?.open()}
					aria-label="Settings"
					data-tooltip="Settings"
				>{@html gearSvg}</button>
				<form method="POST" action="/logout">
					<button type="submit" class="btn btn-icon">Sign Out</button>
				</form>
			</div>
		</div>
	</nav>
{/if}

{#if maintStatus?.enabled}
	<div class="maint-banner" class:maint-imminent={countdown === 'NOW'}>
		<span class="maint-icon" aria-hidden="true">&#9888;</span>
		{#if countdown === 'NOW'}
			<span class="maint-text">System is under maintenance{maintStatus.message ? ` \u2014 ${maintStatus.message}` : ''}</span>
		{:else}
			<span class="maint-text">
				Maintenance in <strong class="maint-countdown">{countdown}</strong>{maintStatus.message ? ` \u2014 ${maintStatus.message}` : ''}
			</span>
		{/if}
	</div>
{/if}

<svelte:head>
	<!-- Warm up the CDN connection before the dice library is actually needed -->
	<link rel="dns-prefetch" href="https://cdn.jsdelivr.net" />
	<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin="anonymous" />
</svelte:head>

<main class="app-main">
	{@render children()}
</main>

<SettingsDialog bind:this={settingsDialog} />

<style>
	/* Span wrapper + SVG sizing for the sword brand icon */
	.nav-brand-icon {
		display: flex;
		align-items: center;
		flex-shrink: 0;
		color: var(--color-mana);
	}

	.nav-brand-icon :global(svg) {
		width: 16px;
		height: 16px;
		fill: currentColor;
	}

	/* ── Settings button ── */
	.nav-user-actions {
		display: flex;
		align-items: center;
		gap: 0.35rem;
	}

	.nav-settings-btn {
		display:         inline-flex;
		align-items:     center;
		justify-content: center;
		background:      none;
		border:          1px solid transparent;
		border-radius:   4px;
		padding:         3px 6px;
		cursor:          pointer;
		color:           var(--text-dimmer);
		line-height:     1;
		transition:      color 0.15s, border-color 0.15s;
	}
	.nav-settings-btn:hover {
		color:        var(--text-accent);
		border-color: var(--border-mid);
	}
	.nav-settings-btn :global(svg) {
		width:  14px;
		height: 14px;
		fill:   currentColor;
	}

	.nav-sep {
		font-size: 0.45rem;
		color: var(--text-dimmer);
		opacity: 0.6;
		user-select: none;
	}

	/* ── Maintenance banner ── */
	.maint-banner {
		position: sticky;
		top: 0;
		z-index: 200;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 0.45rem 1rem;
		background: #b45309;
		color: #fff;
		font-family: var(--font-ui);
		font-size: 0.8rem;
		font-weight: 600;
		letter-spacing: 0.02em;
		text-align: center;
	}

	.maint-imminent {
		background: #dc2626;
		animation: maint-pulse 1.5s ease-in-out infinite;
	}

	.maint-icon {
		font-size: 1rem;
		line-height: 1;
	}

	.maint-countdown {
		font-family: var(--font-mono);
		font-size: 0.9rem;
		letter-spacing: 0.04em;
	}

	@keyframes maint-pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.8; }
	}
</style>
