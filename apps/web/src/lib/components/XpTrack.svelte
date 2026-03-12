<script lang="ts">
	/**
	 * 30-dot XP track.
	 * • Click an empty dot  → fill up to and including it.
	 * • Click a filled dot  → unfill from that dot onward (undo).
	 * Dot size matches a standard HTML radio button (~14 px).
	 */
	let {
		value = $bindable(0),
		max = 30,
		onchange,
	}: {
		value?: number;
		max?: number;
		onchange?: (oldVal: number, newVal: number) => void;
	} = $props();

	function handleClick(i: number) {
		const old = value;
		if (i < value) {
			// Clicking a filled dot removes XP back to that point
			value = i;
		} else {
			// Clicking the next empty dot adds 1 XP
			value = i + 1;
		}
		if (value !== old) onchange?.(old, value);
	}
</script>

<div class="xp-section">
	<div class="section-label">Experience — {value} / {max}</div>
	<div class="xp-grid">
		{#each Array(max) as _, i (i)}
			<button
				class="xp-dot"
				class:filled={i < value}
				onclick={() => handleClick(i)}
				title={i < value
					? `Remove XP (back to ${i})`
					: `Spend XP (${i + 1}/${max})`}
				aria-label="{i < value ? 'Remove' : 'Add'} XP dot {i + 1}"
			></button>
		{/each}
	</div>
</div>

<style>
	.xp-section {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.xp-grid {
		display: grid;
		/* 15 columns per row, fixed 14 px per dot to match radio-button size */
		grid-template-columns: repeat(15, 14px);
		gap: 3px;
	}

	.xp-dot {
		width: 14px;
		height: 14px;
		border-radius: 50%;
		border: 1.5px solid var(--text-dimmer);
		background: transparent;
		cursor: pointer;
		padding: 0;
		transition:
			background 0.1s,
			border-color 0.1s;
	}

	.xp-dot.filled {
		background: var(--text-accent);
		border-color: var(--text-accent);
	}

	.xp-dot:hover:not(.filled) {
		border-color: var(--text-accent);
		background: color-mix(in srgb, var(--text-accent) 20%, transparent);
	}

	.xp-dot.filled:hover {
		opacity: 0.7;
	}
</style>
