<script lang="ts">
	import type { BroadcastStatus } from '@ironledger/shared';

	let { status }: { status: BroadcastStatus | null } = $props();

	// Per-user dismissal keyed on postedAt — a new postedAt means the admin
	// edited the message, which re-shows the banner for everyone. We store
	// "1" to mean dismissed; missing/other means "show".
	function dismissedKey(postedAt: string): string {
		return `il:broadcast:dismissed:${postedAt}`;
	}

	// $derived so dismissal recomputes when the status changes (new postedAt
	// means new key, which is absent from localStorage).
	let dismissed = $state(false);

	$effect(() => {
		if (!status?.active || !status.postedAt) {
			dismissed = false;
			return;
		}
		try {
			dismissed = localStorage.getItem(dismissedKey(status.postedAt)) === '1';
		} catch {
			dismissed = false;
		}
	});

	function dismiss() {
		if (!status?.postedAt) return;
		try {
			localStorage.setItem(dismissedKey(status.postedAt), '1');
		} catch { /* quota exceeded / private mode — tolerate */ }
		dismissed = true;
	}

	let visible = $derived(!!(status?.active && status.message && !dismissed));
</script>

{#if visible && status}
	<div
		class="bc-banner"
		class:bc-banner--warning={status.severity === 'warning'}
		role="status"
		aria-live="polite"
	>
		<span class="bc-icon" aria-hidden="true">
			{status.severity === 'warning' ? '\u26A0' : '\u24D8'}
		</span>
		<span class="bc-text">{status.message}</span>
		<button
			type="button"
			class="bc-dismiss"
			onclick={dismiss}
			aria-label="Dismiss announcement"
		>&times;</button>
	</div>
{/if}

<style>
	.bc-banner {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		padding: 8px 44px 8px 16px;
		background: color-mix(in srgb, var(--color-momentum) 18%, var(--bg-inset));
		border-bottom: 1px solid color-mix(in srgb, var(--color-momentum) 40%, transparent);
		color: var(--text);
		font-family: var(--font-ui);
		font-size: 0.82rem;
		line-height: 1.4;
		position: relative;
	}
	.bc-banner--warning {
		background: color-mix(in srgb, var(--color-wits) 22%, var(--bg-inset));
		border-bottom-color: color-mix(in srgb, var(--color-wits) 55%, transparent);
	}
	.bc-icon {
		flex-shrink: 0;
		font-size: 1rem;
		color: var(--color-momentum);
	}
	.bc-banner--warning .bc-icon {
		color: var(--color-wits);
	}
	.bc-text {
		flex: 1;
		word-break: break-word;
	}
	.bc-dismiss {
		position: absolute;
		right: 12px;
		top: 50%;
		transform: translateY(-50%);
		background: transparent;
		border: none;
		color: var(--text-muted);
		font-size: 1.2rem;
		line-height: 1;
		cursor: pointer;
		padding: 4px 8px;
		border-radius: 4px;
	}
	.bc-dismiss:hover {
		color: var(--text);
		background: color-mix(in srgb, currentColor 10%, transparent);
	}
</style>
