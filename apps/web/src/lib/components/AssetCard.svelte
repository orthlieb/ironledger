<script lang="ts">
	/**
	 * AssetCard — displays one owned asset on the character sheet.
	 *
	 * Shows ability checkboxes, optional companion name/health fields,
	 * rarity slot, and a remove button that opens a rules-aware dialog.
	 * All fonts are var(--font-ui) (Roboto) per design spec.
	 */
	import type { CharacterAsset, AssetDefinition } from '$lib/types.js';
	import { findRaritiesForAsset, getGlobalCounterDef } from '$lib/assetStore.svelte.js';
	import { isSourceEnabled } from '$lib/expansionStore.svelte.js';
	import { renderNote } from '$lib/markdown.js';
	import { draggable } from '$lib/actions/draggable.js';
	import { tooltip }   from '$lib/actions/tooltip.js';

	import iconHeart          from '$icons/icon-heart.svg?raw';
	import iconSkull          from '$icons/skull-crossbones-solid-full.svg?raw';
	import iconSword          from '$icons/sword-solid-full.svg?raw';
	import iconShield         from '$icons/shield-halved-solid.svg?raw';
	import iconEye            from '$icons/eye-solid.svg?raw';
	import iconMoon           from '$icons/moon-solid.svg?raw';
	import iconSun            from '$icons/sun-solid.svg?raw';
	import iconDice           from '$icons/dice-d10-light.svg?raw';
	import iconNote           from '$icons/note-sticky-solid.svg?raw';
	import iconSackDollar     from '$icons/sack-dollar-solid-full.svg?raw';
	import iconMana           from '$icons/icon-mana.svg?raw';
	import iconPuppet         from '$icons/puppet-solid.svg?raw';
	import iconGolem          from '$icons/rock-golem.svg?raw';

	/** Canonical short-name → SVG string map for counter badges. */
	const COUNTER_ICONS: Record<string, string> = {
		'heart':                iconHeart,
		'skull-and-crossbones': iconSkull,
		'sword':                iconSword,
		'shield':               iconShield,
		'eye':                  iconEye,
		'moon':                 iconMoon,
		'sun':                  iconSun,
		'dice':                 iconDice,
		'note':                 iconNote,
		'sack-dollar':          iconSackDollar,
		'mana':                 iconMana,
		'puppet':               iconPuppet,
		'rock-golem':           iconGolem,
	};

	let {
		asset          = $bindable(),
		definition,
		characterId,
		characterName,
		characterXp,
		globalValues   = $bindable(),
		mode,
		snapshotAbilities,
		snapshotRarityId,
		purchaseCost   = 0,
		onRemove,
		onOracleLink,
		onCommit,
		onClose,
	}: {
		asset:          CharacterAsset;
		definition:     AssetDefinition;
		characterId:    string;
		characterName:  string;
		characterXp:    number;
		/** Shared counter values for fields with global:true, keyed by field.id.
		 *  Always a draft copy of character.globalValues — parent commits on OK. */
		globalValues?:  Record<string, string>;
		/** 'add' renders an Add footer; 'edit' renders Delete/OK. X close is in
		 *  the header in both modes. */
		mode:           'add' | 'edit';
		/** Snapshot of asset.abilities at dialog open. Used by the affordability
		 *  gate to compute newly-enabled-since-snapshot. */
		snapshotAbilities: boolean[];
		/** Snapshot of asset.rarityId at dialog open. */
		snapshotRarityId?: string;
		/** XP cost charged for the act of acquiring the asset itself (3 in add
		 *  mode, 0 in edit mode). Folded into the affordability check. */
		purchaseCost?:  number;
		onRemove?:      () => void;
		onOracleLink?:  (key: string, stat?: string) => void;
		/** OK (edit mode) and Add (add mode). Parent applies the diff + logs. */
		onCommit?:      () => void;
		/** X close button. Discards the draft without committing. */
		onClose?:       () => void;
	} = $props();

	// Selectable-list item shape used by cantrips (and any future similar lists)
	type SelectableItem = { key: string; name: string; desc: string };

	// Difficulty-factor shape used by Conclave Rituals
	type InspectionFactor  = { key: string; name: string; levels: string[] };
	type InspectionExample = {
		scenario: string;
		factors:  Record<string, { score: number; reason: string }>;
		total:    number;
		resolution: string;
	};

	// Inline markdown-field editing (click-to-edit, mirrors VowCard / CommunityCard pattern).
	// Only one markdown field at a time is in edit mode; tracked by field.id.
	let editingNotesFieldId   = $state<string | null>(null);
	let notesTextareaEl       = $state<HTMLTextAreaElement | null>(null);
	$effect(() => { if (editingNotesFieldId && notesTextareaEl) notesTextareaEl.focus(); });
	let selectionsOpen    = $state(false);
	let factorsOpen       = $state(false);

	const enabledCount = $derived(asset.abilities.filter(Boolean).length);
	const total        = $derived(definition.abilities.length);
	/** All rarities pinned to this asset id, filtered to those visible to the character —
	    a rarity shows if its source's expansion is enabled OR the character already owns it
	    (preserves data when the expansion is disabled). Multiple rarities can share an
	    assetId (e.g. Cutthroat has Dagger of the Blooded + Nemezo); a character may own
	    at most one of them at a time. */
	const visibleRarities = $derived(
		findRaritiesForAsset(asset.assetId)
			.filter(r => isSourceEnabled(r.source) || asset.rarityId === r.id),
	);
	const showRaritySlot = $derived(visibleRarities.length > 0);

	// ── Level-gated ability cap (e.g. Touched assets) ──────────────────────
	/**
	 * Returns the maximum number of abilities the character may enable on this
	 * asset given their current dropdown selections, or Infinity if no cap is
	 * defined. Driven by `definition.abilityMaxByField`.
	 */
	const abilityMax = $derived((): number => {
		const abmf = definition.abilityMaxByField;
		if (!abmf) return Infinity;
		let cap = Infinity;
		for (const [fieldId, levelMap] of Object.entries(abmf)) {
			const currentVal = asset.customValues?.[fieldId] ?? '';
			if (currentVal in levelMap) {
				cap = Math.min(cap, levelMap[currentVal]!);
			}
		}
		return cap;
	});

	// ── Selectable-list support (cantrips, etc.) ─────────────────────────────
	// A definition can carry:
	//   selectableItems: [{key, name, desc}, ...]  — the full pool
	//   selectableSlots: [n, n, ...]               — slots unlocked per ability
	//   selectableLabel: string                    — section heading (default "Known")
	// Cantrips store these under the legacy keys "cantrips" / "cantripSlots".
	const selectableItems = $derived(
		((definition.selectableItems ?? definition.cantrips) as SelectableItem[] | undefined) ?? []
	);
	const selectableSlots = $derived(
		((definition.selectableSlots ?? definition.cantripSlots) as number[] | undefined) ?? []
	);
	const selectableLabel = $derived(
		(definition.selectableLabel as string | undefined) ?? 'Known'
	);
	const totalSlots = $derived(
		selectableSlots.reduce((sum, slots, i) => sum + (asset.abilities[i] ? slots : 0), 0)
	);
	const knownKeys  = $derived(asset.selections ?? []);

	// ── Description field (extended narrative for some Yrt rituals) ──────────
	const assetDescription = $derived(
		(definition.description as string | null | undefined) ?? null
	);

	// ── Difficulty-factors support (Conclave Rituals) ─────────────────────────
	const inspectionFactors = $derived(
		(definition.inspectionFactors as InspectionFactor[] | undefined) ?? []
	);
	const inspectionExample = $derived(
		(definition.inspectionExample as InspectionExample | null | undefined) ?? null
	);

	function toggleSelection(key: string) {
		const cur = asset.selections ?? [];
		if (cur.includes(key)) {
			asset.selections = cur.filter((k) => k !== key);
		} else if (cur.length < totalSlots) {
			asset.selections = [...cur, key];
		}
	}

	/** Returns true when a candidate (abilities, rarityId) state fits inside
	 *  the character's current XP budget given the snapshot baseline. Used to
	 *  gate ability/rarity toggles so the user can't run themselves negative
	 *  inside the dialog. */
	function canAfford(abilities: boolean[], rarityId: string | undefined): boolean {
		let newEnables = 0;
		for (let i = 0; i < abilities.length; i++) {
			if (!snapshotAbilities[i] && abilities[i]) newEnables++;
		}
		let rarityXp = 0;
		if (rarityId !== snapshotRarityId && rarityId) {
			const r = visibleRarities.find((r) => r.id === rarityId);
			if (r) rarityXp = r.xpCost;
		}
		return purchaseCost + newEnables * 2 + rarityXp <= characterXp;
	}


	// Category colour
	const CAT_COLOR: Record<string, string> = {
		'Combat Talent': 'var(--color-iron)',
		'Path':          'var(--color-edge)',
		'Companion':     'var(--color-heart)',
		'Ritual':        'var(--color-mana)',
		'Touched':       'var(--color-touched)',
	};
	const catColor = $derived(CAT_COLOR[definition.category] ?? 'var(--text-muted)');

	/** Find the first counter customField on this asset definition. */
	const counterField = $derived(
		(definition.customFields ?? []).find((f) => f.type === 'counter')
	);

	/** Returns the canonical CustomFieldDef for `cf`. For non-global fields the
	 *  per-asset declaration IS the source of truth. For global fields we use
	 *  the catalogue-wide canonical definition so the cap/default/icon are
	 *  consistent regardless of which asset surfaces the counter. */
	function effectiveCf(cf: import('$lib/types.js').CustomFieldDef): import('$lib/types.js').CustomFieldDef {
		return cf.global ? (getGlobalCounterDef(cf.id) ?? cf) : cf;
	}

	/**
	 * Resolve effective maxValue for a counter field. If maxValue is an array, use the value
	 * at the index of the highest currently-enabled ability.
	 */
	function getEffectiveMax(cf: import('$lib/types.js').CustomFieldDef): number {
		const eff = effectiveCf(cf);
		const mv  = eff.maxValue;
		if (mv === undefined) return 0;
		if (typeof mv === 'number') return mv;
		let lastEnabled = 0;
		for (let i = 0; i < asset.abilities.length; i++) {
			if (asset.abilities[i]) lastEnabled = i;
		}
		return (mv as number[])[Math.min(lastEnabled, (mv as number[]).length - 1)];
	}

	/** Strips markdown-style links [text](anything) → text, for plain-text contexts. */
	function stripMdLinks(raw: string): string {
		return raw.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
	}

	/**
	 * Converts asset ability text (uses \n\n paragraph breaks and
	 * "  * item" list items) into safe HTML.
	 */
	function formatText(raw: string): string {
		return raw
			.split('\n\n')
			.map((para) => {
				const lines = para.split('\n');
				if (lines.some((l) => /^\s*\*\s/.test(l))) {
					const items = lines
						.filter((l) => /^\s*\*\s/.test(l))
						.map((l) => `<li>${l.replace(/^\s*\*\s/, '').trim()}</li>`)
						.join('');
					return `<ul>${items}</ul>`;
				}
				return `<p>${para.trim()}</p>`;
			})
			.join('');
	}

	function toggleAbility(i: number) {
		const enabling = !asset.abilities[i];
		// Level cap: cannot enable more abilities than the current level allows
		if (enabling && enabledCount >= abilityMax()) return;

		const next = [...asset.abilities];
		next[i] = enabling;

		// Budget gate: simulate the toggle and reject if it would push the
		// pending cost above the character's available XP.
		if (enabling && !canAfford(next, asset.rarityId)) return;

		asset.abilities = next;
	}

	function getCounterVal(cf: import('$lib/types.js').CustomFieldDef): number {
		const eff   = effectiveCf(cf);
		const store = cf.global ? globalValues : asset.customValues;
		return parseInt(store?.[cf.id] ?? String(eff.default ?? 0));
	}

	function setCounter(cf: import('$lib/types.js').CustomFieldDef, newVal: number) {
		const old = getCounterVal(cf);
		if (newVal === old) return;
		if (cf.global) {
			if (!globalValues) globalValues = {};
			globalValues[cf.id] = String(newVal);
		} else {
			if (!asset.customValues) asset.customValues = {};
			asset.customValues[cf.id] = String(newVal);
		}
	}

</script>

<div class="asset-card" style="--asset-color: {catColor}">

	<!-- Header. use:draggable makes the header a drag handle when the card
	     is inside a <dialog>; the action is a safe no-op otherwise. -->
	<div class="asset-header" use:draggable>
		<span class="drag-grip" aria-hidden="true">⠿</span>

		<div class="asset-name-group">
			<span class="asset-name">{definition.name}</span>
		</div>

		{#if counterField}
			{@const effCf   = effectiveCf(counterField)}
			{@const curVal  = getCounterVal(counterField)}
			{@const maxVal  = getEffectiveMax(counterField)}
			{@const iconSvg = (effCf.icon && COUNTER_ICONS[effCf.icon]) || iconHeart}
			<span
				class="counter-badge"
				style:--counter-color={catColor}
				use:tooltip={`${counterField.label}: ${curVal} / ${maxVal}`}
			>{@html iconSvg} {curVal}/{maxVal}</span>
		{/if}

		<span class="ability-tally" use:tooltip={`${enabledCount} of ${total} abilities enabled`}>
			{enabledCount}/{total}
		</span>

		{#if onClose}
			<button
				class="asset-close"
				onclick={onClose}
				use:tooltip={'Close'}
				aria-label="Close"
			>✕</button>
		{/if}
	</div>

	<div class="asset-body">
		<div class="asset-cat-row">
			<span class="asset-cat">{definition.category}</span>
		</div>

		<!-- Top custom fields (position !== 'bottom') rendered above preamble -->
			{#each (definition.customFields ?? []).filter(f => f.position !== 'bottom') as field}
				{#if field.type === 'string'}
					<label class="companion-name-label">
						<span class="companion-field-label">{field.label}</span>
						<input
							type="text"
							class="companion-name-input"
							value={asset.customValues?.[field.id] ?? String(field.default ?? '')}
							oninput={(e) => {
								if (!asset.customValues) asset.customValues = {};
								asset.customValues[field.id] = e.currentTarget.value;
							}}
							placeholder={field.placeholder ?? field.label + '…'}
						/>
					</label>
				{:else if field.type === 'dropdown' && field.options}
					<label class="companion-name-label">
						<span class="companion-field-label">{field.label}</span>
						<select
							class="companion-name-input"
							value={asset.customValues?.[field.id] ?? String(field.default ?? '')}
							onchange={(e) => {
								if (!asset.customValues) asset.customValues = {};
								asset.customValues[field.id] = e.currentTarget.value;
								// Enforce level cap: clear abilities beyond the new max
								const abmf = definition.abilityMaxByField;
								if (abmf && field.id in abmf) {
									const newMax = abmf[field.id]![e.currentTarget.value] ?? Infinity;
									const cur = [...asset.abilities];
									let enabled = 0;
									for (let idx = 0; idx < cur.length; idx++) {
										if (cur[idx]) {
											if (enabled < newMax) { enabled++; }
											else { cur[idx] = false; }
										}
									}
									asset.abilities = cur;
								}
							}}
						>
							{#each field.options as opt}
								<option value={opt.id}>{opt.label}</option>
							{/each}
						</select>
					</label>
				{:else if field.type === 'switch'}
					<label class="cf-switch">
						<input
							type="checkbox"
							class="cf-switch-input"
							checked={asset.customValues?.[field.id] === '1'}
							onchange={() => {
								if (!asset.customValues) asset.customValues = {};
								asset.customValues[field.id] = asset.customValues[field.id] === '1' ? '0' : '1';
							}}
						/>
						<span class="cf-switch-track"><span class="cf-switch-knob"></span></span>
						<span class="cf-switch-label">{field.label}</span>
					</label>
				{/if}
			{/each}

			{#if definition.preamble}
				<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
			<p class="asset-preamble"
					onclick={(e) => {
						const link = (e.target as HTMLElement).closest('.oracle-link') as HTMLElement | null;
						if (link) { e.preventDefault(); onOracleLink?.(link.dataset['oracle'] ?? ''); }
					}}
					onkeydown={(e) => {
						if (e.key === 'Enter' || e.key === ' ') {
							const link = (e.target as HTMLElement).closest('.oracle-link') as HTMLElement | null;
							if (link) { e.preventDefault(); onOracleLink?.(link.dataset['oracle'] ?? ''); }
						}
					}}
				>{@html stripMdLinks(definition.preamble)}</p>
			{/if}

			{#if assetDescription}
				<p class="asset-description">{@html assetDescription}</p>
			{/if}

			<div class="abilities-list">
				{#each definition.abilities as ab, i}
					{@const _cap = abilityMax()}
					{@const _atCap = !asset.abilities[i] && enabledCount >= _cap}
					<label
						class="ability-row"
						class:ability-enabled={asset.abilities[i]}
						class:ability-disabled={!asset.abilities[i] && (characterXp < 2 || _atCap)}
						use:tooltip={_atCap ? `Your current level only allows ${_cap} ${_cap === 1 ? 'ability' : 'abilities'} — increase your touched level to unlock more` : ''}
					>
						<input
							type="checkbox"
							class="ability-check"
							checked={asset.abilities[i]}
							disabled={_atCap}
							onchange={() => toggleAbility(i)}
						/>
						<div class="ability-text">
							{#if ab.name}
								<span class="ability-name">{ab.name}.</span>
							{/if}
							{@html formatText(ab.text)}
						</div>
					</label>
				{/each}
			</div>

			<!-- Selectable-list section (cantrips and similar) -->
			{#if selectableItems.length > 0 && totalSlots > 0}
				<div class="selections-section">
					<button
						class="selections-toggle"
						onclick={() => (selectionsOpen = !selectionsOpen)}
						aria-expanded={selectionsOpen}
					>
						<span class="selections-toggle-chevron">{selectionsOpen ? '▼' : '▶'}</span>
						<span class="selections-toggle-label">{selectableLabel}</span>
						<span class="selections-tally">{knownKeys.length}/{totalSlots}</span>
					</button>

					{#if selectionsOpen}
						<div class="selections-list">
							{#each selectableItems as item}
								{@const known    = knownKeys.includes(item.key)}
								{@const disabled = !known && knownKeys.length >= totalSlots}
								<label
									class="selection-row"
									class:selection-known={known}
									class:selection-disabled={disabled}
								>
									<input
										type="checkbox"
										class="selection-check"
										checked={known}
										disabled={disabled}
										onchange={() => { if (!disabled) toggleSelection(item.key); }}
									/>
									<span class="selection-line">
										<span class="selection-name">{item.name}</span>
										<span class="selection-sep"> — </span>
										<span class="selection-desc">{item.desc}</span>
									</span>
								</label>
							{/each}
						</div>
					{/if}
				</div>
			{/if}

			<!-- Difficulty Factors (Conclave Rituals with inspectionFactors) -->
			{#if inspectionFactors.length > 0}
				<div class="factors-section">
					<button
						class="factors-toggle"
						onclick={() => (factorsOpen = !factorsOpen)}
						aria-expanded={factorsOpen}
					>
						<span class="factors-chevron">{factorsOpen ? '▼' : '▶'}</span>
						<span class="factors-toggle-label">Difficulty Factors</span>
						<span class="factors-tally">({inspectionFactors.length} factors)</span>
					</button>

					{#if factorsOpen}
						<div class="factors-body">
							<table class="factors-table">
								<thead>
									<tr>
										<th class="factors-th-name">Factor</th>
										<th class="factors-th-level">0</th>
										<th class="factors-th-level">1</th>
										<th class="factors-th-level">2</th>
									</tr>
								</thead>
								<tbody>
									{#each inspectionFactors as factor}
										<tr class="factors-row">
											<td class="factors-td-name">{factor.name}</td>
											{#each factor.levels as level}
												<td class="factors-td-level">{level}</td>
											{/each}
										</tr>
									{/each}
								</tbody>
							</table>

							{#if inspectionExample}
								<div class="factors-example">
									<p class="factors-example-scenario">
										<span class="factors-example-label">Example:</span>
										{inspectionExample.scenario}
									</p>
									<table class="factors-example-table">
										<thead>
											<tr>
												<th>Factor</th>
												<th>Lvl</th>
												<th>Reason</th>
											</tr>
										</thead>
										<tbody>
											{#each inspectionFactors as factor}
												{@const ex = inspectionExample.factors?.[factor.key]}
												{#if ex !== undefined}
													<tr>
														<td class="factors-ex-name">{factor.name}</td>
														<td class="factors-ex-score">{ex.score}</td>
														<td class="factors-ex-reason">{ex.reason}</td>
													</tr>
												{/if}
											{/each}
										</tbody>
									</table>
									<p class="factors-example-total">
										Total difficulty: <strong>{inspectionExample.total}</strong>
									</p>
									<p class="factors-example-resolution">{inspectionExample.resolution}</p>
								</div>
							{/if}
						</div>
					{/if}
				</div>
			{/if}

			<!-- Bottom custom fields (position: 'bottom') — rendered after abilities -->
			{#each (definition.customFields ?? []).filter(f => f.position === 'bottom') as field}
				{#if field.type === 'counter' && field.maxValue !== undefined}
					{@const maxVal = getEffectiveMax(field)}
					{@const curVal = getCounterVal(field)}
					<div class="counter-row" style:--counter-color={catColor}>
						<span class="companion-field-label">{field.label}</span>
						<div class="counter-pips">
							{#each {length: maxVal} as _, j}
								<button
									class="pip counter-pip"
									class:pip-filled={j < curVal}
									onclick={() => setCounter(field, j < curVal ? j : j + 1)}
									aria-label="{field.label} pip {j + 1}"
								></button>
							{/each}
						</div>
						<span class="health-label">{curVal}/{maxVal}</span>
					</div>
				{:else if field.type === 'radio' && field.options}
					<div class="radio-row">
						{#each field.options as opt}
							<label class="radio-option">
								<input
									type="radio"
									name="radio-{asset.assetId}-{field.id}"
									checked={(asset.customValues?.[field.id] ?? String(field.default ?? '')) === opt.id}
									oninput={() => {
										if (!asset.customValues) asset.customValues = {};
										asset.customValues[field.id] = opt.id;
									}}
								/>
								<span>{opt.label}</span>
							</label>
						{/each}
					</div>
				{:else if field.type === 'string'}
					<label class="companion-name-label">
						<span class="companion-field-label">{field.label}</span>
						<input
							type="text"
							class="companion-name-input"
							value={asset.customValues?.[field.id] ?? String(field.default ?? '')}
							oninput={(e) => {
								if (!asset.customValues) asset.customValues = {};
								asset.customValues[field.id] = e.currentTarget.value;
							}}
							placeholder={field.placeholder ?? field.label + '…'}
						/>
					</label>
				{:else if field.type === 'dropdown' && field.options}
					<label class="companion-name-label">
						<span class="companion-field-label">{field.label}</span>
						<select
							class="companion-name-input"
							value={asset.customValues?.[field.id] ?? String(field.default ?? '')}
							onchange={(e) => {
								if (!asset.customValues) asset.customValues = {};
								asset.customValues[field.id] = e.currentTarget.value;
								// Enforce level cap: clear abilities beyond the new max
								const abmf = definition.abilityMaxByField;
								if (abmf && field.id in abmf) {
									const newMax = abmf[field.id]![e.currentTarget.value] ?? Infinity;
									const cur = [...asset.abilities];
									let enabled = 0;
									for (let idx = 0; idx < cur.length; idx++) {
										if (cur[idx]) {
											if (enabled < newMax) { enabled++; }
											else { cur[idx] = false; }
										}
									}
									asset.abilities = cur;
								}
							}}
						>
							{#each field.options as opt}
								<option value={opt.id}>{opt.label}</option>
							{/each}
						</select>
					</label>
				{:else if field.type === 'switch'}
					<label class="cf-switch">
						<input
							type="checkbox"
							class="cf-switch-input"
							checked={asset.customValues?.[field.id] === '1'}
							onchange={() => {
								if (!asset.customValues) asset.customValues = {};
								asset.customValues[field.id] = asset.customValues[field.id] === '1' ? '0' : '1';
							}}
						/>
						<span class="cf-switch-track"><span class="cf-switch-knob"></span></span>
						<span class="cf-switch-label">{field.label}</span>
					</label>
				{:else if field.type === 'markdown'}
					{@const editing = editingNotesFieldId === field.id}
					{@const value   = asset.customValues?.[field.id] ?? ''}
					{@const placeholder = field.placeholder ?? 'Notes… (**bold**, *italic*, # heading, - list)'}
					<div class="asset-notes-row">
						<span class="asset-notes-label">{field.label}</span>
						{#if editing}
							<textarea
								bind:this={notesTextareaEl}
								class="asset-notes-textarea"
								value={value}
								oninput={(e) => {
									if (!asset.customValues) asset.customValues = {};
									asset.customValues[field.id] = (e.target as HTMLTextAreaElement).value;
								}}
								onblur={() => (editingNotesFieldId = null)}
								{placeholder}
								rows="3"
							></textarea>
						{:else}
							<!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
							<div
								class="asset-notes-display"
								class:asset-notes-display--empty={!value.trim()}
								role="button"
								tabindex="0"
								use:tooltip={'Click to edit'}
								onclick={() => (editingNotesFieldId = field.id)}
								onkeydown={(e) => { if (e.key === 'Enter') editingNotesFieldId = field.id; }}
							>
								{#if value.trim()}
									{@html renderNote(value)}
								{:else}
									<span class="asset-notes-placeholder">{placeholder}</span>
								{/if}
							</div>
						{/if}
					</div>
				{/if}
			{/each}

			<!-- Rarity slot — multiple rarities may exist per asset; exclusive (at most one owned). -->
			{#if showRaritySlot}
				<div class="rarity-section">
					{#each visibleRarities as rarity (rarity.id)}
						{@const isChecked = asset.rarityId === rarity.id}
						{@const ownsAnother = !!asset.rarityId && !isChecked}
						{@const cantAfford = !isChecked && !canAfford(asset.abilities, rarity.id)}
						{@const disabled = ownsAnother || cantAfford}
						<label
							class="rarity-label"
							class:rarity-label--locked={ownsAnother}
							use:tooltip={ownsAnother ? 'Uncheck the current rarity first' : ''}
						>
							<input
								type="checkbox"
								class="rarity-check"
								checked={isChecked}
								{disabled}
								onchange={() => {
									if (disabled) return;
									asset.rarityId = isChecked ? undefined : rarity.id;
								}}
							/>
							<span class="rarity-name">RARITY: {rarity.name}</span>
							<span class="rarity-cost">({rarity.xpCost} XP)</span>
						</label>
						{#if isChecked}
							<p class="rarity-desc">{rarity.description}</p>
						{/if}
					{/each}
				</div>
			{/if}

		{#if definition.postamble}
			<p class="asset-postamble">{definition.postamble}</p>
		{/if}
	</div>

	{#if mode === 'edit'}
		<!-- Edit-mode footer — Delete on the left, OK on the right. X close
		     in the header discards the draft; OK fires onCommit and the
		     parent applies the diff. -->
		<div class="asset-footer">
			<button
				class="btn btn-danger asset-footer-btn"
				onclick={onRemove}
				aria-label="Delete {definition.name}"
			>Delete</button>
			<button class="btn btn-primary asset-footer-btn" onclick={onCommit}>OK</button>
		</div>
	{:else}
		<!-- Add-mode footer — single Add button on the right. X close discards. -->
		<div class="asset-footer asset-footer--add">
			<button class="btn btn-primary asset-footer-btn" onclick={onCommit}>Add</button>
		</div>
	{/if}

</div>

<style>
	.asset-card {
		background: var(--bg-inset);
		border: 1px solid var(--border);
		border-left: 3px solid var(--asset-color, var(--text-muted));
		border-radius: 6px;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	/* ---- Header ---- */
	.asset-header {
		display: flex;
		align-items: center;
		gap: 7px;
		padding: 7px 10px;
		background: var(--bg-control);
	}


	.asset-name-group {
		flex: 1;
		display: flex;
		align-items: baseline;
		gap: 8px;
		min-width: 0;
		overflow: hidden;
	}

	.asset-name {
		font-family:    var(--font-display);
		font-size:      calc(0.82rem * var(--font-display-scale));
		font-weight:    var(--font-display-weight);
		font-variant:   var(--font-display-variant);
		letter-spacing: 0.04em;
		color:          var(--text);
		white-space:    nowrap;
		overflow:       hidden;
		text-overflow:  ellipsis;
	}

	.asset-cat-row {
		display: flex;
		align-items: center;
	}

	.asset-cat {
		font-family: var(--font-ui);
		font-size: 0.6rem;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		white-space: nowrap;
		color: var(--asset-color, var(--text-muted));
	}

	.counter-badge {
		display: flex;
		align-items: center;
		gap: 3px;
		font-family: var(--font-ui);
		font-size: 0.72rem;
		font-weight: 700;
		color: var(--counter-color);
		flex-shrink: 0;
		font-variant-numeric: tabular-nums;
		letter-spacing: 0.02em;
	}
	.counter-badge :global(svg) {
		width: 11px;
		height: 11px;
		fill: var(--counter-color);
		flex-shrink: 0;
	}
	.counter-badge :global(svg) :global(*) {
		fill: var(--counter-color);
	}

	.ability-tally {
		font-family: var(--font-ui);
		font-size: 0.68rem;
		color: var(--text-dimmer);
		flex-shrink: 0;
		font-variant-numeric: tabular-nums;
	}

	/* ---- Expanded body ---- */
	.asset-body {
		padding: 10px 12px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	/* ---- Dialog-mode footer ---- */
	.asset-footer {
		display: flex;
		gap: 8px;
		justify-content: space-between;
		padding: 10px 12px;
		border-top: 1px solid var(--border);
		background: var(--bg-control);
	}
	/* Add mode has a single button — anchor it to the right edge instead of
	   getting the space-between default (which would left-align it). */
	.asset-footer--add { justify-content: flex-end; }
	/* Same minimum width on every footer button so OK / Delete / Add all
	   render the same physical size regardless of label length. */
	.asset-footer-btn {
		min-width:       70px;
		justify-content: center;
	}

	/* ---- Dialog-mode X close button (upper right of header) ---- */
	.asset-close {
		background:    transparent;
		border:        none;
		color:         var(--text-dimmer);
		cursor:        pointer;
		font-size:     0.9rem;
		padding:       2px 5px;
		border-radius: 3px;
		line-height:   1;
		font-family:   inherit;
		flex-shrink:   0;
		transition:    color 0.12s, background 0.12s;
	}
	.asset-close:hover {
		color:      var(--text);
		background: var(--bg-hover);
	}

	.asset-preamble {
		font-family: var(--font-ui);
		font-size: 0.78rem;
		font-style: italic;
		color: var(--text-muted);
		line-height: 1.4;
		margin: 0;
	}

	.asset-preamble :global(a.oracle-link) {
		color: var(--text-accent);
		text-decoration: underline;
		cursor: pointer;
	}
	.asset-preamble :global(a.oracle-link:hover) {
		opacity: 0.8;
	}

	.asset-description {
		font-family: var(--font-ui);
		font-size: 0.75rem;
		color: var(--text-muted);
		line-height: 1.45;
		margin: 0;
	}
	/* description may contain HTML bold/links */
	.asset-description :global(b),
	.asset-description :global(strong) { color: var(--text); }
	.asset-description :global(br)     { display: block; margin-bottom: 0.4em; content: ''; }

	/* ---- Ability rows ---- */
	.abilities-list {
		display: flex;
		flex-direction: column;
		gap: 7px;
	}

	.ability-row {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		cursor: pointer;
		padding: 6px 8px;
		border-radius: 4px;
		border: 1px solid var(--border);
		background: var(--bg);
		transition: border-color 0.12s, background 0.12s;
	}
	.ability-row:hover {
		border-color: var(--border-mid);
	}
	.ability-row.ability-enabled {
		border-color: color-mix(in srgb, var(--asset-color, var(--text-accent)) 35%, transparent);
		background: color-mix(in srgb, var(--asset-color, var(--text-accent)) 5%, var(--bg));
	}
	.ability-row.ability-disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}

	.ability-check {
		margin-top: 2px;
		flex-shrink: 0;
		accent-color: var(--asset-color, var(--text-accent));
		width: 13px;
		height: 13px;
		pointer-events: none;
	}

	.ability-text {
		flex: 1;
		font-family: var(--font-ui);
		font-size: 0.78rem;
		color: var(--text-muted);
		line-height: 1.45;
	}
	.ability-row.ability-enabled .ability-text {
		color: var(--text);
	}

	/* Global since formatText() generates raw HTML */
	.ability-text :global(p)  { margin: 0 0 4px; }
	.ability-text :global(p:last-child) { margin-bottom: 0; }
	.ability-text :global(ul) { margin: 4px 0 0; padding-left: 1.2em; }
	.ability-text :global(li) { margin-bottom: 2px; }

	.ability-name {
		font-weight: 700;
		color: var(--text);
		margin-right: 2px;
	}

	/* ---- Difficulty Factors (Conclave Rituals) ---- */
	.factors-section {
		display: flex;
		flex-direction: column;
		border: 1px solid color-mix(in srgb, var(--color-mana) 25%, transparent);
		border-radius: 5px;
		overflow: hidden;
		background: color-mix(in srgb, var(--color-mana) 4%, var(--bg-inset));
	}

	.factors-toggle {
		display: flex;
		align-items: center;
		gap: 7px;
		width: 100%;
		padding: 6px 10px;
		background: transparent;
		border: none;
		cursor: pointer;
		text-align: left;
		font-family: var(--font-ui);
		transition: background 0.12s;
	}
	.factors-toggle:hover {
		background: color-mix(in srgb, var(--color-mana) 8%, transparent);
	}

	.factors-chevron {
		font-size: 0.5rem;
		color: var(--text-dimmer);
		flex-shrink: 0;
	}

	.factors-toggle-label {
		flex: 1;
		font-size: 0.72rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--color-mana);
	}

	.factors-tally {
		font-size: 0.7rem;
		font-variant-numeric: tabular-nums;
		color: var(--text-dimmer);
	}

	.factors-body {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 6px 10px 10px;
		border-top: 1px solid color-mix(in srgb, var(--color-mana) 18%, transparent);
	}

	/* Main factors reference table */
	.factors-table {
		width: 100%;
		border-collapse: collapse;
		font-family: var(--font-ui);
		font-size: 0.72rem;
		table-layout: fixed;
	}

	.factors-table thead tr {
		background: color-mix(in srgb, var(--color-mana) 10%, var(--bg-inset));
	}

	.factors-th-name {
		text-align: left;
		padding: 4px 6px;
		font-weight: 700;
		color: var(--color-mana);
		letter-spacing: 0.04em;
		width: 22%;
		border-bottom: 1px solid color-mix(in srgb, var(--color-mana) 20%, transparent);
	}

	.factors-th-level {
		text-align: center;
		padding: 4px 4px;
		font-weight: 700;
		color: var(--color-mana);
		letter-spacing: 0.04em;
		width: 26%;
		border-bottom: 1px solid color-mix(in srgb, var(--color-mana) 20%, transparent);
	}

	.factors-row:nth-child(even) {
		background: color-mix(in srgb, var(--color-mana) 5%, transparent);
	}

	.factors-td-name {
		padding: 4px 6px;
		font-weight: 600;
		color: var(--text);
		vertical-align: top;
		border-bottom: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
	}

	.factors-td-level {
		padding: 4px 5px;
		color: var(--text-muted);
		vertical-align: top;
		line-height: 1.4;
		border-bottom: 1px solid color-mix(in srgb, var(--border) 40%, transparent);
		border-left: 1px solid color-mix(in srgb, var(--border) 40%, transparent);
		font-size: 0.68rem;
	}

	/* Example subsection */
	.factors-example {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 8px 8px;
		background: color-mix(in srgb, var(--bg-card) 50%, var(--bg-inset));
		border-radius: 4px;
		border: 1px solid color-mix(in srgb, var(--border) 50%, transparent);
	}

	.factors-example-label {
		font-weight: 700;
		color: var(--text-muted);
		margin-right: 4px;
	}

	.factors-example-scenario {
		font-family: var(--font-ui);
		font-size: 0.73rem;
		color: var(--text-muted);
		line-height: 1.4;
		margin: 0;
		font-style: italic;
	}

	/* Example breakdown table */
	.factors-example-table {
		width: 100%;
		border-collapse: collapse;
		font-family: var(--font-ui);
		font-size: 0.68rem;
		table-layout: fixed;
	}

	.factors-example-table thead tr {
		background: color-mix(in srgb, var(--border) 30%, transparent);
	}

	.factors-example-table th {
		padding: 3px 5px;
		text-align: left;
		font-weight: 600;
		color: var(--text-dimmer);
		letter-spacing: 0.03em;
		border-bottom: 1px solid color-mix(in srgb, var(--border) 50%, transparent);
	}

	.factors-example-table th:nth-child(2) { width: 32px; text-align: center; }
	.factors-example-table th:nth-child(1) { width: 28%; }

	.factors-ex-name {
		padding: 3px 5px;
		color: var(--text);
		font-weight: 600;
		vertical-align: top;
		border-bottom: 1px solid color-mix(in srgb, var(--border) 30%, transparent);
	}

	.factors-ex-score {
		padding: 3px 5px;
		text-align: center;
		font-weight: 700;
		color: var(--color-mana);
		font-variant-numeric: tabular-nums;
		vertical-align: top;
		border-bottom: 1px solid color-mix(in srgb, var(--border) 30%, transparent);
	}

	.factors-ex-reason {
		padding: 3px 5px;
		color: var(--text-muted);
		vertical-align: top;
		line-height: 1.35;
		border-bottom: 1px solid color-mix(in srgb, var(--border) 30%, transparent);
	}

	.factors-example-total {
		font-family: var(--font-ui);
		font-size: 0.72rem;
		color: var(--text-muted);
		margin: 0;
	}
	.factors-example-total :global(strong) {
		color: var(--color-mana);
		font-weight: 700;
	}

	.factors-example-resolution {
		font-family: var(--font-ui);
		font-size: 0.71rem;
		color: var(--text-muted);
		line-height: 1.45;
		margin: 0;
		font-style: italic;
		border-top: 1px solid color-mix(in srgb, var(--border) 40%, transparent);
		padding-top: 5px;
	}


	.companion-name-label {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.companion-field-label {
		font-family: var(--font-ui);
		font-size: 0.72rem;
		color: var(--text-muted);
		white-space: nowrap;
		min-width: 36px;
	}

	.companion-name-input {
		flex: 1;
		font-family: var(--font-ui);
		font-size: 0.82rem;
		padding: 3px 7px;
	}


	.radio-row {
		display: flex;
		gap: 12px;
		margin-top: 4px;
	}

	.radio-option {
		display: flex;
		align-items: center;
		gap: 5px;
		font-family: var(--font-ui);
		font-size: 0.82rem;
		cursor: pointer;
		white-space: nowrap;
	}

	.radio-option input[type="radio"] {
		accent-color: var(--color-accent);
		cursor: pointer;
	}

	.counter-row {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-top: 4px;
	}

	.counter-pips {
		display: flex;
		gap: 3px;
		flex-wrap: wrap;
	}

	.pip.counter-pip.pip-filled {
		background: var(--counter-color);
		border-color: var(--counter-color);
	}
	.pip.counter-pip:hover {
		border-color: var(--counter-color);
	}


	.pip {
		width: 14px;
		height: 14px;
		border-radius: 50%;
		border: 1.5px solid var(--border-mid);
		background: transparent;
		cursor: pointer;
		padding: 0;
		transition: background 0.1s, border-color 0.1s;
	}
	.pip.pip-filled {
		background: var(--color-heart);
		border-color: var(--color-heart);
	}
	.pip:hover {
		border-color: var(--color-heart);
	}

	.health-label {
		font-family: var(--font-ui);
		font-size: 0.72rem;
		color: var(--text-dimmer);
		font-variant-numeric: tabular-nums;
	}

	/* ---- Selectable-list (cantrips etc.) ---- */
	.selections-section {
		display: flex;
		flex-direction: column;
		gap: 0;
		border: 1px solid color-mix(in srgb, var(--color-mana) 25%, transparent);
		border-radius: 5px;
		overflow: hidden;
		background: color-mix(in srgb, var(--color-mana) 4%, var(--bg-inset));
	}

	.selections-toggle {
		display: flex;
		align-items: center;
		gap: 7px;
		width: 100%;
		padding: 6px 10px;
		background: transparent;
		border: none;
		cursor: pointer;
		text-align: left;
		font-family: var(--font-ui);
		transition: background 0.12s;
	}
	.selections-toggle:hover {
		background: color-mix(in srgb, var(--color-mana) 8%, transparent);
	}

	.selections-toggle-chevron {
		font-size: 0.5rem;
		color: var(--text-dimmer);
		flex-shrink: 0;
	}

	.selections-toggle-label {
		flex: 1;
		font-size: 0.72rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--color-mana);
	}

	.selections-tally {
		font-size: 0.7rem;
		font-variant-numeric: tabular-nums;
		color: var(--text-dimmer);
	}

	.selections-list {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 4px 8px 8px;
		border-top: 1px solid color-mix(in srgb, var(--color-mana) 18%, transparent);
	}

	.selection-row {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		padding: 4px 6px;
		border-radius: 3px;
		cursor: pointer;
		transition: background 0.1s;
	}
	.selection-row:hover:not(.selection-disabled) {
		background: color-mix(in srgb, var(--color-mana) 8%, transparent);
	}
	.selection-row.selection-known {
		background: color-mix(in srgb, var(--color-mana) 10%, transparent);
	}
	.selection-row.selection-disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}

	.selection-check {
		margin-top: 2px;
		flex-shrink: 0;
		accent-color: var(--color-mana);
		width: 12px;
		height: 12px;
		pointer-events: none;
	}

	.selection-line {
		flex: 1;
		font-family: var(--font-ui);
		font-size: 0.78rem;
		line-height: 1.4;
	}

	.selection-name {
		font-weight: 600;
		color: var(--text);
	}

	.selection-sep {
		color: var(--text-dimmer);
	}

	.selection-desc {
		color: var(--text-muted);
	}

	/* ---- Rarity slot ---- */
	.rarity-section {
		display: flex;
		flex-direction: column;
		gap: 5px;
		padding: 7px 9px;
		background: color-mix(in srgb, var(--text-accent) 5%, var(--bg-inset));
		border: 1px solid color-mix(in srgb, var(--text-accent) 20%, transparent);
		border-radius: 5px;
	}

	.rarity-label {
		display: flex;
		align-items: center;
		gap: 7px;
		cursor: pointer;
	}
	.rarity-label--locked {
		opacity: 0.45;
		cursor: not-allowed;
	}

	.rarity-check {
		flex-shrink: 0;
		accent-color: var(--text-accent);
		width: 13px;
		height: 13px;
		pointer-events: none;
	}

	.rarity-name {
		font-family: var(--font-ui);
		font-size: 0.78rem;
		font-weight: 600;
		color: var(--text);
	}

	.rarity-cost {
		font-family: var(--font-ui);
		font-size: 0.7rem;
		color: var(--text-dimmer);
	}

	.rarity-desc {
		font-family: var(--font-ui);
		font-size: 0.75rem;
		color: var(--text-muted);
		line-height: 1.45;
		margin: 0;
		padding-left: 20px; /* align with text after checkbox */
		font-style: italic;
	}

	/* ---- Postamble ---- */
	.asset-postamble {
		font-family: var(--font-ui);
		font-size: 0.75rem;
		font-style: italic;
		color: var(--text-dimmer);
		line-height: 1.4;
		margin: 0;
		border-top: 1px solid var(--border);
		padding-top: 7px;
	}


	/* ---- Custom field switch (boolean toggle, same style as DebilitiesSection) ---- */
	.cf-switch {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		cursor: pointer;
		user-select: none;
	}

	.cf-switch-input {
		position: absolute;
		opacity: 0;
		width: 0;
		height: 0;
		pointer-events: none;
	}

	.cf-switch-track {
		position:      relative;
		width:         28px;
		height:        15px;
		border-radius: 8px;
		background:    var(--bg-inset);
		border:        1px solid var(--border);
		flex-shrink:   0;
		transition:    background 0.2s, border-color 0.2s;
	}

	.cf-switch-knob {
		position:      absolute;
		top:           2px;
		left:          2px;
		width:         9px;
		height:        9px;
		border-radius: 50%;
		background:    var(--text-dimmer);
		transition:    left 0.2s, background 0.2s;
	}

	.cf-switch:has(.cf-switch-input:checked) .cf-switch-track {
		background:   color-mix(in srgb, var(--text-accent) 20%, transparent);
		border-color: var(--text-accent);
	}
	.cf-switch:has(.cf-switch-input:checked) .cf-switch-knob {
		left:       15px;
		background: var(--text-accent);
	}

	.cf-switch-label {
		font-family: var(--font-ui);
		font-size:   0.75rem;
		color:       var(--text-muted);
		white-space: nowrap;
	}

	/* ---- Markdown notes custom field (click-to-edit) ---- */
	.asset-notes-row {
		display:        flex;
		flex-direction: column;
		gap:            3px;
	}
	.asset-notes-label {
		font-family: var(--font-ui);
		font-size:   0.72rem;
		color:       var(--text-muted);
	}
	.asset-notes-textarea {
		font-family:   var(--font-ui);
		font-size:     0.78rem;
		background:    var(--bg);
		border:        1px solid var(--border);
		border-radius: 4px;
		color:         var(--text);
		padding:       4px 7px;
		outline:       none;
		resize:        vertical;
		min-height:    54px;
		width:         100%;
	}
	.asset-notes-textarea:focus { border-color: var(--focus-ring, #E8A13B); }
	.asset-notes-display {
		font-family:   var(--font-ui);
		font-size:     0.78rem;
		line-height:   1.55;
		background:    var(--bg);
		border:        1px solid var(--border);
		border-radius: 4px;
		color:         var(--text);
		padding:       4px 7px;
		cursor:        text;
		min-height:    32px;
		width:         100%;
		transition:    border-color 0.12s;
	}
	.asset-notes-display:hover,
	.asset-notes-display:focus { border-color: var(--border-mid); outline: none; }
	.asset-notes-placeholder {
		font-style: italic;
		color:      var(--text-dimmer);
	}
	.asset-notes-display :global(p)            { margin: 0 0 2px; }
	.asset-notes-display :global(p:last-child) { margin-bottom: 0; }
	.asset-notes-display :global(h3),
	.asset-notes-display :global(h4),
	.asset-notes-display :global(h5) {
		font-size:      0.76rem;
		font-weight:    700;
		letter-spacing: 0.04em;
		color:          var(--text-accent);
		margin:         4px 0 1px;
	}
	.asset-notes-display :global(ul),
	.asset-notes-display :global(ol)  { margin: 1px 0; padding-left: 1.2em; }
	.asset-notes-display :global(li)  { margin-bottom: 1px; }
	.asset-notes-display :global(strong) { font-weight: 700; color: var(--text); }
	.asset-notes-display :global(em)     { font-style: italic; }
	.asset-notes-display :global(br)  { display: block; margin-bottom: 2px; content: ''; }
</style>
