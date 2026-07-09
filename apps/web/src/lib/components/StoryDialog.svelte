<script lang="ts">
	/**
	 * StoryDialog — AI prose generation flow.
	 *
	 * Two modes on the same dialog shell:
	 *   • 'setup'    — opened when the user hits ● Start Story. Lets them
	 *                  review/edit the setup instructions and model, then
	 *                  Begin Recording (marker set on the log).
	 *   • 'generate' — opened when the user hits ■ Stop Story. Streams the
	 *                  prose from Claude, offers Copy / Save to Log / Discard.
	 *
	 * External API:
	 *   ref.openSetup()      → mode = 'setup'
	 *   ref.openGenerate()   → mode = 'generate' (uses the captured section
	 *                          from storyRecorder)
	 */

	import { headingText } from '$lib/fontStore.svelte.js';
	import DialogHeader from '$lib/components/DialogHeader.svelte';
	import {
		AI_MODELS,
		type AIModelId,
		getApiKey,
		getModel,
		getSetup,
		hasApiKey,
		getIncludePreface,
		setIncludePreface,
	} from '$lib/aiSettings.svelte.js';
	import {
		beginRecording,
		captureSection,
		cancelRecording,
		recordingModel,
		recordingSetup,
	} from '$lib/storyRecorder.svelte.js';
	import {
		serializeLogSection,
		estimateTokens,
		buildStoryPreface,
		castSummary,
		type PrefaceFoe,
		type PrefaceExpedition,
	} from '$lib/aiSerialize.js';
	import { streamStory } from '$lib/aiStream.js';
	import { appendLog } from '$lib/log.svelte.js';
	import { renderNote } from '$lib/markdown.js';
	import { getActiveDiceCtx } from '$lib/diceContext.svelte.js';
	import { getActiveFoeId, getActiveExpeditionId } from '$lib/activeContext.svelte.js';
	import { getEncounters } from '$lib/encounterStore.svelte.js';
	import { findFoe, resolveFoeDescription } from '$lib/foeStore.svelte.js';
	import { getExpeditions } from '$lib/expeditionStore.svelte.js';

	let dialogEl = $state<HTMLDialogElement | null>(null);
	let mode = $state<'setup' | 'generate'>('setup');

	// setup mode
	let setupText = $state('');
	let modelId = $state<AIModelId>('claude-haiku-4-5');

	// generate mode
	let prefaceText = $state(''); // "Cast & setting" block ('' if no context)
	let logText = $state(''); // serialized captured log section
	let includePreface = $state(true); // toggle — persisted in aiSettings
	// Final prompt = optional preface + the events. Reacts to the toggle so the
	// token estimate and Start payload update live when the checkbox flips.
	const promptText = $derived(
		includePreface && prefaceText ? `${prefaceText}\n\n# What happened\n\n${logText}` : logText,
	);
	const promptTokens = $derived(estimateTokens(promptText));
	let output = $state('');
	// Light markdown rendered to HTML for the live preview — matches what
	// Save to Log stores. renderNote HTML-escapes all text, so {@html} is safe.
	const renderedOutput = $derived(renderNote(output));
	let streaming = $state(false);
	let doneStreaming = $state(false);
	let errorMsg = $state('');
	let capturedCount = $state(0);
	let castLine = $state('');
	let abortCtl: AbortController | null = null;
	let outputEl = $state<HTMLDivElement | null>(null);

	function autoScroll() {
		if (outputEl) outputEl.scrollTop = outputEl.scrollHeight;
	}

	export function openSetup() {
		mode = 'setup';
		setupText = getSetup();
		modelId = getModel();
		errorMsg = '';
		dialogEl?.showModal();
	}

	/** Resolve the live foe (active encounter) into plain preface data, or null. */
	function activeFoeInfo(): PrefaceFoe | null {
		const id = getActiveFoeId();
		if (!id) return null;
		const enc = getEncounters().find((e) => e.id === id);
		if (!enc) return null;
		const def = findFoe(enc.foeId);
		if (!def) return null;
		return {
			name: enc.customName || def.name,
			nature: def.nature,
			rank: enc.effectiveRank,
			description: resolveFoeDescription(def),
			notes: enc.notes ?? '',
		};
	}

	/** Resolve the active expedition (journey or site) into plain preface data. */
	function activeExpeditionInfo(): PrefaceExpedition | null {
		const id = getActiveExpeditionId();
		if (!id) return null;
		const exp = getExpeditions().find((e) => e.id === id);
		if (!exp) return null;
		return {
			name: exp.name,
			kind: exp.type,
			difficulty: exp.difficulty,
			theme: exp.type === 'site' ? exp.theme : '',
			domain: exp.type === 'site' ? exp.domain : '',
			objective: exp.type === 'site' ? exp.objective : '',
			notes: exp.notes ?? '',
		};
	}

	export function openGenerate() {
		mode = 'generate';
		const section = captureSection();
		capturedCount = section.length;
		setupText = recordingSetup();
		modelId = recordingModel();

		// Build the optional "Cast & setting" preface (active character + live foe +
		// expedition) so the model has narrative grounding rather than inferring
		// identity from rolls. Whether it's actually sent is governed by the toggle.
		const ctx = getActiveDiceCtx();
		const character = ctx ? { name: ctx.data.name, background: ctx.data.background } : null;
		const foe = activeFoeInfo();
		const expedition = activeExpeditionInfo();
		castLine = castSummary(character, foe, expedition);
		prefaceText = buildStoryPreface(character, foe, expedition);
		logText = serializeLogSection(section, document);
		includePreface = getIncludePreface();

		output = '';
		streaming = false;
		doneStreaming = false;
		errorMsg = '';
		dialogEl?.showModal();
	}

	export function close() {
		if (streaming) abortCtl?.abort();
		dialogEl?.close();
	}

	// ── Setup actions ──────────────────────────────────────────────────────
	function handleBegin() {
		beginRecording(setupText, modelId);
		dialogEl?.close();
	}

	function handleCancelSetup() {
		dialogEl?.close();
	}

	// ── Generate actions ───────────────────────────────────────────────────
	async function handleStart() {
		if (!hasApiKey()) {
			errorMsg = 'No API key configured. Add one in Settings.';
			return;
		}
		if (!promptText.trim()) {
			errorMsg = 'The recorded section is empty.';
			return;
		}
		output = '';
		errorMsg = '';
		streaming = true;
		doneStreaming = false;
		abortCtl = new AbortController();
		await streamStory({
			apiKey: getApiKey(),
			model: modelId,
			system: setupText,
			user: promptText,
			signal: abortCtl.signal,
			onText: (acc) => {
				output = acc;
				queueMicrotask(autoScroll);
			},
			onDone: (acc) => {
				output = acc;
				streaming = false;
				doneStreaming = true;
			},
			onError: (msg) => {
				errorMsg = msg;
				streaming = false;
				doneStreaming = output.length > 0;
			},
		});
	}

	function handleStop() {
		abortCtl?.abort();
	}

	async function handleCopy() {
		try {
			await navigator.clipboard.writeText(output);
		} catch {
			/* clipboard blocked; user can select manually */
		}
	}

	function handleSaveToLog() {
		// renderNote turns the model's light markdown (**bold**, *italic*, lists,
		// paragraphs) into HTML and HTML-escapes all text, so it's safe to store
		// and render via {@html}. The log sanitizer keeps the tags it emits.
		appendLog('Story', renderNote(output));
		cancelRecording();
		dialogEl?.close();
	}

	function handleDiscardAndClose() {
		cancelRecording();
		dialogEl?.close();
	}
</script>

<dialog bind:this={dialogEl} class="story-dialog" oncancel={close}>
	<DialogHeader
		title={headingText(mode === 'setup' ? 'Start Story' : 'Generate Story')}
		onclose={close}
	/>

	<div class="sd-body">
		{#if mode === 'setup'}
			<div class="sd-hint">
				Starting recording marks the current top of the log. Every entry from now until <strong
					>Stop</strong
				> becomes the section.
			</div>

			<label class="sd-field">
				<span class="sd-label">Setup Instructions</span>
				<textarea
					class="sd-input sd-setup"
					rows="5"
					placeholder="Tone, POV, tense…"
					bind:value={setupText}
				></textarea>
				<span class="sd-hint sd-hint-tight">
					Prefilled from Settings. Editing here does not change the default.
				</span>
			</label>

			<label class="sd-field">
				<span class="sd-label">Model</span>
				<select class="sd-input" bind:value={modelId}>
					{#each AI_MODELS as m (m.id)}
						<option value={m.id}>{m.label} — {m.tagline}</option>
					{/each}
				</select>
			</label>
		{:else}
			<div class="sd-preview">
				<div>
					<strong>{capturedCount}</strong>
					{capturedCount === 1 ? 'entry' : 'entries'} captured, ≈ {promptTokens} input tokens.
				</div>
				<div class="sd-hint">Model: <strong>{modelId}</strong></div>
				{#if prefaceText}
					<label class="sd-toggle">
						<input
							type="checkbox"
							bind:checked={includePreface}
							onchange={() => setIncludePreface(includePreface)}
						/>
						<span
							>Include cast &amp; setting{#if castLine}:
								<strong>{castLine}</strong>{/if}</span
						>
					</label>
				{/if}
			</div>

			<div class="sd-output-wrap">
				<div class="sd-output" bind:this={outputEl} aria-live="polite">
					{#if output}
						{@html renderedOutput}
					{:else if streaming}
						<span class="sd-placeholder">Waiting for first tokens…</span>
					{:else}
						<span class="sd-placeholder">Press Start to generate.</span>
					{/if}
				</div>
			</div>

			{#if errorMsg}
				<div class="sd-error">{errorMsg}</div>
			{/if}
		{/if}
	</div>

	<div class="sd-footer">
		{#if mode === 'setup'}
			<button class="btn" onclick={handleCancelSetup}>Cancel</button>
			<button class="btn btn-primary" onclick={handleBegin}>Begin Recording</button>
		{:else if streaming}
			<button class="btn btn-danger" onclick={handleStop}>Stop</button>
		{:else if doneStreaming}
			<button class="btn" onclick={handleDiscardAndClose}>Discard</button>
			<button class="btn" onclick={handleCopy}>Copy</button>
			<button class="btn btn-primary" onclick={handleSaveToLog}>Save to Log</button>
		{:else}
			<button class="btn" onclick={handleDiscardAndClose}>Discard</button>
			<button class="btn btn-primary" onclick={handleStart} disabled={!promptText.trim()}
				>Start</button
			>
		{/if}
	</div>
</dialog>

<style>
	.story-dialog {
		border: none;
		padding: 0;
		border-radius: 10px;
		position: fixed;
		top: 50%;
		left: 50%;
		margin: 0;
		transform: translate(-50%, -50%);
		width: min(520px, calc(100vw - 2rem));
		max-height: 82vh;
		overflow: hidden;
		background: var(--bg-card);
		color: var(--text);
		box-shadow:
			0 16px 48px #00000070,
			0 0 0 1px var(--border-mid);
		outline: none;
	}
	.story-dialog::backdrop {
		background: #00000060;
		backdrop-filter: blur(1px);
	}

	.sd-body {
		padding: 14px;
		display: flex;
		flex-direction: column;
		gap: 12px;
		max-height: calc(82vh - 8rem);
		overflow-y: auto;
		overscroll-behavior: contain;
	}

	.sd-field {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.sd-label {
		font-family: var(--font-ui);
		font-size: 0.72rem;
		font-weight: 600;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--text-muted);
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
		font-size: 0.82rem;
	}
	.sd-input:focus {
		outline: none;
		border-color: var(--text-accent);
	}
	.sd-setup {
		resize: vertical;
		min-height: 72px;
		line-height: 1.4;
	}
	.sd-hint {
		font-family: var(--font-ui);
		font-size: 0.72rem;
		color: var(--text-muted);
		line-height: 1.4;
	}
	.sd-hint-tight {
		font-size: 0.66rem;
		color: var(--text-dimmer);
	}

	.sd-preview {
		font-family: var(--font-ui);
		font-size: 0.78rem;
		color: var(--text);
		padding: 6px 8px;
		background: var(--bg-inset);
		border-radius: 4px;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.sd-toggle {
		display: flex;
		align-items: flex-start;
		gap: 6px;
		margin-top: 2px;
		font-family: var(--font-ui);
		font-size: 0.72rem;
		color: var(--text-muted);
		line-height: 1.4;
		cursor: pointer;
	}
	.sd-toggle input {
		margin-top: 1px;
		flex-shrink: 0;
		accent-color: var(--text-accent);
		cursor: pointer;
	}
	.sd-toggle strong {
		color: var(--text);
	}

	.sd-output-wrap {
		border: 1px solid var(--border-mid);
		border-radius: 4px;
		background: var(--bg-control);
	}
	.sd-output {
		padding: 10px 12px;
		font-family: var(--font-ui);
		font-size: 0.86rem;
		line-height: 1.55;
		color: var(--text);
		min-height: 180px;
		max-height: 40vh;
		overflow-y: auto;
		overscroll-behavior: contain;
	}
	/* Rendered light-markdown prose (matches the saved Story log entry).
	   renderNote separates blocks with <br>, and the global reset zeroes
	   margins — so we only indent lists and style the inline marks here. */
	.sd-output :global(strong) {
		color: var(--text);
		font-weight: 600;
	}
	.sd-output :global(em) {
		font-style: italic;
	}
	.sd-output :global(ul),
	.sd-output :global(ol) {
		padding-left: 1.25em;
	}
	.sd-placeholder {
		color: var(--text-dimmer);
		font-style: italic;
	}
	.sd-error {
		font-family: var(--font-ui);
		font-size: 0.72rem;
		color: var(--color-danger, #ef4444);
	}

	.sd-footer {
		display: flex;
		justify-content: flex-end;
		gap: 6px;
		padding: 10px 14px;
		border-top: 1px solid var(--border);
		background: var(--bg-inset);
	}
</style>
