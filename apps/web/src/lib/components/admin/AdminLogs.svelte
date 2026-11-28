<script lang="ts">
	/**
	 * /admin's Logs tab: the tail of one PM2 log file (choice of file and
	 * length, a text filter, rows that expand to the raw line) and the
	 * confirmation that truncates the file. It loads each time the tab opens
	 * and again whenever the file or length changes. Lines are parsed by
	 * `parseLogLine` (`#lib/adminLogs.ts`). A failed clear goes to `onerror`
	 * for the page's ErrorBar.
	 *
	 * Like every admin tab it stays mounted while another tab is open and
	 * renders only while `active`, so the chosen file, length and filter
	 * survive a trip to another tab.
	 */
	import { admin } from '#lib/api.js';
	import LoadingSpinner from '#lib/components/LoadingSpinner.svelte';
	import { parseLogLine } from '#lib/adminLogs.js';
	import rotateRightSvg from '#icons/arrow-rotate-right-solid.svg?raw';
	import { tooltip } from '#lib/actions/tooltip.js';
	import ConfirmDialog from '#lib/components/ConfirmDialog.svelte';

	let {
		active,
		onerror,
	}: {
		/** The Logs tab is open. */
		active: boolean;
		onerror: (message: string) => void;
	} = $props();

	type LogFile = 'api-out' | 'api-error' | 'web-out' | 'web-error';
	let logFile: LogFile = $state('api-out');
	let logLines: string[] = $state([]);
	let logAvailable = $state(true);
	let logLoading = $state(false);
	let logLineCount: 200 | 500 | 1000 = $state(200);
	let expandedLine = $state<number | null>(null);
	let logSearch = $state('');
	let clearLogConfirm = $state<ReturnType<typeof ConfirmDialog> | null>(null);
	let clearLogLoading = $state(false);
	let parsedLines = $derived(logLines.map(parseLogLine));
	let filteredLines = $derived(
		logSearch.trim()
			? parsedLines.filter(
					(e) =>
						e.msg.toLowerCase().includes(logSearch.toLowerCase()) ||
						e.level.toLowerCase().includes(logSearch.toLowerCase()) ||
						e.raw.toLowerCase().includes(logSearch.toLowerCase()),
				)
			: parsedLines,
	);

	async function loadLogs(file = logFile, lines = logLineCount) {
		logLoading = true;
		expandedLine = null;
		try {
			const result = await admin.getLogs(file, lines);
			logLines = result.lines;
			logAvailable = result.available;
		} catch {
			logLines = [];
			logAvailable = false;
		} finally {
			logLoading = false;
		}
	}

	/** Truncate the currently-shown log file to zero bytes and reload.
	 *  The DELETE endpoint keeps PM2's open file handle valid (truncate,
	 *  not unlink) so the next write appends to an empty file. */
	async function confirmClearLog() {
		clearLogLoading = true;
		try {
			await admin.clearLog(logFile);
			await loadLogs(logFile, logLineCount);
		} catch (err) {
			onerror(err instanceof Error ? err.message : 'Failed to clear the log');
		} finally {
			clearLogLoading = false;
		}
	}
	const LOG_FILE_LABELS: Record<LogFile, string> = {
		'api-out': 'API stdout',
		'api-error': 'API stderr',
		'web-out': 'Web stdout',
		'web-error': 'Web stderr',
	};

	// Loads when the tab opens, and re-runs when the file or line count
	// changes: the toolbar's file and length buttons only set them.
	$effect(() => {
		if (active) void loadLogs(logFile, logLineCount);
	});
</script>

{#if active}
	<div class="logs-toolbar">
		<div class="logs-file-btns">
			{#each Object.entries(LOG_FILE_LABELS) as [f, label]}
				<button
					class="btn btn-icon"
					class:active={logFile === f}
					onclick={() => (logFile = f as LogFile)}>{label}</button
				>
			{/each}
		</div>
		<div class="logs-right">
			<div class="logs-line-btns">
				{#each [200, 500, 1000] as const as n}
					<button
						class="btn btn-icon"
						class:active={logLineCount === n}
						onclick={() => (logLineCount = n)}>{n} lines</button
					>
				{/each}
			</div>
			<button class="btn btn-icon" onclick={() => void loadLogs()} disabled={logLoading}>
				{#if logLoading}Loading…{:else}<span class="admin-refresh-ico">{@html rotateRightSvg}</span>
					Refresh{/if}
			</button>
			<button
				class="btn btn-icon btn-danger"
				onclick={() => clearLogConfirm?.open()}
				disabled={clearLogLoading || logLoading || !logAvailable || logLines.length === 0}
				use:tooltip={'Truncate this log file to zero bytes'}
			>
				{clearLogLoading ? 'Clearing…' : 'Clear'}
			</button>
		</div>
	</div>
	<div class="logs-search-row">
		<input type="search" class="logs-search" placeholder="Filter lines…" bind:value={logSearch} />
		{#if logSearch}
			<button class="btn btn-icon" onclick={() => (logSearch = '')}>Clear</button>
			<span class="logs-match-count">{filteredLines.length} / {parsedLines.length}</span>
		{/if}
	</div>

	{#if !logAvailable}
		<p class="logs-unavailable">
			Log file not available — server may not be running under PM2, or <code>LOG_DIR</code> is not configured
			for this environment.
		</p>
	{:else if logLoading}
		<div class="logs-unavailable"><LoadingSpinner label="Loading…" size={44} /></div>
	{:else if logLines.length === 0}
		<p class="logs-unavailable">Log file is empty.</p>
	{:else}
		<div class="log-output" role="log" aria-live="off">
			{#each filteredLines as entry, i}
				<div
					class="log-row log-{entry.level.toLowerCase()}"
					class:expanded={expandedLine === i}
					role="button"
					tabindex="0"
					onclick={() => (expandedLine = expandedLine === i ? null : i)}
					onkeydown={(e) => e.key === 'Enter' && (expandedLine = expandedLine === i ? null : i)}
				>
					<span class="log-ts">{entry.ts}</span>
					<span class="log-level log-level-{entry.level.toLowerCase()}">{entry.level}</span>
					<span class="log-msg">{entry.msg}</span>
					{#if Object.keys(entry.extras).length > 0}
						<span class="log-extras">
							{#each Object.entries(entry.extras).slice(0, 3) as [k, v]}
								<span class="log-kv"
									><span class="log-key">{k}</span>=<span class="log-val">{String(v)}</span></span
								>
							{/each}
							{#if Object.keys(entry.extras).length > 3}
								<span class="log-more">…</span>
							{/if}
						</span>
					{/if}
				</div>
				{#if expandedLine === i}
					<pre class="log-raw">{(() => {
							try {
								return JSON.stringify(JSON.parse(entry.raw), null, 2);
							} catch {
								return entry.raw;
							}
						})()}</pre>
				{/if}
			{/each}
		</div>
	{/if}
{/if}

<ConfirmDialog
	bind:this={clearLogConfirm}
	title="Clear Log File"
	confirmLabel="Clear"
	onconfirm={confirmClearLog}
>
	<p class="adm-confirm-text">
		Truncate <strong>{LOG_FILE_LABELS[logFile]}</strong> (<code>{logFile}.log</code>) to zero bytes?
		Existing log lines are lost; PM2 keeps writing to the same file.
	</p>
</ConfirmDialog>

<style>
	/* ── Logs tab ── */
	.logs-toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		margin-bottom: 0.75rem;
		flex-wrap: wrap;
	}

	.logs-file-btns,
	.logs-line-btns {
		display: flex;
		gap: 0.3rem;
		flex-wrap: wrap;
	}

	.logs-right {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.logs-unavailable {
		font-family: var(--font-ui);
		font-size: 0.82rem;
		color: var(--text-dimmer);
		text-align: center;
		padding: 2rem;
	}
	.adm-confirm-text {
		font-family: var(--font-ui);
		font-size: 0.85rem;
		line-height: 1.5;
		color: var(--text-muted);
	}
	.adm-confirm-text code {
		font-family: var(--font-mono);
		font-size: 0.8em;
	}

	.logs-unavailable code {
		font-family: var(--font-mono);
		font-size: 0.8em;
		color: var(--text-accent);
	}

	.log-output {
		background: var(--bg-inset);
		border: 1px solid var(--border);
		border-radius: 5px;
		max-height: 560px;
		overflow-y: auto;
		font-family: var(--font-mono);
		font-size: 0.72rem;
		line-height: 1.5;
	}

	.log-row {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		padding: 0.18rem 0.6rem;
		cursor: pointer;
		border-bottom: 1px solid var(--border);
		color: var(--text);
		border-left: 2px solid transparent;
	}
	.log-row:hover {
		background: var(--bg-hover);
	}
	.log-row.expanded {
		background: var(--bg-control);
	}
	.log-row.log-error,
	.log-row.log-fatal {
		border-left-color: var(--color-danger);
	}
	.log-row.log-warn {
		border-left-color: var(--color-warning);
	}

	.log-ts {
		color: var(--text-dimmer);
		flex-shrink: 0;
		width: 14ch;
		text-align: right;
		white-space: nowrap;
	}

	.log-level {
		flex-shrink: 0;
		width: 5ch;
		text-align: center;
		font-weight: 700;
		font-size: 0.65rem;
		letter-spacing: 0.04em;
		border-radius: 3px;
		padding: 0 3px;
	}
	.log-level-info {
		color: var(--text-accent);
		background: color-mix(in srgb, var(--text-accent) 12%, transparent);
	}
	.log-level-warn {
		color: var(--color-warning);
		background: color-mix(in srgb, var(--color-warning) 12%, transparent);
	}
	.log-level-error {
		color: var(--color-danger);
		background: color-mix(in srgb, var(--color-danger) 12%, transparent);
	}
	.log-level-fatal {
		color: var(--color-danger);
		background: color-mix(in srgb, var(--color-danger) 20%, transparent);
	}
	.log-level-debug {
		color: var(--text-dimmer);
		background: color-mix(in srgb, var(--text-dimmer) 12%, transparent);
	}
	.log-level-trace {
		color: var(--text-dimmer);
		background: color-mix(in srgb, var(--text-dimmer) 8%, transparent);
	}

	.log-msg {
		flex: 1;
		color: var(--text);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.log-extras {
		display: flex;
		gap: 0.6rem;
		flex-shrink: 0;
		color: var(--text-dimmer);
	}
	.log-kv {
		white-space: nowrap;
	}
	.log-key {
		color: var(--color-success);
	}
	.log-val {
		color: var(--text-accent);
	}
	.log-more {
		color: var(--text-dimmer);
	}

	.log-raw {
		margin: 0;
		padding: 0.5rem 0.6rem 0.5rem 14ch;
		background: var(--bg-control);
		color: var(--text-muted);
		font-size: 0.68rem;
		white-space: pre-wrap;
		word-break: break-all;
		border-bottom: 1px solid var(--border);
	}

	.logs-search-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.5rem;
	}

	.logs-search {
		flex: 1;
		padding: 0.35rem 0.6rem;
		font-family: var(--font-ui);
		font-size: 0.78rem;
		background: var(--bg-inset);
		color: var(--text-body);
		border: 1px solid var(--border);
		border-radius: 4px;
		outline: none;
	}
	.logs-search:focus {
		border-color: var(--text-accent);
	}

	.logs-match-count {
		font-family: var(--font-ui);
		font-size: 0.75rem;
		color: var(--text-dimmer);
		white-space: nowrap;
	}
</style>
