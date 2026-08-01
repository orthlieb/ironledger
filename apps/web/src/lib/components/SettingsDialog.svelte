<script lang="ts">
	/**
	 * SettingsDialog — app-wide preferences modal.
	 *
	 * Owns:
	 *   • Theme     — auto / dark / light (persisted to localStorage)
	 *   • 3D Dice   — on / off (persisted to localStorage via dice.ts)
	 *   • Delve     — on / off (persisted via expansionStore)
	 *   • YRT       — on / off (persisted via expansionStore)
	 *
	 * Usage:
	 *   <SettingsDialog bind:this={ref} />
	 *   ref.open()
	 */

	import { isDice3dEnabled, setDice3dEnabled } from '$lib/dice';
	import { isDiceSoundEnabled, setDiceSoundEnabled, isDiceSoundSupported } from '$lib/diceSound.js';
	import {
		isDelveEnabled,
		setDelveEnabled,
		isYrtEnabled,
		setYrtEnabled,
	} from '$lib/expansionStore.svelte.js';
	import { headingText } from '$lib/fontStore.svelte.js';
	import {
		type FontDisplay,
		getFontDisplay,
		savedFont,
		setFontDisplay,
	} from '$lib/fontStore.svelte.js';
	import {
		type AiProvider,
		AI_PROVIDERS,
		PROVIDER_LABEL,
		getActiveProvider,
		providerView,
		loadAiConfig,
		setActiveProvider,
		getSetup,
		setSetup,
	} from '$lib/aiSettings.svelte.js';
	import { Dialog, ToggleGroup } from 'bits-ui';
	import DialogHeader from '$lib/components/DialogHeader.svelte';
	import AiConfigDialog from '$lib/components/AiConfigDialog.svelte';
	import Select from '$lib/components/Select.svelte';

	// ---------------------------------------------------------------------------
	// Display font — delegated to fontStore
	// ---------------------------------------------------------------------------
	let fontDisplay = $state<FontDisplay>(getFontDisplay());

	function applyFont(f: FontDisplay) {
		fontDisplay = f;
		setFontDisplay(f);
	}

	// ---------------------------------------------------------------------------
	// Theme
	// ---------------------------------------------------------------------------
	type Theme = 'auto' | 'dark' | 'light';

	const THEME_MODES: { value: Theme; label: string }[] = [
		{ value: 'auto', label: 'Auto (follow system)' },
		{ value: 'dark', label: 'Dark' },
		{ value: 'light', label: 'Light' },
	];

	function savedTheme(): Theme {
		if (typeof window === 'undefined') return 'auto';
		const t = localStorage.getItem('theme');
		return t === 'dark' || t === 'light' ? t : 'auto';
	}

	let theme = $state<Theme>(savedTheme());

	function applyTheme(t: Theme) {
		theme = t;
		if (t === 'auto') {
			localStorage.removeItem('theme');
			document.documentElement.removeAttribute('data-theme');
		} else {
			localStorage.setItem('theme', t);
			document.documentElement.setAttribute('data-theme', t);
		}
	}

	// ---------------------------------------------------------------------------
	// 3D Dice
	// ---------------------------------------------------------------------------
	let dice3d = $state(typeof window !== 'undefined' ? isDice3dEnabled() : true);

	function applyDice3d(on: boolean) {
		dice3d = on;
		setDice3dEnabled(on);
	}

	// ---------------------------------------------------------------------------
	// Dice sound
	// ---------------------------------------------------------------------------
	let diceSound = $state(typeof window !== 'undefined' ? isDiceSoundEnabled() : true);

	function applyDiceSound(on: boolean) {
		diceSound = on;
		setDiceSoundEnabled(on);
	}

	// ---------------------------------------------------------------------------
	// Expansions (Delve / YRT)
	// ---------------------------------------------------------------------------
	let delveOn = $state(typeof window !== 'undefined' ? isDelveEnabled() : true);
	let yrtOn = $state(typeof window !== 'undefined' ? isYrtEnabled() : true);

	function applyDelve(on: boolean) {
		delveOn = on;
		setDelveEnabled(on);
	}
	function applyYrt(on: boolean) {
		yrtOn = on;
		setYrtEnabled(on);
	}

	// ---------------------------------------------------------------------------
	// AI Storyteller — pick the active provider; keys/models live server-side and
	// are edited in the per-provider AiConfigDialog.
	// ---------------------------------------------------------------------------
	let activeProvider = $state<AiProvider | null>(null);
	let aiConfigRef = $state<{ openFor(p: AiProvider): void } | null>(null);
	// Setup instructions are a single global system prompt (not per-provider).
	let aiSetup = $state('');

	async function chooseProvider(p: AiProvider | 'none') {
		activeProvider = p === 'none' ? null : p;
		await setActiveProvider(p);
	}
	function providerHasKey(p: AiProvider): boolean {
		return providerView(p).hasKey;
	}
	function openProviderConfig(p: AiProvider) {
		aiConfigRef?.openFor(p);
	}
	function applyAiSetup(v: string) {
		aiSetup = v;
		setSetup(v);
	}

	// ---------------------------------------------------------------------------
	// Dialog
	// ---------------------------------------------------------------------------
	let dialogOpen = $state(false);

	export function open() {
		// Re-sync with localStorage each time the dialog opens.
		theme = savedTheme();
		dice3d = isDice3dEnabled();
		diceSound = isDiceSoundEnabled();
		delveOn = isDelveEnabled();
		yrtOn = isYrtEnabled();
		fontDisplay = savedFont();
		aiSetup = getSetup();
		activeProvider = getActiveProvider();
		loadAiConfig(true).then(() => {
			activeProvider = getActiveProvider();
		});
		dialogOpen = true;
	}

	export function close() {
		dialogOpen = false;
	}
</script>

<!-- =========================================================================
     Dialog — bits-ui Dialog: portal + overlay + focus trap.
     ========================================================================= -->
<Dialog.Root bind:open={dialogOpen}>
	<Dialog.Portal>
		<Dialog.Overlay class="settings-overlay" />
		<Dialog.Content class="settings-dialog">
			<DialogHeader title={headingText('Settings')} onclose={close} />

			<!-- Body -->
			<div class="sd-body">
				<!-- Theme -->
				<div class="sd-row">
					<span class="sd-label">Theme</span>
					<Select
						value={theme}
						options={THEME_MODES}
						onchange={applyTheme}
						ariaLabel="Color theme"
						class="sd-select"
					/>
				</div>

				<!-- Heading Font -->
				<div class="sd-row">
					<span class="sd-label">Heading Font</span>
					<ToggleGroup.Root
						type="single"
						value={fontDisplay}
						onValueChange={(v) => v && applyFont(v as FontDisplay)}
						class="sd-seg"
						aria-label="Heading font"
					>
						<ToggleGroup.Item
							value="cinzel"
							class="sd-seg-btn"
							data-tooltip="Gravestone — engraved titling serif (default)"
							>Gravestone</ToggleGroup.Item
						>
						<ToggleGroup.Item
							value="simonetta"
							class="sd-seg-btn"
							data-tooltip="Ledger — calligraphic all-caps serif">Ledger</ToggleGroup.Item
						>
						<ToggleGroup.Item
							value="futhark"
							class="sd-seg-btn"
							data-tooltip="Futhark — transliterate names to Elder Futhark runes"
							>ᚠᚢᚦᚨᚱᚲ</ToggleGroup.Item
						>
					</ToggleGroup.Root>
				</div>

				<!-- 3D Dice -->
				<div class="sd-row">
					<span class="sd-label">3D Dice</span>
					<ToggleGroup.Root
						type="single"
						value={dice3d ? 'on' : 'off'}
						onValueChange={(v) => v && applyDice3d(v === 'on')}
						class="sd-seg"
						aria-label="3D dice animation"
					>
						<ToggleGroup.Item value="on" class="sd-seg-btn" data-tooltip="Animate dice rolls in 3D"
							>On</ToggleGroup.Item
						>
						<ToggleGroup.Item
							value="off"
							class="sd-seg-btn"
							data-tooltip="Skip 3D animation, show result immediately">Off</ToggleGroup.Item
						>
					</ToggleGroup.Root>
				</div>

				<!-- Dice Sound — hidden on iOS Safari, where the library's sound
		     preload pipeline hangs `_diceBox.initialize()`. -->
				{#if isDiceSoundSupported()}
					<div class="sd-row">
						<span class="sd-label">Dice Sound</span>
						<ToggleGroup.Root
							type="single"
							value={diceSound ? 'on' : 'off'}
							onValueChange={(v) => v && applyDiceSound(v === 'on')}
							class="sd-seg"
							aria-label="Dice rattle sound"
						>
							<ToggleGroup.Item
								value="on"
								class="sd-seg-btn"
								data-tooltip="Play a dice rattle while the dice roll">On</ToggleGroup.Item
							>
							<ToggleGroup.Item value="off" class="sd-seg-btn" data-tooltip="Roll silently"
								>Off</ToggleGroup.Item
							>
						</ToggleGroup.Root>
					</div>
				{/if}

				<!-- Delve expansion -->
				<div class="sd-row">
					<span class="sd-label">Delve</span>
					<ToggleGroup.Root
						type="single"
						value={delveOn ? 'on' : 'off'}
						onValueChange={(v) => v && applyDelve(v === 'on')}
						class="sd-seg"
						aria-label="Delve expansion"
					>
						<ToggleGroup.Item
							value="on"
							class="sd-seg-btn"
							data-tooltip="Show Delve moves, oracles, foes, assets">On</ToggleGroup.Item
						>
						<ToggleGroup.Item
							value="off"
							class="sd-seg-btn"
							data-tooltip="Hide Delve content from pickers (existing data preserved)"
							>Off</ToggleGroup.Item
						>
					</ToggleGroup.Root>
				</div>

				<!-- YRT expansion -->
				<div class="sd-row">
					<span class="sd-label">YRT</span>
					<ToggleGroup.Root
						type="single"
						value={yrtOn ? 'on' : 'off'}
						onValueChange={(v) => v && applyYrt(v === 'on')}
						class="sd-seg"
						aria-label="YRT expansion"
					>
						<ToggleGroup.Item
							value="on"
							class="sd-seg-btn"
							data-tooltip="Show YRT moves, oracles, foes, assets">On</ToggleGroup.Item
						>
						<ToggleGroup.Item
							value="off"
							class="sd-seg-btn"
							data-tooltip="Hide YRT content from pickers (existing data preserved)"
							>Off</ToggleGroup.Item
						>
					</ToggleGroup.Root>
				</div>

				<!-- ─── AI Storyteller ─── -->
				<div class="sd-section-heading">AI Storyteller</div>

				<div class="sd-row">
					<span class="sd-label">Storyteller</span>
					<ToggleGroup.Root
						type="single"
						value={activeProvider ?? 'none'}
						onValueChange={(v) => v && chooseProvider(v as AiProvider | 'none')}
						class="sd-seg"
						aria-label="AI storyteller"
					>
						<ToggleGroup.Item value="none" class="sd-seg-btn">None</ToggleGroup.Item>
						{#each AI_PROVIDERS as p (p)}
							<ToggleGroup.Item value={p} class="sd-seg-btn">{PROVIDER_LABEL[p]}</ToggleGroup.Item>
						{/each}
					</ToggleGroup.Root>
				</div>

				{#if activeProvider}
					{@const ap = activeProvider}
					<div class="sd-row">
						<span class="sd-label">
							{PROVIDER_LABEL[ap]}
							{#if providerHasKey(ap)}
								<span class="sd-key-ok">· key set</span>
							{:else}
								<span class="sd-key-missing">· no key</span>
							{/if}
						</span>
						<button class="sd-key-btn" type="button" onclick={() => openProviderConfig(ap)}>
							Configure…
						</button>
					</div>
					{#if !providerHasKey(ap)}
						<div class="sd-hint sd-hint-tight">
							Add an API key to generate stories with {PROVIDER_LABEL[ap]}.
						</div>
					{/if}

					<div class="sd-setup-field">
						<span class="sd-label">Setup Instructions</span>
						<textarea
							class="sd-setup-input"
							rows="4"
							placeholder="Tone, POV, tense, character voice…"
							value={aiSetup}
							oninput={(e) => applyAiSetup((e.currentTarget as HTMLTextAreaElement).value)}
						></textarea>
						<span class="sd-hint sd-hint-tight">
							The system prompt sent for every story, whichever storyteller is active.
						</span>
					</div>
				{:else}
					<div class="sd-hint sd-hint-tight">
						Pick a storyteller to turn session logs into prose.
					</div>
				{/if}
			</div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<AiConfigDialog bind:this={aiConfigRef} />

<style>
	/* bits-ui portals Content + Overlay to <body>; scope everything
	   globally. Overlay 80 / content 81 matches the modal z-index tier. */
	:global(.settings-overlay) {
		position: fixed;
		inset: 0;
		background: #00000060;
		backdrop-filter: blur(1px);
		z-index: 80;
	}
	:global(.settings-dialog) {
		display: flex;
		flex-direction: column;
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: min(360px, calc(100vw - 2rem));
		background: var(--bg-card);
		color: var(--text);
		border-radius: 10px;
		box-shadow:
			0 16px 48px #00000070,
			0 0 0 1px var(--border-mid);
		outline: none;
		z-index: 81;
	}

	/* ── Header ─────────────────────────────────────────────────────────── */
	/* ── Body ────────────────────────────────────────────────────────────── */
	:global(.sd-body) {
		padding: 16px 14px;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}

	/* ── Setting row ─────────────────────────────────────────────────────── */
	:global(.sd-row) {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	:global(.sd-label) {
		font-family: var(--font-ui);
		font-size: 0.73rem;
		font-weight: 600;
		color: var(--text-muted);
		min-width: 82px;
	}

	/* ── Segmented control ───────────────────────────────────────────────── */
	:global(.sd-seg) {
		display: flex;
		border: 1px solid var(--border-mid);
		border-radius: 5px;
		overflow: hidden;
	}
	:global(.sd-seg-btn) {
		display: flex;
		align-items: center;
		gap: 5px;
		padding: 5px 11px;
		background: var(--bg-control);
		border: none;
		border-right: 1px solid var(--border-mid);
		cursor: pointer;
		color: var(--text-dimmer);
		font-family: var(--font-ui);
		font-size: 0.72rem;
		font-weight: 500;
		transition:
			background 0.12s,
			color 0.12s;
		white-space: nowrap;
	}
	:global(.sd-seg-btn:last-child) {
		border-right: none;
	}
	:global(.sd-seg-btn:hover:not([data-state='on'])) {
		background: var(--bg-hover);
		color: var(--text-muted);
	}
	:global(.sd-seg-btn[data-state='on']) {
		background: var(--bg-hover);
		color: var(--text-accent);
		font-weight: 600;
	}
	/* ── Claude AI section ──────────────────────────────────────────────── */
	:global(.sd-section-heading) {
		font-family: var(--font-display, 'Cinzel', serif);
		font-size: 0.78rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-accent);
		margin-top: 6px;
		padding-top: 10px;
		border-top: 1px solid var(--border);
	}

	:global(.sd-key-btn) {
		padding: 5px 8px;
		background: var(--bg-control);
		border: 1px solid var(--border-mid);
		border-radius: 4px;
		color: var(--text-muted);
		font-family: var(--font-ui);
		font-size: 0.7rem;
		font-weight: 600;
		cursor: pointer;
		white-space: nowrap;
	}
	:global(.sd-key-btn:hover:not(:disabled)) {
		color: var(--text);
		border-color: var(--text-accent);
	}

	:global(.sd-key-ok) {
		color: var(--color-success, #34d399);
		font-weight: 600;
	}
	:global(.sd-key-missing) {
		color: var(--text-dimmer);
		font-weight: 600;
	}

	:global(.sd-hint) {
		font-family: var(--font-ui);
		font-size: 0.68rem;
		color: var(--text-dimmer);
		line-height: 1.4;
	}
	:global(.sd-hint-tight) {
		margin-top: 2px;
	}

	:global(.sd-setup-field) {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	:global(.sd-setup-input) {
		width: 100%;
		box-sizing: border-box;
		padding: 5px 8px;
		background: var(--bg-control);
		color: var(--text);
		border: 1px solid var(--border-mid);
		border-radius: 4px;
		font-family: var(--font-ui);
		font-size: 0.78rem;
		line-height: 1.4;
		resize: vertical;
		min-height: 60px;
	}
	:global(.sd-setup-input:focus) {
		outline: none;
		border-color: var(--text-accent);
	}
</style>
