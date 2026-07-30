<script lang="ts">
	/**
	 * CharacterOptionsDialog — nested modal opened from the Characters
	 * panel's gear icon. Hides two low-frequency actions (rename +
	 * delete) behind a settings surface, matching the "Delete this map"
	 * pattern in MapOptionsDialog so both areas share the same shape.
	 *
	 * Bits-ui Dialog. Rename auto-commits onchange (identical to the
	 * map's `Map name` field). Delete is guarded by a ConfirmDialog.
	 */

	import { headingText } from '$lib/fontStore.svelte.js';
	import { Dialog } from 'bits-ui';
	import DialogHeader from './DialogHeader.svelte';
	import ConfirmDialog from './ConfirmDialog.svelte';

	interface Props {
		/** Current character name (e.g. `d.name`). Read-only — a parent
		 *  `oncommit` prop is the write path so the parent can persist
		 *  through its own store. */
		name: string;
		/** Fires when the user commits a new (non-empty, changed) name. */
		oncommit?: (next: string) => void;
		/** Fires when the user confirms deletion. */
		ondelete?: () => void;
	}
	let { name, oncommit, ondelete }: Props = $props();

	let dialogOpen = $state(false);
	let deleteConfirmRef = $state<{ open(): void; close(): void } | null>(null);
	let nameInputEl = $state<HTMLInputElement | null>(null);

	function onNameCommit(e: Event) {
		const v = (e.target as HTMLInputElement).value.trim();
		if (v && v !== name) oncommit?.(v);
	}

	async function onDeleteConfirmed() {
		ondelete?.();
		// The parent will drop `activeChar`, which the panel handles
		// by falling back to another character (or the empty state).
		// Close the settings sheet so the user sees the result instead
		// of a dialog covering it.
		close();
	}

	export function open() {
		dialogOpen = true;
	}
	export function close() {
		dialogOpen = false;
	}
</script>

<Dialog.Root bind:open={dialogOpen}>
	<Dialog.Portal>
		<Dialog.Overlay class="co-overlay" />
		<Dialog.Content
			class="co-dialog"
			onOpenAutoFocus={(e) => {
				// Land in the rename input — that's the primary action.
				// setTimeout(0) so bits-ui finishes its own focus routine first.
				e.preventDefault();
				setTimeout(() => nameInputEl?.focus(), 0);
			}}
		>
			<DialogHeader title={headingText('Character Options')} onclose={close} radius="8px 8px 0 0" />

			<div class="co-body">
				<section class="co-section">
					<label class="co-field">
						<span class="co-field-label">Character name</span>
						<input
							bind:this={nameInputEl}
							class="co-input"
							type="text"
							value={name}
							onchange={onNameCommit}
							placeholder="Character name"
						/>
					</label>
				</section>

				<section class="co-section co-section-danger">
					<div class="co-danger-header">Danger zone</div>
					<div class="co-danger-row">
						<button
							class="btn btn-danger"
							style="align-self: flex-start"
							onclick={() => deleteConfirmRef?.open()}>DELETE</button
						>
						<span class="co-hint"
							>Removes <strong>{name || 'this character'}</strong> and everything on their sheet. This
							can't be undone.</span
						>
					</div>
				</section>
			</div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<ConfirmDialog
	bind:this={deleteConfirmRef}
	title="Delete Character"
	confirmLabel="DELETE"
	onconfirm={onDeleteConfirmed}
>
	<p
		style="font-family: var(--font-ui); font-size: 0.82rem; color: var(--text-muted); margin: 0; line-height: 1.5;"
	>
		Permanently delete <strong>{name || 'this character'}</strong>? This can't be undone.
	</p>
</ConfirmDialog>

<style>
	:global(.co-overlay) {
		position: fixed;
		inset: 0;
		background: #00000050;
		backdrop-filter: blur(1px);
		z-index: 80;
	}
	:global(.co-dialog) {
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: min(440px, calc(100vw - 2rem));
		max-height: 82vh;
		display: flex;
		flex-direction: column;
		background: var(--bg-card);
		color: var(--text);
		border-radius: 8px;
		box-shadow:
			0 16px 48px #00000070,
			0 0 0 1px var(--border-mid);
		outline: none;
		z-index: 81;
		overflow: hidden;
	}
	:global(.co-body) {
		padding: 12px 14px 14px;
		display: flex;
		flex-direction: column;
		gap: 14px;
		overflow-y: auto;
	}
	:global(.co-section) {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	:global(.co-field) {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	:global(.co-field-label) {
		font-family: var(--font-ui);
		font-size: 0.66rem;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-dimmer);
	}
	:global(.co-input) {
		padding: 6px 8px;
		font-family: var(--font-ui);
		font-size: 0.9rem;
		color: var(--text);
		background: var(--bg-control);
		border: 1px solid var(--border-mid);
		border-radius: 4px;
		width: 100%;
	}
	:global(.co-input:focus) {
		outline: none;
		border-color: var(--text-accent);
	}
	:global(.co-hint) {
		font-family: var(--font-ui);
		font-size: 0.75rem;
		color: var(--text-muted);
		line-height: 1.4;
	}
	:global(.co-section-danger) {
		gap: 8px;
		padding-top: 10px;
		border-top: 1px solid var(--border);
	}
	:global(.co-danger-header) {
		font-family: var(--font-ui);
		font-size: 0.7rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-danger, #ef4444);
	}
	:global(.co-danger-row) {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	/* DELETE button lives on the shared `.btn .btn-danger` (see app.css) so
	   every destructive dialog button stays visually identical. */
</style>
