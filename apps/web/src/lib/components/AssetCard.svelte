<script lang="ts">
	/**
	 * AssetCard — displays one owned asset on the character sheet.
	 *
	 * Shows ability checkboxes, optional companion name/health fields,
	 * rarity slot, and a remove button that opens a rules-aware dialog.
	 * All fonts are var(--font-ui) (Roboto) per design spec.
	 */
	import type { CharacterAsset, AssetDefinition } from '$lib/types.js';
	import { findRarityForAsset } from '$lib/assetStore.svelte.js';
	import { appendLog, SESSION_LOG_ID } from '$lib/log.svelte.js';
	import trashSvg from '$icons/trash-solid-full.svg?raw';

	let {
		asset      = $bindable(),
		definition,
		characterId,
		characterName,
		characterXp,
		onRemove,
	}: {
		asset:         CharacterAsset;
		definition:    AssetDefinition;
		characterId:   string;
		characterName: string;
		characterXp:   number;
		onRemove:      () => void;
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

	let collapsed         = $state(true);
	let removeDialogEl    = $state<HTMLDialogElement | null>(null);
	let selectionsOpen    = $state(false);
	let factorsOpen       = $state(false);

	const enabledCount = $derived(asset.abilities.filter(Boolean).length);
	const total        = $derived(definition.abilities.length);
	const rarity       = $derived(findRarityForAsset(asset.assetId));

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
		const cur  = asset.selections ?? [];
		const item = selectableItems.find((it) => it.key === key);
		if (cur.includes(key)) {
			asset.selections = cur.filter((k) => k !== key);
			appendLog(SESSION_LOG_ID, logTitle,
				`<div>${selectableLabel} forgotten: <strong>${item?.name ?? key}</strong> (${definition.name})</div>`);
		} else if (cur.length < totalSlots) {
			asset.selections = [...cur, key];
			appendLog(SESSION_LOG_ID, logTitle,
				`<div>${selectableLabel} learned: <strong>${item?.name ?? key}</strong> (${definition.name})</div>`);
		}
	}

	// XP earned when removing via "Learn From Your Failures" (2 per marked ability, min 1)
	const removeXp         = $derived(Math.max(1, enabledCount * 2));
	// XP earned when a companion is killed / bond ended (1 per marked ability, min 1)
	const companionRemoveXp = $derived(Math.max(1, enabledCount));

	// Category colour
	const CAT_COLOR: Record<string, string> = {
		'Combat Talent': 'var(--color-iron)',
		'Path':          'var(--color-edge)',
		'Companion':     'var(--color-heart)',
		'Ritual':        'var(--color-mana)',
		'Touched':       'var(--color-touched)',
	};
	const catColor = $derived(CAT_COLOR[definition.category] ?? 'var(--text-muted)');

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

	// Shared log title for all asset events on this card
	const logTitle = $derived(`${characterName} — Assets`);

	function toggleAbility(i: number) {
		const enabling = !asset.abilities[i];
		// XP gate: enabling a new ability costs 2 XP
		if (enabling && characterXp < 2) return;

		const next = [...asset.abilities];
		next[i] = enabling;
		asset.abilities = next;

		if (enabling) {
			const entryId = crypto.randomUUID();
			const xpLink  = `<a class="xp-cost-link" data-entry-id="${entryId}" data-cost="2" data-char-id="${characterId}" href="#">−2 experience</a>`;
			appendLog(SESSION_LOG_ID, logTitle,
				`<div>Ability: <strong>${definition.name}</strong> #${i + 1} — <strong>enabled</strong> ${xpLink}</div>`,
				entryId);
		} else {
			appendLog(SESSION_LOG_ID, logTitle,
				`<div>Ability: <strong>${definition.name}</strong> #${i + 1} — <strong>disabled</strong></div>`);
		}
	}

	function setCompanionHealth(newVal: number) {
		const old = asset.companionHealth ?? 0;
		if (newVal === old) return;
		asset.companionHealth = newVal;
		const label = asset.companionName
			? `${asset.companionName} (${definition.name})`
			: definition.name;
		appendLog(SESSION_LOG_ID, logTitle,
			`<div><strong>${label}</strong> Health: ${old} → <strong>${newVal}</strong></div>`);
	}

	function openRemoveDialog() {
		removeDialogEl?.showModal();
	}

	function confirmRemove() {
		removeDialogEl?.close();
		appendLog(SESSION_LOG_ID, logTitle,
			`<div>Asset removed: <strong>${definition.name}</strong> (${definition.category}, ${enabledCount} marked)</div>`);
		onRemove();
	}
</script>

<div class="asset-card">

	<!-- Collapsed header row -->
	<div class="asset-header">
		<button
			class="collapse-btn"
			onclick={() => (collapsed = !collapsed)}
			aria-label={collapsed ? 'Expand asset' : 'Collapse asset'}
			title={collapsed ? 'Expand' : 'Collapse'}
		>{collapsed ? '▶' : '▼'}</button>

		<div class="asset-name-group">
			<span class="asset-name">{definition.name}</span>
			<span class="asset-cat" style:color={catColor}>{definition.category}</span>
		</div>

		{#if definition.companionHealthMax !== undefined}
			<span
				class="companion-health-badge"
				title="{asset.companionName || 'Companion'} health: {asset.companionHealth ?? 0} / {definition.companionHealthMax}"
			>♥ {asset.companionHealth ?? 0}/{definition.companionHealthMax}</span>
		{/if}

		<span class="ability-tally" title="{enabledCount} of {total} abilities enabled">
			{enabledCount}/{total}
		</span>

		<button
			class="btn btn-icon icon-btn btn-remove"
			onclick={openRemoveDialog}
			title="Remove asset"
			aria-label="Remove {definition.name}"
		>{@html trashSvg}</button>
	</div>

	<!-- Expanded body -->
	{#if !collapsed}
		<div class="asset-body">
			{#if definition.preamble}
				<p class="asset-preamble">{definition.preamble}</p>
			{/if}

			{#if assetDescription}
				<p class="asset-description">{@html assetDescription}</p>
			{/if}

			<div class="abilities-list">
				{#each definition.abilities as ab, i}
					<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
					<label
						class="ability-row"
						class:ability-enabled={asset.abilities[i]}
					>
						<input
							type="checkbox"
							class="ability-check"
							checked={asset.abilities[i]}
							disabled={!asset.abilities[i] && characterXp < 2}
							title={!asset.abilities[i] && characterXp < 2 ? "Requires 2 XP to enable" : undefined}
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
										{disabled}
										onchange={() => toggleSelection(item.key)}
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

			<!-- Companion-specific fields -->
			{#if definition.companionHealthMax !== undefined}
				<div class="companion-fields">
					<label class="companion-name-label">
						<span class="companion-field-label">Name</span>
						<input
							type="text"
							bind:value={asset.companionName}
							placeholder="Companion name…"
							class="companion-name-input"
						/>
					</label>
					<div class="companion-health-row">
						<span class="companion-field-label">Health</span>
						<div class="health-pips">
							{#each Array(definition.companionHealthMax) as _, j}
								<button
									class="pip"
									class:pip-filled={j < (asset.companionHealth ?? 0)}
									onclick={() => {
										const cur = asset.companionHealth ?? 0;
										setCompanionHealth(j < cur ? j : j + 1);
									}}
									aria-label="Health pip {j + 1}"
								></button>
							{/each}
						</div>
						<span class="health-label">
							{asset.companionHealth ?? 0}/{definition.companionHealthMax}
						</span>
					</div>
				</div>
			{/if}

			<!-- Rarity slot -->
			{#if rarity}
				<div class="rarity-section">
					<label class="rarity-label">
						<input
							type="checkbox"
							class="rarity-check"
							checked={asset.rarityId === rarity.id}
							disabled={asset.rarityId !== rarity.id && characterXp < rarity.xpCost}
							title={asset.rarityId !== rarity.id && characterXp < rarity.xpCost ? `Requires ${rarity.xpCost} XP to unlock` : undefined}
							onchange={(e) => {
								const checked = (e.target as HTMLInputElement).checked;
								asset.rarityId = checked ? rarity.id : undefined;
								if (checked) {
									const entryId = crypto.randomUUID();
									const xpLink  = `<a class="xp-cost-link" data-entry-id="${entryId}" data-cost="${rarity.xpCost}" data-char-id="${characterId}" href="#">−${rarity.xpCost} experience</a>`;
									appendLog(SESSION_LOG_ID, logTitle,
										`<div>Rarity acquired: <strong>RARITY: ${rarity.name}</strong> for <strong>${definition.name}</strong> ${xpLink}</div>`,
										entryId);
								} else {
									appendLog(SESSION_LOG_ID, logTitle,
										`<div>Rarity removed: <strong>RARITY: ${rarity.name}</strong> from <strong>${definition.name}</strong></div>`);
								}
							}}
						/>
						<span class="rarity-name">RARITY: {rarity.name}</span>
						<span class="rarity-cost">({rarity.xpCost} XP)</span>
					</label>
					{#if asset.rarityId === rarity.id}
						<p class="rarity-desc">{rarity.description}</p>
					{/if}
				</div>
			{/if}

			{#if definition.postamble}
				<p class="asset-postamble">{definition.postamble}</p>
			{/if}
		</div>
	{/if}
</div>

<!-- Remove confirmation dialog — shows rules text -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<dialog
	bind:this={removeDialogEl}
	class="remove-dialog"
	oncancel={() => removeDialogEl?.close()}
>
	<h3 class="remove-title">Remove {definition.name}?</h3>

	<div class="remove-body">
		<p>Losing an asset is rare and usually the result of a unique narrative circumstance dictated by the storyline.</p>

		{#if definition.companionHealthMax !== undefined}
			<p>
				<strong>Companion Endure Harm:</strong> If your companion is killed or you
				choose to end your bond, roll +Heart. On a strong hit, take +1 spirit. On a
				weak hit, take +1 spirit and suffer −1 momentum. On a miss, you must Endure
				Stress. Gain {companionRemoveXp} XP (1 per marked ability, minimum 1).
			</p>
		{/if}

		<p>
			<strong>Learn From Your Failures:</strong> On a strong hit, you may discard a
			single asset and gain {removeXp} XP (2 per marked ability, minimum 1).
		</p>
	</div>

	<div class="remove-btns">
		<button class="btn btn-primary" onclick={() => removeDialogEl?.close()}>Keep Asset</button>
		<button class="btn btn-danger" onclick={confirmRemove}>Remove</button>
	</div>
</dialog>

<style>
	.asset-card {
		background: var(--bg-inset);
		border: 1px solid var(--border);
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

	.collapse-btn {
		background: transparent;
		border: none;
		color: var(--text-dimmer);
		padding: 2px 4px;
		cursor: pointer;
		font-size: 0.55rem;
		line-height: 1;
		flex-shrink: 0;
		border-radius: 2px;
		font-family: var(--font-ui);
		transition: color 0.12s;
	}
	.collapse-btn:hover { color: var(--text); }

	.asset-name-group {
		flex: 1;
		display: flex;
		align-items: baseline;
		gap: 8px;
		min-width: 0;
		overflow: hidden;
	}

	.asset-name {
		font-family: var(--font-ui);
		font-size: 0.86rem;
		font-weight: 700;
		letter-spacing: 0.03em;
		color: var(--text);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.asset-cat {
		font-family: var(--font-ui);
		font-size: 0.6rem;
		font-weight: 600;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		flex-shrink: 0;
		white-space: nowrap;
	}

	.companion-health-badge {
		font-family: var(--font-ui);
		font-size: 0.72rem;
		font-weight: 700;
		color: var(--color-heart);
		flex-shrink: 0;
		font-variant-numeric: tabular-nums;
		letter-spacing: 0.02em;
	}

	.ability-tally {
		font-family: var(--font-ui);
		font-size: 0.68rem;
		color: var(--text-dimmer);
		flex-shrink: 0;
		font-variant-numeric: tabular-nums;
	}

	/* Remove button (trash icon) */
	.btn-remove {
		color: var(--color-danger);
		border-color: transparent;
		background: transparent;
		opacity: 0.5;
		transition: opacity 0.12s, border-color 0.12s;
		flex-shrink: 0;
	}
	.btn-remove:hover:not(:disabled) {
		opacity: 1;
		border-color: var(--color-danger);
		background: transparent;
	}
	.icon-btn :global(svg) {
		width: 11px;
		height: 11px;
		fill: currentColor;
	}

	/* ---- Expanded body ---- */
	.asset-body {
		padding: 10px 12px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.asset-preamble {
		font-family: var(--font-ui);
		font-size: 0.78rem;
		font-style: italic;
		color: var(--text-muted);
		line-height: 1.4;
		margin: 0;
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
		border-color: color-mix(in srgb, var(--text-accent) 35%, transparent);
		background: color-mix(in srgb, var(--text-accent) 5%, var(--bg));
	}

	.ability-check {
		margin-top: 2px;
		flex-shrink: 0;
		accent-color: var(--text-accent);
		width: 13px;
		height: 13px;
		cursor: pointer;
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

	/* ---- Companion fields ---- */
	.companion-fields {
		display: flex;
		flex-direction: column;
		gap: 7px;
		padding: 8px 10px;
		background: color-mix(in srgb, var(--color-heart) 6%, var(--bg-inset));
		border: 1px solid color-mix(in srgb, var(--color-heart) 20%, transparent);
		border-radius: 5px;
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

	.companion-health-row {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.health-pips {
		display: flex;
		gap: 3px;
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
		cursor: pointer;
	}
	.selection-row.selection-disabled .selection-check {
		cursor: not-allowed;
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

	.rarity-check {
		flex-shrink: 0;
		accent-color: var(--text-accent);
		width: 13px;
		height: 13px;
		cursor: pointer;
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

	/* ================================================================
	   Remove dialog
	   ================================================================ */
	.remove-dialog {
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		margin: 0;
		border: 1px solid var(--border-mid);
		border-radius: 7px;
		padding: 16px 18px 14px;
		background: var(--bg-card);
		color: var(--text);
		width: min(420px, calc(100vw - 2rem));
		box-shadow: 0 8px 32px #00000060;
	}
	.remove-dialog::backdrop {
		background: #00000040;
		backdrop-filter: blur(1px);
	}

	.remove-title {
		font-family: var(--font-ui);
		font-size: 0.88rem;
		font-weight: 700;
		letter-spacing: 0.04em;
		color: var(--text);
		margin: 0 0 12px;
	}

	.remove-body {
		display: flex;
		flex-direction: column;
		gap: 9px;
		margin-bottom: 16px;
	}

	.remove-body p {
		font-family: var(--font-ui);
		font-size: 0.8rem;
		line-height: 1.5;
		color: var(--text-muted);
		margin: 0;
	}

	.remove-body :global(strong) {
		color: var(--text);
		font-weight: 600;
	}

	.remove-btns {
		display: flex;
		gap: 6px;
		justify-content: flex-end;
	}

	.btn-primary {
		background: var(--text-accent);
		border-color: var(--text-accent);
		color: var(--bg-card);
		font-weight: 600;
	}
	.btn-primary:hover { opacity: 0.88; }
</style>
