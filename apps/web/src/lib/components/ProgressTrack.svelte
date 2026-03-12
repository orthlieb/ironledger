<script lang="ts">
	/**
	 * 10-box progress track (bonds, failures, vow progress).
	 * Value is stored as total ticks (0–40) so it maps directly to the DB field.
	 *
	 * Tick mark patterns (matching YRT):
	 *   1 tick  → diagonal \
	 *   2 ticks → X  (\/)
	 *   3 ticks → X + horizontal line
	 *   4 ticks → full ⊕ (X + both cross lines)
	 */
	import { boxTicks, cycleBox, progressText } from '$lib/character.js';

	let {
		label,
		value = $bindable(0),
		boxes = 10,
	}: {
		label: string;
		value?: number;
		boxes?: number;
	} = $props();

	const max = $derived(boxes * 4);
</script>

<div class="progress-section">
	{#if label}
		<div class="section-label">{label}</div>
	{/if}

	<div class="track-row">
		<div class="track-boxes">
			{#each Array(boxes) as _, i (i)}
				{@const ticks = boxTicks(value, i)}
				<button
					class="track-box"
					onclick={() => (value = cycleBox(value, i))}
					title="{ticks}/4 ticks"
					aria-label="Progress box {i + 1}: {ticks} of 4 ticks"
				>
					<svg viewBox="0 0 20 20" width="22" height="22" aria-hidden="true">
						<!-- box border -->
						<rect x="1" y="1" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" />
						<!-- tick 1: top-left → bottom-right \ -->
						{#if ticks >= 1}
							<line x1="3" y1="3" x2="17" y2="17" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
						{/if}
						<!-- tick 2: top-right → bottom-left / -->
						{#if ticks >= 2}
							<line x1="17" y1="3" x2="3" y2="17" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
						{/if}
						<!-- tick 3: horizontal — -->
						{#if ticks >= 3}
							<line x1="1" y1="10" x2="19" y2="10" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
						{/if}
						<!-- tick 4: vertical | -->
						{#if ticks >= 4}
							<line x1="10" y1="1" x2="10" y2="19" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
						{/if}
					</svg>
				</button>
			{/each}
		</div>

		<div class="track-btns">
			<button
				class="btn btn-icon"
				onclick={() => (value = Math.min(max, value + 1))}
				disabled={value >= max}
				aria-label="Add one tick"
			>+1</button>
			<button
				class="btn btn-icon"
				onclick={() => (value = Math.max(0, value - 1))}
				disabled={value <= 0}
				aria-label="Remove one tick"
			>−1</button>
		</div>
	</div>

	<div class="track-readout">{progressText(value, boxes)}</div>
</div>

<style>
	.progress-section {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.track-row {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}

	.track-boxes {
		display: flex;
		gap: 2px;
	}

	.track-box {
		background: transparent;
		border: none;
		padding: 0;
		color: var(--text-muted);
		cursor: pointer;
		border-radius: 2px;
		display: flex;
		transition: color 0.1s;
	}

	.track-box:hover {
		color: var(--text-accent);
	}

	.track-btns {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.track-readout {
		font-size: 0.7rem;
		color: var(--text-dimmer);
	}
</style>
