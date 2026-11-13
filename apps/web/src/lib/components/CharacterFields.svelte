<script lang="ts">
	/**
	 * The fields the core rules and enabled extensions add to a character
	 * (Region of origin; YRT's religion, touched level and animal), each under
	 * its extension's heading (the core rules have none),
	 * in extension order then declaration order. See docs/character-fields.md.
	 *
	 * mode "sheet": the Core tab, below Vitals. Values read through to each
	 * field's default; a text box reports its change when it loses focus.
	 * mode "create": New Character. Every field starts empty and has a d6 when
	 * it rolls from an oracle; Create rolls whatever is still empty.
	 *
	 * A field whose `if` fails is hidden (its value is kept). The parent owns
	 * the values: `onset` hands it each change.
	 */
	import Select from '#lib/components/Select.svelte';
	import SegmentedRadio from '#lib/components/SegmentedRadio.svelte';
	import { tooltip } from '#lib/actions/tooltip.js';
	import diceD6Svg from '#icons/dice-d6-light.svg?raw';
	import {
		characterFieldGroups,
		fieldHint,
		fieldShown,
		fieldValue,
		findCharacterField,
		optionIndex,
		rollCharacterField,
		rollOracleTitle,
		type ResolvedField,
	} from '#lib/characterFields.svelte.js';

	let {
		values,
		mode,
		onset,
	}: {
		values: Record<string, string> | undefined;
		mode: 'sheet' | 'create';
		onset: (field: ResolvedField, value: string) => void;
	} = $props();

	const groups = $derived(characterFieldGroups());

	/** What the control shows: on the sheet, the value or its default; in New
	 *  Character, only what's been rolled or picked. */
	const shown = (f: ResolvedField) =>
		mode === 'sheet' ? fieldValue(f, values) : (values?.[f.id] ?? '');

	/** The field a die waits for: its roll's column field, while unset. */
	function waitingFor(f: ResolvedField): ResolvedField | null {
		const col = f.roll?.column;
		if (!col) return null;
		const other = findCharacterField(col.field);
		if (!other) return null;
		return optionIndex(other, fieldValue(other, values)) < 0 ? other : null;
	}

	function roll(f: ResolvedField) {
		const r = rollCharacterField(f, values);
		if (r) onset(f, r.value);
	}
</script>

{#if groups.length}
	<div
		class="cf"
		class:cf--sheet={mode === 'sheet'}
		data-tour={mode === 'sheet' ? 'char-fields' : 'new-char-fields'}
	>
		{#each groups as g (g.source)}
			{@const visible = g.fields.filter((f) => fieldShown(f, values, findCharacterField))}
			{#if visible.length}
				<div class="cf-group">
					{#if mode === 'sheet'}
						<div class="cf-side" class:cf-side--blank={!g.heading}>{g.heading ?? ''}</div>
					{:else if g.heading}
						<div class="cf-heading">{g.heading}</div>
					{/if}
					<div class="cf-grid">
						{#each visible as f (f.id)}
							{@const v = shown(f)}
							{@const hint = fieldHint(f, v)}
							{@const waits = mode === 'create' ? waitingFor(f) : null}
							<div
								class="cf-field co-field"
								data-tour={mode === 'sheet' ? `char-field-${f.id}` : `randomize-${f.id}`}
							>
								<span class="cf-label co-field-label" use:tooltip={hint}>{f.label}</span>
								<div class="cf-row co-name-row">
									{#if f.type === 'dropdown'}
										<Select
											value={v}
											options={f.options.map((o) => ({ value: o.id, label: o.label }))}
											placeholder="—"
											ariaLabel={f.label}
											onchange={(nv) => onset(f, nv)}
										/>
									{:else if f.type === 'radio'}
										<SegmentedRadio
											value={v}
											ariaLabel={f.label}
											labels="always"
											options={f.options.map((o) => ({
												value: o.id,
												label: o.label,
												text: o.label,
											}))}
											onchange={(nv) => onset(f, nv)}
										/>
									{:else}
										<input
											class="co-input cf-input"
											type="text"
											value={v}
											placeholder={f.placeholder ?? ''}
											aria-label={f.label}
											oninput={mode === 'create'
												? (e) => onset(f, (e.currentTarget as HTMLInputElement).value)
												: undefined}
											onchange={mode === 'sheet'
												? (e) => onset(f, (e.currentTarget as HTMLInputElement).value.trim())
												: undefined}
										/>
									{/if}
									{#if mode === 'create' && f.roll}
										<button
											class="dice-btn"
											type="button"
											disabled={!!waits}
											onclick={() => roll(f)}
											use:tooltip={waits
												? `Pick a ${waits.label} first`
												: `Roll on ${rollOracleTitle(f)}`}
											aria-label={`Roll ${f.label}`}
											data-tour={`roll-${f.id}`}>{@html diceD6Svg}</button
										>
									{/if}
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/if}
		{/each}
	</div>
{/if}

<style>
	.cf {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	/* In New Character: its own section, set off like "Also randomize". */
	.cf:not(.cf--sheet) {
		margin-top: 10px;
		padding-top: 8px;
		border-top: 1px solid var(--border);
	}
	.cf-heading {
		font-family: var(--font-ui);
		font-size: 0.7rem;
		font-weight: 800;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--text-dimmer);
		margin-bottom: 4px;
	}
	.cf-grid {
		display: flex;
		flex-direction: column;
		gap: 8px;
		flex: 1;
		min-width: 0;
	}
	.cf-row :global(.bui-select-trigger) {
		flex: 1;
		min-width: 0;
	}
	.cf-input {
		flex: 1;
		min-width: 0;
	}

	/* On the sheet: a row like Stats and Vitals, with the heading as the
	   vertical side label and the fields two to a row (one on a phone). */
	.cf--sheet {
		gap: 0;
	}
	.cf--sheet .cf-group {
		display: flex;
		align-items: stretch;
		gap: 8px;
		border-top: 1px solid #c5b99e;
		padding-top: 8px;
		margin-top: 8px;
	}
	.cf-side {
		writing-mode: vertical-rl;
		transform: rotate(180deg);
		font-family: var(--font-ui);
		font-size: 0.55rem;
		font-weight: 800;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--text-dimmer);
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		border-left: 1px solid var(--border);
		padding-left: 6px;
		padding-right: 2px;
	}
	/* No heading (Delve, Lodestar): keep the column so the fields line up. */
	.cf-side--blank {
		min-width: 23px;
		box-sizing: border-box;
	}
	.cf--sheet .cf-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 8px 12px;
	}
	@media (max-width: 600px) {
		.cf--sheet .cf-grid {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
