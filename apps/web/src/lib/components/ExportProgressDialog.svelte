<script lang="ts">
	/**
	 * ExportProgressDialog — a small busy overlay for the export pipeline.
	 *
	 * Export gathers each selected entity's portrait bytes (network) and then
	 * zips them, which for a rich world is a multi-second, partly main-thread
	 * -blocking wait. This mirrors the ImportDialog's importing stage (bits-ui
	 * Progress bar when a total is known, spinner otherwise) so the user sees
	 * what's happening instead of a frozen dialog. It has no dismiss controls
	 * while it works — the parent opens it before the work and closes it when
	 * the download fires (or an error is caught). When the export left
	 * something out (a hidden map layer, a map with no background), it's
	 * `held`: it lists the `warnings` and waits for Close (or ✕, or Escape).
	 *
	 * Drive it with a `{ done, total, label }` progress object: `total: 0`
	 * renders the indeterminate spinner (e.g. the synchronous compress step,
	 * which can't report incremental progress).
	 */
	import { Dialog, Progress } from 'bits-ui';
	import DialogHeader from './DialogHeader.svelte';
	import { headingText } from '#lib/fontStore.svelte.js';
	import { pushDialog, popDialog, overlayZ, contentZ } from '#lib/dialogStack.svelte.js';

	let {
		open = $bindable(false),
		progress = null,
		summary = '',
		warnings = [],
		held = false,
		onclose,
	}: {
		open?: boolean;
		progress?: { done: number; total: number; label: string } | null;
		/** Human-readable content breakdown, e.g. "3 characters, 4 landmarks". */
		summary?: string;
		/** What the export left out, and why. */
		warnings?: string[];
		/** Done, and waiting on Close to read the warnings. */
		held?: boolean;
		onclose?: () => void;
	} = $props();

	let closeBtn = $state<HTMLButtonElement | null>(null);
	// Held: the caret goes to Close, the one thing left to do.
	$effect(() => {
		if (held) setTimeout(() => closeBtn?.focus(), 0);
	});

	let stackDepth = $state(1);
	$effect(() => {
		if (!open) return;
		stackDepth = pushDialog();
		return () => popDialog();
	});

	const pct = $derived(
		progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0,
	);
</script>

<Dialog.Root
	bind:open
	onOpenChange={(o) => {
		if (!o) onclose?.();
	}}
>
	<Dialog.Portal>
		<Dialog.Overlay class="dialog-overlay exp-overlay" style="z-index: {overlayZ(stackDepth)}" />
		<Dialog.Content
			class="exp-dialog"
			data-tour="export-progress"
			style="z-index: {contentZ(stackDepth)}"
			escapeKeydownBehavior={held ? 'close' : 'ignore'}
			interactOutsideBehavior="ignore"
			trapFocus={false}
		>
			<DialogHeader
				title={headingText('Export')}
				radius="10px 10px 0 0"
				onclose={held ? onclose : undefined}
			/>
			<div class="exp-body">
				<div class="exp-state">
					{#if held}
						<p class="exp-state-title">Exported, with some left out</p>
						<ul class="exp-warnings" data-testid="export-warnings">
							{#each warnings as w (w)}
								<li>{w}</li>
							{/each}
						</ul>
					{:else if progress && progress.total > 0}
						<Progress.Root
							value={progress.done}
							max={progress.total}
							class="exp-bar"
							aria-label="Export progress"
						>
							<div class="exp-bar-fill" style="width: {pct}%"></div>
						</Progress.Root>
						<p class="exp-state-title">Exporting {progress.done} of {progress.total}</p>
					{:else}
						<span class="exp-spinner" aria-hidden="true"></span>
						<p class="exp-state-title">Preparing export…</p>
					{/if}
					{#if !held}
						<p class="exp-state-sub exp-state-sub--ellipsis">
							{progress?.label || 'Gathering your world.'}
						</p>
					{/if}
					{#if summary}
						<p class="exp-summary">{summary}</p>
					{/if}
				</div>
			</div>
			{#if held}
				<div class="exp-footer">
					<button class="btn" type="button" bind:this={closeBtn} onclick={() => onclose?.()}
						>Close</button
					>
				</div>
			{/if}
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<style>
	/* Portalled bits-ui content — scope with :global(). Mirrors the .imd-*
	   importing stage so import and export read as one visual system. */
	:global(.exp-dialog) {
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: min(94vw, 440px);
		display: flex;
		flex-direction: column;
		background: var(--bg-card);
		border: 1px solid var(--border-mid);
		border-radius: 10px;
		box-shadow: 0 22px 60px -14px rgba(0, 0, 0, 0.7);
		overflow: hidden;
	}
	:global(.exp-body) {
		padding: 16px;
	}
	:global(.exp-state) {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		padding: 20px 8px;
		text-align: center;
	}
	:global(.exp-state-title) {
		margin: 4px 0 0;
		font-weight: 600;
		font-size: 15px;
		color: var(--text);
	}
	:global(.exp-state-sub) {
		margin: 0;
		font-size: 12.5px;
		color: var(--text-muted);
	}
	:global(.exp-state-sub--ellipsis) {
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	:global(.exp-summary) {
		margin: 6px 0 0;
		font-size: 12px;
		line-height: 1.5;
		color: var(--text-dimmer);
		text-align: center;
	}
	/* What the export left out: a plain list, left-aligned so a long map name
	   wraps readably. */
	:global(.exp-warnings) {
		margin: 4px 0 0;
		padding-left: 18px;
		align-self: stretch;
		text-align: left;
		font-size: 12.5px;
		line-height: 1.5;
		color: var(--text-muted);
	}
	:global(.exp-footer) {
		display: flex;
		justify-content: flex-end;
		padding: 10px 16px;
		border-top: 1px solid var(--border);
	}
	:global(.exp-bar) {
		width: 100%;
		height: 8px;
		border-radius: 999px;
		background: var(--bg-inset);
		border: 1px solid var(--border);
		overflow: hidden;
	}
	:global(.exp-bar-fill) {
		height: 100%;
		background: var(--text-accent);
		border-radius: inherit;
		transition: width 0.18s ease-out;
	}
	:global(.exp-spinner) {
		width: 30px;
		height: 30px;
		border-radius: 50%;
		border: 3px solid var(--border);
		border-top-color: var(--text-accent);
		animation: exp-spin 0.7s linear infinite;
	}
	@keyframes exp-spin {
		to {
			transform: rotate(360deg);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		:global(.exp-spinner) {
			animation-duration: 2s;
		}
		:global(.exp-bar-fill) {
			transition: none;
		}
	}
</style>
