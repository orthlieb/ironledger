<script lang="ts">
	/**
	 * /admin's Invites tab: the send-an-invitation form (with the new link to
	 * copy once it's sent) and the list of invitations, which loads each time
	 * the tab opens and again after each create or revoke. The list is a table,
	 * or on a phone (768px and under) one card per invitation. Its errors stay
	 * in the tab, under the form.
	 *
	 * Like every admin tab it stays mounted while another tab is open and
	 * renders only while `active`, so a half-typed invite and the last link
	 * are still there when you come back.
	 */
	import { admin } from '#lib/api.js';
	import type { AdminInvite } from '@ironledger/shared';
	import ErrorBar from '#lib/components/ErrorBar.svelte';

	let {
		active,
	}: {
		/** The Invites tab is open. */
		active: boolean;
	} = $props();

	let invites: AdminInvite[] = $state([]);
	let inviteEmail = $state('');
	let inviteDisplayName = $state('');
	let inviteBusy = $state(false);
	let inviteError = $state('');
	let inviteCreatedUrl = $state(''); // shown after successful create for copy
	let inviteCreatedFor = $state(''); // email the URL belongs to
	let inviteCopyFlash = $state(false);

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
		inviteBusy = true;
		try {
			const body: { email: string; displayName?: string } = { email: inviteEmail.trim() };
			const dn = inviteDisplayName.trim();
			if (dn) body.displayName = dn;
			const res = await admin.createInvite(body);
			inviteCreatedUrl = res.url;
			inviteCreatedFor = res.invite.email;
			inviteEmail = '';
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
		} catch {
			/* clipboard may be unavailable — user can select manually */
		}
	}

	$effect(() => {
		if (active) void loadInvites();
	});

	const shortDate = (iso: string) => new Date(iso).toLocaleDateString();
</script>

<!-- Revoke, for a pending invitation: in the table's last column and on its card. -->
{#snippet revokeButton(inv: AdminInvite)}
	{#if inv.status === 'pending'}
		<button type="button" class="btn btn-sm" onclick={() => handleRevokeInvite(inv.id)}
			>Revoke</button
		>
	{/if}
{/snippet}

{#if active}
	<div class="invites-panel">
		<section class="invites-section">
			<h3 class="invites-h">Send an invitation</h3>
			<p class="invites-hint">
				Admin-issued invites bypass the registration lock. The recipient receives a 72-hour
				single-use link to set their password. Accounts are created with role
				<code>user</code> — promote separately after they sign in.
			</p>

			<form class="invites-form" onsubmit={handleCreateInvite}>
				<label class="invites-field">
					<span>Email</span>
					<input
						type="email"
						bind:value={inviteEmail}
						required
						maxlength="254"
						autocomplete="email"
						placeholder="Where the invite is sent"
					/>
				</label>
				<label class="invites-field">
					<span
						>Display name <span class="invites-field-opt">— optional, defaults to email</span></span
					>
					<input
						type="text"
						bind:value={inviteDisplayName}
						maxlength="80"
						autocomplete="nickname"
						placeholder="The name shown for them"
					/>
				</label>
				<div class="invites-actions">
					<button
						type="submit"
						class="btn btn-primary"
						disabled={inviteBusy || !inviteEmail.trim()}
					>
						{inviteBusy ? 'Sending…' : 'Send invite'}
					</button>
				</div>
				<ErrorBar message={inviteError} compact />
			</form>

			{#if inviteCreatedUrl}
				<div class="invites-created">
					<p class="invites-created-msg">
						<strong>Invite dispatched to {inviteCreatedFor}.</strong>
						Email is on its way. You can also copy the link below in case delivery fails.
					</p>
					<div class="invites-url-row">
						<input
							type="text"
							class="invites-url"
							readonly
							value={inviteCreatedUrl}
							onclick={(e) => (e.currentTarget as HTMLInputElement).select()}
						/>
						<button type="button" class="btn" onclick={copyInviteUrl}>
							{inviteCopyFlash ? 'Copied!' : 'Copy'}
						</button>
					</div>
				</div>
			{/if}
		</section>

		<section class="invites-section">
			<h3 class="invites-h">Invitations</h3>
			{#if invites.length === 0}
				<p class="invites-empty">No invitations yet.</p>
			{:else}
				<table class="invites-table">
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
								<td class="td-date">{shortDate(inv.expiresAt)}</td>
								<td class="td-date">{shortDate(inv.createdAt)}</td>
								<td>{@render revokeButton(inv)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
				<ul class="invite-cards">
					{#each invites as inv (inv.id)}
						<li class="invite-card">
							<div class="ic-head">
								<span class="ic-email">{inv.email}</span>
								<span class="invite-status invite-status--{inv.status}">{inv.status}</span>
							</div>
							{#if inv.displayName}
								<div class="ic-name">{inv.displayName}</div>
							{/if}
							<div class="ic-meta">
								Expires {shortDate(inv.expiresAt)} · Created {shortDate(inv.createdAt)}
							</div>
							{#if inv.status === 'pending'}
								<div class="ic-actions">{@render revokeButton(inv)}</div>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	</div>
{/if}

<style>
	/* ──────────────────────────────────────────────────────────────────────
	   Invites tab — plain two-section layout (form on top, roster below).
	   Public /invite/[token] page is the sign-in-styled view; this admin
	   tab is intentionally unstyled-looking.
	   ────────────────────────────────────────────────────────────────────── */
	.invites-panel {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		max-width: 820px;
	}
	.invites-section {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}
	.invites-h {
		font-family: var(--font-display);
		font-size: calc(0.95rem * var(--font-display-scale));
		font-weight: var(--font-display-weight);
		font-variant: var(--font-display-variant);
		letter-spacing: 0.05em;
		color: var(--text-accent);
		margin: 0 0 0.2rem;
	}
	.invites-hint {
		margin: 0 0 0.4rem;
		font-size: 0.82rem;
		line-height: 1.55;
		color: var(--text-muted);
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

	.invites-form {
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
	}
	.invites-field {
		display: flex;
		flex-direction: column;
		gap: 4px;
		max-width: 380px;
	}
	.invites-field > span {
		font-family: var(--font-ui);
		font-size: 0.72rem;
		font-weight: 600;
		letter-spacing: 0.03em;
		color: var(--text-muted);
	}
	.invites-field-opt {
		color: var(--text-dimmer);
		font-weight: normal;
	}
	.invites-field input {
		padding: 7px 10px;
		border: 1px solid var(--border-mid);
		border-radius: 4px;
		background: var(--bg-control);
		color: var(--text);
		font-family: var(--font-ui);
		font-size: 0.85rem;
	}
	.invites-field input:focus {
		outline: none;
		border-color: var(--text-accent);
	}
	.invites-actions {
		margin-top: 0.25rem;
	}
	.invites-created {
		margin-top: 0.6rem;
		padding: 10px 12px;
		border: 1px solid var(--border);
		border-radius: 4px;
		background: var(--bg-inset);
		max-width: 600px;
	}
	.invites-created-msg {
		margin: 0 0 0.5rem;
		font-size: 0.82rem;
		line-height: 1.55;
		color: var(--text-muted);
	}
	.invites-url-row {
		display: flex;
		gap: 0.5rem;
		align-items: stretch;
	}
	.invites-url {
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
	.invites-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.82rem;
	}
	.invites-table th,
	.invites-table td {
		padding: 7px 9px;
		text-align: left;
		border-bottom: 1px solid var(--border);
	}
	.invites-table th {
		font-family: var(--font-ui);
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--text-dimmer);
	}
	.invites-table .td-date {
		white-space: nowrap;
		color: var(--text-muted);
	}
	/* Also on the Tools tab's broadcast severity (AdminTools.svelte keeps a
	   copy of the base + accepted / revoked rules). */
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
	.invite-status--pending {
		background: rgba(34, 211, 238, 0.12);
		color: var(--color-momentum);
	}
	.invite-status--accepted {
		background: rgba(74, 222, 128, 0.12);
		color: var(--color-health);
	}
	.invite-status--revoked {
		background: rgba(221, 81, 76, 0.12);
		color: var(--color-danger);
	}
	.invite-status--expired {
		background: rgba(255, 255, 255, 0.06);
		color: var(--text-dimmer);
	}
	.btn-sm {
		padding: 3px 10px;
		font-size: 0.72rem;
	}

	/* ── Cards (phones) ── */
	.invite-cards {
		list-style: none;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}
	.invite-card {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		padding: 0.7rem 0.8rem;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--bg-card);
		font-family: var(--font-ui);
	}
	.ic-head {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.ic-email {
		flex: 1;
		min-width: 0;
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--text);
		overflow-wrap: anywhere;
	}
	.ic-name {
		font-size: 0.8rem;
		color: var(--text-muted);
		overflow-wrap: anywhere;
	}
	.ic-meta {
		font-size: 0.72rem;
		color: var(--text-dimmer);
	}
	.ic-actions {
		margin-top: 0.3rem;
	}

	/* The table, or on a phone (mobile.md's 768px) the cards. */
	@media (max-width: 768px) {
		.invites-table {
			display: none;
		}
	}
	@media (min-width: 769px) {
		.invite-cards {
			display: none;
		}
	}
</style>
