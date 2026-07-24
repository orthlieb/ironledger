<script lang="ts">
	/**
	 * HamburgerMenu — three-bar dropdown in the title bar.
	 * Items: About, Settings, Import, Export, Report a bug, Admin (admins
	 * only), Sign Out.
	 *
	 * Export opens a dialog with content/format selection.
	 * Export/Import actions are dispatched as CustomEvents on `document`
	 * so the home page can handle them with access to character data.
	 */

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

	let open = $state(false);
	let exportDialogEl = $state<HTMLDialogElement | null>(null);
	let exportContent = $state('everything');
	let exportFormat = $state('json');

	let exportDragX = $state(0);
	let exportDragY = $state(0);
	let _exportDragging = false;
	let _exportStartMouseX = 0;
	let _exportStartMouseY = 0;
	let _exportStartDragX = 0;
	let _exportStartDragY = 0;

	function startExportDrag(e: MouseEvent) {
		_exportDragging = true;
		_exportStartMouseX = e.clientX;
		_exportStartMouseY = e.clientY;
		_exportStartDragX = exportDragX;
		_exportStartDragY = exportDragY;
		e.preventDefault();
		window.addEventListener('mousemove', onExportDragMove);
		window.addEventListener('mouseup', onExportDragEnd);
	}

	function onExportDragMove(e: MouseEvent) {
		if (!_exportDragging) return;
		exportDragX = _exportStartDragX + (e.clientX - _exportStartMouseX);
		exportDragY = _exportStartDragY + (e.clientY - _exportStartMouseY);
	}

	function onExportDragEnd() {
		_exportDragging = false;
		window.removeEventListener('mousemove', onExportDragMove);
		window.removeEventListener('mouseup', onExportDragEnd);
	}

	function toggle() {
		open = !open;
	}
	function close() {
		open = false;
	}

	function dispatch(action: string, detail: Record<string, string> = {}) {
		document.dispatchEvent(new CustomEvent('il-menu-action', { detail: { action, ...detail } }));
	}

	function openExportDialog() {
		close();
		exportDragX = 0;
		exportDragY = 0;
		exportDialogEl?.showModal();
	}

	function doExport() {
		dispatch('export', { content: exportContent, format: exportFormat });
		exportDialogEl?.close();
	}
</script>

<svelte:window
	onclick={(e) => {
		if (open && !(e.target as HTMLElement).closest('.hamburger-menu')) close();
	}}
/>

<div class="hamburger-menu">
	<button class="hamburger-btn" onclick={toggle} aria-label="Menu" aria-expanded={open}>
		<svg width="16" height="16" viewBox="0 0 16 16" fill="none">
			<rect y="2" width="16" height="2" rx="1" fill="currentColor" />
			<rect y="7" width="16" height="2" rx="1" fill="currentColor" />
			<rect y="12" width="16" height="2" rx="1" fill="currentColor" />
		</svg>
	</button>

	{#if open}
		<div class="menu-dropdown">
			<a href="/about" class="menu-item menu-item--link" onclick={close}>About</a>

			<button
				class="menu-item"
				onclick={() => {
					onSettings?.();
					close();
				}}>Settings…</button
			>

			<div class="menu-divider"></div>

			<button
				class="menu-item"
				onclick={() => {
					close();
					dispatch('import');
				}}>Import...</button
			>

			<button class="menu-item" onclick={openExportDialog}>Export...</button>

			<div class="menu-divider"></div>

			<button
				class="menu-item"
				onclick={() => {
					onReportBug?.();
					close();
				}}>Report a bug…</button
			>

			{#if isAdmin}
				<div class="menu-divider"></div>
				<a href="/admin" class="menu-item menu-item--link" onclick={close}>Admin…</a>
			{/if}

			<div class="menu-divider"></div>

			<form method="POST" action="/logout" class="menu-form">
				<button type="submit" class="menu-item menu-item--danger">Sign Out</button>
			</form>
		</div>
	{/if}
</div>

<!-- Export dialog -->
<dialog
	bind:this={exportDialogEl}
	class="export-dialog"
	style:transform="translate(calc(-50% + {exportDragX}px), calc(-50% + {exportDragY}px))"
	oncancel={() => exportDialogEl?.close()}
>
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="ed-header" onmousedown={startExportDrag}>
		<span class="drag-grip" aria-hidden="true">⠿</span>
		<span class="ed-title">Export</span>
	</div>
	<div class="ed-body">
		<div class="ed-field">
			<label class="ed-label" for="export-content">Content</label>
			<select
				id="export-content"
				name="content"
				class="ed-select"
				bind:value={exportContent}
				onchange={() => {
					// Stories are markdown-only. Map defaults to PNG. Everything
					// else that isn't log/everything/map is JSON.
					if (exportContent === 'stories') exportFormat = 'md';
					else if (exportContent === 'map') exportFormat = 'png';
					else if (exportContent !== 'everything' && exportContent !== 'log') exportFormat = 'json';
				}}
			>
				<option value="everything">Everything</option>
				<option value="character">Current Character</option>
				<option value="all-characters">All Characters</option>
				<option value="log">Session Log</option>
				<option value="stories">Stories</option>
				<option value="communities">Connections</option>
				<option value="expeditions">Expeditions</option>
				<option value="map">Campaign Map</option>
			</select>
		</div>
		{#if exportContent === 'everything' || exportContent === 'log'}
			<div class="ed-field">
				<span class="ed-label">Format</span>
				<div class="ed-seg" role="group">
					<button
						class="ed-seg-btn"
						class:active={exportFormat === 'json'}
						onclick={() => (exportFormat = 'json')}>JSON</button
					>
					<button
						class="ed-seg-btn"
						class:active={exportFormat === 'md'}
						onclick={() => (exportFormat = 'md')}>Markdown</button
					>
				</div>
			</div>
		{:else if exportContent === 'map'}
			<div class="ed-field">
				<span class="ed-label">Format</span>
				<div class="ed-seg" role="group">
					<button
						class="ed-seg-btn"
						class:active={exportFormat === 'png'}
						onclick={() => (exportFormat = 'png')}>PNG</button
					>
					<button
						class="ed-seg-btn"
						class:active={exportFormat === 'json'}
						onclick={() => (exportFormat = 'json')}>JSON</button
					>
				</div>
			</div>
		{/if}
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
		transition:
			color 0.15s,
			border-color 0.15s;
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
		transition:
			background 0.1s,
			color 0.1s;
	}
	.menu-item:hover {
		background: var(--bg-hover);
		color: var(--text);
	}
	.menu-item--link {
		display: block;
		width: 100%;
		box-sizing: border-box;
		font-family: var(--font-ui);
		font-size: 0.78rem;
		font-weight: 400;
		letter-spacing: normal;
		text-transform: none;
		color: var(--text-muted);
	}
	.menu-item--link:hover {
		background: var(--bg-hover);
		color: var(--text);
		text-decoration: none;
		filter: none;
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
		box-shadow:
			0 12px 40px #00000060,
			0 0 0 1px var(--border-mid);
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
		gap: 8px;
		padding: 10px 14px 9px;
		border-bottom: 1px solid var(--border);
		background: var(--bg-control);
		border-radius: 8px 8px 0 0;
		cursor: grab;
		user-select: none;
	}
	.ed-header:active {
		cursor: grabbing;
	}

	.ed-title {
		font-family: var(--font-display);
		font-size: calc(0.78rem * var(--font-display-scale));
		font-weight: var(--font-display-weight);
		font-variant: var(--font-display-variant);
		letter-spacing: 0.08em;
		text-transform: var(--font-display-transform);
		color: var(--text-accent);
		flex: 1;
	}

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
		transition:
			background 0.12s,
			color 0.12s;
	}
	.ed-seg-btn:last-child {
		border-right: none;
	}
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
</style>
