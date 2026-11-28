<script lang="ts">
	/**
	 * An expedition's Core tab: its kind and rank pills, Active / Complete,
	 * and below them the fields a completed expedition locks (inert, not just
	 * dimmed):
	 *   - a scene's Objective and Consequences;
	 *   - a site's Theme / Domain / Feature / Danger (SiteFields);
	 *   - the progress track;
	 *   - a scene's countdown and notes (a scene has no Description tab);
	 *   - Map, a chip per marker that points at it (journeys and sites).
	 *
	 * `onupdate` patches the expedition (ExpeditionsArea saves it).
	 */
	import MarkdownNotes from '#lib/components/MarkdownNotes.svelte';
	import ProgressTrackPanel from '#lib/components/ProgressTrackPanel.svelte';
	import CountdownTrack from '#lib/components/CountdownTrack.svelte';
	import SegmentedRadio from '#lib/components/SegmentedRadio.svelte';
	import { tooltip } from '#lib/actions/tooltip.js';
	import { difficultyBadgeStyle } from '#lib/badgeStyles.js';
	import type { EntityMarkerRef } from '#lib/mapStore.svelte.js';
	import { EXPEDITION_MARK_TICKS, type Expedition, type Scene, type Site } from '#lib/types.js';
	import checkSvg from '#icons/circle-check-solid.svg?raw';
	import locationSvg from '#icons/location-dot-solid.svg?raw';
	import SiteFields from './SiteFields.svelte';
	import { DIFFICULTIES } from './expeditions.js';

	let {
		exp,
		color,
		markers,
		editingNotes = $bindable(false),
		rolling = $bindable(false),
		onupdate,
		onjump,
	}: {
		/** The live expedition. */
		exp: Expedition;
		/** Its kind's colour, for the tracks. */
		color: string;
		/** The markers that point at it. */
		markers: EntityMarkerRef[];
		/** A scene's notes are being edited. */
		editingNotes?: boolean;
		/** A site's d100 roll is under way. */
		rolling?: boolean;
		onupdate: (patch: Partial<Expedition>) => void;
		/** Open the map at a marker. */
		onjump: (ref: EntityMarkerRef) => void;
	} = $props();

	const site = $derived(exp.type === 'site' ? (exp as Site) : null);
	const scene = $derived(exp.type === 'scene' ? (exp as Scene) : null);

	/** Short "(x, y)" for a marker's tooltip: integers stay integer, else 2 dp. */
	function fmtCoord(v: number): string {
		return Number.isInteger(v) ? String(v) : v.toFixed(2);
	}
</script>

<div class="ea-pills-row">
	{#if site}
		<span class="ea-badge ea-badge--site">Site</span>
	{:else if scene}
		<span class="ea-badge ea-badge--scene">Scene</span>
	{:else}
		<span class="ea-badge ea-badge--type">Journey</span>
	{/if}
	<span class="ea-badge ea-badge--diff" style={difficultyBadgeStyle(exp.difficulty)}>
		{DIFFICULTIES.find((d) => d.value === exp.difficulty)?.label ?? exp.difficulty}
	</span>
</div>

<!-- Status, right below the pills, so on a site it isn't buried under the
     site's fields. -->
<div class="ea-status-section">
	<span class="ea-status-label">Status</span>
	<SegmentedRadio
		ariaLabel="Expedition status"
		labels="always"
		value={exp.complete ? 'complete' : 'active'}
		onchange={(v) => onupdate({ complete: v === 'complete' })}
		options={[
			{ value: 'active', icon: locationSvg, text: 'Active', label: 'Mark active', tone: 'warn' },
			{ value: 'complete', icon: checkSvg, text: 'Complete', label: 'Mark complete', tone: 'go' },
		]}
	/>
</div>

<!-- Locked once complete: only the Status above and the header gear stay
     live. -->
<div class="ea-locked" inert={exp.complete}>
	{#if scene}
		<div class="ea-field-row ea-objective-row">
			<label class="ea-field-label" for="ea-obj-{scene.id}">Objective</label>
			<input
				id="ea-obj-{scene.id}"
				class="ea-input"
				type="text"
				placeholder="What are you trying to accomplish?"
				value={scene.objective}
				oninput={(e) => onupdate({ objective: (e.target as HTMLInputElement).value })}
			/>
		</div>
		<div class="ea-field-row ea-objective-row">
			<label class="ea-field-label" for="ea-cons-{scene.id}">Consequences</label>
			<input
				id="ea-cons-{scene.id}"
				class="ea-input"
				type="text"
				placeholder="What happens if you fail or run out of time?"
				value={scene.consequences}
				oninput={(e) => onupdate({ consequences: (e.target as HTMLInputElement).value })}
			/>
		</div>
	{/if}

	{#if site}
		<SiteFields {site} bind:rolling {onupdate} />
	{/if}

	<!-- The rank is set when it's created; the pill above shows it. -->
	<div class="ea-section" data-tour="exp-progress">
		<ProgressTrackPanel
			label="Progress track"
			value={exp.ticks}
			{color}
			step={EXPEDITION_MARK_TICKS[exp.difficulty]}
			showStep
			onchange={(_o, n) => onupdate({ ticks: n })}
		/>
	</div>

	{#if scene}
		<!-- The "running out of time" clock. -->
		<div class="ea-section">
			<CountdownTrack
				label="Countdown"
				{color}
				filled={scene.countdownFilled}
				onchange={(_o, n) => onupdate({ countdownFilled: n })}
			/>
		</div>
		<div class="ea-section ea-scene-notes">
			<span class="ea-status-label">Notes</span>
			<MarkdownNotes
				bind:editing={editingNotes}
				value={scene.notes ?? ''}
				oninput={(v) => onupdate({ notes: v })}
				placeholder="Beats, complications, what’s at stake…"
				rows={5}
			/>
		</div>
	{:else}
		<!-- Map: a chip per marker pointing at it, across every map; the chips
		     wrap. The marker's (x, y) is in the tooltip; the chip says the map's
		     name. Scenes aren't on maps. -->
		<div class="ea-section ea-mapref-section">
			<span class="ea-mapref-label">Map</span>
			<div class="ea-mapref-chips">
				{#if markers.length === 0}
					<span class="ea-mapref-empty">Not on any map</span>
				{:else}
					{#each markers as ref (ref.markerId)}
						<button
							class="ea-mapref-chip"
							onclick={() => onjump(ref)}
							use:tooltip={`Jump to "${ref.label || '(unlabeled)'}" on ${ref.mapName} — (${fmtCoord(ref.x)}, ${fmtCoord(ref.y)})`}
							aria-label={`Jump to marker on ${ref.mapName}`}
						>
							<span class="ea-mapref-name">{ref.mapName}</span>
						</button>
					{/each}
				{/if}
			</div>
		</div>
	{/if}
</div>

<style>
	.ea-pills-row {
		display: flex;
		flex-wrap: wrap;
		gap: 5px;
		align-items: center;
		border-bottom: 1px solid var(--border);
		padding-bottom: 8px;
	}
	.ea-badge {
		font-family: var(--font-ui);
		font-size: 0.6rem;
		font-weight: 600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		padding: 2px 7px;
		border-radius: 10px;
		border: 1px solid color-mix(in srgb, currentColor 35%, transparent);
		line-height: 1;
		white-space: nowrap;
		flex-shrink: 0;
	}
	.ea-badge--type {
		background: rgba(228, 170, 40, 0.15);
		color: #e4aa28;
	}
	.ea-badge--site {
		background: rgba(68, 114, 208, 0.15);
		color: #4472d0;
	}
	.ea-badge--scene {
		background: rgba(126, 87, 194, 0.15);
		color: #7e57c2;
	}
	.ea-badge--diff {
		border-color: transparent;
	}

	/* Status: label and toggle, with the divider below it. */
	.ea-status-section {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding-bottom: 8px;
		border-bottom: 1px solid var(--border);
	}
	.ea-status-label {
		font-family: var(--font-ui);
		font-size: 0.7rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--text-dimmer);
	}

	/* A completed expedition's fields: inert, and dimmed to say so. */
	.ea-locked {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.ea-locked[inert] {
		opacity: 0.55;
	}

	/* A section: label above its content (a scene's notes, the Map). */
	.ea-section {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	/* Map: the label above a strip of chips, one per marker. */
	.ea-mapref-section {
		align-items: flex-start;
	}
	.ea-mapref-label {
		flex: 0 0 auto;
		padding-top: 4px;
		font-family: var(--font-ui);
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--text-dimmer);
	}
	.ea-mapref-chips {
		flex: 1 1 auto;
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		align-items: center;
	}
	.ea-mapref-empty {
		font-family: var(--font-ui);
		font-size: 0.75rem;
		font-style: italic;
		color: var(--text-dimmer);
	}
	.ea-mapref-chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 2px 10px;
		background: var(--bg-control);
		border: 1px solid var(--border-mid);
		border-radius: 12px;
		font-family: var(--font-ui);
		font-size: 0.75rem;
		color: var(--text);
		cursor: pointer;
		max-width: 100%;
		white-space: nowrap;
	}
	.ea-mapref-chip:hover {
		border-color: var(--text-accent);
		color: var(--text-accent);
	}
	.ea-mapref-name {
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 12rem;
	}
</style>
