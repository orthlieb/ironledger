<script lang="ts">
	/**
	 * MapDialog — annotate an uploaded map with hex-pinned markers.
	 *
	 * A user-uploaded background image sits under a translucent hex grid.
	 * Clicking a hex places a marker (or selects the existing one) and the
	 * selection toolbar at the top switches to edit its label, icon, color
	 * and optional entity link. Every field auto-saves through the shared
	 * `updateMarker()` optimistic pipeline — no explicit Save/Cancel.
	 *
	 * Layout: three SVG layers stacked in <svg> render order:
	 *   1. background <image> (fit preserving aspect ratio via
	 *      preserveAspectRatio="xMidYMid meet"; letterbox falls onto the
	 *      dialog's own background colour).
	 *   2. hex grid — every cell is one <polygon>, translucent stroke, no
	 *      fill. Click handler opens or selects a marker.
	 *   3. marker layer — icon (colored fill) + optional label, positioned
	 *      at the hex centre.
	 *
	 * Icon vocabulary comes from apps/web/static/map/<category>/<slug>.svg,
	 * indexed at build time into $lib/generated/mapIconManifest. See
	 * scripts/build-map-icons.mjs and vite.config.ts. New markers get the
	 * default icon+color; users override via the selection toolbar's
	 * "Change icon…" nested picker dialog.
	 *
	 * Follows CLAUDE.md's iOS-safe dialog rules: `vh` (not `dvh`), centred
	 * via top:50%+transform, no `display: flex` on the dialog itself,
	 * max-height on the scrollable body with overscroll-behavior: contain.
	 */

	import { headingText } from '$lib/fontStore.svelte.js';
	import DialogHeader from './DialogHeader.svelte';
	import ConfirmDialog from './ConfirmDialog.svelte';
	import MapOptionsDialog from './MapOptionsDialog.svelte';
	import { mapSettings, persistMapSettings } from '$lib/mapSettingsStore.svelte.js';
	import iconTrashSvg from '$icons/trash-solid-full.svg?raw';
	import iconGearSvg from '$icons/gear-solid-full.svg?raw';
	import { tooltip } from '$lib/actions/tooltip.js';
	import {
		DEFAULT_MARKER_COLOR,
		DEFAULT_MARKER_ICON,
		MARKER_COLOR_PRESETS,
		resolveMapIcon,
	} from '$lib/mapConstants.js';
	import {
		MAP_ICON_CATEGORIES,
		MAP_ICON_LIST,
		type MapIcon,
	} from '$lib/generated/mapIconManifest.js';
	import { axialToPx, hexPolygonPoints } from '$lib/mapGeometry.js';
	import { MAP_COLS, MAP_ROWS } from '$lib/mapConstants.js';
	import {
		mapState,
		markersAt,
		addMarker,
		updateMarker,
		removeMarker,
		setBackground,
		clearMap,
		clearMarkers,
		hasAnyContent,
		initMap,
		backgroundUrl,
		persistSettings,
	} from '$lib/mapStore.svelte.js';
	import { downscaleImage, MapImageError } from '$lib/mapImage.js';
	import { exportMapPng, exportMapJson } from '$lib/mapExport.js';
	import { getLinkableEntities, resolveEntity } from '$lib/mapEntityLinks.js';

	let dialogEl = $state<HTMLDialogElement | null>(null);
	let clearDialogRef = $state<{ open(): void; close(): void } | null>(null);
	let clearMarkersDialogRef = $state<{ open(): void; close(): void } | null>(null);
	let optionsDialogRef = $state<{ open(): void; close(): void } | null>(null);
	let iconDialogEl = $state<HTMLDialogElement | null>(null);
	let fileInputEl = $state<HTMLInputElement | null>(null);
	let uploadError = $state('');
	let iconSearch = $state('');

	/** Legacy alias — `showLabels` was a local `$state` until labels moved
	 *  into `mapSettings`. Retained as a `$derived` so the exportMapPng
	 *  argument and the marker-label template guard both keep reading
	 *  `showLabels` without churn. */
	const showLabels = $derived(mapSettings.labels.visible);

	/** Id of the selected marker (null = nothing selected). Deriving the
	 *  live marker record from the store keeps every field auto-current
	 *  even if another surface mutates the array. */
	let selectedMarkerId = $state<string | null>(null);
	const selectedMarker = $derived(
		selectedMarkerId ? (mapState.markers.find((m) => m.id === selectedMarkerId) ?? null) : null,
	);

	export function open() {
		void initMap();
		dialogEl?.showModal();
	}
	export function close() {
		dialogEl?.close();
	}

	let svgEl = $state<SVGSVGElement | null>(null);
	let canvasEl = $state<HTMLDivElement | null>(null);

	function handleExportPng() {
		if (!svgEl) return;
		void exportMapPng(svgEl, showLabels);
	}
	function handleExportJson() {
		exportMapJson({
			markers: mapState.markers,
			backgroundHash: mapState.backgroundHash,
			backgroundUrl: backgroundUrl(),
		});
	}

	/**
	 * Sizing model: the background image is the star. We fix its aspect
	 * to a canonical MAP_COLS × MAP_ROWS at the current dynamic hex size,
	 * then scale that hex size so the image fills the canvas with at
	 * least a half-hex margin on every side. Whichever axis has extra
	 * space beyond the minimum gets more margin — either way the hex
	 * grid fills the entire canvas.
	 *
	 * Marker alignment: `axialToPx(q, r, dynamicHexSize)` uses the same
	 * hex size the image scales to, so a marker at axial (3, 2) always
	 * lands on the same pixel of the image regardless of dialog size or
	 * device.
	 */
	let canvasPxW = $state(800);
	let canvasPxH = $state(560);

	$effect(() => {
		if (!canvasEl) return;
		const ro = new ResizeObserver((entries) => {
			for (const e of entries) {
				const r = e.contentRect;
				if (r.width > 0) canvasPxW = r.width;
				if (r.height > 0) canvasPxH = r.height;
			}
		});
		ro.observe(canvasEl);
		return () => ro.disconnect();
	});

	/**
	 * Dynamic hex size in SVG user units (= canvas pixels since viewBox
	 * is pixel-space). Chosen so a MAP_COLS × MAP_ROWS hex grid plus a
	 * half-hex margin on every side fits the canvas — max size while
	 * respecting the minimum border.
	 *
	 * Solve for s in:
	 *   canvasPxW ≥ (MAP_COLS + 1) · √3 · s  →  s ≤ pxW / ((MAP_COLS+1)√3)
	 *   canvasPxH ≥ (MAP_ROWS + 1) · 1.5 · s →  s ≤ pxH / ((MAP_ROWS+1)·1.5)
	 * Take the min so both constraints hold; the other axis has extra.
	 */
	const dynamicHexSize = $derived.by(() => {
		const sW = canvasPxW / (Math.sqrt(3) * (MAP_COLS + 1));
		const sH = canvasPxH / (1.5 * (MAP_ROWS + 1));
		return Math.max(1, Math.min(sW, sH));
	});

	/**
	 * viewBox is pixel-space matching the canvas — 1:1 mapping between
	 * SVG user units and CSS pixels. No aspect-ratio letterbox because
	 * viewBox == canvas exactly on every resize.
	 */
	const vb = $derived({ x: 0, y: 0, w: canvasPxW, h: canvasPxH });

	/**
	 * Background image rectangle, centered in the canvas. Its size is
	 * `MAP_COLS × MAP_ROWS` hexes at the current dynamic hex size, so a
	 * marker at axial (q, r) is always at the same fraction of the image
	 * regardless of dialog size — image scales with the hexes.
	 */
	const imageBounds = $derived.by(() => {
		const s = dynamicHexSize;
		const w = MAP_COLS * Math.sqrt(3) * s;
		const h = MAP_ROWS * 1.5 * s;
		return {
			x: (canvasPxW - w) / 2,
			y: (canvasPxH - h) / 2,
			w,
			h,
		};
	});

	/**
	 * Pixel offset applied to the hex grid group so axial (0, 0) — the
	 * pixel that axialToPx(0, 0) reports as (0, 0) — lands one-half-hex
	 * inset from the image's top-left corner. Every marker's axial
	 * position then falls on the image at the same fraction, no matter
	 * how the canvas resizes.
	 */
	const hexOffset = $derived.by(() => {
		const s = dynamicHexSize;
		return {
			x: imageBounds.x + (Math.sqrt(3) * s) / 2,
			y: imageBounds.y + s,
		};
	});

	/**
	 * Enough cells to cover the entire viewBox — including negative
	 * axial coords for the margin around the image. `allCells` starts
	 * at (0, 0) so we can't reuse it; iterate a computed range instead
	 * with the same per-row q-offset that keeps rectangle sides straight.
	 */
	const cells = $derived.by(() => {
		const s = dynamicHexSize;
		const hexW = Math.sqrt(3) * s;
		const hexH = 1.5 * s;
		// Extra rings of hexes to cover the image-to-canvas margin area
		// (image is centered, so both sides need equal border coverage).
		const marginCols = Math.ceil(imageBounds.x / hexW) + 1;
		const marginRows = Math.ceil(imageBounds.y / hexH) + 1;
		const colStart = -marginCols;
		const colEnd = MAP_COLS + marginCols;
		const rowStart = -marginRows;
		const rowEnd = MAP_ROWS + marginRows;
		const out: { q: number; r: number }[] = [];
		for (let r = rowStart; r < rowEnd; r++) {
			const offset = Math.floor(r / 2);
			for (let q = colStart - offset; q < colEnd - offset; q++) {
				out.push({ q, r });
			}
		}
		return out;
	});

	const markerCount = $derived(mapState.markers.length);

	// ─── Zoom + pan ────────────────────────────────────────────────────────────
	// The SVG's viewBox is fixed at canvas dimensions; zoom scales its
	// rendered pixel size and the canvas div's `overflow: auto` handles
	// the pan. Zoom multiplier persists server-side (per map); scroll
	// position persists in localStorage (per device — a portrait phone
	// and a landscape desktop don't want to share a scroll offset).
	/** Minimum zoom is 1.0 (fit-to-canvas) — zooming out beyond that
	 *  would shrink the map inside the canvas with no useful gain, so
	 *  the toolbar's `−` and Ctrl+wheel both cap here. */
	const MIN_ZOOM = 1;
	const MAX_ZOOM = 4;
	function clampZoom(z: number): number {
		return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
	}

	let zoom = $state(1);

	/** SVG rendered pixel size — canvas dims × zoom. viewBox stays
	 *  0 0 canvasPxW canvasPxH so a zoom = 2 SVG renders internally at 2×
	 *  its viewBox, visually enlarging everything (hexes, image, markers,
	 *  scale bar, border) in lockstep. */
	const svgWidth = $derived(canvasPxW * zoom);
	const svgHeight = $derived(canvasPxH * zoom);

	/** Load the server's saved zoom once on init, then never again. */
	let hydratedZoom = false;
	$effect(() => {
		if (hydratedZoom) return;
		if (!mapState.loaded) return;
		const saved = mapState.settings.view?.zoom;
		if (typeof saved === 'number' && saved > 0) zoom = clampZoom(saved);
		hydratedZoom = true;
	});

	/** Restore the local pan fraction once the SVG has grown big enough to
	 *  be scrollable. Runs at most once per dialog open. */
	let restoredPan = false;
	$effect(() => {
		if (restoredPan) return;
		if (!canvasEl) return;
		if (!mapState.loaded) return;
		const maxX = canvasEl.scrollWidth - canvasEl.clientWidth;
		const maxY = canvasEl.scrollHeight - canvasEl.clientHeight;
		if (maxX <= 0 && maxY <= 0) return; // not scrollable yet
		canvasEl.scrollLeft = Math.max(0, maxX) * (mapSettings.pan.fx ?? 0.5);
		canvasEl.scrollTop = Math.max(0, maxY) * (mapSettings.pan.fy ?? 0.5);
		restoredPan = true;
	});

	let zoomSaveTimer: ReturnType<typeof setTimeout> | null = null;
	function saveZoomSoon() {
		if (zoomSaveTimer) clearTimeout(zoomSaveTimer);
		zoomSaveTimer = setTimeout(() => {
			mapState.settings.view = { ...(mapState.settings.view ?? {}), zoom };
			void persistSettings();
		}, 400);
	}

	let panSaveTimer: ReturnType<typeof setTimeout> | null = null;
	function savePanSoon() {
		if (panSaveTimer) clearTimeout(panSaveTimer);
		panSaveTimer = setTimeout(() => {
			if (!canvasEl) return;
			const maxX = canvasEl.scrollWidth - canvasEl.clientWidth;
			const maxY = canvasEl.scrollHeight - canvasEl.clientHeight;
			mapSettings.pan.fx = maxX > 0 ? canvasEl.scrollLeft / maxX : 0.5;
			mapSettings.pan.fy = maxY > 0 ? canvasEl.scrollTop / maxY : 0.5;
			persistMapSettings();
		}, 300);
	}

	function onScroll() {
		if (!restoredPan) return; // don't stomp the restored value with the pre-restore 0/0
		savePanSoon();
	}

	/**
	 * Zoom to a specific point (in canvas viewport coords). Adjusts scroll
	 * so that the world-space pixel under the anchor stays under the anchor
	 * after the zoom — the standard "zoom to cursor" behavior.
	 */
	function zoomAround(newZoom: number, anchorX: number, anchorY: number) {
		const nz = clampZoom(newZoom);
		if (nz === zoom || !canvasEl) return;
		const worldX = canvasEl.scrollLeft + anchorX;
		const worldY = canvasEl.scrollTop + anchorY;
		const scale = nz / zoom;
		zoom = nz;
		saveZoomSoon();
		requestAnimationFrame(() => {
			if (!canvasEl) return;
			canvasEl.scrollLeft = worldX * scale - anchorX;
			canvasEl.scrollTop = worldY * scale - anchorY;
			savePanSoon();
		});
	}

	function zoomCentered(newZoom: number) {
		if (!canvasEl) {
			zoom = clampZoom(newZoom);
			saveZoomSoon();
			return;
		}
		zoomAround(newZoom, canvasEl.clientWidth / 2, canvasEl.clientHeight / 2);
	}

	function onWheel(e: WheelEvent) {
		// Ctrl/Cmd + wheel = zoom-to-cursor. Trackpad pinch on macOS/Windows
		// synthesises the exact same event (ctrlKey=true + wheel), so this
		// path also drives pinch-zoom on trackpads. Bare wheel scrolls the
		// canvas natively via `overflow: auto` and is left alone.
		if (!e.ctrlKey && !e.metaKey) return;
		e.preventDefault();
		if (!canvasEl) return;
		const rect = canvasEl.getBoundingClientRect();
		const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
		zoomAround(zoom * factor, e.clientX - rect.left, e.clientY - rect.top);
	}

	/**
	 * Wheel + trackpad-pinch handler attachment. Svelte's `onwheel={…}`
	 * shorthand adds a passive listener, and browsers ignore `preventDefault`
	 * on passive wheel events — including the ctrl+wheel events synthesised
	 * by trackpad pinch. Attach manually with `passive: false` so pinch
	 * lands on us instead of the browser's page-zoom.
	 */
	$effect(() => {
		if (!canvasEl) return;
		const el = canvasEl;
		const handler = (ev: WheelEvent) => onWheel(ev);
		el.addEventListener('wheel', handler, { passive: false });
		return () => el.removeEventListener('wheel', handler);
	});

	function zoomIn() {
		zoomCentered(zoom * 1.25);
	}
	function zoomOut() {
		zoomCentered(zoom / 1.25);
	}
	function zoomFit() {
		// "Fit" = zoom 1 (canvas exactly holds the SVG viewBox). Also
		// re-centers by resetting the fraction to (0.5, 0.5).
		zoomCentered(1);
		requestAnimationFrame(() => {
			if (!canvasEl) return;
			const maxX = canvasEl.scrollWidth - canvasEl.clientWidth;
			const maxY = canvasEl.scrollHeight - canvasEl.clientHeight;
			canvasEl.scrollLeft = Math.max(0, maxX) / 2;
			canvasEl.scrollTop = Math.max(0, maxY) / 2;
			savePanSoon();
		});
	}

	/**
	 * Scale + border overlay geometry — computed in pixel-space (viewBox
	 * matches the canvas 1:1) so both stay locked to the visible view at
	 * any dialog size. Border segments are aligned to hex column/row
	 * boundaries per the user's spec: the pattern rolls in step with the
	 * hex grid, not the canvas edge.
	 */
	const overlayGeom = $derived.by(() => {
		const s = dynamicHexSize;
		const hexW = Math.sqrt(3) * s;
		const hexH = 1.5 * s;
		const bT = Math.max(6, Math.round(s * 0.35)); // border thickness in px

		// Left vertex of q=0 hex on row 0 — anchor point for horizontal tiling.
		const xAnchor = hexOffset.x - hexW / 2;
		// Top vertex of r=0 hex — anchor for vertical tiling.
		const yAnchor = hexOffset.y - s;
		const xStart = (((xAnchor % hexW) + hexW) % hexW) - hexW; // ∈ [-hexW, 0)
		const yStart = (((yAnchor % hexH) + hexH) % hexH) - hexH;
		const xCount = Math.ceil((canvasPxW - xStart) / hexW) + 1;
		const yCount = Math.ceil((canvasPxH - yStart) / hexH) + 1;

		// Scale bar geometry — bottom-left, above the border row.
		const sb = mapState.settings.scale ?? {};
		const sbEnabled = sb.enabled === true;
		const sbSegments = sb.segments ?? 4;
		const sbPerHex = sb.perHex ?? 5;
		const sbUnit = sb.unit ?? 'miles';
		const sbSegW = hexW;
		const sbTotalW = sbSegments * sbSegW;
		const sbH = Math.max(5, Math.round(s * 0.3));
		const sbBottomMargin = 24 + bT;
		const sbLeftMargin = 20 + bT;
		return {
			hexW,
			hexH,
			bT,
			xStart,
			yStart,
			xCount,
			yCount,
			sbEnabled,
			sbSegments,
			sbPerHex,
			sbUnit,
			sbSegW,
			sbTotalW,
			sbH,
			sbX: sbLeftMargin,
			sbY: canvasPxH - sbBottomMargin - sbH,
		};
	});

	/**
	 * Hex click. Bare click on a linked marker jumps to that entity and
	 * closes the map. Shift+click always selects for editing — a modifier
	 * lets the user edit a linked marker without triggering the jump.
	 * Bare click on an unlinked hex either selects the existing marker or
	 * creates one and selects it.
	 */
	function onHexClick(q: number, r: number, ev: MouseEvent) {
		const existing = markersAt(q, r)[0];
		if (existing && !ev.shiftKey) {
			const link = resolveEntity(existing.entityId);
			if (link) {
				document.dispatchEvent(
					new CustomEvent('ironledger:focus-entity', {
						detail: { kind: link.kind, id: link.id },
					}),
				);
				close();
				return;
			}
		}
		if (existing) {
			selectedMarkerId = existing.id;
		} else {
			const id = addMarker({
				q,
				r,
				label: '',
				icon: DEFAULT_MARKER_ICON,
				color: DEFAULT_MARKER_COLOR,
			});
			selectedMarkerId = id;
		}
	}

	function clearSelection() {
		selectedMarkerId = null;
	}

	function onLabelInput(e: Event) {
		if (!selectedMarker) return;
		updateMarker(selectedMarker.id, { label: (e.target as HTMLInputElement).value });
	}

	function onColorInput(e: Event) {
		if (!selectedMarker) return;
		updateMarker(selectedMarker.id, { color: (e.target as HTMLInputElement).value });
	}

	function pickPreset(color: string) {
		if (!selectedMarker) return;
		updateMarker(selectedMarker.id, { color });
	}

	function onEntityChange(e: Event) {
		if (!selectedMarker) return;
		const v = (e.target as HTMLSelectElement).value;
		const patch: { entityId?: string; label?: string } = { entityId: v || undefined };
		// Auto-fill label from the linked entity's name when the current
		// label is blank — matches the "annotation follows the entity"
		// mental model without stomping on a name the user typed.
		if (v && !selectedMarker.label.trim()) {
			const link = resolveEntity(v);
			if (link) patch.label = link.name;
		}
		updateMarker(selectedMarker.id, patch);
	}

	function deleteSelected() {
		if (!selectedMarker) return;
		removeMarker(selectedMarker.id);
		selectedMarkerId = null;
	}

	function openIconPicker() {
		if (!selectedMarker) return;
		iconSearch = '';
		iconDialogEl?.showModal();
	}
	function closeIconPicker() {
		iconDialogEl?.close();
	}
	function pickIcon(key: string) {
		if (!selectedMarker) {
			closeIconPicker();
			return;
		}
		updateMarker(selectedMarker.id, { icon: key });
		closeIconPicker();
	}

	function iconKey(i: MapIcon): string {
		return `${i.category}/${i.slug}`;
	}

	const filteredIcons = $derived.by<Record<string, MapIcon[]>>(() => {
		const q = iconSearch.trim().toLowerCase();
		const grouped: Record<string, MapIcon[]> = {};
		for (const cat of MAP_ICON_CATEGORIES) grouped[cat] = [];
		for (const i of MAP_ICON_LIST) {
			if (
				q &&
				!i.slug.toLowerCase().includes(q) &&
				!i.label.toLowerCase().includes(q) &&
				!i.category.toLowerCase().includes(q)
			) {
				continue;
			}
			grouped[i.category]?.push(i);
		}
		// Drop empty categories so the picker doesn't render headers with
		// nothing under them when a search filter is on.
		for (const cat of Object.keys(grouped)) if (grouped[cat].length === 0) delete grouped[cat];
		return grouped;
	});

	async function handleFileChosen(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		uploadError = '';
		try {
			const dataUrl = await downscaleImage(file);
			setBackground(dataUrl);
		} catch (err) {
			uploadError = err instanceof MapImageError ? err.message : 'Failed to load image.';
		}
	}

	function triggerUpload() {
		fileInputEl?.click();
	}

	/** Icon size in SVG user units — scales with the dynamic hex so the
	 *  icon always sits comfortably inside a hex without spilling into
	 *  neighbours. ~91% of hex radius keeps the same visual weight as the
	 *  old fixed 20-unit icon at HEX_SIZE=22. */
	const ICON_SIZE = $derived(dynamicHexSize * (20 / 22));

	/**
	 * White stroke width in the source icon's viewBox units, computed so
	 * the halo lands at a consistent ~1.6 px on screen no matter whether
	 * the icon's viewBox is `0 0 24 24` or `0 0 640 640`. Paired with
	 * `paint-order="stroke"` on the wrapping <g>, this gives every icon
	 * the same white outline the marker labels use — readable over busy
	 * background maps at any icon color.
	 */
	function iconStrokeWidth(viewBox: string): number {
		const parts = viewBox.split(/\s+/).map(Number);
		const w = parts[2] || 24;
		const h = parts[3] || 24;
		return Math.min(w, h) * 0.08;
	}

	// Derive the selected marker's icon record + color for the toolbar so
	// the icon button always shows the current preview.
	const selectedIcon = $derived(selectedMarker ? resolveMapIcon(selectedMarker.icon) : undefined);
	const selectedColor = $derived(selectedMarker?.color || DEFAULT_MARKER_COLOR);
</script>

<dialog bind:this={dialogEl} class="mp-dialog" oncancel={close}>
	<DialogHeader title={headingText('Campaign Map')} onclose={close} />

	<div class="mp-toolbar">
		<div class="mp-tools">
			<button
				class="mp-btn"
				onclick={triggerUpload}
				use:tooltip={'Upload a background image (JPEG or PNG, ≤20 MB)'}>Upload image</button
			>
			<div class="mp-zoom" role="group" aria-label="Zoom controls">
				<button
					class="mp-btn mp-zoom-btn"
					onclick={zoomOut}
					disabled={zoom <= MIN_ZOOM}
					use:tooltip={'Zoom out (Ctrl/Cmd + wheel)'}
					aria-label="Zoom out">−</button
				>
				<span class="mp-zoom-label" use:tooltip={'Current zoom level. Click Fit to reset.'}
					>{Math.round(zoom * 100)}%</span
				>
				<button
					class="mp-btn mp-zoom-btn"
					onclick={zoomIn}
					disabled={zoom >= MAX_ZOOM}
					use:tooltip={'Zoom in (Ctrl/Cmd + wheel)'}
					aria-label="Zoom in">+</button
				>
				<button
					class="mp-btn"
					onclick={zoomFit}
					disabled={zoom === 1}
					use:tooltip={'Fit map to view (100%)'}
					aria-label="Fit to view">Fit</button
				>
			</div>
		</div>
		<div class="mp-tools">
			<span class="mp-count">{markerCount} marker{markerCount === 1 ? '' : 's'}</span>
			<button
				class="mp-btn"
				onclick={handleExportPng}
				disabled={!hasAnyContent()}
				use:tooltip={'Download a PNG snapshot of the map with the grid + markers baked in'}
				>Export PNG</button
			>
			<button
				class="mp-btn"
				onclick={handleExportJson}
				disabled={!hasAnyContent()}
				use:tooltip={'Download the marker list + a link to the background image as JSON'}
				>Export JSON</button
			>
			<button
				class="mp-btn mp-btn-danger"
				onclick={() => clearMarkersDialogRef?.open()}
				disabled={markerCount === 0}
				use:tooltip={'Delete every marker (keeps the background image)'}>Clear markers</button
			>
			<button
				class="mp-btn mp-btn-danger"
				onclick={() => clearDialogRef?.open()}
				disabled={!hasAnyContent()}
				use:tooltip={'Clear the background and every marker'}>Clear map</button
			>
			<button
				class="mp-btn mp-btn-icon mp-btn-gear"
				onclick={() => optionsDialogRef?.open()}
				use:tooltip={'Map options — names, hex grid, border, scale bar'}
				aria-label="Map options">{@html iconGearSvg}</button
			>
		</div>
		<input
			bind:this={fileInputEl}
			type="file"
			accept="image/*"
			hidden
			onchange={handleFileChosen}
		/>
	</div>

	<!--
		Selection toolbar. Sits above the map so it never scrolls off. Renders
		a hint when nothing is selected; switches to the marker's editable
		fields on click. Every input auto-saves via updateMarker() so there
		is no Save/Cancel — the marker is the working copy.
	-->
	<div class="mp-sel-toolbar" class:mp-sel-empty={!selectedMarker}>
		{#if selectedMarker && selectedIcon}
			<span class="mp-sel-coord" title="Hex ({selectedMarker.q}, {selectedMarker.r})"
				>({selectedMarker.q},{selectedMarker.r})</span
			>
			<input
				class="mp-sel-name"
				type="text"
				placeholder="Marker name…"
				value={selectedMarker.label}
				oninput={onLabelInput}
				use:tooltip={'Name shown under the icon on the map'}
			/>
			<button
				class="mp-sel-icon-btn"
				onclick={openIconPicker}
				use:tooltip={'Change icon'}
				aria-label="Change icon"
			>
				<svg viewBox={selectedIcon.viewBox} aria-hidden="true">
					<g fill={selectedColor}>{@html selectedIcon.inner}</g>
				</svg>
				<span class="mp-sel-icon-label">{selectedIcon.label}</span>
			</button>
			<div class="mp-sel-color-group">
				<input
					class="mp-sel-color"
					type="color"
					value={selectedColor}
					oninput={onColorInput}
					use:tooltip={'Icon color'}
					aria-label="Icon color"
				/>
				<div class="mp-sel-presets" role="group" aria-label="Preset colors">
					{#each MARKER_COLOR_PRESETS as c}
						<button
							class="mp-sel-preset"
							class:mp-sel-preset-selected={selectedColor.toLowerCase() === c.toLowerCase()}
							style="background:{c}"
							onclick={() => pickPreset(c)}
							use:tooltip={c}
							aria-label={c}
						></button>
					{/each}
				</div>
			</div>
			<select
				class="mp-sel-entity"
				value={selectedMarker.entityId ?? ''}
				onchange={onEntityChange}
				use:tooltip={'Optional link to a Community, Place, Journey or Site'}
				aria-label="Link to entity"
			>
				<option value="">— No link —</option>
				{#each getLinkableEntities() as e}
					<option value="{e.kind}:{e.id}">{e.kindPrefix} {e.kindLabel}: {e.name}</option>
				{/each}
			</select>
			<button
				class="mp-btn mp-btn-danger mp-btn-icon"
				onclick={deleteSelected}
				use:tooltip={'Delete this marker'}
				aria-label="Delete marker">{@html iconTrashSvg}</button
			>
			<button
				class="mp-btn"
				onclick={clearSelection}
				use:tooltip={'Deselect and close the editor'}
				aria-label="Close editor">Done</button
			>
		{:else}
			<span class="mp-sel-hint"
				>Click a hex to place or edit a marker. Shift-click a linked marker to edit instead of
				jumping.</span
			>
		{/if}
	</div>

	{#if uploadError}
		<div class="mp-error">{uploadError}</div>
	{/if}

	{#if selectedMarker && selectedMarker.entityId && !resolveEntity(selectedMarker.entityId)}
		<div class="mp-warn">
			Linked entity was deleted — pick a new one from the dropdown or clear the link.
		</div>
	{/if}

	<div class="mp-body">
		<!-- Wheel listener is attached manually with `passive: false` in a
		     $effect above so trackpad-pinch (ctrl+wheel) is preventable. -->
		<div class="mp-canvas" bind:this={canvasEl} onscroll={onScroll}>
			<!--
				viewBox is pixel-space matching the canvas exactly (updated
				reactively from the ResizeObserver). SVG's rendered width/
				height = canvasPxW/H × zoom, so when zoom > 1 the SVG grows
				past the canvas and .mp-canvas's overflow: auto handles the
				pan. All internal geometry (hexes, image, markers, scale
				bar, border) is unchanged — the browser scales it.
			-->
			<svg
				bind:this={svgEl}
				width={svgWidth}
				height={svgHeight}
				viewBox="{vb.x} {vb.y} {vb.w} {vb.h}"
				preserveAspectRatio="none"
				aria-label="Campaign map"
			>
				{#if mapState.backgroundHash}
					<!--
						Fixed bounds (imageBounds — never depends on gridDims) so
						a marker's (q, r) position stays put over the same map
						feature no matter how the dialog resizes or which device
						the user opens it on. The outer vb changes; this doesn't.
					-->
					<image
						x={imageBounds.x}
						y={imageBounds.y}
						width={imageBounds.w}
						height={imageBounds.h}
						href={backgroundUrl()}
						preserveAspectRatio="xMidYMid meet"
						aria-hidden="true"
						onerror={() => (mapState.backgroundHash = '')}
					/>
				{/if}

				<!--
					Hex + marker group translated so axial (0, 0) lands on the
					image's first hex — image and hexes scale together via
					dynamicHexSize, so marker positions stay aligned with map
					features at any dialog size.
				-->
				<g transform="translate({hexOffset.x} {hexOffset.y})">
					<g
						class="mp-hex-layer"
						class:mp-hex-layer-hidden={!mapSettings.hexes.visible}
						stroke-opacity={mapSettings.hexes.opacity}
					>
						{#each cells as { q, r } (`${q},${r}`)}
							{@const px = axialToPx(q, r, dynamicHexSize)}
							<!-- svelte-ignore a11y_click_events_have_key_events -->
							<polygon
								class="mp-hex"
								points={hexPolygonPoints(px.x, px.y, dynamicHexSize)}
								onclick={(ev) => onHexClick(q, r, ev)}
								role="button"
								tabindex="-1"
								aria-label={`Hex ${q}, ${r}`}
							></polygon>
						{/each}
					</g>

					{#each mapState.markers as m (m.id)}
						{@const px = axialToPx(m.q, m.r, dynamicHexSize)}
						{@const ic = resolveMapIcon(m.icon)}
						{@const color = m.color || DEFAULT_MARKER_COLOR}
						<g
							class="mp-marker"
							class:mp-marker-selected={m.id === selectedMarkerId}
							transform="translate({px.x} {px.y})"
						>
							{#if ic}
								<svg
									class="mp-marker-icon"
									x={-ICON_SIZE / 2}
									y={-ICON_SIZE / 2}
									width={ICON_SIZE}
									height={ICON_SIZE}
									viewBox={ic.viewBox}
								>
									<!--
										paint-order="stroke" draws the white halo first,
										fill on top — same trick the marker label text uses
										so the icon stays readable over any background map.
									-->
									<g
										fill={color}
										stroke="#fff"
										stroke-width={iconStrokeWidth(ic.viewBox)}
										stroke-linejoin="round"
										paint-order="stroke"
									>
										{@html ic.inner}
									</g>
								</svg>
							{:else}
								<circle
									r={ICON_SIZE / 2 - 2}
									fill={color}
									stroke="#fff"
									stroke-width="1.5"
									paint-order="stroke"
								/>
							{/if}
							{#if showLabels && m.label}
								<text class="mp-marker-label" y={ICON_SIZE / 2 + 10}>{m.label}</text>
							{/if}
						</g>
					{/each}
				</g>
				<!--
					Checkered border — locked to the visible view (canvas edges),
					aligned to hex column/row starts so segments tile in step
					with the underlying grid.
				-->
				{#if mapSettings.border.enabled}
					<g class="mp-border" aria-hidden="true">
						{#each Array(overlayGeom.xCount) as _, i (`bt-${i}`)}
							<rect
								x={overlayGeom.xStart + i * overlayGeom.hexW}
								y="0"
								width={overlayGeom.hexW}
								height={overlayGeom.bT}
								fill={i % 2 === 0 ? '#111' : '#fff'}
								stroke="#111"
								stroke-width="0.5"
							/>
						{/each}
						{#each Array(overlayGeom.xCount) as _, i (`bb-${i}`)}
							<rect
								x={overlayGeom.xStart + i * overlayGeom.hexW}
								y={canvasPxH - overlayGeom.bT}
								width={overlayGeom.hexW}
								height={overlayGeom.bT}
								fill={i % 2 === 0 ? '#fff' : '#111'}
								stroke="#111"
								stroke-width="0.5"
							/>
						{/each}
						{#each Array(overlayGeom.yCount) as _, i (`bl-${i}`)}
							<rect
								x="0"
								y={overlayGeom.yStart + i * overlayGeom.hexH}
								width={overlayGeom.bT}
								height={overlayGeom.hexH}
								fill={i % 2 === 0 ? '#111' : '#fff'}
								stroke="#111"
								stroke-width="0.5"
							/>
						{/each}
						{#each Array(overlayGeom.yCount) as _, i (`br-${i}`)}
							<rect
								x={canvasPxW - overlayGeom.bT}
								y={overlayGeom.yStart + i * overlayGeom.hexH}
								width={overlayGeom.bT}
								height={overlayGeom.hexH}
								fill={i % 2 === 0 ? '#fff' : '#111'}
								stroke="#111"
								stroke-width="0.5"
							/>
						{/each}
					</g>
				{/if}

				<!--
					Scale bar — one segment = one hex width, positioned
					bottom-left inside the border.
				-->
				{#if overlayGeom.sbEnabled}
					<g
						class="mp-scale"
						transform="translate({overlayGeom.sbX} {overlayGeom.sbY})"
						aria-hidden="true"
					>
						{#each Array(overlayGeom.sbSegments) as _, i (`ss-${i}`)}
							<rect
								x={i * overlayGeom.sbSegW}
								y="0"
								width={overlayGeom.sbSegW}
								height={overlayGeom.sbH}
								fill={i % 2 === 0 ? '#111' : '#fff'}
								stroke="#111"
								stroke-width="0.75"
							/>
						{/each}
						{#each Array(overlayGeom.sbSegments + 1) as _, i (`st-${i}`)}
							<text class="mp-scale-tick" x={i * overlayGeom.sbSegW} y={-4} text-anchor="middle"
								>{i * overlayGeom.sbPerHex}</text
							>
						{/each}
						<text
							class="mp-scale-unit"
							x={overlayGeom.sbTotalW / 2}
							y={overlayGeom.sbH + 12}
							text-anchor="middle">{overlayGeom.sbUnit === 'miles' ? 'MILES' : 'KM'}</text
						>
					</g>
				{/if}
			</svg>
		</div>
	</div>
</dialog>

<MapOptionsDialog bind:this={optionsDialogRef} />

<!--
	Icon picker — nested modal that lists every manifest icon grouped by
	category with a search filter. Live-color-previews using the currently-
	selected marker's color so users can see what they'll get.
-->
<dialog bind:this={iconDialogEl} class="mp-icon-dialog" oncancel={closeIconPicker}>
	<DialogHeader title={headingText('Choose Icon')} onclose={closeIconPicker} radius="8px 8px 0 0" />
	<div class="mp-icon-search-row">
		<input class="mp-icon-search" type="text" placeholder="Search icons…" bind:value={iconSearch} />
	</div>
	<div class="mp-icon-body">
		{#each Object.keys(filteredIcons) as cat (cat)}
			<div class="mp-icon-cat-label">{filteredIcons[cat][0].categoryLabel}</div>
			<div class="mp-icon-grid">
				{#each filteredIcons[cat] as ic (iconKey(ic))}
					{@const key = iconKey(ic)}
					<button
						class="mp-icon-tile"
						class:mp-icon-tile-selected={selectedMarker?.icon === key}
						onclick={() => pickIcon(key)}
						use:tooltip={ic.label}
						aria-label={ic.label}
					>
						<svg viewBox={ic.viewBox} aria-hidden="true">
							<g fill={selectedColor}>{@html ic.inner}</g>
						</svg>
					</button>
				{/each}
			</div>
		{/each}
		{#if Object.keys(filteredIcons).length === 0}
			<p class="mp-icon-empty">No icons match "{iconSearch}".</p>
		{/if}
	</div>
</dialog>

<ConfirmDialog
	bind:this={clearDialogRef}
	title="Clear Campaign Map?"
	confirmLabel="Clear Map"
	onconfirm={clearMap}
>
	<p
		style="font-family: var(--font-ui); font-size: 0.82rem; color: var(--text-muted); margin: 0; line-height: 1.5;"
	>
		This will remove the background image and every marker on the map. This can't be undone.
	</p>
</ConfirmDialog>

<ConfirmDialog
	bind:this={clearMarkersDialogRef}
	title="Clear All Markers?"
	confirmLabel="Clear Markers"
	onconfirm={clearMarkers}
>
	<p
		style="font-family: var(--font-ui); font-size: 0.82rem; color: var(--text-muted); margin: 0; line-height: 1.5;"
	>
		This will remove every marker on the map. The background image will be kept. This can't be
		undone.
	</p>
</ConfirmDialog>

<style>
	.mp-dialog {
		border: none;
		padding: 0;
		border-radius: 10px;
		position: fixed;
		top: 50%;
		left: 50%;
		margin: 0;
		transform: translate(-50%, -50%);
		width: min(960px, calc(100vw - 2rem));
		max-height: 88vh;
		overflow: hidden;
		background: var(--bg-card);
		color: var(--text);
		box-shadow:
			0 16px 48px #00000070,
			0 0 0 1px var(--border-mid);
		outline: none;
	}
	.mp-dialog::backdrop {
		background: #00000060;
		backdrop-filter: blur(1px);
	}

	.mp-toolbar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
		padding: 8px 14px;
		background: var(--bg-inset);
		border-bottom: 1px solid var(--border);
		flex-wrap: wrap;
	}
	.mp-tools {
		display: flex;
		gap: 8px;
		align-items: center;
	}
	.mp-count {
		font-family: var(--font-ui);
		font-size: 0.72rem;
		color: var(--text-muted);
	}
	.mp-btn {
		font-family: var(--font-ui);
		font-size: 0.72rem;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		padding: 4px 12px;
		background: var(--bg-control);
		color: var(--text-muted);
		border: 1px solid var(--border-mid);
		border-radius: 4px;
		cursor: pointer;
	}
	.mp-btn:hover:not(:disabled) {
		color: var(--text);
		border-color: var(--text-accent);
	}
	.mp-btn:disabled {
		opacity: 0.4;
		cursor: default;
	}
	/* Icon-only button variant — trash-can Delete in the selection
	   toolbar. Matches the height of the other .mp-btn buttons so the
	   toolbar row aligns cleanly. */
	.mp-btn-icon {
		padding: 4px 8px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}
	.mp-btn-icon :global(svg) {
		width: 14px;
		height: 14px;
	}
	.mp-btn-icon :global(svg path) {
		fill: currentColor;
	}
	/* Zoom control chip — minus + percentage + plus + fit, laid out
	   inline so the toolbar row stays a single band on desktop. */
	.mp-zoom {
		display: inline-flex;
		align-items: center;
		gap: 2px;
	}
	.mp-zoom-btn {
		padding: 4px 8px;
		font-size: 0.85rem;
		font-weight: 700;
		min-width: 26px;
		text-transform: none;
	}
	.mp-zoom-label {
		font-family: var(--font-mono, ui-monospace, monospace);
		font-size: 0.7rem;
		color: var(--text-muted);
		min-width: 44px;
		text-align: center;
		user-select: none;
	}

	.mp-btn-danger:not(:disabled):hover {
		color: var(--color-danger, #ef4444);
		border-color: var(--color-danger, #ef4444);
	}

	/* Selection toolbar — sits below the file/export toolbar. Shows a hint
	   when empty; the marker's editable fields when a marker is selected.
	   Wraps at narrow widths so mobile still fits every control. */
	.mp-sel-toolbar {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 14px;
		background: var(--bg-card);
		border-bottom: 1px solid var(--border);
		flex-wrap: wrap;
		font-family: var(--font-ui);
		font-size: 0.75rem;
	}
	.mp-sel-empty {
		color: var(--text-dimmer);
	}
	.mp-sel-hint {
		font-style: italic;
	}
	.mp-sel-coord {
		font-family: var(--font-mono, ui-monospace, monospace);
		font-size: 0.7rem;
		color: var(--text-dimmer);
		background: var(--bg-inset);
		padding: 2px 6px;
		border-radius: 3px;
	}
	.mp-sel-name {
		flex: 1 1 140px;
		min-width: 100px;
		padding: 5px 8px;
		font-family: var(--font-ui);
		font-size: 0.82rem;
		color: var(--text);
		background: var(--bg-control);
		border: 1px solid var(--border-mid);
		border-radius: 4px;
	}
	.mp-sel-name:focus {
		outline: none;
		border-color: var(--text-accent);
	}
	.mp-sel-icon-btn {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 3px 8px 3px 4px;
		background: var(--bg-control);
		border: 1px solid var(--border-mid);
		border-radius: 4px;
		cursor: pointer;
		color: var(--text);
		font-family: var(--font-ui);
		font-size: 0.72rem;
		max-width: 180px;
	}
	.mp-sel-icon-btn:hover {
		border-color: var(--text-accent);
	}
	.mp-sel-icon-btn svg {
		width: 22px;
		height: 22px;
		flex-shrink: 0;
	}
	.mp-sel-icon-label {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.mp-sel-color-group {
		display: inline-flex;
		align-items: center;
		gap: 4px;
	}
	.mp-sel-color {
		width: 28px;
		height: 28px;
		padding: 0;
		border: 1px solid var(--border-mid);
		border-radius: 4px;
		background: transparent;
		cursor: pointer;
	}
	.mp-sel-color::-webkit-color-swatch-wrapper {
		padding: 2px;
	}
	.mp-sel-color::-webkit-color-swatch {
		border: none;
		border-radius: 2px;
	}
	.mp-sel-presets {
		display: inline-flex;
		gap: 3px;
	}
	.mp-sel-preset {
		width: 16px;
		height: 16px;
		padding: 0;
		border: 1px solid var(--border);
		border-radius: 3px;
		cursor: pointer;
	}
	.mp-sel-preset:hover {
		transform: scale(1.15);
	}
	.mp-sel-preset-selected {
		outline: 2px solid var(--text-accent);
		outline-offset: 1px;
	}
	.mp-sel-entity {
		padding: 4px 6px;
		font-family: var(--font-ui);
		font-size: 0.75rem;
		color: var(--text);
		background: var(--bg-control);
		border: 1px solid var(--border-mid);
		border-radius: 4px;
		max-width: 180px;
	}

	.mp-error {
		font-family: var(--font-ui);
		font-size: 0.72rem;
		color: var(--color-danger, #ef4444);
		padding: 4px 14px;
		background: color-mix(in srgb, var(--color-danger, #ef4444) 8%, transparent);
	}
	.mp-warn {
		font-family: var(--font-ui);
		font-size: 0.72rem;
		color: var(--color-danger, #ef4444);
		padding: 4px 14px;
		background: color-mix(in srgb, var(--color-danger, #ef4444) 8%, transparent);
	}

	.mp-body {
		/* 16:9 aspect matches a 4K (3840 × 2160) background image, so a
		   4K upload drops in with zero letterbox. Body width tracks the
		   dialog; height is derived. `max-height` still caps the total
		   dialog well inside the CLAUDE.md 88vh iOS-safe budget so on a
		   short viewport the body clamps rather than overflowing. */
		width: 100%;
		aspect-ratio: 16 / 9;
		max-height: calc(88vh - 8rem);
		overflow: hidden;
	}
	.mp-canvas {
		width: 100%;
		height: 100%;
		box-sizing: border-box;
		/* Pan lives here: overflow: auto lets the browser handle scrolling
		   when the SVG (rendered at canvasPxW/H × zoom) is bigger than the
		   canvas. At zoom = 1 the two match exactly, no scrollbars. */
		overflow: auto;
		overscroll-behavior: contain;
		background: var(--bg-inset);
		/* Native pinch on trackpads triggers ctrl+wheel — we handle that
		   in onWheel. `touch-action: none` would break bare-wheel pan
		   which the browser handles for free, so leave it default. */
	}
	.mp-canvas svg {
		display: block;
		user-select: none;
		/* SVG's own width/height attributes drive the size — CSS shouldn't
		   stretch it or the zoom math goes sideways. */
	}

	.mp-hex {
		fill: transparent;
		/* Fully-opaque stroke color; effective visibility is controlled
		   by `stroke-opacity` on the parent `.mp-hex-layer` group (bound
		   to `mapSettings.hexes.opacity`, default 0.5). That way the
		   options-dialog opacity slider maps directly to visible
		   transparency without a baked-in multiplier. */
		stroke: var(--text);
		stroke-width: 0.8;
		cursor: pointer;
		transition:
			stroke 0.08s,
			stroke-opacity 0.08s;
	}
	.mp-hex:hover {
		/* Hover always at full opacity + accent color, ignoring the
		   layer's stroke-opacity so the highlight stays bright. */
		stroke: var(--text-accent);
		stroke-opacity: 1;
		stroke-width: 1.5;
	}
	/* "Show hex grid" toggle off — outlines vanish but hexes stay
	   clickable (pointer-events still on), and hover still highlights
	   so marker-placement remains discoverable. */
	.mp-hex-layer-hidden .mp-hex {
		stroke: transparent;
	}
	.mp-hex-layer-hidden .mp-hex:hover {
		stroke: var(--text-accent);
		stroke-opacity: 1;
	}

	/* Scale bar overlay — parchment-style black-and-white with a soft
	   drop-shadow so it reads over both light and dark map images. */
	.mp-scale-tick {
		font-family: var(--font-ui);
		font-size: 9px;
		font-weight: 600;
		fill: #111;
		paint-order: stroke fill;
		stroke: #fff;
		stroke-width: 2.5px;
		stroke-linejoin: round;
	}
	.mp-scale-unit {
		font-family: var(--font-ui);
		font-size: 8px;
		font-weight: 700;
		letter-spacing: 0.08em;
		fill: #111;
		paint-order: stroke fill;
		stroke: #fff;
		stroke-width: 2.5px;
		stroke-linejoin: round;
	}
	:global(.mp-scale rect) {
		filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.25));
	}
	:global(.mp-border rect) {
		shape-rendering: crispEdges;
	}
	/* Suppress the default focus rectangle browsers draw around a
	   role="button" polygon after click — the hover-stroke already
	   provides adequate feedback, and hex maps are pointer-driven. */
	.mp-hex:focus,
	.mp-hex:focus-visible {
		outline: none;
	}

	.mp-marker {
		pointer-events: none;
	}
	.mp-marker-selected {
		filter: drop-shadow(0 0 3px var(--text-accent));
	}
	:global(.mp-marker-icon) {
		overflow: visible;
	}
	.mp-marker-label {
		font-family: var(--font-ui);
		font-size: 8px;
		font-weight: 600;
		text-anchor: middle;
		fill: var(--text);
		paint-order: stroke fill;
		stroke: var(--bg-card);
		stroke-width: 3px;
		stroke-linejoin: round;
	}

	/* Icon picker dialog. Uses the CLAUDE.md content-sized pattern:
	   no display:flex on the dialog, max-height on the scrollable body. */
	.mp-icon-dialog {
		border: none;
		padding: 0;
		border-radius: 8px;
		position: fixed;
		top: 50%;
		left: 50%;
		margin: 0;
		transform: translate(-50%, -50%);
		width: min(720px, calc(100vw - 2rem));
		max-height: 82vh;
		overflow: hidden;
		background: var(--bg-card);
		color: var(--text);
		box-shadow:
			0 16px 48px #00000070,
			0 0 0 1px var(--border-mid);
		outline: none;
	}
	.mp-icon-dialog::backdrop {
		background: #00000060;
	}
	.mp-icon-search-row {
		padding: 8px 14px;
		background: var(--bg-inset);
		border-bottom: 1px solid var(--border);
	}
	.mp-icon-search {
		width: 100%;
		box-sizing: border-box;
		padding: 6px 10px;
		font-family: var(--font-ui);
		font-size: 0.85rem;
		color: var(--text);
		background: var(--bg-control);
		border: 1px solid var(--border-mid);
		border-radius: 4px;
	}
	.mp-icon-search:focus {
		outline: none;
		border-color: var(--text-accent);
	}
	.mp-icon-body {
		max-height: calc(82vh - 8rem);
		overflow-y: auto;
		overscroll-behavior: contain;
		padding: 8px 14px 14px;
	}
	.mp-icon-cat-label {
		font-family: var(--font-ui);
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-dimmer);
		margin: 12px 0 6px;
	}
	.mp-icon-cat-label:first-child {
		margin-top: 0;
	}
	.mp-icon-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(48px, 1fr));
		gap: 4px;
	}
	.mp-icon-tile {
		aspect-ratio: 1 / 1;
		padding: 6px;
		background: var(--bg-control);
		border: 1px solid var(--border);
		border-radius: 4px;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}
	.mp-icon-tile:hover {
		border-color: var(--text-accent);
	}
	.mp-icon-tile-selected {
		border-color: var(--text-accent);
		background: color-mix(in srgb, var(--text-accent) 12%, var(--bg-control));
	}
	.mp-icon-tile svg {
		width: 100%;
		height: 100%;
	}
	.mp-icon-empty {
		font-family: var(--font-ui);
		font-size: 0.85rem;
		color: var(--text-dimmer);
		text-align: center;
		padding: 24px 0;
	}
</style>
