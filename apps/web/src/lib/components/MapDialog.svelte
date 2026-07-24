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

	import { headingText } from '$lib/fontStore.svelte.js';
	import DialogHeader from './DialogHeader.svelte';
	import MapOptionsDialog from './MapOptionsDialog.svelte';
	import { mapSettings, persistMapSettings } from '$lib/mapSettingsStore.svelte.js';
	import iconTrashSvg from '$icons/trash-solid-full.svg?raw';
	import iconGearSvg from '$icons/gear-solid-full.svg?raw';
	import { tooltip } from '$lib/actions/tooltip.js';
	import {
		DEFAULT_MAP_ASPECT,
		DEFAULT_MARKER_COLOR,
		DEFAULT_MARKER_ICON,
		MARKER_COLOR_PRESETS,
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
	} from '$lib/mapStore.svelte.js';
	import { downscaleImage, MapImageError } from '$lib/mapImage.js';
	import { exportMapPng, exportMapJson } from '$lib/mapExport.js';
	import { getLinkableEntities, resolveEntity } from '$lib/mapEntityLinks.js';

	let dialogEl = $state<HTMLDialogElement | null>(null);
	let optionsDialogRef = $state<{ open(): void; close(): void } | null>(null);
	let iconDialogEl = $state<HTMLDialogElement | null>(null);
	let fileInputEl = $state<HTMLInputElement | null>(null);
	let uploadError = $state('');
	let iconSearch = $state('');

	// Map picker chip state — dropdown of the user's maps + a "+ New" affordance.
	let pickerOpen = $state(false);
	function togglePicker() {
		pickerOpen = !pickerOpen;
	}
	function closePicker() {
		pickerOpen = false;
	}
	async function pickMap(id: string) {
		closePicker();
		if (id === mapState.activeId) return;
		selectedMarkerId = null;
		await switchMap(id);
	}
	async function pickNewMap() {
		closePicker();
		const name = window.prompt('Name for the new map:', 'Untitled Map');
		if (name == null) return; // cancelled
		selectedMarkerId = null;
		try {
			await createMap({ name: name.trim() || 'Untitled Map' });
		} catch (err) {
			mapState.error = err instanceof Error ? err.message : 'Failed to create map';
		}
	}

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
	 * External export bridge — the hamburger menu's Export dialog routes
	 * Map exports through here so the user doesn't have to open the map
	 * to grab a snapshot. Loads the map state on demand (initMap is
	 * idempotent) so the export works even if the dialog has never been
	 * opened in this session.
	 */
	$effect(() => {
		const handler = (e: Event) => {
			const format = (e as CustomEvent<{ format?: string }>).detail?.format;
			void initMap().then(() => {
				if (format === 'png') handleExportPng();
				else if (format === 'json') handleExportJson();
			});
		};
		document.addEventListener('ironledger:export-map', handler);
		return () => document.removeEventListener('ironledger:export-map', handler);
	});

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

	// ─── Zoom + pan ────────────────────────────────────────────────────────────
	// The SVG's viewBox is fixed at world units (0 0 cols rows); zoom
	// scales its rendered pixel size and the canvas div's `overflow: auto`
	// handles the pan. Zoom multiplier persists server-side (per map);
	// scroll position persists in localStorage (per device).
	const MIN_ZOOM = 1;
	const MAX_ZOOM = 8;
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
		const sbH = Math.max(5, Math.round(cellW * 0.3));
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

	/** Format a scale-bar tick — integer when it happens to be one, up to
	 *  2 decimal places otherwise so fractional distances (post-zoom) still
	 *  read cleanly. */
	function formatScaleTick(n: number): string {
		if (n === 0) return '0';
		if (Number.isInteger(n)) return String(n);
		return n.toFixed(n < 1 ? 2 : 1);
	}

	const markerCount = $derived(mapState.markers.length);

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
	}

	/**
	 * Grid click. Behaviour depends on state:
	 *  • Placing mode on + empty spot → place marker + select it.
	 *  • Placing mode on + occupied spot → cancel placing, select existing.
	 *  • Existing marker w/ link + bare click → jump to entity.
	 *  • Existing marker w/ shift-click → open editor.
	 *  • Empty spot outside placing mode → nothing (user must hit "+ Add").
	 *
	 * Long-press on touch (see onGridPointerDown) sets `longPressFired`,
	 * which we honor by skipping the click — the long-press already
	 * opened the editor.
	 */
	function onGridClick(ev: MouseEvent) {
		if (longPressFired) {
			longPressFired = false;
			return;
		}
		const { x, y } = snapAndClamp(eventToWorld(ev));
		const existing = markersAt(x, y, zoom)[0];
		if (placingMode) {
			if (existing) {
				selectedMarkerId = existing.id;
				placingMode = false;
			} else {
				placeAt(x, y);
			}
			return;
		}
		if (!existing) return;
		activateExisting(x, y, ev.shiftKey);
	}

	function onGridPointerDown(e: PointerEvent) {
		if (e.pointerType === 'mouse') return; // mouse uses click + shift-click
		longPressFired = false;
		if (longPressTimer) clearTimeout(longPressTimer);
		const { x, y } = snapAndClamp(eventToWorld(e));
		longPressTimer = setTimeout(() => {
			longPressFired = true;
			longPressTimer = null;
			// Only opens the editor when there's actually a marker at the
			// long-press point; on empty ground it's a no-op (matches
			// mouse: no bare-click marker creation outside placing mode).
			activateExisting(x, y, true);
		}, LONG_PRESS_MS);
	}
	function cancelLongPress() {
		if (longPressTimer) {
			clearTimeout(longPressTimer);
			longPressTimer = null;
		}
	}

	function toggleAdd() {
		placingMode = !placingMode;
		if (placingMode) selectedMarkerId = null;
	}
	function cancelPlacing() {
		placingMode = false;
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
			const result = await downscaleImage(file);
			setBackground(result.dataUrl, result.aspect);
		} catch (err) {
			uploadError = err instanceof MapImageError ? err.message : 'Failed to load image.';
		}
	}

	function triggerUpload() {
		fileInputEl?.click();
	}

	/** Icon size in world units — 0.75 of a cell so the icon sits
	 *  comfortably inside its cell without spilling into neighbours.
	 *  Zooms with the map (icons are part of the annotation, so it makes
	 *  sense for them to grow when the user zooms in on detail). */
	const ICON_SIZE = 0.75;

	/**
	 * White stroke width in the source icon's viewBox units, computed so
	 * the halo lands at a consistent visual weight regardless of whether
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

	/** Format a fractional world coord for the selection toolbar's coord
	 *  display. Integer at base grid, else up to 2 decimal places so
	 *  sub-cell precision reads cleanly. */
	function fmtCoord(v: number): string {
		if (Number.isInteger(v)) return String(v);
		return v.toFixed(2);
	}

	/** Snap resolution at the current zoom — surfaced in the toolbar hint
	 *  so users know the granularity they're placing at. */
	const snapRes = $derived(snapResolutionForZoom(zoom));
</script>

<dialog bind:this={dialogEl} class="mp-dialog" oncancel={close}>
	<DialogHeader title={headingText('Campaign Map')} onclose={close} />

	<div class="mp-toolbar">
		<div class="mp-tools">
			<div class="mp-picker">
				<button
					class="mp-btn mp-picker-btn"
					onclick={togglePicker}
					aria-haspopup="listbox"
					aria-expanded={pickerOpen}
					use:tooltip={'Switch, create, or manage maps'}
				>
					<span class="mp-picker-label">{mapState.name || 'Map'}</span>
					<span class="mp-picker-caret" aria-hidden="true">▾</span>
				</button>
				{#if pickerOpen}
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<div class="mp-picker-backdrop" role="presentation" onclick={closePicker}></div>
					<ul class="mp-picker-menu" role="listbox">
						{#each mapListState.maps as m (m.id)}
							<li>
								<button
									class="mp-picker-item"
									class:mp-picker-item-active={m.id === mapState.activeId}
									onclick={() => pickMap(m.id)}
									role="option"
									aria-selected={m.id === mapState.activeId}
								>
									<span class="mp-picker-check">
										{m.id === mapState.activeId ? '✓' : ''}
									</span>
									<span class="mp-picker-name">{m.name}</span>
								</button>
							</li>
						{/each}
						{#if mapListState.maps.length > 0}
							<li class="mp-picker-sep" aria-hidden="true"></li>
						{/if}
						<li>
							<button class="mp-picker-item mp-picker-item-action" onclick={pickNewMap}
								>+ New map…</button
							>
						</li>
					</ul>
				{/if}
			</div>
			<button
				class="mp-btn"
				onclick={triggerUpload}
				use:tooltip={'Upload a background image (JPEG or PNG, ≤20 MB)'}>Upload image</button
			>
			<button
				class="mp-btn mp-btn-add"
				class:mp-btn-add-active={placingMode}
				onclick={toggleAdd}
				use:tooltip={placingMode
					? 'Click the map to place the marker (or click Add again to cancel)'
					: 'Add a marker — then click the map to place it'}
				aria-pressed={placingMode}
				aria-label="Add marker">+ Add</button
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
		Selection toolbar. Sits above the map so it never scrolls off. Renders
		a hint when nothing is selected; switches to the marker's editable
		fields on click. Every input auto-saves via updateMarker() so there
		is no Save/Cancel — the marker is the working copy.
	-->
	<div class="mp-sel-toolbar" class:mp-sel-empty={!selectedMarker}>
		{#if selectedMarker && selectedIcon}
			<span class="mp-sel-coord" title="Position ({selectedMarker.x}, {selectedMarker.y})"
				>({fmtCoord(selectedMarker.x)}, {fmtCoord(selectedMarker.y)})</span
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
		{:else}
			<span class="mp-sel-hint"
				>Hit <strong>+ Add</strong> then click the map to place a marker. Tap a linked marker to jump;
				shift-click (desktop) or long-press (touch) to edit instead.</span
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

	<div class="mp-body" style="aspect-ratio: {gridDims.cols} / {gridDims.rows}">
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
					<image
						x="0"
						y="0"
						width={gridDims.cols}
						height={gridDims.rows}
						href={backgroundUrl()}
						preserveAspectRatio="none"
						aria-hidden="true"
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
					onpointerup={cancelLongPress}
					onpointercancel={cancelLongPress}
					onpointermove={cancelLongPress}
				/>

				{#each mapState.markers as m (m.id)}
					{@const ic = resolveMapIcon(m.icon)}
					{@const color = m.color || DEFAULT_MARKER_COLOR}
					<g
						class="mp-marker"
						class:mp-marker-selected={m.id === selectedMarkerId}
						transform="translate({m.x} {m.y})"
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
								r={ICON_SIZE / 2 - 0.04}
								fill={color}
								stroke="#fff"
								stroke-width="0.04"
								paint-order="stroke"
							/>
						{/if}
						{#if showLabels && m.label}
							<text class="mp-marker-label" y={ICON_SIZE / 2 + 0.32}>{m.label}</text>
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
	/* Map picker chip — dropdown showing all user's maps + "+ New map…".
	   Absolute-positioned menu with a click-outside backdrop, kept fully
	   inside the dialog so it plays nice with the <dialog> top layer. */
	.mp-picker {
		position: relative;
	}
	.mp-picker-btn {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		text-transform: none;
		max-width: 220px;
	}
	.mp-picker-label {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.mp-picker-caret {
		font-size: 0.7rem;
		opacity: 0.7;
	}
	.mp-picker-backdrop {
		position: fixed;
		inset: 0;
		z-index: 20;
	}
	.mp-picker-menu {
		position: absolute;
		top: calc(100% + 4px);
		left: 0;
		z-index: 21;
		min-width: 200px;
		max-width: 320px;
		max-height: 50vh;
		overflow-y: auto;
		overscroll-behavior: contain;
		list-style: none;
		margin: 0;
		padding: 4px 0;
		background: var(--bg-card);
		border: 1px solid var(--border-mid);
		border-radius: 6px;
		box-shadow: 0 8px 24px #00000060;
	}
	.mp-picker-item {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 12px;
		background: none;
		border: none;
		text-align: left;
		font-family: var(--font-ui);
		font-size: 0.85rem;
		color: var(--text);
		cursor: pointer;
	}
	.mp-picker-item:hover {
		background: var(--bg-control);
	}
	.mp-picker-item-active {
		font-weight: 600;
	}
	.mp-picker-check {
		width: 12px;
		color: var(--text-accent);
	}
	.mp-picker-name {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.mp-picker-item-action {
		color: var(--text-accent);
	}
	.mp-picker-sep {
		height: 1px;
		background: var(--border);
		margin: 4px 0;
	}

	.mp-btn-add-active {
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
	.mp-sel-hint-active {
		color: var(--text);
		font-weight: 600;
		font-style: normal;
	}

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
		/* aspect-ratio is set inline from gridDims (cols/rows) so cells
		   render perfectly square regardless of the source image's exact
		   proportions. `max-height` caps the total dialog well inside the
		   CLAUDE.md 88vh iOS-safe budget so on a short viewport the body
		   clamps rather than overflowing. `position: relative` establishes
		   the containing block for the .mp-overlay-svg absolutely-
		   positioned overlay. */
		position: relative;
		width: 100%;
		max-height: calc(88vh - 8rem);
		overflow: hidden;
	}
	/* Overlay SVG — floats above .mp-canvas at fixed canvas-pixel
	   dimensions so the scale bar stays put while the map pans and zooms
	   underneath. pointer-events: none so clicks pass through to the
	   click-capture rect. */
	.mp-overlay-svg {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
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

	/* Grid line strokes — minor (sub-cell subdivisions) render a hair
	   thinner than major (base cells) so users can tell them apart at a
	   glance without the minor lines dominating. Non-scaling stroke on
	   the elements themselves keeps both weights consistent across zoom. */
	.mp-grid-line {
		stroke: var(--text);
		stroke-width: 0.6;
		fill: none;
	}
	.mp-grid-major {
		stroke-width: 1.2;
	}
	/* "Show grid" toggle off — lines vanish but clicks still land on
	   the underlying grid. */
	.mp-grid-layer-hidden .mp-grid-line {
		stroke: transparent;
	}

	.mp-grid-capture {
		cursor: pointer;
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
		/* Font size + stroke width are in world units — 0.24 unit ≈ a
		   quarter cell, so labels stay readable at zoom 1 and grow
		   proportionally as the user zooms in. */
		font-family: var(--font-ui);
		font-size: 0.24px;
		font-weight: 600;
		text-anchor: middle;
		fill: var(--text);
		paint-order: stroke fill;
		stroke: var(--bg-card);
		stroke-width: 0.08px;
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
