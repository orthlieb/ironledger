<script lang="ts">
	/**
	 * A site's Theme, Domain, Feature and Danger, on its Core tab. Each has a
	 * d6 beside it:
	 *   - Theme and Domain roll the weighted Site Nature oracles.
	 *   - Feature and Danger roll the d100 table that the site's theme and
	 *     domain make together; they wait for both to be set. A 99 or 100
	 *     logs a Change Theme or Change Domain link, as the rules say.
	 * Every roll is logged. The Feature and Danger pickers offer that same
	 * table's entries.
	 *
	 * `rolling` is shared with the parent (ExpeditionsArea), whose Roll Denizen
	 * waits on it too.
	 */
	import Select from '#lib/components/Select.svelte';
	import { tooltip } from '#lib/actions/tooltip.js';
	import { loadDelveData, buildCombinedTable } from '#lib/delveStore.svelte.js';
	import { rollFromRangeTable, rollOracle, getOracles } from '#lib/oracleStore.svelte.js';
	import { appendLog } from '#lib/log.svelte.js';
	import { bindCommandLinks, commandLinkHtml } from '#lib/commands/links.js';
	import { DELVE_THEMES, DELVE_DOMAINS } from '#lib/types.js';
	import type { DelveDomain, DelveTheme, Expedition, Site } from '#lib/types.js';
	import diceD6Svg from '#icons/dice-d6-light.svg?raw';

	let {
		site,
		rolling = $bindable(false),
		onupdate,
	}: {
		/** The live site. */
		site: Site;
		/** A Feature or Danger roll is under way: the other d6s wait. */
		rolling?: boolean;
		onupdate: (patch: Partial<Expedition>) => void;
	} = $props();

	const hasThemeAndDomain = $derived(!!site.theme && !!site.domain);

	/** The theme and domain's combined `features` or `dangers` table, each
	 *  entry once (the theme's and domain's tables overlap). */
	function optionsFor(kind: 'features' | 'dangers'): string[] {
		if (!hasThemeAndDomain) return [];
		const table = buildCombinedTable(site.theme as DelveTheme, site.domain as DelveDomain, kind);
		return [
			...new Set(table.map((e) => (typeof e.value === 'string' ? e.value : String(e.value)))),
		];
	}
	const featureOptions = $derived(optionsFor('features'));
	const dangerOptions = $derived(optionsFor('dangers'));

	// Theme / Domain: the weighted Site Nature oracle, logged with its
	// description. Ignored while a d100 roll is under way (the buttons are
	// disabled too, but Space or Enter can get in first).
	function randomizeTheme() {
		if (rolling) return;
		const r = rollOracle('siteNatureTheme', getOracles());
		if (!r.value) return;
		onupdate({ theme: r.value as Site['theme'] });
		appendLog(r.title || 'Site Theme', r.html);
	}
	function randomizeDomain() {
		if (rolling) return;
		const r = rollOracle('siteNatureDomain', getOracles());
		if (!r.value) return;
		onupdate({ domain: r.value as Site['domain'] });
		appendLog(r.title || 'Site Domain', r.html);
	}

	/** Roll a feature or a danger on the site's combined table, log it, and
	 *  set it on the site. */
	async function rollTable(kind: 'features' | 'dangers') {
		if (!hasThemeAndDomain || rolling) return;
		rolling = true;
		try {
			// The delve data loads on mount, unawaited: a roll straight after a
			// theme and domain are picked could find no table yet.
			await loadDelveData();
			const s = site;
			const table = buildCombinedTable(s.theme as DelveTheme, s.domain as DelveDomain, kind);
			const result = rollFromRangeTable(table);
			const valueStr = typeof result.value === 'string' ? result.value : String(result.value);
			let resultHtml = `<div>Result: <strong>${valueStr}</strong>`;
			if (result.roll === 99)
				resultHtml += ` ${commandLinkHtml('Change Theme ↗', '/site.theme', { expId: s.id })}`;
			if (result.roll === 100)
				resultHtml += ` ${commandLinkHtml('Change Domain ↗', '/site.domain', { expId: s.id })}`;
			resultHtml += '</div>';
			const entryId = crypto.randomUUID();
			appendLog(
				`${kind === 'features' ? 'Features' : 'Dangers'}: ${s.theme} + ${s.domain}`,
				bindCommandLinks(
					`<div class="roll-line">Roll: d100 → ${result.roll}</div>` + resultHtml,
					entryId,
				),
				entryId,
			);
			onupdate(kind === 'features' ? { currentFeature: valueStr } : { currentDanger: valueStr });
		} finally {
			rolling = false;
		}
	}
</script>

<div class="ea-field-row">
	<label class="ea-field-label" for="ea-theme-{site.id}">Theme</label>
	<Select
		id="ea-theme-{site.id}"
		class="ea-select"
		value={site.theme}
		options={DELVE_THEMES.map((t) => ({ value: t, label: t }))}
		onchange={(v) => onupdate({ theme: v as Site['theme'] })}
	/>
	<button
		class="dice-btn"
		onclick={randomizeTheme}
		disabled={rolling}
		use:tooltip={'Pick a random theme'}
		aria-label="Random theme">{@html diceD6Svg}</button
	>
</div>
<div class="ea-field-row">
	<label class="ea-field-label" for="ea-domain-{site.id}">Domain</label>
	<Select
		id="ea-domain-{site.id}"
		class="ea-select"
		value={site.domain}
		options={DELVE_DOMAINS.map((d) => ({ value: d, label: d }))}
		onchange={(v) => onupdate({ domain: v as Site['domain'] })}
	/>
	<button
		class="dice-btn"
		onclick={randomizeDomain}
		disabled={rolling}
		use:tooltip={'Pick a random domain'}
		aria-label="Random domain">{@html diceD6Svg}</button
	>
</div>
<div class="ea-field-row">
	<label class="ea-field-label" for="ea-feature-{site.id}">Feature</label>
	<Select
		id="ea-feature-{site.id}"
		class="ea-select"
		value={site.currentFeature ?? ''}
		disabled={!hasThemeAndDomain}
		placeholder="—"
		options={[{ value: '', label: '—' }, ...featureOptions.map((f) => ({ value: f, label: f }))]}
		onchange={(v) => onupdate({ currentFeature: v })}
	/>
	<button
		class="dice-btn"
		onclick={() => rollTable('features')}
		disabled={!hasThemeAndDomain || rolling}
		use:tooltip={hasThemeAndDomain ? 'Roll for a feature' : 'Set theme and domain first'}
		aria-label="Random feature">{@html diceD6Svg}</button
	>
</div>
<div class="ea-field-row">
	<label class="ea-field-label" for="ea-danger-{site.id}">Danger</label>
	<Select
		id="ea-danger-{site.id}"
		class="ea-select"
		value={site.currentDanger ?? ''}
		disabled={!hasThemeAndDomain}
		placeholder="—"
		options={[{ value: '', label: '—' }, ...dangerOptions.map((d) => ({ value: d, label: d }))]}
		onchange={(v) => onupdate({ currentDanger: v })}
	/>
	<button
		class="dice-btn"
		onclick={() => rollTable('dangers')}
		disabled={!hasThemeAndDomain || rolling}
		use:tooltip={hasThemeAndDomain ? 'Roll for a danger' : 'Set theme and domain first'}
		aria-label="Random danger">{@html diceD6Svg}</button
	>
</div>
