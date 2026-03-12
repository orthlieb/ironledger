<script lang="ts">
	/**
	 * ThemeToggle — three-state (auto / dark / light) theme switcher.
	 *
	 * Writes 'dark' or 'light' to localStorage and sets data-theme on <html>.
	 * 'auto' removes data-theme so the CSS prefers-color-scheme query decides.
	 * The matching anti-flash script in app.html reads this on every page load.
	 */

	import autoSvg  from '$lib/images/circle-half-stroke-solid.svg?raw';
	import darkSvg  from '$lib/images/moon-solid.svg?raw';
	import lightSvg from '$lib/images/sun-solid.svg?raw';

	type Theme = 'auto' | 'dark' | 'light';

	const MODES: { value: Theme; icon: string; title: string }[] = [
		{ value: 'auto',  icon: autoSvg,  title: 'Auto (follows system)' },
		{ value: 'dark',  icon: darkSvg,  title: 'Dark mode' },
		{ value: 'light', icon: lightSvg, title: 'Light mode' },
	];

	function getInitialTheme(): Theme {
		if (typeof localStorage === 'undefined') return 'auto';
		const saved = localStorage.getItem('theme');
		if (saved === 'dark' || saved === 'light') return saved;
		return 'auto';
	}

	let current = $state<Theme>(getInitialTheme());

	function apply(theme: Theme) {
		current = theme;
		if (theme === 'auto') {
			localStorage.removeItem('theme');
			document.documentElement.removeAttribute('data-theme');
		} else {
			localStorage.setItem('theme', theme);
			document.documentElement.setAttribute('data-theme', theme);
		}
	}
</script>

<div class="theme-toggle" role="group" aria-label="Color theme">
	{#each MODES as mode (mode.value)}
		<button
			class="theme-btn"
			class:active={current === mode.value}
			onclick={() => apply(mode.value)}
			title={mode.title}
			aria-pressed={current === mode.value}
		>{@html mode.icon}</button>
	{/each}
</div>

<style>
	.theme-toggle {
		display: flex;
		align-items: center;
		border: 1px solid var(--border-mid);
		border-radius: 3px;
		overflow: hidden;
	}

	.theme-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 26px;
		background: var(--bg-control);
		color: var(--text-dimmer);
		border: none;
		border-right: 1px solid var(--border-mid);
		cursor: pointer;
		transition: background 0.12s, color 0.12s;
	}

	/* Size the imported FA SVGs */
	.theme-btn :global(svg) {
		width: 12px;
		height: 12px;
		fill: currentColor;
	}

	.theme-btn:last-child {
		border-right: none;
	}

	.theme-btn:hover:not(.active) {
		background: var(--bg-hover);
		color: var(--text-muted);
	}

	.theme-btn.active {
		background: var(--bg-hover);
		color: var(--text-accent);
	}
</style>
