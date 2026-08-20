<script lang="ts">
	/**
	 * VowOptionsDialog — nested modal opened from a vow card's gear icon.
	 * Hides rename + delete behind a settings surface, matching
	 * ExpeditionOptionsDialog / CharacterOptionsDialog so every area shares one
	 * shape. Bits-ui Dialog; rename auto-commits onchange, delete is guarded by a
	 * ConfirmDialog. Reuses the shared `.co-*` global classes.
	 */

	import { headingText } from '$lib/fontStore.svelte.js';
	import { Dialog } from 'bits-ui';
	import DialogHeader from './DialogHeader.svelte';
	import ConfirmDialog from './ConfirmDialog.svelte';

	interface Props {
		/** Current vow name. */
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
				e.preventDefault();
				setTimeout(() => nameInputEl?.focus(), 0);
			}}
		>
			<DialogHeader title={headingText('Vow Options')} onclose={close} radius="8px 8px 0 0" />

			<div class="co-body">
				<section class="co-section">
					<label class="co-field">
						<span class="co-field-label">Vow name</span>
						<input
							bind:this={nameInputEl}
							class="co-input"
							type="text"
							value={name}
							onchange={onNameCommit}
							placeholder="Vow name"
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
							>Removes <strong>{name || 'this vow'}</strong> from the sheet. This can't be undone. To
							abandon a vow while keeping the record, mark it Forsaken instead.</span
						>
					</div>
				</section>
			</div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<ConfirmDialog
	bind:this={deleteConfirmRef}
	title="Delete Vow"
	confirmLabel="DELETE"
	onconfirm={onDeleteConfirmed}
>
	<p
		style="font-family: var(--font-ui); font-size: 0.82rem; color: var(--text-muted); margin: 0; line-height: 1.5;"
	>
		Permanently delete <strong>{name || 'this vow'}</strong>? This can't be undone.
	</p>
</ConfirmDialog>

<!-- Visual styling reuses the shared .co-* global classes defined in
     CharacterOptionsDialog — same overlay / dialog / field / danger look. -->
