<script lang="ts">
	/**
	 * MapDialog — annotate an uploaded map with grid-pinned markers.
	 *
	 * A user-uploaded background image sits under a translucent square
	 * grid. Clicking on the grid places a marker (or selects the existing
	 * one) and the selection toolbar at the top switches to edit its
	 * label, icon, color and optional entity link. Every field auto-saves
	 * through the shared `updateMarker()` optimistic pipeline — no
	 * explicit Save/Cancel.
	 *
	 * Coord system: fractional world units. viewBox is `0 0 cols rows`
	 * where each cell is 1×1 unit. Marker positions are floats in
	 * `[0, cols] × [0, rows]`. Zoom subdivides the grid by power-of-2
	 * octaves — at 200% each cell splits 2×2 (0.5 spacing), at 400% it's
	 * 4×4 (0.25) — and placement snaps to the deepest visible
	 * intersection at the current zoom.
	 *
	 * Grid + canvas shape: each map stores its aspect ratio in
	 * `settings.aspect`; `gridDimsForAspect()` derives cols × rows to hit
	 * ~200 total cells at whatever shape, and the canvas body sets its
	 * `aspect-ratio` inline from the grid's actual ratio so cells render
	 * exactly square regardless of the source image's proportions.
	 *
	 * Layout: three SVG layers inside a single `<svg>`:
	 *   1. background `<image>` filling the whole viewBox (no letterbox —
	 *      the canvas aspect matches the grid exactly).
	 *   2. grid lines — major (integer) + minor (sub-octave) with
	 *      `vector-effect="non-scaling-stroke"` so strokes stay a fixed
	 *      screen weight at any zoom.
	 *   3. click-capture `<rect>` — invisible, catches every pointer
	 *      event and forwards it to `onGridClick` (which snaps + routes
	 *      to place/select).
	 *   4. marker layer — icon (colored fill) + optional label, positioned
	 *      at fractional `(m.x, m.y)`. Markers themselves are
	 *      `pointer-events: none`; hits are resolved via `markersAt()`.
	 *
	 * Icon vocabulary comes from apps/web/static/map/<category>/<slug>.svg,
	 * indexed at build time into #lib/generated/mapIconManifest. New
	 * markers get the default icon+color; users override via the
	 * selection toolbar's "Change icon…" nested picker dialog.
	 *
	 * Follows CLAUDE.md's iOS-safe dialog rules: `vh` (not `dvh`), centred
	 * via top:50%+transform, no `display: flex` on the dialog itself,
	 * max-height on the scrollable body with overscroll-behavior: contain.
	 */

	import { headingText } from '#lib/fontStore.svelte.js';
	import DialogHeader from './DialogHeader.svelte';
	import MapOptionsDialog from './MapOptionsDialog.svelte';
	import MarkerPropertiesDialog from './MarkerPropertiesDialog.svelte';
	import { mapSettings } from '#lib/mapSettingsStore.svelte.js';
	import iconExpandSvg from '#icons/expand-solid.svg?raw';
	import iconZoomInSvg from '#icons/magnifying-glass-plus-solid.svg?raw';
	import iconZoomOutSvg from '#icons/magnifying-glass-minus-solid.svg?raw';
	import iconGearSvg from '#icons/gear-solid.svg?raw';
	import iconEditSvg from '#icons/pen-to-square-solid.svg?raw';
	import iconRulerSvg from '#icons/ruler-solid.svg?raw';
	import iconLocationDotSvg from '#icons/location-dot-solid.svg?raw';
	import iconMaximizeSvg from '#icons/maximize-solid.svg?raw';
	import iconMinimizeSvg from '#icons/minimize-solid.svg?raw';
	import xmarkSvg from '#icons/xmark-solid.svg?raw';
	import { Dialog } from 'bits-ui';
	import Combobox from '#lib/components/Combobox.svelte';
	import { pushDialog, popDialog, overlayZ, contentZ } from '#lib/dialogStack.svelte.js';
	import { tooltip } from '#lib/actions/tooltip.js';
	import { dropImage, canDropFiles } from '#lib/actions/dropImage.js';
	import { resolveMarkerIcon } from '#lib/settlementIcons.svelte.js';
	import MarkerCard from './MarkerCard.svelte';
	import MapPilePicker from './MapPilePicker.svelte';
	import {
		DEFAULT_MAP_ASPECT,
		DEFAULT_MARKER_COLOR,
		DEFAULT_MARKER_ICON,
		gridDimsForAspect,
		haloColor,
		mapGlyphInner,
		subGridOctaveForZoom,
	} from '#lib/mapConstants.js';
	import {
		formatMapDistance,
		gridLineOffsets,
		isMajorLine,
		normalizeAngle,
		polylineLength,
	} from '#lib/mapGeometry.js';
	import {
		mapState,
		mapListState,
		markersAt,
		markerScale,
		markerShown,
		markerShowsIcon,
		markerShowsLabel,
		isMarkerVisible,
		revealMarkerLayer,
		activeLayerId,
		mapLayers,
		DEFAULT_LAYER_ID,
		addMarker,
		updateMarker,
		removeMarker,
		setBackground,
		initMap,
		backgroundUrl,
		persistSettings,
		switchMap,
		createMap,
		type MapMarker,
	} from '#lib/mapStore.svelte.js';
	import { downscaleImage, MapImageError } from '#lib/mapImage.js';
	import { LABEL_SIZE_MULT, labelPlacement, labelStyleCss } from '#lib/mapLabel.js';
	import { resolveEntity } from '#lib/mapEntityLinks.js';
	import { exportMapPng } from '#lib/mapExport.js';
	import MapLayersMenu from './MapLayersMenu.svelte';

	// bits-ui Dialog open flag + Content ref. The ref is needed for:
	//   - the sizing $effect (ResizeObserver + inline style.width/height)
	//   - the keyboard handler's "is the dialog actually open?" guard
	// bits-ui exposes `bind:ref` on `Dialog.Content` for exactly this.
	let dialogOpen = $state(false);
	let stackDepth = $state(1);
	$effect(() => {
		if (!dialogOpen) return;
		stackDepth = pushDialog();
		return () => popDialog();
	});
	let dialogEl = $state<HTMLElement | null>(null);
	let optionsDialogRef = $state<{ open(): void; close(): void } | null>(null);
	let fileInputEl = $state<HTMLInputElement | null>(null);
	let uploadError = $state('');

	// Map picker chip state — Popover open/close driven by bits-ui. The
	// combobox itself lives in the template (`Popover.Root` +
	// `Command.Root`); this state just lets the pick handlers below
	// dismiss the popover after committing a choice.
	let mapPickerOpen = $state(false);
	const mapActions = [{ label: '+ New map…', value: '+ New map', onselect: pickNewMap }];
	async function pickMap(id: string) {
		mapPickerOpen = false;
		if (id === mapState.activeId) return;
		selectedMarkerId = null;
		await switchMap(id);
	}
	async function pickNewMap() {
		mapPickerOpen = false;
		const name = window.prompt('Name for the new map:', 'Untitled Map');
		if (name == null) return; // cancelled
		selectedMarkerId = null;
		try {
			await createMap({ name: name.trim() || 'Untitled Map' });
			// Chain into the background upload — the standalone Upload
			// button was removed; picking a map + its image is now one
			// gesture. setTimeout so the picker menu closes before the
			// file picker opens (some browsers otherwise steal focus).
			setTimeout(() => fileInputEl?.click(), 0);
		} catch (err) {
			mapState.error = err instanceof Error ? err.message : 'Failed to create map';
		}
	}

	/** Called by MapOptionsDialog's "Replace background image…" button
	 *  to trigger the shared background file input. */
	function triggerBackgroundUpload() {
		fileInputEl?.click();
	}

	// Marker labels are always rendered — the "Show names" toggle was
	// retired; the labels are the marker's primary annotation and
	// hiding them left users with an unreadable board of icons.

	/** Id of the selected marker (null = nothing selected). Deriving the
	 *  live marker record from the store keeps every field auto-current
	 *  even if another surface mutates the array. */
	let selectedMarkerId = $state<string | null>(null);
	const selectedMarker = $derived(
		selectedMarkerId ? (mapState.markers.find((m) => m.id === selectedMarkerId) ?? null) : null,
	);
	/** MarkerPropertiesDialog is now open ↔ closed independently of selection.
	 *  Click a marker → both selectedMarkerId + markerPropsOpen become true;
	 *  Cancel / OK / ✕ / Escape → markerPropsOpen flips false but the marker
	 *  stays selected (still outlined on the canvas). That "selected but
	 *  dialog closed" state is what enables arrow-key nudging (see the
	 *  keydown handler further down). Escape while the dialog is closed
	 *  clears the selection outright. */
	let markerPropsOpen = $state(false);

	/** The markers drawn: those whose layer is shown (MapLayersMenu). */
	const shownMarkers = $derived.by(() => mapState.markers.filter(markerShown()));
	// A selected marker whose layer is hidden goes out of the selection —
	// its card and outline with it. (The editor reveals a layer it moves a
	// marker to, so this never pulls a marker out from under it.)
	$effect(() => {
		if (selectedMarker && !markerPropsOpen && !isMarkerVisible(selectedMarker))
			selectedMarkerId = null;
	});

	/** Open the dialog. Optional `target` lets callers jump directly to a
	 *  specific map + marker — used by back-reference chips on entity
	 *  cards and by the "Open Map" button on entity-owned maps. If
	 *  `target.mapId` isn't the active map, `switchMap()` runs first;
	 *  if `target.markerId` is set, the marker becomes the selection.
	 *  All async work fires after `showModal()` so the dialog paints
	 *  immediately with whatever's currently loaded.
	 *
	 *  Empty maps (no background yet) surface an in-canvas
	 *  "Add background image" CTA — a programmatic `fileInputEl.click()`
	 *  after async awaits gets swallowed by iOS Safari because it isn't
	 *  a user-gesture-scoped click. `promptUpload` on the target is
	 *  accepted but ignored; the CTA is always available. */
	export function open(target?: { mapId?: string; markerId?: string; promptUpload?: boolean }) {
		dialogOpen = true;
		// Re-arm view restore so reopening re-applies the saved zoom/pan (the
		// canvas is recreated each open, so scroll would otherwise reset to 0).
		armViewRestore();
		// `createIfMissing: true` — this is the only entry point that reflects
		// a deliberate "open the map" gesture, so a fresh user with zero maps
		// gets a starter "My New Map" created here. Every other caller of
		// initMap() (export bridge, ExportDialog list, etc.) leaves the list
		// empty so no phantom map appears without the user pressing the map
		// button first.
		void initMap({ createIfMissing: true }).then(async () => {
			if (target?.mapId && target.mapId !== mapState.activeId) {
				await switchMap(target.mapId);
			}
			if (target?.markerId) {
				// Sent to a marker on a hidden layer: show the layer.
				const m = mapState.markers.find((mk) => mk.id === target.markerId);
				if (m) revealMarkerLayer(m);
				selectedMarkerId = target.markerId;
				markerPropsOpen = true;
			}
		});
	}
	export function close() {
		dialogOpen = false;
	}

	let svgEl = $state<SVGSVGElement | null>(null);
	let canvasEl = $state<HTMLDivElement | null>(null);

	// ─── Background image async loading ──────────────────────────────
	// Backgrounds can be several MB; the browser fetches them off the
	// main thread, but until the <image> paints the map surface sits
	// empty. Track which URL has finished loading and compare it to
	// the current URL — deriving the "loaded" flag avoids the race
	// where a `$effect` that resets a boolean fires *after* the
	// image's cached `onload` and stomps it back to false.
	let loadedBackgroundUrl = $state('');
	const currentBackgroundUrl = $derived(backgroundUrl());
	const backgroundLoaded = $derived(
		!!currentBackgroundUrl && loadedBackgroundUrl === currentBackgroundUrl,
	);

	// ─── Grid dims (from the map's aspect) ─────────────────────────────────────
	// The map stores its own aspect ratio in settings.aspect; we derive
	// grid dims from that so a portrait map gets tall-and-narrow cells and
	// a wide map gets short-and-wide. The canvas body's aspect-ratio is
	// bound to the grid's actual ratio (cols/rows), so cells render
	// perfectly square regardless of the source image's exact aspect.
	const mapAspect = $derived(mapState.settings.aspect ?? DEFAULT_MAP_ASPECT);
	const gridDims = $derived(gridDimsForAspect(mapAspect));

	// ─── Canvas pixel sizing ───────────────────────────────────────────────────
	// ResizeObserver keeps canvas dims live so the overlay SVG (scale bar)
	// stays locked to the visible view at any dialog size.
	let canvasPxW = $state(800);
	let canvasPxH = $state(560);

	$effect(() => {
		if (!canvasEl) return;
		const ro = new ResizeObserver((entries) => {
			if (!canvasEl) return;
			// Capture the pan fraction BEFORE canvasPxW/H change. When
			// the sel-toolbar band pops in/out (square-selected, placing
			// hint) the canvas shrinks/grows by the toolbar's height,
			// which re-derives svgWidth/svgHeight. Without a restore
			// step the raw scrollLeft/scrollTop point at a different
			// spot in the (now differently-sized) SVG and the viewport
			// visibly jumps — reported as "map position changed after
			// cancelling a square selection".
			const oldMaxX = Math.max(0, canvasEl.scrollWidth - canvasEl.clientWidth);
			const oldMaxY = Math.max(0, canvasEl.scrollHeight - canvasEl.clientHeight);
			const fx = oldMaxX > 0 ? canvasEl.scrollLeft / oldMaxX : 0.5;
			const fy = oldMaxY > 0 ? canvasEl.scrollTop / oldMaxY : 0.5;
			for (const e of entries) {
				const r = e.contentRect;
				if (r.width > 0) canvasPxW = r.width;
				if (r.height > 0) canvasPxH = r.height;
			}
			// Restore pan after the SVG reflows to its new pixel size.
			// RAF is enough — Svelte flushes state → derived → DOM in
			// the microtask cycle before the next frame.
			requestAnimationFrame(() => {
				if (!canvasEl) return;
				// Don't fight the initial view restore: until it has landed,
				// the fraction captured above is the pre-restore 0,0 (which
				// would re-center the map), and the dedicated pan-restore
				// effect owns positioning. Once restored, this preserves the
				// pan across container resizes (toolbar band pop, etc.).
				if (!restoredPan) return;
				const newMaxX = Math.max(0, canvasEl.scrollWidth - canvasEl.clientWidth);
				const newMaxY = Math.max(0, canvasEl.scrollHeight - canvasEl.clientHeight);
				canvasEl.scrollLeft = newMaxX * fx;
				canvasEl.scrollTop = newMaxY * fy;
			});
		});
		ro.observe(canvasEl);
		return () => ro.disconnect();
	});

	// ─── Dialog sizing: aspect-preserving "contain" fit ─────────────
	// Dialog is fixed-size (not user-resizable), computed each frame
	// from three inputs: the image aspect (gridDims cols × rows), the
	// live chrome height AHH (title + toolbar + selection toolbar +
	// optional banners), and the viewport. Fit the image inside an
	// 80% × VW × 80% × VH box using the classic contain formula:
	//
	//     MAX_IW = 0.8 × VW
	//     MAX_IH = max(0, 0.8 × VH − AHH)
	//     scale  = min(MAX_IW / PW, MAX_IH / PH)
	//     IW     = PW × scale
	//     IH     = PH × scale
	//     DW = IW,  DH = IH + AHH
	//
	// No feedback loop: writing DW/DH changes body dims (via `.mp-body
	// { width: 100%; aspect-ratio: PW/PH }`) but not AHH — the chrome
	// height is set by the toolbar contents, which don't reflow when
	// the body resizes. Recomputes on: mapAspect change, dialog
	// ResizeObserver (toolbar wraps, selection state), window resize
	// (includes device rotation on mobile — `resize` fires on
	// orientation change).
	$effect(() => {
		if (!dialogEl) return;
		if (typeof window === 'undefined') return;
		const el = dialogEl;
		const pw = gridDims.cols;
		const ph = gridDims.rows;
		if (pw <= 0 || ph <= 0) return;
		// Tracked so a fullscreen-toggle click re-runs this effect and
		// re-attaches the ResizeObserver + calls settle() with the new
		// state — the settle() early-out otherwise wouldn't fire from
		// the same-frame observer callbacks.
		void effectiveFullscreen;

		let raf: number | null = null;
		const settle = () => {
			raf = null;
			const bodyEl = el.querySelector('.mp-body') as HTMLElement | null;
			if (!bodyEl) return;
			// Fullscreen (either the desktop toggle or the mobile-forced
			// mode) drops the aspect-preserving px sizing — the CSS
			// variant `.mp-dialog--fullscreen` takes over with
			// `width: 100vw; height: 100dvh`. Clear whatever inline
			// dims a previous non-fullscreen frame left behind so the
			// CSS isn't fighting a stale `style="width: 640px..."`.
			if (effectiveFullscreen) {
				if (el.style.width) el.style.width = '';
				if (el.style.height) el.style.height = '';
				return;
			}
			const ahh = bodyEl.offsetTop;
			if (ahh < 0) return;
			// Give phone-width viewports more room — a fixed-aspect map at
			// 80vw × 80vh leaves too much bezel around it on a 400 px
			// wide screen. Desktop keeps 80 % so the dialog isn't
			// aggressively edge-to-edge on very large monitors.
			const isMobile = window.innerWidth <= 640;
			const fraction = isMobile ? 0.9 : 0.8;
			const maxIW = fraction * window.innerWidth;
			const maxIH = Math.max(0, fraction * window.innerHeight - ahh);
			if (maxIW <= 0 || maxIH <= 0) return;
			const scale = Math.min(maxIW / pw, maxIH / ph);
			const iw = Math.max(1, pw * scale);
			const ih = Math.max(1, ph * scale);
			const dw = Math.round(iw);
			const dh = Math.round(ih + ahh);
			if (Math.abs(dw - el.clientWidth) < 1 && Math.abs(dh - el.clientHeight) < 1) return;
			el.style.width = `${dw}px`;
			el.style.height = `${dh}px`;
		};

		const schedule = () => {
			if (raf !== null) return;
			raf = requestAnimationFrame(settle);
		};
		schedule();
		const ro = new ResizeObserver(schedule);
		ro.observe(el);
		window.addEventListener('resize', schedule);
		// Belt and braces — some mobile browsers emit
		// `orientationchange` before finishing the URL-bar reflow, so
		// listen to both.
		window.addEventListener('orientationchange', schedule);
		return () => {
			ro.disconnect();
			window.removeEventListener('resize', schedule);
			window.removeEventListener('orientationchange', schedule);
			if (raf !== null) cancelAnimationFrame(raf);
		};
	});

	// ─── Zoom + pan ────────────────────────────────────────────────────────────
	// The SVG's viewBox is fixed at world units (0 0 cols rows); zoom
	// scales its rendered pixel size and the canvas div's `overflow: auto`
	// handles the pan. Zoom multiplier persists server-side (per map);
	// scroll position persists in localStorage (per device).
	const MIN_ZOOM = 1;
	const MAX_ZOOM = 4;
	function clampZoom(z: number): number {
		return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
	}

	let zoom = $state(1);

	/** Visible sub-grid octave at the current zoom. 0 at zoom 1 (base
	 *  grid only), 1 at zoom 2 (half-cells appear), 2 at zoom 4, etc. */
	const subOctave = $derived(subGridOctaveForZoom(zoom));

	/** SVG rendered pixel size — canvas dims × zoom. viewBox stays
	 *  0 0 cols rows so at zoom = 2 the SVG renders internally at 2× its
	 *  viewBox, visually enlarging everything (image, grid, markers,
	 *  scale bar) in lockstep. */
	/**
	 * SVG pixel dimensions. In the default (aspect-fit) path the body
	 * has already been sized to the map's aspect via `.mp-body {
	 * aspect-ratio }` + the outer dialog sizing effect, so the SVG
	 * simply fills the body: `canvasPxW × zoom`.
	 *
	 * In fullscreen the body drops its aspect-ratio and grows to fill
	 * the leftover dialog space, so `canvasPxW × canvasPxH` no longer
	 * matches the map's aspect. Sizing the SVG to those raw dims would
	 * stretch the map non-uniformly (`preserveAspectRatio="none"`
	 * distorts the artwork). Instead compute a `contain`-style aspect
	 * fit: fill the smaller-relative axis, letterbox the other so the
	 * whole map is visible at its natural cell scale — labels + icons
	 * stay the same size they'd be at in non-fullscreen mode; the
	 * user just gets more of the map on screen. `.mp-canvas`'s grid
	 * centering (see the CSS block below) keeps the letterbox even on
	 * both sides.
	 */
	const svgWidth = $derived.by(() => {
		if (!effectiveFullscreen) return canvasPxW * zoom;
		const mapAspect = gridDims.cols / gridDims.rows;
		const bodyAspect = canvasPxW / canvasPxH;
		if (!Number.isFinite(mapAspect) || !Number.isFinite(bodyAspect) || bodyAspect <= 0) {
			return canvasPxW * zoom;
		}
		// Body is more portrait than the map → fill width, letterbox
		// vertically. Otherwise the body is wider → letterbox
		// horizontally by fitting the width to the map's height.
		const baseW = bodyAspect < mapAspect ? canvasPxW : canvasPxH * mapAspect;
		return baseW * zoom;
	});
	const svgHeight = $derived.by(() => {
		if (!effectiveFullscreen) return canvasPxH * zoom;
		const mapAspect = gridDims.cols / gridDims.rows;
		const bodyAspect = canvasPxW / canvasPxH;
		if (!Number.isFinite(mapAspect) || !Number.isFinite(bodyAspect) || bodyAspect <= 0) {
			return canvasPxH * zoom;
		}
		// Mirror svgWidth: body more portrait → derive height from
		// the map aspect; wider body → fill height, letterbox
		// horizontally.
		const baseH = bodyAspect < mapAspect ? canvasPxW / mapAspect : canvasPxH;
		return baseH * zoom;
	});
	/** Screen pixels per world unit inside a marker group — constant across
	 *  zoom, since the group's scale(1/zoom) cancels it. Tells mapGlyphInner
	 *  how big a marker icon really draws (small ones skip wall patterns). */
	const markerPxPerUnit = $derived(svgWidth / zoom / Math.max(1, gridDims.cols));

	// Zoom + pan are restored once per (open × active map) via these guards.
	// `armViewRestore()` re-arms them so a reopen or a map switch re-applies the
	// new context's saved view; the map-switch effect below calls it on
	// `activeId` change, and `open()` calls it on reopen.
	let hydratedZoom = false;
	let restoredPan = false;
	function armViewRestore() {
		hydratedZoom = false;
		restoredPan = false;
	}
	/** Apply the active map's saved zoom (or reset to fit when it has none). */
	$effect(() => {
		if (hydratedZoom) return;
		if (!mapState.loaded) return;
		const saved = mapState.settings.view?.zoom;
		zoom = typeof saved === 'number' && saved > 0 ? clampZoom(saved) : 1;
		hydratedZoom = true;
	});

	// Re-arm the restore whenever the active map changes so each map applies
	// its own saved zoom + pan (the guards would otherwise stick after the
	// first map and leave subsequent maps at the previous view).
	let lastRestoredMapId: string | null = null;
	$effect(() => {
		const id = mapState.activeId;
		if (id === lastRestoredMapId) return;
		lastRestoredMapId = id;
		armViewRestore();
	});

	/** Restore the saved pan fraction once the SVG has grown to its zoomed
	 *  size and the canvas is actually scrollable. Re-armed by
	 *  `armViewRestore()` on reopen / map switch.
	 *
	 *  Reading `svgWidth`/`svgHeight` (which fold in `zoom`) is load-bearing:
	 *  it makes this effect re-run *after* the zoom effect enlarges the SVG.
	 *  Without that dependency the effect fired once at fit-size — while the
	 *  2× SVG was still only scheduled to paint — measured `maxX ≈ 0`, bailed,
	 *  and never restored a zoomed-in map's scroll on reopen. The rAF then
	 *  measures `scrollWidth` after the enlarged SVG has actually painted. */
	$effect(() => {
		if (restoredPan) return;
		if (!canvasEl) return;
		if (!mapState.loaded) return;
		// Establish a reactive dependency on the zoomed content size so this
		// re-runs when `zoom` (or the canvas) grows the SVG.
		if (svgWidth <= 0 || svgHeight <= 0) return;
		const el = canvasEl;
		const pan = mapState.settings.view?.pan;
		const raf = requestAnimationFrame(() => {
			if (restoredPan || !el) return;
			const maxX = el.scrollWidth - el.clientWidth;
			const maxY = el.scrollHeight - el.clientHeight;
			if (maxX <= 0 && maxY <= 0) return; // not scrollable yet — a later run catches it
			el.scrollLeft = Math.max(0, maxX) * (pan?.fx ?? 0.5);
			el.scrollTop = Math.max(0, maxY) * (pan?.fy ?? 0.5);
			restoredPan = true;
		});
		return () => cancelAnimationFrame(raf);
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
			const fx = maxX > 0 ? canvasEl.scrollLeft / maxX : 0.5;
			const fy = maxY > 0 ? canvasEl.scrollTop / maxY : 0.5;
			// Per-map, server-persisted (co-located with zoom under settings.view)
			// so scroll survives reload/sessions and is restored per map.
			mapState.settings.view = { ...(mapState.settings.view ?? {}), pan: { fx, fy } };
			void persistSettings();
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

	// ─── Mobile pinch-zoom ─────────────────────────────────────────────────────
	// Two-finger touch on iOS/Android maps directly to zoom-around-midpoint.
	// Also cancels any pending long-press timer (a second finger = pinch, not
	// a tap-and-hold). Listeners attached with passive: false so we can call
	// preventDefault and stop the browser from page-zooming.
	let pinchStartDist = 0;
	let pinchStartZoom = 1;
	let pinchCenterX = 0;
	let pinchCenterY = 0;

	function distBetween(t1: Touch, t2: Touch): number {
		return Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
	}

	function onTouchStart(e: TouchEvent) {
		if (e.touches.length !== 2 || !canvasEl) return;
		e.preventDefault();
		cancelLongPress();
		const [t1, t2] = [e.touches[0], e.touches[1]];
		pinchStartDist = distBetween(t1, t2);
		pinchStartZoom = zoom;
		const rect = canvasEl.getBoundingClientRect();
		pinchCenterX = (t1.clientX + t2.clientX) / 2 - rect.left;
		pinchCenterY = (t1.clientY + t2.clientY) / 2 - rect.top;
	}
	function onTouchMove(e: TouchEvent) {
		if (e.touches.length !== 2 || pinchStartDist <= 0) return;
		e.preventDefault();
		const [t1, t2] = [e.touches[0], e.touches[1]];
		const currentDist = distBetween(t1, t2);
		if (currentDist <= 0) return;
		const factor = currentDist / pinchStartDist;
		zoomAround(pinchStartZoom * factor, pinchCenterX, pinchCenterY);
	}
	function onTouchEnd() {
		pinchStartDist = 0;
	}

	$effect(() => {
		if (!canvasEl) return;
		const el = canvasEl;
		const opts = { passive: false } as const;
		el.addEventListener('touchstart', onTouchStart, opts);
		el.addEventListener('touchmove', onTouchMove, opts);
		el.addEventListener('touchend', onTouchEnd);
		el.addEventListener('touchcancel', onTouchEnd);
		return () => {
			el.removeEventListener('touchstart', onTouchStart);
			el.removeEventListener('touchmove', onTouchMove);
			el.removeEventListener('touchend', onTouchEnd);
			el.removeEventListener('touchcancel', onTouchEnd);
		};
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

	// ─── Grid line geometry (major + minor at the current octave) ──────────────
	// Recomputed reactively so zooming past the next power-of-two adds a
	// finer sub-grid on the fly.
	const vLines = $derived([...gridLineOffsets(gridDims.cols, subOctave)]);
	const hLines = $derived([...gridLineOffsets(gridDims.rows, subOctave)]);

	// ─── Scale bar overlay ─────────────────────────────────────────────────────
	/**
	 * Scale bar overlay geometry — computed in pixel-space (overlay SVG
	 * viewBox matches the canvas 1:1) so it stays locked to the visible
	 * view at any dialog size.
	 *
	 * One segment = one base cell width at zoom 1. At other zoom levels,
	 * the underlying grid renders bigger/smaller than the bar, so the
	 * tick labels re-scale to keep the ruler honest — the same real-world
	 * distance always maps to the same on-screen length. `perHex` is
	 * defined at zoom 1, so effective distance per segment at the current
	 * zoom is `perHex / zoom`.
	 */
	const overlayGeom = $derived.by(() => {
		const cellW = canvasPxW / gridDims.cols;

		const sb = mapState.settings.scale ?? {};
		const sbEnabled = sb.enabled === true;
		const sbSegments = sb.segments ?? 4;
		const sbPerCellAtZoom1 = sb.perHex ?? 5;
		const sbPerSegment = sbPerCellAtZoom1 / zoom;
		const sbUnit = sb.unit ?? 'miles';
		const sbSegW = cellW;
		const sbTotalW = sbSegments * sbSegW;
		// Slim bar (~half the old height) — reads clearly at a glance
		// but stops covering marker labels near the bottom edge.
		const sbH = Math.max(3, Math.round(cellW * 0.15));
		const sbBottomMargin = 24;
		const sbLeftMargin = 20;
		return {
			sbEnabled,
			sbSegments,
			sbPerSegment,
			sbUnit,
			sbSegW,
			sbTotalW,
			sbH,
			sbX: sbLeftMargin,
			sbY: canvasPxH - sbBottomMargin - sbH,
		};
	});

	/** Format a scale-bar tick — always nearest integer. Fractional
	 *  distances (post-zoom) round to whole numbers so the ruler stays
	 *  legible in the narrow overlay space. */
	function formatScaleTick(n: number): string {
		return String(Math.round(n));
	}

	// ─── Selection + long-press ────────────────────────────────────────────────
	/**
	 * Long-press tracking for touch input. On mobile we can't shift-click,
	 * so a long-press on a linked marker forces the editor open instead of
	 * jumping to the entity — the touch equivalent of shift-click.
	 */
	const LONG_PRESS_MS = 500;
	let longPressTimer: ReturnType<typeof setTimeout> | null = null;
	let longPressFired = false;

	/** Convert a pointer event's client coords into world-unit coords via
	 *  the SVG's screen CTM. Works regardless of zoom, pan, or SVG
	 *  scaling — the browser gives us the exact transform. */
	function eventToWorld(e: PointerEvent | MouseEvent): { x: number; y: number } {
		if (!svgEl) return { x: 0, y: 0 };
		const pt = svgEl.createSVGPoint();
		pt.x = e.clientX;
		pt.y = e.clientY;
		const ctm = svgEl.getScreenCTM();
		if (!ctm) return { x: 0, y: 0 };
		const world = pt.matrixTransform(ctm.inverse());
		return { x: world.x, y: world.y };
	}

	/** Clamp world coords to the map bounds so a click just past the edge
	 *  still lands somewhere inside. Markers are no longer grid-snapped
	 *  (placement / drag / nudge all preserve the raw fractional coords)
	 *  so this is a plain box clamp — the old `snapCoord` intermediate is
	 *  gone. Hit-testing now uses `markersAt(x, y, hitTolerance)` instead
	 *  of a cell-index match. */
	function clampToBounds(coord: { x: number; y: number }): { x: number; y: number } {
		return {
			x: Math.max(0, Math.min(gridDims.cols, coord.x)),
			y: Math.max(0, Math.min(gridDims.rows, coord.y)),
		};
	}

	/** Select or jump for an existing marker. `forceEdit` bypasses the
	 *  entity-link jump and always opens the editor (used by shift-click,
	 *  long-press, and placing-mode clicks on occupied intersections). */
	/** Select the marker at (x, y) so its editor opens. A plain click always
	 *  edits now (previously a click on a linked marker jumped to its entity and
	 *  closed the map, which made linked markers hard to edit — that navigation
	 *  is an explicit "Go to" action in the editor instead). */
	/** Select the marker at (x, y). `edit=true` also opens the properties
	 *  dialog — used by double-click, shift-click, long-press, and the
	 *  external `open({ markerId })` deep-link. Bare single-clicks pass
	 *  false so the marker is only outlined; arrow keys nudge from there
	 *  and a subsequent double-click opens the editor. */
	function activateExisting(x: number, y: number, edit = false): boolean {
		const existing = markersAt(x, y, hitTolerance)[0];
		if (!existing) return false;
		selectedMarkerId = existing.id;
		if (edit) markerPropsOpen = true;
		return true;
	}

	/** Jump the home page to a marker's linked entity and close the map —
	 *  invoked from the marker card's Go To button. */
	function focusMarkerEntity(link: { kind: string; id: string }) {
		document.dispatchEvent(
			new CustomEvent('ironledger:focus-entity', { detail: { kind: link.kind, id: link.id } }),
		);
		close();
	}

	function placeAt(x: number, y: number) {
		// On the layer new markers go on — shown, if it was hidden, so the
		// new marker doesn't vanish as it's placed.
		const layer = activeLayerId();
		const id = addMarker({
			x,
			y,
			label: '',
			icon: DEFAULT_MARKER_ICON,
			color: DEFAULT_MARKER_COLOR,
			// A fresh marker shows both halves so the editor opens with the
			// icon placed and the label ready to type.
			type: 'both',
			...(layer === DEFAULT_LAYER_ID ? {} : { layer }),
		});
		revealMarkerLayer({ layer });
		selectedMarkerId = id;
		markerPropsOpen = true;
	}

	// ─── Drag-to-move + pile-up popover ────────────────────────────────────────
	/**
	 * Drag state. Populated on pointerdown when a marker sits under the
	 * click; upgraded to a live drag once the pointer has moved past
	 * `DRAG_THRESHOLD_PX`. Coords are raw fractional world units — markers
	 * no longer snap to a grid, so the drag preview follows the pointer
	 * pixel-for-pixel and the drop lands exactly where the pointer lifts
	 * (only clamped into the map bounds).
	 */
	interface DragState {
		id: string;
		startClientX: number;
		startClientY: number;
		liveX: number;
		liveY: number;
		moved: boolean;
	}
	let dragState = $state<DragState | null>(null);
	const DRAG_THRESHOLD_PX = 6;

	/** Set to true briefly after a drag ends so the pointerup-then-click
	 *  cascade doesn't re-route the drop through onGridClick. Cleared on
	 *  the next tick. */
	let dragJustEnded = false;

	/** Click-drag pan state — desktop mouse only. Armed on a pointerdown
	 *  in empty canvas (no marker hit, not placing, not measuring), then
	 *  committed after the same DRAG_THRESHOLD_PX the marker drag uses so
	 *  a static click still deselects. On commit we manipulate the
	 *  `.mp-canvas` scroll position directly — cheaper and steadier than
	 *  routing through zoom math since scroll dims don't change during a
	 *  pan. Touch is untouched: the canvas already declares
	 *  `touch-action: pan-x pan-y` and the browser handles single-finger
	 *  pan natively there.
	 *
	 *  `startScrollLeft` / `startScrollTop` snapshot the canvas scroll
	 *  offsets at pointerdown so each move re-derives the target position
	 *  from client-space delta rather than accumulating float error via
	 *  scrollBy. `active` flips true once the pointer moves past the
	 *  threshold; the `mp-canvas--panning` class it drives swaps the
	 *  cursor from `grab` to `grabbing`. */
	let panState = $state<{
		startClientX: number;
		startClientY: number;
		startScrollLeft: number;
		startScrollTop: number;
		active: boolean;
	} | null>(null);

	/**
	 * Pile-up popover — surfaces when a click lands on a snap point with
	 * more than one marker (common at low zoom where sub-cell placements
	 * from a deeper octave collapse onto the same base cell). Anchored at
	 * the click's viewport coords via `left/top` in a fixed-positioned
	 * div; a full-viewport backdrop dismisses on outside click.
	 */
	interface PilePicker {
		markers: MapMarker[];
		screenX: number;
		screenY: number;
	}
	let pilePicker = $state<PilePicker | null>(null);
	function closePilePicker() {
		pilePicker = null;
	}
	function openPilePicker(markers: MapMarker[], ev: MouseEvent) {
		pilePicker = { markers, screenX: ev.clientX, screenY: ev.clientY };
	}
	function choosePileMarker(m: MapMarker) {
		closePilePicker();
		// Pick from a pile: same as a bare single-click on the map — select
		// it, which shows its card (Go To for a linked marker lives there); a
		// follow-up double-click / shift-click / long-press opens the editor.
		selectedMarkerId = m.id;
	}

	/**
	 * Grid click. Behaviour depends on what's at the click's snap point:
	 *  • Snap point with >1 markers → open pile-up popover to disambiguate.
	 *  • Existing marker + bare click → select it and show its card (whose
	 *    Go To button jumps to a linked entity).
	 *  • Existing marker w/ shift-click → open editor.
	 *  • Empty spot → deselect any marker (placement is armed via the
	 *    toolbar "+ Marker" button can drop a marker on it. Empty clicks
	 *    never create a marker directly — a stray tap on the map would
	 *    otherwise litter it with unwanted pins.
	 *
	 * Long-press on touch (see onGridPointerDown) sets `longPressFired`;
	 * a completed drag (see onGridPointerUp) sets `dragJustEnded`. Either
	 * flag makes this a no-op so the follow-up click doesn't re-route the
	 * gesture we already handled.
	 */
	function onGridClick(ev: MouseEvent) {
		if (dragJustEnded) {
			dragJustEnded = false;
			return;
		}
		if (longPressFired) {
			longPressFired = false;
			return;
		}
		const { x, y } = clampToBounds(eventToWorld(ev));
		// Measure mode — each click extends the polyline. Skips the marker
		// hit-test entirely so a click near a pin still adds a waypoint,
		// matching the "you asked to measure, so we measure" contract.
		// Double-click commits + disarms (handled in onGridDblClick).
		if (measuring) {
			measurePoints = [...measurePoints, { x, y }];
			// Leave measureCursor as it was (null on the first tap, or the
			// last hovered position on desktop) — a pointer-move (or the
			// next tap) will refresh it. Setting it to the click coord
			// here would immediately synthesise a zero-length preview
			// segment on touch devices, where there is no hover, and the
			// distance chip would flash "0 km" on top of the first dot.
			return;
		}
		// Armed for placement — drop the marker here, exit the mode, done.
		// Skips the hit-test entirely so a click on top of an existing
		// marker while armed still creates a new one (matches the "you
		// asked to place, so we place" contract of the toolbar button).
		if (placingMarker) {
			placeAt(x, y);
			placingMarker = false;
			return;
		}
		const hits = markersAt(x, y, hitTolerance);
		if (hits.length > 1) {
			openPilePicker(hits, ev);
			return;
		}
		if (hits.length === 1) {
			// Bare click selects the marker (arrow keys nudge from here);
			// shift-click opens the editor immediately. Double-click on the
			// same marker is handled by onGridDblClick below — it fires
			// AFTER this click, so a single-click always selects first and
			// the second-click's activateExisting(_, _, edit=true) then
			// opens the dialog.
			activateExisting(x, y, ev.shiftKey);
			return;
		}
		// Empty grid click: deselect any marker. The old "highlight a snap
		// square for the + Marker button to drop onto" flow is gone —
		// placement is now armed by clicking + Marker first, then clicking
		// the map (see the placingMarker early-out above).
		selectedMarkerId = null;
	}

	/** Double-click on a marker opens the properties editor. The first
	 *  click of the sequence already ran onGridClick and set the
	 *  selection; this handler just adds the editor open. Any other
	 *  double-click (empty spot, drag-just-ended, long-press) is a
	 *  no-op — the single-click already handled the intent. */
	function onGridDblClick(ev: MouseEvent) {
		if (dragJustEnded || longPressFired) return;
		// Measure mode: double-click commits the polyline and disarms
		// the tool — the last waypoint recorded by the preceding single
		// click stays as the endpoint. Undo the accidental extra point
		// the double-click's second onGridClick queued.
		if (measuring) {
			if (measurePoints.length > 1) {
				measurePoints = measurePoints.slice(0, -1);
			}
			endMeasuring();
			return;
		}
		const { x, y } = clampToBounds(eventToWorld(ev));
		if (markersAt(x, y, hitTolerance).length >= 1) activateExisting(x, y, true);
	}

	function onGridPointerDown(e: PointerEvent) {
		// Measure mode owns the whole map surface — no marker drag arming,
		// no long-press editor, no selection reroute. A tap on a pin
		// should add a waypoint like a tap on bare terrain.
		if (measuring) return;
		// Long-press timer for touch (opens editor even on a linked marker).
		if (e.pointerType !== 'mouse') {
			longPressFired = false;
			if (longPressTimer) clearTimeout(longPressTimer);
			const { x, y } = clampToBounds(eventToWorld(e));
			longPressTimer = setTimeout(() => {
				longPressFired = true;
				longPressTimer = null;
				// Cancel any pending drag intent — long-press wins.
				dragState = null;
				activateExisting(x, y);
			}, LONG_PRESS_MS);
		}
		// Drag intent — arm if there's a marker at this snap point. We
		// only *commit* to dragging once the pointer moves past the
		// threshold, so a static tap still routes as a normal click.
		const { x, y } = clampToBounds(eventToWorld(e));
		const hit = markersAt(x, y, hitTolerance)[0];
		if (hit) {
			try {
				(e.currentTarget as Element).setPointerCapture(e.pointerId);
			} catch {
				// setPointerCapture can throw on stale targets; drag still works
				// via the pointer-move listener, just without capture.
			}
			dragState = {
				id: hit.id,
				startClientX: e.clientX,
				startClientY: e.clientY,
				liveX: hit.x,
				liveY: hit.y,
				moved: false,
			};
			return;
		}
		// Empty-canvas mouse press with no armed mode + nothing selected
		// → arm a pan. Same threshold-first pattern as the marker drag
		// path so a plain click still routes through onGridClick (which
		// deselects on empty). Skipped when a marker is selected: the
		// canvas is in "focused-marker" mode there (cursor: default), so
		// a stray drag on the map shouldn't hijack the selection; clicking
		// bare terrain to deselect first is the way back to pan mode.
		// Touch is skipped — the browser's own overflow-scroll pan already
		// covers single-finger pan there via `touch-action: pan-x pan-y`.
		if (
			e.pointerType !== 'mouse' ||
			e.button !== 0 ||
			!canvasEl ||
			placingMarker ||
			selectedMarkerId
		)
			return;
		try {
			(e.currentTarget as Element).setPointerCapture(e.pointerId);
		} catch {
			// Same tolerance as above — capture is best-effort.
		}
		panState = {
			startClientX: e.clientX,
			startClientY: e.clientY,
			startScrollLeft: canvasEl.scrollLeft,
			startScrollTop: canvasEl.scrollTop,
			active: false,
		};
	}

	function onGridPointerMove(e: PointerEvent) {
		// Measure mode: track the pointer so the pending segment from the
		// last waypoint updates live. Runs before the drag-state guard so
		// measuring never routes through the marker drag path.
		if (measuring && measurePoints.length > 0) {
			measureCursor = clampToBounds(eventToWorld(e));
		}
		if (panState && canvasEl) {
			const dxPx = e.clientX - panState.startClientX;
			const dyPx = e.clientY - panState.startClientY;
			if (!panState.active && Math.hypot(dxPx, dyPx) > DRAG_THRESHOLD_PX) {
				panState.active = true;
			}
			if (panState.active) {
				// Move the map in the direction the pointer travels — pull left,
				// the map slides left, which is scrollLeft going down. Same on Y.
				canvasEl.scrollLeft = panState.startScrollLeft - dxPx;
				canvasEl.scrollTop = panState.startScrollTop - dyPx;
			}
			return;
		}
		if (!dragState) return;
		const dxPx = e.clientX - dragState.startClientX;
		const dyPx = e.clientY - dragState.startClientY;
		if (!dragState.moved && Math.hypot(dxPx, dyPx) > DRAG_THRESHOLD_PX) {
			dragState.moved = true;
			cancelLongPress();
		}
		if (dragState.moved) {
			const w = eventToWorld(e);
			dragState.liveX = w.x;
			dragState.liveY = w.y;
		}
	}

	function onGridPointerUp(e: PointerEvent) {
		cancelLongPress();
		if (panState) {
			const pan = panState;
			panState = null;
			try {
				(e.currentTarget as Element).releasePointerCapture(e.pointerId);
			} catch {
				// Best-effort — capture may already be released.
			}
			if (pan.active) {
				// A committed pan swallows the following click so we don't
				// deselect the selected marker at the pointer-up spot.
				dragJustEnded = true;
				setTimeout(() => {
					dragJustEnded = false;
				}, 0);
				savePanSoon();
			}
			return;
		}
		if (!dragState) return;
		const state = dragState;
		dragState = null;
		try {
			(e.currentTarget as Element).releasePointerCapture(e.pointerId);
		} catch {
			// Best-effort — capture may have already been released.
		}
		if (!state.moved) return; // static tap — let onGridClick handle it
		const snapped = clampToBounds({ x: state.liveX, y: state.liveY });
		updateMarker(state.id, { x: snapped.x, y: snapped.y });
		selectedMarkerId = state.id;
		// Suppress the click event that fires right after pointerup.
		dragJustEnded = true;
		setTimeout(() => {
			dragJustEnded = false;
		}, 0);
	}

	function cancelLongPress() {
		if (longPressTimer) {
			clearTimeout(longPressTimer);
			longPressTimer = null;
		}
	}

	/** Snapped preview position for the marker currently being dragged.
	 *  Used both to render the icon at its drop-target intersection and
	 *  to draw a small crosshair at the same spot. */
	const dragPreview = $derived(
		dragState?.moved ? clampToBounds({ x: dragState.liveX, y: dragState.liveY }) : null,
	);

	/** "+ Marker" — enter placement mode. The next click on the map's
	 *  click-capture <rect> drops a marker at those coords (see the
	 *  early-out in onGridClick), and the cursor is swapped to a
	 *  location-pin glyph via the .mp-canvas--placing modifier (with a
	 *  crosshair fallback) so the arming state is visually obvious.
	 *  Escape cancels; clicking the button a second time also cancels
	 *  (toggle). */
	let placingMarker = $state(false);
	function togglePlacingMarker() {
		placingMarker = !placingMarker;
		if (placingMarker) selectedMarkerId = null;
	}
	function cancelPlacingMarker() {
		placingMarker = false;
	}

	// ─── Measuring tool ────────────────────────────────────────────────────
	/**
	 * Polyline distance ruler. Armed via the toolbar's ruler button
	 * (disabled unless the map has a scale defined in Map options).
	 * Each grid click drops a waypoint; the segment from the last
	 * waypoint to the cursor tracks live via onGridPointerMove; the
	 * running total appears next to the current endpoint. Escape,
	 * double-click on the canvas, or re-clicking the ruler button
	 * commits + disarms — the polyline stays visible on the canvas
	 * until the tool is re-armed (which clears it and starts fresh),
	 * except for Escape which also clears it.
	 *
	 * All coordinates are in world units (grid cells). Distances are
	 * Euclidean world-unit distance × mapState.settings.scale.perHex,
	 * with the map's configured unit ('miles' | 'km').
	 */
	let measuring = $state(false);

	// ─── Marker card ─────────────────────────────────────────────────────
	// Selecting a marker (a plain click) shows its info card beside it —
	// unless the editor is open, it's being dragged, or a placement /
	// measure gesture is armed. ✕ on the card hides it for this selection.
	let cardHiddenFor = $state<string | null>(null);
	const cardOpen = $derived(
		dialogOpen &&
			!!selectedMarker &&
			!markerPropsOpen &&
			!dragState?.moved &&
			!placingMarker &&
			!measuring &&
			cardHiddenFor !== selectedMarkerId,
	);
	/** The selected marker's icon box on screen, read live each frame. */
	const cardAnchor = {
		getBoundingClientRect: () => {
			const el = selectedMarkerId
				? document.querySelector(
						`[data-marker-id="${CSS.escape(selectedMarkerId)}"] .mp-marker-icon, [data-marker-id="${CSS.escape(selectedMarkerId)}"]`,
					)
				: null;
			return el?.getBoundingClientRect() ?? new DOMRect(0, 0, 0, 0);
		},
	};
	let measurePoints = $state<{ x: number; y: number }[]>([]);
	let measureCursor = $state<{ x: number; y: number } | null>(null);

	const mapScale = $derived(mapState.settings.scale ?? {});
	const hasScale = $derived(
		mapScale.enabled === true && typeof mapScale.perHex === 'number' && mapScale.perHex > 0,
	);
	const scaleUnit = $derived<'miles' | 'km'>(mapScale.unit === 'km' ? 'km' : 'miles');
	const scalePerCell = $derived(typeof mapScale.perHex === 'number' ? mapScale.perHex : 0);

	/** The ruler's polyline length in world units: the committed waypoints,
	 *  plus the pending segment to the cursor while measuring. */
	const measureTotal = $derived(
		polylineLength(measureCursor ? [...measurePoints, measureCursor] : measurePoints),
	);

	/** Enter measure mode. Clears any previous polyline so the user
	 *  starts fresh — a re-arm always means "new measurement". */
	function startMeasuring() {
		if (!hasScale) return;
		measuring = true;
		measurePoints = [];
		measureCursor = null;
		selectedMarkerId = null;
		placingMarker = false;
	}

	/** Commit the current polyline (leaves it visible for
	 *  screen-capture, but the tool is no longer accepting clicks). */
	function endMeasuring() {
		measuring = false;
		measureCursor = null;
	}

	/** Full reset — Escape closes and clears everything. */
	function cancelMeasuring() {
		measuring = false;
		measurePoints = [];
		measureCursor = null;
	}

	/** Toolbar button toggle. Clicking the ruler while it is armed
	 *  cancels the whole measurement and clears the polyline — this
	 *  is the only mobile-friendly way to abort (there is no Escape
	 *  key on touch, and re-clicking a "commit" button that left the
	 *  polyline behind meant a second tap to actually reset). Desktop
	 *  users still get Escape as an equivalent shortcut, and
	 *  double-clicking on the map is the "commit + keep the pins
	 *  visible for screen-capture" path. */
	function toggleMeasuring() {
		if (measuring || measurePoints.length > 0) {
			cancelMeasuring();
		} else {
			startMeasuring();
		}
	}

	/** In-app clipboard for cut / copy / paste. Component-scoped so it
	 *  survives dialog close/reopen for the life of the page, but resets
	 *  on reload — the OS clipboard would need permissions and doesn't
	 *  round-trip our marker fields cleanly. Everything except id / x / y
	 *  is preserved; paste drops the copy at a small offset from the
	 *  source coords so it's visible on top of (rather than fused with)
	 *  the original. */
	type MarkerCopyPayload = Omit<MapMarker, 'id' | 'x' | 'y'> & {
		sourceX: number;
		sourceY: number;
	};
	let clipboard = $state<MarkerCopyPayload | null>(null);

	/** Open the editor for the currently selected marker. Same effect as
	 *  double-clicking the marker on the canvas — see the "+ Marker"
	 *  button's Edit sibling and the Ctrl/Cmd+E shortcut below. */
	function editSelected() {
		if (!selectedMarker) return;
		markerPropsOpen = true;
	}

	/** Copy the selected marker into the clipboard. Every field except
	 *  id / x / y is snapshotted; the original stays put. */
	function copySelected() {
		const m = selectedMarker;
		if (!m) return;
		const { id: _id, x, y, ...rest } = m;
		void _id;
		clipboard = { ...rest, sourceX: x, sourceY: y };
	}

	/** Cut = copy + delete. Same clipboard payload as copySelected(). */
	function cutSelected() {
		const m = selectedMarker;
		if (!m) return;
		const { id: _id, x, y, ...rest } = m;
		void _id;
		clipboard = { ...rest, sourceX: x, sourceY: y };
		selectedMarkerId = null;
		removeMarker(m.id);
	}

	/** Paste the clipboard payload as a new marker. Drops it a quarter
	 *  of an icon's worth down-and-right of the source position so it
	 *  reads as a distinct pin rather than fusing with the original,
	 *  clamped into the map bounds. Selects the fresh marker so the
	 *  user can immediately arrow-nudge or double-click to edit. */
	function pasteClipboard() {
		if (!clipboard) return;
		const { sourceX, sourceY, ...rest } = clipboard;
		const offset = ICON_SIZE / 4;
		const target = clampToBounds({ x: sourceX + offset, y: sourceY + offset });
		const id = addMarker({ x: target.x, y: target.y, ...rest });
		// Its layer may have been hidden since the copy.
		revealMarkerLayer(rest);
		selectedMarkerId = id;
	}

	/** Keyboard shortcut router. Handles:
	 *
	 *  - Escape while the pile picker is open — a non-dialog floating menu
	 *    that would otherwise be bypassed and let Escape close the whole
	 *    map. The entity-link picker is a nested `<dialog>` now, so its
	 *    native Escape handler (wired via `oncancel`) closes it before
	 *    Escape can reach the parent.
	 *  - Escape while a marker is selected AND the properties dialog is
	 *    closed — deselect the marker. (When the dialog is open, its own
	 *    Escape handler closes the dialog first.)
	 *  - Arrow keys while a marker is selected AND the properties dialog
	 *    is closed — nudge the marker by one snap-cell at the current
	 *    zoom. Held-Shift multiplies by 5 for coarse moves.
	 *  - Ctrl/Cmd+X / +C on a selected marker — cut / copy it to the
	 *    in-app clipboard. Ctrl/Cmd+V pastes at the source coords
	 *    offset by a quarter-icon so the paste is visible on top of
	 *    the original. Ctrl/Cmd+E opens the marker properties editor
	 *    (same as double-click and the toolbar's Edit button).
	 *
	 *  Skipped when the target is an editable input so typing in a form
	 *  field doesn't move the map's selected marker underneath. */
	$effect(() => {
		const handler = (ev: KeyboardEvent) => {
			if (!dialogOpen) return;
			// Keys in a popover over the map (the Layers menu, a colour
			// picker) are the popover's: Escape closes it, and nothing else —
			// it mustn't also drop the selection or the placement.
			if ((ev.target as Element | null)?.closest?.('[data-popover-content]')) return;
			if (ev.key === 'Escape' && pilePicker) {
				ev.preventDefault();
				ev.stopPropagation();
				closePilePicker();
				return;
			}
			// Escape cancels armed placement — takes precedence over the
			// marker editor and selection so a mis-armed + Marker click
			// always has a one-key exit even if a marker is selected.
			// stopPropagation so bits-ui's Dialog Escape handler doesn't
			// also fire and close the whole dialog.
			if (ev.key === 'Escape' && placingMarker) {
				ev.preventDefault();
				ev.stopPropagation();
				cancelPlacingMarker();
				return;
			}
			// Escape wipes the measuring polyline entirely — Enter is the
			// commit key that keeps the pins visible (mirror of the
			// double-click gesture on desktop). stopPropagation so
			// bits-ui's Dialog Escape handler doesn't also close the map
			// dialog underneath — armed rulers shouldn't cost a click to
			// re-open.
			if (ev.key === 'Escape' && (measuring || measurePoints.length > 0)) {
				ev.preventDefault();
				ev.stopPropagation();
				cancelMeasuring();
				return;
			}
			// Enter commits the polyline (leaves pins on screen, disarms
			// the tool) — same effect as the desktop double-click. Only
			// commits when at least one waypoint is on screen; with none
			// yet it's a safe no-op. Crucially, we still preventDefault
			// + stopPropagation for the no-op case so the browser doesn't
			// synthesize an Enter-activate click on the still-focused
			// ruler button (which would toggle `measuring` off and
			// silently disarm the ruler the user just armed).
			if (ev.key === 'Enter' && measuring) {
				ev.preventDefault();
				ev.stopPropagation();
				if (measurePoints.length > 0) endMeasuring();
				return;
			}
			// Only fire selection-scoped shortcuts when the marker editor
			// isn't up and no form field currently owns focus.
			if (markerPropsOpen) return;
			const target = ev.target as HTMLElement | null;
			if (
				target &&
				(target.isContentEditable ||
					target.tagName === 'INPUT' ||
					target.tagName === 'TEXTAREA' ||
					target.tagName === 'SELECT')
			) {
				return;
			}
			// Backspace / Delete while measuring — pop the last waypoint.
			// Skips the selection-scoped guard below so it works with no
			// marker selected. When the last waypoint comes off, the
			// preview segment (if any) collapses and only the earlier
			// dots stay on the canvas; another Backspace pops the
			// next-latest, etc. If the polyline is empty already, the
			// key falls through to the browser default (nav back on some
			// setups), which is fine — nothing to undo.
			//
			// Also clear the stale `measureCursor` from the last
			// pointermove — otherwise the template would still splice
			// it into `pts` (`[remainingPoint, staleCursor]`), keeping
			// a phantom preview `.mp-measure-line` on screen until the
			// user nudges the mouse. The next pointermove repopulates
			// `measureCursor` and the live preview resumes as usual.
			if (measuring && (ev.key === 'Backspace' || ev.key === 'Delete')) {
				if (measurePoints.length > 0) {
					ev.preventDefault();
					measurePoints = measurePoints.slice(0, -1);
					measureCursor = null;
				}
				return;
			}
			// Ctrl/Cmd + X / C / V / E — clipboard + edit shortcuts. Fire
			// before the selection-required guard so paste works even when
			// nothing is selected (as long as the clipboard has content).
			const mod = ev.ctrlKey || ev.metaKey;
			if (mod && !ev.shiftKey && !ev.altKey) {
				const k = ev.key.toLowerCase();
				if (k === 'v' && clipboard) {
					ev.preventDefault();
					pasteClipboard();
					return;
				}
				if (selectedMarker) {
					if (k === 'x') {
						ev.preventDefault();
						cutSelected();
						return;
					}
					if (k === 'c') {
						ev.preventDefault();
						copySelected();
						return;
					}
					if (k === 'e') {
						ev.preventDefault();
						editSelected();
						return;
					}
				}
			}
			if (!selectedMarker) return;
			if (ev.key === 'Escape') {
				ev.preventDefault();
				selectedMarkerId = null;
				return;
			}
			if (
				ev.key === 'ArrowLeft' ||
				ev.key === 'ArrowRight' ||
				ev.key === 'ArrowUp' ||
				ev.key === 'ArrowDown'
			) {
				ev.preventDefault();
				// Fixed nudge step (quarter of an icon) instead of the old
				// zoom-tied grid resolution — markers no longer snap, so the
				// step doesn't need to match a grid interval. Shift = 5×.
				const step = (ICON_SIZE / 4) * (ev.shiftKey ? 5 : 1);
				let dx = 0;
				let dy = 0;
				if (ev.key === 'ArrowLeft') dx = -step;
				else if (ev.key === 'ArrowRight') dx = step;
				else if (ev.key === 'ArrowUp') dy = -step;
				else if (ev.key === 'ArrowDown') dy = step;
				const next = clampToBounds({
					x: selectedMarker.x + dx,
					y: selectedMarker.y + dy,
				});
				updateMarker(selectedMarker.id, { x: next.x, y: next.y });
			}
		};
		window.addEventListener('keydown', handler, true);
		return () => window.removeEventListener('keydown', handler, true);
	});

	/** Close the pile picker if the active map switches out from under it
	 *  — its markers would no longer belong to what's on screen. Reading
	 *  `mapState.activeId` into a local subscribes this effect to it. */
	$effect(() => {
		const _activeId = mapState.activeId;
		void _activeId;
		if (pilePicker) closePilePicker();
	});

	function handleFileChosen(e: Event) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (file) void loadBackground(file);
	}

	/** Mention dropping in the empty map's hint only where a file can be
	 *  dragged in (mouse or trackpad). */
	const dropHint = canDropFiles();

	/** Set (or replace) the active map's background: from the file input,
	 *  or an image file dropped on the map. */
	async function loadBackground(file: File) {
		uploadError = '';
		try {
			const result = await downscaleImage(file);
			setBackground(result.dataUrl, result.aspect);
		} catch (err) {
			uploadError = err instanceof MapImageError ? err.message : 'Failed to load image.';
		}
	}

	/** Icon size in world units. Doubles on mobile so markers stay
	 *  legible for touch — the default (~0.42 world units) reads
	 *  fine at desktop pointer resolution but is too small when the
	 *  whole map is inside a phone-width viewport. Text follows via
	 *  `.mp-marker-label` in the mobile media block below. */
	let isMobileViewport = $state(false);
	$effect(() => {
		if (typeof window === 'undefined') return;
		const mq = window.matchMedia('(max-width: 640px)');
		const sync = () => (isMobileViewport = mq.matches);
		sync();
		mq.addEventListener('change', sync);
		return () => mq.removeEventListener('change', sync);
	});

	// ─── Fullscreen (desktop toggle; always-on for mobile) ──────────────────
	/**
	 * Fullscreen state — a desktop-only toggle that fills the viewport
	 * with the dialog. Mobile is effectively always fullscreen because
	 * an 80–90 % dialog on a phone leaves too little map surface;
	 * `effectiveFullscreen` collapses the two into one flag the sizing
	 * effect + CSS variant both key off.
	 *
	 * The toggle value persists per-device via localStorage so a user
	 * who prefers the wide layout doesn't have to re-open it every
	 * time. Read once on module init; writes fire from
	 * `toggleFullscreen()`.
	 */
	const FS_KEY = 'ironledger:map:fullscreen';
	function readSavedFullscreen(): boolean {
		if (typeof localStorage === 'undefined') return false;
		try {
			return localStorage.getItem(FS_KEY) === '1';
		} catch {
			return false;
		}
	}
	let fullscreen = $state(readSavedFullscreen());
	const effectiveFullscreen = $derived(isMobileViewport || fullscreen);
	/** Name of the layer new markers go on — shown beside the Layers
	 *  button when the toolbar has room (desktop width). */
	const activeLayerName = $derived.by(() => {
		const id = activeLayerId();
		const ls = mapLayers();
		return (ls.find((l) => l.id === id) ?? ls[0])?.name ?? '';
	});
	function toggleFullscreen() {
		fullscreen = !fullscreen;
		try {
			localStorage.setItem(FS_KEY, fullscreen ? '1' : '0');
		} catch {
			// Private mode / storage disabled — the toggle still works
			// for this session, just doesn't persist.
		}
	}
	const ICON_SIZE = $derived(isMobileViewport ? 0.84375 : 0.421875);
	/** Raster (PNG) icons and layered settlement-kit icons are detailed art
	 *  that reads visually smaller than the bold vector glyph silhouettes at
	 *  the same box size, so they render at this multiple of ICON_SIZE. Vector icons stay at 1×. The
	 *  marker's `<svg>` element is enlarged and re-centred on the anchor
	 *  point (not the image inside a fixed box), so nothing clips. */
	const RASTER_ICON_SCALE = 2;
	/** Gap between the icon's SVG-box edge and the label's near edge,
	 *  in world units. Scales with the icon so proportions stay stable.
	 *  Most glyphs leave a bit of inner padding inside their SVG box,
	 *  so the visible gap between the drawn icon shape and the label
	 *  reads noticeably larger than this value — small numbers here
	 *  yield the tight-but-not-touching look labels want. */
	const LABEL_GAP = $derived(isMobileViewport ? 0.125 : 0.075);
	/** Label font size, in world units at zoom 1. Kept in JS so
	 *  labelPlacement() can subtract the em-box leading from vertical
	 *  positions — the CSS declaration below has to match. */
	const LABEL_FONT_SIZE = $derived(isMobileViewport ? 0.48 : 0.24);
	/** Hit-test radius (world units) used by `markersAt`. Half the icon's
	 *  extent so a click inside the visible glyph counts as a hit; the
	 *  ×1.05 buffer forgives 1-pixel finger jitter without noticeably
	 *  overlapping neighbouring markers. */
	const hitTolerance = $derived((ICON_SIZE / 2) * 1.05);
</script>

<Dialog.Root bind:open={dialogOpen}>
	<Dialog.Portal>
		<Dialog.Overlay class="dialog-overlay mp-overlay" style="z-index: {overlayZ(stackDepth)}" />
		<Dialog.Content
			bind:ref={dialogEl}
			class={effectiveFullscreen ? 'mp-dialog mp-dialog--fullscreen' : 'mp-dialog'}
			style="z-index: {contentZ(stackDepth)}"
			data-tour="map-dialog"
		>
			<DialogHeader title={headingText('Maps')}>
				{#snippet trailing()}
					{#if !isMobileViewport}
						<button
							class="dh-close mp-fs-btn"
							onclick={toggleFullscreen}
							aria-pressed={fullscreen}
							use:tooltip={fullscreen ? 'Restore dialog size' : 'Fullscreen'}
							aria-label={fullscreen ? 'Restore dialog size' : 'Fullscreen'}
							>{@html fullscreen ? iconMinimizeSvg : iconMaximizeSvg}</button
						>
					{/if}
					<button class="dh-close" onclick={close} aria-label="Close">{@html xmarkSvg}</button>
				{/snippet}
			</DialogHeader>

			<div class="mp-toolbar">
				<div class="mp-tools mp-tools-map">
					<!-- Map switcher — shadcn-style combobox (Popover + Command).
			     Same visual + interaction as the marker link picker so
			     the two chips on the dialog stay consistent. Sits alone on
			     the first row so long map names never crowd out the zoom
			     controls at phone widths. -->
					<Combobox
						bind:open={mapPickerOpen}
						items={mapListState.maps}
						getKey={(m) => m.id}
						getLabel={(m) => m.name}
						activeKey={mapState.activeId}
						onselect={(m) => pickMap(m.id)}
						triggerValue={mapState.name || 'Map'}
						searchPlaceholder="Search maps…"
						emptyText="No matching maps."
						ariaLabel="Switch, create, or manage maps"
						class="mp-picker-btn"
						actions={mapActions}
					/>
				</div>
				<div class="mp-tools mp-tools-actions">
					<button
						class="mp-btn mp-btn-add mp-btn-icon mp-btn-add-marker"
						class:mp-btn-add--armed={placingMarker}
						onclick={togglePlacingMarker}
						aria-pressed={placingMarker}
						data-tour="map-add-marker"
						use:tooltip={placingMarker
							? 'Click on the map to place the marker (Esc to cancel)'
							: 'Click, then tap the map to place a marker'}
						aria-label="Add marker"
						><span class="mp-btn-add-plus" aria-hidden="true">+</span
						>{@html iconLocationDotSvg}</button
					>
					<span class="mp-tool-divider" aria-hidden="true"></span>
					<!-- Edit selected marker — double-click and Ctrl/Cmd+E do the
					     same thing; the button surfaces the affordance for touch
					     users. Cut / copy / paste stay keyboard-only (Ctrl+X /
					     +C / +V) to keep the toolbar tight. -->
					<button
						class="mp-btn mp-btn-icon"
						onclick={editSelected}
						disabled={!selectedMarker}
						use:tooltip={'Edit selected marker (double-click / Ctrl+E)'}
						aria-label="Edit marker">{@html iconEditSvg}</button
					>
					<!-- Measure distance — polyline ruler that only lights up when
					     the map has a scale defined (Map options → Scale). Click
					     to arm, click on the map to drop each waypoint, double-
					     click on the map to commit + keep the pins visible.
					     Click the ruler button again (or Esc on desktop) to clear
					     the measurement entirely — this is the mobile abort path
					     since there's no Escape key on touch. -->
					<button
						class="mp-btn mp-btn-icon"
						class:mp-btn-add--armed={measuring}
						onclick={toggleMeasuring}
						disabled={!hasScale}
						aria-pressed={measuring}
						use:tooltip={hasScale
							? measuring
								? 'Click the map to add waypoints; Backspace undoes; Enter or double-click commits; Esc cancels'
								: 'Measure distance — click to arm the ruler'
							: 'Turn on Scale in Map options (⚙) to measure distances'}
						aria-label="Measure distance">{@html iconRulerSvg}</button
					>
					<span class="mp-tool-divider" aria-hidden="true"></span>
					<div class="mp-zoom" role="group" aria-label="Zoom controls">
						<button
							class="mp-btn mp-btn-icon"
							onclick={zoomOut}
							disabled={zoom <= MIN_ZOOM}
							use:tooltip={`Zoom out (Ctrl/Cmd + wheel) — currently ${Math.round(zoom * 100)}%`}
							aria-label="Zoom out">{@html iconZoomOutSvg}</button
						>
						<button
							class="mp-btn mp-btn-icon"
							onclick={zoomIn}
							disabled={zoom >= MAX_ZOOM}
							use:tooltip={`Zoom in (Ctrl/Cmd + wheel) — currently ${Math.round(zoom * 100)}%`}
							aria-label="Zoom in">{@html iconZoomInSvg}</button
						>
						{#if !isMobileViewport}
							<button
								class="mp-btn mp-btn-icon"
								onclick={zoomFit}
								disabled={zoom === 1}
								use:tooltip={'Fit map to view (100%)'}
								aria-label="Fit to view">{@html iconExpandSvg}</button
							>
						{/if}
					</div>
					<span class="mp-tool-divider" aria-hidden="true"></span>
					{#if !isMobileViewport}
						<span class="mp-active-layer" use:tooltip={'New markers go on this layer'}
							>{activeLayerName}</span
						>
					{/if}
					<MapLayersMenu />
					<span class="mp-tool-divider" aria-hidden="true"></span>
					<button
						class="mp-btn mp-btn-icon mp-btn-gear"
						onclick={() => optionsDialogRef?.open()}
						use:tooltip={'Map options — names, grid, scale bar, danger zone'}
						aria-label="Map options">{@html iconGearSvg}</button
					>
				</div>
				<input
					id="mp-file-input"
					name="mp-file-input"
					bind:this={fileInputEl}
					type="file"
					accept="image/*"
					hidden
					onchange={handleFileChosen}
				/>
			</div>

			<!--
		Selection toolbar. Sits above the map so it never scrolls off, but
		only renders when there's something to do — a marker is selected /
		just created (editable fields), placing mode is on ("click the map
		to place a marker" + Cancel), or a square is selected ("hit +
		Marker to drop here" + Cancel). The idle-state "how to use" hint
		lives on the + Marker button's tooltip so the toolbar band doesn't
		steal vertical space on mobile.
	-->
			{#if uploadError}
				<div class="mp-error">{uploadError}</div>
			{/if}

			{#if selectedMarker && selectedMarker.entityId && !resolveEntity(selectedMarker.entityId)}
				<div class="mp-warn">
					Linked entity was deleted — pick a new one from the dropdown or clear the link.
				</div>
			{/if}

			<!-- Body fills the dialog width; the JS sizing effect above
	     already picked the dialog dims so `IW = dialog width` and
	     `IH = dialog height − AHH`. `aspect-ratio` on the body is
	     redundant but harmless — it keeps square grid cells even if
	     a race briefly leaves the dialog un-sized. -->
			<!-- An image file dropped here sets the background, or replaces it,
			     as Map options' "Replace background image…" does. -->
			<div
				class="mp-body"
				style="aspect-ratio: {gridDims.cols} / {gridDims.rows};"
				data-drop-label={mapState.backgroundHash
					? 'Drop to replace the background'
					: 'Drop to set the background'}
				use:dropImage={{ ondrop: loadBackground, disabled: !mapState.loaded }}
			>
				<!-- Placing / square-selected hint. Overlaid on top of the
				<!-- Wheel listener is attached manually with `passive: false` in a
		     $effect above so trackpad-pinch (ctrl+wheel) is preventable. -->
				<div
					class="mp-canvas"
					class:mp-canvas--placing={placingMarker}
					class:mp-canvas--measuring={measuring}
					class:mp-canvas--panning={panState?.active}
					class:mp-canvas--focused={selectedMarkerId != null}
					data-tour="map-canvas"
					bind:this={canvasEl}
					onscroll={onScroll}
				>
					<!--
				viewBox is world-unit space (0 0 cols rows). SVG rendered
				width/height = canvasPxW/H × zoom, so when zoom > 1 the SVG
				grows past the canvas and .mp-canvas's overflow: auto handles
				the pan. Canvas body's aspect-ratio matches gridDims exactly,
				so cells render perfectly square with no letterbox at zoom 1.
			-->
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<svg
						bind:this={svgEl}
						width={svgWidth}
						height={svgHeight}
						viewBox="0 0 {gridDims.cols} {gridDims.rows}"
						preserveAspectRatio="none"
						aria-label="Campaign map"
						onclick={onGridClick}
						ondblclick={onGridDblClick}
						onpointerdown={onGridPointerDown}
						onpointermove={onGridPointerMove}
						onpointerup={onGridPointerUp}
						onpointercancel={onGridPointerUp}
					>
						{#if mapState.backgroundHash}
							<!-- Placeholder surface: a faint parchment fill + centred
					     "Loading map…" label that shows while the (possibly
					     multi-MB) background bytes are in flight. The real
					     `<image>` renders on top with `opacity: 0` until its
					     `onload` fires, then swaps in — the placeholder
					     stays underneath and is simply covered. -->
							{#if !backgroundLoaded}
								<rect
									class="mp-bg-placeholder"
									x="0"
									y="0"
									width={gridDims.cols}
									height={gridDims.rows}
								/>
								<text
									class="mp-bg-placeholder-text"
									x={gridDims.cols / 2}
									y={gridDims.rows / 2}
									text-anchor="middle"
									dominant-baseline="central">Loading map…</text
								>
							{/if}
							<image
								class="mp-bg-image"
								class:mp-bg-image-loaded={backgroundLoaded}
								x="0"
								y="0"
								width={gridDims.cols}
								height={gridDims.rows}
								href={currentBackgroundUrl}
								preserveAspectRatio="none"
								aria-hidden="true"
								onload={() => (loadedBackgroundUrl = currentBackgroundUrl)}
								onerror={() => (mapState.backgroundHash = '')}
							/>
						{/if}

						<!--
					Grid lines. Major = integer offsets (base cells); minor =
					sub-octave subdivisions revealed by zoom. Non-scaling
					stroke keeps them a consistent screen weight at any zoom.
				-->
						<g
							class="mp-grid-layer"
							class:mp-grid-layer-hidden={!mapSettings.grid.visible}
							stroke-opacity={mapSettings.grid.opacity}
						>
							{#each vLines as x (`v-${x}`)}
								<line
									class="mp-grid-line"
									class:mp-grid-major={isMajorLine(x)}
									x1={x}
									y1={0}
									x2={x}
									y2={gridDims.rows}
									vector-effect="non-scaling-stroke"
								/>
							{/each}
							{#each hLines as y (`h-${y}`)}
								<line
									class="mp-grid-line"
									class:mp-grid-major={isMajorLine(y)}
									x1={0}
									y1={y}
									x2={gridDims.cols}
									y2={y}
									vector-effect="non-scaling-stroke"
								/>
							{/each}
						</g>

						<!--
					Invisible fill rect covering the whole viewBox. It's the
					pointer target for empty-map areas — unselected markers
					are pointer-events: none, so a tap that misses every icon
					lands here and bubbles up to the <svg> which owns the
					click/pointer handlers (moved there so a tap on the
					SELECTED marker — which flips to pointer-events: auto +
					touch-action: none so mobile drag doesn't get eaten by
					the native pan gesture — routes the same way). Marker
					hits are still resolved via markersAt() against the
					event's world coords, so a tap adjacent to any marker
					(selected or not) still selects it.
				-->
						<rect
							class="mp-grid-capture"
							x="0"
							y="0"
							width={gridDims.cols}
							height={gridDims.rows}
							fill="transparent"
						/>

						<!-- Drag preview crosshair — a small ring at the intersection
				     the current drag will drop onto. Pure hint; markers'
				     translate() already jumps them to this point live. -->
						{#if dragPreview}
							<circle
								class="mp-drag-snap"
								cx={dragPreview.x}
								cy={dragPreview.y}
								r="0.18"
								vector-effect="non-scaling-stroke"
							/>
						{/if}

						<!-- Selected empty square — the click-first target for
						     "+ Marker" (same visual language a selected marker
						     uses). Rendered before markers so any marker placed
						     at the same spot draws on top. -->

						{#each shownMarkers as m (m.id)}
							{@const ic = resolveMarkerIcon(m)}
							{@const color = m.color || DEFAULT_MARKER_COLOR}
							{@const halo = haloColor(color)}
							{@const isDragging =
								dragState?.id === m.id && dragState.moved && dragPreview !== null}
							{@const mx = isDragging && dragPreview ? dragPreview.x : m.x}
							{@const my = isDragging && dragPreview ? dragPreview.y : m.y}
							{@const showIcon = markerShowsIcon(m)}
							{@const showLabel = markerShowsLabel(m)}
							{@const isSelected = m.id === selectedMarkerId}
							{@const rot = normalizeAngle(m.angle)}
							<!--
						`scale(1/zoom)` keeps the whole marker (icon + label +
						strokes) a constant on-screen size regardless of zoom —
						children keep their world-unit sizes; the scale absorbs
						the zoom. When the marker shows no icon (a label-only
						`type`, or no icon chosen) the label centres both axes on
						the point instead of hanging below where the icon would be.
					-->
							<g
								class="mp-marker"
								data-marker-id={m.id}
								class:mp-marker-selected={isSelected}
								class:mp-marker-dragging={isDragging}
								transform="translate({mx} {my}) scale({1 / zoom}) rotate({rot})"
							>
								{#if showIcon && ic}
									{@const iconExtent =
										ICON_SIZE * (ic.raster || ic.layered ? RASTER_ICON_SCALE : 1) * markerScale(m)}
									<svg
										class="mp-marker-icon"
										x={-iconExtent / 2}
										y={-iconExtent / 2}
										width={iconExtent}
										height={iconExtent}
										viewBox={ic.viewBox}
									>
										<!--
									mapGlyphInner() colours the glyph to the marker's
									`color` and lays a white halo behind it so the icon
									stays readable over any background map — a
									`paint-order="stroke"` halo for vector icons (pinned
									to 2 device px via non-scaling-stroke, matching the
									label halo) and a dilated-alpha white flood for raster
									(PNG) icons, whose black line-art is tinted through
									the same call. `m.id` keys the raster filter id.
								-->
										{@html mapGlyphInner(
											ic,
											color,
											`mk-${m.id}`,
											true,
											iconExtent * markerPxPerUnit,
										)}
									</svg>
								{:else if showIcon}
									<!-- Legacy/broken slug: fall back to a plain dot so
							     the marker doesn't vanish. Non-scaling stroke +
							     stroke-width 2 for the same halo weight everywhere. -->
									<circle
										r={(ICON_SIZE * markerScale(m)) / 2 - 0.04}
										fill={color}
										stroke={halo}
										stroke-width="2"
										paint-order="stroke"
										vector-effect="non-scaling-stroke"
									/>
								{/if}
								{#if isSelected}
									<!-- Selection outline — a square wrapping the icon itself,
									     drawn inside the marker group so it
									     shares the icon's zoom compensation and rotation and is
									     sized from the icon's real extent: layered settlement
									     and raster icons draw at RASTER_ICON_SCALE, so a fixed
									     square was hidden under them. `non-scaling-stroke`
									     keeps the outline a fixed screen weight. Drawn AFTER
									     the icon, with margin to clear it, so the icon's halo
									     can't paint over it. -->
									{@const cell =
										ICON_SIZE *
										(ic?.raster || ic?.layered ? RASTER_ICON_SCALE : 1) *
										1.3 *
										markerScale(m)}
									<rect
										class="mp-marker-selection"
										x={-cell / 2}
										y={-cell / 2}
										width={cell}
										height={cell}
										vector-effect="non-scaling-stroke"
									/>
								{/if}
								{#if showLabel}
									{@const labelCss = labelStyleCss(m.labelStyle)}
									{#if showIcon}
										<!-- Label placement intentionally ignores `markerScale(m)`:
										     only the icon scales, the label stays anchored where
										     the default-sized icon's edge would be. A marker set
										     to 3× has its glyph drawn 3× bigger but the label
										     still hangs at the 1× offset, so a group of mixed-
										     size markers lines their labels up to the same
										     visual baseline (and label text size, driven by
										     `labelStyle.size`, remains the only control that
										     changes label size). -->
										{@const iconExtent =
											ICON_SIZE * (ic?.raster || ic?.layered ? RASTER_ICON_SCALE : 1)}
										{@const p = labelPlacement(
											m.labelPosition ?? 'bottom',
											iconExtent / 2,
											LABEL_GAP,
											LABEL_FONT_SIZE * LABEL_SIZE_MULT[m.labelStyle?.size ?? 'md'],
										)}
										<text
											class="mp-marker-label"
											fill={color}
											style={`--halo:${halo}${labelCss ? ';' + labelCss : ''}`}
											vector-effect="non-scaling-stroke"
											x={p.x}
											y={p.y}
											text-anchor={p.anchor}
											dominant-baseline={p.baseline}>{m.label}</text
										>
									{:else}
										<text
											class="mp-marker-label mp-marker-label--centered"
											fill={color}
											style={`--halo:${halo}${labelCss ? ';' + labelCss : ''}`}
											vector-effect="non-scaling-stroke"
											text-anchor="middle"
											y="0">{m.label}</text
										>
									{/if}
								{/if}
							</g>
						{/each}

						<!-- Measure ruler overlay — drawn after markers so the line
						     is never hidden under a dense pin cluster. Lives in
						     world coords so the polyline pans / zooms with the
						     map; strokes carry `vector-effect: non-scaling-stroke`
						     so their pixel weight stays constant. Only rendered
						     when there's an active or committed polyline AND the
						     map has a scale defined. -->
						{#if hasScale && (measuring || measurePoints.length > 0)}
							{@const pts =
								measuring && measureCursor && measurePoints.length > 0
									? [...measurePoints, measureCursor]
									: measurePoints}
							{#if pts.length > 1}
								<polyline
									class="mp-measure-line"
									points={pts.map((p) => `${p.x},${p.y}`).join(' ')}
									fill="none"
									vector-effect="non-scaling-stroke"
								/>
							{/if}
							{#each measurePoints as pt, i (`mp-${i}`)}
								<circle class="mp-measure-dot" cx={pt.x} cy={pt.y} r="0.06" />
							{/each}
							{#if pts.length > 1}
								{@const last = pts[pts.length - 1]}
								<text
									class="mp-measure-total"
									x={last.x + 0.15}
									y={last.y - 0.15}
									font-size="0.35"
									paint-order="stroke"
									stroke="#fff"
									stroke-width="0.05"
									stroke-linejoin="round"
									>{formatMapDistance(measureTotal, scalePerCell, scaleUnit)}</text
								>
							{/if}
						{/if}
					</svg>
				</div>

				<!--
			Overlay SVG — floats above the canvas at fixed pixel dimensions
			(canvasPxW × canvasPxH) so the scale bar stays visible +
			constant-sized while the user pans and zooms the map underneath.
			Positioned absolute over .mp-canvas via .mp-overlay-svg CSS;
			pointer-events: none passes clicks through to the click-capture
			rect below.
		-->
				<svg
					class="mp-overlay-svg"
					width={canvasPxW}
					height={canvasPxH}
					viewBox="0 0 {canvasPxW} {canvasPxH}"
					aria-hidden="true"
				>
					{#if overlayGeom.sbEnabled}
						<g class="mp-scale" transform="translate({overlayGeom.sbX} {overlayGeom.sbY})">
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
									>{formatScaleTick(i * overlayGeom.sbPerSegment)}</text
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

				<!-- Empty-map call-to-action. Rendered when the active map has no
		     background yet — a big centred button the user clicks to pick
		     a picture. Kept as an HTML overlay (not SVG) so the click
		     stays a real user gesture; `<input type=file>.click()` fired
		     from anything else (setTimeout, promise callback, etc.) gets
		     swallowed on iOS Safari. -->
				{#if mapState.loaded && !mapState.backgroundHash}
					<div class="mp-empty-cta">
						<button
							class="mp-empty-cta-btn"
							onclick={triggerBackgroundUpload}
							data-tour="map-background"
						>
							<span class="mp-empty-cta-plus" aria-hidden="true">+</span>
							<span class="mp-empty-cta-label">Add background image</span>
						</button>
						<p class="mp-empty-cta-hint">
							Pick a map picture to paint over — jpg / png, any aspect{dropHint
								? ', or drop one here'
								: ''}.
						</p>
					</div>
				{/if}
			</div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<MapOptionsDialog
	bind:this={optionsDialogRef}
	onReplaceBackground={triggerBackgroundUpload}
	onExportPng={async () => {
		if (svgEl) await exportMapPng(svgEl, mapState.name);
	}}
/>

<!--
	Pile-up picker — surfaces when a click resolves to a snap point with
	more than one marker (common at low zoom, where sub-cell placements
	from a deeper octave collapse onto the same base cell). Fixed-
	positioned at the click's viewport coords; backdrop covers the whole
	viewport so an outside click dismisses. Rendered in the app root (not
	inside the <dialog>) via a portal-style fixed layer.
-->
{#if pilePicker}
	<MapPilePicker
		markers={pilePicker.markers}
		x={pilePicker.screenX}
		y={pilePicker.screenY}
		onchoose={choosePileMarker}
		onclose={closePilePicker}
	/>
{/if}

<!--
	Marker properties dialog — the marker editor, extracted into its own
	component. Driven by `selectedMarker`; closing it clears the parent's
	selection via `onClose`. Nested inside MapDialog so it shares the same
	modal top-layer, and reaches the `.mp-props-*` / `.mp-sel-*` /
	`.mp-cmd-*` rules in the global stylesheet below.
-->
<MarkerPropertiesDialog
	{selectedMarker}
	bind:open={markerPropsOpen}
	onClose={() => {
		/* Closing the editor no longer clears the selection — the marker
		 * stays outlined on the canvas so the user can nudge it with the
		 * arrow keys or reopen the editor with another double-click. A
		 * plain Escape while the dialog is closed, or a click on empty
		 * grid, is what clears the selection now (see onGridClick + the
		 * keydown handler in the $effect earlier). */
	}}
/>

<MarkerCard
	open={cardOpen}
	marker={selectedMarker}
	icon={selectedMarker && markerShowsIcon(selectedMarker)
		? resolveMarkerIcon(selectedMarker)
		: undefined}
	color={selectedMarker?.color || DEFAULT_MARKER_COLOR}
	anchor={cardAnchor}
	baseDepth={stackDepth}
	onjump={focusMarkerEntity}
	onedit={() => (markerPropsOpen = true)}
	ondismiss={() => (cardHiddenFor = selectedMarkerId)}
/>

<style>
	/* bits-ui portals Content + Overlay to <body>; scope everything
	   globally. z-index is set inline via dialogStack — see <script>. */
	:global(.mp-dialog) {
		display: flex;
		flex-direction: column;
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		/* Width + height are set from JavaScript per frame via the
		   "contain" fit (aspect-preserving, respects live chrome
		   height, handles device rotation). The `max-width` /
		   `max-height` here are a safety net for the first paint
		   before the effect fires — the JS values supersede them.
		   Desktop caps at 80 %; mobile bumps to 90 % via the media
		   query further down + the JS `isMobile` branch. */
		max-width: 80vw;
		max-height: 80vh;
		overflow: hidden;
		background: var(--bg-card);
		color: var(--text);
		border-radius: 10px;
		box-shadow:
			0 16px 48px #00000070,
			0 0 0 1px var(--border-mid);
		outline: none;
	}
	@media (max-width: 640px) {
		/* Lift the CSS safety-net so the JS `isMobile → fraction 0.9`
		   sizing isn't clamped back to 80vw × 80vh mid-frame. */
		:global(.mp-dialog) {
			max-width: 90vw;
			max-height: 90vh;
		}
	}
	/* Fullscreen variant — either the desktop toggle or the mobile
	   auto-mode sets `.mp-dialog--fullscreen`. Fills the viewport and
	   drops the border-radius so the dialog reads as a full-page
	   surface. The sizing effect above clears any inline width/height
	   left over from the aspect-fit path when this class flips on, so
	   the CSS wins by default. */
	:global(.mp-dialog--fullscreen) {
		top: 0 !important;
		left: 0 !important;
		transform: none !important;
		width: 100vw !important;
		height: 100dvh !important;
		max-width: none !important;
		max-height: none !important;
		border-radius: 0 !important;
	}
	/* Fullscreen body loses its aspect-ratio and flex-grows to fill
	   the leftover dialog space (title + toolbars sit above). The SVG
	   inside is sized in `contain` mode from the derived
	   svgWidth / svgHeight so the map fits fully with even letterbox
	   bars on whichever axis doesn't match. The canvas becomes a grid
	   container with `place-items: center` so the SVG lands centered
	   (letterbox stays even), and `overflow: auto` still lets the
	   canvas scroll normally when the user zooms the map past the
	   viewport dims. */
	:global(.mp-dialog--fullscreen .mp-body) {
		aspect-ratio: auto !important;
		flex: 1 1 auto;
		min-height: 0;
	}
	:global(.mp-dialog--fullscreen .mp-canvas) {
		display: grid;
		/* `safe center` — center the SVG when it fits (letterbox stays
		   even) but fall back to `start` alignment when the user zooms
		   past the viewport. The `zoomAround` math computes the new
		   scroll position from `scrollLeft + anchorX`, assuming the SVG
		   starts at the canvas content origin (0, 0). Unsafe centering
		   parks half the overflow above/left of the container's scroll
		   origin (unreachable), so scrolls land in the wrong place after
		   a pinch-zoom and markers appear to drift onto neighbouring
		   features. `safe` prevents that. */
		place-items: safe center;
	}
	/* Fullscreen toggle in the dialog header — same base styling as ✕
	   (via .dh-close), just an armed-pressed treatment for the "you're
	   in fullscreen" state so the icon-only button reads as a toggle. */
	:global(.mp-fs-btn[aria-pressed='true']) {
		color: var(--text-accent);
	}

	/* On desktop the picker + action cluster sit on the same row,
	   pushed apart by justify-content: space-between (the gear on the
	   far right, matching the pre-mobile-tighten layout). On phone
	   widths the picker's cluster wraps first because it's given
	   `flex-basis: 100%` in the @media block below — long map names
	   can't shove the zoom cluster off-screen anymore. */
	:global(.mp-toolbar) {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
		padding: 8px 14px;
		background: var(--bg-inset);
		border-bottom: 1px solid var(--border);
		flex-wrap: wrap;
	}
	:global(.mp-tools) {
		display: flex;
		gap: 8px;
		align-items: center;
		flex-wrap: wrap;
	}
	/* On desktop the map-name field (left) and the active-layer field
	   (right) split the toolbar's free space evenly instead of hugging the
	   two ends with dead space in the middle. Both groups grow by the same
	   factor, but the actions group starts from its content width (basis
	   auto, since it is mostly fixed buttons) while the map group starts
	   from zero — so the shared free space is added equally to the map name
	   and to the layer name, leaving the two name fields the same width.
	   The mobile rule below overrides this to stack them full-width. */
	:global(.mp-tools-map) {
		flex: 1 1 0;
		min-width: 0;
	}
	:global(.mp-tools-actions) {
		flex: 1 1 auto;
		min-width: 0;
	}
	/* Thin vertical rule separating the toolbar's groups (add / edit /
	   zoom / layers / settings). */
	:global(.mp-tool-divider) {
		flex: none;
		align-self: stretch;
		width: 1px;
		min-height: 20px;
		background: var(--border-mid);
	}
	/* The active layer's name beside the Layers button (desktop only). Grows
	   to fill the right group's share of the toolbar (it splits the free
	   space with the map name on the left), hugging the Layers button on
	   its right; truncates with an ellipsis when it runs out. width:0 (not
	   just flex-basis:0) keeps the layer name out of the actions group's
	   intrinsic width, so the map/layer split — and the map picker's width
	   — stay put no matter how long the active layer's name is. */
	:global(.mp-active-layer) {
		flex: 1 1 0;
		width: 0;
		min-width: 0;
		font-family: var(--font-ui);
		font-size: 0.78rem;
		color: var(--text-muted);
		text-align: right;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	@media (max-width: 640px) {
		/* Row 1: map picker only. Row 2: + Marker + zoom cluster + gear. */
		:global(.mp-tools-map) {
			flex: 1 1 100%;
		}
		:global(.mp-tools-actions) {
			flex: 1 1 100%;
		}
	}
	:global(.mp-btn) {
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
	:global(.mp-btn:hover:not(:disabled)) {
		color: var(--text);
		border-color: var(--text-accent);
	}
	:global(.mp-btn:disabled) {
		opacity: 0.4;
		cursor: default;
	}
	/* Marker-properties footer OK/Cancel use the app-wide `.btn` +
	   `.btn.btn-primary` (see app.css) so every dialog's affirmative
	   button stays visually identical. No .mp-btn-primary variant. */
	/* Map picker fills its group, which shares the toolbar's free space
	   with the actions group (see .mp-tools-map / .mp-tools-actions), so
	   the map name and the active-layer name split the bar evenly and the
	   trigger's width doesn't jump about as you switch maps. */
	:global(.mp-picker-btn) {
		flex: 1 1 0;
		min-width: 0;
	}
	@media (max-width: 640px) {
		/* Row 1 already spans the toolbar on mobile via `.mp-tools-map
		   { flex: 1 1 100% }`; the picker fills that row on its own. */
		:global(.mp-picker-btn) {
			width: 100%;
		}
	}

	:global(.mp-btn-icon) {
		padding: 4px 8px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}
	:global(.mp-btn-icon svg) {
		width: 14px;
		height: 14px;
	}
	:global(.mp-btn-icon svg path) {
		fill: currentColor;
	}
	/* Add-marker button — a small "+" glyph next to the location-pin
	   icon. Slightly tighter horizontal padding than a bare icon
	   button so the "+" and the pin read as one compound glyph. */
	:global(.mp-btn-add-marker) {
		gap: 3px;
	}
	:global(.mp-btn-add-plus) {
		font-family: var(--font-ui);
		font-size: 1rem;
		font-weight: 700;
		line-height: 1;
	}
	/* Zoom control chip — minus + percentage + plus + fit, laid out
	   inline so the toolbar row stays a single band on desktop. */
	:global(.mp-zoom) {
		display: inline-flex;
		align-items: center;
		gap: 2px;
	}
	:global(.mp-error) {
		font-family: var(--font-ui);
		font-size: 0.72rem;
		color: var(--color-danger, #ef4444);
		padding: 4px 14px;
		background: color-mix(in srgb, var(--color-danger, #ef4444) 8%, transparent);
	}
	:global(.mp-warn) {
		font-family: var(--font-ui);
		font-size: 0.72rem;
		color: var(--color-danger, #ef4444);
		padding: 4px 14px;
		background: color-mix(in srgb, var(--color-danger, #ef4444) 8%, transparent);
	}

	:global(.mp-body) {
		/* The dialog's JS sizing effect makes `dialog.width = IW` and
		   `dialog.height = IH + AHH`, so the body just fills the width
		   and derives its own height via `aspect-ratio`. No max-height
		   / no width formula needed — the dialog dims are already the
		   right shape. `position: relative` establishes the containing
		   block for the .mp-overlay-svg absolutely-positioned overlay. */
		position: relative;
		width: 100%;
		overflow: hidden;
	}
	/* An image dragged over the map (use:dropImage sets data-drop-over). */
	:global(.mp-body[data-drop-over])::after {
		content: attr(data-drop-label);
		position: absolute;
		inset: 0;
		z-index: 5;
		display: flex;
		align-items: center;
		justify-content: center;
		font-family: var(--font-ui);
		font-size: 1rem;
		font-weight: 600;
		color: var(--text-accent);
		background: color-mix(in srgb, var(--bg-card) 75%, transparent);
		outline: 3px dashed var(--text-accent);
		outline-offset: -8px;
		pointer-events: none;
	}
	/* Overlay SVG — floats above .mp-canvas at fixed canvas-pixel
	   dimensions so the scale bar stays put while the map pans and zooms
	   underneath. pointer-events: none so clicks pass through to the
	   click-capture rect. */
	:global(.mp-overlay-svg) {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
	}
	/* Empty-map CTA. Absolutely-positioned overlay that fills the
	   canvas area and stacks a big "Add background image" button + a
	   small hint. Auto-hides when a background loads because the
	   `{#if}` guard drops the element from the DOM. */
	:global(.mp-empty-cta) {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 12px;
		padding: 24px;
		text-align: center;
		pointer-events: none;
	}
	:global(.mp-empty-cta-btn) {
		pointer-events: auto;
		display: inline-flex;
		align-items: center;
		gap: 10px;
		padding: 14px 22px;
		font-family: var(--font-ui);
		font-size: 0.95rem;
		font-weight: 600;
		letter-spacing: 0.03em;
		color: var(--bg-card);
		background: var(--text-accent);
		border: 1px solid var(--text-accent);
		border-radius: 6px;
		cursor: pointer;
		box-shadow: 0 6px 18px #00000040;
	}
	.mp-empty-cta-btn:hover,
	:global(.mp-empty-cta-btn:focus-visible) {
		filter: brightness(1.08);
		outline: none;
	}
	:global(.mp-empty-cta-plus) {
		font-size: 1.3rem;
		line-height: 1;
	}
	:global(.mp-empty-cta-hint) {
		margin: 0;
		font-family: var(--font-ui);
		font-size: 0.75rem;
		color: var(--text-muted);
	}
	:global(.mp-canvas) {
		width: 100%;
		height: 100%;
		box-sizing: border-box;
		/* Pan lives here: overflow: auto lets the browser handle scrolling
		   when the SVG (rendered at canvasPxW/H × zoom) is bigger than the
		   canvas. At zoom = 1 the two match exactly, no scrollbars. */
		overflow: auto;
		overscroll-behavior: contain;
		background: var(--bg-inset);
		/* On touch: allow single-finger pan (the browser scrolls this
		   overflow: auto container natively — cheap + free), but reject
		   two-finger pinch so our own onTouchStart/onTouchMove can
		   claim it. Without `pan-x pan-y` iOS Safari commits pinch to
		   its own page-zoom gesture before the touchstart listener's
		   preventDefault() can veto, and the JS pinch-zoom never fires.
		   Wheel events are unaffected by touch-action so trackpad
		   ctrl+wheel + bare-wheel pan both still work. */
		touch-action: pan-x pan-y;
		/* Browsing-state affordance: the canvas advertises "click-drag to
		   pan" whenever no marker is selected and no armed mode owns the
		   pointer. Hovering a marker icon flips the cursor back to
		   `default` (see `.mp-marker-icon` below) so the "click to select"
		   affordance still reads. */
		cursor: grab;
	}
	/* Marker icons are the "click to select" target in the browsing
	   state — pull the cursor back to the platform default over them so
	   users can tell that clicking them will act on the marker (not the
	   map). Scoped to the un-armed canvas (not placing, not measuring)
	   so those modes' custom cursors (pin, crosshair) still win over
	   marker hovers — clicking a marker in placing mode still drops a
	   new marker there per the marker-hit skip in onGridClick. Labels
	   have `pointer-events: none` so hovering them falls through to the
	   canvas grab; icons stay a real hit target. */
	:global(
		.mp-canvas:not(.mp-canvas--placing):not(.mp-canvas--measuring):not(.mp-canvas--panning)
			.mp-marker-icon
	) {
		cursor: default;
	}
	/* Selection / focused mode: a marker is currently selected. The
	   canvas is no longer offering pan (pointerdown early-outs on
	   `selectedMarkerId`), so the browsing-hand cursor would be
	   misleading. Fall back to `default` — click empty terrain to
	   deselect first, then pan. */
	:global(.mp-canvas--focused) {
		cursor: default;
	}
	/* Committed pan — cursor is a closed hand while the user is
	   actively dragging the map. Placed after `.mp-canvas .mp-marker-icon`
	   so the whole surface (including any marker icons under the pointer)
	   reads as "grabbing" for the duration of the pan. */
	:global(.mp-canvas--panning),
	:global(.mp-canvas--panning svg),
	:global(.mp-canvas--panning .mp-marker-icon) {
		cursor: grabbing;
	}
	/* Armed placement — the "+ Marker" button was clicked and the next
	   click on the map drops a marker at that spot. Swap to a crosshair
	   cursor everywhere in the canvas so the arming state is impossible
	   to miss. */
	/* Placing a marker — swap to a location-pin cursor with the hotspot
	   at the tip so the "you're about to drop here" affordance is
	   unmistakable AND lines up with the pin the click actually creates.
	   The pin is a URL-encoded location-dot SVG (mirrors
	   #icons/location-dot-solid.svg), rendered at 24×32 with a white
	   stroke halo so it reads on both dark and pale map backgrounds. The
	   `crosshair` fallback keeps the affordance obvious on the handful of
	   browsers / hardened profiles that ignore SVG cursors. */
	:global(.mp-canvas--placing),
	:global(.mp-canvas--placing svg),
	:global(.mp-canvas--placing rect) {
		cursor:
			url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="24" height="32" viewBox="0 0 384 512"><path fill="%23111" stroke="%23fff" stroke-width="24" d="M215.7 499.2C267 435 384 279.4 384 192C384 86 298 0 192 0S0 86 0 192c0 87.4 117 243 168.3 307.2c12.3 15.3 35.1 15.3 47.4 0zM192 128a64 64 0 1 1 0 128 64 64 0 1 1 0-128z"/></svg>')
				12 32,
			crosshair;
	}
	/* Measuring — plain crosshair. The click point is precise, so the
	   OS crosshair is a better affordance than any custom pointer. */
	:global(.mp-canvas--measuring),
	:global(.mp-canvas--measuring svg),
	:global(.mp-canvas--measuring rect) {
		cursor: crosshair;
	}
	/* Toolbar "+ Marker" armed indicator — pressed styling so the button
	   reads as "the next click goes here" without needing a legend. Also
	   applied to the ruler button while measuring. Solid-accent fill +
	   inverted icon colour so the toggled-on state stays legible on both
	   themes; the outer accent-glow ring reinforces the "hot" affordance
	   without covering neighbouring buttons. Repeated on the hover
	   compound selector so hovering an armed button doesn't fall back to
	   the base `.mp-btn:hover` rule (which would swap the fill back). */
	:global(.mp-btn-add--armed),
	:global(.mp-btn-add--armed:hover:not(:disabled)) {
		background: var(--text-accent);
		border-color: var(--text-accent);
		color: var(--bg-control);
		box-shadow: 0 0 0 2px var(--accent-glow);
	}
	:global(.mp-btn-add--armed:hover:not(:disabled)) {
		filter: brightness(1.1);
	}

	/* Measure-ruler overlay drawn inside the world-coord SVG. Colour is
	   the app accent so it reads as a UI overlay, not map content; the
	   dashed line makes it easy to tell from a marker's radial link. */
	:global(.mp-measure-line) {
		stroke: var(--text-accent);
		stroke-width: 2;
		stroke-dasharray: 6 4;
		stroke-linecap: round;
		stroke-linejoin: round;
		pointer-events: none;
	}
	/* Waypoint dot: `r` is in the map's world units (grid cells), and
	   the halo is a narrow world-unit stroke rather than a
	   non-scaling-stroke — iOS Safari doesn't honour non-scaling-stroke
	   on descendants of an SVG with `preserveAspectRatio: none`, so a
	   `stroke-width: 1.5` there would render as 1.5 world units (~40 px
	   at typical mobile scales), which is what the initial ruler
	   commit shipped and looked like a giant translucent blob. Small
	   world-unit values keep the render consistent between desktop and
	   mobile. */
	:global(.mp-measure-dot) {
		fill: var(--text-accent);
		stroke: #fff;
		stroke-width: 0.02;
		pointer-events: none;
	}
	:global(.mp-measure-total) {
		font-family: var(--font-ui);
		font-weight: 700;
		fill: var(--text-accent);
		pointer-events: none;
	}
	:global(.mp-canvas svg) {
		display: block;
		user-select: none;
		/* SVG's own width/height attributes drive the size — CSS shouldn't
		   stretch it or the zoom math goes sideways. */
	}

	/* Background image + placeholder. The placeholder rect + label
	   show while the real <image> is on the wire; the image is
	   rendered on top with opacity 0, then eased in to 1 by
	   `.mp-bg-image-loaded` once its native `onload` fires. */
	:global(.mp-bg-placeholder) {
		fill: color-mix(in srgb, var(--bg-inset) 88%, var(--text));
	}
	:global(.mp-bg-placeholder-text) {
		font-family: var(--font-ui);
		font-size: 0.4px;
		font-weight: 600;
		fill: var(--text-dimmer);
		font-style: italic;
	}
	:global(.mp-bg-image) {
		opacity: 0;
		transition: opacity 180ms ease-out;
	}
	:global(.mp-bg-image-loaded) {
		opacity: 1;
	}

	/* Grid line strokes — minor (sub-cell subdivisions) render a hair
	   thinner than major (base cells) so users can tell them apart at a
	   glance without the minor lines dominating. Non-scaling stroke on
	   the elements themselves keeps both weights consistent across zoom. */
	:global(.mp-grid-line) {
		stroke: var(--text);
		stroke-width: 0.6;
		fill: none;
	}
	:global(.mp-grid-major) {
		stroke-width: 1.2;
	}
	/* "Show grid" toggle off — lines vanish but clicks still land on
	   the underlying grid. */
	:global(.mp-grid-layer-hidden .mp-grid-line) {
		stroke: transparent;
	}

	:global(.mp-grid-capture) {
		cursor: pointer;
	}

	/* Scale bar overlay — parchment-style black-and-white with a soft
	   drop-shadow so it reads over both light and dark map images. */
	:global(.mp-scale-tick) {
		font-family: var(--font-ui);
		font-size: 9px;
		font-weight: 600;
		fill: #111;
		paint-order: stroke fill;
		stroke: #fff;
		stroke-width: 2.5px;
		stroke-linejoin: round;
	}
	:global(.mp-scale-unit) {
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

	:global(.mp-marker) {
		pointer-events: none;
	}
	/* Selected marker owns its own pointer/touch: pointer-events: auto so
	   a tap lands on the icon (not the capture rect below), and
	   touch-action: none so a mobile finger-drag on it moves the marker
	   instead of the browser stealing the gesture as a native pan of the
	   .mp-canvas container. Only the selected marker takes this — every
	   other marker still falls through to markersAt hit-testing via the
	   capture rect, so panning from anywhere else on the map still works
	   naturally. */
	:global(.mp-marker-selected) {
		filter: drop-shadow(0 0 3px var(--text-accent));
		pointer-events: auto;
		touch-action: none;
	}
	/* Selection outline — a bright square around the snap-cell the
	   selected marker sits in. Sizes with the sub-grid at current zoom
	   so it always matches the granularity the user is placing at. */
	:global(.mp-marker-selection) {
		fill: none;
		stroke: var(--text-accent);
		stroke-width: 2;
		pointer-events: none;
	}
	:global(.mp-marker-dragging) {
		opacity: 0.85;
	}
	:global(.mp-drag-snap) {
		fill: none;
		stroke: var(--text-accent);
		stroke-width: 2;
		pointer-events: none;
	}
	/* Cursor cue for markers under the pointer (only when not in placing
	   mode, since placing has its own crosshair cue). Since the grid-
	   capture rect is what receives the pointer, we can't target markers
	   directly for hover cursor — but a `grab` cursor over the whole
	   canvas would be misleading. Leave the default `pointer` on the
	   capture rect and rely on the drag threshold to feel discoverable. */
	:global(.mp-marker-icon) {
		overflow: visible;
	}
	/* `vector-effect` is NOT inherited per the SVG spec, so setting it
	   on the wrapping <g> doesn't reach the child <path> elements
	   pulled in via `{@html ic.inner}`. Force it on every descendant
	   here so the icon halo renders at 2 device pixels — same weight
	   as the label halo. Without this the stroke was being interpreted
	   in the icon's local viewBox coords (~2/640 of an icon unit,
	   invisible). */
	:global(.mp-marker-icon *) {
		vector-effect: non-scaling-stroke;
	}
	:global(.mp-marker-label) {
		/* Font size is in world units at zoom 1. The parent `<g>` applies
		   `scale(1/zoom)`, which cancels the zoom so labels render at a
		   constant screen size at any zoom level. Fill is set inline to
		   the marker's colour so the label reads as the annotation, not
		   as generic body text. Stroke uses `vector-effect: non-scaling-
		   stroke` (set on the element) so `1` translates to 1 device
		   pixel — a crisp white halo that traces cleanly against a
		   busy background map. Labels never capture pointer events —
		   they can extend well past the icon (esp. position: right /
		   top-right / etc), and a tap on the far end of the label should
		   not arm a drag or block a mobile pan gesture that starts
		   there. Only the icon captures.
		   No `text-anchor` here on purpose — each label carries its own
		   text-anchor attribute (start/middle/end) matching its position
		   (labelPlacement). A CSS `text-anchor` here beats the SVG
		   presentation attribute per the spec, which used to force every
		   label to `middle` and made left/right positioned labels sit
		   centered on their anchor point instead of aligning to the far
		   side of it — so a `left` label overlapped the icon by half its
		   width.
		   Font: Fira Sans — a humanist sans that stays legible at label
		   size under the halo (the serif it replaced, EB Garamond, broke
		   up there: thin strokes, small x-height), with real bold (loaded
		   at 400/700/800) and true italics for each (see app.html).
		   Small caps go through `font-variant: small-caps` (see
		   labelStyleCss), browser-synthesised from its caps. Falls back
		   through the UI stack when Fira Sans isn't available. */
		font-family: 'Fira Sans', var(--font-ui);
		font-size: calc(0.24px * var(--label-size-mult, 1));
		font-weight: 400;
		paint-order: stroke fill;
		pointer-events: none;
		/* Halo colour is set inline per marker via `--halo` (haloColor of
		   the label colour): white behind a dark label, black behind a
		   light one so it never vanishes on a light map. Falls back to
		   white when `--halo` is absent. */
		stroke: var(--halo, #fff);
		stroke-width: 2;
		stroke-linejoin: round;
	}
	/* Doubled on mobile so labels stay legible when the whole map
	   is inside a phone-width viewport. Matches the ICON_SIZE
	   doubling in the marker render loop. Mobile keeps stroke-width
	   at 1 device px: phone displays are 2–3× DPR, so a non-scaling-
	   `stroke-width: 1` already renders as a thicker halo there, and
	   the desktop bump (2) would swallow the label glyphs. */
	@media (max-width: 640px) {
		:global(.mp-marker-label) {
			font-size: calc(0.48px * var(--label-size-mult, 1));
			stroke-width: 1;
		}
	}
	/* Label-only markers (no icon chosen) centre both axes on the point
	   instead of sitting below where the icon would be. */
	:global(.mp-marker-label--centered) {
		dominant-baseline: central;
	}
</style>
