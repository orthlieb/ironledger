<script lang="ts">
	/**
	 * ImportCollisionDialog — three-way prompt shown when an import file
	 * contains entities (communities / NPCs / expeditions) whose IDs already
	 * exist in the active session.
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
	 *   const choice = await ref?.open({ communities: 2, npcs: 0, expeditions: 1 });
	 */
	import DialogHeader from '$lib/components/DialogHeader.svelte';
	import { headingText } from '$lib/fontStore.svelte.js';
	import type { CollisionItems, CollisionStrategy } from './importCollision.js';

	let dialogEl = $state<HTMLDialogElement | null>(null);
	let items = $state<CollisionItems>({ communities: [], npcs: [], expeditions: [] });
	let strategy = $state<Exclude<CollisionStrategy, 'cancel'>>('new');
	let resolver: ((s: CollisionStrategy) => void) | null = null;

	/** Show the dialog. Resolves with the user's choice (or 'cancel'). */
	export function open(i: CollisionItems): Promise<CollisionStrategy> {
		items = i;
		strategy = 'new';
		return new Promise((resolve) => {
			resolver = resolve;
			dialogEl?.showModal();
		});
	}

	const groups = $derived.by(() => {
		const out: { label: string; names: string[] }[] = [];
		if (items.communities.length > 0)
			out.push({
				label: items.communities.length === 1 ? 'Community' : 'Communities',
				names: items.communities,
			});
		if (items.npcs.length > 0)
			out.push({ label: items.npcs.length === 1 ? 'NPC' : 'NPCs', names: items.npcs });
		if (items.expeditions.length > 0)
			out.push({
				label: items.expeditions.length === 1 ? 'Expedition' : 'Expeditions',
				names: items.expeditions,
			});
		return out;
	});

	const totalCount = $derived(
		items.communities.length + items.npcs.length + items.expeditions.length,
	);

	function confirm() {
		const s = strategy;
		dialogEl?.close();
		resolver?.(s);
		resolver = null;
	}

	function cancel() {
		dialogEl?.close();
		resolver?.('cancel');
		resolver = null;
	}
</script>

<dialog bind:this={dialogEl} class="icd-dialog" oncancel={cancel}>
	<DialogHeader title={headingText('Items already exist')} onclose={cancel} />

	<div class="icd-body">
		<p class="icd-lead">
			This import contains
			<strong>{totalCount} item{totalCount === 1 ? '' : 's'}</strong>
			whose IDs match entries already in your session:
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

		<fieldset class="icd-radio-group">
			<legend class="visually-hidden">Collision strategy</legend>

			<label class="icd-radio">
				<input
					type="radio"
					name="strategy"
					value="new"
					checked={strategy === 'new'}
					onchange={() => (strategy = 'new')}
				/>
				<span class="icd-radio-body">
					<span class="icd-radio-title">Import as new (keep both)</span>
					<span class="icd-radio-help">
						Give the incoming copies fresh IDs. Both versions appear; existing entries are
						untouched. Safest choice if you're unsure.
					</span>
				</span>
			</label>

			<label class="icd-radio">
				<input
					type="radio"
					name="strategy"
					value="replace"
					checked={strategy === 'replace'}
					onchange={() => (strategy = 'replace')}
				/>
				<span class="icd-radio-body">
					<span class="icd-radio-title">Replace existing</span>
					<span class="icd-radio-help">
						Overwrite the matching entries with the imported versions. Useful when you exported
						earlier and edited the copy outside the app.
					</span>
				</span>
			</label>

			<label class="icd-radio">
				<input
					type="radio"
					name="strategy"
					value="skip"
					checked={strategy === 'skip'}
					onchange={() => (strategy = 'skip')}
				/>
				<span class="icd-radio-body">
					<span class="icd-radio-title">Skip these</span>
					<span class="icd-radio-help">
						Drop the colliding incoming items entirely. Your existing entries are preserved.
					</span>
				</span>
			</label>
		</fieldset>

		<p class="icd-note">
			Non-conflicting items in the file still import normally regardless of the choice above.
		</p>
	</div>

	<div class="icd-footer">
		<button type="button" class="btn" onclick={cancel}>Cancel import</button>
		<button type="button" class="btn btn-primary" onclick={confirm}>Continue</button>
	</div>
</dialog>

<style>
	/* Per CLAUDE.md <dialog> mobile rules:
	   - centre via top/left + transform (never inset:0 + margin:auto)
	   - no `dvh` anywhere on the dialog or its descendants
	   - no display:flex chain that collapses without an explicit height —
	     this dialog is content-sized via max-height + overflow on the body */
	.icd-dialog {
		position: fixed;
		top: 50%;
		left: 50%;
		margin: 0;
		padding: 0;
		transform: translate(-50%, -50%);
		width: min(460px, calc(100vw - 2rem));
		max-height: 84vh;
		overflow: hidden;
		border: none;
		border-radius: 10px;
		background: var(--bg-card);
		color: var(--text);
		box-shadow:
			0 12px 40px #00000060,
			0 0 0 1px var(--border-mid);
		overscroll-behavior: contain;
	}
	.icd-dialog::backdrop {
		background: #00000050;
		backdrop-filter: blur(1px);
	}

	.icd-body {
		padding: 14px 18px 4px;
		max-height: calc(84vh - 6rem);
		overflow-y: auto;
		overscroll-behavior: contain;
		font-family: var(--font-ui);
		font-size: 0.8rem;
		line-height: 1.5;
		color: var(--text);
	}

	.icd-lead {
		margin: 0 0 10px;
		color: var(--text);
	}
	.icd-lead strong {
		color: var(--text-accent);
		font-weight: 600;
	}

	.icd-groups {
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
	.icd-group {
		display: grid;
		grid-template-columns: minmax(86px, max-content) 1fr;
		gap: 6px 10px;
		padding: 4px 0;
	}
	.icd-group + .icd-group {
		border-top: 1px solid var(--border);
	}
	.icd-group-label {
		font-weight: 600;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.04em;
		font-size: 0.7rem;
		margin: 0;
		padding-top: 2px;
	}
	.icd-group-names {
		margin: 0;
		color: var(--text);
		line-height: 1.45;
		word-break: break-word;
	}
	.icd-name + .icd-name {
		margin-left: 0;
	}

	.icd-prompt {
		margin: 0 0 8px;
		color: var(--text);
		font-weight: 500;
	}

	.icd-radio-group {
		border: none;
		padding: 0;
		margin: 0 0 14px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.icd-radio {
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
	.icd-radio:hover {
		background: var(--bg-hover);
		border-color: var(--border-mid);
	}
	.icd-radio input[type='radio'] {
		margin: 2px 0 0;
		accent-color: var(--text-accent);
	}
	.icd-radio:has(input:checked) {
		border-color: var(--text-accent);
		background: color-mix(in srgb, var(--text-accent) 7%, transparent);
	}
	.icd-radio-body {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.icd-radio-title {
		font-weight: 600;
		color: var(--text);
	}
	.icd-radio-help {
		font-size: 0.72rem;
		color: var(--text-muted);
	}

	.icd-note {
		margin: 0 0 12px;
		font-size: 0.72rem;
		color: var(--text-dimmer);
		font-style: italic;
	}

	.icd-footer {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		padding: 10px 18px 14px;
		border-top: 1px solid var(--border);
		background: var(--bg-card);
	}

	.visually-hidden {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
		border: 0;
	}
</style>
