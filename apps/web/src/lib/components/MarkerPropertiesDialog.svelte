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
	 * selection. All the `.mp-props-*` / `.mp-sel-*` / `.mp-cmd-*`
	 * styling lives in MapDialog's global stylesheet — this component
	 * is only ever mounted by MapDialog, so the `:global` rules reach
	 * it there.
	 */
	import { untrack } from 'svelte';
	import { Dialog, Popover, Command } from 'bits-ui';
	import Pickr from '@simonwep/pickr';
	import '@simonwep/pickr/dist/themes/nano.min.css';
	import DialogHeader from './DialogHeader.svelte';
	import MapIconPicker from './MapIconPicker.svelte';
	import { headingText } from '$lib/fontStore.svelte.js';
	import { DEFAULT_MARKER_COLOR, resolveMapIcon } from '$lib/mapConstants.js';
	import { updateMarker, removeMarker, type MapMarker } from '$lib/mapStore.svelte.js';
	import { getLinkableEntities, resolveEntity } from '$lib/mapEntityLinks.js';
	import { ENTITY_KIND_META } from '$lib/entityKinds.js';
	import iconAngleSvg from '$icons/angle-solid-full.svg?raw';
	import iconPaletteSvg from '$icons/palette-solid-full.svg?raw';
	import iconCaretDownSvg from '$icons/caret-large-down-solid.svg?raw';
	import searchIconSvg from '$icons/magnifying-glass-solid-full.svg?raw';

	let { selectedMarker, onClose }: { selectedMarker: MapMarker | null; onClose: () => void } =
		$props();

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

	// One-way open sync: the dialog is open exactly when a marker is
	// selected. `markerId` is derived off the prop and stays stable
	// while the marker's *fields* change during live edit — so the
	// snapshot effect below re-runs only on a genuine selection change,
	// never on our own writes. Closing the dialog calls `onClose`,
	// which is where the parent clears its selection.
	const markerId = $derived(selectedMarker?.id ?? null);
	let propsDialogOpen = $state(false);

	/** Linkable entities sorted A-Z for stable presentation. Command
	 *  will filter this list by input text via each Item's `value`
	 *  (textContent) match, so we don't do our own substring filter. */
	const sortedLinkableEntities = $derived(
		getLinkableEntities()
			.slice()
			.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
	);

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
		// Portal Pickr into `document.body` and let the `.pcr-app`
		// z-index (bumped above the props dialog's 83) do the layering.
		// Anchoring it inside the props dialog itself makes it a child
		// of an `overflow: hidden` element, which clips the popover
		// against the dialog's rounded rectangle — the "colour wheel
		// is cut off" bug. Body is safe: bits-ui portals its own
		// dialogs the same way.
		const container = document.body;
		// `untrack` the initial color read so this effect ONLY re-runs
		// when the anchor element (or the parent container) actually
		// changes. Without it, every colour edit fed `selectedColor`
		// back into the effect, which destroyed + recreated the
		// picker mid-use — the "picker went poof after I picked a
		// colour" bug. External colour syncs go through the second
		// `$effect` below via `pickr.setColor(c, true)`.
		const initialColor = untrack(() => selectedColor);
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
				// No HEXA readout / text input / Save / Cancel row —
				// pick from the swatches or drag the wheel + hue and
				// we auto-close on release. The dialog's own Cancel
				// button restores the pre-open snapshot.
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
		// Auto-dismiss the popover once the user has "committed" a colour:
		// clicking a swatch is a single-tap commit; wheel/hue dragging
		// commits when the pointer is released (`changestop`). The Save
		// button is gone, so this is the only signal we have.
		instance.on('swatchselect', () => {
			try {
				instance.hide();
			} catch {
				/* Pickr teardown race — safe to ignore */
			}
		});
		instance.on('changestop', () => {
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
	const selectedIcon = $derived(selectedMarker ? resolveMapIcon(selectedMarker.icon) : undefined);
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
		color: string;
		angle: number;
		entityId: string;
	};
	let draft = $state<MarkerDraft | null>(null);
	let originalMarker = $state<MarkerDraft | null>(null);
	$effect(() => {
		const id = markerId;
		if (id === null) {
			propsDialogOpen = false;
			draft = null;
			originalMarker = null;
			return;
		}
		const m = untrack(() => selectedMarker);
		if (!m) return;
		const snap: MarkerDraft = {
			label: m.label ?? '',
			icon: m.icon ?? null,
			color: m.color ?? DEFAULT_MARKER_COLOR,
			angle: normalizeAngle(m.angle),
			entityId: m.entityId ?? '',
		};
		originalMarker = snap;
		draft = { ...snap };
		propsDialogOpen = true;
	});

	/** Push the draft's current values straight through to the live
	 *  marker so every edit is visible on the canvas immediately. Also
	 *  the single place we call `updateMarker` from the editor — every
	 *  handler updates the draft then calls this. */
	function applyDraftLive() {
		if (!draft || !selectedMarker) return;
		updateMarker(selectedMarker.id, {
			label: draft.label,
			icon: draft.icon ?? undefined,
			color: draft.color,
			angle: draft.angle,
			entityId: draft.entityId || undefined,
		});
	}

	/** Draft-aware previews for the marker-editor UI. Fall back to the
	 *  live selectedMarker readings pre-snapshot so the first paint
	 *  after selection isn't blank. */
	const draftIcon = $derived(draft ? resolveMapIcon(draft.icon ?? undefined) : selectedIcon);
	const draftColor = $derived(draft?.color ?? selectedColor);
	const draftAngle = $derived(draft ? normalizeAngle(draft.angle) : selectedAngle);
	const draftLinkedEntity = $derived(draft ? resolveEntity(draft.entityId) : null);

	function onDraftLabelInput(e: Event) {
		if (!draft) return;
		draft.label = (e.target as HTMLInputElement).value;
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
		propsDialogOpen = false;
	}

	/** Cancel — re-apply the snapshot taken on open so the marker
	 *  reverts to whatever it looked like BEFORE the dialog was
	 *  entered, then close. The effect above clears draft/original
	 *  once `selectedMarker` returns to null. */
	function cancelDraft() {
		if (originalMarker && selectedMarker) {
			updateMarker(selectedMarker.id, {
				label: originalMarker.label,
				icon: originalMarker.icon ?? undefined,
				color: originalMarker.color,
				angle: originalMarker.angle,
				entityId: originalMarker.entityId || undefined,
			});
		}
		propsDialogOpen = false;
	}
</script>

{#if selectedMarker && draft}
	<Dialog.Root
		bind:open={propsDialogOpen}
		onOpenChange={(next) => {
			if (!next) onClose();
		}}
	>
		<Dialog.Portal>
			<Dialog.Overlay class="mp-props-overlay" />
			<Dialog.Content class="mp-props-dialog" interactOutsideBehavior="ignore">
				<DialogHeader
					title={headingText('Edit Marker')}
					onclose={cancelDraft}
					radius="8px 8px 0 0"
				/>
				<div class="mp-props-body">
					<label class="mp-props-field">
						<span class="mp-props-label">Name</span>
						<input
							id="mp-props-name"
							name="mp-props-name"
							class="mp-props-input"
							type="text"
							placeholder="Marker name…"
							value={draft.label}
							oninput={onDraftLabelInput}
						/>
					</label>

					<div class="mp-props-row">
						<label class="mp-props-field mp-props-field--icon">
							<span class="mp-props-label">Icon</span>
							<button class="mp-sel-icon-btn" onclick={openIconPicker} aria-label="Change icon">
								{#if draftIcon}
									<svg viewBox={draftIcon.viewBox} aria-hidden="true">
										<g
											fill={draftColor}
											stroke="#fff"
											stroke-width="2"
											stroke-linejoin="round"
											paint-order="stroke"
											vector-effect="non-scaling-stroke"
										>
											{@html draftIcon.inner}
										</g>
									</svg>
								{:else}
									<span class="mp-sel-icon-none" aria-hidden="true">Aa</span>
								{/if}
							</button>
						</label>

						<label class="mp-props-field mp-props-field--color">
							<span class="mp-props-label">Colour</span>
							<button
								type="button"
								class="mp-sel-color-btn"
								style="color: {draftColor}"
								bind:this={pickrAnchor}
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

						<label class="mp-props-field mp-props-field--angle">
							<span class="mp-props-label">Angle</span>
							<div class="mp-sel-angle" role="group" aria-label="Marker rotation">
								<button
									type="button"
									class="mp-sel-angle-step"
									onclick={() => stepDraftAngle(-15)}
									aria-label="Rotate counter-clockwise">−</button
								>
								<span class="mp-sel-angle-field">
									<span class="mp-sel-angle-glyph" aria-hidden="true">{@html iconAngleSvg}</span>
									<input
										id="mp-props-angle"
										name="mp-props-angle"
										class="mp-sel-angle-input"
										type="number"
										min="0"
										max="359"
										step="15"
										value={draftAngle}
										oninput={onDraftAngleInput}
										aria-label="Marker rotation in degrees"
									/>
									<span class="mp-sel-angle-unit" aria-hidden="true">°</span>
								</span>
								<button
									type="button"
									class="mp-sel-angle-step"
									onclick={() => stepDraftAngle(15)}
									aria-label="Rotate clockwise">+</button
								>
							</div>
						</label>
					</div>

					<label class="mp-props-field">
						<span class="mp-props-label">Link to</span>
						<Popover.Root bind:open={entityPickerOpen}>
							<Popover.Trigger
								class="mp-combobox mp-sel-entity-btn"
								aria-label="Link marker to a connection"
							>
								{#if draft.entityId && draftLinkedEntity}
									<span
										class="mp-sel-entity-icon"
										aria-hidden="true"
										style="--kind-color: {ENTITY_KIND_META[draftLinkedEntity.kind].color}"
										>{@html ENTITY_KIND_META[draftLinkedEntity.kind].icon}</span
									>
									<span class="mp-combobox-value">{draftLinkedEntity.name}</span>
								{:else if draft.entityId}
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
												onSelect={() => pickDraftEntity('')}
											>
												<span class="mp-cmd-check" aria-hidden="true">
													{#if !draft.entityId}
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
													onSelect={() => pickDraftEntity(val)}
												>
													<span class="mp-cmd-check" aria-hidden="true">
														{#if draft.entityId === val}
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
					</label>
				</div>
				<div class="mp-props-footer">
					<button class="btn btn-danger" onclick={deleteSelected} aria-label="Delete marker">
						DELETE
					</button>
					<div class="mp-props-footer-spacer"></div>
					<button class="btn" onclick={cancelDraft}>Cancel</button>
					<button class="btn btn-primary" onclick={commitDraft}>OK</button>
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
	onpick={pickDraftIcon}
	onclose={closeIconPicker}
/>
