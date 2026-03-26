<script lang="ts">
	// Build-time constants injected by Vite (see vite.config.ts → define)
	declare const __APP_VERSION__: string;
	declare const __BUILD_DATE__: string;

	import { admin, maintenance as maintApi } from '$lib/api';
	import type { AdminUser, AdminStats, MaintenanceStatus, UserTimeseries } from '@ironledger/shared';
	import type { LayoutData } from '../$types';

	let { data }: { data: LayoutData } = $props();

	let users: AdminUser[] = $state([]);
	let stats: AdminStats | null = $state(null);
	let loading = $state(true);
	let error = $state('');

	// ── Tabs ──────────────────────────────────────────────────────────────
	let activeTab: 'users' | 'logs' | 'maintenance' = $state('users');

	// ── Sort state ────────────────────────────────────────────────────────
	let sortKey: keyof AdminUser = $state('email');
	let sortAsc = $state(true);

	let sorted = $derived(
		[...users].sort((a, b) => {
			const av = a[sortKey];
			const bv = b[sortKey];
			if (av == null && bv == null) return 0;
			if (av == null) return 1;
			if (bv == null) return -1;
			const cmp = typeof av === 'string'
				? av.localeCompare(bv as string)
				: (av as number) - (bv as number);
			return sortAsc ? cmp : -cmp;
		}),
	);

	function setSort(key: keyof AdminUser) {
		if (sortKey === key) {
			sortAsc = !sortAsc;
		} else {
			sortKey = key;
			sortAsc = true;
		}
		page = 1;
	}

	function sortIcon(key: keyof AdminUser): string {
		if (sortKey !== key) return '';
		return sortAsc ? ' \u25B2' : ' \u25BC';
	}

	// ── Pagination ────────────────────────────────────────────────────────
	const PAGE_SIZE = 25;
	let page = $state(1);
	let totalPages = $derived(Math.max(1, Math.ceil(sorted.length / PAGE_SIZE)));
	let paginated = $derived(sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE));

	// ── Confirm + delete user ─────────────────────────────────────────────
	let deleteTarget: AdminUser | null = $state(null);
	let promoteTarget: AdminUser | null = $state(null);
	let suspendTarget: AdminUser | null = $state(null);

	async function confirmDelete() {
		if (!deleteTarget) return;
		try {
			await admin.deleteUser(deleteTarget.id);
			users = users.filter((u) => u.id !== deleteTarget!.id);
			deleteTarget = null;
			const [s] = await Promise.all([admin.getStats(), refreshAuditLog()]);
			stats = s;
		} catch (err) {
			error = err instanceof Error ? err.message : 'Delete failed';
			deleteTarget = null;
		}
	}

	// ── Suspend / unsuspend user ──────────────────────────────────────────
	async function confirmSuspend() {
		if (!suspendTarget) return;
		try {
			const willSuspend = suspendTarget.isActive;
			await admin.suspendUser(suspendTarget.id, willSuspend);
			suspendTarget.isActive = !willSuspend;
			users = [...users];
			suspendTarget = null;
			} catch (err) {
			error = err instanceof Error ? err.message : 'Suspend action failed';
			suspendTarget = null;
		}
	}

	// ── Toggle role ───────────────────────────────────────────────────────
	let adminCount = $derived(users.filter((u) => u.role === 'admin').length);

	async function toggleRole(user: AdminUser) {
		// Demoting is low-risk — no confirmation needed.
		// Promoting to admin is serious — show a confirmation dialog first.
		if (user.role === 'user') {
			promoteTarget = user;
			return;
		}
		// Guard: never demote the last admin.
		if (adminCount <= 1) return;
		await applyRoleChange(user, 'user');
	}

	async function confirmPromote() {
		if (!promoteTarget) return;
		await applyRoleChange(promoteTarget, 'admin');
		promoteTarget = null;
	}

	async function applyRoleChange(user: AdminUser, newRole: 'user' | 'admin') {
		try {
			await admin.setRole(user.id, newRole);
			user.role = newRole;
			users = [...users];
			} catch (err) {
			error = err instanceof Error ? err.message : 'Role change failed';
		}
	}

	// ── Metrics graph ─────────────────────────────────────────────────────
	type Timeframe = '1hr' | '1day' | '7day' | '30day';
	let metricsTimeframe: Timeframe = $state('1day');
	let timeseries: UserTimeseries | null = $state(null);
	let metricsLoading = $state(false);

	async function loadTimeseries(tf: Timeframe) {
		metricsLoading = true;
		try {
			timeseries = await admin.getTimeseries(tf);
		} catch { /* ignore */ } finally {
			metricsLoading = false;
		}
	}

	$effect(() => {
		void loadTimeseries(metricsTimeframe);
	});

	// ── Server logs ──────────────────────────────────────────────────────────────────
	type LogFile = 'api-out' | 'api-error' | 'web-out' | 'web-error';
	let logFile: LogFile = $state('api-out');
	let logLines: string[] = $state([]);
	let logAvailable = $state(true);
	let logLoading = $state(false);
	let logLineCount: 200 | 500 | 1000 = $state(200);

	async function loadLogs(file = logFile, lines = logLineCount) {
		logLoading = true;
		try {
			const result = await admin.getLogs(file, lines);
			logLines = result.lines;
			logAvailable = result.available;
		} catch { logLines = []; logAvailable = false; } finally {
			logLoading = false;
		}
	}

	$effect(() => {
		if (activeTab === 'logs') void loadLogs(logFile, logLineCount);
	});

	// ── Maintenance mode ──────────────────────────────────────────────────
	let maintStatus: MaintenanceStatus | null = $state(null);
	let maintMessage = $state('Scheduled maintenance');
	let maintMinutes = $state(5);
	let maintLoading = $state(false);
	let showMaintConfirm = $state(false);
	let maintCountdown = $state('');
	let maintCountdownInterval: ReturnType<typeof setInterval> | undefined;

	async function refreshMaintStatus() {
		try { maintStatus = await maintApi.getStatus(); } catch { /* ignore */ }
	}

	function updateMaintCountdown() {
		if (!maintStatus?.enabled || !maintStatus.shutdownAt) {
			maintCountdown = '';
			return;
		}
		const diff = new Date(maintStatus.shutdownAt).getTime() - Date.now();
		if (diff <= 0) { maintCountdown = 'NOW'; return; }
		const mins = Math.floor(diff / 60_000);
		const secs = Math.floor((diff % 60_000) / 1000);
		maintCountdown = `${mins}:${secs.toString().padStart(2, '0')}`;
	}

	$effect(() => {
		clearInterval(maintCountdownInterval);
		if (maintStatus?.enabled && maintStatus.shutdownAt) {
			updateMaintCountdown();
			maintCountdownInterval = setInterval(updateMaintCountdown, 1000);
		} else {
			maintCountdown = '';
		}
		return () => clearInterval(maintCountdownInterval);
	});

	async function confirmEnableMaint() {
		maintLoading = true;
		try {
			await admin.enableMaintenance({ message: maintMessage, minutesUntilShutdown: maintMinutes });
			showMaintConfirm = false;
			await refreshMaintStatus();
			} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to enable maintenance';
			showMaintConfirm = false;
		} finally {
			maintLoading = false;
		}
	}

	async function disableMaint() {
		maintLoading = true;
		try {
			await admin.disableMaintenance();
			await refreshMaintStatus();
			} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to disable maintenance';
		} finally {
			maintLoading = false;
		}
	}

	// ── Event display helpers ─────────────────────────────────────────────

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
			} catch (err) {
				error = err instanceof Error ? err.message : 'Failed to load admin data';
			} finally {
				loading = false;
			}
		})();
	});
</script>

<svelte:head>
	<title>Admin Dashboard | Iron Ledger</title>
</svelte:head>

<div class="admin-page">
	<h1 class="admin-title">Admin Dashboard</h1>
	<p class="admin-build-info">
		v{__APP_VERSION__}
		<span class="build-sep">·</span>
		Built {new Date(__BUILD_DATE__).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
	</p>

	{#if error}
		<div class="admin-error">{error}</div>
	{/if}

	{#if loading}
		<p class="admin-loading">Loading...</p>
	{:else}
		<!-- Stats Cards -->
		{#if stats}
			<div class="stats-grid">
				<div class="stat-card">
					<span class="stat-value">{stats.totalUsers}</span>
					<span class="stat-label">Total Users</span>
				</div>
				<div class="stat-card">
					<span class="stat-value">{stats.activeUsers7d}</span>
					<span class="stat-label">Active 7d</span>
				</div>
				<div class="stat-card">
					<span class="stat-value">{stats.activeUsers30d}</span>
					<span class="stat-label">Active 30d</span>
				</div>
				<div class="stat-card">
					<span class="stat-value">{stats.totalCharacters}</span>
					<span class="stat-label">Characters</span>
				</div>
				<div class="stat-card">
					<span class="stat-value">{stats.totalEncounters}</span>
					<span class="stat-label">Encounters</span>
				</div>
				<div class="stat-card">
					<span class="stat-value">{stats.totalExpeditions}</span>
					<span class="stat-label">Expeditions</span>
				</div>
				<div class="stat-card stat-online">
					<span class="stat-value stat-value-online">{stats.currentlyLoggedIn}</span>
					<span class="stat-label">Online Now</span>
				</div>
			</div>
		{/if}

		<!-- Metrics graph -->
		<div class="metrics-panel card">
			<div class="metrics-header">
				<span class="metrics-title">User Activity</span>
				<div class="metrics-timeframes">
					{#each (['1hr', '1day', '7day', '30day'] as const) as tf}
						<button
							class="tf-btn"
							class:active={metricsTimeframe === tf}
							onclick={() => { metricsTimeframe = tf; }}
						>{tf}</button>
					{/each}
				</div>
			</div>

			{#if metricsLoading || !timeseries}
				<div class="metrics-loading">Loading…</div>
			{:else}
				{@const buckets = timeseries.buckets}
				{@const rawMax = Math.max(...buckets.map(b => b.totalUsers), 1)}
				{@const maxActive = Math.max(...buckets.map(b => b.activeUsers), 1)}
				{@const chartH = 120}
				{@const chartW = 600}
				{@const padL = 40}
				{@const padR = 12}
				{@const padT = 10}
				{@const padB = 28}
				{@const plotW = chartW - padL - padR}
				{@const plotH = chartH - padT - padB}
				{@const step = buckets.length > 1 ? plotW / (buckets.length - 1) : plotW}
				{@const yStep = rawMax <= 5 ? 1 : rawMax <= 15 ? 2 : rawMax <= 50 ? 5 : rawMax <= 100 ? 10 : rawMax <= 500 ? 50 : 100}
				{@const maxTotal = Math.ceil(rawMax / yStep) * yStep}
				{@const yTicks = Array.from({ length: Math.round(maxTotal / yStep) + 1 }, (_, i) => i * yStep)}

				<div class="metrics-chart-wrap">
					<svg
						class="metrics-svg"
						viewBox="0 0 {chartW} {chartH}"
						preserveAspectRatio="none"
						aria-label="User activity chart"
					>
						<!-- Y-axis grid lines -->
						{#each yTicks as v}
							{@const y = padT + plotH * (1 - v / maxTotal)}
							<line x1={padL} y1={y} x2={chartW - padR} y2={y} class="grid-line" />
							<text x={padL - 4} y={y + 4} class="axis-label" text-anchor="end">
								{v}
							</text>
						{/each}

						<!-- X-axis labels (every N buckets to avoid crowding) -->
						{#each buckets as b, i}
							{#if i % Math.max(1, Math.floor(buckets.length / 6)) === 0}
								{@const x = padL + i * step}
								<text x={x} y={chartH - 4} class="axis-label" text-anchor="middle">{b.label}</text>
							{/if}
						{/each}

						<!-- Total users line (amber) -->
						<polyline
							class="line-total"
							points={buckets.map((b, i) =>
								`${padL + i * step},${padT + plotH * (1 - b.totalUsers / maxTotal)}`
							).join(' ')}
						/>

						<!-- Active users line (teal) -->
						<polyline
							class="line-active"
							points={buckets.map((b, i) =>
								`${padL + i * step},${padT + plotH * (1 - b.activeUsers / maxActive)}`
							).join(' ')}
						/>

						<!-- Data point dots for total -->
						{#each buckets as b, i}
							<circle
								cx={padL + i * step}
								cy={padT + plotH * (1 - b.totalUsers / maxTotal)}
								r="2.5"
								class="dot-total"
							/>
						{/each}
					</svg>
				</div>

				<!-- Legend -->
				<div class="metrics-legend">
					<span class="legend-item legend-total">Total Users</span>
					<span class="legend-item legend-active">Active (by last login)</span>
					{#if stats}
						<span class="legend-item legend-online">
							{stats.currentlyLoggedIn} online now
						</span>
					{/if}
				</div>
			{/if}
		</div>

		<!-- Tab bar -->
		<nav class="tab-bar" aria-label="Admin tabs">
			<div class="tab-group" role="tablist">
				<button
					class="tab-btn"
					class:active={activeTab === 'users'}
					role="tab"
					aria-selected={activeTab === 'users'}
					onclick={() => (activeTab = 'users')}
				>Users</button>
				<button
					class="tab-btn"
					class:active={activeTab === 'logs'}
					role="tab"
					aria-selected={activeTab === 'logs'}
					onclick={() => (activeTab = 'logs')}
				>Logs</button>
				<button
					class="tab-btn"
					class:active={activeTab === 'maintenance'}
					role="tab"
					aria-selected={activeTab === 'maintenance'}
					onclick={() => { activeTab = 'maintenance'; void refreshMaintStatus(); }}
				>Maintenance</button>
			</div>
		</nav>

		<!-- Tab body -->
		<div class="tab-body">

			<!-- ═══ Users tab ═══ -->
			{#if activeTab === 'users'}
				<div class="admin-table-wrap">
					<table class="admin-table">
						<thead>
							<tr>
								<th class="sortable" onclick={() => setSort('email')}>
									Email{sortIcon('email')}
								</th>
								<th class="sortable" onclick={() => setSort('role')}>
									Role{sortIcon('role')}
								</th>
								<th class="sortable" onclick={() => setSort('isActive')}>
									Active{sortIcon('isActive')}
								</th>
								<th class="sortable" onclick={() => setSort('lastLoginAt')}>
									Last Login{sortIcon('lastLoginAt')}
								</th>
								<th class="sortable" onclick={() => setSort('createdAt')}>
									Created{sortIcon('createdAt')}
								</th>
								<th class="sortable" onclick={() => setSort('characterCount')}>
									Chars{sortIcon('characterCount')}
								</th>
								<th class="sortable" onclick={() => setSort('encounterCount')}>
									Enc{sortIcon('encounterCount')}
								</th>
								<th class="sortable" onclick={() => setSort('expeditionCount')}>
									Exp{sortIcon('expeditionCount')}
								</th>
								<th>Actions</th>
							</tr>
						</thead>
						<tbody>
							{#each paginated as user (user.id)}
								{@const isLastAdmin = user.role === 'admin' && adminCount <= 1}
								{@const isSelf = user.id === data.user?.id}
								<tr>
									<td>{user.email}</td>
									<td>
										<span class="role-badge" class:role-admin={user.role === 'admin'}>
											{user.role}
										</span>
									</td>
									<td>
										<span class="active-dot" class:active-yes={user.isActive}></span>
									</td>
									<td class="td-date">{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleDateString() : 'Never'}</td>
									<td class="td-date">{new Date(user.createdAt).toLocaleDateString()}</td>
									<td class="td-num">{user.characterCount}</td>
									<td class="td-num">{user.encounterCount}</td>
									<td class="td-num">{user.expeditionCount}</td>
									<td class="td-actions">
										<button
											class="btn btn-icon"
											class:btn-dimmed={isLastAdmin}
											title={isLastAdmin ? 'Cannot demote the last admin' : user.role === 'admin' ? 'Demote to user' : 'Promote to admin'}
											disabled={isLastAdmin}
											onclick={() => toggleRole(user)}
										>
											{user.role === 'admin' ? 'Demote' : 'Promote'}
										</button>
										<button
											class="btn btn-icon"
											class:btn-warn={user.isActive && !isSelf}
											class:btn-dimmed={isSelf}
											disabled={isSelf}
											title={isSelf ? 'Cannot suspend your own account' : user.isActive ? 'Suspend user (immediately boots and blocks login)' : 'Unsuspend user'}
											onclick={() => (suspendTarget = user)}
										>
											{user.isActive ? 'Suspend' : 'Unsuspend'}
										</button>
										<button
											class="btn btn-icon btn-danger"
											title="Delete user and all data"
											onclick={() => (deleteTarget = user)}
										>
											Delete
										</button>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>

				<!-- Pagination -->
				{#if totalPages > 1}
					<div class="pagination">
						<button class="btn btn-icon" disabled={page <= 1} onclick={() => (page -= 1)}>Prev</button>
						<span class="page-info">Page {page} of {totalPages}</span>
						<button class="btn btn-icon" disabled={page >= totalPages} onclick={() => (page += 1)}>Next</button>
					</div>
				{/if}

			<!-- ═══ Logs tab ═══ -->
			{:else if activeTab === 'logs'}
				<div class="logs-toolbar">
					<div class="logs-file-btns">
						{#each ([['api-out','API stdout'],['api-error','API stderr'],['web-out','Web stdout'],['web-error','Web stderr']] as const) as [f, label]}
							<button
								class="btn btn-icon"
								class:active={logFile === f}
								onclick={() => { logFile = f as typeof logFile; void loadLogs(f as typeof logFile, logLineCount); }}
							>{label}</button>
						{/each}
					</div>
					<div class="logs-right">
						<div class="logs-line-btns">
							{#each ([200, 500, 1000] as const) as n}
								<button
									class="btn btn-icon"
									class:active={logLineCount === n}
									onclick={() => { logLineCount = n; void loadLogs(logFile, n); }}
								>{n} lines</button>
							{/each}
						</div>
						<button class="btn btn-icon" onclick={() => void loadLogs()} disabled={logLoading}>
							{logLoading ? 'Loading…' : '↻ Refresh'}
						</button>
					</div>
				</div>

				{#if !logAvailable}
					<p class="logs-unavailable">
						Log file not available — server may not be running under PM2,
						or <code>LOG_DIR</code> is not configured for this environment.
					</p>
				{:else if logLoading}
					<p class="logs-unavailable">Loading…</p>
				{:else if logLines.length === 0}
					<p class="logs-unavailable">Log file is empty.</p>
				{:else}
					<div class="log-output" role="log" aria-live="off">
						{#each logLines as line}
							<div class="log-line
								{line.includes('ERROR') || line.includes('error') ? 'log-error' : ''}
								{line.includes('WARN') || line.includes('warn') ? 'log-warn' : ''}
								{line.includes('DEBUG') || line.includes('debug') ? 'log-debug' : ''}
							">{line}</div>
						{/each}
					</div>
				{/if}

			<!-- ═══ Maintenance tab ═══ -->
			{:else if activeTab === 'maintenance'}
				<div class="maint-panel">
					<!-- Status indicator -->
					<div class="maint-status-row">
						<span class="maint-dot" class:maint-dot-active={maintStatus?.enabled}></span>
						<span class="maint-status-label">
							{maintStatus?.enabled ? 'Maintenance Active' : 'System Normal'}
						</span>
						{#if maintStatus?.enabled && maintCountdown}
							<span class="maint-timer">
								Shutdown in <strong>{maintCountdown}</strong>
							</span>
						{/if}
					</div>

					{#if maintStatus?.enabled}
						<!-- Active maintenance info -->
						<div class="maint-active-info">
							{#if maintStatus.message}
								<p class="maint-msg">{maintStatus.message}</p>
							{/if}
							{#if maintStatus.shutdownAt}
								<p class="maint-shutdown">
									Shutdown at: {new Date(maintStatus.shutdownAt).toLocaleString()}
								</p>
							{/if}
						</div>
						<button
							class="btn btn-success"
							disabled={maintLoading}
							onclick={disableMaint}
						>
							{maintLoading ? 'Disabling...' : 'Disable Maintenance'}
						</button>
					{:else}
						<!-- Enable form -->
						<div class="maint-form">
							<label class="maint-label">
								<span>Message</span>
								<input
									class="maint-input"
									type="text"
									placeholder="e.g. Upgrading to v2.0"
									bind:value={maintMessage}
									maxlength="500"
								/>
							</label>
							<label class="maint-label">
								<span>Minutes until shutdown</span>
								<input
									class="maint-input maint-input-num"
									type="number"
									min="0"
									max="1440"
									bind:value={maintMinutes}
								/>
							</label>
						</div>
						<button
							class="btn btn-danger"
							disabled={maintLoading || !maintMessage.trim()}
							onclick={() => (showMaintConfirm = true)}
						>
							Enable Maintenance Mode
						</button>
					{/if}
				</div>
			{/if}

		</div>
	{/if}
</div>

<!-- Delete confirmation dialog -->
{#if deleteTarget}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="modal-backdrop" onclick={() => (deleteTarget = null)} onkeydown={(e) => e.key === 'Escape' && (deleteTarget = null)}>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="modal card" onclick={(e) => e.stopPropagation()}>
			<h3>Delete User</h3>
			<p>
				Permanently delete <strong>{deleteTarget.email}</strong> and all their data?
				This cannot be undone.
			</p>
			<div class="modal-actions">
				<button class="btn" onclick={() => (deleteTarget = null)}>Cancel</button>
				<button class="btn btn-danger" onclick={confirmDelete}>Delete</button>
			</div>
		</div>
	</div>
{/if}

<!-- Enable maintenance confirmation dialog -->
{#if showMaintConfirm}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="modal-backdrop" onclick={() => (showMaintConfirm = false)} onkeydown={(e) => e.key === 'Escape' && (showMaintConfirm = false)}>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="modal card" onclick={(e) => e.stopPropagation()}>
			<h3 class="maint-modal-title">Enable Maintenance Mode</h3>
			<p>
				This will alert all users and revoke all active sessions.
				Non-admin users will be unable to log in.
			</p>
			<p>
				Message: <strong>{maintMessage}</strong><br />
				Shutdown in: <strong>{maintMinutes} minute{maintMinutes === 1 ? '' : 's'}</strong>
			</p>
			<div class="modal-actions">
				<button class="btn" onclick={() => (showMaintConfirm = false)}>Cancel</button>
				<button class="btn btn-danger" disabled={maintLoading} onclick={confirmEnableMaint}>
					{maintLoading ? 'Enabling...' : 'Enable'}
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- Promote to admin confirmation dialog -->
{#if promoteTarget}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="modal-backdrop" onclick={() => (promoteTarget = null)} onkeydown={(e) => e.key === 'Escape' && (promoteTarget = null)}>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="modal card" onclick={(e) => e.stopPropagation()}>
			<h3>Promote to Admin</h3>
			<p>
				Grant admin privileges to <strong>{promoteTarget.email}</strong>?
			</p>
			<p class="modal-warning">
				Admins can manage all users, view audit logs, and control maintenance mode.
				This should only be granted to trusted team members.
			</p>
			<div class="modal-actions">
				<button class="btn" onclick={() => (promoteTarget = null)}>Cancel</button>
				<button class="btn btn-danger" onclick={confirmPromote}>Promote</button>
			</div>
		</div>
	</div>
{/if}

<!-- Suspend / unsuspend confirmation dialog -->
{#if suspendTarget}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="modal-backdrop" onclick={() => (suspendTarget = null)} onkeydown={(e) => e.key === 'Escape' && (suspendTarget = null)}>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="modal card" onclick={(e) => e.stopPropagation()}>
			{#if suspendTarget.isActive}
				<h3>Suspend User</h3>
				<p>
					Suspend <strong>{suspendTarget.email}</strong>?
				</p>
				<p class="modal-warning">
					Their active sessions will be revoked immediately and they will be unable to log in until unsuspended.
				</p>
			{:else}
				<h3>Unsuspend User</h3>
				<p>
					Re-enable access for <strong>{suspendTarget.email}</strong>?
				</p>
			{/if}
			<div class="modal-actions">
				<button class="btn" onclick={() => (suspendTarget = null)}>Cancel</button>
				<button class="btn {suspendTarget.isActive ? 'btn-warn' : 'btn-success'}" onclick={confirmSuspend}>
					{suspendTarget.isActive ? 'Suspend' : 'Unsuspend'}
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.admin-page {
		max-width: 1100px;
		margin: 0 auto;
		padding: 1rem;
	}

	.admin-title {
		font-family: var(--font-display);
		font-size: 1.3rem;
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

	.admin-error {
		background: color-mix(in srgb, var(--color-danger) 15%, transparent);
		border: 1px solid var(--color-danger);
		border-radius: 4px;
		padding: 0.5rem 0.75rem;
		margin-bottom: 1rem;
		font-family: var(--font-ui);
		font-size: 0.82rem;
		color: var(--color-danger);
	}

	.admin-loading {
		font-family: var(--font-ui);
		font-size: 0.85rem;
		color: var(--text-muted);
	}

	/* ── Stats grid ── */
	.stats-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
		gap: 0.6rem;
		margin-bottom: 1.25rem;
	}

	.stat-card {
		background: var(--bg-card);
		border: 1px solid var(--border);
		border-radius: 5px;
		padding: 0.75rem;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.15rem;
		box-shadow: 0 2px 8px #00000020;
	}

	.stat-value {
		font-family: var(--font-mono);
		font-size: 1.6rem;
		font-weight: 700;
		color: var(--text-accent);
		line-height: 1.1;
	}

	.stat-label {
		font-family: var(--font-ui);
		font-size: 0.65rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-dimmer);
	}

	.stat-online {
		border-color: rgba(52, 211, 153, 0.3);
	}
	.stat-value-online {
		color: #34d399;
	}

	/* ── Metrics graph ── */
	.metrics-panel {
		margin-bottom: 1.25rem;
		overflow: hidden;
	}

	.metrics-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 10px 14px;
		background: var(--bg-inset);
		border-bottom: 1px solid var(--border);
	}

	.metrics-title {
		font-family: var(--font-display);
		font-size: 0.65rem;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--text-accent);
	}

	.metrics-timeframes {
		display: flex;
		gap: 4px;
	}

	.tf-btn {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		font-weight: 600;
		background: transparent;
		border: 1px solid var(--border);
		border-radius: 3px;
		padding: 2px 7px;
		cursor: pointer;
		color: var(--text-dimmer);
		transition: color 0.12s, border-color 0.12s, background 0.12s;
	}

	.tf-btn:hover {
		color: var(--text-muted);
		border-color: var(--border-mid);
	}

	.tf-btn.active {
		color: var(--text-accent);
		border-color: var(--text-accent);
		background: color-mix(in srgb, var(--text-accent) 10%, transparent);
	}

	.metrics-loading {
		padding: 2rem;
		text-align: center;
		font-family: var(--font-ui);
		font-size: 0.8rem;
		color: var(--text-dimmer);
	}

	.metrics-chart-wrap {
		padding: 0.5rem 0.75rem 0;
		overflow: hidden;
	}

	.metrics-svg {
		width: 100%;
		height: 140px;
		display: block;
	}

	.grid-line {
		stroke: var(--border);
		stroke-width: 0.5;
	}

	.axis-label {
		font-family: var(--font-mono);
		font-size: 8px;
		fill: var(--text-dimmer);
	}

	.line-total {
		fill: none;
		stroke: #f59e0b;
		stroke-width: 1.5;
		stroke-linejoin: round;
	}

	.line-active {
		fill: none;
		stroke: #34d399;
		stroke-width: 1.5;
		stroke-linejoin: round;
		stroke-dasharray: 3 2;
	}

	.dot-total {
		fill: #f59e0b;
	}

	.metrics-legend {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0.5rem 0.75rem 0.65rem;
		font-family: var(--font-ui);
		font-size: 0.72rem;
	}

	.legend-item {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		color: var(--text-dimmer);
	}

	.legend-item::before {
		content: '';
		display: inline-block;
		width: 16px;
		height: 2px;
	}

	.legend-total::before  { background: #f59e0b; }
	.legend-active::before { background: #34d399; }
	.legend-online {
		margin-left: auto;
		color: #34d399;
		font-weight: 600;
	}
	.legend-online::before { display: none; }

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
	.tab-bar::-webkit-scrollbar { display: none; }

	.tab-group {
		display: flex;
		align-items: stretch;
	}

	.tab-btn {
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
		transition: color 0.12s, border-color 0.12s;
	}
	.tab-btn:hover  { color: var(--text-muted); }
	.tab-btn.active {
		color: var(--text-accent);
		border-bottom-color: var(--text-accent);
	}

	.tab-body {
		padding-top: 0.75rem;
	}

	/* ── Table ── */
	.admin-table-wrap {
		overflow-x: auto;
	}

	.admin-table {
		width: 100%;
		border-collapse: collapse;
		font-family: var(--font-ui);
		font-size: 0.78rem;
	}

	.admin-table th,
	.admin-table td {
		padding: 0.45rem 0.6rem;
		text-align: left;
		border-bottom: 1px solid var(--border);
	}

	.admin-table th {
		font-size: 0.68rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-dimmer);
		background: var(--bg-card);
		white-space: nowrap;
	}

	.sortable {
		cursor: pointer;
		user-select: none;
	}
	.sortable:hover {
		color: var(--text-accent);
	}

	.admin-table tbody tr:hover {
		background: var(--bg-hover);
	}

	.td-date {
		white-space: nowrap;
		color: var(--text-muted);
	}

	.td-num {
		text-align: center;
		font-family: var(--font-mono);
		font-size: 0.8rem;
	}

	.td-actions {
		white-space: nowrap;
		display: flex;
		gap: 0.3rem;
	}

	/* Role badge */
	.role-badge {
		display: inline-block;
		padding: 1px 7px;
		border-radius: 3px;
		font-size: 0.68rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		background: var(--bg-inset);
		color: var(--text-muted);
		border: 1px solid var(--border);
	}

	.role-admin {
		background: color-mix(in srgb, var(--text-accent) 15%, transparent);
		color: var(--text-accent);
		border-color: var(--text-accent);
	}

	/* Active dot */
	.active-dot {
		display: inline-block;
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--color-danger);
	}

	.active-yes {
		background: var(--color-success);
	}

	/* ── Pagination ── */
	.pagination {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		padding: 0.75rem 0;
	}

	.page-info {
		font-family: var(--font-ui);
		font-size: 0.75rem;
		color: var(--text-muted);
	}

	/* Last-admin guard */
	.btn-dimmed {
		opacity: 0.35;
		cursor: not-allowed;
	}

	/* ── Delete / Clear modals ── */
	.modal-backdrop {
		position: fixed;
		inset: 0;
		background: #000000aa;
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 100;
	}

	.modal {
		max-width: 400px;
		width: 90%;
	}

	.modal h3 {
		font-family: var(--font-display);
		font-size: 1rem;
		color: var(--color-danger);
		margin-bottom: 0.5rem;
	}

	.modal p {
		font-family: var(--font-ui);
		font-size: 0.88rem;
		color: var(--text-muted);
		margin-bottom: 1rem;
		line-height: 1.5;
	}

	.modal-actions {
		display: flex;
		gap: 0.5rem;
		justify-content: flex-end;
	}

	.modal-warning {
		font-size: 0.8rem;
		color: var(--color-danger);
		background: color-mix(in srgb, var(--color-danger) 10%, transparent);
		border: 1px solid color-mix(in srgb, var(--color-danger) 30%, transparent);
		border-radius: 4px;
		padding: 8px 12px;
		margin-top: 0.25rem;
	}

	/* ── Logs tab ── */
	.logs-toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		margin-bottom: 0.75rem;
		flex-wrap: wrap;
	}

	.logs-file-btns,
	.logs-line-btns {
		display: flex;
		gap: 0.3rem;
		flex-wrap: wrap;
	}

	.logs-right {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.logs-unavailable {
		font-family: var(--font-ui);
		font-size: 0.82rem;
		color: var(--text-dimmer);
		text-align: center;
		padding: 2rem;
	}
	.logs-unavailable code {
		font-family: var(--font-mono);
		font-size: 0.8em;
		color: var(--text-accent);
	}

	.log-output {
		background: #0d1117;
		border: 1px solid var(--border);
		border-radius: 5px;
		padding: 0.5rem;
		max-height: 540px;
		overflow-y: auto;
		font-family: var(--font-mono);
		font-size: 0.72rem;
		line-height: 1.55;
		scroll-behavior: smooth;
	}

	.log-line {
		white-space: pre-wrap;
		word-break: break-all;
		color: #c9d1d9;
		padding: 1px 0;
	}
	.log-line.log-error { color: #ff7b72; }
	.log-line.log-warn  { color: #e3b341; }
	.log-line.log-debug { color: #6e7681; }

	.tab-btn.active.logs-active { color: var(--text-accent); }

		.btn-warn {
		background: #92400e;
		color: #fde68a;
		border: 1px solid #b45309;
	}
	.btn-warn:hover {
		background: #b45309;
		color: #fff;
	}
</style>
