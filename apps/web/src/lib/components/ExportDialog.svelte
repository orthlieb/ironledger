<script lang="ts">
	/**
	 * ExportDialog — comprehensive, multi-select export picker.
	 *
	 * Replaces the old single-`<Select>` export dialog. "Everything" is a
	 * tri-state master; below it, five category rows (Characters, Expeditions,
	 * Connections, Maps, Session Log) each carry a checkbox, a live count, and
	 * an expander to cherry-pick individual items. A Zip / Markdown segment and
	 * a live summary round it out. On Export it emits a `selection` object; the
	 * home route (handleExportSelection) assembles the payload from it.
	 *
	 * Reads the entity stores directly for counts/items and calls `initMap()`
	 * on open so the map list is populated. Styles are `:global` because
	 * bits-ui portals Dialog.Content out of this component's scope.
	 */
	import { untrack } from 'svelte';
	import { Dialog, ToggleGroup } from 'bits-ui';
	import DialogHeader from './DialogHeader.svelte';
	import { headingText } from '$lib/fontStore.svelte.js';
	import { getCharacters } from '$lib/characterStore.svelte.js';
	import { getExpeditions } from '$lib/expeditionStore.svelte.js';
	import { getCommunities } from '$lib/communityStore.svelte.js';
	import { getNpcs } from '$lib/npcStore.svelte.js';
	import { getPlaces } from '$lib/placeStore.svelte.js';
	import { mapListState, initMap } from '$lib/mapStore.svelte.js';
	import { sessionLog } from '$lib/log.svelte.js';
	import { parseStorySource } from '$lib/aiSerialize.js';
	import { tooltip } from '$lib/actions/tooltip.js';
	import type { ExportSelection } from '$lib/exportSelection.js';
	import charactersIconSvg from '$icons/Characters.svg?raw';
	import expeditionsIconSvg from '$icons/Expeditions.svg?raw';
	import villageIconSvg from '$icons/village.svg?raw';
	import treasureMapIconSvg from '$icons/treasure-map.svg?raw';
	import logIconSvg from '$icons/log.svg?raw';

	let {
		open = $bindable(false),
		onexport,
	}: {
		open?: boolean;
		onexport: (sel: ExportSelection) => void;
	} = $props();

	// ── live data ───────────────────────────────────────────────────────────
	const chars = $derived(getCharacters());
	const exps = $derived(getExpeditions());
	const comms = $derived(getCommunities());
	const npcsL = $derived(getNpcs());
	const placesL = $derived(getPlaces());
	const maps = $derived(mapListState.maps);
	const logEntries = $derived(sessionLog.entries);
	const storyCount = $derived(logEntries.filter((e) => parseStorySource(e.source) != null).length);

	// ── selection state ─────────────────────────────────────────────────────
	let selChars = $state(new Set<string>());
	let selExps = $state(new Set<string>());
	let selComm = $state(true);
	let selNpc = $state(true);
	let selPlace = $state(true);
	let selMaps = $state(new Set<string>());
	let logMode = $state<'all' | 'stories' | 'none'>('all');
	let format = $state<'zip' | 'md'>('zip');
	let openRows = $state(new Set<string>());
	let exportBtnEl = $state<HTMLButtonElement | null>(null);
	// Whether the user has explicitly touched the Maps row this session — gates
	// the async-map follow effect below.
	let mapsTouched = $state(false);

	// Reset to "Everything" when the dialog opens. `untrack` the body so this
	// fires ONLY on the open transition, not whenever a store it reads changes
	// (which would otherwise wipe the user's picks the instant maps finish
	// loading).
	$effect(() => {
		if (!open) return;
		void initMap().catch(() => {});
		untrack(() => {
			selChars = new Set(chars.map((c) => c.id));
			selExps = new Set(exps.map((e) => e.id));
			selComm = selNpc = selPlace = true;
			selMaps = new Set(maps.map((m) => m.id));
			logMode = logEntries.length > 0 ? 'all' : 'none';
			format = 'zip';
			openRows = new Set();
			mapsTouched = false;
		});
	});

	// Maps load lazily (initMap on open), so `maps` is usually still empty at
	// reset. While the user hasn't touched the Maps row, keep it following the
	// list as it arrives so "Everything" really includes every map.
	$effect(() => {
		if (open && !mapsTouched) {
			selMaps = new Set(maps.map((m) => m.id));
		}
	});

	type TriState = 'on' | 'off' | 'mixed';
	function tri(sel: number, total: number): TriState {
		if (total === 0 || sel === 0) return sel > 0 ? 'on' : 'off';
		return sel === total ? 'on' : 'mixed';
	}

	const charState = $derived(tri(selChars.size, chars.length));
	const expState = $derived(tri(selExps.size, exps.length));
	const connSel = $derived((selComm ? 1 : 0) + (selNpc ? 1 : 0) + (selPlace ? 1 : 0));
	const connState = $derived<TriState>(connSel === 0 ? 'off' : connSel === 3 ? 'on' : 'mixed');
	const mapState = $derived(tri(selMaps.size, maps.length));
	const logState = $derived<TriState>(logMode === 'none' ? 'off' : 'on');

	// connection sub-counts included
	const connCount = $derived(
		(selComm ? comms.length : 0) + (selNpc ? npcsL.length : 0) + (selPlace ? placesL.length : 0),
	);
	const connTotal = $derived(comms.length + npcsL.length + placesL.length);

	// A category is eligible only when it has something to export. Empty ones
	// render disabled (greyed, "none yet", non-interactive) and are excluded
	// from the master so "Everything" can still read as a complete backup when,
	// say, the account has no characters yet — while the capability stays
	// visible so it's never mistaken for missing.
	const eligible = $derived({
		char: chars.length > 0,
		exp: exps.length > 0,
		conn: connTotal > 0,
		map: maps.length > 0,
		log: logEntries.length > 0,
	});
	const activeStates = $derived(
		[
			eligible.char ? charState : null,
			eligible.exp ? expState : null,
			eligible.conn ? connState : null,
			eligible.map ? mapState : null,
			eligible.log ? logState : null,
		].filter((s): s is TriState => s !== null),
	);
	const masterState = $derived<TriState>(
		activeStates.length === 0 || activeStates.every((s) => s === 'off')
			? 'off'
			: activeStates.every((s) => s === 'on')
				? 'on'
				: 'mixed',
	);

	const anySelected = $derived(masterState !== 'off');

	// ── toggles ───────────────────────────────────────────────────────────────
	function toggleMaster() {
		mapsTouched = true;
		if (masterState === 'on') {
			selChars = new Set();
			selExps = new Set();
			selComm = selNpc = selPlace = false;
			selMaps = new Set();
			logMode = 'none';
		} else {
			selChars = new Set(chars.map((c) => c.id));
			selExps = new Set(exps.map((e) => e.id));
			selComm = selNpc = selPlace = true;
			selMaps = new Set(maps.map((m) => m.id));
			logMode = 'all';
		}
	}
	function toggleAllOf(kind: 'char' | 'exp' | 'map') {
		if (kind === 'char')
			selChars = charState === 'on' ? new Set() : new Set(chars.map((c) => c.id));
		if (kind === 'exp') selExps = expState === 'on' ? new Set() : new Set(exps.map((e) => e.id));
		if (kind === 'map') {
			mapsTouched = true;
			selMaps = mapState === 'on' ? new Set() : new Set(maps.map((m) => m.id));
		}
	}
	function toggleItem(set: Set<string>, id: string): Set<string> {
		const next = new Set(set);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		return next;
	}
	function toggleConn() {
		const on = connState === 'on';
		selComm = selNpc = selPlace = !on;
	}
	function toggleRow(id: string) {
		const next = new Set(openRows);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		openRows = next;
	}

	function doExport() {
		if (!anySelected) return;
		onexport({
			characters: [...selChars],
			expeditions: [...selExps],
			communities: selComm,
			npcs: selNpc,
			places: selPlace,
			maps: [...selMaps],
			log: logMode,
			format,
		});
		open = false;
	}

	// summary phrases
	const summaryParts = $derived.by(() => {
		const p: string[] = [];
		if (charState !== 'off') p.push(`${selChars.size} character${selChars.size === 1 ? '' : 's'}`);
		if (expState !== 'off') p.push(`${selExps.size} expedition${selExps.size === 1 ? '' : 's'}`);
		if (connState !== 'off') p.push(`${connCount} connection${connCount === 1 ? '' : 's'}`);
		if (mapState !== 'off') p.push(`${selMaps.size} map${selMaps.size === 1 ? '' : 's'}`);
		if (logState !== 'off')
			p.push(
				logMode === 'stories' ? `${storyCount} story beats` : `${logEntries.length} log entries`,
			);
		return p;
	});
</script>

<Dialog.Root bind:open>
	<Dialog.Portal>
		<Dialog.Overlay class="exd-overlay" />
		<Dialog.Content
			class="exd-dialog"
			onOpenAutoFocus={(e) => {
				e.preventDefault();
				setTimeout(() => exportBtnEl?.focus(), 0);
			}}
		>
			<DialogHeader
				title={headingText('Export')}
				onclose={() => (open = false)}
				radius="10px 10px 0 0"
			/>

			<div class="exd-body">
				<div class="exd-seclabel">Include</div>

				<!-- master -->
				<button
					type="button"
					class="exd-master"
					class:on={masterState !== 'off'}
					aria-pressed={masterState === 'on'}
					onclick={toggleMaster}
				>
					<span class="exd-cb" data-state={masterState} aria-hidden="true">
						<svg
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="3.2"
							stroke-linecap="round"
							stroke-linejoin="round"><path d="M4 12l5 5L20 6" /></svg
						>
					</span>
					<span class="exd-master-title">
						Everything
						<span class="exd-master-sub">
							{masterState === 'on'
								? '— a complete backup'
								: masterState === 'off'
									? '— nothing selected'
									: '— a partial export'}
						</span>
					</span>
				</button>

				<div class="exd-rows">
					<!-- Characters -->
					<div
						class="exd-row"
						class:open={openRows.has('char')}
						class:partial={charState === 'mixed'}
						style="--cat:#5aa467"
						class:exd-disabled={!eligible.char}
					>
						<div class="exd-rowhead">
							<button
								type="button"
								class="exd-cbwrap"
								onclick={() => toggleAllOf('char')}
								aria-label="Toggle characters"
							>
								<span class="exd-cb" data-state={charState} aria-hidden="true"
									><svg
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="3.2"
										stroke-linecap="round"
										stroke-linejoin="round"><path d="M4 12l5 5L20 6" /></svg
									></span
								>
							</button>
							<span class="exd-swatch" aria-hidden="true">{@html charactersIconSvg}</span>
							<button
								type="button"
								class="exd-rowmain"
								onclick={() => chars.length && toggleRow('char')}
							>
								<span class="exd-rowname">Characters</span>
							</button>
							<span class="exd-count"
								>{!eligible.char
									? 'none yet'
									: charState === 'off'
										? '—'
										: charState === 'mixed'
											? `${selChars.size} / ${chars.length}`
											: chars.length}</span
							>
							<button
								type="button"
								class="exd-caret"
								class:ghost={chars.length === 0}
								onclick={() => toggleRow('char')}
								aria-label="Show characters"
							>
								<svg
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2.4"
									stroke-linecap="round"
									stroke-linejoin="round"><path d="M9 6l6 6-6 6" /></svg
								>
							</button>
						</div>
						<div class="exd-sublist">
							{#each chars as c (c.id)}
								<button
									type="button"
									class="exd-subitem"
									onclick={() => (selChars = toggleItem(selChars, c.id))}
								>
									<span
										class="exd-cb sm"
										data-state={selChars.has(c.id) ? 'on' : 'off'}
										aria-hidden="true"
										><svg
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="3.2"
											stroke-linecap="round"
											stroke-linejoin="round"><path d="M4 12l5 5L20 6" /></svg
										></span
									>
									<span class="exd-subname">{c.name || 'Unnamed'}</span>
								</button>
							{/each}
						</div>
					</div>

					<!-- Expeditions -->
					<div
						class="exd-row"
						class:open={openRows.has('exp')}
						class:partial={expState === 'mixed'}
						style="--cat:#e4aa28"
						class:exd-disabled={!eligible.exp}
					>
						<div class="exd-rowhead">
							<button
								type="button"
								class="exd-cbwrap"
								onclick={() => toggleAllOf('exp')}
								aria-label="Toggle expeditions"
							>
								<span class="exd-cb" data-state={expState} aria-hidden="true"
									><svg
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="3.2"
										stroke-linecap="round"
										stroke-linejoin="round"><path d="M4 12l5 5L20 6" /></svg
									></span
								>
							</button>
							<span class="exd-swatch" aria-hidden="true">{@html expeditionsIconSvg}</span>
							<button
								type="button"
								class="exd-rowmain"
								onclick={() => exps.length && toggleRow('exp')}
							>
								<span class="exd-rowname">Expeditions</span>
							</button>
							<span class="exd-count"
								>{!eligible.exp
									? 'none yet'
									: expState === 'off'
										? '—'
										: expState === 'mixed'
											? `${selExps.size} / ${exps.length}`
											: exps.length}</span
							>
							<button
								type="button"
								class="exd-caret"
								class:ghost={exps.length === 0}
								onclick={() => toggleRow('exp')}
								aria-label="Show expeditions"
							>
								<svg
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2.4"
									stroke-linecap="round"
									stroke-linejoin="round"><path d="M9 6l6 6-6 6" /></svg
								>
							</button>
						</div>
						<div class="exd-sublist">
							{#each exps as e (e.id)}
								<button
									type="button"
									class="exd-subitem"
									onclick={() => (selExps = toggleItem(selExps, e.id))}
								>
									<span
										class="exd-cb sm"
										data-state={selExps.has(e.id) ? 'on' : 'off'}
										aria-hidden="true"
										><svg
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="3.2"
											stroke-linecap="round"
											stroke-linejoin="round"><path d="M4 12l5 5L20 6" /></svg
										></span
									>
									<span class="exd-subname"
										>{e.name || 'Unnamed'}<span class="exd-tag">{e.type}</span></span
									>
								</button>
							{/each}
						</div>
					</div>

					<!-- Connections -->
					<div
						class="exd-row"
						class:open={openRows.has('conn')}
						class:partial={connState === 'mixed'}
						style="--cat:#d06840"
						class:exd-disabled={!eligible.conn}
					>
						<div class="exd-rowhead">
							<button
								type="button"
								class="exd-cbwrap"
								onclick={toggleConn}
								aria-label="Toggle connections"
							>
								<span class="exd-cb" data-state={connState} aria-hidden="true"
									><svg
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="3.2"
										stroke-linecap="round"
										stroke-linejoin="round"><path d="M4 12l5 5L20 6" /></svg
									></span
								>
							</button>
							<span class="exd-swatch" aria-hidden="true">{@html villageIconSvg}</span>
							<button type="button" class="exd-rowmain" onclick={() => toggleRow('conn')}>
								<span class="exd-rowname">Connections</span>
								<span class="exd-rowsub">communities · NPCs · places</span>
							</button>
							<span class="exd-count"
								>{!eligible.conn
									? 'none yet'
									: connState === 'off'
										? '—'
										: connState === 'mixed'
											? `${connCount} / ${connTotal}`
											: connTotal}</span
							>
							<button
								type="button"
								class="exd-caret"
								onclick={() => toggleRow('conn')}
								aria-label="Show connection types"
							>
								<svg
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2.4"
									stroke-linecap="round"
									stroke-linejoin="round"><path d="M9 6l6 6-6 6" /></svg
								>
							</button>
						</div>
						<div class="exd-sublist">
							<button type="button" class="exd-subitem" onclick={() => (selComm = !selComm)}>
								<span class="exd-cb sm" data-state={selComm ? 'on' : 'off'} aria-hidden="true"
									><svg
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="3.2"
										stroke-linecap="round"
										stroke-linejoin="round"><path d="M4 12l5 5L20 6" /></svg
									></span
								>
								<span class="exd-subname">Communities</span><span class="exd-subcount"
									>{comms.length}</span
								>
							</button>
							<button type="button" class="exd-subitem" onclick={() => (selNpc = !selNpc)}>
								<span class="exd-cb sm" data-state={selNpc ? 'on' : 'off'} aria-hidden="true"
									><svg
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="3.2"
										stroke-linecap="round"
										stroke-linejoin="round"><path d="M4 12l5 5L20 6" /></svg
									></span
								>
								<span class="exd-subname">NPCs</span><span class="exd-subcount">{npcsL.length}</span
								>
							</button>
							<button type="button" class="exd-subitem" onclick={() => (selPlace = !selPlace)}>
								<span class="exd-cb sm" data-state={selPlace ? 'on' : 'off'} aria-hidden="true"
									><svg
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="3.2"
										stroke-linecap="round"
										stroke-linejoin="round"><path d="M4 12l5 5L20 6" /></svg
									></span
								>
								<span class="exd-subname">Places</span><span class="exd-subcount"
									>{placesL.length}</span
								>
							</button>
						</div>
					</div>

					<!-- Maps -->
					<div
						class="exd-row"
						class:open={openRows.has('map')}
						class:partial={mapState === 'mixed'}
						style="--cat:#3e9cb5"
						class:exd-disabled={!eligible.map}
					>
						<div class="exd-rowhead">
							<button
								type="button"
								class="exd-cbwrap"
								onclick={() => toggleAllOf('map')}
								aria-label="Toggle maps"
							>
								<span class="exd-cb" data-state={mapState} aria-hidden="true"
									><svg
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="3.2"
										stroke-linecap="round"
										stroke-linejoin="round"><path d="M4 12l5 5L20 6" /></svg
									></span
								>
							</button>
							<span class="exd-swatch" aria-hidden="true">{@html treasureMapIconSvg}</span>
							<button
								type="button"
								class="exd-rowmain"
								onclick={() => maps.length && toggleRow('map')}
							>
								<span class="exd-rowname">Maps</span>
							</button>
							<span class="exd-count"
								>{!eligible.map
									? 'none yet'
									: mapState === 'off'
										? '—'
										: mapState === 'mixed'
											? `${selMaps.size} / ${maps.length}`
											: maps.length}</span
							>
							<button
								type="button"
								class="exd-caret"
								class:ghost={maps.length === 0}
								onclick={() => toggleRow('map')}
								aria-label="Show maps"
							>
								<svg
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									stroke-width="2.4"
									stroke-linecap="round"
									stroke-linejoin="round"><path d="M9 6l6 6-6 6" /></svg
								>
							</button>
						</div>
						<div class="exd-sublist">
							{#each maps as m (m.id)}
								<button
									type="button"
									class="exd-subitem"
									onclick={() => {
										mapsTouched = true;
										selMaps = toggleItem(selMaps, m.id);
									}}
								>
									<span
										class="exd-cb sm"
										data-state={selMaps.has(m.id) ? 'on' : 'off'}
										aria-hidden="true"
										><svg
											viewBox="0 0 24 24"
											fill="none"
											stroke="currentColor"
											stroke-width="3.2"
											stroke-linecap="round"
											stroke-linejoin="round"><path d="M4 12l5 5L20 6" /></svg
										></span
									>
									<span class="exd-subname">{m.name || 'Untitled Map'}</span>
								</button>
							{/each}
						</div>
					</div>

					<!-- Session Log -->
					<div class="exd-row" class:exd-disabled={!eligible.log} style="--cat:#a46fb0">
						<div class="exd-rowhead">
							<button
								type="button"
								class="exd-cbwrap"
								onclick={() => (logMode = logMode === 'none' ? 'all' : 'none')}
								aria-label="Toggle session log"
							>
								<span class="exd-cb" data-state={logState} aria-hidden="true"
									><svg
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										stroke-width="3.2"
										stroke-linecap="round"
										stroke-linejoin="round"><path d="M4 12l5 5L20 6" /></svg
									></span
								>
							</button>
							<span class="exd-swatch" aria-hidden="true">{@html logIconSvg}</span>
							<span class="exd-rowmain static">
								<span class="exd-rowname">Session Log</span>
								<span class="exd-rowsub"
									>{logMode === 'stories'
										? `${storyCount} story beats`
										: `${logEntries.length} entries`}</span
								>
							</span>
							{#if logState !== 'off'}
								<div class="exd-logseg" role="group" aria-label="Log scope">
									<button
										type="button"
										class:on={logMode === 'all'}
										use:tooltip={'Every log entry — rolls, moves, notes and story beats'}
										onclick={() => (logMode = 'all')}>All</button
									>
									<button
										type="button"
										class:on={logMode === 'stories'}
										use:tooltip={`Only AI Storyteller narrative beats (${storyCount} of ${logEntries.length})`}
										onclick={() => (logMode = 'stories')}>Stories</button
									>
								</div>
							{/if}
						</div>
					</div>
				</div>

				<div class="exd-seclabel">Format</div>
				<div class="exd-fmt">
					<ToggleGroup.Root
						type="single"
						value={format}
						onValueChange={(v) => v && (format = v as 'zip' | 'md')}
						class="exd-seg"
						aria-label="Export format"
					>
						<ToggleGroup.Item value="zip" class="exd-segbtn">
							<strong>Zip archive</strong>
							<span>Complete · re-importable · images &amp; map art</span>
						</ToggleGroup.Item>
						<ToggleGroup.Item value="md" class="exd-segbtn">
							<strong>Markdown</strong>
							<span>Readable · not re-importable · adds foe bestiary</span>
						</ToggleGroup.Item>
					</ToggleGroup.Root>
					{#if format === 'md'}
						<p class="exd-fmtnote">
							Markdown is a human-readable snapshot — it can’t be re-imported, and it’s the only
							export that includes the foe bestiary.
						</p>
					{/if}
				</div>
			</div>

			<div class="exd-summary">
				{#if !anySelected}
					<span class="exd-sum-lead">Nothing selected</span>
				{:else if masterState === 'on'}
					<span class="exd-sum-lead">Everything</span>
					<span class="exd-sum-detail">— characters, expeditions, connections, maps &amp; log</span>
				{:else}
					<span class="exd-sum-lead">Exporting</span>
					<span class="exd-sum-detail">{summaryParts.join(' · ')}</span>
				{/if}
			</div>

			<div class="exd-footer">
				<button type="button" class="exd-btn" onclick={() => (open = false)}>Cancel</button>
				<button
					type="button"
					class="exd-btn primary"
					bind:this={exportBtnEl}
					disabled={!anySelected}
					onclick={doExport}
				>
					{masterState === 'on' ? 'Export Everything' : 'Export Selection'}
				</button>
			</div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<style>
	:global(.exd-overlay) {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		z-index: 80;
	}
	:global(.exd-dialog) {
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: min(94vw, 460px);
		max-height: 88dvh;
		display: flex;
		flex-direction: column;
		background: var(--bg-card);
		border: 1px solid var(--border-mid);
		border-radius: 10px;
		box-shadow: 0 22px 60px -14px rgba(0, 0, 0, 0.7);
		z-index: 81;
		overflow: hidden;
	}
	:global(.exd-body) {
		padding: 4px 6px 6px;
		overflow-y: auto;
		overscroll-behavior: contain;
	}
	:global(.exd-seclabel) {
		font-size: 10.5px;
		text-transform: uppercase;
		letter-spacing: 0.14em;
		color: var(--text-dimmer);
		font-weight: 700;
		padding: 12px 12px 4px;
	}

	:global(.exd-master) {
		display: flex;
		align-items: center;
		gap: 12px;
		width: calc(100% - 12px);
		margin: 2px 6px;
		padding: 12px;
		border: 1px solid var(--border);
		border-radius: 9px;
		background: var(--bg-inset);
		color: var(--text);
		cursor: pointer;
		text-align: left;
		font: inherit;
	}
	:global(.exd-master.on) {
		border-color: color-mix(in srgb, var(--text-accent) 55%, var(--border));
		background: var(--accent-dim);
	}
	:global(.exd-master-title) {
		font-weight: 700;
		font-size: 15px;
	}
	:global(.exd-master-sub) {
		color: var(--text-muted);
		font-size: 12px;
		font-weight: 400;
	}

	:global(.exd-rows) {
		display: flex;
		flex-direction: column;
		padding: 2px 6px 4px;
	}
	:global(.exd-row) {
		border-radius: 9px;
	}
	:global(.exd-row.exd-disabled) {
		opacity: 0.5;
	}
	:global(.exd-row.exd-disabled .exd-rowhead) {
		pointer-events: none;
	}
	:global(.exd-row + .exd-row) {
		margin-top: 1px;
	}
	:global(.exd-rowhead) {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 9px 10px;
		border-radius: 9px;
	}
	:global(.exd-rowhead:hover) {
		background: var(--bg-hover);
	}

	:global(.exd-cbwrap) {
		border: 0;
		background: transparent;
		padding: 0;
		cursor: pointer;
		display: grid;
		place-items: center;
		flex: none;
	}
	:global(.exd-cb) {
		width: 20px;
		height: 20px;
		border-radius: 6px;
		border: 1.75px solid var(--border-mid);
		background: var(--bg-control);
		display: grid;
		place-items: center;
		position: relative;
	}
	:global(.exd-cb.sm) {
		width: 17px;
		height: 17px;
		border-radius: 5px;
	}
	:global(.exd-cb svg) {
		width: 13px;
		height: 13px;
		color: var(--bg-page);
		opacity: 0;
	}
	:global(.exd-cb.sm svg) {
		width: 11px;
		height: 11px;
	}
	:global(.exd-cb[data-state='on']) {
		background: var(--text-accent);
		border-color: var(--text-accent);
	}
	:global(.exd-cb[data-state='on'] svg) {
		opacity: 1;
	}
	:global(.exd-cb[data-state='mixed']) {
		background: var(--text-accent);
		border-color: var(--text-accent);
	}
	:global(.exd-cb[data-state='mixed']::after) {
		content: '';
		width: 9px;
		height: 2.5px;
		border-radius: 2px;
		background: var(--bg-page);
	}

	:global(.exd-swatch) {
		width: 30px;
		height: 30px;
		border-radius: 8px;
		display: grid;
		place-items: center;
		flex: none;
		color: var(--cat);
		background: color-mix(in srgb, var(--cat) 15%, var(--bg-card));
		border: 1px solid color-mix(in srgb, var(--cat) 32%, transparent);
	}
	:global(.exd-swatch svg) {
		width: 18px;
		height: 18px;
		/* App tab icons are fill-based with no fill attr (default black) — tint
		   them to the category hue like the tabs do. currentColor comes from the
		   swatch's `color`. */
		fill: currentColor;
	}

	:global(.exd-rowmain) {
		flex: 1;
		min-width: 0;
		border: 0;
		background: transparent;
		padding: 0;
		text-align: left;
		cursor: pointer;
		color: var(--text);
		font: inherit;
		display: flex;
		flex-direction: column;
		gap: 1px;
	}
	:global(.exd-rowmain.static) {
		cursor: default;
	}
	:global(.exd-rowname) {
		font-weight: 500;
		font-size: 14.5px;
	}
	:global(.exd-rowsub) {
		color: var(--text-muted);
		font-size: 12px;
	}

	:global(.exd-count) {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
		font-size: 12px;
		color: var(--text-muted);
		background: var(--bg-control);
		border: 1px solid var(--border);
		border-radius: 999px;
		padding: 2px 9px;
		white-space: nowrap;
		flex: none;
	}
	:global(.exd-row.partial .exd-count) {
		color: var(--text-accent);
		border-color: color-mix(in srgb, var(--text-accent) 40%, var(--border));
	}

	:global(.exd-caret) {
		border: 0;
		background: transparent;
		color: var(--text-dimmer);
		cursor: pointer;
		padding: 4px;
		border-radius: 6px;
		flex: none;
		display: grid;
		place-items: center;
		transition: transform 0.16s ease;
	}
	:global(.exd-caret svg) {
		width: 13px;
		height: 13px;
	}
	:global(.exd-row.open .exd-caret) {
		transform: rotate(90deg);
		color: var(--text-muted);
	}
	:global(.exd-caret.ghost) {
		visibility: hidden;
	}

	:global(.exd-sublist) {
		display: none;
		flex-direction: column;
		gap: 1px;
		padding: 2px 12px 8px 52px;
	}
	:global(.exd-row.open .exd-sublist) {
		display: flex;
	}
	:global(.exd-subitem) {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 6px 8px;
		border-radius: 7px;
		cursor: pointer;
		border: 0;
		background: transparent;
		color: var(--text);
		font: inherit;
		text-align: left;
		width: 100%;
	}
	:global(.exd-subitem:hover) {
		background: var(--bg-hover);
	}
	:global(.exd-subname) {
		flex: 1;
		font-size: 13px;
	}
	:global(.exd-tag) {
		font-size: 10px;
		color: var(--text-dimmer);
		margin-left: 6px;
		border: 1px solid var(--border);
		border-radius: 4px;
		padding: 0 5px;
		text-transform: capitalize;
	}
	:global(.exd-subcount) {
		font-family: var(--font-mono);
		font-size: 11px;
		color: var(--text-dimmer);
	}

	:global(.exd-logseg) {
		display: inline-flex;
		gap: 2px;
		background: var(--bg-control);
		border: 1px solid var(--border);
		border-radius: 7px;
		padding: 2px;
		flex: none;
	}
	:global(.exd-logseg button) {
		font: inherit;
		font-size: 12px;
		border: 0;
		background: transparent;
		color: var(--text-muted);
		padding: 3px 10px;
		border-radius: 5px;
		cursor: pointer;
	}
	:global(.exd-logseg button.on) {
		background: var(--text-accent);
		color: var(--bg-page);
		font-weight: 500;
	}

	:global(.exd-fmt) {
		padding: 4px 12px 10px;
	}
	:global(.exd-seg) {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 4px;
		background: var(--bg-inset);
		border: 1px solid var(--border);
		border-radius: 9px;
		padding: 4px;
	}
	:global(.exd-segbtn) {
		font: inherit;
		border: 0;
		background: transparent;
		color: var(--text-muted);
		padding: 8px 10px;
		border-radius: 6px;
		cursor: pointer;
		text-align: left;
	}
	:global(.exd-segbtn strong) {
		display: block;
		color: var(--text);
		font-weight: 500;
		font-size: 13.5px;
	}
	:global(.exd-segbtn span) {
		display: block;
		font-size: 10.5px;
		margin-top: 1px;
	}
	:global(.exd-segbtn[data-state='on']) {
		background: var(--bg-card);
		outline: 1.5px solid color-mix(in srgb, var(--text-accent) 45%, transparent);
	}
	:global(.exd-segbtn[data-state='on'] strong) {
		color: var(--text-accent);
	}
	:global(.exd-fmtnote) {
		margin: 8px 2px 0;
		font-size: 11.5px;
		color: var(--text-dimmer);
		line-height: 1.4;
	}

	:global(.exd-summary) {
		display: flex;
		align-items: baseline;
		gap: 6px;
		flex-wrap: wrap;
		padding: 11px 14px;
		border-top: 1px solid var(--border);
		background: var(--bg-inset);
		font-size: 12.5px;
		color: var(--text-muted);
	}
	:global(.exd-sum-lead) {
		color: var(--text);
		font-weight: 500;
	}

	:global(.exd-footer) {
		display: flex;
		gap: 10px;
		justify-content: flex-end;
		padding: 12px 14px;
		background: var(--bg-card);
		border-top: 1px solid var(--border);
	}
	:global(.exd-btn) {
		font: inherit;
		font-size: 13.5px;
		font-weight: 500;
		border-radius: 8px;
		padding: 9px 16px;
		cursor: pointer;
		border: 1px solid var(--border-mid);
		background: var(--bg-control);
		color: var(--text);
	}
	:global(.exd-btn:hover) {
		background: var(--bg-hover);
	}
	:global(.exd-btn.primary) {
		background: var(--text-accent);
		border-color: var(--text-accent);
		color: var(--bg-page);
	}
	:global(.exd-btn.primary:disabled) {
		opacity: 0.45;
		cursor: not-allowed;
	}
</style>
