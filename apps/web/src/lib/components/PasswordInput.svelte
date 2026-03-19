<script lang="ts">
	import eyeSvg      from '$icons/eye.svg?raw';
	import eyeSlashSvg from '$icons/eye-slash.svg?raw';

	interface Props {
		name:         string;
		label:        string;
		autocomplete: AutoFill;
		minlength?:   number;
		value?:       string;
		required?:    boolean;
	}

	let { name, label, autocomplete, minlength, value = '', required = true }: Props = $props();

	let visible = $state(false);
</script>

<label class="field-group">
	<span>{label}</span>
	<div class="pw-wrap">
		<input
			type={visible ? 'text' : 'password'}
			{name}
			{required}
			{autocomplete}
			{minlength}
			{value}
			class="pw-input"
		/>
		<button
			type="button"
			class="pw-toggle"
			onclick={() => (visible = !visible)}
			aria-label={visible ? 'Hide password' : 'Show password'}
			title={visible ? 'Hide password' : 'Show password'}
			tabindex="-1"
		>
			{@html visible ? eyeSlashSvg : eyeSvg}
		</button>
	</div>
</label>

<style>
	.pw-wrap {
		position: relative;
		display: flex;
		align-items: center;
	}

	.pw-input {
		width: 100%;
		padding-right: 36px; /* room for the toggle button */
	}

	.pw-toggle {
		position: absolute;
		right: 6px;
		background: none;
		border: none;
		padding: 4px;
		color: var(--text-muted);
		display: flex;
		align-items: center;
		border-radius: 3px;
		transition: color 0.1s;
	}

	.pw-toggle:hover {
		color: var(--text);
	}

	.pw-toggle:focus-visible {
		outline: 2px solid var(--focus-ring);
	}

	/* Size the imported FA SVG */
	.pw-toggle :global(svg) {
		width: 15px;
		height: 15px;
		fill: currentColor;
	}
</style>
