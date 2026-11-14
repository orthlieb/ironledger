<script lang="ts">
	/**
	 * BetaBadge — the small "Beta" mark after the Iron Ledger name: in the
	 * app's header, and on the login, register and About pages. Its tooltip
	 * says what beta means; inside the app it also says where to report a bug
	 * (the hamburger menu, which the signed-out pages don't have).
	 */
	import { tooltip } from '#lib/actions/tooltip.js';

	let {
		inApp = false,
		size = 'sm',
	}: {
		/** In the signed-in app, where ☰ → Report a bug… exists. */
		inApp?: boolean;
		/** sm beside the header name, lg beside a page's big title. */
		size?: 'sm' | 'lg';
	} = $props();

	const tip = $derived(
		'Iron Ledger is in beta: things may change, and some may break.' +
			(inApp ? ' Tell us with ☰ → Report a bug…' : ''),
	);
</script>

<span class="beta-badge beta-badge--{size}" use:tooltip={tip}>Beta</span>

<style>
	.beta-badge {
		display: inline-block;
		vertical-align: middle;
		margin-left: 0.5em;
		padding: 0.15em 0.5em;
		border: 1px solid var(--text-accent);
		border-radius: 999px;
		color: var(--text-accent);
		font-family: var(--font-ui);
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		line-height: 1.2;
		white-space: nowrap;
	}
	.beta-badge--sm {
		font-size: 0.55rem;
	}
	.beta-badge--lg {
		font-size: 0.7rem;
	}
</style>
