<script lang="ts">
	/**
	 * The question a /discard link asks before it gives up an asset: the
	 * card's own Delete Asset confirmation (CharactersArea), naming the
	 * character the link's entry was made for. Mounted once, in
	 * +layout.svelte. The runner asks through `ironledger:confirm-discard`
	 * (runLink in #lib/commands/run.svelte.ts); the asset goes, and the link
	 * is spent, only on DELETE. Cancel, ✕ and Escape leave both as they were.
	 */
	import ConfirmDialog from './ConfirmDialog.svelte';
	import type { DiscardRequest } from '#lib/commands/run.svelte.js';

	let ref = $state<ReturnType<typeof ConfirmDialog> | null>(null);
	let asking = $state<DiscardRequest | null>(null);

	function answer(yes: boolean) {
		const req = asking;
		asking = null;
		req?.answer(yes);
	}

	$effect(() => {
		const onAsk = (e: Event) => {
			// Handled: the runner reads a cancelled event as someone to ask.
			e.preventDefault();
			// A question still open (a second link clicked) goes unanswered: no.
			if (asking) answer(false);
			asking = (e as CustomEvent<DiscardRequest>).detail;
			ref?.open();
		};
		document.addEventListener('ironledger:confirm-discard', onAsk);
		return () => document.removeEventListener('ironledger:confirm-discard', onAsk);
	});
</script>

<ConfirmDialog
	bind:this={ref}
	title="Delete Asset"
	confirmLabel="DELETE"
	onconfirm={() => answer(true)}
	oncancel={() => answer(false)}
>
	<p>
		Delete <strong>{asking?.asset ?? 'this asset'}</strong> from
		<strong>{asking?.character ?? 'this character'}</strong>?
	</p>
</ConfirmDialog>
