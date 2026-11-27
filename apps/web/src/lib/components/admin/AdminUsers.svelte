<script lang="ts">
	/**
	 * /admin's Users tab: the sortable, paginated user table and its four
	 * confirmations (promote, suspend / unsuspend, clear game data, delete).
	 *
	 * The page loads `users` and `stats`; both are bound, because this tab
	 * changes them — deleting or wiping a user re-reads the totals the stat
	 * cards show. A failed action goes to `onerror` for the page's ErrorBar.
	 *
	 * Like every admin tab it stays mounted while another tab is open and
	 * renders only while `active`, so the sort and page survive a trip to
	 * another tab.
	 */
	import { admin } from '#lib/api.js';
	import type { AdminUser, AdminStats } from '@ironledger/shared';
	import { tooltip } from '#lib/actions/tooltip.js';
	import AdminModal from './AdminModal.svelte';

	let {
		active,
		users = $bindable(),
		stats = $bindable(),
		currentUserId,
		onerror,
	}: {
		/** The Users tab is open. */
		active: boolean;
		users: AdminUser[];
		stats: AdminStats | null;
		/** The signed-in admin, who can't suspend themself. */
		currentUserId: string | undefined;
		onerror: (message: string) => void;
	} = $props();

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
			const cmp =
				typeof av === 'string' ? av.localeCompare(bv as string) : (av as number) - (bv as number);
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
		return sortAsc ? ' ▲' : ' ▼';
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
	let clearDataTarget: AdminUser | null = $state(null);
	let clearingData = $state(false);

	async function confirmDelete() {
		if (!deleteTarget) return;
		try {
			await admin.deleteUser(deleteTarget.id);
			users = users.filter((u) => u.id !== deleteTarget!.id);
			deleteTarget = null;
			stats = await admin.getStats();
		} catch (err) {
			onerror(err instanceof Error ? err.message : 'Delete failed');
			deleteTarget = null;
		}
	}

	// ── Clear a user's game data (keep the account) ────────────────────────
	async function confirmClearData() {
		if (!clearDataTarget || clearingData) return;
		clearingData = true;
		try {
			await admin.clearUserData(clearDataTarget.id);
			clearDataTarget = null;
			// Counts (characters / encounters / expeditions) changed — refresh
			// the row data + totals so the table reflects the wipe.
			users = await admin.listUsers();
			stats = await admin.getStats();
		} catch (err) {
			onerror(err instanceof Error ? err.message : 'Clear data failed');
			clearDataTarget = null;
		} finally {
			clearingData = false;
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
			onerror(err instanceof Error ? err.message : 'Suspend action failed');
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
			onerror(err instanceof Error ? err.message : 'Role change failed');
		}
	}
</script>

{#if active}
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
					{@const isSelf = user.id === currentUserId}
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
						<td class="td-date"
							>{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleDateString() : 'Never'}</td
						>
						<td class="td-date">{new Date(user.createdAt).toLocaleDateString()}</td>
						<td class="td-num">{user.characterCount}</td>
						<td class="td-num">{user.encounterCount}</td>
						<td class="td-num">{user.expeditionCount}</td>
						<td class="td-actions">
							<div class="td-actions-inner">
								<button
									class="btn btn-icon"
									class:btn-dimmed={isLastAdmin}
									use:tooltip={isLastAdmin
										? 'Cannot demote the last admin'
										: user.role === 'admin'
											? 'Demote to user'
											: 'Promote to admin'}
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
									use:tooltip={isSelf
										? 'Cannot suspend your own account'
										: user.isActive
											? 'Suspend user (immediately boots and blocks login)'
											: 'Unsuspend user'}
									onclick={() => (suspendTarget = user)}
								>
									{user.isActive ? 'Suspend' : 'Unsuspend'}
								</button>
								<button
									class="btn btn-icon btn-warn"
									use:tooltip={'Clear game data (characters, connections, expeditions, foes, maps, log) — keeps the account'}
									onclick={() => (clearDataTarget = user)}
								>
									Clear data
								</button>
								<button
									class="btn btn-icon btn-danger"
									use:tooltip={'Delete user and all data'}
									onclick={() => (deleteTarget = user)}
								>
									Delete
								</button>
							</div>
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
			<button class="btn btn-icon" disabled={page >= totalPages} onclick={() => (page += 1)}
				>Next</button
			>
		</div>
	{/if}
{/if}

<!-- Delete confirmation dialog -->
{#if deleteTarget}
	<AdminModal onclose={() => (deleteTarget = null)}>
		<h3>Delete User</h3>
		<p>
			Permanently delete <strong>{deleteTarget.email}</strong> and all their data? This cannot be undone.
		</p>
		{#snippet actions()}
			<button class="btn" onclick={() => (deleteTarget = null)}>Cancel</button>
			<button class="btn btn-danger" onclick={confirmDelete}>Delete</button>
		{/snippet}
	</AdminModal>
{/if}

<!-- Clear-user-data confirmation dialog -->
{#if clearDataTarget}
	<AdminModal onclose={() => !clearingData && (clearDataTarget = null)}>
		<h3>Clear Game Data</h3>
		<p>
			Permanently wipe all game data for <strong>{clearDataTarget.email}</strong>: characters,
			connections (communities, NPCs, places), expeditions, foes, campaign maps &amp; markers, the
			session log, and portraits. This cannot be undone.
		</p>
		<p>
			The account itself is <strong>kept</strong> — login, AI keys, and theme/preferences are preserved.
		</p>
		{#snippet actions()}
			<button class="btn" disabled={clearingData} onclick={() => (clearDataTarget = null)}
				>Cancel</button
			>
			<button class="btn btn-danger" disabled={clearingData} onclick={confirmClearData}>
				{clearingData ? 'Clearing…' : 'Clear data'}
			</button>
		{/snippet}
	</AdminModal>
{/if}

<!-- Promote to admin confirmation dialog -->
{#if promoteTarget}
	<AdminModal onclose={() => (promoteTarget = null)}>
		<h3>Promote to Admin</h3>
		<p>
			Grant admin privileges to <strong>{promoteTarget.email}</strong>?
		</p>
		<p class="modal-warning">
			Admins can manage all users, view audit logs, and control maintenance mode. This should only
			be granted to trusted team members.
		</p>
		{#snippet actions()}
			<button class="btn" onclick={() => (promoteTarget = null)}>Cancel</button>
			<button class="btn btn-danger" onclick={confirmPromote}>Promote</button>
		{/snippet}
	</AdminModal>
{/if}

<!-- Suspend / unsuspend confirmation dialog -->
{#if suspendTarget}
	{@const target = suspendTarget}
	<!-- The actions snippet is a closure: TypeScript doesn't carry the #if's
	     narrowing into it, so it reads `target`, the narrowed copy. -->
	<AdminModal onclose={() => (suspendTarget = null)}>
		{#if suspendTarget.isActive}
			<h3>Suspend User</h3>
			<p>
				Suspend <strong>{suspendTarget.email}</strong>?
			</p>
			<p class="modal-warning">
				Their active sessions will be revoked immediately and they will be unable to log in until
				unsuspended.
			</p>
		{:else}
			<h3>Unsuspend User</h3>
			<p>
				Re-enable access for <strong>{suspendTarget.email}</strong>?
			</p>
		{/if}
		{#snippet actions()}
			<button class="btn" onclick={() => (suspendTarget = null)}>Cancel</button>
			<button class="btn {target.isActive ? 'btn-warn' : 'btn-success'}" onclick={confirmSuspend}>
				{target.isActive ? 'Suspend' : 'Unsuspend'}
			</button>
		{/snippet}
	</AdminModal>
{/if}

<style>
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
	}
	/* Flex lives on an inner wrapper, not the td itself — `display: flex`
	   on a table cell takes it out of the table's flow so its baseline and
	   border-bottom no longer line up with the neighbouring cells, which
	   makes the row's border appear disjoint under the actions column. */
	.td-actions-inner {
		display: flex;
		gap: 0.3rem;
		align-items: center;
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

	/* Caution box in the promote / suspend confirmations. Scoped here at
	   (0,2,0), so AdminModal's `.modal p` (0,2,1) still sets its font-size,
	   colour and bottom margin, as it always has. */
	.modal-warning {
		font-size: 0.8rem;
		color: var(--color-danger);
		background: color-mix(in srgb, var(--color-danger) 10%, transparent);
		border: 1px solid color-mix(in srgb, var(--color-danger) 30%, transparent);
		border-radius: 4px;
		padding: 8px 12px;
		margin-top: 0.25rem;
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
</style>
