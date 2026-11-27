<script module lang="ts">
	import type { RegistrationLockStatus } from '@ironledger/shared';

	/** The current registration lock, or null when it can't be read. */
	export async function fetchRegLockStatus(): Promise<RegistrationLockStatus | null> {
		try {
			const res = await fetch('/api/admin/registration-lock');
			if (res.ok) return (await res.json()) as RegistrationLockStatus;
		} catch {
			/* ignore */
		}
		return null;
	}
</script>

<script lang="ts">
	/**
	 * /admin's Tools tab: four tiles — Maintenance Mode, Registration Lock,
	 * Daily Quota and Broadcast Banner — and the confirmations for turning
	 * maintenance on and locking registration.
	 *
	 * Opening the tab re-reads all four statuses. The page fetches the
	 * maintenance and lock statuses with its first load and binds them here,
	 * so those two tiles show the real state as soon as the tab first opens.
	 * Failures of the maintenance and lock actions go to `onerror` for the
	 * page's ErrorBar; quota and broadcast errors show in their own tiles.
	 *
	 * Like every admin tab it stays mounted while another tab is open and
	 * renders only while `active`, so unsaved messages and settings survive
	 * a trip to another tab.
	 */
	import {
		admin,
		maintenance as maintApi,
		broadcast as broadcastApi,
		registrationQuota as quotaApi,
		type RegistrationQuotaStatus,
	} from '#lib/api.js';
	import type { MaintenanceStatus, BroadcastStatus, BroadcastSeverity } from '@ironledger/shared';
	import { untrack } from 'svelte';
	import ErrorBar from '#lib/components/ErrorBar.svelte';
	import { RadioGroup } from 'bits-ui';
	import ConfirmDialog from '#lib/components/ConfirmDialog.svelte';

	let {
		active,
		maintStatus = $bindable(),
		regLockStatus = $bindable(),
		onerror,
	}: {
		/** The Tools tab is open. */
		active: boolean;
		maintStatus: MaintenanceStatus | null;
		regLockStatus: RegistrationLockStatus | null;
		onerror: (message: string) => void;
	} = $props();

	// ── Maintenance mode ──────────────────────────────────────────────────
	let maintMessage = $state('Scheduled maintenance');
	let maintMinutes = $state(5);
	let maintLoading = $state(false);
	let maintConfirm = $state<ReturnType<typeof ConfirmDialog> | null>(null);
	let maintCountdown = $state('');
	let maintCountdownInterval: ReturnType<typeof setInterval> | undefined;

	async function refreshMaintStatus() {
		try {
			maintStatus = await maintApi.getStatus();
		} catch {
			/* ignore */
		}
	}

	function updateMaintCountdown() {
		if (!maintStatus?.enabled || !maintStatus.shutdownAt) {
			maintCountdown = '';
			return;
		}
		const diff = new Date(maintStatus.shutdownAt).getTime() - Date.now();
		if (diff <= 0) {
			maintCountdown = 'NOW';
			return;
		}
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
			await refreshMaintStatus();
		} catch (err) {
			onerror(err instanceof Error ? err.message : 'Failed to enable maintenance');
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
			onerror(err instanceof Error ? err.message : 'Failed to disable maintenance');
		} finally {
			maintLoading = false;
		}
	}

	// ── Registration daily quota ─────────────────────────────────────────
	let quotaStatus: RegistrationQuotaStatus | null = $state(null);
	let quotaMode: 'unlimited' | 'capped' = $state('unlimited');
	let quotaDailyInput = $state(20);
	let quotaBusy = $state(false);
	let quotaError = $state('');

	async function refreshQuotaStatus() {
		try {
			quotaStatus = await quotaApi.getStatus();
			if (quotaStatus.daily !== null) {
				quotaMode = 'capped';
				quotaDailyInput = quotaStatus.daily;
			} else {
				quotaMode = 'unlimited';
			}
		} catch {
			/* ignore */
		}
	}

	async function saveQuota() {
		quotaError = '';
		quotaBusy = true;
		try {
			const daily = quotaMode === 'unlimited' ? null : quotaDailyInput;
			quotaStatus = await quotaApi.setQuota(daily);
		} catch (err) {
			quotaError = err instanceof Error ? err.message : 'Failed to save quota';
		} finally {
			quotaBusy = false;
		}
	}

	// ── Broadcast banner ──────────────────────────────────────────────────
	let broadcastStatus: BroadcastStatus | null = $state(null);
	let broadcastMessage = $state('');
	let broadcastSeverity: BroadcastSeverity = $state('info');
	let broadcastBusy = $state(false);
	let broadcastError = $state('');

	async function refreshBroadcastStatus() {
		try {
			broadcastStatus = await broadcastApi.getStatus();
			if (broadcastStatus?.active) {
				broadcastMessage = broadcastStatus.message ?? '';
				broadcastSeverity = broadcastStatus.severity;
			}
		} catch {
			/* ignore */
		}
	}

	async function postBroadcast() {
		broadcastError = '';
		broadcastBusy = true;
		try {
			broadcastStatus = await broadcastApi.post({
				message: broadcastMessage.trim(),
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
		broadcastBusy = true;
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

	// ── Registration lock ─────────────────────────────────────────────────
	let regLockMessage = $state('New registrations are currently closed.');
	let regLockLoading = $state(false);
	let regLockConfirm = $state<ReturnType<typeof ConfirmDialog> | null>(null);

	async function refreshRegLockStatus() {
		const status = await fetchRegLockStatus();
		if (status) regLockStatus = status;
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
			await refreshRegLockStatus();
		} catch (err) {
			onerror(err instanceof Error ? err.message : 'Failed to lock registration');
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
			onerror(err instanceof Error ? err.message : 'Failed to unlock registration');
		} finally {
			regLockLoading = false;
		}
	}

	// Opening the tab re-reads every tile's status. Only `active` should
	// re-run this (it used to be the tab switch's event handler), hence untrack.
	$effect(() => {
		if (!active) return;
		untrack(() => {
			void refreshMaintStatus();
			void refreshRegLockStatus();
			void refreshBroadcastStatus();
			void refreshQuotaStatus();
		});
	});
</script>

{#if active}
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
							placeholder="What the maintenance page says"
							bind:value={maintMessage}
							maxlength="500"
						/>
					</label>
					<label class="tools-tile-field tools-tile-field--narrow">
						<span>Minutes until shutdown</span>
						<input type="number" min="0" max="1440" bind:value={maintMinutes} />
					</label>
				</div>
				<div class="tools-tile-actions">
					<button
						class="btn btn-danger"
						disabled={maintLoading || !maintMessage.trim()}
						onclick={() => maintConfirm?.open()}
						>{maintLoading ? 'Enabling…' : 'Enable Maintenance Mode'}</button
					>
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
							placeholder="Why registration is closed, or until when"
							bind:value={regLockMessage}
							maxlength="500"
						/>
					</label>
				</div>
				<div class="tools-tile-actions">
					<button
						class="btn btn-danger"
						disabled={regLockLoading || !regLockMessage.trim()}
						onclick={() => regLockConfirm?.open()}
						>{regLockLoading ? 'Locking…' : 'Lock Registration'}</button
					>
				</div>
			{/if}
		</section>

		<!-- ─── Tile 3: Daily Registration Quota ─── -->
		<section class="tools-tile">
			<header class="tools-tile-head">
				<h3 class="tools-tile-title">Daily Quota</h3>
				<span class="tools-tile-dot" class:tools-tile-dot--active={quotaStatus?.exhausted}></span>
				<span class="tools-tile-status">
					{#if quotaStatus?.daily === null}
						Unlimited
					{:else if quotaStatus?.exhausted}
						Full today
					{:else if quotaStatus?.daily}
						{quotaStatus.usedToday} / {quotaStatus.daily} today
					{:else}
						—
					{/if}
				</span>
				{#if quotaStatus?.daily !== null && quotaStatus?.resetsAt}
					<span class="tools-tile-timer"
						>Resets {new Date(quotaStatus.resetsAt).toLocaleTimeString([], {
							hour: '2-digit',
							minute: '2-digit',
						})} UTC</span
					>
				{/if}
			</header>
			<p class="tools-tile-desc">
				Cap the number of new signups per UTC day. When the cap is hit, the
				<code>/register</code> page shows "Daily Signups Full" until UTC midnight. Set
				<strong>Unlimited</strong> to turn the cap off.
			</p>

			<div class="tools-tile-form">
				<RadioGroup.Root
					class="tools-tile-severity"
					value={quotaMode}
					onValueChange={(v) => (quotaMode = v as typeof quotaMode)}
					aria-label="Signup quota mode"
				>
					<span class="tools-tile-field-label">Mode</span>
					<label class="severity-opt">
						<RadioGroup.Item value="unlimited" class="severity-radio">
							<span class="severity-radio-dot"></span>
						</RadioGroup.Item>
						<span>Unlimited</span>
					</label>
					<label class="severity-opt">
						<RadioGroup.Item value="capped" class="severity-radio">
							<span class="severity-radio-dot"></span>
						</RadioGroup.Item>
						<span>Capped</span>
					</label>
				</RadioGroup.Root>
				{#if quotaMode === 'capped'}
					<label class="tools-tile-field tools-tile-field--narrow">
						<span>New signups per UTC day</span>
						<input type="number" min="1" max="10000" bind:value={quotaDailyInput} />
					</label>
				{/if}
			</div>
			<div class="tools-tile-actions">
				<button
					type="button"
					class="btn btn-primary"
					disabled={quotaBusy ||
						(quotaMode === 'capped' && (!quotaDailyInput || quotaDailyInput < 1))}
					onclick={saveQuota}
				>
					{quotaBusy ? 'Saving…' : 'Save'}
				</button>
			</div>
			<ErrorBar message={quotaError} compact />
		</section>

		<!-- ─── Tile 4: Broadcast Banner ─── -->
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
						<span
							class="invite-status invite-status--{broadcastStatus.severity === 'warning'
								? 'revoked'
								: 'accepted'}">{broadcastStatus.severity}</span
						>
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
						placeholder="What the banner says to everyone"
					/>
				</label>
				<RadioGroup.Root
					class="tools-tile-severity"
					value={broadcastSeverity}
					onValueChange={(v) => (broadcastSeverity = v as BroadcastSeverity)}
					aria-label="Broadcast severity"
				>
					<span class="tools-tile-field-label">Severity</span>
					<label class="severity-opt">
						<RadioGroup.Item value="info" class="severity-radio">
							<span class="severity-radio-dot"></span>
						</RadioGroup.Item>
						<span>Info</span>
					</label>
					<label class="severity-opt">
						<RadioGroup.Item value="warning" class="severity-radio">
							<span class="severity-radio-dot"></span>
						</RadioGroup.Item>
						<span>Warning</span>
					</label>
				</RadioGroup.Root>
			</div>
			<div class="tools-tile-actions">
				<button
					type="button"
					class="btn btn-primary"
					disabled={broadcastBusy || !broadcastMessage.trim()}
					onclick={postBroadcast}
				>
					{broadcastBusy ? 'Saving…' : broadcastStatus?.active ? 'Update banner' : 'Post banner'}
				</button>
				{#if broadcastStatus?.active}
					<button type="button" class="btn" disabled={broadcastBusy} onclick={clearBroadcast}
						>Clear</button
					>
				{/if}
			</div>
			<ErrorBar message={broadcastError} compact />
		</section>
	</div>
{/if}

<ConfirmDialog
	bind:this={regLockConfirm}
	title="Lock Registration"
	confirmLabel="Lock"
	onconfirm={confirmEnableRegLock}
>
	<p class="adm-confirm-text">
		New users will be unable to create accounts. Existing users are unaffected.
	</p>
	<p class="adm-confirm-text">Message: <strong>{regLockMessage}</strong></p>
</ConfirmDialog>

<ConfirmDialog
	bind:this={maintConfirm}
	title="Enable Maintenance Mode"
	confirmLabel="Enable"
	onconfirm={confirmEnableMaint}
>
	<p class="adm-confirm-text">
		This will alert all users and revoke all active sessions. Non-admin users will be unable to log
		in.
	</p>
	<p class="adm-confirm-text">
		Message: <strong>{maintMessage}</strong><br />
		Shutdown in: <strong>{maintMinutes} minute{maintMinutes === 1 ? '' : 's'}</strong>
	</p>
</ConfirmDialog>

<style>
	/* ──────────────────────────────────────────────────────────────────────
	   Tools tab — four tiles in one horizontal row on desktop
	   (Maintenance · Reg Lock · Daily Quota · Broadcast). Each tile is a
	   self-contained mini-form with its own header/status/body/actions.
	   Grid auto-fits so narrow viewports wrap gracefully (2×2 then 1×4)
	   instead of squishing the forms unusably.
	   ────────────────────────────────────────────────────────────────────── */
	.tools-panel {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
		gap: 1rem;
		align-items: stretch; /* equal-height tiles per row */
	}

	.tools-tile {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 1rem 1.1rem 1.05rem;
		border: 1px solid var(--border);
		border-radius: 6px;
		background: var(--bg-card);
		min-width: 0; /* let the grid column dictate width, not content */
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
		font-size: calc(0.95rem * var(--font-display-scale));
		font-weight: var(--font-display-weight);
		font-variant: var(--font-display-variant);
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

	.adm-confirm-text {
		font-family: var(--font-ui);
		font-size: 0.85rem;
		line-height: 1.5;
		color: var(--text-muted);
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
	.tools-tile-field--narrow {
		max-width: 220px;
	}
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

	.tools-tile-actions {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
		margin-top: auto; /* keep Save buttons aligned across tiles */
	}

	/* The broadcast's severity badge borrows the Invites tab's status pill
	   (AdminInvites.svelte); these are the two variants it uses. */
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
	.invite-status--accepted {
		background: rgba(74, 222, 128, 0.12);
		color: var(--color-health);
	}
	.invite-status--revoked {
		background: rgba(221, 81, 76, 0.12);
		color: var(--color-danger);
	}

	.severity-opt {
		display: flex;
		align-items: center;
		gap: 4px;
		font-size: 0.82rem;
		color: var(--text-muted);
		cursor: pointer;
	}
	:global(.severity-radio) {
		flex-shrink: 0;
		width: 14px;
		height: 14px;
		padding: 0;
		background: var(--bg-control);
		border: 1px solid var(--border-mid);
		border-radius: 999px;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}
	:global(.severity-radio:focus-visible) {
		outline: 2px solid var(--text-accent);
		outline-offset: 1px;
	}
	:global(.severity-radio[data-state='checked']) {
		border-color: var(--text-accent);
	}
	:global(.severity-radio-dot) {
		width: 7px;
		height: 7px;
		border-radius: 999px;
		background: var(--text-accent);
		opacity: 0;
	}
	:global(.severity-radio[data-state='checked'] .severity-radio-dot) {
		opacity: 1;
	}
</style>
