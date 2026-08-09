<script lang="ts">
	/**
	 * ConnectionOptionsDialog — nested modal opened from the Connections
	 * panel's gear icon. Hides rename + delete behind a settings surface,
	 * matching CharacterOptionsDialog / ExpeditionOptionsDialog /
	 * MapOptionsDialog so all four areas share one shape.
	 *
	 * Handles three entity kinds: community / npc / place. The `kind` prop
	 * only drives copy (Community / NPC / Place labels), not the write
	 * path — the parent owns per-kind update calls and forwards them
	 * through `oncommit` / `ondelete`.
	 */

	import { headingText } from '$lib/fontStore.svelte.js';
	import { Dialog } from 'bits-ui';
	import DialogHeader from './DialogHeader.svelte';
	import ConfirmDialog from './ConfirmDialog.svelte';

	interface Props {
		name: string;
		kind: 'community' | 'npc' | 'place';
		oncommit?: (next: string) => void;
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

	const kindLabel = $derived(kind === 'npc' ? 'NPC' : kind === 'place' ? 'Place' : 'Settlement');
	const kindLabelLc = $derived(kind === 'npc' ? 'NPC' : kind === 'place' ? 'place' : 'community');
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
						<button
							class="btn btn-danger"
							style="align-self: flex-start"
							onclick={() => deleteConfirmRef?.open()}>DELETE</button
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
	confirmLabel="DELETE"
	onconfirm={onDeleteConfirmed}
>
	<p
		style="font-family: var(--font-ui); font-size: 0.82rem; color: var(--text-muted); margin: 0; line-height: 1.5;"
	>
		Permanently delete <strong>{name || `this ${kindLabelLc}`}</strong>? This can't be undone.
	</p>
</ConfirmDialog>

<!-- Reuses the .co-* global classes defined in CharacterOptionsDialog. -->
