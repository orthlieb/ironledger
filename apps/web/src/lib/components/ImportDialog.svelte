<script lang="ts">
	/**
	 * ImportDialog — pick an Iron Ledger `.zip` export, watch it import, and see
	 * the result. Replaces the bare hidden-file-input + transient error bar: the
	 * host owns the actual import (it needs the entity stores) and drives this
	 * dialog through `stage` / `summary` / `error`; the dialog just presents the
	 * chooser, a progress spinner, and a success or error report.
	 *
	 *   idle      → drop zone + "Choose file"
	 *   importing → spinner; promoted to a determinate bar only once the work
	 *               has been running BAR_DELAY_MS, so a fast import never
	 *               flashes one
	 *   done      → ✓ + summary
	 *   error     → ⚠ + the ImportError message + "Choose another file"
	 */
	import { Dialog, Progress } from 'bits-ui';
	import DialogHeader from './DialogHeader.svelte';
	import { headingText } from '$lib/fontStore.svelte.js';

	let {
		open = $bindable(false),
		stage = 'idle',
		summary = '',
		errors = [],
		validCount = 0,
		progress = null,
		onfile,
		onreview,
		onreset,
	}: {
		open?: boolean;
		stage?: 'idle' | 'importing' | 'review' | 'done' | 'error';
		/** Success detail, e.g. "3 characters · 12 connections · 148 log entries". */
		summary?: string;
		/** All problems collected during import. On `review`/`error` these are the
		 *  rows that couldn't be read; on `done` they're the ones that failed while
		 *  the rest imported. */
		errors?: string[];
		/** Number of valid rows offered on the `review` stage. */
		validCount?: number;
		/** Live import progress. `total` of 0 means the row count isn't known
		 *  yet (the archive is still being unpacked) and the bar runs
		 *  indeterminate. Null outside the `importing` stage. */
		progress?: { done: number; total: number; label: string } | null;
		onfile: (file: File) => void;
		/** Answer the `review` prompt: apply the valid rows, or cancel. */
		onreview: (proceed: boolean) => void;
		/** Return to the chooser to try another file. */
		onreset: () => void;
	} = $props();

	let fileEl = $state<HTMLInputElement | null>(null);
	let dragOver = $state(false);

	/** Hold the bar back this long. Most imports finish well inside it and are
	 *  better served by the spinner alone — a bar that appears and vanishes
	 *  reads as a glitch, and one that fills instantly tells you nothing. Past
	 *  this the wait is real and the user wants a fraction, not a spinner. */
	const BAR_DELAY_MS = 5000;
	let barReady = $state(false);

	// Reads `stage` and nothing else on purpose: `progress` changes on every
	// row, and tracking it here would restart the timer forever so the bar
	// would never appear.
	$effect(() => {
		if (stage !== 'importing') {
			barReady = false;
			return;
		}
		const t = setTimeout(() => (barReady = true), BAR_DELAY_MS);
		return () => clearTimeout(t);
	});

	function pick(file: File | null | undefined) {
		if (file) onfile(file);
	}
	function onInput(e: Event) {
		pick((e.target as HTMLInputElement).files?.[0]);
		if (fileEl) fileEl.value = ''; // allow re-picking the same file
	}
	function onDrop(e: DragEvent) {
		e.preventDefault();
		dragOver = false;
		pick(e.dataTransfer?.files?.[0]);
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Portal>
		<Dialog.Overlay class="imd-overlay" />
		<Dialog.Content class="imd-dialog">
			<DialogHeader
				title={headingText('Import')}
				onclose={() => (open = false)}
				radius="10px 10px 0 0"
			/>

			<div class="imd-body">
				{#if stage === 'importing'}
					<div class="imd-state">
						{#if barReady && progress && progress.total > 0}
							<Progress.Root
								value={progress.done}
								max={progress.total}
								class="imd-bar"
								aria-label="Import progress"
							>
								<div
									class="imd-bar-fill"
									style="width: {Math.round((progress.done / progress.total) * 100)}%"
								></div>
							</Progress.Root>
							<p class="imd-state-title">
								Importing {progress.done} of {progress.total}
							</p>
						{:else}
							<span class="imd-spinner" aria-hidden="true"></span>
							<p class="imd-state-title">Importing…</p>
						{/if}
						<p class="imd-state-sub imd-state-sub--ellipsis">
							{progress?.label || 'Reading the archive and applying its contents.'}
						</p>
					</div>
				{:else if stage === 'review'}
					<div class="imd-state">
						<span class="imd-badge imd-badge--warn" aria-hidden="true">
							<svg
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2.5"
								stroke-linecap="round"
								stroke-linejoin="round"
								><path d="M12 8v5M12 16.5v.5" /><path
									d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"
								/></svg
							>
						</span>
						<p class="imd-state-title">
							{errors.length} item{errors.length === 1 ? '' : 's'} couldn’t be read
						</p>
						<p class="imd-state-sub">
							{validCount} valid item{validCount === 1 ? '' : 's'} can still be imported.
						</p>
						<ul class="imd-errlist">
							{#each errors as e (e)}<li>{e}</li>{/each}
						</ul>
					</div>
				{:else if stage === 'done'}
					<div class="imd-state">
						<span
							class="imd-badge {errors.length ? 'imd-badge--warn' : 'imd-badge--ok'}"
							aria-hidden="true"
						>
							<svg
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2.5"
								stroke-linecap="round"
								stroke-linejoin="round"><path d="M4 12l5 5L20 6" /></svg
							>
						</span>
						<p class="imd-state-title">
							{errors.length ? 'Imported with issues' : 'Import complete'}
						</p>
						{#if summary}<p class="imd-state-sub">{summary}</p>{/if}
						{#if errors.length}
							<div class="imd-issues">
								<p class="imd-issues-head">
									{errors.length} item{errors.length === 1 ? '' : 's'} couldn’t be imported:
								</p>
								<ul class="imd-errlist">
									{#each errors as e (e)}<li>{e}</li>{/each}
								</ul>
							</div>
						{/if}
					</div>
				{:else if stage === 'error'}
					<div class="imd-state">
						<span class="imd-badge imd-badge--err" aria-hidden="true">
							<svg
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2.5"
								stroke-linecap="round"
								stroke-linejoin="round"
								><path d="M12 8v5M12 16.5v.5" /><path
									d="M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"
								/></svg
							>
						</span>
						<p class="imd-state-title">Import failed</p>
						<ul class="imd-errlist">
							{#each errors.length ? errors : ['Could not import the file.'] as e (e)}<li>
									{e}
								</li>{/each}
						</ul>
					</div>
				{:else}
					<button
						type="button"
						class="imd-drop"
						class:over={dragOver}
						onclick={() => fileEl?.click()}
						ondragover={(e) => {
							e.preventDefault();
							dragOver = true;
						}}
						ondragleave={() => (dragOver = false)}
						ondrop={onDrop}
					>
						<svg
							class="imd-drop-icon"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="1.7"
							stroke-linecap="round"
							stroke-linejoin="round"
							aria-hidden="true"
							><path d="M12 15V3" /><path d="m7 8 5-5 5 5" /><path
								d="M5 15v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"
							/></svg
						>
						<span class="imd-drop-title">Drop a <code>.zip</code> export here</span>
						<span class="imd-drop-sub">or click to choose a file</span>
					</button>
					<p class="imd-hint">
						Import an Iron Ledger <code>.zip</code> — a full backup or any partial export. Existing entities
						with matching names will prompt before anything is overwritten.
					</p>
					<input
						bind:this={fileEl}
						class="imd-file"
						type="file"
						accept=".zip,application/zip"
						onchange={onInput}
					/>
				{/if}
			</div>

			<div class="imd-footer">
				{#if stage === 'review'}
					<button type="button" class="btn" onclick={() => onreview(false)}>Cancel</button>
					<button type="button" class="btn btn-primary" onclick={() => onreview(true)}>
						Import {validCount} valid item{validCount === 1 ? '' : 's'}
					</button>
				{:else if stage === 'error'}
					<button type="button" class="btn" onclick={onreset}>Choose another file</button>
					<button type="button" class="btn btn-primary" onclick={() => (open = false)}>Close</button
					>
				{:else if stage === 'done'}
					<button type="button" class="btn btn-primary" onclick={() => (open = false)}>Done</button>
				{:else}
					<button
						type="button"
						class="btn"
						onclick={() => (open = false)}
						disabled={stage === 'importing'}>Cancel</button
					>
				{/if}
			</div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<style>
	:global(.imd-overlay) {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		z-index: 80;
	}
	:global(.imd-dialog) {
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
		z-index: 81;
		overflow: hidden;
	}
	:global(.imd-body) {
		padding: 16px;
	}

	:global(.imd-drop) {
		width: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		padding: 28px 16px;
		border: 1.5px dashed var(--border-mid);
		border-radius: 10px;
		background: var(--bg-inset);
		color: var(--text-muted);
		cursor: pointer;
		font: inherit;
		transition:
			border-color 0.12s,
			background 0.12s,
			color 0.12s;
	}
	:global(.imd-drop:hover),
	:global(.imd-drop.over) {
		border-color: var(--text-accent);
		color: var(--text);
		background: var(--accent-dim);
	}
	:global(.imd-drop-icon) {
		width: 30px;
		height: 30px;
		color: var(--text-accent);
	}
	:global(.imd-drop-title) {
		font-weight: 600;
		font-size: 14px;
	}
	:global(.imd-drop-title code),
	:global(.imd-hint code) {
		font-family: var(--font-mono);
		font-size: 0.85em;
		background: var(--bg-control);
		border: 1px solid var(--border);
		border-radius: 4px;
		padding: 0 4px;
	}
	:global(.imd-drop-sub) {
		font-size: 12px;
		color: var(--text-dimmer);
	}
	:global(.imd-hint) {
		margin: 12px 2px 0;
		font-size: 11.5px;
		line-height: 1.5;
		color: var(--text-dimmer);
	}
	:global(.imd-file) {
		display: none;
	}

	:global(.imd-state) {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		padding: 20px 8px;
		text-align: center;
	}
	:global(.imd-state-title) {
		margin: 4px 0 0;
		font-weight: 600;
		font-size: 15px;
		color: var(--text);
	}
	:global(.imd-state-sub) {
		margin: 0;
		font-size: 12.5px;
		color: var(--text-muted);
	}
	:global(.imd-errlist) {
		margin: 4px 0 0;
		padding: 10px 12px 10px 28px;
		width: 100%;
		box-sizing: border-box;
		text-align: left;
		list-style: disc;
		font-size: 12.5px;
		line-height: 1.5;
		color: var(--color-danger, #d9534f);
		background: color-mix(in srgb, var(--color-danger, #d9534f) 10%, var(--bg-inset));
		border: 1px solid color-mix(in srgb, var(--color-danger, #d9534f) 30%, transparent);
		border-radius: 8px;
		max-height: 220px;
		overflow-y: auto;
		overscroll-behavior: contain;
	}
	:global(.imd-errlist li + li) {
		margin-top: 4px;
	}
	:global(.imd-issues) {
		width: 100%;
		margin-top: 6px;
	}
	:global(.imd-issues-head) {
		margin: 0 0 2px;
		font-size: 12px;
		font-weight: 600;
		color: var(--text-muted);
		text-align: left;
	}

	:global(.imd-bar) {
		width: 100%;
		height: 8px;
		border-radius: 999px;
		background: var(--bg-inset);
		border: 1px solid var(--border);
		overflow: hidden;
	}
	:global(.imd-bar-fill) {
		height: 100%;
		background: var(--text-accent);
		border-radius: inherit;
		transition: width 0.18s ease-out;
	}
	/* One long entity name must not stretch the dialog. */
	:global(.imd-state-sub--ellipsis) {
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	:global(.imd-spinner) {
		width: 30px;
		height: 30px;
		border-radius: 50%;
		border: 3px solid var(--border);
		border-top-color: var(--text-accent);
		animation: imd-spin 0.7s linear infinite;
	}
	@keyframes imd-spin {
		to {
			transform: rotate(360deg);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		:global(.imd-spinner) {
			animation-duration: 2s;
		}
		:global(.imd-bar-fill) {
			transition: none;
		}
	}

	:global(.imd-badge) {
		width: 40px;
		height: 40px;
		border-radius: 50%;
		display: grid;
		place-items: center;
	}
	:global(.imd-badge svg) {
		width: 22px;
		height: 22px;
	}
	:global(.imd-badge--ok) {
		color: #3aa675;
		background: color-mix(in srgb, #3aa675 16%, var(--bg-inset));
	}
	:global(.imd-badge--warn) {
		color: var(--text-accent);
		background: var(--accent-dim);
	}
	:global(.imd-badge--err) {
		color: var(--color-danger, #d9534f);
		background: color-mix(in srgb, var(--color-danger, #d9534f) 14%, var(--bg-inset));
	}

	:global(.imd-footer) {
		display: flex;
		gap: 10px;
		justify-content: flex-end;
		padding: 12px 14px;
		background: var(--bg-card);
		border-top: 1px solid var(--border);
	}
</style>
