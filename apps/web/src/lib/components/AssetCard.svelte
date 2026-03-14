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
	import { appendLog } from '$lib/log.svelte.js';
	import trashSvg from '$icons/trash-solid-full.svg?raw';

	let {
		asset      = $bindable(),
		definition,
		characterId,
		onRemove,
	}: {
		asset:        CharacterAsset;
		definition:   AssetDefinition;
		characterId:  string;
		onRemove:     () => void;
	} = $props();

	// Selectable-list item shape used by cantrips (and any future similar lists)
	type SelectableItem = { key: string; name: string; desc: string };

	let collapsed         = $state(true);
	let removeDialogEl    = $state<HTMLDialogElement | null>(null);
	let selectionsOpen    = $state(false);

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

	function toggleSelection(key: string) {
		const cur  = asset.selections ?? [];
		const item = selectableItems.find((it) => it.key === key);
		if (cur.includes(key)) {
			asset.selections = cur.filter((k) => k !== key);
			appendLog(characterId, 'Assets',
				`<div>${selectableLabel} forgotten: <strong>${item?.name ?? key}</strong> (${definition.name})</div>`);
		} else if (cur.length < totalSlots) {
			asset.selections = [...cur, key];
			appendLog(characterId, 'Assets',
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

	function toggleAbility(i: number) {
		const next = [...asset.abilities];
		const enabling = !next[i];
		next[i] = enabling;
		asset.abilities = next;
		appendLog(characterId, 'Assets',
			`<div>Ability: <strong>${definition.name}</strong> #${i + 1} — <strong>${enabling ? 'enabled' : 'disabled'}</strong></div>`);
	}

	function setCompanionHealth(newVal: number) {
		const old = asset.companionHealth ?? 0;
		if (newVal === old) return;
		asset.companionHealth = newVal;
		const label = asset.companionName
			? `${asset.companionName} (${definition.name})`
			: definition.name;
		appendLog(characterId, 'Assets',
			`<div><strong>${label}</strong> Health: ${old} → <strong>${newVal}</strong></div>`);
	}

	function openRemoveDialog() {
		removeDialogEl?.showModal();
	}

	function confirmRemove() {
		removeDialogEl?.close();
		appendLog(characterId, 'Assets',
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
									<span class="selection-name">{item.name}</span>
									<span class="selection-desc">{item.desc}</span>
								</label>
							{/each}
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
							onchange={(e) => {
								const checked = (e.target as HTMLInputElement).checked;
								asset.rarityId = checked ? rarity.id : undefined;
								appendLog(characterId, 'Assets', checked
									? `<div>Rarity acquired: <strong>${rarity.name}</strong> for <strong>${definition.name}</strong> (${rarity.xpCost} XP)</div>`
									: `<div>Rarity removed: <strong>${rarity.name}</strong> from <strong>${definition.name}</strong></div>`);
							}}
						/>
						<span class="rarity-name">{rarity.name}</span>
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

	.selection-name {
		font-family: var(--font-ui);
		font-size: 0.78rem;
		font-weight: 600;
		color: var(--text);
		white-space: nowrap;
		flex-shrink: 0;
	}

	.selection-desc {
		font-family: var(--font-ui);
		font-size: 0.75rem;
		color: var(--text-muted);
		line-height: 1.4;
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
