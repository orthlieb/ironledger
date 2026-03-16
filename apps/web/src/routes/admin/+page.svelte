<script lang="ts">
	import { admin, maintenance as maintApi } from '$lib/api';
	import type { AdminUser, AdminStats, AuditEvent, MaintenanceStatus } from '@ironledger/shared';

	let users: AdminUser[] = $state([]);
	let stats: AdminStats | null = $state(null);
	let auditLog: AuditEvent[] = $state([]);
	let loading = $state(true);
	let error = $state('');

	// ── Tabs ──────────────────────────────────────────────────────────────
	let activeTab: 'users' | 'audit' | 'maintenance' = $state('users');

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

	// ── Toggle role ───────────────────────────────────────────────────────
	async function toggleRole(user: AdminUser) {
		const newRole = user.role === 'admin' ? 'user' : 'admin';
		try {
			await admin.setRole(user.id, newRole);
			user.role = newRole;
			users = [...users];
			void refreshAuditLog();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Role change failed';
		}
	}

	// ── Audit log ─────────────────────────────────────────────────────────
	let auditSearch = $state('');
	let searchTimeout: ReturnType<typeof setTimeout> | undefined;

	async function refreshAuditLog() {
		try { auditLog = await admin.getAuditLog(auditSearch || undefined); } catch { /* ignore */ }
	}

	function onSearchInput() {
		clearTimeout(searchTimeout);
		searchTimeout = setTimeout(() => { void refreshAuditLog(); }, 300);
	}

	// ── Clear audit log ───────────────────────────────────────────────────
	let showClearConfirm = $state(false);

	async function confirmClearAudit() {
		try {
			await admin.clearAuditLog();
			showClearConfirm = false;
			await refreshAuditLog();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Clear failed';
			showClearConfirm = false;
		}
	}

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
			void refreshAuditLog();
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
			void refreshAuditLog();
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to disable maintenance';
		} finally {
			maintLoading = false;
		}
	}

	// ── Event display helpers ─────────────────────────────────────────────

	function eventLabel(eventType: string): string {
		const map: Record<string, string> = {
			admin_delete_user:   'Deleted User',
			admin_set_role:      'Changed Role',
			admin_clear_audit:   'Cleared Log',
			api_error:           'API Error',
			login_success:       'Login',
			login_failed:        'Login Failed',
			login_unverified:    'Unverified Login',
			account_disabled:    'Disabled Acct',
			register_success:    'Registered',
			email_verified:      'Email Verified',
			password_reset_req:  'Password Reset Req',
			password_reset_done: 'Password Reset',
			token_theft:         'Token Theft',
			token_refresh:       'Token Refresh',
			admin_enable_maintenance:  'Maint Enabled',
			admin_disable_maintenance: 'Maint Disabled',
		};
		return map[eventType] ?? eventType;
	}

	function eventDetail(e: AuditEvent): string {
		const m = e.metadata;
		if (!m) return '';
		if (e.eventType === 'admin_delete_user') {
			return String(m.targetEmail ?? m.targetUserId ?? '');
		}
		if (e.eventType === 'admin_set_role') {
			return `${m.targetEmail}: ${m.previousRole} \u2192 ${m.newRole}`;
		}
		if (e.eventType === 'api_error') {
			return `${m.method} ${m.url} \u2192 ${m.statusCode}: ${m.message}`;
		}
		if (e.eventType === 'login_success' || e.eventType === 'login_failed'
			|| e.eventType === 'login_unverified' || e.eventType === 'account_disabled'
			|| e.eventType === 'register_success') {
			return String(m.email ?? '');
		}
		if (e.eventType === 'admin_clear_audit') return '';
		if (e.eventType === 'admin_enable_maintenance') {
			return `"${m.message}" (${m.minutesUntilShutdown}m)`;
		}
		if (e.eventType === 'admin_disable_maintenance') return '';
		return JSON.stringify(m);
	}

	function eventClass(eventType: string): string {
		if (eventType === 'api_error' || eventType === 'token_theft') return 'audit-type-error';
		if (eventType === 'login_failed' || eventType === 'login_unverified'
			|| eventType === 'account_disabled'
			|| eventType === 'admin_enable_maintenance') return 'audit-type-warn';
		if (eventType === 'login_success' || eventType === 'register_success'
			|| eventType === 'email_verified'
			|| eventType === 'admin_disable_maintenance') return 'audit-type-success';
		return '';
	}

	// ── Load data on mount ────────────────────────────────────────────────
	$effect(() => {
		(async () => {
			try {
				const [u, s, a, ms] = await Promise.all([
					admin.listUsers(),
					admin.getStats(),
					admin.getAuditLog(),
					maintApi.getStatus(),
				]);
				users = u;
				stats = s;
				auditLog = a;
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
			</div>
		{/if}

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
					class:active={activeTab === 'audit'}
					role="tab"
					aria-selected={activeTab === 'audit'}
					onclick={() => (activeTab = 'audit')}
				>Audit Log</button>
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
											title={user.role === 'admin' ? 'Demote to user' : 'Promote to admin'}
											onclick={() => toggleRole(user)}
										>
											{user.role === 'admin' ? 'Demote' : 'Promote'}
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

			<!-- ═══ Audit Log tab ═══ -->
			{:else if activeTab === 'audit'}
				<div class="audit-toolbar">
					<input
						class="audit-search"
						type="text"
						placeholder="Search by email..."
						bind:value={auditSearch}
						oninput={onSearchInput}
					/>
					<button
						class="btn btn-icon btn-danger"
						onclick={() => (showClearConfirm = true)}
					>Clear Log</button>
				</div>

				{#if auditLog.length === 0}
					<p class="audit-empty">No audit events found.</p>
				{:else}
					<div class="audit-log">
						{#each auditLog as event (event.id)}
							<div class="audit-entry">
								<span class="audit-time">
									{new Date(event.createdAt).toLocaleString()}
								</span>
								<span class="audit-type {eventClass(event.eventType)}">
									{eventLabel(event.eventType)}
								</span>
								{#if event.adminEmail}
									<span class="audit-admin">{event.adminEmail}</span>
								{/if}
								<span class="audit-detail">{eventDetail(event)}</span>
								{#if event.ipAddress}
									<span class="audit-ip">{event.ipAddress}</span>
								{/if}
							</div>
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

<!-- Clear audit log confirmation dialog -->
{#if showClearConfirm}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="modal-backdrop" onclick={() => (showClearConfirm = false)} onkeydown={(e) => e.key === 'Escape' && (showClearConfirm = false)}>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="modal card" onclick={(e) => e.stopPropagation()}>
			<h3>Clear Audit Log</h3>
			<p>
				Delete all audit log entries? This cannot be undone.
			</p>
			<div class="modal-actions">
				<button class="btn" onclick={() => (showClearConfirm = false)}>Cancel</button>
				<button class="btn btn-danger" onclick={confirmClearAudit}>Clear</button>
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
		margin-bottom: 1rem;
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

	/* ── Audit toolbar ── */
	.audit-toolbar {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.75rem;
	}

	.audit-search {
		flex: 1;
		padding: 0.4rem 0.6rem;
		font-family: var(--font-ui);
		font-size: 0.78rem;
		background: var(--bg-inset);
		color: var(--text-body);
		border: 1px solid var(--border);
		border-radius: 4px;
		outline: none;
	}
	.audit-search:focus {
		border-color: var(--text-accent);
	}
	.audit-search::placeholder {
		color: var(--text-dimmer);
	}

	.audit-empty {
		font-family: var(--font-ui);
		font-size: 0.82rem;
		color: var(--text-dimmer);
		text-align: center;
		padding: 2rem;
	}

	/* ── Audit log ── */
	.audit-log {
		display: flex;
		flex-direction: column;
		gap: 1px;
		background: var(--border);
		border: 1px solid var(--border);
		border-radius: 5px;
		overflow: hidden;
	}

	.audit-entry {
		display: flex;
		align-items: baseline;
		gap: 0.6rem;
		padding: 0.4rem 0.6rem;
		font-family: var(--font-ui);
		font-size: 0.75rem;
		background: var(--bg-card);
	}

	.audit-entry:hover {
		background: var(--bg-hover);
	}

	.audit-time {
		color: var(--text-dimmer);
		white-space: nowrap;
		font-family: var(--font-mono);
		font-size: 0.7rem;
		flex-shrink: 0;
	}

	.audit-type {
		color: var(--text-accent);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		font-size: 0.68rem;
		flex-shrink: 0;
	}

	.audit-type-error {
		color: var(--color-danger);
	}

	.audit-type-warn {
		color: #d4a017;
	}

	.audit-type-success {
		color: var(--color-success);
	}

	.audit-admin {
		color: var(--text-muted);
		font-weight: 500;
		font-size: 0.72rem;
		flex-shrink: 0;
	}

	.audit-detail {
		color: var(--text-muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.audit-ip {
		color: var(--text-dimmer);
		font-family: var(--font-mono);
		font-size: 0.68rem;
		flex-shrink: 0;
		margin-left: auto;
	}

	/* ── Maintenance tab ── */
	.maint-panel {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		max-width: 500px;
	}

	.maint-status-row {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		font-family: var(--font-ui);
	}

	.maint-dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: var(--color-success);
		flex-shrink: 0;
	}

	.maint-dot-active {
		background: var(--color-danger);
		animation: maint-blink 1.2s ease-in-out infinite;
	}

	@keyframes maint-blink {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.4; }
	}

	.maint-status-label {
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--text-body);
	}

	.maint-timer {
		font-family: var(--font-mono);
		font-size: 0.78rem;
		color: var(--color-danger);
		margin-left: auto;
	}

	.maint-active-info {
		background: color-mix(in srgb, var(--color-danger) 10%, transparent);
		border: 1px solid var(--color-danger);
		border-radius: 5px;
		padding: 0.6rem 0.8rem;
	}

	.maint-msg {
		font-family: var(--font-ui);
		font-size: 0.82rem;
		color: var(--text-body);
		margin: 0;
	}

	.maint-shutdown {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--text-muted);
		margin: 0.3rem 0 0;
	}

	.maint-form {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}

	.maint-label {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		font-family: var(--font-ui);
		font-size: 0.72rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--text-dimmer);
	}

	.maint-input {
		padding: 0.4rem 0.6rem;
		font-family: var(--font-ui);
		font-size: 0.82rem;
		background: var(--bg-inset);
		color: var(--text-body);
		border: 1px solid var(--border);
		border-radius: 4px;
		outline: none;
	}
	.maint-input:focus {
		border-color: var(--text-accent);
	}

	.maint-input-num {
		max-width: 100px;
	}

	.maint-modal-title {
		color: var(--color-danger) !important;
	}

	.btn-success {
		background: var(--color-success);
		color: #fff;
		border: 1px solid var(--color-success);
	}
	.btn-success:hover {
		filter: brightness(1.1);
	}
</style>
