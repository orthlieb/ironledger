<script lang="ts">
	import '../app.css';
	import type { LayoutData } from './$types';
	import type { MaintenanceStatus, BroadcastStatus } from '@ironledger/shared';
	import SettingsDialog from '$lib/components/SettingsDialog.svelte';
	import BugReportDialog from '$lib/components/BugReportDialog.svelte';
	import HamburgerMenu from '$lib/components/HamburgerMenu.svelte';
	import BroadcastBanner from '$lib/components/BroadcastBanner.svelte';
	import SessionExpiredBanner from '$lib/components/SessionExpiredBanner.svelte';
	import MovesDialog from '$lib/components/MovesDialog.svelte';
	import OraclesDialog from '$lib/components/OraclesDialog.svelte';
	import DiceRollerDialog from '$lib/components/DiceRollerDialog.svelte';
	import NotesDialog from '$lib/components/NotesDialog.svelte';
	import { system } from '$lib/api';
	import { getActiveDiceCtx } from '$lib/diceContext.svelte.js';
	import { getActiveFoeId, getActiveExpeditionId } from '$lib/activeContext.svelte.js';
	import { getEncounters } from '$lib/encounterStore.svelte.js';
	import { getExpeditions } from '$lib/expeditionStore.svelte.js';
	import { FOE_RANKS, findFoe } from '$lib/foeStore.svelte.js';
	import type { PreconditionContext } from '$lib/preconditions.js';
	import swordSvg from '$icons/sharp-axe.svg?raw';
	import iconMoves from '$icons/person-running-solid.svg?raw';
	import iconMap from '$icons/compass-rose.svg?raw';
	import iconOracles from '$icons/crystal-ball.svg?raw';
	import iconDice from '$icons/dice-d10-light.svg?raw';
	import iconNotes from '$icons/note-sticky-solid.svg?raw';
	import { preloadDice } from '$lib/dice';
	import { setAiDebug } from '$lib/aiSettings.svelte.js';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { headingText } from '$lib/fontStore.svelte.js';
	import { tooltip } from '$lib/actions/tooltip.js';

	let { data, children }: { data: LayoutData; children: import('svelte').Snippet } = $props();

	let settingsDialog = $state<ReturnType<typeof SettingsDialog> | null>(null);
	let bugReportDialog = $state<ReturnType<typeof BugReportDialog> | null>(null);

	// V1 "adventure-action-toolbar" dialogs — promoted to the global nav so
	// they're reachable from /home, /admin, etc.
	let movesDialogRef = $state<{ open(id?: string): void } | null>(null);
	let oraclesDialogRef = $state<{
		open(oracleKey?: string, onFill?: (value: string) => void, stat?: string): void;
	} | null>(null);
	let diceRollerRef = $state<{ open(): void } | null>(null);
	let notesDialogRef = $state<{ open(): void } | null>(null);
	const activeDiceCtx = $derived(getActiveDiceCtx());

	// Build a precondition context for MovesDialog from the v2 spine selections.
	// Pages that don't publish active selections (e.g. /admin) read empty
	// strings here so preconditions like `hasFoe` come out false — which is
	// the correct behavior for a no-foe-selected state.
	const preconditionCtx = $derived.by<PreconditionContext>(() => {
		const foeId = getActiveFoeId();
		const expId = getActiveExpeditionId();
		const encs = getEncounters();
		const exps = getExpeditions();
		const enc = foeId ? encs.find((e) => e.id === foeId) : undefined;
		const exp = expId ? exps.find((e) => e.id === expId) : undefined;
		const foeDef = enc ? findFoe(enc.foeId) : undefined;
		const foeName = enc ? enc.customName?.trim() || foeDef?.name || enc.foeId : undefined;
		return {
			hasCharacter: !!activeDiceCtx,
			hasFoe: !!enc,
			hasJourney: exp?.type === 'journey',
			hasSite: exp?.type === 'site',
			expeditionName: exp?.name,
			foeName,
			initiative: activeDiceCtx?.data?.initiative,
			foeHarm: enc ? FOE_RANKS[enc.effectiveRank]?.harm : undefined,
		};
	});

	// Build the progress-track context for progress rolls in MovesDialog.
	// Each key matches a move's `progressSource` field.
	const progressContext = $derived.by<Record<string, number>>(() => {
		const result: Record<string, number> = {};

		// Combat: active foe encounter's progress track
		const foeId = getActiveFoeId();
		const enc = foeId ? getEncounters().find((e) => e.id === foeId) : undefined;
		if (enc) result.combat = enc.ticks;

		// Journey / Delve (site): active expedition's progress track
		const expId = getActiveExpeditionId();
		const exp = expId ? getExpeditions().find((e) => e.id === expId) : undefined;
		if (exp?.type === 'journey') result.journey = exp.ticks;
		if (exp?.type === 'site') result.delve = exp.ticks;

		// Bonds and Failures are per-character single values
		const d = activeDiceCtx?.data;
		if (d) {
			result.bonds = d.bonds ?? 0;
			result.failures = d.failures ?? 0;
		}

		return result;
	});

	// ── Cross-component dialog-open events ────────────────────────────────
	// Components that render dialog content with embedded move/oracle links
	// (e.g. v2 CharactersArea's asset dialog) dispatch a custom DOM event so
	// the layout-level dialogs can react. Avoids prop-drilling refs through
	// the route tree.
	import { onMount } from 'svelte';
	import { cycleViewMode, viewMode } from '$lib/viewModeStore.svelte.js';
	onMount(() => {
		const openMove = (e: Event) => {
			const id = (e as CustomEvent<{ id: string }>).detail?.id ?? '';
			if (id) movesDialogRef?.open(id);
		};
		const openOracle = (e: Event) => {
			const d = (e as CustomEvent<{ key: string; stat: string }>).detail;
			// The 2nd arg (onFill callback) is intentionally omitted — links
			// from asset cards just want the picker to open, not auto-fill.
			oraclesDialogRef?.open(d?.key, undefined, d?.stat);
		};
		// Alt+V cycles home-page layout mode (grid → log → tabs → grid).
		// Desktop / tablet only — mobile always renders the tabs layout
		// regardless of the stored preference, so the shortcut no-ops
		// there. Ignores events fired from text inputs / textareas /
		// contenteditable so it doesn't hijack typing.
		const onKey = (e: KeyboardEvent) => {
			if (!(e.altKey && !e.ctrlKey && !e.metaKey)) return;
			if ((e.key || '').toLowerCase() !== 'v') return;
			const t = e.target as HTMLElement | null;
			if (
				t &&
				(t.tagName === 'INPUT' ||
					t.tagName === 'TEXTAREA' ||
					t.tagName === 'SELECT' ||
					t.isContentEditable)
			)
				return;
			if (!window.matchMedia('(min-width: 900px)').matches) return;
			e.preventDefault();
			cycleViewMode();
		};
		// Reflect the persisted mode on <html data-view> on first paint so
		// future layout CSS scoped to `[data-view]` matches immediately.
		document.documentElement.setAttribute('data-view', viewMode.mode);
		document.addEventListener('ironledger:open-move', openMove);
		document.addEventListener('ironledger:open-oracle', openOracle);
		document.addEventListener('keydown', onKey);
		return () => {
			document.removeEventListener('ironledger:open-move', openMove);
			document.removeEventListener('ironledger:open-oracle', openOracle);
			document.removeEventListener('keydown', onKey);
		};
	});

	// ── System status polling (maintenance + broadcast) ───────────────────
	let maintStatus: MaintenanceStatus | null = $state(null);
	let broadcastStatus: BroadcastStatus | null = $state(null);
	let countdown = $state('');
	let countdownInterval: ReturnType<typeof setInterval> | undefined;
	let pollInterval: ReturnType<typeof setInterval> | undefined;
	let loggedOut = false; // guard against double-logout

	function updateCountdown() {
		if (!maintStatus?.enabled || !maintStatus.shutdownAt) {
			countdown = '';
			return;
		}
		const diff = new Date(maintStatus.shutdownAt).getTime() - Date.now();
		if (diff <= 0) {
			countdown = 'NOW';
			// Auto-logout logged-in users when the shutdown time arrives.
			if (data.user && !loggedOut) {
				loggedOut = true;
				void goto('/logout');
			}
			return;
		}
		const mins = Math.floor(diff / 60_000);
		const secs = Math.floor((diff % 60_000) / 1000);
		countdown = `${mins}:${secs.toString().padStart(2, '0')}`;
	}

	async function pollSystemStatus() {
		try {
			const s = await system.getStatus();
			maintStatus = s.maintenance;
			broadcastStatus = s.broadcast;
		} catch {
			// ignore — don't break the app if the status endpoint is down
		}
	}

	// AI Debug bootstrap — an admin sends a user a link like `?debug=ai` to
	// turn on the wire-level pane in that browser; `?debug=off` clears it.
	// Persisted in localStorage so it survives navigation without the param.
	$effect(() => {
		const flag = $page.url.searchParams.get('debug');
		if (flag === 'ai') setAiDebug(true);
		else if (flag === 'off') setAiDebug(false);
	});

	$effect(() => {
		// Preload 3D dice library and WebGL context in the background so the
		// first actual roll doesn't stall waiting for a CDN fetch + GPU init.
		if (data.user) preloadDice();

		// Start polling (maintenance + broadcast share the same 10s cadence).
		void pollSystemStatus();
		pollInterval = setInterval(() => void pollSystemStatus(), 10_000);

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
	<nav class="app-nav" class:nav--admin={data.user?.role === 'admin'}>
		<a
			href="/home"
			class="nav-brand"
			class:nav-brand--current={$page.url.pathname === '/home'}
			aria-current={$page.url.pathname === '/home' ? 'page' : undefined}
		>
			<span class="nav-brand-icon" aria-hidden="true">{@html swordSvg}</span>
			{headingText('Iron Ledger')}
		</a>
		<div class="nav-links">
			<nav class="nav-page-links" aria-label="Main navigation">
				{#if data.user?.role === 'admin'}
					<a
						href="/admin"
						class="nav-link"
						class:nav-link--active={$page.url.pathname.startsWith('/admin')}>Admin</a
					>
				{/if}
			</nav>
			<div class="nav-user-actions">
				<!-- V1 adventure-action-toolbar promoted to the global nav so
				     Move / Ask / Roll / Note are reachable from any page. -->
				<div class="nav-action-toolbar">
					<button
						class="btn btn-primary act-btn"
						onclick={() => movesDialogRef?.open()}
						use:tooltip={'Browse and roll moves'}
					>
						<span class="act-icon">{@html iconMoves}</span><span class="act-label">Move</span>
					</button>
					<button
						class="btn btn-primary act-btn"
						onclick={() => oraclesDialogRef?.open()}
						use:tooltip={'Browse and roll oracles'}
					>
						<span class="act-icon">{@html iconOracles}</span><span class="act-label">Ask</span>
					</button>
					<button
						class="btn btn-primary act-btn"
						onclick={() => diceRollerRef?.open()}
						use:tooltip={'Roll dice'}
					>
						<span class="act-icon">{@html iconDice}</span><span class="act-label">Roll</span>
					</button>
					<!-- Campaign map — opens the last-active map in a modal.
					     Dispatches a global event rather than importing
					     MapDialog here; ExpeditionsArea already owns the ref
					     and listens for the event. -->
					<button
						class="btn btn-primary act-btn"
						onclick={() => document.dispatchEvent(new CustomEvent('ironledger:open-campaign-map'))}
						use:tooltip={'Open the campaign map'}
					>
						<span class="act-icon">{@html iconMap}</span><span class="act-label">Map</span>
					</button>
					<button
						class="btn btn-primary act-btn"
						onclick={() => notesDialogRef?.open()}
						use:tooltip={'Add a session note'}
					>
						<span class="act-icon">{@html iconNotes}</span><span class="act-label">Note</span>
					</button>
				</div>
				<HamburgerMenu
					isAdmin={data.user?.role === 'admin'}
					onSettings={() => settingsDialog?.open()}
					onReportBug={() => bugReportDialog?.open()}
				/>
			</div>
		</div>
	</nav>
{/if}

{#if maintStatus?.enabled}
	<div class="maint-banner" class:maint-imminent={countdown === 'NOW'}>
		<span class="maint-icon" aria-hidden="true">&#9888;</span>
		{#if countdown === 'NOW'}
			<span class="maint-text"
				>Logging you out now…{maintStatus.message ? ` \u2014 ${maintStatus.message}` : ''}</span
			>
		{:else if maintStatus.shutdownAt}
			{#if data.user}
				<span class="maint-text"
					>Please save your work and sign off. Shutting down in <strong class="maint-countdown"
						>{countdown}</strong
					>{maintStatus.message ? ` \u2014 ${maintStatus.message}` : ''}</span
				>
			{:else}
				<span class="maint-text"
					>Scheduled maintenance in <strong class="maint-countdown">{countdown}</strong
					>{maintStatus.message ? ` \u2014 ${maintStatus.message}` : ''}</span
				>
			{/if}
		{:else}
			<span class="maint-text"
				>Scheduled maintenance{maintStatus.message ? ` \u2014 ${maintStatus.message}` : ''}</span
			>
		{/if}
	</div>
{/if}

<BroadcastBanner status={broadcastStatus} />

<SessionExpiredBanner />

<svelte:head>
	<!-- Warm up the CDN connection before the dice library is actually needed -->
	<link rel="dns-prefetch" href="https://cdn.jsdelivr.net" />
	<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin="anonymous" />
</svelte:head>

<main class="app-main">
	{@render children()}
</main>

<SettingsDialog bind:this={settingsDialog} />
<BugReportDialog bind:this={bugReportDialog} user={data.user} />

<!-- Adventure-action dialogs — promoted from the v1 toolbar so they're
     mounted once at the layout level and openable from anywhere. -->
<MovesDialog
	bind:this={movesDialogRef}
	ctx={activeDiceCtx}
	pctx={preconditionCtx}
	{progressContext}
/>
<OraclesDialog bind:this={oraclesDialogRef} />
<DiceRollerDialog bind:this={diceRollerRef} ctx={activeDiceCtx} />
<NotesDialog bind:this={notesDialogRef} />

<style>
	/* Span wrapper + SVG sizing for the sword brand icon */
	.nav-brand-icon {
		display: flex;
		align-items: center;
		flex-shrink: 0;
		color: inherit;
	}

	.nav-brand-icon :global(svg) {
		width: 16px;
		height: 16px;
		fill: currentColor;
	}

	.nav-user-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	/* Adventure action toolbar — copied from V1 home page's
	   .adventure-action-toolbar so the buttons look and feel identical. */
	.nav-action-toolbar {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}
	.act-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.35rem;
		white-space: nowrap;
		overflow: hidden;
	}
	.act-icon {
		display: inline-flex;
		width: 14px;
		height: 14px;
		flex-shrink: 0;
	}
	.act-icon :global(svg) {
		width: 100%;
		height: 100%;
		fill: currentColor;
	}
	.act-label {
		font-size: 0.72rem;
		font-weight: 600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}
	/* Narrow screens: hide the labels, keep icons only. */
	@media (max-width: 600px) {
		.act-label {
			display: none;
		}
		.act-btn {
			padding-left: 0.5rem;
			padding-right: 0.5rem;
		}
	}

	.nav-page-links {
		display: none;
		align-items: center;
		gap: 0.1rem;
	}

	@media (min-width: 600px) {
		.nav-page-links {
			display: flex;
		}
	}

	.nav-link {
		font-family: var(--font-ui);
		font-size: 0.78rem;
		font-weight: 500;
		color: var(--text-dimmer);
		text-decoration: none;
		padding: 3px 8px;
		border-radius: 4px;
		border: 1px solid transparent;
		transition:
			color 0.12s,
			border-color 0.12s;
		letter-spacing: 0.02em;
	}
	.nav-link:hover {
		color: var(--text-muted);
		border-color: var(--border);
	}
	.nav-link--active {
		color: var(--text-accent);
		border-color: var(--border-mid);
	}
	.nav-link--active:hover {
		color: var(--text-accent);
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
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.8;
		}
	}
</style>
