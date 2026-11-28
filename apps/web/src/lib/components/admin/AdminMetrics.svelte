<script lang="ts">
	/**
	 * /admin's top block: the stat cards (from the page's `stats`) and the
	 * User Activity graph, which loads its own time series and reloads it when
	 * the timeframe changes.
	 *
	 * The page mounts this from the start, so the graph's fetch runs alongside
	 * the page's first load, and passes its `loading` flag: until that load is
	 * done this renders nothing, leaving the page's single loading spinner.
	 */
	import { admin } from '#lib/api.js';
	import LoadingSpinner from '#lib/components/LoadingSpinner.svelte';
	import type { AdminStats, UserTimeseries } from '@ironledger/shared';

	let {
		stats,
		loading,
	}: {
		stats: AdminStats | null;
		/** The page's first load is still running. */
		loading: boolean;
	} = $props();

	type Timeframe = '1hr' | '1day' | '7day' | '30day';
	let metricsTimeframe: Timeframe = $state('1day');
	let timeseries: UserTimeseries | null = $state(null);
	let metricsLoading = $state(false);

	async function loadTimeseries(tf: Timeframe) {
		metricsLoading = true;
		try {
			timeseries = await admin.getTimeseries(tf);
		} catch {
			/* ignore */
		} finally {
			metricsLoading = false;
		}
	}

	$effect(() => {
		void loadTimeseries(metricsTimeframe);
	});
</script>

{#if !loading}
	<!-- Stats Cards -->
	{#if stats}
		<div class="stats-grid">
			<div class="stat-card">
				<span class="stat-value">{stats.totalUsers}</span>
				<span class="stat-label">Total Users</span>
			</div>
			<div class="stat-card">
				<span class="stat-value">{stats.activeUsers7d}</span>
				<span class="stat-label">Active 7d</span>
			</div>
			<div class="stat-card">
				<span class="stat-value">{stats.activeUsers30d}</span>
				<span class="stat-label">Active 30d</span>
			</div>
			<div class="stat-card">
				<span class="stat-value">{stats.totalCharacters}</span>
				<span class="stat-label">Characters</span>
			</div>
			<div class="stat-card">
				<span class="stat-value">{stats.totalEncounters}</span>
				<span class="stat-label">Encounters</span>
			</div>
			<div class="stat-card">
				<span class="stat-value">{stats.totalExpeditions}</span>
				<span class="stat-label">Expeditions</span>
			</div>
			<div class="stat-card stat-online">
				<span class="stat-value stat-value-online">{stats.currentlyLoggedIn}</span>
				<span class="stat-label">Online Now</span>
			</div>
		</div>
	{/if}

	<!-- Metrics graph -->
	<div class="metrics-panel card">
		<div class="metrics-header">
			<span class="metrics-title">User Activity</span>
			<div class="metrics-timeframes">
				{#each ['1hr', '1day', '7day', '30day'] as const as tf}
					<button
						class="tf-btn"
						class:active={metricsTimeframe === tf}
						onclick={() => {
							metricsTimeframe = tf;
						}}>{tf}</button
					>
				{/each}
			</div>
		</div>

		{#if metricsLoading || !timeseries}
			<div class="metrics-loading"><LoadingSpinner label="Loading…" size={44} /></div>
		{:else}
			{@const buckets = timeseries.buckets}
			{@const rawMax = Math.max(...buckets.map((b) => b.totalUsers), 1)}
			{@const maxActive = Math.max(...buckets.map((b) => b.activeUsers), 1)}
			{@const chartH = 120}
			{@const chartW = 600}
			{@const padL = 40}
			{@const padR = 12}
			{@const padT = 10}
			{@const padB = 28}
			{@const plotW = chartW - padL - padR}
			{@const plotH = chartH - padT - padB}
			{@const step = buckets.length > 1 ? plotW / (buckets.length - 1) : plotW}
			{@const yStep =
				rawMax <= 5
					? 1
					: rawMax <= 15
						? 2
						: rawMax <= 50
							? 5
							: rawMax <= 100
								? 10
								: rawMax <= 500
									? 50
									: 100}
			{@const maxTotal = Math.ceil(rawMax / yStep) * yStep}
			{@const yTicks = Array.from(
				{ length: Math.round(maxTotal / yStep) + 1 },
				(_, i) => i * yStep,
			)}

			<div class="metrics-chart-wrap">
				<svg
					class="metrics-svg"
					viewBox="0 0 {chartW} {chartH}"
					preserveAspectRatio="none"
					aria-label="User activity chart"
				>
					<!-- Y-axis grid lines -->
					{#each yTicks as v}
						{@const y = padT + plotH * (1 - v / maxTotal)}
						<line x1={padL} y1={y} x2={chartW - padR} y2={y} class="grid-line" />
						<text x={padL - 4} y={y + 4} class="axis-label" text-anchor="end">
							{v}
						</text>
					{/each}

					<!-- X-axis labels (every N buckets to avoid crowding) -->
					{#each buckets as b, i}
						{#if i % Math.max(1, Math.floor(buckets.length / 6)) === 0}
							{@const x = padL + i * step}
							<text {x} y={chartH - 4} class="axis-label" text-anchor="middle">{b.label}</text>
						{/if}
					{/each}

					<!-- Total users line (amber) -->
					<polyline
						class="line-total"
						points={buckets
							.map((b, i) => `${padL + i * step},${padT + plotH * (1 - b.totalUsers / maxTotal)}`)
							.join(' ')}
					/>

					<!-- Active users line (teal) -->
					<polyline
						class="line-active"
						points={buckets
							.map((b, i) => `${padL + i * step},${padT + plotH * (1 - b.activeUsers / maxActive)}`)
							.join(' ')}
					/>

					<!-- Data point dots for total -->
					{#each buckets as b, i}
						<circle
							cx={padL + i * step}
							cy={padT + plotH * (1 - b.totalUsers / maxTotal)}
							r="2.5"
							class="dot-total"
						/>
					{/each}
				</svg>
			</div>

			<!-- Legend -->
			<div class="metrics-legend">
				<span class="legend-item legend-total">Total Users</span>
				<span class="legend-item legend-active">Active (by last login)</span>
				{#if stats}
					<span class="legend-item legend-online">
						{stats.currentlyLoggedIn} online now
					</span>
				{/if}
			</div>
		{/if}
	</div>
{/if}

<style>
	/* ── Stats grid ── */
	.stats-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
		gap: 0.6rem;
		margin-bottom: 1.25rem;
	}

	.stat-card {
		background: var(--bg-card);
		border: 1px solid var(--border);
		border-radius: 5px;
		padding: 0.75rem;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.15rem;
		box-shadow: 0 2px 8px #00000020;
	}

	.stat-value {
		font-family: var(--font-mono);
		font-size: 1.6rem;
		font-weight: 700;
		color: var(--text-accent);
		line-height: 1.1;
	}

	.stat-label {
		font-family: var(--font-ui);
		font-size: 0.65rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-dimmer);
	}

	.stat-online {
		border-color: rgba(52, 211, 153, 0.3);
	}
	.stat-value-online {
		color: #34d399;
	}

	/* ── Metrics graph ── */
	.metrics-panel {
		margin-bottom: 1.25rem;
		overflow: hidden;
	}

	.metrics-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 10px 14px;
		background: var(--bg-inset);
		border-bottom: 1px solid var(--border);
	}

	.metrics-title {
		font-family: var(--font-display);
		font-size: calc(0.65rem * var(--font-display-scale));
		font-weight: var(--font-display-weight);
		font-variant: var(--font-display-variant);
		letter-spacing: 0.12em;
		text-transform: var(--font-display-transform);
		color: var(--text-accent);
	}

	.metrics-timeframes {
		display: flex;
		gap: 4px;
	}

	.tf-btn {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		font-weight: 600;
		background: transparent;
		border: 1px solid var(--border);
		border-radius: 3px;
		padding: 2px 7px;
		cursor: pointer;
		color: var(--text-dimmer);
		transition:
			color 0.12s,
			border-color 0.12s,
			background 0.12s;
	}

	.tf-btn:hover {
		color: var(--text-muted);
		border-color: var(--border-mid);
	}

	.tf-btn.active {
		color: var(--text-accent);
		border-color: var(--text-accent);
		background: color-mix(in srgb, var(--text-accent) 10%, transparent);
	}

	.metrics-loading {
		padding: 2rem;
		text-align: center;
		font-family: var(--font-ui);
		font-size: 0.8rem;
		color: var(--text-dimmer);
	}

	.metrics-chart-wrap {
		padding: 0.5rem 0.75rem 0;
		overflow: hidden;
	}

	.metrics-svg {
		width: 100%;
		height: 140px;
		display: block;
	}

	.grid-line {
		stroke: var(--border);
		stroke-width: 0.5;
	}

	.axis-label {
		font-family: var(--font-mono);
		font-size: 8px;
		fill: var(--text-dimmer);
	}

	.line-total {
		fill: none;
		stroke: #f59e0b;
		stroke-width: 1.5;
		stroke-linejoin: round;
	}

	.line-active {
		fill: none;
		stroke: #34d399;
		stroke-width: 1.5;
		stroke-linejoin: round;
		stroke-dasharray: 3 2;
	}

	.dot-total {
		fill: #f59e0b;
	}

	.metrics-legend {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0.5rem 0.75rem 0.65rem;
		font-family: var(--font-ui);
		font-size: 0.72rem;
	}

	.legend-item {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		color: var(--text-dimmer);
	}

	.legend-item::before {
		content: '';
		display: inline-block;
		width: 16px;
		height: 2px;
	}

	.legend-total::before {
		background: #f59e0b;
	}
	.legend-active::before {
		background: #34d399;
	}
	.legend-online {
		margin-left: auto;
		color: #34d399;
		font-weight: 600;
	}
	.legend-online::before {
		display: none;
	}
</style>
