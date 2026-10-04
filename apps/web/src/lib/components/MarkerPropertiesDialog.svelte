<script lang="ts">
	/**
	 * MarkerPropertiesDialog — the marker editor extracted out of
	 * MapDialog. Opens when a marker is selected on the map (tap,
	 * shift-click, long-press, or just-created), and edits it live:
	 * every change to name / icon / colour / angle / link writes
	 * straight through to the real marker via `updateMarker()` so the
	 * map updates the instant it changes (rotation is the whole reason
	 * — the user needs to watch the marker spin as they nudge the
	 * spinner). `originalMarker` snapshots the fields on open; Cancel /
	 * ✕ / Escape re-apply that snapshot to restore. OK just closes.
	 *
	 * The dialog is driven by the `selectedMarker` prop (owned by the
	 * parent as `selectedMarkerId` → `selectedMarker` derived). Closing
	 * the dialog calls `onClose`, which is where the parent clears its
	 * selection. The `.mp-props-*` / `.mp-sel-*` styling lives in
	 * MapDialog's global stylesheet — this component is only ever
	 * mounted by MapDialog, so the `:global` rules reach it there. The
	 * connection link picker is the shared `<Combobox>` (which owns its
	 * own `.cb-*` styles).
	 */
	import { untrack } from 'svelte';
	import { Dialog } from 'bits-ui';
	import Combobox from '$lib/components/Combobox.svelte';
	import { pushDialog, popDialog, overlayZ, contentZ } from '$lib/dialogStack.svelte.js';
	import Pickr from '@simonwep/pickr';
	import '@simonwep/pickr/dist/themes/nano.min.css';
	import DialogHeader from './DialogHeader.svelte';
	import MapIconPicker from './MapIconPicker.svelte';
	import { headingText } from '$lib/fontStore.svelte.js';
	import { DEFAULT_MARKER_COLOR, haloPaddedViewBox, mapGlyphInner } from '$lib/mapConstants.js';
	import { resolveMarkerIcon } from '$lib/settlementIcons.svelte.js';
	import { fallbackIcon } from '$lib/settlement-kit/fallback.js';
	import type { SettlementRecipe } from '$lib/settlementRecipe.js';
	import {
		updateMarker,
		removeMarker,
		markerScale,
		MIN_MARKER_SCALE,
		MAX_MARKER_SCALE,
		type MapMarker,
		type MapMarkerLabelPosition,
	} from '$lib/mapStore.svelte.js';
	import { getLinkableEntities, resolveEntity } from '$lib/mapEntityLinks.js';
	import { ENTITY_KIND_META } from '$lib/entityKinds.js';
	import { tooltip } from '$lib/actions/tooltip.js';
	import iconPaletteSvg from '$icons/palette-solid.svg?raw';
	import Select from '$lib/components/Select.svelte';
	import plusSvg from '$icons/plus-solid.svg?raw';
	import minusSvg from '$icons/minus-solid.svg?raw';

	let {
		selectedMarker,
		open = $bindable(false),
		onClose,
	}: {
		selectedMarker: MapMarker | null;
		/** Bindable open flag — the parent controls when the properties
		 *  dialog is visible. Set true to open, false to close. Closing
		 *  the dialog from inside (Cancel / ✕ / OK) flips this back
		 *  without touching selection: the parent may leave the marker
		 *  selected on the canvas to enable, e.g., arrow-key nudging. */
		open?: boolean;
		onClose: () => void;
	} = $props();

	/** Strip the outer `<svg>` wrapper + FontAwesome licence comment so
	 *  the palette icon's paths can be re-wrapped in our own `<svg>`
	 *  with the halo `<g>` cascade applied. Runs once at module load. */
	const paletteInner = iconPaletteSvg
		.replace(/<svg\b[^>]*>|<\/svg>/g, '')
		.replace(/<!--[\s\S]*?-->/g, '');

	// Alias so the shared kind metadata (community / place / journey /
	// site — NPCs aren't linkable from a marker) reads locally with a
	// short name at each render site.
	const KIND_META = ENTITY_KIND_META;

	// Icon picker — nested modal hosted by this dialog. Opened by the
	// icon button, picks write straight into the draft.
	let iconDialogOpen = $state(false);
	let entityPickerOpen = $state(false);

	// The dialog's open state is externally controlled via `bind:open` on
	// the parent — MapDialog opens it on a marker click and leaves it
	// closed after a Cancel / OK / ✕ so the marker can remain selected
	// on the canvas for arrow-key nudging. `markerId` is derived off the
	// selectedMarker prop and stays stable while the marker's *fields*
	// change during live edit — so the snapshot effect below re-runs
	// only on a genuine selection change, never on our own writes.
	const markerId = $derived(selectedMarker?.id ?? null);
	let stackDepth = $state(1);
	// Dialog root element — bound to Dialog.Content. Kept as a ref for
	// callers that need it, but popovers inside this dialog portal to
	// <body> now (default): the app-wide z-index budget puts popovers
	// at 90 and modal content at 81 + depth*2 (max 85 for a two-deep
	// stack like MapDialog → MarkerPropertiesDialog), so a body-portalled
	// popover always beats the dialog above it, and portalling into the
	// dialog itself only clipped the popover to the dialog's overflow
	// (a right-side "Position" dropdown lost its right edge inside the
	// dialog frame). Same pattern MapDialog's own map-switcher combobox
	// already uses.
	let dialogEl = $state<HTMLElement | null>(null);
	$effect(() => {
		if (!open) return;
		stackDepth = pushDialog();
		return () => popDialog();
	});

	/** Linkable entities sorted A-Z for stable presentation. Command
	 *  will filter this list by input text via each Item's `value`
	 *  (textContent) match, so we don't do our own substring filter. */
	const sortedLinkableEntities = $derived(
		getLinkableEntities()
			.slice()
			.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
	);

	/** 8 compass positions for the label, ordered as they read left-to-
	 *  right in reading order (top row → middle → bottom). Just the
	 *  arrow glyph in the label — no word — so the Select trigger stays
	 *  narrow enough to sit on the same row as the Style toggles. */
	const LABEL_POSITION_OPTIONS: { value: MapMarkerLabelPosition; label: string }[] = [
		{ value: 'top-left', label: '↖' },
		{ value: 'top', label: '↑' },
		{ value: 'top-right', label: '↗' },
		{ value: 'left', label: '←' },
		{ value: 'right', label: '→' },
		{ value: 'bottom-left', label: '↙' },
		{ value: 'bottom', label: '↓' },
		{ value: 'bottom-right', label: '↘' },
	];

	/** Label size ramp — H4 → H1 typographic tiers. Stored as
	 *  `labelStyle.size`; the render path multiplies the base font-size
	 *  by the corresponding factor (see LABEL_SIZE_MULT in MapDialog). */
	type LabelSize = 'sm' | 'md' | 'lg' | 'xl';
	const LABEL_SIZE_OPTIONS: { value: LabelSize; label: string }[] = [
		{ value: 'sm', label: 'S' },
		{ value: 'md', label: 'M' },
		{ value: 'lg', label: 'L' },
		{ value: 'xl', label: 'XL' },
	];

	function openIconPicker() {
		if (!selectedMarker) return;
		iconDialogOpen = true;
	}
	function closeIconPicker() {
		iconDialogOpen = false;
	}

	// ─── Pickr (marker colour) ─────────────────────────────────────────────
	// Pickr is instantiated once per dialog mount. Two $effects: one to
	// create/tear down when the anchor element comes and goes, one to
	// sync the widget's colour when a different marker is selected
	// (silent: true so it doesn't fire our own change handler and cause
	// a feedback loop).
	let pickrAnchor = $state<HTMLButtonElement | null>(null);
	let pickr: Pickr | null = null;

	/** Seven-char `#rrggbb` (no alpha) — Pickr's HEXA output ends `ff`
	 *  for the fully-opaque colours we always store; trim so the round
	 *  trip against `<input type="color">` compatible fields stays
	 *  clean. */
	function normalizeHex(color: string): string {
		return color.startsWith('#') ? color.slice(0, 7).toLowerCase() : color;
	}

	// ─── Recently-picked colours (MRU swatch row) ──────────────────────────
	// The picker's swatch row is a most-recently-used list: each committed
	// colour jumps to the front, deduped, capped, and persisted in
	// localStorage so it survives across sessions. Seeded with the eight
	// tabletop hues so first-time users still get a useful row.
	const RECENTS_KEY = 'il:recentMarkerColors';
	const RECENTS_MAX = 10;
	const SEED_SWATCHES = [
		'#e63946',
		'#f4a261',
		'#e9c46a',
		'#2a9d8f',
		'#457b9d',
		'#8e44ad',
		'#111111',
		'#f1faee',
	];

	function loadRecents(): string[] {
		try {
			const raw = localStorage.getItem(RECENTS_KEY);
			const arr = raw ? (JSON.parse(raw) as unknown) : null;
			if (Array.isArray(arr) && arr.every((x) => typeof x === 'string')) {
				const clean = arr.map(normalizeHex).filter((c) => /^#[0-9a-f]{6}$/.test(c));
				if (clean.length) return clean.slice(0, RECENTS_MAX);
			}
		} catch {
			/* private mode / SSR / bad JSON — fall back to the seed */
		}
		return [...SEED_SWATCHES];
	}

	let recents = $state<string[]>(loadRecents());

	/** Move `hex` to the front of the MRU list, dedupe, cap, persist, and
	 *  reflect it into the live Pickr swatch row. */
	function recordRecent(hex: string) {
		const c = normalizeHex(hex);
		if (!/^#[0-9a-f]{6}$/.test(c)) return;
		recents = [c, ...recents.filter((x) => x !== c)].slice(0, RECENTS_MAX);
		try {
			localStorage.setItem(RECENTS_KEY, JSON.stringify(recents));
		} catch {
			/* persistence is best-effort */
		}
		syncPickrSwatches(recents);
	}

	/** Rebuild Pickr's swatch row from `list` using only its public API. */
	function syncPickrSwatches(list: string[]) {
		const p = pickr;
		if (!p) return;
		try {
			// removeSwatch(0) returns false once empty; cap the loop as a guard.
			for (let i = 0; i < RECENTS_MAX + 4 && p.removeSwatch(0); i++);
			for (const c of list) p.addSwatch(c);
		} catch {
			/* Pickr swatch API race — non-fatal, the row just lags one open */
		}
	}

	// ─── Hex field (editable, inside the focus trap) ───────────────────────
	// Lives in the dialog body, not the Pickr popover, because Pickr portals
	// its popover to <body> and bits-ui's focus trap yanks focus back to the
	// trigger whenever an input in the portalled popover is clicked.
	/** Parse a typed / pasted colour. Accepts `#rrggbb`, `#rgb`, `rrggbb`,
	 *  `rgb`, and `rgb(r,g,b)` / `r,g,b`. Returns a normalised `#rrggbb`,
	 *  or `null` when the input isn't a valid colour. */
	function parseColorInput(input: string): string | null {
		const s = input.trim();
		const rgb = s.match(/^(?:rgb\s*\(\s*)?(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)?$/i);
		if (rgb) {
			const parts = [rgb[1], rgb[2], rgb[3]].map(Number);
			if (parts.every((n) => n >= 0 && n <= 255))
				return '#' + parts.map((n) => n.toString(16).padStart(2, '0')).join('');
			return null;
		}
		const hx = s.replace(/^#/, '');
		if (/^[0-9a-f]{3}$/i.test(hx)) return normalizeHex('#' + hx.replace(/./g, (c) => c + c));
		if (/^[0-9a-f]{6}$/i.test(hx)) return normalizeHex('#' + hx);
		return null;
	}
	/** Commit a value from the hex field: push to draft + live marker + Pickr
	 *  and record it. Returns false when the text isn't a colour so the
	 *  caller can snap the field back to the current value. */
	function applyHexInput(raw: string): boolean {
		const hex = parseColorInput(raw);
		if (!hex || !draft) return false;
		draft.color = hex;
		applyDraftLive();
		try {
			pickr?.setColor(hex, true);
		} catch {
			/* Pickr may be mid-teardown — draft already holds the value */
		}
		recordRecent(hex);
		return true;
	}
	function onHexChange(e: Event) {
		const el = e.target as HTMLInputElement;
		if (!applyHexInput(el.value)) el.value = normalizeHex(draftColor); // reject → restore
	}

	/** Normalise a rotation to `[0, 360)` for display + storage. `undefined`
	 *  → 0 (default rotation for legacy markers). Non-finite → 0 so a stray
	 *  NaN doesn't invalidate the SVG transform. */
	function normalizeAngle(a: number | undefined): number {
		if (typeof a !== 'number' || !Number.isFinite(a)) return 0;
		const n = a % 360;
		return n < 0 ? n + 360 : n;
	}

	$effect(() => {
		if (!pickrAnchor) return;
		const anchor = pickrAnchor;
		// Portal Pickr into `document.body` — the clipping-free path. The
		// hex input inside the popover is still reachable because
		// Dialog.Content below pairs this with an `onFocusOutside` guard
		// that treats `.pcr-app` as part of the dialog's focus trap.
		const container = document.body;
		// `untrack` the initial color read so this effect ONLY re-runs
		// when the anchor element (or the parent container) actually
		// changes. Without it, every colour edit fed `selectedColor`
		// back into the effect, which destroyed + recreated the
		// picker mid-use — the "picker went poof after I picked a
		// colour" bug. External colour syncs go through the second
		// `$effect` below via `pickr.setColor(c, true)`.
		const initialColor = untrack(() => selectedColor);
		// Snapshot the MRU list at creation — `untrack` so reading it here
		// doesn't make `recents` a dependency of this effect (which would
		// destroy + recreate the picker every time a colour is recorded).
		const initialSwatches = untrack(() => [...recents]);
		const instance = Pickr.create({
			el: anchor,
			container,
			// Use our own `<button>` (with the palette icon coloured by
			// selectedColor) as the trigger instead of Pickr's default
			// round swatch chip. Pickr skips its own button chrome and
			// treats the anchor element as the button, so it opens the
			// popover on click and keeps `--pcr-color` off our element.
			useAsButton: true,
			theme: 'nano',
			default: initialColor,
			// Swatch row = the most-recently-used colours (see recordRecent).
			// Seeded with the eight tabletop hues; each commit reorders it.
			swatches: initialSwatches,
			components: {
				preview: true,
				opacity: false,
				hue: true,
				// No text field inside the popover: Pickr portals to <body>
				// and bits-ui's dialog focus trap yanks focus back to the
				// trigger button whenever an input in the portalled popover
				// is clicked, so a hex field there would be unusable by
				// keyboard. The editable, themeable hex field lives in the
				// dialog body instead (see the `.mp-hex-input` row) where
				// the focus trap can't fight it; swatch + wheel still commit
				// through the Pickr `change` listener as before.
				interaction: {
					hex: false,
					input: false,
					clear: false,
					save: false,
				},
			},
		});
		instance.on('change', (c: ReturnType<Pickr['getColor']>) => {
			// Live-edit form: write the draft AND push straight through to
			// the marker so the swatch/wheel colours the icon on the map
			// as the user drags. Cancel restores the pre-open snapshot.
			if (!draft) return;
			draft.color = normalizeHex(c.toHEXA().toString());
			applyDraftLive();
			// Pickr only refreshes the trigger chip's `--pcr-color` inside
			// applyColor(), which normally fires on Save. We removed the Save
			// button (save: false), so nudge applyColor() ourselves on every
			// live change. Guarded with try/catch because applyColor emits
			// 'save', which some Pickr versions choke on when save UI is off.
			try {
				instance.applyColor(true);
			} catch {
				/* known: applyColor's save-emit path when save:false */
			}
		});
		// Auto-dismiss once the user commits: a swatch tap is a single-tap
		// commit; wheel/hue dragging commits on pointer release (changestop).
		instance.on('swatchselect', () => {
			if (draft) recordRecent(draft.color);
			try {
				instance.hide();
			} catch {
				/* Pickr teardown race — safe to ignore */
			}
		});
		instance.on('changestop', () => {
			if (draft) recordRecent(draft.color);
			try {
				instance.hide();
			} catch {
				/* Pickr teardown race — safe to ignore */
			}
		});
		pickr = instance;
		return () => {
			// Pickr's teardown races with pending tap/pointer events on
			// its internal wheel: `_tapstop` / `_tapmove` fire from
			// document-level listeners after `destroyAndRemove()` has
			// nulled the instance's internal color/emitter, throwing
			// "Cannot read properties of null". Swallow — the picker is
			// gone either way. The user just closed the dialog.
			try {
				instance.destroyAndRemove();
			} catch {
				/* known Pickr teardown race */
			}
			if (pickr === instance) pickr = null;
		};
	});

	// Sync widget → draft-colour when the picked marker changes or a
	// fresh snapshot lands (new marker selected). silent:true so
	// setColor doesn't re-fire our 'change' handler and stomp itself.
	$effect(() => {
		const c = draft?.color;
		const p = pickr;
		if (!p || !c) return;
		const cur = normalizeHex(p.getColor()?.toHEXA().toString() ?? '');
		if (cur !== c.toLowerCase()) p.setColor(c, true);
	});

	// Derive the selected marker's icon record + color so the icon
	// button always shows the current preview.
	const selectedIcon = $derived(selectedMarker ? resolveMarkerIcon(selectedMarker) : undefined);
	const selectedColor = $derived(selectedMarker?.color || DEFAULT_MARKER_COLOR);
	/** Angle currently displayed in the spinner — always in `[0, 360)`.
	 *  Kept as a plain derived because the draft-aware `draftAngle`
	 *  derived below falls back to this when no draft exists yet. */
	const selectedAngle = $derived(normalizeAngle(selectedMarker?.angle));

	// ─── Marker properties — live edit + snapshot restore ────────────
	// `draft` is retained purely as the form's bound view of the
	// marker's fields so bits-ui inputs have something reactive to
	// bind to; edits flow through it to `updateMarker`.
	type MarkerDraft = {
		label: string;
		icon: string | null;
		/** Generated settlement recipe; set together with `icon` (its
		 *  fallback) by the builder tab, cleared by picking a plain icon. */
		settlement: SettlementRecipe | undefined;
		color: string;
		angle: number;
		/** Per-marker icon scale multiplier (1 = default). Draft keeps the
		 *  normalised value — writes back to `MapMarker.scale` as absent
		 *  when it rounds to 1 so default-scale markers stay byte-identical
		 *  with pre-scaling data. */
		scale: number;
		entityId: string;
		/** Text emphasis on the label — mirrors the boolean flags on
		 *  `MapMarker.labelStyle`. Kept as four discrete booleans in the
		 *  draft so the toggle buttons in the UI bind directly. */
		bold: boolean;
		italic: boolean;
		underline: boolean;
		/** Case transform — 'regular' is the absent-field default; the
		 *  other two are mutually exclusive alternatives (setting one
		 *  clears the other). Stored as `labelStyle.case` when != 'regular'. */
		case: 'regular' | 'small-caps' | 'uppercase';
		labelPosition: MapMarkerLabelPosition;
		/** Label size tier — H4 → H1. 'md' is the absent-field default;
		 *  serialised as `labelStyle.size` when != 'md'. */
		size: LabelSize;
	};
	let draft = $state<MarkerDraft | null>(null);
	let originalMarker = $state<MarkerDraft | null>(null);
	$effect(() => {
		const id = markerId;
		if (id === null) {
			// Deselected — parent cleared selectedMarker. Close the dialog
			// (in case it was open) and drop the draft so a subsequent
			// re-selection starts from a fresh snapshot.
			open = false;
			draft = null;
			originalMarker = null;
			return;
		}
		const m = untrack(() => selectedMarker);
		if (!m) return;
		// Snapshot the marker into the draft on every genuine selection
		// change. `open` is left alone here — the parent controls when the
		// dialog is shown (this lets the marker be selected on the canvas
		// with the dialog closed for arrow-key nudging).
		const snap: MarkerDraft = {
			label: m.label ?? '',
			icon: m.icon ?? null,
			settlement: m.settlement && { ...m.settlement },
			color: m.color ?? DEFAULT_MARKER_COLOR,
			angle: normalizeAngle(m.angle),
			scale: markerScale(m),
			entityId: m.entityId ?? '',
			bold: !!m.labelStyle?.bold,
			italic: !!m.labelStyle?.italic,
			underline: !!m.labelStyle?.underline,
			case: m.labelStyle?.case ?? 'regular',
			labelPosition: m.labelPosition ?? 'bottom',
			size: m.labelStyle?.size ?? 'md',
		};
		originalMarker = snap;
		draft = { ...snap };
	});

	/** Push the draft's current values straight through to the live
	 *  marker so every edit is visible on the canvas immediately. Also
	 *  the single place we call `updateMarker` from the editor — every
	 *  handler updates the draft then calls this. */
	function applyDraftLive() {
		if (!draft || !selectedMarker) return;
		// Persist labelStyle only when at least one flag is set — an empty
		// object round-trips as an empty object in JSON but shipping it
		// forever wastes the "no styling" byte-savings for the 99 % of
		// markers that never touch these toggles.
		const anyStyle =
			draft.bold ||
			draft.italic ||
			draft.underline ||
			draft.case !== 'regular' ||
			draft.size !== 'md';
		const labelStyle = anyStyle
			? {
					bold: draft.bold || undefined,
					italic: draft.italic || undefined,
					underline: draft.underline || undefined,
					case: draft.case === 'regular' ? undefined : draft.case,
					size: draft.size === 'md' ? undefined : draft.size,
				}
			: undefined;
		updateMarker(selectedMarker.id, {
			label: draft.label,
			icon: draft.icon ?? undefined,
			settlement: draft.settlement,
			color: draft.color,
			angle: draft.angle,
			// Store absent when it round-trips to 1 so default-scale
			// markers stay byte-identical with pre-scaling rows and never
			// generate a persistence delta.
			scale: Math.abs(draft.scale - 1) < 0.005 ? undefined : draft.scale,
			entityId: draft.entityId || undefined,
			labelStyle,
			labelPosition: draft.labelPosition === 'bottom' ? undefined : draft.labelPosition,
		});
	}

	/** Draft-aware previews for the marker-editor UI. Fall back to the
	 *  live selectedMarker readings pre-snapshot so the first paint
	 *  after selection isn't blank. */
	const draftIcon = $derived(
		draft
			? resolveMarkerIcon({ icon: draft.icon ?? '', settlement: draft.settlement })
			: selectedIcon,
	);
	const draftColor = $derived(draft?.color ?? selectedColor);
	const draftAngle = $derived(draft ? normalizeAngle(draft.angle) : selectedAngle);
	const draftLinkedEntity = $derived(draft ? resolveEntity(draft.entityId) : null);

	// Gating derived from the draft's two "visual" fields. Icon-only
	// controls (angle) grey out when there's no icon to rotate; label-only
	// controls (Style row) grey out when there's no text to style;
	// Position needs BOTH (positioning a label relative to an icon that
	// isn't there makes no sense either way). The OK button gates on
	// "either present" — a marker with neither icon nor label would be
	// invisible on the canvas, so we won't let the user commit that.
	const hasIcon = $derived(!!draft?.icon);
	const hasLabel = $derived(!!draft?.label.trim());
	const canSave = $derived(hasIcon || hasLabel);

	function onDraftLabelInput(e: Event) {
		if (!draft) return;
		draft.label = (e.target as HTMLInputElement).value;
		applyDraftLive();
	}
	function toggleLabelStyle(key: 'bold' | 'italic' | 'underline') {
		if (!draft) return;
		draft[key] = !draft[key];
		applyDraftLive();
	}
	/** Case is a radio group: picking a new option always replaces the
	 *  current one. Clicking the already-active option is a no-op — we
	 *  don't want a "clear" gesture on a radio (that's what the Regular
	 *  cell is for). */
	function pickCase(next: 'regular' | 'small-caps' | 'uppercase') {
		if (!draft || draft.case === next) return;
		draft.case = next;
		applyDraftLive();
	}
	function pickLabelPosition(pos: MapMarkerLabelPosition) {
		if (!draft) return;
		draft.labelPosition = pos;
		applyDraftLive();
	}
	function pickLabelSize(next: LabelSize) {
		if (!draft || draft.size === next) return;
		draft.size = next;
		applyDraftLive();
	}
	function onDraftAngleInput(e: Event) {
		if (!draft) return;
		const raw = (e.target as HTMLInputElement).value;
		const n = parseFloat(raw);
		draft.angle = Number.isFinite(n) ? normalizeAngle(n) : 0;
		applyDraftLive();
	}
	function stepDraftAngle(delta: number) {
		if (!draft) return;
		draft.angle = normalizeAngle(draft.angle + delta);
		applyDraftLive();
	}
	function onDraftScaleInput(e: Event) {
		if (!draft) return;
		const raw = (e.target as HTMLInputElement).value;
		const n = parseFloat(raw);
		if (!Number.isFinite(n)) return;
		draft.scale = Math.min(MAX_MARKER_SCALE, Math.max(MIN_MARKER_SCALE, n));
		applyDraftLive();
	}
	function pickDraftEntity(value: string) {
		if (!draft) return;
		draft.entityId = value;
		// Auto-fill label from the picked entity when the draft still
		// has an empty name — same convenience the old handler offered.
		if (value && !draft.label.trim()) {
			const link = resolveEntity(value);
			if (link) draft.label = link.name;
		}
		entityPickerOpen = false;
		applyDraftLive();
	}
	function pickDraftIcon(key: string) {
		if (!draft) {
			closeIconPicker();
			return;
		}
		draft.icon = key;
		draft.settlement = undefined;
		applyDraftLive();
		closeIconPicker();
	}
	/** Builder tab's "Use this": the recipe plus its plain fallback icon. */
	function pickDraftSettlement(recipe: SettlementRecipe) {
		if (!draft) {
			closeIconPicker();
			return;
		}
		draft.settlement = recipe;
		draft.icon = fallbackIcon(recipe);
		applyDraftLive();
		closeIconPicker();
	}

	function deleteSelected() {
		if (!selectedMarker) return;
		removeMarker(selectedMarker.id);
		onClose();
	}

	/** OK — the marker already carries every draft edit; just close. */
	function commitDraft() {
		open = false;
	}

	/** Cancel — re-apply the snapshot taken on open so the marker
	 *  reverts to whatever it looked like BEFORE the dialog was
	 *  entered, then close. The effect above clears draft/original
	 *  once `selectedMarker` returns to null. */
	function cancelDraft() {
		if (originalMarker && selectedMarker) {
			const anyStyle =
				originalMarker.bold ||
				originalMarker.italic ||
				originalMarker.underline ||
				originalMarker.case !== 'regular' ||
				originalMarker.size !== 'md';
			updateMarker(selectedMarker.id, {
				label: originalMarker.label,
				icon: originalMarker.icon ?? undefined,
				settlement: originalMarker.settlement,
				color: originalMarker.color,
				angle: originalMarker.angle,
				scale: Math.abs(originalMarker.scale - 1) < 0.005 ? undefined : originalMarker.scale,
				entityId: originalMarker.entityId || undefined,
				labelStyle: anyStyle
					? {
							bold: originalMarker.bold || undefined,
							italic: originalMarker.italic || undefined,
							underline: originalMarker.underline || undefined,
							case: originalMarker.case === 'regular' ? undefined : originalMarker.case,
							size: originalMarker.size === 'md' ? undefined : originalMarker.size,
						}
					: undefined,
				labelPosition:
					originalMarker.labelPosition === 'bottom' ? undefined : originalMarker.labelPosition,
			});
		}
		open = false;
	}
</script>

{#if selectedMarker && draft}
	<Dialog.Root
		bind:open
		onOpenChange={(next) => {
			if (!next) onClose();
		}}
	>
		<Dialog.Portal>
			<Dialog.Overlay class="mp-props-overlay" style="z-index: {overlayZ(stackDepth)}" />
			<Dialog.Content
				bind:ref={dialogEl}
				class="mp-props-dialog"
				style="z-index: {contentZ(stackDepth)}"
				interactOutsideBehavior="ignore"
			>
				<DialogHeader
					title={headingText('Edit Marker')}
					onclose={cancelDraft}
					radius="8px 8px 0 0"
				/>
				<div class="mp-props-body">
					<!-- Label input + label position share the first row. Position
					     rides at the tail so the arrow glyph doesn't crowd the
					     name input; disabled when either half of the pair is
					     missing (no icon → label centres regardless, no label
					     → nothing to position). -->
					<div class="mp-props-row">
						<label class="mp-props-field mp-props-field--label">
							<span class="mp-props-label">Label</span>
							<input
								id="mp-props-name"
								name="mp-props-name"
								class="mp-props-input"
								type="text"
								placeholder="Marker label…"
								value={draft.label}
								oninput={onDraftLabelInput}
							/>
						</label>
						<label class="mp-props-field mp-props-field--position">
							<span class="mp-props-label">Position</span>
							<Select
								value={draft.labelPosition}
								options={LABEL_POSITION_OPTIONS}
								ariaLabel="Label position"
								disabled={!hasIcon || !hasLabel}
								onchange={pickLabelPosition}
							/>
						</label>
					</div>

					<!-- Text emphasis toggles — each one flips a single boolean on
					     `draft.labelStyle` via toggleLabelStyle(). aria-pressed +
					     data-active track the pressed state; the ↦ live preview is
					     applied straight on the button label so a glance tells the
					     user what the map will look like. -->
					<div class="mp-props-row">
						<div class="mp-props-field mp-props-field--style">
							<span class="mp-props-label">Style</span>
							<div class="mp-style-row" role="group" aria-label="Label text style">
								<!-- Bold / Italic / Underline — independent boolean toggles.
								     Disabled when there's no label to style. -->
								<button
									type="button"
									class="mp-style-btn"
									data-active={draft.bold}
									aria-pressed={draft.bold}
									aria-label="Bold"
									disabled={!hasLabel}
									onclick={() => toggleLabelStyle('bold')}
									style="font-weight:800">B</button
								>
								<button
									type="button"
									class="mp-style-btn"
									data-active={draft.italic}
									aria-pressed={draft.italic}
									aria-label="Italic"
									disabled={!hasLabel}
									onclick={() => toggleLabelStyle('italic')}
									style="font-style:italic">I</button
								>
								<button
									type="button"
									class="mp-style-btn"
									data-active={draft.underline}
									aria-pressed={draft.underline}
									aria-label="Underline"
									disabled={!hasLabel}
									onclick={() => toggleLabelStyle('underline')}
									style="text-decoration:underline">U</button
								>
								<!-- Case — mutually exclusive radio group: Regular /
							     Small caps / Uppercase. The active one is highlighted
							     the same way pressed toggles are; role=radio +
							     aria-checked carry the semantics for AT. -->
								<span class="mp-style-sep" aria-hidden="true"></span>
								<div class="mp-style-radios" role="radiogroup" aria-label="Case">
									<button
										type="button"
										class="mp-style-btn"
										role="radio"
										aria-checked={draft.case === 'regular'}
										data-active={draft.case === 'regular'}
										aria-label="Regular case"
										disabled={!hasLabel}
										onclick={() => pickCase('regular')}>Aa</button
									>
									<button
										type="button"
										class="mp-style-btn mp-style-btn--sc"
										role="radio"
										aria-checked={draft.case === 'small-caps'}
										data-active={draft.case === 'small-caps'}
										aria-label="Small caps"
										disabled={!hasLabel}
										onclick={() => pickCase('small-caps')}
										>A<span class="mp-style-btn-xheight">A</span></button
									>
									<button
										type="button"
										class="mp-style-btn"
										role="radio"
										aria-checked={draft.case === 'uppercase'}
										data-active={draft.case === 'uppercase'}
										aria-label="Uppercase"
										disabled={!hasLabel}
										onclick={() => pickCase('uppercase')}
										style="text-transform:uppercase">AA</button
									>
								</div>
							</div>
						</div>

						<!-- Label size — H4 → H1 typographic tiers. Sits on the
						     Style row so all label-typography controls (emphasis,
						     case, size) group in one place. Disabled when there's
						     no label to size. -->
						<label class="mp-props-field mp-props-field--size">
							<span class="mp-props-label">Size</span>
							<Select
								value={draft.size}
								options={LABEL_SIZE_OPTIONS}
								ariaLabel="Label size"
								disabled={!hasLabel}
								onchange={pickLabelSize}
							/>
						</label>
					</div>

					<div class="mp-props-row">
						<label class="mp-props-field mp-props-field--angle">
							<span class="mp-props-label">Angle</span>
							<div class="mp-sel-angle" role="group" aria-label="Marker rotation">
								<button
									type="button"
									class="mp-sel-angle-step"
									disabled={!canSave}
									onclick={() => stepDraftAngle(-15)}
									aria-label="Rotate counter-clockwise">{@html minusSvg}</button
								>
								<span class="mp-sel-angle-field">
									<input
										id="mp-props-angle"
										name="mp-props-angle"
										class="mp-sel-angle-input"
										type="number"
										min="0"
										max="359"
										step="15"
										disabled={!canSave}
										value={draftAngle}
										oninput={onDraftAngleInput}
										aria-label="Marker rotation in degrees"
									/>
									<span class="mp-sel-angle-unit" aria-hidden="true">°</span>
								</span>
								<button
									type="button"
									class="mp-sel-angle-step"
									disabled={!canSave}
									onclick={() => stepDraftAngle(15)}
									aria-label="Rotate clockwise">{@html plusSvg}</button
								>
							</div>
						</label>

						<label class="mp-props-field mp-props-field--color">
							<span class="mp-props-label">Colour</span>
							<button
								type="button"
								class="mp-sel-color-btn"
								style="color: {draftColor}"
								bind:this={pickrAnchor}
								disabled={!canSave}
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
						</label>

						<!-- Hex field — lives in the dialog body (not the Pickr popover)
						     because Pickr portals its popover to <body> and bits-ui's
						     focus trap yanks focus back to the trigger whenever an
						     input in the portalled popover is clicked. Shows the
						     current colour as `#rrggbb` and accepts hex / rgb() /
						     `r,g,b` on change. -->
						<label class="mp-props-field mp-props-field--hex">
							<span class="mp-props-label">Hex</span>
							<input
								class="mp-hex-input"
								type="text"
								spellcheck="false"
								autocomplete="off"
								disabled={!canSave}
								value={normalizeHex(draftColor)}
								onchange={onHexChange}
								aria-label="Icon colour as hex — type #rrggbb to set"
							/>
						</label>

						<label class="mp-props-field mp-props-field--icon">
							<span class="mp-props-label">Icon</span>
							<button class="mp-sel-icon-btn" onclick={openIconPicker} aria-label="Change icon">
								{#if draftIcon}
									<svg viewBox={haloPaddedViewBox(draftIcon)} aria-hidden="true">
										<!-- 'proportional' halo so the preview glow matches the
										     map's weight at this larger button size, not a faint
										     hairline. -->
										{@html mapGlyphInner(draftIcon, draftColor, 'props-preview', 'proportional')}
									</svg>
								{:else}
									<span class="mp-sel-icon-none" aria-hidden="true">Aa</span>
								{/if}
							</button>
						</label>

						<label class="mp-props-field mp-props-field--scale">
							<span class="mp-props-label"
								>Scale <span class="mp-sel-scale-readout">{draft.scale.toFixed(2)}×</span></span
							>
							<input
								class="mp-sel-scale-range"
								type="range"
								min={MIN_MARKER_SCALE}
								max={MAX_MARKER_SCALE}
								step="0.1"
								disabled={!canSave}
								value={draft.scale}
								oninput={onDraftScaleInput}
								aria-label="Icon size multiplier"
							/>
						</label>
					</div>

					<!-- Not a <label>: a <label> forwards clicks to its first
					     labelable descendant, which would hijack the "Go to" button. -->
					<div class="mp-props-field">
						<span class="mp-props-label">Link to</span>
						<div class="mp-link-row">
							<Combobox
								bind:open={entityPickerOpen}
								items={sortedLinkableEntities}
								getKey={(e) => `${e.kind}:${e.id}`}
								getLabel={(e) => e.name}
								getIcon={(e) => KIND_META[e.kind].icon}
								getColor={(e) => KIND_META[e.kind].color}
								activeKey={draft.entityId}
								onselect={(e) => pickDraftEntity(`${e.kind}:${e.id}`)}
								triggerValue={draftLinkedEntity ? draftLinkedEntity.name : ''}
								triggerIcon={draftLinkedEntity
									? ENTITY_KIND_META[draftLinkedEntity.kind].icon
									: undefined}
								triggerColor={draftLinkedEntity
									? ENTITY_KIND_META[draftLinkedEntity.kind].color
									: undefined}
								placeholder={draft.entityId && !draftLinkedEntity ? 'Broken link' : '— No link —'}
								searchPlaceholder="Search connections…"
								emptyText="No matching connections."
								ariaLabel="Link marker to a connection"
								class="mp-sel-entity-btn"
								clearItem={{ label: '— No link —', onselect: () => pickDraftEntity('') }}
							/>
						</div>
					</div>
				</div>
				<div class="mp-props-footer">
					<button class="btn btn-danger" onclick={deleteSelected} aria-label="Delete marker">
						DELETE
					</button>
					<div class="mp-props-footer-spacer"></div>
					<button class="btn" onclick={cancelDraft}>Cancel</button>
					<button
						class="btn btn-primary"
						disabled={!canSave}
						use:tooltip={canSave ? '' : 'A marker needs an icon or a label'}
						onclick={commitDraft}>OK</button
					>
				</div>
			</Dialog.Content>
		</Dialog.Portal>
	</Dialog.Root>
{/if}

<!--
	Icon picker — nested modal that lists every manifest icon grouped by
	category with a search filter. Live-color-previews using the currently-
	selected marker's color so users can see what they'll get.
-->
<MapIconPicker
	bind:open={iconDialogOpen}
	{selectedColor}
	currentIcon={draft?.icon}
	currentSettlement={draft?.settlement}
	onpick={pickDraftIcon}
	onpicksettlement={pickDraftSettlement}
	onclose={closeIconPicker}
/>
