<script lang="ts">
	/**
	 * AiConfigDialog — per-provider AI companion configuration.
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
	import DialogHeader from '$lib/components/DialogHeader.svelte';
	import {
		type AiProvider,
		PROVIDER_LABEL,
		PROVIDER_HELP,
		MODELS,
		DEFAULT_MODEL,
		DEFAULT_SETUP,
		providerView,
		loadAiConfig,
		saveProviderConfig,
		clearProviderKey,
		testProviderKey,
	} from '$lib/aiSettings.svelte.js';

	let dialogEl = $state<HTMLDialogElement | null>(null);
	let provider = $state<AiProvider>('claude');

	let keyInput = $state(''); // new key to save ('' = keep existing)
	let keyVisible = $state(false);
	let hasStoredKey = $state(false);
	let model = $state('');
	let setup = $state('');
	let testState = $state<'idle' | 'testing' | 'ok' | 'error'>('idle');
	let testMessage = $state('');
	let saveState = $state<'idle' | 'saving' | 'saved'>('idle');

	const label = $derived(PROVIDER_LABEL[provider]);
	const help = $derived(PROVIDER_HELP[provider]);
	const models = $derived(MODELS[provider]);

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
		model = view.model ?? DEFAULT_MODEL[p];
		setup = view.setup ?? DEFAULT_SETUP;
		dialogEl?.showModal();
	}

	export function close() {
		dialogEl?.close();
	}

	async function handleTest() {
		testState = 'testing';
		testMessage = '';
		// Persist the entered key first so the server can test it.
		await saveProviderConfig(provider, {
			model,
			setup,
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
			setup,
			...(keyInput.trim() ? { key: keyInput.trim() } : {}),
		});
		if (keyInput.trim()) {
			hasStoredKey = true;
			keyInput = '';
		}
		saveState = 'saved';
		dialogEl?.close();
	}

	async function handleClearKey() {
		await clearProviderKey(provider);
		hasStoredKey = false;
		keyInput = '';
		testState = 'idle';
		testMessage = '';
	}
</script>

<dialog bind:this={dialogEl} class="ac-dialog" oncancel={close}>
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
					placeholder={hasStoredKey ? '•••••• (stored — leave blank to keep)' : help.placeholder}
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
					disabled={testState === 'testing' || (!keyInput.trim() && !hasStoredKey)}
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
			<select class="ac-input" bind:value={model}>
				{#each models as m (m.id)}
					<option value={m.id}>{m.label} — {m.tagline}</option>
				{/each}
			</select>
		</div>

		<div class="ac-field">
			<span class="ac-label">Setup Instructions</span>
			<textarea
				class="ac-input ac-setup"
				rows="4"
				placeholder="Tone, POV, tense, character voice…"
				bind:value={setup}
			></textarea>
			<div class="ac-hint ac-hint-tight">Sent as the system prompt for every story.</div>
		</div>
	</div>

	<div class="ac-footer">
		<button class="btn" onclick={close}>Cancel</button>
		<button class="btn btn-primary" onclick={handleSave} disabled={saveState === 'saving'}>
			{saveState === 'saving' ? 'Saving…' : 'Save'}
		</button>
	</div>
</dialog>

<style>
	.ac-dialog {
		border: none;
		padding: 0;
		border-radius: 10px;
		position: fixed;
		top: 50%;
		left: 50%;
		margin: 0;
		transform: translate(-50%, -50%);
		width: min(380px, calc(100vw - 2rem));
		max-height: 82vh;
		overflow: hidden;
		background: var(--bg-card);
		color: var(--text);
		box-shadow:
			0 16px 48px #00000070,
			0 0 0 1px var(--border-mid);
		outline: none;
	}
	.ac-dialog::backdrop {
		background: #00000060;
		backdrop-filter: blur(1px);
	}

	.ac-body {
		padding: 14px;
		display: flex;
		flex-direction: column;
		gap: 12px;
		max-height: calc(82vh - 8rem);
		overflow-y: auto;
		overscroll-behavior: contain;
	}

	.ac-field {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.ac-label {
		font-family: var(--font-ui);
		font-size: 0.72rem;
		font-weight: 600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.ac-input {
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
	.ac-input:focus {
		outline: none;
		border-color: var(--text-accent);
	}
	.ac-setup {
		resize: vertical;
		min-height: 72px;
		line-height: 1.4;
	}
	.ac-key-row {
		display: flex;
		gap: 6px;
	}
	.ac-key-input {
		flex: 1;
		min-width: 0;
	}
	.ac-key-btn {
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
	.ac-key-btn:hover:not(:disabled) {
		color: var(--text);
		border-color: var(--text-accent);
	}
	.ac-key-btn:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.ac-clear-btn {
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
	.ac-hint {
		font-family: var(--font-ui);
		font-size: 0.72rem;
		color: var(--text-muted);
		line-height: 1.4;
	}
	.ac-hint-tight {
		font-size: 0.66rem;
		color: var(--text-dimmer);
	}
	.ac-test-msg {
		font-family: var(--font-ui);
		font-size: 0.72rem;
	}
	.ac-test-ok {
		color: var(--color-success, #4ade80);
	}
	.ac-test-err {
		color: var(--color-danger, #ef4444);
	}

	.ac-footer {
		display: flex;
		justify-content: flex-end;
		gap: 6px;
		padding: 0 14px 14px;
	}
</style>
