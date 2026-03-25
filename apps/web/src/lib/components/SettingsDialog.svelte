<script lang="ts">
	/**
	 * SettingsDialog — app-wide preferences modal.
	 *
	 * Owns:
	 *   • Theme  — auto / dark / light (persisted to localStorage)
	 *   • 3D Dice — on / off (persisted to localStorage via dice.ts)
	 *
	 * Usage:
	 *   <SettingsDialog bind:this={ref} />
	 *   ref.open()
	 */

	import { isDice3dEnabled, setDice3dEnabled } from '$lib/dice';
	import { draggable } from '$lib/actions/draggable.js';

	import autoSvg  from '$icons/circle-half-stroke-solid.svg?raw';
	import darkSvg  from '$icons/moon-solid.svg?raw';
	import lightSvg from '$icons/sun-solid.svg?raw';

	// ---------------------------------------------------------------------------
	// Theme
	// ---------------------------------------------------------------------------
	type Theme = 'auto' | 'dark' | 'light';

	const THEME_MODES: { value: Theme; icon: string; label: string; title: string }[] = [
		{ value: 'auto',  icon: autoSvg,  label: 'Auto',  title: 'Follow system preference' },
		{ value: 'dark',  icon: darkSvg,  label: 'Dark',  title: 'Dark mode'                },
		{ value: 'light', icon: lightSvg, label: 'Light', title: 'Light mode'               },
	];

	function savedTheme(): Theme {
		if (typeof window === 'undefined') return 'auto';
		const t = localStorage.getItem('theme');
		return t === 'dark' || t === 'light' ? t : 'auto';
	}

	let theme = $state<Theme>(savedTheme());

	function applyTheme(t: Theme) {
		theme = t;
		if (t === 'auto') {
			localStorage.removeItem('theme');
			document.documentElement.removeAttribute('data-theme');
		} else {
			localStorage.setItem('theme', t);
			document.documentElement.setAttribute('data-theme', t);
		}
	}

	// ---------------------------------------------------------------------------
	// 3D Dice
	// ---------------------------------------------------------------------------
	let dice3d = $state(typeof window !== 'undefined' ? isDice3dEnabled() : true);

	function applyDice3d(on: boolean) {
		dice3d = on;
		setDice3dEnabled(on);
	}

	// ---------------------------------------------------------------------------
	// Dialog
	// ---------------------------------------------------------------------------
	let dialogEl = $state<HTMLDialogElement | null>(null);

	export function open() {
		// Re-sync with localStorage each time the dialog opens.
		theme  = savedTheme();
		dice3d = isDice3dEnabled();
		dialogEl?.showModal();
	}

	export function close() {
		dialogEl?.close();
	}
</script>

<!-- =========================================================================
     Dialog
     ========================================================================= -->
<dialog
	bind:this={dialogEl}
	class="settings-dialog"
	oncancel={close}
>

	<!-- Header -->
	<div class="sd-header" use:draggable>
		<span class="sd-title">Settings</span>
		<button class="sd-close" onclick={close} aria-label="Close">✕</button>
	</div>

	<!-- Body -->
	<div class="sd-body">

		<!-- Theme -->
		<div class="sd-row">
			<span class="sd-label">Theme</span>
			<div class="sd-seg" role="group" aria-label="Color theme">
				{#each THEME_MODES as mode (mode.value)}
					<button
						class="sd-seg-btn"
						class:active={theme === mode.value}
						onclick={() => applyTheme(mode.value)}
						data-tooltip={mode.title}
						aria-pressed={theme === mode.value}
					>
						<span class="sd-seg-icon">{@html mode.icon}</span>
						{mode.label}
					</button>
				{/each}
			</div>
		</div>

		<!-- 3D Dice -->
		<div class="sd-row">
			<span class="sd-label">3D Dice</span>
			<div class="sd-seg" role="group" aria-label="3D dice animation">
				<button
					class="sd-seg-btn"
					class:active={dice3d}
					onclick={() => applyDice3d(true)}
					aria-pressed={dice3d}
					data-tooltip="Animate dice rolls in 3D"
				>On</button>
				<button
					class="sd-seg-btn"
					class:active={!dice3d}
					onclick={() => applyDice3d(false)}
					aria-pressed={!dice3d}
					data-tooltip="Skip 3D animation, show result immediately"
				>Off</button>
			</div>
		</div>

	</div>

</dialog>

<style>
	/* ── Dialog shell ────────────────────────────────────────────────────── */
	.settings-dialog {
		border:        none;
		padding:       0;
		border-radius: 10px;
		position:      fixed;
		top:           50%;
		left:          50%;
		transform:     translate(-50%, -50%);
		width:         min(320px, calc(100vw - 2rem));
		background:    var(--bg-card);
		color:         var(--text);
		box-shadow:    0 16px 48px #00000070, 0 0 0 1px var(--border-mid);
		outline:       none;
	}
	.settings-dialog[open] {
		display:        flex;
		flex-direction: column;
	}
	.settings-dialog::backdrop {
		background:      #00000060;
		backdrop-filter: blur(1px);
	}

	/* ── Header ─────────────────────────────────────────────────────────── */
	.sd-header {
		display:         flex;
		align-items:     center;
		justify-content: space-between;
		padding:         10px 14px;
		border-bottom:   1px solid var(--border);
		background:      var(--bg-control);
		border-radius:   10px 10px 0 0;
		flex-shrink:     0;
	}
	.sd-title {
		font-family:    var(--font-display);
		font-size:      0.78rem;
		font-weight:    700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color:          var(--text-accent);
	}
	.sd-close {
		background:    transparent;
		border:        none;
		color:         var(--text-dimmer);
		cursor:        pointer;
		font-size:     0.9rem;
		padding:       2px 5px;
		border-radius: 3px;
		line-height:   1;
		font-family:   inherit;
	}
	.sd-close:hover { color: var(--text); }

	/* ── Body ────────────────────────────────────────────────────────────── */
	.sd-body {
		padding:        16px 14px;
		display:        flex;
		flex-direction: column;
		gap:            14px;
	}

	/* ── Setting row ─────────────────────────────────────────────────────── */
	.sd-row {
		display:     flex;
		align-items: center;
		gap:         12px;
	}
	.sd-label {
		font-family: var(--font-ui);
		font-size:   0.73rem;
		font-weight: 600;
		color:       var(--text-muted);
		min-width:   62px;
	}

	/* ── Segmented control ───────────────────────────────────────────────── */
	.sd-seg {
		display:       flex;
		border:        1px solid var(--border-mid);
		border-radius: 5px;
		overflow:      hidden;
	}
	.sd-seg-btn {
		display:        flex;
		align-items:    center;
		gap:            5px;
		padding:        5px 11px;
		background:     var(--bg-control);
		border:         none;
		border-right:   1px solid var(--border-mid);
		cursor:         pointer;
		color:          var(--text-dimmer);
		font-family:    var(--font-ui);
		font-size:      0.72rem;
		font-weight:    500;
		transition:     background 0.12s, color 0.12s;
		white-space:    nowrap;
	}
	.sd-seg-btn:last-child { border-right: none; }
	.sd-seg-btn:hover:not(.active) {
		background: var(--bg-hover);
		color:      var(--text-muted);
	}
	.sd-seg-btn.active {
		background: var(--bg-hover);
		color:      var(--text-accent);
		font-weight: 600;
	}
	.sd-seg-icon {
		display:     flex;
		align-items: center;
		line-height: 0;
	}
	.sd-seg-icon :global(svg) {
		width:  11px;
		height: 11px;
		fill:   currentColor;
	}
</style>
