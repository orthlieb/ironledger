<script lang="ts">
	/**
	 * HamburgerMenu — three-bar dropdown in the title bar.
	 * Items: About, Settings, Import, Export, Report a bug, Admin (admins
	 * only), Sign Out.
	 *
	 * The dropdown itself is bits-ui DropdownMenu; the Export item opens
	 * <ExportDialog> (the comprehensive multi-select picker). Export /
	 * Import actions are dispatched as CustomEvents on document so the
	 * home page can handle them with access to the entity stores — Export
	 * carries the dialog's `selection` object.
	 */

	import { DropdownMenu } from 'bits-ui';
	import ExportDialog from './ExportDialog.svelte';
	import type { ExportSelection } from '$lib/exportSelection.js';
	import { viewMode, setViewMode, VIEW_MODES, type ViewMode } from '$lib/viewModeStore.svelte.js';
	import { onMount } from 'svelte';

	// The View submenu is only meaningful on desktop / tablet — mobile
	// (<900 px) always renders the tabs layout regardless of stored
	// preference, so the picker is hidden below that width. Tracked as
	// live state via matchMedia so a resize toggles visibility without
	// a page reload.
	let isDesktopOrTablet = $state(false);
	onMount(() => {
		const mql = window.matchMedia('(min-width: 900px)');
		const update = () => (isDesktopOrTablet = mql.matches);
		update();
		mql.addEventListener('change', update);
		return () => mql.removeEventListener('change', update);
	});

	const VIEW_LABELS: Record<ViewMode, string> = {
		grid: 'Grid',
		log: 'Log',
		tabs: 'Tabs',
	};

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
	// Hidden form the "Sign Out" item programmatically submits so the
	// POST + CSRF flow that /logout expects still runs — bits-ui menu
	// items don't render as <form> submitters themselves.
	let logoutFormEl = $state<HTMLFormElement | null>(null);

	function dispatch(action: string, detail: Record<string, unknown> = {}) {
		document.dispatchEvent(new CustomEvent('il-menu-action', { detail: { action, ...detail } }));
	}

	function openExportDialog() {
		// setTimeout so bits-ui finishes its own close-and-return-focus
		// cycle before we open the dialog — otherwise the dialog opens
		// and the trigger tries to steal focus back on the same tick.
		setTimeout(() => (exportDialogOpen = true), 0);
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

			<!-- View submenu — desktop/tablet only (mobile always renders
			     the tabs layout, so a picker there would be meaningless).
			     Uses bits-ui DropdownMenu.Sub; the active mode is marked
			     with a leading ✓. -->
			{#if isDesktopOrTablet}
				<DropdownMenu.Sub>
					<DropdownMenu.SubTrigger class="hm-item hm-item--sub">
						View
						<span class="hm-sub-arrow" aria-hidden="true">▸</span>
					</DropdownMenu.SubTrigger>
					<DropdownMenu.SubContent class="hm-menu hm-submenu" sideOffset={4}>
						{#each VIEW_MODES as m (m)}
							<DropdownMenu.Item class="hm-item hm-item--radio" onSelect={() => setViewMode(m)}>
								<span class="hm-check" aria-hidden="true">{viewMode.mode === m ? '✓' : ''}</span>
								{VIEW_LABELS[m]}
							</DropdownMenu.Item>
						{/each}
					</DropdownMenu.SubContent>
				</DropdownMenu.Sub>
			{/if}

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

<ExportDialog
	bind:open={exportDialogOpen}
	onexport={(sel: ExportSelection) => dispatch('export', { selection: sel })}
/>

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

	/* Submenu trigger — same row look as regular hm-item, with a
	   trailing ▸ chevron so it reads as "has children". */
	:global(.hm-item--sub) {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}
	:global(.hm-sub-arrow) {
		font-size: 0.7rem;
		color: var(--text-dimmer);
		flex-shrink: 0;
	}
	:global(.hm-item--sub[data-highlighted] .hm-sub-arrow) {
		color: var(--text-accent);
	}

	/* Radio-style rows inside a submenu — leading ✓ column keeps
	   labels aligned whether or not this row is the active one. */
	:global(.hm-item--radio) {
		display: grid;
		grid-template-columns: 14px 1fr;
		align-items: center;
		gap: 6px;
	}
	:global(.hm-check) {
		font-size: 0.8rem;
		color: var(--text-accent);
		text-align: center;
		line-height: 1;
	}

	.hm-logout-form {
		display: none;
	}
</style>
