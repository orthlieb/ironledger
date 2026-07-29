<script lang="ts">
	/**
	 * FoesArea (v2 prototype) — Foes deck stage.
	 *
	 * Mirrors CharactersArea: vertical spine tabs on the LEFT (one per foe),
	 * a stage on the right with a name+delete header and two card tabs
	 * — Description / Core. Description: portrait floated right with the
	 * foe's prose + features/drives/tactics wrapping around it. Core:
	 * pills (nature/rank/quantity/harm/progress), escalating spinners,
	 * progress track, and the vanquish toggle. No inner collapsible — the
	 * card scrolls if content overflows.
	 *
	 * All edits persist via the existing encounterStore.
	 */
	import {
		getEncounters,
		isEncounterLoading,
		flushEncountersToApi,
		removeEncounter,
		addEncounter,
	} from '$lib/encounterStore.svelte.js';
	import { setActiveFoeId } from '$lib/activeContext.svelte.js';
	import { appendLog } from '$lib/log.svelte.js';
	import { tooltip } from '$lib/actions/tooltip.js';
	import { rankBadgeStyle } from '$lib/badgeStyles.js';
	import {
		findFoe,
		FOE_RANKS,
		FOE_QUANTITIES,
		FOE_NATURE_COLORS,
		resolveFoeDescription,
	} from '$lib/foeStore.svelte.js';
	import { foePortraitUrl, UNKNOWN_FOE_PORTRAIT } from '$lib/foePortrait.js';
	import type { FoeEncounter, FoeDef, FoeQuantity } from '$lib/types.js';

	import ProgressTrackPanel from '$lib/components/ProgressTrackPanel.svelte';
	import FoePickerDialog from '$lib/components/FoePickerDialog.svelte';
	import FoeOptionsDialog from '$lib/components/FoeOptionsDialog.svelte';
	import Lightbox from '$lib/components/Lightbox.svelte';
	import iconGearSvg from '$icons/gear-solid-full.svg?raw';
	import swordSvg from '$icons/sword-solid-full.svg?raw';
	import skullSvg from '$icons/skull-crossbones-solid-full.svg?raw';
	import iconCaretDownSvg from '$icons/caret-large-down-solid.svg?raw';
	import searchIconSvg from '$icons/magnifying-glass-solid-full.svg?raw';
	import SegmentedRadio from '$lib/components/SegmentedRadio.svelte';
	import { Popover, Command, Tabs } from 'bits-ui';
	import foesIconSvg from '$icons/Foes.svg?raw';
	import { headingText } from '$lib/fontStore.svelte.js';

	let { showTitle = true }: { showTitle?: boolean } = $props();

	type FoeTab = 'description' | 'core';
	const TAB_LABELS: { key: FoeTab; label: string }[] = [
		{ key: 'core', label: 'Core' },
		{ key: 'description', label: 'Description' },
	];

	let activeFoeId = $state<string | null>(null);
	let activeTab = $state<FoeTab>('core');
	let foePickerRef = $state<{ open(): Promise<void>; close(): void } | null>(null);
	let foeOptionsRef = $state<{ open(): void; close(): void } | null>(null);
	let imgVisible = $state(true);
	let lightboxOpen = $state(false);
	// Combobox open state — bits-ui Popover binds it so we can close the
	// popover imperatively from an item's onSelect handler (both a foe
	// switch and the "+ New foe…" action need to close it before doing
	// their work).
	let foePickerOpen = $state(false);

	const encounters = $derived(getEncounters());
	const loading = $derived(isEncounterLoading());

	$effect(() => {
		if (!activeFoeId && encounters.length > 0) activeFoeId = encounters[0].id;
	});

	const activeEnc = $derived(encounters.find((e) => e.id === activeFoeId));
	const activeDef = $derived<FoeDef | undefined>(activeEnc ? findFoe(activeEnc.foeId) : undefined);

	// Publish the active foe id so MovesDialog / log / preconditions can see it.
	$effect(() => {
		setActiveFoeId(activeFoeId ?? '');
	});

	export function selectFoe(id: string) {
		activeFoeId = id;
		activeTab = 'core';
		imgVisible = true;
	}

	async function handleFoeSelected(foeDef: FoeDef, quantity: FoeQuantity, effectiveRank: number) {
		const enc: FoeEncounter = {
			id: crypto.randomUUID(),
			foeId: foeDef.id,
			quantity,
			effectiveRank: effectiveRank as 1 | 2 | 3 | 4 | 5,
			ticks: 0,
			notes: '',
			customName: '',
			vanquished: false,
		};
		await addEncounter(enc);
		activeFoeId = enc.id;
		activeTab = 'core';
	}

	// Patch fields onto the active encounter proxy directly. The store's
	// _encounters array identity is preserved; the per-encounter object is
	// the proxy from getEncounters() — assigning fields here writes through
	// the proxy so anything binding to it stays in sync, and the deep-snapshot
	// effect below schedules the debounced API flush.
	function update(patch: Partial<FoeEncounter>) {
		if (!activeEnc) return;
		Object.assign(activeEnc, patch);
	}

	// Debounced flush — watch the active encounter's snapshot; on any
	// change, schedule a single API write 1.5 s later. Cleanup flushes
	// pending edits on switch / unmount so nothing is dropped.
	let _saveTimer: ReturnType<typeof setTimeout> | null = null;
	$effect(() => {
		if (!activeEnc) return;
		$state.snapshot(activeEnc);
		if (_saveTimer) clearTimeout(_saveTimer);
		_saveTimer = setTimeout(() => {
			_saveTimer = null;
			void flushEncountersToApi();
		}, 1500);
		return () => {
			if (_saveTimer) {
				clearTimeout(_saveTimer);
				_saveTimer = null;
				void flushEncountersToApi();
			}
		};
	});

	async function confirmDeleteFoe() {
		if (!activeEnc) return;
		const id = activeEnc.id;
		await removeEncounter(id);
		if (activeFoeId === id) activeFoeId = null;
	}

	// ── Derived combat values (mirror FoeCard) ────────────────────────────
	const displayName = $derived(
		activeEnc?.customName?.trim() || activeDef?.name || activeEnc?.foeId || '',
	);
	const rankInfo = $derived(activeEnc ? FOE_RANKS[activeEnc.effectiveRank] : undefined);
	const qtyDef = $derived(
		activeEnc ? FOE_QUANTITIES.find((q) => q.value === activeEnc.quantity) : undefined,
	);
	const natureColor = $derived(
		activeDef ? (FOE_NATURE_COLORS[activeDef.nature] ?? '#7A9AB8') : '#7A9AB8',
	);
	const resolvedDesc = $derived(activeDef ? resolveFoeDescription(activeDef) : '');
	const hasDescription = $derived(
		!!resolvedDesc ||
			(activeDef?.features?.length ?? 0) > 0 ||
			(activeDef?.drives?.length ?? 0) > 0 ||
			(activeDef?.tactics?.length ?? 0) > 0,
	);

	// Escalating harm (YRT extension)
	const currentHarm = $derived(activeEnc?.currentHarm ?? 1);
	const harmCap = $derived(activeEnc ? Math.min(activeEnc.effectiveRank + 1, 5) : 1);
	function increaseHarm() {
		update({ currentHarm: Math.min(harmCap, currentHarm + 1) });
	}
	function decreaseHarm() {
		update({ currentHarm: Math.max(1, currentHarm - 1) });
	}

	// Escalating defense (YRT extension)
	const defenseCap = $derived(
		activeEnc ? (FOE_RANKS[activeEnc.effectiveRank]?.progressPerHit ?? 8) - 1 : 0,
	);
	const currentDefense = $derived(activeEnc?.currentDefense ?? 0);
	const progressTickVal = $derived(
		activeDef?.escalatesDefense
			? (rankInfo?.progressPerHit ?? 1) - currentDefense
			: (rankInfo?.progressPerHit ?? 0),
	);
	function increaseDefense() {
		update({ currentDefense: Math.min(defenseCap, currentDefense + 1) });
	}
	function decreaseDefense() {
		update({ currentDefense: Math.max(0, currentDefense - 1) });
	}

	// Progress track
	function handleTrackChange(_old: number, next: number) {
		update({ ticks: next });
	}

	/**
	 * Active foe name for log entries — mirror CharactersArea.charTitle so the
	 * log formatting for "took harm" reads the same on both sides.
	 */
	function foeTitle(suffix: string): string {
		const enc = activeEnc;
		if (!enc) return suffix;
		const def = findFoe(enc.foeId);
		const name = enc.customName?.trim() || def?.name || enc.foeId;
		return `${name} — ${suffix}`;
	}

	// Vanquish
	export function vanquishActiveFoe() {
		if (!activeEnc || activeEnc.vanquished) return;
		update({ vanquished: true });
		appendLog(foeTitle('Vanquished'), `<div><strong>Vanquished.</strong></div>`);
	}

	// Un-vanquish — mark a previously-vanquished foe live again. Sibling to
	// vanquishActiveFoe; both no-op silently when the target state already
	// matches so the caller doesn't have to check first.
	export function reactivateActiveFoe() {
		if (!activeEnc || !activeEnc.vanquished) return;
		update({ vanquished: false });
		appendLog(foeTitle('Reactivated'), `<div><strong>Reactivated.</strong></div>`);
	}

	// Menace / combat-progress from a log-entry link. Value is in progress
	// boxes (positive = harm dealt); each box is progressTickVal ticks
	// (usually 4 — softer for stronger foes). Log the change in the same
	// shape CharactersArea's applyResourceChange does for character harm.
	export function applyMenace(value: number) {
		if (!activeEnc || !value) return;
		const oldTicks = activeEnc.ticks;
		const nextTicks = Math.max(0, Math.min(40, oldTicks + value * progressTickVal));
		if (nextTicks === oldTicks) return;
		update({ ticks: nextTicks });
		const oldBoxes = Math.floor(oldTicks / progressTickVal);
		const nextBoxes = Math.floor(nextTicks / progressTickVal);
		const sign = value > 0 ? '+' : '';
		appendLog(
			foeTitle('Progress'),
			`<div>Progress: ${oldBoxes} → <strong>${nextBoxes}</strong> boxes (${sign}${value})</div>`,
		);
	}

	function imageUrl(def: FoeDef): string {
		return foePortraitUrl(def.name, def.images);
	}
</script>

<div class="fa-area" data-foe-count={encounters.length}>
	<header class="fa-header">
		{#if showTitle}
			<span class="fa-title-icon" aria-hidden="true">{@html foesIconSvg}</span>
			<span class="fa-title">{headingText('Foes')}</span>
		{/if}
		<div class="fa-header-actions">
			<!-- Always show the switcher — even when the list is empty. Trigger
			     reads the active foe's name; when empty a muted placeholder
			     reads "— No foes yet —", and the popover surfaces
			     "+ New foe…" as the only action. -->
			<!-- Foe switcher (Popover + Command). Same class prefix as
					 MapDialog's map switcher so the two comboboxes look
					 identical (see docs/ui-components.md). -->
			<Popover.Root bind:open={foePickerOpen}>
				<Popover.Trigger class="mp-combobox fa-hdr-combobox" aria-label="Switch or add foe">
					{#if activeEnc}<span class="mp-combobox-value">{displayName}</span>{:else}<span
							class="mp-combobox-value mp-combobox-value--placeholder">— No foes yet —</span
						>{/if}
					<span class="mp-combobox-caret" aria-hidden="true">{@html iconCaretDownSvg}</span>
				</Popover.Trigger>
				<Popover.Portal>
					<Popover.Content class="mp-cmd-popover" sideOffset={4} align="start" collisionPadding={8}>
						<Command.Root class="mp-cmd">
							<div class="mp-cmd-search-row">
								<span class="mp-cmd-search-icon" aria-hidden="true">{@html searchIconSvg}</span>
								<Command.Input class="mp-cmd-search" placeholder="Search foes…" autofocus />
							</div>
							<Command.List class="mp-cmd-list">
								<Command.Empty class="mp-cmd-empty">No matching foes.</Command.Empty>
								{#each encounters as enc (enc.id)}
									{@const def = findFoe(enc.foeId)}
									{@const n = enc.customName?.trim() || def?.name || enc.foeId}
									<Command.Item
										class="mp-cmd-item"
										value={n}
										onSelect={() => {
											selectFoe(enc.id);
											foePickerOpen = false;
										}}
									>
										<span class="mp-cmd-check" aria-hidden="true">
											{#if enc.id === activeFoeId}
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
										<span class="mp-cmd-item-name">{n}</span>
									</Command.Item>
								{/each}
								<Command.Separator class="mp-cmd-sep" />
								<Command.Item
									class="mp-cmd-item mp-cmd-item--action"
									value="+ New foe"
									onSelect={() => {
										foePickerOpen = false;
										void foePickerRef?.open();
									}}
								>
									<span class="mp-cmd-check" aria-hidden="true"></span>
									<span class="mp-cmd-item-name">+ New foe…</span>
								</Command.Item>
							</Command.List>
						</Command.Root>
					</Popover.Content>
				</Popover.Portal>
			</Popover.Root>

			{#if activeEnc}
				<SegmentedRadio
					ariaLabel="Foe status"
					labels="auto"
					value={activeEnc.vanquished ? 'vanquished' : 'active'}
					onchange={(v) => update({ vanquished: v === 'vanquished' })}
					options={[
						{ value: 'active', icon: swordSvg, text: 'Active', label: 'Mark active', tone: 'go' },
						{
							value: 'vanquished',
							icon: skullSvg,
							text: 'Vanquished',
							label: 'Mark vanquished',
							tone: 'stop',
						},
					]}
				/>
				<button
					class="btn btn-icon icon-btn fa-hdr-settings-btn"
					onclick={() => foeOptionsRef?.open()}
					use:tooltip={'Foe options'}
					aria-label="Foe options">{@html iconGearSvg}</button
				>
			{/if}
		</div>
	</header>

	{#if loading}
		<div class="fa-loading">Loading…</div>
	{:else if encounters.length === 0}
		<div class="fa-empty">
			<span class="fa-empty-icon" aria-hidden="true">{@html foesIconSvg}</span>
			<p class="fa-empty-text">
				Nothing currently wants you dead. Disappointing. Pick
				<strong>+ New foe…</strong> from the switcher above to dance with fate.
			</p>
		</div>
	{:else}
		<div class="fa-body">
			{#if activeEnc}
				<div
					class="fa-stage"
					class:fa-stage--vanquished={activeEnc.vanquished}
					style="--fa-nature: {natureColor}"
				>
					<Tabs.Root
						value={activeTab}
						onValueChange={(v) => (activeTab = v as FoeTab)}
						class="fa-tabs-root"
					>
						<Tabs.List class="fa-tabs">
							{#each TAB_LABELS as tab (tab.key)}
								<Tabs.Trigger value={tab.key} class="fa-tab">{tab.label}</Tabs.Trigger>
							{/each}
						</Tabs.List>
					</Tabs.Root>

					<div class="fa-card" role="tabpanel">
						{#if activeTab === 'description'}
							{#if activeDef}
								<div class="fa-desc-section">
									{#if imgVisible}
										<!-- svelte-ignore a11y_click_events_have_key_events -->
										<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
										<img
											class="fa-portrait"
											src={imageUrl(activeDef)}
											alt={activeDef.name}
											onclick={() => (lightboxOpen = true)}
											onerror={(e) => {
												(e.currentTarget as HTMLImageElement).src = UNKNOWN_FOE_PORTRAIT;
												imgVisible = false;
											}}
											use:tooltip={'Click to enlarge'}
										/>
									{/if}
									{#if hasDescription}
										{#if resolvedDesc}
											<p class="fa-desc">{resolvedDesc}</p>
										{/if}
										{#if activeDef.features.length > 0}
											<div class="fa-section">
												<span class="fa-section-label">Features</span>
												<ul class="fa-list">
													{#each activeDef.features as feat}<li>{feat}</li>{/each}
												</ul>
											</div>
										{/if}
										{#if activeDef.drives.length > 0}
											<div class="fa-section">
												<span class="fa-section-label">Drives</span>
												<ul class="fa-list">
													{#each activeDef.drives as drv}<li>{drv}</li>{/each}
												</ul>
											</div>
										{/if}
										{#if activeDef.tactics.length > 0}
											<div class="fa-section">
												<span class="fa-section-label">Tactics</span>
												<ul class="fa-list">
													{#each activeDef.tactics as t}<li>{t}</li>{/each}
												</ul>
											</div>
										{/if}
									{:else}
										<p class="fa-empty-mini">No description available.</p>
									{/if}
								</div>
							{:else}
								<p class="fa-empty-mini">
									Catalogue entry “{activeEnc.foeId}” isn’t available (extension disabled?).
								</p>
							{/if}
						{:else if activeTab === 'core'}
							{#if activeDef && rankInfo}
								<!-- Pills row -->
								<div class="fa-pills-row">
									<span class="fa-badge" style="background: {natureColor}22; color: {natureColor}"
										>{activeDef.nature}</span
									>
									<span
										class="fa-badge fa-badge--rank"
										style={rankBadgeStyle(activeEnc.effectiveRank)}
										use:tooltip={activeEnc.quantity !== 'solo'
											? `Base rank ${activeDef.rank} + ${qtyDef?.rankAdj ?? 0} for ${activeEnc.quantity}`
											: ''}>{rankInfo.label}</span
									>
									{#if activeEnc.quantity !== 'solo'}
										<span class="fa-badge fa-badge--qty">{qtyDef?.label ?? activeEnc.quantity}</span
										>
									{/if}
									{#if activeDef.escalates}
										<span class="fa-badge fa-badge--harm fa-badge--escalating"
											>Harm: {currentHarm} ↑</span
										>
									{:else}
										<span class="fa-badge fa-badge--harm">Harm: {rankInfo.harm}</span>
									{/if}
									{#if activeDef.escalatesDefense && currentDefense > 0}
										<span class="fa-badge fa-badge--progress fa-badge--defense-progress"
											>Progress: {progressTickVal} ↓</span
										>
									{:else}
										<span class="fa-badge fa-badge--progress"
											>Progress: {rankInfo.progressPerHit}</span
										>
									{/if}
								</div>

								<!-- Escalating harm -->
								{#if activeDef.escalates}
									<div class="fa-escalate-row">
										<span
											class="fa-escalate-label"
											use:tooltip={"This foe's attack increases every time a miss happens in combat."}
											>Escalating Harm</span
										>
										<div class="fa-escalate-ctrl">
											<button
												class="fa-adj-btn"
												onclick={decreaseHarm}
												disabled={currentHarm <= 1}
												aria-label="Decrease harm">−</button
											>
											<span class="fa-harm-val" class:fa-harm-high={currentHarm >= harmCap}
												>{currentHarm}</span
											>
											<button
												class="fa-adj-btn"
												onclick={increaseHarm}
												disabled={currentHarm >= harmCap}
												aria-label="Increase harm">+</button
											>
											<span class="fa-harm-cap">/ {harmCap}</span>
										</div>
									</div>
								{/if}

								<!-- Escalating defense -->
								{#if activeDef.escalatesDefense}
									<div class="fa-escalate-row">
										<span
											class="fa-escalate-label"
											use:tooltip={"This foe's defence increases every time a miss happens in combat."}
											>Escalating Defense</span
										>
										<div class="fa-escalate-ctrl">
											<button
												class="fa-adj-btn"
												onclick={decreaseDefense}
												disabled={currentDefense <= 0}
												aria-label="Decrease defense">−</button
											>
											<span class="fa-harm-val">{currentDefense}</span>
											<button
												class="fa-adj-btn"
												onclick={increaseDefense}
												disabled={currentDefense >= defenseCap}
												aria-label="Increase defense">+</button
											>
											<span class="fa-harm-cap">/ {defenseCap}</span>
										</div>
									</div>
								{/if}

								<div class="fa-section">
									<ProgressTrackPanel
										label="Progress track"
										value={activeEnc.ticks}
										color={natureColor}
										step={progressTickVal}
										showStep
										onchange={handleTrackChange}
									/>
								</div>
							{:else}
								<p class="fa-empty-mini">
									Catalogue entry “{activeEnc.foeId}” isn’t available — combat controls disabled.
								</p>
							{/if}
						{/if}
					</div>
				</div>
			{/if}
		</div>
	{/if}
</div>

{#if lightboxOpen && activeDef}
	<Lightbox src={imageUrl(activeDef)} alt={activeDef.name} onclose={() => (lightboxOpen = false)} />
{/if}

<FoePickerDialog bind:this={foePickerRef} onSelect={handleFoeSelected} />

{#if activeEnc}
	<FoeOptionsDialog
		bind:this={foeOptionsRef}
		name={activeEnc.customName ?? ''}
		defName={activeDef?.name ?? ''}
		oncommit={(next) => update({ customName: next })}
		ondelete={confirmDeleteFoe}
	/>
{/if}

<style>
	.fa-area {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
	}

	/* Header */
	.fa-header {
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: var(--area-header-height);
		padding: 6px 12px;
		border-bottom: 1px solid var(--border);
		background: var(--bg-control);
		flex-shrink: 0;
		/* Named container so the title label hides when the panel narrows. */
		container-type: inline-size;
		container-name: area-header;
	}
	@container area-header (max-width: 320px) {
		.fa-title {
			display: none;
		}
	}
	.fa-title-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 18px;
		height: 18px;
		flex-shrink: 0;
		color: var(--text-accent);
	}
	.fa-title-icon :global(svg) {
		width: 100%;
		height: 100%;
		fill: currentColor;
	}
	.fa-title-icon :global(svg) :global(path) {
		fill: currentColor;
	}
	.fa-title {
		font-family: var(--font-display);
		font-size: calc(0.82rem * var(--font-display-scale));
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: var(--font-display-transform);
		color: var(--text-accent);
	}
	.fa-header-actions {
		display: flex;
		align-items: center;
		gap: 6px;
		flex: 1;
		justify-content: flex-end;
	}

	.fa-loading,
	.fa-empty {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		font-family: var(--font-ui);
		font-size: 0.8rem;
		color: var(--text-muted);
		padding: 20px;
		gap: 12px;
		text-align: center;
	}

	.fa-empty-icon {
		display: flex;
		width: 48px;
		height: 48px;
		opacity: 0.25;
	}
	.fa-empty-icon :global(svg) {
		width: 100%;
		height: 100%;
		fill: currentColor;
	}

	.fa-empty-text {
		margin: 0;
		line-height: 1.5;
		max-width: 26ch;
	}

	/* Body: single column now that the spine strip is gone (foe switcher
	   moved into the header combobox). Stage fills the whole area. */
	.fa-body {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
	}
	/* Stage — coloured 3 px band on the LHS keyed to the active foe's
	   nature (beast / horror / hunter / …). */
	.fa-stage {
		padding: 0 12px 10px 12px;
		min-height: 0;
		min-width: 0;
		flex: 1;
		overflow: auto;
		display: flex;
		flex-direction: column;
		border-left: 3px solid var(--fa-nature, var(--text-muted));
	}

	.fa-stage--vanquished .fa-card {
		opacity: 0.6;
	}

	/* Combobox trigger inside the header — takes the flex slack so long
	   foe names truncate before pushing the toggle + delete off-screen. */
	:global(.fa-hdr-combobox) {
		flex: 1 1 auto;
		min-width: 0;
	}
	/* Header gear button — sizes the svg to match its siblings across
	   Chars/Exp/Connections. */
	:global(.fa-hdr-settings-btn) {
		flex-shrink: 0;
	}
	:global(.fa-hdr-settings-btn svg) {
		width: 13px;
		height: 13px;
		fill: currentColor;
	}
	:global(.fa-hdr-settings-btn svg path) {
		fill: currentColor;
	}
	/* Header contains a SegmentedRadio that opts into `labels="auto"`;
	   the responsive collapse depends on an inline-size container ancestor. */
	.fa-header-actions {
		container-type: inline-size;
	}

	/* Card tabs — same V1 tab-btn style as CharactersArea. */
	:global(.fa-tabs) {
		display: flex;
		align-items: stretch;
		gap: 0;
		margin-bottom: 8px;
		border-bottom: 1px solid var(--border);
	}
	:global(.fa-tab) {
		all: unset;
		cursor: pointer;
		font-family: var(--font-ui);
		font-size: 0.72rem;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-dimmer);
		background: transparent;
		border: none;
		border-bottom: 2px solid transparent;
		padding: 7px 8px 6px;
		white-space: nowrap;
		flex-shrink: 0;
		margin-bottom: -1px;
		transition:
			color 0.12s,
			border-color 0.12s;
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
	}
	:global(.fa-tab:hover) {
		color: var(--text-muted);
	}
	:global(.fa-tab[data-state='active']) {
		color: var(--text-accent);
		border-bottom-color: var(--text-accent);
	}

	/* Card content — theme-aware: cream (--bg-inset) in light mode, near-black
	   in dark mode. The coloured nature band lives only on the stage header. */
	.fa-card {
		flex: 1;
		min-height: 200px;
		background: var(--bg-inset);
		border: none;
		border-radius: 0;
		padding: 7px;
		overflow: auto;
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	/* ── Description tab ── portrait floats right; text wraps. */
	.fa-desc-section {
		display: block;
	}
	.fa-portrait {
		float: right;
		width: 170px;
		height: 170px;
		max-height: 240px;
		object-fit: cover;
		margin: 0 0 10px 14px;
		border: 1px solid var(--border);
		border-radius: 6px;
		opacity: 0.95;
		shape-outside: margin-box;
		cursor: zoom-in;
		transition:
			opacity 0.12s,
			box-shadow 0.12s;
	}
	.fa-portrait:hover {
		opacity: 1;
		box-shadow: 0 4px 14px #00000040;
	}
	.fa-desc {
		font-family: var(--font-ui);
		font-size: 0.85rem;
		line-height: 1.5;
		color: var(--text);
		margin: 0 0 0.6em;
		white-space: pre-line;
	}
	.fa-section {
		display: flex;
		flex-direction: column;
		gap: 4px;
		margin-bottom: 8px;
	}
	.fa-section-label {
		font-family: var(--font-ui);
		font-size: 0.65rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-dimmer);
	}
	.fa-list {
		font-family: var(--font-ui);
		font-size: 0.82rem;
		line-height: 1.45;
		color: var(--text);
		margin: 0;
		padding-left: 1.2em;
	}
	.fa-list li {
		margin: 0 0 2px;
	}
	.fa-empty-mini {
		font-family: var(--font-ui);
		font-size: 0.78rem;
		color: var(--text-dimmer);
		font-style: italic;
	}

	/* ── Core tab ── pills, escalating spinners, progress track, vanquish. */
	.fa-pills-row {
		display: flex;
		flex-wrap: wrap;
		gap: 5px;
		align-items: center;
		border-bottom: 1px solid #c3baa1;
		padding-top: 0;
		padding-bottom: 14px;
	}
	.fa-badge {
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
	.fa-badge--qty {
		background: rgba(255, 255, 255, 0.08);
		color: var(--text-muted);
	}
	.fa-badge--harm {
		background: rgba(239, 68, 68, 0.1);
		color: #ef4444;
	}
	.fa-badge--escalating {
		background: rgba(239, 68, 68, 0.18);
		font-style: italic;
	}
	.fa-badge--progress {
		background: rgba(59, 130, 246, 0.1);
		color: #60a5fa;
	}
	.fa-badge--defense-progress {
		background: rgba(96, 165, 250, 0.18);
		font-style: italic;
	}

	.fa-escalate-row {
		display: flex;
		align-items: center;
		gap: 10px;
		border-bottom: 1px solid #c3baa1;
		padding-bottom: 8px;
	}
	.fa-escalate-label {
		font-family: var(--font-ui);
		font-size: 0.7rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: var(--text-dimmer);
	}
	.fa-escalate-ctrl {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.fa-adj-btn {
		all: unset;
		cursor: pointer;
		box-sizing: border-box;
		height: 22px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border: 1px solid var(--border-mid);
		border-radius: 3px;
		font-family: var(--font-ui);
		font-size: 0.68rem;
		font-weight: 600;
		color: var(--text-muted);
		background: transparent;
		padding: 0 6px;
		flex-shrink: 0;
	}
	.fa-adj-btn[disabled] {
		opacity: 0.35;
		cursor: not-allowed;
	}
	.fa-adj-btn:hover:not([disabled]) {
		background: var(--bg-hover);
	}
	.fa-harm-val {
		font-family: var(--font-ui);
		font-size: 0.95rem;
		font-weight: 700;
		min-width: 1.5ch;
		text-align: center;
		color: var(--text);
	}
	.fa-harm-high {
		color: #ef4444;
	}
	.fa-harm-cap {
		font-family: var(--font-ui);
		font-size: 0.7rem;
		color: var(--text-dimmer);
	}
</style>
