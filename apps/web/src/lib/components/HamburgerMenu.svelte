<script lang="ts">
	/**
	 * HamburgerMenu — three-bar dropdown in the title bar.
	 * Items: About, Settings, Import, Export (with sub-options), Sign Out.
	 *
	 * Export/Import actions are dispatched as CustomEvents on `document`
	 * so the home page can handle them with access to character data.
	 */

	let {
		onSettings,
	}: {
		onSettings?: () => void;
	} = $props();

	let open = $state(false);
	let exportOpen = $state(false);

	function toggle() {
		open = !open;
		if (!open) exportOpen = false;
	}
	function close() {
		open = false;
		exportOpen = false;
	}

	function dispatch(action: string, detail: Record<string, string> = {}) {
		document.dispatchEvent(new CustomEvent('il-menu-action', { detail: { action, ...detail } }));
		close();
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

			<button class="menu-item" onclick={() => dispatch('import')}>Import...</button>

			<button class="menu-item menu-item--parent" onclick={() => (exportOpen = !exportOpen)}
				aria-expanded={exportOpen}>
				Export
				<span class="menu-chevron">{exportOpen ? '▾' : '▸'}</span>
			</button>

			{#if exportOpen}
				<div class="menu-sub">
					<span class="menu-sub-heading">JSON</span>
					<button class="menu-item menu-item--sub" onclick={() => dispatch('export', { content: 'character', format: 'json' })}>Current Character</button>
					<button class="menu-item menu-item--sub" onclick={() => dispatch('export', { content: 'all-characters', format: 'json' })}>All Characters</button>
					<button class="menu-item menu-item--sub" onclick={() => dispatch('export', { content: 'log', format: 'json' })}>Session Log</button>
					<button class="menu-item menu-item--sub" onclick={() => dispatch('export', { content: 'communities', format: 'json' })}>Communities</button>

					<span class="menu-sub-heading">Markdown</span>
					<button class="menu-item menu-item--sub" onclick={() => dispatch('export', { content: 'character', format: 'md' })}>Current Character</button>
					<button class="menu-item menu-item--sub" onclick={() => dispatch('export', { content: 'all-characters', format: 'md' })}>All Characters</button>
					<button class="menu-item menu-item--sub" onclick={() => dispatch('export', { content: 'log', format: 'md' })}>Session Log</button>
					<button class="menu-item menu-item--sub" onclick={() => dispatch('export', { content: 'communities', format: 'md' })}>Communities</button>
				</div>
			{/if}

			<div class="menu-divider"></div>

			<form method="POST" action="/logout" class="menu-form">
				<button type="submit" class="menu-item menu-item--danger">Sign Out</button>
			</form>
		</div>
	{/if}
</div>

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
		min-width: 180px;
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

	.menu-item--sub {
		padding-left: 24px;
		font-size: 0.74rem;
	}

	.menu-chevron {
		font-size: 0.6rem;
		color: var(--text-dimmer);
	}

	.menu-divider {
		height: 1px;
		background: var(--border);
		margin: 4px 8px;
	}

	.menu-sub {
		display: flex;
		flex-direction: column;
	}

	.menu-sub-heading {
		font-family: var(--font-ui);
		font-size: 0.62rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--text-dimmer);
		padding: 6px 14px 2px;
	}

	.menu-form {
		display: contents;
	}
</style>
