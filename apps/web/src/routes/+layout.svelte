<script lang="ts">
	import '../app.css';
	import type { LayoutData } from './$types';
	import type { MaintenanceStatus } from '@ironledger/shared';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import { maintenance } from '$lib/api';
	import swordSvg from '$icons/sword.svg?raw';
	import { isDice3dEnabled, setDice3dEnabled } from '$lib/dice';
	import diceIconSvg from '$icons/dice-d10-light.svg?raw';
	import { page } from '$app/stores';

	let dice3d = $state(typeof window !== 'undefined' ? isDice3dEnabled() : true);

	function toggleDice3d() {
		dice3d = !dice3d;
		setDice3dEnabled(dice3d);
	}

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
		<a href="/home" class="nav-brand">
			<span class="nav-brand-icon" aria-hidden="true">{@html swordSvg}</span>
			Iron Ledger
		</a>
		<div class="nav-links">
			{#if !$page.url.pathname.startsWith('/admin')}
				<button
					class="nav-dice-toggle"
					class:nav-dice-toggle--off={!dice3d}
					title={dice3d ? '3D dice: on — click to disable' : '3D dice: off — click to enable'}
					onclick={toggleDice3d}
					aria-label="Toggle 3D dice"
				>
					<span class="nav-dice-icon">{@html diceIconSvg}</span>
					<span class="nav-dice-label">{dice3d ? '3D' : 'OFF'}</span>
				</button>
			{/if}
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

	/* ── 3D dice toggle ── */
	.nav-dice-toggle {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		background: none;
		border: 1px solid transparent;
		border-radius: 4px;
		padding: 2px 6px;
		cursor: pointer;
		color: var(--text-accent);
		font-family: var(--font-ui);
		font-size: 0.65rem;
		font-weight: 700;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		transition: color 0.15s, opacity 0.15s, border-color 0.15s;
	}
	.nav-dice-toggle:hover {
		border-color: var(--border-mid);
	}
	.nav-dice-toggle--off {
		color: var(--text-dimmer);
		opacity: 0.5;
	}
	.nav-dice-toggle--off:hover {
		opacity: 0.8;
	}
	.nav-dice-icon {
		display: flex;
		align-items: center;
		width: 14px;
		height: 14px;
	}
	.nav-dice-icon :global(svg) {
		width: 100%;
		height: 100%;
		fill: currentColor;
	}
	.nav-dice-label {
		line-height: 1;
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
