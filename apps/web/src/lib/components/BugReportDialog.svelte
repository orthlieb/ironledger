<script lang="ts">
	/**
	 * BugReportDialog — in-app bug-report composer.
	 *
	 * The dialog assembles a pre-filled email (metadata + boilerplate prompts)
	 * and opens the user's mail client via mailto:. Users attach a screenshot
	 * in their own email client before sending.
	 *
	 * Deliberately no server endpoint: mailto: means no API surface to abuse,
	 * no DB table to DDoS, no Resend quota to burn. The user's email client
	 * is the rate limiter.
	 *
	 * Usage:
	 *   <BugReportDialog bind:this={ref} user={data.user} />
	 *   ref.open()
	 */

	import { draggable } from '$lib/actions/draggable.js';

	const BUG_EMAIL = 'bugs@ironledger.org';

	let { user }: { user?: { email?: string; displayName?: string } | null } = $props();

	let dialogEl = $state<HTMLDialogElement | null>(null);

	// Form state
	let doing     = $state('');
	let expected  = $state('');
	let happened  = $state('');
	let copyFlash = $state(false);

	// Diagnostics captured at open() time — we freeze these so what's shown in
	// the dialog is what gets sent, even if the user resizes mid-composition.
	let diagnostics = $state<{
		displayName: string;
		email:       string;
		route:       string;
		userAgent:   string;
		platform:    string;
		language:    string;
		timezone:    string;
		viewport:    string;
		screen:      string;
		version:     string;
		capturedAt:  string;
	} | null>(null);

	function capture() {
		if (typeof window === 'undefined') return;
		// displayName isn't in the JWT payload today, so it may be absent even
		// when signed in — fall back to email, then to "(not signed in)".
		const hasUser = !!(user?.email);
		diagnostics = {
			displayName: user?.displayName || user?.email || '(not signed in)',
			email:       hasUser ? (user!.email ?? '') : '(not signed in)',
			route:       window.location.pathname + window.location.search,
			userAgent:   navigator.userAgent,
			platform:    navigator.platform,
			language:    navigator.language,
			timezone:    Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'unknown',
			viewport:    `${window.innerWidth}\u00D7${window.innerHeight}`,
			screen:      `${screen.width}\u00D7${screen.height}`,
			version:     typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'unknown',
			capturedAt:  new Date().toISOString(),
		};
	}

	export function open() {
		capture();
		dialogEl?.showModal();
	}

	function close() {
		dialogEl?.close();
	}

	function composeReport(): { subject: string; body: string } {
		const d = diagnostics;
		const subject = '[Iron Ledger Bug] ' + (doing.trim().slice(0, 60) || 'Bug report');
		const body = [
			'## What I was trying to do',
			doing.trim() || '(not provided)',
			'',
			'## What I expected to happen',
			expected.trim() || '(not provided)',
			'',
			'## What actually happened',
			happened.trim() || '(not provided)',
			'',
			'---',
			'Diagnostics (please keep these in your email so we can reproduce):',
			d ? `User:         ${d.displayName} <${d.email}>` : '',
			d ? `Route:        ${d.route}`                    : '',
			d ? `App version:  ${d.version}`                  : '',
			d ? `Browser:      ${d.userAgent}`                : '',
			d ? `Platform:     ${d.platform}`                 : '',
			d ? `Language:     ${d.language}`                 : '',
			d ? `Timezone:     ${d.timezone}`                 : '',
			d ? `Viewport:     ${d.viewport}`                 : '',
			d ? `Screen:       ${d.screen}`                   : '',
			d ? `Captured at:  ${d.capturedAt}`               : '',
			'',
			'(Please attach a screenshot before sending, if you have one.)',
		].filter(Boolean).join('\n');
		return { subject, body };
	}

	function sendEmail() {
		const { subject, body } = composeReport();
		// Open the user's mail client. Body is URL-encoded; most clients handle
		// this reliably up to ~2000 chars. If it's longer, they should use Copy.
		const href = `mailto:${BUG_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
		window.location.href = href;
		close();
	}

	async function copyReport() {
		const { subject, body } = composeReport();
		const text = `To: ${BUG_EMAIL}\nSubject: ${subject}\n\n${body}`;
		try {
			await navigator.clipboard.writeText(text);
			copyFlash = true;
			setTimeout(() => (copyFlash = false), 1500);
		} catch {
			// Clipboard unavailable — surface a manual-select area.
			alert('Clipboard unavailable. Please select and copy the diagnostics manually.');
		}
	}

	function reset() {
		doing     = '';
		expected  = '';
		happened  = '';
		diagnostics = null;
	}
</script>

<dialog
	bind:this={dialogEl}
	class="bug-dialog"
	onclose={reset}
	oncancel={() => dialogEl?.close()}
>
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="bg-header" use:draggable>
		<span class="drag-grip" aria-hidden="true">⠿</span>
		<span class="bg-title">Report a bug</span>
		<button class="bg-close" onclick={close} aria-label="Close">&times;</button>
	</div>

	<div class="bg-body">
		<p class="bg-intro">
			Tell us what happened. We'll open your email client with everything pre-filled —
			attach a screenshot there before sending if you have one.
		</p>

		<label class="bg-field">
			<span>What were you trying to do?</span>
			<textarea
				rows="2"
				bind:value={doing}
				placeholder="e.g. Roll Face Danger from the moves dialog."
			></textarea>
		</label>

		<label class="bg-field">
			<span>What did you expect to happen?</span>
			<textarea
				rows="2"
				bind:value={expected}
				placeholder="e.g. See a d6 + 2 vs 2d10 animation and a log entry."
			></textarea>
		</label>

		<label class="bg-field">
			<span>What actually happened?</span>
			<textarea
				rows="3"
				bind:value={happened}
				placeholder="e.g. Dice panel opened but the Roll button did nothing."
			></textarea>
		</label>

		{#if diagnostics}
			<details class="bg-diag">
				<summary>Diagnostics (sent with your report)</summary>
				<dl>
					<dt>User</dt>       <dd>{diagnostics.displayName} &lt;{diagnostics.email}&gt;</dd>
					<dt>Route</dt>      <dd>{diagnostics.route}</dd>
					<dt>Version</dt>    <dd>{diagnostics.version}</dd>
					<dt>Browser</dt>    <dd class="bg-ua">{diagnostics.userAgent}</dd>
					<dt>Platform</dt>   <dd>{diagnostics.platform}</dd>
					<dt>Language</dt>   <dd>{diagnostics.language}</dd>
					<dt>Timezone</dt>   <dd>{diagnostics.timezone}</dd>
					<dt>Viewport</dt>   <dd>{diagnostics.viewport}</dd>
					<dt>Screen</dt>     <dd>{diagnostics.screen}</dd>
				</dl>
			</details>
		{/if}
	</div>

	<div class="bg-footer">
		<button type="button" class="btn" onclick={copyReport}>
			{copyFlash ? 'Copied!' : 'Copy report'}
		</button>
		<button type="button" class="btn" onclick={close}>Cancel</button>
		<button
			type="button"
			class="btn btn-primary"
			onclick={sendEmail}
			disabled={!doing.trim() && !expected.trim() && !happened.trim()}
		>Open email</button>
	</div>
</dialog>

<style>
	.bug-dialog {
		border: none;
		padding: 0;
		border-radius: 8px;
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: min(560px, calc(100vw - 2rem));
		max-height: calc(100vh - 2rem);
		background: var(--bg-card);
		color: var(--text);
		box-shadow: 0 12px 40px #00000060, 0 0 0 1px var(--border-mid);
		outline: none;
	}
	.bug-dialog[open] {
		display: flex;
		flex-direction: column;
	}
	.bug-dialog::backdrop {
		background: #00000050;
		backdrop-filter: blur(1px);
	}

	.bg-header {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 14px 9px;
		border-bottom: 1px solid var(--border);
		background: var(--bg-control);
		border-radius: 8px 8px 0 0;
		cursor: grab;
		user-select: none;
	}
	.bg-header:active { cursor: grabbing; }
	.drag-grip {
		font-size: 1rem;
		color: var(--text-dimmer);
		line-height: 1;
		opacity: 0.6;
		flex-shrink: 0;
	}
	.bg-title {
		flex: 1;
		font-family: var(--font-display);
		font-size: calc(0.78rem * var(--font-display-scale));
		font-weight: var(--font-display-weight);
		font-variant: var(--font-display-variant);
		letter-spacing: 0.08em;
		text-transform: var(--font-display-transform);
		color: var(--text-accent);
	}
	.bg-close {
		background: none;
		border: none;
		color: var(--text-dimmer);
		font-size: 1.1rem;
		line-height: 1;
		padding: 2px 8px;
		cursor: pointer;
		border-radius: 3px;
	}
	.bg-close:hover { color: var(--text); background: var(--bg-hover); }

	.bg-body {
		padding: 14px 16px;
		display: flex;
		flex-direction: column;
		gap: 12px;
		overflow-y: auto;
	}
	.bg-intro {
		margin: 0 0 0.25rem;
		font-size: 0.82rem;
		line-height: 1.5;
		color: var(--text-muted);
	}
	.bg-field {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.bg-field span {
		font-family: var(--font-ui);
		font-size: 0.75rem;
		font-weight: 600;
		letter-spacing: 0.02em;
		color: var(--text-muted);
	}
	.bg-field textarea {
		padding: 8px 10px;
		border: 1px solid var(--border-mid);
		border-radius: 4px;
		background: var(--bg-control);
		color: var(--text);
		font-family: var(--font-ui);
		font-size: 0.85rem;
		line-height: 1.45;
		resize: vertical;
	}
	.bg-field textarea:focus {
		outline: none;
		border-color: var(--text-accent);
	}

	.bg-diag {
		font-size: 0.75rem;
		color: var(--text-muted);
		border: 1px solid var(--border);
		border-radius: 4px;
		padding: 4px 10px;
		background: var(--bg-inset);
	}
	.bg-diag summary {
		cursor: pointer;
		padding: 4px 0;
		color: var(--text-dimmer);
		font-family: var(--font-ui);
		font-weight: 600;
		letter-spacing: 0.02em;
	}
	.bg-diag dl {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: 2px 12px;
		margin: 6px 0 4px;
	}
	.bg-diag dt {
		font-weight: 600;
		color: var(--text-dimmer);
	}
	.bg-diag dd {
		margin: 0;
		word-break: break-word;
		font-family: 'Roboto Mono', monospace;
		font-size: 0.72rem;
		color: var(--text);
	}
	.bg-ua {
		font-family: 'Roboto Mono', monospace;
	}

	.bg-footer {
		display: flex;
		gap: 6px;
		justify-content: flex-end;
		padding: 10px 14px 14px;
		border-top: 1px solid var(--border);
	}
</style>
