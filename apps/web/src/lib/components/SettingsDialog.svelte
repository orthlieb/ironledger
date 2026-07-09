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
		AI_MODELS,
		type AIModelId,
		getApiKey,
		getModel,
		getSetup,
		setApiKey,
		setModel,
		setSetup,
		testApiKey,
	} from '$lib/aiSettings.svelte.js';
	import DialogHeader from '$lib/components/DialogHeader.svelte';

	import autoSvg from '$icons/circle-half-stroke-solid.svg?raw';
	import darkSvg from '$icons/moon-solid.svg?raw';
	import lightSvg from '$icons/sun-solid.svg?raw';

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

	const THEME_MODES: { value: Theme; icon: string; label: string; title: string }[] = [
		{ value: 'auto', icon: autoSvg, label: 'Auto', title: 'Follow system preference' },
		{ value: 'dark', icon: darkSvg, label: 'Dark', title: 'Dark mode' },
		{ value: 'light', icon: lightSvg, label: 'Light', title: 'Light mode' },
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
	// Claude AI — API key, model, setup instructions
	// ---------------------------------------------------------------------------
	let aiKey = $state('');
	let aiKeyVisible = $state(false);
	let aiModel = $state<AIModelId>('claude-haiku-4-5');
	let aiSetup = $state('');
	let aiTestState = $state<'idle' | 'testing' | 'ok' | 'error'>('idle');
	let aiTestMessage = $state('');

	function applyAiKey(v: string) {
		aiKey = v;
		setApiKey(v);
		aiTestState = 'idle';
		aiTestMessage = '';
	}
	function applyAiModel(v: AIModelId) {
		aiModel = v;
		setModel(v);
	}
	function applyAiSetup(v: string) {
		aiSetup = v;
		setSetup(v);
	}
	async function runAiTest() {
		if (!aiKey.trim()) return;
		aiTestState = 'testing';
		aiTestMessage = '';
		const result = await testApiKey(aiKey, aiModel);
		if (result.ok) {
			aiTestState = 'ok';
			aiTestMessage = 'Key works.';
		} else {
			aiTestState = 'error';
			aiTestMessage = result.message;
		}
	}

	// ---------------------------------------------------------------------------
	// Dialog
	// ---------------------------------------------------------------------------
	let dialogEl = $state<HTMLDialogElement | null>(null);

	export function open() {
		// Re-sync with localStorage each time the dialog opens.
		theme = savedTheme();
		dice3d = isDice3dEnabled();
		diceSound = isDiceSoundEnabled();
		delveOn = isDelveEnabled();
		yrtOn = isYrtEnabled();
		fontDisplay = savedFont();
		aiKey = getApiKey();
		aiModel = getModel();
		aiSetup = getSetup();
		aiTestState = 'idle';
		aiTestMessage = '';
		aiKeyVisible = false;
		dialogEl?.showModal();
	}

	export function close() {
		dialogEl?.close();
	}
</script>

<!-- =========================================================================
     Dialog
     ========================================================================= -->
<dialog bind:this={dialogEl} class="settings-dialog" oncancel={close}>
	<!-- Header -->
	<DialogHeader title={headingText('Settings')} onclose={close} />

	<!-- Body -->
	<div class="sd-body">
		<!-- Theme -->
		<div class="sd-row">
			<span class="sd-label">Theme</span>
			<div class="sd-seg" role="group" aria-label="Color theme">
				{#each THEME_MODES as mode (mode.value)}
					<button
						class="sd-seg-btn"
						class:active={theme === mode.value}
						onclick={() => applyTheme(mode.value)}
						data-tooltip={mode.title}
						aria-pressed={theme === mode.value}
					>
						<span class="sd-seg-icon">{@html mode.icon}</span>
						{mode.label}
					</button>
				{/each}
			</div>
		</div>

		<!-- Heading Font -->
		<div class="sd-row">
			<span class="sd-label">Heading Font</span>
			<div class="sd-seg" role="group" aria-label="Heading font">
				<button
					class="sd-seg-btn"
					class:active={fontDisplay === 'cinzel'}
					onclick={() => applyFont('cinzel')}
					aria-pressed={fontDisplay === 'cinzel'}
					data-tooltip="Gravestone — engraved titling serif (default)">Gravestone</button
				>
				<button
					class="sd-seg-btn"
					class:active={fontDisplay === 'simonetta'}
					onclick={() => applyFont('simonetta')}
					aria-pressed={fontDisplay === 'simonetta'}
					data-tooltip="Grimoire — calligraphic all-caps serif">Grimoire</button
				>
				<button
					class="sd-seg-btn"
					class:active={fontDisplay === 'futhark'}
					onclick={() => applyFont('futhark')}
					aria-pressed={fontDisplay === 'futhark'}
					data-tooltip="Futhark — transliterate names to Elder Futhark runes">ᚠᚢᚦᚨᚱᚲ</button
				>
			</div>
		</div>

		<!-- 3D Dice -->
		<div class="sd-row">
			<span class="sd-label">3D Dice</span>
			<div class="sd-seg" role="group" aria-label="3D dice animation">
				<button
					class="sd-seg-btn"
					class:active={dice3d}
					onclick={() => applyDice3d(true)}
					aria-pressed={dice3d}
					data-tooltip="Animate dice rolls in 3D">On</button
				>
				<button
					class="sd-seg-btn"
					class:active={!dice3d}
					onclick={() => applyDice3d(false)}
					aria-pressed={!dice3d}
					data-tooltip="Skip 3D animation, show result immediately">Off</button
				>
			</div>
		</div>

		<!-- Dice Sound — hidden on iOS Safari, where the library's sound
		     preload pipeline hangs `_diceBox.initialize()`. -->
		{#if isDiceSoundSupported()}
			<div class="sd-row">
				<span class="sd-label">Dice Sound</span>
				<div class="sd-seg" role="group" aria-label="Dice rattle sound">
					<button
						class="sd-seg-btn"
						class:active={diceSound}
						onclick={() => applyDiceSound(true)}
						aria-pressed={diceSound}
						data-tooltip="Play a dice rattle while the dice roll">On</button
					>
					<button
						class="sd-seg-btn"
						class:active={!diceSound}
						onclick={() => applyDiceSound(false)}
						aria-pressed={!diceSound}
						data-tooltip="Roll silently">Off</button
					>
				</div>
			</div>
		{/if}

		<!-- Delve expansion -->
		<div class="sd-row">
			<span class="sd-label">Delve</span>
			<div class="sd-seg" role="group" aria-label="Delve expansion">
				<button
					class="sd-seg-btn"
					class:active={delveOn}
					onclick={() => applyDelve(true)}
					aria-pressed={delveOn}
					data-tooltip="Show Delve moves, oracles, foes, assets">On</button
				>
				<button
					class="sd-seg-btn"
					class:active={!delveOn}
					onclick={() => applyDelve(false)}
					aria-pressed={!delveOn}
					data-tooltip="Hide Delve content from pickers (existing data preserved)">Off</button
				>
			</div>
		</div>

		<!-- YRT expansion -->
		<div class="sd-row">
			<span class="sd-label">YRT</span>
			<div class="sd-seg" role="group" aria-label="YRT expansion">
				<button
					class="sd-seg-btn"
					class:active={yrtOn}
					onclick={() => applyYrt(true)}
					aria-pressed={yrtOn}
					data-tooltip="Show YRT moves, oracles, foes, assets">On</button
				>
				<button
					class="sd-seg-btn"
					class:active={!yrtOn}
					onclick={() => applyYrt(false)}
					aria-pressed={!yrtOn}
					data-tooltip="Hide YRT content from pickers (existing data preserved)">Off</button
				>
			</div>
		</div>

		<!-- ─── Claude AI ─── -->
		<div class="sd-section-heading">Claude AI</div>

		<div class="sd-row sd-row-stack">
			<span class="sd-label">API Key</span>
			<div class="sd-key-row">
				<input
					class="sd-input sd-key-input"
					type={aiKeyVisible ? 'text' : 'password'}
					autocomplete="off"
					spellcheck="false"
					placeholder="sk-ant-…"
					value={aiKey}
					oninput={(e) => applyAiKey((e.currentTarget as HTMLInputElement).value)}
				/>
				<button
					class="sd-key-btn"
					type="button"
					onclick={() => (aiKeyVisible = !aiKeyVisible)}
					data-tooltip={aiKeyVisible ? 'Hide key' : 'Show key'}
					aria-label={aiKeyVisible ? 'Hide key' : 'Show key'}
				>
					{aiKeyVisible ? 'Hide' : 'Show'}
				</button>
				<button
					class="sd-key-btn"
					type="button"
					onclick={runAiTest}
					disabled={!aiKey.trim() || aiTestState === 'testing'}
					data-tooltip="Send a 1-token request to verify the key"
				>
					{aiTestState === 'testing' ? 'Testing…' : 'Test'}
				</button>
			</div>
		</div>

		{#if aiTestMessage}
			<div
				class="sd-test-msg"
				class:sd-test-ok={aiTestState === 'ok'}
				class:sd-test-err={aiTestState === 'error'}
			>
				{aiTestMessage}
			</div>
		{/if}

		<div class="sd-hint">
			Stored on this device only. Anyone with code-execution on this origin can read it — rotate the
			key if the machine is compromised.
		</div>

		<div class="sd-row sd-row-stack">
			<span class="sd-label">Model</span>
			<select
				class="sd-input"
				value={aiModel}
				onchange={(e) => applyAiModel((e.currentTarget as HTMLSelectElement).value as AIModelId)}
			>
				{#each AI_MODELS as m (m.id)}
					<option value={m.id}>{m.label} — {m.tagline}</option>
				{/each}
			</select>
		</div>

		<div class="sd-row sd-row-stack">
			<span class="sd-label">Setup Instructions</span>
			<textarea
				class="sd-input sd-setup"
				rows="4"
				placeholder="Tone, POV, tense, character voice…"
				value={aiSetup}
				oninput={(e) => applyAiSetup((e.currentTarget as HTMLTextAreaElement).value)}
			></textarea>
			<div class="sd-hint sd-hint-tight">
				Prefilled into every recording; editable there without changing this default.
			</div>
		</div>
	</div>
</dialog>

<style>
	/* ── Dialog shell ────────────────────────────────────────────────────── */
	.settings-dialog {
		border: none;
		padding: 0;
		border-radius: 10px;
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: min(360px, calc(100vw - 2rem));
		background: var(--bg-card);
		color: var(--text);
		box-shadow:
			0 16px 48px #00000070,
			0 0 0 1px var(--border-mid);
		outline: none;
	}
	.settings-dialog[open] {
		display: flex;
		flex-direction: column;
	}
	.settings-dialog::backdrop {
		background: #00000060;
		backdrop-filter: blur(1px);
	}

	/* ── Header ─────────────────────────────────────────────────────────── */
	/* ── Body ────────────────────────────────────────────────────────────── */
	.sd-body {
		padding: 16px 14px;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}

	/* ── Setting row ─────────────────────────────────────────────────────── */
	.sd-row {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.sd-label {
		font-family: var(--font-ui);
		font-size: 0.73rem;
		font-weight: 600;
		color: var(--text-muted);
		min-width: 82px;
	}

	/* ── Segmented control ───────────────────────────────────────────────── */
	.sd-seg {
		display: flex;
		border: 1px solid var(--border-mid);
		border-radius: 5px;
		overflow: hidden;
	}
	.sd-seg-btn {
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
	.sd-seg-btn:last-child {
		border-right: none;
	}
	.sd-seg-btn:hover:not(.active) {
		background: var(--bg-hover);
		color: var(--text-muted);
	}
	.sd-seg-btn.active {
		background: var(--bg-hover);
		color: var(--text-accent);
		font-weight: 600;
	}
	.sd-seg-icon {
		display: flex;
		align-items: center;
		line-height: 0;
	}
	.sd-seg-icon :global(svg) {
		width: 11px;
		height: 11px;
		fill: currentColor;
	}

	/* ── Claude AI section ──────────────────────────────────────────────── */
	.sd-section-heading {
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

	.sd-row-stack {
		flex-direction: column;
		align-items: stretch;
		gap: 4px;
	}
	.sd-row-stack .sd-label {
		min-width: 0;
	}

	.sd-input {
		width: 100%;
		box-sizing: border-box;
		padding: 5px 8px;
		background: var(--bg-control);
		color: var(--text);
		border: 1px solid var(--border-mid);
		border-radius: 4px;
		font-family: var(--font-ui);
		font-size: 0.78rem;
	}
	.sd-input:focus {
		outline: none;
		border-color: var(--text-accent);
	}

	.sd-key-row {
		display: flex;
		gap: 4px;
	}
	.sd-key-input {
		flex: 1;
		min-width: 0;
		font-family: var(--font-mono, ui-monospace, monospace);
		letter-spacing: 0.02em;
	}
	.sd-key-btn {
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
	.sd-key-btn:hover:not(:disabled) {
		color: var(--text);
		border-color: var(--text-accent);
	}
	.sd-key-btn:disabled {
		opacity: 0.4;
		cursor: default;
	}

	.sd-setup {
		font-family: var(--font-ui);
		resize: vertical;
		min-height: 60px;
		line-height: 1.4;
	}

	.sd-hint {
		font-family: var(--font-ui);
		font-size: 0.68rem;
		color: var(--text-dimmer);
		line-height: 1.4;
	}
	.sd-hint-tight {
		margin-top: 2px;
	}

	.sd-test-msg {
		font-family: var(--font-ui);
		font-size: 0.7rem;
		padding: 4px 8px;
		border-radius: 4px;
		background: var(--bg-inset);
	}
	.sd-test-ok {
		color: var(--color-success, #34d399);
	}
	.sd-test-err {
		color: var(--color-danger, #ef4444);
	}
</style>
