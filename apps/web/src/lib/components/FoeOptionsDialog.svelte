<script lang="ts">
	/**
	 * FoeOptionsDialog — nested modal opened from the Foes panel's gear
	 * icon. Same shape as CharacterOptionsDialog / ExpeditionOptionsDialog
	 * / ConnectionOptionsDialog so all four areas read the same.
	 *
	 * Foes are a bit special: the "name" the user sees is
	 * `customName || def.name`. Renaming sets `customName`; clearing the
	 * field reverts to the underlying catalogue name. The placeholder
	 * surfaces that default so the user sees what they'd get back.
	 */

	import { headingText } from '$lib/fontStore.svelte.js';
	import { Dialog } from 'bits-ui';
	import DialogHeader from './DialogHeader.svelte';
	import ConfirmDialog from './ConfirmDialog.svelte';

	interface Props {
		/** Current customName (may be empty when the def name is in use). */
		name: string;
		/** Catalogue name — shown as the input's placeholder, and used
		 *  in copy when the customName is empty. */
		defName: string;
		oncommit?: (next: string) => void;
		ondelete?: () => void;
	}
	let { name, defName, oncommit, ondelete }: Props = $props();

	let dialogOpen = $state(false);
	let deleteConfirmRef = $state<{ open(): void; close(): void } | null>(null);
	let nameInputEl = $state<HTMLInputElement | null>(null);

	function onNameCommit(e: Event) {
		const v = (e.target as HTMLInputElement).value.trim();
		// Allow empty — that's the "revert to catalogue name" gesture.
		if (v !== name) oncommit?.(v);
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

	const displayName = $derived(name || defName || 'this foe');
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
			<DialogHeader title={headingText('Foe Options')} onclose={close} radius="8px 8px 0 0" />

			<div class="co-body">
				<section class="co-section">
					<label class="co-field">
						<span class="co-field-label">Foe name</span>
						<input
							bind:this={nameInputEl}
							class="co-input"
							type="text"
							value={name}
							onchange={onNameCommit}
							placeholder={defName || 'Foe name'}
						/>
					</label>
					<span class="co-hint">Leave blank to use the catalogue name.</span>
				</section>

				<section class="co-section co-section-danger">
					<div class="co-danger-header">Danger zone</div>
					<div class="co-danger-row">
						<button class="co-danger-btn" onclick={() => deleteConfirmRef?.open()}>DELETE</button>
						<span class="co-hint"
							>Removes <strong>{displayName}</strong> from this encounter. This can't be undone.</span
						>
					</div>
				</section>
			</div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<ConfirmDialog
	bind:this={deleteConfirmRef}
	title="Delete Foe"
	confirmLabel="DELETE"
	onconfirm={onDeleteConfirmed}
>
	<p
		style="font-family: var(--font-ui); font-size: 0.82rem; color: var(--text-muted); margin: 0; line-height: 1.5;"
	>
		Permanently delete <strong>{displayName}</strong>? This can't be undone.
	</p>
</ConfirmDialog>

<!-- Reuses the .co-* global classes defined in CharacterOptionsDialog. -->
