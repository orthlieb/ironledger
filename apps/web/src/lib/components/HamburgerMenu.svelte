<script lang="ts">
	/**
	 * HamburgerMenu — three-bar dropdown in the title bar.
	 * Items: About, Settings, Import, Export, Report a bug, Admin (admins
	 * only), Sign Out.
	 *
	 * The dropdown itself is bits-ui DropdownMenu; the Export item opens
	 * a separate native dialog with content/format selection. Export /
	 * Import actions are dispatched as CustomEvents on document so the
	 * home page can handle them with access to character data.
	 */

	import Select from './Select.svelte';
	import { Dialog, DropdownMenu, ToggleGroup } from 'bits-ui';
	import DialogHeader from './DialogHeader.svelte';
	import { headingText } from '$lib/fontStore.svelte.js';

	let {
		isAdmin = false,
		onSettings,
		onReportBug,
	}: {
		/** Show the "Admin…" link. Wired from `data.user.role === 'admin'`
		 *  in the layout — defaults to false so non-admin renders are clean. */
		isAdmin?: boolean;
		onSettings?: () => void;
		onReportBug?: () => void;
	} = $props();

	let exportDialogOpen = $state(false);
	// Primary default button for the CLAUDE.md dialog focus rule —
	// caret lands on Export on open (no search field here).
	let exportBtnEl = $state<HTMLButtonElement | null>(null);
	// Hidden form the "Sign Out" item programmatically submits so the
	// POST + CSRF flow that /logout expects still runs — bits-ui menu
	// items don't render as <form> submitters themselves.
	let logoutFormEl = $state<HTMLFormElement | null>(null);
	let exportContent = $state('everything');
	// Default for "Everything" is the zip bundle (portraits packed as
	// raw JPEGs alongside the JSON body). Per-entity content types
	// (character / all-characters / communities / expeditions) also
	// emit a zip — they don't render a format select, but their
	// implicit `exportFormat` flows through as `zip`.
	let exportFormat = $state('zip');

	function dispatch(action: string, detail: Record<string, string> = {}) {
		document.dispatchEvent(new CustomEvent('il-menu-action', { detail: { action, ...detail } }));
	}

	function openExportDialog() {
		// setTimeout so bits-ui finishes its own close-and-return-focus
		// cycle before we open the dialog — otherwise the dialog opens
		// and the trigger tries to steal focus back on the same tick.
		setTimeout(() => (exportDialogOpen = true), 0);
	}

	function doExport() {
		dispatch('export', { content: exportContent, format: exportFormat });
		exportDialogOpen = false;
	}
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger class="hamburger-btn" aria-label="Menu">
		<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
			<rect y="2" width="16" height="2" rx="1" fill="currentColor" />
			<rect y="7" width="16" height="2" rx="1" fill="currentColor" />
			<rect y="12" width="16" height="2" rx="1" fill="currentColor" />
		</svg>
	</DropdownMenu.Trigger>
	<DropdownMenu.Portal>
		<DropdownMenu.Content class="hm-menu" sideOffset={4} align="end">
			<DropdownMenu.Item>
				{#snippet child({ props })}
					<a {...props} href="/about" class="hm-item">About</a>
				{/snippet}
			</DropdownMenu.Item>
			<DropdownMenu.Item class="hm-item" onSelect={() => onSettings?.()}>
				Settings…
			</DropdownMenu.Item>

			<DropdownMenu.Separator class="hm-sep" />

			<DropdownMenu.Item class="hm-item" onSelect={() => dispatch('import')}>
				Import…
			</DropdownMenu.Item>
			<DropdownMenu.Item class="hm-item" onSelect={openExportDialog}>Export…</DropdownMenu.Item>

			<DropdownMenu.Separator class="hm-sep" />

			<DropdownMenu.Item class="hm-item" onSelect={() => onReportBug?.()}>
				Report a bug…
			</DropdownMenu.Item>

			{#if isAdmin}
				<DropdownMenu.Separator class="hm-sep" />
				<DropdownMenu.Item>
					{#snippet child({ props })}
						<a {...props} href="/admin" class="hm-item">Admin…</a>
					{/snippet}
				</DropdownMenu.Item>
			{/if}

			<DropdownMenu.Separator class="hm-sep" />

			<DropdownMenu.Item
				class="hm-item hm-item--danger"
				onSelect={() => logoutFormEl?.requestSubmit()}
			>
				Sign Out
			</DropdownMenu.Item>
		</DropdownMenu.Content>
	</DropdownMenu.Portal>
</DropdownMenu.Root>

<form bind:this={logoutFormEl} method="POST" action="/logout" class="hm-logout-form"></form>

<!-- Export dialog — bits-ui Dialog. Drag comes from DialogHeader's
     `use:draggable`, which targets `dialog, [role="dialog"]` (see
     $lib/actions/draggable.ts), so the manual mousedown math the
     old native <dialog> carried is gone. -->
<Dialog.Root bind:open={exportDialogOpen}>
	<Dialog.Portal>
		<Dialog.Overlay class="export-overlay" />
		<Dialog.Content
			class="export-dialog"
			onOpenAutoFocus={(e) => {
				e.preventDefault();
				setTimeout(() => exportBtnEl?.focus(), 0);
			}}
		>
			<DialogHeader title={headingText('Export')} radius="8px 8px 0 0" />
			<div class="ed-body">
				<div class="ed-field">
					<label class="ed-label" for="export-content">Content</label>
					<Select
						id="export-content"
						class="ed-select"
						bind:value={exportContent}
						options={[
							{ value: 'everything', label: 'Everything' },
							{ value: 'character', label: 'Current Character' },
							{ value: 'all-characters', label: 'All Characters' },
							{ value: 'log', label: 'Session Log' },
							{ value: 'stories', label: 'Stories' },
							{ value: 'communities', label: 'Connections' },
							{ value: 'expeditions', label: 'Expeditions' },
							{ value: 'map', label: 'All Maps' },
						]}
						onchange={(v) => {
							// Stories are markdown-only. Log is JSON-or-Markdown. Map
							// defaults to PNG. Everything defaults to Zip. Per-entity
							// content types (character / all-characters / communities /
							// expeditions) always emit a zip — no format select shown.
							if (v === 'stories') exportFormat = 'md';
							else if (v === 'map') exportFormat = 'png';
							else if (v === 'log') exportFormat = 'json';
							else exportFormat = 'zip';
						}}
					/>
				</div>
				{#if exportContent === 'everything'}
					<div class="ed-field">
						<span class="ed-label">Format</span>
						<ToggleGroup.Root
							type="single"
							value={exportFormat}
							onValueChange={(v) => {
								if (v) exportFormat = v;
							}}
							class="ed-seg"
							aria-label="Export format"
						>
							<ToggleGroup.Item value="zip" class="ed-seg-btn">Zip</ToggleGroup.Item>
							<ToggleGroup.Item value="md" class="ed-seg-btn">Markdown</ToggleGroup.Item>
						</ToggleGroup.Root>
					</div>
				{:else if exportContent === 'log'}
					<div class="ed-field">
						<span class="ed-label">Format</span>
						<ToggleGroup.Root
							type="single"
							value={exportFormat}
							onValueChange={(v) => {
								if (v) exportFormat = v;
							}}
							class="ed-seg"
							aria-label="Export format"
						>
							<ToggleGroup.Item value="json" class="ed-seg-btn">JSON</ToggleGroup.Item>
							<ToggleGroup.Item value="md" class="ed-seg-btn">Markdown</ToggleGroup.Item>
						</ToggleGroup.Root>
					</div>
				{:else if exportContent === 'map'}
					<div class="ed-field">
						<span class="ed-label">Format</span>
						<ToggleGroup.Root
							type="single"
							value={exportFormat}
							onValueChange={(v) => {
								if (v) exportFormat = v;
							}}
							class="ed-seg"
							aria-label="Export format"
						>
							<ToggleGroup.Item value="png" class="ed-seg-btn">PNG</ToggleGroup.Item>
							<ToggleGroup.Item value="zip" class="ed-seg-btn">Zip</ToggleGroup.Item>
						</ToggleGroup.Root>
					</div>
				{/if}
			</div>
			<div class="ed-footer">
				<button class="btn" onclick={() => (exportDialogOpen = false)}>Cancel</button>
				<button bind:this={exportBtnEl} class="btn btn-primary" onclick={doExport}>Export</button>
			</div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<style>
	/* Every selector below has to be `:global()` — bits-ui
	   DropdownMenu components own their DOM roots, and the Trigger
	   Portals its Content out of this component's slot, so Svelte's
	   CSS pruning can't see any of them. `hm-*` prefix mirrors the
	   naming in docs/ui-components.md. */
	:global(.hamburger-btn) {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		background: none;
		border: 1px solid transparent;
		border-radius: 4px;
		padding: 3px 6px;
		cursor: pointer;
		color: var(--text-dimmer);
		line-height: 1;
		transition:
			color 0.15s,
			border-color 0.15s;
	}
	:global(.hamburger-btn:hover),
	:global(.hamburger-btn[data-state='open']) {
		color: var(--text-accent);
		border-color: var(--border-mid);
	}

	:global(.hm-menu) {
		min-width: 160px;
		background: var(--bg-card);
		border: 1px solid var(--border-mid);
		border-radius: 6px;
		box-shadow: 0 8px 24px #00000060;
		padding: 4px 0;
		z-index: 1000;
		outline: none;
	}

	:global(.hm-item) {
		display: block;
		width: 100%;
		box-sizing: border-box;
		padding: 7px 14px;
		font-family: var(--font-ui);
		font-size: 0.78rem;
		font-weight: 400;
		letter-spacing: normal;
		text-transform: none;
		color: var(--text-muted);
		background: none;
		border: none;
		text-align: left;
		text-decoration: none;
		cursor: pointer;
		user-select: none;
		outline: none;
		transition:
			background 0.1s,
			color 0.1s;
	}
	/* bits-ui sets data-highlighted on the item under keyboard focus
	   or pointer hover — same visual either way. */
	:global(.hm-item[data-highlighted]),
	:global(.hm-item:hover) {
		background: var(--bg-hover);
		color: var(--text);
		text-decoration: none;
		filter: none;
	}
	:global(.hm-item--danger) {
		color: var(--color-danger);
	}
	:global(.hm-item--danger[data-highlighted]),
	:global(.hm-item--danger:hover) {
		background: color-mix(in srgb, var(--color-danger) 10%, var(--bg-card));
		color: var(--color-danger);
	}

	:global(.hm-sep) {
		height: 1px;
		background: var(--border);
		margin: 4px 8px;
	}

	.hm-logout-form {
		display: none;
	}

	/* ── Export dialog ── */
	/* bits-ui portals Content + Overlay to <body>; scope everything
	   globally. Overlay 80 / content 81 matches the modal z-index
	   tier — critically, dropping the old `transform: translate(-50%,
	   -50%)` off the dialog itself removes the `position: fixed`
	   containing-block trap that was clipping the Content select's
	   popover inside the dialog. Popover now portals to <body> at
	   z-index 90 and floats free. Header uses <DialogHeader>, so
	   the old `.ed-header` hand-rolled drag styles are gone. */
	:global(.export-overlay) {
		position: fixed;
		inset: 0;
		background: #00000050;
		backdrop-filter: blur(1px);
		z-index: 80;
	}
	:global(.export-dialog) {
		display: flex;
		flex-direction: column;
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: min(320px, calc(100vw - 2rem));
		background: var(--bg-card);
		color: var(--text);
		border-radius: 8px;
		box-shadow:
			0 12px 40px #00000060,
			0 0 0 1px var(--border-mid);
		outline: none;
		z-index: 81;
	}

	:global(.ed-body) {
		padding: 16px 14px;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	:global(.ed-field) {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	:global(.ed-label) {
		font-family: var(--font-ui);
		font-size: 0.73rem;
		font-weight: 600;
		color: var(--text-muted);
		min-width: 58px;
	}
	/* Passed to `<Select>` and threaded onto the bits-ui Trigger.
	   Base look comes from `.bui-select-trigger`; this override
	   just makes the trigger flex-fill inside `.ed-field`. */
	:global(.ed-select) {
		flex: 1;
		min-width: 0;
		font-size: 0.75rem;
		padding: 5px 8px;
	}

	:global(.ed-seg) {
		display: flex;
		border: 1px solid var(--border-mid);
		border-radius: 5px;
		overflow: hidden;
	}
	:global(.ed-seg-btn) {
		padding: 5px 14px;
		background: var(--bg-control);
		border: none;
		border-right: 1px solid var(--border-mid);
		cursor: pointer;
		color: var(--text-dimmer);
		font-family: var(--font-ui);
		font-size: 0.72rem;
		font-weight: 500;
		transition:
			background 0.12s,
			color 0.12s;
	}
	:global(.ed-seg-btn:last-child) {
		border-right: none;
	}
	:global(.ed-seg-btn:hover:not([data-state='on'])) {
		background: var(--bg-hover);
		color: var(--text-muted);
	}
	:global(.ed-seg-btn[data-state='on']) {
		background: var(--bg-hover);
		color: var(--text-accent);
		font-weight: 600;
	}

	:global(.ed-footer) {
		display: flex;
		gap: 6px;
		justify-content: flex-end;
		padding: 0 14px 14px;
	}
</style>
