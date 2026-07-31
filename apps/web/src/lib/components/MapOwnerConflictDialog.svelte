<script lang="ts">
	/**
	 * MapOwnerConflictDialog — shown during an "Everything" import when one or
	 * more bundled maps re-link (by owner name) to an entity that ALREADY owns
	 * a map in the current session. One map per owner is allowed, so the user
	 * picks a single strategy for all such conflicts:
	 *
	 *   • 'replace' — overwrite each owner's existing map with the imported one
	 *                 (markers + background + settings replaced in place).
	 *   • 'skip'    — leave existing owned maps untouched; import the incoming
	 *                 copies as standalone (unlinked) maps instead. Safe default.
	 *
	 * Maps whose owner has no map yet re-link silently and never appear here.
	 * Promise-based, mirroring ImportCollisionDialog: `await ref.open(names)`.
	 */
	import { Dialog, RadioGroup } from 'bits-ui';
	import DialogHeader from '$lib/components/DialogHeader.svelte';
	import { headingText } from '$lib/fontStore.svelte.js';

	type Strategy = 'replace' | 'skip';

	let dialogOpen = $state(false);
	let names = $state<string[]>([]);
	let strategy = $state<Strategy>('skip');
	let resolver: ((s: Strategy) => void) | null = null;

	/** Show the dialog for the given conflicting owner names. Resolves with the
	 *  chosen strategy; a dismissal (Escape / outside click) resolves 'skip'. */
	export function open(conflictNames: string[]): Promise<Strategy> {
		names = conflictNames;
		strategy = 'skip';
		return new Promise((resolve) => {
			resolver = resolve;
			dialogOpen = true;
		});
	}

	function settle(s: Strategy) {
		dialogOpen = false;
		const r = resolver;
		resolver = null;
		r?.(s);
	}
</script>

<Dialog.Root
	bind:open={dialogOpen}
	onOpenChange={(next) => {
		// Escape / outside click → skip (never touch existing owned maps).
		if (!next && resolver) settle('skip');
	}}
>
	<Dialog.Portal>
		<Dialog.Overlay class="moc-overlay" />
		<Dialog.Content class="moc-dialog">
			<DialogHeader title={headingText('Owner already has a map')} onclose={() => settle('skip')} />

			<div class="moc-body">
				<p class="moc-lead">
					<strong>{names.length} imported map{names.length === 1 ? '' : 's'}</strong>
					belong{names.length === 1 ? 's' : ''} to
					{names.length === 1 ? 'an owner that' : 'owners that'}
					already {names.length === 1 ? 'has' : 'have'} a map:
				</p>

				<p class="moc-names">
					{#each names as n, i}
						<span class="moc-name">{n || '(unnamed)'}</span>{#if i < names.length - 1},{/if}
					{/each}
				</p>

				<p class="moc-prompt">What should I do?</p>

				<RadioGroup.Root
					class="moc-radio-group"
					value={strategy}
					onValueChange={(v) => (strategy = v as Strategy)}
					aria-label="Owned-map conflict strategy"
				>
					<label class="moc-radio">
						<RadioGroup.Item value="skip" class="moc-radio-btn">
							<span class="moc-radio-dot"></span>
						</RadioGroup.Item>
						<span class="moc-radio-body">
							<span class="moc-radio-title">Keep existing, import as standalone</span>
							<span class="moc-radio-help">
								Leave each owner's current map untouched; bring the incoming maps in as separate,
								unlinked maps. Safest choice.
							</span>
						</span>
					</label>

					<label class="moc-radio">
						<RadioGroup.Item value="replace" class="moc-radio-btn">
							<span class="moc-radio-dot"></span>
						</RadioGroup.Item>
						<span class="moc-radio-body">
							<span class="moc-radio-title">Replace the owner's map</span>
							<span class="moc-radio-help">
								Overwrite each owner's existing map — markers, background and settings — with the
								imported version.
							</span>
						</span>
					</label>
				</RadioGroup.Root>
			</div>

			<div class="moc-footer">
				<button type="button" class="btn" onclick={() => settle('skip')}>Skip</button>
				<button type="button" class="btn btn-primary" onclick={() => settle(strategy)}
					>Continue</button
				>
			</div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<style>
	:global(.moc-overlay) {
		position: fixed;
		inset: 0;
		background: #00000050;
		backdrop-filter: blur(1px);
		z-index: 80;
	}
	:global(.moc-dialog) {
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: min(440px, calc(100vw - 2rem));
		max-height: 84vh;
		overflow: hidden;
		background: var(--bg-card);
		color: var(--text);
		border-radius: 10px;
		box-shadow:
			0 12px 40px #00000060,
			0 0 0 1px var(--border-mid);
		overscroll-behavior: contain;
		outline: none;
		z-index: 81;
	}
	:global(.moc-body) {
		padding: 14px 18px 4px;
		overflow-y: auto;
		overscroll-behavior: contain;
		font-family: var(--font-ui);
		font-size: 0.8rem;
		line-height: 1.5;
		color: var(--text);
	}
	:global(.moc-lead) {
		margin: 0 0 8px;
	}
	:global(.moc-lead strong) {
		color: var(--text-accent);
		font-weight: 600;
	}
	:global(.moc-names) {
		margin: 0 0 12px;
		padding: 8px 12px;
		background: var(--bg-inset);
		border: 1px solid var(--border);
		border-radius: 5px;
		font-size: 0.78rem;
		word-break: break-word;
	}
	:global(.moc-name + .moc-name) {
		margin-left: 0.3em;
	}
	:global(.moc-prompt) {
		margin: 0 0 8px;
		font-weight: 500;
	}
	:global(.moc-radio-group) {
		border: none;
		padding: 0;
		margin: 0 0 12px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	:global(.moc-radio) {
		display: grid;
		grid-template-columns: 18px 1fr;
		gap: 10px;
		align-items: start;
		padding: 9px 11px;
		border: 1px solid var(--border);
		border-radius: 6px;
		cursor: pointer;
		transition:
			background 0.12s,
			border-color 0.12s;
	}
	:global(.moc-radio:hover) {
		background: var(--bg-hover);
		border-color: var(--border-mid);
	}
	:global(.moc-radio-btn) {
		margin: 2px 0 0;
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
	:global(.moc-radio-btn:focus-visible) {
		outline: 2px solid var(--text-accent);
		outline-offset: 1px;
	}
	:global(.moc-radio-btn[data-state='checked']) {
		border-color: var(--text-accent);
	}
	:global(.moc-radio-dot) {
		width: 7px;
		height: 7px;
		border-radius: 999px;
		background: var(--text-accent);
		opacity: 0;
		transition: opacity 0.12s;
	}
	:global(.moc-radio-btn[data-state='checked'] .moc-radio-dot) {
		opacity: 1;
	}
	:global(.moc-radio:has(.moc-radio-btn[data-state='checked'])) {
		border-color: var(--text-accent);
		background: color-mix(in srgb, var(--text-accent) 7%, transparent);
	}
	:global(.moc-radio-body) {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	:global(.moc-radio-title) {
		font-weight: 600;
		color: var(--text);
	}
	:global(.moc-radio-help) {
		font-size: 0.72rem;
		color: var(--text-muted);
	}
	:global(.moc-footer) {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		padding: 10px 18px 14px;
		border-top: 1px solid var(--border);
		background: var(--bg-card);
	}
</style>
