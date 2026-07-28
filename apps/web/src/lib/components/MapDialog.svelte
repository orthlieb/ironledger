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
	 * indexed at build time into $lib/generated/mapIconManifest. New
	 * markers get the default icon+color; users override via the
	 * selection toolbar's "Change icon…" nested picker dialog.
	 *
	 * Follows CLAUDE.md's iOS-safe dialog rules: `vh` (not `dvh`), centred
	 * via top:50%+transform, no `display: flex` on the dialog itself,
	 * max-height on the scrollable body with overscroll-behavior: contain.
	 */

	import { untrack } from 'svelte';
	import { headingText } from '$lib/fontStore.svelte.js';
	import DialogHeader from './DialogHeader.svelte';
	import MapOptionsDialog from './MapOptionsDialog.svelte';
	import { mapSettings, persistMapSettings } from '$lib/mapSettingsStore.svelte.js';
	import iconTrashSvg from '$icons/trash-solid-full.svg?raw';
	import iconExpandSvg from '$icons/expand-solid-full.svg?raw';
	import iconZoomInSvg from '$icons/magnifying-glass-plus-solid-full.svg?raw';
	import iconZoomOutSvg from '$icons/magnifying-glass-minus-solid-full.svg?raw';
	import iconGearSvg from '$icons/gear-solid-full.svg?raw';
	import iconAngleSvg from '$icons/angle-solid-full.svg?raw';
	import iconPaletteSvg from '$icons/palette-solid-full.svg?raw';

	/** Strip the outer `<svg>` wrapper + FontAwesome licence comment so
	 *  the palette icon's paths can be re-wrapped in our own `<svg>`
	 *  with the halo `<g>` cascade applied. Runs once at module load. */
	const paletteInner = iconPaletteSvg
		.replace(/<svg\b[^>]*>|<\/svg>/g, '')
		.replace(/<!--[\s\S]*?-->/g, '');
	import iconCaretDownSvg from '$icons/caret-large-down-solid.svg?raw';
	import { Dialog, Popover, Command } from 'bits-ui';
	import searchIconSvg from '$icons/magnifying-glass-solid-full.svg?raw';
	// Shared kind metadata (colour, icon, label). Same source of truth
	// the Connections rail + Expeditions spines will read from once
	// they're updated, so accents and glyphs stay in lockstep.
	import { ENTITY_KIND_META } from '$lib/entityKinds.js';
	import { tooltip } from '$lib/actions/tooltip.js';
	import {
		DEFAULT_MAP_ASPECT,
		DEFAULT_MARKER_COLOR,
		DEFAULT_MARKER_ICON,
		gridDimsForAspect,
		resolveMapIcon,
		snapResolutionForZoom,
		subGridOctaveForZoom,
	} from '$lib/mapConstants.js';
	import {
		MAP_ICON_CATEGORIES,
		MAP_ICON_LIST,
		type MapIcon,
	} from '$lib/generated/mapIconManifest.js';
	import { gridLineOffsets, isMajorLine, snapCoord } from '$lib/mapGeometry.js';
	import {
		mapState,
		mapListState,
		markersAt,
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
	} from '$lib/mapStore.svelte.js';
	import { downscaleImage, MapImageError } from '$lib/mapImage.js';
	import { exportMapPng, exportMapZip } from '$lib/mapExport.js';
	import { getLinkableEntities, resolveEntity } from '$lib/mapEntityLinks.js';
	// @simonwep/pickr — MIT, dep-free, framework-agnostic colour picker.
	// Replaces the native <input type="color"> whose macOS chrome is
	// jarring and eats a lot of screen. The Nano theme is the smallest
	// build (~4 KB CSS) and matches our toolbar footprint.
	import Pickr from '@simonwep/pickr';
	import '@simonwep/pickr/dist/themes/nano.min.css';

	// Module-level guard so only one <MapDialog /> instance in the page
	// registers the `ironledger:export-map` listener at a time — matters
	// because both ExpeditionsArea and CommunitiesArea mount their own
	// MapDialog for the entity-owned map button (Phase 3 wiring). Without
	// this the hamburger's "Export" would run the listener twice and the
	// user would get two PNGs downloaded per click.
	const _exportClaim: { owner: unknown } = { owner: null };

	// bits-ui Dialog open flag + Content ref. The ref is needed for:
	//   - the sizing $effect (ResizeObserver + inline style.width/height)
	//   - Pickr's `container` option (colour-picker popover anchor)
	//   - the keyboard handler's "is the dialog actually open?" guard
	// bits-ui exposes `bind:ref` on `Dialog.Content` for exactly this.
	let dialogOpen = $state(false);
	let dialogEl = $state<HTMLElement | null>(null);
	let optionsDialogRef = $state<{ open(): void; close(): void } | null>(null);
	// Icon-picker sub-dialog — bits-ui Dialog too. `iconSearchInputEl`
	// is refocused explicitly on every open (autofocus attribute only
	// fires on first mount, but bits-ui Content unmounts on close so
	// each re-open is a fresh mount — kept the explicit focus anyway
	// for defence in depth).
	let iconDialogOpen = $state(false);
	// Bound to the icon picker's search input so `openIconPicker` can
	// focus it explicitly on every open. HTML `autofocus` on the input
	// alone only fires the first time the input mounts — this dialog
	// stays in the DOM across opens (unlike bits-ui Content), so we
	// re-focus manually.
	let iconSearchInputEl = $state<HTMLInputElement | null>(null);
	let fileInputEl = $state<HTMLInputElement | null>(null);
	let uploadError = $state('');
	let iconSearch = $state('');

	// Map picker chip state — Popover open/close driven by bits-ui. The
	// combobox itself lives in the template (`Popover.Root` +
	// `Command.Root`); this state just lets the pick handlers below
	// dismiss the popover after committing a choice.
	let mapPickerOpen = $state(false);
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
		void initMap().then(async () => {
			if (target?.mapId && target.mapId !== mapState.activeId) {
				await switchMap(target.mapId);
			}
			if (target?.markerId) {
				selectedMarkerId = target.markerId;
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

	function handleExportPng() {
		if (!svgEl) return;
		void exportMapPng(svgEl);
	}
	function handleExportZip() {
		void exportMapZip({
			name: mapState.name || 'Untitled Map',
			markers: mapState.markers,
			settings: mapState.settings,
			backgroundUrl: backgroundUrl(),
		});
	}

	/**
	 * External export bridge — the hamburger menu's Export dialog routes
	 * Map exports through here so the user doesn't have to open the map
	 * to grab a snapshot. Loads the map state on demand (initMap is
	 * idempotent) so the export works even if the dialog has never been
	 * opened in this session. The `format: 'json'` alias is kept so
	 * older menu builds still resolve to a zip.
	 *
	 * MapDialog is mounted twice on the home page (once each by
	 * ExpeditionsArea + CommunitiesArea for the entity-owned map
	 * buttons). Without the module-level `_exportClaim` guard both
	 * instances would run this handler on every export click and the
	 * user would get two PNGs downloaded for one click.
	 */
	$effect(() => {
		if (_exportClaim.owner !== null) return; // another MapDialog already listening
		_exportClaim.owner = handleExportEvent;
		const handler = (e: Event) => handleExportEvent(e);
		document.addEventListener('ironledger:export-map', handler);
		return () => {
			document.removeEventListener('ironledger:export-map', handler);
			_exportClaim.owner = null;
		};
	});

	function handleExportEvent(e: Event) {
		const format = (e as CustomEvent<{ format?: string }>).detail?.format;
		void initMap().then(() => {
			if (format === 'png') handleExportPng();
			else if (format === 'zip' || format === 'json') handleExportZip();
		});
	}

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
			for (const e of entries) {
				const r = e.contentRect;
				if (r.width > 0) canvasPxW = r.width;
				if (r.height > 0) canvasPxH = r.height;
			}
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

		let raf: number | null = null;
		const settle = () => {
			raf = null;
			const bodyEl = el.querySelector('.mp-body') as HTMLElement | null;
			if (!bodyEl) return;
			const ahh = bodyEl.offsetTop;
			if (ahh < 0) return;
			const maxIW = 0.8 * window.innerWidth;
			const maxIH = Math.max(0, 0.8 * window.innerHeight - ahh);
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

	// ─── Placing mode + selection ──────────────────────────────────────────────
	/**
	 * "Placing mode": armed by the toolbar "+ Add" button. The very next
	 * grid click drops a fresh marker at that intersection and selects it.
	 * Clicks on empty grid outside placing mode do nothing — no more
	 * accidental markers from a stray tap.
	 */
	let placingMode = $state(false);

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

	/** Snap world coords to the deepest visible sub-grid intersection and
	 *  clamp to the map bounds so a click at the edge doesn't produce an
	 *  out-of-range marker. */
	function snapAndClamp(coord: { x: number; y: number }): { x: number; y: number } {
		const s = snapCoord(coord, zoom);
		return {
			x: Math.max(0, Math.min(gridDims.cols, s.x)),
			y: Math.max(0, Math.min(gridDims.rows, s.y)),
		};
	}

	/** Select or jump for an existing marker. `forceEdit` bypasses the
	 *  entity-link jump and always opens the editor (used by shift-click,
	 *  long-press, and placing-mode clicks on occupied intersections). */
	function activateExisting(x: number, y: number, forceEdit: boolean): boolean {
		const existing = markersAt(x, y, zoom)[0];
		if (!existing) return false;
		if (!forceEdit) {
			const link = resolveEntity(existing.entityId);
			if (link) {
				document.dispatchEvent(
					new CustomEvent('ironledger:focus-entity', {
						detail: { kind: link.kind, id: link.id },
					}),
				);
				close();
				return true;
			}
		}
		selectedMarkerId = existing.id;
		return true;
	}

	function placeAt(x: number, y: number) {
		const id = addMarker({
			x,
			y,
			label: '',
			icon: DEFAULT_MARKER_ICON,
			color: DEFAULT_MARKER_COLOR,
		});
		selectedMarkerId = id;
		placingMode = false;
		clearSquareSelection();
	}

	// ─── Drag-to-move + pile-up popover ────────────────────────────────────────
	/**
	 * Drag state. Populated on pointerdown when a marker sits at the
	 * click's snap point; upgraded to a live drag once the pointer has
	 * moved past `DRAG_THRESHOLD_PX`. Coords are world units; the marker's
	 * visual `x, y` is overridden by `snapCoord(liveX, liveY, zoom)` while
	 * dragging so the icon jumps between snap intersections as the user
	 * moves — feels tactile and previews exactly where the drop will land.
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
		// Same routing as a normal marker click: linked → jump; else → select.
		const link = resolveEntity(m.entityId);
		if (link) {
			document.dispatchEvent(
				new CustomEvent('ironledger:focus-entity', {
					detail: { kind: link.kind, id: link.id },
				}),
			);
			close();
			return;
		}
		selectedMarkerId = m.id;
	}

	/**
	 * Grid click. Behaviour depends on state:
	 *  • Placing mode on + empty spot → place marker + select it.
	 *  • Placing mode on + occupied spot → cancel placing, select existing.
	 *  • Snap point with >1 markers → open pile-up popover to disambiguate.
	 *  • Existing marker w/ link + bare click → jump to entity.
	 *  • Existing marker w/ shift-click → open editor.
	 *  • Empty spot outside placing mode → highlight it as `selectedSquare`
	 *    so the "+ Marker" button knows where to drop the next pin without
	 *    the user needing to re-tap.
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
		const { x, y } = snapAndClamp(eventToWorld(ev));
		const hits = markersAt(x, y, zoom);
		if (placingMode) {
			if (hits.length === 1) {
				selectedMarkerId = hits[0].id;
				clearSquareSelection();
			} else if (hits.length > 1) {
				openPilePicker(hits, ev);
				clearSquareSelection();
			} else {
				placeAt(x, y);
			}
			placingMode = false;
			return;
		}
		if (hits.length > 1) {
			openPilePicker(hits, ev);
			clearSquareSelection();
			return;
		}
		if (hits.length === 1) {
			activateExisting(x, y, ev.shiftKey);
			clearSquareSelection();
			return;
		}
		// Empty grid click: highlight the snap point as the target for
		// the next "+ Marker" press. Clear any marker selection so the
		// toolbar switches back to its hint state.
		selectedSquare = { x, y };
		selectedMarkerId = null;
	}

	function onGridPointerDown(e: PointerEvent) {
		// Long-press timer for touch (opens editor even on a linked marker).
		if (e.pointerType !== 'mouse') {
			longPressFired = false;
			if (longPressTimer) clearTimeout(longPressTimer);
			const { x, y } = snapAndClamp(eventToWorld(e));
			longPressTimer = setTimeout(() => {
				longPressFired = true;
				longPressTimer = null;
				// Cancel any pending drag intent — long-press wins.
				dragState = null;
				activateExisting(x, y, true);
			}, LONG_PRESS_MS);
		}
		// Drag intent — arm if there's a marker at this snap point. We
		// only *commit* to dragging once the pointer moves past the
		// threshold, so a static tap still routes as a normal click.
		const { x, y } = snapAndClamp(eventToWorld(e));
		const hit = markersAt(x, y, zoom)[0];
		if (!hit) return;
		try {
			(e.currentTarget as SVGRectElement).setPointerCapture(e.pointerId);
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
	}

	function onGridPointerMove(e: PointerEvent) {
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
		if (!dragState) return;
		const state = dragState;
		dragState = null;
		try {
			(e.currentTarget as SVGRectElement).releasePointerCapture(e.pointerId);
		} catch {
			// Best-effort — capture may have already been released.
		}
		if (!state.moved) return; // static tap — let onGridClick handle it
		const snapped = snapAndClamp({ x: state.liveX, y: state.liveY });
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
		dragState?.moved ? snapAndClamp({ x: dragState.liveX, y: dragState.liveY }) : null,
	);

	/** "+ Marker" button. If a square is already selected (user tapped
	 *  an empty snap point), drop the marker there immediately — no
	 *  placing-mode dance required. Otherwise fall through to placing
	 *  mode as a fallback for users who prefer the button-first flow. */
	function addMarkerAction() {
		if (selectedSquare) {
			placeAt(selectedSquare.x, selectedSquare.y);
			return;
		}
		placingMode = !placingMode;
		if (placingMode) selectedMarkerId = null;
	}
	function cancelPlacing() {
		placingMode = false;
	}

	function onLabelInput(e: Event) {
		if (!selectedMarker) return;
		updateMarker(selectedMarker.id, { label: (e.target as HTMLInputElement).value });
	}

	// ─── Pickr (marker colour) ─────────────────────────────────────────────
	// Pickr is instantiated once per selection-toolbar mount. Two
	// $effects: one to create/tear down when the anchor element comes
	// and goes, one to sync the widget's colour when a different
	// marker is selected (silent: true so it doesn't fire our own
	// change handler and cause a feedback loop).
	let pickrAnchor = $state<HTMLButtonElement | null>(null);
	let pickr: Pickr | null = null;

	/** Seven-char `#rrggbb` (no alpha) — Pickr's HEXA output ends `ff`
	 *  for the fully-opaque colours we always store; trim so the round
	 *  trip against `<input type="color">` compatible fields stays
	 *  clean. */
	function normalizeHex(color: string): string {
		return color.startsWith('#') ? color.slice(0, 7).toLowerCase() : color;
	}

	$effect(() => {
		if (!pickrAnchor || !dialogEl) return;
		const anchor = pickrAnchor;
		// `untrack` the initial color read so this effect ONLY re-runs
		// when the anchor element (or the parent dialog) actually
		// changes. Without it, every colour edit fed `selectedColor`
		// back into the effect, which destroyed + recreated the
		// picker mid-use — the "picker went poof after I picked a
		// colour" bug. External colour syncs go through the second
		// `$effect` below via `pickr.setColor(c, true)`.
		const initialColor = untrack(() => selectedColor);
		const instance = Pickr.create({
			el: anchor,
			// Anchor the popover INSIDE the dialog. Native <dialog>
			// lives in the browser top layer, so a Pickr appended to
			// document.body renders beneath it and clicks pass through.
			// Attaching inside the dialog keeps the popover in the same
			// top-layer scope.
			container: dialogEl,
			// Use our own `<button>` (with the palette icon coloured by
			// selectedColor) as the trigger instead of Pickr's default
			// round swatch chip. Pickr skips its own button chrome and
			// treats the anchor element as the button, so it opens the
			// popover on click and keeps `--pcr-color` off our element.
			useAsButton: true,
			theme: 'nano',
			default: initialColor,
			// Pickr's built-in swatch row — same eight tabletop-friendly
			// hues the old preset strip carried before the native input
			// took over. Keeps common picks one tap away without opening
			// the wheel.
			swatches: [
				'#e63946',
				'#f4a261',
				'#e9c46a',
				'#2a9d8f',
				'#457b9d',
				'#8e44ad',
				'#111111',
				'#f1faee',
			],
			components: {
				preview: true,
				opacity: false,
				hue: true,
				interaction: {
					hex: true,
					input: true,
					clear: false,
					save: false,
				},
			},
		});
		instance.on('change', (c: ReturnType<Pickr['getColor']>) => {
			if (!selectedMarker) return;
			updateMarker(selectedMarker.id, { color: normalizeHex(c.toHEXA().toString()) });
			// Pickr only refreshes the trigger chip's `--pcr-color` inside
			// applyColor(), which normally fires on Save. We removed the
			// Save button (save: false), so nudge applyColor() ourselves
			// on every live change — otherwise the chip keeps showing
			// the previous colour while the marker icon has already moved
			// on. Guarded with a try/catch because applyColor emits 'save'
			// which some Pickr versions choke on when save UI is disabled.
			try {
				instance.applyColor(true);
			} catch {
				/* known: applyColor's save-emit path when save:false */
			}
		});
		pickr = instance;
		return () => {
			// Pickr's teardown races with pending tap/pointer events on
			// its internal wheel: `_tapstop` / `_tapmove` fire from
			// document-level listeners after `destroyAndRemove()` has
			// nulled the instance's internal color/emitter, throwing
			// "Cannot read properties of null". Swallow — the picker is
			// gone either way. The user just closed the toolbar.
			try {
				instance.destroyAndRemove();
			} catch {
				/* known Pickr teardown race */
			}
			if (pickr === instance) pickr = null;
		};
	});

	// Sync widget → selection when the picked marker (or another
	// surface) changes its colour behind our back. Uses setColor
	// silent so we don't feed the change back through updateMarker.
	$effect(() => {
		const c = selectedColor;
		const p = pickr;
		if (!p) return;
		const cur = normalizeHex(p.getColor()?.toHEXA().toString() ?? '');
		if (cur !== c.toLowerCase()) p.setColor(c, true);
	});

	/** Normalise a rotation to `[0, 360)` for display + storage. `undefined`
	 *  → 0 (default rotation for legacy markers). Non-finite → 0 so a stray
	 *  NaN doesn't invalidate the SVG transform. */
	function normalizeAngle(a: number | undefined): number {
		if (typeof a !== 'number' || !Number.isFinite(a)) return 0;
		const n = a % 360;
		return n < 0 ? n + 360 : n;
	}

	/** Selection-toolbar angle input handler. Coerces the raw string via
	 *  parseFloat + normalises so wraps (say, typing 370) land at 10°. */
	function onAngleInput(e: Event) {
		if (!selectedMarker) return;
		const raw = (e.target as HTMLInputElement).value;
		const n = parseFloat(raw);
		updateMarker(selectedMarker.id, { angle: Number.isFinite(n) ? normalizeAngle(n) : 0 });
	}

	/** Angle currently displayed in the spinner — always in `[0, 360)`. */
	const selectedAngle = $derived(normalizeAngle(selectedMarker?.angle));

	/** Step the marker's angle by ±15°. iOS Safari doesn't render the
	 *  native number-input spinner arrows, so we surface explicit +/−
	 *  buttons next to the text — otherwise touch users can only edit
	 *  the angle by typing. */
	function stepAngle(delta: number) {
		if (!selectedMarker) return;
		updateMarker(selectedMarker.id, { angle: normalizeAngle(selectedAngle + delta) });
	}

	// ─── Entity-link picker (searchable) ───────────────────────────────────────
	// Marker link picker — bits-ui Popover + Command (shadcn-svelte
	// combobox pattern). The trigger is a text-field-shaped button
	// that shows the current linked entity name (or a placeholder);
	// clicking opens a popover with its own search input at the top
	// and a filtered list below. Bits-ui handles the search, keyboard
	// nav, and focus trap; we just supply the sorted item list. The
	// popover portals into `dialogEl` so it renders on top of the
	// map dialog's own top-layer instead of behind it.
	let entityPickerOpen = $state(false);
	// Alias so the shared kind metadata (community / place / journey /
	// site — NPCs aren't linkable from a marker) reads locally with a
	// short name at each render site.
	const KIND_META = ENTITY_KIND_META;

	/** Linkable entities sorted A-Z for stable presentation. Command
	 *  will filter this list by input text via each Item's `value`
	 *  (textContent) match, so we don't do our own substring filter. */
	const sortedLinkableEntities = $derived(
		getLinkableEntities()
			.slice()
			.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
	);

	/** Commit an entity-link choice. `value` is "" to clear or
	 *  "kind:id" to link. Same auto-fill-label behaviour as the old
	 *  onEntityChange — if the marker has no label yet, adopt the
	 *  linked entity's name. */
	function pickEntity(value: string) {
		if (!selectedMarker) return;
		const patch: { entityId?: string; label?: string } = { entityId: value || undefined };
		if (value && !selectedMarker.label.trim()) {
			const link = resolveEntity(value);
			if (link) patch.label = link.name;
		}
		updateMarker(selectedMarker.id, patch);
		entityPickerOpen = false;
	}

	function deleteSelected() {
		if (!selectedMarker) return;
		removeMarker(selectedMarker.id);
		selectedMarkerId = null;
	}

	// ─── Selected square — a snap point the user tapped without a marker
	//     on it. Rendered with the same outline the selected marker uses;
	//     acts as the target for "+ Marker" so the button doesn't need to
	//     explain where the new marker lands. Cleared on marker click,
	//     map switch, or after a marker is placed. ─────────────────────
	let selectedSquare = $state<{ x: number; y: number } | null>(null);
	function clearSquareSelection() {
		selectedSquare = null;
	}

	/** Keyboard shortcut router. Only handles Escape for the pile
	 *  picker — a non-dialog floating menu that would otherwise be
	 *  bypassed and let Escape close the whole map. The entity-link
	 *  picker is a nested `<dialog>` now, so its native Escape handler
	 *  (wired via `oncancel`) closes it before Escape can reach the
	 *  parent. */
	$effect(() => {
		const handler = (ev: KeyboardEvent) => {
			if (!dialogOpen) return;
			if (ev.key === 'Escape' && pilePicker) {
				ev.preventDefault();
				ev.stopPropagation();
				closePilePicker();
				return;
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

	function openIconPicker() {
		if (!selectedMarker) return;
		iconSearch = '';
		iconDialogOpen = true;
		// Focus lands on the search input via `onOpenAutoFocus` on
		// Dialog.Content — no manual rAF needed now that bits-ui
		// unmounts/remounts Content on each open.
	}
	function closeIconPicker() {
		iconDialogOpen = false;
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
	const ICON_SIZE = $derived(isMobileViewport ? 0.84375 : 0.421875);
	/** Vertical gap between the icon's bottom and the label's baseline,
	 *  in world units. Scales with the icon so proportions stay stable. */
	const LABEL_GAP = $derived(isMobileViewport ? 0.36 : 0.18);

	// Derive the selected marker's icon record + color for the toolbar so
	// the icon button always shows the current preview.
	const selectedIcon = $derived(selectedMarker ? resolveMapIcon(selectedMarker.icon) : undefined);
	const selectedColor = $derived(selectedMarker?.color || DEFAULT_MARKER_COLOR);

	/** Snap resolution at the current zoom — surfaced in the toolbar hint
	 *  so users know the granularity they're placing at. */
	const snapRes = $derived(snapResolutionForZoom(zoom));
</script>

<Dialog.Root bind:open={dialogOpen}>
	<Dialog.Portal>
		<Dialog.Overlay class="mp-overlay" />
		<Dialog.Content bind:ref={dialogEl} class="mp-dialog">
			<DialogHeader title={headingText('Edit Map')} onclose={close} />

			<div class="mp-toolbar">
				<div class="mp-tools mp-tools-map">
					<!-- Map switcher — shadcn-style combobox (Popover + Command).
			     Same visual + interaction as the marker link picker so
			     the two chips on the dialog stay consistent. Sits alone on
			     the first row so long map names never crowd out the zoom
			     controls at phone widths. -->
					<Popover.Root bind:open={mapPickerOpen}>
						<Popover.Trigger
							class="mp-combobox mp-picker-btn"
							aria-label="Switch, create, or manage maps"
						>
							<span class="mp-combobox-value">{mapState.name || 'Map'}</span>
							<span class="mp-combobox-caret" aria-hidden="true">{@html iconCaretDownSvg}</span>
						</Popover.Trigger>
						<Popover.Portal>
							<Popover.Content
								class="mp-cmd-popover"
								sideOffset={4}
								align="start"
								collisionPadding={8}
							>
								<Command.Root class="mp-cmd">
									<div class="mp-cmd-search-row">
										<span class="mp-cmd-search-icon" aria-hidden="true">{@html searchIconSvg}</span>
										<Command.Input class="mp-cmd-search" placeholder="Search maps…" autofocus />
									</div>
									<Command.List class="mp-cmd-list">
										<Command.Empty class="mp-cmd-empty">No matching maps.</Command.Empty>
										{#each mapListState.maps as m (m.id)}
											<Command.Item
												class="mp-cmd-item"
												value={m.name}
												onSelect={() => pickMap(m.id)}
											>
												<span class="mp-cmd-check" aria-hidden="true">
													{#if m.id === mapState.activeId}
														<svg
															viewBox="0 0 20 20"
															fill="none"
															stroke="currentColor"
															stroke-width="2.5"
															><polyline
																points="4 11 8 15 16 6"
																stroke-linecap="round"
																stroke-linejoin="round"
															></polyline></svg
														>
													{/if}
												</span>
												<span class="mp-cmd-item-name">{m.name}</span>
											</Command.Item>
										{/each}
										{#if mapListState.maps.length > 0}
											<Command.Separator class="mp-cmd-sep" />
										{/if}
										<Command.Item
											class="mp-cmd-item mp-cmd-item--action"
											value="+ New map"
											onSelect={pickNewMap}
										>
											<span class="mp-cmd-check" aria-hidden="true"></span>
											<span class="mp-cmd-item-name">+ New map…</span>
										</Command.Item>
									</Command.List>
								</Command.Root>
							</Popover.Content>
						</Popover.Portal>
					</Popover.Root>
				</div>
				<div class="mp-tools mp-tools-actions">
					<button
						class="mp-btn mp-btn-add"
						class:mp-btn-add-active={placingMode}
						onclick={addMarkerAction}
						use:tooltip={selectedSquare
							? 'Add a marker on the selected square'
							: 'Click a square, then + Marker. Tap a linked marker to jump; shift-click (desktop) or long-press (touch) to edit instead.'}
						aria-pressed={placingMode}
						aria-label="Add marker">+ Marker</button
					>
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
						<button
							class="mp-btn mp-btn-icon"
							onclick={zoomFit}
							disabled={zoom === 1}
							use:tooltip={'Fit map to view (100%)'}
							aria-label="Fit to view">{@html iconExpandSvg}</button
						>
					</div>
					<button
						class="mp-btn mp-btn-icon mp-btn-gear"
						onclick={() => optionsDialogRef?.open()}
						use:tooltip={'Map options — names, grid, scale bar, danger zone'}
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
		Selection toolbar. Sits above the map so it never scrolls off, but
		only renders when there's something to do — a marker is selected /
		just created (editable fields), placing mode is on ("click the map
		to place a marker" + Cancel), or a square is selected ("hit +
		Marker to drop here" + Cancel). The idle-state "how to use" hint
		lives on the + Marker button's tooltip so the toolbar band doesn't
		steal vertical space on mobile.
	-->
			{#if selectedMarker || placingMode || selectedSquare}
				<div class="mp-sel-toolbar">
					{#if selectedMarker}
						<input
							class="mp-sel-name"
							type="text"
							placeholder="Marker name…"
							value={selectedMarker.label}
							oninput={onLabelInput}
							use:tooltip={'Name shown under the icon (or centred on the point when no icon is chosen)'}
						/>
						<button
							class="mp-sel-icon-btn"
							onclick={openIconPicker}
							use:tooltip={selectedIcon
								? `Change icon (currently ${selectedIcon.label})`
								: 'Change icon (currently label-only)'}
							aria-label="Change icon"
						>
							{#if selectedIcon}
								<!-- Same 2-device-pixel white halo the map markers use so
						     a light icon colour still reads against dark
						     `--bg-control`. `paint-order="stroke"` puts the halo
						     behind the fill; `vector-effect="non-scaling-stroke"`
						     pins the width to display pixels regardless of the
						     icon's own viewBox scale. -->
								<svg viewBox={selectedIcon.viewBox} aria-hidden="true">
									<g
										fill={selectedColor}
										stroke="#fff"
										stroke-width="2"
										stroke-linejoin="round"
										paint-order="stroke"
										vector-effect="non-scaling-stroke"
									>
										{@html selectedIcon.inner}
									</g>
								</svg>
							{:else}
								<span class="mp-sel-icon-none" aria-hidden="true">Aa</span>
							{/if}
						</button>
						<!-- Pickr colour widget — the native macOS/Windows `<input
			     type="color">` opens a heavy OS dialog that eats the
			     screen. Pickr is a self-contained JS wheel + swatches
			     that lives in-page. We render our own button (palette
			     icon coloured by the picked colour, with the same
			     white halo the marker icons use) and pass
			     `useAsButton: true` so Pickr uses it as the trigger
			     directly instead of injecting its own round swatch. -->
						<button
							type="button"
							class="mp-sel-color-btn"
							style="color: {selectedColor}"
							bind:this={pickrAnchor}
							use:tooltip={'Icon colour — click to open the picker'}
							aria-label="Icon colour"
						>
							<svg viewBox="0 0 640 640" aria-hidden="true">
								<g
									fill="currentColor"
									stroke="#fff"
									stroke-width="2"
									stroke-linejoin="round"
									paint-order="stroke"
									vector-effect="non-scaling-stroke"
								>
									{@html paletteInner}
								</g>
							</svg>
						</button>
						<!-- Angle spinner — explicit − / + buttons flank the number
			     input because iOS Safari doesn't render the native
			     <input type="number"> step arrows, so touch users would
			     otherwise be stuck typing. Bare wheel/keyboard step still
			     works on desktop via the input itself. Uses degree symbol
			     as the label so a narrow toolbar still fits. -->
						<div class="mp-sel-angle" role="group" aria-label="Marker rotation">
							<button
								type="button"
								class="mp-sel-angle-step"
								onclick={() => stepAngle(-15)}
								use:tooltip={'Rotate 15° counter-clockwise'}
								aria-label="Rotate counter-clockwise">−</button
							>
							<label
								class="mp-sel-angle-field"
								use:tooltip={'Rotation in degrees (0 = up, clockwise)'}
							>
								<span class="mp-sel-angle-glyph" aria-hidden="true">{@html iconAngleSvg}</span>
								<input
									class="mp-sel-angle-input"
									type="number"
									min="0"
									max="359"
									step="15"
									value={selectedAngle}
									oninput={onAngleInput}
									aria-label="Marker rotation in degrees"
								/>
								<span class="mp-sel-angle-unit" aria-hidden="true">°</span>
							</label>
							<button
								type="button"
								class="mp-sel-angle-step"
								onclick={() => stepAngle(15)}
								use:tooltip={'Rotate 15° clockwise'}
								aria-label="Rotate clockwise">+</button
							>
						</div>
						{@const currentLink = resolveEntity(selectedMarker.entityId)}
						<!-- Shadcn-style combobox: trigger is a button styled as a
			     text field, popover contains its own search input +
			     filtered list. Kind icon of the linked entity floats
			     as a prefix inside the trigger. -->
						<Popover.Root bind:open={entityPickerOpen}>
							<Popover.Trigger
								class="mp-combobox mp-sel-entity-btn"
								aria-label="Link marker to a connection"
							>
								{#if selectedMarker.entityId && currentLink}
									<span
										class="mp-sel-entity-icon"
										aria-hidden="true"
										style="--kind-color: {ENTITY_KIND_META[currentLink.kind].color}"
										>{@html ENTITY_KIND_META[currentLink.kind].icon}</span
									>
									<span class="mp-combobox-value">{currentLink.name}</span>
								{:else if selectedMarker.entityId}
									<span class="mp-combobox-value mp-combobox-value--placeholder">Broken link</span>
								{:else}
									<span class="mp-combobox-value mp-combobox-value--placeholder">— No link —</span>
								{/if}
								<span class="mp-combobox-caret" aria-hidden="true">{@html iconCaretDownSvg}</span>
							</Popover.Trigger>
							<Popover.Portal>
								<Popover.Content
									class="mp-cmd-popover"
									sideOffset={4}
									align="start"
									collisionPadding={8}
								>
									<Command.Root class="mp-cmd">
										<div class="mp-cmd-search-row">
											<span class="mp-cmd-search-icon" aria-hidden="true"
												>{@html searchIconSvg}</span
											>
											<Command.Input
												class="mp-cmd-search"
												placeholder="Search connections…"
												autofocus
											/>
										</div>
										<Command.List class="mp-cmd-list">
											<Command.Empty class="mp-cmd-empty">No matching connections.</Command.Empty>
											<Command.Item
												class="mp-cmd-item"
												value="No link"
												onSelect={() => pickEntity('')}
											>
												<span class="mp-cmd-check" aria-hidden="true">
													{#if !selectedMarker.entityId}
														<svg
															viewBox="0 0 20 20"
															fill="none"
															stroke="currentColor"
															stroke-width="2.5"
															><polyline
																points="4 11 8 15 16 6"
																stroke-linecap="round"
																stroke-linejoin="round"
															></polyline></svg
														>
													{/if}
												</span>
												<span class="mp-cmd-item-name mp-cmd-item-name--muted">— No link —</span>
											</Command.Item>
											{#each sortedLinkableEntities as e (`${e.kind}:${e.id}`)}
												{@const val = `${e.kind}:${e.id}`}
												{@const meta = KIND_META[e.kind]}
												<Command.Item
													class="mp-cmd-item"
													value={e.name}
													onSelect={() => pickEntity(val)}
												>
													<span class="mp-cmd-check" aria-hidden="true">
														{#if selectedMarker.entityId === val}
															<svg
																viewBox="0 0 20 20"
																fill="none"
																stroke="currentColor"
																stroke-width="2.5"
																><polyline
																	points="4 11 8 15 16 6"
																	stroke-linecap="round"
																	stroke-linejoin="round"
																></polyline></svg
															>
														{/if}
													</span>
													<span
														class="mp-cmd-item-icon"
														aria-hidden="true"
														style="--kind-color: {meta.color}">{@html meta.icon}</span
													>
													<span class="mp-cmd-item-name">{e.name}</span>
												</Command.Item>
											{/each}
										</Command.List>
									</Command.Root>
								</Popover.Content>
							</Popover.Portal>
						</Popover.Root>
						<button
							class="mp-btn mp-btn-danger mp-btn-icon"
							onclick={deleteSelected}
							use:tooltip={'Delete this marker'}
							aria-label="Delete marker">{@html iconTrashSvg}</button
						>
					{:else if placingMode}
						<span class="mp-sel-hint mp-sel-hint-active"
							>Click the map to place a marker. Snap {snapRes === 1
								? 'to cells'
								: `to 1/${1 / snapRes}-cell`} — zoom in for finer placement.</span
						>
						<button
							class="mp-btn"
							onclick={cancelPlacing}
							use:tooltip={'Exit placing mode without adding a marker'}>Cancel</button
						>
					{:else if selectedSquare}
						<span class="mp-sel-hint mp-sel-hint-active">
							Square selected — hit <strong>+ Marker</strong> to drop a marker here.
						</span>
						<button
							class="mp-btn"
							onclick={clearSquareSelection}
							use:tooltip={'Clear the selected square'}>Cancel</button
						>
					{/if}
				</div>
			{/if}

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
			<div class="mp-body" style="aspect-ratio: {gridDims.cols} / {gridDims.rows};">
				<!-- Wheel listener is attached manually with `passive: false` in a
		     $effect above so trackpad-pinch (ctrl+wheel) is preventable. -->
				<div class="mp-canvas" bind:this={canvasEl} onscroll={onScroll}>
					<!--
				viewBox is world-unit space (0 0 cols rows). SVG rendered
				width/height = canvasPxW/H × zoom, so when zoom > 1 the SVG
				grows past the canvas and .mp-canvas's overflow: auto handles
				the pan. Canvas body's aspect-ratio matches gridDims exactly,
				so cells render perfectly square with no letterbox at zoom 1.
			-->
					<svg
						bind:this={svgEl}
						width={svgWidth}
						height={svgHeight}
						viewBox="0 0 {gridDims.cols} {gridDims.rows}"
						preserveAspectRatio="none"
						aria-label="Campaign map"
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
					Single invisible click-capture rect covering the whole
					viewBox. onGridClick unprojects the event to world coords,
					snaps, and routes to place/select. Kept below the marker
					layer but markers themselves are pointer-events: none —
					marker hits are resolved via markersAt() on the snapped
					point, so a marker-adjacent click still selects it.
					pointermove/pointerup here also drive drag-to-move:
					pointerdown arms a drag intent when a marker is at the
					snap point, and pointermove past the threshold engages
					it (see onGridPointerDown).
				-->
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<rect
							class="mp-grid-capture"
							x="0"
							y="0"
							width={gridDims.cols}
							height={gridDims.rows}
							fill="transparent"
							onclick={onGridClick}
							onpointerdown={onGridPointerDown}
							onpointermove={onGridPointerMove}
							onpointerup={onGridPointerUp}
							onpointercancel={onGridPointerUp}
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
				     "+ Marker" (and the same visual language a selected
				     marker uses). Rendered before markers so any marker
				     placed at the same spot draws on top. -->
						{#if selectedSquare}
							{@const cell = snapResolutionForZoom(zoom)}
							<rect
								class="mp-marker-selection"
								x={selectedSquare.x - cell / 2}
								y={selectedSquare.y - cell / 2}
								width={cell}
								height={cell}
								vector-effect="non-scaling-stroke"
							/>
						{/if}

						{#each mapState.markers as m (m.id)}
							{@const ic = resolveMapIcon(m.icon)}
							{@const color = m.color || DEFAULT_MARKER_COLOR}
							{@const isDragging =
								dragState?.id === m.id && dragState.moved && dragPreview !== null}
							{@const mx = isDragging && dragPreview ? dragPreview.x : m.x}
							{@const my = isDragging && dragPreview ? dragPreview.y : m.y}
							{@const hasIcon = m.icon !== ''}
							{@const isSelected = m.id === selectedMarkerId}
							{@const rot = normalizeAngle(m.angle)}
							{#if isSelected}
								<!-- Selection outline — the sub-cell the marker snaps into
						     at the current zoom (1 unit at 100%, ½ at 200%, ¼ at
						     400%, …). Drawn in world coords so it sits on top of
						     the grid where the marker actually lives; the icon's
						     scale(1/zoom) group is separate so shrinking the icon
						     doesn't also shrink the highlight. `non-scaling-stroke`
						     keeps the outline a fixed screen weight at any zoom. -->
								{@const cell = snapResolutionForZoom(zoom)}
								<rect
									class="mp-marker-selection"
									x={mx - cell / 2}
									y={my - cell / 2}
									width={cell}
									height={cell}
									vector-effect="non-scaling-stroke"
								/>
							{/if}
							<!--
						`scale(1/zoom)` keeps the whole marker (icon + label +
						strokes) a constant on-screen size regardless of zoom —
						children keep their world-unit sizes; the scale absorbs
						the zoom. When no icon is chosen (`m.icon === ''`) the
						label centres both axes on the point instead of hanging
						below where the icon would be.
					-->
							<g
								class="mp-marker"
								class:mp-marker-selected={isSelected}
								class:mp-marker-dragging={isDragging}
								transform="translate({mx} {my}) scale({1 / zoom}) rotate({rot})"
							>
								{#if hasIcon && ic}
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
									`vector-effect="non-scaling-stroke"` (inherited by
									the child paths) pins the halo to 2 device pixels
									regardless of zoom or icon viewBox scale, matching
									the label halo. 2 px reads more crisply than 1 px
									against complex map backgrounds.
								-->
										<g
											fill={color}
											stroke="#fff"
											stroke-width="2"
											stroke-linejoin="round"
											paint-order="stroke"
											vector-effect="non-scaling-stroke"
										>
											{@html ic.inner}
										</g>
									</svg>
								{:else if hasIcon}
									<!-- Legacy/broken slug: fall back to a plain dot so
							     the marker doesn't vanish. Non-scaling stroke +
							     stroke-width 2 for the same halo weight everywhere. -->
									<circle
										r={ICON_SIZE / 2 - 0.04}
										fill={color}
										stroke="#fff"
										stroke-width="2"
										paint-order="stroke"
										vector-effect="non-scaling-stroke"
									/>
								{/if}
								{#if m.label}
									{#if hasIcon}
										<text
											class="mp-marker-label"
											fill={color}
											vector-effect="non-scaling-stroke"
											y={ICON_SIZE / 2 + LABEL_GAP}>{m.label}</text
										>
									{:else}
										<text
											class="mp-marker-label mp-marker-label--centered"
											fill={color}
											vector-effect="non-scaling-stroke"
											y="0">{m.label}</text
										>
									{/if}
								{/if}
							</g>
						{/each}
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
						<button class="mp-empty-cta-btn" onclick={triggerBackgroundUpload}>
							<span class="mp-empty-cta-plus" aria-hidden="true">+</span>
							<span class="mp-empty-cta-label">Add background image</span>
						</button>
						<p class="mp-empty-cta-hint">
							Pick a map picture to paint over — jpg / png, any aspect.
						</p>
					</div>
				{/if}
			</div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<MapOptionsDialog bind:this={optionsDialogRef} onReplaceBackground={triggerBackgroundUpload} />

<!--
	Pile-up picker — surfaces when a click resolves to a snap point with
	more than one marker (common at low zoom, where sub-cell placements
	from a deeper octave collapse onto the same base cell). Fixed-
	positioned at the click's viewport coords; backdrop covers the whole
	viewport so an outside click dismisses. Rendered in the app root (not
	inside the <dialog>) via a portal-style fixed layer.
-->
{#if pilePicker}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="mp-pile-backdrop" onclick={closePilePicker}></div>
	<ul
		class="mp-pile-menu"
		role="listbox"
		aria-label="Markers here"
		style="left: {pilePicker.screenX}px; top: {pilePicker.screenY + 8}px"
	>
		<li class="mp-pile-header">{pilePicker.markers.length} markers here</li>
		{#each pilePicker.markers as m (m.id)}
			{@const ic = resolveMapIcon(m.icon)}
			{@const link = resolveEntity(m.entityId)}
			<li>
				<button
					class="mp-pile-item"
					onclick={() => choosePileMarker(m)}
					aria-label={m.label || '(no name)'}
				>
					{#if ic}
						<svg class="mp-pile-icon" viewBox={ic.viewBox} aria-hidden="true">
							<g fill={m.color || DEFAULT_MARKER_COLOR}>{@html ic.inner}</g>
						</svg>
					{:else}
						<span class="mp-pile-icon-fallback" style="background:{m.color || DEFAULT_MARKER_COLOR}"
						></span>
					{/if}
					<span class="mp-pile-label">{m.label || '(no name)'}</span>
					{#if link}
						<span class="mp-pile-link" title="Linked to {link.kindLabel}: {link.name}"
							>{link.kindPrefix}</span
						>
					{/if}
				</button>
			</li>
		{/each}
	</ul>
{/if}

<!--
	Icon picker — nested modal that lists every manifest icon grouped by
	category with a search filter. Live-color-previews using the currently-
	selected marker's color so users can see what they'll get.
-->
<Dialog.Root bind:open={iconDialogOpen}>
	<Dialog.Portal>
		<Dialog.Overlay class="mp-icon-overlay" />
		<Dialog.Content
			class="mp-icon-dialog"
			onOpenAutoFocus={(e) => {
				// Focus the search input on open (CLAUDE.md focus rule).
				e.preventDefault();
				setTimeout(() => iconSearchInputEl?.focus(), 0);
			}}
		>
			<DialogHeader
				title={headingText('Choose Icon')}
				onclose={closeIconPicker}
				radius="8px 8px 0 0"
			/>
			<div class="mp-icon-search-row">
				<div class="mp-icon-search-field">
					<span class="mp-icon-search-icon" aria-hidden="true">{@html searchIconSvg}</span>
					<input
						bind:this={iconSearchInputEl}
						class="mp-icon-search"
						type="search"
						placeholder="Search icons…"
						bind:value={iconSearch}
						aria-label="Search icons"
					/>
				</div>
			</div>
			<div class="mp-icon-body">
				<!-- "No icon" tile always at the top — clicking it clears the
		     marker's icon so only the label renders (centred on the point). -->
				<div class="mp-icon-cat-label">Label only</div>
				<div class="mp-icon-grid">
					<button
						class="mp-icon-tile mp-icon-tile--none"
						class:mp-icon-tile-selected={selectedMarker?.icon === ''}
						onclick={() => pickIcon('')}
						use:tooltip={'Show only the label — no icon, centred on the point'}
						aria-label="No icon"
					>
						<span class="mp-icon-none-glyph" aria-hidden="true">Aa</span>
					</button>
				</div>
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
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<style>
	/* bits-ui portals Content + Overlay to <body>; scope everything
	   globally. Overlay 80 / content 81 matches the modal z-index tier. */
	:global(.mp-overlay) {
		position: fixed;
		inset: 0;
		background: #00000060;
		backdrop-filter: blur(1px);
		z-index: 80;
	}
	:global(.mp-dialog) {
		display: flex;
		flex-direction: column;
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		/* Width + height are set from JavaScript per frame via the
		   "contain" fit (aspect-preserving, respects live chrome
		   height, caps at 80vw × 80vh, handles device rotation).
		   The `max-width` / `max-height` here are a safety net for
		   the first paint before the effect fires — the JS values
		   supersede them. */
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
		z-index: 81;
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
	@media (max-width: 640px) {
		/* Row 1: map picker only. Row 2: + Marker + zoom cluster + gear. */
		:global(.mp-tools-map) {
			flex: 1 1 100%;
		}
		:global(.mp-tools-actions) {
			flex: 1 1 100%;
		}
		/* Selection toolbar: name on its own row, icon/color/angle/delete
		   on row 2, entity link on row 3. Prevents the link picker from
		   truncating the name field or vice-versa. */
		:global(.mp-sel-name) {
			flex: 1 1 100%;
		}
		:global(.mp-sel-entity-btn) {
			flex: 1 1 100%;
			max-width: none;
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
	/* Combobox trigger shell — a text-field-shaped `<button>` (bits-ui
	   Popover.Trigger) containing an optional prefix icon, a value/
	   placeholder span, and a chevron. Shared by both comboboxes in
	   this dialog (map switcher, marker link picker). Classes are
	   passed through to bits-ui components, so Svelte's CSS pruning
	   can't see them — scope with `:global()`. */
	:global(.mp-combobox) {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 4px 6px 4px 10px;
		background: var(--bg-inset);
		color: var(--text);
		border: 1px solid var(--border-mid);
		border-radius: 4px;
		font-family: var(--font-ui);
		font-size: 0.82rem;
		font-weight: 500;
		letter-spacing: 0;
		text-transform: none;
		cursor: pointer;
		min-height: 30px;
		transition: border-color 0.12s;
	}
	:global(.mp-combobox:hover:not(:disabled)),
	:global(.mp-combobox:focus-visible) {
		border-color: var(--text-accent);
		outline: none;
	}
	:global(.mp-combobox[data-state='open']) {
		border-color: var(--text-accent);
		box-shadow: inset 0 -2px 0 0 var(--text-accent);
	}
	:global(.mp-combobox-value) {
		flex: 1 1 auto;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		text-align: left;
	}
	:global(.mp-combobox-value--placeholder) {
		color: var(--text-dimmer);
		font-style: italic;
	}
	:global(.mp-combobox-caret) {
		flex-shrink: 0;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 20px;
		height: 20px;
		color: var(--text-muted);
	}
	:global(.mp-combobox-caret svg) {
		width: 12px;
		height: 12px;
		fill: currentColor;
	}
	:global(.mp-combobox-caret svg path) {
		fill: currentColor;
	}

	:global(.mp-picker-btn) {
		max-width: 240px;
	}

	/* Shadcn-style combobox popover (Popover.Content + Command inside).
	   Two of these live in this dialog — the map switcher and the
	   marker link picker — and share every `.mp-cmd-*` class so they
	   read as one visual system. Bits-ui portals the Content into
	   `dialogEl`, so scope with `:global()` (Svelte's class-pruning
	   can't see through the portal). */
	:global(.mp-cmd-popover) {
		width: min(320px, calc(100vw - 2rem));
		background: var(--bg-card);
		color: var(--text);
		border: 1px solid var(--border-mid);
		border-radius: 8px;
		box-shadow: 0 16px 48px #00000070;
		/* 90 — same rule as `.bui-select-content` (see z-index budget
		   in docs/ui-components.md): popovers must beat bits-ui modal
		   content (81) so they still show if opened from inside a
		   ConfirmDialog / AlertDialog. */
		z-index: 90;
		outline: none;
		overflow: hidden;
	}
	:global(.mp-cmd) {
		display: flex;
		flex-direction: column;
		max-height: min(420px, 70vh);
	}
	/* Search row at the top: magnifying-glass prefix + Command.Input. */
	:global(.mp-cmd-search-row) {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 10px;
		border-bottom: 1px solid var(--border);
	}
	:global(.mp-cmd-search-icon) {
		display: inline-flex;
		width: 12px;
		height: 12px;
		color: var(--text-dimmer);
		flex-shrink: 0;
	}
	:global(.mp-cmd-search-icon svg) {
		width: 100%;
		height: 100%;
		fill: currentColor;
	}
	:global(.mp-cmd-search-icon svg path) {
		fill: currentColor;
	}
	/* Command.Input is a real `<input>` and inherits app.css's global
	   input styling (border, padding, radius, focus box-shadow). Strip
	   every bit of that so only the search-row divider frames it. */
	:global(.mp-cmd-search) {
		flex: 1 1 auto;
		min-width: 0;
		padding: 2px 0;
		background: transparent;
		border: none;
		border-radius: 0;
		outline: none;
		box-shadow: none;
		-webkit-appearance: none;
		appearance: none;
		color: var(--text);
		font: inherit;
		font-family: var(--font-ui);
		font-size: 0.82rem;
	}
	:global(.mp-cmd-search:focus) {
		outline: none;
		box-shadow: none;
	}
	:global(.mp-cmd-search::placeholder) {
		color: var(--text-dimmer);
	}
	:global(.mp-cmd-list) {
		flex: 1 1 auto;
		min-height: 0;
		overflow-y: auto;
		overscroll-behavior: contain;
		padding: 4px 0;
	}
	:global(.mp-cmd-empty) {
		padding: 12px;
		font-family: var(--font-ui);
		font-size: 0.82rem;
		color: var(--text-dimmer);
		font-style: italic;
		text-align: center;
	}
	:global(.mp-cmd-item) {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 12px;
		font-family: var(--font-ui);
		font-size: 0.85rem;
		color: var(--text);
		cursor: pointer;
		user-select: none;
	}
	/* bits-ui Command sets `data-selected='true'` on the highlighted
	   item (keyboard nav) — same visual shape as pointer hover. */
	:global(.mp-cmd-item[data-selected='true']),
	:global(.mp-cmd-item:hover) {
		background: color-mix(in srgb, var(--text) 6%, transparent);
	}
	:global(.mp-cmd-item[aria-disabled='true']) {
		opacity: 0.5;
		cursor: default;
	}
	:global(.mp-cmd-item--action) {
		color: var(--text-accent);
	}
	:global(.mp-cmd-check) {
		flex-shrink: 0;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 14px;
		height: 14px;
		color: var(--text-accent);
	}
	:global(.mp-cmd-check svg) {
		width: 100%;
		height: 100%;
	}
	:global(.mp-cmd-item-icon) {
		display: inline-flex;
		width: 18px;
		height: 18px;
		flex-shrink: 0;
		color: var(--kind-color, var(--text-accent));
	}
	:global(.mp-cmd-item-icon svg) {
		width: 100%;
		height: 100%;
		fill: currentColor;
	}
	:global(.mp-cmd-item-icon svg path) {
		fill: currentColor;
	}
	:global(.mp-cmd-item-name) {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	:global(.mp-cmd-item-name--muted) {
		color: var(--text-dimmer);
		font-style: italic;
	}
	:global(.mp-cmd-sep) {
		height: 1px;
		background: var(--border);
		margin: 4px 0;
	}

	:global(.mp-btn-add-active) {
		background: var(--text-accent) !important;
		color: var(--bg-card) !important;
		border-color: var(--text-accent) !important;
	}
	/* Placing mode = crosshair over the canvas so users know the next
	   click will land a marker. Targets the click-capture rect since
	   that's what receives the pointer. */
	:global(body:has(button.mp-btn-add-active) .mp-canvas .mp-grid-capture) {
		cursor: crosshair;
	}

	/* Selection-toolbar hint gets a slightly warmer treatment when
	   placing mode is armed, matching the Add button's active state. */
	:global(.mp-sel-hint-active) {
		color: var(--text);
		font-weight: 600;
		font-style: normal;
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
	/* Zoom control chip — minus + percentage + plus + fit, laid out
	   inline so the toolbar row stays a single band on desktop. */
	:global(.mp-zoom) {
		display: inline-flex;
		align-items: center;
		gap: 2px;
	}
	:global(.mp-btn-danger:not(:disabled):hover) {
		color: var(--color-danger, #ef4444);
		border-color: var(--color-danger, #ef4444);
	}

	/* Selection toolbar — sits below the file/export toolbar. Shows a hint
	   when empty; the marker's editable fields when a marker is selected.
	   Wraps at narrow widths so mobile still fits every control. */
	:global(.mp-sel-toolbar) {
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
	:global(.mp-sel-hint) {
		font-style: italic;
	}
	:global(.mp-sel-name) {
		/* Was `flex: 1 1 140px; min-width: 100px` — greedy. The name
		   is often short (single word or two) so it doesn't need the
		   lion's share of the row; the entity link chip below gets
		   the slack instead. */
		flex: 0 1 120px;
		min-width: 80px;
		padding: 5px 8px;
		font-family: var(--font-ui);
		font-size: 0.82rem;
		color: var(--text);
		background: var(--bg-control);
		border: 1px solid var(--border-mid);
		border-radius: 4px;
	}
	:global(.mp-sel-name:focus) {
		outline: none;
		border-color: var(--text-accent);
	}
	:global(.mp-sel-icon-btn) {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 3px 6px;
		background: var(--bg-control);
		border: 1px solid var(--border-mid);
		border-radius: 4px;
		cursor: pointer;
		color: var(--text);
	}
	:global(.mp-sel-icon-btn:hover) {
		border-color: var(--text-accent);
	}
	:global(.mp-sel-icon-btn svg) {
		width: 22px;
		height: 22px;
		flex-shrink: 0;
	}
	/* Colour picker trigger — a real `<button>` styled to match the
	   neighbouring `.mp-sel-icon-btn`. Pickr runs in `useAsButton`
	   mode so this element IS its trigger; Pickr just floats the
	   `.pcr-app` popover next to it on click. The palette SVG inside
	   picks up the selected colour via `currentColor` and the same
	   2-device-pixel white halo the map markers use, so light hues
	   read on dark backgrounds and dark hues read on light. */
	:global(.mp-sel-color-btn) {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 3px 6px;
		background: var(--bg-control);
		border: 1px solid var(--border-mid);
		border-radius: 4px;
		cursor: pointer;
	}
	:global(.mp-sel-color-btn:hover) {
		border-color: var(--text-accent);
	}
	:global(.mp-sel-color-btn:focus-visible) {
		outline: 1px solid var(--text-accent);
		outline-offset: 1px;
	}
	:global(.mp-sel-color-btn svg) {
		width: 22px;
		height: 22px;
	}
	/* Popover floats above the dialog's other chrome via a high
	   z-index so it isn't clipped by the toolbar's own row. */
	:global(.pcr-app) {
		z-index: 60;
	}
	/* Angle spinner — inline `−  ∠ nnn°  +` cluster. iOS Safari drops
	   the native <input type="number"> step arrows, so explicit step
	   buttons flank the numeric field to keep the spinner reachable on
	   touch. Whole group behaves as one segmented control. */
	:global(.mp-sel-angle) {
		display: inline-flex;
		align-items: stretch;
		border: 1px solid var(--border-mid);
		border-radius: 4px;
		background: var(--bg-control);
		overflow: hidden;
	}
	:global(.mp-sel-angle:focus-within) {
		border-color: var(--text-accent);
	}
	:global(.mp-sel-angle-step) {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 13px;
		padding: 0;
		border: none;
		background: transparent;
		color: var(--text-muted);
		font-family: var(--font-ui);
		font-size: 0.95rem;
		font-weight: 700;
		line-height: 1;
		cursor: pointer;
	}
	:global(.mp-sel-angle-step:hover) {
		background: color-mix(in srgb, var(--text-accent) 12%, transparent);
		color: var(--text);
	}
	:global(.mp-sel-angle-step:active) {
		background: color-mix(in srgb, var(--text-accent) 22%, transparent);
	}
	:global(.mp-sel-angle-field) {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		padding: 2px 4px 2px 6px;
		border-inline: 1px solid var(--border);
		font-family: var(--font-ui);
		font-size: 0.72rem;
		color: var(--text-muted);
	}
	:global(.mp-sel-angle-glyph) {
		display: inline-flex;
		align-items: center;
		color: var(--text-dimmer);
		line-height: 1;
	}
	:global(.mp-sel-angle-glyph svg) {
		width: 12px;
		height: 12px;
		fill: currentColor;
	}
	:global(.mp-sel-angle-input) {
		width: 2.2em;
		padding: 3px 0 3px 2px;
		border: none;
		background: transparent;
		color: var(--text);
		font-family: inherit;
		font-size: 0.82rem;
		text-align: right;
	}
	:global(.mp-sel-angle-input:focus) {
		outline: none;
	}
	/* Hide the native step arrows — the surrounding buttons replace
	   them so we don't need a second, browser-styled pair. */
	.mp-sel-angle-input::-webkit-outer-spin-button,
	:global(.mp-sel-angle-input::-webkit-inner-spin-button) {
		-webkit-appearance: none;
		margin: 0;
	}
	:global(.mp-sel-angle-input) {
		-moz-appearance: textfield;
		appearance: textfield;
	}
	:global(.mp-sel-angle-unit) {
		color: var(--text-dimmer);
		line-height: 1;
	}
	/* Sizing override for the marker link combobox trigger — base
	   look comes from `.mp-combobox`. Passes through bits-ui
	   Popover.Trigger, so scope with `:global()`. */
	:global(.mp-sel-entity-btn) {
		flex: 1 1 240px;
		min-width: 180px;
		max-width: 420px;
	}
	/* Kind icon for the currently-linked entity — same SVG the picker
	   row uses. Coloured via `--kind-color` set inline from
	   `ENTITY_KIND_META`. */
	:global(.mp-sel-entity-icon) {
		flex-shrink: 0;
		display: inline-flex;
		width: 16px;
		height: 16px;
		color: var(--kind-color, var(--text-accent));
	}
	:global(.mp-sel-entity-icon svg) {
		width: 100%;
		height: 100%;
		fill: currentColor;
	}
	:global(.mp-sel-entity-icon svg path) {
		fill: currentColor;
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
	:global(.mp-marker-selected) {
		filter: drop-shadow(0 0 3px var(--text-accent));
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
		   stroke` (set on the element) so `2` translates to 2 device
		   pixels — a crisp white halo that traces cleanly against a
		   busy background map. */
		font-family: var(--font-ui);
		font-size: 0.24px;
		font-weight: 600;
		text-anchor: middle;
		paint-order: stroke fill;
		stroke: #fff;
		stroke-width: 2;
		stroke-linejoin: round;
	}
	/* Doubled on mobile so labels stay legible when the whole map
	   is inside a phone-width viewport. Matches the ICON_SIZE
	   doubling in the marker render loop. */
	@media (max-width: 640px) {
		.mp-marker-label {
			font-size: 0.48px;
		}
	}
	/* Label-only markers (no icon chosen) centre both axes on the point
	   instead of sitting below where the icon would be. */
	:global(.mp-marker-label--centered) {
		dominant-baseline: central;
	}

	/* Selection toolbar's icon-button "No icon" placeholder — a small
	   two-letter glyph in the marker's colour that stands in for the
	   icon preview when the marker is a label-only pin. */
	:global(.mp-sel-icon-none) {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 22px;
		height: 22px;
		flex-shrink: 0;
		font-family: var(--font-ui);
		font-size: 0.75rem;
		font-weight: 700;
		color: var(--text);
		background: var(--bg-inset);
		border: 1px dashed var(--border-mid);
		border-radius: 4px;
	}

	/* Icon-picker "No icon" tile — same footprint as a regular tile but
	   shows the "Aa" placeholder glyph so the choice is obvious in the
	   grid. */
	:global(.mp-icon-tile--none) {
		background: var(--bg-inset);
		border-style: dashed;
	}
	:global(.mp-icon-none-glyph) {
		font-family: var(--font-ui);
		font-size: 0.95rem;
		font-weight: 700;
		color: var(--text-muted);
	}

	/* Pile-up picker — fixed-positioned floating menu that appears when a
	   snap point holds more than one marker. z-index sits above the
	   <dialog>'s top-layer chrome so it renders over the map + toolbars
	   without being clipped by the dialog's overflow: hidden. */
	:global(.mp-pile-backdrop) {
		position: fixed;
		inset: 0;
		z-index: 40;
		background: transparent;
	}
	:global(.mp-pile-menu) {
		position: fixed;
		z-index: 41;
		min-width: 200px;
		max-width: 320px;
		max-height: 60vh;
		overflow-y: auto;
		overscroll-behavior: contain;
		list-style: none;
		margin: 0;
		padding: 4px 0;
		background: var(--bg-card);
		color: var(--text);
		border: 1px solid var(--border-mid);
		border-radius: 6px;
		box-shadow: 0 8px 24px #00000060;
		font-family: var(--font-ui);
		font-size: 0.85rem;
	}
	:global(.mp-pile-header) {
		padding: 4px 12px 6px;
		font-size: 0.68rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-dimmer);
		border-bottom: 1px solid var(--border);
		margin-bottom: 4px;
	}
	:global(.mp-pile-item) {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 12px;
		background: none;
		border: none;
		text-align: left;
		color: var(--text);
		cursor: pointer;
		font-family: inherit;
		font-size: inherit;
	}
	:global(.mp-pile-item:hover) {
		background: var(--bg-control);
	}
	:global(.mp-pile-icon) {
		width: 20px;
		height: 20px;
		flex-shrink: 0;
	}
	:global(.mp-pile-icon-fallback) {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		border: 1px solid #fff;
		flex-shrink: 0;
	}
	:global(.mp-pile-label) {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	:global(.mp-pile-link) {
		color: var(--text-accent);
		font-size: 0.9rem;
	}

	/* Icon picker sub-dialog — nested inside MapDialog. Overlay 82 /
	   content 83 sits one tier above the outer map dialog (80/81) so
	   it renders on top without breaking the shared modal budget. */
	:global(.mp-icon-overlay) {
		position: fixed;
		inset: 0;
		background: #00000060;
		z-index: 82;
	}
	:global(.mp-icon-dialog) {
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: min(720px, calc(100vw - 2rem));
		max-height: 82vh;
		overflow: hidden;
		background: var(--bg-card);
		color: var(--text);
		border-radius: 8px;
		box-shadow:
			0 16px 48px #00000070,
			0 0 0 1px var(--border-mid);
		outline: none;
		z-index: 83;
	}
	/* Search row modelled on FoePickerDialog's `.fd-search-*` — a
	   .field wrapper positions the magnifying-glass icon absolutely
	   over the left-inset padding of the input. */
	:global(.mp-icon-search-row) {
		padding: 8px 14px;
		background: var(--bg-inset);
		border-bottom: 1px solid var(--border);
	}
	:global(.mp-icon-search-field) {
		position: relative;
		display: flex;
		align-items: center;
	}
	:global(.mp-icon-search-icon) {
		position: absolute;
		left: 9px;
		width: 13px;
		height: 13px;
		display: inline-flex;
		pointer-events: none;
		color: var(--text-dimmer);
	}
	:global(.mp-icon-search-icon svg) {
		width: 100%;
		height: 100%;
		fill: currentColor;
	}
	:global(.mp-icon-search) {
		flex: 1;
		min-width: 0;
		box-sizing: border-box;
		padding: 5px 10px 5px 29px;
		font-family: var(--font-ui);
		font-size: 0.85rem;
		color: var(--text);
		background: var(--bg-inset);
		border: 1px solid var(--border);
		border-radius: 4px;
	}
	:global(.mp-icon-search:focus) {
		outline: none;
		border-color: var(--focus-ring);
		box-shadow: 0 0 0 2px var(--accent-glow);
	}
	:global(.mp-icon-body) {
		/* Fixed height (not max-height) so the body doesn't shrink as
		   the user types and the filtered icon list gets shorter — the
		   dialog is centred via translate(-50%, -50%), and any height
		   change would rock the whole panel up/down around the viewport
		   centre. Leftover space just becomes empty scroll runway. */
		height: calc(82vh - 8rem);
		overflow-y: auto;
		overscroll-behavior: contain;
		padding: 8px 14px 14px;
	}
	:global(.mp-icon-cat-label) {
		font-family: var(--font-ui);
		font-size: 0.68rem;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-dimmer);
		margin: 12px 0 6px;
	}
	:global(.mp-icon-cat-label:first-child) {
		margin-top: 0;
	}
	:global(.mp-icon-grid) {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(48px, 1fr));
		gap: 4px;
	}
	:global(.mp-icon-tile) {
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
	:global(.mp-icon-tile:hover) {
		border-color: var(--text-accent);
	}
	:global(.mp-icon-tile-selected) {
		border-color: var(--text-accent);
		background: color-mix(in srgb, var(--text-accent) 12%, var(--bg-control));
	}
	:global(.mp-icon-tile svg) {
		width: 100%;
		height: 100%;
	}
	:global(.mp-icon-empty) {
		font-family: var(--font-ui);
		font-size: 0.85rem;
		color: var(--text-dimmer);
		text-align: center;
		padding: 24px 0;
	}
</style>
