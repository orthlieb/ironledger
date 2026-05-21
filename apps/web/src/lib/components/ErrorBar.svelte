<script lang="ts">
	/**
	 * ErrorBar — dismissible alert bar for surface-level messages.
	 *
	 * Despite the historical name, this component handles three severities:
	 *   • notification — informational (blue, ⓘ)
	 *   • warning      — cautionary    (amber, ⚠)
	 *   • error        — failure       (red,   ⊘)  ← default
	 *
	 * Two density variants:
	 *   • default — full bar with icon, padded background, border
	 *   • compact — inline text-only (no background/border), for form-field errors
	 *
	 * Usage:
	 *   <ErrorBar message={charError} onDismiss={() => charError = ''} />
	 *   <ErrorBar message={info}      severity="notification" />
	 *   <ErrorBar message={warn}      severity="warning" compact />
	 *
	 * Renders nothing when message is empty.
	 *
	 * Reusable CSS hooks (also used by import-export e2e tests):
	 *   .error-bar, .error-bar--<severity>, .error-bar--compact,
	 *   .error-bar-msg, .error-bar-dismiss
	 */

	type Severity = 'notification' | 'warning' | 'error';

	let {
		message   = '',
		severity  = 'error' as Severity,
		compact   = false,
		onDismiss,
	}: {
		message?:   string;
		severity?:  Severity;
		compact?:   boolean;
		onDismiss?: () => void;
	} = $props();

	// Errors are urgent enough to interrupt screen readers; the other two are
	// informational and stay polite.
	const ariaLive = $derived(severity === 'error' ? 'assertive' : 'polite');
</script>

{#if message}
	<div
		class="error-bar error-bar--{severity}"
		class:error-bar--compact={compact}
		role="alert"
		aria-live={ariaLive}
	>
		{#if !compact}
			<span class="error-bar-icon" aria-hidden="true">
				{#if severity === 'notification'}
					<!-- Font Awesome circle-info -->
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
						<path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM216 336l24 0 0-64-24 0c-13.3 0-24-10.7-24-24s10.7-24 24-24l48 0c13.3 0 24 10.7 24 24l0 88 8 0c13.3 0 24 10.7 24 24s-10.7 24-24 24l-80 0c-13.3 0-24-10.7-24-24s10.7-24 24-24zm40-208a32 32 0 1 1 0 64 32 32 0 1 1 0-64z"/>
					</svg>
				{:else if severity === 'warning'}
					<!-- Font Awesome triangle-exclamation -->
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
						<path d="M256 32c14.2 0 27.3 7.5 34.5 19.8l216 368c7.3 12.4 7.3 27.7 .2 40.1S486.3 480 472 480L40 480c-14.3 0-27.6-7.7-34.7-20.1s-7-27.8 .2-40.1l216-368C228.7 39.5 241.8 32 256 32zm0 128c-13.3 0-24 10.7-24 24l0 112c0 13.3 10.7 24 24 24s24-10.7 24-24l0-112c0-13.3-10.7-24-24-24zm32 224a32 32 0 1 0 -64 0 32 32 0 1 0 64 0z"/>
					</svg>
				{:else}
					<!-- Font Awesome circle-exclamation -->
					<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
						<path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zm0-384c13.3 0 24 10.7 24 24l0 112c0 13.3-10.7 24-24 24s-24-10.7-24-24l0-112c0-13.3 10.7-24 24-24zm-32 224a32 32 0 1 1 64 0 32 32 0 1 1 -64 0z"/>
					</svg>
				{/if}
			</span>
		{/if}
		<span class="error-bar-msg">{message}</span>
		{#if onDismiss}
			<button class="error-bar-dismiss" onclick={onDismiss} aria-label="Dismiss" title="Dismiss">✕</button>
		{/if}
	</div>
{/if}

<style>
	/* Base — error/red palette (default). Severity modifiers override the
	   three CSS variables below; everything else is shared. */
	.error-bar {
		--eb-color:  var(--color-danger);
		--eb-bg:     color-mix(in srgb, var(--eb-color) 12%, var(--bg-card));
		--eb-border: color-mix(in srgb, var(--eb-color) 40%, transparent);

		display:         flex;
		align-items:     center;
		gap:             0.5rem;
		width:           100%;
		padding:         0.55rem 0.75rem;
		background:      var(--eb-bg);
		border:          1px solid var(--eb-border);
		border-radius:   6px;
		color:           var(--eb-color);
		font-family:     var(--font-ui);
		font-size:       0.82rem;
		line-height:     1.4;
		box-sizing:      border-box;
	}

	.error-bar--notification { --eb-color: var(--color-momentum); }
	.error-bar--warning      { --eb-color: var(--color-wits);     }
	/* error is the default — no override needed */

	/* Compact: inline form-field error — no background/border/padding, just
	   coloured text. Keeps .error-bar-msg as the test/CSS hook. */
	.error-bar--compact {
		display:        block;
		width:          auto;
		padding:        0;
		background:     transparent;
		border:         none;
		border-radius:  0;
		margin-top:     0.25rem;
		gap:            0;
	}

	.error-bar-icon {
		flex-shrink: 0;
		width:       1rem;
		height:      1rem;
		display:     flex;
		align-items: center;
	}

	.error-bar-icon svg {
		width:  100%;
		height: 100%;
		fill:   currentColor;
	}

	.error-bar-msg {
		flex: 1;
	}

	.error-bar-dismiss {
		flex-shrink:  0;
		background:   none;
		border:       none;
		cursor:       pointer;
		color:        inherit;
		font-size:    0.9rem;
		line-height:  1;
		padding:      0 0.1rem;
		opacity:      0.7;
		transition:   opacity 0.15s;
	}
	.error-bar-dismiss:hover { opacity: 1; }
</style>
