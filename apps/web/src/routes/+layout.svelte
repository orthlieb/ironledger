<script lang="ts">
	import '../app.css';
	import type { LayoutData } from './$types';
	import type { MaintenanceStatus } from '@ironledger/shared';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import { maintenance } from '$lib/api';
	import swordSvg from '$lib/images/sword.svg?raw';

	let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();

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
		<a href="/characters" class="nav-brand">
			<span class="nav-brand-icon" aria-hidden="true">{@html swordSvg}</span>
			Iron Ledger
		</a>
		<div class="nav-links">
			<ThemeToggle />
			{#if data.user?.role === 'admin'}
				<span class="nav-sep" aria-hidden="true">◆</span>
				<a href="/admin" class="btn btn-icon">Admin</a>
			{/if}
			<span class="nav-sep" aria-hidden="true">◆</span>
			<form method="POST" action="/logout">
				<button type="submit" class="btn btn-icon">Sign Out</button>
			</form>
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

<main class="app-main">
	{@render children()}
</main>

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
