<script lang="ts">
	/**
	 * MapLayersMenu — the campaign map's Layers popover, behind a toolbar
	 * button. It lists the active map's marker layers, the default layer
	 * first: show or hide each (a hidden layer's markers aren't drawn, and
	 * can't be picked), pick the one new markers go on (the highlighted
	 * row), rename one (the pen, or a double-click on its name), and delete
	 * one — its markers move to the default layer, so nothing is lost. "New
	 * layer" adds one and names it straight away. The default layer is
	 * always there and can't be deleted.
	 *
	 * Layers live in the map's settings, so the list and what's shown are
	 * the same on every device. The button reads as filtered while any
	 * layer is hidden. A bits-ui Popover, portalled to the body like the
	 * colour picker's, so the map dialog's overflow can't clip it.
	 */
	import { tick } from 'svelte';
	import { Popover } from 'bits-ui';
	import { tooltip } from '$lib/actions/tooltip.js';
	import {
		DEFAULT_LAYER_ID,
		type MapLayer,
		activeLayerId,
		addLayer,
		deleteLayer,
		mapLayers,
		mapState,
		markerLayerId,
		renameLayer,
		setActiveLayer,
		setLayerHidden,
	} from '$lib/mapStore.svelte.js';
	import layersSvg from '$icons/layer-group.svg?raw';
	import newLayerSvg from '$icons/new-layer.svg?raw';
	import eyeSvg from '$icons/eye-solid.svg?raw';
	import eyeSlashSvg from '$icons/eye-slash-solid.svg?raw';
	import penSvg from '$icons/pen-to-square-solid.svg?raw';
	import trashSvg from '$icons/trash-solid.svg?raw';
	import ConfirmDialog from './ConfirmDialog.svelte';

	let open = $state(false);
	const layers = $derived(mapLayers());
	const active = $derived(activeLayerId());
	const anyHidden = $derived(layers.some((l) => l.hidden));
	/** How many markers are on each layer, by id. */
	const counts = $derived.by(() => {
		const c: Record<string, number> = {};
		for (const m of mapState.markers) {
			const id = markerLayerId(m);
			c[id] = (c[id] ?? 0) + 1;
		}
		return c;
	});

	/** The layer being renamed, and its name field. */
	let renaming = $state<string | null>(null);
	let nameInput = $state<HTMLInputElement | null>(null);

	/** The non-default layer awaiting a delete confirmation. */
	let pendingDelete = $state<MapLayer | null>(null);
	let deleteConfirmRef = $state<{ open(): void; close(): void } | null>(null);
	function askDelete(l: MapLayer) {
		pendingDelete = l;
		deleteConfirmRef?.open();
	}
	function confirmDelete() {
		if (pendingDelete) deleteLayer(pendingDelete.id);
		pendingDelete = null;
	}

	// Picking a layer as the active one closes the popover — a plain menu
	// choice. Hide/show, rename and delete all leave it open. A double-
	// click on the name renames instead, so the close is deferred a beat
	// and the dblclick handler cancels it (an instant close would unmount
	// the row before the second click could land).
	let selectCloseTimer = $state<ReturnType<typeof setTimeout> | null>(null);
	function selectLayer(id: string) {
		setActiveLayer(id);
		if (selectCloseTimer) clearTimeout(selectCloseTimer);
		selectCloseTimer = setTimeout(() => {
			open = false;
			selectCloseTimer = null;
		}, 220);
	}
	function renameFromName(id: string) {
		if (selectCloseTimer) {
			clearTimeout(selectCloseTimer);
			selectCloseTimer = null;
		}
		void startRename(id);
	}
	async function startRename(id: string) {
		renaming = id;
		await tick();
		nameInput?.focus();
		nameInput?.select();
	}
	function commitRename() {
		if (!renaming) return;
		renameLayer(renaming, nameInput?.value ?? '');
		renaming = null;
	}
	function onNameKey(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			commitRename();
		} else if (e.key === 'Escape') {
			// Back out of the rename, not the whole popover.
			e.preventDefault();
			e.stopPropagation();
			renaming = null;
		}
	}
	function newLayer() {
		void startRename(addLayer(`Layer ${layers.length}`));
	}
	// A rename left open when the popover closes is kept.
	$effect(() => {
		if (!open) commitRename();
	});
</script>

<Popover.Root bind:open>
	<Popover.Trigger>
		{#snippet child({ props })}
			<button
				{...props}
				type="button"
				class="mp-btn mp-btn-icon ml-trigger"
				class:ml-trigger--filtered={anyHidden}
				use:tooltip={anyHidden
					? 'Layers — some are hidden'
					: 'Layers — show, hide and add marker layers'}
				aria-label="Layers">{@html layersSvg}</button
			>
		{/snippet}
	</Popover.Trigger>
	<Popover.Portal>
		<Popover.Content
			class="ml-popover"
			side="bottom"
			align="end"
			sideOffset={6}
			collisionPadding={8}
			onOpenAutoFocus={(e) => e.preventDefault()}
		>
			<div class="ml-head-row">
				<span class="ml-head">Layers</span>
				<button
					type="button"
					class="mp-btn mp-btn-icon ml-add"
					onclick={newLayer}
					use:tooltip={'New layer'}
					aria-label="New layer"
					><span class="mp-btn-add-plus" aria-hidden="true">+</span>{@html newLayerSvg}</button
				>
			</div>
			<ul class="ml-list">
				{#each layers as l (l.id)}
					<li class="ml-row" class:ml-row--hidden={l.hidden} class:ml-row--active={active === l.id}>
						<button
							type="button"
							class="ml-icon ml-eye"
							aria-pressed={!l.hidden}
							aria-label={l.hidden ? `Show ${l.name}` : `Hide ${l.name}`}
							use:tooltip={l.hidden ? 'Show this layer' : 'Hide this layer'}
							onclick={() => setLayerHidden(l.id, !l.hidden)}
							>{@html l.hidden ? eyeSlashSvg : eyeSvg}</button
						>
						{#if renaming === l.id}
							<input
								bind:this={nameInput}
								class="ml-name-input"
								value={l.name}
								maxlength="40"
								aria-label="Layer name"
								onkeydown={onNameKey}
								onblur={commitRename}
							/>
						{:else}
							<button
								type="button"
								class="ml-name"
								aria-pressed={active === l.id}
								use:tooltip={active === l.id
									? 'New markers go on this layer'
									: 'Put new markers on this layer'}
								onclick={() => selectLayer(l.id)}
								ondblclick={() => renameFromName(l.id)}
							>
								<span class="ml-label">{l.name}</span>
								<span class="ml-count" aria-label="{counts[l.id] ?? 0} markers"
									>{counts[l.id] ?? 0}</span
								>
							</button>
						{/if}
						<!-- Delete (non-default only) sits inboard; the rename pen is
						     always the rightmost icon, so every row's edit button lines
						     up in the same column and the Default row (no delete) still
						     reads right-aligned. -->
						{#if l.id === DEFAULT_LAYER_ID}
							<span class="ml-icon-spacer" aria-hidden="true"></span>
						{:else}
							<button
								type="button"
								class="ml-icon ml-delete"
								aria-label={`Delete ${l.name}`}
								use:tooltip={`Delete — its markers move to ${layers[0].name}`}
								onclick={() => askDelete(l)}>{@html trashSvg}</button
							>
						{/if}
						<button
							type="button"
							class="ml-icon"
							aria-label={`Rename ${l.name}`}
							use:tooltip={'Rename'}
							onclick={() => startRename(l.id)}>{@html penSvg}</button
						>
					</li>
				{/each}
			</ul>
		</Popover.Content>
	</Popover.Portal>
</Popover.Root>

<ConfirmDialog
	bind:this={deleteConfirmRef}
	title="Delete layer"
	confirmLabel="DELETE"
	onconfirm={confirmDelete}
	ondismiss={() => (pendingDelete = null)}
>
	<p class="ml-confirm-text">
		Delete <strong>{pendingDelete?.name}</strong>?
		{#if pendingDelete && (counts[pendingDelete.id] ?? 0) > 0}
			Its {counts[pendingDelete.id]} marker{(counts[pendingDelete.id] ?? 0) === 1 ? '' : 's'}
			move to <strong>{layers[0].name}</strong>.
		{/if}
	</p>
</ConfirmDialog>

<style>
	/* Portalled by bits-ui, so every selector is :global(); .ml-* is owned
	   by this component. The trigger takes the map toolbar's .mp-btn look. */
	:global(.ml-trigger--filtered) {
		color: var(--text-accent);
		border-color: var(--text-accent);
	}
	/* A card hovering above the map dialog, as the colour picker's does. */
	:global(.ml-popover) {
		display: flex;
		flex-direction: column;
		gap: 8px;
		width: min(290px, calc(100vw - 24px));
		padding: 10px;
		background: var(--bg-card);
		color: var(--text);
		border: 1px solid var(--border-mid);
		border-radius: 8px;
		box-shadow: 0 12px 32px #00000050;
		font-family: var(--font-ui);
		z-index: 200;
		outline: none;
	}
	/* Title + New-layer button share one line. */
	:global(.ml-head-row) {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}
	:global(.ml-head) {
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-dimmer);
	}
	:global(.ml-list) {
		display: flex;
		flex-direction: column;
		gap: 2px;
		margin: 0;
		padding: 0;
		list-style: none;
		max-height: min(50vh, 320px);
		overflow-y: auto;
		overscroll-behavior: contain;
	}
	:global(.ml-row) {
		display: flex;
		align-items: center;
		gap: 4px;
		border-radius: 5px;
	}
	:global(.ml-row--active) {
		background: color-mix(in srgb, var(--text-accent) 14%, transparent);
	}
	:global(.ml-icon),
	:global(.ml-icon-spacer) {
		flex: none;
		width: 28px;
		height: 28px;
	}
	:global(.ml-icon) {
		all: unset;
		box-sizing: border-box;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border-radius: 4px;
		color: var(--text-dimmer);
		cursor: pointer;
	}
	:global(.ml-icon:hover),
	:global(.ml-icon:focus-visible) {
		color: var(--text-accent);
	}
	:global(.ml-icon:focus-visible) {
		outline: 1px solid var(--text-accent);
	}
	:global(.ml-icon :is(svg)) {
		width: 14px;
		height: 14px;
		fill: currentColor;
	}
	:global(.ml-eye[aria-pressed='true']) {
		color: var(--text);
	}
	:global(.ml-delete:hover),
	:global(.ml-delete:focus-visible) {
		color: var(--text-danger, #c0392b);
	}
	:global(.ml-name) {
		all: unset;
		box-sizing: border-box;
		flex: 1;
		min-width: 0;
		display: flex;
		/* The marker count sits on the layer name's text baseline (they are
		   different sizes), rather than being centre-aligned, so the number
		   reads as part of the same line. */
		align-items: baseline;
		gap: 6px;
		padding: 4px 6px;
		border-radius: 4px;
		cursor: pointer;
		font-size: 0.86rem;
	}
	:global(.ml-name:focus-visible) {
		outline: 1px solid var(--text-accent);
	}
	:global(.ml-row--active .ml-name) {
		font-weight: 700;
	}
	/* A hidden layer is already signalled by the dimmed row and the
	   eye-slash icon, so the name just dims — no strikethrough. */
	:global(.ml-row--hidden .ml-label) {
		color: var(--text-dimmer);
	}
	:global(.ml-label) {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	:global(.ml-count) {
		flex: none;
		font-size: 0.72rem;
		color: var(--text-dimmer);
	}
	:global(.ml-name-input) {
		flex: 1;
		min-width: 0;
		padding: 3px 6px;
		font: inherit;
		font-size: 0.86rem;
		color: var(--text);
		background: var(--bg-input, var(--bg-card));
		border: 1px solid var(--text-accent);
		border-radius: 4px;
	}
	/* Same chrome as the toolbar's add-marker button (.mp-btn .mp-btn-icon,
	   global from MapDialog): a "+" beside the layer glyph. Only the + /
	   icon gap is ours. */
	:global(.ml-add) {
		gap: 3px;
	}
	/* Delete-confirm body (ConfirmDialog is portalled → :global). */
	:global(.ml-confirm-text) {
		margin: 0;
		font-size: 0.82rem;
		line-height: 1.5;
		color: var(--text-muted);
	}
</style>
