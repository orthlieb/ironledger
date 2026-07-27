<script lang="ts">
	/**
	 * ImportCollisionDialog — three-way prompt shown when an import file
	 * contains entities (characters / communities / NPCs / journeys / sites)
	 * whose NAMES already exist in the active session.
	 *
	 * Matching is by lower-cased trimmed name — IDs are deliberately ignored
	 * so cross-user transfers (export from user A, import to user B) still
	 * flag duplicates correctly. The user typically thinks "did I already
	 * have a Brennan?", not "is the UUID the same".
	 *
	 * The dialog returns one of four strategies:
	 *   • 'new'     — regenerate IDs on the incoming copies; both versions
	 *                 coexist. Safest default — never breaks the
	 *                 ghost-syncing-on-edit trap that duplicate IDs create.
	 *   • 'replace' — overwrite the matching existing entries with the
	 *                 imported data. Useful for "import the updated copy".
	 *   • 'skip'    — drop the colliding incoming items entirely; existing
	 *                 entries are preserved.
	 *   • 'cancel'  — abort the whole import (no entities applied).
	 *
	 * One strategy applies to every collision in the file (per-item picking
	 * would be a much bigger UI). Non-conflicting items in the same file
	 * import normally regardless of the choice.
	 *
	 * Usage:
	 *   let ref = $state<ReturnType<typeof ImportCollisionDialog> | null>(null);
	 *   <ImportCollisionDialog bind:this={ref} />
	 *   const choice = await ref?.open({
	 *     characters: ['Brennan'], communities: [], npcs: ['Old Marn'],
	 *     journeys: [], sites: ['The Black Reach'],
	 *   });
	 */
	import { Dialog, RadioGroup } from 'bits-ui';
	import DialogHeader from '$lib/components/DialogHeader.svelte';
	import { headingText } from '$lib/fontStore.svelte.js';
	import type { CollisionItems, CollisionStrategy } from './importCollision.js';

	let dialogOpen = $state(false);
	let items = $state<CollisionItems>({
		characters: [],
		communities: [],
		npcs: [],
		places: [],
		journeys: [],
		sites: [],
	});
	let strategy = $state<Exclude<CollisionStrategy, 'cancel'>>('new');
	let resolver: ((s: CollisionStrategy) => void) | null = null;

	/** Show the dialog. Resolves with the user's choice (or 'cancel'). */
	export function open(i: CollisionItems): Promise<CollisionStrategy> {
		items = i;
		strategy = 'new';
		return new Promise((resolve) => {
			resolver = resolve;
			dialogOpen = true;
		});
	}

	const groups = $derived.by(() => {
		const out: { label: string; names: string[] }[] = [];
		if (items.characters.length > 0)
			out.push({
				label: items.characters.length === 1 ? 'Character' : 'Characters',
				names: items.characters,
			});
		if (items.communities.length > 0)
			out.push({
				label: items.communities.length === 1 ? 'Community' : 'Communities',
				names: items.communities,
			});
		if (items.npcs.length > 0)
			out.push({ label: items.npcs.length === 1 ? 'NPC' : 'NPCs', names: items.npcs });
		if (items.places.length > 0)
			out.push({
				label: items.places.length === 1 ? 'Place' : 'Places',
				names: items.places,
			});
		if (items.journeys.length > 0)
			out.push({
				label: items.journeys.length === 1 ? 'Journey' : 'Journeys',
				names: items.journeys,
			});
		if (items.sites.length > 0)
			out.push({
				label: items.sites.length === 1 ? 'Site' : 'Sites',
				names: items.sites,
			});
		return out;
	});

	const totalCount = $derived(
		items.characters.length +
			items.communities.length +
			items.npcs.length +
			items.places.length +
			items.journeys.length +
			items.sites.length,
	);

	function confirm() {
		const s = strategy;
		dialogOpen = false;
		resolver?.(s);
		resolver = null;
	}

	function cancel() {
		dialogOpen = false;
		resolver?.('cancel');
		resolver = null;
	}
</script>

<Dialog.Root
	bind:open={dialogOpen}
	onOpenChange={(next) => {
		if (!next && resolver) {
			// Bits-ui swallowed the dismissal (Escape / outside click).
			// Resolve as cancel so the caller's promise settles.
			const r = resolver;
			resolver = null;
			r('cancel');
		}
	}}
>
	<Dialog.Portal>
		<Dialog.Overlay class="icd-overlay" />
		<Dialog.Content class="icd-dialog">
			<DialogHeader title={headingText('Items already exist')} onclose={cancel} />

			<div class="icd-body">
				<p class="icd-lead">
					This import contains
					<strong>{totalCount} item{totalCount === 1 ? '' : 's'}</strong>
					whose names match entries already in your session:
				</p>

				<dl class="icd-groups">
					{#each groups as g}
						<div class="icd-group">
							<dt class="icd-group-label">{g.label}</dt>
							<dd class="icd-group-names">
								{#each g.names as n, i}
									<span class="icd-name">{n || '(unnamed)'}</span>{#if i < g.names.length - 1},{/if}
								{/each}
							</dd>
						</div>
					{/each}
				</dl>

				<p class="icd-prompt">What should I do with them?</p>

				<RadioGroup.Root
					class="icd-radio-group"
					value={strategy}
					onValueChange={(v) => (strategy = v as Exclude<CollisionStrategy, 'cancel'>)}
					aria-label="Collision strategy"
				>
					<label class="icd-radio">
						<RadioGroup.Item value="new" class="icd-radio-btn">
							<span class="icd-radio-dot"></span>
						</RadioGroup.Item>
						<span class="icd-radio-body">
							<span class="icd-radio-title">Import as new (keep both)</span>
							<span class="icd-radio-help">
								Give the incoming copies fresh IDs. Both versions appear; existing entries are
								untouched. Safest choice if you're unsure.
							</span>
						</span>
					</label>

					<label class="icd-radio">
						<RadioGroup.Item value="replace" class="icd-radio-btn">
							<span class="icd-radio-dot"></span>
						</RadioGroup.Item>
						<span class="icd-radio-body">
							<span class="icd-radio-title">Replace existing</span>
							<span class="icd-radio-help">
								Overwrite the matching entries with the imported versions. Useful when you exported
								earlier and edited the copy outside the app.
							</span>
						</span>
					</label>

					<label class="icd-radio">
						<RadioGroup.Item value="skip" class="icd-radio-btn">
							<span class="icd-radio-dot"></span>
						</RadioGroup.Item>
						<span class="icd-radio-body">
							<span class="icd-radio-title">Skip these</span>
							<span class="icd-radio-help">
								Drop the colliding incoming items entirely. Your existing entries are preserved.
							</span>
						</span>
					</label>
				</RadioGroup.Root>

				<p class="icd-note">
					Non-conflicting items in the file still import normally regardless of the choice above.
				</p>
			</div>

			<div class="icd-footer">
				<button type="button" class="btn" onclick={cancel}>Cancel import</button>
				<button type="button" class="btn btn-primary" onclick={confirm}>Continue</button>
			</div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<style>
	/* bits-ui portals Content + Overlay to <body>; scope everything
	   globally. Overlay 80 / content 81 matches the modal z-index tier. */
	:global(.icd-overlay) {
		position: fixed;
		inset: 0;
		background: #00000050;
		backdrop-filter: blur(1px);
		z-index: 80;
	}
	:global(.icd-dialog) {
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: min(460px, calc(100vw - 2rem));
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

	:global(.icd-body) {
		padding: 14px 18px 4px;
		max-height: calc(84vh - 6rem);
		overflow-y: auto;
		overscroll-behavior: contain;
		font-family: var(--font-ui);
		font-size: 0.8rem;
		line-height: 1.5;
		color: var(--text);
	}

	:global(.icd-lead) {
		margin: 0 0 10px;
		color: var(--text);
	}
	:global(.icd-lead strong) {
		color: var(--text-accent);
		font-weight: 600;
	}

	:global(.icd-groups) {
		margin: 0 0 12px;
		padding: 8px 12px;
		background: var(--bg-inset);
		border: 1px solid var(--border);
		border-radius: 5px;
		font-size: 0.78rem;
		max-height: 30vh;
		overflow-y: auto;
		overscroll-behavior: contain;
	}
	:global(.icd-group) {
		display: grid;
		grid-template-columns: minmax(86px, max-content) 1fr;
		gap: 6px 10px;
		padding: 4px 0;
	}
	:global(.icd-group + .icd-group) {
		border-top: 1px solid var(--border);
	}
	:global(.icd-group-label) {
		font-weight: 600;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		font-size: 0.7rem;
		margin: 0;
		padding-top: 2px;
	}
	:global(.icd-group-names) {
		margin: 0;
		color: var(--text);
		line-height: 1.45;
		word-break: break-word;
	}
	:global(.icd-name + .icd-name) {
		margin-left: 0.3em;
	}

	:global(.icd-prompt) {
		margin: 0 0 8px;
		color: var(--text);
		font-weight: 500;
	}

	:global(.icd-radio-group) {
		border: none;
		padding: 0;
		margin: 0 0 14px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	:global(.icd-radio) {
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
	:global(.icd-radio:hover) {
		background: var(--bg-hover);
		border-color: var(--border-mid);
	}
	:global(.icd-radio-btn) {
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
	:global(.icd-radio-btn:focus-visible) {
		outline: 2px solid var(--text-accent);
		outline-offset: 1px;
	}
	:global(.icd-radio-btn[data-state='checked']) {
		border-color: var(--text-accent);
	}
	:global(.icd-radio-dot) {
		width: 7px;
		height: 7px;
		border-radius: 999px;
		background: var(--text-accent);
		opacity: 0;
		transition: opacity 0.12s;
	}
	:global(.icd-radio-btn[data-state='checked'] .icd-radio-dot) {
		opacity: 1;
	}
	:global(.icd-radio:has(.icd-radio-btn[data-state='checked'])) {
		border-color: var(--text-accent);
		background: color-mix(in srgb, var(--text-accent) 7%, transparent);
	}
	:global(.icd-radio-body) {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	:global(.icd-radio-title) {
		font-weight: 600;
		color: var(--text);
	}
	:global(.icd-radio-help) {
		font-size: 0.72rem;
		color: var(--text-muted);
	}

	:global(.icd-note) {
		margin: 0 0 12px;
		font-size: 0.72rem;
		color: var(--text-dimmer);
		font-style: italic;
	}

	:global(.icd-footer) {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		padding: 10px 18px 14px;
		border-top: 1px solid var(--border);
		background: var(--bg-card);
	}
</style>
