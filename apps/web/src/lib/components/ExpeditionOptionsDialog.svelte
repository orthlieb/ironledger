<script lang="ts">
	/**
	 * ExpeditionOptionsDialog — nested modal opened from the Expeditions
	 * panel's gear icon. Hides rename + delete behind a settings surface,
	 * matching CharacterOptionsDialog / MapOptionsDialog so all three
	 * areas share one shape.
	 *
	 * Bits-ui Dialog. Rename auto-commits onchange; delete is guarded
	 * by a ConfirmDialog. Accent colour keys to journey vs site so the
	 * dialog reads as belonging to the same entity type.
	 */

	import { headingText } from '$lib/fontStore.svelte.js';
	import { Dialog } from 'bits-ui';
	import DialogHeader from './DialogHeader.svelte';
	import ConfirmDialog from './ConfirmDialog.svelte';

	interface Props {
		/** Current expedition name. */
		name: string;
		/** 'journey' | 'site' — drives the delete-confirm copy so it names
		 *  the right thing ("this journey" / "this site"). */
		kind: 'journey' | 'site';
		/** Fires when the user commits a new (non-empty, changed) name. */
		oncommit?: (next: string) => void;
		/** Fires when the user confirms deletion. */
		ondelete?: () => void;
	}
	let { name, kind, oncommit, ondelete }: Props = $props();

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

	const kindLabel = $derived(kind === 'site' ? 'Site' : 'Journey');
	const kindLabelLc = $derived(kind === 'site' ? 'site' : 'journey');
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
			<DialogHeader
				title={headingText(`${kindLabel} Options`)}
				onclose={close}
				radius="8px 8px 0 0"
			/>

			<div class="co-body">
				<section class="co-section">
					<label class="co-field">
						<span class="co-field-label">{kindLabel} name</span>
						<input
							bind:this={nameInputEl}
							class="co-input"
							type="text"
							value={name}
							onchange={onNameCommit}
							placeholder="{kindLabel} name"
						/>
					</label>
				</section>

				<section class="co-section co-section-danger">
					<div class="co-danger-header">Danger zone</div>
					<div class="co-danger-row">
						<button class="co-danger-btn" onclick={() => deleteConfirmRef?.open()}
							>Delete this {kindLabelLc}</button
						>
						<span class="co-hint"
							>Removes <strong>{name || `this ${kindLabelLc}`}</strong> and everything on its sheet. This
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
	title={`Delete ${kindLabel}`}
	confirmLabel="Delete"
	onconfirm={onDeleteConfirmed}
>
	<p
		style="font-family: var(--font-ui); font-size: 0.82rem; color: var(--text-muted); margin: 0; line-height: 1.5;"
	>
		Permanently delete <strong>{name || `this ${kindLabelLc}`}</strong>? This can't be undone.
	</p>
</ConfirmDialog>

<!-- All visual styling reuses the .co-* global classes defined in
     CharacterOptionsDialog — same overlay / dialog / field / danger-btn
     look so the two settings surfaces are indistinguishable. -->
