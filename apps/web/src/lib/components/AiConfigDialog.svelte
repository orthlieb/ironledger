<script lang="ts">
	/**
	 * AiConfigDialog — per-provider AI storyteller configuration.
	 *
	 * Opened from SettingsDialog for a single provider (Claude / ChatGPT). Holds
	 * the API key (encrypted at rest server-side), model, and setup instructions.
	 * The key is never returned to the client — the dialog only reports whether
	 * one is stored (hasKey). Saving with an empty key field keeps the stored key.
	 *
	 * Usage:
	 *   <AiConfigDialog bind:this={ref} />
	 *   ref.openFor('claude')
	 */

	import { headingText } from '$lib/fontStore.svelte.js';
	import { Dialog } from 'bits-ui';
	import DialogHeader from '$lib/components/DialogHeader.svelte';
	import Select from '$lib/components/Select.svelte';
	import {
		type AiProvider,
		PROVIDER_LABEL,
		PROVIDER_HELP,
		MODELS,
		providerView,
		loadAiConfig,
		saveProviderConfig,
		clearProviderKey,
		testProviderKey,
	} from '$lib/aiSettings.svelte.js';

	let dialogOpen = $state(false);
	let provider = $state<AiProvider>('claude');

	let keyInput = $state(''); // new key to save ('' = keep existing)
	let keyVisible = $state(false);
	let hasStoredKey = $state(false);
	let model = $state('');
	let testState = $state<'idle' | 'testing' | 'ok' | 'error'>('idle');
	let testMessage = $state('');
	let saveState = $state<'idle' | 'saving' | 'saved'>('idle');

	const label = $derived(PROVIDER_LABEL[provider]);
	const help = $derived(PROVIDER_HELP[provider]);
	const models = $derived(MODELS[provider]);
	/** True once a valid model from the current provider's list is picked. */
	const modelPicked = $derived(!!model && models.some((m) => m.id === model));

	export async function openFor(p: AiProvider) {
		provider = p;
		keyInput = '';
		keyVisible = false;
		testState = 'idle';
		testMessage = '';
		saveState = 'idle';
		await loadAiConfig(true);
		const view = providerView(p);
		hasStoredKey = view.hasKey;
		// If the stored model is still in the provider's list, keep it.
		// Otherwise clear it so the user is forced to pick — happens when a
		// user's saved model gets retired (e.g. Gemini 2.0 → gemini-flash-latest).
		model = view.model && MODELS[p].some((m) => m.id === view.model) ? view.model : '';
		dialogOpen = true;
	}

	export function close() {
		dialogOpen = false;
	}

	async function handleTest() {
		testState = 'testing';
		testMessage = '';
		// Persist the entered key first so the server can test it.
		await saveProviderConfig(provider, {
			model,
			...(keyInput.trim() ? { key: keyInput.trim() } : {}),
		});
		if (keyInput.trim()) {
			hasStoredKey = true;
			keyInput = '';
		}
		const result = await testProviderKey(provider);
		if (result.ok) {
			testState = 'ok';
			testMessage = 'Key works.';
		} else {
			testState = 'error';
			testMessage = result.message;
		}
	}

	async function handleSave() {
		saveState = 'saving';
		await saveProviderConfig(provider, {
			model,
			...(keyInput.trim() ? { key: keyInput.trim() } : {}),
		});
		if (keyInput.trim()) {
			hasStoredKey = true;
			keyInput = '';
		}
		saveState = 'saved';
		dialogOpen = false;
	}

	async function handleClearKey() {
		await clearProviderKey(provider);
		hasStoredKey = false;
		keyInput = '';
		testState = 'idle';
		testMessage = '';
	}
</script>

<Dialog.Root bind:open={dialogOpen}>
	<Dialog.Portal>
		<Dialog.Overlay class="ac-overlay" />
		<Dialog.Content class="ac-dialog">
			<DialogHeader title={headingText(`${label} Setup`)} onclose={close} />

			<div class="ac-body">
				<div class="ac-hint">{help.help}</div>

				<div class="ac-field">
					<span class="ac-label">API Key</span>
					<div class="ac-key-row">
						<input
							class="ac-input ac-key-input"
							type={keyVisible ? 'text' : 'password'}
							autocomplete="off"
							spellcheck="false"
							placeholder={hasStoredKey
								? '•••••• (stored — leave blank to keep)'
								: help.placeholder}
							bind:value={keyInput}
							oninput={() => {
								testState = 'idle';
								testMessage = '';
							}}
						/>
						<button
							class="ac-key-btn"
							type="button"
							onclick={() => (keyVisible = !keyVisible)}
							aria-label={keyVisible ? 'Hide key' : 'Show key'}
						>
							{keyVisible ? 'Hide' : 'Show'}
						</button>
						<button
							class="ac-key-btn"
							type="button"
							onclick={handleTest}
							disabled={testState === 'testing' ||
								!modelPicked ||
								(!keyInput.trim() && !hasStoredKey)}
							title={!modelPicked ? 'Pick a model first' : undefined}
						>
							{testState === 'testing' ? 'Testing…' : 'Test'}
						</button>
					</div>
					{#if hasStoredKey}
						<button class="ac-clear-btn" type="button" onclick={handleClearKey}>
							Remove stored key
						</button>
					{/if}
				</div>

				{#if testMessage}
					<div
						class="ac-test-msg"
						class:ac-test-ok={testState === 'ok'}
						class:ac-test-err={testState === 'error'}
					>
						{testMessage}
					</div>
				{/if}

				<div class="ac-hint ac-hint-tight">
					Stored encrypted on the server; never sent back to your browser.
				</div>

				<div class="ac-field">
					<span class="ac-label">Model</span>
					<Select
						class="ac-select"
						bind:value={model}
						required
						placeholder="Select a model…"
						options={models.map((m) => ({ value: m.id, label: `${m.label} — ${m.tagline}` }))}
					/>
					{#if !modelPicked}
						<span class="ac-hint ac-hint-tight">A model must be picked to save or test.</span>
					{/if}
				</div>
			</div>

			<div class="ac-footer">
				<button class="btn" onclick={close}>Cancel</button>
				<button
					class="btn btn-primary"
					onclick={handleSave}
					disabled={saveState === 'saving' || !modelPicked}
				>
					{saveState === 'saving' ? 'Saving…' : 'Save'}
				</button>
			</div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<style>
	/* bits-ui portals Content + Overlay to <body> — scope everything
	   globally. Overlay 80 / content 81 matches the modal z-index tier. */
	:global(.ac-overlay) {
		position: fixed;
		inset: 0;
		background: #00000060;
		backdrop-filter: blur(1px);
		z-index: 80;
	}
	:global(.ac-dialog) {
		display: flex;
		flex-direction: column;
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: min(380px, calc(100vw - 2rem));
		max-height: 82vh;
		overflow: hidden;
		background: var(--bg-card);
		color: var(--text);
		border-radius: 10px;
		box-shadow:
			0 16px 48px #00000070,
			0 0 0 1px var(--border-mid);
		outline: none;
		z-index: 81;
	}

	:global(.ac-body) {
		padding: 14px;
		display: flex;
		flex-direction: column;
		gap: 12px;
		max-height: calc(82vh - 8rem);
		overflow-y: auto;
		overscroll-behavior: contain;
	}

	:global(.ac-field) {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	:global(.ac-label) {
		font-family: var(--font-ui);
		font-size: 0.72rem;
		font-weight: 600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--text-muted);
	}
	:global(.ac-input) {
		width: 100%;
		box-sizing: border-box;
		padding: 5px 8px;
		background: var(--bg-control);
		color: var(--text);
		border: 1px solid var(--border-mid);
		border-radius: 4px;
		font-family: var(--font-ui);
		font-size: 0.82rem;
	}
	:global(.ac-input:focus) {
		outline: none;
		border-color: var(--text-accent);
	}
	/* Threaded to bits-ui via `<Select class="ac-select">` so the
	   base look comes from `.bui-select-trigger`; this override just
	   fills the field width like the surrounding `.ac-input` fields. */
	:global(.ac-select) {
		width: 100%;
	}
	:global(.ac-key-row) {
		display: flex;
		gap: 6px;
	}
	:global(.ac-key-input) {
		flex: 1;
		min-width: 0;
	}
	:global(.ac-key-btn) {
		flex-shrink: 0;
		padding: 5px 10px;
		font-family: var(--font-ui);
		font-size: 0.72rem;
		font-weight: 600;
		color: var(--text-muted);
		background: var(--bg-control);
		border: 1px solid var(--border-mid);
		border-radius: 4px;
		cursor: pointer;
	}
	:global(.ac-key-btn:hover:not(:disabled)) {
		color: var(--text);
		border-color: var(--text-accent);
	}
	:global(.ac-key-btn:disabled) {
		opacity: 0.5;
		cursor: default;
	}
	:global(.ac-clear-btn) {
		align-self: flex-start;
		margin-top: 2px;
		padding: 0;
		font-family: var(--font-ui);
		font-size: 0.68rem;
		color: var(--color-danger, #ef4444);
		background: none;
		border: none;
		cursor: pointer;
		text-decoration: underline;
	}
	:global(.ac-hint) {
		font-family: var(--font-ui);
		font-size: 0.72rem;
		color: var(--text-muted);
		line-height: 1.4;
	}
	:global(.ac-hint-tight) {
		font-size: 0.66rem;
		color: var(--text-dimmer);
	}
	:global(.ac-test-msg) {
		font-family: var(--font-ui);
		font-size: 0.72rem;
	}
	:global(.ac-test-ok) {
		color: var(--color-success, #4ade80);
	}
	:global(.ac-test-err) {
		color: var(--color-danger, #ef4444);
	}

	:global(.ac-footer) {
		display: flex;
		justify-content: flex-end;
		gap: 6px;
		padding: 0 14px 14px;
	}
</style>
