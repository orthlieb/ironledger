<script lang="ts">
	/**
	 * HamburgerMenu — three-bar dropdown in the title bar.
	 * Items: About, Settings, Import, Export, Sign Out.
	 *
	 * Export opens a dialog with content/format selection.
	 * Export/Import actions are dispatched as CustomEvents on `document`
	 * so the home page can handle them with access to character data.
	 */

	let {
		onSettings,
	}: {
		onSettings?: () => void;
	} = $props();

	let open = $state(false);
	let exportDialogEl = $state<HTMLDialogElement | null>(null);
	let exportContent = $state('everything');
	let exportFormat = $state('json');

	function toggle() { open = !open; }
	function close() { open = false; }

	function dispatch(action: string, detail: Record<string, string> = {}) {
		document.dispatchEvent(new CustomEvent('il-menu-action', { detail: { action, ...detail } }));
	}

	function openExportDialog() {
		close();
		exportDialogEl?.showModal();
	}

	function doExport() {
		dispatch('export', { content: exportContent, format: exportFormat });
		exportDialogEl?.close();
	}
</script>

<svelte:window onclick={(e) => {
	if (open && !(e.target as HTMLElement).closest('.hamburger-menu')) close();
}} />

<div class="hamburger-menu">
	<button class="hamburger-btn" onclick={toggle} aria-label="Menu" aria-expanded={open}>
		<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
			<rect y="2" width="16" height="2" rx="1" fill="currentColor"/>
			<rect y="7" width="16" height="2" rx="1" fill="currentColor"/>
			<rect y="12" width="16" height="2" rx="1" fill="currentColor"/>
		</svg>
	</button>

	{#if open}
		<div class="menu-dropdown">
			<a href="/about" class="menu-item" onclick={close}>About</a>

			<button class="menu-item" onclick={() => { onSettings?.(); close(); }}>Settings</button>

			<div class="menu-divider"></div>

			<button class="menu-item" onclick={() => { close(); dispatch('import'); }}>Import...</button>

			<button class="menu-item" onclick={openExportDialog}>Export...</button>

			<div class="menu-divider"></div>

			<form method="POST" action="/logout" class="menu-form">
				<button type="submit" class="menu-item menu-item--danger">Sign Out</button>
			</form>
		</div>
	{/if}
</div>

<!-- Export dialog -->
<dialog bind:this={exportDialogEl} class="export-dialog"
	oncancel={() => exportDialogEl?.close()}>
	<div class="ed-header">
		<span class="ed-title">Export</span>
		<button class="ed-close" onclick={() => exportDialogEl?.close()} aria-label="Close">&#x2715;</button>
	</div>
	<div class="ed-body">
		<div class="ed-field">
			<span class="ed-label">Content</span>
			<select class="ed-select" bind:value={exportContent}>
				<option value="everything">Everything</option>
				<option value="character">Current Character</option>
				<option value="all-characters">All Characters</option>
				<option value="log">Session Log</option>
				<option value="communities">Communities</option>
			</select>
		</div>
		<div class="ed-field">
			<span class="ed-label">Format</span>
			<div class="ed-seg" role="group">
				<button class="ed-seg-btn" class:active={exportFormat === 'json'}
					onclick={() => (exportFormat = 'json')}>JSON</button>
				<button class="ed-seg-btn" class:active={exportFormat === 'md'}
					onclick={() => (exportFormat = 'md')}>Markdown</button>
			</div>
		</div>
	</div>
	<div class="ed-footer">
		<button class="btn" onclick={() => exportDialogEl?.close()}>Cancel</button>
		<button class="btn btn-primary" onclick={doExport}>Export</button>
	</div>
</dialog>

<style>
	.hamburger-menu {
		position: relative;
	}

	.hamburger-btn {
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
		transition: color 0.15s, border-color 0.15s;
	}
	.hamburger-btn:hover {
		color: var(--text-accent);
		border-color: var(--border-mid);
	}

	.menu-dropdown {
		position: absolute;
		top: calc(100% + 4px);
		right: 0;
		min-width: 160px;
		background: var(--bg-card);
		border: 1px solid var(--border-mid);
		border-radius: 6px;
		box-shadow: 0 8px 24px #00000060;
		padding: 4px 0;
		z-index: 1000;
		display: flex;
		flex-direction: column;
	}

	.menu-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		padding: 7px 14px;
		background: none;
		border: none;
		font-family: var(--font-ui);
		font-size: 0.78rem;
		color: var(--text-muted);
		cursor: pointer;
		text-align: left;
		text-decoration: none;
		transition: background 0.1s, color 0.1s;
	}
	.menu-item:hover {
		background: var(--bg-hover);
		color: var(--text);
	}
	.menu-item--danger {
		color: var(--color-danger);
	}
	.menu-item--danger:hover {
		background: color-mix(in srgb, var(--color-danger) 10%, var(--bg-card));
	}

	.menu-divider {
		height: 1px;
		background: var(--border);
		margin: 4px 8px;
	}

	.menu-form {
		display: contents;
	}

	/* ── Export dialog ── */
	.export-dialog {
		border: none;
		padding: 0;
		border-radius: 8px;
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: min(320px, calc(100vw - 2rem));
		background: var(--bg-card);
		color: var(--text);
		box-shadow: 0 12px 40px #00000060, 0 0 0 1px var(--border-mid);
		outline: none;
	}
	.export-dialog[open] {
		display: flex;
		flex-direction: column;
	}
	.export-dialog::backdrop {
		background: #00000050;
		backdrop-filter: blur(1px);
	}

	.ed-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 10px 14px;
		border-bottom: 1px solid var(--border);
		background: var(--bg-control);
		border-radius: 8px 8px 0 0;
	}
	.ed-title {
		font-family: var(--font-display);
		font-size: 0.78rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-accent);
	}
	.ed-close {
		background: transparent;
		border: none;
		color: var(--text-dimmer);
		cursor: pointer;
		font-size: 0.9rem;
		padding: 2px 5px;
		border-radius: 3px;
		line-height: 1;
	}
	.ed-close:hover { color: var(--text); }

	.ed-body {
		padding: 16px 14px;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.ed-field {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.ed-label {
		font-family: var(--font-ui);
		font-size: 0.73rem;
		font-weight: 600;
		color: var(--text-muted);
		min-width: 58px;
	}
	.ed-select {
		flex: 1;
		font-family: var(--font-ui);
		font-size: 0.75rem;
		padding: 5px 8px;
		border: 1px solid var(--border-mid);
		border-radius: 4px;
		background: var(--bg-control);
		color: var(--text);
		cursor: pointer;
	}

	.ed-seg {
		display: flex;
		border: 1px solid var(--border-mid);
		border-radius: 5px;
		overflow: hidden;
	}
	.ed-seg-btn {
		padding: 5px 14px;
		background: var(--bg-control);
		border: none;
		border-right: 1px solid var(--border-mid);
		cursor: pointer;
		color: var(--text-dimmer);
		font-family: var(--font-ui);
		font-size: 0.72rem;
		font-weight: 500;
		transition: background 0.12s, color 0.12s;
	}
	.ed-seg-btn:last-child { border-right: none; }
	.ed-seg-btn:hover:not(.active) {
		background: var(--bg-hover);
		color: var(--text-muted);
	}
	.ed-seg-btn.active {
		background: var(--bg-hover);
		color: var(--text-accent);
		font-weight: 600;
	}

	.ed-footer {
		display: flex;
		gap: 6px;
		justify-content: flex-end;
		padding: 0 14px 14px;
	}
	.btn-primary {
		background: var(--text-accent);
		border-color: var(--text-accent);
		color: var(--bg-card);
		font-weight: 600;
	}
	.btn-primary:hover { opacity: 0.88; }
</style>
