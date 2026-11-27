<script lang="ts">
	/**
	 * The shell every /admin confirmation shares: a dimmed full-screen
	 * backdrop holding a small card, with the body on top and a right-aligned
	 * row of buttons below. A click on the backdrop or Escape calls `onclose`;
	 * clicks inside the card stay inside it. The caller supplies the body (an
	 * h3 title and p paragraphs, which this file styles) and the `actions`
	 * buttons.
	 *
	 * Still hand-rolled rather than a bits-ui AlertDialog / ConfirmDialog:
	 * moving to one would change how these look and behave (focus, overlay),
	 * so that is its own change.
	 */
	import type { Snippet } from 'svelte';

	let {
		onclose,
		children,
		actions,
	}: {
		/** Backdrop click or Escape. Guard it yourself while a request is in flight. */
		onclose: () => void;
		children: Snippet;
		/** The buttons: Cancel, then the action. */
		actions: Snippet;
	} = $props();
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="modal-backdrop"
	onclick={() => onclose()}
	onkeydown={(e) => e.key === 'Escape' && onclose()}
>
	<div
		class="modal card"
		onclick={(e) => e.stopPropagation()}
		onkeydown={(e) => e.stopPropagation()}
		role="dialog"
		aria-modal="true"
		tabindex="-1"
	>
		{@render children()}
		<div class="modal-actions">
			{@render actions()}
		</div>
	</div>
</div>

<style>
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

	/* The body comes from the caller, so these reach into it with :global.
	   `.modal :global(p)` compiles to `.modal.svelte-x p`, specificity
	   (0,2,1): the same as when the modals were scoped to the page, so it
	   still outranks a caller's single-class rule such as AdminUsers'
	   `.modal-warning` (0,2,0) on font-size, colour and margin. Don't add
	   class selectors here (`.modal :global(.foo)` is 0,3,0 and would flip
	   that). */
	.modal :global(h3) {
		font-family: var(--font-display);
		font-size: calc(1rem * var(--font-display-scale));
		font-variant: var(--font-display-variant);
		color: var(--color-danger);
		margin-bottom: 0.5rem;
	}

	.modal :global(p) {
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
</style>
