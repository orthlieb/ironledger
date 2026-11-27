<script lang="ts">
	/**
	 * /admin — the admin dashboard's shell: title and build info, the
	 * page-wide ErrorBar, the first load behind a single loading spinner, the
	 * stat cards and activity graph, and the tab bar. Each tab is its own
	 * component in #lib/components/admin/ that loads what it needs as it
	 * opens; all four stay mounted and show only while their tab is active,
	 * so nothing in a tab is lost by visiting another.
	 *
	 * The first load fetches the users and stats, plus the maintenance and
	 * registration-lock statuses that the Tools tab is handed, so its tiles
	 * show the real state the moment it first opens.
	 */
	import { admin, maintenance as maintApi } from '#lib/api.js';
	import type {
		AdminUser,
		AdminStats,
		MaintenanceStatus,
		RegistrationLockStatus,
	} from '@ironledger/shared';
	import type { LayoutData } from '../$types';
	import ErrorBar from '#lib/components/ErrorBar.svelte';
	import LoadingSpinner from '#lib/components/LoadingSpinner.svelte';
	import AdminMetrics from '#lib/components/admin/AdminMetrics.svelte';
	import AdminUsers from '#lib/components/admin/AdminUsers.svelte';
	import AdminInvites from '#lib/components/admin/AdminInvites.svelte';
	import AdminLogs from '#lib/components/admin/AdminLogs.svelte';
	import AdminTools, { fetchRegLockStatus } from '#lib/components/admin/AdminTools.svelte';
	import { Tabs } from 'bits-ui';

	let { data }: { data: LayoutData } = $props();

	let users: AdminUser[] = $state([]);
	let stats: AdminStats | null = $state(null);
	let loading = $state(true);
	let error = $state('');

	// Fetched by the first load for the Tools tab (see the header) and bound to it.
	let maintStatus: MaintenanceStatus | null = $state(null);
	let regLockStatus: RegistrationLockStatus | null = $state(null);

	// ── Tabs ──────────────────────────────────────────────────────────────
	let activeTab: 'users' | 'invites' | 'logs' | 'tools' = $state('users');

	function showError(message: string) {
		error = message;
	}

	// ── Load data on mount ────────────────────────────────────────────────
	$effect(() => {
		(async () => {
			try {
				const [u, s, ms] = await Promise.all([
					admin.listUsers(),
					admin.getStats(),
					maintApi.getStatus(),
				]);
				users = u;
				stats = s;
				maintStatus = ms;
				const lock = await fetchRegLockStatus();
				if (lock) regLockStatus = lock;
			} catch (err) {
				error = err instanceof Error ? err.message : 'Failed to load admin data';
			} finally {
				loading = false;
			}
		})();
	});
</script>

<svelte:head>
	<title>Iron Ledger</title>
</svelte:head>

<div class="admin-page">
	<h1 class="admin-title">Admin Dashboard</h1>
	<p class="admin-build-info">
		v{__APP_VERSION__}
		<span class="build-sep">·</span>
		Built {new Date(__BUILD_DATE__).toLocaleString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit',
		})}
	</p>

	<div class="admin-error-host">
		<ErrorBar message={error} onDismiss={() => (error = '')} />
	</div>

	{#if loading}
		<div class="admin-loading"><LoadingSpinner label="Loading…" /></div>
	{/if}

	<!-- Stats cards + activity graph. Mounted from the start so the graph
	     loads alongside the first load; it renders nothing until that's done. -->
	<AdminMetrics {stats} {loading} />

	{#if !loading}
		<!-- Tab bar -->
		<Tabs.Root value={activeTab} onValueChange={(v) => (activeTab = v as typeof activeTab)}>
			<nav class="tab-bar" aria-label="Admin tabs">
				<Tabs.List class="tab-group">
					<Tabs.Trigger value="users" class="tab-btn">Users</Tabs.Trigger>
					<Tabs.Trigger value="invites" class="tab-btn">Invites</Tabs.Trigger>
					<Tabs.Trigger value="logs" class="tab-btn">Logs</Tabs.Trigger>
					<Tabs.Trigger value="tools" class="tab-btn">Tools</Tabs.Trigger>
				</Tabs.List>
			</nav>
		</Tabs.Root>

		<!-- Tab body. Every tab stays mounted and renders only while active, so
		     its state (sort, drafts, the last invite link, chosen log file)
		     survives a trip to another tab; each (re)loads as it opens. -->
		<div class="tab-body">
			<AdminUsers
				active={activeTab === 'users'}
				bind:users
				bind:stats
				currentUserId={data.user?.id}
				onerror={showError}
			/>
			<AdminInvites active={activeTab === 'invites'} />
			<AdminLogs active={activeTab === 'logs'} onerror={showError} />
			<AdminTools
				active={activeTab === 'tools'}
				bind:maintStatus
				bind:regLockStatus
				onerror={showError}
			/>
		</div>
	{/if}
</div>

<style>
	/* `main` is a flex column, where auto side margins shrink an item to
	   its content: without the width the page narrowed to fit the Logs and
	   Tools tabs and grew past a phone's screen to fit the users table.
	   1280px leaves the users table room for its ten columns. */
	.admin-page {
		width: 100%;
		max-width: 1280px;
		margin: 0 auto;
		padding: 1rem;
	}

	.admin-title {
		font-family: var(--font-display);
		font-size: calc(1.3rem * var(--font-display-scale));
		font-variant: var(--font-display-variant);
		color: var(--text-accent);
		letter-spacing: 0.08em;
		margin-bottom: 0.25rem;
	}

	.admin-build-info {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--text-dimmer);
		margin-bottom: 1rem;
		letter-spacing: 0.03em;
	}

	.build-sep {
		margin: 0 0.3em;
		opacity: 0.5;
	}

	/* Host wrapper for the page-level ErrorBar (margin only — styles in ErrorBar). */
	.admin-error-host {
		margin-bottom: 1rem;
	}
	.admin-error-host:empty {
		display: none;
	}

	.admin-loading {
		font-family: var(--font-ui);
		font-size: 0.85rem;
		color: var(--text-muted);
	}

	/* ── Tab bar ── */
	.tab-bar {
		display: flex;
		align-items: stretch;
		background: var(--bg-card);
		border-bottom: 1px solid var(--border);
		overflow-x: auto;
		scrollbar-width: none;
		flex-shrink: 0;
		padding-left: 4px;
	}
	.tab-bar::-webkit-scrollbar {
		display: none;
	}

	/* .tab-group and .tab-btn are declared in class= on bits-ui's Tabs.List /
	   Tabs.Trigger, which renders its own <div> / <button> below the component
	   boundary. Svelte's scoped-CSS attribute isn't threaded through, so
	   scoped selectors don't match — use :global() to reach them. Matches how
	   CharactersArea (.ca-tab) and ExpeditionsArea (.ea-tab) do it. */
	:global(.tab-group) {
		display: flex;
		align-items: stretch;
	}

	:global(.tab-btn) {
		font-family: var(--font-ui);
		font-size: 0.72rem;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-dimmer);
		background: transparent;
		border: none;
		border-bottom: 2px solid transparent;
		padding: 13px 16px 11px;
		cursor: pointer;
		white-space: nowrap;
		flex-shrink: 0;
		transition:
			color 0.12s,
			border-color 0.12s;
	}
	:global(.tab-btn:hover) {
		color: var(--text-muted);
	}
	:global(.tab-btn[data-state='active']) {
		color: var(--text-accent);
		border-bottom-color: var(--text-accent);
	}

	.tab-body {
		padding-top: 0.75rem;
	}
</style>
