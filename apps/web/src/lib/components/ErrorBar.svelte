<script lang="ts">
	/**
	 * ErrorBar — dismissible alert bar for surface-level errors.
	 * Mirrors Bootstrap's .alert-danger pattern: full-width red bar
	 * with an icon, message, and ✕ dismiss button.
	 *
	 * Usage:
	 *   <ErrorBar message={charError} onDismiss={() => charError = ''} />
	 *   Renders nothing when message is empty.
	 */

	let {
		message   = '',
		onDismiss,
	}: {
		message?:   string;
		onDismiss?: () => void;
	} = $props();
</script>

{#if message}
	<div class="error-bar" role="alert" aria-live="assertive">
		<span class="error-bar-icon" aria-hidden="true">
			<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
				<!-- Font Awesome circle-exclamation -->
				<path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zm0-384c13.3 0 24 10.7 24 24l0 112c0 13.3-10.7 24-24 24s-24-10.7-24-24l0-112c0-13.3 10.7-24 24-24zm-32 224a32 32 0 1 1 64 0 32 32 0 1 1 -64 0z"/>
			</svg>
		</span>
		<span class="error-bar-msg">{message}</span>
		{#if onDismiss}
			<button class="error-bar-dismiss" onclick={onDismiss} aria-label="Dismiss error" title="Dismiss">✕</button>
		{/if}
	</div>
{/if}

<style>
	.error-bar {
		display:         flex;
		align-items:     center;
		gap:             0.5rem;
		width:           100%;
		padding:         0.55rem 0.75rem;
		margin-bottom:   0.75rem;
		background:      color-mix(in srgb, var(--color-danger) 12%, var(--bg-card));
		border:          1px solid color-mix(in srgb, var(--color-danger) 40%, transparent);
		border-radius:   6px;
		color:           var(--color-danger);
		font-family:     var(--font-ui);
		font-size:       0.82rem;
		line-height:     1.4;
		box-sizing:      border-box;
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
