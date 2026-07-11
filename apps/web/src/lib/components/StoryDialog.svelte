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
		getIncludePreface,
		setIncludePreface,
		hasActiveStoryteller,
		getActiveProvider,
		getSetup,
		PROVIDER_LABEL,
		loadAiConfig,
	} from '$lib/aiSettings.svelte.js';
	import { beginRecording, captureSection, cancelRecording } from '$lib/storyRecorder.svelte.js';
	import {
		serializeLogSection,
		estimateTokens,
		buildStoryPreface,
		castSummary,
		sectionText,
		mentions,
		referencedCharIds,
		referencedRollIds,
		parseStorySource,
		type PrefaceCharacter,
		type PrefaceFoe,
		type PrefaceExpedition,
	} from '$lib/aiSerialize.js';
	import { streamStory } from '$lib/aiStream.js';
	import { appendLog, updateLogEntryHtml } from '$lib/log.svelte.js';
	import { renderNote } from '$lib/markdown.js';
	import type { LogEntry } from '$lib/log.svelte.js';
	import { getEncounters } from '$lib/encounterStore.svelte.js';
	import { findFoe, resolveFoeDescription } from '$lib/foeStore.svelte.js';
	import { getExpeditions } from '$lib/expeditionStore.svelte.js';
	import { getCharacters } from '$lib/characterStore.svelte.js';
	import { findAsset } from '$lib/assetStore.svelte.js';
	import type { CharacterData } from '$lib/types.js';

	let dialogEl = $state<HTMLDialogElement | null>(null);
	let mode = $state<'setup' | 'generate'>('setup');

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
	let editingOutput = $state(false); // after streaming, let the user tweak the prose
	let errorMsg = $state('');
	let capturedCount = $state(0);
	let castLine = $state('');
	let storyTitle = $state(''); // user-chosen log-entry title for a new story
	// Regenerate mode: reuse the same generate UI to re-run an existing Story
	// entry's stored prompt and replace it in place.
	let regenerating = $state(false);
	let regenerateEntryId = $state('');
	// The exact user prompt sent (captured at Start) — persisted with the saved
	// Story entry so it can be regenerated later.
	let usedUser = '';
	// Which storyteller is active — the key/model live server-side now.
	const storytellerReady = $derived(hasActiveStoryteller());
	const storytellerLabel = $derived.by(() => {
		const p = getActiveProvider();
		return p ? PROVIDER_LABEL[p] : 'None';
	});
	let abortCtl: AbortController | null = null;
	let outputEl = $state<HTMLDivElement | null>(null);

	function autoScroll() {
		if (outputEl) outputEl.scrollTop = outputEl.scrollHeight;
	}

	export function openSetup() {
		mode = 'setup';
		errorMsg = '';
		loadAiConfig();
		dialogEl?.showModal();
	}

	// ── Preface: scan the captured section for referenced entities ──────────
	// Instead of the single active entity, describe every character/foe/expedition
	// the section actually mentions. Characters are matched by id (roll.charId +
	// data-char-id) and by name; foes and expeditions by name in the section text.

	function charToPreface(data: CharacterData): PrefaceCharacter {
		return {
			name: data.name,
			background: data.background,
			assets: (data.assets ?? []).map((a) => findAsset(a.assetId)?.name ?? '').filter(Boolean),
			vows: (data.vows ?? []).map((v) => ({
				name: v.name,
				difficulty: v.difficulty,
				threat: v.threat,
			})),
		};
	}

	function scanCharacters(section: LogEntry[], text: string): PrefaceCharacter[] {
		const ids = new Set(referencedCharIds(section, document));
		const out: PrefaceCharacter[] = [];
		for (const c of getCharacters()) {
			const data = c.data as unknown as CharacterData;
			if (ids.has(c.id) || mentions(text, data.name)) out.push(charToPreface(data));
		}
		return out;
	}

	function scanFoes(section: LogEntry[], text: string): PrefaceFoe[] {
		const ids = new Set(referencedRollIds(section, 'foeId'));
		const out: PrefaceFoe[] = [];
		for (const enc of getEncounters()) {
			const def = findFoe(enc.foeId);
			if (!def) continue;
			const name = enc.customName || def.name;
			if (!ids.has(enc.id) && !mentions(text, name)) continue;
			out.push({
				name,
				nature: def.nature,
				rank: enc.effectiveRank,
				description: resolveFoeDescription(def),
				notes: enc.notes ?? '',
			});
		}
		return out;
	}

	function scanExpeditions(section: LogEntry[], text: string): PrefaceExpedition[] {
		const ids = new Set(referencedRollIds(section, 'expeditionId'));
		return getExpeditions()
			.filter((exp) => ids.has(exp.id) || mentions(text, exp.name))
			.map((exp) => ({
				name: exp.name,
				kind: exp.type,
				difficulty: exp.difficulty,
				theme: exp.type === 'site' ? exp.theme : '',
				domain: exp.type === 'site' ? exp.domain : '',
				objective: exp.type === 'site' ? exp.objective : '',
				notes: exp.notes ?? '',
			}));
	}

	export function openGenerate() {
		mode = 'generate';
		loadAiConfig();
		const section = captureSection();
		capturedCount = section.length;

		// Build the optional "Cast & setting" preface from every entity the captured
		// section references, so the model has narrative grounding rather than
		// inferring identity from rolls. Whether it's sent is governed by the toggle.
		const text = sectionText(section, document);
		const characters = scanCharacters(section, text);
		const foes = scanFoes(section, text);
		const expeditions = scanExpeditions(section, text);
		castLine = castSummary(characters, foes, expeditions);
		prefaceText = buildStoryPreface(characters, foes, expeditions);
		logText = serializeLogSection(section, document);
		includePreface = getIncludePreface();
		storyTitle = castLine || 'Story';

		regenerating = false;
		regenerateEntryId = '';
		output = '';
		streaming = false;
		doneStreaming = false;
		editingOutput = false;
		errorMsg = '';
		dialogEl?.showModal();
	}

	/**
	 * Re-run an existing Story entry from its persisted prompt (stored as JSON in
	 * the entry's `source`). Reuses the generate UI but replaces the entry in
	 * place on save instead of appending a new one.
	 */
	export function openRegenerate(entryId: string, source: string) {
		const parsed = parseStorySource(source);
		if (!parsed) return; // not a regeneratable Story entry

		mode = 'generate';
		loadAiConfig();
		regenerating = true;
		regenerateEntryId = entryId;
		// Feed the stored prompt straight through: no re-scan, no toggle. The
		// active provider's setup/model are used.
		logText = parsed.user;
		prefaceText = '';
		includePreface = false;
		castLine = '';
		capturedCount = 0;

		output = '';
		streaming = false;
		doneStreaming = false;
		editingOutput = false;
		errorMsg = '';
		dialogEl?.showModal();
	}

	export function close() {
		if (streaming) abortCtl?.abort();
		dialogEl?.close();
	}

	// ── Setup actions ──────────────────────────────────────────────────────
	function handleBegin() {
		beginRecording();
		dialogEl?.close();
	}

	function handleCancelSetup() {
		dialogEl?.close();
	}

	// ── Generate actions ───────────────────────────────────────────────────
	async function handleStart() {
		if (!storytellerReady) {
			errorMsg = 'No AI storyteller configured. Choose one in Settings.';
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
		editingOutput = false;
		// Snapshot the exact prompt being sent so Save can persist it for regenerate.
		usedUser = promptText;
		abortCtl = new AbortController();
		await streamStory({
			user: promptText,
			system: getSetup(),
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
		const html = renderNote(output);
		// Persist the prompt (for Regenerate) and the raw markdown (for Export) in
		// `source`, tagged so the entry is identifiable regardless of its title.
		const source = JSON.stringify({
			kind: 'story',
			user: usedUser,
			md: output,
		});
		if (regenerating) {
			// Keep the existing entry's title; just refresh the body and payload.
			updateLogEntryHtml(regenerateEntryId, html, source);
		} else {
			appendLog(storyTitle.trim() || 'Story', html, undefined, source);
			cancelRecording();
		}
		dialogEl?.close();
	}

	function handleDiscardAndClose() {
		// Regenerate leaves the original entry untouched and must not clear an
		// unrelated in-progress recording.
		if (!regenerating) cancelRecording();
		dialogEl?.close();
	}
</script>

<dialog bind:this={dialogEl} class="story-dialog" oncancel={close}>
	<DialogHeader
		title={headingText(
			mode === 'setup' ? 'Start Story' : regenerating ? 'Regenerate Story' : 'Generate Story',
		)}
		onclose={close}
	/>

	<div class="sd-body">
		{#if mode === 'setup'}
			<div class="sd-hint">
				Starting recording marks the current top of the log. Every entry from now until <strong
					>Stop</strong
				> becomes the section.
			</div>

			<div class="sd-preview">
				<div class="sd-hint">Storyteller: <strong>{storytellerLabel}</strong></div>
				{#if !storytellerReady}
					<div class="sd-hint sd-hint-tight">
						Choose an AI storyteller and add a key in Settings to generate a story.
					</div>
				{/if}
			</div>
		{:else}
			<div class="sd-preview">
				<div>
					{#if regenerating}
						Regenerating from the saved prompt, ≈ {promptTokens} input tokens.
					{:else}
						<strong>{capturedCount}</strong>
						{capturedCount === 1 ? 'entry' : 'entries'} captured, ≈ {promptTokens} input tokens.
					{/if}
				</div>
				<div class="sd-hint">Storyteller: <strong>{storytellerLabel}</strong></div>
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

			{#if !regenerating}
				<label class="sd-field">
					<span class="sd-label">Title</span>
					<input class="sd-input" type="text" placeholder="Story title…" bind:value={storyTitle} />
					<span class="sd-hint sd-hint-tight">Shown as the log entry's heading.</span>
				</label>
			{/if}

			<div class="sd-output-wrap">
				{#if doneStreaming && output && editingOutput}
					<textarea
						class="sd-output sd-output-edit"
						bind:value={output}
						aria-label="Edit generated prose"
					></textarea>
				{:else}
					<div class="sd-output" bind:this={outputEl} aria-live="polite">
						{#if output}
							{@html renderedOutput}
						{:else if streaming}
							<span class="sd-placeholder">Waiting for first tokens…</span>
						{:else}
							<span class="sd-placeholder">Press Start to generate.</span>
						{/if}
					</div>
				{/if}
				{#if doneStreaming && output}
					<button
						class="sd-edit-toggle"
						type="button"
						onclick={() => (editingOutput = !editingOutput)}
					>
						{editingOutput ? 'Preview' : 'Edit'}
					</button>
				{/if}
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
		position: relative;
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
	/* Editable raw-markdown view — same footprint as the rendered box. */
	textarea.sd-output-edit {
		display: block;
		width: 100%;
		box-sizing: border-box;
		border: none;
		background: transparent;
		resize: vertical;
		white-space: pre-wrap;
	}
	textarea.sd-output-edit:focus {
		outline: none;
	}
	.sd-edit-toggle {
		position: absolute;
		top: 6px;
		right: 6px;
		padding: 2px 8px;
		font-family: var(--font-ui);
		font-size: 0.66rem;
		font-weight: 600;
		letter-spacing: 0.03em;
		color: var(--text-muted);
		background: var(--bg-inset);
		border: 1px solid var(--border-mid);
		border-radius: 4px;
		cursor: pointer;
	}
	.sd-edit-toggle:hover {
		color: var(--text);
		border-color: var(--text-accent);
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
