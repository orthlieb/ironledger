<script lang="ts">
	/**
	 * CharactersArea (v2 prototype) — Characters deck stage.
	 *
	 * Layout:
	 *   ┌─────────────────────────────────────────────────────┐
	 *   │ Header: "Characters"                                │
	 *   ├──────┬──────────────────────────────────────────────┤
	 *   │      │  Active card tab strip [Background|Core|Vows]│
	 *   │ Spine│  ┌────────────────────────────────────────┐  │
	 *   │ strip│  │  Active card content                   │  │
	 *   │ ───  │  │                                        │  │
	 *   │ char1│  └────────────────────────────────────────┘  │
	 *   │ char2│  Asset strip ▒▒▒ ▒▒▒ ▒▒▒                   │
	 *   └──────┴──────────────────────────────────────────────┘
	 *
	 * "Active character" is the front-of-deck. Click a spine to bring its deck
	 * to the front. Click an asset thumbnail to expand it inline.
	 */
	import { getCharacters, isCharacterLoading } from '$lib/characterStore.svelte.js';
	import { findAsset, isAssetsLoading }        from '$lib/assetStore.svelte.js';
	import { hydrateCharacter } from '$lib/character.js';
	import type { CharacterData } from '$lib/types.js';

	type CardKey = 'background' | 'core' | 'vows';
	const CARD_LABELS: { key: CardKey; label: string }[] = [
		{ key: 'background', label: 'Background' },
		{ key: 'core',       label: 'Core' },
		{ key: 'vows',       label: 'Vows' },
	];

	let activeCharId  = $state<string | null>(null);
	let activeCard    = $state<CardKey>('core');
	let expandedAssetId = $state<string | null>(null);

	const characters = $derived(getCharacters());
	const loading    = $derived(isCharacterLoading() || isAssetsLoading());

	// Auto-select the first character once data has loaded.
	$effect(() => {
		if (!activeCharId && characters.length > 0) {
			activeCharId = characters[0].id;
		}
	});

	const activeChar = $derived(characters.find(c => c.id === activeCharId));
	const activeData = $derived<CharacterData | null>(
		activeChar ? hydrateCharacter(activeChar.data) : null,
	);

	function selectChar(id: string) {
		activeCharId = id;
		activeCard = 'core';
		expandedAssetId = null;
	}

	function toggleAsset(assetId: string) {
		expandedAssetId = expandedAssetId === assetId ? null : assetId;
	}
</script>

<div class="ca-area">
	<!-- Header -->
	<header class="ca-header">
		<span class="ca-title">Characters</span>
		<span class="ca-count">{characters.length} {characters.length === 1 ? 'character' : 'characters'}</span>
	</header>

	{#if loading}
		<div class="ca-loading">Loading…</div>
	{:else if characters.length === 0}
		<div class="ca-empty">
			No characters yet. Use the original /home page to create one — this prototype is read-only for now.
		</div>
	{:else}
		<div class="ca-body">
			<!-- Spine strip (left) -->
			<nav class="ca-spines" aria-label="Character decks">
				{#each characters as char (char.id)}
					{@const cd = hydrateCharacter(char.data)}
					<button
						class="ca-spine"
						class:ca-spine--active={char.id === activeCharId}
						onclick={() => selectChar(char.id)}
						title={char.name}
					>
						<span class="ca-spine-name">{char.name}</span>
						<span class="ca-spine-meta">XP {cd.xp ?? 0}</span>
					</button>
				{/each}
			</nav>

			<!-- Active deck stage (right) -->
			<div class="ca-stage">
				{#if activeChar}
					<!-- Card tab strip -->
					<div class="ca-tabs" role="tablist">
						{#each CARD_LABELS as tab (tab.key)}
							<button
								role="tab"
								class="ca-tab"
								class:ca-tab--active={activeCard === tab.key}
								aria-selected={activeCard === tab.key}
								onclick={() => (activeCard = tab.key)}
							>{tab.label}</button>
						{/each}
					</div>

					{@const d = activeData!}
					<!-- Active card content -->
					<div class="ca-card" role="tabpanel">
						{#if activeCard === 'background'}
							<div class="ca-card-section">
								<h3 class="ca-card-name">{activeChar.name}</h3>
								{#if d.background?.trim()}
									<p class="ca-card-bg">{d.background}</p>
								{:else}
									<p class="ca-card-bg ca-card-bg--empty">No background yet.</p>
								{/if}
							</div>
						{:else if activeCard === 'core'}
							<div class="ca-card-section">
								<div class="ca-stats">
									<div class="ca-stat"><span class="ca-stat-label">Edge</span>  <span class="ca-stat-val">{d.edge}</span></div>
									<div class="ca-stat"><span class="ca-stat-label">Heart</span> <span class="ca-stat-val">{d.heart}</span></div>
									<div class="ca-stat"><span class="ca-stat-label">Iron</span>  <span class="ca-stat-val">{d.iron}</span></div>
									<div class="ca-stat"><span class="ca-stat-label">Shadow</span><span class="ca-stat-val">{d.shadow}</span></div>
									<div class="ca-stat"><span class="ca-stat-label">Wits</span>  <span class="ca-stat-val">{d.wits}</span></div>
								</div>

								<div class="ca-vitals">
									<div class="ca-vital"><span class="ca-vital-label">Health</span>  <span class="ca-vital-val"><strong>{d.health}</strong><span class="ca-vital-max">/5</span></span></div>
									<div class="ca-vital"><span class="ca-vital-label">Spirit</span>  <span class="ca-vital-val"><strong>{d.spirit}</strong><span class="ca-vital-max">/5</span></span></div>
									<div class="ca-vital"><span class="ca-vital-label">Supply</span>  <span class="ca-vital-val"><strong>{d.supply}</strong><span class="ca-vital-max">/5</span></span></div>
									<div class="ca-vital"><span class="ca-vital-label">Momentum</span><span class="ca-vital-val"><strong>{d.momentum}</strong><span class="ca-vital-max">/10</span></span></div>
								</div>

								<div class="ca-track-row">
									<span class="ca-track-label">Bonds</span>
									<span class="ca-track-val">{d.bonds ?? 0} / 40 ticks</span>
								</div>
							</div>
						{:else if activeCard === 'vows'}
							<div class="ca-card-section">
								{#if (d.vows ?? []).length === 0}
									<p class="ca-empty-mini">No vows.</p>
								{:else}
									<ul class="ca-vow-list">
										{#each d.vows ?? [] as vow}
											<li class="ca-vow">
												<span class="ca-vow-name">{vow.name || 'Unnamed Vow'}</span>
												<span class="ca-vow-rank">{vow.difficulty}</span>
												<span class="ca-vow-progress">{Math.floor((vow.ticks ?? 0) / 4)} / 10</span>
											</li>
										{/each}
									</ul>
								{/if}
							</div>
						{/if}
					</div>

					<!-- Asset strip (bottom) -->
					<div class="ca-assets" aria-label="Assets">
						{#if (d.assets ?? []).length === 0}
							<span class="ca-assets-empty">No assets.</span>
						{:else}
							{#each d.assets ?? [] as a (a.assetId)}
								{@const def = findAsset(a.assetId)}
								<button
									class="ca-asset-chip"
									class:ca-asset-chip--active={expandedAssetId === a.assetId}
									onclick={() => toggleAsset(a.assetId)}
									title={def?.name ?? a.assetId}
								>
									<span class="ca-asset-chip-name">{def?.name ?? a.assetId}</span>
									{#if def?.category}
										<span class="ca-asset-chip-cat">{def.category}</span>
									{/if}
								</button>
							{/each}
						{/if}
					</div>

					<!-- Expanded asset (inline overlay) -->
					{#if expandedAssetId}
						{@const exp = (d.assets ?? []).find(a => a.assetId === expandedAssetId)}
						{@const expDef = exp ? findAsset(exp.assetId) : undefined}
						{#if exp && expDef}
							<div class="ca-asset-expanded">
								<div class="ca-asset-expanded-header">
									<span class="ca-asset-expanded-name">{expDef.name}</span>
									<button class="ca-asset-expanded-close" onclick={() => (expandedAssetId = null)} aria-label="Close">✕</button>
								</div>
								<p class="ca-asset-expanded-summary">{expDef.summary ?? ''}</p>
								<ul class="ca-asset-expanded-abilities">
									{#each expDef.abilities as ab, i}
										<li class:ca-ab--enabled={exp.abilities?.[i]}>
											{#if exp.abilities?.[i]}<strong>✓</strong>{:else}<span class="ca-ab-dot">○</span>{/if}
											{@html ab.text}
										</li>
									{/each}
								</ul>
							</div>
						{/if}
					{/if}
				{/if}
			</div>
		</div>
	{/if}
</div>

<style>
	.ca-area {
		display:        flex;
		flex-direction: column;
		height:         100%;
		min-height:     0;
	}

	/* ── Header ───────────────────────────────────────── */
	.ca-header {
		display: flex;
		align-items: baseline;
		gap: 10px;
		padding: 8px 12px;
		border-bottom: 1px solid var(--border);
		background: var(--bg-control);
		flex-shrink: 0;
	}
	.ca-title {
		font-family:    var(--font-display);
		font-size:      calc(0.82rem * var(--font-display-scale));
		font-weight:    var(--font-display-weight);
		letter-spacing: 0.08em;
		text-transform: var(--font-display-transform);
		color:          var(--text-accent);
	}
	.ca-count {
		font-family: var(--font-ui);
		font-size: 0.7rem;
		color: var(--text-dimmer);
	}

	.ca-loading,
	.ca-empty {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		font-family: var(--font-ui);
		font-size: 0.8rem;
		color: var(--text-muted);
		font-style: italic;
		padding: 20px;
		text-align: center;
	}

	/* ── Body: spines + stage ─────────────────────────── */
	.ca-body {
		display: grid;
		grid-template-columns: 130px 1fr;
		flex: 1;
		min-height: 0;
	}

	/* Spine strip */
	.ca-spines {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 8px;
		border-right: 1px solid var(--border);
		overflow-y: auto;
		background: var(--bg);
	}
	.ca-spine {
		all: unset;
		cursor: pointer;
		padding: 8px 9px;
		border: 1px solid var(--border);
		border-left: 3px solid var(--text-dimmer);
		border-radius: 4px;
		display: flex;
		flex-direction: column;
		gap: 2px;
		background: var(--bg-card);
		transition: border-color 0.12s, background 0.12s;
	}
	.ca-spine:hover {
		border-color: var(--border-mid);
		background: var(--bg-hover);
	}
	.ca-spine--active {
		border-left-color: var(--text-accent);
		background: color-mix(in srgb, var(--text-accent) 8%, var(--bg-card));
	}
	.ca-spine-name {
		font-family: var(--font-ui);
		font-size: 0.78rem;
		font-weight: 600;
		color: var(--text);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.ca-spine-meta {
		font-family: var(--font-ui);
		font-size: 0.65rem;
		color: var(--text-dimmer);
	}

	/* Stage */
	.ca-stage {
		display: flex;
		flex-direction: column;
		min-height: 0;
		min-width: 0;
		overflow: auto;
		padding: 10px 12px;
	}

	.ca-tabs {
		display: flex;
		gap: 4px;
		margin-bottom: 8px;
		border-bottom: 1px solid var(--border);
	}
	.ca-tab {
		all: unset;
		cursor: pointer;
		padding: 6px 14px;
		font-family: var(--font-ui);
		font-size: 0.78rem;
		color: var(--text-muted);
		border: 1px solid transparent;
		border-bottom: none;
		border-radius: 4px 4px 0 0;
		transition: color 0.12s, background 0.12s;
		margin-bottom: -1px;
	}
	.ca-tab:hover { color: var(--text); }
	.ca-tab--active {
		color: var(--text-accent);
		background: var(--bg-card);
		border-color: var(--border);
	}

	/* Card content */
	.ca-card {
		flex: 1;
		min-height: 200px;
		background: var(--bg-card);
		border: 1px solid var(--border);
		border-radius: 0 6px 6px 6px;
		padding: 14px;
		overflow: auto;
	}
	.ca-card-section {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.ca-card-name {
		font-family:    var(--font-display);
		font-size:      calc(1rem * var(--font-display-scale));
		font-weight:    var(--font-display-weight);
		letter-spacing: 0.06em;
		text-transform: var(--font-display-transform);
		color:          var(--text-accent);
		margin: 0;
	}
	.ca-card-bg {
		font-family: var(--font-ui);
		font-size: 0.85rem;
		line-height: 1.5;
		color: var(--text);
		margin: 0;
		white-space: pre-wrap;
	}
	.ca-card-bg--empty {
		color: var(--text-dimmer);
		font-style: italic;
	}

	.ca-stats {
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		gap: 8px;
	}
	.ca-stat {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 8px;
		background: var(--bg-inset);
		border: 1px solid var(--border);
		border-radius: 4px;
	}
	.ca-stat-label {
		font-family: var(--font-ui);
		font-size: 0.7rem;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}
	.ca-stat-val {
		font-family: var(--font-display);
		font-size: 1.25rem;
		font-weight: 700;
		color: var(--text);
	}

	.ca-vitals {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 8px;
	}
	.ca-vital {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 8px;
		background: var(--bg-inset);
		border: 1px solid var(--border);
		border-radius: 4px;
	}
	.ca-vital-label {
		font-family: var(--font-ui);
		font-size: 0.7rem;
		color: var(--text-muted);
	}
	.ca-vital-val {
		font-family: var(--font-display);
		font-size: 1rem;
		color: var(--text);
	}
	.ca-vital-val strong { font-weight: 700; }
	.ca-vital-max { color: var(--text-dimmer); font-size: 0.8em; }

	.ca-track-row {
		display: flex;
		justify-content: space-between;
		padding: 6px 8px;
		font-family: var(--font-ui);
		font-size: 0.78rem;
		color: var(--text-muted);
		background: var(--bg-inset);
		border: 1px solid var(--border);
		border-radius: 4px;
	}
	.ca-track-val { color: var(--text); }

	.ca-vow-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.ca-vow {
		display: grid;
		grid-template-columns: 1fr auto auto;
		gap: 10px;
		padding: 8px 10px;
		background: var(--bg-inset);
		border: 1px solid var(--border);
		border-radius: 4px;
		font-family: var(--font-ui);
		font-size: 0.78rem;
	}
	.ca-vow-name { color: var(--text); }
	.ca-vow-rank {
		color: var(--text-muted);
		text-transform: capitalize;
		font-size: 0.7rem;
	}
	.ca-vow-progress { color: var(--text-dimmer); font-size: 0.7rem; }
	.ca-empty-mini {
		font-family: var(--font-ui);
		font-size: 0.78rem;
		color: var(--text-dimmer);
		font-style: italic;
	}

	/* Asset strip */
	.ca-assets {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;
		margin-top: 10px;
		padding-top: 10px;
		border-top: 1px solid var(--border);
	}
	.ca-assets-empty {
		font-family: var(--font-ui);
		font-size: 0.74rem;
		color: var(--text-dimmer);
		font-style: italic;
	}
	.ca-asset-chip {
		all: unset;
		cursor: pointer;
		padding: 5px 9px;
		display: flex;
		flex-direction: column;
		gap: 2px;
		background: var(--bg-inset);
		border: 1px solid var(--border);
		border-radius: 4px;
		min-width: 80px;
		transition: border-color 0.12s, background 0.12s;
	}
	.ca-asset-chip:hover { border-color: var(--border-mid); }
	.ca-asset-chip--active {
		border-color: var(--text-accent);
		background: color-mix(in srgb, var(--text-accent) 8%, var(--bg-inset));
	}
	.ca-asset-chip-name {
		font-family: var(--font-ui);
		font-size: 0.74rem;
		font-weight: 600;
		color: var(--text);
	}
	.ca-asset-chip-cat {
		font-family: var(--font-ui);
		font-size: 0.62rem;
		color: var(--text-dimmer);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	/* Expanded asset overlay */
	.ca-asset-expanded {
		margin-top: 8px;
		padding: 10px 12px;
		background: var(--bg-card);
		border: 1px solid var(--text-accent);
		border-radius: 4px;
	}
	.ca-asset-expanded-header {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		margin-bottom: 4px;
	}
	.ca-asset-expanded-name {
		font-family: var(--font-display);
		font-size: 0.9rem;
		font-weight: 700;
		color: var(--text-accent);
	}
	.ca-asset-expanded-close {
		all: unset;
		cursor: pointer;
		color: var(--text-dimmer);
		padding: 0 4px;
	}
	.ca-asset-expanded-close:hover { color: var(--text); }
	.ca-asset-expanded-summary {
		font-family: var(--font-ui);
		font-size: 0.78rem;
		color: var(--text-muted);
		font-style: italic;
		margin: 0 0 8px;
	}
	.ca-asset-expanded-abilities {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.ca-asset-expanded-abilities li {
		font-family: var(--font-ui);
		font-size: 0.76rem;
		color: var(--text-muted);
		line-height: 1.5;
		padding: 4px 6px;
		border-left: 2px solid var(--border);
	}
	.ca-ab--enabled {
		color: var(--text);
		border-left-color: var(--text-accent);
	}
	.ca-ab-dot { color: var(--text-dimmer); margin-right: 4px; }
</style>
