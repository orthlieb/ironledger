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
	import { Dialog, RadioGroup } from 'bits-ui';
	import Combobox from '#lib/components/Combobox.svelte';
	import { normalizeAngle } from '#lib/mapGeometry.js';
	import ColorPicker from '#lib/components/ColorPicker.svelte';
	import { pushDialog, popDialog, overlayZ, contentZ } from '#lib/dialogStack.svelte.js';
	import DialogHeader from './DialogHeader.svelte';
	import MapIconPicker from './MapIconPicker.svelte';
	import { headingText } from '#lib/fontStore.svelte.js';
	import { DEFAULT_MARKER_COLOR, haloPaddedViewBox, mapGlyphInner } from '#lib/mapConstants.js';
	import { resolveMarkerIcon } from '#lib/settlementIcons.svelte.js';
	import { fallbackIcon } from '#lib/settlement-kit/fallback.js';
	import type { SettlementRecipe } from '#lib/settlementRecipe.js';
	import {
		updateMarker,
		removeMarker,
		markerScale,
		markerLayerId,
		mapLayers,
		revealMarkerLayer,
		deriveMarkerType,
		DEFAULT_LAYER_ID,
		MIN_MARKER_SCALE,
		MAX_MARKER_SCALE,
		type MapMarker,
		type MapMarkerLabelPosition,
	} from '#lib/mapStore.svelte.js';
	import { getLinkableEntities, resolveEntity } from '#lib/mapEntityLinks.js';
	import { ENTITY_KIND_META } from '#lib/entityKinds.js';
	import { tooltip } from '#lib/actions/tooltip.js';
	import iconPaletteSvg from '#icons/palette-solid.svg?raw';
	import Select from '#lib/components/Select.svelte';
	import plusSvg from '#icons/plus-solid.svg?raw';
	import minusSvg from '#icons/minus-solid.svg?raw';

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
	 *  by the corresponding factor (see LABEL_SIZE_MULT in mapLabel.ts). */
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

	// ─── Marker colour helpers ──────────────────────────────────────────────
	// The actual picker UI is `<ColorPicker>` (vanilla-colorful inside a
	// bits-ui Popover, see ColorPicker.svelte); this section just owns the
	// MRU swatch persistence + the hex input beside the picker's trigger.

	/** Seven-char `#rrggbb` (no alpha) normaliser — safe for strings coming
	 *  from a hand-edited row (upper-case, shorthand, missing `#`). */
	function normalizeHex(color: string): string {
		if (!color) return color;
		let hx = color.toLowerCase().replace(/^#/, '');
		if (/^[0-9a-f]{3}$/.test(hx)) hx = hx.replace(/./g, (c) => c + c);
		return '#' + hx.slice(0, 6);
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

	/** Move `hex` to the front of the MRU list, dedupe, cap, persist. */
	function recordRecent(hex: string) {
		const c = normalizeHex(hex);
		if (!/^#[0-9a-f]{6}$/.test(c)) return;
		recents = [c, ...recents.filter((x) => x !== c)].slice(0, RECENTS_MAX);
		try {
			localStorage.setItem(RECENTS_KEY, JSON.stringify(recents));
		} catch {
			/* persistence is best-effort */
		}
	}

	/** ColorPicker `onchange` — fires on every drag of the picker. Push the
	 *  live colour through the draft (which colours the marker on the map
	 *  as the user drags). Swatch commits route through `onColorSwatch`
	 *  for MRU recording. */
	function onColorChange(hex: string) {
		if (!draft) return;
		draft.color = normalizeHex(hex);
		applyDraftLive();
	}
	function onColorSwatch(hex: string) {
		if (!draft) return;
		draft.color = normalizeHex(hex);
		applyDraftLive();
		recordRecent(hex);
	}

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
		/** The marker's layer id — the default layer is stored as absent. */
		layer: string;
		/** What the marker shows — the Both / Label / Icon radios. Snapshotted
		 *  from the marker's `type` (or derived for a pre-`type` marker). */
		type: NonNullable<MapMarker['type']>;
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
			layer: markerLayerId(m),
			// Explicit `type` wins; a pre-`type` marker is read from what it has.
			type: m.type ?? deriveMarkerType(m),
		};
		originalMarker = snap;
		draft = { ...snap };
		// Open in the mode the marker is already in.
		editMode = snap.type;
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
		// `type` (the Both / Label / Icon radios) decides what the marker
		// shows; both halves are kept either way, so flipping modes never
		// loses the icon or the text. We always write an explicit type.
		updateMarker(selectedMarker.id, {
			label: draft.label,
			icon: draft.icon ?? '',
			settlement: draft.settlement,
			type: editMode,
			color: draft.color,
			angle: draft.angle,
			// Store absent when it round-trips to 1 so default-scale
			// markers stay byte-identical with pre-scaling rows and never
			// generate a persistence delta.
			scale: Math.abs(draft.scale - 1) < 0.005 ? undefined : draft.scale,
			entityId: draft.entityId || undefined,
			labelStyle,
			labelPosition: draft.labelPosition === 'bottom' ? undefined : draft.labelPosition,
			layer: draft.layer === DEFAULT_LAYER_ID ? undefined : draft.layer,
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

	/** Which column of the editor is active. Both = default = everything live;
	 *  Label = only label text / position / style / size editable; Icon =
	 *  only icon picker / scale editable. Colour and Angle are always live
	 *  (they belong to the marker as a whole, not to one half). Dialog-local —
	 *  not persisted on the marker. */
	let editMode = $state<'both' | 'label' | 'icon'>('both');
	const labelActive = $derived(editMode !== 'icon');
	const iconActive = $derived(editMode !== 'label');
	// Gate the OK button on what the chosen mode will actually show: Label
	// needs text, Icon needs an icon, Both needs at least one — a marker
	// that would render nothing can't be committed.
	const canSave = $derived(
		editMode === 'label' ? hasLabel : editMode === 'icon' ? hasIcon : hasIcon || hasLabel,
	);

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
	/** The map's layers, for the Layer field. */
	const layerOptions = $derived(mapLayers().map((l) => ({ value: l.id, label: l.name })));
	/** Move the marker to a layer — shown, if it was hidden, so the marker
	 *  doesn't vanish as it's moved. */
	function pickLayer(id: string) {
		if (!draft || draft.layer === id) return;
		draft.layer = id;
		revealMarkerLayer({ layer: id });
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
				icon: originalMarker.icon ?? '',
				settlement: originalMarker.settlement,
				type: originalMarker.type,
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
				layer: originalMarker.layer === DEFAULT_LAYER_ID ? undefined : originalMarker.layer,
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
			<Dialog.Overlay
				class="dialog-overlay mp-props-overlay"
				style="z-index: {overlayZ(stackDepth)}"
			/>
			<Dialog.Content
				bind:ref={dialogEl}
				class="mp-props-dialog"
				style="z-index: {contentZ(stackDepth)}"
				interactOutsideBehavior="ignore"
				data-tour="marker-dialog"
			>
				<DialogHeader
					title={headingText('Edit Marker')}
					onclose={cancelDraft}
					radius="8px 8px 0 0"
				/>
				<div class="mp-props-body">
					<!-- Top row — Edit mode (Both / Label / Icon) + the two
					     always-live knobs (Colour and Angle). The mode gates
					     which of the Label- vs Icon-specific rows below are
					     interactive; Colour and Angle belong to the marker as
					     a whole and stay live in every mode. -->
					<div class="mp-props-row">
						<div class="mp-props-field mp-props-field--mode">
							<span class="mp-props-label">Type</span>
							<RadioGroup.Root
								value={editMode}
								onValueChange={(v) => {
									editMode = v as 'both' | 'label' | 'icon';
									// The mode drives what the marker shows, so push it live.
									applyDraftLive();
								}}
								class="mp-mode-radios"
								aria-label="Marker type"
							>
								{#each ['both', 'label', 'icon'] as const as mode (mode)}
									<label class="mp-mode-option">
										<RadioGroup.Item value={mode} class="mp-mode-btn">
											<span class="mp-mode-dot"></span>
										</RadioGroup.Item>
										<span class="mp-mode-text">
											{mode === 'both' ? 'Both' : mode === 'label' ? 'Label' : 'Icon'}
										</span>
									</label>
								{/each}
							</RadioGroup.Root>
						</div>

						<label class="mp-props-field mp-props-field--color">
							<span class="mp-props-label">Colour</span>
							<ColorPicker
								value={draftColor}
								onchange={onColorChange}
								onswatch={onColorSwatch}
								disabled={!canSave}
								swatches={recents}
								ariaLabel="Icon colour"
							>
								{#snippet trigger({ props })}
									<button
										type="button"
										class="mp-sel-color-btn"
										style="color: {draftColor}"
										disabled={!canSave}
										aria-label="Icon colour"
										{...props}
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
								{/snippet}
							</ColorPicker>
						</label>

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
					</div>

					<!-- Layer + Link to — marker-wide knobs like type/colour/angle,
					     so they share a 50/50 row directly below it. -->
					<div class="mp-props-row">
						<label class="mp-props-field mp-props-field--layer mp-props-field--half">
							<span class="mp-props-label">Layer</span>
							<Select
								value={draft.layer}
								options={layerOptions}
								ariaLabel="Layer"
								onchange={pickLayer}
							/>
						</label>
						<div class="mp-props-field mp-props-field--half">
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
									tour="marker-link"
									clearItem={{ label: '— No link —', onselect: () => pickDraftEntity('') }}
								/>
							</div>
						</div>
					</div>

					<hr class="mp-props-divider" />

					<!-- Label input + label position share the first row. Position
					     rides at the tail so the arrow glyph doesn't crowd the
					     name input; disabled when either half of the pair is
					     missing (no icon → label centres regardless, no label
					     → nothing to position). The whole row dims when the user
					     has picked "Icon" in the mode group. -->
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
								disabled={!labelActive}
							/>
						</label>
						<label class="mp-props-field mp-props-field--position">
							<span class="mp-props-label">Position</span>
							<Select
								value={draft.labelPosition}
								options={LABEL_POSITION_OPTIONS}
								ariaLabel="Label position"
								disabled={!labelActive || !hasIcon || !hasLabel}
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
								<button
									type="button"
									class="mp-style-btn"
									data-active={draft.bold}
									aria-pressed={draft.bold}
									aria-label="Bold"
									disabled={!labelActive || !hasLabel}
									onclick={() => toggleLabelStyle('bold')}
									style="font-weight:800">B</button
								>
								<button
									type="button"
									class="mp-style-btn"
									data-active={draft.italic}
									aria-pressed={draft.italic}
									aria-label="Italic"
									disabled={!labelActive || !hasLabel}
									onclick={() => toggleLabelStyle('italic')}
									style="font-style:italic">I</button
								>
								<button
									type="button"
									class="mp-style-btn"
									data-active={draft.underline}
									aria-pressed={draft.underline}
									aria-label="Underline"
									disabled={!labelActive || !hasLabel}
									onclick={() => toggleLabelStyle('underline')}
									style="text-decoration:underline">U</button
								>
								<span class="mp-style-sep" aria-hidden="true"></span>
								<div class="mp-style-radios" role="radiogroup" aria-label="Case">
									<button
										type="button"
										class="mp-style-btn"
										role="radio"
										aria-checked={draft.case === 'regular'}
										data-active={draft.case === 'regular'}
										aria-label="Regular case"
										disabled={!labelActive || !hasLabel}
										onclick={() => pickCase('regular')}>Aa</button
									>
									<button
										type="button"
										class="mp-style-btn mp-style-btn--sc"
										role="radio"
										aria-checked={draft.case === 'small-caps'}
										data-active={draft.case === 'small-caps'}
										aria-label="Small caps"
										disabled={!labelActive || !hasLabel}
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
										disabled={!labelActive || !hasLabel}
										onclick={() => pickCase('uppercase')}
										style="text-transform:uppercase">AA</button
									>
								</div>
							</div>
						</div>

						<label class="mp-props-field mp-props-field--size">
							<span class="mp-props-label">Size</span>
							<Select
								value={draft.size}
								options={LABEL_SIZE_OPTIONS}
								ariaLabel="Label size"
								disabled={!labelActive || !hasLabel}
								onchange={pickLabelSize}
							/>
						</label>
					</div>

					<hr class="mp-props-divider" />

					<!-- Icon picker + per-marker scale slider — dimmed when the
					     user picks "Label" in the mode group. -->
					<div class="mp-props-row">
						<label class="mp-props-field mp-props-field--icon">
							<span class="mp-props-label">Icon</span>
							<button
								class="mp-sel-icon-btn"
								onclick={openIconPicker}
								aria-label="Change icon"
								data-tour="marker-icon"
								disabled={!iconActive}
							>
								{#if draftIcon}
									<svg viewBox={haloPaddedViewBox(draftIcon)} aria-hidden="true">
										<!-- 'proportional' halo so the preview glow matches the
										     map's weight at this larger button size, not a faint
										     hairline. -->
										{@html mapGlyphInner(
											draftIcon,
											draftColor,
											'props-preview',
											'proportional',
											22,
										)}
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
								disabled={!iconActive || !canSave}
								value={draft.scale}
								oninput={onDraftScaleInput}
								aria-label="Icon size multiplier"
							/>
						</label>
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
						data-tour="marker-ok"
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

<style>
	/* This dialog's styles: the marker properties form and its selection
	   controls (icon, colour, angle, link). Global because bits-ui portals
	   the dialog to <body>. */
	/* Marker properties dialog. Same modal tier as the icon picker
	   (overlay 82 / content 83) so it sits above the outer MapDialog
	   without breaking the app's shared z-index budget. Layout is
	   vertical: header, form body, destructive-action footer. */
	/* z-index for .mp-props-* is set inline by MarkerPropertiesDialog
	   via dialogStack. */
	:global(.mp-props-dialog) {
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: min(460px, calc(100vw - 2rem));
		/* dvh, the viewport a phone actually shows (vh fallback) — see the
		   icon picker's height below. */
		max-height: 82vh;
		max-height: 82dvh;
		display: flex;
		flex-direction: column;
		background: var(--bg-card);
		color: var(--text);
		border-radius: 8px;
		box-shadow:
			0 16px 48px #00000070,
			0 0 0 1px var(--border-mid);
		outline: none;
		overflow: hidden;
	}
	:global(.mp-props-body) {
		padding: 12px 14px;
		display: flex;
		flex-direction: column;
		gap: 12px;
		overflow-y: auto;
		overscroll-behavior: contain;
	}
	:global(.mp-props-field) {
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-width: 0;
	}
	/* Link-to row: the entity combobox fills the width, the "Go to" action
	   sits to its right, both on one line and the same height. */
	:global(.mp-link-row) {
		display: flex;
		align-items: stretch;
		gap: 6px;
		min-width: 0;
	}
	:global(.mp-link-row .mp-combobox) {
		flex: 1 1 auto;
		min-width: 0;
	}
	:global(.mp-props-label) {
		font-family: var(--font-ui);
		font-size: 0.66rem;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-dimmer);
	}
	:global(.mp-props-input) {
		padding: 6px 8px;
		font-family: var(--font-ui);
		font-size: 0.9rem;
		color: var(--text);
		background: var(--bg-control);
		border: 1px solid var(--border-mid);
		border-radius: 4px;
	}
	:global(.mp-props-input:focus) {
		outline: none;
		border-color: var(--text-accent);
	}
	/* Dimmed + inert when the marker is in Icon mode (labelActive false),
	   matching the icon button / style toggles so the label half reads off.
	   The app's own bg/color override the native disabled look, so without
	   this the field stayed bright. */
	:global(.mp-props-input:disabled) {
		opacity: 0.4;
		cursor: default;
	}
	:global(.mp-props-row) {
		display: flex;
		gap: 12px;
		flex-wrap: wrap;
		align-items: flex-end;
	}
	/* Two fields splitting a row evenly (Layer + Link to). */
	:global(.mp-props-field--half) {
		flex: 1 1 0;
		min-width: 0;
	}
	/* Visual separator between the dialog's control groups (above Label,
	   Icon, and Link to). Sits in the body's vertical flex so the group's
	   own gap gives it breathing room; a hair-line border keeps it quiet
	   on both light and dark themes. */
	:global(.mp-props-divider) {
		border: none;
		border-top: 1px solid var(--border);
		margin: 0;
		width: 100%;
	}
	:global(.mp-props-field--icon),
	:global(.mp-props-field--color),
	:global(.mp-props-field--angle),
	:global(.mp-props-field--mode) {
		flex: 0 0 auto;
	}

	/* Edit-mode radio group — three chips in a row (Both | Label | Icon)
	   that gate which half of the dialog is active. Grows as needed to
	   fit its three options on the top row; wraps to its own line on
	   phone widths when Colour + Angle want their space. The chip itself
	   mirrors AssetCard's `.radio-option-btn` — same ring + fill-on-check
	   so the two radio widgets in the app read the same. */
	:global(.mp-props-field--mode) {
		flex: 1 1 auto;
		min-width: 0;
	}
	:global(.mp-mode-radios) {
		display: inline-flex;
		align-items: center;
		gap: 10px;
		height: 32px;
	}
	:global(.mp-mode-option) {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		cursor: pointer;
		font-family: var(--font-ui);
		font-size: 0.85rem;
		color: var(--text);
		user-select: none;
	}
	:global(.mp-mode-btn) {
		flex-shrink: 0;
		width: 14px;
		height: 14px;
		padding: 0;
		background: var(--bg-control);
		border: 1px solid var(--border-mid);
		border-radius: 999px;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}
	:global(.mp-mode-btn:focus-visible) {
		outline: 2px solid var(--text-accent);
		outline-offset: 1px;
	}
	:global(.mp-mode-btn[data-state='checked']) {
		border-color: var(--text-accent);
	}
	:global(.mp-mode-dot) {
		width: 7px;
		height: 7px;
		border-radius: 999px;
		background: var(--text-accent);
		opacity: 0;
	}
	:global(.mp-mode-btn[data-state='checked'] .mp-mode-dot) {
		opacity: 1;
	}
	/* Icon and Colour hold a 22 × 22 button + 8 px padding (≈ 2.5rem), but
	   the label text ("COLOUR", "ICON") is wider than that, and when they
	   sit next to a stretch field like Hex the labels of adjacent narrow
	   fields can visually touch across the row's 12 px gap (the "COLOURHEX"
	   bug). Widen to 3.5rem so each label fits inside its own column and
	   the buttons stay vertically centred within the extra breathing room. */
	:global(.mp-props-field--icon),
	:global(.mp-props-field--color) {
		width: 3.5rem;
	}
	:global(.mp-props-field--icon .mp-sel-icon-btn),
	:global(.mp-props-field--color .mp-sel-color-btn) {
		align-self: flex-start;
	}

	/* Label field: the text input grows to fill the row; Position rides
	   at the tail as a narrow Select whose trigger only shows the arrow
	   glyph (~1 em). Position wraps under Label on phone widths when the
	   flex row can't spare its ~4.5rem tail. */
	:global(.mp-props-field--label) {
		flex: 1 1 auto;
		min-width: 0;
	}
	/* Style row is wide (7 buttons + a divider). Size (S / M / L / XL)
	   sits at the tail on the same row so all label-typography controls
	   live together. */
	:global(.mp-props-field--style) {
		flex: 0 0 auto;
	}
	/* Position + Size are both narrow Select triggers (arrow glyph or one
	   or two letters). Position keeps the ~4.5rem trigger (the arrow glyph
	   is visually airy); Size tightens to 3.25rem — just the letter + caret
	   + a hair of padding — so it drops off the Style row's trailing edge
	   without wrapping. */
	:global(.mp-props-field--position),
	:global(.mp-props-field--size) {
		flex: 0 0 auto;
	}
	:global(.mp-props-field--position .bui-select-trigger) {
		min-width: 4.5rem;
	}
	:global(.mp-props-field--size .bui-select-trigger) {
		min-width: 3.25rem;
	}
	/* Scale (per-marker icon scale) — a native range input that grows to
	   fill the row's trailing slot the same way RGB does. Both are stretch
	   fields with a 7rem wrap threshold, so on a phone they can drop below
	   their row-mates rather than squishing them. The readout chip rides
	   on the label, right-aligned, so the multiplier is visible as the
	   user drags. */
	:global(.mp-props-field--scale) {
		flex: 1 1 7rem;
		min-width: 7rem;
		gap: 2px;
	}
	:global(.mp-props-field--scale .mp-props-label) {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 8px;
	}
	:global(.mp-sel-scale-readout) {
		font-family: var(--font-mono);
		font-weight: 500;
		font-size: 0.72rem;
		letter-spacing: 0;
		text-transform: none;
		color: var(--text);
	}
	:global(.mp-sel-scale-range) {
		width: 100%;
		/* Line the thumb up with the 32 px tile row so the slider track sits
		   at the vertical mid-point of its row-mates instead of floating
		   below. The native height is implementation-defined (Chrome 32 px,
		   Safari 20 px), so pinning it here keeps the row's baseline
		   consistent across browsers. */
		height: 32px;
		margin: 0;
	}
	/* Dimmed in Label mode alongside the icon button (same row, same gate). */
	:global(.mp-sel-scale-range:disabled) {
		opacity: 0.4;
		cursor: default;
	}

	/* Label text-style toggles (Bold / Italic / Small caps / Underline) —
	   text-editor-toolbar feel. Each button previews its own effect on
	   the letter it displays (B, I, Aa, U); the pressed state uses the
	   accent-glow ground + accent border so a glance across the row tells
	   the user which flags are on without reading aria-pressed. */
	:global(.mp-style-row) {
		display: flex;
		gap: 4px;
		align-items: center;
	}
	/* Nested radio group (Regular / Small caps / Uppercase) — same button
	   family as the toggles, just gathered into a radiogroup so a11y
	   knows they're mutually exclusive. */
	:global(.mp-style-radios) {
		display: flex;
		gap: 4px;
	}
	/* Thin vertical rule between the boolean toggles (B / I / U) and the
	   case radio group so the two families read as distinct at a glance. */
	:global(.mp-style-sep) {
		width: 1px;
		align-self: stretch;
		margin: 0 4px;
		background: var(--border-mid);
	}
	/* Small-caps preview: the second character in the "A + x-height A"
	   glyph. Drops to lowercase x-height while keeping the uppercase
	   letterform, matching the CSS `font-variant: small-caps` look no
	   matter what the UI font supports. */
	:global(.mp-style-btn-xheight) {
		font-size: 0.72em;
		vertical-align: baseline;
		margin-left: 0.02em;
	}
	:global(.mp-style-btn) {
		min-width: 32px;
		height: 32px;
		padding: 0 8px;
		/* Fira Sans so the B / I / U / Aa / small-caps / AA glyphs
		   preview in the same font the marker label renders in. Falls
		   back through the UI stack. */
		font-family: 'Fira Sans', var(--font-ui);
		font-size: 0.95rem;
		color: var(--text);
		background: var(--bg-control);
		border: 1px solid var(--border-mid);
		border-radius: 4px;
		cursor: pointer;
		transition:
			background 120ms,
			border-color 120ms;
	}
	:global(.mp-style-btn:hover) {
		background: var(--bg-hover);
	}
	:global(.mp-style-btn[data-active='true']) {
		background: var(--accent-glow);
		border-color: var(--text-accent);
		color: var(--text-accent);
	}
	:global(.mp-style-btn:focus-visible) {
		outline: 2px solid var(--focus-ring);
		outline-offset: 1px;
	}
	/* Disabled state — greyed and non-interactive. Applied when the
	   feature the button controls has no target (Style buttons when
	   there's no label to style; case radios likewise). */
	:global(.mp-style-btn:disabled) {
		opacity: 0.4;
		cursor: not-allowed;
		background: var(--bg-control);
	}
	:global(.mp-style-btn:disabled:hover) {
		background: var(--bg-control);
	}

	:global(.mp-props-footer) {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 14px;
		border-top: 1px solid var(--border);
		background: var(--bg-inset);
	}
	:global(.mp-props-footer-spacer) {
		flex: 1 1 auto;
	}
	@media (max-width: 640px) {
		:global(.mp-props-dialog) {
			width: 90vw;
			max-height: 90vh;
			max-height: 90dvh;
		}
	}

	:global(.mp-sel-icon-btn) {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		box-sizing: border-box;
		width: 100%;
		height: 32px;
		padding: 0 8px;
		background: var(--bg-control);
		border: 1px solid var(--border-mid);
		border-radius: 4px;
		cursor: pointer;
		color: var(--text);
	}
	:global(.mp-sel-icon-btn:hover:not(:disabled)) {
		border-color: var(--text-accent);
	}
	/* Dimmed + inert when the marker is in Label mode (iconActive false),
	   matching .mp-btn / .mp-style-btn so the row reads as off. */
	:global(.mp-sel-icon-btn:disabled) {
		opacity: 0.4;
		cursor: default;
	}
	:global(.mp-sel-icon-btn svg) {
		width: 22px;
		height: 22px;
		flex-shrink: 0;
	}
	/* Colour picker trigger — a real `<button>` styled to match the
	   neighbouring `.mp-sel-icon-btn`. Click opens the ColorPicker's
	   bits-ui Popover which hosts the vanilla-colorful picker and the
	   MRU swatch strip (see ColorPicker.svelte). The palette SVG inside
	   picks up the selected colour via `currentColor` and the same
	   2-device-pixel white halo the map markers use, so light hues
	   read on dark backgrounds and dark hues read on light. */
	:global(.mp-sel-color-btn) {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		box-sizing: border-box;
		width: 100%;
		height: 32px;
		padding: 0 8px;
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
	/* Angle spinner — inline `−  ∠ nnn°  +` cluster. iOS Safari drops
	   the native <input type="number"> step arrows, so explicit step
	   buttons flank the numeric field to keep the spinner reachable on
	   touch. Whole group behaves as one segmented control. */
	:global(.mp-sel-angle) {
		display: inline-flex;
		align-items: stretch;
		box-sizing: border-box;
		height: 32px;
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
		width: 11px;
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
	:global(.mp-sel-angle-step svg) {
		width: 8px;
		height: 8px;
		fill: currentColor;
		display: block;
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
		gap: 2px;
		padding: 2px 2px 2px 4px;
		border-inline: 1px solid var(--border);
		font-family: var(--font-ui);
		font-size: 0.72rem;
		color: var(--text-muted);
	}
	:global(.mp-sel-angle-input) {
		width: 1.9em;
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
	:global(.mp-sel-angle-input::-webkit-outer-spin-button),
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
		/* Combobox trigger sits inside `.mp-props-field` (flex column):
		   default `align-items: stretch` gives it full width and the
		   min-height from `.cb-trigger` handles the vertical rhythm.
		   Explicit width so the inline-flex Popover.Trigger fills the
		   field on both mobile and desktop. */
		width: 100%;
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
</style>
