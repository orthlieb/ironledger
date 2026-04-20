<script lang="ts">
	import { admin, maintenance as maintApi, broadcast as broadcastApi } from '$lib/api';
	import type { AdminUser, AdminStats, AdminInvite, MaintenanceStatus, BroadcastStatus, BroadcastSeverity, UserTimeseries, RegistrationLockStatus } from '@ironledger/shared';
	import type { LayoutData } from '../$types';

	let { data }: { data: LayoutData } = $props();

	let users: AdminUser[] = $state([]);
	let stats: AdminStats | null = $state(null);
	let loading = $state(true);
	let error = $state('');

	// ── Tabs ──────────────────────────────────────────────────────────────
	let activeTab: 'users' | 'invites' | 'logs' | 'tools' = $state('users');

	// ── Invites tab state ────────────────────────────────────────────────
	let invites: AdminInvite[] = $state([]);
	let inviteEmail       = $state('');
	let inviteDisplayName = $state('');
	let inviteBusy        = $state(false);
	let inviteError       = $state('');
	let inviteCreatedUrl  = $state('');   // shown after successful create for copy
	let inviteCreatedFor  = $state('');   // email the URL belongs to
	let inviteCopyFlash   = $state(false);

	async function loadInvites() {
		try {
			invites = await admin.listInvites();
		} catch (err) {
			console.error('loadInvites failed', err);
		}
	}

	async function handleCreateInvite(ev: Event) {
		ev.preventDefault();
		inviteError = '';
		inviteBusy  = true;
		try {
			const body: { email: string; displayName?: string } = { email: inviteEmail.trim() };
			const dn = inviteDisplayName.trim();
			if (dn) body.displayName = dn;
			const res = await admin.createInvite(body);
			inviteCreatedUrl = res.url;
			inviteCreatedFor = res.invite.email;
			inviteEmail       = '';
			inviteDisplayName = '';
			await loadInvites();
		} catch (err) {
			inviteError = err instanceof Error ? err.message : 'Failed to create invite';
		} finally {
			inviteBusy = false;
		}
	}

	async function handleRevokeInvite(id: string) {
		try {
			await admin.revokeInvite(id);
			await loadInvites();
		} catch (err) {
			inviteError = err instanceof Error ? err.message : 'Failed to revoke invite';
		}
	}

	async function copyInviteUrl() {
		try {
			await navigator.clipboard.writeText(inviteCreatedUrl);
			inviteCopyFlash = true;
			setTimeout(() => (inviteCopyFlash = false), 1500);
		} catch { /* clipboard may be unavailable — user can select manually */ }
	}

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
			stats = await admin.getStats();
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
	let expandedLine = $state<number | null>(null);
	let logSearch = $state('');
	let parsedLines = $derived(logLines.map(parseLogLine));
	let filteredLines = $derived(
		logSearch.trim()
			? parsedLines.filter(e =>
				e.msg.toLowerCase().includes(logSearch.toLowerCase()) ||
				e.level.toLowerCase().includes(logSearch.toLowerCase()) ||
				e.raw.toLowerCase().includes(logSearch.toLowerCase())
			)
			: parsedLines
	);

	const PINO_LEVELS: Record<number, string> = {
		10: 'TRACE', 20: 'DEBUG', 30: 'INFO', 40: 'WARN', 50: 'ERROR', 60: 'FATAL',
	};

	interface ParsedLine {
		ts: string;
		level: string;
		levelNum: number;
		msg: string;
		extras: Record<string, unknown>;
		raw: string;
	}

	function parseLogLine(raw: string): ParsedLine {
		try {
			const pm2 = JSON.parse(raw);
			const innerStr: string = pm2.message ?? raw;
			const rawTs: string = pm2.timestamp ?? '';
			// Trim '2026-03-24 06:26:25 +00:00' -> '03-24 06:26:25'
			const pm2ts = rawTs.length >= 19
				? rawTs.slice(5, 19)   // 'MM-DD HH:MM:SS'
				: rawTs;
			try {
				const p = JSON.parse(innerStr);
				const levelNum = typeof p.level === 'number' ? p.level : 30;
				const { level: _l, time: _t, pid: _p, hostname: _h, msg, v: _v, ...extras } = p;
				const ts = pm2ts || (p.time ? new Date(p.time).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '');
				return { ts, level: PINO_LEVELS[levelNum] ?? 'INFO', levelNum, msg: msg ?? innerStr, extras, raw };
			} catch {
				// Inner message is plain text -- use PM2 type field to infer level
				const level = pm2.type === 'err' ? 'ERROR'
					: innerStr.includes('ERROR') ? 'ERROR'
					: innerStr.includes('WARN')  ? 'WARN'
					: innerStr.includes('debug') ? 'DEBUG' : 'INFO';
				const levelNum = level === 'ERROR' ? 50 : level === 'WARN' ? 40 : level === 'DEBUG' ? 20 : 30;
				return { ts: pm2ts, level, levelNum, msg: innerStr, extras: {}, raw };
			}
		} catch {
			const level = raw.includes('ERROR') ? 'ERROR' : raw.includes('WARN') ? 'WARN' : raw.includes('DEBUG') ? 'DEBUG' : 'INFO';
			return { ts: '', level, levelNum: 30, msg: raw, extras: {}, raw };
		}
	}

	async function loadLogs(file = logFile, lines = logLineCount) {
		logLoading = true;
		expandedLine = null;
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

	$effect(() => {
		if (activeTab === 'invites') void loadInvites();
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

	// ── Broadcast banner ──────────────────────────────────────────────────
	let broadcastStatus: BroadcastStatus | null = $state(null);
	let broadcastMessage  = $state('');
	let broadcastSeverity: BroadcastSeverity = $state('info');
	let broadcastBusy  = $state(false);
	let broadcastError = $state('');

	async function refreshBroadcastStatus() {
		try {
			broadcastStatus = await broadcastApi.getStatus();
			if (broadcastStatus?.active) {
				broadcastMessage  = broadcastStatus.message ?? '';
				broadcastSeverity = broadcastStatus.severity;
			}
		} catch { /* ignore */ }
	}

	async function postBroadcast() {
		broadcastError = '';
		broadcastBusy  = true;
		try {
			broadcastStatus = await broadcastApi.post({
				message:  broadcastMessage.trim(),
				severity: broadcastSeverity,
			});
		} catch (err) {
			broadcastError = err instanceof Error ? err.message : 'Failed to post broadcast';
		} finally {
			broadcastBusy = false;
		}
	}

	async function clearBroadcast() {
		broadcastError = '';
		broadcastBusy  = true;
		try {
			await broadcastApi.clear();
			broadcastStatus = null;
			broadcastMessage = '';
		} catch (err) {
			broadcastError = err instanceof Error ? err.message : 'Failed to clear broadcast';
		} finally {
			broadcastBusy = false;
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

	// ── Registration lock ─────────────────────────────────────────────────
	let regLockStatus: RegistrationLockStatus | null = $state(null);
	let regLockMessage = $state('New registrations are currently closed.');
	let regLockLoading = $state(false);
	let showRegLockConfirm = $state(false);

	async function refreshRegLockStatus() {
		try {
			const res = await fetch('/api/admin/registration-lock');
			if (res.ok) regLockStatus = await res.json() as RegistrationLockStatus;
		} catch { /* ignore */ }
	}

	async function confirmEnableRegLock() {
		regLockLoading = true;
		try {
			const res = await fetch('/api/admin/registration-lock', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ message: regLockMessage }),
			});
			if (!res.ok) throw new Error('Failed to lock registration');
			showRegLockConfirm = false;
			await refreshRegLockStatus();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to lock registration';
			showRegLockConfirm = false;
		} finally {
			regLockLoading = false;
		}
	}

	async function disableRegLock() {
		regLockLoading = true;
		try {
			await fetch('/api/admin/registration-lock', { method: 'DELETE' });
			await refreshRegLockStatus();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to unlock registration';
		} finally {
			regLockLoading = false;
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
				await refreshRegLockStatus();
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
					class:active={activeTab === 'invites'}
					role="tab"
					aria-selected={activeTab === 'invites'}
					onclick={() => (activeTab = 'invites')}
				>Invites</button>
				<button
					class="tab-btn"
					class:active={activeTab === 'logs'}
					role="tab"
					aria-selected={activeTab === 'logs'}
					onclick={() => (activeTab = 'logs')}
				>Logs</button>
				<button
					class="tab-btn"
					class:active={activeTab === 'tools'}
					role="tab"
					aria-selected={activeTab === 'tools'}
					onclick={() => {
						activeTab = 'tools';
						void refreshMaintStatus();
						void refreshRegLockStatus();
						void refreshBroadcastStatus();
					}}
				>Tools</button>
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
								<th class="sortable" onclick={() => setSort('displayName')}>
									Display name{sortIcon('displayName')}
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
									<td class="td-display-name">{user.displayName}</td>
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

			<!-- ═══ Invites tab ═══ -->
			{:else if activeTab === 'invites'}
				<div class="invites-panel">
					<section class="invite-create">
						<h3 class="invites-h">Send an invitation</h3>
						<p class="invites-hint">
							Admin-issued invites bypass registration lock. The recipient will get a
							72-hour single-use link to set their password. Their account will be created
							as a normal <code>user</code> — promote to admin separately after they sign in.
						</p>

						<form class="invite-form" onsubmit={handleCreateInvite}>
							<label class="invite-field">
								<span>Email</span>
								<input
									type="email"
									bind:value={inviteEmail}
									required
									maxlength="254"
									autocomplete="email"
									placeholder="name@example.com"
								/>
							</label>
							<label class="invite-field">
								<span>Display name <span class="invite-opt">— optional, defaults to email</span></span>
								<input
									type="text"
									bind:value={inviteDisplayName}
									maxlength="80"
									autocomplete="nickname"
								/>
							</label>
							<div class="invite-actions">
								<button type="submit" class="btn btn-primary" disabled={inviteBusy || !inviteEmail.trim()}>
									{inviteBusy ? 'Sending…' : 'Send invite'}
								</button>
							</div>
							{#if inviteError}
								<div class="invite-error">{inviteError}</div>
							{/if}
						</form>

						{#if inviteCreatedUrl}
							<div class="invite-created">
								<p><strong>Invite created for {inviteCreatedFor}.</strong> Email has been sent, but you can also copy the link in case delivery fails:</p>
								<div class="invite-url-row">
									<input type="text" class="invite-url" readonly value={inviteCreatedUrl} onclick={(e) => (e.currentTarget as HTMLInputElement).select()} />
									<button type="button" class="btn" onclick={copyInviteUrl}>
										{inviteCopyFlash ? 'Copied!' : 'Copy'}
									</button>
								</div>
							</div>
						{/if}
					</section>

					<section class="invite-list-section">
						<h3 class="invites-h">Invitations</h3>
						{#if invites.length === 0}
							<p class="invites-empty">No invitations yet.</p>
						{:else}
							<table class="invite-table">
								<thead>
									<tr>
										<th>Email</th>
										<th>Display name</th>
										<th>Status</th>
										<th>Expires</th>
										<th>Created</th>
										<th></th>
									</tr>
								</thead>
								<tbody>
									{#each invites as inv (inv.id)}
										<tr>
											<td>{inv.email}</td>
											<td>{inv.displayName ?? '—'}</td>
											<td>
												<span class="invite-status invite-status--{inv.status}">{inv.status}</span>
											</td>
											<td class="td-date">{new Date(inv.expiresAt).toLocaleDateString()}</td>
											<td class="td-date">{new Date(inv.createdAt).toLocaleDateString()}</td>
											<td>
												{#if inv.status === 'pending'}
													<button type="button" class="btn btn-sm" onclick={() => handleRevokeInvite(inv.id)}>Revoke</button>
												{/if}
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						{/if}
					</section>
				</div>

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
				<div class="logs-search-row">
					<input
						type="search"
						class="logs-search"
						placeholder="Filter lines…"
						bind:value={logSearch}
					/>
					{#if logSearch}
						<button class="btn btn-icon" onclick={() => logSearch = ''}>Clear</button>
						<span class="logs-match-count">{filteredLines.length} / {parsedLines.length}</span>
					{/if}
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
						{#each filteredLines as entry, i}
							<div
								class="log-row log-{entry.level.toLowerCase()}"
								class:expanded={expandedLine === i}
								role="button"
								tabindex="0"
								onclick={() => expandedLine = expandedLine === i ? null : i}
								onkeydown={(e) => e.key === 'Enter' && (expandedLine = expandedLine === i ? null : i)}
							>
								<span class="log-ts">{entry.ts}</span>
								<span class="log-level log-level-{entry.level.toLowerCase()}">{entry.level}</span>
								<span class="log-msg">{entry.msg}</span>
								{#if Object.keys(entry.extras).length > 0}
									<span class="log-extras">
										{#each Object.entries(entry.extras).slice(0, 3) as [k, v]}
											<span class="log-kv"><span class="log-key">{k}</span>=<span class="log-val">{String(v)}</span></span>
										{/each}
										{#if Object.keys(entry.extras).length > 3}
											<span class="log-more">…</span>
										{/if}
									</span>
								{/if}
							</div>
							{#if expandedLine === i}
								<pre class="log-raw">{(() => { try { return JSON.stringify(JSON.parse(entry.raw), null, 2); } catch { return entry.raw; } })()}</pre>
							{/if}
						{/each}
					</div>
				{/if}

			<!-- ═══ Tools tab (Maintenance · Registration Lock · Broadcast) ═══ -->
			{:else if activeTab === 'tools'}
				<div class="tools-panel">

					<!-- ─── Tile 1: Maintenance Mode ─── -->
					<section class="tools-tile">
						<header class="tools-tile-head">
							<h3 class="tools-tile-title">Maintenance Mode</h3>
							<span class="tools-tile-dot" class:tools-tile-dot--active={maintStatus?.enabled}></span>
							<span class="tools-tile-status">{maintStatus?.enabled ? 'Active' : 'Off'}</span>
							{#if maintStatus?.enabled && maintCountdown}
								<span class="tools-tile-timer">Shutdown in <strong>{maintCountdown}</strong></span>
							{/if}
						</header>
						<p class="tools-tile-desc">
							Shows a global countdown banner, blocks non-admin logins, and revokes every active refresh
							token. Use for planned outages.
						</p>

						{#if maintStatus?.enabled}
							<div class="tools-tile-info">
								{#if maintStatus.message}
									<p class="tools-tile-msg">{maintStatus.message}</p>
								{/if}
								{#if maintStatus.shutdownAt}
									<p class="tools-tile-meta">
										Shutdown at {new Date(maintStatus.shutdownAt).toLocaleString()}
									</p>
								{/if}
							</div>
							<div class="tools-tile-actions">
								<button class="btn btn-success" disabled={maintLoading} onclick={disableMaint}>
									{maintLoading ? 'Disabling…' : 'Disable Maintenance'}
								</button>
							</div>
						{:else}
							<div class="tools-tile-form">
								<label class="tools-tile-field">
									<span>Message</span>
									<input
										type="text"
										placeholder="e.g. Upgrading to v2.0"
										bind:value={maintMessage}
										maxlength="500"
									/>
								</label>
								<label class="tools-tile-field tools-tile-field--narrow">
									<span>Minutes until shutdown</span>
									<input
										type="number"
										min="0"
										max="1440"
										bind:value={maintMinutes}
									/>
								</label>
							</div>
							<div class="tools-tile-actions">
								<button
									class="btn btn-danger"
									disabled={maintLoading || !maintMessage.trim()}
									onclick={() => (showMaintConfirm = true)}
								>Enable Maintenance Mode</button>
							</div>
						{/if}
					</section>

					<!-- ─── Tile 2: Registration Lock ─── -->
					<section class="tools-tile">
						<header class="tools-tile-head">
							<h3 class="tools-tile-title">Registration Lock</h3>
							<span class="tools-tile-dot" class:tools-tile-dot--active={regLockStatus?.locked}></span>
							<span class="tools-tile-status">{regLockStatus?.locked ? 'Locked' : 'Open'}</span>
						</header>
						<p class="tools-tile-desc">
							Blocks new account creation without signing anyone out. Use invites to onboard specific
							people while registration is locked.
						</p>

						{#if regLockStatus?.locked}
							<div class="tools-tile-info">
								{#if regLockStatus.message}
									<p class="tools-tile-msg">{regLockStatus.message}</p>
								{/if}
							</div>
							<div class="tools-tile-actions">
								<button class="btn btn-success" disabled={regLockLoading} onclick={disableRegLock}>
									{regLockLoading ? 'Unlocking…' : 'Unlock Registration'}
								</button>
							</div>
						{:else}
							<div class="tools-tile-form">
								<label class="tools-tile-field">
									<span>Message shown on the register page</span>
									<input
										type="text"
										placeholder="e.g. Registration is currently closed."
										bind:value={regLockMessage}
										maxlength="500"
									/>
								</label>
							</div>
							<div class="tools-tile-actions">
								<button
									class="btn btn-danger"
									disabled={regLockLoading || !regLockMessage.trim()}
									onclick={() => (showRegLockConfirm = true)}
								>Lock Registration</button>
							</div>
						{/if}
					</section>

					<!-- ─── Tile 3: Broadcast Banner ─── -->
					<section class="tools-tile">
						<header class="tools-tile-head">
							<h3 class="tools-tile-title">Broadcast Banner</h3>
							<span class="tools-tile-dot" class:tools-tile-dot--active={broadcastStatus?.active}></span>
							<span class="tools-tile-status">{broadcastStatus?.active ? 'Live' : 'Off'}</span>
						</header>
						<p class="tools-tile-desc">
							Informational or warning banner shown to every user until dismissed. Editing the message
							re-shows it for everyone — does not block login or revoke sessions.
						</p>

						{#if broadcastStatus?.active}
							<div class="tools-tile-info">
								<p class="tools-tile-msg">
									<span class="invite-status invite-status--{broadcastStatus.severity === 'warning' ? 'revoked' : 'accepted'}">{broadcastStatus.severity}</span>
									{broadcastStatus.message}
								</p>
								{#if broadcastStatus.postedAt}
									<p class="tools-tile-meta">
										Posted {new Date(broadcastStatus.postedAt).toLocaleString()}
									</p>
								{/if}
							</div>
						{/if}

						<div class="tools-tile-form">
							<label class="tools-tile-field">
								<span>Message</span>
								<input
									type="text"
									bind:value={broadcastMessage}
									maxlength="500"
									placeholder="e.g. Foe images regenerating tonight 10–11pm UTC."
								/>
							</label>
							<div class="tools-tile-severity">
								<span class="tools-tile-field-label">Severity</span>
								<label class="severity-opt">
									<input type="radio" bind:group={broadcastSeverity} value="info" />
									<span>Info</span>
								</label>
								<label class="severity-opt">
									<input type="radio" bind:group={broadcastSeverity} value="warning" />
									<span>Warning</span>
								</label>
							</div>
						</div>
						<div class="tools-tile-actions">
							<button
								type="button"
								class="btn btn-primary"
								disabled={broadcastBusy || !broadcastMessage.trim()}
								onclick={postBroadcast}
							>
								{broadcastBusy ? 'Saving…' : (broadcastStatus?.active ? 'Update banner' : 'Post banner')}
							</button>
							{#if broadcastStatus?.active}
								<button type="button" class="btn" disabled={broadcastBusy} onclick={clearBroadcast}>Clear</button>
							{/if}
						</div>
						{#if broadcastError}
							<div class="invite-error">{broadcastError}</div>
						{/if}
					</section>

				</div>
			{/if}

		</div>
	{/if}
</div>

<!-- Delete confirmation dialog -->
{#if deleteTarget}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="modal-backdrop" onclick={() => (deleteTarget = null)} onkeydown={(e) => e.key === 'Escape' && (deleteTarget = null)}>
		<div class="modal card" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1">
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

<!-- Lock registration confirmation dialog -->
{#if showRegLockConfirm}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="modal-backdrop" onclick={() => (showRegLockConfirm = false)} onkeydown={(e) => e.key === 'Escape' && (showRegLockConfirm = false)}>
		<div class="modal card" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1">
			<h3 class="maint-modal-title">Lock Registration</h3>
			<p>New users will be unable to create accounts. Existing users are unaffected.</p>
			<p>Message: <strong>{regLockMessage}</strong></p>
			<div class="modal-actions">
				<button class="btn" onclick={() => (showRegLockConfirm = false)}>Cancel</button>
				<button class="btn btn-danger" disabled={regLockLoading} onclick={confirmEnableRegLock}>
					{regLockLoading ? 'Locking...' : 'Lock'}
				</button>
			</div>
		</div>
	</div>
{/if}

<!-- Enable maintenance confirmation dialog -->
{#if showMaintConfirm}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="modal-backdrop" onclick={() => (showMaintConfirm = false)} onkeydown={(e) => e.key === 'Escape' && (showMaintConfirm = false)}>
		<div class="modal card" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1">
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
		<div class="modal card" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1">
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
		<div class="modal card" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1">
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
		background: var(--bg-inset);
		border: 1px solid var(--border);
		border-radius: 5px;
		max-height: 560px;
		overflow-y: auto;
		font-family: var(--font-mono);
		font-size: 0.72rem;
		line-height: 1.5;
	}

	.log-row {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		padding: 0.18rem 0.6rem;
		cursor: pointer;
		border-bottom: 1px solid var(--border);
		color: var(--text);
		border-left: 2px solid transparent;
	}
	.log-row:hover    { background: var(--bg-hover); }
	.log-row.expanded { background: var(--bg-control); }
	.log-row.log-error,
	.log-row.log-fatal { border-left-color: var(--color-danger); }
	.log-row.log-warn  { border-left-color: var(--color-warning); }

	.log-ts {
		color: var(--text-dimmer);
		flex-shrink: 0;
		width: 14ch;
		text-align: right;
		white-space: nowrap;
	}

	.log-level {
		flex-shrink: 0;
		width: 5ch;
		text-align: center;
		font-weight: 700;
		font-size: 0.65rem;
		letter-spacing: 0.04em;
		border-radius: 3px;
		padding: 0 3px;
	}
	.log-level-info  { color: var(--text-accent);   background: color-mix(in srgb, var(--text-accent)  12%, transparent); }
	.log-level-warn  { color: var(--color-warning); background: color-mix(in srgb, var(--color-warning) 12%, transparent); }
	.log-level-error { color: var(--color-danger);  background: color-mix(in srgb, var(--color-danger)  12%, transparent); }
	.log-level-fatal { color: var(--color-danger);  background: color-mix(in srgb, var(--color-danger)  20%, transparent); }
	.log-level-debug { color: var(--text-dimmer);   background: color-mix(in srgb, var(--text-dimmer)   12%, transparent); }
	.log-level-trace { color: var(--text-dimmer);   background: color-mix(in srgb, var(--text-dimmer)    8%, transparent); }

	.log-msg {
		flex: 1;
		color: var(--text);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.log-extras {
		display: flex;
		gap: 0.6rem;
		flex-shrink: 0;
		color: var(--text-dimmer);
	}
	.log-kv  { white-space: nowrap; }
	.log-key { color: var(--color-success); }
	.log-val { color: var(--text-accent); }
	.log-more { color: var(--text-dimmer); }

	.log-raw {
		margin: 0;
		padding: 0.5rem 0.6rem 0.5rem 14ch;
		background: var(--bg-control);
		color: var(--text-muted);
		font-size: 0.68rem;
		white-space: pre-wrap;
		word-break: break-all;
		border-bottom: 1px solid var(--border);
	}

	.logs-search-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
	}

	.logs-search {
		flex: 1;
		padding: 0.35rem 0.6rem;
		font-family: var(--font-ui);
		font-size: 0.78rem;
		background: var(--bg-inset);
		color: var(--text-body);
		border: 1px solid var(--border);
		border-radius: 4px;
		outline: none;
	}
	.logs-search:focus { border-color: var(--text-accent); }
	.logs-search::placeholder { color: var(--text-dimmer); }

	.logs-match-count {
		font-family: var(--font-ui);
		font-size: 0.75rem;
		color: var(--text-dimmer);
		white-space: nowrap;
	}

		.btn-warn {
		background: #92400e;
		color: #fde68a;
		border: 1px solid #b45309;
	}
	.btn-warn:hover {
		background: #b45309;
		color: #fff;
	}

	/* ── Invites tab ──────────────────────────────────────────────── */
	.invites-panel {
		display: flex;
		flex-direction: column;
		gap: 2rem;
		max-width: 820px;
	}
	.invites-h {
		font-family: var(--font-display);
		font-size: 0.95rem;
		font-weight: 700;
		letter-spacing: 0.05em;
		color: var(--text-accent);
		margin: 0 0 0.6rem;
	}
	.invites-hint {
		font-size: 0.82rem;
		line-height: 1.55;
		color: var(--text-muted);
		margin: 0 0 1rem;
		max-width: 68ch;
	}
	.invites-hint code {
		font-family: var(--font-ui);
		font-size: 0.78rem;
		padding: 1px 6px;
		border-radius: 3px;
		background: var(--bg-inset);
		color: var(--text);
	}
	.invite-form {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}
	.invite-field {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.invite-field span {
		font-family: var(--font-ui);
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--text-muted);
		letter-spacing: 0.03em;
	}
	.invite-opt {
		color: var(--text-dimmer);
		font-weight: normal;
	}
	.invite-field input {
		padding: 8px 10px;
		border: 1px solid var(--border-mid);
		border-radius: 4px;
		background: var(--bg-control);
		color: var(--text);
		font-family: var(--font-ui);
		font-size: 0.88rem;
	}
	.invite-field input:focus {
		outline: none;
		border-color: var(--text-accent);
	}
	.invite-actions { margin-top: 0.25rem; }
	.invite-error {
		color: var(--color-danger);
		font-size: 0.82rem;
		margin-top: 0.25rem;
	}
	.invite-created {
		margin-top: 1rem;
		padding: 12px 14px;
		border: 1px solid var(--border);
		border-radius: 4px;
		background: var(--bg-inset);
	}
	.invite-created p {
		margin: 0 0 0.6rem;
		font-size: 0.84rem;
		line-height: 1.55;
		color: var(--text-muted);
	}
	.invite-url-row {
		display: flex;
		gap: 0.5rem;
		align-items: stretch;
	}
	.invite-url {
		flex: 1;
		padding: 6px 8px;
		border: 1px solid var(--border);
		border-radius: 3px;
		background: var(--bg-card);
		color: var(--text);
		font-family: 'Roboto Mono', monospace;
		font-size: 0.72rem;
	}
	.invites-empty {
		font-size: 0.82rem;
		color: var(--text-dimmer);
		font-style: italic;
	}
	.invite-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.82rem;
	}
	.invite-table th,
	.invite-table td {
		padding: 6px 8px;
		text-align: left;
		border-bottom: 1px solid var(--border);
	}
	.invite-table th {
		font-family: var(--font-ui);
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--text-dimmer);
	}
	.invite-table .td-date { white-space: nowrap; color: var(--text-muted); }
	.invite-status {
		display: inline-block;
		padding: 2px 8px;
		border-radius: 10px;
		font-family: var(--font-ui);
		font-size: 0.68rem;
		font-weight: 600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}
	.invite-status--pending  { background: rgba(34, 211, 238, 0.12); color: var(--color-momentum); }
	.invite-status--accepted { background: rgba(74, 222, 128, 0.12); color: var(--color-health); }
	.invite-status--revoked  { background: rgba(221, 81, 76, 0.12); color: var(--color-danger); }
	.invite-status--expired  { background: rgba(255, 255, 255, 0.06); color: var(--text-dimmer); }
	.btn-sm {
		padding: 3px 10px;
		font-size: 0.72rem;
	}

	/* ──────────────────────────────────────────────────────────────────────
	   Tools tab — three vertical tiles (Maintenance · Reg Lock · Broadcast)
	   ────────────────────────────────────────────────────────────────────── */
	.tools-panel {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
		max-width: 820px;
	}

	.tools-tile {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 1.1rem 1.2rem 1.15rem;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--bg-card);
	}

	.tools-tile-head {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.tools-tile-title {
		flex: 1 1 auto;
		font-family: var(--font-display);
		font-size: 0.95rem;
		font-weight: 700;
		letter-spacing: 0.05em;
		color: var(--text-accent);
		margin: 0;
	}
	.tools-tile-dot {
		width: 9px;
		height: 9px;
		border-radius: 50%;
		background: var(--text-dimmer);
		flex-shrink: 0;
	}
	.tools-tile-dot--active {
		background: var(--color-danger);
		box-shadow: 0 0 6px color-mix(in srgb, var(--color-danger) 55%, transparent);
	}
	.tools-tile-status {
		font-family: var(--font-ui);
		font-size: 0.72rem;
		font-weight: 600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.tools-tile-timer {
		font-family: var(--font-ui);
		font-size: 0.75rem;
		color: var(--color-danger);
		margin-left: auto;
	}
	.tools-tile-timer strong {
		font-family: 'Roboto Mono', monospace;
		font-weight: 700;
	}

	.tools-tile-desc {
		margin: 0;
		font-size: 0.82rem;
		line-height: 1.55;
		color: var(--text-muted);
		max-width: 68ch;
	}

	.tools-tile-info {
		padding: 10px 12px;
		border: 1px solid var(--border);
		border-radius: 4px;
		background: var(--bg-inset);
	}
	.tools-tile-msg {
		margin: 0;
		font-size: 0.88rem;
		line-height: 1.5;
		color: var(--text);
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.tools-tile-meta {
		margin: 0.4rem 0 0;
		font-size: 0.72rem;
		color: var(--text-dimmer);
	}

	.tools-tile-form {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}
	.tools-tile-field {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.tools-tile-field--narrow { max-width: 220px; }
	.tools-tile-field > span,
	.tools-tile-field-label {
		font-family: var(--font-ui);
		font-size: 0.72rem;
		font-weight: 600;
		letter-spacing: 0.03em;
		color: var(--text-muted);
	}
	.tools-tile-field input {
		padding: 7px 10px;
		border: 1px solid var(--border-mid);
		border-radius: 4px;
		background: var(--bg-control);
		color: var(--text);
		font-family: var(--font-ui);
		font-size: 0.85rem;
	}
	.tools-tile-field input:focus {
		outline: none;
		border-color: var(--text-accent);
	}

	.tools-tile-severity {
		display: flex;
		align-items: center;
		gap: 0.8rem;
		flex-wrap: wrap;
	}

	.tools-tile-actions {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.severity-opt {
		display: flex;
		align-items: center;
		gap: 4px;
		font-size: 0.82rem;
		color: var(--text-muted);
		cursor: pointer;
	}
	.severity-opt input { margin: 0; }
</style>
