<script lang="ts">
	/**
	 * CharacterSheet — full character editor.
	 * Ported from YRT 08-characters.js + 08b-assets.js into Svelte 5.
	 *
	 * State is a deep-reactive $state object mirroring the DB jsonb column.
	 * Auto-saves to the API 1.5 s after the last change (debounced).
	 */
	import type { CharacterFull } from '$lib/api.js';
	import type { Vow } from '$lib/types.js';
	import { DEFAULT_CHARACTER } from '$lib/types.js';
	import {
		maxMomentum,
		momentumReset,
		countDebilities,
		hydrateCharacter,
		progressText,
	} from '$lib/character.js';
	import { untrack } from 'svelte';
	import { persistCharacterNow } from '$lib/characterStore.svelte.js';
	import { isDelveEnabled } from '$lib/expansionStore.svelte.js';

	import trashSvg      from '$icons/trash-solid-full.svg?raw';
	import hornedHelmSvg from '$icons/horned-helm.svg?raw';
	import ErrorBar      from '$lib/components/ErrorBar.svelte';

	import swordSvg      from '$icons/sword-solid-full.svg?raw';
	import shieldSvg     from '$icons/shield-halved-solid.svg?raw';

	// Resource icons (stat icons removed per user request)
	import iconHealth from '$icons/icon-health.svg?raw';
	import iconSpirit from '$icons/icon-spirit.svg?raw';
	import iconSupply from '$icons/icon-supply.svg?raw';
	import iconStar   from '$icons/star-solid-full.svg?raw';

	import { initLog, appendLog, getXpSpendNonce, drainXpSpend, getActionNonce, drainActions, SESSION_LOG_ID } from '$lib/log.svelte.js';
	import { FLOOR_RULES, DEBILITY_MOMENTUM_TITLE } from '$lib/cascadeRules.js';
	import { renderNote } from '$lib/markdown.js';

	import { getActiveDiceCtx, setActiveDiceCtx } from '$lib/diceContext.svelte.js';
	import { tooltip } from '$lib/actions/tooltip.js';

	import ConfirmDialog     from './ConfirmDialog.svelte';
	import StatControl       from './StatControl.svelte';
	import ResourceTile      from './ResourceTile.svelte';
	import MomentumTile      from './MomentumTile.svelte';
	import XpTrack           from './XpTrack.svelte';
	import ProgressTrack     from './ProgressTrack.svelte';
	import DebilitiesSection  from './DebilitiesSection.svelte';
	import VowCard           from './VowCard.svelte';
	import AssetsSection     from './AssetsSection.svelte';

	// ---------------------------------------------------------------------------
	// Props
	// ---------------------------------------------------------------------------
	let {
		character,
		active = false,
		initiative = 0,
		supply,
		focusName = false,
		onDelete,
		onOracleLink,
		onSupplyChange,
	}: {
		character: CharacterFull;
		/** True when this is the currently selected character — publishes dice context. */
		active?:   boolean;
		/** 0 = none, 1 = character has initiative, 2 = foe has initiative */
		initiative?: number;
		/** Party-wide supply value pushed from outside — synced into data.supply. */
		supply?: number;
		/** Focus the name field immediately (used when newly created). */
		focusName?: boolean;
		onDelete?:      () => void;
		onOracleLink?:  (key: string, stat?: string) => void;
		/** Called when this sheet changes supply — used to echo the value to all party members. */
		onSupplyChange?: (val: number) => void;
	} = $props();

	// ---------------------------------------------------------------------------
	// State
	// ---------------------------------------------------------------------------
	// Read the prop once at mount without subscribing to future changes.
	// We own this state from here on — changes are persisted via auto-save.
	// untrack() suppresses the "captured initial value" rune warning correctly.
	let data = $state(untrack(() => hydrateCharacter(character.data)));
	let collapsed = $state(untrack(() => typeof window !== 'undefined' ? localStorage.getItem('il:char:collapse:' + character.id) === 'true' : false));
	$effect(() => { if (typeof window !== 'undefined') localStorage.setItem('il:char:collapse:' + character.id, String(collapsed)); });
	let deleteDialogRef = $state<{ open(): void; close(): void } | null>(null);

	// Publish live data to the global dice context whenever this sheet is active.
	// We deliberately do NOT clear _ctx when active becomes false — the live data
	// reference must remain available on the Adventure tab (where CharacterSheet is
	// unmounted) so MovesDialog always reads current stat values, not stale API data.
	$effect(() => {
		if (active) {
			setActiveDiceCtx({ charId: character.id, charName: data.name || 'Unnamed', data });
		}
	});
	let portraitHovered = $state(false);

	// Background field: toggle between markdown display and textarea editing
	let editingBackground = $state(false);
	let backgroundCollapsed = $state(untrack(() => typeof window !== 'undefined' ? localStorage.getItem('il:char:bg:' + character.id) === 'true' : false));
	$effect(() => { if (typeof window !== 'undefined') localStorage.setItem('il:char:bg:' + character.id, String(backgroundCollapsed)); });
	let backgroundTextareaEl = $state<HTMLTextAreaElement | null>(null);
	$effect(() => {
		if (editingBackground && backgroundTextareaEl) {
			backgroundTextareaEl.focus();
		}
	});

	// Inline name editing in header
	let editingName = $state(false);
	let nameInputEl = $state<HTMLInputElement | null>(null);
	let nameBeforeEdit = '';
	$effect(() => {
		if (editingName && nameInputEl) {
			nameInputEl.select();
		}
	});
	$effect(() => {
		if (focusName) { nameBeforeEdit = data.name; editingName = true; }
	});

	// Initialise log for this character on mount
	$effect(() => { initLog(SESSION_LOG_ID); });

	// ---------------------------------------------------------------------------
	// Log helpers — all events go to the global session log.
	// Character name is prepended to every title for disambiguation.
	// ---------------------------------------------------------------------------
	function charTitle(title: string) { return `${data.name || 'Unnamed'} — ${title}`; }

	function logMeter(name: string, oldVal: number, newVal: number) {
		appendLog(SESSION_LOG_ID, charTitle(name), `<div>${name}: ${oldVal} → <strong>${newVal}</strong></div>`);
	}

	let debilityStatus      = $state('');
	let debilityStatusTimer = 0;

	function logDebility(label: string, active: boolean) {
		appendLog(SESSION_LOG_ID, charTitle('Debilities'),
			`<div>${label}: <strong>${active ? 'Activated' : 'Cleared'}</strong></div>`);
		debilityStatus = `${label}: ${active ? 'Activated' : 'Cleared'}`;
		clearTimeout(debilityStatusTimer);
		debilityStatusTimer = setTimeout(() => { debilityStatus = ''; }, 3000) as unknown as number;
	}

	function logXp(oldVal: number, newVal: number) {
		appendLog(SESSION_LOG_ID, charTitle('Experience'), `<div>XP: ${oldVal} → <strong>${newVal}</strong></div>`);
	}

	function logTrack(name: string, oldVal: number, newVal: number) {
		appendLog(SESSION_LOG_ID, charTitle(name), `<div>${name}: ${oldVal} ticks → <strong>${newVal} ticks</strong></div>`);
	}

	function logStat(name: string, oldVal: number, newVal: number) {
		appendLog(SESSION_LOG_ID, charTitle('Stats'), `<div>${name}: ${oldVal} → <strong>${newVal}</strong></div>`);
	}

	// React to XP cost link clicks in LogPanel.
	// getXpSpendNonce() creates a reactive dependency — this effect re-runs
	// every time triggerXpSpend() increments the nonce.  drainXpSpend() then
	// pulls the queued amount for this character so the mutation happens INSIDE
	// Svelte's reactive context (fixing the bind:value propagation issue).
	$effect(() => {
		getXpSpendNonce(); // subscribe: re-runs whenever any XP link is clicked
		const amount = drainXpSpend(character.id);
		if (amount > 0) {
			const old  = data.xp;
			const next = Math.max(0, old - amount);
			if (next !== old) {
				data.xp = next;
				appendLog(SESSION_LOG_ID, charTitle('Experience'),
					`<div>XP spent: <strong>−${amount}</strong> (${old} → <strong>${next}</strong>)</div>`);
			}
		}
	});

	// React to resource / debility action links clicked in LogPanel.
	// Same bus pattern as XP spend above.
	$effect(() => {
		getActionNonce();
		const actions = drainActions(character.id);
		for (const action of actions) {
			if (action.type === 'resource') {
				applyResourceChange(action.key, action.value);
			} else if (action.type === 'debility') {
				applyDebilityToggle(action.key, action.value);
			}
		}
	});

	function applyResourceChange(key: string, delta: number) {
		// Global counters (e.g. mana) live in data.globalValues as numeric strings.
		if (key === 'mana') {
			const gv  = data.globalValues ?? {};
			const old = parseInt(gv['mana'] ?? '0');
			const next = Math.max(0, Math.min(10, old + delta));
			if (next !== old) {
				data.globalValues = { ...gv, mana: String(next) };
				appendLog(SESSION_LOG_ID, charTitle('Mana'),
					`<div>Mana: ${old} → <strong>${next}</strong> (${delta > 0 ? '+' : ''}${delta})</div>`);
			}
			return;
		}
		const rec = data as unknown as Record<string, number>;
		const old = rec[key] ?? 0;
		let next: number;
		switch (key) {
			case 'momentum': next = Math.max(-6, Math.min(momentumMax, old + delta)); break;
			case 'health':
			case 'spirit':
			case 'supply':

			case 'xp':       next = Math.max(0, Math.min(999, old + delta)); break;
			case 'bonds':
			case 'failures': next = Math.max(0, Math.min(40, old + delta)); break;
			default:         return;
		}
		if (next !== old) {
			rec[key] = next;
			const label = key.charAt(0).toUpperCase() + key.slice(1);
			appendLog(SESSION_LOG_ID, charTitle(label),
				`<div>${label}: ${old} → <strong>${next}</strong> (${delta > 0 ? '+' : ''}${delta})</div>`);
			if (key === 'supply') onSupplyChange?.(next);
			// Floor cascade: resource just hit its minimum — append a note.
			if (delta < 0) {
				const floorRule = FLOOR_RULES.find(r => r.resource === key && next === r.floor);
				if (floorRule) {
					const entryId = crypto.randomUUID();
					appendLog(SESSION_LOG_ID, floorRule.logTitle, floorRule.logHtml({ charId: character.id, entryId }), entryId);
				}
			}
		}
	}

	function applyDebilityToggle(key: string, value: number) {
		const rec = data as unknown as Record<string, boolean>;
		if (rec[key] === undefined) return;
		const active = value === 1;
		if (rec[key] !== active) {
			rec[key] = active;
			const label = key.charAt(0).toUpperCase() + key.slice(1);
			appendLog(SESSION_LOG_ID, charTitle('Debilities'),
				`<div>${label}: <strong>${active ? 'Marked' : 'Cleared'}</strong></div>`);
			// Cascade: marking a debility reduces maxMomentum by 1.
			// Present a clickable log entry rather than auto-applying, consistent
			// with the app pattern where all resource changes require a player click.
			if (active) {
				const newMax   = maxMomentum(data);
				const resetVal = momentumReset(data);
				if (data.momentum > newMax) {
					const cappedFrom = data.momentum;
					const delta      = newMax - cappedFrom;
					const entryId    = crypto.randomUUID();
					const html =
						`<p>Max momentum reduced to <strong>${newMax}</strong>. ` +
						`<a class="resource-link" data-resource="momentum" data-value="${delta}" ` +
						`data-entry-id="${entryId}" data-char-id="${character.id}">` +
						`Reduce momentum to ${newMax}</a> ` +
						`(currently ${cappedFrom}). Reset value is now <strong>${resetVal}</strong>.</p>`;
					appendLog(SESSION_LOG_ID, DEBILITY_MOMENTUM_TITLE, html, entryId);
				}
			}
		}
	}

	function doMomentumReset() {
		const old = data.momentum;
		if (momentumRstV !== old) {
			appendLog(SESSION_LOG_ID, charTitle('Momentum'),
				`<div>Momentum reset: ${old} → <strong>${momentumRstV}</strong></div>`);
			data.momentum = momentumRstV;
		}
	}

	// ---------------------------------------------------------------------------
	// Derived game-logic values (reactive to debility changes)
	// ---------------------------------------------------------------------------
	const momentumMax   = $derived(maxMomentum(data));
	const momentumRstV  = $derived(momentumReset(data));
	const debilityCount = $derived(countDebilities(data));

	// Sync the initiative prop into owned data so it's included in save snapshots.
	$effect(() => {
		const v = initiative ?? 0;
		if ((data.initiative ?? 0) !== v) data.initiative = v || undefined;
	});

	// Sync party-wide supply from the parent into owned data.
	// Only fires when the prop actually changes value (loop-safe: onSupplyChange is
	// called only from user-driven paths, not from this effect).
	$effect(() => {
		const v = supply;
		if (v !== undefined && v !== null && data.supply !== v) data.supply = v;
	});

	// ---------------------------------------------------------------------------
	// Auto-save — debounced 1.5 s after any change, delegated to characterStore
	// ---------------------------------------------------------------------------
	let _saveTimer: ReturnType<typeof setTimeout> | null = null;
	$effect(() => {
		const snapshot = $state.snapshot(data) as Record<string, unknown>;
		if (_saveTimer) clearTimeout(_saveTimer);
		_saveTimer = setTimeout(() => {
			_saveTimer = null;
			persistCharacterNow(character.id, {
				name: (snapshot.name as string) || 'New Character',
				data: snapshot,
			});
		}, 1500);
		return () => { if (_saveTimer) clearTimeout(_saveTimer); };
	});

	// ---------------------------------------------------------------------------
	// Vow helpers
	// ---------------------------------------------------------------------------
	function addVow() {
		const newVow: Vow = {
			id: crypto.randomUUID(),
			name: '',
			difficulty: 'formidable',
			ticks: 0,
			threat: '',
			menace: 0,
		};
		data.vows = [...data.vows, newVow];
		appendLog(SESSION_LOG_ID, charTitle('Vow'),
			`<div>Swore a new iron vow — <strong>Formidable</strong></div>`);
	}

	function removeVow(id: string) {
		data.vows = data.vows.filter((v) => v.id !== id);
	}

	// ---------------------------------------------------------------------------
	// Bond / Failure helpers (one full box = 4 ticks)
	// ---------------------------------------------------------------------------
	const bondsMax    = 40; // 10 boxes × 4 ticks
	const failuresMax = 40;

	function addBond() {
		const old = data.bonds;
		const next = Math.min(bondsMax, data.bonds + 1);
		if (next !== old) { logTrack('Bonds', old, next); data.bonds = next; }
	}
	function removeBond() {
		const old = data.bonds;
		const next = Math.max(0, data.bonds - 1);
		if (next !== old) { logTrack('Bonds', old, next); data.bonds = next; }
	}
	function addFailure() {
		const old = data.failures;
		const next = Math.min(failuresMax, data.failures + 1);
		if (next !== old) { logTrack('Failures', old, next); data.failures = next; }
	}
	function removeFailure() {
		const old = data.failures;
		const next = Math.max(0, data.failures - 1);
		if (next !== old) { logTrack('Failures', old, next); data.failures = next; }
	}

	// ---------------------------------------------------------------------------
	// Portrait upload (mirror YRT: resize to 256 px JPEG)
	// ---------------------------------------------------------------------------
	function handlePortrait(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;

		const reader = new FileReader();
		reader.onload = () => {
			const img = new Image();
			img.onload = () => {
				const canvas = document.createElement('canvas');
				const size = Math.min(img.width, img.height, 256);
				canvas.width = size;
				canvas.height = size;
				const ctx = canvas.getContext('2d')!;
				// Centre-crop to square
				const side = Math.min(img.width, img.height);
				const sx   = (img.width  - side) / 2;
				const sy   = (img.height - side) / 2;
				ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
				data.portrait = canvas.toDataURL('image/jpeg', 0.85);
			};
			img.src = reader.result as string;
		};
		reader.readAsDataURL(file);
	}
</script>

<!-- ============================================================
     Character Card
     ============================================================ -->
<div class="char-card" class:collapsed>

	<!-- Header ------------------------------------------------- -->
	<div class="char-header">
		<button
			class="collapse-btn"
			onclick={() => (collapsed = !collapsed)}
			aria-label={collapsed ? 'Expand character' : 'Collapse character'}
			title={collapsed ? 'Expand' : 'Collapse'}
		>
			{collapsed ? '▶' : '▼'}
		</button>

		<!-- Portrait -->
		<label
			class="portrait-label"
			title="Click to change portrait"
			onmouseenter={() => (portraitHovered = true)}
			onmouseleave={() => (portraitHovered = false)}
		>
			{#if data.portrait}
				<img src={data.portrait} alt="Portrait of {data.name}" class="portrait-img" />
			{:else}
				<div class="portrait-placeholder">{@html hornedHelmSvg}</div>
			{/if}
			<input
				type="file"
				accept="image/*"
				class="portrait-input"
				onchange={handlePortrait}
				aria-label="Upload portrait"
			/>
		</label>

		<!-- Portrait lightbox on hover -->
		{#if portraitHovered && data.portrait}
			<div class="portrait-lightbox" aria-hidden="true">
				<img src={data.portrait} alt="Portrait of {data.name}" />
			</div>
		{/if}

		{#if editingName}
			<input
				bind:this={nameInputEl}
				class="char-name-input"
				type="text"
				bind:value={data.name}
				placeholder="Character name"
				onblur={() => (editingName = false)}
				onkeydown={(e) => {
					if (e.key === 'Enter') nameInputEl?.blur();
					if (e.key === 'Escape') { data.name = nameBeforeEdit; editingName = false; }
				}}
			/>
		{:else}
			<!-- svelte-ignore a11y_interactive_supports_focus -->
			<span class="char-title" role="button"
				onclick={() => { nameBeforeEdit = data.name; editingName = true; }}
				onkeydown={(e) => e.key === 'Enter' && (editingName = true)}
				title="Click to rename"
			>{data.name || 'Unnamed'}</span>
		{/if}


		{#if initiative === 1}
			<div class="cs-init-badge cs-init-badge--you">{@html swordSvg}<span class="cs-init-label">Has Initiative</span></div>
		{:else if initiative === 2}
			<div class="cs-init-badge cs-init-badge--foe">{@html shieldSvg}<span class="cs-init-label">Foe Has Initiative</span></div>
		{/if}

		{#if onDelete}
			<button
				class="btn btn-icon icon-btn"
				onclick={() => deleteDialogRef?.open()}
				use:tooltip={"Delete character"}
				aria-label="Delete character"
			>{@html trashSvg}</button>
		{/if}
	</div>

	<!-- Delete confirmation dialog -->
	{#if onDelete}
		<ConfirmDialog
			bind:this={deleteDialogRef}
			title="Delete Character"
			confirmLabel="Delete"
			onconfirm={() => onDelete!()}
		>
			<p>Permanently delete <strong>{data.name}</strong>? This cannot be undone.</p>
		</ConfirmDialog>
	{/if}

	<!-- Body (collapsible) ------------------------------------- -->
	{#if !collapsed}
		<div class="char-body">
			<!-- Identity -->
			<section class="char-section">
				<div class="identity-fields">
					<div class="field-group flex-1">
						<button class="bg-toggle" onclick={() => (backgroundCollapsed = !backgroundCollapsed)} title={backgroundCollapsed ? 'Expand background' : 'Collapse background'}>
							<span class="bg-toggle-arrow" class:bg-toggle-arrow--collapsed={backgroundCollapsed}>▾</span>
							<span class="section-label">Background</span>
						</button>
						{#if !backgroundCollapsed}
							{#if editingBackground}
								<textarea
									bind:this={backgroundTextareaEl}
									bind:value={data.background}
									placeholder="Background, history, or notes…"
									class="background-input"
									rows="3"
									onblur={() => (editingBackground = false)}
								></textarea>
							{:else}
								<!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
								<div
									class="background-display"
									class:bg-empty={!data.background?.trim()}
									onclick={() => (editingBackground = true)}
									onkeydown={(e) => { if (e.key === 'Enter') editingBackground = true; }}
									title="Click to edit"
									role="button"
									tabindex="0"
								>
									{#if data.background?.trim()}
										{@html renderNote(data.background)}
									{:else}
										<span class="bg-placeholder">Background, history, or notes…</span>
									{/if}
								</div>
							{/if}
						{/if}
					</div>
				</div>
			</section>

			<div class="section-divider"></div>

			<!-- Stats -->
			<section class="char-section">
				<div class="stats-row-wrapper">
					<div class="stats-side-label">STATS</div>
					<div class="stats-row">
						<StatControl
							label="Edge" bind:value={data.edge} color="var(--color-edge)"
							tooltip="Quickness, agility, and prowess in ranged combat"
							onchange={(o, n) => logStat('Edge', o, n)}
						/>
						<StatControl
							label="Heart" bind:value={data.heart} color="var(--color-heart)"
							tooltip="Courage, willpower, empathy, sociability, and loyalty"
							onchange={(o, n) => logStat('Heart', o, n)}
						/>
						<StatControl
							label="Iron" bind:value={data.iron} color="var(--color-iron)"
							tooltip="Physical strength, endurance, and prowess in close combat"
							onchange={(o, n) => logStat('Iron', o, n)}
						/>
						<StatControl
							label="Shadow" bind:value={data.shadow} color="var(--color-shadow)"
							tooltip="Sneakiness, deceptiveness, and cunning"
							onchange={(o, n) => logStat('Shadow', o, n)}
						/>
						<StatControl
							label="Wits" bind:value={data.wits} color="var(--color-wits)"
							tooltip="Expertise, knowledge, and observation"
							onchange={(o, n) => logStat('Wits', o, n)}
						/>
					</div>
				</div>
			</section>

			<div class="section-divider"></div>

			<!-- Vitals / Meters -->
			<section class="char-section">
				<div class="vitals-row-wrapper">
					<div class="vitals-side-label">VITALS</div>
					<div class="meters-row">
					<MomentumTile
						bind:value={data.momentum}
						resetVal={momentumRstV}
						maxVal={momentumMax}
						tooltipText="Your overall advantage or disadvantage on the quest. Build it up through good rolls and smart choices, then burn it at a crucial moment to force a better outcome."
						onchange={(o, n) => logMeter('Momentum', o, n)}
						onreset={doMomentumReset}
					/>
					<ResourceTile
						label="Health"
						bind:value={data.health}
						color="var(--color-health)"
						min={0}
						max={5}
						icon={iconHealth}
						tooltip="Physical condition and readiness"
						onchange={(o, n) => logMeter('Health', o, n)}
					/>
					<ResourceTile
						label="Spirit"
						bind:value={data.spirit}
						color="var(--color-spirit)"
						min={0}
						max={5}
						icon={iconSpirit}
						tooltip="Mental fortitude and morale"
						onchange={(o, n) => logMeter('Spirit', o, n)}
					/>
					<ResourceTile
						label="Supply"
						bind:value={data.supply}
						color="var(--color-supply)"
						min={0}
						max={5}
						icon={iconSupply}
						tooltip="Available provisions and resources"
						onchange={(o, n) => { logMeter('Supply', o, n); onSupplyChange?.(n); }}
					/>
					<ResourceTile
						label="Experience"
						bind:value={data.xp}
						color="var(--color-xp)"
						min={0}
						max={30}
						icon={iconStar}
						tooltip="Accumulated experience that can be spent on assets and other enhancements."
						onchange={(o, n) => logXp(o, n)}
					/>

					</div>
				</div>
			</section>

			<div class="section-divider"></div>

			<!-- Debilities -->
			<section class="char-section">
				<div class="debilities-row-wrapper">
					<div class="debilities-side-label">DEBILITIES</div>
					<div class="debilities-content">
						<DebilitiesSection {data} onchange={logDebility} />
					</div>
				</div>
			</section>

			<div class="section-divider"></div>

			<!-- Bonds & Failures -->
			<section class="char-section tracks-row">
				<div class="track-group">
					<div class="track-label-row">
						<div class="section-label" use:tooltip={"The people and places that give your oath meaning — and remind you what you're fighting for."}>Bonds</div>
						<span class="track-tally">{progressText(data.bonds)}</span>
					</div>
					<div class="track-row">
						<ProgressTrack
							label=""
							bind:value={data.bonds}
							onchange={(o, n) => logTrack('Bonds', o, n)}
						/>
						<div class="track-actions">
							<button class="btn btn-track" onclick={addBond} disabled={data.bonds >= bondsMax}>+</button>
							<button class="btn btn-track" onclick={removeBond} disabled={data.bonds <= 0}>−</button>
						</div>
					</div>
				</div>
				{#if isDelveEnabled()}
					<div class="track-group">
						<div class="track-label-row">
							<div class="section-label" use:tooltip={"Every scar, stumble, and hard lesson etched into your bones, waiting to be redeemed."}>Failures</div>
							<span class="track-tally">{progressText(data.failures)}</span>
						</div>
						<div class="track-row">
							<ProgressTrack
								label=""
								bind:value={data.failures}
								onchange={(o, n) => logTrack('Failures', o, n)}
							/>
							<div class="track-actions">
								<button class="btn btn-track" onclick={addFailure} disabled={data.failures >= failuresMax}>+</button>
								<button class="btn btn-track" onclick={removeFailure} disabled={data.failures <= 0}>−</button>
							</div>
						</div>
					</div>
				{/if}
			</section>

			<div class="section-divider"></div>

			<!-- Vows -->
			<section class="char-section">
				<div class="section-header">
					<div class="section-label">Vows</div>
					<button class="btn" onclick={addVow}>+ Vow</button>
				</div>

				{#if data.vows.length === 0}
					<p class="empty-hint">No vows yet.</p>
				{:else}
					<div class="vows-list">
						{#each data.vows as vow, i (vow.id)}
							<VowCard
								bind:vow={data.vows[i]}
								onDelete={() => removeVow(vow.id)}
							/>
						{/each}
					</div>
				{/if}
			</section>

			<div class="section-divider"></div>

			<!-- Assets -->
			<section class="char-section">
				<AssetsSection bind:assets={data.assets} bind:characterData={data} characterId={character.id} {onOracleLink} />
			</section>

		</div>
	{/if}
</div>

<style>
	/* ---- Card shell ---- */
	.char-card {
		background: var(--bg-card);
		border: 1px solid var(--border);
		border-radius: 5px;
		overflow: hidden;
		box-shadow: inset 0 1px 0 #ffffff04, 0 2px 12px #00000050;
		transition: box-shadow 0.2s;
	}

	/* ---- Collapse button — flat, no border, blends with header bg ---- */
	.collapse-btn {
		background: transparent;
		border: none;
		color: var(--text-dimmer);
		padding: 3px 5px;
		cursor: pointer;
		font-size: 0.6rem;
		line-height: 1;
		flex-shrink: 0;
		border-radius: 3px;
		font-family: inherit;
		transition: color 0.12s;
	}
	.collapse-btn:hover {
		color: var(--text);
		background: transparent;
	}

	/* ---- Header ---- */
	.char-header {
		position: relative;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 12px;
		min-height: 55px;
		background: var(--bg-inset);
		border-bottom: 1px solid var(--border);
	}

	.char-title {
		flex: 1;
		font-family: var(--font-display);
		font-weight: 700;
		font-size: 0.82rem;
		letter-spacing: 0.08em;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--text);
		cursor: text;
	}

	.char-name-input {
		flex: 1;
		font-family: var(--font-display);
		font-weight: 700;
		font-size: 0.82rem;
		letter-spacing: 0.08em;
		background: var(--bg-input);
		border: 1px solid var(--accent);
		border-radius: 4px;
		padding: 2px 6px;
		color: var(--text);
		min-width: 0;
	}

	/* Initiative badge — canonical pill style, floated to far right of header */
	.cs-init-badge {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 2px 7px;
		border-radius: 10px;
		border: 1px solid color-mix(in srgb, currentColor 35%, transparent);
		cursor: pointer;
		transition: opacity 0.15s;
		white-space: nowrap;
		flex-shrink: 0;
		margin-left: auto;
		font-family: var(--font-ui);
		font-size: 0.6rem;
		font-weight: 600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}
	.cs-init-badge:hover { opacity: 0.75; }
	.cs-init-badge :global(svg) { width: 11px; height: 11px; fill: currentColor; flex-shrink: 0; }
	.cs-init-badge--you {
		background: rgba(52, 211, 153, 0.15);
		color: #34d399;
	}
	.cs-init-badge--foe {
		background: rgba(239, 68, 68, 0.10);
		color: #ef4444;
	}

	/* Portrait */
	.portrait-label {
		cursor: pointer;
		flex-shrink: 0;
		transition: opacity 0.12s;
	}
	.portrait-label:hover { opacity: 0.85; }

	.portrait-img {
		width: 38px;
		height: 38px;
		border-radius: 50%;
		object-fit: cover;
		border: 1px solid var(--border-mid);
		display: block;
	}

	.portrait-placeholder {
		width:           38px;
		height:          38px;
		border-radius:   50%;
		border:          1px dashed var(--border-mid);
		display:         flex;
		align-items:     center;
		justify-content: center;
		color:           var(--text-dimmer);
		background:      var(--bg-control);
	}
	.portrait-placeholder :global(svg) {
		width:   20px;
		height:  20px;
		fill:    currentColor;
		opacity: 0.5;
	}

	.portrait-input {
		display: none;
	}

	/* Portrait lightbox on hover */
	.portrait-lightbox {
		position: absolute;
		left: 10px;
		top: calc(100% + 6px);
		z-index: 200;
		background: var(--bg-card);
		border: 2px solid var(--border-mid);
		border-radius: 8px;
		padding: 4px;
		box-shadow: 0 8px 32px #00000080;
		pointer-events: none;
	}

	.portrait-lightbox img {
		width: 200px;
		height: 200px;
		object-fit: cover;
		border-radius: 5px;
		display: block;
	}

	/* Square icon buttons in header — match foe/journey/site 26×26 */
	.char-header .icon-btn {
		width: 26px;
		height: 26px;
		padding: 4px;
		flex-shrink: 0;
	}
	.char-header .icon-btn :global(svg) {
		width: 13px;
		height: 13px;
		fill: currentColor;
	}

	/* ---- Body ---- */
	.char-body {
		padding: 0;
	}

	.char-section {
		padding: 12px var(--page-gutter);
	}

	.section-divider {
		height: 1px;
		background: var(--border);
	}

	.section-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 0;
	}

	/* Identity */
	.identity-fields {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	/* Collapsible background toggle */
	.bg-toggle {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		color: inherit;
	}
	.bg-toggle .section-label {
		margin-bottom: 0;
	}
	.bg-toggle:hover .section-label {
		color: var(--text-accent);
	}
	.bg-toggle-arrow {
		font-size: 0.7rem;
		color: var(--text-dimmer);
		transition: transform 0.15s ease;
		display: inline-block;
	}
	.bg-toggle-arrow--collapsed {
		transform: rotate(-90deg);
	}

	.background-input {
		width: 100%;
		resize: vertical;
		font-family: var(--font-ui);
		font-size: 0.9rem;
		line-height: 1.55;
	}

	/* Read-only markdown display for the background field (click to edit) */
	.background-display {
		width: 100%;
		font-family: var(--font-ui);
		font-size: 0.9rem;
		line-height: 1.55;
		min-height: 3.1rem; /* matches rows="3" at 1.55 line-height */
		padding: 4px 8px;
		border: 1px solid var(--border);
		border-radius: 4px;
		background: var(--bg-control);
		color: var(--text);
		box-sizing: border-box;
		cursor: text;
		transition: border-color 0.12s;
	}
	.background-display:hover,
	.background-display:focus {
		border-color: var(--border-mid);
		outline: none;
	}

	.bg-placeholder {
		color: var(--text-dimmer);
		font-style: italic;
	}

	/* Markdown elements rendered inside the background field */
	.background-display :global(p)       { margin: 0 0 3px; }
	.background-display :global(p:last-child) { margin-bottom: 0; }
	.background-display :global(h3),
	.background-display :global(h4),
	.background-display :global(h5) {
		font-family: var(--font-ui);
		font-size: 0.82rem;
		font-weight: 700;
		letter-spacing: 0.04em;
		color: var(--text-accent);
		margin: 5px 0 2px;
	}
	.background-display :global(ul),
	.background-display :global(ol)  { margin: 2px 0; padding-left: 1.3em; }
	.background-display :global(li)  { margin-bottom: 1px; }
	.background-display :global(strong) { font-weight: 700; color: var(--text); }
	.background-display :global(br)  { display: block; margin-bottom: 3px; content: ''; }

	.flex-1 {
		flex: 1;
	}

	/* Stats */
	.stats-row-wrapper {
		display: flex;
		align-items: center;
		gap: 6px;
		container-type: inline-size;
	}

	.stats-side-label {
		writing-mode: vertical-rl;
		transform: rotate(180deg);
		font-family: var(--font-ui);
		font-size: 0.55rem;
		font-weight: 800;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--text-dimmer);
		flex-shrink: 0;
		align-self: stretch;
		display: flex;
		align-items: center;
		justify-content: center;
		border-left: 1px solid var(--border);
		padding-left: 4px;
	}

	.stats-row {
		display: flex;
		flex-wrap: nowrap;
		align-items: flex-start;
		justify-content: space-between;
		gap: 5px;
		flex: 1;
	}
	/* When the wrapper is wide enough that total gap space ≥ total tile widths,
	   switch to left-align so gaps never exceed the tiles themselves.
	   Crossover: row-width ≥ 540px → wrapper ≥ ~560px (accounts for side-label overhead). */
	@container (min-width: 560px) {
		.stats-row { justify-content: flex-start; }
	}

	/* Vitals wrapper */
	.vitals-row-wrapper {
		display: flex;
		align-items: center;
		gap: 6px;
		container-type: inline-size;
	}

	.vitals-side-label {
		writing-mode: vertical-rl;
		transform: rotate(180deg);
		font-family: var(--font-ui);
		font-size: 0.55rem;
		font-weight: 800;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--text-dimmer);
		flex-shrink: 0;
		align-self: stretch;
		display: flex;
		align-items: center;
		justify-content: center;
		border-left: 1px solid var(--border);
		padding-left: 4px;
	}

	/* Debilities wrapper */
	.debilities-row-wrapper {
		display: flex;
		align-items: flex-start;
		gap: 6px;
	}

	.debilities-side-label {
		writing-mode: vertical-rl;
		transform: rotate(180deg);
		font-family: var(--font-ui);
		font-size: 0.55rem;
		font-weight: 800;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--text-dimmer);
		flex-shrink: 0;
		align-self: stretch;
		display: flex;
		align-items: center;
		justify-content: center;
		border-left: 1px solid var(--border);
		padding-left: 4px;
	}
	.debilities-content {
		flex: 1;
	}

	/* Meters */
	.meters-row {
		display: flex;
		flex-wrap: wrap;
		gap: 14px;
		align-items: stretch;
		justify-content: space-between;
	}
	/* When the wrapper is wide enough that total gap space ≥ total tile widths,
	   switch to left-align so gaps never exceed the tiles themselves.
	   Tiles: 1×90px + 4×80px = 410px total. Crossover: row-width ≥ 820px → wrapper ≥ ~840px. */
	@container (min-width: 840px) {
		.meters-row { justify-content: flex-start; }
	}


	/* Tracks */
	.tracks-row {
		display: flex;
		gap: 10px;
		flex-wrap: wrap;
		justify-content: flex-start;
	}

	.track-group {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.track-label-row {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
	}

	.track-label-row :global(.section-label) {
		margin-bottom: 0;
	}

	.track-tally {
		font-family: var(--font-ui);
		font-size: 0.65rem;
		color: var(--text-dimmer);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	/* Progress track boxes + action buttons in a single row */
	.track-row {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.track-actions {
		display: flex;
		gap: 4px;
		flex-shrink: 0;
	}

	/* Compact button sized to match progress box height (22px) */
	:global(.btn-track) {
		height: 22px;
		padding: 0 7px;
		font-size: 0.68rem;
		line-height: 1;
		min-width: unset;
	}

	/* Vows */
	.vows-list {
		display: flex;
		flex-direction: column;
		gap: 10px;
		margin-top: 6px;
	}

	.empty-hint {
		font-size: 0.8rem;
		color: var(--text-dimmer);
		font-style: italic;
		margin-top: 4px;
	}

	/* Collapsed state */
	.char-card.collapsed .char-header {
		border-bottom: none;
	}


</style>
