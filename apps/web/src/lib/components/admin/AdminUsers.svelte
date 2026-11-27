<script lang="ts">
	/**
	 * /admin's Users tab: the sortable, paginated list of users and its four
	 * confirmations (promote, suspend / unsuspend, clear game data, delete).
	 * A wide screen shows a table with sortable column headings; anything
	 * narrower than 1100px (phones and tablets) shows a grid of cards, one
	 * per user, with a sort picker above. Both read the same sorted page and
	 * share the row's buttons.
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
	import ConfirmDialog from '#lib/components/ConfirmDialog.svelte';
	import Select from '#lib/components/Select.svelte';

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
	type SortKey = Exclude<keyof AdminUser, 'id'>;
	const SORT_OPTIONS: { value: SortKey; label: string }[] = [
		{ value: 'email', label: 'Email' },
		{ value: 'displayName', label: 'Display name' },
		{ value: 'role', label: 'Role' },
		{ value: 'isActive', label: 'Active' },
		{ value: 'lastLoginAt', label: 'Last login' },
		{ value: 'createdAt', label: 'Created' },
		{ value: 'characterCount', label: 'Characters' },
		{ value: 'encounterCount', label: 'Encounters' },
		{ value: 'expeditionCount', label: 'Expeditions' },
	];
	let sortKey: SortKey = $state('email');
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

	function setSort(key: SortKey) {
		if (sortKey === key) {
			sortAsc = !sortAsc;
		} else {
			sortKey = key;
			sortAsc = true;
		}
		page = 1;
	}

	function sortIcon(key: SortKey): string {
		if (sortKey !== key) return '';
		return sortAsc ? ' ▲' : ' ▼';
	}

	// ── Pagination ────────────────────────────────────────────────────────
	const PAGE_SIZE = 25;
	let page = $state(1);
	let totalPages = $derived(Math.max(1, Math.ceil(sorted.length / PAGE_SIZE)));
	let paginated = $derived(sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE));

	function shortDate(iso: string | null): string {
		return iso ? new Date(iso).toLocaleDateString() : 'Never';
	}

	// ── Confirmations ─────────────────────────────────────────────────────
	// Each button sets its target and opens its dialog; Cancel, ✕ and Escape
	// clear the target again.
	let deleteTarget: AdminUser | null = $state(null);
	let promoteTarget: AdminUser | null = $state(null);
	let suspendTarget: AdminUser | null = $state(null);
	let clearDataTarget: AdminUser | null = $state(null);
	let deleteConfirm = $state<ReturnType<typeof ConfirmDialog> | null>(null);
	let promoteConfirm = $state<ReturnType<typeof ConfirmDialog> | null>(null);
	let suspendConfirm = $state<ReturnType<typeof ConfirmDialog> | null>(null);
	let clearDataConfirm = $state<ReturnType<typeof ConfirmDialog> | null>(null);
	/** The user whose game data is being wiped; their Clear data button says so. */
	let clearingId: string | null = $state(null);

	async function confirmDelete() {
		const target = deleteTarget;
		deleteTarget = null;
		if (!target) return;
		try {
			await admin.deleteUser(target.id);
			users = users.filter((u) => u.id !== target.id);
			stats = await admin.getStats();
		} catch (err) {
			onerror(err instanceof Error ? err.message : 'Delete failed');
		}
	}

	// ── Clear a user's game data (keep the account) ────────────────────────
	async function confirmClearData() {
		const target = clearDataTarget;
		clearDataTarget = null;
		if (!target || clearingId) return;
		clearingId = target.id;
		try {
			await admin.clearUserData(target.id);
			// Counts (characters / encounters / expeditions) changed — refresh
			// the row data + totals so the table reflects the wipe.
			users = await admin.listUsers();
			stats = await admin.getStats();
		} catch (err) {
			onerror(err instanceof Error ? err.message : 'Clear data failed');
		} finally {
			clearingId = null;
		}
	}

	// ── Suspend / unsuspend user ──────────────────────────────────────────
	async function confirmSuspend() {
		const target = suspendTarget;
		suspendTarget = null;
		if (!target) return;
		try {
			const willSuspend = target.isActive;
			await admin.suspendUser(target.id, willSuspend);
			target.isActive = !willSuspend;
			users = [...users];
		} catch (err) {
			onerror(err instanceof Error ? err.message : 'Suspend action failed');
		}
	}

	// ── Toggle role ───────────────────────────────────────────────────────
	let adminCount = $derived(users.filter((u) => u.role === 'admin').length);

	async function toggleRole(user: AdminUser) {
		// Demoting is low-risk — no confirmation needed.
		// Promoting to admin is serious — show a confirmation dialog first.
		if (user.role === 'user') {
			promoteTarget = user;
			promoteConfirm?.open();
			return;
		}
		// Guard: never demote the last admin.
		if (adminCount <= 1) return;
		await applyRoleChange(user, 'user');
	}

	async function confirmPromote() {
		const target = promoteTarget;
		promoteTarget = null;
		if (target) await applyRoleChange(target, 'admin');
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

<!-- A user's four buttons, in the table's last column and at the foot of a card. -->
{#snippet rowActions(user: AdminUser)}
	{@const isLastAdmin = user.role === 'admin' && adminCount <= 1}
	{@const isSelf = user.id === currentUserId}
	<button
		class="btn btn-icon"
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
		class:btn-success={!user.isActive}
		disabled={isSelf}
		use:tooltip={isSelf
			? 'Cannot suspend your own account'
			: user.isActive
				? 'Suspend user (immediately boots and blocks login)'
				: 'Unsuspend user'}
		onclick={() => {
			suspendTarget = user;
			suspendConfirm?.open();
		}}
	>
		{user.isActive ? 'Suspend' : 'Unsuspend'}
	</button>
	<button
		class="btn btn-icon btn-warn"
		disabled={clearingId !== null}
		use:tooltip={'Clear game data (characters, connections, expeditions, foes, maps, log) — keeps the account'}
		onclick={() => {
			clearDataTarget = user;
			clearDataConfirm?.open();
		}}
	>
		{clearingId === user.id ? 'Clearing…' : 'Clear data'}
	</button>
	<button
		class="btn btn-icon btn-danger"
		use:tooltip={'Delete user and all data'}
		onclick={() => {
			deleteTarget = user;
			deleteConfirm?.open();
		}}
	>
		Delete
	</button>
{/snippet}

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
					<tr>
						<td class="td-email">{user.email}</td>
						<td class="td-name">{user.displayName}</td>
						<td>
							<span class="role-badge" class:role-admin={user.role === 'admin'}>
								{user.role}
							</span>
						</td>
						<td>
							<span class="active-dot" class:active-yes={user.isActive}></span>
						</td>
						<td class="td-date">{shortDate(user.lastLoginAt)}</td>
						<td class="td-date">{shortDate(user.createdAt)}</td>
						<td class="td-num">{user.characterCount}</td>
						<td class="td-num">{user.encounterCount}</td>
						<td class="td-num">{user.expeditionCount}</td>
						<td class="td-actions">
							<div class="td-actions-inner">{@render rowActions(user)}</div>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	<!-- Narrow screens: a sort picker and one card per user, in place of the table. -->
	<div class="uc-sort">
		<Select
			value={sortKey}
			options={SORT_OPTIONS}
			ariaLabel="Sort users by"
			onchange={(v) => {
				sortKey = v;
				page = 1;
			}}
		/>
		<button
			class="btn btn-icon"
			aria-label={sortAsc ? 'Ascending' : 'Descending'}
			use:tooltip={sortAsc ? 'Ascending' : 'Descending'}
			onclick={() => {
				sortAsc = !sortAsc;
				page = 1;
			}}>{sortAsc ? '▲' : '▼'}</button
		>
	</div>
	<ul class="user-cards">
		{#each paginated as user (user.id)}
			<li class="user-card">
				<div class="uc-head">
					<span
						class="active-dot"
						class:active-yes={user.isActive}
						role="img"
						aria-label={user.isActive ? 'Active' : 'Suspended'}
					></span>
					<span class="uc-email">{user.email}</span>
					<span class="role-badge" class:role-admin={user.role === 'admin'}>{user.role}</span>
				</div>
				{#if user.displayName && user.displayName !== user.email}
					<div class="uc-name">{user.displayName}</div>
				{/if}
				<div class="uc-meta">
					Last login {shortDate(user.lastLoginAt)} · Created {shortDate(user.createdAt)}
				</div>
				<div class="uc-meta">
					{user.characterCount} characters · {user.encounterCount} encounters · {user.expeditionCount}
					expeditions
				</div>
				<div class="uc-actions">{@render rowActions(user)}</div>
			</li>
		{/each}
	</ul>

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

<ConfirmDialog
	bind:this={deleteConfirm}
	title="Delete User"
	confirmLabel="Delete"
	onconfirm={confirmDelete}
	oncancel={() => (deleteTarget = null)}
>
	<p class="adm-confirm-text">
		Permanently delete <strong>{deleteTarget?.email}</strong> and all their data? This cannot be undone.
	</p>
</ConfirmDialog>

<ConfirmDialog
	bind:this={clearDataConfirm}
	title="Clear Game Data"
	confirmLabel="Clear data"
	onconfirm={confirmClearData}
	oncancel={() => (clearDataTarget = null)}
>
	<p class="adm-confirm-text">
		Permanently wipe all game data for <strong>{clearDataTarget?.email}</strong>: characters,
		connections (communities, NPCs, places), expeditions, foes, campaign maps &amp; markers, the
		session log, and portraits. This cannot be undone.
	</p>
	<p class="adm-confirm-text">
		The account itself is <strong>kept</strong> — login, AI keys, and theme/preferences are preserved.
	</p>
</ConfirmDialog>

<ConfirmDialog
	bind:this={promoteConfirm}
	title="Promote to Admin"
	confirmLabel="Promote"
	onconfirm={confirmPromote}
	oncancel={() => (promoteTarget = null)}
>
	<p class="adm-confirm-text">
		Grant admin privileges to <strong>{promoteTarget?.email}</strong>?
	</p>
	<p class="adm-confirm-text adm-confirm-warning">
		Admins can manage all users, view audit logs, and control maintenance mode. This should only be
		granted to trusted team members.
	</p>
</ConfirmDialog>

<ConfirmDialog
	bind:this={suspendConfirm}
	title={suspendTarget?.isActive === false ? 'Unsuspend User' : 'Suspend User'}
	confirmLabel={suspendTarget?.isActive === false ? 'Unsuspend' : 'Suspend'}
	confirmClass={suspendTarget?.isActive === false ? 'btn-success' : 'btn-warn'}
	accentColor={suspendTarget?.isActive === false ? 'var(--color-success)' : 'var(--color-warning)'}
	onconfirm={confirmSuspend}
	oncancel={() => (suspendTarget = null)}
>
	{#if suspendTarget?.isActive === false}
		<p class="adm-confirm-text">
			Re-enable access for <strong>{suspendTarget.email}</strong>?
		</p>
	{:else}
		<p class="adm-confirm-text">
			Suspend <strong>{suspendTarget?.email}</strong>?
		</p>
		<p class="adm-confirm-text adm-confirm-warning">
			Their active sessions will be revoked immediately and they will be unable to log in until
			unsuspended.
		</p>
	{/if}
</ConfirmDialog>

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

	/* An email stays on one line (a break at its hyphens reads badly); the
	   display name is the column that gives way when the table is short of
	   room, wrapping at its spaces and, for one long word, inside it. */
	.td-email {
		white-space: nowrap;
	}
	.td-name {
		overflow-wrap: anywhere;
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
		flex-shrink: 0;
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--color-danger);
	}

	.active-yes {
		background: var(--color-success);
	}

	/* ── Cards (phones) ── */
	.uc-sort {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		margin-bottom: 0.6rem;
	}
	.uc-sort :global(.bui-select-trigger) {
		flex: 1;
		max-width: 320px;
	}

	.user-cards {
		list-style: none;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
		gap: 0.6rem;
	}

	.user-card {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		padding: 0.7rem 0.8rem;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--bg-card);
		font-family: var(--font-ui);
	}

	.uc-head {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.uc-email {
		flex: 1;
		min-width: 0;
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--text);
		overflow-wrap: anywhere;
	}
	.uc-name {
		font-size: 0.8rem;
		color: var(--text-muted);
		overflow-wrap: anywhere;
	}
	.uc-meta {
		font-size: 0.72rem;
		color: var(--text-dimmer);
	}
	/* At the foot of the card, so the buttons line up across a row of cards. */
	.uc-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.3rem;
		margin-top: auto;
		padding-top: 0.3rem;
	}

	/* The table needs about 1100px for its ten columns, so narrower screens
	   (phones and tablets, past mobile.md's 768px) get the cards. */
	@media (max-width: 1099px) {
		.admin-table-wrap {
			display: none;
		}
	}
	@media (min-width: 1100px) {
		.uc-sort,
		.user-cards {
			display: none;
		}
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

	/* ── Confirmation bodies ── */
	.adm-confirm-text {
		font-family: var(--font-ui);
		font-size: 0.85rem;
		line-height: 1.5;
		color: var(--text-muted);
	}
	/* The caution box in the promote and suspend confirmations. */
	.adm-confirm-warning {
		font-size: 0.8rem;
		color: var(--color-danger);
		background: color-mix(in srgb, var(--color-danger) 10%, transparent);
		border: 1px solid color-mix(in srgb, var(--color-danger) 30%, transparent);
		border-radius: 4px;
		padding: 8px 12px;
	}
</style>
